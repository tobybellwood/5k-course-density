import type {
  ApplicationState,
  CourseTrack,
  ParseResult,
  ParticipantRecord,
  PlaybackState,
  SimulationSnapshot,
  ValidationSummary,
} from './types';
import { calculateTotalDuration, simulate } from '../domain/simulation';
import {
  addValidationNotice,
  createApplicationState,
  formatRetainedInputNotice,
  isValidSimulationSnapshot,
  mergeValidationSummaries,
} from '../domain/validation';
import {
  restoreDensitySettings,
  saveDensitySettings,
  updateDensitySettings as validateDensitySettingsEdit,
} from '../domain/densitySettings';
import type {
  AppMapView,
  AppStatusView,
  PlaybackControlState,
  PlaybackStatusViewModel,
} from './viewInterfaces';

export type LayerName = 'markers' | 'density';

function sameDensitySettings(
  first: ApplicationState['densitySettings'],
  second: ApplicationState['densitySettings'],
): boolean {
  return first.gridSizeMeters === second.gridSizeMeters
    && first.minimumPeoplePerCircle === second.minimumPeoplePerCircle
    && first.warningColourThreshold === second.warningColourThreshold;
}

function validState(state: ApplicationState): ApplicationState {
  const result = createApplicationState(state);
  if (!result.ok) {
    throw new RangeError(`Invalid application state: ${result.reason}`);
  }
  return result.value;
}

export function createInitialApplicationState(): ApplicationState {
  const restoredDensity = restoreDensitySettings();
  return validState({
    course: null,
    participants: [],
    totalDurationSeconds: 0,
    simulationTimeSeconds: 0,
    playback: 'paused',
    layers: { markers: true, density: false },
    showFinisherNumbers: true,
    densitySettings: restoredDensity.settings,
    validation: restoredDensity.validation,
    snapshot: null,
  });
}

function retainedValidation(
  validation: ValidationSummary,
  inputName: 'course' | 'results',
): ValidationSummary {
  return addValidationNotice(validation, formatRetainedInputNotice(inputName));
}

function deriveAtStart(
  course: CourseTrack | null,
  participants: readonly ParticipantRecord[],
): Pick<ApplicationState, 'totalDurationSeconds' | 'simulationTimeSeconds' | 'playback' | 'snapshot'> {
  const totalDurationSeconds = calculateTotalDuration(participants);
  const snapshot = course !== null && participants.length > 0
    ? simulate(course, participants, 0)
    : null;

  return {
    totalDurationSeconds,
    simulationTimeSeconds: 0,
    playback: 'paused',
    snapshot,
  };
}

function replaceCourseResult(
  state: ApplicationState,
  result: ParseResult<CourseTrack>,
): ApplicationState {
  if (!result.ok) {
    return validState({
      ...state,
      validation: retainedValidation(result.validation, 'course'),
    });
  }

  return validState({
    ...state,
    course: result.value,
    validation: result.validation,
    ...deriveAtStart(result.value, state.participants),
  });
}

function replaceParticipantResult(
  state: ApplicationState,
  result: ParseResult<ParticipantRecord[]>,
): ApplicationState {
  if (!result.ok) {
    return validState({
      ...state,
      validation: retainedValidation(result.validation, 'results'),
    });
  }

  return validState({
    ...state,
    participants: result.value,
    validation: result.validation,
    ...deriveAtStart(state.course, result.value),
  });
}

/** Apply both bundled parse results as one logical initial/reset transition. */
export function applyInitialLoad(
  state: ApplicationState,
  courseResult: ParseResult<CourseTrack>,
  participantResult: ParseResult<ParticipantRecord[]>,
): ApplicationState {
  const course = courseResult.ok ? courseResult.value : state.course;
  const participants = participantResult.ok ? participantResult.value : state.participants;
  const courseValidation = courseResult.ok
    ? courseResult.validation
    : retainedValidation(courseResult.validation, 'course');
  const participantValidation = participantResult.ok
    ? participantResult.validation
    : retainedValidation(participantResult.validation, 'results');

  return validState({
    ...state,
    course,
    participants,
    validation: mergeValidationSummaries(courseValidation, participantValidation),
    ...deriveAtStart(course, participants),
  });
}

export const resetToExample = applyInitialLoad;

export function replaceCourse(
  state: ApplicationState,
  result: ParseResult<CourseTrack>,
): ApplicationState {
  return replaceCourseResult(state, result);
}

