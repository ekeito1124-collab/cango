import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` だけで API も動くよう、/api/* を server/router.js に渡す開発用ミドルウェア。
// 本番（Vercel）では api/router.js が同じハンドラを使う。
function localApi() {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next();
        try {
          const { handle } = await server.ssrLoadModule('/server/router.js');
          await handle(req, res);
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApi()],
  // Windows のフォルダをマウントした Dev Container ではファイル変更通知が届かないため、ポーリングで監視する
  server: { watch: { usePolling: true, interval: 300 } },
});
