import { useId, type ChangeEvent } from 'react';
import styles from './Select.module.css';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  /** Título del `optgroup` bajo el que va la opción; sin él, va suelta. */
  readonly group?: string;
}

export interface SelectProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly disabled?: boolean;
  readonly hint?: string;
}

/**
 * Desplegable nativo. En el móvil el selector del sistema es más cómodo que cualquier
 * lista propia —se abre a pantalla completa y se recorre con el pulgar—, así que aquí
 * solo se le pone el aspecto del sistema de diseño.
 */
export function Select({ label, value, onChange, options, disabled = false, hint }: SelectProps) {
  const selectId = useId();
  const hintId = useId();

  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    onChange(event.target.value);
  };

  return (
    <div className={styles.field}>
      <label htmlFor={selectId} className={styles.label}>
        {label}
      </label>
      <div className={styles.control}>
        <select
          id={selectId}
          className={styles.select}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          aria-describedby={hint !== undefined ? hintId : undefined}
        >
          {renderOptions(options)}
        </select>
        <span className={styles.chevron} aria-hidden="true">
          ▾
        </span>
      </div>
      {hint !== undefined && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** Los grupos salen en el orden en que aparece su primera opción, sin reordenar nada. */
function renderOptions(options: readonly SelectOption[]) {
  const groups: { readonly name: string | undefined; readonly items: SelectOption[] }[] = [];

  for (const option of options) {
    const last = groups.at(-1);
    if (last !== undefined && last.name === option.group) {
      last.items.push(option);
    } else {
      groups.push({ name: option.group, items: [option] });
    }
  }

  return groups.map((group, index) =>
    group.name === undefined ? (
      group.items.map((option) => <Option key={option.value} option={option} />)
    ) : (
      <optgroup key={`${group.name}-${String(index)}`} label={group.name}>
        {group.items.map((option) => (
          <Option key={option.value} option={option} />
        ))}
      </optgroup>
    ),
  );
}

function Option({ option }: { readonly option: SelectOption }) {
  return <option value={option.value}>{option.label}</option>;
}
