import {
  Coordinate,
  CourseTrack,
  DomainValidationResult,
  RouteBounds,
  TrackPoint,
} from '../app/types';
import {
  createCoordinate,
  createCourseTrack,
  createTrackPoint,
  isValidCoordinate,
} from './validation';

/** Mean Earth radius used by the route-distance calculation. */
export const EARTH_RADIUS_METERS = 6_371_000;

const DEGREES_TO_RADIANS = Math.PI / 180;

function radians(degrees: number): number {
  return degrees * DEGREES_TO_RADIANS;
}

/**
 * Calculate the great-circle distance between two geographic coordinates.
 *
 * The haversine formula is stable for the short distances used by running
 * routes and returns metres using the domain's fixed Earth radius.
 */
export function haversineDistance(
  first: Coordinate,
  second: Coordinate,
): number {
  const latitudeDelta = radians(second.lat - first.lat);
  const longitudeDelta = radians(second.lon - first.lon);
  const firstLatitude = radians(first.lat);
  const secondLatitude = radians(second.lat);

  const sineLatitude = Math.sin(latitudeDelta / 2);
  const sineLongitude = Math.sin(longitudeDelta / 2);
  const haversine =
    sineLatitude * sineLatitude +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * sineLongitude * sineLongitude;

  // Floating-point rounding can put the expression just outside [0, 1].
  const centralAngle = 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
  return EARTH_RADIUS_METERS * centralAngle;
}

/**
 * Calculate the smallest bounds containing all supplied coordinates.
 *
 * An empty collection has no geographic bounds and is rejected explicitly.
 */
export function calculateRouteBounds(
  coordinates: readonly Coordinate[],
): RouteBounds {
  if (coordinates.length === 0) {
    throw new RangeError('At least one coordinate is required to calculate route bounds');
  }
  if (!coordinates.every(isValidCoordinate)) {
    throw new RangeError('Route bounds require valid coordinates');
  }

  let minLat = coordinates[0].lat;
  let maxLat = coordinates[0].lat;
  let minLon = coordinates[0].lon;
  let maxLon = coordinates[0].lon;

  for (const coordinate of coordinates.slice(1)) {
    minLat = Math.min(minLat, coordinate.lat);
    maxLat = Math.max(maxLat, coordinate.lat);
    minLon = Math.min(minLon, coordinate.lon);
    maxLon = Math.max(maxLon, coordinate.lon);
  }

  return Object.freeze({ minLat, maxLat, minLon, maxLon });
}

/**
 * Calculate cumulative route distance for an ordered coordinate sequence.
 * Repeated consecutive coordinates remain represented by equal cumulative
 * distances in the returned array.
 */
export function calculateCumulativeDistances(
  coordinates: readonly Coordinate[],
): readonly number[] {
  if (!coordinates.every(isValidCoordinate)) {
    throw new RangeError('Cumulative distance requires valid coordinates');
  }

  if (coordinates.length === 0) {
    return Object.freeze([]);
  }

  const cumulativeDistances: number[] = [0];
  let totalDistanceMeters = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    totalDistanceMeters += haversineDistance(coordinates[index - 1], coordinates[index]);
    cumulativeDistances.push(totalDistanceMeters);
  }

  return Object.freeze(cumulativeDistances);
}

/**
 * Build an immutable CourseTrack from ordered coordinates.
 * This adapter keeps geometry calculations coupled to the domain constructors
 * so invalid coordinates cannot enter a CourseTrack.
 */
