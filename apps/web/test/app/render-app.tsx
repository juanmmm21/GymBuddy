import { render } from '@testing-library/react';
import type { Session } from '@gymbuddy/shared';
import { App } from '../../src/app/App';
import { createTestRouter } from '../../src/app/router';
import { SESSION_STORAGE_KEY } from '../../src/auth/session-store';
import type { StorageLike } from '../../src/lib/storage';
import { createFakeFetch, type FakeFetch } from '../fake-fetch';

export interface RenderedApp {
  readonly fake: FakeFetch;
  readonly storage: StorageLike & { readonly data: Map<string, string> };
}

/** Monta la app entera con un router en memoria, un `fetch` falso y un almacenamiento en memoria. */
export function renderApp(options: {
  readonly path: string;
  readonly session?: Session;
  readonly setup?: (fake: FakeFetch) => void;
}): RenderedApp {
  const fake = createFakeFetch();
  options.setup?.(fake);

  const data = new Map<string, string>();
  if (options.session !== undefined) data.set(SESSION_STORAGE_KEY, JSON.stringify(options.session));
  const storage = {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };

  render(
    <App
      apiBaseUrl=""
      storage={storage}
      router={createTestRouter(options.path)}
      fetchImpl={fake.fetch}
    />,
  );

  return { fake, storage };
}
