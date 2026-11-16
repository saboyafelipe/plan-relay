import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as {
  contributes: { menus: Record<string, { command: string; when?: string }[]> };
};

describe('"Create tasks from this plan" menu in the explorer', () => {
  const item = pkg.contributes.menus['explorer/context']?.find((m) => m.command === 'planRelay.map');
  const when = item?.when ?? '';

  it('only on .md, in a trusted workspace and outside agent_plans/', () => {
    expect(when).toBe('resourceExtname == .md && isWorkspaceTrusted && !(resourcePath =~ /[\\\\/]agent_plans[\\\\/]/)');
  });

  it('the when regex separates the agent_plans/ files from the others, with / and with \\', () => {
    const body = /=~ \/(.*)\/\)$/.exec(when)?.[1];
    expect(body).toBeDefined();
    const inside = new RegExp(body ?? '');
    for (const p of [
      '/home/dev/projeto/agent_plans/site/PLAN.md',
      '/home/dev/projeto/agent_plans/_ideas/idea.md',
      'C:\\dev\\projeto\\agent_plans\\site\\phase-1\\F1-01.md',
    ]) {
      expect(inside.test(p), p).toBe(true);
    }
    for (const p of ['/home/dev/projeto/docs/idea.md', '/home/dev/projeto/my_agent_plans.md', '/home/dev/agent_plans_velho/x.md']) {
      expect(inside.test(p), p).toBe(false);
    }
  });
});

describe('global actions in the view title bar', () => {
  const p = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as {
    contributes: {
      commands: { command: string; icon?: string }[];
      menus: Record<string, { command: string; when?: string; group?: string }[]>;
    };
  };
  const bar = p.contributes.menus['view/title'] ?? [];
  const item = (command: string) => bar.find((m) => m.command === command);

  it('"Collapse all", "Search" and "Refresh" visible, in that order; "Collapse all" only with the Plans tab', () => {
    expect(item('planRelay.collapseAll')).toEqual({
      command: 'planRelay.collapseAll',
      when: 'view == planRelay.panel && planRelay.tab == plans',
      group: 'navigation@1',
    });
    expect(item('planRelay.filter')).toEqual({ command: 'planRelay.filter', when: 'view == planRelay.panel', group: 'navigation@2' });
    expect(item('planRelay.refresh')).toEqual({ command: 'planRelay.refresh', when: 'view == planRelay.panel', group: 'navigation@3' });
  });

  it('"Refresh" has an icon, like the other visible actions', () => {
    const icons = new Map(p.contributes.commands.map((c) => [c.command, c.icon]));
    expect(icons.get('planRelay.refresh')).toBe('$(refresh)');
    expect(icons.get('planRelay.filter')).toBe('$(search)');
    expect(icons.get('planRelay.collapseAll')).toBe('$(collapse-all)');
  });

  it('the bar "⋯" holds the plugin status, install, uninstall and the 5-hour window gate, outside the navigation group', () => {
    for (const command of ['planRelay.pluginStatus', 'planRelay.installPlugin', 'planRelay.uninstallPlugin', 'planRelay.windowGate']) {
      const m = item(command);
      expect(m?.when, command).toBe('view == planRelay.panel');
      expect(m?.group ?? '', command).toMatch(/^planRelay@\d$/);
    }
    expect(bar.map((m) => m.command).sort()).toEqual(
      [
        'planRelay.collapseAll',
        'planRelay.filter',
        'planRelay.installPlugin',
        'planRelay.pluginStatus',
        'planRelay.refresh',
        'planRelay.uninstallPlugin',
        'planRelay.windowGate',
      ].sort(),
    );
  });
});
