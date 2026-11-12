/* =========================================================================
   有給管理 - 入力まわり
   記録（1日ずつ・期間・編集・一斉休暇）、出勤日数、従業員の設定
   ========================================================================= */
'use strict';

let OPEN_EMP = null;     // 設定で開いておく従業員
let WORK_MODE = 'work';  // 出勤タブ：'work'=出勤日数 / 'sched'=所定労働日数（出勤率8割の判定用）
const RG = { from: null, to: null, exSat: true, exSun: true, exHol: true, onlyPat: false, half: false, plan: false, note: '' };

/* ---------- 汎用ダイアログ ---------- */
/**
 * フォーム付きのダイアログ。
 * o: { title, html, ok, cancel, danger, del(削除ボタンの文字), wide, init(ov), click(ev, ov), change(ev, ov), submit(ov) }
 * submit が undefined を返すと閉じない（入力の誤りなど）。戻り値は submit の結果、削除は 'delete'、キャンセルは null。
 */
function sheet(o) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'dlg-ov';
    ov.innerHTML = `<div class="dlg ${o.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="shT">
      <h3 id="shT">${esc(o.title || '')}</h3>
      <div class="form">${o.html || ''}<p class="dlg-err" data-sh-err role="alert"></p></div>
      <div class="acts">
        ${o.del ? `<button type="button" class="btn danger" data-sh="del">${esc(o.del)}</button>` : ''}
        ${o.cancel === false ? '' : `<button type="button" class="btn" data-sh="cancel">${esc(o.cancel || 'キャンセル')}</button>`}
        <button type="button" class="btn ${o.danger ? 'danger-solid' : 'primary'}" data-sh="ok">${esc(o.ok || 'OK')}</button>
      </div></div>`;
    const prevFocus = document.activeElement;
    document.body.appendChild(ov);
    document.body.classList.add('modal-open');
    const done = (v) => {
      ov.remove();
      if (!document.querySelector('.dlg-ov, .dp-ov, .reg-ov')) document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onKey, true);
      try { if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true }); } catch (e) {}
      resolve(v);
    };
    const err = (m) => { const el = ov.querySelector('[data-sh-err]'); if (el) el.textContent = m || ''; };
    ov.err = err;
    const submit = async () => {
      err('');
      const v = o.submit ? await o.submit(ov) : true;
      if (v !== undefined) done(v);
    };
    const onKey = (e) => {
      if (document.querySelector('.dp-ov')) return; // カレンダーが上に開いている
      if (e.key === 'Escape') { e.preventDefault(); done(null); }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && ov.contains(e.target)) { e.preventDefault(); submit(); }
    };
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('click', (e) => {
      if (e.target === ov) { done(null); return; }
      const b = e.target.closest('[data-sh]');
      if (b) {
        if (b.dataset.sh === 'ok') submit();
        else if (b.dataset.sh === 'del') done('delete');
        else done(null);
        return;
      }
      if (o.click) o.click(e, ov);
    });
    if (o.change) { ov.addEventListener('change', (e) => o.change(e, ov)); ov.addEventListener('input', (e) => o.change(e, ov)); }
    if (o.init) o.init(ov);
    setTimeout(() => {
      const f = ov.querySelector('[autofocus]') || ov.querySelector('input:not([type=checkbox]):not([type=hidden]),select,textarea') || ov.querySelector('[data-sh="ok"]');
      if (f) try { f.focus({ preventScroll: true }); } catch (e) {}
    }, 40);
  });
}

/** 従業員をひとり選ぶ */
async function pickEmployee(title) {
  const now = today();
  const emps = DATA.employees.filter((e) => !isRetired(e, now));
  if (!emps.length) { toast('在籍中の従業員がいません'); return null; }
  return sheet({
    title, ok: '選ぶ',
    html: `<div class="field"><label class="fl" for="pkSel">従業員</label><select class="inp" id="pkSel">
      ${emps.map((e) => `<option value="${esc(e.id)}" ${e.id === CUR ? 'selected' : ''}>${esc(e.name || '(名称未設定)')}${e.store ? `（${esc(e.store)}）` : ''}</option>`).join('')}</select></div>`,
    submit: (ov) => ov.querySelector('#pkSel').value,
  });
}

/* ---------- 日付の補助 ---------- */
/** その日について一言（土日・祝日・勤務日でない・入社前など） */
function dayNoteOf(dateStr, emp) {
  if (!isYmd(dateStr)) return { text: '', lv: '' };
  const d = parseYmd(dateStr);
  const hol = JPHoliday.name(dateStr);
  const parts = [];
  let lv = '';
  if (emp && isYmd(emp.hireDate) && dateStr < emp.hireDate) { parts.push('入社日より前の日付です'); lv = 'bad'; }
  if (emp && isYmd(emp.retireDate) && dateStr > emp.retireDate) { parts.push('退職日より後の日付です'); lv = 'bad'; }
  if (hol) { parts.push(`祝日（${hol}）`); lv = lv || 'warn'; }
  else if (d.getDay() === 0 || d.getDay() === 6) { parts.push(`${WD[d.getDay()]}曜日`); lv = lv || 'warn'; }
  const wp = emp && emp.workPattern;
  if (wp && !wp.dows.includes(d.getDay()) && !hol && d.getDay() !== 0 && d.getDay() !== 6) { parts.push('この人の勤務日ではありません（勤務パターン）'); lv = lv || 'warn'; }
  return { text: parts.join('・'), lv };
}
/** 休む日として数えない日か（範囲入力・一斉休暇・自動入力で使う） */
function isOffDay(dateStr, ex, emp) {
  const d = parseYmd(dateStr);
  if (ex.onlyPat && emp && emp.workPattern) {
    if (!emp.workPattern.dows.includes(d.getDay())) return true;
    if (emp.workPattern.holidaysOff && JPHoliday.isHoliday(dateStr)) return true;
    return false;
  }
  if (ex.exSat && d.getDay() === 6) return true;
  if (ex.exSun && d.getDay() === 0) return true;
  if (ex.exHol && JPHoliday.isHoliday(dateStr)) return true;
  return false;
}
function datesBetween(from, to) {
  const out = [];
  if (!isYmd(from) || !isYmd(to) || from > to) return out;
  for (let d = parseYmd(from); ymd(d) <= to && out.length < 400; d = addDays(d, 1)) out.push(ymd(d));
  return out;
}
const shortDate = (s) => { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };

/* =========================================================================
   取得の記録
   ========================================================================= */
function renderLeave() {
  const emp = currentEmp();
  const box = $('#p-leave');
  if (!emp) {
    box.innerHTML = `<div class="card"><div class="empty">先に従業員を登録してください</div>
      <button class="btn primary full" data-act="addemp">${ICON.plus}従業員を登録する</button></div>`;
    return;
  }
  const now = today();
  const r = sim(emp, now);
  let html = '';
  if (r.retired) html += `<div class="banner">${ICON.info}<div class="tx"><b>${fmtJp(r.retireDate)}に退職しています</b>退職日より後の日付は記録できません。</div></div>`;
  html += balStripHtml(r) + `<div class="seg big-seg">
    <button data-lmode="single" class="${LEAVE_MODE === 'single' ? 'on' : ''}">1日ずつ</button>
    <button data-lmode="range" class="${LEAVE_MODE === 'range' ? 'on' : ''}">期間で</button>
    <button data-lmode="bulk" class="${LEAVE_MODE === 'bulk' ? 'on' : ''}">月まとめ</button>
  </div>`;
  if (LEAVE_MODE === 'bulk') html += leaveBulkHtml(emp, now, r);
  else html += (LEAVE_MODE === 'range' ? leaveRangeHtml(emp, now) : leaveSingleHtml(emp, now)) + leaveListHtml(emp, now, r);
  box.innerHTML = html;
  if (LEAVE_MODE === 'bulk') showSelectedChip(box);
}

/* ---------- 1日ずつ ---------- */
function leaveSingleHtml(emp, now) {
  const S = settings();
  if (LEAVE_UNIT === 'hour' && !S.hourly.enabled) LEAVE_UNIT = 'day';
  const tk = ymd(now);
  const date = LEAVE_DATE || tk;
  const note = dayNoteOf(date, emp);
  const u = LEAVE_UNIT;
  let extra = '';
  if (u === 'half') {
    extra = `<div class="seg" style="margin-top:10px" role="group" aria-label="午前か午後">
      <button data-lhalf="am" class="${LEAVE_HALF === 'am' ? 'on' : ''}">午前</button>
      <button data-lhalf="pm" class="${LEAVE_HALF === 'pm' ? 'on' : ''}">午後</button></div>`;
  } else if (u === 'hour') {
    const hpd = hpdOf(emp);
    extra = `<div class="dlg-in" style="margin-top:10px"><input type="number" id="lvHours" min="1" max="${hpd * 5}" step="1" value="${esc(LEAVE_HOURS)}" inputmode="numeric" aria-label="時間数"><span>時間</span></div>
      <div class="inline-note">1日＝${hpd}時間で換算します。時間単位で取った分は年5日の取得義務に含まれません。</div>`;
  } else if (u === 'custom') {
    extra = `<input type="number" id="lvDays" step="0.5" min="0.5" max="40" value="${fmtD(LEAVE_DAYS)}" style="margin-top:10px" inputmode="decimal" aria-label="日数（0.5日単位）">`;
  }
  return `<div class="card">
    <h2 class="sec" style="margin-top:0">有給を取得した日を追加</h2>
    <div class="field"><label class="fl" for="df-lvDate">取得日</label>
      ${dateField('lvDate', date)}
      <div class="inline-note ${note.lv}" id="lvDayNote">${esc(note.text)}</div>
      <div class="quick">
        <button type="button" data-qd="0">今日</button>
        <button type="button" data-qd="-1">昨日</button>
        <button type="button" data-qd="-2">一昨日</button>
      </div></div>
    <div class="field"><label class="fl">日数</label>
      <div class="seg" role="group" aria-label="日数">
        <button data-lunit="day" class="${u === 'day' ? 'on' : ''}">1日</button>
        <button data-lunit="half" class="${u === 'half' ? 'on' : ''}">半日</button>
        ${S.hourly.enabled ? `<button data-lunit="hour" class="${u === 'hour' ? 'on' : ''}">時間</button>` : ''}
        <button data-lunit="custom" class="${u === 'custom' ? 'on' : ''}">その他</button>
      </div>${extra}
    </div>
    <label class="chk"><input type="checkbox" id="lvPlan" ${LEAVE_PLAN ? 'checked' : ''}><span>計画年休<small>会社が日を決めて取らせる休み（労使協定による計画的付与）</small></span></label>
    <div class="field"><label class="fl" for="lvNote">メモ（任意）</label>
      <input type="text" id="lvNote" maxlength="100" placeholder="例：私用／旅行" value="${esc(LEAVE_NOTE)}"></div>
    <button class="btn primary full" data-act="addleave">${ICON.plus}記録を追加</button>
  </div>`;
}

