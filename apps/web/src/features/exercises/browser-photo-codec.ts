import type { DecodedPhoto, PhotoCodec, PhotoSize } from './photo-compression';

/**
 * El codificador de fotos del navegador: `createImageBitmap` decodifica (en Safari también HEIC, y
 * aplica la orientación del EXIF) y un `<canvas>` vuelve a codificar en JPEG. Se usa el canvas del
 * documento y no `OffscreenCanvas`, que llegó más tarde a Safari de iOS. `null` si falta alguna pieza.
 */
export function createBrowserPhotoCodec(): PhotoCodec | null {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;

  return {
    async decode(file: Blob): Promise<DecodedPhoto> {
      const bitmap = await createImageBitmap(file);

      return {
        width: bitmap.width,
        height: bitmap.height,
        close: () => {
          bitmap.close();
        },
        // El bitmap viaja escondido en el objeto: `encodeJpeg` solo recibe lo que `decode` produjo.
        [BITMAP]: bitmap,
      } as DecodedPhoto;
    },

    encodeJpeg(photo: DecodedPhoto, size: PhotoSize, quality: number): Promise<Blob> {
      const bitmap = (photo as DecodedPhoto & { [BITMAP]?: ImageBitmap })[BITMAP];
      if (bitmap === undefined) {
        return Promise.reject(new Error('La foto no la decodificó este codificador'));
      }

      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (context === null) return Promise.reject(new Error('El navegador no da un canvas 2D'));
      context.drawImage(bitmap, 0, 0, size.width, size.height);

      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            // Safari devuelve `null` cuando el canvas pasa de su límite de memoria.
            if (blob === null) reject(new Error('El navegador no pudo codificar la foto'));
            else resolve(blob);
          },
          'image/jpeg',
          quality,
        );
      });
    },
  };
}

const BITMAP = Symbol('bitmap');
