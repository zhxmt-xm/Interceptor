import { Download, FolderPlus, Plus } from 'lucide-react';

import { fixtureClassNames } from '../../fixtures/FixtureRenderer';

export function RulesRootContextMenu(): React.JSX.Element {
  return (
    <div className={fixtureClassNames('ctxmenu')} data-ctx="rules-root">
      <div className={fixtureClassNames('cmenu-i')}><Plus aria-hidden="true" />New rule…</div>
      <div className={fixtureClassNames('cmenu-i')}><FolderPlus aria-hidden="true" />New folder…</div>
      <div className={fixtureClassNames('cmenu-sep')} />
      <div className={fixtureClassNames('cmenu-i')}><Download aria-hidden="true" />Export rules</div>
    </div>
  );
}