// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import type {
  CourseTrack,
  ParseResult,
  ParticipantRecord,
  ValidationSummary,
} from './types';
import { AppController } from './state';
import { InputCoordinator } from './inputCoordinator';
import {
  createCourseTrack,
  createParticipantRecord,
  createValidationSummary,
  emptyValidationSummary,
} from '../domain/validation';
import { simulate } from '../domain/simulation';

function courseAt(latitude: number): CourseTrack {
  const result = createCourseTrack(
    [
      { lat: latitude, lon: -1, cumulativeDistanceMeters: 0 },
      { lat: latitude + 0.001, lon: -1, cumulativeDistanceMeters: 1_000 },
    ],
    1_000,
    {
      minLat: latitude,
      maxLat: latitude + 0.001,
      minLon: -1,
      maxLon: -1,
    },
  );

  if (!result.ok) {
    throw new Error(`Could not create course fixture: ${result.reason}`);
  }
  return result.value;
}

function participant(id: string, name: string, finishDurationSeconds: number): ParticipantRecord {
  const result = createParticipantRecord(id, name, finishDurationSeconds);
  if (!result.ok) {
    throw new Error(`Could not create participant fixture: ${result.reason}`);
  }
  return result.value;
}

function success<T>(value: T): ParseResult<T> {
  return { ok: true, value, validation: emptyValidationSummary() };
}

function failure<T>(notice: string): ParseResult<T> {
  const validation: ValidationSummary = createValidationSummary({
    notices: [notice],
    reasonCounts: { 'malformed-gpx': 1 },
  });
  return { ok: false, validation };
}

function response(text: string): Response {
  return { ok: true, status: 200, text: async () => text } as Response;
}

describe('AppController state transitions', () => {
  it('commits valid inputs atomically and retains references and derived state after failed replacements', () => {
    const controller = new AppController();
    const course = courseAt(51);
    const participants = [
      participant('runner-1', 'Alex Runner', 60),
      participant('runner-2', 'Sam Runner', 120),
    ];

    controller.loadInitial(success(course), success(participants));
    controller.updateSnapshot(simulate(course, participants, 30));
    controller.setPlayback('running');
    const beforeFailure = controller.state;

    const failedCourse = controller.replaceCourse(failure<CourseTrack>('The replacement course was rejected.'));
    expect(failedCourse.course).toBe(beforeFailure.course);
    expect(failedCourse.participants[0]).toBe(beforeFailure.participants[0]);
    expect(failedCourse.snapshot).toBe(beforeFailure.snapshot);
    expect(failedCourse.totalDurationSeconds).toBe(beforeFailure.totalDurationSeconds);
    expect(failedCourse.simulationTimeSeconds).toBe(beforeFailure.simulationTimeSeconds);
    expect(failedCourse.playback).toBe(beforeFailure.playback);

    const beforeParticipantFailure = controller.state;
    const failedParticipants = controller.replaceParticipants(
      failure<ParticipantRecord[]>('The replacement results were rejected.'),
    );
    expect(failedParticipants.course).toBe(beforeParticipantFailure.course);
    expect(failedParticipants.participants[0]).toBe(beforeParticipantFailure.participants[0]);
    expect(failedParticipants.snapshot).toBe(beforeParticipantFailure.snapshot);
    expect(failedParticipants.totalDurationSeconds).toBe(beforeParticipantFailure.totalDurationSeconds);
    expect(failedParticipants.simulationTimeSeconds).toBe(beforeParticipantFailure.simulationTimeSeconds);
    expect(failedParticipants.playback).toBe(beforeParticipantFailure.playback);
    expect(failedParticipants.validation.notices).toContain('The replacement results were rejected.');
  });

  it('resets simulation time and recomputes derived data for each successful replacement', () => {
    const controller = new AppController();
    const originalCourse = courseAt(51);
    const replacementCourse = courseAt(52);
    const originalParticipants = [participant('original', 'Original Runner', 120)];
    const replacementParticipants = [
      participant('replacement-1', 'Replacement One', 30),
      participant('replacement-2', 'Replacement Two', 45),
    ];

    controller.loadInitial(success(originalCourse), success(originalParticipants));
    controller.updateSnapshot(simulate(originalCourse, originalParticipants, 60));
    controller.setPlayback('running');

    const afterCourseReplacement = controller.replaceCourse(success(replacementCourse));
    expect(afterCourseReplacement.course).toBe(replacementCourse);
    expect(afterCourseReplacement.participants[0]).toBe(originalParticipants[0]);
    expect(afterCourseReplacement.totalDurationSeconds).toBe(120);
    expect(afterCourseReplacement.simulationTimeSeconds).toBe(0);
    expect(afterCourseReplacement.playback).toBe('paused');
    expect(afterCourseReplacement.snapshot?.simulationTimeSeconds).toBe(0);
    expect(afterCourseReplacement.snapshot?.positions[0]?.coordinate).toEqual({
      lat: replacementCourse.points[0].lat,
      lon: replacementCourse.points[0].lon,
    });

    const previousSnapshot = afterCourseReplacement.snapshot;
    const afterParticipantReplacement = controller.replaceParticipants(success(replacementParticipants));
    expect(afterParticipantReplacement.course).toBe(replacementCourse);
    expect(afterParticipantReplacement.participants[0]).toBe(replacementParticipants[0]);
    expect(afterParticipantReplacement.totalDurationSeconds).toBe(45);
    expect(afterParticipantReplacement.simulationTimeSeconds).toBe(0);
    expect(afterParticipantReplacement.playback).toBe('paused');
    expect(afterParticipantReplacement.snapshot).not.toBe(previousSnapshot);
    expect(afterParticipantReplacement.snapshot?.positions).toHaveLength(2);
    expect(afterParticipantReplacement.snapshot?.positions.every((position) => position.routeFraction === 0)).toBe(true);
  });

  it('keeps playback unavailable while either required input is missing', () => {
    const course = courseAt(51);
    const participants = [participant('runner', 'Runner', 90)];

    const missingCourse = new AppController();
    missingCourse.loadInitial(
      failure<CourseTrack>('No course was available.'),
      success(participants),
    );
    expect(missingCourse.canPlay()).toBe(false);
    expect(missingCourse.state.playback).toBe('paused');
    expect(missingCourse.state.snapshot).toBeNull();
    expect(() => missingCourse.setPlayback('running')).toThrow(
      'Playback requires a valid course and participants',
    );
    expect(missingCourse.state.playback).toBe('paused');

    const missingParticipants = new AppController();
    missingParticipants.loadInitial(success(course), failure<ParticipantRecord[]>('No results were available.'));
    expect(missingParticipants.canPlay()).toBe(false);
    expect(missingParticipants.state.playback).toBe('paused');
    expect(missingParticipants.state.snapshot).toBeNull();
    expect(() => missingParticipants.setPlayback('running')).toThrow(
      'Playback requires a valid course and participants',
    );
  });

  it('toggles marker and density layers without changing simulation data', () => {
    const controller = new AppController();
    const course = courseAt(51);
    const participants = [participant('runner', 'Runner', 90)];
    controller.loadInitial(success(course), success(participants));
    controller.updateSnapshot(simulate(course, participants, 20));
    const beforeToggle = controller.state;

    const markersHidden = controller.toggleLayer('markers');
    expect(markersHidden.layers).toEqual({ markers: false, density: true });
    expect(markersHidden.simulationTimeSeconds).toBe(beforeToggle.simulationTimeSeconds);
    expect(markersHidden.snapshot).toBe(beforeToggle.snapshot);

    const densityHidden = controller.toggleLayer('density');
    expect(densityHidden.layers).toEqual({ markers: false, density: false });
    expect(densityHidden.simulationTimeSeconds).toBe(beforeToggle.simulationTimeSeconds);
    expect(densityHidden.snapshot).toBe(beforeToggle.snapshot);

    const markersShown = controller.setLayerVisibility('markers', true);
    expect(markersShown.layers).toEqual({ markers: true, density: false });
    expect(markersShown.snapshot).toBe(beforeToggle.snapshot);
  });
});

