import { sql } from "drizzle-orm";
import { db } from "@/db";
import { samples } from "@/db/schema";
import { getDashboard } from "@/lib/dashboard";
import { Dashboard } from "@/components/Dashboard";
import { Footer } from "@/components/Footer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Page() {
  const data = await getDashboard(15);

  let sampleCount = 0;
  try {
    const res = await db.execute(sql`SELECT COUNT(*)::int AS c FROM ${samples}`);
    const rows = (res as unknown as { rows: { c: number }[] }).rows;
    sampleCount = Number(rows?.[0]?.c ?? 0);
  } catch {
    sampleCount = 0;
  }

  return (
    <>
      <Dashboard initial={data} />
      <Footer deviceCount={data.devices.length} sampleCount={sampleCount} />
    </>
  );
}
