export type ChipKind = 'map' | 'remote' | 'rewrite' | 'block' | 'throttle' | 'brk';

export interface Rule {
  name: string;
  match: string;
  chips: Array<[ChipKind, string]>;
  hit: string;
  on: boolean;
}

export const RULES: Rule[] = [
  { name: 'Stub /v1/user', match: 'api.example.com · /v1/user', chips: [['map', 'Map Local']], hit: '128', on: true },
  { name: 'Force CORS + JSON', match: '*.api.com · response', chips: [['rewrite', 'Rewrite']], hit: '512', on: true },
  { name: 'Redirect to staging', match: 'prod.example.com → stg', chips: [['remote', 'Map Remote']], hit: '44', on: true },
  { name: 'Block trackers', match: '*.doubleclick.net', chips: [['block', 'Block']], hit: '1.2k', on: true },
  { name: 'Throttle uploads', match: 'upload.example.com · 3G', chips: [['throttle', 'Throttle']], hit: '8', on: true },
  { name: 'Debug checkout', match: 'shop.example.com · /checkout', chips: [['brk', 'Breakpoint']], hit: '3', on: true },
  { name: 'Rewrite auth header', match: 'api.github.com · request', chips: [['rewrite', 'Rewrite']], hit: '76', on: false },
  { name: 'Mock payment', match: 'api.stripe.com · /v1/charges', chips: [['map', 'Map Local'], ['rewrite', 'Rewrite']], hit: '21', on: true },
];
