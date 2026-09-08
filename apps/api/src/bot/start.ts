import { attachTelegramUser } from '../auth/nonce';
import { findOrCreateTelegramUser, type TelegramIdentity } from '../auth/users';
import type { Database } from '../db/client';

/**
 * Qué contestar a un `/start`. La lógica vive aquí y no dentro del handler de grammY para
 * poder probarla entera sin levantar un bot ni tocar la red: el handler solo traduce el
 * contexto de Telegram a esta función y su resultado a un mensaje.
 */
export type StartOutcome =
  | { readonly kind: 'linked'; readonly firstTime: boolean; readonly firstName: string }
  | { readonly kind: 'nonce_invalid' }
  | { readonly kind: 'no_nonce' };

export interface StartCommand {
  readonly identity: TelegramIdentity;
  /** Lo que Telegram pasa tras `/start`. Vacío si el usuario abrió el bot por su cuenta. */
  readonly payload: string;
  readonly now: Date;
}

export async function handleStartCommand(
  db: Database,
  command: StartCommand,
): Promise<StartOutcome> {
  const nonce = command.payload.trim();
  if (nonce === '') return { kind: 'no_nonce' };

  // El usuario se crea antes de saber si el nonce sirve: quien escribe al bot es alguien
  // real de todas formas, y así un enlace caducado no obliga a repetir el alta después.
  const { user, created } = await findOrCreateTelegramUser(db, command.identity, command.now);

  const linked = await attachTelegramUser(db, nonce, user.id, command.now);
  if (!linked) return { kind: 'nonce_invalid' };

  return { kind: 'linked', firstTime: created, firstName: user.firstName };
}

/** Los mensajes del bot, en un solo sitio para que no se escriban a mano en cada rama. */
export function startMessage(outcome: StartOutcome): string {
  switch (outcome.kind) {
    case 'linked':
      return outcome.firstTime
        ? `¡Hola, ${outcome.firstName}! Ya estás dentro. Vuelve a GymBuddy en el navegador: la sesión se abre sola.`
        : `Listo, ${outcome.firstName}. Vuelve a GymBuddy en el navegador: la sesión se abre sola.`;
    case 'nonce_invalid':
      return 'Ese enlace ya no vale: los enlaces de entrada caducan a los diez minutos y solo sirven una vez. Pide uno nuevo desde GymBuddy.';
    case 'no_nonce':
      return 'Soy el bot de GymBuddy. Para entrar, abre GymBuddy y pulsa el botón de acceso: te traerá aquí con un enlace de un solo uso.';
  }
}
