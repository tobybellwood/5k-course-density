export type Coordinate = {
  readonly lat: number;
  readonly lon: number;
};

export type TrackPoint = Coordinate & {
  readonly cumulativeDistanceMeters: number;
};

export type RouteBounds = {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLon: number;
  readonly maxLon: number;
};

export type CourseTrack = {
  readonly points: readonly TrackPoint[];
  readonly totalDistanceMeters: number;
  readonly bounds: RouteBounds;
};

export type ParticipantRecord = {
  readonly id: string;
  readonly displayName: string;
  readonly finishDurationSeconds: number;
};

export type ParticipantPosition = ParticipantRecord & {
  readonly routeFraction: number;
  readonly coordinate: Coordinate;
};

export type SimulationSnapshot = {
  readonly simulationTimeSeconds: number;
  readonly positions: readonly ParticipantPosition[];
};

export type DensityGridSize = 10 | 25 | 50 | 100;

export type DensitySettings = {
  readonly gridSizeMeters: DensityGridSize;
  readonly minimumPeoplePerCircle: number;
  readonly warningColourThreshold: number | null;
};

export type DensitySettingsValidationReason =
  | 'invalid-density-grid-size'
  | 'invalid-density-minimum'
  | 'invalid-density-warning-threshold'
  | 'invalid-density-session-state';

export type DensitySettingsValidationSuccess = {
  readonly ok: true;
  readonly settings: DensitySettings;
};

export type DensitySettingsValidationFailure = {
  readonly ok: false;
  readonly settings: DensitySettings;
  readonly reason: DensitySettingsValidationReason;
  readonly notice: string;
  readonly validation: ValidationSummary;
};

export type DensitySettingsValidationResult =
  | DensitySettingsValidationSuccess
  | DensitySettingsValidationFailure;

export type DensityCellColour =
  | 'density-low'
  | 'density-medium'
  | 'density-high'
  | 'warning';

/** Compatibility alias for callers that use the US spelling. */
export type DensityCellColor = DensityCellColour;

export type DensityCell = {
  readonly cellX: number;
  readonly cellY: number;
  readonly count: number;
  readonly coordinate: Coordinate;
  readonly colour: DensityCellColour;
};

export type MarkerStyle = {
  readonly opacity: 1 | 0.35;
  readonly colour: 'default' | 'bright-yellow';
};

export type MarkerIcon = {
  readonly kind: 'default' | 'finisher-number';
  readonly rank: number | null;
};

export type MarkerDescriptor = ParticipantPosition & {
  readonly simulationTimeSeconds: number;
  readonly finisherRank: number;
  readonly icon: MarkerIcon;
  readonly style: MarkerStyle;
};

export type MarkerRenderModel = {
  readonly simulationTimeSeconds: number;
  readonly markers: readonly MarkerDescriptor[];
};

export type DensityRenderModel = {
  readonly simulationTimeSeconds: number;
  readonly gridSizeMeters: number;
  readonly cells: readonly DensityCell[];
};

export type VisualizationRenderModel = {
  readonly simulationTimeSeconds: number;
  readonly markers: readonly MarkerDescriptor[];
  readonly density: readonly DensityCell[];
  readonly densityGridSizeMeters: number;
};

export type PlaybackState = 'running' | 'paused' | 'complete';

export type ValidationReason =
  | 'malformed-gpx'
  | 'insufficient-track-points'
  | 'invalid-track-point'
  | 'missing-name'
  | 'invalid-duration'
  | 'non-positive-duration'
  | 'unsupported-file-type'
  | 'file-read-failure'
  | 'no-valid-records'
  | 'empty-id'
  | 'negative-time'
  | 'invalid-density-grid-size'
  | 'invalid-density-minimum'
  | 'invalid-density-warning-threshold'
  | 'invalid-density-session-state';

export type ValidationSummary = {
  readonly notices: readonly string[];
  readonly excludedRows: number;
  readonly reasonCounts: Partial<Record<ValidationReason, number>>;
};

export type ParseSuccess<T> = {
  readonly ok: true;
  readonly value: T;
  readonly validation: ValidationSummary;
};

export type ParseFailure = {
  readonly ok: false;
  readonly validation: ValidationSummary;
};

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

export type DurationParseSuccess = {
  readonly ok: true;
  readonly seconds: number;
};

export type DurationParseFailure = {
  readonly ok: false;
  readonly reason: Extract<ValidationReason, 'invalid-duration' | 'non-positive-duration'>;
};

export type DurationParseResult = DurationParseSuccess | DurationParseFailure;

export type DomainValidationSuccess<T> = {
  readonly ok: true;
  readonly value: T;
};

export type DomainValidationFailure = {
  readonly ok: false;
  readonly reason: ValidationReason;
};

export type DomainValidationResult<T> = DomainValidationSuccess<T> | DomainValidationFailure;

export interface ApplicationState {
  readonly course: CourseTrack | null;
  readonly participants: readonly ParticipantRecord[];
  readonly totalDurationSeconds: number;
  readonly simulationTimeSeconds: number;
  readonly playback: PlaybackState;
  readonly layers: {
    readonly markers: boolean;
    readonly density: boolean;
  };
  readonly showFinisherNumbers: boolean;
  readonly densitySettings: DensitySettings;
  readonly validation: ValidationSummary;
  readonly snapshot: SimulationSnapshot | null;
}
