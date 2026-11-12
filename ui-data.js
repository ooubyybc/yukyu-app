/* =========================================================================
   有給管理 - データ管理と設定
   会社の切り替え、操作の履歴（元に戻す）、設定画面、書き出し（パスワード保護）、
   CSV の取り込み、消えにくい保存、書き出しの声かけ、画面ロック、文字サイズ、使い方の案内
   ========================================================================= */
'use strict';

/* =========================================================================
   会社（データの入れ物）。最初の会社は以前と同じ保存場所を使う
   ========================================================================= */
const KEY_COS = 'yukyu-app-companies';
const KEY_DELCO = 'yukyu-app-deleted-company';
let COS = null;
function loadCos() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY_COS) || 'null');
    if (o && Array.isArray(o.list) && o.list.length && o.list.every((c) => c && typeof c.id === 'string')) return o;
  } catch (e) { /* 読めない */ }
  return { active: 'main', list: [{ id: 'main', name: '' }] };
}
function saveCos() { try { localStorage.setItem(KEY_COS, JSON.stringify(COS)); } catch (e) {} }
function initCompanies() {
  COS = loadCos();
  if (!COS.list.some((c) => c.id === COS.active)) COS.active = COS.list[0].id;
}
function activeCompanyId() { return COS ? COS.active : 'main'; }
const coSuffix = (id) => (id === 'main' ? '' : '@' + id);
function keyData(id) { return KEY + coSuffix(id || activeCompanyId()); }
function keyPrev(id) { return KEY_PREV + coSuffix(id || activeCompanyId()); }
function keyLog(id) { return 'yukyu-app-log' + coSuffix(id || activeCompanyId()); }
function readCompanyData(id) {
  try { const d = JSON.parse(localStorage.getItem(keyData(id)) || 'null'); return d && Array.isArray(d.employees) ? d : null; }
  catch (e) { return null; }
}
function coLabel(c) { return c.name || '（会社名 未設定）'; }
function uiCo(key) { const ui = loadUI(); const m = ui[key] && typeof ui[key] === 'object' ? ui[key] : {}; return m[activeCompanyId()]; }
function setUiCo(key, v) {
  const ui = loadUI();
  ui[key] = ui[key] && typeof ui[key] === 'object' ? ui[key] : {};
  if (v == null) delete ui[key][activeCompanyId()]; else ui[key][activeCompanyId()] = v;
  saveUI(ui);
}

function switchCompany(id) {
  if (!COS.list.some((c) => c.id === id)) return;
  COS.active = id; saveCos();
  DATA = loadData(); normalizeData(DATA); primeAudit();
  const first = DATA.employees.find((e) => !isRetired(e)) || DATA.employees[0];
  CUR = first ? first.id : null;
  SEARCH = ''; LEAVE_Q = ''; OPEN_EMP = null; WORK_YEAR = null; BULK_YEAR = null;
  setTab('list');
  toast(`「${coLabel(COS.list.find((c) => c.id === id))}」に切り替えました`);
}
async function companyDialog() {
  const counts = new Map(COS.list.map((c) => { const d = c.id === activeCompanyId() ? DATA : readCompanyData(c.id); return [c.id, d ? d.employees.length : 0]; }));
  const res = await sheet({
    title: '会社の切り替え', ok: '切り替える',
    html: `<p class="sub" style="margin:0">会社ごとに、従業員・記録・設定を分けて管理できます。</p>
      <div class="mini-list">${COS.list.map((c) => `<label class="chk" style="padding:10px 0;border-bottom:1px solid var(--line)">
        <input type="radio" name="coPick" value="${esc(c.id)}" ${c.id === activeCompanyId() ? 'checked' : ''}>
        <span><b>${esc(coLabel(c))}</b><small>${counts.get(c.id)}人${c.id === activeCompanyId() ? '・表示中' : ''}</small></span></label>`).join('')}</div>
      <button type="button" class="btn full" data-coadd>${ICON.plus}新しい会社を追加</button>`,
    click: (e) => { if (e.target.closest('[data-coadd]')) { e.target.closest('.dlg-ov').querySelector('[data-sh="cancel"]').click(); setTimeout(addCompany, 50); } },
    submit: (ov) => { const r = ov.querySelector('input[name="coPick"]:checked'); return r ? r.value : null; },
  });
  if (res && res !== activeCompanyId()) switchCompany(res);
}
async function addCompany() {
  const res = await sheet({
    title: '新しい会社を追加', ok: '追加して切り替える',
    html: `<div class="field"><label class="fl" for="coNew">会社名</label><input type="text" id="coNew" maxlength="40" placeholder="例：サンプル株式会社" autofocus></div>`,
    submit: (ov) => { const v = ov.querySelector('#coNew').value.trim(); if (!v) { ov.err('会社名を入れてください'); return undefined; } return v; },
  });
  if (!res) return;
  const id = 'c' + Date.now().toString(36);
  const d = { version: 1, employees: [], settings: { companyName: res.slice(0, 40) } };
  try { localStorage.setItem(keyData(id), JSON.stringify(d)); } catch (e) { toast('保存できませんでした'); return; }
  COS.list.push({ id, name: d.settings.companyName });
  saveCos();
  switchCompany(id);
}
async function deleteCompany() {
  if (COS.list.length < 2) { toast('会社が1つだけのときは削除できません'); return; }
  const cur = COS.list.find((c) => c.id === activeCompanyId());
  const name = coLabel(cur);
  const res = await sheet({
    title: `「${name}」を削除しますか？`, ok: '削除する', danger: true,
    html: `<p class="sub" style="margin:0;white-space:pre-line">この会社の従業員・記録・設定をこの端末から消します。\n直前の1社分だけは控えが残り、設定の「削除した会社を元に戻す」で戻せます。念のため先に「書き出し」をしておくと安心です。</p>
      <div class="field"><label class="fl" for="coDel">確認のため「削除」と入力</label><input type="text" id="coDel" autocomplete="off"></div>`,
    submit: (ov) => (ov.querySelector('#coDel').value.trim() === '削除' ? true : (ov.err('「削除」と入力してください'), undefined)),
  });
  if (!res) return;
  try {
    localStorage.setItem(KEY_DELCO, JSON.stringify({ savedAt: new Date().toISOString(), company: cur, data: DATA, log: loadLog() }));
  } catch (e) { toast('控えを保存できなかったため、削除をやめました'); return; }
  const id = cur.id;
  if (id === 'main') {
    // 最初の会社の保存場所は空にして、一覧からは外す（別の会社へ）
    try { localStorage.removeItem(keyData(id)); localStorage.removeItem(keyPrev(id)); localStorage.removeItem(keyLog(id)); } catch (e) {}
  } else {
    try { localStorage.removeItem(keyData(id)); localStorage.removeItem(keyPrev(id)); localStorage.removeItem(keyLog(id)); } catch (e) {}
  }
  COS.list = COS.list.filter((c) => c.id !== id);
  saveCos();
  switchCompany(COS.list[0].id);
  toast(`「${name}」を削除しました（控えが1つ残っています）`);
}
function restoreDeletedCompany() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(KEY_DELCO) || 'null'); } catch (e) {}
  if (!p || !p.company || !p.data) { toast('戻せる会社がありません'); return; }
  let id = p.company.id;
  if (COS.list.some((c) => c.id === id)) id = 'c' + Date.now().toString(36);
  try {
    localStorage.setItem(keyData(id), JSON.stringify(p.data));
    if (Array.isArray(p.log)) localStorage.setItem(keyLog(id), JSON.stringify(p.log));
    localStorage.removeItem(KEY_DELCO);
  } catch (e) { toast('戻せませんでした（空き容量が足りない可能性があります）'); return; }
  COS.list.push({ id, name: (p.data.settings && p.data.settings.companyName) || p.company.name || '' });
  saveCos();
  switchCompany(id);
}

/* =========================================================================
   操作の履歴（元に戻す）
   保存のたびに前回の保存と比べ、変わった従業員の「変える前」を残す。
   ========================================================================= */
