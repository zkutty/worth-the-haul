import { NextResponse } from "next/server";
import { findPlace, getDistance } from "@/lib/google";
import { scoreWithClaude } from "@/lib/claude";
import type {
  DistanceData,
  DistanceLeg,
  PlaceData,
  ScoreRequest,
  ScoreResult,
  TravelMode,
} from "@/lib/types";

export const runtime = "nodejs";

const VALID_MODES: TravelMode[] = ["driving", "transit", "walking", "bicycling"];
const MAX_INPUT_LENGTH = 200;
const MAX_LEG_STRING_LENGTH = 50;

// The client is untrusted here — this is reused verbatim in the Claude
// prompt, so a malformed or oversized payload must fall back to a fresh
// Google lookup rather than being passed through.
function sanitizeKnownPlace(value: unknown): PlaceData | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string" || v.name.length === 0 || v.name.length > MAX_INPUT_LENGTH) {
    return null;
  }
  const asFiniteNumber = (n: unknown): number | undefined =>
    typeof n === "number" && Number.isFinite(n) ? n : undefined;
  return {
    name: v.name,
    rating: asFiniteNumber(v.rating),
    user_ratings_total: asFiniteNumber(v.user_ratings_total),
    price_level: asFiniteNumber(v.price_level),
    lat: asFiniteNumber(v.lat),
    lng: asFiniteNumber(v.lng),
  };
}

function sanitizeKnownLegs(value: unknown): DistanceLeg[] | null {
  if (!Array.isArray(value) || value.length > VALID_MODES.length) return null;
  const legs: DistanceLeg[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const v = item as Record<string, unknown>;
    if (
      typeof v.mode !== "string" ||
      !VALID_MODES.includes(v.mode as TravelMode) ||
      typeof v.duration !== "string" ||
      v.duration.length > MAX_LEG_STRING_LENGTH ||
      typeof v.distance !== "string" ||
      v.distance.length > MAX_LEG_STRING_LENGTH ||
      typeof v.durationSeconds !== "number" ||
      !Number.isFinite(v.durationSeconds)
    ) {
      return null;
    }
    legs.push({
      mode: v.mode as TravelMode,
      duration: v.duration,
      distance: v.distance,
      durationSeconds: v.durationSeconds,
    });
  }
  return legs;
}

// Best-effort per-isolate throttle. There's no shared store wired up (no KV
// binding), so this only bounds abuse within a single warm isolate — it's a
// cheap first line of defense, not a hard guarantee.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (requestLog.get(ip) ?? []).filter((t) => t > windowStart);
  recent.push(now);
  requestLog.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  let body: ScoreRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const place = (body.place ?? "").trim();
  const from = body.from?.trim() || undefined;
  const mode =
    body.mode && VALID_MODES.includes(body.mode) ? body.mode : undefined;

  if (!place) {
    return NextResponse.json(
      { error: "Place is required." },
      { status: 400 }
    );
  }

  if (place.length > MAX_INPUT_LENGTH || (from && from.length > MAX_INPUT_LENGTH)) {
    return NextResponse.json(
      { error: `Inputs must be ${MAX_INPUT_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  // Mode rescores already know the place and every travel leg (the client
  // just displayed them) — skip Places + Distance Matrix entirely and reuse
  // what was sent back, once it's been validated and capped (the caller is
  // untrusted and this feeds straight into the Claude prompt).
  const sanitizedKnownPlace = mode ? sanitizeKnownPlace(body.knownPlace) : null;
  const sanitizedKnownLegs = mode ? sanitizeKnownLegs(body.knownLegs) : null;
  const canReuseKnownData = !!sanitizedKnownPlace && !!sanitizedKnownLegs;

  let placeData;
  let distance: DistanceData;

  if (canReuseKnownData) {
    placeData = sanitizedKnownPlace!;
    distance = sanitizedKnownLegs!.length > 0 ? { legs: sanitizedKnownLegs! } : null;
  } else {
    const lookup = await findPlace(place);
    if (!lookup.ok) {
      if (lookup.reason === "api_error") {
        console.error("Google Places API error:", lookup.detail);
        return NextResponse.json(
          { error: "Location lookup is temporarily unavailable. Please try again shortly." },
          { status: 502 }
        );
      }
      return NextResponse.json(
        { error: "Place not found. Try being more specific." },
        { status: 400 }
      );
    }
    placeData = lookup.place;
    distance = from ? await getDistance(from, placeData) : null;
  }

  let scored;
  try {
    scored = await scoreWithClaude(placeData, from, distance, place, mode);
  } catch (err) {
    console.error("Claude scoring failed:", err);
    return NextResponse.json(
      { error: "Scoring failed. Please try again." },
      { status: 500 }
    );
  }

  // A mode change only affects schlep, not fire. Re-running Claude would
  // jitter the fire score and erode trust, so when the client sends the
  // fire it's already showing, we pin it and keep only the fresh schlep.
  if (mode && body.lockFire) {
    const lf = body.lockFire;
    if (
      typeof lf.fire === "number" &&
      Number.isFinite(lf.fire) &&
      typeof lf.fire_reason === "string" &&
      Array.isArray(lf.fire_details)
    ) {
      scored.fire = Math.max(1, Math.min(10, lf.fire));
      scored.fire_reason = lf.fire_reason;
      scored.fire_details = lf.fire_details
        .map((d) => String(d))
        .filter((d) => d.length > 0);
    }
  }

  if (from && !distance && !scored.distance_note) {
    scored.distance_note = "travel time unavailable";
  }

  const result: ScoreResult = {
    ...scored,
    place_name: placeData.name,
    maps_query: encodeURIComponent(placeData.name),
    legs: distance?.legs ?? [],
    selected_mode: mode,
    lat: placeData.lat,
    lng: placeData.lng,
    rating: placeData.rating,
    user_ratings_total: placeData.user_ratings_total,
    price_level: placeData.price_level,
    from,
  };

  return NextResponse.json(result);
}
