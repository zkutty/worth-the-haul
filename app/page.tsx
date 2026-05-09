"use client";

import { useState } from "react";
import ScoreBar from "@/components/ScoreBar";
import VerdictCard from "@/components/VerdictCard";
import MapEmbed from "@/components/MapEmbed";
import type { ScoreResult, TravelMode } from "@/lib/types";

const MODE_EMOJI: Record<TravelMode, string> = {
  driving: "🚗",
  transit: "🚆",
  walking: "🚶",
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [shareLabel, setShareLabel] = useState("Share");

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!place.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ place: place.trim(), from: from.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setResult(data as ScoreResult);
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const onShare = async () => {
    if (!result) return;
    const text = [
      `The Reach scored: ${result.place_name}`,
      `🔥 Fire: ${result.fire}/10 — ${result.fire_reason}`,
      `😮‍💨 Schlep: ${result.schlep}/10 — ${result.schlep_reason}`,
      `Verdict: ${result.verdict}`,
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

  const ratio =
    result && result.schlep > 0
      ? (result.fire / result.schlep).toFixed(2)
      : null;

  return (
    <main className="mx-auto max-w-2xl px-5 pb-20 pt-10">
      <header className="mb-8 text-center">
        <h1
          className="font-display text-7xl"
          style={{ color: "var(--text)" }}
        >
          THE REACH
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          🔥 Fire Score · 😮‍💨 Schlep Score · Is it worth the haul?
        </p>
      </header>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label
            className="mb-1 block text-xs uppercase tracking-wider"
            style={{ color: "var(--muted)" }}
          >
            What are you scoring?
          </label>
          <input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="e.g. Benu SF, hiking Mt Tam, SFO → JFK"
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
            className="mb-1 block text-xs uppercase tracking-wider"
            style={{ color: "var(--muted)" }}
          >
            Starting from?
          </label>
          <input
            value={from}
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
          disabled={loading || !place.trim()}
          className="font-display w-full rounded-xl py-4 text-2xl tracking-wider transition-opacity disabled:opacity-50"
          style={{ background: "var(--fire)", color: "#fff" }}
        >
          {loading ? "SCORING…" : "SCORE IT →"}
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

      {error && (
        <div
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
        <section className="mt-8 space-y-4">
          <MapEmbed query={result.maps_query} />

          {result.legs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {result.legs.map((leg) => (
                <div
                  key={leg.mode}
                  className="rounded-full border px-3 py-1 text-xs"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--text)",
                    background: "var(--surface)",
                  }}
                >
                  {MODE_EMOJI[leg.mode]} {leg.duration}
                  <span style={{ color: "var(--muted)" }}> · {leg.distance}</span>
                </div>
              ))}
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
            label="FIRE"
            emoji="🔥"
            reason={result.fire_reason}
          />

          <ScoreBar
            value={result.schlep}
            color="var(--schlep)"
            label="SCHLEP"
            emoji="😮‍💨"
            reason={result.schlep_reason}
          />

          {ratio && (
            <div
              className="text-center text-xs"
              style={{ color: "var(--muted)" }}
            >
              fire ÷ schlep = <span style={{ color: "var(--text)" }}>{ratio}</span>
            </div>
          )}

          <VerdictCard
            verdict={result.verdict}
            reason={result.verdict_reason}
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
