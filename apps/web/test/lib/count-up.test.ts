import { describe, expect, it } from 'vitest';
import { COUNT_UP_DURATION_MS, countUpValue } from '../../src/lib/count-up';

describe('countUpValue', () => {
  it('sale del número de partida y llega exactamente al de destino', () => {
    expect(countUpValue(0, 12, 0)).toBe(0);
    expect(countUpValue(0, 12, COUNT_UP_DURATION_MS)).toBe(12);
    // Pasarse de tiempo no pasa de largo el destino: la cifra se queda donde tiene que quedarse.
    expect(countUpValue(0, 12, COUNT_UP_DURATION_MS * 10)).toBe(12);
  });

  it('nunca retrocede y siempre da números enteros', () => {
    const steps = Array.from({ length: 40 }, (_, index) =>
      countUpValue(0, 25, (index * COUNT_UP_DURATION_MS) / 30),
    );

    expect(steps.every(Number.isInteger)).toBe(true);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(steps.at(-1)).toBe(25);
  });

  it('frena al llegar: a mitad de tiempo lleva más de la mitad del camino', () => {
    expect(countUpValue(0, 100, COUNT_UP_DURATION_MS / 2)).toBeGreaterThan(50);
  });

  it('cuenta igual hacia abajo, que es lo que pasa cuando una racha se pierde', () => {
    expect(countUpValue(8, 2, 0)).toBe(8);
    expect(countUpValue(8, 2, COUNT_UP_DURATION_MS / 2)).toBeLessThan(8);
    expect(countUpValue(8, 2, COUNT_UP_DURATION_MS)).toBe(2);
  });

  it('sin tiempo que repartir o con el reloj hacia atrás no inventa un valor intermedio', () => {
    expect(countUpValue(0, 7, 100, 0)).toBe(7);
    expect(countUpValue(0, 7, -50)).toBe(0);
  });
});
