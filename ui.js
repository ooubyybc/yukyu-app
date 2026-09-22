/* =========================================================================
   有給管理 - UI
   ========================================================================= */
'use strict';

const KEY = 'yukyu-app-v1';
const KEY_UI = 'yukyu-app-ui';

/* ---------- 状態 ---------- */
let DATA = null;
let CUR = null;   // 従業員ID
let TAB = 'home';
let LEAVE_DAYS = 1;    // 追加フォームの日数
let LEAVE_DATE = null; // 追加フォームの取得日 (yyyy-mm-dd)
let SORT = 'urgent';   // 一覧の並び順
let LEAVE_MODE = 'single'; // 記録タブ: 'single'=1日ずつ / 'bulk'=月ごとにまとめて

/* ---------- 保存 / 読み込み ---------- */
function loadData() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.employees)) return d;
    }
  } catch (e) { /* 非対応環境 */ }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}
function saveData() {
  try { localStorage.setItem(KEY, JSON.stringify(DATA)); }
  catch (e) { toast('この環境では保存できません'); }
}
function loadUI() {
  try { return JSON.parse(localStorage.getItem(KEY_UI) || '{}') || {}; }
  catch (e) { return {}; }
}
function saveUI(o) {
  try { localStorage.setItem(KEY_UI, JSON.stringify(o)); } catch (e) {}
}

/* ---------- 小物 ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtD = (v) => (Number.isInteger(v) ? String(v) : Number(v).toFixed(1));
const uid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
}

function currentEmp() {
  return DATA.employees.find((e) => e.id === CUR) || DATA.employees[0] || null;
}
function tenure(hire, asOf) {
  let m = (asOf.getFullYear() - hire.getFullYear()) * 12 + (asOf.getMonth() - hire.getMonth());
  if (asOf.getDate() < hire.getDate()) m--;
  if (m < 0) m = 0;
  return { y: Math.floor(m / 12), m: m % 12 };
}
function tenureText(hire, asOf) {
  const t = tenure(hire, asOf);
  return t.y ? `勤続${t.y}年${t.m}ヶ月` : `勤続${t.m}ヶ月`;
}

const ICON = {
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 2.5 17.3a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.2 12.2 2.6 2.6 5-5.2"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v8.5H4V12M2.5 8h19v4h-19zM12 8v12.5"/><path d="M12 8S10.6 3.5 8.3 3.5a2.3 2.3 0 0 0 0 4.5ZM12 8s1.4-4.5 3.7-4.5a2.3 2.3 0 0 1 0 4.5Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5h16M9 6.5V4.2h6v2.3M6.5 6.5 7.4 20h9.2l.9-13.5"/><path d="M10.2 10.5v6M13.8 10.5v6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2.8H6.6A1.6 1.6 0 0 0 5 4.4v15.2a1.6 1.6 0 0 0 1.6 1.6h10.8a1.6 1.6 0 0 0 1.6-1.6V7.8Z"/><path d="M14 2.8v5h5M8.6 12.6h6.8M8.6 16.2h4.8"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9V3.5h10V9"/><path d="M7 18H5.2A2.2 2.2 0 0 1 3 15.8v-4.6A2.2 2.2 0 0 1 5.2 9h13.6A2.2 2.2 0 0 1 21 11.2v4.6a2.2 2.2 0 0 1-2.2 2.2H17"/><path d="M7 14.5h10v6H7z"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v12M7.5 11.5 12 16l4.5-4.5M4 19.5h16"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};




/* =========================================================================
   月まとめ記録のヘルパー
   「2022年10月に3日取った」のように、日付まで覚えていない過去分を
   月単位で登録するためのもの。内部ではその月の15日の記録として扱う。
   ========================================================================= */
const BULK_DAY = 15; // 月まとめ記録に使う日

function isBulk(l) { return l && l.bulk === true; }
function bulkId(ym) { return 'bulk-' + ym; }
function bulkDate(ym) { return ym + '-' + pad2(BULK_DAY); }

/** その月の月まとめ記録 */
function findBulk(emp, ym) {
  return (emp.leaves || []).find((l) => isBulk(l) && l.date.slice(0, 7) === ym) || null;
}
/** その月の個別（日付指定）記録の合計 */
function singleSum(emp, ym) {
  return nd((emp.leaves || [])
    .filter((l) => !isBulk(l) && l.date.slice(0, 7) === ym)
    .reduce((s, l) => s + Number(l.days), 0));
}
/** 月まとめ記録を設定（0 または空なら削除） */
function setBulk(emp, ym, days) {
  emp.leaves = (emp.leaves || []).filter((l) => !(isBulk(l) && l.date.slice(0, 7) === ym));
  if (days > 0) {
    emp.leaves.push({ id: bulkId(ym), date: bulkDate(ym), days, note: '月まとめ入力', bulk: true });
  }
  emp.leaves.sort((a, b) => a.date.localeCompare(b.date));
}
/** 読み込んだデータの正規化（古い形式の移行含む） */
function normalizeEmployee(e) {
  e.workdays = e.workdays || {};
  e.leaves = e.leaves || [];
  e.grantOverrides = e.grantOverrides || {};
  e.leaves.forEach((l) => {
    if (!l.id) l.id = uid();
    // 旧「Excelから移行（月単位）」の記録は月まとめ扱いにする
    if (l.bulk === undefined) {
      l.bulk = String(l.id).startsWith('seed-') || String(l.id).startsWith('bulk-')
        || /月単位/.test(l.note || '');
    }
    if (l.bulk) l.id = bulkId(l.date.slice(0, 7));
  });
}


/* =========================================================================
   CSV 出力
   ========================================================================= */
