import type { DistanceData, PlaceData } from "./types";

const PLACES_URL =
  "https://maps.googleapis.com/maps/api/place/findplacefromtext/json";
const DISTANCE_URL =
  "https://maps.googleapis.com/maps/api/distancematrix/json";

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
    fields: "name,rating,user_ratings_total,price_level,geometry",
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

async function distanceMatrix(
  origin: string,
  destination: string,
  mode: "transit" | "driving"
): Promise<DistanceData> {
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
    duration: element.duration?.text ?? "",
    distance: element.distance?.text ?? "",
    mode,
  };
}

export async function getDistance(
  origin: string,
  destination: string
): Promise<DistanceData> {
  try {
    const transit = await distanceMatrix(origin, destination, "transit");
    if (transit) return transit;
    const driving = await distanceMatrix(origin, destination, "driving");
    return driving;
  } catch {
    return null;
  }
}
