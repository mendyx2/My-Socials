# My-Socials — Plan & Validation

A personal brand assistant for **one user** (me) covering **LinkedIn** and **Instagram**, inspired by Kleo.so.
Hard constraint: **$0 running cost.**

_Last researched: November 2026. API policies and free tiers change often, so re-check the items marked ⚠️ before building on them._

---

## 1. Goal

1. Keep a **personal knowledge base** (bio, career history, opinions, wins, tone of voice, past posts) that I update from time to time.
2. Generate **content ideas** from the latest **industry news**, matched to my background.
3. **Draft posts** in my voice, formatted for each platform (LinkedIn text/carousel vs Instagram caption + image).
   - **Video ideas and scripts** (I edit the videos myself, outside the tool).
   - **Carousels in infographic style**: ideas, slide copy, and finished slide images/PDFs.
4. **Set up and refresh my profiles**: LinkedIn headline/About/banner and Instagram bio, kept in line with my knowledge base.
5. **Schedule/publish** to LinkedIn and Instagram, or hand off a ready-to-post draft.
6. Track **what performed**, to feed back into ideas.

---

## 2. Is it feasible? Each piece checked

| Capability | Feasible at $0? | Notes |
|---|---|---|
| Personal knowledge base | ✅ Yes | Markdown/JSON files in this repo, or SQLite. No service needed. |
| Industry news ingest | ✅ Yes | RSS feeds (Google News RSS per keyword, industry blogs, Hacker News API, Reddit RSS, Substack feeds). Avoid paid news APIs; NewsAPI's free plan is dev-only with delayed articles. |
| AI idea and draft generation | ✅ Yes, with caveats ⚠️ | Free LLM API tiers exist (Google Gemini Flash, Groq, OpenRouter free models), but **they get cut without notice.** Gemini's free quota was reportedly cut sharply in Dec 2025 and narrowed again in 2026. Need a fallback: a local model through **Ollama** (truly free, but needs a decent laptop). |
| Publish to **LinkedIn personal profile** | 🟡 Probably | The "Share on LinkedIn" product (`w_member_social`) lets an app post as the signed-in member. Sources disagree on whether it is fully self-serve in 2026 ⚠️. Tokens expire about every 60 days, so I must sign in again periodically. |
| Read **LinkedIn analytics** for a personal profile | ❌ Not realistically | Member post analytics and reading your own feed sit behind restricted or partner APIs. Scraping breaks LinkedIn's terms and risks a ban. **Do it manually**: export or copy numbers from LinkedIn's creator analytics. |
| Publish to **Instagram** | 🟡 Yes, with setup | Needs an **Instagram Creator or Business account linked to a Facebook Page** and a Meta developer app. Personal IG accounts cannot use the API. Apps in **development mode** can use permissions for accounts that hold a role on the app (i.e. me) without full App Review ⚠️ (verify). Images must be at a public URL, and JPEG only. |
| Read **Instagram insights** | ✅ Yes | The Insights API works for Creator/Business accounts on the same app. |
| Hosting / scheduling | ✅ Yes | **GitHub Actions** cron (free; minutes are unlimited on public repos, ~2,000/month on private) or run locally. Optional UI: Streamlit/Next.js on a free tier, or simply local. |
| Video ideas + scripts | ✅ Yes | Same free LLM calls as text. No video files involved. |
| Carousel / infographic creation | ✅ Yes | LLM writes slide content as structured data → fixed HTML/CSS templates → rendered to PNG (Instagram) and PDF (LinkedIn) with Playwright. All free and local. |
| Profile/bio writing | ✅ Yes (writing); ❌ no auto-update | Neither LinkedIn nor Instagram offers an API for a personal app to edit your profile or bio. The tool writes the text and banner; I paste and upload them. |
| Image generation for IG | 🟡 Limited | Free image-gen APIs are scarce or unreliable. Use templated graphics (HTML→PNG with Playwright, or Canva free) instead of AI images. |

**Verdict: technically feasible at $0 for a single user.** The weak spots are LinkedIn analytics (manual only), free-LLM reliability, and Meta/LinkedIn developer setup friction.

---

## 3. Unbiased validation: should I build this at all?

