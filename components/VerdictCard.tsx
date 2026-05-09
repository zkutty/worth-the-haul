"use client";

import type { Verdict } from "@/lib/types";

const VERDICT_COLORS: Record<Verdict, { color: string; emoji: string }> = {
  "Legendary Haul": { color: "#FFD700", emoji: "👑" },
  "Worth It": { color: "#00CC66", emoji: "✅" },
  "Barely Worth It": { color: "#FF9900", emoji: "🤔" },
  "Hard Pass": { color: "#FF3B3B", emoji: "🚫" },
};

type Props = {
  verdict: Verdict;
  reason: string;
};

export default function VerdictCard({ verdict, reason }: Props) {
  const { color, emoji } = VERDICT_COLORS[verdict];
  return (
    <div
      className="rounded-xl border p-6 text-center"
      style={{
        background: "var(--surface)",
        borderColor: color,
        boxShadow: `0 0 0 1px ${color}33, 0 8px 30px ${color}22`,
      }}
    >
      <div className="text-4xl">{emoji}</div>
      <div
        className="font-display mt-2 text-4xl tracking-wide"
        style={{ color }}
      >
        {verdict}
      </div>
      <p
        className="mt-3 text-base"
        style={{ color: "var(--text)" }}
      >
        {reason}
      </p>
    </div>
  );
}
