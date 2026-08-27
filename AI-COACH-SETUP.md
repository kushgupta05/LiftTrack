# LiftTrack AI Coach setup

AI Coach uses the Vercel serverless function at `/api/ai-coach`. A plain static server cannot execute this endpoint.

## Local development

Install Node.js, then from the LiftTrack project root run:

```powershell
npx vercel dev --listen 4173
```

Create an ignored `.env.local` with these variable names and your real values. Never place these values in `script.js` or `index.html`.

```text
OPENAI_API_KEY=
OPENAI_MODEL=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

`OPENAI_MODEL` is optional; the endpoint defaults to `gpt-5-mini`. The other three variables are required. Use the same Supabase project URL and publishable key as the app. Do not use a service-role key.

## Vercel

In the Vercel project, open **Settings → Environment Variables** and add `OPENAI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`. Add `OPENAI_MODEL` only when overriding the default. Select the environments that should run AI Coach (Production and any desired Preview/Development environments), save them, then redeploy manually for the changes to apply.

The function verifies the browser's Supabase access token through Supabase Auth before contacting OpenAI. Its in-memory per-user rate limit is basic v1 protection: serverless cold starts and multiple instances do not share the counter. A shared rate-limit store is a future production-hardening option.
