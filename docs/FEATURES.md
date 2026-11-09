# My-Socials: Feature spec (v1)

One user (Wendy / OI.Dev) · LinkedIn + Instagram · ideal clients: small businesses and startups · goal: **book a call** · also open to **freelance, contract and full-time roles** · **$0 running cost**.
Details and reasoning: see `PLAN.md`.

## 1. Knowledge base
- Files in `profile/`: `about.md`, `pillars.md`, `brand.md`, `voice.md`, `updates.md`.
- I update them any time; every feature reads from them.
- Adding an entry to `updates.md` triggers "profile out of date?" and "proof post?" suggestions.

## 2. News → ideas (daily)
- Pull free RSS/API sources per pillar (web, Flutter, AI automation, small-business tech).
- Dedupe, score relevance to my pillars and to small businesses/startups.
- 5 ideas/day, each with: angle, hook, pillar, format (**text / carousel / video**), platform, source link, and why it fits me.
- Idea bank: save, reject or schedule ideas; rejected ideas teach the scorer.

## 3. Drafting
- **Text posts**: LinkedIn post (hook, body, CTA to book a call), Instagram caption + hashtags.
- **Video scripts**: hook options, timed beats (30/60/90 s), CTA, shot/on-screen text notes, teleprompter version. Post copy from the transcript afterwards. _(Editing is done outside the tool.)_
- **Carousels**: slide-by-slide content → rendered infographic slides in my brand (PNG 1080×1350 for IG, PDF for LinkedIn). Numbers only from cited sources.
- All drafts in my voice (`voice.md`), editable, regenerate per section.

## 4. Profile setup & upkeep
- LinkedIn: headline, About, experience bullets, Featured picks, skills, banner (rendered, 1584×396).
- Instagram: bio, name field, link-in-bio plan, highlight names + covers.
- Audit: consistency across both platforms, outdated info, missing keywords, CTA present.
- **Two audiences:** clients (outcomes, results, "book a call") and recruiters/hiring managers (searchable job titles, skills, tech stack, experience). LinkedIn serves both; Instagram stays client-focused.
- Recruiter search optimisation: job-title keywords in headline and experience, skills list matched to the roles I want.
- Reminder checklist for LinkedIn's "Open to work" setting (recruiters-only vs public; see PLAN.md).
- Version history of bios. **Applied by copy-paste** (no API exists for profile edits).
- Launch posts for brand-new accounts, sent to the ideas board.
- Setup checklist and "out of date" warning when `about.md`, `pillars.md` or `updates.md` change after the live version.
- _Built (stage 3)._ Later: audit of a pasted live profile.

## 5. Planning & publishing
- Content calendar: what goes out when, on which platform, mix of pillars and formats.
- Human approval before anything posts.
- Publish via official APIs where possible (LinkedIn text/image posts; Instagram images/carousels); otherwise "ready to post" export for manual upload (videos, LinkedIn PDFs).

## 6. Performance feedback
- Instagram insights via API; LinkedIn numbers imported manually (CSV/paste).
- Which pillars, formats and hooks drive engagement, profile visits and **booked calls** → fed back into idea scoring.

## Out of scope (v1)
- Video editing. Scraping or browser automation on LinkedIn/Instagram. Fully automatic posting. Paid APIs.

## Possible later additions (not committed)
- Engagement help: suggested replies to comments, and suggested comments on other people's posts.
- Local "video prep" step (captions/silence cut).
- Lead tracking: who booked a call and which post they came from (clients **and** recruiters).
- Job leads: free job feeds (e.g. remote job board RSS/APIs, "Who is hiring" threads) filtered for Flutter / frontend / AI automation roles. LinkedIn job listings have no free API, so no LinkedIn job scraping.
- CV / cover letter tailoring per role from the knowledge base.
