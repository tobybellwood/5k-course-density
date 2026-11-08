import { describe, expect, it } from 'vitest';

import type { DensitySettings, ParticipantPosition } from '../app/types';
import { aggregateDensity, buildVisualizationRenderModel } from './renderModels';

function position(id: string, lat: number, lon = 0): ParticipantPosition {
  return {
    id,
    displayName: id,
    finishDurationSeconds: 100,
    routeFraction: 0,
    coordinate: { lat, lon },
  };
}

describe('density aggregation settings', () => {
  const centre = { lat: 0, lon: 0 };
  const positions = [
    position('cell-0', 0),
    position('cell-1-a', 0.0001),
    position('cell-1-b', 0.0001),
    position('cell-2-a', 0.0002),
    position('cell-2-b', 0.0002),
    position('cell-2-c', 0.0002),
  ];

  it('quantizes with the selected grid, filters inclusively, and colours retained cells', () => {
    const settings: DensitySettings = {
      gridSizeMeters: 10,
      minimumPeoplePerCircle: 2,
      warningColourThreshold: 3,
    };

    const cells = aggregateDensity(positions, settings, centre);

    expect(cells.map(({ cellX, cellY, count, colour }) => ({
      cellX,
      cellY,
      count,
      colour,
    }))).toEqual([
      { cellX: 0, cellY: 1, count: 2, colour: 'density-medium' },
      { cellX: 0, cellY: 2, count: 3, colour: 'warning' },
    ]);
    expect(cells.reduce((total, cell) => total + cell.count, 0)).toBe(5);
  });

  it('uses retained counts for normal low, medium, and high bands', () => {
    const cells = aggregateDensity(
      positions,
      { gridSizeMeters: 10, minimumPeoplePerCircle: 1, warningColourThreshold: null },
      centre,
    );

    expect(cells.map(({ count, colour }) => ({ count, colour }))).toEqual([
      { count: 1, colour: 'density-low' },
      { count: 2, colour: 'density-medium' },
      { count: 3, colour: 'density-high' },
    ]);
  });

  it('passes validated settings through visualization models without changing markers', () => {
    const snapshot = { simulationTimeSeconds: 12, positions };
    const model = buildVisualizationRenderModel(snapshot, {
      densitySettings: {
        gridSizeMeters: 100,
        minimumPeoplePerCircle: 2,
        warningColourThreshold: null,
      },
      center: centre,
    });

    expect(model.densityGridSizeMeters).toBe(100);
    expect(model.density).toHaveLength(1);
    expect(model.density[0].count).toBe(6);
    expect(model.markers.map((marker) => marker.id)).toEqual(positions.map((item) => item.id));
  });
});
