// The modal options by identifier. The flow asks and compares by identifier; the button label
// comes from `core/i18n` (`option.<id>`) and is only used for display, so translating a label does not change the
// choice. No value `import` from `vscode`, so the test runs outside the editor.
import { stringsFor, type Strings } from '@plan-relay/i18n';

/** The options any modal of the extension offers; stable identifiers, in ASCII English. */
export type ModalOption = 'open-existing' | 'delete-and-map' | 'delete' | 'run' | 'install' | 'map-anyway' | 'install-from-folder';

/** The button label of each option, in the language of the `strings`. */
export function optionLabels(strings: Strings = stringsFor()): Readonly<Record<ModalOption, string>> {
  const { t } = strings;
  return {
    'open-existing': t('option.open-existing'),
    'delete-and-map': t('option.delete-and-map'),
    delete: t('option.delete'),
    run: t('option.run'),
    install: t('option.install'),
    'map-anyway': t('option.map-anyway'),
    'install-from-folder': t('option.install-from-folder'),
  };
}

/** An answer given in advance (`CannedAnswers.answer`), accepted only if it is one of the offered options. */
export function givenOption(answer: string, options: readonly ModalOption[]): ModalOption | undefined {
  return options.find((o) => o === answer);
}

/**
 * Shows the modal with the labels of the `options` and returns the identifier of the chosen button; `undefined` when
 * the modal is closed ("Cancel"). `show` is `showWarningMessage` already with the text and the detail.
 */
export async function askForOption(
  show: (labels: string[]) => PromiseLike<string | undefined>,
  options: readonly ModalOption[],
  labels: Readonly<Record<ModalOption, string>> = optionLabels(),
): Promise<ModalOption | undefined> {
  const chosen = await show(options.map((o) => labels[o]));
  return chosen === undefined ? undefined : options.find((o) => labels[o] === chosen);
}
