import { describe, expect, it } from 'vitest';
import {
  parseSetMessage,
  type ParsedSet,
  type SetMessageParse,
  type SetParseFailure,
} from '../src/bot/parser';

function parsedSet(text: string): ParsedSet {
  const result: SetMessageParse = parseSetMessage(text);
  if (result.kind !== 'set') {
    throw new Error(`«${text}» no se entendió como serie: ${JSON.stringify(result.failure)}`);
  }
  return result.set;
}

function failure(text: string): SetParseFailure {
  const result = parseSetMessage(text);
  if (result.kind !== 'rejected') {
    throw new Error(`«${text}» se entendió como serie: ${JSON.stringify(result.set)}`);
  }
  return result.failure;
}

describe('parseSetMessage: la gramática corta', () => {
  it('lee `banca 80x8`', () => {
    expect(parsedSet('banca 80x8')).toEqual({
      exerciseText: 'banca',
      exerciseQuery: 'banca',
      weightGrams: 80_000,
      reps: 8,
      rpeTenths: null,
      isWarmup: false,
    });
  });

  it('lee `sentadilla 100x5 rpe8`', () => {
    expect(parsedSet('sentadilla 100x5 rpe8')).toEqual({
      exerciseText: 'sentadilla',
      exerciseQuery: 'sentadilla',
      weightGrams: 100_000,
      reps: 5,
      rpeTenths: 80,
      isWarmup: false,
    });
  });

  it('lee un nombre de varias palabras con espacios alrededor del separador', () => {
    expect(parsedSet('press militar 40 x 10')).toMatchObject({
      exerciseText: 'press militar',
      exerciseQuery: 'press militar',
      weightGrams: 40_000,
      reps: 10,
    });
  });

  it.each(['banca 80x8', 'banca 80X8', 'banca 80×8', 'banca 80 × 8', 'banca 80*8'])(
    'acepta el separador de «%s»',
    (text) => {
      expect(parsedSet(text)).toMatchObject({ weightGrams: 80_000, reps: 8 });
    },
  );

  it('acepta «por», que es lo que escribe el dictado del móvil', () => {
    expect(parsedSet('banca 80 por 8')).toMatchObject({
      exerciseText: 'banca',
      weightGrams: 80_000,
      reps: 8,
    });
  });

  it('no confunde un «por» del nombre con el separador', () => {
    expect(parsedSet('press por detrás 30x10')).toMatchObject({
      exerciseText: 'press por detrás',
      weightGrams: 30_000,
      reps: 10,
    });
  });
});

describe('parseSetMessage: el peso', () => {
  it.each([
    ['banca 82,5x8', 82_500],
    ['banca 82.5x8', 82_500],
    ['banca 81,25 x 8', 81_250],
    ['curl 7,5x12', 7_500],
    ['banca 0x8', 0],
  ])('«%s» pesa %i g, en enteros', (text, grams) => {
    expect(parsedSet(text).weightGrams).toBe(grams);
  });

  it.each([
    'banca 80kgx8',
    'banca 80kg x 8',
    'banca 80 kg x 8',
    'banca 80 KG x 8',
    'banca 80kgs x 8',
    'banca 80 kilos por 8',
  ])('acepta la unidad pegada o suelta en «%s»', (text) => {
    expect(parsedSet(text)).toMatchObject({ exerciseText: 'banca', weightGrams: 80_000, reps: 8 });
  });

  it.each(['banca 8x80kg', 'banca 80x8kg', 'banca 80x8 kg', 'banca 80kg x 8kg'])(
    'no adivina qué número es el peso cuando la unidad va detrás: «%s»',
    (text) => {
      expect(failure(text)).toEqual({ reason: 'incomplete_set' });
    },
  );

  it('redondea a los 10 g que representa el contrato, igual que la PWA', () => {
    expect(parsedSet('banca 82,505x8').weightGrams).toBe(82_510);
    expect(parsedSet('banca 82,504x8').weightGrams).toBe(82_500);
  });

  it('sin peso es peso corporal: `dominadas x10` son 0 g', () => {
    expect(parsedSet('dominadas x10')).toEqual({
      exerciseText: 'dominadas',
      exerciseQuery: 'dominadas',
      weightGrams: 0,
      reps: 10,
      rpeTenths: null,
      isWarmup: false,
    });
    expect(parsedSet('fondos x 12')).toMatchObject({ weightGrams: 0, reps: 12 });
  });

  it.each(['banca 10000x8', 'banca 9999,999x8', 'banca 80,1234x8'])(
    'rechaza el peso fuera del contrato en «%s»',
    (text) => {
      expect(failure(text)).toMatchObject({ reason: 'invalid_weight' });
    },
  );

  it('acepta el peso más alto que cabe en el contrato', () => {
    expect(parsedSet('prensa 9999,99x8').weightGrams).toBe(9_999_990);
  });
});

