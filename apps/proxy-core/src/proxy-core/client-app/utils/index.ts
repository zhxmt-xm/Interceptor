/**
 * 判断客户端地址是否来自本机；只有本机连接才存在可反查的本地进程，
 * 远程设备（手机等）经代理连入时不做反查。
 */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) {
    return false;
  }
  const normalized = address.startsWith('::ffff:') ? address.slice(7) : address;
  return normalized === '::1' || normalized.startsWith('127.');
}
