# Implementation Plan: Course Density Visualization

## Overview

Build the static Vite/TypeScript browser application described in the design. The implementation proceeds from project and domain foundations through transactional application state, Leaflet rendering, playback, and browser wiring. Domain modules remain pure so parsing, timing, geometry, simulation, and density behavior can be tested independently from the browser and map APIs.

## Tasks

- [x] 1. Scaffold the static TypeScript application and bundled example inputs
  - [x] 1.1 Create the Vite project structure, TypeScript configuration, package scripts, and dependencies for Leaflet, MapLibre GL, `@maplibre/maplibre-gl-leaflet`, Vitest, fast-check, and browser integration testing.
    - Define the source directories and test configuration described in the design.
    - Include Leaflet and MapLibre styles and configure the MapLibre worker through a Vite-emitted `?worker&url` asset.
    - Keep the production build suitable for static hosting with no server-side runtime, API key, or root-relative MapLibre asset URL.
    - _Requirements: 5.5, 10.1, 10.7, 10.8_
  - [x] 1.2 Copy the supplied GPX and saved results HTML into `public/examples` and create the initial `index.html` shell with control, status, notice, and map-region containers.
    - Use the bundled example paths rather than depending on workspace-root files at runtime.
    - Include labels and stable element hooks needed by the later DOM view and browser tests.
    - _Requirements: 1.1, 3.7, 4.1_
  - [x] 1.3 Add a static-build smoke test that verifies the Vite output includes the application, both example assets, required MapLibre CSS, and an emitted MapLibre worker asset.
    - Confirm the built app can operate without a server-side parsing service.
    - Verify generated application, example, stylesheet, and worker URLs can be resolved below a GitHub Pages-style project path rather than from the domain root.
    - _Requirements: 1.1, 5.5, 10.7, 10.8_

- [x] 2. Implement shared domain models and validation utilities
  - [x] 2.1 Define the TypeScript data models, parser result unions, validation reasons, and application-facing validation summary helpers.
    - Implement the `Coordinate`, `TrackPoint`, `CourseTrack`, participant, snapshot, density-cell, and `ApplicationState` types from the design.
    - Ensure invalid numeric coordinates, durations, empty IDs, and negative times cannot enter the domain APIs.
    - _Requirements: 1.5, 2.2, 3.6, 5.3_
  - [x] 2.2 Implement validation-summary aggregation and notice formatting for excluded-row counts, reason categories, retained prior input, unsupported types, and file-read failures.
    - Keep successful valid data and validation metadata separate so a failed replacement can leave derived state untouched.
    - _Requirements: 1.6, 1.8, 5.2, 5.3, 5.4_
  - [x] 2.3 Write unit tests for validation reason aggregation, empty summaries, and specific notices for failed replacements.
    - Cover malformed input, no-valid-records, unsupported-file-type, and file-read-failure cases.
    - _Requirements: 1.6, 1.8, 5.2, 5.3, 5.4_

- [x] 3. Implement duration parsing, geometry, and GPX parsing
  - [x] 3.1 Implement strict `MM:SS` and `H:MM:SS` duration parsing with whole-second output and typed invalid/non-positive failures.
    - Trim surrounding whitespace, require integer components, enforce seconds from 0 through 59, and reject zero or negative durations.
    - _Requirements: 2.1, 2.2_
  - [x] 3.2 Write the duration parser property test.
    - **Property 2: Supported duration strings round-trip to exact seconds**
    - **Validates: Requirements 2.1**
    - Generate valid hour/minute/second values and assert exact whole-second results, including boundary components.
  - [x] 3.3 Implement haversine distance, route bounds, cumulative-distance calculation, and distance-based coordinate interpolation.
    - Preserve repeated points, handle zero-distance routes, skip zero-length interpolation segments, clamp fractions, and return exact endpoints.
    - _Requirements: 1.5, 2.4, 2.5, 2.6, 2.7_
  - [x] 3.4 Implement the GPX parser with XML parser-error handling, ordered `trkseg trkpt` extraction, finite coordinate/range validation, invalid-point reason counts, and minimum-point validation.
    - Return typed parse results without throwing expected validation failures.
    - _Requirements: 1.4, 1.5, 1.6_
  - [x] 3.5 Write GPX and geometry property tests.
    - **Property 1: GPX parsing preserves ordered geometry and distance invariants**
    - **Validates: Requirements 1.4, 1.5**
    - Generate multiple segments, repeated coordinates, and varied valid routes; compare cumulative distances with the documented tolerance.
  - [x] 3.6 Write unit and edge-case tests for malformed XML, invalid coordinate attributes, fewer than two usable points, repeated points, zero-distance routes, and endpoint interpolation.
    - _Requirements: 1.6, 2.4, 2.6, 2.7_

