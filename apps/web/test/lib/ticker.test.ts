import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTicker } from '../../src/lib/ticker';
import { elapsedSecondsSince } from '../../src/lib/time';

describe('createTicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('avisa a cada oyente en cada salto y la instantánea acompaña', () => {
    let clock = 1000;
    const ticker = createTicker(1000, () => clock);
    const seen: number[] = [];

    ticker.subscribe(() => {
      seen.push(ticker.getSnapshot());
    });

    clock = 2000;
    vi.advanceTimersByTime(1000);
    clock = 3000;
    vi.advanceTimersByTime(1000);

    expect(seen).toEqual([2000, 3000]);
    expect(ticker.getSnapshot()).toBe(3000);
  });

  it('la instantánea es estable entre saltos: React la compara por valor', () => {
    let clock = 1000;
    const ticker = createTicker(1000, () => clock);
    ticker.subscribe(() => undefined);

    clock = 1500;
    expect(ticker.getSnapshot()).toBe(ticker.getSnapshot());
    expect(ticker.getSnapshot()).toBe(1000);
  });

  it('el reloj se para al irse el último oyente y se refresca al volver el primero', () => {
    let clock = 1000;
    const ticker = createTicker(1000, () => clock);
    const unsubscribe = ticker.subscribe(() => undefined);

    unsubscribe();
    clock = 9000;
    vi.advanceTimersByTime(5000);
    expect(vi.getTimerCount()).toBe(0);
    expect(ticker.getSnapshot()).toBe(1000);

    ticker.subscribe(() => undefined);
    expect(ticker.getSnapshot()).toBe(9000);
  });

  it('un oyente que se va no impide que los demás sigan recibiendo', () => {
    let clock = 1000;
    const ticker = createTicker(1000, () => clock);
    const first = vi.fn();
    const second = vi.fn();

    const unsubscribeFirst = ticker.subscribe(first);
    ticker.subscribe(second);
    unsubscribeFirst();

    clock = 2000;
    vi.advanceTimersByTime(1000);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('elapsedSecondsSince', () => {
  const start = '2026-09-08T18:00:00.000Z';

  it('cuenta segundos completos', () => {
    expect(elapsedSecondsSince(start, Date.parse(start) + 90_900)).toBe(90);
  });

  it('nunca va hacia atrás', () => {
    expect(elapsedSecondsSince(start, Date.parse(start) - 5000)).toBe(0);
  });

  it('una fecha ilegible no propaga un NaN a la pantalla', () => {
    expect(elapsedSecondsSince('no es una fecha', Date.parse(start))).toBe(0);
  });
});
