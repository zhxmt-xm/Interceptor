import { Button, Spin, theme } from 'antd';

import { FixtureIcon } from '../../fixtures/FixtureIcon';
import { useDesignState } from '../../state/useDesignState';
import { GuidebookPreviewReader } from './GuidebookPreviewReader';
import {
  GUIDEBOOK_PREVIEW_COPY, guidebookPreviewLocale, guidebookPreviewTokens, guidebookPreviewUrl,
} from './utils';
import styles from './GuidebookAppCandidatePreview.module.css';

export function GuidebookAppCandidatePreview(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const { token } = theme.useToken();
  const locale = guidebookPreviewLocale(state.lang);
  const copy = GUIDEBOOK_PREVIEW_COPY[locale];
  const url = guidebookPreviewUrl(state.guidebookPreviewPage, locale);
  const ready = state.guidebookPreviewLoadState === 'ready';
  const loading = state.guidebookPreviewLoadState === 'loading';

  return (
    <section className={styles.gbpRoot} style={guidebookPreviewTokens(token)}
      data-design-guidebook-preview="" data-design-guidebook-state={state.guidebookPreviewLoadState}>
      <div className={styles.gbpToolbar}>
        <span className={styles.gbpConnection}>
          <FixtureIcon iconId={ready ? 'i-book-open' : loading ? 'i-refresh' : 'i-alert'} svgProps={{ size: 15 }} />
          {copy.online}
        </span>
        <span className={styles.gbpToolbarLanguage}>{locale === 'en' ? 'English' : '简体中文'}</span>
        <Button type="text" href={url} target="_blank" rel="noopener noreferrer"
          icon={<FixtureIcon iconId="i-external" svgProps={{ size: 15 }} />}
          data-design-guidebook-browser="toolbar">{copy.open}</Button>
      </div>
      {ready ? <GuidebookPreviewReader /> : (
        <div className={styles.gbpStatus} role={loading ? 'status' : 'alert'}>
          <div className={styles.gbpStatusIcon} data-state={state.guidebookPreviewLoadState}>
            {loading ? <Spin size="large" /> : <FixtureIcon iconId="i-alert" svgProps={{ size: 28 }} />}
          </div>
          <h1>{loading ? copy.loadingTitle : copy.errorTitle}</h1>
          <p>{loading ? copy.loadingBody : copy.errorBody}</p>
          {!loading && (
            <div className={styles.gbpStatusActions}>
              <Button type="primary" data-design-guidebook-retry=""
                icon={<FixtureIcon iconId="i-refresh" svgProps={{ size: 15 }} />}
                onClick={() => updateState({ guidebookPreviewLoadState: 'ready' })}>{copy.retry}</Button>
              <Button href={url} target="_blank" rel="noopener noreferrer" data-design-guidebook-browser="error"
                icon={<FixtureIcon iconId="i-external" svgProps={{ size: 15 }} />}>{copy.open}</Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
