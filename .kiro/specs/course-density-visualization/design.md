# Design Document: Course Density Visualization

## Overview

Build a static browser application with vanilla TypeScript, Vite, Leaflet, MapLibre GL, `@maplibre/maplibre-gl-leaflet`, and a small pure-function domain layer. The application loads the supplied GPX route and saved results HTML from bundled example assets, parses optional local replacements in the browser, infers participant positions using constant pace, and renders a default-enabled OpenFreeMap Liberty basemap with synchronized route, marker, and density layers during 60x playback. A default-off presentation switch can replace marker icons with stable competition-ranked finisher numbers without changing simulation behavior.

The design keeps all domain calculations independent of the map and DOM. This makes parsing, timing, interpolation, and density behavior testable without a browser while keeping file handling and Leaflet integration small. The production build is static output that can be hosted from any static file server or opened through a local development server.

## Goals and Non-Goals

### Goals

- Load the supplied `Cricket_Captains_Walk_parkrun.gpx` and `results _ Riverbank parkrun.html` as the default example.
- Allow local GPX and HTML result-file replacement without a backend.
- Preserve the previous valid input when a replacement fails.
- Simulate all valid participants with a constant-pace model.
- Render the route, individual participant markers, and an aggregate density layer together.
- Provide deterministic playback controls at exactly 60 simulated seconds per real second.
- Expose density Grid Size, Minimum People-per-Circle Filter, and optional Warning Colour Threshold settings with immediate updates.
- Keep density settings in the current browser session only and preserve the existing visualization defaults.
- Provide a default-off `Show finisher numbers` presentation switch that can replace marker icons with stable competition ranks.
- Keep parsing and simulation usable in tests without Leaflet or browser timing APIs.
- Provide a full-HD desktop composition that uses the full viewport, dedicates an approximately 20% left control rail to the application controls and status content, and gives the remaining approximately 80% to the map.
- Enable the OpenFreeMap Liberty style at `https://tiles.openfreemap.org/styles/liberty` by default through MapLibre GL and the Leaflet adapter, while preserving the existing plain-map fallback when network map data fails.
- Keep OpenFreeMap and OpenStreetMap attribution visible in the Leaflet map controls and keep all application overlays above the basemap.
- Build MapLibre workers, CSS, and other emitted assets through Vite without root-relative URLs so the application works at a GitHub Pages project path.

### Non-goals

- GPS trace reconstruction or participant-specific pacing changes.
- Server-side parsing, persistence, accounts, or uploaded-file storage.
- Live race tracking or network retrieval of result pages.
- Terrain or satellite basemap providers, custom basemap editing, a basemap API key, or a server-side tile/style proxy. The Liberty basemap may be unavailable and must then fall back to the existing plain map surface.

## Technology and Project Structure

Use TypeScript compiled by Vite into static browser assets. Use Leaflet for the geographic viewport and application vector layers, MapLibre GL for the OpenFreeMap Liberty vector style, and `@maplibre/maplibre-gl-leaflet` to attach the MapLibre basemap to the Leaflet map. Use the browser `DOMParser`, `File.text()`, `requestAnimationFrame`, and standard DOM events. Import `maplibre-gl/dist/maplibre-gl.css` and configure MapLibre's worker with Vite's emitted `?worker&url` asset; the worker URL must be derived from the build rather than written as a root-relative path. Use CSS for the responsive two-column layout, the full-height desktop control rail and map split, and status/control styling.

Suggested structure:

```text
index.html
package.json
src/
  main.ts
  app/
    AppController.ts
    domView.ts
    types.ts
  domain/
    gpxParser.ts
    resultsParser.ts
    duration.ts
    geometry.ts
    simulation.ts
    density.ts
    validation.ts
  playback/
    PlaybackController.ts
  map/
    LeafletMapView.ts
    layerModels.ts
  styles.css
public/
  examples/
    Cricket_Captains_Walk_parkrun.gpx
    results _ Riverbank parkrun.html
```

The example files should be copied or referenced from `public/examples` so Vite serves them as static assets. The original files at the workspace root are the source assets for this copy. No runtime request should depend on the original workspace path. Runtime dependencies include `leaflet`, `maplibre-gl`, and `@maplibre/maplibre-gl-leaflet`; the build must include Leaflet and MapLibre styles and the emitted MapLibre worker asset. No API key or server-side proxy is required.

## Architecture

```text
Bundled example files / local File objects
                 |
          InputCoordinator
          /               \
     GpxParser        ResultsParser
          |               |
      CourseTrack    ParticipantSet
          \               /
           ApplicationState
                  |
          SimulationEngine
                  |
            SimulationSnapshot
             /             \
     Marker descriptors   Density cells
             \             /
            LeafletMapView
                  |
        OpenFreeMap Liberty basemap
        (MapLibre GL Leaflet adapter)
                  |
        DOM status and controls

PlaybackController -- advances simulation time and publishes snapshots
```

### Application state

`ApplicationState` is the single source of truth for active inputs and derived state. Updates are produced as complete state transitions rather than by letting individual views mutate domain objects.

```ts
interface ApplicationState {
  course: CourseTrack | null;
  participants: ParticipantRecord[];
  totalDurationSeconds: number;
  simulationTimeSeconds: number;
  playback: 'running' | 'paused' | 'complete';
  layers: { markers: boolean; density: boolean };
  showFinisherNumbers: boolean;
  densitySettings: DensitySettings;
  validation: ValidationSummary;
  snapshot: SimulationSnapshot | null;
}
```

