import { describe, expect, it } from 'vitest';
import {
  addValidationNotice,
  emptyValidationSummary,
  formatFileReadFailureNotice,
  formatRetainedInputNotice,
  formatUnsupportedFileTypeNotice,
  formatValidationSummary,
  mergeValidationSummaries,
  recordExcludedRow,
  recordValidationReason,
} from '../../src/domain/validation';

describe('validation summaries', () => {
  it('creates an empty summary with no notices, exclusions, or reason counts', () => {
    expect(emptyValidationSummary()).toEqual({
      notices: [],
      excludedRows: 0,
      reasonCounts: {},
    });
  });

  it('aggregates excluded-row reasons and formats singular and plural categories', () => {
    let summary = emptyValidationSummary();
    summary = recordExcludedRow(summary, 'missing-name');
    summary = recordExcludedRow(summary, 'invalid-duration');
    summary = recordExcludedRow(summary, 'missing-name');

    expect(summary).toEqual({
      notices: [],
      excludedRows: 3,
      reasonCounts: {
        'missing-name': 2,
        'invalid-duration': 1,
      },
    });
    expect(formatValidationSummary(summary)).toBe(
      '3 rows excluded: 2 missing names, 1 invalid time.',
    );
  });

  it('merges excluded rows, validation reasons, and notices from multiple summaries', () => {
    const first = addValidationNotice(
      recordExcludedRow(emptyValidationSummary(), 'missing-name'),
      'A participant name was missing.',
    );
    const second = recordValidationReason(
      recordValidationReason(emptyValidationSummary(), 'malformed-gpx'),
      'no-valid-records',
      'The replacement results file contained no valid records.',
    );

    expect(mergeValidationSummaries(first, second)).toEqual({
      notices: [
        'A participant name was missing.',
        'The replacement results file contained no valid records.',
      ],
      excludedRows: 1,
      reasonCounts: {
        'missing-name': 1,
        'malformed-gpx': 1,
        'no-valid-records': 1,
      },
    });
  });

  it('formats a malformed-input reason and retained-input notice', () => {
    const summary = addValidationNotice(
      recordValidationReason(emptyValidationSummary(), 'malformed-gpx'),
      formatRetainedInputNotice('course', 'The GPX document was malformed.'),
    );

    expect(formatValidationSummary(summary)).toBe(
      'Validation issues: 1 malformed GPX document. The GPX document was malformed. The previous course was retained.',
    );
  });

  it('formats a no-valid-records reason and retained prior results', () => {
    const summary = addValidationNotice(
      recordValidationReason(emptyValidationSummary(), 'no-valid-records'),
      formatRetainedInputNotice('results', 'No valid participant records were found.'),
    );

    expect(formatValidationSummary(summary)).toBe(
      'Validation issues: 1 no valid records. No valid participant records were found. The previous results was retained.',
    );
  });

  it('creates an unsupported-file-type notice with the rejected file and retained input', () => {
    expect(formatUnsupportedFileTypeNotice({
      fileName: 'route.txt',
      acceptedType: '.gpx',
      retainedInput: 'course',
    })).toBe(
      'Unable to load "route.txt": unsupported file type. Accepted type: .gpx. The previous course was retained.',
    );
  });

  it('creates a file-read-failure notice with detail, accepted type, and retained input', () => {
    expect(formatFileReadFailureNotice({
      fileName: 'results.html',
      acceptedType: '.html or .htm',
      retainedInput: 'results',
    }, 'The file could not be opened')).toBe(
      'Unable to load "results.html": The file could not be opened. Accepted type: .html or .htm. The previous results was retained.',
    );
  });

  it('uses the default file-read failure detail when none is supplied', () => {
    expect(formatFileReadFailureNotice({
      fileName: 'results.html',
      acceptedType: '.html or .htm',
      retainedInput: 'results',
    })).toBe(
      'Unable to load "results.html": The file could not be read. Accepted type: .html or .htm. The previous results was retained.',
    );
  });
});
