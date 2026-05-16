import { NextResponse } from "next/server";
import { findPlace, getDistance } from "@/lib/google";
import { scoreWithClaude } from "@/lib/claude";
import type { ScoreRequest, ScoreResult, TravelMode } from "@/lib/types";

export const runtime = "nodejs";

const VALID_MODES: TravelMode[] = ["driving", "transit", "walking", "bicycling"];

export async function POST(req: Request) {
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

  const placeData = await findPlace(place);
  if (!placeData) {
    return NextResponse.json(
      { error: "Place not found. Try being more specific." },
      { status: 400 }
    );
  }

  const distance = from ? await getDistance(from, placeData) : null;

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
  };

  return NextResponse.json(result);
}
