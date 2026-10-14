import type { Competition, Competitor, Locale } from '@gymbuddy/shared';
import { useState } from 'react';
import { useCompetition } from '../../api/queries';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { useSession } from '../../auth/SessionProvider';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Button, Notice, SkeletonList, Surface } from '../../components/index';
import { cx } from '../../lib/cx';
import { formatWeightValue } from '../../lib/format';
import { CompeteSwitch } from './CompeteSwitch';
import { RivalsSheet } from './RivalsSheet';
import { barPercents, boardAgainst, marginGrams, type RivalDuel } from './standings';
import styles from './CompetitionScreen.module.css';

const BACK_TO_HOME: BackLink = { to: '/', label: 'Hoy' };

/**
 * Competir con amigos: tú contra cada rival, por el peso máximo que habéis levantado en los
 * ejercicios del catálogo que hacéis los dos (Juan, 2026-10-14: «no competimos por días, solo por
 * peso»). Se elige un rival arriba y se ve el marcador y la barra de cada ejercicio, como en la
 * maqueta «Marcador» que eligió.
 */
export function CompetitionScreen() {
  const { session } = useSession();
  const locale = session?.user.locale ?? 'es';
  const competition = useCompetition();
  const [choosing, setChoosing] = useState(false);
  const openChooser = (): void => {
    setChoosing(true);
  };

  return (
    <>
      <ScreenHeader
        title="Competir"
        subtitle="Quién levanta más, ejercicio a ejercicio"
        backTo={BACK_TO_HOME}
        action={
          <button type="button" className={styles.headerButton} onClick={openChooser}>
            Rivales
          </button>
        }
      />
      <div className={styles.stack}>
        <AsyncContent query={competition} skeleton={<SkeletonList rows={3} />}>
          {(data) => <Boards competition={data} locale={locale} onChooseRivals={openChooser} />}
        </AsyncContent>

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

interface BoardsProps {
  readonly competition: Competition;
  readonly locale: Locale;
  readonly onChooseRivals: () => void;
}

function Boards({ competition, locale, onChooseRivals }: BoardsProps) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  // El elegido puede haber dejado de competir desde la última vez: entonces, el primero.
  const rival =
    competition.rivals.find((candidate) => candidate.userId === pickedId) ?? competition.rivals[0];

  if (rival === undefined) {
    return (
      <Notice
        title="Todavía no compites con nadie"
        action={
          <Button variant="secondary" onClick={onChooseRivals}>
            Elegir rivales
          </Button>
        }
      >
        Elige rivales y aquí verás quién levanta más en cada ejercicio que hacéis los dos.
      </Notice>
    );
  }

  const board = boardAgainst(competition, rival);

  return (
    <>
      {competition.rivals.length > 1 && (
        <div className={styles.rivals} role="group" aria-label="Rival">
          {competition.rivals.map((candidate) => (
            <button
              key={candidate.userId}
              type="button"
              className={cx(
                styles.rivalChip,
                candidate.userId === rival.userId && styles.rivalChipOn,
              )}
              aria-pressed={candidate.userId === rival.userId}
              onClick={() => {
                setPickedId(candidate.userId);
              }}
            >
              {candidate.displayName}
            </button>
          ))}
        </div>
      )}

      <section className={styles.score} aria-label={scoreLabel(rival, board.wins, board.losses)}>
        <span className={styles.side}>
          <span className={cx(styles.sideName, styles.sideNameSelf)}>Tú</span>
          <span className={styles.sideScore}>{board.wins}</span>
        </span>
        <span className={styles.versus} aria-hidden="true">
          <span className={styles.versusMark}>VS</span>
          {board.draws > 0 && (
            <span className={styles.draws}>
              {board.draws === 1 ? '1 empate' : `${String(board.draws)} empates`}
            </span>
          )}
        </span>
        <span className={cx(styles.side, styles.sideRival)}>
          <span className={styles.sideName}>{rival.displayName}</span>
          <span className={styles.sideScore}>{board.losses}</span>
        </span>
      </section>

      <section className={styles.section} aria-labelledby="competition-duels">
        <h2 id="competition-duels" className={styles.sectionTitle}>
          Peso máximo, ejercicio a ejercicio
        </h2>
        {board.duels.length === 0 ? (
          <p className={styles.note}>
            Todavía no tenéis marca en ningún ejercicio del catálogo que hagáis los dos.
          </p>
        ) : (
          <ul className={styles.duels}>
            {board.duels.map((duel) => (
              <DuelCard key={duel.catalogId} duel={duel} rival={rival} locale={locale} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

interface DuelCardProps {
  readonly duel: RivalDuel;
  readonly rival: Competitor;
  readonly locale: Locale;
}

function DuelCard({ duel, rival, locale }: DuelCardProps) {
  const margin = marginGrams(duel);
  const bars = barPercents(duel);
  const gap = formatWeightValue(Math.abs(margin), locale);
  const verdict =
    margin > 0 ? `Ganas por ${gap} kg` : margin < 0 ? `Te faltan ${gap} kg` : 'Empate';

  return (
    <li className={styles.duel} aria-label={`${duel.name}: ${verdict}`}>
      <div className={styles.duelHead}>
        <h3 className={styles.duelName}>{duel.name}</h3>
        <span
          className={cx(
            styles.verdict,
            margin > 0 && styles.verdictWin,
            margin < 0 && styles.verdictLoss,
          )}
        >
          {verdict}
        </span>
      </div>
      <DuelBar
        who="Tú"
        grams={duel.mineGrams}
        percent={bars.mine}
        leading={margin >= 0}
        self
        locale={locale}
      />
      <DuelBar
        who={rival.displayName}
        grams={duel.theirsGrams}
        percent={bars.theirs}
        leading={margin <= 0}
        locale={locale}
      />
    </li>
  );
}

interface DuelBarProps {
  readonly who: string;
  readonly grams: number;
  readonly percent: number;
  /** Va por delante o empata: su barra se enciende. */
  readonly leading: boolean;
  readonly self?: boolean;
  readonly locale: Locale;
}

function DuelBar({ who, grams, percent, leading, self = false, locale }: DuelBarProps) {
  return (
    <div className={styles.barRow}>
      <span className={styles.barWho}>{who}</span>
      <span className={styles.barTrack} aria-hidden="true">
        <span
          className={cx(
            styles.barFill,
            leading && (self ? styles.barFillSelf : styles.barFillRival),
          )}
          // El ancho es un dato, no un estilo: el peso de cada uno en proporción al mayor.
          style={{ inlineSize: `${String(percent)}%` }}
        />
      </span>
      <span className={styles.barValue}>{formatWeightValue(grams, locale)}</span>
    </div>
  );
}

function scoreLabel(rival: Competitor, wins: number, losses: number): string {
  return `Marcador: tú ${String(wins)}, ${rival.displayName} ${String(losses)}`;
}
