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
  buildMarkerDescriptors,
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


type MarkerInput = {
  readonly displayName: string;
  readonly finishDurationSeconds: number;
  readonly routeFraction: number;
  readonly coordinate: Coordinate;
};

const markerInputArbitrary: fc.Arbitrary<MarkerInput> = fc.record({
  displayName: fc.constantFrom(
    'Runner',
    'Ada Example',
    '<img src=x onerror=alert(1)>',
    'Name & "quoted"',
  ),
  finishDurationSeconds: fc.integer({ min: 1, max: 7_200 }),
  routeFraction: fc.integer({ min: 0, max: 1_000 }).map((value) => value / 1_000),
  coordinate: coordinateArbitrary,
});

function snapshotFromMarkerInputs(
  inputs: readonly MarkerInput[],
  simulationTimeSeconds: number,
): SimulationSnapshot {
  const positions: ParticipantPosition[] = inputs.map((input, index) => {
    const result = createParticipantPosition(
      {
        id: `runner-${index}`,
        displayName: input.displayName,
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
}

const markerInputsArbitrary = fc.array(markerInputArbitrary, { minLength: 1, maxLength: 30 });

const playbackPhaseArbitrary = fc.constantFrom('before', 'at', 'after') as fc.Arbitrary<
  'before' | 'at' | 'after'
>;

function snapshotAtLongestFinisherPhase(
  inputs: readonly MarkerInput[],
  phase: 'before' | 'at' | 'after',
): SimulationSnapshot {
  const greatestFinishDurationSeconds = Math.max(
    ...inputs.map((input) => input.finishDurationSeconds),
  );
  const simulationTimeSeconds = phase === 'before'
    ? Math.max(0, greatestFinishDurationSeconds - 1)
    : phase === 'at'
      ? greatestFinishDurationSeconds
      : greatestFinishDurationSeconds + 1;

  return snapshotFromMarkerInputs(
    inputs.map((input) => ({
      ...input,
      routeFraction: Math.min(1, simulationTimeSeconds / input.finishDurationSeconds),
    })),
    simulationTimeSeconds,
  );
}

describe(
  'Feature: course-density-visualization, Property 16: Marker opacity follows the finish boundary',
  () => {
    it('uses opaque unfinished markers and translucent opacity only for non-highlighted finishers', () => {
      fc.assert(
        fc.property(markerInputsArbitrary, (inputs) => {
          const snapshot = snapshotFromMarkerInputs(inputs, 1_000);
          const greatestFinishDurationSeconds = Math.max(
            ...inputs.map((input) => input.finishDurationSeconds),
          );
          const markers = buildMarkerDescriptors(snapshot);

          markers.forEach((marker, index) => {
            const input = inputs[index];
            const expectedOpacity = input.routeFraction < 1 ||
                input.finishDurationSeconds === greatestFinishDurationSeconds
              ? 1
              : 0.35;
            expect(marker.style.opacity).toBe(expectedOpacity);
          });
        }),
        { numRuns: 200 },
      );
    });
  },
);

describe(
  'Feature: course-density-visualization, Property 17: Longest-finisher highlighting covers ties and the full playback',
  () => {
    it('highlights every tied longest finisher before, at, and after the finish boundary', () => {
      fc.assert(
        fc.property(markerInputsArbitrary, playbackPhaseArbitrary, (inputs, phase) => {
          const snapshot = snapshotAtLongestFinisherPhase(inputs, phase);
          const greatestFinishDurationSeconds = Math.max(
            ...inputs.map((input) => input.finishDurationSeconds),
          );

          buildMarkerDescriptors(snapshot).forEach((marker) => {
            if (marker.finishDurationSeconds === greatestFinishDurationSeconds) {
              expect(marker.style).toEqual({ opacity: 1, colour: 'bright-yellow' });
            }
          });
        }),
        { numRuns: 200 },
      );
    });
  },
);

describe(
  'Feature: course-density-visualization, Property 18: Longest-finisher highlighting takes precedence over finished translucency',
  () => {
    it('keeps finished longest participants bright yellow and opaque, including ties', () => {
      fc.assert(
        fc.property(markerInputsArbitrary, (inputs) => {
          const greatestFinishDurationSeconds = Math.max(
            ...inputs.map((input) => input.finishDurationSeconds),
          );
          const snapshot = snapshotFromMarkerInputs(
            inputs.map((input) => ({
              ...input,
              routeFraction: input.finishDurationSeconds === greatestFinishDurationSeconds
                ? 1
                : input.routeFraction,
            })),
            greatestFinishDurationSeconds + 1,
          );

          buildMarkerDescriptors(snapshot).forEach((marker) => {
            if (marker.finishDurationSeconds === greatestFinishDurationSeconds) {
              expect(marker.style).toEqual({ opacity: 1, colour: 'bright-yellow' });
            }
          });
        }),
        { numRuns: 200 },
      );
    });
  },
);

describe(
  'Feature: course-density-visualization, Property 19: Marker styling is a snapshot-only render transformation',
  () => {
    it('changes only marker style while preserving snapshot, density, popup fields, and safe names', () => {
      fc.assert(
        fc.property(markerInputsArbitrary, fc.integer({ min: 0, max: 7_200 }), (inputs, time) => {
          const snapshot = snapshotFromMarkerInputs(inputs, time);
          const snapshotBeforeDerivation = snapshot.positions.map((position) => ({
            ...position,
            coordinate: { ...position.coordinate },
          }));
          const center = { lat: REFERENCE_LATITUDE, lon: REFERENCE_LONGITUDE };
          const expectedDensity = aggregateDensity(snapshot.positions, 25, center);
          const model = buildVisualizationRenderModel(snapshot, {
            gridSizeMeters: 25,
            center,
          });

          expect(snapshot).toEqual({
            simulationTimeSeconds: time,
            positions: snapshotBeforeDerivation,
          });
          expect(model.simulationTimeSeconds).toBe(snapshot.simulationTimeSeconds);
          expect(model.density).toEqual(expectedDensity);
          expect(model.markers.map(({ id, displayName, finishDurationSeconds, routeFraction, coordinate }) => ({
            id,
            displayName,
            finishDurationSeconds,
            routeFraction,
            coordinate,
          }))).toEqual(snapshot.positions);
          expect(model.markers.map((marker) => marker.displayName)).toEqual(
            inputs.map((input) => input.displayName),
          );
          expect(model.markers.every((marker) => marker.simulationTimeSeconds === time)).toBe(true);
        }),
        { numRuns: 200 },
      );
    });
  },
);

describe(
  'Feature: course-density-visualization, Property 20: Finisher ranks are stable competition ranks',
  () => {
    it('keeps competition ranks unchanged when snapshot order and time change', () => {
      fc.assert(
        fc.property(simulationSnapshotArbitrary, (snapshot) => {
          const enabled = buildMarkerDescriptors(snapshot, true);
          const reorderedSnapshot: SimulationSnapshot = {
            simulationTimeSeconds: snapshot.simulationTimeSeconds + 1,
            positions: [...snapshot.positions].reverse(),
          };
          const reordered = buildMarkerDescriptors(reorderedSnapshot, true);
          const expectedRanks = new Map(
            snapshot.positions.map((position) => [
              position.id,
              1 + snapshot.positions.filter(
                (candidate) => candidate.finishDurationSeconds < position.finishDurationSeconds,
              ).length,
            ]),
          );

          expect(new Map(enabled.map((marker) => [marker.id, marker.finisherRank])))
            .toEqual(expectedRanks);
          expect(new Map(reordered.map((marker) => [marker.id, marker.finisherRank])))
            .toEqual(expectedRanks);
          expect(enabled.every((marker) => marker.icon.kind === 'finisher-number'))
            .toBe(true);
          expect(reordered.every((marker) => marker.icon.kind === 'finisher-number'))
            .toBe(true);

          const durationsWithUniqueRanks = new Set(
            snapshot.positions.map((position) => position.finishDurationSeconds),
          );
          if (durationsWithUniqueRanks.size === snapshot.positions.length) {
            expect(new Set(enabled.map((marker) => marker.finisherRank)).size)
              .toBe(enabled.length);
          }
        }),
        { numRuns: 200 },
      );
    });
  },
);

describe(
  'Feature: course-density-visualization, Property 21: Finisher-number presentation is isolated from simulation and marker state',
  () => {
    it('changes only icon presentation while preserving marker, density, and rank state', () => {
      fc.assert(
        fc.property(simulationSnapshotArbitrary, (snapshot) => {
          const options = { gridSizeMeters: 25, center: { lat: REFERENCE_LATITUDE, lon: REFERENCE_LONGITUDE } };
          const disabled = buildVisualizationRenderModel(snapshot, options);
          const enabled = buildVisualizationRenderModel(snapshot, {
            ...options,
            showFinisherNumbers: true,
          });

          expect(enabled.simulationTimeSeconds).toBe(disabled.simulationTimeSeconds);
          expect(enabled.density).toEqual(disabled.density);
          expect(enabled.markers.map((marker) => marker.id))
            .toEqual(disabled.markers.map((marker) => marker.id));
          expect(enabled.markers.map((marker) => marker.finisherRank))
            .toEqual(disabled.markers.map((marker) => marker.finisherRank));

          enabled.markers.forEach((marker, index) => {
            const defaultMarker = disabled.markers[index];
            expect(defaultMarker).toBeDefined();
            expect(marker.icon).toEqual({ kind: 'finisher-number', rank: marker.finisherRank });
            expect(defaultMarker?.icon).toEqual({ kind: 'default', rank: null });
            expect({
              id: marker.id,
              displayName: marker.displayName,
              finishDurationSeconds: marker.finishDurationSeconds,
              routeFraction: marker.routeFraction,
              coordinate: marker.coordinate,
              simulationTimeSeconds: marker.simulationTimeSeconds,
              style: marker.style,
            }).toEqual({
              id: defaultMarker?.id,
              displayName: defaultMarker?.displayName,
              finishDurationSeconds: defaultMarker?.finishDurationSeconds,
              routeFraction: defaultMarker?.routeFraction,
              coordinate: defaultMarker?.coordinate,
              simulationTimeSeconds: defaultMarker?.simulationTimeSeconds,
              style: defaultMarker?.style,
            });
          });

          const laterSnapshot: SimulationSnapshot = {
            simulationTimeSeconds: snapshot.simulationTimeSeconds + 1,
            positions: snapshot.positions.map((position) => ({
              ...position,
              routeFraction: Math.min(1, position.routeFraction + 0.1),
            })),
          };
          const laterEnabled = buildMarkerDescriptors(laterSnapshot, true);
          expect(new Map(laterEnabled.map((marker) => [marker.id, marker.finisherRank])))
            .toEqual(new Map(enabled.markers.map((marker) => [marker.id, marker.finisherRank])));
        }),
        { numRuns: 200 },
      );
    });
  },
);
