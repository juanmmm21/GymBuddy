import type { ClaimSessionResponse } from '@gymbuddy/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, ApiTransportError } from '../../src/api/client';
import { claimWithBackoff, sleepFor } from '../../src/auth/claim-with-backoff';
import { session } from '../fixtures';

const START = Date.parse('2026-09-08T12:00:00.000Z');
const TEN_MINUTES_MS = 10 * 60 * 1000;

/** Reloj simulado: cada espera avanza el tiempo en vez de dormir de verdad. */
function fakeClock() {
  let now = START;
  const waits: number[] = [];
  return {
    now: () => now,
    sleep: (ms: number) => {
      waits.push(ms);
      now += ms;
      return Promise.resolve();
    },
    waits,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const pending: ClaimSessionResponse = { status: 'pending' };
const ready: ClaimSessionResponse = { status: 'ready', session };

describe('claimWithBackoff', () => {
  it('sondea con backoff hasta que el canje está listo', async () => {
    const clock = fakeClock();
    const claim = vi
      .fn<() => Promise<ClaimSessionResponse>>()
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(ready);

    const outcome = await claimWithBackoff({
      claim,
      expiresAt: new Date(START + TEN_MINUTES_MS).toISOString(),
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(outcome).toEqual({ status: 'ready', session });
    expect(claim).toHaveBeenCalledTimes(4);
    expect(clock.waits).toEqual([1000, 1500, 2250]);
  });

  it('el retardo se queda en el tope', async () => {
    const clock = fakeClock();
    const claim = vi.fn<() => Promise<ClaimSessionResponse>>().mockResolvedValue(pending);
    claim.mockResolvedValueOnce(pending);

    const outcome = await claimWithBackoff({
      claim,
      expiresAt: new Date(START + 30_000).toISOString(),
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(outcome).toEqual({ status: 'expired' });
    expect(Math.max(...clock.waits)).toBeLessThanOrEqual(5000);
    // La última espera se recorta a lo que queda de vida del nonce.
    expect(clock.waits.reduce((a, b) => a + b, 0)).toBe(30_000);
  });

  it('se rinde al caducar el nonce', async () => {
    const clock = fakeClock();
    const claim = vi.fn<() => Promise<ClaimSessionResponse>>().mockResolvedValue(pending);

    const outcome = await claimWithBackoff({
      claim,
      expiresAt: new Date(START + 2500).toISOString(),
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(outcome).toEqual({ status: 'expired' });
    expect(clock.waits).toEqual([1000, 1500]);
  });

  it('un nonce rechazado por el Worker es definitivo', async () => {
    const clock = fakeClock();
    const claim = vi
      .fn<() => Promise<ClaimSessionResponse>>()
      .mockRejectedValue(new ApiRequestError('nonce_invalid', 400, 'ya no sirve'));

    const outcome = await claimWithBackoff({
      claim,
      expiresAt: new Date(START + TEN_MINUTES_MS).toISOString(),
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(outcome).toEqual({ status: 'invalid' });
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it('un corte de red se espera como un pending más', async () => {
    const clock = fakeClock();
    const claim = vi
      .fn<() => Promise<ClaimSessionResponse>>()
      .mockRejectedValueOnce(new ApiTransportError('sin red'))
      .mockResolvedValueOnce(ready);

    const outcome = await claimWithBackoff({
      claim,
      expiresAt: new Date(START + TEN_MINUTES_MS).toISOString(),
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(outcome.status).toBe('ready');
    expect(clock.waits).toEqual([1000]);
  });

  it('cualquier otro error se propaga', async () => {
    const clock = fakeClock();
    const claim = vi
      .fn<() => Promise<ClaimSessionResponse>>()
      .mockRejectedValue(new ApiRequestError('internal_error', 500, 'boom'));

    await expect(
      claimWithBackoff({
        claim,
        expiresAt: new Date(START + TEN_MINUTES_MS).toISOString(),
        now: clock.now,
        sleep: clock.sleep,
      }),
    ).rejects.toMatchObject({ code: 'internal_error' });
  });

  it('abortar la señal corta la espera', async () => {
    const controller = new AbortController();
    const claim = vi.fn<() => Promise<ClaimSessionResponse>>().mockResolvedValue(pending);

    const promise = claimWithBackoff({
      claim,
      expiresAt: new Date(Date.now() + TEN_MINUTES_MS).toISOString(),
      signal: controller.signal,
      sleep: sleepFor,
    });
    controller.abort();

    await expect(promise).resolves.toEqual({ status: 'aborted' });
  });
});