/* ---------- 期間で ---------- */
function rangeDates(emp) {
  const all = datesBetween(RG.from, RG.to);
  return all.filter((k) => !isOffDay(k, RG, emp));
}
function rangePreview(emp) {
  if (!isYmd(RG.from) || !isYmd(RG.to)) return { html: '開始日と終了日を入れてください', bad: true, n: 0 };
  if (RG.from > RG.to) return { html: '終了日が開始日より前です', bad: true, n: 0 };
  if (datesBetween(RG.from, RG.to).length > 62) return { html: '期間は62日（約2ヶ月）までにしてください', bad: true, n: 0 };
  const ds = rangeDates(emp);
  if (!ds.length) return { html: '休む日がありません（除く日の設定を確認してください）', bad: true, n: 0 };
  const has = new Set((emp.leaves || []).filter((l) => !isBulk(l)).map((l) => l.date));
  const dup = ds.filter((k) => has.has(k));
  const per = RG.half ? 0.5 : 1;
  return {
    n: ds.length - dup.length,
    bad: ds.length === dup.length,
    html: `<b>${ds.length - dup.length}</b>日分（計${fmtD((ds.length - dup.length) * per)}日）を記録します：${ds.filter((k) => !has.has(k)).slice(0, 14).map(shortDate).join('、')}${ds.length - dup.length > 14 ? ' ほか' : ''}`
      + (dup.length ? `<br>すでに記録がある ${dup.map(shortDate).join('、')} は除きます。` : ''),
  };
}
function leaveRangeHtml(emp, now) {
  const tk = ymd(now);
  if (!isYmd(RG.from)) RG.from = LEAVE_DATE || tk;
  if (!isYmd(RG.to)) RG.to = RG.from;
  const wp = emp.workPattern;
  if (!wp) RG.onlyPat = false;
  const pv = rangePreview(emp);
  return `<div class="card">
    <h2 class="sec" style="margin-top:0">期間でまとめて追加</h2>
    <div class="grid2" style="margin-bottom:12px">
      <div><label class="fl" for="df-rgFrom">開始日</label>${dateField('rgFrom', RG.from)}</div>
      <div><label class="fl" for="df-rgTo">終了日</label>${dateField('rgTo', RG.to)}</div>
    </div>
    <div class="field"><span class="fl">休みに数えない日</span>
      ${wp ? `<label class="chk"><input type="checkbox" data-rg="onlyPat" ${RG.onlyPat ? 'checked' : ''}><span>この人の勤務日だけ（${wp.dows.map((i) => WD[i]).join('・')}${wp.holidaysOff ? '、祝日は休み' : ''}）</span></label>` : ''}
      <div ${RG.onlyPat ? 'hidden' : ''}>
        <label class="chk inline"><input type="checkbox" data-rg="exSat" ${RG.exSat ? 'checked' : ''}>土曜日</label>
        <label class="chk inline"><input type="checkbox" data-rg="exSun" ${RG.exSun ? 'checked' : ''}>日曜日</label>
        <label class="chk inline"><input type="checkbox" data-rg="exHol" ${RG.exHol ? 'checked' : ''}>祝日</label>
      </div></div>
    <div class="field"><label class="fl">1日あたり</label>
      <div class="seg"><button data-rghalf="0" class="${!RG.half ? 'on' : ''}">1日</button><button data-rghalf="1" class="${RG.half ? 'on' : ''}">半日</button></div></div>
    <label class="chk"><input type="checkbox" data-rg="plan" ${RG.plan ? 'checked' : ''}><span>計画年休<small>会社が日を決めて取らせる休み</small></span></label>
    <div class="field"><label class="fl" for="rgNote">メモ（任意）</label>
      <input type="text" id="rgNote" maxlength="100" placeholder="例：旅行" value="${esc(RG.note)}"></div>
    <div class="preview ${pv.bad ? 'bad' : ''}" id="rgPrev" style="margin-bottom:14px">${pv.html}</div>
    <button class="btn primary full" data-act="addrange" ${pv.bad ? 'disabled' : ''}>${ICON.plus}まとめて記録</button>
  </div>`;
}
function refreshRangePreview() {
  const emp = currentEmp();
  const el = $('#rgPrev');
  if (!emp || !el) return;
  const pv = rangePreview(emp);
  el.innerHTML = pv.html;
  el.classList.toggle('bad', pv.bad);
  const b = $('[data-act="addrange"]');
  if (b) b.disabled = pv.bad;
}
async function addRange(emp) {
  const pv = rangePreview(emp);
  if (pv.bad || !pv.n) { toast('記録できる日がありません'); return; }
  const has = new Set((emp.leaves || []).filter((l) => !isBulk(l)).map((l) => l.date));
  const ds = rangeDates(emp).filter((k) => !has.has(k));
  if (isYmd(emp.hireDate) && ds[0] < emp.hireDate) { toast(`入社日（${fmtJpShort(parseYmd(emp.hireDate))}）より前の日が含まれています`); return; }
  if (isYmd(emp.retireDate) && ds[ds.length - 1] > emp.retireDate) { toast('退職日より後の日が含まれています'); return; }
  if (parseYmd(ds[ds.length - 1]) > addMonths(today(), 24)) { toast('2年より先の日付は記録できません'); return; }
  const per = RG.half ? 0.5 : 1;
  for (const k of ds) {
    const rec = { id: uid(), date: k, days: per, note: (RG.note || '').trim().slice(0, 100), bulk: false };
    if (RG.half) rec.half = 'am';
    if (RG.plan) rec.plan = true;
    emp.leaves.push(rec);
  }
  emp.leaves.sort((a, b) => a.date.localeCompare(b.date));
  saveData(`期間で記録（${shortDate(ds[0])}〜${shortDate(ds[ds.length - 1])}）`);
  renderLeave();
  const r = sim(emp, today());
  const sf = [...r.shortfalls, ...(r.plannedShortfalls || [])].filter((s) => ds.includes(s.date));
  toast(sf.length ? `${ds.length}日分を記録しましたが、有給が足りない日があります` : `${ds.length}日分を記録しました`);
}

/* ---------- 記録の一覧（検索・編集） ---------- */
function leaveMatches(lv, q) {
  if (!q) return true;
  const d = parseYmd(lv.date);
  const hay = [lv.note || '', lv.date, `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`, `${d.getMonth() + 1}月${d.getDate()}日`, `${d.getFullYear()}年${d.getMonth() + 1}月`,
    lv.plan ? '計画年休' : '', lv.unit === 'hour' ? '時間' : '', lv.half === 'am' ? '午前' : lv.half === 'pm' ? '午後' : '', isBulk(lv) ? '月まとめ' : ''].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}
