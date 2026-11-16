// The composition of the extension: `activate` builds the strings, the output channel, the alerter and the sound,
// hands them to the panel view and the watchers, and registers the commands. No module of the host creates state on
// import; everything lives from `activate` on.
import * as vscode from 'vscode';
import { tmpdir } from 'node:os';
import { stringsFor, type Strings } from '@plan-relay/i18n';
import type { PluginScope } from '@plan-relay/panel';
import { VIEW } from './agent';
import { claudeCodeProvider } from './agents/claude-code';
import { chooseWindowGate, type GateDeps } from './agents/claude-code/window-gate';
import { activeProvider, type Provider } from './agents/provider';
import { answersOf } from './canned-answers';
import type { ExtensionIdentity } from './extension-version';
import { REVEALED_KEY, shouldReveal } from './first-run';
import { createAlerter, type Alerter } from './notify/alert';
import { playSound } from './notify/sound';
import { PanelView, type HostChannel } from './panel-view';
import { discoverPlans } from './plans/status';
import { runProcess } from './process';
import { Schedule } from './refresh/schedule';
import { Watchers } from './watchers';
import { WebviewProbe, type TestApi } from './webview-probe';
import { errorMessage } from './util';

function isScope(x: unknown): x is PluginScope {
  return x === 'project' || x === 'user' || x === 'local';
}

/**
 * The host's alerts: the temporary one is a progress notification whose promise resolves after the seconds; the one
 * that needs you stays until dismissed (see `createAlerter`).
 */
function hostAlerter(channel: HostChannel, strings: Strings): Alerter {
  return createAlerter(
    vscode.window,
    (title, seconds) => {
      void vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: title },
        () => new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000)),
      );
    },
    (error) => channel.error(strings.t('log.alertFailed', errorMessage(error))),
  );
}

/**
 * The alert sound: the system player, without a shell, in a neutral directory (nothing from the workspace runs). It
 * neither waits nor throws: a failure becomes a line in the output channel.
 */
function soundPlayer(channel: HostChannel, strings: Strings): () => void {
  return () => {
    const runCommand = (command: string, args: string[]) =>
      runProcess(command, args, { cwd: tmpdir(), timeoutMs: 10_000, name: command, strings });
    void playSound(process.platform, runCommand, (line) => channel.warn(line), strings);
  };
}

function configuredInterval(): number {
  return vscode.workspace.getConfiguration('planRelay').get<number>('refreshIntervalMinutes', 5);
}

function workspaceFolders(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).map((p) => p.uri.fsPath);
}

/** The "5-hour window gate…" action with the real window: a quick pick, and the notices with the brand. */
function windowGateDeps(channel: HostChannel, agentName: string, strings: Strings): GateDeps {
  return {
    folders: workspaceFolders,
    pick: async (placeholder, options) => (await vscode.window.showQuickPick(options, { placeHolder: placeholder }))?.id,
    inform: (text) => void vscode.window.showInformationMessage(strings.t('notice.brand', text)),
    warn: (text) => void vscode.window.showWarningMessage(strings.t('notice.brand', text)),
    channel,
    agentName,
    strings,
  };
}

async function revealOnFirstRun(context: vscode.ExtensionContext, panel: PanelView, channel: HostChannel, strings: Strings): Promise<void> {
  // Reads only `agent_plans/` of each folder; a findFiles walked the whole tree, which takes seconds in a large repository.
  const plans = await discoverPlans(workspaceFolders());
  const alreadyRevealed = context.workspaceState.get<boolean>(REVEALED_KEY);
  if (!shouldReveal(alreadyRevealed, plans.length > 0)) {
    return;
  }
  await panel.reveal();
  await context.workspaceState.update(REVEALED_KEY, true);
  channel.info(strings.t('log.revealedFirstTime'));
}

/** What `activate` builds once and the command groups below share. */
interface Host {
  strings: Strings;
  channel: HostChannel;
  provider: Provider;
  schedule: Schedule;
  panel: PanelView;
}

/**
 * The schedule and the panel view, which need each other: the schedule loads through the panel, and the panel asks
 * the schedule to refresh. The view starts hidden until VS Code resolves it; earlier requests wait for it.
 */
function panelAndSchedule(
  context: vscode.ExtensionContext,
  provider: Provider,
  channel: HostChannel,
  strings: Strings,
  probe: WebviewProbe | undefined,
): { schedule: Schedule; panel: PanelView } {
  const schedule = new Schedule({
    // The explicit return type breaks the loop panel -> schedule -> panel that left both typed `any`.
    load: (reason): Promise<void> => panel.refresh(reason),
    intervalMinutes: configuredInterval(),
    visible: false,
  });
  const panel = new PanelView(context.extensionUri, schedule, provider, context.extension.packageJSON as ExtensionIdentity, {
    strings,
    channel,
    alerter: hostAlerter(channel, strings),
    playSound: soundPlayer(channel, strings),
    ...(probe ? { probe } : {}),
  });
  return { schedule, panel };
}

/** The watchers of the plans and of the agent's settings, and the reactions to workspace and setting changes. */
function watching({ provider, schedule, panel, channel, strings }: Host): vscode.Disposable[] {
  const pluginChanged = () => {
    panel.markPlugin();
    schedule.request('file');
  };
  const watchers = new Watchers(provider.watchedSettings, () => schedule.request('file'), pluginChanged, channel, strings);
  return [
    watchers,
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      watchers.redo();
      // The first folder may have changed, and the plugin is read for it.
      pluginChanged();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('planRelay.refreshIntervalMinutes')) return;
      const minutes = configuredInterval();
      schedule.setInterval(minutes);
      channel.info(strings.t('log.interval', minutes));
    }),
  ];
}

