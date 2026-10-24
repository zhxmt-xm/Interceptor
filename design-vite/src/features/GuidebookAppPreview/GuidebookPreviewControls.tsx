import { Button, Select } from 'antd';

import { useDesignState } from '../../state/useDesignState';
import { createDesignTheme } from '../../theme/theme';
import {
  GUIDEBOOK_PREVIEW_SCENES, guidebookPreviewLocale, guidebookPreviewPatch, guidebookPreviewScene,
} from './utils';
import styles from './GuidebookPreviewControls.module.css';

export function GuidebookPreviewControls(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  if (!state.guidebookAppPreview) return null;
  const token = createDesignTheme(state.theme).token;
  return (
    <nav className={styles.gbpControls} aria-label="Guidebook App design controls" data-design-guidebook-controls=""
      style={{ color: token?.colorText, background: token?.colorBgElevated, borderColor: token?.colorTextSecondary }}>
      <span>App 教程入口 · 候选</span>
      <Select aria-label="Guidebook preview scene" value={guidebookPreviewScene(state)}
        options={GUIDEBOOK_PREVIEW_SCENES.map(([value, label]) => ({ value, label }))}
        onChange={scene => updateState(guidebookPreviewPatch(scene))} />
      <Select aria-label="Guidebook preview language" value={guidebookPreviewLocale(state.lang)}
        options={[{ value: 'en', label: 'English' }, { value: 'zh', label: '中文' }]}
        onChange={locale => updateState({ lang: locale === 'en' ? 'en' : 'zh-CN' })} />
      <Button onClick={() => updateState({ sidebar: state.sidebar === 'collapsed' ? 'expanded' : 'collapsed' })}>侧栏</Button>
      <span>内容为本地预览，非线上接入验收</span>
    </nav>
  );
}
