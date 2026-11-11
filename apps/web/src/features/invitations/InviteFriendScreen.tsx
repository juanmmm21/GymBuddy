import {
  formatAccessCode,
  type Invitation,
  type InvitationQuota,
  type InvitationStatus,
  type Locale,
} from '@gymbuddy/shared';
import { useState } from 'react';
import { useCreateInvitation } from '../../api/mutations';
import { useInvitationStatus } from '../../api/queries';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { AccessCode, Button, Notice, Surface } from '../../components/index';
import { copyToClipboard } from '../../lib/clipboard';
import { describeError } from '../../lib/errors';
import { formatShortDate } from '../../lib/format';
import styles from './InviteFriendScreen.module.css';
import { SETTINGS_PATH } from '../settings/paths';
import { plural, t, useLocale } from '../../i18n/index';

function backToSettings(): BackLink {
  return { to: SETTINGS_PATH, label: t('Ajustes', 'Settings') };
}

/**
 * El código con el que un amigo se crea su cuenta. El alta va por invitación a propósito (no
 * hay registro abierto), así que esta pantalla es la única forma de que entre alguien más sin
 * el secreto de administración.
 */
export function InviteFriendScreen() {
  const status = useInvitationStatus();

  return (
    <>
      <ScreenHeader
        title={t('Invitar a un amigo', 'Invite a friend')}
        subtitle={t(
          'Un código para que se cree su cuenta',
          'A code so they can create their account',
        )}
        backTo={backToSettings()}
      />
      <AsyncContent query={status}>{(data) => <Invitations status={data} />}</AsyncContent>
    </>
  );
}

interface InvitationsProps {
  readonly status: InvitationStatus;
}

function Invitations({ status }: InvitationsProps) {
  const locale = useLocale();
  const invite = useCreateInvitation();

  const exhausted = status.quota !== null && status.quota.remaining === 0;

  const ask = (): void => {
    invite.mutate();
  };

  return (
    <div className={styles.stack}>
      <Surface as="section">
        <ol className={styles.steps}>
          <li>{t('Pide aquí un código y mándaselo.', 'Get a code here and send it to them.')}</li>
          <li>
            {t(
              'Que abra GymBuddy en su móvil y pulse «Tengo una invitación».',
              'They open GymBuddy on their phone and tap “I have an invitation”.',
            )}
          </li>
          <li>
            {t(
              'Con el código y su nombre, creará su llave de acceso y ya estará dentro.',
              'With the code and their name, they’ll create their passkey and be in.',
            )}
          </li>
        </ol>
      </Surface>

      {invite.isError && (
        <Notice
          tone="danger"
          title={t('No se ha podido crear la invitación', 'The invitation couldn’t be created')}
          // Con el cupo agotado, reintentar solo repetiría el mismo 429.
          {...(exhausted
            ? {}
            : {
                action: (
                  <Button variant="secondary" onClick={ask}>
                    {t('Reintentar', 'Retry')}
                  </Button>
                ),
              })}
        >
          {describeError(invite.error)}
        </Notice>
      )}

      {invite.data !== undefined && <FreshInvitation invitation={invite.data} locale={locale} />}

      <PendingSummary status={status} locale={locale} />

      {status.quota !== null && <QuotaSummary quota={status.quota} locale={locale} />}

      <Button
        size="lg"
        fullWidth
        disabled={exhausted}
        loading={invite.isPending}
        variant={invite.data === undefined ? 'primary' : 'secondary'}
        onClick={ask}
      >
        {invite.data === undefined
          ? t('Crear una invitación', 'Create an invitation')
          : t('Crear otra invitación', 'Create another invitation')}
      </Button>
    </div>
  );
}

interface FreshInvitationProps {
  readonly invitation: Invitation;
  readonly locale: Locale;
}

