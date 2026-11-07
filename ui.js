/* =========================================================================
   有給管理 - UI
   ========================================================================= */
'use strict';

const APP_VERSION = 'v15';

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
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function normalizeEmployee(e) {
  if (!isObj(e.workdays)) e.workdays = {};
  if (!Array.isArray(e.leaves)) e.leaves = [];
  if (!isObj(e.grantOverrides)) e.grantOverrides = {};
  if (e.name == null) e.name = '';
  e.name = String(e.name);
  const ids = new Set();
  const bulkOf = {};
  e.leaves = e.leaves.filter((l) => {
    if (!isObj(l)) return false;                 // null などの壊れた記録
    if (!l.id || ids.has(String(l.id))) l.id = uid(); // ID の重複は削除時に巻き込むので振り直す
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

/** 読み込むJSONの検査。致命的な問題は errors、計算に使えない記録は warnings */
function checkImport(d) {
  const errors = [], warnings = [];
  if (!isObj(d) || !Array.isArray(d.employees)) return { errors: ['有給管理のバックアップ形式ではありません'], warnings };
  d.employees.forEach((e, i) => {
    const who = `${i + 1}人目${e && e.name ? `（${String(e.name).slice(0, 20)}）` : ''}`;
    if (!isObj(e)) { errors.push(`${who}のデータが壊れています`); return; }
    if (!isYmd(e.hireDate)) errors.push(`${who}の入社日が正しくありません`);
    const bad = (Array.isArray(e.leaves) ? e.leaves : []).filter((l) => !isObj(l) || !isYmd(l.date) || !(Number(l.days) > 0)).length;
    if (bad) warnings.push(`${who}：日付か日数が正しくない記録 ${bad}件（計算には使われません）`);
  });
  return { errors, warnings };
}

/* ---------- 自動の控え（読み込み・消去の直前のデータを1つだけ残す） ---------- */
const KEY_PREV = 'yukyu-app-v1-prev';
function keepPrevious(reason) {
  try {
    if (!DATA || !DATA.employees || !DATA.employees.length) return;
    localStorage.setItem(KEY_PREV, JSON.stringify({ savedAt: new Date().toISOString(), reason, data: DATA }));
  } catch (e) { /* 保存できない環境 */ }
}
function loadPrevious() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY_PREV) || 'null');
    return p && isObj(p.data) && Array.isArray(p.data.employees) ? p : null;
  } catch (e) { return null; }
}


/* ---------- 数値入力の共通処理 ----------
   矢印（スピナー）でも、キーボードで直接打ち込んでも同じように動くようにする。
   入力中は再描画しない。再描画は「欄から完全に離れたあと」だけ行い、
   こちらからフォーカスを動かすことは一切しない。 */
const NUMKEYS = ['wd', 'bulk', 'ov'];
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
  let grand = 0;
  $$('#p-leave [data-ysum]').forEach((el) => {
    const y = el.dataset.ysum;
    let sum = 0;
    for (let m = 1; m <= 12; m++) {
      const ym = `${y}-${pad2(m)}`;
      const b = findBulk(emp, ym);
      sum += (b ? Number(b.days) : 0) + singleSum(emp, ym);
    }
    grand += sum;
    el.textContent = fmtD(nd(sum));
  });
  const g = $('#p-leave [data-gsum]');
  if (g) g.textContent = fmtD(nd(grand));
  refreshLive(); // 上部の「使える有給」もその場で更新
}

