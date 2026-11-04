/**
 * Действующие тарифы на электрическую энергию для населения Республики Беларусь.
 * Источник: Постановление Совета Министров РБ от 25.02.2026 № 93
 * «Об установлении для населения цен на газ, тарифов на электрическую и тепловую энергию».
 * Тарифы устанавливаются едиными по стране, поэтому действуют и в Гомеле
 * (расчётный центр — филиал «Энергосбыт» РУП «Гомельэнерго», ГПО «Белэнерго»).
 */

export type TariffKind = "single" | "two" | "three";
export type ZoneId = "flat" | "night" | "peak" | "day";

export interface ZoneDef {
  id: ZoneId;
  label: string;
  rate: number;
  from: number | null;
  to: number | null;
}

export interface ProfileVersion {
  validFrom: string;
  validTo: string | null;
  kinds: Partial<Record<TariffKind, ZoneDef[]>>;
}

export interface ProfileDef {
  id: string;
  title: string;
  short: string;
  clause: string;
  legal: string;
  typical?: boolean;
  versions: ProfileVersion[];
}

export const REGION = {
  city: "Гомель",
  region: "Гомельская область",
  operator: "РУП «Гомельэнерго» · филиал «Энергосбыт»",
  grid: "ГПО «Белэнерго»",
  timezone: "Europe/Minsk",
  utcOffsetHours: 3,
  currency: "BYN",
} as const;

export const TARIFF_LEGAL =
  "Постановление Совета Министров Республики Беларусь от 25.02.2026 № 93";
export const TARIFF_EFFECTIVE_FROM = "2026-03-01";

const TWO_ZONE_PEAK = { from: 17, to: 22 };
const TWO_ZONE_NIGHT = { from: 22, to: 17 };
const THREE_ZONE_PEAK = { from: 17, to: 23 };
const THREE_ZONE_NIGHT = { from: 23, to: 6 };
const THREE_ZONE_DAY = { from: 6, to: 17 };
const HEATING_NIGHT = { from: 23, to: 6 };

