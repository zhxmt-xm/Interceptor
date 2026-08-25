import { ListOrdered } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useDesignState } from '../../state/useDesignState';
import styles from './BreakpointQueueDesign.module.css';

const QUEUED_ROW_CLASS = styles.queuedRow ?? 'queuedRow';
const QUEUED_ROW_POSITION_CLASS = styles.queuedRowPosition ?? 'queuedRowPosition';

interface QueueRowIdentity {
  readonly breakpointId: string;
  readonly position: number;
  readonly state: 'head' | 'queued';
}

const HTTP_ROWS: Readonly<Record<string, QueueRowIdentity>> = {
  'breakpoint-request': {
    breakpointId: 'bp-http-request',
    position: 1,
    state: 'head',
  },
  http: {
    breakpointId: 'bp-http-queued',
    position: 2,
    state: 'queued',
  },
};

function identifyHttpQueueRows(): () => void {
  const cleanups: Array<() => void> = [];
  for (const [captureRow, identity] of Object.entries(HTTP_ROWS)) {
    const row = document.querySelector<HTMLElement>(`[data-capture-row="${captureRow}"]`);
    if (!row) continue;
    row.dataset.breakpointId = identity.breakpointId;
    row.dataset.queueKey = 'http';
    row.dataset.queuePosition = String(identity.position);
    row.dataset.breakpointState = identity.state;
    const status = identity.state === 'queued' ? row.querySelector<HTMLElement>('.st') : null;
    const size = identity.state === 'queued' ? row.querySelector<HTMLElement>('.size') : null;
    const previousStatusClassName = status?.className;
    const previousStatusChildren = status ? Array.from(status.childNodes).map((node) => node.cloneNode(true)) : [];
    const previousSize = size?.textContent;
    if (status) {
      status.className = QUEUED_ROW_POSITION_CLASS;
      status.replaceChildren(document.createTextNode('2'));
      status.setAttribute('aria-label', 'Queued breakpoint');
      status.setAttribute('title', 'Queued breakpoint');
    }
    if (size) size.textContent = 'queued';
    row.classList.toggle(QUEUED_ROW_CLASS, identity.state === 'queued');
    cleanups.push(() => {
      delete row.dataset.breakpointId;
      delete row.dataset.queueKey;
      delete row.dataset.queuePosition;
      delete row.dataset.breakpointState;
      row.classList.remove(QUEUED_ROW_CLASS);
      if (status && previousStatusClassName !== undefined) {
        status.className = previousStatusClassName;
        status.replaceChildren(...previousStatusChildren);
        status.removeAttribute('aria-label');
        status.removeAttribute('title');
      }
      if (size && previousSize !== undefined) size.textContent = previousSize;
    });
  }
  return () => cleanups.forEach((cleanup) => cleanup());
}

export function BreakpointQueueDesign(): React.JSX.Element | null {
  const { state } = useDesignState();
  const [queuedBannerHost, setQueuedBannerHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (state.breakpointState !== 'queue') return;
    return identifyHttpQueueRows();
  }, [state.breakpointState]);

  useLayoutEffect(() => {
    if (state.breakpointState !== 'queue' || state.breakpointQueueSelection !== 'http-queued') {
      setQueuedBannerHost(null);
      return;
    }

    const inspectorHeader = document.querySelector<HTMLElement>('.insp > .itop.http-only');
    const method = inspectorHeader?.querySelector<HTMLElement>('.chip');
    const url = inspectorHeader?.querySelector<HTMLElement>('.iurl');
    const status = inspectorHeader?.querySelector<HTMLElement>('.sbadge');
    if (!inspectorHeader || !method || !url || !status) return;

    const host = document.createElement('div');
    host.dataset.breakpointQueueBannerHost = '';
    inspectorHeader.insertAdjacentElement('afterend', host);

    const previous = {
      statusDisplay: status.style.display,
    };
    status.style.display = 'none';
    setQueuedBannerHost(host);

    return () => {
      status.style.display = previous.statusDisplay;
      host.remove();
      setQueuedBannerHost(null);
    };
  }, [state.breakpointQueueSelection, state.breakpointState]);

  if (!queuedBannerHost) return null;
  return createPortal(
    <div className={styles.queuedBanner} data-parity="breakpoint-queued-banner">
      <span className={styles.queuedState} data-parity="breakpoint-queued-state">
        <ListOrdered aria-hidden="true" />
        Queued
      </span>
      <span className={styles.queuedPosition} data-parity="breakpoint-queued-position">2 of 2</span>
      <span className={styles.queuedQueue}>in HTTP queue</span>
    </div>,
    queuedBannerHost,
  );
}
