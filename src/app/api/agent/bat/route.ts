import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getOrigin(req: NextRequest): string {
  const xfHost = req.headers.get("x-forwarded-host");
  const host = (xfHost || req.headers.get("host") || "").split(",")[0].trim();
  const xfProto = req.headers.get("x-forwarded-proto");
  if (host) {
    const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const proto = xfProto || (isLocal ? "http" : "https");
    return (proto + "://" + host).replace(/\/$/, "");
  }
  return (req.nextUrl?.origin || "http://127.0.0.1:3000").replace(/\/$/, "");
}

export async function GET(req: NextRequest) {
  const origin = getOrigin(req);
  const url = origin + "/api/agent/powershell";
  const bat = [
    "@echo off",
    "title Energy Monitor Agent",
    "echo.",
    "echo  Energy Monitor agent",
    "echo  Keep this window open. Stop: Ctrl+C",
    "echo.",
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"irm '" + url + "' | iex\"",
    "echo.",
    "pause",
    "",
  ].join("\r\n");

  return new Response(bat, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream; charset=us-ascii",
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="energy-agent.bat"',
    },
  });
}