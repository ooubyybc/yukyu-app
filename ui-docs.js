/* =========================================================================
   有給管理 - 帳票・出力
   年次有給休暇管理簿（画面・印刷・CSV・Excel）、本人へのお知らせ、年度末の一覧表、
   有給休暇取得届、カレンダー(.ics)
   ========================================================================= */
'use strict';

const KEEP_TEXT = '期間中と満了後5年間保存（当分の間は3年間）';
const preview = () => !!window.__PREVIEW__;

/* ---------- 管理簿のデータ（CSV と Excel で共通） ---------- */
function ob5Text(r) {
  if (r.unknown) return '移行前のため不明';
  if (!r.required5) return '対象外';
  const o = r.obligation;
  if (r.met5) return '達成';
  return r.closed ? '未達' : `進行中 ${fmtD(o.taken)}/${o.required}`;
}
function itemKind(it) {
  if (it.bulk) return '月まとめ（日付未特定）';
  if (it.unit === 'hour') return `時間単位（${fmtD(it.hours)}時間）`;
  if (it.half === 'am') return '午前半休';
  if (it.half === 'pm') return '午後半休';
  return it.days === 0.5 ? '半日' : '全日';
}
function registerData(emps) {
  const summary = [['氏名', '社員番号', '店舗・拠点', '入社日', '退職日', '基準日', '対象期間', '付与日数', '前年繰越', '使用可能日数',
    '取得日数', '時効消滅', '期末残日数', '年5日取得義務', '状態']];
  const detail = [['氏名', '社員番号', '基準日', '取得年月日', '曜日', '取得日数', '区分', '計画年休', '備考']];
  const now = today();
  for (const e of emps) {
    for (const r of reg(e, now)) {
      summary.push([
        e.name, e.empNo || '', e.store || '', e.hireDate, e.retireDate || '',
        ymd(r.from), `${fmtJpShort(r.from)}〜${fmtJpShort(new Date(r.to.getTime() - 86400000))}`,
        r.granted, r.unknown ? '' : r.carry, r.unknown ? '' : r.total, r.unknown ? '' : r.taken, r.unknown ? '' : r.expired, r.unknown ? '' : r.endRemaining,
        ob5Text(r), r.closed ? '確定' : '進行中',
      ]);
      for (const it of r.items) {
        const d = parseYmd(it.date);
        // 月まとめは日付が分からないので「年月」だけを出す（実在しない取得日を書かない）
        detail.push(it.bulk
          ? [e.name, e.empNo || '', ymd(r.from), it.date.slice(0, 7), '', it.days, itemKind(it), it.planned ? '○' : '', '月まとめ入力（日付未特定）']
          : [e.name, e.empNo || '', ymd(r.from), it.date, WD[d.getDay()], Math.round(it.days * 10000) / 10000, itemKind(it), it.planned ? '○' : '', it.note || '']);
      }
    }
  }
  return { summary, detail };
}
function registerRows(emps) {
  const { summary, detail } = registerData(emps);
  const out = [];
  out.push(['年次有給休暇管理簿（労働基準法施行規則 第24条の7）']);
  out.push([`作成日: ${fmtJp(today())}`, `保存期間: ${KEEP_TEXT}`, companyName() ? `会社: ${companyName()}` : '']);
  out.push([]);
  out.push(['■ 年度ごとの集計']);
  out.push(...summary);
  out.push([]);
  out.push(['■ 取得時季の明細']);
  out.push(...detail);
  return out;
}
function registerXlsx(emps) {
  const { summary, detail } = registerData(emps);
  const head = [['年次有給休暇管理簿（労働基準法施行規則 第24条の7）'], [`作成日 ${fmtJp(today())} ／ 保存期間 ${KEEP_TEXT}${companyName() ? ` ／ ${companyName()}` : ''}`], []];
  return IO.xlsx([
    { name: '年度ごとの集計', rows: [...head, ...summary], titleRows: [0], headerRow: 3,
      widths: [14, 10, 12, 12, 12, 12, 24, 9, 9, 11, 9, 9, 11, 14, 8] },
    { name: '取得時季の明細', rows: [...head, ...detail], titleRows: [0], headerRow: 3,
      widths: [14, 10, 12, 12, 6, 9, 22, 9, 30] },
  ]);
}
function saveRegisterCsv(emps) {
  if (preview()) { toast('CSV保存はGitHub Pages版で使えます'); return; }
  downloadText(`年次有給休暇管理簿_${ymd(today())}.csv`, toCSV(registerRows(emps)));
  toast('CSVを保存しました');
}
function saveRegisterXlsx(emps) {
  if (preview()) { toast('Excel保存はGitHub Pages版で使えます'); return; }
  IO.download(`年次有給休暇管理簿_${ymd(today())}.xlsx`, registerXlsx(emps), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  toast('Excelファイルを保存しました');
}

/* ---------- 画面いっぱいの帳票ビュー（印刷・PDF） ---------- */
function openPrintView(title, bodyHtml, extraButtons, onAct) {
  const ov = document.createElement('div');
  ov.className = 'reg-ov';
  ov.innerHTML = `<div class="reg-top">
      <button class="ico-btn" data-reg="close" aria-label="閉じる" style="color:var(--text)">${ICON.x}</button>
      <b>${esc(title)}</b>
      <span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">${extraButtons || ''}
      <button class="btn sm primary" data-reg="print">${ICON.print}印刷</button></span>
    </div>
    <div class="reg-body">${bodyHtml}
      <p class="reg-note noprint" style="text-align:center">印刷ダイアログで「PDFとして保存」を選ぶとPDFになります。</p>
    </div>`;
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  const close = () => { ov.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.dlg-ov, .dp-ov')) close(); };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('click', (e) => {
    const b = e.target.closest('[data-reg]');
    if (!b) return;
    if (b.dataset.reg === 'close') close();
    else if (b.dataset.reg === 'print') {
      if (preview()) { toast('印刷はGitHub Pages版で使えます'); return; }
      window.print();
    } else if (onAct) onAct(b.dataset.reg);
  });
  return ov;
}

