// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { AppController } from './state';
import {
  InputCoordinator,
  getExamplePaths,
} from './inputCoordinator';

const courseXml = `
  <gpx><trk><trkseg>
    <trkpt lat="51.5000" lon="-0.1000" />
    <trkpt lat="51.5010" lon="-0.1000" />
  </trkseg></trk></gpx>
`;

const resultsHtml = `
  <table>
    <tr><th>Name</th><th>Time</th></tr>
    <tr><td>Alex Runner</td><td>25:00</td></tr>
  </table>
`;

function response(text: string, ok = true): Response {
  return { ok, status: ok ? 200 : 503, text: async () => text } as Response;
}

describe('InputCoordinator', () => {
  it('loads both bundled sources in parallel using data-attribute paths', async () => {
    const requested: string[] = [];
    const controller = new AppController();
    const coordinator = new InputCoordinator({
      controller,
      fetcher: async (url) => {
        requested.push(String(url));
        return response(String(url).includes('course') ? courseXml : resultsHtml);
      },
    });

    const result = await coordinator.loadBundledExamples({
      dataset: {
        exampleCourse: '/examples/course.gpx',
        exampleResults: '/examples/results.html',
      },
    });

    expect(requested).toEqual(['/examples/course.gpx', '/examples/results.html']);
    expect(result.course.ok).toBe(true);
    expect(result.results.ok).toBe(true);
    expect(result.state.course?.points).toHaveLength(2);
    expect(result.state.participants).toHaveLength(1);
    expect(coordinator.bundledPaths).toEqual({
      course: '/examples/course.gpx',
      results: '/examples/results.html',
    });
  });

  it('replaces course and results independently after successful local reads', async () => {
    const controller = new AppController();
    const coordinator = new InputCoordinator({
      controller,
      fetcher: async (url) => response(String(url).endsWith('.gpx') ? courseXml : resultsHtml),
    });
    await coordinator.loadBundledExamples();

    const replacementXml = courseXml.replace('51.5010', '51.5020');
    const replacementResults = resultsHtml.replace('25:00', '26:00');
    const courseResult = await coordinator.replaceCourseFile(
      new File([replacementXml], 'replacement.GPX'),
    );
    const resultsResult = await coordinator.replaceResultsFile(
      new File([replacementResults], 'replacement.HTM'),
    );

    expect(courseResult.ok).toBe(true);
    expect(resultsResult.ok).toBe(true);
    expect(controller.state.course?.points[1]?.lat).toBe(51.502);
    expect(controller.state.participants[0]?.finishDurationSeconds).toBe(1560);
    expect(controller.state.simulationTimeSeconds).toBe(0);
  });

  it('retains the current input and reports the named failure for unsupported files', async () => {
    const controller = new AppController();
    const coordinator = new InputCoordinator({
      controller,
      fetcher: async (url) => response(String(url).endsWith('.gpx') ? courseXml : resultsHtml),
    });
    await coordinator.loadBundledExamples();
    const previousCourse = controller.state.course;

    const result = await coordinator.replaceCourseFile(
      new File(['not a GPX'], 'replacement.txt'),
    );

    expect(result.ok).toBe(false);
    expect(controller.state.course).toBe(previousCourse);
    expect(controller.state.validation.reasonCounts['unsupported-file-type']).toBe(1);
    expect(controller.state.validation.notices.join(' ')).toContain('replacement.txt');
    expect(controller.state.validation.notices.join(' ')).toContain('previous course was retained');
  });

  it('exposes the documented default example paths', () => {
    expect(getExamplePaths()).toEqual({
      course: './examples/onthegomap-5-km-route.gpx',
      results: './examples/results%20_%20Riverbank%20parkrun.html',
    });
  });
});
