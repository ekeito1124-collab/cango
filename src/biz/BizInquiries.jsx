import { useEffect, useState } from 'react';
import { api, useGuard } from '../lib.js';
import { JA, jaDateTime } from './labels.js';
import { TextArea } from '../components/ui.jsx';
import { BizError } from './BizApp.jsx';

// 予約前の問い合わせ。旅行者のメッセージは日本語に翻訳して表示し、返信は旅行者の言語に翻訳して送る
export default function BizInquiries() {
  const [threads, setThreads] = useState(null);
  const [error, setError] = useState(null);
  const load = () => api('biz/inquiries').then((d) => setThreads(d.threads)).catch(setError);
  useEffect(() => {
    load();
  }, []);
  if (!threads) return <BizError error={error} />;
  if (!threads.length) return <p className="muted">お問い合わせはまだありません。</p>;
  return (
    <div className="stack">
      {threads.map((th) => (
        <Thread key={th.userId} th={th} onSent={load} />
      ))}
      <BizError error={error} />
    </div>
  );
}

function Thread({ th, onSent }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [busy, guard] = useGuard();
  const send = guard(async (e) => {
    e.preventDefault();
    try {
      await api('biz/inquiries/' + th.userId, { method: 'POST', body: { message: text } });
      setText('');
      onSent();
    } catch (err) {
      setError(err);
    }
  });
  return (
    <section className="card">
      <h2>
        {th.guestLabel}（{JA.guestLang[th.guestLang] || th.guestLang}）
      </h2>
      <ul className="messages">
        {th.messages.map((m) => (
          <li key={m.id} className={m.sender === 'SHOP' ? 'mine' : 'theirs'}>
            <p>{m.text}</p>
            {m.translationMissing && <p className="fine">※ 自動翻訳を利用できないため原文を表示しています</p>}
            {m.original && !m.translationMissing && <p className="original fine">原文：{m.original}</p>}
            <span className="fine">{jaDateTime(m.createdAt)}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={send} className="stack">
        <TextArea rows={2} value={text} onChange={setText} placeholder="日本語で返信してください。お客様の言語に翻訳して送ります。" />
        <button className="btn primary" disabled={busy || !text.trim()}>
          {busy ? '送信中…' : '返信する'}
        </button>
      </form>
      <BizError error={error} />
    </section>
  );
}
