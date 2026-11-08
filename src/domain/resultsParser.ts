import { ParticipantRecord, ParseResult, ValidationReason } from '../app/types';
import { parseDuration } from './duration';
import { createParticipantRecord, recordExcludedRow, recordValidationReason, emptyValidationSummary } from './validation';
import { createParticipantId } from './participantIds';

function normalizedText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function elementText(element: Element | null | undefined): string {
  if (element === null || element === undefined) {
    return '';
  }

  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('script, style, link, img').forEach((child) => child.remove());
  return normalizedText(clone.textContent);
}

function preferredCellText(row: HTMLTableRowElement, selector: string): string {
  const cell = row.querySelector(selector);
  if (cell === null) {
    return '';
  }

  const compact = cell.querySelector('.compact');
  if (compact !== null) {
    return elementText(compact);
  }

  const clone = cell.cloneNode(true) as Element;
  clone.querySelectorAll('.detailed, script, style, link, img').forEach((child) => child.remove());
  return normalizedText(clone.textContent);
}

function findColumnIndex(headers: readonly string[], patterns: readonly RegExp[]): number {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
}

function ordinaryTableRows(document: Document): readonly HTMLTableRowElement[] {
  for (const table of Array.from(document.querySelectorAll('table'))) {
    const rows = Array.from(table.querySelectorAll('tr'));
    const header = rows.find((row) => {
      const cells = Array.from(row.cells);
      if (row.querySelector('th') === null && row !== rows[0]) {
        return false;
      }
      const headers = cells.map((cell) => normalizedText(elementText(cell)).toLowerCase());
      return findColumnIndex(headers, [/name/i, /parkrunner/i]) >= 0
        && findColumnIndex(headers, [/time/i, /finish/i]) >= 0;
    });
    if (header === undefined) {
      continue;
    }

    const headerIndex = rows.indexOf(header);
    return rows.slice(headerIndex + 1).filter((row) => row.cells.length > 0);
  }
  return [];
}

function specialRows(document: Document): readonly HTMLTableRowElement[] {
  return Array.from(document.querySelectorAll('tr.Results-table-row'));
}

function ordinaryCellText(row: HTMLTableRowElement, columnIndex: number): string {
  return elementText(row.cells.item(columnIndex));
}

type ResultRowParseResult =
  | { ok: true; value: ParticipantRecord }
  | { ok: false; reason: Extract<ValidationReason, 'missing-name' | 'invalid-duration' | 'non-positive-duration'> };

function parseResultRow(
  row: HTMLTableRowElement,
  savedRows: boolean,
  nameColumn: number,
  timeColumn: number,
  rowIndex: number,
  usedIds: Set<string>,
): ResultRowParseResult {
  const displayName = savedRows
    ? preferredCellText(row, '.Results-table-td--name')
    : ordinaryCellText(row, nameColumn);
  if (displayName.length === 0) {
    return { ok: false, reason: 'missing-name' };
  }

  const durationText = savedRows
    ? preferredCellText(row, '.Results-table-td--time')
    : ordinaryCellText(row, timeColumn);
  const duration = parseDuration(durationText);
  if (!duration.ok) {
    return { ok: false, reason: duration.reason };
  }

  const id = createParticipantId(displayName, rowIndex, usedIds);
  const record = createParticipantRecord(id, displayName, duration.seconds);
  if (!record.ok) {
    if (record.reason === 'missing-name' || record.reason === 'invalid-duration' || record.reason === 'non-positive-duration') {
      return { ok: false, reason: record.reason };
    }
    return { ok: false, reason: 'invalid-duration' };
  }

  return record;
}

function noValidRecords(validation: ReturnType<typeof emptyValidationSummary> = emptyValidationSummary()): ParseResult<ParticipantRecord[]> {
  return {
    ok: false,
    validation: recordValidationReason(validation, 'no-valid-records'),
  };
}

/** Parse saved parkrun results and ordinary tables into validated participant records. */
export function parseResults(html: string): ParseResult<ParticipantRecord[]> {
  if (typeof html !== 'string' || typeof DOMParser === 'undefined') {
    return noValidRecords();
  }

  let document: Document;
  try {
    document = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return noValidRecords();
  }

  const savedRows = specialRows(document);
  const rows = savedRows.length > 0 ? savedRows : ordinaryTableRows(document);
  const headers = rows.length > 0 && savedRows.length === 0
    ? (() => {
        const headerRow = Array.from(document.querySelectorAll('tr')).find((row) => {
          const cells = Array.from(row.cells);
          const headers = cells.map((cell) => normalizedText(elementText(cell)).toLowerCase());
          return (row.querySelector('th') !== null || row === document.querySelector('tr'))
            && findColumnIndex(headers, [/name/i, /parkrunner/i]) >= 0
            && findColumnIndex(headers, [/time/i, /finish/i]) >= 0;
        });
        return headerRow === undefined
          ? []
          : Array.from(headerRow.cells).map((cell) => normalizedText(elementText(cell)).toLowerCase());
      })()
    : [];
  const nameColumn = findColumnIndex(headers, [/name/i, /parkrunner/i]);
  const timeColumn = findColumnIndex(headers, [/time/i, /finish/i]);

  let validation = emptyValidationSummary();
  const records: ParticipantRecord[] = [];
  const usedIds = new Set<string>();

  rows.forEach((row, rowIndex) => {
    const parsed = parseResultRow(
      row,
      savedRows.length > 0,
      nameColumn,
      timeColumn,
      rowIndex,
      usedIds,
    );
    if (!parsed.ok) {
      validation = recordExcludedRow(validation, parsed.reason);
      return;
    }
    records.push(parsed.value);
  });

  if (records.length === 0) {
    return noValidRecords(validation);
  }

  return {
    ok: true,
    value: records,
    validation,
  };
}
