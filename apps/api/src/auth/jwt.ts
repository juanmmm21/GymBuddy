import { sign, verify } from 'hono/jwt';
import {
  JwtTokenExpired,
  JwtTokenInvalid,
  JwtTokenSignatureMismatched,
} from 'hono/utils/jwt/types';

/**
 * Treinta días. Es una app que se abre tres veces por semana desde el móvil: obligar a volver
 * a entrar cada poco sería fricción sin ganancia, y la sesión se corta igual borrando el token
 * del dispositivo. Quien la usa no llega a agotarlos nunca porque la sesión se renueva al
 * usarse (`shouldRenewSession`); quien la deja parada un mes vuelve a pasar por su llave.
 */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * El algoritmo va explícito al firmar **y al verificar**. Dejar que lo decida la cabecera
 * del token es la vía clásica de confusión de algoritmos: quien manda el token elegiría
 * con qué se comprueba.
 */
const SESSION_ALGORITHM = 'HS256';

export interface IssuedSession {
  readonly token: string;
  readonly expiresAt: string;
}

/** Lo que un token válido dice de sí mismo: de quién es y hasta cuándo vale. */
export interface VerifiedSession {
  readonly userId: string;
  /** Segundos desde la época, tal y como viaja en el `exp` del token. */
  readonly expiresAtSeconds: number;
}

/**
 * Se usa `hono/jwt`, que firma con HMAC-SHA256 sobre la Web Crypto API del propio runtime.
 * Es una dependencia que el proyecto ya tiene por el router, y escribir a mano la firma y
 * —sobre todo— la verificación de un JWT es justo el tipo de código propio que no conviene
 * tener. Lo que sí vive aquí son nuestros claims y el manejo de sus fallos.
 */
export async function issueSessionToken(
  userId: string,
  secret: string,
  now: Date,
): Promise<IssuedSession> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + SESSION_TTL_SECONDS;

  const token = await sign(
    { sub: userId, iat: issuedAt, exp: expiresAt },
    secret,
    SESSION_ALGORITHM,
  );

  return { token, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

/**
 * Devuelve de quién es el token y hasta cuándo vale, o `null` si falta, caducó, viene
 * manipulado o no lo firmamos nosotros. Los cuatro casos son lo mismo para quien pregunta:
 * no hay sesión.
 */
export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<VerifiedSession | null> {
  try {
    const payload = await verify(token, secret, SESSION_ALGORITHM);
    const subject = payload.sub;
    const expiresAtSeconds = payload.exp;

    // Sin `exp` no se sabe cuándo caduca, y todo token nuestro lo lleva: no es de los nuestros.
    if (typeof subject !== 'string' || subject === '') return null;
    if (typeof expiresAtSeconds !== 'number') return null;

    return { userId: subject, expiresAtSeconds };
  } catch (error) {
    // Cualquier fallo al verificar significa lo mismo para quien pregunta: no hay sesión.
    // Se capturan todos y no una lista de clases porque `hono/jwt` lanza una distinta por
    // cada forma de token roto (cabecera, algoritmo, firma, fechas...) y una lista se
    // queda corta en la siguiente versión — dejando que un token manipulado responda 500.
    if (!isExpectedTokenFailure(error)) {
      // Lo que no sea un token mal formado sí interesa verlo: sería un fallo nuestro.
      console.error('Fallo inesperado verificando un token de sesión', error);
    }

    return null;
  }
}

/**
 * ¿Toca darle un token nuevo? Cuando al actual le queda menos de la mitad de su vida. Quien
 * abre la app cada semana no vuelve a pasar por su llave nunca, y quien la deja parada quince
 * días sigue teniendo margen de sobra para volver sin que nadie le pida nada.
 *
 * La mitad, y no un umbral más corto, es lo que evita firmar un token nuevo en cada petición
 * de cada sesión: tras renovar, pasan quince días hasta que esta función vuelve a decir que sí.
 */
export function shouldRenewSession(session: VerifiedSession, now: Date): boolean {
  const remainingSeconds = session.expiresAtSeconds - Math.floor(now.getTime() / 1000);

  return remainingSeconds < SESSION_TTL_SECONDS / 2;
}

/** Las tres formas normales de token roto en una API pública; el resto es sospechoso. */
function isExpectedTokenFailure(error: unknown): boolean {
  return (
    error instanceof JwtTokenExpired ||
    error instanceof JwtTokenInvalid ||
    error instanceof JwtTokenSignatureMismatched
  );
}
