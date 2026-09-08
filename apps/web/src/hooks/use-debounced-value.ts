import { useEffect, useState } from 'react';

/**
 * Devuelve `value` con retraso: solo cambia cuando lleva `delayMs` sin moverse. Es lo que
 * separa lo que se teclea de lo que se busca, para no lanzar una petición por letra.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debounced;
}