- [x] 4. Implement results parsing and participant normalization
  - [x] 4.1 Implement the results parser for the saved 62 people table and fallback ordinary tables.
    - Prefer `.Results-table-row`, compact name, and event-time cells; map ordinary table headers containing name/parkrunner and time/finish.
    - Ignore scripts, styles, links, images, and detailed PB values that are not the event finish time.
    - _Requirements: 1.7, 2.1_
  - [x] 4.2 Add stable participant ID generation based on normalized row index and collision suffixes for duplicate names.
    - Preserve display names while keeping IDs unique within one parsed result set.
    - _Requirements: 1.7, 4.2_
  - [x] 4.3 Exclude rows with missing names, invalid durations, or non-positive durations and return reason counts; fail a replacement when no valid records remain.
    - Keep valid records in source order and return a typed parse result.
    - _Requirements: 1.8, 2.2, 5.3_
  - [x] 4.4 Write the results parser property tests.
    - **Property 3: Invalid result fields are excluded and categorized**
    - **Validates: Requirements 2.2**
    - **Property 11: Validation summaries aggregate excluded-row reasons**
    - **Validates: Requirements 5.3**
    - Generate invalid names and duration categories and assert no invalid participant is emitted and every category count is exact.
  - [x] 4.5 Write example tests for the supplied 62 people HTML, compact event-time selection, duplicate names, header-only tables, empty tables, and all-invalid files.
    - _Requirements: 1.7, 1.8, 2.2_

- [x] 5. Implement pure simulation and density domain services
  - [x] 5.1 Implement `simulate` and total-duration calculation.
    - Compute the maximum finish duration, clamp each participant’s route fraction, interpolate by cumulative route distance, and keep finished participants at the final point.
    - Return immutable snapshots containing one current position per valid participant.
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7_
  - [x] 5.2 Write simulation property tests.
    - **Property 4: Total duration is the maximum participant duration**
    - **Validates: Requirements 2.3**
    - **Property 5: Constant-pace simulation clamps and interpolates by route distance**
    - **Validates: Requirements 2.4, 2.5, 2.6, 2.7**
    - Generate route shapes, repeated points, participant durations, boundary times, and non-negative times; compare coordinates and fractions with the documented tolerance.
  - [x] 5.3 Implement deterministic meter-grid density aggregation and density-cell coordinate conversion.
    - Use the course-centered local projection, configurable positive grid size, cell counts, and cell-center coordinates from the design.
    - _Requirements: 4.4_
  - [x] 5.4 Write density aggregation property and edge-case tests.
    - **Property 8: Density cells equal position counts**
    - **Validates: Requirements 4.4**
    - Generate positions, duplicate coordinates, and positive grid sizes; assert per-cell counts and total count conservation.

- [x] 6. Implement transactional application state and input coordination
  - [x] 6.1 Implement application state creation and complete state transitions for initial load, successful course replacement, successful participant replacement, validation updates, layer toggles, snapshot updates, and reset-to-example.
    - Commit parsed replacements only after validation succeeds.
    - Reset simulation time and recompute total duration/snapshot for successful replacements while preserving the prior valid input and derived data on failures.
    - _Requirements: 1.2, 1.3, 3.4, 3.6, 4.6, 5.1, 5.4_
  - [x] 6.2 Implement bundled-example bootstrap and local file coordination.
    - Fetch both bundled sources in parallel using URLs derived from Vite's configured base URL; do not use root-relative `/examples/` paths.
    - Parse them in the browser, validate `.gpx`, `.html`, and `.htm` extensions, read `File.text()`, and report named file/read/type failures.
    - Keep a reset-to-example action available after replacements and verify bootstrap works at a GitHub Pages project path.
    - _Requirements: 1.1, 1.2, 1.3, 5.2, 5.4, 5.5, 10.7_
  - [x] 6.3 Write state-transition unit tests for atomic commits, failed replacement retention, replacement reset-to-zero behavior, unavailable-input playback state, layer toggles, and example reset.
    - _Requirements: 1.2, 1.3, 1.6, 1.8, 3.6, 4.6, 5.1, 5.4_

