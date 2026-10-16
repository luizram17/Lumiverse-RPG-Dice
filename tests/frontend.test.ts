import { expect, test, afterEach } from 'bun:test';
import { JSDOM } from 'jsdom';
import type { SpindleFrontendContext } from 'lumiverse-spindle-types';
import { setup, clampPosition } from '../src/frontend';
import { defaultSheet, modelOutcomes, outcomes } from '../src/rules';
import { defaultPromptTexts, previewValues, promptFields } from '../src/prompts';

function uiFixture(fallbacks = false) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, Option: dom.window.Option });
  const requests: any[] = []; let backend: (p: any) => void = () => {};
  let switched: () => void = () => {}; let dragged: (p: any) => void = () => {};
  const positions: any[] = []; let position = { x: 20, y: 30 }; let destroyed = 0; let mounts = 0;
  const root = () => { const r = document.createElement('div'); document.body.append(r); return r; };
  const drawer = root(); const settings = root(); const float = root(); let modal: HTMLElement | null = null;
  const handle = (r: HTMLElement) => ({ root: r, destroy: () => { destroyed++; r.remove(); }, onActivate: () => () => {} });
  const ctx = {
    dom: { addStyle: () => () => {} },
    ui: {
      registerDrawerTab: () => handle(drawer), registerSettingsTab: () => handle(settings),
      createFloatWidget: () => ({ ...handle(float), getPosition: () => position, moveTo: (x: number, y: number) => { position = { x, y }; positions.push(position); }, onDragEnd: (h: any) => { dragged = h; return () => {}; } }),
      showModal: () => { modal = root(); return { root: modal, dismiss: () => { modal?.remove(); }, onDismiss: () => () => {} }; },
    },
    components: {
      mountModelCombobox: (r: HTMLElement, options: any) => {
        mounts++; const input = document.createElement('input'); input.value = options.value; r.append(input);
        return { getValue: () => input.value, destroy: () => { mounts--; input.remove(); } };
      },
    },
    events: { on: (_e: string, h: any) => { switched = h; return () => {}; } },
    onBackendMessage: (h: any) => { backend = h; return () => {}; },
    sendToBackend: (p: any) => requests.push(p),
  } as unknown as SpindleFrontendContext;
  if (fallbacks) {
    ctx.ui.registerSettingsTab = () => { throw Error('unsupported'); };
    ctx.ui.mount = () => settings;
    ctx.ui.createFloatWidget = () => { throw Error('permission'); };
    ctx.components.mountModelCombobox = () => { throw Error('missing'); };
  }
  const cleanup = setup(ctx);
  const sheetB = defaultSheet(); sheetB.attributes.STRENGTH = 7;
  const view: any = {
    type: 'view', state: { version: 2, settings: { enabled: true, connectionId: 'aux', model: 'model-x' }, personas: { personaA: defaultSheet(), personaB: sheetB }, position: { x: 40, y: 60 }, prompts: defaultPromptTexts() },
    supported: true, connections: [{ id: 'aux', name: 'Auxiliar', provider: 'openai', model: 'model-x' }],
    personas: [{ id: 'personaA', name: 'Alice' }, { id: 'personaB', name: 'Bob' }], chat: { id: 'chatA', name: 'Chat A' }, ledger: { version: 1, activeCheat: null, records: [] },
  };
  const reply = (data: any = view, requestId: string | undefined = requests.at(-1)?.requestId) => backend({ ...data, requestId });
  return {
    dom, requests, drawer, settings, float, get modal() { return modal; }, reply, view,
    deliver: (data: any) => backend(data), drag: (p: any) => dragged(p), switchChat: () => switched(), positions, cleanup,
    get mounts() { return mounts; }, get destroyed() { return destroyed; },
  };
}

function button(root: ParentNode, label: string) {
  const found = [...root.querySelectorAll('button')].find(b => b.textContent === label);
  if (!found) throw Error(`Botão ausente: ${label}`); return found as HTMLButtonElement;
}
function setInput(input: HTMLInputElement | HTMLTextAreaElement, value: string, f: ReturnType<typeof uiFixture>) {
  input.value = value; input.dispatchEvent(new f.dom.window.Event('input'));
}
afterEach(() => { delete (globalThis as any).window; delete (globalThis as any).document; delete (globalThis as any).Option; });

