# Worth The Haul

Worth The Haul scores a place or experience on two axes: how good it is (the **Fire Score**) and how difficult it is to reach (the **Schlep Score**). It combines Google place and travel data with Claude to produce a verdict, supporting details, and shareable results.

The original product requirements are in [THE_REACH.md](./THE_REACH.md).

## Local development

Requirements:

- Node.js 22 or later
- A Google Maps API key with the required Places and Routes APIs enabled
- An Anthropic API key

Install dependencies and create the local environment file:

```bash
npm install
cp .env.example .env.local
```

Set both values in `.env.local`:

```dotenv
GOOGLE_MAPS_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
```

`npm run dev` deliberately removes inherited Anthropic environment variables before Next.js starts, so put the development key in `.env.local` instead of relying on a shell-level `ANTHROPIC_API_KEY`.

Start the app and open [http://localhost:3000](http://localhost:3000):

```bash
npm run dev
```

## Quality checks

Run the same checks enforced in CI:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Cloudflare Workers

Production is built with OpenNext and deployed to Cloudflare Workers. For a local Cloudflare preview, copy `.dev.vars.example` to `.dev.vars`, add the two API keys, and run:

```bash
cp .dev.vars.example .dev.vars
npm run cf:preview
```

Before the first production deployment, store both API keys as Worker secrets:

```bash
npx wrangler secret put GOOGLE_MAPS_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
```

Build and deploy the Worker configured in `wrangler.jsonc`:

```bash
npm run cf:deploy
```

The Worker serves the custom domains `worththehaul.app` and `www.worththehaul.app`.