- [x] 7. Implement Leaflet map rendering and visualization models
  - [x] 7.1 Implement the marker descriptor and density render-model builders from one `SimulationSnapshot`.
    - Produce one identifiable marker descriptor per valid participant and density cells derived from the same position collection and simulation time.
    - _Requirements: 4.2, 4.4, 4.7_
  - [x] 7.2 Write render-model property tests.
    - **Property 7: Marker descriptors are one-to-one with valid participants**
    - **Validates: Requirements 4.2**
    - **Property 10: Both visual layers derive from one snapshot**
    - **Validates: Requirements 4.7**
    - Generate participant collections and snapshots, then assert one marker per participant and identical source time/coordinates across marker and density models.
  - [x] 7.3 Implement `LeafletMapView` with route polyline, fitted route bounds, a default-enabled OpenFreeMap Liberty basemap through MapLibre GL and `@maplibre/maplibre-gl-leaflet`, separate marker/density groups, marker popups, and density circles.
    - Load exactly `https://tiles.openfreemap.org/styles/liberty`, configure the Vite-emitted MapLibre worker, and keep `OpenFreeMap` plus `© OpenStreetMap contributors` visible in Leaflet map controls.
    - Add the basemap below the route, density, and marker layers; include the basemap in the default map composition without changing simulation state.
    - Rebuild marker and density contents from the same snapshot, include participant name, finish duration, and current simulation time in popups, and assign user-provided values through safe text APIs or escaped content.
    - On style, worker, adapter, or tile failure, remove or disable only the basemap, show a non-blocking notice, and preserve all existing map and application behavior.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
  - [x] 7.4 Implement marker and density visibility toggles without modifying simulation state.
    - Apply both layers by default when valid input exists and preserve time/positions when visibility changes.
    - _Requirements: 4.5, 4.6, 4.7_
  - [x] 7.5 Write Leaflet and MapLibre adapter tests with a mocked map for route fitting, default simultaneous application layers, default Liberty basemap, exact style URL, visible attribution, basemap-underlay ordering, popup content, safe participant-name rendering, visibility toggles, and isolated style/tile failure cleanup.
    - Verify a failed basemap leaves route, markers, density, playback state, status output, and layer visibility usable.
    - _Requirements: 4.1, 4.3, 4.5, 4.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [x] 8. Implement accelerated playback and synchronized status updates
  - [x] 8.1 Implement `PlaybackController` using `requestAnimationFrame`, monotonic frame timestamps, 60 simulated seconds per real second, start/pause/reset/dispose, terminal clamping, and complete-state handling.
    - Start from the current time, preserve the current snapshot on pause, emit a terminal snapshot, and stop requesting frames at total duration.
    - Keep the controller independent of Leaflet and DOM APIs except for injected clock/frame callbacks.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 8.2 Write playback clock property tests.
    - **Property 6: Playback clock uses the 60x conversion**
    - **Validates: Requirements 3.1**
    - Generate non-negative frame deltas and assert simulated-time increments equal delta multiplied by 60 before terminal clamping.
  - [x] 8.3 Write playback example and edge-case tests for starting from paused non-zero time, pause preservation, reset, missing-input controls, terminal completion, and non-monotonic timestamps.
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_
  - [x] 8.4 Connect playback snapshots to both map layers and status rendering through `AppController`.
    - On every time change, derive marker and density output from the same simulation snapshot and update current time, total time, playback state, and valid participant count.
    - _Requirements: 3.2, 3.7, 4.7_
  - [x] 8.5 Write a controller integration test that verifies one snapshot update drives marker and density rendering together and status values remain synchronized.
    - _Requirements: 3.2, 3.7, 4.7_