/* ---------- 年次有給休暇管理簿 ---------- */
function grantBasisNote(e, l) {
  let s;
  if (l.overridden) s = '本年度は手動で設定した日数を使用。';
  else if (l.annualSource === 'contract') s = `付与日数は契約の所定労働日数（${l.weekly ? `週${l.weekly}日` : `年${l.annualDays}日`}／${l.categoryShort}）から労働基準法第39条の付与表により算定。`;
  else s = `付与日数は直前の出勤実績（年間所定労働日数 ${l.annualDays}日／${l.categoryShort}）から労働基準法第39条の付与表により算定。`;
  if (l.over30 && !l.overridden) s += '週30時間以上のため通常の付与。';
  if (l.customDays && !l.overridden) s += `会社の付与表により法定（${l.legalDays}日）を上回る日数を付与。`;
  if (l.attFail && !l.overridden) s += `出勤率が8割未満（${Math.floor(l.att.rate * 1000) / 10}%）のため付与なし。`;
  if (l.early) s += '基準日を法定より前倒しして付与。';
  return s;
}
function openRegister(emps, title) {
  const now = today();
  let sheets = '';
  for (const e of emps) {
    const rows = reg(e, now);
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
        const note = it.bulk ? '月まとめ入力（日付未特定）' : [it.planned ? '計画年休' : '', it.note || ''].filter(Boolean).join('・');
        const amt = it.unit === 'hour' ? `${fmtD(it.hours)}時間` : it.half ? `${fmtD(it.days)}<small>${it.half === 'am' ? '午前' : '午後'}</small>` : fmtD(it.days);
        body += `<tr><td>${it.bulk
            ? `${d.getFullYear()}/${d.getMonth() + 1}<small>月中</small>`
            : `${fmtJpShort(d)}<small>${WD[d.getDay()]}曜日</small>`}${note ? `<span class="note-inline">${esc(note)}</span>` : ''}</td>
          <td class="num">${amt}</td>
          <td class="num">${r.unknown ? '—' : dh(run, e)}</td>
          <td class="note-col" style="text-align:left;white-space:normal">${esc(note)}</td></tr>`;
      }
      if (!r.items.length) body = `<tr><td colspan="4"><div class="empty" style="padding:14px">${r.unknown ? '移行前の年度のため、取得の明細はありません' : '取得実績なし'}</div></td></tr>`;
      const o = r.obligation;
      sheets += `<div class="reg-sheet">
        <h3>年次有給休暇管理簿</h3>
        <p class="law">労働基準法施行規則 第24条の7 ／ ${KEEP_TEXT}${companyName() ? ` ／ ${esc(companyName())}` : ''}</p>
        <div class="reg-grid">
          <div><span class="lb">氏名</span><b>${esc(e.name)}</b>${e.empNo ? `<small>社員番号 ${esc(e.empNo)}</small>` : ''}</div>
          <div><span class="lb">入社年月日</span><b>${fmtJpShort(parseYmd(e.hireDate))}</b>${e.retireDate ? `<small>退職 ${fmtJpShort(parseYmd(e.retireDate))}</small>` : ''}</div>
          <div><span class="lb">基準日</span><b>${fmtJpShort(r.from)}</b></div>
          <div><span class="lb">対象期間</span><b class="sm"><span class="nw">${fmtJpShort(r.from)}〜</span><span class="nw">${fmtJpShort(new Date(r.to.getTime() - 86400000))}</span></b></div>
        </div>
        <div class="reg-grid">
          <div><span class="lb">付与日数</span><b>${fmtD(r.granted)}日</b></div>
          <div><span class="lb">前年繰越</span><b>${r.unknown ? '—' : dh(r.carry, e)}</b></div>
          <div><span class="lb">使用可能日数</span><b>${r.unknown ? '—' : dh(r.total, e)}</b></div>
          ${r.preOpening > 0 ? `<div><span class="lb">移行前の使用等</span><b>${dh(r.preOpening, e)}</b><small>明細なし</small></div>` : ''}
        </div>
        <div class="tw"><table>
          <thead><tr><th>取得年月日（時季）</th><th>日数</th><th>残日数</th><th class="note-col" style="text-align:left">備考</th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>
        <div class="reg-grid tot">
          <div><span class="lb">取得日数 計</span><b>${dh(r.taken, e)}</b>${r.hoursTaken > 0 ? `<small>うち時間単位 ${fmtD(r.hoursTaken)}時間</small>` : ''}</div>
          <div><span class="lb">時効消滅</span><b${r.expired > 0 ? ' style="color:var(--danger)"' : ''}>${r.unknown ? '—' : dh(r.expired, e)}</b></div>
          <div><span class="lb">${r.closed ? '期末残日数' : '現在の残日数'}</span><b>${r.unknown ? '—' : dh(r.endRemaining, e)}</b></div>
          <div><span class="lb">年5日取得義務</span><b>${r.unknown ? '<span class="pill mute">移行前</span>' : r.required5
            ? `${fmtD(Math.min(o.taken, o.required))}/${o.required} ${r.met5 ? '<span class="pill ok">達成</span>' : (r.closed ? '<span class="pill danger">未達</span>' : '<span class="pill warn">進行中</span>')}`
            : '<span class="pill mute">対象外</span>'}</b></div>
        </div>
        <p class="reg-note">※ ${esc(grantBasisNote(e, r.lot))}<br>
        ※ 消化は有効期限の近い付与分から充当。付与日から2年で時効消滅（労働基準法 第115条）。${o && o.merged ? `<br>※ 年5日の取得義務は、期間が重なるため ${fmtJpShort(o.from)}〜${fmtJpShort(new Date(o.to.getTime() - 86400000))} でまとめて比例按分（${o.required}日）。` : ''}${r.hoursTaken > 0 ? '<br>※ 時間単位で取得した分は、年5日の取得義務の日数に含めていません。' : ''}</p>
      </div>`;
    }
  }
  openPrintView(title, sheets,
    `<button class="btn sm" data-reg="csv">${ICON.down}CSV</button><button class="btn sm" data-reg="xlsx">${ICON.down}Excel</button>`,
    (a) => { if (a === 'csv') saveRegisterCsv(emps); if (a === 'xlsx') saveRegisterXlsx(emps); });
}

