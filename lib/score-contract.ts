import { decisionFor, selectResultMode } from "./decision";
import type { DistanceLeg, ModeEstimate, PlaceData, ScoreRequest, ScoreResult, TravelMode, Verdict } from "./types";

export const MAX_PLACE_LENGTH = 200;
export const MAX_FROM_LENGTH = 150;
export const MAX_REASON_LENGTH = 500;
export const MAX_DETAIL_LENGTH = 500;
export const MAX_DETAILS = 6;
export const MAX_DISTANCE_NOTE_LENGTH = 300;
export const MAX_MODE_REASON_LENGTH = 200;
const ESTIMATE_PREFIX_LENGTH = "AI estimate: ".length;

export type ModelScore = Pick<ScoreResult,
  "fire" | "schlep" | "fire_reason" | "fire_details" | "schlep_reason" |
  "schlep_details" | "verdict" | "verdict_reason" | "distance_note" | "mode_estimates"
>;

export const TRAVEL_MODES: readonly TravelMode[] = ["driving", "transit", "walking", "bicycling"];
const VERDICTS: readonly Verdict[] = ["Legendary Haul", "Worth It", "Barely Worth It", "Hard Pass"];
const SCORE_KEYS = ["fire", "schlep", "fire_reason", "fire_details", "schlep_reason", "schlep_details", "verdict", "verdict_reason", "distance_note", "mode_estimates"];

function object(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}
function knownKeys(value: Record<string, unknown>, keys: readonly string[], field: string) {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error(`${field} contains unknown fields`);
}
function boundedString(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  if (value.length > max) throw new Error(`${field} must be at most ${max} characters`);
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) throw new Error(`${field} must not be empty`);
  return trimmed;
}
function number(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${field} must be a finite number between ${min} and ${max}`);
  }
  return value;
}
function score(value: unknown, field: string): number { return number(value, field, 1, 10); }
function mode(value: unknown): TravelMode {
  if (typeof value !== "string" || !TRAVEL_MODES.includes(value as TravelMode)) throw new Error("mode must be driving, transit, walking, or bicycling");
  return value as TravelMode;
}
function details(value: unknown, field: string, labeled = false): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array of strings`);
  if (value.length > MAX_DETAILS) throw new Error(`${field} must contain at most ${MAX_DETAILS} items`);
  return Array.from(value, (item) => boundedString(item, field, MAX_DETAIL_LENGTH + (labeled ? ESTIMATE_PREFIX_LENGTH : 0)));
}
function estimateLabel(text: string) {
  if (!/^AI estimate\s*:/i.test(text)) throw new Error("Score explanations must be labeled AI estimates");
}
function modeEstimates(value: unknown, expectedModes: readonly TravelMode[], labeled = false): ModeEstimate[] {
  if (!Array.isArray(value) || value.length > TRAVEL_MODES.length) throw new Error("mode_estimates must be an array of at most four estimates");
  const entries = Array.from(value, (entry) => {
    const parsed = object(entry, "mode estimate");
    knownKeys(parsed, ["mode", "schlep", "reason"], "mode estimate");
    const reason = boundedString(parsed.reason, "mode estimate reason", MAX_MODE_REASON_LENGTH + (labeled ? ESTIMATE_PREFIX_LENGTH : 0));
    if (labeled) estimateLabel(reason);
    return { mode: mode(parsed.mode), schlep: score(parsed.schlep, "mode estimate schlep"), reason };
  });
  const actual = new Set(entries.map((entry) => entry.mode));
  if (actual.size !== entries.length || entries.length !== expectedModes.length || expectedModes.some((entry) => !actual.has(entry))) {
    throw new Error("mode_estimates must cover exactly the supplied travel modes once");
  }
  return entries;
}

export function parseScoreRequest(value: unknown): ScoreRequest {
  const parsed = object(value, "request");
  // Legacy lockFire / unsigned context cannot be used to bypass fresh lookups.
  knownKeys(parsed, ["place", "from", "mode"], "request");
  const result: ScoreRequest = { place: boundedString(parsed.place, "place", MAX_PLACE_LENGTH) };
  if (Object.hasOwn(parsed, "from")) {
    const from = boundedString(parsed.from, "from", MAX_FROM_LENGTH, true);
    if (from) result.from = from;
  }
  if (Object.hasOwn(parsed, "mode")) result.mode = mode(parsed.mode);
  return result;
}

function scoreFields(parsed: Record<string, unknown>, labeled = false) {
  if (typeof parsed.verdict !== "string" || !VERDICTS.includes(parsed.verdict as Verdict)) throw new Error("verdict must be a supported verdict");
  const extra = labeled ? ESTIMATE_PREFIX_LENGTH : 0;
  const result = {
    fire: score(parsed.fire, "fire"), schlep: score(parsed.schlep, "schlep"),
    fire_reason: boundedString(parsed.fire_reason, "fire_reason", MAX_REASON_LENGTH + extra),
    fire_details: details(parsed.fire_details, "fire_details", labeled),
    schlep_reason: boundedString(parsed.schlep_reason, "schlep_reason", MAX_REASON_LENGTH + extra),
    schlep_details: details(parsed.schlep_details, "schlep_details", labeled),
    verdict: parsed.verdict as Verdict,
    verdict_reason: boundedString(parsed.verdict_reason, "verdict_reason", MAX_REASON_LENGTH + extra),
    distance_note: boundedString(parsed.distance_note, "distance_note", MAX_DISTANCE_NOTE_LENGTH, true),
  };
  if (labeled) [result.fire_reason, result.schlep_reason, result.verdict_reason, ...result.fire_details, ...result.schlep_details].forEach(estimateLabel);
  return result;
}

