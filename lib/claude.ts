import Anthropic from "@anthropic-ai/sdk";
import type {
  DistanceData,
  PlaceData,
  ScoreResult,
  TravelMode,
  Verdict,
} from "./types";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a brutally honest life optimizer. Score places on two axes.

FIRE SCORE (1–10): Quality, reputation, uniqueness, can't-get-this-elsewhere.
Use Google rating and review count as signal but apply judgment.
A 4.2 with 40 reviews is not the same as a 4.2 with 4,000 reviews.

SCHLEP SCORE (1–10): How much of a mission to access. Higher = more mission.
If the user picks a preferred travel mode, weight that mode's time most
heavily — the schlep score should reflect the friction of THAT mode
specifically (e.g. choosing walking for a 90-min walk is high schlep
even if a drive would be 15 min).
If no preferred mode is given, choose the most realistic mode yourself
(short walks under ~25 min favor walking; medium urban distances favor
transit/rideshare; long distances or off-transit places favor driving).
Also consider: parking, wait times, reservation difficulty, price_level
as proxy for formality/hassle.

Return ONLY valid JSON, no backticks, no preamble:
{
  "fire": <1–10>,
  "schlep": <1–10>,
  "fire_reason": "<one punchy headline sentence>",
  "fire_details": [
    "<bullet on reputation signals — rating, review count, what reviewers actually say>",
    "<bullet on uniqueness — what makes this place a destination vs replicable>",
    "<bullet on the strongest reason to go OR the most honest weak point>"
  ],
  "schlep_reason": "<one honest headline sentence that names the mode being scored>",
  "schlep_details": [
    "<bullet on travel friction — specific mode time, transfers, last-mile>",
    "<bullet on logistical friction — parking, reservation difficulty, wait times>",
    "<bullet on price/formality friction or time-of-day gotchas>"
  ],
  "verdict": "<Legendary Haul | Worth It | Barely Worth It | Hard Pass>",
  "verdict_reason": "<one sentence overall take>",
  "distance_note": "<short summary, e.g. '18 min transit / 9 min drive / 32 min walk'>"
}

Each bullet should be one short, concrete sentence — no fluff, no hedging.
If a category genuinely doesn't apply, omit that bullet rather than padding.`;

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
  rawPlace: string,
  preferredMode: TravelMode | undefined
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
      const marker =
        preferredMode === leg.mode ? "  ← user's preferred mode" : "";
      lines.push(`  - ${leg.mode}: ${leg.duration} (${leg.distance})${marker}`);
    }
    if (preferredMode) {
      lines.push(
        `\nThe user has chosen ${preferredMode}. Score schlep based on that mode's friction specifically.`
      );
    }
  } else if (from) {
    lines.push(`Travel time from ${from}: unavailable`);
  } else {
    lines.push(`Travel time: location not provided`);
  }
  return lines.join("\n");
}

export function parseScoreJson(text: string): Omit<
  ScoreResult,
  "place_name" | "maps_query" | "legs" | "selected_mode" | "lat" | "lng"
> {
  const trimmed = text.trim().replace(/^```(?:json)?/, "").replace(/```$/, "");
  const parsed = JSON.parse(trimmed);
  const fire = Math.max(1, Math.min(10, Number(parsed.fire)));
  const schlep = Math.max(1, Math.min(10, Number(parsed.schlep)));
  if (!Number.isFinite(fire) || !Number.isFinite(schlep)) {
    throw new Error(
      `Claude returned non-numeric score: fire=${parsed.fire}, schlep=${parsed.schlep}`
    );
  }
  const verdict: Verdict = VALID_VERDICTS.includes(parsed.verdict)
    ? parsed.verdict
    : "Worth It";
  const toBullets = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.map((x) => String(x).trim()).filter((s) => s.length > 0)
      : [];
  return {
    fire,
    schlep,
    fire_reason: String(parsed.fire_reason ?? ""),
    fire_details: toBullets(parsed.fire_details),
    schlep_reason: String(parsed.schlep_reason ?? ""),
    schlep_details: toBullets(parsed.schlep_details),
    verdict,
    verdict_reason: String(parsed.verdict_reason ?? ""),
    distance_note: String(parsed.distance_note ?? ""),
  };
}

export async function scoreWithClaude(
  place: PlaceData,
  from: string | undefined,
  distance: DistanceData,
  rawPlace: string,
  preferredMode?: TravelMode
): Promise<
  Omit<ScoreResult, "place_name" | "maps_query" | "legs" | "selected_mode" | "lat" | "lng">
> {
  const client = getClient();
  const userMessage = buildUserMessage(place, from, distance, rawPlace, preferredMode);

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
