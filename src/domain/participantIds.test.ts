import { describe, expect, it } from 'vitest';

import {
  createParticipantId,
  normalizeParticipantName,
  normalizeRowIndex,
} from './participantIds';

describe('participant IDs', () => {
  it('normalizes source row indexes to stable one-based suffixes', () => {
    expect(normalizeRowIndex(0)).toBe('0001');
    expect(normalizeRowIndex(11)).toBe('0012');
  });

  it('normalizes names without changing the display value', () => {
    expect(normalizeParticipantName('  José  Smith ')).toBe('jose-smith');
  });

  it('adds a row-based collision suffix for duplicate normalized names', () => {
    const usedIds = new Set<string>();

    expect(createParticipantId('Alex Runner', 0, usedIds)).toBe('alex-runner');
    expect(createParticipantId(' alex   runner ', 4, usedIds)).toBe('alex-runner-0005');
    expect(createParticipantId('Alex Runner', 4, usedIds)).toBe('alex-runner-0005-2');
  });

  it('keeps empty normalized names addressable', () => {
    expect(createParticipantId('---', 2, new Set())).toBe('participant-0003');
  });
});
