"use client";

import { useEffect, useRef, useState } from "react";
import ScoreBar from "@/components/ScoreBar";
import DecisionSummary from "@/components/DecisionSummary";
import DecisionEvidence from "@/components/DecisionEvidence";
import { useScore } from "@/lib/use-score";
import MapEmbed from "@/components/MapEmbed";
import RatioCard from "@/components/RatioCard";
import { MAX_FROM_LENGTH, MAX_PLACE_LENGTH } from "@/lib/score-contract";
import type { TravelMode } from "@/lib/types";

const MODE_EMOJI: Record<TravelMode, string> = {
  driving: "🚗",
  transit: "🚆",
  walking: "🚶",
  bicycling: "🚲",
};

const MODE_LABEL: Record<TravelMode, string> = {
  driving: "Drive / Uber",
  transit: "Transit",
  walking: "Walk",
  bicycling: "Bike",
};

const EXAMPLES: { place: string; from: string }[] = [
  { place: "Din Tai Fung, Seattle", from: "Capitol Hill, Seattle" },
  { place: "Benu, SF", from: "Mission District, SF" },
  { place: "Joe's Pizza, NYC", from: "Midtown Manhattan" },
];

function Skeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="shimmer h-32 w-full rounded-xl border"
          style={{ borderColor: "var(--border)" }}
        />
      ))}
    </div>
  );
}

export default function Page() {
  const [place, setPlace] = useState("");
  const [from, setFrom] = useState("");
  const { result, loading, error, completedSearchId, search, selectMode } = useScore();
  const [shareLabel, setShareLabel] = useState("Share");
  const placeInput = useRef<HTMLInputElement>(null);
  const resultSummary = useRef<HTMLElement>(null);

  useEffect(() => {
    if (completedSearchId > 0) resultSummary.current?.focus();
  }, [completedSearchId]);

  const correctDestination = () => {
    placeInput.current?.focus();
    placeInput.current?.select();
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!place.trim()) return;
    void search({ place: place.trim(), ...(from.trim() ? { from: from.trim() } : {}) });
  };

  const onShare = async () => {
    if (!result) return;
    const text = [
      `Worth The Haul scored: ${result.place_name}`,
      `🔥 Fire: ${result.fire}/10 — ${result.fire_reason}`,
      `😮‍💨 Schlep: ${result.schlep}/10 — ${result.schlep_reason}`,
      `Verdict: ${result.verdict}`,
      `https://worththehaul.app`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setShareLabel("Copied ✓");
      setTimeout(() => setShareLabel("Share"), 2000);
    } catch {
      setShareLabel("Copy failed");
      setTimeout(() => setShareLabel("Share"), 2000);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-5 pb-20 pt-10">
      <header className="mb-8 text-center">
        <h1
          className="font-display text-7xl leading-none"
          style={{ color: "var(--text)" }}
        >
          WORTH<br />THE HAUL
        </h1>
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          🔥 Fire Score · 😮‍💨 Schlep Score · Is the trip worth it?
        </p>
      </header>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label
            htmlFor="place"
            className="mb-1 block text-xs uppercase tracking-wider"
            style={{ color: "var(--muted)" }}
          >
            What are you scoring?
          </label>
          <input
            id="place"
            ref={placeInput}
            value={place}
            maxLength={MAX_PLACE_LENGTH}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="e.g. Benu, San Francisco"
            className="w-full rounded-xl border px-4 py-3 outline-none focus:border-orange-500"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          />
        </div>
        <div>
          <label
            htmlFor="from"
            className="mb-1 block text-xs uppercase tracking-wider"
            style={{ color: "var(--muted)" }}
          >
            Starting from?
          </label>
          <input
            id="from"
            value={from}
            maxLength={MAX_FROM_LENGTH}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="e.g. Hayes Valley, SF (optional)"
            className="w-full rounded-xl border px-4 py-3 outline-none focus:border-orange-500"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={!place.trim()}
          className="font-display w-full rounded-xl py-4 text-2xl tracking-wider transition-opacity disabled:opacity-50"
          style={{ background: "var(--fire)", color: "#fff" }}
        >
          {loading ? "SCORE NEW TRIP →" : "SCORE IT →"}
        </button>

        <div className="flex flex-wrap gap-2 pt-1">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.place}
              type="button"
              onClick={() => {
                setPlace(ex.place);
                setFrom(ex.from);
              }}
              className="rounded-full border px-3 py-1 text-xs transition-colors hover:border-orange-500"
              style={{
                borderColor: "var(--border)",
                color: "var(--muted)",
                background: "var(--surface)",
              }}
            >
              {ex.place}
            </button>
          ))}
        </div>
      </form>

      <p role="status" aria-live="polite" className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
        {loading ? "Scoring your destination…" : result
          ? `AI estimate ready${result.selected_mode ? ` for ${MODE_LABEL[result.selected_mode]}` : "; travel time unknown"}.`
          : ""}
      </p>

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-xl border p-4 text-sm"
          style={{
            borderColor: "#FF3B3B",
            color: "#FF3B3B",
            background: "var(--surface)",
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-8">
          <Skeleton />
        </div>
      )}

      {result && !loading && (
        <section ref={resultSummary} tabIndex={-1} aria-labelledby="decision-heading" className="mt-8 space-y-4">
          <DecisionSummary result={result} onCorrect={correctDestination} />

          {result.legs.length > 0 && (
            <div>
              <div
                className="mb-2 text-[10px] uppercase tracking-wider"
                style={{ color: "var(--muted)" }}
              >
                Choose travel mode · uses this trip’s existing estimates
              </div>
              <div className="flex flex-wrap gap-2">
                {result.legs.map((leg) => {
                  const selected = result.selected_mode === leg.mode;
                  return (
                    <button
                      key={leg.mode}
                      type="button"
                      onClick={() => selectMode(leg.mode)}
                      aria-pressed={selected}
                      className="rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50"
                      style={{
                        borderColor: selected ? "var(--fire)" : "var(--border)",
                        color: selected ? "var(--fire)" : "var(--text)",
                        background: "var(--surface)",
                      }}
                    >
                      {MODE_EMOJI[leg.mode]} {MODE_LABEL[leg.mode]} · {leg.duration}
                      <span style={{ color: "var(--muted)" }}> · {leg.distance}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {result.distance_note && (
            <div
              className="text-xs"
              style={{ color: "var(--muted)" }}
            >
              📍 {result.distance_note}
            </div>
          )}

          <ScoreBar
            value={result.fire}
            color="var(--fire)"
            label="FIRE · AI ESTIMATE"
            emoji="🔥"
            reason={result.fire_reason}
            details={result.fire_details}
            higherIsBetter
          />

          <ScoreBar
            value={result.schlep}
            color="var(--schlep)"
            label="SCHLEP · AI ESTIMATE"
            emoji="😮‍💨"
            reason={result.schlep_reason}
            details={result.schlep_details}
            higherIsBetter={false}
          />

          <RatioCard fire={result.fire} schlep={result.schlep} />

          <DecisionEvidence result={result} onCorrect={correctDestination} />

          <MapEmbed
            query={result.maps_query}
            name={result.place_name}
            lat={result.lat}
            lng={result.lng}
            placeId={result.resolvedPlace?.place_id}
            address={result.resolvedPlace?.formatted_address}
          />

          <button
            onClick={onShare}
            className="font-display w-full rounded-xl border py-3 text-xl tracking-wider"
            style={{
              borderColor: "var(--border)",
              color: "var(--text)",
              background: "var(--surface)",
            }}
          >
            {shareLabel}
          </button>
        </section>
      )}
    </main>
  );
}
