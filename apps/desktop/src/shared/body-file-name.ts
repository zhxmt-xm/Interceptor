export function suggestedBodyFileName(
  url: string,
  mime: string | undefined,
  fallback: 'request-body' | 'response-body',
): string {
  try {
    const segment = new URL(url).pathname.split('/').filter(Boolean).at(-1);
    if (segment) return decodeURIComponent(segment);
  } catch {
  }
  const essence = mime?.split(';', 1)[0]?.trim().toLowerCase();
  const extension = essence === 'video/mp4'
    ? 'mp4'
    : essence === 'video/webm'
      ? 'webm'
      : essence === 'audio/mpeg'
        ? 'mp3'
        : essence === 'audio/mp4'
          ? 'm4a'
          : essence === 'audio/ogg'
            ? 'ogg'
            : essence === 'video/ogg'
              ? 'ogv'
              : 'bin';
  return `${fallback}.${extension}`;
}