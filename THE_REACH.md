# THE REACH — Claude Code Build Brief

## What You're Building

A PWA called **The Reach** that scores any place/experience on two axes:
- 🔥 **Fire Score** (1–10): How good is it?
- 😮‍💨 **Schlep Score** (1–10): How much of a mission to get there?

Combined into a **verdict**: Legendary Haul / Worth It / Barely Worth It / Hard Pass.

User inputs: what they want to score + optional starting location.
App returns: both scores, reasoning, a ratio, and an embedded map.

Target: installable PWA, works on mobile home screen, shareable links.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Maps | Google Maps JavaScript API + Places API + Distance Matrix API |
| AI | Anthropic Claude (`claude-haiku-4-5-20251001`) |
| Deploy | Vercel |
| DB | None for MVP |

---

## Environment Variables

```
GOOGLE_MAPS_API_KEY=
ANTHROPIC_API_KEY=
```

Both required. App should throw a clear error at startup if missing.

---

## Project Structure

```
the-reach/
├── app/
│   ├── layout.tsx            # root layout, PWA meta tags
│   ├── page.tsx              # main UI
│   ├── globals.css
│   └── api/
│       └── score/
│           └── route.ts      # POST handler — Google + Claude
├── components/
│   ├── ScoreBar.tsx          # animated horizontal bar
│   ├── AnimatedNumber.tsx    # count-up animation
│   ├── VerdictCard.tsx       # verdict display
│   └── MapEmbed.tsx          # Google Maps embed
├── lib/
│   ├── google.ts             # Google API helpers
│   ├── claude.ts             # Anthropic client + prompt
│   └── types.ts              # shared types
├── public/
│   ├── manifest.json         # PWA manifest
│   ├── icon-192.png
│   └── icon-512.png
├── next.config.js
├── tailwind.config.ts
└── .env.local
```

---

## API Route — `POST /api/score`

### Request body
```ts
{
  place: string       // "Benu, SF" or "hiking Mt Tam"
  from?: string       // "Hayes Valley, SF" — optional
}
```

### Processing steps

**Step 1 — Google Places lookup**

Call `findplacefromtext` to resolve the place. Extract:
- `name`
- `rating` (1–5)
- `user_ratings_total`
- `price_level` (0–4)
- `geometry.location` (lat/lng)

Endpoint:
```
GET https://maps.googleapis.com/maps/api/place/findplacefromtext/json
  ?input={place}
  &inputtype=textquery
  &fields=name,rating,user_ratings_total,price_level,geometry
  &key={GOOGLE_MAPS_API_KEY}
```

**Step 2 — Distance Matrix (if `from` provided)**

Get transit travel time from user's location to destination.

Endpoint:
```
GET https://maps.googleapis.com/maps/api/distancematrix/json
  ?origins={from}
  &destinations={place}
  &mode=transit
  &key={GOOGLE_MAPS_API_KEY}
```

Extract from response:
- `duration.text` (e.g. "34 mins")
- `distance.text` (e.g. "4.2 km")

If transit fails or returns no results, retry with `mode=driving`.

**Step 3 — Claude scoring**

Send structured data to Claude Haiku. Prompt:

```
System:
You are a brutally honest life optimizer. Score places on two axes.

FIRE SCORE (1–10): Quality, reputation, uniqueness, can't-get-this-elsewhere.
Use Google rating and review count as signal but apply judgment.
A 4.2 with 40 reviews is not the same as a 4.2 with 4,000 reviews.

SCHLEP SCORE (1–10): How much of a mission to access.
Use actual travel time if provided. Also consider: parking, wait times,
reservation difficulty, price_level as proxy for formality/hassle.

Return ONLY valid JSON, no backticks, no preamble:
{
  "fire": <1–10>,
  "schlep": <1–10>,
  "fire_reason": "<one punchy sentence>",
  "schlep_reason": "<one honest sentence>",
  "verdict": "<Legendary Haul | Worth It | Barely Worth It | Hard Pass>",
  "verdict_reason": "<one sentence overall take>",
  "distance_note": "<e.g. '34 min by transit' or 'location not provided'>"
}

User:
Place: {name}
Google rating: {rating} ({user_ratings_total} reviews)
Price level: {price_level}/4
Travel time from {from}: {duration} ({distance})
```

### Response shape
```ts
type ScoreResult = {
  fire: number
  schlep: number
  fire_reason: string
  schlep_reason: string
  verdict: "Legendary Haul" | "Worth It" | "Barely Worth It" | "Hard Pass"
  verdict_reason: string
  distance_note: string
  place_name: string        // from Google Places
  maps_query: string        // URL-encoded place for map embed
}
```