### Arguments against building
- **Free existing tools already cover about 70–80% of it:**
  - Scheduling: LinkedIn's native post scheduler, Meta Business Suite (free IG scheduling), Buffer's free plan (a few channels, limited queue).
  - Ideas and drafts: a free ChatGPT / Claude / Gemini chat with a "project" or saved instructions holding my bio and voice, plus Feedly or Google Alerts for news.
- **Maintenance is the real cost.** APIs change (Kleo itself had to rebuild after LinkedIn shut its extension), free tiers shrink, and tokens expire. "$0" means $0 money, not $0 time.
- **The bottleneck in personal branding is usually consistency and taste, not tooling.** A tool doesn't fix not posting.
- Paid tools like Kleo (~$99/mo) win on polish. A DIY version will be rougher.

### Arguments for building
- **Kleo-level personalization is the part free tools do badly**, especially news filtered through *my* knowledge base, idea history, and "what worked for me before." A pipeline that does this automatically every morning is genuinely useful.
- Full ownership of data and prompts, and no subscription.
- Learning value and portfolio value (useful if my brand is tech-related).
- Small scope (one user, two platforms), so it's realistic as a side project.

### Honest conclusion
Build it, **but build the idea/draft engine first and treat auto-publishing as optional.** The idea engine is where the unique value is and it carries almost no platform risk. Publishing APIs carry the most risk and the least unique value, because native schedulers already do it for free.

**Validation test before investing heavily:** run Phase 1 for **4 weeks**. If I don't post more consistently, or I don't use the generated ideas at least ~2×/week, stop and use free off-the-shelf tools instead.

---

## 4. Architecture ($0)

```
             ┌──────────────────────┐
  me ───────▶│ profile/ (markdown)  │  bio, voice, pillars, wins, past posts
             └─────────┬────────────┘
                       │
 RSS / HN / Reddit ──▶ ingest ──▶ dedupe + relevance filter (keywords → LLM score)
                       │
                       ▼
               idea generator (LLM) ──▶ ideas.json / daily digest (email or Markdown in repo)
                       │
                       ▼
               drafter (LLM, per platform, my voice + examples)
                       │
            ┌──────────┴───────────┐
            ▼                      ▼
   LinkedIn: Share API      Instagram: Graph API (container → publish)
   (or copy-paste)          (or Meta Business Suite)
            │                      │
            └──── metrics (IG via API, LinkedIn manual CSV) ──▶ feedback into ideas
```

- **Language:** Python (best RSS/LLM libraries).
- **Storage:** files + SQLite in repo. No DB service.
- **LLM layer:** one small interface with swappable providers (Gemini → Groq → OpenRouter free → local Ollama) so a quota cut isn't fatal.
- **Runner:** GitHub Actions daily cron produces the digest; secrets in GitHub Secrets.
- **UI (optional, later):** local Streamlit app to review/edit/approve drafts.

---

## 5. Phased plan

