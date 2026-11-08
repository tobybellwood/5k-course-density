import { describe, expect, it } from 'vitest';

import { parseDuration } from './duration';

describe('parseDuration', () => {
  it.each([
    ['20:33', 1233],
    ['  1:02  ', 62],
    ['60:00', 3600],
    ['1:02:03', 3723],
    [' 12:34:56 ', 45296],
  ])('parses %j as %i seconds', (input, seconds) => {
    expect(parseDuration(input)).toEqual({ ok: true, seconds });
  });

  it.each([
    '',
    '20',
    '20:3',
    '20:60',
    '1:60:00',
    '1:02:60',
    '1.5:02',
    '-1:02',
    '1:02:03:04',
  ])('rejects malformed duration %j', (input) => {
    expect(parseDuration(input)).toEqual({ ok: false, reason: 'invalid-duration' });
  });

  it.each(['0:00', '00:00', '0:00:00'])(
    'classifies non-positive duration %j',
    (input) => {
      expect(parseDuration(input)).toEqual({
        ok: false,
        reason: 'non-positive-duration',
      });
    },
  );

  it('parses the smallest positive duration', () => {
    expect(parseDuration('00:00:01')).toEqual({ ok: true, seconds: 1 });
  });
});
