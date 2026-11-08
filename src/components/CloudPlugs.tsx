"use client";

import { useState } from "react";
import { adminFailure, adminHeaders } from "@/lib/admin-client";

interface ListedPlug {
  vendor: "tuya" | "shelly";
  externalId: string;
  name: string;
  online: boolean;
  linked: boolean;
}

interface AlertRow {
  ts: string;
  device: string;
  watts: number;
  limitW: number;
  telegramOk: boolean;
  webhookOk: boolean;
}

export function CloudPlugs({
  alerts,
  adminSecret,
  onDenied,
}: {
  alerts: AlertRow[];
  adminSecret: string;
  onDenied: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string[]>([]);
  const [plugs, setPlugs] = useState<ListedPlug[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(0);

  const keyOf = (plug: ListedPlug) => `${plug.vendor}:${plug.externalId}`;

  async function load() {
    setBusy(true);
    setError([]);
    try {
      const response = await fetch("/api/iot/plugs", {
        cache: "no-store",
        headers: adminHeaders(adminSecret),
      });
      const denied = await adminFailure(response);
      if (denied) {
        onDenied(denied);
        setOpen(false);
        return;
      }
      onDenied(null);
      const json = (await response.json()) as { plugs?: ListedPlug[]; errors?: string[] };
      setPlugs(json.plugs ?? []);
      setError(json.errors ?? []);
      setOpen(true);
    } catch {
      setError(["Не удалось запросить список розеток"]);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function link() {
    const devices = plugs.filter((plug) => picked[keyOf(plug)] && !plug.linked);
    if (!devices.length) return;
    setBusy(true);
    try {
      const response = await fetch("/api/iot/plugs", {
        method: "POST",
        headers: adminHeaders(adminSecret, { "content-type": "application/json" }),
        body: JSON.stringify({
          devices: devices.map((plug) => ({
            vendor: plug.vendor,
            externalId: plug.externalId,
            name: plug.name,
          })),
        }),
      });
      const denied = await adminFailure(response);
      if (denied) {
        onDenied(denied);
        return;
      }
      if (!response.ok) throw new Error("link");
      onDenied(null);
      setSaved(devices.length);
      setPicked({});
      await load();
    } catch {
      setError(["Не удалось сохранить выбранные розетки"]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel mb-3 rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fog-dim">Tuya и Shelly</p>
          <p className="mt-1 text-[13px] text-fog">Список розеток берётся из облака аккаунта. В учёт попадают только отмеченные.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="rounded border border-volt/40 bg-volt/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-volt transition hover:bg-volt/20 disabled:opacity-40"
        >
          {busy ? "запрос…" : "загрузить из облака"}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-2">
          {error.map((line) => (
            <p key={line} className="font-mono text-[11px] text-ember">
              {line}
            </p>
          ))}
          {saved > 0 ? <p className="font-mono text-[11px] text-volt">В учёт добавлено: {saved}</p> : null}
          {plugs.length === 0 ? (
            <p className="text-[12px] text-fog-dim">Облако не вернуло розеток.</p>
          ) : (
            <ul className="space-y-1.5">
              {plugs.map((plug) => {
                const key = keyOf(plug);
                return (
                  <li key={key} className="flex items-center gap-2 rounded border border-line-soft px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={plug.linked || Boolean(picked[key])}
                      disabled={plug.linked || busy}
                      onChange={(event) => setPicked((prev) => ({ ...prev, [key]: event.target.checked }))}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-chalk">{plug.name}</span>
                    <span className="font-mono text-[10px] uppercase text-fog-dim">
                      {plug.vendor}
                      {plug.linked ? " · в учёте" : ""}
                      {plug.online ? "" : " · офлайн"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            onClick={() => void link()}
            disabled={busy || !plugs.some((plug) => picked[keyOf(plug)] && !plug.linked)}
            className="rounded border border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fog transition hover:border-chalk hover:text-chalk disabled:opacity-40"
          >
            вести выбранные
          </button>
        </div>
      ) : null}

      {alerts.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-line-soft pt-3">
          {alerts.map((alert) => (
            <li key={alert.ts + alert.device} className="font-mono text-[11px] text-fog">
              {new Date(alert.ts).toLocaleString("ru-RU")} · {alert.device}: {alert.watts.toFixed(1)} Вт &gt; {alert.limitW.toFixed(0)} Вт
              {alert.telegramOk ? " · Telegram" : ""}
              {alert.webhookOk ? " · webhook" : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
