import { discoverPlugs, linkPlugs, startPlugPoller } from "@/lib/iot/plugs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  startPlugPoller();
  try {
    const result = await discoverPlugs();
    return Response.json(result);
  } catch (err) {
    console.error("[iot] discover failed", err instanceof Error ? err.message : "error");
    return Response.json({ plugs: [], errors: ["Не удалось прочитать облако"] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: { devices?: unknown } = {};
  try {
    body = (await req.json()) as { devices?: unknown };
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const raw = Array.isArray(body.devices) ? body.devices : [];
  const devices = raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { vendor?: unknown; externalId?: unknown; name?: unknown };
    const vendor = row.vendor === "tuya" || row.vendor === "shelly" ? row.vendor : null;
    const externalId = typeof row.externalId === "string" ? row.externalId.trim() : "";
    if (!vendor || !externalId) return [];
    return [{ vendor, externalId, name: typeof row.name === "string" ? row.name : externalId }];
  });
  if (!devices.length) return Response.json({ ok: false, error: "devices_required" }, { status: 400 });
  const ids = await linkPlugs(devices);
  startPlugPoller();
  return Response.json({ ok: true, ids });
}
