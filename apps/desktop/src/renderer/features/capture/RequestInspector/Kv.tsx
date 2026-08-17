import { Copy, Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { cx, IconButton, useClipboardCopy } from '../../../components';
import type { KvRow } from '../interfaces';

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
            <span
              className={cx(styles.value, accent === 'a' && styles.accent, accent === 'g' && styles.good)}
            >
              <span className={cx(inactive && styles.ruleInactive)}>{value}</span>
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
                  {t(`capture.ruleEffect.${ruleEffect}`)}
                </button>
              ) : ruleEffect ? (
                <span className={styles.ruleEffect} data-effect={ruleEffect}>
                  {t(`capture.ruleEffect.${ruleEffect}`)}
                </span>
              ) : null}
              {copyValue ? (
                <IconButton
                  className={styles.copyBtn}
                  icon={Copy}
                  label={t('common.copy')}
                  size="sm"
                  onClick={() => copy(copyValue)}
                />
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
