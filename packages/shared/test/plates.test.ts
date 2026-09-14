import { describe, expect, it } from 'vitest';
import { OLYMPIC_BAR_GRAMS, barbellLoad } from '../src/domain/plates';

describe('barbellLoad', () => {
  it('la barra sola no lleva discos', () => {
    expect(barbellLoad(OLYMPIC_BAR_GRAMS)).toEqual({ perSide: [], remainderGrams: 0 });
  });

  it('reparte por lado del disco más pesado al más ligero', () => {
    expect(barbellLoad(60_000)?.perSide).toEqual([20_000]);
    expect(barbellLoad(80_000)?.perSide).toEqual([25_000, 5_000]);
    expect(barbellLoad(95_000)?.perSide).toEqual([25_000, 10_000, 2_500]);
    expect(barbellLoad(102_500)?.perSide).toEqual([25_000, 15_000, 1_250]);
    expect(barbellLoad(105_000)?.perSide).toEqual([25_000, 15_000, 2_500]);
  });

  it('repite el disco de 25 kg cuando hace falta', () => {
    expect(barbellLoad(140_000)).toEqual({ perSide: [25_000, 25_000, 10_000], remainderGrams: 0 });
  });

  it('lo que no se puede cargar exacto se devuelve, no se redondea', () => {
    // 81 kg: 30,5 kg por lado; con discos de 1,25 se llega a 30 y sobra 1 kg en total.
    expect(barbellLoad(81_000)).toEqual({ perSide: [25_000, 5_000], remainderGrams: 1_000 });
    expect(barbellLoad(82_510)).toEqual({ perSide: [25_000, 5_000, 1_250], remainderGrams: 10 });
  });

  it('por debajo de la barra no hay barra cargada que dibujar', () => {
    expect(barbellLoad(15_000)).toBeNull();
    expect(barbellLoad(0)).toBeNull();
  });

  it('solo trabaja con gramos enteros', () => {
    expect(barbellLoad(82_500.5)).toBeNull();
  });

  it('acepta otra barra', () => {
    expect(barbellLoad(30_000, 10_000)?.perSide).toEqual([10_000]);
  });
});
