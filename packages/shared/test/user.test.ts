import { describe, expect, it } from 'vitest';
import { MAX_DISPLAY_NAME_LENGTH, updateUserRequestSchema } from '../src/schemas/user';

describe('updateUserRequestSchema', () => {
  it('admite cambiar solo el nombre, y lo recorta', () => {
    expect(updateUserRequestSchema.parse({ displayName: '  Juan  ' })).toStrictEqual({
      displayName: 'Juan',
    });
  });

  it('rechaza un nombre vacío o de solo espacios', () => {
    expect(updateUserRequestSchema.safeParse({ displayName: '' }).success).toBe(false);
    expect(updateUserRequestSchema.safeParse({ displayName: '   ' }).success).toBe(false);
  });

  it('rechaza un nombre más largo que el del registro', () => {
    const tooLong = 'a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1);

    expect(updateUserRequestSchema.safeParse({ displayName: tooLong }).success).toBe(false);
  });

  it('un cuerpo vacío es válido: no cambia nada', () => {
    expect(updateUserRequestSchema.parse({})).toStrictEqual({});
  });
});
