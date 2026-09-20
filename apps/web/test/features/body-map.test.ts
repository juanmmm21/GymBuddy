import type { WeeklyCalendarBodyPart } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import {
  bodyMapEntranceStep,
  bodyMapLevels,
  bodyPartBreakdown,
  bodyPartNames,
} from '../../src/features/home/body-map';

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

describe('bodyMapEntranceStep', () => {
  it('las zonas encendidas toman turno de arriba abajo, sin contar las apagadas', () => {
    const levels = bodyMapLevels([load('legs', 6), load('chest', 4)]);

    expect(bodyMapEntranceStep(levels, 'chest')).toBe(0);
    expect(bodyMapEntranceStep(levels, 'legs')).toBe(1);
  });

  it('una zona que ese día no se trabajó no tiene turno: ya está puesta', () => {
    const levels = bodyMapLevels([load('chest', 4)]);

    expect(bodyMapEntranceStep(levels, 'back')).toBeNull();
    expect(bodyMapEntranceStep(levels, 'cardio')).toBeNull();
  });

  it('el corazón del cardio se enciende el último: no es una zona del cuerpo', () => {
    const levels = bodyMapLevels([load('cardio', 2), load('shoulders', 3)]);

    expect(bodyMapEntranceStep(levels, 'shoulders')).toBe(0);
    expect(bodyMapEntranceStep(levels, 'cardio')).toBe(1);
  });

  it('un día sin nada clasificable no enciende nada', () => {
    const levels = bodyMapLevels([]);

    expect(bodyMapEntranceStep(levels, 'legs')).toBeNull();
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
