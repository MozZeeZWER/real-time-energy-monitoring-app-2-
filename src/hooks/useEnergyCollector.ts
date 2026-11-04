"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EnergyCollector, type Reading } from "@/lib/collector";
import {
  DEFAULT_SPECS,
  energyKwh,
  guessDeviceKind,
  parseAgent,
  type DeviceKind,
  type DeviceSpec,
} from "@/lib/power-model";

const LS_ID = "gomel-energy.device-id";
const LS_PROFILE = "gomel-energy.profile";
const SEND_INTERVAL_MS = 4000;

/** false = браузер снова шлёт замеры и создаёт карточку Firefox */
const BROWSER_COLLECTOR_OFF = true;

export interface DeviceProfile {
  name: string;
  kind: DeviceKind;
  cpuTdpW: number;
  gpuTdpW: number;
  displayW: number;
  batteryWh: number;
  backgroundBias: number;
  hasBattery: boolean;
  cores: number;
  memoryGb: number | null;
  screen: string;
  browser: string;
  platform: string;
}

export interface SessionTotals {
  startedAt: number;
  kwh: number;
  batteryKwh: number;
  cost: number;
  samples: number;
  lastRate: number;
  lastZone: string;
  sentAt: number;
  failed: number;
}

function detectProfile(): DeviceProfile {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const { browser, platform } = parseAgent(ua);
  const nav = navigator as Navigator & { getBattery?: unknown; deviceMemory?: number };
  const hasBattery = typeof nav.getBattery === "function";
  const kind = guessDeviceKind(ua, hasBattery);
  const base = DEFAULT_SPECS[kind];
  return {
    name: kind === "laptop" ? `${browser} · ноутбук` : kind === "other" ? `${browser} · мобильное` : `${browser} · ПК`,
    kind,
    cpuTdpW: base.cpuTdpW,
    gpuTdpW: base.gpuTdpW,
    displayW: base.displayW,
    batteryWh: base.batteryWh,
    backgroundBias: 0.15,
    hasBattery,
    cores: navigator.hardwareConcurrency || 4,
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    screen: typeof screen !== "undefined" ? `${screen.width}×${screen.height}` : "—",
    browser,
    platform,
  };
}

function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  const existing = window.localStorage.getItem(LS_ID);
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(LS_ID, id);
  return id;
}

const EMPTY_TOTALS: SessionTotals = {
  startedAt: 0,
  kwh: 0,
  batteryKwh: 0,
  cost: 0,
  samples: 0,
  lastRate: 0,
  lastZone: "",
  sentAt: 0,
  failed: 0,
};

