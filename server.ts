import 'dotenv/config';
import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

const rootDir = import.meta.dirname;
const PORT = Number(process.env.PORT) || 3000;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB inline limit
const ALLOWED_MEDIA_MIME_RE =
  /^(audio\/(mpeg|mp3|wav|x-wav|wave|mp4|m4a|x-m4a|aac|ogg|opus|flac|webm)|video\/(mp4|webm|ogg))$/i;

let cachedKey = '';
let cachedClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || '';
  if (!apiKey) return null;
  if (!cachedClient || cachedKey !== apiKey) {
    cachedKey = apiKey;
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

function safeDecodeHeader(val: string | string[] | undefined, maxLen = 160): string {
  const raw = Array.isArray(val) ? val[0] : val;
  if (!raw) return '';
  try {
    return decodeURIComponent(raw).replace(/[\r\n]+/g, ' ').trim().slice(0, maxLen);
  } catch {
    return String(raw).replace(/[\r\n]+/g, ' ').trim().slice(0, maxLen);
  }
}

async function generateWithRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (retries > 0 && (status === 500 || status === 503 || status === undefined)) {
      await new Promise((r) => setTimeout(r, 1200));
      return generateWithRetry(fn, retries - 1);
    }
    throw err;
  }
}

async function startServer() {
  const app = express();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, transcribeReady: Boolean(process.env.GEMINI_API_KEY?.trim()) });
  });

  app.post(
    '/api/transcribe',
    express.raw({ type: '*/*', limit: '22mb' }),
    async (req, res) => {
      try {
        const ai = getGeminiClient();
        if (!ai) {
          res.status(503).json({
            error: 'Gemini API key is not configured. Set GEMINI_API_KEY in Settings > Secrets.',
          });
          return;
        }

        const rawMime = String(req.headers['content-type'] || '')
          .split(';')[0]
          .trim()
          .toLowerCase();
        if (!ALLOWED_MEDIA_MIME_RE.test(rawMime)) {
          res.status(400).json({
            error: 'Unsupported audio format. Please use MP3, WAV, M4A, AAC, OGG, FLAC, WebM, or MP4.',
          });
          return;
        }

        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
          res.status(400).json({ error: 'No audio data received for transcription.' });
          return;
        }

        if (req.body.length > MAX_AUDIO_BYTES) {
          res.status(413).json({
            error: 'Audio payload exceeds 20 MB limit after client optimization.',
          });
          return;
        }

        const title = safeDecodeHeader(req.headers['x-track-title'], 160);
        const artist = safeDecodeHeader(req.headers['x-track-artist'], 120);
        const synced = String(req.headers['x-synced-lrc'] ?? '1') !== '0';

        // Normalize MIME aliases for Gemini inlineData
        const normalizedMime =
          rawMime === 'audio/x-wav' || rawMime === 'audio/wave'
            ? 'audio/wav'
            : rawMime === 'audio/x-m4a' || rawMime === 'audio/m4a'
              ? 'audio/mp4'
              : rawMime;

        const metaHint =
          title || artist
            ? `Song metadata hint (for spelling proper nouns only—transcribe strictly what is actually heard in the audio): Title="${title || 'Unknown'}", Artist="${artist || 'Unknown'}".\n`
            : '';

        const prompt = synced
          ? `${metaHint}Listen carefully to the full song audio and transcribe all sung or spoken lyrics word-for-word in their original language.
Format every sung line as valid synced LRC lyrics with [mm:ss.xx] timestamps marking when each line begins (for example: [00:14.20] First line of the song).
Do not include commentary, headers, notes, or markdown code fences—output only the LRC lines.`
          : `${metaHint}Listen carefully to the full song audio and transcribe all sung or spoken lyrics word-for-word in their original language.
Format cleanly into lines by phrase and stanza. Do not include commentary or markdown code fences—output only the lyrics.`;

        const audioPart = {
          inlineData: {
            mimeType: normalizedMime,
            data: req.body.toString('base64'),
          },
        };

        const response = await generateWithRetry(() =>
          ai.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents: { parts: [audioPart, { text: prompt }] },
          })
        );

        const rawText = (response.text || '').trim();
        const lyrics = rawText
          .replace(/^```(?:lrc|txt|lyrics|text)?\s*\r?\n?/i, '')
          .replace(/\r?\n?```\s*$/i, '')
          .trim();

        if (!lyrics) {
          res.status(422).json({
            error: 'No vocals or lyrics could be transcribed from this track.',
          });
          return;
        }

        res.json({ lyrics, synced });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Audio transcription failed.';
        const status = (err as { status?: number })?.status;
        if (status === 403 || /PERMISSION_DENIED|API_KEY_INVALID/i.test(msg)) {
          res.status(403).json({
            error: 'Invalid or unauthorized Gemini API key. Check GEMINI_API_KEY in Settings > Secrets.',
          });
          return;
        }
        if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg)) {
          res.status(429).json({
            error: 'Transcription rate limit or quota reached. Please try again shortly.',
          });
          return;
        }
        res.status(status && status >= 400 && status < 600 ? status : 500).json({
          error: 'Could not transcribe song audio. Please try again.',
        });
      }
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(rootDir, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
