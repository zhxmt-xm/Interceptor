import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** 单次图标提取的超时；超时视为取不到图标，不影响捕获。 */
const CLIENT_APP_ICON_TIMEOUT_MS = 5_000;
/** 图标 base64 输出的字节上限；32×32 PNG 远小于该值。 */
const CLIENT_APP_ICON_MAX_OUTPUT_BYTES = 1024 * 1024;

/**
 * 解析本机客户端应用 helper 的绝对路径；仅 Windows 提供，未构建时返回 null。
 * 调用方：CoreRuntime（fork 参数注入 Core）与 Main 的图标读取。
 */
export function resolveWindowsClientAppHelperPath(nativeDirectory: string): string | null {
  const helperPath = path.resolve(nativeDirectory, 'client-app/client-app-helper.exe');
  return existsSync(helperPath) ? helperPath : null;
}

/**
 * 读取应用图标并返回 PNG data URL；helper 取不到图标时返回 null。
 * imagePath 可能是可执行文件路径，也可能是 `shell:AppsFolder\<AUMID>`。
 *
 * 必须走 helper 的 shell 图标 API，不能用 `app.getFileIcon`：MSIX/UWP 应用（新版
 * Teams、Outlook）的 exe 只是 stub，图标存在包的 Assets 里，`SHGetFileInfo` 只会
 * 返回 Windows 通用应用图标。
 */
export async function readClientAppIcon(
  helperPath: string,
  imagePath: string,
): Promise<string | null> {
  const { stdout } = await execFileAsync(helperPath, ['--icon', imagePath], {
    encoding: 'utf8',
    maxBuffer: CLIENT_APP_ICON_MAX_OUTPUT_BYTES,
    timeout: CLIENT_APP_ICON_TIMEOUT_MS,
    windowsHide: true,
  });
  const base64 = stdout.trim();
  return base64.length > 0 ? `data:image/png;base64,${base64}` : null;
}
