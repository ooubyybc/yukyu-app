/* =========================================================================
   有給管理 - 日本の祝日
   「国民の祝日に関する法律」に沿って計算で求める（1949〜2099年）。
   - 春分の日・秋分の日は天文計算の近似式による（正式には前年2月の官報で決まる）
   - 振替休日（1973年4月12日〜）、国民の休日（1985年12月27日〜）も含む
   外部への通信はしない。
   ========================================================================= */
'use strict';

const JPHoliday = (() => {
  const p2 = (n) => String(n).padStart(2, '0');
  const key = (y, m, d) => `${y}-${p2(m)}-${p2(d)}`;
  const dow = (y, m, d) => new Date(y, m - 1, d).getDay();

  /** その月の第n月曜日（日付） */
  function nthMonday(y, m, n) {
    const first = dow(y, m, 1);
    return 1 + ((8 - first) % 7) + (n - 1) * 7;
  }
  /** 春分日・秋分日（近似式） */
  function equinox(y, autumn) {
    let base;
    if (y <= 1979) base = autumn ? 23.2588 : 20.8357;
    else if (y <= 2099) base = autumn ? 23.2488 : 20.8431;
    else base = autumn ? 24.2488 : 21.8510;
    // 端数は 0 の方向へ切り捨て（1983年より前は負の数になるため floor ではなく trunc）
    const shift = y <= 1979 ? Math.trunc((y - 1983) / 4) : Math.trunc((y - 1980) / 4);
    return Math.floor(base + 0.242194 * (y - 1980) - shift);
  }

  /** 名前のついた「国民の祝日」（振替休日・国民の休日を除く） */
  function named(y) {
    const h = new Map();
    const add = (m, d, name) => h.set(key(y, m, d), name);
    if (y < 1949 || y > 2099) return h;

    add(1, 1, '元日');
    if (y <= 1999) add(1, 15, '成人の日'); else add(1, nthMonday(y, 1, 2), '成人の日');
    if (y >= 1967) add(2, 11, '建国記念の日');
    if (y >= 2020) add(2, 23, '天皇誕生日');
    add(3, equinox(y, false), '春分の日');
    if (y <= 1988) add(4, 29, '天皇誕生日');
    else if (y <= 2006) add(4, 29, 'みどりの日');
    else add(4, 29, '昭和の日');
    add(5, 3, '憲法記念日');
    if (y >= 2007) add(5, 4, 'みどりの日');
    add(5, 5, 'こどもの日');
    if (y >= 1996 && y <= 2002) add(7, 20, '海の日');
    else if (y === 2020) add(7, 23, '海の日');
    else if (y === 2021) add(7, 22, '海の日');
    else if (y >= 2003) add(7, nthMonday(y, 7, 3), '海の日');
    if (y === 2020) add(8, 10, '山の日');
    else if (y === 2021) add(8, 8, '山の日');
    else if (y >= 2016) add(8, 11, '山の日');
    if (y >= 1966 && y <= 2002) add(9, 15, '敬老の日');
    else if (y >= 2003) add(9, nthMonday(y, 9, 3), '敬老の日');
    add(9, equinox(y, true), '秋分の日');
    if (y >= 1966 && y <= 1999) add(10, 10, '体育の日');
    else if (y >= 2000 && y <= 2019) add(10, nthMonday(y, 10, 2), '体育の日');
    else if (y === 2020) add(7, 24, 'スポーツの日');
    else if (y === 2021) add(7, 23, 'スポーツの日');
    else if (y >= 2022) add(10, nthMonday(y, 10, 2), 'スポーツの日');
    add(11, 3, '文化の日');
    add(11, 23, '勤労感謝の日');
    if (y >= 1989 && y <= 2018) add(12, 23, '天皇誕生日');

    // 一度きりの祝日・休日
    if (y === 1959) add(4, 10, '皇太子明仁親王の結婚の儀');
    if (y === 1989) add(2, 24, '昭和天皇の大喪の礼');
    if (y === 1990) add(11, 12, '即位礼正殿の儀');
    if (y === 1993) add(6, 9, '皇太子徳仁親王の結婚の儀');
    if (y === 2019) { add(5, 1, '天皇の即位の日'); add(10, 22, '即位礼正殿の儀'); }
    return h;
  }

  const cache = new Map();
  /** その年の祝日・休日すべて（Map: 'yyyy-mm-dd' → 名前） */
  function ofYear(y) {
    if (cache.has(y)) return cache.get(y);
    const nh = named(y);
    const all = new Map(nh);
    // 振替休日：祝日が日曜日のとき
    for (const [k] of nh) {
      const [yy, mm, dd] = k.split('-').map(Number);
      if (dow(yy, mm, dd) !== 0) continue;
      const d = new Date(yy, mm - 1, dd);
      if (d < new Date(1973, 3, 12)) continue;
      if (yy <= 2006) {
        d.setDate(d.getDate() + 1);
        const k2 = key(d.getFullYear(), d.getMonth() + 1, d.getDate());
        if (!all.has(k2)) all.set(k2, '振替休日');
      } else {
        do { d.setDate(d.getDate() + 1); } while (nh.has(key(d.getFullYear(), d.getMonth() + 1, d.getDate())));
        const k2 = key(d.getFullYear(), d.getMonth() + 1, d.getDate());
        if (!all.has(k2)) all.set(k2, '振替休日');
      }
    }
    // 国民の休日：前日と翌日が祝日の日
    for (let m = 1; m <= 12; m++) {
      const last = new Date(y, m, 0).getDate();
      for (let d = 1; d <= last; d++) {
        const k = key(y, m, d);
        if (all.has(k)) continue;
        const dt = new Date(y, m - 1, d);
        if (dt < new Date(1985, 11, 27)) continue;
        if (y <= 2006 && dt.getDay() === 0) continue;
        const prev = new Date(y, m - 1, d - 1), next = new Date(y, m - 1, d + 1);
        const kp = key(prev.getFullYear(), prev.getMonth() + 1, prev.getDate());
        const kn = key(next.getFullYear(), next.getMonth() + 1, next.getDate());
        const np = prev.getFullYear() === y ? nh : named(prev.getFullYear());
        const nn = next.getFullYear() === y ? nh : named(next.getFullYear());
        if (np.has(kp) && nn.has(kn)) all.set(k, '国民の休日');
      }
    }
    cache.set(y, all);
    return all;
  }

  /** 'yyyy-mm-dd' が祝日・休日なら名前、そうでなければ null */
  function name(ymdStr) {
    if (typeof ymdStr !== 'string' || ymdStr.length < 10) return null;
    const y = Number(ymdStr.slice(0, 4));
    return ofYear(y).get(ymdStr.slice(0, 10)) || null;
  }
  return { ofYear, name, isHoliday: (s) => name(s) != null };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { JPHoliday };
