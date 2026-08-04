import { Braces, Copy, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '../../IconButton/IconButton';
import { Segmented } from '../../Segmented/Segmented';
import { type BodyFormat, type BodyMode, modeLabel } from '../bodyFormats';
import styles from './BodyToolbar.module.css';

export type FormatState = 'hidden' | 'idle' | 'busy' | 'blocked';

interface BodyToolbarProps {
  format: BodyFormat;
  mode: BodyMode;
  onModeChange(mode: BodyMode): void;
  /** MIME 加该类型的硬数字，如 `image/png · 1200 × 630`。 */
  meta: string;
  formatState?: FormatState;
  onFormat?: () => void;
  onCopy?: () => void;
  onSave?: () => void;
  modeAutomationIds?: Record<string, string>;
}

/** 档位条：左侧只切视图，右侧是该类型唯一有意义的动作。 */
export function BodyToolbar({
  format,
  mode,
  onModeChange,
  meta,
  formatState = 'hidden',
  onFormat,
  onCopy,
  onSave,
  modeAutomationIds,
}: BodyToolbarProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={styles.host}>
      <Segmented
        options={format.modes.map((value) => ({ label: modeLabel(format.kind, value), value }))}
        value={mode}
        onChange={(value) => onModeChange(value as BodyMode)}
        automationIds={modeAutomationIds}
      />
      <span className={styles.spacer} />
      <span className={styles.meta}>{meta}</span>
      <div className={styles.actions}>
        {formatState === 'hidden' ? null : (
          <IconButton
            icon={Braces}
            label={t('body.format')}
            size="sm"
            loading={formatState === 'busy'}
            disabled={formatState === 'blocked'}
            disabledTooltip={t('body.formatBlocked')}
            onClick={onFormat}
          />
        )}
        {onSave ? (
          <IconButton icon={Download} label={t('body.save')} size="sm" onClick={onSave} />
        ) : null}
        {onCopy ? (
          <IconButton icon={Copy} label={t('common.copy')} size="sm" onClick={onCopy} />
        ) : null}
      </div>
    </div>
  );
}
