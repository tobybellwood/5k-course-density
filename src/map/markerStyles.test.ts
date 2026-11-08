// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import type { ParticipantPosition, SimulationSnapshot } from '../app/types';
import { createParticipantPopupContent } from './LeafletMapView';
import { buildMarkerDescriptors, buildVisualizationRenderModel } from './renderModels';

function position(
  id: string,
  displayName: string,
  finishDurationSeconds: number,
  routeFraction: number,
  lat = 51.5,
  lon = -0.1,
): ParticipantPosition {
  return {
    id,
    displayName,
    finishDurationSeconds,
    routeFraction,
    coordinate: { lat, lon },
  };
}

function snapshot(
  positions: readonly ParticipantPosition[],
  simulationTimeSeconds = 100,
): SimulationSnapshot {
  return { simulationTimeSeconds, positions };
}

describe('marker style boundary examples', () => {
  it('keeps a non-longest marker opaque before finish and translucent at and after finish', () => {
    const markers = buildMarkerDescriptors(snapshot([
      position('short', 'Short Runner', 100, 0.99),
      position('longest', 'Longest Runner', 200, 0.5),
    ]));

    expect(markers[0].style).toEqual({ opacity: 1, colour: 'default' });

    const exactFinishMarkers = buildMarkerDescriptors(snapshot([
      position('short', 'Short Runner', 100, 1),
      position('longest', 'Longest Runner', 200, 0.5),
    ], 100));
    expect(exactFinishMarkers[0].style).toEqual({ opacity: 0.35, colour: 'default' });

    const afterFinishMarkers = buildMarkerDescriptors(snapshot([
      position('short', 'Short Runner', 100, 1),
      position('longest', 'Longest Runner', 200, 0.75),
    ], 150));
    expect(afterFinishMarkers[0].style).toEqual({ opacity: 0.35, colour: 'default' });
  });

  it('highlights every participant tied for the greatest finish duration', () => {
    const markers = buildMarkerDescriptors(snapshot([
      position('longest-a', 'Longest A', 200, 0.25),
      position('longest-b', 'Longest B', 200, 1),
      position('short', 'Short Runner', 100, 1),
    ], 250));

    expect(markers[0].style).toEqual({ opacity: 1, colour: 'bright-yellow' });
    expect(markers[1].style).toEqual({ opacity: 1, colour: 'bright-yellow' });
    expect(markers[2].style).toEqual({ opacity: 0.35, colour: 'default' });
  });

  it('gives bright-yellow highlighting precedence over finished translucency', () => {
    const [marker] = buildMarkerDescriptors(snapshot([
      position('longest', 'Finished Longest Runner', 200, 1),
      position('short', 'Short Runner', 100, 1),
    ], 250));

    expect(marker.style).toEqual({ opacity: 1, colour: 'bright-yellow' });
  });
});

describe('marker styling preserves popup fields and safe names', () => {
  it('preserves popup values and renders markup-looking names as text', () => {
    const displayName = '<img src=x onerror=alert(1)>';
    const model = buildVisualizationRenderModel(snapshot([
      position('unsafe', displayName, 3_725, 1),
    ], 75));
    const [marker] = model.markers;
    const popup = createParticipantPopupContent(marker);

    expect(marker.displayName).toBe(displayName);
    expect(marker.finishDurationSeconds).toBe(3_725);
    expect(marker.simulationTimeSeconds).toBe(75);
    expect(popup.textContent).toBe(
      `Participant: ${displayName}Finish time: 1:02:05Simulation time: 1:15`,
    );
    expect(popup.querySelector('img')).toBeNull();
    expect(popup.innerHTML).toContain('&lt;img');
  });
});
