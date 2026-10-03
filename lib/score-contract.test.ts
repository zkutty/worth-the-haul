import { describe, expect, it } from "vitest";
import {
  MAX_DETAILS,
  MAX_DETAIL_LENGTH,
  MAX_DISTANCE_NOTE_LENGTH,
  MAX_FROM_LENGTH,
  MAX_PLACE_LENGTH,
  MAX_REASON_LENGTH,
  parseModelScore,
  parseScoreRequest,
} from "./score-contract";

const lockFire = { fire: 8, fire_reason: "Excellent.", fire_details: ["Distinctive."] };
const modelScore = {
  ...lockFire,
  schlep: 3,
  schlep_reason: "Easy trip.",
  schlep_details: ["Direct."],
  verdict: "Worth It",
  verdict_reason: "The quality outweighs the trip.",
  distance_note: "Nearby",
};

describe("parseScoreRequest", () => {
  it("accepts required input and trims supplied text", () => {
    expect(parseScoreRequest({ place: " Test Place " })).toEqual({ place: "Test Place" });
    expect(parseScoreRequest({ place: "Test", from: "  " })).toEqual({ place: "Test" });
    expect(parseScoreRequest({ place: "Test", from: " Home ", mode: "walking", lockFire })).toEqual({
      place: "Test", from: "Home", mode: "walking", lockFire,
    });
  });

  it.each(["driving", "transit", "walking", "bicycling"])("accepts %s mode", (mode) => {
    expect(parseScoreRequest({ place: "Test", mode }).mode).toBe(mode);
  });

  it("accepts exact input and lockFire limits", () => {
    const input = {
      place: "p".repeat(MAX_PLACE_LENGTH),
      from: "f".repeat(MAX_FROM_LENGTH),
      lockFire: {
        fire: 10,
        fire_reason: "r".repeat(MAX_REASON_LENGTH),
        fire_details: Array(MAX_DETAILS).fill("d".repeat(MAX_DETAIL_LENGTH)),
      },
    };
    expect(parseScoreRequest(input)).toEqual(input);
    expect(parseScoreRequest({ place: "Test", lockFire: { ...lockFire, fire: 1, fire_details: [] } }).lockFire?.fire).toBe(1);
  });

  it.each([
    [null, "request must be an object"],
    [[], "request must be an object"],
    ["Test", "request must be an object"],
    [{}, "place must be a string"],
    [{ place: null }, "place must be a string"],
    [{ place: 7 }, "place must be a string"],
    [{ place: [] }, "place must be a string"],
    [{ place: "  " }, "place must not be empty"],
    [{ place: "p".repeat(MAX_PLACE_LENGTH + 1) }, "place must be at most"],
    [{ place: "Test", from: null }, "from must be a string"],
    [{ place: "Test", from: 4 }, "from must be a string"],
    [{ place: "Test", from: {} }, "from must be a string"],
    [{ place: "Test", from: undefined }, "from must be a string"],
    [{ place: "Test", from: "f".repeat(MAX_FROM_LENGTH + 1) }, "from must be at most"],
    [{ place: "Test", mode: "flying" }, "mode must be"],
    [{ place: "Test", mode: null }, "mode must be"],
    [{ place: "Test", mode: 1 }, "mode must be"],
    [{ place: "Test", extra: "private value" }, "request contains unknown fields"],
  ])("rejects malformed request %#", (value, message) => {
    expect(() => parseScoreRequest(value)).toThrow(message);
  });

  it.each([
    null, [], "locked", {},
    { ...lockFire, fire: "8" },
    { ...lockFire, fire: NaN },
    { ...lockFire, fire: Infinity },
    { ...lockFire, fire: 0 },
    { ...lockFire, fire: 11 },
    { ...lockFire, fire_reason: " " },
    { ...lockFire, fire_reason: 7 },
    { ...lockFire, fire_reason: "r".repeat(MAX_REASON_LENGTH + 1) },
    { ...lockFire, fire_details: "detail" },
    { ...lockFire, fire_details: [1] },
    { ...lockFire, fire_details: [""] },
    { ...lockFire, fire_details: ["d".repeat(MAX_DETAIL_LENGTH + 1)] },
    { ...lockFire, fire_details: Array(MAX_DETAILS + 1).fill("detail") },
    { ...lockFire, extra: true },
  ])("rejects malformed lockFire %#", (value) => {
    expect(() => parseScoreRequest({ place: "Test", lockFire: value })).toThrow(/lockFire/);
  });

  it("does not echo unknown fields or values in errors", () => {
    expect(() => parseScoreRequest({ place: "Test", "secret field": "private value" })).toThrow("request contains unknown fields");
  });

  it("bounds raw strings before trimming to prevent whitespace limit bypasses", () => {
    expect(() => parseScoreRequest({ place: " ".repeat(MAX_PLACE_LENGTH) + "p" })).toThrow("place must be at most");
    expect(() => parseScoreRequest({ place: "Test", from: " ".repeat(MAX_FROM_LENGTH) + "f" })).toThrow("from must be at most");
    expect(() => parseScoreRequest({ place: "Test", lockFire: { ...lockFire, fire_reason: " ".repeat(MAX_REASON_LENGTH) + "r" } })).toThrow("lockFire.fire_reason must be at most");
  });
});

