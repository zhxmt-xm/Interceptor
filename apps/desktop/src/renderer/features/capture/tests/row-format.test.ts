import { describe, expect, it } from 'vitest';

import { typeLabel } from '../row-format';

describe('capture row format', () => {
  it('normalizes native gRPC content types to a compact label', () => {
    expect(typeLabel('application/grpc')).toBe('grpc');
    expect(typeLabel('application/grpc+proto')).toBe('grpc');
    expect(typeLabel('application/grpc+json; charset=utf-8')).toBe('grpc');
    expect(typeLabel('application/grpc-web+proto')).toBe('grpc-web');
  });
});