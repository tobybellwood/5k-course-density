import 'leaflet/dist/leaflet.css';
import 'leaflet/dist/leaflet.css';
import * as L from 'leaflet';

import type {
  Coordinate,
  CourseTrack,
  MarkerDescriptor,
  SimulationSnapshot,
} from '../app/types';
import {
  buildVisualizationRenderModel,
  DEFAULT_DENSITY_GRID_SIZE_METERS,
} from './renderModels';

export type LeafletLayerName = 'markers' | 'density';

export type LeafletLayerVisibility = Readonly<Record<LeafletLayerName, boolean>>;

export type LeafletMapViewOptions = {
  /** Supply an existing Leaflet map when the host owns map creation. */
  readonly map?: L.Map;
  readonly mapOptions?: L.MapOptions;
  readonly densityGridSizeMeters?: number;
  /** Optional initial values copied from the application layer flags. */
  readonly layerVisibility?: Partial<LeafletLayerVisibility>;
  /** Optional tile source. The map remains usable without a network basemap. */
  readonly basemapUrl?: string;
  readonly basemapAttribution?: string;
};

export type LeafletMapViewLayerGroups = {
  readonly route: L.LayerGroup;
  readonly markers: L.LayerGroup;
  readonly density: L.LayerGroup;
  readonly basemap: L.LayerGroup;
};

const DEFAULT_MAP_OPTIONS: L.MapOptions = {
  zoomControl: true,
};

function coordinateToLatLng(coordinate: Coordinate): L.LatLngExpression {
  return [coordinate.lat, coordinate.lon];
}

function formatDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3_600);
  const minutes = Math.floor((wholeSeconds % 3_600) / 60);
  const remainingSeconds = wholeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function appendPopupRow(container: HTMLElement, label: string, value: string): void {
  const row = document.createElement('div');
  const labelElement = document.createElement('strong');
  labelElement.textContent = `${label}: `;
  row.append(labelElement, document.createTextNode(value));
  container.append(row);
}

/**
 * Build popup content with DOM text nodes rather than interpolated HTML.
 * Participant names therefore remain text even when they contain markup.
 */
export function createParticipantPopupContent(
  marker: MarkerDescriptor,
): HTMLElement {
  const content = document.createElement('div');
  appendPopupRow(content, 'Participant', marker.displayName);
  appendPopupRow(content, 'Finish time', formatDuration(marker.finishDurationSeconds));
  appendPopupRow(content, 'Simulation time', formatDuration(marker.simulationTimeSeconds));
  return content;
}

function densityStyle(count: number, maximumCount: number): L.PathOptions {
  const intensity = maximumCount <= 1 ? 1 : count / maximumCount;
  return {
    color: '#9b1c1c',
    fillColor: '#ef4444',
    fillOpacity: 0.2 + intensity * 0.55,
    opacity: 0.65 + intensity * 0.35,
    weight: 1,
  };
}

/**
 * Leaflet-only adapter for the immutable route and simulation render models.
 * Domain objects are never changed by this view; each snapshot replaces both
 * visual layers from the same render-model build.
 */
export class LeafletMapView {
  public readonly map: L.Map;
  public readonly routeLayerGroup: L.LayerGroup;
  public readonly markerLayerGroup: L.LayerGroup;
  public readonly densityLayerGroup: L.LayerGroup;
  public readonly basemapLayerGroup: L.LayerGroup;

  private readonly densityGridSizeMeters: number;
  private readonly layerVisibility: Record<LeafletLayerName, boolean> = {
    markers: true,
    density: true,
  };

  public constructor(
    container: string | HTMLElement,
    options: LeafletMapViewOptions = {},
  ) {
    this.map = options.map ?? L.map(container, {
      ...DEFAULT_MAP_OPTIONS,
      ...options.mapOptions,
    });
    this.densityGridSizeMeters = options.densityGridSizeMeters ?? DEFAULT_DENSITY_GRID_SIZE_METERS;

    this.routeLayerGroup = L.layerGroup().addTo(this.map);
    this.markerLayerGroup = L.layerGroup().addTo(this.map);
    this.densityLayerGroup = L.layerGroup().addTo(this.map);
    this.basemapLayerGroup = L.layerGroup().addTo(this.map);

    if (options.basemapUrl !== undefined) {
      L.tileLayer(options.basemapUrl, {
        attribution: options.basemapAttribution ?? '',
      }).addTo(this.basemapLayerGroup);
    }

    if (options.layerVisibility !== undefined) {
      this.syncLayerVisibility({
        markers: options.layerVisibility.markers ?? true,
        density: options.layerVisibility.density ?? true,
      });
    }
  }

