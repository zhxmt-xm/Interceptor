import { useTranslation } from 'react-i18next';

import type { CaptureBodyRef } from '../../../../shared/desktop-api';
import { sizeLabel } from '../../../components';
import { suggestedBodyFileName, typeLabel } from '../utils';

import styles from './BodySection.module.css';
import { BodyView } from './BodyView';
import { Section } from './Section';

export interface BodySectionProps {
  title: string;
  body: CaptureBodyRef | undefined;
  mime: string | undefined;
  bytes: number;
  url: string;
  fallbackName: 'request-body' | 'response-body';
  empty: string;
}

/** Request/Response 共用的正文区块：只换标题、正文引用、MIME 回退与字节数。 */
export function BodySection({
  title,
  body,
  mime,
  bytes,
  url,
  fallbackName,
  empty,
}: BodySectionProps): React.JSX.Element {
  const { i18n } = useTranslation();
  const mediaType = body?.mediaType ?? mime;
  return (
    <Section
      title={title}
      grow
      count={body ? `${typeLabel(mediaType)} · ${sizeLabel(bytes, i18n.language)}` : undefined}
    >
      {body ? (
        <BodyView
          body={{ ...body, mediaType }}
          fullscreenTitle={title}
          suggestedFileName={suggestedBodyFileName(url, mediaType, fallbackName)}
        />
      ) : (
        <div className={styles.empty}>{empty}</div>
      )}
    </Section>
  );
}

export interface RequestInspectorProps {
  onOpenRule: (ruleId: string) => void;
}
