import { Track } from '../types/player';

export function formatTime(sec?: number): string {
  if (!sec || !isFinite(sec)) return '0:00';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const c = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(c).padStart(2, '0');
}

export function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

export function ytId(u?: string): string | null {
  if (!u) return null;
  const m = String(u).match(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/))([\w-]{11})/i
  );
  return m ? m[1] : null;
}

export function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
}

export function linkList(txt?: string): string[] {
  return (txt || '')
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) =>
      /^[a-z][a-z0-9+.-]*:\/\//i.test(x)
        ? x
        : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(x)
          ? 'https://' + x
          : ''
    )
    .filter(Boolean);
}

export interface LrcLine {
  t: number;
  s: string;
}

export function parseLRC(txt?: string): LrcLine[] | null {
  if (!txt) return null;
  const out: LrcLine[] = [];
  let off = 0;
  const m0 = /\[offset:\s*([+-]?\d+)\s*\]/i.exec(txt);
  if (m0) off = +m0[1] / 1000;
  for (const raw of String(txt).split(/\r?\n/)) {
    const re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    let m: RegExpExecArray | null;
    const ts: number[] = [];
    let last = 0;
    while ((m = re.exec(raw))) {
      ts.push(+m[1] * 60 + +m[2] + (m[3] ? +('0.' + m[3]) : 0));
      last = re.lastIndex;
    }
    if (!ts.length) continue;
    const s = raw
      .slice(last)
      .replace(/<\d+:\d+(?:[.:]\d+)?>/g, '')
      .trim();
    ts.forEach((x) => out.push({ t: x - off, s }));
  }
  out.sort((a, b) => a.t - b.t);
  return out.length >= 2 ? out : null;
}

export async function readTextFile(f: Blob): Promise<string> {
  const b = await f.arrayBuffer();
  let s: string;
  try {
    s = new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    s = new TextDecoder('windows-1252').decode(b);
  }
  return s.replace(/^\uFEFF/, '');
}

