import { App, Button } from 'antd';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../shared/automation-ids';
import { removeBreakpointRule } from '../../features/rules';
import styles from './BreakpointCreatedMessage.module.css';

const MESSAGE_KEY = 'breakpoint-created';

interface BreakpointCreatedMessageProps {
  readonly ruleId: string | null;
  readonly onDismiss: (ruleId: string) => void;
}

/** 快速创建断点后的短时反馈；Undo 只有成功 Apply 删除后才关闭。 */
export function BreakpointCreatedMessage({
  ruleId,
  onDismiss,
}: BreakpointCreatedMessageProps): null {
  const { message } = App.useApp();
  const { t } = useTranslation();
  const undoingRef = useRef(false);

  useEffect(() => {
    if (ruleId === null) {
      message.destroy(MESSAGE_KEY);
      undoingRef.current = false;
      return;
    }

    const dismiss = (): void => {
      message.destroy(MESSAGE_KEY);
      onDismiss(ruleId);
    };
    const undo = async (): Promise<void> => {
      if (undoingRef.current) {
        return;
      }
      undoingRef.current = true;
      if (await removeBreakpointRule(ruleId)) {
        dismiss();
      } else {
        undoingRef.current = false;
      }
    };

    void message.success({
      key: MESSAGE_KEY,
      content: (
        <span
          className={styles.content}
          data-automation-id={AUTOMATION_IDS.capture.breakpointCreatedMessage.root}
        >
          <span>{t('breakpoints.created')}</span>
          <Button
            data-automation-id={AUTOMATION_IDS.capture.breakpointCreatedMessage.undo}
            size="small"
            type="primary"
            onClick={() => void undo()}
          >
            {t('common.undo')}
          </Button>
          <Button
            aria-label={t('common.close')}
            data-automation-id={AUTOMATION_IDS.capture.breakpointCreatedMessage.close}
            icon={<X aria-hidden="true" size={14} />}
            size="small"
            title={t('common.close')}
            type="text"
            onClick={dismiss}
          />
        </span>
      ),
      duration: 5,
      onClose: () => onDismiss(ruleId),
      pauseOnHover: true,
    });

    return () => message.destroy(MESSAGE_KEY);
  }, [message, onDismiss, ruleId, t]);

  return null;
}