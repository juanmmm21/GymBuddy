import { MAX_CARDIO_DURATION_SECONDS } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import { cardioDurationSoFar } from '../../src/features/session/cardio-in-progress';

const STARTED = '2026-09-15T18:00:00.000Z';
const after = (seconds: number): number => Date.parse(STARTED) + seconds * 1000;

describe('cardioDurationSoFar', () => {
  it('propone lo que lleva redondeado al minuto', () => {
    expect(cardioDurationSoFar(STARTED, after(25 * 60 + 29))).toBe(25 * 60);
    expect(cardioDurationSoFar(STARTED, after(25 * 60 + 30))).toBe(26 * 60);
  });

  it('nunca menos de un minuto, tampoco con el reloj del móvil atrasado', () => {
    expect(cardioDurationSoFar(STARTED, after(10))).toBe(60);
    expect(cardioDurationSoFar(STARTED, after(-300))).toBe(60);
  });

  it('nunca más de lo que admite una serie de cardio', () => {
    expect(cardioDurationSoFar(STARTED, after(MAX_CARDIO_DURATION_SECONDS * 2))).toBe(
      MAX_CARDIO_DURATION_SECONDS,
    );
  });
});
