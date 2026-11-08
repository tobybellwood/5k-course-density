// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApplicationState } from './types';
import { createDomView, formatSimulationDuration } from './domView';
import { createInitialApplicationState } from './state';
import { createApplicationState, createCourseTrack, createParticipantRecord, createValidationSummary } from '../domain/validation';
import { simulate } from '../domain/simulation';

function installMarkup(): void {
  document.body.innerHTML = `
    <input id="course-file-input" type="file">
    <input id="results-file-input" type="file">
    <button id="reset-example-button"></button>
    <button id="start-playback-button"></button>
    <button id="pause-playback-button"></button>
    <button id="reset-playback-button"></button>
    <input id="markers-layer-toggle" type="checkbox">
    <input id="density-layer-toggle" type="checkbox">
    <div id="status"></div>
    <span id="simulation-time"></span>
    <span id="total-duration"></span>
    <span id="playback-state"></span>
    <span id="participant-count"></span>
    <span id="excluded-row-count"></span>
    <div id="validation-notice"></div>
  `;
}

function availableState(): ApplicationState {
  const courseResult = createCourseTrack(
    [
      { lat: 51, lon: -1, cumulativeDistanceMeters: 0 },
      { lat: 51.001, lon: -1, cumulativeDistanceMeters: 100 },
    ],
    100,
    { minLat: 51, maxLat: 51.001, minLon: -1, maxLon: -1 },
  );
  const participantResult = createParticipantRecord('runner-1', 'Runner', 3_661);
  if (!courseResult.ok || !participantResult.ok) {
    throw new Error('Could not create DOM view fixture');
  }
  const snapshot = simulate(courseResult.value, [participantResult.value], 61);
  const stateResult = createApplicationState({
    course: courseResult.value,
    participants: [participantResult.value],
    totalDurationSeconds: 3_661,
    simulationTimeSeconds: 61,
    playback: 'paused',
    layers: { markers: true, density: false },
    validation: createValidationSummary({
      excludedRows: 2,
      reasonCounts: { 'invalid-duration': 1, 'missing-name': 1 },
      notices: ['The previous course was retained.'],
    }),
    snapshot,
  });
  if (!stateResult.ok) {
    throw new Error(`Could not create state fixture: ${stateResult.reason}`);
  }
  return stateResult.value;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('DomView', () => {
  it('formats and renders status, validation, layers, live regions, and disabled controls', () => {
    installMarkup();
    const view = createDomView(document);
    view.render(availableState());

    expect(formatSimulationDuration(3_661)).toBe('1:01:01');
    expect(document.querySelector('#simulation-time')?.textContent).toBe('1:01');
    expect(document.querySelector('#total-duration')?.textContent).toBe('1:01:01');
    expect(document.querySelector('#playback-state')?.textContent).toBe('Paused');
    expect(view.elements.participantCount.textContent).toBe('1');
    expect(view.elements.excludedRowCount.textContent).toBe('2');
    expect(document.querySelector('#validation-notice')?.textContent).toContain('2 rows excluded');
    expect(document.querySelector('#validation-notice')?.textContent).toContain('The previous course was retained.');
    expect(document.querySelector('#status')?.getAttribute('aria-live')).toBe('polite');
    expect(document.querySelector('#validation-notice')?.getAttribute('aria-live')).toBe('polite');
    expect((document.querySelector('#markers-layer-toggle') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('#density-layer-toggle') as HTMLInputElement).checked).toBe(false);
    expect((document.querySelector('#start-playback-button') as HTMLButtonElement).disabled).toBe(false);
    expect((document.querySelector('#pause-playback-button') as HTMLButtonElement).disabled).toBe(true);
    expect((document.querySelector('#reset-playback-button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('wires controls and local file selections to callbacks', () => {
    installMarkup();
    const callbacks = {
      onCourseFileSelected: vi.fn(),
      onResultsFileSelected: vi.fn(),
      onStartPlayback: vi.fn(),
      onPausePlayback: vi.fn(),
      onResetPlayback: vi.fn(),
      onResetExample: vi.fn(),
      onMarkersVisibilityChange: vi.fn(),
      onDensityVisibilityChange: vi.fn(),
    };
    createDomView(document, callbacks);

    const courseFile = new File(['<gpx />'], 'course.gpx');
    const resultsFile = new File(['<html />'], 'results.html');
    Object.defineProperty(document.querySelector('#course-file-input'), 'files', { value: [courseFile] });
    Object.defineProperty(document.querySelector('#results-file-input'), 'files', { value: [resultsFile] });
    document.querySelector('#course-file-input')?.dispatchEvent(new Event('change'));
    document.querySelector('#results-file-input')?.dispatchEvent(new Event('change'));
    document.querySelector('#start-playback-button')?.dispatchEvent(new Event('click'));
    document.querySelector('#pause-playback-button')?.dispatchEvent(new Event('click'));
    document.querySelector('#reset-playback-button')?.dispatchEvent(new Event('click'));
    document.querySelector('#reset-example-button')?.dispatchEvent(new Event('click'));
    const markers = document.querySelector('#markers-layer-toggle') as HTMLInputElement;
    const density = document.querySelector('#density-layer-toggle') as HTMLInputElement;
    markers.checked = false;
    density.checked = false;
    markers.dispatchEvent(new Event('change'));
    density.dispatchEvent(new Event('change'));

    expect(callbacks.onCourseFileSelected).toHaveBeenCalledWith(courseFile);
    expect(callbacks.onResultsFileSelected).toHaveBeenCalledWith(resultsFile);
    expect(callbacks.onStartPlayback).toHaveBeenCalledOnce();
    expect(callbacks.onPausePlayback).toHaveBeenCalledOnce();
    expect(callbacks.onResetPlayback).toHaveBeenCalledOnce();
    expect(callbacks.onResetExample).toHaveBeenCalledOnce();
    expect(callbacks.onMarkersVisibilityChange).toHaveBeenCalledWith(false);
    expect(callbacks.onDensityVisibilityChange).toHaveBeenCalledWith(false);
  });

  it('disables playback controls when either required input is unavailable', () => {
    installMarkup();
    const view = createDomView(document);
    view.render(createInitialApplicationState());

    expect((document.querySelector('#start-playback-button') as HTMLButtonElement).disabled).toBe(true);
    expect((document.querySelector('#pause-playback-button') as HTMLButtonElement).disabled).toBe(true);
    expect((document.querySelector('#reset-playback-button') as HTMLButtonElement).disabled).toBe(true);
  });
});
