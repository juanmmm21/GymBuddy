import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiTransportError } from '../../src/api/client';
import { AsyncContent } from '../../src/components/async-content/AsyncContent';

const clients: QueryClient[] = [];

afterEach(() => {
  clients.splice(0).forEach((client) => {
    client.clear();
  });
});

interface Harness {
  online: boolean;
  value: string;
}

function Reading({ harness, quiet }: { readonly harness: Harness; readonly quiet: boolean }) {
  const query = useQuery({
    queryKey: ['lectura'],
    queryFn: () =>
      harness.online
        ? Promise.resolve(harness.value)
        : Promise.reject(new ApiTransportError('sin red')),
  });
  return (
    <>
      {/* Fuera de AsyncContent: deja al test esperar al fallo de la relectura. */}
      {query.isRefetchError && <span>relectura fallida</span>}
      <AsyncContent query={query} quietRefetchError={quiet}>
        {(data) => <p>{data}</p>}
      </AsyncContent>
    </>
  );
}

function renderReading(
  harness: Harness,
  { quiet = false, cached }: { quiet?: boolean; cached?: string } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, networkMode: 'always' } },
  });
  clients.push(client);
  if (cached !== undefined) client.setQueryData(['lectura'], cached, { updatedAt: 0 });
  render(
    <QueryClientProvider client={client}>
      <Reading harness={harness} quiet={quiet} />
    </QueryClientProvider>,
  );
}

describe('AsyncContent', () => {
  it('con datos y la relectura fallida, enseña los datos con un aviso y su reintento', async () => {
    const actor = userEvent.setup();
    const harness: Harness = { online: false, value: 'lo nuevo' };
    renderReading(harness, { cached: 'lo guardado' });

    expect(screen.getByText('lo guardado')).toBeInTheDocument();
    expect(
      await screen.findByText('Sin actualizar: ves lo último que se cargó'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument();
    expect(screen.queryByText('No se pudo cargar')).not.toBeInTheDocument();

    harness.online = true;
    await actor.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('lo nuevo')).toBeInTheDocument();
    expect(screen.queryByText(/Sin actualizar/)).not.toBeInTheDocument();
  });

  it('una anidada puede callar su relectura fallida y seguir enseñando los datos', async () => {
    const harness: Harness = { online: false, value: 'lo nuevo' };
    renderReading(harness, { cached: 'lo guardado', quiet: true });

    expect(await screen.findByText('relectura fallida')).toBeInTheDocument();
    expect(screen.getByText('lo guardado')).toBeInTheDocument();
    expect(screen.queryByText(/Sin actualizar/)).not.toBeInTheDocument();
  });

  it('sin datos, el fallo sigue siendo un error con reintento', async () => {
    renderReading({ online: false, value: 'x' });

    expect(await screen.findByText('No se pudo cargar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
