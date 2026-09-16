import type { WeeklyCalendarBodyPart } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import { bodyMapLevels, bodyPartBreakdown, bodyPartNames } from '../../src/features/home/body-map';

const load = (
  bodyPart: WeeklyCalendarBodyPart['bodyPart'],
  setCount: number,
): WeeklyCalendarBodyPart => ({ bodyPart, setCount, volume: '0.00' });

describe('bodyMapLevels', () => {
  it('sin partes, el cuerpo entero queda en reposo', () => {
    expect(Object.values(bodyMapLevels([])).every((level) => level === null)).toBe(true);
  });

  it('enciende cada parte del día con su nivel y deja las demás apagadas', () => {
    const levels = bodyMapLevels([load('chest', 10), load('arms', 5), load('cardio', 1)]);

    expect(levels).toEqual({
      arms: 2,
      back: null,
      cardio: 1,
      chest: 4,
      core: null,
      legs: null,
      shoulders: null,
    });
  });

  it('una parte repetida se queda con su nivel más alto', () => {
    expect(bodyMapLevels([load('legs', 2), load('legs', 8)]).legs).toBe(3);
  });
});

describe('nombres de las partes del día', () => {
  it('une las partes como se diría en voz alta', () => {
    expect(bodyPartNames([])).toBe('');
    expect(bodyPartNames([load('chest', 8)])).toBe('Pecho');
    expect(bodyPartNames([load('chest', 8), load('arms', 2)])).toBe('Pecho y Brazos');
    expect(bodyPartNames([load('back', 9), load('arms', 4), load('core', 3)])).toBe(
      'Espalda, Brazos y Core',
    );
  });

  it('el desglose dice las series de cada parte', () => {
    expect(bodyPartBreakdown([load('chest', 8), load('cardio', 1)])).toBe(
      'Pecho 8 series, Cardio 1 serie',
    );
  });
});
