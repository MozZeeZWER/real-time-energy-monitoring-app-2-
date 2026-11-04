import {
  estimatePower,
  energyKwh,
  type DeviceSpec,
  type LoadSnapshot,
  type PowerBreakdown,
} from "@/lib/power-model";

interface BatteryLike {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  addEventListener: (type: string, cb: () => void) => void;
}

interface ConnectionLike {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

export interface Reading {
  at: number;
  cpuLoad: number;
  gpuLoad: number;
  fps: number;
  loopLagMs: number;
  longTaskMs: number;
  heapMb: number | null;
  batteryLevel: number | null;
  batteryWatts: number;
  charging: boolean;
  screenOn: boolean;
  netType: string | null;
  downlinkMbps: number | null;
  rttMs: number | null;
  power: PowerBreakdown;
  gridWatts: number;
  batteryDrainWatts: number;
  calibratedCpu: number;
}

export interface CollectorOptions {
  spec: DeviceSpec;
  /** Поправка на фоновые процессы ОС, которые браузер не видит, 0..1. */
  backgroundBias: number;
  onReading?: (r: Reading) => void;
  tickMs?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ema = (prev: number, next: number, alpha: number) => prev * (1 - alpha) + next * alpha;

/**
 * Снимает реальные показатели машины из браузера:
 *  • загрузка CPU — лаг таймеров, long tasks (PerformanceObserver), кадровое время;
 *  • GPU/рендер — кадровое время относительно откалиброванного базового;
 *  • батарея — Battery Status API: уровень, заряд/разряд, расчётная мощность в Вт;
 *  • память — performance.memory (Chromium);
 *  • сеть — Network Information API.
 */
export class EnergyCollector {
  private opts: CollectorOptions;
  private rafId = 0;
  private lagTimer: ReturnType<typeof setInterval> | null = null;
  private computeTimer: ReturnType<typeof setInterval> | null = null;
  private batteryTimer: ReturnType<typeof setInterval> | null = null;
  private longObserver: PerformanceObserver | null = null;

  private frames: number[] = [];
  private lastFrame = 0;
  private longTaskMs = 0;
  private lags: number[] = [];
  private lastTick = 0;

  private baselineFrameMs = 16.7;
  private baselineCalibrated = false;

  private battery: BatteryLike | null = null;
  private lastBattery: { level: number; at: number } | null = null;
  private batteryWatts = 0;

  private cpuLoad = 0.04;
  private gpuLoad = 0.02;
  private fps = 60;
  private running = false;
  private stressUntil = 0;
  private stressRaf = 0;

  latest: Reading | null = null;

  constructor(opts: CollectorOptions) {
    this.opts = opts;
  }

  setSpec(spec: DeviceSpec) {
    this.opts.spec = spec;
  }

  setBackgroundBias(v: number) {
    this.opts.backgroundBias = clamp(v, 0, 1);
  }

  async start() {
    if (this.running || typeof window === "undefined") return;
    this.running = true;
    this.lastFrame = performance.now();
    this.lastTick = performance.now();

    const loop = (t: number) => {
      const dt = t - this.lastFrame;
      this.lastFrame = t;
      if (dt > 0 && dt < 500) this.frames.push(dt);
      if (this.frames.length > 240) this.frames.splice(0, this.frames.length - 240);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);

    // Лаг таймера: насколько реальный интервал длиннее запланированного.
    this.lagTimer = setInterval(() => {
      const now = performance.now();
      const drift = now - this.lastTick - 250;
      this.lastTick = now;
      if (Number.isFinite(drift)) {
        this.lags.push(Math.max(0, drift));
        if (this.lags.length > 120) this.lags.shift();
      }
    }, 250);

    if (typeof PerformanceObserver !== "undefined") {
      try {
        this.longObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) this.longTaskMs += entry.duration;
        });
        this.longObserver.observe({ entryTypes: ["longtask"] });
      } catch {
        this.longObserver = null;
      }
    }

    this.computeTimer = setInterval(() => this.compute(), this.opts.tickMs ?? 500);

