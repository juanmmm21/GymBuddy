import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '../auth/SessionProvider';

/** Todo lo que cuelga de aquí exige sesión; sin ella se va a la entrada. */
export function RequireSession() {
  const { session } = useSession();
  const location = useLocation();

  if (session === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
