import type {
  ApplicationState,
  ValidationSummary,
} from './types';
import type { PlaybackStatusViewModel } from './viewInterfaces';
import { formatValidationSummary } from '../domain/validation';

export type DomViewHandlers = {
  readonly onCourseFileSelected?: (file: File) => void | Promise<void>;
  readonly onResultsFileSelected?: (file: File) => void | Promise<void>;
  readonly onStartPlayback?: () => void;
  readonly onPausePlayback?: () => void;
  readonly onResetPlayback?: () => void;
  readonly onResetExample?: () => void | Promise<void>;
  readonly onMarkersVisibilityChange?: (visible: boolean) => void;
  readonly onDensityVisibilityChange?: (visible: boolean) => void;
  /** Preferred aliases used by the application entrypoint. */
  readonly onMarkersVisibilityChanged?: (visible: boolean) => void;
  readonly onDensityVisibilityChanged?: (visible: boolean) => void;
};

export type DomViewOptions = {
  readonly root?: ParentNode;
  readonly handlers?: DomViewHandlers;
};

export type DomViewElements = {
  readonly courseFileInput: HTMLInputElement;
  readonly resultsFileInput: HTMLInputElement;
  readonly resetExampleButton: HTMLButtonElement;
  readonly startPlaybackButton: HTMLButtonElement;
  readonly pausePlaybackButton: HTMLButtonElement;
  readonly resetPlaybackButton: HTMLButtonElement;
  readonly markersLayerToggle: HTMLInputElement;
  readonly densityLayerToggle: HTMLInputElement;
  readonly status: HTMLElement;
  readonly simulationTime: HTMLElement;
  readonly totalDuration: HTMLElement;
  readonly playbackState: HTMLElement;
  readonly participantCount: HTMLElement;
  readonly excludedRowCount: HTMLElement;
  readonly validationNotice: HTMLElement;
};

type EventTargetWithListener = {
  addEventListener: (
    type: string,
    listener: EventListener,
  ) => void;
  removeEventListener: (
    type: string,
    listener: EventListener,
  ) => void;
};

const DEFAULT_PLAYBACK_STATE_LABELS: Record<ApplicationState['playback'], string> = {
  running: 'Running',
  paused: 'Paused',
  complete: 'Complete',
};

function requireElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector(selector);
  if (element === null) {
    throw new Error(`DOM view could not find required element: ${selector}`);
  }
  return element as T;
}

function collectElements(root: ParentNode): DomViewElements {
  return {
    courseFileInput: requireElement<HTMLInputElement>(root, '#course-file-input'),
    resultsFileInput: requireElement<HTMLInputElement>(root, '#results-file-input'),
    resetExampleButton: requireElement<HTMLButtonElement>(root, '#reset-example-button'),
    startPlaybackButton: requireElement<HTMLButtonElement>(root, '#start-playback-button'),
    pausePlaybackButton: requireElement<HTMLButtonElement>(root, '#pause-playback-button'),
    resetPlaybackButton: requireElement<HTMLButtonElement>(root, '#reset-playback-button'),
    markersLayerToggle: requireElement<HTMLInputElement>(root, '#markers-layer-toggle'),
    densityLayerToggle: requireElement<HTMLInputElement>(root, '#density-layer-toggle'),
    status: requireElement<HTMLElement>(root, '#status'),
    simulationTime: requireElement<HTMLElement>(root, '#simulation-time'),
    totalDuration: requireElement<HTMLElement>(root, '#total-duration'),
    playbackState: requireElement<HTMLElement>(root, '#playback-state'),
    participantCount: requireElement<HTMLElement>(root, '#participant-count'),
    excludedRowCount: requireElement<HTMLElement>(root, '#excluded-row-count'),
    validationNotice: requireElement<HTMLElement>(root, '#validation-notice'),
  };
}

function rootFromOptions(options: DomViewOptions): ParentNode {
  if (options.root !== undefined) {
    return options.root;
  }
  if (typeof document === 'undefined') {
    throw new Error('DOM view requires a document root outside a browser environment');
  }
  return document;
}

function isDomViewOptions(value: ParentNode | DomViewOptions): value is DomViewOptions {
  return 'root' in value || 'handlers' in value;
}

/** Formats non-negative simulation seconds as M:SS or H:MM:SS. */
export function formatSimulationDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(wholeSeconds / 3_600);
  const minutes = Math.floor((wholeSeconds % 3_600) / 60);
  const remainder = wholeSeconds % 60;
  const paddedSeconds = String(remainder).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

export const formatDuration = formatSimulationDuration;

/**
 * Binds the static page controls and renders application state using text-only DOM APIs.
 * Application behavior stays in the callbacks so this view can be wired by main.ts.
 */
export class DomView {
  public readonly elements: DomViewElements;
  private handlers: DomViewHandlers;
  private readonly listeners: Array<{
    readonly target: EventTargetWithListener;
    readonly type: string;
    readonly listener: EventListener;
  }> = [];
  private bound = false;

  public constructor(root: ParentNode, handlers: DomViewHandlers = {}) {
    this.elements = collectElements(root);
    this.handlers = handlers;
    this.ensureLiveRegions();
    this.bind();
  }

  public setHandlers(handlers: DomViewHandlers): void {
    this.handlers = handlers;
  }

