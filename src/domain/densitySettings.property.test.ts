import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Coordinate, DensitySettings, ParticipantPosition } from '../app/types';
import { aggregateDensity } from '../map/renderModels';
import { EARTH_RADIUS_METERS } from './geometry';
import {
  SUPPORTED_DENSITY_GRID_SIZES,
  validateDensitySettings,
} from './densitySettings';

const DEGREES_TO_RADIANS = Math.PI / 180;
const REFERENCE_COORDINATE: Coordinate = { lat: 51.5, lon: -0.1 };
const CURRENT_SETTINGS: DensitySettings = Object.freeze({
  gridSizeMeters: 50,
  minimumPeoplePerCircle: 3,
  warningColourThreshold: 8,
});

type CandidateSettings = {
  readonly gridSizeMeters: unknown;
  readonly minimumPeoplePerCircle: unknown;
  readonly warningColourThreshold: unknown;
};

type CellKey = `${number}:${number}`;

type DensityCase = {
  readonly settings: DensitySettings;
  readonly positions: readonly ParticipantPosition[];
};

const supportedGridSizeArbitrary = fc.constantFrom(...SUPPORTED_DENSITY_GRID_SIZES);

const invalidGridSizeArbitrary: fc.Arbitrary<unknown> = fc.oneof(
  fc.integer({ min: -100, max: 200 }).filter(
    (value) => !(SUPPORTED_DENSITY_GRID_SIZES as readonly number[]).includes(value),
  ),
  fc.constantFrom<unknown>('25', null, undefined, true),
);

const candidateGridSizeArbitrary: fc.Arbitrary<unknown> = fc.oneof(
  supportedGridSizeArbitrary,
  invalidGridSizeArbitrary,
);

const candidateMinimumArbitrary: fc.Arbitrary<unknown> = fc.oneof(
  fc.integer({ min: 1, max: 20 }),
  fc.integer({ min: -20, max: 0 }),
  fc.integer({ min: 1, max: 20 }).map((value) => value + 0.5),
  fc.constantFrom<unknown>('1', null, undefined, false),
);

const candidateWarningArbitrary: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(null),
  fc.integer({ min: -5, max: 35 }),
  fc.integer({ min: 1, max: 35 }).map((value) => value + 0.5),
  fc.constantFrom<unknown>('8', undefined, false),
);

const candidateSettingsArbitrary: fc.Arbitrary<CandidateSettings> = fc.record({
  gridSizeMeters: candidateGridSizeArbitrary,
  minimumPeoplePerCircle: candidateMinimumArbitrary,
  warningColourThreshold: candidateWarningArbitrary,
});

function isValidCandidate(candidate: CandidateSettings): boolean {
  const validGridSize = (SUPPORTED_DENSITY_GRID_SIZES as readonly unknown[]).includes(
    candidate.gridSizeMeters,
  );
  const validMinimum =
    typeof candidate.minimumPeoplePerCircle === 'number' &&
    Number.isInteger(candidate.minimumPeoplePerCircle) &&
    candidate.minimumPeoplePerCircle >= 1;
  const validWarning =
    candidate.warningColourThreshold === null ||
    (
      typeof candidate.warningColourThreshold === 'number' &&
      Number.isInteger(candidate.warningColourThreshold) &&
      validMinimum &&
      candidate.warningColourThreshold > candidate.minimumPeoplePerCircle
    );

  return validGridSize && validMinimum && validWarning;
}

function makePosition(index: number, coordinate: Coordinate): ParticipantPosition {
  return {
    id: `generated-${index}`,
    displayName: `Generated ${index}`,
    finishDurationSeconds: index + 1,
    routeFraction: 0,
    coordinate,
  };
}

function makeCluster(
  startIndex: number,
  count: number,
  coordinate: Coordinate,
): readonly ParticipantPosition[] {
  return Array.from({ length: count }, (_, offset) =>
    makePosition(startIndex + offset, coordinate),
  );
}

function projectCellKey(
  coordinate: Coordinate,
  center: Coordinate,
  gridSizeMeters: number,
): CellKey {
  const centerLatitudeRadians = center.lat * DEGREES_TO_RADIANS;
  const x =
    EARTH_RADIUS_METERS *
    ((coordinate.lon - center.lon) * DEGREES_TO_RADIANS) *
    Math.cos(centerLatitudeRadians);
  const y = EARTH_RADIUS_METERS * ((coordinate.lat - center.lat) * DEGREES_TO_RADIANS);

  return `${Math.floor(x / gridSizeMeters)}:${Math.floor(y / gridSizeMeters)}`;
}

function arithmeticCenter(positions: readonly ParticipantPosition[]): Coordinate {
  if (positions.length === 0) {
    return REFERENCE_COORDINATE;
  }

  return {
    lat: positions.reduce((sum, position) => sum + position.coordinate.lat, 0) / positions.length,
    lon: positions.reduce((sum, position) => sum + position.coordinate.lon, 0) / positions.length,
  };
}

