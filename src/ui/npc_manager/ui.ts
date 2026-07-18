import { callBackend } from "../../utils/ST_api";
import { getActiveWorldId, isEngineManaged, setEngineManaged, slugify, toast } from "../../utils/helpers";
import { ensureWorld } from "../../modules/register_chat";
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
    stats?: Record<string, string | number>;
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

    const managedToggle = panel.querySelector('#npc_engine_managed') as HTMLInputElement;
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
    const statsInput = panel.querySelector('#npc_form_stats') as HTMLTextAreaElement;
    const errorBox = panel.querySelector('#npc_form_error') as HTMLElement;
    const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;

    // When set, the form edits this NPC (PATCH) instead of creating one (POST).
    let editingId: string | null = null;

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
            const edit = document.createElement('i');
            edit.classList.add('fa-solid', 'fa-pencil', 'npc-engine-delete');
            edit.title = 'Edit NPC';
            edit.addEventListener('click', (e) => {
                e.preventDefault(); // don't toggle the <details>
                openForm(npc);
            });
            const del = document.createElement('i');
            del.classList.add('fa-solid', 'fa-trash-can', 'npc-engine-delete');
            del.title = 'Delete NPC';
            del.addEventListener('click', (e) => {
                e.preventDefault();
                deleteNpc(npc);
            });
            summary.append(name, tier, edit, del);

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

    async function deleteNpc(npc: Npc) {
        if (!confirm(`Delete ${npc.name}?`)) return;
        const worldId = getActiveWorldId();
        try {
            const res = await callBackend('npc-engine/agents', {
                method: 'DELETE',
                body: JSON.stringify({ worldId, id: npc.id }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            toast(`${npc.name} deleted.`, 'success');
        } catch (error) {
            console.error('[NPC ENGINE] Failed to delete NPC', error);
            toast('Failed to delete NPC.', 'error');
        }
        await refresh();
    }

    async function refresh() {
        const { characterId } = SillyTavern.getContext();
        const managed = isEngineManaged();
        managedToggle.checked = managed;
        managedToggle.disabled = characterId === undefined; // no character / group chat

        const worldId = managed ? getActiveWorldId() : null;
        worldLabel.textContent = worldId ?? (managed ? 'no active chat' : 'not managed');
        addButton.classList.toggle('disabled', !worldId);
        if (!worldId) {
            renderList([]);
            return;
        }
        try {
            const res = await callBackend(`npc-engine/agents?world=${encodeURIComponent(worldId)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            renderList((await res.json()) as Npc[]);
        } catch (error) {
            console.error('[NPC ENGINE] Failed to load NPC list', error);
            renderList([]);
        }
    }

    // Locations come from the world registry; the form degrades gracefully without them.
    async function loadLocations(worldId: string) {
        try {
            const res = await callBackend(`npc-engine/worlds/${encodeURIComponent(worldId)}/locations`);
            if (!res.ok) return;
            const locations = (await res.json()) as { id: string, name: string, description?: string }[];
            const current = locationSelect.value;
            locationSelect.replaceChildren(new Option('(none)', ''));
            for (const loc of locations) {
                const opt = new Option(loc.name, loc.id);
                opt.title = loc.description ?? '';
                locationSelect.append(opt);
            }
            locationSelect.value = current; // keep selection if the location still exists
        } catch {
            // No locations endpoint yet — the select just stays at "(none)".
        }
    }

    async function openForm(npc?: Npc) {
        const worldId = getActiveWorldId();
        if (!worldId) {
            toast('Open a chat first — NPCs belong to a world.', 'error');
            return;
        }
        form.reset();
        editingId = npc?.id ?? null;
        submitButton.textContent = npc ? 'Save changes' : 'Create NPC';
        errorBox.hidden = true;
        form.hidden = false;
        await loadLocations(worldId); // before prefill, so the location can be preselected
        if (npc) {
            nameInput.value = npc.name;
            slugPreview.textContent = `id: ${npc.id}`; // slug is the folder name — fixed
            tierSelect.value = npc.tier;
            traitsInput.value = npc.coreTraits ?? '';
            backstoryInput.value = npc.backstory ?? '';
            locationSelect.value = npc.location ?? '';
            triggersInput.value = npc.triggers?.join(', ') ?? '';
            statsInput.value = Object.entries(npc.stats ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n');
        } else {
            slugPreview.textContent = '';
        }
        nameInput.focus();
    }

    function closeForm() {
        form.hidden = true;
        editingId = null;
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
        const id = editingId ?? slugify(name);
        if (!id) {
            showError('Name must contain at least one letter or number.');
            return;
        }

        const stats: Record<string, string | number> = {};
        for (const line of statsInput.value.split('\n')) {
            const colon = line.indexOf(':');
            const key = colon > 0 ? line.slice(0, colon).trim() : '';
            if (!key) {
                if (line.trim()) {
                    showError(`Stat line "${line.trim()}" must look like "key: value".`);
                    return;
                }
                continue;
            }
            const raw = line.slice(colon + 1).trim();
            stats[key] = raw !== '' && !isNaN(Number(raw)) ? Number(raw) : raw;
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
            stats,
        };

        try {
            const res = await callBackend('npc-engine/agents', {
                method: editingId ? 'PATCH' : 'POST',
                body: JSON.stringify(payload),
            });
            if (res.status === 409) {
                showError(`An NPC with the id "${id}" already exists in this world.`);
                return;
            }
            if (res.status === 404) {
                showError(`"${name}" no longer exists in this world.`);
                return;
            }
            if (!res.ok) {
                showError(`Backend error (HTTP ${res.status}).`);
                return;
            }
            toast(editingId ? `${name} saved.` : `${name} created.`, 'success');
            closeForm();
            await refresh();
        } catch (error) {
            console.error('[NPC ENGINE] Failed to save NPC', error);
            showError('Backend is not responding. Is the server plugin installed?');
        }
    }

    nameInput.addEventListener('input', () => {
        if (editingId) return; // id is fixed while editing — renaming changes the display name only
        const slug = slugify(nameInput.value);
        slugPreview.textContent = slug ? `id: ${slug}` : '';
    });
    // Self-hydrate: refresh the options whenever the user reaches for the select,
    // so locations created after the form opened still show up.
    locationSelect.addEventListener('focus', () => {
        const worldId = getActiveWorldId();
        if (worldId) loadLocations(worldId);
    });
    managedToggle.addEventListener('change', async () => {
        try {
            await setEngineManaged(managedToggle.checked);
            if (managedToggle.checked) await ensureWorld(); // scaffold immediately, don't wait for a chat switch
        } catch (error) {
            console.error('[NPC ENGINE] Failed to toggle engine management', error);
            toast('Failed to update the character card.', 'error');
        }
        await refresh();
    });
    addButton.addEventListener('click', () => openForm());
    form.addEventListener('submit', submit);
    (panel.querySelector('#npc_form_cancel') as HTMLElement).addEventListener('click', closeForm);

    // Keep the panel in sync with the active chat.
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.CHAT_CHANGED, refresh);

    refresh();
    console.log('[NPC ENGINE] NPC manager panel mounted');
}