  public bind(handlers?: DomViewHandlers): void {
    if (handlers !== undefined) {
      this.handlers = handlers;
    }
    if (this.bound) {
      return;
    }

    const {
      courseFileInput,
      resultsFileInput,
      resetExampleButton,
      startPlaybackButton,
      pausePlaybackButton,
      resetPlaybackButton,
      markersLayerToggle,
      densityLayerToggle,
    } = this.elements;

    this.listen(courseFileInput, 'change', () => {
      const file = courseFileInput.files?.[0];
      if (file !== undefined) {
        void this.handlers.onCourseFileSelected?.(file);
      }
    });
    this.listen(resultsFileInput, 'change', () => {
      const file = resultsFileInput.files?.[0];
      if (file !== undefined) {
        void this.handlers.onResultsFileSelected?.(file);
      }
    });
    this.listen(startPlaybackButton, 'click', () => this.handlers.onStartPlayback?.());
    this.listen(pausePlaybackButton, 'click', () => this.handlers.onPausePlayback?.());
    this.listen(resetPlaybackButton, 'click', () => this.handlers.onResetPlayback?.());
    this.listen(resetExampleButton, 'click', () => {
      void this.handlers.onResetExample?.();
    });
    this.listen(markersLayerToggle, 'change', () => {
      (this.handlers.onMarkersVisibilityChanged ?? this.handlers.onMarkersVisibilityChange)?.(markersLayerToggle.checked);
    });
    this.listen(densityLayerToggle, 'change', () => {
      (this.handlers.onDensityVisibilityChanged ?? this.handlers.onDensityVisibilityChange)?.(densityLayerToggle.checked);
    });
    this.bound = true;
  }

  public destroy(): void {
    for (const { target, type, listener } of this.listeners) {
      target.removeEventListener(type, listener);
    }
    this.listeners.length = 0;
    this.bound = false;
  }

  public render(state: ApplicationState): void {
    this.renderStatus(state);
    this.renderValidation(state.validation);
    this.elements.markersLayerToggle.checked = state.layers.markers;
    this.elements.densityLayerToggle.checked = state.layers.density;

    const hasRequiredInput = state.course !== null && state.participants.length > 0;
    this.elements.startPlaybackButton.disabled =
      !hasRequiredInput || state.playback !== 'paused';
    this.elements.pausePlaybackButton.disabled =
      !hasRequiredInput || state.playback !== 'running';
    this.elements.resetPlaybackButton.disabled = !hasRequiredInput;
  }

  /** Alias used by the browser application composition root. */
  public renderState(state: ApplicationState): void {
    this.render(state);
  }

  public renderStatus(state: ApplicationState): void;
  public renderStatus(status: PlaybackStatusViewModel): void;
  public renderStatus(stateOrStatus: ApplicationState | PlaybackStatusViewModel): void {
    const isStatusViewModel = 'controls' in stateOrStatus;
    const simulationTimeSeconds = stateOrStatus.simulationTimeSeconds;
    const totalDurationSeconds = stateOrStatus.totalDurationSeconds;
    const playback = stateOrStatus.playback;
    const participantCount = isStatusViewModel
      ? stateOrStatus.participantCount
      : stateOrStatus.participants.length;
    const excludedRowCount = isStatusViewModel
      ? stateOrStatus.excludedRowCount
      : stateOrStatus.validation.excludedRows;

    this.elements.simulationTime.textContent = formatSimulationDuration(simulationTimeSeconds);
    this.elements.totalDuration.textContent = formatSimulationDuration(totalDurationSeconds);
    this.elements.playbackState.textContent = DEFAULT_PLAYBACK_STATE_LABELS[playback];
    this.elements.participantCount.textContent = String(participantCount);
    this.elements.excludedRowCount.textContent = String(excludedRowCount);

    if (isStatusViewModel) {
      this.elements.startPlaybackButton.disabled = stateOrStatus.controls.startDisabled;
      this.elements.pausePlaybackButton.disabled = stateOrStatus.controls.pauseDisabled;
      this.elements.resetPlaybackButton.disabled = stateOrStatus.controls.resetDisabled;
    }
  }

  public renderValidation(validation: ValidationSummary): void {
    this.elements.validationNotice.textContent = formatValidationSummary(validation);
  }

  public renderNotice(notice: string): void {
    this.elements.validationNotice.textContent = notice;
  }

  /** Sets a short-lived view notice without interpolating it as HTML. */
  public setViewNotice(notice: string | null): void {
    this.elements.validationNotice.textContent = notice ?? '';
  }

  private ensureLiveRegions(): void {
    this.elements.status.setAttribute('aria-live', 'polite');
    this.elements.status.setAttribute('aria-atomic', 'true');
    this.elements.validationNotice.setAttribute('aria-live', 'polite');
    this.elements.validationNotice.setAttribute('aria-atomic', 'true');
    this.elements.validationNotice.setAttribute('role', 'status');
  }

  private listen(target: EventTargetWithListener, type: string, callback: () => void): void {
    const listener: EventListener = () => callback();
    target.addEventListener(type, listener);
    this.listeners.push({ target, type, listener });
  }
}

export function createDomView(
  root: ParentNode,
  handlers?: DomViewHandlers,
): DomView;
export function createDomView(options?: DomViewOptions): DomView;
export function createDomView(
  rootOrOptions: ParentNode | DomViewOptions = {},
  handlers: DomViewHandlers = {},
): DomView {
  const options = isDomViewOptions(rootOrOptions)
    ? rootOrOptions
    : { root: rootOrOptions, handlers };
  return new DomView(rootFromOptions(options), options.handlers ?? {});
}
