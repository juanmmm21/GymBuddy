import {
  MAX_ROUTINE_ITEMS,
  type ResourceId,
  type Routine,
  type RoutineItemInput,
  type TrackedExercise,
} from '@gymbuddy/shared';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useUpdateRoutine } from '../../api/mutations';
import { useRoutines, useTrackedExercises } from '../../api/queries';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Button, Notice, Surface } from '../../components/index';
import { describeError } from '../../lib/errors';
import { parseResourceId } from '../../lib/ids';
import { sessionPathForRoutine } from '../session/paths';
import { EditRoutineSheet } from './EditRoutineSheet';
import {
  describeRoutineSize,
  formatTarget,
  moveItem,
  toItemInputs,
  type MoveDirection,
} from './items';
import { ROUTINES_PATH } from './paths';
import { RoutineItemSheet } from './RoutineItemSheet';
import styles from './RoutineScreen.module.css';

const BACK_TO_ROUTINES: BackLink = { to: ROUTINES_PATH, label: 'Rutinas' };

/** El editor de una rutina (`/routines/:id`): sus ejercicios en orden, y su edición. */
export function RoutineScreen() {
  const params = useParams();
  const routineId = parseResourceId(params['id']);

  if (routineId === null) {
    return (
      <>
        <ScreenHeader title="Rutina" backTo={BACK_TO_ROUTINES} />
        <Notice tone="danger" title="No existe esa rutina">
          El enlace no apunta a ninguna de tus rutinas.
        </Notice>
      </>
    );
  }

  return <RoutineEditor routineId={routineId} />;
}

/**
 * La rutina sale del listado con las archivadas (no se pide `GET /routines/{id}`): es la
 * misma caché que pinta la lista y que invalidan las mutaciones, y una archivada tiene
 * que poder abrirse para recuperarla.
 */
function RoutineEditor({ routineId }: { readonly routineId: ResourceId }) {
  const routines = useRoutines({ includeArchived: true });
  const exercises = useTrackedExercises({ includeArchived: true });
  const [editingDetails, setEditingDetails] = useState(false);

  const routine = routines.data?.find((candidate) => candidate.id === routineId) ?? null;

  return (
    <>
      <ScreenHeader
        title={routine?.name ?? 'Rutina'}
        subtitle={routine === null ? undefined : describeRoutineSize(routine.items)}
        backTo={BACK_TO_ROUTINES}
        action={
          routine !== null ? (
            <Button
              variant="ghost"
              onClick={() => {
                setEditingDetails(true);
              }}
            >
              Editar
            </Button>
          ) : undefined
        }
      />
      <AsyncContent query={routines}>
        {(items) => {
          const found = items.find((candidate) => candidate.id === routineId);
          if (found === undefined) {
            return (
              <Notice tone="danger" title="No existe esa rutina">
                No está entre tus rutinas.
              </Notice>
            );
          }

          return (
            <>
              <AsyncContent query={exercises}>
                {(tracked) => <RoutineBody routine={found} exercises={tracked} />}
              </AsyncContent>

              <EditRoutineSheet
                routine={found}
                open={editingDetails}
                onClose={() => {
                  setEditingDetails(false);
                }}
              />
            </>
          );
        }}
      </AsyncContent>
    </>
  );
}

/** Qué línea está abierta en la hoja: una existente, una nueva o ninguna. */
type ItemSheetTarget =
  { readonly kind: 'edit'; readonly item: RoutineItemInput } | { readonly kind: 'new' };

interface RoutineBodyProps {
  readonly routine: Routine;
  readonly exercises: readonly TrackedExercise[];
}

