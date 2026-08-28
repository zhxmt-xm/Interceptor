import { Bot } from 'lucide-react';
import {
  siAnthropic,
  siDeepseek,
  siGooglegemini,
  siOllama,
  siQwen,
  type SimpleIcon,
} from 'simple-icons';

import styles from './ProviderLogo.module.css';

export type KnownProviderBrand =
  | 'anthropic'
  | 'deepseek'
  | 'google-gemini'
  | 'ollama'
  | 'qwen';

export type ProviderBrand = KnownProviderBrand | 'unknown';

export const PROVIDER_LOGO_BY_BRAND: Readonly<Record<KnownProviderBrand, SimpleIcon>> = {
  anthropic: siAnthropic,
  deepseek: siDeepseek,
  'google-gemini': siGooglegemini,
  ollama: siOllama,
  qwen: siQwen,
};

interface ProviderLogoProps {
  readonly active?: boolean;
  readonly brand: ProviderBrand;
  readonly label?: string;
}

export function ProviderLogo({ active = false, brand, label }: ProviderLogoProps): React.JSX.Element {
  const icon = brand === 'unknown' ? undefined : PROVIDER_LOGO_BY_BRAND[brand];
  if (icon === undefined) {
    return (
      <Bot
        aria-hidden={label === undefined}
        aria-label={label}
        className={`${styles.providerLogo} ${active ? styles.providerLogoActive : ''}`}
        data-active={active ? 'true' : 'false'}
        data-provider-brand="unknown"
      />
    );
  }
  return (
    <svg
      aria-hidden={label === undefined}
      aria-label={label}
      className={`${styles.providerLogo} ${active ? styles.providerLogoActive : ''}`}
      data-active={active ? 'true' : 'false'}
      data-provider-brand={brand}
      role={label === undefined ? undefined : 'img'}
      style={active ? { color: `#${icon.hex}` } : undefined}
      viewBox="0 0 24 24"
    >
      <path d={icon.path} fill="currentColor" />
    </svg>
  );
}