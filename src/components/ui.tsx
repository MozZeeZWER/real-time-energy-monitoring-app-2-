"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** true только после монтирования в браузере — защищает от hydration-mismatch для времени/анимаций. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

/** Плавный «доезд» числа к целевому значению. */
export function useCountUp(target: number, duration = 520): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    if (reduced || !Number.isFinite(target)) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const delta = target - from;
    if (Math.abs(delta) < 1e-6) return;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + delta * eased;
      setValue(next);
      fromRef.current = next;
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, reduced]);

  return value;
}

/** Появление блока при скролле. */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            window.setTimeout(() => setShown(true), delay);
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);

  return (
    <div ref={ref} className={`reveal ${shown ? "reveal-in" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({
  index,
  title,
  hint,
  right,
}: {
  index: string;
  title: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] tracking-[0.28em] text-volt">{index}</span>
          <span className="h-px w-8 bg-line" />
          <h2 className="font-display text-2xl font-bold uppercase tracking-[0.06em] text-chalk sm:text-[28px]">
            {title}
          </h2>
        </div>
        {hint ? <p className="mt-1.5 max-w-2xl text-sm text-fog">{hint}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function StatTile({
  label,
  value,
  unit,
  sub,
  accent = "volt",
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  accent?: "volt" | "cyan" | "amber" | "ember" | "chalk";
  icon?: ReactNode;
}) {
  const color = {
    volt: "text-volt",
    cyan: "text-cyan",
    amber: "text-amber",
    ember: "text-ember",
    chalk: "text-chalk",
  }[accent];

  return (
    <div className="panel panel-hover group overflow-hidden rounded-md px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fog-dim">{label}</span>
        {icon ? <span className={`${color} opacity-70 transition-opacity group-hover:opacity-100`}>{icon}</span> : null}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`font-display text-[30px] leading-none font-bold tnum ${color}`}>{value}</span>
        {unit ? <span className="font-mono text-[11px] text-fog">{unit}</span> : null}
      </div>
      {sub ? <p className="mt-1.5 text-[11px] leading-snug text-fog-dim">{sub}</p> : null}
    </div>
  );
}

export function LiveDot({ active, label }: { active: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`relative inline-flex h-2 w-2 ${active ? "text-volt" : "text-fog-dim"}`}>
        {active ? <span className="pulse-ring absolute inset-0 rounded-full" /> : null}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            active ? "bg-volt" : "bg-fog-dim"
          }`}
        />
      </span>
      {label ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fog">{label}</span>
      ) : null}
    </span>
  );
}

export function Meter({
  value,
  max = 1,
  color = "#c9f24a",
  label,
  right,
}: {
  value: number;
  max?: number;
  color?: string;
  label?: string;
  right?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      {label ? (
        <div className="mb-1 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fog-dim">{label}</span>
          <span className="font-mono text-[11px] tnum text-fog">{right}</span>
        </div>
      ) : null}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
        <div
          className="bar-fill h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 12px ${color}66` }}
        />
      </div>
    </div>
  );
}

export function fmt(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtByn(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "0,0000";
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
