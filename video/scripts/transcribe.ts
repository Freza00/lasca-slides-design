#!/usr/bin/env tsx
/**
 * Transcribe voiceover.wav -> captions.srt via OpenAI Whisper.
 * Requires OPENAI_API_KEY. Run as `npm run captions`.
 */
import fs from 'node:fs';
import path from 'node:path';

const VIDEO_ROOT = path.resolve(__dirname, '..');
const IN_WAV = path.join(VIDEO_ROOT, 'public', 'voiceover.wav');
const OUT_SRT = path.join(VIDEO_ROOT, 'public', 'captions.srt');

const API_KEY = process.env.OPENAI_API_KEY;

async function main() {
  if (!API_KEY) {
    console.error('[transcribe] OPENAI_API_KEY not set. Skipping caption generation.');
    process.exit(1);
  }

  if (!fs.existsSync(IN_WAV)) {
    console.error(`[transcribe] ${IN_WAV} not found. Run \`npm run vo\` first.`);
    process.exit(1);
  }

  const fileBlob = new Blob([fs.readFileSync(IN_WAV)], { type: 'audio/wav' });
  const form = new FormData();
  form.append('file', fileBlob, 'voiceover.wav');
  form.append('model', 'whisper-1');
  form.append('response_format', 'srt');

  console.log('[transcribe] calling Whisper API...');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[transcribe] API error ${res.status}: ${text}`);
    process.exit(1);
  }

  const srt = await res.text();
  fs.writeFileSync(OUT_SRT, srt, 'utf8');
  const cueCount = srt.split(/\n\n+/).filter(Boolean).length;
  console.log(`[transcribe] wrote ${path.relative(VIDEO_ROOT, OUT_SRT)} (${cueCount} cues)`);
}

main().catch((err) => {
  console.error('[transcribe] failed:', err);
  process.exit(1);
});
