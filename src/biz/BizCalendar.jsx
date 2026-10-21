import { useEffect, useMemo, useRef, useState } from 'react';
import { api, useGuard } from '../lib.js';
import { Chips } from '../components/ui.jsx';
import { JA, jaDate, jaDateTime } from './labels.js';
import { BizError } from './BizApp.jsx';
import { CONDITIONS, addDays, todayJst, weekdayOf } from '../../shared/constants.js';

// 〇△✕の設定（14-2）。スマートフォンで日付をタップして選び、まとめて設定する
export default function BizCalendar({ shop, onChange }) {
  const today = todayJst();
  const [rows, setRows] = useState(null);
  const [selected, setSelected] = useState([]);
  const [status, setStatus] = useState('OK');
  const [conditions, setConditions] = useState([]);
  const [note, setNote] = useState('');
  const [busySeason, setBusySeason] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const lastPicked = useRef(null);
  const [busy, guard] = useGuard();

  const load = () => api('biz/availability', { query: { from: today, to: addDays(today, 41) } }).then((d) => setRows(d.availability));
  useEffect(() => {
    load().catch(setError);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const byDate = useMemo(() => new Map((rows || []).map((r) => [r.date, r])), [rows]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(today, i)), [today]);
  const lead = weekdayOf(today);

  if (shop?.reservationMethod === 'NONE') return <p className="card">予約を受けない設定のため、空き状況の登録は不要です。</p>;

  // クリックで1日ずつ選択。Shift を押しながらクリックすると、前回選んだ日からの範囲をまとめて選ぶ（PC 向け）
  const toggle = (d, shift) => {
    if (shift && lastPicked.current) {
      const [a, b] = [lastPicked.current, d].sort();
      const range = days.filter((x) => x >= a && x <= b);
      setSelected((cur) => [...new Set([...cur, ...range])]);
    } else {
      setSelected((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
    }
    lastPicked.current = d;
  };
  const pick = (from, to, skipClosed = false) =>
    setSelected(days.slice(from, to).filter((d) => !(skipClosed && shop?.closedDays?.includes(weekdayOf(d)))));
  const save = guard(async () => {
    setError(null);
    try {
      await api('biz/availability', {
        method: 'PUT',
        body: {
          dates: selected,
          status,
          conditions: status === 'LIMITED' ? conditions : status === 'FULL' && busySeason ? ['BUSY_SEASON'] : [],
          conditionNote: status === 'LIMITED' && conditions.includes('OTHER') ? note : undefined,
        },
      });
      setSelected([]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await load();
      onChange?.();
    } catch (e) {
      setError(e);
    }
  });
  const clear = guard(async () => {
    for (const d of selected) await api('biz/availability/' + d, { method: 'DELETE' });
    setSelected([]);
    await load();
  });

  return (
    <div className="stack">
      <p className="muted">日付を選び（複数可）、〇△✕を設定してください。設定しない限り自動で〇にはなりません。PC では Shift を押しながらクリックすると期間をまとめて選べます。</p>
      <div className="cal-layout">
        <div>
          <div className="row wrap quick-pick">
            <button className="btn small" onClick={() => pick(0, 7)}>
              今日から1週間
            </button>
            <button className="btn small" onClick={() => pick(7, 14)}>
              翌週
            </button>
            <button className="btn small" onClick={() => pick(0, 14, true)}>
              2週間（定休日を除く）
            </button>
            {selected.length > 0 && (
              <button className="btn small" onClick={() => setSelected([])}>
                選択を解除
              </button>
            )}
          </div>
          <div className="cal">
            {JA.wd.map((w, i) => (
              <div key={w} className={'cal-wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>
                {w}
              </div>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <div key={'pad' + i} />
            ))}
            {days.map((d) => {
              const r = byDate.get(d);
              const closed = shop?.closedDays?.includes(weekdayOf(d));
              const label = `${jaDate(d)} ${r ? JA.avail[r.status] : '未設定'}${closed ? '（定休日）' : ''}`;
              return (
                <button
                  key={d}
                  className={'cal-day ' + (r ? r.status : 'none') + (selected.includes(d) ? ' sel' : '') + (closed ? ' closed' : '') + (d === today ? ' today' : '')}
                  onClick={(e) => toggle(d, e.shiftKey)}
                  aria-pressed={selected.includes(d)}
                  aria-label={label}
                  title={label}
                >
                  <span className="d">{Number(d.slice(8)) === 1 || d === today ? `${Number(d.slice(5, 7))}/${Number(d.slice(8))}` : Number(d.slice(8))}</span>
                  <span className="s">{r ? JA.sym[r.status] : '－'}</span>
                  {r?.status === 'LIMITED' && <span className="c">{r.conditions.filter((c) => c !== 'OTHER').map((c) => JA.cond[c]).join('・') || r.conditionNote}</span>}
                </button>
              );
            })}
          </div>
          <p className="fine">－ は未設定（旅行者には「空き情報なし」と表示されます）。グレーの日は定休日です。</p>
        </div>

        <section className="card stack cal-panel">
          {selected.length === 0 ? (
            <>
              <h3>日付を選んでください</h3>
              <p className="fine">左のカレンダーで日付を選ぶと、ここで〇△✕と受け入れ条件を設定できます。</p>
            </>
          ) : (
            <>
              <h3>選んだ日（{selected.length}日）</h3>
              <p className="fine">{[...selected].sort().map(jaDate).join('、')}</p>
              <Chips multi={false} options={['OK', 'LIMITED', 'FULL']} value={status} onChange={(v) => v && setStatus(v)} label={(c) => JA.avail[c]} />
              {status === 'LIMITED' && (
                <>
                  <p className="fine">受け入れ条件（旅行者の言語に翻訳して表示し、同意した人だけがリクエストできます）</p>
                  <Chips options={CONDITIONS} value={conditions} onChange={setConditions} label={(c) => JA.cond[c]} />
                  {conditions.includes('OTHER') && <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="例：午前のみ受け入れ可能" />}
                </>
              )}
              {status === 'FULL' && (
                <label className="check">
                  <input type="checkbox" checked={busySeason} onChange={(e) => setBusySeason(e.target.checked)} /> 繁忙期のため受け入れ不可と表示する
                </label>
              )}
              <p className="fine">
                承認期限：各日の最初の予約枠の {shop?.requestDeadlineHours ?? 24} 時間前（「店舗情報」で変更できます）。期限を過ぎた日には新しいリクエストが届きません。
              </p>
              <div className="row wrap">
                <button className="btn primary big" onClick={save} disabled={busy}>
                  {busy ? '保存中…' : 'この内容で設定する'}
                </button>
                <button className="btn" onClick={clear} disabled={busy}>
                  設定を消す
                </button>
              </div>
            </>
          )}
          {saved && <p className="saved-note">保存しました</p>}
          <BizError error={error} />
        </section>
      </div>

      {rows && rows.length > 0 && (
        <details>
          <summary>設定済みの日の一覧</summary>
          <ul className="plain">
            {rows.map((r) => (
              <li key={r.id}>
                {jaDate(r.date)} {JA.sym[r.status]} {r.conditions.map((c) => JA.cond[c]).join('、')} {r.conditionNote && `（${r.conditionNote}）`}
                <span className="fine"> 更新 {jaDateTime(r.updatedAt)}・承認期限 {jaDateTime(r.approvalDeadline)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
