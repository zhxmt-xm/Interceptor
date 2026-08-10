import type { ProxyService } from '../entry';

/**
 * 测试前置：把 ProxyService 置为「用给定 CA 解密」的状态。
 * 产品里这几步分别由各自的 tls.* 命令触发，测试只是一次铺好起始条件。
 */
export async function decryptWithCertificate(
  proxyService: ProxyService,
  ca: { key: string; cert: string },
  insecureHosts: readonly string[],
  passthroughHosts: readonly string[] = [],
): Promise<void> {
  proxyService.useCertificate(ca);
  await proxyService.replaceInsecureHosts(insecureHosts);
  proxyService.replacePassthroughHosts(passthroughHosts);
  await proxyService.startHttpsDecryption();
}