- [x] 9. Implement the DOM view, accessibility, responsive styling, and application entrypoint
  - [x] 9.1 Implement `domView` bindings for file inputs, playback controls, example reset, layer checkboxes, status fields, validation summary, and `aria-live` notice/status regions.
    - Disable playback controls when course or participant input is unavailable while keeping reset-to-example available.
    - Format simulation durations as `M:SS` or `H:MM:SS` and display excluded-row summaries and notices.
    - _Requirements: 3.6, 3.7, 5.2, 5.3_
  - [x] 9.2 Add responsive CSS for the header, control/status panel, two-column layout, map region, controls, notices, attribution, and accessible focus/label styling.
    - Enable the Liberty basemap by default while keeping the route, markers, and density usable on the plain map surface when network basemap data is unavailable.
    - Ensure the map controls and required OpenFreeMap/OpenStreetMap attribution remain visible at narrow widths.
    - _Requirements: 4.1, 5.5, 10.4, 10.5, 10.6_
  - [x] 9.3 Wire `main.ts` to construct the DOM view, Leaflet/MapLibre Liberty basemap view, application controller, playback controller, bundled bootstrap, and event handlers.
    - Ensure startup loads the supplied example using Vite-base-aware URLs, local replacements are transactional, reset-to-example reloads both bundled sources, and Leaflet or basemap initialization failures leave parser/status output available with a visible non-blocking notice.
    - Configure the emitted MapLibre worker and preserve route, marker, density, playback, popup, and status behavior when style or tile requests fail.
    - _Requirements: 1.1, 1.2, 1.3, 3.6, 4.1, 5.1, 5.4, 5.5, 10.1, 10.5, 10.6, 10.7, 10.8_
  - [x] 9.4 Write browser integration tests against the built static app.
    - Verify built-in startup, local GPX/results replacement, failed replacement retention, playback controls and status, route/markers/density display, default Liberty basemap, required attribution, basemap-underlay ordering, popup content, layer toggles, and reset-to-example.
    - Intercept successful and failed style/tile requests and verify graceful fallback notices, retained overlays, usable controls/status, and continued playback.
    - Verify root hosting and a GitHub Pages-style project path load JavaScript, CSS, bundled examples, and the MapLibre worker without root-relative asset requests or 404s.
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.8, 3.2, 3.3, 3.4, 3.5, 3.7, 4.1, 4.2, 4.3, 4.5, 4.6, 5.1, 5.2, 5.4, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

