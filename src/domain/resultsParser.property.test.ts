// @vitest-environment happy-dom

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { parseResults } from './resultsParser';
import type { ValidationReason } from '../app/types';

type InvalidResultRow = {
  readonly reason: Extract<ValidationReason, 'missing-name' | 'invalid-duration' | 'non-positive-duration'>;
  readonly name: string;
  readonly duration: string;
};

const invalidResultRowArbitrary: fc.Arbitrary<InvalidResultRow> = fc.constantFrom(
  { reason: 'missing-name', name: '', duration: '12:34' },
  { reason: 'missing-name', name: '   ', duration: '12:34' },
  { reason: 'invalid-duration', name: 'Invalid Time Runner', duration: 'not-a-time' },
  { reason: 'invalid-duration', name: 'Invalid Time Runner', duration: '20:60' },
  { reason: 'non-positive-duration', name: 'Zero Time Runner', duration: '00:00' },
  { reason: 'non-positive-duration', name: 'Zero Time Runner', duration: '0:00:00' },
);

function resultsDocument(rows: readonly InvalidResultRow[]): string {
  const sourceRows = [
    '<tr><th>Name</th><th>Finish time</th></tr>',
    '<tr><td>Valid Runner</td><td>12:34</td></tr>',
    ...rows.map(({ name, duration }) => `<tr><td>${name}</td><td>${duration}</td></tr>`),
  ];

  return `<table><thead>${sourceRows[0]}</thead><tbody>${sourceRows.slice(1).join('')}</tbody></table>`;
}

function expectedReasonCounts(rows: readonly InvalidResultRow[]): Partial<Record<ValidationReason, number>> {
  return rows.reduce<Partial<Record<ValidationReason, number>>>((counts, row) => {
    counts[row.reason] = (counts[row.reason] ?? 0) + 1;
    return counts;
  }, {});
}

describe('Feature: course-density-visualization, Property 3: Invalid result fields are excluded and categorized', () => {
  it('emits no participant for any generated invalid name or duration field', () => {
    fc.assert(
      fc.property(
        fc.array(invalidResultRowArbitrary, { minLength: 1, maxLength: 25 }),
        (rows) => {
          const result = parseResults(resultsDocument(rows));

          expect(result.ok).toBe(true);
          if (!result.ok) {
            return;
          }

          expect(result.value).toHaveLength(1);
          expect(result.value[0].displayName).toBe('Valid Runner');
          expect(result.value.every(({ displayName }) => displayName !== '')).toBe(true);
        },
      ),
    );
  });
});

describe('Feature: course-density-visualization, Property 11: Validation summaries aggregate excluded-row reasons', () => {
  it('reports exact excluded-row and per-category counts for generated invalid rows', () => {
    fc.assert(
      fc.property(
        fc.array(invalidResultRowArbitrary, { minLength: 1, maxLength: 25 }),
        (rows) => {
          const result = parseResults(resultsDocument(rows));

          expect(result.ok).toBe(true);
          if (!result.ok) {
            return;
          }

          expect(result.validation.excludedRows).toBe(rows.length);
          expect(result.validation.reasonCounts).toEqual(expectedReasonCounts(rows));
        },
      ),
    );
  });
});
