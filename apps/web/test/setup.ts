import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { setCurrentLocale } from '../src/i18n/index';

/**
 * Los tests leen la pantalla en español, que es el idioma en el que se escribió la app. jsdom dice
 * que el navegador está en inglés, y como la app sigue por defecto al sistema, se le cambia aquí;
 * los tests del inglés lo cambian en el suyo.
 */
function useSpanishSystem(): void {
  Object.defineProperty(window.navigator, 'language', { value: 'es-ES', configurable: true });
  Object.defineProperty(window.navigator, 'languages', { value: ['es-ES'], configurable: true });
}

beforeEach(() => {
  useSpanishSystem();
  setCurrentLocale('es');
});

afterEach(() => {
  cleanup();
});
