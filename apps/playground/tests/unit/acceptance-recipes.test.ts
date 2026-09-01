import { describe, expect, it } from 'vitest';

import { INTERCEPTOR_TOOL_NAMES } from '@interceptor/tools';

import { ACCEPTANCE_RECIPES } from '../../src/acceptance/recipes';

describe('ACCEPTANCE_RECIPES', () => {
  it('covers every current shared Tool without extra names', () => {
    expect(Object.keys(ACCEPTANCE_RECIPES).sort()).toEqual(
      [...INTERCEPTOR_TOOL_NAMES].sort(),
    );
    for (const recipe of Object.values(ACCEPTANCE_RECIPES)) {
      expect(recipe.setup.length).toBeGreaterThan(0);
      expect(recipe.observations.length).toBeGreaterThan(0);
    }
  });
});