A successful course or participant replacement commits only after parsing and validation complete. The commit resets simulation time to zero, recomputes the total duration and snapshot, and requests one render. A failed replacement returns a validation update while leaving the corresponding prior input and all derived data unchanged. A valid density-setting change is a separate derived-state update: it recomputes density from the current snapshot, preserves simulation time, playback state, and participant positions, and requests one render. A finisher-number toggle is a presentation-only state transition: it updates `showFinisherNumbers`, rebuilds marker icons from the current snapshot, and preserves the snapshot, density output, simulation time, playback state, positions, opacity, longest-finisher styling, and popup fields. Invalid settings update validation notices without replacing the active settings.

`showFinisherNumbers` initializes to `false` for every browser session and is not persisted in session storage. The controller computes a stable competition rank for each participant as `1 +` the number of current records with a strictly shorter finish duration. The rank depends only on the participant records and therefore remains unchanged when snapshots rerender at different simulation times or in different marker orders.

Density settings are initialized to a 25-meter Grid Size, a Minimum People-per-Circle Filter of 1, and no Warning Colour Threshold. The controller restores valid settings from browser-session storage when available, validates the restored values, and falls back to defaults if storage is unavailable or contains invalid data. It does not use persistent storage across browser sessions.

## Components and Interfaces

### `AppController`

- Owns `ApplicationState` and coordinates input, playback, status, and view updates.
- Loads both bundled example files on startup using URLs constructed from Vite's configured `import.meta.env.BASE_URL`, never root-relative `/examples/` paths.
- Exposes reset-to-example behavior by loading the bundled sources again.
- Leaves basemap lifecycle and network failure state in the map view; a basemap failure does not mutate application inputs, simulation state, or playback state.
- Converts parser results into transactional state commits.
- Enables playback only when both a valid course and at least one participant exist.
- Validates density-setting edits, persists accepted settings for the current browser session, and recomputes density immediately without resetting playback or participant positions.
- Owns the default-off `showFinisherNumbers` presentation state and toggles marker icon rendering without invoking simulation or density transitions.
- Sends one `SimulationSnapshot` to both map layer builders for every time change.

### `GpxParser`

- Accepts GPX text and returns either a `CourseTrack` or a typed validation failure.
- Uses `DOMParser` with `application/xml`.
- Selects every `trkseg trkpt` in document order, including points from multiple segments.
- Reads finite numeric `lat` and `lon` attributes and ignores unusable points with a reason count.
- Rejects parser errors and fewer than two usable points.
- Computes cumulative route distance before returning the track.

### `ResultsParser`

- Accepts HTML text and returns `ParticipantRecord[]` plus a `ValidationSummary`.
- Parses with `DOMParser` using `text/html`, then inspects table rows.
- Uses the supplied page’s stable classes when present: `.Results-table-row`, `.Results-table-td--name`, and `.Results-table-td--time`. It first prefers the compact name/time content to avoid confusing a PB value in the detailed cell with the event result.
- Includes a small fallback column mapper for ordinary tables: find headers whose normalized text contains `name`/`parkrunner` and `time`/`finish`, then read the matching cells.
- Does not depend on remote scripts, styles, links, or images in the saved HTML.
- Excludes rows with missing names, unsupported times, or non-positive times and records reason categories.
- Requires at least one valid record for a successful replacement.

### `DurationParser`

- Parses only `MM:SS` and `H:MM:SS` after trimming surrounding whitespace.
- Requires integer components, seconds from 0 through 59, and a resulting value greater than zero.
- Returns whole seconds; malformed input returns an error category rather than throwing through the UI.

### `SimulationEngine`

- Computes total duration as the maximum participant finish duration.
- Produces immutable snapshots from a course, participant set, and simulation time.
- Maps each participant independently from elapsed time to route fraction and then to a geographic coordinate.
- Keeps finished participants at the last coordinate for all later simulation times.

### `PlaybackController`

- Uses `requestAnimationFrame` while running and a monotonic frame timestamp.
- Converts real elapsed milliseconds to simulated seconds with `deltaMs / 1000 * 60`.
- Starts at the current simulation time, pauses without modifying the snapshot, and resets to zero.
- Clamps time to total duration, emits the terminal snapshot, changes state to `complete`, and stops requesting frames.
- Provides `start`, `pause`, `reset`, and `dispose` methods. The controller does not know about Leaflet.

### Basemap integration

- Use the exact OpenFreeMap Liberty style URL `https://tiles.openfreemap.org/styles/liberty` with `maplibre-gl` and `@maplibre/maplibre-gl-leaflet`.
- Configure MapLibre's worker before creating the basemap by importing `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` and passing the emitted URL to `setWorkerUrl`. Vite owns the worker asset URL so it includes the configured base path in local and GitHub Pages builds.
- Import `maplibre-gl/dist/maplibre-gl.css` alongside Leaflet's CSS. The basemap has no API key and does not require a server-side proxy.
- Create the MapLibre-to-Leaflet basemap after the Leaflet map exists and enable it by default. Keep it in a dedicated basemap group or adapter-owned layer below the route, density, and marker groups.
- Register `OpenFreeMap` and `© OpenStreetMap contributors` with the Leaflet attribution control and keep that attribution visible while the basemap is active.
- Treat style-load, worker, adapter, and tile failures as view-level failures. Remove or disable only the basemap, show a non-blocking notice, and preserve all route, marker, density, playback, popup, and status behavior.

### `LeafletMapView`

