import { describe, expect, it } from 'vitest';

import type {
  ApplicationState,
  PlaybackState,
  SimulationSnapshot,
} from '../app/types';
import type { PlaybackStateHost, RequestAnimationFrame } from './PlaybackController';
import { PlaybackController } from './PlaybackController';
import { createCourseTrackFromCoordinates } from '../domain/geometry';
import { simulate } from '../domain/simulation';
import { createApplicationState, emptyValidationSummary } from '../domain/validation';

const COURSE_COORDINATES = [
  { lat: 51, lon: -1 },
  { lat: 51.001, lon: -1 },
] as const;
const FINISH_DURATION_SECONDS = 120;

type FrameCallback = (timestamp: number) => void;

type FrameHarness = {
  readonly requestAnimationFrame: RequestAnimationFrame;
  readonly cancelAnimationFrame: (handle: number) => void;
  readonly flushNext: (timestamp: number) => void;
  readonly pendingCount: () => number;
};

function createFrameHarness(): FrameHarness {
  const callbacks = new Map<number, FrameCallback>();
  let nextHandle = 1;

  return {
    requestAnimationFrame: (callback) => {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    },
    cancelAnimationFrame: (handle) => {
      callbacks.delete(handle);
    },
    flushNext: (timestamp) => {
      const next = callbacks.entries().next();
      if (next.done) {
        throw new Error('No animation frame is pending');
      }
      callbacks.delete(next.value[0]);
      next.value[1](timestamp);
    },
    pendingCount: () => callbacks.size,
  };
}

function createInitialState(simulationTimeSeconds = 0): ApplicationState {
  const courseResult = createCourseTrackFromCoordinates(COURSE_COORDINATES);
  if (!courseResult.ok) {
    throw new Error(`Unable to create course fixture: ${courseResult.reason}`);
  }

  const participants = [{
    id: 'runner-1',
    displayName: 'Runner One',
    finishDurationSeconds: FINISH_DURATION_SECONDS,
  }];
  const snapshot = simulate(courseResult.value, participants, simulationTimeSeconds);
  const stateResult = createApplicationState({
    course: courseResult.value,
    participants,
    totalDurationSeconds: FINISH_DURATION_SECONDS,
    simulationTimeSeconds,
    playback: 'paused',
    layers: { markers: true, density: true },
    validation: emptyValidationSummary(),
    snapshot,
  });
  if (!stateResult.ok) {
    throw new Error(`Unable to create state fixture: ${stateResult.reason}`);
  }
  return stateResult.value;
}

function createHost(initialState: ApplicationState): {
  readonly host: PlaybackStateHost;
  readonly getState: () => ApplicationState;
} {
  let state = initialState;
  const host: PlaybackStateHost = {
    getState: () => state,
    updateSnapshot: (snapshot: SimulationSnapshot) => {
      state = {
        ...state,
        simulationTimeSeconds: snapshot.simulationTimeSeconds,
        snapshot,
      };
      return state;
    },
    setPlayback: (playback: PlaybackState) => {
      state = { ...state, playback };
      return state;
    },
  };

  return { host, getState: () => state };
}

describe('PlaybackController', () => {
  it('starts from the current paused non-zero time', () => {
    const frames = createFrameHarness();
    const { host, getState } = createHost(createInitialState(30));
    const controller = new PlaybackController(host, {
      requestAnimationFrame: frames.requestAnimationFrame,
      cancelAnimationFrame: frames.cancelAnimationFrame,
    });

    expect(controller.start()).toBe(true);
    expect(getState().playback).toBe('running');
    frames.flushNext(1_000);
    frames.flushNext(1_500);

    expect(getState().simulationTimeSeconds).toBe(60);
    expect(getState().snapshot?.simulationTimeSeconds).toBe(60);
  });

  it('preserves the current snapshot and stops scheduling when paused', () => {
    const frames = createFrameHarness();
    const { host, getState } = createHost(createInitialState());
    const controller = new PlaybackController(host, {
      requestAnimationFrame: frames.requestAnimationFrame,
      cancelAnimationFrame: frames.cancelAnimationFrame,
    });

    controller.start();
    frames.flushNext(1_000);
    frames.flushNext(1_500);
    const snapshotBeforePause = getState().snapshot;

    controller.pause();

    expect(getState().playback).toBe('paused');
    expect(getState().simulationTimeSeconds).toBe(30);
    expect(getState().snapshot).toBe(snapshotBeforePause);
    expect(frames.pendingCount()).toBe(0);
  });

  it('resets time, positions, and playback state', () => {
    const frames = createFrameHarness();
    const { host, getState } = createHost(createInitialState(30));
    const controller = new PlaybackController(host, {
      requestAnimationFrame: frames.requestAnimationFrame,
      cancelAnimationFrame: frames.cancelAnimationFrame,
    });

    controller.start();
    frames.flushNext(1_000);
    frames.flushNext(1_500);
    controller.reset();

    expect(getState().playback).toBe('paused');
    expect(getState().simulationTimeSeconds).toBe(0);
    expect(getState().snapshot?.simulationTimeSeconds).toBe(0);
    expect(getState().snapshot?.positions[0]?.routeFraction).toBe(0);
    expect(getState().snapshot?.positions[0]?.coordinate).toEqual(COURSE_COORDINATES[0]);
    expect(frames.pendingCount()).toBe(0);
  });

  it('does not start or schedule frames when input is unavailable', () => {
    const frames = createFrameHarness();
    const { host, getState } = createHost({
      ...createInitialState(),
      course: null,
      participants: [],
      totalDurationSeconds: 0,
      simulationTimeSeconds: 0,
      snapshot: null,
    });
    const controller = new PlaybackController(host, {
      requestAnimationFrame: frames.requestAnimationFrame,
      cancelAnimationFrame: frames.cancelAnimationFrame,
    });

    expect(controller.canPlay()).toBe(false);
    expect(controller.start()).toBe(false);
    controller.pause();
    controller.reset();

    expect(getState().playback).toBe('paused');
    expect(getState().snapshot).toBeNull();
    expect(frames.pendingCount()).toBe(0);
  });

  it('clamps at the terminal time and marks playback complete', () => {
    const frames = createFrameHarness();
    const { host, getState } = createHost(createInitialState());
    const controller = new PlaybackController(host, {
      requestAnimationFrame: frames.requestAnimationFrame,
      cancelAnimationFrame: frames.cancelAnimationFrame,
    });

    controller.start();
    frames.flushNext(2_000);
    frames.flushNext(4_000);

    expect(getState().simulationTimeSeconds).toBe(FINISH_DURATION_SECONDS);
    expect(getState().playback).toBe('complete');
    expect(getState().snapshot?.positions[0]?.routeFraction).toBe(1);
    expect(getState().snapshot?.positions[0]?.coordinate).toEqual(COURSE_COORDINATES[1]);
    expect(frames.pendingCount()).toBe(0);
    expect(controller.start()).toBe(false);
  });

  it('ignores non-monotonic timestamps without losing elapsed time', () => {
    const frames = createFrameHarness();
    const { host, getState } = createHost(createInitialState());
    const controller = new PlaybackController(host, {
      requestAnimationFrame: frames.requestAnimationFrame,
      cancelAnimationFrame: frames.cancelAnimationFrame,
    });

    controller.start();
    frames.flushNext(1_000);
    frames.flushNext(900);

    expect(getState().simulationTimeSeconds).toBe(0);
    expect(frames.pendingCount()).toBe(1);

    frames.flushNext(1_500);

    expect(getState().simulationTimeSeconds).toBe(30);
    expect(getState().snapshot?.simulationTimeSeconds).toBe(30);
  });
});
