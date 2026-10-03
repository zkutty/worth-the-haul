import { parseClientReceipt } from "@/lib/measurement-contract";
import { emitClientReceipt } from "@/lib/measurement";

export const runtime = "nodejs";
const MAX_BYTES = 1024;

async function readReceipt(req: Request): Promise<unknown> {
  if (Number(req.headers.get("content-length")) > MAX_BYTES) throw new RangeError();
  if (!req.body) throw new TypeError();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); throw new RangeError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export async function POST(req: Request) {
  try {
    const receipt = parseClientReceipt(await readReceipt(req));
    emitClientReceipt(receipt);
  } catch (error) {
    return Response.json({ error: "Invalid measurement receipt" }, { status: error instanceof RangeError ? 413 : 400 });
  }
  return new Response(null, { status: 204 });
}
