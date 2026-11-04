import { ingest, type IngestPayload } from "@/lib/store";
import { DEFAULT_SPECS, type DeviceKind } from "@/lib/power-model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function num(v: unknown, fallback = 0): number {
  const parsed = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const parsed = num(v, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * First arg = 0-1 fraction (cpuLoad). Rest = 0-100 percents (cpu, cpuPercent).
 * Windows agent sends 1 meaning 1%, not 100%.
 */
function asLoad01(fraction: unknown, ...percents: unknown[]): number {
  for (const v of percents) {
    const n = nullableNum(v);
    if (n === null) continue;
    if (n > 1) return Math.min(1, Math.max(0, n / 100));
    if (n === 1) return 0.01;
    if (n > 0) return Math.min(1, n);
  }
  const f = nullableNum(fraction);
  if (f === null) return 0;
  if (f > 1) return Math.min(1, Math.max(0, f / 100));
  return Math.min(1, Math.max(0, f));
}

function asBattery01(...candidates: unknown[]): number | null {
  for (const v of candidates) {
    if (v === null || v === undefined || v === "") continue;
    let n = num(v, Number.NaN);
    if (!Number.isFinite(n)) continue;
    if (n > 1) n = n / 100;
    return Math.min(1, Math.max(0, n));
  }
  return null;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const deviceId = String(body.deviceId ?? "").trim().slice(0, 64);
  if (!deviceId) {
    return Response.json({ ok: false, error: "device_id_required" }, { status: 400 });
  }

  const kindRaw = String(body.kind ?? "desktop");
  const kind: DeviceKind =
    kindRaw === "laptop" || kindRaw === "other" ? kindRaw : "desktop";
  const defaults = DEFAULT_SPECS[kind];
  const spec = (body.spec ?? {}) as Record<string, unknown>;
  const meta = (body.meta ?? {}) as Record<string, unknown>;

  const rxKbps = nullableNum(body.netRxKbps) ?? nullableNum(body.RxKbps);
  const downlinkFromKbps = rxKbps !== null ? rxKbps / 1000 : null;
  const downlink =
    nullableNum(body.downlinkMbps) ??
    nullableNum(body.downlink) ??
    downlinkFromKbps;

  const netTypeRaw = body.netType ? String(body.netType).slice(0, 16) : "";
  const netType = netTypeRaw || (downlink !== null ? "wifi" : null);

  const payload: IngestPayload = {
    deviceId,
    name: body.name ? String(body.name).slice(0, 48) : undefined,
    kind,
    spec: {
      cpuTdpW: Math.min(500, Math.max(3, num(spec.cpuTdpW, defaults.cpuTdpW))),
      gpuTdpW: Math.min(900, Math.max(0, num(spec.gpuTdpW, defaults.gpuTdpW))),
      displayW: Math.min(300, Math.max(0, num(spec.displayW, defaults.displayW))),
      batteryWh: Math.min(400, Math.max(0, num(spec.batteryWh, defaults.batteryWh))),
    },
    meta: {
      userAgent: meta.userAgent
        ? String(meta.userAgent).slice(0, 300)
        : body.userAgent
          ? String(body.userAgent).slice(0, 300)
          : "EnergyAgent-PowerShell",
      cores: nullableNum(meta.cores) ?? nullableNum(body.cores) ?? undefined,
      memoryGb:
        nullableNum(meta.memoryGb) ??
        nullableNum(body.memoryGb) ??
        (nullableNum(body.memTotalMb) !== null
          ? Math.max(1, Math.round((nullableNum(body.memTotalMb) as number) / 1024))
          : undefined),
      screen: meta.screen
        ? String(meta.screen).slice(0, 40)
        : body.screen
          ? String(body.screen).slice(0, 40)
          : undefined,
      timezone: meta.timezone ? String(meta.timezone).slice(0, 60) : "Europe/Minsk",
    },
    ts: typeof body.ts === "string" ? body.ts : undefined,
    watts: Math.min(5000, Math.max(0, num(body.watts ?? body.power, 0))),
    batteryWatts: nullableNum(body.batteryWatts),
    cpuLoad: asLoad01(body.cpuLoad, body.cpu, body.cpuPercent),
    gpuLoad: asLoad01(body.gpuLoad, body.gpu, body.gpuPercent),
    fps: nullableNum(body.fps),
    loopLagMs: nullableNum(body.loopLagMs),
    longTaskMs: nullableNum(body.longTaskMs),
    heapMb: nullableNum(body.heapMb) ?? nullableNum(body.memUsedMb),
    batteryLevel: asBattery01(body.batteryLevel, body.battery),
    charging: typeof body.charging === "boolean" ? body.charging : null,
    screenOn: typeof body.screenOn === "boolean" ? body.screenOn : true,
    netType,
    downlinkMbps: downlink,
    rttMs: nullableNum(body.rttMs),
    intervalMs: Math.min(120_000, Math.max(500, num(body.intervalMs, 5000))),
  };

  try {
    const result = await ingest(payload);
    return Response.json(result);
  } catch (err) {
    console.error("[ingest] failed", err);
    return Response.json({ ok: false, error: "ingest_failed" }, { status: 500 });
  }
}
