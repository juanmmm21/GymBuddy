import { describe, expect, it } from 'vitest';
import { buildCatalogRows, normalizeSearchText } from '../src/catalog/snapshot';
import { sourceMuscleFileSchema } from '../src/catalog/source';
import {
  ARCHER_PUSH_UP_EN,
  ARCHER_PUSH_UP_ES,
  BENCH_PRESS_EN,
  BENCH_PRESS_ES,
  muscleFile,
  type MuscleFileFixture,
} from './catalog-fixtures';

const SYNCED_AT = '2026-09-08T10:00:00.000Z';

const parse = (file: MuscleFileFixture) => sourceMuscleFileSchema.parse(file);

const build = (spanish: MuscleFileFixture, english: MuscleFileFixture) =>
  buildCatalogRows({
    muscle: 'pectorals',
    spanish: parse(spanish),
    english: parse(english),
    catalogVersion: 'v1.1.0',
    syncedAt: SYNCED_AT,
  });

describe('normalizeSearchText', () => {
  it('quita acentos y mayúsculas: es lo que hace que "biceps" encuentre "bíceps"', () => {
    expect(normalizeSearchText('Flexión del Arquero')).toBe('flexion del arquero');
    expect(normalizeSearchText('Curl de bíceps')).toBe('curl de biceps');
  });

  it('convierte la puntuación en separadores y colapsa los espacios', () => {
    expect(normalizeSearchText('Estiramiento, lateral,  cuello')).toBe(
      'estiramiento lateral cuello',
    );
    expect(normalizeSearchText('Press (banca) - inclinado')).toBe('press banca inclinado');
  });

  it('deja fuera los comodines del LIKE, que si no serían inyectables en la búsqueda', () => {
    expect(normalizeSearchText('100%_press')).toBe('100 press');
  });
});

describe('buildCatalogRows', () => {
  it('cruza los dos idiomas en una sola fila por ejercicio', () => {
    const { rows, skipped } = build(
      muscleFile('pectorals', [BENCH_PRESS_ES, ARCHER_PUSH_UP_ES]),
      muscleFile('pectorals', [BENCH_PRESS_EN, ARCHER_PUSH_UP_EN]),
    );

    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(2);

    const bench = rows[0];
    expect(bench?.catalogId).toBe('pectorals/barbell-bench-press');
    expect(bench?.nameEs).toBe('Press de banca con barra');
    expect(bench?.nameEn).toBe('Barbell Bench Press');
    expect(bench?.instructionsEs).toEqual(BENCH_PRESS_ES.instructions);
    expect(bench?.instructionsEn).toEqual(BENCH_PRESS_EN.instructions);
  });

  it('guarda el bodyPart del catálogo, que no es el músculo', () => {
    const { rows } = build(
      muscleFile('pectorals', [BENCH_PRESS_ES]),
      muscleFile('pectorals', [BENCH_PRESS_EN]),
    );

    expect(rows[0]?.muscle).toBe('pectorals');
    expect(rows[0]?.bodyPart).toBe('chest');
  });

  it('busca por los dos idiomas: el texto normalizado lleva ambos nombres', () => {
    const { rows } = build(
      muscleFile('pectorals', [ARCHER_PUSH_UP_ES]),
      muscleFile('pectorals', [ARCHER_PUSH_UP_EN]),
    );

    expect(rows[0]?.searchText).toBe('flexion del arquero archer push up');
  });

  it('no duplica el texto de búsqueda cuando el nombre coincide en los dos idiomas', () => {
    const sameName = { ...BENCH_PRESS_ES, name: 'Press' };
    const { rows } = build(
      muscleFile('pectorals', [sameName]),
      muscleFile('pectorals', [{ ...BENCH_PRESS_EN, name: 'press' }]),
    );

    expect(rows[0]?.searchText).toBe('press');
  });

  it('descarta el ejercicio fuera de contrato y conserva el resto del músculo', () => {
    const broken = { ...ARCHER_PUSH_UP_ES, bodyPart: 'pectorals' };
    const { rows, skipped } = build(
      muscleFile('pectorals', [BENCH_PRESS_ES, broken]),
      muscleFile('pectorals', [BENCH_PRESS_EN]),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.catalogId).toBe('pectorals/barbell-bench-press');
    expect(skipped).toHaveLength(1);
  });

  it('descarta un id que no cuadra con su músculo y su slug: rompería la referencia', () => {
    const mismatched = { ...BENCH_PRESS_ES, id: 'pectorals/otra-cosa' };
    const { rows, skipped } = build(
      muscleFile('pectorals', [mismatched]),
      muscleFile('pectorals', []),
    );

    expect(rows).toEqual([]);
    expect(skipped[0]).toContain('el id no cuadra');
  });

  it('descarta un ejercicio que declara otro músculo que el del fichero', () => {
    const foreign = { ...BENCH_PRESS_ES, id: 'triceps/barbell-bench-press', muscle: 'triceps' };
    const { rows, skipped } = build(
      muscleFile('pectorals', [foreign]),
      muscleFile('pectorals', []),
    );

    expect(rows).toEqual([]);
    expect(skipped[0]).toContain('declara el músculo triceps');
  });

  it('cae al otro idioma cuando un ejercicio solo existe en uno', () => {
    const { rows } = build(
      muscleFile('pectorals', [BENCH_PRESS_ES]),
      muscleFile('pectorals', [BENCH_PRESS_EN, ARCHER_PUSH_UP_EN]),
    );

    expect(rows).toHaveLength(2);
    const archer = rows.find((row) => row.catalogId === 'pectorals/archer-push-up');
    expect(archer?.nameEs).toBe('Archer Push Up');
    expect(archer?.nameEn).toBe('Archer Push Up');
  });

  it('sella la versión y el momento del catálogo en cada fila', () => {
    const { rows } = build(
      muscleFile('pectorals', [BENCH_PRESS_ES]),
      muscleFile('pectorals', [BENCH_PRESS_EN]),
    );

    expect(rows[0]?.catalogVersion).toBe('v1.1.0');
    expect(rows[0]?.syncedAt).toBe(SYNCED_AT);
  });
});
