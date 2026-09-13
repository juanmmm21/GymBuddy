import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { Button, Notice, Surface } from '../../components/index';
import { describeError } from '../../lib/errors';
import { pluralize } from '../../lib/format';
import { ExportIntegrityError, type ExportProgress } from './collect-export';
import { ExportSaveError, useExportDownload, type ExportSummary } from './use-export-download';
import { ImportSection } from './ImportSection';
import styles from './BackupScreen.module.css';

const BACK_TO_HOME: BackLink = { to: '/', label: 'Hoy' };

/**
 * La copia de seguridad de todo lo del usuario. Las llaves de acceso viven en los móviles y no
 * se pueden copiar, así que si se pierden todos, este fichero es lo único que queda del historial.
 */
export function BackupScreen() {
  const { download, progress, start } = useExportDownload();

  return (
    <>
      <ScreenHeader
        title="Copia de seguridad"
        subtitle="Todo tu entrenamiento en un fichero"
        backTo={BACK_TO_HOME}
      />
      <div className={styles.stack}>
        <Surface as="section">
          <ol className={styles.steps}>
            <li>Pulsa «Descargar mis datos» y espera a que termine.</li>
            <li>Tu móvil guardará un fichero que se llama gymbuddy y la fecha de hoy.</li>
            <li>
              Guárdalo también fuera de este móvil: en tu nube, en tu correo o en el ordenador.
            </li>
          </ol>
        </Surface>

        <Surface as="section">
          <p className={styles.contents}>
            Lleva tus ejercicios, todas tus sesiones con sus series, tus marcas y tus rutinas. No
            lleva tus llaves de acceso ni tus invitaciones: esas se quedan en tus móviles.
          </p>
        </Surface>

        {download.isError && (
          <Notice
            tone="danger"
            title="No se ha podido descargar la copia"
            action={
              <Button variant="secondary" onClick={start}>
                Reintentar
              </Button>
            }
          >
            {describeExportError(download.error)}
          </Notice>
        )}

        {download.isSuccess && <ExportDone summary={download.data} />}

        {download.isPending && progress !== null && <ExportProgressLine progress={progress} />}

        <Button
          size="lg"
          fullWidth
          loading={download.isPending}
          variant={download.isSuccess ? 'secondary' : 'primary'}
          onClick={start}
        >
          {download.isSuccess ? 'Descargar otra vez' : 'Descargar mis datos'}
        </Button>

        <ImportSection />
      </div>
    </>
  );
}

function ExportProgressLine({ progress }: { readonly progress: ExportProgress }) {
  return (
    <p className={styles.progress} role="status">
      {progress.totalSessions === 0
        ? 'Preparando tus datos…'
        : `Preparando sesiones: ${String(progress.loadedSessions)} de ${String(progress.totalSessions)}`}
    </p>
  );
}

function ExportDone({ summary }: { readonly summary: ExportSummary }) {
  return (
    <Notice tone="success" title="Copia descargada">
      {summary.fileName}: {pluralize(summary.sessions, 'sesión', 'sesiones')},{' '}
      {pluralize(summary.exercises, 'ejercicio', 'ejercicios')} y{' '}
      {pluralize(summary.routines, 'rutina', 'rutinas')}. Si no lo encuentras, mira en la carpeta de
      descargas o en la app Archivos.
    </Notice>
  );
}

function describeExportError(error: Error): string {
  if (error instanceof ExportSaveError) {
    return 'Este navegador no deja guardar ficheros desde aquí. Abre GymBuddy en Safari o en Chrome y vuelve a intentarlo.';
  }
  if (error instanceof ExportIntegrityError) {
    return 'Tus datos han cambiado mientras se preparaba la copia. Vuelve a intentarlo.';
  }
  return describeError(error);
}