describe('InputCoordinator state transitions', () => {
  it('retains failed local replacements and restores both bundled inputs on example reset', async () => {
    const exampleCourse = courseAt(51);
    const replacementCourse = courseAt(52);
    const exampleParticipants = [participant('example', 'Example Runner', 100)];
    const replacementParticipants = [participant('replacement', 'Replacement Runner', 80)];
    const invalidCourseValidation = createValidationSummary({
      notices: ['The local course is invalid.'],
      reasonCounts: { 'malformed-gpx': 1 },
    });
    const invalidResultsValidation = createValidationSummary({
      notices: ['The local results are invalid.'],
      reasonCounts: { 'no-valid-records': 1 },
    });

    const controller = new AppController();
    const coordinator = new InputCoordinator({
      controller,
      fetcher: async (url) => response(String(url).includes('results') ? 'example-results' : 'example-course'),
      parseCourse: (source) => {
        if (source === 'invalid-course') {
          return { ok: false, validation: invalidCourseValidation };
        }
        return success(source === 'replacement-course' ? replacementCourse : exampleCourse);
      },
      parseResults: (source) => {
        if (source === 'invalid-results') {
          return { ok: false, validation: invalidResultsValidation };
        }
        return success(source === 'replacement-results' ? replacementParticipants : exampleParticipants);
      },
    });

    await coordinator.loadBundledExamples();
    await coordinator.replaceCourseFile(new File(['replacement-course'], 'replacement.gpx'));
    await coordinator.replaceResultsFile(new File(['replacement-results'], 'replacement.html'));
    const beforeFailedReplacement = controller.state;
    controller.updateSnapshot(simulate(replacementCourse, replacementParticipants, 20));
    const beforeFailedCourse = controller.state;

    const failedCourse = await coordinator.replaceCourseFile(
      new File(['invalid-course'], 'invalid.gpx'),
    );
    expect(failedCourse.ok).toBe(false);
    expect(controller.state.course).toBe(beforeFailedCourse.course);
    expect(controller.state.participants[0]).toBe(beforeFailedCourse.participants[0]);
    expect(controller.state.snapshot).toBe(beforeFailedCourse.snapshot);
    expect(controller.state.simulationTimeSeconds).toBe(beforeFailedCourse.simulationTimeSeconds);
    expect(controller.state.validation.notices).toContain('The local course is invalid.');

    const failedResults = await coordinator.replaceResultsFile(
      new File(['invalid-results'], 'invalid.html'),
    );
    expect(failedResults.ok).toBe(false);
    expect(controller.state.course).toBe(beforeFailedReplacement.course);
    expect(controller.state.participants[0]).toBe(beforeFailedReplacement.participants[0]);

    const reset = await coordinator.resetToExample();
    expect(reset.state.course).toBe(exampleCourse);
    expect(reset.state.participants[0]).toBe(exampleParticipants[0]);
    expect(reset.state.simulationTimeSeconds).toBe(0);
    expect(reset.state.totalDurationSeconds).toBe(100);
    expect(reset.state.snapshot?.positions).toHaveLength(1);
    expect(reset.state.snapshot?.positions[0]?.coordinate).toEqual({
      lat: exampleCourse.points[0].lat,
      lon: exampleCourse.points[0].lon,
    });
  });
});