function leaveListHtml(emp, now, r) {
  return `<h2 class="sec">取得の記録（合計 <span class="num">${dh(nd(r.allLeaves.reduce((s, l) => s + l.days, 0)), emp)}</span>）</h2>
    <label class="search" style="margin-bottom:12px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>
      <input type="search" id="lvQ" placeholder="メモ・日付で探す（例：旅行、2026/5）" value="${esc(LEAVE_Q)}" aria-label="記録を探す"></label>
    <div class="card" id="lvList">${leaveItemsHtml(emp, now, r)}</div>`;
}
function leaveItemsHtml(emp, now, r) {
  const tk = ymd(now);
  const shortMap = new Map(r.shortfalls.map((s) => [s.id, s.days]));
  const planShortMap = new Map((r.plannedShortfalls || []).map((s) => [s.id, s.days]));
  const preIds = new Set((r.preOpeningLeaves || []).map((l) => l.id));
  const lots = r.lots.filter((l) => !l.future || l.date <= addMonths(now, 12));
  const groups = lots.map((l, i) => {
    let to = addMonths(l.date, 12);
    if (lots[i + 1] && lots[i + 1].date < to) to = lots[i + 1].date;
    return { from: l.date, to, lot: l, items: [],
      label: `${fmtJpShort(l.date)} 〜 ${fmtJpShort(new Date(to.getTime() - 86400000))}` };
  });
  const first = r.lots[0] ? r.lots[0].date : null;
  const before = { label: '最初の付与日より前', items: [], lot: null,
    note: 'まだ有給が付与されていない期間のため、この記録は残日数から引かれていません。' };
  const later = { label: 'さらに先の予定', items: [], lot: null };
  const afterRet = { label: '退職日より後', items: [], lot: null, note: '退職日より後の記録は計算に使っていません。' };
  const retIds = new Set((r.afterRetire || []).map((l) => l.id));
  const all = [...r.allLeaves, ...(r.afterRetire || [])];
  for (const lv of all) {
    if (!leaveMatches(lv, LEAVE_Q)) continue;
    if (retIds.has(lv.id)) { afterRet.items.push(lv); continue; }
    const d = parseYmd(lv.eff);
    const g = groups.find((x) => d >= x.from && d < x.to);
    if (g) g.items.push(lv);
    else if (!first || d < first) before.items.push(lv);
    else later.items.push(lv);
  }
  const shown = [];
  if (afterRet.items.length) shown.push(afterRet);
  if (later.items.length) shown.push(later);
  shown.push(...[...groups].reverse().filter((g) => g.items.length));
  if (before.items.length) shown.push(before);
  if (!shown.length) return `<div class="empty">${LEAVE_Q ? '見つかりませんでした' : 'まだ記録がありません'}</div>`;

  let html = '';
  for (const g of shown) {
    const taken = nd(g.items.filter((l) => l.eff <= tk && l.unit !== 'hour').reduce((s, l) => s + l.days, 0));
    const sum = nd(g.items.reduce((s, l) => s + l.days, 0));
    const ob = g.lot && !g.lot.future && g.lot.granted >= 10;
    html += `<div class="yr"><span class="yr-l"><span class="nw">${esc(g.label)}</span>${g.lot ? `<span class="nw">（${g.lot.label}）</span>` : ''}</span>
      <span class="yr-r">${dh(sum, emp)}${ob ? `<span class="pill ${taken >= 5 ? 'ok' : 'warn'}">義務 ${fmtD(Math.min(taken, 5))}/5</span>` : ''}</span></div>`;
    if (g.note) html += `<p class="sub" style="margin:8px 0 0;color:var(--danger)">${esc(g.note)}</p>`;
    for (const lv of g.items.slice().reverse()) {
      const d = parseYmd(lv.date);
      const planned = lv.eff > tk;
      const sf = planned ? planShortMap.get(lv.id) : shortMap.get(lv.id);
      const title = isBulk(lv) ? `${d.getFullYear()}年${d.getMonth() + 1}月` : `${fmtJp(d)}（${WD[d.getDay()]}）`;
      const pills = (isBulk(lv) ? '<span class="pill mute">月まとめ</span>' : '')
        + (planned ? '<span class="pill acc">予定</span>' : '')
        + (lv.plan ? '<span class="pill mute">計画年休</span>' : '')
        + (preIds.has(lv.id) ? '<span class="pill mute">移行前</span>' : '')
        + (sf ? `<span class="pill danger">不足 ${dh(sf, emp)}</span>` : '');
      const memo = lv.note && !isBulk(lv) ? esc(lv.note) : '';
      let sub = '';
      if (sf) sub = `<div class="d2 bad">有給が${dh(sf, emp)}足りないため、その分は残日数から引けていません</div>`;
      else if (preIds.has(lv.id)) sub = `<div class="d2">移行日より前のため、残日数から引いていません${memo ? `・${memo}` : ''}</div>`;
      else if (isBulk(lv) && !planned && lv.eff !== lv.date) sub = `<div class="d2">今月分として、残日数から引いています</div>`;
      else if (planned) sub = `<div class="d2">${isBulk(lv) ? 'その月になると' : '当日になると'}残日数から引かれます${memo ? `・${memo}` : ''}</div>`;
      else if (memo) sub = `<div class="d2">${memo}</div>`;
      const amt = lv.unit === 'hour' ? `${fmtD(Number(lv.hours))}<small>時間</small>`
        : (Number(lv.days) === 0.5 && lv.half) ? `${lv.half === 'am' ? '午前' : '午後'}<small>半休</small>` : `${fmtD(lv.days)}<small>日</small>`;
      html += `<div class="li${sf ? ' short' : ''}">
        <button type="button" class="g" data-editlv="${esc(lv.id)}" style="all:unset;flex:1;min-width:0;cursor:pointer" aria-label="${esc(title)}の記録を直す">
          <div class="d1"><span>${title}</span>${pills}</div>${sub}</button>
        <div class="amt">${amt}</div>
        <button class="ico-btn" data-act="dellv" data-id="${esc(lv.id)}" aria-label="${esc(title)}の記録を削除">${ICON.trash}</button>
      </div>`;
    }
  }
  return html + `<p class="sub" style="margin-top:12px">記録をタップすると、日付・日数・メモを直せます。</p>`;
}

/* ---------- 記録を追加（1日ずつ） ---------- */
/** 土日・祝日・勤務日でない日の確認（設定でオフにできる） */
async function confirmDay(dateStr, emp) {
  if (isObj(DATA.settings) && DATA.settings.checkHoliday === false) return true;
  const n = dayNoteOf(dateStr, emp);
  if (n.lv !== 'warn') return true;
  const d = parseYmd(dateStr);
  return askDialog({
    title: '休みの日ではありませんか？',
    message: `${fmtJp(d)}（${WD[d.getDay()]}）は ${n.text} です。\nこのまま記録しますか？\n（この確認は 設定 →「入力の確認」で止められます）`,
    ok: '記録する',
  });
}
/** 時間単位の上限（1年に5日分まで） */
async function confirmHourCap(emp, dateStr, addHours, ignoreId) {
  const S = settings();
  const r = sim(emp, today());
  const d = parseYmd(dateStr);
  const lot = r.lots.filter((l) => l.date <= d).pop();
  if (!lot) return true;
  const i = r.lots.indexOf(lot);
  let to = addMonths(lot.date, 12);
  if (r.lots[i + 1] && r.lots[i + 1].date < to) to = r.lots[i + 1].date;
  let used = hoursUsedIn(emp, lot.date, to);
  if (ignoreId) { const old = (emp.leaves || []).find((l) => l.id === ignoreId && l.unit === 'hour'); if (old) used -= Number(old.hours) || 0; }
  const cap = S.hourly.capDays * hpdOf(emp);
  if (used + addHours <= cap) return true;
  return askDialog({
    title: '時間単位の上限を超えます',
    message: `${fmtJpShort(lot.date)}付与の年度は、時間単位で ${fmtD(used)}時間 取っています。\nこの記録で ${fmtD(used + addHours)}時間 になり、上限（${S.hourly.capDays}日＝${cap}時間）を超えます。記録しますか？`,
    ok: '記録する',
  });
}
async function addLeave(emp) {
  const now = today();
  const S = settings();
  const inp = $('#df-lvDate');
  const date = inp ? inp.value : (LEAVE_DATE || ymd(now));
  if (!isYmd(date)) { toast('取得日を最後まで正しく入れてください'); if (inp) inp.focus(); return; }
  if (isYmd(emp.hireDate) && date < emp.hireDate) { toast(`入社日（${fmtJpShort(parseYmd(emp.hireDate))}）より前の日付です`); return; }
  if (isYmd(emp.retireDate) && date > emp.retireDate) { toast(`退職日（${fmtJpShort(parseYmd(emp.retireDate))}）より後の日付です`); return; }
  if (parseYmd(date) > addMonths(now, 24)) { toast('2年より先の日付は記録できません'); return; }

  const rec = { id: uid(), date, note: (LEAVE_NOTE || '').trim().slice(0, 100), bulk: false };
  let label;
  if (LEAVE_UNIT === 'hour' && S.hourly.enabled) {
    const hi = $('#lvHours');
    const h = hi ? numOrNull(hi.value, 999) : LEAVE_HOURS;
    if (h == null || !(h >= 1) || Math.round(h) !== h) { toast('時間は1時間単位で入れてください'); if (hi) hi.focus(); return; }
    if (h > hpdOf(emp) * 5) { toast(`1回に記録できるのは${hpdOf(emp) * 5}時間までです`); return; }
    rec.unit = 'hour'; rec.hours = h; label = `${fmtD(h)}時間`;
  } else {
    let days = LEAVE_UNIT === 'half' ? 0.5 : LEAVE_UNIT === 'custom' ? null : 1;
    if (LEAVE_UNIT === 'custom') {
      const dinp = $('#lvDays');
      days = dinp ? numOrNull(dinp.value, 999) : LEAVE_DAYS;
      if (days == null || !(days > 0)) { toast('日数を入力してください'); if (dinp) dinp.focus(); return; }
      if (Math.round(days * 2) !== days * 2) { toast('日数は0.5日単位で入れてください'); if (dinp) dinp.focus(); return; }
      if (days > 40) { toast('1回に記録できるのは40日までです'); if (dinp) dinp.focus(); return; }
    }
    rec.days = days;
    if (days === 0.5 && LEAVE_UNIT === 'half') rec.half = LEAVE_HALF === 'pm' ? 'pm' : 'am';
    label = rec.half ? (rec.half === 'am' ? '午前半休' : '午後半休') : `${fmtD(days)}日`;
  }
  if (LEAVE_PLAN) rec.plan = true;

  if (!(await confirmDay(date, emp))) return;
  if (rec.unit === 'hour' && !(await confirmHourCap(emp, date, rec.hours))) return;
  const d0 = parseYmd(date);
  const md = `${d0.getMonth() + 1}月${d0.getDate()}日`;
  const same = (emp.leaves || []).filter((l) => !isBulk(l) && l.date === date);
  if (same.length) {
    const ok = await askDialog({
      title: 'この日はすでに記録があります',
      message: `${fmtJp(d0)} には ${same.map((l) => leaveAmount(l, emp)).join('・')} の記録があります。\nさらに ${label} を追加しますか？`,
      ok: '追加する',
    });
    if (!ok) return;
  }

  emp.leaves = emp.leaves || [];
  emp.leaves.push(rec);
  emp.leaves.sort((a, b) => a.date.localeCompare(b.date));
  saveData(`記録を追加（${md} ${label}）`);
  LEAVE_DATE = null;
  LEAVE_NOTE = '';
  renderLeave();

  const r = sim(emp, now);
  const sf = r.shortfalls.find((s) => s.id === rec.id) || (r.plannedShortfalls || []).find((s) => s.id === rec.id);
  if (date > ymd(now)) {
    toast(sf ? `${md}に予定を記録しました（有給が${dh(sf.days, emp)}足りません）` : `${md}に${label}を予定として記録しました`);
  } else if (sf) {
    toast(`${md}に記録しましたが、有給が${dh(sf.days, emp)}足りません`);
  } else {
    toast(`${md}に${label}を記録しました（残り${dh(r.balance, emp)}）`);
  }
}

