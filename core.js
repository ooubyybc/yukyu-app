/* =========================================================================
   有給管理 - 計算コア
   労働基準法 第39条（年次有給休暇）に基づく計算
   - 付与日（基準日） = 入社日 + 6ヶ月、以降 毎年同日
   - 付与日数 = 年間所定労働日数 × 継続勤務年数 の比例付与表
   - 時効 = 付与日から2年
   - 消化は「期限が近いロットから」消費（FIFO）
   - 年5日取得義務 = 10日以上付与された場合、付与日から1年以内に5日
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
/** 表示用に端数を落とす（0.5日単位） */
function nd(v) {
  return Math.round(v * 2) / 2;
}

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

/* ---------- 付与日スケジュール ---------- */
function buildSchedule(hireDate, horizon) {
  const out = [];
  for (let i = 0; i < 80; i++) {
    const date = addMonths(hireDate, 6 + 12 * i);
    if (date > horizon) break;
    out.push({ index: i, date, months: 6 + 12 * i });
  }
  return out;
}

/**
 * その付与日に適用する「1年間の所定労働日数」を出勤実績から推定。
 * 初回(6ヶ月)は直前6ヶ月の実績を年換算（×2）、2回目以降は直前12ヶ月。
 * 実績が無い（空欄の）月はカウントせず、入力済み月の平均から年換算する。
 * 「0」と入力した月は「出勤0日」として数える（出勤タブの「入力済み」と同じ扱い）。
 */
function estimateAnnualDays(emp, grant) {
  const span = grant.index === 0 ? 6 : 12;
  const start = addMonths(grant.date, -span);
  let total = 0, covered = 0;
  for (let i = 0; i < span; i++) {
    const key = monthKeyOf(start.getFullYear(), start.getMonth() + i);
    const v = emp.workdays ? emp.workdays[key] : undefined;
    if (typeof v === 'number' && isFinite(v) && v >= 0) { total += v; covered++; }
  }
  if (covered === 0) {
    const w = typeof emp.weeklyDays === 'number' ? emp.weeklyDays : 5;
    return { days: Math.round(w * 52), covered: 0, span, source: 'default' };
  }
  return {
    days: Math.round((total / covered) * 12),
    covered, span,
    source: covered < span ? 'partial' : 'actual',
  };
}

/** ロットを生成（毎回まっさらな状態で） */
function buildLots(emp, asOf) {
  if (!isYmd(emp.hireDate)) return [];
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
  const schedule = buildSchedule(hire, horizon);
  return schedule.map((g) => {
    const est = estimateAnnualDays(emp, g);
    const auto = grantDaysFor(est.days, g.index);
    const ov = emp.grantOverrides ? emp.grantOverrides[ymd(g.date)] : undefined;
    const granted = typeof ov === 'number' ? ov : auto.days;
    return {
      key: ymd(g.date),
      index: g.index,
      months: g.months,
      label: serviceLabel(g.months),
      date: g.date,
      expiry: addMonths(g.date, 24),
      granted,
      autoDays: auto.days,
      overridden: typeof ov === 'number',
      annualDays: est.days,
      annualSource: est.source,
      category: auto.row ? auto.row.label : '付与対象外（年48日未満）',
      categoryShort: auto.row ? auto.row.short : '対象外',
      used: 0,
      expired: 0,
      remaining: granted,
      future: g.date > asOf,
    };
  });
}

/**
 * 取得記録を計算用にそろえる（不正な記録は除外し、日付順に並べる）。
 * eff = 計算に使う日付。
 *   月まとめの記録は「その月の15日」として保存しているが、今月分は15日を待たずに
 *   入力した時点で取得済みとして扱う（＝今日付けで消化）。来月以降の分は予定のまま。
 */
function leavesForCalc(emp, asOf) {
  const asOfKey = ymd(asOf);
  const curYm = asOfKey.slice(0, 7);
  return (emp.leaves || [])
    .filter((l) => l && isYmd(l.date) && Number(l.days) > 0 && isFinite(Number(l.days)))
    .map((l) => {
      const eff = l.bulk === true && l.date > asOfKey && l.date.slice(0, 7) === curYm ? asOfKey : l.date;
      return { ...l, days: Number(l.days), eff };
    })
    .sort((a, b) => a.eff.localeCompare(b.eff) || a.date.localeCompare(b.date));
}

/** ロットに消化を反映（期限の近い順に消費）。cutoff 時点まで時効処理する。 */
function applyLeaves(lots, leaves, cutoff) {
  const shortfalls = [];
  const expireUpTo = (d) => {
    for (const l of lots) {
      if (l.expiry <= d && l.remaining > 0) {
        l.expired += l.remaining;
        l.remaining = 0;
      }
    }
  };
  for (const lv of leaves) {
    const d = parseYmd(lv.eff || lv.date);
    expireUpTo(d);
    let need = lv.days;
    const avail = lots
      .filter((l) => l.date <= d && l.expiry > d && l.remaining > 0)
      .sort((a, b) => a.expiry - b.expiry);
    for (const l of avail) {
      if (need <= 0) break;
      const take = Math.min(need, l.remaining);
      l.remaining -= take;
      l.used += take;
      need -= take;
    }
    if (need > 0.0001) shortfalls.push({ id: lv.id, date: lv.date, eff: lv.eff || lv.date, bulk: lv.bulk === true, days: nd(need) });
  }
  expireUpTo(cutoff);
  return shortfalls;
}

/**
 * メイン計算。asOf 時点の残日数・消滅予定・各ロットの状態を返す。
 * 未来日付の取得記録（＝取得予定）は残日数に含めず、plannedBalance として別に返す。
 */
