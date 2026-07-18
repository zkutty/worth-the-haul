// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScoreBar from "./ScoreBar";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ScoreBar", () => {
  it("animates the displayed score from zero to its result value", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      })
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    render(
      <ScoreBar
        value={8.4}
        color="#f97316"
        label="Fire"
        emoji="🔥"
        reason="Excellent"
        higherIsBetter
      />
    );

    expect(screen.getByText("0.0")).toBeDefined();

    act(() => frames.shift()?.(0));
    act(() => frames.shift()?.(900));

    expect(screen.getByText("8.4")).toBeDefined();
  });
});
