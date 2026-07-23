import { App } from 'antd';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * 复制文本到系统剪贴板并用 antd message 反馈成功。
 * 走 web clipboard（Main 已放开 clipboard 权限）；失败时静默，不打断用户。
 */
export function useClipboardCopy(): (text: string) => void {
  const { message } = App.useApp();
  const { t } = useTranslation();
  return useCallback(
    (text: string) => {
      void navigator.clipboard
        ?.writeText(text)
        .then(() => {
          void message.success(t('capture.copied'));
        })
        .catch(() => {
          /* secure context / 权限异常时静默。 */
        });
    },
    [message, t],
  );
}