export function replaceParticipants(
  state: ApplicationState,
  result: ParseResult<ParticipantRecord[]>,
): ApplicationState {
  return replaceParticipantResult(state, result);
}

export function updateDensitySettings(
  state: ApplicationState,
  edit: Partial<ApplicationState['densitySettings']>,
): ApplicationState {
  const result = validateDensitySettingsEdit(state.densitySettings, edit);
  if (!result.ok) {
    return validState({
      ...state,
      validation: result.validation,
    });
  }

  const saved = saveDensitySettings(result.settings);
  return validState({
    ...state,
    densitySettings: result.settings,
    validation: saved.ok ? state.validation : saved.validation,
  });
}

export function updateValidation(
  state: ApplicationState,
  validation: ValidationSummary,
): ApplicationState {
  return validState({ ...state, validation });
}

export function setLayerVisibility(
  state: ApplicationState,
  layer: LayerName,
  visible: boolean,
): ApplicationState {
  if (typeof visible !== 'boolean') {
    throw new TypeError('Layer visibility must be boolean');
  }
  return validState({
    ...state,
    layers: { ...state.layers, [layer]: visible },
  });
}

export function toggleLayer(
  state: ApplicationState,
  layer: LayerName,
): ApplicationState {
  return setLayerVisibility(state, layer, !state.layers[layer]);
}

export function setShowFinisherNumbers(
  state: ApplicationState,
  visible: boolean,
): ApplicationState {
  if (typeof visible !== 'boolean') {
    throw new TypeError('Show finisher numbers must be boolean');
  }
  return validState({ ...state, showFinisherNumbers: visible });
}

export function updateSnapshot(
  state: ApplicationState,
  snapshot: SimulationSnapshot,
): ApplicationState {
  if (!isValidSimulationSnapshot(snapshot)) {
    throw new RangeError('Snapshot is invalid');
  }
  if (snapshot.simulationTimeSeconds > state.totalDurationSeconds) {
    throw new RangeError('Snapshot time exceeds total duration');
  }

  return validState({
    ...state,
    simulationTimeSeconds: snapshot.simulationTimeSeconds,
    snapshot,
  });
}

export type StateListener = (state: ApplicationState) => void;

export type AppControllerOptions = {
  readonly initialState?: ApplicationState;
  readonly onStateChange?: StateListener;
  /** Optional map adapter. LeafletMapView satisfies this interface. */
  readonly mapView?: AppMapView;
  /** Optional DOM-facing status adapter. */
  readonly statusView?: AppStatusView;
};

/**
 * Coordinates immutable application-state transitions and publishes each
 * transition to the map and status views. The view interfaces are structural
 * so this module remains independent of Leaflet and concrete DOM elements.
 */
export class AppController {
  private currentState: ApplicationState;
  private readonly listeners = new Set<StateListener>();
  private readonly mapView?: AppMapView;
  private readonly statusView?: AppStatusView;

  public constructor(options: AppControllerOptions | StateListener = {}) {
    if (typeof options === 'function') {
      this.currentState = createInitialApplicationState();
      this.listeners.add(options);
    } else {
      this.currentState = options.initialState === undefined
        ? createInitialApplicationState()
        : validState(options.initialState);
      this.mapView = options.mapView;
      this.statusView = options.statusView;
      if (options.onStateChange !== undefined) {
        this.listeners.add(options.onStateChange);
      }
    }

    this.renderTransition(null, this.currentState);
  }

  public get state(): ApplicationState {
    return this.currentState;
  }

