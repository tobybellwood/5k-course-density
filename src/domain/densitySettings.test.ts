import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DENSITY_SETTINGS,
  DENSITY_SETTINGS_STORAGE_KEY,
  restoreDensitySettings,
  saveDensitySettings,
  updateDensitySettings,
  validateDensitySettings,
} from './densitySettings';
import { createInitialApplicationState } from '../app/state';
import type { DensitySettings } from '../app/types';

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    values,
  };
}

const current: DensitySettings = {
  gridSizeMeters: 50,
  minimumPeoplePerCircle: 3,
  warningColourThreshold: 8,
};

describe('density settings', () => {
  it('uses the documented defaults and integrates them into initial application state', () => {
    expect(DEFAULT_DENSITY_SETTINGS).toEqual({
      gridSizeMeters: 25,
      minimumPeoplePerCircle: 1,
      warningColourThreshold: null,
    });
    expect(createInitialApplicationState().densitySettings).toEqual(DEFAULT_DENSITY_SETTINGS);
  });

  it('accepts each supported grid size and a disabled warning threshold', () => {
    for (const gridSizeMeters of [10, 25, 50, 100] as const) {
      const result = validateDensitySettings({
        gridSizeMeters,
        minimumPeoplePerCircle: 1,
        warningColourThreshold: null,
      });
      expect(result).toMatchObject({ ok: true, settings: { gridSizeMeters } });
    }
  });

  it('retains the previous settings and reports specific reasons for invalid edits', () => {
    const invalidEdits: Array<[
      Partial<DensitySettings>,
      string,
    ]> = [
      [{ gridSizeMeters: 20 as unknown as DensitySettings['gridSizeMeters'] }, 'invalid-density-grid-size'],
      [{ minimumPeoplePerCircle: 1.5 }, 'invalid-density-minimum'],
      [{ minimumPeoplePerCircle: 0 }, 'invalid-density-minimum'],
      [{ warningColourThreshold: 3 }, 'invalid-density-warning-threshold'],
      [{ warningColourThreshold: 4.5 }, 'invalid-density-warning-threshold'],
    ];

    for (const [edit, reason] of invalidEdits) {
      const result = updateDensitySettings(current, edit);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.settings).toBe(current);
      expect(result.reason).toBe(reason);
      expect(result.validation.reasonCounts[reason as keyof typeof result.validation.reasonCounts]).toBe(1);
      expect(result.notice).toBeTruthy();
      expect(result.validation.notices).toContain(result.notice);
    }
  });

  it('restores valid settings and rejects malformed or cross-field session data', () => {
    const validStorage = storage({
      [DENSITY_SETTINGS_STORAGE_KEY]: JSON.stringify({
        gridSizeMeters: 100,
        minimumPeoplePerCircle: 4,
        warningColourThreshold: 7,
      }),
    });
    expect(restoreDensitySettings(validStorage)).toMatchObject({
      settings: { gridSizeMeters: 100, minimumPeoplePerCircle: 4, warningColourThreshold: 7 },
      restored: true,
      validation: { notices: [], reasonCounts: {} },
    });

    for (const storedValue of ['not-json', JSON.stringify({
      gridSizeMeters: 25,
      minimumPeoplePerCircle: 4,
      warningColourThreshold: 4,
    })]) {
      const restored = restoreDensitySettings(storage({ [DENSITY_SETTINGS_STORAGE_KEY]: storedValue }));
      expect(restored.settings).toEqual(DEFAULT_DENSITY_SETTINGS);
      expect(restored.restored).toBe(false);
      expect(restored.validation.reasonCounts['invalid-density-session-state']).toBe(1);
      expect(restored.validation.notices).toHaveLength(1);
    }
  });

  it('saves only validated settings and reports unavailable storage', () => {
    const session = storage();
    expect(saveDensitySettings(current, session).ok).toBe(true);
    expect(JSON.parse(session.values.get(DENSITY_SETTINGS_STORAGE_KEY) ?? '{}')).toEqual(current);
    expect(saveDensitySettings(current, null).validation.reasonCounts['invalid-density-session-state']).toBe(1);
  });
});


