import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = resolve(projectRoot, 'dist');

const bundledExamples = [
  'examples/Cricket_Captains_Walk_parkrun.gpx',
  'examples/results _ Riverbank parkrun.html',
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
  });

  it('emits a self-contained app entrypoint and both bundled example assets', () => {
    const entrypointPath = resolve(distDirectory, 'index.html');
    const entrypoint = readFileSync(entrypointPath, 'utf8');
    const scriptReferences = [...entrypoint.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(
      (match) => match[1],
    );

    expect(statSync(entrypointPath).size).toBeGreaterThan(0);
    expect(scriptReferences.length).toBeGreaterThan(0);
    expect(entrypoint).toContain('./examples/Cricket_Captains_Walk_parkrun.gpx');
    expect(entrypoint).toContain('./examples/results%20_%20Riverbank%20parkrun.html');

    for (const scriptReference of scriptReferences) {
      expect(scriptReference).not.toMatch(/^https?:\/\//);
      const scriptPath = resolveStaticReference(scriptReference);
      expect(statSync(scriptPath).size).toBeGreaterThan(0);

      const script = readFileSync(scriptPath, 'utf8');
      expect(script).not.toMatch(/["'`]\/api(?:\/|["'`])/);
    }

    for (const example of bundledExamples) {
      const examplePath = resolve(distDirectory, example);
      expect(statSync(examplePath).size).toBeGreaterThan(0);
    }
  });
});