let SHADOW = null;
const LOG_MAX = 120, LOG_UNDO_MAX = 40;
function snapshot() {
  const m = new Map();
  for (const e of DATA.employees) m.set(e.id, JSON.stringify(e));
  return { emps: m, order: DATA.employees.map((e) => e.id), settings: JSON.stringify(DATA.settings || {}) };
}
function primeAudit() { SHADOW = snapshot(); }
function loadLog() {
  try { const a = JSON.parse(localStorage.getItem(keyLog()) || '[]'); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
function saveLog(a) {
  for (let tries = 0; tries < 4; tries++) {
    try { localStorage.setItem(keyLog(), JSON.stringify(a)); return; }
    catch (e) {
      // 容量が足りないときは、古い「変える前」から捨てる
      const keep = Math.max(5, Math.floor(a.filter((x) => x.before).length / 2));
      let n = 0;
      for (const x of a) { if (x.before && ++n > keep) x.before = null; }
    }
  }
}
function autoLabel(oldJson, newEmp, added, removed) {
  if (added) return '従業員を追加';
  if (removed) return '従業員を削除';
  try {
    const o = JSON.parse(oldJson);
    const keys = new Set([...Object.keys(o), ...Object.keys(newEmp)]);
    const diff = [...keys].filter((k) => JSON.stringify(o[k]) !== JSON.stringify(newEmp[k]));
    if (diff.length === 1) {
      return { leaves: '取得の記録を変更', workdays: '出勤日数を変更', schedDays: '所定労働日数を変更', grantOverrides: '付与日数を調整' }[diff[0]] || '従業員の情報を変更';
    }
  } catch (e) {}
  return '従業員の情報を変更';
}
function afterSave(label) {
  // 書き出しの声かけ用：最後に変更した時刻
  const nowIso = new Date().toISOString();
  if (!uiCo('firstChange')) setUiCo('firstChange', nowIso);
  setUiCo('changed', nowIso);
  // 会社名の一覧を合わせる
  const cur = COS && COS.list.find((c) => c.id === activeCompanyId());
  if (cur && cur.name !== companyName()) { cur.name = companyName(); saveCos(); }

  if (!SHADOW) { primeAudit(); return; }
  const snap = snapshot();
  const before = {};
  const names = [];
  let auto = null;
  for (const [id, js] of snap.emps) {
    if (SHADOW.emps.get(id) === js) continue;
    const added = !SHADOW.emps.has(id);
    before[id] = added ? null : SHADOW.emps.get(id);
    const e = DATA.employees.find((x) => x.id === id);
    names.push(e ? e.name : '');
    auto = auto || autoLabel(before[id], e, added, false);
  }
  for (const [id, js] of SHADOW.emps) {
    if (snap.emps.has(id)) continue;
    before[id] = js;
    try { names.push(JSON.parse(js).name || ''); } catch (e) { names.push(''); }
    auto = auto || '従業員を削除';
  }
  const setChanged = snap.settings !== SHADOW.settings;
  if (!Object.keys(before).length && !setChanged) { SHADOW = snap; return; }
  const lbl = label || auto || '会社の設定を変更';
  const log = loadLog();
  const last = log[0];
  const t = Date.now();
  const sameKeys = (a, b) => { const x = Object.keys(a || {}).sort().join(','), y = Object.keys(b || {}).sort().join(','); return x === y; };
  if (last && last.before && last.label === lbl && !last.undo && t - last.at < 120000
    && sameKeys(last.before.emps, before) && !!last.before.settings === setChanged) {
    last.at = t;
    last.count = (last.count || 1) + 1;
  } else {
    log.unshift({ id: uid(), at: t, label: lbl, names: [...new Set(names.filter(Boolean))].slice(0, 6),
      before: { emps: before, order: SHADOW.order, settings: setChanged ? SHADOW.settings : null } });
  }
  log.length = Math.min(log.length, LOG_MAX);
  log.forEach((x, i) => { if (i >= LOG_UNDO_MAX) x.before = null; });
  saveLog(log);
  SHADOW = snap;
}
function touches(a, b) {
  if (!a.before || !b.before) return false;
  if (a.before.settings != null && b.before.settings != null) return true;
  return Object.keys(a.before.emps).some((k) => k in b.before.emps);
}
async function undoEntry(id) {
  const log = loadLog();
  const i = log.findIndex((x) => x.id === id);
  const en = log[i];
  if (!en || !en.before) { toast('この操作はもう元に戻せません'); return; }
  const later = log.slice(0, i).filter((x) => touches(x, en));
  const ok = await askDialog({
    title: '元に戻しますか？',
    message: `「${en.label}」（${fmtWhen(en.at)}）の前の状態に戻します。`
      + (later.length ? `\nこのあとに同じ人・同じ設定へ行った ${later.length}件の変更（${later.slice(0, 3).map((x) => x.label).join('、')}${later.length > 3 ? ' ほか' : ''}）も、一緒に取り消されます。` : '')
      + '\n戻したこと自体も履歴に残るので、もう一度元に戻せます。',
    ok: '元に戻す',
  });
  if (!ok) return;
  for (const [eid, js] of Object.entries(en.before.emps)) {
    const idx = DATA.employees.findIndex((x) => x.id === eid);
    if (js == null) { if (idx >= 0) DATA.employees.splice(idx, 1); continue; }
    const obj = JSON.parse(js);
    if (idx >= 0) DATA.employees[idx] = obj;
    else {
      const pos = Math.min(DATA.employees.length, Math.max(0, en.before.order.indexOf(eid)));
      DATA.employees.splice(pos, 0, obj);
    }
  }
  if (en.before.settings != null) DATA.settings = JSON.parse(en.before.settings);
  normalizeData(DATA);
  if (!DATA.employees.some((x) => x.id === CUR)) CUR = DATA.employees[0] ? DATA.employees[0].id : null;
  saveData(`元に戻す：${en.label}`);
  const log2 = loadLog();
  if (log2[0]) { log2[0].undo = true; saveLog(log2); }
  render();
  toast('元に戻しました');
}
function fmtWhen(t) {
  const d = new Date(t);
  const now = new Date();
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return `今日 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/* =========================================================================
   設定画面
   ========================================================================= */
function switchRow(key, checked, title, desc, attr) {
  return `<div class="optrow"><div class="g"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</div>
    <label class="sw"><input type="checkbox" ${attr || `data-set="${key}"`} ${checked ? 'checked' : ''} aria-label="${esc(title)}"><i></i></label></div>`;
}
function renderSet() {
  HIRE_DIRTY = false;
  // 作り直しても、開いていた従業員の設定は開いたままにする
  const keepOpen = new Set($$('#p-set .emp-ed[open]').map((d) => d.dataset.emp));
  if (OPEN_EMP) keepOpen.add(OPEN_EMP);
  const retOpen = !!document.querySelector('#retList[open]');
  const S = settings();
  const raw = DATA.settings || {};
  const emp = currentEmp();
  const ui = loadUI();
  let html = `<nav class="setnav" aria-label="設定の項目">
    <a href="#s-co">会社</a><a href="#s-emp">従業員</a><a href="#s-rule">付与のルール</a><a href="#s-input">入力の確認</a>
    <a href="#s-data">データ</a><a href="#s-log">操作の履歴</a><a href="#s-view">表示</a><a href="#s-lock">画面ロック</a><a href="#s-help">使い方</a></nav>`;

  /* ---- 会社 ---- */
  let del = null;
  try { del = JSON.parse(localStorage.getItem(KEY_DELCO) || 'null'); } catch (e) {}
  html += `<h2 class="sec" id="s-co" style="margin-top:0">会社</h2><div class="card">
    <div class="field"><label class="fl" for="coNameIn">会社名（帳票の宛名などに使います）</label>
      <input type="text" id="coNameIn" maxlength="40" value="${esc(companyName())}" placeholder="例：サンプル株式会社" aria-label="会社名"></div>
    <div class="row" style="flex-wrap:wrap">
      <button class="btn" data-act="cosw">会社を切り替える・追加する</button>
      ${COS.list.length > 1 ? '<button class="btn danger" data-act="codel">この会社を削除</button>' : ''}
    </div>
    ${del && del.company ? `<button class="btn quiet full" data-act="corestore" style="margin-top:8px">削除した会社を元に戻す（${esc(coLabel(del.company))}・${esc(fmtWhen(Date.parse(del.savedAt)))}）</button>` : ''}
  </div>`;

  /* ---- 従業員 ---- */
  const now = today();
  const act = DATA.employees.filter((e) => !isRetired(e, now));
  const ret = DATA.employees.filter((e) => isRetired(e, now));
  html += `<h2 class="sec" id="s-emp">従業員（在籍 ${act.length}人${ret.length ? `・退職 ${ret.length}人` : ''}）</h2><div class="card">
    ${DATA.employees.length ? '' : '<p class="sub" style="margin-bottom:12px">まだ従業員がいません。</p>'}
    ${act.map((e) => empEditorHtml(e, keepOpen.has(e.id))).join('')}
    ${ret.length ? `<details class="help" id="retList" style="box-shadow:none;margin:10px 0" ${retOpen || ret.some((e) => keepOpen.has(e.id)) ? 'open' : ''}><summary>退職した人（${ret.length}人）</summary><div class="body" style="padding:0 10px 10px">${ret.map((e) => empEditorHtml(e, keepOpen.has(e.id))).join('')}</div></details>` : ''}
    <button class="btn full" data-act="addemp">${ICON.plus}従業員を追加</button>
    ${empDatalists()}
  </div>`;

  /* ---- 付与日数の手動調整 ---- */
  if (emp) {
    const r = sim(emp, now);
    html += `<h2 class="sec">付与日数の手動調整（${esc(emp.name)}）</h2><div class="card">
      <p class="sub" style="margin-bottom:12px">通常は自動で決まります。その回だけ日数を上書きしたいときに使ってください。空欄にすると自動計算に戻ります。ほかの人は、上の選択欄で切り替えてから開いてください。</p>`;
    for (const l of r.lots) {
      html += `<div class="li"><div class="g"><div class="d1"><span class="num">${fmtJpShort(l.date)}</span><span>${l.label}</span>${l.future ? '<span class="pill mute">予定</span>' : ''}</div>
        <div class="d2">自動計算 ${fmtD(l.autoDays)}日${l.overridden ? '・<b style="color:var(--gold-ink)">手動で上書き中</b>' : ''}</div></div>
        <input type="number" step="0.5" min="0" max="99" style="width:92px;text-align:center" placeholder="${fmtD(l.autoDays)}"
          value="${l.overridden ? fmtD(l.granted) : ''}" data-ov="${l.key}" aria-label="${fmtJpShort(l.date)}の付与日数"></div>`;
    }
    if (!r.lots.length) html += '<div class="empty">付与日がまだありません</div>';
    html += `</div>`;
  }

  /* ---- 付与のルール ---- */
  const sch = S.schedule;
  const custom = !!S.grantTable || raw.grantTableOn === true;
  html += `<h2 class="sec" id="s-rule">付与のルール</h2><div class="card">
    <p class="sub" style="margin-bottom:6px">何も変えなければ法律どおりに計算します。会社の就業規則に合わせて変えられます（変えるとすぐに全員の計算に反映されます）。</p>
    <h4 style="margin:16px 0 8px;font-size:12px;letter-spacing:.12em;color:var(--gold-ink)">付与日</h4>
    <div class="grid2">
      <div><label class="fl" for="schFirst">初回の付与</label><select class="inp" id="schFirst">
        ${[6, 5, 4, 3, 2, 1, 0].map((m) => `<option value="${m}" ${sch.firstMonths === m ? 'selected' : ''}>${m === 6 ? '入社6ヶ月後（法定）' : m === 0 ? '入社日（前倒し）' : `入社${m}ヶ月後（前倒し）`}</option>`).join('')}</select></div>
      <div><label class="fl" for="schUnify">2回目以降</label><select class="inp" id="schUnify">
        <option value="" ${!sch.unify ? 'selected' : ''}>初回から1年ごと（法定）</option>
        <option value="on" ${sch.unify ? 'selected' : ''}>毎年同じ日にそろえる</option></select></div>
      ${sch.unify ? `<div><label class="fl">そろえる日</label><div class="row" style="gap:8px">
        <select class="inp" id="schM">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${sch.unify.m === i + 1 ? 'selected' : ''}>${i + 1}月</option>`).join('')}</select>
        <select class="inp" id="schD">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${sch.unify.d === i + 1 ? 'selected' : ''}>${i + 1}日</option>`).join('')}</select></div></div>` : ''}
      <div><label class="fl">このルールを使い始める日（任意）</label>${optionalDateField('schFrom', sch.from, '指定なし（入社時から）')}
        ${sch.from ? '<button class="btn sm quiet" data-act="clrschfrom" style="margin-top:4px">指定をやめる</button>' : ''}</div>
    </div>
    <p class="sub" style="margin-top:8px">付与日を早める（前倒し）場合、次の付与も法定より遅くならないように計算します。そろえる日を使うと、2回目は初回のあと最初に来るその日になります。${sch.from ? '使い始める日より前の付与は、法定どおりのままです。' : ''}</p>

    <h4 style="margin:18px 0 8px;font-size:12px;letter-spacing:.12em;color:var(--gold-ink)">付与日数の表</h4>
    <div class="seg" style="margin-bottom:10px"><button data-gtmode="legal" class="${!custom ? 'on' : ''}">法定どおり</button><button data-gtmode="custom" class="${custom ? 'on' : ''}">会社独自の表</button></div>
    ${custom ? grantTableEditor(raw.grantTable) : ''}

    <h4 style="margin:18px 0 0;font-size:12px;letter-spacing:.12em;color:var(--gold-ink)">そのほか</h4>
    ${switchRow('att8', S.att8, '出勤率8割未満の年は付与しない', '所定労働日数を「出勤」タブに入れた人だけ判定します（入っていない期間は判定せず、付与します）。育児休業・業務上の傷病などの期間は出勤として数えます。')}
    ${switchRow('prorate5', S.prorate5, '年5日の期間が重なるときは比例按分する', '付与日を早めて1年の期間が重なるとき、期間をまとめて「月数÷12×5日」を必要日数にします（労基則 第24条の5）。オフなら期間ごとに5日です。')}
    ${switchRow('hourly', S.hourly.enabled, '時間単位年休を使う', '1時間単位の取得を記録できます（労使協定が必要）。時間単位で取った分は年5日の取得義務に含まれません。')}
    ${S.hourly.enabled ? `<div class="optrow"><div class="g"><b>時間単位で取れる上限</b><small>1年あたり。法律の上限は5日分です。</small></div>
      <select class="inp" id="hourCap" style="width:120px">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${S.hourly.capDays === n ? 'selected' : ''}>${n}日分</option>`).join('')}</select></div>` : ''}
  </div>`;

  /* ---- 入力の確認 ---- */
  html += `<h2 class="sec" id="s-input">入力の確認</h2><div class="card">
    ${switchRow('checkHoliday', raw.checkHoliday !== false, '土日・祝日の記録を確認する', '取得日が土日・祝日（勤務パターンがある人は勤務日でない日）のとき、記録する前に確認します。土日も営業する店舗ではオフにしてください。')}
  </div>`;

  /* ---- データ ---- */
  const prev = loadPrevious();
  const exp = uiCo('exported');
  html += `<h2 class="sec" id="s-data">データ</h2><div class="card">
    <p class="sub" style="margin-bottom:14px">データはこの端末のブラウザ内にだけ保存され、外部には送信されません。機種変更やバックアップにはJSONの書き出し／読み込みを使ってください。<br>
      最後の書き出し：<b>${exp ? esc(fmtWhen(Date.parse(exp))) : 'まだありません'}</b></p>
    <div class="row" style="margin-bottom:10px">
      <button class="btn" data-act="export">${ICON.down}書き出し</button>
      <button class="btn" data-act="import">読み込み</button>
    </div>
    <div class="optrow"><div class="g"><b>消えにくい保存</b><small id="persistState">確認しています…</small></div>
      <button class="btn sm" data-act="persist" id="persistBtn">申請する</button></div>
    ${prev ? `<button class="btn quiet full" data-act="restoreprev" style="margin-bottom:6px">直前のデータに戻す（${esc(prevLabel(prev))}）</button>` : ''}
    <button class="btn danger full" data-act="reset">この会社のデータを消去</button>
  </div>
  <div class="card">
    <h3 style="margin:0 0 6px;font-size:15px">CSVの取り込み</h3>
    <p class="sub" style="margin-bottom:12px">Excelや給与ソフトから書き出したCSVを取り込めます（Shift_JIS・UTF-8どちらも可）。取り込む前に内容を確認する画面が出ます。ひな形をExcelで開いて、同じ列の形で作ってください。</p>
    ${[['work', '出勤日数', '月ごとの出勤日数（と所定労働日数）'], ['emp', '従業員名簿', '氏名・社員番号・入社日・店舗など。社員番号か氏名が同じ人は上書き'], ['open', '移行時の残日数', '移行日と、付与日ごとの残日数']]
      .map(([k, t, d]) => `<div class="optrow"><div class="g"><b>${t}</b><small>${d}</small></div>
        <div class="row" style="flex:none;gap:6px"><button class="btn sm" data-act="tpl" data-kind="${k}">ひな形</button><button class="btn sm primary" data-act="csvin" data-kind="${k}">取り込む</button></div></div>`).join('')}
  </div>`;

  /* ---- 操作の履歴 ---- */
  const log = loadLog();
  html += `<h2 class="sec" id="s-log">操作の履歴</h2><div class="card">
    <p class="sub" style="margin-bottom:8px">この端末で行った変更です。間違えたときは「元に戻す」で、その操作の前に戻せます（新しい40件まで）。</p>
    <div class="loglist">${log.length ? log.slice(0, 30).map((x) => `<div class="it"><div class="g"><b>${esc(x.label)}</b>
        <small>${esc(fmtWhen(x.at))}${x.names && x.names.length ? `・${esc(x.names.join('、'))}` : ''}${x.count > 1 ? `・${x.count}回の入力` : ''}</small></div>
        ${x.before ? `<button class="btn sm" data-act="undo" data-id="${esc(x.id)}">元に戻す</button>` : ''}</div>`).join('')
      : '<p class="sub">まだ履歴はありません。</p>'}</div>
  </div>`;

  /* ---- 表示 ---- */
  const th = ui.theme || 'auto';
  const fs = ui.fontScale || 'normal';
  html += `<h2 class="sec" id="s-view">表示</h2><div class="card">
    <label class="fl">テーマ</label>
    <div class="seg" style="margin-bottom:16px">
      ${[['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']].map(([v, t]) => `<button data-theme="${v}" class="${th === v ? 'on' : ''}">${t}</button>`).join('')}
    </div>
    <label class="fl">文字の大きさ</label>
    <div class="seg">${[['normal', '標準'], ['large', '大'], ['xlarge', '特大']].map(([v, t]) => `<button data-fs="${v}" class="${fs === v ? 'on' : ''}">${t}</button>`).join('')}</div>
  </div>`;

  /* ---- 画面ロック ---- */
  const lock = ui.lock && ui.lock.hash ? ui.lock : null;
  html += `<h2 class="sec" id="s-lock">画面ロック</h2><div class="card">
    <p class="sub" style="margin-bottom:12px">アプリを開くときと、しばらく離れたあとにパスコードを求めます。<b>のぞき見を防ぐためのもの</b>で、データそのものは暗号化しません（データを守るには、書き出しのパスワード保護を使ってください）。パスコードを忘れても、30秒待てば解除できます（解除したことはダッシュボードに表示されます）。</p>
    ${lock ? `<div class="optrow"><div class="g"><b>自動でロックするまで</b><small>アプリから離れてからの時間</small></div>
        <select class="inp" id="lockMin" style="width:130px">${[1, 5, 15, 60].map((m) => `<option value="${m}" ${Number(lock.min || 5) === m ? 'selected' : ''}>${m}分</option>`).join('')}</select></div>
      <div class="row" style="flex-wrap:wrap;margin-top:8px"><button class="btn" data-act="locknow">今すぐロック</button><button class="btn" data-act="lockset">パスコードを変える</button><button class="btn danger" data-act="lockoff">ロックをやめる</button></div>`
      : `<button class="btn full" data-act="lockset">パスコードを設定する</button>`}
  </div>`;

  /* ---- 使い方・ルール ---- */
  html += `<h2 class="sec" id="s-help">使い方</h2><div class="card">
    <button class="btn full" data-act="tour">使い方の案内をもう一度見る</button></div>`;
  html += grantTableHelp();
  html += `<details class="help"><summary>計算ルールについて</summary><div class="body">
    <p><b>基準日</b>：入社日の6ヶ月後、以降1年ごと（付与のルールで前倒し・統一もできます）。月末入社の場合は該当月の末日に丸めます。</p>
    <p><b>付与日数</b>：出勤実績か契約の勤務日数から「1年間の所定労働日数」を決め、比例付与表で判定します。週30時間以上の人は通常の付与です。</p>
    <p><b>時効</b>：付与日から2年で消滅します（労基法 第115条）。</p>
    <p><b>消化の順番</b>：有効期限の近いもの（＝古い付与分）から消費します。</p>
    <p><b>年5日の取得義務</b>：10日以上付与された場合、付与日から1年以内に5日取得させる義務があります（労基法 第39条第7項）。半日は0.5日として数え、時間単位で取った分は含めません。計画年休で取った日は含めます。</p>
    <p><b>管理簿の保存</b>：その年休を与えた期間中と、期間の満了後5年間（当分の間は3年間）。</p>
    <p style="color:var(--danger)"><b>ご注意</b>：本アプリは法定の基準に基づく目安です。最終的な判断は就業規則と実際の労務管理でご確認ください。祝日は計算で出しているため、内閣府の発表と異なる場合があります。</p>
  </div></details>
  <h2 class="sec">アプリの更新</h2><div class="card">
    <div class="kv"><span>いま動いているバージョン</span><b>${APP_VERSION}</b></div>
    <p class="sub" style="margin:12px 0 14px">最新版が出ているか確認して、あれば読み込み直します。</p>
    <button class="btn full" data-act="update">更新を確認する</button>
  </div>
  <p class="verline"><b>有給管理</b>${APP_VERSION}</p>`;

  $('#p-set').innerHTML = html;
  OPEN_EMP = null;
  updatePersistState();
}
function grantTableEditor(table) {
  const t = Array.isArray(table) ? table : [];
  return `<div class="tw"><table class="gtable"><thead><tr><th>勤務区分</th>${['0.5年', '1.5', '2.5', '3.5', '4.5', '5.5', '6.5〜'].map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${GRANT_TABLE.map((row, ri) => `<tr><td style="white-space:normal;min-width:96px">${esc(row.short)}</td>${row.days.map((d, ci) => {
      const v = t[ri] && t[ri][ci] != null && t[ri][ci] !== '' ? t[ri][ci] : '';
      return `<td><input type="number" min="0" max="99" step="0.5" inputmode="decimal" value="${esc(v)}" placeholder="${d}" data-gt="${ri},${ci}" aria-label="${esc(row.short)} ${ci === 6 ? '6.5年以上' : `${ci}.5年`}の日数"></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>
  <p class="sub" style="margin-top:8px">空欄は法定の日数（薄い数字）を使います。法定より少ない日数は使えないため、入れても法定の日数になります。</p>`;
}

/* ---------- 消えにくい保存 ---------- */
async function updatePersistState() {
  const el = $('#persistState'), btn = $('#persistBtn');
  if (!el) return;
  if (!(navigator.storage && navigator.storage.persisted)) {
    el.textContent = 'このブラウザでは使えません。こまめに書き出してください。';
    if (btn) btn.hidden = true; return;
  }
  try {
    const on = await navigator.storage.persisted();
    el.textContent = on ? '有効です。空き容量が減っても、ブラウザが自動でデータを消しにくくなっています。'
      : '未設定です。申請すると、空き容量が減ってもブラウザが自動でデータを消しにくくなります（ホーム画面に追加すると許可されやすくなります）。';
    if (btn) btn.hidden = on;
  } catch (e) { el.textContent = '状態を確認できませんでした'; }
}
async function requestPersist() {
  if (!(navigator.storage && navigator.storage.persist)) { toast('このブラウザでは使えません'); return; }
  try {
    const ok = await navigator.storage.persist();
    toast(ok ? '消えにくい保存になりました' : 'ブラウザに許可されませんでした。ホーム画面に追加してから、もう一度お試しください');
  } catch (e) { toast('申請できませんでした'); }
  updatePersistState();
}

/* =========================================================================
   書き出し・読み込み（パスワード保護）
   ========================================================================= */
async function exportData() {
  if (window.__PREVIEW__) { toast('書き出しはGitHub Pages版で使えます'); return; }
  const canPw = IO.canCrypto();
  const res = await sheet({
    title: 'データを書き出す', ok: '書き出す',
    html: `<p class="sub" style="margin:0">「${esc(companyName() || 'この会社')}」の全員分を、JSONファイルとして保存します。別の端末の「読み込み」で戻せます。</p>
      ${canPw ? `<label class="chk"><input type="checkbox" id="exPw"><span>パスワードをかける<small>ファイルを開くのにパスワードが必要になります。忘れると読み込めなくなるので注意してください。</small></span></label>
      <div id="exPwBox" hidden><div class="field"><label class="fl" for="exPw1">パスワード（8文字以上）</label><input type="password" id="exPw1" autocomplete="new-password"></div>
        <div class="field"><label class="fl" for="exPw2">もう一度</label><input type="password" id="exPw2" autocomplete="new-password"></div></div>` : ''}`,
    change: (e, ov) => { if (e.target.id === 'exPw') ov.querySelector('#exPwBox').hidden = !e.target.checked; },
    submit: (ov) => {
      const on = ov.querySelector('#exPw') && ov.querySelector('#exPw').checked;
      if (!on) return { pw: '' };
      const a = ov.querySelector('#exPw1').value, b = ov.querySelector('#exPw2').value;
      if (a.length < 8) { ov.err('パスワードは8文字以上にしてください'); return undefined; }
      if (a !== b) { ov.err('2つのパスワードが違います'); return undefined; }
      return { pw: a };
    },
  });
  if (!res) return;
  let text = JSON.stringify(DATA, null, 2);
  if (res.pw) {
    toast('暗号化しています…');
    try { text = await IO.encryptText(text, res.pw); }
    catch (e) { toast('暗号化できませんでした（このブラウザでは使えない可能性があります）'); return; }
  }
  const nm = (companyName() || '').replace(/[\\/:*?"<>|\s]/g, '').slice(0, 20);
  IO.download(`有給管理データ_${nm ? nm + '_' : ''}${ymd(today())}${res.pw ? '_パスワード付き' : ''}.json`, text, 'application/json');
  setUiCo('exported', new Date().toISOString());
  setUiCo('snooze', null);
  toast(res.pw ? 'パスワード付きで書き出しました' : 'JSONを書き出しました');
  render();
}
/** パスワード付きのファイルを開く。成功すれば中身の文字列、やめたら null */
async function askPasswordAndDecrypt(obj) {
  if (!IO.canCrypto()) { await askDialog({ title: '読み込めません', message: 'このブラウザでは、パスワード付きのファイルを開けません。', ok: '閉じる', cancel: false }); return null; }
  return sheet({
    title: 'パスワード付きのファイルです', ok: '開く',
    html: `<p class="sub" style="margin:0">書き出したときに決めたパスワードを入れてください。</p>
      <div class="field"><label class="fl" for="imPw">パスワード</label><input type="password" id="imPw" autocomplete="current-password" autofocus></div>`,
    submit: async (ov) => {
      try { return await IO.decryptText(obj, ov.querySelector('#imPw').value); }
      catch (e) { ov.err('パスワードが違うか、ファイルが壊れています'); return undefined; }
    },
  });
}

/* =========================================================================
   CSV の取り込み
   ========================================================================= */
const TEMPLATES = {
  work: { name: '出勤日数', rows: [['社員番号', '氏名', '年月', '出勤日数', '所定労働日数'], ['0103', '佐藤 美咲', '2026-04', '20', '21'], ['0103', '佐藤 美咲', '2026-05', '18', '19']] },
  emp: { name: '従業員名簿', rows: [['社員番号', '氏名', '入社日', '店舗・拠点', '部署', '雇用形態', '週の勤務日数（目安）', '退職日'], ['0103', '佐藤 美咲', '2021-08-01', '本店', '', '正社員', '5', ''], ['0207', '高橋 由紀', '2023-06-01', '駅前店', '', 'パート・アルバイト', '3', '']] },
  open: { name: '移行時の残日数', rows: [['社員番号', '氏名', '移行日', '付与日', '残日数', '年5日の取得済み日数'], ['0103', '佐藤 美咲', '2026-11-01', '2025-02-01', '3', '3'], ['0103', '佐藤 美咲', '2026-11-01', '2026-02-01', '11', '3']] },
};
function saveTemplate(kind) {
  if (window.__PREVIEW__) { toast('保存はGitHub Pages版で使えます'); return; }
  const t = TEMPLATES[kind];
  downloadText(`ひな形_${t.name}.csv`, toCSV(t.rows));
  toast('ひな形を保存しました');
}
const norm = (s) => IO.hankaku(s).replace(/[\s　]/g, '');
function colIdx(head, words) { return head.findIndex((h) => words.some((w) => norm(h).includes(w))); }
function findEmp(no, name) {
  if (no) { const e = DATA.employees.find((x) => norm(x.empNo) === norm(no)); if (e) return e; }
  if (name) { const e = DATA.employees.filter((x) => norm(x.name) === norm(name)); if (e.length === 1) return e[0]; }
  return null;
}
function intCell(v, max) {
  const t = IO.hankaku(v);
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= max && Math.round(n * 2) === n * 2 ? n : NaN;
}

function parseWorkCsv(rows) {
  const head = rows[0] || [];
  const iNo = colIdx(head, ['社員番号', '従業員番号', '番号', 'ID']);
  const iName = colIdx(head, ['氏名', '名前']);
  const iYm = colIdx(head, ['年月']);
  const iWork = colIdx(head, ['出勤']);
  const iSched = colIdx(head, ['所定']);
  if (iNo < 0 && iName < 0) return { error: '「社員番号」か「氏名」の列が見つかりません' };
  const out = new Map(); const errs = []; const missing = new Set();
  const put = (e, ym, w, s, line) => {
    if (!out.has(e)) out.set(e, []);
    if (w != null && !Number.isNaN(w)) out.get(e).push(['work', ym, Math.round(w)]);
    if (s != null && !Number.isNaN(s)) out.get(e).push(['sched', ym, Math.round(s)]);
    if (Number.isNaN(w) || Number.isNaN(s)) errs.push(`${line}行目：日数は0〜31で入れてください`);
  };
  if (iYm >= 0 && (iWork >= 0 || iSched >= 0)) {
    rows.slice(1).forEach((r, k) => {
      const e = findEmp(r[iNo], r[iName]);
      if (!e) { missing.add((r[iName] || r[iNo] || '').trim() || `${k + 2}行目`); return; }
      const ym = IO.parseMonthLoose(r[iYm]);
      if (!ym) { errs.push(`${k + 2}行目：年月「${r[iYm]}」が読めません（例：2026-04）`); return; }
      put(e, ym, iWork >= 0 ? intCell(r[iWork], 31) : null, iSched >= 0 ? intCell(r[iSched], 31) : null, k + 2);
    });
  } else {
    // 横に月が並ぶ形（氏名, 2026-01, 2026-02, ...）は出勤日数として読む
    const months = head.map((h) => IO.parseMonthLoose(h));
    if (!months.some(Boolean)) return { error: '「年月」と「出勤日数」の列（または 2026-04 のような月の列）が見つかりません' };
    rows.slice(1).forEach((r, k) => {
      const e = findEmp(r[iNo], r[iName]);
      if (!e) { missing.add((r[iName] || r[iNo] || '').trim() || `${k + 2}行目`); return; }
      months.forEach((ym, c) => { if (ym) put(e, ym, intCell(r[c], 31), null, k + 2); });
    });
  }
  return { out, errs, missing: [...missing] };
}
function parseEmpCsv(rows) {
  const head = rows[0] || [];
  const ix = {
    no: colIdx(head, ['社員番号', '従業員番号', '番号', 'ID']), name: colIdx(head, ['氏名', '名前']), hire: colIdx(head, ['入社']),
    store: colIdx(head, ['店舗', '拠点', '事業所']), dept: colIdx(head, ['部署', '所属']), type: colIdx(head, ['雇用形態', '雇用区分']),
    weekly: colIdx(head, ['週の勤務', '週勤務', '勤務日数']), retire: colIdx(head, ['退職']),
  };
  if (ix.name < 0 || ix.hire < 0) return { error: '「氏名」と「入社日」の列が必要です' };
  const items = []; const errs = [];
  rows.slice(1).forEach((r, k) => {
    const line = k + 2;
    const name = (r[ix.name] || '').trim();
    if (!name) { errs.push(`${line}行目：氏名がありません`); return; }
    const hire = IO.parseDateLoose(r[ix.hire]);
    if (!hire) { errs.push(`${line}行目：入社日「${r[ix.hire] || ''}」が読めません（例：2021-08-01）`); return; }
    const retireRaw = ix.retire >= 0 ? (r[ix.retire] || '').trim() : '';
    const retire = retireRaw ? IO.parseDateLoose(retireRaw) : '';
    if (retireRaw && !retire) { errs.push(`${line}行目：退職日「${retireRaw}」が読めません`); return; }
    const w = ix.weekly >= 0 ? intCell(r[ix.weekly], 5) : null;
    const rec = { name: name.slice(0, 40), empNo: ix.no >= 0 ? (r[ix.no] || '').trim().slice(0, 20) : '', hireDate: hire,
      store: ix.store >= 0 ? (r[ix.store] || '').trim().slice(0, 30) : null, dept: ix.dept >= 0 ? (r[ix.dept] || '').trim().slice(0, 30) : null,
      empType: ix.type >= 0 ? (r[ix.type] || '').trim().slice(0, 20) : null, weekly: w >= 1 && w <= 5 ? Math.round(w) : null, retire };
    items.push({ rec, emp: findEmp(rec.empNo, rec.name) });
  });
  return { items, errs };
}
function parseOpenCsv(rows) {
  const head = rows[0] || [];
  const ix = { no: colIdx(head, ['社員番号', '従業員番号', '番号', 'ID']), name: colIdx(head, ['氏名', '名前']), od: colIdx(head, ['移行日']),
    gd: colIdx(head, ['付与日']), rem: colIdx(head, ['残日数', '残']), ob: colIdx(head, ['年5日', '取得済']) };
  if ((ix.no < 0 && ix.name < 0) || ix.od < 0 || ix.gd < 0 || ix.rem < 0) return { error: '「社員番号か氏名」「移行日」「付与日」「残日数」の列が必要です' };
  const per = new Map(); const errs = []; const missing = new Set();
  rows.slice(1).forEach((r, k) => {
    const line = k + 2;
    const e = findEmp(r[ix.no], r[ix.name]);
    if (!e) { missing.add((r[ix.name] || r[ix.no] || '').trim() || `${line}行目`); return; }
    const od = IO.parseDateLoose(r[ix.od]), gd = IO.parseDateLoose(r[ix.gd]);
    if (!od || !gd) { errs.push(`${line}行目：日付が読めません（例：2026-11-01）`); return; }
    const rem = intCell(r[ix.rem], 99);
    if (rem == null || Number.isNaN(rem)) { errs.push(`${line}行目：残日数は0以上・0.5日単位で入れてください`); return; }
    const p = per.get(e) || { date: od, lots: {}, obTaken: 0, lines: [] };
    if (p.date !== od) { errs.push(`${line}行目：同じ人の移行日はそろえてください`); return; }
    p.lots[gd] = rem; p.lines.push(line);
    if (ix.ob >= 0) { const ob = intCell(r[ix.ob], 40); if (ob > 0) p.obTaken = ob; }
    per.set(e, p);
  });
  // 付与日が計算上の付与日と合っているか
  for (const [e, p] of per) {
    const d = parseYmd(p.date);
    const tmp = JSON.parse(JSON.stringify(e)); delete tmp.opening;
    const lots = buildLots(tmp, d, settings()).filter((l) => l.date <= d && l.expiry > d);
    const keys = new Set(lots.map((l) => l.key));
    for (const [gd, v] of Object.entries(p.lots)) {
      const l = lots.find((x) => x.key === gd);
      if (!keys.has(gd)) errs.push(`${e.name}：付与日 ${gd} は、入社日から計算した有効な付与日（${lots.map((x) => x.key).join('、') || 'なし'}）と合いません`);
      else if (v > l.granted) errs.push(`${e.name}：${gd} の残日数 ${v}日 が付与日数 ${l.granted}日 を超えています`);
    }
    p.missingLots = lots.filter((l) => !(l.key in p.lots)).map((l) => l.key);
  }
  return { per, errs, missing: [...missing] };
}

async function csvImport(kind, text) {
  const rows = IO.parseCSV(text);
  if (rows.length < 2) { await askDialog({ title: '読み込めませんでした', message: '見出しの行と、1行以上のデータが必要です。', ok: '閉じる', cancel: false }); return; }
  const listHtml = (arr, max) => arr.slice(0, max).map((x) => `・${esc(x)}`).join('<br>') + (arr.length > max ? `<br>ほか${arr.length - max}件` : '');
  if (kind === 'work') {
    const p = parseWorkCsv(rows);
    if (p.error) { await askDialog({ title: '読み込めませんでした', message: p.error, ok: '閉じる', cancel: false }); return; }
    let nw = 0, ns = 0, over = 0;
    for (const [e, list] of p.out) for (const [k, ym] of list) {
      const map = k === 'work' ? e.workdays : (e.schedDays || {});
      if (typeof map[ym] === 'number') over++;
      if (k === 'work') nw++; else ns++;
    }
    const ok = await sheet({
      title: '出勤日数の取り込み', ok: nw + ns ? '取り込む' : '閉じる', cancel: nw + ns ? 'やめる' : false, wide: true,
      html: `<div class="preview"><b>${p.out.size}</b>人・出勤日数 <b>${nw}</b>件${ns ? `・所定労働日数 <b>${ns}</b>件` : ''} を取り込みます。${over ? `<br>すでに入っている ${over}件は上書きされます。` : ''}</div>
        ${p.missing.length ? `<div class="preview bad">見つからない人（社員番号か氏名を確認）：<br>${listHtml(p.missing, 8)}</div>` : ''}
        ${p.errs.length ? `<div class="preview bad">読めない行（飛ばします）：<br>${listHtml(p.errs, 8)}</div>` : ''}
        ${ns && !settings().att8 ? '<p class="sub" style="margin:0">所定労働日数は、付与のルールで「出勤率8割」をオンにすると使われます。</p>' : ''}`,
      submit: () => nw + ns > 0,
    });
    if (!ok) return;
    keepPrevious('出勤日数の取り込み');
    for (const [e, list] of p.out) for (const [k, ym, v] of list) {
      if (k === 'work') e.workdays[ym] = v;
      else { if (!isObj(e.schedDays)) e.schedDays = {}; e.schedDays[ym] = v; }
    }
    saveData(`出勤日数をCSVから取り込み（${p.out.size}人）`); render();
    toast(`${nw + ns}件を取り込みました`);
    return;
  }
  if (kind === 'emp') {
    const p = parseEmpCsv(rows);
    if (p.error) { await askDialog({ title: '読み込めませんでした', message: p.error, ok: '閉じる', cancel: false }); return; }
    const add = p.items.filter((x) => !x.emp), upd = p.items.filter((x) => x.emp);
    const ok = await sheet({
      title: '従業員名簿の取り込み', ok: p.items.length ? '取り込む' : '閉じる', cancel: p.items.length ? 'やめる' : false, wide: true,
      html: `<div class="preview">新しく登録 <b>${add.length}</b>人・更新 <b>${upd.length}</b>人
          ${add.length ? `<br>登録：${esc(add.slice(0, 10).map((x) => x.rec.name).join('、'))}${add.length > 10 ? ' ほか' : ''}` : ''}
          ${upd.length ? `<br>更新：${esc(upd.slice(0, 10).map((x) => x.rec.name).join('、'))}${upd.length > 10 ? ' ほか' : ''}（空欄の項目は変えません）` : ''}</div>
        ${p.errs.length ? `<div class="preview bad">読めない行（飛ばします）：<br>${listHtml(p.errs, 8)}</div>` : ''}`,
      submit: () => p.items.length > 0,
    });
    if (!ok) return;
    keepPrevious('従業員名簿の取り込み');
    for (const x of p.items) {
      const r = x.rec;
      let e = x.emp;
      if (!e) {
        e = { id: uid(), name: r.name, empNo: r.empNo, hireDate: r.hireDate, weeklyDays: r.weekly || 5, workdays: {}, leaves: [], grantOverrides: {} };
        DATA.employees.push(e);
      } else {
        e.name = r.name; if (r.empNo) e.empNo = r.empNo; e.hireDate = r.hireDate;
        if (r.weekly) e.weeklyDays = r.weekly;
      }
      if (r.store) e.store = r.store;
      if (r.dept) e.dept = r.dept;
      if (r.empType) e.empType = r.empType;
      if (r.retire) e.retireDate = r.retire;
      normalizeEmployee(e);
    }
    if (!CUR && DATA.employees[0]) CUR = DATA.employees[0].id;
    saveData(`従業員名簿をCSVから取り込み（登録${add.length}人・更新${upd.length}人）`); render();
    toast(`登録${add.length}人・更新${upd.length}人を取り込みました`);
    return;
  }
  if (kind === 'open') {
    const p = parseOpenCsv(rows);
    if (p.error) { await askDialog({ title: '読み込めませんでした', message: p.error, ok: '閉じる', cancel: false }); return; }
    const can = p.errs.length === 0 && p.per.size > 0;
    const warn = [...p.per].filter(([, x]) => x.missingLots.length).map(([e, x]) => `${e.name}：${x.missingLots.join('、')} 付与分は残0日として扱います`);
    const ok = await sheet({
      title: '移行時の残日数の取り込み', ok: can ? '取り込む' : '閉じる', cancel: can ? 'やめる' : false, wide: true,
      html: `<div class="preview"><b>${p.per.size}</b>人分の移行時の残日数を設定します。移行日より前の取得の記録は、残日数の計算に使わなくなります。</div>
        ${warn.length ? `<div class="preview">${listHtml(warn, 6)}</div>` : ''}
        ${p.missing.length ? `<div class="preview bad">見つからない人：<br>${listHtml(p.missing, 8)}</div>` : ''}
        ${p.errs.length ? `<div class="preview bad">直してから取り込んでください：<br>${listHtml(p.errs, 10)}</div>` : ''}`,
      submit: () => can,
    });
    if (!ok) return;
    keepPrevious('移行時の残日数の取り込み');
    for (const [e, x] of p.per) e.opening = { date: x.date, lots: x.lots, obTaken: x.obTaken || 0 };
    saveData(`移行時の残日数をCSVから取り込み（${p.per.size}人）`); render();
    toast(`${p.per.size}人分を取り込みました`);
  }
}

/* =========================================================================
   書き出しの声かけ・ダッシュボードのお知らせ
   ========================================================================= */
function dashBanners() {
  let html = '';
  const ui = loadUI();
  if (ui.lockReset) {
    html += `<div class="banner danger">${ICON.alert}<div class="tx"><b>画面ロックがパスコードなしで解除されました</b>${esc(fmtWhen(Date.parse(ui.lockReset)))}。心当たりがなければ、設定の画面ロックでパスコードを設定し直してください。</div>
      <div class="acts"><button class="btn sm" data-act="lockresetok">確認した</button></div></div>`;
  }
  if (!DATA.employees.length) return html;
  const exp = uiCo('exported'), chg = uiCo('changed'), first = uiCo('firstChange'), snooze = uiCo('snooze');
  if (snooze && Date.now() < Number(snooze)) return html;
  const day = 86400000;
  const since = exp ? Math.floor((Date.now() - Date.parse(exp)) / day) : null;
  const need = chg && (exp
    ? Date.parse(chg) > Date.parse(exp) && since >= 30
    : first && Date.now() - Date.parse(first) >= 3 * day);
  if (need) {
    html += `<div class="banner">${ICON.down}<div class="tx"><b>${since == null ? 'まだ一度も書き出していません' : `最後の書き出しから${since}日たちました`}</b>
      データはこの端末のブラウザの中にだけあります。端末の故障や履歴の消去に備えて、書き出して控えを残してください。</div>
      <div class="acts"><button class="btn sm primary" data-act="export">書き出す</button><button class="btn sm" data-act="snooze">あとで</button></div></div>`;
  }
  return html;
}
function renderSideFoot() {
  const el = $('#sideFoot');
  if (!el) return;
  const exp = uiCo('exported');
  const since = exp ? Math.floor((Date.now() - Date.parse(exp)) / 86400000) : null;
  const n = DATA.employees.filter((e) => !isRetired(e)).length;
  el.innerHTML = `<div class="t">在籍 ${n}人</div>
    <div class="d ${since == null || since >= 30 ? 'warn' : ''}">${since == null ? 'まだ書き出していません' : `最後の書き出し ${since === 0 ? '今日' : `${since}日前`}`}</div>
    <div class="d">${APP_VERSION}</div>`;
}

/* =========================================================================
   画面ロック（のぞき見防止）
   ========================================================================= */
let LOCK_HIDDEN_AT = 0;
let LOCK_FAILS = 0;
async function lockSet() {
  if (!IO.canCrypto()) { toast('このブラウザでは使えません'); return; }
  const ui = loadUI();
  const had = ui.lock && ui.lock.hash;
  const res = await sheet({
    title: had ? 'パスコードを変える' : '画面ロックのパスコード', ok: '設定する',
    html: `${had ? `<div class="field"><label class="fl" for="lkOld">いまのパスコード</label><input type="password" id="lkOld" inputmode="numeric" autocomplete="off"></div>` : ''}
      <div class="field"><label class="fl" for="lk1">新しいパスコード（数字4〜8けた）</label><input type="password" id="lk1" inputmode="numeric" autocomplete="off" maxlength="8"></div>
      <div class="field"><label class="fl" for="lk2">もう一度</label><input type="password" id="lk2" inputmode="numeric" autocomplete="off" maxlength="8"></div>`,
    submit: async (ov) => {
      if (had) {
        const h = await IO.hashPass(ov.querySelector('#lkOld').value, ui.lock.salt);
        if (h.hash !== ui.lock.hash) { ov.err('いまのパスコードが違います'); return undefined; }
      }
      const a = ov.querySelector('#lk1').value, b = ov.querySelector('#lk2').value;
      if (!/^\d{4,8}$/.test(a)) { ov.err('数字4〜8けたにしてください'); return undefined; }
      if (a !== b) { ov.err('2つのパスコードが違います'); return undefined; }
      return a;
    },
  });
  if (!res) return;
  const h = await IO.hashPass(res);
  const u2 = loadUI();
  u2.lock = { salt: h.salt, hash: h.hash, min: (u2.lock && u2.lock.min) || 5 };
  delete u2.lockReset;
  saveUI(u2);
  renderSet();
  toast('画面ロックを設定しました');
}
async function lockOff() {
  const ui = loadUI();
  if (!ui.lock) return;
  const res = await sheet({
    title: '画面ロックをやめる', ok: 'やめる', danger: true,
    html: `<div class="field"><label class="fl" for="lkCur">いまのパスコード</label><input type="password" id="lkCur" inputmode="numeric" autocomplete="off"></div>`,
    submit: async (ov) => {
      const h = await IO.hashPass(ov.querySelector('#lkCur').value, ui.lock.salt);
      if (h.hash !== ui.lock.hash) { ov.err('パスコードが違います'); return undefined; }
      return true;
    },
  });
  if (!res) return;
  const u2 = loadUI(); delete u2.lock; saveUI(u2);
  renderSet();
  toast('画面ロックをやめました');
}
function showLock() {
  const ui = loadUI();
  if (!(ui.lock && ui.lock.hash) || document.querySelector('.lock-ov')) return;
  const ov = document.createElement('div');
  ov.className = 'lock-ov';
  ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'lkT');
  ov.innerHTML = `<form class="lock-box" autocomplete="off">
    <span class="mono" aria-hidden="true">${MONO_SVG}</span>
    <h3 id="lkT">有給管理</h3><p>パスコードを入れてください</p>
    <input type="password" inputmode="numeric" maxlength="8" id="lkIn" aria-label="パスコード" autocomplete="off">
    <div class="err" role="alert"></div>
    <button class="btn primary" type="submit">開く</button>
    <button class="forgot" type="button" data-lk="forgot">パスコードを忘れた</button></form>`;
  document.body.appendChild(ov);
  document.body.classList.add('modal-open');
  const inp = ov.querySelector('#lkIn');
  const err = ov.querySelector('.err');
  setTimeout(() => inp.focus(), 50);
  ov.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (LOCK_FAILS >= 5) { err.textContent = '何度も違ったため、30秒待ってからやり直してください'; return; }
    const h = await IO.hashPass(inp.value, loadUI().lock.salt);
    if (h.hash === loadUI().lock.hash) {
      LOCK_FAILS = 0;
      ov.remove();
      if (!document.querySelector('.dlg-ov, .dp-ov, .reg-ov')) document.body.classList.remove('modal-open');
      return;
    }
    LOCK_FAILS++;
    inp.value = '';
    err.textContent = LOCK_FAILS >= 5 ? '何度も違ったため、30秒待ってからやり直してください' : 'パスコードが違います';
    if (LOCK_FAILS >= 5) setTimeout(() => { LOCK_FAILS = 0; err.textContent = ''; }, 30000);
  });
  ov.querySelector('[data-lk="forgot"]').addEventListener('click', () => {
    const box = ov.querySelector('.lock-box');
    let n = 30;
    box.innerHTML = `<span class="mono" aria-hidden="true">${MONO_SVG}</span><h3>ロックを解除します</h3>
      <p>パスコードなしで解除し、パスコードの設定を消します。データは消えません。<br>解除したことは、ダッシュボードに表示されます。</p>
      <div class="err" style="color:var(--hero-gold)" aria-live="polite">あと <b data-cd>${n}</b> 秒</div>
      <button class="btn primary" type="button" data-lk="go" disabled>解除する</button>
      <button class="forgot" type="button" data-lk="back">やめる（パスコードを入れる）</button>`;
    const timer = setInterval(() => {
      n--;
      const cd = box.querySelector('[data-cd]');
      if (cd) cd.textContent = n;
      if (n <= 0) { clearInterval(timer); const g = box.querySelector('[data-lk="go"]'); if (g) g.disabled = false; }
    }, 1000);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lk]');
      if (!b) return;
      if (b.dataset.lk === 'back') { clearInterval(timer); ov.remove(); showLock(); }
      if (b.dataset.lk === 'go' && n <= 0) {
        const u2 = loadUI(); delete u2.lock; u2.lockReset = new Date().toISOString(); saveUI(u2);
        ov.remove();
        if (!document.querySelector('.dlg-ov, .dp-ov, .reg-ov')) document.body.classList.remove('modal-open');
        render();
      }
    });
  });
}

