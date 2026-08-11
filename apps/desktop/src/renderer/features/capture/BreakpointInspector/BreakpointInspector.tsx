import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  FileText,
  FolderOpen,
  LoaderCircle,
  Play,
  Plus,
  Slash,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CaptureExchangeDetail,
  PendingBreakpoint,
} from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import {
  Button,
  cx,
  IconButton,
  MethodBadge,
  SectionHeader,
  Segmented,
  sizeLabel,
} from '../../../components';
import { useBreakpointsStore } from '../../breakpoints';
import { resolveSelected } from '../../breakpoints/data/useBreakpoints';
import { expectsBody, replacesBody } from '../../breakpoints/utils';
import { BodyView } from '../RequestInspector/BodyView';
import { Section } from '../RequestInspector/Section';
import styles from './BreakpointInspector.module.css';

type ControlFrame = 'ping' | 'pong' | 'close';

/** 控制帧名是协议术语，各语言一致，不进 i18n 目录。 */
const CONTROL_FRAME_LABEL: Readonly<Record<ControlFrame, string>> = {
  ping: 'Ping',
  pong: 'Pong',
  close: 'Close',
};

interface BreakpointInspectorProps {
  breakpoint: PendingBreakpoint;
  /** 挂起 exchange 的详情；正文还在流入时为空。 */
  detail: CaptureExchangeDetail | null;
  onClose: () => void;
}

/**
 * 被挂起的 exchange 在 Capture 原地编辑：改 headers / status，选择是否替换正文，然后放行。
 *
 * 原文不走断点快照：挂起期间 Capture 仍在收正文，所以直接读同一个 exchange 的 body，
 * 未收完时展示接收中。`Off` 就是原样转发，只有明确选了 `Text` 并写了内容才会替换。
 */
