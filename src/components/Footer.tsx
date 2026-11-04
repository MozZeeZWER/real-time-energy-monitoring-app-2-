import { ExternalLink, Zap } from "lucide-react";
import { REGION, TARIFF_LEGAL } from "@/lib/tariffs";

const SOURCES = [
  {
    title: "Постановление Совмина РБ № 93 от 25.02.2026",
    href: "https://www.government.by/sites/default/files/resolution/2026-02/93.pdf",
    note: "первоисточник тарифов (PDF)",
  },
  {
    title: "Эталонный правовой портал — текст постановления",
    href: "https://etalonline.by/document/?regnum=C22600093",
    note: "проверка редакции документа",
  },
  {
    title: "Филиал «Энергосбыт» — тарифы для физлиц",
    href: "https://www.energosbyt.by/ru/info-potrebitelyam/fiz-l/tarify",
    note: "разъяснения поставщика",
  },
];

export function Footer({ deviceCount, sampleCount }: { deviceCount: number; sampleCount: number }) {
  return (
    <footer className="relative border-t border-line-soft bg-ink-900/60">
      <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_260px]">
        <div>
          <div className="flex items-center gap-2">
            <Zap size={16} className="fill-volt text-volt" />
            <span className="font-display text-lg font-extrabold uppercase tracking-[0.14em] text-chalk">
              Энергомонтёр
            </span>
          </div>
          <p className="mt-3 max-w-md text-[13px] leading-relaxed text-fog">
            Учебно-практический стенд учёта электроэнергии: телеметрия браузера → PostgreSQL → стоимость в
            белорусских рублях по ставкам, действующим для Гомеля и всей страны с 01.03.2026.
          </p>
          <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-fog-dim">
            {TARIFF_LEGAL}
            <br />
            {REGION.operator} · {REGION.grid}
            <br />
            часовая зона {REGION.timezone} (UTC+3)
          </p>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-fog-dim">источники тарифов</p>
          <ul className="mt-3 space-y-2.5">
            {SOURCES.map((s) => (
              <li key={s.href}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group flex items-start gap-2 text-[13px] leading-snug text-fog transition-colors hover:text-volt"
                >
                  <ExternalLink size={12} className="mt-1 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
                  <span>
                    {s.title}
                    <span className="block font-mono text-[10px] text-fog-dim">{s.note}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-fog-dim">состояние базы</p>
          <dl className="mt-3 space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between border-b border-line-soft pb-1.5">
              <dt className="text-fog-dim">устройств</dt>
              <dd className="text-chalk tnum">{deviceCount}</dd>
            </div>
            <div className="flex justify-between border-b border-line-soft pb-1.5">
              <dt className="text-fog-dim">замеров в базе</dt>
              <dd className="text-chalk tnum">{sampleCount}</dd>
            </div>
            <div className="flex justify-between border-b border-line-soft pb-1.5">
              <dt className="text-fog-dim">интервал опроса</dt>
              <dd className="text-chalk tnum">4 с</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fog-dim">стек</dt>
              <dd className="text-right text-chalk">Next.js · Drizzle · PostgreSQL</dd>
            </div>
          </dl>
          <p className="mt-4 text-[11px] leading-relaxed text-fog-dim">
            Значения мощности — модельная оценка по данным браузера, а не показания сертифицированного прибора
            учёта. Для сверки с квитанцией используйте бытовой ваттметр и калибровку устройства.
          </p>
        </div>
      </div>
    </footer>
  );
}
