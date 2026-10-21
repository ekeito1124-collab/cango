import { HttpError, readBody, send } from './http.js';
import { currentUser } from './auth.js';
import authRoutes from './routes/auth.js';
import shopRoutes from './routes/shops.js';
import reservationRoutes from './routes/reservations.js';
import bizRoutes from './routes/biz.js';
import adminRoutes from './routes/admin.js';
import aiRoutes from './routes/ai.js';

const routes = [...authRoutes, ...shopRoutes, ...reservationRoutes, ...bizRoutes, ...adminRoutes, ...aiRoutes].map(([method, pattern, handler]) => {
  const keys = [];
  const re = new RegExp(
    '^' +
      pattern
        .split('/')
        .map((seg) => (seg.startsWith(':') ? (keys.push(seg.slice(1)), '([^/]+)') : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        .join('/') +
      '$',
  );
  return { method, re, keys, handler };
});

export async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = (url.searchParams.get('__path') ?? url.pathname.replace(/^\/api\/?/, '')).replace(/\/$/, '');
  url.searchParams.delete('__path');
  const query = Object.fromEntries(url.searchParams);
  try {
    const candidates = routes.filter((r) => r.re.test(path));
    if (!candidates.length) throw new HttpError(404, 'route_not_found');
    const route = candidates.find((r) => r.method === req.method);
    if (!route) throw new HttpError(405, 'method_not_allowed');
    // 状態を変える API は JSON のみ受け付ける（クロスサイトのフォーム送信対策）
    if (req.method !== 'GET' && !String(req.headers['content-type'] || '').includes('application/json')) {
      throw new HttpError(415, 'json_required');
    }
    const m = path.match(route.re);
    const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const body = await readBody(req);
    const user = await currentUser(req);
    const data = await route.handler({ req, res, params, query, body, user });
    send(res, 200, data);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.code, detail: e.message !== e.code ? e.message : undefined });
    console.error(e);
    send(res, 500, { error: 'server_error' });
  }
}
