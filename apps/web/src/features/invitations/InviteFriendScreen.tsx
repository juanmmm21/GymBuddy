import {
  formatAccessCode,
  type Invitation,
  type InvitationStatus,
  type Locale,
} from '@gymbuddy/shared';
import { useState } from 'react';
import { useCreateInvitation } from '../../api/mutations';
import { useInvitationStatus } from '../../api/queries';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { useSession } from '../../auth/SessionProvider';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { AccessCode, Button, Notice, Surface } from '../../components/index';
import { copyToClipboard } from '../../lib/clipboard';
import { describeError } from '../../lib/errors';
import { formatShortDate, pluralize } from '../../lib/format';
import styles from './InviteFriendScreen.module.css';

const BACK_TO_HOME: BackLink = { to: '/', label: 'Hoy' };

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
        title="Invitar a un amigo"
        subtitle="Un código para que se cree su cuenta"
        backTo={BACK_TO_HOME}
      />
      <AsyncContent query={status}>{(data) => <Invitations status={data} />}</AsyncContent>
    </>
  );
}

interface InvitationsProps {
  readonly status: InvitationStatus;
}

function Invitations({ status }: InvitationsProps) {
  const { session } = useSession();
  const locale = session?.user.locale ?? 'es';
  const invite = useCreateInvitation();

  const ask = (): void => {
    invite.mutate();
  };

  return (
    <div className={styles.stack}>
      <Surface as="section">
        <ol className={styles.steps}>
          <li>Pide aquí un código y mándaselo.</li>
          <li>Que abra GymBuddy en su móvil y pulse «Tengo una invitación».</li>
          <li>Con el código y su nombre, creará su llave de acceso y ya estará dentro.</li>
        </ol>
      </Surface>

      {invite.isError && (
        <Notice
          tone="danger"
          title="No se ha podido crear la invitación"
          action={
            <Button variant="secondary" onClick={ask}>
              Reintentar
            </Button>
          }
        >
          {describeError(invite.error)}
        </Notice>
      )}

      {invite.data !== undefined && <FreshInvitation invitation={invite.data} locale={locale} />}

      <PendingSummary status={status} locale={locale} />

      {status.remaining > 0 ? (
        <Button
          size="lg"
          fullWidth
          loading={invite.isPending}
          variant={invite.data === undefined ? 'primary' : 'secondary'}
          onClick={ask}
        >
          {invite.data === undefined ? 'Crear una invitación' : 'Crear otra invitación'}
        </Button>
      ) : (
        <Notice tone="warning" title="No te quedan invitaciones">
          Puedes tener {String(status.limit)} sin usar a la vez. Cuando alguna se use o caduque,
          podrás crear otra.
        </Notice>
      )}
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
        <p className={styles.expiry}>Caduca el {formatShortDate(invitation.expiresAt, locale)}</p>
      </AccessCode>
      <Button variant="secondary" fullWidth onClick={copy}>
        {copied === true ? 'Código copiado' : 'Copiar el código'}
      </Button>
      {copied === false && (
        <Notice tone="warning" title="No se ha podido copiar">
          Cópialo a mano de la pantalla: tu navegador no deja copiar desde aquí.
        </Notice>
      )}
      <Notice title="Apúntalo antes de salir">
        El código no se vuelve a enseñar: aquí solo se guarda su huella. Si lo pierdes, crea otra
        invitación.
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
        No tienes ninguna invitación sin usar. Puedes crear hasta {String(status.limit)}.
      </p>
    );
  }

  return (
    <section className={styles.summary}>
      <p>
        Tienes {pluralize(status.pending.length, 'invitación sin usar', 'invitaciones sin usar')} y
        puedes crear {String(status.remaining)} más.
      </p>
      <ul className={styles.pending}>
        {status.pending.map((pending) => (
          <li key={pending.createdAt}>
            Creada el {formatShortDate(pending.createdAt, locale)} · caduca el{' '}
            {formatShortDate(pending.expiresAt, locale)}
          </li>
        ))}
      </ul>
    </section>
  );
}