/* ---------- 記録を直す ---------- */
async function editLeave(emp, id) {
  const lv = (emp.leaves || []).find((l) => l.id === id);
  if (!lv) return;
  if (isBulk(lv)) {
    LEAVE_MODE = 'bulk';
    BULK_YEAR = Number(lv.date.slice(0, 4));
    renderLeave();
    toast('月まとめの記録は、この画面の月のマスで直してください');
    return;
  }
  const S = settings();
  const st = {
    date: lv.date,
    unit: lv.unit === 'hour' ? 'hour' : Number(lv.days) === 0.5 ? 'half' : Number(lv.days) === 1 ? 'day' : 'custom',
    half: lv.half === 'pm' ? 'pm' : 'am',
  };
  const body = () => `
    <div class="field"><label class="fl" for="df-edDate">取得日</label>${dateField('edDate', st.date)}</div>
    <div class="field"><label class="fl">日数</label>
      <div class="seg">
        <button data-edunit="day" class="${st.unit === 'day' ? 'on' : ''}">1日</button>
        <button data-edunit="half" class="${st.unit === 'half' ? 'on' : ''}">半日</button>
        ${S.hourly.enabled || st.unit === 'hour' ? `<button data-edunit="hour" class="${st.unit === 'hour' ? 'on' : ''}">時間</button>` : ''}
        <button data-edunit="custom" class="${st.unit === 'custom' ? 'on' : ''}">その他</button>
      </div>
      <div data-edx="half" ${st.unit === 'half' ? '' : 'hidden'}><div class="seg" style="margin-top:10px">
        <button data-edhalf="am" class="${st.half === 'am' ? 'on' : ''}">午前</button><button data-edhalf="pm" class="${st.half === 'pm' ? 'on' : ''}">午後</button></div></div>
      <div data-edx="hour" ${st.unit === 'hour' ? '' : 'hidden'}><div class="dlg-in" style="margin-top:10px"><input type="number" id="edHours" min="1" step="1" value="${lv.unit === 'hour' ? esc(lv.hours) : 1}" inputmode="numeric" aria-label="時間数"><span>時間</span></div></div>
      <div data-edx="custom" ${st.unit === 'custom' ? '' : 'hidden'}><input type="number" id="edDays" step="0.5" min="0.5" max="40" value="${lv.unit === 'hour' ? 1 : fmtD(Number(lv.days))}" style="margin-top:10px" inputmode="decimal" aria-label="日数"></div>
    </div>
    <label class="chk"><input type="checkbox" id="edPlan" ${lv.plan ? 'checked' : ''}><span>計画年休</span></label>
    <div class="field"><label class="fl" for="edNote">メモ</label><input type="text" id="edNote" maxlength="100" value="${esc(lv.note || '')}"></div>`;
  const res = await sheet({
    title: '記録を直す', ok: '保存する', del: '削除', html: body(),
    click: (e, ov) => {
      const u = e.target.closest('[data-edunit]');
      if (u) {
        st.unit = u.dataset.edunit;
        ov.querySelectorAll('[data-edunit]').forEach((b) => b.classList.toggle('on', b === u));
        ov.querySelectorAll('[data-edx]').forEach((x) => { x.hidden = x.dataset.edx !== st.unit; });
        return;
      }
      const h = e.target.closest('[data-edhalf]');
      if (h) { st.half = h.dataset.edhalf; ov.querySelectorAll('[data-edhalf]').forEach((b) => b.classList.toggle('on', b === h)); }
    },
    submit: async (ov) => {
      const date = ov.querySelector('#df-edDate').value;
      if (!isYmd(date)) { ov.err('取得日を正しく入れてください'); return undefined; }
      if (isYmd(emp.hireDate) && date < emp.hireDate) { ov.err('入社日より前の日付です'); return undefined; }
      if (isYmd(emp.retireDate) && date > emp.retireDate) { ov.err('退職日より後の日付です'); return undefined; }
      if (parseYmd(date) > addMonths(today(), 24)) { ov.err('2年より先の日付は記録できません'); return undefined; }
      const out = { date, note: ov.querySelector('#edNote').value.trim().slice(0, 100), plan: ov.querySelector('#edPlan').checked };
      if (st.unit === 'hour') {
        const h = numOrNull(ov.querySelector('#edHours').value, 999);
        if (h == null || !(h >= 1) || Math.round(h) !== h) { ov.err('時間は1時間単位で入れてください'); return undefined; }
        out.unit = 'hour'; out.hours = h;
      } else if (st.unit === 'custom') {
        const d = numOrNull(ov.querySelector('#edDays').value, 999);
        if (d == null || !(d > 0) || Math.round(d * 2) !== d * 2 || d > 40) { ov.err('日数は0.5〜40日（0.5日単位）で入れてください'); return undefined; }
        out.days = d;
      } else {
        out.days = st.unit === 'half' ? 0.5 : 1;
        if (st.unit === 'half') out.half = st.half;
      }
      return out;
    },
  });
  if (res === 'delete') { deleteLeave(emp, id); return; }
  if (!res) return;
  if (res.date !== lv.date && !(await confirmDay(res.date, emp))) return;
  if (res.unit === 'hour' && !(await confirmHourCap(emp, res.date, res.hours, id))) return;
  // 置き換え（ID はそのまま）
  for (const k of ['days', 'unit', 'hours', 'half', 'plan']) delete lv[k];
  lv.date = res.date; lv.note = res.note;
  if (res.unit === 'hour') { lv.unit = 'hour'; lv.hours = res.hours; } else { lv.days = res.days; if (res.half) lv.half = res.half; }
  if (res.plan) lv.plan = true;
  emp.leaves.sort((a, b) => a.date.localeCompare(b.date));
  saveData(`記録を修正（${shortDate(res.date)}）`);
  renderLeave();
  toast('記録を直しました');
}

/* ---------- 一斉休暇（全員の同じ日） ---------- */
async function massLeave() {
  const now = today();
  const st = { from: ymd(now), to: ymd(now), exSat: true, exSun: true, exHol: true, half: false };
  const stores = storeNames();
  const targets = (store) => DATA.employees.filter((e) => !isRetired(e, now) && (!store || String(e.store || '').trim() === store));
  const preview = (ov) => {
    const store = ov.querySelector('#msStore') ? ov.querySelector('#msStore').value : '';
    const ds = datesBetween(st.from, st.to).filter((k) => !isOffDay(k, st, null));
    const el = ov.querySelector('#msPrev');
    if (!isYmd(st.from) || !isYmd(st.to) || st.from > st.to) { el.textContent = '開始日と終了日を正しく入れてください'; el.classList.add('bad'); return null; }
    if (datesBetween(st.from, st.to).length > 31) { el.textContent = '期間は31日までにしてください'; el.classList.add('bad'); return null; }
    const emps = targets(store);
    let n = 0, dup = 0, outside = 0;
    for (const e of emps) for (const k of ds) {
      if ((isYmd(e.hireDate) && k < e.hireDate) || (isYmd(e.retireDate) && k > e.retireDate)) { outside++; continue; }
      if ((e.leaves || []).some((l) => !isBulk(l) && l.date === k)) dup++; else n++;
    }
    el.classList.toggle('bad', !n);
    el.innerHTML = ds.length
      ? `<b>${emps.length}</b>人 × <b>${ds.length}</b>日（${ds.slice(0, 8).map(shortDate).join('、')}${ds.length > 8 ? ' ほか' : ''}）＝ <b>${n}</b>件を記録します。`
        + (dup ? `<br>すでに記録がある ${dup}件は除きます。` : '') + (outside ? `<br>入社前・退職後にあたる ${outside}件は除きます。` : '')
      : '休む日がありません';
    return { emps, ds, n };
  };
  const res = await sheet({
    title: '一斉休暇を記録', ok: '記録する', wide: true,
    html: `<p class="sub" style="margin:0">夏季休暇や年末年始など、全員が同じ日に取る有給をまとめて記録します。</p>
      <div class="grid2"><div><label class="fl" for="df-msFrom">開始日</label>${dateField('msFrom', st.from)}</div>
        <div><label class="fl" for="df-msTo">終了日</label>${dateField('msTo', st.to)}</div></div>
      <div><span class="fl">休みに数えない日</span>
        <label class="chk inline"><input type="checkbox" data-ms="exSat" checked>土曜日</label>
        <label class="chk inline"><input type="checkbox" data-ms="exSun" checked>日曜日</label>
        <label class="chk inline"><input type="checkbox" data-ms="exHol" checked>祝日</label></div>
      <div class="field"><label class="fl">1日あたり</label><div class="seg"><button data-mshalf="0" class="on">1日</button><button data-mshalf="1">半日</button></div></div>
      ${stores.length ? `<div class="field"><label class="fl" for="msStore">対象</label><select class="inp" id="msStore"><option value="">在籍中の全員</option>${stores.map((s) => `<option value="${esc(s)}">${esc(s)}だけ</option>`).join('')}</select></div>` : ''}
      <label class="chk"><input type="checkbox" id="msPlan" checked><span>計画年休として記録<small>労使協定で会社が日を決めた休みの場合</small></span></label>
      <div class="field"><label class="fl" for="msNote">メモ</label><input type="text" id="msNote" maxlength="100" value="一斉休暇"></div>
      <div class="preview" id="msPrev"></div>`,
    init: (ov) => { ov.mspv = () => preview(ov); preview(ov); },
    click: (e, ov) => {
      const h = e.target.closest('[data-mshalf]');
      if (h) { st.half = h.dataset.mshalf === '1'; ov.querySelectorAll('[data-mshalf]').forEach((b) => b.classList.toggle('on', b === h)); }
    },
    change: (e, ov) => {
      const t = e.target;
      if (t.dataset.ms) st[t.dataset.ms] = t.checked;
      if (t.dataset.dfi === 'msFrom' && isYmd(t.value)) { st.from = t.value; if (st.to < st.from) { st.to = st.from; const to = ov.querySelector('#df-msTo'); to.value = st.to; updateDateCaption(to); } }
      if (t.dataset.dfi === 'msTo' && isYmd(t.value)) st.to = t.value;
      preview(ov);
    },
    submit: (ov) => {
      const p = preview(ov);
      if (!p || !p.n) { ov.err('記録できる件がありません'); return undefined; }
      return { ...p, plan: ov.querySelector('#msPlan').checked, note: ov.querySelector('#msNote').value.trim().slice(0, 100) };
    },
  });
  if (!res) return;
  let n = 0;
  for (const e of res.emps) {
    for (const k of res.ds) {
      if ((isYmd(e.hireDate) && k < e.hireDate) || (isYmd(e.retireDate) && k > e.retireDate)) continue;
      if ((e.leaves || []).some((l) => !isBulk(l) && l.date === k)) continue;
      const rec = { id: uid(), date: k, days: st.half ? 0.5 : 1, note: res.note, bulk: false };
      if (st.half) rec.half = 'am';
      if (res.plan) rec.plan = true;
      e.leaves.push(rec); n++;
    }
    e.leaves.sort((a, b) => a.date.localeCompare(b.date));
  }
  saveData(`一斉休暇を記録（${res.emps.length}人・${n}件）`);
  render();
  toast(`一斉休暇を${n}件記録しました`);
}

