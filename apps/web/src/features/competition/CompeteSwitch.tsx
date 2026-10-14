import { useUpdateProfile } from '../../api/mutations';
import { useSession } from '../../auth/SessionProvider';
import { Notice, Switch } from '../../components/index';
import { describeError } from '../../lib/errors';
import styles from './CompeteSwitch.module.css';

const SWITCH_LABEL = 'Competir con amigos';
const SWITCH_HINT =
  'Quien use GymBuddy podrá elegirte como rival y ver el peso máximo de tus ejercicios. Apágalo cuando quieras.';

/**
 * La casilla que te pone a disposición de los demás. Es de la cuenta, no del dispositivo: vive en
 * el perfil, así que se enseña igual en Ajustes y en la pantalla de competir.
 */
export function CompeteSwitch() {
  const { session } = useSession();
  const update = useUpdateProfile();

  if (session === null) return null;

  return (
    <div className={styles.body}>
      <Switch
        label={SWITCH_LABEL}
        hint={SWITCH_HINT}
        // Mientras se guarda se enseña lo pedido: esperar a la respuesta haría parecer que no se pulsó.
        checked={update.isPending ? (update.variables.competes ?? false) : session.user.competes}
        disabled={update.isPending}
        onChange={(competes) => {
          update.mutate({ competes });
        }}
      />
      {update.isError && (
        <Notice tone="danger" title="No se pudo guardar">
          {describeError(update.error)}
        </Notice>
      )}
    </div>
  );
}
