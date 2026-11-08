# Design Document: Course Density Visualization

## Overview

Build a static browser application with vanilla TypeScript, Vite, Leaflet, and a small pure-function domain layer. The application loads the supplied GPX route and saved results HTML from bundled example assets, parses optional local replacements in the browser, infers participant positions using constant pace, and renders synchronized marker and density layers during 60x playback.

The design keeps all domain calculations independent of the map and DOM. This makes parsing, timing, interpolation, and density behavior testable without a browser while keeping file handling and Leaflet integration small. The production build is static output that can be hosted from any static file server or opened through a local development server.

## Goals and Non-Goals

### Goals

- Load the supplied `onthegomap-5-km-route.gpx` and `results _ Riverbank parkrun.html` as the default example.
- Allow local GPX and HTML result-file replacement without a backend.
- Preserve the previous valid input when a replacement fails.
- Simulate all valid participants with a constant-pace model.
- Render the route, individual participant markers, and an aggregate density layer together.
- Provide deterministic playback controls at exactly 60 simulated seconds per real second.
- Expose density Grid Size, Minimum People-per-Circle Filter, and optional Warning Colour Threshold settings with immediate updates.
- Keep density settings in the current browser session only and preserve the existing visualization defaults.
- Keep parsing and simulation usable in tests without Leaflet or browser timing APIs.

### Non-goals

- GPS trace reconstruction or participant-specific pacing changes.
- Server-side parsing, persistence, accounts, or uploaded-file storage.
- Live race tracking or network retrieval of result pages.
- A terrain or satellite basemap. The route remains visible without a basemap; an optional tile layer can be enabled when network access is available.

## Technology and Project Structure

Use TypeScript compiled by Vite into static browser assets. Use Leaflet for the geographic viewport and vector layers. Use the browser `DOMParser`, `File.text()`, `requestAnimationFrame`, and standard DOM events. Use CSS for the responsive two-column layout and status/control styling.

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
    onthegomap-5-km-route.gpx
    results _ Riverbank parkrun.html
```

The example files should be copied or referenced from `public/examples` so Vite serves them as static assets. The original files at the workspace root are the source assets for this copy. No runtime request should depend on the original workspace path.

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
  densitySettings: DensitySettings;
  validation: ValidationSummary;
  snapshot: SimulationSnapshot | null;
}
```

A successful course or participant replacement commits only after parsing and validation complete. The commit resets simulation time to zero, recomputes the total duration and snapshot, and requests one render. A failed replacement returns a validation update while leaving the corresponding prior input and all derived data unchanged. A valid density-setting change is a separate derived-state update: it recomputes density from the current snapshot, preserves simulation time, playback state, and participant positions, and requests one render. Invalid settings update validation notices without replacing the active settings.

Density settings are initialized to a 25-meter Grid Size, a Minimum People-per-Circle Filter of 1, and no Warning Colour Threshold. The controller restores valid settings from browser-session storage when available, validates the restored values, and falls back to defaults if storage is unavailable or contains invalid data. It does not use persistent storage across browser sessions.

## Components and Interfaces

### `AppController`

- Owns `ApplicationState` and coordinates input, playback, status, and view updates.
- Loads both bundled example files on startup using `fetch` against the static `/examples/` paths.
- Exposes reset-to-example behavior by loading the bundled sources again.
- Converts parser results into transactional state commits.
- Enables playback only when both a valid course and at least one participant exist.
- Validates density-setting edits, persists accepted settings for the current browser session, and recomputes density immediately without resetting playback or participant positions.
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

### `LeafletMapView`