describe("parseModelScore", () => {
  it("preserves valid numbers without rounding, and permits omitted-category empty bullets", () => {
    expect(parseModelScore({ ...modelScore, fire: 1, schlep: 10, fire_details: [], schlep_details: [], distance_note: "" })).toEqual({
      ...modelScore, fire: 1, schlep: 10, fire_details: [], schlep_details: [], distance_note: "",
    });
    expect(parseModelScore({ ...modelScore, fire: 8.5 }).fire).toBe(8.5);
  });

  it("accepts exact explanation limits", () => {
    const value = {
      ...modelScore,
      fire_reason: "r".repeat(MAX_REASON_LENGTH),
      schlep_reason: "r".repeat(MAX_REASON_LENGTH),
      verdict_reason: "r".repeat(MAX_REASON_LENGTH),
      fire_details: Array(MAX_DETAILS).fill("d".repeat(MAX_DETAIL_LENGTH)),
      schlep_details: Array(MAX_DETAILS).fill("d".repeat(MAX_DETAIL_LENGTH)),
      distance_note: "n".repeat(MAX_DISTANCE_NOTE_LENGTH),
    };
    expect(parseModelScore(value)).toEqual(value);
  });

  it.each(["Legendary Haul", "Worth It", "Barely Worth It", "Hard Pass"])("accepts %s verdict", (verdict) => {
    expect(parseModelScore({ ...modelScore, verdict }).verdict).toBe(verdict);
  });

  it.each([null, [], 8, {}])("rejects missing or non-object output %#", (value) => {
    expect(() => parseModelScore(value)).toThrow();
  });

  it.each(["fire", "schlep"])("rejects invalid %s values without coercing or clamping", (field) => {
    for (const value of [undefined, null, "8", true, NaN, Infinity, -Infinity, 0, 10.1, {}, []]) {
      expect(() => parseModelScore({ ...modelScore, [field]: value })).toThrow(`${field} must be a finite number`);
    }
  });

  it("rejects non-finite numbers parsed from JSON exponent overflow", () => {
    const parsed = JSON.parse(JSON.stringify(modelScore).replace('"fire":8', '"fire":1e400'));
    expect(() => parseModelScore(parsed)).toThrow("fire must be a finite number");
    expect(() => parseScoreRequest(JSON.parse('{"place":"Test","lockFire":{"fire":1e400,"fire_reason":"Good","fire_details":[]}}'))).toThrow("lockFire.fire must be a finite number");
  });

  it("bounds raw model text before trimming", () => {
    expect(() => parseModelScore({ ...modelScore, fire_reason: " ".repeat(MAX_REASON_LENGTH) + "r" })).toThrow("fire_reason must be at most");
    expect(() => parseModelScore({ ...modelScore, distance_note: " ".repeat(MAX_DISTANCE_NOTE_LENGTH) + "d" })).toThrow("distance_note must be at most");
  });

  it.each(["fire_reason", "schlep_reason", "verdict_reason"])("requires bounded nonempty %s", (field) => {
    for (const value of [undefined, null, 8, {}, [], "", "  ", "r".repeat(MAX_REASON_LENGTH + 1)]) {
      expect(() => parseModelScore({ ...modelScore, [field]: value })).toThrow(field);
    }
  });

  it.each(["fire_details", "schlep_details"])("requires bounded %s string arrays", (field) => {
    for (const value of [undefined, null, "detail", {}, [null], [1], [true], [{}], [" "], Array(1), ["d".repeat(MAX_DETAIL_LENGTH + 1)], Array(MAX_DETAILS + 1).fill("detail")]) {
      expect(() => parseModelScore({ ...modelScore, [field]: value })).toThrow(field);
    }
  });

  it.each([undefined, null, "Invented verdict", "", 8])("rejects unknown verdict %# without a Worth It fallback", (verdict) => {
    expect(() => parseModelScore({ ...modelScore, verdict })).toThrow("verdict must be a supported verdict");
  });

  it.each([undefined, null, 8, {}, [], "n".repeat(MAX_DISTANCE_NOTE_LENGTH + 1)])("requires bounded distance_note %#", (distance_note) => {
    expect(() => parseModelScore({ ...modelScore, distance_note })).toThrow("distance_note");
  });
});
