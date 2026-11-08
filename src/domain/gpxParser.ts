import {
  Coordinate,
  CourseTrack,
  ParseResult,
} from '../app/types';
import { createCourseTrackFromCoordinates } from './geometry';
import {
  addValidationNotice,
  createCoordinate,
  emptyValidationSummary,
  recordExcludedRow,
  recordValidationReason,
} from './validation';

/**
 * Parse a GPX document into an ordered course track.
 *
 * GPX points are read from every `trkseg` in document order. An individual
 * point with a missing, non-numeric, non-finite, or out-of-range coordinate
 * is excluded while the remaining points continue to be parsed.
 */
export function parseGpx(xml: string): ParseResult<CourseTrack> {
  if (typeof xml !== 'string') {
    return malformedGpxResult('The GPX input is not text.');
  }

  let document: Document;
  try {
    document = new DOMParser().parseFromString(xml, 'application/xml');
  } catch {
    return malformedGpxResult('The GPX document could not be parsed.');
  }

  if (hasXmlParserError(document)) {
    return malformedGpxResult('The GPX document is malformed.');
  }

  const pointElements = findTrackPointElements(document);
  let validation = emptyValidationSummary();
  const coordinates: Coordinate[] = [];

  for (const pointElement of pointElements) {
    const latitude = readCoordinateAttribute(pointElement, 'lat');
    const longitude = readCoordinateAttribute(pointElement, 'lon');
    const coordinate = createCoordinate(latitude, longitude);

    if (!coordinate.ok) {
      validation = recordExcludedRow(validation, 'invalid-track-point');
      continue;
    }

    coordinates.push(coordinate.value);
  }

  if (coordinates.length < 2) {
    validation = recordValidationReason(validation, 'insufficient-track-points');
    validation = addValidationNotice(
      validation,
      'Unable to load GPX: fewer than two usable track points were found.',
    );
    return { ok: false, validation };
  }

  const course = createCourseTrackFromCoordinates(coordinates);
  if (!course.ok) {
    validation = recordValidationReason(validation, course.reason);
    validation = addValidationNotice(
      validation,
      'Unable to load GPX: the track points could not form a valid course.',
    );
    return { ok: false, validation };
  }

  if (validation.excludedRows > 0) {
    validation = addValidationNotice(
      validation,
      `${validation.excludedRows} invalid track point${validation.excludedRows === 1 ? '' : 's'} excluded.`,
    );
  }

  return { ok: true, value: course.value, validation };
}

function malformedGpxResult(notice: string): ParseResult<CourseTrack> {
  let validation = emptyValidationSummary();
  validation = recordValidationReason(validation, 'malformed-gpx');
  validation = addValidationNotice(validation, `Unable to load GPX: ${notice}`);
  return { ok: false, validation };
}

function hasXmlParserError(document: Document): boolean {
  if (document.documentElement === null) {
    return true;
  }

  return Array.from(document.getElementsByTagName('*')).some((element) =>
    elementName(element) === 'parsererror',
  );
}

/**
 * Select only trkpt elements nested below a trkseg. Iterating all elements,
 * instead of relying on a namespace-sensitive CSS selector, supports both
 * default-namespaced GPX documents and namespace-free test fixtures.
 */
function findTrackPointElements(document: Document): Element[] {
  return Array.from(document.getElementsByTagName('*')).filter((element) => {
    if (elementName(element) !== 'trkpt') {
      return false;
    }

    let ancestor = element.parentElement;
    while (ancestor !== null) {
      if (elementName(ancestor) === 'trkseg') {
        return true;
      }
      ancestor = ancestor.parentElement;
    }
    return false;
  });
}

function elementName(element: Element): string {
  return (element.localName || element.tagName.split(':').pop() || '').toLowerCase();
}

function readCoordinateAttribute(element: Element, name: 'lat' | 'lon'): number {
  const value = element.getAttribute(name);
  if (value === null || value.trim().length === 0) {
    return Number.NaN;
  }
  return Number(value);
}
