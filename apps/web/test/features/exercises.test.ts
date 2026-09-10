import { describe, expect, it } from 'vitest';
import {
  exerciseSelectOptions,
  groupExercisesByBodyPart,
  UNGROUPED_LABEL,
} from '../../src/features/exercises/grouping';
import { normalizeNotes } from '../../src/lib/notes';
import { trackedExercisePath } from '../../src/features/exercises/paths';
import { benchPress, customCurl, squat } from '../fixtures';

describe('groupExercisesByBodyPart', () => {
  it('agrupa en el orden del catálogo y sin grupos vacíos', () => {
    const groups = groupExercisesByBodyPart([customCurl, squat, benchPress]);

    expect(groups.map((group) => group.label)).toEqual(['Pecho', 'Piernas', 'Brazos']);
    expect(groups[0]?.items).toEqual([benchPress]);
    expect(groups[2]?.items).toEqual([customCurl]);
  });

  it('conserva el orden del Worker dentro de cada grupo', () => {
    const second = { ...benchPress, id: '11111111-1111-4111-8111-111111111111', name: 'Aperturas' };
    const groups = groupExercisesByBodyPart([benchPress, second]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((item) => item.name)).toEqual(['Press de banca', 'Aperturas']);
  });

  it('los propios sin parte del cuerpo cierran la lista', () => {
    const unclassified = { ...customCurl, bodyPart: null };
    const groups = groupExercisesByBodyPart([unclassified, benchPress]);

    expect(groups.map((group) => group.label)).toEqual(['Pecho', UNGROUPED_LABEL]);
    expect(groups[1]?.bodyPart).toBeNull();
  });

  it('sin ejercicios no hay grupos', () => {
    expect(groupExercisesByBodyPart([])).toEqual([]);
  });
});

describe('exerciseSelectOptions', () => {
  it('agrupa las opciones como "mis ejercicios" y marca el archivado', () => {
    const archivedSquat = { ...squat, archivedAt: '2026-09-08T12:00:00.000Z' };

    expect(exerciseSelectOptions([customCurl, archivedSquat, benchPress])).toEqual([
      { value: benchPress.id, label: 'Press de banca', group: 'Pecho' },
      { value: squat.id, label: 'Sentadilla con barra (archivado)', group: 'Piernas' },
      { value: customCurl.id, label: 'Curl con la barra rara', group: 'Brazos' },
    ]);
  });
});

describe('normalizeNotes', () => {
  it('recorta y convierte lo vacío en null', () => {
    expect(normalizeNotes('  Barra baja.  ')).toBe('Barra baja.');
    expect(normalizeNotes('   ')).toBeNull();
    expect(normalizeNotes('')).toBeNull();
  });
});

describe('rutas de mis ejercicios', () => {
  it('la ficha cuelga de /exercises con el id del ejercicio', () => {
    expect(trackedExercisePath(benchPress.id)).toBe(`/exercises/${benchPress.id}`);
  });
});