describe('parseSetMessage: las repeticiones', () => {
  it.each([
    ['banca 80x0', '0'],
    ['banca 80x8,5', '8,5'],
    ['banca 80x1001', '1001'],
  ])('rechaza «%s» con el texto de las repeticiones', (text, reps) => {
    expect(failure(text)).toEqual({ reason: 'invalid_reps', text: reps });
  });

  it('acepta el tope de repeticiones del contrato', () => {
    expect(parsedSet('comba x1000').reps).toBe(1000);
  });
});

describe('parseSetMessage: el RPE', () => {
  it.each([
    ['sentadilla 100x5 rpe8', 80],
    ['sentadilla 100x5 rpe 8', 80],
    ['sentadilla 100x5 RPE8', 80],
    ['sentadilla 100x5 rpe8,5', 85],
    ['sentadilla 100x5 rpe 8.5', 85],
    ['sentadilla 100x5 @9', 90],
    ['sentadilla 100x5 @ 9,5', 95],
    ['sentadilla 100x5@7', 70],
    ['sentadilla 100x5, rpe 10', 100],
    ['sentadilla 100x5 rpe 1', 10],
  ])('«%s» es RPE en décimas %i', (text, tenths) => {
    expect(parsedSet(text)).toMatchObject({ weightGrams: 100_000, reps: 5, rpeTenths: tenths });
  });

  it.each([
    ['sentadilla 100x5 rpe 11', 'rpe 11'],
    ['sentadilla 100x5 rpe0', 'rpe0'],
    ['sentadilla 100x5 rpe 8,3', 'rpe 8,3'],
    ['sentadilla 100x5 rpe 8,25', 'rpe 8,25'],
    ['sentadilla 100x5 rpe', 'rpe'],
    ['sentadilla 100x5 @', '@'],
  ])('rechaza «%s» con el texto del RPE', (text, rpe) => {
    expect(failure(text)).toEqual({ reason: 'invalid_rpe', text: rpe });
  });

  it('rechaza un segundo RPE en vez de quedarse con uno de los dos', () => {
    expect(failure('sentadilla 100x5 rpe8 rpe9')).toEqual({
      reason: 'unexpected_text',
      text: 'rpe9',
    });
  });

  it('rechaza el RPE delante de la serie, que acabaría dentro del nombre', () => {
    expect(failure('sentadilla rpe8 100x5')).toEqual({ reason: 'unexpected_text', text: 'rpe8' });
    expect(failure('sentadilla @ 8 100x5')).toEqual({ reason: 'unexpected_text', text: '@ 8' });
  });
});

