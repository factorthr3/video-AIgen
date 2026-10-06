# BlackCell: social media ads from your brand assets

Live at **[blackcell.app](https://blackcell.app)**.

**Upload your logo, product photos and footage, describe what you sell, and BlackCell makes professional video and image ads for every platform.** Claude reviews each asset and writes the copy and storyboard; the renderer builds every ad from the brand's own material (never AI-generated imagery) with its logo, colours and font, in every format: 9:16 (TikTok, Reels, Shorts, Stories), 4:5 and 1:1 (feeds) and 16:9 (YouTube, LinkedIn, X). Each ad set gets ready-to-paste post copy and an optional private link for the client.

## Features

- **Brands:** logo (colours are picked up from it automatically), colour palette, headline font, description and brand voice. An account can hold several brands (agencies).
- **Assets:** photos, transparent cut-outs and video clips. Each upload is normalised and reviewed by Claude: what it shows, a 1-5 quality score and the subject's position, so the strongest shots lead and every crop keeps the product in frame.
- **Ad sets:** one brief (product, description, offer, call to action, link, audience) becomes 6, 15 and/or 30-second videos and 0-3 static image ads, each in the chosen formats.
- **Copy that sells, honestly:** benefits, hooks and offers written from the brief in the brand's voice; no invented stats, reviews or prices; no em dashes.
- **Four styles:** Clean, Bold, Luxury and Promo (with an offer badge). Restrained motion (slow pushes, soft transitions), platform safe zones respected, logo and call-to-action end card.
- **Sound:** an original instrumental soundtrack composed for each video at its exact length (ElevenLabs Music, cleared for ads), with a mood (match the ad, upbeat, chill, cinematic, luxury, energetic); or stock beds or your own track. Optional voiceover (ElevenLabs) in 12 languages, off by default.
- **Edit and re-render:** change any headline, line, button or badge; or ask for fresh copy.
- **Client share links:** a private page with every ad, downloads and post copy, no login needed; can be turned off any time.
- Plans (Tester / Starter / Growth / Agency) with monthly ad-set and brand limits; Paystack or Stripe billing; email/password and Google sign-in.

## Quick start

Requirements: **Node 22.13+** and **ffmpeg** (with libx264, e.g. `brew install ffmpeg` or `apt install ffmpeg`).

```bash
npm install
cp .env.example .env    # add ANTHROPIC_API_KEY for the copywriter
npm run dev             # web on http://localhost:5173, API on :4100
```

Open http://localhost:5173, create an account, set up a brand, upload a few product photos and make an ad set.

| Stage | Key | Without it |
| --- | --- | --- |
| Asset review, copy and storyboard | `ANTHROPIC_API_KEY` | Copy comes straight from the brief; crops are centred |
| AI soundtracks, voiceover | `ELEVENLABS_API_KEY` (Music needs a paid plan) | Stock music beds; system voice |
| Google sign-in | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Email and password only |

### Payments (Paystack)

Plans are sold as monthly subscriptions through Paystack's hosted checkout. Set `PAYSTACK_SECRET_KEY` and the four plans are created in your Paystack account at startup (named `BlackCell <Plan>`). Then:

1. Prices are shown in US dollars (the catalog). Paystack only charges in USD for Kenyan and Nigerian businesses, so other accounts (e.g. South Africa, in rand) are charged the dollar price converted at the day's exchange rate ([Frankfurter](https://frankfurter.dev), ECB rates), rounded up to a whole unit. Each plan card shows the amount charged, e.g. "Charged in ZAR: R310/month". A Paystack plan is reused until the rate moves more than 3%; then new subscribers get a new plan at the new amount, and existing subscribers keep theirs. `PAYSTACK_EXCHANGE_RATE` fixes the rate and `PAYSTACK_PRICES=free=…,starter=…,daily=…,pro=…` fixes exact amounts.
2. In Paystack (Settings → API Keys & Webhooks), set the webhook URL to `https://your-domain/api/paystack/webhook`. It keeps renewals, failed payments and cancellations in sync. Checkout itself is confirmed when the customer returns, so a missing webhook doesn't block sign-ups.
3. Put your own email in `ADMIN_EMAILS` so you keep full access without subscribing. With a test key (`sk_test_…`), admins go through checkout like everyone else so you can try it; use Paystack's test card `4084 0840 8408 4081`, any future expiry, CVV `408`.

Customers cancel with **Cancel plan** (the plan runs to the end of the paid month) and change card with **Update card** (Paystack's hosted page). Switching plans starts the new plan immediately on the saved card. Paystack doesn't retry failed renewals, so a failed payment gives a week's grace to update the card.

### Payments (Stripe, alternative)

If only `STRIPE_SECRET_KEY` is set, Stripe sells the plans instead (`BILLING_PROVIDER` picks when both are set). Plans are sold as monthly subscriptions through Stripe Checkout. Set `STRIPE_SECRET_KEY` and the four plans are created in your Stripe account automatically on first use (lookup keys `blackcell_<plan>_monthly`). Then:

1. In Stripe, add a webhook endpoint `https://your-domain/api/stripe/webhook` for `checkout.session.completed` and `customer.subscription.created`, `.updated` and `.deleted`, and set its signing secret as `STRIPE_WEBHOOK_SECRET`.
2. In Stripe's Customer portal settings, allow customers to update payment methods, switch plans and cancel. The in-app **Manage billing** button opens it.
3. Put your own email in `ADMIN_EMAILS` so you keep full access without subscribing.

With Stripe on, making ads requires an active subscription (`past_due` keeps access while Stripe retries the payment). Switching plans updates the existing subscription with proration.

### Production

The included `Dockerfile` builds everything the server needs (Node 24, ffmpeg, fonts), and `railway.json` configures Railway (health check, restarts). On any host:

- mount a persistent volume at `/data`
- set `APP_URL` to the public URL (e.g. `https://blackcell.app`) and add your API keys as environment variables
- run a single instance (the render queue is in-process)

Without Docker:

```bash
npm run build
APP_URL=https://your-domain.com npm start   # serves the web app + API on $PORT
```

Mount `DATA_DIR` on persistent storage: it holds the SQLite database and rendered videos. Run a single instance (the render queue is in-process).

## How an ad set is made

```
brand kit + assets (each reviewed by Claude: subject box, quality)
   ─▶ brief ─▶ Claude: copy, storyboard per video length (which asset per scene), statics, post captions
   ─▶ per video length: scene timings (from the voiceover when on) + audio (a soundtrack composed
      to the exact length from Claude's music brief or the chosen mood, voice lines)
   ─▶ per format: frames drawn with Skia (smart crop + slow push on photos, footage streamed from
      ffmpeg, cut-outs on a brand backdrop, styled headline, logo, badge, transitions, end card)
   ─▶ raw frames piped into ffmpeg ─▶ H.264 MP4 (and JPEG image ads)
```

Rendering composites frames in-process with `@napi-rs/canvas`, so any stock ffmpeg with libx264 works. Fonts are open-licence (Montserrat, Inter, Playfair Display, Bebas Neue via `@fontsource`). A 15-second ad set in all four formats plus 8 image ads takes about 3 minutes on a laptop.

## Project layout

```
server/
  index.js          Express app: auth, billing, brands, ad sets, share links
  ads/              design (formats, styles, fonts), assets (ingest, review, crops),
                    brief (Claude copy), render (video/image ads, audio), jobs (queue)
  routes/           auth, brands + assets, ad sets + downloads + public share
  billing/          Paystack and Stripe subscriptions
  pipeline/         voiceover (tts), music beds, ffmpeg helpers
web/src/
  pages/            landing, brands, brand kit, new ad set, ad set, share page, billing, legal
  components/       app layout, ad previews, showcase
```
