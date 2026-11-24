# VeriLens — Visual Social Profile Finder

Upload any picture to search the **live open web** for public social profiles: exact
image matches, visually similar portraits, and real handles across **17 platforms**
(Instagram, X, LinkedIn, TikTok, YouTube, GitHub, Facebook, Threads, Bluesky, Pinterest,
Reddit, Discord, Telegram, WhatsApp, Snapchat, Medium, Mastodon).

Live reverse-image search works with **zero API keys**. PostgreSQL is only needed for
scan history, bookmarks and the built-in demo catalog.

## Deploying on Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Create a Postgres database (Neon, Supabase, or Vercel Postgres) and copy its
   connection string.
3. In **Vercel → Project → Settings → Environment Variables**, add:

   | Name | Value | Required |
   | --- | --- | --- |
   | `DATABASE_URL` | `postgresql://user:pass@host/db?sslmode=require` | Recommended |
   | `APIFY_API_TOKEN` (or `API_TOKEN`) | your Apify token | Optional |
   | `SERPAPI_API_KEY` | your SerpApi key | Optional |

   > Enable them for **Production, Preview and Development**, then **Redeploy** —
   > environment variable changes do not apply to existing deployments.

4. Create the tables once against that database from your machine:

   ```bash
   DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" npx drizzle-kit push
   ```

5. Redeploy. Check `https://your-app.vercel.app/api/health` — it returns
   `{ "ok": true, "database": true }` when persistence is connected.

### “Error: DATABASE_URL is required” during build

That error came from eagerly constructing the Postgres pool at import time. It is fixed:
the connection is now created lazily on first query, `/api/health` never throws, and the
home page renders even when the database is missing or unreachable. Without
`DATABASE_URL` the app shows a small setup banner and continues to run full live search.

### Serverless notes

- Uploads are written to `public/uploads` locally; on read-only serverless filesystems the
  app falls back to the OS temp directory and, if needed, an inline data URL.
- API keys saved from the UI are written to `.env` locally. On Vercel the filesystem is
  read-only, so the modal tells you to add the same value as an environment variable.
- `next.config.ts` traces `public/profiles` and `public/samples` into the server bundle so
  demo catalog fingerprints can be computed at runtime.

## Local development

```bash
cp .env.example .env      # set DATABASE_URL
npm install
npx drizzle-kit push      # create tables
npm run dev
```

## API

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Health + database connectivity (never 500s) |
| `POST /api/scans` | Analyze an upload (`multipart/form-data`), `sampleId`, or `imageUrl` |
| `GET /api/scans` | Recent scans summary |
| `GET/POST/DELETE /api/scans/[id]` | Load, re-scan, delete a scan |
| `PATCH /api/scans/[id]/matches/[matchId]` | Save / flag a match |
| `POST /api/website-profiles` | Scan 1–10 websites for linked social profiles |
| `GET/POST /api/settings` | Live-search provider status & optional keys |
| `GET /api/thumb?u=` | Allowlisted CDN thumbnail proxy for live results |

## Cost

Built-in live search is free. Optional providers:
Apify `automation-lab/social-media-profile-finder` — $0.035 run start + $0.001/website
($0.001/website in Standby Server mode); SerpApi — per-plan search credits.
