import { useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api, useGuard } from '../lib.js';
import { Chips } from '../components/ui.jsx';
import { JA } from './labels.js';
import { BizError } from './BizApp.jsx';
import {
  ALLERGENS,
  CATEGORIES,
  CLIENTELE,
  DAILY_PROFILE_FIELDS,
  DIETARY,
  OWNER_DISTANCE,
  REGULARS,
  RELIGIOUS,
  SCENES,
  SHOP_LANGS,
} from '../../shared/constants.js';

function LocationPicker({ lat, lng, onPick }) {
  function Clicks() {
    useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
    return null;
  }
  return (
    <div className="map-wrap" style={{ height: 220 }}>
      <MapContainer center={[lat || 34.8892, lng || 135.8077]} zoom={15} style={{ height: '100%' }}>
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Clicks />
        {lat && <CircleMarker center={[lat, lng]} radius={10} pathOptions={{ color: '#fff', fillColor: '#c0392b', fillOpacity: 1 }} />}
      </MapContainer>
    </div>
  );
}

const WD = [0, 1, 2, 3, 4, 5, 6];
const triState = (v) => (v === true ? 'yes' : v === false ? 'no' : '');

export function ShopForm({ initial, onSubmit, submitLabel, signup = false, busy = false }) {
  const [f, setF] = useState(
    () =>
      initial || {
        name: '',
        nameRomaji: '',
        category: 'shokudo',
        area: '',
        address: '',
        lat: null,
        lng: null,
        description: '',
        hoursText: '',
        openTime: '10:00',
        closeTime: '18:00',
        closedDays: [],
        priceMin: 1000,
        priceMax: 3000,
        reservationMethod: 'APP',
      },
  );
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const field = (key, label, props = {}) => (
    <label>
      {label}
      <input value={f[key] ?? ''} onChange={(e) => set({ [key]: props.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value })} {...props} />
    </label>
  );
  const submit = (e) => {
    e.preventDefault();
    const body = { ...f };
    if (!signup) {
      body.timeSlots = String(f.timeSlotsText ?? (f.timeSlots || []).join(', '))
        .split(/[,、\s]+/)
        .filter(Boolean);
      body.appealPoints = String(f.appealText ?? (f.appealPoints || []).join('\n'))
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      body.photos = String(f.photosText ?? (f.photos || []).join('\n'))
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    for (const k of ['timeSlotsText', 'appealText', 'photosText', 'id', 'slug', 'dishes', 'createdAt', 'updatedAt', 'ownerId', 'published', 'isDemo', 'rating', 'ratingCount', 'ratingSource', 'halalCertified', 'halalCertifier', 'ownerWordsStatus', 'dailyProfileStatus'])
      delete body[k];
    onSubmit(body);
  };

  return (
    <form className="stack shop-form" onSubmit={submit}>
      <section className="card stack">
        <h2>基本情報</h2>
        {field('name', '店舗名（日本語）', { required: true, maxLength: 100 })}
        {field('nameRomaji', '店舗名のローマ字表記（例：Maruyoshi Shokudo）', { maxLength: 100 })}
        <label>
          カテゴリ
          <select value={f.category} onChange={(e) => set({ category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {JA.cat[c]}
              </option>
            ))}
          </select>
        </label>
        {field('area', '地域（例：宇治）', { maxLength: 50 })}
        {field('address', '住所', { required: true, maxLength: 200 })}
        <p className="fine">地図をタップしてお店の位置を選んでください。</p>
        <LocationPicker lat={f.lat} lng={f.lng} onPick={(lat, lng) => set({ lat, lng })} />
        <label>
          お店の紹介（日本語。旅行者の言語に自動翻訳されます）
          <textarea rows={4} value={f.description} onChange={(e) => set({ description: e.target.value })} required maxLength={1000} />
        </label>
        {!signup && (
          <label>
            写真のURL（1行に1つ。https:// で始まるもの）
            <textarea rows={2} value={f.photosText ?? (f.photos || []).join('\n')} onChange={(e) => set({ photosText: e.target.value })} />
          </label>
        )}
      </section>

      <section className="card stack">
        <h2>営業時間・料金・予約方法</h2>
        {field('hoursText', '営業時間の表示（例：11:00〜20:00（月曜定休））', { required: true, maxLength: 200 })}
        <div className="row">
          {field('openTime', '開店', { type: 'time', required: true })}
          {field('closeTime', '閉店', { type: 'time', required: true })}
        </div>
        <span>定休日</span>
        <Chips options={WD} value={f.closedDays} onChange={(v) => set({ closedDays: v })} label={(d) => JA.wd[d]} />
        <div className="row">
          {field('priceMin', '料金の目安（下限・円）', { type: 'number', min: 0, required: true })}
          {field('priceMax', '料金の目安（上限・円）', { type: 'number', min: 0, required: true })}
        </div>
        {!signup && field('priceNote', '料金の補足（例：お通し代300円）', { maxLength: 200 })}
        <span>予約の受け方</span>
        <Chips multi={false} options={['APP', 'EMAIL', 'NONE']} value={f.reservationMethod} onChange={(v) => v && set({ reservationMethod: v })} label={(c) => JA.method[c]} />
        {!signup && f.reservationMethod !== 'NONE' && (
          <>
            <label>
              予約枠の時刻（カンマ区切り。例：11:30, 13:00, 17:30）
              <input value={f.timeSlotsText ?? (f.timeSlots || []).join(', ')} onChange={(e) => set({ timeSlotsText: e.target.value })} />
            </label>
            {field('maxPartySize', '1組の最大人数', { type: 'number', min: 1, max: 20 })}
            {field('requestDeadlineHours', '承認期限（予約枠の何時間前までにリクエストを締め切るか）', { type: 'number', min: 0, max: 336 })}
            <span>キャンセル規定</span>
            <Chips multi={false} options={['STANDARD', 'STRICT']} value={f.cancelPolicyCode} onChange={(v) => v && set({ cancelPolicyCode: v })} label={(c) => JA.policy[c]} />
            <p className="fine">料率は正式決定前の仮の値です。</p>
            <span>対応できる言語</span>
            <Chips options={SHOP_LANGS} value={f.languages || []} onChange={(v) => set({ languages: v })} label={(c) => JA.shopLang[c]} />
          </>
        )}
      </section>

      {!signup && (
        <>
          <section className="card stack">
            <h2>お店の目安情報（自己申告）</h2>
            <p className="fine">旅行者がお店を選ぶ手がかりとして、そのまま表示します。アプリが「地元度」を判定することはありません。</p>
            <span>客層</span>
            <Chips multi={false} options={CLIENTELE} value={f.clientele} onChange={(v) => set({ clientele: v })} label={(c) => JA.clientele[c]} />
            <span>常連客</span>
            <Chips multi={false} options={REGULARS} value={f.regulars} onChange={(v) => set({ regulars: v })} label={(c) => JA.regulars[c]} />
            <span>店主・作り手との距離</span>
            <Chips multi={false} options={OWNER_DISTANCE} value={f.ownerDistance} onChange={(v) => set({ ownerDistance: v })} label={(c) => JA.ownerDistance[c]} />
            {field('foundedYear', '創業年（西暦）', { type: 'number', min: 1000, max: 2100 })}
            <span>ガイドブックへの掲載</span>
            <Chips multi={false} options={['yes', 'no']} value={triState(f.guidebookListed)} onChange={(v) => set({ guidebookListed: v === 'yes' ? true : v === 'no' ? false : null })} label={(c) => (c === 'yes' ? 'あり' : 'なし')} />
            <span>ツアー会社への掲載</span>
            <Chips multi={false} options={['yes', 'no']} value={triState(f.tourListed)} onChange={(v) => set({ tourListed: v === 'yes' ? true : v === 'no' ? false : null })} label={(c) => (c === 'yes' ? 'あり' : 'なし')} />
            <label className="check">
              <input type="checkbox" checked={Boolean(f.soloWelcome)} onChange={(e) => set({ soloWelcome: e.target.checked })} /> 一人客歓迎
            </label>
          </section>

          <section className="card stack">
            <h2>食事に関する情報</h2>
            <p className="fine">
              ハラル認証は認証を受けた店舗のみ表示します（運営が確認して設定します）。現在：{f.halalCertified ? `認証あり ${f.halalCertifier || ''}` : '認証なし'}
            </p>
            <span>対応している食事制限（自己申告）</span>
            <Chips options={[...DIETARY, ...RELIGIOUS.filter((r) => r !== 'halal')]} value={f.dietaryOptions || []} onChange={(v) => set({ dietaryOptions: v })} label={(c) => JA.diet[c]} />
            <span>お店全体で使っていないアレルギー物質</span>
            <Chips options={ALLERGENS} value={f.allergenFreeShopwide || []} onChange={(v) => set({ allergenFreeShopwide: v })} label={(c) => JA.allergen[c]} />
            <span>材料の調整</span>
            <Chips options={['less', 'remove']} value={f.ingredientAdjust || []} onChange={(v) => set({ ingredientAdjust: v })} label={(c) => JA.adjust[c]} />
            <label>
              アピールポイント（1行に1つ。例：豚肉を使っていません。）
              <textarea rows={2} value={f.appealText ?? (f.appealPoints || []).join('\n')} onChange={(e) => set({ appealText: e.target.value })} />
            </label>
            <p className="fine">アレルギー情報は正確に申告・更新してください。料理ごとの情報は下の「料理とアレルギー」で登録します。</p>
          </section>

          <section className="card stack">
            <h2>普段のお店の様子</h2>
            <label className="check">
              <input type="checkbox" checked={Boolean(f.normalBusiness)} onChange={(e) => set({ normalBusiness: e.target.checked })} /> 通常営業のまま受け入れる（「いつもの一席」として紹介）
            </label>
            <span>当てはまる日常シーン</span>
            <Chips options={SCENES.filter((s) => s !== 'today')} value={f.dailyScenes || []} onChange={(v) => set({ dailyScenes: v })} label={(c) => JA.scene[c]} />
            <label>
              実際に対応できる特別な案内・交流（任意。対応できる場合のみ）
              <input value={f.specialOffer || ''} onChange={(e) => set({ specialOffer: e.target.value })} maxLength={300} placeholder="例：店主が茶畑を案内します（30分程度）。" />
            </label>
          </section>

          <section className="card stack">
            <h2>店主のことば</h2>
            <p className="fine">ご自身の言葉で短く書いてください。運営の確認後に翻訳して掲載します。状態：{JA.review[f.ownerWordsStatus]}</p>
            <textarea rows={2} maxLength={300} value={f.ownerWords || ''} onChange={(e) => set({ ownerWords: e.target.value })} placeholder="例：うちは近所の方が仕事帰りによく来るお店です。" />
            <h2>日常プロフィール（すべて任意）</h2>
            <p className="fine">状態：{JA.review[f.dailyProfileStatus]}</p>
            {DAILY_PROFILE_FIELDS.map((k) => (
              <label key={k}>
                {JA.profile[k]}
                <textarea rows={2} maxLength={400} value={f.dailyProfile?.[k] || ''} onChange={(e) => set({ dailyProfile: { ...(f.dailyProfile || {}), [k]: e.target.value } })} />
              </label>
            ))}
          </section>
        </>
      )}
      <button className="btn primary big" disabled={busy}>
        {busy ? '保存中…' : submitLabel}
      </button>
      {busy && <p className="card soft">保存と、旅行者向けの5言語への翻訳をしています。10〜20秒ほどかかることがあります。この画面のままお待ちください。</p>}
    </form>
  );
}

function DishesEditor({ initial }) {
  const [dishes, setDishes] = useState(initial.map((d) => ({ ...d })));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [busy, guard] = useGuard();
  const update = (i, patch) => setDishes((l) => l.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const save = guard(async () => {
    setError(null);
    try {
      const d = await api('biz/dishes', { method: 'PUT', body: { dishes: dishes.filter((x) => x.name?.trim()) } });
      setDishes(d.dishes);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e);
    }
  });
  return (
    <section className="card stack">
      <h2>料理とアレルギー</h2>
      <p className="fine">料理ごとに使っているアレルギー物質を選んでください。旅行者の絞り込みに使います。</p>
      {dishes.map((d, i) => (
        <div key={i} className="dish-edit stack">
          <div className="row">
            <input value={d.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="料理名" maxLength={100} />
            <input type="number" value={d.price ?? ''} onChange={(e) => update(i, { price: e.target.value === '' ? null : Number(e.target.value) })} placeholder="価格（円）" />
          </div>
          <span className="fine">使っているアレルギー物質</span>
          <Chips options={ALLERGENS} value={d.allergens} onChange={(v) => update(i, { allergens: v })} label={(c) => JA.allergen[c]} />
          <span className="fine">対応する食事制限</span>
          <Chips options={[...DIETARY, ...RELIGIOUS.filter((r) => r !== 'halal')]} value={d.dietary} onChange={(v) => update(i, { dietary: v })} label={(c) => JA.diet[c]} />
          <Chips options={['less', 'remove']} value={d.adjustable} onChange={(v) => update(i, { adjustable: v })} label={(c) => JA.adjust[c]} />
          <button className="link" onClick={() => setDishes((l) => l.filter((_, j) => j !== i))}>
            この料理を削除
          </button>
        </div>
      ))}
      <button className="btn" onClick={() => setDishes((l) => [...l, { name: '', price: null, allergens: [], dietary: [], adjustable: [] }])}>
        料理を追加
      </button>
      <button className="btn primary" onClick={save} disabled={busy}>
        {busy ? '保存中…' : saved ? '保存しました' : '料理を保存する'}
      </button>
      <BizError error={error} />
    </section>
  );
}

export default function BizShop({ shop, onSaved }) {
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, guard] = useGuard();
  const submit = guard(async (body) => {
    setError(null);
    try {
      await api('biz/shop', { method: 'PUT', body });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved?.();
    } catch (e) {
      setError(e);
    }
  });
  return (
    <div className="stack">
      <p className="muted">新しい商品や専用の体験を登録する必要はありません。普段の営業で受け入れられる範囲を登録してください。</p>
      <ShopForm key={shop.updatedAt} initial={shop} onSubmit={submit} busy={busy} submitLabel={saved ? '保存しました' : '店舗情報を保存する'} />
      <BizError error={error} />
      {shop.reservationMethod !== 'NONE' && <DishesEditor initial={shop.dishes} />}
    </div>
  );
}
