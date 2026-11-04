"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ZONE_META, formatByn, hourInMinsk, minuteInMinsk, REGION } from "@/lib/tariffs";
import type { ZoneDef } from "@/lib/tariffs";
import { fmt, fmtByn } from "@/components/ui";

export const DEVICE_COLORS = ["#c9f24a", "#4cc6e8", "#f4b23c", "#ff6a4d", "#9d7bff", "#5ee6a8"];

function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
  for (const s of steps) if (v <= s * pow) return s * pow;
  return 10 * pow;
}

function polar(cx: number, cy: number, r: number, a: number): [number, number] {
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/* ─────────────────────────── Живой ватт-метр ─────────────────────────── */

export function PowerGauge({
  watts,
  batteryWatts = 0,
  scaleMax,
  caption,
}: {
  watts: number;
  batteryWatts?: number;
  scaleMax?: number;
  caption?: string;
}) {
  const max = niceMax(scaleMax ?? Math.max(watts * 1.35, 120));
  const frac = Math.max(0, Math.min(1, watts / max));
  const A0 = Math.PI * 0.75;
  const A1 = Math.PI * 2.25;
  const angle = A0 + frac * (A1 - A0);
  const [nx, ny] = polar(130, 130, 92, angle);
  const ticks = Array.from({ length: 28 }, (_, i) => i / 27);

  return (
    <div className="relative">
      <svg viewBox="0 0 260 220" className="w-full max-w-[320px]" role="img" aria-label={`Текущая мощность ${Math.round(watts)} Вт`}>
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#4cc6e8" />
            <stop offset="45%" stopColor="#c9f24a" />
            <stop offset="80%" stopColor="#f4b23c" />
            <stop offset="100%" stopColor="#ff6a4d" />
          </linearGradient>
        </defs>
        <path d={arcPath(130, 130, 104, A0, A1)} stroke="#1a242d" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path
          d={arcPath(130, 130, 104, A0, A1)}
          stroke="url(#gaugeGrad)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${(frac * 100).toFixed(2)} 100`}
          style={{ transition: "stroke-dasharray 620ms cubic-bezier(0.22,1,0.36,1)" }}
        />
        {ticks.map((t, i) => {
          const a = A0 + t * (A1 - A0);
          const [x0, y0] = polar(130, 130, i % 4 === 0 ? 84 : 88, a);
          const [x1, y1] = polar(130, 130, 92, a);
          return (
            <line
              key={i}
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              stroke={t <= frac ? "#c9f24a" : "#2b3a46"}
              strokeWidth={i % 4 === 0 ? 2 : 1}
              opacity={t <= frac ? 0.9 : 0.7}
            />
          );
        })}
        <line className="needle" x1="130" y1="130" x2={nx} y2={ny} stroke="#e9f1f5" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="130" cy="130" r="7" fill="#0a0e12" stroke="#c9f24a" strokeWidth="2" />
        <text x="14" y="212" fill="#5f7382" fontSize="10" fontFamily="IBM Plex Mono, monospace">
          0
        </text>
        <text x="228" y="212" fill="#5f7382" fontSize="10" fontFamily="IBM Plex Mono, monospace">
          {Math.round(max)} Вт
        </text>
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-[52%] text-center">
        <div className="font-display text-[54px] leading-none font-extrabold tnum text-chalk">
          {Math.round(watts)}
          <span className="ml-1 font-mono text-base text-fog">Вт</span>
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-fog-dim">
          {caption ?? "из розетки сейчас"}
        </div>
        {batteryWatts > 0.5 ? (
          <div className="mt-1 font-mono text-[11px] text-cyan">−{fmt(batteryWatts, 1)} Вт с батареи</div>
        ) : null}
      </div>
    </div>
  );
}

/* ─────────────────────────── Потоковый график ─────────────────────────── */

export interface ChartSample {
  ts: string;
  deviceId: string;
  watts: number;
}

export function LiveChart({
  series,
  devices,
  minutes,
  zones,
  rate,
  height = 240,
}: {
  series: ChartSample[];
  devices: { id: string; name: string }[];
  minutes: number;
  zones: ZoneDef[];
  rate: number;
  height?: number;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const padL = 44;
  const padR = 12;
  const padT = 14;
  const padB = 24;
  const w = Math.max(260, width || 720);
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;

  const nowMs = Date.now();
  const startMs = nowMs - minutes * 60_000;

  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    devices.forEach((d, i) => map.set(d.id, DEVICE_COLORS[i % DEVICE_COLORS.length]));
    return map;
  }, [devices]);

  const grouped = useMemo(() => {
    const map = new Map<string, { t: number; w: number }[]>();
    for (const s of series) {
      const t = new Date(s.ts).getTime();
      if (t < startMs) continue;
      const arr = map.get(s.deviceId) ?? [];
      arr.push({ t, w: s.watts });
      map.set(s.deviceId, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.t - b.t);
    return map;
  }, [series, startMs]);

  const total = useMemo(() => {
    const buckets = new Map<number, Map<string, { sum: number; n: number }>>();
    for (const [deviceId, arr] of grouped.entries()) {
      for (const p of arr) {
        const key = Math.floor(p.t / 4000) * 4000;
        let devs = buckets.get(key);
        if (!devs) {
          devs = new Map();
          buckets.set(key, devs);
        }
        const cur = devs.get(deviceId) ?? { sum: 0, n: 0 };
        cur.sum += p.w;
        cur.n += 1;
        devs.set(deviceId, cur);
      }
    }
    return Array.from(buckets.entries())
      .map(([t, devs]) => {
        let w = 0;
        for (const b of devs.values()) w += b.n ? b.sum / b.n : 0;
        return { t, w };
      })
      .sort((a, b) => a.t - b.t);
  }, [grouped]);

  if (!mounted) {
    return (
      <div ref={ref} className="relative w-full" style={{ height }}>
        <div className="absolute inset-0 rounded border border-dashed border-line-soft bg-ink-900/40" />
      </div>
    );
  }

  const maxW = niceMax(Math.max(...total.map((p) => p.w), 60));
  const x = (t: number) => padL + ((t - startMs) / (minutes * 60_000)) * innerW;
  const y = (watts: number) => padT + innerH - (watts / maxW) * innerH;

  const totalPath = total.length
    ? total
        .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t).toFixed(1)} ${y(p.w).toFixed(1)}`)
        .join(" ")
    : "";
  const areaPath = total.length
    ? `${totalPath} L ${x(total[total.length - 1].t).toFixed(1)} ${(padT + innerH).toFixed(1)} L ${x(
        total[0].t,
      ).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`
    : "";

  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const hoverPoint = hoverX !== null && total.length ? nearest(total, hoverX, x) : null;

  return (
    <div ref={ref} className="relative w-full select-none">
      <svg
        width={w}
        height={height}
        className="block overflow-visible"
        onMouseLeave={() => setHoverX(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          setHoverX(Math.max(padL, Math.min(w - padR, e.clientX - rect.left)));
        }}
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c9f24a" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#c9f24a" stopOpacity="0.02" />
          </linearGradient>
          <clipPath id="chartClip">
            <rect x={padL} y={padT - 6} width={innerW} height={innerH + 6} />
          </clipPath>
        </defs>

        {/* полосы тарифных зон */}
        <g clipPath="url(#chartClip)">
          {zones.map((z) => {
            const segs = zoneSegments(z, startMs, nowMs);
            return segs.map((s, i) => (
              <rect
                key={`${z.id}-${i}`}
                x={x(s.from)}
                y={padT - 6}
                width={Math.max(0, x(s.to) - x(s.from))}
                height={innerH + 6}
                fill={ZONE_META[z.id].color}
                opacity={0.055}
              />
            ));
          })}
        </g>

        {gridLines.map((g) => (
          <g key={g}>
            <line
              x1={padL}
              x2={w - padR}
              y1={padT + innerH * g}
              y2={padT + innerH * g}
              stroke="#1a242d"
              strokeWidth="1"
            />
            <text
              x={padL - 8}
              y={padT + innerH * g + 3}
              textAnchor="end"
              fill="#5f7382"
              fontSize="9.5"
              fontFamily="IBM Plex Mono, monospace"
            >
              {Math.round(maxW * (1 - g))}
            </text>
          </g>
        ))}

        {/* минутные риски */}
        {Array.from({ length: minutes + 1 }, (_, i) => startMs + i * 60_000)
          .filter((t) => new Date(t).getUTCMinutes() % 5 === 0)
          .map((t) => (
            <text
              key={t}
              x={x(t)}
              y={height - 6}
              textAnchor="middle"
              fill="#4d626f"
              fontSize="9"
              fontFamily="IBM Plex Mono, monospace"
            >
              {new Intl.DateTimeFormat("ru-RU", {
                timeZone: REGION.timezone,
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(t))}
            </text>
          ))}

        {areaPath ? <path d={areaPath} fill="url(#areaGrad)" clipPath="url(#chartClip)" /> : null}

        <g clipPath="url(#chartClip)">
          {Array.from(grouped.entries()).map(([id, arr]) => (
            <polyline
              key={id}
              points={arr.map((p) => `${x(p.t).toFixed(1)},${y(p.w).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={colorOf.get(id) ?? "#c9f24a"}
              strokeWidth="1.8"
              strokeLinejoin="round"
              opacity={grouped.size > 1 ? 0.75 : 0}
            />
          ))}
          {totalPath ? (
            <path
              d={totalPath}
              fill="none"
              stroke="#e9f1f5"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={grouped.size > 1 ? 0.95 : 1}
            />
          ) : null}
        </g>

        {total.length ? (
          <g>
            <circle cx={x(total[total.length - 1].t)} cy={y(total[total.length - 1].w)} r="4" fill="#c9f24a" />
            <circle
              cx={x(total[total.length - 1].t)}
              cy={y(total[total.length - 1].w)}
              r="9"
              fill="none"
              stroke="#c9f24a"
              strokeWidth="1"
              opacity="0.45"
              className="flicker"
            />
          </g>
        ) : null}

        {hoverX !== null && hoverPoint ? (
          <g>
            <line x1={hoverX} x2={hoverX} y1={padT - 6} y2={padT + innerH} stroke="#c9f24a" strokeWidth="1" opacity="0.4" />
            <circle cx={x(hoverPoint.t)} cy={y(hoverPoint.w)} r="3.5" fill="#0a0e12" stroke="#c9f24a" strokeWidth="2" />
          </g>
        ) : null}
      </svg>

      {hoverX !== null && hoverPoint ? (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[132px] rounded border border-line bg-ink-900/95 px-2.5 py-2 font-mono text-[11px] shadow-xl"
          style={{ left: Math.min(Math.max(hoverX + 10, 8), Math.max(8, w - 150)) }}
        >
          <div className="text-fog-dim">
            {new Intl.DateTimeFormat("ru-RU", {
              timeZone: REGION.timezone,
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }).format(new Date(hoverPoint.t))}
          </div>
          <div className="mt-1 text-volt tnum">{fmt(hoverPoint.w, 1)} Вт</div>
          <div className="text-fog-dim tnum">{fmtByn((hoverPoint.w / 1000) * rate, 4)} BYN/ч</div>
        </div>
      ) : null}

      {!series.length ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="font-display text-lg uppercase tracking-wider text-fog">Ожидание телеметрии</p>
            <p className="mt-1 max-w-xs text-xs text-fog-dim">
              Браузер снимает показатели этого устройства и шлёт их на сервер каждые 4 секунды.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function nearest(points: { t: number; w: number }[], px: number, x: (t: number) => number) {
  let best = points[0];
  let bestD = Infinity;
  for (const p of points) {
    const d = Math.abs(x(p.t) - px);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function zoneSegments(zone: ZoneDef, startMs: number, endMs: number) {
  if (zone.from === null || zone.to === null) return [{ from: startMs, to: endMs }];
  const segs: { from: number; to: number }[] = [];
  const startHour = Math.floor(startMs / 3_600_000) * 3_600_000;
  for (let t = startHour - 86_400_000; t < endMs + 86_400_000; t += 3_600_000) {
    const h = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: REGION.timezone, hour: "2-digit", hour12: false }).format(
        new Date(t),
      ),
    );
    const inZone = zone.from < zone.to ? h >= zone.from && h < zone.to : h >= zone.from || h < zone.to;
    if (!inZone) continue;
    const from = Math.max(startMs, t);
    const to = Math.min(endMs, t + 3_600_000);
    if (to > from) segs.push({ from, to });
  }
  return segs;
}