describe('parseSetMessage: el calentamiento', () => {
  it.each([
    'sentadilla 60x10 cal',
    'sentadilla 60x10 calentamiento',
    'sentadilla 60x10 Calentamiento',
    'sentadilla 60x10 warm-up',
    'cal sentadilla 60x10',
    'Calentamiento: sentadilla 60x10',
  ])('«%s» es calentamiento', (text) => {
    expect(parsedSet(text)).toMatchObject({
      exerciseText: 'sentadilla',
      exerciseQuery: 'sentadilla',
      weightGrams: 60_000,
      reps: 10,
      isWarmup: true,
    });
  });

  it('combina calentamiento y RPE en cualquier orden', () => {
    expect(parsedSet('sentadilla 60x10 cal rpe6')).toMatchObject({ rpeTenths: 60, isWarmup: true });
    expect(parsedSet('sentadilla 60x10 rpe 6, cal')).toMatchObject({
      rpeTenths: 60,
      isWarmup: true,
    });
  });

  it('no lee como calentamiento una palabra que solo empieza igual', () => {
    expect(parsedSet('calf raise 40x15')).toMatchObject({
      exerciseText: 'calf raise',
      isWarmup: false,
    });
    expect(failure('sentadilla 60x10 calentando')).toEqual({
      reason: 'unexpected_text',
      text: 'calentando',
    });
  });

  it('una marca de calentamiento sola no es un ejercicio', () => {
    expect(failure('cal 60x10')).toEqual({ reason: 'missing_exercise' });
  });
});

describe('parseSetMessage: el nombre', () => {
  it('conserva cómo se escribió y normaliza la consulta como `search_text`', () => {
    expect(parsedSet('Press de Banca Inclinado 60x8')).toMatchObject({
      exerciseText: 'Press de Banca Inclinado',
      exerciseQuery: 'press de banca inclinado',
    });
    expect(parsedSet('Elevación de TALÓN 50x15')).toMatchObject({
      exerciseText: 'Elevación de TALÓN',
      exerciseQuery: 'elevacion de talon',
    });
  });

  it('quita espacios de sobra, saltos de línea y la puntuación de los bordes', () => {
    expect(parsedSet('  press   militar:\n40x10.  ')).toMatchObject({
      exerciseText: 'press militar',
      exerciseQuery: 'press militar',
      weightGrams: 40_000,
      reps: 10,
    });
  });

  it('admite cifras dentro del nombre: se queda con el último bloque', () => {
    expect(parsedSet('prensa 45 grados 120x10')).toMatchObject({
      exerciseText: 'prensa 45 grados',
      exerciseQuery: 'prensa 45 grados',
      weightGrams: 120_000,
      reps: 10,
    });
    expect(parsedSet('sentadilla a 1 pierna x8')).toMatchObject({
      exerciseText: 'sentadilla a 1 pierna',
      weightGrams: 0,
      reps: 8,
    });
  });

  it('una unidad en el nombre es un peso fuera de sitio, no parte del ejercicio', () => {
    expect(parsedSet('swing con kettlebell 16kg x 15')).toMatchObject({
      exerciseText: 'swing con kettlebell',
      weightGrams: 16_000,
      reps: 15,
    });
  });

  it('rechaza la serie sin ejercicio', () => {
    expect(failure('80x8')).toEqual({ reason: 'missing_exercise' });
    expect(failure('- 80x8')).toEqual({ reason: 'missing_exercise' });
  });
});

describe('parseSetMessage: lo que no es una serie', () => {
  it.each(['hola', 'banca', '¿qué tal?', ''])('«%s» es conversación', (text) => {
    expect(failure(text)).toEqual({ reason: 'not_a_set' });
  });

  it.each(['banca 80', 'banca 80 8', 'dominadas 10', 'banca80x8', 'dominadas x 10kg'])(
    '«%s» tiene números pero no la forma peso × repeticiones',
    (text) => {
      expect(failure(text)).toEqual({ reason: 'incomplete_set' });
    },
  );

  it('rechaza dos series en el mismo mensaje', () => {
    expect(failure('banca 80x8 90x6')).toEqual({ reason: 'multiple_sets' });
    expect(failure('banca 80x8 x2')).toEqual({ reason: 'multiple_sets' });
  });

  it('rechaza series × repeticiones con el peso aparte, en vez de registrar 3 kg', () => {
    expect(failure('banca 60kg 3x10')).toEqual({ reason: 'unexpected_text', text: '60kg' });
    expect(failure('banca 3x10 60kg')).toEqual({ reason: 'unexpected_text', text: '60kg' });
  });

  it('rechaza texto que sobra tras la serie', () => {
    expect(failure('banca 80x8 luego descanso')).toEqual({
      reason: 'unexpected_text',
      text: 'luego',
    });
  });
});
