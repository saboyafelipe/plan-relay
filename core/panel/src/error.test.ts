import ptBR from '@plan-relay/i18n/pt-BR.json';
import { ERROR_CODES } from '@plan-relay/reader';
import { stringsFor } from '@plan-relay/i18n';
import { errorText } from './error';

const PT = stringsFor('pt-BR');

// The reader error by code: in pt-BR, the text from before the switch.
describe('errorText', () => {
  it('builds the pt-BR text with the arguments and the cause as the last argument', () => {
    expect(errorText({ code: 'folderMissing', args: ['/ws/agent_plans/x'] }, PT)).toBe('a pasta do plano não existe: /ws/agent_plans/x');
    expect(errorText({ code: 'invalid', args: ['plan.json'], cause: { code: 'wrongContract', args: ['2'] } }, PT)).toBe(
      'plan.json inválido: contract 2, esperado 1',
    );
    expect(errorText({ code: 'oldFormat', args: ['plano.json', 'plan.json'] }, PT)).toBe(
      'formato antigo (plano.json): a extensão só lê o contrato 1, com plan.json e chaves em inglês; converta o plano para o formato novo',
    );
  });

  it('a third-party message passes as it is', () => {
    expect(errorText({ code: 'exception', args: ['EACCES: permission denied'] }, PT)).toBe('EACCES: permission denied');
  });

  it('every reader code has the reader.<code> key in core/i18n', () => {
    expect(ERROR_CODES.filter((c) => !(`reader.${c}` in ptBR))).toEqual([]);
  });
});
