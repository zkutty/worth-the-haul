import { describe, expect, it } from "vitest";
import { decisionFor, ratioTierFor, selectResultMode } from "./decision";
import type { ScoreResult } from "./types";

export const resultFixture: ScoreResult = {
  fire: 8, schlep: 3, fire_reason: "AI estimate: appeal based on supplied rating.", fire_details: [],
  schlep_reason: "AI estimate: moderate driving effort.", schlep_details: ["AI estimate: based on Google route: driving · 30 mins · 20 km."],
  ...decisionFor(8, 3, "driving"), distance_note: "driving: 30 mins (20 km)",
  place_name: "Same Name", maps_query: "Same%20Name", from: "Original origin",
  resolvedPlace: { name: "Same Name", formatted_address: "10 First St", place_id: "branch-a", rating: 4.2 },
  evidence: { provider: "google_maps", assessment: "ai_estimate" },
  selected_mode: "driving",
  legs: [
    { mode: "driving", duration: "30 mins", distance: "20 km", durationSeconds: 1800 },
    { mode: "walking", duration: "3 hours", distance: "15 km", durationSeconds: 10800 },
  ],
  mode_estimates: [
    { mode: "driving", schlep: 3, reason: "AI estimate: moderate driving effort." },
    { mode: "walking", schlep: 9, reason: "AI estimate: high walking effort." },
  ],
};

describe("pair-derived decisions", () => {
  it.each([[10, 5, "Legendary Haul", "Steal"], [6.5, 5, "Worth It", "Solid ROI"], [4.5, 5, "Barely Worth It", "Coin flip"],
    [4.49, 5, "Hard Pass", "Tough sell"], [2, 5, "Hard Pass", "Net negative"]])("shares existing ratio thresholds for %s/%s", (fire, schlep, verdict, tier) => {
    expect(decisionFor(fire as number, schlep as number).verdict).toBe(verdict);
    expect(ratioTierFor((fire as number) / (schlep as number)).label).toBe(tier);
  });
  it("selects a coherent pair without changing Fire, identity, provider facts or committed origin", () => {
    const selected = selectResultMode(resultFixture, "walking");
    expect(selected).toMatchObject({ fire: 8, fire_reason: resultFixture.fire_reason, schlep: 9, selected_mode: "walking", verdict: "Hard Pass", from: "Original origin", resolvedPlace: resultFixture.resolvedPlace });
    expect(selected.verdict_reason).toContain("8/10 ÷ Schlep 9/10 = 0.89 for walking");
    expect(resultFixture.selected_mode).toBe("driving");
    expect(selectResultMode(selected, "driving")).toEqual(resultFixture);
  });
  it("rejects absent modes and invalid scores instead of clamping or pinning after a verdict", () => {
    expect(() => selectResultMode(resultFixture, "transit")).toThrow("unavailable");
    for (const value of [0, 11, NaN, Infinity]) expect(() => decisionFor(value, 3)).toThrow();
    // Historical PR #6 could pin Fire after a model verdict; current decisions
    // always derive from the actual final pair, including both ratio bands.
    expect(decisionFor(7, 3).verdict).toBe("Legendary Haul");
    expect(decisionFor(7, 9).verdict).toBe("Hard Pass");
  });
});
