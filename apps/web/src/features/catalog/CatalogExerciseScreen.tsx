import type { CatalogExercise, Muscle, TrackedExercise } from '@gymbuddy/shared';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useCreateTrackedExercise } from '../../api/mutations';
import { useCatalogExercise, useTrackedExercises } from '../../api/queries';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Button, Notice, Surface } from '../../components/index';
import { describeError } from '../../lib/errors';
import { newResourceId } from '../../lib/ids';
import { trackedExercisePath } from '../exercises/paths';
import { ExerciseGif } from './ExerciseGif';
import { bodyPartLabel, muscleLabel, categoryLabel, equipmentLabel } from './labels';
import { readCatalogBackLink } from './navigation';
import { CATALOG_PATH, bodyPartPath, parseMuscle } from './paths';
import styles from './CatalogExerciseScreen.module.css';
import { t, useLocale } from '../../i18n/index';

function backToCatalog(): BackLink {
  return { to: CATALOG_PATH, label: t('Catálogo', 'Catalogue') };
}
const CATALOG_SOURCE_URL = 'https://github.com/JahelCuadrado/ExerciseGymGifsDB';

/** La ficha de un ejercicio del catálogo (`/catalog/:muscle/:slug`): GIF, cómo se hace y "seguir". */
export function CatalogExerciseScreen() {
  const params = useParams();
  const muscle = parseMuscle(params['muscle']);
  const slug = params['slug'];

  if (muscle === null || slug === undefined || slug === '') {
    return (
      <>
        <ScreenHeader title={t('Catálogo', 'Catalogue')} backTo={backToCatalog()} />
        <Notice tone="danger" title={t('No existe ese ejercicio', 'That exercise doesn’t exist')}>
          {t(
            'El enlace no apunta a ningún ejercicio del catálogo.',
            'The link doesn’t point to any catalogue exercise.',
          )}
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
  const exercise = useCatalogExercise(muscle, slug, useLocale());
  const tracked = useTrackedExercises();

  const fromList = readCatalogBackLink(useLocation().state);

  // Se vuelve a la lista de la que se vino (la búsqueda con su texto, o la parte con sus filtros);
  // sin ella, a la parte del cuerpo del ejercicio, que es de donde cuelga en el catálogo.
  const bodyPart = exercise.data?.bodyPart;
  const backTo: BackLink =
    fromList ??
    (bodyPart === undefined
      ? backToCatalog()
      : { to: bodyPartPath(bodyPart), label: bodyPartLabel(bodyPart) });

  return (
    <>
      <ScreenHeader title={exercise.data?.name ?? t('Ejercicio', 'Exercise')} backTo={backTo} />
      <AsyncContent query={exercise}>
        {(data) => (
          <div className={styles.stack}>
            <ExerciseGif
              key={data.gifUrl}
              src={data.gifUrl}
              alt={t(`Animación de ${data.name}`, `Animation of ${data.name}`)}
            />

            <ul className={styles.tags} aria-label={t('Características', 'Details')}>
              <li>
                <Badge tone="accent">{bodyPartLabel(data.bodyPart)}</Badge>
              </li>
              <li>
                <Badge>{muscleLabel(data.muscle)}</Badge>
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
                {t('También trabaja:', 'Also works:')}{' '}
                {data.secondaryMuscles.map((m) => muscleLabel(m)).join(', ')}
              </p>
            )}

            <Surface as="section">
              <h2 className={styles.sectionTitle}>{t('Cómo se hace', 'How to do it')}</h2>
              <ol className={styles.steps}>
                {data.instructions.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </Surface>

            <p className={styles.credit}>
              {t('Animación de', 'Animation from')}{' '}
              <a href={CATALOG_SOURCE_URL} target="_blank" rel="noopener noreferrer">
                ExerciseGymGifsDB
              </a>
              {t(', servida por jsDelivr.', ', served by jsDelivr.')}
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
        <Badge tone="success">{t('Ya lo sigues', 'Already tracked')}</Badge>
        <Link to={trackedExercisePath(alreadyTracked.id)}>
          {t('Abrir mi ficha', 'Open my exercise')}
        </Link>
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
        {t('Seguir este ejercicio', 'Track this exercise')}
      </Button>
      {follow.isError && (
        <Notice
          tone="danger"
          title={t('No se pudo seguir el ejercicio', 'The exercise couldn’t be tracked')}
        >
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
