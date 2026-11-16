// describe, it and expect come from the vitest globals, which the root vitest.config.mts turns on for every
// workspace (the core packages declare no test dependency of their own).
import * as panel from './index';

describe('core/panel', () => {
  it('the package entry exposes what the hosts use', () => {
    for (const name of ['planView', 'render', 'isWebviewMessage', 'isHostMessage', 'bindPanel', 'panelDocument']) {
      expect(typeof (panel as Record<string, unknown>)[name], name).toBe('function');
    }
  });
});
