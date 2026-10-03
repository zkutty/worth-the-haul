import type { LockedFire, ScoreRequest, ScoreResult, TravelMode, Verdict } from "./types";

// Match the supported input sizes; model explanations stay short enough to render
// and to reuse safely as lockFire input when changing travel modes.
export const MAX_PLACE_LENGTH = 200;
export const MAX_FROM_LENGTH = 150;
export const MAX_REASON_LENGTH = 500;
export const MAX_DETAIL_LENGTH = 500;
export const MAX_DETAILS = 6;
export const MAX_DISTANCE_NOTE_LENGTH = 300;

export type ModelScore = Omit<
  ScoreResult,
  "place_name" | "maps_query" | "legs" | "selected_mode" | "lat" | "lng"
>;

const TRAVEL_MODES: readonly TravelMode[] = ["driving", "transit", "walking", "bicycling"];
const VERDICTS: readonly Verdict[] = ["Legendary Haul", "Worth It", "Barely Worth It", "Hard Pass"];

function object(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function knownKeys(value: Record<string, unknown>, keys: readonly string[], field: string) {
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new Error(`${field} contains unknown fields`);
  }
}

function boundedString(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  if (value.length > max) throw new Error(`${field} must be at most ${max} characters`);
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) throw new Error(`${field} must not be empty`);
  return trimmed;
}

function score(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 10) {
    throw new Error(`${field} must be a finite number between 1 and 10`);
  }
  return value;
}

function details(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array of strings`);
  if (value.length > MAX_DETAILS) throw new Error(`${field} must contain at most ${MAX_DETAILS} items`);
  return Array.from(value, (item) => boundedString(item, field, MAX_DETAIL_LENGTH));
}

function lockedFire(value: unknown): LockedFire {
  const parsed = object(value, "lockFire");
  knownKeys(parsed, ["fire", "fire_reason", "fire_details"], "lockFire");
  return {
    fire: score(parsed.fire, "lockFire.fire"),
    fire_reason: boundedString(parsed.fire_reason, "lockFire.fire_reason", MAX_REASON_LENGTH),
    fire_details: details(parsed.fire_details, "lockFire.fire_details"),
  };
}

export function parseScoreRequest(value: unknown): ScoreRequest {
  const parsed = object(value, "request");
  knownKeys(parsed, ["place", "from", "mode", "lockFire"], "request");
  const result: ScoreRequest = {
    place: boundedString(parsed.place, "place", MAX_PLACE_LENGTH),
  };
  if (Object.hasOwn(parsed, "from")) {
    const from = boundedString(parsed.from, "from", MAX_FROM_LENGTH, true);
    if (from) result.from = from;
  }
  if (Object.hasOwn(parsed, "mode")) {
    if (typeof parsed.mode !== "string" || !TRAVEL_MODES.includes(parsed.mode as TravelMode)) {
      throw new Error("mode must be driving, transit, walking, or bicycling");
    }
    result.mode = parsed.mode as TravelMode;
  }
  if (Object.hasOwn(parsed, "lockFire")) result.lockFire = lockedFire(parsed.lockFire);
  return result;
}

export function parseModelScore(value: unknown): ModelScore {
  const parsed = object(value, "score");
  if (typeof parsed.verdict !== "string" || !VERDICTS.includes(parsed.verdict as Verdict)) {
    throw new Error("verdict must be a supported verdict");
  }
  return {
    fire: score(parsed.fire, "fire"),
    schlep: score(parsed.schlep, "schlep"),
    fire_reason: boundedString(parsed.fire_reason, "fire_reason", MAX_REASON_LENGTH),
    fire_details: details(parsed.fire_details, "fire_details"),
    schlep_reason: boundedString(parsed.schlep_reason, "schlep_reason", MAX_REASON_LENGTH),
    schlep_details: details(parsed.schlep_details, "schlep_details"),
    verdict: parsed.verdict as Verdict,
    verdict_reason: boundedString(parsed.verdict_reason, "verdict_reason", MAX_REASON_LENGTH),
    distance_note: boundedString(parsed.distance_note, "distance_note", MAX_DISTANCE_NOTE_LENGTH, true),
  };
}
