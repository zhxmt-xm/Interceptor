import type { AndroidDeviceInfo } from '../../../../shared/desktop-api';

export function formatAndroidFingerprint(value: string): string {
  return value.split(/\s+/).filter(Boolean).reduce<string[]>((lines, group, index) => {
    const line = Math.floor(index / 4);
    lines[line] = lines[line] ? `${lines[line]} ${group}` : group;
    return lines;
  }, []).join('\n');
}

export function validAndroidFingerprint(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value.replaceAll(/\s/g, ''));
}

export function androidDeviceLabel(device: AndroidDeviceInfo): string {
  return device.model ?? device.serial;
}
