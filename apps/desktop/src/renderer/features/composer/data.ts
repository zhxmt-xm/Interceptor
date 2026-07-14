export interface HeaderRow {
  name: string;
  value: string;
  on: boolean;
}

export const HEADERS: HeaderRow[] = [
  { name: 'authorization', value: 'Bearer github_pat_11A…', on: true },
  { name: 'content-type', value: 'application/json', on: true },
  { name: 'accept', value: 'application/vnd.github+json', on: true },
  { name: 'user-agent', value: 'Interceptor/1.0.0', on: false },
];
