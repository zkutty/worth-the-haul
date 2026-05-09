import { NextResponse } from "next/server";
import { findPlace, getDistance } from "@/lib/google";
import { scoreWithClaude } from "@/lib/claude";
import type { ScoreRequest, ScoreResult } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: ScoreRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const place = (body.place ?? "").trim();
  const from = body.from?.trim() || undefined;

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

  const distance = from ? await getDistance(from, place) : null;

  let scored;
  try {
    scored = await scoreWithClaude(placeData, from, distance, place);
  } catch (err) {
    console.error("Claude scoring failed:", err);
    return NextResponse.json(
      { error: "Scoring failed. Please try again." },
      { status: 500 }
    );
  }

  if (from && !distance && !scored.distance_note) {
    scored.distance_note = "travel time unavailable";
  }

  const result: ScoreResult = {
    ...scored,
    place_name: placeData.name,
    maps_query: encodeURIComponent(placeData.name),
  };

  return NextResponse.json(result);
}
