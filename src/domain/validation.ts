import {
  ApplicationState,
  Coordinate,
  CourseTrack,
  DensityCell,
  DensityCellColour,
  DensitySettings,
  DomainValidationResult,
  ParticipantPosition,
  ParticipantRecord,
  RouteBounds,
  SimulationSnapshot,
  TrackPoint,
  ValidationReason,
  ValidationSummary,
} from '../app/types';

const EMPTY_REASON_COUNTS: Partial<Record<ValidationReason, number>> = {};

export type ReplacementNoticeOptions = {
  readonly fileName: string;
  readonly acceptedType: string;
  readonly retainedInput: string;
};

function requireNoticePart(value: string, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export function emptyValidationSummary(): ValidationSummary {
  return createValidationSummary();
}

export function createValidationSummary(input: {
  notices?: readonly string[];
  excludedRows?: number;
  reasonCounts?: Partial<Record<ValidationReason, number>>;
} = {}): ValidationSummary {
  const excludedRows = input.excludedRows ?? 0;
  if (!Number.isInteger(excludedRows) || excludedRows < 0) {
    throw new RangeError('excludedRows must be a non-negative integer');
  }

  const notices = input.notices ?? [];
  for (const notice of notices) {
    requireNoticePart(notice, 'Validation notices');
  }

  const reasonCounts: Partial<Record<ValidationReason, number>> = {};
  for (const [reason, count] of Object.entries(input.reasonCounts ?? EMPTY_REASON_COUNTS)) {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(`Validation count for ${reason} must be a non-negative integer`);
    }
    if (count > 0) {
      reasonCounts[reason as ValidationReason] = count;
    }
  }

  return Object.freeze({
    notices: Object.freeze([...notices]),
    excludedRows,
    reasonCounts: Object.freeze(reasonCounts),
  });
}

export function addValidationNotice(
  summary: ValidationSummary,
  notice: string,
): ValidationSummary {
  if (typeof notice !== 'string' || notice.trim().length === 0) {
    throw new TypeError('Validation notices must be non-empty strings');
  }

  return createValidationSummary({
    notices: [...summary.notices, notice],
    excludedRows: summary.excludedRows,
    reasonCounts: summary.reasonCounts,
  });
}

export function formatRetainedInputNotice(
  retainedInput: string,
  reason?: string,
): string {
  const input = requireNoticePart(retainedInput, 'retainedInput');
  const detail = reason === undefined ? '' : `${requireNoticePart(reason, 'reason')} `;
  return `${detail}The previous ${input} was retained.`;
}

export function formatUnsupportedFileTypeNotice(
  options: ReplacementNoticeOptions,
): string {
  const fileName = requireNoticePart(options.fileName, 'fileName');
  const acceptedType = requireNoticePart(options.acceptedType, 'acceptedType');
  const retainedInput = requireNoticePart(options.retainedInput, 'retainedInput');
  return `Unable to load "${fileName}": unsupported file type. Accepted type: ${acceptedType}. ${formatRetainedInputNotice(retainedInput)}`;
}

export function formatFileReadFailureNotice(
  options: ReplacementNoticeOptions,
  detail?: string,
): string {
  const fileName = requireNoticePart(options.fileName, 'fileName');
  const acceptedType = requireNoticePart(options.acceptedType, 'acceptedType');
  const retainedInput = requireNoticePart(options.retainedInput, 'retainedInput');
  const reason = detail === undefined
    ? 'The file could not be read.'
    : requireNoticePart(detail, 'detail');
  const sentence = /[.!?]$/.test(reason) ? reason : `${reason}.`;
  return `Unable to load "${fileName}": ${sentence} Accepted type: ${acceptedType}. ${formatRetainedInputNotice(retainedInput)}`;
}

export function recordExcludedRow(
  summary: ValidationSummary,
  reason: ValidationReason,
  notice?: string,
): ValidationSummary {
  const reasonCounts = {
    ...summary.reasonCounts,
    [reason]: (summary.reasonCounts[reason] ?? 0) + 1,
  };

  return createValidationSummary({
    notices: notice === undefined ? summary.notices : [...summary.notices, notice],
    excludedRows: summary.excludedRows + 1,
    reasonCounts,
  });
}

