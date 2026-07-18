import { callBackend } from '../../utils/ST_api';
import { getActiveWorldId, isEngineManaged } from '../../utils/helpers';
import {
    buildPerceptionPrompt,
    parsePerceptionText,
    validatePerception,
    PerceptionPayload,
    PERCEPTION_SCHEMA,
} from './perception';

const SillyTavern = (globalThis as any).SillyTavern;

const SYSTEM_PROMPT = 'You are the perception judge of a role-playing world. Be literal and strict: an NPC only perceives an exchange if the scene places them there or within earshot.';

// Poll only in idle gaps: never during a generation, and a courtesy debounce after each reply.
const IDLE_DEBOUNCE_MS = 5000;
// Calm drain: gap between consecutive jobs so app-open backlogs don't fire in a burst.
const DRAIN_GAP_MS = 2000;

let generationInFlight = false;
let engineBusy = false; // our own generateRaw in progress — interceptor checks this
let running = false;
let kickTimer: ReturnType<typeof setTimeout> | null = null;
// Structured outputs mode for the session; degrades to text on an unexpected '{}'.
let sessionTextMode = false;

export const isEngineBusy = () => engineBusy;

export function initExecutor() {
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.GENERATION_STARTED, () => {
        generationInFlight = true;
        if (kickTimer) clearTimeout(kickTimer);
    });
    eventSource.on(event_types.GENERATION_ENDED, () => {
        generationInFlight = false;
        scheduleKick();
    });
    // API changed → structured output support may differ; try schema mode again.
    eventSource.on(event_types.MAIN_API_CHANGED, () => { sessionTextMode = false; });
    eventSource.on(event_types.CHATCOMPLETION_SOURCE_CHANGED, () => { sessionTextMode = false; });
    // Switching into a managed chat exposes that world's backlog — drain it too.
    eventSource.on(event_types.CHAT_CHANGED, scheduleKick);
    // Drain whatever queued up between sessions, calmly, once the app settles.
    scheduleKick();
    console.log('[NPC ENGINE] Job executor registered');
}

function scheduleKick() {
    if (kickTimer) clearTimeout(kickTimer);
    kickTimer = setTimeout(runLoop, IDLE_DEBOUNCE_MS);
}

async function runLoop() {
    if (running) return;
    running = true;
    try {
        while (!generationInFlight) {
            if (!isEngineManaged()) return;
            const worldId = getActiveWorldId();
            if (!worldId) return;
            const res = await callBackend(`npc-engine/worlds/${encodeURIComponent(worldId)}/jobs/next`);
            if (!res.ok) return;
            const { job } = (await res.json()) as { job: any };
            if (!job) return; // queue drained
            await runJob(worldId, job);
            await new Promise(r => setTimeout(r, DRAIN_GAP_MS));
        }
    } catch (error) {
        console.error('[NPC ENGINE] Executor loop failed', error);
    } finally {
        running = false;
    }
}

async function runJob(worldId: string, job: any) {
    console.log(`[NPC ENGINE] Running job ${job.id} (${job.type})`);
    try {
        let result: unknown;
        switch (job.type) {
            case 'perception':
                result = await runPerception(job.payload);
                break;
            default:
                throw new Error(`unknown job type "${job.type}"`);
        }
        await postResult(worldId, job.id, { ok: true, result });
    } catch (error) {
        console.error(`[NPC ENGINE] Job ${job.id} failed`, error);
        await postResult(worldId, job.id, { ok: false, error: String(error) });
    }
}

// 404 = unknown/already finished (lease expired and someone else did it) — drop, never retry.
async function postResult(worldId: string, jobId: string, body: { ok: boolean; result?: unknown; error?: string }) {
    const res = await callBackend(
        `npc-engine/worlds/${encodeURIComponent(worldId)}/jobs/${encodeURIComponent(jobId)}/result`,
        { method: 'POST', body: JSON.stringify(body) },
    );
    if (!res.ok && res.status !== 404) console.error(`[NPC ENGINE] Posting job result failed (HTTP ${res.status})`);
}

async function runPerception(payload: PerceptionPayload) {
    let raw = await generate(buildPerceptionPrompt(payload, sessionTextMode), sessionTextMode);
    if (!sessionTextMode && raw.trim() === '{}') {
        // Backend claimed schema support but returned the unvalidated failure sentinel:
        // retry this job once in labeled-text mode and degrade the whole session.
        console.warn('[NPC ENGINE] Structured output returned "{}" — degrading session to text mode');
        sessionTextMode = true;
        raw = await generate(buildPerceptionPrompt(payload, true), true);
    }
    const parsed = sessionTextMode ? parsePerceptionText(raw) : JSON.parse(raw);
    return validatePerception(payload, parsed);
}

async function generate(prompt: string, textMode: boolean): Promise<string> {
    const { generateRaw } = SillyTavern.getContext();
    engineBusy = true; // flag so the interceptor ignores engine-generated calls
    try {
        return await generateRaw({
            prompt,
            systemPrompt: SYSTEM_PROMPT,
            jsonSchema: textMode ? undefined : PERCEPTION_SCHEMA,
        });
    } finally {
        engineBusy = false;
    }
}
