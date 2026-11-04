/**
 * Модель оценки потребления: браузер не умеет читать счётчик в щитке,
 * поэтому мощность собирается из РЕАЛЬНЫХ измеряемых в браузере величин
 * (загрузка процессора по лагу event-loop и long tasks, кадровое время,
 * состояние батареи Battery Status API, память, сеть) и паспортных
 * характеристик железа, которые задаёт пользователь.
 */

export type DeviceKind = "desktop" | "laptop" | "other";

export interface DeviceSpec {
  kind: DeviceKind;
  cpuTdpW: number;
  gpuTdpW: number;
  displayW: number;
  batteryWh: number;
  hasBattery: boolean;
}

export interface LoadSnapshot {
  cpuLoad: number; // 0..1
  gpuLoad: number; // 0..1
  screenOn: boolean;
  charging: boolean;
  batteryWatts: number; // >0 — заряд, <0 — разряд (измерено Battery Status API)
  online: boolean;
}

export interface PowerBreakdown {
  cpu: number;
  gpu: number;
  display: number;
  platform: number;
  charger: number;
  system: number;
  gridWatts: number;
  batteryWatts: number;
  efficiencyLoss: number;
}

export const DEFAULT_SPECS: Record<DeviceKind, Omit<DeviceSpec, "hasBattery">> = {
  desktop: { kind: "desktop", cpuTdpW: 65, gpuTdpW: 12, displayW: 22, batteryWh: 0 },
  laptop: { kind: "laptop", cpuTdpW: 28, gpuTdpW: 14, displayW: 5, batteryWh: 52 },
  other: { kind: "other", cpuTdpW: 15, gpuTdpW: 4, displayW: 6, batteryWh: 20 },
};

/** Базовое потребление платформы в простое (мат. плата, ОЗУ, накопитель, вентиляторы). */
const PLATFORM_IDLE: Record<DeviceKind, number> = {
  desktop: 38,
  laptop: 5.5,
  other: 4,
};

/** Процессор в простое (пакет CPU, Вт). */
const CPU_IDLE: Record<DeviceKind, number> = {
  desktop: 12,
  laptop: 4.5,
  other: 3,
};

/** КПД блока питания / зарядного устройства (доля потерь уходит в розетку). */
const PSU_EFFICIENCY: Record<DeviceKind, number> = {
  desktop: 0.87,
  laptop: 0.9,
  other: 0.88,
};

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

export function estimatePower(spec: DeviceSpec, load: LoadSnapshot): PowerBreakdown {
  const cpuIdle = CPU_IDLE[spec.kind] ?? 6;
  const platform = (PLATFORM_IDLE[spec.kind] ?? 6) * (load.screenOn ? 1 : 0.85);
  const cpu = cpuIdle + Math.pow(clamp01(load.cpuLoad), 1.35) * Math.max(0, spec.cpuTdpW - cpuIdle);
  const gpu = Math.pow(clamp01(load.gpuLoad), 1.2) * Math.max(0, spec.gpuTdpW);
  const display = load.screenOn ? spec.displayW : spec.displayW * 0.08;
  const system = cpu + gpu + display + platform;
  const efficiencyLoss = system * (1 / (PSU_EFFICIENCY[spec.kind] ?? 0.9) - 1);

  // Заряд аккумулятора: сколько зарядное устройство дополнительно тянет из сети.
  const charger = load.charging && spec.hasBattery ? Math.max(0, load.batteryWatts) * 1.12 : 0;

  let gridWatts = system + efficiencyLoss + charger;
  let batteryWatts = 0;

  if (spec.hasBattery && !load.charging && load.batteryWatts < 0) {
    // Питание от батареи — из розетки устройство не берёт ничего.
    batteryWatts = Math.abs(load.batteryWatts);
    gridWatts = 0;
  } else if (spec.hasBattery && !load.charging && spec.kind !== "desktop") {
    // Батарея есть, но Browser API молчит (нет разряда/заряда) — считаем от сети.
    batteryWatts = 0;
  }

  return {
    cpu: round1(cpu),
    gpu: round1(gpu),
    display: round1(display),
    platform: round1(platform),
    charger: round1(charger),
    efficiencyLoss: round1(efficiencyLoss),
    system: round1(system + efficiencyLoss),
    gridWatts: round1(gridWatts),
    batteryWatts: round1(batteryWatts),
  };
}

/** Энергия (кВт·ч) за интервал при заданной мощности. */
export function energyKwh(watts: number, ms: number): number {
  if (ms <= 0 || !Number.isFinite(watts)) return 0;
  return (watts * ms) / 3_600_000 / 1000;
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Перевод сырого user-agent в понятное имя браузера/платформы. */
export function parseAgent(ua: string): { browser: string; platform: string } {
  let browser = "Браузер";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua)) browser = "Opera";
  else if (/YaBrowser/.test(ua)) browser = "Яндекс Браузер";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let platform = "Неизвестно";
  if (/Windows NT 10/.test(ua)) platform = "Windows 10/11";
  else if (/Windows/.test(ua)) platform = "Windows";
  else if (/Mac OS X|macOS/.test(ua)) platform = "macOS";
  else if (/Android/.test(ua)) platform = "Android";
  else if (/iPhone|iPad/.test(ua)) platform = "iOS";
  else if (/Linux/.test(ua)) platform = "Linux";

  const chromeMatch = ua.match(/Chrome\/(\d+)/);
  if (chromeMatch) browser = `${browser} ${chromeMatch[1]}`;
  return { browser, platform };
}

export function guessDeviceKind(ua: string, hasBattery: boolean): DeviceKind {
  if (hasBattery) return "laptop";
  if (/Mobi|Android|iPhone/.test(ua)) return "other";
  return "desktop";
}

export const DEVICE_KIND_LABEL: Record<DeviceKind, string> = {
  desktop: "Стационарный ПК",
  laptop: "Ноутбук",
  other: "Мобильное устройство",
};
