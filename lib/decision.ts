import type { ScoreResult, TravelMode, Verdict } from "./types";

// The existing RatioCard bands are a provisional app rule over AI estimates.
export const RATIO_TIERS = [
  { min: 2, label: "Steal", blurb: "Way more fire than friction.", color: "#FFD700" },
  { min: 1.3, label: "Solid ROI", blurb: "Clearly worth the haul.", color: "#00CC66" },
  { min: 0.9, label: "Coin flip", blurb: "About equal — pick by mood.", color: "#FF9900" },
  { min: 0.6, label: "Tough sell", blurb: "Schlep is starting to outweigh the fire.", color: "#FF6B35" },
  { min: 0, label: "Net negative", blurb: "More mission than reward.", color: "#FF3B3B" },
] as const;

export function ratioTierFor(ratio: number) {
  return RATIO_TIERS.find((tier) => ratio >= tier.min) ?? RATIO_TIERS[RATIO_TIERS.length - 1];
}

export function decisionFor(fire: number, schlep: number, mode?: TravelMode): Pick<ScoreResult, "verdict" | "verdict_reason"> {
  if (![fire, schlep].every((value) => Number.isFinite(value) && value >= 1 && value <= 10)) {
    throw new Error("Decision scores must be finite numbers between 1 and 10");
  }
  const ratio = fire / schlep;
  const verdict: Verdict = ratio >= 2 ? "Legendary Haul" : ratio >= 1.3 ? "Worth It"
    : ratio >= 0.9 ? "Barely Worth It" : "Hard Pass";
  return {
    verdict,
    verdict_reason: `AI estimate: Fire ${fire}/10 ÷ Schlep ${schlep}/10 = ${ratio.toFixed(2)}${mode ? ` for ${mode}` : "; travel time unknown"}. Provisional app rule: ${verdict}.`,
  };
}

export function estimateText(text: string): string {
  return /^AI estimate\s*:/i.test(text) ? text : `AI estimate: ${text}`;
}

// All inputs come from a parsed initial result. No form input or provider request
// participates in mode selection, so identity, origin and Fire stay fixed.
export function selectResultMode(result: ScoreResult, mode: TravelMode): ScoreResult {
  const estimate = result.mode_estimates.find((entry) => entry.mode === mode);
  const leg = result.legs.find((entry) => entry.mode === mode);
  if (!estimate || !leg) throw new Error("Travel mode is unavailable for this result");
  return {
    ...result,
    schlep: estimate.schlep,
    schlep_reason: estimate.reason,
    schlep_details: [`AI estimate: based on Google route: ${mode} · ${leg.duration} · ${leg.distance}.`],
    selected_mode: mode,
    distance_note: `${mode}: ${leg.duration} (${leg.distance})`,
    ...decisionFor(result.fire, estimate.schlep, mode),
  };
}
