import type { SpindleFrontendContext } from 'lumiverse-spindle-types';
import type { DiceEngine, Audit } from './engine';
import { attributes, defaultSheet, modelOutcomes, outcomes, type Attribute, type Outcome, type PersonaSheet } from './rules';
import { defaultPromptTexts, mainNote, outcomeEffect, previewValues, promptFields, promptTexts, type PromptTexts } from './prompts';
import { rollLabel } from './engine';

type View = Awaited<ReturnType<DiceEngine['view']>>;
interface SkillDraft { id: string; name: string; description: string; bonus: string }
interface SheetDraft { attributes: Record<Attribute, string>; skills: SkillDraft[] }

export function clampPosition(p: { x: number; y: number }, width: number, height: number) {
  return { x: Math.max(0, Math.min(p.x, width - 56)), y: Math.max(0, Math.min(p.y, height - 56)) };
}

export function setup(ctx: SpindleFrontendContext) {
  const removeStyle = ctx.dom.addStyle(`
    .rpg-dice{font:14px/1.5 system-ui,sans-serif;color:var(--lumiverse-text,#e8e6ee);padding:16px;box-sizing:border-box}
    .rpg-dice h2{font-size:20px;margin:0 0 6px}.rpg-dice h3{font-size:15px;margin:22px 0 8px}.rpg-dice p{margin:6px 0 12px}
    .rpg-dice label{display:block;margin:10px 0}.rpg-dice input:not([type=checkbox]),.rpg-dice select,.rpg-dice textarea{box-sizing:border-box;width:100%;padding:9px;background:var(--lumiverse-fill,#262430);border:1px solid var(--lumiverse-border,#524b62);border-radius:8px;color:inherit;margin-top:4px}
    .rpg-dice textarea{resize:vertical;font:13px/1.5 ui-monospace,monospace;min-height:60px}.rpg-dice textarea[readonly]{opacity:.8;border-style:dashed}.rpg-dice details{margin:20px 0}.rpg-dice summary{cursor:pointer;font-weight:600}.rpg-dice .rpg-prompt-actions{display:flex;flex-wrap:wrap;gap:8px}
    .rpg-dice button{padding:9px 12px;border:1px solid var(--lumiverse-border,#6b6080);border-radius:9px;background:var(--lumiverse-fill,#292433);color:inherit;cursor:pointer}.rpg-dice button:disabled{opacity:.5;cursor:wait}.rpg-dice button[aria-pressed=true]{background:#644ba0;border-color:#c3a6ff;color:white}
    .rpg-dice .rpg-muted{font-size:12px;opacity:.75}.rpg-dice .rpg-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.rpg-dice .rpg-grid label{margin:0}.rpg-dice .rpg-status{min-height:22px;color:#cfb7ff;white-space:pre-wrap}.rpg-dice .rpg-log{max-height:50vh;overflow:auto;overscroll-behavior:contain}.rpg-dice article{border:1px solid var(--lumiverse-border,#524b62);border-radius:10px;margin:10px 0;padding:12px;overflow-wrap:anywhere}.rpg-dice article p{margin:5px 0}.rpg-dice .rpg-cheat{color:#ffd181;font-weight:700}.rpg-dice .rpg-toggle-grid{display:flex;flex-wrap:wrap;gap:6px}.rpg-dice .rpg-skill{border:1px solid var(--lumiverse-border,#524b62);border-radius:10px;padding:10px;margin:10px 0}.rpg-dice .rpg-skill-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.rpg-dice .rpg-skill-heading strong{overflow-wrap:anywhere}
    .rpg-dice-float{width:56px;height:56px;border-radius:16px;background:#272134;border:1px solid #ad8ee7;color:#f6edff;font-size:34px;cursor:grab;opacity:.6;box-shadow:0 5px 20px #0006;touch-action:none;transition:opacity .15s}.rpg-dice-float:hover,.rpg-dice-float:focus-visible{opacity:1;outline:2px solid #ceb0ff}
  `);
  const drawer = ctx.ui.registerDrawerTab({ id: 'rpg_dice', title: 'RPG Dice', shortName: 'Dados', description: 'Testes automáticos, histórico e ficha da persona', keywords: ['dados', 'rpg', '2d10', 'rolagem'] });
  // Some host versions do not have registerSettingsTab. Use their settings
  // mount when possible; the free drawer tab always remains accessible.
  let settingsTab: ReturnType<NonNullable<SpindleFrontendContext['ui']['registerSettingsTab']>> | undefined;
  try { settingsTab = ctx.ui.registerSettingsTab?.({ id: 'rpg_dice', title: 'RPG Dice', description: 'Perfil e modelo auxiliares, ficha, skills e dados automáticos', keywords: ['dados', 'modelo', 'persona'] }); } catch {}
  let settingsMount: HTMLElement | undefined;
  if (!settingsTab) { try { settingsMount = ctx.ui.mount('settings_extensions') as HTMLElement; } catch {} }
  // A declined/revoked ui_panels permission must not disable all settings UI.
  let float: ReturnType<SpindleFrontendContext['ui']['createFloatWidget']> | undefined;
  try { float = ctx.ui.createFloatWidget({ width: 56, height: 56, chromeless: true, snapToEdge: false, tooltip: 'RPG Dice — arraste para mover; clique para histórico' }); } catch {}
  const diceButton = document.createElement('button'); diceButton.className = 'rpg-dice-float'; diceButton.textContent = '⚄'; diceButton.setAttribute('aria-label', 'Abrir histórico de rolagens RPG Dice; arraste para mover'); float?.root.append(diceButton);

  let view: View | undefined; let selectedPersona = ''; let status = ''; let disposed = false;
  let modal: ReturnType<SpindleFrontendContext['ui']['showModal']> | undefined;
  let busy = false; let latestRequest = ''; let positioned = false;
  let promptDraft: PromptTexts | undefined; let submittedPrompts: PromptTexts | undefined;
  let submittedSheet: { personaId: string; sheet: PersonaSheet; revision: number } | undefined;
  let previewOutcome: Outcome = previewValues.outcome;
  const promptEditorOpen = new Map<HTMLElement, boolean>();
  const sheetDrafts = new Map<string, SheetDraft>();
  const sheetRevisions = new Map<string, number>();
  const roots = [drawer.root, ...(settingsTab ? [settingsTab.root] : []), ...(settingsMount ? [settingsMount] : [])];
  const modelMounts = new Map<HTMLElement, ReturnType<SpindleFrontendContext['components']['mountModelCombobox']>>();
  // crypto.randomUUID() is absent on insecure HTTP LAN origins.
  let requestNumber = 0; let newSkillNumber = 0;
  const request = (payload: Record<string, unknown> = {}) => { latestRequest = `rpg-dice-${++requestNumber}`; ctx.sendToBackend({ type: 'load', ...payload, requestId: latestRequest }); };

  function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') {
    const e = document.createElement(tag); e.textContent = text; if (className) e.className = className; return e;
  }
  function field(parent: HTMLElement, title: string, control: HTMLElement) {
    const label = element('label', title); label.append(control); parent.append(label);
  }
  function showStatus(message: string) {
    status = message;
    for (const root of roots) { const target = root.querySelector('.rpg-status'); if (target) target.textContent = message; }
    if (modal) { const target = modal.root.querySelector('.rpg-status'); if (target) target.textContent = message; }
  }
  function save(payload: Record<string, unknown>) {
    busy = true; showStatus('Salvando… Se há análise em andamento, aguarde sua conclusão ou cancele o turno no Lumiverse.');
    request({ type: 'save', ...payload });
  }
  function draftFor(personaId: string): SheetDraft {
    let draft = sheetDrafts.get(personaId);
    if (!draft) {
      const saved = view?.state.personas[personaId] || defaultSheet();
      draft = {
        attributes: Object.fromEntries(attributes.map(a => [a, String(saved.attributes[a])])) as Record<Attribute, string>,
        skills: saved.skills.map(s => ({ id: s.id, name: s.name, description: s.description, bonus: String(s.bonus) })),
      };
      sheetDrafts.set(personaId, draft);
    }
    return draft;
  }
  function touchSheet(personaId: string, sourceRoot?: HTMLElement) {
    sheetRevisions.set(personaId, (sheetRevisions.get(personaId) || 0) + 1);
    const draft = sheetDrafts.get(personaId); if (!draft) return;
    // Keep the drawer and settings forms in sync without rebuilding the active
    // root, which would drop focus and interrupt multi-character input.
    for (const root of roots) {
      if (root === sourceRoot) continue;
      for (const attribute of attributes) {
        const input = root.querySelector<HTMLInputElement>(`[data-attribute="${attribute}"]`);
        if (input && input.value !== draft.attributes[attribute]) input.value = draft.attributes[attribute];
      }
      const count = root.querySelector<HTMLElement>('[data-skill-count]');
      if (count) count.textContent = `Skills (${draft.skills.length})`;
      draft.skills.forEach((skill, index) => {
        const card = Array.from(root.querySelectorAll<HTMLElement>('section[data-skill-id]')).find(item => item.dataset.skillId === skill.id);
        if (!card) return;
        const name = card.querySelector<HTMLInputElement>('[data-skill-name]'); if (name && name.value !== skill.name) name.value = skill.name;
        const description = card.querySelector<HTMLTextAreaElement>('[data-skill-description]'); if (description && description.value !== skill.description) description.value = skill.description;
        const bonus = card.querySelector<HTMLInputElement>('[data-skill-bonus]'); if (bonus && bonus.value !== skill.bonus) bonus.value = skill.bonus;
        const heading = card.querySelector('strong'); if (heading) heading.textContent = skill.name || `Skill ${index + 1}`;
      });
    }
  }
  function draftToSheet(draft: SheetDraft): PersonaSheet | undefined {
    const attributeValues: Record<string, number> = {};
    for (const a of attributes) {
      const raw = draft.attributes[a]; const value = Number(raw);
      if (!raw.trim() || !Number.isSafeInteger(value)) { showStatus(`${a}: informe um inteiro seguro, positivo, zero ou negativo.`); return undefined; }
      attributeValues[a] = value;
    }
    const ids = new Set<string>(); const skills: PersonaSheet['skills'] = [];
    for (const skill of draft.skills) {
      const bonus = Number(skill.bonus);
      if (!skill.id || ids.has(skill.id)) { showStatus('Cada skill precisa ter um ID estável e único.'); return undefined; }
      if (!skill.bonus.trim() || !Number.isSafeInteger(bonus)) { showStatus(`Bônus da skill “${skill.name}”: informe um inteiro seguro, positivo, zero ou negativo.`); return undefined; }
      ids.add(skill.id); skills.push({ id: skill.id, name: skill.name, description: skill.description, bonus });
    }
    return { attributes: attributeValues as PersonaSheet['attributes'], skills };
  }
  function refreshPromptEditors() {
    const texts = promptDraft || promptTexts(view?.state.prompts);
    for (const root of roots) {
      for (const input of root.querySelectorAll<HTMLTextAreaElement>('textarea[data-prompt-key]')) {
        const value = texts[input.dataset.promptKey as keyof PromptTexts]; if (input.value !== value) input.value = value;
      }
      const preview = root.querySelector<HTMLTextAreaElement>('[data-prompt-preview]');
      if (preview) preview.value = mainNote(texts, { ...previewValues, outcome: previewOutcome });
      const selector = root.querySelector<HTMLSelectElement>('[data-preview-outcome]'); if (selector) selector.value = previewOutcome;
      const category = root.querySelector<HTMLTextAreaElement>('[data-preview-category]'); if (category) category.value = modelOutcomes[previewOutcome].label;
    }
  }
  function renderPromptEditors(panel: HTMLElement, open: boolean) {
    const details = element('details'); details.open = open; details.dataset.promptEditor = '';
    details.append(element('summary', 'Editar textos enviados aos modelos')); panel.append(details);
    details.append(element('p', 'Edite o papel do árbitro, o contrato de regras e os textos da nota principal e dos efeitos. Os padrões estão em inglês; você pode escrever no idioma que preferir. Espaços e quebras de linha são preservados. Salve para aplicar nesta conta.'));
    details.append(element('p', 'Os campos tracejados são exemplos somente leitura. Persona, atributo, modificadores, ação e categoria vêm dos dados e do código. Não há substituição de marcadores nem execução de templates. A prévia não chama modelos nem sorteia dados.', 'rpg-muted'));
    const texts = promptDraft || promptTexts(view?.state.prompts);
    const dynamic: Partial<Record<keyof PromptTexts, [string, string]>> = {
      mainOpening: ['Nome da persona · variável protegida (exemplo)', previewValues.persona],
      mainBeforeApproach: ['Atributo e modificadores · variável protegida (exemplo; chave mantida por compatibilidade)', previewValues.attribute],
      mainBeforeAction: ['Ação · variável protegida (exemplo)', previewValues.action],
      mainBeforeResult: ['Categoria · variável protegida (exemplo)', modelOutcomes[previewOutcome].label],
    };
    const readOnly = (label: string, value: string, rows = 2) => {
      const output = element('textarea'); output.readOnly = true; output.value = value; output.rows = rows; field(details, label, output); return output;
    };
    for (const spec of promptFields) {
      const input = element('textarea'); input.value = texts[spec.key]; input.rows = spec.key.startsWith('referee') ? 14 : 2;
      input.maxLength = spec.limit; input.dataset.promptKey = spec.key;
      input.addEventListener('input', () => { promptDraft = { ...(promptDraft || promptTexts(view?.state.prompts)), [spec.key]: input.value }; refreshPromptEditors(); });
      field(details, `${spec.label} (até ${spec.limit} caracteres)`, input);
      if (spec.key === 'refereeSystem') {
        details.append(element('p', 'Este campo contém o papel do auxiliar e as diretrizes de OOC. O contrato editável abaixo é enviado depois dele, separado por duas quebras de linha.', 'rpg-muted'));
      }
      if (spec.key === 'refereeContract') {
        details.append(element('p', 'O contrato pode ser editado para orientar o auxiliar. A validação e a resolução imutáveis do código sempre prevalecem sobre qualquer instrução deste texto.', 'rpg-muted'));
        readOnly('Contrato aplicado pelo código — esquema da decisão', JSON.stringify({ roll: false, reason: '<motivo curto>' }, null, 2) + '\n' + JSON.stringify({ roll: true, attribute: '<STRENGTH|DEXTERITY|CONSTITUTION|INTELLIGENCE|CHARISMA|WISDOM>', skillCandidates: [{ id: '<id>', relevance: 'full|partial' }], difficulty: 15, action: '<objetivo>', reason: '<risco e justificativa>' }, null, 2), 8);
        readOnly('Contexto user enviado ao auxiliar — estrutura de exemplo', JSON.stringify({ persona: { id: '<id>', name: '<nome>', title: '<título>', description: '<descrição>' }, attributes: { STRENGTH: 0, DEXTERITY: 0, CONSTITUTION: 0, INTELLIGENCE: 0, CHARISMA: 0, WISDOM: 0 }, skills: [{ id: '<id>', name: '<nome>', description: '<descrição>', bonus: 0 }], history: [{ id: '<id>', role: '<papel>', name: '<nome>', content: '<histórico>' }], latestAction: { messageId: '<id>', personaId: '<id>', text: '<ação atual>', ooc: ['<instruções OOC>'] } }, null, 2), 10);
        details.append(element('p', 'A nota do principal continua dentro de ((...)) e usa a categoria resolvida pelo código. O trecho CHEAT só entra nos testes que já possuem CHEAT. O efeito narrativo usa o texto editado da categoria obtida.', 'rpg-muted'));
      }
      const slot = dynamic[spec.key]; if (slot) { const output = readOnly(...slot); if (spec.key === 'mainBeforeResult') output.dataset.previewCategory = ''; }
    }
    const selector = element('select'); selector.dataset.previewOutcome = '';
    for (const outcome of outcomes) selector.append(new Option(outcome, outcome)); selector.value = previewOutcome;
    selector.addEventListener('change', () => { previewOutcome = selector.value as Outcome; refreshPromptEditors(); });
    field(details, 'Resultado da prévia — somente exemplo, não altera rolagens nem cheats', selector);
    const preview = readOnly('Prévia da nota final — exemplo com CHEAT (somente leitura)', mainNote(texts, { ...previewValues, outcome: previewOutcome }), 7); preview.dataset.promptPreview = '';
    const actions = element('div', '', 'rpg-prompt-actions');
    const saveTexts = element('button', 'Salvar textos dos modelos'); saveTexts.disabled = busy;
    saveTexts.addEventListener('click', () => { if (busy) return; submittedPrompts = { ...(promptDraft || promptTexts(view?.state.prompts)) }; save({ prompts: submittedPrompts }); });
    const resetTexts = element('button', 'Restaurar e salvar textos padrão'); resetTexts.disabled = busy;
    resetTexts.addEventListener('click', () => { if (busy) return; promptDraft = defaultPromptTexts(); submittedPrompts = { ...promptDraft }; refreshPromptEditors(); save({ resetPrompts: true }); });
    actions.append(saveTexts, resetTexts);
    details.append(actions, element('p', 'Restaurar salva somente os textos padrão desta conta. Fichas, conexão, histórico, resultados e cheats são preservados. Textos salvos também se aplicam ao reutilizar um resultado antigo; a rolagem antiga permanece igual.', 'rpg-muted'));
  }
  function renderSheet(panel: HTMLElement, root: HTMLElement) {
    panel.append(element('h3', 'Ficha por persona'));
    const persona = element('select'); persona.dataset.personaSelector = '';
    for (const p of view!.personas) persona.append(new Option(p.name, p.id));
    if (!view!.personas.some(p => p.id === selectedPersona)) selectedPersona = view!.personas[0]?.id || '';
    persona.value = selectedPersona; field(panel, 'Persona', persona);
    persona.addEventListener('change', () => { selectedPersona = persona.value; render(); });
    if (!selectedPersona) { panel.append(element('p', 'Nenhuma persona disponível neste chat.')); return; }

    const draft = draftFor(selectedPersona);
    if (view!.state.legacyPersonas?.[selectedPersona]) {
      panel.append(element('p', 'Esta persona tinha uma ficha Fate antiga, arquivada durante a migração. Ela não foi convertida para atributos; configure a nova ficha 2d10. Os dados antigos continuam preservados no arquivo de migração.', 'rpg-muted'));
    }
    const grid = element('div', '', 'rpg-grid');
    for (const attribute of attributes) {
      const input = element('input'); input.type = 'number'; input.step = '1'; input.value = draft.attributes[attribute];
      input.dataset.attribute = attribute;
      input.addEventListener('input', () => { draft.attributes[attribute] = input.value; touchSheet(selectedPersona, root); });
      field(grid, attribute, input);
    }
    panel.append(grid, element('p', 'Todos os atributos começam em 0. Use qualquer inteiro seguro, positivo, zero ou negativo; os valores não têm teto de jogo nem redistribuição automática. A ficha pertence ao ID estável da persona nesta conta.', 'rpg-muted'));

    const skillCount = element('h4', `Skills (${draft.skills.length})`); skillCount.dataset.skillCount = ''; panel.append(skillCount);
    for (const [index, skill] of draft.skills.entries()) {
      const card = element('section', '', 'rpg-skill'); card.dataset.skillId = skill.id;
      const heading = element('div', '', 'rpg-skill-heading'); heading.append(element('strong', skill.name || `Skill ${index + 1}`));
      const remove = element('button', 'Remover skill'); remove.type = 'button'; remove.dataset.removeSkill = String(index);
      remove.addEventListener('click', () => { draft.skills.splice(index, 1); touchSheet(selectedPersona); render(); });
      heading.append(remove); card.append(heading);
      const name = element('input'); name.type = 'text'; name.value = skill.name; name.dataset.skillName = String(index);
      name.addEventListener('input', () => { skill.name = name.value; const title = card.querySelector('strong'); if (title) title.textContent = skill.name || `Skill ${index + 1}`; touchSheet(selectedPersona, root); });
      field(card, 'Nome', name);
      const description = element('textarea'); description.value = skill.description; description.rows = 3; description.dataset.skillDescription = String(index);
      description.addEventListener('input', () => { skill.description = description.value; touchSheet(selectedPersona, root); });
      field(card, 'Descrição', description);
      const bonus = element('input'); bonus.type = 'number'; bonus.step = '1'; bonus.value = skill.bonus; bonus.dataset.skillBonus = String(index);
      bonus.addEventListener('input', () => { skill.bonus = bonus.value; touchSheet(selectedPersona, root); });
      field(card, 'Bônus inteiro', bonus);
      panel.append(card);
    }
    const addSkill = element('button', 'Adicionar skill'); addSkill.type = 'button';
    addSkill.addEventListener('click', () => {
      let id = '';
      do { id = `skill-local-${++newSkillNumber}`; } while (draft.skills.some(s => s.id === id));
      draft.skills.push({ id, name: '', description: '', bonus: '0' }); touchSheet(selectedPersona); render();
    });
    panel.append(addSkill);
    const saveSheet = element('button', 'Salvar ficha da persona'); saveSheet.disabled = busy; saveSheet.dataset.saveSheet = '';
    saveSheet.addEventListener('click', () => {
      if (busy || !selectedPersona) return;
      const sheet = draftToSheet(draft); if (!sheet) return;
      submittedSheet = { personaId: selectedPersona, sheet, revision: sheetRevisions.get(selectedPersona) || 0 };
      save({ personaId: selectedPersona, sheet });
    });
    panel.append(saveSheet);
  }
  function renderConfig(root: HTMLElement) {
    const previousEditor = root.querySelector<HTMLDetailsElement>('[data-prompt-editor]');
    if (previousEditor) promptEditorOpen.set(root, previousEditor.open);
    modelMounts.get(root)?.destroy(); modelMounts.delete(root);
    root.replaceChildren(); const panel = element('div', '', 'rpg-dice'); root.append(panel);
    panel.append(element('h2', 'RPG Dice'), element('p', 'Sistema 2d10: o auxiliar escolhe o atributo e classifica skills candidatas; o código aplica a regra da melhor skill, sorteia e resolve o resultado.'), element('p', status, 'rpg-status'));
    if (!float) panel.append(element('p', 'Dado flutuante indisponível: conceda a permissão ui_panels em Extensões → RPG Dice. Você ainda pode configurar e abrir o histórico por esta aba.', 'rpg-muted'));
    if (!view) {
      panel.append(element('p', status ? 'Falha ao carregar. Verifique se a extensão está habilitada e tente novamente.' : 'Carregando configurações…'));
      const retry = element('button', 'Recarregar'); retry.addEventListener('click', () => request()); panel.append(retry); return;
    }
    if (!view.supported) panel.append(element('p', 'Lumiverse incompatível. Atualize para uma versão com interceptores obrigatórios antes de habilitar.'));
    const enabled = element('input'); enabled.type = 'checkbox'; enabled.checked = view.state.settings.enabled; enabled.disabled = !view.supported;
    field(panel, ' Habilitar testes automáticos ', enabled);
    const connection = element('select'); connection.append(new Option('Selecione o perfil auxiliar', ''));
    for (const c of view.connections) connection.append(new Option(`${c.name} · ${c.provider}`, c.id));
    connection.value = view.state.settings.connectionId; field(panel, 'Perfil de conexão auxiliar', connection);
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
    const saveSettings = element('button', 'Salvar configurações'); saveSettings.disabled = busy;
    saveSettings.addEventListener('click', () => save({ settings: { enabled: enabled.checked, connectionId: connection.value, model: modelMounts.get(root)?.getValue() || modelValue } })); panel.append(saveSettings);

    renderSheet(panel, root);
    panel.append(element('h3', 'Rolagem e cheats'));
    const open = element('button', 'Abrir histórico e cheats'); open.addEventListener('click', openHistory); panel.append(open);
    panel.append(element('p', '2d10 + atributo + bônus de uma skill selecionada. Skill full usa o bônus inteiro; partial usa metade e mantém frações. Crítico natural: 10 e 10. Sem crítico: total ≥ DT é sucesso; DT−4 até abaixo da DT é parcial; abaixo disso é falha. DT sugeridas: 5 trivial, 10 fácil, 15 moderada, 20 difícil, 25 muito difícil, 30 heroica e 35 lendária.', 'rpg-muted'));
    renderPromptEditors(panel, promptEditorOpen.get(root) || false);
  }
  function formatModifier(value: number | undefined) {
    if (value === undefined) return 'não registrado'; return value >= 0 ? `+${value}` : String(value);
  }
  function auditArticle(audit: Audit) {
    const card = element('article'); const r = audit.roll!;
    card.append(element('strong', `${audit.personaName} · ${r.outcome}`), element('p', new Date(audit.timestamp).toLocaleString('pt-BR'), 'rpg-muted'));
    if (audit.fudge) card.append(element('p', `CHEAT — resultado garantido: ${audit.fudge.requested}. Categoria natural: ${audit.fudge.naturalOutcome}.`, 'rpg-cheat'));
    const isLegacy = r.ruleset !== '2d10';
    if (isLegacy) {
      card.append(element('p', `Legado 4dF: [${r.dice.join(', ')}] = ${r.diceTotal}; ${rollLabel(audit)}; atributo numérico ${formatModifier(r.attribute)}; bônus contextual legado ${formatModifier(r.bonus)}; total ${r.total}; DT ${r.difficulty}.`));
    } else {
      const skill = r.skill
        ? `${r.skill.name} — bônus original ${formatModifier(r.skill.bonus)}, aplicado ${formatModifier(r.skill.appliedBonus)} (${r.skill.relevance})`
        : 'nenhuma skill aplicada';
      card.append(element('p', `2d10: [${r.dice.join(', ')}] = ${r.diceTotal}; ${rollLabel(audit)}; atributo numérico ${formatModifier(r.attribute)}; skill ${skill}; total ${r.total}; DT ${r.difficulty}.`));
    }
    card.append(element('p', `Significado gravado: ${r.meaning}`), element('p', `Efeito (texto atual): ${outcomeEffect(promptTexts(view?.state.prompts), r.outcome as Outcome)}`), element('p', `Ação: ${audit.decision.action}`), element('p', `Motivo: ${audit.decision.reason}`, 'rpg-muted'));
    return card;
  }
  function renderHistory() {
    if (!modal) return;
    const panel = element('div', '', 'rpg-dice'); modal.root.replaceChildren(panel);
    panel.append(element('p', view?.chat ? `Chat: ${view.chat.name}` : 'Abra um chat para ver as rolagens.'), element('p', status, 'rpg-status'));
    if (!view?.chat || !view.ledger) return;
    panel.append(element('h3', 'Cheats deste chat'), element('p', 'Enquanto estiver ativo, o cheat garante o resultado em toda nova rolagem. Só desativa manualmente: clique no botão ativo para desligar ou selecione outro resultado.', 'rpg-muted'));
    const toggles = element('div', '', 'rpg-toggle-grid'); const chatId = view.chat.id;
    for (const outcome of outcomes) {
      const b = element('button', outcome); b.setAttribute('aria-pressed', String(view.ledger.activeCheat === outcome)); b.disabled = busy;
      b.addEventListener('click', () => {
        if (busy) return; busy = true; for (const button of toggles.querySelectorAll('button')) button.disabled = true;
        showStatus('Salvando cheat…'); request({ type: 'cheat', chatId, outcome: view!.ledger!.activeCheat === outcome ? null : outcome });
      }); toggles.append(b);
    }
    panel.append(toggles, element('p', 'Os dados e o total natural continuam visíveis. O resultado escolhido prevalece, marcado como CHEAT no histórico e no prompt. Regenerar uma resposta mantém o teste já feito.', 'rpg-muted'));
    const log = element('div', '', 'rpg-log'); log.setAttribute('aria-label', 'Histórico de rolagens');
    const rolls = view.ledger.records.filter(a => a.roll).reverse();
    if (!rolls.length) log.append(element('p', 'Ainda não há rolagens neste chat.'));
    for (const audit of rolls) log.append(auditArticle(audit));
    panel.append(element('h3', `${rolls.length} rolagem(ns)`), log);
  }
  function render() { roots.forEach(renderConfig); renderHistory(); }
  function openHistory() {
    if (modal) return; modal = ctx.ui.showModal({ title: 'RPG Dice — histórico e cheats' });
    modal.onDismiss(() => { modal = undefined; }); renderHistory(); request();
  }
  diceButton.addEventListener('click', openHistory);
  const clamp = () => { if (!float) return; const p = clampPosition(float.getPosition(), window.innerWidth, window.innerHeight); float.moveTo(p.x, p.y); };
  const dragOff = float?.onDragEnd(p => {
    if (!float) return; const position = clampPosition(p, window.innerWidth, window.innerHeight); float.moveTo(position.x, position.y); ctx.sendToBackend({ type: 'position', position });
  }) ?? (() => {});
  window.addEventListener('resize', clamp);
  const unsub = ctx.onBackendMessage(raw => {
    if (disposed || !raw || typeof raw !== 'object') return;
    const p = raw as Record<string, unknown>;
    if (p.type === 'audit') { request(); return; }
    if (p.requestId !== latestRequest) return;
    busy = false;
    if (p.type === 'error') { submittedPrompts = undefined; submittedSheet = undefined; status = String(p.message); render(); return; }
    if (p.type === 'view') {
      view = p as unknown as View; status = '';
      if (submittedPrompts && JSON.stringify(promptTexts(view.state.prompts)) === JSON.stringify(submittedPrompts)) {
        if (JSON.stringify(promptDraft || submittedPrompts) === JSON.stringify(submittedPrompts)) promptDraft = undefined;
        submittedPrompts = undefined;
      }
      if (submittedSheet) {
        const saved = view.state.personas[submittedSheet.personaId];
        if (saved && JSON.stringify(saved) === JSON.stringify(submittedSheet.sheet)) {
          if ((sheetRevisions.get(submittedSheet.personaId) || 0) === submittedSheet.revision) sheetDrafts.delete(submittedSheet.personaId);
          submittedSheet = undefined;
        }
      }
      if (!positioned) { positioned = true; if (view.state.position) float?.moveTo(view.state.position.x, view.state.position.y); clamp(); }
      render();
    }
  });
  const offChat = ctx.events.on('CHAT_SWITCHED', () => { busy = false; view = undefined; render(); request(); });
  const offActivate = drawer.onActivate(() => request()); const offSettings = settingsTab?.onActivate(() => request());
  render(); request();
  return () => {
    disposed = true; unsub(); offChat(); offActivate(); offSettings?.(); dragOff(); window.removeEventListener('resize', clamp); modal?.dismiss();
    for (const handle of modelMounts.values()) handle.destroy(); modelMounts.clear(); float?.destroy(); settingsTab?.destroy(); drawer.destroy(); removeStyle();
  };
}