- Creates one Leaflet map and one route polyline.
- Fits the viewport to route bounds after a successful course commit.
- Maintains separate route, marker, density, and default-enabled OpenFreeMap Liberty basemap groups.
- Adds the basemap before application overlays so route, density, and markers remain above it; marker and density visibility toggles never remove or reorder the basemap.
- Keeps attribution in Leaflet's map controls when the basemap is active and removes only the failed basemap after a style, worker, adapter, or tile error.
- Rebuilds marker and density contents from the same snapshot rather than incrementally deriving one layer from the other.
- Applies each `MarkerDescriptor.style` while creating the marker: default opacity is 1, a finished non-longest marker uses opacity 0.35, and a longest-finisher marker uses a bright-yellow visual treatment with opacity 1.
- When `showFinisherNumbers` is true, replaces each marker's default icon with a numeric icon containing the descriptor's stable competition rank. The numeric icon preserves the descriptor's opacity and bright-yellow longest-finisher treatment; when false, it uses the default icon.
- Keeps popup construction independent from marker styling so participant name, finish duration, simulation time, and safe text-node rendering remain unchanged.
- Rebuilds only marker presentation for a finisher-number toggle from the current snapshot and rank map; it does not recompute participant positions or density cells.
- Accepts the active Density Settings for density rendering and can replace only the density group when settings change, leaving route and marker layers untouched.
- Attaches a popup to each marker with participant name, finish duration, and current simulation time.
- Applies visibility toggles without changing application state outside `layers`.

### `domView`

- Binds GPX and HTML file inputs, playback buttons, reset button, layer checkboxes, the `Show finisher numbers` switch, status fields, and notice region.
- Displays simulation time, total duration, playback state, valid participant count, excluded-row summary, active density settings, finisher-number switch state, legend state, and notices.
- Sets `aria-live="polite"` on the notice, status, and density-settings summary regions.
- Gives every density control and the finisher-number switch an explicit label, keyboard operation, associated validation message or state text, and current-value text; the warning threshold exposes a keyboard-selectable disabled state.
- Keeps the finisher-number switch default-off on initialization, does not persist it across browser sessions, and keeps its label and status readable at narrow widths.
- Disables start/pause/reset playback controls when required input is missing; reset-to-example remains available.
- Never builds user-provided names through `innerHTML`; popup, status, and marker-icon values are escaped or assigned through text nodes. Numeric finisher ranks are generated values and are rendered as text rather than markup.
- Keeps the page-level layout semantic and stable: a desktop `control-rail` contains the header and all controls/status/notices, while a sibling `map-region` contains the viewing surface. Layout changes remain CSS/view concerns and do not mutate application state.
- Preserves explicit labels, keyboard operation, visible focus styles, and live-region semantics when the control rail becomes vertically scrollable or the layout switches to the narrow stacked arrangement.

## Data Models

```ts
type Coordinate = { lat: number; lon: number };

type TrackPoint = Coordinate & {
  cumulativeDistanceMeters: number;
};

type CourseTrack = {
  points: TrackPoint[];
  totalDistanceMeters: number;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
};

type ParticipantRecord = {
  id: string;
  displayName: string;
  finishDurationSeconds: number;
};

type ParticipantPosition = ParticipantRecord & {
  routeFraction: number;
  coordinate: Coordinate;
};

type MarkerStyle = {
  opacity: 1 | 0.35;
  colour: 'default' | 'bright-yellow';
};

type MarkerIcon = {
  kind: 'default' | 'finisher-number';
  rank: number | null;
};

type MarkerDescriptor = ParticipantPosition & {
  simulationTimeSeconds: number;
  style: MarkerStyle;
  finisherRank: number;
  icon: MarkerIcon;
};

type SimulationSnapshot = {
  simulationTimeSeconds: number;
  positions: ParticipantPosition[];
};

type DensitySettings = {
  gridSizeMeters: 10 | 25 | 50 | 100;
  minimumPeoplePerCircle: number;
  warningColourThreshold: number | null;
};

type DensityCell = {
  cellX: number;
  cellY: number;
  center: Coordinate;
  count: number;
  colour: 'density-low' | 'density-medium' | 'density-high' | 'warning';
};

type ValidationReason =
  | 'malformed-gpx'
  | 'insufficient-track-points'
  | 'invalid-track-point'
  | 'missing-name'
  | 'invalid-duration'
  | 'non-positive-duration'
  | 'unsupported-file-type'
  | 'file-read-failure'
  | 'no-valid-records'
  | 'invalid-density-grid-size'
  | 'invalid-density-minimum'
  | 'invalid-density-warning-threshold'
  | 'invalid-density-session-state';

type ValidationSummary = {
  notices: string[];
  excludedRows: number;
  reasonCounts: Partial<Record<ValidationReason, number>>;
};
```

Parser interfaces return explicit results so an expected invalid file does not become an uncaught exception:

```ts
type ParseResult<T> =
  | { ok: true; value: T; validation: ValidationSummary }
  | { ok: false; validation: ValidationSummary };

function parseGpx(xml: string): ParseResult<CourseTrack>;
function parseResults(html: string): ParseResult<ParticipantRecord[]>;
function parseDuration(value: string):
  | { ok: true; seconds: number }
  | { ok: false; reason: 'invalid-duration' | 'non-positive-duration' };
function simulate(course: CourseTrack, records: ParticipantRecord[], timeSeconds: number): SimulationSnapshot;
function validateDensitySettings(input: unknown, current: DensitySettings):
  | { ok: true; settings: DensitySettings }
  | { ok: false; reason: 'invalid-density-grid-size' | 'invalid-density-minimum' | 'invalid-density-warning-threshold' };
function aggregateDensity(positions: ParticipantPosition[], settings: DensitySettings, courseCenter: Coordinate): DensityCell[];
function buildMarkerDescriptors(snapshot: SimulationSnapshot, showFinisherNumbers: boolean): MarkerDescriptor[];
function finisherRank(records: ParticipantRecord[], participantId: string): number;
```

