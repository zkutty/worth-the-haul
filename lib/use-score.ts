"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { selectResultMode } from "./decision";
import { parseScoreRequest, parseScoreResult } from "./score-contract";
import type { ScoreRequest, ScoreResult, TravelMode } from "./types";

function freezeResult(result: ScoreResult): ScoreResult {
  result.legs.forEach(Object.freeze);
  result.mode_estimates.forEach(Object.freeze);
  Object.freeze(result.legs);
  Object.freeze(result.mode_estimates);
  Object.freeze(result.fire_details);
  Object.freeze(result.schlep_details);
  if (result.resolvedPlace) Object.freeze(result.resolvedPlace);
  if (result.evidence) Object.freeze(result.evidence);
  return Object.freeze(result);
}

export function useScore() {
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedSearchId, setCompletedSearchId] = useState(0);
  const requestSequence = useRef(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => {
    requestSequence.current += 1;
    controller.current?.abort();
  }, []);

  const search = useCallback(async (input: ScoreRequest) => {
    // Capture a trimmed, immutable trip before any await or input edit.
    const trip = Object.freeze(parseScoreRequest(input));
    const sequence = ++requestSequence.current;
    controller.current?.abort();
    const activeController = new AbortController();
    controller.current = activeController;
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/score", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(trip), signal: activeController.signal,
      });
      const data: unknown = await response.json();
      if (sequence !== requestSequence.current) return;
      if (!response.ok) {
        const message = data && typeof data === "object" && "error" in data ? data.error : undefined;
        setError(typeof message === "string" && message.length <= 500 ? message : "Scoring failed. Please try again.");
        return;
      }
      const parsed = parseScoreResult(data);
      if (parsed.from !== trip.from) throw new Error("Response origin does not match the committed trip");
      setResult(freezeResult(parsed));
      setCompletedSearchId(sequence);
    } catch (cause) {
      if (sequence !== requestSequence.current || activeController.signal.aborted) return;
      setError(cause instanceof TypeError ? "Network error. Try again." : "Scoring returned an unusable result. Please try again.");
    } finally {
      // Aborted or slow requests cannot clear the latest request's loading state.
      if (sequence === requestSequence.current) {
        setLoading(false);
        controller.current = null;
      }
    }
  }, []);

  const selectMode = useCallback((mode: TravelMode) => {
    setResult((current) => {
      if (!current || !current.mode_estimates.some((entry) => entry.mode === mode)) return current;
      return freezeResult(selectResultMode(current, mode));
    });
  }, []);

  return { result, loading, error, completedSearchId, search, selectMode };
}
