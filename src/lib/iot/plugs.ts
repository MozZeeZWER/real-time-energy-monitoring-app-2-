import { db } from "@/db";
import { alerts, devices } from "@/db/schema";
import { ensureSeed, ingest } from "@/lib/store";
import { deliverAlert } from "@/lib/iot/notify";
import { listShellyPlugs, readShellyPlug, shellyConfigured, turnOffShelly } from "@/lib/iot/shelly";
import { listTuyaPlugs, readTuyaPlug, tuyaConfigured, turnOffTuya } from "@/lib/iot/tuya";
import { and, eq, sql } from "drizzle-orm";

export interface ListedPlug {
  vendor: "tuya" | "shelly";
  externalId: string;
  name: string;
  online: boolean;
  linked: boolean;
}

const HOLD_MS = 10_000;
const RETRY_MS = 60_000;
const POLL_MS = 8_000;
const overSince = new Map<string, number>();
const lastPoll = new Map<string, number>();

export function plugDeviceId(vendor: string, externalId: string) {
  const clean = externalId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  return `${vendor}-${clean}`.slice(0, 64);
}

export async function discoverPlugs(): Promise<{ plugs: ListedPlug[]; errors: string[] }> {
  await ensureSeed();
  const errors: string[] = [];
  const found: ListedPlug[] = [];

  if (!tuyaConfigured()) errors.push("Tuya: нет TUYA_ACCESS_ID или TUYA_ACCESS_SECRET");
  else {
    try {
      found.push(...(await listTuyaPlugs()).map((plug) => ({ ...plug, linked: false })));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Tuya: ошибка списка");
    }
  }

  if (!shellyConfigured()) errors.push("Shelly: нет SHELLY_AUTH_KEY или SHELLY_SERVER");
  else {
    try {
      found.push(...(await listShellyPlugs()).map((plug) => ({ ...plug, linked: false })));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Shelly: ошибка списка");
    }
  }

  const linkedRows = await db
    .select({ vendor: devices.vendor, externalId: devices.externalId })
    .from(devices)
    .where(sql`${devices.source} = 'plug'`);
  const linked = new Set(linkedRows.map((row) => `${row.vendor}:${row.externalId}`));

  return {
    plugs: found.map((plug) => ({ ...plug, linked: linked.has(`${plug.vendor}:${plug.externalId}`) })),
    errors,
  };
}

export async function linkPlugs(items: { vendor: "tuya" | "shelly"; externalId: string; name: string }[]) {
  await ensureSeed();
  const saved: string[] = [];
  for (const item of items.slice(0, 24)) {
    const externalId = item.externalId.trim().slice(0, 64);
    if (!externalId) continue;
    const id = plugDeviceId(item.vendor, externalId);
    const name = (item.name || externalId).slice(0, 48);
    await db
      .insert(devices)
      .values({
        id,
        name,
        kind: "other",
        source: "plug",
        vendor: item.vendor,
        externalId,
        platform: item.vendor === "tuya" ? "Tuya Cloud" : "Shelly Cloud",
        browser: "розетка",
      })
      .onConflictDoUpdate({
        target: devices.id,
        set: {
          name,
          source: "plug",
          vendor: item.vendor,
          externalId,
          active: true,
        },
      });
    saved.push(id);
  }
  return saved;
}

async function enforceLimit(input: {
  deviceId: string;
  name: string;
  watts: number;
  relayOn: boolean | null;
  vendor: "tuya" | "shelly";
  externalId: string;
}) {
  const now = Date.now();
  const rows = await db
    .select({
      powerLimitW: devices.powerLimitW,
      limitLatched: devices.limitLatched,
      lastCutoffAt: devices.lastCutoffAt,
    })
    .from(devices)
    .where(eq(devices.id, input.deviceId))
    .limit(1);
  const row = rows[0];
  const limit = row?.powerLimitW;
  if (limit == null || !Number.isFinite(limit)) return;

  if (input.watts <= limit) {
    overSince.delete(input.deviceId);
    if (row?.limitLatched) {
      await db.update(devices).set({ limitLatched: false }).where(eq(devices.id, input.deviceId));
    }
    return;
  }

  const since = overSince.get(input.deviceId) ?? now;
  if (!overSince.has(input.deviceId)) overSince.set(input.deviceId, now);
  if (now - since < HOLD_MS) return;

  const lastCutoff = row?.lastCutoffAt ? row.lastCutoffAt.getTime() : 0;
  const relayClosed = input.relayOn !== false;
  if (relayClosed && now - lastCutoff >= RETRY_MS) {
    try {
      if (input.vendor === "tuya") await turnOffTuya(input.externalId);
      else await turnOffShelly(input.externalId);
    } catch (err) {
      console.error("[plug] cutoff failed", input.deviceId, err instanceof Error ? err.message : "error");
    }
    await db.update(devices).set({ lastCutoffAt: new Date() }).where(eq(devices.id, input.deviceId));
  }

  if (row?.limitLatched) return;
  const text = `Розетка ${input.name}: ${input.watts.toFixed(1)} Вт выше порога ${limit} Вт.`;
  const delivery = await deliverAlert(text);
  await db.insert(alerts).values({
    deviceId: input.deviceId,
    watts: input.watts,
    limitW: limit,
    telegramOk: delivery.telegramOk,
    webhookOk: delivery.webhookOk,
  });
  await db.update(devices).set({ limitLatched: true }).where(eq(devices.id, input.deviceId));
}

export async function pollPlugs() {
  await ensureSeed();
  const rows = await db
    .select({
      id: devices.id,
      name: devices.name,
      vendor: devices.vendor,
      externalId: devices.externalId,
    })
    .from(devices)
    .where(and(sql`${devices.source} = 'plug'`, eq(devices.active, true)));

  for (const row of rows) {
    if ((row.vendor !== "tuya" && row.vendor !== "shelly") || !row.externalId) continue;
    try {
      const now = Date.now();
      const prev = lastPoll.get(row.id);
      lastPoll.set(row.id, now);
      const live = row.vendor === "tuya" ? await readTuyaPlug(row.externalId) : await readShellyPlug(row.externalId);
      await ingest(
        {
          deviceId: row.id,
          watts: live.watts,
          intervalMs: prev ? Math.min(120_000, Math.max(500, now - prev)) : POLL_MS,
          screenOn: true,
          meta: { userAgent: "EnergyPlug/1.0" },
        },
        { preserveIdentity: true },
      );
      await enforceLimit({
        deviceId: row.id,
        name: row.name,
        watts: live.watts,
        relayOn: live.relayOn,
        vendor: row.vendor,
        externalId: row.externalId,
      });
    } catch (err) {
      console.error("[plug] poll failed", row.id, err instanceof Error ? err.message : "error");
    }
  }
}

export function startPlugPoller() {
  const slot = globalThis as typeof globalThis & { __plugPoller?: ReturnType<typeof setInterval> };
  if (slot.__plugPoller) return;
  slot.__plugPoller = setInterval(() => {
    void pollPlugs();
  }, POLL_MS);
  void pollPlugs();
}
