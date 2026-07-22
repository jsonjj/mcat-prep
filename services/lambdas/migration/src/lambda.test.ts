import { describe, expect, it } from 'vitest';

import { handler } from './lambda';

describe('migration Lambda entry', () => {
  it('exports a Node Lambda-compatible handler', () => {
    expect(handler).toBeTypeOf('function');
  });
});
