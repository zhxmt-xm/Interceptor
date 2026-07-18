import { Database, Download, Lock, type LucideIcon, Palette, Shield, Wifi } from 'lucide-react';

export interface SettingsSection {
  id: string;
  labelKey: string;
  Icon: LucideIcon;
}

export const SECTIONS: SettingsSection[] = [
  { id: 'proxy', labelKey: 'settings.nav.proxy', Icon: Wifi },
  { id: 'certificates', labelKey: 'settings.nav.certificates', Icon: Shield },
  { id: 'appearance', labelKey: 'settings.nav.appearance', Icon: Palette },
  { id: 'storage', labelKey: 'settings.nav.storage', Icon: Database },
  { id: 'privacy', labelKey: 'settings.nav.privacy', Icon: Lock },
  { id: 'updates', labelKey: 'settings.nav.updates', Icon: Download },
];
