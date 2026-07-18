import { callBackend } from '../utils/ST_api';
import { getActiveWorldId } from '../utils/helpers';

const SillyTavern = (globalThis as any).SillyTavern;

// The interceptor stashes what it matched for the turn in flight; GENERATION_ENDED pairs it
// with the bot reply and ships it to /observe. Quiet/engine generations never stash, so they
// never observe — the filtering falls out of the stash itself.
let pendingTurn: { npcIds: string[]; userMessage: string } | null = null;

export function rememberTurn(npcIds: string[], userMessage: string) {
    pendingTurn = { npcIds, userMessage };
}

export function initObserver() {
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.GENERATION_ENDED, onGenerationEnded);
    console.log('[NPC ENGINE] Observer registered');
}

async function onGenerationEnded() {
    if (!pendingTurn) return;
    const { npcIds, userMessage } = pendingTurn;
    pendingTurn = null;

    const worldId = getActiveWorldId();
    if (!worldId) return;
    const { chat } = SillyTavern.getContext();
    const botMessage = chat?.[chat.length - 1];
    if (!botMessage || botMessage.is_user || !botMessage.mes) return;

    // ponytail: swipes/regenerates re-observe the same exchange; dedupe backend-side if it pollutes
    try {
        const res = await callBackend('npc-engine/observe', {
            method: 'POST',
            body: JSON.stringify({ worldId, npcIds, userMessage, botMessage: botMessage.mes }),
        });
        if (!res.ok) console.error(`[NPC ENGINE] /observe failed (HTTP ${res.status})`);
    } catch (error) {
        console.error('[NPC ENGINE] /observe failed', error);
    }
}
