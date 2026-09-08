import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router';
import { CatalogScreen } from '../features/catalog/CatalogScreen';
import { ExercisesScreen } from '../features/exercises/ExercisesScreen';
import { HistoryScreen } from '../features/history/HistoryScreen';
import { HomeScreen } from '../features/home/HomeScreen';
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
          { path: 'exercises', element: <ExercisesScreen /> },
          { path: 'catalog', element: <CatalogScreen /> },
          { path: 'history', element: <HistoryScreen /> },
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
