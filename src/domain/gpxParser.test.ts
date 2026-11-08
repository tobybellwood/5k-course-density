import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ParseResult } from '../app/types';
import { interpolateCoordinate } from './geometry';
import { parseGpx } from './gpxParser';

/**
 * Vitest runs in Node for the domain suite, while the production parser uses
 * the browser's DOMParser. This small XML DOM adapter is limited to the DOM
 * surface exercised by parseGpx and keeps these tests dependency-free.
 */
class TestElement {
  readonly localName: string;
  readonly tagName: string;
  parentElement: TestElement | null = null;
  private readonly attributes: ReadonlyMap<string, string>;

  constructor(tagName: string, attributes: ReadonlyMap<string, string>) {
    this.localName = tagName.split(':').pop()?.toLowerCase() ?? '';
    this.tagName = tagName;
    this.attributes = attributes;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
}

class TestDocument {
  readonly documentElement: TestElement | null;
  private readonly elements: readonly TestElement[];

  constructor(documentElement: TestElement | null, elements: readonly TestElement[]) {
    this.documentElement = documentElement;
    this.elements = elements;
  }

  getElementsByTagName(name: string): Element[] {
    const elements = name === '*'
      ? this.elements
      : this.elements.filter((element) => element.localName === name.toLowerCase());
    return elements as unknown as Element[];
  }
}

class TestDomParser {
  parseFromString(source: string): Document {
    const elements: TestElement[] = [];
    const stack: TestElement[] = [];
    let root: TestElement | null = null;
    let malformed = false;
    const tokens = source.match(/<!--[\s\S]*?-->|<[^>]*>/g) ?? [];

    for (const token of tokens) {
      if (token.startsWith('<!--') || token.startsWith('<?') || token.startsWith('<!')) {
        continue;
      }

      const closingMatch = token.match(/^<\/\s*([^\s>]+)\s*>$/);
      if (closingMatch !== null) {
        const element = stack.pop();
        if (element === undefined || element.tagName !== closingMatch[1]) {
          malformed = true;
          break;
        }
        continue;
      }

      const openingMatch = token.match(/^<\s*([^\s/>]+)([\s\S]*?)\s*(\/)?\s*>$/);
      if (openingMatch === null) {
        malformed = true;
        break;
      }

      if (stack.length === 0 && root !== null) {
        malformed = true;
        break;
      }

      const element = new TestElement(
        openingMatch[1],
        readAttributes(openingMatch[2]),
      );
      element.parentElement = stack.at(-1) ?? null;
      elements.push(element);
      root ??= element;

      if (openingMatch[3] === undefined) {
        stack.push(element);
      }
    }

    if (stack.length > 0) {
      malformed = true;
    }

    if (malformed || root === null) {
      const parserError = new TestElement('parsererror', new Map());
      return new TestDocument(parserError, [parserError]) as unknown as Document;
    }

    return new TestDocument(root, elements) as unknown as Document;
  }
}

function readAttributes(text: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (const match of text.matchAll(pattern)) {
    attributes.set(match[1], match[3] ?? match[4] ?? '');
  }
  return attributes;
}

const globalObject = globalThis as unknown as { DOMParser?: unknown };
let previousDomParser: unknown;

beforeAll(() => {
  previousDomParser = globalObject.DOMParser;
  Object.defineProperty(globalObject, 'DOMParser', {
    configurable: true,
    value: TestDomParser,
    writable: true,
  });
});

afterAll(() => {
  if (previousDomParser === undefined) {
    delete globalObject.DOMParser;
  } else {
    Object.defineProperty(globalObject, 'DOMParser', {
      configurable: true,
      value: previousDomParser,
      writable: true,
    });
  }
});

function expectFailure<T>(result: ParseResult<T>) {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error('Expected a parse failure');
  }
  return result.validation;
}

function gpx(points: string): string {
  return `<gpx><trk><trkseg>${points}</trkseg></trk></gpx>`;
}

