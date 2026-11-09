import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseResults } from './resultsParser';

const examplePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../public/examples/results _ 62 people.html',
);
const riverbankHtml = readFileSync(examplePath, 'utf8');
const originalDomParser = globalThis.DOMParser;

beforeAll(() => {
  globalThis.DOMParser = new Window().DOMParser as unknown as typeof DOMParser;
});

afterAll(() => {
  if (originalDomParser === undefined) {
    Reflect.deleteProperty(globalThis, 'DOMParser');
  } else {
    globalThis.DOMParser = originalDomParser;
  }
});

describe('parseResults examples and edge cases', () => {
  it('parses the supplied Riverbank results asset', () => {
    const result = parseResults(riverbankHtml);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value[0]).toMatchObject({
      displayName: 'Participant One',
      finishDurationSeconds: 20 * 60 + 33,
    });
    expect(result.validation.excludedRows).toBeGreaterThan(0);
    expect(result.validation.reasonCounts['invalid-duration']).toBeGreaterThan(0);
  });

  it('uses the compact event time instead of a detailed personal-best time', () => {
    const html = `
      <table>
        <tr class="Results-table-row">
          <td class="Results-table-td--name">
            <div class="compact">Compact Runner</div>
            <div class="detailed">extra participant details</div>
          </td>
          <td class="Results-table-td--time">
            <div class="compact">20:33</div>
            <div class="detailed"><span>PB</span> 19:15</div>
          </td>
        </tr>
      </table>
    `;

    const result = parseResults(html);

    expect(result).toMatchObject({
      ok: true,
      value: [{
        displayName: 'Compact Runner',
        finishDurationSeconds: 20 * 60 + 33,
      }],
    });
  });

  it('preserves duplicate display names while generating unique participant IDs', () => {
    const html = `
      <table>
        <tr><th>Name</th><th>Finish Time</th></tr>
        <tr><td>Alex Runner</td><td>10:00</td></tr>
        <tr><td> Alex   Runner </td><td>11:00</td></tr>
      </table>
    `;

    const result = parseResults(html);

    expect(result).toMatchObject({
      ok: true,
      value: [
        { id: 'alex-runner', displayName: 'Alex Runner', finishDurationSeconds: 600 },
        { id: 'alex-runner-0002', displayName: 'Alex Runner', finishDurationSeconds: 660 },
      ],
    });
  });

  it('rejects a header-only results table with no excluded rows', () => {
    const result = parseResults(`
      <table>
        <tr><th>Name</th><th>Time</th></tr>
      </table>
    `);

    expect(result).toEqual({
      ok: false,
      validation: {
        notices: [],
        excludedRows: 0,
        reasonCounts: { 'no-valid-records': 1 },
      },
    });
  });

  it('rejects an empty results table', () => {
    const result = parseResults('<table></table>');

    expect(result).toEqual({
      ok: false,
      validation: {
        notices: [],
        excludedRows: 0,
        reasonCounts: { 'no-valid-records': 1 },
      },
    });
  });

  it('reports every invalid row when a results file has no valid participants', () => {
    const result = parseResults(`
      <table>
        <tr><th>Name</th><th>Finish Time</th></tr>
        <tr><td></td><td>10:00</td></tr>
        <tr><td>Broken Time</td><td>not-a-time</td></tr>
        <tr><td>Zero Time</td><td>0:00</td></tr>
      </table>
    `);

    expect(result).toEqual({
      ok: false,
      validation: {
        notices: [],
        excludedRows: 3,
        reasonCounts: {
          'missing-name': 1,
          'invalid-duration': 1,
          'non-positive-duration': 1,
          'no-valid-records': 1,
        },
      },
    });
  });
});