/** 出勤日数画面の年合計だけを更新 */
function refreshWorkTotals() {
  const emp = currentEmp();
  if (!emp) return;
  $$('#p-work [data-wsum]').forEach((el) => {
    const y = el.dataset.wsum;
    let sum = 0, cnt = 0;
    for (let m = 1; m <= 12; m++) {
      const v = emp.workdays[`${y}-${pad2(m)}`];
      if (typeof v === 'number') { sum += v; cnt++; }
    }
    el.innerHTML = cnt ? `${cnt}ヶ月入力 / 計 <b class="num">${sum}</b>日` : '未入力';
  });
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
        // 月まとめは日付が分からないので「年月」だけを出す（実在しない取得日を書かない）
        out.push(it.bulk
          ? [e.name, e.empNo || '', ymd(r.from), it.date.slice(0, 7), '', it.days, '月まとめ入力（日付未特定）']
          : [e.name, e.empNo || '', ymd(r.from), it.date, WD[d.getDay()], it.days, it.note || '']);
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
        const note = it.bulk ? '月まとめ入力（日付未特定）' : (it.note || '');
        body += `<tr><td>${it.bulk
            ? `${d.getFullYear()}/${d.getMonth() + 1}<small>月中</small>`
            : `${fmtJpShort(d)}<small>${WD[d.getDay()]}曜日</small>`}${note ? `<span class="note-inline">${esc(note)}</span>` : ''}</td>
          <td class="num">${fmtD(it.days)}</td>
          <td class="num">${fmtD(run)}</td>
          <td class="note-col" style="text-align:left;white-space:normal">${esc(note)}</td></tr>`;
      }
      if (!r.items.length) body = `<tr><td colspan="4"><div class="empty" style="padding:14px">取得実績なし</div></td></tr>`;

      sheets += `<div class="reg-sheet">
        <h3>年次有給休暇管理簿</h3>
        <p class="law">労働基準法施行規則 第24条の7 ／ 基準日から3年間保存</p>
        <div class="reg-grid">
          <div><span class="lb">氏名</span><b>${esc(e.name)}</b>${e.empNo ? `<small>社員番号 ${esc(e.empNo)}</small>` : ''}</div>
          <div><span class="lb">入社年月日</span><b>${fmtJpShort(parseYmd(e.hireDate))}</b></div>
          <div><span class="lb">基準日</span><b>${fmtJpShort(r.from)}</b></div>
          <div><span class="lb">対象期間</span><b class="sm"><span class="nw">${fmtJpShort(r.from)}〜</span><span class="nw">${fmtJpShort(new Date(r.to.getTime() - 86400000))}</span></b></div>
        </div>
        <div class="reg-grid">
          <div><span class="lb">付与日数</span><b>${fmtD(r.granted)}日</b></div>
          <div><span class="lb">前年繰越</span><b>${fmtD(r.carry)}日</b></div>
          <div><span class="lb">使用可能日数</span><b>${fmtD(r.total)}日</b></div>
        </div>
        <div class="tw"><table>
          <thead><tr><th>取得年月日（時季）</th><th>日数</th><th>残日数</th><th class="note-col" style="text-align:left">備考</th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>
        <div class="reg-grid tot">
          <div><span class="lb">取得日数 計</span><b>${fmtD(r.taken)}日</b></div>
          <div><span class="lb">時効消滅</span><b${r.expired > 0 ? ' style="color:var(--danger)"' : ''}>${fmtD(r.expired)}日</b></div>
          <div><span class="lb">${r.closed ? '期末残日数' : '現在の残日数'}</span><b>${fmtD(r.endRemaining)}日</b></div>
          <div><span class="lb">年5日取得義務</span><b>${r.required5
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
    if (b.dataset.reg === 'print') {
      if (window.__PREVIEW__) { toast('印刷はGitHub Pages版で使えます'); return; }
      window.print();
    }
    if (b.dataset.reg === 'csv') {
      if (window.__PREVIEW__) { toast('CSV保存はGitHub Pages版で使えます'); return; }
      downloadText(`年次有給休暇管理簿_${ymd(today())}.csv`, toCSV(registerRows(emps)));
      toast('CSVを保存しました');
    }
  });
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

function renderList() {
  const box = $('#p-list');
  if (!DATA.employees.length) { box.innerHTML = welcomeHtml(); return; }

  const now = today();
  const items = DATA.employees.map((e) => {
    const r = simulate(e, now);
    const dl = r.nextExpiry ? r.nextExpiry.daysLeft : 9999;
    const ob = r.currentObligation;
    const lv = (r.nextExpiry && dl <= 30) || (ob && ob.shortage > 0 && ob.daysLeft <= 90)
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

  let html = `<div class="eyebrow"><b>従業員一覧</b><span class="nw">${fmtJp(now)}（${WD[now.getDay()]}）</span></div>
  <div class="sumrow">
    <div class="t"><b>${items.length}</b><span>登録人数</span></div>
    <div class="t ${soon ? 'alert' : ''}"><b>${soon}</b><span>3ヶ月以内に<wbr>消滅</span></div>
    <div class="t ${short5 ? 'warn' : ''}"><b>${short5}</b><span>年5日<wbr>未達</span></div>
  </div>

  <div class="seg sorter">
    ${[['urgent', '期限が近い順'], ['balance', '残日数順'], ['name', '名前順']].map(([v, t]) =>
      `<button data-sort="${v}" class="${SORT === v ? 'on' : ''}">${t}</button>`).join('')}
  </div>`;

  for (const x of sorted) {
    const { e, r, ob, lv } = x;
    html += `<button class="ecard lv-${lv}" data-open="${esc(e.id)}">
      <div class="top">
        <span class="nm">${esc(e.name || '(名称未設定)')}</span>
        <span class="tn">${isYmd(e.hireDate) ? tenureText(parseYmd(e.hireDate), now) : ''}</span>
        <span class="bal">${fmtD(r.balance)}<small>日</small></span>
      </div>
      <div class="lines">
        ${r.nextExpiry
          ? `<div class="ln ${x.dl <= 30 ? 'danger' : x.dl <= 90 ? 'warn' : ''}">${x.dl <= 90 ? ICON.alert : ICON.clock}<span class="tx">${fmtJpShort(r.nextExpiry.date)}に<b>${fmtD(r.nextExpiry.days)}日</b>消滅<span class="nw">（あと${x.dl}日）</span></span></div>`
          : `<div class="ln">${ICON.info}<span class="tx">消滅予定はありません</span></div>`}
        ${ob
          ? `<div class="ln ${ob.shortage <= 0 ? 'ok' : ob.daysLeft <= 90 ? 'danger' : 'warn'}">${ob.shortage <= 0 ? ICON.check : ICON.alert}<span class="tx">年5日義務 <b>${fmtD(ob.taken)}/5</b>${ob.shortage > 0 ? `<span class="nw">（あと${fmtD(ob.shortage)}日）</span>` : ''}</span><span class="mini"><i style="width:${Math.min(100, (ob.taken / 5) * 100).toFixed(0)}%"></i></span></div>`
          : ''}
        ${r.nextGrant
          ? `<div class="ln">${ICON.gift}<span class="tx">次回付与 ${fmtJpShort(r.nextGrant.date)}　<b>＋${fmtD(r.nextGrant.granted)}日</b></span></div>`
          : ''}
      </div>
    </button>`;
  }

  html += `<h2 class="sec">年次有給休暇管理簿</h2><div class="card">
    <p class="sub" style="margin-bottom:14px">労働基準法で作成と3年間の保存が義務づけられている帳簿です。印刷・PDF保存・CSV保存ができます。</p>
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
   ホーム
   ========================================================================= */
