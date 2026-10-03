import { NextResponse } from "next/server";
import { findPlace, getDistance } from "@/lib/google";
import { scoreWithClaude } from "@/lib/claude";
import { parseScoreRequest } from "@/lib/score-contract";
import { ProviderError, requireProviderKeys } from "@/lib/provider-error";
import { checkScoreAccess } from "@/lib/score-access";
import type { ScoreRequest, ScoreResult } from "@/lib/types";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 32_768;

async function readBody(req: Request): Promise<unknown> {
  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new RangeError("Request body must be 32 KiB or smaller.");
  }
  if (!req.body) throw new SyntaxError("Invalid JSON body");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError("Request body must be 32 KiB or smaller.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function providerFailure(error: unknown) {
  if (error instanceof ProviderError) {
    console.error("score_failure", { provider: error.provider, kind: error.kind, code: error.code });
    const stage = error.provider === "places" ? "Location lookup"
      : error.provider === "routes" ? "Travel lookup" : "Scoring";
    return NextResponse.json({
      error: error.kind === "network"
        ? `${stage} could not connect. Please try again shortly.`
        : `${stage} is temporarily unavailable. Please try again later.`,
      code: `${error.provider.toUpperCase()}_${error.kind.toUpperCase()}`,
    }, { status: error.kind === "configuration" || error.kind === "quota" ? 503 : 502 });
  }
  console.error("score_failure", { provider: "scoring", kind: "unavailable" });
  return NextResponse.json({ error: "Scoring failed. Please try again.", code: "SCORING_UNAVAILABLE" }, { status: 502 });
}

export async function POST(req: Request) {
  let body: ScoreRequest;
  try {
    body = parseScoreRequest(await readBody(req));
  } catch (error) {
    return NextResponse.json({
      error: error instanceof RangeError ? error.message
        : error instanceof SyntaxError || error instanceof TypeError ? "Invalid JSON body"
        : error instanceof Error ? error.message : "Invalid request",
      code: "INVALID_REQUEST",
    }, { status: error instanceof RangeError ? 413 : 400 });
  }

  const { place, from, mode } = body;
  let placeData;
  let distance;
  let scored;
  try {
    requireProviderKeys();
    const denied = await checkScoreAccess(req);
    if (denied) return denied;
    placeData = await findPlace(place);
    if (!placeData) {
      return NextResponse.json(
        { error: "Place not found. Try being more specific.", code: "PLACE_NOT_FOUND" },
        { status: 400 }
      );
    }

    distance = from ? await getDistance(from, placeData) : null;
    scored = await scoreWithClaude(placeData, from, distance, place, mode);
  } catch (err) {
    return providerFailure(err);
  }

  // A mode change only affects schlep, not fire. Re-running Claude would
  // jitter the fire score and erode trust, so when the client sends the
  // fire it's already showing, we pin it and keep only the fresh schlep.
  if (mode && body.lockFire) {
    Object.assign(scored, body.lockFire);
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