function simulate(emp, asOfDate) {
  const asOf = asOfDate || today();
  const asOfKey = ymd(asOf);

  const allLeaves = leavesForCalc(emp, asOf);
  const leaves = allLeaves.filter((l) => l.eff <= asOfKey);
  const planned = allLeaves.filter((l) => l.eff > asOfKey);

  const lots = buildLots(emp, asOf);
  const shortfalls = applyLeaves(lots, leaves, asOf);

  /* --- 集計 --- */
  const active = lots.filter((l) => !l.future && l.expiry > asOf);
  const balance = nd(active.reduce((s, l) => s + l.remaining, 0));
  const totalGranted = nd(lots.filter((l) => !l.future).reduce((s, l) => s + l.granted, 0));
  const totalUsed = nd(leaves.reduce((s, l) => s + l.days, 0));
  const totalExpired = nd(lots.reduce((s, l) => s + l.expired, 0));

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
  const obligations = lots
    .filter((l) => l.granted >= 10 && !l.future)
    .map((l) => {
      const end = addMonths(l.date, 12);
      const taken = nd(
        leaves
          .filter((lv) => {
            const d = parseYmd(lv.eff);
            return d >= l.date && d < end;
          })
          .reduce((s, lv) => s + lv.days, 0)
      );
      return {
        from: l.date, to: end, taken,
        required: 5,
        shortage: Math.max(0, 5 - taken),
        current: l.date <= asOf && end > asOf,
        daysLeft: diffDays(asOf, end),
      };
    });
  const currentObligation = obligations.find((o) => o.current) || null;

  // 取得予定（未来日付）を反映した残日数
  // ＝ いま持っている有給のうち、予定どおり取ったあとに残る日数。
  //   （予定日までに期限が来る分は、その予定には使えないものとして消化順を決めるが、
  //     期限切れによる減少そのものはここでは差し引かない）
  let plannedBalance = balance;
  let plannedShortfalls = [];
  if (planned.length) {
    const lots2 = buildLots(emp, asOf);
    const sf2 = applyLeaves(lots2, allLeaves, asOf);
    const plannedIds = new Set(planned.map((l) => l.id));
    plannedShortfalls = sf2.filter((s) => plannedIds.has(s.id));
    let usedByPlan = 0;
    lots.forEach((l, i) => {
      if (!l.future && l.expiry > asOf) usedByPlan += lots2[i].used - l.used;
    });
    plannedBalance = nd(Math.max(0, balance - usedByPlan));
  }

  return {
    asOf, lots, active, leaves, allLeaves, planned,
    balance, plannedBalance,
    totalGranted, totalUsed, totalExpired,
    plannedDays: nd(planned.reduce((s, l) => s + l.days, 0)),
    nextExpiry, nextGrant, obligations, currentObligation,
    shortfalls, plannedShortfalls,
  };
}

/**
 * 年次有給休暇管理簿（労働基準法施行規則 第24条の7）用の集計。
 * 基準日ごとに「付与日数・前年繰越・取得時季・取得日数・残日数・時効消滅」を出す。
 * 保存義務は3年。
 */
function buildRegister(emp, asOfDate) {
  const asOf = asOfDate || today();
  const lots = buildLots(emp, asOf);
  const leaves = leavesForCalc(emp, asOf);

  const rows = [];
  let li = 0;

  const expireUpTo = (d, bucket) => {
    for (const l of lots) {
      if (l.expiry <= d && l.remaining > 0) {
        if (bucket) bucket.expired += l.remaining;
        l.expired += l.remaining;
        l.remaining = 0;
      }
    }
  };

  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (lot.date > asOf) break;

    expireUpTo(lot.date, null);
    const carry = nd(lots.slice(0, i).reduce((s, l) => s + l.remaining, 0));
    const end = addMonths(lot.date, 12);
    const row = {
      lot, from: lot.date, to: end,
      granted: lot.granted,
      carry,
      total: nd(carry + lot.granted),
      taken: 0, items: [], expired: 0, endRemaining: 0,
      closed: end <= asOf,
      expiryDate: lot.expiry,
    };

    while (li < leaves.length) {
      const lv = leaves[li];
      const d = parseYmd(lv.eff);
      if (d >= end || d > asOf) break;
      expireUpTo(d, row);
      let need = lv.days;
      const avail = lots
        .filter((l) => l.date <= d && l.expiry > d && l.remaining > 0)
        .sort((a, b) => a.expiry - b.expiry);
      for (const l of avail) {
        if (need <= 0) break;
        const t = Math.min(need, l.remaining);
        l.remaining -= t; l.used += t; need -= t;
      }
      row.taken = nd(row.taken + lv.days);
      row.items.push({ date: lv.date, days: lv.days, note: lv.note || '', bulk: lv.bulk === true, short: need > 0.0001 });
      li++;
    }

    expireUpTo(row.closed ? end : asOf, row);
    row.expired = nd(row.expired);
    row.endRemaining = nd(lots.slice(0, i + 1).reduce((s, l) => s + l.remaining, 0));
    row.required5 = lot.granted >= 10;
    row.met5 = !row.required5 || row.taken >= 5;
    rows.push(row);
  }
  return rows;
}

/* ---------- 初期状態（データなし） ----------
   個人の勤務データはこのファイルには含めません。
   バックアップJSONは 設定タブ →「読み込み」から取り込んでください。 */
const DEFAULT_DATA = { version: 1, employees: [] };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ymd, parseYmd, isYmd, addMonths, diffDays, today, fmtJp, fmtJpShort,
    serviceLabel, nd, monthKeyOf, pad2,
    GRANT_TABLE, grantDaysFor, tableRowFor,
    buildSchedule, estimateAnnualDays, buildLots, leavesForCalc, applyLeaves,
    simulate, buildRegister, DEFAULT_DATA,
  };
}
