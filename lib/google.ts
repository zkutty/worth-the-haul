import type { DistanceData, DistanceLeg, PlaceData, TravelMode } from "./types";

const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const ROUTE_MATRIX_URL =
  "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

const MODES: TravelMode[] = ["driving", "transit", "walking", "bicycling"];

const ROUTES_TRAVEL_MODE: Record<TravelMode, string> = {
  driving: "DRIVE",
  transit: "TRANSIT",
  walking: "WALK",
  bicycling: "BICYCLE",
};

const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

function getKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not set");
  return key;
}

export type PlaceLookupResult =
  | { ok: true; place: PlaceData }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "api_error"; detail: string };

// Places API (New) — the legacy findplacefromtext endpoint is closed to new
// customers and has no long-term support guarantee.
export async function findPlace(input: string): Promise<PlaceLookupResult> {
  const key = getKey();
  let res: Response;
  try {
    res = await fetch(PLACES_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.location",
      },
      body: JSON.stringify({ textQuery: input }),
    });
  } catch (err) {
    return { ok: false, reason: "api_error", detail: String(err) };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    return { ok: false, reason: "api_error", detail };
  }

  const data = await res.json();
  const candidate = data?.places?.[0];
  if (!candidate) return { ok: false, reason: "not_found" };

  return {
    ok: true,
    place: {
      name: candidate.displayName?.text ?? input,
      rating: candidate.rating,
      user_ratings_total: candidate.userRatingCount,
      price_level: candidate.priceLevel
        ? PRICE_LEVEL_MAP[candidate.priceLevel]
        : undefined,
      lat: candidate.location?.latitude,
      lng: candidate.location?.longitude,
    },
  };
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hours} hr ${rem} min` : `${hours} hr`;
}

function formatDistanceMeters(meters: number): string {
  const miles = meters / 1609.34;
  return `${miles.toFixed(1)} mi`;
}

async function routeMatrixOne(
  origin: string,
  place: PlaceData,
  mode: TravelMode
): Promise<DistanceLeg | null> {
  const key = getKey();
  const destination =
    place.lat !== undefined && place.lng !== undefined
      ? { location: { latLng: { latitude: place.lat, longitude: place.lng } } }
      : { address: place.name };

  let res: Response;
  try {
    res = await fetch(ROUTE_MATRIX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "originIndex,destinationIndex,duration,distanceMeters,condition",
      },
      body: JSON.stringify({
        origins: [{ waypoint: { address: origin } }],
        destinations: [{ waypoint: destination }],
        travelMode: ROUTES_TRAVEL_MODE[mode],
        ...(mode === "driving" ? { routingPreference: "TRAFFIC_AWARE" } : {}),
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = await res.json();
  const elements = Array.isArray(data) ? data : [];
  const element = elements[0];
  if (!element || element.condition !== "ROUTE_EXISTS") return null;

  const seconds = Number(String(element.duration ?? "0s").replace(/s$/, ""));
  const meters = Number(element.distanceMeters ?? 0);
  return {
    mode,
    duration: formatDuration(seconds),
    distance: formatDistanceMeters(meters),
    durationSeconds: seconds,
  };
}

export async function getDistance(
  origin: string,
  place: PlaceData
): Promise<DistanceData> {
  try {
    const results = await Promise.all(
      MODES.map((mode) => routeMatrixOne(origin, place, mode))
    );
    const legs = results.filter((leg): leg is DistanceLeg => leg !== null);
    if (legs.length === 0) return null;
    return { legs };
  } catch {
    return null;
  }
}
