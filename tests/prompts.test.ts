import { expect, test } from 'bun:test';
import { DiceEngine } from '../src/engine';
import { defaultPromptTexts, mainNote, previewValues, promptFields, promptTexts, validatePromptTexts } from '../src/prompts';
import { modelOutcomes, outcomes } from '../src/rules';
import { context, decision, enable, fixture } from './fixture';

test('estado legado herda padrões sem alterar fichas, perfil ou arquivo ao carregar', async () => {
  const f = fixture(); await enable(f);
  const old = JSON.parse(f.files.get('userAAAA/state.json')!); delete old.prompts;
  const raw = JSON.stringify(old); f.files.set('userAAAA/state.json', raw);
  expect((await f.engine.load('userAAAA')).prompts).toEqual(defaultPromptTexts());
  expect(f.files.get('userAAAA/state.json')).toBe(raw);
  expect(promptTexts({ mainOpening: 'Custom ' }).mainOpening).toBe('Custom ');
  expect(promptTexts({ mainOpening: 'Custom ' }).refereeSystem).toBe(defaultPromptTexts().refereeSystem);
});

test('treze textos personalizados da 1.0.4 são preservados com contrato novo editável', async () => {
  const f = fixture(); await enable(f);
  const old = JSON.parse(f.files.get('userAAAA/state.json')!);
  const legacy = Object.fromEntries(promptFields.filter(f => f.key !== 'refereeContract').map((field, i) => [field.key, ` custom-${i}\n `]));
  old.prompts = legacy; const raw = JSON.stringify(old); f.files.set('userAAAA/state.json', raw);
  const migrated = await f.engine.load('userAAAA');
  expect(migrated.prompts).toEqual({ ...defaultPromptTexts(), ...legacy });
  expect(f.files.get('userAAAA/state.json')).toBe(raw);
  await f.engine.configure('userAAAA', { prompts: migrated.prompts });
  expect((await new DiceEngine(f.api).load('userAAAA')).prompts).toEqual(migrated.prompts);
});

test('textos por usuário persistem exatamente; restaurar preserva perfil, ficha e cheat', async () => {
  const f = fixture(); await enable(f); await f.engine.setCheat('userAAAA', 'chatA', 'Falha');
  const custom = { ...defaultPromptTexts(), refereeSystem: '  Custom\n<instruction>${neverEvaluate()}\n', mainClosing: '', effectFailure: ' Failure custom ', effectPartialSuccess: 'Partial\ncustom', effectSuccess: '<b>Success</b>', effectCriticalSuccess: '' };
  await f.engine.configure('userAAAA', { prompts: custom });
  const reload = new DiceEngine(f.api); expect((await reload.load('userAAAA')).prompts).toEqual(custom);
  expect((await reload.load('userBBBB')).prompts).toEqual(defaultPromptTexts());
  const before = await reload.load('userAAAA');
  await reload.configure('userAAAA', { resetPrompts: true });
  expect(await reload.load('userAAAA')).toEqual({ ...before, prompts: defaultPromptTexts() });
  expect((await reload.ledger('userAAAA', 'chatA')).activeCheat).toBe('Falha');
});

test('validação limita cada campo e rejeita entradas/slots desconhecidos sem salvar estado inválido', async () => {
  const f = fixture(); await enable(f); const before = f.files.get('userAAAA/state.json');
  for (const field of promptFields) {
    expect(validatePromptTexts({ ...defaultPromptTexts(), [field.key]: 'a'.repeat(field.limit) })[field.key].length).toBe(field.limit);
    await expect(f.engine.configure('userAAAA', { prompts: { ...defaultPromptTexts(), [field.key]: 'a'.repeat(field.limit + 1) } })).rejects.toThrow('caracteres');
    await expect(f.engine.configure('userAAAA', { prompts: { ...defaultPromptTexts(), [field.key]: 1 } })).rejects.toThrow();
  }
  for (const invalid of [null, [], {}, { ...defaultPromptTexts(), outcome: 'Success' }, { ...defaultPromptTexts(), refereeSystem: 'bad\u0000text' }]) {
    await expect(f.engine.configure('userAAAA', { prompts: invalid })).rejects.toThrow();
  }
  await expect(f.engine.configure('userAAAA', { resetPrompts: 'yes' })).rejects.toThrow();
  await expect(f.engine.configure('userAAAA', { resetPrompts: true, prompts: defaultPromptTexts() })).rejects.toThrow();
  expect(f.files.get('userAAAA/state.json')).toBe(before);
});

test('auxiliar usa system editado exato sem prosa oculta; contexto e contrato permanecem no código', async () => {
  const f = fixture(); await enable(f);
  const custom = { ...defaultPromptTexts(), refereeSystem: 'Custom referee schema and directions.\nJSON only.', effectFailure: 'PRIVATE EFFECT FAILURE', effectPartialSuccess: 'PRIVATE EFFECT PARTIAL', effectSuccess: 'PRIVATE EFFECT SUCCESS', effectCriticalSuccess: 'PRIVATE EFFECT CRITICAL' };
  await f.engine.configure('userAAAA', { prompts: custom });
  await f.engine.intercept(f.prompt(), context());
  expect(f.calls[0].messages[0]).toEqual({ role: 'system', content: `${custom.refereeSystem}\n\n${custom.refereeContract}` });
  expect(f.calls[0].messages).toHaveLength(2);
  expect(JSON.stringify(f.calls[0])).not.toContain('PRIVATE EFFECT');
  expect(JSON.parse(f.calls[0].messages[1].content).latestAction.text).toBe('Tento abrir o cofre.');
  f.histories.chatA[0].content = 'Outra ação.';
  f.setAnswer({ content: '{"roll":true,"approach":"Astuto","difficulty":99,"bonus":0,"action":"a","reason":"r"}' });
  await expect(f.engine.intercept(f.prompt(), context())).rejects.toThrow('inválidos');
  expect((await f.engine.ledger('userAAAA', 'chatA')).records).toHaveLength(1);
});

