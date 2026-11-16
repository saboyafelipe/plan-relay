import { describe, expect, it } from 'vitest';
import { givenOption, askForOption, optionLabels, type ModalOption } from './modal';

const OPTION_LABEL = optionLabels();

/** A simulated modal that clicks the button at the given position and keeps the labels it received. */
function click(position: number | undefined) {
  const seen: string[][] = [];
  const show = async (labels: string[]) => {
    seen.push(labels);
    return position === undefined ? undefined : labels[position];
  };
  return { show, seen };
}

describe('askForOption', () => {
  it('shows the labels from the map and returns the identifier of the chosen button', async () => {
    const m = click(1);
    expect(await askForOption(m.show, ['open-existing', 'delete-and-map'])).toBe('delete-and-map');
    expect(m.seen).toEqual([[OPTION_LABEL['open-existing'], OPTION_LABEL['delete-and-map']]]);
  });

  it('changing an option label does not change the returned choice', async () => {
    const translated: Record<ModalOption, string> = {
      ...OPTION_LABEL,
      'open-existing': 'Open existing',
      'delete-and-map': 'Delete and map again',
    };
    const original = click(1);
    const other = click(1);
    const before = await askForOption(original.show, ['open-existing', 'delete-and-map']);
    const after = await askForOption(other.show, ['open-existing', 'delete-and-map'], translated);
    expect(other.seen).toEqual([['Open existing', 'Delete and map again']]);
    expect(after).toBe(before);
    expect(after).toBe('delete-and-map');
  });

  it('closing the modal gives undefined', async () => {
    expect(await askForOption(click(undefined).show, ['delete'])).toBeUndefined();
  });

  it('every identifier is ASCII, with no space or capital letter, and every label exists', () => {
    for (const [id, label] of Object.entries(OPTION_LABEL)) {
      expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe('givenOption', () => {
  it('accepts the identifier of an offered option', () => {
    expect(givenOption('delete', ['delete'])).toBe('delete');
  });

  it('refuses the label and the identifier of an option that is not offered', () => {
    expect(givenOption('Apagar', ['delete'])).toBeUndefined();
    expect(givenOption('run', ['delete'])).toBeUndefined();
  });
});
