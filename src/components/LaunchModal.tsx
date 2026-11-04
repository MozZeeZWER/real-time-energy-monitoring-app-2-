"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Code2,
  Copy,
  Globe,
  Monitor,
  Package,
  Server,
  Terminal,
  X,
  Zap,
} from "lucide-react";

export function LaunchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"browser" | "powershell" | "linux" | "python" | "server">("browser");
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("http://localhost:3000");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  if (!open) return null;

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    window.setTimeout(() => setCopied(null), 2200);
  };

  const psCmd = `irm ${origin}/api/agent/powershell | iex`;
  const shCmd = `bash <(curl -sSL ${origin}/api/agent/sh)`;
  const pyCmd = `python3 -c "$(curl -sSL ${origin}/api/agent/python)"`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink-950/85 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="panel relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-line p-5 shadow-2xl sm:p-6">
        <header className="flex items-start justify-between gap-4 border-b border-line-soft pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Zap size={18} className="fill-volt text-volt" />
              <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-chalk">
                Варианты запуска и сбора данных
              </h2>
            </div>
            <p className="mt-1 text-sm text-fog">
              Выберите удобный способ мониторинга: прямо в браузере, системным агентом в фоне или локально на сервере.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-fog transition hover:bg-ink-800 hover:text-chalk"
          >
            <X size={20} />
          </button>
        </header>

        {/* Навигация по вкладкам */}
        <div className="mt-4 flex flex-wrap gap-1.5 border-b border-line-soft pb-3 font-mono text-[11px] uppercase">
          {[
            { id: "browser", label: "Вариант 1: Браузер (сейчас)", icon: <Globe size={13} /> },
            { id: "powershell", label: "Windows (PowerShell)", icon: <Terminal size={13} /> },
            { id: "linux", label: "Linux / macOS (Bash)", icon: <Code2 size={13} /> },
            { id: "python", label: "Python 3", icon: <Monitor size={13} /> },
            { id: "server", label: "Развернуть сайт", icon: <Server size={13} /> },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`flex items-center gap-1.5 rounded border px-3 py-1.5 transition ${
                tab === t.id
                  ? "border-volt/60 bg-volt/12 text-volt"
                  : "border-line-soft text-fog hover:border-line hover:text-chalk"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Контент вкладок */}
        <div className="mt-4">
          {tab === "browser" ? (
            <div className="space-y-3.5 text-[13.5px] leading-relaxed text-fog">
              <div className="rounded border border-volt/30 bg-volt/5 p-3.5">
                <p className="font-semibold text-chalk">
                  ⚡ Самый простой вариант — работает прямо сейчас без установки
                </p>
                <p className="mt-1 text-[12.5px] text-fog">
                  Никаких программ ставить не нужно. Просто откройте адрес этого сайта в браузере (Chrome, Edge,
                  Яндекс.Браузер, Firefox) на вашем ПК или ноутбуке.
                </p>
              </div>

              <ol className="space-y-2 list-decimal pl-5">
                <li>
                  <strong className="text-chalk">Автоматическая регистрация:</strong> при открытии вкладки браузер
                  создаёт уникальный идентификатор устройства и отправляет первый снимок на сервер.
                </li>
                <li>
                  <strong className="text-chalk">Что реально измеряется:</strong> задержка таймеров event-loop,
                  длительность длинных задач (PerformanceObserver), fps кадрового рендера, Battery Status API
                  (уровень и скорость разряда/заряда батареи в Вт), память JS-кучи и сетевое соединение.
                </li>
                <li>
                  <strong className="text-chalk">Расчёт стоимости:</strong> замеры шлются каждые 4 секунды в PostgreSQL,
                  сервер перемножает набранную энергию (кВт·ч) на текущий тариф Гомеля (с учётом времени суток и пиковых
                  зон).
                </li>
                <li>
                  <strong className="text-chalk">Несколько устройств:</strong> откройте сайт на рабочем ноутбуке и
                  домашнем ПК — оба сразу появятся в карточках и на графике общего потребления!
                </li>
              </ol>

              <div className="rounded border border-line-soft bg-ink-900/60 p-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-fog-dim">
                  Ссылка для открытия на других устройствах:
                </span>
                <div className="mt-1.5 flex items-center justify-between gap-2 rounded bg-ink-950 px-3 py-2 font-mono text-[12px] text-volt">
                  <span className="truncate">{origin}</span>
                  <button
                    type="button"
                    onClick={() => copy(origin, "url")}
                    className="flex shrink-0 items-center gap-1 text-fog hover:text-chalk"
                  >
                    {copied === "url" ? <Check size={14} className="text-volt" /> : <Copy size={14} />}
                    {copied === "url" ? "Скопировано" : "Копировать"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "powershell" ? (
            <div className="space-y-3.5 text-[13.5px] leading-relaxed text-fog">
              <p>
                Системный агент для Windows. Работает в фоне без открытого браузера. Снимает точную загрузку CPU через
                счётчики Windows, состояние аккумулятора через WMI, а при наличии видеокарты NVIDIA опрашивает{" "}
                <code className="rounded bg-ink-800 px-1 py-0.5 text-chalk font-mono text-xs">nvidia-smi</code>.
              </p>

              <div>
                <span className="font-mono text-[11px] uppercase tracking-wider text-fog-dim">
                  Команда запуска (PowerShell 5.1 / 7+):
                </span>
                <div className="mt-1.5 flex items-center justify-between gap-2 rounded border border-line bg-ink-950 p-2.5 font-mono text-[12px] text-volt">
                  <span className="truncate">{psCmd}</span>
                  <button
                    type="button"
                    onClick={() => copy(psCmd, "ps")}
                    className="flex shrink-0 items-center gap-1 rounded bg-ink-800 px-2.5 py-1 text-xs text-chalk hover:bg-ink-700"
                  >
                    {copied === "ps" ? <Check size={13} className="text-volt" /> : <Copy size={13} />}
                    {copied === "ps" ? "Скопировано!" : "Копировать"}
                  </button>
                </div>
              </div>

              <div className="space-y-1 text-xs text-fog-dim">
                <p>• Нажмите <kbd className="rounded bg-ink-800 px-1 text-chalk">Win+X</kbd> → выберите Терминал / PowerShell.</p>
                <p>• Вставьте команду и нажмите <kbd className="rounded bg-ink-800 px-1 text-chalk">Enter</kbd>.</p>
                <p>• Устройство появится на сайте в реальном времени с префиксом «(Windows)». Для остановки нажмите Ctrl+C.</p>
              </div>
            </div>
          ) : null}

          {tab === "linux" ? (
            <div className="space-y-3.5 text-[13.5px] leading-relaxed text-fog">
              <p>
                Нативный bash-скрипт для Linux и macOS. Считывает тики процессора из{" "}
                <code className="rounded bg-ink-800 px-1 py-0.5 text-chalk font-mono text-xs">/proc/stat</code>, датчики
                аккумулятора из{" "}
                <code className="rounded bg-ink-800 px-1 py-0.5 text-chalk font-mono text-xs">/sys/class/power_supply/BAT*</code>
                , память и шлёт замеры в реальном времени.
              </p>

              <div>
                <span className="font-mono text-[11px] uppercase tracking-wider text-fog-dim">
                  Команда запуска в терминале Linux / macOS:
                </span>
                <div className="mt-1.5 flex items-center justify-between gap-2 rounded border border-line bg-ink-950 p-2.5 font-mono text-[12px] text-volt">
                  <span className="truncate">{shCmd}</span>
                  <button
                    type="button"
                    onClick={() => copy(shCmd, "sh")}
                    className="flex shrink-0 items-center gap-1 rounded bg-ink-800 px-2.5 py-1 text-xs text-chalk hover:bg-ink-700"
                  >
                    {copied === "sh" ? <Check size={13} className="text-volt" /> : <Copy size={13} />}
                    {copied === "sh" ? "Скопировано!" : "Копировать"}
                  </button>
                </div>
              </div>

              <p className="text-xs text-fog-dim">
                Скрипт не требует root-прав. Нажмите Ctrl+C в любой момент для завершения сбора.
              </p>
            </div>
          ) : null}

          {tab === "python" ? (
            <div className="space-y-3.5 text-[13.5px] leading-relaxed text-fog">
              <p>
                Кросс-платформенный агент на Python 3. Работает на любой ОС (Windows / Linux / macOS) без установки
                сторонних библиотек (использует только стандартную библиотеку Python).
              </p>

              <div>
                <span className="font-mono text-[11px] uppercase tracking-wider text-fog-dim">
                  Однострочник для запуска:
                </span>
                <div className="mt-1.5 flex items-center justify-between gap-2 rounded border border-line bg-ink-950 p-2.5 font-mono text-[12px] text-volt">
                  <span className="truncate">{pyCmd}</span>
                  <button
                    type="button"
                    onClick={() => copy(pyCmd, "py")}
                    className="flex shrink-0 items-center gap-1 rounded bg-ink-800 px-2.5 py-1 text-xs text-chalk hover:bg-ink-700"
                  >
                    {copied === "py" ? <Check size={13} className="text-volt" /> : <Copy size={13} />}
                    {copied === "py" ? "Скопировано!" : "Копировать"}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <a
                  href="/api/agent/python"
                  download="energy_agent.py"
                  className="inline-flex items-center gap-1.5 rounded border border-line bg-ink-900 px-3 py-1.5 font-mono text-xs text-chalk transition hover:border-volt hover:text-volt"
                >
                  <Package size={13} /> Скачать файл energy_agent.py
                </a>
              </div>
            </div>
          ) : null}

          {tab === "server" ? (
            <div className="space-y-3.5 text-[13.5px] leading-relaxed text-fog">
              <p>
                Если вы хотите развернуть весь сайт целиком на своём личном сервере или локальном ПК:
              </p>

              <div className="rounded border border-line bg-ink-950 p-3 font-mono text-[12px] text-chalk">
                <div className="text-fog-dim"># 1. Установка зависимостей</div>
                <div>npm install</div>
                <div className="mt-2 text-fog-dim"># 2. Настройка базы данных в .env</div>
                <div>DATABASE_URL=&quot;postgresql://postgres:postgres@127.0.0.1:5432/app_db&quot;</div>
                <div className="mt-2 text-fog-dim"># 3. Применение схемы тарифов и замеров</div>
                <div>npx drizzle-kit push</div>
                <div className="mt-2 text-fog-dim"># 4. Запуск для разработки</div>
                <div>npm run dev</div>
                <div className="mt-2 text-fog-dim"># Или сборка и production-запуск</div>
                <div>npm run build && npm start</div>
              </div>

              <p className="text-xs text-fog-dim">
                Стек: Next.js 16 (App Router), Tailwind CSS v4, PostgreSQL, Drizzle ORM. Всё необходимое для тарифов
                Гомеля (постановление № 93) предзагружается автоматически при первом запуске.
              </p>
            </div>
          ) : null}
        </div>

        <footer className="mt-6 flex justify-end border-t border-line-soft pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-line bg-ink-800 px-4 py-1.5 font-mono text-xs uppercase tracking-wider text-chalk hover:bg-ink-700"
          >
            Закрыть
          </button>
        </footer>
      </div>
    </div>
  );
}