function renderHome() {
  const emp = currentEmp();
  const box = $('#p-home');
  if (!emp) { box.innerHTML = welcomeHtml(); return; }
  const now = today();
  const r = simulate(emp, now);
  const hire = isYmd(emp.hireDate) ? parseYmd(emp.hireDate) : now;

  /* ---- ヒーロー（残日数カード） ---- */
  let html = `
  <div class="card hero">
    <div class="who"><b>${esc(emp.name || '(名称未設定)')}</b><span class="tn">${tenureText(hire, now)}</span></div>
    ${emp.empNo ? `<div class="eno">No.${esc(emp.empNo)}</div>` : ''}
    <div class="lbl">使える有給</div>
    <div class="big"><span class="v">${fmtD(r.balance)}</span><span class="u">日</span></div>
    <div class="cap">${fmtJp(now)} 時点</div>
    <div class="hero-split">
      <div><span>次に消滅</span><b>${r.nextExpiry
        ? `${fmtJpShort(r.nextExpiry.date)}<small>${fmtD(r.nextExpiry.days)}日</small>` : '—'}</b></div>
      <div><span>次回付与</span><b>${r.nextGrant
        ? `${fmtJpShort(r.nextGrant.date)}<small>＋${fmtD(r.nextGrant.granted)}日</small>` : '—'}</b></div>
    </div>
    ${r.planned.length
      ? `<div class="hero-plan" data-k="planned"><span>取得予定 ${fmtD(r.plannedDays)}日を引くと</span><b>${fmtD(r.plannedBalance)}日</b></div>`
      : ''}
  </div>`;

  /* ---- 消滅アラート ---- */
  if (r.nextExpiry) {
    const dl = r.nextExpiry.daysLeft;
    const lv = dl <= 30 ? 'danger' : dl <= 90 ? 'warn' : 'info';
    const icon = dl <= 90 ? ICON.alert : ICON.clock;
    html += `<div class="note ${lv}">${icon}<div style="flex:1;min-width:0">
      <div class="t">${fmtJp(r.nextExpiry.date)}に <em class="nw">${fmtD(r.nextExpiry.days)}日</em> が消滅します</div>
      <div class="d">期限まで <b>あと${dl}日</b>${dl <= 90 ? ' — 計画的に取得してください。' : '。'}</div>
      <div class="bar"><i style="width:${Math.max(3, Math.min(100, (1 - dl / 730) * 100)).toFixed(0)}%"></i></div>
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
    html += `<div class="note ${lv}">${done ? ICON.check : ICON.alert}<div style="flex:1;min-width:0">
      <div class="t">年5日の取得義務 <em class="nw">${fmtD(ob.taken)} / 5日</em>${done ? ' 達成' : `<span class="nw">（あと${fmtD(ob.shortage)}日）</span>`}</div>
      <div class="d">対象期間 <span class="nw">${fmtJpShort(ob.from)}〜${fmtJpShort(new Date(ob.to.getTime() - 86400000))}</span><span class="nw">（あと${ob.daysLeft}日）</span></div>
      <div class="bar"><i style="width:${Math.min(100, (ob.taken / 5) * 100).toFixed(0)}%"></i></div>
    </div></div>`;
  }

  /* ---- 残高不足の警告 ---- */
  if (r.shortfalls.length) {
    const s = nd(r.shortfalls.reduce((a, b) => a + b.days, 0));
    html += `<div class="note danger">${ICON.alert}<div style="min-width:0"><div class="t">有給が足りず、引けていない記録があります（計<em>${fmtD(s)}日</em>）</div>
      <div class="d">${r.shortfalls.slice(0, 4).map((x) => `${leaveLabel(x)}（${fmtD(x.days)}日分）`).join('、')}${r.shortfalls.length > 4 ? ' ほか' : ''}<br>
      最初の付与日より前の取得や、出勤日数の入力漏れ・記録の誤りが考えられます。「記録」タブで確認できます。</div></div></div>`;
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
      <td class="num" style="color:${alive && diffDays(now, l.expiry) <= 90 ? 'var(--danger);font-weight:700' : 'inherit'}">${fmtJpShort(l.expiry)}</td>
    </tr>`;
  }
  if (!past.length) html += `<tr><td colspan="6"><div class="empty">まだ付与日を迎えていません</div></td></tr>`;
  html += `</tbody></table></div></div>`;

  /* ---- 今後の付与予定 ---- */
  const fut = r.lots.filter((l) => l.future).slice(0, 3);
  if (fut.length) {
    html += `<h2 class="sec">今後の付与予定</h2><div class="card">`;
    for (const l of fut) {
      html += `<div class="li">${ICON.gift.replace('<svg', '<svg style="width:20px;height:20px;flex:none;color:var(--gold)"')}
        <div class="g"><div class="d1">${fmtJp(l.date)}</div>
        <div class="d2 wrap">${l.label}・${esc(l.categoryShort)}／<span class="nw">有効期限 ${fmtJpShort(l.expiry)}</span></div></div>
        <div class="amt">＋${fmtD(l.granted)}<small>日</small></div></div>`;
    }
    html += `<p class="sub" style="margin-top:10px">※ 直近の出勤日数から推定した見込みです。実績が入ると自動で更新されます。</p></div>`;
  }

  /* ---- 管理簿 ---- */
  html += `<h2 class="sec">年次有給休暇管理簿</h2><div class="card">
    <p class="sub" style="margin-bottom:14px">${esc(emp.name)}の法定帳簿です。印刷・PDF保存・CSV保存ができます。</p>
    <button class="btn full" data-act="reg1">${ICON.doc}管理簿を表示する</button>
  </div>`;

  /* ---- 累計 ---- */
  html += `<h2 class="sec">これまでの累計</h2><div class="card">
    <div class="kv"><span>付与された日数</span><b>${fmtD(r.totalGranted)}<small>日</small></b></div>
    <div class="kv"><span>取得した日数</span><b>${fmtD(r.totalUsed)}<small>日</small></b></div>
    <div class="kv"><span>消滅した日数</span><b style="color:${r.totalExpired > 0 ? 'var(--danger)' : 'inherit'}">${fmtD(r.totalExpired)}<small>日</small></b></div>
    <div class="kv"><span>現在の残日数</span><b>${fmtD(r.balance)}<small>日</small></b></div>
  </div>`;

  box.innerHTML = html;
}

/* =========================================================================
   取得記録
   ========================================================================= */
/** 記録タブ上部の残高表示（入力するとその場で更新される） */
function balStripHtml(r) {
  const ob = r.currentObligation;
  return `<div class="balstrip" aria-live="polite">
    <div class="bs-main"><span>使える有給</span><b data-live="bal">${fmtD(r.balance)}</b><i>日</i></div>
    <div class="s"><span>予定を引くと</span><b data-live="plan">${fmtD(r.plannedBalance)}</b><i>日</i></div>
    <div class="s"><span>年5日義務</span><b data-live="ob">${ob ? fmtD(Math.min(ob.taken, 5)) : '—'}</b><i>${ob ? '/5' : ''}</i></div>
  </div>`;
}
function refreshLive() {
  const emp = currentEmp();
  if (!emp) return;
  const r = simulate(emp, today());
  const ob = r.currentObligation;
  const set = (k, v) => {
    const el = $(`#p-leave [data-live="${k}"]`);
    if (!el || el.textContent === v) return;
    el.textContent = v;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  };
  set('bal', fmtD(r.balance));
  set('plan', fmtD(r.plannedBalance));
  set('ob', ob ? fmtD(Math.min(ob.taken, 5)) : '—');
}

