import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../RequestInspector/KvValue.module.css', () => ({
  default: { measure: 'measure' },
}));

import {
  requestKvLineMeasurement,
  type KvLineMeasurement,
} from '../../RequestInspector/kvLineMeasurement';
import type { KvTextSegment } from '../../utils';

const CHARS_PER_LINE = 5;
const LINE_HEIGHT = 18;
const GAP = '4px';

class FakeTextNode {
  constructor(readonly text: string) {}
}

class FakeRange {
  private start = 0;

  setStart(_node: FakeTextNode, offset: number): void {
    this.start = offset;
  }

  setEnd(): void {
    /* 行首位置只取决于 start。 */
  }

  getBoundingClientRect(): { top: number } {
    return { top: Math.floor(this.start / CHARS_PER_LINE) * LINE_HEIGHT };
  }
}

class FakeElement {
  className = '';
  readonly style: Record<string, string> = {};
  isConnected = true;
  removed = false;
  readonly children: FakeElement[] = [];
  firstChild: FakeTextNode | null = null;

  constructor(readonly width = 100) {}

  set textContent(value: string) {
    this.firstChild = new FakeTextNode(value);
  }

  get textContent(): string {
    return this.firstChild?.text ?? '';
  }

  get lastElementChild(): FakeElement | null {
    return this.children.at(-1) ?? null;
  }

  append(child: FakeElement): void {
    this.children.push(child);
  }

  remove(): void {
    this.removed = true;
  }

  getBoundingClientRect(): { width: number } {
    return { width: this.width };
  }

  setAttribute(): void {
    /* 测量节点只需要 aria-hidden。 */
  }
}

let frames: FrameRequestCallback[] = [];
let host: FakeElement;
let action: FakeElement;

function segmentsFor(value: string): readonly KvTextSegment[] {
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)];
}

function createRequest(
  value: string,
  overrides: Partial<Pick<KvLineMeasurement, 'isCurrent' | 'segments' | 'resolve'>> = {},
): KvLineMeasurement {
  return {
    host: host as unknown as HTMLElement,
    value,
    isCurrent: () => false,
    segments: () => segmentsFor(value),
    resolve: () => {},
    ...overrides,
  };
}

describe('requestKvLineMeasurement', () => {
  beforeEach(() => {
    frames = [];
    action = new FakeElement(10);
    const line = new FakeElement(100);
    line.children.push(action);
    host = new FakeElement(100);
    host.children.push(line);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('getComputedStyle', () => ({ columnGap: GAP }));
    vi.stubGlobal('document', {
      createElement: () => new FakeElement(0),
      createRange: () => new FakeRange(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('measures every value in one animation frame and removes the measure nodes', () => {
    const first = vi.fn();
    requestKvLineMeasurement(createRequest('abcdefghij', { resolve: first }));
    // 同一 host 的新请求覆盖未执行的旧请求。
    const latest = vi.fn();
    requestKvLineMeasurement(createRequest('abcdefghij', { resolve: latest }));
    expect(frames).toHaveLength(1);

    frames[0]!(0);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith({
      key: expect.any(String),
      lines: ['abcde', 'fghij'],
    });
    const measures = host.children.filter((child) => child.removed);
    expect(measures).toHaveLength(1);
  });

  it('skips values whose key is already current without creating a measure node', () => {
    const segments = vi.fn(() => segmentsFor('abcde'));
    const resolve = vi.fn();
    requestKvLineMeasurement(createRequest('abcde', {
      isCurrent: () => true,
      segments,
      resolve,
    }));

    frames[0]!(0);
    expect(segments).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    expect(host.children).toHaveLength(1);
  });

  it('resolves each distinct host once per batch', () => {
    const otherAction = new FakeElement(10);
    const otherLine = new FakeElement(100);
    otherLine.children.push(otherAction);
    const otherHost = new FakeElement(200);
    otherHost.children.push(otherLine);
    const resolves = [vi.fn(), vi.fn()];

    requestKvLineMeasurement(createRequest('abc', { resolve: resolves[0]! }));
    requestKvLineMeasurement({
      ...createRequest('abcdefghij', { resolve: resolves[1]! }),
      host: otherHost as unknown as HTMLElement,
    });

    frames[0]!(0);
    expect(resolves[0]).toHaveBeenCalledWith({ key: expect.any(String), lines: ['abc'] });
    expect(resolves[1]).toHaveBeenCalledWith({ key: expect.any(String), lines: ['abcde', 'fghij'] });
  });
});
