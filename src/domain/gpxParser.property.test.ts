import { Window } from 'happy-dom';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseGpx } from './gpxParser';
import {
  calculateCumulativeDistances,
  haversineDistance,
} from './geometry';
import type { Coordinate } from '../app/types';

const COORDINATE_TOLERANCE_DEGREES = 1e-9;
const DISTANCE_TOLERANCE_METERS = 1e-6;

const coordinateArbitrary = fc.record({
  lat: fc.double({ min: -80, max: 80, noNaN: true, noDefaultInfinity: true }),
  lon: fc.double({ min: -170, max: 170, noNaN: true, noDefaultInfinity: true }),
});

const segmentArbitrary = fc
  .record({
    anchor: coordinateArbitrary,
    middle: fc.array(coordinateArbitrary, { maxLength: 3 }),
  })
  .map(({ anchor, middle }) => [anchor, ...middle, anchor]);

const routeArbitrary = fc.array(segmentArbitrary, { minLength: 2, maxLength: 5 });

function buildGpx(segments: readonly (readonly Coordinate[])[]): string {
  const segmentXml = segments
    .map(
      (segment) =>
        `<trkseg>${segment
          .map(({ lat, lon }) => `<trkpt lat="${lat}" lon="${lon}"/>`)
          .join('')}</trkseg>`,
    )
    .join('');

  return `<gpx version="1.1"><trk>${segmentXml}</trk></gpx>`;
}

function expectedCumulativeDistances(
  coordinates: readonly Coordinate[],
): readonly number[] {
  const distances = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    distances.push(
      distances[index - 1] + haversineDistance(coordinates[index - 1], coordinates[index]),
    );
  }
  return distances;
}

describe('GPX and geometry properties', () => {
  const window = new Window();
  const previousDomParser = globalThis.DOMParser;

  beforeAll(() => {
    globalThis.DOMParser = window.DOMParser as unknown as typeof DOMParser;
  });

  afterAll(() => {
    globalThis.DOMParser = previousDomParser;
    window.close();
  });

  it('Feature: course-density-visualization, Property 1: GPX parsing preserves ordered geometry and distance invariants', () => {
    fc.assert(
      fc.property(routeArbitrary, (segments) => {
        const inputCoordinates = segments.flat();
        const result = parseGpx(buildGpx(segments));

        expect(result.ok).toBe(true);
        if (!result.ok) {
          return;
        }

        const parsedCoordinates = result.value.points.map(({ lat, lon }) => ({ lat, lon }));
        const expectedDistances = expectedCumulativeDistances(inputCoordinates);
        const geometryDistances = calculateCumulativeDistances(inputCoordinates);

        expect(parsedCoordinates).toHaveLength(inputCoordinates.length);
        parsedCoordinates.forEach((coordinate, index) => {
          expect(Math.abs(coordinate.lat - inputCoordinates[index].lat))
            .toBeLessThanOrEqual(COORDINATE_TOLERANCE_DEGREES);
          expect(Math.abs(coordinate.lon - inputCoordinates[index].lon))
            .toBeLessThanOrEqual(COORDINATE_TOLERANCE_DEGREES);
        });

        expect(result.value.points[0].cumulativeDistanceMeters).toBe(0);
        result.value.points.forEach((point, index) => {
          expect(Math.abs(point.cumulativeDistanceMeters - expectedDistances[index]))
            .toBeLessThanOrEqual(DISTANCE_TOLERANCE_METERS);
          expect(Math.abs(point.cumulativeDistanceMeters - geometryDistances[index]))
            .toBeLessThanOrEqual(DISTANCE_TOLERANCE_METERS);
        });

        expect(result.value.totalDistanceMeters).toBeCloseTo(
          expectedDistances[expectedDistances.length - 1],
          6,
        );
      }),
      { numRuns: 100 },
    );
  });
});