  public getState(): ApplicationState {
    return this.currentState;
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(nextState: ApplicationState): ApplicationState {
    const previousState = this.currentState;
    this.currentState = nextState;
    this.renderTransition(previousState, nextState);
    for (const listener of this.listeners) {
      listener(nextState);
    }
    return nextState;
  }

  private renderTransition(
    previousState: ApplicationState | null,
    nextState: ApplicationState,
  ): void {
    if (this.mapView !== undefined) {
      const courseChanged = previousState === null || previousState.course !== nextState.course;
      const snapshotChanged = previousState === null || previousState.snapshot !== nextState.snapshot;
      const densitySettingsChanged = previousState === null
        || !sameDensitySettings(previousState.densitySettings, nextState.densitySettings);
      const layersChanged = previousState === null
        || previousState.layers.markers !== nextState.layers.markers
        || previousState.layers.density !== nextState.layers.density;
      const finisherNumbersChanged = previousState === null
        || previousState.showFinisherNumbers !== nextState.showFinisherNumbers;

      if (courseChanged && nextState.course !== null) {
        (this.mapView.renderCourse ?? this.mapView.setCourse)?.(nextState.course);
      }
      if (snapshotChanged) {
        if (this.mapView.renderSnapshotOrClear !== undefined) {
          this.mapView.renderSnapshotOrClear(nextState.snapshot, nextState.showFinisherNumbers);
        } else if (nextState.snapshot !== null) {
          this.mapView.renderSnapshot?.(nextState.snapshot, nextState.showFinisherNumbers);
        }
      } else {
        if (finisherNumbersChanged && nextState.snapshot !== null) {
          this.mapView.renderMarkerPresentation?.(
            nextState.snapshot,
            nextState.showFinisherNumbers,
          );
        }
        if (densitySettingsChanged) {
          if (nextState.snapshot !== null) {
            this.mapView.renderDensity?.(nextState.snapshot, nextState.densitySettings);
          } else {
            this.mapView.setDensitySettings?.(nextState.densitySettings);
          }
        }
      }
      if (layersChanged) {
        this.mapView.syncLayerVisibility?.(nextState.layers);
      }
    }

    this.statusView?.renderStatus(this.createStatusViewModel(nextState));
  }

  private createStatusViewModel(state: ApplicationState): PlaybackStatusViewModel {
    const canPlay = state.course !== null && state.participants.length > 0;
    const controls: PlaybackControlState = {
      available: canPlay,
      startDisabled: !canPlay || state.playback === 'running' || state.playback === 'complete',
      pauseDisabled: !canPlay || state.playback !== 'running',
      resetDisabled: !canPlay,
    };

    return {
      simulationTimeSeconds: state.simulationTimeSeconds,
      totalDurationSeconds: state.totalDurationSeconds,
      playback: state.playback,
      participantCount: state.participants.length,
      excludedRowCount: state.validation.excludedRows,
      densitySettings: state.densitySettings,
      canPlay,
      controls,
    };
  }

  public loadInitial(
    courseResult: ParseResult<CourseTrack>,
    participantResult: ParseResult<ParticipantRecord[]>,
  ): ApplicationState {
    return this.commit(applyInitialLoad(this.currentState, courseResult, participantResult));
  }

  public replaceCourse(result: ParseResult<CourseTrack>): ApplicationState {
    return this.commit(replaceCourse(this.currentState, result));
  }

  public replaceParticipants(result: ParseResult<ParticipantRecord[]>): ApplicationState {
    return this.commit(replaceParticipants(this.currentState, result));
  }

  public updateDensitySettings(
    edit: Partial<ApplicationState['densitySettings']>,
  ): ApplicationState {
    return this.commit(updateDensitySettings(this.currentState, edit));
  }

  public updateValidation(validation: ValidationSummary): ApplicationState {
    return this.commit(updateValidation(this.currentState, validation));
  }

  public setLayerVisibility(layer: LayerName, visible: boolean): ApplicationState {
    return this.commit(setLayerVisibility(this.currentState, layer, visible));
  }

  public setShowFinisherNumbers(visible: boolean): ApplicationState {
    return this.commit(setShowFinisherNumbers(this.currentState, visible));
  }

  public toggleLayer(layer: LayerName): ApplicationState {
    return this.commit(toggleLayer(this.currentState, layer));
  }

  public updateSnapshot(snapshot: SimulationSnapshot): ApplicationState {
    return this.commit(updateSnapshot(this.currentState, snapshot));
  }

  public resetToExample(
    courseResult: ParseResult<CourseTrack>,
    participantResult: ParseResult<ParticipantRecord[]>,
  ): ApplicationState {
    return this.loadInitial(courseResult, participantResult);
  }

  public canPlay(): boolean {
    return this.currentState.course !== null && this.currentState.participants.length > 0;
  }

  public setPlayback(playback: PlaybackState): ApplicationState {
    if (!this.canPlay() && playback === 'running') {
      throw new RangeError('Playback requires a valid course and participants');
    }
    return this.commit(validState({ ...this.currentState, playback }));
  }
}

export type {
  AppMapView,
  AppStatusView,
  MapView,
  PlaybackControlState,
  PlaybackStatusViewModel,
  StatusView,
} from './viewInterfaces';