/* ─────────────────────────── Суточная шкала зон ─────────────────────────── */

export function ZoneTimeline({ zones, now }: { zones: ZoneDef[]; now: Date }) {
  const hour = hourInMinsk(now);
  const minute = minuteInMinsk(now);
  const nowPct = ((hour + minute / 60) / 24) * 100;

  const segments: { zone: ZoneDef; from: number; to: number }[] = [];
  for (let h = 0; h < 24; h += 1) {
    const zone = zones.find((z) => {
      if (z.from === null || z.to === null) return true;
      return z.from < z.to ? h >= z.from && h < z.to : h >= z.from || h < z.to;
    });
    if (!zone) continue;
    const last = segments[segments.length - 1];
    if (last && last.zone.id === zone.id && last.to === h) last.to = h + 1;
    else segments.push({ zone, from: h, to: h + 1 });
  }

  return (
    <div>
      <div className="relative h-14 w-full overflow-hidden rounded border border-line-soft bg-ink-900">
        {segments.map((s) => (
          <div
            key={`${s.zone.id}-${s.from}`}
            className="group absolute inset-y-0 flex items-center justify-center border-r border-ink-950/60 transition-[filter] duration-300 hover:brightness-125"
            style={{
              left: `${(s.from / 24) * 100}%`,
              width: `${((s.to - s.from) / 24) * 100}%`,
              background: `linear-gradient(180deg, ${ZONE_META[s.zone.id].color}30, ${ZONE_META[s.zone.id].color}12)`,
            }}
            title={`${s.zone.label} — ${formatByn(s.zone.rate, 4)} BYN/кВт·ч`}
          >
            <span
              className="font-mono text-[10px] tnum"
              style={{ color: ZONE_META[s.zone.id].color }}
            >
              {s.to - s.from >= 3 ? `${formatByn(s.zone.rate, 4)}` : ""}
            </span>
          </div>
        ))}
        <div
          className="absolute inset-y-0 z-10 w-px bg-chalk shadow-[0_0_12px_rgba(233,241,245,0.8)]"
          style={{ left: `${nowPct}%` }}
        >
          <span className="absolute -top-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-chalk" />
        </div>
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9.5px] text-fog-dim">
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}</span>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── Потребление по дням ─────────────────────────── */

