// Reading the ideas: each `agent_plans/_ideas/<slug>.md` in the workspace folders (contract,
// «Idea header»). Only the header is read, with the same shape as the task one: `Key: value` up to the
// first `# ` line, the last occurrence of each key counts, an unknown key is ignored.
// The reader trusts `Open questions:` and counts nothing in the body (the marker of the questions
// section belongs to whoever writes). A header without a valid `Status:` gives `invalid` with the text read.
import type { Files } from './files';
import { errorMessage } from './util';

export const IDEA_STATES = ['open', 'refining', 'ready', 'mapped'] as const;
export type IdeaState = (typeof IDEA_STATES)[number] | 'invalid';

/** What is read from an idea file, without the location. */
export interface Idea {
  slug: string;
  /** The `# ` line; without it, the slug. */
  title: string;
  status: IdeaState;
  /** `YYYY-MM-DDTHH:MMZ`; `null` when missing or malformed. */
  created: string | null;
  /** `null` when missing or not an integer ≥ 0 (unknown). */
  openQuestions: number | null;
  /** Only on `mapped`: the path of the plan, as written. */
  plan: string | null;
  /** The text read (or the message of the read error); only when `invalid`. */
  text?: string;
}

export interface DiscoveredIdea extends Idea {
  /** The workspace folder where the idea lives. */
  folder: string;
  /** The path of the idea file. */
  file: string;
}

const KEY = /^(Status|Created|Open questions|Plan):[ \t]*/;
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/;

/** The header of an idea from the text of the file. */
export function readIdea(text: string, slug: string): Idea {
  const keys = new Map<string, string>();
  let title = slug;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith('# ')) {
      title = line.slice(2);
      break;
    }
    const m = KEY.exec(line);
    const key = m?.[1]?.split(' ')[0];
    if (m && key !== undefined) keys.set(key, line.slice(m[0].length));
  }
  const raw = keys.get('Status');
  const valid = (IDEA_STATES as readonly string[]).includes(raw ?? '');
  const status = valid ? (raw as IdeaState) : 'invalid';
  const created = keys.get('Created');
  const questions = keys.get('Open');
  const plan = keys.get('Plan');
  const idea: Idea = {
    slug,
    title: title,
    status,
    created: created !== undefined && DATE.test(created) ? created : null,
    openQuestions: questions !== undefined && /^\d+$/.test(questions) ? Number(questions) : null,
    plan: status === 'mapped' && plan ? plan : null,
  };
  if (status === 'invalid') idea.text = text;
  return idea;
}

async function ideasOfFolder(files: Files, folder: string): Promise<DiscoveredIdea[]> {
  const root = files.join(folder, 'agent_plans', '_ideas');
  let entries;
  try {
    entries = (await files.list(root)) ?? [];
  } catch (e) {
    // An unreadable `_ideas/` is shown, not hidden: one invalid entry, for the folder, with the error.
    return [{ folder: folder, file: root, ...readIdea('', '_ideas'), text: errorMessage(e) }];
  }
  const slugs = entries
    .filter((e) => !e.directory && e.name.endsWith('.md') && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .map((e) => e.name.slice(0, -3))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return Promise.all(
    slugs.map(async (slug): Promise<DiscoveredIdea> => {
      const file = files.join(root, `${slug}.md`);
      try {
        const text = await files.read(file);
        if (text !== undefined) return { folder: folder, file: file, ...readIdea(text, slug) };
        return { folder: folder, file: file, ...readIdea('', slug), text: '' };
      } catch (e) {
        return { folder: folder, file: file, ...readIdea('', slug), text: errorMessage(e) };
      }
    }),
  );
}

/** The ideas of each workspace folder, in the order of the folders and, within each, of the slug. */
export async function discoverIdeas(files: Files, folders: string[]): Promise<DiscoveredIdea[]> {
  const perFolder = await Promise.all(folders.map((p) => ideasOfFolder(files, p)));
  return perFolder.flat();
}
