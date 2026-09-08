import { Navigate } from 'react-router';
import { LoginScreen } from '../auth/LoginScreen';
import { useSession } from '../auth/SessionProvider';

/** Con sesión abierta, la entrada no tiene sentido: se va a la pantalla de inicio. */
export function LoginRoute() {
  const { session } = useSession();
  return session === null ? <LoginScreen /> : <Navigate to="/" replace />;
}
