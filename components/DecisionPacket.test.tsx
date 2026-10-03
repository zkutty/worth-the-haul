// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScoreResult } from "@/lib/types";
import DecisionEvidence from "./DecisionEvidence";
import DecisionSummary from "./DecisionSummary";

const result: ScoreResult = {
  fire: 8.2,
  schlep: 4,
  fire_reason: "AI estimate: promising food.",
  fire_details: ["AI estimate: seasonal menu."],
  schlep_reason: "AI estimate: a long trip.",
  schlep_details: ["AI estimate: route distance adds effort."],
  verdict: "Worth It",
  verdict_reason: "AI estimate: the trip looks worthwhile.",
  distance_note: "Route estimate",
  place_name: "Cafe North",
  maps_query: "Cafe%20North",
  legs: [{ mode: "driving", duration: "24 mins", distance: "8.1 mi", durationSeconds: 1440 }],
  selected_mode: "driving",
  from: "Union Square",
  resolvedPlace: {
    name: "Cafe North",
    formatted_address: "10 Example Street, New York, NY",
    place_id: "place-123",
    rating: 4.1,
    user_ratings_total: 0,
    price_level: 0,
    lat: 40.7,
    lng: -73.9,
  },
  evidence: { provider: "google_maps", assessment: "ai_estimate" },
  mode_estimates: [{ mode: "driving", schlep: 4, reason: "AI estimate: route appears manageable." }],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("decision packet components", () => {
  it("puts the resolved destination and correction action before the AI decision", () => {
    const onCorrect = vi.fn();
    render(<DecisionSummary result={result} onCorrect={onCorrect} />);

    expect(screen.getAllByRole("heading", { name: "Your destination" })).toHaveLength(1);
    expect(document.querySelectorAll("#decision-heading")).toHaveLength(1);
    const destination = screen.getByText("Cafe North");
    const correct = screen.getByRole("button", { name: "Correct destination" });
    const estimates = screen.getByText("AI estimate", { exact: true });
    expect(destination.compareDocumentPosition(correct) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(correct.compareDocumentPosition(estimates) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(correct);
    expect(onCorrect).toHaveBeenCalledOnce();
    expect(screen.getByText("AI estimate: the trip looks worthwhile.")).toBeDefined();
    expect(screen.getByText("Selected mode:").parentElement?.textContent).toContain("Drive / Uber");
    expect(screen.getByText("Route duration estimate:").parentElement?.textContent).toContain("24 mins");
  });

  it("keeps Google facts distinct, preserves zero values, and labels route times as estimates", () => {
    const onCorrect = vi.fn();
    render(<DecisionEvidence result={result} onCorrect={onCorrect} />);

    expect(screen.getByText("Destination evidence and assumptions")).toBeDefined();
    expect(screen.getByText("Google Maps place facts")).toBeDefined();
    expect(screen.getByText("Place details supplied by Google Maps.")).toBeDefined();
    expect(screen.getByText("Rating").nextElementSibling?.textContent).toBe("4.1");
    expect(screen.getByText("Rating count").nextElementSibling?.textContent).toBe("0");
    expect(screen.getByText("Free (Google price level 0)")).toBeDefined();
    expect(screen.getByText("Google Maps route estimates (not measured)")).toBeDefined();
    expect(screen.getByText("Travel duration is an estimate, not a measurement of your trip.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Correct destination" }));
    expect(onCorrect).toHaveBeenCalledOnce();
  });

  it("shows missing evidence as unknown and uses a native disclosure", () => {
    const incomplete: ScoreResult = {
      ...result,
      resolvedPlace: { name: "Cafe North" },
      evidence: { provider: "google_maps", assessment: "ai_estimate" },
      from: undefined,
      selected_mode: undefined,
      legs: [],
      mode_estimates: [],
    };
    render(<DecisionEvidence result={incomplete} onCorrect={vi.fn()} />);

    const disclosure = screen.getByText("Destination evidence and assumptions").closest("details");
    expect(disclosure?.open).toBe(false);
    fireEvent.click(screen.getByText("Destination evidence and assumptions"));
    expect(disclosure?.open).toBe(true);
    expect(screen.getByText("Exact address").nextElementSibling?.textContent).toBe("Unknown");
    expect(screen.getByText("Rating").nextElementSibling?.textContent).toBe("Unknown");
    expect(screen.getByText("Rating count").nextElementSibling?.textContent).toBe("Unknown");
    expect(screen.getByText("Price level").nextElementSibling?.textContent).toBe("Unknown");
    expect(screen.getByText("Coordinates").nextElementSibling?.textContent).toBe("Unknown");
    expect(screen.getByText("Selected mode").nextElementSibling?.textContent).toBe("Unknown");
    expect(screen.getByText("Starting point").nextElementSibling?.textContent).toBe("Unknown");
    expect(screen.getByText("Parking").nextElementSibling?.textContent).toBe("Unknown");
    expect(screen.getByText("Wait time").nextElementSibling?.textContent).toBe("Unknown");
    expect(screen.getByText("Review text").nextElementSibling?.textContent).toBe("Unknown");
    expect(screen.getByText("Location uniqueness").nextElementSibling?.textContent).toBe("Unknown");
  });
});
