const STORAGE_KEY = "energy.adminSecret";

export function readAdminSecret(): string {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(STORAGE_KEY) ?? "";
}

export function writeAdminSecret(value: string) {
  window.sessionStorage.setItem(STORAGE_KEY, value);
}

export function adminHeaders(secret: string, extra?: Record<string, string>): HeadersInit {
  return { ...extra, "x-admin-secret": secret };
}

export async function adminFailure(res: Response): Promise<string | null> {
  if (res.status !== 401 && res.status !== 503) return null;
  let error: string | undefined;
  try {
    const json = (await res.json()) as { error?: string };
    error = json.error;
  } catch {
    error = undefined;
  }
  if (error === "unauthorized") return "Ключ дашборда не подошёл";
  if (error === "admin_secret_unconfigured") return "На сервере не задан ADMIN_SECRET";
  return "Запрос отклонён";
}
