import type {
  ApplicationState,
  PlaybackState,
  SimulationSnapshot,
} from '../app/types';
import { simulate } from '../domain/simulation';

export type AnimationFrameCallback = (timestamp: number) => void;
export type RequestAnimationFrame = (callback: AnimationFrameCallback) => number;
export type CancelAnimationFrame = (handle: number) => void;

/** The application-state operations needed by playback, kept independent of the DOM. */
export interface PlaybackStateHost {
  readonly state?: ApplicationState;
  getState?: () => ApplicationState;
  canPlay?: () => boolean;
  updateSnapshot?: (snapshot: SimulationSnapshot) => ApplicationState | void;
  setPlayback?: (playback: PlaybackState) => ApplicationState | void;
}

export interface PlaybackControllerOptions {
  readonly appController?: PlaybackStateHost;
  readonly controller?: PlaybackStateHost;
  readonly getState?: () => ApplicationState;
  readonly canPlay?: () => boolean;
  readonly updateSnapshot?: (snapshot: SimulationSnapshot) => ApplicationState | void;
  readonly setPlayback?: (playback: PlaybackState) => ApplicationState | void;
  readonly onSnapshot?: (snapshot: SimulationSnapshot) => void;
  readonly onPlaybackStateChange?: (playback: PlaybackState) => void;
  readonly requestAnimationFrame?: RequestAnimationFrame;
  readonly cancelAnimationFrame?: CancelAnimationFrame;
}

type ResolvedPlaybackCallbacks = {
  readonly getState: () => ApplicationState;
  readonly canPlay: () => boolean;
  readonly updateSnapshot?: (snapshot: SimulationSnapshot) => ApplicationState | void;
  readonly setPlayback?: (playback: PlaybackState) => ApplicationState | void;
};

const defaultRequestAnimationFrame: RequestAnimationFrame = (callback) => {
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    throw new Error('requestAnimationFrame is unavailable');
  }
  return globalThis.requestAnimationFrame(callback);
};

const defaultCancelAnimationFrame: CancelAnimationFrame = (handle) => {
  if (typeof globalThis.cancelAnimationFrame === 'function') {
    globalThis.cancelAnimationFrame(handle);
  }
};

function stateFromHost(host: PlaybackStateHost): ApplicationState {
  if (host.getState !== undefined) {
    return host.getState();
  }
  if (host.state !== undefined) {
    return host.state;
  }
  throw new TypeError('Playback requires an application-state getter');
}

function resolveCallbacks(
  host: PlaybackStateHost,
  options: PlaybackControllerOptions,
): ResolvedPlaybackCallbacks {
  const getState = options.getState ?? host.getState?.bind(host) ?? (() => stateFromHost(host));
  const canPlay = options.canPlay
    ?? host.canPlay?.bind(host)
    ?? (() => {
      const state = getState();
      return state.course !== null && state.participants.length > 0;
    });

  return {
    getState,
    canPlay,
    updateSnapshot: options.updateSnapshot ?? host.updateSnapshot?.bind(host),
    setPlayback: options.setPlayback ?? host.setPlayback?.bind(host),
  };
}

function isOptions(
  value: PlaybackStateHost | PlaybackControllerOptions,
  hasSuppliedOptions: boolean,
): value is PlaybackControllerOptions {
  if (hasSuppliedOptions) {
    return false;
  }
  if ('appController' in value || 'controller' in value) {
    return true;
  }
  if (
    'onSnapshot' in value
    || 'onPlaybackStateChange' in value
    || 'requestAnimationFrame' in value
    || 'cancelAnimationFrame' in value
  ) {
    return true;
  }
  // An application controller exposes updateSnapshot/setPlayback methods;
  // a plain options object can use the same callback names and still works
  // as a host, so treating it as a host is safe in that case.
  return !('updateSnapshot' in value) && !('setPlayback' in value);
}

/**
 * Advances simulation time independently from map and DOM implementations.
 * A frame timestamp is accepted only when it is greater than the preceding
 * timestamp, preventing a clock adjustment from moving the simulation back.
 */
export class PlaybackController {
  private readonly callbacks: ResolvedPlaybackCallbacks;
  private readonly onSnapshot?: (snapshot: SimulationSnapshot) => void;
  private readonly onPlaybackStateChange?: (playback: PlaybackState) => void;
  private readonly requestFrame: RequestAnimationFrame;
  private readonly cancelFrame: CancelAnimationFrame;
  private frameHandle: number | null = null;
  private previousFrameTimestamp: number | null = null;
  private disposed = false;

