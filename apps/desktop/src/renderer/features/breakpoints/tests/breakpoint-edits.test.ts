import { describe, expect, it } from 'vitest';

import type { PendingBreakpoint } from '../../../../shared/desktop-api';
import { buildEdit, draftFromBreakpoint } from '../utils';

function pending(overrides: Partial<PendingBreakpoint> = {}): PendingBreakpoint {
  return {
    id: 'bp-1',
    phase: 'request',
    createdAt: 0,
    deadline: 0,
    ruleName: 'Pause on request',
    method: 'POST',
    url: 'https://api.test/upload',
    headers: [{ name: 'content-type', value: 'text/plain' }],
    bodyAvailable: false,
    ...overrides,
  };
}

describe('breakpoint edits', () => {
  it('never clears the real body when the original was never shown', () => {
    // 头部阶段挂起时 UI 只能给出一个空输入框；用户没输入就 Continue，
    // 绝不能把它当成“把正文改成空”，否则真实上传/响应正文会被抹掉。
    const draft = draftFromBreakpoint(pending());
    expect(draft.bodyAvailable).toBe(false);
    expect(draft.body).toBe('');

    expect(buildEdit(draft)).toEqual({
      method: 'POST',
      url: 'https://api.test/upload',
      headers: [{ name: 'content-type', value: 'text/plain' }],
    });
  });

  it('sends a replacement body once the user types one', () => {
    const draft = { ...draftFromBreakpoint(pending()), body: 'replaced' };

    expect(buildEdit(draft)).toMatchObject({ body: 'replaced' });
  });

  it('keeps an intentionally emptied body when the original was visible', () => {
    // WebSocket 消息断点持有完整 payload，清空就是用户的真实意图。
    const draft = {
      ...draftFromBreakpoint(pending({ phase: 'websocket', bodyAvailable: true, body: 'hello' })),
      body: '',
    };

    expect(buildEdit(draft)).toEqual({ body: '' });
  });
});
