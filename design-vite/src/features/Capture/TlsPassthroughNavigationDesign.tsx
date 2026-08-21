import { ListFilter } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useDesignState } from '../../state/useDesignState';
import styles from './TlsPassthroughNavigationDesign.module.css';

const TARGET_HOST = 'afdfp-rdgateway-r0.wvd.microsoft.com';
const TARGET_PATTERN = '*.wvd.microsoft.com';

export function TlsPassthroughNavigationDesign(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  const [host, setHost] = useState<Element | null>(null);

  useEffect(() => {
    let retry: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      const resolveHost = (): void => {
        const nextHost = Array.from(document.querySelectorAll('.tunnel-copy')).find((candidate) => {
          const rect = candidate.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }) ?? null;
        setHost(nextHost);
        if (!nextHost) {
          retry = window.setTimeout(resolveHost, 50);
        }
      };
      resolveHost();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (retry !== undefined) window.clearTimeout(retry);
    };
  }, [state.scene]);

  useEffect(() => {
    if (!state.tlsPassthroughTargetPattern || !state.tlsPassthroughTargetExpires) {
      return undefined;
    }
    const timer = window.setTimeout(() => updateState({
      tlsPassthroughTargetPattern: '',
      tlsPassthroughTargetExpires: false,
    }), 3_000);
    return () => window.clearTimeout(timer);
  }, [
    state.tlsPassthroughTargetExpires,
    state.tlsPassthroughTargetPattern,
    state.tlsPassthroughTargetSequence,
    updateState,
  ]);

  if (!host || state.scene !== 'tunnel' || state.mitm !== 'active') {
    return null;
  }

  return createPortal(
    <button
      className={styles.navigate}
      data-parity="tls-tunnel-view-passthrough"
      type="button"
      onClick={() => updateState({
        view: 'settings',
        settings: 'tls-passthrough',
        tlsPassthrough: 'ready',
        tlsPassthroughTargetHost: TARGET_HOST,
        tlsPassthroughTargetPattern: TARGET_PATTERN,
        tlsPassthroughTargetSequence: state.tlsPassthroughTargetSequence + 1,
        tlsPassthroughTargetExpires: true,
      })}
    >
      <ListFilter aria-hidden="true" />
      View passthrough pattern
    </button>,
    host,
  );
}