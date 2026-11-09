# My-Socials

Personal brand manager for LinkedIn and Instagram (OI.Dev). Runs at **$0**: free AI tiers, free RSS feeds, your laptop, and GitHub Actions.

- Plan and reasoning: [`docs/PLAN.md`](docs/PLAN.md)
- Feature spec: [`docs/FEATURES.md`](docs/FEATURES.md)

## What works today (stage 1)

| Feature | Status |
|---|---|
| Knowledge base (`profile/*.md`), editable in the app | ✅ |
| News → content ideas (text, carousel, video), daily | ✅ |
| Ideas board: filter, save, mark posted, reject, copy | ✅ |
| Daily Markdown digest in `digests/` via GitHub Actions | ✅ |
| AI fallback: Gemini → Groq → (optional) local Ollama | ✅ |
| Drafting full posts and video scripts | ⏳ next |
| Carousel / banner rendering | ⏳ |
| Profile writer and audit | ⏳ (manual drafts in `profile/drafts/`) |
| Publishing, analytics | ⏳ |

## Setup (about 10 minutes)

**1. Get free AI keys**
- Gemini: https://aistudio.google.com/apikey
- Groq (backup): https://console.groq.com/keys

**2. Install and configure**
```bash
npm install
```
```bash
cp .env.example .env.local
```
Paste your keys into `.env.local`. Never commit this file (it's in `.gitignore`).

**3. Check which models your key can use** (model names change often)
```bash
npm run models
```
If `gemini-flash-latest` isn't listed, put one of the listed Flash models in `GEMINI_MODEL`.

**4. Check the news feeds**
```bash
npm run feeds:check
```
Fix or replace any broken feeds in `config/feeds.json`.

**5. Run it**
```bash
npm run dev
```
Open http://localhost:3000 and press **Generate ideas now**. Or from the terminal:
```bash
npm run ideas
```

## Daily ideas on GitHub (optional, free)

1. In the repo on GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Add `GEMINI_API_KEY` and `GROQ_API_KEY`.
2. Optional **variables** (same page, Variables tab): `GEMINI_MODEL`, `GROQ_MODEL`, `IDEAS_PER_DAY`, `LLM_PROVIDERS`.
3. The workflow `.github/workflows/daily-ideas.yml` runs every day at 05:17 UTC (edit the cron for your time zone), or on demand from the **Actions** tab → *Daily content ideas* → *Run workflow*.
4. Ideas land in `data/ideas.json` and a readable digest in `digests/YYYY-MM-DD.md`.

**Keep the repo private.** It holds personal information and your ideas.

Because GitHub and your laptop both write `data/ideas.json`, **`git pull` before opening the app** and commit/push after you change idea statuses or the knowledge base.

## Customize

- **About you, voice, pillars, updates, brand:** `profile/*.md` (or the *Knowledge base* page in the app). The more specific these are, especially `voice.md` with real past posts and `updates.md` with real results, the better the ideas.
- **News sources and keywords:** `config/feeds.json`. Each feed has a pillar; each pillar has keywords used to pre-filter news before the AI sees it (saves free-tier quota).

## Safety

- The app has **no login**. API routes only answer requests to `localhost`. Don't deploy it publicly as is.
- News text is treated as untrusted. The AI is told to ignore instructions inside articles, and only links to articles it was actually given are kept, so it can't invent sources.
- The AI is told never to invent statistics or results. Still, **always review before posting.**
- Free AI tiers may use prompts to improve their models. Don't put anything confidential in `profile/`.

## Development

```bash
npm test
```
```bash
npm run typecheck
```

Structure:
```
app/                Next.js UI + API routes (local only)
src/lib/kb.ts       knowledge base read/write
src/lib/llm/        Gemini + OpenAI-compatible (Groq, Ollama) providers with fallback
src/lib/news/       feed config, fetching, dedupe, relevance scoring
src/lib/ideas/      prompt, AI output validation, storage, digest
src/lib/pipeline.ts the daily job
scripts/            CLI entry points
config/feeds.json   news sources and keywords
profile/            your knowledge base
data/, digests/     generated ideas
```
