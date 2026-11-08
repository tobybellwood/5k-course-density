import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type {
  Coordinate,
  ParticipantPosition,
  SimulationSnapshot,
} from '../app/types';
import {
  createParticipantPosition,
  createSimulationSnapshot,
} from '../domain/validation';
import {
  aggregateDensity,
  buildVisualizationRenderModel,
} from './renderModels';

const REFERENCE_LATITUDE = 51.5;
const REFERENCE_LONGITUDE = -0.1;

type CellKey = `${number}:${number}`;

const coordinateArbitrary: fc.Arbitrary<Coordinate> = fc.record({
  lat: fc.integer({ min: -20_000, max: 20_000 }).map(
    (offset) => REFERENCE_LATITUDE + offset / 1_000_000,
  ),
  lon: fc.integer({ min: -20_000, max: 20_000 }).map(
    (offset) => REFERENCE_LONGITUDE + offset / 1_000_000,
  ),
});

const positionInputArbitrary = fc.record({
  coordinate: coordinateArbitrary,
  finishDurationSeconds: fc.integer({ min: 1, max: 7_200 }),
  routeFraction: fc.integer({ min: 0, max: 1_000 }).map((value) => value / 1_000),
});

const simulationSnapshotArbitrary: fc.Arbitrary<SimulationSnapshot> = fc
  .record({
    simulationTimeSeconds: fc.integer({ min: 0, max: 7_200 }),
    positions: fc.array(positionInputArbitrary, { minLength: 1, maxLength: 30 }),
  })
  .map(({ simulationTimeSeconds, positions: inputs }) => {
    const positions: ParticipantPosition[] = inputs.map((input, index) => {
      const result = createParticipantPosition(
        {
          id: `runner-${index}`,
          displayName: `Runner ${index}`,
          finishDurationSeconds: input.finishDurationSeconds,
        },
        input.routeFraction,
        input.coordinate,
      );
      if (!result.ok) {
        throw new Error(`Generated position was rejected: ${result.reason}`);
      }
      return result.value;
    });

    const result = createSimulationSnapshot(simulationTimeSeconds, positions);
    if (!result.ok) {
      throw new Error(`Generated snapshot was rejected: ${result.reason}`);
    }
    return result.value;
  });

const gridSizeArbitrary = fc.integer({ min: 1, max: 2_000 });

function densityCountsByCell(
  cells: readonly { readonly cellX: number; readonly cellY: number; readonly count: number }[],
): Map<CellKey, number> {
  return new Map(
    cells.map((cell) => [`${cell.cellX}:${cell.cellY}` as CellKey, cell.count]),
  );
}

describe(
  'Feature: course-density-visualization, Property 9: Visual layers are derived from one simulation snapshot',
  () => {
    it('keeps marker identity, coordinates, time, and density counts tied to the same snapshot', () => {
      fc.assert(
        fc.property(simulationSnapshotArbitrary, gridSizeArbitrary, (snapshot, gridSizeMeters) => {
          const model = buildVisualizationRenderModel(snapshot, { gridSizeMeters });
          const expectedDensity = aggregateDensity(snapshot.positions, gridSizeMeters);

          expect(model.simulationTimeSeconds).toBe(snapshot.simulationTimeSeconds);
          expect(model.densityGridSizeMeters).toBe(gridSizeMeters);
          expect(model.markers).toHaveLength(snapshot.positions.length);
          expect(model.markers.map((marker) => ({
            id: marker.id,
            displayName: marker.displayName,
            finishDurationSeconds: marker.finishDurationSeconds,
            routeFraction: marker.routeFraction,
            coordinate: marker.coordinate,
          }))).toEqual(snapshot.positions);
          expect(model.markers.every(
            (marker) => marker.simulationTimeSeconds === snapshot.simulationTimeSeconds,
          )).toBe(true);

          expect(densityCountsByCell(model.density)).toEqual(
            densityCountsByCell(expectedDensity),
          );
          expect(model.density.reduce((total, cell) => total + cell.count, 0))
            .toBe(snapshot.positions.length);
        }),
        { numRuns: 200 },
      );
    });
  },
);
