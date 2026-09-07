import { Hono } from 'hono';
import { registerErrorHandlers } from './http/error-handler';
import { healthRoute } from './routes/v1/health';

const app = new Hono<{ Bindings: Env }>();

registerErrorHandlers(app);

app.route('/api/v1', healthRoute);

export default app;