export const TARIFF_PROFILES: ProfileDef[] = [
  {
    id: "gas",
    title: "Квартира с газовой плитой (прочее потребление)",
    short: "Газ · п. 5",
    clause: "п. 5 приложения 2 — электрическая энергия, за исключением указанной в пп. 1–4",
    legal: TARIFF_LEGAL,
    typical: true,
    versions: [
      {
        validFrom: "2026-03-01",
        validTo: null,
        kinds: {
          single: [{ id: "flat", label: "одноставочный тариф", rate: 0.3037, from: null, to: null }],
          two: [
            {
              id: "night",
              label: "минимальных нагрузок (с 22:00 до 17:00)",
              rate: 0.2126,
              ...TWO_ZONE_NIGHT,
            },
            {
              id: "peak",
              label: "максимальных нагрузок (с 17:00 до 22:00)",
              rate: 0.6074,
              ...TWO_ZONE_PEAK,
            },
          ],
          three: [
            {
              id: "night",
              label: "минимальных нагрузок (с 23:00 до 06:00)",
              rate: 0.1822,
              ...THREE_ZONE_NIGHT,
            },
            {
              id: "peak",
              label: "максимальных нагрузок (с 17:00 до 23:00)",
              rate: 0.5467,
              ...THREE_ZONE_PEAK,
            },
            {
              id: "day",
              label: "остальное время суток (с 06:00 до 17:00)",
              rate: 0.2126,
              ...THREE_ZONE_DAY,
            },
          ],
        },
      },
    ],
  },
  {
    id: "electric_stove",
    title: "Дом с электроплитой, без газового оборудования",
    short: "Электроплита · п. 1",
    clause:
      "п. 1 приложения 2 — жилые дома (квартиры), оборудованные электроплитами и не оборудованные газоиспользующим оборудованием",
    legal: TARIFF_LEGAL,
    versions: [
      {
        validFrom: "2026-03-01",
        validTo: null,
        kinds: {
          single: [{ id: "flat", label: "одноставочный тариф", rate: 0.2581, from: null, to: null }],
          two: [
            {
              id: "night",
              label: "минимальных нагрузок (с 22:00 до 17:00)",
              rate: 0.1807,
              ...TWO_ZONE_NIGHT,
            },
            {
              id: "peak",
              label: "максимальных нагрузок (с 17:00 до 22:00)",
              rate: 0.5162,
              ...TWO_ZONE_PEAK,
            },
          ],
          three: [
            {
              id: "night",
              label: "минимальных нагрузок (с 23:00 до 06:00)",
              rate: 0.1549,
              ...THREE_ZONE_NIGHT,
            },
            {
              id: "peak",
              label: "максимальных нагрузок (с 17:00 до 23:00)",
              rate: 0.4646,
              ...THREE_ZONE_PEAK,
            },
            {
              id: "day",
              label: "остальное время суток (с 06:00 до 17:00)",
              rate: 0.1807,
              ...THREE_ZONE_DAY,
            },
          ],
        },
      },
    ],
  },
  {
    id: "heating_no_meter",
    title: "Электроотопление + электроплита, без отдельного счётчика на отопление",
    short: "Отопление · п. 3",
    clause:
      "п. 3 приложения 2 — для нужд отопления и (или) ГВС в домах без централизованного тепло- и газоснабжения, при отсутствии отдельного прибора учёта для отопления",
    legal: TARIFF_LEGAL,
    versions: [
      {
        validFrom: "2026-03-01",
        validTo: "2026-05-31",
        kinds: {
          single: [{ id: "flat", label: "одноставочный тариф", rate: 0.1242, from: null, to: null }],
          two: [
            {
              id: "night",
              label: "минимальных нагрузок (с 23:00 до 6:00)",
              rate: 0.0869,
              ...HEATING_NIGHT,
            },
            { id: "day", label: "остальное время суток", rate: 0.1615, from: null, to: null },
          ],
        },
      },
      {
        validFrom: "2026-06-01",
        validTo: "2026-12-31",
        kinds: {
          single: [{ id: "flat", label: "одноставочный тариф", rate: 0.1263, from: null, to: null }],
          two: [
            {
              id: "night",
              label: "минимальных нагрузок (с 23:00 до 6:00)",
              rate: 0.0884,
              ...HEATING_NIGHT,
            },
            { id: "day", label: "остальное время суток", rate: 0.1642, from: null, to: null },
          ],
        },
      },
    ],
  },
  {
    id: "heating_meter",
    title: "Электроотопление с отдельным прибором учёта",
    short: "Отопление, отд. счётчик · п. 4",
    clause:
      "п. 4 приложения 2 — для нужд отопления и (или) ГВС при наличии отдельного (дополнительного) прибора индивидуального учёта",
    legal: TARIFF_LEGAL,
    versions: [
      {
        validFrom: "2026-03-01",
        validTo: "2026-05-31",
        kinds: {
          single: [
            { id: "flat", label: "одноставочный тариф", rate: 0.0454, from: null, to: null },
          ],
        },
      },
      {
        validFrom: "2026-06-01",
        validTo: "2026-12-31",
        kinds: {
          single: [
            { id: "flat", label: "одноставочный тариф", rate: 0.0487, from: null, to: null },
          ],
        },
      },
    ],
  },
  {
    id: "heating_over5kw",
    title: "Отопление и ГВС, присоединённая мощность электронагревателей более 5 кВт",
    short: "Свыше 5 кВт · п. 2",
    clause:
      "п. 2 приложения 2 — для нужд отопления и горячего водоснабжения с суммарной присоединённой мощностью электронагревательного оборудования более 5 кВт",
    legal: TARIFF_LEGAL,
    versions: [
      {
        validFrom: "2026-03-01",
        validTo: null,
        kinds: {
          two: [
            {
              id: "night",
              label: "минимальных нагрузок (с 23:00 до 6:00)",
              rate: 0.1772,
              ...HEATING_NIGHT,
            },
            { id: "day", label: "остальное время суток", rate: 0.329, from: null, to: null },
          ],
        },
      },
    ],
  },
  {
    id: "full_cost",
    title: "Полное возмещение экономически обоснованных затрат",
    short: "Без субсидии",
    clause:
      "приложение 1 — тарифы на электрическую энергию, обеспечивающие полное возмещение экономически обоснованных затрат",
    legal: TARIFF_LEGAL,
    versions: [
      {
        validFrom: "2026-03-01",
        validTo: null,
        kinds: {
          single: [{ id: "flat", label: "одноставочный тариф", rate: 0.3265, from: null, to: null }],
          two: [
            {
              id: "night",
              label: "минимальных нагрузок (с 22:00 до 17:00)",
              rate: 0.2286,
              ...TWO_ZONE_NIGHT,
            },
            {
              id: "peak",
              label: "максимальных нагрузок (с 17:00 до 22:00)",
              rate: 0.653,
              ...TWO_ZONE_PEAK,
            },
          ],
          three: [
            {
              id: "night",
              label: "минимальных нагрузок (с 23:00 до 06:00)",
              rate: 0.1959,
              ...THREE_ZONE_NIGHT,
            },
            {
              id: "peak",
              label: "максимальных нагрузок (с 17:00 до 23:00)",
              rate: 0.5877,
              ...THREE_ZONE_PEAK,
            },
            {
              id: "day",
              label: "остальное время суток (с 06:00 до 17:00)",
              rate: 0.2286,
              ...THREE_ZONE_DAY,
            },
          ],
        },
      },
    ],
  },
];