/** Returns the integration tests' probe in Test mode, and nothing otherwise. */
export function activate(context: vscode.ExtensionContext): TestApi | undefined {
  // The strings of the panel, the alerts and the output channel in the VS Code language (the same as `vscode.l10n`);
  // a language missing from core/i18n falls back to English.
  const strings = stringsFor(vscode.env.language);
  const channel = vscode.window.createOutputChannel('Plan Relay', { log: true });
  // For now there is a single provider; another agent's provider (see ARCHITECTURE.md) comes later.
  const provider = activeProvider([claudeCodeProvider(vscode, channel, strings)]);
  if (!provider) throw new Error(strings.t('log.noProvider'));
  channel.info(strings.t(provider.detect() ? 'log.agent' : 'log.agentNotDetected', provider.name));
  // Only the integration tests run the extension in Test mode; installed or under F5, there is no probe.
  const probe = context.extensionMode === vscode.ExtensionMode.Test ? new WebviewProbe() : undefined;
  const host: Host = { strings, channel, provider, ...panelAndSchedule(context, provider, channel, strings, probe) };
  context.subscriptions.push(
    channel,
    host.schedule,
    ...watching(host),
    ...viewCommands(host),
    ...cardCommands(host.panel, context.extensionMode),
  );
  channel.info(strings.t('log.enabled'));
  revealOnFirstRun(context, host.panel, channel, strings).catch((error: unknown) => {
    channel.error(strings.t('log.revealFailed', errorMessage(error)));
  });
  host.schedule.request('activation');
  return probe ? { probe } : undefined;
}

/** The commands of the view and the palette: refresh, filter, the plugin, the window gate, and the view itself. */
function viewCommands({ panel, schedule, channel, strings, provider }: Host): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('planRelay.refresh', () => {
      panel.markPlugin();
      schedule.request('command', { evenHidden: true });
    }),
    vscode.commands.registerCommand('planRelay.collapseAll', () => panel.collapseAll()),
    vscode.commands.registerCommand('planRelay.filter', () => panel.filter()),
    vscode.commands.registerCommand('planRelay.pluginStatus', () => void vscode.window.showInformationMessage(panel.statusText())),
    // Writes `.claude/settings.local.json` only from here, on the user's choice; never on activation.
    vscode.commands.registerCommand('planRelay.windowGate', () => chooseWindowGate(windowGateDeps(channel, provider.name, strings))),
    vscode.window.registerWebviewViewProvider(VIEW, panel),
    // From the palette they come without arguments (the scope is asked); a `project`/`user` argument skips the question.
    vscode.commands.registerCommand('planRelay.installPlugin', (scope?: unknown) =>
      panel.agent.install(scope === 'project' || scope === 'user' ? scope : undefined),
    ),
    vscode.commands.registerCommand('planRelay.uninstallPlugin', (scope?: unknown) =>
      panel.agent.uninstall(isScope(scope) ? scope : undefined),
    ),
    vscode.commands.registerCommand('planRelay.show', async () => {
      await panel.reveal();
      channel.info(strings.t('log.revealedCommand'));
    }),
  ];
}

/** The card commands, which take canned answers, applied only in Development/Test (canned-answers.ts). */
function cardCommands(panel: PanelView, mode: vscode.ExtensionMode): vscode.Disposable[] {
  const answers = (x: unknown) => answersOf(x, mode);
  return [
    // From the explorer it comes as (uri, selection); from the palette, without arguments (uses the active editor).
    vscode.commands.registerCommand('planRelay.map', (target?: unknown, _selection?: unknown, given?: unknown) =>
      panel.actions.mapIdea(target instanceof vscode.Uri ? target : undefined, answers(given)),
    ),
    // No package.json entry: it is the card's "Delete" called by command (id = the plan folder as read).
    vscode.commands.registerCommand('planRelay.deletePlan', (id?: unknown, given?: unknown) =>
      typeof id === 'string' ? panel.actions.remove(id, answers(given)) : undefined,
    ),
    // No package.json entry: they are the card's "Run"/"Resume" and "Run plan" buttons called by command.
    vscode.commands.registerCommand('planRelay.runTask', (id?: unknown, task?: unknown, given?: unknown) =>
      typeof id === 'string' && typeof task === 'string' ? panel.actions.execute(id, task, answers(given)) : undefined,
    ),
    vscode.commands.registerCommand('planRelay.runPlan', (id?: unknown, given?: unknown) =>
      typeof id === 'string' ? panel.actions.run(id, answers(given)) : undefined,
    ),
    // No package.json entry: the hover's "Give up" and "Reopen" called by command.
    vscode.commands.registerCommand('planRelay.giveUpTask', (id?: unknown, task?: unknown, given?: unknown) =>
      typeof id === 'string' && typeof task === 'string' ? panel.actions.giveUp(id, task, answers(given)) : undefined,
    ),
    vscode.commands.registerCommand('planRelay.reopenTask', (id?: unknown, task?: unknown, given?: unknown) =>
      typeof id === 'string' && typeof task === 'string' ? panel.actions.reopen(id, task, answers(given)) : undefined,
    ),
  ];
}

export function deactivate(): void {}