test('UI mantém os fallbacks de host, salva configuração e desmonta os modelos', () => {
  const f = uiFixture(); f.reply();
  expect(f.drawer.textContent).toContain('Perfil de conexão auxiliar'); expect(f.mounts).toBe(2);
  button(f.drawer, 'Salvar configurações').click(); expect(f.requests.at(-1).settings.model).toBe('model-x');
  f.reply(); expect(f.mounts).toBe(2); f.cleanup(); expect(f.mounts).toBe(0); expect(f.destroyed).toBe(3);
});

test('widget flutuante abre histórico, move com clamp e preserva os cheats persistentes', () => {
  const f = uiFixture(); f.reply(); f.drag({ x: 99999, y: -20 });
  expect(f.requests.at(-1).type).toBe('position'); expect(f.requests.at(-1).position.y).toBe(0); expect(f.modal).toBeNull();
  (f.float.querySelector('button') as HTMLButtonElement).click(); f.reply(); expect(f.modal?.textContent).toContain('Cheats deste chat');
  let buttons = f.modal!.querySelectorAll('button'); expect(buttons.length).toBe(4); (buttons[3] as HTMLButtonElement).click();
  const count = f.requests.length; (buttons[3] as HTMLButtonElement).click(); expect(f.requests.length).toBe(count); expect([...buttons].every(b => b.disabled)).toBe(true);
  expect(f.requests.at(-1)).toMatchObject({ type: 'cheat', chatId: 'chatA', outcome: 'Sucesso Crítico' });
  f.view.ledger.activeCheat = 'Sucesso Crítico'; f.reply(); buttons = f.modal!.querySelectorAll('button');
  expect([...buttons].map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'true']);
  (buttons[3] as HTMLButtonElement).click(); expect(f.requests.at(-1).outcome).toBeNull();
  expect(clampPosition({ x: 999, y: -5 }, 300, 200)).toEqual({ x: 244, y: 0 }); f.cleanup();
});

test('troca chat limpa o histórico antigo e ignora respostas obsoletas', () => {
  const f = uiFixture(); f.reply(); (f.float.querySelector('button') as HTMLButtonElement).click(); f.reply();
  const stale = f.requests.at(-1).requestId; f.switchChat(); expect(f.modal!.textContent).not.toContain('Chat A');
  f.reply(f.view, stale); expect(f.modal!.textContent).not.toContain('Chat A'); f.cleanup();
});

test('rascunhos de fichas ficam isolados por persona e salvam atributos signed e skills sem limites artificiais', () => {
  const f = uiFixture(); f.reply();
  const strength = f.drawer.querySelector<HTMLInputElement>('input[data-attribute="STRENGTH"]')!;
  const wisdom = f.drawer.querySelector<HTMLInputElement>('input[data-attribute="WISDOM"]')!;
  setInput(strength, '-9007199254740991', f); setInput(wisdom, '9007199254740991', f);
  button(f.drawer, 'Adicionar skill').click();
  let skill = f.drawer.querySelector<HTMLElement>('section[data-skill-id]')!; const firstId = skill.dataset.skillId!;
  setInput(skill.querySelector<HTMLInputElement>('[data-skill-name]')!, 'Carpentry', f);
  setInput(skill.querySelector<HTMLTextAreaElement>('[data-skill-description]')!, 'Builds precise wooden structures.', f);
  setInput(skill.querySelector<HTMLInputElement>('[data-skill-bonus]')!, '-9007199254740991', f);
  button(f.drawer, 'Adicionar skill').click();
  skill = f.drawer.querySelectorAll<HTMLElement>('section[data-skill-id]')[1]!;
  setInput(skill.querySelector<HTMLInputElement>('[data-skill-name]')!, 'Temporary', f);
  expect(f.drawer.querySelectorAll('section[data-skill-id]')).toHaveLength(2);
  (f.drawer.querySelector<HTMLButtonElement>('[data-remove-skill="1"]')!).click();
  expect(f.drawer.querySelectorAll('section[data-skill-id]')).toHaveLength(1);
  expect(f.drawer.querySelector<HTMLElement>('section[data-skill-id]')!.dataset.skillId).toBe(firstId);

  const selector = f.drawer.querySelector<HTMLSelectElement>('[data-persona-selector]')!; selector.value = 'personaB'; selector.dispatchEvent(new f.dom.window.Event('change'));
  expect(f.drawer.querySelector<HTMLInputElement>('input[data-attribute="STRENGTH"]')!.value).toBe('7');
  expect(f.drawer.querySelectorAll('section[data-skill-id]')).toHaveLength(0);
  setInput(f.drawer.querySelector<HTMLInputElement>('input[data-attribute="CHARISMA"]')!, '-12', f);
  f.drawer.querySelector<HTMLSelectElement>('[data-persona-selector]')!.value = 'personaA'; f.drawer.querySelector<HTMLSelectElement>('[data-persona-selector]')!.dispatchEvent(new f.dom.window.Event('change'));
  expect(f.drawer.querySelector<HTMLInputElement>('input[data-attribute="STRENGTH"]')!.value).toBe('-9007199254740991');
  expect(f.drawer.querySelector<HTMLInputElement>('input[data-attribute="WISDOM"]')!.value).toBe('9007199254740991');
  expect(f.drawer.querySelectorAll('section[data-skill-id]')).toHaveLength(1);
  expect(f.drawer.querySelector<HTMLInputElement>('[data-skill-bonus]')!.value).toBe('-9007199254740991');

  button(f.drawer, 'Salvar ficha da persona').click();
  const sent = f.requests.at(-1); expect(sent).toMatchObject({ type: 'save', personaId: 'personaA' });
  expect(sent.scores).toBeUndefined(); expect(sent.sheet.attributes).toMatchObject({ STRENGTH: -9007199254740991, WISDOM: 9007199254740991 });
  expect(sent.sheet.skills).toHaveLength(1); expect(sent.sheet.skills[0]).toMatchObject({ id: firstId, name: 'Carpentry', bonus: -9007199254740991 });
  f.view.state.personas.personaA = sent.sheet; f.reply();
  expect(f.drawer.querySelector<HTMLElement>('section[data-skill-id]')!.dataset.skillId).toBe(firstId); f.cleanup();
});

