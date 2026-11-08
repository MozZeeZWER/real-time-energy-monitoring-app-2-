/** Замер розетки пишет только опросчик. HTTP-маршрут этот признак не передаёт. */
export function plugWriteForbidden(source: string | null | undefined, writer?: "poller"): boolean {
  return source === "plug" && writer !== "poller";
}