**Phase 0 — Setup (1–2 days)**
- Create `profile/` templates: `about.md`, `voice.md` (tone, do/don't words, 5–10 of my best past posts), `pillars.md` (3–5 content themes), `updates.md` (dated log of new wins/projects).
- Pick 15–30 news feeds for my industry.
- Get a free LLM API key; install Ollama as a fallback.

**Phase 1 — Idea engine (MVP, ~1 week)** ← validation phase
- Fetch feeds daily, dedupe, score relevance against my pillars.
- Generate 5 ideas/day: angle, hook, which pillar, why it fits *me*, source link, and **format** (text post, carousel, or video). At least 1–2 per day should be video ideas.
- Output a Markdown digest (committed to repo or emailed through a free method).
- I post manually.

**Phase 2 — Drafting (~1 week)**
- One-click draft per idea: LinkedIn post (hook, body, CTA) and IG caption + slide text.
- Voice consistency via few-shot examples from `voice.md`.
- Templated carousel/image generation (HTML → PNG).
- **Video scripts** for any video idea (see 5b): hook, beats, CTA, shot list, caption.
- **Carousel slide content** as structured data (see 5c).

**Phase 2b — Carousels and profiles (~1–2 weeks)**
- Build 6–8 HTML/CSS slide templates in my brand style; render PNG (IG) and PDF (LinkedIn).
- Banner and highlight-cover templates using the same system.
- Profile writer and audit (see 5d); run it once at the start to set up both profiles.

**Phase 3 — Publishing (~1–2 weeks, optional)**
- LinkedIn: register app, Share on LinkedIn, OAuth, post text/images; re-auth reminder before the 60-day expiry.
- Instagram: convert to Creator account, link FB Page, Meta app in dev mode, publish via containers; host images publicly (e.g. GitHub raw URL or a free object store).
- Always **human approval before posting.** No fully automatic posting.

**Phase 4 — Feedback loop**
- Pull IG insights automatically; import LinkedIn numbers manually (CSV).
- Feed top/bottom performers into idea and draft prompts.

---

## 5b. Video: ideas and scripts only (decided: Option A)

I record and edit videos myself in a free app (Instagram Edits, CapCut free, or DaVinci Resolve free). **The tool never touches video files.** It works *before* recording (ideas, scripts) and *after* editing (captions, post copy).

### What the tool does
1. **Video ideas** from the same news and knowledge-base pipeline, flagged as video when the topic suits being on camera: opinions, reactions to news, stories, how-tos, behind the scenes.
2. **Scripts**, one per idea, in my voice from `voice.md`:
   - **Hook (first 1–3 s)**, with 2–3 alternatives to test
   - **Beats**: 3–5 short talking points with rough timing for the target length (30 / 60 / 90 s)
   - **CTA**: follow, comment prompt, or link in bio
   - **Shot/B-roll and on-screen text notes** to guide my editing
   - **Teleprompter version**: plain spoken text in short lines
3. **Platform versions**: Reel for Instagram, the same clip for LinkedIn, plus a LinkedIn text post to go with it.
4. **After recording (optional)**: I paste what I said (or the auto-caption text from the editing app) and the tool writes the caption, hashtags and LinkedIn post.
5. **Series formats** (e.g. "weekly news reaction", "myth vs fact") so I can batch-record.

### Why not editing inside the tool (for the record)
Captions, silence-cutting and reframing *can* be automated for free (Whisper, FFmpeg, auto-editor), but creative editing can't, and free apps already do it well. If editing becomes a bottleneck later, a small local "video prep" step (Option B) can be added without changing anything else.

### Constraints to remember
- **Post videos manually.** API publishing for Reels needs the video at a public URL (awkward to host for free) and possibly a **Business** account; one source says Creator accounts aren't supported for API Reels ⚠️. LinkedIn video upload via API is unconfirmed for personal apps ⚠️.
- Instagram Edits is reportedly free with no watermark; CapCut's free plan gives clean 1080p for normal edits, but Pro templates and many AI features are paid or watermarked ⚠️. Test an export first.

---

## 5c. Carousels in infographic style

### Ideation
- The idea engine flags topics that suit a carousel: frameworks, step-by-steps, "X mistakes", comparisons, stats roundups, myth vs fact, a news story broken down.
- Each carousel idea comes with: a title-slide hook, a slide-by-slide outline (usually 6–10 slides), and a closing CTA slide.

### Creation pipeline ($0, runs locally or in GitHub Actions)
1. **LLM → structured content**: slides as JSON (`title`, `body`, `stat`, `icon`, `layout`). The AI fills in content; **it never designs the layout.** That keeps quality and branding consistent.
2. **Templates**: a small set of HTML/CSS layouts in my brand colors and fonts: cover, big-number stat, numbered step, comparison (two columns), simple bar/donut chart (SVG), quote, checklist, CTA.
3. **Render** with Playwright (free, headless browser):
   - Instagram: **PNG, 1080×1350 (4:5)** per slide. The API carousel limit is reportedly 10 items ⚠️.
   - LinkedIn: one **PDF** with all slides (document post), usually 1080×1350 or 1080×1080.
4. **Assets, all free**: Google Fonts; open-source icons (e.g. Lucide or Tabler, MIT-licensed); my own photos; charts drawn as SVG from data.
5. **Review step**: preview, edit text, re-render, then post.

### Honest caveats
- **Templates look good but repetitive** after a while. Plan to add or rotate layouts every month or two.
- **Facts on infographics must be sourced.** LLMs invent statistics. Rule: any number on a slide must come from a linked news item or from my own data, and the source goes in small print or the caption.
- **Building templates is the main effort** (a few evenings). The free alternative is Canva's free plan with brand templates, filled in by hand from the tool's slide text. That's a valid fallback if building templates isn't fun.
- **Posting**: Instagram carousels can be published via the API once Phase 3 is set up. LinkedIn PDF/document posts via the API are unconfirmed for personal apps ⚠️, so plan on uploading the PDF manually.

---

## 5d. Profile and bio setup

The tool writes and audits my profiles from the knowledge base. **I paste the results in myself**, because neither platform lets a personal app edit the profile ⚠️.

### LinkedIn
- **Headline** (220-char limit ⚠️): 3–5 options mixing role, who I help, and keywords people search for.
- **About** (2,600-char limit ⚠️; the first ~2 lines show before "see more"): a hook, my story, proof (wins from `updates.md`), and a CTA.
- **Experience bullets**: rewritten as outcomes with numbers.
- **Featured section**: picks from my best posts and carousels.
- **Skills**: keyword suggestions matched to my pillars.
- **Banner image**: rendered with the same template system, 1584×396 ⚠️.
- **Creator settings checklist**: e.g. topic hashtags, follow vs connect as the primary button, custom profile URL.

### Instagram
- **Bio** (150-char limit ⚠️): 3–5 options with a clear "who I am / what you get / CTA" structure.
- **Name field** (30-char limit ⚠️): include a searchable keyword (it's indexed in search).
- **Link in bio**: suggestion for what to link (a free option: a simple GitHub Pages link page that the tool generates).
- **Highlight covers and categories**: suggested highlight names, with covers rendered by the template system.
- **Account type checklist**: switch to **Business** if I want API publishing later.

### Keeping it current
- When I add something to `updates.md` (new job, launch, award), the tool flags that the profiles are out of date and drafts the changes.
- **Profile audit** on demand: checks consistency between LinkedIn and Instagram (same positioning, same pillars), outdated details, missing keywords and weak hooks.
- Keeps a history of past bio versions so I can roll back or compare.

---

## 6. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Free LLM tier cut or rate-limited | High | Provider abstraction + Ollama fallback; small daily volume (~10–20 calls). |
| LinkedIn API access denied / changed | Medium | Copy-paste or native scheduler fallback; publishing is optional by design. |
| Meta setup friction / app review demands | Medium | Dev mode for own account; fallback to Meta Business Suite. |
| Account restriction from automation | Low if official APIs only | **Never scrape or automate browser actions on LinkedIn/IG.** Official APIs only, low volume, human-approved. |
| Generic "AI-sounding" content hurts my brand | High | Strong voice examples, personal anecdotes from `updates.md`, always edit before posting. |
| Personal data leakage | Low–Medium | Keep repo **private** if it holds personal info; secrets only in GitHub Secrets. Note that free LLM tiers may use prompts for training ⚠️. Don't put sensitive info in prompts. |
| AI-invented stats on infographics | High | Numbers only from linked sources or my own data; source shown on the slide or in the caption. |
| Profile changes based on stale info | Medium | `updates.md` is the single source of truth; the audit flags mismatches. |
| Copyright from news content | Low | Summarize and comment, link sources, don't republish articles. |

---

## 7. Open decisions for me

1. ~~Niche and pillars~~ **Decided:** web/frontend, Flutter/mobile, AI automation (see `profile/about.md`, `profile/pillars.md`). Ideal clients: **small businesses and startups.**
2. Do I want auto-publishing at all, or just ideas + drafts?
3. Is my Instagram already Creator/Business? (Required for the API.)
4. Private or public repo? (Public = unlimited Actions minutes but **exposes personal info**; private is recommended.)
5. Local-only vs. GitHub Actions automation.
6. ~~Video: A, B or C?~~ **Decided: A. Video ideas and scripts are in the tool; editing isn't.** Still open: typical video length (30/60/90 s), and whether I'm comfortable with face-to-camera or prefer voiceover/screen recordings.
7. If posting Reels via API: switch Instagram to a **Business** account (safer than Creator for API publishing).
8. ~~Brand look~~ **Taken from my banner** (see `profile/brand.md`). Still open: build templates vs. Canva free.
9. ~~Profile goal~~ **Decided: book a call.** Still open: which free booking tool.
10. **Also open to freelance, contract and full-time roles.** LinkedIn must serve clients *and* recruiters. Still open: "Open to work" recruiters-only or public, and whether to add job-lead and CV features.
