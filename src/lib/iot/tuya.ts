import { createHash, createHmac, randomUUID } from "crypto";

const EMPTY_BODY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const HOSTS: Record<string, string> = {
  eu: "https://openapi.tuyaeu.com",
  us: "https://openapi.tuyaus.com",
  cn: "https://openapi.tuyacn.com",
  in: "https://openapi.tuyain.com",
};

export interface CloudPlug {
  vendor: "tuya";
  externalId: string;
  name: string;
  online: boolean;
}

export interface PlugReading {
  watts: number;
  relayOn: boolean | null;
}

interface Token {
  accessToken: string;
  uid: string | null;
  exp: number;
}

let cached: Token | null = null;

function env() {
  const accessId = process.env.TUYA_ACCESS_ID?.trim() ?? "";
  const secret = process.env.TUYA_ACCESS_SECRET?.trim() ?? "";
  const region = (process.env.TUYA_REGION?.trim() || "eu").toLowerCase();
  const host = HOSTS[region];
  if (!accessId || !secret) return null;
  if (!host) throw new Error(`Tuya: неизвестный регион ${region}`);
  return { accessId, secret, host };
}

function sign(secret: string, clientId: string, token: string, timestamp: string, nonce: string, method: string, url: string, body: string) {
  const contentHash = body ? createHash("sha256").update(body).digest("hex") : EMPTY_BODY_SHA256;
  const stringToSign = `${method}\n${contentHash}\n\n${url}`;
  const payload = `${clientId}${token}${timestamp}${nonce}${stringToSign}`;
  return createHmac("sha256", secret).update(payload).digest("hex").toUpperCase();
}

async function call(method: "GET" | "POST", path: string, body?: unknown, withToken = true) {
  const cfg = env();
  if (!cfg) throw new Error("Tuya: нет TUYA_ACCESS_ID или TUYA_ACCESS_SECRET");
  const token = withToken ? await accessToken() : "";
  const raw = body === undefined ? "" : JSON.stringify(body);
  const timestamp = Date.now().toString();
  const nonce = randomUUID().replace(/-/g, "");
  const signature = sign(cfg.secret, cfg.accessId, token, timestamp, nonce, method, path, raw);
  const headers: Record<string, string> = {
    client_id: cfg.accessId,
    sign: signature,
    t: timestamp,
    sign_method: "HMAC-SHA256",
    nonce,
    "content-type": "application/json",
  };
  if (withToken) headers.access_token = token;
  const response = await fetch(`${cfg.host}${path}`, { method, headers, body: raw || undefined });
  const json = (await response.json()) as { success?: boolean; msg?: string; result?: unknown };
  if (!json.success) throw new Error(`Tuya: ${String(json.msg || response.status).slice(0, 160)}`);
  return json.result;
}

async function accessToken() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.accessToken;
  const result = (await call("GET", "/v1.0/token?grant_type=1", undefined, false)) as {
    access_token?: string;
    expire_time?: number;
    uid?: string;
  };
  if (!result?.access_token) throw new Error("Tuya: пустой токен");
  cached = {
    accessToken: result.access_token,
    uid: result.uid ?? null,
    exp: Date.now() + Math.max(60, result.expire_time ?? 7200) * 1000,
  };
  return cached.accessToken;
}

function asList(result: unknown): CloudPlug[] {
  const bag = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  const raw = Array.isArray(result) ? result : bag.devices ?? bag.list ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const externalId = String(row.id ?? row.device_id ?? "").trim();
    if (!externalId) return [];
    return [
      {
        vendor: "tuya" as const,
        externalId,
        name: String(row.name ?? row.device_name ?? externalId).slice(0, 48),
        online: row.online !== false && row.is_online !== false,
      },
    ];
  });
}

export function tuyaConfigured() {
  return Boolean(process.env.TUYA_ACCESS_ID?.trim() && process.env.TUYA_ACCESS_SECRET?.trim());
}

export async function listTuyaPlugs(): Promise<CloudPlug[]> {
  const fromProject = asList(await call("GET", "/v1.0/iot-01/associated-users/devices?page_no=1&page_size=50"));
  if (fromProject.length) return fromProject;
  const token = cached;
  if (!token?.uid) return [];
  return asList(await call("GET", `/v1.0/users/${encodeURIComponent(token.uid)}/devices`));
}

/**
 * У розеток Tuya `cur_power` приходит с масштабом 1: значение в десятых долях ватта.
 */
export function readingFromTuyaStatus(result: unknown): PlugReading {
  const rows = Array.isArray(result) ? result : [];
  const values = new Map<string, unknown>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as { code?: string; value?: unknown };
    if (item.code) values.set(item.code, item.value);
  }
  const power = Number(values.get("cur_power") ?? values.get("power"));
  const watts = values.has("cur_power") && Number.isFinite(power) ? power / 10 : Number.isFinite(power) ? power : 0;
  const relay = values.get("switch_1") ?? values.get("switch");
  return {
    watts: Math.max(0, watts),
    relayOn: typeof relay === "boolean" ? relay : null,
  };
}

export async function readTuyaPlug(externalId: string): Promise<PlugReading> {
  const result = await call("GET", `/v1.0/devices/${encodeURIComponent(externalId)}/status`);
  return readingFromTuyaStatus(result);
}

export async function turnOffTuya(externalId: string) {
  const id = encodeURIComponent(externalId);
  try {
    await call("POST", `/v1.0/devices/${id}/commands`, { commands: [{ code: "switch_1", value: false }] });
  } catch {
    await call("POST", `/v1.0/devices/${id}/commands`, { commands: [{ code: "switch", value: false }] });
  }
}