- [x] 10. Implement configurable density settings and live visualization updates
  - [x] 10.1 Add density settings models, defaults, validation, and browser-session storage.
    - Define `DensitySettings` with Grid Size values 10, 25, 50, and 100 meters, a whole-number minimum of at least 1, and a nullable warning threshold.
    - Initialize defaults to 25 meters, minimum 1, and disabled warning threshold; restore only valid settings from the current browser session and fall back safely when storage is unavailable or invalid.
    - Preserve the previous valid setting when an edit violates a range, type, or cross-field validation rule and return a specific validation reason.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6_

  - [x] 10.2 Update deterministic density aggregation, filtering, and colouring for `DensitySettings`.
    - Use the selected meter grid size for cell quantization and retain cells with counts greater than or equal to the minimum filter.
    - Assign stable normal low/medium/high colours and apply the warning colour for counts greater than or equal to an enabled warning threshold.
    - Return stable cell ordering and preserve exact count conservation for repeated inputs.
    - _Requirements: 6.8, 6.9, 6.10_

  - [x] 10.3 Wire settings changes through application state and map rendering without resetting playback.
    - Add settings to the application state and expose a setting-update transition that validates, stores, and recomputes density from the current snapshot.
    - Update the current density layer immediately while preserving Simulation Time, Playback State, and Participant Positions during paused and running playback.
    - Keep marker output unchanged when only density settings change.
    - _Requirements: 6.5, 6.6, 6.8, 6.9, 6.10_

  - [x] 10.4 Add accessible density controls, status text, legend, validation notices, and responsive layout support.
    - Add keyboard-accessible labeled controls for the four grid sizes, minimum count, and an explicit disabled warning-threshold option.
    - Display active settings and warning state in the status region and explain normal, warning, and filtered-cell behavior in the legend.
    - Keep controls, notices, legend, and map usable at narrow widths without obscuring playback controls.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.7_

  - [x]* 10.5 Write property tests for settings validation and density boundaries.
    - **Property 12: Density settings validation preserves the cross-field invariant**
    - **Validates: Requirements 6.2, 6.3, 6.4**
    - **Property 13: Minimum filter uses inclusive count boundaries**
    - **Validates: Requirements 6.8, 6.9**
    - **Property 14: Warning threshold uses an inclusive colour boundary**
    - **Validates: Requirements 6.4, 6.10**
    - **Property 15: Density aggregation and colouring are deterministic**
    - **Validates: Requirements 6.8, 6.9, 6.10**
    - Run each property with at least 100 generated cases and include the design-property tag in each test.

  - [x]* 10.6 Write unit tests for defaults, invalid edits, session restoration, and immediate state updates.
    - Cover default values, explicit disabled threshold, every supported grid size, rejected threshold equality and below-minimum values, invalid minimum values, and retained prior settings.
    - Verify accepted changes update density immediately without changing simulation time, playback state, participant positions, or marker descriptors.
    - Verify browser-session restoration and fallback behavior without testing persistence across visits.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x]* 10.7 Write browser integration tests for accessible controls, status/legend behavior, responsive layout, and playback preservation.
    - Verify keyboard operation and accessible names, active setting/status text, warning legend changes, and filtered-cell messaging.
    - Change settings while paused and running, then verify playback time and state continue unchanged and density updates immediately.
    - Verify the controls and legend remain usable at a narrow viewport and that session settings do not become defaults in a new browser context.
    - _Requirements: 6.5, 6.6, 6.7_

- [x] 11. Final checkpoint - Ensure all density-setting tests pass
  - Run the focused unit, property, mocked Leaflet, and browser integration suites for density settings with single-run commands.
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement snapshot-derived participant marker emphasis
  - [x] 12.1 Extend the marker render models and descriptor builder with snapshot-derived style fields.
    - Compute the greatest `finishDurationSeconds` from the current `SimulationSnapshot`, including all tied maxima.
    - Assign default opacity 1 before finish, opacity 0.35 at or after `routeFraction` 1 for non-longest participants, and bright-yellow style with opacity 1 for every longest finisher.
    - Keep style derivation immutable and separate from simulation, density, playback, and application-state transitions.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 12.2 Apply marker styles in the Leaflet adapter without changing popup behavior.
    - Map the bright-yellow style to the fixed `#ffff00` visual treatment and apply finished opacity 0.35 only when longest-finisher precedence does not apply.
    - Rebuild styles from every current snapshot while preserving marker popup fields, safe participant-name text rendering, density layers, and existing layer visibility behavior.
    - Do not add marker-style controls or settings; styling remains enabled by default.
    - _Requirements: 7.5, 7.7, 7.8_

  - [x]* 12.3 Write unit and property tests for marker style boundaries and longest-finisher rules.
    - **Property 16: Marker opacity follows the finish boundary**
    - **Validates: Requirements 7.1, 7.2**
    - **Property 17: Longest-finisher highlighting covers ties and the full playback**
    - **Validates: Requirements 7.3, 7.4**
    - **Property 18: Longest-finisher highlighting takes precedence over finished translucency**
    - **Validates: Requirements 7.5**
    - **Property 19: Marker styling is a snapshot-only render transformation**
    - **Validates: Requirements 7.6, 7.7**
    - Run each property with at least 100 generated cases and add focused examples for before-finish, exact-finish, after-finish, tied durations, and precedence.

  - [x]* 12.4 Write mocked-map and browser integration tests for rerendering and unchanged state.
    - Verify a later SimulationSnapshot updates marker styles while preserving simulation time, participant positions, density output, playback state, and marker visibility.
    - Verify marker popups retain finish duration, current simulation time, and safe display-name rendering when names contain markup characters.
    - Verify default startup enables the styling behavior and exposes no new marker-style settings.
    - _Requirements: 7.5, 7.6, 7.7, 7.8_