test('valores decimais e inteiros fora do intervalo seguro não são enviados', () => {
  const f = uiFixture(); f.reply(); const before = f.requests.length;
  setInput(f.drawer.querySelector<HTMLInputElement>('input[data-attribute="DEXTERITY"]')!, '1.5', f);
  button(f.drawer, 'Salvar ficha da persona').click(); expect(f.requests).toHaveLength(before); expect(f.drawer.textContent).toContain('inteiro seguro');
  setInput(f.drawer.querySelector<HTMLInputElement>('input[data-attribute="DEXTERITY"]')!, '9007199254740992', f);
  button(f.drawer, 'Salvar ficha da persona').click(); expect(f.requests).toHaveLength(before); f.cleanup();
});

test('atributos e skills sincronizam entre aba e configurações sem re-render nem perda de foco', () => {
  const f = uiFixture(); f.reply(); button(f.drawer, 'Adicionar skill').click();
  const strength = f.drawer.querySelector<HTMLInputElement>('input[data-attribute="STRENGTH"]')!; strength.focus();
  setInput(strength, '-9', f);
  expect(f.settings.querySelector<HTMLInputElement>('input[data-attribute="STRENGTH"]')!.value).toBe('-9');
  expect(f.dom.window.document.activeElement).toBe(strength);

  const name = f.drawer.querySelector<HTMLInputElement>('[data-skill-name="0"]')!; name.focus(); setInput(name, 'Marcenaria', f);
  expect(f.settings.querySelector<HTMLInputElement>('[data-skill-name="0"]')!.value).toBe('Marcenaria');
  expect(f.settings.querySelector('section[data-skill-id] strong')!.textContent).toBe('Marcenaria');
  expect(f.dom.window.document.activeElement).toBe(name); expect(f.drawer.querySelector('[data-skill-name="0"]')).toBe(name);

  const description = f.drawer.querySelector<HTMLTextAreaElement>('[data-skill-description="0"]')!; description.focus(); setInput(description, 'Reparar uma ponte de madeira.', f);
  expect(f.settings.querySelector<HTMLTextAreaElement>('[data-skill-description="0"]')!.value).toBe('Reparar uma ponte de madeira.');
  expect(f.dom.window.document.activeElement).toBe(description);
  const bonus = f.drawer.querySelector<HTMLInputElement>('[data-skill-bonus="0"]')!; bonus.focus(); setInput(bonus, '11', f);
  expect(f.settings.querySelector<HTMLInputElement>('[data-skill-bonus="0"]')!.value).toBe('11');
  expect(f.dom.window.document.activeElement).toBe(bonus); f.cleanup();
});