function toCSV(rows) {
  return rows.map((r) => r.map((c) => {
    const v = String(c == null ? '' : c);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }).join(',')).join('\r\n');
}
function downloadText(filename, text, mime) {
  const blob = new Blob(['﻿' + text], { type: (mime || 'text/csv') + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** 管理簿のCSV行（1人分 or 全員分） */
function registerRows(emps) {
  const now = today();
  const out = [];
  out.push(['年次有給休暇管理簿（労働基準法施行規則 第24条の7）']);
  out.push([`作成日: ${fmtJp(now)}`, '保存期間: 基準日から3年間']);
  out.push([]);
  out.push(['■ 年度ごとの集計']);
  out.push(['氏名', '社員番号', '入社日', '基準日', '対象期間', '付与日数', '前年繰越',
            '使用可能日数', '取得日数', '時効消滅', '期末残日数', '年5日取得義務', '状態']);
  for (const e of emps) {
    for (const r of buildRegister(e, now)) {
      out.push([
        e.name, e.empNo || '', e.hireDate,
        ymd(r.from),
        `${fmtJpShort(r.from)}〜${fmtJpShort(new Date(r.to.getTime() - 86400000))}`,
        r.granted, r.carry, r.total, r.taken, r.expired, r.endRemaining,
        r.required5 ? (r.met5 ? '達成' : (r.closed ? '未達' : `進行中 ${fmtD(r.taken)}/5`)) : '対象外',
        r.closed ? '確定' : '進行中',
      ]);
    }
  }
  out.push([]);
  out.push(['■ 取得時季の明細']);
  out.push(['氏名', '社員番号', '基準日', '取得年月日', '曜日', '取得日数', '備考']);
  for (const e of emps) {
    for (const r of buildRegister(e, now)) {
      for (const it of r.items) {
        const d = parseYmd(it.date);
        out.push([e.name, e.empNo || '', ymd(r.from), it.date, WD[d.getDay()], it.days, it.note || '']);
      }
    }
  }
  return out;
}

/* =========================================================================
   年次有給休暇管理簿（画面／印刷）
   ========================================================================= */
function openRegister(emps, title) {
  const now = today();
  const ov = document.createElement('div');
  ov.className = 'reg-ov';

  let sheets = '';
  for (const e of emps) {
    const rows = buildRegister(e, now);
    if (!rows.length) {
      sheets += `<div class="reg-sheet"><h3>年次有給休暇管理簿</h3>
        <p class="law">労働基準法施行規則 第24条の7</p>
        <div class="empty">${esc(e.name)}はまだ付与日を迎えていません</div></div>`;
      continue;
    }
    for (const r of rows.slice().reverse()) {
      let body = '';
      let run = r.total;
      for (const it of r.items) {
        const d = parseYmd(it.date);
        run = nd(run - it.days);
        body += `<tr><td>${fmtJpShort(d)}<small>${WD[d.getDay()]}曜日</small></td>
          <td class="num">${fmtD(it.days)}</td>
          <td class="num">${fmtD(run)}</td>
          <td style="text-align:left;white-space:normal">${esc(it.note || '')}</td></tr>`;
      }
      if (!r.items.length) body = `<tr><td colspan="4"><div class="empty" style="padding:14px">取得実績なし</div></td></tr>`;

      sheets += `<div class="reg-sheet">
        <h3>年次有給休暇管理簿</h3>
        <p class="law">労働基準法施行規則 第24条の7 ／ 基準日から3年間保存</p>
        <div class="reg-meta">
          <div><span>氏名</span><b>${esc(e.name)}</b></div>
          ${e.empNo ? `<div><span>社員番号</span><b>${esc(e.empNo)}</b></div>` : ''}
          <div><span>入社年月日</span><b>${fmtJpShort(parseYmd(e.hireDate))}</b></div>
          <div><span>基準日</span><b>${fmtJpShort(r.from)}</b></div>
          <div><span>対象期間</span><b style="font-size:12.5px">${fmtJpShort(r.from)}〜${fmtJpShort(new Date(r.to.getTime() - 86400000))}</b></div>
        </div>
        <div class="reg-meta">
          <div><span>付与日数</span><b>${fmtD(r.granted)} 日</b></div>
          <div><span>前年繰越</span><b>${fmtD(r.carry)} 日</b></div>
          <div><span>使用可能日数</span><b>${fmtD(r.total)} 日</b></div>
        </div>
        <div class="tw"><table>
          <thead><tr><th>取得年月日（時季）</th><th>日数</th><th>残日数</th><th style="text-align:left">備考</th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>
        <div class="tot">
          <div><span>取得日数 計</span><b>${fmtD(r.taken)} 日</b></div>
          <div><span>時効消滅</span><b${r.expired > 0 ? ' style="color:var(--danger)"' : ''}>${fmtD(r.expired)} 日</b></div>
          <div><span>${r.closed ? '期末残日数' : '現在の残日数'}</span><b>${fmtD(r.endRemaining)} 日</b></div>
          <div><span>年5日取得義務</span><b>${r.required5
            ? `${fmtD(Math.min(r.taken, 5))}/5 ${r.met5 ? '<span class="pill ok">達成</span>' : (r.closed ? '<span class="pill danger">未達</span>' : '<span class="pill warn">進行中</span>')}`
            : '<span class="pill mute">対象外</span>'}</b></div>
        </div>
        <p class="reg-note">※ 付与日数は直前1年間の出勤実績（年間所定労働日数 ${r.lot.annualDays}日／${esc(r.lot.categoryShort)}）から労働基準法第39条の比例付与表により算定。${r.lot.overridden ? '本年度は手動で設定した日数を使用。' : ''}<br>
        ※ 消化は有効期限の近い付与分から充当。付与日から2年で時効消滅（労働基準法 第115条）。</p>
      </div>`;
    }
  }

  ov.innerHTML = `
    <div class="reg-top">
      <button class="ico-btn" data-reg="close" aria-label="閉じる" style="color:var(--text)">${ICON.x}</button>
      <b>${esc(title)}</b>
      <button class="btn sm" data-reg="csv" style="margin-left:auto">${ICON.down}CSV</button>
      <button class="btn sm primary" data-reg="print">${ICON.print}印刷</button>
    </div>
    <div class="reg-body">${sheets}
      <p class="reg-note noprint" style="text-align:center">印刷ダイアログで「PDFとして保存」を選ぶとPDFになります。</p>
    </div>`;

  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  const close = () => { ov.remove(); document.body.style.overflow = ''; };

  ov.addEventListener('click', (e) => {
    const b = e.target.closest('[data-reg]');
    if (!b) return;
    if (b.dataset.reg === 'close') close();
    if (b.dataset.reg === 'print') window.print();
    if (b.dataset.reg === 'csv') {
      downloadText(`年次有給休暇管理簿_${ymd(today())}.csv`, toCSV(registerRows(emps)));
      toast('CSVを保存しました');
    }
  });
}

/* =========================================================================
   一覧（全従業員）
   ========================================================================= */
function renderList() {
  const box = $('#p-list');
  if (!DATA.employees.length) {
    box.innerHTML = `<div class="card">
      <div class="empty" style="padding:18px 6px 22px">
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px">はじめまして</div>
        まだ従業員が登録されていません。<br>新しく登録するか、バックアップから復元してください。
      </div>
      <button class="btn primary full" data-act="addemp" style="margin-bottom:9px">${ICON.plus}従業員を登録する</button>
      <button class="btn full" data-act="import">バックアップJSONを読み込む</button>
    </div>`;
    return;
  }

  const now = today();
  const items = DATA.employees.map((e) => {
    const r = simulate(e, now);
    const dl = r.nextExpiry ? r.nextExpiry.daysLeft : 9999;
    const ob = r.currentObligation;
    const lv = (r.nextExpiry && dl <= 30) || (ob && !ob.met && ob.shortage > 0 && ob.daysLeft <= 90)
      ? 'danger'
      : (r.nextExpiry && dl <= 90) || (ob && ob.shortage > 0) ? 'warn' : 'ok';
    return { e, r, dl, ob, lv };
  });

  const sorted = items.slice().sort((a, b) =>
    SORT === 'name' ? a.e.name.localeCompare(b.e.name, 'ja')
      : SORT === 'balance' ? b.r.balance - a.r.balance
        : a.dl - b.dl);

  const soon = items.filter((x) => x.dl <= 90).length;
  const short5 = items.filter((x) => x.ob && x.ob.shortage > 0).length;

  let html = `<div class="sumrow">
    <div class="t"><b>${items.length}</b><span>登録人数</span></div>
    <div class="t ${soon ? 'alert' : ''}"><b>${soon}</b><span>3ヶ月以内に消滅</span></div>
    <div class="t ${short5 ? 'warn' : ''}"><b>${short5}</b><span>年5日 未達</span></div>
  </div>

  <div class="sorter">
    ${[['urgent', '期限が近い順'], ['balance', '残日数順'], ['name', '名前順']].map(([v, t]) =>
      `<button data-sort="${v}" class="${SORT === v ? 'on' : ''}">${t}</button>`).join('')}
  </div>`;

  for (const x of sorted) {
    const { e, r, ob, lv } = x;
    html += `<button class="ecard lv-${lv}" data-open="${esc(e.id)}">
      <div class="top">
        <span class="nm">${esc(e.name)}</span>
        <span class="tn">${tenureText(parseYmd(e.hireDate), now)}</span>
        <span class="bal">${fmtD(r.balance)}<small>日</small></span>
      </div>
      <div class="lines">
        ${r.nextExpiry
          ? `<div class="ln ${x.dl <= 30 ? 'danger' : x.dl <= 90 ? 'warn' : ''}">${x.dl <= 90 ? ICON.alert : ICON.clock}
             ${fmtJpShort(r.nextExpiry.date)}に <b>${fmtD(r.nextExpiry.days)}日</b>消滅（あと${x.dl}日）</div>`
          : `<div class="ln">${ICON.info} 消滅予定はありません</div>`}
        ${ob
          ? `<div class="ln ${ob.shortage <= 0 ? 'ok' : ob.daysLeft <= 90 ? 'danger' : 'warn'}">
             ${ob.shortage <= 0 ? ICON.check : ICON.alert}
             年5日義務 <b>${fmtD(ob.taken)}/5</b>${ob.shortage > 0 ? `（あと${fmtD(ob.shortage)}日）` : ''}
             <span class="mini"><i style="width:${Math.min(100, (ob.taken / 5) * 100).toFixed(0)}%"></i></span></div>`
          : ''}
        ${r.nextGrant
          ? `<div class="ln">${ICON.gift} 次回付与 ${fmtJpShort(r.nextGrant.date)}　<b>＋${fmtD(r.nextGrant.granted)}日</b></div>`
          : ''}
      </div>
    </button>`;
  }

  html += `<h2 class="sec">年次有給休暇管理簿</h2><div class="card">
    <p class="sub" style="margin-bottom:12px">労働基準法で作成と3年間の保存が義務づけられている帳簿です。印刷・PDF保存・CSV保存ができます。</p>
    <div class="row">
      <button class="btn" data-act="regall">${ICON.doc}全員分を表示</button>
      <button class="btn" data-act="regcsv">${ICON.down}CSVで保存</button>
    </div>
  </div>`;

  box.innerHTML = html;
}


/* =========================================================================
   日付ピッカー（自前のカレンダー）
   端末やブラウザによって <input type="date"> のカレンダーが開かないことが
   あるため、どこでも同じように動く独自のカレンダーを使う。
   ========================================================================= */
const WD = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 日付フィールド。直接入力できる日付欄と、カレンダーを開くボタンの2つを並べる。
 * 端末によっては日付欄のカレンダーが開かないので、右のボタンからは必ず開く。
 */
function dateField(key, value) {
  const v = value || ymd(today());
  const d = parseYmd(v);
  return `<div class="dfrow">
    <input type="date" id="df-${esc(key)}" data-dfi="${esc(key)}" value="${esc(v)}">
    <button type="button" class="calbtn" data-df="${esc(key)}" aria-label="カレンダーから選ぶ" title="カレンダーから選ぶ">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M8 2.5v4M16 2.5v4M3.5 9.5h17"/><path d="M7.6 13h2M7.6 16.6h2M11.6 13h2M11.6 16.6h2M15.6 13h1"/></svg>
    </button>
  </div>
  <div class="dfcap">${fmtJp(d)}（${WD[d.getDay()]}曜日）</div>`;
}

let dpClose = null;

/**
 * カレンダーを開く。
 * @param {string} value   初期選択日 (yyyy-mm-dd)
 * @param {object} opts    { marks:Set<string>, minYear, maxYear, title }
 * @param {function} onPick 選ばれた日付を受け取る
 */
function openDatePicker(value, opts, onPick) {
  const o = opts || {};
  const now = today();
  let sel = value ? parseYmd(value) : now;
  let view = new Date(sel.getFullYear(), sel.getMonth(), 1);
  const minY = o.minYear || now.getFullYear() - 60;
  const maxY = o.maxYear || now.getFullYear() + 5;

  const ov = document.createElement('div');
  ov.className = 'dp-ov';
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';

  const close = () => {
    ov.remove();
    document.body.style.overflow = '';
    dpClose = null;
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  dpClose = close;

  const draw = () => {
    const y = view.getFullYear(), m = view.getMonth();
    const first = new Date(y, m, 1);
    const start = new Date(y, m, 1 - first.getDay());
    let years = '';
    for (let i = minY; i <= maxY; i++) years += `<option value="${i}" ${i === y ? 'selected' : ''}>${i}年</option>`;
    let months = '';
    for (let i = 0; i < 12; i++) months += `<option value="${i}" ${i === m ? 'selected' : ''}>${i + 1}月</option>`;

    let grid = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const k = ymd(d);
      const cls = [
        's' + d.getDay(),
        d.getMonth() !== m ? 'out' : '',
        +d === +now ? 'today' : '',
        +d === +sel ? 'sel' : '',
        o.marks && o.marks.has(k) ? 'has' : '',
      ].filter(Boolean).join(' ');
      grid += `<button type="button" class="${cls}" data-d="${k}">${d.getDate()}</button>`;
      if (i === 34 && new Date(start.getFullYear(), start.getMonth(), start.getDate() + 35).getMonth() !== m) break;
    }

    ov.innerHTML = `<div class="dp" role="dialog" aria-label="日付を選ぶ">
      <div class="dp-h">
        <button type="button" class="dp-nav" data-mv="-1" aria-label="前の月">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 5-7 7 7 7"/></svg></button>
        <div class="sp" style="display:flex;gap:6px;justify-content:center">
          <select data-sy>${years}</select><select data-sm>${months}</select>
        </div>
        <button type="button" class="dp-nav" data-mv="1" aria-label="次の月">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9.5 5 7 7-7 7"/></svg></button>
      </div>
      <div class="dp-w">${WD.map((w, i) => `<span class="s${i}">${w}</span>`).join('')}</div>
      <div class="dp-g">${grid}</div>
      <div class="dp-f">
        <button type="button" class="btn" data-dp="cancel">キャンセル</button>
        <button type="button" class="btn" data-dp="today">今日</button>
      </div>
    </div>`;
  };
  draw();

  ov.addEventListener('click', (e) => {
    if (e.target === ov) { close(); return; }
    const mv = e.target.closest('[data-mv]');
    if (mv) { view = new Date(view.getFullYear(), view.getMonth() + Number(mv.dataset.mv), 1); draw(); return; }
    const act = e.target.closest('[data-dp]');
    if (act) {
      if (act.dataset.dp === 'cancel') { close(); return; }
      if (act.dataset.dp === 'today') { close(); onPick(ymd(now)); return; }
    }
    const cell = e.target.closest('[data-d]');
    if (cell) { close(); onPick(cell.dataset.d); }
  });
  ov.addEventListener('change', (e) => {
    const sy = ov.querySelector('[data-sy]'), sm = ov.querySelector('[data-sm]');
    if (e.target === sy || e.target === sm) {
      view = new Date(Number(sy.value), Number(sm.value), 1);
      draw();
    }
  });
}

/* =========================================================================
   ホーム
   ========================================================================= */
function renderHome() {
  const emp = currentEmp();
  const box = $('#p-home');
  if (!emp) {
    box.innerHTML = `<div class="card">
      <div class="empty" style="padding:18px 6px 22px">
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px">はじめまして</div>
        まだ従業員が登録されていません。<br>新しく登録するか、バックアップから復元してください。
      </div>
      <button class="btn primary full" data-act="addemp" style="margin-bottom:9px">${ICON.plus}従業員を登録する</button>
      <button class="btn full" data-act="import">バックアップJSONを読み込む</button>
    </div>`;
    return;
  }
  const now = today();
  const r = simulate(emp, now);
  const hire = parseYmd(emp.hireDate);

  /* ---- ヒーロー ---- */
  let html = `
  <div class="card hero">
    <div class="who"><b>${esc(emp.name)}</b>${emp.empNo ? ` <span>No.${esc(emp.empNo)}</span>` : ''}
      <span style="margin-left:auto">${tenureText(hire, now)}</span></div>
    <div class="big num"><span class="v">${fmtD(r.balance)}</span><span class="u">日</span></div>
    <div class="cap">${fmtJp(now)}時点で使える有給</div>
    <div class="hero-split">
      <div>取得予定を引くと<b class="num">${fmtD(r.plannedBalance)}日</b></div>
      ${r.nextGrant
        ? `<div>次回付与 ${fmtJpShort(r.nextGrant.date)}<b class="num">＋${fmtD(r.nextGrant.granted)}日</b></div>`
        : `<div>次回付与<b>—</b></div>`}
    </div>
  </div>`;

  /* ---- 消滅アラート ---- */
  if (r.nextExpiry) {
    const dl = r.nextExpiry.daysLeft;
    const lv = dl <= 30 ? 'danger' : dl <= 90 ? 'warn' : 'info';
    const icon = dl <= 90 ? ICON.alert : ICON.clock;
    html += `<div class="note ${lv}">${icon}<div style="flex:1">
      <div class="t">${fmtJp(r.nextExpiry.date)}に ${fmtD(r.nextExpiry.days)}日 が消滅します</div>
      <div class="d">期限まで <b>あと${dl}日</b>${dl <= 90 ? ' — 計画的に取得してください。' : '。'}</div>
      <div class="bar on-tint"><i style="width:${Math.max(3, Math.min(100, (1 - dl / 730) * 100)).toFixed(0)}%"></i></div>
    </div></div>`;
  } else if (r.balance <= 0) {
    html += `<div class="note info">${ICON.info}<div><div class="t">現在使える有給はありません</div>
      <div class="d">${r.nextGrant ? `次回付与は ${fmtJp(r.nextGrant.date)}（${fmtD(r.nextGrant.granted)}日）です。` : ''}</div></div></div>`;
  }

  /* ---- 年5日取得義務 ---- */
  const ob = r.currentObligation;
  if (ob) {
    const done = ob.shortage <= 0;
    const lv = done ? 'ok' : ob.daysLeft <= 90 ? 'danger' : 'warn';
    html += `<div class="note ${lv}">${done ? ICON.check : ICON.alert}<div style="flex:1">
      <div class="t">年5日の取得義務：${fmtD(ob.taken)} / 5日${done ? ' 達成' : `（あと${fmtD(ob.shortage)}日）`}</div>
      <div class="d">対象期間 ${fmtJpShort(ob.from)}〜${fmtJpShort(new Date(ob.to.getTime() - 86400000))}（あと${ob.daysLeft}日）</div>
      <div class="bar on-tint"><i style="width:${Math.min(100, (ob.taken / 5) * 100).toFixed(0)}%"></i></div>
    </div></div>`;
  }

  /* ---- 残高不足の警告 ---- */
  if (r.shortfalls.length) {
    const s = r.shortfalls.reduce((a, b) => a + b.days, 0);
    html += `<div class="note danger">${ICON.alert}<div><div class="t">有給が足りていない記録があります（計${fmtD(s)}日）</div>
      <div class="d">${r.shortfalls.slice(0, 4).map((x) => `${x.date}（${fmtD(x.days)}日分）`).join('、')}${r.shortfalls.length > 4 ? ' ほか' : ''}<br>
      出勤日数の入力漏れ、または記録の誤りが考えられます。</div></div></div>`;
  }

  /* ---- 付与ロット一覧 ---- */
  const past = r.lots.filter((l) => !l.future);
  html += `<h2 class="sec">付与と消化の内訳</h2><div class="card"><div class="tw"><table>
    <thead><tr><th>付与日</th><th>付与</th><th>消化</th><th>消滅</th><th>残</th><th>有効期限</th></tr></thead><tbody>`;
  for (const l of past) {
    const alive = l.expiry > now;
    const cls = alive && l.remaining > 0 ? 'now' : alive ? '' : 'dim';
    html += `<tr class="${cls}">
      <td>${fmtJpShort(l.date)}<small>${l.label}</small></td>
      <td class="num">${fmtD(l.granted)}</td>
      <td class="num">${fmtD(nd(l.used))}</td>
      <td class="num">${l.expired > 0 ? `<span style="color:var(--danger);font-weight:700">${fmtD(nd(l.expired))}</span>` : '—'}</td>
      <td class="num"><b>${alive ? fmtD(nd(l.remaining)) : '—'}</b></td>
      <td style="color:${alive && diffDays(now, l.expiry) <= 90 ? 'var(--danger);font-weight:700' : 'inherit'}">${fmtJpShort(l.expiry)}</td>
    </tr>`;
  }
  if (!past.length) html += `<tr><td colspan="6"><div class="empty">まだ付与日を迎えていません</div></td></tr>`;
  html += `</tbody></table></div></div>`;

  /* ---- 今後の付与予定 ---- */
  const fut = r.lots.filter((l) => l.future).slice(0, 3);
  if (fut.length) {
    html += `<h2 class="sec">今後の付与予定</h2><div class="card">`;
    for (const l of fut) {
      html += `<div class="li">${ICON.gift.replace('<svg', '<svg style="width:19px;height:19px;flex:none;color:var(--accent)"')}
        <div class="g"><div class="d1">${fmtJp(l.date)}</div>
        <div class="d2">${l.label}・${esc(l.categoryShort)}／有効期限 ${fmtJpShort(l.expiry)}</div></div>
        <div class="amt" style="color:var(--accent)">＋${fmtD(l.granted)}日</div></div>`;
    }
    html += `<p class="sub" style="margin-top:10px">※ 直近の出勤日数から推定した見込みです。実績が入ると自動で更新されます。</p></div>`;
  }

  /* ---- 累計 ---- */
  html += `<h2 class="sec">年次有給休暇管理簿</h2><div class="card">
    <p class="sub" style="margin-bottom:12px">${esc(emp.name)}の法定帳簿です。印刷・PDF保存・CSV保存ができます。</p>
    <button class="btn full" data-act="reg1">${ICON.doc}管理簿を表示する</button>
  </div>`;

  html += `<h2 class="sec">これまでの累計</h2><div class="card">
    <div class="kv"><span>付与された日数</span><b class="num">${fmtD(r.totalGranted)}日</b></div>
    <div class="kv"><span>取得した日数</span><b class="num">${fmtD(r.totalUsed)}日</b></div>
    <div class="kv"><span>消滅した日数</span><b class="num" style="color:${r.totalExpired > 0 ? 'var(--danger)' : 'inherit'}">${fmtD(r.totalExpired)}日</b></div>
    <div class="kv"><span>現在の残日数</span><b class="num" style="color:var(--accent)">${fmtD(r.balance)}日</b></div>
  </div>`;

  box.innerHTML = html;
}

/* =========================================================================
   取得記録
   ========================================================================= */
function renderLeave() {
  const emp = currentEmp();
  const box = $('#p-leave');
  if (!emp) { box.innerHTML = `<div class="card"><div class="empty">先に「ホーム」タブから従業員を登録してください</div></div>`; return; }
  const now = today();

  let html = `<div class="seg" style="margin-bottom:14px">
    <button data-lmode="single" class="${LEAVE_MODE === 'single' ? 'on' : ''}">1日ずつ入力</button>
    <button data-lmode="bulk" class="${LEAVE_MODE === 'bulk' ? 'on' : ''}">月ごとにまとめて</button>
  </div>`;

  html += LEAVE_MODE === 'bulk' ? leaveBulkHtml(emp, now) : leaveSingleHtml(emp, now);
  box.innerHTML = html;
}

/* ---------- 1日ずつ入力 ---------- */
function leaveSingleHtml(emp, now) {
  const r = simulate(emp, now);
  const custom = LEAVE_DAYS !== 0.5 && LEAVE_DAYS !== 1;

  let html = `
  <div class="card">
    <h2 class="sec" style="margin-top:0">有給を取得した日を追加</h2>
    <div class="field"><label class="fl">取得日</label>
      ${dateField('lvDate', LEAVE_DATE || ymd(now))}
      <div class="quick">
        <button type="button" data-qd="0">今日</button>
        <button type="button" data-qd="-1">昨日</button>
        <button type="button" data-qd="-2">一昨日</button>
      </div></div>
    <div class="field"><label class="fl">日数</label>
      <div class="seg">
        <button data-days="1" class="${LEAVE_DAYS === 1 ? 'on' : ''}">1日</button>
        <button data-days="0.5" class="${LEAVE_DAYS === 0.5 ? 'on' : ''}">半日</button>
        <button data-days="custom" class="${custom ? 'on' : ''}">その他</button>
      </div>
      ${custom ? `<input type="number" id="lvDays" step="0.5" min="0.5" value="${LEAVE_DAYS}" style="margin-top:8px" inputmode="decimal">` : ''}
    </div>
    <div class="field"><label class="fl" for="lvNote">メモ（任意）</label>
      <input type="text" id="lvNote" placeholder="例：私用／旅行"></div>
    <button class="btn primary full" data-act="addleave">${ICON.plus}記録を追加</button>
  </div>`;

  /* 付与年度ごとにグループ化 */
  const lots = r.lots.filter((l) => !l.future || l.date <= addMonths(now, 12));
  const groups = lots.map((l) => ({
    from: l.date, to: addMonths(l.date, 12), lot: l, items: [],
    label: `${fmtJpShort(l.date)} 〜 ${fmtJpShort(new Date(addMonths(l.date, 12).getTime() - 86400000))}`,
  }));
  const other = { label: '付与日より前', items: [], lot: null };
  for (const lv of r.allLeaves) {
    const d = parseYmd(lv.date);
    const g = groups.find((x) => d >= x.from && d < x.to);
    (g || other).items.push(lv);
  }
  const shown = [...groups].reverse().filter((g) => g.items.length);
  if (other.items.length) shown.push(other);

  html += `<h2 class="sec">取得の記録（合計 ${fmtD(nd(r.allLeaves.reduce((s, l) => s + l.days, 0)))}日）</h2><div class="card">`;
  if (!shown.length) {
    html += `<div class="empty">まだ記録がありません</div>`;
  } else {
    for (const g of shown) {
      const sum = nd(g.items.reduce((s, l) => s + l.days, 0));
      const ob = g.lot && g.lot.granted >= 10;
      html += `<div class="yr"><span>${esc(g.label)}${g.lot ? `（${g.lot.label}）` : ''}</span>
        <span>${fmtD(sum)}日 ${ob ? `<span class="pill ${sum >= 5 ? 'ok' : 'warn'}">義務 ${fmtD(Math.min(sum, 5))}/5</span>` : ''}</span></div>`;
      for (const lv of g.items.slice().reverse()) {
        const d = parseYmd(lv.date);
        const future = lv.date > ymd(now);
        html += `<div class="li">
          <div class="g"><div class="d1">${isBulk(lv)
            ? `${d.getFullYear()}年${d.getMonth() + 1}月 <span class="pill mute">月まとめ</span>`
            : `${fmtJp(d)}（${WD[d.getDay()]}）${future ? ' <span class="pill acc">予定</span>' : ''}`}</div>
            ${lv.note && !isBulk(lv) ? `<div class="d2">${esc(lv.note)}</div>` : ''}</div>
          <div class="amt">${fmtD(lv.days)}日</div>
          <button class="ico-btn" data-act="dellv" data-id="${esc(lv.id)}" aria-label="削除">${ICON.trash}</button>
        </div>`;
      }
    }
  }
  return html + `</div>`;
}

/* ---------- 月ごとにまとめて入力 ---------- */
function leaveBulkHtml(emp, now) {
  const hire = parseYmd(emp.hireDate);
  const yearsOf = (emp.leaves || []).map((l) => Number(l.date.slice(0, 4)));
  const last = Math.max(now.getFullYear(), hire.getFullYear(), ...(yearsOf.length ? yearsOf : [0]));

  let html = `<div class="note info">${ICON.info}<div><div class="t">日付を覚えていない過去分はこちら</div>
    <div class="d">月ごとに「何日取ったか」を入れるだけで登録できます。日付は各月の${BULK_DAY}日として記録され、残日数や消滅の計算に反映されます。<br>
    あとから正確な日付が分かったら「1日ずつ入力」で入れ直してください。</div></div></div>`;

  let grand = 0;
  let body = '';
  for (let y = last; y >= hire.getFullYear(); y--) {
    let ySum = 0, cells = '';
    for (let m = 1; m <= 12; m++) {
      const ym = `${y}-${pad2(m)}`;
      const b = findBulk(emp, ym);
      const sng = singleSum(emp, ym);
      ySum += (b ? Number(b.days) : 0) + sng;
      cells += `<div class="m"><span>${m}月</span>
        <input type="number" inputmode="decimal" step="0.5" min="0" max="31" placeholder="—"
          value="${b ? fmtD(Number(b.days)) : ''}" data-bulk="${ym}">
        ${sng > 0 ? `<em class="sng">個別+${fmtD(sng)}</em>` : ''}</div>`;
    }
    grand += ySum;
    body += `<div class="card"><div class="yhead"><b>${y}年</b>
      <span class="sub">合計 <b class="num">${fmtD(nd(ySum))}</b>日</span></div>
      <div class="mg">${cells}</div></div>`;
  }

  html += `<h2 class="sec">月ごとの取得日数（総計 ${fmtD(nd(grand))}日）</h2>` + body;
  html += `<p class="sub" style="margin-top:-4px">「個別+◯」は、その月に1日ずつ入力した記録がある分です。上の数字とは別に加算されます。</p>`;
  return html;
}

/* =========================================================================
   出勤日数
   ========================================================================= */
function renderWork() {
  const emp = currentEmp();
  const box = $('#p-work');
  if (!emp) { box.innerHTML = `<div class="card"><div class="empty">先に「ホーム」タブから従業員を登録してください</div></div>`; return; }
  const now = today();
  const hire = parseYmd(emp.hireDate);
  const r = simulate(emp, now);

  let html = `<div class="note info">${ICON.info}<div><div class="t">付与日数はここの入力から自動計算されます</div>
    <div class="d">月ごとの出勤日数（実際に働いた日数）を入れてください。付与日の直前12ヶ月分（初回は6ヶ月×2）から「1年間の所定労働日数」を求め、比例付与表で日数を判定します。</div></div></div>`;

  const years = [];
  const last = Math.max(now.getFullYear(), ...Object.keys(emp.workdays || {}).map((k) => Number(k.slice(0, 4))), hire.getFullYear());
  for (let y = hire.getFullYear(); y <= last; y++) years.push(y);

  for (const y of years.slice().reverse()) {
    let sum = 0, cnt = 0;
    for (let m = 1; m <= 12; m++) {
      const v = emp.workdays[`${y}-${pad2(m)}`];
      if (typeof v === 'number') { sum += v; cnt++; }
    }
    html += `<div class="card"><div class="yhead"><b>${y}年</b>
      <button class="btn sm" data-act="fillyear" data-y="${y}">全月に一括入力</button>
      <span class="sub">${cnt ? `${cnt}ヶ月入力 / 計 <b class="num">${sum}</b>日` : '未入力'}</span></div>
      <div class="mg">`;
    for (let m = 1; m <= 12; m++) {
      const key = `${y}-${pad2(m)}`;
      const v = emp.workdays[key];
      html += `<div class="m"><span>${m}月</span>
        <input type="number" inputmode="numeric" min="0" max="31" placeholder="—"
          value="${typeof v === 'number' ? v : ''}" data-wd="${key}"></div>`;
    }
    html += `</div></div>`;
  }

  /* 判定結果 */
  html += `<h2 class="sec">付与日数の判定結果</h2><div class="card"><div class="tw"><table>
    <thead><tr><th>基準日</th><th>年間労働日数</th><th>区分</th><th>付与</th><th>根拠</th></tr></thead><tbody>`;
  for (const l of r.lots.slice(0, r.lots.length)) {
    const src = l.annualSource === 'actual' ? '<span class="pill ok">実績</span>'
      : l.annualSource === 'partial' ? '<span class="pill warn">一部推定</span>'
      : '<span class="pill mute">既定値</span>';
    html += `<tr class="${l.future ? 'dim' : ''}"><td>${fmtJpShort(l.date)}${l.future ? ' <span class="pill acc">予定</span>' : ''}</td>
      <td class="num">${l.annualDays}日</td><td>${esc(l.categoryShort)}</td>
      <td class="num"><b>${fmtD(l.granted)}日</b>${l.overridden ? ' <span class="pill acc">手入力</span>' : ''}</td>
      <td>${src}</td></tr>`;
  }
  html += `</tbody></table></div>
    <p class="sub" style="margin-top:10px">出勤日数が未入力の期間は、設定の「既定の週所定労働日数」（現在 週${emp.weeklyDays ?? 5}日）から推定します。</p></div>`;

  html += grantTableHelp();
  box.innerHTML = html;
}

function grantTableHelp() {
  let rows = '';
  for (const r of GRANT_TABLE) {
    rows += `<tr><td style="white-space:normal">${esc(r.label)}</td>${r.days.map((d) => `<td class="num">${d}</td>`).join('')}</tr>`;
  }
  return `<details class="help"><summary>法定の付与日数表（労働基準法 第39条）</summary><div class="body">
    <div class="tw"><table><thead><tr><th>勤務区分</th><th>0.5年</th><th>1.5</th><th>2.5</th><th>3.5</th><th>4.5</th><th>5.5</th><th>6.5〜</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p style="margin:10px 0 0">※ 週30時間以上勤務の場合は日数にかかわらず最上段が適用されます。出勤率8割未満の年は付与されません（本アプリでは考慮していません）。</p>
  </div></details>`;
}

/* =========================================================================
   設定
   ========================================================================= */
function renderSet() {
  const emp = currentEmp();
  let html = `<h2 class="sec" style="margin-top:0">従業員</h2><div class="card">`;
  for (const e of DATA.employees) {
    html += `<div class="emp-card" data-emp="${esc(e.id)}">
      <div class="top"><b>${esc(e.name || '(名称未設定)')}</b>
        ${e.id === CUR ? '<span class="pill acc">表示中</span>' : ''}
        <button class="ico-btn" style="margin-left:auto" data-act="delemp" data-id="${esc(e.id)}" aria-label="削除">${ICON.trash}</button></div>
      <div class="row" style="margin-bottom:10px">
        <div><label class="fl">氏名</label><input type="text" value="${esc(e.name)}" data-ef="name" data-id="${esc(e.id)}"></div>
        <div><label class="fl">社員番号</label><input type="text" value="${esc(e.empNo || '')}" data-ef="empNo" data-id="${esc(e.id)}" placeholder="任意"></div>
      </div>
      <div class="row">
        <div><label class="fl">入社日</label>${dateField('hire:' + e.id, e.hireDate)}</div>
        <div><label class="fl">既定の週所定労働日数</label>
          <select class="inp" data-ef="weeklyDays" data-id="${esc(e.id)}">
            ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${Number(e.weeklyDays) === n ? 'selected' : ''}>週${n}日</option>`).join('')}
          </select></div>
      </div>
    </div>`;
  }
  html += `<button class="btn full" data-act="addemp">${ICON.plus}従業員を追加</button></div>`;

  /* 付与日数の上書き */
  if (emp) {
    const r = simulate(emp, today());
    html += `<h2 class="sec">付与日数の手動調整（${esc(emp.name)}）</h2><div class="card">
      <p class="sub" style="margin-bottom:12px">自動計算より多く付与する規定がある場合などに上書きできます。空欄にすると自動計算に戻ります。</p>`;
    for (const l of r.lots) {
      html += `<div class="li"><div class="g"><div class="d1">${fmtJpShort(l.date)}　${l.label}</div>
        <div class="d2">自動計算 ${fmtD(l.autoDays)}日${l.future ? '（予定）' : ''}</div></div>
        <input type="number" step="0.5" min="0" style="width:88px;text-align:center" placeholder="${fmtD(l.autoDays)}"
          value="${l.overridden ? fmtD(l.granted) : ''}" data-ov="${l.key}"></div>`;
    }
    html += `</div>`;
  }

  /* データ */
  html += `<h2 class="sec">データ</h2><div class="card">
    <p class="sub" style="margin-bottom:12px">データはこの端末のブラウザ内にだけ保存されます。機種変更やバックアップにはJSONの書き出し／読み込みを使ってください。</p>
    <div class="row" style="margin-bottom:10px">
      <button class="btn" data-act="export">書き出し</button>
      <button class="btn" data-act="import">読み込み</button>
    </div>
    <button class="btn danger full" data-act="reset">この端末のデータを消去</button>
  </div>`;

  /* 表示 */
  const ui = loadUI();
  const th = ui.theme || 'auto';
  html += `<h2 class="sec">表示</h2><div class="card">
    <label class="fl">テーマ</label>
    <div class="seg">
      ${[['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']].map(([v, t]) =>
        `<button data-theme="${v}" class="${th === v ? 'on' : ''}">${t}</button>`).join('')}
    </div>
  </div>`;

  html += grantTableHelp();
  html += `<details class="help"><summary>計算ルールについて</summary><div class="body">
    <p><b>基準日</b>：入社日の6ヶ月後、以降1年ごと。月末入社の場合は該当月の末日に丸めます。</p>
    <p><b>時効</b>：付与日から2年で消滅します（労基法 第115条）。</p>
    <p><b>消化の順番</b>：有効期限の近いもの（＝古い付与分）から消費します。</p>
    <p><b>年5日の取得義務</b>：10日以上付与された場合、付与日から1年以内に5日取得させる義務があります（労基法 第39条第7項）。</p>
    <p style="color:var(--danger)"><b>ご注意</b>：本アプリは法定の最低基準に基づく目安です。就業規則で法定を上回る付与や、出勤率8割未満による不付与、時間単位年休などは反映していません。最終的な判断は就業規則と実際の労務管理でご確認ください。</p>
  </div></details>
  <p class="sub" style="text-align:center;margin:18px 0 6px">有給管理 v1.0</p>`;

  $('#p-set').innerHTML = html;
}

/* =========================================================================
   描画 / タブ
   ========================================================================= */
function renderEmpSelect() {
  const s = $('#empSelect');
  s.innerHTML = DATA.employees.map((e) =>
    `<option value="${esc(e.id)}" ${e.id === CUR ? 'selected' : ''}>${esc(e.name || '(名称未設定)')}</option>`).join('');
  s.style.display = (TAB === 'list' || !DATA.employees.length) ? 'none' : '';
}
function render() {
  renderEmpSelect();
  if (TAB === 'list') renderList();
  if (TAB === 'home') renderHome();
  if (TAB === 'leave') renderLeave();
  if (TAB === 'work') renderWork();
  if (TAB === 'set') renderSet();
}
function setTab(t) {
  TAB = t;
  $$('.panel').forEach((p) => p.classList.toggle('on', p.id === 'p-' + t));
  $$('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  render();
  window.scrollTo({ top: 0 });
}
function applyTheme(v) {
  if (v === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', v);
}

/* =========================================================================
   イベント
   ========================================================================= */
/* ---- 日付欄への直接入力 ---- */
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (!t.dataset || !t.dataset.dfi) return;
  const key = t.dataset.dfi;
  const v = t.value;
  if (!v) return;

  if (key === 'lvDate') { LEAVE_DATE = v; renderLeave(); return; }

  if (key.startsWith('hire:')) {
    const e = DATA.employees.find((x) => x.id === key.slice(5));
    if (!e) return;
    e.hireDate = v; saveData(); renderSet(); toast('入社日を更新しました');
  }
});

/* ---- カレンダーボタン / クイック選択 ---- */
document.addEventListener('click', (ev) => {
  const q = ev.target.closest('[data-qd]');
  if (q) {
    const d = today();
    d.setDate(d.getDate() + Number(q.dataset.qd));
    LEAVE_DATE = ymd(d);
    renderLeave();
    return;
  }

  const df = ev.target.closest('[data-df]');
  if (!df) return;
  const key = df.dataset.df;
  const now = today();

  if (key === 'lvDate') {
    const emp = currentEmp();
    const marks = new Set((emp && emp.leaves ? emp.leaves : []).map((l) => l.date));
    openDatePicker(LEAVE_DATE || ymd(now), { marks, minYear: now.getFullYear() - 10, maxYear: now.getFullYear() + 3 },
      (picked) => { LEAVE_DATE = picked; renderLeave(); });
    return;
  }

  if (key.startsWith('hire:')) {
    const id = key.slice(5);
    const e = DATA.employees.find((x) => x.id === id);
    if (!e) return;
    openDatePicker(e.hireDate, { minYear: now.getFullYear() - 50, maxYear: now.getFullYear() + 1 },
      (picked) => { e.hireDate = picked; saveData(); renderSet(); toast('入社日を更新しました'); });
  }
});

document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-act],[data-tab],[data-days],[data-theme],[data-sort],[data-open],[data-lmode]');
  if (!btn) return;

  if (btn.dataset.tab) { setTab(btn.dataset.tab); return; }

  if (btn.dataset.sort) { SORT = btn.dataset.sort; renderList(); return; }

  if (btn.dataset.lmode) { LEAVE_MODE = btn.dataset.lmode; renderLeave(); return; }

  if (btn.dataset.open) { CUR = btn.dataset.open; setTab('home'); return; }

  if (btn.dataset.theme) {
    const ui = loadUI(); ui.theme = btn.dataset.theme; saveUI(ui);
    applyTheme(ui.theme); render(); return;
  }

  if (btn.dataset.days) {
    LEAVE_DAYS = btn.dataset.days === 'custom' ? (LEAVE_DAYS === 1 || LEAVE_DAYS === 0.5 ? 2 : LEAVE_DAYS) : Number(btn.dataset.days);
    renderLeave(); return;
  }

  const act = btn.dataset.act;
  const emp = currentEmp();

  if (act === 'goset') { setTab('set'); return; }

  if (act === 'reg1') { openRegister([emp], `${emp.name} の管理簿`); return; }
  if (act === 'regall') {
    if (!DATA.employees.length) { toast('従業員が登録されていません'); return; }
    openRegister(DATA.employees, '年次有給休暇管理簿（全員）'); return;
  }
  if (act === 'regcsv') {
    if (window.__PREVIEW__) { toast('CSV保存はGitHub Pages版で使えます'); return; }
    downloadText(`年次有給休暇管理簿_${ymd(today())}.csv`, toCSV(registerRows(DATA.employees)));
    toast('CSVを保存しました'); return;
  }

  if (act === 'addleave') {
    const date = LEAVE_DATE || ymd(today());
    if (!date) { toast('日付を選んでください'); return; }
    const inp = $('#lvDays');
    const days = inp ? Number(inp.value) : LEAVE_DAYS;
    if (!(days > 0)) { toast('日数を入力してください'); return; }
    emp.leaves = emp.leaves || [];
    emp.leaves.push({ id: uid(), date, days, note: ($('#lvNote').value || '').trim() });
    emp.leaves.sort((a, b) => a.date.localeCompare(b.date));
    saveData();
    const d0 = parseYmd(date);
    LEAVE_DATE = null;
    renderLeave();
    toast(`${d0.getMonth() + 1}月${d0.getDate()}日 に ${fmtD(days)}日 を記録しました`);
    return;
  }

  if (act === 'dellv') {
    emp.leaves = (emp.leaves || []).filter((l) => l.id !== btn.dataset.id);
    saveData(); renderLeave(); toast('削除しました'); return;
  }

  if (act === 'fillyear') {
    const y = btn.dataset.y;
    const v = prompt(`${y}年の全12ヶ月に入れる出勤日数を入力してください`, '21');
    if (v === null) return;
    const n = Number(v);
    if (!(n >= 0 && n <= 31)) { toast('0〜31の数字を入れてください'); return; }
    for (let m = 1; m <= 12; m++) emp.workdays[`${y}-${pad2(m)}`] = n;
    saveData(); renderWork(); toast(`${y}年を${n}日で埋めました`); return;
  }

  if (act === 'addemp') {
    const e = {
      id: uid(), name: `新しい従業員${DATA.employees.length + 1}`, empNo: '',
      hireDate: ymd(today()), weeklyDays: 5, workdays: {}, leaves: [], grantOverrides: {},
    };
    DATA.employees.push(e); CUR = e.id; saveData();
    setTab('set'); toast('氏名と入社日を入力してください'); return;
  }

  if (act === 'delemp') {
    const e = DATA.employees.find((x) => x.id === btn.dataset.id);
    if (!e) return;
    if (!confirm(`「${e.name}」のデータを削除します。元に戻せません。よろしいですか？`)) return;
    DATA.employees = DATA.employees.filter((x) => x.id !== e.id);
    if (CUR === e.id) CUR = DATA.employees[0] ? DATA.employees[0].id : null;
    saveData(); render(); toast(`「${e.name}」を削除しました`); return;
  }

  if (act === 'export') {
    const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `有給管理データ_${ymd(today())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('JSONを書き出しました'); return;
  }

  if (act === 'import') { $('#fileIn').click(); return; }

  if (act === 'reset') {
    if (!confirm('この端末に保存したデータをすべて消します。元に戻せません。よろしいですか？')) return;
    try { localStorage.removeItem(KEY); } catch (e) {}
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    CUR = DATA.employees[0] ? DATA.employees[0].id : null;
    saveData(); setTab('home'); toast('消去しました'); return;
  }
});

document.addEventListener('change', (ev) => {
  const t = ev.target;

  if (t.id === 'empSelect') { CUR = t.value; render(); return; }

  if (t.id === 'fileIn' && t.files && t.files[0]) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const d = JSON.parse(fr.result);
        if (!d || !Array.isArray(d.employees)) throw new Error('形式が違います');
        DATA = d;
        DATA.employees.forEach(normalizeEmployee);
        CUR = DATA.employees[0] ? DATA.employees[0].id : null;
        saveData();
        setTab(DATA.employees.length > 1 ? 'list' : 'home');
        toast(`${DATA.employees.length}人分を読み込みました`);
      } catch (e) { alert('読み込めませんでした：' + e.message); }
    };
    fr.readAsText(t.files[0]);
    t.value = '';
    return;
  }

  const emp = currentEmp();
  if (!emp) return;

  if (t.dataset.bulk) {
    const v = t.value.trim();
    setBulk(emp, t.dataset.bulk, v === '' ? 0 : Math.max(0, Math.min(31, Number(v))));
    saveData(); renderLeave(); return;
  }

  if (t.dataset.wd) {
    const v = t.value.trim();
    if (v === '') delete emp.workdays[t.dataset.wd];
    else emp.workdays[t.dataset.wd] = Math.max(0, Math.min(31, Number(v)));
    saveData(); renderWork(); return;
  }

  if (t.dataset.ov) {
    emp.grantOverrides = emp.grantOverrides || {};
    const v = t.value.trim();
    if (v === '') delete emp.grantOverrides[t.dataset.ov];
    else emp.grantOverrides[t.dataset.ov] = Math.max(0, Number(v));
    saveData(); renderSet(); toast('付与日数を更新しました'); return;
  }

  if (t.dataset.ef) {
    const e = DATA.employees.find((x) => x.id === t.dataset.id);
    if (!e) return;
    const f = t.dataset.ef;
    e[f] = f === 'weeklyDays' ? Number(t.value) : t.value;
    saveData();
    if (f === 'name') renderEmpSelect();
    if (f === 'hireDate' || f === 'weeklyDays') renderSet();
    return;
  }
});

/* 出勤日数の入力は打ちながら保存（再描画はしない） */
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!t.dataset || !t.dataset.wd) return;
  const emp = currentEmp(); if (!emp) return;
  const v = t.value.trim();
  if (v === '') delete emp.workdays[t.dataset.wd];
  else emp.workdays[t.dataset.wd] = Math.max(0, Math.min(31, Number(v)));
  saveData();
});

/* =========================================================================
   起動
   ========================================================================= */
(function init() {
  const ui = loadUI();
  applyTheme(ui.theme || 'auto');
  DATA = loadData();
  DATA.employees.forEach(normalizeEmployee);
  CUR = DATA.employees[0] ? DATA.employees[0].id : null;
  TAB = DATA.employees.length > 1 ? 'list' : 'home';
  setTab(TAB);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
