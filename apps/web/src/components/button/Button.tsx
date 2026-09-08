import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Spinner } from '../spinner/Spinner';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly fullWidth?: boolean;
  /** Mientras es `true` el botón no responde y muestra el spinner sin cambiar de tamaño. */
  readonly loading?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        styles.button,
        variantClass[variant],
        sizeClass[size],
        fullWidth && styles.fullWidth,
        loading && styles.loading,
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <span className={styles.spinner}>
          <Spinner size="sm" />
        </span>
      )}
      <span className={styles.label}>{children}</span>
    </button>
  );
}

const variantClass: Readonly<Record<ButtonVariant, string | undefined>> = {
  primary: styles.primary,
  secondary: styles.secondary,
  ghost: styles.ghost,
  danger: styles.danger,
};

const sizeClass: Readonly<Record<ButtonSize, string | undefined>> = {
  md: styles.sizeMd,
  lg: styles.sizeLg,
};
