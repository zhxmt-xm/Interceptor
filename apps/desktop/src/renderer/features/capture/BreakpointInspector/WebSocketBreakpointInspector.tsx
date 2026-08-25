import { ArrowRight, Check, ChevronDown, Play, Slash } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  PendingBreakpoint,
  WebSocketBreakpointSettings,
} from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { BodyViewer } from '../../../components/BodyViewer/BodyViewer';
import { Button, cx, IconButton, SectionHeader, Segmented, sizeLabel } from '../../../components';
import { useBreakpointsStore } from '../../breakpoints';
import { resolveSelected } from '../../breakpoints/data/useBreakpoints';
import {
  breakpointBodyBytes,
  breakpointBodyMediaType,
  replacesBody,
} from '../../breakpoints/utils';
import { Section } from '../RequestInspector/Section';
import { BreakpointQueueMenu } from './BreakpointQueueMenu';
import styles from './WebSocketBreakpointInspector.module.css';

type ControlFrame = 'ping' | 'pong' | 'close';

const CONTROL_FRAME_LABEL: Readonly<Record<ControlFrame, string>> = {
  ping: 'Ping',
  pong: 'Pong',
  close: 'Close',
};

export interface WebSocketBreakpointInspectorProps {
  breakpoint: PendingBreakpoint;
  settings: WebSocketBreakpointSettings | null;
}

