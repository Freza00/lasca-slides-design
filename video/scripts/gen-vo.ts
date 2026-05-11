#!/usr/bin/env tsx
/**
 * Generate voiceover.wav from script.txt via ElevenLabs API.
 * Requires ELEVENLABS_API_KEY in env. Run as `npm run vo`.
 * After WAV is written, automatically invokes transcribe.ts to keep captions in sync.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const VIDEO_ROOT = path.resolve(__dirname, '..');
const SCRIPT_TXT = path.join(VIDEO_ROOT, 'script.txt');
const OUT_WAV = path.join(VIDEO_ROOT, 'public', 'voiceover.wav');

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel (calm female)

async function main() {
  if (!API_KEY) {
    console.error('[gen-vo] ELEVENLABS_API_KEY not set. Skipping VO generation.');
    process.exit(1);
  }

  const raw = fs.readFileSync(SCRIPT_TXT, 'utf8');
  // Strip bracket headers, keep narration text only.
  const lines = raw
    .split('\n')
    .map((l) => l.replace(/^\s*\[[^\]]+\]\s*/, '').trim())
    .filter(Boolean);
  const narration = lines.join('  ');

  console.log(`[gen-vo] narration length: ${narration.length} chars`);
  console.log(`[gen-vo] calling ElevenLabs (voice ${VOICE_ID})...`);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=pcm_44100`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/wav',
    },
    body: JSON.stringify({
      text: narration,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.85,
        style: 0.15,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[gen-vo] API error ${res.status}: ${text}`);
    process.exit(1);
  }

  const pcmBuf = Buffer.from(await res.arrayBuffer());
  const wavBuf = pcmToWav(pcmBuf, 44100, 1, 16);
  fs.mkdirSync(path.dirname(OUT_WAV), { recursive: true });
  fs.writeFileSync(OUT_WAV, wavBuf);
  console.log(`[gen-vo] wrote ${path.relative(VIDEO_ROOT, OUT_WAV)} (${(wavBuf.length / 1024).toFixed(0)} KB)`);

  // Auto-chain captions regeneration so SRT stays in sync.
  console.log('[gen-vo] chaining transcribe.ts to regenerate captions.srt...');
  const result = spawnSync('npx', ['tsx', path.join(__dirname, 'transcribe.ts')], {
    stdio: 'inherit',
    cwd: VIDEO_ROOT,
  });
  if (result.status !== 0) {
    console.warn('[gen-vo] transcribe.ts failed; captions may be out of sync.');
  }
}

// Wrap raw PCM in a WAV container so Remotion's <Audio> can play it.
function pcmToWav(pcm: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcm.copy(buffer, 44);
  return buffer;
}

main().catch((err) => {
  console.error('[gen-vo] failed:', err);
  process.exit(1);
});
