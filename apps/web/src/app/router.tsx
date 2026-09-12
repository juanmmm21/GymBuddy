import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router';
import { BodyPartScreen } from '../features/catalog/BodyPartScreen';
import { CatalogExerciseScreen } from '../features/catalog/CatalogExerciseScreen';
import { CatalogScreen } from '../features/catalog/CatalogScreen';
import { LinkDeviceScreen } from '../features/devices/LinkDeviceScreen';
import { ExercisesScreen } from '../features/exercises/ExercisesScreen';
import { TrackedExerciseScreen } from '../features/exercises/TrackedExerciseScreen';
import { HistoryScreen } from '../features/history/HistoryScreen';
import { SessionDetailScreen } from '../features/history/SessionDetailScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { InviteFriendScreen } from '../features/invitations/InviteFriendScreen';
import { RoutineScreen } from '../features/routines/RoutineScreen';
import { RoutinesScreen } from '../features/routines/RoutinesScreen';
import { SessionScreen } from '../features/session/SessionScreen';
import { LoginRoute } from './LoginRoute';
import { RequireSession } from './RequireSession';
import { TabShell } from './TabShell';

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginRoute /> },
  {
    element: <RequireSession />,
    children: [
      {
        element: <TabShell />,
        children: [
          { index: true, element: <HomeScreen /> },
          // La sesión no es una pestaña: se entra desde Hoy o desde la ficha de un
          // ejercicio, que es cuando hay algo que registrar.
          { path: 'session', element: <SessionScreen /> },
          // Añadir otro dispositivo cuelga de Hoy, donde está el saludo y la salida: es cosa
          // de la cuenta, no del entrenamiento, y no merece una pestaña.
          { path: 'devices', element: <LinkDeviceScreen /> },
          // Invitar a un amigo cuelga de Hoy por lo mismo: es de la cuenta, no del entrenamiento.
          { path: 'invite', element: <InviteFriendScreen /> },
          { path: 'exercises', element: <ExercisesScreen /> },
          { path: 'exercises/:id', element: <TrackedExerciseScreen /> },
          // Las rutinas no tienen pestaña propia: cuelgan de "Mis ejercicios", que es de lo
          // que están hechas, y una quinta pestaña no cabe cómoda bajo el pulgar.
          { path: 'routines', element: <RoutinesScreen /> },
          { path: 'routines/:id', element: <RoutineScreen /> },
          { path: 'catalog', element: <CatalogScreen /> },
          // Un segmento es una parte del cuerpo; dos, "{muscle}/{slug}", la ficha. Son
          // profundidades distintas, así que `chest` y `pectorals/...` no se confunden.
          { path: 'catalog/:bodyPart', element: <BodyPartScreen /> },
          { path: 'catalog/:muscle/:slug', element: <CatalogExerciseScreen /> },
          { path: 'history', element: <HistoryScreen /> },
          { path: 'history/:id', element: <SessionDetailScreen /> },
        ],
      },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}

/** Para los tests: mismas rutas, sin tocar la URL del navegador. */
export function createTestRouter(initialPath: string) {
  return createMemoryRouter(routes, { initialEntries: [initialPath] });
}
