export type Verdict =
  | "Legendary Haul"
  | "Worth It"
  | "Barely Worth It"
  | "Hard Pass";

export type TravelMode = "driving" | "transit" | "walking";

export type ScoreRequest = {
  place: string;
  from?: string;
};

export type DistanceLeg = {
  mode: TravelMode;
  duration: string;
  distance: string;
  durationSeconds: number;
};

export type DistanceData = {
  legs: DistanceLeg[];
} | null;

export type ScoreResult = {
  fire: number;
  schlep: number;
  fire_reason: string;
  schlep_reason: string;
  verdict: Verdict;
  verdict_reason: string;
  distance_note: string;
  place_name: string;
  maps_query: string;
  legs: DistanceLeg[];
};

export type PlaceData = {
  name: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  lat?: number;
  lng?: number;
};