export async function artFallback(blob: Blob): Promise<{ pic: Blob | null; lyr: string }> {
  const out: { pic: Blob | null; lyr: string } = { pic: null, lyr: '' };
  const rd = async (o: number, n: number) =>
    new Uint8Array(await blob.slice(o, o + n).arrayBuffer());
  const u32 = (a: Uint8Array, o: number) =>
    ((a[o] << 24) | (a[o + 1] << 16) | (a[o + 2] << 8) | a[o + 3]) >>> 0;
  const s4 = (a: Uint8Array, o: number) =>
    String.fromCharCode(a[o], a[o + 1], a[o + 2], a[o + 3]);
  const dec = (a: Uint8Array, enc: number) => {
    try {
      if (enc === 1) {
        if (a[0] === 0xfe && a[1] === 0xff) return new TextDecoder('utf-16be').decode(a.subarray(2));
        if (a[0] === 0xff && a[1] === 0xfe) a = a.subarray(2);
        return new TextDecoder('utf-16le').decode(a);
      }
      if (enc === 2) return new TextDecoder('utf-16be').decode(a);
      if (enc === 3) return new TextDecoder('utf-8').decode(a);
      return new TextDecoder('windows-1252').decode(a);
    } catch {
      return '';
    }
  };
  const skipZ = (b: Uint8Array, q: number, enc: number) => {
    if (enc === 1 || enc === 2) {
      while (q + 1 < b.length && !(b[q] === 0 && b[q + 1] === 0)) q += 2;
      return q + 2;
    }
    while (q < b.length && b[q] !== 0) q++;
    return q + 1;
  };

  try {
    const head = await rd(0, 16);
    if (head.length < 8) return out;
    if (String.fromCharCode(head[0], head[1], head[2]) === 'ID3') {
      const ver = head[3];
      const sz = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9];
      const buf = await rd(10, Math.min(sz, 32 * 1024 * 1024));
      let p = 0;
      if (head[5] & 64) {
        p =
          ver === 4
            ? (buf[0] << 21) | (buf[1] << 14) | (buf[2] << 7) | buf[3]
            : u32(buf, 0) + 4;
      }
      const idl = ver === 2 ? 3 : 4;
      const hl = ver === 2 ? 6 : 10;
      while (p + hl <= buf.length) {
        const id = String.fromCharCode(...buf.subarray(p, p + idl));
        if (!/^[A-Z0-9]+$/.test(id)) break;
        let n: number;
        if (ver === 2) n = (buf[p + 3] << 16) | (buf[p + 4] << 8) | buf[p + 5];
        else if (ver === 4)
          n = (buf[p + 4] << 21) | (buf[p + 5] << 14) | (buf[p + 6] << 7) | buf[p + 7];
        else n = u32(buf, p + 4);
        if (!n || p + hl + n > buf.length) break;
        const fb = buf.subarray(p + hl, p + hl + n);
        if (!out.pic && (id === 'APIC' || id === 'PIC')) {
          const enc = fb[0];
          let q = 1;
          let mime = 'image/jpeg';
          if (id === 'PIC') {
            mime =
              String.fromCharCode(...fb.subarray(1, 4)).toLowerCase() === 'png'
                ? 'image/png'
                : 'image/jpeg';
            q = 4;
          } else {
            let e = q;
            while (e < fb.length && fb[e] !== 0) e++;
            const m = String.fromCharCode(...fb.subarray(q, e)).toLowerCase();
            mime = m.includes('/') ? m : m ? 'image/' + m : 'image/jpeg';
            q = e + 1;
          }
          q = skipZ(fb, q + 1, enc);
          if (q < fb.length) out.pic = new Blob([fb.slice(q)], { type: mime });
        }
        if (!out.lyr && (id === 'USLT' || id === 'ULT')) {
          const enc = fb[0];
          out.lyr = dec(fb.subarray(skipZ(fb, 4, enc)), enc).trim();
        }
        p += hl + n;
      }
      return out;
    }

    if (s4(head, 0) === 'fLaC') {
      let o = 4;
      for (let i = 0; i < 64; i++) {
        const h = await rd(o, 4);
        if (h.length < 4) break;
        const last = h[0] & 128;
        const ty = h[0] & 127;
        const len = (h[1] << 16) | (h[2] << 8) | h[3];
        if (ty === 6) {
          const b = await rd(o + 4, len);
          let q = 4;
          const ml = u32(b, q);
          q += 4;
          const mime = String.fromCharCode(...b.subarray(q, q + ml));
          q += ml;
          const dl = u32(b, q);
          q += 4 + dl + 16;
          const dlen = u32(b, q);
          q += 4;
          out.pic = new Blob([b.slice(q, q + dlen)], { type: mime || 'image/jpeg' });
          break;
        }
        o += 4 + len;
        if (last) break;
      }
      return out;
    }

    if (s4(head, 4) === 'ftyp') {
      let o = 0;
      const size = blob.size;
      while (o < size) {
        const h = await rd(o, 16);
        if (h.length < 8) break;
        let sz = u32(h, 0);
        const ty = s4(h, 4);
        if (sz === 1) sz = u32(h, 8) * 4294967296 + u32(h, 12);
        if (!sz) sz = size - o;
        if (ty === 'moov' && sz < 200 * 1024 * 1024) {
          const m = await rd(o, sz);
          const find = (w: string) => {
            for (let i = 0; i + 4 <= m.length; i++) {
              if (
                m[i] === w.charCodeAt(0) &&
                m[i + 1] === w.charCodeAt(1) &&
                m[i + 2] === w.charCodeAt(2) &&
                m[i + 3] === w.charCodeAt(3)
              )
                return i;
            }
            return -1;
          };
          const i = find('covr');
          if (i >= 0) {
            const ds = u32(m, i + 4);
            const ty2 = m[i + 15];
            if (s4(m, i + 8) === 'data' && ds > 16)
              out.pic = new Blob([m.slice(i + 20, i + 4 + ds)], {
                type: ty2 === 14 ? 'image/png' : 'image/jpeg',
              });
          }
          const j = find('\xA9lyr');
          if (j >= 0) {
            const ds = u32(m, j + 4);
            if (s4(m, j + 8) === 'data' && ds > 16)
              out.lyr = new TextDecoder('utf-8').decode(m.subarray(j + 20, j + 4 + ds)).trim();
          }
          break;
        }
        o += sz;
      }
    }
  } catch {
    // ignore malformed binary header
  }
  return out;
}

export async function extractAudioMetadata(track: Track): Promise<Track> {
  if (!track.blob) return track;
  const fb = await artFallback(track.blob);
  if (fb.pic && !track.emb) track.emb = fb.pic;
  if (fb.lyr && !track.lyr) track.lyr = fb.lyr;
  track.chk = 2;
  track.artv = 2;

  // Read duration if possible
  if (!track.dur && track.blob.size > 0) {
    await new Promise<void>((res) => {
      const a = document.createElement('audio');
      const u = URL.createObjectURL(track.blob!);
      const done = () => {
        URL.revokeObjectURL(u);
        a.removeAttribute('src');
        res();
      };
      a.onloadedmetadata = () => {
        if (isFinite(a.duration)) track.dur = a.duration;
        done();
      };
      a.onerror = done;
      a.src = u;
      setTimeout(done, 3000);
    });
  }
  return track;
}

