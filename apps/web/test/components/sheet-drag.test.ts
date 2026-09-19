import { describe, expect, it } from 'vitest';
import {
  SHEET_DRAG_CLOSE_DISTANCE,
  SHEET_FLICK_DISTANCE,
  SHEET_FLICK_VELOCITY,
  sheetDragOffset,
  sheetDragOutcome,
} from '../../src/components/index';

describe('arrastrar la hoja hacia abajo', () => {
  it('acompaña al dedo hacia abajo', () => {
    expect(sheetDragOffset(0)).toBe(0);
    expect(sheetDragOffset(48)).toBe(48);
  });

  it('hacia arriba no se despega: arriba no hay nada que enseñar', () => {
    expect(sheetDragOffset(-80)).toBe(0);
  });

  it('un movimiento sin número no mueve la hoja', () => {
    expect(sheetDragOffset(Number.NaN)).toBe(0);
  });
});

describe('qué pasa al soltar la hoja', () => {
  it('pasada la distancia se cierra, por despacio que se haya hecho', () => {
    expect(sheetDragOutcome({ distance: SHEET_DRAG_CLOSE_DISTANCE, elapsedMs: 4000 })).toBe(
      'close',
    );
  });

  it('un manotazo corto pero rápido también la cierra', () => {
    const distance = SHEET_FLICK_DISTANCE + 1;
    expect(sheetDragOutcome({ distance, elapsedMs: distance / SHEET_FLICK_VELOCITY })).toBe(
      'close',
    );
  });

  it('bajarla despacio para leerla la deja donde estaba', () => {
    expect(sheetDragOutcome({ distance: SHEET_DRAG_CLOSE_DISTANCE - 1, elapsedMs: 1500 })).toBe(
      'stay',
    );
  });

  it('un toque en la cabecera no cierra nada', () => {
    expect(sheetDragOutcome({ distance: 0, elapsedMs: 40 })).toBe('stay');
    expect(sheetDragOutcome({ distance: SHEET_FLICK_DISTANCE - 1, elapsedMs: 1 })).toBe('stay');
  });

  it('un gesto sin tiempo medible no se toma por un manotazo', () => {
    // Dividir por cero daría velocidad infinita: cualquier roce cerraría la hoja.
    expect(sheetDragOutcome({ distance: SHEET_FLICK_DISTANCE + 1, elapsedMs: 0 })).toBe('stay');
  });

  it('un recorrido sin número deja la hoja donde estaba', () => {
    expect(sheetDragOutcome({ distance: Number.NaN, elapsedMs: 100 })).toBe('stay');
  });
});
