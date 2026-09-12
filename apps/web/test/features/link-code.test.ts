import { describe, expect, it } from 'vitest';
import { secondsUntil } from '../../src/features/devices/link-code';

const NOW = Date.parse('2026-09-12T10:00:00.000Z');

describe('lo que le queda al código de un dispositivo', () => {
  it('cuenta hacia arriba en segundos enteros: nunca dice menos de lo que queda', () => {
    expect(secondsUntil('2026-09-12T10:10:00.000Z', NOW)).toBe(600);
    expect(secondsUntil('2026-09-12T10:00:00.500Z', NOW)).toBe(1);
  });

  it('caducado es cero, no un número negativo', () => {
    expect(secondsUntil('2026-09-12T10:00:00.000Z', NOW)).toBe(0);
    expect(secondsUntil('2026-09-12T09:59:00.000Z', NOW)).toBe(0);
  });
});
