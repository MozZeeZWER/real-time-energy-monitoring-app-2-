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
  series: SeriesPoint[];
  history: typeof TARIFF_HISTORY;
  profiles: { id: string; title: string; short: string; clause: string; typical?: boolean }[];
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
  const day14 = minskDayStart(-13);
  const hourAgo = new Date(now.getTime() - 3_600_000);
  const tz = REGION.timezone;

  const [deviceRows, latestRows, hourlyRows, dailyRows, recentRows, overallRows] = await Promise.all([
    q<Record<string, unknown>>(sql`
      SELECT d.id, d.name, d.kind, d.platform, d.browser, d.cores, d.memory_gb, d.screen,
             d.cpu_tdp_w, d.gpu_tdp_w, d.display_w, d.battery_wh, d.has_battery,
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
      WHERE s.ts >= ${day14}
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
