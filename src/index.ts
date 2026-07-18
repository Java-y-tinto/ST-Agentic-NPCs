import { initChatListener } from "./modules/register_chat";
import { initInterceptor } from "./modules/interceptor/interceptor";
import { initObserver } from "./modules/observer";
import { initExecutor } from "./modules/executor/executor";
import { initNpcManager } from "./ui/npc_manager/ui";
import { initLocations } from "./ui/locations/ui";

(async() =>{
console.log("[NPC Engine] Initializing Extension UI")

initChatListener();
initInterceptor();
initObserver();
initExecutor();
initNpcManager();
initLocations();


})();