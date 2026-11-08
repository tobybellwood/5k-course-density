# Requirements Document

## Introduction

The Course Density Visualization Tool is a static browser application for exploring congestion on a running course. The application shall load a GPX course and an HTML results table, infer each participant's course position from finish time using a constant-pace model, and animate participant locations over the course. The application shall include the supplied Riverbank parkrun example and shall support replacement with local GPX and HTML results files.

## Glossary

- **Static Visualization Tool**: The browser application that loads course and results files and presents the simulation without server-side processing.
- **GPX Parser**: The component that reads GPX XML and creates a Course Track.
- **Results Parser**: The component that reads an HTML document and creates Participant Records.
- **Course Track**: An ordered sequence of geographic Track Points connected into a route.
- **Track Point**: A GPX track point containing numeric latitude and longitude values.
- **Participant Record**: A participant display name paired with a valid Finish Duration.
- **Finish Duration**: A participant's elapsed result time, represented internally as seconds greater than zero.
- **Simulation Engine**: The component that converts Simulation Time into Participant Positions along a Course Track.
- **Simulation Time**: Elapsed event time measured in seconds from the event start.
- **Total Simulation Duration**: The greatest Finish Duration among valid Participant Records.
- **Participant Position**: A geographic coordinate inferred for a Participant Record at a specified Simulation Time.
- **Route Fraction**: A value from 0 through 1 representing progress from the first point to the final point of a Course Track by cumulative route distance.
- **Playback Controller**: The component that starts, pauses, resets, and advances Simulation Time.
- **Playback State**: The current playback condition, represented as running, paused, or complete.
- **Geographic Map**: The visual map surface on which the Course Track, Participant Marker Layer, and Density Layer are rendered.
- **Rendered Geographic Area**: A map cell or visual aggregation area used to calculate and display density.
- **Participant Marker Layer**: The map layer that displays one marker for each valid Participant Record.
- **Density Layer**: The map layer that represents the number of Participant Positions within each Rendered Geographic Area at the current Simulation Time.
- **Validation Summary**: The collection of Validation Notices and excluded-row counts produced while processing input.
- **Validation Notice**: A visible message that identifies invalid or incomplete input and describes the corrective action.
- **Density Settings**: The active Grid Size, Minimum People-per-Circle Filter, and optional Warning Colour Threshold used by the Density Layer.
- **Grid Size**: The width and height in meters of each geographic density cell; supported values are 10, 25, 50, and 100 meters.
- **Minimum People-per-Circle Filter**: The minimum participant count required for a density cell to be rendered as a circle.
- **Warning Colour Threshold**: An optional participant count at which rendered cells use the warning colour; an enabled threshold must be greater than the Minimum People-per-Circle Filter.
- **Browser Session**: The period from opening a browser context until that context is closed; Density Settings persist only within this period.
- **Marker Style**: The visual opacity and colour state applied to a Participant Marker Layer marker for the current SimulationSnapshot.
- **Finished Marker**: A participant marker whose Route Fraction is greater than or equal to 1.
- **Longest Finisher**: Every participant whose Finish Duration equals the greatest Finish Duration in the current Participant Records.
- **Bright Yellow Highlight**: The default-enabled marker colour `#ffff00` used for every Longest Finisher.
- **Show Finisher Numbers Switch**: A keyboard-accessible, default-off presentation control that replaces participant marker icons with their competition-ranked finisher numbers.
- **Finisher Rank**: A one-based competition rank calculated from ascending Finish Duration, where equal durations share a rank and later ranks include the skipped positions.

## Requirements

### Requirement 1: Load and parse input sources

**User Story:** As a race analyst, I want to load a course and a results page, so that I can inspect participant movement without preparing another data format.

#### Acceptance Criteria

