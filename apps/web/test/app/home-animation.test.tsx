import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { listEntranceDelayMs } from '../../src/components/index';
import { jsonResponse, type FakeFetch } from '../fake-fetch';
import { session, signals, weeklyCalendar } from '../fixtures';
import { renderApp } from './render-app';

const serveHome = (fake: FakeFetch): void => {
  fake.on('GET', '/stats/signals', () => jsonResponse(signals));
  fake.on('GET', '/stats/week', () => jsonResponse(weeklyCalendar));
};

/** El retraso con el que se enciende esa zona del día, tal como sale en el atributo `style`. */
function zoneDelay(day: HTMLElement, zone: string): string {
  const shape = day.querySelector(`[data-zone="${zone}"]`);
  if (!(shape instanceof SVGElement)) throw new Error(`no se pintó la zona ${zone}`);
  return shape.style.animationDelay;
}

describe('la semana se enciende al entrar', () => {
  it('las zonas entrenadas se encienden en orden de arriba abajo', async () => {
    renderApp({ path: '/', session, setup: serveHome });

    // El lunes fueron pecho y brazos: se encienden en ese orden, que es el del dibujo.
    const monday = await screen.findByRole('button', { name: 'Lunes: Pecho y Brazos' });
    expect(zoneDelay(monday, 'chest')).toBe(`${String(listEntranceDelayMs(0))}ms`);
    expect(zoneDelay(monday, 'arms')).toBe(`${String(listEntranceDelayMs(1))}ms`);
  });

  it('lo que ese día no se trabajó ya está puesto: no se enciende ni espera turno', async () => {
    renderApp({ path: '/', session, setup: serveHome });

    const monday = await screen.findByRole('button', { name: 'Lunes: Pecho y Brazos' });
    expect(zoneDelay(monday, 'legs')).toBe('');

    // Un día entrenado sin nada clasificable no tiene ninguna zona que encender.
    const wednesday = screen.getByRole('button', { name: 'Miércoles: Otro' });
    const lit = [...wednesday.querySelectorAll('[data-zone]')].filter(
      (zone) => zone instanceof SVGElement && zone.style.animationDelay !== '',
    );
    expect(lit).toEqual([]);
  });

  it('un día de cardio enciende el corazón cuando le toca', async () => {
    renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('GET', '/stats/week', () =>
          jsonResponse({
            ...weeklyCalendar,
            days: weeklyCalendar.days.map((day) =>
              day.dayIndex === 0
                ? {
                    ...day,
                    bodyParts: [
                      { bodyPart: 'legs' as const, setCount: 6, volume: '600.00' },
                      { bodyPart: 'cardio' as const, setCount: 1, volume: '0.00' },
                    ],
                  }
                : day,
            ),
          }),
        );
      },
    });

    // El corazón no es una zona del cuerpo: va el último aunque el cardio llegue antes en la lista.
    const monday = await screen.findByRole('button', { name: 'Lunes: Piernas y Cardio' });
    expect(zoneDelay(monday, 'legs')).toBe(`${String(listEntranceDelayMs(0))}ms`);
    expect(zoneDelay(monday, 'cardio')).toBe(`${String(listEntranceDelayMs(1))}ms`);
  });
});

describe('las cifras de Hoy', () => {
  it('sin poder preguntar por el movimiento salen enteras y se leen enteras', async () => {
    renderApp({ path: '/', session, setup: serveHome });

    const metrics = within(await screen.findByRole('region', { name: 'Cómo vas' }));
    expect(metrics.getByText('3 semanas')).toBeInTheDocument();
    expect(metrics.getByText('1 sesión')).toBeInTheDocument();
    // Nada se queda contando: en el árbol accesible está el número de verdad.
    expect(document.querySelectorAll('[data-counting]')).toHaveLength(0);
  });
});
