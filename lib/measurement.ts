import { scoreEnvironment } from "./score-access";
import { ATTEMPT_HEADER, OPERATION_HEADER, isRevision, isUuid, measurementCode, parseMeasurementRow,
  type ClientReceipt, type MeasurementOutcome, type ProviderWrapper } from "./measurement-contract";

function revision(): string | null {
  try {
    const value = scoreEnvironment().WTH_REVISION;
    return isRevision(value) ? value : null;
  } catch { return null; }
}
function elapsed(start: number): number {
  try { return Math.min(86_400_000, Math.max(0, Math.round(performance.now() - start))); }
  catch { return 0; }
}
// Never pass provider data, headers, URLs or exceptions to this boundary.
export function emitMeasurement(row: unknown): void {
  try { console.log("wth_measurement", parseMeasurementRow(row)); } catch { /* telemetry is lossy */ }
}
export function emitClientReceipt(receipt: ClientReceipt): void {
  try { emitMeasurement({ v: 1, at: new Date().toISOString(), revision: revision(), ...receipt }); } catch { /* best effort */ }
}
type ScoreMeasurement = { wrap: ProviderWrapper; finish: (response: Response, outcome: MeasurementOutcome, code: unknown) => Response };
function unmeasured(): ScoreMeasurement {
  return { wrap: (async (_provider, invoke) => invoke()) as ProviderWrapper,
    finish: (response: Response) => response };
}
export function scoreMeasurement(req: Request): ScoreMeasurement {
  try { return measuredScore(req); } catch { return unmeasured(); }
}
function measuredScore(req: Request) {
  const candidate = req.headers.get(OPERATION_HEADER);
  const operation_id = isUuid(candidate) ? candidate : crypto.randomUUID();
  const attempt_id = crypto.randomUUID();
  const common = { v: 1, operation_id, attempt_id, revision: revision() };
  const started = performance.now();
  const emit = (event: string, fields: Record<string, unknown>) => {
    try { emitMeasurement({ ...common, event, at: new Date().toISOString(), ...fields }); } catch { /* best effort */ }
  };
  emit("score_start", { traffic: req.headers.get("X-WTH-Traffic") === "controlled_smoke" ? "controlled_smoke" : "unclassified" });
  const wrap: ProviderWrapper = async (provider, invoke) => {
    // ID/timer generation and logging cannot prevent the actual provider call.
    let call_id: string | undefined;
    let start = 0;
    try {
      call_id = crypto.randomUUID(); start = performance.now();
      emit("provider_start", { provider, call_id });
    } catch { /* best effort */ }
    try {
      const value = await invoke();
      if (call_id) emit("provider_finish", { provider, call_id, elapsed_ms: elapsed(start), result: "resolved" });
      return value;
    } catch (error) {
      if (call_id) emit("provider_finish", { provider, call_id, elapsed_ms: elapsed(start), result: "rejected" });
      throw error;
    }
  };
  return {
    wrap,
    finish(response: Response, outcome: MeasurementOutcome, code: unknown): Response {
      emit("score_outcome", { status: response.status, outcome, code: measurementCode(code), elapsed_ms: elapsed(started) });
      try {
        // Budget/provider responses can have immutable fetch-response headers.
        const headers = new Headers(response.headers);
        headers.set(OPERATION_HEADER, operation_id);
        headers.set(ATTEMPT_HEADER, attempt_id);
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      } catch { return response; }
    },
  };
}