function RoutineBody({ routine, exercises }: RoutineBodyProps) {
  const navigate = useNavigate();
  const reorder = useUpdateRoutine();
  const [sheetTarget, setSheetTarget] = useState<ItemSheetTarget | null>(null);

  const saved = toItemInputs(routine.items);
  // Mientras un reordenado viaja se pinta la lista que se mandó. La mutación no termina
  // hasta que el listado se ha vuelto a pedir, así que al acabar no hay salto hacia atrás.
  const pendingItems = reorder.isPending ? reorder.variables.body.items : undefined;
  const shown = pendingItems ?? saved;
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const full = shown.length >= MAX_ROUTINE_ITEMS;

  const move = (index: number, direction: MoveDirection): void => {
    const next = moveItem(shown, index, direction);
    if (next === null) return;
    reorder.mutate({ routineId: routine.id, body: { items: next } });
  };

  return (
    <div className={styles.stack}>
      {routine.archivedAt !== null && <ArchivedNotice routine={routine} />}

      {routine.description !== null && <p className={styles.description}>{routine.description}</p>}

      {/* Empezar no crea nada aquí: la sesión se abre, o se guía la que ya lo esté, allí. */}
      <Button
        size="lg"
        fullWidth
        disabled={routine.items.length === 0}
        onClick={() => {
          void navigate(sessionPathForRoutine(routine.id));
        }}
      >
        Empezar esta rutina
      </Button>

      {shown.length === 0 ? (
        <Notice title="Esta rutina todavía no tiene ejercicios">
          Añade los que haces, en el orden en que los haces. Un mismo ejercicio puede ir dos veces
          si lo haces en dos bloques.
        </Notice>
      ) : (
        <ol className={styles.items} aria-label="Ejercicios de la rutina">
          {shown.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              position={index + 1}
              exercise={exerciseById.get(item.trackedExerciseId) ?? null}
              canMoveUp={index > 0}
              canMoveDown={index < shown.length - 1}
              disabled={reorder.isPending}
              onEdit={() => {
                setSheetTarget({ kind: 'edit', item });
              }}
              onMove={(direction) => {
                move(index, direction);
              }}
            />
          ))}
        </ol>
      )}

      {reorder.isError && (
        <Notice tone="danger" title="No se pudo cambiar el orden">
          {describeError(reorder.error)}
        </Notice>
      )}

      <div className={styles.add}>
        <Button
          size="lg"
          fullWidth
          disabled={full || reorder.isPending}
          onClick={() => {
            setSheetTarget({ kind: 'new' });
          }}
        >
          Añadir ejercicio
        </Button>
        {full && (
          <p className={styles.hint}>Una rutina admite hasta {MAX_ROUTINE_ITEMS} ejercicios.</p>
        )}
      </div>

      <RoutineItemSheet
        routineId={routine.id}
        items={saved}
        item={sheetTarget?.kind === 'edit' ? sheetTarget.item : null}
        exercises={exercises}
        open={sheetTarget !== null}
        onClose={() => {
          setSheetTarget(null);
        }}
      />
    </div>
  );
}

interface ItemRowProps {
  readonly item: RoutineItemInput;
  readonly position: number;
  /** `null` si el ejercicio no está en la lista del usuario: la línea se pinta igual. */
  readonly exercise: TrackedExercise | null;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly disabled: boolean;
  readonly onEdit: () => void;
  readonly onMove: (direction: MoveDirection) => void;
}

/**
 * Una línea: tocarla abre su hoja, y las flechas la mueven un puesto. Flechas y no
 * arrastrar: con el móvil en una mano el arrastre se confunde con el desplazamiento.
 */
function ItemRow({
  item,
  position,
  exercise,
  canMoveUp,
  canMoveDown,
  disabled,
  onEdit,
  onMove,
}: ItemRowProps) {
  const name = exercise?.name ?? 'Ejercicio no disponible';
  const target = formatTarget(item);

  return (
    <Surface as="li" padding="none" className={styles.item}>
      <button
        type="button"
        className={styles.itemMain}
        onClick={onEdit}
        disabled={disabled}
        aria-label={`Editar ${name}, ${target}`}
      >
        <span className={styles.position}>{position}</span>
        <span className={styles.itemText}>
          <span className={styles.itemName}>{name}</span>
          <span className={styles.itemTarget}>{target}</span>
        </span>
        {exercise !== null && exercise.archivedAt !== null && (
          <Badge tone="warning">Archivado</Badge>
        )}
      </button>

      <div className={styles.moves}>
        <button
          type="button"
          className={styles.move}
          onClick={() => {
            onMove('up');
          }}
          disabled={disabled || !canMoveUp}
          aria-label={`Subir ${name}`}
        >
          ↑
        </button>
        <button
          type="button"
          className={styles.move}
          onClick={() => {
            onMove('down');
          }}
          disabled={disabled || !canMoveDown}
          aria-label={`Bajar ${name}`}
        >
          ↓
        </button>
      </div>
    </Surface>
  );
}

/** Una archivada se abre y se edita igual, pero se dice, y se recupera de un toque. */
function ArchivedNotice({ routine }: { readonly routine: Routine }) {
  const update = useUpdateRoutine();

  return (
    <Notice
      tone="warning"
      title="Rutina archivada"
      action={
        <Button
          variant="secondary"
          loading={update.isPending}
          onClick={() => {
            update.mutate({ routineId: routine.id, body: { archived: false } });
          }}
        >
          Recuperar
        </Button>
      }
    >
      {update.isError
        ? describeError(update.error)
        : 'No aparece entre tus rutinas. Sus ejercicios siguen aquí, en su orden.'}
    </Notice>
  );
}
