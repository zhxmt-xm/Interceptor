import { Collapse } from 'antd';
import { ChevronDown, CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import styles from './CollapsibleSection.module.css';

interface CollapsibleSectionBadge {
  readonly label: string;
  readonly tone: 'neutral' | 'success' | 'warning';
}

interface CollapsibleSectionProps {
  readonly badge?: CollapsibleSectionBadge;
  readonly children: ReactNode;
  readonly className?: string;
  readonly grow?: boolean;
  readonly extra?: ReactNode;
  readonly labelExtra?: ReactNode;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly title: string;
}

export function CollapsibleSection({
  badge,
  children,
  className,
  grow = false,
  extra,
  labelExtra,
  onOpenChange,
  open,
  title,
}: CollapsibleSectionProps): React.JSX.Element {
  return (
    <Collapse
      activeKey={open ? ['content'] : []}
      bordered={false}
      className={[styles.collapsibleSection, className].filter(Boolean).join(' ')}
      expandIcon={({ isActive }) => (
        <ChevronDown
          aria-hidden="true"
          className={styles.collapsibleSectionChevronIcon}
          data-open={isActive || undefined}
        />
      )}
      expandIconPlacement="end"
      ghost
      items={[{
        key: 'content',
        style: grow ? {
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr)',
          flex: '1 1 0',
          minHeight: 0,
        } : undefined,
        label: (
          <span className={styles.collapsibleSectionLabel}>
            <span>{title}</span>
            {badge ? (
              <span className={styles.collapsibleSectionBadge} data-tone={badge.tone}>
                {badge.tone === 'warning' ? <CircleAlert aria-hidden="true" /> : null}
                <span>{badge.label}</span>
              </span>
            ) : null}
            {labelExtra}
          </span>
        ),
        extra: extra ? (
          <span
            className={styles.collapsibleSectionExtra}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {extra}
          </span>
        ) : null,
        children,
      }]}
      classNames={{
        header: styles.collapsibleSectionHeader,
        title: styles.collapsibleSectionHeaderTitle,
        body: styles.collapsibleSectionBody,
        icon: styles.collapsibleSectionChevron,
      }}
      styles={{
        header: {
          minHeight: 24,
          alignItems: 'center',
          gap: 8,
          marginBottom: open ? 12 : 0,
          padding: '0 0 8px 10px',
          border: 0,
          color: 'var(--text-2)',
          fontFamily: 'var(--font-ui)',
          fontSize: 11.5,
          fontWeight: 700,
          lineHeight: 'normal',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        },
        body: {
          display: 'flex',
          flexDirection: 'column',
          height: grow ? '100%' : undefined,
          minHeight: grow ? 0 : undefined,
          gap: 8,
          padding: 0,
        },
        icon: {
          width: 13,
          height: 13,
          marginInlineStart: 'auto',
        },
      }}
      onChange={(activeKeys) => onOpenChange(activeKeys.includes('content'))}
    />
  );
}
