// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const leafletState = vi.hoisted(() => {
  class MockMap {
    public readonly layers = new Set<unknown>();
    public readonly fitBounds = vi.fn();
    public readonly remove = vi.fn();

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
    public map: MockMap | null = null;

    public addTo(map: MockMap): this {
      this.map = map;
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

  class MockTileLayer {
    public constructor(
      public readonly url: string,
      public readonly options: Record<string, unknown>,
    ) {}

    public addTo(group: MockLayerGroup): this {
      group.addLayer(this);
      return this;
    }
  }

  class MockDefaultIcon {
    public constructor(public readonly options: Record<string, unknown>) {}
  }

  const maps: MockMap[] = [];
  const layerGroups: MockLayerGroup[] = [];
  const polylines: unknown[] = [];
  const bounds: unknown[] = [];

  return {
    MockCircle,
    MockDefaultIcon,
    MockLayerGroup,
    MockMap,
    MockMarker,
    MockTileLayer,
    bounds,
    layerGroups,
    maps,
    polylines,
  };
});

vi.mock('leaflet', () => ({
  circle: vi.fn((coordinate: readonly [number, number], options: Record<string, unknown>) => {
    const circle = new leafletState.MockCircle(coordinate, options);
    return circle;
  }),
  Icon: {
    Default: leafletState.MockDefaultIcon,
  },
  latLngBounds: vi.fn((southWest: readonly [number, number], northEast: readonly [number, number]) => {
    const value = { northEast, southWest };
    leafletState.bounds.push(value);
    return value;
  }),
  layerGroup: vi.fn(() => {
    const group = new leafletState.MockLayerGroup();
    leafletState.layerGroups.push(group);
    return group;
  }),
  map: vi.fn(() => {
    const map = new leafletState.MockMap();
    leafletState.maps.push(map);
    return map;
  }),
  marker: vi.fn((coordinate: readonly [number, number], options: Record<string, unknown>) => {
    return new leafletState.MockMarker(coordinate, options);
  }),
  polyline: vi.fn((coordinates: readonly (readonly [number, number])[], options: Record<string, unknown>) => {
    const polyline = { coordinates, options };
    leafletState.polylines.push(polyline);
    return polyline;
  }),
  tileLayer: vi.fn((url: string, options: Record<string, unknown>) => {
    return new leafletState.MockTileLayer(url, options);
  }),
}));

import type {
  CourseTrack,
  MarkerDescriptor,
  ParticipantPosition,
  SimulationSnapshot,
} from '../app/types';
import { LeafletMapView, createParticipantPopupContent } from './LeafletMapView';

function createCourse(): CourseTrack {
  return {
    points: [
      { lat: 51.5, lon: -0.1, cumulativeDistanceMeters: 0 },
      { lat: 51.501, lon: -0.099, cumulativeDistanceMeters: 130 },
      { lat: 51.502, lon: -0.098, cumulativeDistanceMeters: 260 },
    ],
    totalDistanceMeters: 260,
    bounds: {
      minLat: 51.5,
      maxLat: 51.502,
      minLon: -0.1,
      maxLon: -0.098,
    },
  };
}

function createPosition(
  id: string,
  displayName: string,
  coordinate: { readonly lat: number; readonly lon: number },
  finishDurationSeconds: number,
): ParticipantPosition {
  return {
    id,
    displayName,
    finishDurationSeconds,
    routeFraction: 0.5,
    coordinate,
  };
}

function createSnapshot(): SimulationSnapshot {
  return {
    simulationTimeSeconds: 75,
    positions: [
      createPosition('runner-1', 'Ada Example', { lat: 51.5, lon: -0.1 }, 600),
      createPosition('runner-2', 'Ben Example', { lat: 51.501, lon: -0.099 }, 900),
    ],
  };
}

function mockMapForView(view: LeafletMapView): InstanceType<typeof leafletState.MockMap> {
  return view.map as unknown as InstanceType<typeof leafletState.MockMap>;
}

