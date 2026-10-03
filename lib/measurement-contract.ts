import schema from "./measurement-schema.json";
import type { TravelMode } from "./types";

export const OPERATION_HEADER = "X-WTH-Operation-Id";
export const ATTEMPT_HEADER = "X-WTH-Attempt-Id";
export type MeasurementProvider = "places" | "routes" | "model";
export type MeasurementOutcome = "success" | "invalid" | "denied" | "not_found" | "provider_failure" | "unusable_result" | "failure";
export type MeasurementEvent = keyof typeof schema.events;
export type ClientReceipt = { event: "decision_displayed"; operation_id: string; attempt_id: string; event_id: string }
  | { event: "mode_changed"; operation_id: string; attempt_id: string; event_id: string; mode: TravelMode };
export type MeasurementRow = Record<string, unknown> & { event: MeasurementEvent };
export type ProviderWrapper = <T>(provider: MeasurementProvider, invoke: () => Promise<T>) => Promise<T>;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export function isRevision(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every(field => Object.hasOwn(value, field));
}
function member(value: unknown, values: readonly string[]): boolean {
  return typeof value === "string" && values.includes(value);
}
function integer(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
function validField(field: string, value: unknown): boolean {
  switch (field) {
    case "v": return value === schema.version;
    case "event": return typeof value === "string" && Object.hasOwn(schema.events, value);
    case "at": return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
    case "operation_id": case "attempt_id": case "call_id": case "event_id": return isUuid(value);
    case "revision": return value === null || isRevision(value);
    case "traffic": return member(value, schema.traffic);
    case "provider": return member(value, schema.providers);
    case "outcome": return member(value, schema.outcomes);
    case "code": return member(value, schema.codes);
    case "result": return member(value, schema.providerResults);
    case "mode": return member(value, schema.modes);
    case "elapsed_ms": return integer(value, 0, 86_400_000);
    case "status": return integer(value, 100, 599);
    default: return false;
  }
}
export function parseMeasurementRow(value: unknown): MeasurementRow {
  if (!record(value) || typeof value.event !== "string" || !Object.hasOwn(schema.events, value.event)) {
    throw new TypeError("Invalid measurement event");
  }
  const fields = [...schema.common, ...schema.events[value.event as MeasurementEvent]];
  if (!exactFields(value, fields) || !fields.every(field => validField(field, value[field]))) {
    throw new TypeError("Invalid measurement fields");
  }
  return { ...value } as MeasurementRow;
}
export function parseClientReceipt(value: unknown): ClientReceipt {
  if (!record(value) || (value.event !== "decision_displayed" && value.event !== "mode_changed")) {
    throw new TypeError("Invalid receipt event");
  }
  const fields = ["event", "operation_id", "attempt_id", ...schema.events[value.event]];
  if (!exactFields(value, fields) || !fields.every(field => validField(field, value[field]))) {
    throw new TypeError("Invalid receipt fields");
  }
  return { ...value } as ClientReceipt;
}
export function measurementCode(value: unknown): string {
  return member(value, schema.codes) ? value as string : "UNKNOWN_FAILURE";
}
