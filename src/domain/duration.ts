import { DurationParseResult } from '../app/types';

const MINUTES_SECONDS_PATTERN = /^(\d+):(\d{2})$/;
const HOURS_MINUTES_SECONDS_PATTERN = /^(\d+):(\d{2}):(\d{2})$/;

/**
 * Parse an elapsed duration in strict MM:SS or H:MM:SS form.
 *
 * Surrounding whitespace is allowed, but components must be unsigned integer
 * fields and the seconds field must contain exactly two digits from 00 to 59.
 */
export function parseDuration(value: string): DurationParseResult {
  if (typeof value !== 'string') {
    return { ok: false, reason: 'invalid-duration' };
  }

  const trimmed = value.trim();
  const minutesSecondsMatch = MINUTES_SECONDS_PATTERN.exec(trimmed);
  const hoursMinutesSecondsMatch = HOURS_MINUTES_SECONDS_PATTERN.exec(trimmed);

  let totalSeconds: number;
  if (minutesSecondsMatch !== null) {
    const minutes = Number(minutesSecondsMatch[1]);
    const seconds = Number(minutesSecondsMatch[2]);
    if (seconds > 59) {
      return { ok: false, reason: 'invalid-duration' };
    }
    totalSeconds = minutes * 60 + seconds;
  } else if (hoursMinutesSecondsMatch !== null) {
    const hours = Number(hoursMinutesSecondsMatch[1]);
    const minutes = Number(hoursMinutesSecondsMatch[2]);
    const seconds = Number(hoursMinutesSecondsMatch[3]);
    if (minutes > 59 || seconds > 59) {
      return { ok: false, reason: 'invalid-duration' };
    }
    totalSeconds = hours * 3600 + minutes * 60 + seconds;
  } else {
    return { ok: false, reason: 'invalid-duration' };
  }

  if (!Number.isSafeInteger(totalSeconds)) {
    return { ok: false, reason: 'invalid-duration' };
  }
  if (totalSeconds <= 0) {
    return { ok: false, reason: 'non-positive-duration' };
  }

  return { ok: true, seconds: totalSeconds };
}
