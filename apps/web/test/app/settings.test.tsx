import type { UpdateUserRequest } from '@gymbuddy/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { installSupport, USER_AGENTS } from '../install-fixtures';
import { errorResponse, jsonResponse } from '../fake-fetch';
import { session, signals } from '../fixtures';
import { SESSION_STORAGE_KEY } from '../../src/auth/session-store';
import { renderApp } from './render-app';

describe('ajustes', () => {
  it('Hoy solo lleva un botón a Ajustes, sin enlaces de cuenta en la cabecera', async () => {
    renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    expect(await screen.findByRole('link', { name: 'Ajustes' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Invitar a un amigo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salir' })).not.toBeInTheDocument();
  });

  it('reúne la cuenta, los dispositivos, la copia y la instalación, y vuelve a Hoy', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/settings',
      session,
      install: installSupport(USER_AGENTS.iphoneSafari),
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeInTheDocument();
    expect(screen.getByText(`Entraste como ${session.user.displayName}`)).toBeInTheDocument();
    for (const entry of [
      'Añadir otro dispositivo',
      'Invitar a un amigo',
      'Copia de seguridad',
      'Instalar la app',
    ]) {
      expect(screen.getByRole('link', { name: new RegExp(`^${entry}`) })).toBeInTheDocument();
    }

    // La vuelta de la cabecera, no la pestaña «Hoy» de abajo.
    const header = screen.getByRole('heading', { name: 'Ajustes' }).closest('header');
    if (header === null) throw new Error('La pantalla de Ajustes tiene cabecera');
    await user.click(within(header).getByRole('link', { name: /Hoy/ }));
    expect(await screen.findByRole('link', { name: 'Ajustes' })).toBeInTheDocument();
  });

  it('acredita el catálogo externo en su propia sección', async () => {
    renderApp({
      path: '/settings',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    expect(await screen.findByRole('heading', { name: 'Créditos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /catálogo de ejercicios en GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/JahelCuadrado/ExerciseGymGifsDB',
    );
  });

  it('las pantallas de la cuenta vuelven a Ajustes, no a Hoy', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/settings',
      session,
      setup: (fake) => {
        fake.on('GET', '/auth/invitations', () => jsonResponse({ pending: [] }));
      },
    });

    await user.click(await screen.findByRole('link', { name: /^Invitar a un amigo/ }));
    expect(await screen.findByRole('heading', { name: 'Invitar a un amigo' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /Ajustes/ }));
    expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeInTheDocument();
  });

  it('cambia el nombre, lo guarda en el móvil y Hoy saluda con el nuevo', async () => {
    const user = userEvent.setup();
    const { fake, storage } = renderApp({
      path: '/settings',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('PATCH', '/auth/me', (request) => {
          const body = request.body as UpdateUserRequest;
          return jsonResponse({ ...session.user, displayName: body.displayName });
        });
      },
    });

    const field = await screen.findByRole('textbox', { name: 'Nombre' });
    expect(field).toHaveValue('Juan');
    // Sin cambios no hay nada que guardar.
    expect(screen.getByRole('button', { name: 'Guardar nombre' })).toBeDisabled();

    await user.clear(field);
    await user.type(field, '  Juanma ');
    await user.click(screen.getByRole('button', { name: 'Guardar nombre' }));

    expect(await screen.findByText('Nombre guardado')).toBeInTheDocument();
    expect(screen.getByText('Entraste como Juanma')).toBeInTheDocument();
    expect(field).toHaveValue('Juanma');
    expect(fake.requests.find((request) => request.method === 'PATCH')?.body).toEqual({
      displayName: 'Juanma',
    });

    // Sobrevive a recargar: el usuario vive en la sesión guardada.
    const stored = JSON.parse(storage.data.get(SESSION_STORAGE_KEY) ?? 'null') as {
      user: { displayName: string };
    } | null;
    expect(stored?.user.displayName).toBe('Juanma');

    const header = screen.getByRole('heading', { name: 'Ajustes' }).closest('header');
    if (header === null) throw new Error('La pantalla de Ajustes tiene cabecera');
    await user.click(within(header).getByRole('link', { name: /Hoy/ }));
    expect(await screen.findByRole('heading', { name: 'Hola, Juanma' })).toBeInTheDocument();
  });

  it('un nombre vacío no se puede guardar', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({ path: '/settings', session });

    const field = await screen.findByRole('textbox', { name: 'Nombre' });
    await user.clear(field);
    await user.type(field, '   ');

    expect(screen.getByRole('button', { name: 'Guardar nombre' })).toBeDisabled();
    expect(fake.requests.some((request) => request.method === 'PATCH')).toBe(false);
  });

  it('un fallo al guardar se ve y el nombre de la sesión no cambia', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/settings',
      session,
      setup: (fake) => {
        fake.on('PATCH', '/auth/me', () =>
          errorResponse('validation_failed', 400, 'El nombre no es válido'),
        );
      },
    });

    const field = await screen.findByRole('textbox', { name: 'Nombre' });
    await user.clear(field);
    await user.type(field, 'Juanma');
    await user.click(screen.getByRole('button', { name: 'Guardar nombre' }));

    expect(await screen.findByText('No se pudo guardar')).toBeInTheDocument();
    expect(screen.getByText('Entraste como Juan')).toBeInTheDocument();

    // Volver a teclear retira el aviso: ya no habla de lo que hay escrito.
    await user.type(field, 'n');
    expect(screen.queryByText('No se pudo guardar')).not.toBeInTheDocument();
  });
});
