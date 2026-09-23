import { App } from 'antd';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../shared/automation-ids';
import { PLATFORM_OPERATION_LABEL_KEYS } from '../utils';
import styles from './PlatformOperationMessage.module.css';

export function PlatformOperationMessage(): null {
  const { message } = App.useApp();
  const { t } = useTranslation();

  useEffect(() => {
    const unsubscribe = window.interceptor.onPlatformOperationConflict(({ operation }) => {
      void message.warning({
        key: 'platform-operation-conflict',
        duration: 5,
        content: (
          <span className={styles.content} data-automation-id={AUTOMATION_IDS.platform.operationConflict} data-operation={operation}>
            {t('platform.operationInProgress', { operation: PLATFORM_OPERATION_LABEL_KEYS[operation].map((key) => t(key)).join(': ') })}
          </span>
        ),
      });
    });
    return () => {
      unsubscribe();
      message.destroy('platform-operation-conflict');
    };
  }, [message, t]);

  return null;
}