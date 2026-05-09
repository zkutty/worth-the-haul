"use client";

import { useEffect, useState } from "react";

type Props = {
  value: number;
  color: string;
  label: string;
  emoji: string;
  reason: string;
  higherIsBetter: boolean;
};

export default function ScoreBar({
  value,
  color,
  label,
  emoji,
  reason,
  higherIsBetter,
}: Props) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setWidth((value / 10) * 100);
    }, 50);
    return () => window.clearTimeout(id);
  }, [value]);

  return (
    <div
      className="rounded-xl border p-5"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex items-baseline justify-between">
        <div
          className="font-display text-2xl tracking-wide"
          style={{ color: "var(--text)" }}
        >
          <span className="mr-2">{emoji}</span>
          {label}
          <span
            className="ml-2 text-xs font-sans normal-case tracking-normal"
            style={{ color: "var(--muted)" }}
          >
            {higherIsBetter ? "↑ higher is better" : "↓ lower is better"}
          </span>
        </div>
        <div
          className="font-display text-5xl leading-none"
          style={{ color }}
        >
          {value.toFixed(1)}
          <span
            className="text-2xl"
            style={{ color: "var(--muted)" }}
          >
            /10
          </span>
        </div>
      </div>
      <div
        className="mt-4 h-3 w-full overflow-hidden rounded-full"
        style={{ background: "#1C1C1C" }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
      <p className="mt-3 text-sm" style={{ color: "var(--text)" }}>
        {reason}
      </p>
    </div>
  );
}