export function createCourseTrackFromCoordinates(
  coordinates: readonly Coordinate[],
): DomainValidationResult<CourseTrack> {
  if (coordinates.length < 2) {
    return { ok: false, reason: 'insufficient-track-points' };
  }
  if (!coordinates.every(isValidCoordinate)) {
    return { ok: false, reason: 'invalid-track-point' };
  }

  const cumulativeDistances = calculateCumulativeDistances(coordinates);
  const trackPoints: TrackPoint[] = [];

  for (let index = 0; index < coordinates.length; index += 1) {
    const coordinate = coordinates[index];
    const result = createTrackPoint(
      coordinate.lat,
      coordinate.lon,
      cumulativeDistances[index],
    );
    if (!result.ok) {
      return result;
    }
    trackPoints.push(result.value);
  }

  return createCourseTrack(
    trackPoints,
    cumulativeDistances[cumulativeDistances.length - 1],
    calculateRouteBounds(coordinates),
  );
}

function clampFraction(fraction: number): number {
  if (Number.isNaN(fraction) || fraction <= 0) {
    return 0;
  }
  if (fraction >= 1 || fraction === Number.POSITIVE_INFINITY) {
    return 1;
  }
  return fraction;
}

/**
 * Interpolate a route coordinate by fraction of cumulative route distance.
 * Repeated points are retained in the track, while zero-length segments are
 * skipped when finding the segment containing the requested distance.
 */
export function interpolateCoordinate(
  points: readonly TrackPoint[],
  fraction: number,
): Coordinate {
  if (points.length === 0) {
    throw new RangeError('At least one track point is required for interpolation');
  }

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const totalDistanceMeters = lastPoint.cumulativeDistanceMeters;

  // A zero-distance route has no meaningful distance parameter. Its first
  // coordinate is the position for every fraction, including fraction 1.
  if (totalDistanceMeters <= 0) {
    return Object.freeze({ lat: firstPoint.lat, lon: firstPoint.lon });
  }

  const clampedFraction = clampFraction(fraction);
  if (clampedFraction === 0) {
    return Object.freeze({ lat: firstPoint.lat, lon: firstPoint.lon });
  }
  if (clampedFraction === 1) {
    return Object.freeze({ lat: lastPoint.lat, lon: lastPoint.lon });
  }

  const targetDistanceMeters = clampedFraction * totalDistanceMeters;
  let currentIndex = 1;
  while (
    currentIndex < points.length &&
    points[currentIndex].cumulativeDistanceMeters < targetDistanceMeters
  ) {
    currentIndex += 1;
  }

  if (currentIndex >= points.length) {
    return Object.freeze({ lat: lastPoint.lat, lon: lastPoint.lon });
  }

  // Move backwards across repeated points so interpolation always uses a
  // non-zero distance segment. The current point remains the first point at
  // or beyond the target distance, preserving exact boundary coordinates.
  let previousIndex = currentIndex - 1;
  while (
    previousIndex >= 0 &&
    points[currentIndex].cumulativeDistanceMeters <= points[previousIndex].cumulativeDistanceMeters
  ) {
    previousIndex -= 1;
  }

  if (previousIndex < 0) {
    return Object.freeze({ lat: points[currentIndex].lat, lon: points[currentIndex].lon });
  }

  const previousPoint = points[previousIndex];
  const currentPoint = points[currentIndex];
  const segmentDistanceMeters =
    currentPoint.cumulativeDistanceMeters - previousPoint.cumulativeDistanceMeters;
  const segmentFraction =
    (targetDistanceMeters - previousPoint.cumulativeDistanceMeters) / segmentDistanceMeters;

  const coordinate = {
    lat: previousPoint.lat + (currentPoint.lat - previousPoint.lat) * segmentFraction,
    lon: previousPoint.lon + (currentPoint.lon - previousPoint.lon) * segmentFraction,
  };
  const result = createCoordinate(coordinate.lat, coordinate.lon);
  if (!result.ok) {
    // Track points have already been validated, so this is defensive only.
    throw new RangeError('Interpolation produced an invalid coordinate');
  }
  return result.value;
}

// Descriptive aliases used by parser and simulation callers.
export const calculateRouteCumulativeDistances = calculateCumulativeDistances;
export const interpolateRouteCoordinate = interpolateCoordinate;
