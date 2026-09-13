import { describe, expect, it } from 'vitest';
import { homeSessionState } from '../../src/features/home/open-session';
import { activeSession, signals } from '../fixtures';

const openSignals = {
  ...signals,
  activeSessionId: activeSession.id,
  lastSessionAt: activeSession.startedAt,
};

describe('homeSessionState', () => {
  it('una sesión abierta sin cobertura se sigue aunque las señales no la conozcan', () => {
    const startedAt = '2026-09-09T07:00:00.000Z';
    const open = {
      session: { ...activeSession, id: 'c0ffee00-1234-4abc-9def-0123456789ab', startedAt },
      pendingSetIds: new Set<string>(),
    };

    expect(homeSessionState(signals, open)).toEqual({ kind: 'open', startedAt });
  });

  it('una sesión cerrada sin cobertura ya no se ofrece seguir aunque las señales digan abierta', () => {
    expect(homeSessionState(openSignals, { session: null, pendingSetIds: new Set() })).toEqual({
      kind: 'none',
    });
  });

  it('sin la sesión leída, manda lo que dicen las señales', () => {
    expect(homeSessionState(openSignals, undefined)).toEqual({
      kind: 'open',
      startedAt: activeSession.startedAt,
    });
    expect(homeSessionState(signals, undefined)).toEqual({ kind: 'none' });
  });
});
