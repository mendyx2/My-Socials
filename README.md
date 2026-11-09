# My-Socials

Personal brand manager for LinkedIn and Instagram (OI.Dev). Runs at **$0**: free AI tiers, free RSS feeds, your laptop, and GitHub Actions.

- Plan and reasoning: [`docs/PLAN.md`](docs/PLAN.md)
- Feature spec: [`docs/FEATURES.md`](docs/FEATURES.md)

## Open the tool (after the one-time setup below)

It's a web app that runs on your own computer. In a terminal, in this folder:

```bash
npm run dev
```

Then open **http://localhost:3000** in your browser. Pages: **Ideas** → **Drafts** (edit, preview slides, download ZIP) → **Profiles** → **Library** (inspiration, storyboards, photos) → **Knowledge base**. Stop it with Ctrl+C.

Nothing is published automatically: copy text with the Copy buttons and download carousels as a ZIP.

## What it does

| Feature | Status |
|---|---|
| Knowledge base (`profile/*.md`), editable in the app | ✅ |
| News → content ideas (text, carousel, video), daily | ✅ |
| Ideas board: filter, save, mark posted, reject, copy | ✅ |
| Daily Markdown digest in `digests/` via GitHub Actions | ✅ |
| AI fallback: Gemini → Groq → (optional) local Ollama | ✅ |
| **Drafts**: LinkedIn post + Instagram caption for text ideas | ✅ |
| **Video scripts**: 3 hooks, timed beats, on-screen text, shot notes, teleprompter (30/60/90 s) | ✅ |
| **Carousel content**: slide-by-slide text with layouts, ready for rendering or Canva | ✅ |
| Rewrite any one section, with an optional instruction ("shorter", "more personal") | ✅ |
| Captions from your video transcript, after recording | ✅ |
| Quality checks: length limits, "see more" cut-off, Markdown, placeholders, AI-sounding words, unsourced numbers, script timing | ✅ |
| **Visuals**: carousel slides as PNGs (1080×1350) + a LinkedIn PDF; LinkedIn banner (1584×396) with a photo-safe area + a preview; Instagram highlight covers. Rendered offline with bundled fonts, text auto-shrinks to fit. | ✅ |
| **Profile writer**: LinkedIn headline options, About, experience, skills, Featured, custom URL, Open to work, banner text; Instagram bio options, name field, usernames, link in bio, highlights, pinned posts | ✅ |
| **Launch posts** for new accounts, sent to the Ideas board with one click | ✅ |
| Profile checks: limits, recruiter keywords, book-a-call CTA, open-to-work line, consistency across platforms, placeholders | ✅ |
| Setup checklist (18 steps), version history, "mark as live", out-of-date warning when your knowledge base changes | ✅ |
| **Carousel editor**: live slide previews while you type, colour style per slide (dark/light/accent), photos on slides, duplicate/reorder, **Download ZIP** (PNGs + PDF) | ✅ |
| **Library**: upload inspiration, storyboard frames and your photos; notes; storyboards with ordered frames | ✅ |
| **Inspiration on drafts**: attach images; rewrites follow them (Gemini sees the images, other models read your notes) | ✅ |
| Publishing | ✗ Not planned: copy-paste and ZIP downloads instead |
| Analytics | ⏳ Later |

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

**5. Install the renderer's browser (once, for images)**
```bash
npx playwright install chromium
```
If you already have Google Chrome, the tool falls back to it automatically.

**6. Run it**
```bash
npm run dev
```
Open http://localhost:3000 and press **Generate ideas now**. On any idea, press **Draft it** (choose 30/60/90 s for videos) to get a full draft you can edit, rewrite section by section, and copy out. Open **Profiles** and press **Write my profiles** to set up both accounts. Or from the terminal:
```bash
npm run ideas
```

## Put it online so you can use it on your phone (Netlify, free)

The same app runs on Netlify's free plan. Your data and images are kept in Netlify Blobs (private storage that only the app can read), and a password protects everything.

