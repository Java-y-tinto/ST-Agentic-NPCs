import { callBackend } from "../../utils/ST_api";
import { getActiveWorldId, slugify, toast } from "../../utils/helpers";
import panelHtml from "./panel.html";
import "../npc_manager/panel.css"; // shared list/form styles

const SillyTavern = (globalThis as any).SillyTavern;

interface Location {
    id: string;
    name: string;
    description?: string;
}

// Mounts the locations section inside the NPC manager drawer. Call after initNpcManager().
export function initLocations() {
    const mount = document.getElementById('npc_engine_locations_mount');
    if (!mount) {
        console.error('[NPC ENGINE] Locations mount point not found, is the NPC manager panel loaded?');
        return;
    }
    mount.innerHTML = panelHtml;

    const list = mount.querySelector('#loc_list') as HTMLElement;
    const emptyMsg = mount.querySelector('#loc_empty') as HTMLElement;
    const addButton = mount.querySelector('#loc_add') as HTMLElement;
    const form = mount.querySelector('#loc_form') as HTMLFormElement;
    const nameInput = mount.querySelector('#loc_form_name') as HTMLInputElement;
    const slugPreview = mount.querySelector('#loc_form_slug') as HTMLElement;
    const descInput = mount.querySelector('#loc_form_desc') as HTMLTextAreaElement;
    const errorBox = mount.querySelector('#loc_form_error') as HTMLElement;

    function showError(message: string) {
        errorBox.textContent = message;
        errorBox.hidden = false;
    }

    function renderList(locations: Location[]) {
        list.replaceChildren();
        emptyMsg.hidden = locations.length > 0;
        for (const loc of locations) {
            const row = document.createElement('details');
            row.classList.add('npc-engine-list-item');

            const summary = document.createElement('summary');
            const name = document.createElement('span');
            name.textContent = loc.name;
            summary.append(name);

            const info = document.createElement('div');
            info.classList.add('npc-engine-details');
            const idLine = document.createElement('div');
            const idLabel = document.createElement('b');
            idLabel.textContent = 'Id: ';
            idLine.append(idLabel, loc.id);
            info.append(idLine);
            if (loc.description) {
                const descLine = document.createElement('div');
                const descLabel = document.createElement('b');
                descLabel.textContent = 'Description: ';
                descLine.append(descLabel, loc.description);
                info.append(descLine);
            }

            row.append(summary, info);
            list.append(row);
        }
    }

    async function refresh() {
        const worldId = getActiveWorldId();
        addButton.classList.toggle('disabled', !worldId);
        if (!worldId) {
            renderList([]);
            return;
        }
        try {
            const res = await callBackend(`/npc-engine/worlds/${encodeURIComponent(worldId)}/locations`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            renderList((await res.json()) as Location[]);
        } catch (error) {
            console.error('[NPC ENGINE] Failed to load locations', error);
            renderList([]);
        }
    }

    function openForm() {
        if (!getActiveWorldId()) {
            toast('Open a chat first — locations belong to a world.', 'error');
            return;
        }
        form.reset();
        slugPreview.textContent = '';
        errorBox.hidden = true;
        form.hidden = false;
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
            showError('No active chat. Open a chat before creating a location.');
            return;
        }
        const name = nameInput.value.trim();
        const id = slugify(name);
        if (!id) {
            showError('Name must contain at least one letter or number.');
            return;
        }

        try {
            const res = await callBackend(`/npc-engine/worlds/${encodeURIComponent(worldId)}/locations`, {
                method: 'POST',
                body: JSON.stringify({ id, name, description: descInput.value.trim() }),
            });
            if (res.status === 409) {
                showError(`A location with the id "${id}" already exists in this world.`);
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
            console.error('[NPC ENGINE] Failed to create location', error);
            showError('Backend is not responding. Is the server plugin installed?');
        }
    }

    nameInput.addEventListener('input', () => {
        const slug = slugify(nameInput.value);
        slugPreview.textContent = slug ? `id: ${slug}` : '';
    });
    addButton.addEventListener('click', openForm);
    form.addEventListener('submit', submit);
    (mount.querySelector('#loc_form_cancel') as HTMLElement).addEventListener('click', closeForm);

    // Keep the list in sync with the active chat.
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.CHAT_CHANGED, refresh);

    refresh();
    console.log('[NPC ENGINE] Locations panel mounted');
}
