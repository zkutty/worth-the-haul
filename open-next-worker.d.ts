// OpenNext generates this module after Next's typecheck/build step.
declare module "*.open-next/worker.js" {
  const handler: {
    fetch(request: Request, env: unknown, context: unknown): Promise<Response>;
  };
  export default handler;
}
