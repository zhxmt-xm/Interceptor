export function splitKvTextLines(value: string, lineTop: (start: number, end: number) => number): string[] {
  const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)];
  if (!segments.length) return [''];
  const lines: string[] = [];
  let first = 0;
  while (first < segments.length) {
    const firstSegment = segments[first]!;
    const top = lineTop(firstSegment.index, firstSegment.index + firstSegment.segment.length);
    let next = first + 1;
    let end = segments.length;
    while (next < end) {
      const middle = Math.floor((next + end) / 2);
      const segment = segments[middle]!;
      if (lineTop(segment.index, segment.index + segment.segment.length) === top) next = middle + 1;
      else end = middle;
    }
    lines.push(value.slice(firstSegment.index, segments[next]?.index ?? value.length));
    first = next;
  }
  return lines;
}