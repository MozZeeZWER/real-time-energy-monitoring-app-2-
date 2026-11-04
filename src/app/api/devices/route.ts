import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { devices, samples } from "@/db/schema";
import { upsertDevice } from "@/lib/store";
import type { DeviceKind } from "@/lib/power-model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const rows = await db.select().from(devices).orderBy(desc(devices.lastSeen)).limit(50);
  return Response.json({ devices: rows });
}

export async function PATCH(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const id = String(body.id ?? "").trim().slice(0, 64);
  if (!id) return Response.json({ ok: false, error: "id_required" }, { status: 400 });

  const kindRaw = body.kind ? String(body.kind) : undefined;
  const kind: DeviceKind | undefined =
    kindRaw === "laptop" || kindRaw === "desktop" || kindRaw === "other" ? kindRaw : undefined;

  await upsertDevice({
    id,
    name: body.name ? String(body.name).slice(0, 48) : undefined,
    kind,
    cpuTdpW: typeof body.cpuTdpW === "number" ? Math.min(500, Math.max(3, body.cpuTdpW)) : undefined,
    gpuTdpW: typeof body.gpuTdpW === "number" ? Math.min(900, Math.max(0, body.gpuTdpW)) : undefined,
    displayW: typeof body.displayW === "number" ? Math.min(300, Math.max(0, body.displayW)) : undefined,
    batteryWh: typeof body.batteryWh === "number" ? Math.min(400, Math.max(0, body.batteryWh)) : undefined,
  });

  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ ok: false, error: "id_required" }, { status: 400 });
  await db.delete(samples).where(sql`${samples.deviceId} = ${id}`);
  await db.delete(devices).where(sql`${devices.id} = ${id}`);
  return Response.json({ ok: true });
}
