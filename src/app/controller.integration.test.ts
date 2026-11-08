// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const leafletState = vi.hoisted(() => {
  class MockMap {
    public readonly layers = new Set<unknown>();

    public addLayer(layer: unknown): this {
      this.layers.add(layer);
      return this;
    }

    public removeLayer(layer: unknown): this {
      this.layers.delete(layer);
      return this;
    }
  }

  class MockLayerGroup {
    public readonly layers: unknown[] = [];

    public addTo(map: MockMap): this {
      map.addLayer(this);
      return this;
    }

    public addLayer(layer: unknown): this {
      this.layers.push(layer);
      return this;
    }

    public clearLayers(): this {
      this.layers.length = 0;
      return this;
    }
  }

  class MockMarker {
    public popup: HTMLElement | null = null;

    public constructor(
      public readonly coordinate: readonly [number, number],
      public readonly options: Record<string, unknown>,
    ) {}

    public bindPopup(content: HTMLElement): this {
      this.popup = content;
      return this;
    }
  }

  class MockCircle {
    public constructor(
      public readonly coordinate: readonly [number, number],
      public readonly options: Record<string, unknown>,
    ) {}
  }

  return { MockCircle, MockLayerGroup, MockMap, MockMarker };
});

vi.mock('leaflet', () => ({
  circle: vi.fn((coordinate: readonly [number, number], options: Record<string, unknown>) => (
    new leafletState.MockCircle(coordinate, options)
  )),
  latLngBounds: vi.fn((southWest: readonly [number, number], northEast: readonly [number, number]) => ({
    northEast,
    southWest,
  })),
  layerGroup: vi.fn(() => new leafletState.MockLayerGroup()),
  map: vi.fn(() => new leafletState.MockMap()),
  marker: vi.fn((coordinate: readonly [number, number], options: Record<string, unknown>) => (
    new leafletState.MockMarker(coordinate, options)
  )),
  polyline: vi.fn(() => ({})),
  tileLayer: vi.fn(() => ({
    addTo: vi.fn(),
  })),
}));

import type {
  CourseTrack,
  ParticipantRecord,
  SimulationSnapshot,
} from './types';
import { AppController } from './state';
import { createParticipantRecord } from '../domain/validation';
import { createCourseTrackFromCoordinates } from '../domain/geometry';
import { simulate } from '../domain/simulation';
import { buildDensityCells } from '../map/renderModels';
import { LeafletMapView } from '../map/LeafletMapView';

function createCourse(): CourseTrack {
  const result = createCourseTrackFromCoordinates([
    { lat: 51.5, lon: -0.1 },
    { lat: 51.501, lon: -0.1 },
    { lat: 51.502, lon: -0.1 },
  ]);
  if (!result.ok) {
    throw new Error(`Could not create course fixture: ${result.reason}`);
  }
  return result.value;
}

function createParticipant(
  id: string,
  displayName: string,
  finishDurationSeconds: number,
): ParticipantRecord {
  const result = createParticipantRecord(id, displayName, finishDurationSeconds);
  if (!result.ok) {
    throw new Error(`Could not create participant fixture: ${result.reason}`);
  }
  return result.value;
}

function success<T>(value: T) {
  return {
    ok: true as const,
    value,
    validation: { notices: [], excludedRows: 0, reasonCounts: {} },
  };
}

function layerGroupLayers(group: unknown): readonly unknown[] {
  return (group as InstanceType<typeof leafletState.MockLayerGroup>).layers;
}

describe('AppController visualization integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders marker and density layers from one snapshot while keeping status synchronized', () => {
    const course = createCourse();
    const participants = [
      createParticipant('runner-1', 'Ada Example', 120),
      createParticipant('runner-2', 'Ben Example', 240),
    ];
    const map = new leafletState.MockMap();
    const mapView = new LeafletMapView('map', { map: map as never });
    const status = {
      simulationTimeSeconds: -1,
      totalDurationSeconds: -1,
      playback: 'unknown' as string,
      participantCount: -1,
    };

    const renderState = (state: ReturnType<AppController['getState']>): void => {
      mapView.renderSnapshotOrClear(state.snapshot);
      status.simulationTimeSeconds = state.simulationTimeSeconds;
      status.totalDurationSeconds = state.totalDurationSeconds;
      status.playback = state.playback;
      status.participantCount = state.participants.length;
    };
    const controller = new AppController({ onStateChange: renderState });
    controller.loadInitial(success(course), success(participants));

    const renderSnapshot = vi.spyOn(mapView, 'renderSnapshotOrClear');
    const nextSnapshot: SimulationSnapshot = simulate(course, participants, 60);
    controller.updateSnapshot(nextSnapshot);

    expect(renderSnapshot).toHaveBeenCalledTimes(1);
    expect(renderSnapshot).toHaveBeenCalledWith(nextSnapshot);
    expect(status).toEqual({
      simulationTimeSeconds: 60,
      totalDurationSeconds: 240,
      playback: 'paused',
      participantCount: 2,
    });

    const markerLayers = layerGroupLayers(mapView.markerLayerGroup) as readonly InstanceType<typeof leafletState.MockMarker>[];
    const densityLayers = layerGroupLayers(mapView.densityLayerGroup) as readonly InstanceType<typeof leafletState.MockCircle>[];
    expect(markerLayers).toHaveLength(nextSnapshot.positions.length);
    expect(markerLayers.map((marker) => marker.coordinate)).toEqual(
      nextSnapshot.positions.map((position) => [position.coordinate.lat, position.coordinate.lon]),
    );

    const expectedDensity = buildDensityCells(nextSnapshot, { gridSizeMeters: 25 });
    expect(densityLayers.map((circle) => circle.coordinate)).toEqual(
      expectedDensity.map((cell) => [cell.coordinate.lat, cell.coordinate.lon]),
    );
    expect(densityLayers.reduce((count, circle) => count + Number(circle.options.radius !== undefined), 0))
      .toBe(expectedDensity.length);
    expect(densityLayers).not.toHaveLength(0);
    expect(markerLayers[0]?.popup?.textContent).toContain('Simulation time: 1:00');
  });
});
