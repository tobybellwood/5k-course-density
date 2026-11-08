import type {
  Coordinate,
  CourseTrack,
  ParticipantPosition,
  ParticipantRecord,
  SimulationSnapshot,
} from '../app/types';
import { interpolateCoordinate } from './geometry';
import { createParticipantPosition, createSimulationSnapshot } from './validation';

/** Return the greatest finish duration, or zero when no participants are loaded. */
export function calculateTotalDuration(
  participants: readonly ParticipantRecord[],
): number {
  return participants.reduce(
    (maximum, participant) => Math.max(maximum, participant.finishDurationSeconds),
    0,
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Create one immutable position for each participant at the supplied event time.
 * Each participant follows the course at a constant pace based on their finish.
 */
export function simulate(
  course: CourseTrack,
  participants: readonly ParticipantRecord[],
  timeSeconds: number,
): SimulationSnapshot {
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
    throw new RangeError('Simulation time must be a finite non-negative number');
  }

  const positions: ParticipantPosition[] = participants.map((participant) => {
    const routeFraction = clamp(
      timeSeconds / participant.finishDurationSeconds,
      0,
      1,
    );
    const coordinate: Coordinate = interpolateCoordinate(course.points, routeFraction);
    const position = createParticipantPosition(participant, routeFraction, coordinate);
    if (!position.ok) {
      throw new RangeError(`Participant ${participant.id} could not be positioned`);
    }
    return position.value;
  });

  const snapshot = createSimulationSnapshot(timeSeconds, positions);
  if (!snapshot.ok) {
    throw new RangeError('Simulation produced an invalid snapshot');
  }
  return snapshot.value;
}