/* =========================================================================
   出勤日数
   ========================================================================= */
/** いま編集している表（出勤日数 or 所定労働日数） */
function workMap(emp) {
  if (WORK_MODE === 'sched' && settings().att8) {
    if (!isObj(emp.schedDays)) emp.schedDays = {};
    return emp.schedDays;
  }
  return emp.workdays;
}
function workStat(map, y) {
  let sum = 0, cnt = 0;
  for (let m = 1; m <= 12; m++) {
    const v = map[`${y}-${pad2(m)}`];
    if (typeof v === 'number') { sum += v; cnt++; }
  }
  return { sum, cnt };
}
function refreshWorkTotals() {
  const emp = currentEmp();
  if (!emp) return;
  const map = workMap(emp);
  $$('#p-work [data-wsum]').forEach((el) => {
    const t = workStat(map, el.dataset.wsum);
    el.innerHTML = t.cnt ? `${t.cnt}ヶ月入力 / 計 <b class="num">${t.sum}</b>日` : '未入力';
  });
}
function renderWork() {
  const emp = currentEmp();
  const box = $('#p-work');
  if (!emp) {
    box.innerHTML = `<div class="card"><div class="empty">先に従業員を登録してください</div>
      <button class="btn primary full" data-act="addemp">${ICON.plus}従業員を登録する</button></div>`;
    return;
  }
  const S = settings();
  if (!S.att8) WORK_MODE = 'work';
  const sched = WORK_MODE === 'sched';
  const map = workMap(emp);
  const key = sched ? 'sd' : 'wd';
  const now = today();
  const curY = now.getFullYear(), curM = now.getMonth() + 1;
  const hireY = parseYmd(emp.hireDate).getFullYear();
  const dataYears = [...Object.keys(emp.workdays || {}), ...Object.keys(emp.schedDays || {})].map((k) => Number(k.slice(0, 4))).filter((y) => y > 1900);
  const extra = Math.max(0, Number(loadUI().workExtraYears) || 0);
  const maxY = Math.max(curY + 5 + extra, hireY, ...(dataYears.length ? dataYears : [0]));
  const years = [];
  for (let y = maxY; y >= hireY; y--) years.push(y);
  if (WORK_YEAR == null || !years.includes(WORK_YEAR)) WORK_YEAR = Math.min(curY, maxY);

  let html = '';
  if (emp.basis === 'contract') {
    html += `<div class="note info">${ICON.info}<div><div class="t">この人の付与日数は契約の勤務日数で決まります</div>
      <div class="d">出勤日数を入れても付与日数は変わりません（設定の従業員で「出勤実績から」に変えると、ここの数字で判定します）。${S.att8 ? '出勤率8割の判定には、ここの出勤日数と所定労働日数を使います。' : ''}</div></div></div>`;
  } else {
    html += `<div class="note info">${ICON.info}<div><div class="t">付与日数はここの入力から決まります</div>
      <div class="d">月ごとに実際に出勤した日数を入れてください（有給で1日休んだ日は含めない。半日休んだ日は出勤に数える）。付与日の直前12ヶ月（初回は6ヶ月×2）から「1年間の所定労働日数」を出し、比例付与表で日数を判定します。<br>
      <b>先の年も入力できます。</b>予定の出勤日数を入れておくと、次回の付与日数がより正確に出ます。</div></div></div>`;
  }
  if (S.att8) {
    html += `<div class="seg big-seg" role="group" aria-label="入力する表">
      <button data-wmode="work" class="${!sched ? 'on' : ''}">出勤日数</button>
      <button data-wmode="sched" class="${sched ? 'on' : ''}">所定労働日数</button></div>`;
    if (sched) html += `<p class="sub" style="margin:-6px 2px 14px">所定労働日数＝その月に働く約束だった日数（シフトや就業規則の勤務日）。出勤率（8割）の判定に使います。</p>`;
  }

  html += `<div class="ychips">
    <button data-act="moreyears" class="add" title="さらに先の年を追加">＋ 年を追加</button>
    ${years.map((y) => {
      const t = workStat(map, y);
      const cls = [y === WORK_YEAR ? 'on' : '', y > curY ? 'fut' : ''].filter(Boolean).join(' ');
      return `<button data-wyear="${y}" class="${cls}">${y}年${t.cnt ? '<i class="dot"></i>' : ''}</button>`;
    }).join('')}
  </div>`;

  const st = workStat(map, WORK_YEAR);
  const avg = st.cnt ? Math.round((st.sum / st.cnt) * 10) / 10 : 0;
  const prevSt = workStat(map, WORK_YEAR - 1);
  let cells = '';
  for (let m = 1; m <= 12; m++) {
    const k = `${WORK_YEAR}-${pad2(m)}`;
    const v = map[k];
    const future = WORK_YEAR > curY || (WORK_YEAR === curY && m > curM);
    const isNow = WORK_YEAR === curY && m === curM;
    cells += `<div class="m ${future ? 'fut' : ''} ${isNow ? 'cur' : ''}"><span>${m}月</span>
      <input type="number" inputmode="numeric" min="0" max="31" placeholder="—"
        value="${typeof v === 'number' ? v : ''}" data-${key}="${k}" aria-label="${WORK_YEAR}年${m}月の${sched ? '所定労働日数' : '出勤日数'}"></div>`;
  }
  html += `<div class="card">
    <div class="yhead"><b>${WORK_YEAR}年</b>
      ${WORK_YEAR > curY ? '<span class="pill acc">予定</span>' : ''}${sched ? '<span class="pill mute">所定労働日数</span>' : ''}
      <span class="sub" data-wsum="${WORK_YEAR}">${st.cnt ? `${st.cnt}ヶ月入力 / 計 <b class="num">${st.sum}</b>日` : '未入力'}</span></div>
    <div class="mg">${cells}</div>
    <div class="wsum">
      <div><span>入力済み</span><b>${st.cnt} / 12ヶ月</b></div>
      <div><span>年間合計</span><b class="num">${st.sum}日</b></div>
      <div><span>月平均</span><b class="num">${st.cnt ? avg : '—'}日</b></div>
    </div>
    <div class="wbtns">
      <button class="btn sm" data-act="patternfill">勤務パターンから入れる</button>
      ${prevSt.cnt ? `<button class="btn sm" data-act="copyprev">${WORK_YEAR - 1}年から写す</button>` : ''}
      <button class="btn sm" data-act="fillyear">全月に同じ数字</button>
      ${st.cnt ? `<button class="btn sm danger" data-act="clearyear">この年を消す</button>` : ''}
    </div>
  </div>`;

  const listYears = years.filter((y) => workStat(map, y).cnt || y === WORK_YEAR || y === curY);
  html += `<h2 class="sec">年ごとの入力状況${sched ? '（所定労働日数）' : ''}</h2><div class="card"><div class="tw"><table>
    <thead><tr><th>年</th><th>入力</th><th>年間合計</th><th>月平均</th><th></th></tr></thead><tbody>`;
  for (const y of listYears) {
    const t = workStat(map, y);
    const a = t.cnt ? Math.round((t.sum / t.cnt) * 10) / 10 : 0;
    html += `<tr class="${y === WORK_YEAR ? 'now' : t.cnt ? '' : 'dim'}">
      <td>${y}年${y > curY ? ' <span class="pill acc">予定</span>' : ''}</td>
      <td class="num">${t.cnt ? `${t.cnt}/12` : '—'}</td>
      <td class="num">${t.cnt ? t.sum + '日' : '—'}</td>
      <td class="num">${t.cnt ? a + '日' : '—'}</td>
      <td><button class="btn sm" data-wyear="${y}">開く</button></td></tr>`;
  }
  html += `</tbody></table></div>
    <p class="sub" style="margin-top:10px">入力のある年と今年だけを表示しています。ほかの年は上のボタンから開いてください。</p></div>`;

  /* ---- 付与日数の判定結果 ---- */
  const r = sim(emp, now);
  html += `<h2 class="sec">付与日数の判定結果</h2><div class="card"><div class="tw"><table>
    <thead><tr><th>基準日</th><th>判定のもと</th><th>区分</th>${S.att8 ? '<th>出勤率</th>' : ''}<th>付与日数</th></tr></thead><tbody>`;
  for (const l of r.lots) {
    const src = l.annualSource === 'contract' ? '<span class="pill acc">契約</span>'
      : l.annualSource === 'actual' ? '<span class="pill ok">実績</span>'
        : l.annualSource === 'partial' ? '<span class="pill warn">一部推定</span>' : '<span class="pill mute">既定値</span>';
    const basisCell = l.annualSource === 'contract' ? (l.weekly ? `週${l.weekly}日` : `年${l.annualDays}日`) : `${l.annualDays}日`;
    let att = '';
    if (S.att8) {
      att = !l.att ? '<td>—</td>' : l.att.known
        ? `<td class="num" style="${l.attFail ? 'color:var(--danger);font-weight:700' : ''}">${Math.floor(l.att.rate * 1000) / 10}%${l.attFail ? '<small>8割未満</small>' : ''}</td>`
        : `<td><span class="pill mute">未判定</span><small>${l.att.missing ? `${l.att.missing.length}ヶ月未入力` : '全労働日なし'}</small></td>`;
    }
    html += `<tr class="${l.future ? 'dim' : ''}">
      <td>${fmtJpShort(l.date)}<small>${l.future ? '予定' : l.label}${l.early ? '・前倒し' : ''}</small></td>
      <td class="num">${basisCell}<small>${src}</small></td>
      <td>${esc(l.categoryShort)}</td>${att}
      <td class="num"><b style="font-size:15px">${fmtD(l.granted)}日</b>${l.overridden ? '<small><span class="pill acc">手入力</span></small>' : l.customDays ? '<small><span class="pill acc">会社独自</span></small>' : ''}</td>
    </tr>`;
  }
  html += `</tbody></table></div>
    <p class="sub" style="margin-top:10px">「一部推定」「既定値」は出勤日数が足りていない期間です。その年を埋めると精度が上がります（未入力の期間は、設定の「出勤日数が未入力のときの目安」＝週${emp.weeklyDays ?? 5}日くらい から推定）。${S.att8 ? '出勤率は、出勤日数＋有給で1日休んだ日＋育児休業などの期間 を、所定労働日数（会社都合の休業日を除く）で割ったものです。' : ''}</p></div>`;
  html += grantTableHelp();
  box.innerHTML = html;
  showSelectedChip(box);
}

