import { desc, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { samples } from "@/db/schema";
import {
  TARIFF_HISTORY,
  TARIFF_PROFILES,
  REGION,
  zonesFor,
  zoneAt,
  type TariffKind,
  type ZoneDef,
} from "@/lib/tariffs";
import {
  ensureSeed,
  getSeries,
  getSettings,
  minskDayStart,
  minskMonthStart,
  type SeriesPoint,
} from "@/lib/store";

async function q<T>(query: SQL): Promise<T[]> {
  const res = await db.execute(query);
  return (res as unknown as { rows: T[] }).rows ?? [];
}

const n = (v: unknown): number => {
  const num = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(num) ? num : 0;
};

export interface DeviceLive {
  id: string;
  name: string;
  kind: string;
  platform: string | null;
  browser: string | null;
  cores: number | null;
  memoryGb: number | null;
  screen: string | null;
  cpuTdpW: number;
  gpuTdpW: number;
  displayW: number;
  batteryWh: number;
  hasBattery: boolean;
  source: string;
  vendor: string | null;
  externalId: string | null;
  powerLimitW: number | null;
  lastSeen: string;
  firstSeen: string;
  online: boolean;
  todayKwh: number;
  todayCost: number;
  monthKwh: number;
  monthCost: number;
  peakW: number;
  avgW: number;
  todayBatteryKwh: number;
  sampleCount: number;
  latest: {
    ts: string;
    watts: number;
    cpuLoad: number;
    gpuLoad: number;
    fps: number | null;
    heapMb: number | null;
    batteryLevel: number | null;
    batteryWatts: number | null;
    charging: boolean | null;
    screenOn: boolean | null;
    netType: string | null;
    downlinkMbps: number | null;
    tariffZone: string | null;
    tariffRate: number;
  } | null;
}

export interface DashboardData {
  now: string;
  region: typeof REGION;
  settings: {
    profileId: string;
    profileTitle: string;
    profileShort: string;
    clause: string;
    legal: string;
    kind: TariffKind;
    zones: ZoneDef[];
    activeZone: ZoneDef;
    nextZoneChange: { hour: number; zone: ZoneDef } | null;
    availableKinds: TariffKind[];
    retentionDays: number;
  };
  devices: DeviceLive[];
  totals: {
    liveWatts: number;
    todayKwh: number;
    todayCost: number;
    monthKwh: number;
    monthCost: number;
    allKwh: number;
    allCost: number;
    todayBatteryKwh: number;
    peakW: number;
    avgW24h: number;
    samples24h: number;
    onlineDevices: number;
    trackingSince: string | null;
    monthForecastCost: number;
    dayForecastCost: number;
  };
  hourly: { hour: number; zone: string; kwh: number; cost: number }[];
  daily: {
    day: string;
    kwh: number;
    cost: number;
    peak: number;
    byZone: Record<string, number>;
  }[];
  recent: {
    ts: string;
    device: string;
    watts: number;
    kwh: number;
    cost: number;
    zone: string | null;
    rate: number;
    cpuLoad: number;
  }[];
  alerts: {
    ts: string;
    device: string;
    watts: number;
    limitW: number;
    telegramOk: boolean;
    webhookOk: boolean;
  }[];
  /** Сводка за весь срок хранения. Каждый измеренный параметр samples, не урезанный набор. */
  year: {
    days: number;
    from: string;
    samples: number;
    parameters: YearParameterStat[];
  };
  series: SeriesPoint[];
  history: typeof TARIFF_HISTORY;
  profiles: { id: string; title: string; short: string; clause: string; typical?: boolean }[];
}

export interface YearParameterStat {
  key: string;
  label: string;
  unit: string;
  digits: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  sum: number | null;
  /** Для категориальных полей: самое частое значение за срок хранения. */
  mode: string | null;
}

function nn(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const num = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(num) ? num : null;
}

function scale(v: number | null, factor: number): number | null {
  return v === null ? null : v * factor;
}

function yearParameters(row: Record<string, unknown>, zoneMode: string | null, netMode: string | null): YearParameterStat[] {
  const stat = (
    key: string,
    label: string,
    unit: string,
    digits: number,
    avg: number | null,
    min: number | null,
    max: number | null,
    sum: number | null,
    mode: string | null = null,
  ): YearParameterStat => ({ key, label, unit, digits, avg, min, max, sum, mode });

  return [
    stat("watts", "Мощность из сети", "Вт", 1, nn(row.watts_avg), nn(row.watts_min), nn(row.watts_max), null),
    stat("battery_watts", "Мощность батареи", "Вт", 1, nn(row.bat_w_avg), nn(row.bat_w_min), nn(row.bat_w_max), null),
    stat("kwh", "Энергия из сети", "кВт·ч", 4, null, null, null, nn(row.kwh_sum)),
    stat("battery_kwh", "Энергия батареи", "кВт·ч", 4, null, null, null, nn(row.battery_kwh_sum)),
    stat("cost", "Стоимость", "BYN", 4, null, null, null, nn(row.cost_sum)),
    stat("cpu_load", "Загрузка CPU", "%", 1, scale(nn(row.cpu_avg), 100), scale(nn(row.cpu_min), 100), scale(nn(row.cpu_max), 100), null),
    stat("gpu_load", "Загрузка GPU", "%", 1, scale(nn(row.gpu_avg), 100), scale(nn(row.gpu_min), 100), scale(nn(row.gpu_max), 100), null),
    stat("fps", "Кадры", "кадр/с", 1, nn(row.fps_avg), nn(row.fps_min), nn(row.fps_max), null),
    stat("loop_lag_ms", "Лаг цикла", "мс", 1, nn(row.lag_avg), nn(row.lag_min), nn(row.lag_max), null),
    stat("long_task_ms", "Длинные задачи", "мс", 1, nn(row.long_avg), nn(row.long_min), nn(row.long_max), null),
    stat("heap_mb", "Куча JS", "МБ", 1, nn(row.heap_avg), nn(row.heap_min), nn(row.heap_max), null),
    stat("battery_level", "Уровень батареи", "%", 1, scale(nn(row.bat_avg), 100), scale(nn(row.bat_min), 100), scale(nn(row.bat_max), 100), null),
    stat("charging", "Доля замеров на зарядке", "%", 1, scale(nn(row.charging_share), 100), null, null, null),
    stat("screen_on", "Доля замеров с экраном", "%", 1, scale(nn(row.screen_share), 100), null, null, null),
    stat("downlink_mbps", "Входящий канал", "Мбит/с", 2, nn(row.down_avg), nn(row.down_min), nn(row.down_max), null),
    stat("rtt_ms", "Задержка сети", "мс", 0, nn(row.rtt_avg), nn(row.rtt_min), nn(row.rtt_max), null),
    stat("tariff_rate", "Ставка", "BYN/кВт·ч", 4, nn(row.rate_avg), nn(row.rate_min), nn(row.rate_max), null),
    stat("tariff_zone", "Тарифная зона", "", 0, null, null, null, null, zoneMode),
    stat("net_type", "Тип сети", "", 0, null, null, null, null, netMode),
  ];
}

function nextZoneChange(zones: ZoneDef[], now: Date): { hour: number; zone: ZoneDef } | null {
  const current = zoneAt(zones, now);
  for (let step = 1; step <= 24; step += 1) {
    const probe = new Date(now.getTime() + step * 3_600_000);
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: REGION.timezone, hour: "2-digit", hour12: false }).format(probe),
    );
    if (hour === 24) continue;
    const probeZone = zones.find((z) => {
      if (z.from === null || z.to === null) return false;
      return z.from < z.to ? hour >= z.from && hour < z.to : hour >= z.from || hour < z.to;
    });
    if (probeZone && probeZone.id !== current.id) {
      return { hour, zone: probeZone };
    }
  }
  return null;
}

