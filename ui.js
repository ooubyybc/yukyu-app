/* =========================================================================
   有給管理 - UI
   ========================================================================= */
'use strict';

const APP_VERSION = 'v17';

const KEY = 'yukyu-app-v1';
const KEY_UI = 'yukyu-app-ui';

/* ---------- 状態 ---------- */
let DATA = null;
let CUR = null;   // 従業員ID
let TAB = 'home';
let LEAVE_DAYS = 1;    // 追加フォームの日数
let LEAVE_DATE = null; // 追加フォームの取得日 (yyyy-mm-dd)
let LEAVE_NOTE = '';   // 追加フォームのメモ（再描画しても消えないように保持）
let SORT = 'urgent';   // 一覧の並び順
let LEAVE_MODE = 'single'; // 記録タブ: 'single'=1日ずつ / 'bulk'=月ごとにまとめて
let WORK_YEAR = null;      // 出勤タブで表示中の年
let BULK_YEAR = null;      // 記録タブ（月ごとにまとめて）で表示中の年
let LEAVE_HALF = 'am';     // 半日：'am'=午前 / 'pm'=午後
let LEAVE_HOURS = 1;       // 時間単位の時間数
let LEAVE_PLAN = false;    // 計画年休（会社が時季を指定した日）
let LEAVE_UNIT = 'day';    // 'day' / 'half' / 'hour' / 'custom'
let LEAVE_Q = '';          // 記録の検索語
let SEARCH = '';           // ダッシュボードの検索語
let SHOW_RETIRED = false;  // 退職者も表示
let CAL_MONTH = null;      // カレンダーで表示中の月（Date の1日）

/* ---------- 保存 / 読み込み ---------- */
function loadData() {
  try {
    const raw = localStorage.getItem(keyData());
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.employees)) return d;
    }
  } catch (e) { /* 非対応環境 */ }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}
/**
 * 保存。label は操作の履歴に残す名前（省略すると変わった内容から決める）。
 * 保存のたびに「何が変わったか」を前回の保存と比べて履歴に残す（ui-data.js）。
 */
function saveData(label) {
  try { localStorage.setItem(keyData(), JSON.stringify(DATA)); }
  catch (e) { toast('この環境では保存できません（空き容量が足りない可能性があります）'); return; }
  if (typeof afterSave === 'function') afterSave(label);
}
/** 会社の設定（未設定なら法定どおり） */
function settings() {
  if (!DATA) return normSettings(null);
  if (!isObj(DATA.settings)) DATA.settings = {};
  return normSettings(DATA.settings);
}
const sim = (e, d) => simulate(e, d || today(), settings());
const reg = (e, d) => buildRegister(e, d || today(), settings());
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
const fmtD = (v) => {
  const x = Number(v);
  if (Number.isInteger(x)) return String(x);
  if (Math.abs(x * 2 - Math.round(x * 2)) < 1e-6) return x.toFixed(1);
  return String(Math.round(x * 100) / 100);
};
/**
 * 日数を「数字と単位」の組に分ける。半日単位まではそのまま [[13.5,'日']]、
 * 時間単位の端数があるときは [[13,'日'],[6,'時間']]（1日の時間数は従業員ごと）
 */
function dhParts(v, emp) {
  let x = nd(Number(v) || 0);
  const neg = x < 0;
  if (neg) x = -x;
  const sign = neg ? '-' : '';
  if (Math.abs(x * 2 - Math.round(x * 2)) < 1e-6) return [[sign + fmtD(Math.round(x * 2) / 2), '日']];
  const hpd = hpdOf(emp);
  let d = Math.floor(x + 1e-9);
  let h = Math.round((x - d) * hpd * 100) / 100;
  if (h >= hpd) { d += 1; h = 0; }
  return h > 0 ? [[sign + d, '日'], [fmtD(h), '時間']] : [[sign + d, '日']];
}
/**
 * 日数の表示。半日単位まではそのまま「13.5日」、時間単位の端数があるときは「13日6時間」。
 * html=true なら数字と単位を分けた HTML（単位は <small>）
 */
function dh(v, emp, html) {
  return dhParts(v, emp).map(([n, u]) => html ? `${n}<small>${u}</small>` : `${n}${u}`).join('');
}
/** 数字は <b>、単位は <i> の HTML（残日数の帯・一覧用）。時間の数字には class="h" */
function dhBI(v, emp) {
  return dhParts(v, emp).map(([n, u], i) => `<b${i ? ' class="h"' : ''}>${n}</b><i>${u}</i>`).join('');
}
/** 記録1件の量の表示（「1日」「午前半休」「2時間」など） */
function leaveAmount(l, emp) {
  if (l.unit === 'hour') return `${fmtD(Number(l.hours))}時間`;
  const d = Number(l.days);
  if (d === 0.5 && (l.half === 'am' || l.half === 'pm')) return l.half === 'am' ? '午前半休' : '午後半休';
  return `${fmtD(d)}日`;
}
const uid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

let toastTimer = null;
/**
 * 画面下の小さなお知らせ。
 * opts.action / opts.onAction を渡すと「元に戻す」などのボタンを付ける。
 */
function toast(msg, opts) {
  const o = opts || {};
  const t = $('#toast');
  t.textContent = '';
  const s = document.createElement('span');
  s.className = 'tmsg';
  s.textContent = msg;
  t.appendChild(s);
  t.classList.toggle('has-act', !!o.action);
  if (o.action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tact';
    b.textContent = o.action;
    b.addEventListener('click', () => {
      t.classList.remove('on');
      clearTimeout(toastTimer);
      if (o.onAction) o.onAction();
    });
    t.appendChild(b);
  }
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), o.duration || (o.action ? 6000 : 2600));
}

/* ---------- 確認ダイアログ（ブラウザ標準の confirm/prompt/alert の代わり） ---------- */
/**
 * @param {object} o { title, message, ok, cancel, danger, input:{value,min,max,step,suffix} }
 * @returns {Promise<boolean|number|null>} input 指定時は数値（キャンセルは null）、それ以外は true/false
 */
function askDialog(o) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'dlg-ov';
    const hasInput = !!o.input;
    ov.innerHTML = `<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlgT">
      <h3 id="dlgT">${esc(o.title || '')}</h3>
      ${o.message ? `<p>${esc(o.message)}</p>` : ''}
      ${hasInput ? `<div class="dlg-in"><input type="number" inputmode="numeric" data-dlg-in
          min="${o.input.min ?? 0}" max="${o.input.max ?? 31}" step="${o.input.step ?? 1}" value="${esc(o.input.value ?? '')}">
          ${o.input.suffix ? `<span>${esc(o.input.suffix)}</span>` : ''}</div>
          <p class="dlg-err" data-dlg-err></p>` : ''}
      <div class="acts">
        ${o.cancel === false ? '' : `<button type="button" class="btn" data-dlg="cancel">${esc(o.cancel || 'キャンセル')}</button>`}
        <button type="button" class="btn ${o.danger ? 'danger-solid' : 'primary'}" data-dlg="ok">${esc(o.ok || 'OK')}</button>
      </div>
    </div>`;
    const prevFocus = document.activeElement;
    document.body.appendChild(ov);
    document.body.classList.add('modal-open');
    const inp = ov.querySelector('[data-dlg-in]');
    const done = (v) => {
      ov.remove();
      if (!document.querySelector('.dlg-ov, .dp-ov, .reg-ov')) document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onKey, true);
      try { if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true }); } catch (e) {}
      resolve(v);
    };
    const submit = () => {
      if (!hasInput) { done(true); return; }
      const n = numOrNull(inp.value, Infinity);
      if (n == null || n < Number(o.input.min ?? 0) || n > Number(o.input.max ?? 31)) {
        ov.querySelector('[data-dlg-err]').textContent = `${o.input.min ?? 0}〜${o.input.max ?? 31}の数字を入れてください`;
        inp.focus();
        return;
      }
      done(n);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(hasInput ? null : false); }
      if (e.key === 'Enter' && hasInput && e.target === inp) { e.preventDefault(); submit(); }
    };
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('click', (e) => {
      if (e.target === ov) { done(hasInput ? null : false); return; }
      const b = e.target.closest('[data-dlg]');
      if (!b) return;
      if (b.dataset.dlg === 'ok') submit();
      else done(hasInput ? null : false);
    });
    setTimeout(() => {
      if (inp) { inp.focus(); try { inp.select(); } catch (e) {} return; }
      // 消す操作では、うっかり Enter で実行されないよう「キャンセル」にフォーカス
      const first = ov.querySelector(o.danger ? '[data-dlg="cancel"]' : '[data-dlg="ok"]') || ov.querySelector('[data-dlg]');
      if (first) first.focus({ preventScroll: true });
    }, 30);
  });
}