Participant IDs should be stable within one parsed result set. Use the normalized row index plus a collision suffix when names repeat. Names remain display values and are not used as unique keys.

## Algorithms

### GPX parsing and cumulative distance

1. Parse the XML and check for a parser error.
2. Query `trkseg trkpt` elements in document order.
3. Convert finite `lat` and `lon` attributes to numbers and validate latitude in `[-90, 90]` and longitude in `[-180, 180]`.
4. For each accepted point after the first, add the distance from the previous point to the running total.
5. Store the running total on each `TrackPoint`; the first point has cumulative distance `0`.
6. Compute route bounds from accepted points and reject if fewer than two points remain.

Use the haversine formula with an Earth radius of 6,371,000 meters. The route may contain repeated consecutive points; these contribute zero distance and remain in the ordered point list.

### Constant-pace participant position

For a participant with finish duration `finish` and simulation time `t`:

```text
fraction = clamp(t / finish, 0, 1)
targetDistance = fraction * course.totalDistanceMeters
```

If total route distance is positive, find the first track point whose cumulative distance is at least `targetDistance`. Interpolate between the preceding and current point using cumulative-distance ratio. If the route has zero total distance, return the first coordinate for every fraction. For a target at or beyond the route end, return the final coordinate exactly. Repeated points are skipped while searching for a non-zero interpolation segment.

This is linear interpolation in latitude/longitude over short running routes. It is sufficient for the supplied 5K course and avoids introducing a projection dependency into the domain layer.

### Density aggregation

Use a deterministic geographic grid in meters rather than a pixel-dependent screen grid. Project latitude/longitude locally around the course center:

```text
x = earthRadius * radians(lon - centerLon) * cos(radians(centerLat))
y = earthRadius * radians(lat - centerLat)
cellX = floor(x / settings.gridSizeMeters)
cellY = floor(y / settings.gridSizeMeters)
```

Validate settings before aggregation. Supported grid sizes are exactly 10, 25, 50, and 100 meters. `minimumPeoplePerCircle` is an integer at least 1. `warningColourThreshold` is either `null` or an integer strictly greater than `minimumPeoplePerCircle`. Invalid edits do not reach the aggregation function.

Group each current participant coordinate by `(cellX, cellY)` and count positions per cell. Apply the minimum filter after counting: retain counts greater than or equal to `minimumPeoplePerCircle`, and omit lower counts. Convert retained cell centers back to latitude/longitude for Leaflet circle rendering. The normal density colour is selected deterministically from the retained count relative to the current retained maximum using fixed low, medium, and high bands. When a warning threshold is enabled, counts greater than or equal to that threshold use the warning colour before normal-band colouring; counts below the threshold retain the normal colour. With no enabled threshold, no cell uses the warning colour. This makes threshold equality an explicit warning boundary.

The default `gridSizeMeters` is 25, the default minimum is 1, and the default warning threshold is `null`, preserving current behavior. A `L.circle` per retained cell is sufficient for the likely scale of a parkrun result set and keeps the implementation dependency-free beyond Leaflet.

### Participant marker styling

`buildMarkerDescriptors` derives a `MarkerStyle` for every position in the current `SimulationSnapshot`. It first finds the greatest `finishDurationSeconds` among the snapshot positions, so participants with equal greatest durations all qualify as longest finishers. The style decision follows this precedence:

1. A longest finisher receives `colour: 'bright-yellow'` and `opacity: 1`, regardless of the participant's `routeFraction`.
2. A non-longest participant with `routeFraction >= 1` receives the default colour and `opacity: 0.35`.
3. A non-longest participant with `routeFraction < 1` receives the default colour and `opacity: 1`.

The Leaflet adapter maps `bright-yellow` to the fixed colour token `#ffff00`. The adapter applies opacity and colour while creating or replacing marker layers. Finished-marker styling has no user-facing setting; it remains enabled by default. The separate `showFinisherNumbers` presentation switch controls only whether the marker icon displays a rank.

Marker style is derived during each snapshot render and does not mutate the snapshot, participant positions, simulation time, density cells, or playback state. The same snapshot continues to supply both marker descriptors and density aggregation. Re-rendering a later snapshot recomputes styles, which updates boundary and post-finish appearance without changing the simulation transition itself. Popup construction continues to consume the marker descriptor's existing display fields and DOM text nodes, so popup content and safe participant-name rendering are unchanged.

### Finisher-number icon presentation

Finisher ranks are derived from the current `ParticipantRecord[]`, not from marker positions or the current simulation time. For each participant, compute `1 + count(records where finishDurationSeconds < participant.finishDurationSeconds)`. This gives one-based competition ranking: equal durations share a rank and skipped positions follow the tie. The result is keyed by stable participant ID and is therefore unchanged by snapshot order or rerender time.

`buildMarkerDescriptors(snapshot, showFinisherNumbers)` attaches the stable `finisherRank` to every descriptor and selects `icon.kind: 'finisher-number'` only when the switch is enabled; otherwise it selects `icon.kind: 'default'`. Icon selection is a render transformation only. It must preserve the existing `MarkerStyle`, including opacity 0.35 for a finished non-longest participant and bright-yellow colour with opacity 1 for every longest finisher. A longest finisher's rank icon uses the bright-yellow treatment rather than replacing it.

