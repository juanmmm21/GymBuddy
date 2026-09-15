import { describe, expect, it } from 'vitest';
import {
  bodyPartBackLink,
  catalogBackState,
  catalogSearchPath,
  readCatalogBackLink,
  readSearchQuery,
  searchBackLink,
  withSearchQuery,
} from '../../src/features/catalog/navigation';

describe('texto de la búsqueda en la URL', () => {
  it('lee el texto tal cual, espacios incluidos, y vacío si no hay', () => {
    expect(readSearchQuery(new URLSearchParams('q=remo+'))).toBe('remo ');
    expect(readSearchQuery(new URLSearchParams('muscle=lats'))).toBe('');
  });

  it('escribe el texto sin tocar los filtros y lo quita al vaciarlo', () => {
    const current = new URLSearchParams('muscle=lats');

    const typed = withSearchQuery(current, 'remo polea');
    expect(typed.get('q')).toBe('remo polea');
    expect(typed.get('muscle')).toBe('lats');
    expect(current.has('q')).toBe(false);

    expect(withSearchQuery(typed, '').toString()).toBe('muscle=lats');
  });
});

describe('enlaces de vuelta del catálogo', () => {
  it('la búsqueda vuelve con su texto y sus tres filtros', () => {
    const path = catalogSearchPath('press banca', {
      bodyPart: 'chest',
      muscle: 'pectorals',
      equipment: 'barbell',
    });
    const url = new URL(path, 'http://localhost');

    expect(url.pathname).toBe('/catalog');
    expect(url.searchParams.get('q')).toBe('press banca');
    expect(url.searchParams.get('bodyPart')).toBe('chest');
    expect(url.searchParams.get('muscle')).toBe('pectorals');
    expect(url.searchParams.get('equipment')).toBe('barbell');
    expect(searchBackLink('press', {})).toEqual({ to: '/catalog?q=press', label: 'Búsqueda' });
  });

  it('la parte del cuerpo vuelve con sus filtros, y sin ellos a la ruta limpia', () => {
    expect(bodyPartBackLink('back', { equipment: 'cable', muscle: 'lats' })).toEqual({
      to: '/catalog/back?equipment=cable&muscle=lats',
      label: 'Espalda',
    });
    expect(bodyPartBackLink('chest', {})).toEqual({ to: '/catalog/chest', label: 'Pecho' });
  });

  it('lee el enlace que dejó la lista', () => {
    const backTo = searchBackLink('remo', { muscle: 'lats' });

    expect(readCatalogBackLink(catalogBackState(backTo))).toEqual(backTo);
  });

  it('sin estado, con otra forma o fuera del catálogo, no hay enlace', () => {
    expect(readCatalogBackLink(null)).toBeNull();
    expect(readCatalogBackLink({ from: '/login' })).toBeNull();
    expect(readCatalogBackLink({ catalogBackTo: { to: '/catalog', label: '' } })).toBeNull();
    expect(
      readCatalogBackLink({ catalogBackTo: { to: '/history', label: 'Historial' } }),
    ).toBeNull();
    expect(
      readCatalogBackLink({ catalogBackTo: { to: '/catalogo-falso', label: 'Catálogo' } }),
    ).toBeNull();
    expect(
      readCatalogBackLink({ catalogBackTo: { to: 'https://example.com/catalog', label: 'x' } }),
    ).toBeNull();
  });
});