/** 勤務パターン（曜日）から月ごとの日数を入れる */
async function patternFill(emp) {
  const y = WORK_YEAR;
  const map = workMap(emp);
  const wp = emp.workPattern || { dows: [1, 2, 3, 4, 5], holidaysOff: true };
  const res = await sheet({
    title: `${y}年の${WORK_MODE === 'sched' ? '所定労働日数' : '出勤日数'}を勤務パターンから入れる`, ok: '入れる', wide: true,
    html: `<div><span class="fl">働く曜日</span><div class="wdays">${[1, 2, 3, 4, 5, 6, 0].map((i) =>
      `<label><input type="checkbox" data-pf="${i}" ${wp.dows.includes(i) ? 'checked' : ''}>${WD[i]}</label>`).join('')}</div></div>
      <label class="chk"><input type="checkbox" id="pfHol" ${wp.holidaysOff ? 'checked' : ''}><span>祝日は休み</span></label>
      <label class="chk"><input type="checkbox" id="pfAbs" checked><span>休業・休職の期間は数えない</span></label>
      <div class="field"><label class="fl">入れる月</label><div class="seg"><button data-pfm="empty" class="on">空いている月だけ</button><button data-pfm="all">この年すべて</button></div></div>
      <div class="preview" id="pfPrev"></div>`,
    init: (ov) => { ov.pfMode = 'empty'; pfPreview(ov, emp, y, map); },
    click: (e, ov) => {
      const b = e.target.closest('[data-pfm]');
      if (b) { ov.pfMode = b.dataset.pfm; ov.querySelectorAll('[data-pfm]').forEach((x) => x.classList.toggle('on', x === b)); pfPreview(ov, emp, y, map); }
    },
    change: (e, ov) => pfPreview(ov, emp, y, map),
    submit: (ov) => {
      const p = pfCompute(ov, emp, y, map);
      if (!p.dows.length) { ov.err('働く曜日を1つ以上選んでください'); return undefined; }
      return p;
    },
  });
  if (!res) return;
  emp.workPattern = { dows: res.dows, holidaysOff: res.hol };
  let n = 0;
  for (const [k, v] of Object.entries(res.vals)) { map[k] = v; n++; }
  saveData(`${WORK_MODE === 'sched' ? '所定労働日数' : '出勤日数'}を勤務パターンから入力（${y}年）`);
  renderWork();
  toast(n ? `${n}ヶ月分を入れました` : '入れる月がありませんでした');
}
function pfCompute(ov, emp, y, map) {
  const dows = [...ov.querySelectorAll('[data-pf]')].filter((c) => c.checked).map((c) => Number(c.dataset.pf)).sort();
  const hol = ov.querySelector('#pfHol').checked;
  const noAbs = ov.querySelector('#pfAbs').checked;
  const abs = absencesOf(emp);
  const vals = {};
  for (let m = 1; m <= 12; m++) {
    const k = `${y}-${pad2(m)}`;
    if (ov.pfMode === 'empty' && typeof map[k] === 'number') continue;
    let n = 0, inEmp = false;
    const last = new Date(y, m, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const ds = `${k}-${pad2(d)}`;
      if (isYmd(emp.hireDate) && ds < emp.hireDate) continue;
      if (isYmd(emp.retireDate) && ds > emp.retireDate) continue;
      inEmp = true;
      const dt = new Date(y, m - 1, d);
      if (!dows.includes(dt.getDay())) continue;
      if (hol && JPHoliday.isHoliday(ds)) continue;
      if (noAbs && abs.some((a) => dt >= a.f && dt < a.t)) continue;
      n++;
    }
    if (inEmp) vals[k] = n;
  }
  return { dows, hol, vals };
}
function pfPreview(ov, emp, y, map) {
  const p = pfCompute(ov, emp, y, map);
  const ks = Object.keys(p.vals);
  ov.querySelector('#pfPrev').innerHTML = ks.length
    ? ks.map((k) => `${Number(k.slice(5))}月 <b>${p.vals[k]}</b>日`).join('、')
    : '入れる月がありません（すべて入力済みか、在籍していない月です）';
}

/* =========================================================================
   従業員の設定（設定画面の中の1人分）
   ========================================================================= */
