// Shared helpers for the UI modules.

const SillyTavern = (globalThis as any).SillyTavern;

export const WORLD_METADATA_KEY = 'npc_engine_world_id';

// The world id lives in the chat metadata (set by register_chat on CHAT_CHANGED).
export function getActiveWorldId(): string | null {
    const { chatMetadata } = SillyTavern.getContext();
    return chatMetadata?.[WORLD_METADATA_KEY] ?? null;
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