- Creates one Leaflet map and one route polyline.
- Fits the viewport to route bounds after a successful course commit.
- Maintains separate route, marker, density, and optional basemap layer groups.
- Replaces marker and density contents from the same snapshot rather than incrementally deriving one layer from the other.
- Applies each `MarkerDescriptor.style` while creating the marker: default opacity is 1, a finished non-longest marker uses opacity 0.35, and a longest-finisher marker uses a bright-yellow visual treatment with opacity 1.
- Keeps popup construction independent from marker styling so participant name, finish duration, simulation time, and safe text-node rendering remain unchanged.
- Accepts the active Density Settings for density rendering and can replace only the density group when settings change, leaving route and marker layers untouched.
- Attaches a popup to each marker with participant name, finish duration, and current simulation time.
- Applies visibility toggles without changing application state outside `layers`.

### `domView`

- Binds GPX and HTML file inputs, playback buttons, reset button, layer checkboxes, status fields, and notice region.
- Displays simulation time, total duration, playback state, valid participant count, excluded-row summary, active density settings, legend state, and notices.
- Sets `aria-live="polite"` on the notice, status, and density-settings summary regions.
- Gives every density control an explicit label, keyboard operation, associated validation message, and current-value text; the warning threshold exposes a keyboard-selectable disabled state.
- Disables start/pause/reset playback controls when required input is missing; reset-to-example remains available.
- Never builds user-provided names through `innerHTML`; popup and status values are escaped or assigned through text nodes.

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