function renderLeave() {
  const emp = currentEmp();
  const box = $('#p-leave');
  if (!emp) {
    box.innerHTML = `<div class="card"><div class="empty">先に従業員を登録してください</div>
      <button class="btn primary full" data-act="addemp">${ICON.plus}従業員を登録する</button></div>`;
    return;
  }
  const now = today();
  const r = simulate(emp, now);
  let html = balStripHtml(r) + `<div class="seg big-seg">
    <button data-lmode="single" class="${LEAVE_MODE === 'single' ? 'on' : ''}">1日ずつ入力</button>
    <button data-lmode="bulk" class="${LEAVE_MODE === 'bulk' ? 'on' : ''}">月ごとにまとめて</button>
  </div>`;
  html += LEAVE_MODE === 'bulk' ? leaveBulkHtml(emp, now, r) : leaveSingleHtml(emp, now, r);
  box.innerHTML = html;
}

/* ---------- 1日ずつ入力 ---------- */
function leaveSingleHtml(emp, now, r) {
  const custom = LEAVE_DAYS !== 0.5 && LEAVE_DAYS !== 1;
  const tk = ymd(now);

  let html = `
  <div class="card">
    <h2 class="sec" style="margin-top:0">有給を取得した日を追加</h2>
    <div class="field"><label class="fl" for="df-lvDate">取得日</label>
      ${dateField('lvDate', LEAVE_DATE || tk)}
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
      ${custom ? `<input type="number" id="lvDays" step="0.5" min="0.5" max="40" value="${fmtD(LEAVE_DAYS)}" style="margin-top:10px" inputmode="decimal" aria-label="日数（0.5日単位）">` : ''}
    </div>
    <div class="field"><label class="fl" for="lvNote">メモ（任意）</label>
      <input type="text" id="lvNote" maxlength="100" placeholder="例：私用／旅行" value="${esc(LEAVE_NOTE)}"></div>
    <button class="btn primary full" data-act="addleave">${ICON.plus}記録を追加</button>
  </div>`;

  /* 付与年度ごとにグループ化（計算に使う日付 eff で分ける） */
  const shortMap = new Map(r.shortfalls.map((s) => [s.id, s.days]));
  const planShortMap = new Map((r.plannedShortfalls || []).map((s) => [s.id, s.days]));
  const lots = r.lots.filter((l) => !l.future || l.date <= addMonths(now, 12));
  const groups = lots.map((l) => ({
    from: l.date, to: addMonths(l.date, 12), lot: l, items: [],
    label: `${fmtJpShort(l.date)} 〜 ${fmtJpShort(new Date(addMonths(l.date, 12).getTime() - 86400000))}`,
  }));
  const first = r.lots[0] ? r.lots[0].date : null;
  const before = { label: '最初の付与日より前', items: [], lot: null,
    note: 'まだ有給が付与されていない期間のため、この記録は残日数から引かれていません。' };
  const later = { label: 'さらに先の予定', items: [], lot: null };
  for (const lv of r.allLeaves) {
    const d = parseYmd(lv.eff);
    const g = groups.find((x) => d >= x.from && d < x.to);
    if (g) g.items.push(lv);
    else if (!first || d < first) before.items.push(lv);
    else later.items.push(lv);
  }
  const shown = [];
  if (later.items.length) shown.push(later);
  shown.push(...[...groups].reverse().filter((g) => g.items.length));
  if (before.items.length) shown.push(before);

  const total = nd(r.allLeaves.reduce((s, l) => s + l.days, 0));
  html += `<h2 class="sec">取得の記録（合計 <span class="num">${fmtD(total)}</span>日）</h2><div class="card">`;
  if (!shown.length) {
    html += `<div class="empty">まだ記録がありません</div>`;
  } else {
    for (const g of shown) {
      const taken = nd(g.items.filter((l) => l.eff <= tk).reduce((s, l) => s + l.days, 0));
      const sum = nd(g.items.reduce((s, l) => s + l.days, 0));
      const ob = g.lot && !g.lot.future && g.lot.granted >= 10;
      html += `<div class="yr"><span class="yr-l"><span class="nw">${esc(g.label)}</span>${g.lot ? `<span class="nw">（${g.lot.label}）</span>` : ''}</span>
        <span class="yr-r">${fmtD(sum)}日${ob ? `<span class="pill ${taken >= 5 ? 'ok' : 'warn'}">義務 ${fmtD(Math.min(taken, 5))}/5</span>` : ''}</span></div>`;
      if (g.note) html += `<p class="sub" style="margin:8px 0 0;color:var(--danger)">${esc(g.note)}</p>`;
      for (const lv of g.items.slice().reverse()) {
        const d = parseYmd(lv.date);
        const planned = lv.eff > tk;
        const sf = planned ? planShortMap.get(lv.id) : shortMap.get(lv.id);
        const title = isBulk(lv) ? `${d.getFullYear()}年${d.getMonth() + 1}月` : `${fmtJp(d)}（${WD[d.getDay()]}）`;
        const pills = (isBulk(lv) ? '<span class="pill mute">月まとめ</span>' : '')
          + (planned ? '<span class="pill acc">予定</span>' : '')
          + (sf ? `<span class="pill danger">不足 ${fmtD(sf)}日</span>` : '');
        const memo = lv.note && !isBulk(lv) ? esc(lv.note) : '';
        let sub = '';
        if (sf) sub = `<div class="d2 bad">有給が${fmtD(sf)}日足りないため、その分は残日数から引けていません</div>`;
        else if (isBulk(lv) && !planned && lv.eff !== lv.date) sub = `<div class="d2">今月分として、残日数から引いています</div>`;
        else if (planned) sub = `<div class="d2">${isBulk(lv) ? 'その月になると' : '当日になると'}残日数から引かれます${memo ? `・${memo}` : ''}</div>`;
        else if (memo) sub = `<div class="d2">${memo}</div>`;
        html += `<div class="li${sf ? ' short' : ''}">
          <div class="g"><div class="d1"><span>${title}</span>${pills}</div>${sub}</div>
          <div class="amt">${fmtD(lv.days)}<small>日</small></div>
          <button class="ico-btn" data-act="dellv" data-id="${esc(lv.id)}" aria-label="${esc(title)}の記録を削除">${ICON.trash}</button>
        </div>`;
      }
    }
  }
  return html + `</div>`;
}

