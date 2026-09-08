import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from '../../src/hooks/use-debounced-value';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('arranca con el valor inicial y solo cambia tras la pausa', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: 'p' },
    });
    expect(result.current).toBe('p');

    rerender({ value: 'pr' });
    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(result.current).toBe('p');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('pr');
  });

  it('cada cambio reinicia la espera: tecleando seguido no se publica nada intermedio', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: '' },
    });

    for (const value of ['p', 'pr', 'pre', 'pres', 'press']) {
      rerender({ value });
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }
    expect(result.current).toBe('');

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe('press');
  });
});