type MarkerDescriptor = ParticipantPosition & {
  simulationTimeSeconds: number;
  style: MarkerStyle;
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

The Leaflet adapter maps `bright-yellow` to the fixed colour token `#ffff00`. The adapter applies opacity and colour while creating or replacing marker layers. No marker-style setting is added to `ApplicationState` or the DOM controls, so the behavior is enabled by default.

Marker style is derived during each snapshot render and does not mutate the snapshot, participant positions, simulation time, density cells, or playback state. The same snapshot continues to supply both marker descriptors and density aggregation. Re-rendering a later snapshot recomputes styles, which updates boundary and post-finish appearance without changing the simulation transition itself. Popup construction continues to consume the marker descriptor's existing display fields and DOM text nodes, so popup content and safe participant-name rendering are unchanged.

### Playback timing

On `start`, record the current `performance.now()` timestamp. On each animation frame:

```text
realDeltaSeconds = max(0, (now - previousNow) / 1000)
simulationTime += realDeltaSeconds * 60
simulationTime = min(simulationTime, totalDuration)
```

Publish one snapshot after each update. The controller stops at the terminal time and marks playback complete. The view formats seconds as `H:MM:SS` when hours are non-zero and `M:SS` otherwise.

## Data Flow

1. `AppController` fetches the two bundled example files in parallel during bootstrap.
2. Successful text responses go through `GpxParser` and `ResultsParser`.
3. The controller commits both successful values in one initial state update. If one bundled source fails, the app keeps the other successful value and shows a notice; playback remains disabled until both inputs are valid.
4. A local file input checks the extension (`.gpx` or `.html`/`.htm`) before reading. The file is read with `File.text()` and parsed in the browser.
5. A successful replacement commits only that input, resets time to zero, recomputes total duration and snapshot, and refits the map if the course changed.
6. A failed replacement updates only validation notices and preserves the prior input and snapshot.
7. Each playback tick calls `SimulationEngine`, then sends the resulting snapshot to `LeafletMapView.renderSnapshot` and `domView.renderStatus`.
8. Marker and density builders consume the same snapshot object. Layer visibility is applied after both are built and does not trigger simulation.
9. A valid density-setting event validates and stores the new settings, recomputes only the density render model from the current snapshot, and updates the map, legend, and status synchronously without invoking playback reset or advancing the clock.
10. The settings store uses browser-session storage for the validated settings object. Read failures, malformed stored values, or values that violate the cross-field threshold rule produce a notice and restore defaults; no persistent storage API is used.

## Error Handling

- Use typed parser results for malformed XML, missing points, empty tables, invalid rows, unsupported file types, and file-read failures.
- Keep the last valid `CourseTrack` and participant array until a complete replacement succeeds.
- Make notices specific: identify the file name where available, accepted type, failure reason, and whether the previous data was retained.
- Display excluded-row totals and reason categories without hiding valid rows. For example: `3 rows excluded: 2 invalid times, 1 missing name.`
- Treat an all-invalid result file as a failed replacement because it cannot produce a meaningful simulation.
- Clear transient replacement errors after the next successful replacement, but retain a compact validation summary for excluded rows in the current valid result set.
- Never allow invalid numeric coordinates, NaN durations, negative time, or an empty marker ID into the domain state.
- If Leaflet cannot initialize, show a visible map-initialization notice while leaving parser/status output available; this is a view failure, not a reason to discard valid parsed data.
- Reject unsupported density grid sizes, non-integer minimum filters, non-integer warning thresholds, and warning thresholds less than or equal to the active minimum. Keep the previous valid setting and explain the accepted range or relationship in the notice.
- Treat a disabled warning threshold as a valid explicit state. If session storage is unavailable or contains invalid density settings, use the documented defaults and display a non-blocking notice.
- Keep density controls usable at narrow widths; validation notices and legend text must remain readable without obscuring playback controls or the map.

## UI and Interaction Details

The page has a header, a control/status panel, and a map region. The control panel contains:

- GPX file input and accepted-type hint.
- Results HTML file input and accepted-type hint.
- `Start`, `Pause`, and `Reset playback` buttons.
- `Reset to built-in example` button.
- Marker and density layer checkboxes, checked by default.
- Density settings controls: a labeled select for Grid Size with 10 m, 25 m, 50 m, and 100 m options; a labeled numeric input for Minimum People-per-Circle Filter with a minimum of 1; and a labeled numeric input or select for Warning Colour Threshold with an explicit `Disabled` option.
- Current time, total time, playback state, participant count, active density settings, and warning-threshold state.
- A density legend that labels the normal low/medium/high colours, identifies the warning colour when enabled, and states that cells below the minimum filter are hidden.
- Validation summary and an `aria-live` notice region.

The map always shows the route when a valid course exists. Markers and density are both visible by default when valid participants exist. A selected marker popup reads from its own participant record and the current snapshot time, so it remains accurate after playback updates.

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
- Marker style renders unfinished participants opaque, applies opacity 0.35 at the exact finish boundary and after finishing, highlights the longest finisher in bright yellow before and after finishing, highlights every tied longest finisher, and gives yellow precedence over finished translucency.
- Marker style recomputation on snapshot rerender changes only marker appearance; simulation time, participant positions, density output, and playback state remain unchanged.
- Route fit, simultaneous default layers, and replacement reset are tested through the Leaflet adapter with a mocked map.
- Marker popup content and safe participant-name rendering remain unchanged when marker styles change.
- Density settings initialize to 25 m, minimum 1, and disabled warning threshold; valid edits apply immediately, invalid edits retain the prior value, and session restoration does not cross a new browser session.
- Warning threshold equality uses the warning colour, values below the threshold use normal colours, and the threshold validator rejects values equal to or below the minimum filter.
- Playback time, playback state, and participant positions remain unchanged when density settings change while paused or running.
- Density controls, status text, legend labels, keyboard access, narrow layouts, and browser-session behavior are covered by browser integration tests.

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

This split prevents external map behavior and one-time configuration checks from being mistaken for property-based tests while retaining direct coverage for every acceptance criterion.

## Implementation Sequence

1. Scaffold the Vite TypeScript app and copy the two supplied example files into `public/examples`.
2. Implement domain types, validation summaries, duration parsing, haversine geometry, and GPX/results parsers.
3. Implement simulation, distance-based interpolation, and density aggregation with no browser dependencies.
4. Implement application state transitions and transactional replacement handling.
5. Add Leaflet map creation, route fitting, marker popups, density circles, and layer toggles.
6. Add playback controller and connect its snapshot stream to the map and status view.
7. Add responsive styles, accessibility labels, notices, and example reset behavior.
8. Run unit/property tests, then browser integration tests against the built static app.