- [x] 13. Checkpoint - Ensure all participant-marker styling tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement the default-off finisher-number presentation switch
  - [x] 14.1 Add `showFinisherNumbers` to application-facing state and marker render models.
    - Initialize the switch to `false` without session persistence.
    - Compute each participant's stable one-based competition rank as `1 +` the count of records with a strictly shorter finish duration.
    - Keep ranks keyed by stable participant ID and independent of snapshot order, Simulation Time, and marker position.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.11_
  - [x] 14.2 Extend the Leaflet marker adapter with default and finisher-number icons.
    - Replace each marker icon with its numeric rank only when the switch is enabled.
    - Preserve marker coordinates, opacity, bright-yellow longest-finisher treatment, popup fields, marker visibility, and density output when icon presentation changes.
    - Render rank text through safe DOM text APIs and keep participant popup names safe from markup injection.
    - _Requirements: 8.5, 8.6, 8.7, 8.10_
  - [x] 14.3 Add the accessible DOM switch, status text, and responsive styling.
    - Provide an explicit `Show finisher numbers` label, keyboard operation, visible on/off status, and default-off behavior.
    - Keep the switch, label, status, playback controls, density controls, and map usable without clipping at narrow widths.
    - Treat toggling as a presentation-only update that does not reset or advance playback.
    - _Requirements: 8.1, 8.5, 8.8, 8.9_

- [x] 15. Test finisher-number ranking and presentation behavior
  - [x] 15.1 Write unit and property tests for default-off and enabled marker icon states, unique ranks, tied competition ranks, rank stability across snapshot rerenders, and longest-finisher precedence.
    - Include examples for unique durations and the `1, 2, 2, 4` tie sequence.
    - Verify every property runs with at least 100 generated cases and uses the required feature/property tag format.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7, 8.11_
  - [x] 15.2 Write mocked-map tests for presentation-only updates.
    - Toggle the switch on and off and verify only icon presentation changes while marker position, opacity, bright-yellow styling, density, popup content, Simulation Time, Playback State, and simulation state remain unchanged.
    - Verify numeric rank icons and popup names remain safely text-rendered.
    - _Requirements: 8.5, 8.6, 8.7, 8.10, 8.11_
  - [x] 15.3 Write browser integration tests for the switch and responsive behavior.
    - Verify the switch is present, labeled, keyboard accessible, off by default, reflected in status text, and usable on a narrow viewport.
    - Toggle it during paused and running playback, then verify playback time/state, positions, density, opacity, longest-finisher styling, and popup content are preserved.
    - Verify later snapshot rerenders retain the same ranks and that turning the switch off restores default icons.
    - _Requirements: 8.1, 8.5, 8.6, 8.8, 8.9, 8.11_

- [x] 16. Checkpoint - Ensure all finisher-number switch tests pass
  - Run the focused unit, property, mocked-map, and browser integration suites for finisher-number presentation behavior.
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Implement the full-HD desktop layout and UI composition
  - [ ] 17.1 Add semantic layout hooks for the desktop control rail and right-hand map/viewing region.
    - Keep the header, input controls, playback controls, status, density controls, notices, and density legend grouped in the left rail without changing their accessible labels, focus behavior, or live-region semantics.
    - Keep the map region as a distinct sibling viewing area.
    - _Requirements: 9.1, 9.2, 9.6_
  - [ ] 17.2 Add full-viewport desktop layout styling and preserve the responsive fallback.
    - At the full-HD desktop breakpoint, use the full viewport height, allocate approximately 20 percent width to the vertically scrollable control rail, and let the map fill the remaining approximately 80 percent without an unnecessary page max-width.
    - Preserve the existing stacked narrow-viewport layout, readable controls, visible focus states, and no-horizontal-overflow behavior.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_
  - [ ] 17.3 Ensure map sizing follows the final desktop layout dimensions.
    - Invalidate or recalculate the Leaflet map size after the desktop rail and map region have their final dimensions, without changing simulation or layer state.
    - _Requirements: 9.3, 9.8_