    await this.initBattery();
    this.batteryTimer = setInterval(() => void this.pollBattery(), 4000);
    this.compute();
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.lagTimer) clearInterval(this.lagTimer);
    if (this.computeTimer) clearInterval(this.computeTimer);
    if (this.batteryTimer) clearInterval(this.batteryTimer);
    this.longObserver?.disconnect();
    this.longObserver = null;
    this.lagTimer = null;
    this.computeTimer = null;
    this.batteryTimer = null;
  }

  /** Короткая управляемая нагрузка, чтобы увидеть реакцию датчиков вживую. */
  runStress(seconds = 6) {
    this.stressUntil = Date.now() + seconds * 1000;
    const chunk = () => {
      if (Date.now() > this.stressUntil) return;
      const end = performance.now() + 45;
      let acc = 0;
      while (performance.now() < end) {
        acc += Math.sqrt(Math.random() * 9999) * Math.sin(acc || 1);
      }
      // Небольшая нагрузка на композитор через принудительный reflow-heavy рендер.
      void acc;
      this.stressRaf = requestAnimationFrame(chunk);
    };
    this.stressRaf = requestAnimationFrame(chunk);
  }

  get stressing() {
    return Date.now() < this.stressUntil;
  }

  private async initBattery() {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    if (typeof nav.getBattery !== "function") return;
    try {
      this.battery = await nav.getBattery();
      this.lastBattery = { level: this.battery.level, at: performance.now() };
      const onChange = () => void this.pollBattery();
      for (const evt of ["levelchange", "chargingchange", "chargingtimechange", "dischargingtimechange"]) {
        this.battery?.addEventListener(evt, onChange);
      }
    } catch {
      this.battery = null;
    }
  }

  /**
   * Chromium на десктопе отдаёт «фейковую» батарею (100 %, charging, dischargingTime = Infinity).
   * Отличаем её, чтобы не показывать кольцо батареи на стационарном ПК.
   */
  private batteryPlausible(): boolean {
    const b = this.battery;
    if (!b) return false;
    const noDischarge = !Number.isFinite(b.dischargingTime);
    const noCharge = !Number.isFinite(b.chargingTime) || b.chargingTime === 0;
    return !(b.level >= 0.999 && b.charging && noDischarge && noCharge);
  }

  /** Реальная мощность заряда/разряда по изменению уровня и по времени до разряда. */
  private async pollBattery() {
    if (!this.battery) {
      await this.initBattery();
    }
    const b = this.battery;
    if (!b || !this.batteryPlausible()) return;

    const now = performance.now();
    const capacity = Math.max(5, this.opts.spec.batteryWh || 50);
    let measured = this.batteryWatts;

    if (this.lastBattery) {
      const dtHours = (now - this.lastBattery.at) / 3_600_000;
      const deltaWh = (b.level - this.lastBattery.level) * capacity;
      if (dtHours > 0.002 && Math.abs(deltaWh) > 0.01) {
        measured = deltaWh / dtHours; // >0 заряд, <0 разряд
      } else if (!b.charging && Number.isFinite(b.dischargingTime) && b.dischargingTime > 60) {
        measured = -(b.level * capacity) / (b.dischargingTime / 3600);
      } else if (b.charging && Number.isFinite(b.chargingTime) && b.chargingTime > 60) {
        measured = ((1 - b.level) * capacity) / (b.chargingTime / 3600);
      }
    }
    this.batteryWatts = ema(this.batteryWatts, measured, 0.35);
    this.lastBattery = { level: b.level, at: now };
  }

  private compute() {
    const frames = this.frames;
    const avgFrame = frames.length ? frames.reduce((a, b) => a + b, 0) / frames.length : 16.7;
    const sorted = [...frames].sort((a, b) => a - b);
    const p10 = sorted[Math.floor(sorted.length * 0.1)] ?? avgFrame;
    const fps = avgFrame > 0 ? clamp(1000 / avgFrame, 0, 240) : 0;

    if (!this.baselineCalibrated && frames.length > 60) {
      this.baselineFrameMs = clamp(p10, 4, 33);
      this.baselineCalibrated = true;
    }

    const windowMs = 500;
    const longRatio = clamp(this.longTaskMs / windowMs, 0, 1);
    this.longTaskMs = 0;

    const medianLag = this.lags.length
      ? [...this.lags].sort((a, b) => a - b)[Math.floor(this.lags.length / 2)]
      : 0;
    this.lags = [];
    const lagRatio = clamp(medianLag / 35, 0, 1);

    const frameStress = clamp((avgFrame - this.baselineFrameMs) / (this.baselineFrameMs * 1.8), 0, 1);
    const jitter = sorted.length > 8 ? (sorted[sorted.length - 1] - p10) / 100 : 0;

    const raw = clamp(
      Math.max(longRatio, lagRatio * 0.55 + frameStress * 0.35 + longRatio * 0.3) + jitter * 0.15,
      0.015,
      1,
    );

    // Поправка на фоновые процессы ОС (браузер их не видит).
    const calibrated = clamp(raw * (1 + this.opts.backgroundBias * 0.6) + this.opts.backgroundBias * 0.08, 0.01, 1);
    this.cpuLoad = ema(this.cpuLoad, calibrated, 0.4);

    const gpuRaw = clamp(frameStress * 0.75 + fpsDrop(fps) * 0.4 + jitter, 0.005, 1);
    this.gpuLoad = ema(this.gpuLoad, gpuRaw, 0.3);
    this.fps = ema(this.fps, fps, 0.5);

    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const heapMb = memory?.usedJSHeapSize ? memory.usedJSHeapSize / 1_048_576 : null;
    const conn = (navigator as Navigator & { connection?: ConnectionLike }).connection;

    const plausible = this.batteryPlausible();
    const batteryLevel = plausible && this.battery ? clamp(this.battery.level, 0, 1) : null;
    const charging = Boolean(plausible && this.battery?.charging);
    const batteryWatts = plausible ? this.batteryWatts : 0;
    const screenOn = typeof document === "undefined" ? true : document.visibilityState === "visible";

    const load: LoadSnapshot = {
      cpuLoad: this.cpuLoad,
      gpuLoad: this.gpuLoad,
      screenOn,
      charging,
      batteryWatts,
      online: typeof navigator === "undefined" ? true : navigator.onLine,
    };

    const power = estimatePower(this.opts.spec, load);
    const reading: Reading = {
      at: Date.now(),
      cpuLoad: this.cpuLoad,
      gpuLoad: this.gpuLoad,
      fps: Math.round(this.fps * 10) / 10,
      loopLagMs: Math.round(medianLag * 10) / 10,
      longTaskMs: Math.round(longRatio * windowMs),
      heapMb: heapMb === null ? null : Math.round(heapMb * 10) / 10,
      batteryLevel,
      batteryWatts: Math.round(this.batteryWatts * 10) / 10,
      charging,
      screenOn,
      netType: conn?.effectiveType ?? null,
      downlinkMbps: conn?.downlink ?? null,
      rttMs: conn?.rtt ?? null,
      power,
      gridWatts: power.gridWatts,
      batteryDrainWatts: power.batteryWatts,
      calibratedCpu: calibrated,
    };
    this.latest = reading;
    this.opts.onReading?.(reading);
    this.frames = [];
  }
}

function fpsDrop(fps: number): number {
  if (fps >= 55) return 0;
  return clamp((55 - fps) / 40, 0, 1);
}

export { energyKwh };
