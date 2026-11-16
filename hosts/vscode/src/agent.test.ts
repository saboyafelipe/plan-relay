import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stringsFor } from '@plan-relay/i18n';
import type { PluginView } from '@plan-relay/panel';
import { AgentWiring, VIEW, active } from './agent';
import type { InstallOutcome, Provider } from './agents/provider';
import { ACTIVE, fakeProvider, type ProviderState } from './testing/provider';
import { FakeChannel, fake } from './testing/vscode';

const EN = stringsFor('en');
const NOT_INSTALLED: ProviderState = { state: 'not-installed' };

/** The provider's three calls as mocks of their own, and the wiring built on them. */
function wiring(options: { states?: ProviderState[]; overrides?: Partial<Provider> } = {}) {
  const states = [...(options.states ?? [NOT_INSTALLED])];
  const installState = vi.fn<Provider['installState']>(() =>
    Promise.resolve(states.length > 1 ? (states.shift() ?? NOT_INSTALLED) : (states[0] ?? NOT_INSTALLED)),
  );
  const install = vi.fn<Provider['install']>(() => Promise.resolve({ ok: true, message: 'installed' }));
  const uninstall = vi.fn<Provider['uninstall']>(() => Promise.resolve({ ok: true, message: 'uninstalled' }));
  const provider = fakeProvider({ installState, install, uninstall, ...options.overrides });
  const sent: PluginView[] = [];
  const channel = new FakeChannel('test');
  const agent = new AgentWiring(provider, channel, (plugin) => sent.push(plugin), EN);
  return { agent, sent, channel, installState, install, uninstall };
}

beforeEach(() => {
  fake.reset();
  fake.openFolders('/ws');
});

describe('active', () => {
  it('only the two active states count', () => {
    expect(active({ state: 'active-user', scope: 'user' })).toBe(true);
    expect(active(ACTIVE)).toBe(true);
    expect(active({ state: 'inactive', scope: 'project' })).toBe(false);
    expect(active(undefined)).toBe(false);
  });
});

