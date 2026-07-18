// Pure logic for the `perception` job type — kept import-free so the node self-check can run it.

export interface PerceptionNpc {
    npcId: string;
    name: string;
    location: string;
    activity?: string;
}

export interface PerceptionPayload {
    npcs: PerceptionNpc[];
    userMessage: string;
    botMessage: string;
    timeGt: string;
}

export interface PerceptionResult {
    results: { npcId: string; perceived: boolean }[];
}

export const PERCEPTION_SCHEMA = {
    name: 'perception',
    strict: true,
    value: {
        type: 'object',
        properties: {
            results: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        npcId: { type: 'string' },
                        perceived: { type: 'boolean' },
                    },
                    required: ['npcId', 'perceived'],
                },
            },
        },
        required: ['results'],
    },
};

export function buildPerceptionPrompt(payload: PerceptionPayload, textMode: boolean): string {
    const npcLines = payload.npcs
        .map(n => `- ${n.npcId}: ${n.name} is at ${n.location}${n.activity ? `, ${n.activity}` : ''}.`)
        .join('\n');
    const format = textMode
        ? `Answer with exactly one line per NPC, nothing else:\n<npcId>: yes|no`
        : `Answer with JSON: {"results": [{"npcId": string, "perceived": boolean}]}. Include every NPC.`;
    return [
        `Game time: ${payload.timeGt}. NPCs:`,
        npcLines,
        '',
        'This exchange just happened in the story:',
        `Player: ${payload.userMessage}`,
        `Narrator: ${payload.botMessage}`,
        '',
        'For each NPC, decide: did they perceive this exchange (present in the scene or within earshot),',
        'or was it merely about them while they were elsewhere?',
        format,
    ].join('\n');
}

// Text-mode fallback: parse "npcId: yes|no" lines.
export function parsePerceptionText(text: string): PerceptionResult {
    const results: PerceptionResult['results'] = [];
    for (const line of text.split('\n')) {
        const m = line.match(/^\s*[-•]?\s*(\S+?):\s*(yes|no)\b/i);
        if (m) results.push({ npcId: m[1], perceived: m[2].toLowerCase() === 'yes' });
    }
    return { results };
}

// Backend rejects partial results — enforce the contract client-side: every payload NPC
// present, `perceived` a real boolean. Throws if the model's output doesn't cover it.
export function validatePerception(payload: PerceptionPayload, raw: unknown): PerceptionResult {
    const list = Array.isArray((raw as any)?.results) ? (raw as any).results : [];
    const byId = new Map(list.map((r: any) => [r?.npcId, r?.perceived]));
    return {
        results: payload.npcs.map(n => {
            const perceived = byId.get(n.npcId);
            if (typeof perceived !== 'boolean') throw new Error(`perception result missing npcId "${n.npcId}"`);
            return { npcId: n.npcId, perceived };
        }),
    };
}
