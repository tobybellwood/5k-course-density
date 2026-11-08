import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { parseDuration } from './duration';

type DurationCase = {
  readonly input: string;
  readonly seconds: number;
};

const boundaryMinuteOrSecondArbitrary = fc.oneof(
  fc.constant(0),
  fc.constant(59),
  fc.integer({ min: 0, max: 59 }),
);

const compactDurationArbitrary: fc.Arbitrary<DurationCase> = fc
  .record({
    minutes: fc.oneof(
      fc.constant(0),
      fc.constant(59),
      fc.integer({ min: 0, max: 999 }),
    ),
    seconds: boundaryMinuteOrSecondArbitrary,
  })
  .filter(({ minutes, seconds }) => minutes > 0 || seconds > 0)
  .map(({ minutes, seconds }) => ({
    input: `${minutes}:${String(seconds).padStart(2, '0')}`,
    seconds: minutes * 60 + seconds,
  }));

const extendedDurationArbitrary: fc.Arbitrary<DurationCase> = fc
  .record({
    hours: fc.oneof(
      fc.constant(0),
      fc.constant(1),
      fc.constant(23),
      fc.constant(59),
      fc.integer({ min: 0, max: 99 }),
    ),
    minutes: boundaryMinuteOrSecondArbitrary,
    seconds: boundaryMinuteOrSecondArbitrary,
  })
  .filter(({ hours, minutes, seconds }) => hours > 0 || minutes > 0 || seconds > 0)
  .map(({ hours, minutes, seconds }) => ({
    input: `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    seconds: hours * 3600 + minutes * 60 + seconds,
  }));

const durationArbitrary = fc.oneof(compactDurationArbitrary, extendedDurationArbitrary);

describe(
  'Feature: course-density-visualization, Property 2: Supported duration strings round-trip to exact seconds',
  () => {
    it('converts generated MM:SS and H:MM:SS values to exact whole seconds', () => {
      fc.assert(
        fc.property(durationArbitrary, ({ input, seconds }) => {
          expect(parseDuration(input)).toEqual({ ok: true, seconds });
        }),
        { numRuns: 200 },
      );
    });
  },
);
