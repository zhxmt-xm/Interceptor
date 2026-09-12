import { Download, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../Button/Button';
import styles from './UnavailableBody.module.css';

interface UnavailableBodyProps {
  icon: LucideIcon;
  mediaType: string;
  /** 已格式化的硬数字，如 `7680 × 4320 · 24 MB`。 */
  measures: string;
  /** 一句话说明为什么没有内容可渲染，而不只是「无法预览」。 */
  reason: string;
  saving?: boolean;
  onSave(): void;
  parityId?: string;
}

/** 音视频与超限图片共用的占位卡片：说清为什么不渲染，并给出唯一出口。 */
export function UnavailableBody({
  icon: Icon,
  mediaType,
  measures,
  reason,
  saving = false,
  onSave,
  parityId,
}: UnavailableBodyProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={styles.host} data-parity={parityId}>
      <div className={styles.content}>
        <span className={styles.icon}><Icon aria-hidden="true" /></span>
        <div className={styles.details}>
          <b className={styles.mime}>{mediaType}</b>
          <span className={styles.measures}>{measures}</span>
          <span className={styles.reason}>{reason}</span>
        </div>
      </div>
      <Button className={styles.save} icon={Download} size="sm" loading={saving} onClick={onSave}>
        {t('body.save')}
      </Button>
    </div>
  );
}
