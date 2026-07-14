import { Database, Download, Lock, type LucideIcon, Palette, Shield, Wifi } from 'lucide-react';

export interface SettingsSection {
  id: string;
  label: string;
  Icon: LucideIcon;
}

export const SECTIONS: SettingsSection[] = [
  { id: 'proxy', label: 'Proxy & Listener', Icon: Wifi },
  { id: 'certificates', label: 'Certificates', Icon: Shield },
  { id: 'appearance', label: 'Appearance', Icon: Palette },
  { id: 'storage', label: 'Storage', Icon: Database },
  { id: 'privacy', label: 'Privacy', Icon: Lock },
  { id: 'updates', label: 'Updates', Icon: Download },
];