export async function generateVideoThumb(track: Track): Promise<void> {
  const mine = !track.url && track.blob && track.blob.size > 0;
  const src = track.url || (mine ? URL.createObjectURL(track.blob!) : '');
  if (!src) return;
  await new Promise<void>((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (mine) URL.revokeObjectURL(src);
      v.removeAttribute('src');
      resolve();
    };
    const timer = setTimeout(finish, 12000);
    v.onerror = () => {
      clearTimeout(timer);
      finish();
    };
    v.onloadedmetadata = () => {
      const d = v.duration;
      if (isFinite(d) && d > 0) {
        track.vd = d;
        try {
          v.currentTime = Math.min(Math.max(d * 0.1, 1), Math.max(d - 0.2, 0));
        } catch {
          // ignore
        }
      }
    };
    v.onseeked = () => {
      try {
        const w = v.videoWidth;
        const h = v.videoHeight;
        if (!w || !h) {
          clearTimeout(timer);
          finish();
          return;
        }
        const s = Math.min(1, 480 / w);
        const c = document.createElement('canvas');
        c.width = Math.round(w * s);
        c.height = Math.round(h * s);
        c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
        c.toBlob(
          (b) => {
            if (b) track.thumb = b;
            clearTimeout(timer);
            finish();
          },
          'image/jpeg',
          0.78
        );
      } catch {
        clearTimeout(timer);
        finish();
      }
    };
    v.src = src;
  });
}

export async function fetchOnlineLyrics(artist: string, title: string): Promise<string> {
  if (!artist.trim() || !title.trim()) return '';
  try {
    const r = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist.trim())}/${encodeURIComponent(title.trim())}`
    );
    if (r.ok) {
      const j = await r.json();
      return String(j.lyrics || '').trim();
    }
  } catch {
    // ignore
  }
  return '';
}

function inferAudioMime(nameOrUrl?: string, blobType?: string): string {
  const cleanType = String(blobType || '').split(';')[0].trim().toLowerCase();
  if (/^(audio|video)\//i.test(cleanType) && cleanType !== 'application/octet-stream') {
    return cleanType;
  }
  const s = String(nameOrUrl || '').toLowerCase().split(/[?#]/)[0];
  if (s.endsWith('.wav')) return 'audio/wav';
  if (s.endsWith('.m4a') || s.endsWith('.m4b') || s.endsWith('.mp4')) return 'audio/mp4';
  if (s.endsWith('.flac')) return 'audio/flac';
  if (s.endsWith('.ogg') || s.endsWith('.opus')) return 'audio/ogg';
  if (s.endsWith('.aac')) return 'audio/aac';
  if (s.endsWith('.webm')) return 'audio/webm';
  return 'audio/mp3';
}

function encodeAudioBufferToWav16(buf: AudioBuffer): Blob {
  const ch = buf.getChannelData(0);
  const dataBytes = ch.length * 2;
  const ab = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(ab);
  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);
  let off = 44;
  for (let i = 0; i < ch.length; i++) {
    const s = Math.max(-1, Math.min(1, ch[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([ab], { type: 'audio/wav' });
}

async function compressAudioBlobForTranscribe(blob: Blob): Promise<Blob> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC || typeof OfflineAudioContext === 'undefined') return blob;
  const ctx = new AC();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const targetRate = 16000;
    const maxSec = 450; // 7.5 min mono 16kHz 16-bit ~= 14.4 MB
    const durSec = Math.min(decoded.duration, maxSec);
    const frameCount = Math.max(1, Math.floor(durSec * targetRate));
    const offline = new OfflineAudioContext(1, frameCount, targetRate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0, 0, durSec);
    const rendered = await offline.startRendering();
    return encodeAudioBufferToWav16(rendered);
  } finally {
    ctx.close().catch(() => {});
  }
}

export async function transcribeTrackLyrics(
  track: Track,
  opts?: { synced?: boolean; onStage?: (stage: string) => void }
): Promise<string> {
  const synced = opts?.synced !== false;
  opts?.onStage?.('Reading song audio…');

  let sourceBlob: Blob | null = track.blob && track.blob.size > 0 ? track.blob : null;
  if (!sourceBlob) {
    const directUrl = track.url || track.web;
    if (!directUrl || track.yt) {
      throw new Error('This track cannot be transcribed directly. Import a local audio file or direct audio URL.');
    }
    const audioRes = await fetch(directUrl);
    if (!audioRes.ok) {
      throw new Error('Could not read audio data for this track.');
    }
    sourceBlob = await audioRes.blob();
  }

  let uploadBlob = sourceBlob;
  let mime = inferAudioMime(track.fn || track.name || track.url, uploadBlob.type);

  if (uploadBlob.size > 15 * 1024 * 1024) {
    opts?.onStage?.('Optimizing large audio…');
    try {
      const wav = await compressAudioBlobForTranscribe(uploadBlob);
      if (wav.size <= 19 * 1024 * 1024) {
        uploadBlob = wav;
        mime = 'audio/wav';
      }
    } catch {
      // fall through and check limit below
    }
  }

  if (uploadBlob.size > 19.5 * 1024 * 1024) {
    throw new Error('Song file is larger than the 20 MB upload limit.');
  }

  opts?.onStage?.('Transcribing lyrics…');
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: {
      'Content-Type': mime,
      'X-Track-Title': encodeURIComponent((track.nick || track.name || '').slice(0, 160)),
      'X-Track-Artist': encodeURIComponent((track.artist || '').slice(0, 120)),
      'X-Synced-Lrc': synced ? '1' : '0',
    },
    body: uploadBlob,
  });

  const data = (await res.json().catch(() => ({}))) as { lyrics?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Transcription failed (${res.status}).`);
  }
  const lyrics = String(data.lyrics || '').trim();
  if (!lyrics) {
    throw new Error('No vocals or lyrics detected in this song.');
  }
  return lyrics;
}