/** WebSocket paused frame editor embedded below the connection's frame list. */
export function WebSocketBreakpointInspector({
  breakpoint,
  settings,
}: WebSocketBreakpointInspectorProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const draft = useBreakpointsStore((state) => state.draft);
  const resolving = useBreakpointsStore((state) => state.resolving);
  const select = useBreakpointsStore((state) => state.select);
  const setCloseCode = useBreakpointsStore((state) => state.setCloseCode);
  const setReplacement = useBreakpointsStore((state) => state.setReplacement);
  const setBody = useBreakpointsStore((state) => state.setBody);
  const [replacementCollapsed, setReplacementCollapsed] = useState(false);
  const originalBytes = useMemo(
    () => breakpointBodyBytes(breakpoint.body ?? '', breakpoint.bodyFormat),
    [breakpoint.body, breakpoint.bodyFormat],
  );
  const originalMediaType = useMemo(
    () => breakpointBodyMediaType(breakpoint.body ?? '', breakpoint.bodyFormat),
    [breakpoint.body, breakpoint.bodyFormat],
  );

  useEffect(() => {
    if (draft?.breakpointId !== breakpoint.id) {
      select(breakpoint.id);
    }
  }, [breakpoint.id, draft?.breakpointId, select]);

  if (!draft || draft.breakpointId !== breakpoint.id) {
    return <div className={styles.inspector} />;
  }

  const isControlFrame = draft.frame !== undefined && draft.frame !== 'message';
  const isCloseFrame = draft.frame === 'close';
  const frameLabel = isControlFrame
    ? CONTROL_FRAME_LABEL[draft.frame as ControlFrame].toLowerCase()
    : t('breakpoints.frameMessage');
  const usingReplacement = replacesBody(draft);
  const originalKind = draft.bodyFormat === 'hex'
    ? t('capture.binary').toLocaleLowerCase(i18n.language)
    : t('breakpoints.replacementText').toLocaleLowerCase(i18n.language);
  const settingsSummary = settings
    ? settings.direction === 'both'
      ? t('capture.wsBreakpointDirectionBothSummary')
      : settings.direction === 'client-to-server'
        ? t('capture.wsBreakpointDirectionSentSummary')
        : t('capture.wsBreakpointDirectionReceivedSummary')
    : breakpoint.ruleName;

  return (
    <section className={styles.inspector}>
      <div className={styles.context}>
        <span className={styles.phase}>
          <ArrowRight
            className={draft.direction === 'server-to-client' ? styles.received : undefined}
            size={12}
            strokeWidth={2}
          />
          {draft.direction === 'client-to-server'
            ? t('breakpoints.sentFramePaused', { frame: frameLabel })
            : t('breakpoints.receivedFramePaused', { frame: frameLabel })}
        </span>
        <span className={styles.rule}>{settingsSummary}</span>
        <BreakpointQueueMenu queueKey={breakpoint.queueKey} />
      </div>

      <div className={styles.scroll}>
        {isCloseFrame ? (
          <Section title={t('breakpoints.closeCode')}>
            <input
              className={styles.closeCode}
              aria-label={t('breakpoints.closeCode')}
              data-automation-id={AUTOMATION_IDS.breakpoints.closeCode}
              inputMode="numeric"
              value={draft.closeCode}
              onChange={(event) => setCloseCode(Number.parseInt(event.target.value, 10) || 0)}
            />
          </Section>
        ) : null}

        <Section
          title={t('breakpoints.originalMessage')}
          count={`${originalKind} · ${sizeLabel(originalBytes.byteLength, i18n.language)}`}
        >
          <div className={styles.originalBody}>
            <BodyViewer
              bytes={originalBytes}
              mediaType={originalMediaType}
              fullscreenTitle={t('breakpoints.originalMessage')}
              compact
            />
          </div>
        </Section>

        <section>
          <SectionHeader className={styles.replacementHead}>
            <span>{t('breakpoints.replacementMessage')}</span>
            <span
              className={cx(styles.sourceTag, !usingReplacement && styles.sourceTagOriginal)}
              title={usingReplacement
                ? t('breakpoints.usingTextHint')
                : t('breakpoints.usingOriginalHint')}
            >
              <span>
                {usingReplacement ? t('breakpoints.usingText') : t('breakpoints.usingOriginal')}
              </span>
            </span>
            <Segmented
              className={styles.replacementMode}
              value={draft.replacement}
              options={[
                { value: 'off', label: t('breakpoints.replacementOff') },
                { value: 'text', label: t('breakpoints.replacementText') },
              ]}
              automationIds={AUTOMATION_IDS.breakpoints.replacement}
              onChange={(value) => setReplacement(value === 'text' ? 'text' : 'off')}
            />
            <IconButton
              icon={ChevronDown}
              label={replacementCollapsed
                ? t('breakpoints.expandSection')
                : t('breakpoints.collapseSection')}
              size="sm"
              className={cx(
                styles.sectionCollapse,
                replacementCollapsed && styles.sectionCollapsed,
              )}
              onClick={() => setReplacementCollapsed(!replacementCollapsed)}
            />
          </SectionHeader>
          {replacementCollapsed ? null : draft.replacement === 'off' ? (
            <div className={styles.replacementOff}>
              <Check strokeWidth={2} />
              <span>{t('breakpoints.originalMessageForwarded')}</span>
            </div>
          ) : (
            <textarea
              className={styles.bodyEdit}
              aria-label={t('breakpoints.replacementMessage')}
              value={draft.body}
              spellCheck={false}
              onChange={(event) => setBody(event.target.value)}
              data-automation-id={AUTOMATION_IDS.breakpoints.body}
            />
          )}
        </section>
      </div>

      <div className={styles.foot}>
        <Button
          icon={Slash}
          variant="danger"
          className={styles.footButton}
          disabled={resolving}
          onClick={() => void resolveSelected('drop', false)}
          automationId={AUTOMATION_IDS.breakpoints.drop}
        >
          {t('breakpoints.drop')}
        </Button>
        <span className={styles.spacer} />
        <Button
          className={styles.footButton}
          disabled={resolving}
          onClick={() => void resolveSelected('continue', false)}
          automationId={AUTOMATION_IDS.breakpoints.continueUnmodified}
        >
          {t('breakpoints.continueUnmodified')}
        </Button>
        <Button
          icon={Play}
          variant="primary"
          className={cx(styles.footButton, styles.footPrimary)}
          disabled={resolving}
          onClick={() => void resolveSelected('continue', true)}
          automationId={AUTOMATION_IDS.breakpoints.executeEdited}
        >
          {t('breakpoints.forwardEdited')}
        </Button>
      </div>
    </section>
  );
}