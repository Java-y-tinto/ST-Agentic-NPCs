// Shared helpers for the UI modules.

const SillyTavern = (globalThis as any).SillyTavern;

export const WORLD_METADATA_KEY = 'npc_engine_world_id';
export const MANAGED_FLAG_KEY = 'npc_engine';

// The world id lives in the chat metadata (set by register_chat on CHAT_CHANGED).
export function getActiveWorldId(): string | null {
    const { chatMetadata } = SillyTavern.getContext();
    return chatMetadata?.[WORLD_METADATA_KEY] ?? null;
}

// The "engine-managed" flag lives on the main character card (V2 extensions field),
// so it travels with the card. characterId is a live array index — never persist it.
// ponytail: group chats have characterId undefined → unmanaged; revisit when groups matter
export function isEngineManaged(): boolean {
    const { characters, characterId } = SillyTavern.getContext();
    if (characterId === undefined) return false;
    return !!characters?.[characterId]?.data?.extensions?.[MANAGED_FLAG_KEY]?.managed;
}

export async function setEngineManaged(managed: boolean): Promise<void> {
    const { characterId, writeExtensionField } = SillyTavern.getContext();
    if (characterId === undefined) throw new Error('No active character');
    await writeExtensionField(characterId, MANAGED_FLAG_KEY, { managed });
}

export function slugify(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function toast(message: string, type: 'success' | 'error') {
    const toastr = (globalThis as any).toastr;
    if (toastr) toastr[type](message, 'NPC Engine');
    else console.log(`[NPC ENGINE] ${type}: ${message}`);
}
