import { describe, expect, it } from 'vitest';
import {
  LIST_ENTRANCE_MAX_STEP,
  listEntranceDelayMs,
  listEntranceProps,
} from '../../src/components/list-entrance/list-entrance';
import { motionDuration } from '../../src/design/tokens';

describe('listEntranceDelayMs', () => {
  it('la primera tarjeta entra sin esperar a nadie', () => {
    expect(listEntranceDelayMs(0)).toBe(0);
  });

  it('cada tarjeta entra un paso después de la anterior', () => {
    expect(listEntranceDelayMs(1)).toBe(motionDuration.stagger);
    expect(listEntranceDelayMs(3)).toBe(3 * motionDuration.stagger);
  });

  it('pasado el tope, todas entran con el mismo retraso', () => {
    const cap = LIST_ENTRANCE_MAX_STEP * motionDuration.stagger;

    expect(listEntranceDelayMs(LIST_ENTRANCE_MAX_STEP)).toBe(cap);
    expect(listEntranceDelayMs(LIST_ENTRANCE_MAX_STEP + 1)).toBe(cap);
    // Una página de cincuenta ejercicios del catálogo no tarda más que las seis primeras filas.
    expect(listEntranceDelayMs(49)).toBe(cap);
  });

  it('el escalonado entero cabe en lo que tarda una pantalla en entrar dos veces', () => {
    expect(LIST_ENTRANCE_MAX_STEP * motionDuration.stagger).toBeLessThanOrEqual(
      2 * motionDuration.base,
    );
  });

  it('una posición imposible no rompe nada', () => {
    expect(listEntranceDelayMs(-3)).toBe(0);
    expect(listEntranceDelayMs(Number.NaN)).toBe(0);
  });
});

describe('listEntranceProps', () => {
  it('lleva la clase de la animación y el retraso de su turno', () => {
    const props = listEntranceProps(2);

    expect(props.className).not.toBe('');
    expect(props.style.animationDelay).toBe(`${String(2 * motionDuration.stagger)}ms`);
  });
});
