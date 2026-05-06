# Menu JSON Analyzer

Internal tool for the Flipdish menu team. Paste a menu JSON, get an AI-powered audit.

## Deploy to Vercel

**1. Push to a Git repo** (GitHub/GitLab/Bitbucket) — easiest path. Or use the Vercel CLI:

```
npm i -g vercel
cd menu-analyzer-vercel
vercel
```

**2. Add the API key as a secret env var** in the Vercel project:

- Vercel dashboard → your project → **Settings → Environment Variables**
- Name: `ANTHROPIC_API_KEY`
- Value: your `sk-ant-...` key
- Environments: tick all three (Production, Preview, Development)
- Click **Save**, then **Redeploy** (Deployments tab → ⋯ → Redeploy) so the function picks up the new var.

**3. Restrict access** (important — without this, anyone with the URL can burn your credits):

- Vercel dashboard → **Settings → Deployment Protection** → enable **Vercel Authentication** (free, requires Vercel login) or **Password Protection** (Pro plan).

**4. Share the URL** with the menu team.

## Files

- `index.html` — the UI (no API key field; sends JSON to `/api/analyze`)
- `api/analyze.js` — Vercel Edge Function that proxies to Anthropic with the secret key

## Notes

- Model: `claude-sonnet-4-5`. To change, edit the `model` field in `api/analyze.js`.
- The prompt asks for image and upsell counts, but Flipdish menu exports don't include image URLs and don't have a literal "upsell" field — counts will read 0 on real menus. Worth adjusting the prompt before wider rollout.
