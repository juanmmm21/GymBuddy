import type { MascotState } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import {
  mascotAppearsIn,
  mascotLayoutIn,
  type MascotSpot,
} from '../../src/features/mascot/placement';

const STATES = {
  idle: { mood: 'idle', reason: 'on_track' },
  started: { mood: 'cheering', reason: 'session_started' },
  restOver: { mood: 'cheering', reason: 'rest_over' },
  resting: { mood: 'resting', remainingSeconds: 30 },
  celebrating: { mood: 'celebrating', recordAchievedAt: '2026-09-14T10:00:00.000Z' },
  absence: { mood: 'nudging', reason: 'absence', daysSinceLastSession: 5 },
  sleepy: { mood: 'sleepy', daysSinceLastSession: 9 },
} satisfies Record<string, MascotState>;

type StateName = keyof typeof STATES;

const WHERE: Readonly<Record<StateName, readonly MascotSpot[]>> = {
  idle: [],
  started: ['session'],
  restOver: ['rest'],
  resting: ['rest'],
  celebrating: ['home', 'session'],
  absence: ['home'],
  sleepy: ['home'],
};

describe('mascotAppearsIn', () => {
  it.each(Object.keys(STATES) as StateName[])('%s sale solo donde tiene algo que decir', (name) => {
    for (const spot of ['home', 'session', 'rest'] as const) {
      expect(mascotAppearsIn(STATES[name], spot)).toBe(WHERE[name].includes(spot));
    }
  });
});

describe('mascotLayoutIn', () => {
  it('un récord es siempre el aviso; en el descanso va integrada y en lo demás, como consejo', () => {
    expect(mascotLayoutIn(STATES.celebrating, 'session')).toBe('toast');
    expect(mascotLayoutIn(STATES.celebrating, 'home')).toBe('toast');
    expect(mascotLayoutIn(STATES.resting, 'rest')).toBe('inline');
    expect(mascotLayoutIn(STATES.absence, 'home')).toBe('tip');
    expect(mascotLayoutIn(STATES.started, 'session')).toBe('tip');
  });
});
