/**
 * Compara dos secretos sin filtrar por dónde dejan de parecerse. Se comparan los digest
 * SHA-256 y no las cadenas: así el tiempo tampoco depende de la longitud, que con una
 * comparación directa sería el primer dato que se escapa.
 */
export async function constantTimeEquals(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);

  const a = new Uint8Array(leftDigest);
  const b = new Uint8Array(rightDigest);

  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    // Se recorren siempre los 32 bytes: cortar al primer fallo es justo la fuga que se evita.
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }

  return difference === 0;
}
