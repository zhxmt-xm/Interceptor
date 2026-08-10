import { fixtureClassNames } from '../fixtures/FixtureRenderer';
import type { DesignTheme, DesignView } from '../state/types';
import { useDesignState } from '../state/useDesignState';

const NAV_ITEMS: readonly { readonly id: Exclude<DesignView, 'settings'>; readonly icon: string; readonly label: string }[] = [
  { id: 'capture', icon: 'i-activity', label: 'Capture' },
  { id: 'rules', icon: 'i-branch', label: 'Rules & Map' },
  { id: 'composer', icon: 'i-send', label: 'Composer' },
  { id: 'diagnostics', icon: 'i-terminal', label: 'Diagnostics' },
];

const THEME_ICON: Readonly<Record<DesignTheme, string>> = {
  warm: 'i-sunrise', light: 'i-sun', ember: 'i-sunset', dark: 'i-moon',
};

const LANGUAGE_CODE: Readonly<Record<string, string>> = {
  en: 'EN', 'zh-CN': '简', 'zh-TW': '繁', ja: '日', ko: '한', de: 'DE', fr: 'FR', es: 'ES', it: 'IT',
  'pt-BR': 'PT', ru: 'RU', nl: 'NL', pl: 'PL', tr: 'TR', uk: 'UA',
};

function Icon({ name }: { readonly name: string }): React.JSX.Element {
  return <svg><use href={`#${name}`} /></svg>;
}

export function Sidebar(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  return (
    <aside className={fixtureClassNames('side')}>
      <div className={fixtureClassNames('sbrand')}><div className={fixtureClassNames('logo')}><Icon name="i-zap" /></div><b>Interceptor</b></div>
      <div className={fixtureClassNames('label')}>Workspace</div>
      {NAV_ITEMS.map((item) => (
        <div key={item.id} className={fixtureClassNames(`nav${item.id === state.view ? ' on' : ''}`)} data-nav={item.id} onClick={() => updateState({ view: item.id })}>
          <Icon name={item.icon} /><span className={fixtureClassNames('txt')}>{item.label}</span>
        </div>
      ))}
      <div className={fixtureClassNames('label')}>Session</div>
      <div className={fixtureClassNames('nav')}><Icon name="i-globe" /><span className={fixtureClassNames('txt col')}><span>Local traffic</span><small>127.0.0.1:8888</small></span><span className={fixtureClassNames('live')} /></div>
      <div className={fixtureClassNames('spring')} />
      <div className={fixtureClassNames(`nav${state.view === 'settings' ? ' on' : ''}`)} data-nav="settings" onClick={() => updateState({ view: 'settings' })}><Icon name="i-settings" /><span className={fixtureClassNames('txt')}>Settings</span></div>
      <div className={fixtureClassNames('nav lgtrigger')} data-lgtrigger><Icon name="i-globe" /><span className={fixtureClassNames('txt')}>Language</span><span className={fixtureClassNames('lgcode')}>{LANGUAGE_CODE[state.lang] ?? 'EN'}</span></div>
      <div className={fixtureClassNames('nav thtrigger')} data-thtrigger><Icon name={THEME_ICON[state.theme]} /><span className={fixtureClassNames('txt')}>Theme</span><span className={fixtureClassNames('thdot')} /></div>
    </aside>
  );
}