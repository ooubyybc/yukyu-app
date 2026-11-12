/* =========================================================================
   有給管理 - ダッシュボード / 個人 / カレンダー / メニュー
   ========================================================================= */
'use strict';

/* ---------- 共通の小物 ---------- */
function initials(name) {
  const t = String(name || '').trim();
  return t ? Array.from(t)[0] : '？';
}
/** 姓だけ（空白があれば前半） */
function shortName(name) {
  const t = String(name || '').trim();
  const i = t.search(/[ 　]/);
  return i > 0 ? t.slice(0, i) : t || '(名称未設定)';
}
/** 「佐藤さん」（名前がすでに「〜さん」などなら付けない） */
function honor(name) {
  const s = shortName(name);
  return /(さん|様|さま|君|くん|ちゃん)$/.test(s) ? s : s + 'さん';
}
function storeNames() {
  return [...new Set(DATA.employees.map((e) => String(e.store || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ja'));
}
function curStore() {
  const ui = loadUI();
  const v = ui.stores && typeof ui.stores === 'object' ? ui.stores[activeCompanyId()] || '' : '';
  return v && storeNames().includes(v) ? v : '';
}
function setStore(v) {
  const ui = loadUI();
  ui.stores = ui.stores && typeof ui.stores === 'object' ? ui.stores : {};
  ui.stores[activeCompanyId()] = v || '';
  saveUI(ui);
}
function inScope(e) {
  const st = curStore();
  return !st || String(e.store || '').trim() === st;
}
/** 「本店・パート・週3日」のような一行 */
function empMeta(e, now) {
  const parts = [];
  if (e.store) parts.push(e.store);
  if (e.dept) parts.push(e.dept);
  if (e.empType) parts.push(e.empType);
  if (e.basis === 'contract') {
    const c = contractAt(e, now || today());
    if (c) parts.push(c.annual ? `年${c.annual}日` : `週${c.weekly}日`);
  }
  if (e.over30h || (e.basis === 'contract' && (contractAt(e, now || today()) || {}).hours30)) parts.push('週30時間以上');
  return parts.join('・');
}
/** 緊急度：danger / warn / ok */
function levelOf(r) {
  if (r.retired) return 'ok';
  const dl = r.nextExpiry ? r.nextExpiry.daysLeft : 9999;
  const ob = r.currentObligation;
  if (dl <= 30 || (ob && ob.shortage > 0 && ob.daysLeft <= 90) || r.shortfalls.length) return 'danger';
  if (dl <= 90 || (ob && ob.shortage > 0)) return 'warn';
  return 'ok';
}
/** 年5日のペース（あと何ヶ月で何日） */
function paceText(ob) {
  if (!ob || ob.shortage <= 0) return '';
  const months = Math.max(1, Math.ceil(ob.daysLeft / 30.44));
  const per = Math.ceil((ob.shortage / months) * 2) / 2;
  return months <= 1 ? `今月中に${fmtD(ob.shortage)}日` : `残り${months}ヶ月で${fmtD(ob.shortage)}日（月${fmtD(per)}日ペース）`;
}
/** 今の付与年度の取得率 */
function yearStats(r) {
  const past = r.lots.filter((l) => !l.future);
  const lot = past[past.length - 1];
  if (!lot || !(lot.granted > 0)) return null;
  const i = r.lots.indexOf(lot);
  let end = addMonths(lot.date, 12);
  if (r.lots[i + 1] && r.lots[i + 1].date < end) end = r.lots[i + 1].date;
  const skip = new Set((r.preOpeningLeaves || []).map((l) => l.id));
  const taken = nd(r.leaves.filter((l) => !skip.has(l.id)).filter((l) => {
    const d = parseYmd(l.eff);
    return d >= lot.date && d < end;
  }).reduce((s, l) => s + l.days, 0));
  return { lot, from: lot.date, to: end, granted: lot.granted, taken, rate: taken / lot.granted };
}
function obDeadline(ob) { return new Date(ob.to.getTime() - 86400000); }

/* =========================================================================
   ダッシュボード
   ========================================================================= */
function dashItems(now) {
  return DATA.employees.filter(inScope).map((e) => {
    const r = sim(e, now);
    return { e, r, retired: r.retired, lv: levelOf(r), dl: r.nextExpiry ? r.nextExpiry.daysLeft : 9999 };
  });
}
function matchSearch(e, q) {
  if (!q) return true;
  const hay = [e.name, e.empNo, e.store, e.dept, e.empType].map((v) => String(v || '').toLowerCase()).join(' ');
  return q.split(/\s+/).every((w) => hay.includes(w));
}

function renderList() {
  const box = $('#p-list');
  if (!DATA.employees.length) { box.innerHTML = welcomeHtml(); return; }
  const now = today();
  const items = dashItems(now);
  const act = items.filter((x) => !x.retired);
  const stores = storeNames();
  const st = curStore();

  /* ---- 上の操作 ---- */
  let html = `<div class="pagebar">
    <label class="search grow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>
      <input type="search" id="dashQ" placeholder="従業員を検索（名前・番号・店舗）" value="${esc(SEARCH)}" aria-label="従業員を検索"></label>
    ${stores.length ? `<select class="selbox" id="storeSel" aria-label="店舗・拠点で絞り込む">
      <option value="">すべての店舗・拠点</option>${stores.map((s) => `<option value="${esc(s)}" ${s === st ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}
    <button class="btn primary" data-act="quickrec">${ICON.plus}有給を記録</button>
  </div>`;

  html += dashBanners(now);

  /* ---- 数字のまとめ ---- */
  const totalBal = nd(act.reduce((s, x) => s + x.r.balance, 0));
  const soon = act.filter((x) => x.dl <= 30).sort((a, b) => a.dl - b.dl);
  const short5 = act.filter((x) => x.r.currentObligation && x.r.currentObligation.shortage > 0)
    .sort((a, b) => a.r.currentObligation.to - b.r.currentObligation.to);
  const ym = ymd(now).slice(0, 7);
  const monthTaken = nd(act.reduce((s, x) => s + x.r.leaves.filter((l) => l.eff.slice(0, 7) === ym).reduce((t, l) => t + l.days, 0), 0));
  let gSum = 0, tSum = 0;
  for (const x of act) { const ys = yearStats(x.r); if (ys) { gSum += ys.granted; tSum += ys.taken; } }
  const rate = gSum > 0 ? Math.round((tSum / gSum) * 100) : null;
  html += `<div class="kpis">
    <div class="kpi"><div class="k">使える有給（${st ? esc(st) : '全員'}）</div>
      <div class="v"><b>${fmtD(Math.floor(totalBal * 10 + 1e-6) / 10)}</b><i>日</i></div><div class="s">${act.length}人の合計</div></div>
    <div class="kpi ${soon.length ? 'danger' : ''}"><div class="k">30日以内に消滅</div>
      <div class="v"><b>${soon.length}</b><i>人</i></div>
      <div class="s">${soon.length ? `${esc(honor(soon[0].e.name))} ${dh(soon[0].r.nextExpiry.days, soon[0].e)}（${soon[0].r.nextExpiry.date.getMonth() + 1}/${soon[0].r.nextExpiry.date.getDate()}）` : 'ありません'}</div></div>
    <div class="kpi ${short5.length ? 'warn' : ''}"><div class="k">年5日 未達</div>
      <div class="v"><b>${short5.length}</b><i>人</i></div>
      <div class="s">${short5.length ? `最も近い期限 ${fmtJpShort(obDeadline(short5[0].r.currentObligation))}` : '全員達成か対象外'}</div></div>
    <div class="kpi"><div class="k">今月の取得</div>
      <div class="v"><b>${fmtD(Math.round(monthTaken * 100) / 100)}</b><i>日</i></div><div class="s">${now.getMonth() + 1}月1日〜${now.getDate()}日</div></div>
    <div class="kpi"><div class="k">取得率（今年度）</div>
      <div class="v"><b>${rate == null ? '—' : rate}</b><i>${rate == null ? '' : '%'}</i></div>
      <div class="s">${gSum ? `付与 ${fmtD(nd(gSum))}日のうち ${fmtD(Math.round(tSum * 10) / 10)}日` : '付与済みの人がいません'}</div></div>
  </div>`;

  /* ---- 従業員の表と、右側の要対応など ---- */
  html += `<div class="dash"><div class="dcol">
    <section class="pcard" aria-labelledby="h-emps"><div class="h"><h2 id="h-emps">従業員</h2>
      <div class="r">
        <label class="chk inline" style="font-size:12.5px"><input type="checkbox" id="showRet" ${SHOW_RETIRED ? 'checked' : ''}>退職者も表示</label>
        <div class="seg sorter" style="margin:0">${[['urgent', '期限が近い順'], ['balance', '残日数順'], ['name', '名前順']].map(([v, t]) =>
          `<button data-sort="${v}" class="${SORT === v ? 'on' : ''}">${t}</button>`).join('')}</div>
      </div></div>
      <div id="empRows">${empRowsHtml(items, now)}</div>
    </section>
    <div class="card" style="margin:0"><h2 class="sec" style="margin-top:0">年次有給休暇管理簿</h2>
      <p class="sub" style="margin-bottom:14px">作成と保存（期間中と満了後5年間、当分の間は3年間）が義務づけられている帳簿です。印刷・PDF・CSV・Excelで出せます。</p>
      <div class="row"><button class="btn" data-act="regall">${ICON.doc}全員分を表示</button><button class="btn" data-tab="docs">${ICON.down}帳票・出力へ</button></div>
    </div>
  </div><div class="dcol">
    <section class="pcard" aria-labelledby="h-todo"><div class="h"><h2 id="h-todo">要対応</h2></div><div class="b">${todoHtml(act, now)}</div></section>
    <section class="pcard" aria-labelledby="h-week"><div class="h"><h2 id="h-week">今週のお休み</h2><div class="r"><button class="btn sm quiet" data-tab="cal">カレンダー</button></div></div>
      <div class="b">${weekHtml(items.map((x) => x.e), now)}</div></section>
    <section class="pcard" aria-labelledby="h-next"><div class="h"><h2 id="h-next">次の付与</h2></div><div class="b">${nextGrantsHtml(act)}</div></section>
  </div></div>`;
  box.innerHTML = html;
}

function empRowsHtml(items, now) {
  const q = SEARCH.trim().toLowerCase();
  const rows = items.filter((x) => (SHOW_RETIRED || !x.retired) && matchSearch(x.e, q));
  rows.sort((a, b) => {
    if (a.retired !== b.retired) return a.retired ? 1 : -1;
    if (SORT === 'name') return (a.e.name || '').localeCompare(b.e.name || '', 'ja');
    if (SORT === 'balance') return b.r.balance - a.r.balance;
    const lvRank = { danger: 0, warn: 1, ok: 2 };
    return lvRank[a.lv] - lvRank[b.lv] || a.dl - b.dl;
  });
  if (!rows.length) return `<div class="empty">${q ? '見つかりませんでした' : '表示する従業員がいません'}</div>`;
  let html = `<div class="erow head" aria-hidden="true"><span></span><span>氏名</span><span style="text-align:right">使える有給</span><span>次に消滅</span><span>年5日の取得</span></div>`;
  for (const x of rows) {
    const { e, r } = x;
    const ob = r.currentObligation;
    let ex;
    if (r.retired) ex = `<span class="ex">退職<small>${fmtJpShort(r.retireDate)}</small></span>`;
    else if (r.nextExpiry) {
      const cls = x.dl <= 30 ? 'danger' : x.dl <= 90 ? 'warn' : '';
      ex = `<span class="ex ${cls}">${fmtJpShort(r.nextExpiry.date)}に<span class="nw">${dh(r.nextExpiry.days, e)}</span><small>あと${x.dl}日</small></span>`;
    } else ex = `<span class="ex"><small>消滅予定なし</small></span>`;
    let obh;
    if (!ob) obh = `<span class="ob na">${r.retired ? '—' : '対象外'}</span>`;
    else {
      const pct = Math.min(100, (ob.taken / ob.required) * 100).toFixed(0);
      const tone = ob.shortage <= 0 ? 'var(--ok)' : ob.daysLeft <= 90 ? 'var(--danger)' : 'var(--gold)';
      obh = `<span class="ob"><span class="l"><span>${fmtD(Math.min(ob.taken, ob.required))}/${ob.required}</span><span>${ob.shortage <= 0 ? '達成' : `あと${fmtD(ob.shortage)}日`}</span></span>
        <span class="bar" style="--tone:${tone}"><i style="width:${pct}%"></i></span></span>`;
    }
    const tags = (r.shortfalls.length ? '<span class="pill danger">不足</span>' : '') + (r.afterRetire.length ? '<span class="pill warn">要確認</span>' : '');
    html += `<button class="erow ${r.retired ? 'retired' : ''} lv-${x.lv}" data-open="${esc(e.id)}">
      <span class="ava" aria-hidden="true">${esc(initials(e.name))}</span>
      <span class="who" style="min-width:0"><span class="nm">${esc(e.name || '(名称未設定)')}${tags ? `<span class="tags">${tags}</span>` : ''}</span>
        <span class="mt">${esc(empMeta(e, now) || (isYmd(e.hireDate) ? tenureText(parseYmd(e.hireDate), now) : ''))}</span></span>
      <span class="bal">${r.retired ? '<b>—</b>' : dhBI(r.balance, e)}</span>
      ${ex}${obh}
    </button>`;
  }
  return html;
}

/** 要対応の一覧（急ぐものから） */
function todoList(act, now) {
  const out = [];
  for (const x of act) {
    const { e, r } = x;
    const nm = honor(e.name);
    if (r.nextExpiry && r.nextExpiry.daysLeft <= 90) {
      const dl = r.nextExpiry.daysLeft;
      out.push({ lv: dl <= 30 ? 'danger' : 'warn', rank: dl, id: e.id,
        t: `${nm} ${dh(r.nextExpiry.days, e)}が${r.nextExpiry.date.getMonth() + 1}/${r.nextExpiry.date.getDate()}に消滅`,
        d: `あと${dl}日。${dl <= 30 ? '取得の予定を相談してください' : '計画的に取得してください'}` });
    }
    const ob = r.currentObligation;
    if (ob && ob.shortage > 0) {
      out.push({ lv: ob.daysLeft <= 90 ? 'danger' : 'warn', rank: ob.daysLeft + 1, id: e.id,
        t: `${nm} 年5日の取得 ${fmtD(ob.taken)}/${ob.required}`,
        d: `期限 ${fmtJpShort(obDeadline(ob))}（あと${ob.daysLeft}日）・${paceText(ob)}` });
    }
    if (r.shortfalls.length) {
      out.push({ lv: 'danger', rank: 0, id: e.id, t: `${nm} 有給が足りない記録があります`,
        d: `${r.shortfalls.length}件。記録の日付や出勤日数を確認してください` });
    }
    if (r.afterRetire.length) {
      out.push({ lv: 'warn', rank: 5, id: e.id, t: `${nm} 退職日より後の記録があります`, d: `${r.afterRetire.length}件は計算に使っていません` });
    }
    if (r.nextGrant && r.nextGrant.att && !r.nextGrant.att.known && r.nextGrant.att.missing && diffDays(now, r.nextGrant.date) <= 60) {
      out.push({ lv: 'info', rank: 200, id: e.id, t: `${nm} 出勤率の判定に必要な日数が未入力`,
        d: `${r.nextGrant.att.missing.length}ヶ月分の所定労働日数か出勤日数が入っていません` });
    }
  }
  const order = { danger: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.lv] - order[b.lv] || a.rank - b.rank);
}
function todoHtml(act, now) {
  const list = todoList(act, now);
  if (!list.length) return `<div class="empty" style="padding:14px 6px">対応が必要なことはありません</div>`;
  const icon = (lv) => (lv === 'danger' ? ICON.alert : lv === 'info' ? ICON.info : ICON.clock);
  let html = list.slice(0, 8).map((t) => `<button class="todo ${t.lv}" data-open="${esc(t.id)}">
    <span class="ic">${icon(t.lv)}</span><span style="min-width:0"><span class="t">${esc(t.t)}</span><span class="d">${esc(t.d)}</span></span></button>`).join('');
  if (list.length > 8) html += `<p class="sub" style="margin-top:8px">ほか${list.length - 8}件</p>`;
  return html;
}

/** その日に記録がある人（日付の分かる記録だけ） */
function offOn(emps, dateKey) {
  const out = [];
  for (const e of emps) {
    for (const l of e.leaves || []) {
      if (!l || l.bulk || l.date !== dateKey || !(leaveDaysOf(e, l) > 0)) continue;
      out.push({ e, l });
    }
  }
  return out;
}
function weekHtml(emps, now) {
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const amt = (x) => (x.l.unit === 'hour' || Number(x.l.days) !== 1) ? leaveAmount(x.l, x.e) : '';
  let html = '<div class="week">';
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
    const k = ymd(d);
    const hol = JPHoliday.name(k);
    const list = offOn(emps, k);
    const cls = ['r', 's' + d.getDay(), +d === +now ? 'today' : '', hol ? 'hol' : ''].filter(Boolean).join(' ');
    const ppl = list.slice(0, 4).map((x) => {
      const a = amt(x);
      return `<span class="p">${esc(x.e.name || '(名称未設定)')}${a ? `<small>${esc(a)}</small>` : ''}</span>`;
    }).join('') + (list.length > 4 ? `<span class="more">ほか${list.length - 4}人</span>` : '');
    html += `<div class="${cls}"${+d === +now ? ' aria-current="date"' : ''}>
      <span class="dt"><b>${d.getMonth() + 1 === now.getMonth() + 1 ? '' : `${d.getMonth() + 1}/`}${d.getDate()}</b><small>${WD[d.getDay()]}</small></span>
      <span class="wp">${hol ? `<span class="hn">${esc(hol)}</span>` : ''}${ppl || (hol ? '' : '<span class="none">—</span>')}</span></div>`;
  }
  return html + '</div>';
}
function nextGrantsHtml(act) {
  const g = act.filter((x) => x.r.nextGrant).map((x) => ({ e: x.e, l: x.r.nextGrant }))
    .sort((a, b) => a.l.date - b.l.date).slice(0, 5);
  if (!g.length) return '<div class="empty" style="padding:14px 6px">予定はありません</div>';
  return '<div class="glist">' + g.map((x) => `<div class="g"><span class="dt">${x.l.date.getMonth() + 1}/${x.l.date.getDate()}</span>
    <span class="nm">${esc(x.e.name)}</span><span class="dd">＋${fmtD(x.l.granted)}<i>日</i></span></div>`).join('') + '</div>';
}

/* =========================================================================
   個人
   ========================================================================= */
function renderHome() {
  const emp = currentEmp();
  const box = $('#p-home');
  if (!emp) { box.innerHTML = welcomeHtml(); return; }
  const now = today();
  const r = sim(emp, now);
  const S = settings();
  const hire = isYmd(emp.hireDate) ? parseYmd(emp.hireDate) : now;
  let html = '';

  if (r.retired) {
    html += `<div class="banner">${ICON.info}<div class="tx"><b>${fmtJp(r.retireDate)}に退職</b>
      退職時点の残日数は ${dh(r.balanceAtRetire, emp)} でした（退職により消滅）。記録と管理簿はそのまま残ります。</div></div>`;
  }

  /* ---- ヒーロー ---- */
  const bal = r.retired ? r.balanceAtRetire : r.balance;
  const bigNum = dhParts(bal, emp).map(([n, u], i) => `<span class="v${i ? ' sm' : ''}">${n}</span><span class="u">${u}</span>`).join('');
  const meta = [emp.empNo ? `No.${esc(emp.empNo)}` : '', esc(empMeta(emp, now))].filter(Boolean).join('・');
  html += `<div class="card hero">
    <div class="who"><b>${esc(emp.name || '(名称未設定)')}</b><span class="tn">${r.retired ? '退職' : tenureText(hire, now)}</span></div>
    ${meta ? `<div class="eno">${meta}</div>` : ''}
    <div class="lbl">${r.retired ? '退職時の残日数' : '使える有給'}</div>
    <div class="big">${bigNum}</div>
    <div class="cap">${fmtJp(r.retired ? r.retireDate : now)} 時点</div>
    <div class="hero-split">
      <div><span>次に消滅</span><b>${r.nextExpiry ? `<span class="nw">${fmtJpShort(r.nextExpiry.date)}</span> <small>${dh(r.nextExpiry.days, emp)}</small>` : '—'}</b></div>
      <div><span>次回付与</span><b>${r.nextGrant ? `<span class="nw">${fmtJpShort(r.nextGrant.date)}</span> <small>＋${fmtD(r.nextGrant.granted)}日</small>` : '—'}</b></div>
    </div>
    ${r.planned.length ? `<div class="hero-plan" data-k="planned"><span>取得予定 ${dh(r.plannedDays, emp)}を引くと</span><b>${dh(r.plannedBalance, emp)}</b></div>` : ''}
  </div>`;

  /* ---- お知らせ ---- */
  if (r.nextExpiry) {
    const dl = r.nextExpiry.daysLeft;
    const lv = dl <= 30 ? 'danger' : dl <= 90 ? 'warn' : 'info';
    html += `<div class="note ${lv}">${dl <= 90 ? ICON.alert : ICON.clock}<div style="flex:1;min-width:0">
      <div class="t">${fmtJp(r.nextExpiry.date)}に <em class="nw">${dh(r.nextExpiry.days, emp)}</em> が消滅します</div>
      <div class="d">期限まで <b>あと${dl}日</b>${dl <= 90 ? ' — 計画的に取得してください。' : '。'}</div>
      <div class="bar"><i style="width:${Math.max(3, Math.min(100, (1 - dl / 730) * 100)).toFixed(0)}%"></i></div>
    </div></div>`;
  } else if (!r.retired && r.balance <= 0) {
    html += `<div class="note info">${ICON.info}<div><div class="t">現在使える有給はありません</div>
      <div class="d">${r.nextGrant ? `次回付与は ${fmtJp(r.nextGrant.date)}（${fmtD(r.nextGrant.granted)}日）です。` : ''}</div></div></div>`;
  }
  const ob = r.currentObligation;
  if (ob) {
    const done = ob.shortage <= 0;
    const lv = done ? 'ok' : ob.daysLeft <= 90 ? 'danger' : 'warn';
    html += `<div class="note ${lv}">${done ? ICON.check : ICON.alert}<div style="flex:1;min-width:0">
      <div class="t">年5日の取得義務 <em class="nw">${fmtD(ob.taken)} / ${ob.required}日</em>${done ? ' 達成' : `<span class="nw">（あと${fmtD(ob.shortage)}日）</span>`}</div>
      <div class="d">対象期間 <span class="nw">${fmtJpShort(ob.from)}〜${fmtJpShort(obDeadline(ob))}</span><span class="nw">（あと${ob.daysLeft}日）</span>
        ${ob.merged ? '<br>付与の期間が重なるため、まとめて比例按分しています（必要日数 ' + ob.required + '日）。' : ''}
        ${done ? '' : `<br><b>${esc(paceText(ob))}</b>の取得が必要です。`}</div>
      <div class="bar"><i style="width:${Math.min(100, (ob.taken / ob.required) * 100).toFixed(0)}%"></i></div>
    </div></div>`;
  }
  if (r.shortfalls.length) {
    const s = nd(r.shortfalls.reduce((a, b) => a + b.days, 0));
    html += `<div class="note danger">${ICON.alert}<div style="min-width:0"><div class="t">有給が足りず、引けていない記録があります（計<em>${dh(s, emp)}</em>）</div>
      <div class="d">${r.shortfalls.slice(0, 4).map((x) => `${leaveLabel(x)}（${dh(x.days, emp)}分）`).join('、')}${r.shortfalls.length > 4 ? ' ほか' : ''}<br>
      最初の付与日より前の取得や、出勤日数の入力漏れ・記録の誤りが考えられます。「記録」で確認できます。</div></div></div>`;
  }
  if (r.afterRetire.length) {
    html += `<div class="note warn">${ICON.alert}<div><div class="t">退職日より後の記録が ${r.afterRetire.length}件 あります</div>
      <div class="d">計算には使っていません。退職日か記録の日付を確認してください。</div></div></div>`;
  }
  if (r.preOpeningLeaves && r.preOpeningLeaves.length) {
    html += `<div class="note info">${ICON.info}<div><div class="t">移行日より前の記録が ${r.preOpeningLeaves.length}件 あります</div>
      <div class="d">移行時の残日数（${fmtJpShort(r.opening.date)}時点）から計算しているため、これらの記録は残日数から引いていません。</div></div></div>`;
  }
  if (S.att8 && r.nextGrant && r.nextGrant.att) {
    const a = r.nextGrant.att;
    if (a.known && a.rate < 0.8) {
      html += `<div class="note warn">${ICON.alert}<div><div class="t">次回（${fmtJpShort(r.nextGrant.date)}）は出勤率 ${Math.floor(a.rate * 1000) / 10}% で、このままだと付与されません</div>
        <div class="d">出勤率8割未満の年は付与されません。育児休業などの期間を登録していない場合は、設定の従業員から登録してください。</div></div></div>`;
    }
  }
  if (S.hourly.enabled && ob) {
    const used = hoursUsedIn(emp, ob.from, ob.to);
    if (used > 0) {
      const cap = S.hourly.capDays * hpdOf(emp);
      html += `<div class="note ${used > cap ? 'danger' : 'info'}">${ICON.clock}<div><div class="t">時間単位の取得 ${fmtD(used)}時間 / 上限 ${cap}時間</div>
        <div class="d">1日＝${hpdOf(emp)}時間で換算。時間単位で取った分は、年5日の取得義務の日数には含まれません。</div></div></div>`;
    }
  }

  /* ---- 取得の状況（取得率・月ごとのグラフ） ---- */
  const ys = yearStats(r);
  html += `<h2 class="sec">取得の状況</h2><div class="card">`;
  if (ys) {
    const pct = Math.min(100, Math.round(ys.rate * 100));
    const C = 2 * Math.PI * 26;
    html += `<div class="rate"><svg class="ring" viewBox="0 0 64 64" aria-hidden="true"><circle class="bg" cx="32" cy="32" r="26"/>
      <circle class="fg" cx="32" cy="32" r="26" stroke-dasharray="${(C * pct / 100).toFixed(1)} ${C.toFixed(1)}"/></svg>
      <div class="tx"><b>${pct}</b>%<small>今年度の取得率（${fmtJpShort(ys.from)}付与 ${fmtD(ys.granted)}日のうち ${dh(ys.taken, emp)}）</small></div></div>`;
  }
  html += monthChartHtml(emp, r, now) + `</div>`;

  /* ---- 付与と消化の内訳 ---- */
  const past = r.lots.filter((l) => !l.future);
  const hasPre = past.some((l) => l.preOpening > 0);
  html += `<h2 class="sec">付与と消化の内訳</h2><div class="card"><div class="tw"><table>
    <thead><tr><th>付与日</th><th>付与</th><th>消化</th>${hasPre ? '<th>移行前</th>' : ''}<th>消滅</th><th>残</th><th>有効期限</th></tr></thead><tbody>`;
  const asOf = r.asOf;
  for (const l of past) {
    const alive = l.expiry > asOf;
    const cls = alive && l.remaining > 0 ? 'now' : alive ? '' : 'dim';
    const tags = [l.label, l.early ? '前倒し' : '', l.customDays ? '会社独自' : '', l.overridden ? '手入力' : '', l.attFail ? '8割未満' : ''].filter(Boolean).join('・');
    html += `<tr class="${cls}">
      <td>${fmtJpShort(l.date)}<small>${esc(tags)}</small></td>
      <td class="num">${fmtD(l.granted)}</td>
      <td class="num">${dh(l.used, emp).replace(/日$/, '')}</td>
      ${hasPre ? `<td class="num">${l.preOpening > 0 ? dh(l.preOpening, emp).replace(/日$/, '') : '—'}</td>` : ''}
      <td class="num">${l.expired > 0 ? `<span style="color:var(--danger);font-weight:700">${dh(l.expired, emp).replace(/日$/, '')}</span>` : '—'}</td>
      <td class="num"><b>${alive ? dh(l.remaining, emp).replace(/日$/, '') : '—'}</b></td>
      <td class="num" style="color:${alive && diffDays(asOf, l.expiry) <= 90 ? 'var(--danger);font-weight:700' : 'inherit'}">${fmtJpShort(l.expiry)}</td>
    </tr>`;
  }
  if (!past.length) html += `<tr><td colspan="${hasPre ? 7 : 6}"><div class="empty">まだ付与日を迎えていません</div></td></tr>`;
  html += `</tbody></table></div>${hasPre ? `<p class="sub" style="margin-top:10px">「移行前」は、移行日（${fmtJpShort(r.opening.date)}）までに使った・消えた日数です（内訳は不明）。</p>` : ''}</div>`;

  /* ---- 今後の付与予定 ---- */
  const fut = r.retired ? [] : r.lots.filter((l) => l.future).slice(0, 3);
  if (fut.length) {
    html += `<h2 class="sec">今後の付与予定</h2><div class="card">`;
    for (const l of fut) {
      const att = l.att && S.att8 ? (l.att.known ? `・出勤率 ${Math.floor(l.att.rate * 1000) / 10}%` : '・出勤率は未判定') : '';
      html += `<div class="li">${ICON.gift.replace('<svg', '<svg style="width:20px;height:20px;flex:none;color:var(--gold)"')}
        <div class="g"><div class="d1">${fmtJp(l.date)}${l.early ? '<span class="pill acc">前倒し</span>' : ''}</div>
        <div class="d2 wrap">${l.label}・${esc(l.categoryShort)}${att}／<span class="nw">有効期限 ${fmtJpShort(l.expiry)}</span></div></div>
        <div class="amt">＋${fmtD(l.granted)}<small>日</small></div></div>`;
    }
    html += `<p class="sub" style="margin-top:10px">※ ${emp.basis === 'contract' ? '契約の勤務日数から決まる日数です。' : '直近の出勤日数から推定した見込みです。実績が入ると自動で更新されます。'}</p></div>`;
  }

  /* ---- 帳票 ---- */
  html += `<h2 class="sec">帳票・出力</h2><div class="card">
    <div class="row" style="flex-wrap:wrap">
      <button class="btn" data-act="reg1">${ICON.doc}管理簿</button>
      <button class="btn" data-act="notice1">${ICON.print}本人へのお知らせ</button>
      <button class="btn" data-act="ics1">${ICON.down}カレンダーに登録</button>
    </div>
    <p class="sub" style="margin-top:12px">「カレンダーに登録」は、消滅の日・年5日の期限・次回付与をスマホやPCのカレンダーに入れるファイル（.ics）を保存します。</p>
  </div>`;

  /* ---- 従業員の情報 ---- */
  const c = emp.basis === 'contract' ? contractAt(emp, now) : null;
  const abs = absencesOf(emp);
  html += `<h2 class="sec">従業員の情報</h2><div class="card">
    <div class="kv"><span>入社日</span><b class="nw">${isYmd(emp.hireDate) ? fmtJpShort(parseYmd(emp.hireDate)) : '—'}</b></div>
    ${emp.retireDate ? `<div class="kv"><span>退職日</span><b>${fmtJpShort(parseYmd(emp.retireDate))}</b></div>` : ''}
    <div class="kv"><span>付与日数の決め方</span><b style="font-size:14px;font-family:var(--font)">${c ? `契約（${c.annual ? `年${c.annual}日` : `週${c.weekly}日`}${c.hours30 ? '・週30時間以上' : ''}）` : `出勤実績から${emp.over30h ? '（週30時間以上）' : ''}`}</b></div>
    ${S.hourly.enabled ? `<div class="kv"><span>時間単位年休の換算</span><b style="font-size:14px;font-family:var(--font)">1日＝${hpdOf(emp)}時間</b></div>` : ''}
    ${abs.length ? `<div class="kv"><span>休業・休職の期間</span><b style="font-size:14px;font-family:var(--font)">${abs.length}件</b></div>` : ''}
    <button class="btn full" style="margin-top:12px" data-act="editemp" data-id="${esc(emp.id)}">この人の設定を開く</button>
  </div>`;

  /* ---- 累計 ---- */
  html += `<h2 class="sec">これまでの累計</h2><div class="card">
    <div class="kv"><span>付与された日数</span><b>${fmtD(r.totalGranted)}<small>日</small></b></div>
    ${r.totalPreOpening > 0 ? `<div class="kv"><span>移行前に使った・消えた日数</span><b>${dh(r.totalPreOpening, emp, true)}</b></div>` : ''}
    <div class="kv"><span>取得した日数${r.opening ? '（移行後）' : ''}</span><b>${dh(r.totalUsed, emp, true)}</b></div>
    <div class="kv"><span>消滅した日数</span><b style="color:${r.totalExpired > 0 ? 'var(--danger)' : 'inherit'}">${dh(r.totalExpired, emp, true)}</b></div>
    <div class="kv"><span>${r.retired ? '退職時の残日数' : '現在の残日数'}</span><b>${dh(bal, emp, true)}</b></div>
  </div>`;

  box.innerHTML = html;
}

/** 月ごとの取得日数（過去11ヶ月＋今月＋先の3ヶ月の予定）。1系列の縦棒 */
function monthChartHtml(emp, r, now) {
  const months = [];
  for (let k = -11; k <= 3; k++) months.push(new Date(now.getFullYear(), now.getMonth() + k, 1));
  const keyOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  const tk = ymd(now);
  const vals = months.map((d) => ({ d, key: keyOf(d), taken: 0, plan: 0 }));
  const byKey = new Map(vals.map((v) => [v.key, v]));
  for (const l of r.allLeaves) {
    const v = byKey.get(l.date.slice(0, 7));
    if (!v) continue;
    if (l.eff <= tk) v.taken += l.days; else v.plan += l.days;
  }
  vals.forEach((v) => { v.taken = nd(v.taken); v.plan = nd(v.plan); });
  const total = nd(vals.filter((v) => v.d <= now).reduce((s, v) => s + v.taken, 0));
  const maxV = Math.max(1, ...vals.map((v) => v.taken + v.plan));
  const nice = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40].find((n) => n >= maxV) || Math.ceil(maxV);
  const W = 360, H = 170, L = 26, R = 6, T = 16, B = 22;
  const slot = (W - L - R) / vals.length;
  const bw = Math.min(14, slot * 0.6);
  const y = (v) => T + (H - T - B) * (1 - v / nice);
  const col = (x0, y0, x1, y1, top) => { // 上の角だけ4pxの丸み
    const rr = Math.min(4, (x1 - x0) / 2, y1 - y0);
    if (!top || rr <= 0.5) return `M${x0},${y1}V${y0}H${x1}V${y1}Z`;
    return `M${x0},${y1}V${y0 + rr}Q${x0},${y0} ${x0 + rr},${y0}H${x1 - rr}Q${x1},${y0} ${x1},${y0 + rr}V${y1}Z`;
  };
  let bars = '', labels = '';
  const maxIdx = vals.reduce((bi, v, i) => (v.taken > vals[bi].taken ? i : bi), 0);
  vals.forEach((v, i) => {
    const cx = L + slot * i + slot / 2;
    const x0 = cx - bw / 2, x1 = cx + bw / 2;
    const base = y(0);
    let g = '';
    if (v.taken > 0) g += `<path class="bar" d="${col(x0, y(v.taken), x1, base, v.plan <= 0)}"/>`;
    if (v.plan > 0) {
      const y1 = v.taken > 0 ? y(v.taken) - 2 : base;
      g += `<path class="bar" style="opacity:.38" d="${col(x0, y(v.taken + v.plan), x1, y1, true)}"/>`;
    }
    const tip = `${v.d.getFullYear()}年${v.d.getMonth() + 1}月：取得 ${dh(v.taken, emp)}${v.plan > 0 ? `・予定 ${dh(v.plan, emp)}` : ''}`;
    bars += `<g><title>${esc(tip)}</title><rect x="${(cx - slot / 2).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${H - T - B}" fill="transparent"/>${g}</g>`;
    const isCur = v.key === tk.slice(0, 7);
    labels += `<text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle" ${isCur ? 'class="lbl" font-weight="700"' : ''}>${v.d.getMonth() + 1}</text>`;
    if ((i === maxIdx && v.taken > 0) || (isCur && v.taken + v.plan > 0 && i !== maxIdx)) {
      labels += `<text class="lbl" x="${cx.toFixed(1)}" y="${(y(v.taken + v.plan) - 5).toFixed(1)}" text-anchor="middle">${fmtD(Math.round((v.taken + v.plan) * 100) / 100)}</text>`;
    }
  });
  const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="月ごとの取得日数のグラフ。直近12ヶ月の合計 ${dh(total, emp)}。">
    <line class="grid" x1="${L}" x2="${W - R}" y1="${y(nice)}" y2="${y(nice)}"/>
    <line class="grid" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>
    <text x="${L - 6}" y="${y(nice) + 4}" text-anchor="end">${nice}</text><text x="${L - 6}" y="${y(0) + 4}" text-anchor="end">0</text>
    ${bars}${labels}</svg>`;
  const rows = vals.map((v) => `<tr><td>${v.d.getFullYear()}年${v.d.getMonth() + 1}月</td><td class="num">${dh(v.taken, emp)}</td><td class="num">${v.plan > 0 ? dh(v.plan, emp) : '—'}</td></tr>`).join('');
  return `<div style="margin-top:14px"><div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px">
      <b style="font-size:13px;letter-spacing:.08em">月ごとの取得日数</b><span class="sub">直近12ヶ月で ${dh(total, emp)}（薄い棒は予定）</span></div>
    ${svg}
    <details class="help" style="margin:8px 0 0;box-shadow:none"><summary>表で見る</summary><div class="body"><div class="tw"><table>
      <thead><tr><th>月</th><th>取得</th><th>予定</th></tr></thead><tbody>${rows}</tbody></table></div></div></details></div>`;
}

/* =========================================================================
   カレンダー（だれがいつ休むか）
   ========================================================================= */
let CAL_SEL = null;
function renderCal() {
  const box = $('#p-cal');
  if (!DATA.employees.length) { box.innerHTML = welcomeHtml(); return; }
  const now = today();
  if (!CAL_MONTH) CAL_MONTH = new Date(now.getFullYear(), now.getMonth(), 1);
  const y = CAL_MONTH.getFullYear(), m = CAL_MONTH.getMonth();
  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - first.getDay());
  const emps = DATA.employees.filter(inScope);
  const stores = storeNames(), st = curStore();

  let html = `<div class="calhead">
    <button class="dp-nav" data-calmv="-1" aria-label="前の月"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 5-7 7 7 7"/></svg></button>
    <b>${y}年${m + 1}月</b>
    <button class="dp-nav" data-calmv="1" aria-label="次の月"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9.5 5 7 7-7 7"/></svg></button>
    <button class="btn sm" data-act="caltoday">今月</button>
    <span style="flex:1"></span>
    ${stores.length ? `<select class="selbox" id="storeSelCal" aria-label="店舗・拠点で絞り込む"><option value="">すべての店舗・拠点</option>
      ${stores.map((s) => `<option value="${esc(s)}" ${s === st ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}
    <button class="btn sm" data-act="massleave">${ICON.plus}一斉休暇を記録</button>
  </div>`;
  html += `<div class="calgrid" role="grid" aria-label="${y}年${m + 1}月のお休み">${WD.map((w, i) => `<div class="w s${i}" role="columnheader">${w}</div>`).join('')}`;
  const tk = ymd(now);
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (i >= 35 && d.getMonth() !== m) break;
    const k = ymd(d);
    const hol = JPHoliday.name(k);
    const list = offOn(emps, k);
    const cls = ['c', 's' + d.getDay(), d.getMonth() !== m ? 'out' : '', k === tk ? 'today' : '', hol ? 'hol' : ''].filter(Boolean).join(' ');
    const label = `${d.getMonth() + 1}月${d.getDate()}日${hol ? `（${hol}）` : ''}：${list.length ? list.map((x) => x.e.name).join('、') : 'お休みの記録なし'}`;
    html += `<button class="${cls}" data-calday="${k}" aria-label="${esc(label)}">
      <span class="n">${d.getDate()}</span>${hol ? `<span class="hn">${esc(hol)}</span>` : ''}
      ${list.slice(0, 3).map((x) => `<span class="pp ${k > tk ? 'plan' : ''}">${esc(shortName(x.e.name))}</span>`).join('')}
      ${list.length > 3 ? `<span class="mm">+${list.length - 3}人</span>` : ''}</button>`;
  }
  html += `</div>`;

  /* ---- 選んだ日 / その月の一覧 ---- */
  const ym = `${y}-${pad2(m + 1)}`;
  if (CAL_SEL && CAL_SEL.slice(0, 7) === ym) {
    const d = parseYmd(CAL_SEL);
    const hol = JPHoliday.name(CAL_SEL);
    const list = offOn(emps, CAL_SEL);
    html += `<h2 class="sec">${fmtJp(d)}（${WD[d.getDay()]}）${hol ? `・${esc(hol)}` : ''}</h2><div class="card">`;
    html += list.length ? list.map((x) => `<div class="li"><span class="ava sm" aria-hidden="true">${esc(initials(x.e.name))}</span>
        <div class="g"><div class="d1">${esc(x.e.name)}${CAL_SEL > tk ? '<span class="pill acc">予定</span>' : ''}${x.l.plan ? '<span class="pill mute">計画年休</span>' : ''}</div>
        <div class="d2">${esc(leaveAmount(x.l, x.e))}${x.l.note ? `・${esc(x.l.note)}` : ''}</div></div>
        <button class="btn sm" data-open="${esc(x.e.id)}">個人へ</button></div>`).join('')
      : `<div class="empty">この日のお休みの記録はありません</div>`;
    html += `</div>`;
  }
  const bulks = [];
  for (const e of emps) for (const l of e.leaves || []) if (l && l.bulk && l.date.slice(0, 7) === ym && Number(l.days) > 0) bulks.push({ e, l });
  if (bulks.length) {
    html += `<h2 class="sec">日付の分からない記録（月まとめ）</h2><div class="card">${bulks.map((x) =>
      `<div class="li"><div class="g"><div class="d1">${esc(x.e.name)}</div><div class="d2">${y}年${m + 1}月に ${fmtD(Number(x.l.days))}日</div></div></div>`).join('')}</div>`;
  }
  html += `<p class="sub" style="margin-top:12px">日付をタップすると、その日の一覧が出ます。点線の名前は予定です。祝日は計算で出しています（内閣府の発表と異なる場合があります）。</p>`;
  box.innerHTML = html;
}

/* =========================================================================
   メニュー（スマホ）
   ========================================================================= */
function renderMenu() {
  const it = (tab, act, icon, t, d) => `<button type="button" ${tab ? `data-tab="${tab}"` : `data-act="${act}"`}>${icon}<b>${t}</b><small>${d}</small></button>`;
  const ICAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>';
  const ISET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.1"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/></svg>';
  const IHIS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4h4M12 7.5V12l3 2"/></svg>';
  const IQ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.6M12 17h.01"/></svg>';
  $('#p-menu').innerHTML = `<div class="eyebrow"><b>メニュー</b><span>${esc(companyName() || '')}</span></div>
    <div class="menu-grid">
      ${it('cal', '', ICAL, 'カレンダー', 'だれがいつ休むか')}
      ${it('docs', '', ICON.doc, '帳票・出力', '管理簿・お知らせ・Excel')}
      ${it('', 'massleave', ICON.plus, '一斉休暇', '全員の同じ日をまとめて')}
      ${it('set', '', ISET, '設定', '従業員・付与のルール・データ')}
      ${it('', 'gohistory', IHIS, '操作の履歴', '変更を元に戻す')}
      ${it('', 'tour', IQ, '使い方', '最初の案内をもう一度')}
    </div>
    <h2 class="sec">会社</h2><div class="card">
      <div class="kv"><span>いま表示中</span><b style="font-size:15px;font-family:var(--font)">${esc(companyName() || '（会社名 未設定）')}</b></div>
      <button class="btn full" style="margin-top:10px" data-act="cosw">会社を切り替える・追加する</button>
    </div>
    <p class="verline"><b>有給管理</b>${APP_VERSION}</p>`;
}

/* =========================================================================
   イベント（このファイルの分）
   ========================================================================= */
document.addEventListener('click', async (ev) => {
  const mv = ev.target.closest('[data-calmv]');
  if (mv) {
    CAL_MONTH = new Date(CAL_MONTH.getFullYear(), CAL_MONTH.getMonth() + Number(mv.dataset.calmv), 1);
    renderCal(); return;
  }
  const cd = ev.target.closest('[data-calday]');
  if (cd) {
    CAL_SEL = cd.dataset.calday;
    const d = parseYmd(CAL_SEL);
    if (d.getMonth() !== CAL_MONTH.getMonth() || d.getFullYear() !== CAL_MONTH.getFullYear()) CAL_MONTH = new Date(d.getFullYear(), d.getMonth(), 1);
    renderCal();
    const sec = $('#p-cal h2.sec');
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'caltoday') { const n = today(); CAL_MONTH = new Date(n.getFullYear(), n.getMonth(), 1); CAL_SEL = ymd(n); renderCal(); return; }
  if (act === 'quickrec') {
    const id = await pickEmployee('だれの有給を記録しますか？');
    if (!id) return;
    CUR = id; LEAVE_MODE = LEAVE_MODE === 'bulk' ? 'single' : LEAVE_MODE; setTab('leave'); return;
  }
  if (act === 'editemp') { OPEN_EMP = b.dataset.id; setTab('set'); const el = document.querySelector(`.emp-ed[data-emp="${CSS.escape(OPEN_EMP)}"]`); if (el) el.scrollIntoView({ block: 'start' }); return; }
});
document.addEventListener('input', (ev) => {
  if (ev.target.id !== 'dashQ') return;
  SEARCH = ev.target.value;
  const rows = $('#empRows');
  if (rows) rows.innerHTML = empRowsHtml(dashItems(today()), today());
});
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'storeSel' || t.id === 'storeSelCal') { setStore(t.value); render(); return; }
  if (t.id === 'showRet') { SHOW_RETIRED = t.checked; const rows = $('#empRows'); if (rows) rows.innerHTML = empRowsHtml(dashItems(today()), today()); }
});