1. WHEN the Static Visualization Tool first opens, THE Static Visualization Tool SHALL load the supplied `onthegomap-5-km-route.gpx` file and `results _ Riverbank parkrun.html` file as the built-in example.
2. WHEN a user selects a local GPX file, THE Static Visualization Tool SHALL send the selected file to the GPX Parser and replace the current Course Track after successful parsing.
3. WHEN a user selects a local HTML file, THE Static Visualization Tool SHALL send the selected file to the Results Parser and replace the current Participant Records after successful parsing.
4. WHEN the GPX Parser receives a GPX document, THE GPX Parser SHALL extract numeric latitude and longitude values from each `<trkpt>` element within each `<trkseg>` element in document order.
5. WHEN the GPX Parser creates a Course Track, THE GPX Parser SHALL preserve the input order of Track Points and calculate cumulative route distance between consecutive Track Points.
6. IF a GPX document is malformed or contains fewer than two usable Track Points, THEN THE GPX Parser SHALL display a Validation Notice and retain the previously loaded Course Track.
7. WHEN the Results Parser receives an HTML document, THE Results Parser SHALL inspect table rows and create a Participant Record for each row containing a participant display name and a parseable Finish Duration.
8. IF a results document contains no valid Participant Records, THEN THE Results Parser SHALL display a Validation Notice and retain the previously loaded Participant Records.

### Requirement 2: Normalize participant timing

**User Story:** As a race analyst, I want result times converted into a consistent event timeline, so that participants can be compared during playback.

#### Acceptance Criteria

1. WHEN the Results Parser reads a Finish Duration formatted as `MM:SS` or `H:MM:SS`, THE Results Parser SHALL convert the duration into whole seconds.
2. IF a results row contains a missing participant name, an unparseable Finish Duration, or a Finish Duration less than or equal to zero, THEN THE Results Parser SHALL exclude the row from Participant Records and include the row in the validation summary.
3. WHEN Participant Records contain at least one valid Finish Duration, THE Simulation Engine SHALL set total simulation duration to the greatest Finish Duration.
4. WHEN Simulation Time is zero, THE Simulation Engine SHALL assign every Participant Position to the first Track Point.
5. WHEN Simulation Time is between zero and a participant's Finish Duration, THE Simulation Engine SHALL assign the participant a Route Fraction equal to Simulation Time divided by the participant's Finish Duration.
6. WHEN Simulation Time is equal to or greater than a participant's Finish Duration, THE Simulation Engine SHALL assign the participant a Route Fraction of 1 and the final Track Point as the Participant Position.
7. WHEN the Simulation Engine converts a Route Fraction into a Participant Position, THE Simulation Engine SHALL interpolate along cumulative route distance between the two surrounding Track Points.

### Requirement 3: Run controlled playback

**User Story:** As a race analyst, I want to control an accelerated replay, so that I can identify when and where congestion forms.

#### Acceptance Criteria

1. WHEN playback is running, THE Playback Controller SHALL advance Simulation Time at 60 simulated seconds for each one real-time second.
2. WHEN playback starts, THE Playback Controller SHALL begin at the current Simulation Time and update Participant Positions and the Density Layer as Simulation Time advances.
3. WHEN a user pauses playback, THE Playback Controller SHALL stop advancing Simulation Time while preserving the current Participant Positions and Density Layer.
4. WHEN a user resets playback, THE Playback Controller SHALL set Simulation Time to zero and update every Participant Position to the first Track Point.
5. WHEN Simulation Time reaches total simulation duration, THE Playback Controller SHALL stop playback and keep each finished participant at the final Track Point.
6. WHEN valid Course Track and Participant Records are unavailable, THE Playback Controller SHALL disable playback controls and display a Validation Notice explaining the missing input.
7. WHEN the Static Visualization Tool displays playback status, THE Static Visualization Tool SHALL show current Simulation Time, total simulation duration, playback state, and the count of loaded Participant Records.

### Requirement 4: Display course movement and density

**User Story:** As a race analyst, I want to see both individual runners and aggregate concentration, so that I can distinguish personal movement from course bottlenecks.

#### Acceptance Criteria

1. WHEN valid input is loaded, THE Static Visualization Tool SHALL display the Course Track on a geographic map fitted to the route bounds.
2. WHEN valid input is loaded, THE Participant Marker Layer SHALL display one identifiable marker for every valid Participant Record at the current Participant Position.
3. WHEN a user selects a participant marker, THE Participant Marker Layer SHALL display the participant name, Finish Duration, and current Simulation Time.
4. WHEN valid input is loaded, THE Density Layer SHALL represent the number of Participant Positions within each rendered geographic area at the current Simulation Time.
5. WHEN the map displays valid input, THE Static Visualization Tool SHALL display the Participant Marker Layer and Density Layer together.
6. WHEN a user toggles a visualization layer, THE Static Visualization Tool SHALL show or hide the selected layer without changing Simulation Time or Participant Positions.
7. WHEN Simulation Time changes, THE Static Visualization Tool SHALL update the Participant Marker Layer and Density Layer from the same Simulation Engine state.