/* ---------- 本人へのお知らせ ---------- */
function noticeSheet(e, now) {
  const r = sim(e, now);
  const ob = r.currentObligation;
  const lots = r.lots.filter((l) => !l.future && l.expiry > now && (l.remaining > 0 || l.used > 0));
  return `<div class="ps">
    <h3>年次有給休暇のお知らせ</h3>
    <p class="sub2">${esc(companyName() || '')}${companyName() ? ' ／ ' : ''}${fmtJp(now)} 現在</p>
    <div class="meta"><span><b style="font-size:15px">${esc(e.name)}</b> 様${e.empNo ? `（社員番号 ${esc(e.empNo)}）` : ''}</span><span>${esc([e.store, e.dept].filter(Boolean).join('・'))}</span></div>
    <div class="big3">
      <div><small>いま使える有給</small><b>${dh(r.balance, e)}</b></div>
      <div><small>次に消滅する日</small><b style="font-size:18px">${r.nextExpiry ? fmtJpShort(r.nextExpiry.date) : '—'}</b>${r.nextExpiry ? `<br>${dh(r.nextExpiry.days, e)}が消滅` : ''}</div>
      <div><small>次回の付与</small><b style="font-size:18px">${r.nextGrant ? fmtJpShort(r.nextGrant.date) : '—'}</b>${r.nextGrant ? `<br>＋${fmtD(r.nextGrant.granted)}日（予定）` : ''}</div>
    </div>
    ${ob ? `<p style="margin:0 0 12px">今年度（${fmtJpShort(ob.from)}〜${fmtJpShort(new Date(ob.to.getTime() - 86400000))}）は、年5日の取得が必要です。いまの取得は <b>${fmtD(ob.taken)}日</b>${ob.shortage > 0 ? `、あと <b>${fmtD(ob.shortage)}日</b> です。` : 'で、達成しています。'}</p>` : ''}
    <table><thead><tr><th>付与日</th><th>付与日数</th><th>使った日数</th><th>残り</th><th>有効期限</th></tr></thead><tbody>
      ${lots.length ? lots.map((l) => `<tr><td>${fmtJpShort(l.date)}</td><td>${fmtD(l.granted)}日</td><td>${dh(l.used, e)}</td><td><b>${dh(l.remaining, e)}</b></td><td>${fmtJpShort(new Date(l.expiry.getTime() - 86400000))}まで</td></tr>`).join('')
        : '<tr><td colspan="5">いま有効な付与はありません</td></tr>'}
    </tbody></table>
    <p class="note2">※ 有給休暇は付与日から2年で時効により消滅します。期限の近いものから使ったものとして計算しています。<br>
    ※ 取得の希望は、早めに担当者へご相談ください。この内容に誤りがあればお知らせください。</p>
  </div>`;
}
function printNotices(emps) {
  const now = today();
  const list = emps.filter((e) => !isRetired(e, now));
  if (!list.length) { toast('対象の従業員がいません'); return; }
  openPrintView(list.length === 1 ? `${list[0].name} さんへのお知らせ` : `本人へのお知らせ（${list.length}人分）`,
    list.map((e) => noticeSheet(e, now)).join(''));
}

