/* =========================================================================
   有給管理 - ファイルの入出力
   CSV の読み取り（UTF-8 / Shift_JIS）、Excel(.xlsx) の作成、カレンダー(.ics)、
   書き出しファイルのパスワード保護（ブラウザ標準の暗号機能 WebCrypto を使用）。
   外部のライブラリやサーバーは使わない。
   ========================================================================= */
'use strict';

const IO = (() => {
  /* ---------- ダウンロード ---------- */
  function download(filename, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ---------- 文字コード（Excel の CSV は Shift_JIS のことが多い） ---------- */
  function decodeText(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (e) {
      try { text = new TextDecoder('shift_jis').decode(bytes); }
      catch (e2) { text = new TextDecoder().decode(bytes); }
    }
    return text.replace(/^\uFEFF/, '');
  }

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    const src = String(text).replace(/^\uFEFF/, '');
    const firstLine = src.split(/\r?\n/, 1)[0] || '';
    const sep = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (q) {
        if (c === '"') {
          if (src[i + 1] === '"') { cell += '"'; i++; } else q = false;
        } else cell += c;
        continue;
      }
      if (c === '"' && cell === '') { q = true; continue; }
      if (c === sep) { row.push(cell); cell = ''; continue; }
      if (c === '\r') continue;
      if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
      cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows
      .map((r) => r.map((v) => v.trim()))
      .filter((r) => r.some((v) => v !== ''));
  }
  function toCSV(rows) {
    return rows.map((r) => r.map((c) => {
      let v = String(c == null ? '' : c);
      // Excel で数式として実行されないように（CSVインジェクション対策）
      if (typeof c === 'string' && /^[=+\-@\t\r]/.test(v)) v = "'" + v;
      return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(',')).join('\r\n');
  }
  /** 全角数字・記号を半角に */
  function hankaku(s) {
    return String(s == null ? '' : s)
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[／]/g, '/').replace(/[－‐―ー−]/g, '-').replace(/[．]/g, '.').replace(/　/g, ' ').trim();
  }
  /** いろいろな日付の書き方を 'yyyy-mm-dd' に（読めなければ null） */
  function parseDateLoose(s) {
    const t = hankaku(s);
    let m = t.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  /** '2026-01' '2026/1' '2026年1月' → '2026-01' */
  function parseMonthLoose(s) {
    const t = hankaku(s);
    const m = t.match(/^(\d{4})[-/.年](\d{1,2})月?$/);
    if (!m) return null;
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) return null;
    return `${m[1]}-${String(mo).padStart(2, '0')}`;
  }

  /* ---------- ZIP（無圧縮）と Excel(.xlsx) ---------- */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true);
      c.setUint32(38, 0, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((s, b) => s + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(4, 0, true); e.setUint16(6, 0, true);
    e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, offset, true); e.setUint16(20, 0, true);
    const all = [...parts, ...central, new Uint8Array(e.buffer)];
    const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
    let p = 0;
    for (const b of all) { out.set(b, p); p += b.length; }
    return out;
  }
  const xmlEsc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function colName(i) {
    let s = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }
  /**
   * シートの配列から .xlsx を作る。
   * sheets: [{ name, rows: [[値...]], widths: [文字数...], headerRow: 0始まりの見出し行（固定表示）, titleRows: [行番号...] }]
   */
  function xlsx(sheets) {
    const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const used = new Set();
    const names = sheets.map((s, i) => {
      let n = String(s.name || `Sheet${i + 1}`).replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31) || `Sheet${i + 1}`;
      while (used.has(n)) n = (n.slice(0, 28) + '_' + i);
      used.add(n);
      return n;
    });
    const files = [];
    files.push({ name: '[Content_Types].xml', data: head +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>' });
    files.push({ name: '_rels/.rels', data: head +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>' });
    files.push({ name: 'xl/workbook.xml', data: head +
      `<workbook xmlns="${NS}" xmlns:r="${RNS}"><sheets>` +
      names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>' });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: head +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      '</Relationships>' });
    // スタイル：0=標準 1=見出し 2=罫線つき文字 3=罫線つき数値 4=表題
    files.push({ name: 'xl/styles.xml', data: head +
      `<styleSheet xmlns="${NS}">` +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.##"/></numFmts>' +
      '<fonts count="3"><font><sz val="11"/><name val="Yu Gothic"/><family val="2"/></font>' +
      '<font><b/><sz val="11"/><name val="Yu Gothic"/><family val="2"/></font>' +
      '<font><b/><sz val="13"/><name val="Yu Gothic"/><family val="2"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEFE9DC"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FF9A9A9A"/></left><right style="thin"><color rgb="FF9A9A9A"/></right>' +
      '<top style="thin"><color rgb="FF9A9A9A"/></top><bottom style="thin"><color rgb="FF9A9A9A"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="center"/></xf>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>' });
    sheets.forEach((s, si) => {
      const titles = new Set(s.titleRows || []);
      const hr = s.headerRow != null ? s.headerRow : -1;
      const heads = new Set(s.headRows || (hr >= 0 ? [hr] : []));
      let rowsXml = '';
      s.rows.forEach((row, ri) => {
        let cells = '';
        (row || []).forEach((v, ci) => {
          if (v == null || v === '') return;
          const ref = colName(ci) + (ri + 1);
          if (titles.has(ri)) { cells += `<c r="${ref}" t="inlineStr" s="4"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`; return; }
          const st = heads.has(ri) ? 1 : typeof v === 'number' ? 3 : 2;
          if (typeof v === 'number' && isFinite(v)) cells += `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
          else cells += `<c r="${ref}" t="inlineStr" s="${st}"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
        });
        rowsXml += `<row r="${ri + 1}">${cells}</row>`;
      });
      const pane = hr >= 0
        ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${hr + 1}" topLeftCell="A${hr + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
        : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
      const cols = (s.widths && s.widths.length)
        ? '<cols>' + s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Number(w) || 10}" customWidth="1"/>`).join('') + '</cols>'
        : '';
      files.push({ name: `xl/worksheets/sheet${si + 1}.xml`, data: head +
        `<worksheet xmlns="${NS}" xmlns:r="${RNS}">${pane}<sheetFormatPr defaultRowHeight="18"/>${cols}<sheetData>${rowsXml}</sheetData>` +
        '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>' });
    });
    return zip(files);
  }

  /* ---------- カレンダー(.ics) ---------- */
  function icsEsc(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  /** 1行75バイトで折り返す（UTF-8 の文字の途中では切らない） */
  function fold(line) {
    const enc = new TextEncoder();
    if (enc.encode(line).length <= 75) return line;
    const out = [];
    let cur = '', size = 0, limit = 75;
    for (const ch of line) {
      const b = enc.encode(ch).length;
      if (size + b > limit) { out.push(cur); cur = ''; size = 0; limit = 74; }
      cur += ch; size += b;
    }
    if (cur) out.push(cur);
    return out.join('\r\n ');
  }
  /** events: [{ uid, date:'yyyy-mm-dd', title, desc, alarmDays }] */
  function ics(events, calName) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//yukyu-app//JA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:' + icsEsc(calName || '有給の期限')];
    for (const ev of events) {
      const d = ev.date.replace(/-/g, '');
      const next = new Date(Number(ev.date.slice(0, 4)), Number(ev.date.slice(5, 7)) - 1, Number(ev.date.slice(8, 10)) + 1);
      const d2 = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}`;
      L.push('BEGIN:VEVENT', 'UID:' + icsEsc(ev.uid) + '@yukyu-app', 'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + d2,
        'SUMMARY:' + icsEsc(ev.title), 'DESCRIPTION:' + icsEsc(ev.desc || ''), 'TRANSP:TRANSPARENT');
      if (ev.alarmDays > 0) {
        L.push('BEGIN:VALARM', `TRIGGER:-P${Math.round(ev.alarmDays)}D`, 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(ev.title), 'END:VALARM');
      }
      L.push('END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }

  /* ---------- パスワード保護（AES-GCM 256 / PBKDF2-SHA256） ---------- */
  const ITER = 600000;
  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(str) {
    const s = atob(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  const canCrypto = () => !!(window.crypto && crypto.subtle && window.isSecureContext !== false);
  async function deriveKey(password, salt, iter) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encryptText(text, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, ITER);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)));
    return JSON.stringify({
      format: 'yukyu-encrypted', v: 1, note: '有給管理アプリのバックアップ（パスワード付き）',
      kdf: 'PBKDF2-SHA256', iter: ITER, cipher: 'AES-GCM-256', salt: b64(salt), iv: b64(iv), data: b64(ct),
    }, null, 2);
  }
  function isEncrypted(o) {
    return !!(o && typeof o === 'object' && o.format === 'yukyu-encrypted' && o.data && o.salt && o.iv);
  }
  /** 復号。パスワード違いなどは例外 */
  async function decryptText(o, password) {
    const iter = Number(o.iter) > 0 ? Number(o.iter) : ITER;
    const key = await deriveKey(password, unb64(o.salt), iter);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.data));
    return new TextDecoder().decode(pt);
  }
  /** 画面ロックのパスコードの照合用（元のパスコードは保存しない） */
  async function hashPass(pass, saltB64) {
    const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, 256));
    return { salt: b64(salt), hash: b64(bits) };
  }

  return {
    download, decodeText, parseCSV, toCSV, hankaku, parseDateLoose, parseMonthLoose,
    crc32, zip, xlsx, ics, encryptText, decryptText, isEncrypted, hashPass, canCrypto,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { IO };