describe('parseGpx', () => {
  it('reports malformed XML without returning a course', () => {
    const validation = expectFailure(
      parseGpx('<gpx><trkseg><trkpt lat="51" lon="-1"></trkseg></gpx>'),
    );

    expect(validation.reasonCounts['malformed-gpx']).toBe(1);
    expect(validation.notices).toContain(
      'Unable to load GPX: The GPX document is malformed.',
    );
  });

  it('excludes track points with missing, non-numeric, and out-of-range attributes', () => {
    const result = parseGpx(gpx([
      '<trkpt lat="51" lon="-1" />',
      '<trkpt lat="51.001" lon="-1.001" />',
      '<trkpt lat="north" lon="-1" />',
      '<trkpt lat="95" lon="-1" />',
      '<trkpt lat="51" lon="181" />',
    ].join('')));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected valid points to produce a course');
    }

    expect(result.value.points).toHaveLength(2);
    expect(result.value.points.map(({ lat, lon }) => ({ lat, lon }))).toEqual([
      { lat: 51, lon: -1 },
      { lat: 51.001, lon: -1.001 },
    ]);
    expect(result.validation.excludedRows).toBe(3);
    expect(result.validation.reasonCounts['invalid-track-point']).toBe(3);
  });

  it('rejects a document with fewer than two usable track points', () => {
    const validation = expectFailure(
      parseGpx(gpx([
        '<trkpt lat="51" lon="-1" />',
        '<trkpt lat="not-a-number" lon="-1" />',
      ].join(''))),
    );

    expect(validation.excludedRows).toBe(1);
    expect(validation.reasonCounts['invalid-track-point']).toBe(1);
    expect(validation.reasonCounts['insufficient-track-points']).toBe(1);
    expect(validation.notices).toContain(
      'Unable to load GPX: fewer than two usable track points were found.',
    );
  });

  it('preserves repeated points and skips the zero-length segment during interpolation', () => {
    const result = parseGpx(gpx([
      '<trkpt lat="51" lon="-1" />',
      '<trkpt lat="51" lon="-1" />',
      '<trkpt lat="51.001" lon="-1" />',
    ].join('')));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected repeated points to produce a course');
    }

    expect(result.value.points).toHaveLength(3);
    expect(result.value.points[1].cumulativeDistanceMeters).toBe(0);
    expect(interpolateCoordinate(result.value.points, 0.5).lat).toBeCloseTo(51.0005, 9);
    expect(interpolateCoordinate(result.value.points, 0.5).lon).toBe(-1);
  });

  it('uses the first coordinate for every fraction on a zero-distance route', () => {
    const result = parseGpx(gpx([
      '<trkpt lat="51" lon="-1" />',
      '<trkpt lat="51" lon="-1" />',
    ].join('')));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected repeated coordinates to produce a course');
    }

    expect(result.value.totalDistanceMeters).toBe(0);
    for (const fraction of [-1, 0, 0.5, 1, 2]) {
      expect(interpolateCoordinate(result.value.points, fraction)).toEqual({
        lat: 51,
        lon: -1,
      });
    }
  });

  it('returns exact route endpoints for boundary and out-of-range fractions', () => {
    const result = parseGpx(gpx([
      '<trkpt lat="51" lon="-1" />',
      '<trkpt lat="51.001" lon="-1.001" />',
    ].join('')));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected two valid points to produce a course');
    }

    const first = { lat: 51, lon: -1 };
    const last = { lat: 51.001, lon: -1.001 };
    expect(interpolateCoordinate(result.value.points, 0)).toEqual(first);
    expect(interpolateCoordinate(result.value.points, -1)).toEqual(first);
    expect(interpolateCoordinate(result.value.points, 1)).toEqual(last);
    expect(interpolateCoordinate(result.value.points, 2)).toEqual(last);
  });
});