/* =========================================================================
   文字サイズ・使い方の案内
   ========================================================================= */
function applyFontScale(v) {
  const z = { large: 1.12, xlarge: 1.25 }[v] || 1;
  document.documentElement.style.zoom = z === 1 ? '' : String(z);
  document.documentElement.style.setProperty('--z', String(z));
}
const TOUR = [
  ['ようこそ', '有給の残日数・消滅の期限・年5日の取得義務を、自動で計算します。データはこの端末の中だけに保存され、外には送りません。'],
  ['従業員を登録する', '設定の「従業員」から追加します。入社日を入れると付与日が決まり、出勤日数か契約の勤務日数で付与日数を判定します。CSVでまとめて登録することもできます。'],
  ['休んだ日を記録する', '「記録」で、1日ずつ・期間で・月ごとにまとめて入れられます。先の日付は「予定」として扱い、当日になると残日数から引きます。'],
  ['帳票とバックアップ', '管理簿・本人へのお知らせ・一覧表は「帳票・出力」から印刷やExcelで出せます。データは定期的に「書き出し」で控えを残してください。'],
];
function showTour() {
  if (document.querySelector('.tour-ov')) return;
  let i = 0;
  const ov = document.createElement('div');
  ov.className = 'tour-ov';
  const draw = () => {
    ov.innerHTML = `<div class="tour" role="dialog" aria-modal="true" aria-labelledby="tourT">
      <div class="step">使い方 ${i + 1} / ${TOUR.length}</div><h3 id="tourT">${TOUR[i][0]}</h3><p>${TOUR[i][1]}</p>
      <div class="dots">${TOUR.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="acts">${i ? '<button class="btn" data-tr="back">戻る</button>' : '<button class="btn" data-tr="close">閉じる</button>'}
        <button class="btn primary" data-tr="${i === TOUR.length - 1 ? 'close' : 'next'}">${i === TOUR.length - 1 ? 'はじめる' : '次へ'}</button></div></div>`;
    const f = ov.querySelector('.btn.primary'); if (f) f.focus();
  };
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey, true); const u = loadUI(); u.tourDone = true; saveUI(u); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey, true);
  ov.addEventListener('click', (e) => {
    if (e.target === ov) { close(); return; }
    const b = e.target.closest('[data-tr]');
    if (!b) return;
    if (b.dataset.tr === 'next') { i++; draw(); }
    else if (b.dataset.tr === 'back') { i--; draw(); }
    else close();
  });
  document.body.appendChild(ov);
  draw();
}