const EMP_TYPES = ['正社員', 'パート・アルバイト', '契約社員', '嘱託', 'その他'];
function empSummaryText(e) {
  const now = today();
  const parts = [empMeta(e, now)];
  if (isYmd(e.hireDate)) parts.push(`入社 ${fmtJpShort(parseYmd(e.hireDate))}`);
  if (isYmd(e.retireDate)) parts.push(`退職 ${fmtJpShort(parseYmd(e.retireDate))}`);
  return parts.filter(Boolean).join('・');
}
function refreshEmpSummary(e) {
  const box = document.querySelector(`.emp-ed[data-emp="${CSS.escape(e.id)}"]`);
  if (!box) return;
  const b = box.querySelector('summary .who b'), s = box.querySelector('summary .who small');
  if (b) b.textContent = e.name || '(名称未設定)';
  if (s) s.textContent = empSummaryText(e);
}
function optionalDateField(key, value, emptyLabel) {
  // 空でもよい日付（退職日など）
  return `<div class="dfrow">
    <input type="date" id="df-${esc(key)}" data-dfi="${esc(key)}" value="${esc(isYmd(value) ? value : '')}" min="1950-01-01" max="${today().getFullYear() + 5}-12-31">
    <button type="button" class="calbtn" data-df="${esc(key)}" aria-label="カレンダーから選ぶ" title="カレンダーから選ぶ">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="M7.6 13.6h2M7.6 17h2M11.5 13.6h2M11.5 17h2M15.4 13.6h1"/></svg>
    </button></div>
  <div class="dfcap">${isYmd(value) ? dateCaption(value) : esc(emptyLabel || '未設定')}</div>`;
}
function empEditorHtml(e, isOpen) {
  const now = today();
  const S = settings();
  const r = sim(e, now);
  const defLots = r.lots.filter((l) => l.annualSource === 'default' && l.granted > 0);
  const id = esc(e.id);
  const contracts = (e.contracts || []).slice().sort((a, b) => a.from.localeCompare(b.from));
  const abs = (e.absences || []).slice().sort((a, b) => a.from.localeCompare(b.from));
  const open = isOpen || OPEN_EMP === e.id ? 'open' : '';
  let html = `<details class="emp-ed" data-emp="${id}" ${open}>
    <summary><span class="ava" aria-hidden="true">${esc(initials(e.name))}</span>
      <span class="who"><b>${esc(e.name || '(名称未設定)')}</b><small>${esc(empSummaryText(e))}</small></span>
      ${isRetired(e, now) ? '<span class="pill mute">退職</span>' : ''}${e.id === CUR ? '<span class="pill acc">表示中</span>' : ''}</summary>
    <div class="ed">
      <h4>基本</h4>
      <div class="grid2">
        <div><label class="fl">氏名</label><input type="text" maxlength="40" value="${esc(e.name)}" data-ef="name" data-id="${id}" aria-label="氏名"></div>
        <div><label class="fl">社員番号</label><input type="text" maxlength="20" value="${esc(e.empNo || '')}" data-ef="empNo" data-id="${id}" placeholder="任意" aria-label="社員番号"></div>
        <div><label class="fl">店舗・拠点</label><input type="text" maxlength="30" value="${esc(e.store || '')}" data-ef="store" data-id="${id}" list="dl-stores" placeholder="例：本店" aria-label="店舗・拠点"></div>
        <div><label class="fl">部署</label><input type="text" maxlength="30" value="${esc(e.dept || '')}" data-ef="dept" data-id="${id}" list="dl-depts" placeholder="任意" aria-label="部署"></div>
        <div><label class="fl">雇用形態</label><input type="text" maxlength="20" value="${esc(e.empType || '')}" data-ef="empType" data-id="${id}" list="dl-types" placeholder="例：パート・アルバイト" aria-label="雇用形態"></div>
        <div></div>
        <div><label class="fl">入社日</label>${dateField('hire:' + e.id, e.hireDate)}</div>
        <div><label class="fl">退職日（退職したら）</label>${optionalDateField('retire:' + e.id, e.retireDate, 'なし（在籍中）')}
          ${e.retireDate ? `<button class="btn sm quiet" data-act="clearretire" data-id="${id}" style="margin-top:4px">退職日を消す</button>` : ''}</div>
      </div>

      <h4>付与日数の決め方</h4>
      <div class="field"><select class="inp" data-ef="basis" data-id="${id}" aria-label="付与日数の決め方">
        <option value="actual" ${e.basis !== 'contract' ? 'selected' : ''}>出勤実績から（出勤タブの日数で判定）</option>
        <option value="contract" ${e.basis === 'contract' ? 'selected' : ''}>契約の勤務日数で決める</option></select></div>`;
  if (e.basis === 'contract') {
    html += `<div class="mini-list">${contracts.map((c) => `<div class="it ct-it">
        <div class="g grid2" style="align-items:end">
          <div style="grid-column:1/-1"><label class="fl">適用開始日</label>${dateField(`ctf:${e.id}:${c.id}`, c.from)}</div>
          <div><label class="fl">週の勤務日数</label><select class="inp" data-ct="weekly" data-id="${id}" data-cid="${esc(c.id)}">
            ${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${c.weekly === n && !c.annual ? 'selected' : ''}>週${n}日${n === 5 ? '以上' : ''}</option>`).join('')}</select></div>
          <div><label class="fl">年間の日数（任意）</label><input type="number" min="1" max="366" step="1" inputmode="numeric" value="${c.annual || ''}" placeholder="—" data-ct="annual" data-id="${id}" data-cid="${esc(c.id)}" aria-label="年間の所定労働日数"></div>
        </div>
        <label class="chk inline" style="flex:none"><input type="checkbox" data-ct="hours30" data-id="${id}" data-cid="${esc(c.id)}" ${c.hours30 ? 'checked' : ''}>週30時間以上</label>
        ${contracts.length > 1 ? `<button class="ico-btn" data-act="delct" data-id="${id}" data-cid="${esc(c.id)}" aria-label="この契約を削除">${ICON.trash}</button>` : ''}
      </div>`).join('')}</div>
      <button class="btn sm" data-act="addct" data-id="${id}" style="margin-top:6px">${ICON.plus}契約の変更を追加</button>
      <p class="sub" style="margin-top:8px">付与日の時点で有効な契約で判定します。年間の日数を入れると、週の日数より優先します（シフト制などで週の日数が決まっていない人向け）。週30時間以上なら、勤務日数にかかわらず通常の付与（10日〜）になります。</p>`;
  } else {
    html += `<div class="grid2">
        <div><label class="fl">出勤日数が未入力のときの目安</label>
          <select class="inp" data-ef="weeklyDays" data-id="${id}" aria-label="出勤日数が未入力のときの目安">
            ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${Number(e.weeklyDays) === n ? 'selected' : ''}>週${n}日くらい</option>`).join('')}
          </select></div>
        <div style="display:flex;align-items:flex-end"><label class="chk"><input type="checkbox" data-ef="over30h" data-id="${id}" ${e.over30h ? 'checked' : ''}><span>週30時間以上働く<small>勤務日数にかかわらず通常の付与</small></span></label></div>
      </div>
      <div class="hintbox">付与日数は <b>「出勤」タブに入れた実際の出勤日数</b> から自動で決まります。上の目安が使われるのは、出勤日数がまだ入っていない期間だけです。
        ${defLots.length
          ? `<div class="hintwarn">${ICON.alert}<div><b>${defLots.length}回分の付与</b>が、実績ではなく目安で計算されています
               （${defLots.slice(0, 3).map((l) => fmtJpShort(l.date)).join('、')}${defLots.length > 3 ? ' ほか' : ''}）。<br>正確にするには、その前1年分の出勤日数を入れてください。</div></div>
             <button class="btn sm full" data-opendays="${id}" style="margin-top:9px">出勤日数を入れる</button>`
          : `<div class="hintok">${ICON.check}<div>すべての付与が実績から計算されています。</div></div>`}
      </div>`;
  }
  if (S.hourly.enabled) {
    html += `<h4>時間単位年休</h4><div class="grid2"><div><label class="fl">1日の所定労働時間</label>
      <div class="dlg-in" style="margin:0"><input type="number" min="1" max="24" step="0.5" inputmode="decimal" value="${e.hoursPerDay || 8}" data-ef="hoursPerDay" data-id="${id}" aria-label="1日の所定労働時間"><span>時間</span></div>
      <div class="inline-note">1時間未満の端数は切り上げて換算します（例：7.5時間→8時間）。</div></div></div>`;
  }
  const wp = e.workPattern;
  html += `<h4>勤務パターン</h4>
    <div class="wdays" role="group" aria-label="働く曜日">${[1, 2, 3, 4, 5, 6, 0].map((i) =>
      `<label><input type="checkbox" data-wp="${i}" data-id="${id}" ${wp && wp.dows.includes(i) ? 'checked' : ''}>${WD[i]}</label>`).join('')}</div>
    <label class="chk"><input type="checkbox" data-wph data-id="${id}" ${!wp || wp.holidaysOff ? 'checked' : ''}><span>祝日は休み</span></label>
    <p class="sub">${wp ? '期間での記録・休みの確認・出勤日数の自動入力に使います。' : '未設定です。曜日を選ぶと、期間での記録・休みの確認・出勤日数の自動入力に使えます。'}</p>

    <h4>休業・休職の期間</h4>
    <div class="mini-list">${abs.length ? abs.map((a) => `<div class="it"><div class="g"><b>${esc((ABSENCE_KINDS[a.kind] || ABSENCE_KINDS.other).label)}</b>
        <small>${fmtJpShort(parseYmd(a.from))}〜${fmtJpShort(parseYmd(a.to))}・出勤率では${{ deemed: '出勤とみなす', excluded: '全労働日から除く', absent: '欠勤として数える' }[(ABSENCE_KINDS[a.kind] || ABSENCE_KINDS.other).att]}</small></div>
        <button class="ico-btn" data-act="delabs" data-id="${id}" data-aid="${esc(a.id)}" aria-label="この期間を削除">${ICON.trash}</button></div>`).join('')
      : '<p class="sub">登録はありません。</p>'}</div>
    <button class="btn sm" data-act="addabs" data-id="${id}" style="margin-top:6px">${ICON.plus}期間を追加</button>
    ${!S.att8 ? '<p class="sub" style="margin-top:8px">出勤率8割の判定（設定の「付与のルール」）をオンにすると使われます。</p>' : ''}

    <h4>移行時の残日数</h4>
    ${e.opening ? `<p class="sub">${fmtJpShort(parseYmd(e.opening.date))} 時点の残日数から計算しています（${Object.values(e.opening.lots || {}).reduce((s, v) => s + (Number(v) || 0), 0)}日）。</p>`
      : '<p class="sub">ほかのシステムやExcelから移す人は、移した日の残日数を入れると、それより前の記録が無くても正しく計算できます。</p>'}
    <button class="btn sm" data-act="openingedit" data-id="${id}">${e.opening ? '移行時の残日数を直す' : '移行時の残日数を入れる'}</button>

    <h4>この人の操作</h4>
    <div class="wbtns">
      <button class="btn sm" data-open="${id}">個人の画面を開く</button>
      <button class="btn sm" data-opendays="${id}">出勤日数を入れる</button>
      <button class="btn sm danger" data-act="delemp" data-id="${id}">この従業員を削除</button>
    </div>
  </div></details>`;
  return html;
}

/** 入力候補（店舗・部署・雇用形態） */
function empDatalists() {
  const uniq = (k) => [...new Set(DATA.employees.map((e) => String(e[k] || '').trim()).filter(Boolean))];
  return `<datalist id="dl-stores">${uniq('store').map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
    <datalist id="dl-depts">${uniq('dept').map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
    <datalist id="dl-types">${[...new Set([...EMP_TYPES, ...uniq('empType')])].map((s) => `<option value="${esc(s)}">`).join('')}</datalist>`;
}

/** 休業・休職の期間を追加 */
async function addAbsence(e) {
  const now = ymd(today());
  const res = await sheet({
    title: '休業・休職の期間を追加', ok: '追加する',
    html: `<div class="field"><label class="fl" for="abKind">種類</label><select class="inp" id="abKind">
      ${Object.entries(ABSENCE_KINDS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select>
      <div class="inline-note" id="abNote"></div></div>
      <div class="grid2"><div><label class="fl" for="df-abFrom">開始日</label>${dateField('abFrom', now)}</div>
        <div><label class="fl" for="df-abTo">終了日</label>${dateField('abTo', now)}</div></div>
      <div class="field"><label class="fl" for="abMemo">メモ（任意）</label><input type="text" id="abMemo" maxlength="60"></div>`,
    init: (ov) => { const f = () => { const k = ABSENCE_KINDS[ov.querySelector('#abKind').value]; ov.querySelector('#abNote').textContent = `出勤率の計算では「${{ deemed: '出勤したもの', excluded: '全労働日に含めない日', absent: '欠勤' }[k.att]}」として扱います。`; }; f(); ov.abf = f; },
    change: (ev, ov) => { if (ev.target.id === 'abKind') ov.abf(); },
    submit: (ov) => {
      const from = ov.querySelector('#df-abFrom').value, to = ov.querySelector('#df-abTo').value;
      if (!isYmd(from) || !isYmd(to)) { ov.err('開始日と終了日を正しく入れてください'); return undefined; }
      if (from > to) { ov.err('終了日が開始日より前です'); return undefined; }
      return { id: uid(), kind: ov.querySelector('#abKind').value, from, to, note: ov.querySelector('#abMemo').value.trim().slice(0, 60) };
    },
  });
  if (!res) return;
  e.absences = Array.isArray(e.absences) ? e.absences : [];
  e.absences.push(res);
  OPEN_EMP = e.id;
  saveData(`休業・休職の期間を追加（${e.name}）`);
  renderSet();
  toast('期間を追加しました');
}

