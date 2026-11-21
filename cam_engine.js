/**
 * Kensho Pro — Industrial PCB CAM Engine (Industrial PCB CAM)
 * Supports Gerber RS-274X / RS-274D, Excellon NC Drill & Rout, IPC-D-356 / IPC-D-356A Netlists,
 * English (IPC Mils / Inches) & Metric (IPC MM / Microns) Unit Systems,
 * CAM Render Modes (Filled, Outline/Wireframe, Centerline/Skeleton, Translucent XOR),
 * Aperture (D-Code) & Drill (T-Code) Schedules, and IPC-2221 / IPC-6012 Class 1/2/3 DFM/DRC Checks.
 * Kensho Studio · textportdocx.in
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CAMEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Conversion Constants
  const MILS_TO_MM = 0.0254;
  const MM_TO_MILS = 1 / 0.0254;
  const INCH_TO_MM = 25.4;
  const MM_TO_INCH = 1 / 25.4;
  const INCH_TO_MILS = 1000;
  const MILS_TO_INCH = 0.001;
  const INCH_TO_PT = 72;
  const MM_TO_PT = 72 / 25.4;
  const MILS_TO_PT = 72 / 1000;

  /**
   * IPC English (Imperial: mils / in) & Metric (SI: mm / µm) Unit Converter
   */
  const UnitConverter = {
    toInches(val, fromUnit = 'IN') {
      const u = String(fromUnit || 'IN').toUpperCase();
      if (u === 'MM' || u === 'METRIC') return val / 25.4;
      if (u === 'MILS' || u === 'MIL' || u === 'THOU') return val / 1000;
      if (u === 'UM' || u === 'MICRON' || u === 'MICRONS') return val / 25400;
      return val; // IN / INCH
    },
    fromInches(inches, toUnit = 'MILS') {
      const u = String(toUnit || 'MILS').toUpperCase();
      if (u === 'MM' || u === 'METRIC') return inches * 25.4;
      if (u === 'MILS' || u === 'MIL' || u === 'ENGLISH') return inches * 1000;
      if (u === 'UM' || u === 'MICRON' || u === 'MICRONS') return inches * 25400;
      return inches; // IN / INCH
    },
    convert(val, fromUnit, toUnit) {
      return this.fromInches(this.toInches(val, fromUnit), toUnit);
    },
    format(inchesVal, system = 'english', precision = null) {
      const sys = String(system || 'english').toLowerCase();
      if (sys === 'metric' || sys === 'mm') {
        const mm = inchesVal * 25.4;
        const dec = precision != null ? precision : 3;
        return `${mm.toFixed(dec)} mm`;
      }
      if (sys === 'um' || sys === 'micron') {
        const um = inchesVal * 25400;
        return `${um.toFixed(1)} µm`;
      }
      if (sys === 'in' || sys === 'inch') {
        const dec = precision != null ? precision : 4;
        return `${inchesVal.toFixed(dec)} in`;
      }
      // Default IPC English = mils
      const mils = inchesVal * 1000;
      const dec = precision != null ? precision : 2;
      return `${mils.toFixed(dec)} mil`;
    },
    formatDual(inchesVal, primarySystem = 'english') {
      const mils = (inchesVal * 1000).toFixed(2);
      const mm = (inchesVal * 25.4).toFixed(3);
      return String(primarySystem).toLowerCase() === 'metric'
        ? `${mm} mm (${mils} mil)`
        : `${mils} mil (${mm} mm)`;
    }
  };

  /**
   * IPC-2221 / IPC-6012 DFM / DRC Class Presets (Values stored in mils, auto-convertible to mm)
   */
  const IPC_DFM_RULES = {
    class1: {
      id: 'class1',
      name: 'IPC Class 1 — General Electronic Products',
      minClearanceMils: 6.0,
      minTraceWidthMils: 6.0,
      minAnnularRingMils: 4.0,
      minDrillDiaMils: 12.0,
      minSolderMaskDamMils: 4.0,
      compareTolMils: 0.5
    },
    class2: {
      id: 'class2',
      name: 'IPC Class 2 — Dedicated Service / Industrial (Standard)',
      minClearanceMils: 4.0,
      minTraceWidthMils: 4.0,
      minAnnularRingMils: 3.5,
      minDrillDiaMils: 8.0,
      minSolderMaskDamMils: 3.0,
      compareTolMils: 0.25
    },
    class3: {
      id: 'class3',
      name: 'IPC Class 3 — High Reliability / Aerospace / Medical',
      minClearanceMils: 3.0,
      minTraceWidthMils: 3.0,
      minAnnularRingMils: 2.0,
      minDrillDiaMils: 6.0,
      minSolderMaskDamMils: 2.5,
      compareTolMils: 0.15
    },
    hdi: {
      id: 'hdi',
      name: 'IPC HDI — Fine-Pitch / Microvia Interconnect',
      minClearanceMils: 2.0,
      minTraceWidthMils: 2.0,
      minAnnularRingMils: 1.5,
      minDrillDiaMils: 4.0,
      minSolderMaskDamMils: 2.0,
      compareTolMils: 0.1
    }
  };

  // PCB Color Palettes (CAM & Industrial Themes)
  const PCB_THEMES = {
    standard: {
      substrate: '#0a2312', // Dark Green soldermask
      trace: '#c87533',     // Copper
      pad: '#facc15',       // Gold ENIG pads
      region: '#a35822',    // Copper pour polygon
      hole: '#050a06',      // Through-hole drill
      slot: '#020617',      // Routed slot
      silkscreen: '#f8fafc',// White silk
      netHighlight: '#38bdf8'
    },
    camDark: {
      substrate: '#06080c', // CAM classic black background
      trace: '#ef4444',     // CAM Layer 1 Red
      pad: '#22c55e',       // CAM Flash Green
      region: '#b91c1c',
      hole: '#eab308',      // CAM Drill Yellow
      slot: '#f97316',
      silkscreen: '#f8fafc',
      netHighlight: '#00ffff'
    },
    blueCAD: {
      substrate: '#08182b',
      trace: '#38bdf8',
      pad: '#f59e0b',
      region: '#0284c7',
      hole: '#020617',
      slot: '#020617',
      silkscreen: '#ffffff',
      netHighlight: '#4ade80'
    },
    matteBlack: {
      substrate: '#121214',
      trace: '#b45309',
      pad: '#fbbf24',
      region: '#92400e',
      hole: '#000000',
      slot: '#000000',
      silkscreen: '#e2e8f0',
      netHighlight: '#38bdf8'
    }
  };

  /**
   * Check whether a filename has a PCB CAM (Gerber / Excellon / IPC-D-356) extension
   * Supports 1 to 100+ layer extensions (.g1..g999, .l1..l999, .gp1..gp999, .gm1..gm99, etc.)
   */
  function isCAMFileName(filename = '') {
    const f = String(filename || '').trim().toLowerCase();
    if (!f) return false;
    return /\.(gbr|ger|art|pho|top|bot|gtl|gbl|gbs|gts|gto|gbo|gtp|gbp|gko|gpb|gpt|gm\d+|gd\d+|gg\d+|g\d+|gp\d+|l\d+|ly\d+|cmp|sol|stc|sts|plc|pls|crc|crs|drl|xln|ncd|drd|exc|tap|rou|ipc|d356|net)$/i.test(f);
  }

  const LAYER_PALETTE = [
    '#ef4444', '#3b82f6', '#a855f7', '#10b981', '#f59e0b',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
    '#14b8a6', '#eab308', '#d946ef', '#22c55e', '#38bdf8', '#fb7185'
  ];

  /**
   * Auto-detect PCB Layer Type & Stackup Index (1..100+ layers) from filename or content (CAM Layer Table style)
   */
  function detectLayerType(filename = '', content = '') {
    const rawName = String(filename || '').split(/[\\/]/).pop() || '';
    const f = rawName.toLowerCase();
    const head = String(content || '').slice(0, 4096);

    // 1. Check IPC-D-356 Netlist
    if (/\.(ipc|d356|net)$/i.test(f) || /^P\s+JOB|^P\s+UNITS|^[123]\d7\s/m.test(head)) {
      return { code: 'IPC', name: 'IPC-D-356 Netlist', category: 'netlist', side: 'both', layerIndex: 950, sortOrder: 950, pairKey: 'NETLIST_IPC', color: '#38bdf8' };
    }

    // 2. Check Excellon NC Drill / Rout
    if (/\.(drl|xln|ncd|drd|exc|tap|rou)$/i.test(f) || (/M48|T0*\d+C[0-9.]+/i.test(head) && !/%FS/i.test(head))) {
      const spanMatch = /(?:drill|drl|via)[_-]?(\d+)[_-](\d+)/i.exec(f);
      const pairKey = spanMatch ? `DRILL_${spanMatch[1]}_${spanMatch[2]}` : 'DRILL_MAIN';
      const label = spanMatch ? `NC Drill L${spanMatch[1]}-L${spanMatch[2]} (Excellon)` : 'NC Drill / Rout (Excellon)';
      return { code: 'DRL', name: label, category: 'drill', side: 'both', layerIndex: 900, sortOrder: 900, pairKey, color: '#eab308' };
    }

    // 3. Check Gerber X2 %TF.FileFunction,...*% attribute if present
    const x2Match = /%TF\.FileFunction,([^%*]+)\*%/i.exec(head);
    if (x2Match) {
      const parts = x2Match[1].split(',').map(s => s.trim());
      const fnType = (parts[0] || '').toUpperCase();
      if (fnType === 'COPPER') {
        const lMatch = /L(\d+)/i.exec(x2Match[1]);
        const lNum = lMatch ? parseInt(lMatch[1], 10) : 1;
        const pos = (parts[2] || '').toUpperCase();
        const isTop = pos === 'TOP' || lNum === 1;
        const isBot = pos === 'BOT';
        const code = isTop ? 'GTL' : (isBot ? 'GBL' : `L${lNum}`);
        return {
          code,
          name: isTop ? `Layer ${lNum} — Top Copper` : (isBot ? `Layer ${lNum} — Bottom Copper` : `Layer ${lNum} — Inner Copper`),
          category: 'copper',
          side: isTop ? 'top' : (isBot ? 'bottom' : 'inner'),
          layerIndex: lNum,
          sortOrder: isBot ? Math.max(lNum, 500) : lNum,
          pairKey: `COPPER_L${lNum}`,
          color: LAYER_PALETTE[(lNum - 1) % LAYER_PALETTE.length]
        };
      }
    }

    // 4. Soldermask, Silkscreen, Solder Paste, Board Outline (before generic L-number matching)
    if (/\.(gts|stc)$|top.*mask|f[._-]?mask/i.test(f)) {
      return { code: 'GTS', name: 'Top Soldermask', category: 'mask', side: 'top', layerIndex: 810, sortOrder: 810, pairKey: 'MASK_TOP', color: '#10b981' };
    }
    if (/\.(gbs|sts)$|bot.*mask|b[._-]?mask/i.test(f)) {
      return { code: 'GBS', name: 'Bottom Soldermask', category: 'mask', side: 'bottom', layerIndex: 811, sortOrder: 811, pairKey: 'MASK_BOT', color: '#059669' };
    }
    if (/\.(gto|plc)$|top.*silk|f[._-]?silk/i.test(f)) {
      return { code: 'GTO', name: 'Top Silkscreen (Legend)', category: 'silk', side: 'top', layerIndex: 820, sortOrder: 820, pairKey: 'SILK_TOP', color: '#f8fafc' };
    }
    if (/\.(gbo|pls)$|bot.*silk|b[._-]?silk/i.test(f)) {
      return { code: 'GBO', name: 'Bottom Silkscreen (Legend)', category: 'silk', side: 'bottom', layerIndex: 821, sortOrder: 821, pairKey: 'SILK_BOT', color: '#cbd5e1' };
    }
    if (/\.(gtp|crc)$|top.*paste|f[._-]?paste/i.test(f)) {
      return { code: 'GTP', name: 'Top Solder Paste', category: 'paste', side: 'top', layerIndex: 830, sortOrder: 830, pairKey: 'PASTE_TOP', color: '#94a3b8' };
    }
    if (/\.(gbp|crs)$|bot.*paste|b[._-]?paste/i.test(f)) {
      return { code: 'GBP', name: 'Bottom Solder Paste', category: 'paste', side: 'bottom', layerIndex: 831, sortOrder: 831, pairKey: 'PASTE_BOT', color: '#64748b' };
    }
    if (/\.gko$|\.gm\d+$|outline|edge[._-]?cuts|board|profile|mech/i.test(f)) {
      const gmMatch = /\.gm(\d+)$/i.exec(f);
      const mIdx = gmMatch ? parseInt(gmMatch[1], 10) : 1;
      return { code: 'GKO', name: gmMatch ? `Mechanical / Outline GM${mIdx}` : 'Board Outline / Mechanical', category: 'mech', side: 'both', layerIndex: 850 + mIdx, sortOrder: 850 + mIdx, pairKey: `MECH_${mIdx}`, color: '#f59e0b' };
    }

    // 5. Explicit Top / Bottom Copper
    if (/\.(gtl|cmp|top)$|top.*cop|f[._-]?cu/i.test(f)) {
      return { code: 'GTL', name: 'Layer 1 — Top Copper (Signal)', category: 'copper', side: 'top', layerIndex: 1, sortOrder: 1, pairKey: 'COPPER_TOP', color: '#ef4444' };
    }
    if (/\.(gbl|sol|bot)$|bot.*cop|b[._-]?cu/i.test(f)) {
      return { code: 'GBL', name: 'Bottom Copper (Signal)', category: 'copper', side: 'bottom', layerIndex: 500, sortOrder: 500, pairKey: 'COPPER_BOT', color: '#3b82f6' };
    }

    // 6. Multi-layer numbered Copper / Inner layers (1 to 100+ layers: .g1..g100, .gp1..gp100, .l1..l100, L1..L100, layer1..layer100, in1..in100, inner1..inner100, sig1..sig100)
    const extLayerMatch = /\.(?:g|gp|l|ly)(\d{1,3})$/i.exec(f);
    const nameLayerMatch = /(?:^|[._\-\s])(?:layer|lyr|inner|in|sig|signal|plane|gnd|pwr|cu|l)[._\-]?(\d{1,3})(?:[._\-\s]|$)/i.exec(f.replace(/\.[^.]+$/, ''));
    if (extLayerMatch || nameLayerMatch) {
      const rawNum = parseInt((extLayerMatch ? extLayerMatch[1] : nameLayerMatch[1]), 10);
      const isExtG = !!extLayerMatch && /^\.g\d+$/i.test(extLayerMatch[0]);
      // Note: .g1..g98 in standard PCB CAD packages are inner layers (Layer 2..99), while L1..L100 are direct layer numbers
      const layerNum = Math.max(1, rawNum);
      const isL1 = !isExtG && layerNum === 1 && /\bl0*1\b|layer[_-]?0*1\b/i.test(f);
      const code = isL1 ? 'GTL' : (isExtG ? 'GIN' : `L${layerNum}`);
      const dispName = isL1
        ? 'Layer 1 — Top Copper (L1)'
        : (isExtG ? `Inner Copper G${layerNum} (Layer ${layerNum + 1})` : `Layer ${layerNum} Copper (L${layerNum})`);
      const sortIdx = isExtG ? (layerNum + 1) : layerNum;
      return {
        code,
        name: dispName,
        category: 'copper',
        side: isL1 ? 'top' : 'inner',
        layerIndex: sortIdx,
        sortOrder: sortIdx,
        pairKey: isExtG ? `INNER_G${layerNum}` : `COPPER_L${layerNum}`,
        color: LAYER_PALETTE[(sortIdx - 1) % LAYER_PALETTE.length]
      };
    }

    if (/in.*cu|inner|gnd.*plane|pwr.*plane/i.test(f)) {
      return { code: 'GIN', name: 'Inner Copper / Plane', category: 'copper', side: 'inner', layerIndex: 2, sortOrder: 2, pairKey: 'COPPER_INNER', color: '#a855f7' };
    }

    const baseKey = f.replace(/\.[^.]+$/, '').replace(/(?:[_\-\s]*(?:rev|ver|v)?[_\-\s]*[ab12]|old|new|base|revised)$/i, '').trim() || 'gbr';
    return { code: 'GBR', name: `Gerber Layer (${rawName || 'Copper'})`, category: 'copper', side: 'top', layerIndex: 400, sortOrder: 400, pairKey: `GBR_${baseKey}`, color: '#c87533' };
  }

  /**
   * Gerber RS-274X / RS-274D Parser (RS-274X / IPC compatible)
   */
  /**
   * Authoritative Gerber RS-274X Arc Center & Sweep Resolver (G02/G03, G74 Single / G75 Multi).
   * Eliminates unwanted 270°-360° circles at trace bends caused by:
   *  - G74 single-quadrant ambiguous center selection (must pick candidate with directional sweep <= 90°)
   *  - Floating-point reflex wrap-around on microscopic trace-bend fillets (chord << rad with sweep ~ 360°)
   */
  function resolveGerberArc(x1, y1, x2, y2, i, j, mode, quadrant = 'MULTI') {
    const rawRad = Math.hypot(i || 0, j || 0);
    const chord = Math.hypot((x2 || 0) - (x1 || 0), (y2 || 0) - (y1 || 0));
    const ccw = (mode === 'G03');
    if (rawRad <= 1e-7) {
      return { cx: x1, cy: y1, rad: 0, a1: 0, a2: 0, sweep: 0, ccw, isFullCircle: false, isZeroLength: true, isChordFallback: true };
    }
    if (quadrant === 'SINGLE' && chord < 1e-6) {
      // Gerber RS-274X spec: in G74 single-quadrant mode, start == end is a 0° arc (never a 360° circle!)
      return { cx: x1, cy: y1, rad: rawRad, a1: 0, a2: 0, sweep: 0, ccw, isFullCircle: false, isZeroLength: true, isChordFallback: true };
    }
    let cx = x1 + (i || 0);
    let cy = y1 + (j || 0);
    const calcSweep = (cX, cY) => {
      const a1 = Math.atan2(y1 - cY, x1 - cX);
      const a2 = Math.atan2(y2 - cY, x2 - cX);
      let sw = ccw ? (a2 - a1) : (a1 - a2);
      while (sw < 0) sw += Math.PI * 2;
      while (sw >= Math.PI * 2) sw -= Math.PI * 2;
      return { a1, a2, sweep: sw };
    };
    if (quadrant === 'SINGLE') {
      const ai = Math.abs(i || 0), aj = Math.abs(j || 0);
      const cands = [
        [x1 + ai, y1 + aj],
        [x1 - ai, y1 + aj],
        [x1 + ai, y1 - aj],
        [x1 - ai, y1 - aj]
      ];
      let bestScore = Infinity;
      for (const [txC, tyC] of cands) {
        const rErr = Math.abs(Math.hypot(x2 - txC, y2 - tyC) - rawRad);
        const { sweep: sw } = calcSweep(txC, tyC);
        // Strictly penalize any reflex candidate > 90° so G74 trace bends NEVER draw a 270° unwanted circle!
        const quadPenalty = (sw <= (Math.PI * 0.5 + 1e-3)) ? 0 : (1e6 + sw);
        const score = quadPenalty + rErr;
        if (score < bestScore) {
          bestScore = score;
          cx = txC;
          cy = tyC;
        }
      }
    }
    const isFullCircle = (quadrant !== 'SINGLE') && (chord < 1e-6) && (rawRad > 1e-6);
    if (isFullCircle) {
      return { cx, cy, rad: rawRad, a1: 0, a2: Math.PI * 2, sweep: Math.PI * 2, ccw, isFullCircle: true, isZeroLength: false, isChordFallback: false };
    }
    const { a1, a2, sweep } = calcSweep(cx, cy);
    // Guard against floating-point sign flip on tiny trace-bend fillets wrapping 359.9° around a full unwanted circle
    const isReflexGlitch = (chord < rawRad * 0.08 && sweep > Math.PI * 1.92) || (quadrant === 'SINGLE' && sweep > Math.PI * 0.55);
    return { cx, cy, rad: rawRad, a1, a2, sweep: isReflexGlitch ? 0 : sweep, ccw, isFullCircle: false, isZeroLength: false, isChordFallback: isReflexGlitch };
  }

  class GerberParser {
    constructor(content, options = {}) {
      this.raw = content || '';
      this.options = options || {};
      const initUnit = options.units || options.defaultUnits || 'IN';
      this.units = String(initUnit).toUpperCase().startsWith('M') ? 'MM' : 'IN'; // 'IN' or 'MM'
      this.hasExplicitUnits = false;
      this.hasExplicitFormat = false;
      this.format = {
        zeroSuppression: options.zeroSuppression || 'L', // 'L' (Leading), 'T' (Trailing), 'D' (Direct/Decimal)
        coordType: options.coordType || 'A',             // 'A' (Absolute), 'I' (Incremental)
        xInt: options.xInt != null ? +options.xInt : (this.units === 'MM' ? 3 : 2),
        xDec: options.xDec != null ? +options.xDec : (this.units === 'MM' ? 3 : 4),
        yInt: options.yInt != null ? +options.yInt : (this.units === 'MM' ? 3 : 2),
        yDec: options.yDec != null ? +options.yDec : (this.units === 'MM' ? 3 : 4)
      };
      this.apertures = new Map(); // D-code -> { type, params, flashes, draws }
      this.macros = new Map();    // Macro name -> definition string
      this.commands = [];         // Parsed drawing commands (DRAW, FLASH, REGION)
      this.layerPolarity = 'DARK';
      this.bounds = {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
      };
    }

    _parseCoordinate(str, intDigits, decDigits, suppression) {
      if (!str) return 0;
      const isNegative = str.startsWith('-');
      const cleanStr = str.replace(/[+-]/g, '');

      if (cleanStr.includes('.') || suppression === 'D') {
        const directVal = parseFloat(str);
        return Number.isFinite(directVal) ? directVal : 0;
      }

      const totalDigits = intDigits + decDigits;
      let padded = cleanStr;

      if (suppression === 'T') {
        while (padded.length < totalDigits) {
          padded = padded + '0';
        }
        const intPart = padded.slice(0, intDigits) || '0';
        const decPart = padded.slice(intDigits) || '0';
        const val = parseFloat(`${intPart}.${decPart}`);
        return isNegative ? -val : val;
      } else {
        while (padded.length < totalDigits) {
          padded = '0' + padded;
        }
        const splitPos = Math.max(0, padded.length - decDigits);
        const intPart = padded.slice(0, splitPos) || '0';
        const decPart = padded.slice(splitPos) || '0';
        const val = parseFloat(`${intPart}.${decPart}`);
        return isNegative ? -val : val;
      }
    }

    _evalMacroExpr(exprStr, vars) {
      if (!exprStr) return 0;
      let s = String(exprStr).trim().replace(/[xX]/g, '*');
      s = s.replace(/\$(\d+)/g, (_, idx) => {
        const i = parseInt(idx, 10) - 1;
        return String((vars && i >= 0 && i < vars.length && Number.isFinite(vars[i])) ? vars[i] : 0);
      });
      if (!/^[0-9.+\-*/()\s]+$/.test(s)) {
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : 0;
      }
      try {
        const val = Function('"use strict"; return (' + s + ');')();
        return Number.isFinite(val) ? val : 0;
      } catch (e) {
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : 0;
      }
    }

    _evaluateMacro(macroBody, callParams) {
      const vars = Array.isArray(callParams) ? [...callParams] : [];
      const blocks = String(macroBody || '').split('*').map(b => b.trim()).filter(Boolean);
      const primitives = [];
      let maxW = 0, maxH = 0;
      for (let bi = 0; bi < blocks.length; bi++) {
        const blk = blocks[bi];
        if (bi === 0 && blk.toUpperCase().startsWith('AM')) {
          const firstComma = blk.indexOf(',');
          if (firstComma === -1) continue;
        }
        if (blk.startsWith('0 ')) continue; // Macro comment
        const assignMatch = /^\$(\d+)\s*=\s*(.+)$/.exec(blk);
        if (assignMatch) {
          const varIdx = parseInt(assignMatch[1], 10) - 1;
          if (varIdx >= 0 && varIdx < 64) {
            vars[varIdx] = this._evalMacroExpr(assignMatch[2], vars);
          }
          continue;
        }
        const parts = blk.split(',').map(p => p.trim());
        const primCode = parseInt(parts[0], 10);
        if (!Number.isFinite(primCode)) continue;
        const vals = parts.slice(1).map(p => this._evalMacroExpr(p, vars));
        if (primCode === 1) {
          // Circle: exposure, diameter, cx, cy[, rot]
          const exp = vals[0] !== 0;
          const dia = Math.abs(vals[1] || 0);
          const cx = vals[2] || 0, cy = vals[3] || 0;
          maxW = Math.max(maxW, Math.abs(cx) * 2 + dia);
          maxH = Math.max(maxH, Math.abs(cy) * 2 + dia);
          primitives.push({ code: 1, exposure: exp, r: dia / 2, cx, cy });
        } else if (primCode === 20 || primCode === 2) {
          // Vector Line: exposure, width, x1, y1, x2, y2, rot
          const exp = vals[0] !== 0;
          const w = Math.abs(vals[1] || 0);
          const x1 = vals[2] || 0, y1 = vals[3] || 0, x2 = vals[4] || 0, y2 = vals[5] || 0;
          const rot = (vals[6] || 0) * Math.PI / 180;
          const len = Math.hypot(x2 - x1, y2 - y1);
          maxW = Math.max(maxW, len + w);
          maxH = Math.max(maxH, len + w);
          primitives.push({ code: 20, exposure: exp, w, x1, y1, x2, y2, rot });
        } else if (primCode === 21) {
          // Center Line Rectangle: exposure, width, height, cx, cy, rot
          const exp = vals[0] !== 0;
          const w = Math.abs(vals[1] || 0), h = Math.abs(vals[2] || 0);
          const cx = vals[3] || 0, cy = vals[4] || 0, rot = (vals[5] || 0) * Math.PI / 180;
          maxW = Math.max(maxW, Math.abs(cx) * 2 + w);
          maxH = Math.max(maxH, Math.abs(cy) * 2 + h);
          primitives.push({ code: 21, exposure: exp, w, h, cx, cy, rot });
        } else if (primCode === 22) {
          // Lower-Left Rectangle: exposure, width, height, llx, lly, rot
          const exp = vals[0] !== 0;
          const w = Math.abs(vals[1] || 0), h = Math.abs(vals[2] || 0);
          const llx = vals[3] || 0, lly = vals[4] || 0, rot = (vals[5] || 0) * Math.PI / 180;
          maxW = Math.max(maxW, Math.abs(llx + w / 2) * 2 + w);
          maxH = Math.max(maxH, Math.abs(lly + h / 2) * 2 + h);
          primitives.push({ code: 21, exposure: exp, w, h, cx: llx + w / 2, cy: lly + h / 2, rot });
        } else if (primCode === 4) {
          // Outline polygon: exposure, nVertices, x0, y0, ..., xn, yn, rot
          const exp = vals[0] !== 0;
          const nPts = Math.max(0, Math.min(128, Math.floor(vals[1] || 0)));
          const pts = [];
          for (let k = 0; k <= nPts && (2 + k * 2 + 1) < vals.length; k++) {
            const px = vals[2 + k * 2] || 0, py = vals[2 + k * 2 + 1] || 0;
            pts.push({ x: px, y: py });
            maxW = Math.max(maxW, Math.abs(px) * 2);
            maxH = Math.max(maxH, Math.abs(py) * 2);
          }
          const rot = (vals[2 + (nPts + 1) * 2] || 0) * Math.PI / 180;
          if (pts.length >= 3) primitives.push({ code: 4, exposure: exp, pts, rot });
        } else if (primCode === 5) {
          // Regular polygon: exposure, nSides, cx, cy, dia, rot
          const exp = vals[0] !== 0;
          const nSides = Math.max(3, Math.floor(vals[1] || 6));
          const cx = vals[2] || 0, cy = vals[3] || 0, dia = Math.abs(vals[4] || 0);
          const rot = (vals[5] || 0) * Math.PI / 180;
          maxW = Math.max(maxW, Math.abs(cx) * 2 + dia);
          maxH = Math.max(maxH, Math.abs(cy) * 2 + dia);
          primitives.push({ code: 5, exposure: exp, nSides, cx, cy, r: dia / 2, rot });
        } else if (primCode === 7) {
          // Thermal relief: cx, cy, outerDia, innerDia, gap, rot
          const cx = vals[0] || 0, cy = vals[1] || 0, od = Math.abs(vals[2] || 0), id = Math.abs(vals[3] || 0);
          const gap = Math.abs(vals[4] || 0), rot = (vals[5] || 0) * Math.PI / 180;
          maxW = Math.max(maxW, Math.abs(cx) * 2 + od);
          maxH = Math.max(maxH, Math.abs(cy) * 2 + od);
          primitives.push({ code: 7, exposure: true, cx, cy, outerR: od / 2, innerR: id / 2, gap, rot });
        }
      }
      return { primitives, maxW, maxH };
    }

    _updateBounds(x, y, radius = 0) {
      if (!isFinite(x) || !isFinite(y)) return;
      if (x - radius < this.bounds.minX) this.bounds.minX = x - radius;
      if (x + radius > this.bounds.maxX) this.bounds.maxX = x + radius;
      if (y - radius < this.bounds.minY) this.bounds.minY = y - radius;
      if (y + radius > this.bounds.maxY) this.bounds.maxY = y + radius;
    }

    parse() {
      if (this._parsed) return this;
      const text = typeof this.raw === 'string' ? this.raw : String(this.raw || '');
      if (!this.options.allowEmpty) {
        const trimmed = text.trim();
        if (!trimmed || text.includes('\x00') || /^%PDF-|^PK\x03\x04|^\x89PNG|^AutoCAD Binary DXF/i.test(trimmed)) {
          throw new Error('Invalid or corrupt Gerber RS-274X format. Please provide a valid RS-274X or RS-274D layer.');
        }
        const hasValidTokens = /%(FS|MO|ADD|AM|LP|TF|TA|TD|IN|IP|IR|LN|SR|OF)/i.test(trimmed) ||
          /(?:G0*[01234]|G36|G37|G54|G70|G71|G74|G75|G90|G91|D0*[123]|D[1-9]\d+|[XYIJ][+-]?\d+|M0*[012])\s*\*/i.test(trimmed);
        if (!hasValidTokens) {
          throw new Error('Invalid or corrupt Gerber RS-274X format. Please provide a valid RS-274X or RS-274D layer.');
        }
      }
      let pos = 0;
      const len = text.length;
      let prevPos = -1;
      let loopGuard = 0;
      const maxLoops = Math.max(250000, len + 100);

      let currentAperture = null;
      let currentX = 0;
      let currentY = 0;
      let lastOpCode = '1';             // Modal operation code ('1'=D01 Draw, '2'=D02 Move, '3'=D03 Flash)
      let currentInterpolation = 'G01'; // G01 linear, G02 cw, G03 ccw
      let currentPolarity = 'DARK';      // DARK or CLEAR
      let loadRotationDeg = 0;          // %LR<deg>*%
      let loadScale = 1.0;              // %LS<scale>*%
      let loadMirror = 'N';             // %LMN|X|Y|XY*%
      let quadrantMode = 'MULTI';       // MULTI (G75) or SINGLE (G74)
      let inRegion = false;             // G36 / G37 polygon copper pour
      let currentRegionPts = [];
      let currentRegionContours = [];
      let activeSR = null;              // { nx, ny, dx, dy, cmds: [] }

      const emitCommand = (cmd) => {
        if (activeSR && (activeSR.nx > 1 || activeSR.ny > 1)) {
          activeSR.cmds.push(cmd);
        } else {
          this.commands.push(cmd);
        }
      };

      const closeActiveSR = () => {
        if (!activeSR) return;
        const { nx, ny, dx, dy, cmds } = activeSR;
        activeSR = null;
        if (!cmds.length) return;
        for (let iy = 0; iy < ny; iy++) {
          for (let ix = 0; ix < nx; ix++) {
            const ox = ix * dx;
            const oy = iy * dy;
            for (const c of cmds) {
              if (c.op === 'FLASH') {
                const fx = c.x + ox, fy = c.y + oy;
                const ap = c.apertureDef || { params: [0.02] };
                this._updateBounds(fx, fy, Math.max(ap.params[0] || 0.02, ap.params[1] || 0.02) / 2);
                this.commands.push({ ...c, x: fx, y: fy });
              } else if (c.op === 'DRAW') {
                const x1 = c.x1 + ox, y1 = c.y1 + oy, x2 = c.x2 + ox, y2 = c.y2 + oy;
                const ap = c.apertureDef || { params: [0.01] };
                const r = (ap.params[0] || 0.01) / 2;
                this._updateBounds(x1, y1, r);
                this._updateBounds(x2, y2, r);
                this.commands.push({ ...c, x1, y1, x2, y2 });
              } else if (c.op === 'REGION') {
                const pts = (c.points || []).map(pt => ({ x: pt.x + ox, y: pt.y + oy }));
                const contours = (c.contours || [c.points || []]).map(cnt => cnt.map(pt => ({ x: pt.x + ox, y: pt.y + oy })));
                for (const pt of pts) this._updateBounds(pt.x, pt.y, 0);
                this.commands.push({ ...c, points: pts, contours });
              }
            }
          }
        }
      };

      const flushContour = () => {
        if (currentRegionPts.length >= 3) {
          currentRegionContours.push([...currentRegionPts]);
        }
        currentRegionPts = [];
      };

      const flushRegion = () => {
        flushContour();
        if (currentRegionContours.length >= 1) {
          const primaryPts = currentRegionContours[0];
          for (const cnt of currentRegionContours) {
            for (const pt of cnt) this._updateBounds(pt.x, pt.y, 0);
          }
          emitCommand({
            op: 'REGION',
            polarity: currentPolarity,
            points: primaryPts,
            contours: [...currentRegionContours]
          });
        }
        currentRegionContours = [];
        currentRegionPts = [];
      };

      while (pos < len) {
        if (++loopGuard > maxLoops) {
          throw new Error('Corrupt Gerber coordinate stream: exceeded maximum parser iterations.');
        }
        if (pos <= prevPos) pos = prevPos + 1;
        prevPos = pos;
        while (pos < len && /\s/.test(text[pos])) pos++;
        if (pos >= len) break;

        // Extended RS-274X command enclosed in % ... %
        if (text[pos] === '%') {
          pos++;
          let endPct = text.indexOf('%', pos);
          if (endPct === -1) endPct = len;
          const extBlock = text.slice(pos, endPct);
          pos = endPct + 1;

          const extCmds = extBlock.split('*').map(s => s.trim()).filter(Boolean);
          for (const cmd of extCmds) {
            if (cmd.startsWith('FS')) {
              const m = /FS([LTD])?([AI])?.*X(\d)(\d)Y(\d)(\d)/.exec(cmd);
              if (m) {
                this.hasExplicitFormat = true;
                if (!this.options.forceFormat) {
                  if (m[1]) this.format.zeroSuppression = m[1];
                  if (m[2]) this.format.coordType = m[2];
                  this.format.xInt = parseInt(m[3], 10);
                  this.format.xDec = parseInt(m[4], 10);
                  this.format.yInt = parseInt(m[5], 10);
                  this.format.yDec = parseInt(m[6], 10);
                }
              }
            } else if (cmd.startsWith('MO')) {
              if (cmd.includes('MM') || cmd.includes('IN')) {
                this.hasExplicitUnits = true;
                if (!this.options.forceUnits) {
                  if (cmd.includes('MM')) this.units = 'MM';
                  else if (cmd.includes('IN')) this.units = 'IN';
                }
              }
            } else if (cmd.startsWith('AM')) {
              const name = cmd.slice(2).split(',')[0].trim();
              this.macros.set(name, extBlock);
              this.macros.set(name.toUpperCase(), extBlock);
            } else if (cmd.startsWith('ADD')) {
              const m = /ADD(\d+)([a-zA-Z0-9_$-]+)(?:,(.*))?/.exec(cmd);
              if (m) {
                const code = parseInt(m[1], 10);
                const rawType = m[2].trim();
                const upType = rawType.toUpperCase();
                const isStd = ['C', 'R', 'O', 'P'].includes(upType);
                let type = isStd ? upType : 'C';
                let params = m[3] ? m[3].split('X').map(parseFloat).filter(n => !isNaN(n)) : [];
                let macroPrimitives = null;
                if (!isStd) {
                  const macroBody = this.macros.get(rawType) || this.macros.get(upType) || '';
                  if (macroBody) {
                    const evalRes = this._evaluateMacro(macroBody, params);
                    if (evalRes.primitives.length) {
                      macroPrimitives = evalRes.primitives;
                    }
                    if (evalRes.maxW > 0 || evalRes.maxH > 0) {
                      params = [evalRes.maxW || evalRes.maxH, evalRes.maxH || evalRes.maxW];
                    }
                  }
                  if (/^21\s*,/m.test(macroBody) || /\*21\s*,/.test(macroBody) || /RECT|SQUARE/i.test(upType)) type = 'R';
                  else if (/OBROUND|OVAL|SLOT/i.test(upType)) type = 'O';
                  else if (/OCT|HEX|POLY/i.test(upType)) type = 'P';
                  if (!params.length && macroBody) {
                    const nums = (macroBody.match(/[0-9]*\.[0-9]+/g) || []).map(parseFloat).filter(n => n > 0 && n < 50);
                    if (nums.length) params = nums.slice(0, 2);
                  }
                }
                if (!params.length) params = [this.units === 'MM' ? 0.254 : 0.01];
                let holeDia = 0;
                let rotDeg = 0;
                if (isStd) {
                  if (upType === 'C' && params.length >= 2) holeDia = params[1] || 0;
                  else if ((upType === 'R' || upType === 'O') && params.length >= 3) holeDia = params[2] || 0;
                  else if (upType === 'P') {
                    if (params.length >= 3) rotDeg = params[2] || 0;
                    if (params.length >= 4) holeDia = params[3] || 0;
                  }
                }
                this.apertures.set(code, {
                  code,
                  type,
                  macroName: isStd ? null : rawType,
                  macroPrimitives,
                  params,
                  holeDia,
                  rotDeg,
                  flashes: 0,
                  draws: 0
                });
              }
            } else if (cmd.startsWith('LP')) {
              currentPolarity = cmd.includes('C') ? 'CLEAR' : 'DARK';
              this.layerPolarity = currentPolarity;
            } else if (cmd.startsWith('LR')) {
              const rVal = parseFloat(cmd.slice(2));
              if (Number.isFinite(rVal)) loadRotationDeg = rVal;
            } else if (cmd.startsWith('LS')) {
              const sVal = parseFloat(cmd.slice(2));
              if (Number.isFinite(sVal) && sVal > 0) loadScale = sVal;
            } else if (cmd.startsWith('LM')) {
              loadMirror = cmd.slice(2).trim().toUpperCase() || 'N';
            } else if (cmd.startsWith('SR')) {
              closeActiveSR();
              const srMatch = /SRX(\d+)Y(\d+)(?:I([+-]?[0-9.]+))?(?:J([+-]?[0-9.]+))?/i.exec(cmd);
              if (srMatch) {
                const nx = Math.max(1, parseInt(srMatch[1], 10) || 1);
                const ny = Math.max(1, parseInt(srMatch[2], 10) || 1);
                const dx = parseFloat(srMatch[3] || '0') || 0;
                const dy = parseFloat(srMatch[4] || '0') || 0;
                if (nx > 1 || ny > 1) {
                  activeSR = { nx, ny, dx, dy, cmds: [] };
                }
              }
            }
          }
          continue;
        }

        let nextStar = text.indexOf('*', pos);
        if (nextStar === -1) nextStar = len;
        const stmt = text.slice(pos, nextStar).trim();
        pos = nextStar + 1;

        if (!stmt || stmt.startsWith('G04') || /^M0?[012]\b/.test(stmt)) continue;

        // Legacy & standard G-codes for units / coordinates
        if (/\bG0*70\b/.test(stmt)) {
          this.hasExplicitUnits = true;
          if (!this.options.forceUnits) this.units = 'IN';
        } else if (/\bG0*71\b/.test(stmt)) {
          this.hasExplicitUnits = true;
          if (!this.options.forceUnits) this.units = 'MM';
        }
        if (!this.options.forceFormat) {
          if (/\bG90\b/.test(stmt)) this.format.coordType = 'A';
          else if (/\bG91\b/.test(stmt)) this.format.coordType = 'I';
        }

        // Region mode G36 / G37 (handle pure G36/G37 immediately; if combined with coordinates on the same line, process coordinates before G37 flush!)
        const hasG37 = stmt.includes('G37');
        if (stmt.includes('G36')) {
          if (inRegion) flushRegion();
          inRegion = true;
          currentRegionPts = [];
          currentRegionContours = [];
          if (stmt === 'G36') continue;
        }
        if (stmt === 'G37') {
          flushRegion();
          inRegion = false;
          continue;
        }

        // Interpolation G01 / G02 / G03
        if (/G0*1(?!\d)/.test(stmt)) currentInterpolation = 'G01';
        else if (/G0*2(?!\d)/.test(stmt)) currentInterpolation = 'G02';
        else if (/G0*3(?!\d)/.test(stmt)) currentInterpolation = 'G03';
        if (stmt.includes('G74')) quadrantMode = 'SINGLE';
        else if (stmt.includes('G75')) quadrantMode = 'MULTI';

        // D-code aperture selection (D10 - D999, including legacy G54D10* and inline G54D10X... syntax)
        const dSel = /D0*([1-9]\d+)(?!\d)/.exec(stmt);
        if (dSel && parseInt(dSel[1], 10) >= 10) {
          currentAperture = parseInt(dSel[1], 10);
          if (!this.apertures.has(currentAperture)) {
            this.apertures.set(currentAperture, {
              code: currentAperture,
              type: 'C',
              params: [this.units === 'MM' ? 0.254 : 0.01],
              flashes: 0,
              draws: 0
            });
          }
        }

        // Parse coordinates X... Y... I... J...
        let xVal = currentX;
        let yVal = currentY;
        let iVal = 0;
        let jVal = 0;
        let hasCoord = false;

        const xMatch = /X([+-]?[\d.]+)/.exec(stmt);
        if (xMatch) {
          const parsedX = this._parseCoordinate(xMatch[1], this.format.xInt, this.format.xDec, this.format.zeroSuppression);
          xVal = this.format.coordType === 'I' ? currentX + parsedX : parsedX;
          hasCoord = true;
        }
        const yMatch = /Y([+-]?[\d.]+)/.exec(stmt);
        if (yMatch) {
          const parsedY = this._parseCoordinate(yMatch[1], this.format.yInt, this.format.yDec, this.format.zeroSuppression);
          yVal = this.format.coordType === 'I' ? currentY + parsedY : parsedY;
          hasCoord = true;
        }
        const iMatch = /I([+-]?[\d.]+)/.exec(stmt);
        if (iMatch) {
          iVal = this._parseCoordinate(iMatch[1], this.format.xInt, this.format.xDec, this.format.zeroSuppression);
        }
        const jMatch = /J([+-]?[\d.]+)/.exec(stmt);
        if (jMatch) {
          jVal = this._parseCoordinate(jMatch[1], this.format.yInt, this.format.yDec, this.format.zeroSuppression);
        }

        const opMatch = /D0?([123])(?!\d)/.exec(stmt);
        if (opMatch) lastOpCode = opMatch[1];
        const opCode = opMatch ? opMatch[1] : (hasCoord ? lastOpCode : null);

        if (inRegion) {
          if (opCode === '2') {
            if (currentRegionPts.length >= 3) flushContour();
            currentRegionPts = [{ x: xVal, y: yVal }];
          } else if (opCode === '1') {
            if (!currentRegionPts.length) currentRegionPts.push({ x: currentX, y: currentY });
            if ((currentInterpolation === 'G02' || currentInterpolation === 'G03') && (iVal || jVal)) {
              const arc = resolveGerberArc(currentX, currentY, xVal, yVal, iVal, jVal, currentInterpolation, quadrantMode);
              if (!arc.isChordFallback && !arc.isZeroLength && arc.rad > 1e-6 && arc.sweep > 1e-6) {
                const steps = Math.max(8, Math.min(32, Math.ceil((arc.sweep / (Math.PI * 2)) * 32)));
                for (let s = 1; s <= steps; s++) {
                  const ang = arc.ccw ? (arc.a1 + (arc.sweep * s) / steps) : (arc.a1 - (arc.sweep * s) / steps);
                  currentRegionPts.push({ x: arc.cx + Math.cos(ang) * arc.rad, y: arc.cy + Math.sin(ang) * arc.rad });
                }
              } else {
                currentRegionPts.push({ x: xVal, y: yVal });
              }
            } else {
              currentRegionPts.push({ x: xVal, y: yVal });
            }
          }
          currentX = xVal;
          currentY = yVal;
          if (hasG37) {
            flushRegion();
            inRegion = false;
          }
          continue;
        }

        const ap = this.apertures.get(currentAperture) || { code: currentAperture || 10, type: 'C', params: [0.01], flashes: 0, draws: 0 };
        const apSize = (ap.params[0] || 0.01) * loadScale;

        if (opCode === '1') {
          this._updateBounds(xVal, yVal, apSize / 2);
          this._updateBounds(currentX, currentY, apSize / 2);
          if (ap.draws != null) ap.draws++;

          emitCommand({
            op: 'DRAW',
            mode: currentInterpolation,
            quadrant: quadrantMode,
            aperture: currentAperture,
            apertureDef: ap,
            polarity: currentPolarity,
            scale: loadScale,
            rotDeg: loadRotationDeg,
            mirror: loadMirror,
            x1: currentX,
            y1: currentY,
            x2: xVal,
            y2: yVal,
            i: iVal,
            j: jVal
          });
          currentX = xVal;
          currentY = yVal;
        } else if (opCode === '2') {
          currentX = xVal;
          currentY = yVal;
        } else if (opCode === '3') {
          this._updateBounds(xVal, yVal, (Math.max(ap.params[0] || 0.02, ap.params[1] || 0.02) * loadScale) / 2);
          if (ap.flashes != null) ap.flashes++;

          emitCommand({
            op: 'FLASH',
            aperture: currentAperture,
            apertureDef: ap,
            polarity: currentPolarity,
            scale: loadScale,
            rotDeg: loadRotationDeg,
            mirror: loadMirror,
            x: xVal,
            y: yVal
          });
          currentX = xVal;
          currentY = yVal;
        }
      }

      if (inRegion) flushRegion();
      closeActiveSR();

      if (!isFinite(this.bounds.minX)) {
        this.bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
      }
      this._parsed = true;
      this.raw = '';
      return this;
    }

    toInches(val) {
      return this.units === 'MM' ? val / 25.4 : val;
    }

    toMils(val) {
      return this.toInches(val) * 1000;
    }

    toMM(val) {
      return this.units === 'MM' ? val : val * 25.4;
    }

    /**
     * Returns PCB CAM Aperture Table (D-Codes) with both English (mils/in) and Metric (mm) dimensions
     */
    getApertureTable() {
      const rows = [];
      for (const [code, ap] of this.apertures.entries()) {
        const p0In = this.toInches(ap.params[0] || 0);
        const p1In = ap.params[1] != null ? this.toInches(ap.params[1]) : p0In;
        const shapeNames = { C: 'Circle', R: 'Rectangle', O: 'Obround', P: 'Polygon' };
        rows.push({
          dCode: `D${code}`,
          code,
          type: ap.type,
          shape: ap.macroName ? `Macro (${ap.macroName})` : (shapeNames[ap.type] || ap.type),
          widthMils: +(p0In * 1000).toFixed(2),
          heightMils: +(p1In * 1000).toFixed(2),
          widthIn: +p0In.toFixed(4),
          heightIn: +p1In.toFixed(4),
          widthMM: +(p0In * 25.4).toFixed(3),
          heightMM: +(p1In * 25.4).toFixed(3),
          flashes: ap.flashes || 0,
          draws: ap.draws || 0
        });
      }
      return rows.sort((a, b) => a.code - b.code);
    }
  }

  /**
   * Excellon NC Drill & Rout Parser (RS-274X / IPC compatible)
   */
  class ExcellonParser {
    constructor(content, options = {}) {
      this.raw = content || '';
      this.options = options || {};
      const initUnit = options.units || options.defaultUnits || 'INCH';
      this.units = String(initUnit).toUpperCase().startsWith('M') ? 'METRIC' : 'INCH';
      this.hasExplicitUnits = false;
      this.hasExplicitFormat = false;
      this.zeroSuppression = options.zeroSuppression || 'L'; // 'L' or 'T'
      this.intDigits = options.intDigits != null ? +options.intDigits : null;
      this.decDigits = options.decDigits != null ? +options.decDigits : null;
      this.tools = new Map(); // Tool ID -> diameter
      this.toolMeta = new Map(); // Tool ID -> { diameter, plated, hits, slots }
      this.hits = [];  // List of { tool, diameter, x, y }
      this.slots = []; // List of { tool, diameter, x1, y1, x2, y2 }
      this.bounds = {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
      };
    }

    _parseExcellonNumber(str, isMetric) {
      if (!str) return 0;
      if (str.includes('.') || this.zeroSuppression === 'D') {
        const dv = parseFloat(str);
        return Number.isFinite(dv) ? dv : 0;
      }
      const isNeg = str.startsWith('-');
      const clean = str.replace(/[+-]/g, '');
      const intD = this.intDigits != null ? this.intDigits : (this.options.intDigits || (isMetric ? 3 : 2));
      const decD = this.decDigits != null ? this.decDigits : (this.options.decDigits || (isMetric ? 3 : 4));
      const total = intD + decD;
      let padded = clean;
      if (this.zeroSuppression === 'T') {
        while (padded.length < total) padded += '0';
        const intPart = padded.slice(0, intD) || '0';
        const decPart = padded.slice(intD) || '0';
        const val = parseFloat(`${intPart}.${decPart}`);
        return isNeg ? -val : val;
      } else {
        while (padded.length < total) padded = '0' + padded;
        const splitPos = Math.max(0, padded.length - decD);
        const val = parseFloat(`${padded.slice(0, splitPos) || '0'}.${padded.slice(splitPos) || '0'}`);
        return isNeg ? -val : val;
      }
    }

    parse() {
      if (this._parsed) return this;
      const lines = this.raw.split(/\r?\n/);
      let currentTool = null;
      let isMetric = this.units === 'METRIC';
      let isIncremental = this.options.coordType === 'I';
      let lastX = 0;
      let lastY = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Parse format hints in comments like ;FILE_FORMAT=2:4 or ;FORMAT={2:4/ absolute / metric / suppress leading zeros}
        if (trimmed.startsWith(';')) {
          const fmtMatch = /(?:FILE_FORMAT|FORMAT)\s*[=:]?\s*\{?\s*(\d+)\s*:\s*(\d+)/i.exec(trimmed);
          if (fmtMatch) {
            this.hasExplicitFormat = true;
            if (!this.options.forceFormat) {
              this.intDigits = parseInt(fmtMatch[1], 10);
              this.decDigits = parseInt(fmtMatch[2], 10);
            }
          }
          continue;
        }

        if (trimmed === 'M48' || trimmed === '%' || trimmed === 'M95' || trimmed === 'M30' || trimmed === 'M00') {
          continue;
        }

        // Units & Zero Suppression header (e.g. INCH,LZ | METRIC,TZ | M71 | M72)
        if (/\bINCH\b|^M72\b/i.test(trimmed)) {
          this.hasExplicitUnits = true;
          if (!this.options.forceUnits) {
            this.units = 'INCH';
            isMetric = false;
          }
          if (!this.options.forceFormat) {
            if (trimmed.includes('TZ')) this.zeroSuppression = 'T';
            else if (trimmed.includes('LZ')) this.zeroSuppression = 'L';
            const fZeros = /(0+)\.(0+)/.exec(trimmed);
            if (fZeros) { this.intDigits = fZeros[1].length; this.decDigits = fZeros[2].length; this.hasExplicitFormat = true; }
          }
        } else if (/\bMETRIC\b|^M71\b/i.test(trimmed)) {
          this.hasExplicitUnits = true;
          if (!this.options.forceUnits) {
            this.units = 'METRIC';
            isMetric = true;
          }
          if (!this.options.forceFormat) {
            if (trimmed.includes('TZ')) this.zeroSuppression = 'T';
            else if (trimmed.includes('LZ')) this.zeroSuppression = 'L';
            const fZeros = /(0+)\.(0+)/.exec(trimmed);
            if (fZeros) { this.intDigits = fZeros[1].length; this.decDigits = fZeros[2].length; this.hasExplicitFormat = true; }
          }
        }
        if (!this.options.forceFormat) {
          if (/^ICI\s*,\s*ON/i.test(trimmed) || trimmed === 'G91') { isIncremental = true; continue; }
          if (/^ICI\s*,\s*OFF/i.test(trimmed) || trimmed === 'G90') { isIncremental = false; continue; }
        }

        // Tool Definition: T01C0.032 or T01F00S00C0.032 (auto-normalize mils if > 2.0 in INCH mode)
        const tDef = /^T0*(\d+)(?:F[\d.]+)?(?:S[\d.]+)?C([0-9.]+)/i.exec(trimmed);
        if (tDef) {
          const tId = parseInt(tDef[1], 10);
          let dia = parseFloat(tDef[2]);
          if (!isMetric && dia >= 2.0) dia = dia / 1000;
          else if (isMetric && dia >= 100.0) dia = dia / 1000;
          this.tools.set(tId, dia);
          this.toolMeta.set(tId, { id: tId, diameter: dia, hits: 0, slots: 0 });
          continue;
        }

        // Tool Selection: T01 or T1 (standalone or inline prefix)
        const tSel = /^T0*(\d+)(?![0-9]*C)/i.exec(trimmed);
        if (tSel) {
          currentTool = parseInt(tSel[1], 10);
          if (!this.tools.has(currentTool)) {
            const defDia = isMetric ? 0.8 : 0.032;
            this.tools.set(currentTool, defDia);
            this.toolMeta.set(currentTool, { id: currentTool, diameter: defDia, hits: 0, slots: 0 });
          }
          if (/^T0*\d+$/i.test(trimmed)) continue;
        }

        // Routed Slot: X...Y...G85X...Y...
        if (trimmed.includes('G85')) {
          const parts = trimmed.split('G85');
          const m1X = /X([+-]?[0-9.]+)/.exec(parts[0]);
          const m1Y = /Y([+-]?[0-9.]+)/.exec(parts[0]);
          const m2X = /X([+-]?[0-9.]+)/.exec(parts[1]);
          const m2Y = /Y([+-]?[0-9.]+)/.exec(parts[1]);
          const x1 = m1X ? this._parseExcellonNumber(m1X[1], isMetric) : lastX;
          const y1 = m1Y ? this._parseExcellonNumber(m1Y[1], isMetric) : lastY;
          const x2 = m2X ? this._parseExcellonNumber(m2X[1], isMetric) : x1;
          const y2 = m2Y ? this._parseExcellonNumber(m2Y[1], isMetric) : y1;
          const dia = this.tools.get(currentTool) || (isMetric ? 0.8 : 0.032);
          const rad = dia / 2;

          this.bounds.minX = Math.min(this.bounds.minX, x1 - rad, x2 - rad);
          this.bounds.maxX = Math.max(this.bounds.maxX, x1 + rad, x2 + rad);
          this.bounds.minY = Math.min(this.bounds.minY, y1 - rad, y2 - rad);
          this.bounds.maxY = Math.max(this.bounds.maxY, y1 + rad, y2 + rad);

          this.slots.push({ tool: currentTool, diameter: dia, x1, y1, x2, y2 });
          const meta = this.toolMeta.get(currentTool);
          if (meta) meta.slots++;
          lastX = x2;
          lastY = y2;
          continue;
        }

        // Standard Drill Hit: X...Y... (including optional leading G00/G01/G05 or Txx)
        if (/^(?:T0*\d+|G0*[015])?\s*[XY][+-]?[0-9.]+/i.test(trimmed)) {
          const xMatch = /X([+-]?[0-9.]+)/.exec(trimmed);
          const yMatch = /Y([+-]?[0-9.]+)/.exec(trimmed);
          const parsedX = xMatch ? this._parseExcellonNumber(xMatch[1], isMetric) : 0;
          const parsedY = yMatch ? this._parseExcellonNumber(yMatch[1], isMetric) : 0;
          const x = xMatch ? (isIncremental ? lastX + parsedX : parsedX) : lastX;
          const y = yMatch ? (isIncremental ? lastY + parsedY : parsedY) : lastY;
          lastX = x;
          lastY = y;

          const dia = this.tools.get(currentTool) || (isMetric ? 0.8 : 0.032);
          const rad = dia / 2;

          if (x - rad < this.bounds.minX) this.bounds.minX = x - rad;
          if (x + rad > this.bounds.maxX) this.bounds.maxX = x + rad;
          if (y - rad < this.bounds.minY) this.bounds.minY = y - rad;
          if (y + rad > this.bounds.maxY) this.bounds.maxY = y + rad;

          this.hits.push({
            tool: currentTool,
            diameter: dia,
            x,
            y
          });
          const meta = this.toolMeta.get(currentTool);
          if (meta) meta.hits++;
        }
      }

      if (!isFinite(this.bounds.minX)) {
        this.bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
      }
      this._parsed = true;
      this.raw = '';
      return this;
    }

    toInches(val) {
      return this.units === 'METRIC' ? val / 25.4 : val;
    }

    /**
     * Returns PCB CAM NC Drill Tool Table (T-Codes) with English (mils/in) & Metric (mm)
     */
    getToolTable() {
      const rows = [];
      for (const [id, dia] of this.tools.entries()) {
        const diaIn = this.toInches(dia);
        const hitsForTool = this.hits.filter(h => h.tool === id);
        let travelIn = 0;
        for (let i = 1; i < hitsForTool.length; i++) {
          const dx = this.toInches(hitsForTool[i].x - hitsForTool[i - 1].x);
          const dy = this.toInches(hitsForTool[i].y - hitsForTool[i - 1].y);
          travelIn += Math.hypot(dx, dy);
        }
        const meta = this.toolMeta.get(id) || { hits: hitsForTool.length, slots: 0 };
        rows.push({
          tCode: `T${String(id).padStart(2, '0')}`,
          id,
          diaMils: +(diaIn * 1000).toFixed(2),
          diaIn: +diaIn.toFixed(4),
          diaMM: +(diaIn * 25.4).toFixed(3),
          hits: meta.hits,
          slots: meta.slots,
          travelIn: +travelIn.toFixed(2),
          travelMM: +(travelIn * 25.4).toFixed(1)
        });
      }
      return rows.sort((a, b) => a.id - b.id);
    }
  }

  /**
   * IPC-D-356 / IPC-D-356A Bare-Board Test Netlist Parser & Comparator
   * Supports CUST 0 (English Mils), CUST 1 (Metric MM), CUST 2 (English Inches)
   */
  class IPCD356Parser {
    constructor(content, options = {}) {
      this.raw = content || '';
      this.options = options || {};
      this.units = 'MILS'; // 'MILS', 'MM', or 'IN'
      this.custCode = 0;   // 0 = English (mils), 1 = Metric (mm), 2 = English (inches)
      this.records = [];   // List of { type, net, refDes, pin, midPoint, holeDiaIn, plated, access, xIn, yIn, rectWIn, rectHIn }
      this.nets = new Map(); // netName -> array of records
      this.bounds = {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
      };
    }

    parse() {
      if (this._parsed) return this;
      const lines = this.raw.split(/\r?\n/);

      for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        if (!line || line.startsWith('C ') || line.startsWith('999')) continue;

        // Parameter Header (e.g. "P  UNITS CUST 0" or "P  UNITS CUST 1")
        if (line.startsWith('P ')) {
          if (/UNITS\s+CUST\s*1|UNITS\s+MM|METRIC/i.test(line)) {
            this.custCode = 1;
            this.units = 'MM';
          } else if (/UNITS\s+CUST\s*2|UNITS\s+IN/i.test(line)) {
            this.custCode = 2;
            this.units = 'IN';
          } else if (/UNITS\s+CUST\s*0|UNITS\s+MIL|ENGLISH/i.test(line)) {
            this.custCode = 0;
            this.units = 'MILS';
          }
          continue;
        }

        if (this.options.forceUnits) {
          this.units = String(this.options.forceUnits).toUpperCase();
        }

        // Test Record: starts with 3-digit operation code (317 = thru-hole, 327 = SMT, 307 = blind/buried, 367 = tooling)
        const opMatch = /^([0-9]{3})\s/.exec(line);
        if (!opMatch) continue;

        const opCode = opMatch[1];
        const netName = (line.slice(3, 17).trim()) || 'N/C';
        const compField = line.slice(20, 32).trim();
        let refDes = compField, pin = '';
        if (compField.includes('-')) {
          const [r, p] = compField.split('-');
          refDes = r.trim();
          pin = (p || '').trim();
        }
        const midPoint = line[31] === 'M';

        // Extract fields from remainder of record (columns 32+)
        const tail = line.slice(32);
        const holeMatch = /([DU])(\d+)/.exec(tail);
        const accessMatch = /A(\d\d)/.exec(tail);
        const coordMatch = /X([+-]?\d+)Y([+-]?\d+)/.exec(tail);

        // IPC-D-356 coordinate scaling:
        // CUST 0 (Mils): X/Y coords are in 0.1 mil (1/10000 inch), hole/pad sizes in 0.1 mil or 1 mil
        // CUST 1 (Metric): X/Y coords are in microns (0.001 mm), hole/pad sizes in microns (0.001 mm)
        const toInchesCoord = rawNum => {
          const v = parseFloat(rawNum);
          if (String(rawNum).includes('.')) {
            return this.units === 'MM' ? v / 25.4 : (this.units === 'MILS' ? v / 1000 : v);
          }
          if (this.units === 'MM') {
            // Standard IPC-D-356 Metric: integer in microns (0.001 mm)
            return (v / 1000) / 25.4;
          }
          // Standard IPC-D-356 English (CUST 0): integer in 0.1 mils (0.0001 inch)
          return v / 10000;
        };

        let xIn = 0, yIn = 0;
        if (coordMatch) {
          xIn = toInchesCoord(coordMatch[1]);
          yIn = toInchesCoord(coordMatch[2]);
        }

        let holeDiaIn = 0;
        let plated = true;
        if (holeMatch) {
          plated = holeMatch[1] === 'D';
          holeDiaIn = toInchesCoord(holeMatch[2]);
        }

        let rectWIn = 0.04, rectHIn = 0.04;
        const rectMatches = [...tail.matchAll(/X(\d+)Y(\d+)/g)];
        if (rectMatches.length >= 1) {
          const rm = rectMatches[rectMatches.length - 1];
          if (!coordMatch || rm.index !== coordMatch.index) {
            rectWIn = toInchesCoord(rm[1]);
            rectHIn = toInchesCoord(rm[2]);
          }
        }

        const padRad = Math.max(holeDiaIn, rectWIn, rectHIn, 0.02) / 2;
        if (xIn - padRad < this.bounds.minX) this.bounds.minX = xIn - padRad;
        if (xIn + padRad > this.bounds.maxX) this.bounds.maxX = xIn + padRad;
        if (yIn - padRad < this.bounds.minY) this.bounds.minY = yIn - padRad;
        if (yIn + padRad > this.bounds.maxY) this.bounds.maxY = yIn + padRad;

        const rec = {
          opCode,
          type: opCode === '317' ? 'THRU' : (opCode === '327' ? 'SMT' : (opCode === '307' ? 'VIA' : 'TOOL')),
          net: netName,
          refDes,
          pin,
          midPoint,
          plated,
          holeDiaIn,
          access: accessMatch ? `A${accessMatch[1]}` : 'A00',
          xIn,
          yIn,
          rectWIn,
          rectHIn
        };
        this.records.push(rec);
        if (!this.nets.has(netName)) this.nets.set(netName, []);
        this.nets.get(netName).push(rec);
      }

      if (!isFinite(this.bounds.minX)) {
        this.bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
      }
      this._parsed = true;
      this.raw = '';
      return this;
    }

    getNetTable() {
      const rows = [];
      for (const [net, recs] of this.nets.entries()) {
        const smtCount = recs.filter(r => r.type === 'SMT').length;
        const thruCount = recs.filter(r => r.type === 'THRU').length;
        const viaCount = recs.filter(r => r.midPoint || r.type === 'VIA').length;
        rows.push({
          net,
          totalNodes: recs.length,
          pins: recs.filter(r => r.refDes && r.refDes !== 'VIA').map(r => r.pin ? `${r.refDes}-${r.pin}` : r.refDes).join(', '),
          smtCount,
          thruCount,
          viaCount
        });
      }
      return rows.sort((a, b) => b.totalNodes - a.totalNodes || a.net.localeCompare(b.net));
    }

    static compareNetlists(ipcA, ipcB, toleranceMils = 2.0) {
      const tolIn = toleranceMils / 1000;
      const diffs = [];
      const allNets = new Set([...ipcA.nets.keys(), ...ipcB.nets.keys()]);

      for (const net of allNets) {
        const recsA = ipcA.nets.get(net) || [];
        const recsB = ipcB.nets.get(net) || [];
        if (!recsA.length) {
          diffs.push({ type: 'ADDED_NET', net, countB: recsB.length, xIn: recsB[0].xIn, yIn: recsB[0].yIn, desc: `Net "${net}" added in Rev B (${recsB.length} nodes)` });
          continue;
        }
        if (!recsB.length) {
          diffs.push({ type: 'REMOVED_NET', net, countA: recsA.length, xIn: recsA[0].xIn, yIn: recsA[0].yIn, desc: `Net "${net}" removed in Rev B (had ${recsA.length} nodes)` });
          continue;
        }

        // Check for missing or added testpoints/pins within the net
        for (const rA of recsA) {
          const matchB = recsB.find(rB => Math.hypot(rA.xIn - rB.xIn, rA.yIn - rB.yIn) <= tolIn);
          if (!matchB) {
            const movedPin = rA.refDes && rA.pin ? recsB.find(rB => rB.refDes === rA.refDes && rB.pin === rA.pin) : null;
            if (movedPin) {
              const distMils = Math.hypot(movedPin.xIn - rA.xIn, movedPin.yIn - rA.yIn) * 1000;
              diffs.push({
                type: 'MOVED_NODE',
                net,
                node: `${rA.refDes}-${rA.pin}`,
                xIn: movedPin.xIn,
                yIn: movedPin.yIn,
                deltaMils: +distMils.toFixed(2),
                desc: `Net "${net}" pin ${rA.refDes}-${rA.pin} moved by ${distMils.toFixed(1)} mil (${(distMils * 0.0254).toFixed(3)} mm)`
              });
            } else {
              diffs.push({
                type: 'REMOVED_NODE',
                net,
                node: rA.refDes ? `${rA.refDes}-${rA.pin}` : 'Testpoint',
                xIn: rA.xIn,
                yIn: rA.yIn,
                desc: `Net "${net}" node ${rA.refDes ? rA.refDes + '-' + rA.pin : ''} missing at (${(rA.xIn * 1000).toFixed(1)}, ${(rA.yIn * 1000).toFixed(1)}) mil`
              });
            }
          }
        }

        for (const rB of recsB) {
          const matchA = recsA.find(rA => Math.hypot(rA.xIn - rB.xIn, rA.yIn - rB.yIn) <= tolIn);
          if (!matchA) {
            const wasMoved = rB.refDes && rB.pin && recsA.some(rA => rA.refDes === rB.refDes && rA.pin === rB.pin);
            if (!wasMoved) {
              diffs.push({
                type: 'ADDED_NODE',
                net,
                node: rB.refDes ? `${rB.refDes}-${rB.pin}` : 'Testpoint',
                xIn: rB.xIn,
                yIn: rB.yIn,
                desc: `Net "${net}" added node ${rB.refDes ? rB.refDes + '-' + rB.pin : ''} at (${(rB.xIn * 1000).toFixed(1)}, ${(rB.yIn * 1000).toFixed(1)}) mil`
              });
            }
          }
        }
      }

      // Check for Net Shorts (same physical coordinate assigned to different nets in A vs B)
      for (const rB of ipcB.records) {
        if (rB.net === 'N/C') continue;
        const conflictA = ipcA.records.find(rA => rA.net !== 'N/C' && rA.net !== rB.net && Math.hypot(rA.xIn - rB.xIn, rA.yIn - rB.yIn) <= tolIn);
        if (conflictA) {
          diffs.push({
            type: 'NET_CHANGE',
            net: rB.net,
            xIn: rB.xIn,
            yIn: rB.yIn,
            desc: `Net reassignment / potential short at (${(rB.xIn * 1000).toFixed(1)}, ${(rB.yIn * 1000).toFixed(1)}) mil: "${conflictA.net}" → "${rB.net}"`
          });
        }
      }

      return diffs;
    }
  }

  /**
   * PCBRenderer: Renders Gerber RS-274X layers, Excellon Drill/Slot files, and IPC-D-356 Netlists
   * Supports CAM Render Modes: 'fill' (Solid), 'outline' (Wireframe), 'skeleton' (Centerline)
   */
  class PCBRenderer {
    constructor(canvas, theme = 'standard') {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { willReadFrequently: true });
      this.theme = PCB_THEMES[theme] || PCB_THEMES.standard;
      this.lastTransform = null;
    }

    render(gerberParsed, drillParsed = null, options = {}) {
      const ctx = this.ctx;
      const cv = this.canvas;
      const renderMode = options.renderMode || 'fill'; // 'fill' | 'outline' | 'skeleton'
      const mirrorX = !!options.mirrorX;
      const invertPolarity = !!options.invertPolarity;
      const ipcParsed = options.ipcParsed || null;
      const highlightNet = options.highlightNet || null;

      // Normalize bounds into Gerber's native units (or Inches if forced)
      let minX = gerberParsed && isFinite(gerberParsed.bounds.minX) ? gerberParsed.bounds.minX : Infinity;
      let maxX = gerberParsed && isFinite(gerberParsed.bounds.maxX) ? gerberParsed.bounds.maxX : -Infinity;
      let minY = gerberParsed && isFinite(gerberParsed.bounds.minY) ? gerberParsed.bounds.minY : Infinity;
      let maxY = gerberParsed && isFinite(gerberParsed.bounds.maxY) ? gerberParsed.bounds.maxY : -Infinity;

      const gUnit = (gerberParsed && gerberParsed.units) || 'IN';
      const toGerberUnits = (valInInches) => (gUnit === 'MM' ? valInInches * 25.4 : valInInches);

      if (options.sharedBoundsInches) {
        minX = toGerberUnits(options.sharedBoundsInches.minX);
        maxX = toGerberUnits(options.sharedBoundsInches.maxX);
        minY = toGerberUnits(options.sharedBoundsInches.minY);
        maxY = toGerberUnits(options.sharedBoundsInches.maxY);
      } else {
        if (drillParsed && isFinite(drillParsed.bounds.minX)) {
          const dScale = (drillParsed.units === 'METRIC' ? (gUnit === 'MM' ? 1.0 : 1 / 25.4) : (gUnit === 'MM' ? 25.4 : 1.0));
          minX = Math.min(minX, drillParsed.bounds.minX * dScale);
          maxX = Math.max(maxX, drillParsed.bounds.maxX * dScale);
          minY = Math.min(minY, drillParsed.bounds.minY * dScale);
          maxY = Math.max(maxY, drillParsed.bounds.maxY * dScale);
        }
        if (ipcParsed && isFinite(ipcParsed.bounds.minX)) {
          minX = Math.min(minX, toGerberUnits(ipcParsed.bounds.minX));
          maxX = Math.max(maxX, toGerberUnits(ipcParsed.bounds.maxX));
          minY = Math.min(minY, toGerberUnits(ipcParsed.bounds.minY));
          maxY = Math.max(maxY, toGerberUnits(ipcParsed.bounds.maxY));
        }
      }

      if (!isFinite(minX)) {
        minX = 0; maxX = 1; minY = 0; maxY = 1;
      }

      const bw = maxX - minX || 1.0;
      const bh = maxY - minY || 1.0;

      const padding = options.padding != null ? options.padding : 30;
      const targetW = cv.width - padding * 2;
      const targetH = cv.height - padding * 2;

      const scale = Math.min(targetW / bw, targetH / bh);
      const offsetX = padding + (targetW - bw * scale) / 2;
      const offsetY = padding + (targetH - bh * scale) / 2;

      const tx = x => {
        const normX = mirrorX ? (maxX - (x - minX)) : x;
        return offsetX + (normX - minX) * scale;
      };
      const ty = y => cv.height - (offsetY + (y - minY) * scale);

      this.lastTransform = { minX, maxX, minY, maxY, scale, offsetX, offsetY, gUnit, mirrorX, tx, ty };

      // Background substrate
      if (!options.transparentBg) {
        ctx.fillStyle = invertPolarity ? this.theme.trace : this.theme.substrate;
        ctx.fillRect(0, 0, cv.width, cv.height);
      }

      // Optional CAM Origin Crosshair & Board Extents Box
      if (options.showOrigin) {
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(tx(minX), ty(maxY), bw * scale, bh * scale);
        ctx.restore();
      }

      // Draw Gerber Regions, Traces, Arcs, and Flashes
      if (gerberParsed && gerberParsed.commands) {
        for (const cmd of gerberParsed.commands) {
          const isClear = (cmd.polarity === 'CLEAR') !== invertPolarity;
          const traceColor = isClear ? this.theme.substrate : (options.overrideColor || this.theme.trace);
          const padColor = isClear ? this.theme.substrate : (options.overrideColor || this.theme.pad);
          const regionColor = isClear ? this.theme.substrate : (options.overrideColor || this.theme.region || this.theme.trace);

          if (cmd.op === 'REGION' && cmd.points && cmd.points.length >= 3) {
            ctx.save();
            ctx.beginPath();
            const contours = (Array.isArray(cmd.contours) && cmd.contours.length) ? cmd.contours : [cmd.points];
            for (const cnt of contours) {
              if (!cnt || cnt.length < 3) continue;
              ctx.moveTo(tx(cnt[0].x), ty(cnt[0].y));
              for (let i = 1; i < cnt.length; i++) {
                ctx.lineTo(tx(cnt[i].x), ty(cnt[i].y));
              }
              ctx.closePath();
            }
            if (renderMode === 'outline' || renderMode === 'skeleton') {
              ctx.strokeStyle = regionColor;
              ctx.lineWidth = 1.5;
              ctx.stroke();
            } else {
              ctx.fillStyle = regionColor;
              ctx.fill('evenodd');
            }
            ctx.restore();
          } else if (cmd.op === 'DRAW') {
            const ap = cmd.apertureDef;
            const hasP0 = ap && Array.isArray(ap.params) && ap.params[0] != null;
            const rawDia = hasP0
              ? ((ap.type === 'R' && ap.params[1] != null) ? Math.min(ap.params[0], ap.params[1]) : ap.params[0])
              : (gUnit === 'MM' ? 0.10 : 0.004);
            const effDia = rawDia > 0 ? rawDia : (gUnit === 'MM' ? 0.0635 : 0.0025);
            const fullWidth = Math.max(0.65, effDia * scale);

            ctx.save();
            ctx.strokeStyle = traceColor;
            ctx.lineCap = (ap && ap.type === 'R') ? 'butt' : 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = renderMode === 'skeleton' ? 0.8 : (renderMode === 'outline' ? 1.0 : fullWidth);

            ctx.beginPath();
            if ((cmd.mode === 'G02' || cmd.mode === 'G03') && (cmd.i || cmd.j)) {
              const arc = resolveGerberArc(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.i, cmd.j, cmd.mode, cmd.quadrant);
              const rad = arc.rad * scale;
              if (arc.isFullCircle) {
                ctx.arc(tx(arc.cx), ty(arc.cy), Math.max(1, rad), 0, Math.PI * 2);
              } else if (arc.isChordFallback || arc.isZeroLength || rad < 0.25) {
                ctx.moveTo(tx(cmd.x1), ty(cmd.y1));
                ctx.lineTo(tx(cmd.x2), ty(cmd.y2));
              } else {
                const startAng = Math.atan2(ty(cmd.y1) - ty(arc.cy), tx(cmd.x1) - tx(arc.cx));
                const endAng = Math.atan2(ty(cmd.y2) - ty(arc.cy), tx(cmd.x2) - tx(arc.cx));
                const anticlockwise = (cmd.mode === 'G03') !== mirrorX;
                ctx.arc(tx(arc.cx), ty(arc.cy), Math.max(1, rad), startAng, endAng, anticlockwise);
              }
            } else {
              ctx.moveTo(tx(cmd.x1), ty(cmd.y1));
              ctx.lineTo(tx(cmd.x2), ty(cmd.y2));
            }
            ctx.stroke();
            ctx.restore();
          } else if (cmd.op === 'FLASH') {
            const ap = cmd.apertureDef;
            const p = (ap && ap.params) ? ap.params : [0.05, 0.05];

            ctx.save();
            ctx.fillStyle = padColor;
            ctx.strokeStyle = padColor;
            ctx.lineWidth = 1.5;

            const drawOrFill = () => {
              if (renderMode === 'outline') ctx.stroke();
              else if (renderMode === 'skeleton') {
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(tx(cmd.x) - 3, ty(cmd.y));
                ctx.lineTo(tx(cmd.x) + 3, ty(cmd.y));
                ctx.moveTo(tx(cmd.x), ty(cmd.y) - 3);
                ctx.lineTo(tx(cmd.x), ty(cmd.y) + 3);
                ctx.stroke();
              } else {
                ctx.fill();
              }
            };

            const flashRotDeg = (((cmd.rotDeg || 0) + ((ap && ap.rotDeg) || 0)) % 360 + 360) % 360;
            const cxPx = tx(cmd.x), cyPx = ty(cmd.y);
            if (!ap || ap.type === 'C') {
              const rad = Math.max(1.5, (p[0] / 2) * scale);
              ctx.beginPath();
              ctx.arc(cxPx, cyPx, rad, 0, Math.PI * 2);
              drawOrFill();
            } else if (ap.type === 'R') {
              const w = Math.max(2, p[0] * scale);
              const h = Math.max(2, (p[1] != null ? p[1] : p[0]) * scale);
              if (Math.abs(flashRotDeg) > 1e-2) {
                ctx.translate(cxPx, cyPx);
                ctx.rotate(-(flashRotDeg * Math.PI) / 180 * (mirrorX ? -1 : 1));
                ctx.beginPath();
                ctx.rect(-w / 2, -h / 2, w, h);
              } else {
                ctx.beginPath();
                ctx.rect(cxPx - w / 2, cyPx - h / 2, w, h);
              }
              drawOrFill();
            } else if (ap.type === 'O') {
              const w = Math.max(2, p[0] * scale);
              const h = Math.max(2, (p[1] != null ? p[1] : p[0]) * scale);
              const r = Math.min(w, h) / 2;
              if (Math.abs(flashRotDeg) > 1e-2) {
                ctx.translate(cxPx, cyPx);
                ctx.rotate(-(flashRotDeg * Math.PI) / 180 * (mirrorX ? -1 : 1));
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, r);
                else ctx.rect(-w / 2, -h / 2, w, h);
              } else {
                ctx.beginPath();
                if (ctx.roundRect) {
                  ctx.roundRect(cxPx - w / 2, cyPx - h / 2, w, h, r);
                } else {
                  ctx.rect(cxPx - w / 2, cyPx - h / 2, w, h);
                }
              }
              drawOrFill();
            } else if (ap.type === 'P') {
              const rad = Math.max(1.5, (p[0] / 2) * scale);
              const nSides = parseInt(p[1], 10) || 6;
              const rotRad = (flashRotDeg * Math.PI) / 180 * (mirrorX ? -1 : 1);
              ctx.beginPath();
              for (let s = 0; s < nSides; s++) {
                const ang = (s * 2 * Math.PI) / nSides - rotRad;
                const px = cxPx + rad * Math.cos(ang);
                const py = cyPx + rad * Math.sin(ang);
                if (s === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
              }
              ctx.closePath();
              drawOrFill();
            }
            ctx.restore();
          }
        }
      }

      // Draw Excellon Drill Holes & Routed Slots
      if (drillParsed) {
        const dScale = (drillParsed.units === 'METRIC' ? (gUnit === 'MM' ? 1.0 : 1 / 25.4) : (gUnit === 'MM' ? 25.4 : 1.0));
        ctx.save();

        // Routed Slots
        if (drillParsed.slots && drillParsed.slots.length) {
          for (const slot of drillParsed.slots) {
            const x1 = tx(slot.x1 * dScale), y1 = ty(slot.y1 * dScale);
            const x2 = tx(slot.x2 * dScale), y2 = ty(slot.y2 * dScale);
            const w = Math.max(2, slot.diameter * dScale * scale);
            ctx.strokeStyle = renderMode === 'fill' ? (this.theme.slot || this.theme.hole) : '#eab308';
            ctx.lineWidth = renderMode === 'skeleton' ? 1.5 : w;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
        }

        // Drill Hits
        if (drillParsed.hits && drillParsed.hits.length) {
          for (const hit of drillParsed.hits) {
            const x = tx(hit.x * dScale);
            const y = ty(hit.y * dScale);
            const rad = Math.max(1.5, (hit.diameter / 2) * dScale * scale);

            ctx.beginPath();
            ctx.arc(x, y, rad, 0, Math.PI * 2);
            if (renderMode === 'outline' || renderMode === 'skeleton') {
              ctx.strokeStyle = '#eab308';
              ctx.lineWidth = 1.5;
              ctx.stroke();
              // CAM Drill Target X Cross
              ctx.beginPath();
              ctx.moveTo(x - rad * 0.7, y - rad * 0.7);
              ctx.lineTo(x + rad * 0.7, y + rad * 0.7);
              ctx.moveTo(x + rad * 0.7, y - rad * 0.7);
              ctx.lineTo(x - rad * 0.7, y + rad * 0.7);
              ctx.stroke();
            } else {
              ctx.fillStyle = this.theme.hole;
              ctx.fill();
              if (options.showDrillRings) {
                ctx.strokeStyle = 'rgba(234, 179, 8, 0.75)';
                ctx.lineWidth = 1;
                ctx.stroke();
              }
            }
          }
        }
        ctx.restore();
      }

      // Draw IPC-D-356 Netlist Testpoints & Highlighted Net
      if (ipcParsed && ipcParsed.records && ipcParsed.records.length) {
        ctx.save();
        for (const rec of ipcParsed.records) {
          const isHighlighted = highlightNet && rec.net === highlightNet;
          const x = tx(toGerberUnits(rec.xIn));
          const y = ty(toGerberUnits(rec.yIn));
          const rad = Math.max(3, (toGerberUnits(Math.max(rec.holeDiaIn, rec.rectWIn, 0.025)) / 2) * scale);

          if (isHighlighted || !gerberParsed || !gerberParsed.commands.length) {
            ctx.strokeStyle = isHighlighted ? '#38bdf8' : 'rgba(56, 189, 248, 0.75)';
            ctx.fillStyle = isHighlighted ? 'rgba(56, 189, 248, 0.35)' : 'rgba(56, 189, 248, 0.15)';
            ctx.lineWidth = isHighlighted ? 2.5 : 1.2;
            ctx.beginPath();
            ctx.arc(x, y, rad, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            if (isHighlighted || options.showNetLabels) {
              ctx.fillStyle = '#f8fafc';
              ctx.font = 'bold 10px Consolas, monospace';
              ctx.fillText(`${rec.net}${rec.refDes ? ' (' + rec.refDes + '-' + rec.pin + ')' : ''}`, x + rad + 3, y + 3);
            }
          }
        }
        ctx.restore();
      }
    }
  }

  /**
   * CAMCompare: Performs PCB CAM Gerber vs. Gerber, Drill vs. Drill, and IPC Class 1/2/3 DFM/DRC checking.
   * Automatically reconciles English (IN/MILS) vs Metric (MM) layers into a shared physical coordinate frame!
   */
  /* ============================================================================
   * [MODULE SECTION: PCB CAM GRAPHICAL & VECTOR PRIMITIVE COMPARATOR]
   * WHAT THIS IS: Compares Rev A vs Rev B Gerber RS-274X, Excellon Drill, and
   *   IPC-D-356 layers, running IPC-2221 DFM clearance checks and generating
   *   stepped 5-10 mil `subBoxes` along differing traces and pads.
   * WHY / HOW TO EDIT: Edit `comparePrimitives()` for vector tolerance rules or
   *   `compare()` to customize raster copper/clearance classification.
   * ============================================================================ */
  class CAMCompare {
    constructor(width = 1200, height = 900) {
      this.width = width;
      this.height = height;
    }

    /**
     * Run geometric IPC-2221 / IPC-6012 DFM checks on a parsed Gerber + Drill pair
     * Accelerated with 2D Spatial Grid Hashing (O(N) lookup instead of O(N*M) quadratic scans)
     */
    runDFMChecks(gerberParsed, drillParsed = null, rules = IPC_DFM_RULES.class2) {
      const violations = [];
      if (!gerberParsed) return violations;
      const MAX_VIOLATIONS = 250;

      const minTraceMils = rules.minTraceWidthMils || 4.0;
      const minRingMils = rules.minAnnularRingMils || 3.5;
      const minDrillMils = rules.minDrillDiaMils || 8.0;
      const minClrMils = rules.minClearanceMils || 4.0;

      // Pre-classify flashes and draws in physical inches + build spatial hash grid for flashes
      const CELL_IN = 0.10; // 100 mil spatial grid cell
      const flashGrid = new Map();
      const allFlashes = [];
      const allDraws = [];
      const g01Draws = [];

      for (const cmd of gerberParsed.commands) {
        if (cmd.op === 'DRAW') {
          if (cmd.mode === 'G01') g01Draws.push(cmd);
          if (cmd.polarity !== 'CLEAR') {
            const ap = cmd.apertureDef;
            const diaMils = gerberParsed.toMils((ap && ap.params && ap.params[0]) || 0.01);
            if (diaMils < minTraceMils - 0.05 && violations.length < MAX_VIOLATIONS) {
              violations.push({
                category: 'MIN_TRACE_WIDTH',
                severity: 'Warning',
                measuredMils: +diaMils.toFixed(2),
                ruleMils: minTraceMils,
                xIn: gerberParsed.toInches((cmd.x1 + cmd.x2) / 2),
                yIn: gerberParsed.toInches((cmd.y1 + cmd.y2) / 2),
                description: `Trace width ${diaMils.toFixed(2)} mil (${(diaMils * 0.0254).toFixed(3)} mm) < ${minTraceMils.toFixed(1)} mil minimum (D${cmd.aperture || 10})`
              });
            }
            allDraws.push(cmd);
          }
        } else if (cmd.op === 'FLASH' && cmd.polarity !== 'CLEAR') {
          const fx = gerberParsed.toInches(cmd.x);
          const fy = gerberParsed.toInches(cmd.y);
          const ap = cmd.apertureDef;
          const p0 = (ap && ap.params && ap.params[0]) || 0.05;
          const p1 = (ap && ap.params && ap.params[1] != null) ? ap.params[1] : p0;
          const padMinIn = gerberParsed.toInches(Math.min(p0, p1));
          const padMaxMils = gerberParsed.toMils(Math.max(p0, p1));
          const fItem = { cmd, fx, fy, padMinIn, pdHalfMils: padMaxMils / 2 };
          allFlashes.push(fItem);
          const gx = Math.floor(fx / CELL_IN), gy = Math.floor(fy / CELL_IN);
          const key = `${gx},${gy}`;
          let bucket = flashGrid.get(key);
          if (!bucket) { bucket = []; flashGrid.set(key, bucket); }
          bucket.push(fItem);
        }
      }

      // 2. Check Acute Angle Acid Traps (< 75 degrees between any connected trace segments via vertex spatial hash)
      const vtxMap = new Map();
      const vQuant = v => Math.round(gerberParsed.toInches(v) * 2000); // 0.5 mil vertex snap
      for (let i = 0; i < g01Draws.length; i++) {
        const s = g01Draws[i];
        if (s.polarity === 'CLEAR') continue;
        const k1 = `${vQuant(s.x1)},${vQuant(s.y1)}`;
        const k2 = `${vQuant(s.x2)},${vQuant(s.y2)}`;
        if (k1 === k2) continue;
        if (!vtxMap.has(k1)) vtxMap.set(k1, []);
        if (!vtxMap.has(k2)) vtxMap.set(k2, []);
        vtxMap.get(k1).push({ idx: i, vx: s.x1, vy: s.y1, ox: s.x2, oy: s.y2 });
        vtxMap.get(k2).push({ idx: i, vx: s.x2, vy: s.y2, ox: s.x1, oy: s.y1 });
      }
      const seenAcidVtx = new Set();
      for (const [vKey, list] of vtxMap.entries()) {
        if (violations.length >= MAX_VIOLATIONS) break;
        if (list.length < 2 || list.length > 8) continue;
        for (let a = 0; a < list.length; a++) {
          for (let b = a + 1; b < list.length; b++) {
            const e1 = list[a], e2 = list[b];
            const v1x = e1.ox - e1.vx, v1y = e1.oy - e1.vy;
            const v2x = e2.ox - e2.vx, v2y = e2.oy - e2.vy;
            const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
            if (l1 > 1e-5 && l2 > 1e-5) {
              const cosAng = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
              const angDeg = Math.acos(cosAng) * 180 / Math.PI;
              if (angDeg > 5 && angDeg < 75 && !seenAcidVtx.has(vKey)) {
                seenAcidVtx.add(vKey);
                violations.push({
                  category: 'ACID_TRAP',
                  severity: 'Warning',
                  measuredDeg: +angDeg.toFixed(1),
                  xIn: gerberParsed.toInches(e1.vx),
                  yIn: gerberParsed.toInches(e1.vy),
                  description: `Acute trace corner (${angDeg.toFixed(1)}° < 75°) creates copper acid trap risk`
                });
              }
            }
          }
        }
      }

      // 3. Check Drill-to-Pad Annular Ring & Minimum Drill Size & Coincident Drill Hits (Spatial Grid Accelerated)
      if (drillParsed && drillParsed.hits && drillParsed.hits.length) {
        const DRILL_CELL_IN = 0.05;
        const drillGrid = new Map();
        for (let idx = 0; idx < drillParsed.hits.length; idx++) {
          if (violations.length >= MAX_VIOLATIONS) break;
          const hit = drillParsed.hits[idx];
          const hxIn = drillParsed.toInches(hit.x);
          const hyIn = drillParsed.toInches(hit.y);
          const hDiaMils = drillParsed.toInches(hit.diameter) * 1000;

          if (hDiaMils < minDrillMils - 0.05) {
            violations.push({
              category: 'MIN_DRILL_SIZE',
              severity: 'Warning',
              measuredMils: +hDiaMils.toFixed(2),
              ruleMils: minDrillMils,
              xIn: hxIn,
              yIn: hyIn,
              description: `Drill hole T${hit.tool} (${hDiaMils.toFixed(1)} mil / ${(hDiaMils * 0.0254).toFixed(3)} mm) < ${minDrillMils.toFixed(1)} mil minimum`
            });
          }

          // Coincident drill check via 3x3 neighbor cells
          const dgx = Math.floor(hxIn / DRILL_CELL_IN), dgy = Math.floor(hyIn / DRILL_CELL_IN);
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const db = drillGrid.get(`${dgx + ox},${dgy + oy}`);
              if (!db) continue;
              for (const h2 of db) {
                const distMils = Math.hypot(hxIn - h2.hxIn, hyIn - h2.hyIn) * 1000;
                if (distMils < 1.0) {
                  violations.push({
                    category: 'COINCIDENT_DRILL',
                    severity: 'Error',
                    measuredMils: +distMils.toFixed(2),
                    xIn: hxIn,
                    yIn: hyIn,
                    description: `Coincident/overlapping drill hits (T${hit.tool} & T${h2.tool}) at (${(hxIn * 1000).toFixed(1)}, ${(hyIn * 1000).toFixed(1)}) mil`
                  });
                }
              }
            }
          }
          const dKey = `${dgx},${dgy}`;
          let dBucket = drillGrid.get(dKey);
          if (!dBucket) { dBucket = []; drillGrid.set(dKey, dBucket); }
          dBucket.push({ tool: hit.tool, hxIn, hyIn });

          // Find closest enclosing flash pad via 3x3 flashGrid cells
          let bestPad = null;
          let bestDistIn = Infinity;
          const fgx = Math.floor(hxIn / CELL_IN), fgy = Math.floor(hyIn / CELL_IN);
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const fb = flashGrid.get(`${fgx + ox},${fgy + oy}`);
              if (!fb) continue;
              for (const fl of fb) {
                const distIn = Math.hypot(hxIn - fl.fx, hyIn - fl.fy);
                if (distIn < fl.padMinIn / 2 && distIn < bestDistIn) {
                  bestDistIn = distIn;
                  bestPad = { padSizeIn: fl.padMinIn, distIn };
                }
              }
            }
          }
          if (bestPad) {
            const annularRingMils = ((bestPad.padSizeIn / 2) - (hDiaMils / 2000) - bestPad.distIn) * 1000;
            if (annularRingMils < minRingMils - 0.05) {
              violations.push({
                category: 'ANNULAR_RING',
                severity: annularRingMils < 0 ? 'Error' : 'Warning',
                measuredMils: +annularRingMils.toFixed(2),
                ruleMils: minRingMils,
                xIn: hxIn,
                yIn: hyIn,
                description: `${annularRingMils < 0 ? 'Pad breakout!' : 'Narrow annular ring:'} ${annularRingMils.toFixed(2)} mil (${(annularRingMils * 0.0254).toFixed(3)} mm) < ${minRingMils.toFixed(1)} mil rule`
              });
            }
          }
        }
      }

      // 4. Check Trace-to-Pad Minimum Copper Clearance (Spatial Grid Accelerated)
      if (allFlashes.length > 0 && allDraws.length > 0) {
        const seenClrPairs = new Set();
        for (let dIdx = 0; dIdx < allDraws.length; dIdx++) {
          if (violations.length >= MAX_VIOLATIONS) break;
          const dCmd = allDraws[dIdx];
          const x1 = gerberParsed.toInches(dCmd.x1), y1 = gerberParsed.toInches(dCmd.y1);
          const x2 = gerberParsed.toInches(dCmd.x2), y2 = gerberParsed.toInches(dCmd.y2);
          const trAp = dCmd.apertureDef;
          const trRadMils = gerberParsed.toMils((trAp && trAp.params && trAp.params[0]) || 0.008) / 2;
          const minGx = Math.floor((Math.min(x1, x2) - CELL_IN) / CELL_IN);
          const maxGx = Math.floor((Math.max(x1, x2) + CELL_IN) / CELL_IN);
          const minGy = Math.floor((Math.min(y1, y2) - CELL_IN) / CELL_IN);
          const maxGy = Math.floor((Math.max(y1, y2) + CELL_IN) / CELL_IN);
          const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;

          for (let gy = minGy; gy <= maxGy; gy++) {
            for (let gx = minGx; gx <= maxGx; gx++) {
              const fb = flashGrid.get(`${gx},${gy}`);
              if (!fb) continue;
              for (const fItem of fb) {
                const fx = fItem.fx, fy = fItem.fy, pdHalfMils = fItem.pdHalfMils;
                const dEnd1 = Math.hypot(x1 - fx, y1 - fy) * 1000;
                const dEnd2 = Math.hypot(x2 - fx, y2 - fy) * 1000;
                if (dEnd1 <= pdHalfMils + 0.5 || dEnd2 <= pdHalfMils + 0.5) continue;

                const t = l2 > 0 ? Math.max(0, Math.min(1, ((fx - x1) * dx + (fy - y1) * dy) / l2)) : 0;
                const cx = x1 + t * dx, cy = y1 + t * dy;
                const centerDistMils = Math.hypot(fx - cx, fy - cy) * 1000;
                const edgeToCenterMils = centerDistMils - pdHalfMils;
                if (edgeToCenterMils > minClrMils + trRadMils + 2) continue;
                const edgeToEdgeMils = Math.max(0.1, edgeToCenterMils - trRadMils);
                const effectiveClrMils = edgeToCenterMils > 0 ? Math.min(edgeToCenterMils, edgeToEdgeMils + trRadMils) : edgeToEdgeMils;
                if (effectiveClrMils > 0 && effectiveClrMils < minClrMils - 0.05) {
                  const pairKey = `${dIdx}:${Math.round(fx * 1000)},${Math.round(fy * 1000)}`;
                  if (seenClrPairs.has(pairKey)) continue;
                  seenClrPairs.add(pairKey);
                  violations.push({
                    category: "TRACE_TO_PAD_CLEARANCE",
                    severity: "Error",
                    measuredMils: +effectiveClrMils.toFixed(2),
                    ruleMils: minClrMils,
                    xIn: cx,
                    yIn: cy,
                    description: `Trace-to-pad clearance ${effectiveClrMils.toFixed(2)} mil (${(effectiveClrMils * 0.0254).toFixed(3)} mm) < ${minClrMils.toFixed(1)} mil minimum`
                  });
                }
              }
            }
          }
        }
      }

      // 5. Check Trace-to-Trace Minimum Copper Clearance (Spatial Grid Accelerated for non-connected segments)
      if (g01Draws.length > 1 && violations.length < MAX_VIOLATIONS) {
        const segGrid = new Map();
        const SEG_CELL = 0.08;
        const segList = [];
        for (let i = 0; i < Math.min(g01Draws.length, 3000); i++) {
          const s = g01Draws[i];
          if (s.polarity === 'CLEAR') continue;
          const x1 = gerberParsed.toInches(s.x1), y1 = gerberParsed.toInches(s.y1);
          const x2 = gerberParsed.toInches(s.x2), y2 = gerberParsed.toInches(s.y2);
          if (Math.hypot(x2 - x1, y2 - y1) < 1e-5) continue;
          const ap = s.apertureDef;
          const radMils = gerberParsed.toMils((ap && ap.params && ap.params[0]) || 0.008) / 2;
          const item = { idx: i, x1, y1, x2, y2, radMils };
          segList.push(item);
          const gx0 = Math.floor(Math.min(x1, x2) / SEG_CELL), gx1 = Math.floor(Math.max(x1, x2) / SEG_CELL);
          const gy0 = Math.floor(Math.min(y1, y2) / SEG_CELL), gy1 = Math.floor(Math.max(y1, y2) / SEG_CELL);
          for (let gy = gy0; gy <= gy1; gy++) {
            for (let gx = gx0; gx <= gx1; gx++) {
              const k = `${gx},${gy}`;
              let b = segGrid.get(k);
              if (!b) { b = []; segGrid.set(k, b); }
              b.push(item);
            }
          }
        }
        const ptSegDistIn = (px, py, ax, ay, bx, by) => {
          const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
          const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
          return { dIn: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), cx: ax + t * dx, cy: ay + t * dy };
        };
        const seenSegPairs = new Set();
        for (let i = 0; i < segList.length; i++) {
          if (violations.length >= MAX_VIOLATIONS) break;
          const sA = segList[i];
          const gx0 = Math.floor((Math.min(sA.x1, sA.x2) - 0.02) / SEG_CELL), gx1 = Math.floor((Math.max(sA.x1, sA.x2) + 0.02) / SEG_CELL);
          const gy0 = Math.floor((Math.min(sA.y1, sA.y2) - 0.02) / SEG_CELL), gy1 = Math.floor((Math.max(sA.y1, sA.y2) + 0.02) / SEG_CELL);
          for (let gy = gy0; gy <= gy1; gy++) {
            for (let gx = gx0; gx <= gx1; gx++) {
              const bucket = segGrid.get(`${gx},${gy}`);
              if (!bucket) continue;
              for (const sB of bucket) {
                if (sB.idx <= sA.idx) continue;
                const pk = `${sA.idx}:${sB.idx}`;
                if (seenSegPairs.has(pk)) continue;
                seenSegPairs.add(pk);
                // Skip segments that share an endpoint (connected on same net)
                if (Math.hypot(sA.x1 - sB.x1, sA.y1 - sB.y1) < 0.001 ||
                    Math.hypot(sA.x1 - sB.x2, sA.y1 - sB.y2) < 0.001 ||
                    Math.hypot(sA.x2 - sB.x1, sA.y2 - sB.y1) < 0.001 ||
                    Math.hypot(sA.x2 - sB.x2, sA.y2 - sB.y2) < 0.001) continue;
                const c1 = ptSegDistIn(sA.x1, sA.y1, sB.x1, sB.y1, sB.x2, sB.y2);
                const c2 = ptSegDistIn(sA.x2, sA.y2, sB.x1, sB.y1, sB.x2, sB.y2);
                const c3 = ptSegDistIn(sB.x1, sB.y1, sA.x1, sA.y1, sA.x2, sA.y2);
                const c4 = ptSegDistIn(sB.x2, sB.y2, sA.x1, sA.y1, sA.x2, sA.y2);
                let best = c1;
                if (c2.dIn < best.dIn) best = c2;
                if (c3.dIn < best.dIn) best = c3;
                if (c4.dIn < best.dIn) best = c4;
                const edgeClrMils = (best.dIn * 1000) - sA.radMils - sB.radMils;
                if (edgeClrMils > 0.05 && edgeClrMils < minClrMils - 0.05) {
                  violations.push({
                    category: 'TRACE_TO_TRACE_CLEARANCE',
                    severity: 'Error',
                    measuredMils: +edgeClrMils.toFixed(2),
                    ruleMils: minClrMils,
                    xIn: best.cx,
                    yIn: best.cy,
                    description: `Trace-to-trace clearance ${edgeClrMils.toFixed(2)} mil (${(edgeClrMils * 0.0254).toFixed(3)} mm) < ${minClrMils.toFixed(1)} mil minimum`
                  });
                }
              }
            }
          }
        }
      }

      return violations;
    }

    /**
     * Compare primitive features (Traces, Pads, Regions, Drill Hits/Slots, Netlist Nodes) in physical Inches
     * Works in both Browser and Node.js without requiring DOM Canvas!
     */
    comparePrimitives(camA, camB, options = {}) {
      const tolMils = options.compareTolMils != null ? +options.compareTolMils : 0.25;
      const tolIn = Math.max(0.00005, tolMils / 1000);
      const quant = v => Math.round(v / tolIn);

      const offXIn = (options.offsetBInches && options.offsetBInches.dxIn) || 0;
      const offYIn = (options.offsetBInches && options.offsetBInches.dyIn) || 0;
      const pushSig = (map, key, item) => {
        let list = map.get(key);
        if (!list) { list = []; map.set(key, list); }
        list.push(item);
      };

      const extractSigs = (gbr, drl, ipc, dxIn = 0, dyIn = 0) => {
        const map = new Map();
        if (gbr && Array.isArray(gbr.commands)) {
          for (const c of gbr.commands) {
            if (c.op === 'FLASH') {
              const xIn = gbr.toInches(c.x) + dxIn, yIn = gbr.toInches(c.y) + dyIn;
              const ap = c.apertureDef || { type: 'C', params: [0.01] };
              const sMul = c.scale || 1;
              let wIn = gbr.toInches((ap.params[0] || 0.01) * sMul);
              let hIn = gbr.toInches((ap.params[1] != null ? ap.params[1] : (ap.params[0] || 0.01)) * sMul);
              const holeIn = ap.holeDia ? gbr.toInches(ap.holeDia * sMul) : 0;
              const shape = ap.type || 'C';
              let rotDeg = (((c.rotDeg || 0) + (ap.rotDeg || 0)) % 360 + 360) % 360;
              if (shape === 'C' && !ap.macroName) {
                rotDeg = 0;
                hIn = wIn;
              } else if ((shape === 'R' || shape === 'O') && !ap.macroName) {
                rotDeg = ((rotDeg % 180) + 180) % 180;
                if (Math.abs(rotDeg - 180) < 0.5) rotDeg = 0;
                if (Math.abs(rotDeg - 90) < 0.5) {
                  const tmp = wIn; wIn = hIn; hIn = tmp;
                  rotDeg = 0;
                } else if (Math.abs(wIn - hIn) <= tolIn && Math.abs(rotDeg - 90) < 0.5) {
                  rotDeg = 0;
                }
              }
              const rotRad = (rotDeg * Math.PI) / 180;
              const absCos = Math.abs(Math.cos(rotRad)), absSin = Math.abs(Math.sin(rotRad));
              const bboxW = shape === 'C' ? wIn : (wIn * absCos + hIn * absSin);
              const bboxH = shape === 'C' ? hIn : (wIn * absSin + hIn * absCos);
              const macroTag = ap.macroName ? `|M:${ap.macroName}` : '';
              const rotTag = Math.abs(rotDeg) > 1e-2 ? `|R:${Math.round(rotDeg * 10)}` : '';
              const holeTag = holeIn > 0 ? `|H:${quant(holeIn)}` : '';
              const mirTag = c.mirror && c.mirror !== 'N' ? `|MR:${c.mirror}` : '';
              const key = `F|${shape}|${quant(xIn)}|${quant(yIn)}|${quant(wIn)}|${quant(hIn)}|${c.polarity}${macroTag}${rotTag}${holeTag}${mirTag}`;
              pushSig(map, key, {
                kind: 'FLASH',
                shape,
                macroName: ap.macroName || '',
                polarity: c.polarity || 'DARK',
                rotDeg,
                wIn,
                hIn,
                holeIn,
                xIn,
                yIn,
                minXIn: xIn - bboxW / 2,
                maxXIn: xIn + bboxW / 2,
                minYIn: yIn - bboxH / 2,
                maxYIn: yIn + bboxH / 2,
                rIn: Math.max(bboxW, bboxH) / 2
              });
            } else if (c.op === 'DRAW') {
              const x1In = gbr.toInches(c.x1) + dxIn, y1In = gbr.toInches(c.y1) + dyIn;
              const x2In = gbr.toInches(c.x2) + dxIn, y2In = gbr.toInches(c.y2) + dyIn;
              const ap = c.apertureDef || { type: 'C', params: [0.01] };
              const sMul = c.scale || 1;
              const wIn = gbr.toInches((ap.params[0] || 0.01) * sMul);
              const iIn = (c.mode === 'G02' || c.mode === 'G03') ? gbr.toInches(c.i || 0) : 0;
              const jIn = (c.mode === 'G02' || c.mode === 'G03') ? gbr.toInches(c.j || 0) : 0;
              const isArc = (c.mode === 'G02' || c.mode === 'G03') && (Math.abs(iIn) > 1e-7 || Math.abs(jIn) > 1e-7);
              let cxIn = (x1In + x2In) / 2, cyIn = (y1In + y2In) / 2;
              let arcRIn = 0;
              let minXIn = Math.min(x1In, x2In) - wIn / 2;
              let maxXIn = Math.max(x1In, x2In) + wIn / 2;
              let minYIn = Math.min(y1In, y2In) - wIn / 2;
              let maxYIn = Math.max(y1In, y2In) + wIn / 2;
              let rIn = Math.hypot(x2In - x1In, y2In - y1In) / 2 + wIn / 2;
              if (isArc) {
                const arc = resolveGerberArc(x1In, y1In, x2In, y2In, iIn, jIn, c.mode, c.quadrant);
                arcRIn = arc.isChordFallback ? 0 : arc.rad;
                cxIn = arc.cx;
                cyIn = arc.cy;
                if (arc.isFullCircle) {
                  minXIn = cxIn - arcRIn - wIn / 2;
                  maxXIn = cxIn + arcRIn + wIn / 2;
                  minYIn = cyIn - arcRIn - wIn / 2;
                  maxYIn = cyIn + arcRIn + wIn / 2;
                } else if (!arc.isChordFallback && arc.sweep > 1e-6) {
                  const inSweep = ang => {
                    let d = arc.ccw ? (ang - arc.a1) : (arc.a1 - ang);
                    while (d < 0) d += Math.PI * 2;
                    while (d >= Math.PI * 2) d -= Math.PI * 2;
                    return d <= arc.sweep + 1e-5;
                  };
                  if (inSweep(0)) maxXIn = Math.max(maxXIn, cxIn + arcRIn + wIn / 2);
                  if (inSweep(Math.PI / 2)) maxYIn = Math.max(maxYIn, cyIn + arcRIn + wIn / 2);
                  if (inSweep(Math.PI)) minXIn = Math.min(minXIn, cxIn - arcRIn - wIn / 2);
                  if (inSweep(-Math.PI / 2)) minYIn = Math.min(minYIn, cyIn - arcRIn - wIn / 2);
                }
                rIn = Math.max(arcRIn + wIn / 2, Math.hypot(maxXIn - minXIn, maxYIn - minYIn) / 2);
              }
              // Order endpoints canonically for linear G01 draws so reversed trace direction matches
              const p1 = `${quant(x1In)},${quant(y1In)}`, p2 = `${quant(x2In)},${quant(y2In)}`;
              const pair = (!isArc && p1 > p2) ? `${p2}:${p1}` : `${p1}:${p2}`;
              const arcTag = isArc ? `|${quant(cxIn)},${quant(cyIn)}|${quant(arcRIn)}|${c.quadrant || ''}` : '';
              const key = `D|${c.mode || 'G01'}|${pair}|${quant(wIn)}|${c.polarity}${arcTag}`;
              pushSig(map, key, {
                kind: 'DRAW',
                mode: c.mode || 'G01',
                quadrant: c.quadrant || 'MULTI',
                polarity: c.polarity || 'DARK',
                x1In,
                y1In,
                x2In,
                y2In,
                iIn,
                jIn,
                cxIn,
                cyIn,
                arcRIn,
                wIn,
                xIn: (minXIn + maxXIn) / 2,
                yIn: (minYIn + maxYIn) / 2,
                minXIn,
                maxXIn,
                minYIn,
                maxYIn,
                rIn
              });
            } else if (c.op === 'REGION' && Array.isArray(c.points) && c.points.length >= 3) {
              const contours = (Array.isArray(c.contours) && c.contours.length) ? c.contours : [c.points];
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              const cSigs = [];
              const normContours = [];
              const dedupTol = Math.max(1e-5, tolIn * 0.5);
              for (const cnt of contours) {
                if (!cnt || !cnt.length) continue;
                const nPts = [];
                for (const pt of cnt) {
                  const px = gbr.toInches(pt.x) + dxIn;
                  const py = gbr.toInches(pt.y) + dyIn;
                  if (px < minX) minX = px; if (px > maxX) maxX = px;
                  if (py < minY) minY = py; if (py > maxY) maxY = py;
                  if (!nPts.length || Math.hypot(px - nPts[nPts.length - 1][0], py - nPts[nPts.length - 1][1]) > dedupTol) {
                    nPts.push([px, py]);
                  }
                }
                while (nPts.length > 2 && Math.hypot(nPts[0][0] - nPts[nPts.length - 1][0], nPts[0][1] - nPts[nPts.length - 1][1]) <= dedupTol) {
                  nPts.pop();
                }
                if (nPts.length < 3) continue;
                normContours.push(nPts);
                const pSigs = nPts.map(p => `${quant(p[0])},${quant(p[1])}`);
                // Canonicalize cyclic rotation & winding direction for hash key
                const buildMinRotation = arr => {
                  let best = null;
                  for (let shift = 0; shift < arr.length; shift++) {
                    const rot = arr.slice(shift).concat(arr.slice(0, shift)).join(';');
                    if (best === null || rot < best) best = rot;
                  }
                  return best || '';
                };
                const fwdMin = buildMinRotation(pSigs);
                const revMin = buildMinRotation([...pSigs].reverse());
                cSigs.push(fwdMin <= revMin ? fwdMin : revMin);
              }
              if (!normContours.length) continue;
              cSigs.sort();
              const cx = isFinite(minX) ? (minX + maxX) * 0.5 : 0;
              const cy = isFinite(minY) ? (minY + maxY) * 0.5 : 0;
              const rIn = isFinite(minX) ? Math.max(0.008, Math.hypot(maxX - minX, maxY - minY) * 0.5) : 0.05;
              const key = `R|${c.polarity}|${cSigs.join('/')}`;
              pushSig(map, key, {
                kind: 'REGION',
                polarity: c.polarity || 'DARK',
                contours: normContours,
                xIn: cx,
                yIn: cy,
                minXIn: isFinite(minX) ? minX : cx - 0.02,
                maxXIn: isFinite(maxX) ? maxX : cx + 0.02,
                minYIn: isFinite(minY) ? minY : cy - 0.02,
                maxYIn: isFinite(maxY) ? maxY : cy + 0.02,
                rIn
              });
            }
          }
        }
        if (drl) {
          if (Array.isArray(drl.hits)) {
            for (const h of drl.hits) {
              const xIn = drl.toInches(h.x) + dxIn, yIn = drl.toInches(h.y) + dyIn, dIn = drl.toInches(h.diameter);
              const key = `H|${quant(xIn)}|${quant(yIn)}|${quant(dIn)}`;
              pushSig(map, key, {
                kind: 'DRILL_HIT',
                xIn,
                yIn,
                dIn,
                minXIn: xIn - dIn / 2,
                maxXIn: xIn + dIn / 2,
                minYIn: yIn - dIn / 2,
                maxYIn: yIn + dIn / 2,
                rIn: dIn / 2
              });
            }
          }
          if (Array.isArray(drl.slots)) {
            for (const s of drl.slots) {
              const x1In = drl.toInches(s.x1) + dxIn, y1In = drl.toInches(s.y1) + dyIn;
              const x2In = drl.toInches(s.x2) + dxIn, y2In = drl.toInches(s.y2) + dyIn;
              const dIn = drl.toInches(s.diameter);
              const p1 = `${quant(x1In)},${quant(y1In)}`, p2 = `${quant(x2In)},${quant(y2In)}`;
              const pair = p1 <= p2 ? `${p1}:${p2}` : `${p2}:${p1}`;
              const key = `S|${pair}|${quant(dIn)}`;
              pushSig(map, key, {
                kind: 'DRILL_SLOT',
                x1In,
                y1In,
                x2In,
                y2In,
                dIn,
                xIn: (x1In + x2In) / 2,
                yIn: (y1In + y2In) / 2,
                minXIn: Math.min(x1In, x2In) - dIn / 2,
                maxXIn: Math.max(x1In, x2In) + dIn / 2,
                minYIn: Math.min(y1In, y2In) - dIn / 2,
                maxYIn: Math.max(y1In, y2In) + dIn / 2,
                rIn: Math.hypot(x2In - x1In, y2In - y1In) / 2 + dIn / 2
              });
            }
          }
        }
        if (ipc && Array.isArray(ipc.records)) {
          for (const r of ipc.records) {
            const xIn = r.xIn + dxIn, yIn = r.yIn + dyIn;
            const key = `N|${r.net}|${quant(xIn)}|${quant(yIn)}`;
            const rad = Math.max(r.holeDiaIn || 0.02, 0.02) / 2;
            pushSig(map, key, {
              kind: 'IPC_NODE',
              net: r.net || '',
              xIn,
              yIn,
              minXIn: xIn - rad,
              maxXIn: xIn + rad,
              minYIn: yIn - rad,
              maxYIn: yIn + rad,
              rIn: rad
            });
          }
        }
        return map;
      };

      const isSamePrimWithinTol = (a, b) => {
        if (!a || !b || a.kind !== b.kind) return false;
        const t = tolIn * 1.05;
        if (a.kind === 'FLASH') {
          if (a.shape !== b.shape || a.polarity !== b.polarity || a.macroName !== b.macroName) return false;
          if (Math.hypot(a.xIn - b.xIn, a.yIn - b.yIn) > t) return false;
          if (Math.abs(a.wIn - b.wIn) > t || Math.abs(a.hIn - b.hIn) > t || Math.abs((a.holeIn || 0) - (b.holeIn || 0)) > t) return false;
          const dRot = Math.abs(((a.rotDeg || 0) - (b.rotDeg || 0)) % 360);
          if (Math.min(dRot, 360 - dRot) > 0.5) return false;
          return true;
        }
        if (a.kind === 'DRAW') {
          if (a.mode !== b.mode || a.polarity !== b.polarity || Math.abs(a.wIn - b.wIn) > t) return false;
          if ((a.mode === 'G02' || a.mode === 'G03') && ((a.arcRIn || 0) > 1e-7 || (b.arcRIn || 0) > 1e-7)) {
            const sameCenterAndRad = Math.hypot((a.cxIn || 0) - (b.cxIn || 0), (a.cyIn || 0) - (b.cyIn || 0)) <= t &&
                                     Math.abs((a.arcRIn || 0) - (b.arcRIn || 0)) <= t;
            if (!sameCenterAndRad) return false;
            const isFullA = a.quadrant !== 'SINGLE' && Math.hypot(a.x2In - a.x1In, a.y2In - a.y1In) <= t;
            const isFullB = b.quadrant !== 'SINGLE' && Math.hypot(b.x2In - b.x1In, b.y2In - b.y1In) <= t;
            if (isFullA && isFullB) return true;
            return Math.hypot(a.x1In - b.x1In, a.y1In - b.y1In) <= t &&
                   Math.hypot(a.x2In - b.x2In, a.y2In - b.y2In) <= t;
          }
          const dFwd = Math.hypot(a.x1In - b.x1In, a.y1In - b.y1In) <= t && Math.hypot(a.x2In - b.x2In, a.y2In - b.y2In) <= t;
          const dRev = Math.hypot(a.x1In - b.x2In, a.y1In - b.y2In) <= t && Math.hypot(a.x2In - b.x1In, a.y2In - b.y1In) <= t;
          return dFwd || dRev;
        }
        if (a.kind === 'REGION') {
          if (a.polarity !== b.polarity || !a.contours || !b.contours || a.contours.length !== b.contours.length) return false;
          const matchContourCyclic = (cA, cB) => {
            if (!cA || !cB || cA.length !== cB.length) return false;
            const n = cA.length;
            for (let shift = 0; shift < n; shift++) {
              let okFwd = true, okRev = true;
              for (let i = 0; i < n; i++) {
                const pA = cA[i];
                const pBf = cB[(i + shift) % n];
                if (Math.hypot(pA[0] - pBf[0], pA[1] - pBf[1]) > t) { okFwd = false; break; }
              }
              if (okFwd) return true;
              for (let i = 0; i < n; i++) {
                const pA = cA[i];
                const pBr = cB[(shift - i + n) % n];
                if (Math.hypot(pA[0] - pBr[0], pA[1] - pBr[1]) > t) { okRev = false; break; }
              }
              if (okRev) return true;
            }
            return false;
          };
          const usedB = new Uint8Array(b.contours.length);
          for (let ci = 0; ci < a.contours.length; ci++) {
            let found = false;
            for (let cj = 0; cj < b.contours.length; cj++) {
              if (usedB[cj]) continue;
              if (matchContourCyclic(a.contours[ci], b.contours[cj])) {
                usedB[cj] = 1;
                found = true;
                break;
              }
            }
            if (!found) return false;
          }
          return true;
        }
        if (a.kind === 'DRILL_HIT') {
          return Math.hypot(a.xIn - b.xIn, a.yIn - b.yIn) <= t && Math.abs(a.dIn - b.dIn) <= t;
        }
        if (a.kind === 'DRILL_SLOT') {
          if (Math.abs(a.dIn - b.dIn) > t) return false;
          const dFwd = Math.hypot(a.x1In - b.x1In, a.y1In - b.y1In) <= t && Math.hypot(a.x2In - b.x2In, a.y2In - b.y2In) <= t;
          const dRev = Math.hypot(a.x1In - b.x2In, a.y1In - b.y2In) <= t && Math.hypot(a.x2In - b.x1In, a.y2In - b.y1In) <= t;
          return dFwd || dRev;
        }
        if (a.kind === 'IPC_NODE') {
          return a.net === b.net && Math.hypot(a.xIn - b.xIn, a.yIn - b.yIn) <= t;
        }
        return false;
      };

      const mapA = extractSigs(camA, options.drillA || null, options.ipcA || null, 0, 0);
      const mapB = extractSigs(camB, options.drillB || null, options.ipcB || null, offXIn, offYIn);
      const rawAdded = [];
      const rawRemoved = [];
      let unchangedCount = 0;

      for (const [k, listA] of mapA.entries()) {
        const listB = mapB.get(k) || [];
        const common = Math.min(listA.length, listB.length);
        unchangedCount += common;
        for (let i = common; i < listA.length; i++) rawRemoved.push(listA[i]);
      }
      for (const [k, listB] of mapB.entries()) {
        const listA = mapA.get(k) || [];
        const common = Math.min(listA.length, listB.length);
        for (let i = common; i < listB.length; i++) rawAdded.push(listB[i]);
      }

      // Second pass: tolerance-exact matching across quantization bin boundaries
      const matchedRem = new Uint8Array(rawRemoved.length);
      const matchedAdd = new Uint8Array(rawAdded.length);
      const remByKind = new Map();
      for (let ir = 0; ir < rawRemoved.length; ir++) {
        const k = rawRemoved[ir].kind;
        if (!remByKind.has(k)) remByKind.set(k, []);
        remByKind.get(k).push(ir);
      }
      for (let ia = 0; ia < rawAdded.length; ia++) {
        const itB = rawAdded[ia];
        const candList = remByKind.get(itB.kind);
        if (!candList || !candList.length) continue;
        for (let c = 0; c < candList.length; c++) {
          const ir = candList[c];
          if (matchedRem[ir]) continue;
          if (isSamePrimWithinTol(rawRemoved[ir], itB)) {
            matchedRem[ir] = 1;
            matchedAdd[ia] = 1;
            unchangedCount++;
            break;
          }
        }
      }

      const added = [];
      const removed = [];
      for (let ir = 0; ir < rawRemoved.length; ir++) if (!matchedRem[ir]) removed.push(rawRemoved[ir]);
      for (let ia = 0; ia < rawAdded.length; ia++) if (!matchedAdd[ia]) added.push(rawAdded[ia]);

      return { added, removed, unchangedCount, totalDiffs: added.length + removed.length };
    }

    /**
     * Compare two parsed Gerbers / Drills (even if one is INCH and the other is MM!)
     */
    compare(camA, camB, options = {}) {
      const w = this.width;
      const h = this.height;

      const safeGbrA = camA || new GerberParser('', { allowEmpty: true }).parse();
      const safeGbrB = camB || new GerberParser('', { allowEmpty: true }).parse();
      const drlA = options.drillA || null;
      const drlB = options.drillB || null;
      const ipcA = options.ipcA || null;
      const ipcB = options.ipcB || null;

      // Compute unified bounding box in Inches across Gerber, Drill, and IPC so English vs Metric files align 1:1 physically!
      const bList = [];
      if (camA && camA.commands && camA.commands.length && isFinite(camA.bounds.minX)) {
        bList.push({ minX: camA.toInches(camA.bounds.minX), maxX: camA.toInches(camA.bounds.maxX), minY: camA.toInches(camA.bounds.minY), maxY: camA.toInches(camA.bounds.maxY) });
      }
      if (camB && camB.commands && camB.commands.length && isFinite(camB.bounds.minX)) {
        bList.push({ minX: camB.toInches(camB.bounds.minX), maxX: camB.toInches(camB.bounds.maxX), minY: camB.toInches(camB.bounds.minY), maxY: camB.toInches(camB.bounds.maxY) });
      }
      if (drlA && (drlA.hits.length || drlA.slots.length) && isFinite(drlA.bounds.minX)) {
        bList.push({ minX: drlA.toInches(drlA.bounds.minX), maxX: drlA.toInches(drlA.bounds.maxX), minY: drlA.toInches(drlA.bounds.minY), maxY: drlA.toInches(drlA.bounds.maxY) });
      }
      if (drlB && (drlB.hits.length || drlB.slots.length) && isFinite(drlB.bounds.minX)) {
        bList.push({ minX: drlB.toInches(drlB.bounds.minX), maxX: drlB.toInches(drlB.bounds.maxX), minY: drlB.toInches(drlB.bounds.minY), maxY: drlB.toInches(drlB.bounds.maxY) });
      }
      if (ipcA && ipcA.records && ipcA.records.length && isFinite(ipcA.bounds.minX)) {
        bList.push(ipcA.bounds);
      }
      if (ipcB && ipcB.records && ipcB.records.length && isFinite(ipcB.bounds.minX)) {
        bList.push(ipcB.bounds);
      }

      const sharedBoundsInches = options.sharedBoundsInches || (bList.length ? {
        minX: Math.min(...bList.map(b => b.minX)),
        maxX: Math.max(...bList.map(b => b.maxX)),
        minY: Math.min(...bList.map(b => b.minY)),
        maxY: Math.max(...bList.map(b => b.maxY))
      } : { minX: 0, maxX: 1, minY: 0, maxY: 1 });

      const primDiff = this.comparePrimitives(safeGbrA, safeGbrB, { ...options, drillA: drlA, drillB: drlB, ipcA, ipcB });
      const dfmViolations = this.runDFMChecks(safeGbrB.commands.length ? safeGbrB : safeGbrA, drlB || drlA || null, options.dfmRules || IPC_DFM_RULES.class2);

      // Headless / Node.js fallback when HTMLCanvasElement is unavailable
      if (typeof document === 'undefined') {
        const bwIn = Math.max(1e-4, sharedBoundsInches.maxX - sharedBoundsInches.minX);
        const bhIn = Math.max(1e-4, sharedBoundsInches.maxY - sharedBoundsInches.minY);
        const pad = 30;
        const scale = Math.min((w - pad * 2) / bwIn, (h - pad * 2) / bhIn);
        const ox = pad + ((w - pad * 2) - bwIn * scale) / 2;
        const oy = pad + ((h - pad * 2) - bhIn * scale) / 2;
        const toPxRect = item => {
          const rPx = Math.max(8, (item.rIn || 0.02) * scale);
          const cx = ox + (item.xIn - sharedBoundsInches.minX) * scale;
          const cy = h - (oy + (item.yIn - sharedBoundsInches.minY) * scale);
          return { x: Math.max(0, Math.round(cx - rPx)), y: Math.max(0, Math.round(cy - rPx)), w: Math.round(rPx * 2), h: Math.round(rPx * 2) };
        };
        const regions = [
          ...primDiff.removed.map(it => ({ ...toPxRect(it), kind: 'r', type: 'removed', sa: 64, sb: 0, sw: 0, pixelCount: 64, dpi: w / bwIn })),
          ...primDiff.added.map(it => ({ ...toPxRect(it), kind: 'a', type: 'added', sa: 0, sb: 64, sw: 0, pixelCount: 64, dpi: w / bwIn }))
        ];
        return {
          width: w,
          height: h,
          imageData: null,
          sharedBoundsInches,
          regions,
          primitiveDiff: primDiff,
          dfmViolations,
          stats: {
            missingCopperPx: primDiff.removed.length * 64,
            addedCopperPx: primDiff.added.length * 64,
            clearanceWarningPx: dfmViolations.filter(v => v.category === 'TRACE_TO_PAD_CLEARANCE').length * 32,
            commonPx: primDiff.unchangedCount * 64,
            dfmViolationCount: dfmViolations.length,
            isIdentical: primDiff.totalDiffs === 0
          }
        };
      }

      const renderOpts = { ...options, sharedBoundsInches, renderMode: 'fill', showDrillRings: true };

      // Render Layer A to Offscreen Canvas
      const cvA = document.createElement('canvas');
      cvA.width = w;
      cvA.height = h;
      const rendA = new PCBRenderer(cvA, 'standard');
      rendA.render(safeGbrA, drlA, { ...renderOpts, ipcParsed: ipcA });

      // Render Layer B to Offscreen Canvas
      const cvB = document.createElement('canvas');
      cvB.width = w;
      cvB.height = h;
      const rendB = new PCBRenderer(cvB, 'standard');
      rendB.render(safeGbrB, drlB, { ...renderOpts, ipcParsed: ipcB });

      const ctxA = cvA.getContext('2d');
      const ctxB = cvB.getContext('2d');

      const imgA = ctxA.getImageData(0, 0, w, h);
      const imgB = ctxB.getImageData(0, 0, w, h);
      const dA = imgA.data;
      const dB = imgB.data;

      const resultImg = ctxA.createImageData(w, h);
      if (typeof document !== 'undefined') {
        cvA.width = 0; cvA.height = 0;
        cvB.width = 0; cvB.height = 0;
      }
      const resData = resultImg.data;

      let missingCopperPx = 0;
      let addedCopperPx = 0;
      let clearanceWarningPx = 0;
      let commonPx = 0;

      const minClearanceMils = options.minClearanceMils || 4.0;
      const compareTolMils = options.compareTolMils != null ? options.compareTolMils : 0;
      const bwInches = (sharedBoundsInches.maxX - sharedBoundsInches.minX) || 1.0;
      const pxPerMil = (w / (bwInches * 1000));
      const clearanceRadiusPx = Math.max(2, Math.round(minClearanceMils * pxPerMil));
      const tolRadiusPx = compareTolMils > 0 ? Math.min(4, Math.floor(compareTolMils * pxPerMil)) : 0;

      const binA = new Uint8Array(w * h);
      const binB = new Uint8Array(w * h);

      for (let i = 0, p = 0; i < dA.length; i += 4, p++) {
        const isCopperA = (dA[i] > 40 || dA[i + 1] > 60 || dA[i + 2] > 65);
        const isCopperB = (dB[i] > 40 || dB[i + 1] > 60 || dB[i + 2] > 65);
        if (isCopperA) binA[p] = 1;
        if (isCopperB) binB[p] = 1;
      }

      const hasNeighbor = (bin, x, y, rad) => {
        for (let dy = -rad; dy <= rad; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -rad; dx <= rad; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            if (bin[yy * w + xx]) return true;
          }
        }
        return false;
      };

      const CS = 12, gw = Math.ceil(w / CS), gh = Math.ceil(h / CS);
      const cellA = new Uint32Array(gw * gh);
      const cellB = new Uint32Array(gw * gh);
      const cellW = new Uint32Array(gw * gh);

      for (let y = 0, p = 0, i = 0; y < h; y++) {
        for (let x = 0; x < w; x++, p++, i += 4) {
          const inA = binA[p];
          const inB = binB[p];

          if (inA && !inB) {
            if (tolRadiusPx > 0 && hasNeighbor(binB, x, y, tolRadiusPx)) {
              commonPx++;
              resData[i] = 71; resData[i + 1] = 85; resData[i + 2] = 105; resData[i + 3] = 255;
            } else {
              missingCopperPx++;
              cellA[(y / CS | 0) * gw + (x / CS | 0)]++;
              resData[i] = 239; resData[i + 1] = 68; resData[i + 2] = 68; resData[i + 3] = 255;
            }
          } else if (!inA && inB) {
            if (tolRadiusPx > 0 && hasNeighbor(binA, x, y, tolRadiusPx)) {
              commonPx++;
              resData[i] = 71; resData[i + 1] = 85; resData[i + 2] = 105; resData[i + 3] = 255;
            } else {
              addedCopperPx++;
              cellB[(y / CS | 0) * gw + (x / CS | 0)]++;
              resData[i] = 34; resData[i + 1] = 197; resData[i + 2] = 94; resData[i + 3] = 255;
            }
          } else if (inA && inB) {
            commonPx++;
            resData[i] = 71; resData[i + 1] = 85; resData[i + 2] = 105; resData[i + 3] = 255;
          } else {
            resData[i] = 10; resData[i + 1] = 15; resData[i + 2] = 12; resData[i + 3] = 255;
          }
        }
      }

      // Check clearance warnings on boundary additions (Amber / Yellow: #f59e0b)
      const r = clearanceRadiusPx;
      for (let y = r; y < h - r; y += 2) {
        for (let x = r; x < w - r; x += 2) {
          const idx = y * w + x;
          if (binB[idx] && !binA[idx]) {
            let tooClose = false;
            for (let dy = -r; dy <= r; dy += 2) {
              for (let dx = -r; dx <= r; dx += 2) {
                if (dx * dx + dy * dy <= r * r && (dx !== 0 || dy !== 0)) {
                  const neighborIdx = (y + dy) * w + (x + dx);
                  if (binA[neighborIdx]) {
                    tooClose = true;
                    break;
                  }
                }
              }
              if (tooClose) break;
            }

            if (tooClose) {
              clearanceWarningPx++;
              cellW[(y / CS | 0) * gw + (x / CS | 0)]++;
              const pi = idx * 4;
              resData[pi] = 245;
              resData[pi + 1] = 158;
              resData[pi + 2] = 11;
              resData[pi + 3] = 255;
            }
          }
        }
      }

      // Extract clustered defect regions with stepped small subBoxes for Defect Navigator
      const regions = [];
      const seen = new Uint8Array(gw * gh);
      for (let s = 0; s < seen.length; s++) {
        if ((cellA[s] + cellB[s] + cellW[s]) < 2 || seen[s]) continue;
        let x0 = gw, y0 = gh, x1 = 0, y1 = 0, sa = 0, sb = 0, sw = 0;
        const subBoxes = [];
        const q = [s];
        seen[s] = 1;
        while (q.length) {
          const v = q.pop(), cx = v % gw, cy = v / gw | 0;
          x0 = Math.min(x0, cx); x1 = Math.max(x1, cx);
          y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
          sa += cellA[v]; sb += cellB[v]; sw += cellW[v];
          if (subBoxes.length < 240) {
            subBoxes.push({
              x: cx * CS,
              y: cy * CS,
              w: CS,
              h: CS,
              kind: cellW[v] > 0 ? 'c' : (cellB[v] === 0 ? 'r' : (cellA[v] === 0 ? 'a' : 'c'))
            });
          }
          for (let oy = -2; oy <= 2; oy++) {
            for (let ox = -2; ox <= 2; ox++) {
              const nx = cx + ox, ny = cy + oy;
              if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
              const j = ny * gw + nx;
              if ((cellA[j] + cellB[j] + cellW[j]) >= 2 && !seen[j]) {
                seen[j] = 1;
                q.push(j);
              }
            }
          }
        }
        const rx = Math.max(0, x0 * CS - 2);
        const ry = Math.max(0, y0 * CS - 2);
        const rw = Math.min(w, (x1 + 1) * CS + 2) - rx;
        const rh = Math.min(h, (y1 + 1) * CS + 2) - ry;
        const kind = sw > 4 ? 'c' : (sb === 0 ? 'r' : (sa === 0 ? 'a' : 'c'));
        regions.push({
          x: rx,
          y: ry,
          w: rw,
          h: rh,
          subBoxes,
          kind,
          type: sw > 4 ? 'clearance' : (kind === 'r' ? 'removed' : (kind === 'a' ? 'added' : 'changed')),
          sa,
          sb,
          sw,
          pixelCount: sa + sb + sw,
          dpi: (w / bwInches)
        });
      }

      if (primDiff && primDiff.totalDiffs > 0 && rendA && rendA.lastTransform) {
        const tr = rendA.lastTransform;
        const gUnit = tr.gUnit || 'IN';
        const toGU = valIn => (gUnit === 'MM' ? valIn * 25.4 : valIn);
        const pushPrimFallback = (it, kind) => {
          const minX = tr.tx(toGU(it.minXIn != null ? it.minXIn : (it.xIn - (it.rIn || 0.015))));
          const maxX = tr.tx(toGU(it.maxXIn != null ? it.maxXIn : (it.xIn + (it.rIn || 0.015))));
          const minY = tr.ty(toGU(it.maxYIn != null ? it.maxYIn : (it.yIn + (it.rIn || 0.015))));
          const maxY = tr.ty(toGU(it.minYIn != null ? it.minYIn : (it.yIn - (it.rIn || 0.015))));
          const rx = Math.max(0, Math.floor(Math.min(minX, maxX) - 4));
          const ry = Math.max(0, Math.floor(Math.min(minY, maxY) - 4));
          const rw = Math.min(w - rx, Math.max(12, Math.ceil(Math.abs(maxX - minX) + 8)));
          const rh = Math.min(h - ry, Math.max(12, Math.ceil(Math.abs(maxY - minY) + 8)));
          const ov = regions.find(ex => !(rx > ex.x + ex.w + 6 || rx + rw + 6 < ex.x || ry > ex.y + ex.h + 6 || ry + rh + 6 < ex.y));
          if (!ov) {
            regions.push({
              x: rx,
              y: ry,
              w: rw,
              h: rh,
              subBoxes: [{ x: rx, y: ry, w: rw, h: rh, kind }],
              kind,
              type: kind === 'r' ? 'removed' : 'added',
              sa: kind === 'r' ? 32 : 0,
              sb: kind === 'a' ? 32 : 0,
              sw: 0,
              pixelCount: 32,
              dpi: (w / bwInches)
            });
          }
        };
        for (const it of (primDiff.removed || []).slice(0, 120)) pushPrimFallback(it, 'r');
        for (const it of (primDiff.added || []).slice(0, 120)) pushPrimFallback(it, 'a');
      }

      return {
        width: w,
        height: h,
        imageData: resultImg,
        sharedBoundsInches,
        regions,
        primitiveDiff: primDiff,
        dfmViolations,
        stats: {
          missingCopperPx,
          addedCopperPx,
          clearanceWarningPx,
          commonPx,
          dfmViolationCount: dfmViolations.length,
          isIdentical: (missingCopperPx === 0 && addedCopperPx === 0 && primDiff.totalDiffs === 0 && regions.length === 0)
        }
      };
    }
  }

  /**
   * Multi-Layer PCB CAM Stackup & Auto-Pairing Engine (Industrial PCB CAM)
   * Supports 1 Layer = 1 CAM File up to 100+ Layers = 100+ CAM Files per Revision (Slot A & Slot B)
   */
  class CAMJobStack {
    static normalizeBaseName(filename = '') {
      const base = String(filename || '').split(/[\\/]/).pop().toLowerCase().replace(/\.[^.]+$/, '');
      return base
        .replace(/(?:[_\-\s]*(?:rev|revision|ver|version|v|slot)[_\-\s]*[ab012]|[_\-\s]+(?:old|new|base|revised|orig|original|mod|modified|a|b))$/i, '')
        .trim() || base;
    }

    /**
     * Inspect raw CAM text to detect explicit header units & coordinate format
     */
    static inspectHeaderMetadata(filename = '', text = '') {
      const meta = detectLayerType(filename, text);
      const head = String(text || '').slice(0, 8192);
      let explicitUnits = null; // 'MM' | 'IN' | 'MILS' | null
      let explicitZeroSupp = null; // 'L' | 'T' | 'D' | null
      let explicitFormat = null;   // '2.4' | '3.3' | etc.

      if (meta.category === 'netlist') {
        if (/UNITS\s+CUST\s*1|UNITS\s+MM|METRIC/i.test(head)) explicitUnits = 'MM';
        else if (/UNITS\s+CUST\s*2|UNITS\s+IN/i.test(head)) explicitUnits = 'IN';
        else if (/UNITS\s+CUST\s*0|UNITS\s+MIL|ENGLISH/i.test(head)) explicitUnits = 'MILS';
      } else if (meta.category === 'drill') {
        if (/\bMETRIC\b|^M71\b/im.test(head)) explicitUnits = 'MM';
        else if (/\bINCH\b|^M72\b/im.test(head)) explicitUnits = 'IN';
        if (/\bTZ\b/i.test(head)) explicitZeroSupp = 'T';
        else if (/\bLZ\b/i.test(head)) explicitZeroSupp = 'L';
        const fmtMatch = /(?:FILE_FORMAT|FORMAT)\s*[=:]?\s*\{?\s*(\d+)\s*:\s*(\d+)/i.exec(head);
        if (fmtMatch) explicitFormat = `${fmtMatch[1]}.${fmtMatch[2]}`;
      } else {
        if (/%MOMM\*%|\bG0*71\b/i.test(head)) explicitUnits = 'MM';
        else if (/%MOIN\*%|\bG0*70\b/i.test(head)) explicitUnits = 'IN';
        const fsMatch = /%FS([LTD])?([AI])?[^%*]*X(\d)(\d)Y(\d)(\d)\*%/i.exec(head);
        if (fsMatch) {
          if (fsMatch[1]) explicitZeroSupp = fsMatch[1].toUpperCase();
          explicitFormat = `${fsMatch[3]}.${fsMatch[4]}`;
        }
      }

      return {
        layerMeta: meta,
        explicitUnits,
        explicitZeroSupp,
        explicitFormat,
        isMetric: explicitUnits === 'MM'
      };
    }

    /**
     * Create a normalized CAM layer entry from a file object { name, path, text/bytes }
     */
    static createLayerEntry(fileObj, index = 0) {
      let text = '';
      if (typeof fileObj.text === 'string') {
        text = fileObj.text;
      } else if (fileObj.bytes) {
        const u8 = fileObj.bytes instanceof Uint8Array ? fileObj.bytes : new Uint8Array(fileObj.bytes);
        text = new TextDecoder().decode(u8);
      }
      const name = fileObj.name || `Layer_${index + 1}.gbr`;
      const path = fileObj.path || '';
      const info = this.inspectHeaderMetadata(name, text);
      return {
        id: `cam_lyr_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        path,
        text,
        layerMeta: info.layerMeta,
        explicitUnits: info.explicitUnits,
        explicitZeroSupp: info.explicitZeroSupp,
        explicitFormat: info.explicitFormat,
        enabled: true,
        locked: false,
        customColor: (info.layerMeta && info.layerMeta.color) || '#ef4444',
        opacity: 100,
        parsedGbr: null,
        parsedDrl: null,
        parsedIPC: null,
        _parseKey: null
      };
    }

    /**
     * Sort an array of CAM layer entries in physical stackup order (L1 -> L2 -> ... -> L100 -> Mask -> Silk -> Outline -> Drill -> Netlist)
     */
    static sortLayers(layers = []) {
      return [...layers].sort((a, b) => {
        const sa = (a.layerMeta && a.layerMeta.sortOrder != null) ? a.layerMeta.sortOrder : 400;
        const sb = (b.layerMeta && b.layerMeta.sortOrder != null) ? b.layerMeta.sortOrder : 400;
        if (sa !== sb) return sa - sb;
        return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' });
      });
    }

    /**
     * Parse a single layer entry with given parseOptions (caching by parseKey)
     */
    static parseLayerEntry(entry, parseOpts = {}, parseKey = '') {
      if (!entry) return null;
      if (entry._parseKey === parseKey && (entry.parsedGbr || entry.parsedDrl || entry.parsedIPC)) {
        return entry;
      }
      const cat = (entry.layerMeta && entry.layerMeta.category) || 'copper';
      entry.parsedGbr = null;
      entry.parsedDrl = null;
      entry.parsedIPC = null;
      if (cat === 'netlist') {
        entry.parsedIPC = new IPCD356Parser(entry.text, parseOpts).parse();
      } else if (cat === 'drill') {
        entry.parsedDrl = new ExcellonParser(entry.text, parseOpts).parse();
      } else {
        entry.parsedGbr = new GerberParser(entry.text, { ...parseOpts, allowEmpty: true }).parse();
      }
      entry._parseKey = parseKey;
      return entry;
    }

    /**
     * Auto-pair layers between Slot A (1..100+ files) and Slot B (1..100+ files)
     * Matches by: (1) exact pairKey (L1..L100, GTL, GBL, DRL, IPC), (2) normalized base filename, (3) stackup index
     */
    static pairLayerStacks(layersA = [], layersB = []) {
      const enabledA = this.sortLayers(layersA.filter(l => l && l.enabled !== false));
      const enabledB = this.sortLayers(layersB.filter(l => l && l.enabled !== false));
      if (!enabledA.length && !enabledB.length) return [];

      const usedB = new Set();
      const pairs = [];

      // Pass 1: Match by exact pairKey + normalized filename or unique pairKey
      for (let i = 0; i < enabledA.length; i++) {
        const lA = enabledA[i];
        const pkA = (lA.layerMeta && lA.layerMeta.pairKey) || '';
        const normA = this.normalizeBaseName(lA.name);

        let bestBIdx = -1;
        // First try exact normalized filename match
        bestBIdx = enabledB.findIndex((lB, j) => !usedB.has(j) && this.normalizeBaseName(lB.name) === normA);
        // Next try matching pairKey (e.g. COPPER_L1..COPPER_L100, MASK_TOP, DRILL_MAIN)
        if (bestBIdx === -1 && pkA && !pkA.startsWith('GBR_')) {
          bestBIdx = enabledB.findIndex((lB, j) => !usedB.has(j) && lB.layerMeta && lB.layerMeta.pairKey === pkA);
        }
        // If both stacks have the exact same count of layers (e.g. 1 layer vs 1 layer, or 100 layers vs 100 layers), pair by position
        if (bestBIdx === -1 && enabledA.length === enabledB.length && !usedB.has(i)) {
          bestBIdx = i;
        }

        if (bestBIdx !== -1) {
          usedB.add(bestBIdx);
          const lB = enabledB[bestBIdx];
          pairs.push({
            pairIndex: pairs.length + 1,
            label: (lA.layerMeta && lA.layerMeta.name) || lA.name,
            code: (lA.layerMeta && lA.layerMeta.code) || 'GBR',
            category: (lA.layerMeta && lA.layerMeta.category) || 'copper',
            layerA: lA,
            layerB: lB
          });
        } else {
          pairs.push({
            pairIndex: pairs.length + 1,
            label: (lA.layerMeta && lA.layerMeta.name) || lA.name,
            code: (lA.layerMeta && lA.layerMeta.code) || 'GBR',
            category: (lA.layerMeta && lA.layerMeta.category) || 'copper',
            layerA: lA,
            layerB: null
          });
        }
      }

      // Append any remaining unmatched layers from Slot B
      for (let j = 0; j < enabledB.length; j++) {
        if (usedB.has(j)) continue;
        const lB = enabledB[j];
        // Can we slot it into an unmatched pair of the same category?
        const openPair = pairs.find(p => !p.layerB && p.category === ((lB.layerMeta && lB.layerMeta.category) || 'copper'));
        if (openPair) {
          openPair.layerB = lB;
        } else {
          pairs.push({
            pairIndex: pairs.length + 1,
            label: (lB.layerMeta && lB.layerMeta.name) || lB.name,
            code: (lB.layerMeta && lB.layerMeta.code) || 'GBR',
            category: (lB.layerMeta && lB.layerMeta.category) || 'copper',
            layerA: null,
            layerB: lB
          });
        }
      }

      pairs.forEach((p, idx) => { p.pairIndex = idx + 1; });
      return pairs;
    }

    /**
     * Compute unified physical board bounding box in Inches across all layers in both stacks
     */
    static computeUnifiedBoundsInches(layers = []) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const l of layers) {
        if (!l) continue;
        if (l.parsedGbr && l.parsedGbr.commands && l.parsedGbr.commands.length && isFinite(l.parsedGbr.bounds.minX)) {
          minX = Math.min(minX, l.parsedGbr.toInches(l.parsedGbr.bounds.minX));
          maxX = Math.max(maxX, l.parsedGbr.toInches(l.parsedGbr.bounds.maxX));
          minY = Math.min(minY, l.parsedGbr.toInches(l.parsedGbr.bounds.minY));
          maxY = Math.max(maxY, l.parsedGbr.toInches(l.parsedGbr.bounds.maxY));
        }
        if (l.parsedDrl && (l.parsedDrl.hits.length || l.parsedDrl.slots.length) && isFinite(l.parsedDrl.bounds.minX)) {
          minX = Math.min(minX, l.parsedDrl.toInches(l.parsedDrl.bounds.minX));
          maxX = Math.max(maxX, l.parsedDrl.toInches(l.parsedDrl.bounds.maxX));
          minY = Math.min(minY, l.parsedDrl.toInches(l.parsedDrl.bounds.minY));
          maxY = Math.max(maxY, l.parsedDrl.toInches(l.parsedDrl.bounds.maxY));
        }
        if (l.parsedIPC && l.parsedIPC.records && l.parsedIPC.records.length && isFinite(l.parsedIPC.bounds.minX)) {
          minX = Math.min(minX, l.parsedIPC.bounds.minX);
          maxX = Math.max(maxX, l.parsedIPC.bounds.maxX);
          minY = Math.min(minY, l.parsedIPC.bounds.minY);
          maxY = Math.max(maxY, l.parsedIPC.bounds.maxY);
        }
      }
      if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 2.5, maxY: 2.0 };
      return { minX, minY, maxX, maxY };
    }

    /**
     * Generate a synthetic multi-layer PCB CAM stack (from 1 layer up to 100+ layers!) for testing & demos
     */
    static generateSampleMultiLayerStack(layerCount = 8, isRevB = false, units = 'IN') {
      const isMM = String(units || 'IN').toUpperCase().startsWith('M');
      const uHeader = isMM ? '%MOMM*%' : '%MOIN*%';
      const fsHeader = isMM ? '%FSLAX33Y33*%' : '%FSLAX24Y24*%';
      const scaleCoord = inches => {
        if (isMM) return Math.round(inches * 25.4 * 1000); // 3.3 mm (microns)
        return Math.round(inches * 10000); // 2.4 in (0.1 mil)
      };
      const fmtAp = inches => isMM ? (inches * 25.4).toFixed(3) : inches.toFixed(4);

      const files = [];
      for (let l = 1; l <= layerCount; l++) {
        const isTop = l === 1;
        const isBot = l === layerCount && layerCount > 1;
        const ext = isTop ? 'gtl' : (isBot ? 'gbl' : `g${l - 1}`);
        const name = `Board_L${l}_${isTop ? 'Top' : (isBot ? 'Bot' : 'Inner' + (l - 1))}_${isRevB ? 'RevB' : 'RevA'}.${ext}`;
        const offsetIn = (l % 10) * 0.04;
        const x1 = scaleCoord(0.5 + offsetIn);
        const y1 = scaleCoord(0.5 + offsetIn);
        const x2 = scaleCoord(1.8 + offsetIn + (isRevB && l === 1 ? 0.08 : 0));
        const y2 = scaleCoord(1.2 + offsetIn);
        const lines = [
          `G04 Kensho Pro Multi-Layer Stackup Layer ${l} of ${layerCount} (${isMM ? 'Metric MM' : 'English IN'})*`,
          `%TF.FileFunction,Copper,L${l},${isTop ? 'Top' : (isBot ? 'Bot' : 'Inr')}*%`,
          fsHeader,
          uHeader,
          `%ADD10C,${fmtAp(0.010)}*%`,
          `%ADD11C,${fmtAp(0.050)}*%`,
          'D11*',
          `X${x1}Y${y1}D03*`,
          `X${x2}Y${y2}D03*`,
          'D10*',
          `X${x1}Y${y1}D02*`,
          `X${x2}Y${y1}D01*`,
          `X${x2}Y${y2}D01*`,
          'M02*'
        ];
        files.push({ name, text: lines.join('\n') });
      }
      return files;
    }
  }

  /**
   * Native Vector PDF Generator for 1 to 100+ CAM Layers (PDFLib)
   * Renders each layer (or composite stack) directly to crisp PDF vector paths & pads in milliseconds!
   */
  const _vectorStackPdfCache = new Map();
  async function layersToVectorPDFBytes(layerSlides = [], options = {}) {
    const slides = layerSlides.length ? layerSlides : [{ entries: [], title: 'Empty CAM Layer' }];
    const sb = options.sharedBoundsInches || { minX: 0, minY: 0, maxX: 2.5, maxY: 2.0 };
    const cacheSig = slides.map(s => {
      const ents = Array.isArray(s.entries) ? s.entries.filter(Boolean) : (s.entry ? [s.entry] : []);
      return ents.map(e => `${e.id || e.name || ''}:${e._parseKey || ''}:${(e.text && e.text.length) || 0}`).join('+');
    }).join('||') + `|${options.pcbTheme || 'standard'}|${options.renderMode || 'fill'}|${!!options.mirrorX}|${!!options.autoMirrorBottom}|${!!options.invertPolarity}|${options.showOrigin !== false}|${options.showDrillRings !== false}|${options.highlightNet || ''}|${!!options.drawLayerHeader}|${sb.minX.toFixed(4)},${sb.minY.toFixed(4)},${sb.maxX.toFixed(4)},${sb.maxY.toFixed(4)}|${((options.offsetInches && options.offsetInches.dxIn) || 0).toFixed(5)},${((options.offsetInches && options.offsetInches.dyIn) || 0).toFixed(5)}`;
    if (_vectorStackPdfCache.has(cacheSig)) {
      return _vectorStackPdfCache.get(cacheSig);
    }

    let pdfLibRef = (typeof PDFLib !== 'undefined' && PDFLib.PDFDocument) ? PDFLib : null;
    if (!pdfLibRef && typeof require === 'function') {
      try { pdfLibRef = require(['.', 'lib', 'pdf-lib.min.js'].join('/')); } catch (e) {}
    }
    if (!pdfLibRef || !pdfLibRef.PDFDocument) return null;

    const doc = await pdfLibRef.PDFDocument.create();
    const fontBold = await doc.embedFont(pdfLibRef.StandardFonts.HelveticaBold);
    const rgb = pdfLibRef.rgb;

    const hexToRgb = (hex, fallback = [0.78, 0.46, 0.20]) => {
      const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim());
      if (!m) return rgb(fallback[0], fallback[1], fallback[2]);
      return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
    };

    const pageW = options.pageW || 1100;
    const pageH = options.pageH || 800;
    const padding = options.padding != null ? options.padding : 36;
    const theme = PCB_THEMES[options.pcbTheme || 'standard'] || PCB_THEMES.standard;
    const renderMode = options.renderMode || 'fill';
    const globalMirrorX = !!options.mirrorX;
    const globalInvert = !!options.invertPolarity;
    const sharedBounds = options.sharedBoundsInches || { minX: 0, minY: 0, maxX: 2.5, maxY: 2.0 };

    const bwIn = Math.max(1e-4, sharedBounds.maxX - sharedBounds.minX);
    const bhIn = Math.max(1e-4, sharedBounds.maxY - sharedBounds.minY);
    const targetW = pageW - padding * 2;
    const targetH = pageH - padding * 2;
    const scale = Math.min(targetW / bwIn, targetH / bhIn);
    const offsetX = padding + (targetW - bwIn * scale) / 2;
    const offsetY = padding + (targetH - bhIn * scale) / 2;

    const offDxIn = (options.offsetInches && options.offsetInches.dxIn) || 0;
    const offDyIn = (options.offsetInches && options.offsetInches.dyIn) || 0;
    const txIn = (xIn, mirror) => {
      const adjX = xIn + offDxIn;
      const normX = mirror ? (sharedBounds.maxX - (adjX - sharedBounds.minX)) : adjX;
      return offsetX + (normX - sharedBounds.minX) * scale;
    };
    const tyIn = yIn => offsetY + ((yIn + offDyIn) - sharedBounds.minY) * scale;

    const roundCap = pdfLibRef.LineCapStyle ? pdfLibRef.LineCapStyle.Round : undefined;

    for (let sIdx = 0; sIdx < slides.length; sIdx++) {
      const slide = slides[sIdx];
      const entries = Array.isArray(slide.entries) ? slide.entries.filter(Boolean) : (slide.entry ? [slide.entry] : []);
      const page = doc.addPage([pageW, pageH]);

      // Substrate Background
      const bgCol = globalInvert ? hexToRgb(theme.trace) : hexToRgb(theme.substrate, [0.04, 0.14, 0.07]);
      page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: bgCol });

      // Board Extents Datum Box
      if (options.showOrigin !== false) {
        page.drawRectangle({
          x: offsetX,
          y: offsetY,
          width: bwIn * scale,
          height: bhIn * scale,
          borderColor: rgb(0.22, 0.74, 0.97),
          borderWidth: 0.75,
          borderOpacity: 0.35
        });
      }

      for (let eIdx = 0; eIdx < entries.length; eIdx++) {
        const entry = entries[eIdx];
        const gbr = entry.parsedGbr;
        const drl = entry.parsedDrl;
        const ipc = entry.parsedIPC;
        const meta = entry.layerMeta || {};
        const mirror = globalMirrorX || (options.autoMirrorBottom && meta.side === 'bottom');
        const customHex = entry.customColor || meta.color;
        const layerCol = (entries.length > 1 || entry._useCustomColor) && customHex ? hexToRgb(customHex) : null;
        const traceCol = layerCol || hexToRgb(theme.trace, [0.78, 0.46, 0.20]);
        const padCol = layerCol || hexToRgb(theme.pad, [0.98, 0.80, 0.08]);

        if (gbr && Array.isArray(gbr.commands)) {
          for (const cmd of gbr.commands) {
            const isClear = (cmd.polarity === 'CLEAR') !== globalInvert;
            const tCol = isClear ? bgCol : traceCol;
            const pCol = isClear ? bgCol : padCol;

            if (cmd.op === 'REGION' && Array.isArray(cmd.points) && cmd.points.length >= 3) {
              const contours = (Array.isArray(cmd.contours) && cmd.contours.length) ? cmd.contours : [cmd.points];
              const svgParts = [];
              for (const cnt of contours) {
                if (!cnt || cnt.length < 3) continue;
                const pts = cnt.map(pt => ({ x: txIn(gbr.toInches(pt.x), mirror), y: tyIn(gbr.toInches(pt.y)) }));
                svgParts.push(pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${(pageH - p.y).toFixed(2)}`).join(' ') + ' Z');
              }
              const svgPath = svgParts.join(' ');
              if (svgPath) {
                try {
                  page.drawSvgPath(svgPath, renderMode === 'outline' || renderMode === 'skeleton'
                    ? { x: 0, y: pageH, borderColor: tCol, borderWidth: 1.0 }
                    : { x: 0, y: pageH, color: tCol });
                } catch (e) {}
              }
            } else if (cmd.op === 'DRAW') {
              const ap = cmd.apertureDef;
              const hasP0 = ap && Array.isArray(ap.params) && ap.params[0] != null;
              const rawP0 = hasP0
                ? ((ap.type === 'R' && ap.params[1] != null) ? Math.min(ap.params[0], ap.params[1]) : ap.params[0])
                : (gbr.units === 'MM' ? 0.10 : 0.004);
              const diaIn = rawP0 > 0 ? gbr.toInches(rawP0) : 0.0025;
              const isFineTextOrSilk = diaIn <= 0.006 || (meta && meta.category === 'silk');
              const minPt = isFineTextOrSilk ? 0.06 : 0.14;
              const lw = renderMode === 'skeleton' ? 0.20 : (renderMode === 'outline' ? 0.30 : Math.max(minPt, diaIn * scale));
              const x1 = txIn(gbr.toInches(cmd.x1), mirror), y1 = tyIn(gbr.toInches(cmd.y1));
              const x2 = txIn(gbr.toInches(cmd.x2), mirror), y2 = tyIn(gbr.toInches(cmd.y2));

              if ((cmd.mode === 'G02' || cmd.mode === 'G03') && (cmd.i || cmd.j)) {
                const sxIn = gbr.toInches(cmd.x1), syIn = gbr.toInches(cmd.y1);
                const exIn = gbr.toInches(cmd.x2), eyIn = gbr.toInches(cmd.y2);
                const iIn = gbr.toInches(cmd.i), jIn = gbr.toInches(cmd.j);
                const arc = resolveGerberArc(sxIn, syIn, exIn, eyIn, iIn, jIn, cmd.mode, cmd.quadrant);
                if (arc.isFullCircle && arc.rad * scale > 0.2) {
                  page.drawCircle({ x: txIn(arc.cx, mirror), y: tyIn(arc.cy), size: Math.max(0.15, arc.rad * scale), borderColor: tCol, borderWidth: lw });
                } else if (!arc.isChordFallback && !arc.isZeroLength && arc.rad > 1e-6 && arc.sweep > 1e-6) {
                  const steps = Math.max(6, Math.min(28, Math.ceil((arc.sweep / (Math.PI * 2)) * 28)));
                  let px0 = x1, py0 = y1;
                  for (let s = 1; s <= steps; s++) {
                    const ang = arc.ccw ? (arc.a1 + (arc.sweep * s) / steps) : (arc.a1 - (arc.sweep * s) / steps);
                    const px1 = s === steps ? x2 : txIn(arc.cx + Math.cos(ang) * arc.rad, mirror);
                    const py1 = s === steps ? y2 : tyIn(arc.cy + Math.sin(ang) * arc.rad);
                    page.drawLine({ start: { x: px0, y: py0 }, end: { x: px1, y: py1 }, thickness: lw, color: tCol, ...(roundCap !== undefined ? { lineCap: roundCap } : {}) });
                    px0 = px1; py0 = py1;
                  }
                } else {
                  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: lw, color: tCol, ...(roundCap !== undefined ? { lineCap: roundCap } : {}) });
                }
              } else {
                const useRoundCap = renderMode === 'fill' && (!ap || ap.type !== 'R') && roundCap !== undefined;
                page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: lw, color: tCol, ...(useRoundCap ? { lineCap: roundCap } : {}) });
              }
            } else if (cmd.op === 'FLASH') {
              const ap = cmd.apertureDef;
              const rawP0 = (ap && Array.isArray(ap.params) && ap.params[0] != null && ap.params[0] > 0) ? ap.params[0] : (gbr.units === 'MM' ? 0.8 : 0.032);
              const rawP1 = (ap && Array.isArray(ap.params) && ap.params[1] != null && ap.params[1] > 0) ? ap.params[1] : rawP0;
              const p0In = gbr.toInches(rawP0);
              const p1In = gbr.toInches(rawP1);
              const cx = txIn(gbr.toInches(cmd.x), mirror);
              const cy = tyIn(gbr.toInches(cmd.y));
              const flashRotDeg = (((cmd.rotDeg || 0) + ((ap && ap.rotDeg) || 0)) % 360 + 360) % 360;
              const isRot90 = Math.abs((flashRotDeg % 180) - 90) < 1.0;
              const effP0In = isRot90 ? p1In : p0In;
              const effP1In = isRot90 ? p0In : p1In;
              if (!ap || ap.type === 'C' || ap.type === 'P') {
                const rad = Math.max(0.18, (p0In / 2) * scale);
                if (renderMode === 'outline' || renderMode === 'skeleton') {
                  page.drawCircle({ x: cx, y: cy, size: rad, borderColor: pCol, borderWidth: 0.35 });
                } else {
                  page.drawCircle({ x: cx, y: cy, size: rad, color: pCol });
                }
              } else if (ap.type === 'O' && renderMode === 'fill' && roundCap !== undefined) {
                const w = Math.max(0.35, effP0In * scale);
                const h = Math.max(0.35, effP1In * scale);
                if (w >= h) {
                  const dx = (w - h) / 2;
                  page.drawLine({ start: { x: cx - dx, y: cy }, end: { x: cx + dx, y: cy }, thickness: h, color: pCol, lineCap: roundCap });
                } else {
                  const dy = (h - w) / 2;
                  page.drawLine({ start: { x: cx, y: cy - dy }, end: { x: cx, y: cy + dy }, thickness: w, color: pCol, lineCap: roundCap });
                }
              } else {
                const w = Math.max(0.35, effP0In * scale);
                const h = Math.max(0.35, effP1In * scale);
                if (renderMode === 'outline' || renderMode === 'skeleton') {
                  page.drawRectangle({ x: cx - w / 2, y: cy - h / 2, width: w, height: h, borderColor: pCol, borderWidth: 0.35 });
                } else {
                  page.drawRectangle({ x: cx - w / 2, y: cy - h / 2, width: w, height: h, color: pCol });
                }
              }
            }
          }
        }

        if (drl) {
          const holeCol = renderMode === 'fill' ? hexToRgb(theme.hole, [0.02, 0.04, 0.02]) : rgb(0.92, 0.70, 0.03);
          const ringCol = rgb(0.92, 0.70, 0.03);
          if (Array.isArray(drl.slots)) {
            for (const s of drl.slots) {
              const x1 = txIn(drl.toInches(s.x1), mirror), y1 = tyIn(drl.toInches(s.y1));
              const x2 = txIn(drl.toInches(s.x2), mirror), y2 = tyIn(drl.toInches(s.y2));
              const w = Math.max(1.5, drl.toInches(s.diameter) * scale);
              page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: w, color: ringCol });
            }
          }
          if (Array.isArray(drl.hits)) {
            for (const h of drl.hits) {
              const cx = txIn(drl.toInches(h.x), mirror);
              const cy = tyIn(drl.toInches(h.y));
              const rad = Math.max(1.2, (drl.toInches(h.diameter) / 2) * scale);
              if (renderMode === 'outline' || renderMode === 'skeleton') {
                page.drawCircle({ x: cx, y: cy, size: rad, borderColor: ringCol, borderWidth: 1.0 });
              } else {
                page.drawCircle({ x: cx, y: cy, size: rad, color: holeCol, borderColor: ringCol, borderWidth: options.showDrillRings !== false ? 0.8 : 0 });
              }
            }
          }
        }

        if (ipc && Array.isArray(ipc.records)) {
          const hlNet = options.highlightNet || null;
          for (const rec of ipc.records) {
            const isHl = hlNet && rec.net === hlNet;
            if (!isHl && gbr && gbr.commands && gbr.commands.length) continue;
            const cx = txIn(rec.xIn, mirror);
            const cy = tyIn(rec.yIn);
            const rad = Math.max(2.5, (Math.max(rec.holeDiaIn || 0.025, rec.rectWIn || 0.025) / 2) * scale);
            page.drawCircle({
              x: cx,
              y: cy,
              size: rad,
              borderColor: rgb(0.22, 0.74, 0.97),
              borderWidth: isHl ? 1.8 : 0.9
            });
          }
        }
      }

      // Layer badge in top-left margin (outside board bounds so it never causes false A/B diff inside the board)
      if (options.drawLayerHeader) {
        const hdr = String(slide.title || `Layer ${sIdx + 1}`).replace(/[^\x20-\x7e]/g, ' ');
        page.drawText(hdr.slice(0, 90), { x: 12, y: pageH - 16, size: 8.5, font: fontBold, color: rgb(0.58, 0.64, 0.72) });
      }
    }

    const savedBytes = await doc.save();
    if (_vectorStackPdfCache.size >= 6) {
      const oldestKey = _vectorStackPdfCache.keys().next().value;
      _vectorStackPdfCache.delete(oldestKey);
    }
    _vectorStackPdfCache.set(cacheSig, savedBytes);
    return savedBytes;
  }

  return {
    resolveGerberArc,
    GerberParser,
    ExcellonParser,
    IPCD356Parser,
    PCBRenderer,
    CAMCompare,
    CAMJobStack,
    layersToVectorPDFBytes,
    isCAMFileName,
    PCB_THEMES,
    IPC_DFM_RULES,
    UnitConverter,
    detectLayerType
  };
});
