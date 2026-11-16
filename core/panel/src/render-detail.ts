// The task detail popup: the header fields, the dependencies both ways and the footer actions.
import type { Key, Strings } from '@plan-relay/i18n';
import { shortDuration } from './duration';
import { icon, statusIcon, type IconName } from './icons';
import type { PlanView, TaskView } from './view';
import { GIVE_UP_GROUPS, detailDialog, openButton } from './render-shared';
import { button, escapeHtml } from './util';

/** `YYYY-MM-DDTHH:MMZ` as «YYYY-MM-DD HH:MM UTC»; empty or out of format, «—». */
function readableDate(text: string | null): string {
  const m = text === null ? null : /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})Z$/.exec(text);
  return m ? `${m[1]} ${m[2]} UTC` : '—';
}

/**
 * The clickable dependencies of a task, the `missing` ones marked; an ID that is not in the plan is plain text. A
 * missing one is a colour and a tooltip for the eye, and hidden text in the name for a screen reader.
 */
function dependencyList(p: PlanView, ids: readonly string[], missing: readonly string[], x: Strings): string {
  if (!ids.length) return `<div class="deps"><span class="none">${escapeHtml(x.t('detail.none'))}</span></div>`;
  const byId = new Map(p.tasks.map((k) => [k.id, k]));
  const said = escapeHtml(x.t('detail.missing'));
  const dependency = (dep: string): string => {
    const d = byId.get(dep);
    if (!d) return `<span class="dep nonexistent" title="${escapeHtml(x.t('detail.notInPlan'))}">${escapeHtml(dep)}</span>`;
    const isMissing = missing.includes(dep);
    const data = `data-action="detail" data-plan="${escapeHtml(p.id)}" data-id="${escapeHtml(dep)}"`;
    const attributes = `class="dep${isMissing ? ' missing' : ''}" ${data}${isMissing ? ` title="${said}"` : ''}`;
    const hidden = isMissing ? `<span class="vh"> (${said})</span>` : '';
    return button(attributes, `${statusIcon(d.group)}<span class="id">${escapeHtml(dep)}</span>${hidden}`);
  };
  return `<div class="deps">${ids.map(dependency).join('')}</div>`;
}

/** The body of the popup: next step, replacement or give-up root, the fields and the dependencies both ways. */
function detailBody(p: PlanView, t: TaskView, x: Strings): string {
  const label = (text: string): string => `<div class="lbl">${escapeHtml(text)}</div>`;
  const field = (key: Key, value: string): string => `<dt>${escapeHtml(x.t(key))}</dt><dd>${value ? escapeHtml(value) : '—'}</dd>`;
  const step = t.nextStep && t.nextStep !== '—' ? `${label(x.t('detail.nextStep'))}<div class="box">${escapeHtml(t.nextStep)}</div>` : '';
  // The replacement of the cancelled one and the root of the abandoned one, clickable like the dependencies; the root says the owner gave up.
  let output = '';
  if (t.group === 'cancelled' && t.replacement) output = `${label(x.t('detail.replacedBy'))}${dependencyList(p, [t.replacement], [], x)}`;
  else if (t.group === 'abandoned' && t.giveUpRoot)
    output = `${label(x.t('detail.abandonedWith'))}${dependencyList(p, [t.giveUpRoot], [], x)}`;
  else if (t.group === 'abandoned' && t.ownerGiveUp) output = `<div class="box">${escapeHtml(x.t('panel.ownerGiveUp'))}</div>`;
  const fields = [
    field('detail.phase', p.phases.find((f) => f.dir === t.phase)?.title ?? t.phase),
    field('detail.type', t.type),
    field('detail.track', t.track),
    field('detail.tier', t.tier),
    field('detail.repos', t.repos.join(', ')),
    field('detail.started', readableDate(t.started)),
    field('detail.finished', readableDate(t.finished)),
    field('detail.duration', t.duration === null ? '' : shortDuration(t.duration, x)),
    `<dt>${escapeHtml(x.t('detail.file'))}</dt><dd class="file">${escapeHtml(t.file)}</dd>`,
  ];
  const missing = t.waitingOn.length ? x.t('detail.countMissing', t.waitingOn.length) : '';
  const dependsOn = `${label(`${x.t('detail.dependsOn', t.blockedBy.length)}${missing}`)}${dependencyList(p, t.blockedBy, t.waitingOn, x)}`;
  const unblocks = `${label(x.t('detail.unblocks', t.unblocks.length))}${dependencyList(p, t.unblocks, [], x)}`;
  return `<div class="db">${step}${output}<dl class="grid">${fields.join('')}</dl>${dependsOn}${unblocks}</div>`;
}

/** The footer actions: run or resume, open the file, copy the command, give up and reopen, as the task allows. */
function detailButtons(p: PlanView, t: TaskView, x: Strings): string[] {
  const footerButton = (action: string, ic: IconName, key: Key, main = false): string =>
    button(
      `class="btn${main ? ' pri' : ''}" data-action="${action}" data-plan="${escapeHtml(p.id)}" data-id="${escapeHtml(t.id)}"`,
      `${icon(ic)}${escapeHtml(x.t(key))}`,
    );
  const executable = t.group === 'in-progress' || t.group === 'available' || t.group === 'owner';
  const buttons: string[] = [];
  if (executable) buttons.push(footerButton('execute', 'play', t.group === 'in-progress' ? 'panel.resume' : 'panel.run', true));
  buttons.push(openButton(p.id, t.file, `${icon('file')}${escapeHtml(x.t('panel.openFile'))}`, 'btn'));
  // The copied command is the Execute/Resume one; the host refuses the one for a task without that button (`actionTarget`), so it only appears alongside it.
  if (executable) buttons.push(footerButton('copy', 'copy', 'detail.copyCommand'));
  // Give up and reopen as on the row, where they only show on hover: here the keyboard reaches them. The host confirms both.
  if (GIVE_UP_GROUPS.has(t.group)) buttons.push(footerButton('giveUp', 'giveUp', 'panel.giveUp'));
  if (t.group === 'abandoned' && t.ownerGiveUp) buttons.push(footerButton('reopen', 'reopen', 'panel.reopen'));
  return buttons;
}

/**
 * The popup of a task: a `<dialog>` labeled by the title (the page opens it with `showModal`, which traps focus),
 * with status, fields, next step, clickable «Depends on» and «Unblocks» and the footer actions. A task that does not exist in the plan gives nothing.
 */
export function taskDetail(p: PlanView, id: string, x: Strings): string {
  const t = p.tasks.find((k) => k.id === id);
  if (!t) return '';
  const head = {
    icon: statusIcon(t.group),
    id: t.id,
    color: `status-${t.group}` as const,
    status: x.t(`detail.status-${t.group}`),
    title: t.title,
  };
  return detailDialog(head, detailBody(p, t, x), detailButtons(p, t, x), x);
}
