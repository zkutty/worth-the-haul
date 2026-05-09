import type { DistanceData, DistanceLeg, PlaceData, TravelMode } from "./types";

const PLACES_URL =
  "https://maps.googleapis.com/maps/api/place/findplacefromtext/json";
const DISTANCE_URL =
  "https://maps.googleapis.com/maps/api/distancematrix/json";

const MODES: TravelMode[] = ["driving", "transit", "walking", "bicycling"];

function getKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not set");
  return key;
}

export async function findPlace(input: string): Promise<PlaceData | null> {
  const key = getKey();
  const params = new URLSearchParams({
    input,
    inputtype: "textquery",
    fields: "name,rating,user_ratings_total,price_level,geometry,formatted_address",
    key,
  });
  const res = await fetch(`${PLACES_URL}?${params.toString()}`);
  if (!res.ok) return null;
  const data = await res.json();
  const candidate = data?.candidates?.[0];
  if (!candidate) return null;
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
  const res = await fetch(`${DISTANCE_URL}?${params.toString()}`);
  if (!res.ok) return null;
  const data = await res.json();
  const element = data?.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") return null;
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
  try {
    const results = await Promise.all(
      MODES.map((mode) => distanceMatrixOne(origin, destination, mode))
    );
    const legs = results.filter((leg): leg is DistanceLeg => leg !== null);
    if (legs.length === 0) return null;
    return { legs };
  } catch {
    return null;
  }
}
