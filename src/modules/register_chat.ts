import { callBackend } from "../utils/ST_api";

const SillyTavern = (globalThis as any).SillyTavern;



export function initChatListener() {
    // Get the eventSource and types to listen to the CHAT_CHANGED event.
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.CHAT_CHANGED, handleNewChat)
    console.log("[NPC ENGINE] CHAT_CHANGED listener started")
}




// Send the chat data to the backend to set the state to the current chat or create folder structure of an empty world.
async function handleNewChat(chatId: string){
    console.log(chatId)
    console.log("[NPC ENGINE] CHAT_CHANGED activated")
    // Get Chat's metadata
    const {chatMetadata, saveMetadata} = SillyTavern.getContext();
    const metadataKey = 'npc_engine_world_id'
    // We check if there's no active chat
    if (!chatMetadata) return;

    // Search for UUID
    let worldId = chatMetadata[metadataKey];

    // If there's none, it's a new chat, initialize the folder structure.
    if (!worldId) {
        // Create a new UUID for this chat
        worldId = crypto.randomUUID();
        chatMetadata[metadataKey] = worldId;
        console.log(`[NPC ENGINE] New chat detected. Assigning new ID: ${worldId}`)

        // Save the metadata to server
        await saveMetadata();
    } else {
        console.log(`[NPC ENGINE] Found existing world: ${worldId}`)
    }
    await initializeBackend(worldId)

}

// Tell the backend to initialize the NPCs of the world (chat)
async function initializeBackend(worldId: string){
    // We check if the backend is running before doing anything
    try {
         
         const health_check = await callBackend('/npc-engine/ping')

         if (!health_check.ok) {
            console.error(`[NPC ENGINE] HTTP ERROR: ${health_check.status}`)
         }

         const data = (await health_check.json()) as {status: string, message: string}
         if (data.status != "ok"){
            console.error(`[NPC ENGINE] Backend responded but didn't return expected data`)
         }
         console.log("[NPC ENGINE] health check passed.")
         const create_empty_NPC_request = await callBackend(`/npc-engine/init`, {
            method: 'POST',
            body: JSON.stringify({worldId: worldId})
         })
         const status = (await create_empty_NPC_request.json()) as {status: string}
         if (data.status != "ok") {
            console.error(`[NPC ENGINE] BACKEND ERRORED WHILE CREATING WORLD ${worldId}`)
         }
         console.log(`[NPC ENGINE] World ${worldId} initialized.`)

    } catch (error) {
        console.error(`[NPC ENGINE] Backend isn't responding. Did you forget to install the server plugin? ${error}`)
    }

}