export async function getDashboard(windowMinutes = 30): Promise<DashboardData> {
  await ensureSeed();
  const now = new Date();
  const settings = await getSettings();
  const zones = zonesFor(settings.profileId, settings.kind, now);
  const activeZone = zoneAt(zones, now);
  const profile = TARIFF_PROFILES.find((p) => p.id === settings.profileId) ?? TARIFF_PROFILES[0];

  const dayStart = minskDayStart(0);
  const monthStart = minskMonthStart();
  const historyStart = minskDayStart(-(settings.retentionDays - 1));
  const yearStart = new Date(now.getTime() - settings.retentionDays * 86_400_000);
  const hourAgo = new Date(now.getTime() - 3_600_000);
  const tz = REGION.timezone;

  const [deviceRows, latestRows, hourlyRows, dailyRows, recentRows, overallRows, yearRows, zoneModeRows, netModeRows] = await Promise.all([
    q<Record<string, unknown>>(sql`
      SELECT d.id, d.name, d.kind, d.platform, d.browser, d.cores, d.memory_gb, d.screen,
             d.cpu_tdp_w, d.gpu_tdp_w, d.display_w, d.battery_wh, d.has_battery,
             d.source, d.vendor, d.external_id, d.power_limit_w,
             d.first_seen, d.last_seen,
             COALESCE(SUM(s.kwh) FILTER (WHERE s.ts >= ${dayStart}), 0) AS today_kwh,
             COALESCE(SUM(s.cost) FILTER (WHERE s.ts >= ${dayStart}), 0) AS today_cost,
             COALESCE(SUM(s.kwh) FILTER (WHERE s.ts >= ${monthStart}), 0) AS month_kwh,
             COALESCE(SUM(s.cost) FILTER (WHERE s.ts >= ${monthStart}), 0) AS month_cost,
             COALESCE(SUM(s.battery_kwh) FILTER (WHERE s.ts >= ${dayStart}), 0) AS today_battery_kwh,
             COALESCE(MAX(s.watts) FILTER (WHERE s.ts >= ${dayStart}), 0) AS peak_w,
             COALESCE(AVG(s.watts) FILTER (WHERE s.ts >= ${hourAgo}), 0) AS avg_w,
             COUNT(s.id) AS sample_count
      FROM devices d
      LEFT JOIN samples s ON s.device_id = d.id
      GROUP BY d.id
      ORDER BY d.last_seen DESC
      LIMIT 24
    `),
    q<Record<string, unknown>>(sql`
      SELECT DISTINCT ON (device_id) device_id, ts, watts, cpu_load, gpu_load, fps, heap_mb,
             battery_level, battery_watts, charging, screen_on, net_type, downlink_mbps,
             tariff_zone, tariff_rate
      FROM samples
      WHERE ts >= ${new Date(now.getTime() - 6 * 3_600_000)}
      ORDER BY device_id, ts DESC
    `),
    q<Record<string, unknown>>(sql`
      SELECT EXTRACT(HOUR FROM s.ts AT TIME ZONE '${sql.raw(tz)}')::int AS hour,
             s.tariff_zone AS zone,
             SUM(s.kwh) AS kwh,
             SUM(s.cost) AS cost
      FROM samples s
      WHERE s.ts >= ${dayStart}
      GROUP BY 1, 2
      ORDER BY 1
    `),
    q<Record<string, unknown>>(sql`
      SELECT to_char(s.ts AT TIME ZONE '${sql.raw(tz)}', 'YYYY-MM-DD') AS day,
             s.tariff_zone AS zone,
             SUM(s.kwh) AS kwh,
             SUM(s.cost) AS cost,
             MAX(s.watts) AS peak
      FROM samples s
      WHERE s.ts >= ${historyStart}
      GROUP BY 1, 2
      ORDER BY 1
    `),
    q<Record<string, unknown>>(sql`
      SELECT s.ts, d.name AS device, s.watts, s.kwh, s.cost, s.tariff_zone AS zone,
             s.tariff_rate AS rate, s.cpu_load
      FROM samples s
      JOIN devices d ON d.id = s.device_id
      ORDER BY s.ts DESC
      LIMIT 40
    `),
    q<Record<string, unknown>>(sql`
      SELECT COALESCE(SUM(kwh), 0) AS all_kwh,
             COALESCE(SUM(cost), 0) AS all_cost,
             COALESCE(MAX(watts), 0) AS peak_w,
             COALESCE(AVG(watts) FILTER (WHERE ts >= ${new Date(now.getTime() - 24 * 3_600_000)}), 0) AS avg_w24,
             COUNT(*) FILTER (WHERE ts >= ${new Date(now.getTime() - 24 * 3_600_000)}) AS cnt24,
             MIN(ts) AS first_ts
      FROM samples
      WHERE ts >= ${yearStart}
    `),
    q<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS samples,
             AVG(watts) AS watts_avg, MIN(watts) AS watts_min, MAX(watts) AS watts_max,
             AVG(battery_watts) AS bat_w_avg, MIN(battery_watts) AS bat_w_min, MAX(battery_watts) AS bat_w_max,
             SUM(kwh) AS kwh_sum,
             SUM(battery_kwh) AS battery_kwh_sum,
             SUM(cost) AS cost_sum,
             AVG(cpu_load) AS cpu_avg, MIN(cpu_load) AS cpu_min, MAX(cpu_load) AS cpu_max,
             AVG(gpu_load) AS gpu_avg, MIN(gpu_load) AS gpu_min, MAX(gpu_load) AS gpu_max,
             AVG(fps) AS fps_avg, MIN(fps) AS fps_min, MAX(fps) AS fps_max,
             AVG(loop_lag_ms) AS lag_avg, MIN(loop_lag_ms) AS lag_min, MAX(loop_lag_ms) AS lag_max,
             AVG(long_task_ms) AS long_avg, MIN(long_task_ms) AS long_min, MAX(long_task_ms) AS long_max,
             AVG(heap_mb) AS heap_avg, MIN(heap_mb) AS heap_min, MAX(heap_mb) AS heap_max,
             AVG(battery_level) AS bat_avg, MIN(battery_level) AS bat_min, MAX(battery_level) AS bat_max,
             AVG(CASE WHEN charging IS NULL THEN NULL WHEN charging THEN 1.0 ELSE 0.0 END) AS charging_share,
             AVG(CASE WHEN screen_on IS NULL THEN NULL WHEN screen_on THEN 1.0 ELSE 0.0 END) AS screen_share,
             AVG(downlink_mbps) AS down_avg, MIN(downlink_mbps) AS down_min, MAX(downlink_mbps) AS down_max,
             AVG(rtt_ms) AS rtt_avg, MIN(rtt_ms) AS rtt_min, MAX(rtt_ms) AS rtt_max,
             AVG(tariff_rate) AS rate_avg, MIN(tariff_rate) AS rate_min, MAX(tariff_rate) AS rate_max
      FROM samples
      WHERE ts >= ${yearStart}
    `),
    q<Record<string, unknown>>(sql`
      SELECT tariff_zone AS mode, COUNT(*)::int AS c
      FROM samples
      WHERE ts >= ${yearStart} AND tariff_zone IS NOT NULL
      GROUP BY 1
      ORDER BY c DESC
      LIMIT 1
    `),
    q<Record<string, unknown>>(sql`
      SELECT net_type AS mode, COUNT(*)::int AS c
      FROM samples
      WHERE ts >= ${yearStart} AND net_type IS NOT NULL
      GROUP BY 1
      ORDER BY c DESC
      LIMIT 1
    `),
  ]);

  const series = await getSeries(windowMinutes);

  const latestByDevice = new Map<string, Record<string, unknown>>();
  for (const row of latestRows) latestByDevice.set(String(row.device_id), row);

  const onlineThreshold = now.getTime() - 90_000;

  const deviceList: DeviceLive[] = deviceRows.map((d) => {
    const id = String(d.id);
    const l = latestByDevice.get(id) ?? null;
    const lastSeen = d.last_seen instanceof Date ? d.last_seen : new Date(String(d.last_seen ?? now));
    const online = l ? new Date(String(l.ts)).getTime() > onlineThreshold : lastSeen.getTime() > onlineThreshold;
    return {
      id,
      name: String(d.name ?? "Устройство"),
      kind: String(d.kind ?? "desktop"),
      platform: d.platform ? String(d.platform) : null,
      browser: d.browser ? String(d.browser) : null,
      cores: d.cores == null ? null : n(d.cores),
      memoryGb: d.memory_gb == null ? null : n(d.memory_gb),
      screen: d.screen ? String(d.screen) : null,
      cpuTdpW: n(d.cpu_tdp_w),
      gpuTdpW: n(d.gpu_tdp_w),
      displayW: n(d.display_w),
      batteryWh: n(d.battery_wh),
      hasBattery: Boolean(d.has_battery),
      source: String(d.source ?? "agent"),
      vendor: d.vendor ? String(d.vendor) : null,
      externalId: d.external_id ? String(d.external_id) : null,
      powerLimitW: d.power_limit_w == null ? null : n(d.power_limit_w),
      firstSeen: new Date(String(d.first_seen ?? now)).toISOString(),
      lastSeen: lastSeen.toISOString(),
      online,
      todayKwh: n(d.today_kwh),
      todayCost: n(d.today_cost),
      monthKwh: n(d.month_kwh),
      monthCost: n(d.month_cost),
      todayBatteryKwh: n(d.today_battery_kwh),
      peakW: n(d.peak_w),
      avgW: n(d.avg_w),
      sampleCount: n(d.sample_count),
      latest: l
        ? {
            ts: new Date(String(l.ts)).toISOString(),
            watts: n(l.watts),
            cpuLoad: n(l.cpu_load),
            gpuLoad: n(l.gpu_load),
            fps: l.fps == null ? null : n(l.fps),
            heapMb: l.heap_mb == null ? null : n(l.heap_mb),
            batteryLevel: l.battery_level == null ? null : n(l.battery_level),
            batteryWatts: l.battery_watts == null ? null : n(l.battery_watts),
            charging: l.charging == null ? null : Boolean(l.charging),
            screenOn: l.screen_on == null ? null : Boolean(l.screen_on),
            netType: l.net_type ? String(l.net_type) : null,
            downlinkMbps: l.downlink_mbps == null ? null : n(l.downlink_mbps),
            tariffZone: l.tariff_zone ? String(l.tariff_zone) : null,
            tariffRate: n(l.tariff_rate),
          }
        : null,
    };
  });

  const dailyMap = new Map<string, DashboardData["daily"][number]>();
  for (const row of dailyRows) {
    const day = String(row.day);
    const entry = dailyMap.get(day) ?? { day, kwh: 0, cost: 0, peak: 0, byZone: {} };
    entry.kwh += n(row.kwh);
    entry.cost += n(row.cost);
    entry.peak = Math.max(entry.peak, n(row.peak));
    const zone = row.zone ? String(row.zone) : "flat";
    entry.byZone[zone] = (entry.byZone[zone] ?? 0) + n(row.kwh);
    dailyMap.set(day, entry);
  }

  const overall = overallRows[0] ?? {};
  const todayKwh = deviceList.reduce((s, d) => s + d.todayKwh, 0);
  const todayCost = deviceList.reduce((s, d) => s + d.todayCost, 0);
  const monthKwh = deviceList.reduce((s, d) => s + d.monthKwh, 0);
  const monthCost = deviceList.reduce((s, d) => s + d.monthCost, 0);
  const onlineDevices = deviceList.filter((d) => d.online).length;
  const liveWatts = deviceList.filter((d) => d.online && d.latest).reduce((s, d) => s + (d.latest?.watts ?? 0), 0);

  const monthDays = Math.max(1, now.getUTCDate());
  const monthForecastCost = (monthCost / monthDays) * 30.4;
  const dayForecastCost = todayCost > 0 ? todayCost : liveWatts * 24 * activeZone.rate / 1000;
  const alertRows = await q<Record<string, unknown>>(sql`
    SELECT a.ts, d.name AS device, a.watts, a.limit_w, a.telegram_ok, a.webhook_ok
    FROM alerts a
    JOIN devices d ON d.id = a.device_id
    ORDER BY a.ts DESC
    LIMIT 8
  `);

  return {
    now: now.toISOString(),
    region: REGION,
    settings: {
      profileId: profile.id,
      profileTitle: profile.title,
      profileShort: profile.short,
      clause: profile.clause,
      legal: profile.legal,
      kind: settings.kind,
      retentionDays: settings.retentionDays,
      zones,
      activeZone,
      nextZoneChange: nextZoneChange(zones, now),
      availableKinds: Array.from(
        new Set(Object.keys(profile.versions[profile.versions.length - 1].kinds) as TariffKind[]),
      ),
    },
    devices: deviceList,
    totals: {
      liveWatts,
      todayKwh,
      todayCost,
      monthKwh,
      monthCost,
      allKwh: n(overall.all_kwh),
      allCost: n(overall.all_cost),
      todayBatteryKwh: deviceList.reduce((s, d) => s + d.todayBatteryKwh, 0),
      peakW: Math.max(n(overall.peak_w), ...deviceList.map((d) => d.peakW), 0),
      avgW24h: n(overall.avg_w24),
      samples24h: n(overall.cnt24),
      onlineDevices,
      trackingSince: overall.first_ts ? new Date(String(overall.first_ts)).toISOString() : null,
      monthForecastCost,
      dayForecastCost,
    },
    hourly: hourlyRows.map((r) => ({
      hour: n(r.hour),
      zone: r.zone ? String(r.zone) : "flat",
      kwh: n(r.kwh),
      cost: n(r.cost),
    })),
    daily: Array.from(dailyMap.values()).sort((a, b) => a.day.localeCompare(b.day)),
    recent: recentRows.map((r) => ({
      ts: new Date(String(r.ts)).toISOString(),
      device: String(r.device ?? ""),
      watts: n(r.watts),
      kwh: n(r.kwh),
      cost: n(r.cost),
      zone: r.zone ? String(r.zone) : null,
      rate: n(r.rate),
      cpuLoad: n(r.cpu_load),
    })),
    series,
    alerts: alertRows.map((row) => ({
      ts: new Date(String(row.ts)).toISOString(),
      device: String(row.device ?? ""),
      watts: n(row.watts),
      limitW: n(row.limit_w),
      telegramOk: Boolean(row.telegram_ok),
      webhookOk: Boolean(row.webhook_ok),
    })),
    year: {
      days: settings.retentionDays,
      from: yearStart.toISOString(),
      samples: n(yearRows[0]?.samples),
      parameters: yearParameters(
        yearRows[0] ?? {},
        zoneModeRows[0]?.mode ? String(zoneModeRows[0].mode) : null,
        netModeRows[0]?.mode ? String(netModeRows[0].mode) : null,
      ),
    },
    history: TARIFF_HISTORY,
    profiles: TARIFF_PROFILES.map((p) => ({
      id: p.id,
      title: p.title,
      short: p.short,
      clause: p.clause,
      typical: p.typical,
    })),
  };
}

export async function getRecentSamples(limit = 40) {
  const rows = await db
    .select({
      ts: samples.ts,
      deviceId: samples.deviceId,
      watts: samples.watts,
      kwh: samples.kwh,
      cost: samples.cost,
      rate: samples.tariffRate,
      zone: samples.tariffZone,
      cpuLoad: samples.cpuLoad,
      gpuLoad: samples.gpuLoad,
      batteryLevel: samples.batteryLevel,
      charging: samples.charging,
    })
    .from(samples)
    .orderBy(desc(samples.ts))
    .limit(limit);
  return rows.map((r) => ({ ...r, ts: r.ts.toISOString() }));
}