test('todos os trechos main editados chegam ao prompt; cache usa texto atual e preserva resultado antigo', async () => {
  const f = fixture(); await enable(f); await f.engine.setCheat('userAAAA', 'chatA', 'Sucesso Crítico');
  await f.engine.intercept(f.prompt(), context());
  const before = await f.engine.ledger('userAAAA', 'chatA');
  const custom = Object.fromEntries(promptFields.map((field, i) => [field.key, `fixed-${i}|`])) as ReturnType<typeof defaultPromptTexts>;
  await f.engine.configure('userAAAA', { prompts: custom });
  const result = await new DiceEngine(f.api).intercept(f.prompt(), context('userAAAA', 'chatA', 'regenerate'));
  expect(result.messages.at(-1)!.content).toBe('((fixed-2|Alicefixed-3|INTELLIGENCE +0fixed-4|abrir o cofrefixed-5|Critical Successfixed-6|fixed-13|fixed-7|fixed-8|fixed-9|))');
  expect(result.messages.at(-1)!.role).toBe('user');
  expect(result.messages.slice(0, -1)).toEqual(f.prompt());
  expect(f.calls).toHaveLength(1); expect(await f.engine.ledger('userAAAA', 'chatA')).toEqual(before);
  const empty = Object.fromEntries(promptFields.map(field => [field.key, ''])) as ReturnType<typeof defaultPromptTexts>;
  await f.engine.configure('userAAAA', { prompts: empty });
  const stripped = await f.engine.intercept(f.prompt(), context('userAAAA', 'chatA', 'continue'));
  for (const value of ['Alice', 'INTELLIGENCE +0', 'abrir o cofre', 'Critical Success']) expect(stripped.messages.at(-1)!.content).toContain(value);
  expect(stripped.messages.at(-1)!.content).not.toContain('the objective is achieved');
  expect(f.calls).toHaveLength(1);
});

test('quatro efeitos seguem a categoria natural ou CHEAT e o cache usa o texto atual sem rerrolar nem regravar auditoria', async () => {
  const keys = ['effectFailure', 'effectPartialSuccess', 'effectSuccess', 'effectCriticalSuccess'] as const;
  for (const cheat of [false, true]) for (const [i, outcome] of outcomes.entries()) {
    const f = fixture(); await enable(f);
    const custom = { ...defaultPromptTexts(), ...Object.fromEntries(keys.map((key, n) => [key, `EFFECT-${n}`])) };
    await f.engine.configure('userAAAA', { prompts: custom });
    if (cheat) await f.engine.setCheat('userAAAA', 'chatA', outcome);
    f.setAnswer({ content: JSON.stringify({ ...decision, difficulty: cheat ? 10 : [15, 14, 10, 100][i] }) });
    const engine = new DiceEngine(f.api, () => !cheat && i === 3 ? [10,10] : [5,5]);
    const result = await engine.intercept(f.prompt(), context());
    const before = await f.engine.ledger('userAAAA', 'chatA'); const roll = before.records[0].roll!;
    expect(roll.outcome).toBe(outcome); expect(roll.total).toBe(!cheat && i === 3 ? 20 : 10); expect(roll.dice).toEqual(!cheat && i === 3 ? [10,10] : [5,5]);
    expect(Boolean(before.records[0].fudge)).toBe(cheat);
    const note = result.messages.at(-1)!.content as string;
    expect(note).toContain(`${modelOutcomes[outcome].label} — EFFECT-${i}`);
    for (const n of [0, 1, 2, 3].filter(n => n !== i)) expect(note).not.toContain(`EFFECT-${n}`);
    expect(JSON.stringify(f.calls)).not.toContain('EFFECT-');
    const ledgerPath = [...f.files.keys()].find(key => key.startsWith('userAAAA/chats/'))!;
    const saved = f.files.get(ledgerPath);
    await f.engine.configure('userAAAA', { prompts: { ...custom, [keys[i]]: `CURRENT-${i}` } });
    const replay = new DiceEngine(f.api, () => { throw Error('Cache must not reroll'); });
    const cached = await replay.intercept(f.prompt(), context('userAAAA', 'chatA', 'regenerate'));
    expect(cached.messages.at(-1)!.content).toContain(`${modelOutcomes[outcome].label} — CURRENT-${i}`);
    expect(f.calls).toHaveLength(1); expect(await replay.ledger('userAAAA', 'chatA')).toEqual(before);
    expect(f.files.get(ledgerPath)).toBe(saved); expect(roll.meaning).not.toContain('EFFECT-');
  }
});

test('CHEAT condicional, padrões equivalentes e nenhum template executado', () => {
  const text = defaultPromptTexts();
  expect(mainNote(text, { ...previewValues, cheat: false })).toBe('((An automatic skill check was completed for character Alice (INTELLIGENCE +2; Carpentry +1.5 (×0.5)). Action: open the safe. Result: Critical Success — the objective is achieved with an additional benefit. Respect all OOC instructions; do not reroll or reclassify this check.))');
  expect(mainNote(text, previewValues)).toContain(text.mainCheat);
  expect(mainNote({ ...text, mainOpening: '${throw new Error()} <script>bad()</script>' }, previewValues)).toContain('${throw new Error()} <script>bad()</script>Alice');
});
