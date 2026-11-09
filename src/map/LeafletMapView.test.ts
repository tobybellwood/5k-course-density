// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const leafletState = vi.hoisted(() => {
  class MockMap {
    public readonly layers = new Set<unknown>();
    public readonly fitBounds = vi.fn();
    public readonly remove = vi.fn();
    public readonly attributionControl = {
      addAttribution: vi.fn(),
      removeAttribution: vi.fn(),
    };

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

    public removeLayer(layer: unknown): this {
      const index = this.layers.indexOf(layer);
      if (index >= 0) {
        this.layers.splice(index, 1);
      }
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

    public setIcon(icon: unknown): this {
      this.options.icon = icon;
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
    public static readonly mergeOptions = vi.fn();

    public constructor(public readonly options: Record<string, unknown>) {}
  }

  class MockDivIcon {
    public constructor(public readonly options: Record<string, unknown>) {}
  }

  const maps: MockMap[] = [];
  const layerGroups: MockLayerGroup[] = [];
  const polylines: unknown[] = [];
  const bounds: unknown[] = [];

  return {
    MockCircle,
    MockDefaultIcon,
    MockDivIcon,
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

const maplibreState = vi.hoisted(() => {
  class MockMapLibreMap {
    public readonly handlers = new Map<string, (event: unknown) => void>();

    public on(event: string, handler: (event: unknown) => void): this {
      this.handlers.set(event, handler);
      return this;
    }

    public emit(event: string, value: unknown): void {
      this.handlers.get(event)?.(value);
    }
  }

  class MockMapLibreLayer {
    public readonly map = new MockMapLibreMap();

    public constructor(public readonly options: Record<string, unknown>) {}

    public getMaplibreMap(): MockMapLibreMap {
      return this.map;
    }
  }

  return {
    MockMapLibreLayer,
    layers: [] as MockMapLibreLayer[],
    workerUrls: [] as string[],
  };
});

vi.mock('maplibre-gl', () => ({
  setWorkerUrl: vi.fn((url: string) => {
    maplibreState.workerUrls.push(url);
  }),
}));

vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({
  default: 'assets/maplibre-gl-worker.js',
}));

vi.mock('@maplibre/maplibre-gl-leaflet', () => ({
  default: vi.fn((options: Record<string, unknown>) => {
    const layer = new maplibreState.MockMapLibreLayer(options);
    maplibreState.layers.push(layer);
    return layer;
  }),
}));

vi.mock('leaflet', () => ({
  circle: vi.fn((coordinate: readonly [number, number], options: Record<string, unknown>) => {
    const circle = new leafletState.MockCircle(coordinate, options);
    return circle;
  }),
  divIcon: vi.fn((options: Record<string, unknown>) => (
    new leafletState.MockDivIcon(options)
  )),
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
import {
  LeafletMapView,
  OPENFREEMAP_ATTRIBUTION,
  OPENFREEMAP_LIBERTY_STYLE_URL,
  OPENSTREETMAP_ATTRIBUTION,
  createParticipantPopupContent,
} from './LeafletMapView';

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
    maplibreState.layers.length = 0;
    maplibreState.workerUrls.length = 0;
  });

  it('creates the default Liberty basemap below application overlays with attribution', () => {
    const view = new LeafletMapView('map', { map: new leafletState.MockMap() as never });
    const map = mockMapForView(view);

    expect(maplibreState.workerUrls).toEqual(['assets/maplibre-gl-worker.js']);
    expect(maplibreState.layers).toHaveLength(1);
    expect(maplibreState.layers[0].options).toEqual({
      style: OPENFREEMAP_LIBERTY_STYLE_URL,
      attributionControl: false,
    });
    expect(map.attributionControl.addAttribution).toHaveBeenCalledWith(OPENFREEMAP_ATTRIBUTION);
    expect(map.attributionControl.addAttribution).toHaveBeenCalledWith(OPENSTREETMAP_ATTRIBUTION);
    expect([...map.layers]).toEqual([
      view.basemapLayerGroup,
      view.routeLayerGroup,
      view.markerLayerGroup,
      view.densityLayerGroup,
    ]);
    expect(mockLayerGroupForView(view.basemapLayerGroup).layers).toEqual([maplibreState.layers[0]]);
  });

  it('removes only the basemap when the Liberty layer reports an error', () => {
    const notices: unknown[] = [];
    const view = new LeafletMapView('map', {
      map: new leafletState.MockMap() as never,
      onBasemapError: (error) => notices.push(error),
    });
    view.renderCourse(createCourse());
    view.renderSnapshot(createSnapshot());
    const map = mockMapForView(view);

    const error = new Error('style request failed');
    maplibreState.layers[0].map.emit('error', error);

    expect(notices).toEqual([error]);
    expect(mockLayerGroupForView(view.basemapLayerGroup).layers).toEqual([]);
    expect(map.layers.has(view.basemapLayerGroup)).toBe(true);
    expect(map.layers.has(view.routeLayerGroup)).toBe(true);
    expect(map.layers.has(view.markerLayerGroup)).toBe(true);
    expect(map.layers.has(view.densityLayerGroup)).toBe(true);
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

  it('renders safe numeric rank icons with ties and longest-finisher precedence', () => {
    const view = new LeafletMapView('map', { map: new leafletState.MockMap() as never });
    const unsafeName = '<img src=x onerror=alert(1)>';

    view.renderSnapshot({
      simulationTimeSeconds: 450,
      positions: [
        {
          ...createPosition('runner-1', unsafeName, { lat: 51.5, lon: -0.1 }, 600),
          routeFraction: 1,
        },
        createPosition('runner-2', 'Tie A', { lat: 51.501, lon: -0.099 }, 700),
        createPosition('runner-3', 'Tie B', { lat: 51.502, lon: -0.098 }, 700),
        {
          ...createPosition('runner-4', 'Longest', { lat: 51.502, lon: -0.098 }, 900),
          routeFraction: 1,
        },
      ],
    }, true);

    const markers = mockLayerGroupForView(view.markerLayerGroup).layers as Array<
      InstanceType<typeof leafletState.MockMarker>
    >;
    const icons = markers.map((marker) => marker.options.icon as InstanceType<typeof leafletState.MockDivIcon>);
    expect(icons.every((icon) => icon instanceof leafletState.MockDivIcon)).toBe(true);
    expect(icons.map((icon) => icon.options.className)).toEqual([
      'course-density-marker--number',
      'course-density-marker--number',
      'course-density-marker--number',
      'course-density-marker--number course-density-marker--bright-yellow',
    ]);
    expect(icons.map((icon) => (icon.options.html as HTMLElement).textContent)).toEqual(['1', '2', '2', '4']);
    expect(markers.map((marker) => marker.options.opacity)).toEqual([0.35, 1, 1, 1]);
    expect(markers[0].popup?.querySelector('img')).toBeNull();
    expect(markers[0].popup?.textContent).toContain(unsafeName);
  });

  it('changes only marker icons when toggling finisher-number presentation', () => {
    const view = new LeafletMapView('map', {
      map: new leafletState.MockMap() as never,
      layerVisibility: { markers: false, density: true },
    });
    const snapshot = createSnapshot();
    view.renderSnapshot(snapshot);
    const markers = mockLayerGroupForView(view.markerLayerGroup).layers as Array<
      InstanceType<typeof leafletState.MockMarker>
    >;
    const popups = markers.map((marker) => marker.popup);
    const density = [...mockLayerGroupForView(view.densityLayerGroup).layers];
    const coordinates = markers.map((marker) => marker.coordinate);
    const opacity = markers.map((marker) => marker.options.opacity);

    view.renderMarkerPresentation(snapshot, true);

    expect(mockLayerGroupForView(view.markerLayerGroup).layers).toEqual(markers);
    expect(mockLayerGroupForView(view.densityLayerGroup).layers).toEqual(density);
    expect(markers.map((marker) => marker.coordinate)).toEqual(coordinates);
    expect(markers.map((marker) => marker.options.opacity)).toEqual(opacity);
    expect(markers.map((marker) => marker.popup)).toEqual(popups);
    expect(markers.map((marker) => marker.options.icon).every(
      (icon) => icon instanceof leafletState.MockDivIcon,
    )).toBe(true);
    expect(mockMapForView(view).layers.has(view.markerLayerGroup)).toBe(false);
    expect(mockMapForView(view).layers.has(view.densityLayerGroup)).toBe(true);

    view.renderMarkerPresentation(snapshot, false);

    expect(markers.map((marker) => marker.options.icon).every(
      (icon) => icon instanceof leafletState.MockDefaultIcon,
    )).toBe(true);
    expect(markers[1].options.icon).toEqual(expect.objectContaining({
      options: { className: 'course-density-marker--bright-yellow' },
    }));
    expect(mockLayerGroupForView(view.densityLayerGroup).layers).toEqual(density);
    expect(markers.map((marker) => marker.popup)).toEqual(popups);
    expect(view.isLayerVisible('markers')).toBe(false);
    expect(view.isLayerVisible('density')).toBe(true);
  });

  it('preserves every non-icon field across mocked-map presentation toggles', () => {
    const unsafeName = '<img src=x onerror=alert(1)>';
    const snapshot: SimulationSnapshot = {
      simulationTimeSeconds: 750,
      positions: [
        {
          ...createPosition('runner-1', unsafeName, { lat: 51.5, lon: -0.1 }, 600),
          routeFraction: 1,
        },
        {
          ...createPosition('runner-2', 'Longest <b>Finisher</b>', { lat: 51.501, lon: -0.099 }, 900),
          routeFraction: 0.3,
        },
        createPosition('runner-3', 'Middle Runner', { lat: 51.502, lon: -0.098 }, 700),
      ],
    };
    const snapshotJson = JSON.stringify(snapshot);
    const snapshotPositions = snapshot.positions;
    const view = new LeafletMapView('map', {
      map: new leafletState.MockMap() as never,
      layerVisibility: { markers: false, density: true },
    });

    view.renderSnapshot(snapshot);

    const markerLayers = mockLayerGroupForView(view.markerLayerGroup).layers;
    const densityLayers = mockLayerGroupForView(view.densityLayerGroup).layers;
    const markers = markerLayers as Array<InstanceType<typeof leafletState.MockMarker>>;
    const markerCoordinates = markers.map((marker) => marker.coordinate);
    const markerOpacities = markers.map((marker) => marker.options.opacity);
    const markerPopups = markers.map((marker) => marker.popup);
    const markerPopupText = markers.map((marker) => marker.popup?.textContent);
    const markerLayerMapState = {
      markers: mockMapForView(view).layers.has(view.markerLayerGroup),
      density: mockMapForView(view).layers.has(view.densityLayerGroup),
    };

    expect(markers.map((marker) => marker.options.icon)).toEqual([
      undefined,
      expect.objectContaining({ options: { className: 'course-density-marker--bright-yellow' } }),
      undefined,
    ]);
    expect(markers[0].popup?.querySelector('img')).toBeNull();
    expect(markers[0].popup?.textContent).toContain(unsafeName);
    expect(markers[1].popup?.querySelector('b')).toBeNull();

    view.renderMarkerPresentation(snapshot, true);

    expect(JSON.stringify(snapshot)).toBe(snapshotJson);
    expect(snapshot.simulationTimeSeconds).toBe(750);
    expect(snapshot.positions).toBe(snapshotPositions);
    expect(mockLayerGroupForView(view.markerLayerGroup).layers).toBe(markerLayers);
    expect(mockLayerGroupForView(view.densityLayerGroup).layers).toBe(densityLayers);
    expect(markers.map((marker) => marker.coordinate)).toEqual(markerCoordinates);
    expect(markers.map((marker) => marker.options.opacity)).toEqual([0.35, 1, 1]);
    expect(markers.map((marker) => marker.options.opacity)).toEqual(markerOpacities);
    expect(markers.map((marker) => marker.popup)).toEqual(markerPopups);
    expect(markers.map((marker) => marker.popup?.textContent)).toEqual(markerPopupText);
    expect(markers.map((marker) => marker.options.icon)).toEqual([
      expect.objectContaining({
        options: expect.objectContaining({
          className: 'course-density-marker--number',
          html: expect.objectContaining({ textContent: '1' }),
        }),
      }),
      expect.objectContaining({
        options: expect.objectContaining({
          className: 'course-density-marker--number course-density-marker--bright-yellow',
          html: expect.objectContaining({ textContent: '3' }),
        }),
      }),
      expect.objectContaining({
        options: expect.objectContaining({
          className: 'course-density-marker--number',
          html: expect.objectContaining({ textContent: '2' }),
        }),
      }),
    ]);
    expect(markers[0].popup?.querySelector('img')).toBeNull();
    expect(markers[1].popup?.querySelector('b')).toBeNull();
    expect(view.isLayerVisible('markers')).toBe(false);
    expect(view.isLayerVisible('density')).toBe(true);
    expect({
      markers: mockMapForView(view).layers.has(view.markerLayerGroup),
      density: mockMapForView(view).layers.has(view.densityLayerGroup),
    }).toEqual(markerLayerMapState);

    view.renderMarkerPresentation(snapshot, false);

    expect(JSON.stringify(snapshot)).toBe(snapshotJson);
    expect(mockLayerGroupForView(view.markerLayerGroup).layers).toBe(markerLayers);
    expect(mockLayerGroupForView(view.densityLayerGroup).layers).toBe(densityLayers);
    expect(markers.map((marker) => marker.coordinate)).toEqual(markerCoordinates);
    expect(markers.map((marker) => marker.options.opacity)).toEqual(markerOpacities);
    expect(markers.map((marker) => marker.popup)).toEqual(markerPopups);
    expect(markers.map((marker) => marker.popup?.textContent)).toEqual(markerPopupText);
    expect(markers[0].options.icon).toBeInstanceOf(leafletState.MockDefaultIcon);
    expect(markers[1].options.icon).toEqual(expect.objectContaining({
      options: { className: 'course-density-marker--bright-yellow' },
    }));
    expect(markers[2].options.icon).toBeInstanceOf(leafletState.MockDefaultIcon);
    expect(markers.every((marker) => marker.popup?.querySelector('img') === null)).toBe(true);
    expect(markers.every((marker) => marker.popup?.querySelector('b') === null)).toBe(true);
    expect(view.isLayerVisible('markers')).toBe(false);
    expect(view.isLayerVisible('density')).toBe(true);
    expect({
      markers: mockMapForView(view).layers.has(view.markerLayerGroup),
      density: mockMapForView(view).layers.has(view.densityLayerGroup),
    }).toEqual(markerLayerMapState);
  });

  it('uses default icons when finisher numbers are disabled', () => {
    const view = new LeafletMapView('map', { map: new leafletState.MockMap() as never });

    view.renderSnapshot(createSnapshot(), false);

    const markers = mockLayerGroupForView(view.markerLayerGroup).layers as Array<
      InstanceType<typeof leafletState.MockMarker>
    >;
    expect(markers[0].options.icon).toBeUndefined();
    expect(markers[1].options.icon).toBeInstanceOf(leafletState.MockDefaultIcon);
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

  it('renders numeric finisher icons through marker-only presentation updates', () => {
    const view = new LeafletMapView('map', { map: new leafletState.MockMap() as never });
    const snapshot = createSnapshot();
    view.renderSnapshot(snapshot);
    const initialDensity = [...mockLayerGroupForView(view.densityLayerGroup).layers];
    const initialCoordinates = (mockLayerGroupForView(view.markerLayerGroup).layers as Array<InstanceType<typeof leafletState.MockMarker>>)
      .map((marker) => marker.coordinate);

    view.renderMarkerPresentation(snapshot, true);

    const markers = mockLayerGroupForView(view.markerLayerGroup).layers as Array<InstanceType<typeof leafletState.MockMarker>>;
    expect(markers.map((marker) => marker.coordinate)).toEqual(initialCoordinates);
    expect(mockLayerGroupForView(view.densityLayerGroup).layers).toEqual(initialDensity);
    expect(markers[0].options.icon).toBeInstanceOf(leafletState.MockDivIcon);
    expect(markers[0].options.icon).toEqual(expect.objectContaining({
      options: expect.objectContaining({
        className: 'course-density-marker--number',
        html: expect.objectContaining({ textContent: '1' }),
      }),
    }));
    expect(markers[1].options.icon).toEqual(expect.objectContaining({
      options: expect.objectContaining({
        className: 'course-density-marker--number course-density-marker--bright-yellow',
        html: expect.objectContaining({ textContent: '2' }),
      }),
    }));
    expect(markers[0].options.opacity).toBe(1);
    expect(markers[1].options.opacity).toBe(1);
    expect(markers[0].popup?.textContent).toContain('Ada Example');
    expect(markers[1].popup?.textContent).toContain('Ben Example');

    view.renderMarkerPresentation(snapshot, false);
    const defaultMarkers = mockLayerGroupForView(view.markerLayerGroup).layers as Array<InstanceType<typeof leafletState.MockMarker>>;
    expect(defaultMarkers[0].options.icon).toBeInstanceOf(leafletState.MockDefaultIcon);
    expect(defaultMarkers[1].options.icon).toBeInstanceOf(leafletState.MockDefaultIcon);
  });

  it('renders popup content with participant, finish, and simulation times', () => {
    const marker: MarkerDescriptor = {
      ...createPosition('runner-1', 'Ada Example', { lat: 51.5, lon: -0.1 }, 3_725),
      simulationTimeSeconds: 75,
      finisherRank: 1,
      icon: { kind: 'default', rank: null },
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
      finisherRank: 1,
      icon: { kind: 'default', rank: null },
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
