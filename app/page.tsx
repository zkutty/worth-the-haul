"use client";

import { useEffect, useRef, useState } from "react";
import ScoreBar from "@/components/ScoreBar";
import VerdictCard from "@/components/VerdictCard";
import MapEmbed from "@/components/MapEmbed";
import RatioCard from "@/components/RatioCard";
import type { ScoreResult, TravelMode } from "@/lib/types";

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

const MAX_INPUT_LENGTH = 200;
const SHARE_PARAM = "s";

function encodeResult(result: ScoreResult): string {
  const json = JSON.stringify(result);
  const base64 = btoa(unescape(encodeURIComponent(json)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeResult(encoded: string): ScoreResult | null {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(base64)));
    return JSON.parse(json) as ScoreResult;
  } catch {
    return null;
  }
}

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
  const [rescoringMode, setRescoringMode] = useState<TravelMode | null>(null);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      if (event.reason == null) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get(SHARE_PARAM);
    if (!shared) return;
    const decoded = decodeResult(shared);
    if (decoded) {
      setResult(decoded);
      setPlace(decoded.place_name);
      setFrom(decoded.from ?? "");
    }
  }, []);

  const fetchScore = async (opts?: {
    mode?: TravelMode;
    replaceResult?: boolean;
    placeOverride?: string;
    fromOverride?: string;
  }) => {
    const mode = opts?.mode;
    const replaceResult = opts?.replaceResult ?? true;
    const placeValue = (opts?.placeOverride ?? place).trim();
    const fromValue = (opts?.fromOverride ?? from).trim();
    if (!placeValue) return;

    const seq = ++requestSeqRef.current;
    let lockFire;
    let knownPlace;
    let knownLegs;

    if (replaceResult) {
      window.history.replaceState(null, "", window.location.pathname);
      setLoading(true);
      setResult(null);
    } else {
      setRescoringMode(mode ?? null);
      // Mode rescores must not move the fire score, so send back the
      // fire we're already showing and let the server pin it.
      if (result) {
        lockFire = {
          fire: result.fire,
          fire_reason: result.fire_reason,
          fire_details: result.fire_details,
        };
        // The place and every travel leg are already known — the server
        // can skip re-querying Google entirely for a mode-only rescore.
        knownPlace = {
          name: result.place_name,
          rating: result.rating,
          user_ratings_total: result.user_ratings_total,
          price_level: result.price_level,
          lat: result.lat,
          lng: result.lng,
        };
        knownLegs = result.legs;
      }
    }
    setError(null);
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          place: placeValue,
          from: fromValue || undefined,
          mode,
          lockFire,
          knownPlace,
          knownLegs,
        }),
      });
      const data = await res.json();
      if (seq !== requestSeqRef.current) return;
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setResult(data as ScoreResult);
      }
    } catch {
      if (seq !== requestSeqRef.current) return;
      setError("Network error. Try again.");
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
        setRescoringMode(null);
      }
    }
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    fetchScore();
  };

  const onShare = async () => {
    if (!result) return;
    const url = `${window.location.origin}${window.location.pathname}?${SHARE_PARAM}=${encodeResult(result)}`;
    const text = [
      `Worth The Haul scored: ${result.place_name}`,
      `🔥 Fire: ${result.fire}/10 — ${result.fire_reason}`,
      `😮‍💨 Schlep: ${result.schlep}/10 — ${result.schlep_reason}`,
      `Verdict: ${result.verdict}`,
      url,
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
            className="mb-1 block text-xs uppercase tracking-wider"
            style={{ color: "var(--muted)" }}
          >
            What are you scoring?
          </label>
          <input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="e.g. Benu SF, hiking Mt Tam, SFO → JFK"
            maxLength={MAX_INPUT_LENGTH}
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
            maxLength={MAX_INPUT_LENGTH}
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
                fetchScore({ placeOverride: ex.place, fromOverride: ex.from });
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
          <MapEmbed
            query={result.maps_query}
            name={result.place_name}
            lat={result.lat}
            lng={result.lng}
          />

          {result.legs.length > 0 && (
            <div>
              <div
                className="mb-2 text-[10px] uppercase tracking-wider"
                style={{ color: "var(--muted)" }}
              >
                Pick your mode to rescore
              </div>
              <div className="flex flex-wrap gap-2">
                {result.legs.map((leg) => {
                  const selected = result.selected_mode === leg.mode;
                  const isRescoringThis = rescoringMode === leg.mode;
                  return (
                    <button
                      key={leg.mode}
                      type="button"
                      onClick={() => fetchScore({ mode: leg.mode, replaceResult: false })}
                      disabled={rescoringMode !== null}
                      className="rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50"
                      style={{
                        borderColor: selected ? "var(--fire)" : "var(--border)",
                        color: selected ? "var(--fire)" : "var(--text)",
                        background: "var(--surface)",
                      }}
                    >
                      {isRescoringThis ? "⏳" : MODE_EMOJI[leg.mode]} {MODE_LABEL[leg.mode]}
                      {isRescoringThis ? " · rescoring…" : ` · ${leg.duration}`}
                      {!isRescoringThis && (
                        <span style={{ color: "var(--muted)" }}> · {leg.distance}</span>
                      )}
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
            label="FIRE"
            emoji="🔥"
            reason={result.fire_reason}
            details={result.fire_details}
            higherIsBetter
          />

          <ScoreBar
            value={result.schlep}
            color="var(--schlep)"
            label="SCHLEP"
            emoji="😮‍💨"
            reason={result.schlep_reason}
            details={result.schlep_details}
            higherIsBetter={false}
          />

          <RatioCard fire={result.fire} schlep={result.schlep} />

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
