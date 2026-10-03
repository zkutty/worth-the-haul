// Keep OpenNext's generated request handler; the only additional export is the
// shared scoring reservation counter. This entry is bundled by Wrangler.
import handler from "./.open-next/worker.js";

export default handler;
export { ScoreBudget } from "./lib/score-budget";