/* ---------- 月ごとにまとめて入力 ---------- */
function leaveBulkHtml(emp, now, r) {
  const hire = isYmd(emp.hireDate) ? parseYmd(emp.hireDate) : now;
  const yearsOf = (emp.leaves || []).filter((l) => isYmd(l.date)).map((l) => Number(l.date.slice(0, 4)));
  const last = Math.max(now.getFullYear(), hire.getFullYear(), ...(yearsOf.length ? yearsOf : [0]));
  const curYm = ymd(now).slice(0, 7);
  const firstGrant = r.lots[0] ? r.lots[0].date : null;
  const badMonths = new Set([...r.shortfalls, ...(r.plannedShortfalls || [])]
    .filter((s) => s.bulk).map((s) => s.date.slice(0, 7)));

  let html = `<div class="note info">${ICON.info}<div><div class="t">日付を覚えていない分はこちら</div>
    <div class="d">月ごとに「何日取ったか」を入れるだけで登録できます。<b>今月までの分は、入れた時点で残日数から引きます</b>（来月以降の分は「予定」として扱います）。<br>
    正確な日付が分かったら「1日ずつ入力」で入れ直してください。</div></div></div>`;

  let grand = 0;
  let body = '';
  for (let y = last; y >= hire.getFullYear(); y--) {
    let ySum = 0, cells = '';
    for (let m = 1; m <= 12; m++) {
      const ym = `${y}-${pad2(m)}`;
      const b = findBulk(emp, ym);
      const sng = singleSum(emp, ym);
      ySum += (b ? Number(b.days) : 0) + sng;
      const pre = firstGrant && new Date(y, m, 0) < firstGrant; // その月がまるごと最初の付与日より前
      const beforeHire = new Date(y, m, 0) < hire;              // その月がまるごと入社前
      const cls = [ym === curYm ? 'cur' : '', ym > curYm ? 'fut' : '', pre ? 'pre' : '', badMonths.has(ym) ? 'bad' : '']
        .filter(Boolean).join(' ');
      const tag = sng > 0 ? `<em class="sng">個別+${fmtD(sng)}</em>`
        : badMonths.has(ym) ? '<em class="bad">不足</em>'
        : beforeHire ? '<em class="pre">入社前</em>'
        : pre ? '<em class="pre">付与前</em>'
        : ym === curYm ? '<em class="sng">今月</em>' : '';
      cells += `<div class="m ${cls}"><span>${m}月</span>
        <input type="number" inputmode="decimal" step="0.5" min="0" max="31" placeholder="—"
          value="${b ? fmtD(Number(b.days)) : ''}" data-bulk="${ym}" aria-label="${y}年${m}月に取った日数"${ym > curYm ? ' title="来月以降の分は予定として扱います"' : ''}>
        ${tag}</div>`;
    }
    grand += ySum;
    body += `<div class="card"><div class="yhead"><b>${y}年</b>
      <span class="sub">合計 <b class="num" data-ysum="${y}">${fmtD(nd(ySum))}</b>日</span></div>
      <div class="mg">${cells}</div></div>`;
  }

  html += `<h2 class="sec">月ごとの取得日数（総計 <span class="num" data-gsum>${fmtD(nd(grand))}</span>日）</h2>` + body;
  html += `<p class="sub" style="margin-top:-2px">「個別+◯」は、その月に1日ずつ入力した記録の分です（上の数字とは別に加算）。「付与前」の月は、まだ有給がない期間のため残日数から引かれません。</p>`;
  return html;
}

/* =========================================================================
   出勤日数
   ========================================================================= */
