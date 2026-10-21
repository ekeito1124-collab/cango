// メール送信。RESEND_API_KEY と MAIL_FROM がある場合のみ実送信し、
// ない場合は送信内容をサーバーログに出力する（MVP・ローカル開発用）
export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail({ to, subject, text }) {
  if (!mailConfigured()) {
    console.log(`[mail:not-sent] to=${to} subject=${subject}\n${text}`);
    return { sent: false };
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to, subject, text }),
  });
  if (!r.ok) {
    console.error('[mail:error]', r.status, await r.text().catch(() => ''));
    return { sent: false };
  }
  return { sent: true };
}

export function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${host}`;
}
