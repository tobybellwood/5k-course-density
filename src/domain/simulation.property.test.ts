import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Coordinate, CourseTrack, ParticipantRecord, TrackPoint } from '../app/types';
import { createCourseTrackFromCoordinates } from './geometry';
import { calculateTotalDuration, simulate } from './simulation';

const COORDINATE_TOLERANCE_DEGREES = 1e-9;
const FRACTION_TOLERANCE = 1e-12;

const coordinateArbitrary: fc.Arbitrary<Coordinate> = fc.record({
  lat: fc.integer({ min: -60000000, max: 60000000 }).map((value) => value / 1_000_000),
  lon: fc.integer({ min: -150000000, max: 150000000 }).map((value) => value / 1_000_000),
});

/**
 * Builds routes from small steps so generated routes remain geographically
 * local while still including zero-length segments and repeated points.
 */
const routeCoordinatesArbitrary: fc.Arbitrary<readonly Coordinate[]> = fc
  .record({
    start: coordinateArbitrary,
    steps: fc.array(
      fc.oneof(
        fc.constant({ lat: 0, lon: 0 }),
        fc.record({
          lat: fc.integer({ min: -5000, max: 5000 }).map((value) => value / 1_000_000),
          lon: fc.integer({ min: -5000, max: 5000 }).map((value) => value / 1_000_000),
        }),
      ),
      { minLength: 1, maxLength: 8 },
    ),
  })
  .map(({ start, steps }) => {
    const coordinates: Coordinate[] = [start];
    for (const step of steps) {
      const previous = coordinates[coordinates.length - 1];
      coordinates.push({ lat: previous.lat + step.lat, lon: previous.lon + step.lon });
    }
    return coordinates;
  });

const participantDurationsArbitrary = fc.array(
  fc.integer({ min: 1, max: 7_200 }),
  { minLength: 1, maxLength: 8 },
);

const simulationCaseArbitrary = fc
  .record({
    coordinates: routeCoordinatesArbitrary,
    durations: participantDurationsArbitrary,
    arbitraryTime: fc.integer({ min: 0, max: 7_200 }),
  })
  .map(({ coordinates, durations, arbitraryTime }) => {
    const courseResult = createCourseTrackFromCoordinates(coordinates);
    if (!courseResult.ok) {
      throw new Error(`Generated route was rejected: ${courseResult.reason}`);
    }

    const participants: ParticipantRecord[] = durations.map((finishDurationSeconds, index) => ({
      id: `runner-${index}`,
      displayName: `Runner ${index}`,
      finishDurationSeconds,
    }));

    return {
      course: courseResult.value,
      participants,
      arbitraryTime,
    };
  });

function referenceCoordinate(points: readonly TrackPoint[], fraction: number): Coordinate {
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const totalDistanceMeters = lastPoint.cumulativeDistanceMeters;

  if (totalDistanceMeters <= 0 || fraction <= 0) {
    return { lat: firstPoint.lat, lon: firstPoint.lon };
  }
  if (fraction >= 1) {
    return { lat: lastPoint.lat, lon: lastPoint.lon };
  }

  const targetDistanceMeters = fraction * totalDistanceMeters;
  for (let index = 1; index < points.length; index += 1) {
    const previousPoint = points[index - 1];
    const currentPoint = points[index];
    const segmentDistanceMeters =
      currentPoint.cumulativeDistanceMeters - previousPoint.cumulativeDistanceMeters;

    if (segmentDistanceMeters <= 0 || currentPoint.cumulativeDistanceMeters < targetDistanceMeters) {
      continue;
    }

    const segmentFraction =
      (targetDistanceMeters - previousPoint.cumulativeDistanceMeters) / segmentDistanceMeters;
    return {
      lat: previousPoint.lat + (currentPoint.lat - previousPoint.lat) * segmentFraction,
      lon: previousPoint.lon + (currentPoint.lon - previousPoint.lon) * segmentFraction,
    };
  }

  return { lat: lastPoint.lat, lon: lastPoint.lon };
}

function expectCoordinatesClose(actual: Coordinate, expected: Coordinate): void {
  expect(Math.abs(actual.lat - expected.lat)).toBeLessThanOrEqual(COORDINATE_TOLERANCE_DEGREES);
  expect(Math.abs(actual.lon - expected.lon)).toBeLessThanOrEqual(COORDINATE_TOLERANCE_DEGREES);
}

describe(
  'Feature: course-density-visualization, Property 4: Total duration is the maximum participant duration',
  () => {
    it('returns the greatest finish duration for every generated participant collection', () => {
      fc.assert(
        fc.property(participantDurationsArbitrary, (durations) => {
          const participants: ParticipantRecord[] = durations.map((finishDurationSeconds, index) => ({
            id: `runner-${index}`,
            displayName: `Runner ${index}`,
            finishDurationSeconds,
          }));

          expect(calculateTotalDuration(participants)).toBe(Math.max(...durations));
        }),
        { numRuns: 200 },
      );
    });
  },
);

describe(
  'Feature: course-density-visualization, Property 5: Constant-pace simulation clamps and interpolates by route distance',
  () => {
    it('clamps fractions and maps generated positions using cumulative route distance', () => {
      fc.assert(
        fc.property(simulationCaseArbitrary, ({ course, participants, arbitraryTime }) => {
          const totalDurationSeconds = Math.max(
            ...participants.map(({ finishDurationSeconds }) => finishDurationSeconds),
          );
          const boundaryTimes = participants.flatMap(({ finishDurationSeconds }) => [
            Math.max(0, finishDurationSeconds - 1),
            finishDurationSeconds,
            finishDurationSeconds + 1,
          ]);
          const times = [0, arbitraryTime, totalDurationSeconds, totalDurationSeconds + 1, ...boundaryTimes];

          for (const timeSeconds of times) {
            const snapshot = simulate(course, participants, timeSeconds);

            expect(snapshot.simulationTimeSeconds).toBe(timeSeconds);
            expect(snapshot.positions).toHaveLength(participants.length);

            snapshot.positions.forEach((position, index) => {
              const participant = participants[index];
              const expectedFraction = Math.min(
                1,
                Math.max(0, timeSeconds / participant.finishDurationSeconds),
              );
              const expectedCoordinate = referenceCoordinate(course.points, expectedFraction);

              expect(position.id).toBe(participant.id);
              expect(position.routeFraction).toBeCloseTo(expectedFraction, 12);
              expect(Math.abs(position.routeFraction - expectedFraction))
                .toBeLessThanOrEqual(FRACTION_TOLERANCE);
              expectCoordinatesClose(position.coordinate, expectedCoordinate);
            });
          }
        }),
        { numRuns: 100 },
      );
    });
  },
);
