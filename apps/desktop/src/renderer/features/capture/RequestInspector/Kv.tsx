import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { IconButton, useClipboardCopy } from '../../../components';
import type { KvRow } from '../interfaces';

import { KvValue } from './KvValue';
import styles from './Kv.module.css';

export interface KvProps {
  rows: KvRow[];
  onOpenRule?: (ruleId: string) => void;
}


export function Kv({
  rows,
  onOpenRule,
}: KvProps): React.JSX.Element {
  const { t } = useTranslation();
  const copy = useClipboardCopy();
  return (
    <div className={styles.kv}>
      {rows.map(([key, value, accent, copyText, ruleEffect, ruleId], index) => {
        const copyValue = copyText ?? (typeof value === 'string' ? value : undefined);
        const inactive = ruleEffect === 'replace' || ruleEffect === 'remove';
        return (
          <div className={styles.kvRow} key={index}>
            <span className={styles.key} title={key}>{key}</span>
            <KvValue value={value} accent={accent} inactive={inactive}>
              {ruleEffect && ruleId && onOpenRule ? (
                <button
                  type="button"
                  className={styles.ruleEffect}
                  data-effect={ruleEffect}
                  data-automation-id={AutomationIdFactory.captureRuleEffect(
                    ruleId,
                    ruleEffect,
                    key,
                  )}
                  onClick={() => onOpenRule(ruleId)}
                >
                  <span className={styles.ruleEffectContent}>
                    <span className={styles.ruleEffectLabel}>{t(`capture.ruleEffect.${ruleEffect}`)}</span>
                  </span>
                </button>
              ) : ruleEffect ? (
                <span className={styles.ruleEffect} data-effect={ruleEffect}>
                  <span className={styles.ruleEffectContent}>
                    <span className={styles.ruleEffectLabel}>{t(`capture.ruleEffect.${ruleEffect}`)}</span>
                  </span>
                </span>
              ) : null}
              {copyValue ? (
                <IconButton
                  className={styles.copyBtn}
                  icon={Copy}
                  label={t('common.copy')}
                  size="inline"
                  onClick={() => copy(copyValue)}
                />
              ) : null}
            </KvValue>
          </div>
        );
      })}
    </div>
  );
}
