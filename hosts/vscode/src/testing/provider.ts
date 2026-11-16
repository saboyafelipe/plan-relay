// An agent provider for the unit tests: installs on request, starts with the plugin not installed, and gives the action
// as JSON for the prompt, so the tests can read it.
import { vi } from 'vitest';
import type { Provider } from '../agents/provider';

export type ProviderState = Awaited<ReturnType<Provider['installState']>>;

export const ACTIVE: ProviderState = { state: 'active-project', scope: 'project' };

export function fakeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    name: 'Agent',
    automatedInstall: true,
    howToInstall: 'run the installer',
    scopes: [
      { scope: 'project', label: 'Project', descriptionText: 'this folder' },
      { scope: 'user', label: 'User', descriptionText: 'everywhere' },
    ],
    watchedSettings: [],
    detect: () => true,
    installState: vi.fn<Provider['installState']>(() => Promise.resolve({ state: 'not-installed' })),
    install: vi.fn<Provider['install']>(() => Promise.resolve({ ok: true, message: 'installed' })),
    uninstall: vi.fn<Provider['uninstall']>(() => Promise.resolve({ ok: true, message: 'uninstalled' })),
    prompt: (action) => JSON.stringify(action),
    ...overrides,
  };
}
