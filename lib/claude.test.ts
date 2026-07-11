import { describe, expect, it } from "vitest";
import { parseScoreJson } from "./claude";

function validPayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    fire: 8,
    schlep: 3,
    fire_reason: "Great food.",
    fire_details: ["a", "b", "c"],
    schlep_reason: "Easy trip.",
    schlep_details: ["a", "b"],
    verdict: "Worth It",
    verdict_reason: "Go for it.",
    distance_note: "18 min drive",
    ...overrides,
  });
}

describe("parseScoreJson", () => {
  it("parses a well-formed response", () => {
    const result = parseScoreJson(validPayload());
    expect(result.fire).toBe(8);
    expect(result.schlep).toBe(3);
    expect(result.verdict).toBe("Worth It");
    expect(result.fire_details).toEqual(["a", "b", "c"]);
  });

  it("strips markdown code fences", () => {
    const fenced = "```json\n" + validPayload() + "\n```";
    const result = parseScoreJson(fenced);
    expect(result.fire).toBe(8);
  });

  it("clamps fire and schlep to the 1-10 range", () => {
    const result = parseScoreJson(validPayload({ fire: 15, schlep: -4 }));
    expect(result.fire).toBe(10);
    expect(result.schlep).toBe(1);
  });

  it("falls back to 'Worth It' for an unrecognized verdict", () => {
    const result = parseScoreJson(validPayload({ verdict: "Meh" }));
    expect(result.verdict).toBe("Worth It");
  });

  it("throws instead of returning NaN when fire is missing", () => {
    const payload = validPayload();
    const withoutFire = JSON.stringify({
      ...JSON.parse(payload),
      fire: undefined,
    });
    expect(() => parseScoreJson(withoutFire)).toThrow();
  });

  it("throws instead of returning NaN when schlep is non-numeric", () => {
    const result = validPayload({ schlep: "unknown" });
    expect(() => parseScoreJson(result)).toThrow();
  });
});