export interface DailyPoint {
  day: string;
  kwh: number;
  cost: number;
  peak: number;
  byZone: Record<string, number>;
}

export function DailyBars({ data }: { data: DailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.kwh), 0.05));
  const zoneIds = ["night", "day", "peak", "flat"];

  if (!data.length) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded border border-dashed border-line text-sm text-fog-dim">
        Данные появятся после первых замеров
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex h-[190px] items-end gap-[3px]">
        {data.map((d, i) => {
          const h = (d.kwh / max) * 100;
          return (
            <div
              key={d.day}
              className="group relative flex-1 cursor-crosshair"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                className="flex w-full flex-col justify-end overflow-hidden rounded-sm transition-all duration-300"
                style={{ height: "190px", opacity: hover === null || hover === i ? 1 : 0.45 }}
              >
                <div className="w-full" style={{ height: `${Math.max(h, d.kwh > 0 ? 1.5 : 0)}%` }}>
                  <div className="flex h-full w-full flex-col-reverse">
                    {zoneIds.map((z) => {
                      const val = d.byZone[z] ?? 0;
                      if (!val) return null;
                      return (
                        <div
                          key={z}
                          style={{
                            height: `${(val / d.kwh) * 100}%`,
                            background: ZONE_META[z as keyof typeof ZONE_META].color,
                          }}
                          className="w-full opacity-80 transition-opacity group-hover:opacity-100"
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        {data.map((d, i) => (
          <div key={d.day} className="flex-1 text-center font-mono text-[9px] text-fog-dim">
            {hover === i ? d.day.slice(8) : i % 2 === 0 ? d.day.slice(8) : ""}
          </div>
        ))}
      </div>
      {hover !== null ? (
        <div className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded border border-line bg-ink-900/96 px-3 py-2 font-mono text-[11px] shadow-xl">
          <div className="text-chalk">{data[hover].day}</div>
          <div className="text-volt tnum">{fmt(data[hover].kwh, 4)} кВт·ч</div>
          <div className="text-amber tnum">{fmtByn(data[hover].cost)} BYN</div>
          <div className="text-fog-dim tnum">пик {Math.round(data[hover].peak)} Вт</div>
        </div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────── Динамика тарифа ─────────────────────────── */

export function TariffHistory({ data }: { data: { year: number; rate: number; note?: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.rate)) * 1.15;
  return (
    <div>
      <div className="flex h-[132px] items-end gap-1.5">
        {data.map((d, i) => (
          <div
            key={d.year}
            className="group relative flex flex-1 flex-col items-center justify-end"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div
              className="w-full rounded-t transition-all duration-300"
              style={{
                height: `${(d.rate / max) * 112}px`,
                background:
                  i === data.length - 1
                    ? "linear-gradient(180deg,#c9f24a,#8fae2c)"
                    : "linear-gradient(180deg,#2f4453,#1d2b36)",
                boxShadow: i === data.length - 1 ? "0 0 18px rgba(201,242,74,0.35)" : undefined,
                opacity: hover === null || hover === i ? 1 : 0.6,
              }}
            />
            <span className="mt-1.5 font-mono text-[9.5px] text-fog-dim">{String(d.year).slice(2)}</span>
            {hover === i ? (
              <div className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-10 w-max -translate-x-1/2 rounded border border-line bg-ink-900/96 px-2.5 py-1.5 font-mono text-[11px] shadow-xl">
                <div className="text-chalk">{d.year}</div>
                <div className="text-volt tnum">{formatByn(d.rate, 4)} BYN</div>
                {d.note ? <div className="max-w-[180px] text-fog-dim">{d.note}</div> : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-fog-dim">
        Одноставочный субсидируемый тариф для населения, BYN за 1 кВт·ч. За 6 лет рост ≈{" "}
        <span className="font-mono text-amber">
          {fmt(((data[data.length - 1].rate / data[0].rate - 1) || 0) * 100, 0)} %
        </span>
        .
      </p>
    </div>
  );
}
