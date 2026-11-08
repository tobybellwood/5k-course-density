import type {
  DensitySettings,
  DensitySettingsValidationReason,
  DensitySettingsValidationResult,
  ValidationSummary,
} from '../app/types';
import {
  createValidationSummary,
  emptyValidationSummary,
} from './validation';

/** The only grid sizes supported by the density visualisation. */
export const SUPPORTED_DENSITY_GRID_SIZES = [10, 25, 50, 100] as const;

export const DEFAULT_DENSITY_SETTINGS: DensitySettings = Object.freeze({
  gridSizeMeters: 25,
  minimumPeoplePerCircle: 1,
  warningColourThreshold: null,
});

export const DENSITY_SETTINGS_STORAGE_KEY = 'course-density-settings';

const VALIDATION_NOTICES: Record<DensitySettingsValidationReason, string> = {
  'invalid-density-grid-size': 'Grid size must be 10, 25, 50, or 100 metres.',
  'invalid-density-minimum': 'Minimum people-per-circle filter must be a whole number of at least 1.',
  'invalid-density-warning-threshold': 'Warning colour threshold must be disabled or a whole number greater than the minimum people-per-circle filter.',
  'invalid-density-session-state': 'Saved density settings were unavailable or invalid, so the default density settings were restored.',
};

type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type DensitySettingsStorageResult = {
  readonly settings: DensitySettings;
  readonly validation: ValidationSummary;
  readonly restored: boolean;
};

export type DensitySettingsSaveResult = {
  readonly ok: boolean;
  readonly validation: ValidationSummary;
};

function isSettingsObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSupportedGridSize(value: unknown): value is DensitySettings['gridSizeMeters'] {
  return (SUPPORTED_DENSITY_GRID_SIZES as readonly number[]).includes(value as number);
}

function isValidMinimum(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isValidWarningThreshold(value: unknown, minimum: number): value is number | null {
  return value === null || (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > minimum
  );
}

function freezeSettings(settings: DensitySettings): DensitySettings {
  return Object.freeze({ ...settings });
}

function failure(
  reason: DensitySettingsValidationReason,
  current: DensitySettings,
): DensitySettingsValidationResult {
  const notice = VALIDATION_NOTICES[reason];
  const validation = createValidationSummary({
    notices: [notice],
    reasonCounts: { [reason]: 1 },
  });
  return { ok: false, settings: current, reason, notice, validation };
}

/**
 * Validate a complete settings candidate. On failure, the returned settings
 * reference is the previous valid settings, so callers can commit atomically.
 */
export function validateDensitySettings(
  input: unknown,
  current: DensitySettings = DEFAULT_DENSITY_SETTINGS,
): DensitySettingsValidationResult {
  if (!isSettingsObject(input)) {
    return failure('invalid-density-session-state', current);
  }

  const candidate = input;
  if (!isSupportedGridSize(candidate.gridSizeMeters)) {
    return failure('invalid-density-grid-size', current);
  }
  if (!isValidMinimum(candidate.minimumPeoplePerCircle)) {
    return failure('invalid-density-minimum', current);
  }
  if (!isValidWarningThreshold(candidate.warningColourThreshold, candidate.minimumPeoplePerCircle)) {
    return failure('invalid-density-warning-threshold', current);
  }

  return {
    ok: true,
    settings: freezeSettings({
      gridSizeMeters: candidate.gridSizeMeters,
      minimumPeoplePerCircle: candidate.minimumPeoplePerCircle,
      warningColourThreshold: candidate.warningColourThreshold,
    }),
  };
}

export function isValidDensitySettings(value: unknown): value is DensitySettings {
  return validateDensitySettings(value).ok;
}

/** Validate a partial edit against the current settings and preserve omitted fields. */
export function updateDensitySettings(
  current: DensitySettings,
  edit: Partial<DensitySettings>,
): DensitySettingsValidationResult {
  if (!isSettingsObject(edit)) {
    return failure('invalid-density-session-state', current);
  }
  return validateDensitySettings({ ...current, ...edit }, current);
}

function unavailableStorage(): SettingsStorage | null {
  try {
    if (typeof globalThis.sessionStorage === 'undefined') {
      return null;
    }
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function storageValidationNotice(): ValidationSummary {
  return createValidationSummary({
    notices: [VALIDATION_NOTICES['invalid-density-session-state']],
    reasonCounts: { 'invalid-density-session-state': 1 },
  });
}

/**
 * Restore settings from sessionStorage only when the stored JSON is a valid
 * complete settings object. Storage access and JSON failures are contained.
 */
export function restoreDensitySettings(
  storage: SettingsStorage | null | undefined = unavailableStorage(),
): DensitySettingsStorageResult {
  if (storage === null || storage === undefined) {
    return {
      settings: DEFAULT_DENSITY_SETTINGS,
      validation: storageValidationNotice(),
      restored: false,
    };
  }

  let storedValue: string | null;
  try {
    storedValue = storage.getItem(DENSITY_SETTINGS_STORAGE_KEY);
  } catch {
    return {
      settings: DEFAULT_DENSITY_SETTINGS,
      validation: storageValidationNotice(),
      restored: false,
    };
  }

  if (storedValue === null) {
    return {
      settings: DEFAULT_DENSITY_SETTINGS,
      validation: emptyValidationSummary(),
      restored: false,
    };
  }

  try {
    const parsed: unknown = JSON.parse(storedValue);
    const result = validateDensitySettings(parsed, DEFAULT_DENSITY_SETTINGS);
    if (!result.ok) {
      return {
        settings: DEFAULT_DENSITY_SETTINGS,
        validation: storageValidationNotice(),
        restored: false,
      };
    }
    return {
      settings: result.settings,
      validation: emptyValidationSummary(),
      restored: true,
    };
  } catch {
    return {
      settings: DEFAULT_DENSITY_SETTINGS,
      validation: storageValidationNotice(),
      restored: false,
    };
  }
}

/** Persist already validated settings for this browser session only. */
export function saveDensitySettings(
  settings: DensitySettings,
  storage: SettingsStorage | null | undefined = unavailableStorage(),
): DensitySettingsSaveResult {
  const valid = validateDensitySettings(settings, DEFAULT_DENSITY_SETTINGS);
  if (!valid.ok) {
    return { ok: false, validation: valid.validation };
  }
  if (storage === null || storage === undefined) {
    return { ok: false, validation: storageValidationNotice() };
  }

  try {
    storage.setItem(DENSITY_SETTINGS_STORAGE_KEY, JSON.stringify(valid.settings));
    return { ok: true, validation: emptyValidationSummary() };
  } catch {
    return { ok: false, validation: storageValidationNotice() };
  }
}
