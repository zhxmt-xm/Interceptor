import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Count, IconButton, Switch, Title } from '../../../components';
import { useBreakpointsStore } from '../breakpointsStore';
import { setBreakOnMatch } from '../useBreakpoints';
import styles from './BreakpointsTopbar.module.css';

export interface BreakpointsTopbarProps {
  onMenu?: () => void;
}

/** Breakpoints topbar: toggle, title, paused count and break-on-match switch. */
export function BreakpointsTopbar({ onMenu }: BreakpointsTopbarProps): React.JSX.Element {
  const { t } = useTranslation();
  const count = useBreakpointsStore((state) => state.breakpoints.length);
  const enabled = useBreakpointsStore((state) => state.enabled);

  return (
    <>
      <IconButton icon={Menu} label={t('capture.toggleSidebar')} onClick={onMenu} />
      <Title>{t('breakpoints.title')}</Title>
      <Count className={styles.count}>
        {t('breakpoints.pausedCount', { count })}
      </Count>
      <div className={styles.actions}>
        <Count className={styles.breakLabel}>{t('breakpoints.breakOnMatch')}</Count>
        <Switch checked={enabled} onChange={(next) => void setBreakOnMatch(next)} />
      </div>
    </>
  );
}
