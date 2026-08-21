import { Copy, Download, Maximize2 } from 'lucide-react';

import { IconButton } from '../IconButton/IconButton';
import { MonacoFixture } from '../MonacoFixture/MonacoFixture';
import { SegmentedControl } from '../SegmentedControl/SegmentedControl';
import styles from './BodyViewerDesign.module.css';

interface BodyViewerDesignProps {
  readonly ariaLabel: string;
  readonly hex: string;
  readonly language: string;
  readonly meta: string;
  readonly modes: readonly string[];
  readonly onFullscreen: () => void;
  readonly onModeChange: (mode: string) => void;
  readonly source: string;
  readonly value: string;
}

/** Design counterpart of the product BodyViewer toolbar and compact payload pane. */
export function BodyViewerDesign({
  ariaLabel,
  hex,
  language,
  meta,
  modes,
  onFullscreen,
  onModeChange,
  source,
  value,
}: BodyViewerDesignProps): React.JSX.Element {
  const copyValue = value === 'Hex' ? hex : source;
  return (
    <div className={styles.bodyViewerDesign} data-parity="body-viewer-design">
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
            onClick={() => undefined}
          />
          <IconButton
            label="Copy body"
            icon={<Copy aria-hidden="true" />}
            onClick={() => void navigator.clipboard.writeText(copyValue)}
          />
          <IconButton
            label="Open fullscreen"
            icon={<Maximize2 aria-hidden="true" />}
            onClick={onFullscreen}
          />
        </div>
      </div>
      {value === 'Hex' ? (
        <pre className={styles.bodyViewerHex}>{hex}</pre>
      ) : (
        <MonacoFixture
          className={styles.bodyViewerCode}
          language={language}
          preset="box"
          source={source}
        />
      )}
    </div>
  );
}