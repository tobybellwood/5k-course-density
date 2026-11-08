// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';

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
import { buildMarkerDescriptors } from '../map/renderModels';

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
  it('initializes finisher-number presentation disabled', () => {
    expect(new AppController().state.showFinisherNumbers).toBe(false);
  });

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

  it('updates density settings without replacing playback or snapshot rendering', () => {
    const course = courseAt(51);
    const participants = [
      participant('runner-1', 'Alex Runner', 60),
      participant('runner-2', 'Sam Runner', 120),
    ];
    const mapView = {
      renderSnapshotOrClear: vi.fn(),
      renderDensity: vi.fn(),
      syncLayerVisibility: vi.fn(),
    };
    const controller = new AppController({ mapView });
    controller.loadInitial(success(course), success(participants));
    controller.updateSnapshot(simulate(course, participants, 30));
    controller.setPlayback('running');
    const before = controller.state;
    mapView.renderSnapshotOrClear.mockClear();
    mapView.renderDensity.mockClear();

    const updated = controller.updateDensitySettings({
      gridSizeMeters: 50,
      minimumPeoplePerCircle: 2,
      warningColourThreshold: 3,
    });

    expect(updated.densitySettings).toEqual({
      gridSizeMeters: 50,
      minimumPeoplePerCircle: 2,
      warningColourThreshold: 3,
    });
    expect(updated.simulationTimeSeconds).toBe(before.simulationTimeSeconds);
    expect(updated.playback).toBe('running');
    expect(updated.snapshot).toBe(before.snapshot);
    expect(updated.snapshot?.positions).toBe(before.snapshot?.positions);
    expect(mapView.renderSnapshotOrClear).not.toHaveBeenCalled();
    expect(mapView.renderDensity).toHaveBeenCalledTimes(1);
    expect(mapView.renderDensity).toHaveBeenCalledWith(before.snapshot, updated.densitySettings);

    const invalid = controller.updateDensitySettings({ minimumPeoplePerCircle: 0 });
    expect(invalid.densitySettings).toEqual(updated.densitySettings);
    expect(invalid.snapshot).toBe(updated.snapshot);
    expect(invalid.simulationTimeSeconds).toBe(updated.simulationTimeSeconds);
    expect(invalid.playback).toBe(updated.playback);
    expect(invalid.validation.reasonCounts['invalid-density-minimum']).toBe(1);
    expect(mapView.renderDensity).toHaveBeenCalledTimes(1);
  });

  it('changes only marker presentation when finisher numbers toggle', () => {
    const course = courseAt(51);
    const participants = [
      participant('runner-1', 'Alex Runner', 60),
      participant('runner-2', 'Sam Runner', 120),
    ];
    const mapView = {
      renderSnapshotOrClear: vi.fn(),
      renderMarkerPresentation: vi.fn(),
      renderDensity: vi.fn(),
      syncLayerVisibility: vi.fn(),
    };
    const controller = new AppController({ mapView });
    controller.loadInitial(success(course), success(participants));
    controller.updateSnapshot(simulate(course, participants, 30));
    controller.setPlayback('running');
    const before = controller.state;
    const beforeSnapshot = before.snapshot;
    const beforePositions = beforeSnapshot?.positions;
    const beforeSimulationState = {
      course: before.course,
      participants: before.participants,
      totalDurationSeconds: before.totalDurationSeconds,
      simulationTimeSeconds: before.simulationTimeSeconds,
      playback: before.playback,
      layers: before.layers,
      densitySettings: before.densitySettings,
      validation: before.validation,
    };
    mapView.renderSnapshotOrClear.mockClear();
    mapView.renderMarkerPresentation.mockClear();
    mapView.renderDensity.mockClear();
    mapView.syncLayerVisibility.mockClear();

    const enabled = controller.setShowFinisherNumbers(true);

    expect(enabled.showFinisherNumbers).toBe(true);
    expect({
      course: enabled.course,
      participants: enabled.participants,
      totalDurationSeconds: enabled.totalDurationSeconds,
      simulationTimeSeconds: enabled.simulationTimeSeconds,
      playback: enabled.playback,
      layers: enabled.layers,
      densitySettings: enabled.densitySettings,
      validation: enabled.validation,
    }).toEqual(beforeSimulationState);
    expect(enabled.participants[0]).toBe(before.participants[0]);
    expect(enabled.snapshot).toBe(beforeSnapshot);
    expect(enabled.snapshot?.positions).toBe(beforePositions);
    expect(mapView.renderSnapshotOrClear).not.toHaveBeenCalled();
    expect(mapView.renderDensity).not.toHaveBeenCalled();
    expect(mapView.syncLayerVisibility).not.toHaveBeenCalled();
    expect(mapView.renderMarkerPresentation).toHaveBeenCalledWith(beforeSnapshot, true);

    const disabled = controller.setShowFinisherNumbers(false);
    expect(disabled.showFinisherNumbers).toBe(false);
    expect({
      course: disabled.course,
      participants: disabled.participants,
      totalDurationSeconds: disabled.totalDurationSeconds,
      simulationTimeSeconds: disabled.simulationTimeSeconds,
      playback: disabled.playback,
      layers: disabled.layers,
      densitySettings: disabled.densitySettings,
      validation: disabled.validation,
    }).toEqual(beforeSimulationState);
    expect(disabled.participants[0]).toBe(before.participants[0]);
    expect(disabled.snapshot).toBe(beforeSnapshot);
    expect(disabled.snapshot?.positions).toBe(beforePositions);
    expect(mapView.renderSnapshotOrClear).not.toHaveBeenCalled();
    expect(mapView.renderDensity).not.toHaveBeenCalled();
    expect(mapView.syncLayerVisibility).not.toHaveBeenCalled();
    expect(mapView.renderMarkerPresentation).toHaveBeenLastCalledWith(beforeSnapshot, false);
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


describe('density setting state updates', () => {
  it('applies each supported grid size immediately while changing only density rendering', () => {
    const course = courseAt(51);
    const participants = [
      participant('runner-1', 'Alex Runner', 60),
      participant('runner-2', 'Sam Runner', 120),
    ];
    const mapView = {
      renderSnapshotOrClear: vi.fn(),
      renderDensity: vi.fn(),
      syncLayerVisibility: vi.fn(),
    };
    const statusView = { renderStatus: vi.fn() };
    const controller = new AppController({ mapView, statusView });
    controller.loadInitial(success(course), success(participants));
    controller.updateSnapshot(simulate(course, participants, 45));
    controller.setPlayback('running');

    const before = controller.state;
    if (before.snapshot === null) {
      throw new Error('Expected a simulation snapshot for density update coverage');
    }
    const priorMarkers = buildMarkerDescriptors(before.snapshot);
    mapView.renderSnapshotOrClear.mockClear();
    mapView.renderDensity.mockClear();
    mapView.syncLayerVisibility.mockClear();
    statusView.renderStatus.mockClear();

    for (const gridSizeMeters of [10, 25, 50, 100] as const) {
      const updated = controller.updateDensitySettings({ gridSizeMeters });

      expect(updated.densitySettings.gridSizeMeters).toBe(gridSizeMeters);
      expect(updated.simulationTimeSeconds).toBe(before.simulationTimeSeconds);
      expect(updated.playback).toBe('running');
      expect(updated.snapshot).toBe(before.snapshot);
      const updatedSnapshot = updated.snapshot;
      if (updatedSnapshot === null) {
        throw new Error('Density updates must preserve the simulation snapshot');
      }
      expect(updatedSnapshot.positions).toEqual(before.snapshot.positions);
      expect(buildMarkerDescriptors(updatedSnapshot)).toEqual(priorMarkers);
      expect(mapView.renderSnapshotOrClear).not.toHaveBeenCalled();
      expect(mapView.syncLayerVisibility).not.toHaveBeenCalled();
      expect(mapView.renderDensity).toHaveBeenLastCalledWith(
        before.snapshot,
        updated.densitySettings,
      );
      expect(statusView.renderStatus).toHaveBeenLastCalledWith(
        expect.objectContaining({
          simulationTimeSeconds: before.simulationTimeSeconds,
          playback: 'running',
          densitySettings: updated.densitySettings,
        }),
      );
    }

    expect(mapView.renderDensity).toHaveBeenCalledTimes(4);
    expect(statusView.renderStatus).toHaveBeenCalledTimes(4);
  });

  it('enables and explicitly disables the warning threshold without changing the snapshot', () => {
    const course = courseAt(51);
    const participants = [participant('runner', 'Runner', 90)];
    const mapView = {
      renderSnapshotOrClear: vi.fn(),
      renderDensity: vi.fn(),
      syncLayerVisibility: vi.fn(),
    };
    const controller = new AppController({ mapView });
    controller.loadInitial(success(course), success(participants));
    controller.updateSnapshot(simulate(course, participants, 20));
    controller.setPlayback('running');
    const before = controller.state;
    mapView.renderSnapshotOrClear.mockClear();
    mapView.renderDensity.mockClear();

    const enabled = controller.updateDensitySettings({ warningColourThreshold: 4 });
    const disabled = controller.updateDensitySettings({ warningColourThreshold: null });

    expect(enabled.densitySettings.warningColourThreshold).toBe(4);
    expect(disabled.densitySettings.warningColourThreshold).toBeNull();
    expect(disabled.simulationTimeSeconds).toBe(before.simulationTimeSeconds);
    expect(disabled.playback).toBe('running');
    expect(disabled.snapshot).toBe(before.snapshot);
    expect(mapView.renderSnapshotOrClear).not.toHaveBeenCalled();
    expect(mapView.renderDensity).toHaveBeenCalledTimes(2);
    expect(mapView.renderDensity).toHaveBeenLastCalledWith(
      before.snapshot,
      disabled.densitySettings,
    );
  });
});
