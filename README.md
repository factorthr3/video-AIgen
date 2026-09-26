# BlackCell: AI faceless video generator

Live at **[blackcell.ai](https://blackcell.ai)** (once deployed).

**Pick a niche, and BlackCell handles the rest.** It writes the script, generates the visuals, records the voiceover, adds animated captions and music, renders a vertical video, then posts it to TikTok, Instagram Reels and YouTube Shorts on your schedule.

It's inspired by products like FacelessReels: set up a *series* once (niche, look, voice, schedule, accounts) and it keeps the channel running on autopilot.

## Features

- **Series on autopilot:** choose posting days, time and timezone. Videos render ahead of each slot and publish on time. Restarts are safe: nothing is lost or double-posted.
- **17 built-in niches plus custom topics**, grouped into Animals (animated Animal Tales, Wild Animal Facts, Funny Pet POV), Stories, Kids (Bedtime Stories, Fables), Facts & History and Mindset & Faith.
- **19 art styles** in three groups: Animation (3D Animation, Claymation, 2D Cartoon, Anime, Felt Puppets, Paper Cutout, Low Poly, Kawaii, Pixel Art), Realistic (Cinematic, Nature Documentary, Tiny World, Dark Fantasy, Vintage Film) and Illustrated. **Mix styles** makes a series rotate through several looks, one per video.
- **Hook-first AI scripts** from Claude, with structured scene-by-scene output. Each series remembers its past titles so it never repeats a story.
- **Visuals per scene:** OpenAI image generation in any art style, or procedural illustrated art when no key is set. Claude writes visuals to suit the chosen style, keeping animated characters identical from scene to scene.
- **Voiceover:** 8 narrator personas across 12 languages via ElevenLabs, OpenAI TTS or the system voice.
- **Animated captions:** word-by-word karaoke captions in 4 styles (Bold Pop, Highlight Box, Neon Glow, Minimal).
- **Music:** four synthesised royalty-free mood beds, or upload your own.
- **Editor:** edit title, caption, hashtags and every scene's narration and visual prompt, then re-render. Unchanged images are reused.
- **Posting:** real OAuth and upload integrations for YouTube (Data API v3), TikTok (Content Posting API) and Instagram (Instagram API with Instagram Login). **Demo accounts** simulate posting so you can try the full flow without developer apps.
- **Review mode:** turn off auto-post and videos wait in the library for approval.
- **Plans & quotas:** Tester ($5.99) / Starter / Daily / Pro with monthly video and series limits.
- Landing page, email/password auth, optional Google sign-in, dashboard, series manager and video library.

## Quick start

Requirements: **Node 22.13+** and **ffmpeg** (with libx264, e.g. `brew install ffmpeg` or `apt install ffmpeg`).

```bash
npm install
cp .env.example .env    # optional: add API keys
npm run dev             # web on http://localhost:5173, API on :4100
```

Open http://localhost:5173 and create an account, or run `npm run seed` for a local demo login (`demo@nrrtv.local`, password in `server/seed.js`).

With **no API keys at all**, everything still works end to end. Scripts come from a sample library, visuals are procedurally drawn, and narration uses the macOS system voice (or espeak-ng on Linux). Add keys to upgrade each stage:

| Stage | Key | Without it |
| --- | --- | --- |
| Script | `ANTHROPIC_API_KEY` | Sample script library (English, built-in niches) |
| Images | `OPENAI_API_KEY` (or `IMAGE_PROVIDER=pollinations`) | Procedural art |
| Voice | `ELEVENLABS_API_KEY` or `OPENAI_API_KEY` | System voice → silent narration |
| Posting | Platform client IDs/secrets | Demo accounts only |

### Getting top-quality output

The offline fallbacks are fine for trying the app but not for publishing. For production-quality videos, add three keys to `.env` and restart:

1. **`ANTHROPIC_API_KEY`** for scripts. Claude writes a fresh, hook-first story on any topic, with detailed visual prompts per scene. This matters more than you'd expect: better prompts produce better images.
2. **`OPENAI_API_KEY`** for visuals. Uses `gpt-image-2.5-sunburst` at `high` quality, generated at native 1088×1920. Set `OPENAI_IMAGE_MODEL=gpt-image-2.5-flare` for faster, cheaper images.
3. **`ELEVENLABS_API_KEY`** for voiceover. Uses `eleven_v3`, the most expressive ElevenLabs model, with word-level timestamps so captions sync exactly to the speech. Each narrator persona maps to a voice in your ElevenLabs account; pin one with e.g. `ELEVENLABS_VOICE_ONYX=<voice id>`.

4. **Real AI video** from `GEMINI_API_KEY` (Google Veo, preferred) or `FAL_KEY` (fal.ai). Each series picks its *Visuals*:
   - **AI video hook** (default): only the opening scene, the one that stops the scroll, becomes a real AI clip, and the rest use pan & zoom. With Veo 3.1 Lite at 720p that's one 4-second clip, **about $0.20 per video**. On fal it uses LTX-2.3 Fast, about $0.36.
   - **AI video, every scene**: about $1.60 per 30s with Veo 3.1 Lite, or about $3.50 with Kling v3 Pro on fal.
   - **Animated images**: no video cost.

   The scene image is the clip's first frame, so the style stays consistent, and clips are timed to the narration. Any clip that fails falls back to the animated still, and the video page says why. Get a Gemini key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) on a Google Cloud project with billing enabled (Veo has no free tier).

The video card shows which engines produced each video (e.g. `voice: elevenlabs · eleven_v3`), so you can confirm the upgrade took effect. Re-render older videos to apply the new engines. Check each provider's pricing page for per-video costs.

### Production

The included `Dockerfile` builds everything the server needs (Node 24, ffmpeg, caption fonts), and `railway.json` configures Railway (health check, restarts). On any host:

- mount a persistent volume at `/data`
- set `APP_URL` to the public URL (e.g. `https://blackcell.ai`) and add your API keys as environment variables
- run a single instance (the job queue and scheduler are in-process)

Without Docker:

```bash
npm run build
APP_URL=https://your-domain.com npm start   # serves the web app + API on $PORT
```

Mount `DATA_DIR` on persistent storage: it holds the SQLite database and rendered videos. Run a single instance (the job queue and scheduler are in-process).

## Connecting platforms

Register these redirect URIs (replace `APP_URL`):

- **YouTube:** create an OAuth client in Google Cloud, enable *YouTube Data API v3*, and add `APP_URL/api/accounts/youtube/callback`. Also add `APP_URL/api/auth/google/callback` to enable "Continue with Google". Until Google verifies your app, uploads are private.
- **TikTok:** create an app with *Login Kit* and the *Content Posting API* (`video.publish`) and add `APP_URL/api/accounts/tiktok/callback`. Unaudited apps can only post as private (`SELF_ONLY`).
- **Instagram:** create a Meta app using *Instagram API with Instagram Login* (`instagram_business_basic`, `instagram_business_content_publish`) and add `APP_URL/api/accounts/instagram/callback`. Only Business/Creator accounts can publish, and the server must be reachable publicly (`PUBLIC_MEDIA_URL`) because Instagram fetches the video by URL.

OAuth tokens are encrypted at rest (AES-256-GCM) and refreshed automatically.

## How a video is made

```
series settings ─▶ script (Claude / library)
               ─▶ one image per scene (OpenAI / Pollinations / procedural)
               ─▶ one voice clip per scene (ElevenLabs / OpenAI / system)
               ─▶ timeline: each scene lasts exactly as long as its narration
               ─▶ AI video clips (hook or every scene), image-to-video, timed to the narration (Veo / fal.ai)
               ─▶ audio mix: voice + quiet music bed, loudness-normalised
               ─▶ frames drawn with Skia (Ken Burns, crossfades, captions, watermark)
               ─▶ raw frames piped into ffmpeg → H.264 1080×1920 MP4
```

Rendering composites frames in-process with `@napi-rs/canvas`, so any stock ffmpeg with libx264 works (no libass/freetype build needed). A 60-second video takes about 1.5 minutes end to end on an Apple Silicon laptop with the offline fallbacks.

## Project layout

```
server/
  index.js          Express app, media + upload + billing routes
  config.js         env + provider selection
  catalog.js        niches, voices, art/caption styles, music, plans
  db.js             SQLite (node:sqlite) schema + helpers
  auth.js           sessions, password hashing, OAuth state, token encryption
  services.js       quotas, settings validation, timezone-aware scheduling
  scheduler.js      autopilot: create due videos, publish when their slot arrives
  pipeline/         script, images, art, tts, music, captions, render, job queue
  social/           youtube, tiktok, instagram, publishing orchestration
  routes/           auth, series, videos, accounts
web/src/            React + Tailwind app (landing, auth, dashboard, wizard, editor)
assets/fonts/       Anton + Poppins (SIL Open Font License)
```

## Not included yet

- **Payments:** in dev, plan switching is instant and free. In production, paid plans are disabled (so nobody can self-upgrade and burn your API credits) unless you set `DEMO_BILLING=true`. Hook Stripe Checkout into `POST /api/billing/plan` to sell plans.
- **Horizontal scaling:** the render queue is in-process. Move it to a real queue (e.g. BullMQ) to run multiple workers.