export function recordValidationReason(
  summary: ValidationSummary,
  reason: ValidationReason,
  notice?: string,
): ValidationSummary {
  const reasonCounts = {
    ...summary.reasonCounts,
    [reason]: (summary.reasonCounts[reason] ?? 0) + 1,
  };

  return createValidationSummary({
    notices: notice === undefined ? summary.notices : [...summary.notices, notice],
    excludedRows: summary.excludedRows,
    reasonCounts,
  });
}

export function mergeValidationSummaries(
  ...summaries: readonly ValidationSummary[]
): ValidationSummary {
  const reasonCounts: Partial<Record<ValidationReason, number>> = {};
  const notices: string[] = [];
  let excludedRows = 0;

  for (const summary of summaries) {
    excludedRows += summary.excludedRows;
    notices.push(...summary.notices);
    for (const [reason, count] of Object.entries(summary.reasonCounts)) {
      const typedReason = reason as ValidationReason;
      reasonCounts[typedReason] = (reasonCounts[typedReason] ?? 0) + (count ?? 0);
    }
  }

  return createValidationSummary({ notices, excludedRows, reasonCounts });
}

const REASON_LABELS: Partial<Record<ValidationReason, { readonly one: string; readonly many: string }>> = {
  'malformed-gpx': { one: 'malformed GPX document', many: 'malformed GPX documents' },
  'insufficient-track-points': { one: 'insufficient track point', many: 'insufficient track points' },
  'invalid-track-point': { one: 'invalid track point', many: 'invalid track points' },
  'missing-name': { one: 'missing name', many: 'missing names' },
  'invalid-duration': { one: 'invalid time', many: 'invalid times' },
  'non-positive-duration': { one: 'non-positive time', many: 'non-positive times' },
  'unsupported-file-type': { one: 'unsupported file type', many: 'unsupported file types' },
  'file-read-failure': { one: 'file-read failure', many: 'file-read failures' },
  'no-valid-records': { one: 'no valid records', many: 'no valid records' },
  'empty-id': { one: 'empty ID', many: 'empty IDs' },
  'negative-time': { one: 'negative time', many: 'negative times' },
  'invalid-density-grid-size': { one: 'invalid density grid size', many: 'invalid density grid sizes' },
  'invalid-density-minimum': { one: 'invalid density minimum', many: 'invalid density minimums' },
  'invalid-density-warning-threshold': { one: 'invalid density warning threshold', many: 'invalid density warning thresholds' },
  'invalid-density-session-state': { one: 'invalid density session setting', many: 'invalid density session settings' },
};

function formatReasonCategory(reason: string, count: number): string {
  const labels = REASON_LABELS[reason as ValidationReason];
  if (labels === undefined) {
    return `${count} ${reason}`;
  }
  return `${count} ${count === 1 ? labels.one : labels.many}`;
}

export function formatValidationSummary(summary: ValidationSummary): string {
  const categories = Object.entries(summary.reasonCounts)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([reason, count]) => formatReasonCategory(reason, count ?? 0));

  const summaryText = summary.excludedRows > 0
    ? `${summary.excludedRows} row${summary.excludedRows === 1 ? '' : 's'} excluded${categories.length > 0 ? `: ${categories.join(', ')}` : ''}.`
    : categories.length > 0
      ? `Validation issues: ${categories.join(', ')}.`
      : '';
  const noticeText = summary.notices.join(' ');

  return [summaryText, noticeText].filter((part) => part.length > 0).join(' ').trim();
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isValidCoordinate(value: unknown): value is Coordinate {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const coordinate = value as Partial<Coordinate>;
  return (
    isFiniteNumber(coordinate.lat) &&
    isFiniteNumber(coordinate.lon) &&
    coordinate.lat >= -90 &&
    coordinate.lat <= 90 &&
    coordinate.lon >= -180 &&
    coordinate.lon <= 180
  );
}

