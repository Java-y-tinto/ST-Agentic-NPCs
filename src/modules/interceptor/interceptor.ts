import { callBackend } from "../../utils/ST_api";
import { getActiveWorldId, isEngineManaged } from "../../utils/helpers";
import { isEngineBusy } from "../executor/executor";
import { rememberTurn } from "../observer";
import { matchNpcs, Npc } from "./match_npcs";

interface PresenceResult {
    npcId: string;
    name: string;
    location: string;
    activity?: string;
    appearance?: string;
}

// How many messages from the end the context block is inserted at.
const INJECT_DEPTH = 4;

// Registers the generate_interceptor declared in manifest.json. Call once at startup.
export function initInterceptor() {
    (globalThis as any).npcEngineInterceptor = async function (
        chat: any[],
        _contextSize: number,
        _abort: (immediately?: boolean) => void,
        type: string,
    ) {
        // Quiet generations are background jobs (including our own) — never inject into those.
        // The engine-busy flag covers generateRaw calls in case they fire interceptors too.
        if (type === 'quiet' || isEngineBusy() || !isEngineManaged()) return;
        const worldId = getActiveWorldId();
        if (!worldId) return;

        const lastUserMessage = [...chat].reverse().find(m => m.is_user);
        if (!lastUserMessage?.mes) return;

        try {
            const agentsRes = await callBackend(`npc-engine/agents?world=${encodeURIComponent(worldId)}`);
            if (!agentsRes.ok) return;
            const triggered = matchNpcs((await agentsRes.json()) as Npc[], lastUserMessage.mes);
            if (!triggered.length) return;

            // Stash the matched ids + user message now so /observe fires even if retrieval
            // fails below — injection and memory formation are independent layers.
            rememberTurn(triggered.map(n => n.id), lastUserMessage.mes);

            const res = await callBackend('npc-engine/retrieve', {
                method: 'POST',
                body: JSON.stringify({
                    worldId,
                    npcIds: triggered.map(n => n.id),
                    query: lastUserMessage.mes,
                }),
            });
            if (!res.ok) {
                console.error(`[NPC ENGINE] Retrieval failed (HTTP ${res.status})`);
                return;
            }
            const { results } = (await res.json()) as { results?: PresenceResult[] };
            if (!results?.length) return;

            // Labeled prose presence block — the main LLM only ever sees presence, never memories.
            const text = `[Nearby: ${results.map(r =>
                `${r.name} is at ${r.location}${r.activity ? ` (${r.activity})` : ''}${r.appearance ? `. ${r.appearance}` : ''}.`,
            ).join(' ')}]`;

            // Splicing a NEW object into the array changes the prompt only — the saved
            // chat keeps the original messages (mutating existing entries would persist).
            chat.splice(Math.max(chat.length - INJECT_DEPTH, 0), 0, {
                name: 'System',
                is_user: false,
                is_system: false,
                send_date: Date.now(),
                mes: text,
                extra: { type: 'narrator' },
            });
            console.log(`[NPC ENGINE] Injected context for: ${triggered.map(n => n.name).join(', ')}`);
        } catch (error) {
            // Never block generation on engine failure — just generate without NPC context.
            console.error('[NPC ENGINE] Interceptor failed, generating without NPC context', error);
        }
    };
    console.log('[NPC ENGINE] Generate interceptor registered');
}
