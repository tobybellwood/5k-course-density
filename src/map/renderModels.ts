import {
  Coordinate,
  DensityCell,
  DensityRenderModel,
  MarkerDescriptor,
  MarkerRenderModel,
  ParticipantPosition,
  SimulationSnapshot,
  VisualizationRenderModel,
} from '../app/types';
import { EARTH_RADIUS_METERS } from '../domain/geometry';
import {
  createDensityCell,
  isValidCoordinate,
  isValidSimulationSnapshot,
} from '../domain/validation';

export const DEFAULT_DENSITY_GRID_SIZE_METERS = 25;

const DEGREES_PER_RADIAN = 180 / Math.PI;
const RADIANS_PER_DEGREE = Math.PI / 180;

export type DensityRenderOptions = {
  readonly gridSizeMeters?: number;
  /**
   * Center of the local meter projection. When omitted, the current
   * participant positions' arithmetic mean is used as a stable fallback.
   */
  readonly center?: Coordinate;
};

function assertValidSnapshot(snapshot: SimulationSnapshot): void {
  if (!isValidSimulationSnapshot(snapshot)) {
    throw new TypeError('A valid simulation snapshot is required');
  }
}

function resolveGridSize(gridSizeMeters: number | undefined): number {
  const gridSize = gridSizeMeters ?? DEFAULT_DENSITY_GRID_SIZE_METERS;
  if (!Number.isFinite(gridSize) || gridSize <= 0) {
    throw new RangeError('Density grid size must be a positive finite number');
  }
  return gridSize;
}

function resolveCenter(
  positions: readonly ParticipantPosition[],
  center: Coordinate | undefined,
): Coordinate {
  if (center !== undefined) {
    if (!isValidCoordinate(center)) {
      throw new RangeError('Density projection center must be a valid coordinate');
    }
    return { lat: center.lat, lon: center.lon };
  }

  if (positions.length === 0) {
    return { lat: 0, lon: 0 };
  }

  return {
    lat: positions.reduce((sum, position) => sum + position.coordinate.lat, 0) / positions.length,
    lon: positions.reduce((sum, position) => sum + position.coordinate.lon, 0) / positions.length,
  };
}

function projectCoordinate(
  coordinate: Coordinate,
  center: Coordinate,
): { readonly x: number; readonly y: number } {
  const centerLatitudeRadians = center.lat * RADIANS_PER_DEGREE;
  return {
    x:
      EARTH_RADIUS_METERS *
      ((coordinate.lon - center.lon) * RADIANS_PER_DEGREE) *
      Math.cos(centerLatitudeRadians),
    y: EARTH_RADIUS_METERS * ((coordinate.lat - center.lat) * RADIANS_PER_DEGREE),
  };
}

function unprojectCellCenter(
  cellX: number,
  cellY: number,
  gridSizeMeters: number,
  center: Coordinate,
): Coordinate {
  const centerLatitudeRadians = center.lat * RADIANS_PER_DEGREE;
  const latitude =
    center.lat + ((cellY + 0.5) * gridSizeMeters / EARTH_RADIUS_METERS) * DEGREES_PER_RADIAN;
  const longitudeScale = Math.cos(centerLatitudeRadians);
  const longitude = longitudeScale === 0
    ? center.lon
    : center.lon +
      (((cellX + 0.5) * gridSizeMeters) / (EARTH_RADIUS_METERS * longitudeScale)) *
        DEGREES_PER_RADIAN;

  return {
    lat: Math.max(-90, Math.min(90, latitude)),
    lon: Math.max(-180, Math.min(180, longitude)),
  };
}

/**
 * Aggregate current participant positions into deterministic meter-grid cells.
 * The input array is read only and no participant position is mutated.
 */
export function aggregateDensity(
  positions: readonly ParticipantPosition[],
  gridSizeMeters = DEFAULT_DENSITY_GRID_SIZE_METERS,
  center?: Coordinate,
): readonly DensityCell[] {
  const gridSize = resolveGridSize(gridSizeMeters);
  if (!positions.every((position) => isValidCoordinate(position.coordinate))) {
    throw new TypeError('Density aggregation requires valid participant coordinates');
  }

  const projectionCenter = resolveCenter(positions, center);
  const counts = new Map<string, { readonly cellX: number; readonly cellY: number; count: number }>();

  for (const position of positions) {
    const projected = projectCoordinate(position.coordinate, projectionCenter);
    const cellX = Math.floor(projected.x / gridSize);
    const cellY = Math.floor(projected.y / gridSize);
    const key = `${cellX}:${cellY}`;
    const existing = counts.get(key);
    if (existing === undefined) {
      counts.set(key, { cellX, cellY, count: 1 });
    } else {
      existing.count += 1;
    }
  }

  const cells = [...counts.values()]
    .sort((first, second) => first.cellY - second.cellY || first.cellX - second.cellX)
    .map(({ cellX, cellY, count }) => {
      const result = createDensityCell(
        cellX,
        cellY,
        count,
        unprojectCellCenter(cellX, cellY, gridSize, projectionCenter),
      );
      if (!result.ok) {
        throw new RangeError('Density aggregation produced an invalid cell');
      }
      return result.value;
    });

  return Object.freeze(cells);
}

/**
 * Build one identifiable marker descriptor for every position in a snapshot.
 */
export function buildMarkerDescriptors(
  snapshot: SimulationSnapshot,
): readonly MarkerDescriptor[] {
  assertValidSnapshot(snapshot);

  return Object.freeze(
    snapshot.positions.map((position) =>
      Object.freeze({
        ...position,
        coordinate: Object.freeze({ ...position.coordinate }),
        simulationTimeSeconds: snapshot.simulationTimeSeconds,
      }),
    ),
  );
}

export function buildMarkerRenderModel(
  snapshot: SimulationSnapshot,
): MarkerRenderModel {
  assertValidSnapshot(snapshot);
  return Object.freeze({
    simulationTimeSeconds: snapshot.simulationTimeSeconds,
    markers: buildMarkerDescriptors(snapshot),
  });
}

export function buildDensityCells(
  snapshot: SimulationSnapshot,
  options: DensityRenderOptions = {},
): readonly DensityCell[] {
  assertValidSnapshot(snapshot);
  const gridSizeMeters = resolveGridSize(options.gridSizeMeters);
  return aggregateDensity(snapshot.positions, gridSizeMeters, options.center);
}

export function buildDensityRenderModel(
  snapshot: SimulationSnapshot,
  options: DensityRenderOptions = {},
): DensityRenderModel {
  assertValidSnapshot(snapshot);
  const gridSizeMeters = resolveGridSize(options.gridSizeMeters);
  return Object.freeze({
    simulationTimeSeconds: snapshot.simulationTimeSeconds,
    gridSizeMeters,
    cells: aggregateDensity(snapshot.positions, gridSizeMeters, options.center),
  });
}

/**
 * Build both visual layers from the exact same snapshot in one operation.
 */
export function buildVisualizationRenderModel(
  snapshot: SimulationSnapshot,
  options: DensityRenderOptions = {},
): VisualizationRenderModel {
  assertValidSnapshot(snapshot);
  const gridSizeMeters = resolveGridSize(options.gridSizeMeters);
  const markers = buildMarkerDescriptors(snapshot);
  const density = aggregateDensity(snapshot.positions, gridSizeMeters, options.center);

  return Object.freeze({
    simulationTimeSeconds: snapshot.simulationTimeSeconds,
    markers,
    density,
    densityGridSizeMeters: gridSizeMeters,
  });
}
