import { expect, test, type Page } from '@playwright/test';

const localCourse = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="browser-test">
  <trk><name>Local test course</name><trkseg>
    <trkpt lat="-34.6385" lon="148.02111" />
    <trkpt lat="-34.6386" lon="148.02100" />
  </trkseg></trk>
</gpx>`;

const localResults = `<!doctype html>
<table>
  <thead><tr><th>Name</th><th>Time</th></tr></thead>
  <tbody><tr><td>Local Runner</td><td>1:23</td></tr></tbody>
</table>`;

const invalidCourse = '<gpx><trk><trkseg><trkpt lat="not-a-lat" lon="148.0" /></trkseg></trk></gpx>';
const invalidResults = '<!doctype html><table><tr><th>Name</th><th>Time</th></tr><tr><td></td><td>1:23</td></tr></table>';

async function loadBundledExample(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('#reset-example-button')).toBeEnabled();
  await expect(page.locator('#start-playback-button')).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator('#participant-count')).not.toHaveText('0');
  await expect(page.locator('#total-duration')).not.toHaveText('0:00');
}

test.describe('built static course density application', () => {
  test('loads the bundled example and renders the route, markers, density, and usable status controls', async ({ page }) => {
    await loadBundledExample(page);

    await expect(page.locator('#map')).toBeVisible();
    await expect(page.locator('#map .leaflet-overlay-pane path')).not.toHaveCount(0);
    await expect(page.locator('#map .leaflet-marker-icon').first()).toBeVisible();
    await expect(page.locator('#markers-layer-toggle')).toBeChecked();
    await expect(page.locator('#density-layer-toggle')).toBeChecked();
    await expect(page.locator('#start-playback-button')).toBeEnabled();
    await expect(page.locator('#pause-playback-button')).toBeDisabled();
    await expect(page.locator('#reset-playback-button')).toBeEnabled();
    await expect(page.locator('#playback-state')).toHaveText('Paused');
    await expect(page.locator('#simulation-time')).toHaveText('0:00');
    await expect(page.locator('#validation-notice')).toContainText('rows excluded');
  });

  test('replaces local course and results files, resets playback, and restores the bundled example', async ({ page }) => {
    await loadBundledExample(page);
    const bundledParticipantCount = await page.locator('#participant-count').textContent();

    await page.locator('#course-file-input').setInputFiles({
      name: 'local-course.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(localCourse),
    });
    await expect(page.locator('#map .leaflet-overlay-pane path')).not.toHaveCount(0);

    await page.locator('#results-file-input').setInputFiles({
      name: 'local-results.html',
      mimeType: 'text/html',
      buffer: Buffer.from(localResults),
    });
    await expect(page.locator('#participant-count')).toHaveText('1');
    await expect(page.locator('#total-duration')).toHaveText('1:23');
    await expect(page.locator('#simulation-time')).toHaveText('0:00');
    await expect(page.locator('#start-playback-button')).toBeEnabled();
    await expect(page.locator('#validation-notice')).toHaveText('');

    await page.locator('#start-playback-button').click();
    await expect(page.locator('#playback-state')).toHaveText('Running');
    await page.locator('#reset-playback-button').click();
    await expect(page.locator('#playback-state')).toHaveText('Paused');
    await expect(page.locator('#simulation-time')).toHaveText('0:00');

    await page.locator('#reset-example-button').click();
    await expect(page.locator('#participant-count')).toHaveText(bundledParticipantCount ?? '');
    await expect(page.locator('#total-duration')).not.toHaveText('1:23');
    await expect(page.locator('#simulation-time')).toHaveText('0:00');
    await expect(page.locator('#start-playback-button')).toBeEnabled();
  });

  test('retains valid input and reports notices when local replacements fail validation', async ({ page }) => {
    await loadBundledExample(page);
    const participantCount = await page.locator('#participant-count').textContent();
    const totalDuration = await page.locator('#total-duration').textContent();

    await page.locator('#course-file-input').setInputFiles({
      name: 'broken-course.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(invalidCourse),
    });
    await expect(page.locator('#validation-notice')).toContainText('broken-course.gpx');
    await expect(page.locator('#validation-notice')).toContainText('previous course was retained');
    await expect(page.locator('#participant-count')).toHaveText(participantCount ?? '');
    await expect(page.locator('#total-duration')).toHaveText(totalDuration ?? '');
    await expect(page.locator('#start-playback-button')).toBeEnabled();

    await page.locator('#results-file-input').setInputFiles({
      name: 'broken-results.html',
      mimeType: 'text/html',
      buffer: Buffer.from(invalidResults),
    });
    await expect(page.locator('#validation-notice')).toContainText('broken-results.html');
    await expect(page.locator('#validation-notice')).toContainText('no valid records');
    await expect(page.locator('#validation-notice')).toContainText('previous results was retained');
    await expect(page.locator('#participant-count')).toHaveText(participantCount ?? '');
    await expect(page.locator('#start-playback-button')).toBeEnabled();
  });

  test('updates both visual layers from playback and preserves state when toggled', async ({ page }) => {
    await loadBundledExample(page);
    const initialMarkerCount = await page.locator('#map .leaflet-marker-icon').count();
    const initialOverlayPathCount = await page.locator('#map .leaflet-overlay-pane path').count();
    expect(initialMarkerCount).toBeGreaterThan(0);
    expect(initialOverlayPathCount).toBeGreaterThan(1);

    await page.locator('#markers-layer-toggle').uncheck();
    await expect(page.locator('#markers-layer-toggle')).not.toBeChecked();
    await expect(page.locator('#map .leaflet-marker-icon')).toHaveCount(0);
    await expect(page.locator('#simulation-time')).toHaveText('0:00');

    await page.locator('#density-layer-toggle').uncheck();
    await expect(page.locator('#density-layer-toggle')).not.toBeChecked();
    await expect(page.locator('#map .leaflet-overlay-pane path')).toHaveCount(1);
    await expect(page.locator('#simulation-time')).toHaveText('0:00');

    await page.locator('#markers-layer-toggle').check();
    await page.locator('#density-layer-toggle').check();
    await expect(page.locator('#map .leaflet-marker-icon')).toHaveCount(initialMarkerCount);
    await expect(page.locator('#map .leaflet-overlay-pane path')).toHaveCount(initialOverlayPathCount);

    await page.locator('#start-playback-button').click();
    await expect(page.locator('#playback-state')).toHaveText('Running');
    await expect(page.locator('#simulation-time')).not.toHaveText('0:00', { timeout: 5_000 });
    await page.locator('#pause-playback-button').click();
    await expect(page.locator('#playback-state')).toHaveText('Paused');
    await expect(page.locator('#pause-playback-button')).toBeDisabled();
    await expect(page.locator('#start-playback-button')).toBeEnabled();
  });

  test('opens participant popup content and remains usable at a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadBundledExample(page);

    await expect(page.locator('#map')).toBeVisible();
    await expect(page.locator('#map .leaflet-marker-icon').first()).toBeVisible();
    await page.locator('#map .leaflet-marker-icon').first().evaluate((marker) => {
      (marker as HTMLElement).click();
    });
    await expect(page.locator('.leaflet-popup')).toContainText('Participant');
    await expect(page.locator('.leaflet-popup')).toContainText('Finish time');
    await expect(page.locator('.leaflet-popup')).toContainText('Simulation time');

    const layout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      mapWidth: document.querySelector<HTMLElement>('#map')?.getBoundingClientRect().width ?? 0,
    }));
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.mapWidth).toBeGreaterThan(0);
    await expect(page.locator('#reset-example-button')).toBeVisible();
    await expect(page.locator('#start-playback-button')).toBeEnabled();
  });

  test('exposes accessible density controls with active status and legend guidance', async ({ page }) => {
    await loadBundledExample(page);

    const gridSize = page.getByLabel('Grid size');
    const minimumPeople = page.getByLabel('Minimum people per circle');
    const warningThreshold = page.getByLabel('Warning colour threshold');

    await expect(gridSize).toHaveValue('25');
    await expect(minimumPeople).toHaveValue('1');
    await expect(warningThreshold).toHaveValue('disabled');
    await expect(gridSize).toHaveAttribute('aria-describedby', /density-grid-size-hint/);
    await expect(minimumPeople).toHaveAttribute('aria-describedby', /density-minimum-hint/);
    await expect(warningThreshold).toHaveAttribute('aria-describedby', /density-warning-threshold-hint/);

    await expect(page.locator('#density-settings-summary')).toHaveText('25 m grid · minimum 1');
    await expect(page.locator('#density-warning-state')).toHaveText('Disabled');
    await expect(page.locator('#density-legend')).toContainText('Low density');
    await expect(page.locator('#density-legend')).toContainText('Medium density');
    await expect(page.locator('#density-legend')).toContainText('High density');
    await expect(page.locator('#density-warning-legend')).toContainText('Warning colour is disabled');
    await expect(page.locator('#density-filter-legend')).toHaveText(
      'Cells below the minimum filter of 1 are hidden.',
    );
  });

  test('supports keyboard density edits and updates warning and filtered-cell messaging', async ({ page }) => {
    await loadBundledExample(page);

    const gridSize = page.getByLabel('Grid size');
    const minimumPeople = page.getByLabel('Minimum people per circle');
    const warningThreshold = page.getByLabel('Warning colour threshold');
    const densityPaths = page.locator('#map .leaflet-overlay-pane path');

    await gridSize.focus();
    await expect(gridSize).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(minimumPeople).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(minimumPeople).toHaveValue('2');
    await page.getByLabel('Grid size').selectOption('50');
    await expect(page.locator('#density-settings-summary')).toHaveText('50 m grid · minimum 2');
    await expect(page.locator('#density-filter-legend')).toHaveText(
      'Cells below the minimum filter of 2 are hidden.',
    );

    await warningThreshold.selectOption('100');
    await expect(warningThreshold).toHaveValue('100');
    await expect(page.locator('#density-warning-state')).toHaveText('100 people');
    await expect(page.locator('#density-warning-legend')).toContainText(
      'Warning colour at or above 100 people',
    );

    await warningThreshold.selectOption('disabled');
    await minimumPeople.focus();
    await minimumPeople.fill('100');
    await expect(minimumPeople).toHaveValue('100');
    await expect(page.locator('#density-filter-legend')).toHaveText(
      'Cells below the minimum filter of 100 are hidden.',
    );
    await expect(densityPaths).toHaveCount(1);
  });

  test('changes density settings while paused and running without resetting playback', async ({ page }) => {
    await loadBundledExample(page);

    await page.locator('#start-playback-button').click();
    await expect(page.locator('#simulation-time')).not.toHaveText('0:00', { timeout: 5_000 });
    await page.locator('#pause-playback-button').click();
    await expect(page.locator('#playback-state')).toHaveText('Paused');

    const pausedTime = await page.locator('#simulation-time').textContent();
    await page.getByLabel('Grid size').selectOption('50');
    await expect(page.locator('#density-settings-summary')).toHaveText('50 m grid · minimum 1');
    await expect(page.locator('#playback-state')).toHaveText('Paused');
    await expect(page.locator('#simulation-time')).toHaveText(pausedTime ?? '');

    await page.locator('#start-playback-button').click();
    await expect(page.locator('#playback-state')).toHaveText('Running');
    await expect(page.locator('#simulation-time')).not.toHaveText(pausedTime ?? '', { timeout: 5_000 });

    const stateImmediatelyAfterDensityEdit = await page.evaluate(() => {
      const control = document.querySelector<HTMLSelectElement>('#density-grid-size');
      if (control === null) {
        throw new Error('Density grid control is missing');
      }
      control.value = '100';
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        simulationTime: document.querySelector<HTMLElement>('#simulation-time')?.textContent ?? '',
        playbackState: document.querySelector<HTMLElement>('#playback-state')?.textContent ?? '',
        densitySummary: document.querySelector<HTMLElement>('#density-settings-summary')?.textContent ?? '',
      };
    });

    expect(stateImmediatelyAfterDensityEdit.simulationTime).not.toBe('0:00');
    expect(stateImmediatelyAfterDensityEdit.playbackState).toBe('Running');
    expect(stateImmediatelyAfterDensityEdit.densitySummary).toBe('100 m grid · minimum 1');
  });

  test('keeps density controls, legend, and map usable at a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadBundledExample(page);

    const layout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      controlsWidth: document.querySelector<HTMLElement>('#visualization-controls')?.getBoundingClientRect().width ?? 0,
      legendWidth: document.querySelector<HTMLElement>('#density-legend')?.getBoundingClientRect().width ?? 0,
      mapWidth: document.querySelector<HTMLElement>('#map')?.getBoundingClientRect().width ?? 0,
    }));

    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.controlsWidth).toBeGreaterThan(0);
    expect(layout.legendWidth).toBeGreaterThan(0);
    expect(layout.mapWidth).toBeGreaterThan(0);
    await expect(page.getByLabel('Grid size')).toBeVisible();
    await expect(page.getByLabel('Minimum people per circle')).toBeVisible();
    await expect(page.getByLabel('Warning colour threshold')).toBeVisible();
    await expect(page.locator('#density-legend')).toBeVisible();
    await expect(page.locator('#start-playback-button')).toBeVisible();
  });

  test('restores density defaults in a fresh browser context', async ({ browser }) => {
    const configuredContext = await browser.newContext();
    try {
      const configuredPage = await configuredContext.newPage();
      await loadBundledExample(configuredPage);
      await configuredPage.getByLabel('Grid size').selectOption('100');
      await configuredPage.getByLabel('Minimum people per circle').fill('2');
      await configuredPage.getByLabel('Warning colour threshold').selectOption('5');
      await expect(configuredPage.locator('#density-settings-summary')).toHaveText('100 m grid · minimum 2');
      await expect(configuredPage.locator('#density-warning-state')).toHaveText('5 people');
    } finally {
      await configuredContext.close();
    }

    const freshContext = await browser.newContext();
    try {
      const freshPage = await freshContext.newPage();
      await loadBundledExample(freshPage);
      await expect(freshPage.locator('#density-settings-summary')).toHaveText('25 m grid · minimum 1');
      await expect(freshPage.locator('#density-warning-state')).toHaveText('Disabled');
      await expect(freshPage.getByLabel('Warning colour threshold')).toHaveValue('disabled');
    } finally {
      await freshContext.close();
    }
  });
});
