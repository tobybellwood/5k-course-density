import type {
  ApplicationState,
  CourseTrack,
  ParseResult,
  ParticipantRecord,
  ValidationSummary,
} from './types';
import { AppController } from './state';
import { parseGpx } from '../domain/gpxParser';
import { parseResults } from '../domain/resultsParser';
import {
  addValidationNotice,
  emptyValidationSummary,
  formatFileReadFailureNotice,
  formatRetainedInputNotice,
  formatUnsupportedFileTypeNotice,
  recordValidationReason,
} from '../domain/validation';

export type ExamplePaths = {
  readonly course: string;
  readonly results: string;
};

export type ExamplePathSource = {
  readonly dataset?: {
    readonly exampleCourse?: string;
    readonly exampleResults?: string;
  };
};

export type InputCoordinatorOptions = {
  readonly controller: AppController;
  readonly fetcher?: typeof fetch;
  readonly parseCourse?: typeof parseGpx;
  readonly parseResults?: typeof parseResults;
};

export type BootstrapResult = {
  readonly course: ParseResult<CourseTrack>;
  readonly results: ParseResult<ParticipantRecord[]>;
  readonly state: ApplicationState;
};

export const BUNDLED_EXAMPLE_RESULTS = Object.freeze({
  62: './examples/results%20_%2062%20people.html',
  411: './examples/results%20_%20411%20people.html',
});

export const DEFAULT_EXAMPLE_PATHS: ExamplePaths = Object.freeze({
  course: './examples/Example_parkrun.gpx',
  results: BUNDLED_EXAMPLE_RESULTS[62],
});

const COURSE_FILE_ACCEPTED_TYPE = 'GPX files (.gpx)';
const RESULTS_FILE_ACCEPTED_TYPE = 'HTML files (.html or .htm)';

type InputKind = 'course' | 'results';

type TextReadResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly validation: ValidationSummary };

function namedFailure(
  reason: 'file-read-failure' | 'unsupported-file-type',
  notice: string,
): ValidationSummary {
  let validation = emptyValidationSummary();
  validation = recordValidationReason(validation, reason);
  return addValidationNotice(validation, notice);
}

function failureResult<T>(validation: ValidationSummary): ParseResult<T> {
  return { ok: false, validation };
}

function inputDescription(kind: InputKind): {
  readonly acceptedType: string;
  readonly retainedInput: string;
} {
  return kind === 'course'
    ? { acceptedType: COURSE_FILE_ACCEPTED_TYPE, retainedInput: 'course' }
    : { acceptedType: RESULTS_FILE_ACCEPTED_TYPE, retainedInput: 'results' };
}

function validationFailureWithFileContext(
  validation: ValidationSummary,
  fileName: string,
  kind: InputKind,
): ValidationSummary {
  const { acceptedType, retainedInput } = inputDescription(kind);
  return addValidationNotice(
    validation,
    `Unable to load "${fileName}": the file contents did not contain a valid ${kind === 'course' ? 'course' : 'results'} input. Accepted type: ${acceptedType}. ${formatRetainedInputNotice(retainedInput)}`,
  );
}

function extensionFor(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot < 0 ? '' : fileName.slice(lastDot).toLowerCase();
}

function isSupportedFile(file: File, kind: InputKind): boolean {
  const extension = extensionFor(file.name);
  return kind === 'course'
    ? extension === '.gpx'
    : extension === '.html' || extension === '.htm';
}

async function readFileText(file: File, kind: InputKind): Promise<TextReadResult> {
  const { acceptedType, retainedInput } = inputDescription(kind);
  if (!isSupportedFile(file, kind)) {
    return {
      ok: false,
      validation: namedFailure(
        'unsupported-file-type',
        formatUnsupportedFileTypeNotice({
          fileName: file.name,
          acceptedType,
          retainedInput,
        }),
      ),
    };
  }

  try {
    return { ok: true, text: await file.text() };
  } catch (error) {
    const detail = error instanceof Error && error.message.length > 0
      ? `The file could not be read: ${error.message}`
      : undefined;
    return {
      ok: false,
      validation: namedFailure(
        'file-read-failure',
        formatFileReadFailureNotice({ fileName: file.name, acceptedType, retainedInput }, detail),
      ),
    };
  }
}

