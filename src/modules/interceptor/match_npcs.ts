// Pure trigger matching — kept import-free so the node self-check can run it directly.

export interface Npc {
    id: string;
    name: string;
    triggers?: string[];
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// NPCs whose name or any trigger appears as a whole word in the text (case-insensitive).
export function matchNpcs(npcs: Npc[], text: string): Npc[] {
    return npcs.filter(npc =>
        [npc.name, ...(npc.triggers ?? [])].some(t =>
            t && new RegExp(`\\b${escapeRegex(t)}\\b`, 'i').test(text)));
}
