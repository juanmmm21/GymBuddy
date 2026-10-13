import type {
  Competition,
  CompetitionExercise,
  CompetitionWeekStanding,
  Locale,
} from '@gymbuddy/shared';
import { useState } from 'react';
import { useCompetition } from '../../api/queries';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { useSession } from '../../auth/SessionProvider';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Button, Notice, SkeletonList, Surface } from '../../components/index';
import { cx } from '../../lib/cx';
import { formatWeightLabel } from '../../lib/format';
import { ExerciseThumb } from '../catalog/ExerciseThumb';
import { CompeteSwitch } from './CompeteSwitch';
import { RivalsSheet } from './RivalsSheet';
import { rankLabel, standingSummary } from './standings';
import styles from './CompetitionScreen.module.css';

const BACK_TO_HOME: BackLink = { to: '/', label: 'Hoy' };

/**
 * Competir con amigos (lo pidió Juan el 2026-10-13): la clasificación de la semana en curso con
 * los rivales que cada uno elige y el cara a cara en los ejercicios del catálogo que comparten.
 * No hay retos ni invitaciones: se elige una lista y la clasificación está siempre ahí.
 */
export function CompetitionScreen() {
  const { session } = useSession();
  const locale = session?.user.locale ?? 'es';
  const competition = useCompetition();
  const [choosing, setChoosing] = useState(false);

  return (
    <>
      <ScreenHeader
        title="Competir"
        subtitle="Tú contra tus amigos, semana a semana"
        backTo={BACK_TO_HOME}
      />
      <div className={styles.stack}>
        <AsyncContent query={competition} skeleton={<SkeletonList rows={3} />}>
          {(data) => <Standings competition={data} locale={locale} />}
        </AsyncContent>

        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            setChoosing(true);
          }}
        >
          Elegir rivales
        </Button>

        <Surface as="section" aria-label="Tu participación">
          <CompeteSwitch />
        </Surface>
      </div>

      <RivalsSheet
        open={choosing}
        onClose={() => {
          setChoosing(false);
        }}
      />
    </>
  );
}

interface StandingsProps {
  readonly competition: Competition;
  readonly locale: Locale;
}

function Standings({ competition, locale }: StandingsProps) {
  // La clasificación siempre trae a quien mira: con una sola fila no hay contra quién.
  if (competition.week.length < 2) {
    return (
      <Notice title="Todavía no compites con nadie">
        Elige rivales y aquí verás quién entrena más cada semana y quién levanta más en los
        ejercicios que hacéis los dos.
      </Notice>
    );
  }

  return (
    <>
      <section className={styles.section} aria-labelledby="competition-week">
        <h2 id="competition-week" className={styles.sectionTitle}>
          Esta semana
        </h2>
        <Surface padding="none">
          <ol className={styles.list}>
            {competition.week.map((standing) => (
              <StandingRow
                key={standing.userId}
                standing={standing}
                total={competition.week.length}
                locale={locale}
              />
            ))}
          </ol>
        </Surface>
        <p className={styles.note}>
          Gana quien más días entrena; las series y los kilos solo desempatan.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="competition-exercises">
        <h2 id="competition-exercises" className={styles.sectionTitle}>
          Cara a cara
        </h2>
        {competition.exercises.length === 0 ? (
          <p className={styles.note}>
            Cuando un rival y tú tengáis marca en el mismo ejercicio del catálogo, saldrá aquí.
          </p>
        ) : (
          <ul className={styles.exercises}>
            {competition.exercises.map((exercise) => (
              <ExerciseDuelCard key={exercise.catalogId} exercise={exercise} locale={locale} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

interface StandingRowProps {
  readonly standing: CompetitionWeekStanding;
  readonly total: number;
  readonly locale: Locale;
}

function StandingRow({ standing, total, locale }: StandingRowProps) {
  return (
    <li className={cx(styles.row, standing.isSelf && styles.rowSelf)}>
      <span
        className={cx(styles.rank, standing.rank === 1 && styles.rankFirst)}
        aria-label={rankLabel(standing.rank, total)}
      >
        {standing.rank}
      </span>
      <span className={styles.text}>
        <span className={styles.name}>
          {standing.displayName}
          {standing.isSelf && <Badge tone="accent">Tú</Badge>}
        </span>
        <span className={styles.meta}>{standingSummary(standing, locale)}</span>
      </span>
    </li>
  );
}

interface ExerciseDuelCardProps {
  readonly exercise: CompetitionExercise;
  readonly locale: Locale;
}

/** Un ejercicio que hacéis los dos: de mejor a peor 1RM estimado, con el peso máximo al lado. */
function ExerciseDuelCard({ exercise, locale }: ExerciseDuelCardProps) {
  return (
    <Surface as="li" padding="none">
      <div className={styles.exerciseHead}>
        <ExerciseThumb key={exercise.gifUrl} gifUrl={exercise.gifUrl} />
        <h3 className={styles.exerciseName}>{exercise.name}</h3>
      </div>
      <ol className={styles.list} aria-label={`Marcas en ${exercise.name}`}>
        {exercise.entries.map((entry, index) => (
          <li key={entry.userId} className={cx(styles.row, entry.isSelf && styles.rowSelf)}>
            <span className={cx(styles.rank, index === 0 && styles.rankFirst)} aria-hidden="true">
              {index + 1}
            </span>
            <span className={styles.text}>
              <span className={styles.name}>
                {entry.displayName}
                {entry.isSelf && <Badge tone="accent">Tú</Badge>}
              </span>
              <span className={styles.meta}>
                Peso máximo {formatWeightLabel(entry.maxWeight, locale)}
              </span>
            </span>
            <span className={styles.mark}>
              <span className={styles.markValue}>
                {formatWeightLabel(entry.estimatedOneRepMax, locale)}
              </span>
              <span className={styles.meta}>1RM estimado</span>
            </span>
          </li>
        ))}
      </ol>
    </Surface>
  );
}
