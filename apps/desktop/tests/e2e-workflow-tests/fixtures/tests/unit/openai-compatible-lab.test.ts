import { afterEach, describe, expect, it } from 'vitest';

import { OpenAiCompatibleLab } from '../../openai-compatible-lab';

const labs: OpenAiCompatibleLab[] = [];

afterEach(async () => {
  await Promise.all(labs.splice(0).map((lab) => lab.close()));
});

describe('OpenAiCompatibleLab', () => {
  it('streams one structured Tool Call with JSON arguments', async () => {
    const lab = await OpenAiCompatibleLab.start();
    labs.push(lab);
    lab.enqueueToolCall({
      callId: 'call-discover',
      name: 'discover_tools',
      arguments: { capabilityId: 'traffic' },
    });

    const response = await fetch(`${lab.baseUrl('tool-call')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'test-model' }),
    });
    const events = (await response.text())
      .split('\n\n')
      .filter(Boolean)
      .map((line) => line.replace(/^data: /, ''));

    expect(events).toEqual([
      JSON.stringify({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call-discover',
              type: 'function',
              function: {
                name: 'discover_tools',
                arguments: JSON.stringify({ capabilityId: 'traffic' }),
              },
            }],
          },
        }],
      }),
      '[DONE]',
    ]);
  });
});
