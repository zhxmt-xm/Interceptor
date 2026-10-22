import { Popover } from 'antd';
import { useMemo, type ReactNode } from 'react';

import { FixtureRenderer, fixtureClassNames } from '../../fixtures/FixtureRenderer';
import { rulesFixture } from '../../fixtures/generated/rulesFixture';
import { useDesignState } from '../../state/useDesignState';
import { findActionMenu } from './utils';

import styles from './RulesActionPopover.module.css';

interface RulesActionPopoverProps {
  readonly children: readonly ReactNode[];
}

export function RulesActionPopover({ children }: RulesActionPopoverProps): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const menu = useMemo(() => findActionMenu(rulesFixture), []);

  return (
    <Popover
      trigger="click"
      arrow={false}
      autoAdjustOverflow
      open={state.view === 'rules' && state.pop}
      onOpenChange={(pop) => updateState({ pop })}
      placement="right"
      getPopupContainer={(trigger) => trigger.closest<HTMLElement>('.app') ?? document.body}
      classNames={{
        container: [styles.rulesEditorActionsPopover, fixtureClassNames('apop')].join(' '),
      }}
      styles={{
        container: {
          padding: 7,
          background: 'var(--panel)',
          border: '1px solid var(--border-2)',
          borderRadius: 12,
          boxShadow: '0 18px 44px rgba(0, 0, 0, 0.2)',
        },
      }}
      content={<FixtureRenderer node={menu} />}
    >
      <button
        id="addaction"
        type="button"
        className={fixtureClassNames('add')}
        data-fixture-node=""
      >
        {children}
      </button>
    </Popover>
  );
}
