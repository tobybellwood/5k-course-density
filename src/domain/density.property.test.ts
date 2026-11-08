import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Coordinate, DensityCell, ParticipantPosition } from '../app/types';
import { EARTH_RADIUS_METERS } from './geometry';
import { aggregateDensity } from '../map/renderModels';

const DEGREES_TO_RADIANS = Math.PI / 180;
const REFERENCE_LATITUDE = 51.5;
const REFERENCE_LONGITUDE = -0.1;

type CellKey = `${number},${number}`;

const coordinateArbitrary: fc.Arbitrary<Coordinate> = fc.record({
  lat: fc.integer({ min: -20_000, max: 20_000 }).map(
    (offset) => REFERENCE_LATITUDE + offset / 1_000_000,
  ),
  lon: fc.integer({ min: -20_000, max: 20_000 }).map(
    (offset) => REFERENCE_LONGITUDE + offset / 1_000_000,
  ),
});

const positionArbitrary: fc.Arbitrary<ParticipantPosition> = fc
  .record({
    coordinate: coordinateArbitrary,
    finishDurationSeconds: fc.integer({ min: 1, max: 7_200 }),
    routeFraction: fc.integer({ min: 0, max: 1_000 }).map((value) => value / 1_000),
    participantNumber: fc.nat(),
  })
  .map(({ coordinate, finishDurationSeconds, routeFraction, participantNumber }) => ({
    id: `runner-${participantNumber}`,
    displayName: `Runner ${participantNumber}`,
    finishDurationSeconds,
    routeFraction,
    coordinate,
  }));

const positionsArbitrary = fc.array(positionArbitrary, { minLength: 1, maxLength: 100 });
const gridSizeArbitrary = fc.integer({ min: 1, max: 2_000 });

function projectCellKey(
  coordinate: Coordinate,
  positions: readonly ParticipantPosition[],
  gridSizeMeters: number,
): CellKey {
  const centerLat = positions.reduce((sum, position) => sum + position.coordinate.lat, 0) / positions.length;
  const centerLon = positions.reduce((sum, position) => sum + position.coordinate.lon, 0) / positions.length;
  const centerLatitudeRadians = centerLat * DEGREES_TO_RADIANS;
  const x =
    EARTH_RADIUS_METERS *
    ((coordinate.lon - centerLon) * DEGREES_TO_RADIANS) *
    Math.cos(centerLatitudeRadians);
  const y = EARTH_RADIUS_METERS * ((coordinate.lat - centerLat) * DEGREES_TO_RADIANS);

  return `${Math.floor(x / gridSizeMeters)},${Math.floor(y / gridSizeMeters)}`;
}

function expectedCounts(
  positions: readonly ParticipantPosition[],
  gridSizeMeters: number,
): Map<CellKey, number> {
  return positions.reduce((counts, position) => {
    const key = projectCellKey(position.coordinate, positions, gridSizeMeters);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<CellKey, number>());
}

function actualCounts(cells: readonly DensityCell[]): Map<CellKey, number> {
  return new Map(cells.map((cell) => [`${cell.cellX},${cell.cellY}` as CellKey, cell.count]));
}

describe('Feature: course-density-visualization, Property 8: Density cells equal position counts', () => {
  it('counts every generated position in the cell selected by the meter grid', () => {
    fc.assert(
      fc.property(positionsArbitrary, gridSizeArbitrary, (positions, gridSizeMeters) => {
        const cells = aggregateDensity(positions, gridSizeMeters);
        const expected = expectedCounts(positions, gridSizeMeters);

        expect(actualCounts(cells)).toEqual(expected);
        expect(cells.reduce((total, cell) => total + cell.count, 0)).toBe(positions.length);
        expect(cells.every((cell) => cell.count > 0)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('returns no cells for an empty position collection', () => {
    expect(aggregateDensity([], 25)).toEqual([]);
  });

  it('creates one count-one cell for a single position at any positive grid size', () => {
    const position: ParticipantPosition = {
      id: 'single-runner',
      displayName: 'Single Runner',
      finishDurationSeconds: 1,
      routeFraction: 0,
      coordinate: { lat: REFERENCE_LATITUDE, lon: REFERENCE_LONGITUDE },
    };

    for (const gridSizeMeters of [1, 25, 1_000, 10_000]) {
      const cells = aggregateDensity([position], gridSizeMeters);
      expect(cells).toHaveLength(1);
      expect(cells[0].count).toBe(1);
      expect(Number.isFinite(cells[0].coordinate.lat)).toBe(true);
      expect(Number.isFinite(cells[0].coordinate.lon)).toBe(true);
    }
  });

  it('aggregates duplicate coordinates into one cell without losing multiplicity', () => {
    const duplicateCoordinate = { lat: REFERENCE_LATITUDE, lon: REFERENCE_LONGITUDE };
    const positions: ParticipantPosition[] = Array.from({ length: 7 }, (_, index) => ({
      id: `duplicate-${index}`,
      displayName: `Duplicate ${index}`,
      finishDurationSeconds: index + 1,
      routeFraction: index / 6,
      coordinate: duplicateCoordinate,
    }));

    const cells = aggregateDensity(positions, 25);

    expect(cells).toHaveLength(1);
    expect(cells[0].count).toBe(positions.length);
  });

  it('keeps positions in separate cells when the grid is sufficiently small', () => {
    const positions: ParticipantPosition[] = [
      {
        id: 'west',
        displayName: 'West',
        finishDurationSeconds: 1,
        routeFraction: 0,
        coordinate: { lat: REFERENCE_LATITUDE, lon: REFERENCE_LONGITUDE - 0.001 },
      },
      {
        id: 'east',
        displayName: 'East',
        finishDurationSeconds: 1,
        routeFraction: 0,
        coordinate: { lat: REFERENCE_LATITUDE, lon: REFERENCE_LONGITUDE + 0.001 },
      },
    ];

    const cells = aggregateDensity(positions, 10);

    expect(cells).toHaveLength(2);
    expect(cells.map((cell) => cell.count).sort()).toEqual([1, 1]);
  });
});