export function useEnergyCollector() {
  const [deviceId, setDeviceId] = useState<string>("");
  const [profile, setProfile] = useState<DeviceProfile | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [totals, setTotals] = useState<SessionTotals>({
    startedAt: Date.now(),
    kwh: 0,
    batteryKwh: 0,
    cost: 0,
    samples: 0,
    lastRate: 0,
    lastZone: "",
    sentAt: 0,
    failed: 0,
  });

  const collectorRef = useRef<EnergyCollector | null>(null);
  const profileRef = useRef<DeviceProfile | null>(null);
  const pausedRef = useRef(false);
  const accRef = useRef({
    lastAt: 0,
    lastWatts: 0,
    lastBatteryWatts: 0,
    localKwh: 0,
    localBatteryKwh: 0,
  });
  const [stressUntil, setStressUntil] = useState(0);

  useEffect(() => {
    if (BROWSER_COLLECTOR_OFF) return;
    const id = getDeviceId();
    setDeviceId(id);
    const detected = detectProfile();
    let saved: Partial<DeviceProfile> = {};
    try {
      const raw = window.localStorage.getItem(LS_PROFILE);
      if (raw) saved = JSON.parse(raw) as Partial<DeviceProfile>;
    } catch {
      saved = {};
    }
    const merged: DeviceProfile = { ...detected, ...saved, hasBattery: detected.hasBattery };
    profileRef.current = merged;
    setProfile(merged);
  }, []);

  const persist = useCallback((next: DeviceProfile) => {
    profileRef.current = next;
    setProfile(next);
    try {
      window.localStorage.setItem(LS_PROFILE, JSON.stringify(next));
    } catch {
      /* приватный режим — работаем без сохранения */
    }
    collectorRef.current?.setSpec({
      kind: next.kind,
      cpuTdpW: next.cpuTdpW,
      gpuTdpW: next.gpuTdpW,
      displayW: next.displayW,
      batteryWh: next.batteryWh,
      hasBattery: next.hasBattery,
    });
    collectorRef.current?.setBackgroundBias(next.backgroundBias);
  }, []);

  const updateProfile = useCallback(
    (patch: Partial<DeviceProfile>) => {
      const current = profileRef.current;
      if (!current) return;
      persist({ ...current, ...patch });
    },
    [persist],
  );

  useEffect(() => {
    if (BROWSER_COLLECTOR_OFF) return;
    if (!profile) return;
    const spec: DeviceSpec = {
      kind: profile.kind,
      cpuTdpW: profile.cpuTdpW,
      gpuTdpW: profile.gpuTdpW,
      displayW: profile.displayW,
      batteryWh: profile.batteryWh,
      hasBattery: profile.hasBattery,
    };
    const collector = new EnergyCollector({
      spec,
      backgroundBias: profile.backgroundBias,
      onReading: (r) => {
        setReading(r);
        const acc = accRef.current;
        if (acc.lastAt) {
          const dt = Math.max(0, r.at - acc.lastAt);
          acc.localKwh += energyKwh((acc.lastWatts + r.gridWatts) / 2, dt);
          acc.localBatteryKwh += energyKwh((acc.lastBatteryWatts + r.batteryDrainWatts) / 2, dt);
        }
        acc.lastAt = r.at;
        acc.lastWatts = r.gridWatts;
        acc.lastBatteryWatts = r.batteryDrainWatts;
      },
    });
    collectorRef.current = collector;
    void collector.start();
    return () => {
      collector.stop();
      collectorRef.current = null;
    };
  }, [profile?.kind === "laptop", profile !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (BROWSER_COLLECTOR_OFF) return;
    if (!deviceId || !profile) return;
    let lastSend = Date.now();

    const send = async () => {
      if (pausedRef.current) {
        lastSend = Date.now();
        return;
      }
      const r = collectorRef.current?.latest;
      const p = profileRef.current;
      if (!r || !p) return;

      const now = Date.now();
      const intervalMs = Math.max(1000, now - lastSend);
      lastSend = now;
      const kwh = energyKwh(r.gridWatts, intervalMs);
      const batteryKwh = energyKwh(r.batteryDrainWatts, intervalMs);

      setStatus("sending");
      try {
        const res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            deviceId,
            name: p.name,
            kind: p.kind,
            intervalMs,
            ts: new Date(r.at).toISOString(),
            watts: r.gridWatts,
            batteryWatts: r.batteryDrainWatts || Math.abs(Math.min(0, r.batteryWatts)),
            cpuLoad: r.cpuLoad,
            gpuLoad: r.gpuLoad,
            fps: r.fps,
            loopLagMs: r.loopLagMs,
            longTaskMs: r.longTaskMs,
            heapMb: r.heapMb,
            batteryLevel: r.batteryLevel,
            charging: r.charging,
            screenOn: r.screenOn,
            netType: r.netType,
            downlinkMbps: r.downlinkMbps,
            rttMs: r.rttMs,
            spec: {
              cpuTdpW: p.cpuTdpW,
              gpuTdpW: p.gpuTdpW,
              displayW: p.displayW,
              batteryWh: p.batteryWh,
            },
            meta: {
              userAgent: navigator.userAgent,
              cores: p.cores,
              memoryGb: p.memoryGb ?? undefined,
              screen: p.screen,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          ok: boolean;
          rate: number;
          kwh: number;
          cost: number;
          zone: string;
        };
        setStatus("ok");
        setTotals((prev) => ({
          ...prev,
          kwh: prev.kwh + (data.kwh || kwh),
          batteryKwh: prev.batteryKwh + batteryKwh,
          cost: prev.cost + (data.cost || 0),
          samples: prev.samples + 1,
          lastRate: data.rate ?? prev.lastRate,
          lastZone: data.zone ?? prev.lastZone,
          sentAt: Date.now(),
        }));
      } catch {
        setStatus("error");
        setTotals((prev) => ({ ...prev, failed: prev.failed + 1, sentAt: Date.now() }));
      }
    };

    const id = window.setInterval(send, SEND_INTERVAL_MS);
    const t = window.setTimeout(send, 900);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(t);
    };
  }, [deviceId, profile !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePause = useCallback(() => {
    setPaused((p) => {
      pausedRef.current = !p;
      return !p;
    });
  }, []);

  const runStress = useCallback((seconds = 6) => {
    setStressUntil(Date.now() + seconds * 1000);
    collectorRef.current?.runStress(seconds);
  }, []);

  const resetSession = useCallback(() => {
    setTotals((prev) => ({ ...prev, kwh: 0, batteryKwh: 0, cost: 0, samples: 0, startedAt: Date.now() }));
  }, []);

  const stressing = stressUntil > Date.now();
  const liveKwh = totals.kwh || accRef.current.localKwh;

  if (BROWSER_COLLECTOR_OFF) {
    return {
      deviceId: "",
      profile: null,
      reading: null,
      paused: false,
      status: "idle" as const,
      totals: EMPTY_TOTALS,
      liveKwh: 0,
      stressing: false,
      updateProfile,
      togglePause,
      runStress,
      resetSession,
    };
  }

  return {
    deviceId,
    profile,
    reading,
    paused,
    status,
    totals,
    liveKwh,
    stressing,
    updateProfile,
    togglePause,
    runStress,
    resetSession,
  };
}