/* =========================================================================
   起動のあとに
   ========================================================================= */
function bootExtras() {
  const ui = loadUI();
  if (ui.lock && ui.lock.hash) showLock();
  else if (!DATA.employees.length && !ui.tourDone && !window.__PREVIEW__) showTour();
  document.addEventListener('visibilitychange', () => {
    const u = loadUI();
    if (!(u.lock && u.lock.hash)) return;
    if (document.hidden) { LOCK_HIDDEN_AT = Date.now(); return; }
    if (LOCK_HIDDEN_AT && Date.now() - LOCK_HIDDEN_AT >= (Number(u.lock.min) || 5) * 60000) showLock();
  });
}

/* =========================================================================
   イベント（このファイルの分）
   ========================================================================= */
document.addEventListener('click', async (ev) => {
  const t = ev.target;
  const gm = t.closest('[data-gtmode]');
  if (gm) {
    if (!isObj(DATA.settings)) DATA.settings = {};
    if (gm.dataset.gtmode === 'legal') { delete DATA.settings.grantTable; delete DATA.settings.grantTableOn; }
    else DATA.settings.grantTableOn = true;
    saveData('付与日数の表を変更'); renderSet(); toast('計算に反映しました'); return;
  }
  const fs = t.closest('[data-fs]');
  if (fs) { const u = loadUI(); u.fontScale = fs.dataset.fs; saveUI(u); applyFontScale(u.fontScale); renderSet(); return; }
  const b = t.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'cosw') { await companyDialog(); return; }
  if (act === 'codel') { await deleteCompany(); return; }
  if (act === 'corestore') { restoreDeletedCompany(); return; }
  if (act === 'undo') { await undoEntry(b.dataset.id); return; }
  if (act === 'persist') { await requestPersist(); return; }
  if (act === 'tpl') { saveTemplate(b.dataset.kind); return; }
  if (act === 'csvin') { const f = $('#csvIn'); f.dataset.kind = b.dataset.kind; f.click(); return; }
  if (act === 'snooze') { setUiCo('snooze', Date.now() + 7 * 86400000); render(); toast('1週間後にまたお知らせします'); return; }
  if (act === 'lockset') { await lockSet(); return; }
  if (act === 'lockoff') { await lockOff(); return; }
  if (act === 'locknow') { showLock(); return; }
  if (act === 'lockresetok') { const u = loadUI(); delete u.lockReset; saveUI(u); render(); return; }
  if (act === 'tour') { showTour(); return; }
  if (act === 'clrschfrom') { if (DATA.settings && DATA.settings.schedule) delete DATA.settings.schedule.from; saveData('付与日のルールを変更'); renderSet(); return; }
  if (act === 'godata' || act === 'gohistory') {
    setTab('set');
    const el = document.getElementById(act === 'godata' ? 's-data' : 's-log');
    if (el) el.scrollIntoView({ block: 'start' });
  }
});
document.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t.id === 'csvIn' && t.files && t.files[0]) {
    const f = t.files[0];
    t.value = '';
    if (f.size > 5 * 1024 * 1024) { toast('ファイルが大きすぎます（5MBまで）'); return; }
    const buf = await f.arrayBuffer();
    await csvImport(t.dataset.kind, IO.decodeText(buf));
    return;
  }
  if (t.id === 'coNameIn') {
    if (!isObj(DATA.settings)) DATA.settings = {};
    DATA.settings.companyName = t.value.trim().slice(0, 40);
    saveData('会社名を変更'); renderPageTitle(); toast('会社名を保存しました'); return;
  }
  if (!isObj(DATA.settings)) DATA.settings = {};
  const s = DATA.settings;
  const sch = () => { if (!isObj(s.schedule)) s.schedule = {}; return s.schedule; };
  if (t.dataset && t.dataset.set) {
    const k = t.dataset.set;
    if (k === 'hourly') { s.hourly = Object.assign({}, isObj(s.hourly) ? s.hourly : {}, { enabled: t.checked }); }
    else if (k === 'checkHoliday') s.checkHoliday = t.checked;
    else s[k] = t.checked;
    saveData(k === 'checkHoliday' ? '入力の確認を変更' : '付与のルールを変更');
    renderSet();
    toast(k === 'checkHoliday' ? '保存しました' : '計算に反映しました');
    return;
  }
  if (t.id === 'hourCap') { s.hourly = Object.assign({}, isObj(s.hourly) ? s.hourly : {}, { capDays: Number(t.value) }); saveData('時間単位年休の上限を変更'); return; }
  if (t.id === 'schFirst') { sch().firstMonths = Number(t.value); saveData('付与日のルールを変更'); renderSet(); toast('計算に反映しました'); return; }
  if (t.id === 'schUnify') { if (t.value === 'on') sch().unify = { m: 4, d: 1 }; else delete sch().unify; saveData('付与日のルールを変更'); renderSet(); toast('計算に反映しました'); return; }
  if (t.id === 'schM' || t.id === 'schD') {
    const u = sch().unify || { m: 4, d: 1 };
    u[t.id === 'schM' ? 'm' : 'd'] = Number(t.value);
    sch().unify = u; saveData('付与日のルールを変更'); renderSet(); toast('計算に反映しました'); return;
  }
  if (t.dataset && t.dataset.dfi === 'schFrom') {
    if (!isYmd(t.value)) return;
    sch().from = t.value; saveData('付与日のルールを変更'); renderSet(); toast('計算に反映しました'); return;
  }
  if (t.dataset && t.dataset.gt) {
    const [ri, ci] = t.dataset.gt.split(',').map(Number);
    if (!Array.isArray(s.grantTable)) s.grantTable = GRANT_TABLE.map(() => Array(7).fill(null));
    const n = numOrNull(t.value, 99);
    s.grantTable[ri][ci] = n == null ? null : Math.round(n * 2) / 2;
    t.value = n == null ? '' : fmtD(Math.round(n * 2) / 2);
    saveData('付与日数の表を変更');
    toast('計算に反映しました');
    return;
  }
  if (t.id === 'lockMin') { const u = loadUI(); if (u.lock) { u.lock.min = Number(t.value); saveUI(u); } }
});
