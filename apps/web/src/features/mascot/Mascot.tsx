import type { MascotMood, MascotState } from '@gymbuddy/shared';
import { Surface } from '../../components/index';
import { cx } from '../../lib/cx';
import { MASCOT_MOOD_LABELS } from './labels';
import type { MascotMessage } from './messages';
import {
  MASCOT_HEAD,
  MASCOT_HEADBAND,
  MASCOT_NECK,
  MASCOT_POSES,
  MASCOT_TORSO,
  MASCOT_VIEWBOX,
  type MascotAccentTone,
} from './poses';
import styles from './Mascot.module.css';

export interface MascotProps {
  readonly state: MascotState;
  readonly message: MascotMessage;
}

/**
 * La mascota pintada. Recibe el estado ya resuelto y no llama a `mascotState`: quien tiene
 * las señales decide, y aquí solo se dibuja la pose del `mood` y se escribe lo que toca
 * decir. Así se prueba pintando cada estado, sin montar ninguna consulta.
 */
export function Mascot({ state, message }: MascotProps) {
  const pose = MASCOT_POSES[state.mood];

  return (
    <Surface as="section" className={styles.card} aria-label="Tu compañero">
      <svg
        className={styles.figure}
        viewBox={`0 0 ${String(MASCOT_VIEWBOX.width)} ${String(MASCOT_VIEWBOX.height)}`}
        role="img"
        aria-label={MASCOT_MOOD_LABELS[state.mood]}
      >
        {/* Con `key` la pose se vuelve a montar al cambiar de estado y su entrada se repite. */}
        <g key={state.mood} className={styles.pose}>
          <g className={cx(styles.motion, FIGURE_MOTION[state.mood])}>
            <g
              transform={`rotate(${String(pose.headTilt)} ${String(MASCOT_NECK.x)} ${String(MASCOT_NECK.y)})`}
            >
              <circle
                className={styles.line}
                cx={MASCOT_HEAD.cx}
                cy={MASCOT_HEAD.cy}
                r={MASCOT_HEAD.r}
              />
              {MASCOT_HEADBAND.map((d) => (
                <path key={d} className={cx(styles.line, styles.accent)} d={d} />
              ))}
              {pose.face.map((d) => (
                <path key={d} className={styles.line} d={d} />
              ))}
            </g>
            <path className={styles.line} d={MASCOT_TORSO} />
            {pose.limbs.map((d) => (
              <path key={d} className={styles.line} d={d} />
            ))}
            {pose.wavingArm !== null && (
              <path className={cx(styles.line, styles.wave)} d={pose.wavingArm} />
            )}
          </g>

          <g className={ACCENT_MOTION[state.mood]}>
            {pose.accents.map((accent) => (
              <path
                key={accent.d}
                className={cx(styles.line, styles.thin, TONE_CLASS[accent.tone])}
                d={accent.d}
              />
            ))}
          </g>
        </g>
      </svg>

      <div className={styles.speech}>
        <p className={styles.title}>{message.title}</p>
        <p className={styles.body}>{message.body}</p>
      </div>
    </Surface>
  );
}

/** El movimiento continuo del muñeco en cada estado. */
const FIGURE_MOTION: Readonly<Record<MascotMood, string | undefined>> = {
  idle: styles.bob,
  resting: styles.breathe,
  cheering: styles.bounce,
  celebrating: styles.jump,
  nudging: undefined,
  sleepy: styles.bob,
};

/** Y el de lo que lleva alrededor: el confeti parpadea, las zetas y los resoplidos suben. */
const ACCENT_MOTION: Readonly<Record<MascotMood, string | undefined>> = {
  idle: undefined,
  resting: styles.drift,
  cheering: undefined,
  celebrating: styles.twinkle,
  nudging: styles.twinkle,
  sleepy: styles.drift,
};

const TONE_CLASS: Readonly<Record<MascotAccentTone, string | undefined>> = {
  accent: styles.accent,
  success: styles.success,
  muted: styles.muted,
};
