export {};

// 1. Import when extension is user-scoped
// import '../../../../public/global';
// 2. Import when extension is server-scoped
// import '../../../../global';

declare global {
    interface Window {
        getRequestHeaders(): Record<string, string>;
    }
    interface STContext {  //Interface to ensure "type safety" for SillyTavern's functions. Will add more stuff as development goes on
        eventSource: {
            on(event: string, callback: (...args: any[]) => void): void
            emit(event: string, ...args: any[]): void 
        };
        event_types: {
            CHAT_CHANGED: string;
            GENERATION_STARTED: string;
            GENERATION_ENDED: string;
            MESSAGE_RECEIVED: string;
        }
    }
}
