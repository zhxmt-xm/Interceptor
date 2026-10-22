import { FixtureIcon } from '../../fixtures/FixtureIcon';
import { GUIDE_SEARCH_PREVIEW_COPY, type GuideSearchPreviewLocale } from './utils';
import styles from './HomepageGuideSearchTrigger.module.css';

export function HomepageGuideSearchTrigger({ locale, onClick }: {
  locale: GuideSearchPreviewLocale;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      className={styles.hgsTrigger}
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      data-automation-id="guide.search.trigger"
    >
      <FixtureIcon iconId="i-search" svgProps={{ size: 16 }} />
      <span>{GUIDE_SEARCH_PREVIEW_COPY[locale].trigger}</span>
      <kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}</kbd>
    </button>
  );
}
