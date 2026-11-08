export interface ShellyPlug {
  vendor: "shelly";
  externalId: string;
  name: string;
  online: boolean;
  watts: number;
  relayOn: boolean | null;
}

function server() {
  const authKey = process.env.SHELLY_AUTH_KEY?.trim() ?? "";
  const host = (process.env.SHELLY_SERVER?.trim() ?? "").replace(/\/$/, "");
  if (!authKey || !host) return null;
  return { authKey, host };
}

export function shellyConfigured() {
  return Boolean(process.env.SHELLY_AUTH_KEY?.trim() && process.env.SHELLY_SERVER?.trim());
}

async function post(path: string, fields: Record<string, string>) {
  const cfg = server();
  if (!cfg) throw new Error("Shelly: нет SHELLY_AUTH_KEY или SHELLY_SERVER");
  const body = new URLSearchParams({ auth_key: cfg.authKey, ...fields });
  const response = await fetch(`${cfg.host}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as { isok?: boolean; errors?: unknown; data?: unknown };
  if (!response.ok || json.isok === false) {
    throw new Error(`Shelly: ${response.status}`);
  }
  return json.data;
}

function reading(status: Record<string, unknown> | null): { watts: number; relayOn: boolean | null } {
  const gen2 = status?.["switch:0"];
  if (gen2 && typeof gen2 === "object") {
    const sw = gen2 as { apower?: number; output?: boolean };
    return {
      watts: Math.max(0, Number(sw.apower) || 0),
      relayOn: typeof sw.output === "boolean" ? sw.output : null,
    };
  }
  const meters = status?.meters;
  const relays = status?.relays;
  const meter = Array.isArray(meters) ? (meters[0] as { power?: number } | undefined) : undefined;
  const relay = Array.isArray(relays) ? (relays[0] as { ison?: boolean } | undefined) : undefined;
  return {
    watts: Math.max(0, Number(meter?.power) || 0),
    relayOn: typeof relay?.ison === "boolean" ? relay.ison : null,
  };
}

export async function listShellyPlugs(): Promise<ShellyPlug[]> {
  const data = (await post("/device/all_status", {})) as { devices_status?: Record<string, unknown> } | null;
  const bag = data?.devices_status ?? {};
  return Object.entries(bag).map(([externalId, raw]) => {
    const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const info = (row._dev_info && typeof row._dev_info === "object" ? row._dev_info : {}) as { name?: string };
    const deviceStatus = (row.device_status && typeof row.device_status === "object" ? row.device_status : row) as Record<string, unknown>;
    const live = reading(deviceStatus);
    return {
      vendor: "shelly" as const,
      externalId,
      name: String(info.name || externalId).slice(0, 48),
      online: row.online !== false,
      watts: live.watts,
      relayOn: live.relayOn,
    };
  });
}

export async function readShellyPlug(externalId: string) {
  const data = (await post("/device/status", { id: externalId })) as { device_status?: Record<string, unknown> } | null;
  const status = data?.device_status ?? (data as Record<string, unknown> | null);
  return reading(status);
}

export async function turnOffShelly(externalId: string) {
  await post("/device/relay/control", { id: externalId, channel: "0", turn: "off" });
}