- [ ] 18. Test the full-HD desktop layout and responsive regressions
  - [ ] 18.1 Add browser integration coverage at a 1920 by 1080 viewport.
    - Verify the full-height composition, approximately 20/80 control-rail and map geometry, map fill of the available right-hand area, visible controls/status/notices/density content, vertical rail scrolling when needed, no horizontal overflow, and no overlap or clipping.
    - Verify accessible labels and visible focus states remain available in the desktop arrangement.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [ ] 18.2 Add narrow-viewport regression coverage below the desktop breakpoint.
    - Verify the layout stacks controls above the map, remains usable without horizontal overflow or clipping, and preserves simulation and control state when the viewport changes.
    - _Requirements: 9.7, 9.8_

- [ ] 19. Checkpoint - Ensure all full-HD layout tests pass
  - Run the focused browser integration tests for full-HD geometry, map fill, control-rail scrolling and visibility, no horizontal overflow, and narrow-viewport fallback.
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 20. Implement the OpenFreeMap Liberty basemap and project-path-safe MapLibre assets
  - [x] 20.1 Add MapLibre runtime dependencies and Vite worker/style configuration.
    - Add `maplibre-gl` and `@maplibre/maplibre-gl-leaflet` while retaining Leaflet.
    - Import the MapLibre stylesheet and configure `setWorkerUrl` from the Vite-emitted `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` asset.
    - Verify the worker and CSS URLs are emitted below the configured project base path and do not use root-relative URLs.
    - _Requirements: 10.1, 10.7, 10.8_
  - [x] 20.2 Integrate the default OpenFreeMap Liberty basemap into the Leaflet map. (Depends on 7.3.)
    - Load exactly `https://tiles.openfreemap.org/styles/liberty` through `@maplibre/maplibre-gl-leaflet`.
    - Enable the basemap by default, register `OpenFreeMap` and `© OpenStreetMap contributors` in the Leaflet attribution controls, and place the basemap below route, density, and marker layers.
    - Preserve application state, layer visibility, route fitting, and popup behavior when the basemap is enabled.
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  - [x] 20.3 Add graceful basemap failure handling.
    - Handle Liberty style, MapLibre worker, adapter, and representative tile failures with a visible non-blocking notice.
    - Remove or disable only the failed basemap and preserve route, markers, density, playback, popups, parser output, status controls, and current layer visibility on the plain map surface.
    - _Requirements: 10.5, 10.6_
  - [ ] 20.4 Make bundled asset URLs Vite-base and GitHub Pages safe. (Depends on 6.2.)
    - Replace root-relative bundled-example requests and any root-relative MapLibre worker or generated asset references with Vite-base-aware URLs.
    - Verify both root hosting and a project-prefix deployment such as `/5k-course-density/` request JavaScript, CSS, examples, and the worker below the active prefix without 404s.
    - _Requirements: 5.5, 10.7, 10.8_

- [ ] 21. Test Liberty basemap and static deployment behavior
  - [ ] 21.1 Add unit and mocked-map/adapter coverage for the default basemap.
    - Verify the exact Liberty style URL, default enablement, visible OpenFreeMap/OpenStreetMap attribution, basemap-underlay ordering, and preservation of route/marker/density layers.
    - Verify style, worker, adapter, and tile failure cleanup removes only the basemap and leaves application state unchanged.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
  - [ ] 21.2 Add browser integration coverage for basemap success and graceful fallback.
    - Intercept successful style and tile requests to verify default basemap, attribution, overlay ordering, route/marker/density visibility, and continued playback.
    - Block the style request and separately simulate tile failure to verify a visible non-blocking notice, no fatal error, retained overlays and controls, and unchanged simulation state.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
  - [ ] 21.3 Extend static-build coverage for project-path asset URLs.
    - Serve or inspect the production build at `/` and `/5k-course-density/` and verify JavaScript, CSS, bundled examples, MapLibre CSS, and the emitted worker resolve below the active prefix.
    - Assert that no root-relative example, worker, stylesheet, or generated map-asset request is required.
    - _Requirements: 1.1, 5.5, 10.7, 10.8_

