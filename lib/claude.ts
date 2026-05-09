import Anthropic from "@anthropic-ai/sdk";
import type { DistanceData, PlaceData, ScoreResult, Verdict } from "./types";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a brutally honest life optimizer. Score places on two axes.

FIRE SCORE (1–10): Quality, reputation, uniqueness, can't-get-this-elsewhere.
Use Google rating and review count as signal but apply judgment.
A 4.2 with 40 reviews is not the same as a 4.2 with 4,000 reviews.

SCHLEP SCORE (1–10): How much of a mission to access.
Use the actual travel-time options if provided — pick the most realistic mode
(short walks under ~25 min favor walking; medium urban distances favor
transit/rideshare; long distances or off-transit places favor driving).
Also consider: parking, wait times, reservation difficulty, price_level as
proxy for formality/hassle.

Return ONLY valid JSON, no backticks, no preamble:
{
  "fire": <1–10>,
  "schlep": <1–10>,
  "fire_reason": "<one punchy sentence>",
  "schlep_reason": "<one honest sentence that names the realistic mode>",
  "verdict": "<Legendary Haul | Worth It | Barely Worth It | Hard Pass>",
  "verdict_reason": "<one sentence overall take>",
  "distance_note": "<short realistic summary, e.g. '18 min transit / 9 min drive / 32 min walk'>"
}`;

const VALID_VERDICTS: Verdict[] = [
  "Legendary Haul",
  "Worth It",
  "Barely Worth It",
  "Hard Pass",
];

function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey: key });
}

function buildUserMessage(
  place: PlaceData,
  from: string | undefined,
  distance: DistanceData,
  rawPlace: string
): string {
  const lines: string[] = [];
  lines.push(`Place: ${place.name || rawPlace}`);
  const rating =
    place.rating !== undefined
      ? `${place.rating} (${place.user_ratings_total ?? 0} reviews)`
      : "no rating data";
  lines.push(`Google rating: ${rating}`);
  const priceLevel =
    place.price_level !== undefined ? `${place.price_level}/4` : "unknown";
  lines.push(`Price level: ${priceLevel}`);
  if (from && distance && distance.legs.length > 0) {
    lines.push(`Travel options from ${from}:`);
    for (const leg of distance.legs) {
      lines.push(`  - ${leg.mode}: ${leg.duration} (${leg.distance})`);
    }
  } else if (from) {
    lines.push(`Travel time from ${from}: unavailable`);
  } else {
    lines.push(`Travel time: location not provided`);
  }
  return lines.join("\n");
}

function parseScoreJson(text: string): Omit<
  ScoreResult,
  "place_name" | "maps_query" | "legs"
> {
  const trimmed = text.trim().replace(/^```(?:json)?/, "").replace(/```$/, "");
  const parsed = JSON.parse(trimmed);
  const fire = Math.max(1, Math.min(10, Number(parsed.fire)));
  const schlep = Math.max(1, Math.min(10, Number(parsed.schlep)));
  const verdict: Verdict = VALID_VERDICTS.includes(parsed.verdict)
    ? parsed.verdict
    : "Worth It";
  return {
    fire,
    schlep,
    fire_reason: String(parsed.fire_reason ?? ""),
    schlep_reason: String(parsed.schlep_reason ?? ""),
    verdict,
    verdict_reason: String(parsed.verdict_reason ?? ""),
    distance_note: String(parsed.distance_note ?? ""),
  };
}

export async function scoreWithClaude(
  place: PlaceData,
  from: string | undefined,
  distance: DistanceData,
  rawPlace: string
): Promise<Omit<ScoreResult, "place_name" | "maps_query" | "legs">> {
  const client = getClient();
  const userMessage = buildUserMessage(place, from, distance, rawPlace);

  const callOnce = async () => {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = response.content[0];
    if (!block || block.type !== "text") {
      throw new Error("No text block in Claude response");
    }
    return parseScoreJson(block.text);
  };

  try {
    return await callOnce();
  } catch {
    return await callOnce();
  }
}