function expectedCounts(
  positions: readonly ParticipantPosition[],
  gridSizeMeters: number,
): Map<CellKey, number> {
  const center = arithmeticCenter(positions);
  return positions.reduce((counts, position) => {
    const key = projectCellKey(position.coordinate, center, gridSizeMeters);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<CellKey, number>());
}

function actualCounts(cells: readonly { readonly cellX: number; readonly cellY: number; count: number }[]): Map<CellKey, number> {
  return new Map(
    cells.map((cell) => [`${cell.cellX}:${cell.cellY}` as CellKey, cell.count]),
  );
}

function normalColour(count: number, maximumCount: number): 'density-low' | 'density-medium' | 'density-high' {
  const intensity = maximumCount <= 0 ? 0 : count / maximumCount;
  if (intensity <= 1 / 3) {
    return 'density-low';
  }
  if (intensity <= 2 / 3) {
    return 'density-medium';
  }
  return 'density-high';
}

const inclusiveFilterCaseArbitrary: fc.Arbitrary<DensityCase> = fc
  .record({
    gridSizeMeters: supportedGridSizeArbitrary,
    minimumPeoplePerCircle: fc.integer({ min: 1, max: 10 }),
    additionalClusterCount: fc.integer({ min: 0, max: 12 }),
  })
  .map(({ gridSizeMeters, minimumPeoplePerCircle, additionalClusterCount }) => {
    const positions = [
      ...makeCluster(0, minimumPeoplePerCircle, REFERENCE_COORDINATE),
      ...makeCluster(
        minimumPeoplePerCircle,
        Math.max(0, minimumPeoplePerCircle - 1),
        { lat: REFERENCE_COORDINATE.lat + 0.01, lon: REFERENCE_COORDINATE.lon },
      ),
      ...makeCluster(
        minimumPeoplePerCircle * 2,
        additionalClusterCount,
        { lat: REFERENCE_COORDINATE.lat - 0.01, lon: REFERENCE_COORDINATE.lon },
      ),
    ];

    return {
      settings: {
        gridSizeMeters,
        minimumPeoplePerCircle,
        warningColourThreshold: null,
      },
      positions,
    };
  });

const warningBoundaryCaseArbitrary: fc.Arbitrary<DensityCase> = fc
  .record({
    gridSizeMeters: supportedGridSizeArbitrary,
    minimumPeoplePerCircle: fc.integer({ min: 1, max: 8 }),
    warningOffset: fc.integer({ min: 1, max: 8 }),
  })
  .map(({ gridSizeMeters, minimumPeoplePerCircle, warningOffset }) => {
    const warningThreshold = minimumPeoplePerCircle + warningOffset;
    const positions = [
      ...makeCluster(0, warningThreshold, REFERENCE_COORDINATE),
      ...makeCluster(
        warningThreshold,
        minimumPeoplePerCircle,
        { lat: REFERENCE_COORDINATE.lat + 0.01, lon: REFERENCE_COORDINATE.lon },
      ),
      ...makeCluster(
        warningThreshold + minimumPeoplePerCircle,
        Math.max(0, minimumPeoplePerCircle - 1),
        { lat: REFERENCE_COORDINATE.lat + 0.02, lon: REFERENCE_COORDINATE.lon },
      ),
    ];

    return {
      settings: {
        gridSizeMeters,
        minimumPeoplePerCircle,
        warningColourThreshold: warningThreshold,
      },
      positions,
    };
  });

const deterministicCaseArbitrary: fc.Arbitrary<{
  readonly positions: readonly ParticipantPosition[];
  readonly center: Coordinate;
  readonly settings: DensitySettings;
}> = fc
  .record({
    coordinates: fc.array(
      fc.record({
        latOffset: fc.integer({ min: -5_000, max: 5_000 }),
        lonOffset: fc.integer({ min: -5_000, max: 5_000 }),
        finishDurationSeconds: fc.integer({ min: 1, max: 7_200 }),
        routeFraction: fc.integer({ min: 0, max: 1_000 }),
      }),
      { minLength: 0, maxLength: 60 },
    ),
    centerOffsets: fc.record({
      latOffset: fc.integer({ min: -5_000, max: 5_000 }),
      lonOffset: fc.integer({ min: -5_000, max: 5_000 }),
    }),
    gridSizeMeters: supportedGridSizeArbitrary,
    minimumPeoplePerCircle: fc.integer({ min: 1, max: 10 }),
    warningMode: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 10 })),
  })
  .map(({ coordinates, centerOffsets, gridSizeMeters, minimumPeoplePerCircle, warningMode }) => ({
    positions: coordinates.map((value, index) => ({
      id: `random-${index}`,
      displayName: `Random ${index}`,
      finishDurationSeconds: value.finishDurationSeconds,
      routeFraction: value.routeFraction / 1_000,
      coordinate: {
        lat: REFERENCE_COORDINATE.lat + value.latOffset / 1_000_000,
        lon: REFERENCE_COORDINATE.lon + value.lonOffset / 1_000_000,
      },
    })),
    center: {
      lat: REFERENCE_COORDINATE.lat + centerOffsets.latOffset / 1_000_000,
      lon: REFERENCE_COORDINATE.lon + centerOffsets.lonOffset / 1_000_000,
    },
    settings: {
      gridSizeMeters,
      minimumPeoplePerCircle,
      warningColourThreshold: warningMode === null
        ? null
        : minimumPeoplePerCircle + warningMode,
    },
  }));

