import { useLayoutEffect, useMemo, type PropsWithChildren } from 'react';

import { MonacoFixture } from '../components/MonacoFixture/MonacoFixture';
import { useDesignState } from '../state/useDesignState';
import { describeLimitedCaptureBody, readonlyBodyBytes } from './readonlyBodyData';
import styles from './CaptureCodePreview.module.css';

export function CaptureCodePreview({ children }: PropsWithChildren): React.JSX.Element {
  const { state } = useDesignState();
  useLayoutEffect(() => {
    const button = document.querySelector<HTMLButtonElement>('.bodybar[data-kind="limited"] .bodyfmt');
    if (!button) return;
    const previousDisabled = button.disabled;
    const previousTitle = button.title;
    button.disabled = true;
    button.title = 'Truncated previews cannot be formatted.';
    return () => {
      button.disabled = previousDisabled;
      button.title = previousTitle;
    };
  }, []);
  const source = useMemo(() => {
    if (state.bodyKind !== 'limited') return null;
    const bytes = readonlyBodyBytes(describeLimitedCaptureBody());
    return new TextDecoder().decode(bytes.subarray(0, 2 * 1024 * 1024), { stream: true });
  }, [state.bodyKind]);

  return source === null ? <>{children}</> : (
    <MonacoFixture
      className={`bodybox mono ${styles.captureLimitedCode}`}
      preset="fill"
      language="html"
      source={source}
    />
  );
}
