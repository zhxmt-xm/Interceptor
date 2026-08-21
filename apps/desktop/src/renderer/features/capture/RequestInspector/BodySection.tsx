import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AUTOMATION_IDS,
  AutomationIdFactory,
  type AutomationId,
} from '../../../../shared/automation-ids';
import type {
  CaptureBodyRef,
  CaptureBodyRuleEffect,
} from '../../../../shared/desktop-api';
import { Segmented, sizeLabel } from '../../../components';
import { suggestedBodyFileName, typeLabel } from '../utils';

import styles from './BodySection.module.css';
import { BodyView } from './BodyView';
import { Section } from './Section';

export interface BodySectionProps {
  title: string;
  exchangeId: string | undefined;
  automationId?: AutomationId;
  body: CaptureBodyRef | undefined;
  effect?: CaptureBodyRuleEffect;
  onOpenRule: (ruleId: string) => void;
  mime: string | undefined;
  bytes: number;
  url: string;
  fallbackName: 'request-body' | 'response-body';
  empty: string;
}

/** Request/Response 共用的正文区块：只换标题、正文引用、MIME 回退与字节数。 */
export function BodySection({
  title,
  exchangeId,
  automationId,
  body,
  effect,
  onOpenRule,
  mime,
  bytes,
  url,
  fallbackName,
  empty,
}: BodySectionProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const [version, setVersion] = useState<'original' | 'final'>('final');
  useEffect(() => setVersion('final'), [exchangeId, effect?.ruleId, body?.bodyHash]);
  const selectedBody = effect && version === 'original'
    ? effect.originalBody
    : body;
  const mediaType = selectedBody?.mediaType ?? mime;
  const labelExtra = effect ? (
    <span className={styles.evidence}>
      <button
        className={styles.marker}
        data-automation-id={AutomationIdFactory.captureBodyRuleEffect(effect.ruleId)}
        data-parity="capture-body-effect-marker"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenRule(effect.ruleId);
        }}
      >
        {t('capture.ruleEffect.replace')}
      </button>
      <span
        className={styles.source}
        data-automation-id={AUTOMATION_IDS.capture.inspector.bodyEffect.source}
        data-parity="capture-body-effect-source"
        data-source={effect.source}
      >
        {t(`capture.bodyEffectSource.${effect.source}`)}
      </span>
    </span>
  ) : undefined;
  return (
    <Section
      title={title}
      automationId={automationId}
      grow
      count={!effect && body
        ? `${typeLabel(mediaType)} · ${sizeLabel(bytes, i18n.language)}`
        : undefined}
      labelExtra={labelExtra}
    >
      {effect ? (
        <div className={styles.versionBar} data-parity="capture-body-effect-version-bar">
          <span>{t('capture.bodyVersion')}</span>
          <Segmented
            ariaLabel={t('capture.bodyVersion')}
            options={[
              {
                value: 'original',
                label: t('capture.bodyVersion.original'),
                disabled: effect.originalState === 'unavailable',
              },
              { value: 'final', label: t('capture.bodyVersion.final') },
            ]}
            value={version}
            onChange={(value) => setVersion(value === 'original' ? 'original' : 'final')}
            automationIds={{
              original: AUTOMATION_IDS.capture.inspector.bodyEffect.original,
              final: AUTOMATION_IDS.capture.inspector.bodyEffect.final,
            }}
          />
        </div>
      ) : null}
      {effect?.originalState === 'unavailable' ? (
        <div
          className={styles.unavailable}
          data-automation-id={AUTOMATION_IDS.capture.inspector.bodyEffect.unavailable}
          data-parity="capture-body-effect-unavailable"
        >
          <Info aria-hidden="true" />
          <span>{t('capture.originalResponseBodyUnavailable')}</span>
        </div>
      ) : null}
      {selectedBody ? (
        <BodyView
          body={{ ...selectedBody, mediaType }}
          compact={Boolean(effect)}
          fullscreenTitle={title}
          suggestedFileName={suggestedBodyFileName(url, mediaType, fallbackName)}
        />
      ) : (
        <div className={styles.empty}>
          {effect && version === 'original'
            ? t('capture.originalRequestBodyEmpty')
            : empty}
        </div>
      )}
    </Section>
  );
}
