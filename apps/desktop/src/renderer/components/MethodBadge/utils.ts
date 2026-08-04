/** 徒有设计配色的四个方法；其余方法走中性色。 */
export type HttpMethod = 'get' | 'post' | 'put' | 'del';

export type MethodTone = HttpMethod;

/**
 * 把原始 HTTP 方法（任意大小写、缩写或全称）归一为徽标标签与配色。
 * 已知方法映射到设计定义的 4 种配色；未知方法（HEAD/OPTIONS 等）用中性色。
 */
export function classifyMethod(method: string): {
  label: string;
  tone?: MethodTone;
} {
  switch (method.toUpperCase()) {
    case 'GET':
      return { label: 'GET', tone: 'get' };
    case 'POST':
      return { label: 'POST', tone: 'post' };
    case 'PUT':
      return { label: 'PUT', tone: 'put' };
    case 'PATCH':
      return { label: 'PATCH', tone: 'put' };
    case 'DEL':
    case 'DELETE':
      return { label: 'DEL', tone: 'del' };
    default:
      return { label: method.toUpperCase() };
  }
}