describe('AgentWiring.read', () => {
  it('reads the state for the first folder and sends it to the page', async () => {
    const { agent, sent, installState } = wiring({ states: [ACTIVE] });
    await agent.read();
    expect(installState).toHaveBeenCalledWith('/ws');
    expect(sent).toEqual([ACTIVE]);
    expect(agent.status()).toEqual(ACTIVE);
  });

  it('without a folder it reads nothing', async () => {
    fake.workspaceFolders = undefined;
    const { agent, sent, installState } = wiring();
    await agent.read();
    expect(installState).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it('a state with an error is a warning line; a provider that throws is an error line, and nothing is sent', async () => {
    const failing = wiring({ states: [{ state: 'error', error: 'x' }] });
    await failing.agent.read();
    expect(failing.channel.lines.at(-1)?.level).toBe('warn');
    const throwing = wiring({ overrides: { installState: () => Promise.reject(new Error('down')) } });
    await throwing.agent.read();
    expect(throwing.channel.texts('error')).toEqual([EN.t('log.pluginReadFailed', 'down')]);
    expect(throwing.sent).toEqual([]);
  });
});

describe('AgentWiring.ensure', () => {
  it('active: true, without asking', async () => {
    const { agent } = wiring({ states: [ACTIVE] });
    expect(await agent.ensure(undefined, 'why')).toBe(true);
    expect(fake.shown).toEqual([]);
  });

  it('without an automated install, says how and returns false', async () => {
    const { agent } = wiring({ overrides: { automatedInstall: false } });
    expect(await agent.ensure(undefined, 'why')).toBe(false);
    expect(fake.shown.map((s) => s.text)).toEqual([EN.t('notice.brand', EN.t('install.inactiveAs', 'run the installer'))]);
  });

  it('asks in a modal with the reason; closing it installs nothing', async () => {
    const { agent, install } = wiring();
    expect(await agent.ensure(undefined, 'to run')).toBe(false);
    expect(fake.shown[0]).toMatchObject({
      severity: 'warning',
      text: EN.t('install.inactive'),
      options: { modal: true, detail: 'to run' },
    });
    expect(install).not.toHaveBeenCalled();
  });

  it('a given scope installs without asking, and the state read afterwards decides', async () => {
    const { agent, install } = wiring({ states: [NOT_INSTALLED, ACTIVE] });
    expect(await agent.ensure({ install: 'user' }, 'why')).toBe(true);
    expect(install).toHaveBeenCalledWith('/ws', 'user', undefined);
    expect(fake.shown.filter((s) => s.options !== undefined)).toEqual([]);
  });

  it('a given "false" declines', async () => {
    const { agent, install } = wiring();
    expect(await agent.ensure({ install: false }, 'why')).toBe(false);
    expect(install).not.toHaveBeenCalled();
  });

  it('accepting the modal asks for the scope and installs there', async () => {
    fake.answer = (s) => s.items[0];
    fake.pick = (items) => items[1];
    const { agent, install } = wiring();
    await agent.ensure(undefined, 'why');
    expect(install).toHaveBeenCalledWith('/ws', 'user', undefined);
  });
});

describe('AgentWiring.install and uninstall', () => {
  it('without a folder, asks to open one', async () => {
    fake.workspaceFolders = undefined;
    const { agent, install } = wiring();
    await agent.install('project');
    expect(install).not.toHaveBeenCalled();
    expect(fake.shown[0]?.text).toBe(EN.t('notice.brand', EN.t('install.openAFolder')));
  });

  it('without an automated install, says how', async () => {
    const { agent, install } = wiring({ overrides: { automatedInstall: false } });
    await agent.install('project');
    expect(install).not.toHaveBeenCalled();
    expect(fake.shown[0]).toMatchObject({ severity: 'info', text: EN.t('notice.brand', 'run the installer') });
  });

  it('no scope chosen: nothing happens', async () => {
    const { agent, install } = wiring();
    await agent.install();
    expect(install).not.toHaveBeenCalled();
  });

  it('installing shows "installing" with the view progress bar, then the new state and the message', async () => {
    const { agent, sent } = wiring({ states: [ACTIVE] });
    await agent.install('project');
    expect(sent).toEqual([{ state: 'installing' }, ACTIVE]);
    expect(fake.progress).toContainEqual({ viewId: VIEW });
    expect(fake.shown.at(-1)).toMatchObject({ severity: 'info', text: EN.t('notice.brand', 'installed') });
  });

  it.each([
    ['refuses', (): Promise<InstallOutcome> => Promise.resolve({ ok: false, error: 'no network' })],
    ['throws', (): Promise<InstallOutcome> => Promise.reject(new Error('no network'))],
  ])('an install that %s becomes an error notice, and the state is read again', async (_how, failing) => {
    const { agent, installState } = wiring({ overrides: { install: failing } });
    await agent.install('user');
    expect(fake.shown.at(-1)).toMatchObject({ severity: 'error', text: EN.t('notice.brand', EN.t('install.didNotInstall', 'no network')) });
    expect(installState).toHaveBeenCalled();
    expect(agent.status()).toEqual(NOT_INSTALLED);
  });

  it('a second install while one runs is ignored, and a read during it does not overwrite "installing"', async () => {
    let finish: (r: InstallOutcome) => void = () => undefined;
    const slow = vi.fn(() => new Promise<InstallOutcome>((r) => (finish = r)));
    const { agent } = wiring({ overrides: { install: slow } });
    const first = agent.install('user');
    await vi.waitFor(() => expect(slow).toHaveBeenCalledOnce());
    await agent.install('user');
    await agent.read();
    expect(slow).toHaveBeenCalledOnce();
    expect(agent.status()).toEqual({ state: 'installing' });
    finish({ ok: true, message: 'ok' });
    await first;
  });

  it('the default source: the scope question does not name it, and no other question comes', async () => {
    fake.pick = (items) => items[0];
    const source = { source: 'owner/repo', origin: 'default' } as const;
    const { agent, install } = wiring({ overrides: { installSource: () => Promise.resolve(source) } });
    await agent.install();
    expect(fake.picks).toEqual([expect.objectContaining({ placeHolder: EN.t('install.whereToInstall') })]);
    expect(fake.shown.filter((s) => s.options !== undefined)).toEqual([]);
    expect(install).toHaveBeenCalledWith('/ws', 'project', source);
  });

  it('a source other than the default is named in the scope question', async () => {
    fake.pick = (items) => items[1];
    const source = { source: '/opt/marketplace', origin: 'configured' } as const;
    const { agent, install } = wiring({ overrides: { installSource: () => Promise.resolve(source) } });
    await agent.install();
    expect(fake.picks).toEqual([expect.objectContaining({ placeHolder: EN.t('install.whereToInstallFrom', '/opt/marketplace') })]);
    expect(install).toHaveBeenCalledWith('/ws', 'user', source);
  });

  it('a source from the open folder asks a "yes" of its own; closing it installs nothing', async () => {
    const source = { source: '/ws', origin: 'workspace' } as const;
    const { agent, install } = wiring({ overrides: { installSource: () => Promise.resolve(source) } });
    await agent.install('user');
    expect(fake.shown[0]).toMatchObject({
      severity: 'warning',
      text: EN.t('install.fromWorkspace'),
      options: { modal: true, detail: EN.t('install.fromWorkspaceDetail', '/ws') },
      items: [EN.t('option.install-from-folder')],
    });
    expect(install).not.toHaveBeenCalled();
  });

  it('accepting the "yes" installs from the open folder', async () => {
    fake.answer = (s) => s.items[0];
    const source = { source: '/ws', origin: 'workspace' } as const;
    const { agent, install } = wiring({ overrides: { installSource: () => Promise.resolve(source) } });
    await agent.install('user');
    expect(install).toHaveBeenCalledWith('/ws', 'user', source);
  });

  it('a canned scope (development and tests only) also answers the "yes" for the open folder', async () => {
    const source = { source: '/ws', origin: 'workspace' } as const;
    const { agent, install } = wiring({ overrides: { installSource: () => Promise.resolve(source) } });
    await agent.ensure({ install: 'user' }, 'why');
    expect(install).toHaveBeenCalledWith('/ws', 'user', source);
    expect(fake.shown.filter((s) => s.options !== undefined)).toEqual([]);
  });

  it('a source that cannot be read is an error notice, and nothing is asked or installed', async () => {
    const { agent, install } = wiring({ overrides: { installSource: () => Promise.reject(new Error('no binary')) } });
    await agent.install();
    expect(fake.picks).toEqual([]);
    expect(install).not.toHaveBeenCalled();
    expect(fake.shown.at(-1)).toMatchObject({ severity: 'error', text: EN.t('notice.brand', EN.t('install.didNotInstall', 'no binary')) });
  });

  it('uninstalls from the scope where it is active, or the one given', async () => {
    const { agent, uninstall } = wiring({ states: [ACTIVE] });
    await agent.read();
    await agent.uninstall();
    await agent.uninstall('local');
    expect(uninstall.mock.calls).toEqual([
      ['/ws', 'project'],
      ['/ws', 'local'],
    ]);
  });

  it('uninstall with nothing installed says so', async () => {
    const { agent, uninstall } = wiring();
    await agent.uninstall();
    expect(uninstall).not.toHaveBeenCalled();
    expect(fake.shown[0]?.text).toBe(EN.t('notice.brand', EN.t('install.notInstalled')));
  });

  it('an uninstall that fails says it did not uninstall', async () => {
    const { agent } = wiring({ states: [ACTIVE], overrides: { uninstall: () => Promise.resolve({ ok: false, error: 'busy' }) } });
    await agent.uninstall('user');
    expect(fake.shown.at(-1)?.text).toBe(EN.t('notice.brand', EN.t('install.didNotUninstall', 'busy')));
  });
});
