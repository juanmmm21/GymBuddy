import { describe, expect, it } from 'vitest';
import { ApiRequestError, ApiTransportError } from '../../src/api/client';
import {
  describePendingWrites,
  droppedWriteReason,
  droppedWriteTitle,
} from '../../src/offline/labels';
import { activeSession } from '../fixtures';

describe('textos de la cola offline', () => {
  it('cuenta lo pendiente en singular y en plural', () => {
    expect(describePendingWrites(1)).toBe('1 cambio sin sincronizar');
    expect(describePendingWrites(3)).toBe('3 cambios sin sincronizar');
  });

  it('el titular dice qué escritura se perdió', () => {
    expect(
      droppedWriteTitle({
        kind: 'remove_set',
        sessionId: activeSession.id,
        setId: activeSession.id,
      }),
    ).toBe('No se borró una serie');
    expect(
      droppedWriteTitle({
        kind: 'end_session',
        sessionId: activeSession.id,
        body: { endedAt: '2026-09-08T19:00:00.000Z' },
      }),
    ).toBe('No se pudo cerrar la sesión');
  });

  it('los choques con otro móvil se explican con su propio texto', () => {
    expect(droppedWriteReason(new ApiRequestError('session_closed', 409, 'Cerrada'))).toMatch(
      /ya estaba cerrada/,
    );
    expect(droppedWriteReason(new ApiRequestError('session_already_open', 409, 'Abierta'))).toMatch(
      /otra sesión abierta/,
    );
  });

  it('el resto cae en la descripción de siempre', () => {
    expect(droppedWriteReason(new ApiRequestError('not_found', 404, 'No existe la serie'))).toBe(
      'No existe la serie',
    );
    expect(droppedWriteReason(new ApiTransportError('sin red'))).toMatch(/Sin conexión/);
  });
});