describe('density settings boundary and session fallback coverage', () => {
  it('accepts an explicitly disabled threshold even when the prior threshold was enabled', () => {
    const enabled: DensitySettings = {
      gridSizeMeters: 25,
      minimumPeoplePerCircle: 3,
      warningColourThreshold: 8,
    };

    const result = updateDensitySettings(enabled, { warningColourThreshold: null });

    expect(result).toEqual({
      ok: true,
      settings: {
        gridSizeMeters: 25,
        minimumPeoplePerCircle: 3,
        warningColourThreshold: null,
      },
    });
  });

  it('accepts every supported grid size through a partial edit', () => {
    for (const gridSizeMeters of [10, 25, 50, 100] as const) {
      const result = updateDensitySettings(DEFAULT_DENSITY_SETTINGS, { gridSizeMeters });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.settings.gridSizeMeters).toBe(gridSizeMeters);
        expect(result.settings.minimumPeoplePerCircle).toBe(1);
        expect(result.settings.warningColourThreshold).toBeNull();
      }
    }
  });

  it('rejects threshold equality, below-minimum values, and invalid minimum values atomically', () => {
    const prior: DensitySettings = {
      gridSizeMeters: 50,
      minimumPeoplePerCircle: 5,
      warningColourThreshold: 9,
    };
    const invalidEdits: Array<Partial<DensitySettings>> = [
      { warningColourThreshold: 5 },
      { warningColourThreshold: 4 },
      { warningColourThreshold: 0 },
      { warningColourThreshold: -1 },
      { warningColourThreshold: 5.5 },
      { warningColourThreshold: '6' as unknown as number },
      { minimumPeoplePerCircle: 0 },
      { minimumPeoplePerCircle: -2 },
      { minimumPeoplePerCircle: 1.25 },
      { minimumPeoplePerCircle: '2' as unknown as number },
    ];

    for (const edit of invalidEdits) {
      const result = updateDensitySettings(prior, edit);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.settings).toBe(prior);
        expect(result.validation.notices).toContain(result.notice);
        expect(Object.keys(result.validation.reasonCounts)).toHaveLength(1);
      }
    }
  });

  it('falls back to defaults when session storage is unavailable or throws on read', () => {
    const unavailable = restoreDensitySettings(null);
    expect(unavailable).toEqual(expect.objectContaining({
      settings: DEFAULT_DENSITY_SETTINGS,
      restored: false,
    }));
    expect(unavailable.validation.reasonCounts['invalid-density-session-state']).toBe(1);

    const throwingStorage = {
      getItem: () => {
        throw new Error('session storage unavailable');
      },
      setItem: () => undefined,
    };
    const failedRead = restoreDensitySettings(throwingStorage);
    expect(failedRead).toEqual(expect.objectContaining({
      settings: DEFAULT_DENSITY_SETTINGS,
      restored: false,
    }));
    expect(failedRead.validation.reasonCounts['invalid-density-session-state']).toBe(1);
  });

  it('restores a valid session value and falls back for invalid complete values', () => {
    const restored = restoreDensitySettings(storage({
      [DENSITY_SETTINGS_STORAGE_KEY]: JSON.stringify({
        gridSizeMeters: 10,
        minimumPeoplePerCircle: 2,
        warningColourThreshold: null,
      }),
    }));
    expect(restored.settings).toEqual({
      gridSizeMeters: 10,
      minimumPeoplePerCircle: 2,
      warningColourThreshold: null,
    });
    expect(restored.restored).toBe(true);
    expect(restored.validation.notices).toEqual([]);

    const invalid = restoreDensitySettings(storage({
      [DENSITY_SETTINGS_STORAGE_KEY]: JSON.stringify({
        gridSizeMeters: 25,
        minimumPeoplePerCircle: 3,
        warningColourThreshold: 3,
      }),
    }));
    expect(invalid.settings).toEqual(DEFAULT_DENSITY_SETTINGS);
    expect(invalid.restored).toBe(false);
    expect(invalid.validation.reasonCounts['invalid-density-session-state']).toBe(1);
  });
});
