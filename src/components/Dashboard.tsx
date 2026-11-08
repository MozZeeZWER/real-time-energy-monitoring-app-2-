"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  BatteryCharging,
  CalendarRange,
  CircleDot,
  Download,
  FlaskConical,
  History,
  LayoutGrid,
  LineChart,
  ListChecks,
  ServerCog,
  Sparkles,
  Terminal,
  Wallet,
} from "lucide-react";
import type { DashboardData } from "@/lib/dashboard";
import { useEnergyCollector } from "@/hooks/useEnergyCollector";
import { ZONE_META, REGION, formatMinskTs, type TariffKind } from "@/lib/tariffs";
import { DEVICE_COLORS, DailyBars, LiveChart, PowerGauge, ZoneTimeline } from "@/components/charts";
import { DeviceCard } from "@/components/devices";
import { Header } from "@/components/Header";
import { TariffPanel } from "@/components/TariffPanel";
import { LiveDot, Meter, Reveal, SectionTitle, StatTile, fmt, fmtByn, useCountUp, useMounted } from "@/components/ui";

const WINDOWS = [5, 15, 30, 60];

export function Dashboard({ initial }: { initial: DashboardData }) {
  const collector = useEnergyCollector();
  const [data, setData] = useState<DashboardData>(initial);
  const [windowMinutes, setWindowMinutes] = useState(15);
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState<number>(() => Date.now());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/dashboard?window=${windowMinutes}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as DashboardData;
        if (!alive) return;
        setData(json);
        setLastSync(Date.now());
      } catch {
        /* офлайн — показываем последние данные */
      }
    };
    const first = window.setTimeout(load, 500);
    const id = window.setInterval(load, 500);
    return () => {
      alive = false;
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [windowMinutes]);

  const changeSettings = useCallback(
    async (profileId: string, kind: TariffKind) => {
      setBusy(true);
      try {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profileId, kind }),
        });
        if (!res.ok) throw new Error("settings");
        const fresh = await fetch(`/api/dashboard?window=${windowMinutes}`, { cache: "no-store" });
        if (fresh.ok) setData((await fresh.json()) as DashboardData);
      } catch {
        /* игнорируем — панель вернётся к серверному состоянию */
      } finally {
        setBusy(false);
      }
    },
    [windowMinutes],
  );

  const deleteDevice = useCallback(
    async (id: string) => {
      if (id === collector.deviceId) return;
      await fetch(`/api/devices?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const fresh = await fetch(`/api/dashboard?window=${windowMinutes}`, { cache: "no-store" });
      if (fresh.ok) setData((await fresh.json()) as DashboardData);
    },
    [collector.deviceId, windowMinutes],
  );

  const liveTotal = useMemo(() => {
    const others = data.devices
      .filter((d) => d.id !== collector.deviceId && d.online && d.latest)
      .reduce((s, d) => s + (d.latest?.watts ?? 0), 0);
    const self = collector.paused ? 0 : collector.reading?.gridWatts ?? 0;
    return others + self;
  }, [data.devices, collector.deviceId, collector.paused, collector.reading]);

  const batteryTotal = useMemo(() => {
    const others = data.devices
      .filter((d) => d.id !== collector.deviceId && d.online)
      .reduce((s, d) => s + Math.max(0, -(d.latest?.batteryWatts ?? 0)), 0);
    return others + (collector.reading?.batteryDrainWatts ?? 0);
  }, [data.devices, collector.deviceId, collector.reading]);

  const animatedWatts = useCountUp(liveTotal, 600);
  const animatedKwh = useCountUp(data.totals.todayKwh, 700);
  const animatedCost = useCountUp(data.totals.todayCost, 700);

  const devicesForChart = useMemo(
    () => data.devices.map((d) => ({ id: d.id, name: d.name })),
    [data.devices],
  );

  const hourly = useMemo(() => {
    const map = new Map<number, { hour: number; kwh: number; cost: number; zone: string }>();
    for (const h of data.hourly) {
      const cur = map.get(h.hour) ?? { hour: h.hour, kwh: 0, cost: 0, zone: h.zone };
      cur.kwh += h.kwh;
      cur.cost += h.cost;
      cur.zone = h.zone;
      map.set(h.hour, cur);
    }
    return Array.from({ length: 24 }, (_, i) => map.get(i) ?? { hour: i, kwh: 0, cost: 0, zone: data.settings.activeZone.id });
  }, [data.hourly, data.settings.activeZone.id]);

  const maxHourKwh = Math.max(...hourly.map((h) => h.kwh), 0.0001);
  const mounted = useMounted();
  const currentHourMinsk = mounted
    ? Number(
        new Intl.DateTimeFormat("en-GB", { timeZone: REGION.timezone, hour: "2-digit", hour12: false }).format(new Date()),
      )
    : -1;

  const tickerItems = [
    `ставка ${fmtByn(data.settings.activeZone.rate)} BYN/кВт·ч`,
    `зона: ${ZONE_META[data.settings.activeZone.id].name}`,
    `сейчас ${fmt(liveTotal, 0)} Вт`,
    `сегодня ${fmt(data.totals.todayKwh, 4)} кВт·ч`,
    `сегодня ${fmtByn(data.totals.todayCost)} BYN`,
    `месяц ${fmt(data.totals.monthKwh, 3)} кВт·ч · ${fmtByn(data.totals.monthCost)} BYN`,
    `пик ${fmt(data.totals.peakW, 0)} Вт`,
    `устройств ${data.devices.length}`,
    `замеров за 24 ч: ${data.totals.samples24h}`,
    `${REGION.operator}`,
  ];

  const breakdown = collector.reading?.power ?? null;
  const breakdownMax = breakdown ? Math.max(breakdown.cpu, breakdown.gpu, breakdown.display, breakdown.platform, 1) : 1;

  return (
    <>
      <Header
        liveWatts={liveTotal}
        onlineDevices={Math.max(data.totals.onlineDevices, collector.reading ? 1 : 0)}
        zoneName={ZONE_META[data.settings.activeZone.id].name}
        zoneColor={ZONE_META[data.settings.activeZone.id].color}
        rate={data.settings.activeZone.rate}
        streaming={!collector.paused && collector.status !== "error"}
      />

      <div className="mx-auto max-w-[1440px] px-4 pb-24 sm:px-6">
        {/* ── вступление ── */}
        <section className="mt-7 grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.3em] text-volt">
              {REGION.city} · {REGION.region} · {REGION.grid}
            </p>
            <h1 className="mt-3 font-display text-[clamp(38px,7.2vw,88px)] font-extrabold uppercase leading-[0.9] tracking-[-0.01em] text-chalk">
              Сколько ватт тянет
              <br />
              <span className="relative inline-block text-volt">
                ваш компьютер
                <svg viewBox="0 0 400 12" preserveAspectRatio="none" className="absolute -bottom-1 left-0 h-2.5 w-full">
                  <path
                    d="M0 8 H120 L132 2 L146 10 L160 4 L172 8 H400"
                    fill="none"
                    stroke="#c9f24a"
                    strokeWidth="1.6"
                    className="flow-line"
                  />
                </svg>
              </span>{" "}
              прямо сейчас
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-fog">
              Этот стенд снимает реальные показатели машины, на которой открыта страница: загрузку процессора и
              графики, состояние аккумулятора, память и сеть — пересчитывает их в ватты из розетки и сразу умножает
              на действующий тариф для населения. Откройте страницу на ноутбуке — и оба устройства появятся в общем
              учёте, с расчётом по зонам суток.
            </p>
          </div>

          <div className="panel rounded-md p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fog-dim">действующий тариф</p>
            <div className="mt-1.5 flex items-end justify-between gap-3">
              <p className="max-w-[190px] text-[13px] leading-snug text-chalk">{data.settings.profileTitle}</p>
              <p className="font-display text-[40px] leading-none font-extrabold tnum text-volt">
                {fmtByn(data.settings.activeZone.rate)}
              </p>
            </div>
            <p className="mt-1 font-mono text-[10px] text-fog-dim">
              BYN за 1 кВт·ч · {data.settings.activeZone.label}
            </p>
            <div className="mt-3 space-y-1 border-t border-line-soft pt-2.5 font-mono text-[10.5px] text-fog-dim">
              <p>{data.settings.legal}</p>
              <p>{data.settings.clause}</p>
              <p className="text-fog">{REGION.operator}</p>
            </div>
          </div>
        </section>

        {/* ── бегущая строка ── */}
        <div className="relative mt-4 overflow-hidden rounded border border-line-soft bg-ink-900/60 py-1.5">
          <div className="marquee-track flex w-max gap-8 whitespace-nowrap">
            {[...tickerItems, ...tickerItems].map((t, i) => (
              <span key={i} className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fog-dim">
                <span className="h-1 w-1 rounded-full bg-volt/70" />
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* ── живая консоль ── */}
        <section id="live" className="mt-5">
          <div className="panel relative overflow-hidden rounded-lg">
            <div className="absolute inset-x-0 top-0 h-px sweep overflow-hidden" />
            <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[300px_minmax(0,1fr)]">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fog-dim">
                    суммарная мощность
                  </span>
                  <LiveDot active={!collector.paused} label={collector.paused ? "пауза" : "поток"} />
                </div>
                <PowerGauge watts={animatedWatts} batteryWatts={batteryTotal} scaleMax={Math.max(data.totals.peakW * 1.1, 150)} />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <MiniStat label="кВт·ч сегодня" value={fmt(animatedKwh, 4)} accent="text-volt" />
                  <MiniStat label="BYN сегодня" value={fmtByn(animatedCost)} accent="text-amber" />
                  <MiniStat label="сессия · энергия" value={`${fmt(collector.totals.kwh || data.totals.todayKwh, 4)} кВт·ч`} accent="text-cyan" />
                  <MiniStat label="сессия · деньги" value={`${fmtByn(collector.totals.cost || data.totals.todayCost)} BYN`} accent="text-amber" />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => collector.runStress(6)}
                    disabled={collector.stressing}
                    className="flex items-center gap-1.5 rounded border border-volt/45 bg-volt/10 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-volt transition hover:bg-volt/20 disabled:opacity-40"
                  >
                    <FlaskConical size={12} />
                    {collector.stressing ? "нагрузка идёт…" : "тест нагрузки"}
                  </button>
                  <button
                    type="button"
                    onClick={collector.togglePause}
                    className="flex items-center gap-1.5 rounded border border-line px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-fog transition hover:border-chalk hover:text-chalk"
                  >
                    {collector.paused ? <Activity size={12} /> : <CircleDot size={12} />}
                    {collector.paused ? "возобновить" : "остановить сбор"}
                  </button>
                  <a
                    href="/api/export?days=365"
                    className="flex items-center gap-1.5 rounded border border-line px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-fog transition hover:border-cyan hover:text-cyan"
                  >
                    <Download size={12} /> csv
                  </a>
                  <a
                    href="/agents"
                    className="flex items-center gap-1.5 rounded border border-cyan/45 bg-cyan/10 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-cyan transition hover:bg-cyan/20"
                    title="Как запустить агент Windows"
                  >
                    <Terminal size={12} />
                    агенты / как запустить
                  </a>
                </div>
                <p suppressHydrationWarning className="mt-2.5 font-mono text-[10px] leading-relaxed text-fog-dim">
                  {collector.status === "error"
                    ? "нет связи с сервером — данные копятся локально"
                    : collector.status === "sending"
                      ? "передача замера…"
                      : `последняя передача ${new Date(collector.totals.sentAt || Date.now()).toLocaleTimeString("ru-RU")}`}
                </p>
              </div>

              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <LineChart size={15} className="text-volt" />
                    <h2 className="font-display text-xl font-bold uppercase tracking-wide">Потребление в реальном времени</h2>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {WINDOWS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setWindowMinutes(m)}
                        className={`rounded border px-2 py-1 font-mono text-[10px] uppercase transition ${
                          windowMinutes === m
                            ? "border-volt/60 bg-volt/10 text-volt"
                            : "border-line-soft text-fog-dim hover:text-chalk"
                        }`}
                      >
                        {m} мин
                      </button>
                    ))}
                  </div>
                </div>

                <LiveChart
                  series={data.series}
                  devices={devicesForChart}
                  minutes={windowMinutes}
                  zones={data.settings.zones}
                  rate={data.settings.activeZone.rate}
                  height={250}
                />

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {data.devices.slice(0, 6).map((d, i) => (
                    <span key={d.id} className="flex items-center gap-1.5 font-mono text-[10px] text-fog-dim">
                      <span className="h-1.5 w-4 rounded-full" style={{ background: DEVICE_COLORS[i % DEVICE_COLORS.length] }} />
                      {d.name}
                      {d.id === collector.deviceId ? <span className="text-volt">· это устройство</span> : null}
                    </span>
                  ))}
                  <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-fog-dim">
                    <History size={11} /> синхронизация {new Date(lastSync).toLocaleTimeString("ru-RU")}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fog-dim">
                      тарифные зоны суток · {data.settings.profileShort}
                    </span>
                    <span className="font-mono text-[10px] text-fog-dim">время {REGION.timezone}</span>
                  </div>
                  <ZoneTimeline zones={data.settings.zones} now={new Date(data.now)} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── плитки ── */}
        <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatTile
            label="кВт·ч сегодня"
            value={fmt(data.totals.todayKwh, 4)}
            unit="кВт·ч"
            accent="volt"
            icon={<ArrowDownToLine size={14} />}
            sub={`с ${data.totals.trackingSince ? formatMinskTs(data.totals.trackingSince) : "—"} ведётся учёт`}
          />
          <StatTile
            label="стоимость сегодня"
            value={fmtByn(data.totals.todayCost)}
            unit="BYN"
            accent="amber"
            icon={<Wallet size={14} />}
            sub={`прогноз на сутки ${fmtByn(data.totals.dayForecastCost)} BYN`}
          />
          <StatTile
            label="за месяц"
            value={fmtByn(data.totals.monthCost)}
            unit="BYN"
            accent="cyan"
            icon={<CalendarRange size={14} />}
            sub={`${fmt(data.totals.monthKwh, 3)} кВт·ч · прогноз ${fmtByn(data.totals.monthForecastCost)} BYN`}
          />
          <StatTile
            label="пик мощности"
            value={fmt(data.totals.peakW, 0)}
            unit="Вт"
            accent="ember"
            icon={<Sparkles size={14} />}
            sub={`средняя за 24 ч ${fmt(data.totals.avgW24h, 1)} Вт`}
          />
          <StatTile
            label="от батареи"
            value={fmt(data.totals.todayBatteryKwh, 4)}
            unit="кВт·ч"
            accent="chalk"
            icon={<BatteryCharging size={14} />}
            sub={`${fmt(batteryTotal, 1)} Вт прямо сейчас`}
          />
          <StatTile
            label="замеров"
            value={String(data.totals.samples24h)}
            unit="за 24 ч"
            accent="chalk"
            icon={<ServerCog size={14} />}
            sub={`${data.devices.length} устр. · всего ${fmt(data.totals.allKwh, 3)} кВт·ч`}
          />
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_384px]">
          <div className="min-w-0 space-y-10">
            {/* ── устройства ── */}
            <section id="devices">
              <Reveal>
                <SectionTitle
                  index="01"
                  title="Устройства"
                  hint="Каждое открытое устройство (ПК, ноутбук) шлёт собственные замеры: загрузку процессора и графики, состояние батареи, память, сеть — и расчётную мощность из розетки."
                  right={
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href="/agents"
                        className="flex items-center gap-1.5 rounded border border-volt/40 bg-volt/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-volt transition hover:bg-volt/20"
                      >
                        <Terminal size={11} /> + подключить другое устройство
                      </a>
                      <span className="flex items-center gap-1.5 rounded border border-line-soft px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fog-dim">
                        <LayoutGrid size={11} /> {data.devices.length} в базе
                      </span>
                    </div>
                  }
                />
              </Reveal>
              {data.devices.length === 0 ? (
                <div className="panel rounded-md border-dashed p-8 text-center">
                  <p className="font-display text-xl uppercase tracking-wide text-fog">Устройств пока нет</p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-fog-dim">
                    Через несколько секунд этот компьютер зарегистрируется автоматически и начнёт передавать замеры.
                    Откройте страницу на ноутбуке — появится вторая карточка.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {data.devices.map((d, i) => (
                    <Reveal key={d.id} delay={i * 60}>
                      <DeviceCard
                        device={d}
                        accent={DEVICE_COLORS[i % DEVICE_COLORS.length]}
                        isSelf={d.id === collector.deviceId}
                        reading={collector.reading}
                        profile={collector.profile}
                        rate={data.settings.activeZone.rate}
                        paused={collector.paused}
                        stressing={collector.stressing}
                        sending={collector.status === "sending"}
                        onUpdate={collector.updateProfile}
                        onStress={() => collector.runStress(6)}
                        onPause={collector.togglePause}
                        onDelete={deleteDevice}
                      />
                    </Reveal>
                  ))}
                </div>
              )}
            </section>

            {/* ── аналитика ── */}
            <section id="analytics">
              <Reveal>
                <SectionTitle
                  index="02"
                  title="Разбор потребления"
                  hint="Почасовой профиль сегодняшнего дня и суточная история за год хранения. Ниже — сводка по каждому параметру замера."
                />
              </Reveal>
              <Reveal>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="panel rounded-md p-4">
                    <h3 className="font-display text-base font-bold uppercase tracking-wide text-chalk">
                      Сегодня по часам
                    </h3>
                    <p className="mb-3 font-mono text-[10.5px] text-fog-dim">
                      {fmt(data.totals.todayKwh, 4)} кВт·ч · {fmtByn(data.totals.todayCost)} BYN
                    </p>
                    <div className="flex h-[150px] items-end gap-[2px]">
                      {hourly.map((h) => {
                        const meta = ZONE_META[h.zone as keyof typeof ZONE_META] ?? ZONE_META.flat;
                        const isNow = h.hour === currentHourMinsk;
                        return (
                          <div
                            key={h.hour}
                            className="group relative flex-1"
                            title={`${String(h.hour).padStart(2, "0")}:00 — ${fmt(h.kwh, 4)} кВт·ч · ${fmtByn(h.cost)} BYN`}
                          >
                            <div
                              className="w-full rounded-t transition-all duration-300 group-hover:brightness-125"
                              style={{
                                height: `${Math.max((h.kwh / maxHourKwh) * 140, h.kwh > 0 ? 2 : 1)}px`,
                                background: isNow ? "#e9f1f5" : meta.color,
                                opacity: isNow ? 1 : h.kwh > 0 ? 0.78 : 0.14,
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-1 flex justify-between font-mono text-[9px] text-fog-dim">
                      {[0, 4, 8, 12, 16, 20, 23].map((h) => (
                        <span key={h}>{String(h).padStart(2, "0")}</span>
                      ))}
                    </div>
                  </div>

                  <div className="panel rounded-md p-4">
                    <h3 className="font-display text-base font-bold uppercase tracking-wide text-chalk">
                      Год по дням
                    </h3>
                    <p className="mb-3 font-mono text-[10.5px] text-fog-dim">
                      {data.settings.retentionDays} дней в PostgreSQL, столбцы по тарифным зонам
                    </p>
                    <DailyBars data={data.daily} />
                    <div className="mt-3 flex flex-wrap gap-3">
                      {(Object.keys(ZONE_META) as (keyof typeof ZONE_META)[]).map((z) => (
                        <span key={z} className="flex items-center gap-1.5 font-mono text-[10px] text-fog-dim">
                          <span className="h-2 w-2 rounded-full" style={{ background: ZONE_META[z].color }} />
                          {ZONE_META[z].name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
              <Reveal>
                <div className="panel mt-3 overflow-hidden rounded-md">
                  <div className="px-4 pt-4">
                    <h3 className="font-display text-base font-bold uppercase tracking-wide text-chalk">
                      Все параметры за {data.year.days} дней
                    </h3>
                    <p className="font-mono text-[10.5px] text-fog-dim">
                      {data.year.samples} замеров в PostgreSQL, строки старше срока удаляются
                    </p>
                  </div>
                  <div className="mt-3 max-h-[420px] overflow-auto">
                    <table className="w-full border-collapse font-mono text-[11px]">
                      <thead className="sticky top-0 z-10 bg-ink-850/95 backdrop-blur">
                        <tr className="text-[9.5px] uppercase tracking-[0.14em] text-fog-dim">
                          <th className="px-3 py-2 text-left font-medium">параметр</th>
                          <th className="px-3 py-2 text-right font-medium">среднее</th>
                          <th className="px-3 py-2 text-right font-medium">мин</th>
                          <th className="px-3 py-2 text-right font-medium">макс</th>
                          <th className="px-3 py-2 text-right font-medium">сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.year.parameters.map((row) => (
                          <tr key={row.key} className="border-t border-line-soft/70">
                            <td className="px-3 py-1.5 text-chalk">
                              {row.label}
                              {row.unit ? <span className="ml-1.5 text-fog-dim">{row.unit}</span> : null}
                            </td>
                            <td className="px-3 py-1.5 text-right text-fog tnum">{statText(row.mode ?? row.avg, row.digits)}</td>
                            <td className="px-3 py-1.5 text-right text-fog tnum">{statText(row.min, row.digits)}</td>
                            <td className="px-3 py-1.5 text-right text-fog tnum">{statText(row.max, row.digits)}</td>
                            <td className="px-3 py-1.5 text-right text-chalk tnum">{statText(row.sum, row.digits)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Reveal>
            </section>

            {/* ── как считается ── */}
            <section id="model">
              <Reveal>
                <SectionTitle
                  index="03"
                  title="Как получается мощность"
                  hint="Браузер не имеет доступа к счётчику, поэтому Вт собираются из реально измеряемых величин и паспортных характеристик железа."
                />
              </Reveal>
              <Reveal>
                <div className="panel rounded-md p-4">
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div>
                      <ol className="space-y-2.5 text-[13px] leading-relaxed text-fog">
                        {[
                          ["Загрузка CPU", "лаг таймеров (setInterval 250 мс), длительности long tasks из PerformanceObserver и кадровое время requestAnimationFrame."],
                          ["Графика и рендер", "отклонение среднего кадра от откалиброванного базового и дрожание кадров — чем тяжелее композиция, тем выше вклад GPU."],
                          ["Батарея", "Battery Status API: реальное изменение уровня за время даёт мощность разряда/заряда в Вт, а при питании от батареи потребление из сети равно нулю."],
                          ["Память и сеть", "performance.memory (куча JS), navigator.deviceMemory, Network Information API (тип сети, downlink, RTT)."],
                          ["Модель Вт", "простой узел + CPU_idle + загрузка × (TDP − CPU_idle) + GPU + монитор, затем потери блока питания (КПД 87–90 %)."],
                          ["Деньги", "энергия = ∫ P·dt, стоимость = энергия × ставка тарифной зоны на момент замера; при смене тарифа вся история пересчитывается."],
                        ].map(([title, text], i) => (
                          <li key={title} className="flex gap-3">
                            <span className="mt-0.5 font-mono text-[11px] text-volt">{String(i + 1).padStart(2, "0")}</span>
                            <span>
                              <span className="text-chalk">{title}. </span>
                              {text}
                            </span>
                          </li>
                        ))}
                      </ol>
                      <p className="mt-3 rounded border border-line-soft bg-ink-900/50 p-3 text-[11.5px] leading-relaxed text-fog-dim">
                        Ограничение честности: браузер видит только свою вкладку и не читает датчики материнской платы.
                        Поэтому есть калибровка TDP и поправка на фоновые процессы ОС — сверьте оценку с бытовым
                        ваттметром один раз и подкрутите ползунки.
                      </p>
                    </div>

                    <div className="rounded border border-line-soft bg-ink-900/50 p-3.5">
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fog-dim">
                        разбивка текущего замера
                      </p>
                      {breakdown ? (
                        <div className="mt-3 space-y-2.5">
                          <Meter label="процессор" value={breakdown.cpu} max={breakdownMax} color="#c9f24a" right={`${fmt(breakdown.cpu, 1)} Вт`} />
                          <Meter label="графика" value={breakdown.gpu} max={breakdownMax} color="#4cc6e8" right={`${fmt(breakdown.gpu, 1)} Вт`} />
                          <Meter label="монитор" value={breakdown.display} max={breakdownMax} color="#f4b23c" right={`${fmt(breakdown.display, 1)} Вт`} />
                          <Meter label="платформа" value={breakdown.platform} max={breakdownMax} color="#9d7bff" right={`${fmt(breakdown.platform, 1)} Вт`} />
                          <Meter
                            label="потери БП"
                            value={breakdown.efficiencyLoss}
                            max={breakdownMax}
                            color="#ff6a4d"
                            right={`${fmt(breakdown.efficiencyLoss, 1)} Вт`}
                          />
                          {breakdown.charger > 0 ? (
                            <Meter label="заряд батареи" value={breakdown.charger} max={breakdownMax} color="#5ee6a8" right={`${fmt(breakdown.charger, 1)} Вт`} />
                          ) : null}
                          <div className="mt-3 flex items-end justify-between border-t border-line-soft pt-2.5">
                            <span className="font-mono text-[10px] uppercase tracking-wider text-fog-dim">итого из сети</span>
                            <span className="font-display text-[26px] leading-none font-extrabold tnum text-chalk">
                              {fmt(breakdown.gridWatts, 1)}
                              <span className="ml-1 font-mono text-[11px] text-fog">Вт</span>
                            </span>
                          </div>
                          <div className="flex items-end justify-between">
                            <span className="font-mono text-[10px] uppercase tracking-wider text-fog-dim">стоимость часа</span>
                            <span className="font-mono text-[13px] text-amber tnum">
                              {fmtByn((breakdown.gridWatts / 1000) * data.settings.activeZone.rate)} BYN
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 text-[12px] text-fog-dim">Датчики запускаются…</p>
                      )}
                    </div>
                  </div>
                </div>
              </Reveal>
            </section>

            {/* ── журнал ── */}
            <section id="log">
              <Reveal>
                <SectionTitle
                  index="04"
                  title="Журнал замеров"
                  hint="Последние записи из PostgreSQL: каждые 4 секунды устройство присылает снимок, сервер считает энергию и стоимость по зоне."
                  right={
                    <a
                      href="/api/export?days=365"
                      className="flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fog transition hover:border-cyan hover:text-cyan"
                    >
                      <Download size={11} /> выгрузить csv
                    </a>
                  }
                />
              </Reveal>
              <Reveal>
                <div className="panel overflow-hidden rounded-md">
                  <div className="max-h-[420px] overflow-auto">
                    <table className="w-full border-collapse font-mono text-[11px]">
                      <thead className="sticky top-0 z-10 bg-ink-850/95 backdrop-blur">
                        <tr className="text-[9.5px] uppercase tracking-[0.14em] text-fog-dim">
                          <th className="px-3 py-2 text-left font-medium">время</th>
                          <th className="px-3 py-2 text-left font-medium">устройство</th>
                          <th className="px-3 py-2 text-right font-medium">Вт</th>
                          <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">кВт·ч</th>
                          <th className="hidden px-3 py-2 text-right font-medium md:table-cell">CPU</th>
                          <th className="px-3 py-2 text-left font-medium">зона</th>
                          <th className="px-3 py-2 text-right font-medium">ставка</th>
                          <th className="px-3 py-2 text-right font-medium">BYN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recent.map((r, i) => {
                          const meta = ZONE_META[(r.zone ?? "flat") as keyof typeof ZONE_META] ?? ZONE_META.flat;
                          return (
                            <tr
                              key={`${r.ts}-${i}`}
                              className="border-t border-line-soft/70 transition-colors hover:bg-ink-800/60"
                            >
                              <td className="px-3 py-1.5 whitespace-nowrap text-fog-dim">{formatMinskTs(r.ts)}</td>
                              <td className="max-w-[140px] truncate px-3 py-1.5 text-chalk">{r.device}</td>
                              <td className="px-3 py-1.5 text-right text-chalk tnum">{fmt(r.watts, 1)}</td>
                              <td className="hidden px-3 py-1.5 text-right text-fog tnum sm:table-cell">
                                {fmt(r.kwh, 6)}
                              </td>
                              <td className="hidden px-3 py-1.5 text-right text-fog tnum md:table-cell">
                                {fmt(r.cpuLoad * 100, 0)} %
                              </td>
                              <td className="px-3 py-1.5 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
                                  <span style={{ color: meta.color }}>{meta.name.slice(0, 12)}</span>
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-right text-fog tnum">{fmtByn(r.rate)}</td>
                              <td className="px-3 py-1.5 text-right text-amber tnum">{fmtByn(r.cost, 6)}</td>
                            </tr>
                          );
                        })}
                        {!data.recent.length ? (
                          <tr>
                            <td colSpan={8} className="px-3 py-8 text-center text-fog-dim">
                              Записей пока нет — первый замер появится в течение нескольких секунд
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Reveal>
            </section>
          </div>

          {/* ── правая колонка: тарифы ── */}
          <aside id="tariffs" className="min-w-0 xl:sticky xl:top-20 xl:self-start">
            <Reveal>
              <div className="mb-3 flex items-center gap-2">
                <ListChecks size={15} className="text-volt" />
                <h2 className="font-display text-xl font-bold uppercase tracking-wide">Тарифы Беларуси</h2>
              </div>
            </Reveal>
            <TariffPanel
              settings={data.settings}
              profiles={data.profiles}
              history={data.history}
              liveWatts={liveTotal}
              hourly={data.hourly}
              onChange={changeSettings}
              busy={busy}
            />
          </aside>
        </div>
      </div>
    </>
  );
}

function statText(value: number | string | null, digits: number): string {
  if (typeof value === "string") return value;
  if (value === null) return "—";
  return fmt(value, digits);
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded border border-line-soft bg-ink-900/60 px-2.5 py-2">
      <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-fog-dim">{label}</p>
      <p className={`mt-0.5 font-display text-[19px] leading-none font-bold tnum ${accent}`}>{value}</p>
    </div>
  );
}
