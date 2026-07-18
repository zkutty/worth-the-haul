import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DistanceData, PlaceData } from "./types";

const { createMessage } = vi.hoisted(() => ({
  createMessage: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class AnthropicMock {
    messages = { create: createMessage };
  },
}));

import { scoreWithClaude } from "./claude";

const place: PlaceData = {
  name: "Test Place",
};

const distance: DistanceData = { legs: [] };

const validResponse = {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        fire: 8,
        schlep: 3,
        fire_reason: "Excellent.",
        fire_details: ["Distinctive."],
        schlep_reason: "Easy trip.",
        schlep_details: ["Direct."],
        verdict: "Worth It",
        verdict_reason: "The quality outweighs the trip.",
        distance_note: "Nearby",
      }),
    },
  ],
};

describe("scoreWithClaude", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("retries once when Claude returns malformed output", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    createMessage
      .mockResolvedValueOnce({ content: [{ type: "text", text: "not json" }] })
      .mockResolvedValueOnce(validResponse);

    const result = await scoreWithClaude(place, undefined, distance, "Test Place");

    expect(result.fire).toBe(8);
    expect(createMessage).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenCalledWith(
      "Retrying Claude score after unusable model output",
      expect.any(Error)
    );
  });

  it("does not retry API failures", async () => {
    const apiError = new Error("401 invalid API key");
    createMessage.mockRejectedValueOnce(apiError);

    await expect(
      scoreWithClaude(place, undefined, distance, "Test Place")
    ).rejects.toBe(apiError);
    expect(createMessage).toHaveBeenCalledTimes(1);
  });

  it("stops after one model-output retry", async () => {
    createMessage.mockResolvedValue({
      content: [{ type: "text", text: "still not json" }],
    });

    await expect(
      scoreWithClaude(place, undefined, distance, "Test Place")
    ).rejects.toThrow("Claude returned unusable score output");
    expect(createMessage).toHaveBeenCalledTimes(2);
  });
});