export function BreakpointInspector({
  breakpoint,
  detail,
  onClose,
}: BreakpointInspectorProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const draft = useBreakpointsStore((state) => state.draft);
  const resolving = useBreakpointsStore((state) => state.resolving);
  const select = useBreakpointsStore((state) => state.select);
  const setStatusCode = useBreakpointsStore((state) => state.setStatusCode);
  const setCloseCode = useBreakpointsStore((state) => state.setCloseCode);
  const setReplacement = useBreakpointsStore((state) => state.setReplacement);
  const setFile = useBreakpointsStore((state) => state.setFile);
  // 标题行里有 Segmented，整行点击会和它打架，所以只用 chevron 做命中区。
  const [replacementCollapsed, setReplacementCollapsed] = useState(false);
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

  const pickFile = async (): Promise<void> => {
    const picked = await window.interceptor.pickBreakpointBodyFile();
    if (picked !== null) {
      setFile(picked);
    }
  };

  if (!draft || draft.breakpointId !== breakpoint.id) {
    return <div className={styles.inspector} />;
  }

  const isResponse = draft.phase === 'response';
  const isWebSocket = draft.phase === 'websocket';
  const isControlFrame = isWebSocket && draft.frame !== undefined && draft.frame !== 'message';
  const isCloseFrame = draft.frame === 'close';
  const frameLabel = isControlFrame
    ? CONTROL_FRAME_LABEL[draft.frame as ControlFrame].toLowerCase()
    : t('breakpoints.frameMessage');
  const usingReplacement = replacesBody(draft);
  // 挂起期间 Capture 仍在收正文，body 引用出现即代表这一侧已经收完可读。
  const originalBody = (isResponse ? detail?.responseBody : detail?.requestBody) ?? null;
  const receivedBytes = (isResponse
    ? detail?.summary.responseBytes
    : detail?.summary.requestBytes) ?? 0;
  // 已经收到字节就是有正文的确证；没有字节时才需要靠 HTTP 语义预判。
  const hasBody = receivedBytes > 0 || expectsBody(draft.headers);

  return (
    <section className={styles.inspector}>
      <header className={styles.head}>
        {isWebSocket ? (
          <span className={styles.chip}>
            {isControlFrame
              ? CONTROL_FRAME_LABEL[draft.frame as ControlFrame]
              : draft.opcode === 2 ? t('capture.binary') : t('capture.text')}
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
              ? t('breakpoints.sentFramePaused', { frame: frameLabel })
              : t('breakpoints.receivedFramePaused', { frame: frameLabel })
            : isResponse
              ? t('breakpoints.responsePaused')
              : t('breakpoints.requestPaused')}
        </span>
        <span className={styles.rule}>{breakpoint.ruleName}</span>
      </div>

      <div className={styles.scroll}>
        {isCloseFrame ? (
          <section>
            <SectionHeader>{t('breakpoints.closeCode')}</SectionHeader>
            <div className={styles.statusRow}>
              <input
                className={styles.statusInput}
                aria-label={t('breakpoints.closeCode')}
                inputMode="numeric"
                value={draft.closeCode}
                onChange={(event) =>
                  setCloseCode(Number.parseInt(event.target.value, 10) || 0)}
              />
            </div>
          </section>
        ) : null}

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
          <Section
            title={isResponse ? t('breakpoints.responseHeaders') : t('breakpoints.requestHeaders')}
            count={draft.headers.length}
          >
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
          </Section>
        ) : null}

        {!isWebSocket ? (
          <Section
            title={t('breakpoints.originalBody')}
            count={(
              <span
                className={cx(
                  styles.originalMeta,
                  hasBody && originalBody === null && styles.originalMetaPending,
                )}
              >
                {!hasBody
                  ? t('breakpoints.noBody')
                  : originalBody === null
                    ? t('breakpoints.receiving')
                    : `${sizeLabel(originalBody.encodedSize, i18n.language)} · ${originalBody.mediaType}`}
              </span>
            )}
          >
            {!hasBody ? (
              <div className={styles.originalEmpty}>
                {isResponse
                  ? t('breakpoints.noResponseBodyHint')
                  : t('breakpoints.noRequestBodyHint')}
              </div>
            ) : originalBody === null ? (
              <div className={styles.originalLoading}>
                <LoaderCircle className={styles.spinner} size={16} strokeWidth={2} />
                <div>
                  <b>
                    {isResponse
                      ? t('breakpoints.receivingResponseBody')
                      : t('breakpoints.receivingRequestBody')}
                  </b>
                  <span>
                    {t('breakpoints.bytesReceivedSoFar', {
                      bytes: sizeLabel(receivedBytes, i18n.language),
                    })}
                  </span>
                </div>
              </div>
            ) : (
              <div className={styles.originalReady}>
                <BodyView body={originalBody} compact />
              </div>
            )}
          </Section>
        ) : null}

        <section>
          <SectionHeader className={styles.replacementHead}>
            {isWebSocket ? t('breakpoints.payload') : t('breakpoints.replacementBody')}
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
              className={styles.replacementMode}
              value={draft.replacement}
              options={[
                { value: 'off', label: t('breakpoints.replacementOff') },
                { value: 'text', label: t('breakpoints.replacementText') },
                { value: 'file', label: t('breakpoints.replacementFile') },
              ]}
              onChange={(value) =>
                setReplacement(value === 'text' || value === 'file' ? value : 'off')}
            />
            <IconButton
              icon={ChevronDown}
              label={
                replacementCollapsed
                  ? t('breakpoints.expandSection')
                  : t('breakpoints.collapseSection')
              }
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
              <span>{t('breakpoints.originalForwarded')}</span>
            </div>
          ) : draft.replacement === 'file' ? (
            <div className={styles.fileArea}>
              {draft.file === null ? (
                <Button icon={FolderOpen} onClick={() => void pickFile()}>
                  {t('breakpoints.chooseFile')}
                </Button>
              ) : (
                <>
                  <div className={styles.fileCard}>
                    <FileText size={15} strokeWidth={2} />
                    <span className={styles.fileMeta}>
                      <b>{draft.file.name}</b>
                      <span>
                        {`${sizeLabel(draft.file.size, i18n.language)} · ${draft.file.mediaType}`}
                      </span>
                    </span>
                    <IconButton
                      icon={X}
                      label={t('breakpoints.removeFile')}
                      size="sm"
                      onClick={() => setFile(null)}
                    />
                  </div>
                  {draft.file.text === undefined ? (
                    <div className={styles.originalEmpty}>
                      {t('breakpoints.filePreviewUnavailable')}
                    </div>
                  ) : (
                    <pre className={styles.filePreview}>{draft.file.text}</pre>
                  )}
                </>
              )}
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
