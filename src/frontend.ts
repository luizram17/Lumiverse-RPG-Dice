import type { SpindleFrontendContext } from 'lumiverse-spindle-types';
import type { DiceEngine, Audit } from './engine';
import { approaches, defaultScores, modelOutcomes, outcomes, type Outcome } from './rules';
import { defaultPromptTexts, mainNote, outcomeEffect, previewValues, promptFields, promptTexts, type PromptTexts } from './prompts';
type View = Awaited<ReturnType<DiceEngine['view']>>;
export function clampPosition(p: { x: number; y: number }, width: number, height: number) { return { x: Math.max(0, Math.min(p.x, width - 56)), y: Math.max(0, Math.min(p.y, height - 56)) }; }
export function setup(ctx: SpindleFrontendContext) {
  const removeStyle = ctx.dom.addStyle(`
    .rpg-dice{font:14px/1.5 system-ui,sans-serif;color:var(--lumiverse-text,#e8e6ee);padding:16px;box-sizing:border-box}
    .rpg-dice h2{font-size:20px;margin:0 0 6px}.rpg-dice h3{font-size:15px;margin:22px 0 8px}.rpg-dice p{margin:6px 0 12px}
    .rpg-dice label{display:block;margin:10px 0}.rpg-dice input:not([type=checkbox]),.rpg-dice select,.rpg-dice textarea{box-sizing:border-box;width:100%;padding:9px;background:var(--lumiverse-fill,#262430);border:1px solid var(--lumiverse-border,#524b62);border-radius:8px;color:inherit;margin-top:4px}
    .rpg-dice textarea{resize:vertical;font:13px/1.5 ui-monospace,monospace;min-height:60px}.rpg-dice textarea[readonly]{opacity:.8;border-style:dashed}.rpg-dice details{margin:20px 0}.rpg-dice summary{cursor:pointer;font-weight:600}.rpg-dice .rpg-prompt-actions{display:flex;flex-wrap:wrap;gap:8px}
    .rpg-dice button{padding:9px 12px;border:1px solid var(--lumiverse-border,#6b6080);border-radius:9px;background:var(--lumiverse-fill,#292433);color:inherit;cursor:pointer}.rpg-dice button:disabled{opacity:.5;cursor:wait}.rpg-dice button[aria-pressed=true]{background:#644ba0;border-color:#c3a6ff;color:white}
    .rpg-dice .rpg-muted{font-size:12px;opacity:.75}.rpg-dice .rpg-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.rpg-dice .rpg-grid label{margin:0}.rpg-dice .rpg-status{min-height:22px;color:#cfb7ff;white-space:pre-wrap}.rpg-dice .rpg-log{max-height:50vh;overflow:auto;overscroll-behavior:contain}.rpg-dice article{border:1px solid var(--lumiverse-border,#524b62);border-radius:10px;margin:10px 0;padding:12px;overflow-wrap:anywhere}.rpg-dice article p{margin:5px 0}.rpg-dice .rpg-cheat{color:#ffd181;font-weight:700}.rpg-dice .rpg-toggle-grid{display:flex;flex-wrap:wrap;gap:6px}
    .rpg-dice-float{width:56px;height:56px;border-radius:16px;background:#272134;border:1px solid #ad8ee7;color:#f6edff;font-size:34px;cursor:grab;opacity:.6;box-shadow:0 5px 20px #0006;touch-action:none;transition:opacity .15s}.rpg-dice-float:hover,.rpg-dice-float:focus-visible{opacity:1;outline:2px solid #ceb0ff}
  `);
  const drawer = ctx.ui.registerDrawerTab({ id: 'rpg_dice', title: 'RPG Dice', shortName: 'Dados', description: 'Testes automáticos, histórico e ficha da persona', keywords: ['dados', 'rpg', 'fate', 'rolagem'] });
  // Some host versions do not have registerSettingsTab. Use their settings
  // mount when possible; the free drawer tab always remains accessible.
  let settingsTab: ReturnType<NonNullable<SpindleFrontendContext['ui']['registerSettingsTab']>> | undefined;
  try { settingsTab = ctx.ui.registerSettingsTab?.({ id: 'rpg_dice', title: 'RPG Dice', description: 'Perfil e modelo auxiliares, ficha e dados automáticos', keywords: ['dados', 'modelo', 'persona'] }); } catch {}
  let settingsMount: HTMLElement | undefined;
  if (!settingsTab) { try { settingsMount = ctx.ui.mount('settings_extensions') as HTMLElement; } catch {} }
  // A declined/revoked ui_panels permission must not disable all settings UI.
  let float: ReturnType<SpindleFrontendContext['ui']['createFloatWidget']> | undefined;
  try { float = ctx.ui.createFloatWidget({ width: 56, height: 56, chromeless: true, snapToEdge: false, tooltip: 'RPG Dice — arraste para mover; clique para histórico' }); } catch {}
  const diceButton = document.createElement('button'); diceButton.className = 'rpg-dice-float'; diceButton.textContent = '⚄'; diceButton.setAttribute('aria-label', 'Abrir histórico de rolagens RPG Dice; arraste para mover'); float?.root.append(diceButton);
  let view: View | undefined; let selectedPersona = ''; let status = ''; let disposed = false; let modal: ReturnType<SpindleFrontendContext['ui']['showModal']> | undefined; let busy = false; let latestRequest = ''; let positioned = false;
  let promptDraft: PromptTexts | undefined; let submittedPrompts: PromptTexts | undefined;
  let previewOutcome: Outcome = previewValues.outcome;
  const promptEditorOpen = new Map<HTMLElement, boolean>();
  const roots = [drawer.root, ...(settingsTab ? [settingsTab.root] : []), ...(settingsMount ? [settingsMount] : [])];
  const modelMounts = new Map<HTMLElement, ReturnType<SpindleFrontendContext['components']['mountModelCombobox']>>();
  // crypto.randomUUID() is absent on insecure HTTP LAN origins.
  let requestNumber = 0;
  const request = (payload: Record<string, unknown> = {}) => { latestRequest = `rpg-dice-${++requestNumber}`; ctx.sendToBackend({ type: 'load', ...payload, requestId: latestRequest }); };
  function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') { const e = document.createElement(tag); e.textContent = text; if (className) e.className = className; return e; }
  function field(parent: HTMLElement, title: string, control: HTMLElement) { const label = element('label', title); label.append(control); parent.append(label); }
  function showStatus(message: string) { status = message; for (const root of roots) { const target = root.querySelector('.rpg-status'); if (target) target.textContent = message; } if (modal) { const target = modal.root.querySelector('.rpg-status'); if (target) target.textContent = message; } }
  function save(payload: Record<string, unknown>) { busy = true; showStatus('Salvando… Se há análise em andamento, aguarde sua conclusão ou cancele o turno no Lumiverse.'); request({ type: 'save', ...payload }); }
  function refreshPromptEditors() {
    const texts = promptDraft || promptTexts(view?.state.prompts);
    for (const root of roots) {
      for (const input of root.querySelectorAll<HTMLTextAreaElement>('textarea[data-prompt-key]')) { const value = texts[input.dataset.promptKey as keyof PromptTexts]; if (input.value !== value) input.value = value; }
      const preview = root.querySelector<HTMLTextAreaElement>('[data-prompt-preview]');
      if (preview) preview.value = mainNote(texts, { ...previewValues, outcome: previewOutcome });
      const selector = root.querySelector<HTMLSelectElement>('[data-preview-outcome]'); if (selector) selector.value = previewOutcome;
      const category = root.querySelector<HTMLTextAreaElement>('[data-preview-category]'); if (category) category.value = modelOutcomes[previewOutcome].label;
    }
  }
  function renderPromptEditors(panel: HTMLElement, open: boolean) {
    const details = element('details'); details.open = open; details.dataset.promptEditor = ''; details.append(element('summary', 'Editar textos enviados aos modelos')); panel.append(details);
    details.append(element('p', 'Edite todos os textos fixos do árbitro auxiliar, da nota final do principal e dos efeitos de cada resultado. Os padrões estão em inglês; você pode escrever no idioma que preferir. Espaços e quebras de linha são preservados. Salve para aplicar nesta conta.'));
    details.append(element('p', 'Os campos tracejados são exemplos somente leitura. Persona, abordagem, ação e categoria vêm do código. O efeito usa o texto editado para a categoria obtida. Não há substituição de marcadores nem execução de templates. A prévia não chama modelos nem sorteia dados.', 'rpg-muted'));
    const texts = promptDraft || promptTexts(view?.state.prompts);
    const dynamic: Partial<Record<keyof PromptTexts, [string, string]>> = {
      mainOpening: ['Nome da persona · variável protegida (exemplo)', previewValues.persona],
      mainBeforeApproach: ['Abordagem · variável protegida (exemplo)', previewValues.approach],
      mainBeforeAction: ['Ação · variável protegida (exemplo)', previewValues.action],
      mainBeforeResult: ['Categoria · variável protegida (exemplo)', modelOutcomes[previewOutcome].label],
    };
    const readOnly = (label: string, value: string, rows = 2) => { const output = element('textarea'); output.readOnly = true; output.value = value; output.rows = rows; field(details, label, output); return output; };
    for (const spec of promptFields) {
      const input = element('textarea'); input.value = texts[spec.key]; input.rows = spec.key === 'refereeSystem' ? 14 : 2; input.maxLength = spec.limit; input.dataset.promptKey = spec.key;
      input.addEventListener('input', () => { promptDraft = { ...(promptDraft || promptTexts(view?.state.prompts)), [spec.key]: input.value }; refreshPromptEditors(); });
      field(details, `${spec.label} (até ${spec.limit} caracteres)`, input);
      if (spec.key === 'refereeSystem') {
        details.append(element('p', 'O texto acima é o system completo do auxiliar, incluindo suas instruções de JSON. O código continua exigindo roll booleano; reason de 1–600 caracteres; e, se roll=true, abordagem válida, DT inteira −2…8, bônus inteiro 0…4 e action de 1–400 caracteres. Alterar essas instruções não altera a validação nem as regras.', 'rpg-muted'));
        readOnly('Auxiliar — estrutura do contexto user (somente leitura; valores reais inseridos pelo código)', JSON.stringify({ persona: { id: '<id>', name: '<nome>', title: '<título>', description: '<descrição>' }, savedApproaches: defaultScores(), history: [{ id: '<id>', role: '<papel>', name: '<nome>', content: '<histórico>' }], latestAction: { messageId: '<id>', personaId: '<id>', text: '<ação atual>', ooc: ['<instruções OOC>'] } }, null, 2), 8);
        details.append(element('p', 'Principal: o código abre ((, compõe a nota com os trechos fixos abaixo, insere o efeito da categoria obtida e fecha )). O trecho CHEAT só entra em testes que já possuem CHEAT. A categoria segue as regras da extensão; seu efeito narrativo pode ser editado nos quatro campos de efeito.', 'rpg-muted'));
      }
      const slot = dynamic[spec.key]; if (slot) { const output = readOnly(...slot); if (spec.key === 'mainBeforeResult') output.dataset.previewCategory = ''; }
    }
    const selector = element('select'); selector.dataset.previewOutcome = ''; for (const outcome of outcomes) selector.append(new Option(outcome, outcome)); selector.value = previewOutcome;
    selector.addEventListener('change', () => { previewOutcome = selector.value as Outcome; refreshPromptEditors(); });
    field(details, 'Resultado da prévia — somente exemplo, não altera rolagens nem cheats', selector);
    const preview = readOnly('Prévia da nota final — exemplo com CHEAT (somente leitura)', mainNote(texts, { ...previewValues, outcome: previewOutcome }), 7); preview.dataset.promptPreview = '';
    const actions = element('div', '', 'rpg-prompt-actions');
    const saveTexts = element('button', 'Salvar textos dos modelos'); saveTexts.disabled = busy;
    saveTexts.addEventListener('click', () => { if (busy) return; submittedPrompts = { ...(promptDraft || promptTexts(view?.state.prompts)) }; save({ prompts: submittedPrompts }); });
    const resetTexts = element('button', 'Restaurar e salvar textos padrão'); resetTexts.disabled = busy;
    resetTexts.addEventListener('click', () => { if (busy) return; promptDraft = defaultPromptTexts(); submittedPrompts = { ...promptDraft }; refreshPromptEditors(); save({ resetPrompts: true }); });
    actions.append(saveTexts, resetTexts); details.append(actions, element('p', 'Restaurar salva somente os textos padrão desta conta. Fichas, conexão, histórico, resultados e cheats são preservados. Textos salvos também se aplicam ao reutilizar um resultado antigo; a rolagem antiga permanece igual.', 'rpg-muted'));
  }
  function renderConfig(root: HTMLElement) {
    const previousEditor = root.querySelector<HTMLDetailsElement>('[data-prompt-editor]'); if (previousEditor) promptEditorOpen.set(root, previousEditor.open);
    modelMounts.get(root)?.destroy(); modelMounts.delete(root);
    root.replaceChildren(); const panel = element('div', '', 'rpg-dice'); root.append(panel); panel.append(element('h2', 'RPG Dice'), element('p', 'Fate Accelerated adaptado: a IA julga a ação; o código sorteia os dados.'), element('p', status, 'rpg-status'));
    if (!float) panel.append(element('p', 'Dado flutuante indisponível: conceda a permissão ui_panels em Extensões → RPG Dice. Você ainda pode configurar e abrir o histórico por esta aba.', 'rpg-muted'));
    if (!view) { panel.append(element('p', status ? 'Falha ao carregar. Verifique se a extensão está habilitada e tente novamente.' : 'Carregando configurações…')); const retry = element('button', 'Recarregar'); retry.addEventListener('click', () => request()); panel.append(retry); return; }
    if (!view.supported) panel.append(element('p', 'Lumiverse incompatível. Atualize para uma versão com interceptores obrigatórios antes de habilitar.'));
    const enabled = element('input'); enabled.type = 'checkbox'; enabled.checked = view.state.settings.enabled; enabled.disabled = !view.supported; field(panel, ' Habilitar testes automáticos ', enabled);
    const connection = element('select'); connection.append(new Option('Selecione o perfil auxiliar', '')); for (const c of view.connections) connection.append(new Option(`${c.name} · ${c.provider}`, c.id)); connection.value = view.state.settings.connectionId; field(panel, 'Perfil de conexão auxiliar', connection);
    const modelSlot = element('div'); field(panel, 'Modelo auxiliar (independente do principal)', modelSlot);
    let modelValue = view.state.settings.model;
    const mountModel = () => {
      modelMounts.get(root)?.destroy(); modelMounts.delete(root); modelSlot.replaceChildren();
      try {
        const handle = ctx.components.mountModelCombobox(modelSlot, { value: modelValue, ...(connection.value ? { connection: { kind: 'llm' as const, id: connection.value } } : { models: [] }), appearance: 'standard', placeholder: 'Selecione ou digite o ID exato do modelo', emptyMessage: 'Sem modelos disponíveis; digite um ID válido.', loadingMessage: 'Carregando modelos…', disabled: !connection.value, onChange: value => { modelValue = value; } });
        modelMounts.set(root, handle);
      } catch {
        const input = element('input'); input.type = 'text'; input.value = modelValue; input.placeholder = 'ID exato do modelo'; input.disabled = !connection.value;
        input.addEventListener('input', () => { modelValue = input.value; }); modelSlot.append(input);
      }
    };
    mountModel(); connection.addEventListener('change', () => { modelValue = view!.connections.find(c => c.id === connection.value)?.model || ''; mountModel(); });
    panel.append(element('p', 'Cadastre a chave no gerenciador de conexões do Lumiverse. Esta extensão armazena somente os IDs de perfil e modelo. O histórico completo do chat atual e a descrição da persona serão enviados ao perfil auxiliar escolhido.', 'rpg-muted'));
    const saveSettings = element('button', 'Salvar configurações'); saveSettings.disabled = busy; saveSettings.addEventListener('click', () => save({ settings: { enabled: enabled.checked, connectionId: connection.value, model: modelMounts.get(root)?.getValue() || modelValue } })); panel.append(saveSettings);
    panel.append(element('h3', 'Abordagens por persona'));
    const persona = element('select'); for (const p of view.personas) persona.append(new Option(p.name, p.id)); if (!view.personas.some(p => p.id === selectedPersona)) selectedPersona = view.personas[0]?.id || ''; persona.value = selectedPersona; field(panel, 'Persona', persona); persona.addEventListener('change', () => { selectedPersona = persona.value; render(); });
    const scores = view.state.personas[selectedPersona] || defaultScores(); const grid = element('div', '', 'rpg-grid'); const inputs = new Map<string, HTMLInputElement>();
    for (const a of approaches) { const input = element('input'); input.type = 'number'; input.min = '0'; input.max = '5'; input.step = '1'; input.value = String(scores[a]); inputs.set(a, input); field(grid, a, input); } panel.append(grid);
    panel.append(element('p', 'Inicial: +3, +2, +2, +1, +1, +0 na ordem acima. Cada valor pode ser editado de 0 a 5; não há redistribuição automática. A ficha pertence ao ID estável da persona nesta conta.', 'rpg-muted'));
    const saveScores = element('button', 'Salvar ficha da persona'); saveScores.disabled = busy || !selectedPersona; saveScores.addEventListener('click', () => save({ personaId: selectedPersona, scores: Object.fromEntries(approaches.map(a => [a, Number(inputs.get(a)!.value)])) })); panel.append(saveScores);
    panel.append(element('h3', 'Rolagem e cheats'));
    const open = element('button', 'Abrir histórico e cheats'); open.addEventListener('click', openHistory); panel.append(open, element('p', '4dF + abordagem salva + bônus contextual (0 a 4), contra DT de −2 a 8. Falha: abaixo da DT. Parcial: empate. Sucesso: DT +1/+2. Crítico: DT +3 ou mais.', 'rpg-muted'));
    renderPromptEditors(panel, promptEditorOpen.get(root) || false);
  }
  function auditArticle(audit: Audit) {
    const card = element('article'); const r = audit.roll!; card.append(element('strong', `${audit.personaName} · ${r.outcome}`), element('p', new Date(audit.timestamp).toLocaleString('pt-BR'), 'rpg-muted'));
    if (audit.fudge) card.append(element('p', `CHEAT — resultado garantido: ${audit.fudge.requested}. Categoria natural: ${audit.fudge.naturalOutcome}.`, 'rpg-cheat'));
    card.append(element('p', `${audit.decision.approach}: [${r.dice.join(', ')}] = ${r.diceTotal}; atributo ${r.attribute}; bônus ${r.bonus}; total ${r.total}; DT ${r.difficulty}.`), element('p', `Efeito (texto atual): ${outcomeEffect(promptTexts(view?.state.prompts), r.outcome as Outcome)}`), element('p', `Ação: ${audit.decision.action}`), element('p', `Motivo: ${audit.decision.reason}`, 'rpg-muted')); return card;
  }
  function renderHistory() {
    if (!modal) return; const panel = element('div', '', 'rpg-dice'); modal.root.replaceChildren(panel); panel.append(element('p', view?.chat ? `Chat: ${view.chat.name}` : 'Abra um chat para ver as rolagens.'), element('p', status, 'rpg-status'));
    if (!view?.chat || !view.ledger) return;
    panel.append(element('h3', 'Cheats deste chat'), element('p', 'Enquanto estiver ativo, o cheat garante o resultado em toda nova rolagem. Só desativa manualmente: clique no botão ativo para desligar ou selecione outro resultado.', 'rpg-muted'));
    const toggles = element('div', '', 'rpg-toggle-grid'); const chatId = view.chat.id;
    for (const outcome of outcomes) { const b = element('button', outcome); b.setAttribute('aria-pressed', String(view.ledger.activeCheat === outcome)); b.disabled = busy; b.addEventListener('click', () => { if (busy) return; busy = true; for (const button of toggles.querySelectorAll('button')) button.disabled = true; showStatus('Salvando cheat…'); request({ type: 'cheat', chatId, outcome: view!.ledger!.activeCheat === outcome ? null : outcome }); }); toggles.append(b); } panel.append(toggles);
    panel.append(element('p', 'Os dados e o total natural continuam visíveis. O resultado escolhido prevalece, marcado como CHEAT no histórico e no prompt. Regenerar uma resposta mantém o teste já feito.', 'rpg-muted'));
    const log = element('div', '', 'rpg-log'); log.setAttribute('aria-label', 'Histórico de rolagens'); const rolls = view.ledger.records.filter(a => a.roll).reverse(); if (!rolls.length) log.append(element('p', 'Ainda não há rolagens neste chat.')); for (const a of rolls) log.append(auditArticle(a)); panel.append(element('h3', `${rolls.length} rolagem(ns)`), log);
  }
  function render() { roots.forEach(renderConfig); renderHistory(); }
  function openHistory() { if (modal) return; modal = ctx.ui.showModal({ title: 'RPG Dice — histórico e cheats' }); modal.onDismiss(() => { modal = undefined; }); renderHistory(); request(); }
  diceButton.addEventListener('click', openHistory);
  const clamp = () => { if (!float) return; const p = clampPosition(float.getPosition(), window.innerWidth, window.innerHeight); float.moveTo(p.x, p.y); };
  const dragOff = float?.onDragEnd(p => { if (!float) return; const position = clampPosition(p, window.innerWidth, window.innerHeight); float.moveTo(position.x, position.y); ctx.sendToBackend({ type: 'position', position }); }) ?? (() => {});
  window.addEventListener('resize', clamp);
  const unsub = ctx.onBackendMessage(raw => {
    if (disposed || !raw || typeof raw !== 'object') return; const p = raw as Record<string, unknown>;
    if (p.type === 'audit') { request(); return; }
    if (p.requestId !== latestRequest) return;
    busy = false;
    if (p.type === 'error') { submittedPrompts = undefined; status = String(p.message); render(); return; }
    if (p.type === 'view') { view = p as unknown as View; status = ''; if (submittedPrompts && JSON.stringify(promptTexts(view.state.prompts)) === JSON.stringify(submittedPrompts)) { if (JSON.stringify(promptDraft || submittedPrompts) === JSON.stringify(submittedPrompts)) promptDraft = undefined; submittedPrompts = undefined; } if (!positioned) { positioned = true; if (view.state.position) float?.moveTo(view.state.position.x, view.state.position.y); clamp(); } render(); }
  });
  const offChat = ctx.events.on('CHAT_SWITCHED', () => { busy = false; view = undefined; render(); request(); });
  const offActivate = drawer.onActivate(() => request()); const offSettings = settingsTab?.onActivate(() => request());
  render(); request();
  return () => { disposed = true; unsub(); offChat(); offActivate(); offSettings?.(); dragOff(); window.removeEventListener('resize', clamp); modal?.dismiss(); for (const handle of modelMounts.values()) handle.destroy(); modelMounts.clear(); float?.destroy(); settingsTab?.destroy(); drawer.destroy(); removeStyle(); };
}

