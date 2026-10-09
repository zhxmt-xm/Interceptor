import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { Select } from '../../Select';

it('disables the real combobox while a settings Apply is running', () => {
  const props = {
    value: 'http', options: [{ value: 'http', label: 'HTTP' }],
    ariaLabel: 'Protocol', onValueChange: () => undefined, disabled: true,
  };
  expect(renderToStaticMarkup(createElement(Select, props))).toContain('disabled=""');
});
