import type { HttpMethod } from '../../components';

export interface PausedRequest {
  dir: 'req' | 'resp';
  method?: HttpMethod;
  status?: string;
  name: string;
  url: string;
  time: string;
  sel?: boolean;
}

export const PAUSED: PausedRequest[] = [
  { dir: 'req', method: 'post', name: 'Debug checkout', url: 'shop.example.com/checkout', time: '0:24', sel: true },
  { dir: 'resp', status: '200', name: 'Inspect token', url: 'api.example.com/v1/token', time: '0:58' },
];

export interface EditableHeader {
  name: string;
  value: string;
}

export const BP_HEADERS: EditableHeader[] = [
  { name: 'content-type', value: 'application/json' },
  { name: 'authorization', value: 'Bearer eyJhbGci…' },
  { name: 'x-cart-id', value: 'c_9f83a1' },
];
