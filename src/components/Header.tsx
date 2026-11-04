"use client";

import { useEffect, useState } from "react";
import { Activity, MapPin, Radio, Terminal } from "lucide-react";
import { REGION, formatClock } from "@/lib/tariffs";
import { LiveDot, fmtByn } from "@/components/ui";
import { LaunchModal } from "@/components/LaunchModal";

export function Header({
  liveWatts,
  onlineDevices,
  zoneName,
  zoneColor,
  rate,
  streaming,
}: {
  liveWatts: number;
  onlineDevices: number;
  zoneName: string;
  zoneColor: string;
  rate: number;
  streaming: boolean;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line-soft bg-ink-950/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
        <a href="#live" className="group flex shrink-0 items-center gap-2.5">
          <span className="relative grid h-9 w-9 place-items-center">
            <svg viewBox="0 0 40 40" className="absolute inset-0 h-9 w-9">
              <polygon
                points="20,2 36,11 36,29 20,38 4,29 4,11"
                fill="none"
                stroke="#c9f24a"
                strokeWidth="1.6"
                className="transition-all duration-500 group-hover:stroke-[#e9f1f5]"
              />
            </svg>
            <svg viewBox="0 0 24 24" className="relative h-4 w-4 fill-volt">
              <path d="M13 2 4.5 13.5H10L8.8 22 19 9.8h-5.6z" />
            </svg>
          </span>
          <span className="leading-none">
            <span className="block font-display text-[19px] font-extrabold uppercase tracking-[0.14em] text-chalk">
              Энергомонитор
            </span>
            <span className="mt-0.5 flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.22em] text-fog-dim">
              <MapPin size={9} /> {REGION.city} · BYN/кВт·ч
            </span>
          </span>
        </a>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 rounded border border-line-soft bg-ink-900/70 px-2.5 py-1.5 md:flex">
            <Radio size={12} className="text-volt" />
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fog-dim">устройств в эфире</span>
            <span className="font-mono text-[12px] text-chalk tnum">{onlineDevices}</span>
          </div>

          <div
            className="flex items-center gap-2 rounded border px-2.5 py-1.5"
            style={{ borderColor: `${zoneColor}55`, background: `${zoneColor}12` }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: zoneColor }} />
            <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: zoneColor }}>
              {zoneName}
            </span>
            <span className="font-mono text-[12px] text-chalk tnum">{fmtByn(rate)}</span>
          </div>

          <div className="hidden items-baseline gap-1.5 rounded border border-line-soft bg-ink-900/70 px-3 py-1.5 sm:flex">
            <Activity size={12} className="self-center text-volt" />
            <span className="font-display text-[20px] leading-none font-extrabold tnum text-chalk">
              {Math.round(liveWatts)}
            </span>
            <span className="font-mono text-[10px] text-fog-dim">Вт</span>
          </div>

          <div className="flex items-center gap-2 rounded border border-line-soft bg-ink-900/70 px-2.5 py-1.5">
            <LiveDot active={streaming} />
            <span className="font-mono text-[13px] text-chalk tnum">{now ? formatClock(now) : "––:––:––"}</span>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 rounded border border-volt/50 bg-volt/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-volt transition hover:bg-volt/20 hover:text-chalk"
            title="Инструкция по запуску: браузер, PowerShell, Linux, Python, свой сервер"
          >
            <Terminal size={12} />
            <span className="hidden sm:inline">Как запускать</span>
            <span className="sm:hidden">Запуск</span>
          </button>
        </div>
      </div>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-volt/40 to-transparent" />
    </header>
    <LaunchModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
