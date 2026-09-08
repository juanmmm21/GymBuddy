import { describe, expect, it } from 'vitest';
import { nextPageOffset } from '../../src/lib/paging';
import { catalogPage, catalogSummaries } from '../fixtures';

describe('nextPageOffset', () => {
  it('sigue donde acaba la página mientras falten filas', () => {
    expect(nextPageOffset(catalogPage(catalogSummaries(50), 163, 0))).toBe(50);
    expect(nextPageOffset(catalogPage(catalogSummaries(50, 100), 163, 100))).toBe(150);
  });

  it('se detiene al alcanzar el total, también cuando la última página es corta', () => {
    expect(nextPageOffset(catalogPage(catalogSummaries(13, 150), 163, 150))).toBeUndefined();
    expect(nextPageOffset(catalogPage(catalogSummaries(50), 50, 0))).toBeUndefined();
  });

  it('una página vacía corta la cadena aunque el total diga que queda algo', () => {
    expect(nextPageOffset(catalogPage([], 163, 150))).toBeUndefined();
  });
});
