// すべての /api/* リクエストをこの 1 つの Vercel Function で処理する
// （Hobby プランの Function 数上限に収めるため。ルーティングは vercel.json の rewrites）
import { handle } from '../server/router.js';

export default handle;
