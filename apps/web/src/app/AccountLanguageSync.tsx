import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useUpdateProfile } from '../api/mutations';
import { useSession } from '../auth/SessionProvider';
import { useLocale } from '../i18n/index';

/**
 * Lleva a la cuenta el idioma en el que habla la app. El Worker lo usa para lo que nombra él (los
 * ejercicios del catálogo en la competición, por ejemplo), y sin esto el móvil diría «Press banca»
 * en una pantalla en inglés. Un intento por cuenta e idioma: sin red se reintenta la próxima vez
 * que se abra la app, no en bucle.
 */
export function AccountLanguageSync() {
  const { session } = useSession();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { mutate } = useUpdateProfile();
  const attempted = useRef<string | null>(null);

  const userId = session?.user.id ?? null;
  const accountLocale = session?.user.locale ?? null;

  useEffect(() => {
    if (userId === null || accountLocale === null || accountLocale === locale) return;
    const attempt = `${userId}:${locale}`;
    if (attempted.current === attempt) return;
    attempted.current = attempt;

    mutate(
      { locale },
      {
        onSuccess: () => {
          // Lo que ya está en la caché trae los nombres en el idioma anterior.
          void queryClient.invalidateQueries();
        },
      },
    );
  }, [accountLocale, locale, mutate, queryClient, userId]);

  return null;
}
