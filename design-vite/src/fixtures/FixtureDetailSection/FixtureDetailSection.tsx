import { useState, type ReactNode } from 'react';

import { CollapsibleSection } from '../../components/CollapsibleSection/CollapsibleSection';
import styles from './FixtureDetailSection.module.css';

interface FixtureDetailSectionProps {
  readonly children: ReactNode;
  readonly grow: boolean;
  readonly labelExtra?: ReactNode;
  readonly title: string;
}

export function FixtureDetailSection({
  children,
  grow,
  labelExtra,
  title,
}: FixtureDetailSectionProps): React.JSX.Element {
  const [open, setOpen] = useState(true);

  return (
    <CollapsibleSection
      className={grow ? styles.fixtureDetailSectionGrow : undefined}
      grow={grow}
      labelExtra={labelExtra}
      open={open}
      title={title}
      onOpenChange={setOpen}
    >
      {children}
    </CollapsibleSection>
  );
}