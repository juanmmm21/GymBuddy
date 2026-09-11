import type { MascotState } from '@gymbuddy/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MASCOT_MOOD_LABELS } from '../../src/features/mascot/labels';
import { Mascot } from '../../src/features/mascot/Mascot';
import { mascotMessage } from '../../src/features/mascot/messages';
import { MASCOT_POSES } from '../../src/features/mascot/poses';

const STATES: readonly MascotState[] = [
  { mood: 'idle', reason: 'on_track' },
  { mood: 'resting', remainingSeconds: 42 },
  { mood: 'cheering', reason: 'rest_over' },
  { mood: 'celebrating', recordAchievedAt: '2026-09-11T10:00:00.000Z' },
  { mood: 'nudging', reason: 'absence', daysSinceLastSession: 5 },
  { mood: 'sleepy', daysSinceLastSession: 8 },
];

function renderMascot(state: MascotState) {
  const message = mascotMessage(state, { locale: 'es', stalled: [] });
  const view = render(<Mascot state={state} message={message} />);
  return { ...view, message };
}

describe('Mascot', () => {
  it.each(STATES)('pinta la pose y el mensaje de $mood', (state) => {
    const { message } = renderMascot(state);

    const card = screen.getByRole('region', { name: 'Tu compañero' });
    expect(
      within(card).getByRole('img', { name: MASCOT_MOOD_LABELS[state.mood] }),
    ).toBeInTheDocument();
    expect(within(card).getByText(message.title)).toBeInTheDocument();
    expect(within(card).getByText(message.body)).toBeInTheDocument();
  });

  it.each(STATES)('dibuja con trazo todos los trazados de la pose de $mood', (state) => {
    const { container } = renderMascot(state);
    const pose = MASCOT_POSES[state.mood];
    const drawn = [...container.querySelectorAll('path')].map((path) => path.getAttribute('d'));

    for (const d of [...pose.face, ...pose.limbs, ...pose.accents.map((accent) => accent.d)]) {
      expect(drawn).toContain(d);
    }
    if (pose.wavingArm !== null) expect(drawn).toContain(pose.wavingArm);
  });

  it('inclina la cabeza solo en la pose que la lleva caída', () => {
    const { container, rerender } = renderMascot({ mood: 'sleepy', daysSinceLastSession: 8 });
    expect(container.querySelector('g[transform^="rotate(12 "]')).not.toBeNull();

    const idle: MascotState = { mood: 'idle', reason: 'on_track' };
    rerender(<Mascot state={idle} message={mascotMessage(idle, { locale: 'es', stalled: [] })} />);
    expect(container.querySelector('g[transform^="rotate(0 "]')).not.toBeNull();
    expect(screen.getByRole('img', { name: MASCOT_MOOD_LABELS.idle })).toBeInTheDocument();
  });
});
