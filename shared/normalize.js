// Transcript normalisation. Pure functions, no I/O — shared by server and tests.
// Original timestamps are never modified; we only ADD derived fields.

const MMSS = /^(?:(\d+):)?(\d{1,3}):(\d{2})(?:\.(\d+))?$/;
const ISO = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/;

/** Parse "MM:SS" or "H:MM:SS" into seconds. Returns null if not that format. */
export function parseClock(ts) {
  const m = MMSS.exec(String(ts).trim());
  if (!m) return null;
  const h = m[1] ? Number(m[1]) : 0;
  return h * 3600 + Number(m[2]) * 60 + Number(m[3]) + (m[4] ? Number('0.' + m[4]) : 0);
}

/**
 * Parse ISO 8601 into epoch seconds (float). Handles 7-digit fractions
 * (".1900670") that Date.parse may reject or truncate.
 */
export function parseIso(ts) {
  const m = ISO.exec(String(ts).trim());
  if (!m) return null;
  const [, date, hh, mm, ss, frac, tz] = m;
  const base = Date.parse(`${date}T${hh}:${mm}:${ss}${normTz(tz)}`);
  if (Number.isNaN(base)) return null;
  return base / 1000 + (frac ? Number('0.' + frac) : 0);
}

function normTz(tz) {
  if (!tz) return 'Z';
  if (tz === 'Z') return 'Z';
  return tz.length === 5 ? `${tz.slice(0, 3)}:${tz.slice(3)}` : tz;
}

/** Detect the timestamp format of a transcript. */
export function detectFormat(transcript) {
  const first = transcript.find((m) => m && m.timestamp != null);
  if (!first) return 'none';
  if (parseClock(first.timestamp) != null) return 'clock';
  if (parseIso(first.timestamp) != null) return 'iso';
  return 'unknown';
}

// System events that control the recording (RU / KZ / EN wording seen in data).
const REC_START = [/запись и транскрибирование запущены/i, /жазу және транскрипция басталды/i, /recording .*started/i];
const REC_PAUSE = [/запись и транскрибирование приостановлены/i, /recording .*paused/i];
const REC_RESUME = [/запись и транскрибирование возобновлены/i, /recording .*resumed/i];
const any = (res, t) => res.some((r) => r.test(t));

/**
 * Normalise one record. Adds per message:
 *   idx         — position in the ORIGINAL array (evidence references use this)
 *   offset_sec  — seconds from the first message
 *   audio_sec   — seconds into the recording (calls only; null if before recording)
 *   duplicate_of — idx of an identical earlier message (same ts+speaker+text)
 */
export function normalizeRecord(rec) {
  const transcript = Array.isArray(rec.transcript) ? rec.transcript : [];
  const fmt = detectFormat(transcript);
  const abs = transcript.map((m) =>
    fmt === 'clock' ? parseClock(m.timestamp) : fmt === 'iso' ? parseIso(m.timestamp) : null,
  );
  const t0 = abs.find((x) => x != null) ?? 0;

  // Recording timeline: audio = t - recStart - pausedBefore(t).
  // Verified on DEV calls: paused stretches are cut from the MP3, holds are not.
  let recStart = null;
  const pauses = []; // [start, end]
  if (fmt === 'iso') {
    let pauseAt = null;
    transcript.forEach((m, i) => {
      if (m.speaker !== 'system' || abs[i] == null) return;
      if (recStart == null && any(REC_START, m.text)) recStart = abs[i];
      else if (any(REC_PAUSE, m.text)) pauseAt = abs[i];
      else if (any(REC_RESUME, m.text) && pauseAt != null) {
        pauses.push([pauseAt, abs[i]]);
        pauseAt = null;
      }
    });
    if (recStart == null) recStart = t0;
  }

  const seen = new Map();
  const messages = transcript.map((m, i) => {
    const key = `${m.timestamp}|${m.speaker}|${m.text}`;
    const dup = seen.has(key) ? seen.get(key) : null;
    if (dup == null) seen.set(key, i);
    let audio = null;
    if (fmt === 'iso' && abs[i] != null) {
      let t = abs[i] - recStart;
      for (const [ps, pe] of pauses) {
        if (abs[i] >= pe) t -= pe - ps;
        else if (abs[i] > ps) t -= abs[i] - ps; // inside a pause → clamp to pause start
      }
      audio = t < 0 ? 0 : round3(t);
    }
    return {
      idx: i,
      timestamp: m.timestamp, // original, untouched
      speaker: m.speaker,
      text: m.text ?? '',
      offset_sec: abs[i] == null ? null : round3(abs[i] - t0),
      audio_sec: audio,
      duplicate_of: dup,
    };
  });

  return {
    conversation_id: rec.conversation_id,
    channel: rec.channel,
    language: rec.language,
    audio_url: rec.audio_url ?? null,
    timestamp_format: fmt,
    messages,
  };
}

const round3 = (x) => Math.round(x * 1000) / 1000;

/** "125.4" → "02:05" for display. */
export function fmtClock(sec) {
  if (sec == null) return '';
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
