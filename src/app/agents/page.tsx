"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";

export default function AgentsPage() {
  const [origin, setOrigin] = useState(
    "https://real-time-energy-monitoring-app-2.vercel.app",
  );

  useEffect(() => {
    setOrigin(window.location.origin.replace(/\/$/, ""));
  }, []);

  const cmd = useMemo(
    () => `irm ${origin}/api/agent/powershell | iex`,
    [origin],
  );

  const winr = useMemo(
    () =>
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm ${origin}/api/agent/powershell | iex"`,
    [origin],
  );

  const [copied, setCopied] = useState<"cmd" | "winr" | null>(null);

  async function copy(text: string, which: "cmd" | "winr") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Скопируйте команду:", text);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b1116",
        color: "#e8eef4",
        fontFamily:
          'ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif',
        padding: "32px 20px 64px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#8fd0e8", fontSize: 14 }}>
          ← на дашборд
        </Link>

        <p
          style={{
            margin: "28px 0 8px",
            color: "#8aa0b0",
            letterSpacing: "0.12em",
            fontSize: 12,
            textTransform: "uppercase",
          }}
        >
          Windows · ПК и ноутбуки
        </p>
        <h1 style={{ fontSize: 32, lineHeight: 1.15, margin: "0 0 12px", fontWeight: 650 }}>
          Как запустить агент без ручной возни
        </h1>
        <p style={{ color: "#b7c5d0", fontSize: 16, lineHeight: 1.55, margin: "0 0 28px" }}>
          Браузер не умеет сам включить системный агент — Windows так защищает ПК.
          Ниже два рабочих способа: одна вставка в PowerShell (файл не нужен) или
          двойной щелчок по ярлыку.
        </p>

        <section style={card}>
          <div style={badge}>1 · чужой ПК / ноутбук</div>
          <h2 style={h2}>Одна команда, без скачивания</h2>
          <ol style={ol}>
            <li>На том компьютере: клавиша Windows, наберите PowerShell, Enter.</li>
            <li>Нажмите кнопку «Скопировать» ниже.</li>
            <li>В окне PowerShell: правый клик (вставится) → Enter.</li>
          </ol>
          <pre style={pre}>{cmd}</pre>
          <button type="button" onClick={() => copy(cmd, "cmd")} style={btn}>
            {copied === "cmd" ? "Скопировано" : "Скопировать команду"}
          </button>
          <p style={hint}>
            Файл на диск не сохраняется. Агент крутится, пока открыто это окно.
            Остановка — Ctrl+C. В шапке должно быть{" "}
            <code style={code}>Server: {origin}</code>, не localhost.
          </p>
          <p style={{ ...hint, marginTop: 14 }}>Если PowerShell ругается на политику — Win+R, вставьте это и Enter:</p>
          <pre style={pre}>{winr}</pre>
          <button type="button" onClick={() => copy(winr, "winr")} style={btnGhost}>
            {copied === "winr" ? "Скопировано" : "Скопировать для Win+R"}
          </button>
        </section>

        <section style={card}>
          <div style={badge}>2 · свой ПК, ярлык</div>
          <h2 style={h2}>Двойной щелчок, без команд</h2>
          <p style={{ color: "#b7c5d0", fontSize: 15, lineHeight: 1.5, margin: "0 0 16px" }}>
            Скачайте <code style={code}>energy-agent.bat</code> и положите на рабочий стол.
            Дальше запуск — как у обычной программы. Скрипт каждый раз берётся с сайта,
            рядом класть .ps1 не нужно.
          </p>
          <a href="/api/agent/bat" style={{ ...btn, display: "inline-block", textDecoration: "none" }}>
            Скачать energy-agent.bat
          </a>
          <h3 style={{ fontSize: 16, margin: "28px 0 10px", fontWeight: 600 }}>Автозапуск вместе с Windows</h3>
          <ol style={ol}>
            <li>Скачайте bat (кнопка выше).</li>
            <li>
              Win+R → введите <code style={code}>shell:startup</code> → Enter.
            </li>
            <li>Скопируйте bat в открывшуюся папку «Автозагрузка».</li>
          </ol>
          <p style={hint}>
            После входа в Windows появится чёрное окно агента. Не закрывайте его,
            если нужен учёт. Убрать автозапуск — удалите файл из той же папки.
          </p>
        </section>

        <section style={card}>
          <div style={badge}>готово, когда</div>
          <h2 style={h2}>Что должно появиться</h2>
          <ul style={{ ...ol, listStyle: "disc" }}>
            <li>
              В консоли строки вида <code style={code}>CPU: 7% | … | 28 W</code> без красного
              send error.
            </li>
            <li>
              На дашборде карточка <code style={code}>ИМЯ-ПК (Windows)</code> — не Firefox.
            </li>
            <li>Окно агента остаётся открытым, пока идёт съём.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}

const card: CSSProperties = {
  background: "#121a21",
  border: "1px solid #24303a",
  borderRadius: 16,
  padding: "22px 22px 24px",
  marginBottom: 18,
};

const badge: CSSProperties = {
  color: "#c9f24a",
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  marginBottom: 8,
};

const h2: CSSProperties = {
  fontSize: 22,
  margin: "0 0 12px",
  fontWeight: 650,
};

const ol: CSSProperties = {
  margin: "0 0 16px",
  paddingLeft: 20,
  color: "#d5dee6",
  lineHeight: 1.55,
  fontSize: 15,
};

const pre: CSSProperties = {
  background: "#0b1116",
  border: "1px solid #2a3844",
  borderRadius: 10,
  padding: "12px 14px",
  overflowX: "auto",
  fontSize: 13,
  color: "#c9f24a",
  margin: "0 0 12px",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
};

const btn: CSSProperties = {
  background: "#c9f24a",
  color: "#10160c",
  border: "none",
  borderRadius: 10,
  padding: "10px 16px",
  fontWeight: 650,
  fontSize: 14,
  cursor: "pointer",
};

const btnGhost: CSSProperties = {
  ...btn,
  background: "transparent",
  color: "#c9f24a",
  border: "1px solid #c9f24a",
};

const hint: CSSProperties = {
  color: "#8aa0b0",
  fontSize: 13,
  lineHeight: 1.5,
  margin: "14px 0 0",
};

const code: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
  color: "#e8eef4",
  background: "#0b1116",
  padding: "1px 6px",
  borderRadius: 4,
  fontSize: "0.92em",
};
