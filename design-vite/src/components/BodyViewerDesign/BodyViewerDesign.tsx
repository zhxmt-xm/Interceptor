import { Copy, Download, Maximize2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { IconButton } from '../IconButton/IconButton';
import { MonacoFixture } from '../MonacoFixture/MonacoFixture';
import { SegmentedControl } from '../SegmentedControl/SegmentedControl';
import styles from './BodyViewerDesign.module.css';
import { formatHexDump } from './utils';

interface BodyViewerDesignProps {
  readonly ariaLabel: string;
  readonly bytes?: Uint8Array;
  readonly codePreset?: 'box' | 'message' | 'fill';
  readonly fullscreen?: boolean;
  readonly hex: string;
  readonly language: string;
  readonly meta: string;
  readonly modes: readonly string[];
  readonly onFullscreen: () => void;
  readonly onModeChange: (mode: string) => void;
  readonly onSave?: () => void;
  readonly source: string;
  readonly tree?: ReactNode;
  readonly value: string;
}

/** Design counterpart of the product BodyViewer toolbar and compact payload pane. */
export function BodyViewerDesign({
  ariaLabel,
  bytes,
  codePreset = 'box',
  fullscreen = false,
  hex,
  language,
  meta,
  modes,
  onFullscreen,
  onModeChange,
  onSave,
  source,
  tree,
  value,
}: BodyViewerDesignProps): React.JSX.Element {
  const hexHostRef = useRef<HTMLPreElement>(null);
  const hexProbeRef = useRef<HTMLSpanElement>(null);
  const [bytesPerLine, setBytesPerLine] = useState(16);
  const copyValue = value === 'Hex' ? hex : source;
  const displayHex = bytes ? formatHexDump(bytes, bytesPerLine) : hex;

  useEffect(() => {
    const host = hexHostRef.current;
    const probe = hexProbeRef.current;
    if (!bytes || !host || !probe) return;
    const measure = () => {
      const characterWidth = probe.getBoundingClientRect().width;
      if (characterWidth <= 0) return;
      setBytesPerLine(Math.max(4, Math.floor((host.clientWidth / characterWidth - 12) / 4)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    observer.observe(probe);
    return () => observer.disconnect();
  }, [bytes, value]);

  return (
    <div className={`${styles.bodyViewerDesign} ${fullscreen ? styles.bodyViewerFullscreen : ''}`} data-parity="body-viewer-design">
      <div className={styles.bodyViewerToolbar}>
        <SegmentedControl
          ariaLabel={ariaLabel}
          value={value}
          options={modes.map((mode) => ({ value: mode, label: mode }))}
          onChange={onModeChange}
        />
        <span className={styles.bodyViewerSpacer} />
        <span className={styles.bodyViewerMeta}>{meta}</span>
        <div className={styles.bodyViewerActions}>
          <IconButton
            label="Save body"
            icon={<Download aria-hidden="true" />}
            onClick={onSave}
          />
          {!fullscreen ? <IconButton
            label="Copy body"
            icon={<Copy aria-hidden="true" />}
            onClick={() => void navigator.clipboard.writeText(copyValue)}
          /> : null}
          {!fullscreen ? <IconButton
            label="Open fullscreen"
            icon={<Maximize2 aria-hidden="true" />}
            onClick={onFullscreen}
          /> : null}
        </div>
      </div>
      {value === 'Tree' && tree ? tree : value === 'Hex' ? (
        <pre ref={hexHostRef} className={`${styles.bodyViewerHex} ${codePreset === 'message' ? styles.bodyViewerMessageHex : ''}`}>
          {bytes ? <span ref={hexProbeRef} className={styles.bodyViewerHexProbe} aria-hidden="true" /> : null}
          {displayHex}
        </pre>
      ) : (
        <MonacoFixture
          className={styles.bodyViewerCode}
          language={language}
          preset={codePreset}
          source={source}
        />
      )}
    </div>
  );
}