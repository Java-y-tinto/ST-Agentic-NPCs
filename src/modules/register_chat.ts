import { callBackend } from "../utils/ST_api";
import { isEngineManaged, WORLD_METADATA_KEY } from "../utils/helpers";

const SillyTavern = (globalThis as any).SillyTavern;

export function initChatListener() {
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.CHAT_CHANGED, handleChatChanged);
    console.log("[NPC ENGINE] CHAT_CHANGED listener started");
}

// Only engine-managed chats get a world — unmanaged chats are left completely alone.
async function handleChatChanged() {
    if (!isEngineManaged()) return;
    await ensureWorld();
}

// Assign a world id to the current chat (if missing) and scaffold it on the backend.
// Also called by the panel toggle right after enabling management.
export async function ensureWorld(): Promise<string | null> {
    const { chatMetadata, saveMetadata } = SillyTavern.getContext();
    if (!chatMetadata) return null;

    let worldId = chatMetadata[WORLD_METADATA_KEY];
    if (!worldId) {
        worldId = crypto.randomUUID();
        chatMetadata[WORLD_METADATA_KEY] = worldId;
        console.log(`[NPC ENGINE] New managed chat. Assigning world id: ${worldId}`);
        await saveMetadata();
    }

    try {
        const res = await callBackend('npc-engine/init', {
            method: 'POST',
            body: JSON.stringify({ worldId }),
        });
        if (!res.ok) {
            console.error(`[NPC ENGINE] World init failed (HTTP ${res.status})`);
            return worldId;
        }
        console.log(`[NPC ENGINE] World ${worldId} initialized.`);
    } catch (error) {
        console.error(`[NPC ENGINE] Backend isn't responding. Did you forget to install the server plugin? ${error}`);
    }
    return worldId;
}