### Requirement 5: Handle replacement and invalid data transparently

**User Story:** As a race analyst, I want clear feedback when files are incomplete or replaced, so that I can correct input without losing a working example.

#### Acceptance Criteria

1. WHEN a replacement GPX file or results file parses successfully, THE Static Visualization Tool SHALL reset Simulation Time to zero and recompute all derived visualization data from the latest valid inputs.
2. IF a selected file has an unsupported file type or cannot be read, THEN THE Static Visualization Tool SHALL display a Validation Notice that names the rejected file and identifies the accepted input type.
3. IF a results table contains rows that the Results Parser excludes, THEN THE Static Visualization Tool SHALL report the number of excluded rows and the reason categories in the validation summary.
4. IF a replacement file fails validation, THEN THE Static Visualization Tool SHALL preserve the last valid Course Track or Participant Records for the failed input and keep the built-in example available through reset.
5. THE Static Visualization Tool SHALL perform GPX parsing, results parsing, position inference, playback, and density calculation in the browser without requiring a server-side service.

### Requirement 6: Configure density visualization settings

**User Story:** As a race analyst, I want to adjust density aggregation and warning display settings, so that I can inspect congestion at the level of detail that suits the course and audience.

#### Acceptance Criteria

1. WHEN the Static Visualization Tool initializes density settings, THE Static Visualization Tool SHALL use a 25-meter Grid Size, a Minimum People-per-Circle Filter of 1, and no enabled Warning Colour Threshold.
2. WHEN a user selects a Grid Size, THE Static Visualization Tool SHALL accept only 10 meters, 25 meters, 50 meters, or 100 meters and SHALL retain the last valid Grid Size while displaying a Validation Notice for any other value.
3. WHEN a user enters a Minimum People-per-Circle Filter, THE Static Visualization Tool SHALL accept only a whole number greater than or equal to 1 and SHALL retain the last valid filter while displaying a Validation Notice for a non-numeric, fractional, zero, or negative value.
4. WHEN a user enables a Warning Colour Threshold, THE Static Visualization Tool SHALL accept only a whole number strictly greater than the current Minimum People-per-Circle Filter and SHALL retain the disabled or last valid threshold while displaying a Validation Notice for a threshold less than or equal to the current filter.
5. WHEN a user changes a valid density setting, THE Static Visualization Tool SHALL apply the setting immediately to the current Simulation Snapshot without changing Simulation Time, Playback State, or Participant Positions.
6. WHEN a user changes a valid density setting during a browser session, THE Static Visualization Tool SHALL preserve the setting for the remainder of that browser session and SHALL initialize the default density settings in a later browser session.
7. WHEN density settings are available, THE Static Visualization Tool SHALL provide keyboard-accessible labeled controls, expose the active Grid Size, Minimum People-per-Circle Filter, and Warning Colour Threshold state in status text, and display a legend that explains the active density and warning colours.
8. WHEN the Density Layer aggregates Participant Positions, THE Density Layer SHALL produce the same cell boundaries, counts, filtered cells, and colours for the same Participant Positions and density settings.
9. WHEN the Density Layer applies the Minimum People-per-Circle Filter, THE Density Layer SHALL include a cell when its participant count is greater than or equal to the filter and SHALL exclude a cell when its participant count is less than the filter.
10. WHEN a rendered cell count is greater than or equal to an enabled Warning Colour Threshold, THE Density Layer SHALL use the warning colour, and WHEN a rendered cell count is less than the threshold, THE Density Layer SHALL use the normal density colour scale.

### Requirement 7: Emphasize finished and longest-finisher markers

**User Story:** As a race analyst, I want finished participants and the longest-finishing participants to remain visually distinct, so that I can follow the race leaders and understand who has completed the course.

#### Acceptance Criteria

