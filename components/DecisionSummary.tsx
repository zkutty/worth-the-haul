"use client";

import type { ScoreResult } from "@/lib/types";
import VerdictCard from "@/components/VerdictCard";
import type { TravelMode } from "@/lib/types";

const MODE_LABEL: Record<TravelMode, string> = {
  driving: "Drive / Uber",
  transit: "Transit",
  walking: "Walk",
  bicycling: "Bike",
};

type Props = {
  result: ScoreResult;
  onCorrect: () => void;
};

export default function DecisionSummary({ result, onCorrect }: Props) {
  const destination = result.resolvedPlace;
  const destinationName = destination?.name || "Unknown";
  const selectedLeg = result.legs.find((leg) => leg.mode === result.selected_mode);
  const mapsSource = result.evidence?.provider === "google_maps";

  return (
    <section aria-labelledby="decision-heading" className="space-y-4">
      <div
        className="rounded-xl border p-5"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <h2 id="decision-heading" className="font-display text-3xl tracking-wide">
          Your destination
        </h2>
        <p className="mt-2 text-lg" style={{ color: "var(--text)" }}>
          {destinationName}
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          {destination?.formatted_address || "Address: Unknown"}
        </p>
        <button
          type="button"
          onClick={onCorrect}
          className="mt-4 rounded-lg border px-4 py-2 text-sm transition-colors hover:border-orange-500"
          style={{
            borderColor: "var(--border)",
            color: "var(--text)",
            background: "var(--surface)",
          }}
        >
          Correct destination
        </button>
      </div>

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          AI estimate
        </p>
        <VerdictCard verdict={result.verdict} reason={result.verdict_reason} />
        <div className="rounded-xl border px-5 py-4 text-sm" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <p>
            <span style={{ color: "var(--muted)" }}>Starting from:</span> {result.from || "Unknown"}
          </p>
          <p className="mt-2">
            <span style={{ color: "var(--muted)" }}>Selected mode:</span>{" "}
            {result.selected_mode ? MODE_LABEL[result.selected_mode] : "Unknown"}
            <span className="mx-2" style={{ color: "var(--muted)" }}>·</span>
            <span style={{ color: "var(--muted)" }}>Route duration estimate:</span>{" "}
            {selectedLeg?.duration ?? "Unknown"}
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            {mapsSource ? "Google Maps route estimate; not measured." : "Route time is an estimate, not measured."}
          </p>
        </div>
      </div>
    </section>
  );
}
