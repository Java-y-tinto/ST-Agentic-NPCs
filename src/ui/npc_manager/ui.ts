import { callBackend } from "../../utils/ST_api";
import { getActiveWorldId, slugify, toast } from "../../utils/helpers";
import panelHtml from "./panel.html";
import "./panel.css";

const SillyTavern = (globalThis as any).SillyTavern;

interface Npc {
    id: string;
    name: string;
    tier: string;
    coreTraits?: string;
    backstory?: string;
    location?: string | null;
    triggers?: string[];
}

// Mounts the panel into the Extensions drawer and wires it up. Call once at startup.
export function initNpcManager() {
    const container = document.getElementById('extensions_settings2');
    if (!container) {
        console.error('[NPC ENGINE] #extensions_settings2 not found, cannot mount UI');
        return;
    }

    const panel = document.createElement('div');
    panel.innerHTML = panelHtml;
    container.append(panel);

    const worldLabel = panel.querySelector('#npc_engine_world_id') as HTMLElement;
    const list = panel.querySelector('#npc_engine_list') as HTMLElement;
    const emptyMsg = panel.querySelector('#npc_engine_empty') as HTMLElement;
    const addButton = panel.querySelector('#npc_engine_add') as HTMLElement;
    const form = panel.querySelector('#npc_engine_form') as HTMLFormElement;
    const nameInput = panel.querySelector('#npc_form_name') as HTMLInputElement;
    const slugPreview = panel.querySelector('#npc_form_slug') as HTMLElement;
    const tierSelect = panel.querySelector('#npc_form_tier') as HTMLSelectElement;
    const traitsInput = panel.querySelector('#npc_form_traits') as HTMLInputElement;
    const backstoryInput = panel.querySelector('#npc_form_backstory') as HTMLTextAreaElement;
    const locationSelect = panel.querySelector('#npc_form_location') as HTMLSelectElement;
    const triggersInput = panel.querySelector('#npc_form_triggers') as HTMLInputElement;
    const errorBox = panel.querySelector('#npc_form_error') as HTMLElement;

    function showError(message: string) {
        errorBox.textContent = message;
        errorBox.hidden = false;
    }

    function renderList(npcs: Npc[]) {
        list.replaceChildren();
        emptyMsg.hidden = npcs.length > 0;
        for (const npc of npcs) {
            const row = document.createElement('details');
            row.classList.add('npc-engine-list-item');

            const summary = document.createElement('summary');
            const name = document.createElement('span');
            name.textContent = npc.name;
            const tier = document.createElement('span');
            tier.classList.add('npc-engine-tier');
            tier.textContent = npc.tier;
            summary.append(name, tier);

            const info = document.createElement('div');
            info.classList.add('npc-engine-details');
            const fields: [string, string | undefined][] = [
                ['Id', npc.id],
                ['Core traits', npc.coreTraits],
                ['Backstory', npc.backstory],
                ['Location', npc.location ?? undefined],
                ['Triggers', npc.triggers?.join(', ')],
            ];
            for (const [label, value] of fields) {
                if (!value) continue;
                const line = document.createElement('div');
                const b = document.createElement('b');
                b.textContent = `${label}: `;
                line.append(b, value);
                info.append(line);
            }

            row.append(summary, info);
            list.append(row);
        }
    }

    async function refresh() {
        const worldId = getActiveWorldId();
        worldLabel.textContent = worldId ?? 'no active chat';
        addButton.classList.toggle('disabled', !worldId);
        if (!worldId) {
            renderList([]);
            return;
        }
        try {
            const res = await callBackend(`/npc-engine/agents?world=${encodeURIComponent(worldId)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            renderList((await res.json()) as Npc[]);
        } catch (error) {
            console.error('[NPC ENGINE] Failed to load NPC list', error);
            renderList([]);
        }
    }

    // Locations come from the world registry; the form degrades gracefully without them.
    async function loadLocations(worldId: string) {
        locationSelect.replaceChildren(new Option('(none)', ''));
        try {
            const res = await callBackend(`/npc-engine/worlds/${encodeURIComponent(worldId)}/locations`);
            if (!res.ok) return;
            const locations = (await res.json()) as { id: string, name: string }[];
            for (const loc of locations) {
                locationSelect.append(new Option(loc.name, loc.id));
            }
        } catch {
            // No locations endpoint yet — the select just stays at "(none)".
        }
    }

    function openForm() {
        const worldId = getActiveWorldId();
        if (!worldId) {
            toast('Open a chat first — NPCs belong to a world.', 'error');
            return;
        }
        form.reset();
        slugPreview.textContent = '';
        errorBox.hidden = true;
        form.hidden = false;
        loadLocations(worldId);
        nameInput.focus();
    }

    function closeForm() {
        form.hidden = true;
    }

    async function submit(event: SubmitEvent) {
        event.preventDefault();
        errorBox.hidden = true;

        const worldId = getActiveWorldId();
        if (!worldId) {
            showError('No active chat. Open a chat before creating an NPC.');
            return;
        }
        const name = nameInput.value.trim();
        const id = slugify(name);
        if (!id) {
            showError('Name must contain at least one letter or number.');
            return;
        }

        const payload = {
            worldId,
            id,
            name,
            tier: tierSelect.value,
            coreTraits: traitsInput.value.trim(),
            backstory: backstoryInput.value.trim(),
            location: locationSelect.value || null,
            triggers: triggersInput.value.split(',').map(t => t.trim()).filter(Boolean),
        };

        try {
            const res = await callBackend('/npc-engine/agents', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            if (res.status === 409) {
                showError(`An NPC with the id "${id}" already exists in this world.`);
                return;
            }
            if (!res.ok) {
                showError(`Backend error (HTTP ${res.status}).`);
                return;
            }
            toast(`${name} created.`, 'success');
            closeForm();
            await refresh();
        } catch (error) {
            console.error('[NPC ENGINE] Failed to create NPC', error);
            showError('Backend is not responding. Is the server plugin installed?');
        }
    }

    nameInput.addEventListener('input', () => {
        const slug = slugify(nameInput.value);
        slugPreview.textContent = slug ? `id: ${slug}` : '';
    });
    addButton.addEventListener('click', openForm);
    form.addEventListener('submit', submit);
    (panel.querySelector('#npc_form_cancel') as HTMLElement).addEventListener('click', closeForm);

    // Keep the panel in sync with the active chat.
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.CHAT_CHANGED, refresh);

    refresh();
    console.log('[NPC ENGINE] NPC manager panel mounted');
}
