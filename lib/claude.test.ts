import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DistanceData, PlaceData } from "./types";

const { createMessage, clientOptions } = vi.hoisted(() => ({
  createMessage: vi.fn(),
  clientOptions: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class AnthropicMock {
    constructor(options: unknown) {
      clientOptions(options);
    }
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
        mode_estimates: [],
      }),
    },
  ],
};

describe("scoreWithClaude", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("supplies the resolved identity and observed facts separately from estimated judgments", async () => {
    createMessage.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify({ ...JSON.parse(validResponse.content[0].text), mode_estimates: [{ mode: "walking", schlep: 3, reason: "Walking estimate." }] }) }] });
    await scoreWithClaude({ name: "Same Name", formatted_address: "10 First St, City A", place_id: "branch-a", rating: 4.2, user_ratings_total: 40, price_level: 2 },
      "Committed Origin", { legs: [{ mode: "walking", duration: "30 mins", distance: "2 km", durationSeconds: 1800 }] }, "Raw Name", "walking");
    const request = createMessage.mock.calls[0][0];
    expect(request.max_tokens).toBe(600);
    expect(request.messages[0].content).toContain('Resolved place: "Same Name"');
    expect(request.messages[0].content).toContain('Formatted address: "10 First St, City A"');
    expect(request.messages[0].content).toContain('Google place ID: "branch-a"');
    expect(request.messages[0].content).toContain("Google rating: 4.2/5");
    expect(request.messages[0].content).toContain("Google rating count: 40");
    expect(request.messages[0].content).toContain('Travel options from "Committed Origin"');
    expect(request.messages[0].content).toContain("walking: 30 mins (2 km)");
    expect(request.system).toContain("All scores, reasons, details, and the verdict are AI estimates");
    expect(request.system).toContain("using ONLY the supplied provider facts");
    expect(request.system).toContain("Do not use prior");
    expect(request.system).toContain("Reviewer sentiment, uniqueness, parking, waits, reservations, transfers,");
    expect(request.system).toContain("Do not claim them or speculate; state unknown when relevant");
    expect(request.system).not.toContain("what reviewers actually say");
    expect(request.system).not.toContain("no hedging");
    expect(request.system).not.toContain("proxy for formality/hassle");
  });

  it("keeps missing rating count unknown even when a rating is present", async () => {
    createMessage.mockResolvedValue(validResponse);
    await scoreWithClaude({ name: "Sparse", rating: 4.2 }, undefined, null, "Sparse");
    const message = createMessage.mock.calls[0][0].messages[0].content;
    expect(message).toContain("Google rating count: unknown");
    expect(message).toContain("Formatted address: unknown");
    expect(message).toContain("Price level: unknown");
    expect(message).toContain("Travel time: unknown (origin not provided)");
    expect(message).not.toContain("0 reviews");
  });

  it("keeps a supplied count without fabricating a missing rating", async () => {
    createMessage.mockResolvedValue(validResponse);
    await scoreWithClaude({ name: "Sparse", user_ratings_total: 0 }, "Origin", null, "Sparse", "transit");
    const message = createMessage.mock.calls[0][0].messages[0].content;
    expect(message).toContain("Google rating: unknown");
    expect(message).toContain("Google rating count: 0");
    expect(message).toContain('Travel time from "Origin": unknown (unavailable)');
    expect(message).toContain("Preferred mode: transit; route unavailable. Use the first supplied mode, or travel effort unknown if none.");
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
      "Retrying Claude score after unusable model output"
    );
    expect(clientOptions).toHaveBeenCalledWith({ apiKey: "test-key", maxRetries: 0, timeout: 20_000 });
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
    vi.spyOn(console, "warn").mockImplementation(() => {});
    createMessage.mockResolvedValue({
      content: [{ type: "text", text: "still not json" }],
    });

    await expect(
      scoreWithClaude(place, undefined, distance, "Test Place")
    ).rejects.toThrow("Claude returned unusable score output");
    expect(createMessage).toHaveBeenCalledTimes(2);
  });

  it.each([
    { content: [] },
    { content: [{ type: "tool_use" }] },
    { content: [{ type: "text", text: "null" }] },
    { content: [{ type: "text", text: "[]" }] },
    { content: [{ type: "text", text: "{}" }] },
    { content: [{ type: "text", text: validResponse.content[0].text.replace('"fire":8', '"fire":"8"') }] },
    { content: [{ type: "text", text: validResponse.content[0].text.replace('"schlep":3', '"schlep":11') }] },
    { content: [{ type: "text", text: validResponse.content[0].text.replace('"Worth It"', '"Unknown"') }] },
    { content: [{ type: "text", text: validResponse.content[0].text.replace('"Excellent."', '" "') }] },
    { content: [{ type: "text", text: validResponse.content[0].text.replace('["Direct."]', '[7]') }] },
  ])("retries invalid output once then terminates %#", async (response) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    createMessage.mockResolvedValue(response);

    await expect(scoreWithClaude(place, undefined, distance, "Test Place")).rejects.toThrow("Claude returned unusable score output");
    expect(createMessage).toHaveBeenCalledTimes(2);
  });

  it("sanitizes parse errors and retry logging", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    createMessage.mockResolvedValue({ content: [{ type: "text", text: "private model value" }] });

    const error = await scoreWithClaude(place, undefined, distance, "Test Place").catch((error: Error) => error);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toHaveProperty("cause");
    expect(String(error)).not.toContain("private model value");
    expect(warning.mock.calls).toEqual([["Retrying Claude score after unusable model output"]]);
  });

  it("accepts valid JSON wrapped in a code fence", async () => {
    createMessage.mockResolvedValue({ content: [{ type: "text", text: `\`\`\`json\n${validResponse.content[0].text}\n\`\`\`` }] });
    expect((await scoreWithClaude(place, undefined, distance, "Test Place")).verdict).toBe("Worth It");
    expect(createMessage).toHaveBeenCalledTimes(1);
  });

  it("does not retry an API failure during model-output recovery", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const apiError = new Error("Provider unavailable");
    createMessage
      .mockResolvedValueOnce({ content: [{ type: "text", text: "invalid" }] })
      .mockRejectedValueOnce(apiError);
    await expect(scoreWithClaude(place, undefined, distance, "Test Place")).rejects.toBe(apiError);
    expect(createMessage).toHaveBeenCalledTimes(2);
  });
  it("requests and validates all four supplied modes within the original 600 token cap", async () => {
    const modes = ["driving", "transit", "walking", "bicycling"] as const;
    const legs = modes.map((mode, i) => ({ mode, duration: `${i + 1} hours`, distance: "10 km", durationSeconds: (i + 1) * 3600 }));
    const output = { ...JSON.parse(validResponse.content[0].text), mode_estimates: modes.map((mode, i) => ({ mode, schlep: i + 2, reason: `${mode} effort estimate.` })) };
    createMessage.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(output) }] });
    const result = await scoreWithClaude(place, "Origin", { legs }, "Test", "transit");
    expect(result.mode_estimates).toHaveLength(4);
    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(createMessage.mock.calls[0][0].max_tokens).toBe(600);
    expect(createMessage.mock.calls[0][0].system).toContain("EACH supplied travel mode");
  });
  it("retries incomplete mode coverage once and fails without accepting partial output", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    createMessage.mockResolvedValue(validResponse);
    await expect(scoreWithClaude(place, "Origin", { legs: [{ mode: "walking", duration: "1 hour", distance: "5 km", durationSeconds: 3600 }] }, "Test")).rejects.toThrow("unusable score output");
    expect(createMessage).toHaveBeenCalledTimes(2);
  });

});
