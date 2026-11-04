"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, CalendarClock, Info, Landmark, Scale, Timer } from "lucide-react";
import type { DashboardData } from "@/lib/dashboard";
import {
  KIND_LABELS,
  REGION,
  TARIFF_EFFECTIVE_FROM,
  TARIFF_LEGAL,
  ZONE_META,
  zonesFor,
  type TariffKind,
} from "@/lib/tariffs";
import { TariffHistory } from "@/components/charts";
import { fmt, fmtByn, useMounted } from "@/components/ui";

const PERIODS = [
  { id: "hour", label: "час", hours: 1 },
  { id: "day", label: "сутки", hours: 24 },
  { id: "week", label: "неделя", hours: 168 },
  { id: "month", label: "месяц", hours: 730 },
  { id: "year", label: "год", hours: 8760 },
] as const;

export function TariffPanel({
  settings,
  profiles,
  history,
  liveWatts,
  hourly,
  onChange,
  busy,
}: {
  settings: DashboardData["settings"];
  profiles: DashboardData["profiles"];
  history: DashboardData["history"];
  liveWatts: number;
  hourly: DashboardData["hourly"];
  onChange: (profileId: string, kind: TariffKind) => void;
  busy: boolean;
}) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("day");
  const [tick, setTick] = useState(0);
  const mounted = useMounted();

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const activeZone = settings.activeZone;
  const periodDef = PERIODS.find((p) => p.id === period) ?? PERIODS[1];
  const watts = Math.max(0, liveWatts);
  const kwh = (watts / 1000) * periodDef.hours;
  const cost = kwh * activeZone.rate;

  const singleRate = useMemo(() => {
    const zones = zonesFor(settings.profileId, "single");
    return zones[0]?.rate ?? activeZone.rate;
  }, [settings.profileId, activeZone.rate]);

  // Реальная экономия/переплата за сегодня: фактические зоны против одноставочного счётчика.
  const todayKwh = hourly.reduce((s, h) => s + h.kwh, 0);
  const todayCostZoned = hourly.reduce((s, h) => s + h.cost, 0);
  const todayCostSingle = todayKwh * singleRate;
  const delta = todayCostSingle - todayCostZoned;

  const countdown = useMemo(() => {
    void tick;
    const next = settings.nextZoneChange;
    if (!next || !mounted) return null;
    const now = new Date();
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: REGION.timezone,
        hour: "2-digit",
        hour12: false,
      }).format(now),
    );
    const minute = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: REGION.timezone, minute: "2-digit" }).format(now),
    );
    let mins = (next.hour - hour) * 60 - minute;
    if (mins < 0) mins += 24 * 60;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return { label: h > 0 ? `${h} ч ${m} мин` : `${m} мин`, zone: next.zone };
  }, [settings.nextZoneChange, tick, mounted]);

  return (
    <div className="space-y-4">
      <section className="panel rounded-md p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Landmark size={15} className="text-volt" />
              <h3 className="font-display text-lg font-bold uppercase tracking-wide">Тариф · {REGION.city}</h3>
            </div>
            <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-fog-dim">
              {TARIFF_LEGAL}
              <br />
              действует с {TARIFF_EFFECTIVE_FROM} · {REGION.operator}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-volt/40 bg-volt/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-volt">
            <BadgeCheck size={12} />
            проверено
          </span>
        </div>

        <div
          className="mt-3.5 rounded border p-3"
          style={{
            borderColor: `${ZONE_META[activeZone.id].color}55`,
            background: `linear-gradient(120deg, ${ZONE_META[activeZone.id].color}18, transparent 70%)`,
          }}
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fog-dim">сейчас действует</p>
              <p className="mt-1 font-display text-xl font-bold uppercase" style={{ color: ZONE_META[activeZone.id].color }}>
                {ZONE_META[activeZone.id].name}
              </p>
              <p className="font-mono text-[11px] text-fog">{activeZone.label}</p>
            </div>
            <div className="text-right">
              <div className="font-display text-[34px] leading-none font-extrabold tnum text-chalk">
                {fmtByn(activeZone.rate)}
              </div>
              <div className="font-mono text-[10px] text-fog-dim">BYN / кВт·ч</div>
            </div>
          </div>
          {countdown ? (
            <p className="mt-2.5 flex items-center gap-1.5 border-t border-white/5 pt-2 font-mono text-[10.5px] text-fog-dim">
              <Timer size={11} />
              до перехода в «{ZONE_META[countdown.zone.id].name}» ({fmtByn(countdown.zone.rate)} BYN) —{" "}
              <span className="text-chalk tnum">{countdown.label}</span>
            </p>
          ) : null}
        </div>

        {/* выбор тарифного профиля */}
        <div className="mt-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-fog-dim">
            категория потребителя
          </p>
          <div className="space-y-1.5">
            {profiles.map((p) => {
              const active = p.id === settings.profileId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChange(p.id, settings.kind)}
                  title={p.clause}
                  className={`group flex w-full items-center justify-between gap-3 rounded border px-3 py-2 text-left transition ${
                    active
                      ? "border-volt/60 bg-volt/10"
                      : "border-line-soft bg-ink-900/50 hover:border-line hover:bg-ink-800/70"
                  }`}
                >
                  <span className="min-w-0">
                    <span className={`block truncate text-[13px] ${active ? "text-chalk" : "text-fog"}`}>{p.title}</span>
                    <span className="block truncate font-mono text-[10px] text-fog-dim">{p.clause}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {p.typical ? (
                      <span className="rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 font-mono text-[9px] uppercase text-amber">
                        типовой
                      </span>
                    ) : null}
                    <span
                      className={`h-2.5 w-2.5 rounded-full border ${
                        active ? "border-volt bg-volt" : "border-line"
                      }`}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* вид счётчика */}
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-fog-dim">
            <CalendarClock size={11} /> прибор учёта
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {(["single", "two", "three"] as TariffKind[]).map((k) => {
              const available = settings.availableKinds.includes(k);
              const active = settings.kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!available || busy}
                  onClick={() => onChange(settings.profileId, k)}
                  className={`rounded border px-2 py-2 text-center transition ${
                    active
                      ? "border-cyan/60 bg-cyan/10 text-cyan"
                      : available
                        ? "border-line-soft bg-ink-900/50 text-fog hover:border-line hover:text-chalk"
                        : "cursor-not-allowed border-line-soft/50 bg-ink-900/30 text-fog-dim opacity-40"
                  }`}
                >
                  <span className="block font-mono text-[10px] uppercase tracking-wider">
                    {k === "single" ? "1 зона" : k === "two" ? "2 зоны" : "3 зоны"}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-tight opacity-80">
                    {KIND_LABELS[k].replace(" счётчик", "")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* зоны и ставки */}
        <div className="mt-4 overflow-hidden rounded border border-line-soft">
          <table className="w-full border-collapse font-mono text-[11px]">
            <thead>
              <tr className="bg-ink-800/70 text-[9.5px] uppercase tracking-[0.14em] text-fog-dim">
                <th className="px-2.5 py-1.5 text-left font-medium">временной период</th>
                <th className="px-2.5 py-1.5 text-right font-medium">BYN/кВт·ч</th>
                <th className="hidden px-2.5 py-1.5 text-right font-medium sm:table-cell">час нагрузки</th>
              </tr>
            </thead>
            <tbody>
              {settings.zones.map((z) => {
                const isActive = z.id === activeZone.id;
                return (
                  <tr
                    key={z.id}
                    className={`border-t border-line-soft transition ${isActive ? "bg-ink-800/60" : "hover:bg-ink-800/30"}`}
                  >
                    <td className="px-2.5 py-2">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: ZONE_META[z.id].color, boxShadow: `0 0 8px ${ZONE_META[z.id].color}80` }}
                        />
                        <span className={isActive ? "text-chalk" : "text-fog"}>
                          {z.from === null || z.to === null
                            ? "круглосуточно"
                            : `${String(z.from).padStart(2, "0")}:00–${String(z.to).padStart(2, "0")}:00`}
                          {isActive ? " · сейчас" : ""}
                        </span>
                      </span>
                    </td>
                    <td className="px-2.5 py-2 text-right tnum" style={{ color: ZONE_META[z.id].color }}>
                      {fmtByn(z.rate)}
                    </td>
                    <td className="hidden px-2.5 py-2 text-right text-fog-dim tnum sm:table-cell">
                      {fmtByn((watts / 1000) * z.rate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* калькулятор */}
      <section className="panel rounded-md p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide">
            <Scale size={15} className="text-amber" /> Калькулятор нагрузки
          </h3>
          <span className="font-mono text-[10px] text-fog-dim tnum">сейчас {fmt(watts, 0)} Вт</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`rounded border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider transition ${
                period === p.id
                  ? "border-amber/60 bg-amber/12 text-amber"
                  : "border-line-soft text-fog hover:border-line hover:text-chalk"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-3.5 grid grid-cols-2 gap-3">
          <div className="rounded border border-line-soft bg-ink-900/60 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fog-dim">энергия</p>
            <p className="mt-1 font-display text-[26px] leading-none font-bold tnum text-volt">{fmt(kwh, kwh < 1 ? 4 : 2)}</p>
            <p className="font-mono text-[10px] text-fog-dim">кВт·ч за {periodDef.label}</p>
          </div>
          <div className="rounded border border-line-soft bg-ink-900/60 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fog-dim">стоимость</p>
            <p className="mt-1 font-display text-[26px] leading-none font-bold tnum text-amber">{fmtByn(cost)}</p>
            <p className="font-mono text-[10px] text-fog-dim">BYN по ставке {fmtByn(activeZone.rate)}</p>
          </div>
        </div>

        <div className="mt-3 flex gap-2 rounded border border-line-soft bg-ink-900/40 p-3">
          <Info size={14} className="mt-0.5 shrink-0 text-cyan" />
          <p className="text-[11.5px] leading-relaxed text-fog">
            {todayKwh > 0 ? (
              <>
                За сегодня зафиксировано <span className="font-mono text-chalk tnum">{fmt(todayKwh, 4)} кВт·ч</span> по
                зонам: <span className="font-mono text-chalk tnum">{fmtByn(todayCostZoned)} BYN</span>. По
                одноставочному счётчику ({fmtByn(singleRate)} BYN) вышло бы{" "}
                <span className="font-mono text-chalk tnum">{fmtByn(todayCostSingle)} BYN</span>{" "}
                {Math.abs(delta) > 0.0001 ? (
                  <span className={delta > 0 ? "text-volt" : "text-ember"}>
                    — {delta > 0 ? "экономия" : "переплата"} {fmtByn(Math.abs(delta))} BYN
                  </span>
                ) : null}
                .
              </>
            ) : (
              <>Как только появятся первые кВт·ч, здесь появится сравнение вашего фактического учёта с одноставочным тарифом.</>
            )}
          </p>
        </div>
      </section>

      <section className="panel rounded-md p-4">
        <h3 className="font-display text-lg font-bold uppercase tracking-wide">Динамика тарифа</h3>
        <p className="mb-3 font-mono text-[10.5px] text-fog-dim">2020 → 2026, BYN за кВт·ч</p>
        <TariffHistory data={history} />
      </section>
    </div>
  );
}
