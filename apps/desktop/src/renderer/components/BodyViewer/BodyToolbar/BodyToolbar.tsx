import { Braces, Copy, Download, Maximize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { AutomationId } from '../../../../shared/automation-ids';
import { IconButton } from '../../IconButton/IconButton';
import { Segmented } from '../../Segmented/Segmented';
import { type BodyFormat, type BodyMode, modeLabel } from '../bodyFormats';
import styles from './BodyToolbar.module.css';

export type FormatState = 'hidden' | 'idle' | 'busy' | 'blocked';

export interface BodyActionAutomationIds {
  format?: AutomationId;
  save?: AutomationId;
  copy?: AutomationId;
  fullscreen?: AutomationId;
}

interface BodyToolbarProps {
  format: BodyFormat;
  mode: BodyMode;
  onModeChange(mode: BodyMode): void;
  /** MIME 加该类型的硬数字，如 `image/png · 1200 × 630`。 */
  meta: string;
  formatState?: FormatState;
  formatBlockedReason?: string;
  onFormat?: () => void;
  onCopy?: () => void;
  onSave?: () => void;
  /** 只在内联视图下给出；全屏弹窗里已经是最大化状态。 */
  onFullscreen?: () => void;
  actionAutomationIds?: BodyActionAutomationIds;
  modeAutomationIds?: Record<string, string>;
}

/** 档位条：左侧只切视图，右侧是该类型唯一有意义的动作。 */
export function BodyToolbar({
  format,
  mode,
  onModeChange,
  meta,
  formatState = 'hidden',
  formatBlockedReason,
  onFormat,
  onCopy,
  onSave,
  onFullscreen,
  actionAutomationIds,
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
            disabledTooltip={formatBlockedReason ?? t('body.formatBlocked')}
            onClick={onFormat}
            automationId={actionAutomationIds?.format}
          />
        )}
        {onSave ? (
          <IconButton
            icon={Download}
            label={t('body.save')}
            size="sm"
            onClick={onSave}
            automationId={actionAutomationIds?.save}
          />
        ) : null}
        {onCopy ? (
          <IconButton
            icon={Copy}
            label={t('common.copy')}
            size="sm"
            onClick={onCopy}
            automationId={actionAutomationIds?.copy}
          />
        ) : null}
        {onFullscreen ? (
          <IconButton
            icon={Maximize2}
            label={t('body.fullscreen')}
            size="sm"
            onClick={onFullscreen}
            automationId={actionAutomationIds?.fullscreen}
          />
        ) : null}
      </div>
    </div>
  );
}