/* ---------- 年度末の一覧表 ---------- */
async function yearEndList() {
  const now = today();
  const res = await sheet({
    title: '一覧表の基準日', ok: '表示する',
    html: `<p class="sub" style="margin:0">この日の時点の、全員の付与・取得・残日数を1枚の表にします。</p>
      <div class="field"><label class="fl" for="df-yeDate">基準日</label>${dateField('yeDate', ymd(now))}</div>
      <div class="quick"><button type="button" data-ye="today">今日</button><button type="button" data-ye="3/31">3月31日</button><button type="button" data-ye="12/31">12月31日</button></div>`,
    click: (e, ov) => {
      const b = e.target.closest('[data-ye]');
      if (!b) return;
      const inp = ov.querySelector('#df-yeDate');
      let v = ymd(now);
      if (b.dataset.ye !== 'today') {
        const [m, d] = b.dataset.ye.split('/').map(Number);
        let y = now.getFullYear();
        if (new Date(y, m - 1, d) > now) y--;
        v = ymd(new Date(y, m - 1, d));
      }
      inp.value = v; updateDateCaption(inp);
    },
    submit: (ov) => { const v = ov.querySelector('#df-yeDate').value; if (!isYmd(v)) { ov.err('日付を正しく入れてください'); return undefined; } return v; },
  });
  if (!res) return;
  const d = parseYmd(res);
  const emps = DATA.employees.filter(inScope).filter((e) => !(isYmd(e.retireDate) && e.retireDate < res) && isYmd(e.hireDate) && e.hireDate <= res);
  let rows = '';
  const csv = [['氏名', '社員番号', '店舗・拠点', '直近の付与日', '付与日数', '前年繰越', '今年度の取得', '残日数', '次の消滅', '消滅する日数', '年5日（取得/必要）', '年5日の状態']];
  for (const e of emps.sort((a, b) => (a.store || '').localeCompare(b.store || '', 'ja') || (a.empNo || '').localeCompare(b.empNo || '') || (a.name || '').localeCompare(b.name || '', 'ja'))) {
    const rr = reg(e, d);
    const last = rr[rr.length - 1];
    const s = sim(e, d);
    const ob = s.currentObligation;
    const obTxt = ob ? `${fmtD(ob.taken)}/${ob.required}` : '対象外';
    const obSt = ob ? (ob.shortage <= 0 ? '達成' : `あと${fmtD(ob.shortage)}日`) : '';
    rows += `<tr><td>${esc(e.name)}</td><td>${esc(e.empNo || '')}</td><td>${esc(e.store || '')}</td>
      <td>${last ? fmtJpShort(last.from) : '—'}</td><td>${last ? fmtD(last.granted) : '—'}</td><td>${last && !last.unknown ? dh(last.carry, e) : '—'}</td>
      <td>${last ? dh(last.taken, e) : '—'}</td><td><b>${dh(s.balance, e)}</b></td>
      <td>${s.nextExpiry ? fmtJpShort(s.nextExpiry.date) : '—'}</td><td>${s.nextExpiry ? dh(s.nextExpiry.days, e) : '—'}</td>
      <td>${obTxt}${obSt ? `<br><small>${obSt}</small>` : ''}</td></tr>`;
    csv.push([e.name, e.empNo || '', e.store || '', last ? ymd(last.from) : '', last ? last.granted : '', last && !last.unknown ? last.carry : '', last ? last.taken : '',
      s.balance, s.nextExpiry ? ymd(s.nextExpiry.date) : '', s.nextExpiry ? s.nextExpiry.days : '', obTxt, obSt]);
  }
  const st = curStore();
  const html = `<div class="ps land"><h3>年次有給休暇 一覧表</h3>
    <p class="sub2">${esc(companyName() || '')}${st ? ` ／ ${esc(st)}` : ''} ／ ${fmtJp(d)} 現在 ／ ${emps.length}人</p>
    <table><thead><tr><th>氏名</th><th>社員番号</th><th>店舗・拠点</th><th>直近の付与日</th><th>付与日数</th><th>前年繰越</th><th>今年度の取得</th><th>残日数</th><th>次の消滅</th><th>消滅する日数</th><th>年5日</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="11">対象の従業員がいません</td></tr>'}</tbody></table>
    <p class="note2">※ 今年度＝それぞれの直近の付与日からの1年。残日数は基準日の時点で使える日数です。</p></div>
    <style>@media print{@page{size:A4 landscape;margin:10mm}}</style>`;
  openPrintView('年度末の一覧表', html, `<button class="btn sm" data-reg="csv">${ICON.down}CSV</button>`, (a) => {
    if (a !== 'csv') return;
    if (preview()) { toast('CSV保存はGitHub Pages版で使えます'); return; }
    downloadText(`有給の一覧表_${res}.csv`, toCSV(csv));
    toast('CSVを保存しました');
  });
}