The Leaflet adapter creates the finisher-number icon from a DOM element and assigns the rank with a text node or `textContent`. It never interpolates participant display names or other user-provided values into icon markup. Popup construction remains separate and continues to use safe text nodes for participant names, finish duration, and current simulation time.

When the switch changes, `AppController` updates only the presentation field and asks the map view to rebuild marker icons from the current snapshot and stable rank map. It does not call `simulate`, recompute density, alter layer visibility, advance playback, reset time, or replace popup data. The switch remains false on initialization and is not restored from session storage.

### Playback timing

On `start`, record the current `performance.now()` timestamp. On each animation frame:

```text
realDeltaSeconds = max(0, (now - previousNow) / 1000)
simulationTime += realDeltaSeconds * 60
simulationTime = min(simulationTime, totalDuration)
```

Publish one snapshot after each update. The controller stops at the terminal time and marks playback complete. The view formats seconds as `H:MM:SS` when hours are non-zero and `M:SS` otherwise.

## Data Flow

1. `AppController` constructs bundled example URLs from `import.meta.env.BASE_URL` (or an equivalent Vite base-aware URL helper) and fetches both sources in parallel during bootstrap; it never requests root-relative `/examples/` paths.
2. The map view configures the Vite-emitted MapLibre Worker Asset and attempts the default OpenFreeMap Liberty basemap while the Leaflet map is initialized.
3. Successful text responses go through `GpxParser` and `ResultsParser`.
4. The controller commits both successful values in one initial state update. If one bundled source fails, the app keeps the other successful value and shows a notice; playback remains disabled until both inputs are valid.
5. A local file input checks the extension (`.gpx` or `.html`/`.htm`) before reading. The file is read with `File.text()` and parsed in the browser.
6. A successful replacement commits only that input, resets time to zero, recomputes total duration and snapshot, and refits the map if the course changed.
7. A failed replacement updates only validation notices and preserves the prior input and snapshot.
8. Each playback tick calls `SimulationEngine`, then sends the resulting snapshot to `LeafletMapView.renderSnapshot` and `domView.renderStatus`.
9. Marker and density builders consume the same snapshot object. Layer visibility is applied after both are built and does not trigger simulation.
10. A valid density-setting event validates and stores the new settings, recomputes only the density render model from the current snapshot, and updates the map, legend, and status synchronously without invoking playback reset or advancing the clock.
11. A finisher-number switch event updates only `showFinisherNumbers`, rebuilds marker icon presentation from the current snapshot and stable ranks, and updates the switch status without invoking simulation, density aggregation, playback reset, or popup reconstruction.
12. The settings store uses browser-session storage for the validated settings object. Read failures, malformed stored values, or values that violate the cross-field threshold rule produce a notice and restore defaults; no persistent storage API is used.

## Error Handling

- Use typed parser results for malformed XML, missing points, empty tables, invalid rows, unsupported file types, and file-read failures.
- Keep the last valid `CourseTrack` and participant array until a complete replacement succeeds.
- Make notices specific: identify the file name where available, accepted type, failure reason, and whether the previous data was retained.
- Display excluded-row totals and reason categories without hiding valid rows. For example: `3 rows excluded: 2 invalid times, 1 missing name.`
- Treat an all-invalid result file as a failed replacement because it cannot produce a meaningful simulation.
- Clear transient replacement errors after the next successful replacement, but retain a compact validation summary for excluded rows in the current valid result set.
- Never allow invalid numeric coordinates, NaN durations, negative time, or an empty marker ID into the domain state.
- If Leaflet cannot initialize, show a visible map-initialization notice while leaving parser/status output available; this is a view failure, not a reason to discard valid parsed data.
- If the Liberty style, MapLibre worker, adapter, or tile request fails, show a visible non-blocking basemap notice, remove or disable only the basemap, and leave the route, markers, density, playback, popups, parser output, status controls, and current layer visibility usable on the plain map surface.
- Resolve bundled example, JavaScript, CSS, and MapLibre worker URLs from Vite's configured base path. Treat any root-relative generated asset URL as a build/deployment defect.
- Reject unsupported density grid sizes, non-integer minimum filters, non-integer warning thresholds, and warning thresholds less than or equal to the active minimum. Keep the previous valid setting and explain the accepted range or relationship in the notice.
- Treat a disabled warning threshold as a valid explicit state. If session storage is unavailable or contains invalid density settings, use the documented defaults and display a non-blocking notice.
- Keep density controls usable at narrow widths; validation notices and legend text must remain readable without obscuring playback controls or the map.
- Treat desktop layout or map-sizing failures as view notices only: leave parser and status output available, preserve valid application state, and keep the narrow stacked fallback usable.

## UI and Interaction Details

The page has a header, a control/status panel, and a map region. The control panel contains:

- GPX file input and accepted-type hint.
- Results HTML file input and accepted-type hint.
- `Start`, `Pause`, and `Reset playback` buttons.
- `Reset to built-in example` button.
- Marker and density layer checkboxes, checked by default.
- A labeled `Show finisher numbers` checkbox, unchecked by default, with status text that says whether rank icons are shown.
- Density settings controls: a labeled select for Grid Size with 10 m, 25 m, 50 m, and 100 m options; a labeled numeric input for Minimum People-per-Circle Filter with a minimum of 1; and a labeled numeric input or select for Warning Colour Threshold with an explicit `Disabled` option.
- Current time, total time, playback state, participant count, active density settings, warning-threshold state, and finisher-number switch state.
- A density legend that labels the normal low/medium/high colours, identifies the warning colour when enabled, and states that cells below the minimum filter are hidden.
- Validation summary and an `aria-live` notice region.
- Leaflet map controls with visible `OpenFreeMap` and `© OpenStreetMap contributors` attribution whenever the basemap is active; a basemap failure notice is non-blocking and does not replace the map controls.

