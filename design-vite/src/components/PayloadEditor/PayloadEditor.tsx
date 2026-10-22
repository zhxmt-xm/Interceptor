import { Input, Spin } from 'antd';
import { Check, Copy, File, Info, Maximize, Upload, X } from 'lucide-react';
import { useState } from 'react';

import { CollapsibleSection } from '../CollapsibleSection/CollapsibleSection';
import { IconButton } from '../IconButton/IconButton';
import { SegmentedControl } from '../SegmentedControl/SegmentedControl';
import { BodyRemainderPreview } from './BodyRemainderPreview';
import type { PayloadPreviewMetadata } from './utils';
import styles from './PayloadEditor.module.css';

export type ReplacementMode = 'off' | 'text' | 'file';

interface ReplacementOption {
  readonly label: string;
  readonly value: ReplacementMode;
}

interface LoadingPayload {
  readonly detail: string;
  readonly title: string;
}

interface ReplacementFile {
  readonly mediaType?: string;
  readonly previewMetadata?: PayloadPreviewMetadata;
  readonly meta: string;
  readonly name: string;
  readonly preview: string;
  readonly ready: boolean;
}

interface PayloadEditorProps {
  readonly contentKind: 'body' | 'message';
  readonly file?: ReplacementFile;
  readonly loading?: LoadingPayload;
  readonly onChooseFile?: () => void;
  readonly onRemoveFile?: () => void;
  readonly onReplacementModeChange: (mode: ReplacementMode) => void;
  readonly originalFormat: string;
  readonly originalMeta: string;
  readonly originalPayload: string;
  readonly originalTitle: string;
  readonly originalViewOptions: readonly string[];
  readonly replacementMode: ReplacementMode;
  readonly replacementOptions: readonly ReplacementOption[];
  readonly replacementPayload: string;
  readonly replacementTitle: string;
  readonly previewMetadata?: PayloadPreviewMetadata;
}

export function PayloadEditor({
  contentKind,
  file,
  loading,
  onChooseFile,
  onRemoveFile,
  onReplacementModeChange,
  originalFormat,
  originalMeta,
  originalPayload,
  originalTitle,
  originalViewOptions,
  replacementMode,
  replacementOptions,
  replacementPayload,
  replacementTitle,
  previewMetadata,
}: PayloadEditorProps): React.JSX.Element {
  const [view, setView] = useState(originalViewOptions[0] ?? 'Raw');
  const [originalOpen, setOriginalOpen] = useState(true);
  const [replacementOpen, setReplacementOpen] = useState(true);
  const [replacementText, setReplacementText] = useState(replacementPayload);
  const [formattedOriginal, setFormattedOriginal] = useState<string | null>(null);
  const [formattedFile, setFormattedFile] = useState<string | null>(null);
  const originalPreview = formattedOriginal ?? originalPayload;
  const textReady = replacementMode === 'text' && replacementText.length > 0;
  const usingFile = replacementMode === 'file' && file?.ready === true;
  const replacementWarning = (replacementMode === 'text' && !textReady)
    || (replacementMode === 'file' && !usingFile);
  const replacementSource = textReady ? 'Using text' : usingFile ? 'Using file' : 'Using original';
  const payloadName = originalTitle.replace(/^Original\s+/i, '').toLowerCase();

  return (
    <div className={styles.payloadEditor} data-breakpoint-component="payload">
      <CollapsibleSection
        badge={{ label: loading ? 'receiving' : originalMeta, tone: 'neutral' }}
        open={originalOpen}
        title={originalTitle}
        onOpenChange={setOriginalOpen}
      >
        {loading ? (
          <div className={styles.payloadEditorLoading}>
            <Spin size="small" />
            <span>
              <b>{loading.title}</b>
              <small>{loading.detail}</small>
            </span>
          </div>
        ) : (
          <div
            className={styles.payloadEditorOriginalReady}
            data-parity="breakpoint-original-ready"
          >
            <div className={styles.payloadEditorToolbar}>
              <SegmentedControl
                ariaLabel={`${originalTitle} view`}
                value={view}
                options={originalViewOptions.map((option) => ({ value: option, label: option }))}
                onChange={setView}
              />
              <span className={styles.payloadEditorSpacer} />
              <span className={styles.payloadEditorFormat}>{originalFormat}</span>
              <div className={styles.payloadEditorIconActions}>
                <IconButton label="Open fullscreen" icon={<Maximize aria-hidden="true" />} />
                <IconButton
                  label={`Copy ${payloadName}`}
                  icon={<Copy aria-hidden="true" />}
                  onClick={contentKind === 'body' ? () => void navigator.clipboard.writeText(originalPreview) : undefined}
                />
              </div>
            </div>
            {contentKind === 'body' && view !== 'Hex' && view !== 'Tree' ? (
              <BodyRemainderPreview
                mediaType={originalFormat}
                metadata={previewMetadata}
                onFormat={setFormattedOriginal}
                source={originalPreview}
                variant="original"
              />
            ) : <pre className={styles.payloadEditorOriginalCode}>{originalPayload}</pre>}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        badge={{
          label: replacementSource,
          tone: replacementWarning ? 'warning' : 'success',
        }}
        extra={(
          <span className={styles.payloadEditorReplacementMode}>
            <SegmentedControl
              ariaLabel={`${replacementTitle} mode`}
              value={replacementMode}
              options={replacementOptions}
              tone="warning"
              onChange={onReplacementModeChange}
            />
          </span>
        )}
        open={replacementOpen}
        title={replacementTitle}
        onOpenChange={setReplacementOpen}
      >
        {replacementMode === 'text' ? (
          <>
            {contentKind === 'body' ? (
              <div className={styles.payloadEditorCandidateNotice}>
                <Info aria-hidden="true" />
                <span>The full text stays editable. Read-only preview limits do not clip this value.</span>
              </div>
            ) : null}
            <Input.TextArea
              aria-label={replacementTitle}
              autoSize={{ minRows: 4, maxRows: 8 }}
              className={styles.payloadEditorReplacementInput}
              spellCheck={false}
              value={replacementText}
              onChange={(event) => setReplacementText(event.target.value)}
            />
          </>
        ) : replacementMode === 'file' ? (
          file?.ready ? (
            <div className={styles.payloadEditorFileCard}>
              <div className={styles.payloadEditorFileHeader}>
                <span className={styles.payloadEditorFileIcon}><File aria-hidden="true" /></span>
                <span className={styles.payloadEditorFileMeta}><b>{file.name}</b><small>{file.meta}</small></span>
                <IconButton label="Remove replacement file" icon={<X aria-hidden="true" />} onClick={onRemoveFile} />
              </div>
              <BodyRemainderPreview
                mediaType={file.mediaType ?? originalFormat}
                metadata={file.previewMetadata}
                onFormat={setFormattedFile}
                source={formattedFile ?? file.preview}
                variant="file"
              />
            </div>
          ) : (
            <div className={styles.payloadEditorChooseFile}>
              <button className={styles.payloadEditorFileUploadButton} type="button" onClick={onChooseFile}>
                <Upload aria-hidden="true" />
                Choose file…
              </button>
            </div>
          )
        ) : (
          <div className={styles.payloadEditorUsingOriginal} data-content-kind={contentKind}>
            <Check aria-hidden="true" size={13} />
            <span>{`The original ${payloadName} will be forwarded unchanged.`}</span>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
