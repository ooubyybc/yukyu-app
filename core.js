/* =========================================================================
   有給管理 - 計算コア
   労働基準法 第39条（年次有給休暇）に基づく計算
   - 付与日（基準日） = 入社日 + 6ヶ月、以降 毎年同日
     （会社の設定で「初回を早める」「毎年の付与日をそろえる」こともできる）
   - 付与日数 = 年間所定労働日数 × 継続勤務年数 の比例付与表
     （会社独自の付与表、契約日数での判定、週30時間以上、出勤率8割の判定にも対応）
   - 時効 = 付与日から2年
   - 消化は「期限が近いロットから」消費（FIFO）
   - 年5日取得義務 = 10日以上付与された場合、付与日から1年以内に5日
     （時間単位で取った分は含めない。期間が重なるときの比例按分にも対応）
   会社の設定を渡さない場合は、法定どおりの計算になる（以前の版と同じ結果）。
   ========================================================================= */
'use strict';

/* ---------- 日付ユーティリティ ---------- */
const pad2 = (n) => String(n).padStart(2, '0');

function ymd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseYmd(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}
/** 'yyyy-mm-dd' 形式の実在する日付か */
function isYmd(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseYmd(s);
  return !isNaN(d) && ymd(d) === s;
}
/** 月末を丸めながら nヶ月 加算（例: 8/31 の6ヶ月後 → 2/28） */
function addMonths(date, n) {
  const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
  const t = new Date(y, m + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d, last));
  t.setHours(0, 0, 0, 0);
  return t;
}
function addDays(date, n) {
  const t = new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  t.setHours(0, 0, 0, 0);
  return t;
}
/** from から何ヶ月たったか（addMonths で到達できる最大の月数） */
function monthsBetween(from, to) {
  if (to < from) return 0;
  let m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  while (m > 0 && addMonths(from, m) > to) m--;
  while (addMonths(from, m + 1) <= to) m++;
  return m;
}
function monthKeyOf(y, mIndex) {
  const t = new Date(y, mIndex, 1);
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}`;
}
function diffDays(from, to) {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}
function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function fmtJp(d) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
function fmtJpShort(d) {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
/** 6 → 「6ヶ月」 / 18 → 「1年6ヶ月」 */
function serviceLabel(months) {
  const y = Math.floor(months / 12);
  return y === 0 ? '6ヶ月' : `${y}年6ヶ月`;
}
/** 計算の誤差（0.1+0.2 など）を落とす。半日・時間単位の端数はそのまま残す */
function nd(v) {
  return Math.round(v * 1e6) / 1e6;
}
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

/* ---------- 比例付与表（労基法 第39条 / 厚労省） ---------- */
const GRANT_TABLE = [
  { min: 217, weekly: 5, short: '週5日以上', label: '週5日以上（年217日以上）', days: [10, 11, 12, 14, 16, 18, 20] },
  { min: 169, weekly: 4, short: '週4日相当', label: '週4日相当（年169〜216日）', days: [7, 8, 9, 10, 12, 13, 15] },
  { min: 121, weekly: 3, short: '週3日相当', label: '週3日相当（年121〜168日）', days: [5, 6, 6, 8, 9, 10, 11] },
  { min: 73,  weekly: 2, short: '週2日相当', label: '週2日相当（年73〜120日）',  days: [3, 4, 4, 5, 6, 6, 7] },
  { min: 48,  weekly: 1, short: '週1日相当', label: '週1日相当（年48〜72日）',   days: [1, 2, 2, 2, 3, 3, 3] },
];

function tableRowFor(annualDays) {
  return GRANT_TABLE.find((r) => annualDays >= r.min) || null;
}
function grantDaysFor(annualDays, serviceIndex) {
  const row = tableRowFor(annualDays);
  if (!row) return { days: 0, row: null };
  return { days: row.days[Math.min(serviceIndex, 6)], row };
}

/* ---------- 会社の設定 ---------- */
/** 休業・休職の種類と、出勤率（8割）の計算での扱い */
const ABSENCE_KINDS = {
  childcare: { label: '育児休業', att: 'deemed' },
  familycare: { label: '介護休業', att: 'deemed' },
  maternity: { label: '産前産後休業', att: 'deemed' },
  injury: { label: '業務上のけが・病気による休業', att: 'deemed' },
  company: { label: '会社の都合による休業', att: 'excluded' },
  sick: { label: '私傷病による休職・欠勤', att: 'absent' },
  other: { label: 'その他の休職', att: 'absent' },
};

/**
 * 会社の設定をそろえる。何も設定していなければ法定どおり。
 * schedule.firstMonths : 初回の付与を入社から何ヶ月後にするか（0〜6、法定は6）
 * schedule.unify       : 2回目以降の付与日をそろえる日（{m, d}）。null なら初回から1年ごと
 * schedule.from        : 上の2つを使い始める日（これより前の付与は法定どおり）
 * grantTable           : 会社独自の付与表（5行×7列）。法定より少ない値は法定を使う
 * att8                 : 出勤率8割未満の年は付与しない
 * prorate5             : 年5日の期間が重なるときは、まとめて比例按分する
 * hourly               : 時間単位年休（capDays＝1年に時間単位で取れる上限の日数）
 */
function normSettings(s) {
  if (s && s.__norm) return s;
  const o = s && typeof s === 'object' ? s : {};
  const sch = o.schedule && typeof o.schedule === 'object' ? o.schedule : {};
  let fm = Number(sch.firstMonths);
  if (!Number.isInteger(fm) || fm < 0 || fm > 6) fm = 6;
  let unify = null;
  if (sch.unify && typeof sch.unify === 'object') {
    const m = Number(sch.unify.m), d = Number(sch.unify.d);
    if (Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(d) && d >= 1 && d <= 31) unify = { m, d };
  }
  let table = null;
  if (Array.isArray(o.grantTable) && o.grantTable.length === GRANT_TABLE.length) {
    table = o.grantTable.map((row) => {
      const r = Array.isArray(row) ? row : [];
      return GRANT_TABLE[0].days.map((_, i) => {
        const v = Number(r[i]);
        return r[i] !== '' && r[i] != null && isFinite(v) && v >= 0 && v <= 99 ? v : null;
      });
    });
    if (table.every((row) => row.every((v) => v == null))) table = null;
  }
  const h = o.hourly && typeof o.hourly === 'object' ? o.hourly : {};
  let cap = Number(h.capDays);
  if (!(cap >= 0 && cap <= 5)) cap = 5;
  return {
    __norm: true,
    schedule: { firstMonths: fm, unify, from: isYmd(sch.from) ? sch.from : '' },
    grantTable: table,
    att8: o.att8 === true,
    prorate5: o.prorate5 === true,
    hourly: { enabled: h.enabled === true, capDays: cap },
  };
}

/** 1日あたりの時間数（時間単位年休の換算。1時間未満は切り上げ） */
function hpdOf(emp) {
  const h = Math.ceil(Number(emp && emp.hoursPerDay));
  return h >= 1 && h <= 24 ? h : 8;
}
/** 記録1件が何日分か（時間単位は 時間÷1日の時間数） */
function leaveDaysOf(emp, l) {
  if (!l) return 0;
  if (l.unit === 'hour') {
    const h = Number(l.hours);
    return h > 0 && isFinite(h) ? h / hpdOf(emp) : 0;
  }
  const d = Number(l.days);
  return d > 0 && isFinite(d) ? d : 0;
}

/* ---------- 付与日スケジュール ---------- */
/** d 以降で最初に来る「そろえた付与日」 */
function unifiedOnOrAfter(u, d) {
  for (let y = d.getFullYear(); y <= d.getFullYear() + 1; y++) {
    const last = new Date(y, u.m, 0).getDate();
    const c = new Date(y, u.m - 1, Math.min(u.d, last));
    if (c >= d) return c;
  }
  return null;
}

/**
 * 付与日の一覧。S を渡さなければ法定どおり（入社6ヶ月後、以降1年ごと）。
 * 早めた付与日は、法定の付与日より後にならない（法定より不利にならない）。
 */
function buildSchedule(hireDate, horizon, S0) {
  const S = normSettings(S0);
  const sch = S.schedule;
  const from = sch.from ? parseYmd(sch.from) : null;
  const fm = sch.firstMonths < 6 && (!from || hireDate >= from) ? sch.firstMonths : 6;
  const out = [];
  let unifiedAt = -1;
  for (let i = 0; i < 80; i++) {
    let date;
    if (i === 0) {
      date = addMonths(hireDate, fm);
    } else if (unifiedAt >= 0) {
      date = unifiedOnOrAfter(sch.unify, addDays(out[i - 1].date, 1));
    } else {
      date = addMonths(hireDate, fm + 12 * i);
      if (sch.unify && (!from || date >= from)) {
        let lower = addDays(out[i - 1].date, 1);
        if (from && from > lower) lower = from;
        const cand = unifiedOnOrAfter(sch.unify, lower);
        if (cand && cand <= date) { date = cand; unifiedAt = i; }
      }
    }
    if (date > horizon) break;
    out.push({ index: i, date, months: 6 + 12 * i, early: date < addMonths(hireDate, 6 + 12 * i) });
  }
  return out;
}

/**
 * その付与日に適用する「1年間の所定労働日数」を出勤実績から推定。
 * 初回(6ヶ月)は直前6ヶ月の実績を年換算（×2）、2回目以降は直前12ヶ月。
 * （付与日を早めている場合は、前回の付与日からの月数だけを見る）
 * 実績が無い（空欄の）月はカウントせず、入力済み月の平均から年換算する。
 * 「0」と入力した月は「出勤0日」として数える（出勤タブの「入力済み」と同じ扱い）。
 */
function estimateAnnualDays(emp, grant) {
  const span = grant.span != null ? grant.span : grant.index === 0 ? 6 : 12;
  const w = typeof emp.weeklyDays === 'number' ? emp.weeklyDays : 5;
  if (span <= 0) return { days: Math.round(w * 52), covered: 0, span: 0, source: 'default' };
  const start = addMonths(grant.date, -span);
  let total = 0, covered = 0;
  for (let i = 0; i < span; i++) {
    const key = monthKeyOf(start.getFullYear(), start.getMonth() + i);
    const v = emp.workdays ? emp.workdays[key] : undefined;
    if (typeof v === 'number' && isFinite(v) && v >= 0) { total += v; covered++; }
  }
  if (covered === 0) {
    return { days: Math.round(w * 52), covered: 0, span, source: 'default' };
  }
  return {
    days: Math.round((total / covered) * 12),
    covered, span,
    source: covered < span ? 'partial' : 'actual',
  };
}

/** その日に有効な契約（適用開始日が最も新しいもの。なければ最初のもの） */
function contractAt(emp, date) {
  const list = (Array.isArray(emp.contracts) ? emp.contracts : [])
    .filter((c) => c && isYmd(c.from))
    .sort((a, b) => a.from.localeCompare(b.from));
  if (!list.length) return null;
  let cur = list[0];
  for (const c of list) if (parseYmd(c.from) <= date) cur = c;
  return cur;
}

/** 休業・休職の期間（日付の正しいものだけ） */
function absencesOf(emp) {
  return (Array.isArray(emp.absences) ? emp.absences : [])
    .filter((a) => a && isYmd(a.from) && isYmd(a.to) && a.from <= a.to)
    .map((a) => ({ ...a, f: parseYmd(a.from), t: addDays(parseYmd(a.to), 1), info: ABSENCE_KINDS[a.kind] || ABSENCE_KINDS.other }));
}

/**
 * 出勤率（8割の判定）。対象期間 [start, end) を月単位で見る。
 * 出勤 = 出勤日数 ＋ 有給で1日休んだ日 ＋ 出勤とみなす休業（育児・介護・産前産後・業務上の傷病）
 * 全労働日 = 所定労働日数 − 会社都合などの休業日
 * 所定労働日数か出勤日数が入っていない月があれば判定しない（known=false）。
 */
function attendanceFor(emp, start, end, leaves) {
  const keys = [];
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d < new Date(end.getFullYear(), end.getMonth(), 1);
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    keys.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  }
  if (!keys.length) return { known: true, rate: 1, keys, short: true };
  const abs = absencesOf(emp);
  let sched = 0, work = 0, deemed = 0, excluded = 0;
  const missing = [];
  for (const k of keys) {
    const s = num(emp.schedDays ? emp.schedDays[k] : undefined);
    const w = num(emp.workdays ? emp.workdays[k] : undefined);
    if (s == null || w == null || s < 0 || w < 0) { missing.push(k); continue; }
    sched += s; work += w;
    const [yy, mm] = k.split('-').map(Number);
    const ms = new Date(yy, mm - 1, 1), me = new Date(yy, mm, 1);
    const dim = diffDays(ms, me);
    for (const a of abs) {
      const ov = diffDays(a.f > ms ? a.f : ms, a.t < me ? a.t : me);
      if (ov <= 0) continue;
      const share = (s * ov) / dim;
      if (a.info.att === 'deemed') deemed += share;
      else if (a.info.att === 'excluded') excluded += share;
    }
  }
  if (missing.length) return { known: false, missing, keys };
  const keySet = new Set(keys);
  let leave = 0;
  for (const lv of leaves || []) {
    if (lv.unit === 'hour') continue;
    if (!keySet.has(String(lv.eff || lv.date).slice(0, 7))) continue;
    leave += Math.floor(lv.days + 1e-9);
  }
  const denom = sched - excluded;
  if (denom <= 0) return { known: false, zero: true, keys, missing: [] };
  const attended = Math.min(denom, work + leave + deemed);
  return { known: true, rate: attended / denom, sched: nd(sched), work: nd(work), leave, deemed: nd(deemed), excluded: nd(excluded), keys };
}

/** ロットを生成（毎回まっさらな状態で） */
function buildLots(emp, asOf, S0) {
  if (!isYmd(emp.hireDate)) return [];
  const S = normSettings(S0);
  const hire = parseYmd(emp.hireDate);
  // 通常は2年先まで。出勤日数を先の年まで入れている場合はそこまで伸ばす。
  let horizon = addMonths(asOf, 24);
  const keys = Object.keys(emp.workdays || {}).sort();
  if (keys.length) {
    const [ly, lm] = keys[keys.length - 1].split('-').map(Number);
    const h2 = addMonths(new Date(ly, lm - 1, 1), 13);
    if (h2 > horizon) horizon = h2;
  }
  // 先の年に取得予定（月まとめなど）を入れている場合は、その日まで付与日を出しておく
  for (const l of emp.leaves || []) {
    if (l && isYmd(l.date)) { const d = parseYmd(l.date); if (d > horizon) horizon = d; }
  }
  const cap = addMonths(asOf, 12 * 30);
  if (horizon > cap) horizon = cap;
  // 退職日より後は付与しない
  if (isYmd(emp.retireDate)) { const r = parseYmd(emp.retireDate); if (r < horizon) horizon = r; }
  const schedule = buildSchedule(hire, horizon, S);
  const attLeaves = S.att8 ? leavesForCalc(emp, asOf) : null;

  return schedule.map((g, i) => {
    const prev = i ? schedule[i - 1].date : hire;
    g.span = i === 0 ? Math.min(6, monthsBetween(hire, g.date)) : Math.min(12, monthsBetween(prev, g.date));
    const c = emp.basis === 'contract' ? contractAt(emp, g.date) : null;

    let annualDays = null, weekly = null, annualSource, row;
    if (c) {
      const an = Number(c.annual);
      if (an > 0 && isFinite(an)) {
        annualDays = Math.round(an);
        row = tableRowFor(annualDays);
      } else {
        weekly = Math.min(5, Math.max(1, Math.round(Number(c.weekly)) || 5));
        row = GRANT_TABLE[5 - weekly];
      }
      annualSource = 'contract';
    } else {
      const est = estimateAnnualDays(emp, g);
      annualDays = est.days;
      annualSource = est.source;
      row = tableRowFor(annualDays);
    }
    const over30 = c ? c.hours30 === true : emp.over30h === true;
    if (over30) row = GRANT_TABLE[0];

    const idx = Math.min(g.index, 6);
    const legalDays = row ? row.days[idx] : 0;
    let autoDays = legalDays;
    const ri = row ? GRANT_TABLE.indexOf(row) : -1;
    let custom = false;
    if (S.grantTable && ri >= 0) {
      const cv = S.grantTable[ri][idx];
      if (cv != null && cv > legalDays) { autoDays = cv; custom = true; }
    }
    let att = null;
    if (S.att8) {
      att = attendanceFor(emp, prev, g.date, attLeaves);
      if (att.known && att.rate < 0.8 - 1e-9) autoDays = 0;
    }
    const ov = emp.grantOverrides ? emp.grantOverrides[ymd(g.date)] : undefined;
    const granted = typeof ov === 'number' ? ov : autoDays;
    return {
      key: ymd(g.date),
      index: g.index,
      months: g.months,
      label: serviceLabel(g.months),
      date: g.date,
      expiry: addMonths(g.date, 24),
      granted,
      autoDays,
      legalDays,
      customDays: custom,
      overridden: typeof ov === 'number',
      annualDays,
      weekly,
      annualSource,
      over30,
      early: g.early,
      span: g.span,
      att,
      attFail: !!(att && att.known && att.rate < 0.8 - 1e-9),
      category: over30 ? '週30時間以上（通常の付与）' : row ? row.label : '付与対象外（年48日未満）',
      categoryShort: over30 ? '週30時間以上' : row ? row.short : '対象外',
      used: 0,
      expired: 0,
      remaining: granted,
      preOpening: 0,
      future: g.date > asOf,
    };
  });
}

/**
 * 取得記録を計算用にそろえる（不正な記録は除外し、日付順に並べる）。
 * eff = 計算に使う日付。
 *   月まとめの記録は「その月の15日」として保存しているが、今月分は15日を待たずに
 *   入力した時点で取得済みとして扱う（＝今日付けで消化）。来月以降の分は予定のまま。
 * 時間単位の記録は、時間 ÷ 1日の時間数 を日数として扱う。
 */
function leavesForCalc(emp, asOf) {
  const asOfKey = ymd(asOf);
  const curYm = asOfKey.slice(0, 7);
  return (emp.leaves || [])
    .filter((l) => l && isYmd(l.date) && leaveDaysOf(emp, l) > 0)
    .map((l) => {
      const eff = l.bulk === true && l.date > asOfKey && l.date.slice(0, 7) === curYm ? asOfKey : l.date;
      return { ...l, days: leaveDaysOf(emp, l), eff };
    })
    .sort((a, b) => a.eff.localeCompare(b.eff) || a.date.localeCompare(b.date));
}

/** 移行時の残日数（ほかのシステムやExcelから移したときの起点） */
function openingOf(emp) {
  const op = emp && emp.opening;
  if (!op || typeof op !== 'object' || !isYmd(op.date)) return null;
  const lots = op.lots && typeof op.lots === 'object' && !Array.isArray(op.lots) ? op.lots : {};
  const t = Number(op.obTaken);
  return { date: parseYmd(op.date), key: op.date, lots, obTaken: t > 0 && isFinite(t) ? t : 0 };
}

/**
 * ロットの状態を進める道具。期限切れ・移行時の残の反映・消化をまとめて扱う。
 */
function ledger(lots, opening) {
  let opened = !opening;
  const st = {
    expireUpTo(d, bucket) {
      for (const l of lots) {
        if (l.expiry <= d && l.remaining > 0) {
          if (bucket) bucket.expired += l.remaining;
          l.expired += l.remaining;
          l.remaining = 0;
        }
      }
    },
    /** 移行日の時点の残日数に置き換える（移行日より前の内訳は不明として扱う） */
    open() {
      if (opened) return;
      opened = true;
      const od = opening.date;
      for (const l of lots) {
        if (l.date > od) continue;
        let left = 0;
        if (l.expiry > od) {
          const v = Number(opening.lots[l.key]);
          left = v > 0 && isFinite(v) ? Math.min(v, l.granted) : 0;
        }
        l.preOpening = nd(l.granted - left);
        l.used = 0;
        l.expired = 0;
        l.remaining = left;
      }
    },
    get opened() { return opened; },
    /** 1件分を消化。足りなかった日数を返す */
    consume(lv, d) {
      let need = lv.days;
      const avail = lots
        .filter((l) => l.date <= d && l.expiry > d && l.remaining > 0)
        .sort((a, b) => a.expiry - b.expiry);
      for (const l of avail) {
        if (need <= 0) break;
        const take = Math.min(need, l.remaining);
        l.remaining = nd(l.remaining - take);
        l.used = nd(l.used + take);
        need = nd(need - take);
      }
      return need;
    },
  };
  return st;
}

/** ロットに消化を反映（期限の近い順に消費）。cutoff 時点まで時効処理する。 */
function applyLeaves(lots, leaves, cutoff, opening) {
  const shortfalls = [];
  const skipped = [];
  const L = ledger(lots, opening || null);
  for (const lv of leaves) {
    const d = parseYmd(lv.eff || lv.date);
    if (opening && d < opening.date) { skipped.push(lv); continue; }
    if (opening && !L.opened) L.open();
    L.expireUpTo(d);
    const need = L.consume(lv, d);
    if (need > 0.0001) shortfalls.push({ id: lv.id, date: lv.date, eff: lv.eff || lv.date, bulk: lv.bulk === true, days: nd(need) });
  }
  if (opening && !L.opened && cutoff >= opening.date) L.open();
  L.expireUpTo(cutoff);
  shortfalls.skipped = skipped;
  return shortfalls;
}

/**
 * 年5日の取得義務の期間を作る。
 * 期間が重なるとき（付与日を早めた場合など）に prorate5 なら、期間をまとめて
 * 「月数 ÷ 12 × 5日」（労基則 第24条の5 第2項）で必要日数を出す。
 */
function requiredProrated(from, to) {
  const m = monthsBetween(from, to);
  const a = addMonths(from, m);
  const rem = diffDays(a, to);
  const len = diffDays(a, addMonths(from, m + 1));
  const months = m + (len > 0 ? rem / len : 0);
  return Math.ceil((months / 12) * 5 - 1e-9);
}
function obligationsOf(lots, leaves, S, asOf, opening) {
  const q = lots.filter((l) => l.granted >= 10 && !l.future);
  const out = [];
  for (let i = 0; i < q.length; i++) {
    const first = q[i];
    let to = addMonths(first.date, 12);
    const keys = [first.key];
    if (S.prorate5) {
      while (i + 1 < q.length && q[i + 1].date < to) {
        i++;
        keys.push(q[i].key);
        to = addMonths(q[i].date, 12);
      }
    }
    const merged = keys.length > 1;
    const required = merged ? requiredProrated(first.date, to) : 5;
    let taken = 0;
    for (const lv of leaves) {
      if (lv.unit === 'hour') continue;
      const d = parseYmd(lv.eff);
      if (d >= first.date && d < to) taken += lv.days;
    }
    if (opening && opening.date >= first.date && opening.date < to) taken += opening.obTaken;
    taken = nd(taken);
    // 移行日より前に終わった期間は、取得の明細が無いので判定しない
    const unknown = !!(opening && to <= opening.date);
    out.push({
      from: first.date, to, taken, required, merged, keys, unknown,
      shortage: unknown ? 0 : Math.max(0, nd(required - taken)),
      current: first.date <= asOf && to > asOf,
      daysLeft: diffDays(asOf, to),
    });
  }
  return out;
}

/**
 * メイン計算。asOf 時点の残日数・消滅予定・各ロットの状態を返す。
 * 未来日付の取得記録（＝取得予定）は残日数に含めず、plannedBalance として別に返す。
 * 退職日を過ぎている人は、退職日の時点で計算し、使える残日数は 0 とする。
 */
function simulate(emp, asOfDate, settings) {
  const S = normSettings(settings);
  const realAsOf = asOfDate || today();
  const retire = isYmd(emp.retireDate) ? parseYmd(emp.retireDate) : null;
  const retired = !!(retire && retire < realAsOf);
  const asOf = retired ? retire : realAsOf;
  const asOfKey = ymd(asOf);
  const opening = openingOf(emp);

  let allLeaves = leavesForCalc(emp, asOf);
  const afterRetire = retire ? allLeaves.filter((l) => l.date > ymd(retire)) : [];
  if (retire) allLeaves = allLeaves.filter((l) => l.date <= ymd(retire));
  const leaves = allLeaves.filter((l) => l.eff <= asOfKey);
  const planned = retired ? [] : allLeaves.filter((l) => l.eff > asOfKey);

  const lots = buildLots(emp, asOf, S);
  const shortfalls = applyLeaves(lots, leaves, asOf, opening);
  const preOpeningLeaves = shortfalls.skipped || [];
  const usedLeaves = opening ? leaves.filter((l) => parseYmd(l.eff) >= opening.date) : leaves;

  /* --- 集計 --- */
  const active = lots.filter((l) => !l.future && l.expiry > asOf);
  const balance = nd(active.reduce((s, l) => s + l.remaining, 0));
  const totalGranted = nd(lots.filter((l) => !l.future).reduce((s, l) => s + l.granted, 0));
  const totalUsed = nd(usedLeaves.reduce((s, l) => s + l.days, 0));
  const totalExpired = nd(lots.reduce((s, l) => s + l.expired, 0));
  const totalPreOpening = nd(lots.reduce((s, l) => s + (l.preOpening || 0), 0));

  // 直近の消滅（残っているロットのうち期限が最も早いもの）
  const withRemain = active.filter((l) => l.remaining > 0).sort((a, b) => a.expiry - b.expiry);
  let nextExpiry = null;
  if (withRemain.length) {
    const e = withRemain[0].expiry;
    const same = withRemain.filter((l) => +l.expiry === +e);
    nextExpiry = {
      date: e,
      days: nd(same.reduce((s, l) => s + l.remaining, 0)),
      daysLeft: diffDays(asOf, e),
      lots: same,
    };
  }

  // 次回付与
  const nextGrant = lots.find((l) => l.future) || null;

  // 年5日取得義務（10日以上付与された年度）
  const obligations = obligationsOf(lots, usedLeaves, S, asOf, opening);
  const currentObligation = obligations.find((o) => o.current) || null;

  // 取得予定（未来日付）を反映した残日数
  // ＝ いま持っている有給のうち、予定どおり取ったあとに残る日数。
  //   （予定日までに期限が来る分は、その予定には使えないものとして消化順を決めるが、
  //     期限切れによる減少そのものはここでは差し引かない）
  let plannedBalance = balance;
  let plannedShortfalls = [];
  if (planned.length) {
    const lots2 = buildLots(emp, asOf, S);
    const sf2 = applyLeaves(lots2, allLeaves, asOf, opening);
    const plannedIds = new Set(planned.map((l) => l.id));
    plannedShortfalls = sf2.filter((s) => plannedIds.has(s.id));
    let usedByPlan = 0;
    lots.forEach((l, i) => {
      if (!l.future && l.expiry > asOf) usedByPlan += lots2[i].used - l.used;
    });
    plannedBalance = nd(Math.max(0, balance - usedByPlan));
  }

  const r = {
    asOf, realAsOf, lots, active, leaves, allLeaves, planned,
    balance, plannedBalance,
    totalGranted, totalUsed, totalExpired, totalPreOpening,
    plannedDays: nd(planned.reduce((s, l) => s + l.days, 0)),
    nextExpiry, nextGrant, obligations, currentObligation,
    shortfalls, plannedShortfalls,
    preOpeningLeaves, afterRetire, opening,
    retired, retireDate: retire, balanceAtRetire: null,
    settings: S,
  };
  if (retired) {
    r.balanceAtRetire = balance;
    r.balance = 0;
    r.plannedBalance = 0;
    r.nextExpiry = null;
    r.nextGrant = null;
    r.currentObligation = null;
  }
  return r;
}

/**
 * 年次有給休暇管理簿（労働基準法施行規則 第24条の7）用の集計。
 * 基準日ごとに「付与日数・前年繰越・取得時季・取得日数・残日数・時効消滅」を出す。
 * 保存期間は、その年休を与えた期間中と、期間の満了後5年間（当分の間は3年間）。
 */
function buildRegister(emp, asOfDate, settings) {
  const S = normSettings(settings);
  const realAsOf = asOfDate || today();
  const retire = isYmd(emp.retireDate) ? parseYmd(emp.retireDate) : null;
  const asOf = retire && retire < realAsOf ? retire : realAsOf;
  const opening = openingOf(emp);
  const lots = buildLots(emp, asOf, S);
  let leaves = leavesForCalc(emp, asOf);
  if (retire) leaves = leaves.filter((l) => l.date <= ymd(retire));
  const L = ledger(lots, opening);

  const asOfKey = ymd(asOf);
  const counted = leaves.filter((l) => l.eff <= asOfKey && !(opening && parseYmd(l.eff) < opening.date));
  const obl = obligationsOf(lots, counted, S, asOf, opening);
  const oblOf = new Map();
  for (const o of obl) for (const k of o.keys) oblOf.set(k, o);

  const rows = [];
  let li = 0;

  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (lot.date > asOf) break;
    let end = addMonths(lot.date, 12);
    if (i + 1 < lots.length && lots[i + 1].date < end) end = lots[i + 1].date;
    // 移行日を含む年度は、移行時点の残から始める（それより前の内訳は不明）
    const holdsOpening = !!(opening && !L.opened && lot.date <= opening.date && opening.date < end);
    if (opening && !L.opened && (lot.date >= opening.date || holdsOpening)) L.open();

    L.expireUpTo(lot.date, null);
    const carry = nd(lots.slice(0, i).reduce((s, l) => s + l.remaining, 0));
    const row = {
      lot, from: lot.date, to: end,
      granted: lot.granted,
      carry,
      total: nd(carry + lot.granted),
      taken: 0, items: [], expired: 0, endRemaining: 0,
      closed: end <= asOf,
      expiryDate: lot.expiry,
      beforeOpening: !!(opening && lot.date < opening.date),
      unknown: !!(opening && end <= opening.date),
      preOpening: holdsOpening ? lot.preOpening : 0,
    };

    while (li < leaves.length) {
      const lv = leaves[li];
      const d = parseYmd(lv.eff);
      if (d >= end || d > asOf) break;
      if (opening && d < opening.date) { li++; continue; }
      if (opening && !L.opened) L.open();
      L.expireUpTo(d, row);
      const need = L.consume(lv, d);
      row.taken = nd(row.taken + lv.days);
      row.items.push({
        date: lv.date, days: lv.days, note: lv.note || '', bulk: lv.bulk === true, short: need > 0.0001,
        unit: lv.unit === 'hour' ? 'hour' : 'day', hours: lv.unit === 'hour' ? Number(lv.hours) : null,
        half: lv.half === 'am' || lv.half === 'pm' ? lv.half : '', planned: lv.plan === true,
      });
      li++;
    }

    if (opening && !L.opened && (row.closed ? end : asOf) >= opening.date) L.open();
    L.expireUpTo(row.closed ? end : asOf, row);
    row.expired = nd(row.expired);
    row.endRemaining = nd(lots.slice(0, i + 1).reduce((s, l) => s + l.remaining, 0));
    const o = oblOf.get(lot.key);
    row.required5 = !!o;
    row.obligation = o || null;
    row.met5 = !o || o.taken >= o.required - 1e-9;
    row.hoursTaken = nd(row.items.filter((it) => it.unit === 'hour').reduce((s, it) => s + (it.hours || 0), 0));
    rows.push(row);
  }
  return rows;
}

/** 時間単位で取った時間数（期間 [from, to)） */
function hoursUsedIn(emp, from, to) {
  let h = 0;
  for (const l of emp.leaves || []) {
    if (!l || l.unit !== 'hour' || !isYmd(l.date)) continue;
    const d = parseYmd(l.date);
    if (d >= from && d < to) { const v = Number(l.hours); if (v > 0 && isFinite(v)) h += v; }
  }
  return h;
}

/* ---------- 初期状態（データなし） ----------
   個人の勤務データはこのファイルには含めません。
   バックアップJSONは 設定 →「読み込み」から取り込んでください。 */
const DEFAULT_DATA = { version: 1, employees: [] };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ymd, parseYmd, isYmd, addMonths, addDays, monthsBetween, diffDays, today, fmtJp, fmtJpShort,
    serviceLabel, nd, monthKeyOf, pad2,
    GRANT_TABLE, grantDaysFor, tableRowFor, ABSENCE_KINDS,
    normSettings, hpdOf, leaveDaysOf, contractAt, absencesOf, attendanceFor, unifiedOnOrAfter,
    buildSchedule, estimateAnnualDays, buildLots, leavesForCalc, applyLeaves, openingOf,
    obligationsOf, requiredProrated, simulate, buildRegister, hoursUsedIn, DEFAULT_DATA,
  };
}
