import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { installTheme, watchColorScheme } from './design/theme';
import './design/global.css';

// Los tokens se aplican antes del primer render: sin ellos no hay ni un color en pantalla.
watchColorScheme(window, (scheme) => {
  installTheme(document, scheme);
});

// El service worker se actualiza solo: en una app de una persona no hay que pedir permiso.
registerSW({ immediate: true });

const container = document.getElementById('root');
if (container === null) {
  throw new Error('No existe el contenedor #root en index.html');
}

createRoot(container).render(
  <StrictMode>
    <App apiBaseUrl={import.meta.env.VITE_API_URL ?? ''} storage={window.localStorage} />
  </StrictMode>,
);
