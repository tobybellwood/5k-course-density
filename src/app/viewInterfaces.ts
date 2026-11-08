import type {
  ApplicationState,
  CourseTrack,
  DensitySettings,
  SimulationSnapshot,
} from './types';

export type PlaybackControlState = Readonly<{
  /** Whether the course and participant inputs required for playback exist. */
  available: boolean;
  /** Whether the start control should be disabled. */
  startDisabled: boolean;
  /** Whether the pause control should be disabled. */
  pauseDisabled: boolean;
  /** Whether the playback reset control should be disabled. */
  resetDisabled: boolean;
}>;

/**
 * The state rendered by a DOM-facing status view. Values are kept as numbers
 * so the view can choose its own duration formatting without duplicating app
 * state or playback rules.
 */
export type PlaybackStatusViewModel = Readonly<{
  simulationTimeSeconds: number;
  totalDurationSeconds: number;
  playback: ApplicationState['playback'];
  participantCount: number;
  excludedRowCount: number;
  densitySettings: DensitySettings;
  canPlay: boolean;
  controls: PlaybackControlState;
}>;

/** The map operations needed by AppController, implemented by LeafletMapView. */
export interface MapView {
  renderCourse?(course: CourseTrack): void;
  setCourse?(course: CourseTrack): void;
  renderSnapshot?(snapshot: SimulationSnapshot): void;
  renderSnapshotOrClear?(snapshot: SimulationSnapshot | null): void;
  setDensitySettings?(settings: DensitySettings): void;
  renderDensity?(snapshot: SimulationSnapshot, settings: DensitySettings): void;
  syncLayerVisibility?(visibility: ApplicationState['layers']): void;
}

/** The status operations needed by AppController, implemented by a DOM view. */
export interface StatusView {
  renderStatus(status: PlaybackStatusViewModel): void;
}

/** Compatibility aliases for callers that prefer the more explicit names. */
export type AppMapView = MapView;
export type AppStatusView = StatusView;