---

## Frontend — `app/page.tsx`

### UI sections (top to bottom)

**Header**
- Title: "THE REACH" — large, Bebas Neue font (load from Google Fonts)
- Tagline: "🔥 Fire Score · 😮‍💨 Schlep Score · Is it worth the haul?"

**Input form**
- Input 1: "What are you scoring?" — placeholder: `e.g. Benu SF, hiking Mt Tam, SFO → JFK`
- Input 2: "Starting from?" — placeholder: `e.g. Hayes Valley, SF` (optional)
- Button: "SCORE IT →"
- 3 example chips below button (pre-fill both inputs on click):
  - "Din Tai Fung, Seattle" from "Capitol Hill, Seattle"
  - "Benu, SF" from "Mission District, SF"
  - "Joe's Pizza, NYC" from "Midtown Manhattan"

**Loading state**
- Show 3 skeleton cards with shimmer animation while fetching

**Results (shown after scoring)**
- Google Maps embed (iframe, no API key needed)
- Distance chip if location provided
- Fire Score card: animated bar (orange `#FF4500`) + count-up number + reason text
- Schlep Score card: animated bar (steel blue `#4A7FA5`) + count-up number + reason text + fire÷schlep ratio
- Verdict card: color-coded by verdict (gold/green/orange/red)

### Verdict color map
```ts
const VERDICT_COLORS = {
  "Legendary Haul": { color: "#FFD700", emoji: "👑" },
  "Worth It":       { color: "#00CC66", emoji: "✅" },
  "Barely Worth It":{ color: "#FF9900", emoji: "🤔" },
  "Hard Pass":      { color: "#FF3B3B", emoji: "🚫" },
}
```

### Sharing
- After result loads, show a "Share" button
- Clicking copies a pre-formatted text to clipboard:
  ```
  The Reach scored: {place_name}
  🔥 Fire: {fire}/10 — {fire_reason}
  😮‍💨 Schlep: {schlep}/10 — {schlep_reason}
  Verdict: {verdict}
  ```

---

## Design Tokens

```css
--bg:        #060606
--surface:   #0D0D0D
--border:    #1C1C1C
--text:      #EFEFEF
--muted:     #555555
--fire:      #FF4500
--schlep:    #4A7FA5
--radius:    12px
```

Font: Bebas Neue (display/numbers) + DM Sans (body) — both from Google Fonts.
Load in `app/layout.tsx` via `<link>` tag, not `next/font` (simpler for this project).

Dark background throughout. No light mode needed.

---

## PWA Config

### `public/manifest.json`
```json
{
  "name": "The Reach",
  "short_name": "The Reach",
  "description": "Is it worth the haul?",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#060606",
  "theme_color": "#FF4500",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### `app/layout.tsx` — required meta tags
```tsx
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#FF4500" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="The Reach" />
<link rel="apple-touch-icon" href="/icon-192.png" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

Generate icons: use any 512×512 flame/reach graphic — even a simple orange circle with 🔥 is fine for MVP.

---

## Error Handling

- If Google Places returns no results: return a 400 with `{ error: "Place not found. Try being more specific." }`
- If Claude returns unparseable JSON: retry once, then return a 500
- If Distance Matrix fails: proceed without distance data, set `distance_note: "travel time unavailable"`
- Frontend: show inline error message, never crash

---

## Setup Commands

```bash
npx create-next-app@latest the-reach --typescript --tailwind --app --src-dir=false
cd the-reach
npm install @anthropic-ai/sdk
```

Add `.env.local`:
```
GOOGLE_MAPS_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
```

Run locally:
```bash
npm run dev
# → http://localhost:3000
```

---

## Deploy

```bash
npm install -g vercel
vercel deploy
```

Add env vars in Vercel dashboard under Project → Settings → Environment Variables.

---

## Google Maps API Setup

In Google Cloud Console:
1. Enable: **Places API**, **Distance Matrix API**
2. No Maps JavaScript API needed (using iframe embeds, not JS SDK)
3. Restrict the API key to these two APIs
4. Add HTTP referrer restrictions once deployed

---

## Out of Scope for MVP

- User accounts / saved scores
- Score history
- Shareable permalink URLs
- Chrome extension
- Notifications
- Offline mode

Build the simplest thing that scores a place and renders the result. Ship it.
