import { MAX_RIVALS, type RivalCandidate } from '@gymbuddy/shared';
import { useState } from 'react';
import { useSaveRivals } from '../../api/mutations';
import { useRivalCandidates } from '../../api/queries';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Button, Notice, Sheet, Switch } from '../../components/index';
import { describeError } from '../../lib/errors';
import { canToggleRival, rivalsChanged, selectedRivalIds, toggleRival } from './standings';
import styles from './RivalsSheet.module.css';

export interface RivalsSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * Elegir contra quién se compite. Salen todos los que lo han activado —la app tiene pocas cuentas,
 * así que no hay buscador ni solicitudes de amistad—, y lo que se guarda es la lista entera.
 */
export function RivalsSheet({ open, onClose }: RivalsSheetProps) {
  const candidates = useRivalCandidates({ enabled: open });

  return (
    <Sheet open={open} onClose={onClose} title="Elegir rivales">
      <AsyncContent query={candidates}>
        {(data) => <RivalsForm candidates={data.candidates} onDone={onClose} />}
      </AsyncContent>
    </Sheet>
  );
}

interface RivalsFormProps {
  readonly candidates: readonly RivalCandidate[];
  readonly onDone: () => void;
}

function RivalsForm({ candidates, onDone }: RivalsFormProps) {
  const [selected, setSelected] = useState(() => selectedRivalIds(candidates));
  const save = useSaveRivals();

  if (candidates.length === 0) {
    return (
      <Notice title="Todavía no hay nadie a quien elegir">
        Aquí saldrán tus amigos cuando activen «Competir con amigos» en sus ajustes.
      </Notice>
    );
  }

  return (
    <div className={styles.form}>
      <ul className={styles.list}>
        {candidates.map((candidate) => (
          <li key={candidate.userId}>
            <Switch
              label={candidate.displayName}
              // Solo lo ve la cuenta de administración: a los demás no les llega quien no compite.
              {...(candidate.competes ? {} : { hint: 'No ha activado competir todavía' })}
              checked={selected.includes(candidate.userId)}
              disabled={save.isPending || !canToggleRival(selected, candidate.userId)}
              onChange={() => {
                setSelected((current) => toggleRival(current, candidate.userId));
              }}
            />
          </li>
        ))}
      </ul>

      {selected.length >= MAX_RIVALS && (
        <p className={styles.note}>Has llegado al tope de {MAX_RIVALS} rivales.</p>
      )}

      {save.isError && (
        <Notice tone="danger" title="No se pudo guardar">
          {describeError(save.error)}
        </Notice>
      )}

      <Button
        size="lg"
        fullWidth
        loading={save.isPending}
        disabled={!rivalsChanged(candidates, selected)}
        onClick={() => {
          save.mutate({ rivalIds: selected }, { onSuccess: onDone });
        }}
      >
        Guardar
      </Button>
    </div>
  );
}
