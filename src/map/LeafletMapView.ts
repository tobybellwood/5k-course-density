import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import markerIcon2xUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';
import maplibreGL from '@maplibre/maplibre-gl-leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import * as L from 'leaflet';

export const OPENFREEMAP_LIBERTY_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const OPENFREEMAP_ATTRIBUTION = 'OpenFreeMap';
export const OPENSTREETMAP_ATTRIBUTION = '© OpenStreetMap contributors';

// Vite emits this worker with the configured base path. MapLibre must be configured
// before a basemap layer is created so worker requests remain valid on static hosts.
function configureMapLibreWorker(): void {
  setWorkerUrl(mapLibreWorkerUrl);
}

// Leaflet's default URLs are package-relative and resolve incorrectly on project pages.
// Vite-imported assets are emitted with the configured base path instead.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2xUrl,
  iconUrl: markerIconUrl,
  shadowUrl: markerShadowUrl,
});

import type {
  Coordinate,
  CourseTrack,
  DensityCell,
  DensityCellColour,
  DensitySettings,
  MarkerDescriptor,
  SimulationSnapshot,
} from '../app/types';
import {
  buildMarkerRenderModel,
  buildVisualizationRenderModel,
  DEFAULT_DENSITY_GRID_SIZE_METERS,
} from './renderModels';

export type LeafletLayerName = 'markers' | 'density';

export type LeafletLayerVisibility = Readonly<Record<LeafletLayerName, boolean>>;