export function createCoordinate(lat: number, lon: number): DomainValidationResult<Coordinate> {
  if (!isValidCoordinate({ lat, lon })) {
    return { ok: false, reason: 'invalid-track-point' };
  }
  return { ok: true, value: Object.freeze({ lat, lon }) };
}

export function isValidTrackPoint(value: unknown): value is TrackPoint {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const point = value as Partial<TrackPoint>;
  const cumulativeDistanceMeters = point.cumulativeDistanceMeters;
  return (
    isValidCoordinate(point) &&
    isFiniteNumber(cumulativeDistanceMeters) &&
    cumulativeDistanceMeters >= 0
  );
}

export function createTrackPoint(
  lat: number,
  lon: number,
  cumulativeDistanceMeters: number,
): DomainValidationResult<TrackPoint> {
  if (!isValidCoordinate({ lat, lon }) || !isFiniteNumber(cumulativeDistanceMeters) || cumulativeDistanceMeters < 0) {
    return { ok: false, reason: 'invalid-track-point' };
  }
  return { ok: true, value: Object.freeze({ lat, lon, cumulativeDistanceMeters }) };
}

export function isValidRouteBounds(value: unknown): value is RouteBounds {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const bounds = value as Partial<RouteBounds>;
  return (
    isFiniteNumber(bounds.minLat) &&
    isFiniteNumber(bounds.maxLat) &&
    isFiniteNumber(bounds.minLon) &&
    isFiniteNumber(bounds.maxLon) &&
    bounds.minLat >= -90 &&
    bounds.maxLat <= 90 &&
    bounds.minLat <= bounds.maxLat &&
    bounds.minLon >= -180 &&
    bounds.maxLon <= 180 &&
    bounds.minLon <= bounds.maxLon
  );
}

export function isValidCourseTrack(value: unknown): value is CourseTrack {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const course = value as Partial<CourseTrack>;
  if (
    !Array.isArray(course.points) ||
    course.points.length < 2 ||
    !isFiniteNumber(course.totalDistanceMeters) ||
    course.totalDistanceMeters < 0 ||
    !isValidRouteBounds(course.bounds) ||
    course.points[0]?.cumulativeDistanceMeters !== 0
  ) {
    return false;
  }

  let previousDistance = 0;
  for (const point of course.points) {
    if (!isValidTrackPoint(point) || point.cumulativeDistanceMeters < previousDistance) {
      return false;
    }
    previousDistance = point.cumulativeDistanceMeters;
  }
  return Math.abs(previousDistance - course.totalDistanceMeters) <= 1e-6;
}

export function createCourseTrack(
  points: readonly TrackPoint[],
  totalDistanceMeters: number,
  bounds: RouteBounds,
): DomainValidationResult<CourseTrack> {
  const course = { points, totalDistanceMeters, bounds };
  if (!isValidCourseTrack(course)) {
    return {
      ok: false,
      reason: points.length < 2 ? 'insufficient-track-points' : 'invalid-track-point',
    };
  }
  return {
    ok: true,
    value: Object.freeze({
      points: Object.freeze(points.map((point) => Object.freeze({ ...point }))),
      totalDistanceMeters,
      bounds: Object.freeze({ ...bounds }),
    }),
  };
}

export function isValidParticipantRecord(value: unknown): value is ParticipantRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Partial<ParticipantRecord>;
  return (
    typeof record.id === 'string' &&
    record.id.trim().length > 0 &&
    typeof record.displayName === 'string' &&
    record.displayName.trim().length > 0 &&
    isFiniteNumber(record.finishDurationSeconds) &&
    Number.isInteger(record.finishDurationSeconds) &&
    record.finishDurationSeconds > 0
  );
}

export function createParticipantRecord(
  id: string,
  displayName: string,
  finishDurationSeconds: number,
): DomainValidationResult<ParticipantRecord> {
  if (typeof id !== 'string' || id.trim().length === 0) {
    return { ok: false, reason: 'empty-id' };
  }
  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    return { ok: false, reason: 'missing-name' };
  }
  if (!isFiniteNumber(finishDurationSeconds) || !Number.isInteger(finishDurationSeconds)) {
    return { ok: false, reason: 'invalid-duration' };
  }
  if (finishDurationSeconds <= 0) {
    return { ok: false, reason: 'non-positive-duration' };
  }
  return {
    ok: true,
    value: Object.freeze({ id, displayName, finishDurationSeconds }),
  };
}

