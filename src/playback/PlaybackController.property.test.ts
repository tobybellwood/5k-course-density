import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { AppController } from '../app/state';
import type { ApplicationState, SimulationSnapshot } from '../app/types';
import { createCourseTrackFromCoordinates } from '../domain/geometry';
import { emptyValidationSummary } from '../domain/validation';
import { simulate } from '../domain/simulation';
import {
  PlaybackController,
  type AnimationFrameCallback,
} from './PlaybackController';

const TIME_TOLERANCE_SECONDS = 1e-9;

const playbackCaseArbitrary = fc
  .record({
    startTimeSeconds: fc.integer({ min: 0, max: 3_600 }),
    durationAfterStartSeconds: fc.integer({ min: 1, max: 3_600 }),
    initialTimestampMilliseconds: fc.integer({ min: 0, max: 100_000 }),
    frameDeltasMilliseconds: fc.array(
      fc.integer({ min: 1, max: 5_000 }),
      { minLength: 1, maxLength: 16 },
    ),
  })
  .map(({ startTimeSeconds, durationAfterStartSeconds, ...rest }) => ({
    ...rest,
    startTimeSeconds,
    totalDurationSeconds: startTimeSeconds + durationAfterStartSeconds,
  }));

type QueuedFrame = {
  readonly handle: number;
  readonly callback: AnimationFrameCallback;
};

function expectTimeClose(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(TIME_TOLERANCE_SECONDS);
}

function createPlaybackHarness(startTimeSeconds: number, totalDurationSeconds: number): {
  readonly appController: AppController;
  readonly course: NonNullable<ApplicationState['course']>;
  readonly participants: NonNullable<ApplicationState['participants']>;
  readonly requestAnimationFrame: (callback: AnimationFrameCallback) => number;
  readonly cancelAnimationFrame: (handle: number) => void;
  readonly runQueuedFrame: (timestamp: number) => boolean;
  readonly getQueuedFrame: () => QueuedFrame | null;
} {
  const courseResult = createCourseTrackFromCoordinates([
    { lat: -37.8, lon: 144.9 },
    { lat: -37.79, lon: 144.91 },
  ]);
  if (!courseResult.ok) {
    throw new Error(`Test course was rejected: ${courseResult.reason}`);
  }

  const participants = [{
    id: 'runner-1',
    displayName: 'Runner 1',
    finishDurationSeconds: totalDurationSeconds,
  }];
  const appController = new AppController();
  appController.loadInitial(
    { ok: true, value: courseResult.value, validation: emptyValidationSummary() },
    { ok: true, value: participants, validation: emptyValidationSummary() },
  );
  appController.updateSnapshot(simulate(courseResult.value, participants, startTimeSeconds));

  let nextHandle = 0;
  let queuedFrame: QueuedFrame | null = null;
  const requestAnimationFrame = (callback: AnimationFrameCallback): number => {
    const handle = ++nextHandle;
    queuedFrame = { handle, callback };
    return handle;
  };
  const cancelAnimationFrame = (handle: number): void => {
    if (queuedFrame?.handle === handle) {
      queuedFrame = null;
    }
  };

  const runQueuedFrame = (timestamp: number): boolean => {
    if (queuedFrame === null) {
      return false;
    }
    const frame = queuedFrame;
    queuedFrame = null;
    frame.callback(timestamp);
    return true;
  };

  return {
    appController,
    course: courseResult.value,
    participants,
    requestAnimationFrame,
    cancelAnimationFrame,
    runQueuedFrame,
    getQueuedFrame: () => queuedFrame,
  };
}

describe(
  'Feature: course-density-visualization, Property 6: Playback advances monotonically at sixty simulated seconds per real second',
  () => {
    it('advances by 60x for monotonic timestamps and clamps at total duration', () => {
      fc.assert(
        fc.property(playbackCaseArbitrary, ({
          startTimeSeconds,
          totalDurationSeconds,
          initialTimestampMilliseconds,
          frameDeltasMilliseconds,
        }) => {
          const elapsedBeforeTerminalSeconds = frameDeltasMilliseconds
            .reduce((elapsed, delta) => elapsed + delta / 1000 * 60, 0);
          const remainingSeconds = Math.max(
            0,
            totalDurationSeconds - startTimeSeconds - elapsedBeforeTerminalSeconds,
          );
          const terminalDeltaMilliseconds = remainingSeconds > 0
            ? Math.ceil(remainingSeconds * 1000 / 60) + 1
            : 1;
          const allFrameDeltasMilliseconds = [
            ...frameDeltasMilliseconds,
            terminalDeltaMilliseconds,
          ];
          const timestamps = [initialTimestampMilliseconds];
          for (const delta of allFrameDeltasMilliseconds) {
            timestamps.push(timestamps[timestamps.length - 1] + delta);
          }

          const harness = createPlaybackHarness(startTimeSeconds, totalDurationSeconds);
          const snapshots: SimulationSnapshot[] = [];
          const playback = new PlaybackController(harness.appController, {
            requestAnimationFrame: harness.requestAnimationFrame,
            cancelAnimationFrame: harness.cancelAnimationFrame,
            onSnapshot: (snapshot) => snapshots.push(snapshot),
          });

          expect(playback.start()).toBe(true);
          expect(harness.appController.state.simulationTimeSeconds)
            .toBe(startTimeSeconds);

          for (const timestamp of timestamps) {
            if (!harness.runQueuedFrame(timestamp)) {
              break;
            }
          }

          expect(snapshots.length).toBeGreaterThan(0);
          let previousTime = startTimeSeconds;
          let elapsedMilliseconds = 0;
          snapshots.forEach((snapshot, index) => {
            elapsedMilliseconds += allFrameDeltasMilliseconds[index];
            const expectedTime = Math.min(
              totalDurationSeconds,
              startTimeSeconds + elapsedMilliseconds / 1000 * 60,
            );

            expect(snapshot.simulationTimeSeconds).toBeGreaterThanOrEqual(previousTime);
            expect(snapshot.simulationTimeSeconds)
              .toBeLessThanOrEqual(totalDurationSeconds);
            expectTimeClose(snapshot.simulationTimeSeconds, expectedTime);
            previousTime = snapshot.simulationTimeSeconds;
          });

          expectTimeClose(
            snapshots[snapshots.length - 1].simulationTimeSeconds,
            totalDurationSeconds,
          );
          expect(harness.appController.state.playback).toBe('complete');
          expect(harness.getQueuedFrame()).toBeNull();
        }),
        { numRuns: 100 },
      );
    });
  },
);
