import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Badge } from '../../src/components/badge/Badge';
import { Button } from '../../src/components/button/Button';
import { Notice } from '../../src/components/notice/Notice';
import { Sheet } from '../../src/components/sheet/Sheet';
import { Surface } from '../../src/components/surface/Surface';
import { TextArea } from '../../src/components/text-area/TextArea';

describe('Button', () => {
  it('mientras carga no responde y lo anuncia', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Guardar
      </Button>,
    );

    const button = screen.getByRole('button', { name: /Guardar/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('es un botón normal por defecto, no un submit', () => {
    render(<Button>Ok</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('Surface', () => {
  it('se pinta con el elemento pedido', () => {
    render(
      <ul>
        <Surface as="li">fila</Surface>
      </ul>,
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('fila');
  });
});

describe('Badge', () => {
  it('muestra su contenido', () => {
    render(<Badge tone="success">PR</Badge>);
    expect(screen.getByText('PR')).toBeInTheDocument();
  });
});

describe('Notice', () => {
  it('un aviso de peligro es una alerta; el resto, un estado', () => {
    render(
      <>
        <Notice tone="danger" title="Falló" />
        <Notice title="Vacío" />
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Falló');
    expect(screen.getByRole('status')).toHaveTextContent('Vacío');
  });
});

describe('Sheet', () => {
  it('solo monta el contenido mientras está abierta', () => {
    const { rerender } = render(
      <Sheet open={false} onClose={() => undefined} title="Serie">
        <p>contenido</p>
      </Sheet>,
    );
    expect(screen.queryByText('contenido')).not.toBeInTheDocument();

    rerender(
      <Sheet open onClose={() => undefined} title="Serie">
        <p>contenido</p>
      </Sheet>,
    );
    expect(screen.getByText('contenido')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute('open');
  });

  it('el botón de cerrar avisa al padre en vez de cerrarse sola', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Serie">
        <p>contenido</p>
      </Sheet>,
    );

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });
});

describe('TextArea', () => {
  it('avisa de cada cambio y enseña cuánto queda del límite', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TextArea label="Notas" value="Hola" onChange={onChange} maxLength={500} />);

    const box = screen.getByRole('textbox', { name: 'Notas' });
    expect(box).toHaveValue('Hola');
    expect(box).toHaveAttribute('maxlength', '500');
    expect(screen.getByText('4/500')).toBeInTheDocument();

    await user.type(box, '!');
    expect(onChange).toHaveBeenLastCalledWith('Hola!');
  });
});