function mockLayerGroupForView(
  group: unknown,
): InstanceType<typeof leafletState.MockLayerGroup> {
  return group as InstanceType<typeof leafletState.MockLayerGroup>;
}

describe('LeafletMapView', () => {
  beforeEach(() => {
    leafletState.maps.length = 0;
    leafletState.layerGroups.length = 0;
    leafletState.polylines.length = 0;
    leafletState.bounds.length = 0;
  });

  it('renders the route and fits the map to the course bounds', () => {
    const view = new LeafletMapView('map', { map: new leafletState.MockMap() as never });
    const course = createCourse();

    view.renderCourse(course);

    expect(mockLayerGroupForView(view.routeLayerGroup).layers).toHaveLength(1);
    expect(leafletState.polylines).toEqual([
      {
        coordinates: [
          [51.5, -0.1],
          [51.501, -0.099],
          [51.502, -0.098],
        ],
        options: { color: '#2563eb', opacity: 0.95, weight: 4 },
      },
    ]);
    expect(mockMapForView(view).fitBounds).toHaveBeenCalledWith({
      southWest: [51.5, -0.1],
      northEast: [51.502, -0.098],
    });
  });

  it('shows marker and density layers together by default', () => {
    const view = new LeafletMapView('map', { map: new leafletState.MockMap() as never });

    view.renderSnapshot(createSnapshot());

    expect(view.isLayerVisible('markers')).toBe(true);
    expect(view.isLayerVisible('density')).toBe(true);
    expect(mockLayerGroupForView(view.markerLayerGroup).layers).toHaveLength(2);
    expect(mockLayerGroupForView(view.densityLayerGroup).layers).not.toHaveLength(0);
    expect(mockMapForView(view).layers.has(view.markerLayerGroup)).toBe(true);
    expect(mockMapForView(view).layers.has(view.densityLayerGroup)).toBe(true);
  });

  it('applies snapshot marker opacity and bright-yellow styling', () => {
    const view = new LeafletMapView('map', { map: new leafletState.MockMap() as never });

    view.renderSnapshot({
      simulationTimeSeconds: 900,
      positions: [
        {
          ...createPosition('runner-1', 'Ada Example', { lat: 51.5, lon: -0.1 }, 600),
          routeFraction: 1,
        },
        {
          ...createPosition('runner-2', 'Ben Example', { lat: 51.501, lon: -0.099 }, 900),
          routeFraction: 0.5,
        },
      ],
    });

    const markers = mockLayerGroupForView(view.markerLayerGroup).layers as Array<
      InstanceType<typeof leafletState.MockMarker>
    >;
    expect(markers[0].options.opacity).toBe(0.35);
    expect(markers[0].options.icon).toBeUndefined();
    expect(markers[1].options.opacity).toBe(1);
    expect(markers[1].options.icon).toBeInstanceOf(leafletState.MockDefaultIcon);
    expect(markers[1].options.icon).toEqual(
      expect.objectContaining({
        options: { className: 'course-density-marker--bright-yellow' },
      }),
    );
    expect(mockLayerGroupForView(view.densityLayerGroup).layers).not.toHaveLength(0);
  });

  it('uses the standard highlighted icon for tied longest finishers', () => {
    const view = new LeafletMapView('map', { map: new leafletState.MockMap() as never });

    view.renderSnapshot({
      simulationTimeSeconds: 300,
      positions: [
        createPosition('runner-1', 'Ada Example', { lat: 51.5, lon: -0.1 }, 900),
        createPosition('runner-2', 'Ben Example', { lat: 51.501, lon: -0.099 }, 900),
        createPosition('runner-3', 'Casey Example', { lat: 51.502, lon: -0.098 }, 600),
      ],
    });

    const markers = mockLayerGroupForView(view.markerLayerGroup).layers as Array<
      InstanceType<typeof leafletState.MockMarker>
    >;
    expect(markers[0].options.icon).toBeInstanceOf(leafletState.MockDefaultIcon);
    expect(markers[1].options.icon).toBeInstanceOf(leafletState.MockDefaultIcon);
    expect(markers[0].options.opacity).toBe(1);
    expect(markers[1].options.opacity).toBe(1);
    expect(markers[2].options.icon).toBeUndefined();
    expect(markers[2].options.opacity).toBe(1);
  });

  it('rerenders later snapshot styles while preserving snapshot state, density output, popups, and visibility', () => {
    const view = new LeafletMapView('map', {
      map: new leafletState.MockMap() as never,
      layerVisibility: { markers: false, density: true },
    });
    const initialSnapshot = createSnapshot();
    view.renderSnapshot(initialSnapshot);
    const initialDensity = [
      ...mockLayerGroupForView(view.densityLayerGroup).layers,
    ] as Array<InstanceType<typeof leafletState.MockCircle>>;
    expect(initialDensity).toHaveLength(2);

    const laterSnapshot: SimulationSnapshot = {
      simulationTimeSeconds: 600,
      positions: [
        {
          ...createPosition(
            'runner-1',
            '<img src=x onerror=alert(1)>',
            { lat: 51.502, lon: -0.098 },
            600,
          ),
          routeFraction: 1,
        },
        {
          ...createPosition(
            'runner-2',
            'Longest <b>Finisher</b>',
            { lat: 51.502, lon: -0.098 },
            900,
          ),
          routeFraction: 0.67,
        },
      ],
    };
    const laterSnapshotBeforeRender = JSON.stringify(laterSnapshot);

    view.renderSnapshot(laterSnapshot);

    const markers = mockLayerGroupForView(view.markerLayerGroup).layers as Array<
      InstanceType<typeof leafletState.MockMarker>
    >;
    const laterDensity = mockLayerGroupForView(view.densityLayerGroup).layers as Array<
      InstanceType<typeof leafletState.MockCircle>
    >;
    expect(JSON.stringify(laterSnapshot)).toBe(laterSnapshotBeforeRender);
    expect(markers.map((marker) => marker.coordinate)).toEqual([
      [51.502, -0.098],
      [51.502, -0.098],
    ]);
    expect(markers[0].options.opacity).toBe(0.35);
    expect(markers[0].options.icon).toBeUndefined();
    expect(markers[1].options.opacity).toBe(1);
    expect(markers[1].options.icon).toBeInstanceOf(leafletState.MockDefaultIcon);
    expect(markers[1].options.icon).toEqual(
      expect.objectContaining({
        options: { className: 'course-density-marker--bright-yellow' },
      }),
    );
    expect(laterDensity).toHaveLength(1);
    expect(laterDensity).not.toEqual(initialDensity);
    expect(markers[0].popup?.textContent).toBe(
      'Participant: <img src=x onerror=alert(1)>Finish time: 10:00Simulation time: 10:00',
    );
    expect(markers[0].popup?.querySelector('img')).toBeNull();
    expect(markers[0].popup?.innerHTML).toContain('&lt;img');
    expect(markers[1].popup?.textContent).toBe(
      'Participant: Longest <b>Finisher</b>Finish time: 15:00Simulation time: 10:00',
    );
    expect(markers[1].popup?.querySelector('b')).toBeNull();
    expect(view.isLayerVisible('markers')).toBe(false);
    expect(view.isLayerVisible('density')).toBe(true);
    expect(mockMapForView(view).layers.has(view.markerLayerGroup)).toBe(false);
    expect(mockMapForView(view).layers.has(view.densityLayerGroup)).toBe(true);
  });

  it('renders popup content with participant, finish, and simulation times', () => {
    const marker: MarkerDescriptor = {
      ...createPosition('runner-1', 'Ada Example', { lat: 51.5, lon: -0.1 }, 3_725),
      simulationTimeSeconds: 75,
      style: { opacity: 1, colour: 'default' },
    };

    const popup = createParticipantPopupContent(marker);

    expect(popup.textContent).toBe(
      'Participant: Ada ExampleFinish time: 1:02:05Simulation time: 1:15',
    );
  });

  it('renders participant names as text instead of interpreting markup', () => {
    const marker: MarkerDescriptor = {
      ...createPosition('runner-unsafe', '<img src=x onerror=alert(1)>', { lat: 51.5, lon: -0.1 }, 125),
      simulationTimeSeconds: 10,
      style: { opacity: 1, colour: 'default' },
    };

    const popup = createParticipantPopupContent(marker);

    expect(popup.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(popup.querySelector('img')).toBeNull();
    expect(popup.innerHTML).toContain('&lt;img');
  });

  it('keeps visibility flags after snapshot rerenders and preserves route and basemap groups', () => {
    const view = new LeafletMapView('map', {
      map: new leafletState.MockMap() as never,
      basemapUrl: 'https://tiles.example/{z}/{x}/{y}.png',
      layerVisibility: { markers: false, density: true },
    });

    view.renderCourse(createCourse());
    view.renderSnapshot(createSnapshot());
    expect(mockMapForView(view).layers.has(view.routeLayerGroup)).toBe(true);
    expect(mockMapForView(view).layers.has(view.basemapLayerGroup)).toBe(true);
    expect(mockMapForView(view).layers.has(view.markerLayerGroup)).toBe(false);
    expect(mockMapForView(view).layers.has(view.densityLayerGroup)).toBe(true);

    view.renderSnapshot(createSnapshot());
    expect(view.isLayerVisible('markers')).toBe(false);
    expect(view.isLayerVisible('density')).toBe(true);
    expect(mockMapForView(view).layers.has(view.routeLayerGroup)).toBe(true);
    expect(mockMapForView(view).layers.has(view.basemapLayerGroup)).toBe(true);
    expect(mockMapForView(view).layers.has(view.markerLayerGroup)).toBe(false);
    expect(mockMapForView(view).layers.has(view.densityLayerGroup)).toBe(true);

    view.syncLayerVisibility({ markers: true, density: false });
    expect(mockMapForView(view).layers.has(view.markerLayerGroup)).toBe(true);
    expect(mockMapForView(view).layers.has(view.densityLayerGroup)).toBe(false);
    expect(mockMapForView(view).layers.has(view.routeLayerGroup)).toBe(true);
    expect(mockMapForView(view).layers.has(view.basemapLayerGroup)).toBe(true);
  });

  it('toggles layer visibility without changing the rendered snapshot content', () => {
    const view = new LeafletMapView('map', { map: new leafletState.MockMap() as never });
    const snapshot = createSnapshot();
    view.renderSnapshot(snapshot);
    const markerLayers = [...mockLayerGroupForView(view.markerLayerGroup).layers];
    const densityLayers = [...mockLayerGroupForView(view.densityLayerGroup).layers];

    view.setLayerVisibility('markers', false);
    expect(view.isLayerVisible('markers')).toBe(false);
    expect(mockMapForView(view).layers.has(view.markerLayerGroup)).toBe(false);
    expect(mockLayerGroupForView(view.markerLayerGroup).layers).toEqual(markerLayers);
    expect(mockLayerGroupForView(view.densityLayerGroup).layers).toEqual(densityLayers);
    expect(view.isLayerVisible('density')).toBe(true);

    expect(view.toggleLayer('markers')).toBe(true);
    expect(mockMapForView(view).layers.has(view.markerLayerGroup)).toBe(true);
    expect(mockLayerGroupForView(view.markerLayerGroup).layers).toEqual(markerLayers);
    expect(mockLayerGroupForView(view.densityLayerGroup).layers).toEqual(densityLayers);

    expect(view.toggleLayer('density')).toBe(false);
    expect(mockMapForView(view).layers.has(view.densityLayerGroup)).toBe(false);
  });
});
