/**
 * Kensho Pro — Offline Bi-Directional AutoCAD DXF Engine (R12 / R2000 / R2018 ASCII & UTF-8 / CJK Codepages)
 * Full support for HEADER ($INSUNITS, $EXTMIN/$EXTMAX, $DWGCODEPAGE), TABLES (LAYER colors, linetypes, on/off state),
 * BLOCKS & INSERT (recursive nested block references with X/Y scale & rotation), LINE, LWPOLYLINE (with bulge arcs),
 * POLYLINE + VERTEX, CIRCLE, ARC, ELLIPSE, SPLINE, SOLID, POINT, LEADER, DIMENSION, TEXT & MTEXT with strict
 * alignment/justification, width factor, line spacing, Paper-Space filtering, and full Multilingual (Japanese,
 * Chinese Simplified/Traditional, Korean, Tamil, Hindi, Arabic, Cyrillic, European) rendering.
 * Kensho Studio · textportdocx.in
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DXFEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Universal Multilingual Font Stack (Japanese, Chinese SC/TC, Korean, Tamil, Devanagari, Arabic, Cyrillic, Latin)
  const MULTILINGUAL_FONT_STACK = '"Noto Sans CJK JP", "Noto Sans JP", "Yu Gothic", "Meiryo", "MS Gothic", "Hiragino Sans", "Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei", "PingFang SC", "SimHei", "Noto Sans CJK TC", "Microsoft JhengHei", "Noto Sans CJK KR", "Malgun Gothic", "Noto Sans Tamil", "Nirmala UI", "Latha", "Noto Sans Devanagari", "Mangal", "Noto Sans Arabic", "Segoe UI", Arial, sans-serif';

  // AutoCAD Color Indices (ACI) standard palette
  const ACI = {
    BYBLOCK: 0,
    RED: 1,
    YELLOW: 2,
    GREEN: 3,
    CYAN: 4,
    BLUE: 5,
    MAGENTA: 6,
    WHITE: 7,
    GRAY: 8,
    LIGHT_GRAY: 9,
    ORANGE: 30,
    VIOLET: 200,
    BYLAYER: 256
  };

  // Extended AutoCAD ACI color lookup table
  const ACI_PALETTE_DARK = {
    1: '#ef4444', // Red
    2: '#eab308', // Yellow
    3: '#22c55e', // Green
    4: '#06b6d4', // Cyan
    5: '#3b82f6', // Blue
    6: '#ec4899', // Magenta
    7: '#f8fafc', // White on Dark Modelspace
    8: '#94a3b8', // Dark Gray
    9: '#cbd5e1', // Light Gray
    10: '#f87171',
    11: '#fca5a5',
    20: '#fb923c',
    30: '#f97316',
    40: '#f59e0b',
    50: '#eab308',
    60: '#84cc16',
    70: '#22c55e',
    80: '#10b981',
    90: '#14b8a6',
    100: '#06b6d4',
    110: '#0ea5e9',
    120: '#3b82f6',
    130: '#6366f1',
    140: '#8b55f7',
    150: '#a855f7',
    160: '#d946ef',
    170: '#ec4899',
    190: '#f43f5e',
    200: '#c084fc',
    250: '#475569',
    251: '#64748b',
    252: '#94a3b8',
    253: '#cbd5e1',
    254: '#e2e8f0',
    255: '#ffffff'
  };

  const ACI_PALETTE_LIGHT = {
    ...ACI_PALETTE_DARK,
    2: '#b45309', // Darker amber/gold on white paper for readability
    3: '#15803d', // Crisp engineering green on white paper
    4: '#0e7490', // Deep cyan on white paper
    5: '#1d4ed8', // Deep cobalt blue on white paper
    6: '#be185d', // Deep magenta on white paper
    7: '#0f172a', // AutoCAD ACI 7 = Black/Dark Slate on White Paper!
    8: '#475569',
    9: '#64748b',
    50: '#a16207',
    254: '#334155',
    255: '#1e293b'
  };

  // Standard AutoCAD $INSUNITS definitions
  const UNITS = {
    unitless: { code: 0, name: 'Unitless', ptFactor: 1.0, toMM: 1.0, toMils: 39.3700787 },
    in: { code: 1, name: 'Inches', ptFactor: 1 / 72, toMM: 25.4, toMils: 1000 },
    ft: { code: 2, name: 'Feet', ptFactor: 1 / (72 * 12), toMM: 304.8, toMils: 12000 },
    mm: { code: 4, name: 'Millimeters', ptFactor: 25.4 / 72, toMM: 1.0, toMils: 39.3700787 },
    cm: { code: 5, name: 'Centimeters', ptFactor: 2.54 / 72, toMM: 10.0, toMils: 393.700787 },
    m: { code: 6, name: 'Meters', ptFactor: 0.0254 / 72, toMM: 1000.0, toMils: 39370.0787 },
    mils: { code: 10, name: 'Mils', ptFactor: 1000 / 72, toMM: 0.0254, toMils: 1.0 },
    um: { code: 13, name: 'Microns (IPC Metric)', ptFactor: 25400 / 72, toMM: 0.001, toMils: 0.03937 }
  };

  const INSUNITS_CODE_MAP = {
    0: 'unitless',
    1: 'in',
    2: 'ft',
    4: 'mm',
    5: 'cm',
    6: 'm',
    10: 'mils',
    13: 'um'
  };

  const PRESETS = {
    '1:1': 1.0,
    '1:2': 2.0,
    '1:5': 5.0,
    '1:10': 10.0,
    '1:20': 20.0,
    '1:50': 50.0,
    '1:100': 100.0,
    '1:1000': 1000.0
  };

  /**
   * Smart Multi-Encoding DXF Byte Decoder
   * Automatically handles UTF-8, Shift-JIS (Japanese ANSI_932), GB18030/GBK (Simplified Chinese ANSI_936),
   * Big5 (Traditional Chinese ANSI_950), EUC-KR (Korean ANSI_949), Cyrillic (ANSI_1251), Arabic, and Western codepages.
   */
  function decodeDXFBytes(bytesOrText) {
    if (typeof bytesOrText === 'string') return bytesOrText;
    if (!bytesOrText) return '';
    const u8 = bytesOrText instanceof Uint8Array ? bytesOrText : new Uint8Array(bytesOrText);
    if (typeof TextDecoder === 'undefined') {
      let s = '';
      for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
      return s;
    }
    // 0. Detect UTF-16LE / UTF-16BE BOM or interleaved NUL bytes from Windows Unicode CAD exports
    if (u8.length >= 4) {
      if (u8[0] === 0xFF && u8[1] === 0xFE) {
        try { return new TextDecoder('utf-16le').decode(u8.subarray(2)); } catch (e) {}
      }
      if (u8[0] === 0xFE && u8[1] === 0xFF) {
        try { return new TextDecoder('utf-16be').decode(u8.subarray(2)); } catch (e) {}
      }
      if (u8[0] !== 0 && u8[1] === 0 && u8[2] !== 0 && u8[3] === 0) {
        try { return new TextDecoder('utf-16le').decode(u8); } catch (e) {}
      }
    }
    // 1. Try strict UTF-8 first
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(u8);
    } catch (e) {}

    // 2. Inspect ASCII header snippet for $DWGCODEPAGE
    const headAscii = new TextDecoder('ascii').decode(u8.subarray(0, Math.min(u8.length, 16384)));
    const cpMatch = /\$DWGCODEPAGE[\s\r\n]+\d+[\s\r\n]+([A-Za-z0-9_-]+)/i.exec(headAscii);
    const cpRaw = cpMatch ? cpMatch[1].toUpperCase() : '';
    const cpMap = {
      ANSI_932: 'shift_jis',
      DOS932: 'shift_jis',
      SJIS: 'shift_jis',
      ANSI_936: 'gb18030',
      GB2312: 'gb18030',
      GBK: 'gb18030',
      ANSI_950: 'big5',
      BIG5: 'big5',
      ANSI_949: 'euc-kr',
      KSC5601: 'euc-kr',
      ANSI_1251: 'windows-1251',
      ANSI_1252: 'windows-1252',
      ANSI_1253: 'windows-1253',
      ANSI_1254: 'windows-1254',
      ANSI_1255: 'windows-1255',
      ANSI_1256: 'windows-1256',
      ANSI_874: 'windows-874'
    };
    if (cpRaw && cpMap[cpRaw]) {
      try {
        return new TextDecoder(cpMap[cpRaw], { fatal: false }).decode(u8);
      } catch (e) {}
    }

    // 3. Heuristic fallback across CJK & international encodings (Shift-JIS, GB18030, Big5, EUC-KR, Windows-1252)
    for (const enc of ['shift_jis', 'gb18030', 'big5', 'euc-kr', 'windows-1252']) {
      try {
        return new TextDecoder(enc, { fatal: true }).decode(u8);
      } catch (e) {}
    }
    return new TextDecoder('utf-8').decode(u8);
  }

  // Decode AutoCAD MIF (\M+nXXXX) and Unicode (\U+XXXX) escape sequences + strip MTEXT formatting codes safely
  function cleanDXFText(raw) {
    if (!raw) return '';
    let s = String(raw);

    // 1. Decode \U+XXXX and \u+XXXX (strictly 4 hex digits per AutoCAD CIF spec, with safe range guard) FIRST before any semicolon-based MTEXT stripping!
    s = s.replace(/\\[Uu]\+([0-9A-Fa-f]{4})/g, (_, hex) => {
      const cp = parseInt(hex, 16);
      if (Number.isFinite(cp) && cp >= 0 && cp <= 0x10FFFF) {
        try { return String.fromCodePoint(cp); } catch (_e) { return _; }
      }
      return _;
    });

    // 2. Decode AutoCAD MIF CJK codes: \M+1XXXX (Shift-JIS), \M+2XXXX (Big5), \M+3XXXX (EUC-KR), \M+5XXXX (GBK)
    s = s.replace(/\\[Mm]\+([1-5])([0-9A-Fa-f]{4})/g, (full, idxStr, hex) => {
      try {
        if (typeof TextDecoder === 'undefined') return full;
        const b1 = parseInt(hex.slice(0, 2), 16);
        const b2 = parseInt(hex.slice(2, 4), 16);
        const encMap = { '1': 'shift_jis', '2': 'big5', '3': 'euc-kr', '4': 'euc-kr', '5': 'gb18030' };
        const enc = encMap[idxStr] || 'utf-8';
        return new TextDecoder(enc).decode(new Uint8Array([b1, b2]));
      } catch (e) {
        return full;
      }
    });

    // 3. Protect escaped backslashes and braces
    s = s.replace(/\\\\/g, '\x01').replace(/\\\{/g, '\x02').replace(/\\\}/g, '\x03');

    // 4. Convert MTEXT line breaks (\P) and non-breaking spaces (\~)
    s = s.replace(/\\P/gi, '\n').replace(/\\~/g, ' ');

    // 5. Convert MTEXT stacked fractions/tolerances: \S+0.05^-0.02; or \S1#2;
    s = s.replace(/\\S([^;^#\/]*?)[\^#\/]([^;]*?);/gi, (_, top, bot) => {
      const t = top.trim(), b = bot.trim();
      if (t && b) return `${t}/${b}`;
      return t || b;
    });

    // 6. Strip MTEXT inline formatting prefixes (\fFont|...;, \H2.5x;, \W0.8;, \T1;, \Q15;, \A1;, \C7;, \p...;)
    s = s.replace(/\\[fFHWTQACcp][^;\\]*;/g, '');
    s = s.replace(/\\[LlOoKk]/g, '');

    // 7. Remove unescaped MTEXT grouping braces { and }
    s = s.replace(/[{}]/g, '');

    // 8. Restore escaped characters & AutoCAD %% symbols
    s = s
      .replace(/\x01/g, '\\')
      .replace(/\x02/g, '{')
      .replace(/\x03/g, '}')
      .replace(/%%[cC]/g, '⌀')
      .replace(/%%[dD]/g, '°')
      .replace(/%%[vV]/g, ' | ')
      .replace(/%%[pP]/g, '±')
      .replace(/%%[uUoO]/g, '')
      .replace(/%%%/g, '%');

    return s.trim();
  }

  // Transliterate engineering symbols for DXFWriter while preserving all CJK & international Unicode characters (never turning languages into ???)
  function sanitizeAsciiDXFText(str) {
    return String(str || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/[ΩΩ]/g, 'Ohm')
      .replace(/[µμ]/g, 'u')
      .replace(/Δ/g, 'Delta ')
      .replace(/⌀/g, '%%c')
      .replace(/°/g, '%%d')
      .replace(/±/g, '%%p')
      .replace(/×/g, 'x')
      .replace(/÷/g, '/')
      .replace(/≤/g, '<=')
      .replace(/≥/g, '>=')
      .replace(/✓/g, 'OK')
      .replace(/✗/g, 'X')
      .replace(/→/g, '->')
      .replace(/↔/g, '<->')
      .replace(/·/g, '-')
      .replace(/[\x00-\x1F\x7F]/g, '');
  }

  // Matrix math helpers for affine transformations (PDF CTM)
  function identityMatrix() {
    return [1, 0, 0, 1, 0, 0];
  }

  function multiplyMatrix(m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
  }

  function transformPoint(m, x, y) {
    return [
      m[0] * x + m[2] * y + m[4],
      m[1] * x + m[3] * y + m[5]
    ];
  }

  // Convert LWPOLYLINE / POLYLINE segment with AutoCAD bulge (tan(theta/4)) into interpolated points
  function tessellateBulgeSegment(p1, p2, bulge, segments = 12) {
    if (!bulge || Math.abs(bulge) < 1e-6) return [p2];
    const x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
    const dx = x2 - x1, dy = y2 - y1;
    const chord = Math.hypot(dx, dy);
    if (chord < 1e-9) return [p2];

    const theta = 4 * Math.atan(bulge);
    const radius = Math.abs(chord / (2 * Math.sin(theta / 2)));
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const d = Math.sqrt(Math.max(0, radius * radius - (chord * chord) / 4));
    const sign = (bulge > 0 ? 1 : -1) * (Math.abs(bulge) <= 1 ? 1 : -1);
    const nx = -dy / chord, ny = dx / chord;
    const cx = mx + sign * d * nx;
    const cy = my + sign * d * ny;

    const startAng = Math.atan2(y1 - cy, x1 - cx);
    const pts = [];
    const steps = Math.max(8, Math.min(64, Math.ceil(Math.abs(theta) / (Math.PI / (segments * 2)))));
    for (let s = 1; s <= steps; s++) {
      const ang = startAng + (theta * s) / steps;
      pts.push([cx + radius * Math.cos(ang), cy + radius * Math.sin(ang)]);
    }
    return pts;
  }

  function tessellateBulgeArc(x1, y1, x2, y2, bulge, segments = 16) {
    return tessellateBulgeSegment([x1, y1], [x2, y2], bulge, segments);
  }

  function computeExactArcBBox(cx, cy, r, startAngle, endAngle) {
    const rad = Math.abs(r || 1);
    if (!isFinite(cx) || !isFinite(cy)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    let s = ((Number(startAngle) || 0) % 360 + 360) % 360;
    let e = ((Number(endAngle != null ? endAngle : 360)) % 360 + 360) % 360;
    if (Math.abs((endAngle != null ? endAngle : 360) - (startAngle || 0)) >= 359.999) {
      return { minX: cx - rad, minY: cy - rad, maxX: cx + rad, maxY: cy + rad };
    }
    const sRad = (s * Math.PI) / 180;
    const eRad = (e * Math.PI) / 180;
    const x1 = cx + rad * Math.cos(sRad), y1 = cy + rad * Math.sin(sRad);
    const x2 = cx + rad * Math.cos(eRad), y2 = cy + rad * Math.sin(eRad);
    let minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    let minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    const inSweep = ang => (s <= e) ? (ang >= s && ang <= e) : (ang >= s || ang <= e);
    if (inSweep(0)) maxX = cx + rad;
    if (inSweep(90)) maxY = cy + rad;
    if (inSweep(180)) minX = cx - rad;
    if (inSweep(270)) minY = cy - rad;
    return { minX, minY, maxX, maxY };
  }

  function computeSplinePoints(pts, isFit = false) {
    if (!Array.isArray(pts) || pts.length < 2) return pts || [];
    if (pts.length === 2) return pts.map(p => [p[0], p[1]]);
    if (isFit) {
      const smooth = [[pts[0][0], pts[0][1]]];
      for (let k = 0; k < pts.length - 1; k++) {
        const p0 = pts[Math.max(0, k - 1)];
        const p1 = pts[k];
        const p2 = pts[k + 1];
        const p3 = pts[Math.min(pts.length - 1, k + 2)];
        for (let s = 1; s <= 6; s++) {
          const t = s / 6, t2 = t * t, t3 = t2 * t;
          const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
          const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
          smooth.push([x, y]);
        }
      }
      return smooth;
    }
    let cur = pts.map(p => [p[0], p[1]]);
    for (let pass = 0; pass < 3; pass++) {
      const next = [cur[0]];
      for (let k = 0; k < cur.length - 1; k++) {
        const a = cur[k], b = cur[k + 1];
        next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
        next.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
      }
      next.push(cur[cur.length - 1]);
      cur = next;
    }
    return cur;
  }

  function syncEntityRenderGeometry(ent) {
    if (!ent || !ent.type) return ent;
    ent._bbox = null;
    ent._cachedBBox = null;
    ent._summary = null;
    if (ent.type === 'ELLIPSE') {
      const mx = ent.mx != null ? ent.mx : ((ent.rx || 10) * Math.cos(ent.rotation || 0));
      const my = ent.my != null ? ent.my : ((ent.rx || 10) * Math.sin(ent.rotation || 0));
      const majorR = Math.hypot(mx, my) || ent.rx || 10;
      const ratio = Math.max(0.01, Math.min(10, Math.abs(ent.ratio || (ent.ry && majorR ? ent.ry / majorR : 0.5))));
      ent.mx = mx;
      ent.my = my;
      ent.ratio = ratio;
      ent.rx = majorR;
      ent.ry = majorR * ratio;
      ent.rotation = Math.atan2(my, mx);
      if (ent.startParam == null) ent.startParam = 0;
      if (ent.endParam == null) ent.endParam = Math.PI * 2;
    } else if (ent.type === 'SPLINE' || (ent.type === 'LWPOLYLINE' && ent.isSpline)) {
      if (Array.isArray(ent.points) && ent.points.length >= 2) {
        ent.renderPoints = computeSplinePoints(ent.points, !!ent._isFitSpline);
      }
    } else if (ent.type === 'LWPOLYLINE' && Array.isArray(ent.points) && ent.points.length >= 2) {
      let hasBulge = false;
      for (let i = 0; i < ent.points.length; i++) {
        const b = (ent.points[i] && ent.points[i][2]) || (ent.bulges && ent.bulges[i]) || 0;
        if (Math.abs(b) > 1e-6) { hasBulge = true; break; }
      }
      if (hasBulge) {
        const rPts = [];
        const n = ent.points.length;
        for (let idx = 0; idx < n; idx++) {
          const p1 = ent.points[idx];
          const b = p1[2] || (ent.bulges && ent.bulges[idx]) || 0;
          rPts.push([p1[0], p1[1]]);
          if (Math.abs(b) > 1e-6 && (idx < n - 1 || ent.closed)) {
            const p2 = ent.points[(idx + 1) % n];
            const arcPts = tessellateBulgeSegment([p1[0], p1[1]], [p2[0], p2[1]], b);
            for (let k = 0; k < arcPts.length - 1; k++) rPts.push(arcPts[k]);
          }
        }
        ent.renderPoints = rPts;
        ent.ctrlPoints = ent.points;
      } else {
        ent.renderPoints = ent.points;
        if (ent.ctrlPoints) ent.ctrlPoints = ent.points;
      }
    } else if (ent.type === 'HATCH') {
      if ((!ent.loops || !ent.loops.length) && Array.isArray(ent.points) && ent.points.length >= 2) {
        const closedLoop = ent.points.map(p => [p[0], p[1]]);
        const f = closedLoop[0], l = closedLoop[closedLoop.length - 1];
        if (Math.hypot(f[0] - l[0], f[1] - l[1]) > 1e-4) closedLoop.push([f[0], f[1]]);
        ent.loops = [closedLoop];
      } else if (Array.isArray(ent.loops) && ent.loops.length && (!ent.points || !ent.points.length)) {
        ent.points = ent.loops[0].map(p => [p[0], p[1]]);
      }
    } else if (ent.type === 'DIMENSION') {
      if (ent.x != null && ent.textX == null) ent.textX = ent.x;
      if (ent.y != null && ent.textY == null) ent.textY = ent.y;
    }
    if (typeof computeStandaloneEntityBBox === 'function') {
      const bb = computeStandaloneEntityBBox(ent);
      ent._bbox = bb;
      ent._cachedBBox = bb;
    }
    return ent;
  }

  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = x => Math.round(255 * x).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }

  function aciToHex(aci, isDarkBg = true) {
    const code = Math.abs(parseInt(aci, 10) || 7);
    const pal = isDarkBg ? ACI_PALETTE_DARK : ACI_PALETTE_LIGHT;
    if (pal[code]) return pal[code];
    if (code >= 10 && code < 250) {
      const hue = ((Math.floor((code - 10) / 10) * 15) % 360);
      const isOdd = code % 2 === 1;
      const light = isDarkBg ? (isOdd ? 68 : 56) : (isOdd ? 40 : 30);
      return hslToHex(hue, 80, light);
    }
    if (code >= 250 && code <= 255) {
      return pal[code] || (isDarkBg ? '#cbd5e1' : '#334155');
    }
    return isDarkBg ? '#f8fafc' : '#0f172a';
  }

  function trueColorToHex(tc) {
    const n = parseInt(tc, 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return '#' + (n & 0xFFFFFF).toString(16).padStart(6, '0');
  }

  function hexToTrueColor(hex) {
    if (!hex || typeof hex !== 'string') return null;
    const clean = hex.trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(clean)) {
      const full = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
      return parseInt(full, 16);
    }
    if (/^[0-9a-f]{6}$/i.test(clean)) {
      return parseInt(clean, 16);
    }
    return null;
  }

  function hexToNearestACI(hex) {
    const tc = hexToTrueColor(hex);
    if (tc == null) return 7;
    const r = (tc >> 16) & 0xFF, g = (tc >> 8) & 0xFF, b = tc & 0xFF;
    let bestCode = 7, bestDist = Infinity;
    for (const [codeStr, palHex] of Object.entries(ACI_PALETTE_DARK)) {
      const pTc = hexToTrueColor(palHex);
      if (pTc == null) continue;
      const pr = (pTc >> 16) & 0xFF, pg = (pTc >> 8) & 0xFF, pb = pTc & 0xFF;
      const dist = (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb);
      if (dist < bestDist) {
        bestDist = dist;
        bestCode = parseInt(codeStr, 10);
      }
    }
    return bestCode || 7;
  }

  function contrastAdjustHex(hex, isDarkBg = true) {
    if (!hex || typeof hex !== 'string') return isDarkBg ? '#f8fafc' : '#0f172a';
    const tc = hexToTrueColor(hex);
    if (tc == null) return hex;
    let r = (tc >> 16) & 0xFF, g = (tc >> 8) & 0xFF, b = tc & 0xFF;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const isAchromatic = Math.max(r, g, b) - Math.min(r, g, b) < 28;
    if (!isDarkBg) {
      // Light/white background: invert near-white grays and darken bright yellow/cyan/green so measurement text is ALWAYS crisp
      if (isAchromatic && lum > 185) return '#0f172a';
      if (lum > 185) {
        const scale = 138 / Math.max(1, lum);
        r = Math.max(0, Math.min(255, Math.round(r * scale)));
        g = Math.max(0, Math.min(255, Math.round(g * scale)));
        b = Math.max(0, Math.min(255, Math.round(b * scale)));
        return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
      }
    } else {
      // Dark background: invert near-black grays and lift dark blue/navy/maroon so lines & measurement text are NEVER invisible
      if (isAchromatic && lum < 68) return '#f8fafc';
      if (lum < 72) {
        const lift = 128 - lum;
        r = Math.min(255, Math.round(r + lift * 0.85));
        g = Math.min(255, Math.round(g + lift * 0.90));
        b = Math.min(255, Math.round(b + lift * 1.05));
        return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
      }
    }
    return hex;
  }

  function resolveDimensionLabel(ent, parser = null) {
    if (!ent) return '';
    // 1. Check *D block embedded TEXT/MTEXT first (preserves override text, tolerances, ⌀, R, °)
    if (parser && ent.blockName) {
      const dBlk = parser._getBlock ? parser._getBlock(ent.blockName) : (parser.blocks && parser.blocks[ent.blockName]);
      if (dBlk && Array.isArray(dBlk.entities)) {
        const blkTexts = [];
        for (const sub of dBlk.entities) {
          if (sub && (sub.type === 'TEXT' || sub.type === 'MTEXT' || sub.type === 'TOLERANCE') && sub.text) {
            const cleaned = cleanDXFText(sub.text).trim();
            if (cleaned) blkTexts.push(cleaned);
          }
        }
        if (blkTexts.length > 0) {
          const joined = blkTexts.join(' ');
          if (!joined.includes('<>')) return joined;
        }
      }
    }
    let measVal = (ent.measurement != null && Number.isFinite(Number(ent.measurement))) ? Number(ent.measurement) : null;
    if (measVal == null && Number.isFinite(ent.x1) && Number.isFinite(ent.y1) && Number.isFinite(ent.x2) && Number.isFinite(ent.y2)) {
      const d = Math.hypot(ent.x2 - ent.x1, ent.y2 - ent.y1);
      if (d > 1e-6) measVal = d;
    }
    const dimTypeLow = (ent.dimType != null) ? (ent.dimType & 0x1F) : 0;
    const isAngular = (dimTypeLow === 2 || dimTypeLow === 5);
    const fmtMeas = measVal != null ? (String(Number(measVal.toFixed(4))) + (isAngular ? '°' : '')) : '';
    const rawTxt = ent.text != null ? cleanDXFText(String(ent.text)).trim() : '';
    if (!rawTxt || rawTxt === '<>') return fmtMeas;
    if (rawTxt.includes('<>')) return fmtMeas ? rawTxt.replace(/<>/g, fmtMeas) : rawTxt.replace(/<>/g, '').trim();
    return rawTxt;
  }

  function extractAllDXFTextItems(parser, options = {}) {
    if (!parser || !Array.isArray(parser.entities)) return [];
    const hiddenSet = options.hiddenLayers instanceof Set ? options.hiddenLayers : (Array.isArray(options.hiddenLayers) ? new Set(options.hiddenLayers) : null);
    const includeDimValues = options.includeDimValues !== false;
    const items = [];

    const walk = (ents, tf = null, depth = 0, parentLayer = null) => {
      if (!Array.isArray(ents) || depth > 6) return;
      for (const e of ents) {
        if (!e) continue;
        const effLayer = (e.layer === '0' && parentLayer) ? parentLayer : (e.layer || '0');
        const isDim = (e.type === 'DIMENSION');
        const isHidden = hiddenSet && hiddenSet.has(effLayer);
        // Never hide DIMENSION measurement values even if layer is Defpoints or hidden!
        if (isHidden && !(isDim && includeDimValues)) continue;

        const mapPt = (wx, wy) => {
          if (!tf) return [wx, wy];
          const dx = (wx - tf.bx) * tf.sx, dy = (wy - tf.by) * tf.sy;
          return [tf.ix + dx * tf.cosR - dy * tf.sinR, tf.iy + dx * tf.sinR + dy * tf.cosR];
        };

        if (e.type === 'TEXT' || e.type === 'MTEXT' || e.type === 'MLEADER' || e.type === 'TOLERANCE' || e.type === 'ATTRIB' || e.type === 'ATTDEF') {
          const str = cleanDXFText(e.text || '').trim();
          if (str) {
            const [px, py] = mapPt(e.x || 0, e.y || 0);
            items.push({
              str,
              x: px,
              y: py,
              height: e.height || 2.5,
              type: e.origType || (e.isMText ? 'MTEXT' : (e.isTolerance ? 'TOLERANCE' : e.type)),
              layer: effLayer,
              entId: e._id,
              isMeasurement: !!(e.isTolerance),
              isDimBlock: false,
              transform: [1, 0, 0, 1, px, py]
            });
          }
        } else if (isDim) {
          const lbl = resolveDimensionLabel(e, parser);
          if (lbl) {
            const tx = e.textX != null ? e.textX : (e.x != null ? e.x : (((e.x1 || 0) + (e.x2 || 0)) / 2));
            const ty = e.textY != null ? e.textY : (e.y != null ? e.y : (((e.y1 || 0) + (e.y2 || 0)) / 2));
            const [px, py] = mapPt(tx, ty);
            items.push({
              str: lbl,
              x: px,
              y: py,
              height: e.height || 2.5,
              type: 'DIMENSION',
              layer: effLayer,
              entId: e._id,
              isMeasurement: true,
              isDimBlock: !!e.blockName,
              transform: [1, 0, 0, 1, px, py]
            });
          }
        } else if (e.type === 'INSERT' && e.blockName) {
          const blk = parser._getBlock ? parser._getBlock(e.blockName) : (parser.blocks && parser.blocks[e.blockName]);
          if (blk && Array.isArray(blk.entities) && blk.entities.length > 0) {
            const parentMirrorFlip = tf && ((tf.sx || 1) * (tf.sy || 1) < 0) ? -1 : 1;
            const totalRot = (e.rotation || 0) * parentMirrorFlip + (tf ? (tf.rotDeg || 0) : 0);
            const rad = totalRot * Math.PI / 180;
            const [ix, iy] = mapPt(e.x || 0, e.y || 0);
            const nextTf = {
              bx: blk.baseX || 0,
              by: blk.baseY || 0,
              ix,
              iy,
              sx: (e.scaleX || 1) * (tf ? (tf.sx || 1) : 1),
              sy: (e.scaleY || 1) * (tf ? (tf.sy || 1) : 1),
              cosR: Math.cos(rad),
              sinR: Math.sin(rad),
              rotDeg: totalRot
            };
            walk(blk.entities, nextTf, depth + 1, effLayer);
          }
        }
      }
    };
    walk(parser.entities, null, 0, null);
    return items;
  }

  // Bezier curve flattening into line segments for CAD polylines
  function flattenCubicBezier(p0, p1, p2, p3, tolerance = 0.5) {
    const points = [p0];
    function subdivide(t0, t1, pt0, pt1, pt2, pt3) {
      const midX = (pt0[0] + 3 * pt1[0] + 3 * pt2[0] + pt3[0]) / 8;
      const midY = (pt0[1] + 3 * pt1[1] + 3 * pt2[1] + pt3[1]) / 8;
      const chordMidX = (pt0[0] + pt3[0]) / 2;
      const chordMidY = (pt0[1] + pt3[1]) / 2;
      const dx = midX - chordMidX;
      const dy = midY - chordMidY;
      const distSq = dx * dx + dy * dy;

      if (distSq <= tolerance * tolerance || (t1 - t0) < 0.05) {
        points.push([midX, midY], pt3);
      } else {
        const midT = (t0 + t1) / 2;
        const q0 = pt0;
        const q1 = [(pt0[0] + pt1[0]) / 2, (pt0[1] + pt1[1]) / 2];
        const q2 = [(pt0[0] + 2 * pt1[0] + pt2[0]) / 4, (pt0[1] + 2 * pt1[1] + pt2[1]) / 4];
        const q3 = [midX, midY];

        const r0 = [midX, midY];
        const r1 = [(pt1[0] + 2 * pt2[0] + pt3[0]) / 4, (pt1[1] + 2 * pt2[1] + pt3[1]) / 4];
        const r2 = [(pt2[0] + pt3[0]) / 2, (pt2[1] + pt3[1]) / 2];
        const r3 = pt3;

        subdivide(t0, midT, q0, q1, q2, q3);
        subdivide(midT, 1, r0, r1, r2, r3);
      }
    }
    subdivide(0, 1, p0, p1, p2, p3);
    return points;
  }

  /**
   * DXFWriter: Generates standard AutoCAD R12/2000 ASCII/UTF-8 DXF files
   */
  /* ============================================================================
   * [MODULE SECTION: AUTOCAD R2000 ASCII DXF WRITER]
   * WHAT THIS IS: Serializes CAD layers, blocks, lines, arcs, polylines, text,
   *   and redline revision clouds into standard AutoCAD 2000 (AC1015) DXF format.
   * WHY / HOW TO EDIT: Add `add<Entity>()` methods here when exporting new CAD
   *   entity types or custom layer tables.
   * ============================================================================ */
  class DXFWriter {
    constructor(options = {}) {
      this.unit = options.unit || 'mm';
      this.scale = options.scale || 1.0;
      this.unitInfo = UNITS[this.unit] || UNITS.mm;
      this.scaleFactor = this.unitInfo.ptFactor * this.scale;
      this.layers = new Set([
        '0',
        'SHEET_BORDER',
        'GEOMETRY',
        'TEXT',
        'REDLINE_DIFFS',
        'REDLINE_MARKUPS',
        'REDLINE_MEASUREMENTS',
        'REDLINE_BOM'
      ]);
      this.layerCustomColors = {};
      this.layerLinetypes = {};
      this.entities = [];
      this.minX = Infinity;
      this.minY = Infinity;
      this.maxX = -Infinity;
      this.maxY = -Infinity;
    }

    addLayer(name, color = 7, linetype = "CONTINUOUS") {
      if (!name) return;
      const n = String(name).trim();
      this.layers.add(n);
      if (color != null) this.layerCustomColors[n] = color;
      if (linetype) this.layerLinetypes[n] = String(linetype).toUpperCase();
    }

    toDXFString() {
      return this.generateString();
    }

    toDXF() {
      return this.generateString();
    }

    _coord(pt) {
      const x = pt[0] * this.scaleFactor;
      const y = pt[1] * this.scaleFactor;
      if (x < this.minX) this.minX = x;
      if (x > this.maxX) this.maxX = x;
      if (y < this.minY) this.minY = y;
      if (y > this.maxY) this.maxY = y;
      return [x, y];
    }

    addLine(x1, y1, x2, y2, layer = 'GEOMETRY', color = null) {
      this.layers.add(layer);
      const [p1x, p1y] = this._coord([x1, y1]);
      const [p2x, p2y] = this._coord([x2, y2]);
      this.entities.push({
        type: 'LINE',
        layer,
        color,
        p1: [p1x, p1y],
        p2: [p2x, p2y]
      });
    }

    addCircle(cx, cy, r, layer = 'GEOMETRY', color = null) {
      this.layers.add(layer);
      const [px, py] = this._coord([cx, cy]);
      const rad = r * this.scaleFactor;
      if (px - rad < this.minX) this.minX = px - rad;
      if (px + rad > this.maxX) this.maxX = px + rad;
      if (py - rad < this.minY) this.minY = py - rad;
      if (py + rad > this.maxY) this.maxY = py + rad;
      this.entities.push({
        type: 'CIRCLE',
        layer,
        color,
        center: [px, py],
        radius: rad
      });
    }

    addArc(cx, cy, r, startAngleDeg, endAngleDeg, layer = 'GEOMETRY', color = null) {
      this.layers.add(layer);
      const [px, py] = this._coord([cx, cy]);
      const rad = r * this.scaleFactor;
      if (px - rad < this.minX) this.minX = px - rad;
      if (px + rad > this.maxX) this.maxX = px + rad;
      if (py - rad < this.minY) this.minY = py - rad;
      if (py + rad > this.maxY) this.maxY = py + rad;
      this.entities.push({
        type: 'ARC',
        layer,
        color,
        center: [px, py],
        radius: rad,
        startAngle: startAngleDeg,
        endAngle: endAngleDeg
      });
    }

    addPolyline(points, closed = false, layer = 'GEOMETRY', color = null, bulges = null) {
      if (!points || points.length < 2) return;
      this.layers.add(layer);
      const transformed = points.map(p => this._coord(p));
      this.entities.push({
        type: 'LWPOLYLINE',
        layer,
        color,
        closed: !!closed,
        points: transformed,
        bulges: bulges || null
      });
    }

    addRevisionCloud(x, y, w, h, label = '', layer = 'REDLINE_DIFFS', color = ACI.RED) {
      const corners = [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h]
      ];
      const pts = [];
      const bulges = [];
      const step = Math.max(8, Math.min(24, Math.min(w, h) / 4));
      for (let i = 0; i < 4; i++) {
        const p1 = corners[i];
        const p2 = corners[(i + 1) % 4];
        const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        const n = Math.max(2, Math.round(len / step));
        for (let k = 0; k < n; k++) {
          const t = k / n;
          pts.push([p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t]);
          bulges.push(0.52);
        }
      }
      this.addPolyline(pts, true, layer, color, bulges);
      if (label) {
        this.addText(label, x, y + h + 4, 9, 0, layer, color);
      }
    }

    addRect(x, y, w, h, layer = 'GEOMETRY', color = null) {
      const pts = [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h]
      ];
      this.addPolyline(pts, true, layer, color);
    }

    addSolid(p1, p2, p3, p4, layer = 'REDLINE_DIFFS', color = ACI.RED) {
      this.layers.add(layer);
      const t1 = this._coord(p1);
      const t2 = this._coord(p2);
      const t3 = this._coord(p3);
      const t4 = this._coord(p4 || p3);
      this.entities.push({
        type: 'SOLID',
        layer,
        color,
        p1: t1,
        p2: t2,
        p3: t3,
        p4: t4
      });
    }

    addText(text, x, y, height = 12, rotationDeg = 0, layer = 'TEXT', color = null) {
      if (!text || !String(text).trim()) return;
      this.layers.add(layer);
      const [px, py] = this._coord([x, y]);
      const h = height * this.scaleFactor;
      this.entities.push({
        type: 'TEXT',
        layer,
        color,
        text: sanitizeAsciiDXFText(text),
        pos: [px, py],
        height: Math.max(0.1, h),
        rotation: rotationDeg
      });
    }

    generateString() {
      const lines = [];
      const out = (code, val) => {
        lines.push(String(code).trim());
        lines.push(String(val).trim());
      };

      // 1. HEADER SECTION
      out(0, 'SECTION');
      out(2, 'HEADER');
      out(9, '$ACADVER');
      out(1, 'AC1015'); // AutoCAD 2000 standard
      out(9, '$INSUNITS');
      out(70, this.unitInfo.code);
      out(9, '$EXTMIN');
      out(10, isFinite(this.minX) ? this.minX.toFixed(6) : 0);
      out(20, isFinite(this.minY) ? this.minY.toFixed(6) : 0);
      out(30, 0);
      out(9, '$EXTMAX');
      out(10, isFinite(this.maxX) ? this.maxX.toFixed(6) : 100);
      out(20, isFinite(this.maxY) ? this.maxY.toFixed(6) : 100);
      out(30, 0);
      out(0, 'ENDSEC');

      // 2. TABLES SECTION (Layers)
      out(0, 'SECTION');
      out(2, 'TABLES');
      out(0, 'TABLE');
      out(2, 'LAYER');
      out(70, this.layers.size);

      const layerColors = {
        '0': ACI.WHITE,
        'SHEET_BORDER': ACI.CYAN,
        'GEOMETRY': ACI.WHITE,
        'TEXT': ACI.YELLOW,
        'REDLINE_DIFFS': ACI.RED,
        'REDLINE_MARKUPS': ACI.MAGENTA,
        'REDLINE_MEASUREMENTS': ACI.GREEN,
        'REDLINE_BOM': ACI.ORANGE
      };

      for (const lyr of this.layers) {
        out(0, 'LAYER');
        out(2, lyr);
        out(70, 0);
        out(62, (this.layerCustomColors && this.layerCustomColors[lyr] != null) ? this.layerCustomColors[lyr] : (layerColors[lyr] || ACI.WHITE));
        out(6, (this.layerLinetypes && this.layerLinetypes[lyr]) || 'CONTINUOUS');
      }
      out(0, 'ENDTAB');
      out(0, 'ENDSEC');

      // 3. BLOCKS SECTION
      out(0, 'SECTION');
      out(2, 'BLOCKS');
      out(0, 'ENDSEC');

      // 4. ENTITIES SECTION
      out(0, 'SECTION');
      out(2, 'ENTITIES');

      for (const ent of this.entities) {
        out(0, ent.type);
        out(8, ent.layer);
        if (ent.color != null) out(62, ent.color);

        switch (ent.type) {
          case 'LINE':
            out(10, ent.p1[0].toFixed(6));
            out(20, ent.p1[1].toFixed(6));
            out(30, 0);
            out(11, ent.p2[0].toFixed(6));
            out(21, ent.p2[1].toFixed(6));
            out(31, 0);
            break;
          case 'CIRCLE':
            out(10, ent.center[0].toFixed(6));
            out(20, ent.center[1].toFixed(6));
            out(30, 0);
            out(40, ent.radius.toFixed(6));
            break;
          case 'ARC':
            out(10, ent.center[0].toFixed(6));
            out(20, ent.center[1].toFixed(6));
            out(30, 0);
            out(40, ent.radius.toFixed(6));
            out(50, ent.startAngle.toFixed(2));
            out(51, ent.endAngle.toFixed(2));
            break;
          case 'LWPOLYLINE':
            out(90, ent.points.length);
            out(70, ent.closed ? 1 : 0);
            for (let idx = 0; idx < ent.points.length; idx++) {
              const pt = ent.points[idx];
              out(10, pt[0].toFixed(6));
              out(20, pt[1].toFixed(6));
              if (ent.bulges && ent.bulges[idx]) {
                out(42, ent.bulges[idx].toFixed(6));
              }
            }
            break;
          case 'SOLID':
            out(10, ent.p1[0].toFixed(6));
            out(20, ent.p1[1].toFixed(6));
            out(30, 0);
            out(11, ent.p2[0].toFixed(6));
            out(21, ent.p2[1].toFixed(6));
            out(31, 0);
            out(12, ent.p3[0].toFixed(6));
            out(22, ent.p3[1].toFixed(6));
            out(32, 0);
            out(13, ent.p4[0].toFixed(6));
            out(23, ent.p4[1].toFixed(6));
            out(33, 0);
            break;
          case 'TEXT':
            out(10, ent.pos[0].toFixed(6));
            out(20, ent.pos[1].toFixed(6));
            out(30, 0);
            out(40, ent.height.toFixed(6));
            out(1, ent.text);
            if (ent.rotation) out(50, ent.rotation.toFixed(2));
            break;
        }
      }

      out(0, 'ENDSEC');
      out(0, 'EOF');
      return lines.join('\r\n') + '\r\n';
    }
  }

  /**
   * PDFToDXFExporter: Extracts PDF.js vector operators, text, redline diff clouds,
   * placed measurements, leader callouts, and BOM tally badges into layered AutoCAD DXF.
   */
  async function exportPDFToDXF(page, options = {}) {
    const writer = new DXFWriter({
      unit: options.unit || 'mm',
      scale: options.scale || 1.0
    });

    const viewport = page.getViewport({ scale: 1.0 });
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;
    const imgToPdfFactor = options.imgWidth ? (pageWidth / options.imgWidth) : 1.0;
    const targetPage = options.pageNumber != null ? options.pageNumber : null;

    writer.addRect(0, 0, pageWidth, pageHeight, 'SHEET_BORDER', ACI.CYAN);

    if (options.diffRegions && options.diffRegions.length) {
      for (const r of options.diffRegions) {
        const dpiScale = r.dpi ? (72 / r.dpi) : imgToPdfFactor;
        const rx = r.x * dpiScale;
        const rw = r.w * dpiScale;
        const rh = r.h * dpiScale;
        const ry = pageHeight - (r.y * dpiScale + rh);
        const col = r.type === 'added' ? ACI.GREEN : (r.type === 'removed' ? ACI.RED : ACI.YELLOW);
        if (options.scallopedDiffs !== false) {
          writer.addRevisionCloud(rx, ry, rw, rh, `#${r.id || ''} ${(r.type || 'DIFF').toUpperCase()}`, 'REDLINE_DIFFS', col);
        } else {
          writer.addRect(rx, ry, rw, rh, 'REDLINE_DIFFS', col);
        }
      }
    }

    if (options.annotations && options.annotations.length) {
      for (const a of options.annotations) {
        if (targetPage != null && a.page != null && a.page !== targetPage) continue;
        const sc = imgToPdfFactor;
        const toPdfPt = pt => [pt.x * sc, pageHeight - pt.y * sc];
        if ((a.kind === 'dist' || a.kind === 'poly') && a.pts && a.pts.length >= 2) {
          const pts = a.pts.map(toPdfPt);
          writer.addPolyline(pts, false, 'REDLINE_MEASUREMENTS', ACI.GREEN);
          if (a.label) {
            const mid = pts[Math.floor(pts.length / 2)];
            writer.addText(a.label, mid[0], mid[1] + 4, 9, 0, 'REDLINE_MEASUREMENTS', ACI.GREEN);
          }
        } else if (a.kind === 'area' && a.pts && a.pts.length >= 3) {
          const pts = a.pts.map(toPdfPt);
          writer.addPolyline(pts, true, 'REDLINE_MEASUREMENTS', ACI.GREEN);
          if (a.label) {
            writer.addText(a.label, pts[0][0], pts[0][1] + 4, 9, 0, 'REDLINE_MEASUREMENTS', ACI.GREEN);
          }
        } else if (a.kind === 'cloud' && a.pts && a.pts.length >= 2) {
          const xs = a.pts.map(p => p.x * sc), ys = a.pts.map(p => pageHeight - p.y * sc);
          const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
          writer.addRevisionCloud(x0, y0, w, h, a.revText || 'REV', 'REDLINE_MARKUPS', ACI.MAGENTA);
        } else if (a.kind === 'leader' && a.pts && a.pts.length >= 2) {
          const p1 = toPdfPt(a.pts[0]), p2 = toPdfPt(a.pts[1]);
          writer.addLine(p1[0], p1[1], p2[0], p2[1], 'REDLINE_MARKUPS', ACI.MAGENTA);
          if (a.label) writer.addText(a.label, p2[0] + 4, p2[1], 10, 0, 'REDLINE_MARKUPS', ACI.MAGENTA);
        } else if (a.kind === 'pen' && a.pts && a.pts.length >= 2) {
          const pts = a.pts.map(toPdfPt);
          writer.addPolyline(pts, false, 'REDLINE_MARKUPS', ACI.RED);
        } else if (a.kind === 'pin') {
          const px = (a.x || 0) * sc, py = pageHeight - (a.y || 0) * sc;
          writer.addCircle(px, py, 6, 'REDLINE_MARKUPS', ACI.ORANGE);
          writer.addText(`#${a.pinNum || 1} ${a.label || 'PIN'}`, px + 8, py - 3, 9, 0, 'REDLINE_MARKUPS', ACI.ORANGE);
        } else if (a.kind === 'stamp') {
          const sx = (a.x || 50) * sc, sy = pageHeight - ((a.y || 50) * sc + 36);
          writer.addRect(sx, sy, 160, 36, 'REDLINE_MARKUPS', ACI.GREEN);
          writer.addText(`${a.stampType || 'APPROVED'} (${a.docHash || ''})`, sx + 8, sy + 12, 10, 0, 'REDLINE_MARKUPS', ACI.GREEN);
        } else if (a.t) {
          if (a.t === 'rect' || a.t === 'highlight' || a.t === 'whiteout' || a.t === 'redact') {
            writer.addRect(a.x, pageHeight - (a.y + a.h), a.w, a.h, 'REDLINE_MARKUPS', ACI.MAGENTA);
          } else if (a.t === 'circle') {
            writer.addCircle(a.x + a.w / 2, pageHeight - (a.y + a.h / 2), Math.max(a.w, a.h) / 2, 'REDLINE_MARKUPS', ACI.MAGENTA);
          } else if (a.t === 'line' || a.t === 'arrow' || a.t === 'meas' || a.t === 'leader') {
            const x1 = a.x1 != null ? a.x1 : a.x, y1 = a.y1 != null ? a.y1 : a.y;
            const lyr = a.t === 'meas' ? 'REDLINE_MEASUREMENTS' : 'REDLINE_MARKUPS';
            const col = a.t === 'meas' ? ACI.GREEN : ACI.MAGENTA;
            writer.addLine(x1, pageHeight - y1, a.x2, pageHeight - a.y2, lyr, col);
            if (a.text) writer.addText(a.text, a.x2 + 4, pageHeight - a.y2, 10, 0, lyr, col);
          } else if ((a.t === 'poly' || a.t === 'draw') && a.pts && a.pts.length >= 2) {
            writer.addPolyline(a.pts.map(p => [p[0], pageHeight - p[1]]), !!a.closed, 'REDLINE_MARKUPS', ACI.MAGENTA);
          } else if (a.t === 'cloud') {
            writer.addRevisionCloud(a.x, pageHeight - (a.y + a.h), a.w, a.h, a.revText || 'REV', 'REDLINE_MARKUPS', ACI.RED);
          } else if (a.t === 'text' && a.text) {
            writer.addText(a.text, a.x, pageHeight - (a.y + (a.size || 12)), a.size || 12, 0, 'REDLINE_MARKUPS', ACI.YELLOW);
          } else if (a.t === 'pin') {
            const px = a.x + (a.w || 24) / 2, py = pageHeight - (a.y + (a.h || 30));
            writer.addCircle(px, py, 6, 'REDLINE_MARKUPS', ACI.ORANGE);
            writer.addText(`#${a.pinNum || 1} ${a.text || 'PIN'}`, px + 8, py - 3, 9, 0, 'REDLINE_MARKUPS', ACI.ORANGE);
          } else if (a.t === 'stamp') {
            writer.addRect(a.x, pageHeight - (a.y + a.h), a.w, a.h, 'REDLINE_MARKUPS', ACI.GREEN);
            writer.addText(a.text || 'APPROVED', a.x + 6, pageHeight - (a.y + a.h * 0.65), a.fs || 14, 0, 'REDLINE_MARKUPS', ACI.GREEN);
          }
        }
      }
    }

    if (options.tallyItems && options.tallyItems.length) {
      for (const t of options.tallyItems) {
        if (targetPage != null && t.page != null && t.page !== targetPage) continue;
        const sc = imgToPdfFactor;
        const tx = t.x * sc, ty = pageHeight - t.y * sc;
        writer.addCircle(tx, ty, 8, 'REDLINE_BOM', ACI.ORANGE);
        writer.addText(`#${t.number}: ${t.label || 'BOM'}`, tx + 10, ty - 3, 9, 0, 'REDLINE_BOM', ACI.ORANGE);
      }
    }

    if (options.includeText !== false) {
      try {
        const textContent = await page.getTextContent();
        if (textContent && textContent.items) {
          for (const item of textContent.items) {
            if (!item.str || !item.str.trim()) continue;
            const tr = item.transform;
            const x = tr[4];
            const y = tr[5];
            const fontSize = Math.sqrt(tr[0] * tr[0] + tr[1] * tr[1]) || 10;
            const rotationRad = Math.atan2(tr[1], tr[0]);
            const rotationDeg = (rotationRad * 180) / Math.PI;
            writer.addText(item.str, x, y, fontSize, rotationDeg, 'TEXT', ACI.YELLOW);
          }
        }
      } catch (e) {}
    }

    try {
      const opList = await page.getOperatorList();
      const fnArray = opList.fnArray;
      const argsArray = opList.argsArray;

      const OPS = (typeof pdfjsLib !== 'undefined' && pdfjsLib.OPS) ? pdfjsLib.OPS : {
        save: 10,
        restore: 11,
        transform: 12,
        moveTo: 13,
        lineTo: 14,
        curveTo: 15,
        curveTo2: 16,
        curveTo3: 17,
        closePath: 18,
        rectangle: 19,
        stroke: 20,
        closeStroke: 21,
        fill: 22,
        eoFill: 23,
        fillStroke: 24,
        eoFillStroke: 25,
        closeFillStroke: 26,
        closeEOFillStroke: 27,
        endPath: 28,
        constructPath: 91
      };

      const ctmStack = [identityMatrix()];
      let currentCTM = identityMatrix();
      let currentPath = [];
      let currentPoint = [0, 0];

      for (let i = 0; i < fnArray.length; i++) {
        const fn = fnArray[i];
        const args = argsArray[i];

        if (fn === OPS.save) {
          ctmStack.push([...currentCTM]);
        } else if (fn === OPS.restore) {
          if (ctmStack.length > 1) {
            currentCTM = ctmStack.pop();
          }
        } else if (fn === OPS.transform) {
          const m = [args[0], args[1], args[2], args[3], args[4], args[5]];
          currentCTM = multiplyMatrix(currentCTM, m);
        } else if (fn === OPS.moveTo) {
          const pt = transformPoint(currentCTM, args[0], args[1]);
          currentPoint = pt;
          currentPath.push({ op: 'move', pt });
        } else if (fn === OPS.lineTo) {
          const pt = transformPoint(currentCTM, args[0], args[1]);
          currentPath.push({ op: 'line', pt0: currentPoint, pt1: pt });
          currentPoint = pt;
        } else if (fn === OPS.curveTo) {
          const cp1 = transformPoint(currentCTM, args[0], args[1]);
          const cp2 = transformPoint(currentCTM, args[2], args[3]);
          const endPt = transformPoint(currentCTM, args[4], args[5]);
          currentPath.push({ op: 'curve', pt0: currentPoint, cp1, cp2, endPt });
          currentPoint = endPt;
        } else if (fn === OPS.curveTo2) {
          const cp1 = currentPoint;
          const cp2 = transformPoint(currentCTM, args[0], args[1]);
          const endPt = transformPoint(currentCTM, args[2], args[3]);
          currentPath.push({ op: 'curve', pt0: currentPoint, cp1, cp2, endPt });
          currentPoint = endPt;
        } else if (fn === OPS.curveTo3) {
          const cp1 = transformPoint(currentCTM, args[0], args[1]);
          const endPt = transformPoint(currentCTM, args[2], args[3]);
          currentPath.push({ op: 'curve', pt0: currentPoint, cp1, cp2: endPt, endPt });
          currentPoint = endPt;
        } else if (fn === OPS.closePath) {
          currentPath.push({ op: 'close' });
        } else if (fn === OPS.rectangle) {
          const [rx, ry, rw, rh] = args;
          const p1 = transformPoint(currentCTM, rx, ry);
          const p2 = transformPoint(currentCTM, rx + rw, ry);
          const p3 = transformPoint(currentCTM, rx + rw, ry + rh);
          const p4 = transformPoint(currentCTM, rx, ry + rh);
          const isBorder = (Math.abs(rw - pageWidth) < 10 && Math.abs(rh - pageHeight) < 10);
          const lyr = isBorder ? 'SHEET_BORDER' : 'GEOMETRY';
          writer.addPolyline([p1, p2, p3, p4], true, lyr);
        } else if (fn === OPS.constructPath) {
          const pathOps = args[0];
          const coords = args[1];
          let coordIdx = 0;

          for (let pIdx = 0; pIdx < pathOps.length; pIdx++) {
            const pathOp = pathOps[pIdx];
            if (pathOp === OPS.moveTo) {
              const pt = transformPoint(currentCTM, coords[coordIdx], coords[coordIdx + 1]);
              coordIdx += 2;
              currentPoint = pt;
              currentPath.push({ op: 'move', pt });
            } else if (pathOp === OPS.lineTo) {
              const pt = transformPoint(currentCTM, coords[coordIdx], coords[coordIdx + 1]);
              coordIdx += 2;
              currentPath.push({ op: 'line', pt0: currentPoint, pt1: pt });
              currentPoint = pt;
            } else if (pathOp === OPS.curveTo) {
              const cp1 = transformPoint(currentCTM, coords[coordIdx], coords[coordIdx + 1]);
              const cp2 = transformPoint(currentCTM, coords[coordIdx + 2], coords[coordIdx + 3]);
              const endPt = transformPoint(currentCTM, coords[coordIdx + 4], coords[coordIdx + 5]);
              coordIdx += 6;
              currentPath.push({ op: 'curve', pt0: currentPoint, cp1, cp2, endPt });
              currentPoint = endPt;
            } else if (pathOp === OPS.curveTo2) {
              const cp1 = currentPoint;
              const cp2 = transformPoint(currentCTM, coords[coordIdx], coords[coordIdx + 1]);
              const endPt = transformPoint(currentCTM, coords[coordIdx + 2], coords[coordIdx + 3]);
              coordIdx += 4;
              currentPath.push({ op: 'curve', pt0: currentPoint, cp1, cp2, endPt });
              currentPoint = endPt;
            } else if (pathOp === OPS.curveTo3) {
              const cp1 = transformPoint(currentCTM, coords[coordIdx], coords[coordIdx + 1]);
              const endPt = transformPoint(currentCTM, coords[coordIdx + 2], coords[coordIdx + 3]);
              coordIdx += 4;
              currentPath.push({ op: 'curve', pt0: currentPoint, cp1, cp2: endPt, endPt });
              currentPoint = endPt;
            } else if (pathOp === OPS.closePath) {
              currentPath.push({ op: 'close' });
            } else if (pathOp === OPS.rectangle) {
              const rx = coords[coordIdx];
              const ry = coords[coordIdx + 1];
              const rw = coords[coordIdx + 2];
              const rh = coords[coordIdx + 3];
              coordIdx += 4;
              const p1 = transformPoint(currentCTM, rx, ry);
              const p2 = transformPoint(currentCTM, rx + rw, ry);
              const p3 = transformPoint(currentCTM, rx + rw, ry + rh);
              const p4 = transformPoint(currentCTM, rx, ry + rh);
              const isBorder = (Math.abs(rw - pageWidth) < 10 && Math.abs(rh - pageHeight) < 10);
              writer.addPolyline([p1, p2, p3, p4], true, isBorder ? 'SHEET_BORDER' : 'GEOMETRY');
            }
          }
        } else if (fn === OPS.endPath) {
          currentPath = [];
        } else if (fn === OPS.stroke || fn === OPS.closeStroke || fn === OPS.fill || fn === OPS.eoFill || fn === OPS.fillStroke || fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke) {
          if (fn === OPS.closeStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke) {
            currentPath.push({ op: 'close' });
          }
          if (currentPath.length > 0) {
            let polyline = [];
            for (const seg of currentPath) {
              if (seg.op === 'move') {
                if (polyline.length > 1) {
                  writer.addPolyline(polyline, false, 'GEOMETRY');
                }
                polyline = [seg.pt];
              } else if (seg.op === 'line') {
                if (!polyline.length) polyline.push(seg.pt0);
                polyline.push(seg.pt1);
              } else if (seg.op === 'curve') {
                const curvedPts = flattenCubicBezier(seg.pt0, seg.cp1, seg.cp2, seg.endPt, 0.5);
                if (!polyline.length) polyline.push(curvedPts[0]);
                for (let k = 1; k < curvedPts.length; k++) {
                  polyline.push(curvedPts[k]);
                }
              } else if (seg.op === 'close') {
                if (polyline.length > 2) {
                  writer.addPolyline(polyline, true, 'GEOMETRY');
                  polyline = [];
                }
              }
            }
            if (polyline.length > 1) {
              writer.addPolyline(polyline, false, 'GEOMETRY');
            }
            currentPath = [];
          }
        }
      }
    } catch (e) {}

    return writer.generateString();
  }

  /**
   * High-DPI Multilingual Canvas Sprite Generator for PDF Embedding
   * Renders at native high pixel resolution (without scaling up tiny hinted fonts) so Japanese, Chinese,
   * Korean, Tamil, Hindi, Arabic, Cyrillic, and CAD symbols have slim, razor-sharp technical strokes.
   */
  let _spriteCanvas = null;
  let _spriteCtx = null;
  function renderMultilingualTextSprite(text, fontSizePt, colorHex, widthFactor = 1.0, bold = false) {
    if (typeof document === 'undefined') return null;
    if (!_spriteCanvas) {
      _spriteCanvas = document.createElement('canvas');
      _spriteCtx = _spriteCanvas.getContext('2d');
    }
    const fsPt = Math.max(1.5, Number(fontSizePt) || 6);
    const wf = Math.max(0.35, Math.min(2.2, Number(widthFactor) || 0.88));
    // Render glyphs at native >=32px pixel height so browser font hinting never thickens/bloats stems
    const renderPx = Math.max(32, Math.min(96, Math.round(fsPt * 5.5)));
    const pxToPt = fsPt / renderPx;
    const fontStr = `${bold ? '600 ' : '400 '}${renderPx}px ${MULTILINGUAL_FONT_STACK}`;
    _spriteCtx.font = fontStr;
    const rawW = Math.max(4, _spriteCtx.measureText(text).width);
    const padX = renderPx * 0.14;
    const canvasW = Math.max(12, Math.ceil(rawW * wf + padX * 2));
    const canvasH = Math.max(12, Math.ceil(renderPx * 1.36));

    _spriteCanvas.width = canvasW;
    _spriteCanvas.height = canvasH;
    const ctx = _spriteCtx;
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.save();
    ctx.scale(wf, 1);
    ctx.font = fontStr;
    ctx.fillStyle = colorHex || '#0f172a';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(text, padX / wf, renderPx * 1.02);
    ctx.restore();

    const dataUrl = _spriteCanvas.toDataURL('image/png');
    const b64 = dataUrl.split(',')[1] || '';
    const bin = atob(b64);
    const pngBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) pngBytes[i] = bin.charCodeAt(i);
    return {
      pngBytes,
      wPt: canvasW * pxToPt,
      hPt: canvasH * pxToPt,
      textWidthPt: (rawW * wf) * pxToPt,
      baselineOffsetPt: (renderPx * 0.34) * pxToPt
    };
  }

  // Native AutoCAD Binary DXF parser (22-byte "AutoCAD Binary DXF\r\n\x1a\x00" sentinel)
  function parseBinaryDXFPairs(rawBytes) {
    const u8 = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes || []);
    if (u8.length < 24) return [];
    const sentinel = 'AutoCAD Binary DXF';
    for (let i = 0; i < sentinel.length; i++) {
      if (u8[i] !== sentinel.charCodeAt(i)) return [];
    }
    let pos = 22;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const dec = new TextDecoder('utf-8', { fatal: false });
    const pairs = [];
    const isOld1ByteCode = (pos + 1 < u8.length && u8[pos] === 0 && u8[pos + 1] !== 0);

    const readNullStr = () => {
      const start = pos;
      while (pos < u8.length && u8[pos] !== 0) pos++;
      const str = dec.decode(u8.subarray(start, pos));
      if (pos < u8.length && u8[pos] === 0) pos++;
      return str;
    };

    while (pos < u8.length) {
      let code;
      if (isOld1ByteCode) {
        code = u8[pos++];
        if (code === 255 && pos + 2 <= u8.length) {
          code = dv.getInt16(pos, true);
          pos += 2;
        }
      } else {
        if (pos + 2 > u8.length) break;
        code = dv.getInt16(pos, true);
        pos += 2;
      }

      let val = '';
      if (
        (code >= 0 && code <= 9) ||
        (code >= 100 && code <= 105) ||
        (code >= 300 && code <= 309) ||
        (code >= 320 && code <= 369) ||
        (code >= 390 && code <= 399) ||
        (code >= 410 && code <= 419) ||
        (code >= 430 && code <= 439) ||
        (code >= 470 && code <= 479) ||
        (code >= 480 && code <= 481) ||
        code === 999 ||
        (code >= 1000 && code <= 1009)
      ) {
        val = readNullStr();
      } else if (
        (code >= 10 && code <= 59) ||
        (code >= 110 && code <= 149) ||
        (code >= 210 && code <= 239) ||
        (code >= 460 && code <= 469) ||
        (code >= 1010 && code <= 1059)
      ) {
        if (pos + 8 > u8.length) break;
        val = String(dv.getFloat64(pos, true));
        pos += 8;
      } else if (
        (code >= 60 && code <= 79) ||
        (code >= 170 && code <= 179) ||
        (code >= 270 && code <= 289) ||
        (code >= 370 && code <= 389) ||
        (code >= 400 && code <= 409) ||
        code === 1060 || (code >= 1061 && code <= 1070)
      ) {
        if (pos + 2 > u8.length) break;
        val = String(dv.getInt16(pos, true));
        pos += 2;
      } else if (code >= 290 && code <= 299) {
        if (pos + 1 > u8.length) break;
        val = String(u8[pos++]);
      } else if (
        (code >= 90 && code <= 99) ||
        (code >= 420 && code <= 429) ||
        (code >= 440 && code <= 459) ||
        code === 1071
      ) {
        if (pos + 4 > u8.length) break;
        val = String(dv.getInt32(pos, true));
        pos += 4;
      } else if (code >= 160 && code <= 169) {
        if (pos + 8 > u8.length) break;
        const lo = dv.getUint32(pos, true);
        const hi = dv.getInt32(pos + 4, true);
        val = String(hi * 4294967296 + lo);
        pos += 8;
      } else if (code >= 310 && code <= 319) {
        if (pos + 1 > u8.length) break;
        const nBytes = u8[pos++];
        const slice = u8.subarray(pos, Math.min(u8.length, pos + nBytes));
        pos += nBytes;
        val = Array.from(slice, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      } else {
        val = readNullStr();
      }
      pairs.push({ code, val: val.trim() });
      if (code === 0 && val.trim().toUpperCase() === 'EOF') break;
    }
    return pairs;
  }

  function isAutoCADFileName(name = '') {
    return /\.(dxf|dwg)$/i.test(String(name || '').trim());
  }

  // Extract MTEXT inline height (\H2.5; or \H0.8x;) and width factor (\W0.8;) overrides before stripping
  function extractMTextFormatting(rawStr, baseHeight, baseWf = 0.86) {
    let h = baseHeight > 0 ? baseHeight : 0;
    let wf = baseWf;
    if (!rawStr) return { height: h, widthFactor: wf };
    const s = String(rawStr);
    // Only apply leading / top-level height override so small stacked-fraction or sub-note overrides do not distort overall height
    const hm = /^(?:\s|\{|\\[A-Za-z][^;]*;)*\\H([0-9]*\.?[0-9]+)(x?);/i.exec(s);
    if (hm) {
      const val = parseFloat(hm[1]);
      if (Number.isFinite(val) && val > 0) {
        if (hm[2] && hm[2].toLowerCase() === 'x') {
          if (h > 0) h *= Math.max(0.25, Math.min(4.0, val));
        } else {
          h = val;
        }
      }
    }
    const wm = /\\W([0-9]*\.?[0-9]+)(x?);/i.exec(s);
    if (wm) {
      const val = parseFloat(wm[1]);
      if (Number.isFinite(val) && val > 0.2 && val < 3.0) {
        wf = val;
      }
    }
    return { height: h, widthFactor: wf };
  }

  // Word-wrap MTEXT lines when reference rectangle width (boxWidth, code 41) is specified
  function wrapMTextLines(text, boxWidthWorld, charHeightWorld, widthFactor = 0.86) {
    const rawLines = String(text || '').split('\n');
    if (!(boxWidthWorld > 0) || !(charHeightWorld > 0)) return rawLines;
    const avgCharW = Math.max(1e-4, charHeightWorld * 0.56 * (widthFactor || 0.86));
    const maxChars = Math.max(6, Math.floor(boxWidthWorld / avgCharW));
    const wrapped = [];
    for (const ln of rawLines) {
      if (!ln || ln.length <= maxChars) {
        wrapped.push(ln);
        continue;
      }
      const words = ln.split(/(\s+)/);
      let cur = '';
      for (const w of words) {
        if ((cur + w).length > maxChars && cur.trim().length > 0) {
          wrapped.push(cur.trimEnd());
          cur = w.trimStart();
        } else {
          cur += w;
        }
      }
      if (cur) wrapped.push(cur);
    }
    return wrapped;
  }

  /**
   * DXFParser: Industrial Client-Side ASCII / UTF-8 / CJK DXF Parser
   */
  /* ============================================================================
   * [MODULE SECTION: AUTOCAD DXF PARSER & 2D CANVAS / VECTOR PDF RENDERER]
   * WHAT THIS IS: Parses ASCII/Binary DXF files (HEADERS, TABLES, BLOCKS, ENTITIES)
   *   and renders them directly onto HTML5 Canvas (`renderToCanvas`) or Vector PDF.
   * WHY / HOW TO EDIT: Edit `_parseEntitiesSection()` to parse additional DXF group
   *   codes, or `renderToCanvas()` to customize entity stroke/fill styling.
   * ============================================================================ */
  class DXFParser {
    constructor(dxfContent) {
      if (typeof dxfContent === 'string') {
        this.content = dxfContent;
      } else {
        const u8 = dxfContent instanceof Uint8Array ? dxfContent : (dxfContent instanceof ArrayBuffer ? new Uint8Array(dxfContent) : null);
        const isBin = u8 && u8.length >= 24 && String.fromCharCode(...u8.subarray(0, 18)) === 'AutoCAD Binary DXF';
        this.content = isBin ? u8 : decodeDXFBytes(dxfContent);
      }
      this.entities = [];
      this.header = {};
      this.layers = {}; // layerName -> { name, color, linetype, lineweight, visible, count }
      this.styles = {}; // styleName -> { name, fixedHeight, widthFactor }
      this.blocks = {}; // blockName -> { name, baseX, baseY, entities: [] }
      this.insunitsCode = 4; // Default mm
      this.unitName = 'mm';
      this._mutationRev = 1;
      this._primCountCache = 0;
      this.bounds = {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
      };
    }

    _updateBounds(x, y) {
      if (!isFinite(x) || !isFinite(y)) return;
      // Ignore AutoCAD uninitialized sentinel extents (e.g. 1E+20 / -1E+20)
      if (Math.abs(x) > 1e11 || Math.abs(y) > 1e11) return;
      if (x < this.bounds.minX) this.bounds.minX = x;
      if (x > this.bounds.maxX) this.bounds.maxX = x;
      if (y < this.bounds.minY) this.bounds.minY = y;
      if (y > this.bounds.maxY) this.bounds.maxY = y;
    }

    _getBlock(name) {
      if (!name || !this.blocks) return null;
      if (this.blocks[name]) return this.blocks[name];
      const s = String(name).trim();
      return this.blocks[s] || this.blocks[s.toUpperCase()] || this.blocks[s.toLowerCase()] || null;
    }

    _updateArcBounds(cx, cy, r, startAngle, endAngle, mapFn = null) {
      if (!isFinite(cx) || !isFinite(cy) || !(r > 0)) return;
      if (!mapFn) {
        const bb = computeExactArcBBox(cx, cy, r, startAngle, endAngle);
        this._updateBounds(bb.minX, bb.minY);
        this._updateBounds(bb.maxX, bb.maxY);
        return;
      }
      const sAng = startAngle || 0;
      let eAng = endAngle != null ? endAngle : 360;
      if (eAng <= sAng) eAng += 360;
      const sweep = eAng - sAng;
      const steps = Math.max(6, Math.min(24, Math.ceil(sweep / 15)));
      for (let s = 0; s <= steps; s++) {
        const rad = ((sAng + (sweep * s) / steps) * Math.PI) / 180;
        const [wx, wy] = mapFn(cx + r * Math.cos(rad), cy + r * Math.sin(rad));
        this._updateBounds(wx, wy);
      }
    }

    _ensureLayer(name, color = 7, linetype = 'CONTINUOUS', visible = true, lineweight = -3, flags = 0, trueColor = null) {
      const lyr = name || '0';
      if (!this.layers[lyr]) {
        const isDefpoints = /^defpoints$/i.test(lyr.trim());
        const frozen = (flags & 1) !== 0;
        const locked = (flags & 4) !== 0;
        const customHex = (trueColor != null && trueColor > 0)
          ? ('#' + (trueColor & 0xFFFFFF).toString(16).padStart(6, '0'))
          : null;
        this.layers[lyr] = {
          name: lyr,
          color: Math.abs(color || 7) || 7,
          trueColor: trueColor || null,
          customHex,
          linetype: linetype || 'CONTINUOUS',
          lineweight: lineweight != null ? lineweight : -3,
          visible: !isDefpoints && color >= 0 && visible !== false && !frozen,
          frozen,
          locked,
          flags: flags || 0,
          opacity: 100,
          count: 0
        };
      }
      return this.layers[lyr];
    }

    _isNonPlottingLayer(layerName) {
      if (!layerName) return false;
      const s = String(layerName).trim();
      if (/^(defpoints|viewport|ashade)$/i.test(s)) return true;
      const lyr = this.layers[s];
      return !!(lyr && (lyr.visible === false || lyr.frozen === true));
    }

    _parseHatchEntity(pairs, startIdx, endIdx, entData, updateGlobalBounds = true) {
      const segments = [];
      let j = startIdx;
      let currentPathFlags = 0;
      while (j < endIdx) {
        const { code, val } = pairs[j];
        if (code === 92) {
          currentPathFlags = parseInt(val, 10) || 0;
          j++;
          continue;
        }
        if (code === 93) {
          const numEdges = parseInt(val, 10) || 0;
          const isPolylinePath = (currentPathFlags & 2) !== 0;
          j++;
          const loopPts = [];
          let curPt = null;
          let polyClosed = true;
          let edgeMode = 0; // 1=line, 2=circular arc
          let eX1 = null, eY1 = null, eX2 = null, eY2 = null, eR = null, eA1 = 0, eA2 = 360, eCCW = 1;
          const flushEdge = () => {
            if (edgeMode === 1 && eX1 != null && eY1 != null && eX2 != null && eY2 != null) {
              segments.push([[eX1, eY1], [eX2, eY2]]);
            } else if (edgeMode === 2 && eX1 != null && eY1 != null && eR > 0) {
              const arcLoop = [];
              let sA = eA1 || 0, endA = eA2 != null ? eA2 : 360;
              if (!eCCW) { sA = 360 - sA; endA = 360 - endA; }
              if (endA <= sA) endA += 360;
              const sweep = endA - sA;
              const steps = Math.max(8, Math.min(36, Math.ceil(sweep / 8)));
              for (let s = 0; s <= steps; s++) {
                const rad = ((sA + (sweep * s) / steps) * Math.PI) / 180;
                arcLoop.push([eX1 + eR * Math.cos(rad), eY1 + eR * Math.sin(rad)]);
              }
              if (arcLoop.length >= 2) segments.push(arcLoop);
            }
            eX1 = eY1 = eX2 = eY2 = eR = null;
            eA1 = 0; eA2 = 360; eCCW = 1;
          };
          while (j < endIdx && pairs[j].code !== 97 && pairs[j].code !== 92 && pairs[j].code !== 75 && pairs[j].code !== 98) {
            const c = pairs[j].code;
            const v = pairs[j].val;
            if (isPolylinePath) {
              if (c === 73) polyClosed = (parseInt(v, 10) || 0) !== 0;
              else if (c === 10) {
                if (curPt) loopPts.push(curPt);
                curPt = [parseFloat(v) || 0, 0, 0];
              } else if (c === 20 && curPt) {
                curPt[1] = parseFloat(v) || 0;
              } else if (c === 42 && curPt) {
                curPt[2] = parseFloat(v) || 0;
              }
            } else {
              if (c === 72) {
                flushEdge();
                const gv = parseInt(v, 10) || 0;
                edgeMode = (gv >= 1 && gv <= 4) ? gv : 0;
              } else if (c === 10) {
                const num = parseFloat(v);
                if (edgeMode === 1 && eX1 != null && eY1 != null && eX2 != null && eY2 != null) flushEdge();
                if (edgeMode === 2 && eX1 != null && eY1 != null && eR > 0) flushEdge();
                if (edgeMode >= 1) eX1 = num;
                else {
                  if (curPt) loopPts.push(curPt);
                  curPt = [num, 0, 0];
                }
              } else if (c === 20) {
                const num = parseFloat(v);
                if (edgeMode >= 1) eY1 = num;
                else if (curPt) curPt[1] = num;
              } else if (c === 11) eX2 = parseFloat(v);
              else if (c === 21) eY2 = parseFloat(v);
              else if (c === 40 && edgeMode === 2) eR = parseFloat(v);
              else if (c === 50 && edgeMode === 2) eA1 = parseFloat(v) || 0;
              else if (c === 51 && edgeMode === 2) eA2 = parseFloat(v) || 360;
              else if (c === 73 && edgeMode === 2) eCCW = parseInt(v, 10) || 0;
            }
            j++;
          }
          flushEdge();
          if (curPt) loopPts.push(curPt);
          if (loopPts.length > 1 && (numEdges >= 2 || isPolylinePath)) {
            const tessLoop = [];
            const n = loopPts.length;
            for (let k = 0; k < n; k++) {
              const p1 = loopPts[k];
              tessLoop.push([p1[0], p1[1]]);
              if (p1[2] && Math.abs(p1[2]) > 1e-6 && (k < n - 1 || polyClosed)) {
                const p2 = loopPts[(k + 1) % n];
                const arcPts = tessellateBulgeSegment([p1[0], p1[1]], [p2[0], p2[1]], p1[2]);
                for (let a = 0; a < arcPts.length - 1; a++) tessLoop.push(arcPts[a]);
              }
            }
            if (polyClosed && tessLoop.length >= 2) {
              const first = tessLoop[0], last = tessLoop[tessLoop.length - 1];
              if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 1e-5) {
                tessLoop.push([first[0], first[1]]);
              }
            }
            segments.push(tessLoop);
          }
          continue;
        }
        j++;
      }
      if (!segments.length) return null;
      const lyrInfo = this._ensureLayer(entData.layer);
      if (updateGlobalBounds) {
        lyrInfo.count++;
        if (!this._isNonPlottingLayer(entData.layer)) {
          for (const lp of segments) {
            for (const pt of lp) this._updateBounds(pt[0], pt[1]);
          }
        }
      }
      return {
        type: 'HATCH',
        space: entData.space,
        layer: entData.layer,
        color: entData.color,
        trueColor: entData.trueColor,
        linetype: entData.linetype,
        lineweight: entData.lineweight,
        solid: (entData.flags & 1) === 1,
        loops: segments,
        points: segments[0] ? segments[0].map(p => [p[0], p[1]]) : []
      };
    }

    _parseEntityRecord(rawEntType, pairs, startIdx, endIdx, updateGlobalBounds = true) {
      const entType = String(rawEntType || '').trim().toUpperCase();
      if (entType === 'VIEWPORT' || entType === '3DSOLID' || entType === 'BODY' || entType === 'REGION') return null;
      // Skip ATTDEF inside BLOCK definitions (where updateGlobalBounds is false), but allow visible ATTDEF in Model Space
      if (entType === 'ATTDEF' && !updateGlobalBounds) return null;

      const entData = {
        type: entType,
        layer: '0',
        textStyle: 'STANDARD',
        space: 0, // 0 = Model Space, 1 = Paper Space (code 67)
        color: null, // null means BYLAYER (256)
        trueColor: null,
        linetype: null,
        lineweight: null,
        extrusionZ: 1,
        elevation: 0,
        thickness: 0,
        x: 0,
        y: 0,
        z: 0,
        x2: 0,
        y2: 0,
        z2: 0,
        z3: 0,
        z4: 0,
        hasSecondPt: false,
        x3: 0,
        y3: 0,
        x4: 0,
        y4: 0,
        hasDefPt13: false,
        hasDefPt14: false,
        hasDefPts: false,
        radiusOrHeight: 0,
        ratio: 1,
        startAngle: 0,
        endAngle: 360,
        ellipseStartParam: 0,
        ellipseEndParam: Math.PI * 2,
        rotation: 0,
        hasExplicitRot: false,
        scaleX: 1,
        scaleY: 1,
        hasCode41: false,
        code41Val: 1,
        code42Val: 0,
        constantWidth: 0,
        lineSpacing: 1.25,
        flags: 0,
        hAlign: 0, // code 72 on TEXT
        vAlign: 0, // code 73 on TEXT
        attachmentPoint: 1, // code 71 on MTEXT (1..9)
        text: '',
        blockName: ''
      };

      const lwVertices = []; // [{ x, y, bulge }]
      const splinePts = [];
      const splineFitPts = [];
      const mlinePts = [];
      let curLwVtx = null;
      let curSplineX = null;
      let curSplineFitX = null;
      let curMlineX = null;
      const isPolyLike = (entType === 'LWPOLYLINE' || entType === 'LEADER' || entType === 'MLEADER');

      for (let j = startIdx; j < endIdx; j++) {
        const { code, val } = pairs[j];
        if (code === 8) entData.layer = val || '0';
        else if (code === 7) entData.textStyle = val || 'STANDARD';
        else if (code === 67) entData.space = parseInt(val, 10) || 0;
        else if (code === 6) entData.linetype = val;
        else if (code === 62) entData.color = parseInt(val, 10);
        else if (code === 370) entData.lineweight = parseInt(val, 10);
        else if (code === 420) entData.trueColor = parseInt(val, 10);
        else if (code === 230) {
          const ez = parseFloat(val);
          if (Number.isFinite(ez) && Math.abs(ez) > 1e-4) entData.extrusionZ = ez;
        }
        else if (code === 2 && (entType === 'INSERT' || entType === 'DIMENSION')) entData.blockName = val;
        else if (code === 10) {
          const num = parseFloat(val);
          if (!Number.isFinite(num)) continue;
          if (isPolyLike) {
            if (curLwVtx) lwVertices.push(curLwVtx);
            curLwVtx = { x: num, y: 0, bulge: 0 };
          } else if (entType === 'SPLINE' || entType === 'HELIX') {
            curSplineX = num;
          } else {
            entData.x = num;
          }
        } else if (code === 20) {
          const num = parseFloat(val);
          if (!Number.isFinite(num)) continue;
          if (isPolyLike && curLwVtx) {
            curLwVtx.y = num;
          } else if ((entType === 'SPLINE' || entType === 'HELIX') && curSplineX != null) {
            splinePts.push([curSplineX, num]);
            curSplineX = null;
          } else {
            entData.y = num;
          }
        } else if (code === 42) {
          const num = parseFloat(val);
          if (Number.isFinite(num)) {
            entData.code42Val = num;
            if (isPolyLike && curLwVtx) curLwVtx.bulge = num;
            else if (entType === 'INSERT' && num !== 0) entData.scaleY = num;
            else if (entType === 'ELLIPSE') entData.ellipseEndParam = num;
          }
        } else if (code === 43 && entType === 'LWPOLYLINE') {
          const num = parseFloat(val);
          if (Number.isFinite(num) && num >= 0) entData.constantWidth = num;
        } else if (code === 11) {
          const num = parseFloat(val);
          if (!Number.isFinite(num)) continue;
          if (entType === 'SPLINE' || entType === 'HELIX') curSplineFitX = num;
          else if (entType === 'MLINE') curMlineX = num;
          else { entData.x2 = num; entData.hasSecondPt = true; }
        } else if (code === 21) {
          const num = parseFloat(val);
          if (!Number.isFinite(num)) continue;
          if ((entType === 'SPLINE' || entType === 'HELIX') && curSplineFitX != null) {
            splineFitPts.push([curSplineFitX, num]);
            curSplineFitX = null;
          } else if (entType === 'MLINE' && curMlineX != null) {
            mlinePts.push([curMlineX, num]);
            curMlineX = null;
          } else { entData.y2 = num; entData.hasSecondPt = true; }
        } else if (code === 30) { const n = parseFloat(val); if (Number.isFinite(n)) entData.z = n; }
        else if (code === 31) { const n = parseFloat(val); if (Number.isFinite(n)) entData.z2 = n; }
        else if (code === 32) { const n = parseFloat(val); if (Number.isFinite(n)) entData.z3 = n; }
        else if (code === 33) { const n = parseFloat(val); if (Number.isFinite(n)) entData.z4 = n; }
        else if (code === 38) { const n = parseFloat(val); if (Number.isFinite(n)) entData.elevation = n; }
        else if (code === 39) { const n = parseFloat(val); if (Number.isFinite(n)) entData.thickness = n; }
        else if (code === 12) { const n = parseFloat(val); if (Number.isFinite(n)) entData.x3 = n; }
        else if (code === 22) { const n = parseFloat(val); if (Number.isFinite(n)) entData.y3 = n; }
        else if (code === 13) { const n = parseFloat(val); if (Number.isFinite(n)) { entData.x4 = n; entData.hasDefPt13 = true; entData.hasDefPts = true; } }
        else if (code === 23) { const n = parseFloat(val); if (Number.isFinite(n)) { entData.y4 = n; entData.hasDefPt13 = true; entData.hasDefPts = true; } }
        else if (code === 14 && entType === 'DIMENSION') { const n = parseFloat(val); if (Number.isFinite(n)) { entData.x3 = n; entData.hasDefPt14 = true; entData.hasDefPts = true; } }
        else if (code === 24 && entType === 'DIMENSION') { const n = parseFloat(val); if (Number.isFinite(n)) { entData.y3 = n; entData.hasDefPt14 = true; entData.hasDefPts = true; } }
        else if (code === 15 && entType === 'DIMENSION') { const n = parseFloat(val); if (Number.isFinite(n)) { entData.x5 = n; entData.hasDefPt15 = true; } }
        else if (code === 25 && entType === 'DIMENSION') { const n = parseFloat(val); if (Number.isFinite(n)) { entData.y5 = n; entData.hasDefPt15 = true; } }
        else if (code === 40) { const n = parseFloat(val); if (Number.isFinite(n)) entData.radiusOrHeight = n; }
        else if (code === 41) {
          const num = parseFloat(val);
          if (Number.isFinite(num)) {
            if (entType === 'ELLIPSE') {
              entData.ellipseStartParam = num;
            } else if (num !== 0) {
              entData.scaleX = num;
              entData.hasCode41 = true;
              entData.code41Val = num;
            }
          }
        } else if (code === 44 && entType === 'MTEXT') {
          const ls = parseFloat(val);
          if (ls > 0.4 && ls < 4) entData.lineSpacing = ls * 1.2;
        } else if (code === 50) {
          const ang = parseFloat(val) || 0;
          entData.startAngle = ang;
          entData.rotation = ang;
          entData.hasExplicitRot = true;
        } else if (code === 51) entData.endAngle = parseFloat(val) || 360;
        else if (code === 70) entData.flags = parseInt(val, 10) || 0;
        else if (code === 71) entData.attachmentPoint = parseInt(val, 10) || 1;
        else if (code === 72) entData.hAlign = parseInt(val, 10) || 0;
        else if (code === 73) entData.vAlign = parseInt(val, 10) || 0;
        else if (code === 1 || (code === 3 && (entType === 'MTEXT' || entType === 'MLEADER')) || (code === 304 && entType === 'MLEADER')) {
          entData.text = (entData.text ? entData.text + '' : '') + val;
        }
      }
      if (curLwVtx) lwVertices.push(curLwVtx);

      // Skip invisible ATTRIB / ATTDEF entities (group code 70 bit 1 = invisible)
      if ((entType === 'ATTRIB' || entType === 'ATTDEF') && (entData.flags & 1) === 1) return null;

      if (entType === 'HATCH') {
        return this._parseHatchEntity(pairs, startIdx, endIdx, entData, updateGlobalBounds);
      }

      const flipX = entData.extrusionZ < -0.5 ? -1 : 1;
      const bound = (x, y) => { if (updateGlobalBounds && !this._isNonPlottingLayer(entData.layer)) this._updateBounds(x, y); };
      const lyrInfo = this._ensureLayer(entData.layer);
      if (updateGlobalBounds) lyrInfo.count++;

      if (entType === 'LINE' || entType === 'RAY' || entType === 'XLINE') {
        let x1 = entData.x * flipX, y1 = entData.y;
        let x2 = entData.x2 * flipX, y2 = entData.y2;
        if (entType === 'RAY' || entType === 'XLINE') {
          // For RAY / XLINE, (11, 21) is a direction vector from base point (10, 20)
          const dLen = Math.hypot(entData.x2, entData.y2) || 1;
          const span = 100;
          x2 = x1 + (entData.x2 / dLen) * span;
          y2 = y1 + (entData.y2 / dLen) * span;
          if (entType === 'XLINE') {
            x1 = x1 - (entData.x2 / dLen) * span;
            y1 = y1 - (entData.y2 / dLen) * span;
          }
        }
        if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
          if (entType === 'LINE') {
            bound(x1, y1);
            bound(x2, y2);
          }
          return {
            type: 'LINE',
            space: entData.space,
            layer: entData.layer,
            color: entData.color,
            trueColor: entData.trueColor,
            linetype: entData.linetype,
            lineweight: entData.lineweight,
            x1,
            y1,
            z1: entData.z || entData.elevation || 0,
            x2,
            y2,
            z2: entData.z2 || entData.z || entData.elevation || 0,
            elevation: entData.elevation || entData.z || 0,
            thickness: entData.thickness || 0
          };
        }
      } else if (entType === 'CIRCLE') {
        const cx = entData.x * flipX, cy = entData.y;
        const r = Math.abs(entData.radiusOrHeight) || 1;
        bound(cx - r, cy - r);
        bound(cx + r, cy + r);
        return {
          type: 'CIRCLE',
          space: entData.space,
          layer: entData.layer,
          color: entData.color,
          trueColor: entData.trueColor,
          linetype: entData.linetype,
          lineweight: entData.lineweight,
          cx,
          cy,
          z: entData.z || entData.elevation || 0,
          elevation: entData.elevation || entData.z || 0,
          thickness: entData.thickness || 0,
          r
        };
      } else if (entType === 'ARC') {
        const cx = entData.x * flipX, cy = entData.y;
        const r = Math.abs(entData.radiusOrHeight) || 1;
        let sAng = entData.startAngle || 0;
        let eAng = entData.endAngle != null ? entData.endAngle : 360;
        if (flipX < 0) {
          const newS = (180 - eAng + 720) % 360;
          const newE = (180 - sAng + 720) % 360;
          sAng = newS;
          eAng = newE;
        }
        if (updateGlobalBounds && !this._isNonPlottingLayer(entData.layer)) {
          this._updateArcBounds(cx, cy, r, sAng, eAng);
        }
        return {
          type: 'ARC',
          space: entData.space,
          layer: entData.layer,
          color: entData.color,
          trueColor: entData.trueColor,
          linetype: entData.linetype,
          lineweight: entData.lineweight,
          cx,
          cy,
          r,
          startAngle: sAng,
          endAngle: eAng
        };
      } else if (entType === 'ELLIPSE') {
        const cx = entData.x, cy = entData.y;
        const mx = (entData.x2 || 10) * flipX, my = entData.y2 || 0;
        const majorR = Math.hypot(mx, my) || 10;
        const ratio = Math.max(0.01, Math.min(10, Math.abs(entData.radiusOrHeight) || 0.5));
        const minorR = majorR * ratio;
        const rot = Math.atan2(my, mx);
        bound(cx - majorR, cy - majorR);
        bound(cx + majorR, cy + majorR);
        return {
          type: 'ELLIPSE',
          space: entData.space,
          layer: entData.layer,
          color: entData.color,
          trueColor: entData.trueColor,
          linetype: entData.linetype,
          lineweight: entData.lineweight,
          cx,
          cy,
          mx,
          my,
          ratio,
          rx: majorR,
          ry: minorR,
          startParam: entData.ellipseStartParam ?? 0,
          endParam: entData.ellipseEndParam ?? (Math.PI * 2),
          rotation: rot
        };
      } else if (entType === 'MLINE' && mlinePts.length > 1) {
        mlinePts.forEach(pt => bound(pt[0], pt[1]));
        return {
          type: 'LWPOLYLINE',
          space: entData.space,
          layer: entData.layer,
          color: entData.color,
          trueColor: entData.trueColor,
          linetype: entData.linetype,
          lineweight: entData.lineweight,
          closed: (entData.flags & 2) !== 0,
          points: mlinePts.map(p => [p[0], p[1], 0])
        };
      } else if (isPolyLike && lwVertices.length > 1) {
        const closed = entType === 'LWPOLYLINE' && (entData.flags & 1) === 1;
        const ctrlPts = [];
        const renderPts = [];
        let hasAnyBulge = false;
        for (let idx = 0; idx < lwVertices.length; idx++) {
          const v1 = lwVertices[idx];
          const vx1 = v1.x * flipX, vy1 = v1.y, vBulge = (v1.bulge || 0) * flipX;
          ctrlPts.push([vx1, vy1, vBulge]);
          renderPts.push([vx1, vy1]);
          bound(vx1, vy1);
          if (Math.abs(vBulge) > 1e-6 && (idx < lwVertices.length - 1 || closed)) {
            hasAnyBulge = true;
            const v2 = lwVertices[(idx + 1) % lwVertices.length];
            const arcPts = tessellateBulgeSegment([vx1, vy1], [v2.x * flipX, v2.y], vBulge);
            for (let k = 0; k < arcPts.length - 1; k++) {
              renderPts.push(arcPts[k]);
              bound(arcPts[k][0], arcPts[k][1]);
            }
          }
        }
        return {
          type: 'LWPOLYLINE',
          isLeader: entType === 'LEADER' || entType === 'MLEADER',
          space: entData.space,
          layer: entData.layer,
          color: entData.color,
          trueColor: entData.trueColor,
          linetype: entData.linetype,
          lineweight: entData.lineweight,
          closed,
          elevation: entData.elevation || entData.z || 0,
          thickness: entData.thickness || 0,
          points: ctrlPts,
          ctrlPoints: ctrlPts,
          renderPoints: hasAnyBulge ? renderPts : ctrlPts
        };
      } else if ((entType === 'SPLINE' || entType === 'HELIX') && (splinePts.length > 1 || splineFitPts.length > 1)) {
        const isFit = splineFitPts.length > 1;
        const usePts = isFit ? splineFitPts : splinePts;
        const smoothPts = computeSplinePoints(usePts, isFit);
        usePts.forEach(pt => bound(pt[0], pt[1]));
        return {
          type: 'LWPOLYLINE',
          isSpline: true,
          _isFitSpline: isFit,
          space: entData.space,
          layer: entData.layer,
          color: entData.color,
          trueColor: entData.trueColor,
          linetype: entData.linetype,
          lineweight: entData.lineweight,
          closed: (entData.flags & 1) === 1,
          points: usePts,
          renderPoints: smoothPts
        };
      } else if (entType === 'SOLID' || entType === 'TRACE' || entType === '3DFACE' || entType === 'WIPEOUT') {
        const p4x = entData.hasDefPt13 ? entData.x4 : entData.x3;
        const p4y = entData.hasDefPt13 ? entData.y4 : entData.y3;
        const pts = (entType === '3DFACE')
          ? [[entData.x, entData.y], [entData.x2, entData.y2], [entData.x3, entData.y3], [p4x, p4y]]
          : [[entData.x, entData.y], [entData.x2, entData.y2], [p4x, p4y], [entData.x3, entData.y3]];
        pts.forEach(pt => bound(pt[0], pt[1]));
        if (entType === '3DFACE') {
          const p4z = entData.hasDefPt13 ? entData.z4 : entData.z3;
          return {
            type: 'LWPOLYLINE',
            is3DFace: true,
            space: entData.space,
            layer: entData.layer,
            color: entData.color,
            trueColor: entData.trueColor,
            closed: true,
            elevation: entData.z || 0,
            thickness: entData.thickness || 0,
            points: pts,
            points3D: [
              [entData.x, entData.y, entData.z || 0],
              [entData.x2, entData.y2, entData.z2 || 0],
              [entData.x3, entData.y3, entData.z3 || 0],
              [p4x, p4y, p4z || 0]
            ]
          };
        }
        return {
          type: 'SOLID',
          space: entData.space,
          layer: entData.layer,
          color: entData.color,
          trueColor: entData.trueColor,
          points: pts
        };
      } else if (entType === 'POINT') {
        if (/^defpoints$/i.test(entData.layer)) return null;
        bound(entData.x, entData.y);
        return {
          type: 'POINT',
          space: entData.space,
          layer: entData.layer,
          color: entData.color,
          x: entData.x,
          y: entData.y
        };
      } else if (entType === 'INSERT' && entData.blockName) {
        return {
          type: 'INSERT',
          space: entData.space,
          layer: entData.layer,
          color: entData.color,
          trueColor: entData.trueColor,
          blockName: entData.blockName,
          x: entData.x * flipX,
          y: entData.y,
          scaleX: (entData.scaleX || 1) * flipX,
          scaleY: entData.scaleY || 1,
          rotation: entData.rotation || 0
        };
      } else if (entType === 'DIMENSION') {
        let dimTxt = cleanDXFText(entData.text);
        const fmtDimNum = v => Number(Number(v).toFixed(6)).toString();
        if ((!dimTxt || dimTxt === '<>') && entData.code42Val > 0) {
          dimTxt = fmtDimNum(entData.code42Val);
        } else if (dimTxt && dimTxt.includes('<>') && entData.code42Val > 0) {
          dimTxt = dimTxt.replace(/<>/g, fmtDimNum(entData.code42Val));
        }
        if ((!dimTxt || dimTxt === '<>') && entData.blockName) {
          const dBlk = this._getBlock(entData.blockName);
          if (dBlk && Array.isArray(dBlk.entities)) {
            const tSub = dBlk.entities.find(se => se && se.type === 'TEXT' && se.text);
            if (tSub) dimTxt = tSub.text;
          }
        }
        const rawX1 = entData.hasDefPt13 ? entData.x4 : entData.x;
        const rawY1 = entData.hasDefPt13 ? entData.y4 : entData.y;
        const rawX2 = entData.hasDefPt14 ? entData.x3 : (entData.hasDefPt15 ? entData.x5 : (entData.hasSecondPt ? entData.x2 : entData.x));
        const rawY2 = entData.hasDefPt14 ? entData.y3 : (entData.hasDefPt15 ? entData.y5 : (entData.hasSecondPt ? entData.y2 : entData.y));
        if ((!dimTxt || dimTxt === '<>') && Number.isFinite(rawX1) && Number.isFinite(rawY1) && Number.isFinite(rawX2) && Number.isFinite(rawY2)) {
          const calcDist = Math.hypot(rawX2 - rawX1, rawY2 - rawY1);
          if (calcDist > 1e-6) dimTxt = fmtDimNum(calcDist);
        }
        const x1 = rawX1 * flipX;
        const y1 = rawY1;
        const x2 = rawX2 * flipX;
        const y2 = rawY2;
        const textX = (entData.hasSecondPt ? entData.x2 : (rawX1 + rawX2) / 2) * flipX;
        const textY = entData.hasSecondPt ? entData.y2 : (rawY1 + rawY2) / 2;
        if (!entData.blockName) {
          bound(x1, y1);
          bound(x2, y2);
        }
        return {
          type: 'DIMENSION',
          space: entData.space,
          layer: entData.layer,
          color: entData.color,
          trueColor: entData.trueColor,
          blockName: entData.blockName,
          defX: (entData.x || 0) * flipX,
          defY: entData.y || 0,
          x: textX,
          y: textY,
          x1,
          y1,
          x2,
          y2,
          textX,
          textY,
          rotation: entData.rotation || 0,
          measurement: (entData.code42Val != null && Number.isFinite(entData.code42Val) && entData.code42Val >= 0)
            ? entData.code42Val
            : ((Math.hypot(x2 - x1, y2 - y1) > 1e-6) ? Math.hypot(x2 - x1, y2 - y1) : null),
          text: dimTxt
        };
      } else if (entType === 'TEXT' || entType === 'MTEXT' || entType === 'ATTRIB' || entType === 'ATTDEF' || entType === 'TOLERANCE' || (entType === 'MLEADER' && entData.text)) {
        const cleaned = cleanDXFText(entData.text);
        if (!isNaN(entData.x) && !isNaN(entData.y) && cleaned) {
          const styleObj = this.styles[entData.textStyle] || null;
          let tx = entData.x * flipX;
          let ty = entData.y;
          let rot = entData.rotation || 0;
          let hMode = 'left';
          let vMode = 'baseline';
          let widthFactor = (styleObj && styleObj.widthFactor > 0) ? styleObj.widthFactor : 0.86;
          let fitWidth = 0;
          let boxWidth = 0;
          const hdrTextSize = parseFloat(this.header && this.header['$TEXTSIZE']);
          const unitFallbackH = this.unitName === 'in' ? 0.125 : (this.unitName === 'ft' ? 0.1 : (this.unitName === 'm' ? 0.05 : (this.unitName === 'cm' ? 0.25 : 2.5)));
          const defaultTextH = (Number.isFinite(hdrTextSize) && hdrTextSize > 0) ? hdrTextSize : unitFallbackH;
          let effHeight = entData.radiusOrHeight > 0 ? entData.radiusOrHeight : ((styleObj && styleObj.fixedHeight > 0) ? styleObj.fixedHeight : 0);

          if (entType === 'MTEXT' || entType === 'MLEADER') {
            const mtFmt = extractMTextFormatting(entData.text, effHeight, widthFactor);
            effHeight = mtFmt.height;
            widthFactor = mtFmt.widthFactor;
            const ap = entData.attachmentPoint || 1;
            hMode = (ap === 2 || ap === 5 || ap === 8) ? 'center' : ((ap === 3 || ap === 6 || ap === 9) ? 'right' : 'left');
            vMode = (ap <= 3) ? 'top' : ((ap <= 6) ? 'middle' : 'bottom');
            if (entData.hasCode41 && entData.code41Val > 0) boxWidth = entData.code41Val;
            if (entData.hasSecondPt && !entData.hasExplicitRot && (entData.x2 !== 0 || entData.y2 !== 0)) {
              rot = (Math.atan2(entData.y2, entData.x2) * 180) / Math.PI;
            }
          } else {
            if (entData.hasCode41 && entData.code41Val > 0) {
              widthFactor = Math.max(0.35, Math.min(2.0, entData.code41Val));
            }
            const ha = entData.hAlign || 0;
            const va = entData.vAlign || 0;
            if ((ha === 3 || ha === 5) && entData.hasSecondPt) {
              tx = ((entData.x + entData.x2) / 2) * flipX;
              ty = (entData.y + entData.y2) / 2;
              fitWidth = Math.hypot(entData.x2 - entData.x, entData.y2 - entData.y);
              if (fitWidth > 1e-4 && !entData.hasExplicitRot) {
                rot = (Math.atan2(entData.y2 - entData.y, (entData.x2 - entData.x) * flipX) * 180) / Math.PI;
              }
              hMode = 'center';
              vMode = 'baseline';
            } else {
              if ((ha > 0 || va > 0) && entData.hasSecondPt && (entData.x2 !== 0 || entData.y2 !== 0 || (entData.x === 0 && entData.y === 0))) {
                tx = entData.x2 * flipX;
                ty = entData.y2;
              }
              if (ha === 1 || ha === 4) hMode = 'center';
              else if (ha === 2) hMode = 'right';
              else hMode = 'left';

              if (ha === 4 || va === 2) vMode = 'middle';
              else if (va === 3) vMode = 'top';
              else if (va === 1) vMode = 'bottom';
              else vMode = 'baseline';
            }
          }

          bound(tx, ty);
          return {
            type: 'TEXT',
            isMText: entType === 'MTEXT' || entType === 'MLEADER',
            isTolerance: entType === 'TOLERANCE',
            origType: entType,
            space: entData.space,
            layer: entData.layer,
            textStyle: entData.textStyle,
            color: entData.color,
            trueColor: entData.trueColor,
            x: tx,
            y: ty,
            x2: entData.x2,
            y2: entData.y2,
            height: effHeight > 0 ? effHeight : defaultTextH,
            rotation: rot,
            hAlign: entData.hAlign || 0,
            vAlign: entData.vAlign || 0,
            hMode,
            vMode,
            widthFactor,
            fitWidth,
            boxWidth,
            lineSpacing: entData.lineSpacing || 1.2,
            text: cleaned
          };
        }
      }
      return null;
    }

    _parsePolySequence(pairs, startIdx, updateGlobalBounds = true) {
      let i = startIdx;
      let lyr = '0', col = null, trueCol = null, ltype = null, lw = null, flags = 0, space = 0, flipX = 1;
      while (i < pairs.length && pairs[i].code !== 0) {
        const c = pairs[i].code, v = pairs[i].val;
        if (c === 8) lyr = v || '0';
        else if (c === 67) space = parseInt(v, 10) || 0;
        else if (c === 62) col = parseInt(v, 10);
        else if (c === 420) trueCol = parseInt(v, 10);
        else if (c === 6) ltype = v;
        else if (c === 370) lw = parseInt(v, 10);
        else if (c === 70) flags = parseInt(v, 10) || 0;
        else if (c === 230 && parseFloat(v) < -0.5) flipX = -1;
        i++;
      }
      const vtxList = [];
      const faceIndices = [];
      const isPolyface = (flags & 64) !== 0;
      while (i < pairs.length) {
        if (pairs[i].code === 0) {
          const recType = String(pairs[i].val || '').trim().toUpperCase();
          if (recType === 'SEQEND') { i++; break; }
          if (recType !== 'VERTEX') break;
          i++;
          let vx = 0, vy = 0, vBulge = 0, vFlags = 0, vLyr = '';
          let f1 = 0, f2 = 0, f3 = 0, f4 = 0;
          while (i < pairs.length && pairs[i].code !== 0) {
            const vc = pairs[i].code, vv = pairs[i].val;
            if (vc === 10) vx = (parseFloat(vv) || 0) * flipX;
            else if (vc === 20) vy = parseFloat(vv) || 0;
            else if (vc === 42) vBulge = (parseFloat(vv) || 0) * flipX;
            else if (vc === 70) vFlags = parseInt(vv, 10) || 0;
            else if (vc === 8) vLyr = vv || '';
            else if (vc === 71) f1 = parseInt(vv, 10) || 0;
            else if (vc === 72) f2 = parseInt(vv, 10) || 0;
            else if (vc === 73) f3 = parseInt(vv, 10) || 0;
            else if (vc === 74) f4 = parseInt(vv, 10) || 0;
            i++;
          }
          if ((!lyr || lyr === '0') && vLyr && vLyr !== '0') lyr = vLyr;
          // Skip spline control-frame points (bit 16)
          if ((vFlags & 16) !== 0) continue;
          // In Polyface Meshes, records with bit 128 set and bit 64 NOT set are Face Records (with 10,20 = 0,0)
          if (isPolyface && (vFlags & 128) !== 0 && (vFlags & 64) === 0) {
            const idxs = [f1, f2, f3, f4].map(n => Math.abs(n)).filter(n => n > 0);
            if (idxs.length >= 2) faceIndices.push(idxs);
            continue;
          }
          vtxList.push({ x: vx, y: vy, bulge: vBulge });
        } else {
          i++;
        }
      }
      let ent = null;
      if (isPolyface && faceIndices.length > 0 && vtxList.length > 0) {
        const pts = [];
        for (const face of faceIndices) {
          for (const idx1Based of face) {
            const v = vtxList[idx1Based - 1];
            if (v) {
              pts.push([v.x, v.y, 0]);
              if (updateGlobalBounds && !this._isNonPlottingLayer(lyr)) this._updateBounds(v.x, v.y);
            }
          }
          const firstV = vtxList[face[0] - 1];
          if (firstV) pts.push([firstV.x, firstV.y, 0]);
        }
        if (pts.length >= 2) {
          const lyrInfo = this._ensureLayer(lyr);
          if (updateGlobalBounds) lyrInfo.count++;
          ent = { type: 'LWPOLYLINE', space, layer: lyr, color: col, trueColor: trueCol, linetype: ltype, lineweight: lw, closed: false, points: pts };
        }
      } else if (vtxList.length > 1) {
        const closed = (flags & 1) === 1;
        const ctrlPts = [];
        const renderPts = [];
        let hasAnyBulge = false;
        for (let idx = 0; idx < vtxList.length; idx++) {
          const v1 = vtxList[idx];
          ctrlPts.push([v1.x, v1.y, v1.bulge || 0]);
          renderPts.push([v1.x, v1.y]);
          if (updateGlobalBounds && !this._isNonPlottingLayer(lyr)) this._updateBounds(v1.x, v1.y);
          if (v1.bulge && (idx < vtxList.length - 1 || closed)) {
            hasAnyBulge = true;
            const v2 = vtxList[(idx + 1) % vtxList.length];
            const arcPts = tessellateBulgeSegment([v1.x, v1.y], [v2.x, v2.y], v1.bulge);
            for (let k = 0; k < arcPts.length - 1; k++) {
              renderPts.push([arcPts[k][0], arcPts[k][1]]);
              if (updateGlobalBounds && !this._isNonPlottingLayer(lyr)) this._updateBounds(arcPts[k][0], arcPts[k][1]);
            }
          }
        }
        const lyrInfo = this._ensureLayer(lyr);
        if (updateGlobalBounds) lyrInfo.count++;
        ent = {
          type: 'LWPOLYLINE',
          space,
          layer: lyr,
          color: col,
          trueColor: trueCol,
          linetype: ltype,
          lineweight: lw,
          closed,
          points: ctrlPts,
          ctrlPoints: ctrlPts,
          renderPoints: hasAnyBulge ? renderPts : ctrlPts
        };
      }
      return { nextIdx: i, ent };
    }

    _expandBlockBounds(blkName, parentTf = null, depth = 0, isDimBlock = false) {
      if (depth > 8 || !blkName) return;
      const blk = this._getBlock(blkName);
      if (!blk) return;
      const mapWorld = (lx, ly) => {
        if (!parentTf) return [lx, ly];
        const { bx, by, ix, iy, sx, sy, cosR, sinR } = parentTf;
        const dx = (lx - bx) * sx;
        const dy = (ly - by) * sy;
        return [
          ix + dx * cosR - dy * sinR,
          iy + dx * sinR + dy * cosR
        ];
      };
      for (const be of blk.entities) {
        if (this._isNonPlottingLayer(be.layer)) continue;
        // Never allow reference POINT entities inside *D dimension blocks to stretch drawing bounds to (0,0)
        if (be.type === 'POINT' && (isDimBlock || /^\*D/i.test(blkName))) continue;

        if (be.type === 'LINE') {
          const [wx1, wy1] = mapWorld(be.x1, be.y1);
          const [wx2, wy2] = mapWorld(be.x2, be.y2);
          this._updateBounds(wx1, wy1);
          this._updateBounds(wx2, wy2);
        } else if (be.type === 'CIRCLE') {
          const [wcx, wcy] = mapWorld(be.cx, be.cy);
          const sMax = parentTf ? Math.max(Math.abs(parentTf.sx), Math.abs(parentTf.sy)) : 1;
          const br = be.r * sMax;
          this._updateBounds(wcx - br, wcy - br);
          this._updateBounds(wcx + br, wcy + br);
        } else if (be.type === 'ARC') {
          this._updateArcBounds(be.cx, be.cy, be.r, be.startAngle, be.endAngle, mapWorld);
        } else if (be.type === 'ELLIPSE') {
          const [wcx, wcy] = mapWorld(be.cx, be.cy);
          const sMax = parentTf ? Math.max(Math.abs(parentTf.sx), Math.abs(parentTf.sy)) : 1;
          const br = Math.max(be.rx || 1, be.ry || 1) * sMax;
          this._updateBounds(wcx - br, wcy - br);
          this._updateBounds(wcx + br, wcy + br);
        } else if ((be.type === 'LWPOLYLINE' || be.type === 'SOLID') && be.points) {
          for (const pt of be.points) {
            const [wx, wy] = mapWorld(pt[0], pt[1]);
            this._updateBounds(wx, wy);
          }
        } else if (be.type === 'HATCH' && be.loops) {
          for (const lp of be.loops) {
            for (const pt of lp) {
              const [wx, wy] = mapWorld(pt[0], pt[1]);
              this._updateBounds(wx, wy);
            }
          }
        } else if (be.type === 'TEXT' || be.type === 'POINT') {
          const [wx, wy] = mapWorld(be.x, be.y);
          this._updateBounds(wx, wy);
        } else if (be.type === 'INSERT' && be.blockName) {
          const subBlk = this._getBlock(be.blockName);
          if (subBlk) {
            const [insWx, insWy] = mapWorld(be.x, be.y);
            const rotDeg = (be.rotation || 0) + (parentTf ? (parentTf.rotDeg || 0) : 0);
            const rad = (rotDeg * Math.PI) / 180;
            const subTf = {
              bx: subBlk.baseX || 0,
              by: subBlk.baseY || 0,
              ix: insWx,
              iy: insWy,
              sx: (be.scaleX || 1) * (parentTf ? (parentTf.sx || 1) : 1),
              sy: (be.scaleY || 1) * (parentTf ? (parentTf.sy || 0) || (parentTf.sx || 1) : 1),
              cosR: Math.cos(rad),
              sinR: Math.sin(rad),
              rotDeg
            };
            this._expandBlockBounds(be.blockName, subTf, depth + 1, isDimBlock);
          }
        }
      }
    }

    parse() {
      if (this._parsed) return this;
      let pairs = [];
      const isBinaryBytes = (this.content instanceof Uint8Array || this.content instanceof ArrayBuffer);
      const rawBinU8 = isBinaryBytes ? (this.content instanceof Uint8Array ? this.content : new Uint8Array(this.content)) : null;
      const hasBinSentinel = rawBinU8 && rawBinU8.length >= 24 &&
        String.fromCharCode(...rawBinU8.subarray(0, 18)) === 'AutoCAD Binary DXF';
      if (hasBinSentinel) {
        pairs = parseBinaryDXFPairs(rawBinU8);
      } else {
        const raw0 = typeof this.content === 'string' ? this.content : decodeDXFBytes(this.content);
        const raw = raw0.indexOf('\x00') !== -1 ? raw0.replace(/\x00+/g, '') : raw0;
        const headSample = raw.slice(0, 32768).trim().replace(/^\uFEFF/, '');
        if (!headSample || /^AutoCAD Binary DXF/i.test(headSample)) {
          throw new Error('Invalid or binary DXF format. Please provide standard ASCII DXF.');
        }
        if (!/\b(SECTION|HEADER|TABLES|BLOCKS|ENTITIES|LINE|LWPOLYLINE|POLYLINE|CIRCLE|ARC|ELLIPSE|SPLINE|SOLID|3DFACE|TEXT|MTEXT|INSERT|DIMENSION|HATCH|EOF)\b/i.test(headSample) &&
            !/\b(SECTION|ENTITIES|LINE|LWPOLYLINE|POLYLINE|CIRCLE|ARC|TEXT|MTEXT|INSERT|EOF)\b/i.test(raw.slice(-16384))) {
          throw new Error('Invalid or binary DXF format. Please provide standard ASCII DXF.');
        }
        const lines = raw.split(/\r\n|\r|\n/);
        const nLines = lines.length;
        let li = 0;
        while (li < nLines && lines[li].trim() === '') li++;
        while (li < nLines - 1) {
          const codeStr = lines[li].trim();
          const cLen = codeStr.length;
          if (cLen === 0 || cLen > 6) { li++; continue; }
          let k = 0, sign = 1, code = 0, validInt = true;
          if (codeStr.charCodeAt(0) === 45) {
            if (cLen === 1) { li++; continue; }
            sign = -1; k = 1;
          }
          for (; k < cLen; k++) {
            const d = codeStr.charCodeAt(k) - 48;
            if (d < 0 || d > 9) { validInt = false; break; }
            code = code * 10 + d;
          }
          if (!validInt) { li++; continue; }
          code *= sign;
          if (code < -5 || code > 1071) { li++; continue; }
          const val = lines[li + 1] != null ? lines[li + 1].trim() : '';
          // Parity self-heal: group code 0 in DXF is always a symbolic record name (SECTION, LINE, LAYER, 3DFACE, EOF...), never a bare number
          if (code === 0 && val.length > 0) {
            const fc = val.charCodeAt(0);
            if ((fc === 45 || (fc >= 48 && fc <= 57)) && /^-?\d+(\.\d+)?$/.test(val)) {
              li++;
              continue;
            }
          }
          pairs.push({ code, val });
          li += 2;
        }
        lines.length = 0;
      }

      if (!pairs.length) {
        throw new Error('Invalid or binary DXF format. Please provide standard ASCII DXF.');
      }
      this._ensureLayer('0', 7, 'CONTINUOUS', true);

      let currentSection = null;
      let i = 0;
      const rawEntities = [];
      const TOP_ENTITY_SET = new Set(['LINE', 'LWPOLYLINE', 'POLYLINE', 'CIRCLE', 'ARC', 'ELLIPSE', 'SPLINE', 'HELIX', 'SOLID', 'TRACE', '3DFACE', 'WIPEOUT', 'TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF', 'INSERT', 'DIMENSION', 'LEADER', 'MLEADER', 'MLINE', 'RAY', 'XLINE', 'HATCH', 'POINT']);

      while (i < pairs.length) {
        const p = pairs[i];
        const pValUpper = p.code === 0 ? String(p.val || '').trim().toUpperCase() : '';
        if (p.code === 0 && pValUpper === 'SECTION') {
          i++;
          while (i < pairs.length && pairs[i].code !== 2 && pairs[i].code !== 0) i++;
          if (i < pairs.length && pairs[i].code === 2) {
            currentSection = String(pairs[i].val || '').trim().toUpperCase();
            i++;
          }
          continue;
        }

        if (p.code === 0 && pValUpper === 'ENDSEC') {
          currentSection = null;
          i++;
          continue;
        }

        if (currentSection === 'HEADER') {
          if (p.code === 9) {
            const varName = String(p.val || '').trim().toUpperCase();
            i++;
            if (i < pairs.length) {
              this.header[varName] = pairs[i].val;
              if (varName === '$INSUNITS') {
                this.insunitsCode = parseInt(pairs[i].val, 10) || 0;
                this.unitName = INSUNITS_CODE_MAP[this.insunitsCode] || 'mm';
              } else if (varName === '$MEASUREMENT' && !this.header['$INSUNITS']) {
                const mCode = parseInt(pairs[i].val, 10);
                if (mCode === 0) { this.insunitsCode = 1; this.unitName = 'in'; }
              }
            }
          }
          i++;
        } else if (currentSection === 'TABLES') {
          if (p.code === 0 && pValUpper === 'LAYER') {
            i++;
            let lyrName = '0', lyrColor = 7, lyrLtype = 'CONTINUOUS', lyrFlags = 0, lyrLw = -3, lyrTrueCol = null;
            while (i < pairs.length && pairs[i].code !== 0) {
              if (pairs[i].code === 2) lyrName = pairs[i].val;
              else if (pairs[i].code === 62) lyrColor = parseInt(pairs[i].val, 10);
              else if (pairs[i].code === 6) lyrLtype = pairs[i].val;
              else if (pairs[i].code === 70) lyrFlags = parseInt(pairs[i].val, 10);
              else if (pairs[i].code === 370) lyrLw = parseInt(pairs[i].val, 10);
              else if (pairs[i].code === 420) lyrTrueCol = parseInt(pairs[i].val, 10);
              i++;
            }
            const isVisible = lyrColor >= 0 && (lyrFlags & 1) === 0;
            const lObj = this._ensureLayer(lyrName, Math.abs(lyrColor), lyrLtype, isVisible, lyrLw, lyrFlags, lyrTrueCol);
            lObj.color = Math.abs(lyrColor) || 7;
            lObj.linetype = lyrLtype || 'CONTINUOUS';
            lObj.lineweight = lyrLw;
            lObj.visible = isVisible;
            lObj.frozen = (lyrFlags & 1) !== 0;
            lObj.locked = (lyrFlags & 4) !== 0;
            lObj.flags = lyrFlags;
            if (lyrTrueCol != null && lyrTrueCol > 0) {
              lObj.trueColor = lyrTrueCol;
              lObj.customHex = '#' + (lyrTrueCol & 0xFFFFFF).toString(16).padStart(6, '0');
            }
            continue;
          } else if (p.code === 0 && pValUpper === 'STYLE') {
            i++;
            let stName = 'STANDARD', fixedH = 0, wf = 0.86;
            while (i < pairs.length && pairs[i].code !== 0) {
              if (pairs[i].code === 2) stName = pairs[i].val || 'STANDARD';
              else if (pairs[i].code === 40) fixedH = parseFloat(pairs[i].val) || 0;
              else if (pairs[i].code === 41) wf = parseFloat(pairs[i].val) || 0.86;
              i++;
            }
            this.styles[stName] = { name: stName, fixedHeight: fixedH, widthFactor: Math.max(0.4, Math.min(2.0, wf)) };
            continue;
          }
          i++;
        } else if (currentSection === 'BLOCKS') {
          if (p.code === 0 && pValUpper === 'BLOCK') {
            i++;
            let blkName = '', baseX = 0, baseY = 0;
            while (i < pairs.length && pairs[i].code !== 0) {
              if (pairs[i].code === 2 && pairs[i].val) blkName = pairs[i].val.trim();
              else if (pairs[i].code === 3 && !blkName && pairs[i].val) blkName = pairs[i].val.trim();
              else if (pairs[i].code === 10) baseX = parseFloat(pairs[i].val) || 0;
              else if (pairs[i].code === 20) baseY = parseFloat(pairs[i].val) || 0;
              i++;
            }
            const blkEntities = [];
            while (i < pairs.length) {
              if (pairs[i].code === 0) {
                const eType = String(pairs[i].val || '').trim().toUpperCase();
                if (eType === 'ENDBLK' || eType === 'ENDSEC') {
                  if (eType === 'ENDBLK') i++;
                  break;
                }
                if (eType === 'POLYLINE') {
                  const res = this._parsePolySequence(pairs, i + 1, false);
                  i = res.nextIdx;
                  if (res.ent) blkEntities.push(res.ent);
                  continue;
                }
                const start = ++i;
                while (i < pairs.length && pairs[i].code !== 0) i++;
                const ent = this._parseEntityRecord(eType, pairs, start, i, false);
                if (ent) blkEntities.push(ent);
              } else {
                i++;
              }
            }
            if (blkName) {
              const blkObj = { name: blkName, baseX, baseY, entities: blkEntities };
              this.blocks[blkName] = blkObj;
              this.blocks[blkName.toUpperCase()] = blkObj;
            }
            continue;
          }
          i++;
        } else if (currentSection === 'ENTITIES' || (currentSection === null && p.code === 0 && TOP_ENTITY_SET.has(pValUpper))) {
          if (p.code === 0) {
            const entType = pValUpper;
            if (entType === 'POLYLINE') {
              const res = this._parsePolySequence(pairs, i + 1, false);
              i = res.nextIdx;
              if (res.ent) rawEntities.push(res.ent);
              continue;
            }
            const start = ++i;
            while (i < pairs.length && pairs[i].code !== 0) i++;
            const parsedEnt = this._parseEntityRecord(entType, pairs, start, i, false);
            if (parsedEnt) rawEntities.push(parsedEnt);
            continue;
          }
          i++;
        } else {
          i++;
        }
      }

      // Separate Model Space (space !== 1) from Paper Space (space === 1)
      // If a drawing has almost all its entities in Paper Space (e.g. a layout export with <=2 stray Model Space entities), use the Paper Space entities so it never opens blank!
      const modelEntities = rawEntities.filter(e => e.space !== 1);
      const paperEntities = rawEntities.filter(e => e.space === 1);
      let activeEntities = modelEntities;
      if (modelEntities.length === 0 || (modelEntities.length <= 2 && paperEntities.length > modelEntities.length * 4)) {
        activeEntities = paperEntities.length >= modelEntities.length ? paperEntities : rawEntities;
      }
      if (activeEntities.length === 0) {
        const msBlk = this._getBlock('*Model_Space') || this._getBlock('*Paper_Space');
        if (msBlk && Array.isArray(msBlk.entities) && msBlk.entities.length > 0) {
          activeEntities = msBlk.entities.slice();
        }
      }

      let _entSeq = 1;
      for (const ent of activeEntities) {
        if (!ent._id) ent._id = 'dxf_ent_' + (_entSeq++);
        if (ent.trueColor != null && ent.trueColor > 0 && !ent.customHex) {
          ent.customHex = trueColorToHex(ent.trueColor);
        }
        this._ensureLayer(ent.layer);
        this.entities.push(ent);
      }
      for (const blk of Object.values(this.blocks || {})) {
        for (const be of (blk && blk.entities) || []) {
          if (be && be.trueColor != null && be.trueColor > 0 && !be.customHex) {
            be.customHex = trueColorToHex(be.trueColor);
          }
        }
      }

      // Safeguard: if 100% of entities are on layers that were marked off/frozen in the LAYER table, turn those layers ON so the drawing never opens as a blank screen!
      if (this.entities.length > 0) {
        const anyVisible = this.entities.some(e => !this._isNonPlottingLayer(e.layer));
        if (!anyVisible) {
          for (const e of this.entities) {
            const lObj = this.layers[e.layer];
            if (lObj) {
              lObj.visible = true;
              lObj.frozen = false;
            }
          }
        }
      }

      this.recomputeBoundsAndCounts();
      pairs.length = 0;
      this._parsed = true;
      this.content = '';
      return this;
    }

    getTotalPrimitiveCount() {
      if (this._primCountCache > 0 && this._primCountRev === this._mutationRev) {
        return this._primCountCache;
      }
      let total = 0;
      const blkCountMemo = new Map();
      const countBlk = (blkName, depth = 0) => {
        if (depth > 6 || !blkName) return 1;
        if (blkCountMemo.has(blkName)) return blkCountMemo.get(blkName);
        const blk = this._getBlock(blkName);
        if (!blk || !Array.isArray(blk.entities)) return 1;
        let c = 0;
        for (const sub of blk.entities) {
          if (sub.type === 'INSERT' && sub.blockName) c += countBlk(sub.blockName, depth + 1);
          else c++;
        }
        const res = Math.max(1, c);
        blkCountMemo.set(blkName, res);
        return res;
      };
      for (const e of this.entities) {
        if ((e.type === 'INSERT' || e.type === 'DIMENSION') && e.blockName && this._getBlock(e.blockName)) {
          total += countBlk(e.blockName, 0);
        } else {
          total++;
        }
      }
      this._primCountCache = Math.max(1, total);
      this._primCountRev = this._mutationRev;
      return this._primCountCache;
    }

    getLayerSummary() {
      return Object.values(this.layers).map(l => ({
        name: l.name,
        color: l.color,
        customHex: l.customHex || null,
        hexDark: l.customHex || aciToHex(l.color, true),
        hexLight: l.customHex || aciToHex(l.color, false),
        linetype: l.linetype || 'CONTINUOUS',
        lineweight: l.lineweight != null ? l.lineweight : -3,
        visible: l.visible !== false && !l.frozen,
        frozen: !!l.frozen,
        locked: !!l.locked,
        opacity: l.opacity != null ? l.opacity : 100,
        count: l.count || 0
      }));
    }

    getEntitySummary() {
      const counts = { LINE: 0, LWPOLYLINE: 0, CIRCLE: 0, ARC: 0, ELLIPSE: 0, INSERT: 0, TEXT: 0, DIMENSION: 0, SOLID: 0, HATCH: 0, POINT: 0 };
      for (const e of this.entities) {
        counts[e.type] = (counts[e.type] || 0) + 1;
      }
      return counts;
    }

    _resolveColor(ent, isLightBg) {
      const isDarkBg = !isLightBg;
      if (ent.customHex) return contrastAdjustHex(ent.customHex, isDarkBg);
      if (ent.trueColor != null && ent.trueColor > 0) {
        return contrastAdjustHex(trueColorToHex(ent.trueColor), isDarkBg);
      }
      const lyr = this.layers[ent.layer];
      if ((ent.color == null || ent.color === 256 || ent.color === 0) && lyr) {
        if (lyr.customHex) return contrastAdjustHex(lyr.customHex, isDarkBg);
        if (lyr.trueColor != null && lyr.trueColor > 0) {
          return contrastAdjustHex(trueColorToHex(lyr.trueColor), isDarkBg);
        }
      }
      const aci = (ent.color != null && ent.color !== 256 && ent.color !== 0)
        ? Math.abs(ent.color)
        : (lyr && lyr.color ? Math.abs(lyr.color) : 7);
      return aciToHex(aci, isDarkBg);
    }

    /**
     * AutoCAD Layer & Entity Management Operations (Lock, Freeze, Visibility, Color, Add, Rename, Delete, Purge, Bounds)
     */
    recomputeBoundsAndCounts() {
      this._mutationRev = (this._mutationRev || 0) + 1;
      this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const lyr of Object.values(this.layers)) lyr.count = 0;
      const entBoxes = [];
      for (const ent of this.entities) {
        const lyrInfo = this._ensureLayer(ent.layer);
        lyrInfo.count++;
        if (this._isNonPlottingLayer(ent.layer)) continue;
        ent._cachedBBox = null;
        const bb = this.getEntityBBox(ent);
        if (bb && isFinite(bb.minX) && isFinite(bb.minY) && isFinite(bb.maxX) && isFinite(bb.maxY) &&
            Math.abs(bb.minX) < 1e11 && Math.abs(bb.maxX) < 1e11 && Math.abs(bb.minY) < 1e11 && Math.abs(bb.maxY) < 1e11) {
          this._updateBounds(bb.minX, bb.minY);
          this._updateBounds(bb.maxX, bb.maxY);
          entBoxes.push(bb);
        }
      }
      // Outlier-resistant bounds check: if >=6 entities exist and a single stray datum point (e.g. at 0,0) blows up the span by >6x compared to the 90% core cluster, trim the extreme outlier
      const nBoxes = entBoxes.length;
      if (nBoxes >= 6 && isFinite(this.bounds.minX)) {
        const rawW = this.bounds.maxX - this.bounds.minX;
        const rawH = this.bounds.maxY - this.bounds.minY;
        const cxs = new Float64Array(nBoxes);
        const cys = new Float64Array(nBoxes);
        for (let i = 0; i < nBoxes; i++) {
          const b = entBoxes[i];
          cxs[i] = (b.minX + b.maxX) * 0.5;
          cys[i] = (b.minY + b.maxY) * 0.5;
        }
        cxs.sort();
        cys.sort();
        const iLow = Math.max(1, Math.floor(nBoxes * 0.05));
        const iHigh = Math.min(nBoxes - 2, Math.ceil(nBoxes * 0.95));
        const xLow = cxs[iLow], xHigh = cxs[iHigh];
        const yLow = cys[iLow], yHigh = cys[iHigh];
        let coreMinX = Infinity, coreMaxX = -Infinity, coreMinY = Infinity, coreMaxY = -Infinity;
        for (let i = 0; i < nBoxes; i++) {
          const b = entBoxes[i];
          const cx = (b.minX + b.maxX) * 0.5;
          const cy = (b.minY + b.maxY) * 0.5;
          if (cx >= xLow && cx <= xHigh) {
            if (b.minX < coreMinX) coreMinX = b.minX;
            if (b.maxX > coreMaxX) coreMaxX = b.maxX;
          }
          if (cy >= yLow && cy <= yHigh) {
            if (b.minY < coreMinY) coreMinY = b.minY;
            if (b.maxY > coreMaxY) coreMaxY = b.maxY;
          }
        }
        const coreW = coreMaxX - coreMinX;
        const coreH = coreMaxY - coreMinY;
        if (isFinite(coreW) && isFinite(coreH) && coreW > 1e-3 && coreH > 1e-3 && (rawW > coreW * 6 || rawH > coreH * 6)) {
          const marginX = coreW * 1.5;
          const marginY = coreH * 1.5;
          let fMinX = Infinity, fMinY = Infinity, fMaxX = -Infinity, fMaxY = -Infinity;
          for (let i = 0; i < nBoxes; i++) {
            const b = entBoxes[i];
            if (b.maxX >= coreMinX - marginX && b.minX <= coreMaxX + marginX &&
                b.maxY >= coreMinY - marginY && b.minY <= coreMaxY + marginY) {
              if (b.minX < fMinX) fMinX = b.minX;
              if (b.maxX > fMaxX) fMaxX = b.maxX;
              if (b.minY < fMinY) fMinY = b.minY;
              if (b.maxY > fMaxY) fMaxY = b.maxY;
            }
          }
          if (isFinite(fMinX) && fMaxX > fMinX && fMaxY > fMinY) {
            this.bounds = { minX: fMinX, minY: fMinY, maxX: fMaxX, maxY: fMaxY };
          }
        }
      }
      if (!isFinite(this.bounds.minX)) {
        this.bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
      }
      this._cachedPdfKey = null;
      return this.bounds;
    }

    _getBlockLocalBBox(blkName, depth = 0) {
      if (depth > 8 || !blkName) return null;
      const blk = this._getBlock(blkName);
      if (!blk || !Array.isArray(blk.entities) || !blk.entities.length) return null;
      if (blk._localBBox && blk._localBBoxCount === blk.entities.length) {
        return blk._localBBox;
      }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const isDim = /^\*D/i.test(blkName || '');
      for (const sub of blk.entities) {
        if (isDim && sub.type === 'POINT') continue;
        const sbb = this.getEntityBBox(sub, depth + 1);
        if (sbb && isFinite(sbb.minX)) {
          if (sbb.minX < minX) minX = sbb.minX;
          if (sbb.maxX > maxX) maxX = sbb.maxX;
          if (sbb.minY < minY) minY = sbb.minY;
          if (sbb.maxY > maxY) maxY = sbb.maxY;
        }
      }
      if (!isFinite(minX)) return null;
      blk._localBBox = { minX, minY, maxX, maxY };
      blk._localBBoxCount = blk.entities.length;
      return blk._localBBox;
    }

    getEntityBBox(ent, depth = 0) {
      if (!ent || depth > 8) return null;
      if (depth === 0 && ent._cachedBBox) return ent._cachedBBox;
      let res = null;
      if (ent.type === 'LINE') {
        res = {
          minX: Math.min(ent.x1, ent.x2),
          minY: Math.min(ent.y1, ent.y2),
          maxX: Math.max(ent.x1, ent.x2),
          maxY: Math.max(ent.y1, ent.y2)
        };
      } else if (ent.type === 'CIRCLE') {
        const r = Math.abs(ent.r || 1);
        res = { minX: ent.cx - r, minY: ent.cy - r, maxX: ent.cx + r, maxY: ent.cy + r };
      } else if (ent.type === 'ARC') {
        res = computeExactArcBBox(ent.cx, ent.cy, ent.r, ent.startAngle, ent.endAngle);
      } else if (ent.type === 'ELLIPSE') {
        const rx = ent.rx || Math.hypot(ent.mx || 10, ent.my || 0) || 1;
        const ry = ent.ry || (rx * (ent.ratio || 0.5)) || 1;
        const r = Math.max(Math.abs(rx), Math.abs(ry));
        res = { minX: ent.cx - r, minY: ent.cy - r, maxX: ent.cx + r, maxY: ent.cy + r };
      } else if ((ent.type === 'LWPOLYLINE' || ent.type === 'SPLINE' || ent.type === 'SOLID') && Array.isArray(ent.renderPoints || ent.points) && (ent.renderPoints || ent.points).length) {
        const pts = ent.renderPoints || ent.points;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          if (p[0] < minX) minX = p[0];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[1] > maxY) maxY = p[1];
        }
        res = { minX, minY, maxX, maxY };
      } else if (ent.type === 'HATCH') {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        if (Array.isArray(ent.loops) && ent.loops.length) {
          for (const lp of ent.loops) {
            for (const p of lp) {
              if (p[0] < minX) minX = p[0];
              if (p[0] > maxX) maxX = p[0];
              if (p[1] < minY) minY = p[1];
              if (p[1] > maxY) maxY = p[1];
            }
          }
        } else if (Array.isArray(ent.points) && ent.points.length) {
          for (const p of ent.points) {
            if (p[0] < minX) minX = p[0];
            if (p[0] > maxX) maxX = p[0];
            if (p[1] < minY) minY = p[1];
            if (p[1] > maxY) maxY = p[1];
          }
        }
        if (isFinite(minX)) res = { minX, minY, maxX, maxY };
      } else if (ent.type === 'DIMENSION') {
        const lbb = ent.blockName ? this._getBlockLocalBBox(ent.blockName, depth + 1) : null;
        if (lbb && isFinite(lbb.minX)) {
          res = { minX: lbb.minX, minY: lbb.minY, maxX: lbb.maxX, maxY: lbb.maxY };
        } else {
          const x1 = ent.x1 ?? ent.x ?? 0, y1 = ent.y1 ?? ent.y ?? 0;
          const x2 = ent.x2 ?? x1, y2 = ent.y2 ?? y1;
          const tx = ent.textX ?? ent.x ?? (x1 + x2) / 2, ty = ent.textY ?? ent.y ?? (y1 + y2) / 2;
          res = {
            minX: Math.min(x1, x2, tx),
            minY: Math.min(y1, y2, ty),
            maxX: Math.max(x1, x2, tx),
            maxY: Math.max(y1, y2, ty)
          };
        }
      } else if (ent.type === 'TEXT') {
        const h = Math.max(0.5, ent.height || 2.5);
        const wf = ent.widthFactor || 0.86;
        const lines = (ent.isMText && ent.boxWidth > 0)
          ? wrapMTextLines(ent.text, ent.boxWidth, h, wf)
          : String(ent.text || '').split(/\r?\n/);
        let maxChars = 1;
        for (let li = 0; li < lines.length; li++) {
          const tLen = lines[li].trimEnd().length || lines[li].length;
          if (tLen > maxChars) maxChars = tLen;
        }
        const textW = Math.max(h * 0.6, maxChars * h * 0.62 * wf);
        const w = ent.fitWidth > 0 ? ent.fitWidth : (ent.isMText && ent.boxWidth > 0 ? Math.min(ent.boxWidth, textW) : textW);
        const lineStep = h * (ent.lineSpacing || 1.2);
        const totalH = h + (lines.length - 1) * lineStep;
        const lx0 = ent.hMode === 'center' ? -w / 2 : (ent.hMode === 'right' ? -w : 0);
        const lx1 = lx0 + w;
        let ly0 = -(lines.length - 1) * lineStep - h * 0.2, ly1 = h * 0.98;
        if (ent.vMode === 'top') { ly0 = -totalH - h * 0.12; ly1 = h * 0.15; }
        else if (ent.vMode === 'middle') { ly0 = -totalH * 0.55; ly1 = totalH * 0.55; }
        else if (ent.vMode === 'bottom') { ly0 = -h * 0.12; ly1 = totalH + h * 0.12; }
        const rotDeg = ent.rotation || 0;
        const ox = ent.x || 0, oy = ent.y || 0;
        if (Math.abs(rotDeg) > 1e-3) {
          const rad = (rotDeg * Math.PI) / 180;
          const cosR = Math.cos(rad), sinR = Math.sin(rad);
          const corners = [[lx0, ly0], [lx1, ly0], [lx1, ly1], [lx0, ly1]];
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (let c = 0; c < 4; c++) {
            const wx = ox + corners[c][0] * cosR - corners[c][1] * sinR;
            const wy = oy + corners[c][0] * sinR + corners[c][1] * cosR;
            if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
            if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
          }
          res = { minX, minY, maxX, maxY };
        } else {
          res = { minX: ox + lx0, minY: oy + ly0, maxX: ox + lx1, maxY: oy + ly1 };
        }
      } else if (ent.type === 'INSERT') {
        const blk = this._getBlock(ent.blockName);
        const lbb = this._getBlockLocalBBox(ent.blockName, depth + 1);
        if (blk && lbb && isFinite(lbb.minX)) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          const sx = ent.scaleX || 1, sy = ent.scaleY || 1;
          const rad = ((ent.rotation || 0) * Math.PI) / 180;
          const cosR = Math.cos(rad), sinR = Math.sin(rad);
          const bx = blk.baseX || 0, by = blk.baseY || 0;
          const ix = ent.x || 0, iy = ent.y || 0;
          const corners = [[lbb.minX, lbb.minY], [lbb.maxX, lbb.minY], [lbb.maxX, lbb.maxY], [lbb.minX, lbb.maxY]];
          for (let c = 0; c < 4; c++) {
            const dx = (corners[c][0] - bx) * sx, dy = (corners[c][1] - by) * sy;
            const wx = ix + dx * cosR - dy * sinR;
            const wy = iy + dx * sinR + dy * cosR;
            if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
            if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
          }
          res = { minX, minY, maxX, maxY };
        } else {
          res = { minX: (ent.x || 0) - 2, minY: (ent.y || 0) - 2, maxX: (ent.x || 0) + 2, maxY: (ent.y || 0) + 2 };
        }
      }
      if (!res) {
        const px = ent.x ?? ent.x1 ?? ent.cx ?? 0;
        const py = ent.y ?? ent.y1 ?? ent.cy ?? 0;
        res = { minX: px - 0.5, minY: py - 0.5, maxX: px + 0.5, maxY: py + 0.5 };
      }
      if (depth === 0) ent._cachedBBox = res;
      return res;
    }

        setLayerState(layerName, patch = {}) {
      if (!layerName) return null;
      const lyr = this._ensureLayer(layerName);
      if (patch.visible !== undefined) lyr.visible = !!patch.visible;
      if (patch.frozen !== undefined) {
        lyr.frozen = !!patch.frozen;
        if (lyr.frozen) lyr.flags = (lyr.flags || 0) | 1;
        else lyr.flags = (lyr.flags || 0) & ~1;
      }
      if (patch.locked !== undefined) {
        lyr.locked = !!patch.locked;
        if (lyr.locked) lyr.flags = (lyr.flags || 0) | 4;
        else lyr.flags = (lyr.flags || 0) & ~4;
      }
      if (patch.color !== undefined) lyr.color = Math.max(1, Math.min(255, parseInt(patch.color, 10) || 7));
      if (patch.customHex !== undefined) {
        lyr.customHex = patch.customHex;
        if (patch.customHex && /^#[0-9a-f]{6}$/i.test(patch.customHex)) {
          lyr.trueColor = parseInt(patch.customHex.slice(1), 16);
        } else if (!patch.customHex) {
          lyr.trueColor = null;
        }
      }
      if (patch.linetype !== undefined) lyr.linetype = String(patch.linetype || 'CONTINUOUS').toUpperCase();
      if (patch.lineweight !== undefined) lyr.lineweight = parseInt(patch.lineweight, 10);
      if (patch.opacity !== undefined) lyr.opacity = Math.max(5, Math.min(100, Number(patch.opacity) || 100));
      this._mutationRev = (this._mutationRev || 0) + 1;
      this._cachedPdfKey = null;
      this._cachedPdfBytes = null;
      return lyr;
    }

    addLayer(layerName, props = {}) {
      const clean = String(layerName || '').trim() || `LAYER_${Object.keys(this.layers).length + 1}`;
      const lyr = this._ensureLayer(clean, props.color || 7, props.linetype || 'CONTINUOUS', props.visible !== false, props.lineweight ?? -3);
      if (props.customHex) this.setLayerState(clean, { customHex: props.customHex });
      if (props.locked != null) this.setLayerState(clean, { locked: props.locked });
      if (props.frozen != null) this.setLayerState(clean, { frozen: props.frozen });
      return lyr;
    }

    renameLayer(oldName, newName) {
      const src = String(oldName || '').trim();
      const dst = String(newName || '').trim();
      if (!src || !dst || src === dst || src === '0' || !this.layers[src]) return false;
      const oldObj = this.layers[src];
      if (!this.layers[dst]) {
        this.layers[dst] = { ...oldObj, name: dst };
      } else {
        this.layers[dst].count += oldObj.count;
      }
      delete this.layers[src];
      for (const e of this.entities) {
        if (e.layer === src) e.layer = dst;
      }
      for (const blk of Object.values(this.blocks || {})) {
        if (blk && Array.isArray(blk.entities)) {
          for (const be of blk.entities) {
            if (be.layer === src) be.layer = dst;
          }
        }
      }
      this.recomputeBoundsAndCounts();
      return true;
    }

    deleteLayer(layerName, mode = 'delete_entities', force = false) {
      const target = String(layerName || '').trim();
      if (!target) return { ok: false, removedEntities: 0 };
      if (this.layers[target] && this.layers[target].locked && !force) {
        return { ok: false, reason: `Layer "${target}" is locked. Unlock it first before removing.`, removedEntities: 0 };
      }
      let removedEntities = 0;
      if (mode === 'move_to_0' && target !== '0') {
        this._ensureLayer('0');
        for (const e of this.entities) {
          if (e.layer === target) { e.layer = '0'; removedEntities++; }
        }
        for (const blk of Object.values(this.blocks || {})) {
          if (blk && Array.isArray(blk.entities)) {
            for (const be of blk.entities) {
              if (be.layer === target) be.layer = '0';
            }
          }
        }
      } else {
        const before = this.entities.length;
        this.entities = this.entities.filter(e => e.layer !== target);
        removedEntities = before - this.entities.length;
        for (const blk of Object.values(this.blocks || {})) {
          if (blk && Array.isArray(blk.entities)) {
            blk.entities = blk.entities.filter(be => be.layer !== target);
          }
        }
      }
      if (target !== '0') {
        delete this.layers[target];
      } else if (this.layers['0']) {
        this.layers['0'].count = 0;
      }
      this.recomputeBoundsAndCounts();
      return { ok: true, removedEntities };
    }

    purgeUnusedLayers() {
      this.recomputeBoundsAndCounts();
      const purged = [];
      for (const [name, lyr] of Object.entries(this.layers)) {
        if (name !== '0' && (!lyr.count || lyr.count === 0)) {
          delete this.layers[name];
          purged.push(name);
        }
      }
      return purged;
    }

    isolateLayer(layerName) {
      for (const [name, lyr] of Object.entries(this.layers)) {
        lyr.visible = (name === layerName);
      }
      this._cachedPdfKey = null;
    }

    unisolateAllLayers() {
      for (const lyr of Object.values(this.layers)) {
        if (!/^defpoints$/i.test(lyr.name)) {
          lyr.visible = true;
          lyr.frozen = false;
          lyr.flags = (lyr.flags || 0) & ~1;
        }
      }
      this._cachedPdfKey = null;
    }

    toDXFString() {
      this.recomputeBoundsAndCounts();
      const lines = [];
      const out = (code, val) => {
        lines.push(String(code).trim());
        lines.push(String(val ?? '').trim());
      };

      // 1. HEADER SECTION
      out(0, 'SECTION');
      out(2, 'HEADER');
      out(9, '$ACADVER');
      out(1, this.header['$ACADVER'] || 'AC1015');
      out(9, '$INSUNITS');
      out(70, this.insunitsCode != null ? this.insunitsCode : 4);
      out(9, '$EXTMIN');
      out(10, isFinite(this.bounds.minX) ? this.bounds.minX.toFixed(6) : '0.0000');
      out(20, isFinite(this.bounds.minY) ? this.bounds.minY.toFixed(6) : '0.0000');
      out(30, '0.0');
      out(9, '$EXTMAX');
      out(10, isFinite(this.bounds.maxX) ? this.bounds.maxX.toFixed(6) : '100.0000');
      out(20, isFinite(this.bounds.maxY) ? this.bounds.maxY.toFixed(6) : '100.0000');
      out(30, '0.0');
      out(0, 'ENDSEC');

      // 2. TABLES SECTION (Layers & Styles)
      const layerList = Object.values(this.layers);
      out(0, 'SECTION');
      out(2, 'TABLES');
      out(0, 'TABLE');
      out(2, 'LAYER');
      out(70, layerList.length);
      for (const lyr of layerList) {
        out(0, 'LAYER');
        out(2, lyr.name);
        let flags = 0;
        if (lyr.frozen) flags |= 1;
        if (lyr.locked) flags |= 4;
        out(70, flags);
        const baseAci = (lyr.color && lyr.color !== 7) ? Math.abs(lyr.color) : (lyr.customHex ? hexToNearestACI(lyr.customHex) : Math.abs(lyr.color || 7));
        const colSign = lyr.visible === false ? -baseAci : baseAci;
        out(62, colSign);
        const lyrTc = (lyr.trueColor != null && lyr.trueColor > 0) ? lyr.trueColor : (lyr.customHex ? hexToTrueColor(lyr.customHex) : null);
        if (lyrTc != null && lyrTc > 0) out(420, lyrTc);
        out(6, lyr.linetype || 'CONTINUOUS');
        if (lyr.lineweight != null && lyr.lineweight !== -3) out(370, lyr.lineweight);
      }
      out(0, 'ENDTAB');
      out(0, 'ENDSEC');

      // 3. BLOCKS SECTION
      out(0, 'SECTION');
      out(2, 'BLOCKS');
      const seenBlks = new Set();
      for (const blk of Object.values(this.blocks || {})) {
        if (!blk || !blk.name || seenBlks.has(blk)) continue;
        seenBlks.add(blk);
        out(0, 'BLOCK');
        out(8, '0');
        out(2, blk.name);
        out(70, 0);
        out(10, (blk.baseX || 0).toFixed(6));
        out(20, (blk.baseY || 0).toFixed(6));
        out(30, '0.0');
        for (const be of (blk.entities || [])) {
          this._serializeEntityToDXF(be, out);
        }
        out(0, 'ENDBLK');
      }
      out(0, 'ENDSEC');

      // 4. ENTITIES SECTION
      out(0, 'SECTION');
      out(2, 'ENTITIES');
      for (const ent of this.entities) {
        if (ent && ent.type === 'DIMENSION' && ent._textEdited && ent.blockName) {
          const dBlk = this._getBlock(ent.blockName);
          if (dBlk && Array.isArray(dBlk.entities)) {
            const tSub = dBlk.entities.find(se => se && se.type === 'TEXT');
            if (tSub) tSub.text = ent.text || '';
          }
        }
        this._serializeEntityToDXF(ent, out);
      }
      out(0, 'ENDSEC');
      out(0, 'EOF');
      return lines.join('\r\n') + '\r\n';
    }

    _serializeEntityToDXF(ent, out) {
      if (!ent || !ent.type) return;
      const writeCommon = (typeStr) => {
        out(0, typeStr);
        out(8, ent.layer || '0');
        const effTc = (ent.trueColor != null && ent.trueColor > 0) ? ent.trueColor : (ent.customHex ? hexToTrueColor(ent.customHex) : null);
        const effColor = (ent.color != null && ent.color !== 256) ? ent.color : (ent.customHex ? hexToNearestACI(ent.customHex) : null);
        if (effColor != null && effColor !== 256) out(62, effColor);
        if (effTc != null && effTc > 0) out(420, effTc);
        if (ent.linetype && ent.linetype !== 'BYLAYER') out(6, ent.linetype);
        if (ent.lineweight != null && ent.lineweight !== -3) out(370, ent.lineweight);
        if (ent.elevation && Math.abs(ent.elevation) > 1e-6) out(38, Number(ent.elevation).toFixed(6));
        if (ent.thickness && Math.abs(ent.thickness) > 1e-6) out(39, Number(ent.thickness).toFixed(6));
      };
      if (ent.type === 'LINE') {
        writeCommon('LINE');
        out(10, (ent.x1 || 0).toFixed(6));
        out(20, (ent.y1 || 0).toFixed(6));
        out(30, ent.z1 ? Number(ent.z1).toFixed(6) : '0.0');
        out(11, (ent.x2 || 0).toFixed(6));
        out(21, (ent.y2 || 0).toFixed(6));
        out(31, ent.z2 ? Number(ent.z2).toFixed(6) : '0.0');
      } else if (ent.type === 'CIRCLE') {
        writeCommon('CIRCLE');
        out(10, (ent.cx || 0).toFixed(6));
        out(20, (ent.cy || 0).toFixed(6));
        out(30, '0.0');
        out(40, Math.max(0.0001, ent.r || 1).toFixed(6));
      } else if (ent.type === 'ARC') {
        writeCommon('ARC');
        out(10, (ent.cx || 0).toFixed(6));
        out(20, (ent.cy || 0).toFixed(6));
        out(30, '0.0');
        out(40, Math.max(0.0001, ent.r || 1).toFixed(6));
        out(50, (ent.startAngle || 0).toFixed(6));
        out(51, (ent.endAngle != null ? ent.endAngle : 360).toFixed(6));
      } else if (ent.type === 'ELLIPSE') {
        writeCommon('ELLIPSE');
        out(10, (ent.cx || 0).toFixed(6));
        out(20, (ent.cy || 0).toFixed(6));
        out(30, '0.0');
        const rot = ent.rotation || 0;
        const rx = Math.max(0.001, ent.rx || 10);
        const ry = Math.max(0.001, ent.ry || 5);
        out(11, (rx * Math.cos(rot)).toFixed(6));
        out(21, (rx * Math.sin(rot)).toFixed(6));
        out(31, '0.0');
        out(40, (ry / rx).toFixed(6));
        out(41, (ent.startParam ?? 0).toFixed(6));
        out(42, (ent.endParam ?? (Math.PI * 2)).toFixed(6));
      } else if ((ent.type === 'LWPOLYLINE' || ent.type === 'SPLINE') && Array.isArray(ent.points) && ent.points.length >= 2) {
        if (ent.isSpline || ent.type === 'SPLINE') {
          writeCommon('SPLINE');
          out(70, ent.closed ? 1 : 0);
          out(71, 3);
          const isFit = !!ent._isFitSpline;
          if (isFit) {
            out(74, ent.points.length);
            for (let i = 0; i < ent.points.length; i++) {
              const pt = ent.points[i];
              out(11, (pt[0] || 0).toFixed(6));
              out(21, (pt[1] || 0).toFixed(6));
              out(31, '0.0');
            }
          } else {
            const nPts = ent.points.length;
            const deg = Math.min(3, Math.max(1, nPts - 1));
            const nKnots = nPts + deg + 1;
            out(72, nKnots);
            out(73, nPts);
            const knots = Array.isArray(ent.knots) && ent.knots.length === nKnots ? ent.knots : (() => {
              const arr = [];
              const interior = Math.max(1, nPts - deg);
              for (let k = 0; k < nKnots; k++) {
                if (k <= deg) arr.push(0);
                else if (k >= nKnots - deg - 1) arr.push(1);
                else arr.push((k - deg) / interior);
              }
              return arr;
            })();
            for (let k = 0; k < knots.length; k++) out(40, Number(knots[k] || 0).toFixed(6));
            for (let i = 0; i < nPts; i++) {
              const pt = ent.points[i];
              out(10, (pt[0] || 0).toFixed(6));
              out(20, (pt[1] || 0).toFixed(6));
              out(30, '0.0');
            }
          }
        } else {
          const srcPts = ent.points;
          writeCommon('LWPOLYLINE');
          out(90, srcPts.length);
          out(70, ent.closed ? 1 : 0);
          if (ent.constantWidth && ent.constantWidth > 0) out(43, Number(ent.constantWidth).toFixed(6));
          for (let i = 0; i < srcPts.length; i++) {
            const pt = srcPts[i];
            out(10, (pt[0] || 0).toFixed(6));
            out(20, (pt[1] || 0).toFixed(6));
            const b = pt[2] || (ent.bulges && ent.bulges[i]) || 0;
            if (Math.abs(b) > 1e-6) out(42, b.toFixed(6));
          }
        }
      } else if (ent.type === 'SOLID' && Array.isArray(ent.points) && ent.points.length >= 3) {
        writeCommon('SOLID');
        const p0 = ent.points[0], p1 = ent.points[1], p2 = ent.points[2], p3 = ent.points[3] || p2;
        out(10, p0[0].toFixed(6)); out(20, p0[1].toFixed(6)); out(30, '0.0');
        out(11, p1[0].toFixed(6)); out(21, p1[1].toFixed(6)); out(31, '0.0');
        out(12, p3[0].toFixed(6)); out(22, p3[1].toFixed(6)); out(32, '0.0');
        out(13, p2[0].toFixed(6)); out(23, p2[1].toFixed(6)); out(33, '0.0');
      } else if (ent.type === 'POINT') {
        writeCommon('POINT');
        out(10, (ent.x || 0).toFixed(6));
        out(20, (ent.y || 0).toFixed(6));
        out(30, '0.0');
      } else if (ent.type === 'INSERT' && ent.blockName) {
        writeCommon('INSERT');
        out(2, ent.blockName);
        out(10, (ent.x || 0).toFixed(6));
        out(20, (ent.y || 0).toFixed(6));
        out(30, '0.0');
        out(41, (ent.scaleX || 1).toFixed(6));
        out(42, (ent.scaleY || 1).toFixed(6));
        out(50, (ent.rotation || 0).toFixed(6));
      } else if (ent.type === 'DIMENSION') {
        writeCommon('DIMENSION');
        if (ent.blockName) out(2, ent.blockName);
        out(10, (ent.defX != null ? ent.defX : (ent.x1 || 0)).toFixed(6));
        out(20, (ent.defY != null ? ent.defY : (ent.y1 || 0)).toFixed(6));
        out(30, '0.0');
        out(11, (ent.textX != null ? ent.textX : ((ent.x1 || 0) + (ent.x2 || 0)) / 2).toFixed(6));
        out(21, (ent.textY != null ? ent.textY : ((ent.y1 || 0) + (ent.y2 || 0)) / 2).toFixed(6));
        out(31, '0.0');
        out(13, (ent.x1 || 0).toFixed(6));
        out(23, (ent.y1 || 0).toFixed(6));
        out(33, '0.0');
        out(14, (ent.x2 || 0).toFixed(6));
        out(24, (ent.y2 || 0).toFixed(6));
        out(34, '0.0');
        if (ent.measurement != null && ent.measurement > 0) out(42, Number(ent.measurement).toFixed(6));
        if (ent.rotation) out(50, Number(ent.rotation).toFixed(6));
        if (ent.text) out(1, sanitizeAsciiDXFText(ent.text));
      } else if (ent.type === 'TEXT') {
        writeCommon(ent.isMText ? 'MTEXT' : 'TEXT');
        out(10, (ent.x || 0).toFixed(6));
        out(20, (ent.y || 0).toFixed(6));
        out(30, '0.0');
        out(40, Math.max(0.1, ent.height || 2.5).toFixed(6));
        if (ent.isMText) {
          if (ent.boxWidth > 0) out(41, ent.boxWidth.toFixed(6));
          const hm = ent.hMode || 'left', vm = ent.vMode || 'top';
          const colIdx = hm === 'center' ? 2 : (hm === 'right' ? 3 : 1);
          const rowIdx = vm === 'middle' ? 3 : (vm === 'bottom' || vm === 'baseline' ? 6 : 0);
          out(71, rowIdx + colIdx);
        } else {
          if (ent.widthFactor && Math.abs(ent.widthFactor - 0.86) > 0.0001) out(41, ent.widthFactor.toFixed(6));
          const hm = ent.hMode || 'left', vm = ent.vMode || 'baseline';
          const ha = ent.hAlign != null && ent.hAlign > 0 ? ent.hAlign : (hm === 'center' ? 1 : (hm === 'right' ? 2 : 0));
          const va = ent.vAlign != null && ent.vAlign > 0 ? ent.vAlign : (vm === 'bottom' ? 1 : (vm === 'middle' ? 2 : (vm === 'top' ? 3 : 0)));
          if (ha > 0 || va > 0) {
            out(11, (ent.x || 0).toFixed(6));
            out(21, (ent.y || 0).toFixed(6));
            out(31, '0.0');
            if (ha > 0) out(72, ha);
            if (va > 0) out(73, va);
          }
        }
        if (ent.rotation) out(50, Number(ent.rotation).toFixed(6));
        if (ent.textStyle && ent.textStyle !== 'STANDARD') out(7, ent.textStyle);
        const txtOut = ent.isMText ? String(ent.text || '').replace(/\r?\n/g, '\\P') : sanitizeAsciiDXFText(ent.text);
        out(1, txtOut);
      } else if (ent.type === 'HATCH') {
        const loops = (Array.isArray(ent.loops) && ent.loops.length) ? ent.loops : (Array.isArray(ent.points) && ent.points.length >= 2 ? [ent.points] : []);
        const validLoops = loops.filter(lp => Array.isArray(lp) && lp.length >= 2);
        if (validLoops.length > 0) {
          writeCommon('HATCH');
          out(2, ent.patternName || 'SOLID');
          out(70, ent.solid !== false ? 1 : 0);
          out(91, validLoops.length);
          for (const lp of validLoops) {
            out(92, 2);
            out(72, 0);
            out(73, 1);
            out(93, lp.length);
            for (const pt of lp) {
              out(10, (pt[0] || 0).toFixed(6));
              out(20, (pt[1] || 0).toFixed(6));
            }
            out(97, 0);
          }
          out(75, 0);
          out(76, 1);
        }
      }
    }

    _getEntityStrokeScale(ent, lyrObj, ltype) {
      if (ent.type === 'HATCH') return 0.55;
      const lyrName = String(ent.layer || '').toUpperCase();
      if (/DIM|CENTER|HATCH|GRID|AXIS|HIDDEN|PHANTOM|GUIDE|ANNOT|TEXT/.test(lyrName)) return 0.72;
      if (ltype && ltype !== 'CONTINUOUS' && !ltype.includes('BYLAYER')) return 0.76;
      const lwCode = ent.lineweight != null ? ent.lineweight : (lyrObj ? lyrObj.lineweight : -3);
      if (lwCode != null && lwCode >= 0) {
        if (lwCode <= 13) return 0.68;
        if (lwCode >= 50) return 1.25;
      }
      return 1.0;
    }

    /**
     * Render parsed DXF entities to a 2D HTML Canvas with crisp AutoCAD hairlines, alignment & CJK typography
     */
    renderToCanvas(canvas, options = {}) {
      const ctx = canvas.getContext('2d');
      const bounds = options.sharedBounds || this.bounds;
      const bw = Math.max(1e-3, bounds.maxX - bounds.minX || 100);
      const bh = Math.max(1e-3, bounds.maxY - bounds.minY || 100);

      const rotDegPage = (((Number(options.rotation) || 0) % 360) + 360) % 360;
      const swappedRot = (rotDegPage === 90 || rotDegPage === 270);
      const rawFullW = Number(options.pageWidth) > 0 ? Number(options.pageWidth) : canvas.width;
      const rawFullH = Number(options.pageHeight) > 0 ? Number(options.pageHeight) : canvas.height;
      const fullW = swappedRot ? rawFullH : rawFullW;
      const fullH = swappedRot ? rawFullW : rawFullH;
      const viewOffX = Number(options.offsetX) || 0;
      const viewOffY = Number(options.offsetY) || 0;

      const padding = options.padding != null ? options.padding : 40;
      const targetW = Math.max(10, fullW - padding * 2);
      const targetH = Math.max(10, fullH - padding * 2);

      const scale = Math.min(targetW / bw, targetH / bh);
      const offsetX = padding + (targetW - bw * scale) / 2;
      const offsetY = padding + (targetH - bh * scale) / 2;

      const pageMirX = !!options.mirrorX;
      const pageMirY = !!options.mirrorY;
      const mapPageRot = (px, py) => {
        let rx = px, ry = py;
        if (rotDegPage === 90) { rx = fullH - py; ry = px; }
        else if (rotDegPage === 180) { rx = fullW - px; ry = fullH - py; }
        else if (rotDegPage === 270) { rx = py; ry = fullW - px; }
        if (pageMirX) rx = rawFullW - rx;
        if (pageMirY) ry = rawFullH - ry;
        return [rx + viewOffX, ry + viewOffY];
      };
      const hasPageTf = !!(rotDegPage || pageMirX || pageMirY);
      const tx = x => offsetX + (x - bounds.minX) * scale + (hasPageTf ? 0 : viewOffX);
      const ty = y => fullH - (offsetY + (y - bounds.minY) * scale) + (hasPageTf ? 0 : viewOffY);

      const bg = options.background || '#0c1017';
      const isLightBg = /^#?(fff|ffffff|f[0-9a-f]{5}|e[0-9a-f]{5})/i.test(bg.trim());

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (options.showGrid) {
        ctx.save();
        ctx.strokeStyle = isLightBg ? 'rgba(148, 163, 184, 0.22)' : 'rgba(56, 189, 248, 0.12)';
        ctx.lineWidth = 0.75;
        const gridStep = Math.max(40, Math.round(targetW / 16));
        ctx.beginPath();
        for (let gx = padding; gx <= fullW - padding; gx += gridStep) {
          const [x0, y0] = mapPageRot(gx, padding);
          const [x1, y1] = mapPageRot(gx, fullH - padding);
          ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        }
        for (let gy = padding; gy <= fullH - padding; gy += gridStep) {
          const [x0, y0] = mapPageRot(padding, gy);
          const [x1, y1] = mapPageRot(fullW - padding, gy);
          ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        }
        ctx.stroke();
        ctx.restore();
      }

      const totalPrims = this.getTotalPrimitiveCount();
      // Viewport frustum culling bounds in world space when rendering a zoomed crop
      const isCroppedView = (!rotDegPage && (Math.abs(viewOffX) > 1 || Math.abs(viewOffY) > 1 || fullW > canvas.width + 4 || fullH > canvas.height + 4));
      const densityScale = totalPrims > 2000 ? 0.78 : (totalPrims > 600 ? 0.88 : 0.96);
      const reqLw = Number(options.lineWidth) > 0 ? Number(options.lineWidth) : 1.0;
      const baseLw = Math.max(0.95, Math.min(1.65, reqLw * densityScale));
      const diffEntityIds = (options.diffEntityIds && typeof options.diffEntityIds.has === 'function' && options.diffEntityIds.size > 0)
        ? options.diffEntityIds
        : null;
      const diffHighlightColor = options.diffHighlightColor || null;
      const diffLw = baseLw;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const hiddenLayers = options.hiddenLayers || new Set();
      const invScale = 1 / Math.max(1e-9, scale);
      const visMinX = isCroppedView ? (bounds.minX + (-24 - offsetX - viewOffX) * invScale) : -Infinity;
      const visMaxX = isCroppedView ? (bounds.minX + (canvas.width + 24 - offsetX - viewOffX) * invScale) : Infinity;
      const visMinY = isCroppedView ? (bounds.minY + (fullH - (canvas.height + 24 - viewOffY) - offsetY) * invScale) : -Infinity;
      const visMaxY = isCroppedView ? (bounds.minY + (fullH - (-24 - viewOffY) - offsetY) * invScale) : Infinity;
      let curDashType = 0;

      const drawEntity = (ent, parentTransform = null, depth = 0, inDimBlock = false, isDiffEnt = false) => {
        if (depth > 8) return;
        if (/^defpoints$/i.test(ent.layer || '') && ent.type !== 'DIMENSION') return;
        const lyrObj = this.layers[ent.layer];
        if (lyrObj && (lyrObj.visible === false || lyrObj.frozen === true)) return;
        if (hiddenLayers.has && hiddenLayers.has(ent.layer)) return;
        if (ent.type === 'POINT' && inDimBlock) return;
        if (depth === 0 && isCroppedView) {
          const ebb = this.getEntityBBox(ent);
          if (ebb && (ebb.maxX < visMinX || ebb.minX > visMaxX || ebb.maxY < visMinY || ebb.minY > visMaxY)) return;
        }

        const mapPt = (x, y) => {
          if (!parentTransform) {
            return hasPageTf ? mapPageRot(tx(x), ty(y)) : [tx(x), ty(y)];
          }
          const { bx, by, ix, iy, sx, sy, cosR, sinR } = parentTransform;
          const dx = (x - bx) * sx;
          const dy = (y - by) * sy;
          const wx = ix + dx * cosR - dy * sinR;
          const wy = iy + dx * sinR + dy * cosR;
          return hasPageTf ? mapPageRot(tx(wx), ty(wy)) : [tx(wx), ty(wy)];
        };

        const col = (isDiffEnt && diffHighlightColor)
          ? diffHighlightColor
          : ((!isDiffEnt && diffEntityIds && diffHighlightColor && options.commonColor)
              ? options.commonColor
              : this._resolveColor(ent, isLightBg));
        ctx.strokeStyle = col;
        ctx.fillStyle = col;

        const ltype = String(ent.linetype || (lyrObj && lyrObj.linetype) || 'CONTINUOUS').toUpperCase();
        const entLw = baseLw * (inDimBlock ? 0.78 : this._getEntityStrokeScale(ent, lyrObj, ltype));
        ctx.lineWidth = entLw;

        const nextDash = (ltype === 'CONTINUOUS' || ltype === 'BYLAYER') ? 0
          : (ltype.includes('DASH') || ltype.includes('HIDDEN')) ? 1
          : ltype.includes('CENTER') ? 2
          : (ltype.includes('DOT') || ltype.includes('PHANTOM')) ? 3 : 0;
        if (nextDash !== curDashType) {
          curDashType = nextDash;
          if (nextDash === 1) ctx.setLineDash([6, 4]);
          else if (nextDash === 2) ctx.setLineDash([12, 3.5, 2.5, 3.5]);
          else if (nextDash === 3) ctx.setLineDash([2.5, 3.5]);
          else ctx.setLineDash([]);
        }

        if (ent.type === 'LINE') {
          const [x1, y1] = mapPt(ent.x1, ent.y1);
          const [x2, y2] = mapPt(ent.x2, ent.y2);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        } else if (ent.type === 'CIRCLE') {
          const [cx, cy] = mapPt(ent.cx, ent.cy);
          const rScale = parentTransform ? Math.abs(parentTransform.sx) : 1;
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(0.4, ent.r * scale * rScale), 0, Math.PI * 2);
          ctx.stroke();
        } else if (ent.type === 'ARC') {
          const sAng = ent.startAngle || 0;
          let eAng = ent.endAngle != null ? ent.endAngle : 360;
          if (eAng <= sAng) eAng += 360;
          const sweep = eAng - sAng;
          const steps = Math.max(12, Math.min(72, Math.ceil(sweep / 4)));
          ctx.beginPath();
          for (let s = 0; s <= steps; s++) {
            const rad = ((sAng + (sweep * s) / steps) * Math.PI) / 180;
            const [ax, ay] = mapPt(ent.cx + ent.r * Math.cos(rad), ent.cy + ent.r * Math.sin(rad));
            if (s === 0) ctx.moveTo(ax, ay);
            else ctx.lineTo(ax, ay);
          }
          ctx.stroke();
        } else if (ent.type === 'ELLIPSE') {
          const rx = ent.rx || Math.hypot(ent.mx || 10, ent.my || 0) || 10;
          const ry = ent.ry || (rx * (ent.ratio || 0.5)) || 5;
          const rotE = ent.rotation != null ? ent.rotation : Math.atan2(ent.my || 0, ent.mx || 1);
          const steps = 48;
          const sParam = ent.startParam ?? 0;
          let eParam = ent.endParam ?? (Math.PI * 2);
          if (eParam <= sParam) eParam += Math.PI * 2;
          const isFull = Math.abs((eParam - sParam) - Math.PI * 2) < 1e-3;
          const cosE = Math.cos(rotE), sinE = Math.sin(rotE);
          ctx.beginPath();
          for (let s = 0; s <= steps; s++) {
            const t = sParam + ((eParam - sParam) * s) / steps;
            const lx = rx * Math.cos(t), ly = ry * Math.sin(t);
            const [ex, ey] = mapPt(ent.cx + lx * cosE - ly * sinE, ent.cy + lx * sinE + ly * cosE);
            if (s === 0) ctx.moveTo(ex, ey);
            else ctx.lineTo(ex, ey);
          }
          if (isFull) ctx.closePath();
          ctx.stroke();
        } else if ((ent.type === 'LWPOLYLINE' || ent.type === 'SPLINE') && ent.points && ent.points.length > 1) {
          const rPts = ent.renderPoints || ent.points;
          ctx.beginPath();
          const [p0x, p0y] = mapPt(rPts[0][0], rPts[0][1]);
          ctx.moveTo(p0x, p0y);
          for (let p = 1; p < rPts.length; p++) {
            const [px, py] = mapPt(rPts[p][0], rPts[p][1]);
            ctx.lineTo(px, py);
          }
          if (ent.closed) ctx.closePath();
          ctx.stroke();
          if (ent.isLeader && rPts.length >= 2) {
            const [x1, y1] = mapPt(rPts[0][0], rPts[0][1]);
            const [x2, y2] = mapPt(rPts[1][0], rPts[1][1]);
            const ang = Math.atan2(y2 - y1, x2 - x1);
            const ah = Math.max(4, Math.min(10, bw * 0.008 * scale));
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x1 + ah * Math.cos(ang - 0.32), y1 + ah * Math.sin(ang - 0.32));
            ctx.lineTo(x1 + ah * Math.cos(ang + 0.32), y1 + ah * Math.sin(ang + 0.32));
            ctx.closePath();
            ctx.fill();
          }
        } else if (ent.type === 'HATCH' && ent.loops) {
          if (curDashType !== 0) { curDashType = 0; ctx.setLineDash([]); }
          for (const lp of ent.loops) {
            if (!lp || lp.length < 2) continue;
            ctx.beginPath();
            const [p0x, p0y] = mapPt(lp[0][0], lp[0][1]);
            ctx.moveTo(p0x, p0y);
            for (let k = 1; k < lp.length; k++) {
              const [px, py] = mapPt(lp[k][0], lp[k][1]);
              ctx.lineTo(px, py);
            }
            ctx.stroke();
          }
        } else if (ent.type === 'SOLID' && ent.points && ent.points.length >= 3) {
          ctx.save();
          if (curDashType !== 0) { curDashType = 0; ctx.setLineDash([]); }
          ctx.globalAlpha = inDimBlock ? 0.92 : 0.65;
          ctx.beginPath();
          const [p0x, p0y] = mapPt(ent.points[0][0], ent.points[0][1]);
          ctx.moveTo(p0x, p0y);
          for (let p = 1; p < ent.points.length; p++) {
            const [px, py] = mapPt(ent.points[p][0], ent.points[p][1]);
            ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else if (ent.type === 'POINT') {
          const [px, py] = mapPt(ent.x, ent.y);
          ctx.beginPath();
          ctx.arc(px, py, 0.9, 0, Math.PI * 2);
          ctx.fill();
        } else if (ent.type === 'INSERT') {
          const blk = this._getBlock(ent.blockName);
          if (blk && blk.entities) {
            const parentMirrorFlip = parentTransform && ((parentTransform.sx || 1) * (parentTransform.sy || 1) < 0) ? -1 : 1;
            const totalRotDeg = (ent.rotation || 0) * parentMirrorFlip + (parentTransform ? (parentTransform.rotDeg || 0) : 0);
            const rad = totalRotDeg * Math.PI / 180;
            const [insWx, insWy] = parentTransform ? (() => {
              const { bx, by, ix, iy, sx, sy, cosR, sinR } = parentTransform;
              const dx = (ent.x - bx) * sx, dy = (ent.y - by) * sy;
              return [ix + dx * cosR - dy * sinR, iy + dx * sinR + dy * cosR];
            })() : [ent.x, ent.y];
            const tf = {
              bx: blk.baseX || 0,
              by: blk.baseY || 0,
              ix: insWx,
              iy: insWy,
              sx: (ent.scaleX || 1) * (parentTransform ? (parentTransform.sx || 1) : 1),
              sy: (ent.scaleY || 1) * (parentTransform ? (parentTransform.sy || 1) : 1),
              cosR: Math.cos(rad),
              sinR: Math.sin(rad),
              rotDeg: totalRotDeg
            };
            const isDim = inDimBlock || /^\*D/i.test(ent.blockName);
            const subSet = (isDiffEnt && ent._diffSubIndices && ent._diffSubIndices.size > 0) ? ent._diffSubIndices : null;
            for (let si = 0; si < blk.entities.length; si++) {
              const subEnt = blk.entities[si];
              drawEntity(subEnt, tf, depth + 1, isDim, subSet ? subSet.has(si) : isDiffEnt);
            }
          }
        } else if (ent.type === 'DIMENSION') {
          if (ent.blockName && this._getBlock(ent.blockName)) {
            const dBlk = this._getBlock(ent.blockName);
            const subSet = (isDiffEnt && ent._diffSubIndices && ent._diffSubIndices.size > 0) ? ent._diffSubIndices : null;
            let hasVisibleDimText = false;
            for (let si = 0; si < dBlk.entities.length; si++) {
              const subE = dBlk.entities[si];
              if (subE && (subE.type === 'TEXT' || subE.type === 'MTEXT') && String(subE.text || '').trim().length > 0) {
                hasVisibleDimText = true;
              }
              drawEntity(subE, parentTransform, depth + 1, true, subSet ? subSet.has(si) : isDiffEnt);
            }
            if (!hasVisibleDimText) {
              const fallbackLbl = resolveDimensionLabel(ent);
              if (fallbackLbl) {
                const [txP, tyP] = mapPt(ent.textX != null ? ent.textX : ((ent.x1 + ent.x2) / 2), ent.textY != null ? ent.textY : ((ent.y1 + ent.y2) / 2));
                const dimFs = Math.max(9, Math.min(28, bw * 0.012 * scale));
                ctx.save();
                ctx.font = `600 ${dimFs}px ${MULTILINGUAL_FONT_STACK}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = col;
                ctx.fillText(fallbackLbl, txP, tyP);
                ctx.restore();
              }
            }
          } else {
            const [x1, y1] = mapPt(ent.x1, ent.y1);
            const [x2, y2] = mapPt(ent.x2, ent.y2);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            const dist = Math.hypot(x2 - x1, y2 - y1);
            if (dist > 10) {
              const ang = Math.atan2(y2 - y1, x2 - x1);
              const ah = Math.min(7, Math.max(3.5, dist * 0.08));
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x1 + ah * Math.cos(ang - 0.3), y1 + ah * Math.sin(ang - 0.3));
              ctx.lineTo(x1 + ah * Math.cos(ang + 0.3), y1 + ah * Math.sin(ang + 0.3));
              ctx.closePath();
              ctx.fill();
              ctx.beginPath();
              ctx.moveTo(x2, y2);
              ctx.lineTo(x2 - ah * Math.cos(ang - 0.3), y2 - ah * Math.sin(ang - 0.3));
              ctx.lineTo(x2 - ah * Math.cos(ang + 0.3), y2 - ah * Math.sin(ang + 0.3));
              ctx.closePath();
              ctx.fill();
            }
            if (ent.text || ent.measurement != null) {
              const rawLbl = ent.text && ent.text !== '<>'
                ? (ent.measurement != null ? String(ent.text).replace(/<>/g, String(Number(Number(ent.measurement).toFixed(4)))) : String(ent.text))
                : (ent.measurement != null ? String(Number(Number(ent.measurement).toFixed(4))) : '');
              if (rawLbl) {
                if (curDashType !== 0) { curDashType = 0; ctx.setLineDash([]); }
                const [txP, tyP] = mapPt(ent.textX != null ? ent.textX : (ent.x1 + ent.x2) / 2, ent.textY != null ? ent.textY : (ent.y1 + ent.y2) / 2);
                const dimFs = Math.max(2.5, Math.min(2048, bw * 0.0095 * scale));
                ctx.save();
                ctx.translate(txP, tyP);
                if (rotDegPage) ctx.rotate((rotDegPage * Math.PI) / 180);
                if (pageMirX || pageMirY) ctx.scale(pageMirX ? -1 : 1, pageMirY ? -1 : 1);
                ctx.font = `500 ${dimFs}px ${MULTILINGUAL_FONT_STACK}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(rawLbl, 0, -2);
                ctx.restore();
              }
            }
          }
        } else if (ent.type === 'TEXT') {
          if (curDashType !== 0) { curDashType = 0; ctx.setLineDash([]); }
          const [px, py] = mapPt(ent.x, ent.y);
          const blkScaleY = parentTransform ? Math.abs(parentTransform.sy || parentTransform.sx || 1) : 1;
          const blkScaleX = parentTransform ? Math.abs(parentTransform.sx || parentTransform.sy || 1) : 1;
          const rawH = ent.height > 0 ? ent.height : (bw * 0.01);
          // Calibrated AutoCAD cap-height proportional font scaling (0.80 matches AutoCAD SHX cap-height vs CSS em-box)
          const fontSize = Math.max(1.2, Math.min(2048, rawH * blkScaleY * scale * 0.80));
          const rotDeg = (ent.rotation || 0) + (parentTransform ? (parentTransform.rotDeg || 0) : 0);
          const lines = ent.isMText && ent.boxWidth > 0
            ? wrapMTextLines(ent.text, ent.boxWidth, rawH, ent.widthFactor || 0.86)
            : String(ent.text || '').split('\n');
          const lineStep = fontSize * (ent.lineSpacing || 1.2);
          const totalH = fontSize + (lines.length - 1) * lineStep;
          const hMode = ent.hMode || 'left';
          const vMode = ent.vMode || 'baseline';
          let wf = (ent.widthFactor || 0.86) * (blkScaleX / Math.max(1e-4, blkScaleY));

          ctx.save();
          ctx.translate(px, py);
          if (pageMirX || pageMirY) ctx.scale(pageMirX ? -1 : 1, pageMirY ? -1 : 1);
          const totalRotDeg = rotDegPage - rotDeg;
          if (Math.abs(totalRotDeg) > 1e-4) ctx.rotate((totalRotDeg * Math.PI) / 180);
          ctx.font = `500 ${fontSize}px ${MULTILINGUAL_FONT_STACK}`;
          if (ent.fitWidth > 0 && lines.length === 1) {
            const targetPx = ent.fitWidth * blkScaleX * scale;
            const measured = ctx.measureText(lines[0]).width;
            if (measured > 1) wf = Math.min(wf, targetPx / measured);
          }
          if (Math.abs(wf - 1) > 0.01) ctx.scale(wf, 1);
          ctx.textAlign = hMode;
          ctx.textBaseline = 'alphabetic';

          let startY = 0;
          if (vMode === 'top') startY = fontSize * 0.88;
          else if (vMode === 'middle') startY = -totalH / 2 + fontSize * 0.82;
          else if (vMode === 'bottom') startY = -(lines.length - 1) * lineStep - fontSize * 0.12;
          else startY = 0;

          for (let li = 0; li < lines.length; li++) {
            ctx.fillText(lines[li], 0, startY + li * lineStep);
          }
          ctx.restore();
        }
      };

      const drawPrimitiveSegList = (segList, isDiffSeg) => {
        if (!Array.isArray(segList) || !segList.length) return;
        for (const seg of segList) {
          if (!seg) continue;
          drawEntity(seg, null, 0, false, isDiffSeg);
        }
      };

      const drawUnchangedBlockNonPrimSubs = (ent) => {
        if (!ent || (ent.type !== 'INSERT' && ent.type !== 'DIMENSION') || !ent.blockName) return;
        const blk = this._getBlock(ent.blockName);
        if (!blk || !Array.isArray(blk.entities) || !(ent._diffSubIndices instanceof Set)) return;
        let tf = null;
        if (ent.type === 'INSERT') {
          const rad = ((ent.rotation || 0) * Math.PI) / 180;
          tf = {
            bx: blk.baseX || 0, by: blk.baseY || 0,
            ix: ent.x || 0, iy: ent.y || 0,
            sx: ent.scaleX || 1, sy: ent.scaleY || 1,
            cosR: Math.cos(rad), sinR: Math.sin(rad),
            rotDeg: ent.rotation || 0
          };
        }
        const isDim = ent.type === 'DIMENSION' || /^\*D/i.test(ent.blockName || '');
        for (let si = 0; si < blk.entities.length; si++) {
          if (ent._diffSubIndices.has(si)) continue;
          const se = blk.entities[si];
          if (se && (se.type === 'TEXT' || se.type === 'SOLID')) {
            drawEntity(se, tf, 1, isDim, false);
          }
        }
      };

      if (diffEntityIds) {
        // Pass 1: Unchanged common entities AND unchanged sub-segments of partially modified polylines/lines/arcs/blocks
        for (const ent of this.entities) {
          if (!diffEntityIds.has(ent._id)) {
            drawEntity(ent, null, 0, false, false);
          } else if (Array.isArray(ent._commonSubSegments) && ent._commonSubSegments.length > 0) {
            drawPrimitiveSegList(ent._commonSubSegments, false);
            drawUnchangedBlockNonPrimSubs(ent);
          }
        }
        // Pass 2: Changed / Diff entities (or their exact differing sub-segments + changed measurement text) drawn on top with high-visibility strokes
        for (const ent of this.entities) {
          if (diffEntityIds.has(ent._id)) {
            if (ent.type !== 'DIMENSION' && ent.type !== 'TEXT' && ((Array.isArray(ent._commonSubSegments) && ent._commonSubSegments.length > 0) || (Array.isArray(ent._diffSubSegments) && ent._diffSubSegments.length > 0))) {
              if (Array.isArray(ent._diffSubSegments) && ent._diffSubSegments.length > 0) {
                drawPrimitiveSegList(ent._diffSubSegments, true);
              }
              if (Array.isArray(ent._diffTextEntities) && ent._diffTextEntities.length > 0) {
                for (const dte of ent._diffTextEntities) {
                  drawEntity(dte, null, 0, false, true);
                }
              } else if (ent.type === 'DIMENSION' && (!ent._diffSubSegments || ent._diffSubSegments.length === 0)) {
                drawEntity(ent, null, 0, false, true);
              }
            } else {
              drawEntity(ent, null, 0, false, true);
            }
          }
        }
      } else {
        for (const ent of this.entities) {
          drawEntity(ent, null, 0, false, false);
        }
      }
      ctx.setLineDash([]);
    }

    /**
     * Render parsed DXF entities directly into a 100% Native Vector PDF (via PDFLib)
     * with crisp AutoCAD hairline stroke weights, alignment/justification, and un-bloated Multilingual CJK/Unicode Sprites!
     */
    async toVectorPDFBytes(options = {}) {
      let pdfLibRef = (typeof PDFLib !== 'undefined' && PDFLib.PDFDocument) ? PDFLib : null;
      if (!pdfLibRef && typeof require === 'function') {
        try { pdfLibRef = require(['.', 'lib', 'pdf-lib.min.js'].join('/')); } catch (e) {}
      }
      if (!pdfLibRef || !pdfLibRef.PDFDocument) return null;

      const canvasW = options.canvasW || 2200;
      const canvasH = options.canvasH || 1600;
      const padding = options.padding != null ? options.padding : 40;
      const bounds = options.sharedBounds || this.bounds;
      const hiddenLayers = options.hiddenLayers || new Set();
      const hiddenKey = hiddenLayers.size ? [...hiddenLayers].sort().join(',') : '';
      const bKey = `${Number(bounds.minX || 0).toFixed(4)},${Number(bounds.minY || 0).toFixed(4)},${Number(bounds.maxX || 0).toFixed(4)},${Number(bounds.maxY || 0).toFixed(4)}`;
      const reqLw = options.lineWidth != null ? options.lineWidth : 1.0;
      let colHash = 2166136261 >>> 0;
      const layerKeys = Object.keys(this.layers || {}).sort();
      for (let li = 0; li < layerKeys.length; li++) {
        const lk = layerKeys[li];
        const lObj = this.layers[lk] || {};
        const lStr = `${lk}:${lObj.customHex || ''}:${lObj.color ?? ''}:${lObj.visible !== false ? 1 : 0}:${lObj.linetype || ''}:${lObj.lineweight ?? ''}`;
        for (let ci = 0; ci < lStr.length; ci++) {
          colHash ^= lStr.charCodeAt(ci);
          colHash = Math.imul(colHash, 16777619) >>> 0;
        }
      }
      for (let ei = 0; ei < this.entities.length; ei++) {
        const e = this.entities[ei];
        if (!e || e._deleted) continue;
        if (e.customHex || e.color !== undefined || e.trueColor !== undefined) {
          const eStr = `${e._id || ei}:${e.customHex || ''}:${e.color ?? ''}:${e.trueColor ?? ''}:${e.layer || ''}`;
          for (let ci = 0; ci < eStr.length; ci++) {
            colHash ^= eStr.charCodeAt(ci);
            colHash = Math.imul(colHash, 16777619) >>> 0;
          }
        }
      }
      const cacheKey = `${bKey}|${options.background || '#ffffff'}|${reqLw}|${!!options.showGrid}|${canvasW}x${canvasH}|${padding}|${hiddenKey}|rev:${this._mutationRev || 0}|col:${colHash.toString(16)}`;
      if (this._cachedPdfKey === cacheKey && this._cachedPdfBytes && this._cachedPdfBytes.length) {
        return this._cachedPdfBytes;
      }

      const { PDFDocument, StandardFonts, rgb, degrees, LineCapStyle } = pdfLibRef;
      const pdfDoc = await PDFDocument.create();
      const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const pageW = canvasW * 0.5;
      const pageH = canvasH * 0.5;
      const page = pdfDoc.addPage([pageW, pageH]);
      const bw = Math.max(1e-3, bounds.maxX - bounds.minX || 100);
      const bh = Math.max(1e-3, bounds.maxY - bounds.minY || 100);
      const targetW = Math.max(10, canvasW - padding * 2);
      const targetH = Math.max(10, canvasH - padding * 2);
      const scale = Math.min(targetW / bw, targetH / bh);
      const offsetX = padding + (targetW - bw * scale) / 2;
      const offsetY = padding + (targetH - bh * scale) / 2;

      const tx = x => (offsetX + (x - bounds.minX) * scale) * 0.5;
      const ty = y => (offsetY + (y - bounds.minY) * scale) * 0.5;

      const hexToRgb = hex => {
        let h = String(hex || '#000000').trim();
        if (/^#[0-9a-f]{3}$/i.test(h)) h = '#' + [...h.slice(1)].map(c => c + c).join('');
        if (!/^#[0-9a-f]{6}$/i.test(h)) h = '#0f172a';
        return rgb(
          parseInt(h.slice(1, 3), 16) / 255,
          parseInt(h.slice(3, 5), 16) / 255,
          parseInt(h.slice(5, 7), 16) / 255
        );
      };

      const bg = options.background || '#ffffff';
      const isLightBg = /^#?(fff|ffffff|f[0-9a-f]{5}|e[0-9a-f]{5})/i.test(bg.trim());
      page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: hexToRgb(bg) });

      if (options.showGrid) {
        const gridCol = isLightBg ? rgb(0.84, 0.88, 0.92) : rgb(0.12, 0.25, 0.36);
        const gridStep = Math.max(20, Math.round((targetW * 0.5) / 16));
        const padPt = padding * 0.5;
        for (let gx = padPt; gx <= pageW - padPt; gx += gridStep) {
          page.drawLine({ start: { x: gx, y: padPt }, end: { x: gx, y: pageH - padPt }, thickness: 0.25, color: gridCol });
        }
        for (let gy = padPt; gy <= pageH - padPt; gy += gridStep) {
          page.drawLine({ start: { x: padPt, y: gy }, end: { x: pageW - padPt, y: gy }, thickness: 0.25, color: gridCol });
        }
      }

      // True AutoCAD hairline stroke weight (counts nested block primitives so dense CAD drawings never look bulky!)
      const totalPrims = this.getTotalPrimitiveCount();
      const densityFactor = totalPrims > 2500 ? 0.17 : (totalPrims > 800 ? 0.21 : (totalPrims > 200 ? 0.26 : 0.32));
      const baseLw = Math.max(0.15, Math.min(0.52, reqLw * densityFactor));

      const drawSegs = (pts, closed, lw, colRgb, dashArray) => {
        if (!pts || pts.length < 2) return;
        const n = pts.length;
        // For multi-segment paths without dash or with >=3 vertices, use drawSvgPath so joints are continuous without double round-cap blobs
        if (typeof page.drawSvgPath === 'function' && n >= 3 && !dashArray) {
          const validPts = pts.filter(p => isFinite(p[0]) && isFinite(p[1]));
          if (validPts.length >= 2) {
            let dStr = `M ${validPts[0][0].toFixed(2)} ${(pageH - validPts[0][1]).toFixed(2)}`;
            for (let i = 1; i < validPts.length; i++) {
              dStr += ` L ${validPts[i][0].toFixed(2)} ${(pageH - validPts[i][1]).toFixed(2)}`;
            }
            if (closed) dStr += ' Z';
            try {
              page.drawSvgPath(dStr, {
                x: 0,
                y: pageH,
                borderColor: colRgb,
                borderWidth: lw,
                borderLineCap: LineCapStyle.Round
              });
              return;
            } catch (e) {}
          }
        }
        const count = closed ? n : n - 1;
        for (let i = 0; i < count; i++) {
          const p0 = pts[i], p1 = pts[(i + 1) % n];
          if (!isFinite(p0[0]) || !isFinite(p0[1]) || !isFinite(p1[0]) || !isFinite(p1[1])) continue;
          page.drawLine({
            start: { x: p0[0], y: p0[1] },
            end: { x: p1[0], y: p1[1] },
            thickness: lw,
            color: colRgb,
            lineCap: LineCapStyle.Round,
            ...(dashArray ? { dashArray } : {})
          });
        }
      };

      const drawFilledPolygon = (pts, colRgb, lw) => {
        if (!pts || pts.length < 3) return;
        const validPts = pts.filter(p => isFinite(p[0]) && isFinite(p[1]));
        if (validPts.length < 3) return;
        if (typeof page.drawSvgPath === 'function') {
          let dStr = `M ${validPts[0][0].toFixed(2)} ${(pageH - validPts[0][1]).toFixed(2)}`;
          for (let i = 1; i < validPts.length; i++) {
            dStr += ` L ${validPts[i][0].toFixed(2)} ${(pageH - validPts[i][1]).toFixed(2)}`;
          }
          dStr += ' Z';
          try {
            page.drawSvgPath(dStr, {
              x: 0,
              y: pageH,
              color: colRgb,
              borderColor: colRgb,
              borderWidth: Math.min(0.18, lw * 0.5)
            });
            return;
          } catch (e) {}
        }
        drawSegs(validPts, true, Math.min(0.25, lw * 0.65), colRgb);
      };

      const spriteCache = new Map();
      const getEmbeddedTextSprite = async (textStr, fontSizePt, colHex, wf) => {
        const key = `${textStr}|${fontSizePt.toFixed(2)}|${colHex}|${wf.toFixed(2)}`;
        if (spriteCache.has(key)) return spriteCache.get(key);
        const spr = renderMultilingualTextSprite(textStr, fontSizePt, colHex, wf, false);
        if (!spr) return null;
        const pngImg = await pdfDoc.embedPng(spr.pngBytes);
        const entry = { ...spr, pngImg };
        spriteCache.set(key, entry);
        return entry;
      };

      // Check if string can be encoded as 100% crisp vector WinAnsi text in StandardFonts.Helvetica (including Ø, °, ±, µ, ×)
      const toWinAnsiVectorText = str => {
        const mapped = String(str || '').replace(/⌀/g, 'Ø');
        for (let i = 0; i < mapped.length; i++) {
          const code = mapped.charCodeAt(i);
          const ch = mapped[i];
          if (code >= 0x20 && code <= 0x7E) continue;
          if (ch === 'Ø' || ch === 'ø' || ch === '°' || ch === '±' || ch === 'µ' || ch === '×' || ch === '÷') {
            try { fontReg.encodeText(ch); continue; } catch (e) { return null; }
          }
          return null;
        }
        return mapped;
      };

      const drawPdfTextBlock = async (rawText, px, py, fontSizePt, colHex, colRgb, rotDeg, hMode, vMode, widthFactor, fitWidthPt, boxWidthWorld, rawHWorld) => {
        if (!isFinite(px) || !isFinite(py) || !(fontSizePt > 0)) return;
        const lines = boxWidthWorld > 0 && rawHWorld > 0
          ? wrapMTextLines(rawText, boxWidthWorld, rawHWorld, widthFactor || 0.86)
          : String(rawText || '').split('\n');
        const lineStep = fontSizePt * 1.2;
        const totalH = fontSizePt + (lines.length - 1) * lineStep;
        const rotNum = Number.isFinite(rotDeg) ? rotDeg : 0;
        const rotRad = (rotNum * Math.PI) / 180;
        const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
        const hasDom = typeof document !== 'undefined';

        for (let idx = 0; idx < lines.length; idx++) {
          const ln = lines[idx];
          if (!ln || !ln.trim()) continue;
          const winAnsiLn = toWinAnsiVectorText(ln);
          let wf = Math.max(0.35, Math.min(2.0, widthFactor || 0.86));

          // Vertical local offset (Y-up in PDF)
          let yLocal = -idx * lineStep;
          if (vMode === 'top') yLocal = -fontSizePt * 0.82 - idx * lineStep;
          else if (vMode === 'middle') yLocal = totalH / 2 - fontSizePt * 0.82 - idx * lineStep;
          else if (vMode === 'bottom') yLocal = (lines.length - 1 - idx) * lineStep + fontSizePt * 0.12;

          if (winAnsiLn === null && hasDom) {
            // Render Japanese / Chinese / Korean / Tamil / Hindi / Arabic / Cyrillic via High-Res Un-bloated Sprite!
            const spr = await getEmbeddedTextSprite(ln, fontSizePt, colHex, wf);
            if (spr && spr.pngImg && isFinite(spr.wPt) && isFinite(spr.hPt)) {
              let drawW = spr.wPt;
              if (fitWidthPt > 0 && lines.length === 1 && spr.textWidthPt > fitWidthPt) {
                drawW *= fitWidthPt / spr.textWidthPt;
              }
              let xLocal = 0;
              if (hMode === 'center') xLocal = -drawW / 2;
              else if (hMode === 'right') xLocal = -drawW;
              const ySprite = yLocal - spr.baselineOffsetPt;
              const wx = px + xLocal * cosR - ySprite * sinR;
              const wy = py + xLocal * sinR + ySprite * cosR;
              if (isFinite(wx) && isFinite(wy) && drawW > 0 && spr.hPt > 0) {
                page.drawImage(spr.pngImg, {
                  x: wx,
                  y: wy,
                  width: drawW,
                  height: spr.hPt,
                  ...(rotNum ? { rotate: degrees(rotNum) } : {})
                });
              }
              continue;
            }
          }

          // Native Vector PDF Text (ASCII + WinAnsi CAD symbols Ø, °, ±, µ, ×)
          const safeLn = winAnsiLn !== null ? winAnsiLn : sanitizeAsciiDXFText(ln).replace(/[^\x20-\x7E]/g, '?');
          if (!safeLn) continue;
          // Calibrate Helvetica to match AutoCAD simplex/isocp technical font proportions without bulkiness
          let effSize = fontSizePt * Math.min(0.94, wf * 0.92);
          let lineW = fontReg.widthOfTextAtSize(safeLn, effSize);
          if (fitWidthPt > 0 && lines.length === 1 && lineW > fitWidthPt) {
            effSize *= fitWidthPt / lineW;
            lineW = fitWidthPt;
          }
          let xLocal = 0;
          if (hMode === 'center') xLocal = -lineW / 2;
          else if (hMode === 'right') xLocal = -lineW;
          const wx = px + xLocal * cosR - yLocal * sinR;
          const wy = py + xLocal * sinR + yLocal * cosR;
          if (!isFinite(wx) || !isFinite(wy) || !isFinite(effSize)) continue;
          page.drawText(safeLn, {
            x: wx,
            y: wy,
            size: Math.max(0.55, effSize),
            font: fontReg,
            color: colRgb,
            ...(rotNum ? { rotate: degrees(rotNum) } : {})
          });
        }
      };

      const drawEntity = async (ent, parentTransform = null, depth = 0, inDimBlock = false) => {
        if (depth > 8) return;
        if (/^defpoints$/i.test(ent.layer || '')) return;
        const lyrObj = this.layers[ent.layer];
        if (lyrObj && (lyrObj.visible === false || lyrObj.frozen === true)) return;
        if (hiddenLayers.has && hiddenLayers.has(ent.layer)) return;
        if (ent.type === 'POINT' && inDimBlock) return;

        const mapPt = (x, y) => {
          if (!parentTransform) return [tx(x), ty(y)];
          const { bx, by, ix, iy, sx, sy, cosR, sinR } = parentTransform;
          const dx = (x - bx) * sx;
          const dy = (y - by) * sy;
          const wx = ix + dx * cosR - dy * sinR;
          const wy = iy + dx * sinR + dy * cosR;
          return [tx(wx), ty(wy)];
        };

        const colHex = this._resolveColor(ent, isLightBg);
        const colRgb = hexToRgb(colHex);
        const ltype = String(ent.linetype || (lyrObj && lyrObj.linetype) || 'CONTINUOUS').toUpperCase();
        const entLw = baseLw * (inDimBlock ? 0.72 : this._getEntityStrokeScale(ent, lyrObj, ltype));
        let dashArray;
        if (ltype.includes('DASH') || ltype.includes('HIDDEN')) dashArray = [3.6, 2.2];
        else if (ltype.includes('CENTER')) dashArray = [6.5, 1.8, 1.5, 1.8];
        else if (ltype.includes('DOT') || ltype.includes('PHANTOM')) dashArray = [1.2, 1.8];

        if (ent.type === 'LINE') {
          const p1 = mapPt(ent.x1, ent.y1), p2 = mapPt(ent.x2, ent.y2);
          drawSegs([p1, p2], false, entLw, colRgb, dashArray);
        } else if (ent.type === 'CIRCLE') {
          const [cx, cy] = mapPt(ent.cx, ent.cy);
          if (!isFinite(cx) || !isFinite(cy)) return;
          const rScale = parentTransform ? Math.abs(parentTransform.sx) : 1;
          const radPt = Math.max(0.2, (ent.r || 0) * scale * 0.5 * rScale);
          if (!isFinite(radPt)) return;
          page.drawCircle({
            x: cx,
            y: cy,
            size: radPt,
            borderColor: colRgb,
            borderWidth: entLw,
            ...(dashArray ? { borderDashArray: dashArray } : {})
          });
        } else if (ent.type === 'ARC') {
          const sAng = ent.startAngle || 0;
          let eAng = ent.endAngle != null ? ent.endAngle : 360;
          if (eAng <= sAng) eAng += 360;
          const sweep = eAng - sAng;
          const steps = Math.max(12, Math.min(72, Math.ceil(sweep / 4)));
          const arcPts = [];
          for (let s = 0; s <= steps; s++) {
            const rad = ((sAng + (sweep * s) / steps) * Math.PI) / 180;
            arcPts.push(mapPt(ent.cx + ent.r * Math.cos(rad), ent.cy + ent.r * Math.sin(rad)));
          }
          drawSegs(arcPts, false, entLw, colRgb, dashArray);
        } else if (ent.type === 'ELLIPSE') {
          const steps = 48;
          const sParam = ent.startParam ?? 0;
          let eParam = ent.endParam ?? (Math.PI * 2);
          if (eParam <= sParam) eParam += Math.PI * 2;
          const isFull = Math.abs((eParam - sParam) - Math.PI * 2) < 1e-3;
          const cosE = Math.cos(ent.rotation || 0), sinE = Math.sin(ent.rotation || 0);
          const elPts = [];
          const count = isFull ? steps : steps + 1;
          for (let s = 0; s < count; s++) {
            const t = sParam + ((eParam - sParam) * s) / steps;
            const lx = ent.rx * Math.cos(t), ly = ent.ry * Math.sin(t);
            const wx = ent.cx + lx * cosE - ly * sinE;
            const wy = ent.cy + lx * sinE + ly * cosE;
            elPts.push(mapPt(wx, wy));
          }
          drawSegs(elPts, isFull, entLw, colRgb, dashArray);
        } else if (ent.type === 'LWPOLYLINE' && ent.points && ent.points.length > 1) {
          const pts = (ent.renderPoints || ent.points).map(p => mapPt(p[0], p[1]));
          drawSegs(pts, !!ent.closed, entLw, colRgb, dashArray);
          if (ent.isLeader && pts.length >= 2) {
            const [x1, y1] = pts[0], [x2, y2] = pts[1];
            const ang = Math.atan2(y2 - y1, x2 - x1);
            const ah = Math.max(2.2, Math.min(5.5, bw * 0.008 * scale * 0.5));
            drawFilledPolygon([
              [x1, y1],
              [x1 + ah * Math.cos(ang - 0.3), y1 + ah * Math.sin(ang - 0.3)],
              [x1 + ah * Math.cos(ang + 0.3), y1 + ah * Math.sin(ang + 0.3)]
            ], colRgb, entLw);
          }
        } else if (ent.type === 'HATCH' && ent.loops) {
          for (const lp of ent.loops) {
            if (!lp || lp.length < 2) continue;
            const pts = lp.map(p => mapPt(p[0], p[1]));
            drawSegs(pts, false, entLw, colRgb);
          }
        } else if (ent.type === 'SOLID' && ent.points && ent.points.length >= 3) {
          const pts = ent.points.map(p => mapPt(p[0], p[1]));
          drawFilledPolygon(pts, colRgb, entLw);
        } else if (ent.type === 'POINT') {
          const [px, py] = mapPt(ent.x, ent.y);
          if (isFinite(px) && isFinite(py)) {
            page.drawCircle({ x: px, y: py, size: 0.45, color: colRgb });
          }
        } else if (ent.type === 'INSERT') {
          const blk = this._getBlock(ent.blockName);
          if (blk && blk.entities) {
            const parentMirrorFlip = parentTransform && ((parentTransform.sx || 1) * (parentTransform.sy || 1) < 0) ? -1 : 1;
            const totalRotDeg = (ent.rotation || 0) * parentMirrorFlip + (parentTransform ? (parentTransform.rotDeg || 0) : 0);
            const rad = totalRotDeg * Math.PI / 180;
            const [insWx, insWy] = parentTransform ? (() => {
              const { bx, by, ix, iy, sx, sy, cosR, sinR } = parentTransform;
              const dx = (ent.x - bx) * sx, dy = (ent.y - by) * sy;
              return [ix + dx * cosR - dy * sinR, iy + dx * sinR + dy * cosR];
            })() : [ent.x, ent.y];
            const tf = {
              bx: blk.baseX || 0,
              by: blk.baseY || 0,
              ix: insWx,
              iy: insWy,
              sx: (ent.scaleX || 1) * (parentTransform ? (parentTransform.sx || 1) : 1),
              sy: (ent.scaleY || 1) * (parentTransform ? (parentTransform.sy || 1) : 1),
              cosR: Math.cos(rad),
              sinR: Math.sin(rad),
              rotDeg: totalRotDeg
            };
            const isDim = inDimBlock || /^\*D/i.test(ent.blockName);
            for (const subEnt of blk.entities) {
              await drawEntity(subEnt, tf, depth + 1, isDim);
            }
          }
        } else if (ent.type === 'DIMENSION') {
          if (ent.blockName && this._getBlock(ent.blockName)) {
            for (const subEnt of this._getBlock(ent.blockName).entities) {
              await drawEntity(subEnt, parentTransform, depth + 1, true);
            }
          } else {
            const p1 = mapPt(ent.x1, ent.y1), p2 = mapPt(ent.x2, ent.y2);
            drawSegs([p1, p2], false, entLw, colRgb, dashArray);
            const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
            if (dist > 6) {
              const ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
              const ah = Math.min(3.8, Math.max(2.0, dist * 0.07));
              drawFilledPolygon([
                p1,
                [p1[0] + ah * Math.cos(ang - 0.28), p1[1] + ah * Math.sin(ang - 0.28)],
                [p1[0] + ah * Math.cos(ang + 0.28), p1[1] + ah * Math.sin(ang + 0.28)]
              ], colRgb, entLw);
              drawFilledPolygon([
                p2,
                [p2[0] - ah * Math.cos(ang - 0.28), p2[1] - ah * Math.sin(ang - 0.28)],
                [p2[0] - ah * Math.cos(ang + 0.28), p2[1] - ah * Math.sin(ang + 0.28)]
              ], colRgb, entLw);
            }
            if (ent.text) {
              const [txP, tyP] = mapPt(ent.textX != null ? ent.textX : (ent.x1 + ent.x2) / 2, ent.textY != null ? ent.textY : (ent.y1 + ent.y2) / 2);
              const dimFs = Math.max(1.8, Math.min(11, bw * 0.0095 * scale * 0.5));
              await drawPdfTextBlock(ent.text, txP, tyP + 1.4, dimFs, colHex, colRgb, 0, 'center', 'bottom', 0.86, 0, 0, 0);
            }
          }
        } else if (ent.type === 'TEXT') {
          const [px, py] = mapPt(ent.x, ent.y);
          if (!isFinite(px) || !isFinite(py)) return;
          const blkScaleY = parentTransform ? Math.abs(parentTransform.sy || parentTransform.sx || 1) : 1;
          const blkScaleX = parentTransform ? Math.abs(parentTransform.sx || parentTransform.sy || 1) : 1;
          const rawH = ent.height > 0 ? ent.height : (bw * 0.01);
          // Strict proportional font scaling (no artificial 5pt floor that causes CAD labels to overlap!)
          const fontSize = Math.max(0.65, Math.min(48, rawH * blkScaleY * scale * 0.5));
          const rotDeg = (ent.rotation || 0) + (parentTransform ? (parentTransform.rotDeg || 0) : 0);
          const wf = (ent.widthFactor || 0.86) * (blkScaleX / Math.max(1e-4, blkScaleY));
          const fitWidthPt = ent.fitWidth > 0 ? (ent.fitWidth * blkScaleX * scale * 0.5) : 0;
          await drawPdfTextBlock(
            ent.text,
            px,
            py,
            fontSize,
            colHex,
            colRgb,
            rotDeg,
            ent.hMode || 'left',
            ent.vMode || 'baseline',
            wf,
            fitWidthPt,
            ent.isMText ? (ent.boxWidth || 0) : 0,
            rawH
          );
        }
      };

      for (const ent of this.entities) {
        await drawEntity(ent, null, 0, false);
      }

      const savedBytes = await pdfDoc.save();
      this._cachedPdfKey = cacheKey;
      this._cachedPdfBytes = savedBytes;
      return savedBytes;
    }
  }

  /**
   * True Native Vector-Level DXF Entity Comparator (Compares two parsed DXF drawings directly in CAD world space — NO PDF conversion!)
   * Supports Pre-Compare Layer Selection (comparedLayers), Frozen/Hidden/Locked layer filtering, Cross-Unit ($INSUNITS) normalization,
   * Added / Removed / Modified / Unchanged entity classification, and CAD spatial diff clustering.
   */
  function describeDXFEntity(e, parser = null) {
    if (!e) return '';
    if (e._oldMeasurementLabel && e._newMeasurementLabel && e._oldMeasurementLabel !== e._newMeasurementLabel) {
      return `${e.type} [${e.layer || '0'}]: "${e._oldMeasurementLabel}" → "${e._newMeasurementLabel}"`;
    }
    if (e.type === 'DIMENSION') {
      const lbl = resolveDimensionLabel(e, parser);
      return `DIMENSION [${e.layer || '0'}]${lbl ? ` "${lbl}"` : ''}`;
    }
    if (e.type === 'LINE') {
      const len = Math.hypot((e.x2 || 0) - (e.x1 || 0), (e.y2 || 0) - (e.y1 || 0));
      return `LINE (${(e.x1 || 0).toFixed(2)}, ${(e.y1 || 0).toFixed(2)}) → (${(e.x2 || 0).toFixed(2)}, ${(e.y2 || 0).toFixed(2)}) L=${len.toFixed(2)}`;
    }
    if (e.type === 'CIRCLE') {
      return `CIRCLE Center (${(e.cx || 0).toFixed(2)}, ${(e.cy || 0).toFixed(2)}) Ø=${((e.r || 0) * 2).toFixed(2)} (R=${(e.r || 0).toFixed(2)})`;
    }
    if (e.type === 'ARC') {
      return `ARC Center (${(e.cx || 0).toFixed(2)}, ${(e.cy || 0).toFixed(2)}) R=${(e.r || 0).toFixed(2)} ∠${(e.startAngle || 0).toFixed(1)}°..${(e.endAngle || 360).toFixed(1)}°`;
    }
    if (e.type === 'ELLIPSE') {
      return `ELLIPSE Center (${(e.cx || 0).toFixed(2)}, ${(e.cy || 0).toFixed(2)}) ${((e.rx || 0) * 2).toFixed(2)}×${((e.ry || 0) * 2).toFixed(2)}`;
    }
    if ((e.type === 'LWPOLYLINE' || e.type === 'SPLINE') && Array.isArray(e.points) && e.points.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of e.points) {
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
      }
      const w = (maxX - minX).toFixed(2), h = (maxY - minY).toFixed(2);
      const kindLbl = e.isSpline || e.type === 'SPLINE' ? 'SPLINE' : 'POLYLINE';
      return `${e.closed ? 'Closed' : 'Open'} ${kindLbl} (${e.points.length} vtx, ${w}×${h}) @ (${minX.toFixed(2)}, ${minY.toFixed(2)})`;
    }
    if (e.type === 'HATCH') {
      const lpCnt = Array.isArray(e.loops) ? e.loops.length : 1;
      return `HATCH [${e.patternName || (e.solid ? 'SOLID' : 'PATTERN')}] (${lpCnt} loop${lpCnt === 1 ? '' : 's'})`;
    }
    if (e.type === 'TEXT') {
      const alignInfo = ((e.hMode && e.hMode !== 'left') || (e.vMode && e.vMode !== 'baseline'))
        ? ` [${e.hMode || 'left'}/${e.vMode || 'baseline'}]`
        : '';
      const rotInfo = Math.abs(e.rotation || 0) > 1e-2 ? ` ∠${Number((e.rotation || 0).toFixed(1))}°` : '';
      return `${e.isMText ? 'MTEXT' : 'TEXT'} "${e.text || ''}" @ (${(e.x || 0).toFixed(2)}, ${(e.y || 0).toFixed(2)}) H=${(e.height || 0).toFixed(2)}${alignInfo}${rotInfo}`;
    }
    if (e.type === 'DIMENSION') {
      const tPos = (e.textX != null && e.textY != null) ? ` txt@(${(e.textX || 0).toFixed(2)}, ${(e.textY || 0).toFixed(2)})` : '';
      return `DIMENSION "${e.text || '<>'}" (${(e.x1 || 0).toFixed(2)}, ${(e.y1 || 0).toFixed(2)}) → (${(e.x2 || 0).toFixed(2)}, ${(e.y2 || 0).toFixed(2)})${tPos}`;
    }
    if (e.type === 'INSERT') {
      const rotInfo = Math.abs(e.rotation || 0) > 1e-2 ? ` ∠${Number((e.rotation || 0).toFixed(1))}°` : '';
      return `BLOCK INSERT [${e.blockName || ''}] @ (${(e.x || 0).toFixed(2)}, ${(e.y || 0).toFixed(2)})${rotInfo}`;
    }
    return `${e.type} @ (${(e.x ?? e.x1 ?? e.cx ?? 0).toFixed(2)}, ${(e.y ?? e.y1 ?? e.cy ?? 0).toFixed(2)})`;
  }

  function computeStandaloneEntityBBox(e, parserOrBlocks = null) {
    if (parserOrBlocks && typeof parserOrBlocks.getEntityBBox === 'function') {
      return parserOrBlocks.getEntityBBox(e);
    }
    if (parserOrBlocks && typeof parserOrBlocks === 'object' && !Array.isArray(parserOrBlocks)) {
      const dummy = {
        blocks: parserOrBlocks,
        _getBlock(n) {
          if (!n || !this.blocks) return null;
          const s = String(n).trim();
          return this.blocks[s] || this.blocks[s.toUpperCase()] || null;
        },
        _getBlockLocalBBox: DXFParser.prototype._getBlockLocalBBox,
        getEntityBBox: DXFParser.prototype.getEntityBBox
      };
      return dummy.getEntityBBox(e, 0);
    }
    if (!e) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    const dummy = {
      blocks: {},
      _getBlock() { return null; },
      _getBlockLocalBBox() { return null; },
      getEntityBBox: DXFParser.prototype.getEntityBBox
    };
    return dummy.getEntityBBox(e, 0);
  }


  /* ============================================================================
   * [MODULE SECTION: SUB-SEGMENT GEOMETRIC DIFF & STEPPED BOX BRIDGE]
   * WHAT THIS IS: Connects `dxf_engine.js` to the split `dxf_compare_core.js`
   *   companion module for decomposing polylines/arcs/lines, clipping collinear
   *   shared intervals, and generating 5-10 mil stepped highlight boxes (`box box box`).
   * WHY / HOW TO EDIT: Edit `dxf_compare_core.js` directly to customize segment
   *   clipping math or stepped box sizing without bloating the main DXF parser/writer.
   * ============================================================================ */
  const _dxfCmpCore = (typeof DXFCompareCore !== 'undefined' && DXFCompareCore)
    ? DXFCompareCore
    : (typeof require === 'function' ? (() => { try { return require('./dxf_compare_core.js'); } catch (e) { return null; } })() : null);

  function extractEntityPrimitiveSegments(ent, parser = null, parentTf = null, depth = 0) {
    return _dxfCmpCore ? _dxfCmpCore.extractEntityPrimitiveSegments(ent, parser, parentTf, depth, tessellateBulgeArc) : [];
  }
  function merge1DIntervals(intervals) {
    return _dxfCmpCore ? _dxfCmpCore.merge1DIntervals(intervals) : (intervals || []);
  }
  function clipSegmentAgainstPool(seg, candSegs, tol) {
    return _dxfCmpCore ? _dxfCmpCore.clipSegmentAgainstPool(seg, candSegs, tol) : { diff: [seg], common: [] };
  }
  function computeSegmentsBBox(segs) {
    return _dxfCmpCore ? _dxfCmpCore.computeSegmentsBBox(segs) : null;
  }
  function computeSteppedDiffBoxes(ent, mapPtFn, options = {}) {
    return _dxfCmpCore ? _dxfCmpCore.computeSteppedDiffBoxes(ent, mapPtFn, options) : [];
  }

  /* ============================================================================
   * [MODULE SECTION: NATIVE VECTOR DXF ENTITY COMPARATOR & MEMORY CACHE]
   * WHAT THIS IS: Compares parsed Rev A and Rev B DXF ASTs in CAD world space,
   *   normalizing cross-unit ($INSUNITS) drawings, matching tolerance-exact
   *   primitives, and isolating sub-segment modifications.
   * WHY / HOW TO EDIT: Edit `isSameEntityWithinTol()` or `compareDXFEntities()`
   *   to add custom entity tolerance rules, or call `clearDXFCaches()` to free memory.
   * ============================================================================ */
  let _lastDiffCache = { pA: null, pB: null, revA: -1, revB: -1, key: '', result: null };

  function getBlockGeometryDigest(parser, blockName, qFn, depth = 0, unitScale = 1.0) {
    if (!parser || !blockName || depth > 6) return '';
    const blk = parser._getBlock ? parser._getBlock(blockName) : (parser.blocks && (parser.blocks[blockName] || parser.blocks[String(blockName).toUpperCase()]));
    if (!blk || !Array.isArray(blk.entities) || !blk.entities.length) return '';
    const k = Number.isFinite(unitScale) && unitScale > 0 ? unitScale : 1.0;
    const qs = v => qFn((Number(v) || 0) * k);
    const parts = [];
    const maxEnts = Math.min(2048, blk.entities.length);
    for (let i = 0; i < maxEnts; i++) {
      const se = blk.entities[i];
      if (!se || se.type === 'POINT') continue;
      if (se.type === 'LINE') {
        const p1 = `${qs(se.x1)},${qs(se.y1)}`, p2 = `${qs(se.x2)},${qs(se.y2)}`;
        parts.push(`L:${p1 < p2 ? p1 + ':' + p2 : p2 + ':' + p1}`);
      } else if (se.type === 'CIRCLE') {
        parts.push(`C:${qs(se.cx)},${qs(se.cy)},${qs(se.r)}`);
      } else if (se.type === 'ARC') {
        parts.push(`A:${qs(se.cx)},${qs(se.cy)},${qs(se.r)},${qFn(se.startAngle || 0)},${qFn(se.endAngle ?? 360)}`);
      } else if (se.type === 'ELLIPSE') {
        const rx = se.rx || Math.hypot(se.mx || 10, se.my || 0) || 1;
        const ry = se.ry || rx * (se.ratio || 0.5);
        parts.push(`E:${qs(se.cx)},${qs(se.cy)},${qs(rx)},${qs(ry)},${qFn(se.rotation || 0)}`);
      } else if ((se.type === 'LWPOLYLINE' || se.type === 'SPLINE' || se.type === 'SOLID') && Array.isArray(se.points)) {
        const vStr = se.points.map(pt => `${qs(pt[0])},${qs(pt[1])}${pt[2] ? ':' + qFn(pt[2]) : ''}`).join(',');
        parts.push(`P:${se.closed ? 1 : 0}:${vStr}`);
      } else if (se.type === 'HATCH') {
        const lps = Array.isArray(se.loops) ? se.loops : (Array.isArray(se.points) ? [se.points] : []);
        const hStr = lps.map(lp => (lp || []).map(pt => `${qs(pt[0])},${qs(pt[1])}`).join(',')).join('/');
        parts.push(`H:${se.solid ? 1 : 0}:${se.patternName || ''}:${hStr}`);
      } else if (se.type === 'TEXT') {
        parts.push(`T:${se.text || ''}@${qs(se.x || 0)},${qs(se.y || 0)}:${qFn(se.rotation || 0)}:${se.hMode || 'left'}:${se.vMode || 'baseline'}`);
      } else if (se.type === 'DIMENSION') {
        parts.push(`D:${se.text || ''}@${qs(se.x1 || 0)},${qs(se.y1 || 0)}->${qs(se.x2 || 0)},${qs(se.y2 || 0)}:${qs(se.textX ?? se.x ?? 0)},${qs(se.textY ?? se.y ?? 0)}`);
      } else if (se.type === 'INSERT' && se.blockName) {
        parts.push(`I:${String(se.blockName).toUpperCase()}@${qs(se.x || 0)},${qs(se.y || 0)}:${qFn(se.scaleX || 1)},${qFn(se.scaleY || 1)},${qFn(se.rotation || 0)}:${getBlockGeometryDigest(parser, se.blockName, qFn, depth + 1, k)}`);
      }
    }
    return parts.join(';');
  }

  function isSameEntityWithinTol(eA, eB, tol, parserA, parserB, qFn, unitRatio = 1.0) {
    if (!eA || !eB || eA.type !== eB.type) return false;
    const t = Math.max(1e-5, tol * 1.05);
    const angTol = Math.max(0.05, tol * 2);
    const aDiff = (a, b) => { const d = Math.abs(((a || 0) - (b || 0)) % 360); return Math.min(d, 360 - d); };
    if (eA.type === 'LINE') {
      const d1 = Math.hypot((eA.x1 || 0) - (eB.x1 || 0), (eA.y1 || 0) - (eB.y1 || 0)) <= t &&
                 Math.hypot((eA.x2 || 0) - (eB.x2 || 0), (eA.y2 || 0) - (eB.y2 || 0)) <= t;
      const d2 = Math.hypot((eA.x1 || 0) - (eB.x2 || 0), (eA.y1 || 0) - (eB.y2 || 0)) <= t &&
                 Math.hypot((eA.x2 || 0) - (eB.x1 || 0), (eA.y2 || 0) - (eB.y1 || 0)) <= t;
      return d1 || d2;
    }
    if (eA.type === 'CIRCLE') {
      return Math.hypot((eA.cx || 0) - (eB.cx || 0), (eA.cy || 0) - (eB.cy || 0)) <= t &&
             Math.abs((eA.r || 0) - (eB.r || 0)) <= t;
    }
    if (eA.type === 'ARC') {
      return Math.hypot((eA.cx || 0) - (eB.cx || 0), (eA.cy || 0) - (eB.cy || 0)) <= t &&
             Math.abs((eA.r || 0) - (eB.r || 0)) <= t &&
             aDiff(eA.startAngle, eB.startAngle) <= angTol &&
             aDiff(eA.endAngle, eB.endAngle) <= angTol;
    }
    if (eA.type === 'ELLIPSE') {
      const rxA = eA.rx || Math.hypot(eA.mx || 10, eA.my || 0) || 1;
      const ryA = eA.ry || rxA * (eA.ratio || 0.5);
      const rxB = eB.rx || Math.hypot(eB.mx || 10, eB.my || 0) || 1;
      const ryB = eB.ry || rxB * (eB.ratio || 0.5);
      const rotADeg = ((eA.rotation || 0) * 180) / Math.PI;
      const rotBDeg = ((eB.rotation || 0) * 180) / Math.PI;
      return Math.hypot((eA.cx || 0) - (eB.cx || 0), (eA.cy || 0) - (eB.cy || 0)) <= t &&
             Math.abs(rxA - rxB) <= t && Math.abs(ryA - ryB) <= t &&
             Math.min(aDiff(rotADeg, rotBDeg), aDiff(rotADeg + 180, rotBDeg)) <= angTol &&
             Math.abs((eA.startParam ?? 0) - (eB.startParam ?? 0)) <= Math.max(0.02, t) &&
             Math.abs((eA.endParam ?? (Math.PI * 2)) - (eB.endParam ?? (Math.PI * 2))) <= Math.max(0.02, t);
    }
    if ((eA.type === 'LWPOLYLINE' || eA.type === 'SPLINE' || eA.type === 'SOLID') && Array.isArray(eA.points) && Array.isArray(eB.points)) {
      if (!!eA.closed !== !!eB.closed || eA.points.length !== eB.points.length) return false;
      const n = eA.points.length;
      if (n === 0) return true;
      let fwd = true, rev = true;
      for (let i = 0; i < n; i++) {
        if (Math.hypot(eA.points[i][0] - eB.points[i][0], eA.points[i][1] - eB.points[i][1]) > t ||
            Math.abs((eA.points[i][2] || 0) - (eB.points[i][2] || 0)) > t) {
          fwd = false;
          break;
        }
      }
      if (fwd) return true;
      for (let i = 0; i < n; i++) {
        const j = n - 1 - i;
        const bA = eA.points[i][2] || 0;
        const bBRev = i < n - 1 ? -(eB.points[j - 1] ? (eB.points[j - 1][2] || 0) : 0) : -(eB.points[n - 1] ? (eB.points[n - 1][2] || 0) : 0);
        if (Math.hypot(eA.points[i][0] - eB.points[j][0], eA.points[i][1] - eB.points[j][1]) > t ||
            Math.abs(bA - bBRev) > t) {
          rev = false;
          break;
        }
      }
      return rev;
    }
    if (eA.type === 'HATCH') {
      if (!!eA.solid !== !!eB.solid || String(eA.patternName || '') !== String(eB.patternName || '')) return false;
      const lpsA = Array.isArray(eA.loops) && eA.loops.length ? eA.loops : (Array.isArray(eA.points) ? [eA.points] : []);
      const lpsB = Array.isArray(eB.loops) && eB.loops.length ? eB.loops : (Array.isArray(eB.points) ? [eB.points] : []);
      if (lpsA.length !== lpsB.length) return false;
      for (let li = 0; li < lpsA.length; li++) {
        const pA = lpsA[li] || [], pB = lpsB[li] || [];
        if (pA.length !== pB.length) return false;
        for (let k = 0; k < pA.length; k++) {
          if (Math.hypot((pA[k][0] || 0) - (pB[k][0] || 0), (pA[k][1] || 0) - (pB[k][1] || 0)) > t) return false;
        }
      }
      return true;
    }
    if (eA.type === 'TEXT') {
      return (eA.text || '') === (eB.text || '') &&
             Math.hypot((eA.x || 0) - (eB.x || 0), (eA.y || 0) - (eB.y || 0)) <= t &&
             aDiff(eA.rotation || 0, eB.rotation || 0) <= angTol &&
             (eA.hMode || 'left') === (eB.hMode || 'left') &&
             (eA.vMode || 'baseline') === (eB.vMode || 'baseline');
    }
    if (eA.type === 'DIMENSION') {
      const txA = eA.textX ?? eA.x ?? ((eA.x1 || 0) + (eA.x2 || 0)) * 0.5;
      const tyA = eA.textY ?? eA.y ?? ((eA.y1 || 0) + (eA.y2 || 0)) * 0.5;
      const txB = eB.textX ?? eB.x ?? ((eB.x1 || 0) + (eB.x2 || 0)) * 0.5;
      const tyB = eB.textY ?? eB.y ?? ((eB.y1 || 0) + (eB.y2 || 0)) * 0.5;
      if ((eA.text || '') !== (eB.text || '')) return false;
      if (eA.measurement != null && eB.measurement != null && Math.abs(eA.measurement - eB.measurement) > Math.min(t, 1e-3)) return false;
      if (Math.hypot((eA.x1 || 0) - (eB.x1 || 0), (eA.y1 || 0) - (eB.y1 || 0)) > t) return false;
      if (Math.hypot((eA.x2 || 0) - (eB.x2 || 0), (eA.y2 || 0) - (eB.y2 || 0)) > t) return false;
      if (Math.hypot(txA - txB, tyA - tyB) > t) return false;
      if (eA.blockName || eB.blockName) {
        return getBlockGeometryDigest(parserA, eA.blockName, qFn, 0, 1.0) === getBlockGeometryDigest(parserB, eB.blockName, qFn, 0, unitRatio);
      }
      return true;
    }
    if (eA.type === 'INSERT') {
      if (String(eA.blockName || '').toUpperCase() !== String(eB.blockName || '').toUpperCase()) return false;
      if (Math.hypot((eA.x || 0) - (eB.x || 0), (eA.y || 0) - (eB.y || 0)) > t) return false;
      if (Math.abs((eA.scaleX || 1) - (eB.scaleX || 1)) > Math.max(t * 0.1, 1e-4) ||
          Math.abs((eA.scaleY || 1) - (eB.scaleY || 1)) > Math.max(t * 0.1, 1e-4)) return false;
      if (aDiff(eA.rotation || 0, eB.rotation || 0) > angTol) return false;
      return getBlockGeometryDigest(parserA, eA.blockName, qFn, 0, 1.0) === getBlockGeometryDigest(parserB, eB.blockName, qFn, 0, unitRatio);
    }
    if (eA.type === 'POINT') {
      return Math.hypot((eA.x || 0) - (eB.x || 0), (eA.y || 0) - (eB.y || 0)) <= t;
    }
    return false;
  }

  function compareDXFEntities(parsedA, parsedB, optionsOrTol = 0.005) {
    const opts = typeof optionsOrTol === 'number'
      ? { tol: optionsOrTol }
      : (optionsOrTol || {});
    const tol = opts.tol != null ? Number(opts.tol) : 0.005;

    parsedA = parsedA || { entities: [], layers: {}, insunitsCode: 0 };
    parsedB = parsedB || { entities: [], layers: {}, insunitsCode: 0 };
    const codeA = parsedA && (parsedA.insunitsCode ?? parsedA.insunits);
    const codeB = parsedB && (parsedB.insunitsCode ?? parsedB.insunits);
    const uA = INSUNITS_CODE_MAP[codeA] ? UNITS[INSUNITS_CODE_MAP[codeA]].toMM : 1;
    const uB = INSUNITS_CODE_MAP[codeB] ? UNITS[INSUNITS_CODE_MAP[codeB]].toMM : 1;
    const unitRatio = (codeA && codeB && codeA !== codeB && uA > 0 && uB > 0) ? (uB / uA) : 1.0;

    const comparedLayers = opts.comparedLayers
      ? (opts.comparedLayers instanceof Set ? opts.comparedLayers : new Set(opts.comparedLayers))
      : null;
    const hiddenLayers = opts.hiddenLayers
      ? (opts.hiddenLayers instanceof Set ? opts.hiddenLayers : new Set(opts.hiddenLayers))
      : null;
    const frozenLayers = opts.frozenLayers
      ? (opts.frozenLayers instanceof Set ? opts.frozenLayers : new Set(opts.frozenLayers))
      : null;
    const lockedLayers = opts.lockedLayers
      ? (opts.lockedLayers instanceof Set ? opts.lockedLayers : new Set(opts.lockedLayers))
      : null;
    const ignoreLocked = !!opts.ignoreLockedLayers;
    const ignoreText = !!opts.ignoreText;
    const ignoreDimensions = !!opts.ignoreDimensions;
    const layerMapping = opts.layerMapping || null;
    const offsetB = opts.offsetB || { dx: 0, dy: 0 };

    // Fast memoization check so repeated UI/modal calls with identical state return in 0ms
    const serializeSet = s => s && s.size ? [...s].sort().join(',') : '';
    const cacheKey = `${tol}|${unitRatio.toFixed(6)}|${(parsedA.entities || []).length}|${(parsedB.entities || []).length}|${serializeSet(comparedLayers)}|${serializeSet(hiddenLayers)}|${serializeSet(frozenLayers)}|${ignoreLocked ? serializeSet(lockedLayers) : ''}|${ignoreText}|${ignoreDimensions}|${!!opts.ignoreLayerNames}|${(offsetB.dx || 0).toFixed(3)},${(offsetB.dy || 0).toFixed(3)}`;
    if (!layerMapping &&
        _lastDiffCache.pA === parsedA &&
        _lastDiffCache.pB === parsedB &&
        _lastDiffCache.revA === (parsedA._mutationRev || 0) &&
        _lastDiffCache.revB === (parsedB._mutationRev || 0) &&
        _lastDiffCache.key === cacheKey &&
        _lastDiffCache.result) {
      return _lastDiffCache.result;
    }

    const isEntityAllowed = (e, parserObj) => {
      if (!e || !e.type) return false;
      const lyrName = e.layer || '0';
      if (/^defpoints$/i.test(lyrName) && e.type !== 'DIMENSION') return false;
      if (comparedLayers && comparedLayers.size > 0 && !comparedLayers.has(lyrName)) return false;
      if (hiddenLayers && hiddenLayers.has(lyrName)) return false;
      if (frozenLayers && frozenLayers.has(lyrName)) return false;
      if (ignoreLocked && lockedLayers && lockedLayers.has(lyrName)) return false;
      const lObj = parserObj && parserObj.layers && parserObj.layers[lyrName];
      if (lObj) {
        if (lObj.visible === false && opts.respectLayerVisibility !== false && !comparedLayers && e.type !== 'DIMENSION') return false;
        if (lObj.frozen === true) return false;
        if (ignoreLocked && lObj.locked === true) return false;
      }
      if (ignoreText && e.type === 'TEXT') return false;
      if (ignoreDimensions && e.type === 'DIMENSION') return false;
      return true;
    };

    const effTol = Math.max(1e-5, tol);
    const dec = Math.max(3, Math.min(6, Math.ceil(-Math.log10(effTol)) + 1));
    const q = n => Math.round((Number(n) || 0) / effTol) * effTol;
    const qStr = n => q(n).toFixed(dec);
    const normLayerName = (lyr, isFromA) => {
      if (isFromA && layerMapping) {
        if (layerMapping instanceof Map && layerMapping.has(lyr)) return layerMapping.get(lyr);
        if (typeof layerMapping === 'object' && layerMapping[lyr]) return layerMapping[lyr];
      }
      return opts.ignoreLayerNames ? '*' : (lyr || '0');
    };

    const blkDigestCacheA = new Map();
    const blkDigestCacheB = new Map();
    const getCachedBlkDigest = (parserObj, isFromA, bName) => {
      if (!bName) return '';
      const cache = isFromA ? blkDigestCacheA : blkDigestCacheB;
      const key = String(bName).toUpperCase();
      if (cache.has(key)) return cache.get(key);
      const dig = getBlockGeometryDigest(parserObj, bName, qStr, 0, isFromA ? 1.0 : unitRatio);
      cache.set(key, dig);
      return dig;
    };

    const sigOf = (e, isFromA = true) => {
      const lyr = normLayerName(e.layer, isFromA);
      const pRef = isFromA ? parsedA : parsedB;
      if (e.type === 'LINE') {
        const p1 = `${qStr(e.x1)},${qStr(e.y1)}`;
        const p2 = `${qStr(e.x2)},${qStr(e.y2)}`;
        return `LINE|${lyr}|` + (p1 < p2 ? `${p1}->${p2}` : `${p2}->${p1}`);
      }
      if (e.type === 'CIRCLE') return `CIRCLE|${lyr}|${qStr(e.cx)},${qStr(e.cy)}|R${qStr(e.r)}`;
      if (e.type === 'ARC') return `ARC|${lyr}|${qStr(e.cx)},${qStr(e.cy)}|R${qStr(e.r)}|${q(e.startAngle).toFixed(2)}_${q(e.endAngle).toFixed(2)}`;
      if (e.type === 'ELLIPSE') {
        const rx = e.rx || Math.hypot(e.mx || 10, e.my || 0) || 1;
        const ry = e.ry || rx * (e.ratio || 0.5);
        return `ELLIPSE|${lyr}|${qStr(e.cx)},${qStr(e.cy)}|${qStr(rx)}x${qStr(ry)}|${q(e.rotation || 0).toFixed(3)}|${q(e.startParam ?? 0).toFixed(3)}_${q(e.endParam ?? (Math.PI * 2)).toFixed(3)}`;
      }
      if (e.type === 'LWPOLYLINE' || e.type === 'SPLINE') {
        const pts = (e.points || []).map(p => `${qStr(p[0])},${qStr(p[1])}${p[2] ? ':' + qStr(p[2]) : ''}`);
        return `POLY|${lyr}|${e.closed ? 'C' : 'O'}|` + pts.join(';');
      }
      if (e.type === 'SOLID') return `SOLID|${lyr}|` + (e.points || []).map(p => `${qStr(p[0])},${qStr(p[1])}`).join(';');
      if (e.type === 'HATCH') {
        const lps = Array.isArray(e.loops) && e.loops.length ? e.loops : (Array.isArray(e.points) ? [e.points] : []);
        const lStr = lps.map(lp => (lp || []).map(p => `${qStr(p[0])},${qStr(p[1])}`).join(';')).join('|');
        return `HATCH|${lyr}|${e.solid ? 1 : 0}|${e.patternName || ''}|${lStr}`;
      }
      if (e.type === 'DIMENSION') {
        const tx = e.textX ?? e.x ?? ((e.x1 || 0) + (e.x2 || 0)) * 0.5;
        const ty = e.textY ?? e.y ?? ((e.y1 || 0) + (e.y2 || 0)) * 0.5;
        const bDig = e.blockName ? getCachedBlkDigest(pRef, isFromA, e.blockName) : '';
        return `DIM|${lyr}|${qStr(e.x1)},${qStr(e.y1)}->${qStr(e.x2)},${qStr(e.y2)}|@${qStr(tx)},${qStr(ty)}|${e.text || ''}|M${qStr(e.measurement || 0)}|${bDig}`;
      }
      if (e.type === 'TEXT') {
        return `TEXT|${lyr}|${qStr(e.x)},${qStr(e.y)}|R${q(e.rotation || 0).toFixed(2)}|${e.hMode || 'left'}_${e.vMode || 'baseline'}|${e.text || ''}`;
      }
      if (e.type === 'INSERT') {
        const bDig = getCachedBlkDigest(pRef, isFromA, e.blockName);
        return `INSERT|${lyr}|${String(e.blockName || '').toUpperCase()}|${qStr(e.x)},${qStr(e.y)}|${q(e.scaleX || 1).toFixed(3)}_${q(e.scaleY || 1).toFixed(3)}_${q(e.rotation || 0).toFixed(2)}|${bDig}`;
      }
      return `${e.type}|${lyr}|${qStr(e.x ?? e.x1 ?? e.cx ?? 0)},${qStr(e.y ?? e.y1 ?? e.cy ?? 0)}`;
    };

    const scaleAndOffsetEnt = (e, k, dx = 0, dy = 0) => {
      if (k === 1.0 && dx === 0 && dy === 0) return e;
      const c = { ...e, _cachedBBox: null, _normEnt: undefined };
      delete c._normEnt;
      for (const f of ['x', 'x1', 'x2', 'cx', 'textX']) {
        if (typeof c[f] === 'number') c[f] = c[f] * k + dx;
      }
      for (const f of ['y', 'y1', 'y2', 'cy', 'textY']) {
        if (typeof c[f] === 'number') c[f] = c[f] * k + dy;
      }
      for (const f of ['r', 'rx', 'ry', 'height', 'boxWidth', 'fitWidth', 'mx', 'my']) {
        if (typeof c[f] === 'number') c[f] = c[f] * k;
      }
      if (Array.isArray(c.points)) c.points = c.points.map(p => [p[0] * k + dx, p[1] * k + dy, p[2] || 0]);
      if (Array.isArray(c.renderPoints)) c.renderPoints = c.renderPoints.map(p => [p[0] * k + dx, p[1] * k + dy]);
      if (Array.isArray(c.loops)) c.loops = c.loops.map(lp => lp.map(p => [p[0] * k + dx, p[1] * k + dy]));
      return c;
    };

    const filteredA = (parsedA.entities || []).filter(e => isEntityAllowed(e, parsedA));
    const filteredB = (parsedB.entities || []).filter(e => isEntityAllowed(e, parsedB));

    const mapA = new Map();
    for (const e of filteredA) {
      const s = sigOf(e, true);
      if (!mapA.has(s)) mapA.set(s, []);
      mapA.get(s).push(e);
    }
    const mapB = new Map();
    for (const e of filteredB) {
      const normB = scaleAndOffsetEnt(e, unitRatio, offsetB.dx || 0, offsetB.dy || 0);
      if (normB !== e) Object.defineProperty(e, "_normEnt", { value: normB, writable: true, configurable: true, enumerable: false });
      else delete e._normEnt;
      const s = sigOf(normB, false);
      if (!mapB.has(s)) mapB.set(s, []);
      mapB.get(s).push({ orig: e, norm: normB });
    }

    const rawAdded = [];
    const rawRemoved = [];
    const unchanged = [];
    let unchangedCount = 0;

    for (const [sig, listA] of mapA.entries()) {
      const listB = mapB.get(sig) || [];
      const common = Math.min(listA.length, listB.length);
      unchangedCount += common;
      for (let k = 0; k < common; k++) {
        unchanged.push(listA[k]);
      }
      for (let k = common; k < listA.length; k++) {
        const entA = listA[k];
        const bb = computeStandaloneEntityBBox(entA, parsedA);
        entA._diffKind = 'removed';
        entA._bbox = bb;
        entA._summary = describeDXFEntity(entA);
        rawRemoved.push(entA);
      }
    }
    for (const [sig, listB] of mapB.entries()) {
      const listA = mapA.get(sig) || [];
      const common = Math.min(listA.length, listB.length);
      for (let k = common; k < listB.length; k++) {
        const itemB = listB[k];
        const entB = itemB.orig;
        const bb = computeStandaloneEntityBBox(itemB.norm, parsedB);
        entB._diffKind = 'added';
        entB._bbox = bb;
        if (itemB.norm !== entB) Object.defineProperty(entB, "_normEnt", { value: itemB.norm, writable: true, configurable: true, enumerable: false });
        else delete entB._normEnt;
        entB._summary = describeDXFEntity(itemB.norm);
        rawAdded.push(entB);
      }
    }

    // O(N) Type+Layer Bucket & Spatial Hash Index for:
    // 1. Tolerance-Exact Verification (eliminating quantization rounding-boundary false positives)
    // 2. O(N) Modified Entity Pairing (replacing legacy O(N^2) all-pairs loop)
    const bucketsRem = new Map();
    for (let ir = 0; ir < rawRemoved.length; ir++) {
      const eA = rawRemoved[ir];
      const bKey = `${eA.type}|${normLayerName(eA.layer, true)}`;
      if (!bucketsRem.has(bKey)) bucketsRem.set(bKey, []);
      bucketsRem.get(bKey).push(ir);
    }

    const matchedTolRem = new Uint8Array(rawRemoved.length);
    const matchedTolAdd = new Uint8Array(rawAdded.length);
    const qFn = qStr;

    for (let ia = 0; ia < rawAdded.length; ia++) {
      const eB = rawAdded[ia];
      const normB = eB._normEnt || eB;
      const bKey = `${eB.type}|${normLayerName(eB.layer, false)}`;
      const candList = bucketsRem.get(bKey);
      if (!candList || !candList.length) continue;
      for (let cIdx = 0; cIdx < candList.length; cIdx++) {
        const ir = candList[cIdx];
        if (matchedTolRem[ir]) continue;
        const eA = rawRemoved[ir];
        if (isSameEntityWithinTol(eA, normB, tol, parsedA, parsedB, qFn, unitRatio)) {
          matchedTolRem[ir] = 1;
          matchedTolAdd[ia] = 1;
          unchanged.push(eA);
          unchangedCount++;
          break;
        }
      }
    }

    const added = [];
    const removed = [];
    for (let ir = 0; ir < rawRemoved.length; ir++) {
      if (!matchedTolRem[ir]) removed.push(rawRemoved[ir]);
    }
    for (let ia = 0; ia < rawAdded.length; ia++) {
      if (!matchedTolAdd[ia]) added.push(rawAdded[ia]);
    }

    // Compute Stepped-Box-style sub-segment geometric diffs on changed layers so partially modified LWPOLYLINEs,
    // INSERT blocks, DIMENSION blocks, extended/trimmed LINEs, and overlapping ARCs highlight ONLY the exact changed segment portion!
    const changedLayersA = new Set(removed.map(e => normLayerName(e.layer, true)));
    const changedLayersB = new Set(added.map(e => normLayerName(e.layer, false)));
    const activeDiffLayers = new Set([...changedLayersA, ...changedLayersB]);
    const hasBlockOrDimDiff = removed.some(e => e.type === 'INSERT' || e.type === 'DIMENSION') || added.some(e => e.type === 'INSERT' || e.type === 'DIMENSION');
    if (activeDiffLayers.size > 0 && (removed.length + added.length) <= 25000) {
      const segPoolA = new Map();
      const segPoolB = new Map();
      const allSegsA = [];
      const allSegsB = [];
      const addEntToSegPool = (ent, pool, allArr, isFromA) => {
        const parentLKey = normLayerName(ent.layer, isFromA);
        if (!hasBlockOrDimDiff && !activeDiffLayers.has(parentLKey) && ent.type !== 'INSERT' && ent.type !== 'DIMENSION') return;
        const drawE = (!isFromA && ent._normEnt) ? ent._normEnt : ent;
        const segs = extractEntityPrimitiveSegments(drawE, isFromA ? parsedA : parsedB);
        if (!segs.length) return;
        for (const s of segs) {
          const sKey = normLayerName(s.layer || ent.layer, isFromA);
          if (!pool.has(sKey)) pool.set(sKey, []);
          pool.get(sKey).push(s);
          if (sKey !== parentLKey) {
            if (!pool.has(parentLKey)) pool.set(parentLKey, []);
            pool.get(parentLKey).push(s);
          }
          if (hasBlockOrDimDiff) allArr.push(s);
        }
      };
      for (const eA of filteredA) addEntToSegPool(eA, segPoolA, allSegsA, true);
      for (const eB of filteredB) addEntToSegPool(eB, segPoolB, allSegsB, false);

      const clipSegWithCrossLayerFallback = (seg, primaryPool, fallbackAll, allowCrossLayer) => {
        const sKey = seg.layer || '0';
        const cands = primaryPool.get(sKey);
        let res = (cands && cands.length > 0) ? clipSegmentAgainstPool(seg, cands, tol) : { diff: [seg], common: [] };
        if (allowCrossLayer && res.diff.length > 0 && fallbackAll.length > 0) {
          const nextDiff = [];
          const nextCommon = [...res.common];
          for (const dSeg of res.diff) {
            const fb = clipSegmentAgainstPool(dSeg, fallbackAll, tol);
            for (const fds of fb.diff) nextDiff.push(fds);
            for (const fcs of fb.common) nextCommon.push(fcs);
          }
          res = { diff: nextDiff, common: nextCommon };
        }
        return res;
      };

      const fullyCoveredRemIdx = new Set();
      for (let ir = 0; ir < removed.length; ir++) {
        const eA = removed[ir];
        const lKey = normLayerName(eA.layer, true);
        const ownSegs = extractEntityPrimitiveSegments(eA, parsedA);
        if (ownSegs.length > 0) {
          const diffSegs = [];
          const commonSegs = [];
          const allowCross = hasBlockOrDimDiff || eA.type === 'INSERT' || eA.type === 'DIMENSION';
          for (const s of ownSegs) {
            const sWithLyr = { ...s, layer: normLayerName(s.layer || eA.layer, true) };
            let clipped = clipSegWithCrossLayerFallback(sWithLyr, segPoolB, allSegsB, allowCross);
            if (clipped.diff.length > 0 && sWithLyr.layer !== lKey && segPoolB.has(lKey)) {
              const retry = [];
              for (const ds of clipped.diff) {
                const c2 = clipSegmentAgainstPool(ds, segPoolB.get(lKey), tol);
                for (const d2 of c2.diff) retry.push(d2);
                for (const cm2 of c2.common) clipped.common.push(cm2);
              }
              clipped.diff = retry;
            }
            for (const ds of clipped.diff) diffSegs.push(ds);
            for (const cs of clipped.common) commonSegs.push(cs);
          }
          if (diffSegs.length > 0) {
            Object.defineProperty(eA, '_diffSubSegments', { value: diffSegs, writable: true, configurable: true, enumerable: false });
            Object.defineProperty(eA, '_commonSubSegments', { value: commonSegs, writable: true, configurable: true, enumerable: false });
            const dbb = computeSegmentsBBox(diffSegs);
            if (dbb) Object.defineProperty(eA, '_diffBBox', { value: dbb, writable: true, configurable: true, enumerable: false });
          } else if (commonSegs.length > 0) {
            Object.defineProperty(eA, '_diffSubSegments', { value: [], writable: true, configurable: true, enumerable: false });
            Object.defineProperty(eA, '_commonSubSegments', { value: commonSegs, writable: true, configurable: true, enumerable: false });
            if (eA.type === 'LINE' || eA.type === 'ARC' || eA.type === 'CIRCLE') {
              fullyCoveredRemIdx.add(ir);
            }
          }
        }
      }

      const fullyCoveredAddIdx = new Set();
      for (let ia = 0; ia < added.length; ia++) {
        const eB = added[ia];
        const lKey = normLayerName(eB.layer, false);
        const normB = eB._normEnt || eB;
        const ownSegs = extractEntityPrimitiveSegments(normB, parsedB);
        if (ownSegs.length > 0) {
          const diffSegs = [];
          const commonSegs = [];
          const allowCross = hasBlockOrDimDiff || eB.type === 'INSERT' || eB.type === 'DIMENSION';
          for (const s of ownSegs) {
            const sWithLyr = { ...s, layer: normLayerName(s.layer || eB.layer, false) };
            let clipped = clipSegWithCrossLayerFallback(sWithLyr, segPoolA, allSegsA, allowCross);
            if (clipped.diff.length > 0 && sWithLyr.layer !== lKey && segPoolA.has(lKey)) {
              const retry = [];
              for (const ds of clipped.diff) {
                const c2 = clipSegmentAgainstPool(ds, segPoolA.get(lKey), tol);
                for (const d2 of c2.diff) retry.push(d2);
                for (const cm2 of c2.common) clipped.common.push(cm2);
              }
              clipped.diff = retry;
            }
            for (const ds of clipped.diff) diffSegs.push(ds);
            for (const cs of clipped.common) commonSegs.push(cs);
          }
          const invK = (unitRatio && unitRatio !== 1.0) ? (1.0 / unitRatio) : 1.0;
          const offDx = offsetB.dx || 0, offDy = offsetB.dy || 0;
          const unmapSeg = seg => (invK === 1.0 && offDx === 0 && offDy === 0) ? seg : (
            seg.type === 'LINE' ? {
              ...seg,
              x1: (seg.x1 - offDx) * invK,
              y1: (seg.y1 - offDy) * invK,
              x2: (seg.x2 - offDx) * invK,
              y2: (seg.y2 - offDy) * invK
            } : {
              ...seg,
              cx: (seg.cx - offDx) * invK,
              cy: (seg.cy - offDy) * invK,
              r: seg.r * invK
            }
          );
          if (diffSegs.length > 0) {
            const localDiffSegs = diffSegs.map(unmapSeg);
            const localCommonSegs = commonSegs.map(unmapSeg);
            Object.defineProperty(eB, '_diffSubSegments', { value: localDiffSegs, writable: true, configurable: true, enumerable: false });
            Object.defineProperty(eB, '_commonSubSegments', { value: localCommonSegs, writable: true, configurable: true, enumerable: false });
            if (normB !== eB) {
              Object.defineProperty(normB, '_diffSubSegments', { value: diffSegs, writable: true, configurable: true, enumerable: false });
              Object.defineProperty(normB, '_commonSubSegments', { value: commonSegs, writable: true, configurable: true, enumerable: false });
            }
            const dbb = computeSegmentsBBox(diffSegs);
            if (dbb) {
              Object.defineProperty(eB, '_diffBBox', { value: dbb, writable: true, configurable: true, enumerable: false });
              if (normB !== eB) Object.defineProperty(normB, '_diffBBox', { value: dbb, writable: true, configurable: true, enumerable: false });
            }
          } else if (commonSegs.length > 0) {
            const localCommonSegs = commonSegs.map(unmapSeg);
            Object.defineProperty(eB, '_diffSubSegments', { value: [], writable: true, configurable: true, enumerable: false });
            Object.defineProperty(eB, '_commonSubSegments', { value: localCommonSegs, writable: true, configurable: true, enumerable: false });
            if (normB !== eB) {
              Object.defineProperty(normB, '_diffSubSegments', { value: [], writable: true, configurable: true, enumerable: false });
              Object.defineProperty(normB, '_commonSubSegments', { value: commonSegs, writable: true, configurable: true, enumerable: false });
            }
            if (eB.type === 'LINE' || eB.type === 'ARC' || eB.type === 'CIRCLE') {
              fullyCoveredAddIdx.add(ia);
            }
          }
        }
      }

      const hasExplodedCompound = (removed.some(e => e.type === 'INSERT' || e.type === 'LWPOLYLINE') && !added.some(e => e.type === 'INSERT' || e.type === 'LWPOLYLINE')) ||
                                  (added.some(e => e.type === 'INSERT' || e.type === 'LWPOLYLINE') && !removed.some(e => e.type === 'INSERT' || e.type === 'LWPOLYLINE'));
      // Also detect layers where 100% of removed and added entities are fully covered by shared segments (e.g. split collinear lines)
      const layersWithUncoveredDiff = new Set();
      for (let ir = 0; ir < removed.length; ir++) {
        if (!fullyCoveredRemIdx.has(ir)) layersWithUncoveredDiff.add(normLayerName(removed[ir].layer, true));
      }
      for (let ia = 0; ia < added.length; ia++) {
        if (!fullyCoveredAddIdx.has(ia)) layersWithUncoveredDiff.add(normLayerName(added[ia].layer, false));
      }
      if (fullyCoveredRemIdx.size > 0) {
        const keptRem = [];
        for (let ir = 0; ir < removed.length; ir++) {
          const lKey = normLayerName(removed[ir].layer, true);
          if (fullyCoveredRemIdx.has(ir) && (hasExplodedCompound || !layersWithUncoveredDiff.has(lKey))) {
            unchanged.push(removed[ir]);
            unchangedCount++;
          } else {
            keptRem.push(removed[ir]);
          }
        }
        removed.length = 0;
        removed.push(...keptRem);
      }
      if (fullyCoveredAddIdx.size > 0) {
        const keptAdd = [];
        for (let ia = 0; ia < added.length; ia++) {
          const lKey = normLayerName(added[ia].layer, false);
          if (fullyCoveredAddIdx.has(ia) && (hasExplodedCompound || !layersWithUncoveredDiff.has(lKey))) {
            unchangedCount++;
          } else {
            keptAdd.push(added[ia]);
          }
        }
        added.length = 0;
        added.push(...keptAdd);
      }
    }

    // Rebuild buckets on the remaining genuinely removed entities for O(N) modifiedPairs pairing
    const modBucketsRem = new Map();
    for (let ir = 0; ir < removed.length; ir++) {
      const eA = removed[ir];
      const bKey = `${eA.type}|${normLayerName(eA.layer, true)}`;
      if (!modBucketsRem.has(bKey)) modBucketsRem.set(bKey, []);
      modBucketsRem.get(bKey).push(ir);
    }

    const modifiedPairs = [];
    const usedRem = new Uint8Array(removed.length);
    for (let ia = 0; ia < added.length; ia++) {
      const eB = added[ia];
      const normB = eB._normEnt || eB;
      const bbB = eB._bbox;
      if (!bbB) continue;
      const bKey = `${eB.type}|${normLayerName(eB.layer, false)}`;
      let candList = modBucketsRem.get(bKey);
      if ((!candList || !candList.length) && (eB.type === 'TEXT' || eB.type === 'DIMENSION')) {
        // Fallback: allow pairing a modified TEXT/DIMENSION at the same coordinate even if its layer was renamed
        const crossCands = [];
        for (let ir = 0; ir < removed.length; ir++) {
          if (!usedRem[ir] && removed[ir].type === eB.type) crossCands.push(ir);
        }
        if (crossCands.length) candList = crossCands;
      }
      if (!candList || !candList.length) continue;
      const cxB = (bbB.minX + bbB.maxX) * 0.5, cyB = (bbB.minY + bbB.maxY) * 0.5;
      let bestIr = -1, bestScore = Infinity, bestDist = Infinity;
      const limit = Math.min(candList.length, 400);
      for (let cIdx = 0; cIdx < limit; cIdx++) {
        const ir = candList[cIdx];
        if (usedRem[ir]) continue;
        const eA = removed[ir];
        const bbA = eA._bbox;
        if (!bbA) continue;
        const cxA = (bbA.minX + bbA.maxX) * 0.5, cyA = (bbA.minY + bbA.maxY) * 0.5;
        const d = Math.hypot(cxB - cxA, cyB - cyA);
        let maxSpan = Math.max(bbA.maxX - bbA.minX, bbA.maxY - bbA.minY, bbB.maxX - bbB.minX, bbB.maxY - bbB.minY, 25) * 1.8;
        // If a TEXT label with the exact same wording was moved farther away on the same layer, allow pairing up to 250 units
        const sameText = (eB.type === 'TEXT' || eB.type === 'DIMENSION') && eA.text && normB.text && eA.text === normB.text;
        if (sameText) maxSpan = Math.max(maxSpan, 250);
        if (d <= maxSpan) {
          // Prefer pairing identical-wording TEXT that shifted position, or identical-position TEXT that changed wording
          const score = sameText ? d * 0.25 : ((eB.type === 'TEXT' && d <= Math.max(tol * 5, 2.0)) ? d * 0.1 : d);
          if (score < bestScore) {
            bestScore = score;
            bestDist = d;
            bestIr = ir;
          }
        }
      }
      if (bestIr !== -1) {
        usedRem[bestIr] = 1;
        const eA = removed[bestIr];
        let summary = `${eB.type} [${eB.layer}]: ${eA._summary}  →  ${eB._summary}`;
        if (eB.type === 'TEXT' || eB.type === 'DIMENSION') {
          const txtChanged = (eA.text || '') !== (normB.text || '');
          const dxMove = (normB.x ?? normB.x1 ?? 0) - (eA.x ?? eA.x1 ?? 0);
          const dyMove = (normB.y ?? normB.y1 ?? 0) - (eA.y ?? eA.y1 ?? 0);
          const posMoved = Math.hypot(dxMove, dyMove) > tol;
          const alignChanged = eB.type === 'TEXT' && ((eA.hMode || 'left') !== (normB.hMode || 'left') || (eA.vMode || 'baseline') !== (normB.vMode || 'baseline') || Math.abs((eA.rotation || 0) - (normB.rotation || 0)) > 0.25);
          if (txtChanged && posMoved) {
            summary = `${eB.type} Wording & Position [${eB.layer}]: "${eA.text || ''}" → "${normB.text || ''}" (Δx=${dxMove.toFixed(2)}, Δy=${dyMove.toFixed(2)})`;
          } else if (txtChanged) {
            summary = `${eB.type} Wording [${eB.layer}]: "${eA.text || ''}" → "${normB.text || ''}" @ (${(normB.x || 0).toFixed(2)}, ${(normB.y || 0).toFixed(2)})`;
          } else if (posMoved || alignChanged) {
            summary = `${eB.type} Misaligned [${eB.layer}]: "${eA.text || ''}" shifted Δ(${dxMove.toFixed(2)}, ${dyMove.toFixed(2)}) ${eA._summary} → ${eB._summary}`;
          }
        }
        // Word-level whole-word diff boxes when two TEXT entities at the same position share unchanged words
        if (eB.type === 'TEXT' && _dxfCmpCore && typeof _dxfCmpCore.computeWordDiffBoxes === 'function') {
          const dxMove = (normB.x || 0) - (eA.x || 0);
          const dyMove = (normB.y || 0) - (eA.y || 0);
          const samePos = Math.hypot(dxMove, dyMove) <= tol * 1.1;
          const sameAlign = (eA.hMode || 'left') === (normB.hMode || 'left') &&
                            (eA.vMode || 'baseline') === (normB.vMode || 'baseline') &&
                            Math.abs((eA.rotation || 0) - (normB.rotation || 0)) <= 0.25;
          if (samePos && sameAlign && (eA.text || '') !== (normB.text || '')) {
            const wDiff = _dxfCmpCore.computeWordDiffBoxes(eA, normB);
            if (wDiff && (wDiff.boxesA.length > 0 || wDiff.boxesB.length > 0)) {
              const unionBoxes = boxes => {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const b of boxes) {
                  if (b.minX < minX) minX = b.minX; if (b.maxX > maxX) maxX = b.maxX;
                  if (b.minY < minY) minY = b.minY; if (b.maxY > maxY) maxY = b.maxY;
                }
                return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
              };
              if (wDiff.boxesA.length > 0) {
                const dtA = wDiff.boxesA.map(wb => ({ type: 'TEXT', text: eA.text || '', x: eA.x || 0, y: eA.y || 0, height: eA.height || 2.5, rotation: eA.rotation || 0, hMode: eA.hMode || 'left', vMode: eA.vMode || 'baseline', widthFactor: eA.widthFactor || 0.86, layer: eA.layer || '0', _bbox: wb }));
                Object.defineProperty(eA, '_diffTextEntities', { value: dtA, writable: true, configurable: true, enumerable: false });
                const ubA = unionBoxes(wDiff.boxesA);
                if (ubA) Object.defineProperty(eA, '_diffBBox', { value: ubA, writable: true, configurable: true, enumerable: false });
              }
              if (wDiff.boxesB.length > 0) {
                const dtBNorm = wDiff.boxesB.map(wb => ({ type: 'TEXT', text: normB.text || '', x: normB.x || 0, y: normB.y || 0, height: normB.height || 2.5, rotation: normB.rotation || 0, hMode: normB.hMode || 'left', vMode: normB.vMode || 'baseline', widthFactor: normB.widthFactor || 0.86, layer: normB.layer || '0', _bbox: wb }));
                if (normB !== eB) {
                  const invK = (unitRatio && unitRatio !== 1.0) ? (1.0 / unitRatio) : 1.0;
                  const offDx = offsetB.dx || 0, offDy = offsetB.dy || 0;
                  const dtBLocal = wDiff.boxesB.map(wb => ({
                    type: 'TEXT', text: eB.text || '', x: eB.x || 0, y: eB.y || 0, height: eB.height || 2.5, rotation: eB.rotation || 0, hMode: eB.hMode || 'left', vMode: eB.vMode || 'baseline', widthFactor: eB.widthFactor || 0.86, layer: eB.layer || '0',
                    _bbox: { minX: (wb.minX - offDx) * invK, minY: (wb.minY - offDy) * invK, maxX: (wb.maxX - offDx) * invK, maxY: (wb.maxY - offDy) * invK }
                  }));
                  Object.defineProperty(eB, '_diffTextEntities', { value: dtBLocal, writable: true, configurable: true, enumerable: false });
                  Object.defineProperty(normB, '_diffTextEntities', { value: dtBNorm, writable: true, configurable: true, enumerable: false });
                } else {
                  Object.defineProperty(eB, '_diffTextEntities', { value: dtBNorm, writable: true, configurable: true, enumerable: false });
                }
                const ubB = unionBoxes(wDiff.boxesB);
                if (ubB) {
                  Object.defineProperty(eB, '_diffBBox', { value: ubB, writable: true, configurable: true, enumerable: false });
                  if (normB !== eB) Object.defineProperty(normB, '_diffBBox', { value: ubB, writable: true, configurable: true, enumerable: false });
                }
              }
            }
          }
        }
        const aHasNoOwnDiff = Array.isArray(eA._diffSubSegments) && eA._diffSubSegments.length === 0 && Array.isArray(eA._commonSubSegments) && eA._commonSubSegments.length > 0 && !eA._diffTextEntities;
        const bHasNoOwnDiff = Array.isArray(eB._diffSubSegments) && eB._diffSubSegments.length === 0 && Array.isArray(eB._commonSubSegments) && eB._commonSubSegments.length > 0 && !eB._diffTextEntities;
        const effBoxA = eA._diffBBox || (aHasNoOwnDiff && eB._diffBBox ? eB._diffBBox : eA._bbox);
        const effBoxB = eB._diffBBox || (bHasNoOwnDiff && eA._diffBBox ? eA._diffBBox : eB._bbox);
        let pairBBox = {
          minX: Math.min(effBoxA.minX, effBoxB.minX),
          minY: Math.min(effBoxA.minY, effBoxB.minY),
          maxX: Math.max(effBoxA.maxX, effBoxB.maxX),
          maxY: Math.max(effBoxA.maxY, effBoxB.maxY)
        };
        if ((eB.type === 'INSERT' || eB.type === 'DIMENSION') && eA.blockName && normB.blockName) {
          const blkA = parsedA._getBlock ? parsedA._getBlock(eA.blockName) : (parsedA.blocks && parsedA.blocks[eA.blockName]);
          const blkB = parsedB._getBlock ? parsedB._getBlock(normB.blockName) : (parsedB.blocks && parsedB.blocks[normB.blockName]);
          const samePlacement = eB.type === 'DIMENSION' || (
            Math.hypot((eA.x || 0) - (normB.x || 0), (eA.y || 0) - (normB.y || 0)) <= tol * 1.05 &&
            Math.abs((eA.scaleX || 1) - (normB.scaleX || 1)) <= 1e-3 &&
            Math.abs((eA.scaleY || 1) - (normB.scaleY || 1)) <= 1e-3 &&
            Math.abs(((eA.rotation || 0) - (normB.rotation || 0)) % 360) <= 0.5
          );
          if (samePlacement && blkA && blkB && Array.isArray(blkA.entities) && Array.isArray(blkB.entities)) {
            const subSig = (se, kSub = 1.0) => {
              if (!se || se.type === 'POINT') return '';
              const qs = v => qStr((Number(v) || 0) * kSub);
              if (se.type === 'LINE') {
                const p1 = `${qs(se.x1)},${qs(se.y1)}`, p2 = `${qs(se.x2)},${qs(se.y2)}`;
                return `L:${p1 < p2 ? p1 + ':' + p2 : p2 + ':' + p1}`;
              }
              if (se.type === 'CIRCLE') return `C:${qs(se.cx)},${qs(se.cy)},${qs(se.r)}`;
              if (se.type === 'ARC') return `A:${qs(se.cx)},${qs(se.cy)},${qs(se.r)},${qStr(se.startAngle || 0)},${qStr(se.endAngle ?? 360)}`;
              if (se.type === 'TEXT') return `T:${se.text || ''}@${qs(se.x || 0)},${qs(se.y || 0)}:${qStr(se.rotation || 0)}:${se.hMode || 'left'}:${se.vMode || 'baseline'}`;
              if ((se.type === 'LWPOLYLINE' || se.type === 'SPLINE' || se.type === 'SOLID') && Array.isArray(se.points)) {
                return `P:${se.closed ? 1 : 0}:` + se.points.map(pt => `${qs(pt[0])},${qs(pt[1])}${pt[2] ? ':' + qStr(pt[2]) : ''}`).join(',');
              }
              return `${se.type}:${qs(se.x ?? se.x1 ?? se.cx ?? 0)},${qs(se.y ?? se.y1 ?? se.cy ?? 0)}`;
            };
            const countsA = new Map();
            const countsB = new Map();
            for (const se of blkA.entities) { const s = subSig(se, 1.0); if (s) countsA.set(s, (countsA.get(s) || 0) + 1); }
            for (const se of blkB.entities) { const s = subSig(se, unitRatio); if (s) countsB.set(s, (countsB.get(s) || 0) + 1); }
            const diffIdxA = new Set();
            const diffIdxB = new Set();
            const remBudgetA = new Map(countsB);
            for (let si = 0; si < blkA.entities.length; si++) {
              const s = subSig(blkA.entities[si], 1.0);
              if (!s) continue;
              const rem = remBudgetA.get(s) || 0;
              if (rem > 0) remBudgetA.set(s, rem - 1);
              else diffIdxA.add(si);
            }
            const remBudgetB = new Map(countsA);
            for (let si = 0; si < blkB.entities.length; si++) {
              const s = subSig(blkB.entities[si], unitRatio);
              if (!s) continue;
              const rem = remBudgetB.get(s) || 0;
              if (rem > 0) remBudgetB.set(s, rem - 1);
              else diffIdxB.add(si);
            }
            if ((diffIdxA.size > 0 && diffIdxA.size < blkA.entities.length) || (diffIdxB.size > 0 && diffIdxB.size < blkB.entities.length)) {
              eA._diffSubIndices = diffIdxA;
              eB._diffSubIndices = diffIdxB;
              if (normB !== eB) normB._diffSubIndices = diffIdxB;
              let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
              const mapSubBBox = (subE, pObj, insEnt, blkObj, kMul) => {
                const sbb = computeStandaloneEntityBBox(subE, pObj);
                if (!sbb || !isFinite(sbb.minX)) return;
                if (insEnt.type === 'DIMENSION') {
                  sMinX = Math.min(sMinX, sbb.minX * kMul); sMaxX = Math.max(sMaxX, sbb.maxX * kMul);
                  sMinY = Math.min(sMinY, sbb.minY * kMul); sMaxY = Math.max(sMaxY, sbb.maxY * kMul);
                  return;
                }
                const sx = insEnt.scaleX || 1, sy = insEnt.scaleY || 1;
                const rad = ((insEnt.rotation || 0) * Math.PI) / 180;
                const cosR = Math.cos(rad), sinR = Math.sin(rad);
                const bx = blkObj.baseX || 0, by = blkObj.baseY || 0;
                const ix = insEnt.x || 0, iy = insEnt.y || 0;
                const corners = [[sbb.minX, sbb.minY], [sbb.maxX, sbb.minY], [sbb.maxX, sbb.maxY], [sbb.minX, sbb.maxY]];
                for (const [cx, cy] of corners) {
                  const dx = (cx - bx) * sx, dy = (cy - by) * sy;
                  const wx = ix + (dx * cosR - dy * sinR) * kMul;
                  const wy = iy + (dx * sinR + dy * cosR) * kMul;
                  if (wx < sMinX) sMinX = wx; if (wx > sMaxX) sMaxX = wx;
                  if (wy < sMinY) sMinY = wy; if (wy > sMaxY) sMaxY = wy;
                }
              };
              for (const si of diffIdxA) mapSubBBox(blkA.entities[si], parsedA, eA, blkA, 1.0);
              for (const si of diffIdxB) mapSubBBox(blkB.entities[si], parsedB, normB, blkB, unitRatio);
              const collectTextDiffs = (indices, blkObj, pObj, insEnt, kMul) => {
                const list = [];
                for (const si of indices) {
                  const se = blkObj.entities[si];
                  if (!se || se.type !== 'TEXT') continue;
                  const sbb = computeStandaloneEntityBBox(se, pObj);
                  let wx = se.x || 0, wy = se.y || 0, rot = se.rotation || 0, h = se.height || 2.5;
                  let wb = sbb ? { minX: sbb.minX * kMul, minY: sbb.minY * kMul, maxX: sbb.maxX * kMul, maxY: sbb.maxY * kMul } : null;
                  if (insEnt.type === 'INSERT') {
                    const sx = insEnt.scaleX || 1, sy = insEnt.scaleY || 1;
                    const rad = ((insEnt.rotation || 0) * Math.PI) / 180;
                    const cosR = Math.cos(rad), sinR = Math.sin(rad);
                    const bx = blkObj.baseX || 0, by = blkObj.baseY || 0;
                    const ix = insEnt.x || 0, iy = insEnt.y || 0;
                    const dx = (wx - bx) * sx, dy = (wy - by) * sy;
                    wx = ix + (dx * cosR - dy * sinR) * kMul;
                    wy = iy + (dx * sinR + dy * cosR) * kMul;
                    rot += (insEnt.rotation || 0);
                    h *= Math.abs(sy) * kMul;
                    if (sbb && isFinite(sbb.minX)) {
                      let tMinX = Infinity, tMinY = Infinity, tMaxX = -Infinity, tMaxY = -Infinity;
                      for (const [cx, cy] of [[sbb.minX, sbb.minY], [sbb.maxX, sbb.minY], [sbb.maxX, sbb.maxY], [sbb.minX, sbb.maxY]]) {
                        const cdx = (cx - bx) * sx, cdy = (cy - by) * sy;
                        const cwx = ix + (cdx * cosR - cdy * sinR) * kMul;
                        const cwy = iy + (cdx * sinR + cdy * cosR) * kMul;
                        if (cwx < tMinX) tMinX = cwx; if (cwx > tMaxX) tMaxX = cwx;
                        if (cwy < tMinY) tMinY = cwy; if (cwy > tMaxY) tMaxY = cwy;
                      }
                      wb = { minX: tMinX, minY: tMinY, maxX: tMaxX, maxY: tMaxY };
                    }
                  } else {
                    wx *= kMul; wy *= kMul; h *= kMul;
                  }
                  list.push({ type: 'TEXT', text: se.text || '', x: wx, y: wy, height: h, rotation: rot, hMode: se.hMode || 'left', vMode: se.vMode || 'baseline', widthFactor: se.widthFactor || 0.86, boxWidth: (se.boxWidth || 0) * kMul, layer: insEnt.layer || se.layer || '0', _bbox: wb });
                }
                return list;
              };
              const dTextsA = collectTextDiffs(diffIdxA, blkA, parsedA, eA, 1.0);
              const dTextsBNorm = collectTextDiffs(diffIdxB, blkB, parsedB, normB, unitRatio);
              const dTextsBLocal = (normB !== eB) ? collectTextDiffs(diffIdxB, blkB, parsedB, eB, 1.0) : dTextsBNorm;
              if (dTextsA.length > 0) {
                Object.defineProperty(eA, '_diffTextEntities', { value: dTextsA, writable: true, configurable: true, enumerable: false });
              }
              if (dTextsBNorm.length > 0) {
                Object.defineProperty(eB, '_diffTextEntities', { value: dTextsBLocal, writable: true, configurable: true, enumerable: false });
                if (normB !== eB) Object.defineProperty(normB, '_diffTextEntities', { value: dTextsBNorm, writable: true, configurable: true, enumerable: false });
              }
              if (isFinite(sMinX)) {
                pairBBox = { minX: sMinX, minY: sMinY, maxX: sMaxX, maxY: sMaxY };
                if (dTextsA.length > 0 && (!eA._diffSubSegments || eA._diffSubSegments.length === 0)) {
                  const tbA = dTextsA[0]._bbox;
                  if (tbA) Object.defineProperty(eA, '_diffBBox', { value: tbA, writable: true, configurable: true, enumerable: false });
                }
                if (dTextsBNorm.length > 0 && (!eB._diffSubSegments || eB._diffSubSegments.length === 0)) {
                  const tbB = dTextsBNorm[0]._bbox;
                  if (tbB) {
                    Object.defineProperty(eB, '_diffBBox', { value: tbB, writable: true, configurable: true, enumerable: false });
                    if (normB !== eB) Object.defineProperty(normB, '_diffBBox', { value: tbB, writable: true, configurable: true, enumerable: false });
                  }
                }
              }
            }
          }
        }
        // Fallback: if a DIMENSION without a *D block (or with unmatched *D block) had its text/measurement changed,
        // attach _diffTextEntities so the measurement value is highlighted and gets a whole-word box!
        if (eB.type === 'DIMENSION' && !eA._diffTextEntities && !eB._diffTextEntities && ((eA.text || '') !== (normB.text || '') || eA.measurement !== normB.measurement)) {
          const resolveDimLbl = ent => {
            if (ent.text && ent.text !== '<>') {
              return ent.measurement != null ? String(ent.text).replace(/<>/g, String(Number(Number(ent.measurement).toFixed(4)))) : String(ent.text);
            }
            return ent.measurement != null ? String(Number(Number(ent.measurement).toFixed(4))) : (ent.text || '');
          };
          const mkDimTxt = (ent, kMul) => {
            const tx = (ent.textX != null ? ent.textX : ((ent.x1 || 0) + (ent.x2 || 0)) * 0.5) * kMul;
            const ty = (ent.textY != null ? ent.textY : ((ent.y1 || 0) + (ent.y2 || 0)) * 0.5) * kMul;
            const lbl = resolveDimLbl(ent);
            const h = 2.5 * kMul;
            const w = Math.max(h * 1.5, Math.max(1, lbl.length) * h * 0.65);
            return [{ type: 'TEXT', text: lbl, x: tx, y: ty, height: h, rotation: 0, hMode: 'center', vMode: 'bottom', layer: ent.layer || '0', _bbox: { minX: tx - w * 0.5, minY: ty, maxX: tx + w * 0.5, maxY: ty + h } }];
          };
          const dtA = mkDimTxt(eA, 1.0);
          const dtBNorm = mkDimTxt(normB, 1.0);
          const dtBLocal = (normB !== eB) ? mkDimTxt(eB, 1.0) : dtBNorm;
          Object.defineProperty(eA, '_diffTextEntities', { value: dtA, writable: true, configurable: true, enumerable: false });
          Object.defineProperty(eB, '_diffTextEntities', { value: dtBLocal, writable: true, configurable: true, enumerable: false });
          if (normB !== eB) Object.defineProperty(normB, '_diffTextEntities', { value: dtBNorm, writable: true, configurable: true, enumerable: false });
          if (!eA._diffSubSegments || eA._diffSubSegments.length === 0) {
            Object.defineProperty(eA, '_diffBBox', { value: dtA[0]._bbox, writable: true, configurable: true, enumerable: false });
          }
          if (!eB._diffSubSegments || eB._diffSubSegments.length === 0) {
            Object.defineProperty(eB, '_diffBBox', { value: dtBNorm[0]._bbox, writable: true, configurable: true, enumerable: false });
            if (normB !== eB) Object.defineProperty(normB, '_diffBBox', { value: dtBNorm[0]._bbox, writable: true, configurable: true, enumerable: false });
            pairBBox = {
              minX: Math.min(dtA[0]._bbox.minX, dtBNorm[0]._bbox.minX),
              minY: Math.min(dtA[0]._bbox.minY, dtBNorm[0]._bbox.minY),
              maxX: Math.max(dtA[0]._bbox.maxX, dtBNorm[0]._bbox.maxX),
              maxY: Math.max(dtA[0]._bbox.maxY, dtBNorm[0]._bbox.maxY)
            };
          }
        }
        modifiedPairs.push({
          type: eB.type,
          layer: eB.layer,
          before: eA,
          after: eB,
          deltaDist: +bestDist.toFixed(3),
          bbox: pairBBox,
          summary
        });
      }
    }

    // Per-layer breakdown of differences
    const layerDiffStats = {};
    const ensureLStat = l => {
      if (!layerDiffStats[l]) layerDiffStats[l] = { layer: l, added: 0, removed: 0, unchanged: 0, modified: 0 };
      return layerDiffStats[l];
    };
    for (const e of unchanged) ensureLStat(e.layer || '0').unchanged++;
    for (const e of added) ensureLStat(e.layer || '0').added++;
    for (const e of removed) ensureLStat(e.layer || '0').removed++;
    for (const mp of modifiedPairs) ensureLStat(mp.layer || '0').modified++;

    const diffResult = {
      added,
      removed,
      unchanged,
      modifiedPairs,
      pairedMeasurementDiffs: (() => {
        const out = [];
        const usedRem = new Set();
        for (const eb of added) {
          if (!eb || (eb.type !== 'DIMENSION' && eb.type !== 'TEXT')) continue;
          const newLbl = eb.type === 'DIMENSION' ? resolveDimensionLabel(eb, parsedB) : cleanDXFText(eb.text || '').trim();
          if (!newLbl) continue;
          const bx = ((eb.textX ?? eb.x ?? eb.x1 ?? 0) * unitRatio) + ((opts.offsetB && opts.offsetB.dx) || 0);
          const by = ((eb.textY ?? eb.y ?? eb.y1 ?? 0) * unitRatio) + ((opts.offsetB && opts.offsetB.dy) || 0);
          let bestEa = null, bestDist = Infinity;
          for (const ea of removed) {
            if (!ea || usedRem.has(ea) || ea.type !== eb.type) continue;
            const ax = ea.textX ?? ea.x ?? ea.x1 ?? 0;
            const ay = ea.textY ?? ea.y ?? ea.y1 ?? 0;
            const d = Math.hypot(bx - ax, by - ay);
            if (d < bestDist && d <= Math.max(25, (eb.height || 5) * 8)) { bestDist = d; bestEa = ea; }
          }
          if (bestEa) {
            const oldLbl = bestEa.type === 'DIMENSION' ? resolveDimensionLabel(bestEa, parsedA) : cleanDXFText(bestEa.text || '').trim();
            if (oldLbl && oldLbl !== newLbl) {
              usedRem.add(bestEa);
              eb._pairedBefore = bestEa;
              eb._oldMeasurementLabel = oldLbl;
              eb._newMeasurementLabel = newLbl;
              out.push({ entA: bestEa, entB: eb, type: eb.type, layer: eb.layer || '0', oldValue: oldLbl, newValue: newLbl, label: `${oldLbl} → ${newLbl}` });
            }
          }
        }
        return out;
      })(),
      layerDiffStats,
      unchangedCount,
      unitRatio,
      comparedLayers: comparedLayers ? [...comparedLayers] : null,
      totalA: filteredA.length,
      totalB: filteredB.length
    };
    if (!layerMapping) {
      _lastDiffCache = {
        pA: parsedA,
        pB: parsedB,
        revA: parsedA._mutationRev || 0,
        revB: parsedB._mutationRev || 0,
        key: cacheKey,
        result: diffResult
      };
    }
    return diffResult;
  }

  /**
   * Native Vector DXF Comparison Canvas Renderer
   * Renders parsedA and parsedB directly onto a 2D Canvas in CAD vector space without PDF conversion!
   */
  function renderNativeDXFComparison(canvas, parsedA, parsedB, diffResult, options = {}) {
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const pA = parsedA || null;
    const pB = parsedB || null;
    if (!pA && !pB) return null;

    const mode = options.mode || 'over'; // 'paper' | 'over' | 'diff' | 'side' | 'blink' | 'A' | 'B'
    const isPaper = mode === 'paper' || (options.background && /^#?(fff|ffffff)$/i.test(String(options.background).trim()));
    const bg = options.background || (isPaper ? '#ffffff' : '#090d14');
    const isLightBg = /^#?(fff|ffffff|f[0-9a-f]{5}|e[0-9a-f]{5})/i.test(String(bg).trim());

    const codeA = pA ? (pA.insunitsCode ?? 0) : 0;
    const codeB = pB ? (pB.insunitsCode ?? 0) : 0;
    const uA = INSUNITS_CODE_MAP[codeA] ? UNITS[INSUNITS_CODE_MAP[codeA]].toMM : 1;
    const uB = INSUNITS_CODE_MAP[codeB] ? UNITS[INSUNITS_CODE_MAP[codeB]].toMM : 1;
    const bToA = (pA && pB && codeA && codeB && codeA !== codeB && uA > 0 && uB > 0) ? (uB / uA) : 1.0;

    const boundsA = pA && isFinite(pA.bounds.minX) ? pA.bounds : null;
    const boundsB = pB && isFinite(pB.bounds.minX) ? pB.bounds : null;
    const sharedBounds = options.sharedBounds || ((boundsA && boundsB) ? {
      minX: Math.min(boundsA.minX, boundsB.minX * bToA),
      minY: Math.min(boundsA.minY, boundsB.minY * bToA),
      maxX: Math.max(boundsA.maxX, boundsB.maxX * bToA),
      maxY: Math.max(boundsA.maxY, boundsB.maxY * bToA)
    } : (boundsA || boundsB || { minX: 0, minY: 0, maxX: 200, maxY: 150 }));

    const bw = Math.max(1e-3, sharedBounds.maxX - sharedBounds.minX || 100);
    const bh = Math.max(1e-3, sharedBounds.maxY - sharedBounds.minY || 100);
    const isViewportMode = !!options.viewportMode;
    const dpr = Math.max(1, Number(options.dpr) || 1);
    const viewK = isViewportMode ? Math.max(0.01, Number(options.viewK) || 1) : 1;
    const viewX = isViewportMode ? (Number(options.viewX) || 0) : 0;
    const viewY = isViewportMode ? (Number(options.viewY) || 0) : 0;
    const baseW = isViewportMode ? Math.max(1, Number(options.baseCanvasW) || canvas.width) : canvas.width;
    const baseH = isViewportMode ? Math.max(1, Number(options.baseCanvasH) || canvas.height) : canvas.height;
    const padding = options.padding != null ? options.padding : (isViewportMode ? (40 * (baseW / 2200)) : 40);
    const singleW = mode === 'side' ? Math.floor((baseW - 24) / 2) : baseW;
    const targetW = Math.max(10, singleW - padding * 2);
    const targetH = Math.max(10, baseH - padding * 2);
    const baseScale = Math.min(targetW / bw, targetH / bh);
    const baseOffsetX = padding + (targetW - bw * baseScale) / 2;
    const baseOffsetY = padding + (targetH - bh * baseScale) / 2;
    const scale = baseScale * viewK * (isViewportMode ? dpr : 1);
    const offsetX = baseOffsetX;
    const offsetY = baseOffsetY;
    const alignDx = Number(options.alignDx) || 0;
    const alignDy = Number(options.alignDy) || 0;
    const centerOffB = options.centerOffsetB || { dx: 0, dy: 0 };
    const isInteracting = !!options.isInteracting;
    const commonUseOrig = !!options.commonUseOriginalColors;
    const curRotA = ((Number(options.rotDegA) || 0) % 360 + 360) % 360;
    const curRotB = ((Number(options.rotDegB) || 0) % 360 + 360) % 360;
    const curMirXA = !!options.mirXA, curMirYA = !!options.mirYA;
    const curMirXB = !!options.mirXB, curMirYB = !!options.mirYB;
    const applySlotTransform = (bxPx, byPx, isB) => {
      let px = bxPx, py = byPx;
      const deg = isB ? curRotB : curRotA;
      const mx = isB ? curMirXB : curMirXA;
      const my = isB ? curMirYB : curMirYA;
      if (deg || mx || my) {
        const cx = singleW * 0.5, cy = baseH * 0.5;
        let dx = px - cx, dy = py - cy;
        if (deg === 90) { const t = dx; dx = -dy; dy = t; }
        else if (deg === 180) { dx = -dx; dy = -dy; }
        else if (deg === 270) { const t = dx; dx = dy; dy = -t; }
        if (mx) dx = -dx;
        if (my) dy = -dy;
        px = cx + dx;
        py = cy + dy;
      }
      if (isB) { px += alignDx; py += alignDy; }
      return [px, py];
    };

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw CAD Grid & Origin UCS
    if (options.showGrid !== false) {
      ctx.save();
      ctx.strokeStyle = isLightBg ? 'rgba(148, 163, 184, 0.24)' : 'rgba(56, 189, 248, 0.10)';
      ctx.lineWidth = 0.75;
      const gridStep = Math.max(36, Math.round(targetW / 18));
      ctx.beginPath();
      for (let gx = padding; gx <= canvas.width - padding; gx += gridStep) {
        ctx.moveTo(gx, padding); ctx.lineTo(gx, canvas.height - padding);
      }
      for (let gy = padding; gy <= canvas.height - padding; gy += gridStep) {
        ctx.moveTo(padding, gy); ctx.lineTo(canvas.width - padding, gy);
      }
      ctx.stroke();

      // UCS (0,0) Origin indicator if inside or near bounds
      const ox0 = offsetX + (0 - sharedBounds.minX) * scale;
      const oy0 = canvas.height - (offsetY + (0 - sharedBounds.minY) * scale);
      if (ox0 >= 0 && ox0 <= singleW && oy0 >= 0 && oy0 <= canvas.height) {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
        ctx.beginPath(); ctx.moveTo(ox0, oy0); ctx.lineTo(ox0 + 28, oy0); ctx.stroke();
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.55)';
        ctx.beginPath(); ctx.moveTo(ox0, oy0); ctx.lineTo(ox0, oy0 - 28); ctx.stroke();
      }
      ctx.restore();
    }

    const hiddenLayers = options.hiddenLayers instanceof Set ? options.hiddenLayers : new Set(options.hiddenLayers || []);
    const comparedLayers = options.comparedLayers instanceof Set ? options.comparedLayers : (Array.isArray(options.comparedLayers) ? new Set(options.comparedLayers) : null);
    const showA = options.showLayerA !== false;
    const showB = options.showLayerB !== false;
    const showCommon = options.showCommon !== false;
    const cmpState = (typeof window !== 'undefined' && window.CMP) ? window.CMP : null;
    const rawTintA = options.tintA || (cmpState && cmpState.tintA);
    const rawTintB = options.tintB || (cmpState && cmpState.tintB);
    const isDefA = !rawTintA || /^#(e11414|ef4444|dc2626)$/i.test(rawTintA);
    const isDefB = !rawTintB || /^#(00a53c|16a34a|ffffff|fff)$/i.test(rawTintB);
    const colRemoved = contrastAdjustHex(isDefA ? (isLightBg ? '#e11d48' : '#ff2a4b') : rawTintA, !isLightBg);
    const colAdded = contrastAdjustHex(isDefB ? (isLightBg ? '#0066ff' : '#00f0ff') : rawTintB, !isLightBg);
    const colCommon = options.tintC || (cmpState && cmpState.tintC) || (isLightBg ? '#94a3b8' : '#475569');

    const drawSingleEntity = (ent, parser, kScale, xViewportOff, colorOverride, alphaOverride, lwScale = 1.0, parentTransform = null, depth = 0, inDimBlock = false) => {
      if (!ent || depth > 8) return;
      const lyrName = ent.layer || '0';
      const isDimEnt = (ent.type === 'DIMENSION');
      const isHiddenLyr = (!inDimBlock && (
        /^defpoints$/i.test(lyrName) ||
        hiddenLayers.has(lyrName) ||
        (comparedLayers && comparedLayers.size > 0 && !comparedLayers.has(lyrName))
      ));
      const lyrObj = parser && parser.layers ? parser.layers[lyrName] : null;
      const isFrozenLyr = (!inDimBlock && lyrObj && (lyrObj.visible === false || lyrObj.frozen === true) && !comparedLayers);
      // Never hide a DIMENSION's measurement value even if its layer is Defpoints or hidden!
      const dimValueOnly = isDimEnt && (isHiddenLyr || isFrozenLyr);
      if (!isDimEnt && (isHiddenLyr || isFrozenLyr)) return;
      if (ent.type === 'POINT' && inDimBlock) return;

      const isSlotB = (parser === pB && pA && pB);
      const offBx = isSlotB ? (centerOffB.dx || 0) : 0;
      const offBy = isSlotB ? (centerOffB.dy || 0) : 0;

      const worldToScreen = (wx, wy) => {
        const bxBase = xViewportOff + baseOffsetX + (wx * kScale + offBx - sharedBounds.minX) * baseScale;
        const byBase = baseH - (baseOffsetY + (wy * kScale + offBy - sharedBounds.minY) * baseScale);
        const [rx, ry] = applySlotTransform(bxBase, byBase, isSlotB);
        if (!isViewportMode) return [rx, ry];
        return [(rx * viewK + viewX) * dpr, (ry * viewK + viewY) * dpr];
      };
      const tx = x => worldToScreen(x, 0)[0];
      const ty = y => worldToScreen(0, y)[1];

      // Fast Viewport Frustum Culling for 50k+ entity DXF responsiveness
      if (depth === 0 && !parentTransform) {
        const bb = ent._bbox || (ent._bbox = computeStandaloneEntityBBox(ent, parser));
        if (bb && isFinite(bb.minX) && isFinite(bb.maxX)) {
          const [s1x, s1y] = worldToScreen(bb.minX, bb.minY);
          const [s2x, s2y] = worldToScreen(bb.maxX, bb.maxY);
          const minSx = Math.min(s1x, s2x), maxSx = Math.max(s1x, s2x);
          const minSy = Math.min(s1y, s2y), maxSy = Math.max(s1y, s2y);
          if (maxSx < -48 || minSx > canvas.width + 48 || maxSy < -48 || minSy > canvas.height + 48) return;
          if (isInteracting && ent.type !== 'TEXT' && ent.type !== 'DIMENSION' && (maxSx - minSx < 0.65 && maxSy - minSy < 0.65)) return;
        }
      }

      const mapPt = (x, y) => {
        if (!parentTransform) return worldToScreen(x, y);
        const { bx, by, ix, iy, sx, sy, cosR, sinR } = parentTransform;
        const dx = (x - bx) * sx, dy = (y - by) * sy;
        return worldToScreen(ix + dx * cosR - dy * sinR, iy + dx * sinR + dy * cosR);
      };

      const col = colorOverride || (parser ? parser._resolveColor(ent, isLightBg) : (isLightBg ? '#0f172a' : '#f8fafc'));
      const isLocked = !!(lyrObj && lyrObj.locked);
      const lyrOpacity = (lyrObj && lyrObj.opacity != null) ? (lyrObj.opacity / 100) : 1.0;
      const effAlpha = (alphaOverride != null ? alphaOverride : 1.0) * lyrOpacity * (isLocked ? 0.55 : 1.0);

      ctx.save();
      ctx.globalAlpha = effAlpha;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (!isInteracting && lwScale >= 1.35 && colorOverride && colorOverride !== colCommon) {
        ctx.shadowColor = col;
        ctx.shadowBlur = isLightBg ? 2.5 : 5.0;
      }

      const ltype = String(ent.linetype || (lyrObj && lyrObj.linetype) || 'CONTINUOUS').toUpperCase();
      const baseW = (options.lineWidth || 1.1) * lwScale * (isViewportMode ? dpr : 1) * (inDimBlock ? 0.85 : (parser ? parser._getEntityStrokeScale(ent, lyrObj, ltype) : 1.0));
      ctx.lineWidth = Math.max(0.75 * (isViewportMode ? dpr : 1), baseW);

      if (ltype.includes('DASH') || ltype.includes('HIDDEN')) ctx.setLineDash([6, 4]);
      else if (ltype.includes('CENTER')) ctx.setLineDash([12, 3.5, 2.5, 3.5]);
      else if (ltype.includes('DOT') || ltype.includes('PHANTOM')) ctx.setLineDash([2.5, 3.5]);
      else ctx.setLineDash([]);

      if (ent.type === 'LINE') {
        const [x1, y1] = mapPt(ent.x1, ent.y1), [x2, y2] = mapPt(ent.x2, ent.y2);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      } else if (ent.type === 'CIRCLE') {
        const [cx, cy] = mapPt(ent.cx, ent.cy);
        const rScale = parentTransform ? Math.abs(parentTransform.sx) : 1;
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.5, ent.r * kScale * scale * rScale), 0, Math.PI * 2); ctx.stroke();
      } else if (ent.type === 'ARC') {
        const sAng = ent.startAngle || 0;
        let eAng = ent.endAngle != null ? ent.endAngle : 360;
        if (eAng <= sAng) eAng += 360;
        const sweep = eAng - sAng;
        const steps = Math.max(12, Math.min(72, Math.ceil(sweep / 4)));
        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
          const rad = ((sAng + (sweep * s) / steps) * Math.PI) / 180;
          const [ax, ay] = mapPt(ent.cx + ent.r * Math.cos(rad), ent.cy + ent.r * Math.sin(rad));
          if (s === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
        }
        ctx.stroke();
      } else if (ent.type === 'ELLIPSE') {
        const steps = 48;
        const sParam = ent.startParam ?? 0;
        let eParam = ent.endParam ?? (Math.PI * 2);
        if (eParam <= sParam) eParam += Math.PI * 2;
        const cosE = Math.cos(ent.rotation || 0), sinE = Math.sin(ent.rotation || 0);
        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
          const t = sParam + ((eParam - sParam) * s) / steps;
          const lx = ent.rx * Math.cos(t), ly = ent.ry * Math.sin(t);
          const [ex, ey] = mapPt(ent.cx + lx * cosE - ly * sinE, ent.cy + lx * sinE + ly * cosE);
          if (s === 0) ctx.moveTo(ex, ey); else ctx.lineTo(ex, ey);
        }
        ctx.stroke();
      } else if (ent.type === 'LWPOLYLINE' && ent.points && ent.points.length > 1) {
        const rPts = ent.renderPoints || ent.points;
        ctx.beginPath();
        const [p0x, p0y] = mapPt(rPts[0][0], rPts[0][1]);
        ctx.moveTo(p0x, p0y);
        for (let p = 1; p < rPts.length; p++) {
          const [px, py] = mapPt(rPts[p][0], rPts[p][1]);
          ctx.lineTo(px, py);
        }
        if (ent.closed) ctx.closePath();
        ctx.stroke();
      } else if (ent.type === 'SOLID' && ent.points && ent.points.length >= 3) {
        ctx.setLineDash([]);
        ctx.globalAlpha = effAlpha * 0.65;
        ctx.beginPath();
        const [p0x, p0y] = mapPt(ent.points[0][0], ent.points[0][1]);
        ctx.moveTo(p0x, p0y);
        for (let p = 1; p < ent.points.length; p++) {
          const [px, py] = mapPt(ent.points[p][0], ent.points[p][1]);
          ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      } else if (ent.type === 'HATCH' && ent.loops) {
        ctx.setLineDash([]);
        for (const lp of ent.loops) {
          if (!lp || lp.length < 2) continue;
          ctx.beginPath();
          const [p0x, p0y] = mapPt(lp[0][0], lp[0][1]);
          ctx.moveTo(p0x, p0y);
          for (let k = 1; k < lp.length; k++) {
            const [px, py] = mapPt(lp[k][0], lp[k][1]);
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      } else if (ent.type === 'INSERT' && parser) {
        const blk = parser._getBlock ? parser._getBlock(ent.blockName) : (parser.blocks && parser.blocks[ent.blockName]);
        if (blk && Array.isArray(blk.entities)) {
          const rad = ((ent.rotation || 0) + (parentTransform ? (parentTransform.rotDeg || 0) : 0)) * Math.PI / 180;
          const [insWx, insWy] = parentTransform ? (() => {
            const { bx, by, ix, iy, sx, sy, cosR, sinR } = parentTransform;
            const dx = (ent.x - bx) * sx, dy = (ent.y - by) * sy;
            return [ix + dx * cosR - dy * sinR, iy + dx * sinR + dy * cosR];
          })() : [ent.x, ent.y];
          const tf = {
            bx: blk.baseX || 0, by: blk.baseY || 0, ix: insWx, iy: insWy,
            sx: (ent.scaleX || 1) * (parentTransform ? (parentTransform.sx || 1) : 1),
            sy: (ent.scaleY || 1) * (parentTransform ? (parentTransform.sy || 1) : 1),
            cosR: Math.cos(rad), sinR: Math.sin(rad),
            rotDeg: (ent.rotation || 0) + (parentTransform ? (parentTransform.rotDeg || 0) : 0)
          };
          const isDim = inDimBlock || /^\*D/i.test(ent.blockName);
          const subSet = (colorOverride && ent._diffSubIndices instanceof Set && ent._diffSubIndices.size > 0) ? ent._diffSubIndices : null;
          for (let si = 0; si < blk.entities.length; si++) {
            const sub = blk.entities[si];
            const isDiffSub = subSet ? subSet.has(si) : true;
            drawSingleEntity(sub, parser, kScale, xViewportOff, isDiffSub ? colorOverride : colCommon, isDiffSub ? alphaOverride : 0.45, isDiffSub ? lwScale : 1.0, tf, depth + 1, isDim);
          }
        }
      } else if (ent.type === 'DIMENSION') {
        const dBlk = (ent.blockName && parser) ? (parser._getBlock ? parser._getBlock(ent.blockName) : (parser.blocks && parser.blocks[ent.blockName])) : null;
        let drewDimText = false;
        if (!dimValueOnly) {
          if (dBlk && Array.isArray(dBlk.entities)) {
            const subSet = (colorOverride && ent._diffSubIndices instanceof Set && ent._diffSubIndices.size > 0) ? ent._diffSubIndices : null;
            for (let si = 0; si < dBlk.entities.length; si++) {
              const sub = dBlk.entities[si];
              if (sub && (sub.type === 'TEXT' || sub.type === 'MTEXT') && String(sub.text || '').trim().length > 0) drewDimText = true;
              const isDiffSub = subSet ? subSet.has(si) : true;
              drawSingleEntity(sub, parser, kScale, xViewportOff, isDiffSub ? colorOverride : colCommon, isDiffSub ? alphaOverride : 0.36, isDiffSub ? lwScale : 1.0, parentTransform, depth + 1, true);
            }
          } else {
            const [x1, y1] = mapPt(ent.x1, ent.y1), [x2, y2] = mapPt(ent.x2, ent.y2);
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          }
        }
        if (!drewDimText || dimValueOnly) {
          const rawLbl = resolveDimensionLabel(ent, parser);
          if (rawLbl) {
            const [txP, tyP] = mapPt(ent.textX != null ? ent.textX : (ent.x1 + ent.x2) / 2, ent.textY != null ? ent.textY : (ent.y1 + ent.y2) / 2);
            const dimFs = Math.max(9 * dpr, Math.min(48 * dpr, bw * 0.0115 * scale));
            ctx.font = `600 ${dimFs}px ${MULTILINGUAL_FONT_STACK}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(rawLbl, txP, tyP - 2);
          }
        }
      } else if (ent.type === 'TEXT') {
        const [px, py] = mapPt(ent.x, ent.y);
        const blkScaleY = parentTransform ? Math.abs(parentTransform.sy || parentTransform.sx || 1) : 1;
        const blkScaleX = parentTransform ? Math.abs(parentTransform.sx || parentTransform.sy || 1) : 1;
        const rawH = (ent.height > 0 ? ent.height : (bw * 0.01)) * kScale;
        const fontSize = Math.max(1.5, Math.min(96, rawH * blkScaleY * scale * 0.92));
        const rotDeg = (ent.rotation || 0) + (parentTransform ? (parentTransform.rotDeg || 0) : 0);
        const lines = String(ent.text || '').split('\n');
        const lineStep = fontSize * (ent.lineSpacing || 1.2);
        const totalH = fontSize + (lines.length - 1) * lineStep;
        const hMode = ent.hMode || 'left', vMode = ent.vMode || 'baseline';
        let wf = (ent.widthFactor || 0.86) * (blkScaleX / Math.max(1e-4, blkScaleY));
        ctx.translate(px, py);
        if (rotDeg) ctx.rotate((-rotDeg * Math.PI) / 180);
        ctx.font = `500 ${fontSize}px ${MULTILINGUAL_FONT_STACK}`;
        if (Math.abs(wf - 1) > 0.01) ctx.scale(wf, 1);
        ctx.textAlign = hMode;
        ctx.textBaseline = 'alphabetic';
        lines.forEach((ln, idx) => {
          if (!ln) return;
          let ly = idx * lineStep;
          if (vMode === 'top') ly = fontSize * 0.82 + idx * lineStep;
          else if (vMode === 'middle') ly = -totalH / 2 + fontSize * 0.82 + idx * lineStep;
          else if (vMode === 'bottom') ly = -(lines.length - 1 - idx) * lineStep - fontSize * 0.12;
          ctx.fillText(ln, 0, ly);
        });
      }
      ctx.restore();
    };

    const diff = diffResult || (pA && pB ? compareDXFEntities(pA, pB, options) : null);

    if (mode === 'curtain' && pA && pB) {
      const splitPx = Number.isFinite(options.curtainSplitX) ? options.curtainSplitX : (canvas.width * 0.5);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, Math.max(0, splitPx), canvas.height); ctx.clip();
      for (const e of pA.entities) drawSingleEntity(e, pA, 1.0, 0, null, 1.0, 1.0);
      ctx.restore();
      ctx.save();
      ctx.beginPath(); ctx.rect(Math.max(0, splitPx), 0, Math.max(0, canvas.width - splitPx), canvas.height); ctx.clip();
      for (const e of pB.entities) drawSingleEntity(e, pB, bToA, 0, null, 1.0, 1.0);
      ctx.restore();
    } else if (mode === 'A' || (mode === 'blink' && options.blinkPhase === 0) || (pA && !pB)) {
      for (const e of (pA ? pA.entities : [])) drawSingleEntity(e, pA, 1.0, 0, null, 1.0, 1.0);
    } else if (mode === 'B' || (mode === 'blink' && options.blinkPhase === 1) || (pB && !pA)) {
      for (const e of (pB ? pB.entities : [])) drawSingleEntity(e, pB, bToA, 0, null, 1.0, 1.0);
    } else if (mode === 'side' && pA && pB) {
      // Divider bar
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(singleW, 0, 24, canvas.height);
      const remSet = new Set(diff ? diff.removed : []);
      const addSet = new Set(diff ? diff.added : []);
      const sideCommonAlpha = (cmpState && cmpState.opC != null) ? (cmpState.opC / 100) : 0.72;
      for (const e of pA.entities) {
        const isRem = remSet.has(e);
        drawSingleEntity(e, pA, 1.0, 0, isRem ? colRemoved : colCommon, isRem ? 1.0 : sideCommonAlpha, 1.0);
      }
      for (const e of pB.entities) {
        const isAdd = addSet.has(e);
        drawSingleEntity(e, pB, bToA, singleW + 24, isAdd ? colAdded : colCommon, isAdd ? 1.0 : sideCommonAlpha, 1.0);
      }
    } else if (diff) {
      // Native Vector Overlay ('over', 'paper', 'diff') — use muted/custom colCommon so Rev A & Rev B differences stand out clearly
      const commonAlpha = mode === 'diff' ? 0.15 : ((cmpState && cmpState.opC != null) ? (cmpState.opC / 100) : 0.42);
      const drawDiffEntityOrSubSegs = (ent, parserObj, kScale, diffColor) => {
        if (!ent) return;
        if (ent.type !== 'DIMENSION' && ent.type !== 'TEXT' && ((Array.isArray(ent._commonSubSegments) && ent._commonSubSegments.length > 0) || (Array.isArray(ent._diffSubSegments) && ent._diffSubSegments.length > 0))) {
          if (showCommon && Array.isArray(ent._commonSubSegments)) {
            for (const cs of ent._commonSubSegments) {
              drawSingleEntity(cs, parserObj, kScale, 0, colCommon, commonAlpha, 1.0);
            }
          }
          if (Array.isArray(ent._diffSubSegments)) {
            for (const ds of ent._diffSubSegments) {
              drawSingleEntity(ds, parserObj, kScale, 0, diffColor, 1.0, 1.55);
            }
          }
          if (Array.isArray(ent._diffTextEntities) && ent._diffTextEntities.length > 0) {
            for (const dte of ent._diffTextEntities) {
              drawSingleEntity(dte, parserObj, kScale, 0, diffColor, 1.0, 1.55);
            }
          } else if (ent.type === 'DIMENSION' && (!ent._diffSubSegments || ent._diffSubSegments.length === 0)) {
            drawSingleEntity(ent, parserObj, kScale, 0, diffColor, 1.0, 1.55);
          }
        } else {
          drawSingleEntity(ent, parserObj, kScale, 0, diffColor, 1.0, 1.55);
        }
      };
      if (showCommon) {
        for (const e of (diff.unchanged || [])) {
          drawSingleEntity(e, pA, 1.0, 0, colCommon, commonAlpha, 1.0);
        }
      }
      const modIdsA = new Set((diff.modifiedPairs || []).map(m => m.before && m.before._id));
      const modIdsB = new Set((diff.modifiedPairs || []).map(m => m.after && m.after._id));
      if (showA) {
        for (const e of (diff.removed || [])) {
          if (!modIdsA.has(e._id)) drawDiffEntityOrSubSegs(e, pA, 1.0, colRemoved);
        }
        for (const m of (diff.modifiedPairs || [])) {
          if (m.before) drawDiffEntityOrSubSegs(m.before, pA, 1.0, colRemoved);
        }
      }
      if (showB) {
        for (const e of (diff.added || [])) {
          if (!modIdsB.has(e._id)) drawDiffEntityOrSubSegs(e, pB, bToA, colAdded);
        }
        for (const m of (diff.modifiedPairs || [])) {
          if (m.after) drawDiffEntityOrSubSegs(m.after, pB, bToA, colAdded);
        }
      }
    }

    // Compute pixel-space regions, standard 7-mil stepped drawing subBoxes, and whole-word text boxes for every vector diff entity!
    const txWorld = x => offsetX + (x - sharedBounds.minX) * scale;
    const tyWorld = y => canvas.height - (offsetY + (y - sharedBounds.minY) * scale);
    const unitInfoA = (pA && pA.unitName && UNITS[pA.unitName]) ? UNITS[pA.unitName] : UNITS.mm;
    const boxSizeMils = Number(options.boxSizeMils) > 0 ? Number(options.boxSizeMils) : 7;
    const regions = [];
    if (diff) {
      const addEntToRegions = (ent, kind) => {
        const hasEmptyDiffWithCommon = Array.isArray(ent._diffSubSegments) && ent._diffSubSegments.length === 0 && Array.isArray(ent._commonSubSegments) && ent._commonSubSegments.length > 0 && (!Array.isArray(ent._diffTextEntities) || ent._diffTextEntities.length === 0);
        if (hasEmptyDiffWithCommon) return;
        const bb = ent._diffBBox || ent._bbox || computeStandaloneEntityBBox(ent, kind === 'r' ? pA : pB);
        if (!bb || !isFinite(bb.minX)) return;
        const kScale = kind === 'a' ? bToA : 1.0;
        const subBoxes = computeSteppedDiffBoxes(ent, (wx, wy) => [txWorld(wx * kScale), tyWorld(wy * kScale)], {
          boxSizeMils,
          toMils: unitInfoA.toMils || 39.3700787,
          scale,
          canvasW: canvas.width,
          canvasH: canvas.height,
          parser: kind === 'r' ? pA : pB,
          useLocalCoords: true
        });
        let rx, ry, rw, rh;
        if (subBoxes.length > 0) {
          let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
          for (const sb of subBoxes) {
            if (sb.x < bx0) bx0 = sb.x;
            if (sb.y < by0) by0 = sb.y;
            if (sb.x + sb.w > bx1) bx1 = sb.x + sb.w;
            if (sb.y + sb.h > by1) by1 = sb.y + sb.h;
          }
          rx = Math.max(0, Math.floor(bx0));
          ry = Math.max(0, Math.floor(by0));
          rw = Math.max(5, Math.ceil(bx1 - rx));
          rh = Math.max(5, Math.ceil(by1 - ry));
        } else {
          const x0 = Math.min(txWorld(bb.minX), txWorld(bb.maxX));
          const x1 = Math.max(txWorld(bb.minX), txWorld(bb.maxX));
          const y0 = Math.min(tyWorld(bb.minY), tyWorld(bb.maxY));
          const y1 = Math.max(tyWorld(bb.minY), tyWorld(bb.maxY));
          rx = Math.max(0, Math.round(x0 - 3));
          ry = Math.max(0, Math.round(y0 - 3));
          rw = Math.max(6, Math.round((x1 - x0) + 6));
          rh = Math.max(6, Math.round((y1 - y0) + 6));
        }
        regions.push({
          x: rx,
          y: ry,
          w: rw,
          h: rh,
          subBoxes,
          boxSizeMils,
          kind,
          type: kind === 'r' ? 'removed' : 'added',
          sa: kind === 'r' ? 120 : 0,
          sb: kind === 'a' ? 120 : 0,
          dpi: scale * 25.4,
          dxfEntity: ent,
          dxfLayer: ent.layer || '0',
          dxfType: ent.type,
          dxfSummary: ent._summary || describeDXFEntity(ent),
          worldBox: bb
        });
      };
      // Skip duplicate 'before' text indicators on modified text pairs so each text change gets ONLY ONE red triangle indication
      const pairedBeforeTextIds = new Set(
        (diff.modifiedPairs || [])
          .filter(m => m && m.before && m.after && (m.after.type === 'TEXT' || (Array.isArray(m.after._diffTextEntities) && m.after._diffTextEntities.length > 0 && (!m.after._diffSubSegments || m.after._diffSubSegments.length === 0))))
          .map(m => m.before._id)
      );
      if (showA) {
        for (const e of (diff.removed || [])) {
          if (showB && pairedBeforeTextIds.has(e._id)) continue;
          addEntToRegions(e, 'r');
        }
      }
      if (showB) {
        for (const e of (diff.added || [])) addEntToRegions(e, 'a');
      }

      // Render standard 7-mil stepped drawing boxes and single red triangle text indicators onto comparison canvas when showDiffBoxes !== false
      if (options.showDiffBoxes !== false && mode !== 'A' && mode !== 'B') {
        ctx.save();
        ctx.lineWidth = 1.8;
        for (const reg of regions) {
          const strokeC = reg.kind === 'r' ? colRemoved : colAdded;
          if (Array.isArray(reg.subBoxes) && reg.subBoxes.length > 0) {
            const boxList = reg.subBoxes.filter(sb => !sb.isTextTriangle && sb.shape !== 'triangle');
            const triList = reg.subBoxes.filter(sb => sb.isTextTriangle || sb.shape === 'triangle');
            if (boxList.length > 0) {
              ctx.strokeStyle = strokeC;
              ctx.fillStyle = reg.kind === 'r' ? 'rgba(239, 68, 68, 0.24)' : (isLightBg ? 'rgba(22, 163, 74, 0.20)' : 'rgba(255, 255, 255, 0.24)');
              ctx.beginPath();
              for (const sb of boxList) {
                ctx.fillRect(sb.x, sb.y, sb.w, sb.h);
                ctx.rect(sb.x, sb.y, sb.w, sb.h);
              }
              ctx.stroke();
            }
            if (triList.length > 0) {
              ctx.strokeStyle = '#ef4444';
              ctx.fillStyle = 'rgba(239, 68, 68, 0.88)';
              ctx.beginPath();
              for (const sb of triList) {
                ctx.moveTo(sb.x + sb.w * 0.5, sb.y);
                ctx.lineTo(sb.x + sb.w, sb.y + sb.h);
                ctx.lineTo(sb.x, sb.y + sb.h);
                ctx.closePath();
              }
              ctx.fill();
              ctx.stroke();
            }
          } else {
            ctx.strokeStyle = strokeC;
            ctx.fillStyle = reg.kind === 'r' ? 'rgba(239, 68, 68, 0.24)' : (isLightBg ? 'rgba(22, 163, 74, 0.20)' : 'rgba(255, 255, 255, 0.24)');
            ctx.fillRect(reg.x, reg.y, reg.w, reg.h);
            ctx.strokeRect(reg.x, reg.y, reg.w, reg.h);
          }
        }
        ctx.restore();
      }
    }

    return {
      sharedBounds,
      scale,
      offsetX,
      offsetY,
      bToA,
      regions,
      diff
    };
  }

  /**
   * Built-in Synthetic AutoCAD DXF Generator (Rev A vs Rev B Mechanical / PCB Enclosure Drawing)
   * Strictly spaced, non-overlapping layout with Multilingual CAD Specification Notes!
   */
  function generateSampleMechanicalDXF(isRevB = false, unit = 'mm') {
    const w = new DXFWriter({ unit, scale: 1.0 });
    const f = 1 / w.scaleFactor;

    // 1. SHEET_BORDER (260 x 180 mm) & NON-OVERLAPPING TITLE_BLOCK (x=148..254, y=6..40)
    w.addRect(0 * f, 0 * f, 260 * f, 180 * f, 'SHEET_BORDER', ACI.CYAN);
    w.addRect(148 * f, 6 * f, 106 * f, 34 * f, 'TITLE_BLOCK', ACI.CYAN);
    w.addLine(148 * f, 30 * f, 254 * f, 30 * f, 'TITLE_BLOCK', ACI.CYAN);
    w.addLine(148 * f, 22 * f, 254 * f, 22 * f, 'TITLE_BLOCK', ACI.CYAN);
    w.addLine(148 * f, 14 * f, 254 * f, 14 * f, 'TITLE_BLOCK', ACI.CYAN);
    w.addText('KENSHO STUDIO - CNC PCB CARRIER', 151 * f, 33 * f, 2.2 * f, 0, 'TITLE_BLOCK', ACI.YELLOW);
    // Separate revision rows so Rev A and Rev B never collide on top of each other in overlay compare!
    w.addText('REV A: INITIAL PRODUCTION RELEASE', 151 * f, 24.8 * f, 1.9 * f, 0, 'TITLE_BLOCK', ACI.GREEN);
    if (isRevB) {
      w.addText('REV B: ECO-204 SLOT & BOSS UPDATED', 151 * f, 16.8 * f, 1.9 * f, 0, 'TITLE_BLOCK', ACI.RED);
    }
    w.addText(`UNITS: ${unit.toUpperCase()} | TOL: +/-0.05mm | 日本語 / 中文`, 151 * f, 8.8 * f, 1.9 * f, 0, 'TITLE_BLOCK', ACI.WHITE);

    // 2. BOARD_OUTLINE (160 x 100 mm enclosure profile at (20, 48)..(180, 148))
    w.addRect(20 * f, 48 * f, 160 * f, 100 * f, 'BOARD_OUTLINE', ACI.WHITE);

    // 3. MOUNTING_HOLES (4 corner M4 mounting holes)
    const holes = [
      [30, 58, 4.2],
      [170, 58, 4.2],
      [30, 138, 4.2],
      [170, 138, 4.2]
    ];
    for (const [hx, hy, dia] of holes) {
      w.addCircle(hx * f, hy * f, (dia / 2) * f, 'MOUNTING_HOLES', ACI.GREEN);
      w.addCircle(hx * f, hy * f, (dia * 0.95) * f, 'MOUNTING_HOLES', ACI.GRAY);
    }

    // Center Standoff Boss (Relocated in Rev B from X=84 to X=104 so callouts and circles never collide!)
    const bossX = isRevB ? 104 : 84;
    const bossR = isRevB ? 4.0 : 3.0;
    w.addCircle(bossX * f, 104 * f, bossR * f, 'MOUNTING_HOLES', isRevB ? ACI.RED : ACI.GREEN);
    w.addLine((bossX - 6) * f, 104 * f, (bossX + 6) * f, 104 * f, 'CENTERLINES', ACI.CYAN);
    w.addLine(bossX * f, 98 * f, bossX * f, 110 * f, 'CENTERLINES', ACI.CYAN);

    // 4. CONNECTOR_CUTOUTS (Positioned cleanly at lower-left x=38..72, y=66..80)
    const slotW = isRevB ? 34 : 26;
    w.addRect(38 * f, 66 * f, slotW * f, 14 * f, 'CONNECTOR_CUTOUTS', ACI.MAGENTA);
    w.addText(
      isRevB ? 'J1: 34x14mm (REV B)' : 'J1: 26x14mm (REV A)',
      38 * f,
      (isRevB ? 86 : 82) * f,
      2.0 * f,
      0,
      'TEXT',
      ACI.YELLOW
    );

    // Ventilation array slots (Positioned cleanly on right side x=126..166, y=68..103)
    const slotCount = isRevB ? 5 : 4;
    for (let s = 0; s < slotCount; s++) {
      const sx = 126 + s * 9;
      w.addRect(sx * f, 68 * f, 4.5 * f, 34 * f, 'VENT_SLOTS', ACI.ORANGE);
    }

    // 5. DIMENSIONS & MULTILINGUAL CALLOUTS (Positioned above board at y=156, completely clear of Title Block!)
    w.addLine(20 * f, 156 * f, 180 * f, 156 * f, 'DIMENSIONS', ACI.YELLOW);
    w.addLine(20 * f, 151 * f, 20 * f, 160 * f, 'DIMENSIONS', ACI.YELLOW);
    w.addLine(180 * f, 151 * f, 180 * f, 160 * f, 'DIMENSIONS', ACI.YELLOW);
    w.addText('160.00 mm (基板幅 / 板宽)', 78 * f, 159 * f, 2.2 * f, 0, 'DIMENSIONS', ACI.YELLOW);
    w.addText(
      isRevB ? 'BOSS X = 104.0 mm (ECO-204)' : 'BOSS X = 84.0 mm (REV A)',
      (bossX - 12) * f,
      (isRevB ? 117 : 112.5) * f,
      2.0 * f,
      0,
      'DIMENSIONS',
      isRevB ? ACI.RED : ACI.YELLOW
    );

    return w.generateString();
  }

  const _dxfPdfCache = new Map();
  function clearDXFCaches() {
    _lastDiffCache = { pA: null, pB: null, revA: -1, revB: -1, key: '', result: null };
    _dxfPdfCache.clear();
  }
  async function dxfBytesToPDF(bytesOrText, options = {}) {
    if (bytesOrText && typeof bytesOrText !== 'string') {
      const u8 = bytesOrText instanceof Uint8Array ? bytesOrText : new Uint8Array(bytesOrText);
      if (u8.length >= 4 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) {
        return u8;
      }
    }
    const text = decodeDXFBytes(bytesOrText);
    const lw = options.lineWidth != null ? options.lineWidth : 1.0;
    let fnv = 2166136261 >>> 0;
    const step = Math.max(1, Math.floor(text.length / 4096));
    for (let i = 0; i < text.length; i += step) {
      fnv ^= text.charCodeAt(i);
      fnv = Math.imul(fnv, 16777619) >>> 0;
    }
    const sig = `${text.length}|${fnv.toString(16)}|${text.slice(0, 96)}|${text.slice(-96)}|${options.background || '#ffffff'}|${lw}|${!!options.showGrid}`;
    if (_dxfPdfCache.has(sig)) {
      return _dxfPdfCache.get(sig);
    }
    const parser = new DXFParser(text).parse();
    const pdfBytes = await parser.toVectorPDFBytes({
      background: options.background || '#ffffff',
      lineWidth: lw,
      showGrid: !!options.showGrid
    });
    if (pdfBytes && pdfBytes.length) {
      if (_dxfPdfCache.size >= 6) {
        _dxfPdfCache.delete(_dxfPdfCache.keys().next().value);
      }
      _dxfPdfCache.set(sig, pdfBytes);
    }
    return pdfBytes;
  }

  if (typeof window !== 'undefined') {
    window.dxfBytesToPDF = dxfBytesToPDF;
    window.decodeDXFBytes = decodeDXFBytes;
  }

  return {
    MULTILINGUAL_FONT_STACK,
    UNITS,
    INSUNITS_CODE_MAP,
    PRESETS,
    ACI,
    ACI_PALETTE_DARK,
    ACI_PALETTE_LIGHT,
    aciToHex,
    trueColorToHex,
    hexToTrueColor,
    hexToNearestACI,
    contrastAdjustHex,
    resolveDimensionLabel,
    extractAllDXFTextItems,
    tessellateBulgeSegment,
    tessellateBulgeArc,
    computeExactArcBBox,
    computeSplinePoints,
    wrapMTextLines,
    parseBinaryDXFPairs,
    isAutoCADFileName,
    syncEntityRenderGeometry,
    decodeDXFBytes,
    cleanDXFText,
    sanitizeAsciiDXFText,
    renderMultilingualTextSprite,
    DXFWriter,
    DXFParser,
    exportPDFToDXF,
    compareDXFEntities,
    extractEntityPrimitiveSegments,
    clipSegmentAgainstPool,
    computeSteppedDiffBoxes,
    clearDXFCaches,
    describeDXFEntity,
    computeStandaloneEntityBBox,
    getDXFEntityBBox: computeStandaloneEntityBBox,
    renderNativeDXFComparison,
    generateSampleMechanicalDXF,
    dxfBytesToPDF
  };
});
