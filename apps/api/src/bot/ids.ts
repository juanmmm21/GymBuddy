/**
 * El mensaje de Telegram que describe una serie. Es la llave de todo lo que el bot escribe
 * a partir de él: dentro de un chat, `message_id` no se repite.
 */
export interface TelegramMessageRef {
  readonly chatId: number;
  readonly messageId: number;
}

/** Lo que el bot puede crear a partir de un mismo mensaje, cada cosa con su identificador. */
export type MessageResource = 'set' | 'session' | 'exercise';

const UUID_BYTES = 16;

/**
 * El identificador de lo que crea un mensaje, siempre el mismo para el mismo mensaje.
 * Telegram reenvía un update si no recibe el 2xx a tiempo y un botón se puede pulsar dos
 * veces: con un UUID aleatorio cada repetición sería una serie más, y con este es un
 * reenvío que la API ya sabe contestar con lo que hay. Es la idempotencia por identificador
 * del cliente que usa la cola offline de la PWA, con el mensaje haciendo de cliente.
 */
export async function messageResourceId(
  ref: TelegramMessageRef,
  resource: MessageResource,
): Promise<string> {
  const seed = `telegram:${String(ref.chatId)}:${String(ref.messageId)}:${resource}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  const bytes = new Uint8Array(digest).slice(0, UUID_BYTES);

  // Versión 8 (UUID a medida, RFC 9562) y variante RFC: son los dos campos que comprueba
  // `z.uuid()` del contrato, y sin ellos el Worker rechazaría su propio identificador.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
