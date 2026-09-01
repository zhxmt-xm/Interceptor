import { buildInterceptorToolRegistry, type InterceptorToolDefinition } from '@interceptor/tools';

export const PLAYGROUND_TOOLS = buildInterceptorToolRegistry();

export const PLAYGROUND_TRAFFIC_SCENARIOS = [
  { id: 'h1-json', title: 'H1 JSON', detail: 'GET with a structured JSON response' },
  { id: 'h1-upload', title: 'H1 upload', detail: 'Chunked request body with origin counters' },
  { id: 'h1-stream', title: 'H1 stream', detail: 'Timed response chunks and TTFB' },
  { id: 'h1-failure', title: 'H1 failure', detail: 'Origin reset or client abort' },
] as const;

export function playgroundTool(name: string): InterceptorToolDefinition {
  const tool = PLAYGROUND_TOOLS.find((item) => item.name === name) ?? PLAYGROUND_TOOLS[0];
  if (tool === undefined) throw new Error('Playground Tool registry is empty.');
  return tool;
}

export function playgroundSchema(name: string): string {
  return JSON.stringify(playgroundTool(name).inputSchema, null, 2);
}