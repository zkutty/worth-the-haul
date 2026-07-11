const REQUIRED_ENV_VARS = ["GOOGLE_MAPS_API_KEY", "ANTHROPIC_API_KEY"];

export function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Set them before starting the server."
    );
  }
}
