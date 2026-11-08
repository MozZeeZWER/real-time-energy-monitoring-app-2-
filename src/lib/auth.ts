import { createHash, timingSafeEqual } from "node:crypto";

const HEADER: Record<"ADMIN_SECRET" | "INGEST_SECRET", string> = {
  ADMIN_SECRET: "x-admin-secret",
  INGEST_SECRET: "x-ingest-secret",
};

export type SecretEnv = keyof typeof HEADER;

/**
 * Возвращает отказ, если заголовок не совпал с секретом из окружения сервера.
 * null означает, что маршрут может продолжать работу.
 */
export function denyUnless(req: Request, envName: SecretEnv): Response | null {
  const expected = process.env[envName]?.trim() ?? "";
  if (!expected) {
    const error = envName === "ADMIN_SECRET" ? "admin_secret_unconfigured" : "ingest_secret_unconfigured";
    return Response.json({ ok: false, error }, { status: 503 });
  }
  const provided = req.headers.get(HEADER[envName])?.trim() ?? "";
  if (!sameSecret(provided, expected)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}

function sameSecret(provided: string, expected: string): boolean {
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}
