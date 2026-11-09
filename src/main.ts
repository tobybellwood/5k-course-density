import { AppController } from './app/AppController';
import { createDomView } from './app/domView';
import { InputCoordinator } from './app/inputCoordinator';
import type { ApplicationState } from './app/types';
import { LeafletMapView } from './map/LeafletMapView';
import { PlaybackController } from './playback/PlaybackController';
import './styles.css';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

/** Compose the browser adapters around the static application services. */
export async function bootstrapApplication(
  document: Document = globalThis.document,
): Promise<void> {
  const root = document.getElementById('app');
  if (root === null) {
    return;
  }

  const appController = new AppController();
  const domView = createDomView(root);
  const inputCoordinator = new InputCoordinator({ controller: appController });
  let mapView: LeafletMapView | null = null;
  let renderedCourse = appController.state.course;
  let renderedSnapshot = appController.state.snapshot;
  let renderedDensitySettings = appController.state.densitySettings;
  let renderedShowFinisherNumbers = appController.state.showFinisherNumbers;
  let mapNotice: string | null = null;

  try {
    mapView = new LeafletMapView('map', {
      densitySettings: appController.state.densitySettings,
      layerVisibility: appController.state.layers,
    });
  } catch (error) {
    mapNotice = `The map could not be initialized. Parser and playback status remain available. ${errorMessage(error, 'Unknown map initialization error.')}`;
  }

  let mapResizeFrame: number | null = null;
  const scheduleMapResize = (): void => {
    if (mapView === null) {
      return;
    }

    const resize = (): void => {
      mapResizeFrame = null;
      mapView?.map.invalidateSize({ pan: false });
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
      if (mapResizeFrame !== null && typeof globalThis.cancelAnimationFrame === 'function') {
        globalThis.cancelAnimationFrame(mapResizeFrame);
      }
      mapResizeFrame = globalThis.requestAnimationFrame(resize);
      return;
    }

    resize();
  };

  const mapRegion = document.getElementById('map-region');
  const mapResizeObserver = mapRegion !== null && typeof ResizeObserver === 'function'
    ? new ResizeObserver(scheduleMapResize)
    : null;
  mapResizeObserver?.observe(mapRegion as HTMLElement);
  document.defaultView?.addEventListener('resize', scheduleMapResize);

  const renderState = (state: ApplicationState): void => {
    domView.render(state);

    if (mapView === null) {
      if (mapNotice !== null) {
        domView.renderNotice(mapNotice);
      }
      return;
    }

    try {
      if (state.course !== renderedCourse) {
        renderedCourse = state.course;
        if (state.course === null) {
          mapView.routeLayerGroup.clearLayers();
        } else {
          mapView.renderCourse(state.course);
        }
      }
      const snapshotChanged = state.snapshot !== renderedSnapshot;
      const densitySettingsChanged = state.densitySettings.gridSizeMeters !== renderedDensitySettings.gridSizeMeters
        || state.densitySettings.minimumPeoplePerCircle !== renderedDensitySettings.minimumPeoplePerCircle
        || state.densitySettings.warningColourThreshold !== renderedDensitySettings.warningColourThreshold;
      const finisherNumbersChanged = state.showFinisherNumbers !== renderedShowFinisherNumbers;
      if (snapshotChanged) {
        mapView.renderSnapshotOrClear(state.snapshot, state.showFinisherNumbers);
        renderedSnapshot = state.snapshot;
      } else {
        if (finisherNumbersChanged && state.snapshot !== null) {
          mapView.renderMarkerPresentation(state.snapshot, state.showFinisherNumbers);
        }
        if (densitySettingsChanged) {
          if (state.snapshot !== null) {
            mapView.renderDensity(state.snapshot, state.densitySettings);
          } else {
            mapView.setDensitySettings(state.densitySettings);
          }
        }
      }
      renderedShowFinisherNumbers = state.showFinisherNumbers;
      renderedDensitySettings = state.densitySettings;
      mapView.syncLayerVisibility(state.layers);
    } catch (error) {
      mapNotice = `The map could not render the current input. Parser and playback status remain available. ${errorMessage(error, 'Unknown map rendering error.')}`;
      domView.renderNotice(mapNotice);
    }
  };

  appController.subscribe(renderState);
  renderState(appController.state);
  scheduleMapResize();

  const playbackController = new PlaybackController(appController);
  domView.bind({
    onCourseFileSelected: async (file) => {
      try {
        await inputCoordinator.replaceCourseFile(file);
      } catch (error) {
        renderState(appController.state);
        domView.renderNotice(`The course file could not be loaded. ${errorMessage(error, 'Unknown file error.')}`);
      }
    },
    onResultsFileSelected: async (file) => {
      try {
        await inputCoordinator.replaceResultsFile(file);
      } catch (error) {
        renderState(appController.state);
        domView.renderNotice(`The results file could not be loaded. ${errorMessage(error, 'Unknown file error.')}`);
      }
    },
    onResetExample: async () => {
      try {
        renderState(appController.state);
        domView.renderNotice('Loading the bundled course and results example…');
        await inputCoordinator.resetToExample(root);
        renderState(appController.state);
      } catch (error) {
        renderState(appController.state);
        domView.renderNotice(`The bundled example could not be loaded. ${errorMessage(error, 'Unknown example error.')}`);
      }
    },
    onStartPlayback: () => {
      playbackController.start();
    },
    onPausePlayback: () => {
      playbackController.pause();
    },
    onResetPlayback: () => {
      playbackController.reset();
    },
    onMarkersVisibilityChange: (visible) => {
      appController.setLayerVisibility('markers', visible);
    },
    onDensityVisibilityChange: (visible) => {
      appController.setLayerVisibility('density', visible);
    },
    onShowFinisherNumbersChange: (visible) => {
      appController.setShowFinisherNumbers(visible);
    },
    onDensitySettingsChanged: (settings) => {
      appController.updateDensitySettings(settings);
    },
  });

  try {
    renderState(appController.state);
    domView.renderNotice('Loading the bundled course and results example…');
    await inputCoordinator.loadBundledExamples(root);
    renderState(appController.state);
  } catch (error) {
    renderState(appController.state);
    domView.renderNotice(`The bundled example could not be loaded. ${errorMessage(error, 'Unknown example error.')}`);
  }
}

void bootstrapApplication();