  public get layerGroups(): LeafletMapViewLayerGroups {
    return {
      route: this.routeLayerGroup,
      markers: this.markerLayerGroup,
      density: this.densityLayerGroup,
      basemap: this.basemapLayerGroup,
    };
  }

  /** Replace the route and fit the viewport to its immutable bounds. */
  public renderCourse(course: CourseTrack): void {
    this.routeLayerGroup.clearLayers();

    const route = L.polyline(
      course.points.map(coordinateToLatLng),
      {
        color: '#2563eb',
        opacity: 0.95,
        weight: 4,
      },
    );
    this.routeLayerGroup.addLayer(route);

    const bounds = L.latLngBounds(
      [course.bounds.minLat, course.bounds.minLon],
      [course.bounds.maxLat, course.bounds.maxLon],
    );
    this.map.fitBounds(bounds);
  }

  /** Alias used by hosts that treat a course as the view's current input. */
  public setCourse(course: CourseTrack): void {
    this.renderCourse(course);
  }

  /**
   * Replace marker and density contents from one immutable snapshot.
   * Existing visibility choices are applied after rebuilding both groups.
   */
  public renderSnapshot(snapshot: SimulationSnapshot): void {
    const renderModel = buildVisualizationRenderModel(snapshot, {
      gridSizeMeters: this.densityGridSizeMeters,
    });

    this.markerLayerGroup.clearLayers();
    for (const markerDescriptor of renderModel.markers) {
      this.markerLayerGroup.addLayer(this.createMarker(markerDescriptor));
    }

    this.densityLayerGroup.clearLayers();
    const maximumCount = renderModel.density.reduce(
      (maximum, cell) => Math.max(maximum, cell.count),
      0,
    );
    for (const cell of renderModel.density) {
      this.densityLayerGroup.addLayer(
        L.circle(coordinateToLatLng(cell.coordinate), {
          ...densityStyle(cell.count, maximumCount),
          radius: renderModel.densityGridSizeMeters / 2,
        }),
      );
    }

    this.applyLayerVisibility('markers');
    this.applyLayerVisibility('density');
  }

  /** Render a snapshot, or clear both dynamic layers when no snapshot exists. */
  public renderSnapshotOrClear(snapshot: SimulationSnapshot | null): void {
    if (snapshot === null) {
      this.markerLayerGroup.clearLayers();
      this.densityLayerGroup.clearLayers();
      return;
    }
    this.renderSnapshot(snapshot);
  }

  public setLayerVisibility(layer: LeafletLayerName, visible: boolean): void {
    if (typeof visible !== 'boolean') {
      throw new TypeError('Layer visibility must be boolean');
    }
    this.layerVisibility[layer] = visible;
    this.applyLayerVisibility(layer);
  }

  /**
   * Apply the application layer flags without touching the current snapshot.
   * Keeping this as one view operation prevents a state listener from having
   * to know how Leaflet groups are attached to the map.
   */
  public syncLayerVisibility(visibility: LeafletLayerVisibility): void {
    this.setLayerVisibility('markers', visibility.markers);
    this.setLayerVisibility('density', visibility.density);
  }

  public toggleLayer(layer: LeafletLayerName): boolean {
    const visible = !this.layerVisibility[layer];
    this.setLayerVisibility(layer, visible);
    return visible;
  }

  public isLayerVisible(layer: LeafletLayerName): boolean {
    return this.layerVisibility[layer];
  }

  public remove(): void {
    this.map.remove();
  }

  private createMarker(markerDescriptor: MarkerDescriptor): L.Marker {
    const marker = L.marker(coordinateToLatLng(markerDescriptor.coordinate), {
      title: markerDescriptor.displayName,
    });
    marker.bindPopup(createParticipantPopupContent(markerDescriptor));
    return marker;
  }

  private applyLayerVisibility(layer: LeafletLayerName): void {
    const group = layer === 'markers' ? this.markerLayerGroup : this.densityLayerGroup;
    if (this.layerVisibility[layer]) {
      group.addTo(this.map);
    } else {
      this.map.removeLayer(group);
    }
  }
}

export { formatDuration as formatMapDuration };