The map always shows the route when a valid course exists. The OpenFreeMap Liberty basemap is enabled by default when its network resources load successfully, and the map always keeps `OpenFreeMap` and `© OpenStreetMap contributors` attribution in the Leaflet controls. Markers and density are both visible by default when valid participants exist. If the basemap fails, the route, markers, and density remain usable on the plain map surface. A selected marker popup reads from its own participant record and the current snapshot time, so it remains accurate after playback updates.

### Full-HD desktop layout

At the full-HD desktop breakpoint, the page uses the full viewport height rather than a centered, page-width-constrained canvas. The semantic layout has two siblings: a left `control-rail` and a right `map-region`. The control rail is approximately 20% of the viewport width and contains the header, file inputs, playback controls, status, visualization-layer controls, density settings and legend, and validation notices. The rail has a bounded height of the viewport and `overflow-y: auto`, so all controls remain reachable when their content exceeds the available height.

The map region occupies the remaining approximately 80% of the viewport width and the full available height. It has no unnecessary page-level `max-width`; the map element stretches to the region's width and height, and the Leaflet view is invalidated or resized after the final layout dimensions are established. The desktop composition must avoid horizontal overflow, overlap, clipping, and obscuring between the rail and map. Existing labels, keyboard behavior, visible focus states, and `aria-live` status and notice regions remain unchanged.

Below the desktop breakpoint, the page switches to the existing stacked arrangement with controls above the map. The stacked layout remains usable without horizontal overflow, keeps the map at a positive readable size, and does not change simulation time, playback state, participant positions, density output, or active control values when the viewport crosses the breakpoint.

## Testing Strategy

Use Vitest for unit tests and `fast-check` for property tests. Keep the domain modules free of Leaflet, `window`, and `document` so most tests execute in Node. Use a browser test runner such as Playwright for file-input, map, popup, and playback integration tests.

### Unit and example tests

Cover:

- Startup loads both bundled assets and enables the expected controls.
- Supplied Riverbank HTML selects `.Results-table-row` rows and the compact event time rather than the detailed PB value.
- Empty, header-only, malformed, and all-invalid input produces notices and preserves seeded prior state.
- Unsupported extension and forced file-read failure identify the file and accepted type.
- Start from a paused non-zero time, pause without changes, reset to zero, and complete at the final time.
- Marker popup includes display name, finish duration, and current simulation time.
- Finisher-number presentation is off by default, shows no rank icon when off, shows one unique rank for each unique finish duration when on, and produces competition ranks such as `1, 2, 2, 4` for ties.
- Finisher-number toggle and later snapshot rerenders preserve each participant's stable rank and change only marker icon presentation; marker position, opacity, bright-yellow longest-finisher styling, density output, playback state, and simulation time remain unchanged.
- Longest-finisher markers retain bright-yellow styling and opaque opacity when rank icons are enabled, including tied longest finishers.
- Marker style renders unfinished participants opaque, applies opacity 0.35 at the exact finish boundary and after finishing, highlights the longest finisher in bright yellow before and after finishing, highlights every tied longest finisher, and gives yellow precedence over finished translucency.
- Marker style recomputation on snapshot rerender changes only marker appearance; simulation time, participant positions, density output, and playback state remain unchanged.
- Route fit, simultaneous default layers, default-enabled Liberty basemap, visible attribution, application-overlay ordering, and replacement reset are tested through the Leaflet adapter with a mocked map.
- Mocked MapLibre/adapter failures for style, worker, and tile requests remove only the basemap and preserve route, markers, density, playback, popups, status, and layer visibility.
- MapLibre worker configuration uses the Vite-emitted worker URL, includes MapLibre CSS, and never emits a root-relative asset URL.
- Marker popup content and safe participant-name rendering remain unchanged when marker styles change.
- Density settings initialize to 25 m, minimum 1, and disabled warning threshold; valid edits apply immediately, invalid edits retain the prior value, and session restoration does not cross a new browser session.
- Warning threshold equality uses the warning colour, values below the threshold use normal colours, and the threshold validator rejects values equal to or below the minimum filter.
- Playback time, playback state, and participant positions remain unchanged when density settings change while paused or running.
- The finisher-number switch has an accessible label and keyboard behavior, is off by default, preserves playback while toggled on and off, keeps popup content and safe participant-name rendering intact, retains longest-finisher styling, and remains usable at a narrow viewport.
- Density controls, status text, legend labels, keyboard access, narrow layouts, and browser-session behavior are covered by browser integration tests.

### Layout and browser integration tests

Use deterministic browser viewport tests for the view-level layout because geometry depends on the rendered browser environment rather than domain inputs. At 1920 by 1080, verify that the application uses the full viewport height, the control rail is approximately 20% wide, the map region occupies the remaining approximately 80%, and the map has positive dimensions that fill the available right-hand area. Verify that the header, controls, playback controls, status, notices, density controls, and legend are visible or reachable within the vertically scrollable rail, that rail scrolling does not hide required content, and that the map and rail do not overlap, clip, or produce horizontal overflow. Verify accessible labels, focus visibility, keyboard operation, and live-region semantics in the desktop arrangement.

