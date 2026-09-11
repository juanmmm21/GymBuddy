import { sign, verify } from 'hono/jwt';
import {
  JwtTokenExpired,
  JwtTokenInvalid,
  JwtTokenSignatureMismatched,
} from 'hono/utils/jwt/types';

/**
 * Treinta días. Es una app que se abre tres veces por semana desde el móvil: obligar a volver
 * a entrar cada poco sería fricción sin ganancia, y la sesión se corta igual borrando el token
 * del dispositivo.
 */
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

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
 * Devuelve el identificador del usuario, o `null` si el token falta, caducó, viene
 * manipulado o no lo firmamos nosotros. Los cuatro casos son lo mismo para quien pregunta:
 * no hay sesión.
 */
export async function verifySessionToken(token: string, secret: string): Promise<string | null> {
  try {
    const payload = await verify(token, secret, SESSION_ALGORITHM);
    const subject = payload.sub;

    return typeof subject === 'string' && subject !== '' ? subject : null;
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

/** Las tres formas normales de token roto en una API pública; el resto es sospechoso. */
function isExpectedTokenFailure(error: unknown): boolean {
  return (
    error instanceof JwtTokenExpired ||
    error instanceof JwtTokenInvalid ||
    error instanceof JwtTokenSignatureMismatched
  );
}
