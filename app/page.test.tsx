// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Page from "./page";
import { decisionFor } from "@/lib/decision";
import type { ScoreResult } from "@/lib/types";

const fixture: ScoreResult = {
  fire: 8, schlep: 3, fire_reason: "AI estimate: appeal based on supplied rating.", fire_details: [],
  schlep_reason: "AI estimate: moderate driving effort.", schlep_details: ["AI estimate: based on Google route: driving · 30 mins · 20 km."],
  ...decisionFor(8, 3, "driving"), distance_note: "driving: 30 mins (20 km)",
  place_name: "Original branch", maps_query: "Original%20branch", from: "Original origin",
  resolvedPlace: { name: "Original branch", formatted_address: "10 First St", place_id: "branch-a", rating: 4.2 },
  evidence: { provider: "google_maps", assessment: "ai_estimate" }, selected_mode: "driving",
  legs: [{ mode: "driving", duration: "30 mins", distance: "20 km", durationSeconds: 1800 }, { mode: "walking", duration: "3 hours", distance: "15 km", durationSeconds: 10800 }],
  mode_estimates: [{ mode: "driving", schlep: 3, reason: "AI estimate: moderate driving effort." }, { mode: "walking", schlep: 9, reason: "AI estimate: high walking effort." }],
};
function inputTrip(place = "Typed original", from = "Original origin") {
  fireEvent.change(screen.getByLabelText("What are you scoring?"), { target: { value: place } });
  fireEvent.change(screen.getByLabelText("Starting from?"), { target: { value: from } });
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("current trip page integration", () => {
  it("labels inputs, places identity and verdict first, focuses new results and preserves mode-control focus", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(fixture));
    vi.stubGlobal("fetch", fetchMock);
    render(<Page />);
    const place = screen.getByLabelText("What are you scoring?") as HTMLInputElement;
    expect(place.placeholder).not.toContain("SFO");
    inputTrip();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "SCORE IT →" })); });
    expect(screen.getByRole("heading", { name: "Your destination" })).toBeDefined();
    expect(document.activeElement?.getAttribute("aria-labelledby")).toBe("decision-heading");
    const verdict = screen.getByText("Legendary Haul");
    const mapUnknown = screen.getByText(/Map location unknown/);
    expect(verdict.compareDocumentPosition(mapUnknown) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Drive / Uber");
    inputTrip("Edited destination", "Edited origin");
    const walk = screen.getByRole("button", { name: /Walk · 3 hours/ });
    walk.focus();
    fireEvent.click(walk);
    expect(document.activeElement).toBe(walk);
    expect(walk.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Hard Pass")).toBeDefined();
    expect(screen.getAllByText("Original origin", { exact: false })).toHaveLength(2);
    expect(screen.getAllByText("Original branch")).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toContain("Walk");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Correct destination" })[0]);
    expect(document.activeElement).toBe(place);
    expect(place.value).toBe("Edited destination");
  });
  it("allows replacement submissions while loading and displays only the latest result", async () => {
    let resolveOld!: (response: Response) => void;
    let resolveNew!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockReturnValueOnce(new Promise<Response>(resolve => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise<Response>(resolve => { resolveNew = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Page />);
    inputTrip();
    fireEvent.click(screen.getByRole("button", { name: "SCORE IT →" }));
    expect(screen.getByRole("status").textContent).toContain("Scoring");
    inputTrip("New typed", "New origin");
    fireEvent.click(screen.getByRole("button", { name: "SCORE NEW TRIP →" }));
    await act(async () => { resolveOld(Response.json(fixture)); });
    expect(screen.queryByRole("heading", { name: "Your destination" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Scoring");
    await act(async () => { resolveNew(Response.json({ ...fixture, from: "New origin", place_name: "New branch", maps_query: "New%20branch", resolvedPlace: { ...fixture.resolvedPlace, name: "New branch" } })); });
    expect(screen.getAllByText("New branch")).toHaveLength(2);
    expect(screen.queryByText("Original branch")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("AI estimate ready");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("announces controlled server errors with no previous result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Place not found. Try being more specific." }, { status: 400 })));
    render(<Page />);
    inputTrip();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "SCORE IT →" })); });
    expect(screen.getByRole("alert").textContent).toContain("Place not found");
    expect(screen.queryByRole("heading", { name: "Your destination" })).toBeNull();
  });
});
