import type { CatalogExercise, Muscle, TrackedExercise } from '@gymbuddy/shared';
import { Link, useNavigate, useParams } from 'react-router';
import { useCreateTrackedExercise } from '../../api/mutations';
import { useCatalogExercise, useTrackedExercises } from '../../api/queries';
import { useSession } from '../../auth/SessionProvider';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Button, Notice, Surface } from '../../components/index';
import { describeError } from '../../lib/errors';
import { newResourceId } from '../../lib/ids';
import { trackedExercisePath } from '../exercises/paths';
import { ExerciseGif } from './ExerciseGif';
import { BODY_PART_LABELS, MUSCLE_LABELS, categoryLabel, equipmentLabel } from './labels';
import { CATALOG_PATH, bodyPartPath, parseMuscle } from './paths';
import styles from './CatalogExerciseScreen.module.css';

const BACK_TO_CATALOG: BackLink = { to: CATALOG_PATH, label: 'Catálogo' };
const CATALOG_SOURCE_URL = 'https://github.com/JahelCuadrado/ExerciseGymGifsDB';

/** La ficha de un ejercicio del catálogo (`/catalog/:muscle/:slug`): GIF, cómo se hace y "seguir". */
export function CatalogExerciseScreen() {
  const params = useParams();
  const muscle = parseMuscle(params['muscle']);
  const slug = params['slug'];

  if (muscle === null || slug === undefined || slug === '') {
    return (
      <>
        <ScreenHeader title="Catálogo" backTo={BACK_TO_CATALOG} />
        <Notice tone="danger" title="No existe ese ejercicio">
          El enlace no apunta a ningún ejercicio del catálogo.
        </Notice>
      </>
    );
  }

  return <CatalogExerciseDetail muscle={muscle} slug={slug} />;
}

interface CatalogExerciseDetailProps {
  readonly muscle: Muscle;
  readonly slug: string;
}

function CatalogExerciseDetail({ muscle, slug }: CatalogExerciseDetailProps) {
  const { session } = useSession();
  const exercise = useCatalogExercise(muscle, slug, session?.user.locale);
  const tracked = useTrackedExercises();

  const bodyPart = exercise.data?.bodyPart;
  const backTo: BackLink =
    bodyPart === undefined
      ? BACK_TO_CATALOG
      : { to: bodyPartPath(bodyPart), label: BODY_PART_LABELS[bodyPart] };

  return (
    <>
      <ScreenHeader title={exercise.data?.name ?? 'Ejercicio'} backTo={backTo} />
      <AsyncContent query={exercise}>
        {(data) => (
          <div className={styles.stack}>
            <ExerciseGif key={data.gifUrl} src={data.gifUrl} alt={`Animación de ${data.name}`} />

            <ul className={styles.tags} aria-label="Características">
              <li>
                <Badge tone="accent">{BODY_PART_LABELS[data.bodyPart]}</Badge>
              </li>
              <li>
                <Badge>{MUSCLE_LABELS[data.muscle]}</Badge>
              </li>
              <li>
                <Badge>{equipmentLabel(data.equipment)}</Badge>
              </li>
              <li>
                <Badge>{categoryLabel(data.category)}</Badge>
              </li>
            </ul>

            <FollowAction exercise={data} alreadyTracked={findTracked(tracked.data, data)} />

            {data.secondaryMuscles.length > 0 && (
              <p className={styles.secondary}>
                También trabaja: {data.secondaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')}
              </p>
            )}

            <Surface as="section">
              <h2 className={styles.sectionTitle}>Cómo se hace</h2>
              <ol className={styles.steps}>
                {data.instructions.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </Surface>

            <p className={styles.credit}>
              Animación de{' '}
              <a href={CATALOG_SOURCE_URL} target="_blank" rel="noopener noreferrer">
                ExerciseGymGifsDB
              </a>
              , servida por jsDelivr.
            </p>
          </div>
        )}
      </AsyncContent>
    </>
  );
}

interface FollowActionProps {
  readonly exercise: CatalogExercise;
  readonly alreadyTracked: TrackedExercise | null;
}

/**
 * "Seguir este ejercicio" lo mete en "mis ejercicios" y abre su ficha. Si ya está, se dice
 * y se enlaza a esa ficha; la lista de seguidos puede no haber llegado aún, y entonces el
 * botón se pinta igual: el Worker responderá que ya existe y la mutación lo resuelve sin
 * error, devolviendo la ficha existente a la que navegar.
 */
function FollowAction({ exercise, alreadyTracked }: FollowActionProps) {
  const navigate = useNavigate();
  const follow = useCreateTrackedExercise();

  if (alreadyTracked !== null) {
    return (
      <Surface className={styles.followed}>
        <Badge tone="success">Ya lo sigues</Badge>
        <Link to={trackedExercisePath(alreadyTracked.id)}>Abrir mi ficha</Link>
      </Surface>
    );
  }

  return (
    <div className={styles.stack}>
      <Button
        size="lg"
        fullWidth
        loading={follow.isPending}
        onClick={() => {
          follow.mutate(
            { id: newResourceId(), origin: 'catalog', catalogId: exercise.catalogId },
            {
              onSuccess: (tracked) => {
                void navigate(trackedExercisePath(tracked.id));
              },
            },
          );
        }}
      >
        Seguir este ejercicio
      </Button>
      {follow.isError && (
        <Notice tone="danger" title="No se pudo seguir el ejercicio">
          {describeError(follow.error)}
        </Notice>
      )}
    </div>
  );
}

/** El seguido activo de este ejercicio del catálogo; uno archivado no cuenta como seguido. */
function findTracked(
  tracked: readonly TrackedExercise[] | undefined,
  exercise: CatalogExercise,
): TrackedExercise | null {
  return (
    tracked?.find((item) => item.catalogId === exercise.catalogId && item.archivedAt === null) ??
    null
  );
}
