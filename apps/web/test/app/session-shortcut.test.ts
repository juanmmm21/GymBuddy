import { describe, expect, it } from 'vitest';
import { sessionShortcutFor } from '../../src/app/session-shortcut';
import { activeSession, pastSession } from '../fixtures';

describe('sessionShortcutFor', () => {
  it('con una sesión abierta, el atajo cronometra desde su inicio', () => {
    expect(sessionShortcutFor({ session: activeSession, pendingSetIds: new Set() })).toEqual({
      kind: 'live',
      startedAt: activeSession.startedAt,
    });
  });

  it('sin sesión abierta no hay atajo', () => {
    expect(sessionShortcutFor({ session: null, pendingSetIds: new Set() })).toEqual({
      kind: 'hidden',
    });
  });

  it('sin la sesión leída no se supone nada: no hay atajo', () => {
    expect(sessionShortcutFor(undefined)).toEqual({ kind: 'hidden' });
  });

  it('una sesión que ya terminó tampoco lo tiene', () => {
    expect(sessionShortcutFor({ session: pastSession, pendingSetIds: new Set() })).toEqual({
      kind: 'hidden',
    });
  });
});
