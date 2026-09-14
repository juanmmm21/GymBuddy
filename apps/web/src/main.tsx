import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { installTheme, watchColorScheme } from './design/theme';
import { captureInstallPrompt } from './features/install/install-prompt';
import { readBrowserEnvironment } from './features/install/platform';
// Archivo con su eje de anchura: la fuente de títulos y cifras viaja en el bundle y se precachea.
import '@fontsource-variable/archivo/wdth.css';
import './design/global.css';

// Los tokens se aplican antes del primer render: sin ellos no hay ni un color en pantalla.
watchColorScheme(window, (scheme) => {
  installTheme(document, scheme);
});

// El service worker se actualiza solo: en una app de una persona no hay que pedir permiso.
registerSW({ immediate: true });

// Antes de montar React: Chrome ofrece instalar una sola vez y pronto, y no lo repite.
const install = {
  environment: readBrowserEnvironment(window),
  prompt: captureInstallPrompt(window),
};

const container = document.getElementById('root');
if (container === null) {
  throw new Error('No existe el contenedor #root en index.html');
}

createRoot(container).render(
  <StrictMode>
    <App
      apiBaseUrl={import.meta.env.VITE_API_URL ?? ''}
      storage={window.localStorage}
      install={install}
    />
  </StrictMode>,
);
