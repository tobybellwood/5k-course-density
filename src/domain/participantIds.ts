const NON_WORD_RUN = /[^a-z0-9]+/g;

/**
 * Convert a source row index into a stable, human-readable four-digit suffix.
 * Row indexes are zero-based internally and one-based in generated IDs.
 */
export function normalizeRowIndex(rowIndex: number): string {
  if (!Number.isInteger(rowIndex) || rowIndex < 0) {
    throw new RangeError('rowIndex must be a non-negative integer');
  }
  return String(rowIndex + 1).padStart(4, '0');
}

/** Normalize a display name for use as an ID component without changing the display name. */
export function normalizeParticipantName(displayName: string): string {
  if (typeof displayName !== 'string') {
    throw new TypeError('displayName must be a string');
  }

  const normalized = displayName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(NON_WORD_RUN, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.length > 0 ? normalized : 'participant';
}

/**
 * Generate an ID that is repeatable for the same source row and unique in one
 * parsed result set. A normalized row index disambiguates normalized-name
 * collisions while the final numeric suffix handles an already-used ID.
 */
export function createParticipantId(
  displayName: string,
  rowIndex: number,
  usedIds: Set<string>,
): string {
  const namePart = normalizeParticipantName(displayName);
  const rowPart = normalizeRowIndex(rowIndex);
  const baseId = namePart === 'participant' ? `${namePart}-${rowPart}` : namePart;

  let id = baseId;
  if (usedIds.has(id)) {
    id = `${baseId}-${rowPart}`;
  }

  let collisionSuffix = 2;
  while (usedIds.has(id)) {
    id = `${baseId}-${rowPart}-${collisionSuffix}`;
    collisionSuffix += 1;
  }

  usedIds.add(id);
  return id;
}