export function parseModelScore(value: unknown, expectedModes: readonly TravelMode[] = []): ModelScore {
  const parsed = object(value, "score");
  knownKeys(parsed, SCORE_KEYS, "score");
  return { ...scoreFields(parsed), mode_estimates: modeEstimates(parsed.mode_estimates, expectedModes) };
}

function parseLegs(value: unknown): DistanceLeg[] {
  if (!Array.isArray(value) || value.length > TRAVEL_MODES.length) throw new Error("legs must contain at most four routes");
  const legs = Array.from(value, (entry) => {
    const parsed = object(entry, "leg");
    knownKeys(parsed, ["mode", "duration", "distance", "durationSeconds"], "leg");
    return { mode: mode(parsed.mode), duration: boundedString(parsed.duration, "duration", 100),
      distance: boundedString(parsed.distance, "distance", 100), durationSeconds: number(parsed.durationSeconds, "durationSeconds", 0, Number.MAX_SAFE_INTEGER) };
  });
  if (new Set(legs.map((entry) => entry.mode)).size !== legs.length) throw new Error("legs must have unique modes");
  return legs;
}
function parsePlace(value: unknown): PlaceData {
  const parsed = object(value, "resolvedPlace");
  knownKeys(parsed, ["name", "formatted_address", "place_id", "rating", "user_ratings_total", "price_level", "lat", "lng"], "resolvedPlace");
  const result: PlaceData = { name: boundedString(parsed.name, "resolvedPlace.name", MAX_PLACE_LENGTH) };
  if (Object.hasOwn(parsed, "formatted_address")) result.formatted_address = boundedString(parsed.formatted_address, "formatted_address", 500);
  if (Object.hasOwn(parsed, "place_id")) result.place_id = boundedString(parsed.place_id, "place_id", 300);
  if (Object.hasOwn(parsed, "rating")) result.rating = number(parsed.rating, "rating", 1, 5);
  if (Object.hasOwn(parsed, "user_ratings_total")) {
    result.user_ratings_total = number(parsed.user_ratings_total, "user_ratings_total", 0, Number.MAX_SAFE_INTEGER);
    if (!Number.isInteger(result.user_ratings_total)) throw new Error("user_ratings_total must be an integer");
  }
  if (Object.hasOwn(parsed, "price_level")) {
    result.price_level = number(parsed.price_level, "price_level", 0, 4);
    if (!Number.isInteger(result.price_level)) throw new Error("price_level must be an integer");
  }
  if (Object.hasOwn(parsed, "lat")) result.lat = number(parsed.lat, "lat", -90, 90);
  if (Object.hasOwn(parsed, "lng")) result.lng = number(parsed.lng, "lng", -180, 180);
  return result;
}

// The client accepts only the complete, coherent current server contract.
export function parseScoreResult(value: unknown): ScoreResult {
  const parsed = object(value, "result");
  knownKeys(parsed, [...SCORE_KEYS, "place_name", "maps_query", "legs", "selected_mode", "lat", "lng", "resolvedPlace", "evidence", "from"], "result");
  const resolvedPlace = parsePlace(parsed.resolvedPlace);
  const evidence = object(parsed.evidence, "evidence");
  knownKeys(evidence, ["provider", "assessment"], "evidence");
  if (evidence.provider !== "google_maps" || evidence.assessment !== "ai_estimate") throw new Error("Result evidence must separate Google facts and AI estimates");
  const legs = parseLegs(parsed.legs);
  const result: ScoreResult = {
    ...scoreFields(parsed, true), place_name: boundedString(parsed.place_name, "place_name", MAX_PLACE_LENGTH),
    maps_query: boundedString(parsed.maps_query, "maps_query", MAX_PLACE_LENGTH * 9),
    legs, mode_estimates: modeEstimates(parsed.mode_estimates, legs.map((leg) => leg.mode), true),
    resolvedPlace, evidence: { provider: "google_maps", assessment: "ai_estimate" },
  };
  if (Object.hasOwn(parsed, "from")) result.from = boundedString(parsed.from, "from", MAX_FROM_LENGTH);
  if (Object.hasOwn(parsed, "lat")) result.lat = number(parsed.lat, "lat", -90, 90);
  if (Object.hasOwn(parsed, "lng")) result.lng = number(parsed.lng, "lng", -180, 180);
  if (result.place_name !== resolvedPlace.name || result.maps_query !== encodeURIComponent(resolvedPlace.name)
    || result.lat !== resolvedPlace.lat || result.lng !== resolvedPlace.lng) throw new Error("Result identity must match the resolved place");
  if (legs.length) {
    if (!result.from) throw new Error("Routes require a committed origin");
    result.selected_mode = mode(parsed.selected_mode);
    const selected = selectResultMode(result, result.selected_mode);
    if (result.schlep !== selected.schlep || result.schlep_reason !== selected.schlep_reason
      || result.distance_note !== selected.distance_note || JSON.stringify(result.schlep_details) !== JSON.stringify(selected.schlep_details)) {
      throw new Error("Selected mode must match the displayed travel estimate");
    }
  } else if (Object.hasOwn(parsed, "selected_mode") || result.distance_note !== "Travel time unknown") {
    throw new Error("Results without routes must report travel time unknown");
  }
  const decision = decisionFor(result.fire, result.schlep, result.selected_mode);
  if (result.verdict !== decision.verdict || result.verdict_reason !== decision.verdict_reason) throw new Error("Verdict must match the displayed score pair");
  return result;
}
