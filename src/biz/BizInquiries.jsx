import { useEffect, useState } from 'react';
import { api, useGuard } from '../lib.js';
import { JA, jaDateTime } from './labels.js';
import { TextArea } from '../components/ui.jsx';
import { BizError } from './BizApp.jsx';

// 予約前の問い合わせ。旅行者のメッセージは日本語に翻訳して表示し、返信は旅行者の言語に翻訳して送る
export default function BizInquiries() {
  const [threads, setThreads] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const load = () => api('biz/inquiries').then((d) => setThreads(d.threads)).catch(setError);
  useEffect(() => {
    load();
  }, []);
  if (!threads) return error ? <BizError error={error} /> : <p className="muted">読み込み中…</p>;
  if (!threads.length) return <p className="muted">お問い合わせはまだありません。</p>;
  const current = threads.find((th) => th.userId === selected) || threads[0];
  return (
    // PC では左にお客様の一覧、右にやり取りを並べる
    <div className="inbox">
      <ul className="inbox-list" aria-label="お問い合わせの一覧">
        {threads.map((th) => {
          const last = th.messages[th.messages.length - 1];
          const waiting = last?.sender === 'TRAVELER';
          return (
            <li key={th.userId}>
              <button className={'inbox-item' + (th.userId === current.userId ? ' on' : '')} onClick={() => setSelected(th.userId)} aria-current={th.userId === current.userId}>
                <span className="inbox-head">
                  <strong>{th.guestLabel}</strong>
                  {waiting && <span className="status PENDING">返信待ち</span>}
                </span>
                <span className="inbox-preview">{last?.text}</span>
                <span className="fine">
                  {JA.guestLang[th.guestLang] || th.guestLang}・{jaDateTime(last?.createdAt)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Thread key={current.userId} th={current} onSent={load} />
      <BizError error={error} />
    </div>
  );
}

function Thread({ th, onSent }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [busy, guard] = useGuard();
  const send = guard(async () => {
    try {
      await api('biz/inquiries/' + th.userId, { method: 'POST', body: { message: text } });
      setText('');
      onSent();
    } catch (err) {
      setError(err);
    }
  });
  return (
    <section className="card inbox-thread">
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
        <TextArea rows={3} value={text} onChange={setText} onCtrlEnter={() => text.trim() && send()} placeholder="日本語で返信してください（Ctrl＋Enter で送信）" />
        <button className="btn primary" disabled={busy || !text.trim()}>
          {busy ? '送信中…' : '返信する'}
        </button>
      </form>
      <BizError error={error} />
    </section>
  );
}
