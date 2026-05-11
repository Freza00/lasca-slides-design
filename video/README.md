# @lasca/video

Remotion-based 60s product demo video for Lasca. Outputs MP4 (1080p / square / vertical), WebM, and GIF for Twitter / X / LinkedIn / GitHub README distribution.

## Quick start

```bash
cd video
npm install
npm run dev          # Remotion Studio at http://localhost:3000
```

## Compositions

| ID                   | Dimensions     | Use                              |
| -------------------- | -------------- | -------------------------------- |
| `LascaDemo`          | 1920×1080 @ 30 | Master, LinkedIn / Twitter long  |
| `LascaDemoSquare`    | 1080×1080 @ 30 | Twitter / X single-post primary  |
| `LascaDemoVertical`  | 1080×1920 @ 30 | LinkedIn mobile / reel fallback  |

Total runtime: 60s (1800 frames @ 30fps).

## Render

```bash
npm run render        # 1080p MP4
npm run render:sq     # 1080×1080
npm run render:v      # 1080×1920
npm run render:webm   # 960×540 WebM, ~3MB for README
npm run thumbnail     # frame-0 PNG cover
npm run all           # everything end-to-end (VO + captions + all renders)
```

Local render on M-series Mac: ~3–5 min per master at 1080p.

## Audio pipeline

1. **BGM**: drop `bgm.mp3` into `public/`. Recommend Artlist "Minimal Morning" (Luwaks). Alternative: Bensound "Ukulele" (CC-BY-ND, attribution required).
2. **VO**: edit `script.txt`, then `npm run vo` (requires `ELEVENLABS_API_KEY` in `.env`). Output: `public/voiceover.wav`.
3. **Captions**: `npm run captions` (requires `OPENAI_API_KEY`). Output: `public/captions.srt`.

VO + captions must be regenerated together — running `vo` chains to `captions` automatically.

## Design token sync

`npm run prerender` regenerates `src/lib/tokens.ts` from Lasca's `app/src/app/globals.css`. The generated file is checked into git so `dev` works without running the sync first.

## Scene script

See [`/Users/freddiezhang/.claude/plans/lasca-https-github-com-remotion-dev-rem-graceful-panda.md`](../) for the full storyboard. Scene timing locked at 4/8/10/16/10/6/6 seconds.

## Env vars

Create `video/.env` (gitignored):

```
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...   # Olivia or similar calm female voice
OPENAI_API_KEY=...
```

In CI, set these as GitHub Actions secrets.

## CI

Manual-trigger only via `workflow_dispatch` at `.github/workflows/video-render.yml`. Never runs on push.
