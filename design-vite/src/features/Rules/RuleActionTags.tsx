import { Tooltip } from 'antd';
import { Ellipsis } from 'lucide-react';

import { fixtureClassNames } from '../../fixtures/FixtureRenderer';

import styles from './RuleActionTags.module.css';

interface RuleActionTag {
  readonly kind: string;
  readonly label: string;
}

interface RuleActionTagsProps {
  readonly actions: readonly RuleActionTag[];
}

export function RuleActionTags({ actions }: RuleActionTagsProps): React.JSX.Element {
  return (
    <div className={fixtureClassNames('rchips')} data-action-overflow="true">
      {actions.slice(0, 2).map((action) => (
        <span
          key={`${action.kind}:${action.label}`}
          className={fixtureClassNames('rchip', action.kind)}
        >
          {action.label}
        </span>
      ))}
      <Tooltip
        mouseEnterDelay={0.4}
        trigger={['hover', 'focus']}
        title={(
          <div className={styles.actionTagTooltip}>
            {actions.map((action) => (
              <span
                key={`${action.kind}:${action.label}`}
                className={fixtureClassNames(
                  'rchip',
                  action.kind,
                  styles.actionTagTooltipChip ?? '',
                )}
              >
                {action.label}
              </span>
            ))}
          </div>
        )}
      >
        <button
          type="button"
          className={styles.actionTagOverflow}
          aria-label={`Show all ${actions.length} actions`}
          onClick={(event) => event.stopPropagation()}
        >
          <Ellipsis aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  );
}