function renderWork() {
  const emp = currentEmp();
  const box = $('#p-work');
  if (!emp) {
    box.innerHTML = `<div class="card"><div class="empty">先に従業員を登録してください</div>
      <button class="btn primary full" data-act="addemp">${ICON.plus}従業員を登録する</button></div>`;
    return;
  }

  const now = today();
  const curY = now.getFullYear(), curM = now.getMonth() + 1;
  const hireY = parseYmd(emp.hireDate).getFullYear();
  const dataYears = Object.keys(emp.workdays || {}).map((k) => Number(k.slice(0, 4)));
  const extra = Math.max(0, Number(loadUI().workExtraYears) || 0);
  const maxY = Math.max(curY + 5 + extra, hireY, ...(dataYears.length ? dataYears : [0]));

  const years = [];
  for (let y = maxY; y >= hireY; y--) years.push(y);
  if (WORK_YEAR == null || !years.includes(WORK_YEAR)) WORK_YEAR = Math.min(curY, maxY);

  const stat = (y) => {
    let sum = 0, cnt = 0;
    for (let m = 1; m <= 12; m++) {
      const v = emp.workdays[`${y}-${pad2(m)}`];
      if (typeof v === 'number') { sum += v; cnt++; }
    }
    return { sum, cnt };
  };

  /* ---- 説明 ---- */
  let html = `<div class="note info">${ICON.info}<div><div class="t">付与日数はここの入力から決まります</div>
    <div class="d">月ごとに実際に出勤した日数を入れてください。付与日の直前12ヶ月（初回は6ヶ月×2）から「1年間の所定労働日数」を出し、比例付与表で日数を判定します。<br>
    <b>先の年も入力できます。</b>予定の出勤日数を入れておくと、次回の付与日数がより正確に出ます。</div></div></div>`;

  /* ---- 年を選ぶ ---- */
  html += `<div class="ychips">
    <button data-act="moreyears" class="add" title="さらに先の年を追加">＋ 年を追加</button>
    ${years.map((y) => {
      const st = stat(y);
      const cls = [y === WORK_YEAR ? 'on' : '', y > curY ? 'fut' : ''].filter(Boolean).join(' ');
      return `<button data-wyear="${y}" class="${cls}">${y}年${st.cnt ? `<i class="dot"></i>` : ''}</button>`;
    }).join('')}
  </div>`;

  /* ---- 選んだ年のグリッド ---- */
  const st = stat(WORK_YEAR);
  const avg = st.cnt ? Math.round((st.sum / st.cnt) * 10) / 10 : 0;
  const prevSt = stat(WORK_YEAR - 1);

  let cells = '';
  for (let m = 1; m <= 12; m++) {
    const key = `${WORK_YEAR}-${pad2(m)}`;
    const v = emp.workdays[key];
    const future = WORK_YEAR > curY || (WORK_YEAR === curY && m > curM);
    const isNow = WORK_YEAR === curY && m === curM;
    cells += `<div class="m ${future ? 'fut' : ''} ${isNow ? 'cur' : ''}"><span>${m}月</span>
      <input type="number" inputmode="numeric" min="0" max="31" placeholder="—"
        value="${typeof v === 'number' ? v : ''}" data-wd="${key}" aria-label="${WORK_YEAR}年${m}月の出勤日数"></div>`;
  }

  html += `<div class="card">
    <div class="yhead"><b>${WORK_YEAR}年</b>
      ${WORK_YEAR > curY ? '<span class="pill acc">予定</span>' : ''}
      <span class="sub" data-wsum="${WORK_YEAR}">${st.cnt ? `${st.cnt}ヶ月入力 / 計 <b class="num">${st.sum}</b>日` : '未入力'}</span></div>
    <div class="mg">${cells}</div>
    <div class="wsum">
      <div><span>入力済み</span><b>${st.cnt} / 12ヶ月</b></div>
      <div><span>年間合計</span><b class="num">${st.sum}日</b></div>
      <div><span>月平均</span><b class="num">${st.cnt ? avg : '—'}日</b></div>
    </div>
    <div class="wbtns">
      ${prevSt.cnt ? `<button class="btn sm" data-act="copyprev">${WORK_YEAR - 1}年から写す</button>` : ''}
      <button class="btn sm" data-act="fillyear">全月に同じ数字</button>
      ${st.cnt ? `<button class="btn sm danger" data-act="clearyear">この年を消す</button>` : ''}
    </div>
  </div>`;

  /* ---- 年別サマリー ---- */
  const listYears = years.filter((y) => stat(y).cnt || y === WORK_YEAR || y === curY);
  html += `<h2 class="sec">年ごとの入力状況</h2><div class="card"><div class="tw"><table>
    <thead><tr><th>年</th><th>入力</th><th>年間合計</th><th>月平均</th><th></th></tr></thead><tbody>`;
  for (const y of listYears) {
    const t = stat(y);
    const a = t.cnt ? Math.round((t.sum / t.cnt) * 10) / 10 : 0;
    html += `<tr class="${y === WORK_YEAR ? 'now' : t.cnt ? '' : 'dim'}">
      <td>${y}年${y > curY ? ' <span class="pill acc">予定</span>' : ''}</td>
      <td class="num">${t.cnt ? `${t.cnt}/12` : '—'}</td>
      <td class="num">${t.cnt ? t.sum + '日' : '—'}</td>
      <td class="num">${t.cnt ? a + '日' : '—'}</td>
      <td><button class="btn sm" data-wyear="${y}">開く</button></td></tr>`;
  }
  html += `</tbody></table></div>
    <p class="sub" style="margin-top:10px">入力のある年と今年だけを表示しています。ほかの年は上のチップから開いてください。</p></div>`;

  /* ---- 付与日数の判定結果 ---- */
  const r = simulate(emp, now);
  html += `<h2 class="sec">付与日数の判定結果</h2><div class="card"><div class="tw"><table>
    <thead><tr><th>基準日</th><th>年間日数</th><th>区分</th><th>付与日数</th></tr></thead><tbody>`;
  for (const l of r.lots) {
    const src = l.annualSource === 'actual' ? '<span class="pill ok">実績</span>'
      : l.annualSource === 'partial' ? '<span class="pill warn">一部推定</span>'
      : '<span class="pill mute">既定値</span>';
    html += `<tr class="${l.future ? 'dim' : ''}">
      <td>${fmtJpShort(l.date)}<small>${l.future ? '予定' : l.label}</small></td>
      <td class="num">${l.annualDays}日<small>${src}</small></td>
      <td>${esc(l.categoryShort)}</td>
      <td class="num"><b style="font-size:15px">${fmtD(l.granted)}日</b>${l.overridden ? '<small><span class="pill acc">手入力</span></small>' : ''}</td>
    </tr>`;
  }
  html += `</tbody></table></div>
    <p class="sub" style="margin-top:10px">「一部推定」「既定値」は出勤日数が足りていない期間です。その年を埋めると精度が上がります（未入力の期間は、設定の「出勤日数が未入力のときの目安」＝週${emp.weeklyDays ?? 5}日くらい から推定）。</p></div>`;

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
  HIRE_DIRTY = false; // 作り直したので「入社日を変えた」印は不要
  const emp = currentEmp();
  let html = `<h2 class="sec" style="margin-top:0">従業員</h2><div class="card">`;
  for (const e of DATA.employees) {
    const defLots = simulate(e, today()).lots.filter((l) => l.annualSource === 'default' && l.granted > 0);
    html += `<div class="emp-card" data-emp="${esc(e.id)}">
      <div class="top"><b>${esc(e.name || '(名称未設定)')}</b>
        ${e.id === CUR ? '<span class="pill acc">表示中</span>' : ''}
        <button class="ico-btn" style="margin-left:auto" data-act="delemp" data-id="${esc(e.id)}" aria-label="削除">${ICON.trash}</button></div>
      <div class="row" style="margin-bottom:14px">
        <div><label class="fl">氏名</label><input type="text" maxlength="40" value="${esc(e.name)}" data-ef="name" data-id="${esc(e.id)}" aria-label="氏名"></div>
        <div><label class="fl">社員番号</label><input type="text" maxlength="20" value="${esc(e.empNo || '')}" data-ef="empNo" data-id="${esc(e.id)}" placeholder="任意" aria-label="社員番号"></div>
      </div>
      <div class="row hire-row">
        <div><label class="fl">入社日</label>${dateField('hire:' + e.id, e.hireDate)}</div>
        <div><label class="fl">出勤日数が未入力のときの目安</label>
          <select class="inp" data-ef="weeklyDays" data-id="${esc(e.id)}" aria-label="出勤日数が未入力のときの目安">
            ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${Number(e.weeklyDays) === n ? 'selected' : ''}>週${n}日くらい</option>`).join('')}
          </select></div>
      </div>
      <div class="hintbox">
        付与日数は <b>「出勤」タブに入れた実際の出勤日数</b> から自動で決まります。
        上の目安が使われるのは、出勤日数がまだ入っていない期間だけです。
        ${defLots.length
          ? `<div class="hintwarn">${ICON.alert}<div>
               <b>${defLots.length}回分の付与</b>が、実績ではなく目安で計算されています
               （${defLots.slice(0, 3).map((l) => fmtJpShort(l.date)).join('、')}${defLots.length > 3 ? ' ほか' : ''}）。<br>
               正確にするには、その前1年分の出勤日数を入れてください。
             </div></div>
             <button class="btn sm full" data-opendays="${esc(e.id)}" style="margin-top:9px">出勤日数を入れる</button>`
          : `<div class="hintok">${ICON.check}<div>すべての付与が実績から計算されています。</div></div>`}
      </div>
    </div>`;
  }
  html += `<button class="btn full" data-act="addemp">${ICON.plus}従業員を追加</button></div>`;

  /* 付与日数の上書き */
  if (emp) {
    const r = simulate(emp, today());
    html += `<h2 class="sec">付与日数の手動調整（${esc(emp.name)}）</h2><div class="card">
      <p class="sub" style="margin-bottom:12px">通常は出勤日数から自動で決まります。就業規則で法定を上回る日数を付与している場合など、その回だけ日数を上書きしたいときに使ってください。空欄にすると自動計算に戻ります。</p>`;
    for (const l of r.lots) {
      html += `<div class="li"><div class="g"><div class="d1"><span class="num">${fmtJpShort(l.date)}</span><span>${l.label}</span>${l.future ? '<span class="pill mute">予定</span>' : ''}</div>
        <div class="d2">自動計算 ${fmtD(l.autoDays)}日${l.overridden ? '・<b style="color:var(--gold-ink)">手動で上書き中</b>' : ''}</div></div>
        <input type="number" step="0.5" min="0" max="99" style="width:92px;text-align:center" placeholder="${fmtD(l.autoDays)}"
          value="${l.overridden ? fmtD(l.granted) : ''}" data-ov="${l.key}" aria-label="${fmtJpShort(l.date)}の付与日数"></div>`;
    }
    html += `</div>`;
  }

  /* データ */
  const prev = loadPrevious();
  html += `<h2 class="sec">データ</h2><div class="card">
    <p class="sub" style="margin-bottom:14px">データはこの端末のブラウザ内にだけ保存され、外部には送信されません。機種変更やバックアップにはJSONの書き出し／読み込みを使ってください。</p>
    <div class="row" style="margin-bottom:10px">
      <button class="btn" data-act="export">${ICON.down}書き出し</button>
      <button class="btn" data-act="import">読み込み</button>
    </div>
    ${prev ? `<button class="btn quiet full" data-act="restoreprev" style="margin-bottom:6px">直前のデータに戻す（${esc(prevLabel(prev))}）</button>` : ''}
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
  <h2 class="sec">アプリの更新</h2><div class="card">
    <div class="kv"><span>いま動いているバージョン</span><b>${APP_VERSION}</b></div>
    <p class="sub" style="margin:12px 0 14px">最新版が出ているか確認して、あれば読み込み直します。</p>
    <button class="btn full" data-act="update">更新を確認する</button>
  </div>
  <p class="verline"><b>有給管理</b>${APP_VERSION}</p>`;

  $('#p-set').innerHTML = html;
}
function prevLabel(p) {
  const d = new Date(p.savedAt);
  const when = isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${when} ${p.reason || ''}の前`.trim();
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
  if (key === 'lvDate') { if (isYmd(v)) LEAVE_DATE = v; return; }
  if (key.startsWith('hire:')) {
    const e = DATA.employees.find((x) => x.id === key.slice(5));
    if (!e) return;
    if (isYmd(v) && !hireDateOk(v)) {
      const cap = t.closest('.dfrow').nextElementSibling;
      if (cap) { cap.textContent = '入社日として使えない日付です（1950年〜来年まで）'; cap.classList.add('bad'); }
      return;
    }
    if (!isYmd(v) || e.hireDate === v) return;
    e.hireDate = v; saveData(); HIRE_DIRTY = true;
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

  if (key.startsWith('hire:')) {
    const id = key.slice(5);
    const e = DATA.employees.find((x) => x.id === id);
    if (!e) return;
    openDatePicker(e.hireDate, { minYear: Math.max(1950, now.getFullYear() - 50), maxYear: now.getFullYear() + 1 },
      (picked) => {
        if (!hireDateOk(picked)) { toast('入社日として使えない日付です'); return; }
        e.hireDate = picked; saveData(); HIRE_DIRTY = false; renderSet(); toast('入社日を更新しました');
      });
  }
});