/** Динамика одноставочного субсидируемого тарифа для населения, BYN/кВт·ч. */
export const TARIFF_HISTORY = [
  { year: 2020, rate: 0.1012, note: "уровень 2020 года" },
  { year: 2021, rate: 0.1178, note: "+16,4 % за год" },
  { year: 2022, rate: 0.1514, note: "+28,5 % за год" },
  { year: 2023, rate: 0.1904, note: "+25,8 % за год" },
  { year: 2024, rate: 0.2393, note: "+25,7 % за год" },
  { year: 2025, rate: 0.2714, note: "+13,4 % за год" },
  { year: 2026, rate: 0.3037, note: "с 01.03.2026, пост. № 93 (+7 %)" },
];

export const KIND_LABELS: Record<TariffKind, string> = {
  single: "Одноставочный счётчик",
  two: "Двухзонный счётчик",
  three: "Трёхзонный счётчик",
};

export const ZONE_META: Record<ZoneId, { name: string; color: string }> = {
  flat: { name: "круглосуточно", color: "#c8f14a" },
  night: { name: "минимальные нагрузки", color: "#4cc6e8" },
  peak: { name: "максимальные нагрузки", color: "#ff6a4d" },
  day: { name: "остальное время суток", color: "#f2b13c" },
};

function toDate(value: string): number {
  return new Date(`${value}T00:00:00Z`).getTime();
}

export function resolveVersion(profile: ProfileDef, at: Date): ProfileVersion {
  const t = at.getTime();
  const found = profile.versions.find((v) => {
    const from = toDate(v.validFrom);
    const to = v.validTo ? toDate(v.validTo) + 86_400_000 : Number.POSITIVE_INFINITY;
    return t >= from && t < to;
  });
  return found ?? profile.versions[profile.versions.length - 1];
}

export function zonesFor(profileId: string, kind: TariffKind, at: Date = new Date()): ZoneDef[] {
  const profile = TARIFF_PROFILES.find((p) => p.id === profileId) ?? TARIFF_PROFILES[0];
  const version = resolveVersion(profile, at);
  const zones = version.kinds[kind];
  if (zones?.length) return zones;
  return version.kinds.single ?? Object.values(version.kinds)[0] ?? [];
}

export function availableKinds(profileId: string, at: Date = new Date()): TariffKind[] {
  const profile = TARIFF_PROFILES.find((p) => p.id === profileId) ?? TARIFF_PROFILES[0];
  const version = resolveVersion(profile, at);
  return (Object.keys(version.kinds) as TariffKind[]).filter((k) => version.kinds[k]?.length);
}

export function hourInMinsk(at: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: REGION.timezone,
    hour: "2-digit",
    hour12: false,
  });
  const h = Number(fmt.format(at));
  return Number.isFinite(h) ? (h === 24 ? 0 : h) : at.getUTCHours() + 3;
}

export function minuteInMinsk(at: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: REGION.timezone,
    minute: "2-digit",
  });
  return Number(fmt.format(at)) || 0;
}

export function inWindow(hour: number, from: number | null, to: number | null): boolean {
  if (from === null || to === null) return true;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

export function zoneAt(zones: ZoneDef[], at: Date = new Date()): ZoneDef {
  const hour = hourInMinsk(at);
  return zones.find((z) => inWindow(hour, z.from, z.to)) ?? zones[0];
}

export function rateAt(zones: ZoneDef[], at: Date = new Date()): number {
  return zoneAt(zones, at).rate;
}

/** Стоимость энергии (кВт·ч) за интервал с известной ставкой. */
export function costOf(kwh: number, rate: number): number {
  return kwh * rate;
}

export function formatByn(value: number, digits = 4): string {
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatClock(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: REGION.timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(at);
}

export function formatMinskTs(ts: string | Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: REGION.timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(ts));
}