/** 新しい版が用意できたときの案内（自動では読み込み直さない） */
let updateBarShown = false;
function showUpdateBar() {
  if (updateBarShown) return;
  updateBarShown = true;
  const bar = document.createElement('div');
  bar.className = 'updbar';
  bar.innerHTML = `<span>新しい版があります</span>
    <button class="btn sm primary" data-upd="now">更新する</button>
    <button class="ico-btn" data-upd="later" aria-label="閉じる">✕</button>`;
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-upd]');
    if (!b) return;
    if (b.dataset.upd === 'now') location.reload();
    else { bar.remove(); updateBarShown = false; }
  });
  document.body.appendChild(bar);
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

/** 記録の短い表示名（月まとめは年月だけ） */
function leaveLabel(l) {
  const d = parseYmd(l.date);
  return l.bulk ? `${d.getFullYear()}年${d.getMonth() + 1}月（月まとめ）` : fmtJpShort(d);
}
/** 今日の時点で「予定」扱いか。月まとめは来月以降の分だけが予定（今月分は取得済み扱い） */
function isPlannedLeave(l, now) {
  const tk = ymd(now);
  return isBulk(l) ? l.date.slice(0, 7) > tk.slice(0, 7) : l.date > tk;
}

/** その月の月まとめ記録 */
function findBulk(emp, ym) {
  return (emp.leaves || []).find((l) => isBulk(l) && l.date.slice(0, 7) === ym) || null;
}
/** その月の個別（日付指定）記録の合計 */
function singleSum(emp, ym) {
  return nd((emp.leaves || [])
    .filter((l) => !isBulk(l) && isYmd(l.date) && l.date.slice(0, 7) === ym)
    .reduce((s, l) => s + leaveDaysOf(emp, l), 0));
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
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const STR_FIELDS = { name: 40, empNo: 20, store: 30, dept: 30, empType: 20 };
function normalizeEmployee(e) {
  if (!isObj(e.workdays)) e.workdays = {};
  if (!Array.isArray(e.leaves)) e.leaves = [];
  if (!isObj(e.grantOverrides)) e.grantOverrides = {};
  for (const [k, max] of Object.entries(STR_FIELDS)) {
    if (e[k] == null) { if (k === 'name') e.name = ''; continue; }
    e[k] = String(e[k]).slice(0, max);
  }
  // v17 で増えた項目（無ければ付けない＝古いデータのまま動く）
  if (e.retireDate != null && !isYmd(e.retireDate)) delete e.retireDate;
  if (e.basis != null && e.basis !== 'contract' && e.basis !== 'actual') delete e.basis;
  if (e.contracts != null) {
    e.contracts = Array.isArray(e.contracts) ? e.contracts.filter((c) => isObj(c) && isYmd(c.from)).map((c) => ({
      id: c.id || uid(), from: c.from,
      weekly: Math.min(5, Math.max(1, Math.round(Number(c.weekly)) || 5)),
      annual: Number(c.annual) > 0 && Number(c.annual) <= 366 ? Math.round(Number(c.annual)) : null,
      hours30: c.hours30 === true,
    })) : [];
  }
  if (e.absences != null) {
    e.absences = Array.isArray(e.absences) ? e.absences.filter((a) => isObj(a) && isYmd(a.from) && isYmd(a.to) && a.from <= a.to)
      .map((a) => ({ id: a.id || uid(), kind: ABSENCE_KINDS[a.kind] ? a.kind : 'other', from: a.from, to: a.to, note: String(a.note || '').slice(0, 60) })) : [];
  }
  if (e.schedDays != null && !isObj(e.schedDays)) e.schedDays = {};
  if (e.over30h != null) e.over30h = e.over30h === true;
  if (e.hoursPerDay != null && !(Number(e.hoursPerDay) >= 1 && Number(e.hoursPerDay) <= 24)) delete e.hoursPerDay;
  if (e.workPattern != null) {
    const wp = isObj(e.workPattern) ? e.workPattern : {};
    e.workPattern = {
      dows: Array.isArray(wp.dows) ? [...new Set(wp.dows.map(Number).filter((n) => n >= 0 && n <= 6))].sort() : [1, 2, 3, 4, 5],
      holidaysOff: wp.holidaysOff !== false,
    };
  }
  if (e.opening != null && !(isObj(e.opening) && isYmd(e.opening.date))) delete e.opening;
  const ids = new Set();
  const bulkOf = {};
  e.leaves = e.leaves.filter((l) => {
    if (!isObj(l)) return false;                 // null などの壊れた記録
    if (!l.id || ids.has(String(l.id))) l.id = uid(); // ID の重複は削除時に巻き込むので振り直す
    if (l.unit === 'hour') {
      if (!(Number(l.hours) > 0)) return false;
      l.hours = Number(l.hours);
      delete l.days; delete l.half; l.bulk = false;
    } else if (l.unit != null) delete l.unit;
    if (l.half != null && l.half !== 'am' && l.half !== 'pm') delete l.half;
    if (l.plan != null) l.plan = l.plan === true;
    // 旧「Excelから移行（月単位）」の記録は月まとめ扱いにする
    if (l.bulk === undefined) {
      l.bulk = String(l.id).startsWith('seed-') || String(l.id).startsWith('bulk-')
        || /月単位/.test(l.note || '');
    }
    if (l.bulk && isYmd(l.date)) {
      const ym = l.date.slice(0, 7);
      l.id = bulkId(ym);
      // 同じ月の月まとめが2つある場合は1つにまとめる（合計は変わらない）
      if (bulkOf[ym]) {
        const a = Number(bulkOf[ym].days), b = Number(l.days);
        bulkOf[ym].days = nd((a > 0 ? a : 0) + (b > 0 ? b : 0));
        return false;
      }
      bulkOf[ym] = l;
    }
    ids.add(String(l.id));
    return true;
  });
}

/** データ全体の正規化（会社の設定を含む） */
function normalizeData(d) {
  if (!Array.isArray(d.employees)) d.employees = [];
  d.employees = d.employees.filter(isObj);
  const ids = new Set();
  d.employees.forEach((e) => {
    if (!e.id || ids.has(String(e.id))) e.id = uid();
    ids.add(String(e.id));
    normalizeEmployee(e);
  });
  if (!isObj(d.settings)) d.settings = {};
  if (d.settings.companyName != null) d.settings.companyName = String(d.settings.companyName).slice(0, 40);
  if (!d.version) d.version = 1;
  return d;
}
function companyName() {
  return DATA && isObj(DATA.settings) && DATA.settings.companyName ? DATA.settings.companyName : '';
}

/** 読み込むJSONの検査。致命的な問題は errors、計算に使えない記録は warnings */
function checkImport(d) {
  const errors = [], warnings = [];
  if (!isObj(d) || !Array.isArray(d.employees)) return { errors: ['有給管理のバックアップ形式ではありません'], warnings };
  d.employees.forEach((e, i) => {
    const who = `${i + 1}人目${e && e.name ? `（${String(e.name).slice(0, 20)}）` : ''}`;
    if (!isObj(e)) { errors.push(`${who}のデータが壊れています`); return; }
    if (!isYmd(e.hireDate)) errors.push(`${who}の入社日が正しくありません`);
    const bad = (Array.isArray(e.leaves) ? e.leaves : []).filter((l) => !isObj(l) || !isYmd(l.date) || !(leaveDaysOf(e, l) > 0)).length;
    if (bad) warnings.push(`${who}：日付か日数が正しくない記録 ${bad}件（計算には使われません）`);
  });
  return { errors, warnings };
}

/* ---------- 自動の控え（読み込み・消去の直前のデータを1つだけ残す） ---------- */
const KEY_PREV = 'yukyu-app-v1-prev';
function keepPrevious(reason) {
  try {
    if (!DATA || !DATA.employees || !DATA.employees.length) return;
    localStorage.setItem(keyPrev(), JSON.stringify({ savedAt: new Date().toISOString(), reason, data: DATA }));
  } catch (e) { /* 保存できない環境 */ }
}
function loadPrevious() {
  try {
    const p = JSON.parse(localStorage.getItem(keyPrev()) || 'null');
    return p && isObj(p.data) && Array.isArray(p.data.employees) ? p : null;
  } catch (e) { return null; }
}


/* ---------- 数値入力の共通処理 ----------
   矢印（スピナー）でも、キーボードで直接打ち込んでも同じように動くようにする。
   入力中は再描画しない。再描画は「欄から完全に離れたあと」だけ行い、
   こちらからフォーカスを動かすことは一切しない。 */
const NUMKEYS = ['wd', 'bulk', 'ov', 'sd'];
function numKeyOf(el) {
  if (!el || !el.dataset) return null;
  for (const k of NUMKEYS) if (el.dataset[k] != null) return k;
  return null;
}

/** 数字欄に入った値を 0〜max に丸める。空なら null */
function numOrNull(v, max) {
  const t = String(v).trim();
  if (t === '') return null;
  const n = Number(t.replace(/[０-９．]/g, (c) => '０１２３４５６７８９．'.indexOf(c) < 10
    ? String('０１２３４５６７８９'.indexOf(c)) : '.'));
  if (!isFinite(n) || n < 0) return null;
  return Math.min(n, max);
}

/** 月まとめ画面の合計表示だけを更新（打ちながらでも数字が追従する） */
function refreshBulkTotals() {
  const emp = currentEmp();
  if (!emp) return;
  $$('#p-leave [data-ysum]').forEach((el) => { el.textContent = fmtD(bulkYearStat(emp, el.dataset.ysum).sum); });
  $$('#p-leave [data-ytot]').forEach((el) => {
    const t = bulkYearStat(emp, el.dataset.ytot); el.textContent = t.cnt ? `${fmtD(t.sum)}日` : '—';
  });
  $$('#p-leave [data-ycnt]').forEach((el) => {
    const t = bulkYearStat(emp, el.dataset.ycnt); el.textContent = t.cnt ? `${t.cnt}/12` : '—';
  });
  // 年のボタンの「入力あり」の点
  $$('#p-leave .ychips [data-byear]').forEach((b) => {
    const has = bulkYearStat(emp, b.dataset.byear).cnt > 0;
    const dot = b.querySelector('.dot');
    if (has && !dot) b.insertAdjacentHTML('beforeend', '<i class="dot"></i>');
    if (!has && dot) dot.remove();
  });
  const g = $('#p-leave [data-gsum]');
  if (g) g.textContent = fmtD(nd(bulkYears(emp, today()).reduce((s, y) => s + bulkYearStat(emp, y).sum, 0)));
  refreshLive(); // 上部の「使える有給」もその場で更新
}

/** 年のボタンの列（スマホでは横スクロール）を、選んでいる年が見える位置へ動かす。ページ自体はスクロールしない */
function showSelectedChip(panel) {
  const row = panel && panel.querySelector('.ychips');
  const on = row && row.querySelector('button.on');
  if (!row || !on || row.scrollWidth <= row.clientWidth + 2) return;
  row.scrollLeft = Math.max(0, on.offsetLeft - row.offsetLeft - (row.clientWidth - on.offsetWidth) / 2);
}

/* =========================================================================
   CSV 出力
   ========================================================================= */
function toCSV(rows) {
  return rows.map((r) => r.map((c) => {
    let v = String(c == null ? '' : c);
    // Excel で数式として実行されないように（CSVインジェクション対策）
    if (typeof c === 'string' && /^[=+\-@\t\r]/.test(v)) v = "'" + v;
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

/* =========================================================================
   一覧（全従業員）
   ========================================================================= */
const MONO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="m8.8 15 2.2 2.1 4.3-4.3"/></svg>';

/** 従業員がまだいないときの案内 */
function welcomeHtml() {
  return `<div class="card welcome">
    <span class="mono" aria-hidden="true">${MONO_SVG}</span>
    <h3>はじめまして</h3>
    <p>まだ従業員が登録されていません。<br>新しく登録するか、バックアップから復元してください。</p>
    <button class="btn primary full" data-act="addemp">${ICON.plus}従業員を登録する</button>
    <button class="btn full" data-act="import">バックアップJSONを読み込む</button>
  </div>`;
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
  const v = isYmd(value) ? value : ymd(today());
  return `<div class="dfrow">
    <input type="date" id="df-${esc(key)}" data-dfi="${esc(key)}" value="${esc(v)}" min="1950-01-01" max="${today().getFullYear() + 5}-12-31">
    <button type="button" class="calbtn" data-df="${esc(key)}" aria-label="カレンダーから選ぶ" title="カレンダーから選ぶ">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="M7.6 13.6h2M7.6 17h2M11.5 13.6h2M11.5 17h2M15.4 13.6h1"/></svg>
    </button>
  </div>
  <div class="dfcap">${dateCaption(v)}</div>`;
}
function dateCaption(v) {
  if (!isYmd(v)) return '日付を最後まで入れてください';
  const d = parseYmd(v);
  return `${fmtJp(d)}（${WD[d.getDay()]}曜日）`;
}
/** 日付欄の下の「2026年11月5日（木曜日）」だけを書き換える（欄そのものは作り直さない） */
function updateDateCaption(input) {
  const row = input.closest('.dfrow');
  const cap = row && row.nextElementSibling;
  if (!cap || !cap.classList.contains('dfcap')) return;
  cap.textContent = dateCaption(input.value);
  cap.classList.toggle('bad', !isYmd(input.value));
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
  let sel = isYmd(value) ? parseYmd(value) : now;
  const minY = Math.min(o.minYear || now.getFullYear() - 60, sel.getFullYear());
  const maxY = Math.max(o.maxYear || now.getFullYear() + 5, sel.getFullYear());
  let view = new Date(sel.getFullYear(), sel.getMonth(), 1);

  const ov = document.createElement('div');
  ov.className = 'dp-ov';
  document.body.appendChild(ov);
  document.body.classList.add('modal-open');

  const close = () => {
    ov.remove();
    if (!document.querySelector('.dlg-ov, .reg-ov')) document.body.classList.remove('modal-open');
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
      e.stopPropagation(); // 画面全体の change 処理（日付欄など）に渡さない
      view = new Date(Number(sy.value), Number(sm.value), 1);
      draw();
    }
  });
}

/* =========================================================================
   取得記録
   ========================================================================= */
/** 記録タブ上部の残高表示（入力するとその場で更新される） */
function balStripHtml(r) {
  const ob = r.currentObligation;
  const emp = currentEmp();
  return `<div class="balstrip" aria-live="polite">
    <div class="bs-main"><span>使える有給</span><em data-live="bal">${dhBI(r.balance, emp)}</em></div>
    <div class="s"><span>予定を引くと</span><em data-live="plan">${dhBI(r.plannedBalance, emp)}</em></div>
    <div class="s"><span>年5日義務</span><em data-live="ob">${obStripHtml(ob)}</em></div>
  </div>`;
}
/** 年5日の取得状況（例「3/5」。按分で5日以外のときはその日数） */
function obStripHtml(ob) {
  if (!ob) return '<b>—</b>';
  return `<b>${fmtD(Math.min(ob.taken, ob.required))}</b><i>/${fmtD(ob.required)}</i>`;
}
function refreshLive() {
  const emp = currentEmp();
  if (!emp) return;
  const r = sim(emp, today());
  const set = (k, v) => {
    const el = $(`#p-leave [data-live="${k}"]`);
    if (!el || el.innerHTML === v) return;
    el.innerHTML = v;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  };
  set('bal', dhBI(r.balance, emp));
  set('plan', dhBI(r.plannedBalance, emp));
  set('ob', obStripHtml(r.currentObligation));
}

/* ---------- 月ごとにまとめて入力 ---------- */
/** その年の月まとめ＋個別記録の合計と、入力のある月の数 */
function bulkYearStat(emp, y) {
  let sum = 0, cnt = 0;
  for (let m = 1; m <= 12; m++) {
    const ym = `${y}-${pad2(m)}`;
    const b = findBulk(emp, ym);
    const v = (b ? Number(b.days) : 0) + singleSum(emp, ym);
    if (v > 0) { sum += v; cnt++; }
  }
  return { sum: nd(sum), cnt };
}
/** 月まとめで選べる年（新しい順）。今年から5年先まで＋「年を追加」で増やした分 */
function bulkYears(emp, now) {
  const curY = now.getFullYear();
  const hireY = isYmd(emp.hireDate) ? parseYmd(emp.hireDate).getFullYear() : curY;
  const dataYears = (emp.leaves || []).filter((l) => l && isYmd(l.date))
    .map((l) => Number(l.date.slice(0, 4))).filter((y) => y >= 1950 && y <= curY + 50);
  const extra = Math.max(0, Number(loadUI().bulkExtraYears) || 0);
  const maxY = Math.max(curY + 5 + extra, hireY, ...dataYears);
  const minY = Math.min(hireY, ...dataYears);
  const years = [];
  for (let y = maxY; y >= minY; y--) years.push(y);
  return years;
}

function leaveBulkHtml(emp, now, r) {
  const curY = now.getFullYear();
  const hire = isYmd(emp.hireDate) ? parseYmd(emp.hireDate) : now;
  const years = bulkYears(emp, now);
  if (BULK_YEAR == null || !years.includes(BULK_YEAR)) BULK_YEAR = years.includes(curY) ? curY : years[0];
  const Y = BULK_YEAR;
  const curYm = ymd(now).slice(0, 7);
  const firstGrant = r.lots[0] ? r.lots[0].date : null;
  const badMonths = new Set([...r.shortfalls, ...(r.plannedShortfalls || [])]
    .filter((s) => s.bulk).map((s) => s.date.slice(0, 7)));

  let html = `<div class="note info">${ICON.info}<div><div class="t">日付を覚えていない分はこちら</div>
    <div class="d">月ごとに「何日取ったか」を入れるだけで登録できます。<b>今月までの分は、入れた時点で残日数から引きます</b>（来月以降の分は「予定」として扱います）。<br>
    正確な日付が分かったら「1日ずつ入力」で入れ直してください。</div></div></div>`;

  /* ---- 年を選ぶ ---- */
  html += `<div class="ychips">
    <button data-act="morebulkyears" class="add" title="さらに先の年を追加">＋ 年を追加</button>
    ${years.map((y) => {
      const cls = [y === Y ? 'on' : '', y > curY ? 'fut' : ''].filter(Boolean).join(' ');
      return `<button data-byear="${y}" class="${cls}">${y}年${bulkYearStat(emp, y).cnt ? '<i class="dot"></i>' : ''}</button>`;
    }).join('')}
  </div>`;

  /* ---- 選んだ年のマス ---- */
  let cells = '';
  for (let m = 1; m <= 12; m++) {
    const ym = `${Y}-${pad2(m)}`;
    const b = findBulk(emp, ym);
    const sng = singleSum(emp, ym);
    const pre = firstGrant && new Date(Y, m, 0) < firstGrant; // その月がまるごと最初の付与日より前
    const beforeHire = new Date(Y, m, 0) < hire;              // その月がまるごと入社前
    const cls = [ym === curYm ? 'cur' : '', ym > curYm ? 'fut' : '', pre ? 'pre' : '', badMonths.has(ym) ? 'bad' : '']
      .filter(Boolean).join(' ');
    const tag = sng > 0 ? `<em class="sng">個別+${fmtD(sng)}</em>`
      : badMonths.has(ym) ? '<em class="bad">不足</em>'
      : beforeHire ? '<em class="pre">入社前</em>'
      : pre ? '<em class="pre">付与前</em>'
      : ym === curYm ? '<em class="sng">今月</em>' : '';
    cells += `<div class="m ${cls}"><span>${m}月</span>
      <input type="number" inputmode="decimal" step="0.5" min="0" max="31" placeholder="—"
        value="${b ? fmtD(Number(b.days)) : ''}" data-bulk="${ym}" aria-label="${Y}年${m}月に取った日数"${ym > curYm ? ' title="来月以降の分は予定として扱います"' : ''}>
      ${tag}</div>`;
  }
  html += `<div class="card"><div class="yhead"><b>${Y}年</b>${Y > curY ? '<span class="pill acc">予定</span>' : ''}
      <span class="sub">合計 <b class="num" data-ysum="${Y}">${fmtD(bulkYearStat(emp, Y).sum)}</b>日</span></div>
      <div class="mg">${cells}</div></div>`;
  html += `<p class="sub" style="margin:-2px 2px 0">「個別+◯」は、その月に1日ずつ入力した記録の分です（上の数字とは別に加算）。「付与前」の月は、まだ有給がない期間のため残日数から引かれません。</p>`;

  /* ---- 年ごとの一覧 ---- */
  const stats = new Map(years.map((y) => [y, bulkYearStat(emp, y)]));
  const grand = nd([...stats.values()].reduce((s, t) => s + t.sum, 0));
  const listYears = years.filter((y) => stats.get(y).cnt || y === Y || y === curY);
  html += `<h2 class="sec">年ごとの取得日数（総計 <span class="num" data-gsum>${fmtD(grand)}</span>日）</h2><div class="card"><div class="tw"><table>
    <thead><tr><th>年</th><th>入力した月</th><th>合計</th><th></th></tr></thead><tbody>`;
  for (const y of listYears) {
    const t = stats.get(y);
    html += `<tr class="${y === Y ? 'now' : t.cnt ? '' : 'dim'}">
      <td>${y}年${y > curY ? ' <span class="pill acc">予定</span>' : ''}</td>
      <td class="num" data-ycnt="${y}">${t.cnt ? `${t.cnt}/12` : '—'}</td>
      <td class="num" data-ytot="${y}">${t.cnt ? `${fmtD(t.sum)}日` : '—'}</td>
      <td><button class="btn sm" data-byear="${y}">開く</button></td></tr>`;
  }
  html += `</tbody></table></div>
    <p class="sub" style="margin-top:10px">入力のある年と今年だけを表示しています。ほかの年は上の年のボタンから開いてください。</p></div>`;
  return html;
}

function grantTableHelp() {
  let rows = '';
  for (const r of GRANT_TABLE) {
    rows += `<tr><td style="white-space:normal">${esc(r.label)}</td>${r.days.map((d) => `<td class="num">${d}</td>`).join('')}</tr>`;
  }
  return `<details class="help"><summary>法定の付与日数表（労働基準法 第39条）</summary><div class="body">
    <div class="tw"><table><thead><tr><th>勤務区分</th><th>0.5年</th><th>1.5</th><th>2.5</th><th>3.5</th><th>4.5</th><th>5.5</th><th>6.5〜</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p style="margin:10px 0 0">※ 週30時間以上働く人は、勤務日数にかかわらず最上段（通常の付与）です（従業員の設定で指定）。出勤率8割未満の年は付与されません（設定の「付与のルール」で判定をオンにできます）。</p>
  </div></details>`;
}

function prevLabel(p) {
  const d = new Date(p.savedAt);
  const when = isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${when} ${p.reason || ''}の前`.trim();
}

/* =========================================================================
   描画 / タブ
   ========================================================================= */
/** 従業員の選択欄（在籍者を先に、退職者は後ろにまとめる） */
function renderEmpSelect() {
  const s = $('#empSelect');
  const now = today();
  const act = [], ret = [];
  for (const e of DATA.employees) (isRetired(e, now) ? ret : act).push(e);
  const opt = (e) => `<option value="${esc(e.id)}" ${e.id === CUR ? 'selected' : ''}>${esc(e.name || '(名称未設定)')}${e.empNo ? `（${esc(e.empNo)}）` : ''}</option>`;
  s.innerHTML = act.map(opt).join('') + (ret.length ? `<optgroup label="退職者">${ret.map(opt).join('')}</optgroup>` : '');
  const perEmp = TAB === 'home' || TAB === 'leave' || TAB === 'work';
  $('#empPick').style.display = perEmp && DATA.employees.length ? '' : 'none';
}
function isRetired(e, now) {
  return isYmd(e.retireDate) && parseYmd(e.retireDate) < (now || today());
}
const PAGES = {
  list: 'ダッシュボード', home: '個人', leave: '取得の記録', work: '出勤日数',
  cal: 'カレンダー', docs: '帳票・出力', set: '設定', menu: 'メニュー',
};
function renderPageTitle() {
  const now = today();
  const t = $('#pgTitle');
  if (t) t.innerHTML = `<small>${fmtJp(now)}（${WD[now.getDay()]}）</small><b>${esc(PAGES[TAB] || '')}</b>`;
  const co = $('#coName');
  if (co) co.textContent = companyName() || '（会社名 未設定）';
  if (typeof renderSideFoot === 'function') renderSideFoot();
}
function render() {
  renderEmpSelect();
  renderPageTitle();
  const main = $('main');
  if (main) main.classList.toggle('narrow', TAB === 'home' || TAB === 'leave' || TAB === 'work' || TAB === 'set');
  if (TAB === 'list') renderList();
  if (TAB === 'home') renderHome();
  if (TAB === 'leave') renderLeave();
  if (TAB === 'work') renderWork();
  if (TAB === 'cal') renderCal();
  if (TAB === 'docs') renderDocs();
  if (TAB === 'set') renderSet();
  if (TAB === 'menu') renderMenu();
}
function setTab(t) {
  if (!PAGES[t]) t = 'list';
  TAB = t;
  $$('.panel').forEach((p) => p.classList.toggle('on', p.id === 'p-' + t));
  const tabOf = (x) => (x === 'cal' || x === 'docs' || x === 'set' ? 'menu' : x);
  $$('nav.tabbar [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tabOf(t)));
  $$('.side [data-tab]').forEach((b) => {
    const on = b.dataset.tab === t;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  render();
  window.scrollTo({ top: 0 });
}
const THEME_COLOR = { light: '#f7f5f0', dark: '#0e1526' };
function applyTheme(v) {
  if (v === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', v);
  // ステータスバーの色も合わせる（自動のときは端末の設定に任せる）
  const metas = $$('meta[name="theme-color"]');
  metas.forEach((m) => {
    if (!m.dataset.orig) m.dataset.orig = m.getAttribute('content');
    m.setAttribute('content', v === 'auto' ? m.dataset.orig : THEME_COLOR[v]);
  });
}

/* =========================================================================
   イベント
   ========================================================================= */
/* ---- 日付欄への直接入力 ----
   打っている途中で画面を作り直すとカーソルが消えて続きを打てなくなるので、ここでは作り直さない。
   値を覚えて、欄の下の「◯年◯月◯日（◯曜日）」だけを書き換える。 */
let HIRE_DIRTY = false; // 入社日を変えた → 欄から離れたら設定画面を作り直す
function hireDateOk(v) {
  return isYmd(v) && Number(v.slice(0, 4)) >= 1950 && parseYmd(v) <= addMonths(today(), 12);
}
function onDateInput(t) {
  const key = t.dataset.dfi;
  const v = t.value;
  updateDateCaption(t);
  if (key === 'lvDate') { if (isYmd(v)) LEAVE_DATE = v; if (typeof onLeaveDateTyped === 'function') onLeaveDateTyped(v); return; }
  if (typeof onDateInputExt === 'function' && onDateInputExt(key, v, t)) return;
  if (key.startsWith('hire:')) {
    const e = DATA.employees.find((x) => x.id === key.slice(5));
    if (!e) return;
    if (isYmd(v) && !hireDateOk(v)) {
      const cap = t.closest('.dfrow').nextElementSibling;
      if (cap) { cap.textContent = '入社日として使えない日付です（1950年〜来年まで）'; cap.classList.add('bad'); }
      return;
    }
    if (!isYmd(v) || e.hireDate === v) return;
    e.hireDate = v; saveData('入社日を変更'); HIRE_DIRTY = true;
  }
}
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.dataset && t.dataset.dfi) onDateInput(t);
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
    const marks = new Set((emp && emp.leaves ? emp.leaves : []).filter((l) => !isBulk(l)).map((l) => l.date));
    const inp = $('#df-lvDate');
    const cur = inp && isYmd(inp.value) ? inp.value : (LEAVE_DATE || ymd(now));
    openDatePicker(cur, { marks, minYear: now.getFullYear() - 10, maxYear: now.getFullYear() + 3 },
      (picked) => { LEAVE_DATE = picked; renderLeave(); });
    return;
  }

  if (typeof openDateExt === 'function' && openDateExt(key)) return;
  if (key.startsWith('hire:')) {
    const id = key.slice(5);
    const e = DATA.employees.find((x) => x.id === id);
    if (!e) return;
    openDatePicker(e.hireDate, { minYear: Math.max(1950, now.getFullYear() - 50), maxYear: now.getFullYear() + 1 },
      (picked) => {
        if (!hireDateOk(picked)) { toast('入社日として使えない日付です'); return; }
        e.hireDate = picked; saveData('入社日を変更'); HIRE_DIRTY = false; renderSet(); toast('入社日を更新しました');
      });
  }
});

/* ---- 記録の削除（元に戻せる） ---- */
function deleteLeave(emp, id) {
  const idx = (emp.leaves || []).findIndex((l) => l.id === id);
  if (idx < 0) return;
  const [removed] = emp.leaves.splice(idx, 1);
  saveData(); renderLeave();
  const empId = emp.id;
  toast(`${leaveLabel(removed)}の記録を削除しました`, {
    action: '元に戻す',
    onAction: () => {
      const e2 = DATA.employees.find((x) => x.id === empId);
      if (!e2) return;
      if (isBulk(removed) && findBulk(e2, removed.date.slice(0, 7))) { toast('その月はすでに入力があるため戻せませんでした'); return; }
      if ((e2.leaves || []).some((l) => l.id === removed.id)) return;
      e2.leaves.push(removed);
      e2.leaves.sort((a, b) => a.date.localeCompare(b.date));
      saveData(); render(); toast('元に戻しました');
    },
  });
}

/* ---- 読み込み（いまのデータは控えに残してから置き換える） ---- */
async function importText(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) {
    await askDialog({ title: '読み込めませんでした', message: 'JSONファイルとして読めませんでした。書き出したファイルを選んでください。', ok: '閉じる', cancel: false });
    return;
  }
  if (IO.isEncrypted(d)) {
    const plain = await askPasswordAndDecrypt(d);
    if (plain == null) return;
    return importText(plain);
  }
  const chk = checkImport(d);
  if (chk.errors.length) {
    await askDialog({ title: '読み込めませんでした', message: chk.errors.slice(0, 5).join('\n'), ok: '閉じる', cancel: false });
    return;
  }
  const n = d.employees.length;
  if (!DATA.employees.length && !chk.warnings.length) {
    // いまデータが無いときは、確認なしでそのまま読み込む（消えるものが無いため）
    applyImport(d);
    return;
  }
  const msgs = [];
  if (DATA.employees.length) msgs.push(`いまのデータ（${DATA.employees.length}人分）は、読み込むデータ（${n}人分）に置き換わります。\nいまのデータは控えとして1つ残るので、設定の「直前のデータに戻す」で元に戻せます。`);
  else msgs.push(`${n}人分のデータを読み込みます。`);
  if (chk.warnings.length) msgs.push('', ...chk.warnings.slice(0, 4));
  const ok = await askDialog({ title: 'データを読み込みますか？', message: msgs.join('\n'), ok: '読み込む' });
  if (!ok) return;
  applyImport(d);
}
function applyImport(d) {
  keepPrevious('読み込み');
  const keepName = companyName();
  DATA = d;
  normalizeData(DATA);
  if (!DATA.settings.companyName && keepName) DATA.settings.companyName = keepName;
  CUR = DATA.employees[0] ? DATA.employees[0].id : null;
  saveData('バックアップを読み込み');
  setTab(DATA.employees.length > 1 ? 'list' : 'home');
  toast(`${DATA.employees.length}人分を読み込みました`);
}

document.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('[data-act],[data-tab],[data-theme],[data-sort],[data-open],[data-lmode],[data-wyear],[data-byear],[data-opendays]');
  if (!btn) return;

  if (btn.dataset.tab) { setTab(btn.dataset.tab); return; }

  if (btn.dataset.sort) { SORT = btn.dataset.sort; renderList(); return; }

  if (btn.dataset.lmode) {
    LEAVE_MODE = btn.dataset.lmode;
    const ui = loadUI(); ui.leaveMode = LEAVE_MODE; saveUI(ui);
    renderLeave(); return;
  }

  if (btn.dataset.opendays) {
    CUR = btn.dataset.opendays;
    WORK_YEAR = null;
    setTab('work');
    return;
  }

  if (btn.dataset.wyear) {
    WORK_YEAR = Number(btn.dataset.wyear);
    if (TAB !== 'work') setTab('work'); else { renderWork(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    return;
  }

  if (btn.dataset.byear) {
    BULK_YEAR = Number(btn.dataset.byear);
    const fromList = !!btn.closest('table');
    renderLeave();
    if (fromList) window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (btn.dataset.open) { CUR = btn.dataset.open; setTab('home'); return; }

  if (btn.dataset.theme) {
    const ui = loadUI(); ui.theme = btn.dataset.theme; saveUI(ui);
    applyTheme(ui.theme); render(); return;
  }

  const act = btn.dataset.act;
  const emp = currentEmp();

  if (act === 'goset') { setTab('set'); return; }

  if (act === 'reg1') { if (emp) openRegister([emp], `${emp.name} の管理簿`); return; }
  if (act === 'regall') {
    if (!DATA.employees.length) { toast('従業員が登録されていません'); return; }
    openRegister(DATA.employees, '年次有給休暇管理簿（全員）'); return;
  }
  if (act === 'regcsv') {
    if (window.__PREVIEW__) { toast('CSV保存はGitHub Pages版で使えます'); return; }
    downloadText(`年次有給休暇管理簿_${ymd(today())}.csv`, toCSV(registerRows(DATA.employees)));
    toast('CSVを保存しました'); return;
  }

  if (act === 'addleave') { if (emp) await addLeave(emp); return; }

  if (act === 'dellv') { if (emp) deleteLeave(emp, btn.dataset.id); return; }

  if (act === 'fillyear') {
    const y = WORK_YEAR;
    const n = await askDialog({
      title: `${y}年の12ヶ月に同じ日数を入れる`,
      message: '空いている月も入力済みの月も、すべてこの日数になります。',
      input: { value: 21, min: 0, max: 31, step: 1, suffix: '日' }, ok: '入れる',
    });
    if (n == null) return;
    const wmap = workMap(emp);
    for (let m = 1; m <= 12; m++) wmap[`${y}-${pad2(m)}`] = Math.round(n);
    saveData(); renderWork(); toast(`${y}年を${Math.round(n)}日で埋めました`); return;
  }

  if (act === 'morebulkyears') {
    const ui = loadUI();
    ui.bulkExtraYears = Math.min(30, (Number(ui.bulkExtraYears) || 0) + 5);
    saveUI(ui);
    renderLeave();
    toast(`${today().getFullYear() + 5 + ui.bulkExtraYears}年まで入力できます`);
    return;
  }

  if (act === 'moreyears') {
    const ui = loadUI();
    ui.workExtraYears = Math.min(30, (Number(ui.workExtraYears) || 0) + 5);
    saveUI(ui);
    renderWork();
    toast(`${today().getFullYear() + 5 + ui.workExtraYears}年まで入力できます`);
    return;
  }

  if (act === 'copyprev') {
    const y = WORK_YEAR, src = y - 1;
    let filled = 0;
    const wmap = workMap(emp);
    for (let m = 1; m <= 12; m++) {
      const from = wmap[`${src}-${pad2(m)}`];
      const to = `${y}-${pad2(m)}`;
      if (typeof from === 'number' && typeof wmap[to] !== 'number') {
        wmap[to] = from; filled++;
      }
    }
    saveData(); renderWork();
    toast(filled ? `${src}年から${filled}ヶ月分を写しました（空欄のみ）` : '空いている月がありません');
    return;
  }

  if (act === 'clearyear') {
    const y = WORK_YEAR;
    const ok = await askDialog({ title: `${y}年の${WORK_MODE === 'sched' ? '所定労働日数' : '出勤日数'}を消しますか？`, message: `${y}年の12ヶ月分の入力をすべて消します。`, ok: '消す', danger: true });
    if (!ok) return;
    const before = {};
    const wmap = workMap(emp);
    for (let m = 1; m <= 12; m++) {
      const k = `${y}-${pad2(m)}`;
      if (typeof wmap[k] === 'number') before[k] = wmap[k];
      delete wmap[k];
    }
    saveData(); renderWork();
    const empId = emp.id;
    toast(`${y}年を消しました`, {
      action: '元に戻す',
      onAction: () => {
        const e2 = DATA.employees.find((x) => x.id === empId);
        if (!e2) return;
        const w2 = WORK_MODE === 'sched' ? (e2.schedDays = isObj(e2.schedDays) ? e2.schedDays : {}) : e2.workdays;
        Object.keys(before).forEach((k) => { if (typeof w2[k] !== 'number') w2[k] = before[k]; });
        saveData(); render(); toast('元に戻しました');
      },
    });
    return;
  }

  if (act === 'addemp') {
    const e = {
      id: uid(), name: `新しい従業員${DATA.employees.length + 1}`, empNo: '',
      hireDate: ymd(today()), weeklyDays: 5, workdays: {}, leaves: [], grantOverrides: {},
    };
    DATA.employees.push(e); CUR = e.id; saveData('従業員を追加');
    OPEN_EMP = e.id;
    setTab('set'); toast('氏名と入社日を入力してください');
    const card = document.querySelector(`.emp-ed[data-emp="${CSS.escape(e.id)}"]`);
    if (card) card.scrollIntoView({ block: 'center' });
    return;
  }

  if (act === 'delemp') {
    const e = DATA.employees.find((x) => x.id === btn.dataset.id);
    if (!e) return;
    const ok = await askDialog({
      title: `「${e.name || '(名称未設定)'}」を削除しますか？`,
      message: 'この従業員の出勤日数・取得記録もすべて削除されます。\n削除の直前のデータは控えとして1つ残ります（設定の「直前のデータに戻す」）。',
      ok: '削除する', danger: true,
    });
    if (!ok) return;
    keepPrevious(`「${e.name}」の削除`);
    DATA.employees = DATA.employees.filter((x) => x.id !== e.id);
    if (CUR === e.id) CUR = DATA.employees[0] ? DATA.employees[0].id : null;
    saveData(); render(); toast(`「${e.name}」を削除しました`); return;
  }

  if (act === 'export') { await exportData(); return; }

  if (act === 'import') { $('#fileIn').click(); return; }

  if (act === 'restoreprev') {
    const p = loadPrevious();
    if (!p) { toast('戻せるデータがありません'); render(); return; }
    const ok = await askDialog({
      title: '直前のデータに戻しますか？',
      message: `${prevLabel(p)}のデータ（${p.data.employees.length}人分）に戻します。\nいまのデータは、入れ替わりで控えに残ります。`,
      ok: '戻す',
    });
    if (!ok) return;
    const cur = DATA;
    DATA = p.data;
    normalizeData(DATA);
    try {
      localStorage.setItem(keyPrev(), JSON.stringify({ savedAt: new Date().toISOString(), reason: '戻す操作', data: cur }));
    } catch (e) {}
    CUR = DATA.employees[0] ? DATA.employees[0].id : null;
    saveData('直前のデータに戻す'); render(); toast('直前のデータに戻しました'); return;
  }

  if (act === 'update') {
    if (window.__PREVIEW__) { toast('プレビュー版です（GitHub Pages版で使えます）'); return; }
    if (!('serviceWorker' in navigator)) { location.reload(); return; }
    toast('確認しています…');
    navigator.serviceWorker.getRegistration()
      .then((reg) => (reg ? reg.update().then(() => reg) : null))
      .then((reg) => {
        if (reg && (reg.waiting || reg.installing)) {
          (reg.waiting || reg.installing).postMessage('skip-waiting');
          setTimeout(() => location.reload(), 600);
        } else {
          toast('すでに最新です');
          setTimeout(() => location.reload(), 900);
        }
      })
      .catch(() => location.reload());
    return;
  }

  if (act === 'reset') {
    const ok = await askDialog({
      title: 'この会社のデータを消去しますか？',
      message: `この端末に保存した「${companyName() || 'この会社'}」の全員分のデータを消します（会社の設定は残します）。\n消す直前のデータは控えとして1つ残ります（設定の「直前のデータに戻す」）。念のため先に「書き出し」でバックアップを取っておくと安心です。`,
      ok: '消去する', danger: true,
    });
    if (!ok) return;
    keepPrevious('消去');
    try { localStorage.removeItem(keyData()); } catch (e) {}
    const keepSettings = DATA.settings;
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    if (keepSettings) DATA.settings = keepSettings;
    CUR = DATA.employees[0] ? DATA.employees[0].id : null;
    saveData('データを消去'); setTab('list'); toast('消去しました'); return;
  }
});

document.addEventListener('change', (ev) => {
  const t = ev.target;

  if (t.id === 'empSelect') { CUR = t.value; render(); return; }

  if (t.id === 'fileIn' && t.files && t.files[0]) {
    const f = t.files[0];
    t.value = '';
    if (f.size > 5 * 1024 * 1024) { toast('ファイルが大きすぎます（5MBまで）'); return; }
    const fr = new FileReader();
    fr.onload = () => { importText(String(fr.result)); };
    fr.onerror = () => toast('ファイルを読めませんでした');
    fr.readAsText(f);
    return;
  }

  const emp = currentEmp();
  if (!emp) return;

  if (t.dataset.bulk) {
    const n0 = numOrNull(t.value, 31);
    const n = n0 == null ? null : Math.round(n0 * 2) / 2;
    setBulk(emp, t.dataset.bulk, n == null ? 0 : n);
    t.value = n == null ? '' : fmtD(n);
    saveData(); refreshBulkTotals();
    return;
  }

  if (t.dataset.wd) {
    const n = numOrNull(t.value, 31);
    if (n == null) delete emp.workdays[t.dataset.wd];
    else emp.workdays[t.dataset.wd] = Math.round(n);
    t.value = n == null ? '' : String(Math.round(n));
    saveData(); refreshWorkTotals();
    return;
  }

  if (t.dataset.sd) {
    const n = numOrNull(t.value, 31);
    if (!isObj(emp.schedDays)) emp.schedDays = {};
    if (n == null) delete emp.schedDays[t.dataset.sd];
    else emp.schedDays[t.dataset.sd] = Math.round(n);
    t.value = n == null ? '' : String(Math.round(n));
    saveData('所定労働日数を変更'); refreshWorkTotals();
    return;
  }

  if (t.dataset.ov) {
    emp.grantOverrides = emp.grantOverrides || {};
    const n = numOrNull(t.value, 99);
    if (n == null) delete emp.grantOverrides[t.dataset.ov];
    else emp.grantOverrides[t.dataset.ov] = n;
    t.value = n == null ? '' : fmtD(n);
    saveData();
    toast(n == null ? '自動計算に戻しました' : '付与日数を更新しました');
    return;
  }

  if (t.dataset.ef) {
    const e = DATA.employees.find((x) => x.id === t.dataset.id);
    if (!e) return;
    const f = t.dataset.ef;
    if (f === 'weeklyDays') {
      const n = Number(t.value);
      if (!(n >= 1 && n <= 5)) return;
      e.weeklyDays = n;
    } else if (f === 'hoursPerDay') {
      const n = numOrNull(t.value, 24);
      if (n == null || n < 1) { t.value = hpdOf(e); toast('1〜24時間で入れてください'); return; }
      e.hoursPerDay = Math.ceil(n);
      t.value = e.hoursPerDay;
    } else if (f === 'over30h') {
      e.over30h = t.checked;
    } else if (f === 'basis') {
      e.basis = t.value === 'contract' ? 'contract' : 'actual';
      if (e.basis === 'contract' && !(Array.isArray(e.contracts) && e.contracts.length)) {
        e.contracts = [{ id: uid(), from: e.hireDate, weekly: Number(e.weeklyDays) || 5, annual: null, hours30: e.over30h === true }];
      }
    } else if (STR_FIELDS[f]) {
      e[f] = String(t.value).trim().slice(0, STR_FIELDS[f]);
    } else return;
    saveData(f === 'name' ? '氏名を変更' : '従業員の情報を変更');
    if (f === 'name') renderEmpSelect();
    if (f === 'weeklyDays' || f === 'basis' || f === 'over30h' || f === 'hoursPerDay') renderSet();
    else if (typeof refreshEmpSummary === 'function') refreshEmpSummary(e);
    return;
  }
});

/* 数字は打ちながら保存する（再描画しないのでフォーカスが外れない） */
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!t.dataset) return;

  // 1日ずつ入力フォームの値は覚えておく（日付を変えて画面が作り直されても消えない）
  if (t.id === 'lvDays') { const n = numOrNull(t.value, 999); if (n != null && n > 0) LEAVE_DAYS = n; return; }
  if (t.id === 'lvNote') { LEAVE_NOTE = t.value; return; }
  if (t.dataset.dfi) { onDateInput(t); return; }

  const emp = currentEmp();
  if (!emp) return;

  if (t.dataset.wd) {
    const n = numOrNull(t.value, 31);
    if (n == null) delete emp.workdays[t.dataset.wd];
    else emp.workdays[t.dataset.wd] = Math.round(n);
    saveData();
    refreshWorkTotals();
    return;
  }

  if (t.dataset.sd) {
    const n = numOrNull(t.value, 31);
    if (!isObj(emp.schedDays)) emp.schedDays = {};
    if (n == null) delete emp.schedDays[t.dataset.sd];
    else emp.schedDays[t.dataset.sd] = Math.round(n);
    saveData('所定労働日数を変更');
    refreshWorkTotals();
    return;
  }

  if (t.dataset.bulk) {
    const n0 = numOrNull(t.value, 31);
    const n = n0 == null ? null : Math.round(n0 * 2) / 2;
    setBulk(emp, t.dataset.bulk, n == null ? 0 : n);
    saveData();
    refreshBulkTotals();
    return;
  }
});

/* 数字欄に入った最初の1回だけ中身を選択する。
   そのまま打てば上書き、もう一度クリックすればカーソルを置ける。 */
let freshFocus = null;
const selectAll = (el) => { try { el.select(); } catch (e) {} };

document.addEventListener('focusin', (ev) => {
  const t = ev.target;
  if (t.tagName !== 'INPUT' || t.type !== 'number') return;
  freshFocus = t;
  // キーボード（Tab）で入ってきた場合はこの時点で選択される
  setTimeout(() => { if (freshFocus === t && document.activeElement === t) selectAll(t); }, 0);
});

// クリックの場合はブラウザがカーソルを置いたあとに選択し直す
document.addEventListener('click', (ev) => {
  const t = ev.target;
  if (t.tagName !== 'INPUT' || t.type !== 'number') return;
  if (freshFocus !== t) return;
  freshFocus = null;
  selectAll(t);
});

document.addEventListener('focusout', (ev) => {
  if (freshFocus === ev.target) freshFocus = null;
});

/** いま何かを入力できる状態か（作り直すとカーソルが消えてしまう相手） */
function isEditing(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/* 数字欄から離れたら、表示を作り直して判定結果などを更新する。
   ただし、利用者がどこかに入力中のときは絶対に作り直さない
   （作り直すと入力欄が置き換わってカーソルが消えるため）。 */
document.addEventListener('focusout', (ev) => {
  const t = ev.target;
  let kind = numKeyOf(t);
  if (!kind && t.dataset && t.dataset.dfi && /^(hire|retire|ctf):/.test(t.dataset.dfi)) kind = 'hire';
  if (!kind) return;
  setTimeout(() => {
    if (isEditing(document.activeElement)) return;   // どこかに入力中
    if (document.querySelector('.dp-ov, .reg-ov, .dlg-ov')) return; // カレンダー等が開いている
    if ((kind === 'wd' || kind === 'sd') && TAB === 'work') renderWork();
    else if (kind === 'bulk' && TAB === 'leave') renderLeave();
    else if (kind === 'ov' && TAB === 'set') renderSet();
    else if (kind === 'hire' && TAB === 'set') {
      // 入社日・退職日など：変えたら付与の判定などを更新。打ちかけの不正な日付は元に戻す
      const changed = HIRE_DIRTY;
      HIRE_DIRTY = false;
      renderSet();
      if (changed) toast(t.dataset.dfi.startsWith('hire:') ? '入社日を更新しました' : t.dataset.dfi.startsWith('retire:') ? '退職日を更新しました' : '更新しました');
    }
  }, 150);
});

/* 横に並んだものの上でマウスホイールを回したら横に動かす（PC向け） */
document.addEventListener('wheel', (ev) => {
  const box = ev.target.closest && ev.target.closest('.ychips, .tw');
  if (!box) return;
  if (box.scrollWidth <= box.clientWidth + 2) return;          // はみ出していない
  if (Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return;      // すでに横操作
  const before = box.scrollLeft;
  box.scrollLeft += ev.deltaY;
  if (box.scrollLeft !== before) ev.preventDefault();
}, { passive: false });

/* =========================================================================
   起動
   ========================================================================= */
function init() {
  const ui = loadUI();
  applyTheme(ui.theme || 'auto');
  applyFontScale(ui.fontScale);
  if (ui.leaveMode === 'bulk' || ui.leaveMode === 'single' || ui.leaveMode === 'range') LEAVE_MODE = ui.leaveMode;
  initCompanies();
  DATA = loadData();
  normalizeData(DATA);
  primeAudit();
  const first = DATA.employees.find((e) => !isRetired(e)) || DATA.employees[0];
  CUR = first ? first.id : null;
  TAB = DATA.employees.length > 1 ? 'list' : 'home';
  setTab(TAB);
  bootExtras();

  if ('serviceWorker' in navigator && !window.__PREVIEW__) {
    // 自動で読み込み直すことはしない（入力中に画面が消えるため）。
    // 新しい版が用意できたら、画面の下に案内だけ出す。
    // 初めて開いたときは Service Worker の登録で controllerchange が起きるだけなので案内しない
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) showUpdateBar();
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          reg.update();
          reg.addEventListener('updatefound', () => {
            const w = reg.installing;
            if (!w) return;
            w.addEventListener('statechange', () => {
              if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdateBar();
            });
          });
          // アプリに戻ってきたときに新しい版が無いか確認する
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) reg.update();
          });
        })
        .catch(() => {});
    });
  }
}
document.addEventListener('DOMContentLoaded', init);

