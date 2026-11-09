# My-Socials — Plan & Validation

A personal brand assistant for **one user** (me) covering **LinkedIn** and **Instagram**, inspired by Kleo.so.
Hard constraint: **$0 running cost.**

_Last researched: November 2026. API policies and free tiers change often, so re-check the items marked ⚠️ before building on them._

---

## 1. Goal

1. Keep a **personal knowledge base** (bio, career history, opinions, wins, tone of voice, past posts) that I update from time to time.
2. Generate **content ideas** from the latest **industry news**, matched to my background.
3. **Draft posts** in my voice, formatted for each platform (LinkedIn text/carousel vs Instagram caption + image).
4. **Schedule/publish** to LinkedIn and Instagram, or hand off a ready-to-post draft.
5. Track **what performed**, to feed back into ideas.

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
- Generate 5 ideas/day: angle, hook, which pillar, why it fits *me*, source link.
- Output a Markdown digest (committed to repo or emailed through a free method).
- I post manually.

**Phase 2 — Drafting (~1 week)**
- One-click draft per idea: LinkedIn post (hook, body, CTA) and IG caption + slide text.
- Voice consistency via few-shot examples from `voice.md`.
- Templated carousel/image generation (HTML → PNG).

**Phase 3 — Publishing (~1–2 weeks, optional)**
- LinkedIn: register app, Share on LinkedIn, OAuth, post text/images; re-auth reminder before the 60-day expiry.
- Instagram: convert to Creator account, link FB Page, Meta app in dev mode, publish via containers; host images publicly (e.g. GitHub raw URL or a free object store).
- Always **human approval before posting.** No fully automatic posting.

**Phase 4 — Feedback loop**
- Pull IG insights automatically; import LinkedIn numbers manually (CSV).
- Feed top/bottom performers into idea and draft prompts.

---

## 5b. Video (added later, still undecided)

I'll record videos and need them edited. **Open question:** is that part of the tool or not?

### What "editing" splits into
| Task | Automatable at $0? | How |
|---|---|---|
| Transcribe | ✅ Yes, well | **Whisper / faster-whisper**, run locally. Free and accurate. |
| Burned-in captions | ✅ Yes | FFmpeg + the transcript (`.srt` → subtitles). |
| Cut silences / "umms" / dead air | ✅ Mostly | **auto-editor** (open source) or FFmpeg silence detection. |
| Reframe 16:9 → 9:16 / 1:1 / 4:5 | ✅ Yes (center crop); 🟡 face-tracking crop is harder | FFmpeg; MediaPipe for face tracking. |
| Pick the best short clips from a long recording | 🟡 OK | Transcript → LLM picks timestamps → FFmpeg cuts. Quality varies. |
| Post copy, hook, hashtags from the video | ✅ Yes | Transcript → existing drafter. **Fits the tool naturally.** |
| Creative editing: B-roll, music, transitions, zooms, pacing | ❌ Not well | This is taste work. Use a free editor app. |

### Free editors to compare (verify each before relying on it ⚠️)
- **Instagram Edits** (Meta, phone): free, reportedly no watermark, 4K export; built for Reels. Some features are reportedly missing, e.g. auto silence removal.
- **CapCut**: free plan exports 1080p clean for normal edits; Pro templates and many AI features are paywalled or watermarked. Pricing and terms keep changing.
- **DaVinci Resolve (free)**: professional desktop editor with no watermark. Steep learning curve, needs a decent computer.

### Options
- **A. Keep video out of the tool.** Record → edit in Edits/CapCut → post. Zero build cost. The tool only writes the script/hook beforehand.
- **B. Thin "video prep" step in the tool (recommended).** Runs **locally**: transcribe → remove silences → captions → reframe → generate caption/post copy. Finish creative edits in a free app if needed.
- **C. Full automated editor in the tool.** Not recommended: most effort, worst results, and free apps already do it better.

### Recommendation
**B, but later (after Phase 2).** Meanwhile, the tool should already help *before* recording: turn an idea into a short script with hook, 3 points, and CTA. That's cheap to build and useful whatever you decide about editing.

### $0 constraints specific to video
- **Process on your own computer, not GitHub Actions/the repo.** Video files are large (GitHub blocks files >100 MB; free LFS storage is small). Keep raw footage on your disk or a free cloud drive.
- **Instagram Reels by API** needs the video at a **public URL** and, per Meta's docs, possibly a **Business** account (one source says Creator isn't supported for API Reels ⚠️). Specs are roughly 9:16, MP4/H.264, a few seconds up to ~90 s for Reels. Free public hosting for large video files is the awkward part, so **posting videos manually may be simpler.**
- **LinkedIn video** upload via API exists, but I haven't confirmed it's available to personal apps ⚠️. Manual upload is the fallback.
- Whisper and FFmpeg run fine on a CPU, just slower. A 10-min video takes a few minutes on a normal laptop.

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
| Copyright from news content | Low | Summarize and comment, link sources, don't republish articles. |

---

## 7. Open decisions for me

1. My industry/niche and 3–5 content pillars.
2. Do I want auto-publishing at all, or just ideas + drafts?
3. Is my Instagram already Creator/Business? (Required for the API.)
4. Private or public repo? (Public = unlimited Actions minutes but **exposes personal info**; private is recommended.)
5. Local-only vs. GitHub Actions automation.
6. Video: A (outside the tool), B (local prep step), or C (full editor)? And where will I record: phone or camera/desktop? Long videos cut into clips, or short ones only?
7. If posting Reels via API: switch Instagram to a **Business** account (safer than Creator for API publishing).
