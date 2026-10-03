export type ProviderFailure = "configuration" | "quota" | "network" | "response";

// Only a fixed classification enters logs/responses. Fetch and SDK errors can
// contain API keys, URLs, customer locations, or model output.
export class ProviderError extends Error {
  constructor(
    readonly provider: "places" | "routes" | "scoring",
    readonly kind: ProviderFailure,
    readonly code: string
  ) {
    super(`${provider}:${kind}:${code}`);
    this.name = "ProviderError";
  }
}

export function requireProviderKeys(): void {
  if (!process.env.GOOGLE_MAPS_API_KEY?.trim()) {
    throw new ProviderError("places", "configuration", "missing_key");
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new ProviderError("scoring", "configuration", "missing_key");
  }
}
