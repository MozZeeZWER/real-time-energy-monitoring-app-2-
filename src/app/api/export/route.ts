import { gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { devices, samples } from "@/db/schema";
import { REGION } from "@/lib/tariffs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.min(60, Math.max(1, Number(url.searchParams.get("days") ?? 7) || 7));
  const since = new Date(Date.now() - days * 86_400_000);

  const rows = await db
    .select({
      ts: samples.ts,
      device: devices.name,
      kind: devices.kind,
      watts: samples.watts,
      kwh: samples.kwh,
      batteryWatts: samples.batteryWatts,
      cpuLoad: samples.cpuLoad,
      gpuLoad: samples.gpuLoad,
      batteryLevel: samples.batteryLevel,
      zone: samples.tariffZone,
      rate: samples.tariffRate,
      cost: samples.cost,
    })
    .from(samples)
    .innerJoin(devices, sql`${devices.id} = ${samples.deviceId}`)
    .where(gte(samples.ts, since))
    .orderBy(samples.ts)
    .limit(50_000);

  const header = [
    "ts_minsk",
    "device",
    "kind",
    "watts",
    "kwh",
    "battery_watts",
    "cpu_load",
    "gpu_load",
    "battery_level",
    "tariff_zone",
    "rate_byn",
    "cost_byn",
  ].join(";");

  const fmtTs = (d: Date) =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: REGION.timezone, dateStyle: "short", timeStyle: "medium" }).format(d);

  const body = rows
    .map((r) =>
      [
        fmtTs(r.ts),
        `"${(r.device ?? "").replace(/"/g, "'")}"`,
        r.kind ?? "",
        r.watts.toFixed(2),
        r.kwh.toFixed(7),
        r.batteryWatts == null ? "" : r.batteryWatts.toFixed(2),
        r.cpuLoad.toFixed(4),
        r.gpuLoad.toFixed(4),
        r.batteryLevel == null ? "" : r.batteryLevel.toFixed(3),
        r.zone ?? "",
        r.rate.toFixed(4),
        r.cost.toFixed(7),
      ].join(";"),
    )
    .join("\n");

  return new Response(`\uFEFF${header}\n${body}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="energy-gomel-${days}d.csv"`,
      "cache-control": "no-store",
    },
  });
}
