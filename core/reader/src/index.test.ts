// describe, it and expect come from the vitest globals, which the root vitest.config.mts turns on for every
// workspace (the core packages declare no test dependency of their own).
import { PACKAGE_NAME } from './index';

describe('core/reader', () => {
  it('exports the package marker', () => {
    expect(PACKAGE_NAME).toBe('reader');
  });
});
