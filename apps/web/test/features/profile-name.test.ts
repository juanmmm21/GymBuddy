import { MAX_DISPLAY_NAME_LENGTH } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import { displayNameToSave } from '../../src/features/settings/profile-name';

describe('displayNameToSave', () => {
  it('un nombre distinto se guarda recortado', () => {
    expect(displayNameToSave('  Juanma ', 'Juan')).toBe('Juanma');
  });

  it('el mismo nombre, aunque lleve espacios alrededor, no es un cambio', () => {
    expect(displayNameToSave('Juan', 'Juan')).toBeNull();
    expect(displayNameToSave('  Juan  ', 'Juan')).toBeNull();
  });

  it('vacío o solo espacios no se puede guardar', () => {
    expect(displayNameToSave('', 'Juan')).toBeNull();
    expect(displayNameToSave('   ', 'Juan')).toBeNull();
  });

  it('más largo que el límite del contrato no se puede guardar', () => {
    expect(displayNameToSave('a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1), 'Juan')).toBeNull();
    expect(displayNameToSave('a'.repeat(MAX_DISPLAY_NAME_LENGTH), 'Juan')).toBe(
      'a'.repeat(MAX_DISPLAY_NAME_LENGTH),
    );
  });
});