export function knownVideo(
  u: string
): { kind: 'yt'; id: string } | { kind: 'file'; url: string; vk: 'video' | 'audio' | 'pdf' } | { kind: 'embed'; src: string } | null {
  try {
    new URL(u);
  } catch {
    return null;
  }
  const yid = ytId(u);
  if (yid) return { kind: 'yt', id: yid };
  const path = u.split(/[?#]/)[0];
  if (/\.(mp4|webm|mkv|mov|m4v|m3u8)$/i.test(path)) return { kind: 'file', url: u, vk: 'video' };
  if (/\.(mp3|m4a|m4b|flac|ogg|opus|wav|aac)$/i.test(path))
    return { kind: 'file', url: u, vk: 'audio' };
  if (/\.pdf$/i.test(path)) return { kind: 'file', url: u, vk: 'pdf' };
  let m: RegExpMatchArray | null;
  if ((m = u.match(/vimeo\.com\/(?:[^?#]*\/)?(\d{6,})(?:\/([0-9a-f]{8,}))?/i)))
    return { kind: 'embed', src: 'https://player.vimeo.com/video/' + m[1] + (m[2] ? '?h=' + m[2] : '') };
  if ((m = u.match(/(?:dailymotion\.com\/(?:video|embed\/video)\/|dai\.ly\/)([a-z0-9]+)/i)))
    return { kind: 'embed', src: 'https://www.dailymotion.com/embed/video/' + m[1] };
  if ((m = u.match(/streamable\.com\/(?:e\/)?([a-z0-9]+)/i)))
    return { kind: 'embed', src: 'https://streamable.com/e/' + m[1] };
  return null;
}

export async function oeName(u: string): Promise<string> {
  const E = encodeURIComponent(u);
  const API: [RegExp, string][] = [
    [/vimeo\.com/i, 'https://vimeo.com/api/oembed.json?url='],
    [/dailymotion\.com|dai\.ly/i, 'https://www.dailymotion.com/services/oembed?format=json&url='],
    [/streamable\.com/i, 'https://api.streamable.com/oembed.json?url='],
    [/youtu/i, 'https://www.youtube.com/oembed?format=json&url='],
  ];
  const a = API.find((x) => x[0].test(u));
  if (!a) return '';
  try {
    const r = await fetch(a[1] + E);
    if (r.ok) return (await r.json()).title || '';
  } catch {
    // ignore
  }
  return '';
}

const enc = new TextEncoder();
const b64s = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

export async function pwHash(pw: string, salt: Uint8Array): Promise<Uint8Array> {
  if (!(window.crypto && crypto.subtle))
    throw new Error('Password protection requires a secure HTTPS context');
  const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const buf = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 150000, hash: 'SHA-256' },
    k,
    256
  );
  return new Uint8Array(buf);
}

export async function createPasswordRecord(pw: string): Promise<{ s: string; h: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pwHash(pw, salt);
  return { s: b64s(salt), h: b64s(hash) };
}

export async function verifyPasswordRecord(
  pw: string,
  rec?: { s: string; h: string }
): Promise<boolean> {
  if (!rec) return true;
  try {
    const h = await pwHash(pw, unb64(rec.s));
    return b64s(h) === rec.h;
  } catch {
    return false;
  }
}
