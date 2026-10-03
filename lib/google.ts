import type { DistanceData, DistanceLeg, PlaceData, TravelMode } from "./types";
import { ProviderError } from "./provider-error";

const PLACES_URL =
  "https://maps.googleapis.com/maps/api/place/findplacefromtext/json";
const DISTANCE_URL =
  "https://maps.googleapis.com/maps/api/distancematrix/json";

const MODES: TravelMode[] = ["driving", "transit", "walking", "bicycling"];

function getKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new ProviderError("places", "configuration", "missing_key");
  return key;
}

async function googleJson(url: string, provider: "places" | "routes") {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new ProviderError(provider, "network", "fetch_failed");
  }
  if (!response.ok) {
    const kind = response.status === 401 || response.status === 403
      ? "configuration"
      : response.status === 429 ? "quota" : "response";
    throw new ProviderError(provider, kind, `http_${response.status}`);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ProviderError(provider, "response", "invalid_json");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ProviderError(provider, "response", "invalid_shape");
  }
  switch (data.status) {
    case "OK":
    case "ZERO_RESULTS": return data;
    case "REQUEST_DENIED":
    case "INVALID_REQUEST": throw new ProviderError(provider, "configuration", data.status);
    case "OVER_QUERY_LIMIT":
    case "OVER_DAILY_LIMIT": throw new ProviderError(provider, "quota", data.status);
    default: throw new ProviderError(provider, "response", "invalid_status");
  }
}

export async function findPlace(input: string): Promise<PlaceData | null> {
  const key = getKey();
  const params = new URLSearchParams({
    input,
    inputtype: "textquery",
    fields: "name,rating,user_ratings_total,price_level,geometry,formatted_address",
    key,
  });
  const data = await googleJson(`${PLACES_URL}?${params.toString()}`, "places");
  if (data.status === "ZERO_RESULTS") return null;
  const candidate = data?.candidates?.[0];
  if (!candidate || typeof candidate.name !== "string" || !candidate.name.trim()) {
    throw new ProviderError("places", "response", "invalid_candidate");
  }
  return {
    name: candidate.name ?? input,
    rating: candidate.rating,
    user_ratings_total: candidate.user_ratings_total,
    price_level: candidate.price_level,
    lat: candidate.geometry?.location?.lat,
    lng: candidate.geometry?.location?.lng,
  };
}

async function distanceMatrixOne(
  origin: string,
  destination: string,
  mode: TravelMode
): Promise<DistanceLeg | null> {
  const key = getKey();
  const params = new URLSearchParams({
    origins: origin,
    destinations: destination,
    mode,
    key,
  });
  const data = await googleJson(`${DISTANCE_URL}?${params.toString()}`, "routes");
  if (data.status === "ZERO_RESULTS") return null;
  const element = data?.rows?.[0]?.elements?.[0];
  if (element?.status === "ZERO_RESULTS" || element?.status === "NOT_FOUND") return null;
  if (element?.status !== "OK" || typeof element.duration?.text !== "string" ||
      typeof element.distance?.text !== "string" || !Number.isFinite(element.duration?.value) ||
      element.duration.value < 0) {
    throw new ProviderError("routes", "response", "invalid_element");
  }
  return {
    mode,
    duration: element.duration?.text ?? "",
    distance: element.distance?.text ?? "",
    durationSeconds: Number(element.duration?.value ?? 0),
  };
}

export async function getDistance(
  origin: string,
  place: PlaceData
): Promise<DistanceData> {
  const destination =
    place.lat !== undefined && place.lng !== undefined
      ? `${place.lat},${place.lng}`
      : place.name;
  const results = await Promise.all(
    MODES.map((mode) => distanceMatrixOne(origin, destination, mode))
  );
  const legs = results.filter((leg): leg is DistanceLeg => leg !== null);
  return legs.length ? { legs } : null;
}