1. WHEN the Static Visualization Tool renders a participant marker with a Route Fraction less than 1, THE Static Visualization Tool SHALL retain the default opaque marker style.
2. WHEN the Static Visualization Tool renders a participant marker with a Route Fraction equal to or greater than 1, THE Static Visualization Tool SHALL apply marker opacity 0.35.
3. WHEN a participant has the greatest Finish Duration in the current Participant Records, THE Static Visualization Tool SHALL apply the Bright Yellow Highlight to that participant marker before, at, and after the participant's finish time.
4. WHEN multiple participants share the greatest Finish Duration in the current Participant Records, THE Static Visualization Tool SHALL apply the Bright Yellow Highlight to every tied participant marker.
5. WHEN a participant qualifies for both the Finished Marker style and the Longest Finisher style, THE Static Visualization Tool SHALL apply the Bright Yellow Highlight with default opaque opacity instead of marker opacity 0.35.
6. WHEN the Static Visualization Tool derives Marker Style from a current SimulationSnapshot, THE Static Visualization Tool SHALL preserve Simulation Time, Participant Positions, Density Layer output, and Playback State.
7. WHEN the Static Visualization Tool applies Marker Style, THE Static Visualization Tool SHALL preserve participant popup content and safe text rendering for participant display names.
8. THE Static Visualization Tool SHALL enable Finished Marker translucency and Bright Yellow Highlight styling by default without adding user-facing marker-style settings.

### Requirement 8: Show finisher numbers on participant markers

**User Story:** As a race analyst, I want to optionally show finisher ranks on participant markers, so that I can identify relative finishing order while preserving the movement and congestion views.

#### Acceptance Criteria

1. WHEN the Static Visualization Tool initializes, THE Show Finisher Numbers Switch SHALL be present, keyboard accessible, and off by default, and participant markers SHALL use their default icons without finisher numbers.
2. WHEN the Show Finisher Numbers Switch is enabled, THE Static Visualization Tool SHALL replace each valid participant marker's icon with that participant's Finisher Rank based on ascending Finish Duration, with the fastest Finish Duration ranked first.
3. WHEN multiple participants have the same Finish Duration, THE Static Visualization Tool SHALL assign them the same Finisher Rank and SHALL use competition ranking so a sequence such as `1, 2, 2, 4` is produced.
4. WHEN the Static Visualization Tool derives Finisher Ranks, THE Static Visualization Tool SHALL calculate each rank from the current Participant Records using `1 +` the number of records with a strictly shorter Finish Duration, so the rank remains stable across SimulationSnapshot rerenders and does not depend on participant marker order or Simulation Time.
5. WHEN a user toggles the Show Finisher Numbers Switch, THE Static Visualization Tool SHALL change only marker presentation and SHALL preserve marker positions, marker opacity, Bright Yellow Highlight styling, popup content, Density Layer output, Simulation Time, Playback State, and all simulation state.
6. WHEN the Show Finisher Numbers Switch is disabled after being enabled, THE Static Visualization Tool SHALL restore each participant marker's default icon without changing the participant's Finisher Rank, position, opacity, Bright Yellow Highlight styling, popup content, Density Layer output, Simulation Time, Playback State, or other simulation state.
7. WHEN a longest finisher is displayed while the Show Finisher Numbers Switch is enabled, THE Static Visualization Tool SHALL retain the Bright Yellow Highlight and default opaque opacity while displaying that participant's Finisher Rank; the rank icon SHALL not override longest-finisher styling.
8. WHEN the Static Visualization Tool displays the Show Finisher Numbers Switch, THE control SHALL have an explicit accessible label, support keyboard operation, and expose its on/off state in status text without requiring users to infer the state from marker appearance.
9. WHEN the viewport is narrow, THE Show Finisher Numbers Switch, its label, status text, and the map SHALL remain readable and usable without clipping or obscuring playback or density controls.
10. WHEN the Static Visualization Tool renders a finisher-number icon, THE Static Visualization Tool SHALL render the numeric Finisher Rank through safe text rendering and SHALL continue to render participant popup names through safe text APIs without inserting user-provided text as markup.
11. WHEN the Static Visualization Tool rerenders markers for a later SimulationSnapshot with the same Participant Records, THE Static Visualization Tool SHALL preserve each participant's Finisher Rank and switch state while updating only the fields affected by the new snapshot.
