/** 把 Renderer 的未捕获异常与未处理 rejection 上报给 Main 的诊断管道。 */
export function reportRendererDiagnostic(
  kind: 'uncaught-error' | 'unhandled-rejection',
  reason: unknown,
): void {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  void window.interceptor
    .reportRendererDiagnostic({
      kind,
      name: normalizeErrorName(error.name),
      message: error.message,
    })
    .catch(() => undefined);
}

/** 错误名要进诊断的 errorCode 字段，先收敛到稳定字符集。 */
function normalizeErrorName(name: string): string {
  const normalized = name.replace(/[^A-Za-z0-9._:-]/g, '_');
  return normalized || 'Error';
}
