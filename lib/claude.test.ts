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
});
