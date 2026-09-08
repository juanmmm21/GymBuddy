import { useId } from 'react';
import styles from './SearchField.module.css';

export interface SearchFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Lo que se busca, para el lector de pantalla y el `placeholder`. */
  readonly label: string;
  readonly placeholder?: string;
}

/**
 * Campo de búsqueda con borrado en un toque. Es un control no controlado por el navegador
 * a propósito: el valor vive en quien lo usa, que decide cuándo lanzar la consulta.
 */
export function SearchField({ value, onChange, label, placeholder }: SearchFieldProps) {
  const inputId = useId();

  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.hiddenLabel}>
        {label}
      </label>
      <input
        id={inputId}
        type="search"
        className={styles.input}
        value={value}
        placeholder={placeholder ?? label}
        autoComplete="off"
        autoCorrect="off"
        enterKeyHint="search"
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {value !== '' && (
        <button
          type="button"
          className={styles.clear}
          aria-label="Borrar búsqueda"
          onClick={() => {
            onChange('');
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