/** 移行時の残日数（付与日ごと） */
async function editOpening(e) {
  const op = e.opening || {};
  let date = isYmd(op.date) ? op.date : ymd(today());
  const lotsAt = (ds) => {
    if (!isYmd(ds)) return [];
    const d = parseYmd(ds);
    const tmp = JSON.parse(JSON.stringify(e)); delete tmp.opening;
    return buildLots(tmp, d, settings()).filter((l) => l.date <= d && l.expiry > d);
  };
  const rows = (ds) => {
    const lots = lotsAt(ds);
    if (!lots.length) return '<p class="sub">この日の時点で有効な付与がありません（入社日・付与日を確認してください）。</p>';
    return `<div class="tw"><table><thead><tr><th>付与日</th><th>付与日数</th><th>移行時の残</th></tr></thead><tbody>${lots.map((l) => `<tr>
      <td>${fmtJpShort(l.date)}<small>期限 ${fmtJpShort(l.expiry)}</small></td><td class="num">${fmtD(l.granted)}</td>
      <td><input type="number" min="0" max="${l.granted}" step="0.5" inputmode="decimal" data-opl="${l.key}" value="${op.lots && op.lots[l.key] != null ? esc(op.lots[l.key]) : ''}" placeholder="0" style="width:90px;text-align:center" aria-label="${fmtJpShort(l.date)}付与分の残日数"></td></tr>`).join('')}</tbody></table></div>`;
  };
  const res = await sheet({
    title: '移行時の残日数', ok: '保存する', wide: true, del: e.opening ? '移行の設定を消す' : '',
    html: `<p class="sub" style="margin:0">ほかのシステムやExcelから移したときの、移行日時点の残日数を付与日ごとに入れてください。移行日より前の取得の記録は、残日数の計算に使いません。</p>
      <div class="field"><label class="fl" for="df-opd">移行日</label>${dateField('opd', date)}</div>
      <div id="opRows">${rows(date)}</div>
      <div class="field"><label class="fl" for="opOb">いまの年5日の期間で、移行日までに取った日数（任意）</label>
        <input type="number" id="opOb" min="0" max="40" step="0.5" inputmode="decimal" value="${op.obTaken || ''}" placeholder="0"></div>`,
    change: (ev, ov) => {
      if (ev.target.dataset.dfi === 'opd' && isYmd(ev.target.value) && ev.target.value !== date) { date = ev.target.value; ov.querySelector('#opRows').innerHTML = rows(date); }
    },
    submit: (ov) => {
      const d = ov.querySelector('#df-opd').value;
      if (!isYmd(d)) { ov.err('移行日を正しく入れてください'); return undefined; }
      const lots = {};
      for (const inp of ov.querySelectorAll('[data-opl]')) {
        const n = numOrNull(inp.value, 99);
        const max = Number(inp.max);
        if (n == null) { lots[inp.dataset.opl] = 0; continue; }
        if (n > max || Math.round(n * 2) !== n * 2) { ov.err(`残日数は0〜${max}日（0.5日単位）で入れてください`); return undefined; }
        lots[inp.dataset.opl] = n;
      }
      const ob = numOrNull(ov.querySelector('#opOb').value, 40);
      return { date: d, lots, obTaken: ob || 0 };
    },
  });
  if (res === 'delete') {
    if (!(await askDialog({ title: '移行の設定を消しますか？', message: '移行日より前の記録も、ふたたび計算に使うようになります。', ok: '消す', danger: true }))) return;
    delete e.opening; OPEN_EMP = e.id; saveData(`移行時の残日数を削除（${e.name}）`); renderSet(); toast('移行の設定を消しました'); return;
  }
  if (!res) return;
  e.opening = res;
  OPEN_EMP = e.id;
  saveData(`移行時の残日数を設定（${e.name}）`);
  renderSet();
  toast('移行時の残日数を保存しました');
}

/* ---------- 日付欄（ui.js から呼ばれる） ---------- */
function onLeaveDateTyped(v) {
  const el = $('#lvDayNote');
  if (!el) return;
  const n = dayNoteOf(v, currentEmp());
  el.textContent = n.text;
  el.className = 'inline-note ' + n.lv;
}
/** 日付欄に直接入力したとき。扱ったら true */
function onDateInputExt(key, v, t) {
  if (key === 'rgFrom' || key === 'rgTo') {
    if (isYmd(v)) {
      if (key === 'rgFrom') { RG.from = v; if (!isYmd(RG.to) || RG.to < v) { RG.to = v; const to = $('#df-rgTo'); if (to) { to.value = v; updateDateCaption(to); } } }
      else RG.to = v;
    }
    refreshRangePreview();
    return true;
  }
  if (['edDate', 'msFrom', 'msTo', 'abFrom', 'abTo', 'opd', 'yeDate', 'lfFrom', 'lfTo', 'schFrom'].includes(key)) return true; // それぞれの画面で処理
  if (key.startsWith('retire:')) {
    const e = DATA.employees.find((x) => x.id === key.slice(7));
    if (!e) return true;
    if (!isYmd(v)) return true;
    if (isYmd(e.hireDate) && v < e.hireDate) { const cap = t.closest('.dfrow').nextElementSibling; if (cap) { cap.textContent = '入社日より前の日付です'; cap.classList.add('bad'); } return true; }
    if (e.retireDate === v) return true;
    e.retireDate = v; OPEN_EMP = e.id; saveData(`退職日を設定（${e.name}）`); HIRE_DIRTY = true;
    return true;
  }
  if (key.startsWith('ctf:')) {
    const [, eid, cid] = key.split(':');
    const e = DATA.employees.find((x) => x.id === eid);
    const c = e && (e.contracts || []).find((x) => x.id === cid);
    if (!c || !isYmd(v) || c.from === v) return true;
    c.from = v; OPEN_EMP = eid; saveData(`契約の適用開始日を変更（${e.name}）`); HIRE_DIRTY = true;
    return true;
  }
  return false;
}
/** カレンダーボタン。扱ったら true */
function openDateExt(key) {
  const now = today();
  const inp = document.getElementById('df-' + key);
  const pick = (cb) => openDatePicker(inp && isYmd(inp.value) ? inp.value : ymd(now),
    { minYear: Math.max(1950, now.getFullYear() - 50), maxYear: now.getFullYear() + 5 }, cb);
  const setInp = (v) => {
    if (!inp) return;
    inp.value = v; updateDateCaption(inp);
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  };
  if (key.startsWith('hire:')) return false;
  if (key.startsWith('retire:') || key.startsWith('ctf:')) {
    pick((v) => { setInp(v); if (TAB === 'set') { HIRE_DIRTY = false; renderSet(); } });
    return true;
  }
  if (inp) { pick(setInp); return true; }  // ダイアログの中などの日付欄
  return false;
}

/* ---------- イベント ---------- */
document.addEventListener('click', async (ev) => {
  const t = ev.target;
  const u = t.closest('[data-lunit]');
  if (u) {
    LEAVE_UNIT = u.dataset.lunit;
    if (LEAVE_UNIT === 'custom' && (LEAVE_DAYS === 1 || LEAVE_DAYS === 0.5)) LEAVE_DAYS = 2;
    renderLeave(); return;
  }
  const h = t.closest('[data-lhalf]');
  if (h) { LEAVE_HALF = h.dataset.lhalf; $$('[data-lhalf]').forEach((b) => b.classList.toggle('on', b === h)); return; }
  const rh = t.closest('[data-rghalf]');
  if (rh) { RG.half = rh.dataset.rghalf === '1'; $$('[data-rghalf]').forEach((b) => b.classList.toggle('on', b === rh)); refreshRangePreview(); return; }
  const wm = t.closest('[data-wmode]');
  if (wm) { WORK_MODE = wm.dataset.wmode; renderWork(); return; }
  const ed = t.closest('[data-editlv]');
  if (ed) { const emp = currentEmp(); if (emp) await editLeave(emp, ed.dataset.editlv); return; }

  const b = t.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const emp = currentEmp();
  const byId = () => DATA.employees.find((x) => x.id === b.dataset.id);
  if (act === 'addrange') { if (emp) await addRange(emp); return; }
  if (act === 'massleave') { await massLeave(); return; }
  if (act === 'patternfill') { if (emp) await patternFill(emp); return; }
  if (act === 'clearretire') {
    const e = byId(); if (!e) return;
    delete e.retireDate; OPEN_EMP = e.id; saveData(`退職日を削除（${e.name}）`); renderSet(); toast('退職日を消しました'); return;
  }
  if (act === 'addct') {
    const e = byId(); if (!e) return;
    const last = (e.contracts || []).slice().sort((a, x) => a.from.localeCompare(x.from)).pop();
    e.contracts = e.contracts || [];
    e.contracts.push({ id: uid(), from: ymd(today()), weekly: last ? last.weekly : 5, annual: null, hours30: last ? last.hours30 : false });
    OPEN_EMP = e.id; saveData(`契約の変更を追加（${e.name}）`); renderSet(); return;
  }
  if (act === 'delct') {
    const e = byId(); if (!e) return;
    e.contracts = (e.contracts || []).filter((c) => c.id !== b.dataset.cid);
    OPEN_EMP = e.id; saveData(`契約を削除（${e.name}）`); renderSet(); return;
  }
  if (act === 'addabs') { const e = byId(); if (e) await addAbsence(e); return; }
  if (act === 'delabs') {
    const e = byId(); if (!e) return;
    e.absences = (e.absences || []).filter((a) => a.id !== b.dataset.aid);
    OPEN_EMP = e.id; saveData(`休業・休職の期間を削除（${e.name}）`); renderSet(); toast('期間を削除しました'); return;
  }
  if (act === 'openingedit') { const e = byId(); if (e) await editOpening(e); }
});
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'lvHours') { const n = numOrNull(t.value, 999); if (n != null && n > 0) LEAVE_HOURS = n; return; }
  if (t.id === 'rgNote') { RG.note = t.value; return; }
  if (t.id === 'lvQ') {
    LEAVE_Q = t.value;
    const emp = currentEmp();
    const box = $('#lvList');
    if (emp && box) box.innerHTML = leaveItemsHtml(emp, today(), sim(emp, today()));
  }
});
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'lvPlan') { LEAVE_PLAN = t.checked; return; }
  if (t.dataset && t.dataset.rg) {
    RG[t.dataset.rg] = t.checked;
    if (t.dataset.rg === 'onlyPat') { renderLeave(); return; }
    refreshRangePreview(); return;
  }
  if (t.dataset && t.dataset.ct) {
    const e = DATA.employees.find((x) => x.id === t.dataset.id);
    const c = e && (e.contracts || []).find((x) => x.id === t.dataset.cid);
    if (!c) return;
    if (t.dataset.ct === 'weekly') { c.weekly = Number(t.value) || 5; c.annual = null; }
    if (t.dataset.ct === 'annual') { const n = numOrNull(t.value, 366); c.annual = n && n >= 1 ? Math.round(n) : null; }
    if (t.dataset.ct === 'hours30') c.hours30 = t.checked;
    OPEN_EMP = e.id; saveData(`契約を変更（${e.name}）`); renderSet(); return;
  }
  if (t.dataset && (t.dataset.wp != null || t.dataset.wph != null)) {
    const e = DATA.employees.find((x) => x.id === t.dataset.id);
    if (!e) return;
    const box = t.closest('.emp-ed');
    const dows = [...box.querySelectorAll('[data-wp]')].filter((c) => c.checked).map((c) => Number(c.dataset.wp)).sort();
    const hol = box.querySelector('[data-wph]').checked;
    if (!dows.length) delete e.workPattern; else e.workPattern = { dows, holidaysOff: hol };
    OPEN_EMP = e.id; saveData(`勤務パターンを変更（${e.name}）`);
  }
});
