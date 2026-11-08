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
});
