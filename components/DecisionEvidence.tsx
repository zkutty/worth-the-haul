"use client";

import type { ScoreResult, TravelMode } from "@/lib/types";

type Props = {
  result: ScoreResult;
  onCorrect: () => void;
};

const MODE_LABEL: Record<TravelMode, string> = {
  driving: "Driving",
  transit: "Transit",
  walking: "Walking",
  bicycling: "Bicycling",
};

const MODE_SHORT_LABEL: Record<TravelMode, string> = {
  driving: "Drive / Uber",
  transit: "Transit",
  walking: "Walk",
  bicycling: "Bike",
};

function priceLabel(level: number | undefined) {
  if (level == null) return "Unknown";
  if (level === 0) return "Free (Google price level 0)";
  return `${"$".repeat(Math.min(level, 4))} (Google price level ${level})`;
}

export default function DecisionEvidence({ result, onCorrect }: Props) {
  const place = result.resolvedPlace;
  const placeName = place?.name || "Unknown";
  const exactPlaceQuery = place?.name && place.formatted_address
    ? `${place.name}, ${place.formatted_address}`
    : place?.lat != null && place.lng != null
      ? `${place.lat},${place.lng}`
      : undefined;
  const mapsUrl = exactPlaceQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(exactPlaceQuery)}${place?.place_id ? `&query_place_id=${encodeURIComponent(place.place_id)}` : ""}`
    : undefined;
  const mapsSource = result.evidence?.provider === "google_maps";
  const selectedMode = result.selected_mode;
  const selectedLeg = result.legs.find((leg) => leg.mode === selectedMode);

  return (
    <details className="rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <summary className="cursor-pointer px-5 py-4 font-display text-xl tracking-wide">
        Destination evidence and assumptions
      </summary>
      <div className="space-y-5 border-t px-5 py-4" style={{ borderColor: "var(--border)" }}>
        <section aria-labelledby="google-place-facts">
          <h3 id="google-place-facts" className="text-sm font-semibold">
            Google Maps place facts
          </h3>
          <dl className="mt-3 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
            <dt style={{ color: "var(--muted)" }}>Selected place</dt>
            <dd>
              {mapsUrl ? (
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {placeName}
                </a>
              ) : placeName}
            </dd>
            <dt style={{ color: "var(--muted)" }}>Exact address</dt>
            <dd>{place?.formatted_address || "Unknown"}</dd>
            <dt style={{ color: "var(--muted)" }}>Rating</dt>
            <dd>{place?.rating ?? "Unknown"}</dd>
            <dt style={{ color: "var(--muted)" }}>Rating count</dt>
            <dd>{place?.user_ratings_total ?? "Unknown"}</dd>
            <dt style={{ color: "var(--muted)" }}>Price level</dt>
            <dd>{priceLabel(place?.price_level)}</dd>
            <dt style={{ color: "var(--muted)" }}>Coordinates</dt>
            <dd>
              {place?.lat != null && place.lng != null ? `${place.lat}, ${place.lng}` : "Unknown"}
            </dd>
          </dl>
          {mapsSource ? (
            <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
              Place details supplied by Google Maps.
            </p>
          ) : (
            <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
              Source for place details: Unknown.
            </p>
          )}
        </section>

        <section aria-labelledby="route-estimates">
          <h3 id="route-estimates" className="text-sm font-semibold">
            {mapsSource ? "Google Maps route estimates (not measured)" : "Route estimates (not measured)"}
          </h3>
          <dl className="mt-3 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
            <dt style={{ color: "var(--muted)" }}>Starting point</dt>
            <dd>{result.from || "Unknown"}</dd>
            <dt style={{ color: "var(--muted)" }}>Selected mode</dt>
            <dd>{selectedMode ? MODE_SHORT_LABEL[selectedMode] : "Unknown"}</dd>
            <dt style={{ color: "var(--muted)" }}>Selected route duration</dt>
            <dd>{selectedLeg?.duration ?? "Unknown"}</dd>
            <dt style={{ color: "var(--muted)" }}>Selected route distance</dt>
            <dd>{selectedLeg?.distance ?? "Unknown"}</dd>
          </dl>
          {result.legs.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm" aria-label="Available route estimates">
              {result.legs.map((leg) => (
                <li key={leg.mode}>
                  {MODE_LABEL[leg.mode]}: {leg.duration} · {leg.distance}
                  {leg.mode === selectedMode ? " (selected)" : ""}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
            Travel duration is an estimate, not a measurement of your trip.
          </p>
        </section>

        <section aria-labelledby="ai-mode-estimates">
          <h3 id="ai-mode-estimates" className="text-sm font-semibold">AI mode estimates</h3>
          {result.mode_estimates?.length ? (
            <ul className="mt-2 space-y-2 text-sm">
              {result.mode_estimates.map((estimate) => (
                <li key={estimate.mode}>
                  {MODE_LABEL[estimate.mode]}: Schlep {estimate.schlep}/10. {estimate.reason}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>Unknown</p>
          )}
        </section>

        <section aria-labelledby="unknown-assumptions">
          <h3 id="unknown-assumptions" className="text-sm font-semibold">Not established by this result</h3>
          <dl className="mt-3 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
            <dt style={{ color: "var(--muted)" }}>Parking</dt><dd>Unknown</dd>
            <dt style={{ color: "var(--muted)" }}>Wait time</dt><dd>Unknown</dd>
            <dt style={{ color: "var(--muted)" }}>Review text</dt><dd>Unknown</dd>
            <dt style={{ color: "var(--muted)" }}>Location uniqueness</dt><dd>Unknown</dd>
            <dt style={{ color: "var(--muted)" }}>Other logistics</dt><dd>Unknown</dd>
          </dl>
          <button
            type="button"
            onClick={onCorrect}
            className="mt-4 rounded-lg border px-4 py-2 text-sm transition-colors hover:border-orange-500"
            style={{ borderColor: "var(--border)", color: "var(--text)", background: "var(--surface)" }}
          >
            Correct destination
          </button>
        </section>
      </div>
    </details>
  );
}