/* ---------- 有給休暇取得届 ---------- */
async function leaveForm(blank) {
  const now = today();
  let emp = null, info = { from: '', to: '', kind: '', reason: '', hours: '' };
  if (!blank) {
    const emps = DATA.employees.filter((e) => !isRetired(e, now));
    const res = await sheet({
      title: '有給休暇取得届', ok: '印刷用に表示', wide: true,
      html: `<div class="field"><label class="fl" for="lfEmp">従業員</label><select class="inp" id="lfEmp">
          ${emps.map((e) => `<option value="${esc(e.id)}" ${e.id === CUR ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
        <div class="grid2"><div><label class="fl" for="df-lfFrom">取得する日（から）</label>${dateField('lfFrom', ymd(now))}</div>
          <div><label class="fl" for="df-lfTo">（まで）</label>${dateField('lfTo', ymd(now))}</div></div>
        <div class="field"><label class="fl" for="lfKind">区分</label><select class="inp" id="lfKind">
          <option value="全日">全日</option><option value="午前半休">午前半休</option><option value="午後半休">午後半休</option><option value="時間単位">時間単位</option></select></div>
        <div class="field"><label class="fl" for="lfReason">事由（任意・書かなくてもよい）</label><input type="text" id="lfReason" maxlength="60"></div>`,
      change: (e, ov) => {
        if (e.target.dataset.dfi === 'lfFrom') { const to = ov.querySelector('#df-lfTo'); if (to.value < e.target.value) { to.value = e.target.value; updateDateCaption(to); } }
      },
      submit: (ov) => {
        const from = ov.querySelector('#df-lfFrom').value, to = ov.querySelector('#df-lfTo').value;
        if (!isYmd(from) || !isYmd(to) || from > to) { ov.err('日付を正しく入れてください'); return undefined; }
        return { id: ov.querySelector('#lfEmp').value, from, to, kind: ov.querySelector('#lfKind').value, reason: ov.querySelector('#lfReason').value.trim() };
      },
    });
    if (!res) return;
    emp = DATA.employees.find((e) => e.id === res.id) || null;
    info = res;
  }
  const r = emp ? sim(emp, now) : null;
  const days = info.from ? datesBetween(info.from, info.to).length : 0;
  const box = (on) => (on ? '■' : '□');
  const html = `<div class="ps"><h3>有給休暇取得届</h3>
    <p class="sub2">${esc(companyName() || '　　　　　　　　')} 御中</p>
    <div class="meta"><span></span><span>提出日　${emp ? fmtJp(now) : '　　　　年　　月　　日'}</span></div>
    <div class="form-row"><div class="lb">所属</div><div class="vl">${emp ? esc([emp.store, emp.dept].filter(Boolean).join('・')) : ''}</div></div>
    <div class="form-row"><div class="lb">氏名</div><div class="vl">${emp ? esc(emp.name) : ''}${emp && emp.empNo ? `（社員番号 ${esc(emp.empNo)}）` : ''}</div></div>
    <div class="form-row"><div class="lb">取得する日</div><div class="vl">${info.from
      ? `${fmtJp(parseYmd(info.from))}${info.to !== info.from ? ` 〜 ${fmtJp(parseYmd(info.to))}` : ''}（${days}日間）`
      : '　　　　年　　月　　日（　）〜　　　　年　　月　　日（　）　　日間'}</div></div>
    <div class="form-row"><div class="lb">区分</div><div class="vl">${box(info.kind === '全日')} 全日　${box(info.kind === '午前半休')} 午前半休　${box(info.kind === '午後半休')} 午後半休　${box(info.kind === '時間単位')} 時間単位（　　時　　分 〜 　　時　　分）</div></div>
    <div class="form-row"><div class="lb">事由（任意）</div><div class="vl">${esc(info.reason || '')}</div></div>
    <div class="form-row"><div class="lb">残日数（参考）</div><div class="vl">${r ? `${dh(r.balance, emp)}（${fmtJp(now)} 現在）` : ''}</div></div>
    <div class="stamp"><div>本人</div><div>所属長</div><div>総務</div></div>
    <p class="note2">※ 有給休暇の取得の理由を書く必要はありません。<br>※ 会社は、事業の正常な運営を妨げる場合に限り、取得の時季を変えるよう求めることがあります（労働基準法 第39条第5項）。</p>
  </div>`;
  openPrintView('有給休暇取得届', html);
}

/* ---------- カレンダー(.ics) ---------- */
function icsEvents(emps) {
  const now = today();
  const ev = [];
  for (const e of emps) {
    if (isRetired(e, now)) continue;
    const r = sim(e, now);
    const nm = e.name || '(名称未設定)';
    if (r.nextExpiry) {
      const last = new Date(r.nextExpiry.date.getTime() - 86400000);
      ev.push({ uid: `exp-${e.id}-${ymd(r.nextExpiry.date)}`, date: ymd(last), alarmDays: 30,
        title: `有給 ${dh(r.nextExpiry.days, e)}の期限（${nm}）`,
        desc: `${fmtJp(last)}までに使わないと、翌日に ${dh(r.nextExpiry.days, e)} が時効で消滅します。` });
    }
    const ob = r.currentObligation;
    if (ob && ob.shortage > 0) {
      const last = new Date(ob.to.getTime() - 86400000);
      ev.push({ uid: `ob-${e.id}-${ymd(ob.from)}`, date: ymd(last), alarmDays: 30,
        title: `年5日の取得期限（${nm}・あと${fmtD(ob.shortage)}日）`,
        desc: `対象期間 ${fmtJpShort(ob.from)}〜${fmtJpShort(last)}。いまの取得 ${fmtD(ob.taken)}日／必要 ${ob.required}日。` });
    }
    if (r.nextGrant) {
      ev.push({ uid: `grant-${e.id}-${r.nextGrant.key}`, date: r.nextGrant.key, alarmDays: 0,
        title: `有給の付与 ＋${fmtD(r.nextGrant.granted)}日（${nm}）`, desc: '見込みの日数です。出勤日数などで変わることがあります。' });
    }
  }
  return ev;
}
function saveIcs(emps, label) {
  if (preview()) { toast('カレンダー登録はGitHub Pages版で使えます'); return; }
  const ev = icsEvents(emps);
  if (!ev.length) { toast('登録する予定がありません'); return; }
  IO.download(`有給の期限_${label}.ics`, IO.ics(ev, `有給の期限（${label}）`), 'text/calendar;charset=utf-8');
  toast(`${ev.length}件の予定を保存しました。開くとカレンダーに追加できます`);
}

/* =========================================================================
   帳票・出力の画面
   ========================================================================= */
function renderDocs() {
  const box = $('#p-docs');
  if (!DATA.employees.length) { box.innerHTML = welcomeHtml(); return; }
  const emp = currentEmp();
  const st = curStore();
  const scope = st ? `「${esc(st)}」の人` : '全員';
  box.innerHTML = `<p class="sub" style="margin:0 2px 14px">${st ? `店舗・拠点を「${esc(st)}」に絞っています（ダッシュボードで変えられます）。` : ''}印刷はプリンタの選択で「PDFとして保存」を選ぶとPDFになります。</p>
  <div class="tiles">
    <div class="tile"><h3>${ICON.doc}年次有給休暇管理簿</h3>
      <p>法律で作成と保存が必要な帳簿です（${KEEP_TEXT}）。退職した人の分も残ります。</p>
      <div class="acts"><button class="btn" data-doc="regall">表示・印刷</button><button class="btn" data-doc="regcsv">CSV</button><button class="btn" data-doc="regxlsx">Excel</button></div></div>
    <div class="tile"><h3>${ICON.print}本人へのお知らせ</h3>
      <p>残日数・消滅の期限・次回の付与・年5日の状況を1人1枚にまとめます。給与明細と一緒に渡すのに便利です。</p>
      <div class="acts">${emp ? `<button class="btn" data-doc="notice1">${esc(honor(emp.name))}</button>` : ''}<button class="btn" data-doc="noticeall">${scope}</button></div></div>
    <div class="tile"><h3>${ICON.doc}年度末の一覧表</h3>
      <p>基準日の時点の、${scope}の付与・繰越・取得・残日数・年5日を1枚の表にします（CSVも）。</p>
      <div class="acts"><button class="btn" data-doc="yearend">基準日を選んで表示</button></div></div>
    <div class="tile"><h3>${ICON.doc}有給休暇取得届</h3>
      <p>申請用の様式です。名前と日付を入れて印刷するか、白紙で印刷して手書きで使えます。</p>
      <div class="acts"><button class="btn" data-doc="form">記入して印刷</button><button class="btn" data-doc="formblank">白紙を印刷</button></div></div>
    <div class="tile"><h3>${ICON.clock}カレンダーに登録</h3>
      <p>消滅の期限・年5日の期限・次回付与を、スマホやPCのカレンダーに入れるファイル（.ics）を保存します。期限の30日前に通知します。</p>
      <div class="acts">${emp ? `<button class="btn" data-doc="ics1">${esc(honor(emp.name))}</button>` : ''}<button class="btn" data-doc="icsall">${scope}</button></div></div>
    <div class="tile"><h3>${ICON.down}取り込み・書き出し</h3>
      <p>出勤日数・従業員名簿・移行時の残日数のCSV取り込みと、バックアップの書き出しは設定の「データ」にあります。</p>
      <div class="acts"><button class="btn" data-act="godata">設定のデータへ</button></div></div>
  </div>`;
}

document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-doc],[data-act="notice1"],[data-act="ics1"]');
  if (!b) return;
  const emp = currentEmp();
  const scopeEmps = () => DATA.employees.filter(inScope);
  const k = b.dataset.doc || b.dataset.act;
  if (k === 'regall') { if (!DATA.employees.length) { toast('従業員が登録されていません'); return; } openRegister(scopeEmps(), '年次有給休暇管理簿'); return; }
  if (k === 'regcsv') { saveRegisterCsv(scopeEmps()); return; }
  if (k === 'regxlsx') { saveRegisterXlsx(scopeEmps()); return; }
  if (k === 'notice1') { if (emp) printNotices([emp]); return; }
  if (k === 'noticeall') { printNotices(scopeEmps()); return; }
  if (k === 'yearend') { await yearEndList(); return; }
  if (k === 'form') { await leaveForm(false); return; }
  if (k === 'formblank') { await leaveForm(true); return; }
  if (k === 'ics1') { if (emp) saveIcs([emp], emp.name || '従業員'); return; }
  if (k === 'icsall') { saveIcs(scopeEmps(), curStore() || '全員'); }
});