/** El código recién creado, que es la única vez que existe: en el servidor solo queda su huella. */
function FreshInvitation({ invitation, locale }: FreshInvitationProps) {
  const [copied, setCopied] = useState<boolean | null>(null);

  const copy = (): void => {
    void copyToClipboard(formatAccessCode(invitation.code)).then(setCopied);
  };

  return (
    <>
      <AccessCode code={invitation.code}>
        <p className={styles.expiry}>
          {t('Caduca el', 'Expires on')} {formatShortDate(invitation.expiresAt, locale)}
        </p>
      </AccessCode>
      <Button variant="secondary" fullWidth onClick={copy}>
        {copied === true
          ? t('Código copiado', 'Code copied')
          : t('Copiar el código', 'Copy the code')}
      </Button>
      {copied === false && (
        <Notice tone="warning" title={t('No se ha podido copiar', 'Couldn’t copy')}>
          {t(
            'Cópialo a mano de la pantalla: tu navegador no deja copiar desde aquí.',
            'Copy it by hand from the screen: your browser doesn’t allow copying from here.',
          )}
        </Notice>
      )}
      <Notice title={t('Apúntalo antes de salir', 'Note it down before leaving')}>
        {t(
          'El código no se vuelve a enseñar: aquí solo se guarda su huella. Si lo pierdes, crea otra invitación.',
          'The code won’t be shown again: only its fingerprint is stored here. If you lose it, create another invitation.',
        )}
      </Notice>
    </>
  );
}

interface PendingSummaryProps {
  readonly status: InvitationStatus;
  readonly locale: Locale;
}

/** Cuántas siguen esperando a que alguien las use, y hasta cuándo valen. */
function PendingSummary({ status, locale }: PendingSummaryProps) {
  if (status.pending.length === 0) {
    return (
      <p className={styles.summary}>
        {t('No tienes ninguna invitación sin usar.', 'You have no unused invitations.')}
      </p>
    );
  }

  return (
    <section className={styles.summary}>
      <p>
        {t('Tienes', 'You have')}{' '}
        {plural(
          status.pending.length,
          ['invitación sin usar', 'invitaciones sin usar'],
          ['unused invitation', 'unused invitations'],
        )}
        .
      </p>
      <ul className={styles.pending}>
        {status.pending.map((pending) => (
          <li key={pending.createdAt}>
            {t(
              `Creada el ${formatShortDate(pending.createdAt, locale)} · caduca el ${formatShortDate(pending.expiresAt, locale)}`,
              `Created on ${formatShortDate(pending.createdAt, locale)} · expires on ${formatShortDate(pending.expiresAt, locale)}`,
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface QuotaSummaryProps {
  readonly quota: InvitationQuota;
  readonly locale: Locale;
}

/** Cuántas quedan por crear en la ventana y, si no queda ninguna, cuándo vuelve a haber. */
function QuotaSummary({ quota, locale }: QuotaSummaryProps) {
  if (quota.remaining === 0) {
    return (
      <Notice
        tone="warning"
        title={t('Has creado todas tus invitaciones', 'You’ve created all your invitations')}
      >
        {t(
          `Puedes crear ${plural(quota.limit, ['invitación', 'invitaciones'], ['invitation', 'invitations'])} cada ${String(quota.windowDays)} días.`,
          `You can create ${plural(quota.limit, ['invitación', 'invitaciones'], ['invitation', 'invitations'])} every ${String(quota.windowDays)} days.`,
        )}
        {quota.renewsAt !== null &&
          t(
            ` Podrás crear otra el ${formatShortDate(quota.renewsAt, locale)}.`,
            ` You can create another on ${formatShortDate(quota.renewsAt, locale)}.`,
          )}
      </Notice>
    );
  }

  return (
    <p className={styles.summary}>
      {t(
        `Te ${quota.remaining === 1 ? 'queda' : 'quedan'} ${plural(quota.remaining, ['invitación', 'invitaciones'], ['invitation', 'invitations'])} de ${String(quota.limit)} en estos ${String(quota.windowDays)} días.`,
        `You have ${plural(quota.remaining, ['invitación', 'invitaciones'], ['invitation', 'invitations'])} left out of ${String(quota.limit)} in these ${String(quota.windowDays)} days.`,
      )}
    </p>
  );
}
