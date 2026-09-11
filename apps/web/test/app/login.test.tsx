import type {
  AuthenticationCredential,
  LoginOptionsResponse,
  RegistrationCredential,
  RegistrationOptionsResponse,
} from '@gymbuddy/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PasskeyCeremonyError } from '../../src/auth/passkey-authenticator';
import { SESSION_STORAGE_KEY } from '../../src/auth/session-store';
import { errorResponse, jsonResponse } from '../fake-fetch';
import { session, signals } from '../fixtures';
import { renderApp } from './render-app';

const CHALLENGE_ID = '9f1c2b3a-4d5e-4f60-8a7b-1c2d3e4f5a6b';

const loginOptions: LoginOptionsResponse = {
  challengeId: CHALLENGE_ID,
  options: {
    challenge: 'q7s9fW2l0sTg1mD8Yb3cXw',
    rpId: 'localhost',
    timeout: 120_000,
    userVerification: 'required',
    allowCredentials: [],
  },
};

const registrationOptions: RegistrationOptionsResponse = {
  challengeId: CHALLENGE_ID,
  options: {
    challenge: 'q7s9fW2l0sTg1mD8Yb3cXw',
    rp: { name: 'GymBuddy', id: 'localhost' },
    user: { id: 'NGQyYTZkOWM', name: 'Juan', displayName: 'Juan' },
    pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
    timeout: 120_000,
    attestation: 'none',
    excludeCredentials: [],
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
    },
    extensions: { credProps: true },
    hints: [],
  },
};

const assertion: AuthenticationCredential = {
  id: 'AQIDBAUGBwg',
  rawId: 'AQIDBAUGBwg',
  type: 'public-key',
  clientExtensionResults: {},
  response: {
    clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0In0',
    authenticatorData: 'SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAAAQ',
    signature: 'MEUCIQDTGOxqmWe',
    userHandle: 'NGQyYTZkOWM',
  },
};

const attestation: RegistrationCredential = {
  id: 'AQIDBAUGBwg',
  rawId: 'AQIDBAUGBwg',
  type: 'public-key',
  clientExtensionResults: {},
  response: {
    clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIn0',
    attestationObject: 'o2NmbXRkbm9uZWdhdHRTdG10oA',
    transports: ['internal'],
  },
};

const unused = (): Promise<never> => Promise.reject(new Error('Este test no usa esta ceremonia'));

describe('entrada con llave de acceso', () => {
  it('sin sesión, cualquier pantalla lleva a la entrada', async () => {
    renderApp({ path: '/exercises' });

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('entra con la llave del móvil y abre sesión', async () => {
    const user = userEvent.setup();
    const get = vi.fn((_options: LoginOptionsResponse['options']) => Promise.resolve(assertion));

    const { fake, storage } = renderApp({
      path: '/',
      authenticator: { isSupported: () => true, create: unused, get },
      setup: (fake) => {
        fake.on('POST', '/auth/login/options', () => jsonResponse(loginOptions));
        fake.on('POST', '/auth/login/verify', (request) => {
          expect(request.body).toEqual({ challengeId: CHALLENGE_ID, credential: assertion });
          return jsonResponse(session);
        });
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Hola, Juan' })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(loginOptions.options);
    expect(storage.data.get(SESSION_STORAGE_KEY)).toBe(JSON.stringify(session));

    // La sesión recién abierta ya viaja en la siguiente petición.
    const signalsRequest = fake.requests.find((request) => request.path === '/stats/signals');
    expect(signalsRequest?.headers.get('Authorization')).toBe(`Bearer ${session.token}`);
  });

  it('se registra con una invitación tecleada a su manera', async () => {
    const user = userEvent.setup();
    const create = vi.fn((_options: RegistrationOptionsResponse['options']) =>
      Promise.resolve(attestation),
    );

    renderApp({
      path: '/login',
      authenticator: { isSupported: () => true, create, get: unused },
      setup: (fake) => {
        fake.on('POST', '/auth/registration/options', (request) => {
          // jsdom dice que el navegador está en inglés: la cuenta arranca en inglés.
          expect(request.body).toEqual({
            invitationCode: 'ABCDEFGHJKMN',
            displayName: 'Juan',
            locale: 'en',
          });
          return jsonResponse(registrationOptions);
        });
        fake.on('POST', '/auth/registration/verify', (request) => {
          expect(request.body).toEqual({ challengeId: CHALLENGE_ID, credential: attestation });
          return jsonResponse(session, 201);
        });
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Tengo una invitación' }));
    const submit = screen.getByRole('button', { name: 'Crear mi acceso' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Código de invitación'), 'abcd-efgh-jkmn');
    await user.type(screen.getByLabelText('Tu nombre'), ' Juan ');
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(await screen.findByRole('heading', { name: 'Hola, Juan' })).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith(registrationOptions.options);
  });

  it('avisa de un código mal escrito antes de enviarlo', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/login' });

    await user.click(await screen.findByRole('button', { name: 'Tengo una invitación' }));
    await user.type(screen.getByLabelText('Código de invitación'), 'ABCD');
    await user.type(screen.getByLabelText('Tu nombre'), 'Juan');

    expect(screen.getByText('Son doce letras y números, como ABCD-EFGH-JKMN.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear mi acceso' })).toBeDisabled();
  });

  it('un código que no sirve lo explica y deja volver a intentarlo', async () => {
    const user = userEvent.setup();

    renderApp({
      path: '/login',
      authenticator: { isSupported: () => true, create: unused, get: unused },
      setup: (fake) => {
        fake.on('POST', '/auth/registration/options', () =>
          errorResponse('invitation_invalid', 400, 'no sirve'),
        );
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Tengo una invitación' }));
    await user.type(screen.getByLabelText('Código de invitación'), 'ABCD-EFGH-JKMN');
    await user.type(screen.getByLabelText('Tu nombre'), 'Juan');
    await user.click(screen.getByRole('button', { name: 'Crear mi acceso' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El código no sirve');
    expect(screen.getByLabelText('Código de invitación')).toHaveValue('ABCD-EFGH-JKMN');
    expect(screen.getByRole('button', { name: 'Crear mi acceso' })).toBeEnabled();
  });

  it('cancelar en el móvil lo dice sin alarmar y sin llegar a verificar', async () => {
    const user = userEvent.setup();

    const { fake } = renderApp({
      path: '/login',
      authenticator: {
        isSupported: () => true,
        create: unused,
        get: () => Promise.reject(new PasskeyCeremonyError('cancelled', 'cancelado')),
      },
      setup: (fake) => {
        fake.on('POST', '/auth/login/options', () => jsonResponse(loginOptions));
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'en este móvil no hay ninguna llave de GymBuddy',
    );
    expect(fake.requests.some((request) => request.path === '/auth/login/verify')).toBe(false);
  });

  it('un navegador sin llaves de acceso lo dice sin llamar al servidor', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({ path: '/login' });

    await user.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByText('Este navegador no puede usar llaves de acceso'),
    ).toBeInTheDocument();
    expect(fake.requests).toEqual([]);
  });

  it('sin red al empezar lo dice, sin reventar', async () => {
    const user = userEvent.setup();

    renderApp({
      path: '/login',
      authenticator: { isSupported: () => true, create: unused, get: unused },
      setup: (fake) => {
        fake.on('POST', '/auth/login/options', () => {
          throw new TypeError('Failed to fetch');
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
  });

  it('con sesión, la entrada redirige al inicio', async () => {
    renderApp({
      path: '/login',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    expect(await screen.findByRole('heading', { name: 'Hola, Juan' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Entrar' })).not.toBeInTheDocument();
    });
  });
});
