import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Устройство-источник телеметрии (ПК / ноутбук), с которого браузер
 * реально снимает показатели и шлёт их на сервер.
 */
export const devices = pgTable(
  "devices",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("desktop"), // desktop | laptop | other
    platform: text("platform"),
    browser: text("browser"),
    userAgent: text("user_agent"),
    cores: integer("cores"),
    memoryGb: doublePrecision("memory_gb"),
    screen: text("screen"),
    timezone: text("timezone"),
    cpuTdpW: doublePrecision("cpu_tdp_w").notNull().default(65),
    gpuTdpW: doublePrecision("gpu_tdp_w").notNull().default(8),
    displayW: doublePrecision("display_w").notNull().default(22),
    batteryWh: doublePrecision("battery_wh").notNull().default(50),
    hasBattery: boolean("has_battery").notNull().default(false),
    /** agent — оценка ПК; plug — замер облака Tuya или Shelly. */
    source: text("source").notNull().default("agent"),
    vendor: text("vendor"),
    externalId: text("external_id"),
    powerLimitW: doublePrecision("power_limit_w"),
    limitLatched: boolean("limit_latched").notNull().default(false),
    lastCutoffAt: timestamp("last_cutoff_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("devices_last_seen_idx").on(t.lastSeen)],
);

/**
 * Один замер. `watts` — мгновенная мощность из розетки, `kwh` — энергия,
 * набранная с предыдущего замера, `cost` — её стоимость по действующему
 * тарифу и временной зоне на момент замера.
 */
export const samples = pgTable(
  "samples",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    watts: doublePrecision("watts").notNull().default(0),
    batteryWatts: doublePrecision("battery_watts"),
    kwh: doublePrecision("kwh").notNull().default(0),
    batteryKwh: doublePrecision("battery_kwh").notNull().default(0),
    cpuLoad: doublePrecision("cpu_load").notNull().default(0),
    gpuLoad: doublePrecision("gpu_load").notNull().default(0),
    fps: doublePrecision("fps"),
    loopLagMs: doublePrecision("loop_lag_ms"),
    longTaskMs: doublePrecision("long_task_ms"),
    heapMb: doublePrecision("heap_mb"),
    batteryLevel: doublePrecision("battery_level"),
    charging: boolean("charging"),
    screenOn: boolean("screen_on"),
    netType: text("net_type"),
    downlinkMbps: doublePrecision("downlink_mbps"),
    rttMs: doublePrecision("rtt_ms"),
    tariffZone: text("tariff_zone"),
    tariffRate: doublePrecision("tariff_rate").notNull().default(0),
    cost: doublePrecision("cost").notNull().default(0),
  },
  (t) => [index("samples_ts_idx").on(t.ts), index("samples_device_ts_idx").on(t.deviceId, t.ts)],
);

/** Срабатывание порога розетки. Строка пишется до попытки Telegram и webhook. */
export const alerts = pgTable("alerts", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  deviceId: text("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  watts: doublePrecision("watts").notNull(),
  limitW: doublePrecision("limit_w").notNull(),
  telegramOk: boolean("telegram_ok").notNull().default(false),
  webhookOk: boolean("webhook_ok").notNull().default(false),
});

/** Действующие тарифы (строка на каждую временную зону каждого вида учёта). */
export const tariffRates = pgTable("tariff_rates", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull(),
  profileTitle: text("profile_title").notNull(),
  clause: text("clause").notNull(),
  legal: text("legal").notNull(),
  kind: text("kind").notNull(), // single | two | three
  zoneId: text("zone_id").notNull(), // flat | night | peak | day
  zoneLabel: text("zone_label").notNull(),
  rate: doublePrecision("rate").notNull(),
  fromHour: integer("from_hour"),
  toHour: integer("to_hour"),
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to"),
});

/** Сырые замеры и статистика по ним живут в PostgreSQL этот срок. */
export const SAMPLE_RETENTION_DAYS = 365;

/** Глобальные настройки расчёта стоимости. */
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  profileId: text("profile_id").notNull().default("gas"),
  kind: text("kind").notNull().default("single"),
  retentionDays: integer("retention_days").notNull().default(SAMPLE_RETENTION_DAYS),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** История одноставочного тарифа для населения (динамика 2020–2026). */
export const tariffHistory = pgTable("tariff_history", {
  year: integer("year").primaryKey(),
  rate: doublePrecision("rate").notNull(),
  note: text("note"),
});

export type Alert = typeof alerts.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type Sample = typeof samples.$inferSelect;
export type TariffRateRow = typeof tariffRates.$inferSelect;
export type AppSettings = typeof appSettings.$inferSelect;
