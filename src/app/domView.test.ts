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
    <label for="bundled-example-select">Bundled results example</label>
    <select id="bundled-example-select"><option value="./examples/results%20_%2062%20people.html">62 people</option><option value="./examples/results%20_%20411%20people.html">411 people</option></select>
    <button id="start-playback-button"></button>
    <button id="pause-playback-button"></button>
    <button id="reset-playback-button"></button>
    <input id="markers-layer-toggle" type="checkbox">
    <input id="density-layer-toggle" type="checkbox">
    <label for="show-finisher-numbers">Show finisher numbers</label>
    <input id="show-finisher-numbers" type="checkbox" role="switch">
    <span id="finisher-numbers-status">Off</span>
    <select id="density-grid-size"><option value="10">10 m</option><option value="25">25 m</option><option value="50">50 m</option><option value="100">100 m</option></select>
    <input id="density-minimum" type="number" value="1">
    <select id="density-warning-threshold"><option value="disabled">Disabled</option><option value="5">5 people</option></select>
    <p id="density-settings-notice"></p>
    <div id="density-settings-summary"></div>
    <div id="density-warning-state"></div>
    <li id="density-warning-legend"><span class="legend-swatch"></span></li>
    <p id="density-filter-legend"></p>
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
    expect(view.elements.densitySettingsSummary.textContent).toBe('25 m grid · minimum 1');
    expect(view.elements.densityWarningState.textContent).toBe('Disabled');
    expect(view.elements.densityFilterLegend.textContent).toContain('minimum filter of 1');
    expect(document.querySelector('#density-warning-legend')?.textContent).toContain('Warning colour is disabled');
    expect(document.querySelector('#validation-notice')?.textContent).toContain('2 rows excluded');
    expect(document.querySelector('#validation-notice')?.textContent).toContain('The previous course was retained.');
    expect(document.querySelector('#status')?.getAttribute('aria-live')).toBe('polite');
    expect(document.querySelector('#validation-notice')?.getAttribute('aria-live')).toBe('polite');
    expect((document.querySelector('#markers-layer-toggle') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('#density-layer-toggle') as HTMLInputElement).checked).toBe(false);
    expect((document.querySelector('#show-finisher-numbers') as HTMLInputElement).checked).toBe(false);
    expect(document.querySelector('#finisher-numbers-status')?.textContent).toBe('Off');
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
      onShowFinisherNumbersChange: vi.fn(),
      onDensitySettingsChanged: vi.fn(),
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
    const bundledExample = document.querySelector('#bundled-example-select') as HTMLSelectElement;
    bundledExample.value = './examples/results%20_%20411%20people.html';
    document.querySelector('#reset-example-button')?.dispatchEvent(new Event('click'));
    const markers = document.querySelector('#markers-layer-toggle') as HTMLInputElement;
    const density = document.querySelector('#density-layer-toggle') as HTMLInputElement;
    markers.checked = false;
    density.checked = false;
    markers.dispatchEvent(new Event('change'));
    density.dispatchEvent(new Event('change'));
    const finisherNumbers = document.querySelector('#show-finisher-numbers') as HTMLInputElement;
    finisherNumbers.checked = true;
    finisherNumbers.dispatchEvent(new Event('change'));
    const gridSize = document.querySelector('#density-grid-size') as HTMLSelectElement;
    gridSize.value = '50';
    gridSize.dispatchEvent(new Event('change'));
    const minimum = document.querySelector('#density-minimum') as HTMLInputElement;
    minimum.value = '2';
    minimum.dispatchEvent(new Event('change'));
    const warning = document.querySelector('#density-warning-threshold') as HTMLSelectElement;
    warning.value = '5';
    warning.dispatchEvent(new Event('change'));

    expect(callbacks.onCourseFileSelected).toHaveBeenCalledWith(courseFile);
    expect(callbacks.onResultsFileSelected).toHaveBeenCalledWith(resultsFile);
    expect(callbacks.onStartPlayback).toHaveBeenCalledOnce();
    expect(callbacks.onPausePlayback).toHaveBeenCalledOnce();
    expect(callbacks.onResetPlayback).toHaveBeenCalledOnce();
    expect(callbacks.onResetExample).toHaveBeenCalledWith('./examples/results%20_%20411%20people.html');
    expect(callbacks.onMarkersVisibilityChange).toHaveBeenCalledWith(false);
    expect(callbacks.onDensityVisibilityChange).toHaveBeenCalledWith(false);
    expect(callbacks.onShowFinisherNumbersChange).toHaveBeenCalledWith(true);
    expect(callbacks.onDensitySettingsChanged).toHaveBeenLastCalledWith({
      gridSizeMeters: 50,
      minimumPeoplePerCircle: 2,
      warningColourThreshold: 5,
    });
  });

  it('retains valid density controls and announces invalid edits', () => {
    installMarkup();
    const view = createDomView(document);
    view.render(availableState());

    const minimum = document.querySelector('#density-minimum') as HTMLInputElement;
    minimum.value = '1.5';
    minimum.dispatchEvent(new Event('change'));

    expect(minimum.value).toBe('1');
    expect(view.elements.densitySettingsNotice.textContent).toContain('whole number');
    expect(view.elements.validationNotice.textContent).toContain('whole number');
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