/* ---- 「記録を追加」 ---- */
async function addLeave(emp) {
  const now = today();
  const inp = $('#df-lvDate');
  const date = inp ? inp.value : (LEAVE_DATE || ymd(now));
  if (!isYmd(date)) { toast('取得日を最後まで正しく入れてください'); if (inp) inp.focus(); return; }
  if (isYmd(emp.hireDate) && date < emp.hireDate) {
    toast(`入社日（${fmtJpShort(parseYmd(emp.hireDate))}）より前の日付です`); return;
  }
  if (parseYmd(date) > addMonths(now, 24)) { toast('2年より先の日付は記録できません'); return; }

  const dinp = $('#lvDays');
  const days = dinp ? numOrNull(dinp.value, 999) : LEAVE_DAYS;
  if (days == null || !(days > 0)) { toast('日数を入力してください'); if (dinp) dinp.focus(); return; }
  if (Math.round(days * 2) !== days * 2) { toast('日数は0.5日単位で入れてください'); if (dinp) dinp.focus(); return; }
  if (days > 40) { toast('1回に記録できるのは40日までです'); if (dinp) dinp.focus(); return; }

  const d0 = parseYmd(date);
  const md = `${d0.getMonth() + 1}月${d0.getDate()}日`;
  const same = (emp.leaves || []).filter((l) => !isBulk(l) && l.date === date);
  if (same.length) {
    const ok = await askDialog({
      title: 'この日はすでに記録があります',
      message: `${fmtJp(d0)} には ${fmtD(nd(same.reduce((s, l) => s + Number(l.days), 0)))}日 の記録があります。\nさらに ${fmtD(days)}日 を追加しますか？`,
      ok: '追加する',
    });
    if (!ok) return;
  }

  const id = uid();
  emp.leaves = emp.leaves || [];
  emp.leaves.push({ id, date, days, note: (LEAVE_NOTE || '').trim().slice(0, 100), bulk: false });
  emp.leaves.sort((a, b) => a.date.localeCompare(b.date));
  saveData();
  LEAVE_DATE = null;
  LEAVE_NOTE = '';
  renderLeave();

  // 残日数にどう反映されたかをその場で伝える
  const r = simulate(emp, now);
  const sf = r.shortfalls.find((s) => s.id === id) || (r.plannedShortfalls || []).find((s) => s.id === id);
  if (date > ymd(now)) {
    toast(sf ? `${md}に予定を記録しました（有給が${fmtD(sf.days)}日足りません）` : `${md}に${fmtD(days)}日を予定として記録しました`);
  } else if (sf) {
    toast(`${md}に記録しましたが、有給が${fmtD(sf.days)}日足りません`);
  } else {
    toast(`${md}に${fmtD(days)}日を記録しました（残り${fmtD(r.balance)}日）`);
  }
}

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
  DATA = d;
  DATA.employees.forEach(normalizeEmployee);
  CUR = DATA.employees[0] ? DATA.employees[0].id : null;
  saveData();
  setTab(DATA.employees.length > 1 ? 'list' : 'home');
  toast(`${DATA.employees.length}人分を読み込みました`);
}