**1. Deploy**
1. Make sure this repo is **private**, and that this work is on the branch Netlify will deploy (usually `main`).
2. On [netlify.com](https://www.netlify.com), sign up with GitHub → **Add new project → Import an existing project** → GitHub → pick this repo. Netlify reads `netlify.toml`, so leave the build settings as they are.

**2. Settings** (Netlify → your site → **Site configuration → Environment variables**)

| Name | Value |
|---|---|
| `APP_PASSWORD` | A password of at least 12 characters. You type it once per device. |
| `STORAGE` | `netlify` |
| `GEMINI_API_KEY` | your key (as on your laptop) |
| `GROQ_API_KEY` | your backup key (optional) |

Then **Deploys → Trigger deploy**, because settings only apply after a new deploy.

**3. Copy your knowledge base and data up** (from your laptop, once)
1. Netlify → **Site configuration → Site details** → copy the **Site ID**.
2. Netlify → your avatar → **User settings → Applications → Personal access tokens** → new token.
3. Add both to `.env.local`:
   ```
   NETLIFY_SITE_ID=...
   NETLIFY_AUTH_TOKEN=...
   ```
4. Preview, then copy (add `--media` to include library images):
   ```bash
   npm run sync -- push
   ```
   ```bash
   npm run sync -- push --yes
   ```
   `npm run sync -- pull --yes` copies everything back down, which also makes a good backup.

**4. On your phone**: open `https://<your-site>.netlify.app`, log in, then **Share → Add to Home Screen** (iPhone) or **⋮ → Install app** (Android). It opens like an app.

**5. Daily ideas while hosted**: add `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` as GitHub repository secrets too (next to the AI keys). The daily job then writes ideas straight into the app instead of committing files.

### Free-plan limits (Netlify, late 2026; check your usage page)
- The free plan gives **300 credits a month**. Each **production deploy costs about 15**, so avoid pushing code often. `netlify.toml` skips deploys when only data or docs change. Bandwidth and function time also use credits; normal personal use should stay well under the limit.
- If credits run out, Netlify **pauses the site until next month**. Your data is kept. See **Netlify → Usage**.
- Server tasks get up to 60 seconds. AI writing and rendering fit in that.
- The **first image render after a deploy is slower** (about 20–40 s), because the cloud browser (~60 MB) downloads itself. Later renders are quick.
- Uploads: big photos are shrunk in your browser (to 2160 px JPEG) before upload, to fit the hosting request limit.

### If something's wrong
- *"This app is online without a password"*: set `APP_PASSWORD` and redeploy.
- *Login keeps asking*: check the device allows cookies. Changing `APP_PASSWORD` logs out every device, which is intended.
- *Rendering fails online*: Netlify → **Logs → Functions** shows the error. You can always render on your laptop and `sync` it.

## Daily ideas on GitHub (optional, free)

1. In the repo on GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Add `GEMINI_API_KEY` and `GROQ_API_KEY`.
2. Optional **variables** (same page, Variables tab): `GEMINI_MODEL`, `GROQ_MODEL`, `IDEAS_PER_DAY`, `LLM_PROVIDERS`.
3. The workflow `.github/workflows/daily-ideas.yml` runs every day at 05:17 UTC (edit the cron for your time zone), or on demand from the **Actions** tab → *Daily content ideas* → *Run workflow*.
4. Ideas land in `data/ideas.json` and a readable digest in `digests/YYYY-MM-DD.md`.

**Keep the repo private.** It holds personal information and your ideas.

Because GitHub and your laptop both write `data/ideas.json`, **`git pull` before opening the app** and commit/push after you change idea statuses or the knowledge base.

## Customize

- **Your voice:** paste 5–10 of your real posts into `profile/voice.md` and fill in "Words I never use". Drafts copy your style from it, and the quality check flags those words.
- **About you, voice, pillars, updates, brand:** `profile/*.md` (or the *Knowledge base* page in the app). The more specific these are, especially `voice.md` with real past posts and `updates.md` with real results, the better the ideas.
- **Library images** are stored in `media/` on your computer (not committed to GitHub). Back that folder up if you care about it.
- **Visual style:** `config/theme.json` (name, roles, tagline, website, @handle, colors). Rendered images are saved in `renders/` (not committed; re-render any time).
- **News sources and keywords:** `config/feeds.json`. Each feed has a pillar; each pillar has keywords used to pre-filter news before the AI sees it (saves free-tier quota).

## Safety

- **Login**: with `APP_PASSWORD` set, every page and API needs a signed, HttpOnly session cookie (30 days). Without a password, the app only answers on `localhost`; online without a password, it refuses everything. Writes from other websites are refused.
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
src/lib/drafts/     draft formats, prompts, section rewrites, quality checks, storage
src/lib/profiles/   profile writer, checks, setup checklist, versions
src/lib/visuals/    HTML templates + headless-browser renderer (PNG/PDF/ZIP)
src/lib/media/      image library, storyboards, inspiration for the AI
src/lib/storage/    files locally / Netlify Blobs when hosted
src/lib/auth.ts     password login and session cookies
src/lib/pipeline.ts the daily job
scripts/            CLI entry points
config/feeds.json   news sources and keywords
profile/            your knowledge base
data/, digests/     generated ideas
```