export function isValidParticipantPosition(value: unknown): value is ParticipantPosition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const position = value as Partial<ParticipantPosition>;
  const routeFraction = position.routeFraction;
  const coordinate = position.coordinate;
  return (
    isValidParticipantRecord(position) &&
    isFiniteNumber(routeFraction) &&
    routeFraction >= 0 &&
    routeFraction <= 1 &&
    isValidCoordinate(coordinate)
  );
}

export function createParticipantPosition(
  participant: ParticipantRecord,
  routeFraction: number,
  coordinate: Coordinate,
): DomainValidationResult<ParticipantPosition> {
  if (!isValidParticipantRecord(participant as unknown)) {
    const candidate = participant as Partial<ParticipantRecord>;
    return {
      ok: false,
      reason: typeof candidate.id !== 'string' || candidate.id.trim().length === 0
        ? 'empty-id'
        : 'invalid-duration',
    };
  }
  if (!isFiniteNumber(routeFraction) || routeFraction < 0 || routeFraction > 1) {
    return { ok: false, reason: 'invalid-track-point' };
  }
  if (!isValidCoordinate(coordinate)) {
    return { ok: false, reason: 'invalid-track-point' };
  }
  return {
    ok: true,
    value: Object.freeze({
      ...participant,
      routeFraction,
      coordinate: Object.freeze({ ...coordinate }),
    }),
  };
}

export function isValidSimulationSnapshot(value: unknown): value is SimulationSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const snapshot = value as Partial<SimulationSnapshot>;
  return (
    isFiniteNumber(snapshot.simulationTimeSeconds) &&
    snapshot.simulationTimeSeconds >= 0 &&
    Array.isArray(snapshot.positions) &&
    snapshot.positions.every(isValidParticipantPosition)
  );
}

export function createSimulationSnapshot(
  simulationTimeSeconds: number,
  positions: readonly ParticipantPosition[],
): DomainValidationResult<SimulationSnapshot> {
  if (!isFiniteNumber(simulationTimeSeconds) || simulationTimeSeconds < 0) {
    return { ok: false, reason: 'negative-time' };
  }
  if (!positions.every(isValidParticipantPosition)) {
    return { ok: false, reason: 'invalid-track-point' };
  }
  return {
    ok: true,
    value: Object.freeze({
      simulationTimeSeconds,
      positions: Object.freeze(positions.map((position) => Object.freeze({ ...position }))),
    }),
  };
}

export function isValidDensityCell(value: unknown): value is DensityCell {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const cell = value as Partial<DensityCell>;
  const cellX = cell.cellX;
  const cellY = cell.cellY;
  const count = cell.count;
  const colour = cell.colour;
  return (
    Number.isInteger(cellX) &&
    Number.isInteger(cellY) &&
    Number.isInteger(count) &&
    count !== undefined &&
    count > 0 &&
    (colour === 'density-low' ||
      colour === 'density-medium' ||
      colour === 'density-high' ||
      colour === 'warning') &&
    isValidCoordinate(cell.coordinate)
  );
}

export function createDensityCell(
  cellX: number,
  cellY: number,
  count: number,
  coordinate: Coordinate,
  colour: DensityCellColour = 'density-low',
): DomainValidationResult<DensityCell> {
  if (!Number.isInteger(cellX) || !Number.isInteger(cellY) || !Number.isInteger(count) || count <= 0) {
    return { ok: false, reason: 'invalid-track-point' };
  }
  if (!isValidCoordinate(coordinate)) {
    return { ok: false, reason: 'invalid-track-point' };
  }
  if (
    colour !== 'density-low' &&
    colour !== 'density-medium' &&
    colour !== 'density-high' &&
    colour !== 'warning'
  ) {
    return { ok: false, reason: 'invalid-track-point' };
  }
  return {
    ok: true,
    value: Object.freeze({
      cellX,
      cellY,
      count,
      coordinate: Object.freeze({ ...coordinate }),
      colour,
    }),
  };
}

