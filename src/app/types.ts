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

export type DensityCell = {
  readonly cellX: number;
  readonly cellY: number;
  readonly count: number;
  readonly coordinate: Coordinate;
};

export type MarkerDescriptor = ParticipantPosition & {
  readonly simulationTimeSeconds: number;
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
  | 'negative-time';

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
  readonly validation: ValidationSummary;
  readonly snapshot: SimulationSnapshot | null;
}