- [ ] 22. Checkpoint - Ensure Liberty basemap and project-path tests pass
  - Run the focused unit, mocked-map, static-build, and browser suites for default basemap enablement, attribution, layer ordering, failure fallback, and project-path asset resolution.
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and may be skipped for a faster MVP, but they document the required validation coverage.
- Each implementation task builds on earlier domain or application wiring and references the acceptance criteria it satisfies.
- Property tests are included for every correctness property in the design; each property is named and mapped to its requirements.
- The density-setting tasks preserve current defaults while adding live, session-scoped configuration and cover both pure density behavior and browser accessibility.
- Finished-marker styling is a default render concern, not a user setting; task 12 keeps it derived from snapshots and separate from density/state transitions.
- Marker-style tests cover before-finish, exact-finish, after-finish, longest-finisher highlighting, ties, precedence, rerender updates, unchanged state/density, popup preservation, and safe names.
- Finisher-number switch tasks keep ranking as a stable presentation concern: the switch defaults off, uses competition ranking, preserves existing marker and simulation state, and does not persist across sessions.
- Finisher-number tests cover unique and tied rankings, default and enabled icons, longest-finisher precedence, playback preservation, popup and safe-text behavior, snapshot rerenders, keyboard access, status text, and narrow layouts.
- Browser tests use a fresh browser context when verifying that settings do not persist across visits.
- Browser integration tests cover Leaflet, file inputs, playback controls, and static-app behavior that pure domain tests cannot cover.
- Full-HD layout tests use a deterministic 1920 by 1080 viewport to verify the approximately 20/80 control-rail and map geometry, map fill, rail scrolling and visibility, no horizontal overflow, accessible focus behavior, and narrow-viewport fallback. Layout work remains a view-level concern and must preserve simulation state; the layout checkpoint is validation-only and is excluded from the dependency graph.
- OpenFreeMap Liberty basemap tasks keep the external style default-enabled but treat style, worker, adapter, and tile failures as isolated view failures; the route, markers, density, playback, and status remain usable without the basemap.
- MapLibre worker and generated-asset tests must exercise a GitHub Pages-style project prefix and reject root-relative URLs.
- Checkpoint tasks are validation points only and are not included in the dependency graph.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.1", "3.3"] },
    { "id": 2, "tasks": ["1.3", "2.3", "3.4", "4.1", "4.2", "4.3"] },
    { "id": 3, "tasks": ["3.2", "3.5", "3.6", "4.4", "4.5", "5.1", "5.3"] },
    { "id": 4, "tasks": ["5.2", "5.4", "6.1", "7.1"] },
    { "id": 5, "tasks": ["6.2", "7.2", "7.3", "8.1"] },
    { "id": 6, "tasks": ["6.3", "7.4", "7.5", "8.2", "8.3", "9.1", "9.2"] },
    { "id": 7, "tasks": ["8.4", "8.5", "9.3"] },
    { "id": 8, "tasks": ["9.4"] },
    { "id": 9, "tasks": ["10.1"] },
    { "id": 10, "tasks": ["10.2"] },
    { "id": 11, "tasks": ["10.3", "10.4"] },
    { "id": 12, "tasks": ["10.5", "10.6"] },
    { "id": 13, "tasks": ["10.7"] },
    { "id": 14, "tasks": ["12.1"] },
    { "id": 15, "tasks": ["12.2"] },
    { "id": 16, "tasks": ["12.3", "12.4"] },
    { "id": 17, "tasks": ["14.1"] },
    { "id": 18, "tasks": ["14.2", "14.3"] },
    { "id": 19, "tasks": ["15.1", "15.2", "15.3"] },
    { "id": 20, "tasks": ["16"] },
    { "id": 21, "tasks": ["17.1"] },
    { "id": 22, "tasks": ["17.2"] },
    { "id": 23, "tasks": ["17.3"] },
    { "id": 24, "tasks": ["18.1", "18.2"] },
    { "id": 25, "tasks": ["20.1"] },
    { "id": 26, "tasks": ["20.2", "20.4"] },
    { "id": 27, "tasks": ["20.3"] },
    { "id": 28, "tasks": ["21.1", "21.2", "21.3"] },
    { "id": 29, "tasks": ["22"] }
  ]
}
```
