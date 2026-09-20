import { CATALOG_SOURCE_REPOSITORY, CATALOG_SOURCE_URL } from '@gymbuddy/shared';
import styles from './CatalogCredit.module.css';

/**
 * El crédito del catálogo externo. Los ejercicios y sus GIFs son de terceros y el repositorio de
 * origen no tiene licencia (ADR 0001): se consumen por CDN y se acreditan **donde se ven**, así
 * que este texto sale en el catálogo y en Ajustes. Vive en un componente para que las dos
 * pantallas digan exactamente lo mismo y el enlace no se quede atrás si cambia la fuente.
 */
export function CatalogCredit() {
  return (
    <p className={styles.credit}>
      Los ejercicios y sus animaciones vienen de{' '}
      <a
        className={styles.link}
        href={CATALOG_SOURCE_URL}
        target="_blank"
        rel="noreferrer"
        // El nombre visible es el del repositorio, pero leído letra a letra no se entiende: el
        // lector de pantalla dice de dónde lleva.
        aria-label={`${CATALOG_SOURCE_REPOSITORY}, el catálogo de ejercicios en GitHub`}
      >
        {CATALOG_SOURCE_REPOSITORY}
      </a>
      , servidos por jsDelivr. GymBuddy no los aloja.
    </p>
  );
}
