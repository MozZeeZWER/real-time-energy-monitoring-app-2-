import { denyUnless } from "@/lib/auth";
import { TARIFF_PROFILES, availableKinds, zonesFor, type TariffKind } from "@/lib/tariffs";
import { getSettings, updateSettings } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const settings = await getSettings();
  return Response.json({
    ...settings,
    zones: zonesFor(settings.profileId, settings.kind),
    availableKinds: availableKinds(settings.profileId),
    profiles: TARIFF_PROFILES.map((p) => ({
      id: p.id,
      title: p.title,
      short: p.short,
      clause: p.clause,
      typical: p.typical ?? false,
      kinds: availableKinds(p.id),
    })),
  });
}

export async function PATCH(req: Request) {
  const denied = denyUnless(req, "ADMIN_SECRET");
  if (denied) return denied;

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const profileId = String(body.profileId ?? "gas");
  if (!TARIFF_PROFILES.some((p) => p.id === profileId)) {
    return Response.json({ ok: false, error: "unknown_profile" }, { status: 400 });
  }
  const kindRaw = String(body.kind ?? "single");
  const kind: TariffKind =
    kindRaw === "two" || kindRaw === "three" ? kindRaw : "single";

  try {
    const result = await updateSettings(profileId, kind);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[settings] failed", err);
    return Response.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
}
