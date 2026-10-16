import { modelOutcomes, refereePrompt, type Outcome } from './rules';

// Prose only. Context JSON, response validation and roll values belong to code.
export const promptFields = [
  { key: 'refereeSystem', label: 'Árbitro auxiliar — papel, diretrizes e formato JSON', limit: 24000 },
  { key: 'mainOpening', label: 'Principal — antes do nome da persona', limit: 4000 },
  { key: 'mainBeforeApproach', label: 'Principal — entre persona e abordagem', limit: 4000 },
  { key: 'mainBeforeAction', label: 'Principal — antes da ação', limit: 4000 },
  { key: 'mainBeforeResult', label: 'Principal — antes da categoria do resultado', limit: 4000 },
  { key: 'mainBeforeMeaning', label: 'Principal — antes do efeito do resultado', limit: 4000 },
  { key: 'mainAfterMeaning', label: 'Principal — depois do efeito', limit: 4000 },
  { key: 'mainCheat', label: 'Principal — instrução adicional quando há CHEAT', limit: 4000 },
  { key: 'mainClosing', label: 'Principal — encerramento e diretrizes OOC', limit: 4000 },
  { key: 'effectFailure', label: 'Efeito de Falha — texto para o principal', limit: 4000 },
  { key: 'effectPartialSuccess', label: 'Efeito de Sucesso Parcial — texto para o principal', limit: 4000 },
  { key: 'effectSuccess', label: 'Efeito de Sucesso — texto para o principal', limit: 4000 },
  { key: 'effectCriticalSuccess', label: 'Efeito de Sucesso Crítico — texto para o principal', limit: 4000 },
] as const;
export type PromptKey = typeof promptFields[number]['key'];
export type PromptTexts = Record<PromptKey, string>;
export const defaultPromptTexts = (): PromptTexts => ({
  refereeSystem: refereePrompt,
  mainOpening: 'An automatic skill check was completed for character ',
  mainBeforeApproach: ' (',
  mainBeforeAction: '). Action: ',
  mainBeforeResult: '. Result: ',
  mainBeforeMeaning: ' — ',
  mainAfterMeaning: '.',
  mainCheat: ' Authorized CHEAT: this OOC-guaranteed outcome overrides the numerical comparison.',
  mainClosing: ' Respect all OOC instructions; do not reroll or reclassify this check.',
  effectFailure: modelOutcomes.Falha.meaning,
  effectPartialSuccess: modelOutcomes['Sucesso Parcial'].meaning,
  effectSuccess: modelOutcomes.Sucesso.meaning,
  effectCriticalSuccess: modelOutcomes['Sucesso Crítico'].meaning,
});

/** Missing fields in legacy state inherit defaults; invalid saved values fail explicitly. */
export function promptTexts(value?: unknown): PromptTexts {
  const defaults = defaultPromptTexts();
  if (value === undefined) return defaults;
  return validatePromptTexts({ ...defaults, ...record(value) });
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Textos de prompt inválidos.');
  return value as Record<string, unknown>;
}
export function validatePromptTexts(value: unknown): PromptTexts {
  const input = record(value); const result = {} as PromptTexts;
  if (Object.keys(input).some(key => !promptFields.some(field => field.key === key))) throw Error('Campo de prompt desconhecido; valores dinâmicos não podem ser editados.');
  for (const field of promptFields) {
    const text = input[field.key];
    if (typeof text !== 'string' || text.length > field.limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw Error(`${field.label}: use texto com até ${field.limit} caracteres, sem controles inválidos.`);
    // Keep authored spacing, newlines, punctuation and empty strings exactly as entered.
    result[field.key] = text;
  }
  return result;
}
const effectKeys: Record<Outcome, PromptKey> = { Falha: 'effectFailure', 'Sucesso Parcial': 'effectPartialSuccess', Sucesso: 'effectSuccess', 'Sucesso Crítico': 'effectCriticalSuccess' };
export function outcomeEffect(text: PromptTexts, outcome: Outcome): string {
  const key = effectKeys[outcome];
  if (!key) throw Error('Categoria de resultado inválida.');
  return text[key];
}
export interface MainValues { persona: string; approach: string; action: string; outcome: Outcome; cheat: boolean }
export function mainNote(text: PromptTexts, value: MainValues): string {
  // No template interpolation/evaluation: all dynamic slots are always inserted by code.
  const meaning = outcomeEffect(text, value.outcome);
  return `((${text.mainOpening}${value.persona}${text.mainBeforeApproach}${value.approach}${text.mainBeforeAction}${value.action}${text.mainBeforeResult}${modelOutcomes[value.outcome].label}${text.mainBeforeMeaning}${meaning}${text.mainAfterMeaning}${value.cheat ? text.mainCheat : ''}${text.mainClosing}))`;
}
export const previewValues: MainValues = { persona: 'Alice', approach: 'Clever', action: 'open the safe', outcome: 'Sucesso Crítico', cheat: true };
