import { getDashboard } from "@/lib/dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const minutes = Math.min(180, Math.max(2, Number(url.searchParams.get("window") ?? 30) || 30));
  try {
    const data = await getDashboard(minutes);
    return Response.json(data, {
      headers: { "cache-control": "no-store, max-age=0" },
    });
  } catch (err) {
    console.error("[dashboard] failed", err);
    return Response.json({ ok: false, error: "dashboard_failed" }, { status: 500 });
  }
}
