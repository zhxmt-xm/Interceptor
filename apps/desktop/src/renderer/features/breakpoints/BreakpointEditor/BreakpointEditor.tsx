import { Clock, Play, Plus, Slash, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, Chip, IconButton, SectionHeader } from '../../../components';
import { useBreakpointsStore } from '../data/breakpointsStore';
import { resolveSelected } from '../data/useBreakpoints';
import { formatCountdown, selectedBreakpoint } from '../utils';
import styles from './BreakpointEditor.module.css';

/** Right breakpoints pane: editable headers/body for the paused request. */
export function BreakpointEditor(): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const draft = useBreakpointsStore((state) => state.draft);
  const breakpoint = useBreakpointsStore(selectedBreakpoint);
  const resolving = useBreakpointsStore((state) => state.resolving);
  const setBody = useBreakpointsStore((state) => state.setBody);
  const addHeader = useBreakpointsStore((state) => state.addHeader);
  const updateHeader = useBreakpointsStore((state) => state.updateHeader);
  const removeHeader = useBreakpointsStore((state) => state.removeHeader);

  if (!draft || !breakpoint) {
    return (
      <div className={styles.editor}>
        <div className={styles.placeholder}>
          {t('breakpoints.noSelection')}
        </div>
      </div>
    );
  }

  const isResponse = draft.phase === 'response';
  const isWebSocket = draft.phase === 'websocket';
  const messageLabel = draft.opcode === 2 ? t('capture.binary') : t('capture.text');

  return (
    <div className={styles.editor}>
      <div className={styles.head}>
        <Chip tone={isResponse ? 'green' : 'blue'}>
          {isWebSocket ? messageLabel : isResponse ? draft.statusCode : draft.method}
        </Chip>
        <span className={styles.url}>{draft.url || breakpoint.url || ''}</span>
        <span className={styles.phase}>
          {isWebSocket
            ? draft.direction === 'client-to-server'
              ? t('breakpoints.sentMessagePaused')
              : t('breakpoints.receivedMessagePaused')
            : isResponse
              ? t('breakpoints.responsePaused')
              : t('breakpoints.requestPaused')}
        </span>
        <span className={styles.countdown}>
          <Clock size={13} strokeWidth={1.9} />
          {formatCountdown(breakpoint.deadline, i18n.language)}
        </span>
      </div>

      <div className={styles.scroll}>
        {!isWebSocket ? <div>
          <SectionHeader count={t('breakpoints.editable')}>{t('breakpoints.headers')}</SectionHeader>
          <div className={styles.headerHead}>
            <span>{t('breakpoints.name')}</span>
            <span>{t('breakpoints.value')}</span>
            <span />
          </div>
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
          <button type="button" className={styles.addHeader} onClick={addHeader}>
            <Plus size={12} strokeWidth={2} />
            {t('breakpoints.addHeader')}
          </button>
        </div> : null}

        <div>
          <SectionHeader
            count={
              draft.bodyAvailable
                ? `${isWebSocket ? draft.bodyFormat ?? 'text' : t('breakpoints.body').toLocaleLowerCase(i18n.language)} · ${t('breakpoints.editable')}`
                : t('breakpoints.bodyNotReceived')
            }
          >
            {isWebSocket
              ? t('breakpoints.payload')
              : draft.bodyAvailable
                ? t('breakpoints.body')
                : t('breakpoints.replaceBody')}
          </SectionHeader>
          <textarea
            className={styles.bodyEdit}
            aria-label={isWebSocket ? t('breakpoints.payload') : t('breakpoints.body')}
            value={draft.body}
            spellCheck={false}
            placeholder={draft.bodyAvailable ? undefined : t('breakpoints.replaceBodyHint')}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
      </div>

      <div className={styles.foot}>
        <Button
          icon={Slash}
          variant="danger"
          disabled={resolving}
          onClick={() => void resolveSelected('drop', false)}
        >
          {t('breakpoints.drop')}
        </Button>
        <span className={styles.spacer} />
        <Button disabled={resolving} onClick={() => void resolveSelected('continue', false)}>
          {t('breakpoints.continueUnmodified')}
        </Button>
        <Button
          icon={Play}
          variant="primary"
          disabled={resolving}
          onClick={() => void resolveSelected('continue', true)}
        >
          {t('breakpoints.executeEdited')}
        </Button>
      </div>
    </div>
  );
}
