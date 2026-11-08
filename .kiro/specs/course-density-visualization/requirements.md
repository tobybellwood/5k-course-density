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