  public constructor(host: PlaybackStateHost, options?: PlaybackControllerOptions);
  public constructor(options: PlaybackControllerOptions);
  public constructor(
    hostOrOptions: PlaybackStateHost | PlaybackControllerOptions,
    suppliedOptions: PlaybackControllerOptions = {},
  ) {
    const optionsWereSupplied = Object.keys(suppliedOptions).length > 0;
    const options = isOptions(hostOrOptions, optionsWereSupplied) ? hostOrOptions : suppliedOptions;
    const host = isOptions(hostOrOptions, optionsWereSupplied)
      ? (hostOrOptions.appController ?? hostOrOptions.controller ?? {})
      : hostOrOptions;

    this.callbacks = resolveCallbacks(host, options);
    if (options.getState === undefined && host.getState === undefined && host.state === undefined) {
      throw new TypeError('Playback requires an application-state getter');
    }
    this.onSnapshot = options.onSnapshot;
    this.onPlaybackStateChange = options.onPlaybackStateChange;
    this.requestFrame = options.requestAnimationFrame ?? defaultRequestAnimationFrame;
    this.cancelFrame = options.cancelAnimationFrame ?? defaultCancelAnimationFrame;
  }

  public canPlay(): boolean {
    return !this.disposed && this.callbacks.canPlay();
  }

  public isRunning(): boolean {
    return this.frameHandle !== null;
  }

  public start(): boolean {
    if (this.disposed || !this.callbacks.canPlay()) {
      return false;
    }
    if (this.frameHandle !== null) {
      return true;
    }

    const state = this.callbacks.getState();
    if (state.playback === 'complete') {
      return false;
    }
    if (state.simulationTimeSeconds >= state.totalDurationSeconds) {
      this.emitTerminalSnapshot(state);
      return false;
    }

    this.previousFrameTimestamp = null;
    this.setPlayback('running');
    this.scheduleFrame();
    return true;
  }

  public pause(): void {
    if (this.disposed) {
      return;
    }
    this.cancelScheduledFrame();
    if (this.callbacks.getState().playback === 'running') {
      this.setPlayback('paused');
    }
  }

  public reset(): void {
    if (this.disposed) {
      return;
    }
    this.cancelScheduledFrame();
    const state = this.callbacks.getState();
    if (state.course !== null && state.participants.length > 0) {
      this.emitSnapshot(simulate(state.course, state.participants, 0));
    }
    this.setPlayback('paused');
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.cancelScheduledFrame();
    this.disposed = true;
  }

  private scheduleFrame(): void {
    if (this.disposed || this.frameHandle !== null) {
      return;
    }
    this.frameHandle = this.requestFrame((timestamp) => {
      this.frameHandle = null;
      this.onFrame(timestamp);
    });
  }

  private onFrame(timestamp: number): void {
    if (this.disposed || this.callbacks.getState().playback !== 'running') {
      return;
    }

    if (!Number.isFinite(timestamp)) {
      this.scheduleFrame();
      return;
    }

    if (this.previousFrameTimestamp === null) {
      this.previousFrameTimestamp = timestamp;
      this.scheduleFrame();
      return;
    }

    if (timestamp <= this.previousFrameTimestamp) {
      this.scheduleFrame();
      return;
    }

    const elapsedMilliseconds = timestamp - this.previousFrameTimestamp;
    this.previousFrameTimestamp = timestamp;
    const state = this.callbacks.getState();
    if (state.course === null || state.participants.length === 0) {
      this.cancelScheduledFrame();
      this.setPlayback('paused');
      return;
    }

    const elapsedSimulationSeconds = elapsedMilliseconds / 1000 * 60;
    const nextTime = Math.min(
      state.totalDurationSeconds,
      state.simulationTimeSeconds + elapsedSimulationSeconds,
    );
    this.emitSnapshot(simulate(state.course, state.participants, nextTime));

    if (nextTime >= state.totalDurationSeconds) {
      this.setPlayback('complete');
      this.previousFrameTimestamp = null;
      return;
    }
    this.scheduleFrame();
  }

  private emitTerminalSnapshot(state: ApplicationState): void {
    if (state.course === null || state.participants.length === 0) {
      return;
    }
    this.emitSnapshot(simulate(state.course, state.participants, state.totalDurationSeconds));
    this.setPlayback('complete');
  }

  private emitSnapshot(snapshot: SimulationSnapshot): void {
    this.callbacks.updateSnapshot?.(snapshot);
    this.onSnapshot?.(snapshot);
  }

  private setPlayback(playback: PlaybackState): void {
    this.callbacks.setPlayback?.(playback);
    this.onPlaybackStateChange?.(playback);
  }

  private cancelScheduledFrame(): void {
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.previousFrameTimestamp = null;
  }
}
