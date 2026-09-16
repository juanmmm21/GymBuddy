import { installRestNoticeHandlers, type RestNoticeWorkerScope } from './rest-notice-worker';

// Entrada propia del build (`push-sw.js`), que el `sw.js` generado por workbox carga con
// `importScripts`. Así la caché sigue siendo declarativa y el manejador del aviso es TypeScript
// con tests. El cast es la frontera: aquí `globalThis` es el `ServiceWorkerGlobalScope`.
installRestNoticeHandlers(globalThis as unknown as RestNoticeWorkerScope);
