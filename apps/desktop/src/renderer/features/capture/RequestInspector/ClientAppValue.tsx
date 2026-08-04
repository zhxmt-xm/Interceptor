import { AppWindow } from 'lucide-react';

import { useCaptureStore } from '../data/captureStore';

import styles from './ClientAppValue.module.css';

export interface ClientAppValueProps {
  appId: string | undefined;
  name: string;
}

/** 发起请求的本机应用：系统图标 + 展示名；图标未到达时只显示名称。 */
export function ClientAppValue({
  appId,
  name,
}: ClientAppValueProps): React.JSX.Element {
  const icon = useCaptureStore((state) =>
    appId ? state.clientAppIcons.get(appId) : undefined,
  );
  return (
    <span className={styles.clientAppValue} data-parity="capture-inspector-client-app">
      {icon ? (
        <img className={styles.clientAppIcon} src={icon} alt="" />
      ) : appId !== undefined && icon === undefined ? (
        <span className={styles.clientAppLoading} />
      ) : (
        <AppWindow className={styles.clientAppUnknown} size={16} strokeWidth={1.8} />
      )}
      {name}
    </span>
  );
}
