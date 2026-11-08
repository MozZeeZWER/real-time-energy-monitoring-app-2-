export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startPlugPoller } = await import("@/lib/iot/plugs");
  startPlugPoller();
}