export type LeafletMapViewOptions = {
  /** Supply an existing Leaflet map when the host owns map creation. */
  readonly map?: L.Map;
  readonly mapOptions?: L.MapOptions;
  /** Legacy grid-size override for hosts not yet passing full settings. */
  readonly densityGridSizeMeters?: number;
  /** Validated density settings used when rebuilding the density layer. */
  readonly densitySettings?: DensitySettings;
  /** Optional initial values copied from the application layer flags. */
  readonly layerVisibility?: Partial<LeafletLayerVisibility>;
  /** Optional tile source retained for callers that explicitly choose a raster basemap. */
  readonly basemapUrl?: string;
  readonly basemapAttribution?: string;
  /** Receives isolated Liberty/raster basemap failures without changing app state. */
  readonly onBasemapError?: (error: unknown) => void;
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

const DENSITY_COLOURS: Record<DensityCellColour, string> = {
  'density-low': '#93c5fd',
  'density-medium': '#fbbf24',
  'density-high': '#ef4444',
  warning: '#991b1b',
};

const BRIGHT_YELLOW_MARKER_CLASS = 'course-density-marker--bright-yellow';
const FINISHER_NUMBER_MARKER_CLASS = 'course-density-marker--number';

function defaultMarkerIconForStyle(style: MarkerDescriptor['style']): L.Icon | undefined {
  if (style.colour !== 'bright-yellow') {
    return undefined;
  }

  // Keep the standard Leaflet marker silhouette; the class only applies the highlight.
  // @types/leaflet gives Default an optional iconUrl, unlike the base Icon type.
  return new L.Icon.Default({ className: BRIGHT_YELLOW_MARKER_CLASS }) as unknown as L.Icon;
}

function numericMarkerIconForDescriptor(markerDescriptor: MarkerDescriptor): L.DivIcon {
  if (markerDescriptor.icon.rank === null) {
    throw new RangeError('A finisher-number marker requires a rank');
  }

  const number = document.createElement('span');
  number.textContent = String(markerDescriptor.icon.rank);
  const classNames = [FINISHER_NUMBER_MARKER_CLASS];
  if (markerDescriptor.style.colour === 'bright-yellow') {
    classNames.push(BRIGHT_YELLOW_MARKER_CLASS);
  }
  return L.divIcon({
    className: classNames.join(' '),
    // Leaflet accepts an HTMLElement here and appends it without parsing markup.
    html: number,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function markerIconForDescriptor(
  markerDescriptor: MarkerDescriptor,
  includeDefaultIcon = false,
): L.Icon | L.DivIcon | undefined {
  if (markerDescriptor.icon.kind === 'finisher-number') {
    return numericMarkerIconForDescriptor(markerDescriptor);
  }

  const defaultIcon = defaultMarkerIconForStyle(markerDescriptor.style);
  if (defaultIcon !== undefined) {
    return defaultIcon;
  }
  return includeDefaultIcon ? new L.Icon.Default() as unknown as L.Icon : undefined;
}

function densityStyle(
  colour: DensityCellColour,
  count: number,
  maximumCount: number,
): L.PathOptions {
  const intensity = maximumCount <= 1 ? 1 : count / maximumCount;
  const fillColour = DENSITY_COLOURS[colour];
  return {
    color: colour === 'warning' ? '#7f1d1d' : '#1d4ed8',
    fillColor: fillColour,
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

  private densitySettings: DensitySettings;
  private showFinisherNumbers = false;
  private basemapLayer: L.Layer | null = null;
  private basemapFailed = false;
  private readonly onBasemapError?: (error: unknown) => void;
  private readonly markersByParticipantId = new Map<string, L.Marker>();
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
    L.control.scale({
      position: 'bottomleft',
      metric: true,
      imperial: false,
    }).addTo(this.map);
    this.onBasemapError = options.onBasemapError;
    this.densitySettings = options.densitySettings ?? {
      gridSizeMeters: (options.densityGridSizeMeters ?? DEFAULT_DENSITY_GRID_SIZE_METERS) as DensitySettings['gridSizeMeters'],
      minimumPeoplePerCircle: 1,
      warningColourThreshold: null,
    };

    // Add the basemap first so the Leaflet pane/group order keeps every application
    // overlay above it. An explicit raster URL remains available for legacy hosts.
    this.basemapLayerGroup = L.layerGroup().addTo(this.map);
    this.initializeBasemap(options);
    this.routeLayerGroup = L.layerGroup().addTo(this.map);
    this.markerLayerGroup = L.layerGroup().addTo(this.map);
    this.densityLayerGroup = L.layerGroup().addTo(this.map);

    if (options.basemapUrl === undefined) {
      this.addAttribution(OPENFREEMAP_ATTRIBUTION);
      this.addAttribution(OPENSTREETMAP_ATTRIBUTION);
    }

    if (options.layerVisibility !== undefined) {
      this.syncLayerVisibility({
        markers: options.layerVisibility.markers ?? true,
        density: options.layerVisibility.density ?? true,
      });
    }
  }

  private initializeBasemap(options: LeafletMapViewOptions): void {
    try {
      if (options.basemapUrl !== undefined) {
        const rasterLayer = L.tileLayer(options.basemapUrl, {
          attribution: options.basemapAttribution ?? '',
        });
        this.basemapLayer = rasterLayer;
        this.basemapLayerGroup.addLayer(rasterLayer);
        return;
      }

      configureMapLibreWorker();
      const libertyLayer = maplibreGL({
        style: OPENFREEMAP_LIBERTY_STYLE_URL,
        attributionControl: false,
      });
      this.basemapLayer = libertyLayer;
      this.basemapLayerGroup.addLayer(libertyLayer);

      const maplibreMap = libertyLayer.getMaplibreMap();
      maplibreMap?.on('error', (event: unknown) => {
        this.disableBasemap(event);
      });
    } catch (error) {
      this.disableBasemap(error);
    }
  }

  private addAttribution(attribution: string): void {
    this.map.attributionControl?.addAttribution(attribution);
  }

  private disableBasemap(error: unknown): void {
    if (this.basemapFailed) {
      return;
    }
    this.basemapFailed = true;
    if (this.basemapLayer !== null) {
      this.basemapLayerGroup.removeLayer(this.basemapLayer);
      this.basemapLayer = null;
    }
    this.onBasemapError?.(error);
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
  public renderSnapshot(
    snapshot: SimulationSnapshot,
    showFinisherNumbers = this.showFinisherNumbers,
  ): void {
    this.showFinisherNumbers = showFinisherNumbers;
    const renderModel = buildVisualizationRenderModel(snapshot, {
      densitySettings: this.densitySettings,
      showFinisherNumbers,
    });

    this.markerLayerGroup.clearLayers();
    this.markersByParticipantId.clear();
    for (const markerDescriptor of renderModel.markers) {
      const marker = this.createMarker(markerDescriptor);
      this.markersByParticipantId.set(markerDescriptor.id, marker);
      this.markerLayerGroup.addLayer(marker);
    }

    this.renderDensityCells(renderModel.density, renderModel.densityGridSizeMeters);
    this.applyLayerVisibility('markers');
    this.applyLayerVisibility('density');
  }

  /** Replace only marker icons without rebuilding markers, popups, or density cells. */
  public renderMarkerPresentation(
    snapshot: SimulationSnapshot,
    showFinisherNumbers: boolean,
  ): void {
    this.showFinisherNumbers = showFinisherNumbers;
    const renderModel = buildMarkerRenderModel(snapshot, showFinisherNumbers);

    for (const markerDescriptor of renderModel.markers) {
      const marker = this.markersByParticipantId.get(markerDescriptor.id);
      if (marker === undefined) {
        throw new RangeError(`Missing rendered marker for participant ${markerDescriptor.id}`);
      }
      const icon = markerIconForDescriptor(markerDescriptor, true);
      if (icon === undefined) {
        throw new RangeError(`Could not create default icon for participant ${markerDescriptor.id}`);
      }
      marker.setIcon(icon);
    }
  }

  /** Update settings without rebuilding a layer, for an unavailable snapshot. */
  public setDensitySettings(settings: DensitySettings): void {
    this.densitySettings = settings;
  }

  /** Rebuild only the density layer for a new settings value and snapshot. */
  public renderDensity(snapshot: SimulationSnapshot, settings: DensitySettings): void {
    this.setDensitySettings(settings);
    const renderModel = buildVisualizationRenderModel(snapshot, {
      densitySettings: settings,
    });
    this.renderDensityCells(renderModel.density, renderModel.densityGridSizeMeters);
    this.applyLayerVisibility('density');
  }

  private renderDensityCells(
    cells: readonly DensityCell[],
    gridSizeMeters: number,
  ): void {
    this.densityLayerGroup.clearLayers();
    const maximumCount = cells.reduce(
      (maximum, cell) => Math.max(maximum, cell.count),
      0,
    );
    for (const cell of cells) {
      this.densityLayerGroup.addLayer(
        L.circle(coordinateToLatLng(cell.coordinate), {
          ...densityStyle(cell.colour, cell.count, maximumCount),
          radius: gridSizeMeters / 2,
        }),
      );
    }
  }

  /** Render a snapshot, or clear both dynamic layers when no snapshot exists. */
  public renderSnapshotOrClear(
    snapshot: SimulationSnapshot | null,
    showFinisherNumbers = this.showFinisherNumbers,
  ): void {
    this.showFinisherNumbers = showFinisherNumbers;
    if (snapshot === null) {
      this.markerLayerGroup.clearLayers();
      this.densityLayerGroup.clearLayers();
      this.markersByParticipantId.clear();
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
    const markerOptions: L.MarkerOptions = {
      title: markerDescriptor.displayName,
      opacity: markerDescriptor.style.opacity,
    };
    const icon = markerIconForDescriptor(markerDescriptor);
    if (icon !== undefined) {
      markerOptions.icon = icon;
    }

    const marker = L.marker(
      coordinateToLatLng(markerDescriptor.coordinate),
      markerOptions,
    );
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
