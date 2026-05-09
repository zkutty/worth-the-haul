type Props = {
  fire: number;
  schlep: number;
};

type Tier = {
  min: number;
  label: string;
  blurb: string;
  color: string;
};

const TIERS: Tier[] = [
  { min: 2.0, label: "Steal", blurb: "Way more fire than friction.", color: "#FFD700" },
  { min: 1.3, label: "Solid ROI", blurb: "Clearly worth the haul.", color: "#00CC66" },
  { min: 0.9, label: "Coin flip", blurb: "About equal — pick by mood.", color: "#FF9900" },
  { min: 0.6, label: "Tough sell", blurb: "Schlep is starting to outweigh the fire.", color: "#FF6B35" },
  { min: 0, label: "Net negative", blurb: "More mission than reward.", color: "#FF3B3B" },
];

function tierFor(ratio: number): Tier {
  return TIERS.find((t) => ratio >= t.min) ?? TIERS[TIERS.length - 1];
}

export default function RatioCard({ fire, schlep }: Props) {
  if (schlep <= 0) return null;
  const ratio = fire / schlep;
  const tier = tierFor(ratio);
  return (
    <div
      className="rounded-xl border p-5"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      <div
        className="text-xs uppercase tracking-wider"
        style={{ color: "var(--muted)" }}
      >
        Fire ÷ Schlep
      </div>
      <div className="mt-1 flex items-baseline gap-3">
        <div
          className="font-display text-5xl leading-none"
          style={{ color: tier.color }}
        >
          {ratio.toFixed(2)}
        </div>
        <div
          className="font-display text-2xl tracking-wide"
          style={{ color: tier.color }}
        >
          {tier.label}
        </div>
      </div>
      <p className="mt-2 text-sm" style={{ color: "var(--text)" }}>
        {tier.blurb}
      </p>
      <div
        className="mt-3 grid grid-cols-5 gap-1 text-[10px] uppercase tracking-wider"
        style={{ color: "var(--muted)" }}
      >
        {[...TIERS].reverse().map((t) => (
          <div
            key={t.label}
            className="rounded border px-1 py-0.5 text-center"
            style={{
              borderColor: t.label === tier.label ? tier.color : "var(--border)",
              color: t.label === tier.label ? tier.color : "var(--muted)",
            }}
          >
            {t.label}
          </div>
        ))}
      </div>
    </div>
  );
}
