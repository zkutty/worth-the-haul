"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ATTEMPT_HEADER, OPERATION_HEADER, isUuid, type ClientReceipt } from "./measurement-contract";
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

function sendReceipt(receipt: ClientReceipt) {
  try {
    void fetch("/api/measurement", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(receipt), keepalive: true,
    }).catch(() => {});
  } catch { /* Best effort: receipt delivery never affects a decision. */ }
}

export function useScore() {
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedSearchId, setCompletedSearchId] = useState(0);
  const requestSequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const correlation = useRef<{ sequence: number; operation_id: string; attempt_id: string } | null>(null);
  const displayed = useRef<{ sequence: number; mode: TravelMode | undefined } | null>(null);

  // Effects run after React commits. Interrupted renders and stale responses
  // cannot report a display; the ref also suppresses StrictMode effect replays.
  useEffect(() => {
    const ids = correlation.current;
    if (!result || !ids || ids.sequence !== completedSearchId || ids.sequence !== requestSequence.current) return;
    try {
      if (displayed.current?.sequence !== ids.sequence) {
        displayed.current = { sequence: ids.sequence, mode: result.selected_mode };
        sendReceipt({ event: "decision_displayed", operation_id: ids.operation_id, attempt_id: ids.attempt_id, event_id: crypto.randomUUID() });
      } else if (displayed.current.mode !== result.selected_mode && result.selected_mode) {
        displayed.current.mode = result.selected_mode;
        sendReceipt({ event: "mode_changed", operation_id: ids.operation_id, attempt_id: ids.attempt_id, event_id: crypto.randomUUID(), mode: result.selected_mode });
      }
    } catch { /* telemetry must not affect the committed result */ }
  }, [result, completedSearchId]);

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
    correlation.current = null;
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      let operationId: string | undefined;
      try { operationId = crypto.randomUUID(); } catch { /* scoring continues without correlation */ }
      const response = await fetch("/api/score", {
        method: "POST", headers: { "content-type": "application/json", ...(operationId ? { [OPERATION_HEADER]: operationId } : {}) },
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
      const operation_id = response.headers.get(OPERATION_HEADER);
      const attempt_id = response.headers.get(ATTEMPT_HEADER);
      if (isUuid(operation_id) && isUuid(attempt_id)) correlation.current = { sequence, operation_id, attempt_id };
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
      if (!current || current.selected_mode === mode || !current.mode_estimates.some((entry) => entry.mode === mode)) return current;
      return freezeResult(selectResultMode(current, mode));
    });
  }, []);

  return { result, loading, error, completedSearchId, search, selectMode };
}
