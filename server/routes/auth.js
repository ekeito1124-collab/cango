import { prisma } from '../db.js';
import { bad, conflict, HttpError, str } from '../http.js';
import {
  clearSession,
  hashPassword,
  hashToken,
  newToken,
  publicUser,
  requireUser,
  setSession,
  validateEmail,
  validatePassword,
  verifyPassword,
} from '../auth.js';
import { appUrl, mailConfigured, sendMail } from '../mail.js';
import { CURRENCIES, LANGS } from '../../shared/constants.js';

export default [
  ['GET', 'auth/me', async ({ user }) => ({ user: publicUser(user) })],

  [
    'POST',
    'auth/register',
    async ({ body, res }) => {
      const email = validateEmail(body.email);
      validatePassword(body.password);
      const lang = LANGS.includes(body.lang) ? body.lang : 'en';
      const currency = CURRENCIES.includes(body.currency) ? body.currency : 'JPY';
      if (await prisma.user.findUnique({ where: { email } })) throw conflict('email_taken');
      const user = await prisma.user.create({
        data: { email, passwordHash: await hashPassword(body.password), lang, currency },
      });
      await setSession(res, user);
      return { user: publicUser(user) };
    },
  ],

  [
    'POST',
    'auth/login',
    async ({ body, res }) => {
      const email = validateEmail(body.email);
      const user = await prisma.user.findUnique({ where: { email }, include: { shop: { select: { id: true, slug: true, name: true } } } });
      if (!user || !(await verifyPassword(String(body.password || ''), user.passwordHash))) {
        throw new HttpError(401, 'invalid_credentials');
      }
      await setSession(res, user);
      return { user: publicUser(user) };
    },
  ],

  [
    'POST',
    'auth/logout',
    async ({ res }) => {
      clearSession(res);
      return { ok: true };
    },
  ],

  // パスワード再設定リンクの送信（11-3）。登録有無は応答から分からないようにする
  [
    'POST',
    'auth/forgot',
    async ({ body, req }) => {
      const email = validateEmail(body.email);
      const lang = LANGS.includes(body.lang) ? body.lang : 'en';
      const user = await prisma.user.findUnique({ where: { email } });
      let devResetUrl;
      if (user) {
        const { token, hash } = newToken();
        await prisma.passwordResetToken.create({
          data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + 3600e3) },
        });
        const base = user.role === 'TRAVELER' ? `/${lang}/reset` : '/biz/reset';
        const url = `${appUrl(req)}${base}?token=${token}`;
        await sendMail({
          to: email,
          subject: 'Password reset / パスワード再設定',
          text: `Open this link within 1 hour to set a new password.\n1時間以内に次のリンクから新しいパスワードを設定してください。\n\n${url}`,
        });
        // メール未設定のローカル開発環境だけ、画面にリンクを表示して動作確認できるようにする
        if (!mailConfigured() && process.env.VERCEL_ENV !== 'production') devResetUrl = url;
      }
      return { ok: true, devResetUrl };
    },
  ],

  [
    'POST',
    'auth/reset',
    async ({ body, res }) => {
      const token = str(body.token, { required: true, name: 'token', max: 200 });
      validatePassword(body.password);
      const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!row || row.usedAt || row.expiresAt < new Date()) throw bad('invalid_token');
      const [user] = await prisma.$transaction([
        prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(body.password) } }),
        prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      ]);
      await setSession(res, user);
      return { user: publicUser(user) };
    },
  ],

  // プロフィール（表示言語・通貨）と、ダミーのカード画面の通過記録
  [
    'PATCH',
    'auth/profile',
    async ({ body, user }) => {
      requireUser(user);
      const data = {};
      if (body.lang !== undefined) {
        if (!LANGS.includes(body.lang)) throw bad('invalid_lang');
        data.lang = body.lang;
      }
      if (body.currency !== undefined) {
        if (!CURRENCIES.includes(body.currency)) throw bad('invalid_currency');
        data.currency = body.currency;
      }
      // カード番号などは受け取らない。デモ画面を通過した事実だけを記録する
      if (body.cardDemoCompleted === true) data.cardDemoCompleted = true;
      const updated = await prisma.user.update({
        where: { id: user.id },
        data,
        include: { shop: { select: { id: true, slug: true, name: true } } },
      });
      return { user: publicUser(updated) };
    },
  ],
];