test('ficha Fate arquivada é identificada na UI sem convertê-la', () => {
  const f = uiFixture(); f.view.state.legacyPersonas = { personaA: { Cuidadoso: 3 } }; f.reply();
  expect(f.drawer.textContent).toContain('ficha Fate antiga, arquivada durante a migração');
  expect(f.drawer.textContent).toContain('configure a nova ficha 2d10');
  expect(f.view.state.personas.personaA.attributes.STRENGTH).toBe(0); f.cleanup();
});

test('quatorze editores preservam textos customizados e a prévia usa atributo e modificadores', () => {
  const f = uiFixture(); f.reply(); const before = f.requests.length;
  expect(promptFields).toHaveLength(14); expect(f.drawer.querySelectorAll('textarea[data-prompt-key]')).toHaveLength(14);
  for (const spec of promptFields) {
    const input = f.drawer.querySelector<HTMLTextAreaElement>(`textarea[data-prompt-key="${spec.key}"]`)!;
    expect(input.readOnly).toBe(false); expect(input.maxLength).toBe(spec.limit);
    setInput(input, ` ${spec.key}\n<script>bad()</script>\${literal} `, f);
    expect(f.settings.querySelector<HTMLTextAreaElement>(`textarea[data-prompt-key="${spec.key}"]`)!.value).toBe(input.value);
  }
  expect(f.requests).toHaveLength(before); expect(f.drawer.querySelector('script')).toBeNull();
  const preview = f.drawer.querySelector<HTMLTextAreaElement>('[data-prompt-preview]')!; expect(preview.readOnly).toBe(true);
  for (const value of ['Alice', previewValues.attribute, 'open the safe', 'Critical Success', 'effectCriticalSuccess']) expect(preview.value).toContain(value);
  expect(f.drawer.textContent).toContain('Atributo e modificadores'); expect(f.drawer.textContent).toContain('validação e a resolução imutáveis');
  const readOnly = f.drawer.querySelectorAll<HTMLTextAreaElement>('textarea[readonly]'); for (const input of readOnly) input.value = 'tampered';
  button(f.drawer, 'Salvar textos dos modelos').click(); const sent = f.requests.at(-1);
  expect(Object.keys(sent.prompts)).toEqual(promptFields.map(s => s.key)); expect(JSON.stringify(sent.prompts)).not.toContain('tampered');
  expect(sent.prompts.refereeSystem).toContain('<script>bad()</script>'); expect(sent.prompts.refereeContract).toContain('<script>bad()</script>');
  f.view.state.prompts = sent.prompts; f.reply();
  expect(f.drawer.querySelector<HTMLTextAreaElement>('[data-prompt-key="refereeContract"]')!.value).toBe(sent.prompts.refereeContract); f.cleanup();
});

test('prévia de efeitos não chama backend e o histórico usa os textos salvos', () => {
  const f = uiFixture(); f.reply(); const before = f.requests.length;
  const keys = ['effectFailure', 'effectPartialSuccess', 'effectSuccess', 'effectCriticalSuccess'];
  for (const [i, outcome] of outcomes.entries()) {
    const input = f.drawer.querySelector<HTMLTextAreaElement>(`[data-prompt-key="${keys[i]}"]`)!;
    setInput(input, `<img src=x onerror=bad()> efeito-${i}`, f);
    const selector = f.drawer.querySelector<HTMLSelectElement>('[data-preview-outcome]')!; selector.value = outcome; selector.dispatchEvent(new f.dom.window.Event('change'));
    for (const root of [f.drawer, f.settings]) {
      expect(root.querySelector<HTMLTextAreaElement>('[data-prompt-preview]')!.value).toContain(`${modelOutcomes[outcome].label} — ${input.value}`);
      expect(root.querySelector<HTMLTextAreaElement>('[data-preview-category]')!.value).toBe(modelOutcomes[outcome].label);
      expect(root.querySelector<HTMLSelectElement>('[data-preview-outcome]')!.value).toBe(outcome); expect(root.querySelector('img')).toBeNull();
    }
  }
  expect(f.requests).toHaveLength(before); expect(f.view.ledger.activeCheat).toBeNull();
  const old = { personaName: 'Alice', timestamp: new Date(0).toISOString(), decision: { approach: 'Astuto', action: 'open', reason: 'risk' }, roll: { dice: [-1, 0, 1, 0], diceTotal: 0, attribute: 2, bonus: 1, total: 3, difficulty: 4, outcome: 'Falha', meaning: 'legacy snapshot' } };
  const current = { personaName: 'Alice', timestamp: new Date(1).toISOString(), decision: { attribute: 'STRENGTH', skillCandidates: [{ id: 'carpentry', relevance: 'partial' }], action: 'open', reason: 'risk' }, roll: { ruleset: '2d10', dice: [10, 10], diceTotal: 20, attribute: 3, skillBonus: 1.5, skill: { id: 'carpentry', name: 'Carpentry', description: 'woodwork', bonus: 3, relevance: 'partial', appliedBonus: 1.5 }, total: 24.5, difficulty: 20, outcome: 'Sucesso Crítico', meaning: 'critical snapshot' } };
  f.view.ledger.records.push(old, current); f.view.state.prompts.effectFailure = 'efeito salvo';
  (f.float.querySelector('button') as HTMLButtonElement).click(); f.reply();
  const history = f.modal!.textContent!;
  expect(history).toContain('Efeito (texto atual): efeito salvo'); expect(history).toContain('Legado 4dF'); expect(history).toContain('bônus contextual legado +1');
  expect(history).toContain('legacy snapshot'); expect(history).toContain('2d10: [10, 10]'); expect(history).toContain('STRENGTH');
  expect(history).toContain('Carpentry — bônus original +3, aplicado +1.5 (partial)'); expect(history).toContain('total 24.5; DT 20');
  expect(current.roll.meaning).toBe('critical snapshot'); expect(old.roll.meaning).toBe('legacy snapshot'); f.cleanup();
});

