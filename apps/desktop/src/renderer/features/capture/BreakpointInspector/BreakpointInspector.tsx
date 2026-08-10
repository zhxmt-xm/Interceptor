import { ArrowRight, CircleAlert, Play, Plus, Slash, X } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import type { PendingBreakpoint } from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import {
  Button,
  cx,
  IconButton,
  MethodBadge,
  SectionHeader,
  Segmented,
} from '../../../components';
import { useBreakpointsStore } from '../../breakpoints';
import { resolveSelected } from '../../breakpoints/data/useBreakpoints';
import { replacesBody } from '../../breakpoints/utils';
import styles from './BreakpointInspector.module.css';

interface BreakpointInspectorProps {
  breakpoint: PendingBreakpoint;
  onClose: () => void;
}

/**
 * 被挂起的 exchange 在 Capture 原地编辑：改 headers / status，选择是否替换正文，然后放行。
 *
 * 正文在头部阶段还没到达，所以这里没有只读的 Original body 区；`Off` 就是原样转发，
 * 只有明确选了 `Text` 并写了内容才会替换。
 */
export function BreakpointInspector({
  breakpoint,
  onClose,
}: BreakpointInspectorProps): React.JSX.Element {
  const { t } = useTranslation();
  const draft = useBreakpointsStore((state) => state.draft);
  const resolving = useBreakpointsStore((state) => state.resolving);
  const select = useBreakpointsStore((state) => state.select);
  const setStatusCode = useBreakpointsStore((state) => state.setStatusCode);
  const setReplacement = useBreakpointsStore((state) => state.setReplacement);
  const setBody = useBreakpointsStore((state) => state.setBody);
  const addHeader = useBreakpointsStore((state) => state.addHeader);
  const updateHeader = useBreakpointsStore((state) => state.updateHeader);
  const removeHeader = useBreakpointsStore((state) => state.removeHeader);

  // 选中哪一行由 Capture 决定，草稿必须跟着切换到同一个断点。
  useEffect(() => {
    if (draft?.breakpointId !== breakpoint.id) {
      select(breakpoint.id);
    }
  }, [breakpoint.id, draft?.breakpointId, select]);

  if (!draft || draft.breakpointId !== breakpoint.id) {
    return <div className={styles.inspector} />;
  }

  const isResponse = draft.phase === 'response';
  const isWebSocket = draft.phase === 'websocket';
  const usingReplacement = replacesBody(draft);

  return (
    <section className={styles.inspector}>
      <header className={styles.head}>
        {isWebSocket ? (
          <span className={styles.chip}>
            {draft.opcode === 2 ? t('capture.binary') : t('capture.text')}
          </span>
        ) : (
          <MethodBadge method={draft.method} />
        )}
        <span className={styles.url}>{draft.url || breakpoint.url || ''}</span>
        <IconButton icon={X} size="sm" label={t('common.close')} onClick={onClose} />
      </header>

      <div className={styles.context}>
        <span className={styles.phase}>
          <ArrowRight size={12} strokeWidth={2} />
          {isWebSocket
            ? draft.direction === 'client-to-server'
              ? t('breakpoints.sentMessagePaused')
              : t('breakpoints.receivedMessagePaused')
            : isResponse
              ? t('breakpoints.responsePaused')
              : t('breakpoints.requestPaused')}
        </span>
        <span className={styles.rule}>{breakpoint.ruleName}</span>
      </div>

      <div className={styles.scroll}>
        {isResponse ? (
          <section>
            <SectionHeader>{t('breakpoints.responseStatus')}</SectionHeader>
            <div className={styles.statusRow}>
              <input
                className={styles.statusInput}
                aria-label={t('breakpoints.responseStatus')}
                inputMode="numeric"
                value={draft.statusCode}
                onChange={(event) =>
                  setStatusCode(Number.parseInt(event.target.value, 10) || 0)}
              />
            </div>
          </section>
        ) : null}

        {!isWebSocket ? (
          <section>
            <SectionHeader count={draft.headers.length}>
              {isResponse ? t('breakpoints.responseHeaders') : t('breakpoints.requestHeaders')}
            </SectionHeader>
            {draft.headers.map((header) => (
              <div key={header.id} className={styles.headerRow}>
                <input
                  className={styles.cellInput}
                  aria-label={t('breakpoints.headerName')}
                  value={header.name}
                  spellCheck={false}
                  onChange={(event) => updateHeader(header.id, { name: event.target.value })}
                />
                <input
                  className={styles.cellInput}
                  aria-label={t('breakpoints.headerValue')}
                  value={header.value}
                  spellCheck={false}
                  onChange={(event) => updateHeader(header.id, { value: event.target.value })}
                />
                <IconButton
                  icon={X}
                  label={t('breakpoints.removeHeader')}
                  size="sm"
                  strokeWidth={2.2}
                  onClick={() => removeHeader(header.id)}
                />
              </div>
            ))}
            <button
              type="button"
              className={styles.addHeader}
              onClick={addHeader}
              data-automation-id={AUTOMATION_IDS.breakpoints.addHeader}
            >
              <Plus size={12} strokeWidth={2} />
              {t('breakpoints.addHeader')}
            </button>
          </section>
        ) : null}

        <section>
          <div className={styles.replacementHead}>
            <span className={styles.replacementTitle}>
              {isWebSocket ? t('breakpoints.payload') : t('breakpoints.replacementBody')}
            </span>
            <span
              className={cx(styles.sourceTag, !usingReplacement && styles.sourceTagWarn)}
              title={
                usingReplacement
                  ? t('breakpoints.usingTextHint')
                  : draft.replacement === 'text'
                    ? t('breakpoints.emptyTextHint')
                    : t('breakpoints.usingOriginalHint')
              }
            >
              {draft.replacement === 'text' && !usingReplacement ? (
                <CircleAlert size={12} strokeWidth={2} />
              ) : null}
              {usingReplacement ? t('breakpoints.usingText') : t('breakpoints.usingOriginal')}
            </span>
            <Segmented
              value={draft.replacement}
              options={[
                { value: 'off', label: t('breakpoints.replacementOff') },
                { value: 'text', label: t('breakpoints.replacementText') },
              ]}
              onChange={(value) => setReplacement(value === 'text' ? 'text' : 'off')}
            />
          </div>
          {draft.replacement === 'off' ? (
            <div className={styles.replacementOff}>
              {t('breakpoints.originalForwarded')}
            </div>
          ) : (
            <textarea
              className={styles.bodyEdit}
              aria-label={isWebSocket ? t('breakpoints.payload') : t('breakpoints.replacementBody')}
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
          disabled={resolving}
          onClick={() => void resolveSelected('drop', false)}
          automationId={AUTOMATION_IDS.breakpoints.drop}
        >
          {t('breakpoints.drop')}
        </Button>
        <span className={styles.spacer} />
        <Button
          disabled={resolving}
          onClick={() => void resolveSelected('continue', false)}
          automationId={AUTOMATION_IDS.breakpoints.continueUnmodified}
        >
          {t('breakpoints.continueUnmodified')}
        </Button>
        <Button
          icon={Play}
          variant="primary"
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
