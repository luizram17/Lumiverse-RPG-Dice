import type { SpindleFrontendContext } from 'lumiverse-spindle-types';
import type { DiceEngine, Audit } from './engine';
import { approaches, defaultScores, outcomes, type Outcome } from './rules';
type View = Awaited<ReturnType<DiceEngine['view']>>;
export function clampPosition(p: { x: number; y: number }, width: number, height: number) { return { x: Math.max(0, Math.min(p.x, width - 56)), y: Math.max(0, Math.min(p.y, height - 56)) }; }
export function setup(ctx: SpindleFrontendContext) {
  const removeStyle = ctx.dom.addStyle(`
    .rpg-dice{font:14px/1.5 system-ui,sans-serif;color:var(--lumiverse-text,#e8e6ee);padding:16px;box-sizing:border-box}
    .rpg-dice h2{font-size:20px;margin:0 0 6px}.rpg-dice h3{font-size:15px;margin:22px 0 8px}.rpg-dice p{margin:6px 0 12px}
    .rpg-dice label{display:block;margin:10px 0}.rpg-dice input:not([type=checkbox]),.rpg-dice select{box-sizing:border-box;width:100%;padding:9px;background:var(--lumiverse-fill,#262430);border:1px solid var(--lumiverse-border,#524b62);border-radius:8px;color:inherit;margin-top:4px}
    .rpg-dice button{padding:9px 12px;border:1px solid var(--lumiverse-border,#6b6080);border-radius:9px;background:var(--lumiverse-fill,#292433);color:inherit;cursor:pointer}.rpg-dice button:disabled{opacity:.5;cursor:wait}.rpg-dice button[aria-pressed=true]{background:#644ba0;border-color:#c3a6ff;color:white}
    .rpg-dice .rpg-muted{font-size:12px;opacity:.75}.rpg-dice .rpg-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.rpg-dice .rpg-grid label{margin:0}.rpg-dice .rpg-status{min-height:22px;color:#cfb7ff;white-space:pre-wrap}.rpg-dice .rpg-log{max-height:50vh;overflow:auto;overscroll-behavior:contain}.rpg-dice article{border:1px solid var(--lumiverse-border,#524b62);border-radius:10px;margin:10px 0;padding:12px;overflow-wrap:anywhere}.rpg-dice article p{margin:5px 0}.rpg-dice .rpg-cheat{color:#ffd181;font-weight:700}.rpg-dice .rpg-toggle-grid{display:flex;flex-wrap:wrap;gap:6px}
    .rpg-dice-float{width:56px;height:56px;border-radius:16px;background:#272134;border:1px solid #ad8ee7;color:#f6edff;font-size:34px;cursor:grab;opacity:.6;box-shadow:0 5px 20px #0006;touch-action:none;transition:opacity .15s}.rpg-dice-float:hover,.rpg-dice-float:focus-visible{opacity:1;outline:2px solid #ceb0ff}
  `);
  const drawer = ctx.ui.registerDrawerTab({ id: 'rpg_dice', title: 'RPG Dice', shortName: 'Dados', description: 'Testes automáticos, histórico e ficha da persona', keywords: ['dados', 'rpg', 'fate', 'rolagem'] });
  const settingsTab = ctx.ui.registerSettingsTab?.({ id: 'rpg_dice', title: 'RPG Dice', description: 'Perfil e modelo auxiliares, ficha e dados automáticos', keywords: ['dados', 'modelo', 'persona'] });
  const float = ctx.ui.createFloatWidget({ width: 56, height: 56, chromeless: true, snapToEdge: false, tooltip: 'RPG Dice — arraste para mover; clique para histórico' });
  const diceButton = document.createElement('button'); diceButton.className = 'rpg-dice-float'; diceButton.textContent = '⚄'; diceButton.setAttribute('aria-label', 'Abrir histórico de rolagens RPG Dice; arraste para mover'); float.root.append(diceButton);
  let view: View | undefined; let selectedPersona = ''; let status = ''; let disposed = false; let modal: ReturnType<SpindleFrontendContext['ui']['showModal']> | undefined; let busy = false; let latestRequest = ''; let positioned = false;
  const roots = [drawer.root, ...(settingsTab ? [settingsTab.root] : [])];
  const modelMounts = new Map<HTMLElement, ReturnType<SpindleFrontendContext['components']['mountModelCombobox']>>();
  const request = (payload: Record<string, unknown> = {}) => { latestRequest = crypto.randomUUID(); ctx.sendToBackend({ type: 'load', ...payload, requestId: latestRequest }); };
  function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') { const e = document.createElement(tag); e.textContent = text; if (className) e.className = className; return e; }
  function field(parent: HTMLElement, title: string, control: HTMLElement) { const label = element('label', title); label.append(control); parent.append(label); }
  function showStatus(message: string) { status = message; for (const root of roots) { const target = root.querySelector('.rpg-status'); if (target) target.textContent = message; } if (modal) { const target = modal.root.querySelector('.rpg-status'); if (target) target.textContent = message; } }
  function save(payload: Record<string, unknown>) { busy = true; showStatus('Salvando… Se há análise em andamento, aguarde sua conclusão ou cancele o turno no Lumiverse.'); request({ type: 'save', ...payload }); }
  function renderConfig(root: HTMLElement) {
    modelMounts.get(root)?.destroy(); modelMounts.delete(root);
    root.replaceChildren(); const panel = element('div', '', 'rpg-dice'); root.append(panel); panel.append(element('h2', 'RPG Dice'), element('p', 'Fate Accelerated adaptado: a IA julga a ação; o código sorteia os dados.'), element('p', status, 'rpg-status'));
    if (!view) { panel.append(element('p', 'Carregando configurações…')); return; }
    if (!view.supported) panel.append(element('p', 'Lumiverse incompatível. Atualize para uma versão com interceptores obrigatórios antes de habilitar.'));
    const enabled = element('input'); enabled.type = 'checkbox'; enabled.checked = view.state.settings.enabled; enabled.disabled = !view.supported; field(panel, ' Habilitar testes automáticos ', enabled);
    const connection = element('select'); connection.append(new Option('Selecione o perfil auxiliar', '')); for (const c of view.connections) connection.append(new Option(`${c.name} · ${c.provider}`, c.id)); connection.value = view.state.settings.connectionId; field(panel, 'Perfil de conexão auxiliar', connection);
    const modelSlot = element('div'); field(panel, 'Modelo auxiliar (independente do principal)', modelSlot);
    let modelValue = view.state.settings.model;
    const mountModel = () => { modelMounts.get(root)?.destroy(); modelSlot.replaceChildren(); const handle = ctx.components.mountModelCombobox(modelSlot, { value: modelValue, ...(connection.value ? { connection: { kind: 'llm' as const, id: connection.value } } : { models: [] }), appearance: 'standard', placeholder: 'Selecione ou digite o ID exato do modelo', emptyMessage: 'Sem modelos disponíveis; digite um ID válido.', loadingMessage: 'Carregando modelos…', disabled: !connection.value, onChange: value => { modelValue = value; } }); modelMounts.set(root, handle); };
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
  }
  function auditArticle(audit: Audit) {
    const card = element('article'); const r = audit.roll!; card.append(element('strong', `${audit.personaName} · ${r.outcome}`), element('p', new Date(audit.timestamp).toLocaleString('pt-BR'), 'rpg-muted'));
    if (audit.fudge) card.append(element('p', `CHEAT — resultado garantido: ${audit.fudge.requested}. Categoria natural: ${audit.fudge.naturalOutcome}.`, 'rpg-cheat'));
    card.append(element('p', `${audit.decision.approach}: [${r.dice.join(', ')}] = ${r.diceTotal}; atributo ${r.attribute}; bônus ${r.bonus}; total ${r.total}; DT ${r.difficulty}.`), element('p', `Efeito: ${r.meaning}.`), element('p', `Ação: ${audit.decision.action}`), element('p', `Motivo: ${audit.decision.reason}`, 'rpg-muted')); return card;
  }
  function renderHistory() {
    if (!modal) return; const panel = element('div', '', 'rpg-dice'); modal.root.replaceChildren(panel); panel.append(element('p', view?.chat ? `Chat: ${view.chat.name}` : 'Abra um chat para ver as rolagens.'), element('p', status, 'rpg-status'));
    if (!view?.chat || !view.ledger) return;
    panel.append(element('h3', 'Cheats deste chat'), element('p', 'Enquanto estiver ativo, o cheat garante o resultado em toda nova rolagem. Só desativa manualmente: clique no botão ativo para desligar ou selecione outro resultado.', 'rpg-muted'));
    const toggles = element('div', '', 'rpg-toggle-grid'); const chatId = view.chat.id;
    for (const outcome of outcomes) { const b = element('button', outcome); b.setAttribute('aria-pressed', String(view.ledger.activeCheat === outcome)); b.disabled = busy; b.addEventListener('click', () => { if (busy) return; busy = true; for (const button of toggles.querySelectorAll('button')) button.disabled = true; showStatus('Salvando cheat…'); request({ type: 'cheat', chatId, outcome: view!.ledger!.activeCheat === outcome ? null : outcome }); }); toggles.append(b); } panel.append(toggles);
    panel.append(element('p', 'Os dados e o total natural continuam visíveis. O resultado escolhido prevalece, marcado como CHEAT no histórico e no prompt. Regenerar uma resposta mantém o teste já feito.', 'rpg-muted'));
    const log = element('div', '', 'rpg-log'); log.setAttribute('aria-label', 'Histórico de rolagens'); const rolls = view.ledger.records.filter(a => a.roll).toReversed(); if (!rolls.length) log.append(element('p', 'Ainda não há rolagens neste chat.')); for (const a of rolls) log.append(auditArticle(a)); panel.append(element('h3', `${rolls.length} rolagem(ns)`), log);
  }
  function render() { roots.forEach(renderConfig); renderHistory(); }
  function openHistory() { if (modal) return; modal = ctx.ui.showModal({ title: 'RPG Dice — histórico e cheats' }); modal.onDismiss(() => { modal = undefined; }); renderHistory(); request(); }
  diceButton.addEventListener('click', openHistory);
  const clamp = () => { const p = clampPosition(float.getPosition(), window.innerWidth, window.innerHeight); float.moveTo(p.x, p.y); };
  const dragOff = float.onDragEnd(p => { const position = clampPosition(p, window.innerWidth, window.innerHeight); float.moveTo(position.x, position.y); ctx.sendToBackend({ type: 'position', position }); });
  window.addEventListener('resize', clamp);
  const unsub = ctx.onBackendMessage(raw => {
    if (disposed || !raw || typeof raw !== 'object') return; const p = raw as Record<string, unknown>;
    if (p.type === 'audit') { request(); return; }
    if (p.requestId !== latestRequest) return;
    busy = false;
    if (p.type === 'error') { status = String(p.message); render(); return; }
    if (p.type === 'view') { view = p as unknown as View; status = ''; if (!positioned) { positioned = true; if (view.state.position) float.moveTo(view.state.position.x, view.state.position.y); clamp(); } render(); }
  });
  const offChat = ctx.events.on('CHAT_SWITCHED', () => { busy = false; view = undefined; render(); request(); });
  const offActivate = drawer.onActivate(() => request()); const offSettings = settingsTab?.onActivate(() => request());
  render(); request();
  return () => { disposed = true; unsub(); offChat(); offActivate(); offSettings?.(); dragOff(); window.removeEventListener('resize', clamp); modal?.dismiss(); for (const handle of modelMounts.values()) handle.destroy(); modelMounts.clear(); float.destroy(); settingsTab?.destroy(); drawer.destroy(); removeStyle(); };
}