Resize or open the application below the desktop breakpoint and verify the existing stacked layout places controls above a usable map, preserves readable labels and focus states, has no horizontal overflow or clipped controls, and preserves simulation and control state across the layout change. These tests should exercise the built static app and should not require a new domain property.

Basemap browser coverage shall intercept the Liberty style request and representative vector-tile requests. The success path shall verify default basemap enablement, visible OpenFreeMap/OpenStreetMap attribution, basemap-underlay ordering, route/marker/density visibility, and continued playback. The failure path shall separately block style loading and simulate tile failure, then verify a visible non-blocking notice, no fatal application error, retained route/marker/density layers, usable status and controls, and unchanged simulation state. Static-build coverage shall serve the production output at both `/` and a GitHub Pages-style project prefix such as `/5k-course-density/`, verify JavaScript, CSS, bundled examples, and the emitted MapLibre worker resolve below the configured prefix, and reject root-relative asset requests.

### Property tests

Run every property with at least 100 generated cases. Each test must include a tag in this form:

```text
Feature: course-density-visualization, Property N: <property text>
```

Generators should include repeated coordinates, multiple track segments, varied route lengths, duplicate participant names, boundary times, zero/one-second components, and invalid result rows. Compare floating-point coordinates and distances with a documented tolerance such as `1e-9` degrees for interpolation and `1e-6` meters for cumulative-distance assertions.

Property tests should cover the properties below. The reflection step consolidated overlapping time-boundary rules into one simulation property, combined unfinished and finished opacity boundaries into one marker-opacity property, combined longest-finisher highlighting and tie handling into one collection property, and kept marker/density snapshot consistency and styling isolation as state-propagation properties.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system. Properties bridge the human-readable requirements and automated correctness guarantees.*

### Property 1: GPX parsing preserves ordered geometry and distance invariants

For all valid ordered GPX track-point sequences, parsing SHALL return the same usable coordinates in document order, SHALL assign cumulative distance zero to the first point, and SHALL assign each later point a cumulative distance equal to the previous cumulative distance plus the haversine distance from the previous point.

**Validates: Requirements 1.4, 1.5**

### Property 2: Supported duration strings round-trip to exact seconds

For all valid non-zero hour/minute/second values representable as `MM:SS` or `H:MM:SS`, parsing the formatted duration SHALL return the exact total number of seconds.

**Validates: Requirements 2.1**

### Property 3: Invalid result fields are excluded and categorized

For all result rows containing a missing name, unsupported duration, or non-positive duration, the results parser SHALL emit no participant record for that row and SHALL increment the corresponding validation reason count.

**Validates: Requirements 2.2**

### Property 4: Total duration is the maximum participant duration

For any non-empty collection of valid participant records, the simulation total duration SHALL equal the greatest finish duration, regardless of record order or duplicate durations.

**Validates: Requirements 2.3**

### Property 5: Constant-pace simulation clamps and interpolates by route distance

For any valid course, participant, and non-negative simulation time, the participant route fraction SHALL equal `clamp(time / finishDuration, 0, 1)`, time zero SHALL produce the first track point, times at or after finish SHALL produce the final track point, and intermediate fractions SHALL map to the coordinate at the corresponding cumulative route distance.

**Validates: Requirements 2.4, 2.5, 2.6, 2.7**

### Property 6: Playback clock uses the 60x conversion

For all non-negative real frame deltas while playback is running, the playback controller’s simulated-time increment before terminal clamping SHALL equal the real-time delta multiplied by 60.

**Validates: Requirements 3.1**

### Property 7: Marker descriptors are one-to-one with valid participants

For any valid participant collection and simulation snapshot, the marker render model SHALL contain exactly one identifiable marker descriptor per participant, and each descriptor SHALL use that participant’s current coordinate.

**Validates: Requirements 4.2**

### Property 8: Density cells equal position counts

For any collection of participant positions and any positive grid size, each density cell count SHALL equal the number of positions whose projected coordinates quantize to that cell, and the sum of all cell counts SHALL equal the number of positions.

**Validates: Requirements 4.4**

### Property 9: Layer visibility is separate from simulation state

For any valid simulation snapshot, toggling marker or density visibility any number of times SHALL change only layer visibility and SHALL leave simulation time, participant positions, and total duration unchanged.

**Validates: Requirements 4.6**

### Property 10: Both visual layers derive from one snapshot

For any valid course, participant set, and simulation time, the marker descriptors and density cells rendered for that update SHALL be derived from the same participant-position collection and simulation time.

**Validates: Requirements 4.7**

### Property 11: Validation summaries aggregate excluded-row reasons

For any collection of excluded result rows with reason categories, the validation summary’s excluded total SHALL equal the number of excluded rows and each reason count SHALL equal the number of rows assigned that reason.

**Validates: Requirements 5.3**

### Property 12: Density settings validation preserves the cross-field invariant

For any candidate density settings, validation SHALL accept the candidate only when the Grid Size is one of 10, 25, 50, or 100 meters, the Minimum People-per-Circle Filter is an integer at least 1, and the Warning Colour Threshold is disabled or an integer strictly greater than the minimum filter; invalid candidates SHALL leave the current valid settings unchanged.

**Validates: Requirements 6.2, 6.3, 6.4**

### Property 13: Minimum filter uses inclusive count boundaries

For any participant-position collection, positive grid size, and minimum filter, every retained density cell SHALL have a count greater than or equal to the filter, every omitted cell SHALL have a count less than the filter, and the count at exactly the filter boundary SHALL be retained.

**Validates: Requirements 6.8, 6.9**

### Property 14: Warning threshold uses an inclusive colour boundary

