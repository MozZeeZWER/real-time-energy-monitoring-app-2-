"use client";

import { useState } from "react";
import {
  Battery,
  BatteryCharging,
  Cpu,
  Gauge,
  Monitor,
  Pause,
  Play,
  PlugZap,
  Settings2,
  Trash2,
  Wifi,
  Zap,
} from "lucide-react";
import type { Reading } from "@/lib/collector";
import type { DeviceProfile } from "@/hooks/useEnergyCollector";
import type { DeviceLive } from "@/lib/dashboard";
import { DEVICE_KIND_LABEL } from "@/lib/power-model";
import { formatMinskTs } from "@/lib/tariffs";
import { LiveDot, Meter, fmt, fmtByn } from "@/components/ui";

export function BatteryRing({ level, charging }: { level: number; charging: boolean }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const color = charging ? "#4cc6e8" : level < 0.2 ? "#ff6a4d" : level < 0.45 ? "#f4b23c" : "#c9f24a";
  return (
    <div className="relative h-11 w-11 shrink-0">
      <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="#1a242d" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(level * c).toFixed(2)} ${c.toFixed(2)}`}
          style={{ transition: "stroke-dasharray 700ms cubic-bezier(0.22,1,0.36,1), stroke 400ms ease" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        {charging ? (
          <BatteryCharging size={15} style={{ color }} />
        ) : (
          <Battery size={15} style={{ color }} />
        )}
      </span>
    </div>
  );
}

export interface DeviceCardProps {
  device: DeviceLive;
  accent: string;
  isSelf: boolean;
  reading: Reading | null;
  profile: DeviceProfile | null;
  rate: number;
  paused: boolean;
  stressing: boolean;
  sending: boolean;
  onUpdate: (patch: Partial<DeviceProfile>) => void;
  onStress: () => void;
  onPause: () => void;
  onDelete: (id: string) => void;
  onSetLimit: (id: string, watts: number | null) => void;
}

export function DeviceCard({
  device,
  accent,
  isSelf,
  reading,
  profile,
  rate,
  paused,
  stressing,
  sending,
  onUpdate,
  onStress,
  onPause,
  onDelete,
  onSetLimit,
}: DeviceCardProps) {
  const [open, setOpen] = useState(false);
  const live = isSelf && reading ? reading : null;
  const watts = live ? live.gridWatts : device.latest?.watts ?? 0;
  const cpuLoad = live ? live.cpuLoad : device.latest?.cpuLoad ?? 0;
  const gpuLoad = live ? live.gpuLoad : device.latest?.gpuLoad ?? 0;
  const heapMb = live ? live.heapMb : device.latest?.heapMb ?? null;
  const batteryLevel = live ? live.batteryLevel : device.latest?.batteryLevel ?? null;
  const charging = live ? live.charging : device.latest?.charging ?? false;
  const batteryDrain = live ? live.batteryDrainWatts : Math.max(0, -(device.latest?.batteryWatts ?? 0));
  const fps = live ? live.fps : device.latest?.fps ?? null;
  const netType = live ? live.netType : device.latest?.netType ?? null;
  const downlink = live ? live.downlinkMbps : device.latest?.downlinkMbps ?? null;
  const lastTs = live ? new Date(live.at).toISOString() : device.latest?.ts ?? device.lastSeen;
  const latestExtra = device.latest as typeof device.latest & {
    cores?: number | null;
    memoryGb?: number | null;
    memUsedMb?: number | null;
  };
  const coresVal = device.cores || latestExtra?.cores || 0;
  const memoryGbVal = device.memoryGb || latestExtra?.memoryGb || 0;
  const memUsedMbVal = heapMb || latestExtra?.memUsedMb || 0;

  const onBattery = device.hasBattery && !charging && batteryDrain > 0.5;

  return (
    <article
      className="panel panel-hover rounded-md p-4"
      style={{ borderLeft: `2px solid ${accent}` }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-lg font-bold uppercase tracking-wide text-chalk">
              {device.name}
            </h3>
            <LiveDot active={device.online && !paused} label={paused ? "пауза" : device.online ? "в эфире" : "офлайн"} />
          </div>
          <p className="mt-0.5 truncate font-mono text-[10.5px] text-fog-dim">
            {DEVICE_KIND_LABEL[device.kind as keyof typeof DEVICE_KIND_LABEL] ?? device.kind}
            {device.platform ? ` · ${device.platform}` : ""}
            {device.browser ? ` · ${device.browser}` : ""}
          </p>
        </div>
        <div className="text-right">
          <div className="font-display text-[32px] leading-none font-extrabold tnum" style={{ color: accent }}>
            {Math.round(watts)}
          </div>
          <div className="font-mono text-[10px] text-fog-dim">Вт {onBattery ? "от батареи" : "из сети"}</div>
        </div>
      </header>

      <div className="mt-3.5 grid grid-cols-2 gap-3">
        <Meter
          label="CPU"
          value={cpuLoad}
          color={cpuLoad > 0.75 ? "#ff6a4d" : cpuLoad > 0.4 ? "#f4b23c" : "#c9f24a"}
          right={`${fmt(cpuLoad * 100, 0)} %`}
        />
        <Meter
          label="GPU / рендер"
          value={gpuLoad}
          color={gpuLoad > 0.6 ? "#f4b23c" : "#4cc6e8"}
          right={`${fmt(gpuLoad * 100, 0)} %`}
        />
      </div>

      <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[11px] sm:grid-cols-3">
        <Meta icon={<Cpu size={12} />} label="ядер" value={coresVal ? String(coresVal) : "—"} />
        <Meta icon={<Gauge size={12} />} label="кадры" value={fps ? `${fmt(fps, 0)} fps` : "—"} />
        <Meta
          icon={<Monitor size={12} />}
          label="память"
          value={
            memUsedMbVal
              ? `${fmt(memUsedMbVal, 0)} МБ`
              : memoryGbVal
                ? `${memoryGbVal} ГБ`
                : "—"
          }
        />
        <Meta
          icon={<Wifi size={12} />}
          label="сеть"
          value={
            netType || downlink
              ? `${netType ?? "LAN"}${downlink != null && downlink > 0 ? ` · ${fmt(downlink, 1)} Мбит/с` : ""}`
              : "—"
          }
        />
        <Meta icon={<Zap size={12} />} label="кВт·ч сегодня" value={fmt(device.todayKwh, 4)} />
        <Meta icon={<PlugZap size={12} />} label="BYN сегодня" value={`${fmtByn(device.todayCost)} руб`} />
      </dl>

      {batteryLevel !== null ? (
        <div className="mt-3.5 flex items-center gap-3 rounded border border-line-soft bg-ink-900/60 px-3 py-2">
          <BatteryRing level={batteryLevel} charging={charging} />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] text-chalk tnum">
              {fmt(batteryLevel * 100, 0)} % · {charging ? "заряд" : "разряд"}
            </p>
            <p className="font-mono text-[10.5px] text-fog-dim tnum">
              {Math.abs(reading?.batteryWatts ?? device.latest?.batteryWatts ?? 0) > 0.2
                ? `${fmt(Math.abs(reading?.batteryWatts ?? device.latest?.batteryWatts ?? 0), 1)} Вт ${
                    charging ? "в батарею" : "с батареи"
                  } · ёмкость ${device.batteryWh} Вт·ч`
                : `ёмкость ${device.batteryWh} Вт·ч`}
            </p>
          </div>
        </div>
      ) : null}

      <footer className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3">
        <p className="font-mono text-[10px] text-fog-dim">
          замер {formatMinskTs(lastTs)}
          {isSelf ? (sending ? " · передача…" : " · связь есть") : ""}
        </p>
        <div className="flex items-center gap-1.5">
          {isSelf ? (
            <>
              <button
                type="button"
                onClick={onStress}
                disabled={stressing}
                className="rounded border border-volt/40 bg-volt/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-volt transition hover:bg-volt/20 disabled:opacity-40"
              >
                {stressing ? "нагрузка…" : "тест 6 с"}
              </button>
              <button
                type="button"
                onClick={onPause}
                className="flex items-center gap-1 rounded border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-fog transition hover:border-fog hover:text-chalk"
              >
                {paused ? <Play size={11} /> : <Pause size={11} />}
                {paused ? "продолжить" : "пауза"}
              </button>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1 rounded border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-fog transition hover:border-volt hover:text-volt"
              >
                <Settings2 size={11} />
                калибровка
              </button>
            </>
          ) : device.source === "plug" ? (
            <>
              <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-fog">
                порог
                <input
                  key={device.powerLimitW ?? "empty"}
                  defaultValue={device.powerLimitW ?? ""}
                  inputMode="decimal"
                  placeholder="Вт"
                  onBlur={(event) => {
                    const raw = event.target.value.trim();
                    onSetLimit(device.id, raw === "" ? null : Number(raw));
                  }}
                  className="w-16 rounded border border-line bg-ink-850 px-1.5 py-1 text-right text-chalk outline-none focus:border-volt"
                />
                <span className="text-fog-dim">{device.vendor ?? "розетка"}</span>
              </label>
              <button
                type="button"
                onClick={() => onDelete(device.id)}
                title="Удалить устройство и его историю"
                className="flex items-center gap-1 rounded border border-line px-2 py-1 font-mono text-[10px] text-fog-dim transition hover:border-ember hover:text-ember"
              >
                <Trash2 size={11} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onPause}
                className="flex items-center gap-1 rounded border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-fog transition hover:border-fog hover:text-chalk"
              >
                {paused ? <Play size={11} /> : <Pause size={11} />}
                {paused ? "продолжить" : "пауза"}
              </button>
              <button
                type="button"
                onClick={() => onDelete(device.id)}
                title="Удалить устройство и его историю"
                className="flex items-center gap-1 rounded border border-line px-2 py-1 font-mono text-[10px] text-fog-dim transition hover:border-ember hover:text-ember"
              >
                <Trash2 size={11} />
              </button>
            </>
          )}
        </div>
      </footer>

      {open && profile ? (
        <div className="mt-3 space-y-3 rounded border border-line-soft bg-ink-900/70 p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fog-dim">
            паспортные характеристики — влияют на оценку мощности
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Имя устройства">
              <input
                value={profile.name}
                onChange={(e) => onUpdate({ name: e.target.value.slice(0, 40) })}
                className="w-full rounded border border-line bg-ink-850 px-2 py-1.5 font-mono text-[11px] text-chalk outline-none focus:border-volt"
              />
            </Field>
            <Field label="Тип">
              <div className="flex gap-1">
                {(["desktop", "laptop", "other"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onUpdate({ kind: k })}
                    className={`flex-1 rounded border px-2 py-1.5 font-mono text-[10px] uppercase transition ${
                      profile.kind === k
                        ? "border-volt bg-volt/15 text-volt"
                        : "border-line text-fog hover:text-chalk"
                    }`}
                  >
                    {k === "desktop" ? "ПК" : k === "laptop" ? "ноут" : "моб."}
                  </button>
                ))}
              </div>
            </Field>
            <Slider
              label="TDP процессора"
              value={profile.cpuTdpW}
              min={5}
              max={250}
              step={1}
              unit="Вт"
              onChange={(v) => onUpdate({ cpuTdpW: v })}
            />
            <Slider
              label="TDP графики"
              value={profile.gpuTdpW}
              min={0}
              max={450}
              step={1}
              unit="Вт"
              onChange={(v) => onUpdate({ gpuTdpW: v })}
            />
            <Slider
              label="Монитор / матрица"
              value={profile.displayW}
              min={0}
              max={120}
              step={0.5}
              unit="Вт"
              onChange={(v) => onUpdate({ displayW: v })}
            />
            <Slider
              label="Ёмкость батареи"
              value={profile.batteryWh}
              min={0}
              max={150}
              step={1}
              unit="Вт·ч"
              disabled={!profile.hasBattery}
              onChange={(v) => onUpdate({ batteryWh: v })}
            />
            <div className="sm:col-span-2">
              <Slider
                label="Поправка на фоновые процессы ОС"
                value={profile.backgroundBias * 100}
                min={0}
                max={100}
                step={1}
                unit="%"
                onChange={(v) => onUpdate({ backgroundBias: v / 100 })}
              />
              <p className="mt-1 text-[10.5px] leading-snug text-fog-dim">
                Браузер видит только свою вкладку. Если на машине идут тяжёлые фоновые задачи — поднимите
                поправку, чтобы оценка ближе совпала со счётчиком.
              </p>
            </div>
          </div>
          <p className="font-mono text-[10px] text-fog-dim">
            ставка сейчас: <span className="text-amber">{fmtByn(rate, 4)} BYN/кВт·ч</span> ·{" "}
            {fmtByn((watts / 1000) * rate, 4)} BYN за час такой нагрузки
          </p>
        </div>
      ) : null}
    </article>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-fog-dim">{icon}</span>
      <span className="text-fog-dim">{label}:</span>
      <span className="truncate text-chalk tnum">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-fog-dim">{label}</span>
      {children}
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className={`block ${disabled ? "opacity-40" : ""}`}>
      <span className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-fog-dim">
        {label}
        <span className="text-volt tnum">
          {fmt(value, step < 1 ? 1 : 0)} {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-ink-700 accent-[#c9f24a]"
      />
    </label>
  );
}
