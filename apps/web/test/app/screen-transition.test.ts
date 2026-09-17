import { describe, expect, it } from 'vitest';
import { screenTransitionFor, TAB_PATHS } from '../../src/app/screen-transition';

describe('de qué lado entra la pantalla', () => {
  it('no anima la primera pantalla de la app', () => {
    expect(screenTransitionFor(null, '/')).toBe('none');
  });

  it('no anima quedarse donde ya se estaba', () => {
    expect(screenTransitionFor('/catalog', '/catalog')).toBe('none');
    // El buscador reescribe la URL en cada letra: la ruta es la misma y no se mueve nada.
    expect(screenTransitionFor('/catalog/chest', '/catalog/chest/')).toBe('none');
  });

  it('entra por la derecha al bajar un nivel', () => {
    expect(screenTransitionFor('/catalog', '/catalog/chest')).toBe('forward');
    expect(screenTransitionFor('/catalog/chest', '/catalog/pectorals/bench-press')).toBe('forward');
    expect(screenTransitionFor('/', '/settings')).toBe('forward');
  });

  it('entra por la izquierda al subir', () => {
    expect(screenTransitionFor('/catalog/pectorals/bench-press', '/catalog/chest')).toBe(
      'backward',
    );
    expect(screenTransitionFor('/settings', '/')).toBe('backward');
  });

  it('entre pestañas sigue el orden de la barra de abajo', () => {
    expect(screenTransitionFor(TAB_PATHS.home, TAB_PATHS.exercises)).toBe('forward');
    expect(screenTransitionFor(TAB_PATHS.exercises, TAB_PATHS.history)).toBe('forward');
    expect(screenTransitionFor(TAB_PATHS.history, TAB_PATHS.catalog)).toBe('backward');
    expect(screenTransitionFor(TAB_PATHS.catalog, TAB_PATHS.home)).toBe('backward');
  });

  it('cuenta la sesión en el centro de la barra, donde está su botón', () => {
    expect(screenTransitionFor(TAB_PATHS.exercises, TAB_PATHS.session)).toBe('forward');
    expect(screenTransitionFor(TAB_PATHS.catalog, TAB_PATHS.session)).toBe('backward');
  });

  it('se funde sin moverse entre dos pantallas del mismo nivel sin orden entre ellas', () => {
    expect(screenTransitionFor('/settings', '/backup')).toBe('fade');
    expect(screenTransitionFor('/devices', TAB_PATHS.exercises)).toBe('fade');
  });

  it('la barra y la transición comparten las mismas rutas', () => {
    expect(Object.values(TAB_PATHS)).toEqual([
      '/',
      '/exercises',
      '/session',
      '/catalog',
      '/history',
    ]);
  });
});