describe(
  'Feature: course-density-visualization, Property 12: Density settings validation preserves the cross-field invariant',
  () => {
    it('accepts exactly valid candidates and preserves current settings for every invalid candidate', () => {
      fc.assert(
        fc.property(candidateSettingsArbitrary, (candidate) => {
          const result = validateDensitySettings(candidate, CURRENT_SETTINGS);

          expect(result.ok).toBe(isValidCandidate(candidate));
          if (isValidCandidate(candidate)) {
            expect(result.settings).toEqual(candidate);
          } else {
            expect(result.ok).toBe(false);
            expect(result.settings).toBe(CURRENT_SETTINGS);
          }
        }),
        { numRuns: 200 },
      );
    });
  },
);

describe(
  'Feature: course-density-visualization, Property 13: Minimum filter uses inclusive count boundaries',
  () => {
    it('retains exactly-boundary cells and excludes every cell below the minimum', () => {
      fc.assert(
        fc.property(inclusiveFilterCaseArbitrary, ({ settings, positions }) => {
          const cells = aggregateDensity(positions, settings);
          const expected = expectedCounts(positions, settings.gridSizeMeters);
          const expectedRetained = new Map(
            [...expected].filter(([, count]) => count >= settings.minimumPeoplePerCircle),
          );
          const actual = actualCounts(cells);

          expect(actual).toEqual(expectedRetained);
          expect([...actual.values()].every((count) => count >= settings.minimumPeoplePerCircle)).toBe(true);
          expect(
            [...expected].filter(([, count]) => count < settings.minimumPeoplePerCircle)
              .every(([key]) => !actual.has(key)),
          ).toBe(true);

          const boundaryKey = projectCellKey(
            REFERENCE_COORDINATE,
            arithmeticCenter(positions),
            settings.gridSizeMeters,
          );
          expect(expected.get(boundaryKey)).toBe(settings.minimumPeoplePerCircle);
          expect(actual.get(boundaryKey)).toBe(settings.minimumPeoplePerCircle);
        }),
        { numRuns: 200 },
      );
    });
  },
);

describe(
  'Feature: course-density-visualization, Property 14: Warning threshold uses an inclusive colour boundary',
  () => {
    it('colours the threshold boundary as warning and lower retained cells normally', () => {
      fc.assert(
        fc.property(warningBoundaryCaseArbitrary, ({ settings, positions }) => {
          const cells = aggregateDensity(positions, settings);
          const expected = expectedCounts(positions, settings.gridSizeMeters);
          const maximumRetainedCount = Math.max(...expected.values());

          expect(cells.length).toBe(
            [...expected].filter(([, count]) => count >= settings.minimumPeoplePerCircle).length,
          );
          for (const cell of cells) {
            if (cell.count >= settings.warningColourThreshold!) {
              expect(cell.colour).toBe('warning');
            } else {
              expect(cell.colour).toBe(normalColour(cell.count, maximumRetainedCount));
              expect(cell.colour).not.toBe('warning');
            }
          }

          const warningKey = projectCellKey(
            REFERENCE_COORDINATE,
            arithmeticCenter(positions),
            settings.gridSizeMeters,
          );
          const warningCell = cells.find(
            (cell) => `${cell.cellX}:${cell.cellY}` === warningKey,
          );
          expect(warningCell).toMatchObject({
            count: settings.warningColourThreshold,
            colour: 'warning',
          });
        }),
        { numRuns: 200 },
      );
    });
  },
);

describe(
  'Feature: course-density-visualization, Property 15: Density aggregation and colouring are deterministic',
  () => {
    it('returns identical coordinates, counts, filtering, colours, and ordering for repeated aggregation', () => {
      fc.assert(
        fc.property(deterministicCaseArbitrary, ({ positions, center, settings }) => {
          const first = aggregateDensity(positions, settings, center);
          const second = aggregateDensity(positions, settings, center);

          expect(second).toEqual(first);
          expect(second.every((cell) => cell.count >= settings.minimumPeoplePerCircle)).toBe(true);
          expect(second).toEqual(
            [...second].sort(
              (left, right) => left.cellY - right.cellY || left.cellX - right.cellX,
            ),
          );
          if (settings.warningColourThreshold !== null) {
            expect(
              second
                .filter((cell) => cell.colour === 'warning')
                .every((cell) => cell.count >= settings.warningColourThreshold!),
            ).toBe(true);
          } else {
            expect(second.some((cell) => cell.colour === 'warning')).toBe(false);
          }
        }),
        { numRuns: 200 },
      );
    });
  },
);
