import { describe, expect, it } from 'vitest';
import { tabIndicatorFor } from '../../src/app/tab-indicator';

describe('dónde se pone la marca de la barra', () => {
  it('sin sesión abierta la barra tiene cuatro huecos, en el orden de las pestañas', () => {
    expect(tabIndicatorFor('/', false)).toEqual({ columns: 4, index: 0 });
    expect(tabIndicatorFor('/exercises', false)).toEqual({ columns: 4, index: 1 });
    expect(tabIndicatorFor('/catalog', false)).toEqual({ columns: 4, index: 2 });
    expect(tabIndicatorFor('/history', false)).toEqual({ columns: 4, index: 3 });
  });

  it('el botón de la sesión abre un hueco en medio y corre las dos últimas', () => {
    expect(tabIndicatorFor('/exercises', true)).toEqual({ columns: 5, index: 1 });
    expect(tabIndicatorFor('/catalog', true)).toEqual({ columns: 5, index: 3 });
    expect(tabIndicatorFor('/history', true)).toEqual({ columns: 5, index: 4 });
  });

  it('lo que cuelga de una pestaña sigue siendo esa pestaña', () => {
    expect(tabIndicatorFor('/catalog/chest', false).index).toBe(2);
    expect(tabIndicatorFor('/catalog/pectorals/bench-press', false).index).toBe(2);
    expect(tabIndicatorFor('/exercises/abc', false).index).toBe(1);
    expect(tabIndicatorFor('/history/abc', false).index).toBe(3);
  });

  it('la raíz solo se marca con la raíz', () => {
    // Si no, «Hoy» se quedaría encendida en todas las pantallas de la app.
    expect(tabIndicatorFor('/settings', false).index).toBeNull();
    expect(tabIndicatorFor('/routines', false).index).toBeNull();
  });

  it('una pantalla que no es pestaña deja la barra sin marca', () => {
    expect(tabIndicatorFor('/backup', false)).toEqual({ columns: 4, index: null });
    expect(tabIndicatorFor('/devices', true)).toEqual({ columns: 5, index: null });
  });

  it('la sesión no lleva marca: el botón ya se distingue por el color', () => {
    expect(tabIndicatorFor('/session', true)).toEqual({ columns: 5, index: null });
  });

  it('una ruta con barra de más es la misma pantalla', () => {
    expect(tabIndicatorFor('/catalog/', false).index).toBe(2);
    expect(tabIndicatorFor('', false).index).toBe(0);
  });
});