test('rascunho de prompt sobrevive carregamento/erro e reset só afeta os textos', () => {
  const f = uiFixture(); delete f.view.state.prompts; f.reply();
  f.drawer.querySelector<HTMLDetailsElement>('[data-prompt-editor]')!.open = true;
  let input = f.drawer.querySelector<HTMLTextAreaElement>('[data-prompt-key="refereeSystem"]')!;
  expect(input.value).toBe(defaultPromptTexts().refereeSystem); setInput(input, 'unsaved referee role', f);
  setInput(f.drawer.querySelector<HTMLTextAreaElement>('[data-prompt-key="refereeContract"]')!, 'unsaved custom contract', f);
  f.reply(); expect(f.drawer.querySelector<HTMLTextAreaElement>('[data-prompt-key="refereeSystem"]')!.value).toBe('unsaved referee role');
  expect(f.drawer.querySelector<HTMLTextAreaElement>('[data-prompt-key="refereeContract"]')!.value).toBe('unsaved custom contract');
  expect(f.drawer.querySelector<HTMLDetailsElement>('[data-prompt-editor]')!.open).toBe(true);
  button(f.drawer, 'Salvar textos dos modelos').click(); f.reply({ type: 'error', message: 'erro fixture' });
  expect(f.drawer.textContent).toContain('erro fixture'); expect(f.drawer.querySelector<HTMLTextAreaElement>('[data-prompt-key="refereeContract"]')!.value).toBe('unsaved custom contract');
  button(f.drawer, 'Restaurar e salvar textos padrão').click(); expect(f.requests.at(-1)).toMatchObject({ type: 'save', resetPrompts: true });
  expect(f.requests.at(-1).settings).toBeUndefined(); expect(f.requests.at(-1).personaId).toBeUndefined();
  f.view.state.prompts = defaultPromptTexts(); f.reply(); input = f.drawer.querySelector<HTMLTextAreaElement>('[data-prompt-key="refereeContract"]')!;
  expect(input.value).toBe(defaultPromptTexts().refereeContract); f.cleanup();
});

test('fallbacks de host mantêm configurações disponíveis sem float, settings nativo ou combobox', () => {
  const f = uiFixture(true); f.reply(); expect(f.drawer.textContent).toContain('Dado flutuante indisponível');
  expect(f.drawer.querySelectorAll('[data-prompt-key]')).toHaveLength(promptFields.length); expect(f.settings.querySelectorAll('[data-prompt-key]')).toHaveLength(promptFields.length);
  const model = f.drawer.querySelector<HTMLInputElement>('input[placeholder="ID exato do modelo"]')!;
  model.value = 'fallback-model'; model.dispatchEvent(new f.dom.window.Event('input')); button(f.drawer, 'Salvar configurações').click();
  expect(f.requests.at(-1).settings.model).toBe('fallback-model'); f.cleanup();
});
