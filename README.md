# Course Density Visualization

A static browser application for replaying participant movement along a running course and visualizing participant density over time.

The app loads a GPX course and an HTML results page, models each participant at a constant pace based on their finish time, and displays the result on a Leaflet map.

## Features

- Bundled Riverbank parkrun example data.
- Local GPX and HTML results-file replacement.
- 60 simulated seconds per real-time second during playback.
- Route-distance interpolation for participant positions.
- Participant markers and aggregate density cells shown together.
- Density controls for:
  - 10 m, 25 m, 50 m, or 100 m grid sizes.
  - Minimum people per circle.
  - Optional warning colour threshold.
- Finished markers become translucent after they reach the finish.
- The longest finisher stays highlighted in bright yellow. Ties are highlighted together.
- Optional finisher-number markers with competition ranking, such as `1, 2, 2, 4`.
- Accessible controls, validation notices, responsive layout, and safe text rendering.
- Static hosting support, including GitHub Pages.

## Requirements

- Node.js 22 or newer recommended.
- npm.

## Run locally

Install dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Open the URL printed by Vite, usually <http://localhost:5173>.

To preview the production build locally:

```bash
npm run build
npm run preview
```

The preview server normally runs at <http://localhost:4173>.

## Test and build

Run TypeScript checks and the unit/property/static-build tests:

```bash
npm run check
```

Run the Playwright browser integration suite:

```bash
npm run test:browser
```

Create the deployable static output:

```bash
npm run build
```

The generated site is written to `dist/`.

## GitHub Pages

The project is a client-side static app and does not require a server or database. Deploy the contents of `dist/` to GitHub Pages. The Vite configuration uses relative asset paths, so it works from a repository project URL as well as a custom domain.

A GitHub Actions deployment can run `npm ci`, `npm run build`, upload `dist/` as a Pages artifact, and deploy it with the official Pages actions.

## Input files

The application accepts:

- GPX files with at least two usable track points.
- HTML results files containing participant names and finish times in `MM:SS` or `H:MM:SS` format.

A failed replacement keeps the last valid input. The **Reset to bundled example** button restores the supplied example files.

The downloaded sample files are kept in `examples/` for reference. Copies in `public/examples/` are bundled for browser use. Their original source, attribution, and redistribution terms may differ from this project's MIT-licensed source code. Review those terms before redistributing the example assets separately.

## Project structure

```text
index.html                 Application shell
examples/                  Source GPX and results samples
src/                       TypeScript application and domain code
public/examples/           Bundled copies served by Vite
tests/browser/             Playwright browser tests
dist/                      Production build output
```

## License

The application source code is released under the [MIT License](LICENSE).

Third-party dependencies retain their own licenses. Bundled example inputs may have separate attribution or redistribution requirements; see the input-file note above.
