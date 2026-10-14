import type { SpindleAPI, InterceptorContextDTO, LlmMessageDTO, PersonaDTO } from 'lumiverse-spindle-types';
import { defaultScores, fateDice, forcedOoc, forceOutcome, outcomes, oocParts, parseDecision, refereePrompt, resolveRoll, validateScores, type Decision, type Roll, type Scores, type Fudge, type Outcome } from './rules';
export interface Settings { enabled: boolean; connectionId: string; model: string }
export interface Audit { key: string; chatId: string; personaId: string; personaName: string; messageId: string; actionText: string; timestamp: string; decision: Decision; roll?: Roll; fudge?: Fudge; connectionId: string; model: string }
export interface State { version: 1; settings: Settings; personas: Record<string, Scores>; position?: { x: number; y: number } }
export interface Ledger { version: 1; activeCheat: Outcome | null; records: Audit[] }
const initial = (): State => ({ version: 1, settings: { enabled: false, connectionId: '', model: '' }, personas: {} });
type ChatMessage = Awaited<ReturnType<SpindleAPI['chat']['getMessages']>>[number];
export function selectHistory(all: ChatMessage[], prompt: LlmMessageDTO[], context: Pick<InterceptorContextDTO, 'excludeMessageId' | 'generationType'>): { history: ChatMessage[]; latest?: ChatMessage } {
  const sorted = [...all].sort((a, b) => a.index_in_chat - b.index_in_chat);
  const refs = prompt.filter(m => m.__isChatHistory && m.sourceMessageId);
  if (!refs.length) throw Error('O prompt não expõe a origem das mensagens. Use um preset com histórico do chat.');
  const indices = refs.map(m => sorted.findIndex(s => s.id === m.sourceMessageId)).filter(i => i >= 0);
  if (!indices.length) throw Error('Não foi possível alinhar o histórico com o turno atual.');
  let boundary = Math.max(...indices);
  if (context.excludeMessageId) { const excluded = sorted.findIndex(m => m.id === context.excludeMessageId); if (excluded >= 0) boundary = Math.min(boundary, excluded - 1); }
  let history = sorted.slice(0, boundary + 1);
  // The host currently uses separate chat IDs for branches. Also honor an explicit ancestry chain when supplied.
  const tip = history.at(-1);
  if (tip?.parent_message_id) { const chain = new Set<string>(); let current: ChatMessage | undefined = tip; while (current) { if (chain.has(current.id)) throw Error('Histórico circular inválido.'); chain.add(current.id); current = history.find(m => m.id === current!.parent_message_id); } history = history.filter(m => chain.has(m.id)); }
  const latest = history.findLast(m => m.role === 'user');
  return { history, latest };
}
async function digest(text: string): Promise<string> { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))).map(b => b.toString(16).padStart(2, '0')).join(''); }
function cleanInline(text: string): string { return text.replace(/[\r\n]+/g, ' ').replace(/\(\(|\)\)/g, '').slice(0, 160); }
export function inject(messages: LlmMessageDTO[], audit: Audit) {
  if (!audit.roll) return { messages };
  const r = audit.roll;
  const cheat = audit.fudge ? ' CHEAT autorizado: resultado garantido por OOC, prevalece sobre a comparação numérica.' : '';
  const note = `((Teste de habilidade feito automaticamente para personagem ${cleanInline(audit.personaName)} (${audit.decision.approach}). Ação: ${cleanInline(audit.decision.action || '')}. Resultado: ${r.outcome} — ${r.meaning}.${cheat} Respeite todo OOC; não refaça nem reclassifique o teste.))`;
  return { messages: [...messages, { role: 'user' as const, content: note }], breakdown: [{ messageIndex: messages.length, name: 'RPG Dice — resultado automático' }] };
}
export class DiceEngine {
  private locks = new Map<string, Promise<unknown>>();
  constructor(private api: SpindleAPI, private random = fateDice) {}
  supported(): boolean { return (this.api.host.capabilities['required-interceptors-v1'] || 0) >= 1; }
  private async readJson<T>(userId: string, path: string, fallback: T): Promise<T> { if (!await this.api.userStorage.exists(path, userId)) return fallback; return JSON.parse(await this.api.userStorage.read(path, userId)) as T; }
  private async atomicJson(userId: string, path: string, value: unknown) { const temp = `${path}.pending`; await this.api.userStorage.write(temp, JSON.stringify(value), userId); await this.api.userStorage.move(temp, path, userId); }
  async load(userId: string): Promise<State> { return this.readJson(userId, 'state.json', initial()); }
  async save(userId: string, state: State) { await this.atomicJson(userId, 'state.json', state); }
  private async ledgerPath(chatId: string) { return `chats/${await digest(chatId)}.json`; }
  async ledger(userId: string, chatId: string): Promise<Ledger> { return this.readJson(userId, await this.ledgerPath(chatId), { version: 1 as const, activeCheat: null, records: [] }); }
  async setCheat(userId: string, chatId: string, outcome: unknown) { return this.locked(`user:${userId}`, async () => { if (!await this.api.chats.get(chatId, userId)) throw Error('Chat não encontrado.'); if (outcome !== null && !outcomes.includes(outcome as Outcome)) throw Error('Resultado inválido.'); const ledger = await this.ledger(userId, chatId); ledger.activeCheat = outcome as Outcome | null; await this.atomicJson(userId, await this.ledgerPath(chatId), ledger); }); }
  async position(userId: string, value: unknown) { const p = value as { x: number; y: number }; if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw Error('Posição inválida.'); await this.locked(`user:${userId}`, async () => { const state = await this.load(userId); state.position = { x: Math.max(0, p.x), y: Math.max(0, p.y) }; await this.save(userId, state); }); }
  private async locked<T>(key: string, fn: () => Promise<T>): Promise<T> { const prev = this.locks.get(key) || Promise.resolve(); const next = prev.catch(() => {}).then(fn); this.locks.set(key, next); try { return await next; } finally { if (this.locks.get(key) === next) this.locks.delete(key); } }
  async configure(userId: string, payload: { settings?: Settings; personaId?: string; scores?: unknown }) {
    return this.locked(`user:${userId}`, async () => {
      const state = await this.load(userId);
      if (payload.settings) { const s = payload.settings; if (typeof s.enabled !== 'boolean' || typeof s.connectionId !== 'string' || typeof s.model !== 'string' || s.model.length > 200) throw Error('Configuração inválida.'); if (s.enabled) { if (!this.supported()) throw Error('Lumiverse incompatível: faltam interceptores obrigatórios.'); if (!s.connectionId || !s.model.trim() || !await this.api.connections.get(s.connectionId, userId)) throw Error('Selecione um perfil válido e informe o modelo auxiliar.'); } state.settings = { enabled: s.enabled, connectionId: s.connectionId, model: s.model.trim() }; }
      if (payload.personaId) { if (!await this.api.personas.get(payload.personaId, userId)) throw Error('Persona não encontrada.'); state.personas[payload.personaId] = validateScores(payload.scores); }
      await this.save(userId, state); return state;
    });
  }
  async view(userId: string, chatId?: string) {
    const [state, connections, activeChat] = await Promise.all([this.load(userId), this.api.connections.list(userId), chatId ? this.api.chats.get(chatId, userId) : this.api.chats.getActive(userId)]);
    const personas: PersonaDTO[] = []; let total = 0;
    do { const page = await this.api.personas.list({ userId, limit: 200, offset: personas.length }); total = page.total; if (!page.data.length && personas.length < total) throw Error('Não foi possível carregar todas as personas. Reabra RPG Dice.'); personas.push(...page.data); } while (personas.length < total);
    // Only this allowlist crosses to the browser; no endpoint, metadata or key.
    const ledger = activeChat ? await this.ledger(userId, activeChat.id) : null;
    return { state, supported: this.supported(), connections: connections.map(c => ({ id: c.id, name: c.name, provider: c.provider, model: c.model })), personas: personas.map(p => ({ id: p.id, name: p.name })), chat: activeChat ? { id: activeChat.id, name: activeChat.name } : null, ledger };
  }
  async intercept(messages: LlmMessageDTO[], context: InterceptorContextDTO) {
    if (context.isDryRun || !['normal', 'regenerate', 'continue', 'swipe'].includes(context.generationType)) return { messages };
    const userId = context.userId;
    if (!userId) throw Error('RPG Dice: usuário do turno ausente.');
    return this.locked(`user:${userId}`, async () => {
      const state = await this.load(userId); if (!state.settings.enabled) return { messages };
      try {
        if (!this.supported()) throw Error('Atualize o Lumiverse: interceptores obrigatórios indisponíveis.');
        context.signal.throwIfAborted();
        if (!context.chatId || !context.personaId) throw Error('Selecione uma persona e abra um chat para usar RPG Dice.');
        const persona = await this.api.personas.get(context.personaId, userId); if (!persona) throw Error('Persona do turno não encontrada.');
        const { history, latest } = selectHistory(await this.api.chat.getMessages(context.chatId), messages, context);
        if (!latest) return { messages };
        const key = await digest(JSON.stringify([context.chatId, persona.id, latest.id, latest.content]));
        const ledger = await this.ledger(userId, context.chatId);
        const cached = ledger.records.find(r => r.key === key);
        if (cached) { context.signal.throwIfAborted(); return inject(messages, cached); }
        // A continuation/regeneration never creates a new chance for an old action.
        if (context.generationType !== 'normal') return { messages };
        const scores = state.personas[persona.id] || defaultScores();
        if (!state.personas[persona.id]) { state.personas[persona.id] = scores; await this.save(userId, state); }
        let decision: Decision;
        if (forcedOoc(latest.content)) decision = { roll: false, reason: 'OOC prioritário determina o resultado ou dispensa o teste.' };
        else decision = await this.ask(state.settings, persona, history, latest, scores, context);
        context.signal.throwIfAborted();
        const audit: Audit = { key, chatId: context.chatId, personaId: persona.id, personaName: persona.name, messageId: latest.id, actionText: latest.content, timestamp: new Date().toISOString(), decision, connectionId: state.settings.connectionId, model: state.settings.model };
        if (decision.roll) { const attribute = validateScores(scores)[decision.approach!]; const natural = resolveRoll(this.random(), attribute, decision.bonus!, decision.difficulty!); if (ledger.activeCheat) { const result = forceOutcome(natural, ledger.activeCheat); audit.roll = result.roll; audit.fudge = result.fudge; } else audit.roll = natural; }
        context.signal.throwIfAborted();
        // Persist the result BEFORE returning any prompt to the main model.
        ledger.records.push(audit);
        // Cheat stays active until the user explicitly changes it. Cache/history use one atomic checkpoint.
        await this.atomicJson(userId, await this.ledgerPath(context.chatId), ledger);
        context.signal.throwIfAborted(); this.api.sendToFrontend({ type: 'audit', audit }, userId);
        return inject(messages, audit);
      } catch (error) {
        this.api.toast.error('Turno interrompido: a análise do RPG Dice falhou ou foi cancelada. Tente novamente; nenhum resultado foi inventado. Você pode desativar RPG Dice para continuar sem testes.', { title: 'RPG Dice', userId });
        throw error;
      }
    });
  }
  private async ask(settings: Settings, persona: PersonaDTO, history: ChatMessage[], latest: ChatMessage, scores: Scores, context: InterceptorContextDTO): Promise<Decision> {
    if (!settings.connectionId || !settings.model || !await this.api.connections.get(settings.connectionId, context.userId)) throw Error('Perfil auxiliar removido ou não configurado.');
    const controller = new AbortController(); const abort = () => controller.abort(context.signal.reason); context.signal.addEventListener('abort', abort, { once: true }); if (context.signal.aborted) abort();
    const timer = setTimeout(() => controller.abort(Error('Tempo limite da análise auxiliar (110 s).')), 110000);
    try {
      const contextData = { persona: { id: persona.id, name: persona.name, title: persona.title, description: persona.description }, savedApproaches: scores, history: history.map(m => ({ id: m.id, role: m.role, name: m.name, content: m.content })), latestAction: { messageId: latest.id, personaId: persona.id, text: latest.content, ooc: oocParts(latest.content) } };
      // SDK 0.6.40 omits raw provider/model from its DTO; both are implemented by the pinned host worker and direct-generation service.
      const request = { type: 'raw' as const, provider: '', model: settings.model, connection_id: settings.connectionId, userId: context.userId, messages: [{ role: 'system' as const, content: refereePrompt }, { role: 'user' as const, content: JSON.stringify(contextData) }], parameters: { temperature: 0, max_tokens: 1800 }, signal: controller.signal };
      const result = await this.api.generate.raw(request) as { content?: unknown };
      controller.signal.throwIfAborted(); if (typeof result?.content !== 'string') throw Error('Resposta auxiliar sem conteúdo.'); return parseDecision(result.content);
    } finally { clearTimeout(timer); context.signal.removeEventListener('abort', abort); }
  }
}

