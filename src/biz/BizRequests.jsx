import { useEffect, useState } from 'react';
import { api, useGuard } from '../lib.js';
import { JA, jaDate, jaDateTime, jaList } from './labels.js';
import { BizError } from './BizApp.jsx';
import { TextArea } from '../components/ui.jsx';

// 日本語の構造化された予約カード（13章）
export default function BizRequests({ onChange }) {
  const [scope, setScope] = useState('pending');
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const load = () =>
    api('biz/reservations', { query: { scope } })
      .then((d) => setList(d.reservations))
      .catch(setError);
  useEffect(() => {
    setList(null);
    load();
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const replace = (r) => {
    setList((l) => l.map((x) => (x.id === r.id ? r : x)));
    onChange?.();
  };

  return (
    <div className="stack">
      <div className="segmented">
        {[
          ['pending', '承認待ち'],
          ['upcoming', '確定した予約'],
          ['all', 'すべて'],
        ].map(([k, label]) => (
          <button key={k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>
            {label}
          </button>
        ))}
      </div>
      <BizError error={error} />
      {list && !list.length && <p className="muted">該当する予約はありません。</p>}
      {!list && !error && <p className="muted">読み込み中…</p>}
      <div className="res-grid">
        {list?.map((r) => (
          <ReservationCard key={r.id} r={r} onUpdate={replace} />
        ))}
      </div>
    </div>
  );
}

function ReservationCard({ r, onUpdate }) {
  const [mode, setMode] = useState(null); // 'ask' | 'decline' | 'cancel'
  const [text, setText] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [, guard] = useGuard();

  const act = guard(async (action, body) => {
    setBusy(true);
    setError(null);
    try {
      const d = await api(`biz/reservations/${r.id}/${action}`, { method: 'POST', body });
      onUpdate(d.reservation);
      setMode(null);
      setText('');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  });

  const conditions = [...r.conditionsAgreed.filter((c) => c !== 'OTHER').map((c) => JA.cond[c]), r.conditionNoteAgreed].filter(Boolean);

  return (
    <article className={'card res-card ' + r.status}>
      <header className="res-card-head">
        <h2>{r.status === 'PENDING' ? '新しい予約リクエスト' : JA.status[r.status]}</h2>
        <span className={'status ' + r.status}>{JA.status[r.status]}</span>
      </header>
      <dl className="kv big">
        <dt>希望日</dt>
        <dd>{jaDate(r.date)}</dd>
        <dt>希望時間</dt>
        <dd>{r.time}</dd>
        <dt>人数</dt>
        <dd>{r.partySize}名</dd>
        <dt>食事制限</dt>
        <dd>{jaList(JA.diet, r.dietary)}</dd>
        <dt>アレルギー</dt>
        <dd className={r.allergies.length ? 'alert' : ''}>{jaList(JA.allergen, r.allergies)}</dd>
        <dt>予約条件</dt>
        <dd>{conditions.length ? conditions.join('、') + '（お客様は同意済み）' : 'なし'}</dd>
        <dt>お客様</dt>
        <dd>
          {r.guestLabel}（{JA.guestLang[r.guestLang] || r.guestLang}）
        </dd>
        <dt>メッセージ</dt>
        <dd>
          {r.message ? (
            <>
              「{r.messageJa || r.message}」
              {!r.messageJa && <div className="fine">※ 自動翻訳を利用できないため原文を表示しています</div>}
              {r.messageJa && (
                <button className="link small" onClick={() => setShowOriginal((s) => !s)}>
                  {showOriginal ? '原文を隠す' : '原文を見る'}
                </button>
              )}
              {showOriginal && <p className="original">{r.message}</p>}
            </>
          ) : (
            'なし'
          )}
        </dd>
        <dt>返信期限</dt>
        <dd>{jaDateTime(r.respondBy)}</dd>
        <dt>キャンセル規定</dt>
        <dd>
          {JA.policy[r.policy.code]}（第{r.policy.version}版に同意済み）
        </dd>
      </dl>

      {r.messages.length > 0 && (
        <ul className="messages">
          {r.messages.map((m) => (
            <li key={m.id} className={m.sender === 'SHOP' ? 'mine' : 'theirs'}>
              <p>{m.text}</p>
              {m.original && <p className="original fine">原文：{m.original}</p>}
              <span className="fine">{jaDateTime(m.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}

      {r.status === 'PENDING' && !mode && (
        <div className="actions">
          <button className="btn primary big" disabled={busy} onClick={() => act('approve')}>
            承認する
          </button>
          <button className="btn big" disabled={busy} onClick={() => setMode('decline')}>
            お断りする
          </button>
          <button className="btn big" disabled={busy} onClick={() => setMode('ask')}>
            質問・確認する
          </button>
        </div>
      )}
      {r.status === 'CONFIRMED' && !mode && (
        <div className="actions">
          <button className="btn" onClick={() => setMode('ask')}>
            メッセージを送る
          </button>
          <button className="btn danger-outline" onClick={() => setMode('cancel')}>
            店舗都合でキャンセルする
          </button>
        </div>
      )}
      {mode && (
        <div className="stack">
          <TextArea
            value={text}
            onChange={setText}
            onCtrlEnter={() => (mode !== 'ask' || text.trim()) && act(mode === 'ask' ? 'messages' : mode, { message: text || undefined })}
            placeholder={mode === 'ask' ? '日本語で入力してください（Ctrl＋Enter で送信）' : 'お客様へのひとこと（任意・日本語）'}
          />
          {mode === 'ask' && <p className="fine">質問・確認を送っても、予約は確定しません。</p>}
          <div className="row">
            <button
              className={'btn ' + (mode === 'ask' ? 'primary' : 'danger')}
              disabled={busy || (mode === 'ask' && !text.trim())}
              onClick={() => act(mode === 'ask' ? 'messages' : mode, { message: text || undefined })}
            >
              {mode === 'ask' ? '送信する' : mode === 'decline' ? 'お断りを確定する' : 'キャンセルを確定する'}
            </button>
            <button className="btn" onClick={() => setMode(null)}>
              戻る
            </button>
          </div>
        </div>
      )}
      <BizError error={error} />
    </article>
  );
}
