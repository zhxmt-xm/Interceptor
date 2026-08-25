import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useDesignState } from '../../state/useDesignState';
import { WebSocketBreakpointControl } from './WebSocketBreakpointControl';
import { WebSocketBreakpointInspector } from './WebSocketBreakpointInspector';
import { WebSocketControlFrameRows } from './WebSocketControlFrameRows';
import { WebSocketQueuedBreakpoint } from './WebSocketQueuedBreakpoint';
import { WebSocketUpgradeBreakpointInspector } from './WebSocketUpgradeBreakpointInspector';

export function WebSocketBreakpointDesign(): React.JSX.Element | null {
  const { state } = useDesignState();
  const [controlHost, setControlHost] = useState<Element | null>(null);
  const [framesHost, setFramesHost] = useState<Element | null>(null);
  const [messagePayloadHost, setMessagePayloadHost] = useState<Element | null>(null);
  const [inspectorHost, setInspectorHost] = useState<Element | null>(null);

  useLayoutEffect(() => {
    setControlHost(document.querySelector('.ws-breakpoint-control-host'));
    setFramesHost(document.querySelector('.wsrows'));
    setMessagePayloadHost(document.querySelector('.wspayload'));
    setInspectorHost(document.querySelector('.insp'));
  }, []);

  useLayoutEffect(() => {
    if (
      !framesHost
      || !messagePayloadHost
      || !state.breakpointQueueSelection.startsWith('websocket-')
    ) return;
    const originalParent = messagePayloadHost.parentNode;
    const originalNextSibling = messagePayloadHost.nextSibling;
    framesHost.insertAdjacentElement('afterend', messagePayloadHost);
    return () => {
      if (!originalParent) return;
      originalParent.insertBefore(messagePayloadHost, originalNextSibling);
    };
  }, [framesHost, messagePayloadHost, state.breakpointQueueSelection]);

  return (
    <>
      {controlHost ? createPortal(<WebSocketBreakpointControl />, controlHost) : null}
      {framesHost ? createPortal(<WebSocketControlFrameRows />, framesHost) : null}
      {messagePayloadHost && state.breakpointState === 'websocket'
        ? createPortal(
            state.breakpointQueueSelection === 'websocket-queued'
              ? <WebSocketQueuedBreakpoint />
              : <WebSocketBreakpointInspector />,
            messagePayloadHost,
          )
        : null}
      {inspectorHost && state.breakpointState.startsWith('websocket-upgrade-')
        ? createPortal(<WebSocketUpgradeBreakpointInspector />, inspectorHost)
        : null}
    </>
  );
}
