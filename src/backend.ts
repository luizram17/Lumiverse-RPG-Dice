import type { SpindleAPI } from 'lumiverse-spindle-types';
import { DiceEngine } from './engine';
declare const spindle: SpindleAPI;
const engine = new DiceEngine(spindle);
// Highest practical finite priority; later third-party interceptors can still modify prompts.
spindle.registerInterceptor((messages, context) => engine.intercept(messages, context), 2147483647, { required: true });
spindle.onFrontendMessage(async (raw, userId) => {
  if (!userId || !raw || typeof raw !== 'object') return;
  const payload = raw as Record<string, unknown>;
  try {
    if (payload.type === 'save') await engine.configure(userId, payload as never);
    if (payload.type === 'cheat' && typeof payload.chatId === 'string') await engine.setCheat(userId, payload.chatId, payload.outcome);
    if (payload.type === 'position') { await engine.position(userId, payload.position); return; }
    if (['load', 'save', 'cheat'].includes(String(payload.type))) spindle.sendToFrontend({ type: 'view', requestId: payload.requestId, ...await engine.view(userId, typeof payload.chatId === 'string' ? payload.chatId : undefined) }, userId);
  } catch (error) { spindle.sendToFrontend({ type: 'error', requestId: payload.requestId, message: error instanceof Error ? error.message : 'Falha no RPG Dice.' }, userId); }
});
