import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = resolve(projectRoot, 'dist');

const bundledExamples = [
  'examples/Example_parkrun.gpx',
  'examples/results _ 62 people.html',
  'examples/results _ 411 people.html',
] as const;

function resolveStaticReference(reference: string): string {
  const pathReference = decodeURIComponent(reference.replace(/^\.\//, '').replace(/^\//, ''));
  return resolve(distDirectory, pathReference);
}

describe('static production build', () => {
  beforeAll(() => {
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
      cwd: projectRoot,
      env: { ...process.env, CI: 'true' },
      stdio: 'inherit',
    });
  }, 30_000);

  it('emits a self-contained app entrypoint and both bundled example assets', () => {
    const entrypointPath = resolve(distDirectory, 'index.html');
    const entrypoint = readFileSync(entrypointPath, 'utf8');
    const scriptReferences = [...entrypoint.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(
      (match) => match[1],
    );

    expect(statSync(entrypointPath).size).toBeGreaterThan(0);
    expect(scriptReferences.length).toBeGreaterThan(0);
    expect(entrypoint).toContain('./examples/Example_parkrun.gpx');
    expect(entrypoint).toContain('./examples/results%20_%2062%20people.html');
    expect(entrypoint).toContain('./examples/results%20_%20411%20people.html');

    const assetDirectory = resolve(distDirectory, 'assets');
    const markerAssets = [
      /^marker-icon-[^/]+\.png$/,
      /^marker-icon-2x-[^/]+\.png$/,
      /^marker-shadow-[^/]+\.png$/,
    ];
    const emittedAssets = readdirSync(assetDirectory);
    for (const markerAssetPattern of markerAssets) {
      const markerAsset = emittedAssets.find((asset) => markerAssetPattern.test(asset));
      expect(markerAsset).toBeDefined();
      expect(statSync(resolve(assetDirectory, markerAsset ?? '')).size).toBeGreaterThan(0);
    }

    for (const scriptReference of scriptReferences) {
      expect(scriptReference).not.toMatch(/^https?:\/\//);
      expect(scriptReference).not.toMatch(/^\/assets\//);
      const scriptPath = resolveStaticReference(scriptReference);
      expect(statSync(scriptPath).size).toBeGreaterThan(0);

      const script = readFileSync(scriptPath, 'utf8');
      expect(script).not.toMatch(/["'`]\/api(?:\/|["'`])/);
      expect(script).not.toMatch(/["'`]\/assets\//);
      if (script.includes('maplibre-gl-worker-')) {
        expect(script).toMatch(/new URL\("maplibre-gl-worker-[^"]+\.js",import\.meta\.url\)/);
      }
    }

    const stylesheetReferences = [...entrypoint.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/g)].map(
      (match) => match[1],
    );
    expect(stylesheetReferences.length).toBeGreaterThan(0);
    for (const stylesheetReference of stylesheetReferences) {
      expect(stylesheetReference).not.toMatch(/^\//);
      const stylesheetPath = resolveStaticReference(stylesheetReference);
      expect(statSync(stylesheetPath).size).toBeGreaterThan(0);
      expect(readFileSync(stylesheetPath, 'utf8')).toContain('.maplibregl-map');
    }

    const workerAssets = emittedAssets.filter((asset) => /^maplibre-gl-worker-[^/]+\.js$/.test(asset));
    expect(workerAssets.length).toBeGreaterThan(0);
    for (const workerAsset of workerAssets) {
      expect(statSync(resolve(assetDirectory, workerAsset)).size).toBeGreaterThan(0);
      const projectPathUrl = new URL(`./assets/${workerAsset}`, 'https://example.test/5k-course-density/');
      expect(projectPathUrl.pathname).toBe(`/5k-course-density/assets/${workerAsset}`);
    }

    for (const example of bundledExamples) {
      const examplePath = resolve(distDirectory, example);
      expect(statSync(examplePath).size).toBeGreaterThan(0);
    }
  });
});
