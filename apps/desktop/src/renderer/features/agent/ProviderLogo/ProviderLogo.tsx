import { Bot } from 'lucide-react';
import { siDeepseek } from 'simple-icons';

import styles from './ProviderLogo.module.css';

export type ProviderBrand = 'deepseek' | 'unknown';

interface ProviderLogoProps {
  readonly active?: boolean;
  readonly brand: ProviderBrand;
  readonly label?: string;
}

/** Renders the approved Provider brand mark or the neutral Custom fallback. */
export function ProviderLogo({
  active = false,
  brand,
  label,
}: ProviderLogoProps): React.JSX.Element {
  if (brand === 'unknown') {
    return (
      <Bot
        aria-hidden={label === undefined}
        aria-label={label}
        className={`${styles.logo} ${active ? styles.active : ''}`}
        data-active={active ? 'true' : 'false'}
        data-provider-brand="unknown"
      />
    );
  }

  return (
    <svg
      aria-hidden={label === undefined}
      aria-label={label}
      className={`${styles.logo} ${active ? styles.active : ''}`}
      data-active={active ? 'true' : 'false'}
      data-provider-brand="deepseek"
      role={label === undefined ? undefined : 'img'}
      style={active ? { color: `#${siDeepseek.hex}` } : undefined}
      viewBox="0 0 24 24"
    >
      <path d={siDeepseek.path} fill="currentColor" />
    </svg>
  );
}