export function isValidDensitySettings(value: unknown): value is DensitySettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const settings = value as Partial<DensitySettings>;
  const minimum = settings.minimumPeoplePerCircle;
  const warning = settings.warningColourThreshold;
  return (
    (settings.gridSizeMeters === 10 ||
      settings.gridSizeMeters === 25 ||
      settings.gridSizeMeters === 50 ||
      settings.gridSizeMeters === 100) &&
    typeof minimum === 'number' &&
    Number.isInteger(minimum) &&
    minimum >= 1 &&
    (warning === null ||
      (typeof warning === 'number' &&
        Number.isInteger(warning) &&
        typeof minimum === 'number' &&
        warning > minimum))
  );
}

export function isValidValidationSummary(value: unknown): value is ValidationSummary {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const summary = value as Partial<ValidationSummary>;
  const excludedRows = summary.excludedRows;
  if (
    !Array.isArray(summary.notices) ||
    !summary.notices.every((notice) => typeof notice === 'string' && notice.trim().length > 0) ||
    excludedRows === undefined ||
    !Number.isInteger(excludedRows) ||
    excludedRows < 0 ||
    typeof summary.reasonCounts !== 'object' ||
    summary.reasonCounts === null
  ) {
    return false;
  }
  return Object.values(summary.reasonCounts).every(
    (count) => Number.isInteger(count) && (count as number) >= 0,
  );
}

export function isValidApplicationState(value: unknown): value is ApplicationState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const state = value as Partial<ApplicationState>;
  return (
    (state.course === null || isValidCourseTrack(state.course)) &&
    Array.isArray(state.participants) &&
    state.participants.every(isValidParticipantRecord) &&
    isFiniteNumber(state.totalDurationSeconds) &&
    state.totalDurationSeconds >= 0 &&
    isFiniteNumber(state.simulationTimeSeconds) &&
    state.simulationTimeSeconds >= 0 &&
    state.simulationTimeSeconds <= state.totalDurationSeconds &&
    (state.playback === 'running' || state.playback === 'paused' || state.playback === 'complete') &&
    typeof state.layers === 'object' &&
    state.layers !== null &&
    typeof state.layers.markers === 'boolean' &&
    typeof state.layers.density === 'boolean' &&
    typeof state.showFinisherNumbers === 'boolean' &&
    isValidDensitySettings(state.densitySettings) &&
    isValidValidationSummary(state.validation) &&
    (state.snapshot === null || isValidSimulationSnapshot(state.snapshot))
  );
}

export function createApplicationState(
  state: unknown,
): DomainValidationResult<ApplicationState> {
  const candidate = typeof state === 'object' && state !== null
    ? state as Partial<ApplicationState>
    : {};
  // Keep pre-settings state fixtures and callers compatible while every
  // returned ApplicationState carries the validated settings model.
  const candidateWithDefaults = {
    ...candidate,
    showFinisherNumbers: candidate.showFinisherNumbers === undefined
      ? true
      : candidate.showFinisherNumbers,
    densitySettings: candidate.densitySettings === undefined
      ? { gridSizeMeters: 25 as const, minimumPeoplePerCircle: 1, warningColourThreshold: null }
      : candidate.densitySettings,
  };
  if (!isValidApplicationState(candidateWithDefaults)) {
    return {
      ok: false,
      reason: typeof candidate.simulationTimeSeconds === 'number' && candidate.simulationTimeSeconds < 0
        ? 'negative-time'
        : 'invalid-track-point',
    };
  }
  return {
    ok: true,
    value: Object.freeze({
      ...candidateWithDefaults,
      participants: Object.freeze([...candidateWithDefaults.participants]),
      layers: Object.freeze({ ...candidateWithDefaults.layers }),
      densitySettings: Object.freeze({ ...candidateWithDefaults.densitySettings }),
    }),
  };
}