async function fetchText(
  url: string,
  kind: InputKind,
  fetcher: typeof fetch,
): Promise<TextReadResult> {
  const { acceptedType, retainedInput } = inputDescription(kind);
  const fileName = url.split('/').pop() ?? url;

  try {
    const response = await fetcher(url);
    if (!response.ok) {
      return {
        ok: false,
        validation: namedFailure(
          'file-read-failure',
          formatFileReadFailureNotice(
            { fileName, acceptedType, retainedInput },
            `The bundled example request failed with status ${response.status}`,
          ),
        ),
      };
    }
    return { ok: true, text: await response.text() };
  } catch (error) {
    const detail = error instanceof Error && error.message.length > 0
      ? `The bundled example could not be read: ${error.message}`
      : 'The bundled example could not be read';
    return {
      ok: false,
      validation: namedFailure(
        'file-read-failure',
        formatFileReadFailureNotice({ fileName, acceptedType, retainedInput }, detail),
      ),
    };
  }
}

function pathsFrom(source: ExamplePathSource | undefined): ExamplePaths {
  const course = source?.dataset?.exampleCourse?.trim();
  const results = source?.dataset?.exampleResults?.trim();
  return {
    course: course === undefined || course.length === 0 ? DEFAULT_EXAMPLE_PATHS.course : course,
    results: results === undefined || results.length === 0 ? DEFAULT_EXAMPLE_PATHS.results : results,
  };
}

function parserFailure<T>(
  text: string,
  parser: (source: string) => ParseResult<T>,
  fileName: string,
  kind: InputKind,
): ParseResult<T> {
  try {
    const result = parser(text);
    return result.ok
      ? result
      : { ok: false, validation: validationFailureWithFileContext(result.validation, fileName, kind) };
  } catch (error) {
    const detail = error instanceof Error && error.message.length > 0
      ? `The file could not be parsed: ${error.message}`
      : 'The file could not be parsed';
    const { acceptedType, retainedInput } = inputDescription(kind);
    return failureResult(
      namedFailure(
        'file-read-failure',
        formatFileReadFailureNotice({ fileName, acceptedType, retainedInput }, detail),
      ),
    );
  }
}

/** Coordinates bundled and local sources without allowing failed replacements to overwrite valid state. */
export class InputCoordinator {
  private readonly controller: AppController;
  private readonly fetcher: typeof fetch;
  private readonly parseCourse: typeof parseGpx;
  private readonly parseResults: typeof parseResults;
  private examplePaths: ExamplePaths = DEFAULT_EXAMPLE_PATHS;

  public constructor(options: InputCoordinatorOptions) {
    this.controller = options.controller;
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.parseCourse = options.parseCourse ?? parseGpx;
    this.parseResults = options.parseResults ?? parseResults;
  }

  public async loadBundledExamples(source?: ExamplePathSource): Promise<BootstrapResult> {
    this.examplePaths = pathsFrom(source);
    const [courseText, resultsText] = await Promise.all([
      fetchText(this.examplePaths.course, 'course', this.fetcher),
      fetchText(this.examplePaths.results, 'results', this.fetcher),
    ]);

    const course = courseText.ok
      ? parserFailure(courseText.text, this.parseCourse, this.examplePaths.course, 'course')
      : failureResult<CourseTrack>(courseText.validation);
    const results = resultsText.ok
      ? parserFailure(resultsText.text, this.parseResults, this.examplePaths.results, 'results')
      : failureResult<ParticipantRecord[]>(resultsText.validation);
    const state = this.controller.loadInitial(course, results);

    return { course, results, state };
  }

  public async resetToExample(source?: ExamplePathSource): Promise<BootstrapResult> {
    return this.loadBundledExamples(source);
  }

  public async replaceCourseFile(file: File): Promise<ParseResult<CourseTrack>> {
    const readResult = await readFileText(file, 'course');
    const result = readResult.ok
      ? parserFailure(readResult.text, this.parseCourse, file.name, 'course')
      : failureResult<CourseTrack>(readResult.validation);

    if (result.ok) {
      this.controller.replaceCourse(result);
    } else {
      this.controller.updateValidation(result.validation);
    }
    return result;
  }

  public async replaceResultsFile(file: File): Promise<ParseResult<ParticipantRecord[]>> {
    const readResult = await readFileText(file, 'results');
    const result = readResult.ok
      ? parserFailure(readResult.text, this.parseResults, file.name, 'results')
      : failureResult<ParticipantRecord[]>(readResult.validation);

    if (result.ok) {
      this.controller.replaceParticipants(result);
    } else {
      this.controller.updateValidation(result.validation);
    }
    return result;
  }

  public get bundledPaths(): ExamplePaths {
    return this.examplePaths;
  }
}

export function getExamplePaths(source?: ExamplePathSource): ExamplePaths {
  return pathsFrom(source);
}

export function isSupportedCourseFile(file: File): boolean {
  return isSupportedFile(file, 'course');
}

export function isSupportedResultsFile(file: File): boolean {
  return isSupportedFile(file, 'results');
}
