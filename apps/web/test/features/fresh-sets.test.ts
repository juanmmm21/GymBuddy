import type { ResourceId } from '@gymbuddy/shared';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { addedIds, useFreshSetIds } from '../../src/features/session/fresh-sets';

const FIRST: ResourceId = 'f2ab8c4d-5e6f-4a72-8b3c-4d5e6f7a8b9c';
const SECOND: ResourceId = '9cd37e5f-8a01-4c23-9e4f-6a7b8c9d0e1f';
const THIRD: ResourceId = '03bc9d5e-6f7a-4b83-9c4d-5e6f7a8b9c0d';

describe('addedIds', () => {
  it('son los que no estaban', () => {
    expect(addedIds(new Set([FIRST]), [FIRST, SECOND])).toEqual([SECOND]);
  });

  it('sin nada nuevo no hay nada que resaltar', () => {
    expect(addedIds(new Set([FIRST, SECOND]), [FIRST, SECOND])).toEqual([]);
  });
});

describe('useFreshSetIds', () => {
  it('lo que ya estaba al abrir la sesión no entra resaltado', () => {
    const { result } = renderHook(() => useFreshSetIds([FIRST, SECOND]));

    expect([...result.current]).toEqual([]);
  });

  it('resalta la serie que acaba de aparecer, y solo esa', () => {
    const { result, rerender } = renderHook((ids: readonly ResourceId[]) => useFreshSetIds(ids), {
      initialProps: [FIRST] as readonly ResourceId[],
    });

    rerender([FIRST, SECOND]);
    expect([...result.current]).toEqual([SECOND]);

    rerender([FIRST, SECOND, THIRD]);
    expect([...result.current]).toEqual([THIRD]);
  });

  it('repintar con la misma lista no vuelve a encender nada', () => {
    const { result, rerender } = renderHook((ids: readonly ResourceId[]) => useFreshSetIds(ids), {
      initialProps: [FIRST] as readonly ResourceId[],
    });

    rerender([FIRST, SECOND]);
    rerender([FIRST, SECOND]);

    expect([...result.current]).toEqual([SECOND]);
  });

  it('una serie borrada que vuelve a aparecer ya no es nueva', () => {
    const { result, rerender } = renderHook((ids: readonly ResourceId[]) => useFreshSetIds(ids), {
      initialProps: [FIRST, SECOND] as readonly ResourceId[],
    });

    rerender([FIRST]);
    rerender([FIRST, SECOND]);

    expect([...result.current]).toEqual([]);
  });
});
