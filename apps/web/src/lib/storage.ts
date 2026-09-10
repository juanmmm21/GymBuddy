/**
 * Subconjunto de `Storage` que usa la PWA: lo justo para sustituirlo en los tests. Lo
 * comparten la sesión de entrada y lo que cada pantalla recuerda en el dispositivo, así
 * que los tests inyectan un único almacenamiento en memoria y leen de él lo que se guardó.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