document.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('[data-act],[data-tab],[data-days],[data-theme],[data-sort],[data-open],[data-lmode],[data-wyear],[data-opendays]');
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
    for (let m = 1; m <= 12; m++) emp.workdays[`${y}-${pad2(m)}`] = Math.round(n);
    saveData(); renderWork(); toast(`${y}年を${Math.round(n)}日で埋めました`); return;
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
    for (let m = 1; m <= 12; m++) {
      const from = emp.workdays[`${src}-${pad2(m)}`];
      const to = `${y}-${pad2(m)}`;
      if (typeof from === 'number' && typeof emp.workdays[to] !== 'number') {
        emp.workdays[to] = from; filled++;
      }
    }
    saveData(); renderWork();
    toast(filled ? `${src}年から${filled}ヶ月分を写しました（空欄のみ）` : '空いている月がありません');
    return;
  }

  if (act === 'clearyear') {
    const y = WORK_YEAR;
    const ok = await askDialog({ title: `${y}年の出勤日数を消しますか？`, message: `${y}年の12ヶ月分の入力をすべて消します。`, ok: '消す', danger: true });
    if (!ok) return;
    const before = {};
    for (let m = 1; m <= 12; m++) {
      const k = `${y}-${pad2(m)}`;
      if (typeof emp.workdays[k] === 'number') before[k] = emp.workdays[k];
      delete emp.workdays[k];
    }
    saveData(); renderWork();
    const empId = emp.id;
    toast(`${y}年を消しました`, {
      action: '元に戻す',
      onAction: () => {
        const e2 = DATA.employees.find((x) => x.id === empId);
        if (!e2) return;
        Object.keys(before).forEach((k) => { if (typeof e2.workdays[k] !== 'number') e2.workdays[k] = before[k]; });
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
    DATA.employees.push(e); CUR = e.id; saveData();
    setTab('set'); toast('氏名と入社日を入力してください');
    const card = document.querySelector(`.emp-card[data-emp="${CSS.escape(e.id)}"]`);
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

  if (act === 'export') {
    if (window.__PREVIEW__) { toast('書き出しはGitHub Pages版で使えます'); return; }
    const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `有給管理データ_${ymd(today())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('JSONを書き出しました'); return;
  }

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
    DATA.employees.forEach(normalizeEmployee);
    try {
      localStorage.setItem(KEY_PREV, JSON.stringify({ savedAt: new Date().toISOString(), reason: '戻す操作', data: cur }));
    } catch (e) {}
    CUR = DATA.employees[0] ? DATA.employees[0].id : null;
    saveData(); render(); toast('直前のデータに戻しました'); return;
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
      title: 'この端末のデータを消去しますか？',
      message: 'この端末に保存した全員分のデータを消します。\n消す直前のデータは控えとして1つ残ります（設定の「直前のデータに戻す」）。念のため先に「書き出し」でバックアップを取っておくと安心です。',
      ok: '消去する', danger: true,
    });
    if (!ok) return;
    keepPrevious('消去');
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
    const n = numOrNull(t.value, 31);
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
    } else {
      e[f] = String(t.value).slice(0, f === 'name' ? 40 : 20);
    }
    saveData();
    if (f === 'name') renderEmpSelect();
    if (f === 'weeklyDays') renderSet();
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

  if (t.dataset.bulk) {
    const n = numOrNull(t.value, 31);
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
  if (!kind && t.dataset && t.dataset.dfi && t.dataset.dfi.startsWith('hire:')) kind = 'hire';
  if (!kind) return;
  setTimeout(() => {
    if (isEditing(document.activeElement)) return;   // どこかに入力中
    if (document.querySelector('.dp-ov, .reg-ov, .dlg-ov')) return; // カレンダー等が開いている
    if (kind === 'wd' && TAB === 'work') renderWork();
    else if (kind === 'bulk' && TAB === 'leave') renderLeave();
    else if (kind === 'ov' && TAB === 'set') renderSet();
    else if (kind === 'hire' && TAB === 'set') {
      // 入社日：変えたら付与の判定などを更新。打ちかけの不正な日付は元に戻す
      const changed = HIRE_DIRTY;
      HIRE_DIRTY = false;
      renderSet();
      if (changed) toast('入社日を更新しました');
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
(function init() {
  const ui = loadUI();
  applyTheme(ui.theme || 'auto');
  if (ui.leaveMode === 'bulk' || ui.leaveMode === 'single') LEAVE_MODE = ui.leaveMode;
  DATA = loadData();
  DATA.employees.forEach(normalizeEmployee);
  CUR = DATA.employees[0] ? DATA.employees[0].id : null;
  TAB = DATA.employees.length > 1 ? 'list' : 'home';
  setTab(TAB);

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
})();