For any valid density settings with an enabled warning threshold and any retained density cell, a count greater than or equal to the threshold SHALL receive the warning colour, while a count below the threshold SHALL receive the deterministic normal density colour.

**Validates: Requirements 6.4, 6.10**

### Property 15: Density aggregation and colouring are deterministic

For any fixed Participant Positions, course center, and valid Density Settings, repeated density aggregation SHALL return identical cell coordinates, counts, filtering, colour assignments, and ordering.

**Validates: Requirements 6.8, 6.9, 6.10**

### Property 16: Marker opacity follows the finish boundary

For all valid participant snapshots, every marker with a `routeFraction` less than 1 SHALL have default opacity 1, and every non-highlighted marker with a `routeFraction` equal to or greater than 1 SHALL have opacity 0.35.

**Validates: Requirements 7.1, 7.2**

### Property 17: Longest-finisher highlighting covers ties and the full playback

For any valid participant collection and any snapshot time before, at, or after each longest participant's finish duration, every participant whose `finishDurationSeconds` equals the collection maximum SHALL have the bright-yellow style with opacity 1, including every tied maximum.

**Validates: Requirements 7.3, 7.4**

### Property 18: Longest-finisher highlighting takes precedence over finished translucency

For all valid snapshots containing a longest participant with `routeFraction` greater than or equal to 1, that participant's marker SHALL have bright-yellow style and opacity 1 rather than finished opacity 0.35.

**Validates: Requirements 7.5**

### Property 19: Marker styling is a snapshot-only render transformation

For any valid application state and current SimulationSnapshot, deriving or applying marker styles SHALL preserve Simulation Time, Participant Positions, Density Layer output, Playback State, popup fields, and safe participant-name text while changing only marker visual style fields.

**Validates: Requirements 7.6, 7.7**

### Property 20: Finisher ranks are stable competition ranks

For any non-empty valid Participant Records collection, each participant's Finisher Rank SHALL equal `1 +` the number of records with a strictly shorter Finish Duration. Equal durations SHALL receive equal ranks, unique durations SHALL receive unique ranks, and the resulting sequence SHALL follow competition ranking such as `1, 2, 2, 4` regardless of input order or participant ID order.

**Validates: Requirements 8.2, 8.3, 8.4**

### Property 21: Finisher-number presentation is isolated from simulation and marker state

For any valid application state and current SimulationSnapshot, toggling `showFinisherNumbers` SHALL change only each marker's icon kind and numeric rank presentation. It SHALL preserve marker coordinates, route fractions, opacity, colour including bright-yellow longest-finisher styling, popup fields, density cells, Simulation Time, Playback State, layer visibility, and the stable Finisher Ranks. Re-rendering a later snapshot with the same Participant Records SHALL preserve the same rank for each participant.

**Validates: Requirements 8.5, 8.6, 8.7, 8.11**


The remaining acceptance criteria are deliberately covered by example, edge-case, integration, or smoke tests rather than universal properties:

- Built-in loading: startup smoke test for 1.1.
- Local file replacement and successful derived-state reset: browser integration tests for 1.2, 1.3, and 5.1.
- Failed GPX/results replacement retention: edge-case tests for 1.6 and 1.8, plus browser state test for 5.4.
- Playback command transitions, terminal completion, unavailable-input controls, and status text: example/edge tests for 3.2 through 3.7.
- Route fitting, simultaneous default layers, and popup content: Leaflet integration tests for 4.1, 4.3, and 4.5.
- Unsupported or unreadable file notices: edge-case tests for 5.2.
- Browser-only operation: static build smoke test for 5.5.
- Density setting defaults, explicit disabled threshold, valid-option controls, live updates without playback reset, and session-only restoration: unit and browser integration tests for 6.1, 6.2, 6.5, and 6.6.
- Density setting validation and deterministic filter/colour boundaries: property tests for 6.3, 6.4, and 6.8 through 6.10, with example tests for invalid input notices.
- Accessible controls, active-setting status, legend behavior, keyboard operation, responsive layout, and browser behavior: browser integration tests for 6.7.
- Finished-marker opacity boundary, longest-finisher highlighting, tied longest finishers, highlight precedence, and snapshot-only styling: unit/property tests for 7.1 through 7.6.
- Popup preservation, safe participant names, default-enabled behavior, and absence of new marker-style controls: mocked-map and browser smoke/integration tests for 7.7 and 7.8.
- Finisher-number switch default-off behavior, accessible label and keyboard operation, status text, narrow-layout usability, safe rank and popup rendering, browser rerender behavior, and playback preservation: unit, mocked-map, and browser integration tests for 8.1, 8.5 through 8.11.

This split prevents external map behavior and one-time configuration checks from being mistaken for property-based tests while retaining direct coverage for every acceptance criterion.

## Implementation Sequence

1. Scaffold the Vite TypeScript app and copy the two supplied example files into `public/examples`.
2. Implement domain types, validation summaries, duration parsing, haversine geometry, and GPX/results parsers.
3. Implement simulation, distance-based interpolation, and density aggregation with no browser dependencies.
4. Implement application state transitions and transactional replacement handling.
5. Add Leaflet map creation, route fitting, marker popups, default and finisher-number marker icons, density circles, and layer toggles.
6. Add playback controller and connect its snapshot stream to the map and status view.
7. Add the full-height desktop control rail and map composition, responsive styles, accessible labels, the default-off finisher-number switch, notices, and example reset behavior.
8. Run unit/property tests, then browser integration tests against the built static app, including deterministic full-HD geometry and narrow-viewport layout regression checks.
