import { initChatListener } from "./modules/register_chat";
import { initNpcManager } from "./ui/npc_manager/ui";
import { initLocations } from "./ui/locations/ui";

(async() =>{
console.log("[NPC Engine] Initializing Extension UI")

initChatListener();
initNpcManager();
initLocations();


})();