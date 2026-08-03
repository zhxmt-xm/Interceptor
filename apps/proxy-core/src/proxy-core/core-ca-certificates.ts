import tls from 'node:tls';

/**
 * 把 Node 内置 CA、操作系统信任库与 NODE_EXTRA_CA_CERTS 合并为默认信任集合。
 *
 * MITM 开启后 Core 自己充当客户端校验源站证书。Node 默认只信任编译进二进制的
 * 公开 CA bundle，企业根 CA、组策略下发的 CA、用户手工安装的自签 CA 全部不在其中，
 * 于是公司内网服务在开启解密后集体握手失败。
 *
 * 不用 `--use-system-ca`：那个标志是**替换**而不是合并，会丢掉 bundled 里有、
 * 系统库里没有的公开 CA（Windows 的根证书是按需从 Windows Update 拉取的，
 * 本地 ROOT 存储通常比 Node 的 bundle 少），反而会让部分公网站点失败。
 */
export function installDefaultCaCertificates(): { bundled: number; system: number; extra: number; total: number } {
  const bundled = tls.getCACertificates('bundled');
  const system = readCaCertificates('system');
  const extra = readCaCertificates('extra');
  const merged = [...new Set([...bundled, ...system, ...extra])];
  tls.setDefaultCACertificates(merged);
  return {
    bundled: bundled.length,
    system: system.length,
    extra: extra.length,
    total: merged.length,
  };
}

/** 系统信任库与 NODE_EXTRA_CA_CERTS 都可能读取失败；任一来源缺失不应阻断启动。 */
function readCaCertificates(type: 'system' | 'extra'): string[] {
  try {
    return [...tls.getCACertificates(type)];
  } catch {
    return [];
  }
}
