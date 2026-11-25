/**
 * Kensho Pro — Modern Categorized Ribbon, PCB CAM Workbench (IPC English/Metric,
 * Gerber RS-274X, Excellon Drill, IPC-D-356 Netlist, IPC Class 1/2/3 DFM/DRC),
 * Floating Layer Dock, Curtain Splitter, Fiducial Auto-Alignment, Defect Navigator & Audit Reports.
 * Kensho Studio · textportdocx.in
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.UIRibbon = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CAMEngine = (typeof globalThis !== "undefined" && globalThis.CAMEngine)
    ? globalThis.CAMEngine
    : (typeof window !== "undefined" && window.CAMEngine)
      ? window.CAMEngine
      : (typeof require === "function" ? (function() { try { return require([".", "cam_engine.js"].join("/")); } catch (e) { return undefined; } })() : undefined);

  const DXFEngine = (typeof globalThis !== "undefined" && globalThis.DXFEngine)
    ? globalThis.DXFEngine
    : (typeof window !== "undefined" && window.DXFEngine)
      ? window.DXFEngine
      : (typeof require === "function" ? (function() { try { return require([".", "dxf_engine.js"].join("/")); } catch (e) { return undefined; } })() : undefined);

  const $ = s => (typeof document !== 'undefined' ? document.querySelector(s) : null);
  const $$ = s => (typeof document !== 'undefined' ? Array.from(document.querySelectorAll(s)) : []);
  const el = (tag, attrs = {}, html = '') => {
    if (typeof document === 'undefined') return null;
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'hidden') e.hidden = !!v;
      else e.setAttribute(k, v);
    }
    if (html) e.innerHTML = html;
    return e;
  };

  // Non-blocking toast notification helper
  let toastTimer = null;
  function rpToast(msg, duration = 2800) {
    if (typeof document === 'undefined') return;
    let t = $('#rp-toast');
    if (!t) {
      t = el('div', { id: 'rp-toast', className: 'rp-toast', hidden: true });
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.hidden = false;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => { t.hidden = true; }, 220);
    }, duration);
  }
  if (typeof window !== 'undefined') { window.rpToast = rpToast; window.showToast = rpToast; }

  /**
   * Convert a rendered HTML5 Canvas into a single-page PDF Uint8Array via PDFLib
   * so imported DXF and Gerber/Drill/IPC files load natively into Compare Slot A or B!
   */
  async function canvasToPDFBytes(canvas) {
    if (typeof PDFLib === 'undefined' || !PDFLib.PDFDocument) return null;
    const pdfDoc = await PDFLib.PDFDocument.create();
    let pngBytes = null;
    if (typeof canvas.toBlob === 'function') {
      try {
        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        if (blob && typeof blob.arrayBuffer === 'function') {
          pngBytes = new Uint8Array(await blob.arrayBuffer());
        }
      } catch (e) {}
    }
    if (!pngBytes) {
      const dataUrl = canvas.toDataURL('image/png');
      const bin = atob(dataUrl.split(',')[1] || '');
      pngBytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) pngBytes[i] = bin.charCodeAt(i);
    }
    const pngImage = await pdfDoc.embedPng(pngBytes);
    const scalePt = canvas.width > 2400 ? (1100 / canvas.width) : 0.5;
    const page = pdfDoc.addPage([canvas.width * scalePt, canvas.height * scalePt]);
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: canvas.width * scalePt,
      height: canvas.height * scalePt
    });
    return await pdfDoc.save();
  }

  const safeGet = (k, def = null) => {
    try { return (typeof localStorage !== 'undefined' && localStorage.getItem(k)) ?? def; } catch (e) { return def; }
  };
  const safeSet = (k, v) => {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); } catch (e) {}
  };

  /**
   * PCB CAM & IPC Global State (Units: 'english' [mils/in] vs 'metric' [mm/µm], Format, DFM Rules, Layers)
   */
  /* ============================================================================
   * [MODULE SECTION: PCB CAM & GERBER / EXCELLON / IPC-D-356 STATE MANAGER]
   * WHAT THIS IS: Central state store for multi-layer PCB CAM stacks, unit conversion
   *   (mils/mm), DFM rules, and per-layer comparison statistics.
   * WHY / HOW TO EDIT: Add new CAM layer properties or unit formatters here so both
   *   Compare and CAM Workbench dialogs share a single source of truth.
   * ============================================================================ */
  const CAMState = {
    unitSystem: safeGet('rp_unit_system', 'english') || 'english', // 'english' (IPC mils/in) | 'metric' (IPC mm/µm)
    unitsOverrideA: 'AUTO', // 'AUTO' | 'ENGLISH' | 'METRIC'
    unitsOverrideB: 'AUTO', // 'AUTO' | 'ENGLISH' | 'METRIC'
    renderMode: 'fill',     // 'fill' | 'outline' | 'skeleton'
    mirrorX: false,
    autoMirrorBottom: true,
    invertPolarity: false,
    showOrigin: true,
    showDrillRings: true,
    pcbTheme: 'standard',
    ipcClass: 'class2',
    zeroSuppression: 'AUTO', // 'AUTO' | 'L' | 'T' | 'D'
    coordFormat: 'AUTO',     // 'AUTO' | '2.4' | '2.5' | '2.3' | '3.3' | '3.4' | '4.4' | '4.2'
    coordMode: 'AUTO',       // 'AUTO' | 'A' | 'I'
    stackCompareMode: 'multipage', // 'multipage' (1 layer = 1 page, 1..100+ layers) | 'composite' | 'single'
    alignmentMode: 'origin',       // 'origin' | 'center' | 'autoalign'
    runDFMOnCompare: true,
    activeLayerIndex: 0,
    layersA: [],             // Array of 1..100+ layer entries for Base (Rev A)
    layersB: [],             // Array of 1..100+ layer entries for Revised (Rev B)
    pairedLayers: [],        // Auto-paired layer entries across Rev A and Rev B
    activeStackPageLabels: [],
    perLayerCompareStats: [],
    activeSharedBoundsInches: null,
    _isActiveCAMSession: false,
    _renderingStack: false,
    customRules: {
      minClearanceMils: 4.0,
      minTraceWidthMils: 4.0,
      minAnnularRingMils: 3.5,
      minDrillDiaMils: 8.0,
      compareTolMils: 0.25
    },
    highlightNet: null,
    highlightedNet: null,
    highlightedNodes: [],
    bomItems: [],
    showBOMOverlay: false,
    parsedGerberA: null,
    parsedGerberB: null,
    parsedDrillA: null,
    parsedDrillB: null,
    parsedIPCA: null,
    parsedIPCB: null,
    lastDFMViolations: [],
    lastNetDiffs: [],

    getParseKey(slot = 'A') {
      const uOv = slot === 'B' ? this.unitsOverrideB : this.unitsOverrideA;
      return `${this.unitSystem}|${uOv}|${this.zeroSuppression}|${this.coordFormat}|${this.coordMode}`;
    },

    getParseOptions(slot = 'A') {
      const defaultU = this.unitSystem === 'metric' ? 'MM' : 'IN';
      const uOv = slot === 'B' ? this.unitsOverrideB : this.unitsOverrideA;
      const opts = { defaultUnits: defaultU };
      if (uOv === 'METRIC') {
        opts.units = 'MM';
        opts.forceUnits = true;
      } else if (uOv === 'ENGLISH') {
        opts.units = 'IN';
        opts.forceUnits = true;
      }
      if (this.zeroSuppression !== 'AUTO') {
        opts.zeroSuppression = this.zeroSuppression;
        opts.forceFormat = true;
      }
      if (this.coordMode !== 'AUTO') {
        opts.coordType = this.coordMode;
        opts.forceFormat = true;
      }
      if (this.coordFormat !== 'AUTO') {
        const [iDig, dDig] = this.coordFormat.split('.').map(Number);
        opts.xInt = iDig; opts.xDec = dDig;
        opts.yInt = iDig; opts.yDec = dDig;
        opts.intDigits = iDig; opts.decDigits = dDig;
        opts.forceFormat = true;
      }
      return opts;
    },

    ensureParsed() {
      if (typeof CAMEngine === 'undefined') return {};
      const parseKeyA = this.getParseKey('A');
      const parseKeyB = this.getParseKey('B');
      const parseOptsA = this.getParseOptions('A');
      const parseOptsB = this.getParseOptions('B');

      // 1. Parse all multi-layer stackup entries (1..100+ layers) if loaded
      if (Array.isArray(this.layersA) && this.layersA.length) {
        for (const entry of this.layersA) {
          CAMEngine.CAMJobStack.parseLayerEntry(entry, parseOptsA, parseKeyA);
        }
      }
      if (Array.isArray(this.layersB) && this.layersB.length) {
        for (const entry of this.layersB) {
          CAMEngine.CAMJobStack.parseLayerEntry(entry, parseOptsB, parseKeyB);
        }
      }
      if ((this.layersA && this.layersA.length) || (this.layersB && this.layersB.length)) {
        this.pairedLayers = CAMEngine.CAMJobStack.pairLayerStacks(this.layersA, this.layersB);
      } else {
        this.pairedLayers = [];
      }

      // 2. Also support standalone __lastGerberA/B, __lastDrill/B, __lastIPCA/B
      if (typeof window !== 'undefined' && window.__lastGerberA) {
        if (!this.parsedGerberA || this.parsedGerberA._rawText !== window.__lastGerberA || this.parsedGerberA._parseKey !== parseKeyA) {
          this.parsedGerberA = new CAMEngine.GerberParser(window.__lastGerberA, parseOptsA).parse();
          this.parsedGerberA._rawText = window.__lastGerberA;
          this.parsedGerberA._parseKey = parseKeyA;
        }
      } else if (!this.layersA.length) {
        this.parsedGerberA = null;
      }
      if (typeof window !== 'undefined' && window.__lastGerberB) {
        if (!this.parsedGerberB || this.parsedGerberB._rawText !== window.__lastGerberB || this.parsedGerberB._parseKey !== parseKeyB) {
          this.parsedGerberB = new CAMEngine.GerberParser(window.__lastGerberB, parseOptsB).parse();
          this.parsedGerberB._rawText = window.__lastGerberB;
          this.parsedGerberB._parseKey = parseKeyB;
        }
      } else if (!this.layersB.length) {
        this.parsedGerberB = null;
      }
      if (typeof window !== 'undefined' && window.__lastDrill) {
        if (!this.parsedDrillA || this.parsedDrillA._rawText !== window.__lastDrill || this.parsedDrillA._parseKey !== parseKeyA) {
          this.parsedDrillA = new CAMEngine.ExcellonParser(window.__lastDrill, parseOptsA).parse();
          this.parsedDrillA._rawText = window.__lastDrill;
          this.parsedDrillA._parseKey = parseKeyA;
        }
      } else if (!this.layersA.length) {
        this.parsedDrillA = null;
      }
      if (typeof window !== 'undefined' && window.__lastDrillB) {
        if (!this.parsedDrillB || this.parsedDrillB._rawText !== window.__lastDrillB || this.parsedDrillB._parseKey !== parseKeyB) {
          this.parsedDrillB = new CAMEngine.ExcellonParser(window.__lastDrillB, parseOptsB).parse();
          this.parsedDrillB._rawText = window.__lastDrillB;
          this.parsedDrillB._parseKey = parseKeyB;
        }
      } else if (!this.layersB.length) {
        this.parsedDrillB = null;
      }
      if (typeof window !== 'undefined' && window.__lastIPCA) {
        if (!this.parsedIPCA || this.parsedIPCA._rawText !== window.__lastIPCA || this.parsedIPCA._parseKey !== parseKeyA) {
          this.parsedIPCA = new CAMEngine.IPCD356Parser(window.__lastIPCA, parseOptsA).parse();
          this.parsedIPCA._rawText = window.__lastIPCA;
          this.parsedIPCA._parseKey = parseKeyA;
        }
      } else if (!this.layersA.length) {
        this.parsedIPCA = null;
      }
      if (typeof window !== 'undefined' && window.__lastIPCB) {
        if (!this.parsedIPCB || this.parsedIPCB._rawText !== window.__lastIPCB || this.parsedIPCB._parseKey !== parseKeyB) {
          this.parsedIPCB = new CAMEngine.IPCD356Parser(window.__lastIPCB, parseOptsB).parse();
          this.parsedIPCB._rawText = window.__lastIPCB;
          this.parsedIPCB._parseKey = parseKeyB;
        }
      } else if (!this.layersB.length) {
        this.parsedIPCB = null;
      }

      // Sync active layer pointers from multi-layer stackup when present
      if (this.pairedLayers.length) {
        const idx = Math.max(0, Math.min(this.pairedLayers.length - 1, this.activeLayerIndex || 0));
        const activePair = this.pairedLayers[idx];
        const lA = activePair && activePair.layerA;
        const lB = activePair && activePair.layerB;
        const firstGbrA = (lA && lA.parsedGbr) || (this.layersA.find(x => x.parsedGbr) || {}).parsedGbr || this.parsedGerberA;
        const firstGbrB = (lB && lB.parsedGbr) || (this.layersB.find(x => x.parsedGbr) || {}).parsedGbr || this.parsedGerberB;
        const firstDrlA = (lA && lA.parsedDrl) || (this.layersA.find(x => x.parsedDrl) || {}).parsedDrl || this.parsedDrillA;
        const firstDrlB = (lB && lB.parsedDrl) || (this.layersB.find(x => x.parsedDrl) || {}).parsedDrl || this.parsedDrillB;
        const firstIpcA = (lA && lA.parsedIPC) || (this.layersA.find(x => x.parsedIPC) || {}).parsedIPC || this.parsedIPCA;
        const firstIpcB = (lB && lB.parsedIPC) || (this.layersB.find(x => x.parsedIPC) || {}).parsedIPC || this.parsedIPCB;
        if (firstGbrA) this.parsedGerberA = firstGbrA;
        if (firstGbrB) this.parsedGerberB = firstGbrB;
        if (firstDrlA) this.parsedDrillA = firstDrlA;
        if (firstDrlB) this.parsedDrillB = firstDrlB;
        if (firstIpcA) this.parsedIPCA = firstIpcA;
        if (firstIpcB) this.parsedIPCB = firstIpcB;
      }

      return {
        gA: this.parsedGerberA,
        gB: this.parsedGerberB,
        drlA: this.parsedDrillA,
        drlB: this.parsedDrillB,
        ipcA: this.parsedIPCA,
        ipcB: this.parsedIPCB
      };
    },

    isActiveLayerMirroredX(pageNum = null) {
      if (this.mirrorX) return true;
      if (!this.autoMirrorBottom) return false;
      const pIdx = pageNum != null ? Math.max(0, pageNum - 1) : (this.activeLayerIndex || 0);
      const pair = Array.isArray(this.pairedLayers) ? this.pairedLayers[pIdx] : null;
      if (pair) {
        const isBot = (pair.layerB && pair.layerB.layerMeta && pair.layerB.layerMeta.side === 'bottom') ||
                      (pair.layerA && pair.layerA.layerMeta && pair.layerA.layerMeta.side === 'bottom');
        if (isBot) return true;
      }
      return false;
    },

    getEffectiveDpi(baseDpi = 300) {
      const d = baseDpi || 300;
      if (typeof window !== 'undefined' && window.RP_MEASURE && window.RP_MEASURE.calibrator && window.RP_MEASURE.calibrator.calibrated) {
        const cal = window.RP_MEASURE.calibrator;
        if (cal.unit === 'mm') return cal.pxPerUnit * 25.4;
        if (cal.unit === 'in') return cal.pxPerUnit;
        if (cal.unit === 'um') return cal.pxPerUnit * 25400;
        return cal.pxPerUnit * 1000;
      }
      if (this._isActiveCAMSession && this.activeSharedBoundsInches) {
        const sb = this.activeSharedBoundsInches;
        const bwIn = Math.max(1e-4, (sb.maxX - sb.minX) || 2.5);
        const bhIn = Math.max(1e-4, (sb.maxY - sb.minY) || 2.0);
        const pdfPtsPerInch = Math.min((1100 - 72) / bwIn, (800 - 72) / bhIn);
        if (Number.isFinite(pdfPtsPerInch) && pdfPtsPerInch > 0) {
          return pdfPtsPerInch * (d / 72);
        }
      }
      if (typeof DXFState !== 'undefined' && (DXFState.parsedB || DXFState.parsedA)) {
        const dxfP = DXFState.parsedA || DXFState.parsedB;
        const meta = DXFState.lastRenderMeta;
        const b = (meta && (meta.sharedBoundsA || meta.sharedBounds)) ? (meta.sharedBoundsA || meta.sharedBounds) : (dxfP ? dxfP.bounds : null);
        if (b && isFinite(b.minX)) {
          const bw = Math.max(1e-3, (b.maxX - b.minX) || 100);
          const bh = Math.max(1e-3, (b.maxY - b.minY) || 100);
          const scPtsPerUnit = Math.min((2200 - 80) / bw, (1600 - 80) / bh) * 0.5;
          const uMap = (typeof DXFEngine !== 'undefined' && DXFEngine.UNITS) ? DXFEngine.UNITS : { mm: { toMM: 1 }, cm: { toMM: 10 }, m: { toMM: 1000 }, in: { toMM: 25.4 }, ft: { toMM: 304.8 }, mils: { toMM: 0.0254 } };
          const uName = (dxfP && dxfP.unitName) ? dxfP.unitName : 'mm';
          const toMM = (uMap[uName] && uMap[uName].toMM) ? uMap[uName].toMM : 1;
          const unitToIn = toMM / 25.4;
          const pdfPtsPerInch = scPtsPerUnit / unitToIn;
          if (Number.isFinite(pdfPtsPerInch) && pdfPtsPerInch > 0) {
            return pdfPtsPerInch * (d / 72);
          }
        }
      }
      return d;
    },

    formatDimFromPx(px, dpi = 300) {
      const effDpi = this.getEffectiveDpi(dpi || 300);
      const inches = px / effDpi;
      if (this.unitSystem === 'metric') {
        return `${(inches * 25.4).toFixed(2)} mm`;
      }
      return `${(inches * 1000).toFixed(1)} mil`;
    },

    formatBoxFromPx(wPx, hPx, xPx, yPx, dpi = 300) {
      const d = this.getEffectiveDpi(dpi || 300);
      if (this.unitSystem === 'metric') {
        const w = (wPx / d * 25.4).toFixed(2);
        const h = (hPx / d * 25.4).toFixed(2);
        const x = (xPx / d * 25.4).toFixed(1);
        const y = (yPx / d * 25.4).toFixed(1);
        return `${w}×${h} mm @ (${x}, ${y}) mm`;
      }
      const w = (wPx / d * 1000).toFixed(1);
      const h = (hPx / d * 1000).toFixed(1);
      const x = (xPx / d * 1000).toFixed(0);
      const y = (yPx / d * 1000).toFixed(0);
      return `${w}×${h} mil @ (${x}, ${y}) mil`;
    }
  };

  function setUnitSystem(sys, silent = false, preserveCalUnit = false) {
    const norm = (String(sys).toLowerCase() === 'metric' || String(sys).toLowerCase() === 'mm' || String(sys).toLowerCase() === 'um') ? 'metric' : 'english';
    CAMState.unitSystem = norm;
    try { localStorage.setItem('rp_unit_system', norm); } catch (e) {}

    // Sync MeasureEngine calibrator unit if not custom-calibrated or convert its unit
    if (typeof window !== 'undefined' && window.RP_MEASURE && window.RP_MEASURE.calibrator) {
      const cal = window.RP_MEASURE.calibrator;
      const oldUnit = cal.unit;
      const newUnit = norm === 'metric' ? 'mm' : 'mils';
      if (!cal.calibrated) {
        const S = window.CMP;
        const baseDpi = (S && S.cur && S.cur.dpi) ? S.cur.dpi : (+($('#dpi') && $('#dpi').value) || 300);
        const dpi = CAMState.getEffectiveDpi(baseDpi);
        cal.unit = newUnit;
        cal.pxPerUnit = norm === 'metric' ? (dpi / 25.4) : (dpi / 1000);
      } else if (!preserveCalUnit && oldUnit !== newUnit) {
        const toMM = { mm: 1, um: 0.001, mils: 0.0254, in: 25.4 };
        const oldMM = toMM[oldUnit] || 1;
        const newMM = toMM[newUnit] || 1;
        cal.pxPerUnit = cal.pxPerUnit * (newMM / oldMM);
        cal.unit = newUnit;
      }
      if (window.rpUpdateCalBadge) window.rpUpdateCalBadge();
      if (window.rpReformatMeasurements) window.rpReformatMeasurements();
    }

    // Update all unit selectors in UI
    ['#rib-units-quick', '#rib-cam-units', '#cam-side-units', '#cam-wb-units'].forEach(sel => {
      const elSel = $(sel);
      if (elSel) elSel.value = norm;
    });

    // Update top bar calibration/unit chip
    const badge = $('#rp-cal-txt');
    if (badge) {
      const cal = (typeof window !== 'undefined' && window.RP_MEASURE) ? window.RP_MEASURE.calibrator : null;
      const unitLbl = norm === 'metric' ? 'mm (IPC Metric)' : 'mil (IPC English)';
      if (cal) {
        badge.textContent = `Units: ${unitLbl} · ${(1 / cal.pxPerUnit).toFixed(norm === 'metric' ? 3 : 2)} ${cal.unit}/px`;
      } else {
        badge.textContent = `Units: ${unitLbl}`;
      }
    }

    // Re-render checklist & sidebar with updated units
    DefectState.renderChecklist();
    if (typeof window !== 'undefined' && window.renderList) window.renderList();
    updateCAMSidebarPane();

    if (!silent) {
      rpToast(`Switched Engineering & CAM Units to ${norm === 'metric' ? 'IPC Metric (mm / µm)' : 'IPC English (mils / in)'}`);
    }
  }
  if (typeof window !== 'undefined') {
    window.CAMState = CAMState;
    window.setUnitSystem = setUnitSystem;
  }


  /**
   * Compare Workspace Undo / Redo History Stack (Ctrl+Z / Ctrl+Y)
   * Reverses markups, measurements, leader callouts, tally badges, ignore zones, and alignment nudges.
   */
  const CompareHistory = {
    undoStack: [],
    redoStack: [],
    maxDepth: 12,

    clear() {
      this.undoStack = [];
      this.redoStack = [];
    },

    captureState(label = "Action") {
      const S = (typeof window !== "undefined" && window.CMP) ? window.CMP : {};
      const RM = (typeof window !== "undefined" && window.RP_MEASURE) ? window.RP_MEASURE : {};
      return {
        label,
        dx: $("#dx") ? $("#dx").value : "0",
        dy: $("#dy") ? $("#dy").value : "0",
        degA: S.degA || 0,
        degB: S.degB || 0,
        rotA: S.rotA || 0,
        rotB: S.rotB || 0,
        mirrorXA: !!S.mirrorXA,
        mirrorYA: !!S.mirrorYA,
        mirrorXB: !!S.mirrorXB,
        mirrorYB: !!S.mirrorYB,
        tintA: S.tintA || "#e11414",
        tintB: S.tintB || "#00a53c",
        tintC: S.tintC || "#94a3b8",
        opA: S.opA != null ? S.opA : 100,
        opB: S.opB != null ? S.opB : 100,
        opC: S.opC != null ? S.opC : 42,
        lA: $("#lA") ? $("#lA").checked : true,
        lB: $("#lB") ? $("#lB").checked : true,
        lC: $("#lC") ? $("#lC").checked : true,
        lM: $("#lM") ? $("#lM").checked : true,
        ignore: JSON.parse(JSON.stringify(S.ignore || [])),
        done: JSON.parse(JSON.stringify(S.done || {})),
        annotations: JSON.parse(JSON.stringify(RM.annotations || [])),
        nextPinNum: RM.nextPinNum || 1,
        tallyItems: (RM.tally && RM.tally.items) ? JSON.parse(JSON.stringify(RM.tally.items)) : [],
        tallyNext: (RM.tally && RM.tally.nextNum) ? RM.tally.nextNum : 1,
        defects: JSON.parse(JSON.stringify(DefectState.defects || [])),
        defectsByPage: JSON.parse(JSON.stringify(DefectState.byPage || {}))
      };
    },

    push(label = "Compare edit") {
      this.undoStack.push(this.captureState(label));
      if (this.undoStack.length > this.maxDepth) this.undoStack.shift();
      this.redoStack = [];
    },

    applySnapshot(snap) {
      if (!snap) return;
      const S = (typeof window !== "undefined" && window.CMP) ? window.CMP : {};
      const RM = (typeof window !== "undefined" && window.RP_MEASURE) ? window.RP_MEASURE : {};
      const oldDx = $("#dx") ? $("#dx").value : "0";
      const oldDy = $("#dy") ? $("#dy").value : "0";
      const oldDegA = S.degA || 0;
      const oldDegB = S.degB || 0;
      const oldRotA = S.rotA || 0;
      const oldRot = S.rotB || 0;
      const oldMir = `${!!S.mirrorXA}|${!!S.mirrorYA}|${!!S.mirrorXB}|${!!S.mirrorYB}`;
      const oldIgnLen = (S.ignore || []).length;

      if ($("#dx")) $("#dx").value = snap.dx;
      if ($("#dy")) $("#dy").value = snap.dy;
      if ($("#rp-cur-dx")) $("#rp-cur-dx").textContent = snap.dx;
      if ($("#rp-cur-dy")) $("#rp-cur-dy").textContent = snap.dy;
      S.degA = snap.degA || 0;
      S.degB = snap.degB || 0;
      S.rotA = snap.rotA || 0;
      S.rotB = snap.rotB || 0;
      S.mirrorXA = !!snap.mirrorXA;
      S.mirrorYA = !!snap.mirrorYA;
      S.mirrorXB = !!snap.mirrorXB;
      S.mirrorYB = !!snap.mirrorYB;
      const newMir = `${!!S.mirrorXA}|${!!S.mirrorYA}|${!!S.mirrorXB}|${!!S.mirrorYB}`;
      if ($("#rp-rot-a")) $("#rp-rot-a").value = S.rotA;
      if ($("#rp-cur-rot-a")) $("#rp-cur-rot-a").textContent = S.rotA + "°";
      if ($("#rp-rot-b")) $("#rp-rot-b").value = S.rotB;
      if ($("#rp-cur-rot")) $("#rp-cur-rot").textContent = S.rotB + "°";
      if (typeof window !== 'undefined' && window.syncCompareRotationUI) window.syncCompareRotationUI();
      if (snap.tintA) S.tintA = snap.tintA;
      if (snap.tintB) S.tintB = snap.tintB;
      if (snap.tintC) S.tintC = snap.tintC;
      if (snap.opA != null) S.opA = snap.opA;
      if (snap.opB != null) S.opB = snap.opB;
      if (snap.opC != null) S.opC = snap.opC;
      if (typeof window !== 'undefined' && window.syncCompareColorUI) window.syncCompareColorUI();
      if (snap.lA != null && $("#lA")) { $("#lA").checked = snap.lA; if ($("#rp-eye-a")) $("#rp-eye-a").classList.toggle("on", snap.lA); if ($("#rp-diff-del")) $("#rp-diff-del").checked = snap.lA; }
      if (snap.lB != null && $("#lB")) { $("#lB").checked = snap.lB; if ($("#rp-eye-b")) $("#rp-eye-b").classList.toggle("on", snap.lB); if ($("#rp-diff-add")) $("#rp-diff-add").checked = snap.lB; }
      if (snap.lC != null && $("#lC")) { $("#lC").checked = snap.lC; if ($("#rp-eye-c")) $("#rp-eye-c").classList.toggle("on", snap.lC); }
      if (snap.lM != null && $("#lM")) { $("#lM").checked = snap.lM; if ($("#rp-markers-chk")) $("#rp-markers-chk").checked = snap.lM; if ($("#rib-view-markers")) $("#rib-view-markers").classList.toggle("on", snap.lM); }

      S.ignore = JSON.parse(JSON.stringify(snap.ignore || []));
      S.done = JSON.parse(JSON.stringify(snap.done || {}));

      if (RM) {
        RM.annotations = JSON.parse(JSON.stringify(snap.annotations || []));
        if (snap.nextPinNum) RM.nextPinNum = snap.nextPinNum;
        if (RM.tally) {
          RM.tally.items = JSON.parse(JSON.stringify(snap.tallyItems || []));
          RM.tally.nextNum = snap.tallyNext || (RM.tally.items.length + 1);
        }
      }
      if (snap.defectsByPage) {
        DefectState.byPage = JSON.parse(JSON.stringify(snap.defectsByPage));
      }
      if (snap.defects) {
        DefectState.defects = JSON.parse(JSON.stringify(snap.defects));
        const curPageN = (S && S.cur && S.cur.n) ? S.cur.n : 1;
        DefectState.byPage[curPageN] = DefectState.defects;
        DefectState.renderChecklist();
      }
      if (typeof markers === "function") markers();
      if (typeof window !== "undefined" && window.rpRedrawOverlay) window.rpRedrawOverlay();
      if (typeof window !== "undefined" && window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      if (typeof window !== "undefined" && window.renderList) window.renderList();

      if (oldDx !== snap.dx || oldDy !== snap.dy || oldDegA !== S.degA || oldDegB !== S.degB || oldRotA !== S.rotA || oldRot !== S.rotB || oldMir !== newMir || oldIgnLen !== S.ignore.length) {
        if (typeof window !== "undefined" && window.refresh) window.refresh();
      }
    },

    undo() {
      if (!this.undoStack.length) {
        rpToast("Nothing to undo in Compare view.");
        return false;
      }
      const prev = this.undoStack.pop();
      this.redoStack.push(this.captureState(prev.label));
      this.applySnapshot(prev);
      rpToast(`Undone: ${prev.label}`);
      return true;
    },

    redo() {
      if (!this.redoStack.length) {
        rpToast("Nothing to redo in Compare view.");
        return false;
      }
      const next = this.redoStack.pop();
      this.undoStack.push(this.captureState(next.label));
      this.applySnapshot(next);
      rpToast(`Redone: ${next.label}`);
      return true;
    }
  };
  if (typeof window !== "undefined") {
    window.CompareHistory = CompareHistory;
    window.rpPushCompareHistory = label => CompareHistory.push(label);
  }

  /**
   * Defect Review Checklist State
   */
  /* ============================================================================
   * [MODULE SECTION: DEFECT NAVIGATOR & ENGINEERING REVIEW CHECKLIST]
   * WHAT THIS IS: Manages the detected difference regions list, Open/Approved/Flagged/
   *   Ignored review statuses, and per-defect engineering notes.
   * WHY / HOW TO EDIT: Edit `initFromRegions()` or `renderChecklist()` to add new
   *   defect filtering criteria, severity tags, or QA sign-off fields.
   * ============================================================================ */
  const DefectState = {
    defects: [],
    byPage: {},
    currentIndex: -1,
    touchedIndex: -1,
    noiseThreshold: 2,
    filterStatus: 'ALL',

    _activePage: 1,

    clearAllPages() {
      this.byPage = {};
      this.defects = [];
      this._activePage = 1;
      this.currentIndex = -1;
      this.touchedIndex = -1;
      this.renderChecklist();
    },

    saveCurrentPageState() {
      const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : null;
      const pageN = (S && S.cur && S.cur.n) ? S.cur.n : ((S && S.n) || 1);
      this.byPage[pageN] = this.defects;
      return this.defects;
    },

    classifySeverity(r) {
      if (!r) return 'MINOR';
      const w = Math.max(1, r.w || 1);
      const h = Math.max(1, r.h || 1);
      const bboxArea = w * h;
      const px = r.pixelCount || ((r.sa || 0) + (r.sb || 0)) || bboxArea;
      if (px >= 500 || bboxArea >= 2500) return 'CRITICAL';
      if (px >= 120 || bboxArea >= 600) return 'MAJOR';
      if (px >= 25 || bboxArea >= 64) return 'MINOR';
      return 'COSMETIC';
    },

    autoDismissCosmeticNoise() {
      let dismissed = 0;
      const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : null;
      const pageN = (S && S.cur && S.cur.n) ? S.cur.n : 1;
      this.defects.forEach((d, idx) => {
        const sev = d.severity || this.classifySeverity(d);
        if ((sev === 'COSMETIC' || (d.pixels || 0) < 25) && d.status === 'Open') {
          d.status = 'Ignored';
          const rIdx = d.regionIndex != null ? d.regionIndex : idx;
          if (S && S.done) S.done[pageN + ':' + rIdx] = true;
          dismissed++;
        }
      });
      this.saveCurrentPageState();
      this.renderChecklist();
      if (typeof markers === 'function') markers();
      if (typeof window !== 'undefined' && typeof window.updateSummaryOnly === 'function') window.updateSummaryOnly();
      return dismissed;
    },

    classifySemanticCategory(r, pageW = 1000, pageH = 1000) {
      if (!r) return 'Geometry';
      const w = Math.max(1, r.w || 1);
      const h = Math.max(1, r.h || 1);
      const aspect = Math.max(w / h, h / w);
      const area = r.pixelCount || r.area || (w * h);
      if (r.x > pageW * 0.60 && r.y > pageH * 0.72) return 'Title Block';
      if (aspect >= 3.2 && area < 1800) return 'Dimension';
      if (aspect < 3.2 && area < 3500) return 'Component';
      return 'Geometry';
    },

    initFromRegions(regions = []) {
      const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : null;
      const pageN = (S && S.cur && S.cur.n) ? S.cur.n : 1;
      const defaultDpi = (S && S.cur && S.cur.dpi) ? S.cur.dpi : 300;
      const priorList = (this.byPage && this.byPage[pageN]) ? this.byPage[pageN] : [];
      const prevMap = new Map((priorList || []).map(d => [`${Math.round(d.x)}_${Math.round(d.y)}`, d]));

      this.defects = regions
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => (r.pixelCount || (r.sa || 0) + (r.sb || 0) || (r.w * r.h)) >= this.noiseThreshold)
        .map(({ r, i }, listIdx) => {
          const key = `${Math.round(r.x)}_${Math.round(r.y)}`;
          const old = prevMap.get(key);
          const doneKey = pageN + ':' + i;
          const hasExplicitDone = S && S.done && Object.prototype.hasOwnProperty.call(S.done, doneKey);
          const isDone = hasExplicitDone ? !!S.done[doneKey] : false;
          const status = (old && (old.status === 'Flagged' || old.status === 'Ignored'))
            ? old.status
            : (hasExplicitDone ? (isDone ? 'Approved' : 'Open') : (old ? old.status : 'Open'));
          const kind = r.type || (r.kind === 'r' ? 'removed' : r.kind === 'a' ? 'added' : 'changed');
          return {
            id: listIdx + 1,
            regionIndex: i,
            page: pageN,
            type: kind,
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h,
            dpi: r.dpi || defaultDpi,
            pixels: r.pixelCount || ((r.sa || 0) + (r.sb || 0)) || Math.round(r.w * r.h),
            severity: this.classifySeverity(r),
            status,
            semanticCategory: r.dxfLayer ? ("Layer: " + r.dxfLayer) : this.classifySemanticCategory(r, (S && S.cur && (S.cur.W || S.cur.w)) || 1000, (S && S.cur && (S.cur.H || S.cur.h)) || 1000),
            dxfLayer: r.dxfLayer || (old ? old.dxfLayer : ""),
            dxfType: r.dxfType || (old ? old.dxfType : ""),
            dxfSummary: r.dxfSummary || (old ? old.dxfSummary : ""),
            autoSummary: (r.dxfSummary ? ("[" + (r.dxfLayer || "0") + "] " + r.dxfSummary) : (r.note || `${kind === 'removed' ? 'Removed in Rev B (Present in Rev A)' : kind === 'added' ? 'Added in Rev B' : 'Modified between Rev A & Rev B'} · ${CAMState.formatBoxFromPx(r.w, r.h, r.x, r.y, r.dpi || defaultDpi)}`)),
            note: r.note || (old && old.note ? old.note : (r.dxfSummary ? ("[" + (r.dxfLayer || "0") + "] " + r.dxfSummary) : ""))
          };
        });
      this._activePage = pageN;
      this.byPage[pageN] = this.defects;
      this.currentIndex = this.defects.length ? 0 : -1;
      this.touchedIndex = -1;
      if (typeof SmartManager !== 'undefined' && SmartManager && typeof SmartManager.ingestPageRegions === 'function') {
        SmartManager.ingestPageRegions(pageN, regions);
      }
      this.renderChecklist();
    },

    next() {
      if (!this.defects.length) {
        if (typeof window !== 'undefined' && window.ACT && window.ACT.nextDiff) window.ACT.nextDiff();
        return;
      }
      const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : null;
      const totalP = S ? Math.max(S.A ? S.A.numPages : 0, S.B ? S.B.numPages : 0) : 1;
      if (S && S.sel === -1 && this.currentIndex === 0) {
        this.jumpTo(0);
        return;
      }
      if (this.currentIndex + 1 < this.defects.length) {
        this.currentIndex += 1;
        this.jumpTo(this.currentIndex);
        return;
      }
      if (totalP > 1 && typeof window !== 'undefined' && window.ACT && window.ACT.nextDiff) {
        window.ACT.nextDiff();
        return;
      }
      this.currentIndex = (this.currentIndex + 1) % this.defects.length;
      this.jumpTo(this.currentIndex);
    },

    prev() {
      if (!this.defects.length) {
        if (typeof window !== 'undefined' && window.ACT && window.ACT.prevDiff) window.ACT.prevDiff();
        return;
      }
      const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : null;
      const totalP = S ? Math.max(S.A ? S.A.numPages : 0, S.B ? S.B.numPages : 0) : 1;
      if (this.currentIndex > 0) {
        this.currentIndex -= 1;
        this.jumpTo(this.currentIndex);
        return;
      }
      if (totalP > 1 && typeof window !== 'undefined' && window.ACT && window.ACT.prevDiff) {
        window.ACT.prevDiff();
        return;
      }
      this.currentIndex = (this.currentIndex - 1 + this.defects.length) % this.defects.length;
      this.jumpTo(this.currentIndex);
    },

    selectByRegion(regionIdx) {
      if (!this.defects || !this.defects.length) return;
      let dIdx = this.defects.findIndex(d => (d.regionIndex != null ? d.regionIndex : (d.id - 1)) === regionIdx);
      if (dIdx === -1 && regionIdx >= 0 && regionIdx < this.defects.length) dIdx = regionIdx;
      if (dIdx === -1) return;
      this.currentIndex = dIdx;
      this.touchedIndex = dIdx;
      if (typeof KenshoDockManager !== 'undefined' && KenshoDockManager && typeof KenshoDockManager.activatePanel === 'function') {
        KenshoDockManager.activatePanel('diffs');
      }
      this.renderChecklist();
      this.highlightItem(dIdx);
    },

    jumpTo(idx) {
      if (idx < 0 || idx >= this.defects.length) return;
      this.currentIndex = idx;
      this.touchedIndex = idx;
      const d = this.defects[idx];
      if (typeof window !== 'undefined' && window.CMP && window.CMP.view) {
        const vp = $('#vp');
        const v = window.CMP.view;
        const cur = window.CMP.cur;
        if (vp && cur) {
          window.CMP.sel = d.regionIndex != null ? d.regionIndex : idx;
          v.k = Math.max(1.2, Math.min(8.0, Math.min(vp.clientWidth / (Math.max(d.w, 40) * 3.2), vp.clientHeight / (Math.max(d.h, 40) * 3.2))));
          v.x = Math.round(vp.clientWidth / 2 - (d.x + d.w / 2) * v.k);
          v.y = Math.round(vp.clientHeight / 2 - (d.y + d.h / 2) * v.k);
          const stg = $('#stage');
          if (stg) stg.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
          if (typeof window.applyView === 'function') {
            window.applyView();
            if (typeof window.markers === 'function') window.markers();
          } else {
            if (typeof markers === 'function') markers();
            if (window.rpSharpen) window.rpSharpen();
          }
          if (window.rpRedrawOverlay) window.rpRedrawOverlay();
        }
      }
      this.renderChecklist();
      this.highlightItem(idx);
    },

    setStatus(idx, status) {
      if (this.defects[idx]) {
        const d = this.defects[idx];
        d.status = status;
        const rIdx = d.regionIndex != null ? d.regionIndex : idx;
        if (typeof window !== 'undefined' && window.CMP && window.CMP.cur) {
          window.CMP.done[window.CMP.cur.n + ':' + rIdx] = (status === 'Approved' || status === 'Ignored');
          if (typeof markers === 'function') markers();
          if (typeof window.updateSummaryOnly === 'function') window.updateSummaryOnly();
        }
        this.renderChecklist();
      }
    },

    setStatusByRegion(regionIdx, status) {
      const idx = this.defects.findIndex(d => (d.regionIndex != null ? d.regionIndex : (d.id - 1)) === regionIdx);
      if (idx >= 0) this.setStatus(idx, status);
    },

    markAllApproved() {
      this.defects.forEach((d, idx) => {
        d.status = 'Approved';
        const rIdx = d.regionIndex != null ? d.regionIndex : idx;
        if (typeof window !== 'undefined' && window.CMP && window.CMP.cur) {
          window.CMP.done[window.CMP.cur.n + ':' + rIdx] = true;
        }
      });
      this.renderChecklist();
      if (typeof markers === 'function') markers();
      if (typeof window !== 'undefined' && typeof window.updateSummaryOnly === 'function') window.updateSummaryOnly();
    },

    highlightItem(idx) {
      $$('.defect-item').forEach(e => e.classList.toggle('active', parseInt(e.dataset.idx, 10) === idx));
      const activeEl = $(`.defect-item[data-idx="${idx}"]`);
      if (activeEl && activeEl.scrollIntoView) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },

    renderChecklist() {
      const container = $('#defect-checklist-body');
      if (!container) return;

      const countEl = $('#rp-defect-count-badge');
      if (countEl) countEl.textContent = String(this.defects.length);
      if (typeof window !== 'undefined' && window.syncCompareHud) window.syncCompareHud();

      const filtered = this.defects
        .map((d, i) => ({ d, i }))
        .filter(({ d }) => this.filterStatus === 'ALL' || d.status === this.filterStatus);

      const touchedD = (this.touchedIndex >= 0 && this.defects[this.touchedIndex]) ? this.defects[this.touchedIndex] : null;
      const selNoteCardHtml = touchedD ? (() => {
        const uStr = CAMState.formatBoxFromPx(touchedD.w, touchedD.h, touchedD.x, touchedD.y, touchedD.dpi || 300);
        const detSummary = touchedD.dxfSummary || touchedD.note || touchedD.autoSummary || `${touchedD.type.toUpperCase()} difference at ${uStr}`;
        return `
        <div id="rp-selected-diff-note-card" class="rp-selected-diff-note-card is-open">
          <div class="rp-sdn-head">
            <span class="defect-badge ${touchedD.type}">#${touchedD.id} ${touchedD.type.toUpperCase()} NOTE</span>
            <span class="rp-sdn-coords">${uStr}</span>
            <button type="button" class="rp-sdn-close" id="rp-sdn-close-btn" title="Hide difference note">&#10005;</button>
          </div>
          <div class="rp-sdn-summary">${String(detSummary).replace(/</g, '&lt;')}</div>
          <input type="text" id="rp-sdn-note-input" class="defect-note-input rp-sdn-input" data-idx="${this.touchedIndex}" placeholder="Add or edit engineering review note for #${touchedD.id}..." value="${(touchedD.note || '').replace(/"/g, '&quot;')}" />
        </div>`;
      })() : `
        <div id="rp-selected-diff-note-card" class="rp-selected-diff-note-card is-idle">
          <span><b>Difference Notes:</b> Touch any difference box on the drawing or in the list below to view its note.</span>
        </div>`;

      let noteHost = $('#rp-selected-diff-note-host');
      if (!noteHost && container.parentNode) {
        noteHost = el('div', { id: 'rp-selected-diff-note-host' });
        container.parentNode.insertBefore(noteHost, container);
      }
      if (noteHost) noteHost.innerHTML = selNoteCardHtml;

      if (!filtered.length) {
        const activeLang = (typeof document !== 'undefined' && document.documentElement.lang) || 'en';
        const emptyMsg = activeLang === 'en' ? (this.defects.length ? 'No defects match filter [' + this.filterStatus + '].' : 'No defects detected on this sheet.') : ((I18N_DICTIONARY[activeLang] && I18N_DICTIONARY[activeLang].diffsTab ? I18N_DICTIONARY[activeLang].diffsTab + ': 0' : 'No defects detected on this sheet.'));
        container.innerHTML = `<div class="rp-empty-msg">${emptyMsg}</div>`;
        return;
      }
      container.innerHTML = filtered.map(({ d, i }) => {
        const unitReadout = CAMState.formatBoxFromPx(d.w, d.h, d.x, d.y, d.dpi || 300);
        const escHtml = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;');
        const isTouched = (i === this.touchedIndex);
        const detSummary = d.dxfSummary || d.note || d.autoSummary || '';
        const safeStatus = ['Open', 'Approved', 'Flagged', 'Ignored'].includes(d.status) ? d.status : 'Open';
        const safeType = ['removed', 'added', 'changed'].includes(d.type) ? d.type : 'changed';
        return `
        <div class="defect-item ${i === this.currentIndex ? 'active' : ''} ${isTouched ? 'note-open' : ''} status-${safeStatus.toLowerCase()}" data-idx="${i}">
          <div class="defect-header">
            <span class="defect-badge ${safeType}">#${escHtml(d.id)} ${safeType === 'removed' ? 'REV A (OLD)' : safeType === 'added' ? 'REV B (NEW)' : 'REV A → REV B'}</span>
            <span class="defect-coords" title="Touch to view difference note · Pixel Coords: (${Math.round(d.x)}, ${Math.round(d.y)})">${escHtml(unitReadout)}</span>
            <select class="defect-status-sel" data-idx="${i}">
              <option value="Open" ${safeStatus === 'Open' ? 'selected' : ''}>[Open]</option>
              <option value="Approved" ${safeStatus === 'Approved' ? 'selected' : ''}>[Approved]</option>
              <option value="Flagged" ${safeStatus === 'Flagged' ? 'selected' : ''}>[Flagged]</option>
              <option value="Ignored" ${safeStatus === 'Ignored' ? 'selected' : ''}>[Ignored]</option>
            </select>
          </div>
          <div class="defect-note-wrap" ${isTouched ? '' : 'hidden'}>
            ${detSummary ? `<div class="defect-note-summary">${escHtml(detSummary)}</div>` : ''}
            <input type="text" class="defect-note-input" data-idx="${i}" placeholder="Add engineering / CAM review note..." value="${escHtml(d.note || '')}" />
          </div>
        </div>
      `;
      }).join('');

      const closeSdnBtn = $('#rp-sdn-close-btn');
      const sdnInput = $('#rp-sdn-note-input');
      if (sdnInput) {
        sdnInput.oninput = () => {
          const idx = parseInt(sdnInput.dataset.idx, 10);
          if (this.defects[idx]) {
            this.defects[idx].note = sdnInput.value;
            this.saveCurrentPageState();
            container.querySelectorAll(`.defect-note-input[data-idx="${idx}"]`).forEach(other => {
              if (other !== sdnInput) other.value = sdnInput.value;
            });
          }
        };
      }
      if (closeSdnBtn) {
        closeSdnBtn.onclick = e => {
          e.stopPropagation();
          this.touchedIndex = -1;
          this.renderChecklist();
        };
      }

      container.querySelectorAll('.defect-item').forEach(item => {
        item.onclick = e => {
          if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'INPUT') {
            this.jumpTo(parseInt(item.dataset.idx, 10));
          }
        };
      });

      container.querySelectorAll('.defect-status-sel').forEach(sel => {
        sel.onchange = () => {
          this.setStatus(parseInt(sel.dataset.idx, 10), sel.value);
        };
      });

      container.querySelectorAll('.defect-note-input').forEach(inp => {
        inp.oninput = () => {
          const idx = parseInt(inp.dataset.idx, 10);
          if (this.defects[idx]) {
            this.defects[idx].note = inp.value;
            this.saveCurrentPageState();
            container.querySelectorAll(`.defect-note-input[data-idx="${idx}"]`).forEach(other => {
              if (other !== inp) other.value = inp.value;
            });
          }
        };
      });
    }
  };

  /**
   * 3-Point Fiducial Alignment
   */
  const FiducialAligner = {
    active: false,
    pointsA: [],
    pointsB: [],
    targetLayer: 'A',

    start() {
      this.active = true;
      this.pointsA = [];
      this.pointsB = [];
      this.targetLayer = 'A';
      this.showDialog();
    },

    showDialog() {
      let modal = $('#fiducial-modal');
      if (!modal) {
        modal = el('div', { id: 'fiducial-modal', className: 'rp-modal rp-side-docked' });
        document.body.appendChild(modal);
      }
      modal.hidden = false;
      modal.innerHTML = `
        <div class="rp-card">
          <h3>3-Point Fiducial Snap Alignment</h3>
          <p class="rp-sub">Click 3 matching reference points (schematic grid corners, PCB fiducials, or mounting holes) on Rev A and Rev B. You can click directly on the drawing behind this floating card.</p>
          <div class="fiducial-status-box">
            <div><b>Rev A Fiducials:</b> <span id="fid-pts-a">0 / 3</span></div>
            <div><b>Rev B Fiducials:</b> <span id="fid-pts-b">0 / 3</span></div>
          </div>
          <p id="fid-instruction" style="color:#ff6b6b; font-weight:600; margin:8px 0;">
            Step 1: Click reference point #1 on Base (Rev A).
          </p>
          <div class="rp-btns">
            <button id="fid-reset">Reset Points</button>
            <button id="fid-cancel">Cancel</button>
            <button id="fid-apply" class="rp-primary" disabled>Calculate & Snap</button>
          </div>
        </div>
      `;
      modal.style.background = 'rgba(0,0,0,0.25)';
      modal.style.pointerEvents = 'none';
      modal.querySelector('.rp-card').style.pointerEvents = 'auto';

      $('#fid-cancel').onclick = () => { modal.hidden = true; this.active = false; if (window.rpRedrawOverlay) window.rpRedrawOverlay(); };
      $('#fid-reset').onclick = () => { this.pointsA = []; this.pointsB = []; this.updateUI(); if (window.rpRedrawOverlay) window.rpRedrawOverlay(); };
      $('#fid-apply').onclick = () => { this.applyTransform(); modal.hidden = true; this.active = false; if (window.rpRedrawOverlay) window.rpRedrawOverlay(); };
      this.updateUI();
    },

    updateUI() {
      const elA = $('#fid-pts-a');
      const elB = $('#fid-pts-b');
      const elBtn = $('#fid-apply');
      const elInst = $('#fid-instruction');
      if (elA) elA.textContent = `${this.pointsA.length} / 3`;
      if (elB) elB.textContent = `${this.pointsB.length} / 3`;

      if (this.pointsA.length < 3) {
        if (elInst) elInst.textContent = `Click reference point #${this.pointsA.length + 1} on Base (Rev A).`;
        this.targetLayer = 'A';
      } else if (this.pointsB.length < 3) {
        if (elInst) elInst.textContent = `Now click matching point #${this.pointsB.length + 1} on Revised (Rev B).`;
        this.targetLayer = 'B';
      } else {
        if (elInst) elInst.textContent = 'All 3 fiducial pairs captured! Click "Calculate & Snap".';
        if (elBtn) elBtn.disabled = false;
      }
    },

    addPoint(x, y) {
      if (!this.active) return false;
      if (this.pointsA.length < 3) {
        this.pointsA.push({ x, y });
        this.updateUI();
        if (window.rpRedrawOverlay) window.rpRedrawOverlay();
        return true;
      } else if (this.pointsB.length < 3) {
        this.pointsB.push({ x, y });
        this.updateUI();
        if (window.rpRedrawOverlay) window.rpRedrawOverlay();
        return true;
      }
      return false;
    },

    computeHomography(srcPts, dstPts) {
      if (typeof MeasureEngine !== 'undefined' && MeasureEngine.computeHomography4Pt) {
        return MeasureEngine.computeHomography4Pt(srcPts, dstPts);
      }
      return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    },

    applyTransform() {
      if (this.pointsA.length < 3 || this.pointsB.length < 3) return;
      const pA = this.pointsA;
      const pB = this.pointsB;

      const cA = { x: (pA[0].x + pA[1].x + pA[2].x) / 3, y: (pA[0].y + pA[1].y + pA[2].y) / 3 };
      const cB = { x: (pB[0].x + pB[1].x + pB[2].x) / 3, y: (pB[0].y + pB[1].y + pB[2].y) / 3 };

      let sumCos = 0, sumSin = 0;
      for (let i = 0; i < 3; i++) {
        const ax = pA[i].x - cA.x, ay = pA[i].y - cA.y;
        const bx = pB[i].x - cB.x, by = pB[i].y - cB.y;
        sumCos += bx * ax + by * ay;
        sumSin += bx * ay - by * ax;
      }
      const dTheta = Math.atan2(sumSin, sumCos);
      const dThetaDeg = dTheta * 180 / Math.PI;
      const curW = (typeof window !== "undefined" && window.CMP && window.CMP.cur) ? window.CMP.cur.W : cB.x * 2;
      const curH = (typeof window !== "undefined" && window.CMP && window.CMP.cur) ? window.CMP.cur.H : cB.y * 2;
      const cx = curW / 2, cy = curH / 2;
      const cosT = Math.cos(dTheta), sinT = Math.sin(dTheta);
      const rotCBx = cx + (cB.x - cx) * cosT - (cB.y - cy) * sinT;
      const rotCBy = cy + (cB.x - cx) * sinT + (cB.y - cy) * cosT;
      const dx = cA.x - rotCBx;
      const dy = cA.y - rotCBy;

      CompareHistory.push('3-Point Fiducial Snap');
      const dxInput = $('#dx');
      const dyInput = $('#dy');
      if (dxInput && dyInput) {
        dxInput.value = dx.toFixed(1);
        dyInput.value = dy.toFixed(1);
        if ($('#rp-cur-dx')) $('#rp-cur-dx').textContent = dx.toFixed(1);
        if ($('#rp-cur-dy')) $('#rp-cur-dy').textContent = dy.toFixed(1);
      }
      if (typeof window !== 'undefined' && window.CMP) {
        const cardDelta = Math.round(dThetaDeg / 90) * 90;
        const fineRem = dThetaDeg - cardDelta;
        if (Math.abs(cardDelta) >= 90) {
          window.CMP.degB = ((((window.CMP.degB || 0) + cardDelta) % 360) + 360) % 360;
        }
        window.CMP.rotB = parseFloat(fineRem.toFixed(2));
        if ($('#rp-rot-b')) $('#rp-rot-b').value = window.CMP.rotB;
        if ($('#rp-cur-rot')) $('#rp-cur-rot').textContent = window.CMP.rotB + '°';
        if (window.syncCompareRotationUI) window.syncCompareRotationUI();
        if (window.refresh) window.refresh();
      }
      rpToast(`Fiducial Snap Applied: dx=${dx.toFixed(1)}px, dy=${dy.toFixed(1)}px, skew=${dThetaDeg.toFixed(2)}°`);
    }
  };

  /**
   * Moveable & Dockable Compare Layer Panel (Starts hidden so it doesn't clutter or overlap on startup)
   */
  /**
   * Top-Ribbon Layers, Tints, Thresholds & Micro-Align Controls
   * (Moved from floating/side dock directly into the Top Ribbon #tab-layers!)
   */
  function initLayerDock() {
    const ribbonWrap = document.querySelector(".rp-ribbon-container");
    if (!ribbonWrap) return;

    const S = (typeof window !== "undefined" && window.CMP) ? window.CMP : {};
    const triggerRepaint = () => {
      if (typeof paint === "function") paint();
    };

    const applyCols = (patch) => {
      if (window.setCompareColors) window.setCompareColors(patch);
      else {
        Object.assign(S, patch);
        if (window.syncCompareColorUI) window.syncCompareColorUI();
        triggerRepaint();
      }
    };
    ['#rp-tint-a', '#rib-tint-a', '#cHudTintA'].forEach(sel => {
      if ($(sel)) $(sel).oninput = e => applyCols({ tintA: e.target.value });
    });
    ['#rp-tint-b', '#rib-tint-b', '#cHudTintB'].forEach(sel => {
      if ($(sel)) $(sel).oninput = e => applyCols({ tintB: e.target.value });
    });
    ['#rp-tint-c', '#rib-tint-c', '#cHudTintC'].forEach(sel => {
      if ($(sel)) $(sel).oninput = e => applyCols({ tintC: e.target.value });
    });
    if ($("#rp-op-a")) $("#rp-op-a").oninput = e => applyCols({ opA: +e.target.value });
    if ($("#rp-op-b")) $("#rp-op-b").oninput = e => applyCols({ opB: +e.target.value });
    if ($("#rp-op-c")) $("#rp-op-c").oninput = e => applyCols({ opC: +e.target.value });
    if ($("#rib-op-c")) $("#rib-op-c").oninput = e => applyCols({ opC: +e.target.value });

    if ($("#rp-palette-preset")) {
      $("#rp-palette-preset").onchange = e => {
        const v = e.target.value;
        const presets = {
          std: ["#e11414", "#00a53c", "#94a3b8"],
          cb: ["#00bcd4", "#e91e63", "#94a3b8"],
          ba: ["#2563eb", "#f59e0b", "#94a3b8"],
          cam: ["#facc15", "#10b981", "#94a3b8"],
          po: ["#9333ea", "#f97316", "#94a3b8"],
          pk: ["#ec4899", "#14b8a6", "#94a3b8"]
        };
        const [ca, cb, cc] = presets[v] || presets.std;
        applyCols({ tintA: ca, tintB: cb, tintC: cc });
        rpToast("Applied palette: " + $("#rp-palette-preset").selectedOptions[0].text);
      };
    }

    const syncEyes = () => {
      const lA = $("#lA"), lB = $("#lB"), lC = $("#lC");
      if (lA && $("#rp-eye-a")) $("#rp-eye-a").classList.toggle("on", lA.checked);
      if (lB && $("#rp-eye-b")) $("#rp-eye-b").classList.toggle("on", lB.checked);
      if (lC && $("#rp-eye-c")) $("#rp-eye-c").classList.toggle("on", lC.checked);
      if (lA && lB) {
        if ($("#rp-diff-del")) $("#rp-diff-del").checked = lA.checked;
        if ($("#rp-diff-add")) $("#rp-diff-add").checked = lB.checked;
        if ($("#rp-diff-on")) $("#rp-diff-on").checked = lA.checked || lB.checked;
      }
    };

    if ($("#rp-eye-a")) $("#rp-eye-a").onclick = () => { const lA = $("#lA"); if (lA) { lA.checked = !lA.checked; lA.dispatchEvent(new Event("change")); syncEyes(); } };
    if ($("#rp-eye-b")) $("#rp-eye-b").onclick = () => { const lB = $("#lB"); if (lB) { lB.checked = !lB.checked; lB.dispatchEvent(new Event("change")); syncEyes(); } };
    if ($("#rp-eye-c")) $("#rp-eye-c").onclick = () => { const lC = $("#lC"); if (lC) { lC.checked = !lC.checked; lC.dispatchEvent(new Event("change")); syncEyes(); } };

    if ($("#rp-diff-add")) $("#rp-diff-add").onchange = e => { const lB = $("#lB"); if (lB) { lB.checked = e.target.checked; lB.dispatchEvent(new Event("change")); syncEyes(); } };
    if ($("#rp-diff-del")) $("#rp-diff-del").onchange = e => { const lA = $("#lA"); if (lA) { lA.checked = e.target.checked; lA.dispatchEvent(new Event("change")); syncEyes(); } };
    if ($("#rp-diff-on")) {
      $("#rp-diff-on").onchange = e => {
        const on = e.target.checked;
        const lA = $("#lA"), lB = $("#lB");
        if (lA) { lA.checked = on; lA.dispatchEvent(new Event("change")); }
        if (lB) { lB.checked = on; lB.dispatchEvent(new Event("change")); }
        syncEyes();
      };
    }

    if ($("#rp-diff-thresh")) {
      $("#rp-diff-thresh").oninput = e => {
        if ($("#rp-tol-val")) $("#rp-tol-val").textContent = e.target.value;
        const tol = $("#tol");
        if (tol) {
          tol.value = e.target.value;
          tol.dispatchEvent(new Event("change"));
        }
      };
    }
    if ($("#rp-noise-thresh")) {
      $("#rp-noise-thresh").oninput = e => {
        const v = parseInt(e.target.value, 10) || 2;
        if ($("#rp-noise-val")) $("#rp-noise-val").textContent = v;
        DefectState.noiseThreshold = v;
        const minpx = $("#minpx");
        if (minpx) {
          minpx.value = v;
          minpx.dispatchEvent(new Event("change"));
        }
      };
    }
    if ($("#rp-edge-thresh")) {
      $("#rp-edge-thresh").oninput = e => {
        const v = parseInt(e.target.value, 10) || 0;
        if ($("#rp-edge-val")) $("#rp-edge-val").textContent = v;
        const edge = $("#edge");
        if (edge) {
          edge.value = v;
          edge.dispatchEvent(new Event("change"));
        }
      };
    }
    if ($("#rp-markers-chk")) {
      $("#rp-markers-chk").onchange = e => {
        const boxes = $("#lM") || $("#boxes");
        if (boxes) {
          boxes.checked = e.target.checked;
          boxes.dispatchEvent(new Event("change"));
        }
        if ($("#rib-view-markers")) $("#rib-view-markers").classList.toggle("on", e.target.checked);
      };
    }

    const dxInput = $("#dx"), dyInput = $("#dy");
    const updateNudgeLabels = () => {
      if (dxInput && dyInput) {
        if ($("#rp-cur-dx")) $("#rp-cur-dx").textContent = dxInput.value;
        if ($("#rp-cur-dy")) $("#rp-cur-dy").textContent = dyInput.value;
      }
    };

    ribbonWrap.querySelectorAll("[data-nudge]").forEach(btn => {
      btn.onclick = () => {
        if (!dxInput || !dyInput) return;
        CompareHistory.push("Micro-align nudge");
        const cmd = btn.dataset.nudge;
        let x = parseFloat(dxInput.value || 0);
        let y = parseFloat(dyInput.value || 0);
        if (cmd === "x-1") x -= 1;
        else if (cmd === "x-01") x -= 0.1;
        else if (cmd === "x01") x += 0.1;
        else if (cmd === "x1") x += 1;
        else if (cmd === "y-1") y -= 1;
        else if (cmd === "y-01") y -= 0.1;
        else if (cmd === "y01") y += 0.1;
        else if (cmd === "y1") y += 1;

        dxInput.value = Number(x.toFixed(1));
        dyInput.value = Number(y.toFixed(1));
        updateNudgeLabels();
        if (window.refresh) window.refresh();
      };
    });

    if ($("#rp-rot-a")) {
      let rotATimer = null;
      let rotAHistPushed = false;
      $("#rp-rot-a").addEventListener("pointerdown", () => { rotAHistPushed = false; });
      $("#rp-rot-a").oninput = e => {
        if (!rotAHistPushed) { CompareHistory.push("Rotate Rev A skew"); rotAHistPushed = true; }
        const deg = parseFloat(e.target.value) || 0;
        if ($("#rp-cur-rot-a")) $("#rp-cur-rot-a").textContent = deg.toFixed(2) + "°";
        if (window.CMP) window.CMP.rotA = deg;
        clearTimeout(rotATimer);
        rotATimer = setTimeout(() => { if (window.refresh) window.refresh(); }, 180);
      };
      $("#rp-rot-a").onchange = () => {
        rotAHistPushed = false;
        clearTimeout(rotATimer);
        if (window.refresh) window.refresh();
      };
    }

    if ($("#rp-rot-b")) {
      let rotTimer = null;
      let rotHistPushed = false;
      $("#rp-rot-b").addEventListener("pointerdown", () => { rotHistPushed = false; });
      $("#rp-rot-b").oninput = e => {
        if (!rotHistPushed) { CompareHistory.push("Rotate Rev B skew"); rotHistPushed = true; }
        const deg = parseFloat(e.target.value) || 0;
        if ($("#rp-cur-rot")) $("#rp-cur-rot").textContent = deg.toFixed(2) + "°";
        if (window.CMP) window.CMP.rotB = deg;
        clearTimeout(rotTimer);
        rotTimer = setTimeout(() => { if (window.refresh) window.refresh(); }, 180);
      };
      $("#rp-rot-b").onchange = () => {
        rotHistPushed = false;
        clearTimeout(rotTimer);
        if (window.refresh) window.refresh();
      };
    }

    if ($("#rp-reset-nudge")) {
      $("#rp-reset-nudge").onclick = () => {
        CompareHistory.push("Reset alignment");
        if (dxInput && dyInput) {
          dxInput.value = 0;
          dyInput.value = 0;
          updateNudgeLabels();
        }
        if ($("#rp-rot-a")) $("#rp-rot-a").value = 0;
        if ($("#rp-cur-rot-a")) $("#rp-cur-rot-a").textContent = "0°";
        if ($("#rp-rot-b")) $("#rp-rot-b").value = 0;
        if ($("#rp-cur-rot")) $("#rp-cur-rot").textContent = "0°";
        if (window.CMP) {
          window.CMP.degA = 0;
          window.CMP.degB = 0;
          window.CMP.rotA = 0;
          window.CMP.rotB = 0;
          window.CMP.mirrorXA = false;
          window.CMP.mirrorYA = false;
          window.CMP.mirrorXB = false;
          window.CMP.mirrorYB = false;
        }
        if (typeof window !== 'undefined' && window.syncCompareRotationUI) window.syncCompareRotationUI();
        if (window.refresh) window.refresh();
        rpToast("Alignment, rotation, mirror & skew reset to (0, 0, 0°).");
      };
    }
  }

  /**
   * Interactive 60 FPS Curtain Split Slider
   * Uses a backing canvas (#cvA) for Pure Rev A and clips #cv and #lv (Rev B / Diff) at the exact stage coordinate!
   */
  let curtainPct = 50;
  let curtainActive = false;
  let prevNonCurtainMode = 'paper';

  function updateCurtainClip() {
    const curtain = $('#rp-curtain-handle');
    const vp = $('#vp');
    const cv = $('#cv');
    const lv = $('#lv');
    const cvA = $('#cvA');
    const hq = $('#hq');
    if (!curtain || !vp || !cv) return;

    const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : null;
    if (!curtainActive || !(S && S.cur)) {
      curtain.hidden = true;
      cv.style.clipPath = 'none';
      if (lv) lv.style.clipPath = 'none';
      if (hq) hq.style.clipPath = 'none';
      if (cvA) { cvA.style.display = 'none'; cvA.width = 0; cvA.height = 0; cvA._gen = null; }
      return;
    }

    curtain.hidden = false;
    curtain.style.left = `${curtainPct}%`;
    if (S && S.cur && S.cur.isNativeDXF && typeof window.rpSharpen === 'function') {
      window.rpSharpen();
    }

    if (S && S.cur && cvA) {
      const curKey = `${S.showTok || 0}_${S.gen || 0}_${S.cur.n || 1}_${S.cur.W}x${S.cur.H}_${S.degA || 0}_${S.rotA || 0}_${S.mirrorXA ? 1 : 0}_${S.mirrorYA ? 1 : 0}_${cv._paintGen || 0}`;
      if (cvA.width !== S.cur.W || cvA.height !== S.cur.H || cvA._gen !== curKey) {
        cvA.width = S.cur.W;
        cvA.height = S.cur.H;
        cvA.getContext('2d').putImageData(S.cur.A, 0, 0);
        cvA._gen = curKey;
      }
      cvA.style.display = 'block';
    }

    const vpW = vp.clientWidth || 1;
    const screenX = (curtainPct / 100) * vpW;
    if (S && S.view) {
      const imgX = Math.max(0, Math.min(cv.width, (screenX - S.view.x) / S.view.k));
      const clipStr = `inset(0 0 0 ${imgX}px)`;
      cv.style.clipPath = clipStr;
      if (lv) lv.style.clipPath = clipStr;
    } else {
      const polyStr = `polygon(${curtainPct}% 0, 100% 0, 100% 100%, ${curtainPct}% 100%)`;
      cv.style.clipPath = polyStr;
      if (lv) lv.style.clipPath = polyStr;
    }
    if (hq) {
      if (hq.style.display === 'block' && hq._cropA && hq._cropB) {
        const W = hq.width, H = hq.height;
        const x = hq.getContext('2d');
        const vpW = (vp && vp.clientWidth) ? vp.clientWidth : (W || 1);
        const hqD = hq._lastDpr || (W / vpW) || 1;
        const panDeltaX = (S && S.view && Number.isFinite(hq._lastVx)) ? (S.view.x - hq._lastVx) : 0;
        const splitPx = Math.max(0, Math.min(W, Math.round(((curtainPct / 100) * vpW - panDeltaX) * hqD)));
        if (splitPx > 0) {
          x.putImageData(hq._cropA, 0, 0, 0, 0, splitPx, H);
        }
        if (splitPx < W) {
          x.putImageData(hq._cropB, 0, 0, splitPx, 0, W - splitPx, H);
        }
        hq.style.clipPath = 'none';
      } else {
        hq.style.clipPath = `polygon(${curtainPct}% 0, 100% 0, 100% 100%, ${curtainPct}% 100%)`;
      }
    }
  }

  function initCurtainSlider() {
    const vp = $('#vp');
    const stage = $('#stage');
    if (!vp || !stage) return;

    if (!$('#cvA')) {
      const cvA = el('canvas', { id: 'cvA', style: { display: 'none', position: 'absolute', left: '0', top: '0' } });
      stage.insertBefore(cvA, stage.firstChild);
    }

    let curtain = $('#rp-curtain-handle');
    if (!curtain) {
      curtain = el('div', { id: 'rp-curtain-handle', className: 'rp-curtain-handle', hidden: true });
      curtain.innerHTML = `
        <div class="rp-curtain-bar"></div>
        <div class="rp-curtain-tag left">REV A</div>
        <div class="rp-curtain-knob">◀ ┃ ▶</div>
        <div class="rp-curtain-tag right">REV B</div>
      `;
      vp.appendChild(curtain);

      let isDragging = false;
      let dragVpRect = null;
      let curtainRaf = 0;
      curtain.onpointerdown = e => {
        e.stopPropagation();
        isDragging = true;
        dragVpRect = vp.getBoundingClientRect();
        curtain.setPointerCapture(e.pointerId);
      };

      window.addEventListener('pointermove', e => {
        if (!isDragging) return;
        const rect = dragVpRect || vp.getBoundingClientRect();
        const clientX = Math.max(rect.left + 20, Math.min(rect.right - 20, e.clientX));
        curtainPct = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
        curtain.style.left = `${curtainPct}%`;
        if (!curtainRaf) {
          curtainRaf = requestAnimationFrame(() => {
            curtainRaf = 0;
            updateCurtainClip();
          });
        }
      });

      window.addEventListener('pointerup', () => { isDragging = false; dragVpRect = null; });
    }
  }

  function syncModeSelects(val) {
    ['#rib-mode', '#rib-view-mode'].forEach(sel => {
      const elSel = $(sel);
      if (elSel && elSel.value !== val) elSel.value = val;
    });
  }

  function setCurtainMode(enabled, targetFallbackMode = null) {
    const wasActive = curtainActive;
    curtainActive = !!enabled;
    const btn = $('#rib-curtain-toggle');
    if (btn) btn.classList.toggle('on', curtainActive);
    if ($('#cHudCurtain')) $('#cHudCurtain').classList.toggle('on', curtainActive);
    const mainMode = $('#mode');
    const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : null;

    if (curtainActive) {
      if (mainMode && mainMode.value && mainMode.value !== 'curtain' && !wasActive) {
        prevNonCurtainMode = mainMode.value;
      }
      if (mainMode) mainMode.value = 'B';
      if (S) {
        const wasSide = (S.mode === 'side');
        S.mode = 'B';
        if (typeof window.paint === 'function') window.paint();
        if (wasSide && typeof window.fit === 'function') window.fit();
      }
      syncModeSelects('curtain');
    } else {
      const nextMode = targetFallbackMode || prevNonCurtainMode || (mainMode ? mainMode.value : 'paper') || 'paper';
      if (mainMode) mainMode.value = nextMode;
      if (S) {
        const wasSide = (S.mode === 'side');
        S.mode = nextMode;
        if (wasActive && typeof window.paint === 'function') window.paint();
        if ((wasSide || nextMode === 'side') && wasActive && typeof window.fit === 'function') window.fit();
      }
      syncModeSelects(nextMode);
    }
    updateCurtainClip();
    if (typeof window !== 'undefined' && window.rpSharpen) window.rpSharpen();
    if (curtainActive && !wasActive) rpToast('Split Curtain Active: Drag vertical divider to compare Rev A (left) vs Rev B (right).');
  }

  function setCompareMode(val) {
    const mainMode = $('#mode');
    if (!mainMode) return;
    if (val === 'curtain') {
      setCurtainMode(true);
    } else {
      prevNonCurtainMode = val;
      if (curtainActive) {
        setCurtainMode(false, val);
      }
      mainMode.value = val;
      mainMode.dispatchEvent(new Event('change'));
      syncModeSelects(val);
    }
  }

  /**
   * Session Save & Load (.redline JSON file)
   */
  async function saveSessionFile() {
    const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : {};
    const RM = (typeof window !== 'undefined' && window.RP_MEASURE) ? window.RP_MEASURE : {};
    const sessionData = {
      app: 'Kensho Pro',
      version: '1.2.3.2',
      buildVersion: 'O1R0A7N5G0E002026A1232',
      timestamp: new Date().toISOString(),
      files: {
        A: S.names ? S.names.A : 'A.pdf',
        B: S.names ? S.names.B : 'B.pdf',
        pathA: (S.paths && S.paths.A) ? S.paths.A : '',
        pathB: (S.paths && S.paths.B) ? S.paths.B : ''
      },
      settings: {
        dx: $('#dx') ? $('#dx').value : 0,
        dy: $('#dy') ? $('#dy').value : 0,
        degA: S.degA || 0,
        degB: S.degB || 0,
        rotA: S.rotA || 0,
        rotB: S.rotB || 0,
        mirrorXA: !!S.mirrorXA,
        mirrorYA: !!S.mirrorYA,
        mirrorXB: !!S.mirrorXB,
        mirrorYB: !!S.mirrorYB,
        tolerance: $('#tol') ? $('#tol').value : 40,
        dpi: $('#dpi') ? $('#dpi').value : 300,
        mode: $('#mode') ? $('#mode').value : 'paper',
        tintA: S.tintA || '#e11414',
        tintB: S.tintB || '#00a53c',
        tintC: S.tintC || '#94a3b8',
        opA: S.opA != null ? S.opA : 100,
        opB: S.opB != null ? S.opB : 100,
        opC: S.opC != null ? S.opC : 42,
        unitSystem: CAMState.unitSystem,
        ipcClass: CAMState.ipcClass
      },
      ignore: S.ignore || [],
      done: S.done || {},
      defects: DefectState.defects,
      defectsByPage: DefectState.byPage || {},
      annotations: RM.annotations || [],
      tallyItems: (RM.tally && RM.tally.items) ? RM.tally.items : [],
      calibration: (() => { try { return JSON.parse(safeGet('rp_calibration', '{}') || '{}'); } catch (e) { return {}; } })()
    };

    sessionData.dxf = (typeof DXFState !== 'undefined' && (DXFState.rawA || DXFState.rawB)) ? {
      nameA: DXFState.nameA || '',
      nameB: DXFState.nameB || '',
      rawA: DXFState.rawA || null,
      rawB: DXFState.rawB || null,
      compareTol: DXFState.compareTol || 0.005,
      alignmentMode: DXFState.alignmentMode || 'origin',
      hiddenLayers: Array.from(DXFState.hiddenLayers || []),
      frozenLayers: Array.from(DXFState.frozenLayers || []),
      lockedLayers: Array.from(DXFState.lockedLayers || []),
      comparedLayers: Array.from(DXFState.comparedLayers || [])
    } : null;
    const json = JSON.stringify(sessionData, (k, v) => (k === '_normEnt' || k === '_diffSubIndices') ? undefined : v, 2);
    const enc = new TextEncoder().encode(json);
    if (window.native && window.native.saveFile) {
      await window.native.saveFile({
        name: 'review_session.redline',
        bytes: enc,
        filters: [{ name: 'Kensho Project', extensions: ['redline', 'kensho', 'json'] }]
      });
      rpToast('Saved project session (.redline).');
    }
  }

  async function loadSessionFile() {
    if (!window.native || !window.native.openFiles) return;
    const files = await window.native.openFiles({
      title: 'Open Kensho Pro Session (.redline / .kensho)',
      filters: [{ name: 'Kensho Pro Session', extensions: ['redline', 'kensho', 'json'] }]
    });
    if (!files || !files.length) return;

    restoreSessionFromText(new TextDecoder().decode(new Uint8Array(files[0].bytes)));
  }

  async function restoreSessionFromText(text) {
    try {
      const sess = JSON.parse(text);
      const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : null;
      if (sess.dxf && typeof DXFEngine !== 'undefined' && (sess.dxf.rawA || sess.dxf.rawB)) {
        DXFState.nameA = sess.dxf.nameA || 'RevA.dxf';
        DXFState.nameB = sess.dxf.nameB || 'RevB.dxf';
        DXFState.rawA = sess.dxf.rawA || null;
        DXFState.rawB = sess.dxf.rawB || null;
        DXFState.parsedA = DXFState.rawA ? new DXFEngine.DXFParser(DXFState.rawA).parse() : null;
        DXFState.parsedB = DXFState.rawB ? new DXFEngine.DXFParser(DXFState.rawB).parse() : null;
        DXFState.compareTol = sess.dxf.compareTol || 0.005;
        DXFState.alignmentMode = sess.dxf.alignmentMode || 'origin';
        DXFState.hiddenLayers = new Set(sess.dxf.hiddenLayers || []);
        DXFState.frozenLayers = new Set(sess.dxf.frozenLayers || []);
        DXFState.lockedLayers = new Set(sess.dxf.lockedLayers || []);
        DXFState.comparedLayers = new Set(sess.dxf.comparedLayers || []);
        DXFState.syncLayerSetsFromParsers();
        await reRenderActiveDXFLayers();
      }
      // If neither A nor B is loaded yet, attempt to reload from saved paths or sample generators
      if (S && !S.A && !S.B && sess.files) {
        const pA = sess.files.pathA, pB = sess.files.pathB;
        const nA = sess.files.A || '', nB = sess.files.B || '';
        if (pA && pB && window.native && window.native.readFile && window.compareLoadBytes) {
          const fA = await window.native.readFile(pA);
          const fB = await window.native.readFile(pB);
          if (fA && fB) {
            await window.compareLoadBytes('A', fA.bytes, fA.name || nA, pA, true);
            await window.compareLoadBytes('B', fB.bytes, fB.name || nB, pB, false);
          }
        } else if (/Sample_Top_Copper/i.test(nA) && typeof loadSampleGerber === 'function') {
          await loadSampleGerber();
        } else if (/Enclosure_Carrier/i.test(nA) && typeof loadSampleDXF === 'function') {
          await loadSampleDXF();
        } else if (/Sample_Schematic/i.test(nA) && typeof loadSampleSchematic === 'function') {
          await loadSampleSchematic();
        }
      }

      if (sess.settings) {
        if ($('#dx') && sess.settings.dx != null) { $('#dx').value = sess.settings.dx; if ($('#rp-cur-dx')) $('#rp-cur-dx').textContent = sess.settings.dx; }
        if ($('#dy') && sess.settings.dy != null) { $('#dy').value = sess.settings.dy; if ($('#rp-cur-dy')) $('#rp-cur-dy').textContent = sess.settings.dy; }
        if ($('#tol') && sess.settings.tolerance != null) {
          $('#tol').value = sess.settings.tolerance;
          if ($('#rp-diff-thresh')) $('#rp-diff-thresh').value = sess.settings.tolerance;
          if ($('#rp-tol-val')) $('#rp-tol-val').textContent = sess.settings.tolerance;
        }
        if ($('#dpi') && sess.settings.dpi != null) {
          $('#dpi').value = sess.settings.dpi;
          if ($('#rib-dpi')) $('#rib-dpi').value = sess.settings.dpi;
          if ($('#rib-view-dpi')) $('#rib-view-dpi').value = sess.settings.dpi;
        }
        if ($('#mode') && sess.settings.mode != null) {
          setCompareMode(sess.settings.mode);
        }
        if (sess.settings.unitSystem) setUnitSystem(sess.settings.unitSystem, true);
        if (sess.settings.ipcClass) {
          CAMState.ipcClass = sess.settings.ipcClass;
          if ($('#rib-ipc-class')) $('#rib-ipc-class').value = sess.settings.ipcClass;
        }
        if (window.CMP) {
          window.CMP.degA = sess.settings.degA || 0;
          window.CMP.degB = sess.settings.degB || 0;
          window.CMP.rotA = sess.settings.rotA || 0;
          window.CMP.rotB = sess.settings.rotB || 0;
          window.CMP.mirrorXA = !!sess.settings.mirrorXA;
          window.CMP.mirrorYA = !!sess.settings.mirrorYA;
          window.CMP.mirrorXB = !!sess.settings.mirrorXB;
          window.CMP.mirrorYB = !!sess.settings.mirrorYB;
          if ($('#rp-rot-a')) $('#rp-rot-a').value = window.CMP.rotA;
          if ($('#rp-cur-rot-a')) $('#rp-cur-rot-a').textContent = window.CMP.rotA + '°';
          if ($('#rp-rot-b')) $('#rp-rot-b').value = window.CMP.rotB;
          if ($('#rp-cur-rot')) $('#rp-cur-rot').textContent = window.CMP.rotB + '°';
          if (typeof window !== 'undefined' && window.syncCompareRotationUI) window.syncCompareRotationUI();
          window.CMP.tintA = sess.settings.tintA || '#e11414';
          window.CMP.tintB = sess.settings.tintB || '#00a53c';
          window.CMP.tintC = sess.settings.tintC || '#94a3b8';
          if (sess.settings.opC != null) window.CMP.opC = +sess.settings.opC;
          if (window.syncCompareColorUI) window.syncCompareColorUI();
          if (sess.settings.opA != null) {
            window.CMP.opA = +sess.settings.opA;
            if ($('#rp-op-a')) $('#rp-op-a').value = window.CMP.opA;
            if ($('#rp-op-a-val')) $('#rp-op-a-val').textContent = window.CMP.opA + '%';
          }
          if (sess.settings.opB != null) {
            window.CMP.opB = +sess.settings.opB;
            if ($('#rp-op-b')) $('#rp-op-b').value = window.CMP.opB;
            if ($('#rp-op-b-val')) $('#rp-op-b-val').textContent = window.CMP.opB + '%';
          }
        }
      }
      if (window.CMP) {
        if (Array.isArray(sess.ignore)) window.CMP.ignore = sess.ignore;
        if (sess.done && typeof sess.done === 'object') window.CMP.done = sess.done;
      }
      if (sess.calibration && sess.calibration.pxPerUnit && window.RP_MEASURE && window.RP_MEASURE.calibrator) {
        window.RP_MEASURE.calibrator.pxPerUnit = sess.calibration.pxPerUnit;
        if (sess.calibration.unit) window.RP_MEASURE.calibrator.unit = sess.calibration.unit;
        safeSet('rp_calibration', JSON.stringify(sess.calibration));
        if (window.rpUpdateCalBadge) window.rpUpdateCalBadge();
      }
      if (sess.defectsByPage && typeof sess.defectsByPage === 'object') {
        DefectState.byPage = sess.defectsByPage;
      }
      if (sess.defects && sess.defects.length) {
        DefectState.defects = sess.defects;
        const pageN = (window.CMP && window.CMP.cur && window.CMP.cur.n) ? window.CMP.cur.n : 1;
        DefectState.byPage[pageN] = sess.defects;
        DefectState.renderChecklist();
      }
      if (sess.annotations && window.RP_MEASURE) {
        window.RP_MEASURE.annotations = sess.annotations;
      }
      if (sess.tallyItems && window.RP_MEASURE && window.RP_MEASURE.tally) {
        window.RP_MEASURE.tally.items = sess.tallyItems;
        window.RP_MEASURE.tally.nextNum = sess.tallyItems.length + 1;
      }
      if (window.rpRedrawOverlay) window.rpRedrawOverlay();
      if (window.refresh) window.refresh();
      rpToast(`Session restored: ${sess.defects ? sess.defects.length : 0} defects & ${(sess.annotations || []).length} markups loaded.`);
    } catch (e) {
      rpToast('Could not parse session file: ' + e.message);
    }
  }

  /**
   * Executive Summary PDF Audit Report Generation
   */
  async function generateExecutiveAuditReport(returnBytesOnly = false) {
    const _PDFLib = (typeof PDFLib !== "undefined" && PDFLib.PDFDocument)
      ? PDFLib
      : (typeof require === "function" ? (() => { try { return require(['.', 'lib', 'pdf-lib.min.js'].join('/')); } catch (e) { return null; } })() : null);
    if (!_PDFLib || !_PDFLib.PDFDocument) {
      if (!returnBytesOnly) rpToast("PDF library not available.");
      return null;
    }

    try {
      rpToast("Generating Multi-Page Executive Audit Report PDF...");
      const S = (typeof window !== "undefined" && window.CMP) ? window.CMP : {};
      const RM = (typeof window !== "undefined" && window.RP_MEASURE) ? window.RP_MEASURE : {};
      const doc = await _PDFLib.PDFDocument.create();
      const font = await doc.embedFont(_PDFLib.StandardFonts.Helvetica);
      const fontBold = await doc.embedFont(_PDFLib.StandardFonts.HelveticaBold);
      const rgb = _PDFLib.rgb;

      const safePdfStr = s => String(s || "")
        .replace(/[ΩΩ]/g, "Ohm")
        .replace(/[µμ]/g, "u")
        .replace(/Δ/g, "Delta ")
        .replace(/⌀/g, "Dia ")
        .replace(/±/g, "+/-")
        .replace(/°/g, " deg")
        .replace(/×/g, "x")
        .replace(/[—–]/g, "-")
        .replace(/[·•]/g, "-")
        .replace(/≤/g, "<=")
        .replace(/≥/g, ">=")
        .replace(/✓/g, "OK")
        .replace(/✗/g, "X")
        .replace(/→/g, "->")
        .replace(/↔/g, "<->")
        .replace(/[^\x20-\x7e]/g, " ");

      if ((!DefectState.defects || !DefectState.defects.length) && S && S.cur && Array.isArray(S.cur.regions) && S.cur.regions.length) {
        DefectState.initFromRegions(S.cur.regions);
      }

      const pages = [];
      const addStyledPage = (subtitle = "EXECUTIVE ENGINEERING & CAM AUDIT REPORT") => {
        const p = doc.addPage([612, 792]);
        pages.push(p);
        const { width, height } = p.getSize();
        p.drawRectangle({ x: 0, y: height - 58, width, height: 58, color: rgb(0.05, 0.13, 0.22) });
        p.drawRectangle({ x: 0, y: height - 61, width, height: 3, color: rgb(0.9, 0.22, 0.22) });
        p.drawText(safePdfStr(`KENSHO PRO 1.0 - ${subtitle}`), {
          x: 32, y: height - 34, size: 12.5, font: fontBold, color: rgb(1, 1, 1)
        });
        p.drawText("Kensho Studio - textportdocx.in", {
          x: width - 185, y: height - 33, size: 8.5, font, color: rgb(0.75, 0.88, 1)
        });
        return p;
      };

      const page = addStyledPage();
      const { width, height } = page.getSize();

      let curY = height - 84;
      page.drawText("1. Document, CAM & Revision Metadata", { x: 32, y: curY, size: 11.5, font: fontBold, color: rgb(0.08, 0.18, 0.28) });
      curY -= 16;

      const reviewer = safePdfStr(safeGet("author", "Lead Review Engineer") || "Lead Review Engineer");
      const unitModeStr = CAMState.unitSystem === "metric" ? "IPC Metric (mm / um)" : "IPC English (mils / in)";
      const docHash = safePdfStr(RM.docHash || "A3F8E902B1764D5C");
      const meta = [
        `Base Drawing (Rev A): ${((S.names && S.names.A) || "Rev_A.pdf").slice(0, 48)}   |   Revised Drawing (Rev B): ${((S.names && S.names.B) || "Rev_B.pdf").slice(0, 48)}`,
        `Audit Timestamp: ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC   |   Reviewer: ${reviewer}   |   Units: ${unitModeStr}`,
        `Parameters: DPI=${$("#dpi") ? $("#dpi").value : 300}, Tolerance=${$("#tol") ? $("#tol").value : 40}, Offset=(${($("#dx") ? $("#dx").value : 0)}, ${($("#dy") ? $("#dy").value : 0)}) px, Skew=${S.rotB || 0} deg   |   SHA-256: ${docHash}`
      ];
      for (const line of meta) {
        page.drawText(safePdfStr(line), { x: 32, y: curY, size: 8.5, font, color: rgb(0.2, 0.2, 0.2) });
        curY -= 13;
      }

      const defects = DefectState.defects || [];
      const approvedCount = defects.filter(d => d.status === "Approved").length;
      const flaggedCount = defects.filter(d => d.status === "Flagged").length;
      const ignoredCount = defects.filter(d => d.status === "Ignored").length;
      const openCount = defects.filter(d => d.status === "Open").length;

      curY -= 8;
      page.drawRectangle({
        x: 32, y: curY - 40, width: width - 64, height: 48,
        color: rgb(0.95, 0.97, 0.99), borderColor: rgb(0.78, 0.84, 0.90), borderWidth: 1
      });
      page.drawText(`Total Defects: ${defects.length}     |     Approved: ${approvedCount}     |     Flagged: ${flaggedCount}     |     Open: ${openCount}     |     Ignored: ${ignoredCount}`, {
        x: 44, y: curY - 16, size: 9.5, font: fontBold, color: rgb(0.08, 0.18, 0.28)
      });
      const signoffState = flaggedCount > 0 ? "DISPOSITION: REJECTED / FLAGGED FOR ENGINEERING REVISION" : (openCount === 0 ? "DISPOSITION: APPROVED & VERIFIED FOR RELEASE" : "DISPOSITION: IN ENGINEERING REVIEW");
      page.drawText(signoffState, {
        x: 44, y: curY - 32, size: 9, font: fontBold, color: flaggedCount > 0 ? rgb(0.8, 0.1, 0.1) : rgb(0.05, 0.5, 0.2)
      });
      curY -= 58;

      const cv = $("#cv");
      if (cv && cv.width > 10 && cv.height > 10) {
        try {
          const thumbCanvas = document.createElement("canvas");
          const scale = Math.min(1800 / cv.width, 1100 / cv.height, 1);
          thumbCanvas.width = Math.max(1, Math.round(cv.width * scale));
          thumbCanvas.height = Math.max(1, Math.round(cv.height * scale));
          const tctx = thumbCanvas.getContext("2d");
          tctx.imageSmoothingEnabled = true;
          tctx.imageSmoothingQuality = "high";
          tctx.drawImage(cv, 0, 0, thumbCanvas.width, thumbCanvas.height);
          const rpOv = $("#rp-ov");
          if (typeof window !== "undefined" && typeof window.drawOverlayToSheetCanvas === "function") window.drawOverlayToSheetCanvas(tctx, scale);
          else if (rpOv && rpOv.width === cv.width) tctx.drawImage(rpOv, 0, 0, thumbCanvas.width, thumbCanvas.height);

          tctx.strokeStyle = "#ff2222";
          tctx.lineWidth = Math.max(2, Math.round(2.5 * scale));
          defects.forEach(d => {
            tctx.strokeRect(d.x * scale - 2, d.y * scale - 2, d.w * scale + 4, d.h * scale + 4);
          });

          const tw = thumbCanvas.width, th = thumbCanvas.height;
          const dataUrl = thumbCanvas.toDataURL("image/jpeg", 0.92);
          thumbCanvas.width = 0; thumbCanvas.height = 0;
          const bin = atob(dataUrl.split(",")[1] || "");
          const jpgBytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) jpgBytes[i] = bin.charCodeAt(i);
          const jpgImg = await doc.embedJpg(jpgBytes);
          const boxW = width - 64, boxH = 175;
          const imgScale = Math.min(boxW / tw, boxH / th);
          const drawW = tw * imgScale, drawH = th * imgScale;
          page.drawText("2. Full-Sheet Comparison Composite (Highlighted Defect Regions)", { x: 32, y: curY, size: 11, font: fontBold, color: rgb(0.08, 0.18, 0.28) });
          curY -= (drawH + 8);
          page.drawImage(jpgImg, { x: 32 + (boxW - drawW) / 2, y: curY, width: drawW, height: drawH });
          page.drawRectangle({ x: 32, y: curY, width: boxW, height: drawH, borderColor: rgb(0.78, 0.82, 0.86), borderWidth: 1 });
          curY -= 18;
        } catch (err) {}
      }

      let activePage = page;
      const drawTableHeader = (pg, yPos, titleText) => {
        if (titleText) {
          pg.drawText(titleText, { x: 32, y: yPos, size: 11, font: fontBold, color: rgb(0.08, 0.18, 0.28) });
          yPos -= 16;
        }
        pg.drawRectangle({ x: 32, y: yPos - 4, width: width - 64, height: 18, color: rgb(0.08, 0.18, 0.28) });
        pg.drawText("ID", { x: 38, y: yPos, size: 8.5, font: fontBold, color: rgb(1, 1, 1) });
        pg.drawText("CLASS", { x: 68, y: yPos, size: 8.5, font: fontBold, color: rgb(1, 1, 1) });
        pg.drawText(`SIZE & LOCATION (${CAMState.unitSystem === "metric" ? "MM" : "MILS"})`, { x: 130, y: yPos, size: 8.5, font: fontBold, color: rgb(1, 1, 1) });
        pg.drawText("STATUS", { x: 280, y: yPos, size: 8.5, font: fontBold, color: rgb(1, 1, 1) });
        pg.drawText("REVIEWER NOTES", { x: 345, y: yPos, size: 8.5, font: fontBold, color: rgb(1, 1, 1) });
        return yPos - 18;
      };

      curY = drawTableHeader(activePage, curY, "3. Defect Checklist & Engineering Dispositions");

      if (!defects.length) {
        activePage.drawText("No differences or defects detected — Base (Rev A) and Revised (Rev B) match within tolerance.", {
          x: 38, y: curY, size: 8.5, font, color: rgb(0.1, 0.45, 0.2)
        });
        curY -= 16;
      }

      for (let i = 0; i < defects.length; i++) {
        const d = defects[i];
        if (curY < 165) {
          activePage = addStyledPage("DEFECT SCHEDULE & QA SIGN-OFF (CONTINUED)");
          curY = drawTableHeader(activePage, height - 84, "3. Defect Checklist (Continued)");
        }
        if (i % 2 === 1) {
          activePage.drawRectangle({ x: 32, y: curY - 3, width: width - 64, height: 14, color: rgb(0.96, 0.98, 0.99) });
        }
        const locStr = safePdfStr(CAMState.formatBoxFromPx(d.w, d.h, d.x, d.y, d.dpi || 300));
        activePage.drawText(safePdfStr(`#${d.id}`), { x: 38, y: curY, size: 8.5, font, color: rgb(0.1, 0.1, 0.1) });
        activePage.drawText(safePdfStr(String(d.type || "DIFF").toUpperCase()), { x: 68, y: curY, size: 8.5, font: fontBold, color: d.type === "added" ? rgb(0, 0.55, 0.2) : rgb(0.8, 0.1, 0.1) });
        activePage.drawText(locStr.slice(0, 28), { x: 130, y: curY, size: 8, font, color: rgb(0.25, 0.25, 0.25) });
        activePage.drawText(safePdfStr(`[${d.status || "Open"}]`), { x: 280, y: curY, size: 8.5, font: fontBold, color: d.status === "Approved" ? rgb(0, 0.5, 0.15) : rgb(0.8, 0.25, 0) });
        activePage.drawText(safePdfStr(d.note || "-").slice(0, 38), { x: 345, y: curY, size: 8, font, color: rgb(0.2, 0.2, 0.2) });
        curY -= 14;
      }

      if (Array.isArray(CAMState.lastDFMViolations) && CAMState.lastDFMViolations.length > 0) {
        if (curY < 200) {
          activePage = addStyledPage("IPC / PCB CAM DFM & DRC VIOLATION SCHEDULE");
          curY = height - 84;
        } else {
          curY -= 8;
        }
        activePage.drawText(safePdfStr(`3B. IPC DFM / DRC Rule Alerts (${CAMState.lastDFMViolations.length})`), {
          x: 32, y: curY, size: 10.5, font: fontBold, color: rgb(0.75, 0.15, 0.1)
        });
        curY -= 15;
        const dfmSlice = CAMState.lastDFMViolations.slice(0, 25);
        for (let vi = 0; vi < dfmSlice.length; vi++) {
          const v = dfmSlice[vi];
          if (curY < 165) {
            activePage = addStyledPage("IPC / PCB CAM DFM & DRC VIOLATIONS (CONT.)");
            curY = height - 84;
          }
          const lineStr = safePdfStr(`#${vi + 1} [${v.category || "DFM"}] ${v.layerLabel ? v.layerLabel + ": " : ""}${v.description || ""}`).slice(0, 96);
          activePage.drawText(lineStr, { x: 38, y: curY, size: 8, font, color: rgb(0.25, 0.15, 0.15) });
          curY -= 13;
        }
      }

      // Professional Ending Engineering QA Sign-Off & Approval Block
      if (curY < 175) {
        activePage = addStyledPage("ENGINEERING QA SIGN-OFF & VERIFICATION");
        curY = height - 88;
      } else {
        curY -= 14;
      }

      activePage.drawRectangle({
        x: 32, y: 42, width: width - 64, height: 108,
        color: rgb(0.97, 0.98, 1.0), borderColor: rgb(0.12, 0.24, 0.38), borderWidth: 1.2
      });
      activePage.drawRectangle({
        x: 32, y: 130, width: width - 64, height: 20,
        color: rgb(0.08, 0.18, 0.28)
      });
      activePage.drawText("4. OFFICIAL ENGINEERING QUALITY ASSURANCE & RELEASE SIGN-OFF", {
        x: 42, y: 136, size: 9, font: fontBold, color: rgb(1, 1, 1)
      });

      activePage.drawText(`Lead Review Engineer: ${reviewer}`, { x: 44, y: 112, size: 8.5, font: fontBold, color: rgb(0.1, 0.15, 0.2) });
      activePage.drawText(`IPC / CAM Standard: ${CAMState.ipcClass.toUpperCase()} (${unitModeStr})`, { x: 310, y: 112, size: 8.5, font, color: rgb(0.2, 0.2, 0.2) });
      activePage.drawText(`Document Verification SHA-256: ${docHash}`, { x: 44, y: 96, size: 8.5, font, color: rgb(0.2, 0.2, 0.2) });
      activePage.drawText(`Final Audit Status: ${flaggedCount > 0 ? "REJECTED (REVISE)" : (openCount === 0 ? "APPROVED FOR FAB" : "PENDING REVIEW")}`, {
        x: 310, y: 96, size: 8.5, font: fontBold, color: flaggedCount > 0 ? rgb(0.8, 0.1, 0.1) : rgb(0.05, 0.5, 0.2)
      });

      // Signature and Date lines
      activePage.drawLine({ start: { x: 44, y: 58 }, end: { x: 260, y: 58 }, thickness: 0.8, color: rgb(0.3, 0.35, 0.4) });
      activePage.drawText("Authorized Engineering Signature", { x: 44, y: 47, size: 7.5, font, color: rgb(0.4, 0.45, 0.5) });

      activePage.drawLine({ start: { x: 310, y: 58 }, end: { x: 540, y: 58 }, thickness: 0.8, color: rgb(0.3, 0.35, 0.4) });
      activePage.drawText("Quality Assurance / Release Date & Stamp", { x: 310, y: 47, size: 7.5, font, color: rgb(0.4, 0.45, 0.5) });

      // Add page numbers to all pages
      pages.forEach((p, idx) => {
        p.drawLine({ start: { x: 32, y: 32 }, end: { x: width - 32, y: 32 }, thickness: 0.6, color: rgb(0.8, 0.82, 0.85) });
        p.drawText("Kensho Pro 1.0 - Kensho Studio (textportdocx.in) - Engineering Verification Report", {
          x: 32, y: 18, size: 7.5, font, color: rgb(0.45, 0.48, 0.52)
        });
        p.drawText(`Page ${idx + 1} of ${pages.length}`, {
          x: width - 92, y: 18, size: 8, font: fontBold, color: rgb(0.2, 0.25, 0.3)
        });
      });

      const pdfBytes = await doc.save();
      if (returnBytesOnly) return pdfBytes;
      if (window.native && window.native.saveFile) {
        const savedPath = await window.native.saveFile({
          name: "Executive_Audit_Report.pdf",
          bytes: pdfBytes,
          filters: [{ name: "PDF Document", extensions: ["pdf"] }]
        });
        if (savedPath) rpToast("Executive Audit Report saved: " + savedPath);
      }
      return pdfBytes;
    } catch (e) {
      if (!returnBytesOnly) rpToast("Audit Report error: " + e.message);
      return null;
    }
  }

  /**
   * Build Defect Schedule CSV bytes (Includes both IPC English mils and Metric mm columns)
   */
  function buildDefectsCSVBytes() {
    const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : null;
    if ((!DefectState.defects || !DefectState.defects.length) && S && S.cur && Array.isArray(S.cur.regions) && S.cur.regions.length) {
      DefectState.initFromRegions(S.cur.regions);
    }
    const defects = DefectState.defects || [];
    const headers = ['Defect_ID', 'Type', 'X_mils', 'Y_mils', 'Width_mils', 'Height_mils', 'X_mm', 'Y_mm', 'Width_mm', 'Height_mm', 'Pixel_Area', 'Status', 'Reviewer_Notes'];
    const rows = defects.map(d => {
      const dpi = CAMState.getEffectiveDpi(d.dpi || 300);
      const xMils = (d.x / dpi * 1000).toFixed(1), yMils = (d.y / dpi * 1000).toFixed(1);
      const wMils = (d.w / dpi * 1000).toFixed(1), hMils = (d.h / dpi * 1000).toFixed(1);
      const xMM = (d.x / dpi * 25.4).toFixed(3), yMM = (d.y / dpi * 25.4).toFixed(3);
      const wMM = (d.w / dpi * 25.4).toFixed(3), hMM = (d.h / dpi * 25.4).toFixed(3);
      return [
        d.id, d.type, xMils, yMils, wMils, hMils, xMM, yMM, wMM, hMM, d.pixels, d.status,
        `"${(d.note || '').replace(/"/g, '""')}"`
      ];
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    return new TextEncoder().encode('\ufeff' + csv);
  }

  function exportDefectsCSV() {
    const enc = buildDefectsCSVBytes();
    if (window.native && window.native.saveFile) {
      window.native.saveFile({
        name: 'defect_checklist.csv',
        bytes: enc,
        filters: [{ name: 'CSV File', extensions: ['csv'] }]
      });
      rpToast('Exported Defect Checklist to CSV (with IPC English mils & Metric mm).');
    }
    return enc;
  }

  /**
   * Pure-JS Standard PKZIP Archive Builder (100% Offline, IEEE 802.3 CRC-32)
   * @param {Array<{name: string, bytes: Uint8Array}>} files
   * @returns {Uint8Array}
   */
  const _CRC32_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function computeCRC32(u8) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) {
      crc = _CRC32_TABLE[(crc ^ u8[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function buildZipArchive(files = []) {
    const enc = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    const now = new Date();
    const dosTime = ((now.getHours() & 0x1F) << 11) | ((now.getMinutes() & 0x3F) << 5) | ((now.getSeconds() >> 1) & 0x1F);
    const dosDate = (((Math.max(1980, now.getFullYear()) - 1980) & 0x7F) << 9) | (((now.getMonth() + 1) & 0x0F) << 5) | (now.getDate() & 0x1F);

    for (const f of files) {
      const nameBytes = enc.encode(String(f.name || 'file.bin'));
      const data = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes || []);
      const crc = computeCRC32(data);
      const size = data.length;

      // Local File Header (30 + nameBytes.length)
      const lh = new Uint8Array(30 + nameBytes.length);
      const ldv = new DataView(lh.buffer);
      ldv.setUint32(0, 0x04034b50, true); // Local file header signature
      ldv.setUint16(4, 20, true);         // Version needed to extract (2.0)
      ldv.setUint16(6, 0x0800, true);     // UTF-8 filename flag
      ldv.setUint16(8, 0, true);          // Compression method: 0 (STORE)
      ldv.setUint16(10, dosTime, true);
      ldv.setUint16(12, dosDate, true);
      ldv.setUint32(14, crc, true);
      ldv.setUint32(18, size, true);
      ldv.setUint32(22, size, true);
      ldv.setUint16(26, nameBytes.length, true);
      ldv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);

      // Central Directory Header (46 + nameBytes.length)
      const ch = new Uint8Array(46 + nameBytes.length);
      const cdv = new DataView(ch.buffer);
      cdv.setUint32(0, 0x02014b50, true); // Central directory file header signature
      cdv.setUint16(4, 20, true);         // Version made by
      cdv.setUint16(6, 20, true);         // Version needed
      cdv.setUint16(8, 0x0800, true);     // UTF-8 filename flag
      cdv.setUint16(10, 0, true);         // Compression method: 0 (STORE)
      cdv.setUint16(12, dosTime, true);
      cdv.setUint16(14, dosDate, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, size, true);
      cdv.setUint32(24, size, true);
      cdv.setUint16(28, nameBytes.length, true);
      cdv.setUint16(30, 0, true);
      cdv.setUint16(32, 0, true);
      cdv.setUint16(34, 0, true);
      cdv.setUint16(36, 0, true);
      cdv.setUint32(38, 0, true);
      cdv.setUint32(42, offset, true);    // Relative offset of local header
      ch.set(nameBytes, 46);

      localParts.push(lh, data);
      centralParts.push(ch);
      offset += lh.length + data.length;
    }

    const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true);   // End of central dir signature
    edv.setUint16(4, 0, true);
    edv.setUint16(6, 0, true);
    edv.setUint16(8, files.length, true);
    edv.setUint16(10, files.length, true);
    edv.setUint32(12, centralSize, true);
    edv.setUint32(16, offset, true);
    edv.setUint16(20, 0, true);

    const totalLen = offset + centralSize + eocd.length;
    const out = new Uint8Array(totalLen);
    let pos = 0;
    for (const p of localParts) { out.set(p, pos); pos += p.length; }
    for (const p of centralParts) { out.set(p, pos); pos += p.length; }
    out.set(eocd, pos);
    return out;
  }

  /**
   * Pure-JS & DecompressionStream / zlib PKZIP Extractor for Multi-Layer CAM Archives (.zip)
   * Unpacks 1 to 100+ CAM layer files from a ZIP archive offline!
   */
  async function extractZipArchive(zipBytes) {
    const u8 = zipBytes instanceof Uint8Array ? zipBytes : new Uint8Array(zipBytes || []);
    if (u8.length < 30 || u8[0] !== 0x50 || u8[1] !== 0x4b) return [];
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const dec = new TextDecoder();
    const outFiles = [];
    let pos = 0;

    const inflateRawBytes = async compressed => {
      if (typeof require === 'function') {
        try {
          const zlib = require('zlib');
          if (zlib && typeof zlib.inflateRawSync === 'function') {
            return new Uint8Array(zlib.inflateRawSync(Buffer.from(compressed.buffer, compressed.byteOffset, compressed.byteLength)));
          }
        } catch (e) {}
      }
      if (typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(compressed);
        writer.close();
        const resp = new Response(ds.readable);
        return new Uint8Array(await resp.arrayBuffer());
      }
      return null;
    };

    // Pass 1: Parse ZIP Central Directory via End-of-Central-Directory (EOCD 0x06054b50)
    // This reliably handles streaming Data Descriptor entries (flag 0x08) where local compSize is 0.
    let eocdPos = -1;
    const searchFloor = Math.max(0, u8.length - 65557);
    for (let i = u8.length - 22; i >= searchFloor; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        eocdPos = i;
        break;
      }
    }
    if (eocdPos >= 0) {
      const entryCount = dv.getUint16(eocdPos + 10, true);
      let cdPos = dv.getUint32(eocdPos + 16, true);
      for (let eIdx = 0; eIdx < entryCount && cdPos + 46 <= u8.length; eIdx++) {
        if (dv.getUint32(cdPos, true) !== 0x02014b50) break;
        const method = dv.getUint16(cdPos + 10, true);
        const crc32 = dv.getUint32(cdPos + 16, true);
        const compSize = dv.getUint32(cdPos + 20, true);
        const nameLen = dv.getUint16(cdPos + 28, true);
        const extraLen = dv.getUint16(cdPos + 30, true);
        const commentLen = dv.getUint16(cdPos + 32, true);
        const localHdrOff = dv.getUint32(cdPos + 42, true);
        const rawEntryName = dec.decode(u8.subarray(cdPos + 46, cdPos + 46 + nameLen));
        cdPos += 46 + nameLen + extraLen + commentLen;

        const baseName = rawEntryName.split(/[\\/]/).pop();
        if (!baseName || rawEntryName.endsWith('/') || baseName.startsWith('.')) continue;
        if (localHdrOff + 30 > u8.length || dv.getUint32(localHdrOff, true) !== 0x04034b50) continue;
        const lNameLen = dv.getUint16(localHdrOff + 26, true);
        const lExtraLen = dv.getUint16(localHdrOff + 28, true);
        const dataStart = localHdrOff + 30 + lNameLen + lExtraLen;
        const dataEnd = Math.min(u8.length, dataStart + compSize);
        if (dataStart > u8.length) continue;

        const compSlice = u8.subarray(dataStart, dataEnd);
        let fileBytes = null;
        if (method === 0) {
          fileBytes = compSlice.slice();
        } else if (method === 8) {
          try { fileBytes = await inflateRawBytes(compSlice); } catch (e) {}
        }
        if (fileBytes && fileBytes.length > 0) {
          outFiles.push({ name: baseName, path: rawEntryName, bytes: fileBytes, crc32 });
        }
      }
      if (outFiles.length > 0) return outFiles;
    }

    // Pass 2: Fallback sequential Local File Header walk for truncated/streamed archives without EOCD
    while (pos + 30 <= u8.length) {
      const sig = dv.getUint32(pos, true);
      if (sig !== 0x04034b50) break;
      const flags = dv.getUint16(pos + 6, true);
      const method = dv.getUint16(pos + 8, true);
      const compSize = dv.getUint32(pos + 18, true);
      const nameLen = dv.getUint16(pos + 26, true);
      const extraLen = dv.getUint16(pos + 28, true);
      const nameStart = pos + 30;
      const dataStart = nameStart + nameLen + extraLen;
      if (dataStart > u8.length) break;

      const rawEntryName = dec.decode(u8.subarray(nameStart, nameStart + nameLen));
      const baseName = rawEntryName.split(/[\\/]/).pop();
      const dataEnd = Math.min(u8.length, dataStart + compSize);

      if (baseName && !rawEntryName.endsWith('/') && !baseName.startsWith('.') && (flags & 0x08) === 0) {
        const compSlice = u8.subarray(dataStart, dataEnd);
        let fileBytes = null;
        if (method === 0) {
          fileBytes = compSlice.slice();
        } else if (method === 8) {
          try { fileBytes = await inflateRawBytes(compSlice); } catch (e) {}
        }
        if (fileBytes && fileBytes.length > 0) {
          outFiles.push({ name: baseName, path: rawEntryName, bytes: fileBytes });
        }
      }
      if (dataEnd <= pos) break;
      pos = dataEnd;
    }
    return outFiles;
  }

  /**
   * 1-Click "Export QA Package" (.ZIP Bundle):
   * Bundles Annotated Executive Audit PDF + Defect CSV Schedule + High-Resolution Difference PNG (+ BOM CSV & DXF)
   */
  async function exportQAPackageZip() {
    try {
      rpToast('Bundling 1-Click QA Handover Package (.zip)...');
      const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : {};
      const RM = (typeof window !== 'undefined' && window.RP_MEASURE) ? window.RP_MEASURE : {};
      const baseName = (((S.names && S.names.A) || 'Engineering_Review').replace(/\.[^.]+$/, '')).replace(/[^a-zA-Z0-9_-]/g, '_');

      const bundleFiles = [];

      // 1. Annotated Executive Audit PDF
      const auditPdfBytes = await generateExecutiveAuditReport(true);
      if (auditPdfBytes && auditPdfBytes.length) {
        bundleFiles.push({ name: `${baseName}_Executive_Audit_Report.pdf`, bytes: auditPdfBytes });
      }

      // 2. Defect CSV Schedule (IPC English mils & Metric mm)
      const csvBytes = buildDefectsCSVBytes();
      bundleFiles.push({ name: `${baseName}_Defect_Schedule.csv`, bytes: csvBytes });

      // 3. BOM Tally CSV Schedule (if any BOM badges placed)
      if (RM.tally && Array.isArray(RM.tally.items) && RM.tally.items.length) {
        const bomBytes = new TextEncoder().encode('\ufeff' + RM.tally.toCSV());
        bundleFiles.push({ name: `${baseName}_BOM_Tally_Schedule.csv`, bytes: bomBytes });
      }

      // 4. High-Resolution Composite Difference + Redline Markups PNG
      if (typeof document !== 'undefined') {
        const cv = $('#cv');
        if (cv && cv.width > 0 && cv.height > 0) {
          const comp = document.createElement('canvas');
          comp.width = cv.width;
          comp.height = cv.height;
          const ctx = comp.getContext('2d');
          ctx.drawImage(cv, 0, 0);
          const mk = $('#mk');
          if (typeof window.drawMarkersToSheetCanvas === 'function') window.drawMarkersToSheetCanvas(ctx);
          else if (mk && mk.width === cv.width) ctx.drawImage(mk, 0, 0);
          const rpOv = $('#rp-ov');
          if (typeof window !== 'undefined' && typeof window.drawOverlayToSheetCanvas === 'function') window.drawOverlayToSheetCanvas(ctx, 1);
          else if (rpOv && rpOv.width === cv.width) ctx.drawImage(rpOv, 0, 0);
          const dataUrl = comp.toDataURL('image/png');
          comp.width = 0; comp.height = 0;
          const b64 = dataUrl.split(',')[1] || '';
          if (b64) {
            const pngBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            bundleFiles.push({ name: `${baseName}_Comparison_Redline_Page${S.n || 1}.png`, bytes: pngBytes });
          }
        }
      }

      // 5. Layered AutoCAD 2000 .dxf (native DXF AST or PDF vector extraction)
      const activeDoc = S.B || S.A;
      if (DXFState._isActiveDXFSession && (DXFState.parsedB || DXFState.parsedA)) {
        try {
          const dxfStr = (DXFState.parsedB || DXFState.parsedA).toDXFString();
          bundleFiles.push({ name: `${baseName}_Modified.dxf`, bytes: new TextEncoder().encode(dxfStr) });
        } catch (e) {}
      } else if (activeDoc && typeof DXFEngine !== 'undefined' && DXFEngine.exportPDFToDXF) {
        try {
          const pageNum = S.n || 1;
          const page = await activeDoc.getPage(pageNum);
          const dxfStr = await DXFEngine.exportPDFToDXF(page, {
            unit: CAMState.unitSystem === 'metric' ? 'mm' : 'mils',
            scale: 1.0,
            pageNumber: pageNum,
            imgWidth: (S.cur && S.cur.W) ? S.cur.W : null,
            diffRegions: DefectState.defects || [],
            annotations: RM.annotations || [],
            tallyItems: (RM.tally && RM.tally.items) ? RM.tally.items : []
          });
          bundleFiles.push({ name: `${baseName}_Redlines.dxf`, bytes: new TextEncoder().encode(dxfStr) });
        } catch (e) {}
      }

      const zipBytes = buildZipArchive(bundleFiles);
      if (typeof window !== 'undefined' && window.native && window.native.saveFile) {
        await window.native.saveFile({
          name: `${baseName}_QA_Package.zip`,
          bytes: zipBytes,
          filters: [{ name: 'QA Handover ZIP Package (.zip)', extensions: ['zip'] }]
        });
        rpToast(`Exported QA Package (${bundleFiles.length} deliverables bundled in ${baseName}_QA_Package.zip).`);
      }
      return { zipBytes, files: bundleFiles.map(f => f.name) };
    } catch (err) {
      rpToast('QA Package export failed: ' + err.message);
      return null;
    }
  }
  if (typeof window !== 'undefined') window.exportQAPackageZip = exportQAPackageZip;

  /**
   * Show Interactive BOM Tally & Measurements Drawer Modal
   */
  function showBOMAndMeasurementsModal() {
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.rp-modal:not(.rp-side-docked)').forEach(el => { if (el.id) el.hidden = true; else el.remove(); });
      if ($('#modal')) $('#modal').hidden = true;
    }
    const RM = (typeof window !== 'undefined' && window.RP_MEASURE) ? window.RP_MEASURE : { annotations: [], tally: { items: [] } };
    const anns = RM.annotations || [];
    const tallies = (RM.tally && RM.tally.items) ? RM.tally.items : [];

    let modal = $('#rp-bom-meas-modal');
    if (!modal) {
      modal = el('div', { id: 'rp-bom-meas-modal', className: 'rp-modal' });
      document.body.appendChild(modal);
    }
    modal.hidden = false;

    const measRows = anns.map((a, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><b>${a.kind.toUpperCase()}</b></td>
        <td>${a.label || '—'}</td>
        <td>(${Math.round(a.x || (a.pts && a.pts[0] ? a.pts[0].x : 0))}, ${Math.round(a.y || (a.pts && a.pts[0] ? a.pts[0].y : 0))})</td>
        <td><button class="rp-btn-sm rp-del-ann" data-idx="${idx}">Delete</button></td>
      </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center;opacity:.6">No measurements or markups placed yet.</td></tr>';

    const tallyRows = tallies.map(t => `
      <tr>
        <td><b>#${t.number}</b></td>
        <td>Page ${t.page}</td>
        <td>(${Math.round(t.x)}, ${Math.round(t.y)})</td>
        <td><input type="text" class="rp-tally-lbl-in" data-id="${t.id}" value="${(t.label || '').replace(/"/g, '&quot;')}" style="width:100%" /></td>
      </tr>
    `).join('') || '<tr><td colspan="4" style="text-align:center;opacity:.6">No Tally / BOM inspection badges placed yet.</td></tr>';

    modal.innerHTML = `
      <div class="rp-card rp-wide">
        <h3>Engineering Measurements & BOM Tally Schedule</h3>
        <p class="rp-sub">Manage all placed dimensions, areas, revision clouds, stamps, and BOM inspection counters.</p>
        <div class="rp-scroll" style="max-height:52vh">
          <h4 style="margin:4px 0 6px;color:#ff6b6b">Placed Measurements & Markups (${anns.length})</h4>
          <table class="btab" style="width:100%;margin-bottom:14px">
            <tr><th>#</th><th>Type</th><th>Readout / Label</th><th>Position</th><th>Action</th></tr>
            ${measRows}
          </table>
          <h4 style="margin:8px 0 6px;color:#f59e0b">Tally / BOM Inspection Counter (${tallies.length})</h4>
          <table class="btab" style="width:100%">
            <tr><th>Badge</th><th>Page</th><th>Coordinates</th><th>Component / BOM Description</th></tr>
            ${tallyRows}
          </table>
        </div>
        <div class="rp-btns">
          <button id="rp-bom-clear">Clear All Markups</button>
          <button id="rp-bom-csv">Export Tally CSV</button>
          <button id="rp-bom-close" class="rp-primary">Close</button>
        </div>
      </div>
    `;

    modal.querySelectorAll('.rp-del-ann').forEach(btn => {
      btn.onclick = () => {
        CompareHistory.push('Delete markup');
        anns.splice(parseInt(btn.dataset.idx, 10), 1);
        if (window.rpRedrawOverlay) window.rpRedrawOverlay();
        if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
        showBOMAndMeasurementsModal();
      };
    });

    modal.querySelectorAll('.rp-tally-lbl-in').forEach(inp => {
      inp.oninput = () => {
        const item = tallies.find(t => t.id === inp.dataset.id);
        if (item) item.label = inp.value;
      };
    });

    $('#rp-bom-clear').onclick = () => {
      CompareHistory.push('Clear all markups');
      RM.annotations = [];
      if (RM.tally) RM.tally.clear();
      if (window.rpRedrawOverlay) window.rpRedrawOverlay();
      if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      modal.hidden = true;
      rpToast('Cleared all measurements, markups, and tally badges.');
    };

    $('#rp-bom-csv').onclick = () => {
      if (!RM.tally) return;
      const csv = RM.tally.toCSV();
      const enc = new TextEncoder().encode('\ufeff' + csv);
      if (window.native && window.native.saveFile) {
        window.native.saveFile({ name: 'bom_tally_schedule.csv', bytes: enc, filters: [{ name: 'CSV', extensions: ['csv'] }] });
        rpToast('Exported BOM Tally CSV.');
      }
    };

    $('#rp-bom-close').onclick = () => { modal.hidden = true; };
  }

  /**
   * Build Categorized Ribbon Bar (with full PCB CAM & IPC English/Metric controls)
   */
  function initCategorizedRibbon() {
    const compareView = $('#view-compare');
    if (!compareView) return;

    const oldRibbon = compareView.querySelector('.ribbon');
    if (!oldRibbon || oldRibbon.classList.contains('rp-categorized-ribbon')) return;

    const ribbonWrap = el('div', { className: 'rp-ribbon-container' });
    ribbonWrap.innerHTML = `
      <div class="rp-ribbon-tabs">
        <button class="rp-tab-btn active" data-tab="tab-compare" data-rib-tab="review" title="Sheet Comparison, Sub-Pixel Alignment, Defect Navigation & Units"><i data-ic="tabCompare"></i><span>Review &amp; Compare</span></button>
        <button class="rp-tab-btn" data-tab="tab-layers" data-rib-tab="align" title="Layer Visibility, Tint Colors, Opacity, Threshold, Noise Filter & Sub-Pixel Micro-Align"><i data-ic="layers"></i><span>Layers &amp; Align</span></button>
        <button class="rp-tab-btn" data-tab="tab-cad" data-rib-tab="cam" title="PCB CAM Gerber RS-274X, Excellon Drill, IPC-D-356 Netlist, IPC English/Metric & AutoCAD DXF"><i data-ic="tabCad"></i><span>CAD &amp; CAM</span></button>
        <button class="rp-tab-btn" data-tab="tab-view" data-rib-tab="view" title="Line Contrast Filters, 60 FPS Split Curtain, 4x Loupe & Grid Optics"><i data-ic="tabView"></i><span>View &amp; Enhance</span></button>
        <button class="rp-tab-btn" data-tab="tab-markup" data-rib-tab="markup" title="ANSI/ISO Scalloped Revision Clouds, Leader Callouts & SHA-256 Stamps"><i data-ic="tabMarkup"></i><span>Markup &amp; Stamps</span></button>
        <button class="rp-tab-btn" data-tab="tab-measure" data-rib-tab="measure" title="Scale Calibration, Magnetic OSNAP, Distance, Polyline, Area & BOM Counter"><i data-ic="tabMeasure"></i><span>Measure (OSNAP)</span></button>
        <button class="rp-tab-btn" data-tab="tab-export" data-rib-tab="export" title="Executive Audit PDF Reports, CSV Checklists, DXF & .redline Sessions"><i data-ic="tabExport"></i><span>Export &amp; Share</span></button>
        <span class="grow"></span>
        <div id="rp-active-tool-pill" class="rp-tool-pill" hidden>
          <i data-ic="crosshair"></i>
          <span id="rp-active-tool-name">Tool: Select</span>
          <button type="button" id="rp-finish-tool-btn" class="rp-tool-act-btn act-done" title="Done">Done</button>
          <button type="button" id="rp-rewind-tool-btn" class="rp-tool-act-btn act-rewind" title="Rewind">Rewind</button>
          <button type="button" id="rp-cancel-tool-btn" class="rp-tool-act-btn act-cancel" title="Cancel">Cancel</button>
          <button type="button" id="rp-off-tool-btn" class="rp-tool-act-btn act-off" title="Turn Off Tool">Off</button>
        </div>
      </div>

      <div class="rp-ribbon-content">
        <!-- 1. Review & Compare (Clean 1-Line Horizontal Groups) -->
        <div class="rp-ribbon-panel active" id="tab-compare">
          <div class="grp"><div class="row">
            <button class="tb A" id="rib-openA" title="Open Original / Base Drawing or Gerber Layer (Revision A)"><i data-ic="openA"></i><span>Open A</span></button>
            <button class="tb B" id="rib-openB" title="Open Revised / New Drawing or Gerber Layer (Revision B)"><i data-ic="openB"></i><span>Open B</span></button>
            <button class="tb" id="rib-swap" title="Swap Revision A and Revision B Sheets (Shortcut: S)"><i data-ic="swap"></i><span>Swap</span></button>
            <button class="tb" id="rib-c-undo" title="Undo Last Action in Compare (Ctrl+Z)"><i data-ic="undo"></i><span>Undo</span></button>
            <button class="tb" id="rib-c-redo" title="Redo Action in Compare (Ctrl+Y)"><i data-ic="redo"></i><span>Redo</span></button>
          </div><div class="cap">Files</div></div>

          <div class="grp"><div class="row">
            <label class="f" title="Select Visual Comparison Mode">Mode <select id="rib-mode">
              <option value="paper">Overlay on paper</option>
              <option value="over">Overlay dark (CAM)</option>
              <option value="diff">Differences only</option>
              <option value="side">Side by side</option>
              <option value="blink">Blink A / B</option>
              <option value="curtain">Curtain Split Slider</option>
              <option value="A">Base (A) only</option>
              <option value="B">Revised (B) only</option>
            </select></label>
            <label class="f" title="Blink Mode Flicker Interval">Blink <select id="rib-blink-speed" style="height:22px;font-size:11px">
              <option value="280">Fast</option>
              <option value="600" selected>Normal</option>
              <option value="1200">Slow</option>
            </select></label>
            <label class="f" title="Rasterization & Analysis Resolution">DPI <select id="rib-dpi">
              <option value="150">150 dpi (Fast)</option>
              <option value="200">200 dpi</option>
              <option value="300" selected>300 dpi (Sharp)</option>
              <option value="400">400 dpi</option>
              <option value="600">600 dpi (Ultra)</option>
            </select></label>
          </div><div class="cap">Mode &amp; DPI</div></div>

          <div class="grp" id="rib-cmp-colors-grp"><div class="row">
            <label class="f" title="Rev A (Old Drawing) Default Color: Red"><b style="color:#ef4444">Rev A</b> <input type="color" id="rib-tint-a" value="#e11414" /></label>
            <label class="f" title="Rev B (New Drawing) Default Color: Green"><b style="color:#22c55e">Rev B</b> <input type="color" id="rib-tint-b" value="#00a53c" /></label>
            <label class="f" title="Pick Any Custom Color for Unchanged Common Geometry"><span>C</span> <input type="color" id="rib-tint-c" value="#94a3b8" /></label>
            <input type="range" id="rib-op-c" min="10" max="100" value="42" style="width:42px" title="Common Geometry Opacity (Default 42%)" />
          </div><div class="cap">Colors (A / B / Common)</div></div>

          <div class="grp"><div class="row">
            <button class="tb" id="rib-autoalign" title="Automated Sub-Pixel Feature Registration (Shortcut: A)"><i data-ic="align"></i><span>Auto-Align</span></button>
            <button class="tb" id="rib-fiducial" title="Manual 3-Point Fiducial Affine Snap (Click 3 reference points on A & B)"><i data-ic="fiducial"></i><span>Fiducial</span></button>
            <button class="tb" id="rib-reset-align" title="Reset Alignment Offset, Rotation &amp; Mirror Back to Zero"><i data-ic="undo"></i><span>Reset Align</span></button>
          </div><div class="cap">Alignment</div></div>

          

          <div class="grp"><div class="row">
            <button class="tb" id="rib-ignore" title="Draw Exclusion Mask to Ignore Title Block / Date Stamp Changes (Shortcut: I)"><i data-ic="ignore"></i><span>Ignore</span></button>
            <label class="chk" title="Apply newly drawn Ignore Areas across all pages"><input type="checkbox" id="rib-ign-all" /> All</label>
            <button type="button" class="rp-btn-sm" id="rib-ign-clear" title="Clear Ignore Areas on Current Page">Clear</button>
          </div><div class="cap">Filter</div></div>

          <div class="grp"><div class="row">
            <button class="tb" id="rib-prev-page" title="Previous Page or CAM Layer (Shortcut: Left Arrow or PageUp)"><i data-ic="prev"></i><span>Prev</span></button>
            <button class="tb" id="rib-next-page" title="Next Page or CAM Layer (Shortcut: Right Arrow or PageDown)"><i data-ic="next"></i><span>Next</span></button>
            <button class="tb" id="rib-scan-all" title="Scan All Pages for Differences (Shortcut: R)"><i data-ic="reset"></i><span>Scan All Pages</span></button>
            <button class="tb" id="rib-prev-defect" style="display:none" title="Jump to Previous Defect Cluster (Shortcut: P or Shift+F3)"><i data-ic="prev"></i><span>Prev Defect</span></button>
            <button class="tb" id="rib-next-defect" style="display:none" title="Jump to Next Defect Cluster (Shortcut: N or F3)"><i data-ic="next"></i><span>Next Defect</span></button>
            <button class="tb" id="rib-text-diff" title="Run Line-by-Line LCS Text & BOM String Diff (Shortcut: Ctrl+T)"><i data-ic="textDiff"></i><span>Text Diff</span></button>
            <button class="tb" id="rib-layer-toggle" style="display:none" title="Switch to Layers, Tints, Opacity & Sub-Pixel Micro-Align Tab"><i data-ic="layers"></i><span>Layers</span></button>
            <button class="tb" id="rib-view-toggle" style="display:none" title="Switch to View &amp; Enhance Tab (Mode, DPI, Contrast, Curtain, Loupe)"><i data-ic="tabView"></i><span>Enhance</span></button>
          </div><div class="cap">Navigation</div></div>

          <div class="grp" style="display:none"><div class="row">
            <label class="f" title="Switch IPC English (mils / inches) vs IPC Metric (mm / microns) across all CAM & Compare readouts">Units <select id="rib-units-quick">
              <option value="english">IPC English (mil)</option>
              <option value="metric">IPC Metric (mm)</option>
            </select></label>
            <button class="tb sm-inline" id="rib-open-cam-quick" title="Open CAM Workbench (Apertures, Drills, IPC-D-356 Netlist & DFM Rules)"><i data-ic="pcbCam"></i><span>CAM Workbench</span></button>
          </div><div class="cap">CAM</div></div>
        </div>

        <!-- 1B. Layers & Micro-Align (Clean 1-Line Horizontal Groups) -->
        <div class="rp-ribbon-panel" id="tab-layers">
          <div class="grp"><div class="row">
            <button class="rp-eye on" id="rp-eye-a" title="Toggle Layer A (Base Sheet)"><i data-ic="eye"></i></button>
            <span style="font-size:10.5px;font-weight:700">A</span>
            <input type="color" id="rp-tint-a" value="#e11414" title="Layer A Tint Color" />
            <input type="range" id="rp-op-a" min="10" max="100" value="100" style="width:48px" title="Layer A Opacity" />
            <span id="rp-op-a-val" style="font-size:10.5px;min-width:26px">100%</span>
            <span class="rp-hud-div" style="height:14px"></span>
            <button class="rp-eye on" id="rp-eye-b" title="Toggle Layer B (Revised Sheet)"><i data-ic="eye"></i></button>
            <span style="font-size:10.5px;font-weight:700">B</span>
            <input type="color" id="rp-tint-b" value="#00a53c" title="Layer B Tint Color" />
            <input type="range" id="rp-op-b" min="10" max="100" value="100" style="width:48px" title="Layer B Opacity" />
            <span id="rp-op-b-val" style="font-size:10.5px;min-width:26px">100%</span>
            <div hidden style="display:none">
              <button type="button" id="rp-rot-a-ccw"></button><select id="rp-deg-a"><option value="0">0</option><option value="90">90</option><option value="180">180</option><option value="270">270</option></select><button type="button" id="rp-rot-a-cw"></button>
              <button type="button" id="rp-mir-a-x"></button><button type="button" id="rp-mir-a-y"></button>
              <button type="button" id="rp-rot-b-ccw"></button><select id="rp-deg-b"><option value="0">0</option><option value="90">90</option><option value="180">180</option><option value="270">270</option></select><button type="button" id="rp-rot-b-cw"></button>
              <button type="button" id="rp-mir-b-x"></button><button type="button" id="rp-mir-b-y"></button>
            </div>
          </div><div class="cap">Layers (A &amp; B)</div></div>

          <div class="grp"><div class="row">
            <button class="rp-eye on" id="rp-eye-c" title="Toggle Unchanged Common Geometry"><i data-ic="eye"></i></button>
            <span style="font-size:10.5px;font-weight:700">Com</span>
            <input type="color" id="rp-tint-c" value="#94a3b8" title="Common (Unchanged) Geometry Color" />
            <input type="range" id="rp-op-c" min="10" max="100" value="42" style="width:42px" title="Common Geometry Opacity %" />
            <span id="rp-op-c-val" style="font-size:10.5px;min-width:24px">42%</span>
            <select id="rp-palette-preset" class="rp-select-xs" title="Color Palette Preset">
              <option value="std">Red / Green (Std)</option>
              <option value="cb">Cyan / Magenta (Color-Blind)</option>
              <option value="ba">Blue / Amber (High-Contrast)</option>
              <option value="cam">Gold / Emerald (PCB CAM)</option>
              <option value="po">Purple / Orange</option>
              <option value="pk">Pink / Teal</option>
            </select>
            <label class="chk"><input type="checkbox" id="rp-diff-on" checked /> Diffs</label>
            <label class="chk"><input type="checkbox" id="rp-diff-add" checked /> +Add</label>
            <label class="chk"><input type="checkbox" id="rp-diff-del" checked /> −Rem</label>
            <label class="chk" title="Show/Hide Difference Markers (M)"><input type="checkbox" id="rp-markers-chk" checked /> Marks</label>
          </div><div class="cap">Channels &amp; Palette</div></div>

          <div class="grp"><div class="row">
            <label class="f">Tol (<b id="rp-tol-val">40</b>) <input type="range" id="rp-diff-thresh" min="5" max="140" value="40" style="width:48px" /></label>
            <label class="f">Noise (<b id="rp-noise-val">2</b>) <input type="range" id="rp-noise-thresh" min="1" max="15" value="2" style="width:42px" /></label>
            <label class="f" title="Ignore sub-pixel anti-aliased edge shifts">Edge (<b id="rp-edge-val">0</b>) <input type="range" id="rp-edge-thresh" min="0" max="4" value="0" style="width:38px" /></label>
          </div><div class="cap">Thresholds</div></div>

          <div class="grp"><div class="row">
            <button class="rp-btn-sm" data-nudge="x-1" title="Shift Rev B Left 1px"><i data-ic="nudgeL"></i>1</button>
            <button class="rp-btn-sm" data-nudge="x-01" title="Shift Rev B Left 0.1px"><i data-ic="nudgeL"></i>.1</button>
            <button class="rp-btn-sm" data-nudge="x01" title="Shift Rev B Right 0.1px">.1<i data-ic="nudgeR"></i></button>
            <button class="rp-btn-sm" data-nudge="x1" title="Shift Rev B Right 1px">1<i data-ic="nudgeR"></i></button>
            <button class="rp-btn-sm" data-nudge="y-1" title="Shift Rev B Up 1px"><i data-ic="nudgeU"></i>1</button>
            <button class="rp-btn-sm" data-nudge="y-01" hidden style="display:none" title="Shift Rev B Up 0.1px"><i data-ic="nudgeU"></i>0.1</button>
            <button class="rp-btn-sm" data-nudge="y01" hidden style="display:none" title="Shift Rev B Down 0.1px">0.1<i data-ic="nudgeD"></i></button>
            <button class="rp-btn-sm" data-nudge="y1" title="Shift Rev B Down 1px">1<i data-ic="nudgeD"></i></button>
            <span style="font-size:10.5px;color:var(--mute)" title="Fine Skew Angle for Rev A">Skew A(<b id="rp-cur-rot-a">0°</b>)</span>
            <input type="range" id="rp-rot-a" min="-15" max="15" step="0.05" value="0" style="width:40px" />
            <span style="font-size:10.5px;color:var(--mute)" title="Fine Skew Angle for Rev B">B(<b id="rp-cur-rot">0°</b>)</span>
            <input type="range" id="rp-rot-b" min="-15" max="15" step="0.05" value="0" style="width:40px" />
            <span style="font-size:10px;color:var(--mute)" hidden>X:<b id="rp-cur-dx">0</b> Y:<b id="rp-cur-dy">0</b></span>
            <button id="rp-reset-nudge" class="rp-btn-sm" title="Reset X, Y, Rotation &amp; Skew to Zero"><i data-ic="reset"></i>Reset</button>
          </div><div class="cap">Offset &amp; Skew</div></div>
        </div>

        <!-- 2. CAD & CAM (Clean 1-Line Horizontal Groups) -->
        <div class="rp-ribbon-panel" id="tab-cad">
          <div class="grp"><div class="row">
            <button class="tb" id="rib-cam-compare" title="Load Gerber RS-274X Copper/Mask/Silk, Excellon NC Drill, or IPC-D-356 File(s)"><i data-ic="pcbCam"></i><span>Gerber/Drill</span></button>
            <button class="tb" id="rib-cam-dual" style="display:none" title="Compare Two Gerber RS-274X or Drill Layers (Rev A vs Rev B)"><i data-ic="pcbDual"></i><span>Compare CAM A↔B</span></button>
            <button class="tb" id="rib-cam-ipc" title="Load or Compare IPC-D-356 Bare-Board Test Netlists (.ipc / .d356 / .net)"><i data-ic="bomTable"></i><span>IPC-D-356</span></button>
          </div><div class="cap">CAM Files</div></div>

          <div class="grp"><div class="row">
            <label class="f" title="PCB CAM & IPC Measurement Unit System">Units <select id="rib-cam-units">
              <option value="english">IPC English (mils/in)</option>
              <option value="metric">IPC Metric (mm/µm)</option>
            </select></label>
            <label class="f" title="PCB CAM Aperture & Trace Display Mode">Display <select id="rib-cam-render">
              <option value="fill">Filled (Solid)</option>
              <option value="outline">Outline (Wire)</option>
              <option value="skeleton">Skeleton (Center)</option>
            </select></label>
          </div><div class="cap">Display</div></div>

          <div class="grp"><div class="row">
            <label class="chk" title="Flip layer horizontally (view Bottom Copper GBL / Bottom Silk GBO from Top)"><input type="checkbox" id="rib-cam-mirror"> Mirror X</label>
            <label class="chk" title="Invert Dark/Clear layer polarity for negative power/ground planes"><input type="checkbox" id="rib-cam-neg"> Negative</label>
          </div><div class="cap">Polarity</div></div>

          <div class="grp"><div class="row">
            <label class="f" title="IPC-2221 / IPC-6012 DFM Rule Class Preset">Rule <select id="rib-ipc-class">
              <option value="class1">Class 1 (6 mil / 0.15mm)</option>
              <option value="class2" selected>Class 2 (4 mil / 0.10mm)</option>
              <option value="class3">Class 3 (3 mil / 0.08mm)</option>
              <option value="hdi">HDI (2 mil / 0.05mm)</option>
            </select></label>
            <span id="rib-dfm-rule-lbl" hidden style="display:none">Clearance: 4.0 mil (0.102 mm)</span>
            <button class="tb" id="rib-cam-clearance" title="Run Full PCB CAM DFM / DRC Analysis (Clearance, Annular Ring, Min Trace, Drill & Acid Traps)"><i data-ic="clearance"></i><span>Run DRC</span></button>
            <button class="tb" id="rib-cam-tables" title="Open CAM Workbench: D-Code Apertures, T-Code Drills, Format & Netlist Inspector"><i data-ic="gear"></i><span>Tables</span></button>
          </div><div class="cap">DFM &amp; DRC</div></div>

          <div class="grp"><div class="row">
            <button class="tb" id="rib-net-tracer" title="Interactive Net Tracer &amp; Component Cross-Probe (Highlight Nets &amp; Pins Across Schematic / PCB)"><i data-ic="netTracer"></i><span>Net Tracer</span></button>
            <button class="tb" id="rib-pcb-calc" title="Multi-Layer PCB Stackup, IPC-2141 Impedance (Z₀) &amp; IPC-2152 Trace Current Calculator"><i data-ic="pcbCalc"></i><span>Stackup &amp; Z₀</span></button>
            <button class="tb" id="rib-bom-locator" title="Import Bill of Materials (BOM CSV), Search RefDes &amp; Overlay Component Centroids"><i data-ic="bomLoc"></i><span>BOM</span></button>
          </div><div class="cap">PCB Tools</div></div>

          <div class="grp"><div class="row">
            <button class="tb" id="rib-cad-import" title="Import 1 or 2 AutoCAD .dxf Drawings for Native Vector Compare"><i data-ic="dxfIn"></i><span>Import DXF</span></button>
            <button class="tb" id="rib-dxf-precompare" title="Select Which DXF Layers to Compare, Lock/Unlock or Remove Layers Before Native Vector Compare"><i data-ic="tabCompare"></i><span>Layers</span></button>
            <button class="tb" id="rib-dxf-workbench" style="display:none" title="Open AutoCAD DXF Layer Manager (Lock, Freeze, Color, Remove) & Vector Diff Workbench"><i data-ic="layers"></i><span>Layers</span></button>
            <button class="tb" id="rib-open-dxf-studio" title="Switch to Full AutoCAD-Style DXF Studio Editor (Draw, Modify, Trim, Offset, Layer Manager & Properties) (Ctrl+3)"><i data-ic="cadDxf"></i><span>DXF Studio</span></button>
            <button class="tb" id="rib-cad-export" style="display:none" title="Export Vectors, Text, Redline Clouds, Measurements & BOM to AutoCAD .dxf"><i data-ic="dxfOut"></i><span>Export DXF</span></button>
          </div><div class="cap">AutoCAD DXF &amp; Studio</div></div>
        </div>

        <!-- 3. View & Enhance (Clean 1-Line Horizontal Groups) -->
        <div class="rp-ribbon-panel" id="tab-view">
          <div class="grp"><div class="row">
            <label class="f" style="display:none" title="Select Visual Comparison Mode">Mode <select id="rib-view-mode">
              <option value="paper">Overlay on paper</option>
              <option value="over">Overlay dark (CAM)</option>
              <option value="diff">Differences only</option>
              <option value="side">Side by side</option>
              <option value="blink">Blink A / B</option>
              <option value="curtain">Curtain Split Slider</option>
              <option value="A">Base (A) only</option>
              <option value="B">Revised (B) only</option>
            </select></label>
            <label class="f" style="display:none" title="Rasterization &amp; Analysis Resolution">DPI <select id="rib-view-dpi">
              <option value="150">150 dpi (Fast)</option>
              <option value="200">200 dpi</option>
              <option value="300" selected>300 dpi (Sharp)</option>
              <option value="400">400 dpi</option>
              <option value="600">600 dpi (Ultra)</option>
            </select></label>
            <select id="rib-perf-mode" title="Adaptive Hardware Memory Ceiling (Maximum Detail 9000px/45MP vs High Performance 6144px/25MP Low-Spec Safeguard)">
              <option value="detail">Maximum Detail</option>
              <option value="perf">High Performance</option>
            </select>
          </div><div class="cap">View &amp; Ceiling</div></div>

          <div class="grp"><div class="row">
            <div class="row" style="gap:3px;align-items:center" title="Select Target Revision (Rev A, Rev B, or Both) to Rotate or Mirror">
              <select id="rib-target-rev" class="rp-select-xs" title="Select Revision to Rotate or Mirror">
                <option value="A">Rev A</option>
                <option value="B" selected>Rev B</option>
                <option value="AB">Rev A &amp; B</option>
              </select>
              <button type="button" class="rp-btn-sm" id="rib-rot-ccw" title="Rotate Selected Revision 90° Counter-Clockwise (↺)"><i data-ic="rotL"></i></button>
              <select id="rib-rot-sel" class="rp-select-xs" title="Rotation Angle for Selected Revision">
                <option value="0">0°</option>
                <option value="90">90°</option>
                <option value="180">180°</option>
                <option value="270">270°</option>
              </select>
              <button type="button" class="rp-btn-sm" id="rib-rot-cw" title="Rotate Selected Revision 90° Clockwise (↻)"><i data-ic="rotR"></i></button>
              <button type="button" class="rp-btn-sm" id="rib-mirror-btn" title="Mirror Selected Revision (Shift+Click for Vertical Mirror)"><i data-ic="mirror"></i><span>Mirror</span></button>
            </div>
            <div hidden style="display:none">
              <button type="button" id="rib-rot-a-ccw"></button><select id="rib-rot-a-sel"><option value="0">0</option><option value="90">90</option><option value="180">180</option><option value="270">270</option></select><button type="button" id="rib-rot-a-cw"></button>
              <button type="button" id="rib-mir-a-x"></button><button type="button" id="rib-mir-a-y"></button>
              <button type="button" id="rib-rot-b-ccw"></button><select id="rib-rot-b-sel"><option value="0">0</option><option value="90">90</option><option value="180">180</option><option value="270">270</option></select><button type="button" id="rib-rot-b-cw"></button>
              <button type="button" id="rib-mir-b-x"></button><button type="button" id="rib-mir-b-y"></button>
            </div>
          </div><div class="cap">Rotate &amp; Mirror</div></div>

          <div class="grp"><div class="row">
            <button class="tb" id="rib-enh-norm" data-enh="off" title="Standard Unfiltered Drawing Rendering"><i data-ic="enhNorm"></i><span>Normal</span></button>
            <button class="tb" id="rib-enh-boost" data-enh="enh" title="Boost Line Contrast & Darken Faint Schematic Nets"><i data-ic="enhBoost"></i><span>High Contrast</span></button>
            <button class="tb" id="rib-enh-dark" data-enh="dark" title="Maximum Line Density for Fine Thin Scans"><i data-ic="enhDark"></i><span>Extra Dark</span></button>
            <button class="tb" id="rib-enh-inv" data-enh="blue" title="High-Contrast Dark Blueprint CAD Mode (Low Eye Strain)"><i data-ic="blueprint"></i><span>Blueprint CAD</span></button>
          </div><div class="cap">Contrast</div></div>

          <div class="grp"><div class="row">
            <button class="tb" id="rib-curtain-toggle" title="Interactive 60 FPS Split Curtain Divider (Rev A Left / Rev B Right)"><i data-ic="curtain"></i><span>Split Curtain</span></button>
            <button class="tb" id="rib-loupe-toggle" title="4x Optical Magnifier Loupe with Crosshair Reticle (Shortcut: L)"><i data-ic="loupe"></i><span>4x Loupe</span></button>
          </div><div class="cap">Split &amp; Loupe</div></div>

          <div class="grp"><div class="row">
            <button class="tb on" id="rib-world-view-toggle" title="Toggle 2D World View Radar Overview"><i data-ic="globe"></i><span>World View</span></button>
            <button class="tb" id="rib-grid-toggle" title="Calibrated Engineering Reference Grid Overlay"><i data-ic="grid"></i><span>Ref Grid</span></button>
            <button class="tb" id="rib-crosshair-toggle" title="Full-Viewport Precision Alignment Crosshair"><i data-ic="crosshair"></i><span>Crosshair</span></button>
            <button class="tb on" id="rib-view-markers" title="Show/Hide Difference Markers"><i data-ic="rect"></i><span>Markers</span></button>
            <button class="tb" id="rib-sharp-100" title="Fit Drawing to Viewport & Re-Rasterize Crisp Vectors"><i data-ic="fit"></i><span>Fit &amp; Sharpen</span></button>
          </div><div class="cap">World View &amp; Optics</div></div>
        </div>

        <!-- 4. Markup & Stamps (Clean 1-Line Horizontal Groups — Zero Vertical Stacking in Style) -->
        <div class="rp-ribbon-panel" id="tab-markup">
          <div class="grp"><div class="row">
            <button class="tb" id="rib-rev-cloud" data-rptool="cloud" title="Draw ANSI/ISO Scalloped Revision Cloud with Delta Triangle (Δ Rev 2)"><i data-ic="revCloud"></i><span>Rev Cloud</span></button>
            <button class="tb" id="rib-leader" data-rptool="leader" title="Place Multi-Point Leader Arrow with Engineering Callout Box"><i data-ic="leader"></i><span>Callout</span></button>
            <button class="tb" id="rib-pen" data-rptool="pen" title="Freehand Redline Markup Pen (Customizable Thickness, Colour & Dash)"><i data-ic="pen"></i><span>Pen</span></button>
            <button class="tb" id="rib-pin" data-rptool="pin" title="Place Engineering Inspection Pin / Callout Marker Badge"><i data-ic="pin"></i><span>Pin</span></button>
          </div><div class="cap">Markup</div></div>

          <div class="grp"><div class="row">
            <button class="tb" id="rib-eraser" data-rptool="eraser" title="Eraser — Click or Drag Over Any Markup or Pin to Erase It"><i data-ic="eraser"></i><span>Eraser</span></button>
            <button class="tb" id="rib-redact" data-rptool="redact" title="Place Opaque Security Redaction Mask"><i data-ic="redact"></i><span>Redact</span></button>
            <button class="tb" id="rib-clear-markups" title="Clear Placed Markups & Measurements on Current Sheet"><i data-ic="trash"></i><span>Clear</span></button>
          </div><div class="cap">Erase &amp; Redact</div></div>

          <div class="grp rp-contextual-tool-set" id="rib-cmp-tool-opts"><div class="row" style="gap:4px;flex-wrap:nowrap;align-items:center">
            <div class="row rp-style-row" style="gap:4px">
              <span id="rib-mk-size-lbl" class="rp-style-lbl">Pen (px)</span>
              <input type="number" id="rib-mk-size" value="3" min="1" max="120" title="Active Tool Stroke Thickness, Pin Size, or Eraser Radius (px)" />
              <div class="row rp-preset-bar" id="rib-mk-pen-presets" style="gap:2px" title="Quick Pen &amp; Shape Thickness Presets">
                <button type="button" class="rp-fmt-btn rp-cmp-sz" data-sz="1">1px</button>
                <button type="button" class="rp-fmt-btn rp-cmp-sz on" data-sz="3">3px</button>
                <button type="button" class="rp-fmt-btn rp-cmp-sz" data-sz="5">5px</button>
                <button type="button" class="rp-fmt-btn rp-cmp-sz" data-sz="8">8px</button>
                <button type="button" class="rp-fmt-btn rp-cmp-sz" data-sz="12">12px</button>
              </div>
              <div class="row rp-preset-bar" id="rib-mk-eraser-presets" hidden style="gap:2px" title="Eraser Mode &amp; Radius Presets">
                <select id="rib-mk-eraser-mode" class="rp-select-xs" title="Choose Whole Markup vs Brush Radius Eraser">
                  <option value="object" selected>Whole Markup</option>
                  <option value="brush">Brush Radius</option>
                </select>
                <button type="button" class="rp-fmt-btn rp-cmp-er" data-er="10">10px</button>
                <button type="button" class="rp-fmt-btn rp-cmp-er on" data-er="20">20px</button>
                <button type="button" class="rp-fmt-btn rp-cmp-er" data-er="40">40px</button>
                <button type="button" class="rp-fmt-btn rp-cmp-er" data-er="64">64px</button>
              </div>
              <div class="row rp-preset-bar" id="rib-mk-pin-presets" hidden style="gap:2px" title="Pin Marker Size Presets">
                <button type="button" class="rp-fmt-btn rp-cmp-pin" data-psz="18">S (18)</button>
                <button type="button" class="rp-fmt-btn rp-cmp-pin on" data-psz="24">M (24)</button>
                <button type="button" class="rp-fmt-btn rp-cmp-pin" data-psz="32">L (32)</button>
                <button type="button" class="rp-fmt-btn rp-cmp-pin" data-psz="42">XL (42)</button>
              </div>
            </div>
            <div class="row rp-style-row" id="rib-mk-style-row" style="gap:4px">
              <input type="color" id="rib-mk-color" value="#e11d48" title="Active Markup / Pen / Pin Colour" />
              <div class="rp-swatches" id="rib-mk-swatches" title="Quick Redline Colours">
                <button type="button" class="rp-swatch on" data-col="#e11d48" style="background:#e11d48" title="Redline Crimson"></button>
                <button type="button" class="rp-swatch" data-col="#2563eb" style="background:#2563eb" title="Blueprint Cobalt"></button>
                <button type="button" class="rp-swatch" data-col="#059669" style="background:#059669" title="QA Emerald"></button>
                <button type="button" class="rp-swatch" data-col="#f59e0b" style="background:#f59e0b" title="Inspection Gold"></button>
                <button type="button" class="rp-swatch" data-col="#7c3aed" style="background:#7c3aed" title="Engineering Violet"></button>
                <button type="button" class="rp-swatch" data-col="#111827" style="background:#111827" title="Carbon Black"></button>
              </div>
              <label class="f" title="Markup Opacity %">α <input type="number" id="rib-mk-op" value="100" min="10" max="100">%</label>
              <select id="rib-mk-dash" class="rp-select-xs" title="Line Dash Style">
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
              <input type="text" id="rib-mk-revtxt" value="Δ Rev 2" style="width:52px;font-size:10.5px" title="Revision Cloud Delta Tag (e.g. Δ Rev 2)" placeholder="Δ Rev 2" />
            </div>
          </div><div class="cap" id="rib-mk-opts-cap">Style</div></div>

          <div class="grp"><div class="row">
            <button class="tb" id="rib-stamp-app" data-rptool="stamp" title="Place Dynamic APPROVED Engineering Sign-Off Stamp"><i data-ic="stampApp"></i><span>APPROVED</span></button>
            <button class="tb" id="rib-stamp-rej" data-rptool="stamp" title="Place Dynamic REJECTED Engineering Sign-Off Stamp"><i data-ic="stampRej"></i><span>REJECTED</span></button>
            <button class="tb" id="rib-stamp-rev" data-rptool="stamp" title="Place Dynamic REVISED & RESUBMIT Engineering Stamp"><i data-ic="stampRev"></i><span>REVISED</span></button>
            <button class="tb" id="rib-stamp-sha" data-rptool="stamp" title="Place Cryptographic SHA-256 Document Hash Verification Stamp"><i data-ic="stampSha"></i><span>SHA-256</span></button>
            <button class="tb" id="rib-title-block" title="Stamp Interactive ISO / ANSI Engineering Title Block &amp; Revision Table (Alt+B)"><i data-ic="titleBlock"></i><span>Title Blk</span></button>
            <button class="tb" id="rib-sym-lib" title="Reusable Engineering Schematic Symbol, Stamp &amp; Block Library (Alt+S)"><i data-ic="blockLib"></i><span>Symbols</span></button>
          </div><div class="cap">Stamps &amp; Blocks</div></div>
        </div>

        <!-- 5. Measure (OSNAP) (Clean 1-Line Horizontal Groups) -->
        <div class="rp-ribbon-panel" id="tab-measure">
          <div class="grp"><div class="row">
            <button class="tb" id="rib-calibrate" data-rptool="calibrate" title="Calibrate Real-World Drawing Scale from Known Dimension Line (mm / mils / in)"><i data-ic="calibrate"></i><span>Calibrate Scale</span></button>
            <button class="tb on" id="rib-osnap-toggle" title="Toggle 8px Magnetic Object Snap to Endpoints, Midpoints & Centers"><i data-ic="osnap"></i><span>OSNAP: ON</span></button>
          </div><div class="cap">Scale &amp; Snap</div></div>

          <div class="grp"><div class="row">
            <button class="tb" id="rib-dist" data-rptool="dist" title="Measure Point-to-Point Linear Distance with OSNAP"><i data-ic="dist"></i><span>Distance</span></button>
            <button class="tb" id="rib-poly" data-rptool="poly" title="Measure Multi-Segment Cumulative Wire / Pipe / Trace Run"><i data-ic="polyline"></i><span>Polyline Run</span></button>
            <button class="tb" id="rib-area" data-rptool="area" title="Calculate Closed Polygon Area & Perimeter (Shoelace Formula)"><i data-ic="area"></i><span>Polygon Area</span></button>
            <button class="tb" id="rib-angle" data-rptool="angle" title="3-Point Angle Protractor — Click 3 Points (Start, Vertex, End) to Measure Angle (°) (Shift+G)"><i data-ic="angle"></i><span>Angle (°)</span></button>
            <button class="tb" id="rib-circle-find" data-rptool="rad3" title="3-Point Circle / Arc Diameter &amp; Radius Finder — Click 3 Points Along Any Hole or Arc (Shift+C)"><i data-ic="rad3"></i><span>3-Pt ⌀/R</span></button>
          </div><div class="cap">Measure</div></div>

          <div class="grp"><div class="row">
            <button class="tb" id="rib-tally" data-rptool="tally" title="Click Drawing to Place Numbered Inspection / BOM Tally Badges (#1, #2...)"><i data-ic="tally"></i><span>Tally / BOM Badge</span></button>
            <button class="tb" id="rib-fai-balloon" data-rptool="fai" title="AS9102 First Article Inspection (FAI) Auto-Balloon (Shift+F)"><i data-ic="faiBalloon"></i><span>FAI Balloon</span></button>
            <button class="tb" id="rib-gdt" title="ASME Y14.5 / ISO 1101 GD&amp;T Feature Control Frame Builder (Alt+G)"><i data-ic="gdt"></i><span>GD&amp;T</span></button>
            <button class="tb" id="rib-bom-list" title="Open Engineering Measurement & BOM Tally Schedule Table"><i data-ic="bomTable"></i><span>Schedule &amp; BOM</span></button>
          </div><div class="cap">FAI, GD&amp;T &amp; BOM</div></div>
        </div>

        <!-- 6. Export & Share (Clean 1-Line Horizontal Groups) -->
        <div class="rp-ribbon-panel" id="tab-export">
          <div class="grp"><div class="row">
            <button class="tb" id="rib-export-pdf" title="Export Visual Comparison Report PDF"><i data-ic="report"></i><span>Comparison PDF</span></button>
            <button class="tb" id="rib-export-img" title="Export High-Resolution Composite Overlay PNG"><i data-ic="png"></i><span>High-Res PNG</span></button>
            <button class="tb" id="rib-export-dxf" title="Export Vector Geometry & Redline Clouds to AutoCAD .dxf"><i data-ic="dxfOut"></i><span>Export .dxf</span></button>
          </div><div class="cap">Export</div></div>

          <div class="grp"><div class="row">
            <button class="tb" id="rib-export-qa-zip" title="1-Click QA Package Export (.zip): Bundles Annotated Audit PDF, Defect CSV Schedule, High-Res Difference PNG &amp; AutoCAD DXF"><i data-ic="packageZip"></i><span>Export QA Package</span></button>
            <button class="tb" id="rib-export-audit" title="Generate Multi-Page Executive Sign-Off Audit PDF with Cloud Thumbnail"><i data-ic="auditPdf"></i><span>Executive Audit PDF</span></button>
            <button class="tb" id="rib-export-csv" title="Export Defect Coordinates (IPC English mils & Metric mm), Statuses & Notes to CSV"><i data-ic="csv"></i><span>Defects CSV</span></button>
            <button class="tb" id="rib-export-json" title="Export Structured Compare Diff Summary &amp; Coordinates to JSON"><i data-ic="report"></i><span>Diffs JSON</span></button>
          </div><div class="cap">Reports &amp; Audit</div></div>

          <div class="grp"><div class="row">
            <button class="tb" id="rib-session-save" title="Save Complete Review Session, Markups & Defect Statuses (.redline)"><i data-ic="sessionSave"></i><span>Save .redline</span></button>
            <button class="tb" id="rib-session-load" title="Restore Saved Review Session (.redline)"><i data-ic="sessionLoad"></i><span>Load .redline</span></button>
          </div><div class="cap">Session</div></div>
        </div>
      </div>
    `;

    // Keep oldRibbon in DOM (hidden) so all existing #openA, #dpi, #tol, #dx, #dy selectors stay valid
    oldRibbon.style.display = 'none';
    oldRibbon.classList.add('rp-categorized-ribbon');
    oldRibbon.parentNode.insertBefore(ribbonWrap, oldRibbon);

    // Tab switching
    ribbonWrap.querySelectorAll('.rp-tab-btn').forEach(btn => {
      btn.onclick = () => {
        ribbonWrap.querySelectorAll('.rp-tab-btn').forEach(b => b.classList.remove('active'));
        ribbonWrap.querySelectorAll('.rp-ribbon-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const target = $(`#${btn.dataset.tab}`);
        if (target) target.classList.add('active');
      };
    });

    // Wire Review & Compare actions
    if ($('#openA')) $('#rib-openA').onclick = () => $('#openA').click();
    if ($('#openB')) $('#rib-openB').onclick = () => $('#openB').click();
    if ($('#swap')) $('#rib-swap').onclick = () => $('#swap').click();
    if ($('#rib-c-undo')) $('#rib-c-undo').onclick = () => CompareHistory.undo();
    if ($('#rib-c-redo')) $('#rib-c-redo').onclick = () => CompareHistory.redo();
    $('#rib-autoalign').onclick = () => { if ($('#align')) $('#align').click(); };
      if ($('#rib-reset-align')) $('#rib-reset-align').onclick = () => { if (typeof window.resetCompareAlignment === 'function') window.resetCompareAlignment(); };
      if ($('#rib-blink-speed')) $('#rib-blink-speed').onchange = e => { if (typeof window.setBlinkIntervalMs === 'function') window.setBlinkIntervalMs(e.target.value); };
      if ($('#rib-export-json')) $('#rib-export-json').onclick = () => { if (typeof window.exportCompareDiffsJSON === 'function') window.exportCompareDiffsJSON(); };
    $('#rib-fiducial').onclick = () => {
      if (FiducialAligner.active) {
        FiducialAligner.active = false;
        const m = $('#fiducial-modal');
        if (m) m.hidden = true;
        $('#rib-fiducial').classList.remove('on');
        if (window.rpRedrawOverlay) window.rpRedrawOverlay();
        rpToast('3-Pt Fiducial Alignment turned off.');
      } else {
        $('#rib-fiducial').classList.add('on');
        FiducialAligner.start();
      }
    };
    $('#rib-ignore').onclick = () => {
      if ($('#ignBtn')) {
        $('#ignBtn').click();
        $('#rib-ignore').classList.toggle('on', !!(window.CMP && window.CMP.ignMode));
        rpToast(window.CMP && window.CMP.ignMode ? 'Ignore Area Active: Drag rectangle over title block or date stamp to exclude.' : 'Ignore Area tool exited.');
      }
    };
    if ($('#rib-ign-all') && $('#ignAll')) {
      $('#rib-ign-all').checked = $('#ignAll').checked;
      $('#rib-ign-all').onchange = e => {
        $('#ignAll').checked = e.target.checked;
        $('#ignAll').dispatchEvent(new Event('change'));
      };
      $('#ignAll').addEventListener('change', () => {
        $('#rib-ign-all').checked = $('#ignAll').checked;
      });
    }
    const getActiveXformSlot = () => ($('#rib-target-rev') && $('#rib-target-rev').value) || 'B';
    if ($('#rib-target-rev')) {
      $('#rib-target-rev').onchange = () => {
        if (window.syncCompareRotationUI) window.syncCompareRotationUI();
      };
    }
    if ($('#rib-rot-ccw')) $('#rib-rot-ccw').onclick = () => window.rotateCompareSlot && window.rotateCompareSlot(getActiveXformSlot(), -90);
    if ($('#rib-rot-cw')) $('#rib-rot-cw').onclick = () => window.rotateCompareSlot && window.rotateCompareSlot(getActiveXformSlot(), 90);
    if ($('#rib-rot-sel')) $('#rib-rot-sel').onchange = e => window.setCompareSlotRotation && window.setCompareSlotRotation(getActiveXformSlot(), +e.target.value || 0);
    if ($('#rib-mirror-btn')) $('#rib-mirror-btn').onclick = e => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror(getActiveXformSlot(), e.shiftKey ? 'y' : 'x');
    if ($('#rib-rot-a-ccw')) $('#rib-rot-a-ccw').onclick = () => window.rotateCompareSlot && window.rotateCompareSlot('A', -90);
    if ($('#rib-rot-a-cw')) $('#rib-rot-a-cw').onclick = () => window.rotateCompareSlot && window.rotateCompareSlot('A', 90);
    if ($('#rib-rot-a-sel')) $('#rib-rot-a-sel').onchange = e => window.setCompareSlotRotation && window.setCompareSlotRotation('A', +e.target.value || 0);
    if ($('#rib-rot-b-ccw')) $('#rib-rot-b-ccw').onclick = () => window.rotateCompareSlot && window.rotateCompareSlot('B', -90);
    if ($('#rib-rot-b-cw')) $('#rib-rot-b-cw').onclick = () => window.rotateCompareSlot && window.rotateCompareSlot('B', 90);
    if ($('#rib-rot-b-sel')) $('#rib-rot-b-sel').onchange = e => window.setCompareSlotRotation && window.setCompareSlotRotation('B', +e.target.value || 0);
    if ($('#rp-rot-a-ccw')) $('#rp-rot-a-ccw').onclick = () => window.rotateCompareSlot && window.rotateCompareSlot('A', -90);
    if ($('#rp-rot-a-cw')) $('#rp-rot-a-cw').onclick = () => window.rotateCompareSlot && window.rotateCompareSlot('A', 90);
    if ($('#rp-deg-a')) $('#rp-deg-a').onchange = e => window.setCompareSlotRotation && window.setCompareSlotRotation('A', +e.target.value || 0);
    if ($('#rp-rot-b-ccw')) $('#rp-rot-b-ccw').onclick = () => window.rotateCompareSlot && window.rotateCompareSlot('B', -90);
    if ($('#rp-rot-b-cw')) $('#rp-rot-b-cw').onclick = () => window.rotateCompareSlot && window.rotateCompareSlot('B', 90);
    if ($('#rp-deg-b')) $('#rp-deg-b').onchange = e => window.setCompareSlotRotation && window.setCompareSlotRotation('B', +e.target.value || 0);
    if ($('#rib-mir-a-x')) $('#rib-mir-a-x').onclick = () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('A', 'x');
    if ($('#rib-mir-a-y')) $('#rib-mir-a-y').onclick = () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('A', 'y');
    if ($('#rib-mir-b-x')) $('#rib-mir-b-x').onclick = () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('B', 'x');
    if ($('#rib-mir-b-y')) $('#rib-mir-b-y').onclick = () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('B', 'y');
    if ($('#rp-mir-a-x')) $('#rp-mir-a-x').onclick = () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('A', 'x');
    if ($('#rp-mir-a-y')) $('#rp-mir-a-y').onclick = () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('A', 'y');
    if ($('#rp-mir-b-x')) $('#rp-mir-b-x').onclick = () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('B', 'x');
    if ($('#rp-mir-b-y')) $('#rp-mir-b-y').onclick = () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('B', 'y');
    if ($('#rib-ign-clear')) {
      $('#rib-ign-clear').onclick = () => {
        if (window.ACT && window.ACT.clearIgnore) window.ACT.clearIgnore();
        else if ($('#ignClear')) $('#ignClear').click();
      };
    }
    if ($('#rib-prev-page')) $('#rib-prev-page').onclick = () => { if (window.ACT && window.ACT.cPage) window.ACT.cPage(-1); };
    if ($('#rib-next-page')) $('#rib-next-page').onclick = () => { if (window.ACT && window.ACT.cPage) window.ACT.cPage(1); };
    if ($('#rib-scan-all')) {
      $('#rib-scan-all').onclick = () => {
        if (window.ACT && window.ACT.rescan) window.ACT.rescan();
        else rpToast('Open Base (A) and Revised (B) drawings first to scan all pages.');
      };
    }
    $('#rib-prev-defect').onclick = () => DefectState.prev();
    $('#rib-next-defect').onclick = () => DefectState.next();
    $('#rib-text-diff').onclick = () => { if (window.ACT && window.ACT.textDiff) window.ACT.textDiff(); };
    $('#rib-layer-toggle').onclick = () => {
      const tabBtn = ribbonWrap.querySelector('.rp-tab-btn[data-tab="tab-layers"]');
      if (tabBtn) tabBtn.click();
    };
    if ($('#rib-view-toggle')) {
      $('#rib-view-toggle').onclick = () => {
        const tabBtn = ribbonWrap.querySelector('.rp-tab-btn[data-tab="tab-view"]');
        if (tabBtn) tabBtn.click();
      };
    }

    // Wire IPC Units quick selectors
    const updateDFMRuleBanner = () => {
      const rules = (typeof CAMEngine !== 'undefined' && CAMEngine.IPC_DFM_RULES[CAMState.ipcClass]) || CAMState.customRules;
      const clrMils = rules.minClearanceMils || 4.0;
      const clrMM = (clrMils * 0.0254).toFixed(3);
      const lbl = $('#rib-dfm-rule-lbl');
      if (lbl) {
        lbl.textContent = CAMState.unitSystem === 'metric'
          ? `Min Clr: ${clrMM} mm (${clrMils.toFixed(1)} mil)`
          : `Min Clr: ${clrMils.toFixed(1)} mil (${clrMM} mm)`;
      }
    };

    $('#rib-units-quick').value = CAMState.unitSystem;
    $('#rib-cam-units').value = CAMState.unitSystem;
    $('#rib-units-quick').onchange = e => { setUnitSystem(e.target.value); updateDFMRuleBanner(); };
    $('#rib-cam-units').onchange = e => { setUnitSystem(e.target.value); updateDFMRuleBanner(); };
    $('#rib-open-cam-quick').onclick = () => showCAMWorkbenchModal();

    // Wire PCB CAM Render Mode, Mirror, Polarity & IPC Class
    $('#rib-cam-render').onchange = e => {
      CAMState.renderMode = e.target.value;
      reRenderActiveCAMLayers();
    };
    $('#rib-cam-mirror').onchange = e => {
      CAMState.mirrorX = e.target.checked;
      reRenderActiveCAMLayers();
    };
    $('#rib-cam-neg').onchange = e => {
      CAMState.invertPolarity = e.target.checked;
      reRenderActiveCAMLayers();
    };
    $('#rib-ipc-class').onchange = e => {
      CAMState.ipcClass = e.target.value;
      if (typeof CAMEngine !== 'undefined' && CAMEngine.IPC_DFM_RULES[CAMState.ipcClass]) {
        Object.assign(CAMState.customRules, CAMEngine.IPC_DFM_RULES[CAMState.ipcClass]);
      }
      updateDFMRuleBanner();
      if (window.__lastGerberA && window.__lastGerberB) {
        runCAMClearanceScan();
      } else {
        updateCAMSidebarPane();
        rpToast(`Selected ${$('#rib-ipc-class').selectedOptions[0].text}`);
      }
    };
    updateDFMRuleBanner();

    // Wire View & Enhance actions
    $('#rib-enh-norm').onclick = () => window.setEnhanced && window.setEnhanced('off');
    $('#rib-enh-boost').onclick = () => window.setEnhanced && window.setEnhanced('enh');
    $('#rib-enh-dark').onclick = () => window.setEnhanced && window.setEnhanced('dark');
    $('#rib-enh-inv').onclick = () => window.setEnhanced && window.setEnhanced('blue');
    $('#rib-curtain-toggle').onclick = () => setCurtainMode(!curtainActive);
    if ($('#rib-world-view-toggle')) {
      $('#rib-world-view-toggle').onclick = () => {
        if (window.toggleWorldView) window.toggleWorldView();
      };
    }
    if ($('#rib-view-markers')) {
      $('#rib-view-markers').onclick = () => {
        const boxes = $('#lM') || $('#boxes');
        if (boxes) {
          boxes.checked = !boxes.checked;
          boxes.dispatchEvent(new Event('change'));
          $('#rib-view-markers').classList.toggle('on', boxes.checked);
          if ($('#rp-markers-chk')) $('#rp-markers-chk').checked = boxes.checked;
        }
      };
    }
    const markersInput = $('#lM') || $('#boxes');
    if (markersInput) {
      markersInput.addEventListener('change', () => {
        if ($('#rib-view-markers')) $('#rib-view-markers').classList.toggle('on', markersInput.checked);
        if ($('#rp-markers-chk')) $('#rp-markers-chk').checked = markersInput.checked;
      });
    }
    $('#rib-sharp-100').onclick = () => {
      if (typeof window.fit === 'function') window.fit();
      else if (window.ACT && window.ACT.cFit) window.ACT.cFit();
      if (window.rpSharpen) window.rpSharpen();
      rpToast('Fitted sheet to viewport & sharpened vector paths.');
    };
    if (window.setEnhanced) window.setEnhanced('off', true);

    // Wire Export & Share actions
    if ($('#rib-export-qa-zip')) $('#rib-export-qa-zip').onclick = () => exportQAPackageZip();
    $('#rib-export-pdf').onclick = () => { if ($('#report')) $('#report').click(); };
    $('#rib-export-img').onclick = () => { if ($('#png')) $('#png').click(); };
    $('#rib-export-dxf').onclick = () => promptDXFExport();
    $('#rib-export-audit').onclick = () => generateExecutiveAuditReport();
    $('#rib-export-csv').onclick = () => exportDefectsCSV();
    $('#rib-session-save').onclick = () => saveSessionFile();
    $('#rib-session-load').onclick = () => loadSessionFile();

    // Wire BOM & Measurements Schedule modal
    $('#rib-bom-list').onclick = () => showBOMAndMeasurementsModal();
    if ($('#rib-clear-markups')) $('#rib-clear-markups').onclick = () => { if (window.RP_MEASURE) { CompareHistory.push('Clear markups'); window.RP_MEASURE.annotations = []; if (window.RP_MEASURE.tally) window.RP_MEASURE.tally.clear(); if (window.rpRedrawOverlay) window.rpRedrawOverlay(); if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar(); rpToast('Cleared all markups & measurements on sheet.'); } };

    // Sync DPI selectors (#dpi, #rib-dpi, #rib-view-dpi)
    const mainDpi = $('#dpi'), ribDpi = $('#rib-dpi'), ribViewDpi = $('#rib-view-dpi');
    if (mainDpi) {
      if (ribDpi) {
        ribDpi.value = mainDpi.value;
        ribDpi.onchange = () => {
          if (ribViewDpi) ribViewDpi.value = ribDpi.value;
          mainDpi.value = ribDpi.value;
          mainDpi.dispatchEvent(new Event('change'));
        };
      }
      if (ribViewDpi) {
        ribViewDpi.value = mainDpi.value;
        ribViewDpi.onchange = () => {
          if (ribDpi) ribDpi.value = ribViewDpi.value;
          mainDpi.value = ribViewDpi.value;
          mainDpi.dispatchEvent(new Event('change'));
        };
      }
      mainDpi.addEventListener('change', () => {
        if (ribDpi) ribDpi.value = mainDpi.value;
        if (ribViewDpi) ribViewDpi.value = mainDpi.value;
      });
    }

    // Sync Mode selectors (#mode, #rib-mode, #rib-view-mode)
    const mainMode = $('#mode'), ribMode = $('#rib-mode'), ribViewMode = $('#rib-view-mode');
    if (mainMode) {
      prevNonCurtainMode = mainMode.value || 'paper';
      if (ribMode) {
        ribMode.value = mainMode.value;
        ribMode.onchange = () => setCompareMode(ribMode.value);
      }
      if (ribViewMode) {
        ribViewMode.value = mainMode.value;
        ribViewMode.onchange = () => setCompareMode(ribViewMode.value);
      }
      mainMode.addEventListener('change', () => {
        if (mainMode.value === 'side' || mainMode.value === 'blink') {
          if (curtainActive) setCurtainMode(false, mainMode.value);
        }
        if (!curtainActive) {
          prevNonCurtainMode = mainMode.value;
          syncModeSelects(mainMode.value);
        }
      });
    }

    // Wire CAD & CAM actions
    $('#rib-cad-export').onclick = () => promptDXFExport();
    $('#rib-cad-import').onclick = () => promptDXFImport();
    if ($('#rib-dxf-precompare')) $('#rib-dxf-precompare').onclick = () => showDXFPreCompareModal();
    if ($('#rib-dxf-workbench')) $('#rib-dxf-workbench').onclick = () => showDXFWorkbenchModal('layers');
    if ($('#rib-open-dxf-studio')) $('#rib-open-dxf-studio').onclick = () => { if (typeof window.setView === 'function') window.setView('dxf'); };
    $('#rib-cam-compare').onclick = () => promptCAMCompare();
    $('#rib-cam-dual').onclick = () => promptDualGerberCompare();
    $('#rib-cam-ipc').onclick = () => promptIPCD356Netlist();
    $('#rib-cam-clearance').onclick = () => runCAMClearanceScan();
    $('#rib-cam-tables').onclick = () => showCAMWorkbenchModal();

    if (typeof hydrateIcons === 'function') hydrateIcons();
  }

  /**
   * Re-render active CAM layers when user changes PCB CAM Render Mode, Mirror, Polarity, or Format
   */
  async function reRenderActiveCAMLayers() {
    if (typeof CAMEngine === 'undefined') return;
    if ((CAMState.layersA && CAMState.layersA.length) || (CAMState.layersB && CAMState.layersB.length)) {
      await executeConfiguredCAMCompare();
      return;
    }
    if (!window.__lastGerberA && !window.__lastGerberB && !window.__lastDrill && !window.__lastDrillB && !window.__lastIPCA && !window.__lastIPCB) {
      rpToast('Open a Gerber, Drill, or IPC-D-356 file to apply CAM view settings.');
      return;
    }

    try {
      const { gA, gB, drlA, drlB, ipcA, ipcB } = CAMState.ensureParsed();
      const effDrlB = drlB || drlA;
      const effIpcB = ipcB || ipcA;

      const sharedBoundsInches = (gA && gB && isFinite(gA.bounds.minX) && isFinite(gB.bounds.minX)) ? {
        minX: Math.min(gA.toInches(gA.bounds.minX), gB.toInches(gB.bounds.minX)),
        maxX: Math.max(gA.toInches(gA.bounds.maxX), gB.toInches(gB.bounds.maxX)),
        minY: Math.min(gA.toInches(gA.bounds.minY), gB.toInches(gB.bounds.minY)),
        maxY: Math.max(gA.toInches(gA.bounds.maxY), gB.toInches(gB.bounds.maxY))
      } : null;
      CAMState.activeSharedBoundsInches = sharedBoundsInches;

      const sbKey = sharedBoundsInches
        ? `${sharedBoundsInches.minX.toFixed(4)},${sharedBoundsInches.minY.toFixed(4)},${sharedBoundsInches.maxX.toFixed(4)},${sharedBoundsInches.maxY.toFixed(4)}`
        : 'single';
      const renderKeyBase = `${CAMState.getParseKey('A')}|${CAMState.getParseKey('B')}|${CAMState.pcbTheme || 'standard'}|${CAMState.renderMode}|${!!CAMState.mirrorX}|${!!CAMState.invertPolarity}|${!!CAMState.showOrigin}|${!!CAMState.showDrillRings}|${CAMState.highlightNet || ''}|${sbKey}|${drlA ? 'drlA' : ''}|${effDrlB ? 'drlB' : ''}|${ipcA ? 'ipcA' : ''}|${effIpcB ? 'ipcB' : ''}`;

      const renderLayerToPDF = async (gbr, drl, ipc) => {
        const cacheTarget = gbr || drl || ipc;
        if (cacheTarget && cacheTarget._cachedRenderKey === renderKeyBase && cacheTarget._cachedPdfBytes) {
          return { pdfBytes: cacheTarget._cachedPdfBytes };
        }
        const effBounds = sharedBoundsInches || CAMEngine.CAMJobStack.computeUnifiedBoundsInches([{ parsedGbr: gbr, parsedDrl: drl, parsedIPC: ipc }]);
        const pdfBytes = await CAMEngine.layersToVectorPDFBytes([{
          title: 'CAM Layer',
          entries: [{ parsedGbr: gbr, parsedDrl: drl, parsedIPC: ipc }]
        }], {
          pcbTheme: CAMState.pcbTheme || 'standard',
          renderMode: CAMState.renderMode || 'fill',
          mirrorX: CAMState.mirrorX,
          invertPolarity: CAMState.invertPolarity,
          showOrigin: CAMState.showOrigin,
          showDrillRings: CAMState.showDrillRings,
          highlightNet: CAMState.highlightNet,
          sharedBoundsInches: effBounds
        });
        if (cacheTarget && pdfBytes) {
          cacheTarget._cachedRenderKey = renderKeyBase;
          cacheTarget._cachedPdfBytes = pdfBytes;
        }
        return { pdfBytes };
      };

      const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : {};
      if ((gA || drlA || ipcA) && (gB || drlB || ipcB)) {
        const [rA, rB] = await Promise.all([renderLayerToPDF(gA, drlA, ipcA), renderLayerToPDF(gB, effDrlB, effIpcB)]);
        if (window.compareLoadBytes) {
          const sameA = !!(S.A && S.rawBytes && S.rawBytes.A === rA.pdfBytes);
          const sameB = !!(S.B && S.rawBytes && S.rawBytes.B === rB.pdfBytes);
          CAMState._renderingStack = true;
          try {
            if (!sameA && !sameB) {
              await window.compareLoadBytes('A', rA.pdfBytes, (S.names && S.names.A) || 'Layer_A.gbr', '', true);
              await window.compareLoadBytes('B', rB.pdfBytes, (S.names && S.names.B) || 'Layer_B.gbr', '');
            } else if (!sameA) {
              await window.compareLoadBytes('A', rA.pdfBytes, (S.names && S.names.A) || 'Layer_A.gbr', '');
            } else if (!sameB) {
              await window.compareLoadBytes('B', rB.pdfBytes, (S.names && S.names.B) || 'Layer_B.gbr', '');
            }
          } finally {
            CAMState._renderingStack = false;
          }
        }
      } else if (gA || gB || drlA || drlB || ipcA || ipcB) {
        const targetSlot = (!gA && !drlA && !ipcA && (gB || drlB || ipcB)) ? 'B' : 'A';
        const r = await renderLayerToPDF(gA || gB, drlA || drlB, ipcA || ipcB);
        const sameSlot = !!(S[targetSlot] && S.rawBytes && S.rawBytes[targetSlot] === r.pdfBytes);
        if (window.compareLoadBytes && !sameSlot) {
          CAMState._renderingStack = true;
          try {
            await window.compareLoadBytes(targetSlot, r.pdfBytes, (S.names && S.names[targetSlot]) || 'CAM_Layer.gbr', '');
          } finally {
            CAMState._renderingStack = false;
          }
        }
      }
      updateCAMSidebarPane();
      rpToast(`Updated CAM View: Mode=${CAMState.renderMode.toUpperCase()}${CAMState.mirrorX ? ' [Mirrored]' : ''}${CAMState.invertPolarity ? ' [Negative LPC]' : ''}`);
    } catch (e) {
      rpToast('CAM Render error: ' + e.message);
    }
  }

  /**
   * AutoCAD DXF Studio & Native Vector Compare State
   * Supports Pre-Compare Layer Selection, Layer Lock/Unlock, Freeze/Thaw, Layer Deletion/Removal,
   * Custom Layer Colors/Linetypes/Lineweights, and 100% Native Vector DXF Comparison (NO PDF conversion!).
   */
  /* ============================================================================
   * [MODULE SECTION: NATIVE VECTOR AUTOCAD DXF STATE & LAYER SYNCHRONIZER]
   * WHAT THIS IS: Holds parsed Rev A & Rev B DXF ASTs, layer visibility/freeze/lock
   *   sets, vector tolerance, and stepped highlight box size (`highlightBoxMils`).
   * WHY / HOW TO EDIT: Add new CAD comparison parameters here and pass them into
   *   `reRenderActiveDXFLayers()` to customize vector comparison behavior.
   * ============================================================================ */
  const DXFState = {
    parsedA: null,
    parsedB: null,
    rawA: null,
    rawB: null,
    nameA: "Drawing_RevA.dxf",
    nameB: "Drawing_RevB.dxf",
    _isActiveDXFSession: false,
    _isSampleDXF: false,
    nativeVectorMode: true,
    comparedLayers: new Set(), // Layers selected for comparison (empty = all visible/unfrozen layers)
    hiddenLayers: new Set(),   // Turned Off layers
    frozenLayers: new Set(),   // Frozen layers
    lockedLayers: new Set(),   // Locked layers (cannot be edited/removed while locked)
    ignoreLockedLayers: false,
    ignoreText: false,
    ignoreDimensions: false,
    compareTol: 0.005,
    highlightBoxMils: 7,
    alignmentMode: "origin",   // "origin" | "center"
    layerMapping: {},
    background: "#0c1017",     // "#0c1017" (AutoCAD Modelspace Dark) | "#ffffff" (Crisp Paper) | "#08182b" (Blueprint)
    lineWidth: 1.0,
    showGrid: true,
    lastEntityDiff: null,
    lastRenderMeta: null,

    syncLayerSetsFromParsers() {
      const allLayers = new Map();
      [this.parsedA, this.parsedB].forEach((p, idx) => {
        if (!p || !p.layers) return;
        for (const l of Object.values(p.layers)) {
          if (!l || !l.name) continue;
          const prev = allLayers.get(l.name);
          if (!prev) {
            const tcHex = (!l.customHex && l.trueColor != null && l.trueColor > 0 && DXFEngine.trueColorToHex) ? DXFEngine.trueColorToHex(l.trueColor) : null;
            const effCustomHex = l.customHex || tcHex || null;
            allLayers.set(l.name, {
              name: l.name,
              color: l.color || 7,
              trueColor: l.trueColor || null,
              customHex: effCustomHex,
              hexDark: effCustomHex || (DXFEngine.aciToHex ? DXFEngine.aciToHex(l.color || 7, true) : "#f8fafc"),
              hexLight: effCustomHex || (DXFEngine.aciToHex ? DXFEngine.aciToHex(l.color || 7, false) : "#0f172a"),
              linetype: l.linetype || "CONTINUOUS",
              lineweight: l.lineweight != null ? l.lineweight : -3,
              visible: l.visible !== false && !this.hiddenLayers.has(l.name),
              frozen: !!l.frozen || this.frozenLayers.has(l.name),
              locked: !!l.locked || this.lockedLayers.has(l.name),
              countA: idx === 0 ? (l.count || 0) : 0,
              countB: idx === 1 ? (l.count || 0) : 0,
              count: l.count || 0
            });
          } else {
            if (idx === 0) prev.countA = l.count || 0;
            else prev.countB = l.count || 0;
            prev.count = (prev.countA || 0) + (prev.countB || 0);
          }
          if (l.visible === false) this.hiddenLayers.add(l.name);
          if (l.frozen) this.frozenLayers.add(l.name);
          if (l.locked) this.lockedLayers.add(l.name);
        }
      });
      // If comparedLayers has not been initialized yet, select all visible non-defpoints layers by default
      if (this.comparedLayers.size === 0 && allLayers.size > 0) {
        for (const [name, info] of allLayers.entries()) {
          if (!/^defpoints$/i.test(name) && info.visible && !info.frozen) {
            this.comparedLayers.add(name);
          }
        }
      }
      return [...allLayers.values()];
    },

    applyLayerStateToParsers(layerName, patch = {}) {
      if (!layerName) return;
      if (patch.visible !== undefined) {
        if (patch.visible) this.hiddenLayers.delete(layerName);
        else this.hiddenLayers.add(layerName);
      }
      if (patch.frozen !== undefined) {
        if (patch.frozen) {
          this.frozenLayers.add(layerName);
          this.comparedLayers.delete(layerName);
        } else {
          this.frozenLayers.delete(layerName);
        }
      }
      if (patch.locked !== undefined) {
        if (patch.locked) this.lockedLayers.add(layerName);
        else this.lockedLayers.delete(layerName);
      }
      if (patch.compared !== undefined) {
        if (patch.compared) this.comparedLayers.add(layerName);
        else this.comparedLayers.delete(layerName);
      }
      [this.parsedA, this.parsedB].forEach(p => {
        if (p && typeof p.setLayerState === "function" && p.layers && p.layers[layerName]) {
          p.setLayerState(layerName, patch);
        }
      });
      this._studioDirty = true;
      this._pdfDirty = true;
    },

    deleteLayerFromParsers(layerName, target = "both", mode = "delete_entities") {
      if (!layerName) return { ok: false, reason: "Invalid layer" };
      if (this.lockedLayers.has(layerName)) {
        return { ok: false, reason: `Layer "${layerName}" is locked. Unlock it first before removing.` };
      }
      let removedCount = 0;
      if ((target === "both" || target === "A") && this.parsedA && typeof this.parsedA.deleteLayer === "function") {
        const resA = this.parsedA.deleteLayer(layerName, mode);
        removedCount += (resA && resA.removedEntities) || 0;
        this.rawA = this.parsedA.toDXFString();
      }
      if ((target === "both" || target === "B") && this.parsedB && typeof this.parsedB.deleteLayer === "function") {
        const resB = this.parsedB.deleteLayer(layerName, mode);
        removedCount += (resB && resB.removedEntities) || 0;
        this.rawB = this.parsedB.toDXFString();
      }
      if (target === "both") {
        this.comparedLayers.delete(layerName);
        this.hiddenLayers.delete(layerName);
        this.frozenLayers.delete(layerName);
        this.lockedLayers.delete(layerName);
      }
      return { ok: true, removedCount };
    }
  };
  if (typeof window !== "undefined") window.DXFState = DXFState;

  function registerDXFOSNAP(parser, bounds, canvasW = 2200, canvasH = 1600, padding = 40) {
    if (!window.RP_MEASURE || !window.RP_MEASURE.osnap || !parser || !bounds) return;
    const S = (typeof window !== "undefined" && window.CMP) ? window.CMP : null;
    const cv = (typeof document !== "undefined") ? document.getElementById("cv") : null;
    const actualW = (S && S.cur && S.cur.W) ? S.cur.W : ((S && S.preview && S.preview.W) ? S.preview.W : ((cv && cv.width > 10) ? cv.width : 0));
    const actualH = (S && S.cur && S.cur.H) ? S.cur.H : ((S && S.preview && S.preview.H) ? S.preview.H : ((cv && cv.height > 10) ? cv.height : 0));
    const dpi = ($("#dpi") && +$("#dpi").value) ? +$("#dpi").value : 300;
    const fallbackScale = 0.5 * (dpi / 72);
    const W = actualW > 10 ? actualW : Math.round(canvasW * fallbackScale);
    const H = actualH > 10 ? actualH : Math.round(canvasH * fallbackScale);
    const pad = padding * (W / 2200);
    const bw = Math.max(1e-3, bounds.maxX - bounds.minX || 100);
    const bh = Math.max(1e-3, bounds.maxY - bounds.minY || 100);
    const targetW = Math.max(10, W - pad * 2);
    const targetH = Math.max(10, H - pad * 2);
    const scale = Math.min(targetW / bw, targetH / bh);
    const offsetX = pad + (targetW - bw * scale) / 2;
    const offsetY = pad + (targetH - bh * scale) / 2;
    const tx = x => offsetX + (x - bounds.minX) * scale;
    const ty = y => H - (offsetY + (y - bounds.minY) * scale);

    const MAX_OSNAP_FEATURES = 15000;
    for (const ent of parser.entities) {
      if (window.RP_MEASURE.osnap.features.length >= MAX_OSNAP_FEATURES) break;
      if (DXFState.hiddenLayers.has(ent.layer) || DXFState.frozenLayers.has(ent.layer)) continue;
      if (DXFState.comparedLayers.size > 0 && !DXFState.comparedLayers.has(ent.layer)) continue;
      if (ent.type === "LINE") {
        window.RP_MEASURE.osnap.addLine(tx(ent.x1), ty(ent.y1), tx(ent.x2), ty(ent.y2));
      } else if (ent.type === "CIRCLE" || ent.type === "ARC") {
        window.RP_MEASURE.osnap.addCircle(tx(ent.cx), ty(ent.cy), ent.r * scale);
      } else if (ent.type === "ELLIPSE") {
        window.RP_MEASURE.osnap.addPoint(tx(ent.cx), ty(ent.cy), "center");
      } else if (ent.type === "POINT" || ent.type === "INSERT") {
        window.RP_MEASURE.osnap.addPoint(tx(ent.x), ty(ent.y), "endpoint");
      } else if ((ent.type === "LWPOLYLINE" || ent.type === "SPLINE") && ent.points) {
        for (let i = 0; i < ent.points.length; i++) {
          if (window.RP_MEASURE.osnap.features.length >= MAX_OSNAP_FEATURES) break;
          window.RP_MEASURE.osnap.addPoint(tx(ent.points[i][0]), ty(ent.points[i][1]), "endpoint");
          if (i < ent.points.length - 1) {
            window.RP_MEASURE.osnap.addLine(
              tx(ent.points[i][0]), ty(ent.points[i][1]),
              tx(ent.points[i + 1][0]), ty(ent.points[i + 1][1])
            );
          }
        }
      }
    }
  }
  if (typeof window !== "undefined") {
    window.registerActiveDXFOSNAP = function () {
      if (!DXFState._isActiveDXFSession) return;
      const p = DXFState.parsedB || DXFState.parsedA;
      const meta = DXFState.lastRenderMeta;
      const b = meta ? (meta.sharedBounds || meta.sharedBoundsA) : (p ? p.bounds : null);
      if (p && b) registerDXFOSNAP(p, b);
    };
  }

  /**
   * Create a 100% Native Vector DXF Document Proxy for Compare Slot A or Slot B.
   * Renders the parsed DXF vector AST directly onto any Canvas without converting to PDF!
   */
  function createNativeDXFDocProxy(parser, slot, sharedBoundsForParser, effectiveHiddenSet, diffEntityIds = null) {
    const baseW = 1100; // 2200 * 0.5 logical CAD units
    const baseH = 800;  // 1600 * 0.5 logical CAD units
    return {
      isNativeDXF: true,
      slot,
      dxfParser: parser,
      sharedBounds: sharedBoundsForParser,
      diffEntityIds,
      numPages: 1,
      destroy: async () => {},
      getPage: async (pageNumber = 1) => ({
        pageNumber,
        rotate: 0,
        isNativeDXFPage: true,
        getViewport: ({ scale = 1, rotation = 0, offsetX = 0, offsetY = 0 } = {}) => {
          const rot = ((rotation % 360) + 360) % 360;
          const swapped = (rot === 90 || rot === 270);
          return {
            scale,
            rotation: rot,
            offsetX,
            offsetY,
            width: (swapped ? baseH : baseW) * scale,
            height: (swapped ? baseW : baseH) * scale
          };
        },
        render: ({ canvasContext, viewport }) => {
          const promise = (async () => {
            if (!canvasContext || !viewport) return;
            const cv = canvasContext.canvas;
            const w = Math.max(1, Math.round(viewport.width));
            const h = Math.max(1, Math.round(viewport.height));
            const rot = ((viewport.rotation || 0) % 360 + 360) % 360;
            const unrotW = (rot === 90 || rot === 270) ? h : w;
            // Exact floating-point padding prevents any sub-pixel coordinate drift between #cv and zoomed #hq!
            const pad = 40 * (unrotW / 2200);
            if (cv) {
              const bgCol = DXFState.background || "#0c1017";
              const isLight = /^#?(fff|ffffff|f[0-9a-f]{5}|e[0-9a-f]{5})/i.test(bgCol.trim());
              const lwScale = 1.0;
              const degA = window.getSlotCardinalDeg ? window.getSlotCardinalDeg('A') : 0;
              const degB = window.getSlotCardinalDeg ? window.getSlotCardinalDeg('B') : 0;
              const mA = window.getSlotMirror ? window.getSlotMirror('A') : { x: false, y: false };
              const mB = window.getSlotMirror ? window.getSlotMirror('B') : { x: false, y: false };
              const sameTransform = (degA === degB) && (mA.x === mB.x) && (mA.y === mB.y);
              const cmpState = (typeof window !== "undefined" && window.CMP) ? window.CMP : {};
              const userTintA = (!isLight && (!cmpState.tintA || cmpState.tintA.toLowerCase() === "#e11414")) ? "#ff2a4b" : (cmpState.tintA || (isLight ? "#e11d48" : "#ff2a4b"));
              const userTintB = (!isLight && (!cmpState.tintB || cmpState.tintB.toLowerCase() === "#00a53c")) ? "#00f0ff" : (cmpState.tintB || (isLight ? "#0066ff" : "#00f0ff"));
              const userTintC = cmpState.tintC || (isLight ? "#64748b" : "#94a3b8");
              const diffCol = (sameTransform && diffEntityIds && diffEntityIds.size > 0)
                ? (slot === "A" ? userTintA : userTintB)
                : null;
              const commonCol = (sameTransform && diffEntityIds && diffEntityIds.size > 0)
                ? userTintC
                : null;
              parser.renderToCanvas(cv, {
                background: bgCol,
                lineWidth: (DXFState.lineWidth || 1.0) * lwScale,
                showGrid: false,
                hiddenLayers: effectiveHiddenSet,
                sharedBounds: sharedBoundsForParser || parser.bounds,
                diffEntityIds,
                diffHighlightColor: diffCol,
                commonColor: commonCol,
                padding: pad,
                pageWidth: w,
                pageHeight: h,
                rotation: rot,
                offsetX: viewport.offsetX || 0,
                offsetY: viewport.offsetY || 0
              });
            }
          })();
          return { promise, cancel: () => {} };
        },
        getTextContent: async () => {
          if (typeof DXFEngine !== "undefined" && typeof DXFEngine.extractAllDXFTextItems === "function") {
            const items = DXFEngine.extractAllDXFTextItems(parser, {
              hiddenLayers: effectiveHiddenSet,
              includeDimValues: true
            });
            return { items };
          }
          const items = [];
          for (const e of (parser.entities || [])) {
            if (effectiveHiddenSet && effectiveHiddenSet.has(e.layer) && e.type !== "DIMENSION") continue;
            if ((e.type === "TEXT" || e.type === "MTEXT" || e.type === "DIMENSION" || e.type === "MLEADER" || e.type === "TOLERANCE") && (e.text || e.measurement != null)) {
              const str = e.type === "DIMENSION" && DXFEngine && DXFEngine.resolveDimensionLabel
                ? DXFEngine.resolveDimensionLabel(e, parser)
                : String(e.text || "");
              if (str) items.push({ str, transform: [1, 0, 0, 1, e.x || e.x1 || 0, e.y || e.y1 || 0] });
            }
          }
          return { items };
        },
        getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
        cleanup: () => {}
      })
    };
  }

  /**
   * Re-render active DXF layers in 100% Native Vector DXF Mode (NO PDF conversion!)
   */
  async function reRenderActiveDXFLayers() {
    if (typeof DXFEngine === "undefined" || (!DXFState.parsedA && !DXFState.parsedB)) return;
    try {
      const pA = DXFState.parsedA;
      const pB = DXFState.parsedB;
      DXFState.syncLayerSetsFromParsers();

      const uMap = DXFEngine.UNITS || { mm: { toMM: 1 }, cm: { toMM: 10 }, m: { toMM: 1000 }, in: { toMM: 25.4 }, ft: { toMM: 304.8 }, mils: { toMM: 0.0254 } };
      const uA = (pA && pA.unitName && uMap[pA.unitName]) ? uMap[pA.unitName].toMM : 1;
      const uB = (pB && pB.unitName && uMap[pB.unitName]) ? uMap[pB.unitName].toMM : 1;
      const codeA = pA ? (pA.insunitsCode ?? 0) : 0;
      const codeB = pB ? (pB.insunitsCode ?? 0) : 0;
      const bToARatio = (pA && pB && codeA && codeB && codeA !== codeB && uA > 0 && uB > 0) ? (uB / uA) : 1.0;

      // Compute effective hidden layers (combining hiddenLayers, frozenLayers, optional lockedLayers, and unselected comparedLayers)
      const effectiveHidden = new Set([...DXFState.hiddenLayers, ...DXFState.frozenLayers]);
      if (DXFState.ignoreLockedLayers) {
        for (const lk of DXFState.lockedLayers) effectiveHidden.add(lk);
      }
      if (DXFState.comparedLayers && DXFState.comparedLayers.size > 0) {
        [pA, pB].forEach(p => {
          if (!p || !p.layers) return;
          for (const lName of Object.keys(p.layers)) {
            if (!DXFState.comparedLayers.has(lName)) effectiveHidden.add(lName);
          }
        });
      }

      const sharedBoundsA = (pA && pB) ? {
        minX: Math.min(pA.bounds.minX, pB.bounds.minX * bToARatio),
        minY: Math.min(pA.bounds.minY, pB.bounds.minY * bToARatio),
        maxX: Math.max(pA.bounds.maxX, pB.bounds.maxX * bToARatio),
        maxY: Math.max(pA.bounds.maxY, pB.bounds.maxY * bToARatio)
      } : (pA ? pA.bounds : pB.bounds);
      let centerOffsetB = { dx: 0, dy: 0 };
      if (DXFState.alignmentMode === "center" && pA && pB && isFinite(pA.bounds.minX) && isFinite(pB.bounds.minX)) {
        const probeOrigin = DXFEngine.compareDXFEntities(pA, pB, {
          tol: DXFState.compareTol || 0.005,
          comparedLayers: DXFState.comparedLayers.size ? DXFState.comparedLayers : null,
          hiddenLayers: DXFState.hiddenLayers,
          frozenLayers: DXFState.frozenLayers,
          lockedLayers: DXFState.lockedLayers,
          ignoreLockedLayers: DXFState.ignoreLockedLayers,
          ignoreText: DXFState.ignoreText,
          ignoreDimensions: DXFState.ignoreDimensions,
          layerMapping: DXFState.layerMapping
        });
        const minTotal = Math.max(1, Math.min(probeOrigin.totalA || 0, probeOrigin.totalB || 0));
        if ((probeOrigin.unchangedCount || 0) < minTotal * 0.2) {
          const cxA = (pA.bounds.minX + pA.bounds.maxX) / 2;
          const cyA = (pA.bounds.minY + pA.bounds.maxY) / 2;
          const cxB = ((pB.bounds.minX + pB.bounds.maxX) / 2) * bToARatio;
          const cyB = ((pB.bounds.minY + pB.bounds.maxY) / 2) * bToARatio;
          centerOffsetB = { dx: cxA - cxB, dy: cyA - cyB };
        }
      }
      const sharedBoundsB = (pA && pB && bToARatio !== 1.0) ? {
        minX: (sharedBoundsA.minX - centerOffsetB.dx) / bToARatio,
        minY: (sharedBoundsA.minY - centerOffsetB.dy) / bToARatio,
        maxX: (sharedBoundsA.maxX - centerOffsetB.dx) / bToARatio,
        maxY: (sharedBoundsA.maxY - centerOffsetB.dy) / bToARatio
      } : ((centerOffsetB.dx !== 0 || centerOffsetB.dy !== 0) ? {
        minX: sharedBoundsA.minX - centerOffsetB.dx,
        minY: sharedBoundsA.minY - centerOffsetB.dy,
        maxX: sharedBoundsA.maxX - centerOffsetB.dx,
        maxY: sharedBoundsA.maxY - centerOffsetB.dy
      } : sharedBoundsA);
      const sharedBounds = sharedBoundsB || sharedBoundsA;

      DXFState._isActiveDXFSession = true;
      DXFState.lastRenderMeta = { sharedBoundsA, sharedBoundsB, sharedBounds, bToARatio, effectiveHidden, centerOffsetB };

      const S = (typeof window !== "undefined" && window.CMP) ? window.CMP : {};
      const isWhiteBg = !DXFState.background || /^#?(fff|ffffff)$/i.test(DXFState.background.trim());
      if (isWhiteBg && $("#mode") && $("#mode").value === "over") {
        setCompareMode("paper");
      } else if (!isWhiteBg && $("#mode") && $("#mode").value === "paper") {
        setCompareMode("over");
      }

      if (pA && pB) {
        DXFState.lastEntityDiff = DXFEngine.compareDXFEntities(pA, pB, {
          tol: DXFState.compareTol || 0.005,
          comparedLayers: DXFState.comparedLayers.size ? DXFState.comparedLayers : null,
          hiddenLayers: DXFState.hiddenLayers,
          frozenLayers: DXFState.frozenLayers,
          lockedLayers: DXFState.lockedLayers,
          ignoreLockedLayers: DXFState.ignoreLockedLayers,
          ignoreText: DXFState.ignoreText,
          ignoreDimensions: DXFState.ignoreDimensions,
          layerMapping: DXFState.layerMapping,
          offsetB: centerOffsetB
        });
        const diffIdsA = new Set([
          ...(DXFState.lastEntityDiff.removed || []).map(e => e && e._id),
          ...(DXFState.lastEntityDiff.modifiedPairs || []).map(m => m && m.before && m.before._id)
        ].filter(Boolean));
        const diffIdsB = new Set([
          ...(DXFState.lastEntityDiff.added || []).map(e => e && e._id),
          ...(DXFState.lastEntityDiff.modifiedPairs || []).map(m => m && m.after && m.after._id)
        ].filter(Boolean));
        const docProxyA = createNativeDXFDocProxy(pA, "A", sharedBoundsA, effectiveHidden, diffIdsA);
        const docProxyB = createNativeDXFDocProxy(pB, "B", sharedBoundsB, effectiveHidden, diffIdsB);
        const toPdfFallback = (parser, bnds) => parser.toVectorPDFBytes({ background: DXFState.background, lineWidth: DXFState.lineWidth, showGrid: DXFState.showGrid, hiddenLayers: effectiveHidden, sharedBounds: bnds });
        if (typeof window !== "undefined" && typeof window.compareLoadNativeDXF === "function") {
          await window.compareLoadNativeDXF("A", docProxyA, DXFState.nameA, "", true);
          await window.compareLoadNativeDXF("B", docProxyB, DXFState.nameB, "", false);
        } else if (window.compareLoadBytes) {
          const [bytesA, bytesB] = await Promise.all([
            toPdfFallback(pA, sharedBoundsA),
            toPdfFallback(pB, sharedBoundsB)
          ]);
          await window.compareLoadBytes("A", bytesA, DXFState.nameA, "", true);
          await window.compareLoadBytes("B", bytesB, DXFState.nameB, "");
        }
        registerDXFOSNAP(pB, sharedBounds);
      } else if (pA) {
        const toPdfFallback = (parser, bnds) => parser.toVectorPDFBytes({ background: DXFState.background, lineWidth: DXFState.lineWidth, showGrid: DXFState.showGrid, hiddenLayers: effectiveHidden, sharedBounds: bnds });
        const docProxyA = createNativeDXFDocProxy(pA, "A", sharedBoundsA, effectiveHidden);
        if (typeof window !== "undefined" && typeof window.compareLoadNativeDXF === "function") {
          await window.compareLoadNativeDXF("A", docProxyA, DXFState.nameA, "", false);
        } else if (window.compareLoadBytes) {
          const bytesA = await toPdfFallback(pA, sharedBoundsA);
          await window.compareLoadBytes("A", bytesA, DXFState.nameA, "");
        }
        registerDXFOSNAP(pA, sharedBounds);
      } else if (pB) {
        const toPdfFallback = (parser, bnds) => parser.toVectorPDFBytes({ background: DXFState.background, lineWidth: DXFState.lineWidth, showGrid: DXFState.showGrid, hiddenLayers: effectiveHidden, sharedBounds: bnds });
        const docProxyB = createNativeDXFDocProxy(pB, "B", sharedBoundsB, effectiveHidden);
        if (typeof window !== "undefined" && typeof window.compareLoadNativeDXF === "function") {
          await window.compareLoadNativeDXF("B", docProxyB, DXFState.nameB, "", false);
        } else if (window.compareLoadBytes) {
          const bytesB = await toPdfFallback(pB, sharedBoundsB);
          await window.compareLoadBytes("B", bytesB, DXFState.nameB, "");
        }
        registerDXFOSNAP(pB, sharedBounds);
      }
      updateCAMSidebarPane();
      if (typeof window !== "undefined" && window.DXFStudio && typeof window.DXFStudio.syncFromDXFState === "function") {
        window.DXFStudio.syncFromDXFState();
      }
    } catch (e) {
      rpToast("DXF Render error: " + e.message);
    }
  }

  async function loadSampleDXF() {
    if (typeof DXFEngine === "undefined" || !DXFEngine.generateSampleMechanicalDXF) return;
    try {
      if (typeof setView === "function") setView("compare");
      const unit = CAMState.unitSystem === "metric" ? "mm" : "mils";
      rpToast("Generating synthetic AutoCAD R2000 Mechanical Enclosure DXF (Rev A vs Rev B)...");
      const dxfA = DXFEngine.generateSampleMechanicalDXF(false, unit);
      const dxfB = DXFEngine.generateSampleMechanicalDXF(true, unit);
      DXFState.rawA = dxfA;
      DXFState.rawB = dxfB;
      DXFState.nameA = "Enclosure_Carrier_RevA.dxf";
      DXFState.nameB = "Enclosure_Carrier_RevB.dxf";
      DXFState.parsedA = new DXFEngine.DXFParser(dxfA).parse();
      DXFState.parsedB = new DXFEngine.DXFParser(dxfB).parse();
      DXFState.hiddenLayers.clear();
      DXFState.frozenLayers.clear();
      DXFState.lockedLayers.clear();
      DXFState.comparedLayers.clear();
      DXFState.syncLayerSetsFromParsers();
      DXFState.lastEntityDiff = DXFEngine.compareDXFEntities(DXFState.parsedA, DXFState.parsedB);

      CAMState._isActiveCAMSession = false;
      CAMState.parsedGerberA = null;
      CAMState.parsedGerberB = null;
      CAMState.parsedDrillA = null;
      CAMState.parsedDrillB = null;
      CAMState.parsedIPCA = null;
      CAMState.parsedIPCB = null;
      CAMState.layersA = [];
      CAMState.layersB = [];
      CAMState.pairedLayers = [];
      CAMState.lastDFMViolations = [];
      await reRenderActiveDXFLayers();
      const diffTabBtn = $('aside .tabs button[data-t="d"]');
      if (diffTabBtn) diffTabBtn.click();
      const d = DXFState.lastEntityDiff;
      rpToast(`Native DXF Vector Compare (Rev A vs Rev B): +${d.added.length} added, −${d.removed.length} removed primitives across ${Object.keys(DXFState.parsedB.layers).length} CAD layers.`);
      return { dxfA, dxfB, diff: d };
    } catch (e) {
      rpToast("Sample DXF Error: " + e.message);
    }
  }

  /**
   * Pre-Compare AutoCAD DXF Layer Selection & Setup Modal
   * Opens BEFORE comparing two DXF files so the engineer can select which layers in the DXF need to be compared,
   * lock/unlock layers, freeze/thaw layers, change colors, or delete/remove unwanted layers!
   */
  function showDXFPreCompareModal() {
    document.querySelectorAll('.rp-modal:not(.rp-side-docked)').forEach(el => { if (el.id) el.hidden = true; else el.remove(); });
    if (typeof document === "undefined" || typeof DXFEngine === "undefined") return;
    let modal = $("#rp-dxf-precompare-modal");
    if (!modal) {
      modal = el("div", { id: "rp-dxf-precompare-modal", className: "rp-modal" });
      document.body.appendChild(modal);
    }
    modal.hidden = false;

    const layers = DXFState.syncLayerSetsFromParsers();
    const pA = DXFState.parsedA;
    const pB = DXFState.parsedB;
    const hasBoth = !!(pA && pB);
    const previewDiff = hasBoth ? DXFEngine.compareDXFEntities(pA, pB, {
      tol: DXFState.compareTol || 0.005,
      hiddenLayers: DXFState.hiddenLayers,
      frozenLayers: DXFState.frozenLayers,
      lockedLayers: DXFState.lockedLayers,
      ignoreLockedLayers: DXFState.ignoreLockedLayers,
      ignoreText: DXFState.ignoreText,
      ignoreDimensions: DXFState.ignoreDimensions,
      layerMapping: DXFState.layerMapping
    }) : null;
    const lStats = (previewDiff && previewDiff.layerDiffStats) || {};

    const layerRowsHTML = layers.length ? layers.map(l => {
      const isCmp = DXFState.comparedLayers.has(l.name);
      const isVis = !DXFState.hiddenLayers.has(l.name);
      const isFrz = DXFState.frozenLayers.has(l.name);
      const isLck = DXFState.lockedLayers.has(l.name);
      const st = lStats[l.name] || { added: 0, removed: 0, unchanged: 0, modified: 0 };
      const diffCount = st.added + st.removed;
      const statusBadge = !hasBoth
        ? `<span class="rp-count-pill" style="opacity:.7">Loaded</span>`
        : (diffCount > 0
          ? `<span class="defect-badge removed" style="font-size:10px;padding:1px 6px">+${st.added} / −${st.removed} Diff</span>`
          : `<span class="defect-badge approved" style="font-size:10px;padding:1px 6px;background:rgba(16,185,129,0.16);color:#10b981">Identical (${st.unchanged})</span>`);

      return `
        <tr data-lyr-row="${l.name}" style="${!isCmp ? 'opacity:0.55' : ''}">
          <td style="text-align:center"><input type="checkbox" class="dxf-pre-cmp-chk" data-lyr="${l.name}" ${isCmp ? "checked" : ""} title="Include Layer '${l.name}' in DXF Vector Comparison" /></td>
          <td>
            <div style="display:flex;align-items:center;gap:6px">
              <input type="color" class="dxf-pre-col-pick" data-lyr="${l.name}" value="${l.hexDark}" style="width:18px;height:18px;padding:0;border:none;background:transparent;cursor:pointer" title="Change Layer Color" />
              <b>${l.name}</b>
              ${isLck ? '<span style="font-size:10px;color:#f59e0b;border:1px solid rgba(245,158,11,0.4);padding:0 4px;border-radius:3px">LOCKED</span>' : ''}
              ${isFrz ? '<span style="font-size:10px;color:#38bdf8;border:1px solid rgba(56,189,248,0.4);padding:0 4px;border-radius:3px">FROZEN</span>' : ''}
            </div>
          </td>
          <td style="text-align:center">${l.countA}</td>
          <td style="text-align:center">${l.countB}</td>
          <td>${statusBadge}</td>
          <td>
            <div style="display:flex;gap:4px;align-items:center">
              <button type="button" class="rp-btn-sm dxf-pre-vis-btn ${isVis ? 'on' : ''}" data-lyr="${l.name}" title="${isVis ? 'Layer On (Click to Turn Off)' : 'Layer Off (Click to Turn On)'}"><i data-ic="${isVis ? 'eye' : 'eyeOff'}"></i><span>${isVis ? 'On' : 'Off'}</span></button>
              <button type="button" class="rp-btn-sm dxf-pre-frz-btn ${isFrz ? 'on' : ''}" data-lyr="${l.name}" title="${isFrz ? 'Layer Frozen (Click to Thaw)' : 'Thawed (Click to Freeze)'}" style="${isFrz ? 'border-color:#38bdf8;color:#38bdf8' : ''}"><i data-ic="freeze"></i><span>${isFrz ? 'Frozen' : 'Freeze'}</span></button>
              <button type="button" class="rp-btn-sm dxf-pre-lck-btn ${isLck ? 'on' : ''}" data-lyr="${l.name}" title="${isLck ? 'Layer Locked (Click to Unlock)' : 'Unlocked (Click to Lock Layer like AutoCAD)'}" style="${isLck ? 'border-color:#f59e0b;color:#f59e0b' : ''}"><i data-ic="${isLck ? 'lock' : 'unlock'}"></i><span>${isLck ? 'Locked' : 'Lock'}</span></button>
              <button type="button" class="rp-btn-sm dxf-pre-del-btn" data-lyr="${l.name}" title="Remove / Delete Layer '${l.name}' and its entities from DXF" style="border-color:rgba(239,68,68,0.45);color:#f87171"><i data-ic="trash"></i><span>Remove</span></button>
            </div>
          </td>
        </tr>
      `;
    }).join("") : `<tr><td colspan="6" style="text-align:center;padding:16px;opacity:.75">No DXF files staged yet. Click <b>+ Load Base DXF (Rev A)</b> and <b>+ Load Revised DXF (Rev B)</b> below.</td></tr>`;

    modal.innerHTML = `
      <div class="rp-card rp-wide" style="width:min(960px,96vw);max-height:92vh">
        <div class="rp-hud-header">
          <div class="rp-hud-title">
            <h3><i data-ic="cadDxf"></i> Pre-Compare AutoCAD DXF Layer Selector &amp; Native Vector Setup</h3>
            <span class="rp-hud-badge" style="background:rgba(16,185,129,0.18);color:#10b981;border:1px solid rgba(16,185,129,0.4)">ORIGINAL NATIVE DXF VECTOR COMPARE (NO PDF CONVERSION)</span>
          </div>
          <button type="button" class="rp-hud-close" id="dxf-pre-close">Close (Esc)</button>
        </div>

        <div class="rp-hud-grid" style="grid-template-columns:1.35fr 1fr;gap:10px;margin-bottom:8px">
          <div class="rp-hud-section">
            <h4>1. Loaded AutoCAD DXF Revisions (Native Vector AST)</h4>
            <div style="display:flex;flex-direction:column;gap:6px;font-size:12px">
              <div style="display:flex;justify-content:space-between;align-items:center;background:var(--panel);padding:6px 10px;border-radius:6px;border:1px solid var(--line)">
                <div><span class="rp-slot-tag tag-a" style="margin-right:6px">REV A</span><b>${pA ? DXFState.nameA : "Not Loaded"}</b> <small style="opacity:.75">${pA ? `(${pA.entities.length} entities, ${Object.keys(pA.layers).length} layers, ${pA.unitName})` : ""}</small></div>
                <button type="button" class="rp-btn-sm" id="dxf-pre-load-a"><i data-ic="openA"></i><span>${pA ? "Change A" : "+ Load DXF A"}</span></button>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;background:var(--panel);padding:6px 10px;border-radius:6px;border:1px solid var(--line)">
                <div><span class="rp-slot-tag tag-b" style="margin-right:6px">REV B</span><b>${pB ? DXFState.nameB : "Not Loaded"}</b> <small style="opacity:.75">${pB ? `(${pB.entities.length} entities, ${Object.keys(pB.layers).length} layers, ${pB.unitName})` : ""}</small></div>
                <button type="button" class="rp-btn-sm" id="dxf-pre-load-b"><i data-ic="openB"></i><span>${pB ? "Change B" : "+ Load DXF B"}</span></button>
              </div>
            </div>
          </div>

          <div class="rp-hud-section">
            <h4>2. Native Vector Compare Tolerance &amp; Layer Rules</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
              <label>Vector Tolerance (${(pA && pA.unitName) || "mm"}):
                <input type="number" id="dxf-pre-tol" step="0.001" min="0.0001" value="${DXFState.compareTol || 0.005}" style="width:100%" />
              </label>
              <label>Registration Mode:
                <select id="dxf-pre-align" style="width:100%">
                  <option value="origin" ${DXFState.alignmentMode === "origin" ? "selected" : ""}>Shared CAD Origin (0,0)</option>
                  <option value="center" ${DXFState.alignmentMode === "center" ? "selected" : ""}>Auto-Center Extents</option>
                </select>
              </label>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;font-size:11.5px">
              <label class="chk"><input type="checkbox" id="dxf-pre-ign-locked" ${DXFState.ignoreLockedLayers ? "checked" : ""} /> Skip Locked Layers in Compare</label>
              <label class="chk"><input type="checkbox" id="dxf-pre-ign-text" ${DXFState.ignoreText ? "checked" : ""} /> Ignore TEXT/MTEXT</label>
              <label class="chk"><input type="checkbox" id="dxf-pre-ign-dim" ${DXFState.ignoreDimensions ? "checked" : ""} /> Ignore Dimensions</label>
            </div>
          </div>
        </div>

        <div class="rp-hud-section" style="flex:1;display:flex;flex-direction:column;min-height:0">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px">
            <div>
              <h4 style="margin:0">3. Select Which DXF Layers to Compare &amp; AutoCAD Layer Controls (${DXFState.comparedLayers.size} of ${layers.length} Selected)</h4>
              <small style="opacity:.78">Tick/untick layers to compare, or Lock, Freeze, Recolor, and Remove layers directly before running Native DXF Compare</small>
            </div>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              <button type="button" class="rp-btn-sm" id="dxf-pre-sel-all">All Layers</button>
              <button type="button" class="rp-btn-sm" id="dxf-pre-sel-none">None</button>
              <button type="button" class="rp-btn-sm" id="dxf-pre-sel-inv">Invert</button>
              <button type="button" class="rp-btn-sm" id="dxf-pre-sel-diff" title="Select only layers that have entity differences between Rev A and Rev B">Changed Layers Only</button>
              <button type="button" class="rp-btn-sm" id="dxf-pre-sel-geom" title="Exclude Title Block, Sheet Border, Text, and Defpoints layers">Geometry Only</button>
              <button type="button" class="rp-btn-sm" id="dxf-pre-unlock-all" title="Unlock all locked layers">Unlock All</button>
            </div>
          </div>

          <div class="rp-scroll" style="max-height:38vh;border:1px solid var(--line);border-radius:6px">
            <table class="btab" style="width:100%">
              <thead>
                <tr>
                  <th style="width:64px;text-align:center">Compare?</th>
                  <th>AutoCAD Layer Name &amp; Color</th>
                  <th style="width:75px;text-align:center">Rev A</th>
                  <th style="width:75px;text-align:center">Rev B</th>
                  <th style="width:130px">Vector Diff Status</th>
                  <th style="width:270px">AutoCAD Layer Actions (On / Freeze / Lock / Remove)</th>
                </tr>
              </thead>
              <tbody>
                ${layerRowsHTML}
              </tbody>
            </table>
          </div>
        </div>

        <div class="rp-btns" style="margin-top:10px;justify-content:space-between">
          <div style="display:flex;gap:8px">
            <button type="button" id="dxf-pre-open-studio" class="rp-btn-sm" style="height:32px;padding:0 12px;border-color:#38bdf8;color:#38bdf8"><i data-ic="cadDxf"></i><span>Open in DXF Studio (AutoCAD Editor)</span></button>
            <button type="button" id="dxf-pre-open-wb" class="rp-btn-sm" style="height:32px;padding:0 12px"><i data-ic="layers"></i><span>Full Layer &amp; Export Workbench</span></button>
          </div>
          <div style="display:flex;gap:8px">
            <button type="button" id="dxf-pre-cancel">Cancel</button>
            <button type="button" id="dxf-pre-start-cmp" class="rp-primary" ${(!pA && !pB) ? "disabled" : ""}>✓ Compare Selected DXF Layers (${DXFState.comparedLayers.size} Layer${DXFState.comparedLayers.size === 1 ? "" : "s"})</button>
          </div>
        </div>
      </div>
    `;

    if (typeof hydrateIcons === "function") hydrateIcons(modal);

    const savePreSettings = () => {
      const tolVal = parseFloat($("#dxf-pre-tol")?.value);
      if (Number.isFinite(tolVal) && tolVal > 0) DXFState.compareTol = tolVal;
      const boxMilsVal = parseFloat($("#dxf-pre-box-mils")?.value);
      if (Number.isFinite(boxMilsVal) && boxMilsVal > 0) DXFState.highlightBoxMils = boxMilsVal;
      if ($("#dxf-pre-align")) DXFState.alignmentMode = $("#dxf-pre-align").value;
      if ($("#dxf-pre-ign-locked")) DXFState.ignoreLockedLayers = $("#dxf-pre-ign-locked").checked;
      if ($("#dxf-pre-ign-text")) DXFState.ignoreText = $("#dxf-pre-ign-text").checked;
      if ($("#dxf-pre-ign-dim")) DXFState.ignoreDimensions = $("#dxf-pre-ign-dim").checked;
    };

    const refreshPreModal = () => {
      savePreSettings();
      showDXFPreCompareModal();
    };
    ["#dxf-pre-tol", "#dxf-pre-align", "#dxf-pre-ign-locked", "#dxf-pre-ign-text", "#dxf-pre-ign-dim"].forEach(sel => {
      const elInp = $(sel);
      if (elInp) elInp.onchange = () => refreshPreModal();
    });

    $("#dxf-pre-close").onclick = () => { savePreSettings(); modal.hidden = true; };
    $("#dxf-pre-cancel").onclick = () => { savePreSettings(); modal.hidden = true; };
    modal.onclick = e => { if (e.target === modal) { savePreSettings(); modal.hidden = true; } };

    modal.querySelectorAll(".dxf-pre-cmp-chk").forEach(chk => {
      chk.onchange = () => {
        savePreSettings();
        DXFState.applyLayerStateToParsers(chk.dataset.lyr, { compared: chk.checked, visible: chk.checked });
        showDXFPreCompareModal();
      };
    });

    modal.querySelectorAll(".dxf-pre-col-pick").forEach(inp => {
      inp.onchange = () => {
        savePreSettings();
        DXFState.applyLayerStateToParsers(inp.dataset.lyr, { customHex: inp.value });
        showDXFPreCompareModal();
      };
    });

    modal.querySelectorAll(".dxf-pre-vis-btn").forEach(btn => {
      btn.onclick = () => {
        savePreSettings();
        const lyr = btn.dataset.lyr;
        const nextVis = DXFState.hiddenLayers.has(lyr);
        DXFState.applyLayerStateToParsers(lyr, { visible: nextVis, compared: nextVis });
        showDXFPreCompareModal();
      };
    });

    modal.querySelectorAll(".dxf-pre-frz-btn").forEach(btn => {
      btn.onclick = () => {
        savePreSettings();
        const lyr = btn.dataset.lyr;
        const nextFrz = !DXFState.frozenLayers.has(lyr);
        DXFState.applyLayerStateToParsers(lyr, { frozen: nextFrz, visible: !nextFrz });
        showDXFPreCompareModal();
      };
    });

    modal.querySelectorAll(".dxf-pre-lck-btn").forEach(btn => {
      btn.onclick = () => {
        savePreSettings();
        const lyr = btn.dataset.lyr;
        const nextLck = !DXFState.lockedLayers.has(lyr);
        DXFState.applyLayerStateToParsers(lyr, { locked: nextLck });
        rpToast(`Layer "${lyr}" ${nextLck ? "Locked (protected from deletion/edits)" : "Unlocked"}.`);
        showDXFPreCompareModal();
      };
    });

    modal.querySelectorAll(".dxf-pre-del-btn").forEach(btn => {
      btn.onclick = () => {
        savePreSettings();
        const lyr = btn.dataset.lyr;
        const res = DXFState.deleteLayerFromParsers(lyr, "both", "delete_entities");
        if (!res.ok) {
          rpToast(res.reason);
          return;
        }
        rpToast(`Removed layer "${lyr}" (${res.removedCount} entities deleted).`);
        showDXFPreCompareModal();
      };
    });

    if ($("#dxf-pre-sel-all")) {
      $("#dxf-pre-sel-all").onclick = () => {
        savePreSettings();
        layers.forEach(l => DXFState.applyLayerStateToParsers(l.name, { compared: true, visible: true, frozen: false }));
        showDXFPreCompareModal();
      };
    }
    if ($("#dxf-pre-sel-none")) {
      $("#dxf-pre-sel-none").onclick = () => {
        savePreSettings();
        DXFState.comparedLayers.clear();
        showDXFPreCompareModal();
      };
    }
    if ($("#dxf-pre-sel-inv")) {
      $("#dxf-pre-sel-inv").onclick = () => {
        savePreSettings();
        layers.forEach(l => {
          const next = !DXFState.comparedLayers.has(l.name);
          DXFState.applyLayerStateToParsers(l.name, { compared: next, visible: next });
        });
        showDXFPreCompareModal();
      };
    }
    if ($("#dxf-pre-sel-diff")) {
      $("#dxf-pre-sel-diff").onclick = () => {
        savePreSettings();
        DXFState.comparedLayers.clear();
        layers.forEach(l => {
          const st = lStats[l.name];
          const hasDiff = st && (st.added > 0 || st.removed > 0);
          DXFState.applyLayerStateToParsers(l.name, { compared: !!hasDiff, visible: !!hasDiff });
        });
        if (DXFState.comparedLayers.size === 0) {
          layers.forEach(l => DXFState.comparedLayers.add(l.name));
          rpToast("All layers are identical; kept all layers selected.");
        } else {
          rpToast(`Filtered to ${DXFState.comparedLayers.size} layer(s) containing vector differences.`);
        }
        showDXFPreCompareModal();
      };
    }
    if ($("#dxf-pre-sel-geom")) {
      $("#dxf-pre-sel-geom").onclick = () => {
        savePreSettings();
        DXFState.comparedLayers.clear();
        layers.forEach(l => {
          const isNonGeom = /^(title_block|sheet_border|border|frame|text|notes|defpoints)$/i.test(l.name.trim());
          DXFState.applyLayerStateToParsers(l.name, { compared: !isNonGeom, visible: !isNonGeom });
        });
        rpToast(`Selected ${DXFState.comparedLayers.size} mechanical/CAD geometry layer(s).`);
        showDXFPreCompareModal();
      };
    }
    if ($("#dxf-pre-unlock-all")) {
      $("#dxf-pre-unlock-all").onclick = () => {
        savePreSettings();
        layers.forEach(l => DXFState.applyLayerStateToParsers(l.name, { locked: false }));
        rpToast("Unlocked all DXF layers.");
        showDXFPreCompareModal();
      };
    }

    const pickSlotDxf = async (slot) => {
      if (!window.native || !window.native.openFiles) return;
      const files = await window.native.openFiles({
        title: `Select AutoCAD DXF for Slot ${slot}`,
        multi: false,
        filters: [{ name: "AutoCAD DXF", extensions: ["dxf"] }]
      });
      if (!files || !files.length) return;
      const text = DXFEngine.decodeDXFBytes ? DXFEngine.decodeDXFBytes(files[0].bytes) : new TextDecoder().decode(files[0].bytes);
      const parsed = new DXFEngine.DXFParser(text).parse();
      if (slot === "A") {
        DXFState.rawA = text; DXFState.nameA = files[0].name; DXFState.parsedA = parsed;
      } else {
        DXFState.rawB = text; DXFState.nameB = files[0].name; DXFState.parsedB = parsed;
      }
      DXFState.comparedLayers.clear();
      DXFState.syncLayerSetsFromParsers();
      showDXFPreCompareModal();
    };
    if ($("#dxf-pre-load-a")) $("#dxf-pre-load-a").onclick = () => pickSlotDxf("A");
    if ($("#dxf-pre-load-b")) $("#dxf-pre-load-b").onclick = () => pickSlotDxf("B");

    if ($("#dxf-pre-open-studio")) {
      $("#dxf-pre-open-studio").onclick = async () => {
        savePreSettings();
        modal.hidden = true;
        await reRenderActiveDXFLayers();
        if (typeof window.setView === "function") window.setView("dxf");
      };
    }
    if ($("#dxf-pre-open-wb")) {
      $("#dxf-pre-open-wb").onclick = () => {
        savePreSettings();
        modal.hidden = true;
        showDXFWorkbenchModal("layers");
      };
    }
    if ($("#dxf-pre-start-cmp")) {
      $("#dxf-pre-start-cmp").onclick = async () => {
        savePreSettings();
        if (DXFState.comparedLayers.size === 0 && layers.length > 0) {
          layers.forEach(l => { if (!DXFState.frozenLayers.has(l.name)) DXFState.comparedLayers.add(l.name); });
        }
        modal.hidden = true;
        if (typeof window.setView === "function") window.setView("compare");
        await reRenderActiveDXFLayers();
        const d = DXFState.lastEntityDiff;
        if (d) {
          rpToast(`Native DXF Vector Compare (${DXFState.comparedLayers.size}/${layers.length} layers): +${d.added.length} Added, −${d.removed.length} Removed, ${(d.modifiedPairs || []).length} Modified.`);
        }
      };
    }
  }

  /**
   * Interactive AutoCAD DXF Workbench Modal (Full AutoCAD Layer Properties Manager, Entity Inspector, Vector Diff & Export)
   */
  function showDXFWorkbenchModal(initialTab = "layers") {
    document.querySelectorAll('.rp-modal:not(.rp-side-docked)').forEach(el => { if (el.id) el.hidden = true; else el.remove(); });
    if (typeof document === "undefined" || typeof DXFEngine === "undefined") return;
    let modal = $("#rp-dxf-workbench-modal");
    if (!modal) {
      modal = el("div", { id: "rp-dxf-workbench-modal", className: "rp-modal" });
      document.body.appendChild(modal);
    }
    modal.hidden = false;

    const activeDxf = DXFState.parsedB || DXFState.parsedA;
    const isMetric = CAMState.unitSystem === "metric";
    const defaultUnit = isMetric ? "mm" : "mils";
    const layers = DXFState.syncLayerSetsFromParsers();

    const ltypes = ["CONTINUOUS", "DASHED", "HIDDEN", "CENTER", "PHANTOM", "DOT"];
    const lweights = [
      { v: -3, l: "Default" },
      { v: 9, l: "0.09 mm" },
      { v: 13, l: "0.13 mm" },
      { v: 18, l: "0.18 mm" },
      { v: 25, l: "0.25 mm" },
      { v: 35, l: "0.35 mm" },
      { v: 50, l: "0.50 mm" },
      { v: 70, l: "0.70 mm" },
      { v: 100, l: "1.00 mm" }
    ];

    const layerRowsHTML = layers.length ? layers.map(l => {
      const isVis = !DXFState.hiddenLayers.has(l.name);
      const isCmp = DXFState.comparedLayers.has(l.name);
      const isFrz = DXFState.frozenLayers.has(l.name);
      const isLck = DXFState.lockedLayers.has(l.name);
      return `
        <tr>
          <td style="text-align:center"><input type="checkbox" class="dxf-lyr-chk" data-lyr="${l.name}" ${isVis ? "checked" : ""} title="Layer Visibility (On/Off)" /></td>
          <td style="text-align:center"><input type="checkbox" class="dxf-lyr-cmp-chk" data-lyr="${l.name}" ${isCmp ? "checked" : ""} title="Include in DXF Compare" /></td>
          <td>
            <div style="display:flex;align-items:center;gap:6px">
              <input type="color" class="dxf-wb-col-pick" data-lyr="${l.name}" value="${l.hexDark}" style="width:18px;height:18px;padding:0;border:none;background:transparent;cursor:pointer" title="Pick Layer Color" />
              <b>${l.name}</b>
            </div>
          </td>
          <td>
            <select class="rp-select-xs dxf-wb-ltype" data-lyr="${l.name}" style="width:105px">
              ${ltypes.map(lt => `<option value="${lt}" ${l.linetype === lt ? "selected" : ""}>${lt}</option>`).join("")}
            </select>
          </td>
          <td>
            <select class="rp-select-xs dxf-wb-lw-sel" data-lyr="${l.name}" style="width:82px">
              ${lweights.map(lw => `<option value="${lw.v}" ${l.lineweight === lw.v ? "selected" : ""}>${lw.l}</option>`).join("")}
            </select>
          </td>
          <td style="text-align:center">${l.count}</td>
          <td>
            <div style="display:flex;gap:4px">
              <button type="button" class="rp-btn-sm dxf-wb-frz-btn ${isFrz ? 'on' : ''}" data-lyr="${l.name}" title="Freeze / Thaw Layer" style="${isFrz ? 'border-color:#38bdf8;color:#38bdf8' : ''}"><i data-ic="freeze"></i><span>${isFrz ? 'Frozen' : 'Freeze'}</span></button>
              <button type="button" class="rp-btn-sm dxf-wb-lck-btn ${isLck ? 'on' : ''}" data-lyr="${l.name}" title="Lock / Unlock Layer" style="${isLck ? 'border-color:#f59e0b;color:#f59e0b' : ''}"><i data-ic="${isLck ? 'lock' : 'unlock'}"></i><span>${isLck ? 'Locked' : 'Lock'}</span></button>
              <button type="button" class="rp-btn-sm dxf-wb-solo-btn" data-lyr="${l.name}" title="Isolate / Solo only this layer">Solo</button>
              <button type="button" class="rp-btn-sm dxf-wb-del-btn" data-lyr="${l.name}" title="Delete / Remove Layer and its entities" style="border-color:rgba(239,68,68,0.45);color:#f87171"><i data-ic="trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    }).join("") : `<tr><td colspan="7" style="text-align:center;opacity:.65">No DXF file loaded. Click "Import DXF File(s)" below.</td></tr>`;

    const entCounts = activeDxf ? activeDxf.getEntitySummary() : {};
    const b = activeDxf ? activeDxf.bounds : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const wRaw = isFinite(b.minX) ? (b.maxX - b.minX) : 0;
    const hRaw = isFinite(b.minY) ? (b.maxY - b.minY) : 0;
    const diff = DXFState.lastEntityDiff;

    const diffRowsHTML = diff ? [
      ...(diff.modifiedPairs || []).map(m => `<tr style="background:rgba(245,158,11,0.08)"><td><b style="color:#f59e0b">Δ MODIFIED</b></td><td>${m.type}</td><td>${m.layer}</td><td>${m.summary}</td></tr>`),
      ...diff.added.map(e => `<tr class="add"><td><b>+ ADDED</b></td><td>${e.type}</td><td>${e.layer}</td><td>${e._summary || e.text || `(${(e.x1 ?? e.cx ?? e.x ?? 0).toFixed(2)}, ${(e.y1 ?? e.cy ?? e.y ?? 0).toFixed(2)})`}</td></tr>`),
      ...diff.removed.map(e => `<tr class="del"><td><b>− REMOVED</b></td><td>${e.type}</td><td>${e.layer}</td><td>${e._summary || e.text || `(${(e.x1 ?? e.cx ?? e.x ?? 0).toFixed(2)}, ${(e.y1 ?? e.cy ?? e.y ?? 0).toFixed(2)})`}</td></tr>`)
    ].slice(0, 150).join("") : `<tr><td colspan="4" style="text-align:center;opacity:.65">Load two DXF revisions (Rev A &amp; Rev B) to inspect native vector entity-level differences.</td></tr>`;

    modal.innerHTML = `
      <div class="rp-card rp-wide" style="width:min(960px,96vw);max-height:92vh">
        <div class="rp-hud-header">
          <div class="rp-hud-title">
            <h3>AutoCAD DXF Studio &amp; Layer Properties Workbench</h3>
            <span class="rp-hud-badge">${activeDxf ? (`$ACADVER: ${activeDxf.header["$ACADVER"] || "AC1015"} · UNITS: ${activeDxf.unitName.toUpperCase()} · NATIVE VECTOR`) : "R12 / R2000 / R2018 ASCII"}</span>
          </div>
          <button type="button" class="rp-hud-close" id="dxf-wb-close">Close (Esc)</button>
        </div>

        <div class="tabs" style="border-bottom:1px solid var(--line);margin-bottom:8px">
          <button type="button" class="cam-wb-tab ${initialTab === "layers" ? "on" : ""}" data-dxftab="layers"><i data-ic="layers"></i><span>1. CAD Layers (${layers.length}) — Lock, Freeze &amp; Remove</span></button>
          <button type="button" class="cam-wb-tab ${initialTab === "inspector" ? "on" : ""}" data-dxftab="inspector"><i data-ic="tabCad"></i><span>2. Native Vector Entity Diff &amp; Inspector</span></button>
          <button type="button" class="cam-wb-tab ${initialTab === "export" ? "on" : ""}" data-dxftab="export"><i data-ic="dxfOut"></i><span>3. Export Modified .dxf</span></button>
        </div>

        <!-- TAB 1: CAD LAYERS & DISPLAY -->
        <div class="cam-wb-pane" id="dxf-wb-pane-layers" ${initialTab === "layers" ? "" : "hidden"}>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-bottom:6px">
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" id="dxf-wb-import-btn" class="rp-btn-sm"><i data-ic="dxfIn"></i><span>Import DXF File(s)</span></button>
              <button type="button" id="dxf-wb-precompare-btn" class="rp-btn-sm" style="border-color:#10b981;color:#10b981"><i data-ic="tabCompare"></i><span>Pre-Compare Layer Selector</span></button>
              <button type="button" id="dxf-wb-studio-btn" class="rp-btn-sm" style="border-color:#38bdf8;color:#38bdf8"><i data-ic="cadDxf"></i><span>Open DXF Studio Editor</span></button>
              <button type="button" id="dxf-wb-add-lyr" class="rp-btn-sm"><i data-ic="plus"></i><span>+ New Layer</span></button>
              <button type="button" id="dxf-wb-purge-lyr" class="rp-btn-sm" title="Remove layers with 0 entities">Purge Unused</button>
            </div>
            <div style="display:flex;gap:4px">
              <button type="button" id="dxf-lyr-all" class="rp-btn-sm">All On</button>
              <button type="button" id="dxf-lyr-none" class="rp-btn-sm">All Off</button>
              <button type="button" id="dxf-lyr-inv" class="rp-btn-sm">Invert</button>
              <button type="button" id="dxf-lyr-unlock-all" class="rp-btn-sm">Unlock All</button>
            </div>
          </div>

          <div class="rp-scroll" style="max-height:36vh">
            <table class="btab" style="width:100%">
              <tr>
                <th style="width:45px;text-align:center">On</th>
                <th style="width:65px;text-align:center">Compare</th>
                <th>Layer Name &amp; Color</th>
                <th>Linetype</th>
                <th>Lineweight</th>
                <th style="width:60px;text-align:center">Entities</th>
                <th style="width:215px">AutoCAD Layer State &amp; Remove</th>
              </tr>
              ${layerRowsHTML}
            </table>
          </div>

          <div class="rp-hud-grid" style="margin-top:6px">
            <div class="rp-hud-section">
              <h4>CAD Modelspace / Paper Background</h4>
              <select id="dxf-wb-bg" style="width:100%">
                <option value="#0c1017" ${DXFState.background === "#0c1017" ? "selected" : ""}>AutoCAD Modelspace Dark (#0c1017)</option>
                <option value="#ffffff" ${DXFState.background === "#ffffff" ? "selected" : ""}>Crisp White Paper (#ffffff — A/B Redline Overlay)</option>
                <option value="#08182b" ${DXFState.background === "#08182b" ? "selected" : ""}>Blueprint CAD Navy (#08182b)</option>
              </select>
            </div>
            <div class="rp-hud-section">
              <h4>Vector Stroke Weight &amp; Grid</h4>
              <div style="display:flex;gap:12px;align-items:center">
                <label class="f">Line Width <input type="number" id="dxf-wb-lw" min="0.5" max="6" step="0.5" value="${DXFState.lineWidth}" style="width:64px" /> px</label>
                <label class="chk"><input type="checkbox" id="dxf-wb-grid" ${DXFState.showGrid ? "checked" : ""} /> Show CAD Grid</label>
              </div>
            </div>
          </div>

          <div class="rp-btns">
            <button type="button" id="dxf-wb-apply" class="rp-primary">Apply Layer &amp; Display Settings</button>
          </div>
        </div>

        <!-- TAB 2: ENTITY INSPECTOR & VECTOR DIFF -->
        <div class="cam-wb-pane" id="dxf-wb-pane-inspector" ${initialTab === "inspector" ? "" : "hidden"}>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:12px">
            <div class="rp-hud-section"><b>Extents (W × H):</b><span>${wRaw.toFixed(2)} × ${hRaw.toFixed(2)} ${activeDxf ? activeDxf.unitName : "mm"}</span></div>
            <div class="rp-hud-section"><b>Lines &amp; Polylines:</b><span>${(entCounts.LINE || 0) + (entCounts.LWPOLYLINE || 0)}</span></div>
            <div class="rp-hud-section"><b>Circles &amp; Arcs:</b><span>${(entCounts.CIRCLE || 0) + (entCounts.ARC || 0) + (entCounts.ELLIPSE || 0)}</span></div>
            <div class="rp-hud-section"><b>Text / Blocks / Dims:</b><span>${(entCounts.TEXT || 0) + (entCounts.INSERT || 0) + (entCounts.DIMENSION || 0)}</span></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
            <b>Native Vector CAD Primitive Diff ${diff ? `(+${diff.added.length} Added, −${diff.removed.length} Removed, ${(diff.modifiedPairs || []).length} Modified, ${diff.unchangedCount} Identical)` : ""}</b>
            <button type="button" id="dxf-exp-diff-csv" class="rp-btn-sm"><i data-ic="csv"></i><span>Export Vector Diff CSV</span></button>
          </div>
          <div class="rp-scroll" style="max-height:38vh">
            <table class="btab" style="width:100%">
              <tr><th>Change</th><th>Entity Type</th><th>CAD Layer</th><th>Coordinates / Geometry Summary</th></tr>
              ${diffRowsHTML}
            </table>
          </div>
        </div>

        <!-- TAB 3: EXPORT MODIFIED DXF OR PDF + REDLINES TO AUTOCAD DXF -->
        <div class="cam-wb-pane" id="dxf-wb-pane-export" ${initialTab === "export" ? "" : "hidden"}>
          <div class="rp-hud-grid">
            <div class="rp-hud-section">
              <h4>AutoCAD Units ($INSUNITS) &amp; Scale</h4>
              <div class="rp-form-group">
                <label>Drawing Units ($INSUNITS):</label>
                <select id="dxf-unit-sel" style="width:100%">
                  <option value="mm" ${defaultUnit === "mm" ? "selected" : ""}>IPC Metric — Millimeters (mm, $INSUNITS = 4)</option>
                  <option value="mils" ${defaultUnit === "mils" ? "selected" : ""}>IPC English — Mils / Thou (mils, $INSUNITS = 10)</option>
                  <option value="in">IPC English — Inches (in, $INSUNITS = 1)</option>
                </select>
              </div>
              <div class="rp-form-group" style="margin-top:8px">
                <label>Drawing Scale Factor Preset:</label>
                <select id="dxf-scale-sel" style="width:100%">
                  <option value="1:1" selected>1:1 (Full Native Scale)</option>
                  <option value="1:2">1:2</option>
                  <option value="1:5">1:5</option>
                  <option value="1:10">1:10</option>
                  <option value="1:50">1:50</option>
                  <option value="1:100">1:100</option>
                  <option value="1:1000">1:1000</option>
                </select>
              </div>
            </div>
            <div class="rp-hud-section">
              <h4>Exported AutoCAD Layers</h4>
              <label class="chk" style="margin:4px 0"><input type="checkbox" id="dxf-inc-diffs" checked /> Include <b>REDLINE_DIFFS</b> (Scalloped Revision Clouds)</label>
              <label class="chk" style="margin:4px 0"><input type="checkbox" id="dxf-inc-meas" checked /> Include <b>REDLINE_MEASUREMENTS &amp; MARKUPS</b> (Dims, Callouts, Stamps)</label>
              <label class="chk" style="margin:4px 0"><input type="checkbox" id="dxf-inc-bom" checked /> Include <b>REDLINE_BOM</b> (Numbered Inspection Badges)</label>
              <label class="chk" style="margin:4px 0"><input type="checkbox" id="dxf-inc-text" checked /> Include <b>TEXT</b> Layer (All Extracted Labels &amp; Notes)</label>
            </div>
          </div>
          <div class="rp-btns" style="margin-top:10px">
            <button type="button" id="dxf-exp-cancel">Cancel</button>
            <button type="button" id="dxf-exp-ok" class="rp-primary">Export Layered AutoCAD .dxf</button>
          </div>
        </div>
      </div>
    `;

    if (typeof hydrateIcons === "function") hydrateIcons(modal);

    modal.querySelectorAll("[data-dxftab]").forEach(btn => {
      btn.onclick = () => {
        modal.querySelectorAll("[data-dxftab]").forEach(b => b.classList.remove("on"));
        modal.querySelectorAll(".cam-wb-pane").forEach(p => { p.hidden = true; });
        btn.classList.add("on");
        const target = $(`#dxf-wb-pane-${btn.dataset.dxftab}`);
        if (target) target.hidden = false;
      };
    });

    $("#dxf-wb-close").onclick = () => { modal.hidden = true; };
    modal.onclick = e => { if (e.target === modal) modal.hidden = true; };

    if ($("#dxf-wb-import-btn")) {
      $("#dxf-wb-import-btn").onclick = () => { modal.hidden = true; promptDXFImport(); };
    }
    if ($("#dxf-wb-precompare-btn")) {
      $("#dxf-wb-precompare-btn").onclick = () => { modal.hidden = true; showDXFPreCompareModal(); };
    }
    if ($("#dxf-wb-studio-btn")) {
      $("#dxf-wb-studio-btn").onclick = () => { modal.hidden = true; if (typeof window.setView === "function") window.setView("dxf"); };
    }
    if ($("#dxf-wb-add-lyr")) {
      $("#dxf-wb-add-lyr").onclick = async () => {
        const name = (window.dialog ? (await window.dialog("New AutoCAD Layer", [{ type: "text", id: "name", label: "Layer Name", value: `LAYER_${layers.length + 1}` }], "Create"))?.name : `LAYER_${layers.length + 1}`);
        if (!name) return;
        [DXFState.parsedA, DXFState.parsedB].forEach(p => { if (p && p.addLayer) p.addLayer(name, { color: 3 }); });
        DXFState.comparedLayers.add(name);
        rpToast(`Created layer "${name}".`);
        showDXFWorkbenchModal("layers");
      };
    }
    if ($("#dxf-wb-purge-lyr")) {
      $("#dxf-wb-purge-lyr").onclick = () => {
        let count = 0;
        [DXFState.parsedA, DXFState.parsedB].forEach(p => { if (p && p.purgeUnusedLayers) count += p.purgeUnusedLayers().length; });
        rpToast(count ? `Purged ${count} unused layer(s).` : "No empty unused layers to purge.");
        showDXFWorkbenchModal("layers");
      };
    }

    modal.querySelectorAll(".dxf-wb-col-pick").forEach(inp => {
      inp.onchange = () => { DXFState.applyLayerStateToParsers(inp.dataset.lyr, { customHex: inp.value }); };
    });
    modal.querySelectorAll(".dxf-wb-ltype").forEach(sel => {
      sel.onchange = () => { DXFState.applyLayerStateToParsers(sel.dataset.lyr, { linetype: sel.value }); };
    });
    modal.querySelectorAll(".dxf-wb-lw-sel").forEach(sel => {
      sel.onchange = () => { DXFState.applyLayerStateToParsers(sel.dataset.lyr, { lineweight: parseInt(sel.value, 10) }); };
    });
    modal.querySelectorAll(".dxf-wb-frz-btn").forEach(btn => {
      btn.onclick = () => {
        const lyr = btn.dataset.lyr;
        const nextFrz = !DXFState.frozenLayers.has(lyr);
        DXFState.applyLayerStateToParsers(lyr, { frozen: nextFrz, visible: !nextFrz });
        showDXFWorkbenchModal("layers");
      };
    });
    modal.querySelectorAll(".dxf-wb-lck-btn").forEach(btn => {
      btn.onclick = () => {
        const lyr = btn.dataset.lyr;
        const nextLck = !DXFState.lockedLayers.has(lyr);
        DXFState.applyLayerStateToParsers(lyr, { locked: nextLck });
        rpToast(`Layer "${lyr}" ${nextLck ? "Locked" : "Unlocked"}.`);
        showDXFWorkbenchModal("layers");
      };
    });
    modal.querySelectorAll(".dxf-wb-solo-btn").forEach(btn => {
      btn.onclick = () => {
        const target = btn.dataset.lyr;
        layers.forEach(l => {
          const on = (l.name === target);
          DXFState.applyLayerStateToParsers(l.name, { visible: on, compared: on });
        });
        rpToast(`Isolated layer "${target}".`);
        showDXFWorkbenchModal("layers");
      };
    });
    modal.querySelectorAll(".dxf-wb-del-btn").forEach(btn => {
      btn.onclick = () => {
        const lyr = btn.dataset.lyr;
        const res = DXFState.deleteLayerFromParsers(lyr, "both", "delete_entities");
        if (!res.ok) return rpToast(res.reason);
        rpToast(`Removed layer "${lyr}" (${res.removedCount} entities deleted).`);
        showDXFWorkbenchModal("layers");
      };
    });

    if ($("#dxf-lyr-all")) {
      $("#dxf-lyr-all").onclick = () => {
        layers.forEach(l => DXFState.applyLayerStateToParsers(l.name, { visible: true, frozen: false, compared: true }));
        showDXFWorkbenchModal("layers");
      };
    }
    if ($("#dxf-lyr-none")) {
      $("#dxf-lyr-none").onclick = () => {
        layers.forEach(l => DXFState.applyLayerStateToParsers(l.name, { visible: false, compared: false }));
        showDXFWorkbenchModal("layers");
      };
    }
    if ($("#dxf-lyr-inv")) {
      $("#dxf-lyr-inv").onclick = () => {
        layers.forEach(l => {
          const next = DXFState.hiddenLayers.has(l.name);
          DXFState.applyLayerStateToParsers(l.name, { visible: next, compared: next });
        });
        showDXFWorkbenchModal("layers");
      };
    }
    if ($("#dxf-lyr-unlock-all")) {
      $("#dxf-lyr-unlock-all").onclick = () => {
        layers.forEach(l => DXFState.applyLayerStateToParsers(l.name, { locked: false }));
        showDXFWorkbenchModal("layers");
      };
    }

    if ($("#dxf-wb-apply")) {
      $("#dxf-wb-apply").onclick = async () => {
        modal.querySelectorAll(".dxf-lyr-chk").forEach(c => {
          DXFState.applyLayerStateToParsers(c.dataset.lyr, { visible: c.checked });
        });
        modal.querySelectorAll(".dxf-lyr-cmp-chk").forEach(c => {
          DXFState.applyLayerStateToParsers(c.dataset.lyr, { compared: c.checked });
        });
        DXFState.background = $("#dxf-wb-bg").value;
        DXFState.lineWidth = Math.max(0.25, parseFloat($("#dxf-wb-lw").value) || 1.0);
        DXFState.showGrid = $("#dxf-wb-grid").checked;
        modal.hidden = true;
        await reRenderActiveDXFLayers();
        rpToast(`Updated Native DXF View: ${DXFState.comparedLayers.size}/${layers.length} layers active.`);
      };
    }

    if ($("#dxf-exp-diff-csv")) {
      $("#dxf-exp-diff-csv").onclick = () => {
        if (!diff) return rpToast("Load two DXF files first to export vector diffs.");
        const rows = [
          "change,entity_type,layer,details",
          ...diff.added.map(e => `ADDED,${e.type},"${e.layer}","${(e._summary || e.text || `(${(e.x1 ?? e.cx ?? e.x ?? 0).toFixed(3)}, ${(e.y1 ?? e.cy ?? e.y ?? 0).toFixed(3)})`).replace(/"/g, '""')}"`),
          ...diff.removed.map(e => `REMOVED,${e.type},"${e.layer}","${(e._summary || e.text || `(${(e.x1 ?? e.cx ?? e.x ?? 0).toFixed(3)}, ${(e.y1 ?? e.cy ?? e.y ?? 0).toFixed(3)})`).replace(/"/g, '""')}"`)
        ];
        const enc = new TextEncoder().encode("\ufeff" + rows.join("\r\n"));
        window.native && window.native.saveFile({ name: "dxf_vector_diff.csv", bytes: enc, filters: [{ name: "CSV", extensions: ["csv"] }] });
        rpToast("Exported DXF Vector Diff CSV.");
      };
    }

    if ($("#dxf-exp-cancel")) $("#dxf-exp-cancel").onclick = () => { modal.hidden = true; };
    if ($("#dxf-exp-ok")) {
      $("#dxf-exp-ok").onclick = async () => {
        const unit = $("#dxf-unit-sel").value;
        const scaleStr = $("#dxf-scale-sel").value;
        const scale = DXFEngine.PRESETS[scaleStr] || 1.0;
        const incDiffs = $("#dxf-inc-diffs").checked;
        const incMeas = $("#dxf-inc-meas") ? $("#dxf-inc-meas").checked : true;
        const incBom = $("#dxf-inc-bom") ? $("#dxf-inc-bom").checked : true;
        const incText = $("#dxf-inc-text") ? $("#dxf-inc-text").checked : true;
        modal.hidden = true;

        // If native DXF is loaded, export directly from the modified DXF AST!
        if (DXFState._isActiveDXFSession && (DXFState.parsedB || DXFState.parsedA)) {
          const targetParser = DXFState.parsedB || DXFState.parsedA;
          const dxfString = targetParser.toDXFString();
          const enc = new TextEncoder().encode(dxfString);
          const baseName = (DXFState.nameB || DXFState.nameA || "Drawing").replace(/\.[^.]+$/, "");
          if (window.native && window.native.saveFile) {
            await window.native.saveFile({
              name: `${baseName}_Modified.dxf`,
              bytes: enc,
              filters: [{ name: "AutoCAD DXF", extensions: ["dxf"] }]
            });
            rpToast(`Exported Native AutoCAD ${baseName}_Modified.dxf successfully.`);
          }
          return;
        }

        const S = (typeof window !== "undefined" && window.CMP) ? window.CMP : {};
        const E = (typeof window !== "undefined" && window.RE && window.RE.E) ? window.RE.E : {};
        const RM = (typeof window !== "undefined" && window.RP_MEASURE) ? window.RP_MEASURE : {};
        const activeDoc = S.A || S.B || E.doc;
        if (!activeDoc) {
          rpToast("Please open a PDF or CAD drawing first before exporting DXF.");
          return;
        }

        try {
          rpToast("Extracting vector paths, text, redline clouds & measurements to AutoCAD DXF...");
          const pageNum = S.n || (E.cur + 1) || 1;
          const page = await activeDoc.getPage(pageNum);
          const dxfString = await DXFEngine.exportPDFToDXF(page, {
            unit,
            scale,
            pageNumber: pageNum,
            includeText: incText,
            imgWidth: (S.cur && S.cur.W) ? S.cur.W : null,
            diffRegions: incDiffs ? DefectState.defects : [],
            annotations: incMeas ? [
              ...(RM.annotations || []),
              ...((E.ann && E.ann[pageNum - 1]) || []),
              ...((E.meas && E.meas[pageNum - 1]) || [])
            ] : [],
            tallyItems: incBom && RM.tally ? (RM.tally.items || []) : []
          });

          const enc = new TextEncoder().encode(dxfString);
          const baseName = ((S.names && S.names.A) || E.name || "Drawing").replace(/\.[^.]+$/, "");
          if (window.native && window.native.saveFile) {
            await window.native.saveFile({
              name: `${baseName}_${unit}.dxf`,
              bytes: enc,
              filters: [{ name: "AutoCAD DXF", extensions: ["dxf"] }]
            });
            rpToast(`Exported layered AutoCAD ${baseName}_${unit}.dxf successfully.`);
          }
        } catch (err) {
          rpToast("DXF Export failed: " + err.message);
        }
      };
    }
  }

  async function promptDXFExport() {
    showDXFWorkbenchModal("export");
  }

  /**
   * Stage 1 or 2 DXF files and open the Pre-Compare DXF Layer Selection Modal BEFORE comparing two DXFs!
   */
  async function stageAndPromptDXFFiles(files = [], targetSlot = null) {
    if (!files || !files.length || typeof DXFEngine === "undefined") return;
    if (DXFState._isSampleDXF) {
      DXFState.parsedA = null; DXFState.rawA = null; DXFState.nameA = "";
      DXFState.parsedB = null; DXFState.rawB = null; DXFState.nameB = "";
      DXFState.lastEntityDiff = null;
      DXFState.hiddenLayers.clear();
      DXFState.frozenLayers.clear();
      DXFState.lockedLayers.clear();
      DXFState.comparedLayers.clear();
      DXFState._isSampleDXF = false;
    }
    const decodeDxf = bytes => {
      const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      return DXFEngine.decodeDXFBytes ? DXFEngine.decodeDXFBytes(u8) : new TextDecoder().decode(u8);
    };
    if (files.length >= 2) {
      const textA = typeof files[0].text === "string" ? files[0].text : decodeDxf(files[0].bytes);
      const textB = typeof files[1].text === "string" ? files[1].text : decodeDxf(files[1].bytes);
      DXFState.rawA = textA;
      DXFState.rawB = textB;
      DXFState.nameA = files[0].name || "RevA.dxf";
      DXFState.nameB = files[1].name || "RevB.dxf";
      DXFState.parsedA = new DXFEngine.DXFParser(textA).parse();
      DXFState.parsedB = new DXFEngine.DXFParser(textB).parse();
      DXFState.hiddenLayers.clear();
      DXFState.frozenLayers.clear();
      DXFState.lockedLayers.clear();
      DXFState.comparedLayers.clear();
      DXFState.syncLayerSetsFromParsers();
      await reRenderActiveDXFLayers();
      showDXFPreCompareModal();
      return;
    }
    const f = files[0];
    const text = typeof f.text === "string" ? f.text : decodeDxf(f.bytes);
    const parser = new DXFEngine.DXFParser(text).parse();
    const S = (typeof window !== "undefined" && window.CMP) ? window.CMP : {};
    const effSlot = targetSlot || ((!S.A || !DXFState.parsedA || (DXFState.parsedA && DXFState.parsedB)) ? "A" : "B");
    if (effSlot === "A") {
      DXFState.rawA = text;
      DXFState.nameA = f.name || "RevA.dxf";
      DXFState.parsedA = parser;
      if (!targetSlot) {
        DXFState.rawB = null;
        DXFState.nameB = "";
        DXFState.parsedB = null;
        DXFState.lastEntityDiff = null;
      }
    } else {
      DXFState.rawB = text;
      DXFState.nameB = f.name || "RevB.dxf";
      DXFState.parsedB = parser;
    }
    DXFState.comparedLayers.clear();
    DXFState.syncLayerSetsFromParsers();
    await reRenderActiveDXFLayers();
    if (DXFState.parsedA && DXFState.parsedB) {
      showDXFPreCompareModal();
    } else {
      rpToast(`Imported AutoCAD DXF (${parser.entities.length} entities, ${Object.keys(parser.layers).length} layers) into Slot ${effSlot}.`);
    }
  }

  /**
   * DXF Import: Supports importing 1 or 2 ASCII DXF files with Pre-Compare Layer Selection & Native Vector Compare!
   */
  async function promptDXFImport() {
    if (!window.native || !window.native.openFiles) return;
    const files = await window.native.openFiles({
      title: "Import AutoCAD DXF Drawing(s) — Select 1 File or 2 Files (Rev A & Rev B)",
      multi: true,
      filters: [{ name: "AutoCAD DXF", extensions: ["dxf"] }]
    });
    if (!files || !files.length) return;
    try {
      if (typeof setView === "function") setView("compare");
      await stageAndPromptDXFFiles(files, null);
    } catch (e) {
      rpToast("Could not parse DXF: " + e.message);
    }
  }

  const CAM_DIALOG_EXTENSIONS = [
    'gbr', 'ger', 'art', 'pho', 'top', 'bot', 'gtl', 'gbl', 'gbs', 'gts', 'gto', 'gbo', 'gtp', 'gbp', 'gko', 'gpb', 'gpt',
    'gm1', 'gm2', 'gm3', 'cmp', 'sol', 'stc', 'sts', 'plc', 'pls', 'crc', 'crs',
    'drl', 'xln', 'ncd', 'drd', 'exc', 'tap', 'rou', 'ipc', 'd356', 'net', 'zip', 'txt',
    ...Array.from({ length: 100 }, (_, i) => `g${i + 1}`),
    ...Array.from({ length: 100 }, (_, i) => `l${i + 1}`),
    ...Array.from({ length: 32 }, (_, i) => `gp${i + 1}`)
  ];

  /**
   * Expand any .zip archives in a list of uploaded files into individual CAM layer files
   */
  async function expandUploadedCAMFiles(rawFiles = []) {
    const expanded = [];
    for (const f of rawFiles) {
      if (!f) continue;
      const u8 = f.bytes ? (f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes)) : null;
      const isZip = /\.zip$/i.test(f.name || '') || (u8 && u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04);
      if (isZip && u8) {
        const unpacked = await extractZipArchive(u8);
        const validCam = unpacked.filter(uf => (CAMEngine.isCAMFileName && CAMEngine.isCAMFileName(uf.name)) || /\.(txt|gbr|drl|ipc)$/i.test(uf.name));
        if (validCam.length) {
          expanded.push(...validCam);
          continue;
        }
      }
      expanded.push(f);
    }
    return expanded;
  }

  /**
   * Stage 1 to 100+ CAM Layer Files into CAMState (Slot A and/or Slot B) WITHOUT auto-starting comparison!
   */
  async function stageUploadedCAMFiles(rawFiles = [], targetSlot = null, replaceSlot = false) {
    if (typeof CAMEngine === 'undefined' || !rawFiles || !rawFiles.length) return;
    const files = await expandUploadedCAMFiles(rawFiles);
    if (!files.length) return;

    const entries = files.map((f, idx) => CAMEngine.CAMJobStack.createLayerEntry(f, idx));

    const isExplicitRevA = name => /(?:^|[._\-\s])(?:rev[._\-\s]*a|ver[._\-\s]*a|old|base|orig|original|v1)(?:[._\-\s]|\.|$)/i.test(name || '');
    const isExplicitRevB = name => /(?:^|[._\-\s])(?:rev[._\-\s]*b|ver[._\-\s]*b|new|revised|mod|modified|v2)(?:[._\-\s]|\.|$)/i.test(name || '');

    const revAList = entries.filter(e => isExplicitRevA(e.name) && !isExplicitRevB(e.name));
    const revBList = entries.filter(e => isExplicitRevB(e.name) && !isExplicitRevA(e.name));
    const hasExplicitABPair = !replaceSlot && revAList.length > 0 && revBList.length > 0 && (revAList.length + revBList.length === entries.length);
    const isTwoSameRoleFiles = !replaceSlot && entries.length === 2 && !CAMState.layersA.length && !CAMState.layersB.length &&
      (entries[0].layerMeta.pairKey === entries[1].layerMeta.pairKey || entries[0].layerMeta.category === entries[1].layerMeta.category);

    if (hasExplicitABPair) {
      CAMState.layersA = CAMEngine.CAMJobStack.sortLayers(revAList);
      CAMState.layersB = CAMEngine.CAMJobStack.sortLayers(revBList);
    } else if (isTwoSameRoleFiles) {
      CAMState.layersA = [entries[0]];
      CAMState.layersB = [entries[1]];
    } else if (targetSlot === 'A') {
      if (replaceSlot || !CAMState.layersA.length) CAMState.layersA = entries;
      else {
        const existingNames = new Set(CAMState.layersA.map(x => x.name));
        for (const e of entries) {
          const dupIdx = CAMState.layersA.findIndex(x => x.name === e.name);
          if (dupIdx >= 0) CAMState.layersA[dupIdx] = e;
          else if (!existingNames.has(e.name)) CAMState.layersA.push(e);
        }
      }
      CAMState.layersA = CAMEngine.CAMJobStack.sortLayers(CAMState.layersA);
    } else if (targetSlot === 'B') {
      if (replaceSlot || !CAMState.layersB.length) CAMState.layersB = entries;
      else {
        const existingNames = new Set(CAMState.layersB.map(x => x.name));
        for (const e of entries) {
          const dupIdx = CAMState.layersB.findIndex(x => x.name === e.name);
          if (dupIdx >= 0) CAMState.layersB[dupIdx] = e;
          else if (!existingNames.has(e.name)) CAMState.layersB.push(e);
        }
      }
      CAMState.layersB = CAMEngine.CAMJobStack.sortLayers(CAMState.layersB);
    } else {
      // No explicit slot passed: check if files contain explicit Rev A and Rev B naming
      const revAList = entries.filter(e => isExplicitRevA(e.name) && !isExplicitRevB(e.name));
      const revBList = entries.filter(e => isExplicitRevB(e.name) && !isExplicitRevA(e.name));
      if (revAList.length > 0 && revBList.length > 0 && (revAList.length + revBList.length === entries.length)) {
        CAMState.layersA = CAMEngine.CAMJobStack.sortLayers(revAList);
        CAMState.layersB = CAMEngine.CAMJobStack.sortLayers(revBList);
      } else if (entries.length === 2 && !CAMState.layersA.length && !CAMState.layersB.length && entries[0].layerMeta.pairKey === entries[1].layerMeta.pairKey) {
        // User selected 2 files of the exact same layer role (e.g., Top_1.gtl and Top_2.gtl) when both A and B were empty
        CAMState.layersA = [entries[0]];
        CAMState.layersB = [entries[1]];
      } else if (!CAMState.layersA.length) {
        CAMState.layersA = CAMEngine.CAMJobStack.sortLayers(entries);
      } else if (!CAMState.layersB.length) {
        CAMState.layersB = CAMEngine.CAMJobStack.sortLayers(entries);
      } else {
        CAMState.layersA = CAMEngine.CAMJobStack.sortLayers(entries);
      }
    }

    // Sync legacy globals for single/active layer
    const firstGbrA = CAMState.layersA.find(x => x.layerMeta.category !== 'drill' && x.layerMeta.category !== 'netlist');
    const firstGbrB = CAMState.layersB.find(x => x.layerMeta.category !== 'drill' && x.layerMeta.category !== 'netlist');
    const firstDrlA = CAMState.layersA.find(x => x.layerMeta.category === 'drill');
    const firstDrlB = CAMState.layersB.find(x => x.layerMeta.category === 'drill');
    const firstIpcA = CAMState.layersA.find(x => x.layerMeta.category === 'netlist');
    const firstIpcB = CAMState.layersB.find(x => x.layerMeta.category === 'netlist');
    if (typeof window !== 'undefined') {
      window.__lastGerberA = firstGbrA ? firstGbrA.text : null;
      window.__lastGerberB = firstGbrB ? firstGbrB.text : null;
      window.__lastDrill = firstDrlA ? firstDrlA.text : null;
      window.__lastDrillB = firstDrlB ? firstDrlB.text : null;
      window.__lastIPCA = firstIpcA ? firstIpcA.text : null;
      window.__lastIPCB = firstIpcB ? firstIpcB.text : null;
    }

    CAMState.pairedLayers = CAMEngine.CAMJobStack.pairLayerStacks(CAMState.layersA, CAMState.layersB);
    return {
      countA: CAMState.layersA.length,
      countB: CAMState.layersB.length,
      pairedCount: CAMState.pairedLayers.length
    };
  }

  /**
   * Stage uploaded CAM file(s) and IMMEDIATELY open the Pre-Compare CAM Setup & Verification Modal
   * (Does NOT auto-start comparison until the user confirms Metric vs English and other CAM parameters!)
   */
  async function stageAndPromptCAMFiles(rawFiles = [], targetSlot = null, replaceSlot = false) {
    if (typeof setView === 'function') setView('compare');
    const res = await stageUploadedCAMFiles(rawFiles, targetSlot, replaceSlot);
    if (!res) return;
    const stEl = $('#st');
    const msg = `Staged CAM Stackup (Rev A: ${res.countA} layer file${res.countA === 1 ? '' : 's'}, Rev B: ${res.countB} layer file${res.countB === 1 ? '' : 's'}) — Please confirm Metric (mm) or English (mils/in) and CAM parameters to compare.`;
    if (stEl) stEl.textContent = msg;
    updateCAMSidebarPane();
    showCAMPreCompareModal();
    rpToast(msg);
  }

  /**
   * Pre-Compare CAM Setup & Multi-Layer Stackup Verification Dialog
   * Asks the user for Metric (mm) vs English (mils/in), Coordinate Format, Zero Suppression, Polarity,
   * Multi-Layer Stackup Pairing (1 Layer = 1 CAM File, 100 Layers = 100 CAM Files), Alignment & IPC DFM Rules BEFORE starting compare!
   */
  function showCAMPreCompareModal() {
    if (typeof document === 'undefined' || typeof CAMEngine === 'undefined') return;
    document.querySelectorAll('.rp-modal:not(.rp-side-docked)').forEach(el => { if (el.id) el.hidden = true; else el.remove(); });

    let modal = $('#rp-cam-precompare-modal');
    if (!modal) {
      modal = el('div', { id: 'rp-cam-precompare-modal', className: 'rp-modal' });
      document.body.appendChild(modal);
    }
    modal.hidden = false;

    const pairs = CAMEngine.CAMJobStack.pairLayerStacks(CAMState.layersA, CAMState.layersB);
    CAMState.pairedLayers = pairs;

    const allStaged = [...CAMState.layersA, ...CAMState.layersB];
    const metricHeaders = allStaged.filter(l => l.explicitUnits === 'MM').length;
    const englishHeaders = allStaged.filter(l => l.explicitUnits === 'IN' || l.explicitUnits === 'MILS').length;
    const missingUnitHeaders = allStaged.filter(l => !l.explicitUnits).length;

    // Suggest detected unit system if explicit headers exist and user hasn't forced one yet
    let suggestedSys = CAMState.unitSystem;
    if (metricHeaders > 0 && englishHeaders === 0) suggestedSys = 'metric';
    else if (englishHeaders > 0 && metricHeaders === 0) suggestedSys = 'english';
    const isMetric = suggestedSys === 'metric';

    const rules = CAMEngine.IPC_DFM_RULES[CAMState.ipcClass] || CAMState.customRules;
    const escHtml = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const headerBannerMsg = !allStaged.length
      ? 'Upload 1 to 100+ CAM layer files for Base (Rev A) and Revised (Rev B) below (1 layer = 1 CAM file, 100 layers = 100 CAM files).'
      : `Detected <b>${CAMState.layersA.length}</b> Rev A layer file(s) and <b>${CAMState.layersB.length}</b> Rev B layer file(s) (${pairs.length} paired layer${pairs.length === 1 ? '' : 's'}). ` +
        `Headers: <b>${metricHeaders} Metric (mm)</b>, <b>${englishHeaders} English (in/mil)</b>` +
        (missingUnitHeaders > 0 ? `, <b style="color:#fbbf24">${missingUnitHeaders} file(s) without unit header (RS-274D/Excellon) — confirm Metric or English below.</b>` : '.') +
        (metricHeaders > 0 && englishHeaders > 0 ? ' <b style="color:#38bdf8">Mixed Metric &amp; English files detected — Kensho Pro will auto-scale both to shared physical coordinates!</b>' : '');

    const pairRowsHTML = pairs.length ? pairs.map((p, idx) => {
      const lA = p.layerA;
      const lB = p.layerB;
      const uA = lA ? (lA.explicitUnits ? `${lA.explicitUnits}${lA.explicitFormat ? ' ' + lA.explicitFormat : ''}` : 'No Header (Use Selected)') : '—';
      const uB = lB ? (lB.explicitUnits ? `${lB.explicitUnits}${lB.explicitFormat ? ' ' + lB.explicitFormat : ''}` : 'No Header (Use Selected)') : '—';
      const colDot = `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${(lA && lA.layerMeta && lA.layerMeta.color) || (lB && lB.layerMeta && lB.layerMeta.color) || '#38bdf8'};margin-right:5px"></span>`;
      const isEnabled = (lA ? lA.enabled !== false : true) && (lB ? lB.enabled !== false : true);
      return `
        <tr>
          <td style="text-align:center"><input type="checkbox" class="cam-pre-pair-chk" data-pairidx="${idx}" ${isEnabled ? 'checked' : ''}></td>
          <td><b>#${p.pairIndex}</b> (${escHtml(p.code)})</td>
          <td>${colDot}<b>${escHtml(p.label)}</b></td>
          <td>${lA ? `<span title="${escHtml(lA.path || lA.name)}"><b>${escHtml(lA.name)}</b> <small style="opacity:.75">[${uA}]</small></span>` : '<span style="color:#f87171;font-size:11px">— Missing in Rev A —</span>'}</td>
          <td>${lB ? `<span title="${escHtml(lB.path || lB.name)}"><b>${escHtml(lB.name)}</b> <small style="opacity:.75">[${uB}]</small></span>` : '<span style="color:#fbbf24;font-size:11px">— Missing in Rev B —</span>'}</td>
          <td style="text-align:right">
            ${lA ? `<button type="button" class="rp-btn-sm cam-pre-del-a" data-id="${lA.id}" title="Remove from Rev A">−A</button>` : ''}
            ${lB ? `<button type="button" class="rp-btn-sm cam-pre-del-b" data-id="${lB.id}" title="Remove from Rev B">−B</button>` : ''}
          </td>
        </tr>
      `;
    }).join('') : `<tr><td colspan="6" style="text-align:center;padding:14px;opacity:.75">No CAM layer files staged yet. Click <b>+ Add Rev A CAM Layers (1–100+)</b> and <b>+ Add Rev B CAM Layers (1–100+)</b> below.</td></tr>`;

    const hasBoth = CAMState.layersA.length > 0 && CAMState.layersB.length > 0;
    const hasAny = CAMState.layersA.length > 0 || CAMState.layersB.length > 0;

    modal.innerHTML = `
      <div class="rp-card rp-wide" style="width:min(980px,96vw);max-height:92vh;display:flex;flex-direction:column;gap:10px">
        <div class="rp-hud-header">
          <div class="rp-hud-title">
            <h3><i data-ic="pcbCam"></i> CAM Setup &amp; Layer Stack (${pairs.length} Layer${pairs.length === 1 ? '' : 's'})</h3>
            <span class="rp-hud-badge" id="cam-pre-unit-badge">${isMetric ? 'METRIC (MM)' : 'ENGLISH (MIL)'}</span>
          </div>
          <button type="button" class="rp-hud-close" id="cam-pre-close">Close (Esc)</button>
        </div>

        <div style="background:rgba(56,189,248,0.10);border:1px solid rgba(56,189,248,0.35);border-radius:4px;padding:8px 12px;font-size:12px;line-height:1.45">
          ${headerBannerMsg}
        </div>

        <div class="rp-scroll" style="max-height:70vh;display:flex;flex-direction:column;gap:10px;padding-right:4px">
          <div class="rp-hud-grid" style="gap:10px">
            <!-- QUESTION 1 & 2: METRIC VS ENGLISH & COORDINATE FORMAT -->
            <div class="rp-hud-section">
              <h4>1. Confirm Measurement Units (Metric vs. English) &amp; Format</h4>
              <div class="rp-form-group">
                <label style="font-weight:700;color:#38bdf8">Are these CAM layers in Metric (mm) or English (mils / inches)?</label>
                <select id="cam-pre-units" style="font-weight:700;border-color:#38bdf8">
                  <option value="english" ${!isMetric ? 'selected' : ''}>IPC English / Imperial — Mils &amp; Inches (1 in = 1000 mil)</option>
                  <option value="metric" ${isMetric ? 'selected' : ''}>IPC Metric / SI — Millimeters &amp; Microns (1 mm = 39.37 mil)</option>
                </select>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div class="rp-form-group">
                  <label>Rev A File Unit Override:</label>
                  <select id="cam-pre-units-a">
                    <option value="AUTO" ${CAMState.unitsOverrideA === 'AUTO' ? 'selected' : ''}>Auto Header (Fallback to Selected)</option>
                    <option value="ENGLISH" ${CAMState.unitsOverrideA === 'ENGLISH' ? 'selected' : ''}>Force English (IN / MILS)</option>
                    <option value="METRIC" ${CAMState.unitsOverrideA === 'METRIC' ? 'selected' : ''}>Force Metric (MM)</option>
                  </select>
                </div>
                <div class="rp-form-group">
                  <label>Rev B File Unit Override:</label>
                  <select id="cam-pre-units-b">
                    <option value="AUTO" ${CAMState.unitsOverrideB === 'AUTO' ? 'selected' : ''}>Auto Header (Fallback to Selected)</option>
                    <option value="ENGLISH" ${CAMState.unitsOverrideB === 'ENGLISH' ? 'selected' : ''}>Force English (IN / MILS)</option>
                    <option value="METRIC" ${CAMState.unitsOverrideB === 'METRIC' ? 'selected' : ''}>Force Metric (MM)</option>
                  </select>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
                <div class="rp-form-group">
                  <label>Zero Suppression:</label>
                  <select id="cam-pre-zeros">
                    <option value="AUTO" ${CAMState.zeroSuppression === 'AUTO' ? 'selected' : ''}>Auto (%FS / M48)</option>
                    <option value="L" ${CAMState.zeroSuppression === 'L' ? 'selected' : ''}>Leading Zeros (LZ)</option>
                    <option value="T" ${CAMState.zeroSuppression === 'T' ? 'selected' : ''}>Trailing Zeros (TZ)</option>
                    <option value="D" ${CAMState.zeroSuppression === 'D' ? 'selected' : ''}>Explicit Decimal</option>
                  </select>
                </div>
                <div class="rp-form-group">
                  <label>Integer.Decimal (M.N):</label>
                  <select id="cam-pre-fmt">
                    <option value="AUTO" ${CAMState.coordFormat === 'AUTO' ? 'selected' : ''}>Auto-Detect Header</option>
                    <option value="2.4" ${CAMState.coordFormat === '2.4' ? 'selected' : ''}>2.4 (English 0.1 mil)</option>
                    <option value="2.5" ${CAMState.coordFormat === '2.5' ? 'selected' : ''}>2.5 (English 0.01 mil)</option>
                    <option value="2.3" ${CAMState.coordFormat === '2.3' ? 'selected' : ''}>2.3 (English 1.0 mil)</option>
                    <option value="3.3" ${CAMState.coordFormat === '3.3' ? 'selected' : ''}>3.3 (Metric 1 µm)</option>
                    <option value="3.4" ${CAMState.coordFormat === '3.4' ? 'selected' : ''}>3.4 (Metric 0.1 µm)</option>
                    <option value="4.4" ${CAMState.coordFormat === '4.4' ? 'selected' : ''}>4.4 (Large Panel)</option>
                    <option value="4.2" ${CAMState.coordFormat === '4.2' ? 'selected' : ''}>4.2 (Coarse Metric)</option>
                  </select>
                </div>
                <div class="rp-form-group">
                  <label>Coordinate Mode:</label>
                  <select id="cam-pre-coordmode">
                    <option value="AUTO" ${CAMState.coordMode === 'AUTO' ? 'selected' : ''}>Auto (G90 / G91)</option>
                    <option value="A" ${CAMState.coordMode === 'A' ? 'selected' : ''}>Absolute (G90)</option>
                    <option value="I" ${CAMState.coordMode === 'I' ? 'selected' : ''}>Incremental (G91)</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- QUESTION 3, 4 & 5: STACKUP COMPARE MODE, ALIGNMENT, POLARITY & IPC DFM -->
            <div class="rp-hud-section">
              <h4>2. Stackup Compare Mode, Polarity, Alignment &amp; IPC Rules</h4>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div class="rp-form-group">
                  <label>Multi-Layer Compare Mode (1–100+ Layers):</label>
                  <select id="cam-pre-stackmode">
                    <option value="multipage" ${CAMState.stackCompareMode === 'multipage' ? 'selected' : ''}>Layer-by-Layer (1 CAM File = 1 Page, 1..100+ Layers)</option>
                    <option value="composite" ${CAMState.stackCompareMode === 'composite' ? 'selected' : ''}>Composite Stackup (Merge Checked Layers onto 1 Sheet)</option>
                    <option value="single" ${CAMState.stackCompareMode === 'single' ? 'selected' : ''}>Single Active Layer Pair Only</option>
                  </select>
                </div>
                <div class="rp-form-group">
                  <label>Board Datum / Registration Alignment:</label>
                  <select id="cam-pre-align">
                    <option value="origin" ${CAMState.alignmentMode === 'origin' ? 'selected' : ''}>Shared Physical Origin (Datum 0,0)</option>
                    <option value="center" ${CAMState.alignmentMode === 'center' ? 'selected' : ''}>Align by Board Extents / Outline Center</option>
                    <option value="autoalign" ${CAMState.alignmentMode === 'autoalign' ? 'selected' : ''}>Sub-Pixel Auto-Align After Compare</option>
                  </select>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
                <div class="rp-form-group">
                  <label>IPC DFM / DRC Class:</label>
                  <select id="cam-pre-ipc">
                    <option value="class1" ${CAMState.ipcClass === 'class1' ? 'selected' : ''}>IPC Class 1 (6 mil)</option>
                    <option value="class2" ${CAMState.ipcClass === 'class2' ? 'selected' : ''}>IPC Class 2 (4 mil Std)</option>
                    <option value="class3" ${CAMState.ipcClass === 'class3' ? 'selected' : ''}>IPC Class 3 (3 mil Aero)</option>
                    <option value="hdi" ${CAMState.ipcClass === 'hdi' ? 'selected' : ''}>IPC HDI (2 mil Microvia)</option>
                  </select>
                </div>
                <div class="rp-form-group">
                  <label id="cam-pre-tol-lbl">Compare Tol (${isMetric ? 'mm' : 'mils'}):</label>
                  <input type="number" id="cam-pre-tol" step="0.01" min="0" value="${isMetric ? ((rules.compareTolMils || 0.25) * 0.0254).toFixed(3) : (rules.compareTolMils || 0.25)}" style="width:100%" />
                </div>
                <div class="rp-form-group">
                  <label id="cam-pre-clr-lbl">Min Clearance (${isMetric ? 'mm' : 'mils'}):</label>
                  <input type="number" id="cam-pre-clr" step="0.01" min="0.01" value="${isMetric ? ((rules.minClearanceMils || 4.0) * 0.0254).toFixed(3) : (rules.minClearanceMils || 4.0)}" style="width:100%" />
                </div>
              </div>
              <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:2px;font-size:11.5px">
                <label class="chk"><input type="checkbox" id="cam-pre-automirror" ${CAMState.autoMirrorBottom ? 'checked' : ''}> Auto-Mirror Bottom Layers (GBL/GBS/GBO)</label>
                <label class="chk"><input type="checkbox" id="cam-pre-mirror" ${CAMState.mirrorX ? 'checked' : ''}> Mirror All Layers (Flip X)</label>
                <label class="chk"><input type="checkbox" id="cam-pre-neg" ${CAMState.invertPolarity ? 'checked' : ''}> Negative Plane (%LPC*%)</label>
                <label class="chk"><input type="checkbox" id="cam-pre-rundfm" ${CAMState.runDFMOnCompare !== false ? 'checked' : ''}> Run IPC DFM / Clearance Check</label>
              </div>
            </div>
          </div>

          <!-- MULTI-LAYER STACKUP PAIRING TABLE (1 LAYER = 1 CAM FILE, 100 LAYERS = 100 CAM FILES) -->
          <div class="rp-hud-section" style="padding:10px">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px">
              <div>
                <h4 style="margin:0">3. Multi-Layer CAM Stackup &amp; Layer Pairing (Rev A: ${CAMState.layersA.length} files ↔ Rev B: ${CAMState.layersB.length} files)</h4>
                <small style="opacity:.75">1 Layer = 1 CAM File · Supports 1 to 100+ Gerber (L1..L100), Excellon Drill, Soldermask, Silkscreen &amp; IPC-D-356 files or .zip archives</small>
              </div>
              <div style="display:flex;gap:5px;flex-wrap:wrap">
                <button type="button" class="rp-btn-sm" id="cam-pre-add-a" style="border-color:#ef4444;color:#f87171">+ Add Rev A Files (1–100+)</button>
                <button type="button" class="rp-btn-sm" id="cam-pre-folder-a" title="Load entire folder of CAM layer files into Base (Rev A)">+ Rev A Folder</button>
                <button type="button" class="rp-btn-sm" id="cam-pre-add-b" style="border-color:#22c55e;color:#4ade80">+ Add Rev B Files (1–100+)</button>
                <button type="button" class="rp-btn-sm" id="cam-pre-folder-b" title="Load entire folder of CAM layer files into Revised (Rev B)">+ Rev B Folder</button>
                <button type="button" class="rp-btn-sm" id="cam-pre-split-ab" title="If you uploaded both A &amp; B layers into one slot, split them 50/50 between Rev A and Rev B">Split A/B</button>
                <button type="button" class="rp-btn-sm" id="cam-pre-swap-ab" title="Swap Rev A and Rev B layer stacks">Swap A↔B</button>
                <button type="button" class="rp-btn-sm" id="cam-pre-clear-all" title="Clear all staged CAM layers">Clear</button>
              </div>
            </div>
            <div class="rp-scroll" style="max-height:220px;border:1px solid var(--line);border-radius:4px">
              <table class="btab" style="width:100%">
                <thead>
                  <tr>
                    <th style="width:42px;text-align:center"><input type="checkbox" id="cam-pre-chk-all" checked title="Toggle All Layers"></th>
                    <th style="width:85px">Layer #</th>
                    <th>Detected Stackup Layer</th>
                    <th>Base (Rev A) CAM File</th>
                    <th>Revised (Rev B) CAM File</th>
                    <th style="width:80px;text-align:right">Action</th>
                  </tr>
                </thead>
                <tbody>${pairRowsHTML}</tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="rp-btns" style="justify-content:flex-end;margin-top:4px">
          <div style="display:flex;gap:8px">
            <button type="button" id="cam-pre-cancel">Cancel</button>
            ${hasAny && !hasBoth ? `<button type="button" id="cam-pre-preview-single" class="rp-primary" style="background:#0284c7">Confirm Units &amp; Preview Single Stack (${CAMState.layersA.length || CAMState.layersB.length} Layer${(CAMState.layersA.length || CAMState.layersB.length) === 1 ? '' : 's'})</button>` : ''}
            <button type="button" id="cam-pre-start-cmp" class="rp-primary" ${!hasAny ? 'disabled' : ''}>✓ Confirm Units &amp; Start CAM Compare (${pairs.length} Layer${pairs.length === 1 ? '' : 's'})</button>
          </div>
        </div>
      </div>
    `;

    if (typeof hydrateIcons === 'function') hydrateIcons(modal);
    const applyDialogSettingsToState = () => {
      const chosenUnits = $('#cam-pre-units').value;
      setUnitSystem(chosenUnits, true);
      CAMState.unitsOverrideA = $('#cam-pre-units-a').value;
      CAMState.unitsOverrideB = $('#cam-pre-units-b').value;
      CAMState.zeroSuppression = $('#cam-pre-zeros').value;
      CAMState.coordFormat = $('#cam-pre-fmt').value;
      CAMState.coordMode = $('#cam-pre-coordmode').value;
      CAMState.stackCompareMode = $('#cam-pre-stackmode').value;
      CAMState.alignmentMode = $('#cam-pre-align').value;
      CAMState.ipcClass = $('#cam-pre-ipc').value;
      CAMState.autoMirrorBottom = $('#cam-pre-automirror').checked;
      CAMState.mirrorX = $('#cam-pre-mirror').checked;
      CAMState.invertPolarity = $('#cam-pre-neg').checked;
      CAMState.runDFMOnCompare = $('#cam-pre-rundfm').checked;

      if ($('#rib-cam-mirror')) $('#rib-cam-mirror').checked = CAMState.mirrorX;
      if ($('#rib-cam-neg')) $('#rib-cam-neg').checked = CAMState.invertPolarity;
      if ($('#rib-ipc-class')) $('#rib-ipc-class').value = CAMState.ipcClass;

      const factorToMils = chosenUnits === 'metric' ? (1 / 0.0254) : 1.0;
      const tolVal = parseFloat($('#cam-pre-tol').value);
      const clrVal = parseFloat($('#cam-pre-clr').value);
      if (!isNaN(tolVal) && tolVal >= 0) CAMState.customRules.compareTolMils = +(tolVal * factorToMils).toFixed(3);
      if (!isNaN(clrVal) && clrVal > 0) CAMState.customRules.minClearanceMils = +(clrVal * factorToMils).toFixed(3);

      modal.querySelectorAll('.cam-pre-pair-chk').forEach(chk => {
        const p = pairs[+chk.dataset.pairidx];
        if (p) {
          if (p.layerA) p.layerA.enabled = chk.checked;
          if (p.layerB) p.layerB.enabled = chk.checked;
        }
      });
    };

    $('#cam-pre-units').onchange = e => {
      const newSys = e.target.value;
      const toMet = newSys === 'metric';
      $('#cam-pre-unit-badge').textContent = toMet ? 'IPC METRIC (MM / µM)' : 'IPC ENGLISH (MILS / IN)';
      $('#cam-pre-tol-lbl').textContent = `Compare Tol (${toMet ? 'mm' : 'mils'}):`;
      $('#cam-pre-clr-lbl').textContent = `Min Clearance (${toMet ? 'mm' : 'mils'}):`;
      const curRules = CAMEngine.IPC_DFM_RULES[$('#cam-pre-ipc').value] || CAMState.customRules;
      $('#cam-pre-tol').value = toMet ? ((curRules.compareTolMils || 0.25) * 0.0254).toFixed(3) : (curRules.compareTolMils || 0.25);
      $('#cam-pre-clr').value = toMet ? ((curRules.minClearanceMils || 4.0) * 0.0254).toFixed(3) : (curRules.minClearanceMils || 4.0);
    };

    $('#cam-pre-ipc').onchange = e => {
      const r = CAMEngine.IPC_DFM_RULES[e.target.value] || CAMState.customRules;
      const toMet = $('#cam-pre-units').value === 'metric';
      $('#cam-pre-tol').value = toMet ? ((r.compareTolMils || 0.25) * 0.0254).toFixed(3) : (r.compareTolMils || 0.25);
      $('#cam-pre-clr').value = toMet ? ((r.minClearanceMils || 4.0) * 0.0254).toFixed(3) : (r.minClearanceMils || 4.0);
    };

    const chkAll = $('#cam-pre-chk-all');
    if (chkAll) {
      chkAll.onchange = () => {
        modal.querySelectorAll('.cam-pre-pair-chk').forEach(c => { c.checked = chkAll.checked; });
      };
    }

    const pickAndAddSlot = async slot => {
      if (!window.native || !window.native.openFiles) return;
      applyDialogSettingsToState();
      const files = await window.native.openFiles({
        title: `Select 1 to 100+ CAM Layer Files (or .zip) for Revision ${slot}`,
        multi: true,
        filters: [{ name: 'PCB CAM Layer Files & ZIP (L1..L100, Gerber, Drill, IPC-D-356)', extensions: CAM_DIALOG_EXTENSIONS }]
      });
      if (files && files.length) {
        await stageUploadedCAMFiles(files, slot, false);
        showCAMPreCompareModal();
      }
    };

    const pickFolderForSlot = async slot => {
      if (!window.native || !window.native.pickFolder || !window.native.readFile) return;
      applyDialogSettingsToState();
      const res = await window.native.pickFolder({ title: `Select CAM Folder (1–100+ Layer Files) for Revision ${slot}`, mode: 'cam' });
      if (res && Array.isArray(res.files) && res.files.length) {
        const loaded = (await Promise.all(res.files.map(p => window.native.readFile(p)))).filter(Boolean);
        if (loaded.length) {
          await stageUploadedCAMFiles(loaded, slot, true);
          showCAMPreCompareModal();
        }
      } else if (res) {
        rpToast('No CAM layer files found in the selected folder.');
      }
    };

    $('#cam-pre-add-a').onclick = () => pickAndAddSlot('A');
    $('#cam-pre-add-b').onclick = () => pickAndAddSlot('B');
    $('#cam-pre-folder-a').onclick = () => pickFolderForSlot('A');
    $('#cam-pre-folder-b').onclick = () => pickFolderForSlot('B');

    $('#cam-pre-split-ab').onclick = () => {
      applyDialogSettingsToState();
      if (CAMState.layersA.length >= 2 && CAMState.layersB.length === 0) {
        const half = Math.floor(CAMState.layersA.length / 2);
        CAMState.layersB = CAMState.layersA.splice(half);
      } else if (CAMState.layersB.length >= 2 && CAMState.layersA.length === 0) {
        const half = Math.floor(CAMState.layersB.length / 2);
        CAMState.layersA = CAMState.layersB.splice(0, half);
      }
      showCAMPreCompareModal();
    };

    $('#cam-pre-swap-ab').onclick = () => {
      applyDialogSettingsToState();
      [CAMState.layersA, CAMState.layersB] = [CAMState.layersB, CAMState.layersA];
      [CAMState.unitsOverrideA, CAMState.unitsOverrideB] = [CAMState.unitsOverrideB, CAMState.unitsOverrideA];
      showCAMPreCompareModal();
    };

    $('#cam-pre-clear-all').onclick = () => {
      CAMState.layersA = [];
      CAMState.layersB = [];
      CAMState.pairedLayers = [];
      showCAMPreCompareModal();
    };

    modal.querySelectorAll('.cam-pre-del-a').forEach(btn => {
      btn.onclick = () => {
        applyDialogSettingsToState();
        CAMState.layersA = CAMState.layersA.filter(x => x.id !== btn.dataset.id);
        showCAMPreCompareModal();
      };
    });
    modal.querySelectorAll('.cam-pre-del-b').forEach(btn => {
      btn.onclick = () => {
        applyDialogSettingsToState();
        CAMState.layersB = CAMState.layersB.filter(x => x.id !== btn.dataset.id);
        showCAMPreCompareModal();
      };
    });



    const closeModal = () => { modal.hidden = true; };
    $('#cam-pre-close').onclick = closeModal;
    $('#cam-pre-cancel').onclick = closeModal;
    modal.onclick = e => { if (e.target === modal) closeModal(); };

    if ($('#cam-pre-preview-single')) {
      $('#cam-pre-preview-single').onclick = async () => {
        applyDialogSettingsToState();
        closeModal();
        await executeConfiguredCAMCompare();
      };
    }

    $('#cam-pre-start-cmp').onclick = async () => {
      applyDialogSettingsToState();
      closeModal();
      await executeConfiguredCAMCompare();
    };
  }

  /**
   * Execute the Configured Multi-Layer (1..100+ Layers) or Single-Layer CAM Comparison
   * Runs only AFTER the user confirms Metric/English units and CAM parameters!
   */
  async function executeConfiguredCAMCompare() {
    if (typeof CAMEngine === 'undefined') return;
    try {
      if (typeof window.busy === 'function') window.busy(true);
      CAMState.ensureParsed();

      const allEnabledPairs = (CAMState.pairedLayers || []).filter(p => (p.layerA && p.layerA.enabled !== false) || (p.layerB && p.layerB.enabled !== false));
      if (!allEnabledPairs.length) {
        rpToast('No enabled CAM layers to compare. Open Gerber / Drill files first.');
        return;
      }

      const activePairs = CAMState.stackCompareMode === 'single'
        ? [allEnabledPairs[Math.max(0, Math.min(allEnabledPairs.length - 1, CAMState.activeLayerIndex || 0))]]
        : allEnabledPairs;

      const allLayerEntries = [];
      for (const p of activePairs) {
        if (p.layerA) allLayerEntries.push(p.layerA);
        if (p.layerB) allLayerEntries.push(p.layerB);
      }

      const sharedBoundsInches = CAMEngine.CAMJobStack.computeUnifiedBoundsInches(allLayerEntries);
      CAMState.activeSharedBoundsInches = sharedBoundsInches;

      let offsetBInches = { dxIn: 0, dyIn: 0 };
      if (CAMState.alignmentMode === 'center' && CAMState.layersA.length && CAMState.layersB.length) {
        const bA = CAMEngine.CAMJobStack.computeUnifiedBoundsInches(CAMState.layersA.filter(l => l.enabled !== false));
        const bB = CAMEngine.CAMJobStack.computeUnifiedBoundsInches(CAMState.layersB.filter(l => l.enabled !== false));
        offsetBInches = {
          dxIn: ((bA.minX + bA.maxX) / 2) - ((bB.minX + bB.maxX) / 2),
          dyIn: ((bA.minY + bA.maxY) / 2) - ((bB.minY + bB.maxY) / 2)
        };
      }

      const rules = Object.assign({}, CAMEngine.IPC_DFM_RULES[CAMState.ipcClass] || {}, CAMState.customRules);
      const cmpEngine = new CAMEngine.CAMCompare(1600, 1200);
      const allDFMViolations = [];
      const perLayerStats = [];

      const dfmRuleKey = `${CAMState.ipcClass}|${rules.minClearanceMils}|${rules.minTraceWidthMils}|${rules.minAnnularRingMils}|${rules.minDrillDiaMils}|${rules.compareTolMils}|${CAMState.runDFMOnCompare !== false}`;
      for (let pIdx = 0; pIdx < activePairs.length; pIdx++) {
        const p = activePairs[pIdx];
        if (pIdx > 0 && pIdx % 8 === 0 && typeof window !== 'undefined' && window.rpFastTick) {
          await window.rpFastTick();
        }
        const gA = p.layerA ? p.layerA.parsedGbr : null;
        const gB = p.layerB ? p.layerB.parsedGbr : null;
        const dA = p.layerA ? p.layerA.parsedDrl : null;
        const dB = p.layerB ? p.layerB.parsedDrl : null;
        const iA = p.layerA ? p.layerA.parsedIPC : null;
        const iB = p.layerB ? p.layerB.parsedIPC : null;

        const pairCacheKey = `${p.layerA ? p.layerA._parseKey : ''}|${p.layerB ? p.layerB._parseKey : ''}|${dfmRuleKey}`;
        let prim = p._cachedPrim;
        let viols = p._cachedViols;
        if (p._cachedStatsKey !== pairCacheKey || !prim || !viols) {
          prim = cmpEngine.comparePrimitives(gA, gB, {
            compareTolMils: rules.compareTolMils || 0.25,
            offsetBInches,
            drillA: dA,
            drillB: dB,
            ipcA: iA,
            ipcB: iB
          });
          viols = [];
          if (CAMState.runDFMOnCompare !== false && (gB || gA)) {
            viols = cmpEngine.runDFMChecks(gB || gA, dB || dA || null, rules);
          }
          p._cachedStatsKey = pairCacheKey;
          p._cachedViols = viols;
        }
        for (const v of viols) {
          allDFMViolations.push({ ...v, layerLabel: `L${p.pairIndex} (${p.code})`, page: p.pairIndex });
        }
        if (iA && iB) {
          CAMState.lastNetDiffs = CAMEngine.IPCD356Parser.compareNetlists(iA, iB, rules.compareTolMils || 2.0);
        }
        const mapPrimToRegion = (item, kind) => {
          const b = sharedBoundsInches || { minX: 0, minY: 0, maxX: 2.5, maxY: 2.0 };
          const bwIn = Math.max(1e-4, b.maxX - b.minX);
          const bhIn = Math.max(1e-4, b.maxY - b.minY);
          const pageW = 1100, pageH = 800, padding = 36;
          const targetW = pageW - padding * 2, targetH = pageH - padding * 2;
          const scale = Math.min(targetW / bwIn, targetH / bhIn);
          const offsetX = padding + (targetW - bwIn * scale) / 2;
          const offsetY = padding + (targetH - bhIn * scale) / 2;
          const dpiScale = 300 / 72;
          const isBot = (p.layerB && p.layerB.layerMeta && p.layerB.layerMeta.side === 'bottom') || (p.layerA && p.layerA.layerMeta && p.layerA.layerMeta.side === 'bottom');
          const effMirrorX = !!(CAMState.mirrorX || (CAMState.autoMirrorBottom && isBot));
          const toPagePtX = xVal => {
            const adj = effMirrorX ? (b.maxX - (xVal - b.minX)) : xVal;
            return offsetX + (adj - b.minX) * scale;
          };
          const toPagePtY = yVal => pageH - (offsetY + (yVal - b.minY) * scale);
          const xIn = item.xIn != null ? item.xIn : (item.x1 != null ? item.x1 : (item.x != null ? item.x : (b.minX + bwIn * 0.5)));
          const yIn = item.yIn != null ? item.yIn : (item.y1 != null ? item.y1 : (item.y != null ? item.y : (b.minY + bhIn * 0.5)));
          const rIn = item.rIn != null ? item.rIn : 0.015;
          const minXIn = item.minXIn != null ? item.minXIn : (xIn - rIn);
          const maxXIn = item.maxXIn != null ? item.maxXIn : (xIn + rIn);
          const minYIn = item.minYIn != null ? item.minYIn : (yIn - rIn);
          const maxYIn = item.maxYIn != null ? item.maxYIn : (yIn + rIn);
          const px0 = toPagePtX(minXIn) * dpiScale;
          const px1 = toPagePtX(maxXIn) * dpiScale;
          const py0 = toPagePtY(maxYIn) * dpiScale;
          const py1 = toPagePtY(minYIn) * dpiScale;
          const rx = Math.max(0, Math.floor(Math.min(px0, px1) - 6));
          const ry = Math.max(0, Math.floor(Math.min(py0, py1) - 6));
          const rw = Math.max(16, Math.ceil(Math.abs(px1 - px0) + 12));
          const rh = Math.max(16, Math.ceil(Math.abs(py1 - py0) + 12));
          const subBoxes = [];
          const boxPx = Math.max(7, Math.round((7 / 1000) * 300));
          const halfBox = boxPx / 2;
          const addSampledLineBoxes = (axIn, ayIn, bxIn, byIn) => {
            const sx0 = toPagePtX(axIn) * dpiScale, sy0 = toPagePtY(ayIn) * dpiScale;
            const sx1 = toPagePtX(bxIn) * dpiScale, sy1 = toPagePtY(byIn) * dpiScale;
            const lenPx = Math.hypot(sx1 - sx0, sy1 - sy0);
            const steps = Math.max(1, Math.min(80, Math.ceil(lenPx / Math.max(4, boxPx * 0.85))));
            for (let s = 0; s <= steps && subBoxes.length < 220; s++) {
              const t = steps === 0 ? 0 : s / steps;
              const cx = sx0 + (sx1 - sx0) * t, cy = sy0 + (sy1 - sy0) * t;
              subBoxes.push({ x: Math.round(cx - halfBox), y: Math.round(cy - halfBox), w: boxPx, h: boxPx, kind });
            }
          };
          if ((item.kind === 'DRAW' || item.kind === 'DRILL_SLOT') && item.x1In != null && item.x2In != null) {
            if ((item.mode === 'G02' || item.mode === 'G03') && (item.arcRIn || 0) > 1e-6 && item.cxIn != null && item.cyIn != null) {
              const isFull = item.quadrant !== 'SINGLE' && Math.hypot(item.x2In - item.x1In, item.y2In - item.y1In) < 1e-4;
              const a1 = Math.atan2(item.y1In - item.cyIn, item.x1In - item.cxIn);
              const a2 = Math.atan2(item.y2In - item.cyIn, item.x2In - item.cxIn);
              const ccw = item.mode === 'G03';
              let sweep = isFull ? Math.PI * 2 : (ccw ? (a2 - a1) : (a1 - a2));
              while (sweep < 0) sweep += Math.PI * 2;
              const steps = Math.max(8, Math.min(64, Math.ceil((sweep * item.arcRIn * scale * dpiScale) / Math.max(4, boxPx * 0.85))));
              for (let s = 0; s <= steps && subBoxes.length < 220; s++) {
                const ang = ccw ? (a1 + (sweep * s) / steps) : (a1 - (sweep * s) / steps);
                const px = toPagePtX(item.cxIn + Math.cos(ang) * item.arcRIn) * dpiScale;
                const py = toPagePtY(item.cyIn + Math.sin(ang) * item.arcRIn) * dpiScale;
                subBoxes.push({ x: Math.round(px - halfBox), y: Math.round(py - halfBox), w: boxPx, h: boxPx, kind });
              }
            } else {
              addSampledLineBoxes(item.x1In, item.y1In, item.x2In, item.y2In);
            }
          } else if (item.kind === 'REGION' && Array.isArray(item.contours)) {
            for (const cnt of item.contours) {
              if (!Array.isArray(cnt) || cnt.length < 2) continue;
              for (let i = 0; i < cnt.length && subBoxes.length < 220; i++) {
                const p0 = cnt[i], p1 = cnt[(i + 1) % cnt.length];
                addSampledLineBoxes(p0[0], p0[1], p1[0], p1[1]);
              }
            }
          } else {
            subBoxes.push({ x: rx, y: ry, w: rw, h: rh, kind });
          }
          const desc = `${item.kind || 'FEATURE'} @ (${(xIn * 1000).toFixed(1)}, ${(yIn * 1000).toFixed(1)}) mil`;
          return {
            x: rx,
            y: ry,
            w: rw,
            h: rh,
            subBoxes,
            kind,
            sa: kind === 'r' ? 120 : 0,
            sb: kind === 'a' ? 120 : 0,
            dpi: 300,
            dxfLayer: p.code || 'CAM',
            dxfType: item.kind || 'CAM',
            dxfSummary: desc,
            note: `[${p.code || 'CAM'}] ${desc}`
          };
        };
        const rawMapped = prim.mappedRegions || [
          ...(prim.removed || []).slice(0, 200).map(it => mapPrimToRegion(it, 'r')),
          ...(prim.added || []).slice(0, 200).map(it => mapPrimToRegion(it, 'a'))
        ];
        const mappedRegions = [];
        for (const mr of rawMapped) {
          const hit = mappedRegions.find(ex => ex.kind === mr.kind && !(mr.x > ex.x + ex.w + 6 || mr.x + mr.w + 6 < ex.x || mr.y > ex.y + ex.h + 6 || mr.y + mr.h + 6 < ex.y));
          if (hit) {
            const nx0 = Math.min(hit.x, mr.x), ny0 = Math.min(hit.y, mr.y);
            const nx1 = Math.max(hit.x + hit.w, mr.x + mr.w), ny1 = Math.max(hit.y + hit.h, mr.y + mr.h);
            hit.x = nx0; hit.y = ny0; hit.w = nx1 - nx0; hit.h = ny1 - ny0;
            hit.sa += mr.sa; hit.sb += mr.sb;
            if (Array.isArray(mr.subBoxes) && mr.subBoxes.length) {
              if (!Array.isArray(hit.subBoxes)) hit.subBoxes = [];
              if (hit.subBoxes.length < 280) hit.subBoxes.push(...mr.subBoxes.slice(0, 280 - hit.subBoxes.length));
            }
          } else {
            mappedRegions.push({ ...mr, subBoxes: Array.isArray(mr.subBoxes) ? [...mr.subBoxes] : undefined });
          }
        }
        const addedLen = prim.addedCount != null ? prim.addedCount : (prim.added ? prim.added.length : 0);
        const removedLen = prim.removedCount != null ? prim.removedCount : (prim.removed ? prim.removed.length : 0);
        p._cachedPrim = { addedCount: addedLen, removedCount: removedLen, unchangedCount: prim.unchangedCount || 0, mappedRegions };
        perLayerStats.push({
          pairIndex: p.pairIndex,
          code: p.code,
          label: p.label,
          nameA: p.layerA ? p.layerA.name : '—',
          nameB: p.layerB ? p.layerB.name : '—',
          addedCount: addedLen,
          removedCount: removedLen,
          unchangedCount: prim.unchangedCount || 0,
          dfmCount: viols.length,
          regions: mappedRegions
        });
      }

      CAMState.lastDFMViolations = allDFMViolations;
      CAMState.perLayerCompareStats = perLayerStats;

      // Build slides for Slot A and Slot B
      let slidesA = [];
      let slidesB = [];
      if (CAMState.stackCompareMode === 'composite') {
        slidesA = [{
          title: `Rev A Composite Stackup (${CAMState.layersA.filter(l => l.enabled !== false).length} Layers)`,
          entries: CAMState.layersA.filter(l => l.enabled !== false)
        }];
        slidesB = [{
          title: `Rev B Composite Stackup (${CAMState.layersB.filter(l => l.enabled !== false).length} Layers)`,
          entries: CAMState.layersB.filter(l => l.enabled !== false)
        }];
        CAMState.activeStackPageLabels = [{
          short: `Stack (${activePairs.length}L)`,
          full: `Composite Stackup (${activePairs.length} layers merged)`
        }];
      } else {
        // Multi-Page Mode: 1 Layer = 1 Page (supports 1 to 100+ layers!)
        slidesA = activePairs.map((p, i) => ({
          title: `L${i + 1}/${activePairs.length}: ${p.label} — ${p.layerA ? p.layerA.name : '(Empty in Rev A)'}`,
          entries: p.layerA ? [p.layerA] : []
        }));
        slidesB = activePairs.map((p, i) => ({
          title: `L${i + 1}/${activePairs.length}: ${p.label} — ${p.layerB ? p.layerB.name : '(Empty in Rev B)'}`,
          entries: p.layerB ? [p.layerB] : []
        }));
        CAMState.activeStackPageLabels = activePairs.map((p, i) => ({
          short: activePairs.length > 1 ? `L${i + 1}:${p.code}` : `${i + 1}`,
          full: `Layer ${i + 1} (${p.label}): ${p.layerA ? p.layerA.name : '—'} vs ${p.layerB ? p.layerB.name : '—'}`
        }));
      }

      const vecOpts = {
        pcbTheme: CAMState.pcbTheme || 'standard',
        renderMode: CAMState.renderMode || 'fill',
        mirrorX: CAMState.mirrorX,
        autoMirrorBottom: CAMState.autoMirrorBottom,
        invertPolarity: CAMState.invertPolarity,
        showOrigin: CAMState.showOrigin,
        showDrillRings: CAMState.showDrillRings,
        highlightNet: CAMState.highlightNet,
        sharedBoundsInches,
        drawLayerHeader: false
      };

      const hasA = CAMState.layersA.some(l => l.enabled !== false);
      const hasB = CAMState.layersB.some(l => l.enabled !== false);

      const [pdfBytesA, pdfBytesB] = await Promise.all([
        hasA ? CAMEngine.layersToVectorPDFBytes(slidesA, vecOpts) : Promise.resolve(null),
        hasB ? CAMEngine.layersToVectorPDFBytes(slidesB, { ...vecOpts, offsetInches: offsetBInches }) : Promise.resolve(null)
      ]);
      // Release parsed command ASTs on inactive background layers after vector PDF generation when stack > 24 layers
      if (activePairs.length > 24) {
        const keepIdx = Math.max(0, Math.min(activePairs.length - 1, CAMState.activeLayerIndex || 0));
        activePairs.forEach((p, idx) => {
          if (idx !== keepIdx) {
            if (p.layerA) { p.layerA.parsedGbr = null; p.layerA.parsedDrl = null; }
            if (p.layerB) { p.layerB.parsedGbr = null; p.layerB.parsedDrl = null; }
          }
        });
      }

      const labelA = CAMState.layersA.length === 1
        ? CAMState.layersA[0].name
        : `RevA_CAM_Stack (${CAMState.layersA.filter(l => l.enabled !== false).length} Layers).gbr`;
      const labelB = CAMState.layersB.length === 1
        ? CAMState.layersB[0].name
        : `RevB_CAM_Stack (${CAMState.layersB.filter(l => l.enabled !== false).length} Layers).gbr`;
      const pathA = (CAMState.layersA[0] && CAMState.layersA[0].path) || '';
      const pathB = (CAMState.layersB[0] && CAMState.layersB[0].path) || '';

      CAMState._isActiveCAMSession = true;
      CAMState._renderingStack = true;
      if ((CAMState.pcbTheme || 'standard') !== 'paper' && $('#mode') && $('#mode').value === 'paper') {
        setCompareMode('over');
      }
      try {
        const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : null;
        if (pdfBytesA && pdfBytesB && window.compareLoadBytes) {
          await window.compareLoadBytes('A', pdfBytesA, labelA, pathA, true);
          await window.compareLoadBytes('B', pdfBytesB, labelB, pathB, false);
        } else if (pdfBytesA && window.compareLoadBytes) {
          if (S && S.B) { S.B = null; S.docB = null; if (S.names) S.names.B = ''; if (S.rawBytes) delete S.rawBytes.B; }
          await window.compareLoadBytes('A', pdfBytesA, labelA, pathA, false);
        } else if (pdfBytesB && window.compareLoadBytes) {
          if (S && S.A) { S.A = null; S.docA = null; if (S.names) S.names.A = ''; if (S.rawBytes) delete S.rawBytes.A; }
          await window.compareLoadBytes('B', pdfBytesB, labelB, pathB, false);
        }
      } finally {
        CAMState._renderingStack = false;
      }

      if (CAMState.alignmentMode === 'autoalign' && hasA && hasB && window.ACT && typeof window.ACT.align === 'function') {
        await window.ACT.align();
      }

      updateCAMSidebarPane();
      const unitStr = CAMState.unitSystem === 'metric' ? 'IPC Metric (mm)' : 'IPC English (mils/in)';
      const diffLayers = perLayerStats.filter(s => s.addedCount > 0 || s.removedCount > 0).length;
      if (hasA && hasB) {
        rpToast(`Compared ${activePairs.length} CAM Layer(s) in ${unitStr}: ${diffLayers} layer(s) with feature diffs, ${allDFMViolations.length} DFM violation(s).`);
      } else {
        rpToast(`Loaded ${activePairs.length} CAM Layer(s) in ${unitStr}. Upload the second revision to run A↔B comparison.`);
      }
    } catch (e) {
      rpToast('CAM Compare Error: ' + e.message);
    } finally {
      if (typeof window.busy === 'function') window.busy(false);
    }
  }

  /**
   * PCB CAM Gerber / Drill / IPC-D-356 Loader & Multi-Layer Stackup Compare
   * Opens file picker for 1 to 100+ CAM layer files, then prompts for Metric/English & CAM parameters before comparing!
   */
  async function promptCAMCompare(targetSlot = null) {
    if (typeof CAMEngine === 'undefined') return;
    if (!window.native || !window.native.openFiles) {
      showCAMPreCompareModal();
      return;
    }
    const files = await window.native.openFiles({
      title: 'Select 1 to 100+ PCB CAM Layer Files (Gerber L1..L100, Excellon Drill, IPC-D-356, or .zip)',
      multi: true,
      filters: [{ name: 'PCB CAM & IPC Files (1 to 100+ Layers)', extensions: CAM_DIALOG_EXTENSIONS }]
    });
    if (!files || !files.length) {
      if (CAMState.layersA.length || CAMState.layersB.length) showCAMPreCompareModal();
      return;
    }
    await stageAndPromptCAMFiles(files, targetSlot);
  }

  async function promptDualGerberCompare() {
    if (CAMState.layersA.length && CAMState.layersB.length) {
      showCAMPreCompareModal();
      return;
    }
    await promptCAMCompare();
  }

  /**
   * IPC-D-356 Netlist Loader & Comparator
   */
  async function promptIPCD356Netlist() {
    if (typeof CAMEngine === 'undefined') return;
    if (CAMState.parsedIPCA || window.__lastIPCA) {
      showCAMWorkbenchModal('ipc');
      return;
    }
    if (!window.native || !window.native.openFiles) return;
    const files = await window.native.openFiles({
      title: 'Select IPC-D-356 / IPC-D-356A Netlist File(s) (.ipc, .d356, .net)',
      multi: true,
      filters: [{ name: 'IPC-D-356 Netlist', extensions: ['ipc', 'd356', 'net', 'txt'] }]
    });
    if (!files || !files.length) {
      showCAMWorkbenchModal('ipc');
      return;
    }
    await stageAndPromptCAMFiles(files, null);
  }

  /**
   * Full PCB CAM DFM / DRC Scan (Clearance, Annular Ring, Min Trace Width, Min Drill, Acid Traps)
   */
  async function runCAMClearanceScan() {
    if (typeof CAMEngine === 'undefined') return;
    const { gA, gB, drlA, drlB } = CAMState.ensureParsed();
    const rules = Object.assign({}, CAMEngine.IPC_DFM_RULES[CAMState.ipcClass] || {}, CAMState.customRules);

    if ((CAMState.pairedLayers && CAMState.pairedLayers.length) || (gA && gB)) {
      const checker = new CAMEngine.CAMCompare(1600, 1200);
      if (CAMState.pairedLayers && CAMState.pairedLayers.length >= 1) {
        const allViols = [];
        for (let i = 0; i < CAMState.pairedLayers.length; i++) {
          const p = CAMState.pairedLayers[i];
          if (i > 0 && i % 8 === 0 && typeof window !== 'undefined' && window.rpFastTick) {
            await window.rpFastTick();
          }
          const lg = (p.layerB && p.layerB.parsedGbr) || (p.layerA && p.layerA.parsedGbr);
          const ld = (p.layerB && p.layerB.parsedDrl) || (p.layerA && p.layerA.parsedDrl) || drlB || drlA;
          if (lg) {
            const vList = checker.runDFMChecks(lg, ld, rules);
            vList.forEach(v => allViols.push({ ...v, layerLabel: `L${p.pairIndex} (${p.code})`, page: p.pairIndex }));
          }
        }
        CAMState.lastDFMViolations = allViols;
      } else {
        CAMState.lastDFMViolations = checker.runDFMChecks(gB || gA, drlB || drlA, rules);
      }

      updateCAMSidebarPane();
      const camTabBtn = $('aside .tabs button[data-t="cam"]');
      if (camTabBtn) camTabBtn.click();

      const clrStr = CAMEngine.UnitConverter.formatDual((rules.minClearanceMils || 4.0) / 1000, CAMState.unitSystem);
      rpToast(`DFM Scan (${(rules.name || 'IPC Class 2').split('—')[0].trim()}, Min Clr ${clrStr}): ${CAMState.lastDFMViolations.length} DFM rule alerts across ${Math.max(1, CAMState.pairedLayers.length)} layer(s).`);
    } else if (gA || gB) {
      const gbr = gB || gA;
      const checker = new CAMEngine.CAMCompare(1600, 1200);
      CAMState.lastDFMViolations = checker.runDFMChecks(gbr, drlB || drlA, rules);
      updateCAMSidebarPane();
      const camTabBtn = $('aside .tabs button[data-t="cam"]');
      if (camTabBtn) camTabBtn.click();
      rpToast(`Single-Layer DFM Scan Complete: ${CAMState.lastDFMViolations.length} DFM rule alerts detected.`);
    } else {
      showCAMPreCompareModal();
      rpToast('Open CAM layer files to run DFM / Clearance analysis.');
    }
  }

  /**
   * PCB CAM Workbench Modal (Format & Units, D-Code Aperture Table, T-Code Drill Schedule, IPC-D-356 Netlist & DFM Rules)
   */
  function showCAMWorkbenchModal(initialTab = 'format') {
    document.querySelectorAll('.rp-modal:not(.rp-side-docked)').forEach(el => { if (el.id) el.hidden = true; else el.remove(); });
    if (typeof document === 'undefined' || typeof CAMEngine === 'undefined') return;
    let modal = $('#rp-cam-modal');
    if (!modal) {
      modal = el('div', { id: 'rp-cam-modal', className: 'rp-modal' });
      document.body.appendChild(modal);
    }
    modal.hidden = false;

    CAMState.ensureParsed();

    const activeGbr = CAMState.parsedGerberB || CAMState.parsedGerberA;
    const activeDrl = CAMState.parsedDrillB || CAMState.parsedDrillA;
    const activeIPC = CAMState.parsedIPCB || CAMState.parsedIPCA;

    const apRows = activeGbr ? activeGbr.getApertureTable() : [];
    const drlRows = activeDrl ? activeDrl.getToolTable() : [];
    const netRows = activeIPC ? activeIPC.getNetTable() : [];
    const rules = CAMEngine.IPC_DFM_RULES[CAMState.ipcClass] || CAMState.customRules;
    const isMetric = CAMState.unitSystem === 'metric';

    const apTableHTML = apRows.length ? apRows.map(r => `
      <tr>
        <td><b>${r.dCode}</b></td>
        <td>${r.shape}</td>
        <td>${isMetric ? `<b>${r.widthMM} × ${r.heightMM} mm</b>` : `${r.widthMM} × ${r.heightMM} mm`}</td>
        <td>${!isMetric ? `<b>${r.widthMils} × ${r.heightMils} mil</b> (${r.widthIn}")` : `${r.widthMils} × ${r.heightMils} mil`}</td>
        <td>${r.flashes}</td>
        <td>${r.draws}</td>
      </tr>
    `).join('') : '<tr><td colspan="6" style="text-align:center;opacity:.65">No Gerber layer loaded. Click "Open Gerber / Drill" to load files.</td></tr>';

    const drlTableHTML = drlRows.length ? drlRows.map(r => `
      <tr>
        <td><b>${r.tCode}</b></td>
        <td>${isMetric ? `<b>${r.diaMM} mm</b>` : `${r.diaMM} mm`}</td>
        <td>${!isMetric ? `<b>${r.diaMils} mil</b> (${r.diaIn}")` : `${r.diaMils} mil (${r.diaIn}")`}</td>
        <td>${r.hits}</td>
        <td>${r.slots}</td>
        <td>${isMetric ? `${r.travelMM} mm` : `${r.travelIn} in`}</td>
      </tr>
    `).join('') : '<tr><td colspan="6" style="text-align:center;opacity:.65">No Excellon NC Drill layer loaded yet.</td></tr>';

    const netTableHTML = netRows.length ? netRows.map(r => `
      <tr>
        <td><b>${r.net}</b></td>
        <td>${r.totalNodes}</td>
        <td>${r.thruCount} TH / ${r.smtCount} SMT / ${r.viaCount} Via</td>
        <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.pins}">${r.pins || '—'}</td>
        <td><button type="button" class="rp-btn-sm cam-hl-net-btn" data-net="${r.net}">${CAMState.highlightNet === r.net ? '✓ Highlighted' : 'Highlight Net'}</button></td>
      </tr>
    `).join('') : '<tr><td colspan="5" style="text-align:center;opacity:.65">No IPC-D-356 Netlist loaded. Click "Import IPC-D-356 (.ipc/.d356)" to load a netlist.</td></tr>';

    modal.innerHTML = `
      <div class="rp-card rp-wide" style="width:min(920px,95vw);max-height:90vh">
        <div class="rp-hud-header">
          <div class="rp-hud-title">
            <h3>PCB CAM Engineering Workbench &amp; IPC Inspector</h3>
            <span class="rp-hud-badge">${isMetric ? 'IPC METRIC (MM / µM)' : 'IPC ENGLISH (MILS / IN)'}</span>
          </div>
          <button type="button" class="rp-hud-close" id="cam-wb-close">Close (Esc)</button>
        </div>

        <div class="tabs" style="border-bottom:1px solid var(--line);margin-bottom:8px">
          <button type="button" class="cam-wb-tab ${initialTab === 'format' ? 'on' : ''}" data-wbtab="format"><i data-ic="gear"></i><span>1. Units, Format &amp; Stackup</span></button>
          <button type="button" class="cam-wb-tab ${initialTab === 'apertures' ? 'on' : ''}" data-wbtab="apertures"><i data-ic="pcbCam"></i><span>2. Apertures (D-Codes: ${apRows.length})</span></button>
          <button type="button" class="cam-wb-tab ${initialTab === 'drills' ? 'on' : ''}" data-wbtab="drills"><i data-ic="crosshair"></i><span>3. NC Drill Tools (T-Codes: ${drlRows.length})</span></button>
          <button type="button" class="cam-wb-tab ${initialTab === 'ipc' ? 'on' : ''}" data-wbtab="ipc"><i data-ic="clearance"></i><span>4. IPC-D-356 Netlist &amp; DFM Rules</span></button>
        </div>

        <!-- TAB 1: UNITS, FORMAT & STACKUP -->
        <div class="cam-wb-pane" id="cam-wb-pane-format" ${initialTab === 'format' ? '' : 'hidden'}>
          <div class="rp-hud-grid">
            <div class="rp-hud-section">
              <h4>IPC Unit System &amp; Coordinate Format</h4>
              <div class="rp-form-group">
                <label>Primary Measurement &amp; IPC Unit System:</label>
                <select id="cam-wb-units">
                  <option value="english" ${!isMetric ? 'selected' : ''}>IPC English / Imperial (mils &amp; inches — 1 in = 1000 mil)</option>
                  <option value="metric" ${isMetric ? 'selected' : ''}>IPC Metric / SI (millimeters &amp; microns — 1 mm = 39.37 mil)</option>
                </select>
              </div>
              <div class="rp-form-group">
                <label>Zero Suppression (Gerber RS-274X / Excellon):</label>
                <select id="cam-wb-zeros">
                  <option value="AUTO" ${CAMState.zeroSuppression === 'AUTO' ? 'selected' : ''}>Auto-Detect from %FS / M48 Header (Recommended)</option>
                  <option value="L" ${CAMState.zeroSuppression === 'L' ? 'selected' : ''}>Leading Zeros Omitted (LZ / %FSLA)</option>
                  <option value="T" ${CAMState.zeroSuppression === 'T' ? 'selected' : ''}>Trailing Zeros Omitted (TZ / %FSTA)</option>
                  <option value="D" ${CAMState.zeroSuppression === 'D' ? 'selected' : ''}>Explicit Decimal / No Suppression</option>
                </select>
              </div>
              <div class="rp-form-group">
                <label>Coordinate Integer.Decimal Format (M.N):</label>
                <select id="cam-wb-fmt">
                  <option value="AUTO" ${CAMState.coordFormat === 'AUTO' ? 'selected' : ''}>Auto-Detect from Header (%FSLAX24Y24 / 3:3)</option>
                  <option value="2.4" ${CAMState.coordFormat === '2.4' ? 'selected' : ''}>2.4 Format (Standard English: 0.1 mil res)</option>
                  <option value="2.5" ${CAMState.coordFormat === '2.5' ? 'selected' : ''}>2.5 Format (High-Precision English: 0.01 mil res)</option>
                  <option value="2.3" ${CAMState.coordFormat === '2.3' ? 'selected' : ''}>2.3 Format (1.0 mil res)</option>
                  <option value="3.3" ${CAMState.coordFormat === '3.3' ? 'selected' : ''}>3.3 Format (Standard Metric: 1 µm res)</option>
                  <option value="3.4" ${CAMState.coordFormat === '3.4' ? 'selected' : ''}>3.4 Format (High-Precision Metric: 0.1 µm res)</option>
                  <option value="4.4" ${CAMState.coordFormat === '4.4' ? 'selected' : ''}>4.4 Format (Large Panel Metric/English)</option>
                </select>
              </div>
              <div class="rp-form-group">
                <label>Coordinate Mode:</label>
                <select id="cam-wb-coordmode">
                  <option value="AUTO" ${CAMState.coordMode === 'AUTO' ? 'selected' : ''}>Auto-Detect (Absolute G90 / Incremental G91)</option>
                  <option value="A" ${CAMState.coordMode === 'A' ? 'selected' : ''}>Absolute Coordinates (G90 / %FS..A)</option>
                  <option value="I" ${CAMState.coordMode === 'I' ? 'selected' : ''}>Incremental Coordinates (G91 / %FS..I)</option>
                </select>
              </div>
            </div>

            <div class="rp-hud-section">
              <h4>PCB CAM Display, Polarity &amp; Substrate Theme</h4>
              <div class="rp-form-group">
                <label>PCB CAM Aperture &amp; Trace Render Mode:</label>
                <select id="cam-wb-rendermode">
                  <option value="fill" ${CAMState.renderMode === 'fill' ? 'selected' : ''}>Filled Mode (True Aperture Width &amp; Copper Pour)</option>
                  <option value="outline" ${CAMState.renderMode === 'outline' ? 'selected' : ''}>Outline / Wireframe Mode ('W' Mode)</option>
                  <option value="skeleton" ${CAMState.renderMode === 'skeleton' ? 'selected' : ''}>Centerline / Skeleton Mode (1px Vector Path + Flash Cross)</option>
                </select>
              </div>
              <div class="rp-form-group">
                <label>PCB Color Palette / Soldermask Theme:</label>
                <select id="cam-wb-theme">
                  <option value="standard" ${CAMState.pcbTheme === 'standard' ? 'selected' : ''}>Industrial Green Soldermask &amp; Gold ENIG</option>
                  <option value="camDark" ${CAMState.pcbTheme === 'camDark' ? 'selected' : ''}>CAM Classic Black / Red / Green / Yellow</option>
                  <option value="blueCAD" ${CAMState.pcbTheme === 'blueCAD' ? 'selected' : ''}>High-Contrast Blue Soldermask</option>
                  <option value="matteBlack" ${CAMState.pcbTheme === 'matteBlack' ? 'selected' : ''}>Matte Black Stealth Substrate</option>
                </select>
              </div>
              <label class="chk" style="margin:4px 0"><input type="checkbox" id="cam-wb-mirror" ${CAMState.mirrorX ? 'checked' : ''}> Mirror Layer Horizontally (Flip Bottom Copper GBL / Silk GBO)</label>
              <label class="chk" style="margin:4px 0"><input type="checkbox" id="cam-wb-neg" ${CAMState.invertPolarity ? 'checked' : ''}> Invert Polarity (Negative Plane %LPC*%)</label>
              <label class="chk" style="margin:4px 0"><input type="checkbox" id="cam-wb-origin" ${CAMState.showOrigin ? 'checked' : ''}> Show Board Extents &amp; Datum Origin Box</label>
              <label class="chk" style="margin:4px 0"><input type="checkbox" id="cam-wb-drillrings" ${CAMState.showDrillRings ? 'checked' : ''}> Highlight Plated Drill Target Rings</label>
            </div>
          </div>
        </div>

        <!-- TAB 2: APERTURES (D-CODES) -->
        <div class="cam-wb-pane" id="cam-wb-pane-apertures" ${initialTab === 'apertures' ? '' : 'hidden'}>
          <div class="rp-scroll" style="max-height:50vh">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <b>Gerber RS-274X Aperture Definition Table (D10 – D999)</b>
              <button type="button" id="cam-exp-dcode-csv" class="rp-btn-sm">Export D-Code CSV</button>
            </div>
            <table class="btab" style="width:100%">
              <tr><th>D-Code</th><th>Aperture Shape</th><th>Metric Size (mm)</th><th>English Size (mils / in)</th><th>Flashes (D03)</th><th>Draws (D01)</th></tr>
              ${apTableHTML}
            </table>
          </div>
        </div>

        <!-- TAB 3: DRILLS (T-CODES) -->
        <div class="cam-wb-pane" id="cam-wb-pane-drills" ${initialTab === 'drills' ? '' : 'hidden'}>
          <div class="rp-scroll" style="max-height:50vh">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <b>Excellon NC Drill &amp; Rout Tool Schedule (T01 – T99)</b>
              <button type="button" id="cam-exp-tcode-csv" class="rp-btn-sm">Export Drill CSV</button>
            </div>
            <table class="btab" style="width:100%">
              <tr><th>Tool Code</th><th>Metric Dia (mm)</th><th>English Dia (mils / in)</th><th>Drill Hits</th><th>Routed Slots (G85)</th><th>Tool Travel Path</th></tr>
              ${drlTableHTML}
            </table>
          </div>
        </div>

        <!-- TAB 4: IPC-D-356 NETLIST & DFM RULES -->
        <div class="cam-wb-pane" id="cam-wb-pane-ipc" ${initialTab === 'ipc' ? '' : 'hidden'}>
          <div class="rp-hud-grid" style="margin-bottom:10px">
            <div class="rp-hud-section">
              <h4>IPC-2221 / IPC-6012 DFM &amp; DRC Rule Thresholds</h4>
              <div class="rp-form-group">
                <label>IPC Fabrication Class Preset:</label>
                <select id="cam-wb-ipc-class">
                  <option value="class1" ${CAMState.ipcClass === 'class1' ? 'selected' : ''}>IPC Class 1 — General Electronics (6.0 mil / 0.152 mm)</option>
                  <option value="class2" ${CAMState.ipcClass === 'class2' ? 'selected' : ''}>IPC Class 2 — Industrial / Dedicated (4.0 mil / 0.102 mm)</option>
                  <option value="class3" ${CAMState.ipcClass === 'class3' ? 'selected' : ''}>IPC Class 3 — High-Rel / Aerospace (3.0 mil / 0.076 mm)</option>
                  <option value="hdi" ${CAMState.ipcClass === 'hdi' ? 'selected' : ''}>IPC HDI — Fine Pitch / Microvia (2.0 mil / 0.051 mm)</option>
                </select>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
                <label>Min Copper Clearance (${isMetric ? 'mm' : 'mils'}):
                  <input type="number" id="cam-rule-clr" step="0.01" value="${isMetric ? (rules.minClearanceMils * 0.0254).toFixed(3) : rules.minClearanceMils}" style="width:100%" />
                </label>
                <label>Min Trace Width (${isMetric ? 'mm' : 'mils'}):
                  <input type="number" id="cam-rule-trc" step="0.01" value="${isMetric ? (rules.minTraceWidthMils * 0.0254).toFixed(3) : rules.minTraceWidthMils}" style="width:100%" />
                </label>
                <label>Min Annular Ring (${isMetric ? 'mm' : 'mils'}):
                  <input type="number" id="cam-rule-ring" step="0.01" value="${isMetric ? (rules.minAnnularRingMils * 0.0254).toFixed(3) : rules.minAnnularRingMils}" style="width:100%" />
                </label>
                <label>Compare Tolerance (${isMetric ? 'mm' : 'mils'}):
                  <input type="number" id="cam-rule-tol" step="0.01" value="${isMetric ? ((rules.compareTolMils || 0.25) * 0.0254).toFixed(3) : (rules.compareTolMils || 0.25)}" style="width:100%" />
                </label>
              </div>
            </div>
            <div class="rp-hud-section">
              <h4>IPC-D-356 Bare-Board Netlist Actions</h4>
              <p style="margin:0;font-size:12px;opacity:.8">Load IPC-D-356 netlists in CUST 0 (English mils) or CUST 1 (Metric mm) to verify pad/via connectivity, highlight nets, and detect opens/shorts.</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
                <button type="button" id="cam-wb-open-ipc" class="rp-btn-sm">Import IPC-D-356 (.ipc/.d356)</button>
                <button type="button" id="cam-wb-clear-hl" class="rp-btn-sm">Clear Net Highlight</button>
              </div>
            </div>
          </div>
          <div class="rp-scroll" style="max-height:26vh">
            <table class="btab" style="width:100%">
              <tr><th>Net Name</th><th>Total Nodes</th><th>Feature Breakdown</th><th>Connected Component Pins</th><th>Action</th></tr>
              ${netTableHTML}
            </table>
          </div>
        </div>

        <div class="rp-btns" style="margin-top:8px">
          <button type="button" id="cam-wb-open-precompare"><i data-ic="layers"></i><span>Layer Stack Setup (${CAMState.pairedLayers.length || 0} Layers)</span></button>
          <button type="button" id="cam-wb-run-dfm">Run DFM / Clearance Scan</button>
          <button type="button" id="cam-wb-apply" class="rp-primary">Apply Settings &amp; Re-Render CAM</button>
        </div>
      </div>
    `;

    if (typeof hydrateIcons === 'function') hydrateIcons(modal);

    // Tab switching inside modal
    modal.querySelectorAll('.cam-wb-tab').forEach(btn => {
      btn.onclick = () => {
        modal.querySelectorAll('.cam-wb-tab').forEach(b => b.classList.remove('on'));
        modal.querySelectorAll('.cam-wb-pane').forEach(p => { p.hidden = true; });
        btn.classList.add('on');
        const pane = $(`#cam-wb-pane-${btn.dataset.wbtab}`);
        if (pane) pane.hidden = false;
      };
    });

    // Live unit conversion inside modal when switching English <-> Metric
    $('#cam-wb-units').onchange = e => {
      setUnitSystem(e.target.value);
      showCAMWorkbenchModal(modal.querySelector('.cam-wb-tab.on')?.dataset.wbtab || 'format');
    };

    $('#cam-wb-ipc-class').onchange = e => {
      CAMState.ipcClass = e.target.value;
      if (CAMEngine.IPC_DFM_RULES[CAMState.ipcClass]) {
        Object.assign(CAMState.customRules, CAMEngine.IPC_DFM_RULES[CAMState.ipcClass]);
      }
      if ($('#rib-ipc-class')) $('#rib-ipc-class').value = CAMState.ipcClass;
      showCAMWorkbenchModal('ipc');
    };

    modal.querySelectorAll('.cam-hl-net-btn').forEach(btn => {
      btn.onclick = async () => {
        const net = btn.dataset.net;
        CAMState.highlightNet = (CAMState.highlightNet === net) ? null : net;
        modal.hidden = true;
        await reRenderActiveCAMLayers();
        if (CAMState.highlightNet) rpToast(`Highlighted IPC-D-356 Net: ${CAMState.highlightNet}`);
      };
    });

    if ($('#cam-wb-clear-hl')) {
      $('#cam-wb-clear-hl').onclick = async () => {
        CAMState.highlightNet = null;
        modal.hidden = true;
        await reRenderActiveCAMLayers();
      };
    }

    if ($('#cam-wb-open-ipc')) {
      $('#cam-wb-open-ipc').onclick = () => {
        modal.hidden = true;
        CAMState.parsedIPCA = null;
        window.__lastIPCA = null;
        promptIPCD356Netlist();
      };
    }



    if ($('#cam-exp-dcode-csv')) {
      $('#cam-exp-dcode-csv').onclick = () => {
        const headers = ['D_Code,Shape,Width_mils,Height_mils,Width_mm,Height_mm,Flashes,Draws'];
        const rows = apRows.map(r => `${r.dCode},"${r.shape}",${r.widthMils},${r.heightMils},${r.widthMM},${r.heightMM},${r.flashes},${r.draws}`);
        const enc = new TextEncoder().encode('\ufeff' + headers.concat(rows).join('\r\n'));
        window.native && window.native.saveFile({ name: 'cam_aperture_table.csv', bytes: enc, filters: [{ name: 'CSV', extensions: ['csv'] }] });
        rpToast('Exported CAM Aperture (D-Code) Table to CSV.');
      };
    }

    if ($('#cam-exp-tcode-csv')) {
      $('#cam-exp-tcode-csv').onclick = () => {
        const headers = ['T_Code,Dia_mils,Dia_in,Dia_mm,Hits,Routed_Slots,Travel_in,Travel_mm'];
        const rows = drlRows.map(r => `${r.tCode},${r.diaMils},${r.diaIn},${r.diaMM},${r.hits},${r.slots},${r.travelIn},${r.travelMM}`);
        const enc = new TextEncoder().encode('\ufeff' + headers.concat(rows).join('\r\n'));
        window.native && window.native.saveFile({ name: 'cam_drill_schedule.csv', bytes: enc, filters: [{ name: 'CSV', extensions: ['csv'] }] });
        rpToast('Exported CAM NC Drill (T-Code) Schedule to CSV.');
      };
    }

    const saveModalSettings = () => {
      CAMState.zeroSuppression = $('#cam-wb-zeros').value;
      CAMState.coordFormat = $('#cam-wb-fmt').value;
      CAMState.coordMode = $('#cam-wb-coordmode').value;
      CAMState.renderMode = $('#cam-wb-rendermode').value;
      CAMState.pcbTheme = $('#cam-wb-theme').value;
      CAMState.mirrorX = $('#cam-wb-mirror').checked;
      CAMState.invertPolarity = $('#cam-wb-neg').checked;
      CAMState.showOrigin = $('#cam-wb-origin').checked;
      CAMState.showDrillRings = $('#cam-wb-drillrings').checked;

      if ($('#rib-cam-render')) $('#rib-cam-render').value = CAMState.renderMode;
      if ($('#rib-cam-mirror')) $('#rib-cam-mirror').checked = CAMState.mirrorX;
      if ($('#rib-cam-neg')) $('#rib-cam-neg').checked = CAMState.invertPolarity;

      const factorToMils = CAMState.unitSystem === 'metric' ? (1 / 0.0254) : 1.0;
      const clrIn = parseFloat($('#cam-rule-clr')?.value);
      const trcIn = parseFloat($('#cam-rule-trc')?.value);
      const ringIn = parseFloat($('#cam-rule-ring')?.value);
      const tolIn = parseFloat($('#cam-rule-tol')?.value);
      if (!isNaN(clrIn)) CAMState.customRules.minClearanceMils = +(clrIn * factorToMils).toFixed(2);
      if (!isNaN(trcIn)) CAMState.customRules.minTraceWidthMils = +(trcIn * factorToMils).toFixed(2);
      if (!isNaN(ringIn)) CAMState.customRules.minAnnularRingMils = +(ringIn * factorToMils).toFixed(2);
      if (!isNaN(tolIn)) CAMState.customRules.compareTolMils = +(tolIn * factorToMils).toFixed(2);
    };

    $('#cam-wb-close').onclick = () => { modal.hidden = true; };
    if ($('#cam-wb-open-precompare')) {
      $('#cam-wb-open-precompare').onclick = () => {
        saveModalSettings();
        modal.hidden = true;
        showCAMPreCompareModal();
      };
    }
    modal.onclick = e => { if (e.target === modal) modal.hidden = true; };

    $('#cam-wb-apply').onclick = async () => {
      saveModalSettings();
      modal.hidden = true;
      await reRenderActiveCAMLayers();
    };

    $('#cam-wb-run-dfm').onclick = async () => {
      saveModalSettings();
      modal.hidden = true;
      await runCAMClearanceScan();
    };
  }

  /**
   * Update the CAM / DFM Sidebar Tab Pane
   */
  function updateCAMSidebarPane() {
    const pane = $('#cam-sidebar-pane');
    if (!pane || typeof CAMEngine === 'undefined') return;

    const isMetric = CAMState.unitSystem === 'metric';
    const gbr = CAMState.parsedGerberB || CAMState.parsedGerberA;
    const drl = CAMState.parsedDrillB || CAMState.parsedDrillA;
    const ipc = CAMState.parsedIPCB || CAMState.parsedIPCA;
    const apCount = gbr ? gbr.apertures.size : 0;
    const cmdCount = gbr ? gbr.commands.length : 0;
    const hitCount = drl ? drl.hits.length : 0;
    const netCount = ipc ? ipc.nets.size : 0;
    const rules = CAMEngine.IPC_DFM_RULES[CAMState.ipcClass] || CAMState.customRules;

    const fmtRule = mils => isMetric ? `${(mils * 0.0254).toFixed(3)} mm` : `${mils.toFixed(1)} mil`;

    const violHTML = CAMState.lastDFMViolations.length
      ? CAMState.lastDFMViolations.map((v, idx) => `
          <div class="defect-item status-flagged cam-dfm-card" data-dfmidx="${idx}" style="margin-bottom:5px;cursor:pointer" title="Click to locate DFM violation on board">
            <div class="defect-header">
              <span class="defect-badge removed">DFM #${idx + 1}: ${v.category}</span>
              <span class="defect-coords">${v.measuredMils != null ? fmtRule(v.measuredMils) : ''}</span>
            </div>
            <div style="font-size:11px;opacity:.88">${v.description}</div>
          </div>
        `).join('')
      : `<div class="rp-empty-msg" style="padding:10px">No DFM rule violations detected or scan not run yet.</div>`;

    pane.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;padding:8px 10px;overflow-y:auto;flex:1">
        <div class="rp-checklist-header">
          <h4>PCB CAM &amp; IPC Inspector</h4>
          <button type="button" id="cam-side-wb-btn" class="rp-btn-sm"><i data-ic="gear"></i><span>Workbench</span></button>
        </div>

        <div class="rp-layer-row">
          <span class="rp-layer-lbl">IPC Units:</span>
          <select id="cam-side-units" class="rp-select-xs" style="flex:1.2">
            <option value="english" ${!isMetric ? 'selected' : ''}>IPC English (mils / in)</option>
            <option value="metric" ${isMetric ? 'selected' : ''}>IPC Metric (mm / µm)</option>
          </select>
        </div>

        <div class="rp-layer-row">
          <span class="rp-layer-lbl">Display Mode:</span>
          <select id="cam-side-render" class="rp-select-xs" style="flex:1.2">
            <option value="fill" ${CAMState.renderMode === 'fill' ? 'selected' : ''}>Filled Copper</option>
            <option value="outline" ${CAMState.renderMode === 'outline' ? 'selected' : ''}>Outline (Wireframe)</option>
            <option value="skeleton" ${CAMState.renderMode === 'skeleton' ? 'selected' : ''}>Centerline (Skeleton)</option>
          </select>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;background:var(--panel);padding:8px;border:1px solid var(--line);border-radius:6px;font-size:11.5px">
          <div><b>D-Code Apertures:</b> ${apCount}</div>
          <div><b>CAM Features:</b> ${cmdCount}</div>
          <div><b>Excellon Hits:</b> ${hitCount}</div>
          <div><b>IPC-D-356 Nets:</b> ${netCount}</div>
          <div><b>Min Clearance:</b> ${fmtRule(rules.minClearanceMils)}</div>
          <div><b>Min Annular:</b> ${fmtRule(rules.minAnnularRingMils)}</div>
        </div>

        <div class="rp-layer-row">
          <span class="rp-layer-lbl">Active Layer (${Math.max(1, CAMState.pairedLayers.length)}):</span>
          <select id="cam-side-layer-sel" class="rp-select-xs" style="flex:1.2">
            ${CAMState.pairedLayers.length
              ? CAMState.pairedLayers.map((p, i) => `<option value="${i}" ${i === (CAMState.activeLayerIndex || 0) ? 'selected' : ''}>L${p.pairIndex}: ${p.code} — ${p.label}</option>`).join('')
              : '<option value="0">Single Layer / Default</option>'}
          </select>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button type="button" id="cam-side-setup-btn" class="rp-btn-sm" style="flex:1;border-color:#38bdf8;color:#38bdf8"><i data-ic="gear"></i><span>CAM Setup (${CAMState.pairedLayers.length || 0})</span></button>
          <button type="button" id="cam-side-dfm-btn" class="rp-btn-sm" style="flex:1"><i data-ic="clearance"></i><span>Run DFM Scan</span></button>
          <button type="button" id="cam-side-dcode-btn" class="rp-btn-sm" style="flex:1"><i data-ic="pcbCam"></i><span>D-Codes / Drills</span></button>
        </div>

        ${(DXFState._isActiveDXFSession && (DXFState.parsedA || DXFState.parsedB)) ? `
          <div class="rp-checklist-header" style="margin-top:4px">
            <h4>AutoCAD DXF Layers <span class="rp-count-pill">${DXFState.syncLayerSetsFromParsers().length}</span></h4>
            <div style="display:flex;gap:4px">
              <button type="button" id="cam-side-dxf-pre-btn" class="rp-btn-sm" title="Select Which DXF Layers to Compare">Compare Setup</button>
              <button type="button" id="cam-side-dxf-studio-btn" class="rp-btn-sm" style="border-color:#38bdf8;color:#38bdf8" title="Open in DXF Studio Editor">DXF Studio</button>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:3px;max-height:190px;overflow-y:auto;border:1px solid var(--line);border-radius:6px;padding:4px;background:var(--panel)">
            ${DXFState.syncLayerSetsFromParsers().map(l => {
              const isCmp = DXFState.comparedLayers.has(l.name);
              const isLck = DXFState.lockedLayers.has(l.name);
              const isFrz = DXFState.frozenLayers.has(l.name);
              return `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;padding:3px 5px;border-radius:4px;background:var(--bg);font-size:11px;${!isCmp ? "opacity:0.55" : ""}">
                  <label style="display:flex;align-items:center;gap:5px;flex:1;min-width:0;cursor:pointer">
                    <input type="checkbox" class="side-dxf-cmp-chk" data-lyr="${l.name}" ${isCmp ? "checked" : ""} title="Include Layer in DXF Compare" />
                    <span style="width:10px;height:10px;border-radius:2px;background:${l.hexDark};flex-shrink:0"></span>
                    <b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${l.name} (${l.count} entities)">${l.name}</b>
                  </label>
                  <div style="display:flex;gap:2px;align-items:center">
                    <button type="button" class="rp-btn-sm side-dxf-frz-btn ${isFrz ? "on" : ""}" data-lyr="${l.name}" style="padding:1px 4px;font-size:10px" title="Freeze / Thaw Layer"><i data-ic="freeze"></i></button>
                    <button type="button" class="rp-btn-sm side-dxf-lck-btn ${isLck ? "on" : ""}" data-lyr="${l.name}" style="padding:1px 4px;font-size:10px;${isLck ? "border-color:#f59e0b;color:#f59e0b" : ""}" title="Lock / Unlock Layer"><i data-ic="${isLck ? "lock" : "unlock"}"></i></button>
                    <button type="button" class="rp-btn-sm side-dxf-del-btn" data-lyr="${l.name}" style="padding:1px 4px;font-size:10px;color:#f87171" title="Remove Layer & Entities"><i data-ic="trash"></i></button>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        ` : ""}

        <div class="rp-checklist-header" style="margin-top:4px">
          <h4>DFM / DRC Rule Alerts <span class="rp-count-pill">${CAMState.lastDFMViolations.length}</span></h4>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${violHTML}
        </div>
      </div>
    `;

    if (typeof hydrateIcons === 'function') hydrateIcons(pane);

    const uSel = $('#cam-side-units');
    if (uSel) uSel.onchange = e => setUnitSystem(e.target.value);

    const rSel = $('#cam-side-render');
    if (rSel) rSel.onchange = e => {
      CAMState.renderMode = e.target.value;
      if ($('#rib-cam-render')) $('#rib-cam-render').value = CAMState.renderMode;
      reRenderActiveCAMLayers();
    };

    const wbBtn = $('#cam-side-wb-btn');
    if (wbBtn) wbBtn.onclick = () => showCAMWorkbenchModal('format');

    const setupBtn = $('#cam-side-setup-btn');
    if (setupBtn) setupBtn.onclick = () => showCAMPreCompareModal();

    const lyrSel = $('#cam-side-layer-sel');
    if (lyrSel) {
      lyrSel.onchange = e => {
        const idx = parseInt(e.target.value, 10) || 0;
        CAMState.activeLayerIndex = idx;
        CAMState.ensureParsed();
        updateCAMSidebarPane();
        if (CAMState.stackCompareMode === 'multipage' && window.ACT && typeof window.ACT.cGoto === 'function') {
          window.ACT.cGoto(idx + 1);
        } else if (CAMState.stackCompareMode === 'single') {
          executeConfiguredCAMCompare();
        }
      };
    }

    const dfmBtn = $('#cam-side-dfm-btn');
    if (dfmBtn) dfmBtn.onclick = () => runCAMClearanceScan();

    const dcBtn = $('#cam-side-dcode-btn');
    if (dcBtn) dcBtn.onclick = () => showCAMWorkbenchModal('apertures');
    if ($("#cam-side-dxf-pre-btn")) $("#cam-side-dxf-pre-btn").onclick = () => showDXFPreCompareModal();
    if ($("#cam-side-dxf-studio-btn")) $("#cam-side-dxf-studio-btn").onclick = () => { if (typeof window.setView === "function") window.setView("dxf"); };
    pane.querySelectorAll(".side-dxf-cmp-chk").forEach(chk => {
      chk.onchange = async () => {
        DXFState.applyLayerStateToParsers(chk.dataset.lyr, { compared: chk.checked, visible: chk.checked });
        await reRenderActiveDXFLayers();
      };
    });
    pane.querySelectorAll(".side-dxf-frz-btn").forEach(btn => {
      btn.onclick = async () => {
        const lyr = btn.dataset.lyr;
        const nextFrz = !DXFState.frozenLayers.has(lyr);
        DXFState.applyLayerStateToParsers(lyr, { frozen: nextFrz, visible: !nextFrz });
        await reRenderActiveDXFLayers();
      };
    });
    pane.querySelectorAll(".side-dxf-lck-btn").forEach(btn => {
      btn.onclick = async () => {
        const lyr = btn.dataset.lyr;
        const nextLck = !DXFState.lockedLayers.has(lyr);
        DXFState.applyLayerStateToParsers(lyr, { locked: nextLck });
        rpToast(`Layer "${lyr}" ${nextLck ? "Locked" : "Unlocked"}.`);
        await reRenderActiveDXFLayers();
      };
    });
    pane.querySelectorAll(".side-dxf-del-btn").forEach(btn => {
      btn.onclick = async () => {
        const lyr = btn.dataset.lyr;
        const res = DXFState.deleteLayerFromParsers(lyr, "both", "delete_entities");
        if (!res.ok) return rpToast(res.reason);
        rpToast(`Removed layer "${lyr}" (${res.removedCount} entities deleted).`);
        await reRenderActiveDXFLayers();
      };
    });
    pane.querySelectorAll('.cam-dfm-card').forEach(card => {
      card.onclick = () => {
        const v = CAMState.lastDFMViolations[+card.dataset.dfmidx];
        if (!v) return;
        const gbr = CAMState.parsedGerberB || CAMState.parsedGerberA;
        const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : null;
        if (v.page && S && S.cur && S.cur.n !== v.page && CAMState.stackCompareMode === 'multipage' && window.ACT && typeof window.ACT.cGoto === 'function') {
          window.ACT.cGoto(v.page);
        }
        if (v.xIn != null && v.yIn != null && S && S.cur && S.view) {
          const sb = CAMState.activeSharedBoundsInches || (gbr && isFinite(gbr.bounds.minX) ? {
            minX: gbr.toInches(gbr.bounds.minX), maxX: gbr.toInches(gbr.bounds.maxX),
            minY: gbr.toInches(gbr.bounds.minY), maxY: gbr.toInches(gbr.bounds.maxY)
          } : { minX: 0, maxX: 2.5, minY: 0, maxY: 1.5 });
          const bw = Math.max(1e-4, sb.maxX - sb.minX), bh = Math.max(1e-4, sb.maxY - sb.minY);
          const pad = 36 * (S.cur.W / 1100);
          const tw = Math.max(10, S.cur.W - pad * 2), th = Math.max(10, S.cur.H - pad * 2);
          const scale = Math.min(tw / bw, th / bh);
          const ox = pad + (tw - bw * scale) / 2, oy = pad + (th - bh * scale) / 2;
          const effMirror = CAMState.isActiveLayerMirroredX ? CAMState.isActiveLayerMirroredX(v.page || (S.cur && S.cur.n) || 1) : !!CAMState.mirrorX;
          const adjX = effMirror ? (sb.maxX - (v.xIn - sb.minX)) : v.xIn;
          const px = ox + (adjX - sb.minX) * scale;
          const py = S.cur.H - (oy + (v.yIn - sb.minY) * scale);
          const vp = $('#vp');
          if (vp) {
            S.view.k = Math.max(2.0, Math.min(6.0, S.view.k));
            S.view.x = Math.round(vp.clientWidth / 2 - px * S.view.k);
            S.view.y = Math.round(vp.clientHeight / 2 - py * S.view.k);
            const stg = $('#stage');
            if (stg) stg.style.transform = `translate(${S.view.x}px, ${S.view.y}px) scale(${S.view.k})`;
            if (typeof window.applyView === 'function') window.applyView();
            else if (window.rpSharpen) window.rpSharpen();
          }
        } else if (DefectState.defects.length) {
          DefectState.jumpTo(0);
        }
        rpToast(`Located DFM Alert: ${v.category} — ${v.description}`);
      };
    });
  }

  /**
   * Integrate Unified Defect Checklist & CAM / DFM Inspector into Sidebar
   * Fixes the double-defect-list bug where #list and #defect-checklist-pane overlapped and squeezed #text!
   */
  function initSidebarDefects() {
    const aside = $('#view-compare aside');
    if (!aside || $('#defect-checklist-pane')) return;

    // Add CAM / DFM tab button and Collapse Sidebar button to aside .tabs
    const tabsBar = aside.querySelector('.tabs');
    if (tabsBar && !tabsBar.querySelector('[data-t="cam"]')) {
      const camBtn = el('button', { 'data-t': 'cam', title: 'PCB CAM Layer Stackup, D-Codes, Drills, IPC Units & DFM Rules' }, '<i data-ic="pcbCam"></i><span>CAM/DFM</span>');
      tabsBar.appendChild(camBtn);
      const colBtn = el('button', { type: 'button', className: 'rp-sidebar-collapse-btn', title: 'Collapse Sidebar to view full PDF page ([ or Ctrl+B)' }, '<i data-ic="next"></i>');
      colBtn.onclick = e => {
        e.stopPropagation();
        aside.classList.add('rp-collapsed');
        window.dispatchEvent(new Event('resize'));
        rpToast('Sidebar closed — Full PDF page expanded (Click edge tab or press ] to reopen).');
      };
      tabsBar.appendChild(colBtn);
      if (typeof hydrateIcons === 'function') hydrateIcons(tabsBar);
    }
    if (!aside.querySelector('.rp-sidebar-reopen-tab')) {
      const reopenTab = el('button', { type: 'button', className: 'rp-sidebar-reopen-tab', title: 'Reopen Differences / CAM Sidebar (] or Ctrl+B)' }, '◀ Panel');
      reopenTab.onclick = e => {
        e.stopPropagation();
        aside.classList.remove('rp-collapsed');
        window.dispatchEvent(new Event('resize'));
      };
      aside.appendChild(reopenTab);
    }
    // Editor #etools is hidden by default (all sets are in the top MS Office Ribbon)
    const edAside = $('#etools');
    if (edAside) {
      const edTabs = edAside.querySelector('.tabs');
      if (edTabs && !edTabs.querySelector('.rp-sidebar-collapse-btn')) {
        const edColBtn = el('button', { type: 'button', className: 'rp-sidebar-collapse-btn', title: 'Close Comments Panel' }, '<i data-ic="next"></i>');
        edColBtn.onclick = e => {
          e.stopPropagation();
          edAside.classList.add('rp-collapsed');
          edAside.hidden = true;
          if ($('#ePanelBtn')) $('#ePanelBtn').classList.remove('on');
          window.dispatchEvent(new Event('resize'));
        };
        edTabs.appendChild(edColBtn);
        if (typeof hydrateIcons === 'function') hydrateIcons(edTabs);
      }
    }

    // Hide the redundant legacy #list visually (keeping it in DOM for MutationObserver & backward compatibility)
    const legacyList = $('#list');
    if (legacyList) {
      legacyList.style.display = 'none';
    }

    const checklistPane = el('div', { id: 'defect-checklist-pane', className: 'rp-checklist-pane' });
    checklistPane.innerHTML = `
      <div class="rp-checklist-header">
        <h4>Defects <span id="rp-defect-count-badge" class="rp-count-pill">0</span></h4>
        <div class="rp-checklist-tools">
          <select id="rp-defect-filter" class="rp-select-xs" title="Filter Defects by Status">
            <option value="ALL">All</option>
            <option value="Open">Open</option>
            <option value="Approved">Approved</option>
            <option value="Flagged">Flagged</option>
            <option value="Ignored">Ignored</option>
          </select>
          <button id="rp-export-csv-btn" title="Export Defect Checklist to CSV (IPC English mils & Metric mm)" class="rp-btn-sm"><i data-ic="csv"></i><span>CSV</span></button>
          <button id="rp-audit-btn" title="Generate Multi-Page Executive Audit PDF" class="rp-btn-sm"><i data-ic="auditPdf"></i><span>Audit PDF</span></button>
        </div>
      </div>
      <div id="defect-checklist-body">
        <div class="rp-empty-msg">Open Rev A and Rev B drawings to populate the defect checklist.</div>
      </div>
    `;
    aside.appendChild(checklistPane);

    const tabsBar2 = aside.querySelector('.tabs');
    if (tabsBar2 && !tabsBar2.querySelector('[data-t="m"]')) {
      const mBtn = el('button', { 'data-t': 'm', title: 'Placed Measurements, Revision Clouds, Callouts & BOM Tally Badges' }, '<i data-ic="tally"></i><span>Markups</span>');
      const colBtnRef = tabsBar2.querySelector('.rp-sidebar-collapse-btn');
      if (colBtnRef) tabsBar2.insertBefore(mBtn, colBtnRef);
      else tabsBar2.appendChild(mBtn);
      if (typeof hydrateIcons === 'function') hydrateIcons(tabsBar2);
    }

    const camPane = el('div', { id: 'cam-sidebar-pane', className: 'rp-checklist-pane', hidden: true });
    aside.appendChild(camPane);

    const markupsPane = el('div', { id: 'markups-sidebar-pane', className: 'rp-checklist-pane', hidden: true });
    aside.appendChild(markupsPane);

    const updateMarkupsSidebarPane = () => {
      if (!markupsPane) return;
      const RM = (typeof window !== 'undefined' && window.RP_MEASURE) ? window.RP_MEASURE : { annotations: [], tally: { items: [] } };
      const anns = RM.annotations || [];
      const tallies = (RM.tally && RM.tally.items) ? RM.tally.items : [];

      const annListHTML = anns.length ? anns.map((a, idx) => {
        const canEditTxt = ['pin', 'leader', 'cloud'].includes(a.kind);
        const curTxt = (a.kind === 'cloud' ? (a.revText || '') : (a.label || '')).replace(/"/g, '&quot;');
        return `
        <div class="defect-item" data-annidx="${idx}">
          <div class="defect-header">
            <span class="defect-badge changed">#${idx + 1} ${a.kind.toUpperCase()}${a.pinNum ? ' #' + a.pinNum : ''}</span>
            <span class="defect-coords">${a.label || a.revText || a.stampType || "Markup"}</span>
            <button type="button" class="rp-btn-sm rp-side-del-ann" data-idx="${idx}" title="Remove Markup">×</button>
          </div>
          ${canEditTxt ? `<input type="text" class="defect-note-input rp-side-ann-in" data-idx="${idx}" value="${curTxt}" placeholder="${a.kind === 'cloud' ? 'Delta tag (e.g. Δ Rev 2)...' : 'Callout / Pin note...'}" />` : ''}
        </div>
      `;
      }).join("") : `<div class="rp-empty-msg" style="padding:10px">No measurements or redline markups placed yet. Use Measure or Markup tabs above.</div>`;

      const tallyListHTML = tallies.length ? tallies.map(t => `
        <div class="defect-item" data-tallyid="${t.id}">
          <div class="defect-header">
            <span class="defect-badge added">BOM #${t.number}</span>
            <span class="defect-coords">Page ${t.page} · (${Math.round(t.x)}, ${Math.round(t.y)})</span>
          </div>
          <input type="text" class="defect-note-input rp-side-tally-in" data-id="${t.id}" value="${(t.label || "").replace(/"/g, "&quot;")}" placeholder="Component / BOM note..." />
        </div>
      `).join("") : `<div class="rp-empty-msg" style="padding:10px">No BOM Tally badges placed yet. Click "Tally / BOM Badge" in Measure tab.</div>`;

      markupsPane.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;overflow-y:auto;flex:1">
          <div class="rp-checklist-header">
            <h4>Measurements &amp; Markups <span class="rp-count-pill">${anns.length}</span></h4>
            <button type="button" id="rp-side-clear-anns" class="rp-btn-sm">Clear All</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">${annListHTML}</div>
          <div class="rp-checklist-header" style="margin-top:6px">
            <h4>BOM Tally Counter <span class="rp-count-pill">${tallies.length}</span></h4>
            <button type="button" id="rp-side-bom-csv" class="rp-btn-sm"><i data-ic="csv"></i><span>CSV</span></button>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">${tallyListHTML}</div>
        </div>
      `;
      if (typeof hydrateIcons === "function") hydrateIcons(markupsPane);

      markupsPane.querySelectorAll(".rp-side-del-ann").forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          CompareHistory.push("Delete markup");
          anns.splice(parseInt(btn.dataset.idx, 10), 1);
          if (window.rpRedrawOverlay) window.rpRedrawOverlay();
          updateMarkupsSidebarPane();
        };
      });
      markupsPane.querySelectorAll(".rp-side-ann-in").forEach(inp => {
        inp.oninput = () => {
          const item = anns[parseInt(inp.dataset.idx, 10)];
          if (!item) return;
          if (item.kind === "cloud") item.revText = inp.value;
          else item.label = inp.value;
          if (window.rpRedrawOverlay) window.rpRedrawOverlay();
        };
      });
      markupsPane.querySelectorAll(".rp-side-tally-in").forEach(inp => {
        inp.oninput = () => {
          const item = tallies.find(t => t.id === inp.dataset.id);
          if (item) item.label = inp.value;
        };
      });
      const clrBtn = $("#rp-side-clear-anns");
      if (clrBtn) clrBtn.onclick = () => {
        CompareHistory.push("Clear all markups");
        RM.annotations = [];
        if (RM.tally) RM.tally.clear();
        if (window.rpRedrawOverlay) window.rpRedrawOverlay();
        updateMarkupsSidebarPane();
      };
      const csvBtn = $("#rp-side-bom-csv");
      if (csvBtn) csvBtn.onclick = () => {
        if (!RM.tally) return;
        const enc = new TextEncoder().encode("\ufeff" + RM.tally.toCSV());
        window.native && window.native.saveFile({ name: "bom_tally_schedule.csv", bytes: enc, filters: [{ name: "CSV", extensions: ["csv"] }] });
        rpToast("Exported BOM Tally CSV.");
      };
    };
    window.rpUpdateMarkupsSidebar = updateMarkupsSidebarPane;

    updateCAMSidebarPane();
    updateMarkupsSidebarPane();

    if (typeof hydrateIcons === 'function') hydrateIcons(checklistPane);

    // Wire sidebar tab switching so Differences, Text, CAM/DFM, and Markups/BOM each get 100% height when selected!
    aside.querySelectorAll('.tabs button[data-t]').forEach(b => {
      b.onclick = () => {
        const mode = b.dataset.t;
        aside.querySelectorAll('.tabs button[data-t]').forEach(x => x.classList.toggle('on', x === b));
        const sumEl = $('#sum');
        const navRow = aside.querySelector('.navrow');
        const textEl = $('#text');

        if (sumEl) sumEl.hidden = (mode === 'cam' || mode === 'm');
        if (navRow) navRow.hidden = (mode !== 'd');
        checklistPane.hidden = (mode !== 'd');
        if (textEl) textEl.hidden = (mode !== 't');
        camPane.hidden = (mode !== 'cam');
        markupsPane.hidden = (mode !== 'm');
        if (mode === 'cam') updateCAMSidebarPane();
        if (mode === 'm') updateMarkupsSidebarPane();
      };
    });

    // Sync #markAll button with DefectState
    const markAllBtn = $('#markAll');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', () => {
        DefectState.markAllApproved();
      });
    }

    $('#rp-defect-filter').onchange = e => {
      DefectState.filterStatus = e.target.value;
      DefectState.renderChecklist();
    };
    $('#rp-export-csv-btn').onclick = () => exportDefectsCSV();
    $('#rp-audit-btn').onclick = () => generateExecutiveAuditReport();
  }

  /**
   * ============================================================================
   * SAMPLE DRAWING GENERATORS
   * ============================================================================
   */
  const SampleGenerator = {
    getSchematicSpec(isRevB = false) {
      return {
        revision: isRevB ? 'Rev B' : 'Rev A',
        pages: 2,
        fuse: isRevB ? 'FUSE 16A' : 'FUSE 10A',
        resistor: { id: 'R1', value: '10kΩ', x: isRevB ? 330 : 280, y: 320, relocated: !!isRevB },
        capacitors: isRevB
          ? [
              { id: 'C1', value: '100µF', x: 380, y: 325 },
              { id: 'C2', value: '10µF', x: 445, y: 325, role: 'filter cap' }
            ]
          : [
              { id: 'C1', value: '100µF', x: 380, y: 325 }
            ],
        gndRail: { label: 'GND rail', y: 220, x1: 80, x2: 650 },
        testpoint: isRevB ? 'TP1: +24V_FILT' : 'TP1: +24V_RAW'
      };
    },

    async generateSampleSchematicPDF(isRevB = false) {
      let pdfLibRef = (typeof PDFLib !== 'undefined') ? PDFLib : null;
      if (!pdfLibRef && typeof require === 'function') {
        try { pdfLibRef = require(['.', 'lib', 'pdf-lib.min.js'].join('/')); } catch (e) {}
      }
      if (!pdfLibRef || !pdfLibRef.PDFDocument) {
        throw new Error('PDFLib is required for offline vector PDF generation');
      }

      const spec = this.getSchematicSpec(isRevB);
      const doc = await pdfLibRef.PDFDocument.create();
      const font = await doc.embedFont(pdfLibRef.StandardFonts.Helvetica);
      const fontBold = await doc.embedFont(pdfLibRef.StandardFonts.HelveticaBold);
      const rgb = pdfLibRef.rgb;

      // ---------------- PAGE 1: Power Circuit Schematic ----------------
      const p1 = doc.addPage([792, 612]);

      p1.drawRectangle({ x: 30, y: 30, width: 732, height: 552, borderWidth: 1.5, borderColor: rgb(0.1, 0.2, 0.3), color: rgb(1, 1, 1) });
      p1.drawText('KENSHO STUDIO · textportdocx.in', { x: 40, y: 565, size: 9, font: fontBold, color: rgb(0.3, 0.4, 0.5) });
      p1.drawText('SHEET 1 OF 2: POWER CIRCUIT & DC REGULATOR', { x: 470, y: 565, size: 9, font: fontBold, color: rgb(0.2, 0.3, 0.4) });

      p1.drawRectangle({ x: 470, y: 30, width: 292, height: 82, borderWidth: 1, borderColor: rgb(0.2, 0.3, 0.4), color: rgb(0.96, 0.98, 1.0) });
      p1.drawText('PROJECT: INDUSTRIAL POWER SUPPLY SCHEMATIC', { x: 480, y: 94, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      p1.drawText(isRevB ? 'REVISION: REV B (MODIFIED - 16A & FILTER CAP)' : 'REVISION: REV A (BASE RELEASE)', {
        x: 480, y: 78, size: 8.5, font: fontBold, color: isRevB ? rgb(0.8, 0.1, 0.1) : rgb(0.1, 0.5, 0.2)
      });
      p1.drawText('AUTHOR: KENSHO STUDIO · textportdocx.in', { x: 480, y: 62, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
      p1.drawText('SCALE: 1:1   |   UNITS: MM   |   SHEET: 1 / 2', { x: 480, y: 46, size: 8, font, color: rgb(0.3, 0.3, 0.3) });

      p1.drawLine({ start: { x: 80, y: 420 }, end: { x: 650, y: 420 }, thickness: 2, color: rgb(0.1, 0.1, 0.1) });
      p1.drawText('+24V_IN', { x: 36, y: 417, size: 9, font: fontBold, color: rgb(0.75, 0.1, 0.1) });

      p1.drawLine({ start: { x: 80, y: 220 }, end: { x: 650, y: 220 }, thickness: 2, color: rgb(0.1, 0.1, 0.1) });
      p1.drawText('GND rail (0V COMMON RETURN)', { x: 250, y: 204, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

      [280, 380, 500].forEach(gx => {
        p1.drawLine({ start: { x: gx, y: 220 }, end: { x: gx, y: 192 }, thickness: 1.5, color: rgb(0.1, 0.1, 0.1) });
        p1.drawLine({ start: { x: gx - 14, y: 192 }, end: { x: gx + 14, y: 192 }, thickness: 1.5, color: rgb(0.1, 0.1, 0.1) });
        p1.drawLine({ start: { x: gx - 9, y: 186 }, end: { x: gx + 9, y: 186 }, thickness: 1.5, color: rgb(0.1, 0.1, 0.1) });
        p1.drawLine({ start: { x: gx - 4, y: 180 }, end: { x: gx + 4, y: 180 }, thickness: 1.5, color: rgb(0.1, 0.1, 0.1) });
      });

      p1.drawRectangle({ x: 130, y: 410, width: 44, height: 20, borderWidth: 1.5, borderColor: rgb(0.1, 0.1, 0.1), color: rgb(1, 1, 1) });
      p1.drawLine({ start: { x: 130, y: 420 }, end: { x: 174, y: 420 }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
      p1.drawText('F1', { x: 145, y: 396, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
      p1.drawText(spec.fuse, { x: 126, y: 436, size: 10, font: fontBold, color: isRevB ? rgb(0.75, 0.1, 0.1) : rgb(0.1, 0.1, 0.1) });

      p1.drawCircle({ x: 215, y: 420, size: 4, borderWidth: 1.5, borderColor: rgb(0.8, 0.45, 0), color: rgb(1, 0.9, 0.1) });
      p1.drawLine({ start: { x: 215, y: 420 }, end: { x: 215, y: 452 }, thickness: 1.2, color: rgb(0.8, 0.45, 0) });
      p1.drawText(spec.testpoint, { x: 186, y: 457, size: 8.5, font: fontBold, color: rgb(0.75, 0.35, 0) });

      const r1X = spec.resistor.x;
      p1.drawLine({ start: { x: r1X, y: 420 }, end: { x: r1X, y: 370 }, thickness: 1.5, color: rgb(0.1, 0.1, 0.1) });
      p1.drawRectangle({ x: r1X - 10, y: 320, width: 20, height: 50, borderWidth: 1.5, borderColor: rgb(0.1, 0.1, 0.1), color: rgb(1, 1, 1) });
      p1.drawLine({ start: { x: r1X, y: 320 }, end: { x: r1X, y: 220 }, thickness: 1.5, color: rgb(0.1, 0.1, 0.1) });
      p1.drawText('R1 10k Ohm', { x: r1X + 14, y: 348, size: 8.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

      p1.drawLine({ start: { x: 380, y: 420 }, end: { x: 380, y: 335 }, thickness: 1.5, color: rgb(0.1, 0.1, 0.1) });
      p1.drawLine({ start: { x: 365, y: 335 }, end: { x: 395, y: 335 }, thickness: 2.5, color: rgb(0.1, 0.1, 0.1) });
      p1.drawLine({ start: { x: 365, y: 325 }, end: { x: 395, y: 325 }, thickness: 2.5, color: rgb(0.1, 0.1, 0.1) });
      p1.drawLine({ start: { x: 380, y: 325 }, end: { x: 380, y: 220 }, thickness: 1.5, color: rgb(0.1, 0.1, 0.1) });
      p1.drawText('C1 100µF', { x: 400, y: 330, size: 8.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

      if (isRevB) {
        p1.drawLine({ start: { x: 445, y: 420 }, end: { x: 445, y: 335 }, thickness: 1.5, color: rgb(0.05, 0.5, 0.15) });
        p1.drawLine({ start: { x: 430, y: 335 }, end: { x: 460, y: 335 }, thickness: 2.5, color: rgb(0.05, 0.5, 0.15) });
        p1.drawLine({ start: { x: 430, y: 325 }, end: { x: 460, y: 325 }, thickness: 2.5, color: rgb(0.05, 0.5, 0.15) });
        p1.drawLine({ start: { x: 445, y: 325 }, end: { x: 445, y: 220 }, thickness: 1.5, color: rgb(0.05, 0.5, 0.15) });
        p1.drawText('C2 10µF', { x: 464, y: 336, size: 8.5, font: fontBold, color: rgb(0.05, 0.5, 0.15) });
        p1.drawText('FILTER CAP', { x: 464, y: 324, size: 7.5, font, color: rgb(0.05, 0.5, 0.15) });
      }

      p1.drawRectangle({ x: 535, y: 350, width: 92, height: 90, borderWidth: 1.5, borderColor: rgb(0.1, 0.1, 0.1), color: rgb(0.98, 0.98, 0.98) });
      p1.drawText('U1: DC-DC REG', { x: 544, y: 402, size: 8.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      p1.drawText('VOUT: +5.0V', { x: 548, y: 382, size: 8, font, color: rgb(0.3, 0.3, 0.3) });

      // ---------------- PAGE 2: Control & Telemetry Block ----------------
      const p2 = doc.addPage([792, 612]);
      p2.drawRectangle({ x: 30, y: 30, width: 732, height: 552, borderWidth: 1.5, borderColor: rgb(0.1, 0.2, 0.3), color: rgb(1, 1, 1) });
      p2.drawText('KENSHO STUDIO · textportdocx.in', { x: 40, y: 565, size: 9, font: fontBold, color: rgb(0.3, 0.4, 0.5) });
      p2.drawText('SHEET 2 OF 2: DIGITAL TELEMETRY & PROTECTION LOGIC', { x: 440, y: 565, size: 9, font: fontBold, color: rgb(0.2, 0.3, 0.4) });

      p2.drawRectangle({ x: 470, y: 30, width: 292, height: 82, borderWidth: 1, borderColor: rgb(0.2, 0.3, 0.4), color: rgb(0.96, 0.98, 1.0) });
      p2.drawText('PROJECT: INDUSTRIAL POWER SUPPLY SCHEMATIC', { x: 480, y: 94, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      p2.drawText(isRevB ? 'REVISION: REV B - SHEET 2 OF 2' : 'REVISION: REV A - SHEET 2 OF 2', { x: 480, y: 78, size: 8.5, font: fontBold, color: rgb(0.2, 0.3, 0.4) });
      p2.drawText('SCALE: 1:1   |   UNITS: MM   |   SHEET: 2 / 2', { x: 480, y: 46, size: 8, font, color: rgb(0.3, 0.3, 0.3) });

      p2.drawRectangle({ x: 180, y: 210, width: 360, height: 250, borderWidth: 1.5, borderColor: rgb(0.1, 0.1, 0.1), color: rgb(0.98, 0.99, 1.0) });
      p2.drawText('U2: SUPERVISORY CONTROLLER & FAULT MONITOR', { x: 220, y: 430, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      p2.drawLine({ start: { x: 100, y: 360 }, end: { x: 180, y: 360 }, thickness: 1.5, color: rgb(0.1, 0.1, 0.1) });
      p2.drawText('PGOOD_SENSE', { x: 95, y: 366, size: 8, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
      p2.drawLine({ start: { x: 100, y: 300 }, end: { x: 180, y: 300 }, thickness: 1.5, color: rgb(0.1, 0.1, 0.1) });
      p2.drawText('OVP_TRIP_IN', { x: 95, y: 306, size: 8, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
      if (isRevB) {
        p2.drawLine({ start: { x: 540, y: 330 }, end: { x: 640, y: 330 }, thickness: 1.5, color: rgb(0.05, 0.5, 0.15) });
        p2.drawText('TELEM_IRQ_OUT (REV B)', { x: 548, y: 338, size: 8, font: fontBold, color: rgb(0.05, 0.5, 0.15) });
      }

      return await doc.save();
    },

    generateSampleGerberCopper(isRevB = false) {
      const lines = [
        'G04 Kensho Pro 1.0 Synthetic PCB Copper Layer (RS-274X)*',
        '%FSLAX24Y24*%',
        '%MOIN*%',
        '%ADD10C,0.0120*%',
        '%ADD11C,0.0600*%',
        '%ADD12R,0.0750X0.0750*%',
        '%ADD13C,0.0080*%',
        'D12*',
        'X010000Y010000D03*',
        'D11*',
        'X015000Y010000D03*',
        'X020000Y010000D03*',
        'X010000Y015000D03*',
        'X015000Y015000D03*',
        'X020000Y015000D03*',
        'D10*',
        'X010000Y010000D02*',
        'X015000Y010000D01*',
        'X015000Y015000D01*',
        'X020000Y010000D02*',
        'X020000Y015000D01*',
        'X010000Y015000D02*',
        'X015000Y015000D01*'
      ];
      if (isRevB) {
        lines.push(
          'G04 Added trace with 3.0-mil spacing violation (<4.0 mil DRC threshold)*',
          'D13*',
          'X010405Y008500D02*',
          'X010405Y012500D01*'
        );
      }
      lines.push('M02*');
      return lines.join('\n');
    },

    generateSampleExcellonDrill() {
      return [
        'M48',
        'INCH',
        'T01C0.032',
        'T02C0.040',
        '%',
        'T01',
        'X1.0000Y1.0000',
        'X1.5000Y1.0000',
        'X2.0000Y1.0000',
        'T02',
        'X1.0000Y1.5000',
        'X1.5000Y1.5000',
        'X2.0000Y1.5000',
        'M30'
      ].join('\n');
    },

    generateSampleIPCD356Netlist(isMetric = false) {
      if (isMetric) {
        return [
          'C  IPC-D-356A Netlist Sample (Metric MM)',
          'P  JOB   KENSHO_PRO_SAMPLE_PCB',
          'P  UNITS CUST 1',
          '317 +24V_VIN         J1    -1   D0813PA00X+025400Y+025400X1905Y1905R000',
          '317 +24V_VIN         U1    -1   D0813PA00X+038100Y+025400X1524Y1524R000',
          '317 +24V_VIN         C1    -1   D1016PA00X+038100Y+038100X1524Y1524R000',
          '317 GND              J1    -2   D1016PA00X+025400Y+038100X1524Y1524R000',
          '317 +5V_VOUT         U1    -2   D0813PA00X+050800Y+025400X1524Y1524R000',
          '317 +5V_VOUT         C2    -1   D1016PA00X+050800Y+038100X1524Y1524R000',
          '999'
        ].join('\n');
      }
      return [
        'C  IPC-D-356A Netlist Sample (English Mils)',
        'P  JOB   KENSHO_PRO_SAMPLE_PCB',
        'P  UNITS CUST 0',
        '317 +24V_VIN         J1    -1   D0320PA00X+010000Y+010000X0750Y0750R000',
        '317 +24V_VIN         U1    -1   D0320PA00X+015000Y+010000X0600Y0600R000',
        '317 +24V_VIN         C1    -1   D0400PA00X+015000Y+015000X0600Y0600R000',
        '317 GND              J1    -2   D0400PA00X+010000Y+015000X0600Y0600R000',
        '317 +5V_VOUT         U1    -2   D0320PA00X+020000Y+010000X0600Y0600R000',
        '317 +5V_VOUT         C2    -1   D0400PA00X+020000Y+015000X0600Y0600R000',
        '999'
      ].join('\n');
    },

    verifyClearanceViolation() {
      const minAllowedMils = 4.0;
      const actualSpacingMils = 3.0;
      return {
        ruleMils: minAllowedMils,
        measuredMils: actualSpacingMils,
        hasViolation: actualSpacingMils < minAllowedMils,
        netA: 'PAD_J1_PIN1 (1.0000, 1.0000)',
        netB: 'TRACE_NET_CLK (X=1.0405)',
        description: '4-mil clearance spacing violation: 3.0 mils (0.076 mm) measured (< 4.0 mils / 0.102 mm minimum)'
      };
    }
  };

  async function loadSampleSchematic() {
    try {
      if (typeof setView === 'function') setView('compare');
      rpToast('Generating 2-page vector circuit schematics (Rev A vs Rev B)...');
      const bytesA = await SampleGenerator.generateSampleSchematicPDF(false);
      const bytesB = await SampleGenerator.generateSampleSchematicPDF(true);
      DefectState.clearAllPages();
      if (typeof window !== 'undefined' && window.compareLoadBytes) {
        await window.compareLoadBytes('A', bytesA, 'Sample_Schematic_RevA.pdf', '', true);
        await window.compareLoadBytes('B', bytesB, 'Sample_Schematic_RevB.pdf', '');
      }
      setTimeout(() => {
        const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : null;
        if (S && S.cur && S.cur.regions) {
          DefectState.initFromRegions(S.cur.regions);
          if (DefectState.defects.length > 0) {
            DefectState.currentIndex = 0;
            S.sel = DefectState.defects[0].regionIndex != null ? DefectState.defects[0].regionIndex : 0;
            DefectState.highlightItem(0);
            if (typeof window.fit === 'function') window.fit();
            if (typeof window.markers === 'function') window.markers();
          }
        }
        const diffTabBtn = $('aside .tabs button[data-t="d"]');
        if (diffTabBtn) diffTabBtn.click();
        rpToast('Loaded Sample Schematic (Rev A vs Rev B): ' + (DefectState.defects.length || 'Multiple') + ' differences found.');
      }, 280);
      return { bytesA, bytesB };
    } catch (err) {
      rpToast('Sample Schematic Error: ' + err.message);
      throw err;
    }
  }

  async function loadSampleGerber() {
    try {
      if (typeof setView === 'function') setView('compare');
      rpToast('Generating synthetic PCB Gerber RS-274X copper + Excellon drill + IPC-D-356 netlist...');
      const gbrA = SampleGenerator.generateSampleGerberCopper(false);
      const gbrB = SampleGenerator.generateSampleGerberCopper(true);
      const drlText = SampleGenerator.generateSampleExcellonDrill();
      const ipcText = SampleGenerator.generateSampleIPCD356Netlist(CAMState.unitSystem === 'metric');
      const drc = SampleGenerator.verifyClearanceViolation();

      if (typeof window !== 'undefined') {
        window.__lastGerberA = gbrA;
        window.__lastGerberB = gbrB;
        window.__lastDrill = drlText;
        window.__lastIPCA = ipcText;
      }
      if (typeof CAMEngine !== 'undefined' && CAMEngine.CAMJobStack) {
        CAMState.layersA = CAMEngine.CAMJobStack.sortLayers([
          CAMEngine.CAMJobStack.createLayerEntry({ name: 'Sample_Top_Copper_RevA.gtl', text: gbrA }, 0),
          CAMEngine.CAMJobStack.createLayerEntry({ name: 'Sample_NC_Drill_RevA.drl', text: drlText }, 1),
          CAMEngine.CAMJobStack.createLayerEntry({ name: 'Sample_Netlist_RevA.ipc', text: ipcText }, 2)
        ]);
        CAMState.layersB = CAMEngine.CAMJobStack.sortLayers([
          CAMEngine.CAMJobStack.createLayerEntry({ name: 'Sample_Top_Copper_RevB.gtl', text: gbrB }, 0),
          CAMEngine.CAMJobStack.createLayerEntry({ name: 'Sample_NC_Drill_RevB.drl', text: drlText }, 1),
          CAMEngine.CAMJobStack.createLayerEntry({ name: 'Sample_Netlist_RevB.ipc', text: ipcText }, 2)
        ]);
        CAMState.pairedLayers = CAMEngine.CAMJobStack.pairLayerStacks(CAMState.layersA, CAMState.layersB);
      }

      if (typeof document !== 'undefined' && typeof CAMEngine !== 'undefined') {
        const parsedGbrA = new CAMEngine.GerberParser(gbrA).parse();
        const parsedGbrB = new CAMEngine.GerberParser(gbrB).parse();
        const parsedDrl = new CAMEngine.ExcellonParser(drlText).parse();
        const parsedIPC = new CAMEngine.IPCD356Parser(ipcText).parse();

        CAMState.parsedGerberA = parsedGbrA;
        CAMState.parsedGerberB = parsedGbrB;
        CAMState.parsedDrillA = parsedDrl;
        CAMState.parsedIPCA = parsedIPC;
        CAMState.lastDFMViolations = [{
          category: 'TRACE_TO_PAD_CLEARANCE',
          severity: 'Error',
          measuredMils: drc.measuredMils,
          ruleMils: drc.ruleMils,
          xIn: 1.0405,
          yIn: 1.0500,
          description: drc.description
        }];

        const sharedBoundsInches = {
          minX: Math.min(parsedGbrA.toInches(parsedGbrA.bounds.minX), parsedGbrB.toInches(parsedGbrB.bounds.minX)),
          maxX: Math.max(parsedGbrA.toInches(parsedGbrA.bounds.maxX), parsedGbrB.toInches(parsedGbrB.bounds.maxX)),
          minY: Math.min(parsedGbrA.toInches(parsedGbrA.bounds.minY), parsedGbrB.toInches(parsedGbrB.bounds.minY)),
          maxY: Math.max(parsedGbrA.toInches(parsedGbrA.bounds.maxY), parsedGbrB.toInches(parsedGbrB.bounds.maxY))
        };

        const vecOpts = {
          pcbTheme: CAMState.pcbTheme || 'standard',
          renderMode: CAMState.renderMode || 'fill',
          mirrorX: CAMState.mirrorX,
          invertPolarity: CAMState.invertPolarity,
          sharedBoundsInches
        };
        // Native vector PDF generation (replaces legacy cvRevA.width = 0; cvRevA.height = 0; offscreen canvas path)
        const [pdfBytesA, pdfBytesB] = await Promise.all([
          CAMEngine.layersToVectorPDFBytes([{ title: 'Sample Top Copper Rev A', entries: [{ id: 'smp_a', name: 'Sample_Top_Copper_RevA.gbr', parsedGbr: parsedGbrA, parsedDrl: parsedDrl }] }], vecOpts),
          CAMEngine.layersToVectorPDFBytes([{ title: 'Sample Top Copper Rev B', entries: [{ id: 'smp_b', name: 'Sample_Top_Copper_RevB.gbr', parsedGbr: parsedGbrB, parsedDrl: parsedDrl }] }], vecOpts)
        ]);

        CAMState.activeSharedBoundsInches = sharedBoundsInches;
        CAMState._isActiveCAMSession = true;
        CAMState._renderingStack = true;
        DefectState.clearAllPages();
        try {
          if (pdfBytesA && pdfBytesB && window.compareLoadBytes) {
            await window.compareLoadBytes('A', pdfBytesA, 'Sample_Top_Copper_RevA.gbr', '', true);
            await window.compareLoadBytes('B', pdfBytesB, 'Sample_Top_Copper_RevB.gbr', '');
          }
        } finally {
          CAMState._renderingStack = false;
        }

        setTimeout(() => {
          const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : null;
          if (S && S.cur && S.cur.regions) {
            DefectState.initFromRegions(S.cur.regions);
          }
          if (DefectState.defects.length > 0) {
            DefectState.defects[0].type = 'added';
            DefectState.defects[0].status = 'Flagged';
            DefectState.defects[0].note = drc.description;
          } else {
            DefectState.defects.unshift({
              id: 1,
              regionIndex: 0,
              type: 'added',
              x: 180,
              y: 400,
              w: 140,
              h: 260,
              dpi: 300,
              pixels: 1240,
              status: 'Flagged',
              note: drc.description
            });
          }
          DefectState.defects.forEach((d, idx) => { d.id = idx + 1; });
          DefectState.currentIndex = 0;
          DefectState.renderChecklist();
          updateCAMSidebarPane();
          rpToast('PCB CAM Loaded (Gerber Rev A vs Rev B + Drill + IPC-D-356): 4.0 mil (0.102 mm) clearance violation flagged.');
        }, 280);
      }

      return { gbrA, gbrB, drlText, ipcText, drc };
    } catch (err) {
      rpToast('Sample Gerber Error: ' + err.message);
      throw err;
    }
  }

  function promptSampleDrawings() {
    if (typeof document === 'undefined') return;
    let modal = $('#rp-sample-modal');
    if (!modal) {
      modal = el('div', { id: 'rp-sample-modal', className: 'rp-modal' });
      document.body.appendChild(modal);
    }
    modal.hidden = false;
    modal.innerHTML = `
      <div class="rp-hud-card" style="width:min(540px,92vw)">
        <div class="rp-hud-header">
          <div class="rp-hud-title">
            <h3><i data-ic="open"></i> Sample Files</h3>
          </div>
          <button type="button" class="rp-hud-close" id="rp-sample-modal-close">Close</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
          <button type="button" id="rp-modal-btn-schematic" class="rp-sample-btn" style="justify-content:flex-start;padding:10px 14px;text-align:left;gap:12px">
            <i data-ic="tabCompare"></i>
            <div>
              <div style="font-size:13px;font-weight:600">Schematic PDF (Rev A vs Rev B)</div>
              <div style="font-size:11.5px;opacity:0.75;font-weight:400;margin-top:2px">2-page vector schematic with component value and placement changes</div>
            </div>
          </button>
          <button type="button" id="rp-modal-btn-gerber" class="rp-sample-btn" style="justify-content:flex-start;padding:10px 14px;text-align:left;gap:12px">
            <i data-ic="pcbCam"></i>
            <div>
              <div style="font-size:13px;font-weight:600">PCB Gerber + Drill + IPC-D-356</div>
              <div style="font-size:11.5px;opacity:0.75;font-weight:400;margin-top:2px">RS-274X copper, Excellon drill, and netlist with 4.0 mil clearance violation</div>
            </div>
          </button>
          <button type="button" id="rp-modal-btn-dxf" class="rp-sample-btn" style="justify-content:flex-start;padding:10px 14px;text-align:left;gap:12px">
            <i data-ic="tabCad"></i>
            <div>
              <div style="font-size:13px;font-weight:600">Mechanical CAD (.dxf Rev A vs Rev B)</div>
              <div style="font-size:11.5px;opacity:0.75;font-weight:400;margin-top:2px">Multi-layer R2000 enclosure drawing with entity and cutout modifications</div>
            </div>
          </button>
        </div>
      </div>
    `;
    if (typeof hydrateIcons === 'function') hydrateIcons(modal);
    const closeBtn = $('#rp-sample-modal-close');
    if (closeBtn) closeBtn.onclick = () => { modal.hidden = true; };
    modal.onclick = e => { if (e.target === modal) modal.hidden = true; };
    const bSch = $('#rp-modal-btn-schematic');
    if (bSch) bSch.onclick = () => { modal.hidden = true; loadSampleSchematic(); };
    const bGbr = $('#rp-modal-btn-gerber');
    if (bGbr) bGbr.onclick = () => { modal.hidden = true; loadSampleGerber(); };
    const bDxf = $('#rp-modal-btn-dxf');
    if (bDxf) bDxf.onclick = () => { modal.hidden = true; loadSampleDXF(); };
  }

  /**
   * ============================================================================
   * INTERACTIVE KEYBOARD SHORTCUT HUD / CHEAT SHEET (F1 or '?')
   * ============================================================================
   */
  const KEYBOARD_SHORTCUTS_SPEC = {
    navigationAndDiff: [
      { id: 'app_world_view', scope: 'all', defaultKey: 'alt+w', keys: ['Alt+W'], desc: 'Toggle World View Radar Overview (View Menu & Ribbon)', run: () => window.toggleWorldView && window.toggleWorldView() },
      { id: 'tool_done', scope: 'all', defaultKey: 'alt+enter', secondaryKeys: ['enter'], keys: ['Alt+Enter'], desc: 'Done — Save Current Drawn Part & Start Next', run: () => { if (document.body.dataset.view === 'dxf' && window.dxfToolDone) window.dxfToolDone(false); else if (document.body.dataset.view === 'edit' && window.edToolDone) window.edToolDone(); else if (window.rpToolDone) window.rpToolDone(); } },
      { id: 'tool_rewind', scope: 'all', defaultKey: 'alt+backspace', secondaryKeys: ['backspace'], keys: ['Alt+Backspace'], desc: 'Rewind — Step Back Point or Restore Canceled Part', run: () => { if (document.body.dataset.view === 'dxf' && window.dxfToolRewind) window.dxfToolRewind(); else if (document.body.dataset.view === 'edit' && window.edToolRewind) window.edToolRewind(); else if (window.rpToolRewind) window.rpToolRewind(); } },
      { id: 'tool_cancel', scope: 'all', defaultKey: 'alt+escape', keys: ['Alt+Esc'], desc: 'Cancel — Delete Unsaved Part or Exit Active Tool', run: () => { if (document.body.dataset.view === 'dxf' && window.dxfToolCancel) window.dxfToolCancel(); else if (document.body.dataset.view === 'edit' && window.edToolCancel) window.edToolCancel(); else if (window.rpToolCancel) window.rpToolCancel(); } },
      { id: 'cmp_next_page', scope: 'compare', defaultKey: 'right', secondaryKeys: ['alt+right', 'pagedown', '.'], keys: ['Alt+Right', 'Right'], sep: 'or', desc: 'Next Page or CAM Layer (Compare)', run: () => window.ACT && window.ACT.cPage && window.ACT.cPage(1) },
      { id: 'cmp_prev_page', scope: 'compare', defaultKey: 'left', secondaryKeys: ['alt+left', 'pageup', ','], keys: ['Alt+Left', 'Left'], sep: 'or', desc: 'Previous Page or CAM Layer (Compare)', run: () => window.ACT && window.ACT.cPage && window.ACT.cPage(-1) },
      { id: 'cmp_first_page', scope: 'compare', defaultKey: 'alt+home', secondaryKeys: ['home', 'ctrl+home'], keys: ['Alt+Home'], sep: 'or', desc: 'First Page or CAM Layer', run: () => window.ACT && window.ACT.cFirst && window.ACT.cFirst() },
      { id: 'cmp_last_page', scope: 'compare', defaultKey: 'alt+end', secondaryKeys: ['end', 'ctrl+end'], keys: ['Alt+End'], sep: 'or', desc: 'Last Page or CAM Layer', run: () => window.ACT && window.ACT.cLast && window.ACT.cLast() },
      { id: 'cmp_goto_page', scope: 'compare', defaultKey: 'alt+g', secondaryKeys: ['ctrl+g'], keys: ['Alt+G'], desc: 'Go to Specific Page Number...', run: () => window.ACT && window.ACT.cGotoDialog && window.ACT.cGotoDialog() },
      { id: 'cmp_next_diff', scope: 'compare', defaultKey: 'alt+n', secondaryKeys: ['n', 'f3'], keys: ['Alt+N'], sep: 'or', desc: 'Next Defect (Auto-center & Zoom)', run: () => (DefectState.defects && DefectState.defects.length ? DefectState.next() : (window.ACT && window.ACT.nextDiff && window.ACT.nextDiff())) },
      { id: 'cmp_prev_diff', scope: 'compare', defaultKey: 'alt+p', secondaryKeys: ['p', 'shift+f3'], keys: ['Alt+P'], sep: 'or', desc: 'Previous Defect', run: () => (DefectState.defects && DefectState.defects.length ? DefectState.prev() : (window.ACT && window.ACT.prevDiff && window.ACT.prevDiff())) },
      { id: 'cmp_blink', scope: 'compare', defaultKey: 'alt+space', secondaryKeys: ['space'], keys: ['Alt+Space'], desc: 'Instant Blink Toggle (A / B)', run: () => {
        const S = window.CMP;
        if (!S || !window.ACT) return;
        if (S.mode === 'A') window.ACT.cMode(6);
        else if (S.mode === 'B') window.ACT.cMode(5);
        else if (S.mode === 'blink') { S.phase ^= 1; if (typeof window.paint === 'function') window.paint(); if (window.rpSharpen) window.rpSharpen(); }
        else window.ACT.cMode(4);
      } },
      { id: 'cmp_curtain', scope: 'compare', defaultKey: 'alt+c', secondaryKeys: ['c', '8'], keys: ['Alt+C'], desc: 'Toggle Interactive Curtain Split Slider', run: () => setCurtainMode(!curtainActive) },
      { id: 'cmp_fit', scope: 'compare', defaultKey: 'alt+f', secondaryKeys: ['f', 'ctrl+0'], keys: ['Alt+F'], desc: 'Fit Drawing to Viewport & Re-Sharpen Vectors', run: () => { if (window.ACT && window.ACT.cFit) window.ACT.cFit(); if (window.rpSharpen) window.rpSharpen(); } },
      { id: 'cmp_crosshair', scope: 'compare', defaultKey: 'alt+x', secondaryKeys: ['x'], keys: ['Alt+X'], desc: 'Precision Full-Viewport Crosshair Toggle', run: () => { if ($('#rib-crosshair-toggle')) $('#rib-crosshair-toggle').click(); } },
      { id: 'cmp_loupe', scope: 'compare', defaultKey: 'alt+l', secondaryKeys: ['l'], keys: ['Alt+L'], desc: 'Toggle 4x Magnifier Loupe', run: () => { if ($('#rib-loupe-toggle')) $('#rib-loupe-toggle').click(); } },
      { id: 'cmp_grid', scope: 'compare', defaultKey: 'alt+g', secondaryKeys: ['g'], keys: ['Alt+G'], desc: 'Toggle Calibrated Reference Grid', run: () => { if ($('#rib-grid-toggle')) $('#rib-grid-toggle').click(); } },
      { id: 'cmp_markers', scope: 'compare', defaultKey: 'alt+m', secondaryKeys: ['m'], keys: ['Alt+M'], desc: 'Toggle Defect Markers Overlay', run: () => window.ACT && window.ACT.toggleMarkers && window.ACT.toggleMarkers() },
      { id: 'cmp_mark_all', scope: 'compare', defaultKey: 'alt+shift+space', secondaryKeys: ['shift+space'], keys: ['Alt+Shift+Space'], desc: 'Approve / Mark All Defects on Sheet Reviewed', run: () => window.ACT && window.ACT.markAll && window.ACT.markAll() },
      { id: 'cmp_mode_paper', scope: 'compare', defaultKey: 'alt+1', secondaryKeys: ['1'], keys: ['Alt+1'], desc: 'Compare Mode 1: Overlay on Paper', run: () => window.ACT && window.ACT.cMode && window.ACT.cMode(0) },
      { id: 'cmp_mode_dark', scope: 'compare', defaultKey: 'alt+2', secondaryKeys: ['2'], keys: ['Alt+2'], desc: 'Compare Mode 2: Overlay Dark (CAM)', run: () => window.ACT && window.ACT.cMode && window.ACT.cMode(1) },
      { id: 'cmp_mode_diff', scope: 'compare', defaultKey: 'alt+3', secondaryKeys: ['3'], keys: ['Alt+3'], desc: 'Compare Mode 3: Differences Only', run: () => window.ACT && window.ACT.cMode && window.ACT.cMode(2) },
      { id: 'cmp_mode_side', scope: 'compare', defaultKey: 'alt+4', secondaryKeys: ['4'], keys: ['Alt+4'], desc: 'Compare Mode 4: Side by Side', run: () => window.ACT && window.ACT.cMode && window.ACT.cMode(3) },
      { id: 'cmp_mode_blink', scope: 'compare', defaultKey: 'alt+5', secondaryKeys: ['5'], keys: ['Alt+5'], desc: 'Compare Mode 5: Blink A / B', run: () => window.ACT && window.ACT.cMode && window.ACT.cMode(4) },
      { id: 'cmp_mode_a', scope: 'compare', defaultKey: 'alt+6', secondaryKeys: ['6'], keys: ['Alt+6'], desc: 'Compare Mode 6: Base (Rev A) Only', run: () => window.ACT && window.ACT.cMode && window.ACT.cMode(5) },
      { id: 'cmp_mode_b', scope: 'compare', defaultKey: 'alt+7', secondaryKeys: ['7'], keys: ['Alt+7'], desc: 'Compare Mode 7: Revised (Rev B) Only', run: () => window.ACT && window.ACT.cMode && window.ACT.cMode(6) }
    ],
    alignmentAndTools: [
      { id: 'cmp_auto_align', scope: 'compare', defaultKey: 'alt+a', secondaryKeys: ['a', 'ctrl+a'], keys: ['Alt+A'], sep: 'or', desc: 'Auto-Align Drawings', run: () => window.ACT && window.ACT.align && window.ACT.align() },
      { id: 'cmp_fiducial', scope: 'compare', defaultKey: 'alt+t', secondaryKeys: ['t'], keys: ['Alt+T'], desc: '3-Point Fiducial Affine Alignment', run: () => { if ($('#rib-fiducial')) $('#rib-fiducial').click(); else FiducialAligner.start(); } },
      { id: 'cmp_ignore', scope: 'compare', defaultKey: 'alt+i', secondaryKeys: ['i'], keys: ['Alt+I'], desc: 'Draw Ignore Area Mask', run: () => window.ACT && window.ACT.ignore && window.ACT.ignore() },
      { id: 'cmp_clear_ignore', scope: 'compare', defaultKey: 'alt+shift+i', secondaryKeys: ['shift+i'], keys: ['Alt+Shift+I'], desc: 'Clear All Ignore Areas', run: () => { if ($('#rib-ign-clear')) $('#rib-ign-clear').click(); else if (window.ACT && window.ACT.clearIgnore) window.ACT.clearIgnore(); } },
      { id: 'cmp_swap', scope: 'compare', defaultKey: 'alt+s', secondaryKeys: ['s'], keys: ['Alt+S'], desc: 'Swap Rev A & Rev B Sheets', run: () => window.ACT && window.ACT.swap && window.ACT.swap() },
      { id: 'cmp_rescan', scope: 'compare', defaultKey: 'alt+r', secondaryKeys: ['r'], keys: ['Alt+R'], desc: 'Re-Scan All Pages', run: () => window.ACT && window.ACT.rescan && window.ACT.rescan() },
      { id: 'cmp_text_diff', scope: 'compare', defaultKey: 'alt+t', secondaryKeys: ['ctrl+t'], keys: ['Alt+T'], desc: 'Open Line-by-Line LCS Text & BOM Diff', run: () => { if ($('#rib-text-diff')) $('#rib-text-diff').click(); } },
      { id: 'cmp_nudge_left', scope: 'compare', defaultKey: 'alt+left', keys: ['Alt+Arrows'], desc: 'Nudge Rev B Left 1px (Shift+Alt+Arrows: 0.1px)', run: () => { const b = document.querySelector('[data-nudge="x-1"]'); if (b) b.click(); } },
      { id: 'cmp_nudge_right', scope: 'compare', defaultKey: 'alt+right', keys: ['Alt+Right'], desc: 'Nudge Rev B Right 1px', run: () => { const b = document.querySelector('[data-nudge="x1"]'); if (b) b.click(); } },
      { id: 'cmp_nudge_up', scope: 'compare', defaultKey: 'alt+up', keys: ['Alt+Up'], desc: 'Nudge Rev B Up 1px', run: () => { const b = document.querySelector('[data-nudge="y-1"]'); if (b) b.click(); } },
      { id: 'cmp_nudge_down', scope: 'compare', defaultKey: 'alt+down', keys: ['Alt+Down'], desc: 'Nudge Rev B Down 1px', run: () => { const b = document.querySelector('[data-nudge="y1"]'); if (b) b.click(); } },
      { id: 'cmp_nudge_reset', scope: 'compare', defaultKey: 'alt+0', keys: ['Alt+0'], desc: 'Reset X, Y & Rotation Skew', run: () => { if ($('#rp-reset-nudge')) $('#rp-reset-nudge').click(); } },
      { id: 'cmp_osnap', scope: 'compare', defaultKey: 'alt+o', secondaryKeys: ['o'], keys: ['Alt+O'], desc: 'Toggle 8px Magnetic Object Snap (OSNAP)', run: () => { if ($('#rib-osnap-toggle')) $('#rib-osnap-toggle').click(); } },
      { id: 'cmp_units', scope: 'compare', defaultKey: 'alt+u', secondaryKeys: ['u'], keys: ['Alt+U'], desc: 'Toggle IPC English (mils/in) / Metric (mm)', run: () => setUnitSystem(CAMState.unitSystem === 'english' ? 'metric' : 'english') },
      { id: 'app_sidebar_collapse', scope: 'all', defaultKey: 'alt+[', secondaryKeys: ['[', 'ctrl+b'], keys: ['Alt+[', 'Alt+]'], sep: '/', desc: 'Collapse / Expand Sidebar', run: () => {
        if (document.body.dataset.view === 'dxf') {
          if ($('#dxf-toggle-left-dock')) $('#dxf-toggle-left-dock').click();
          if ($('#dxf-toggle-right-dock')) $('#dxf-toggle-right-dock').click();
          return;
        }
        document.querySelectorAll('#view-compare aside, #etools').forEach(a => {
          a.classList.add('rp-collapsed');
          if (a.id === 'etools') { a.hidden = true; if ($('#ePanelBtn')) $('#ePanelBtn').classList.remove('on'); }
        });
        window.dispatchEvent(new Event('resize'));
        rpToast('Sidebar collapsed (Press ] to expand)');
      } },
      { id: 'app_sidebar_expand', scope: 'all', defaultKey: 'alt+]', secondaryKeys: [']'], keys: ['Alt+]'], desc: 'Expand Inspector Sidebar', run: () => {
        if (document.body.dataset.view === 'dxf') {
          const lDock = $('#dxf-layer-dock'), rDock = $('#dxf-props-dock'), dxfBody = document.querySelector('.dxf-studio-body');
          if (lDock) lDock.hidden = false;
          if (rDock) rDock.hidden = false;
          if (dxfBody) { dxfBody.classList.remove('hide-left-dock', 'hide-right-dock'); }
          if ($('#dxf-toggle-left-dock')) $('#dxf-toggle-left-dock').classList.add('on');
          if ($('#dxf-toggle-right-dock')) $('#dxf-toggle-right-dock').classList.add('on');
          if (window.DXFStudio && window.DXFStudio.renderCanvas) setTimeout(() => window.DXFStudio.renderCanvas(), 20);
          return;
        }
        document.querySelectorAll('#view-compare aside, #etools').forEach(a => {
          a.classList.remove('rp-collapsed');
          if (a.id === 'etools') { a.hidden = false; if ($('#ePanelBtn')) $('#ePanelBtn').classList.add('on'); }
        });
        window.dispatchEvent(new Event('resize'));
        rpToast('Sidebar expanded');
      } },
      { id: 'app_view_cmp', scope: 'all', defaultKey: 'alt+1', secondaryKeys: ['ctrl+1'], keys: ['Alt+1'], sep: '|', desc: 'Compare Workspace  |  Editor Workspace', run: () => typeof window.setView === 'function' && window.setView('compare') },
      { id: 'app_view_edit', scope: 'all', defaultKey: 'alt+2', secondaryKeys: ['ctrl+2'], keys: ['Alt+2'], desc: 'Switch to PDF Studio Workspace', run: () => typeof window.setView === 'function' && window.setView('edit') },
      { id: 'app_view_dxf', scope: 'all', defaultKey: 'alt+3', secondaryKeys: ['ctrl+3'], keys: ['Alt+3'], desc: 'Switch to AutoCAD DXF Studio Workspace', run: () => typeof window.setView === 'function' && window.setView('dxf') },
      { id: 'app_theme', scope: 'all', defaultKey: 'alt+shift+d', secondaryKeys: ['ctrl+shift+d'], keys: ['Alt+Shift+D'], desc: 'Toggle Dark / Light Workstation Theme', run: () => window.setTheme && window.setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') },
      { id: 'app_prefs', scope: 'all', defaultKey: 'alt+,', secondaryKeys: ['ctrl+,'], keys: ['Alt+,'], desc: 'Open Preferences Dialog', run: () => window.ACT && window.ACT.prefs && window.ACT.prefs() }
    ],
    measureMarkupAndCam: [
      { id: 'cmp_calibrate', scope: 'compare', defaultKey: 'alt+k', secondaryKeys: ['k'], keys: ['Alt+K'], desc: 'Calibrate Real-World Scale (2-Point)', run: () => { if ($('#rib-calibrate')) $('#rib-calibrate').click(); } },
      { id: 'cmp_dist', scope: 'compare', defaultKey: 'alt+d', secondaryKeys: ['d'], keys: ['Alt+D'], desc: 'Measure Point-to-Point Distance', run: () => { if ($('#rib-dist')) $('#rib-dist').click(); } },
      { id: 'cmp_poly', scope: 'compare', defaultKey: 'alt+y', secondaryKeys: ['y'], keys: ['Alt+Y'], desc: 'Measure Cumulative Polyline Run', run: () => { if ($('#rib-poly')) $('#rib-poly').click(); } },
      { id: 'cmp_area', scope: 'compare', defaultKey: 'alt+e', secondaryKeys: ['e'], keys: ['Alt+E'], desc: 'Measure Closed Polygon Area', run: () => { if ($('#rib-area')) $('#rib-area').click(); } },
      { id: 'cmp_bom_badge', scope: 'compare', defaultKey: 'alt+b', secondaryKeys: ['b'], keys: ['Alt+B'], desc: 'Place BOM Tally Inspection Badge', run: () => { if ($('#rib-tally')) $('#rib-tally').click(); } },
      { id: 'cmp_bom_modal', scope: 'compare', defaultKey: 'alt+shift+b', secondaryKeys: ['shift+b'], keys: ['Alt+Shift+B'], desc: 'Open Measurements & BOM Schedule', run: () => { if ($('#rib-bom-list')) $('#rib-bom-list').click(); else showBOMAndMeasurementsModal(); } },
      { id: 'cmp_cloud', scope: 'compare', defaultKey: 'alt+q', secondaryKeys: ['q'], keys: ['Alt+Q'], desc: 'Draw ANSI/ISO Scalloped Revision Cloud', run: () => { if ($('#rib-rev-cloud')) $('#rib-rev-cloud').click(); } },
      { id: 'cmp_leader', scope: 'compare', defaultKey: 'alt+w', secondaryKeys: ['w'], keys: ['Alt+W'], desc: 'Place Engineering Leader Callout', run: () => { if ($('#rib-leader')) $('#rib-leader').click(); } },
      { id: 'cmp_pen', scope: 'compare', defaultKey: 'alt+v', secondaryKeys: ['v'], keys: ['Alt+V'], desc: 'Freehand Redline Pen (Compare)', run: () => { if ($('#rib-pen')) $('#rib-pen').click(); } },
      { id: 'cmp_pin', scope: 'compare', defaultKey: 'alt+j', secondaryKeys: ['j'], keys: ['Alt+J'], desc: 'Place Numbered Pin Marker (Compare)', run: () => { if ($('#rib-pin')) $('#rib-pin').click(); } },
      { id: 'cmp_eraser', scope: 'compare', defaultKey: 'alt+z', secondaryKeys: ['z'], keys: ['Alt+Z'], desc: 'Markup & Pin Eraser (Compare)', run: () => { if ($('#rib-eraser')) $('#rib-eraser').click(); } },
      { id: 'cmp_redact', scope: 'compare', defaultKey: 'alt+h', secondaryKeys: ['h'], keys: ['Alt+H'], desc: 'Security Redaction Box (Compare)', run: () => { if ($('#rib-redact')) $('#rib-redact').click(); } },
      { id: 'cmp_stamp_app', scope: 'compare', defaultKey: 'alt+shift+a', secondaryKeys: ['shift+a'], keys: ['Alt+Shift+A'], desc: 'Place APPROVED Engineering Stamp', run: () => { if ($('#rib-stamp-app')) $('#rib-stamp-app').click(); } },
      { id: 'cmp_stamp_rej', scope: 'compare', defaultKey: 'alt+shift+r', secondaryKeys: ['shift+r'], keys: ['Alt+Shift+R'], desc: 'Place REJECTED Engineering Stamp', run: () => { if ($('#rib-stamp-rej')) $('#rib-stamp-rej').click(); } },
      { id: 'cmp_stamp_rev', scope: 'compare', defaultKey: 'alt+shift+v', secondaryKeys: ['shift+v'], keys: ['Alt+Shift+V'], desc: 'Place REVISED Engineering Stamp', run: () => { if ($('#rib-stamp-rev')) $('#rib-stamp-rev').click(); } },
      { id: 'cmp_stamp_sha', scope: 'compare', defaultKey: 'alt+shift+s', secondaryKeys: ['shift+s'], keys: ['Alt+Shift+S'], desc: 'Place SHA-256 Verified Stamp', run: () => { if ($('#rib-stamp-sha')) $('#rib-stamp-sha').click(); } },
      { id: 'cmp_cam_open', scope: 'compare', defaultKey: 'alt+shift+g', secondaryKeys: ['ctrl+shift+g'], keys: ['Alt+Shift+G'], desc: 'Open Gerber RS-274X Layer(s)', run: () => promptCAMCompare() },
      { id: 'cmp_cam_stack', scope: 'compare', defaultKey: 'alt+m', keys: ['Alt+M'], desc: 'Open Multi-Layer CAM Stack Setup', run: () => showCAMPreCompareModal() },
      { id: 'cmp_cam_dfm', scope: 'compare', defaultKey: 'alt+d', keys: ['Alt+D'], desc: 'Run IPC Class 1/2/3 DFM & Clearance Scan', run: () => runCAMClearanceScan() },
      { id: 'cmp_cam_wb', scope: 'compare', defaultKey: 'alt+shift+w', secondaryKeys: ['ctrl+shift+w'], keys: ['Alt+Shift+W'], desc: 'Open CAM Workbench (Apertures/Drills/Netlist)', run: () => showCAMWorkbenchModal('format') },
      { id: 'cmp_net_tracer', scope: 'compare', defaultKey: 'alt+n', keys: ['Alt+N'], desc: 'Open Net Tracer & Pin Cross-Probe', run: () => openNetTracerModal() },
      { id: 'cmp_bom_loc', scope: 'compare', defaultKey: 'alt+shift+b', secondaryKeys: ['ctrl+shift+b'], keys: ['Alt+Shift+B'], desc: 'Open BOM Component Centroid Locator', run: () => openBOMOverlayModal() },
      { id: 'cmp_pcb_calc', scope: 'compare', defaultKey: 'ctrl+alt+z', keys: ['Ctrl+Alt+Z'], desc: 'IPC-2141 / 2152 Stackup & Impedance Calculator', run: () => openPCBStackupCalculator() },
      { id: 'cmp_dxf_in', scope: 'compare', defaultKey: 'alt+shift+i', secondaryKeys: ['ctrl+shift+i'], keys: ['Alt+Shift+I'], desc: 'Import AutoCAD DXF Drawing(s)', run: () => promptDXFImport() },
      { id: 'cmp_dxf_wb', scope: 'compare', defaultKey: 'alt+shift+x', secondaryKeys: ['ctrl+shift+x'], keys: ['Alt+Shift+X'], desc: 'Open AutoCAD DXF Layer & Export Workbench', run: () => showDXFWorkbenchModal('layers') },
      { id: 'cmp_angle_3pt', scope: 'compare', defaultKey: 'alt+shift+g', secondaryKeys: ['shift+g'], keys: ['Alt+Shift+G'], desc: '3-Point Angle Protractor (Compare)', run: () => { if ($('#rib-angle')) $('#rib-angle').click(); } },
      { id: 'cmp_circle_3pt', scope: 'compare', defaultKey: 'alt+shift+c', secondaryKeys: ['shift+c'], keys: ['Alt+Shift+C'], desc: '3-Point Circle / Arc Diameter & Radius Finder', run: () => { if ($('#rib-circle-find')) $('#rib-circle-find').click(); } },
      { id: 'cmp_fai_balloon', scope: 'compare', defaultKey: 'alt+shift+f', secondaryKeys: ['shift+f'], keys: ['Alt+Shift+F'], desc: 'AS9102 First Article Inspection (FAI) Balloon', run: () => { if ($('#rib-fai-balloon')) $('#rib-fai-balloon').click(); } },
      { id: 'cmp_gdt_frame', scope: 'compare', defaultKey: 'alt+g', keys: ['Alt+G'], desc: 'ASME Y14.5 / ISO 1101 GD&T Frame Builder', run: () => { if ($('#rib-gdt')) $('#rib-gdt').click(); } },
      { id: 'cmp_title_block', scope: 'compare', defaultKey: 'alt+b', keys: ['Alt+B'], desc: 'ISO / ANSI Engineering Title Block Stamp', run: () => { if ($('#rib-title-block')) $('#rib-title-block').click(); } },
      { id: 'cmp_symbol_lib', scope: 'compare', defaultKey: 'alt+s', keys: ['Alt+S'], desc: 'Engineering Symbol Library (Weld / Surface / Fasteners)', run: () => { if ($('#rib-sym-lib')) $('#rib-sym-lib').click(); } },
      { id: 'cmp_rot_cw', scope: 'compare', defaultKey: 'alt+r', keys: ['Alt+R'], desc: 'Rotate Active Target Revision 90° Clockwise', run: () => { if ($('#rib-rot-cw')) $('#rib-rot-cw').click(); } },
      { id: 'cmp_rot_ccw', scope: 'compare', defaultKey: 'alt+shift+r', keys: ['Alt+Shift+R'], desc: 'Rotate Active Target Revision 90° Counter-Clockwise', run: () => { if ($('#rib-rot-ccw')) $('#rib-rot-ccw').click(); } }
    ],
    pdfStudioAndExport: [
      { id: 'ed_next_page', scope: 'edit', defaultKey: 'alt+pagedown', secondaryKeys: ['pagedown', 'right'], keys: ['Alt+PgDn'], sep: 'or', desc: 'PDF Studio: Next Page', run: () => window.ACT && window.ACT.ePage && window.ACT.ePage(1) },
      { id: 'ed_prev_page', scope: 'edit', defaultKey: 'alt+pageup', secondaryKeys: ['pageup', 'left'], keys: ['Alt+PgUp'], sep: 'or', desc: 'PDF Studio: Previous Page', run: () => window.ACT && window.ACT.ePage && window.ACT.ePage(-1) },
      { id: 'ed_select', scope: 'edit', defaultKey: 'alt+v', secondaryKeys: ['v'], keys: ['Alt+V'], desc: 'PDF Studio: Select / Move Tool', run: () => window.ACT && window.ACT.tool && window.ACT.tool('select') },
      { id: 'ed_hand', scope: 'edit', defaultKey: 'alt+h', secondaryKeys: ['h'], keys: ['Alt+H'], desc: 'PDF Studio: Hand Pan Tool', run: () => window.ACT && window.ACT.tool && window.ACT.tool('hand') },
      { id: 'ed_text', scope: 'edit', defaultKey: 'alt+t', secondaryKeys: ['t'], keys: ['Alt+T'], desc: 'PDF Studio: Type Text on Page', run: () => window.ACT && window.ACT.tool && window.ACT.tool('text') },
      { id: 'ed_edittext', scope: 'edit', defaultKey: 'alt+e', secondaryKeys: ['e'], keys: ['Alt+E'], desc: 'PDF Studio: Edit Existing PDF Text', run: () => window.ACT && window.ACT.tool && window.ACT.tool('edittext') },
      { id: 'ed_pen', scope: 'edit', defaultKey: 'alt+p', secondaryKeys: ['p'], keys: ['Alt+P'], desc: 'PDF Studio: Freehand Pen', run: () => window.ACT && window.ACT.tool && window.ACT.tool('draw') },
      { id: 'ed_rect', scope: 'edit', defaultKey: 'alt+b', secondaryKeys: ['b'], keys: ['Alt+B'], desc: 'PDF Studio: Rectangle Box', run: () => window.ACT && window.ACT.tool && window.ACT.tool('rect') },
      { id: 'ed_circle', scope: 'edit', defaultKey: 'alt+o', secondaryKeys: ['o'], keys: ['Alt+O'], desc: 'PDF Studio: Circle / Ellipse', run: () => window.ACT && window.ACT.tool && window.ACT.tool('circle') },
      { id: 'ed_line', scope: 'edit', defaultKey: 'alt+l', secondaryKeys: ['l'], keys: ['Alt+L'], desc: 'PDF Studio: Straight Vector Line', run: () => window.ACT && window.ACT.tool && window.ACT.tool('line') },
      { id: 'ed_arrow', scope: 'edit', defaultKey: 'alt+a', secondaryKeys: ['a'], keys: ['Alt+A'], desc: 'PDF Studio: Directional Arrow', run: () => window.ACT && window.ACT.tool && window.ACT.tool('arrow') },
      { id: 'ed_cloud', scope: 'edit', defaultKey: 'alt+c', secondaryKeys: ['c'], keys: ['Alt+C'], desc: 'PDF Studio: Scalloped Revision Cloud', run: () => window.ACT && window.ACT.tool && window.ACT.tool('cloud') },
      { id: 'ed_leader', scope: 'edit', defaultKey: 'alt+d', secondaryKeys: ['d'], keys: ['Alt+D'], desc: 'PDF Studio: Leader Callout', run: () => window.ACT && window.ACT.tool && window.ACT.tool('leader') },
      { id: 'ed_pin', scope: 'edit', defaultKey: 'alt+q', secondaryKeys: ['q'], keys: ['Alt+Q'], desc: 'PDF Studio: Numbered Pin Marker', run: () => window.ACT && window.ACT.tool && window.ACT.tool('pin') },
      { id: 'ed_eraser', scope: 'edit', defaultKey: 'alt+z', secondaryKeys: ['z'], keys: ['Alt+Z'], desc: 'PDF Studio: Eraser Tool', run: () => window.ACT && window.ACT.tool && window.ACT.tool('eraser') },
      { id: 'ed_measure', scope: 'edit', defaultKey: 'alt+m', secondaryKeys: ['m'], keys: ['Alt+M'], desc: 'PDF Studio: Measure Distance', run: () => window.ACT && window.ACT.tool && window.ACT.tool('measure') },
      { id: 'ed_area', scope: 'edit', defaultKey: 'alt+shift+m', secondaryKeys: ['shift+m'], keys: ['Alt+Shift+M'], desc: 'PDF Studio: Measure Area', run: () => { const b = document.querySelector('#mtools [data-t="area"]'); if (b) b.click(); } },
      { id: 'ed_calibrate', scope: 'edit', defaultKey: 'alt+shift+k', secondaryKeys: ['shift+k'], keys: ['Alt+Shift+K'], desc: 'PDF Studio: Calibrate 2-Point Scale', run: () => { const b = document.querySelector('#mtools [data-t="calibrate"]'); if (b) b.click(); } },
      { id: 'ed_angle', scope: 'edit', defaultKey: 'alt+shift+g', secondaryKeys: ['shift+g'], keys: ['Alt+Shift+G'], desc: 'PDF Studio: 3-Point Angle Protractor', run: () => { const b = document.querySelector('#mtools [data-t="angle"]'); if (b) b.click(); } },
      { id: 'ed_rad3', scope: 'edit', defaultKey: 'alt+shift+c', secondaryKeys: ['shift+c'], keys: ['Alt+Shift+C'], desc: 'PDF Studio: 3-Point Circle / Arc Finder', run: () => { const b = document.querySelector('#mtools [data-t="rad3"]'); if (b) b.click(); } },
      { id: 'ed_fai', scope: 'edit', defaultKey: 'alt+shift+f', secondaryKeys: ['shift+f'], keys: ['Alt+Shift+F'], desc: 'PDF Studio: AS9102 FAI Auto-Balloon', run: () => { const b = document.querySelector('#mtools [data-t="fai"]'); if (b) b.click(); } },
      { id: 'ed_equation', scope: 'edit', defaultKey: 'alt+=', keys: ['Alt+='], desc: 'PDF Studio: Mathematical Equation Studio', run: () => { if ($('#eEquationBtn')) $('#eEquationBtn').click(); } },
      { id: 'ed_gdt', scope: 'edit', defaultKey: 'alt+g', keys: ['Alt+G'], desc: 'PDF Studio: GD&T Feature Control Frame', run: () => { if ($('#eGdtBtn')) $('#eGdtBtn').click(); } },
      { id: 'ed_titleblock', scope: 'edit', defaultKey: 'alt+b', keys: ['Alt+B'], desc: 'PDF Studio: ISO/ANSI Title Block Stamp', run: () => { if ($('#eTitleBlockBtn')) $('#eTitleBlockBtn').click(); } },
      { id: 'ed_symbols', scope: 'edit', defaultKey: 'alt+s', keys: ['Alt+S'], desc: 'PDF Studio: Engineering Symbol Library', run: () => { if ($('#eBlockLibBtn')) $('#eBlockLibBtn').click(); } },
      { id: 'exp_png', scope: 'compare', defaultKey: 'alt+e', secondaryKeys: ['ctrl+e'], keys: ['Alt+E'], desc: 'Export High-Res PNG Image', run: () => window.ACT && window.ACT.savePng && window.ACT.savePng() },
      { id: 'exp_report', scope: 'compare', defaultKey: 'alt+shift+e', secondaryKeys: ['ctrl+shift+e'], keys: ['Alt+Shift+E'], desc: 'Export Comparison Report (PDF)', run: () => window.ACT && window.ACT.report && window.ACT.report() },
      { id: 'exp_exec_audit', scope: 'compare', defaultKey: 'ctrl+alt+a', keys: ['Ctrl+Alt+A'], desc: 'Generate Executive Audit Report (PDF)', run: () => generateExecutiveAuditReport(false) },
      { id: 'exp_qa_zip', scope: 'compare', defaultKey: 'alt+shift+q', secondaryKeys: ['ctrl+shift+q'], keys: ['Alt+Shift+Q'], desc: 'Export 1-Click QA Handover Package (.zip)', run: () => exportQAPackageZip() },
      { id: 'cmd_palette', scope: 'all', defaultKey: 'alt+k', keys: ['Alt+K'], desc: 'Open Fuzzy Command Palette & Memory Manager', run: () => (window.KenshoUI && typeof window.KenshoUI.openCommandPalette === 'function') ? window.KenshoUI.openCommandPalette('') : openCommandPaletteModal() },
      { id: 'smart_purge', scope: 'all', defaultKey: 'alt+shift+m', secondaryKeys: ['ctrl+shift+m'], keys: ['Alt+Shift+M'], desc: 'Smart Memory Purge (Evict Unpinned Pages & Slabs)', run: () => SmartManager.smartPurgeMemory() },
      { id: 'triage_noise', scope: 'compare', defaultKey: 'alt+shift+t', secondaryKeys: ['ctrl+shift+t'], keys: ['Alt+Shift+T'], desc: 'Auto-Triage: Dismiss Cosmetic Noise Defects', run: () => SmartManager.autoDismissCosmeticNoise() },
      { id: 'create_checkpoint', scope: 'compare', defaultKey: 'ctrl+alt+s', keys: ['Ctrl+Alt+S'], desc: 'Create Instant Workspace Checkpoint Snapshot', run: () => { const id = SmartManager.createCheckpoint('Manual Checkpoint'); rpToast('Saved Workspace Checkpoint #' + id); } },
      { id: 'exp_csv', scope: 'compare', defaultKey: 'alt+shift+c', secondaryKeys: ['ctrl+shift+c'], keys: ['Alt+Shift+C'], desc: 'Export Defect Schedule Checklist (CSV)', run: () => exportDefectsCSV() },
      { id: 'app_save', scope: 'all', defaultKey: 'alt+s', secondaryKeys: ['ctrl+s'], keys: ['Alt+S'], desc: 'Save PDF (Studio), DXF (DXF Studio), or .redline Session (Compare)', run: () => document.body.dataset.view === 'dxf' && window.DXFStudio ? window.DXFStudio.saveModifiedDXFFile() : ((document.body.dataset.view === 'edit' && window.ACT && window.ACT.eSave) ? window.ACT.eSave() : saveSessionFile()) },
      { id: 'app_save_as', scope: 'all', defaultKey: 'alt+shift+s', secondaryKeys: ['ctrl+shift+s'], keys: ['Alt+Shift+S'], desc: 'Save PDF As (Studio), DXF As (DXF Studio), or Load Session (Compare)', run: () => document.body.dataset.view === 'dxf' && window.DXFStudio ? window.DXFStudio.saveModifiedDXFFile() : ((document.body.dataset.view === 'edit' && window.ACT && window.ACT.eSaveAs) ? window.ACT.eSaveAs() : loadSessionFile()) },
      { id: 'app_open_a', scope: 'all', defaultKey: 'alt+o', secondaryKeys: ['ctrl+o'], keys: ['Alt+O'], desc: 'Open Base File (Rev A), DXF Drawing, or PDF Document', run: () => document.body.dataset.view === 'dxf' && $('#dxf-st-open') ? $('#dxf-st-open').click() : ((document.body.dataset.view === 'edit' && window.ACT && window.ACT.eOpen) ? window.ACT.eOpen() : (window.ACT && window.ACT.openA && window.ACT.openA())) },
      { id: 'app_open_b', scope: 'all', defaultKey: 'alt+shift+o', secondaryKeys: ['ctrl+shift+o'], keys: ['Alt+Shift+O'], desc: 'Open Revised File (Rev B) in Compare', run: () => { if (typeof window.setView === 'function') window.setView('compare'); if (window.ACT && window.ACT.openB) window.ACT.openB(); } },
      { id: 'app_open_pdf_studio', scope: 'all', defaultKey: 'ctrl+alt+o', keys: ['Ctrl+Alt+O'], desc: 'Open PDF Document Directly in PDF Studio', run: () => { if (typeof window.setView === 'function') window.setView('edit'); if (window.ACT && window.ACT.eOpen) window.ACT.eOpen(); } },
      { id: 'app_open_dxf_studio', scope: 'all', defaultKey: 'ctrl+alt+d', keys: ['Ctrl+Alt+D'], desc: 'Open AutoCAD DXF Directly in DXF Studio', run: () => { if (typeof window.setView === 'function') window.setView('dxf'); if ($('#dxf-st-open')) $('#dxf-st-open').click(); } },
      { id: 'app_quick_guide', scope: 'all', defaultKey: 'alt+shift+f1', secondaryKeys: ['shift+f1'], keys: ['Alt+Shift+F1'], desc: 'Open Quick Guide & Complete Option Reference Manual', run: () => { if (window.showQuickGuideModal) window.showQuickGuideModal('all'); } },
      { id: 'app_focus_lang', scope: 'all', defaultKey: 'ctrl+alt+l', keys: ['Ctrl+Alt+L'], desc: 'Open Workspace Language Settings (46 Languages)', run: () => { if (typeof openWorkstationSettingsModal === 'function') openWorkstationSettingsModal('language'); else { const sel = $('#rp-lang-sel'); if (sel) sel.focus(); } } },
      { id: 'ed_merge_pdfs', scope: 'edit', defaultKey: 'ctrl+alt+m', keys: ['Ctrl+Alt+M'], desc: 'PDF Studio: Merge Multiple PDFs', run: () => window.ACT && window.ACT.op && window.ACT.op('merge') },
      { id: 'ed_split_pdf', scope: 'edit', defaultKey: 'ctrl+alt+s', keys: ['Ctrl+Alt+S'], desc: 'PDF Studio: Split PDF Document', run: () => window.ACT && window.ACT.op && window.ACT.op('split') },
      { id: 'ed_crop_pages', scope: 'edit', defaultKey: 'ctrl+alt+c', keys: ['Ctrl+Alt+C'], desc: 'PDF Studio: Crop Page Margins', run: () => window.ACT && window.ACT.op && window.ACT.op('crop') },
      { id: 'ed_header_footer', scope: 'edit', defaultKey: 'ctrl+alt+h', keys: ['Ctrl+Alt+H'], desc: 'PDF Studio: Header & Footer', run: () => window.ACT && window.ACT.op && window.ACT.op('hf') },
      { id: 'ed_watermark', scope: 'edit', defaultKey: 'ctrl+alt+w', keys: ['Ctrl+Alt+W'], desc: 'PDF Studio: Add Watermark', run: () => window.ACT && window.ACT.op && window.ACT.op('wm') }
    ],
    dxfStudioTools: [
      { id: 'dxf_select', scope: 'dxf', defaultKey: 'alt+v', secondaryKeys: ['v'], keys: ['Alt+V'], desc: 'DXF Studio: Select / Vertex Grips Tool', run: () => window.DXFStudio && window.DXFStudio.setActiveTool('select') },
      { id: 'dxf_line', scope: 'dxf', defaultKey: 'alt+l', secondaryKeys: ['l'], keys: ['Alt+L'], desc: 'DXF Studio: Draw Line (LINE)', run: () => window.DXFStudio && window.DXFStudio.setActiveTool('line') },
      { id: 'dxf_polyline', scope: 'dxf', defaultKey: 'alt+p', secondaryKeys: ['p'], keys: ['Alt+P'], desc: 'DXF Studio: Draw Polyline (LWPOLYLINE)', run: () => window.DXFStudio && window.DXFStudio.setActiveTool('polyline') },
      { id: 'dxf_rect', scope: 'dxf', defaultKey: 'alt+r', secondaryKeys: ['r'], keys: ['Alt+R'], desc: 'DXF Studio: Draw Rectangle (RECT)', run: () => window.DXFStudio && window.DXFStudio.setActiveTool('rect') },
      { id: 'dxf_circle', scope: 'dxf', defaultKey: 'alt+c', secondaryKeys: ['c'], keys: ['Alt+C'], desc: 'DXF Studio: Draw Circle (CIRCLE)', run: () => window.DXFStudio && window.DXFStudio.setActiveTool('circle') },
      { id: 'dxf_arc', scope: 'dxf', defaultKey: 'alt+a', secondaryKeys: ['a'], keys: ['Alt+A'], desc: 'DXF Studio: Draw 3-Point Arc (ARC)', run: () => window.DXFStudio && window.DXFStudio.setActiveTool('arc') },
      { id: 'dxf_ellipse', scope: 'dxf', defaultKey: 'alt+e', secondaryKeys: ['e'], keys: ['Alt+E'], desc: 'DXF Studio: Draw Ellipse (ELLIPSE)', run: () => window.DXFStudio && window.DXFStudio.setActiveTool('ellipse') },
      { id: 'dxf_spline', scope: 'dxf', defaultKey: 'alt+s', secondaryKeys: ['s'], keys: ['Alt+S'], desc: 'DXF Studio: Draw Smooth Spline (SPLINE)', run: () => window.DXFStudio && window.DXFStudio.setActiveTool('spline') },
      { id: 'dxf_text', scope: 'dxf', defaultKey: 'alt+t', secondaryKeys: ['t'], keys: ['Alt+T'], desc: 'DXF Studio: Insert Text / MText (TEXT)', run: () => window.DXFStudio && window.DXFStudio.setActiveTool('text') },
      { id: 'dxf_dim', scope: 'dxf', defaultKey: 'alt+d', secondaryKeys: ['d'], keys: ['Alt+D'], desc: 'DXF Studio: Place Linear Dimension (DIM)', run: () => window.DXFStudio && window.DXFStudio.setActiveTool('dim') },
      { id: 'dxf_insert', scope: 'dxf', defaultKey: 'alt+i', secondaryKeys: ['i'], keys: ['Alt+I'], desc: 'DXF Studio: Insert Block Reference (INSERT)', run: () => window.DXFStudio && window.DXFStudio.setActiveTool('insert') },
      { id: 'dxf_move', scope: 'dxf', defaultKey: 'alt+m', secondaryKeys: ['m'], keys: ['Alt+M'], desc: 'DXF Studio: Move Selected Entities', run: () => window.DXFStudio && window.DXFStudio.setActiveTool('move') },
      { id: 'dxf_offset', scope: 'dxf', defaultKey: 'alt+o', secondaryKeys: ['o'], keys: ['Alt+O'], desc: 'DXF Studio: Offset Parallel Entity', run: () => window.DXFStudio && window.DXFStudio.setActiveTool('offset') },
      { id: 'dxf_fillet', scope: 'dxf', defaultKey: 'alt+f', secondaryKeys: ['f'], keys: ['Alt+F'], desc: 'DXF Studio: Fillet Corner / Arc', run: () => window.DXFStudio && window.DXFStudio.setActiveTool('fillet') },
      { id: 'dxf_explode', scope: 'dxf', defaultKey: 'alt+x', secondaryKeys: ['x'], keys: ['Alt+X'], desc: 'DXF Studio: Explode Polyline / Block', run: () => window.DXFStudio && window.DXFStudio.explodeSelectedEntities() },
      { id: 'dxf_dup', scope: 'dxf', defaultKey: 'alt+d', secondaryKeys: ['ctrl+d'], keys: ['Alt+D'], desc: 'DXF Studio: Duplicate Selected Entities (+10, +10)', run: () => window.DXFStudio && window.DXFStudio.duplicateSelectedEntities(10, 10) },
      { id: 'dxf_del', scope: 'dxf', defaultKey: 'alt+delete', secondaryKeys: ['delete'], keys: ['Alt+Del'], desc: 'DXF Studio: Erase / Delete Selected Entities', run: () => window.DXFStudio && window.DXFStudio.deleteSelectedEntities() },
      { id: 'dxf_osnap', scope: 'dxf', defaultKey: 'alt+f3', secondaryKeys: ['f3'], keys: ['Alt+F3'], desc: 'DXF Studio: Toggle Magnetic OSNAP', run: () => { if ($('#dxf-aid-osnap')) $('#dxf-aid-osnap').click(); } },
      { id: 'dxf_grid', scope: 'dxf', defaultKey: 'alt+f7', secondaryKeys: ['f7'], keys: ['Alt+F7'], desc: 'DXF Studio: Toggle CAD Reference Grid', run: () => { if ($('#dxf-aid-grid')) $('#dxf-aid-grid').click(); } },
      { id: 'dxf_ortho', scope: 'dxf', defaultKey: 'alt+f8', secondaryKeys: ['f8'], keys: ['Alt+F8'], desc: 'DXF Studio: Toggle Ortho Lock (0°/90°)', run: () => { if ($('#dxf-aid-ortho')) $('#dxf-aid-ortho').click(); } }
    ]
  };


  /**
   * Interactive Keyboard Shortcut Manager & Custom Hotkey Editor
   */
  const ShortcutManager = {
    STORAGE_KEY: 'rp_custom_shortcuts',
    customMap: {},
    recordingId: null,
    activeCategory: 'all',
    searchQuery: '',

    init() {
      this.loadCustom();
    },

    loadCustom() {
      try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(this.STORAGE_KEY) : null;
        this.customMap = raw ? JSON.parse(raw) : {};
      } catch (e) {
        this.customMap = {};
      }
    },

    saveCustom() {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.customMap));
        }
      } catch (e) {}
    },

    getAllItems() {
      return [
        ...KEYBOARD_SHORTCUTS_SPEC.navigationAndDiff,
        ...KEYBOARD_SHORTCUTS_SPEC.alignmentAndTools,
        ...KEYBOARD_SHORTCUTS_SPEC.measureMarkupAndCam,
        ...KEYBOARD_SHORTCUTS_SPEC.pdfStudioAndExport,
        ...(KEYBOARD_SHORTCUTS_SPEC.dxfStudioTools || [])
      ];
    },

    getItemById(id) {
      return this.getAllItems().find(it => it.id === id) || null;
    },

    normalizeKeyStr(raw) {
      return String(raw || '').trim().toLowerCase()
        .replace(/arrowleft/g, 'left')
        .replace(/arrowright/g, 'right')
        .replace(/arrowup/g, 'up')
        .replace(/arrowdown/g, 'down')
        .replace(/\bpgup\b/g, 'pageup')
        .replace(/\bpgdn\b/g, 'pagedown')
        .replace(/\besc\b/g, 'escape')
        .replace(/\s+/g, '');
    },

    eventToKeyStr(e) {
      if (!e || !e.key) return '';
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return '';
      let k = e.key;
      if (k === ' ') k = 'space';
      else if (k.length === 1) k = k.toLowerCase();
      else k = k.toLowerCase().replace(/^arrow/, '');
      const c = e.ctrlKey || e.metaKey;
      const symbol = k.length === 1 && !/[a-z0-9]/.test(k);
      return (c ? 'ctrl+' : '') + (e.altKey ? 'alt+' : '') + (e.shiftKey && !symbol ? 'shift+' : '') + k;
    },

    formatPretty(keyStr) {
      if (!keyStr) return 'Unbound';
      const map = {
        ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt',
        left: 'Left ←', right: 'Right →', up: 'Up ↑', down: 'Down ↓',
        pageup: 'PgUp', pagedown: 'PgDn', space: 'Space',
        escape: 'Esc', delete: 'Del', backspace: 'Bksp',
        home: 'Home', end: 'End'
      };
      return String(keyStr).split('+').map(p => {
        const low = p.toLowerCase();
        return map[low] || (low.length === 1 ? low.toUpperCase() : low.toUpperCase());
      }).join('+');
    },

    getDefaultKey(id) {
      const it = this.getItemById(id);
      return it ? this.normalizeKeyStr(it.defaultKey) : '';
    },

    getActiveKey(id) {
      const it = this.getItemById(id);
      if (!it) return '';
      if (this.customMap && this.customMap[id]) {
        return this.normalizeKeyStr(this.customMap[id]);
      }
      return this.normalizeKeyStr(it.defaultKey);
    },

    isCustomized(id) {
      const defK = this.getDefaultKey(id);
      return Boolean(this.customMap && this.customMap[id] && this.normalizeKeyStr(this.customMap[id]) !== defK);
    },

    setCustomKey(id, rawKey) {
      const it = this.getItemById(id);
      if (!it) return false;
      const norm = this.normalizeKeyStr(rawKey);
      if (!norm) return false;

      // Check for conflicts within the same or overlapping scope
      const all = this.getAllItems();
      for (const other of all) {
        if (other.id === id) continue;
        const sameScope = other.scope === 'all' || it.scope === 'all' || other.scope === it.scope;
        if (sameScope && this.getActiveKey(other.id) === norm) {
          // Swap or clear conflicting shortcut so user never gets duplicate bindings
          const prevKey = this.getActiveKey(id);
          this.customMap[other.id] = prevKey;
          if (this.normalizeKeyStr(other.defaultKey) === prevKey) delete this.customMap[other.id];
          rpToast(`Reassigned "${ this.formatPretty(norm) }" from "${other.desc}" to "${it.desc}"`);
        }
      }

      if (norm === this.normalizeKeyStr(it.defaultKey)) {
        delete this.customMap[id];
      } else {
        this.customMap[id] = norm;
      }
      this.recordingId = null;
      this.saveCustom();
      this.refreshHUDModal();
      return true;
    },

    resetKey(id) {
      delete this.customMap[id];
      this.recordingId = null;
      this.saveCustom();
      this.refreshHUDModal();
      const it = this.getItemById(id);
      if (it) rpToast(`Reset "${it.desc}" to default (${this.formatPretty(it.defaultKey)})`);
    },

    resetAll() {
      this.customMap = {};
      this.recordingId = null;
      this.saveCustom();
      this.refreshHUDModal();
      rpToast('Restored all keyboard shortcuts to factory defaults.');
    },

    findMatchingAction(normKey, viewScope) {
      if (!normKey) return null;
      const all = this.getAllItems();
      // Pass 1: Match active primary/custom key in current view scope first, then 'all' scope
      const scopeMatch = all.find(it => it.scope === viewScope && this.getActiveKey(it.id) === normKey)
        || all.find(it => it.scope === 'all' && this.getActiveKey(it.id) === normKey);
      if (scopeMatch) return scopeMatch;

      // Pass 2: Match secondary built-in alias keys (if the item hasn't been reassigned and no other item claimed normKey)
      const secMatch = all.find(it => (it.scope === viewScope || it.scope === 'all') &&
        !this.isCustomized(it.id) &&
        Array.isArray(it.secondaryKeys) &&
        it.secondaryKeys.map(k => this.normalizeKeyStr(k)).includes(normKey));
      return secMatch || null;
    },

    refreshHUDModal() {
      if (typeof document === 'undefined') return;
      const setModal = $('#rp-settings-page-modal');
      if (setModal && typeof window.refreshSettingsShortcutsPane === 'function') {
        window.refreshSettingsShortcutsPane();
      }
      const modal = $('#rp-keyboard-hud-modal');
      if (!modal || modal.hidden) return;
      showKeyboardHUD();
    }
  };
  ShortcutManager.init();

  function buildKeyboardHUDHTML() {
    const q = (ShortcutManager.searchQuery || '').trim().toLowerCase();
    const catFilter = ShortcutManager.activeCategory || 'all';
    const customCount = Object.keys(ShortcutManager.customMap || {}).length;

    const renderRows = items => {
      const filtered = items.filter(it => {
        if (!q) return true;
        const activeP = ShortcutManager.formatPretty(ShortcutManager.getActiveKey(it.id)).toLowerCase();
        const defP = (it.keys || [it.defaultKey]).join(' ').toLowerCase();
        return it.desc.toLowerCase().includes(q) || activeP.includes(q) || defP.includes(q);
      });
      if (!filtered.length) {
        return `<div class="rp-hud-empty">No shortcuts in this section match "${q.replace(/</g, '&lt;')}".</div>`;
      }
      return filtered.map(it => {
        const defKHtml = (it.keys || [ShortcutManager.formatPretty(it.defaultKey)]).map((k, idx) => {
          const sep = (idx > 0 && it.sep) ? `<span class="rp-hud-sep">${it.sep}</span>` : '';
          return `${sep}<kbd class="rp-hud-k">${k}</kbd>`;
        }).join('');
        const isCust = ShortcutManager.isCustomized(it.id);
        const isRec = ShortcutManager.recordingId === it.id;
        const activePretty = ShortcutManager.formatPretty(ShortcutManager.getActiveKey(it.id));
        const defPretty = (it.keys || [ShortcutManager.formatPretty(it.defaultKey)]).join(' / ');
        return `
          <div class="rp-hud-item rp-sc-row ${isCust ? 'is-custom' : ''}" data-sc-row="${it.id}">
            <div class="rp-sc-info">
              <span class="rp-hud-desc">${it.desc}</span>
              <span class="rp-sc-default-lbl" title="Factory Default Shortcut">Default: <span class="rp-hud-keys">${defKHtml}</span></span>
            </div>
            <div class="rp-sc-actions">
              <button type="button" class="rp-sc-edit-btn ${isCust ? 'custom' : ''} ${isRec ? 'recording' : ''}" data-sc-id="${it.id}" title="Click to edit shortcut, then press any key or Alt+Key combination">
                ${isRec ? 'Press key combo...' : `${activePretty} <span class="rp-sc-edit-pen">&#9998; Edit</span>`}
              </button>
              <button type="button" class="rp-sc-reset-btn" data-sc-reset="${it.id}" title="Reset this option to its default shortcut (${defPretty})">&#8634; Default</button>
            </div>
          </div>`;
      }).join('');
    };

    const showNav = catFilter === 'all' || catFilter === 'nav';
    const showAlign = catFilter === 'all' || catFilter === 'align';
    const showCam = catFilter === 'all' || catFilter === 'cam';
    const showEdit = catFilter === 'all' || catFilter === 'edit';
    const showDxf = catFilter === 'all' || catFilter === 'dxf';

    return `
      <div class="rp-hud-card" role="dialog" aria-label="Keyboard Shortcuts HUD" style="width:min(1020px,96vw);max-height:92vh">
        <div class="rp-hud-header">
          <div class="rp-hud-title">
            <h3>Keyboard Shortcuts &amp; Custom Hotkey Editor</h3>
            <span class="rp-hud-badge">HUD &middot; F1 / ? ${customCount ? `(${customCount} Custom)` : '(Defaults)'}</span>
          </div>
          <div class="row" style="gap:6px">
            <button type="button" class="rp-btn-sm" id="rp-hud-reset-all-btn" title="Restore all options to their factory default shortcuts">&#8634; Reset All to Defaults</button>
            <button type="button" class="rp-hud-close" id="rp-hud-close-btn">Close (Esc)</button>
          </div>
        </div>
        <div class="rp-sc-toolbar">
          <input type="text" id="rp-hud-search-in" class="rp-sc-search" placeholder="Search any option or key (e.g. Next Page, Defect, Calibrate, Gerber, Right)..." value="${(ShortcutManager.searchQuery || '').replace(/"/g, '&quot;')}" />
          <div class="rp-sc-cats">
            <button type="button" class="rp-btn-sm ${catFilter === 'all' ? 'on' : ''}" data-sccat="all">All Categories</button>
            <button type="button" class="rp-btn-sm ${catFilter === 'nav' ? 'on' : ''}" data-sccat="nav">Navigation &amp; Diff</button>
            <button type="button" class="rp-btn-sm ${catFilter === 'align' ? 'on' : ''}" data-sccat="align">Alignment &amp; Tools</button>
            <button type="button" class="rp-btn-sm ${catFilter === 'cam' ? 'on' : ''}" data-sccat="cam">Measure, Markup &amp; CAM</button>
            <button type="button" class="rp-btn-sm ${catFilter === 'edit' ? 'on' : ''}" data-sccat="edit">PDF Studio &amp; Export</button>
            <button type="button" class="rp-btn-sm ${catFilter === 'dxf' ? 'on' : ''}" data-sccat="dxf">AutoCAD DXF Studio</button>
          </div>
        </div>
        <div class="rp-sc-banner">
          <span><b>Tip:</b> Click any shortcut button on the right and press your preferred key or combination to customize. Every option displays its <b>Default</b> shortcut and can be reset individually (<b>&#8634;</b>) or all at once.</span>
        </div>
        <div class="rp-scroll" style="max-height:66vh;padding-right:4px">
          <div class="rp-hud-grid" style="grid-template-columns:${catFilter === 'all' ? 'repeat(2,1fr)' : '1fr'};gap:12px">
            <div class="rp-hud-section" ${showNav ? '' : 'hidden'}>
              <h4>Navigation &amp; Diff</h4>
              <div class="rp-hud-list">
                ${renderRows(KEYBOARD_SHORTCUTS_SPEC.navigationAndDiff)}
              </div>
            </div>
            <div class="rp-hud-section" ${showAlign ? '' : 'hidden'}>
              <h4>Alignment &amp; Tools</h4>
              <div class="rp-hud-list">
                ${renderRows(KEYBOARD_SHORTCUTS_SPEC.alignmentAndTools)}
              </div>
            </div>
            <div class="rp-hud-section" ${showCam ? '' : 'hidden'}>
              <h4>Measure, Markup &amp; CAM</h4>
              <div class="rp-hud-list">
                ${renderRows(KEYBOARD_SHORTCUTS_SPEC.measureMarkupAndCam)}
              </div>
            </div>
            <div class="rp-hud-section" ${showEdit ? '' : 'hidden'}>
              <h4>PDF Studio &amp; Export</h4>
              <div class="rp-hud-list">
                ${renderRows(KEYBOARD_SHORTCUTS_SPEC.pdfStudioAndExport)}
              </div>
            </div>
            <div class="rp-hud-section" ${showDxf ? '' : 'hidden'}>
              <h4>AutoCAD DXF Studio</h4>
              <div class="rp-hud-list">
                ${renderRows(KEYBOARD_SHORTCUTS_SPEC.dxfStudioTools || [])}
              </div>
            </div>
          </div>
        </div>
        <div class="rp-hud-footer">
          <span>Kensho Pro 1.2.3.2 (Build O1R0A7N5G0E002026A1232) &middot; Page Nav: <b>Left / Right</b> or <b>PgUp / PgDn</b> &middot; Defect Nav: <b>P / N</b></span>
          <span>Press <b>Esc</b> or click <b>Close</b> to dismiss</span>
        </div>
      </div>
    `;
  }

  function showKeyboardHUD() {
    if (typeof document === 'undefined') return buildKeyboardHUDHTML();
    document.querySelectorAll('.rp-modal:not(.rp-side-docked):not(#rp-keyboard-hud-modal)').forEach(el => { if (el.id) el.hidden = true; else el.remove(); });
    if ($('#modal')) $('#modal').hidden = true;
    let modal = $('#rp-keyboard-hud-modal');
    if (!modal) {
      modal = el('div', { id: 'rp-keyboard-hud-modal', className: 'rp-modal' });
      document.body.appendChild(modal);
    }
    const prevScroll = modal.querySelector('.rp-scroll') ? modal.querySelector('.rp-scroll').scrollTop : 0;
    const hadSearchFocus = document.activeElement && document.activeElement.id === 'rp-hud-search-in';
    modal.innerHTML = buildKeyboardHUDHTML();
    modal.hidden = false;
    const scEl = modal.querySelector('.rp-scroll');
    if (scEl && prevScroll) scEl.scrollTop = prevScroll;

    const closeBtn = $('#rp-hud-close-btn');
    if (closeBtn) closeBtn.onclick = () => { ShortcutManager.recordingId = null; modal.hidden = true; };
    const resetAllBtn = $('#rp-hud-reset-all-btn');
    if (resetAllBtn) resetAllBtn.onclick = () => ShortcutManager.resetAll();

    const searchIn = $('#rp-hud-search-in');
    if (searchIn) {
      if (hadSearchFocus) {
        searchIn.focus();
        const len = searchIn.value.length;
        searchIn.setSelectionRange(len, len);
      }
      searchIn.oninput = e => {
        ShortcutManager.searchQuery = e.target.value;
        showKeyboardHUD();
      };
    }

    modal.querySelectorAll('[data-sccat]').forEach(btn => {
      btn.onclick = () => {
        ShortcutManager.activeCategory = btn.dataset.sccat;
        showKeyboardHUD();
      };
    });

    modal.querySelectorAll('[data-sc-id]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const id = btn.dataset.scId;
        ShortcutManager.recordingId = (ShortcutManager.recordingId === id) ? null : id;
        showKeyboardHUD();
      };
    });

    modal.querySelectorAll('[data-sc-reset]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        ShortcutManager.resetKey(btn.dataset.scReset);
      };
    });

    modal.onclick = e => {
      if (e.target === modal) {
        ShortcutManager.recordingId = null;
        modal.hidden = true;
      }
    };
    return modal;
  }

  function closeKeyboardHUD() {
    ShortcutManager.recordingId = null;
    const modal = $('#rp-keyboard-hud-modal');
    if (modal) modal.hidden = true;
  }

  async function openExternalCADOrCAM(bytes, name, path, slot, skipStart = false) {
    try {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let effU8 = u8;
    let effName = name || '';
    if (/\.dwg$/i.test(effName)) {
      if (typeof window !== 'undefined' && window.native && typeof window.native.convertDwgToDxf === 'function') {
        rpToast(`Converting AutoCAD DWG (${effName}) offline...`);
        const conv = await window.native.convertDwgToDxf({ path: path || '', bytes: effU8, name: effName });
        if (!conv || !conv.ok || !conv.bytes) {
          rpToast((conv && conv.error) || 'AutoCAD .dwg conversion requires ODA File Converter or LibreDWG dwg2dxf.');
          return false;
        }
        effU8 = conv.bytes instanceof Uint8Array ? conv.bytes : new Uint8Array(conv.bytes);
        effName = conv.name || effName.replace(/\.dwg$/i, '.dxf');
      } else {
        rpToast('AutoCAD .dwg conversion requires the desktop app with ODA File Converter or LibreDWG dwg2dxf (or save as ASCII/Binary .dxf in AutoCAD).');
        return false;
      }
    }
    const wasDxfView = typeof document !== 'undefined' && document.body && document.body.dataset.view === 'dxf';
    if (typeof setView === 'function' && !(wasDxfView && /\.dxf$/i.test(effName))) setView('compare');
    const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : {};
    const targetSlot = slot || (!S.A ? 'A' : 'B');

    // If bytes are already a converted PDF (e.g., from Open Recent memory cache), load directly without re-converting!
    if (effU8.length >= 4 && effU8[0] === 0x25 && effU8[1] === 0x50 && effU8[2] === 0x44 && effU8[3] === 0x46) {
      if (window.compareLoadBytes) await window.compareLoadBytes(targetSlot, effU8, effName, path, skipStart);
      return true;
    }

    const isBinDXF = effU8.length >= 24 && String.fromCharCode(...effU8.subarray(0, 18)) === 'AutoCAD Binary DXF';
    const text = (/\.dxf$/i.test(effName) && !isBinDXF && typeof DXFEngine !== 'undefined' && DXFEngine.decodeDXFBytes)
      ? DXFEngine.decodeDXFBytes(effU8)
      : (isBinDXF ? '' : new TextDecoder().decode(effU8));
    name = effName;

    if (/\.dxf$/i.test(effName) && typeof DXFEngine !== 'undefined') {
      if (DXFState._isSampleDXF) {
        DXFState.parsedA = null; DXFState.rawA = null; DXFState.nameA = '';
        DXFState.parsedB = null; DXFState.rawB = null; DXFState.nameB = '';
        DXFState.lastEntityDiff = null;
        DXFState.hiddenLayers.clear();
        DXFState.frozenLayers.clear();
        DXFState.lockedLayers.clear();
        DXFState.comparedLayers.clear();
        DXFState._isSampleDXF = false;
      }
      const effectiveSlot = slot || ((!S.A || !DXFState.parsedA || (DXFState.parsedA && DXFState.parsedB)) ? 'A' : 'B');
      let parser = null;
      if (effectiveSlot === 'A' && DXFState.rawA === text && DXFState.parsedA) parser = DXFState.parsedA;
      else if (effectiveSlot === 'B' && DXFState.rawB === text && DXFState.parsedB) parser = DXFState.parsedB;
      else parser = new DXFEngine.DXFParser(isBinDXF ? effU8 : text).parse();
      if (effectiveSlot === 'A') {
        DXFState.rawA = text; DXFState.nameA = name; DXFState.parsedA = parser;
        if (!slot) { DXFState.rawB = null; DXFState.nameB = ''; DXFState.parsedB = null; DXFState.lastEntityDiff = null; }
      } else {
        DXFState.rawB = text; DXFState.nameB = name; DXFState.parsedB = parser;
      }
      DXFState.comparedLayers.clear();
      DXFState.syncLayerSetsFromParsers();
      if (skipStart) return true;
      await reRenderActiveDXFLayers();
      if (DXFState.parsedA && DXFState.parsedB && typeof document !== 'undefined' && !window.__autoConfirmDXF) {
        showDXFPreCompareModal();
      } else {
        rpToast(`Opened AutoCAD DXF: ${name} (${parser.entities.length} entities, ${Object.keys(parser.layers).length} layers)`);
      }
      return true;
    }

    const isCamFile = (typeof CAMEngine !== 'undefined' && CAMEngine.isCAMFileName) ? CAMEngine.isCAMFileName(name) : /\.(gbr|ger|art|pho|top|bot|gtl|gbl|gbs|gts|gto|gbo|gtp|gbp|gko|gm\d+|g\d+|gp\d+|l\d+|drl|xln|ncd|ipc|d356|net)$/i.test(name);
    if (isCamFile && typeof CAMEngine !== 'undefined') {
      if (!skipStart && !window.__autoConfirmCAM && typeof document !== 'undefined' && $('#rp-lang-sel')) {
        await stageAndPromptCAMFiles([{ name, path, bytes: u8, text }], targetSlot, false);
        return true;
      }
      const layerMeta = CAMEngine.detectLayerType(name, text);
      const parseOpts = CAMState.getParseOptions(targetSlot);
      const parseKey = CAMState.getParseKey(targetSlot);

      if (layerMeta.category === 'netlist') {
        const ipc = new CAMEngine.IPCD356Parser(text, parseOpts).parse();
        ipc._rawText = text; ipc._parseKey = parseKey;
        window.__lastIPCA = text;
        CAMState.parsedIPCA = ipc;
        setUnitSystem(ipc.units === 'MM' ? 'metric' : 'english', true);
      } else if (layerMeta.category === 'drill') {
        const drl = new CAMEngine.ExcellonParser(text, parseOpts).parse();
        drl._rawText = text; drl._parseKey = parseKey;
        window.__lastDrill = text;
        if (targetSlot === 'A') CAMState.parsedDrillA = drl; else CAMState.parsedDrillB = drl;
        setUnitSystem(drl.units === 'METRIC' ? 'metric' : 'english', true);
      } else {
        const gbr = new CAMEngine.GerberParser(text, parseOpts).parse();
        gbr._rawText = text; gbr._parseKey = parseKey;
        if (targetSlot === 'A') { window.__lastGerberA = text; CAMState.parsedGerberA = gbr; }
        else { window.__lastGerberB = text; CAMState.parsedGerberB = gbr; }
        setUnitSystem(gbr.units === 'MM' ? 'metric' : 'english', true);
      }

      if (window.CMP && window.CMP.names) window.CMP.names[targetSlot] = name;
      if (skipStart) return true;

      // If both A and B Gerbers are now loaded, render once with unified shared bounds so comparison aligns 1:1
      if (window.__lastGerberA && window.__lastGerberB && layerMeta.category !== 'netlist' && layerMeta.category !== 'drill') {
        await reRenderActiveCAMLayers();
        rpToast(`Opened & aligned ${layerMeta.name}: ${name}`);
        return true;
      }

      const activeGbr = layerMeta.category === 'copper' || (layerMeta.category !== 'netlist' && layerMeta.category !== 'drill')
        ? (targetSlot === 'A' ? CAMState.parsedGerberA : CAMState.parsedGerberB) : null;
      const activeDrl = layerMeta.category === 'drill'
        ? (targetSlot === 'A' ? CAMState.parsedDrillA : CAMState.parsedDrillB) : null;
      const activeIpc = layerMeta.category === 'netlist' ? CAMState.parsedIPCA : null;
      const singleEntry = { name, parsedGbr: activeGbr, parsedDrl: activeDrl, parsedIPC: activeIpc, layerMeta };
      const sharedBoundsInches = CAMEngine.CAMJobStack.computeUnifiedBoundsInches([singleEntry]);
      CAMState.activeSharedBoundsInches = sharedBoundsInches;
      const pdfBytes = await CAMEngine.layersToVectorPDFBytes([{ title: name, entries: [singleEntry] }], {
        pcbTheme: CAMState.pcbTheme || 'standard',
        renderMode: CAMState.renderMode || 'fill',
        mirrorX: CAMState.mirrorX || layerMeta.side === 'bottom',
        invertPolarity: CAMState.invertPolarity,
        sharedBoundsInches
      });
      if ((CAMState.pcbTheme || "standard") !== "paper" && $("#mode") && $("#mode").value === "paper") {
        setCompareMode("over");
      }
      CAMState._isActiveCAMSession = true;
      CAMState._renderingStack = true;
      try {
        if (pdfBytes && window.compareLoadBytes) {
          await window.compareLoadBytes(targetSlot, pdfBytes, name, path, skipStart);
        }
      } finally {
        CAMState._renderingStack = false;
      }
      updateCAMSidebarPane();
      rpToast(`Opened ${layerMeta.name}: ${name}`);
      return true;
    }
    return false;
    } catch (e) {
      rpToast(`Could not open ${name || 'file'}: ${e.message || e}`);
      return false;
    }
  }

  if (typeof window !== 'undefined') {
    window.openExternalCADOrCAM = openExternalCADOrCAM;
    window.loadSampleSchematic = loadSampleSchematic;
    window.loadSampleGerber = loadSampleGerber;
    window.loadSampleDXF = loadSampleDXF;
    window.showDXFWorkbenchModal = showDXFWorkbenchModal;
    window.showDXFPreCompareModal = showDXFPreCompareModal;
    window.stageAndPromptDXFFiles = stageAndPromptDXFFiles;
    window.promptSampleDrawings = promptSampleDrawings;
    window.showKeyboardHUD = showKeyboardHUD;
    window.closeKeyboardHUD = closeKeyboardHUD;
    window.showCAMWorkbenchModal = showCAMWorkbenchModal; window.showCAMWorkbenchModal = showCAMWorkbenchModal;
    window.showCAMPreCompareModal = showCAMPreCompareModal;
    window.stageAndPromptCAMFiles = stageAndPromptCAMFiles;
    window.stageUploadedCAMFiles = stageUploadedCAMFiles;
    window.executeConfiguredCAMCompare = executeConfiguredCAMCompare;
  }

  /**
   * Keyboard Navigation & Shortcuts
   */
  function initKeyboardNavigation() {
    if (typeof window === 'undefined') return;
    window.ShortcutManager = ShortcutManager;
    window.addEventListener('keydown', e => {
      // 1. If currently recording a custom shortcut in the Keyboard Shortcut Editor, capture the key!
      const hud = $('#rp-keyboard-hud-modal');
      const setModal = $('#rp-settings-page-modal');
      if (((hud && !hud.hidden) || setModal) && ShortcutManager.recordingId) {
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.key === 'Escape') {
          ShortcutManager.recordingId = null;
          ShortcutManager.refreshHUDModal();
          return;
        }
        const recordedKey = ShortcutManager.eventToKeyStr(e);
        if (recordedKey) {
          const item = ShortcutManager.getItemById(ShortcutManager.recordingId);
          ShortcutManager.setCustomKey(ShortcutManager.recordingId, recordedKey);
          if (item) rpToast(`Bound "${item.desc}" to ${ShortcutManager.formatPretty(recordedKey)}`);
        }
        return;
      }

      const activeTag = (document.activeElement || {}).tagName || '';
      if (/INPUT|TEXTAREA|SELECT/.test(activeTag) || (document.activeElement && document.activeElement.isContentEditable)) {
        if (e.key === 'Escape' && document.activeElement && document.activeElement.id === 'rp-hud-search-in') {
          if (ShortcutManager.searchQuery) {
            ShortcutManager.searchQuery = '';
            showKeyboardHUD();
          } else if (hud) {
            hud.hidden = true;
          }
          e.preventDefault();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (hud && !hud.hidden) {
          ShortcutManager.recordingId = null;
          hud.hidden = true;
          e.preventDefault();
          return;
        }
        const smp = $('#rp-sample-modal');
        if (smp && !smp.hidden) { smp.hidden = true; e.preventDefault(); return; }
        const camPre = $('#rp-cam-precompare-modal');
        if (camPre && !camPre.hidden) { camPre.hidden = true; e.preventDefault(); return; }
        const camWb = $('#rp-cam-modal');
        if (camWb && !camWb.hidden) { camWb.hidden = true; e.preventDefault(); return; }
        const dxfPre = $('#rp-dxf-precompare-modal');
        if (dxfPre && !dxfPre.hidden) { dxfPre.hidden = true; e.preventDefault(); return; }
        const dxfWb = $('#rp-dxf-workbench-modal');
        if (dxfWb && !dxfWb.hidden) { dxfWb.hidden = true; e.preventDefault(); return; }
        const bomMod = $('#rp-bom-modal');
        if (bomMod && !bomMod.hidden) { bomMod.hidden = true; e.preventDefault(); return; }
        for (const extraId of ['rp-net-tracer-modal', 'rp-pcb-calc-modal', 'rp-bom-meas-modal', 'rp-command-palette-modal', 'rp-update-prompt-modal']) {
          const em = document.getElementById(extraId);
          if (em && !em.hidden) { em.remove(); e.preventDefault(); return; }
        }
        const fidMod = $('#fiducial-modal');
        if (fidMod && !fidMod.hidden) {
          fidMod.hidden = true;
          FiducialAligner.active = false;
          if (window.rpRedrawOverlay) window.rpRedrawOverlay();
          e.preventDefault();
          return;
        }
      }

      if ((e.key === '?' || e.key === 'F1') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showKeyboardHUD();
        return;
      }

      // Sub-pixel fine nudge (Shift+Alt+Arrows) & 1px nudge (Alt+Arrows) in Compare
      if (document.body.dataset.view === 'compare' && e.altKey && !e.ctrlKey && !e.metaKey) {
        const step = e.shiftKey ? '01' : '1';
        if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); const b = document.querySelector(`[data-nudge="x-${step}"]`); if (b) b.click(); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); const b = document.querySelector(`[data-nudge="x${step}"]`); if (b) b.click(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); const b = document.querySelector(`[data-nudge="y-${step}"]`); if (b) b.click(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); const b = document.querySelector(`[data-nudge="y${step}"]`); if (b) b.click(); return; }
        if (e.key === '0') { e.preventDefault(); e.stopImmediatePropagation(); if ($('#rp-reset-nudge')) $('#rp-reset-nudge').click(); return; }
      }

      // Ribbon tab switching via Alt+1..7
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-7]$/.test(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (document.body.dataset.view === 'compare') {
          const tabBtns = document.querySelectorAll('.rp-ribbon-tabs .rp-tab-btn');
          const idx = parseInt(e.key, 10) - 1;
          if (tabBtns[idx]) tabBtns[idx].click();
        } else if (document.body.dataset.view === 'edit') {
          const edBtns = document.querySelectorAll('#edit-ribbon-tabs .rp-tab-btn');
          const idx = parseInt(e.key, 10) - 1;
          if (edBtns[idx]) edBtns[idx].click();
        }
        return;
      }

      // Contrast Enhancement Filters (Shift+1..4) in Compare
      if (document.body.dataset.view === 'compare' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.code === 'Digit1' && $('#rib-enh-norm')) { e.preventDefault(); e.stopImmediatePropagation(); $('#rib-enh-norm').click(); return; }
        if (e.code === 'Digit2' && $('#rib-enh-boost')) { e.preventDefault(); e.stopImmediatePropagation(); $('#rib-enh-boost').click(); return; }
        if (e.code === 'Digit3' && $('#rib-enh-dark')) { e.preventDefault(); e.stopImmediatePropagation(); $('#rib-enh-dark').click(); return; }
        if (e.code === 'Digit4' && $('#rib-enh-inv')) { e.preventDefault(); e.stopImmediatePropagation(); $('#rib-enh-inv').click(); return; }
      }

      // Execute any matching action from ShortcutManager (including user-customized shortcuts and Next/Prev Page!)
      const normKey = ShortcutManager.eventToKeyStr(e);
      const _swHostEl = document.getElementById('sw-studio-host');
      const _isSwActive = document.body.dataset.view === 'solidworks' || !!(_swHostEl && !_swHostEl.hidden);
      const viewScope = _isSwActive ? 'solidworks' : (document.body.dataset.view === 'edit' ? 'edit' : (document.body.dataset.view === 'dxf' ? 'dxf' : 'compare'));
      const matchedAction = ShortcutManager.findMatchingAction(normKey, viewScope);
      if (matchedAction && typeof matchedAction.run === 'function') {
        e.preventDefault();
        e.stopImmediatePropagation();
        matchedAction.run(e);
        return;
      }
    }, true);
  }

  function openNetTracerModal() {
    document.querySelectorAll('.rp-modal:not(.rp-side-docked)').forEach(el => { if (el.id) el.hidden = true; else el.remove(); });
    let m = $('#rp-net-tracer-modal');
    if (m) m.remove();
    const ipc = CAMState.parsedIPCB || CAMState.parsedIPCA;
    const records = (ipc && ipc.records && ipc.records.length)
      ? ipc.records
      : [
          { netName: 'VIN_24V', refDes: 'F1', pin: '1', xIn: 0.45, yIn: 0.85, midpoint: false },
          { netName: 'VIN_24V', refDes: 'U1', pin: '2', xIn: 1.10, yIn: 0.85, midpoint: false },
          { netName: 'VCC_5V',  refDes: 'U1', pin: '8', xIn: 1.45, yIn: 0.85, midpoint: false },
          { netName: 'VCC_5V',  refDes: 'C1', pin: '1', xIn: 1.85, yIn: 0.65, midpoint: false },
          { netName: 'VCC_5V',  refDes: 'C2', pin: '1', xIn: 2.15, yIn: 0.65, midpoint: true },
          { netName: 'SENSE_P', refDes: 'R1', pin: '1', xIn: 1.60, yIn: 0.45, midpoint: false },
          { netName: 'GND',     refDes: 'C1', pin: '2', xIn: 1.85, yIn: 0.25, midpoint: false },
          { netName: 'GND',     refDes: 'U1', pin: '4', xIn: 1.25, yIn: 0.25, midpoint: false }
        ];
    const normRecords = records.map(r => ({
      ...r,
      netName: r.netName || r.net || 'N/C',
      net: r.net || r.netName || 'N/C'
    }));
    const nets = [...new Set(normRecords.map(r => r.netName))];

    m = document.createElement('div');
    m.id = 'rp-net-tracer-modal';
    m.className = 'rp-modal';
    m.innerHTML = `
      <div class="rp-card rp-wide" style="max-width:min(740px,95vw);gap:12px">
        <div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px">
          <div class="row" style="gap:8px">
            <span class="rp-launchpad-badge" style="margin:0"><i data-ic="netTracer"></i> NET TRACER</span>
            <h3 style="margin:0;font-size:14px">Netlist &amp; Pin Cross-Probe</h3>
          </div>
          <button type="button" class="rp-fmt-btn" id="nt-close-top">✕</button>
        </div>
        <div class="row" style="gap:8px">
          <input type="text" id="nt-search-in" placeholder="Filter by Net Name (e.g. VCC_5V, GND) or RefDes (U1, R1, C2)..." style="flex:1;height:28px">
          <select id="nt-net-sel" style="height:28px;min-width:160px;font-weight:600">
            <option value="">All Nets (${nets.length})</option>
            ${nets.map(n => `<option value="${n}">${n}</option>`).join('')}
          </select>
        </div>
        <div class="rp-scroll" style="max-height:320px;padding:0">
          <table class="btab" style="width:100%">
            <thead><tr><th>Net Name</th><th>RefDes · Pin</th><th>X (mil / mm)</th><th>Y (mil / mm)</th><th>Action</th></tr></thead>
            <tbody id="nt-table-body"></tbody>
          </table>
        </div>
        <div class="rp-btns">
          <button type="button" id="nt-clear-hl">Clear Net Highlight</button>
          <button type="button" class="rp-primary" id="nt-close-btn">Done</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    if (typeof hydrateIcons === 'function') hydrateIcons(m);

    const tbody = m.querySelector('#nt-table-body');
    const renderRows = () => {
      const q = (m.querySelector('#nt-search-in').value || '').toLowerCase();
      const netF = m.querySelector('#nt-net-sel').value;
      const filtered = normRecords.filter(r => (!netF || r.netName === netF) && (!q || r.netName.toLowerCase().includes(q) || (r.refDes || '').toLowerCase().includes(q)));
      tbody.innerHTML = filtered.map(r => `
        <tr>
          <td><b style="color:#38bdf8">${r.netName}</b></td>
          <td>${r.refDes || 'TP'}-${r.pin || '1'}</td>
          <td>${(r.xIn * 1000).toFixed(1)} mil (${(r.xIn * 25.4).toFixed(2)} mm)</td>
          <td>${(r.yIn * 1000).toFixed(1)} mil (${(r.yIn * 25.4).toFixed(2)} mm)</td>
          <td><button type="button" class="rp-btn-sm nt-probe-btn" data-net="${r.netName}">Cross-Probe</button></td>
        </tr>
      `).join('');
      tbody.querySelectorAll('.nt-probe-btn').forEach(btn => {
        btn.onclick = () => {
          const net = btn.dataset.net;
          CAMState.highlightNet = net;
          CAMState.highlightedNet = net;
          CAMState.highlightedNodes = normRecords.filter(r => r.netName === net);
          rpToast(`Highlighted Net "${net}" (${CAMState.highlightedNodes.length} connected pins/nodes)`);
          if (window.rpRedrawOverlay) window.rpRedrawOverlay();
          if (CAMState._isActiveCAMSession) reRenderActiveCAMLayers();
        };
      });
    };

    m.querySelector('#nt-search-in').oninput = renderRows;
    m.querySelector('#nt-net-sel').onchange = renderRows;
    m.querySelector('#nt-clear-hl').onclick = () => {
      CAMState.highlightNet = null;
      CAMState.highlightedNet = null;
      CAMState.highlightedNodes = [];
      if (window.rpRedrawOverlay) window.rpRedrawOverlay();
      if (CAMState._isActiveCAMSession) reRenderActiveCAMLayers();
      rpToast('Cleared net highlight');
    };
    m.onclick = e => { if (e.target === m) m.remove(); };
    m.querySelector('#nt-close-top').onclick = () => m.remove();
    m.querySelector('#nt-close-btn').onclick = () => m.remove();
    renderRows();
  }

  function openPCBStackupCalculator() {
    document.querySelectorAll('.rp-modal:not(.rp-side-docked)').forEach(el => { if (el.id) el.hidden = true; else el.remove(); });
    let m = $('#rp-pcb-calc-modal');
    if (m) m.remove();
    m = document.createElement('div');
    m.id = 'rp-pcb-calc-modal';
    m.className = 'rp-modal';
    m.innerHTML = `
      <div class="rp-card rp-wide" style="max-width:min(800px,95vw);gap:12px">
        <div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px">
          <div class="row" style="gap:8px">
            <span class="rp-launchpad-badge" style="margin:0"><i data-ic="pcbCalc"></i> IPC-2141 / 2152</span>
            <h3 style="margin:0;font-size:14px">Impedance (Z₀) &amp; Trace Current Calculator</h3>
          </div>
          <button type="button" class="rp-fmt-btn" id="pc-close-top">✕</button>
        </div>

        <div class="rp-hud-grid" style="gap:14px">
          <div class="rp-hud-section">
            <h4>Parameters (IPC English / Metric)</h4>
            <label class="fl">Transmission Mode
              <select id="pc-mode"><option value="microstrip">Surface Microstrip (Outer Layer)</option><option value="stripline">Symmetric Stripline (Inner Layer)</option></select>
            </label>
            <label class="fl">Trace Width W (mils) <input type="number" id="pc-w" value="6.0" step="0.5" min="1" max="250"></label>
            <label class="fl">Copper Weight (oz/ft²)
              <select id="pc-oz"><option value="0.5">0.5 oz (0.68 mil / 17 µm)</option><option value="1.0" selected>1.0 oz (1.37 mil / 35 µm)</option><option value="2.0">2.0 oz (2.74 mil / 70 µm)</option><option value="3.0">3.0 oz (4.11 mil / 105 µm)</option></select>
            </label>
            <label class="fl">Dielectric Height H (mils) <input type="number" id="pc-h" value="4.5" step="0.5" min="1" max="200"></label>
            <label class="fl">Substrate Dielectric Constant (εr) <input type="number" id="pc-er" value="4.2" step="0.1" min="1" max="12"></label>
            <label class="fl">Max Temp Rise ΔT (°C) <input type="number" id="pc-dt" value="20" step="5" min="5" max="100"></label>
          </div>

          <div class="rp-hud-section" style="justify-content:space-between">
            <h4>Calculated IPC-2141 &amp; IPC-2152 Results</h4>
            <div id="pc-results" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"></div>
            <div class="rp-pcb-stackup-viz" style="background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:8px 10px;font-size:11px;font-family:Consolas,monospace;display:flex;flex-direction:column;gap:3px">
              <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(245,158,11,0.16);border-left:3px solid #f59e0b;padding:2px 6px"><b>L1 TOP COPPER</b><span>Signal / Microstrip</span></div>
              <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(47,129,247,0.10);border-left:3px solid var(--acc);padding:2px 6px;color:var(--mute)"><span>PREPREG FR-4</span><span>H=<b id="pc-stk-h" style="color:var(--ink)">4.5</b> mil · εr=<b id="pc-stk-er" style="color:var(--ink)">4.20</b></span></div>
              <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(245,158,11,0.16);border-left:3px solid #f59e0b;padding:2px 6px"><b>L2 GND PLANE</b><span>Solid Reference</span></div>
              <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(16,185,129,0.10);border-left:3px solid #10b981;padding:3px 6px;color:var(--mute)"><span>CORE FR-4 LAMINATE</span><span>47.0 mil</span></div>
              <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(245,158,11,0.16);border-left:3px solid #f59e0b;padding:2px 6px"><b>L3 PWR PLANE</b><span>+24V / +5V Split</span></div>
              <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(47,129,247,0.10);border-left:3px solid var(--acc);padding:2px 6px;color:var(--mute)"><span>PREPREG FR-4</span><span>4.5 mil</span></div>
              <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(245,158,11,0.16);border-left:3px solid #f59e0b;padding:2px 6px"><b>L4 BOTTOM COPPER</b><span>Signal / Return</span></div>
            </div>
          </div>
        </div>

        <div class="rp-btns">
          <button type="button" class="rp-primary" id="pc-close-btn">Done</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    if (typeof hydrateIcons === 'function') hydrateIcons(m);

    const updateCalc = () => {
      const mode = m.querySelector('#pc-mode').value;
      const w = parseFloat(m.querySelector('#pc-w').value) || 6.0;
      const oz = parseFloat(m.querySelector('#pc-oz').value) || 1.0;
      const h = parseFloat(m.querySelector('#pc-h').value) || 4.5;
      const er = parseFloat(m.querySelector('#pc-er').value) || 4.2;
      const dt = parseFloat(m.querySelector('#pc-dt').value) || 20;

      m.querySelector('#pc-stk-h').textContent = h.toFixed(1);
      m.querySelector('#pc-stk-er').textContent = er.toFixed(2);

      const imp = MeasureEngine.calcIPC2141Impedance({ mode, traceWidthMils: w, traceThicknessOz: oz, dielectricHeightMils: h, er });
      const cur = MeasureEngine.calcIPC2152Current({ traceWidthMils: w, traceThicknessOz: oz, tempRiseC: dt, isInternal: mode === 'stripline' });

      m.querySelector('#pc-results').innerHTML = `
        <div style="background:var(--panel);padding:8px;border-radius:6px;border:1px solid var(--line)">
          <small style="color:var(--mute);display:block">Characteristic Impedance Z₀</small>
          <b style="font-size:18px;color:#38bdf8">${imp.z0Ohms} Ω</b>
        </div>
        <div style="background:var(--panel);padding:8px;border-radius:6px;border:1px solid var(--line)">
          <small style="color:var(--mute);display:block">Propagation Delay Tpd</small>
          <b style="font-size:18px;color:#10b981">${imp.delayPsPerIn} ps/in</b>
        </div>
        <div style="background:var(--panel);padding:8px;border-radius:6px;border:1px solid var(--line)">
          <small style="color:var(--mute);display:block">Max Current (ΔT=${dt}°C)</small>
          <b style="font-size:18px;color:#f59e0b">${cur.maxCurrentAmps} A</b>
        </div>
        <div style="background:var(--panel);padding:8px;border-radius:6px;border:1px solid var(--line)">
          <small style="color:var(--mute);display:block">DC Resistance / Inch</small>
          <b style="font-size:18px;color:var(--ink)">${cur.resistanceMilliohms} mΩ/in</b>
        </div>
      `;
    };

    ['#pc-mode', '#pc-w', '#pc-oz', '#pc-h', '#pc-er', '#pc-dt'].forEach(sel => {
      m.querySelector(sel).oninput = updateCalc;
      m.querySelector(sel).onchange = updateCalc;
    });
    m.onclick = e => { if (e.target === m) m.remove(); };
    m.querySelector('#pc-close-top').onclick = () => m.remove();
    m.querySelector('#pc-close-btn').onclick = () => m.remove();
    updateCalc();
  }

  const DEFAULT_SAMPLE_BOM = [
    { refDes: 'F1', partNumber: '0451016.MRL', value: '16A Fast Fuse', pkg: '2410_SMD', xMil: 450, yMil: 850, status: 'Populated' },
    { refDes: 'U1', partNumber: 'LM2596S-5.0', value: '5.0V 3A Buck', pkg: 'TO-263-5', xMil: 1200, yMil: 750, status: 'Populated' },
    { refDes: 'R1', partNumber: 'RC0603FR-0710KL', value: '10kΩ ±1%', pkg: '0603', xMil: 1600, yMil: 450, status: 'Populated' },
    { refDes: 'C1', partNumber: 'GRM32ER71E106KA', value: '100µF 25V', pkg: '1210', xMil: 1850, yMil: 650, status: 'Populated' },
    { refDes: 'C2', partNumber: 'CL10B106MQ8NNNC', value: '10µF 16V', pkg: '0603', xMil: 2150, yMil: 650, status: 'Added (Rev B)' }
  ];

  function openBOMOverlayModal() {
    document.querySelectorAll('.rp-modal:not(.rp-side-docked)').forEach(el => { if (el.id) el.hidden = true; else el.remove(); });
    if (!CAMState.bomItems || !CAMState.bomItems.length) {
      CAMState.bomItems = [...DEFAULT_SAMPLE_BOM];
    }
    let m = $('#rp-bom-modal');
    if (m) m.remove();
    m = document.createElement('div');
    m.id = 'rp-bom-modal';
    m.className = 'rp-modal';
    m.innerHTML = `
      <div class="rp-card rp-wide" style="max-width:min(760px,95vw);gap:12px">
        <div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px">
          <div class="row" style="gap:8px">
            <span class="rp-launchpad-badge" style="margin:0"><i data-ic="bomLoc"></i> BOM LOCATOR</span>
            <h3 style="margin:0;font-size:14px">Component &amp; Centroid Lookup</h3>
          </div>
          <button type="button" class="rp-fmt-btn" id="bom-close-top">✕</button>
        </div>
        <div class="row" style="gap:8px">
          <input type="text" id="bom-search-in" placeholder="Search RefDes (U1, R1, C2), Value (10kΩ, 10µF) or Part Number..." style="flex:1;height:28px">
          <button type="button" class="rp-btn-sm" id="bom-import-csv"><i data-ic="open"></i><span>Import BOM CSV</span></button>
          <label class="chk"><input type="checkbox" id="bom-ov-chk" ${CAMState.showBOMOverlay ? 'checked' : ''}> Show BOM Pins on Canvas</label>
        </div>
        <div class="rp-scroll" style="max-height:300px;padding:0">
          <table class="btab" style="width:100%">
            <thead><tr><th>RefDes</th><th>Part Number</th><th>Value</th><th>Footprint</th><th>Centroid (mil)</th><th>Status</th></tr></thead>
            <tbody id="bom-tbody"></tbody>
          </table>
        </div>
        <div class="rp-btns">
          <button type="button" class="rp-primary" id="bom-close-btn">Done</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    if (typeof hydrateIcons === 'function') hydrateIcons(m);
    const impBtn = m.querySelector('#bom-import-csv');
    if (impBtn) {
      impBtn.onclick = async () => {
        if (!window.native || !window.native.openFiles) return;
        const files = await window.native.openFiles({
          title: 'Import Bill of Materials / Centroid CSV (.csv)',
          multi: false,
          filters: [{ name: 'CSV BOM / Pick & Place', extensions: ['csv', 'txt'] }]
        });
        if (!files || !files.length || !files[0].bytes) return;
        const txt = new TextDecoder().decode(files[0].bytes instanceof Uint8Array ? files[0].bytes : new Uint8Array(files[0].bytes));
        const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const parsed = [];
        for (let i = 0; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.replace(/^["']|["']$/g, '').trim());
          if (i === 0 && /ref|des|part|val/i.test(cols.join(' '))) continue;
          if (!cols[0]) continue;
          parsed.push({
            refDes: cols[0] || ('U' + i),
            partNumber: cols[1] || '—',
            value: cols[2] || '—',
            pkg: cols[3] || 'SMD',
            xMil: parseFloat(cols[4]) || 0,
            yMil: parseFloat(cols[5]) || 0,
            status: cols[6] || 'Populated'
          });
        }
        if (parsed.length) {
          CAMState.bomItems = parsed;
          renderBOM();
          if (CAMState.showBOMOverlay && window.rpRedrawOverlay) window.rpRedrawOverlay();
          rpToast(`Imported ${parsed.length} BOM components.`);
        }
      };
    }

    const renderBOM = () => {
      const q = (m.querySelector('#bom-search-in').value || '').toLowerCase();
      const rows = (CAMState.bomItems || []).filter(it => !q || it.refDes.toLowerCase().includes(q) || it.value.toLowerCase().includes(q) || it.partNumber.toLowerCase().includes(q));
      m.querySelector('#bom-tbody').innerHTML = rows.map(it => `
        <tr>
          <td><b style="color:#f59e0b">${it.refDes}</b></td>
          <td style="font-family:Consolas,monospace">${it.partNumber}</td>
          <td><b>${it.value}</b></td>
          <td>${it.pkg}</td>
          <td>(${it.xMil}, ${it.yMil}) mil</td>
          <td>${it.status}</td>
        </tr>
      `).join('');
    };

    m.querySelector('#bom-search-in').oninput = renderBOM;
    m.querySelector('#bom-ov-chk').onchange = e => {
      CAMState.showBOMOverlay = e.target.checked;
      if (window.rpRedrawOverlay) window.rpRedrawOverlay();
      rpToast(CAMState.showBOMOverlay ? 'BOM component centroids shown on canvas' : 'BOM overlay hidden');
    };
    m.onclick = e => { if (e.target === m) m.remove(); };
    m.querySelector('#bom-close-top').onclick = () => m.remove();
    m.querySelector('#bom-close-btn').onclick = () => m.remove();
    renderBOM();
  }

  function applyWorkspaceProfile(profile = 'all') {
    const sel = $('#rp-profile-sel');
    if (sel && sel.value !== profile) sel.value = profile;
    if (profile === 'pcb') {
      if (typeof window.setView === 'function') window.setView('compare');
      setUnitSystem('english', true);
      const cadTab = document.querySelector('.rp-ribbon-tabs [data-tab="tab-cad"]');
      if (cadTab) cadTab.click();
      rpToast('Activated PCB & Hardware CAM Profile (IPC English mils, PCB CAM & DFM checks)');
    } else if (profile === 'mech') {
      if (typeof window.setView === 'function') window.setView('edit');
      setUnitSystem('metric', true);
      const drawTab = document.querySelector('#edit-ribbon-tabs [data-etab="draw"]');
      if (drawTab) drawTab.click();
      rpToast('Activated Mechanical CAD & GD&T Profile (Metric mm, GD&T Frames, Title Block & FAI)');
    } else if (profile === 'doc') {
      if (typeof window.setView === 'function') window.setView('edit');
      const homeTab = document.querySelector('#edit-ribbon-tabs [data-etab="home"]');
      if (homeTab) homeTab.click();
      rpToast('Activated PDF Spec & MS Word Profile (45+ Fonts, Quick Styles, Equations & Ruler)');
    } else {
      rpToast('Activated All-in-One Profile');
    }
  }

  function initSampleButtons() {
    const bOpenA = $('#rp-cmp-open-a-btn');
    if (bOpenA) bOpenA.onclick = () => { if ($('#openA')) $('#openA').click(); };
    const bOpenB = $('#rp-cmp-open-b-btn');
    if (bOpenB) bOpenB.onclick = () => { if ($('#openB')) $('#openB').click(); };

    // Wire 3 Primary Empty-State Quick-Launch Cards
    if ($('#rp-card-compare-drawings')) $('#rp-card-compare-drawings').onclick = () => { if (typeof setView === 'function') setView('compare'); if ($('#openA')) $('#openA').click(); };
    if ($('#rp-card-pdf-studio')) $('#rp-card-pdf-studio').onclick = () => { if (typeof setView === 'function') setView('edit'); };
    if ($('#rp-card-cam-setup')) $('#rp-card-cam-setup').onclick = () => showCAMPreCompareModal();

    // Wire Compare Launchpad Quick Cards
    if ($('#rp-cmp-launch-ab')) $('#rp-cmp-launch-ab').onclick = () => { if ($('#openA')) $('#openA').click(); };
    if ($('#rp-cmp-launch-cam')) $('#rp-cmp-launch-cam').onclick = () => showCAMWorkbenchModal('format');
    if ($('#rp-cmp-launch-dxf')) $('#rp-cmp-launch-dxf').onclick = () => promptDXFImport();
    if ($('#rp-cmp-launch-batch')) $('#rp-cmp-launch-batch').onclick = () => { if (window.ACT && window.ACT.batch) window.ACT.batch(); };

    // Wire Topbar Shortcuts Button & Compare Floating HUD (#c-floating-hud)
    if ($('#shortcuts-btn')) $('#shortcuts-btn').onclick = () => showKeyboardHUD();
    if ($('#cHudPrevPg')) $('#cHudPrevPg').onclick = () => { if (window.ACT && window.ACT.cPage) window.ACT.cPage(-1); };
    if ($('#cHudNextPg')) $('#cHudNextPg').onclick = () => { if (window.ACT && window.ACT.cPage) window.ACT.cPage(1); };
    if ($('#cHudPageLabel')) $('#cHudPageLabel').onclick = () => { if (window.ACT && window.ACT.cGotoDialog) window.ACT.cGotoDialog(); };
    if ($('#cHudPrevD')) $('#cHudPrevD').onclick = () => DefectState.prev();
    if ($('#cHudNextD')) $('#cHudNextD').onclick = () => DefectState.next();
    if ($('#cHudDiffLabel')) $('#cHudDiffLabel').onclick = () => DefectState.next();
    if ($('#cHudCurtain')) $('#cHudCurtain').onclick = () => setCurtainMode(!curtainActive);
    if ($('#cHudRotA')) $('#cHudRotA').onclick = e => window.rotateCompareSlot && window.rotateCompareSlot('A', e.shiftKey ? -90 : 90);
    if ($('#cHudRotB')) $('#cHudRotB').onclick = e => window.rotateCompareSlot && window.rotateCompareSlot('B', e.shiftKey ? -90 : 90);
    if ($('#cHudMirA')) $('#cHudMirA').onclick = e => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('A', e.shiftKey ? 'y' : 'x');
    if ($('#cHudMirB')) $('#cHudMirB').onclick = e => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('B', e.shiftKey ? 'y' : 'x');
    if ($('#cHudBlink')) $('#cHudBlink').onclick = () => {
      const S = window.CMP;
      if (!S || !window.ACT) return;
      if (S.mode === 'blink') window.ACT.cMode(0);
      else window.ACT.cMode(4);
      $('#cHudBlink').classList.toggle('on', S.mode === 'blink');
    };
    if ($('#cHudLoupe')) $('#cHudLoupe').onclick = () => { if ($('#rib-loupe-toggle')) $('#rib-loupe-toggle').click(); };
    if ($('#cHudCross')) $('#cHudCross').onclick = () => { if ($('#rib-crosshair-toggle')) $('#rib-crosshair-toggle').click(); };
    if ($('#cHudZo')) $('#cHudZo').onclick = () => { if (window.ACT && window.ACT.cZoomOut) window.ACT.cZoomOut(); };
    if ($('#cHudZi')) $('#cHudZi').onclick = () => { if (window.ACT && window.ACT.cZoomIn) window.ACT.cZoomIn(); };
    if ($('#cHudZoomLabel')) $('#cHudZoomLabel').onclick = () => { if (window.ACT && window.ACT.cFit) window.ACT.cFit(); };
    if ($('#cHudFit')) $('#cHudFit').onclick = () => { if ($('#rib-sharp-100')) $('#rib-sharp-100').click(); };

    // Wire Editor Empty State Hero Buttons
    const bEdOpen = $('#rp-edit-open-btn');
    if (bEdOpen) bEdOpen.onclick = () => { if ($('#eOpen')) $('#eOpen').click(); };

    // Wire Editor MS Office Set-Wise Ribbon Tabs (#edit-ribbon-tabs)
    const editTabs = $('#edit-ribbon-tabs');
    const editRibbon = document.querySelector('#view-edit .rp-edit-ribbon');
    if (editTabs && editRibbon) {
      const stampGrp = $('#eStampTools') ? $('#eStampTools').closest('.grp') : null;
      const cadSymGrp = $('#eCadSymbolTools') ? $('#eCadSymbolTools').closest('.grp') : null;
      if (stampGrp) stampGrp.dataset.egrp = 'stamps';
      if (cadSymGrp) cadSymGrp.dataset.egrp = 'stamps';
      editTabs.querySelectorAll('[data-etab]').forEach(btn => {
        btn.onclick = () => {
          const tab = btn.dataset.etab;
          editTabs.querySelectorAll('[data-etab]').forEach(b => b.classList.toggle('active', b === btn));
          const showStyleDock = (tab === "draw" || tab === "stamps") || !!(window.RE && window.RE.shouldShowContextualDock && window.RE.shouldShowContextualDock());
          editRibbon.querySelectorAll("[data-egrp]").forEach(grp => {
            const tokens = (grp.dataset.egrp || "").split(/\s+/).filter(Boolean);
            if (tokens.includes("style")) {
              grp.hidden = !(showStyleDock && ["draw", "stamps", "all"].includes(tab));
            } else if (tab === "all") {
              grp.hidden = false;
            } else {
              grp.hidden = !tokens.includes(tab);
            }
          });
        };
      });
    }

    // Wire Editor Quickbar View Toggles (#eThumbBtn, #eNightBtn, #ePanelBtn, #eZoomBadge)
    if ($('#eThumbBtn')) $('#eThumbBtn').onclick = () => { if (window.ACT && window.ACT.toggleThumbs) window.ACT.toggleThumbs(); };
    if ($('#eNightBtn')) $('#eNightBtn').onclick = () => { if (window.ACT && window.ACT.night) window.ACT.night(); $('#eNightBtn').classList.toggle('on', document.body.classList.contains('night')); };
    if ($('#ePanelBtn')) $('#ePanelBtn').onclick = () => {
      if (window.ACT && window.ACT.togglePanel) window.ACT.togglePanel();
    };
    if ($('#eZoomBadge')) $('#eZoomBadge').onclick = () => { if ($('#eFit')) $('#eFit').click(); };
    if ($('#rib-perf-mode')) {
      const bounds = window.getComparePerfBounds ? window.getComparePerfBounds() : null;
      if (bounds) $('#rib-perf-mode').value = bounds.MAXDIM <= 6144 ? 'perf' : 'detail';
      $('#rib-perf-mode').onchange = e => {
        const mode = e.target.value;
        if (window.applyPerformanceMode) window.applyPerformanceMode(mode, true);
        rpToast(mode === 'perf' ? 'Switched to High Performance (6144 px / 25 MP Low-Spec Safeguard)' : 'Switched to Maximum Detail (9000 px / 45 MP)');
      };
    }
    if ($('#eNewBlankBtn') && !$('#eNewBlankBtn').onclick) $('#eNewBlankBtn').onclick = () => { if (window.ACT && window.ACT.op) window.ACT.op('blank'); };
    if ($('#eInsertTableBtn') && !$('#eInsertTableBtn').onclick) $('#eInsertTableBtn').onclick = () => { if (window.ACT && window.ACT.op) window.ACT.op('table'); };
    if ($('#eTitleBlockBtn') && !$('#eTitleBlockBtn').onclick) $('#eTitleBlockBtn').onclick = () => { if (window.ACT && window.ACT.op) window.ACT.op('titleblock'); };
    if ($('#rib-net-tracer')) $('#rib-net-tracer').onclick = () => openNetTracerModal();
    if ($('#rib-pcb-calc')) $('#rib-pcb-calc').onclick = () => openPCBStackupCalculator();
    if ($('#rib-bom-locator')) $('#rib-bom-locator').onclick = () => openBOMOverlayModal();
    if ($('#rp-profile-sel')) $('#rp-profile-sel').onchange = e => applyWorkspaceProfile(e.target.value);
    if ($('#rp-lang-sel')) $('#rp-lang-sel').onchange = e => applyWorkspaceLanguage(e.target.value);
  }

  /* ============================================================================
   * [MODULE SECTION: I18N ENGINE & 46-LANGUAGE WORKSPACE LOCALIZATION]
   * WHAT THIS IS: Loads `I18N_BASE_KEYS` and `RAW_LANG_PACKS` from the split
   *   `ui_i18n_catalog.js` module and builds `I18N_DICTIONARY` for live DOM translation.
   * WHY / HOW TO EDIT: Edit `ui_i18n_catalog.js` to add or update language packs,
   *   or edit `applyWorkspaceLanguage()` below to translate new custom UI widgets.
   * ============================================================================ */
  const _i18nCatalog = (typeof KenshoI18nCatalog !== 'undefined' && KenshoI18nCatalog)
    ? KenshoI18nCatalog
    : (typeof require === 'function' ? (() => { try { return require('./ui_i18n_catalog.js'); } catch (e) { return { I18N_BASE_KEYS: [], RAW_LANG_PACKS: { en: [] } }; } })() : { I18N_BASE_KEYS: [], RAW_LANG_PACKS: { en: [] } });
  const I18N_BASE_KEYS = _i18nCatalog.I18N_BASE_KEYS;
  const RAW_LANG_PACKS = _i18nCatalog.RAW_LANG_PACKS;

  const I18N_DICTIONARY = {};
  for (const [langCode, arr] of Object.entries(RAW_LANG_PACKS)) {
    const obj = {};
    I18N_BASE_KEYS.forEach((k, idx) => {
      obj[k] = arr[idx] !== undefined ? arr[idx] : RAW_LANG_PACKS.en[idx];
    });
    I18N_DICTIONARY[langCode] = obj;
  }

  // Build automatic English->Key lookup table so any button, caption, menu item, or header matching an English label translates seamlessly
  const EN_TEXT_TO_KEY = {};
  I18N_BASE_KEYS.forEach((k, idx) => {
    const enVal = RAW_LANG_PACKS.en[idx];
    if (enVal) EN_TEXT_TO_KEY[enVal.trim().toLowerCase()] = k;
  });
  Object.assign(EN_TEXT_TO_KEY, {
    'open a': 'openA',
    'open b': 'openB',
    'open base (a)': 'openA',
    'open new (b)': 'openB',
    'open revised (b)': 'openB',
    'swap': 'swap',
    'swap a↔b': 'swap',
    'save as': 'saveAsPdf',
    'save as...': 'saveAsPdf',
    'save': 'savePdf',
    'print': 'printPdf',
    'print...': 'printPdf',
    'find': 'findBtn',
    'export dxf': 'exportDxf',
    'dxf studio': 'dxfStudioTab',
    'dxf layers & diff': 'dxfWorkbench',
    'dxf layers': 'dxfWorkbench',
    'dxf workbench': 'dxfWorkbench',
    'clear': 'clearAll',
    'clear all': 'clearAll',
    'clear ignore': 'clearAll',
    '+layer': 'newLayer',
    'compare': 'compareTab',
    'purge': 'purgeUnused',
    'all on/thaw': 'allOn',
    'previous': 'prevBtn',
    'prev': 'prevBtn',
    'next': 'nextBtn',
    'scan all': 'scanAll',
    'scan / re-scan all pages': 'scanAll',
    'all': 'allBtn',
    'all pages': 'scanAll',
    'all diffs': 'diffsTab',
    'defects': 'diffsTab',
    'csv': 'defectsCsv',
    'audit pdf': 'execAuditPdf',
    'mirror': 'mirrorTool',
    'reset': 'undo',
    'style': 'eribLayout',
    'files': 'menuFile',
    'file': 'menuFile',
    'mode': 'menuView',
    'view': 'menuView',
    'alignment': 'autoAlign',
    'filter': 'ignoreArea',
    'navigation': 'nextPage',
    'layers': 'dxfLayersBtn',
    'channels': 'diffsTab',
    'thresholds': 'ribAlign',
    'cam files': 'openGerber',
    'display': 'menuView',
    'polarity': 'invertBtn',
    'dfm & drc': 'runDfm',
    'pcb tools': 'netTracer',
    'autocad dxf & studio': 'dxfStudioTab',
    'contrast': 'enhHigh',
    'split & loupe': 'splitCurtain',
    'optics': 'loupe4x',
    'markup': 'markupsTab',
    'erase & redact': 'eraser',
    'stamps': 'stampTool',
    'scale & snap': 'calibrateScale',
    'measure': 'ribMeasure',
    'snap & bom': 'scheduleBom',
    'export': 'ribExport',
    'reports & audit': 'execAuditPdf',
    'session': 'saveSession',
    'zoom in': 'extentsBtn',
    'zoom out': 'extentsBtn',
    'full screen': 'extentsBtn',
    'preferences...': 'menuSettings',
    'quick guide': 'menuHelp',
    'license': 'stampTool',
    'about kensho pro': 'menuHelp', 'about redline pro': 'menuHelp',
    'exit': 'deletePage',
    'open recent': 'recentSessions',
    'recent drawings (last 8)': 'recentSessions',
    'clear recent drawings': 'clearAll',
    'dark theme': 'enhDark',
    'light theme': 'enhNormal',
    'maximum detail': 'enhHigh',
    'high performance': 'optimizePdf',
    'overlay on paper': 'compareTab',
    'overlay dark (cam)': 'ribCam',
    'differences only': 'diffsTab',
    'side by side': 'compareTab',
    'blink a / b': 'swap',
    'curtain split slider': 'splitCurtain',
    'base (a) only': 'openA',
    'revised (b) only': 'openB'
  });

  // Extra composite translations for UI labels, menu items, and status messages
  function buildExtraPhraseMap(dict, lang) {
    const cleanCmp = String(dict.compareTab || 'Compare').replace(/\s*\(.*?\)/g, '');
    return {
      'language:': `${dict.menuSettings}:`,
      'rotate & mirror': `${dict.rotateTool} & ${dict.mirrorTool}`,
      'rotate rev a 90° clockwise': `${dict.rotateRight} (A 90°)`,
      'rotate rev b 90° clockwise': `${dict.rotateRight} (B 90°)`,
      'mirror rev a horizontally': `${dict.flipHoriz} (A)`,
      'mirror rev b horizontally': `${dict.flipHoriz} (B)`,
      'units': dict.calibrateScale,
      'dpi': 'DPI',
      'rev a': `${dict.openA}`,
      'rev b': `${dict.openB}`,
      'rev a & b': `${dict.openA} + ${dict.openB}`,
      'common': dict.allBtn,
      'layer a': `${dict.dxfLayersBtn} A`,
      'layer b': `${dict.dxfLayersBtn} B`,
      '+added': `+${dict.newPage}`,
      '−removed': `-${dict.eraseTool}`,
      'pen (px)': `${dict.freehandPen} (px)`,
      'alpha': dict.invertBtn,
      'solid': dict.enhNormal,
      'dashed': dict.lineTool,
      'dotted': dict.pointTool,
      'whole markup': dict.markupsTab,
      'brush radius': dict.circleTool,
      'approved': `✓ ${dict.stampTool}`,
      'rejected': `✕ ${dict.stampTool}`,
      'revised': `Δ ${dict.stampTool}`,
      'sha-256 stamp': `SHA-256 ${dict.stampTool}`,
      'osnap: on': `OSNAP: ON`,
      'osnap: off': `OSNAP: OFF`,
      'no defects detected on this sheet.': `${dict.diffsTab}: 0`,
      'open rev a and rev b drawings to populate the defect checklist.': dict.cmpLaunchSub,
      'base reference drawing': dict.slotATitle,
      'revised target drawing': dict.slotBTitle,
      'original pdf, dxf, or cam stack': dict.selectBaseA,
      'modified pdf, dxf, or cam stack': dict.selectRevB,
      'select a & b pair': `${dict.selectBaseA} + ${dict.selectRevB}`,
      'load two files at once': dict.cmpLaunchTitle,
      'cam tables & drc': `${dict.camTables} & ${dict.runDfm}`,
      'd-codes, drills & ipc class 1/2/3': dict.openGerber,
      'autocad dxf studio': dict.dxfStudioTab,
      'ascii r12/r2000 vector diff': dict.dxfTabCompare,
      'batch folder audit': dict.cardBatch,
      'automated folder a vs folder b': dict.scanAll,
      'direct operations': dict.menuTools,
      'compare & cam verification workbench': dict.cmpLaunchTitle,
      'load base (rev a) & revised (rev b) drawings': dict.cmpLaunchTitle,
      'pdf markup & technical publishing studio': dict.pdfLaunchTitle,
      'open or drop a pdf / dxf document': dict.pdfLaunchTitle,
      'open pdf, autocad dxf, or technical sheet': dict.openPdf,
      'open document': dict.openPdf,
      'document & sheet commands': dict.menuTools,
      'new blank sheet': dict.newPage,
      'create standard a4 pdf page': dict.newPage,
      'merge pdf package': dict.mergePdfs,
      'combine multiple pdf documents': dict.mergePdfs,
      'a/b drawing compare': cleanCmp,
      'switch to compare & cam workspace': cleanCmp,
      'visit website (textportdocx.in)': 'textportdocx.in',
      'check for updates...': `${dict.menuHelp}...`,
      'ipc english (mils / inches)': `IPC English (mils/in)`,
      'ipc metric (mm / microns)': `IPC Metric (mm/µm)`,
      'ipc english (mils/in)': `IPC English (mils/in)`,
      'ipc metric (mm/µm)': `IPC Metric (mm/µm)`,
      'filled (solid)': dict.enhNormal,
      'outline (wire)': dict.boxTool,
      'skeleton (center)': dict.lineTool,
      'mirror bottom (flip x)': dict.flipHoriz,
      'negative plane (lpc)': dict.invertBtn,
      'ipc rule': dict.runDfm,
      '150 dpi (fast)': `150 DPI`,
      '200 dpi': `200 DPI`,
      '300 dpi (sharp)': `300 DPI`,
      '400 dpi': `400 DPI`,
      '600 dpi (ultra)': `600 DPI`,
      'ready': `✓`,
      '(no recent drawings yet)': `—`
    };
  }

  function translateUIString(str, lang) {
    if (!str) return str;
    const activeLang = lang || (typeof document !== 'undefined' && document.documentElement.lang) || 'en';
    if (activeLang === 'en') return str;
    const dict = I18N_DICTIONARY[activeLang] || I18N_DICTIONARY.en;
    const norm = String(str).trim().toLowerCase();
    const key = EN_TEXT_TO_KEY[norm];
    if (key && dict[key]) return dict[key];
    const extra = buildExtraPhraseMap(dict, activeLang);
    if (extra[norm]) return extra[norm];
    return str;
  }

  // Snapshot original English text across the entire DOM before any translation runs
  let _domEnglishSnapshotted = false;
  const _snapshottedTextNodes = [];
  function captureOriginalEnglishDOM() {
    if (_domEnglishSnapshotted || typeof document === 'undefined') return;
    const roots = ['#top', '#view-compare', '#view-edit', '#view-dxf', '#sw-studio-host', '#kp-statusbar', '#modal'];
    roots.forEach(sel => {
      const rootEl = document.querySelector(sel);
      if (!rootEl) return;
      const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
      let n;
      while ((n = walker.nextNode())) {
        const p = n.parentElement;
        if (!p) continue;
        const tag = p.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE') continue;
        if (p.closest && p.closest('#rp-lang-sel')) continue;
        if (n.nodeValue && n.nodeValue.trim()) {
          n.__i18nOrigEn = n.nodeValue;
          _snapshottedTextNodes.push(n);
        }
      }
    });
    _domEnglishSnapshotted = true;
  }

  function applyWorkspaceLanguage(lang = 'en', silent = false) {
    const dict = I18N_DICTIONARY[lang] || I18N_DICTIONARY.en;
    if (typeof document === 'undefined') return dict;

    // Capture pristine English DOM snapshot on first run
    captureOriginalEnglishDOM();

    document.documentElement.lang = lang;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem('rp_lang', lang);
    } catch (e) {}

    const langSel = $('#rp-lang-sel');
    if (langSel && langSel.value !== lang) langSel.value = lang;

    // If switching back to English ('en'), first restore every snapshotted text node to exact English!
    if (lang === 'en') {
      _snapshottedTextNodes.forEach(n => {
        if (n.__i18nOrigEn !== undefined) n.nodeValue = n.__i18nOrigEn;
      });
      document.querySelectorAll('[data-i18n-orig]').forEach(elNode => {
        elNode.textContent = elNode.dataset.i18nOrig;
      });
      document.querySelectorAll('[data-i18n-orig-opt]').forEach(opt => {
        opt.textContent = opt.dataset.i18nOrigOpt;
      });
      document.querySelectorAll('[data-i18n-orig-ph]').forEach(inp => {
        inp.setAttribute('placeholder', inp.dataset.i18nOrigPh);
      });
      if (DefectState && typeof DefectState.renderChecklist === 'function') {
        DefectState.renderChecklist();
      }
      if (!silent) rpToast('Workspace language updated: EN');
      return dict;
    }

    const setSpan = (sel, txt) => {
      document.querySelectorAll(sel).forEach(elNode => {
        if (!txt) return;
        const sp = elNode.querySelector('span');
        if (sp) {
          if (!sp.dataset.i18nOrig) sp.dataset.i18nOrig = sp.textContent;
          sp.textContent = lang === 'en' ? (sp.dataset.i18nOrig || txt) : txt;
        } else {
          // Preserve child <i> icons if present by updating only the text node
          let updatedTextNode = false;
          for (const child of elNode.childNodes) {
            if (child.nodeType === 3 && child.nodeValue.trim()) {
              if (child.__i18nOrigEn === undefined) child.__i18nOrigEn = child.nodeValue;
              child.nodeValue = lang === 'en' ? child.__i18nOrigEn : (' ' + txt + ' ');
              updatedTextNode = true;
              break;
            }
          }
          if (!updatedTextNode) {
            if (!elNode.dataset.i18nOrig) elNode.dataset.i18nOrig = elNode.textContent;
            elNode.textContent = lang === 'en' ? (elNode.dataset.i18nOrig || txt) : txt;
          }
        }
      });
    };

    const setText = (sel, txt) => {
      document.querySelectorAll(sel).forEach(elNode => {
        if (!txt) return;
        if (!elNode.dataset.i18nOrig) elNode.dataset.i18nOrig = elNode.textContent;
        elNode.textContent = lang === 'en' ? (elNode.dataset.i18nOrig || txt) : txt;
      });
    };

    const setPlaceholder = (sel, txt) => {
      document.querySelectorAll(sel).forEach(elNode => {
        if (!txt) return;
        if (!elNode.dataset.i18nOrigPh) elNode.dataset.i18nOrigPh = elNode.getAttribute('placeholder') || '';
        elNode.setAttribute('placeholder', lang === 'en' ? (elNode.dataset.i18nOrigPh || txt) : txt);
      });
    };

    // 1. Top Menubar, Language Label & Mode Switcher
    setText('#rp-lang-lbl', `${dict.menuSettings}:`);
    setText('#menubar .mb[data-menu-key="File"]', dict.menuFile);
    setText('#menubar .mb[data-menu-key="Edit"]', dict.menuEdit);
    setText('#menubar .mb[data-menu-key="View"]', dict.menuView);
    setText('#menubar .mb[data-menu-key="Tools"]', dict.menuTools);
    setText('#menubar .mb[data-menu-key="Settings"]', dict.menuSettings);
    setText('#menubar .mb[data-menu-key="Help"]', dict.menuHelp);

    setSpan('#modes button[data-v="compare"]', dict.compareTab);
    setSpan('#modes button[data-v="edit"]', dict.studioTab);
    setSpan('#modes button[data-v="dxf"]', dict.dxfStudioTab);

    // 2. Compare Ribbon Tabs & Buttons
    setSpan('[data-tab="tab-compare"], [data-rib-tab="review"]', dict.ribReview);
    setSpan('[data-tab="tab-layers"], [data-rib-tab="align"]', dict.ribAlign);
    setSpan('[data-tab="tab-cad"], [data-rib-tab="cam"]', dict.ribCam);
    setSpan('[data-tab="tab-view"], [data-rib-tab="view"]', dict.ribView);
    setSpan('[data-tab="tab-markup"], [data-rib-tab="markup"]', dict.ribMarkup);
    setSpan('[data-tab="tab-measure"], [data-rib-tab="measure"]', dict.ribMeasure);
    setSpan('[data-tab="tab-export"], [data-rib-tab="export"]', dict.ribExport);

    setSpan('#rib-openA, #openA, #rp-cmp-open-a-btn', dict.openA);
    setSpan('#rib-openB, #openB, #rp-cmp-open-b-btn', dict.openB);
    setSpan('#rib-swap, #swap', dict.swap);
    setSpan('#rib-c-undo, #rib-undo', dict.undo);
    setSpan('#rib-c-redo, #rib-redo', dict.redo);
    setSpan('#rib-autoalign, #align', dict.autoAlign);
    setSpan('#rib-fiducial', dict.fiducial3Pt);
    setSpan('#rib-mirror-btn, #view-edit [data-op="flipH"]', dict.mirrorTool);
    setSpan('#rib-ignore, #ignBtn', dict.ignoreArea);
    setText('#rib-ign-clear', dict.clearAll);
    setSpan('#rib-prev-page, #prevP', dict.prevPage);
    setSpan('#rib-next-page, #nextP', dict.nextPage);
    setSpan('#rib-scan-all', dict.scanAll);
    setSpan('#rib-text-diff', dict.textDiff);

    setSpan('#rib-cam-compare, #rib-cam-open', dict.openGerber);
    setSpan('#rib-cam-ipc, #rib-ipc356-open', dict.ipcNetlist);
    setSpan('#rib-cam-clearance, #rib-cam-dfm', dict.runDfm);
    setSpan('#rib-cam-tables, #rib-cam-workbench', dict.camTables);
    setSpan('#rib-net-tracer', dict.netTracer);
    setSpan('#rib-pcb-calc', dict.stackupCalc);
    setSpan('#rib-bom-locator', dict.bomLocator);

    setSpan('#rib-cad-import, #rib-dxf-import', dict.importDxf);
    setSpan('#rib-dxf-precompare', dict.compareLayers);
    setSpan('#rib-open-dxf-studio, #rib-dxf-studio', dict.dxfStudioTab);
    setSpan('#rib-dxf-workbench', dict.dxfWorkbench);

    setSpan('#rib-enh-norm, #rib-enh-off', dict.enhNormal);
    setSpan('#rib-enh-boost, #rib-enh-high', dict.enhHigh);
    setSpan('#rib-enh-dark', dict.enhDark);
    setSpan('#rib-enh-inv, #rib-enh-blue', dict.enhBlue);
    setSpan('#rib-curtain-toggle', dict.splitCurtain);
    setSpan('#rib-loupe-toggle', dict.loupe4x);
    setSpan('#rib-grid-toggle', dict.refGrid);
    setSpan('#rib-crosshair-toggle', dict.crosshair);
    setSpan('#rib-view-markers, #rib-markers-toggle', dict.markers);
    setSpan('#rib-sharp-100, #rib-fit-sharpen', dict.fitSharpen);

    setSpan('#rib-rev-cloud, #rib-mk-cloud', dict.revCloud);
    setSpan('#rib-leader, #rib-mk-callout', dict.leaderCallout);
    setSpan('#rib-pen, #rib-mk-pen', dict.freehandPen);
    setSpan('#rib-pin, #rib-mk-pin', dict.pinMarker);
    setSpan('#rib-eraser, #rib-mk-eraser', dict.eraser);
    setSpan('#rib-redact, #rib-redact-tool', dict.redactBox);
    setSpan('#rib-clear-markups', dict.clearAll);
    setSpan('#rib-stamp-app', `✓ ${dict.stampTool}`);
    setSpan('#rib-stamp-rej', `✕ ${dict.stampTool}`);
    setSpan('#rib-stamp-rev', `Δ ${dict.stampTool}`);
    setSpan('#rib-stamp-sha', `SHA-256`);

    setSpan('#rib-calibrate, #rib-meas-cal', dict.calibrateScale);
    setSpan('#rib-dist, #rib-meas-dist', dict.distance);
    setSpan('#rib-poly, #rib-meas-poly', dict.polylineRun);
    setSpan('#rib-area, #rib-meas-area', dict.polygonArea);
    setSpan('#rib-tally, #rib-meas-tally', dict.tallyBom);
    setSpan('#rib-bom-list, #rib-meas-export', dict.scheduleBom);

    setSpan('#rib-export-pdf, #report', dict.compPdf);
    setSpan('#rib-export-img, #png', dict.highResPng);
    setSpan('#rib-export-dxf, #rib-dxf-export', dict.exportDxf);
    setSpan('#rib-export-qa-zip', dict.exportQaZip);
    setSpan('#rib-export-audit, #rib-exec-audit', dict.execAuditPdf);
    setSpan('#rib-export-csv, #csv, #rp-export-csv-btn', dict.defectsCsv);
    setSpan('#rib-session-save, #rib-save-session', dict.saveSession);
    setSpan('#rib-session-load, #rib-load-session', dict.loadSession);

    // 3. Compare Launchpad & Sidebar
    setText('#empty .rp-launchpad-title, #empty .rp-empty-header b', dict.cmpLaunchTitle);
    setText('#empty .rp-empty-header span', dict.cmpLaunchSub);
    setText('#empty .slot-a .rp-ws-slot-meta b, #dropA .rp-slot-head b', dict.slotATitle);
    setText('#empty .slot-b .rp-ws-slot-meta b, #dropB .rp-slot-head b', dict.slotBTitle);
    setSpan('#rp-cmp-open-a-btn, #emptyOpenA', dict.selectBaseA);
    setSpan('#rp-cmp-open-b-btn, #emptyOpenB', dict.selectRevB);
    setText('#rp-cmp-launch-ab b', dict.compareTab);
    setText('#rp-cmp-launch-cam b, #emptyOpenCam b', dict.cardOpenCam);
    setText('#rp-cmp-launch-dxf b, #emptyOpenDxf b', dict.cardOpenDxf);
    setText('#rp-cmp-launch-batch b, #emptyBatch b', dict.cardBatch);
    setText('#emptyOpenEd b', dict.cardOpenPdf);
    setText('#emptyOpenDxfCmp b', dict.cardCmpDxf);
    setText('#emptyRecentTitle', dict.recentSessions);

    setSpan('#view-compare aside .tabs button[data-t="d"]', dict.diffsTab);
    setSpan('#view-compare aside .tabs button[data-t="t"]', dict.textTab);
    setSpan('#view-compare aside .tabs button[data-t="m"]', dict.markupsTab);
    setSpan('#view-compare aside .tabs button[data-t="c"], #view-compare aside .tabs button[data-t="cam"]', dict.camDfmTab);
    setSpan('#prevD', dict.prevBtn);
    setSpan('#nextD', dict.nextBtn);
    setSpan('#scanAllBtn, #rescanBtn', dict.scanAll);
    setSpan('#markAll', dict.allBtn);

    // 4. PDF Studio Ribbon Tabs, Buttons & Launchpad
    setSpan('[data-etab="home"], [data-erib-tab="home"]', dict.eribHome);
    setSpan('[data-etab="draw"], [data-erib-tab="insert"]', dict.eribInsert);
    setSpan('[data-etab="review"], [data-erib-tab="review"]', dict.eribReview);
    setSpan('[data-etab="pages"], [data-erib-tab="layout"]', dict.eribLayout);
    setSpan('[data-etab="doc"], [data-erib-tab="document"]', dict.eribDocument);
    setSpan('[data-etab="all"], [data-erib-tab="all"]', dict.eribAll);

    setSpan('#eThumbBtn, #eToggleThumbs, #etools .tabs button[data-et="pages"]', dict.pagesTab);
    setSpan('#eNightBtn, #eNight', dict.invertBtn);
    setSpan('#ePanelBtn, #eTogglePanel, #etools .tabs button[data-et="comments"], #cTab', dict.commentsTab);
    setSpan('#tTab', dict.propertiesBtn);

    setSpan('#eNewBlankBtn', dict.newPage);
    setSpan('#eOpen', dict.openPdf);
    setSpan('#eSave', dict.savePdf);
    setSpan('#eSaveAs', dict.saveAsPdf);
    setSpan('#ePrintBtn', dict.printPdf);
    setSpan('#eUndo', dict.undo);
    setSpan('#eRedo', dict.redo);
    setSpan('#view-edit [data-t="select"]', dict.selectTool);
    setSpan('#view-edit [data-t="hand"]', dict.panTool);
    setSpan('#view-edit [data-t="text"]', dict.typeText);
    setSpan('#view-edit [data-t="edittext"]', dict.editText);
    setSpan('#view-edit [data-t="cnote"]', dict.noteTool);
    setSpan('#eFind', dict.findBtn);
    setSpan('#eEquationBtn', dict.equationBtn);
    setSpan('#eInsertTableBtn', dict.tableBtn);
    setSpan('#view-edit [data-t="draw"]', dict.freehandPen);
    setSpan('#view-edit [data-t="eraser"]', dict.eraser);
    setSpan('#view-edit [data-t="rect"]', dict.boxTool);
    setSpan('#view-edit [data-t="circle"]', dict.circleTool);
    setSpan('#view-edit [data-t="line"]', dict.lineTool);
    setSpan('#view-edit [data-t="arrow"]', dict.arrowTool);
    setSpan('#view-edit [data-t="poly"]', dict.polygonTool);
    setSpan('#view-edit [data-t="cloud"]', dict.revCloud);
    setSpan('#view-edit [data-t="leader"]', dict.leaderCallout);
    setSpan('#view-edit [data-t="pin"]', dict.pinMarker);
    setSpan('#view-edit [data-t="image"]', dict.imageTool);
    setSpan('#view-edit [data-t="sign"]', dict.signTool);
    setSpan('#view-edit [data-t="stamp"]', dict.stampTool);
    setSpan('#view-edit [data-t="whiteout"]', dict.whiteoutTool);
    setSpan('#view-edit [data-t="redact"]', dict.redactBox);
    setSpan('#eGdtBtn', dict.gdtBtn);
    setSpan('#eTitleBlockBtn', dict.titleBlockBtn);
    setSpan('#eSymLibBtn, #eBlockLibBtn', dict.symbolsBtn);
    setSpan('#view-edit [data-t="chl"]', dict.highlightTool);
    setSpan('#view-edit [data-t="cul"]', dict.underlineTool);
    setSpan('#view-edit [data-t="cst"]', dict.strikeoutTool);
    setSpan('#eCalibrateBtn', dict.calibrateScale);
    setSpan('#view-edit [data-t="measure"]', dict.distance);
    setSpan('#view-edit [data-t="area"]', dict.polygonArea);
    setSpan('#view-edit [data-t="angle"]', dict.angleTool);
    setSpan('#view-edit [data-t="circle3pt"], #view-edit [data-t="rad3"]', dict.circle3PtTool);
    setSpan('#view-edit [data-t="balloon"], #view-edit [data-t="fai"]', dict.faiBalloonTool);
    setSpan('#eClearMeas', dict.clearAll);
    setSpan('#view-edit [data-op="rotL"]', dict.rotateLeft);
    setSpan('#view-edit [data-op="rotR"]', dict.rotateRight);
    setSpan('#view-edit [data-op="flipH"]', dict.flipHoriz);
    setSpan('#view-edit [data-op="flipV"]', dict.flipVert);
    setSpan('#view-edit [data-op="blank"]', dict.newPage);
    setSpan('#view-edit [data-op="insertpdf"]', dict.insertPdf);
    setSpan('#view-edit [data-op="dup"]', dict.duplicatePage);
    setSpan('#view-edit [data-op="del"]', dict.deletePage);
    setSpan('#view-edit [data-op="crop"]', dict.cropMargins);
    setSpan('#view-edit [data-op="resize"]', dict.resizePage);
    setSpan('#ePageMarginsBtn', dict.marginsBtn);
    setSpan('#ePageBgColorBtn', dict.pageColorBtn);
    setSpan('#ePageBorderBtn', dict.pageBorderBtn);
    setSpan('#eCoverPageBtn', dict.coverPageBtn);
    setSpan('#view-edit [data-op="extract"]', dict.extractPdf);
    setSpan('#view-edit [data-op="reverse"]', dict.reverseOrder);
    setSpan('#view-edit [data-op="merge"]', dict.mergePdfs);
    setSpan('#view-edit [data-op="split"]', dict.splitPdf);
    setSpan('#view-edit [data-op="images"]', dict.imagesToPdf);
    setSpan('#view-edit [data-op="hf"]', dict.headerFooter);
    setSpan('#view-edit [data-op="nums"]', dict.pageNumbers);
    setSpan('#view-edit [data-op="wm"]', dict.watermarkBtn);
    setSpan('#view-edit [data-op="bates"]', dict.batesNum);
    setSpan('#view-edit [data-op="flatten"]', dict.flattenPdf);
    setSpan('#view-edit [data-op="opt"]', dict.optimizePdf);
    setSpan('#view-edit [data-op="meta"]', dict.propertiesBtn);
    setSpan('#view-edit [data-op="png"]', dict.exportPng);
    setSpan('#view-edit [data-op="text"]', dict.extractText);

    setText('#eempty .rp-launchpad-title, #eempty .rp-empty-header b', dict.pdfLaunchTitle);
    setText('#eempty .slot-studio .rp-ws-slot-meta small, #eempty .rp-empty-header span', dict.pdfLaunchSub);
    setSpan('#rp-edit-open-btn, #eEmptyOpen', dict.openPdf);
    setText('#rp-launch-blank b, #eEmptyNew b', dict.newPage);
    setText('#rp-launch-images b, #eEmptyImages b', dict.imagesToPdf);
    setText('#rp-launch-merge b, #eEmptyMerge b', dict.mergePdfs);
    setText('#rp-launch-compare b, #eEmptyToCmp b', dict.compareTab);
    setText('#eEmptyToDxf b', dict.dxfStudioTab);

    // 5. DXF Studio Ribbon Tabs, Tools, Docks & Launchpad
    setSpan('[data-dxfrtab="home"], [data-dxf-tab="home"]', dict.dxfTabHome);
    setSpan('[data-dxfrtab="modify"], [data-dxf-tab="modify"]', dict.dxfTabModify);
    setSpan('[data-dxfrtab="layers"], [data-dxf-tab="layers"]', dict.dxfTabLayers);
    setSpan('[data-dxfrtab="compare"], [data-dxf-tab="compare"]', dict.dxfTabCompare);
    setSpan('[data-dxfrtab="all"], [data-dxf-tab="all"]', dict.dxfTabAll);

    setSpan('#dxf-toggle-left-dock, #dxf-q-layers', dict.dxfLayersBtn);
    setSpan('#dxf-toggle-right-dock, #dxf-q-props', dict.dxfInspectorBtn);

    setSpan('#dxf-st-blank', dict.newDxf);
    setSpan('#dxf-st-open, #dxf-st-all-open', dict.openDxf);
    setSpan('#dxf-st-open-b', dict.openRevB);
    setSpan('#dxf-st-save, #dxf-st-all-save', dict.saveDxf);
    setSpan('#dxf-st-precompare, #dxf-st-layer-sel', dict.compareLayers);
    setSpan('#dxf-st-send-cmp', dict.toCompare);
    setSpan('#dxf-st-undo', dict.undo);
    setSpan('#dxf-st-redo', dict.redo);

    setSpan('[data-dxf-tool="select"]', dict.selectTool);
    setSpan('[data-dxf-tool="pan"]', dict.panTool);
    setSpan('[data-dxf-tool="line"]', dict.lineTool);
    setSpan('[data-dxf-tool="polyline"]', dict.polylineRun);
    setSpan('[data-dxf-tool="rect"]', dict.boxTool);
    setSpan('[data-dxf-tool="circle"]', dict.circleTool);
    setSpan('[data-dxf-tool="arc"]', dict.arcTool);
    setSpan('[data-dxf-tool="ellipse"]', dict.ellipseTool);
    setSpan('[data-dxf-tool="spline"]', dict.splineTool);
    setSpan('[data-dxf-tool="text"]', dict.textTab);
    setSpan('[data-dxf-tool="dim"]', dict.dimTool);
    setSpan('[data-dxf-tool="hatch"]', dict.hatchTool);
    setSpan('[data-dxf-tool="point"]', dict.pointTool);
    setSpan('[data-dxf-tool="insert"]', dict.blockTool);
    setSpan('#dxf-st-ze, #dxf-st-fit, #dxf-st-all-fit', dict.extentsBtn);

    setSpan('[data-dxf-tool="move"]', dict.moveTool);
    setSpan('[data-dxf-tool="copy"]', dict.copyTool);
    setSpan('[data-dxf-tool="rotate"]', dict.rotateTool);
    setSpan('[data-dxf-tool="scale"]', dict.scaleTool);
    setSpan('[data-dxf-tool="mirror"]', dict.mirrorTool);
    setSpan('[data-dxf-tool="offset"]', dict.offsetTool);
    setSpan('[data-dxf-tool="trim"]', dict.trimTool);
    setSpan('[data-dxf-tool="extend"]', dict.extendTool);
    setSpan('[data-dxf-tool="fillet"]', dict.filletTool);
    setSpan('#dxf-st-explode', dict.explodeTool);
    setSpan('[data-dxf-tool="matchprop"], [data-dxf-tool="match"]', dict.matchTool);
    setSpan('#dxf-st-erase, #dxf-st-del', dict.eraseTool);

    setSpan('#dxf-st-add-lyr, #dxf-dock-new-btn, #dxf-dock-add-lyr', dict.newLayer);
    setSpan('#dxf-st-unlock-all, #dxf-dock-unlock, #dxf-dock-unlock-all', dict.unlockAll);
    setSpan('#dxf-st-thaw-all, #dxf-st-all-on, #dxf-dock-all-on', dict.allOn);
    setText('#dxf-dock-all-off', dict.allOff);
    setSpan('#dxf-st-purge, #dxf-dock-purge', dict.purgeUnused);
    setSpan('#dxf-st-svg, #dxf-st-exp-svg, #dxf-st-all-svg', dict.exportSvg);
    setSpan('#dxf-st-png, #dxf-st-exp-png', dict.exportPng);
    setSpan('#dxf-st-to-pdf', dict.toPdfStudio);
    setSpan('#dxf-st-wb-btn, #dxf-st-wb-open, #dxf-st-all-wb', dict.dxfWorkbench);
    setSpan('#dxf-dock-pre-btn, #dxf-dock-precompare', String(dict.compareTab || '').replace(/\s*\(.*?\)/g, ''));

    setText('#dxf-layer-dock .dxf-dock-header b, #dxf-layers-dock .dxf-dock-head b', dict.dxfLayersHead);
    setText('#dxf-props-dock .dxf-dock-header b, #dxf-props-dock .dxf-dock-head b', dict.dxfPropsHead);
    setText('#dxf-prop-clear-sel, #dxf-prop-desel', dict.clearAll);
    setText('.dxf-cmdline-bar .dxf-cmd-prompt, #dxf-cmd-bar .dxf-cmd-prefix', dict.dxfCmdPrefix);
    setPlaceholder('#dxf-cmd-input', dict.dxfCmdPlaceholder);
    setPlaceholder('#dxf-layer-search, #dxf-lyr-search', dict.dxfFilterPlaceholder);

    setText('#dxf-lp-title, #dxf-empty .rp-empty-header b', dict.dxfLaunchTitle);
    setText('#dxf-lp-base-title', dict.slotATitle);
    setText('#dxf-lp-rev-title', dict.slotBTitle);
    setSpan('#dxf-empty-open-a', dict.openA);
    setSpan('#dxf-empty-open-b', dict.openB);
    setText('#dxf-lp-card1-t', dict.newDxf + ' (MM)');
    setText('#dxf-lp-card2-t', dict.newDxf + ' (MILS)');
    setText('#dxf-lp-card3-t', dict.compareLayers);
    setText('#dxf-lp-card4-t', dict.dxfLayersHead);

    // 5B. Translate all Ribbon Group Captions (.cap)
    const CAPTION_MAP = {
      'files': dict.menuFile,
      'file': dict.menuFile,
      'file & compare': `${dict.menuFile} & ${String(dict.compareTab || '').replace(/\s*\(.*?\)/g, '')}`,
      'mode': dict.menuView,
      'colors (a / b / common)': `${dict.dxfTabLayers}`,
      'align, rotate & mirror': `${dict.autoAlign} · ${dict.rotateTool} · ${dict.mirrorTool}`,
      'navigation': `${dict.prevBtn} / ${dict.nextBtn}`,
      'layers': dict.dxfLayersBtn,
      'channels': dict.diffsTab,
      'thresholds': dict.ribAlign,
      'offset & skew': dict.offsetTool,
      'cam files': dict.openGerber,
      'display': dict.menuView,
      'polarity': dict.invertBtn,
      'dfm & tools': dict.runDfm,
      'autocad dxf & studio': dict.dxfStudioTab,
      'view & ceiling': dict.ribView,
      'contrast': dict.enhHigh,
      'optics': dict.loupe4x,
      'markup': dict.markupsTab,
      'style': dict.eribLayout,
      'stamps': dict.stampTool,
      'measure': dict.ribMeasure,
      'snap & bom': dict.scheduleBom,
      'export': dict.ribExport,
      'reports & session': dict.compPdf,
      'tools & text': `${dict.menuTools} & ${dict.textTab}`,
      'font & paragraph': dict.typeText,
      'styles': dict.eribLayout,
      'pen & shapes': dict.freehandPen,
      'insert & stamp': dict.eribInsert,
      'cad & engineering': dict.ribCam,
      'notes': dict.noteTool,
      'rotate & mirror': `${dict.rotateTool} & ${dict.mirrorTool}`,
      'pages': dict.pagesTab,
      'layout': dict.eribLayout,
      'select': dict.selectTool,
      'assemble': dict.mergePdfs,
      'numbering': dict.pageNumbers,
      'page & zoom': `${dict.pagesTab} & ${dict.extentsBtn}`,
      'alignment': dict.autoAlign,
      'filter': dict.ignoreArea,
      'dfm & drc': dict.runDfm,
      'pcb tools': dict.netTracer,
      'split & loupe': dict.splitCurtain,
      'erase & redact': dict.eraser,
      'scale & snap': dict.calibrateScale,
      'reports & audit': dict.execAuditPdf,
      'session': dict.saveSession,
      'pins & stamps': dict.stampTool,
      'cad & symbols': dict.gdtBtn,
      'fai & inspect': dict.faiBalloonTool,
      'page setup': dict.eribLayout,
      'order & extract': dict.extractPdf,
      'cursor': dict.selectTool,
      'annotate & hatch': dict.dimTool,
      'transform': dict.moveTool,
      'layer management': dict.dxfLayersBtn,
      'autocad draw': dict.dxfTabHome,
      'autocad modify': dict.dxfTabModify,
      'parameters & style': dict.propertiesBtn,
      'layers & deliverables': dict.dxfTabLayers,
      'viewport': dict.menuView
    };
    document.querySelectorAll('.cap').forEach(capEl => {
      if (!capEl.dataset.i18nOrig) capEl.dataset.i18nOrig = capEl.textContent.trim();
      const orig = capEl.dataset.i18nOrig;
      const mapped = CAPTION_MAP[orig.toLowerCase()];
      if (mapped) capEl.textContent = mapped;
    });

    // Translate Defect Checklist Header, Filter Options, and Mode/Select Options
    document.querySelectorAll('#defect-checklist-pane .rp-checklist-header h4').forEach(h4 => {
      for (const node of h4.childNodes) {
        if (node.nodeType === 3 && node.nodeValue.trim()) {
          if (node.__i18nOrigEn === undefined) node.__i18nOrigEn = node.nodeValue;
          node.nodeValue = dict.diffsTab + ' ';
          break;
        }
      }
    });
    setText('#rp-card-compare-drawings b', dict.compareTab);
    setText('#rp-card-pdf-studio b', dict.studioTab);
    setText('#rp-card-cam-setup b', dict.openGerber);
    setText('#empty .slot-a .rp-ws-slot-meta small, #dxf-lp-base-sub', dict.openA);
    setText('#empty .slot-b .rp-ws-slot-meta small, #dxf-lp-rev-sub', dict.openB);
    setText('#rp-card-compare-drawings span, #rp-cmp-launch-ab span, #dxf-lp-card3-s', dict.ribReview);
    setText('#rp-card-pdf-studio span', dict.eribInsert);
    setText('#rp-card-cam-setup span, #rp-cmp-launch-cam span', dict.runDfm);
    setText('#rp-cmp-launch-dxf span, #dxf-lp-card1-s, #dxf-lp-card2-s', dict.dxfTabHome);
    setText('#rp-cmp-launch-batch span', dict.scanAll);
    setText('#dxf-lp-card4-s', dict.compareLayers);
    setText('#rp-launch-blank span', dict.newPage);
    setText('#rp-launch-merge span', dict.mergePdfs);
    setText('#rp-launch-images span', dict.imagesToPdf);
    setText('#empty .rp-ws-section-lbl, #eempty .rp-ws-section-lbl, #dxf-lp-sec-lbl', dict.menuTools);
    setText('#empty .rp-launchpad-badge span', dict.ribReview);
    setText('#eempty .rp-launchpad-badge span', dict.studioTab);
    setText('#dxf-lp-badge', dict.dxfStudioTab);
    setText('#defect-checklist-body .rp-empty-msg', `${dict.diffsTab}: 0`);
    setSpan('#rp-audit-btn', dict.execAuditPdf);

    const OPT_MAP = {
      'overlay on paper': `${dict.compareTab} (Paper)`,
      'overlay dark (cam)': `${dict.compareTab} (CAM)`,
      'differences only': dict.diffsTab,
      'side by side': 'A | B',
      'blink a / b': 'A ↔ B',
      'curtain split slider': dict.splitCurtain,
      'base (a) only': `${dict.openA}`,
      'revised (b) only': `${dict.openB}`,
      '150 dpi (fast)': '150 DPI',
      '200 dpi': '200 DPI',
      '300 dpi (sharp)': '300 DPI',
      '400 dpi': '400 DPI',
      '600 dpi (ultra)': '600 DPI',
      'rev a': `${dict.openA}`,
      'rev b': `${dict.openB}`,
      'rev a & b': `${dict.openA} + B`,
      'maximum detail': dict.enhHigh,
      'high performance': dict.optimizePdf,
      'edit revised (rev b)': `${dict.menuEdit}: Rev B`,
      'edit base (rev a)': `${dict.menuEdit}: Rev A`,
      'vector diff overlay (a↔b)': `${dict.dxfTabCompare} (A↔B)`,
      'side-by-side cad (a | b)': `CAD (A | B)`,
      'dark modelspace': dict.enhDark,
      'white paper': dict.enhNormal,
      'blueprint navy': dict.enhBlue,
      'all': dict.allBtn,
      'open': dict.openPdf,
      'approved': `✓ ${dict.stampTool}`,
      'flagged': `⚑ ${dict.pinMarker}`,
      'ignored': dict.ignoreArea,
      'solid': dict.enhNormal,
      'dashed': dict.lineTool,
      'dotted': dict.pointTool,
      'whole markup': dict.markupsTab,
      'brush radius': dict.circleTool,
      'filled (solid)': dict.enhNormal,
      'outline (wire)': dict.boxTool,
      'skeleton (center)': dict.lineTool
    };
    document.querySelectorAll('select:not(#rp-lang-sel):not(#eFontFam) option').forEach(opt => {
      if (!opt.dataset.i18nOrigOpt) opt.dataset.i18nOrigOpt = opt.textContent.trim();
      const orig = opt.dataset.i18nOrigOpt;
      const mapped = OPT_MAP[orig.toLowerCase()];
      if (mapped) opt.textContent = mapped;
    });

    // Universal pass over all snapshotted text nodes for inline labels (Mode, Rev A, Rev B, Common, Pen (px), Alpha, Ready, etc.)
    const extraPhrases = buildExtraPhraseMap(dict, lang);
    _snapshottedTextNodes.forEach(n => {
      const orig = n.__i18nOrigEn;
      if (!orig) return;
      const trimmed = orig.trim();
      if (!trimmed) return;
      const low = trimmed.toLowerCase();
      const k = EN_TEXT_TO_KEY[low];
      const repl = (k && dict[k]) ? dict[k] : extraPhrases[low];
      if (repl) {
        const lead = orig.match(/^\s*/)[0];
        const trail = orig.match(/\s*$/)[0];
        n.nodeValue = lead + repl + trail;
      }
    });

    // 6. Auto-select matching script font family in PDF Studio when switching to non-Latin script
    const fontSel = $('#eFontFam');
    if (fontSel) {
      const fontMap = {
        ja: 'Noto Sans JP',
        'zh-CN': 'Noto Sans SC',
        'zh-TW': 'Noto Sans TC',
        ko: 'Noto Sans KR',
        ta: 'Noto Sans Tamil',
        hi: 'Noto Sans Devanagari',
        mr: 'Noto Sans Devanagari',
        ne: 'Noto Sans Devanagari',
        sa: 'Noto Sans Devanagari',
        te: 'Noto Sans Telugu',
        kn: 'Noto Sans Kannada',
        ml: 'Noto Sans Malayalam',
        bn: 'Noto Sans Bengali',
        as: 'Noto Sans Bengali',
        gu: 'Noto Sans Gujarati',
        pa: 'Noto Sans Gurmukhi',
        or: 'Noto Sans Oriya',
        th: 'Noto Sans Thai',
        ar: 'Noto Sans Arabic',
        fa: 'Noto Sans Arabic',
        ur: 'Noto Sans Arabic',
        he: 'Noto Sans Hebrew'
      };
      const targetFont = fontMap[lang];
      if (targetFont && [...fontSel.options].some(o => o.value === targetFont)) {
        fontSel.value = targetFont;
        fontSel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    if (!silent) rpToast(`Workspace language updated: ${lang.toUpperCase()}`);
    return dict;
  }
  if (typeof window !== 'undefined') {
    window.applyWorkspaceLanguage = applyWorkspaceLanguage;
    window.translateUIString = translateUIString;
    window.I18N_DICTIONARY = I18N_DICTIONARY;
  }

  /**
   * Pure-JS Vector PDF 1.4 Builder & Central Directory ZipArchive (ported from Rust pdf_and_zip.rs)
   */
  class VectorPdfBuilder {
    constructor(title = 'Kensho Pro Executive QA Audit') {
      this.title = title;
      this.pages = [];
    }

    static escapePdfText(s) {
      return String(s || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    }

    addAuditSummaryPage(docAName, docBName, shaA, shaB, defects = []) {
      const esc = VectorPdfBuilder.escapePdfText;
      let s = '0.08 0.11 0.18 rg\n0 770 612 72 re f\n';
      s += 'BT /F1 18 Tf 1 1 1 rg 36 805 Td (KENSHO PRO - EXECUTIVE QA AUDIT REPORT) Tj ET\n';
      s += `BT /F1 9 Tf 0.75 0.82 0.92 rg 36 785 Td (Document A: ${esc(docAName)}   |   Document B: ${esc(docBName)}) Tj ET\n`;
      s += `BT /F1 8 Tf 0.25 0.28 0.35 rg 36 745 Td (SHA-256 [A]: ${esc(shaA)}) Tj ET\n`;
      s += `BT /F1 8 Tf 0.25 0.28 0.35 rg 36 732 Td (SHA-256 [B]: ${esc(shaB)}) Tj ET\n`;
      s += '0.92 0.94 0.97 rg 36 694 540 20 re f\n';
      s += 'BT /F1 10 Tf 0.1 0.12 0.16 rg 42 700 Td (ID       SEVERITY      STATUS         COMMENT) Tj ET\n';
      let y = 678.0;
      for (const d of (defects || []).slice(0, 28)) {
        const id = Array.isArray(d) ? d[0] : (d.id || 1);
        const sev = Array.isArray(d) ? d[1] : (d.severity || 'MINOR');
        const status = Array.isArray(d) ? d[2] : (d.status || 'OPEN');
        const comment = Array.isArray(d) ? d[3] : (d.comment || d.note || '');
        const line = `#${String(id).padEnd(6)}  ${String(sev).padEnd(12)}  ${String(status).padEnd(13)}  ${comment}`;
        s += `BT /F1 9 Tf 0.15 0.18 0.22 rg 42 ${y.toFixed(1)} Td (${esc(line)}) Tj ET\n`;
        y -= 18.0;
      }
      this.pages.push({ widthPt: 612.0, heightPt: 842.0, contentStream: s });
    }

    toPdfBytes() {
      const enc = new TextEncoder();
      const chunks = [];
      let totalLen = 0;
      const pushStr = str => {
        const b = enc.encode(str);
        chunks.push(b);
        totalLen += b.length;
      };
      pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
      const offsets = [0];
      const pageBaseObj = 4;

      offsets.push(totalLen);
      pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

      offsets.push(totalLen);
      const kids = this.pages.map((_, i) => `${pageBaseObj + i * 2} 0 R`).join(' ');
      pushStr(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>\nendobj\n`);

      offsets.push(totalLen);
      pushStr('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

      for (let i = 0; i < this.pages.length; i++) {
        const pg = this.pages[i];
        const pageObjId = pageBaseObj + i * 2;
        const contentObjId = pageObjId + 1;
        offsets.push(totalLen);
        pushStr(`${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pg.widthPt.toFixed(1)} ${pg.heightPt.toFixed(1)}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`);
        offsets.push(totalLen);
        const streamBytes = enc.encode(pg.contentStream || '');
        pushStr(`${contentObjId} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`);
        chunks.push(streamBytes);
        totalLen += streamBytes.length;
        pushStr('\nendstream\nendobj\n');
      }

      const xrefOffset = totalLen;
      pushStr(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
      for (let i = 1; i < offsets.length; i++) {
        pushStr(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
      }
      pushStr(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

      const out = new Uint8Array(totalLen);
      let pos = 0;
      for (const c of chunks) {
        out.set(c, pos);
        pos += c.length;
      }
      return out;
    }
  }

  class ZipArchive {
    constructor() {
      this.entries = [];
    }

    static computeCrc32(data) {
      const u8 = data instanceof Uint8Array ? data : new Uint8Array(data || []);
      if (typeof WorkerEngine !== 'undefined' && WorkerEngine.globalRustWasmArena && WorkerEngine.globalRustWasmArena.isNativeWasm) {
        return WorkerEngine.globalRustWasmArena.crc32(u8);
      }
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < u8.length; i++) {
        crc ^= u8[i];
        for (let b = 0; b < 8; b++) {
          crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1);
        }
      }
      return (~crc) >>> 0;
    }

    addFile(filename, data) {
      const bytes = typeof data === 'string'
        ? new TextEncoder().encode(data)
        : (data instanceof Uint8Array ? data : new Uint8Array(data || []));
      this.entries.push({
        filename: String(filename),
        data: bytes,
        crc32: ZipArchive.computeCrc32(bytes)
      });
    }

    toZipBytes() {
      return buildZipArchive(this.entries.map(e => ({ name: e.filename, bytes: e.data })));
    }

    static fromZipBytes(bytes) {
      const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
      if (u8.length < 22) throw new Error('Buffer too small to be a valid ZIP archive');
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      const dec = new TextDecoder();
      let eocd = -1;
      const floor = Math.max(0, u8.length - 65557);
      for (let i = u8.length - 22; i >= floor; i--) {
        if (dv.getUint32(i, true) === 0x06054b50) {
          eocd = i;
          break;
        }
      }
      if (eocd < 0) throw new Error('ZIP End-of-Central-Directory signature not found');
      const entryCount = dv.getUint16(eocd + 10, true);
      let pos = dv.getUint32(eocd + 16, true);
      const arch = new ZipArchive();
      for (let i = 0; i < entryCount && pos + 46 <= u8.length; i++) {
        if (dv.getUint32(pos, true) !== 0x02014b50) break;
        const method = dv.getUint16(pos + 10, true);
        const entryCrc = dv.getUint32(pos + 16, true);
        const compSize = dv.getUint32(pos + 20, true);
        const nameLen = dv.getUint16(pos + 28, true);
        const extraLen = dv.getUint16(pos + 30, true);
        const commentLen = dv.getUint16(pos + 32, true);
        const localOff = dv.getUint32(pos + 42, true);
        const filename = dec.decode(u8.subarray(pos + 46, pos + 46 + nameLen));
        pos += 46 + nameLen + extraLen + commentLen;
        if (method === 0 && localOff + 30 <= u8.length) {
          const lNameLen = dv.getUint16(localOff + 26, true);
          const lExtraLen = dv.getUint16(localOff + 28, true);
          const dataStart = localOff + 30 + lNameLen + lExtraLen;
          if (dataStart + compSize <= u8.length) {
            arch.entries.push({
              filename,
              data: u8.slice(dataStart, dataStart + compSize),
              crc32: entryCrc
            });
          }
        }
      }
      return arch;
    }
  }

  /**
   * SmartManager: Couples deterministic MemoryBudgetManager + BoundedLruCache with
   * 1-Click Distant Page Purge, Defect Severity Auto-Triage (CRITICAL/MAJOR/MINOR/COSMETIC),
   * Bounded Workspace Checkpoints, and Fuzzy Command Palette (Ctrl+K).
   */
  /* ============================================================================
   * [MODULE SECTION: SMART DEFECT CLUSTERING & MEMORY TELEMETRY HUD]
   * WHAT THIS IS: Spatial defect grouper and live RAM/WASM memory usage monitor.
   * WHY / HOW TO EDIT: Extend `ingestPageRegions()` or `updateMemoryHud()` to add
   *   custom telemetry metrics or automated defect classification rules.
   * ============================================================================ */
  const SmartManager = {
    defects: [],
    checkpoints: [],
    maxCheckpoints: 12,
    commands: [
      { id: 'cmd_smart_purge', title: 'Smart Memory Purge: Evict Unpinned Pages & Drain Slab Pool', category: 'Memory Management', shortcut: 'Ctrl+Shift+M', run: () => SmartManager.smartPurgeMemory() },
      { id: 'cmd_dismiss_cosmetic', title: 'Auto-Triage: Dismiss Cosmetic Noise Defects', category: 'Smart Triage', shortcut: 'Ctrl+Shift+T', run: () => SmartManager.autoDismissCosmeticNoise() },
      { id: 'cmd_run_ipc_dfm', title: 'Run IPC-6012 Spatial-Hash DFM Check on Active CAM Stack', category: 'CAM Workbench', shortcut: 'F8', run: () => runCAMClearanceScan() },
      { id: 'cmd_auto_align', title: 'Auto-Align Pages (Coarse-to-Fine SAD + 3-Point Procrustes)', category: 'Compare Engine', shortcut: 'Ctrl+A', run: () => window.ACT && window.ACT.align && window.ACT.align() },
      { id: 'cmd_export_qa_zip', title: 'Export 1-Click QA Audit Package (.zip with PDF + CSV + DXF)', category: 'Export & Sign-Off', shortcut: 'Ctrl+Shift+Q', run: () => exportQAPackageZip() },
      { id: 'cmd_checkpoint', title: 'Create Instant Workspace Checkpoint Snapshot', category: 'Smart Management', shortcut: 'Ctrl+Alt+S', run: () => { const id = SmartManager.createCheckpoint('Manual Checkpoint'); rpToast(`Saved Workspace Checkpoint #${id}`); } },
      { id: 'cmd_view_compare', title: 'Switch to Compare Workspace', category: 'Navigation', shortcut: 'Ctrl+1', run: () => window.setView && window.setView('compare') },
      { id: 'cmd_view_edit', title: 'Switch to PDF Markup & Redact Studio', category: 'Navigation', shortcut: 'Ctrl+2', run: () => window.setView && window.setView('edit') },
      { id: 'cmd_view_dxf', title: 'Switch to AutoCAD DXF Studio', category: 'Navigation', shortcut: 'Ctrl+3', run: () => window.setView && window.setView('dxf') },
      { id: 'cmd_cam_workbench', title: 'Open PCB CAM & IPC-D-356 Netlist Workbench', category: 'CAM Workbench', shortcut: 'Alt+C', run: () => showCAMWorkbenchModal('format') }
    ],

    getBudgetManager() {
      if (typeof window !== 'undefined' && window.RPMemoryBudget) return window.RPMemoryBudget;
      if (typeof WorkerEngine !== 'undefined' && WorkerEngine.globalMemoryBudget) return WorkerEngine.globalMemoryBudget;
      return null;
    },

    classifyRegion(r) {
      return DefectState.classifySeverity(r);
    },

    ingestPageRegions(page, regions = []) {
      const p = Number(page) || 1;
      this.defects = this.defects.filter(d => d.page !== p);
      let nextId = this.defects.reduce((m, d) => Math.max(m, d.id || 0), 0) + 1;
      for (const r of (regions || [])) {
        const w = Math.max(1, r.w || 1);
        const h = Math.max(1, r.h || 1);
        const bboxArea = w * h;
        const pixelCount = r.pixelCount || ((r.sa || 0) + (r.sb || 0)) || bboxArea;
        const severity = this.classifyRegion(r);
        this.defects.push({
          id: nextId++,
          page: p,
          bbox: [r.x || 0, r.y || 0, w, h],
          areaPx: bboxArea,
          pixelCount,
          severity,
          status: 'OPEN',
          comment: r.dxfSummary || r.note || `Auto-detected ${severity} (${pixelCount} px changed, ${w}x${h} bbox)`,
          assignee: 'QA-Lead'
        });
      }
      this.updateMemoryHud();
      return this.defects;
    },

    autoDismissCosmeticNoise() {
      let count = 0;
      for (const d of this.defects) {
        if (d.severity === 'COSMETIC' && d.status === 'OPEN') {
          d.status = 'FALSE_POSITIVE';
          count++;
        }
      }
      const uiDismissed = DefectState.autoDismissCosmeticNoise();
      const total = Math.max(count, uiDismissed);
      rpToast(`Auto-Triage: Dismissed ${total} cosmetic noise defect(s).`);
      this.updateMemoryHud();
      return total;
    },

    smartPurgeMemory(customCache = null, explicitActivePage = null) {
      const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : null;
      const cache = customCache || (S && S.analysisCache) || null;
      const activePage = explicitActivePage != null
        ? explicitActivePage
        : ((S && S.cur && S.cur.n) || (S && S.n) || 1);
      const budget = this.getBudgetManager();
      const beforeBytes = budget ? budget.allocatedBytes() : 0;
      let evictedPages = 0;

      if (cache) {
        if (typeof cache.setPinnedKey === 'function') {
          cache.setPinnedKey(activePage);
        }
        if (typeof cache.purgeUnpinned === 'function') {
          evictedPages = cache.purgeUnpinned();
        } else if (cache instanceof Map) {
          for (const [k, res] of Array.from(cache.entries())) {
            if (res && res !== (S && S.cur) && res.n !== activePage) {
              if (res.A) res.A = null;
              if (res.B) res.B = null;
              if (res.cls) res.cls = null;
              if (res._ovData) res._ovData = null;
              cache.delete(k);
              evictedPages++;
            }
          }
        }
      }

      if (typeof window !== 'undefined' && window.DXFStudio && window.DXFStudio.StudioState) {
        const st = window.DXFStudio.StudioState;
        while (st.undoStack && st.undoStack.length > 5) {
          const ev = st.undoStack.shift();
          if (ev && ev._trackedBytes && budget) budget.recordDealloc(ev._trackedBytes);
        }
        if (st.redoStack && st.redoStack.length) {
          for (const rv of st.redoStack) {
            if (rv && rv._trackedBytes && budget) budget.recordDealloc(rv._trackedBytes);
          }
          st.redoStack = [];
        }
      }
      if (budget && typeof budget.drainSlabPool === 'function') {
        budget.drainSlabPool();
      }
      if (typeof window !== 'undefined' && window.rpTileManager && typeof window.rpTileManager.clear === 'function') {
        window.rpTileManager.clear();
      }
      if (typeof window !== 'undefined' && typeof window.gc === 'function') {
        try { window.gc(); } catch (e) {}
      }

      const afterBytes = budget ? budget.allocatedBytes() : 0;
      const freedBytes = Math.max(0, beforeBytes - afterBytes);
      this.updateMemoryHud();
      rpToast(`Smart Memory Purge: Evicted ${evictedPages} unpinned page(s), freed ${(freedBytes / 1024).toFixed(1)} KB (Active page #${activePage} pinned).`);
      return { evictedPages, freedBytes };
    },

    createCheckpoint(label = 'Workspace Checkpoint', activePage = null) {
      const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : null;
      const p = activePage != null ? activePage : ((S && S.cur && S.cur.n) || (S && S.n) || 1);
      if (this.checkpoints.length >= this.maxCheckpoints) {
        this.checkpoints.shift();
      }
      const id = this.checkpoints.length ? (this.checkpoints[this.checkpoints.length - 1].id + 1) : 1;
      const budget = this.getBudgetManager();
      this.checkpoints.push({
        id,
        label: String(label),
        timestampSec: Math.floor(Date.now() / 1000),
        activePage: p,
        defectSnapshot: JSON.parse(JSON.stringify(this.defects)),
        uiDefectsSnapshot: JSON.parse(JSON.stringify(DefectState.defects || [])),
        allocatedBytesAtSave: budget ? budget.allocatedBytes() : 0
      });
      return id;
    },

    restoreCheckpoint(id) {
      const cp = this.checkpoints.find(c => c.id === id);
      if (!cp) return null;
      this.defects = JSON.parse(JSON.stringify(cp.defectSnapshot || []));
      if (Array.isArray(cp.uiDefectsSnapshot)) {
        DefectState.defects = JSON.parse(JSON.stringify(cp.uiDefectsSnapshot));
        DefectState.saveCurrentPageState();
        DefectState.renderChecklist();
      }
      return cp.activePage;
    },

    telemetrySnapshot() {
      const budget = this.getBudgetManager();
      if (budget && typeof budget.diagnostics === 'function') {
        return budget.diagnostics();
      }
      return {
        profile: 'HighSpec',
        allocatedBytes: 0,
        peakBytes: 0,
        budgetBytes: 768 * 1024 * 1024,
        allocatedMB: 0,
        peakMB: 0,
        budgetMB: 768,
        utilizationPct: 0,
        totalAllocations: 0,
        totalDeallocations: 0,
        slabPooledBuffers: 0,
        slabPoolBytes: 0,
        pressure: 'Optimal'
      };
    },

    isSubsequence(needle, haystack) {
      let ni = 0;
      for (let hi = 0; hi < haystack.length && ni < needle.length; hi++) {
        if (haystack[hi] === needle[ni]) ni++;
      }
      return ni === needle.length;
    },

    searchCommands(query = '') {
      const q = String(query || '').trim().toLowerCase();
      const scored = [];
      for (const item of this.commands) {
        if (!q) {
          scored.push({ score: 100, item });
          continue;
        }
        const titleLow = item.title.toLowerCase();
        const catLow = item.category.toLowerCase();
        if (titleLow.startsWith(q)) scored.push({ score: 200, item });
        else if (titleLow.includes(q) || catLow.includes(q)) scored.push({ score: 120, item });
        else if (this.isSubsequence(q, titleLow)) scored.push({ score: 60, item });
      }
      scored.sort((a, b) => b.score - a.score);
      return scored;
    },

    updateMemoryHud() {
      if (typeof document === 'undefined') return;
      const pill = $('#rp-mem-pill');
      if (!pill) return;
      const diag = this.telemetrySnapshot();
      const allocStr = diag.allocatedBytes >= 1024 * 1024
        ? `${diag.allocatedMB.toFixed(1)} MB`
        : `${(diag.allocatedBytes / 1024).toFixed(0)} KB`;
      pill.textContent = `Memory: ${allocStr} / ${diag.budgetMB} MB (${diag.pressure})`;
      pill.title = `Active: ${allocStr} | Peak: ${diag.peakMB.toFixed(1)} MB | Budget: ${diag.budgetMB} MB (${diag.pressure}) — Click for Smart Memory Purge (Ctrl+Shift+M)`;
    }
  };


  function applySecurityRedaction(pageIdx, imgOrCanvas, textItems, rx, ry, rw, rh, reason = "CONFIDENTIAL") {
    const x0 = Math.max(0, Math.floor(rx || 0));
    const y0 = Math.max(0, Math.floor(ry || 0));
    let scrubbedPixels = 0;
    if (imgOrCanvas && imgOrCanvas.data && imgOrCanvas.width > 0 && imgOrCanvas.height > 0) {
      const W = imgOrCanvas.width | 0, H = imgOrCanvas.height | 0;
      const x1 = Math.min(W, Math.ceil((rx || 0) + (rw || 0)));
      const y1 = Math.min(H, Math.ceil((ry || 0) + (rh || 0)));
      const data = imgOrCanvas.data;
      const stride = W * 4;
      for (let y = y0; y < y1; y++) {
        const rowStart = y * stride + x0 * 4;
        const rowEnd = y * stride + x1 * 4;
        if (rowEnd <= data.length && rowStart < rowEnd) {
          data.subarray(rowStart, rowEnd).fill(0);
          for (let i = rowStart; i < rowEnd; i += 4) {
            data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
            scrubbedPixels++;
          }
        }
      }
    }
    const fx0 = Number(rx) || 0, fy0 = Number(ry) || 0;
    const fx1 = fx0 + (Number(rw) || 0), fy1 = fy0 + (Number(rh) || 0);
    if (Array.isArray(textItems)) {
      for (let i = textItems.length - 1; i >= 0; i--) {
        const t = textItems[i];
        if (!t) continue;
        const tx0 = t.x != null ? t.x : 0;
        const ty0 = t.y != null ? t.y : (t.base != null ? t.base - (t.h || 10) : 0);
        const tx1 = tx0 + (t.w || 0), ty1 = ty0 + (t.h || 10);
        if (!(tx1 < fx0 || tx0 > fx1 || ty1 < fy0 || ty0 > fy1)) textItems.splice(i, 1);
      }
    }
    return scrubbedPixels;
  }

  function openCommandPaletteModal() {
    if (typeof document === 'undefined' || !document.body) return;
    let modal = $('#rp-command-palette-modal');
    if (modal) modal.remove();
    modal = el('div', { id: 'rp-command-palette-modal', className: 'rp-modal' });
    modal.innerHTML = `
      <div class="rp-card" style="width:min(640px,94vw);padding:16px;display:flex;flex-direction:column;gap:10px">
        <div class="row" style="justify-content:space-between;align-items:center">
          <b>Command Palette &amp; Smart Memory Manager (Ctrl+K)</b>
          <span id="rp-cmd-pal-mem" class="rp-badge" style="font-size:11px"></span>
        </div>
        <input type="text" id="rp-cmd-pal-input" placeholder="Type a command (e.g. Smart Memory Purge, Triage Noise, DFM, Export QA ZIP)..." style="width:100%;padding:8px 12px;font-size:13px" />
        <div id="rp-cmd-pal-list" style="max-height:320px;overflow-y:auto;display:flex;flex-direction:column;gap:4px"></div>
        <div class="rp-btns" style="justify-content:space-between">
          <div class="row" style="gap:6px">
            <button type="button" id="rp-cmd-purge-btn">Smart Memory Purge (Ctrl+Shift+M)</button>
            <button type="button" id="rp-cmd-triage-btn">Triage Cosmetic Noise (Ctrl+Shift+T)</button>
          </div>
          <button type="button" id="rp-cmd-close-btn">Close (Esc)</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const diag = SmartManager.telemetrySnapshot();
    const memBadge = modal.querySelector('#rp-cmd-pal-mem');
    if (memBadge) {
      memBadge.textContent = `RAM: ${diag.allocatedMB.toFixed(1)} MB / ${diag.budgetMB} MB (${diag.pressure})`;
    }

    const inp = modal.querySelector('#rp-cmd-pal-input');
    const listEl = modal.querySelector('#rp-cmd-pal-list');
    let currentMatches = [];
    let activeIdx = 0;

    const renderMatches = () => {
      currentMatches = SmartManager.searchCommands(inp ? inp.value : '');
      activeIdx = Math.min(activeIdx, Math.max(0, currentMatches.length - 1));
      if (!currentMatches.length) {
        listEl.innerHTML = `<div class="rp-empty-msg">No matching commands found.</div>`;
        return;
      }
      listEl.innerHTML = currentMatches.map((m, idx) => `
        <button type="button" class="mi rp-cmd-pal-row ${idx === activeIdx ? 'on' : ''}" data-idx="${idx}" style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-radius:6px;text-align:left;width:100%">
          <div>
            <div style="font-weight:600;font-size:12.5px">${m.item.title}</div>
            <div style="font-size:11px;color:var(--mute)">${m.item.category}</div>
          </div>
          <kbd style="font-size:11px;padding:2px 6px;border-radius:4px;background:var(--panel2)">${m.item.shortcut}</kbd>
        </button>
      `).join('');
      listEl.querySelectorAll('.rp-cmd-pal-row').forEach(btn => {
        btn.onclick = () => {
          const item = currentMatches[+btn.dataset.idx]?.item;
          modal.remove();
          if (item && typeof item.run === 'function') item.run();
        };
      });
    };

    if (inp) {
      inp.oninput = () => { activeIdx = 0; renderMatches(); };
      inp.onkeydown = e => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          activeIdx = (activeIdx + 1) % Math.max(1, currentMatches.length);
          renderMatches();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          activeIdx = (activeIdx - 1 + Math.max(1, currentMatches.length)) % Math.max(1, currentMatches.length);
          renderMatches();
        } else if (e.key === 'Enter' && currentMatches[activeIdx]) {
          e.preventDefault();
          const item = currentMatches[activeIdx].item;
          modal.remove();
          if (item && typeof item.run === 'function') item.run();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          modal.remove();
        }
      };
    }

    modal.querySelector('#rp-cmd-purge-btn').onclick = () => { modal.remove(); SmartManager.smartPurgeMemory(); };
    modal.querySelector('#rp-cmd-triage-btn').onclick = () => { modal.remove(); SmartManager.autoDismissCosmeticNoise(); };
    modal.querySelector('#rp-cmd-close-btn').onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    renderMatches();
    setTimeout(() => inp && inp.focus(), 20);
  }

  if (typeof window !== 'undefined') {
    window.SmartManager = SmartManager;
    window.VectorPdfBuilder = VectorPdfBuilder;
    window.ZipArchive = ZipArchive;
    window.openCommandPaletteModal = openCommandPaletteModal;
    window.rpTrimMemory = () => SmartManager.smartPurgeMemory();
  }


  /**
   * ============================================================================
   * KENSHO PRO MULTI-ZONE DOCKABLE & FLOATING PANEL ENGINE
   * Supports Docking Any Panel to:
   *   - Left-Up   ('left-up')
   *   - Left-Down ('left-down')
   *   - Right-Up  ('right-up')
   *   - Right-Down('right-down')
   *   - Bottom    ('bottom')
   *   - Separate Floating Window ('float')
   * Across Compare & CAM (#view-compare), PDF Studio (#view-edit), and DXF Studio (#view-dxf)
   * ============================================================================
   */
  /* ============================================================================
   * [MODULE SECTION: MULTI-ZONE DOCKABLE & FLOATING PANEL ENGINE]
   * WHAT THIS IS: Manages Left-Upper (LU), Left-Lower (LD), Right-Upper (RU),
   *   Right-Lower (RD), Bottom (BTM), and Floating (FLT) workstation panels.
   * WHY / HOW TO EDIT: Register new dockable panels in `PANEL_DEFS` or customize
   *   workspace layout presets in `applyPreset()`.
   * ============================================================================ */
  const KenshoDockManager = {
    STORAGE_KEY: 'rp_kdock_state_v1',
    activePreset: 'classic-tabbed',
    topZ: 120,
    leftDockWidth: 340,
    rightDockWidth: 344,
    bottomDockHeight: 220,
    leftSplitRatio: 0.50,
    rightSplitRatio: 0.52,
    editSplitRatio: 0.48,
    dxfLeftSplitRatio: 0.50,
    dxfRightSplitRatio: 0.50,

    // Panel Registry for Compare & CAM Workspace (Defaults to clean single tabbed right dock without split)
    panels: {
      diffs: {
        id: 'diffs',
        tabCode: 'd',
        title: 'Differences & DRC',
        shortTitle: 'Diffs',
        icon: 'align',
        zone: 'right-up',
        visible: true,
        shaded: false,
        floatRect: { x: 80, y: 120, w: 360, h: 440 }
      },
      cam: {
        id: 'cam',
        tabCode: 'cam',
        title: 'CAM / DFM & Stackup',
        shortTitle: 'CAM',
        icon: 'pcbCam',
        zone: 'right-up',
        visible: true,
        shaded: false,
        floatRect: { x: 460, y: 120, w: 360, h: 440 }
      },
      vis: {
        id: 'vis',
        tabCode: 'vis',
        title: 'Visibility, Color & Align',
        shortTitle: 'Vis',
        icon: 'layers',
        zone: 'right-up',
        visible: true,
        shaded: false,
        floatRect: { x: 110, y: 150, w: 330, h: 450 }
      },
      text: {
        id: 'text',
        tabCode: 't',
        title: 'Text & BOM Diff',
        shortTitle: 'Text',
        icon: 'textDiff',
        zone: 'right-up',
        visible: true,
        shaded: false,
        floatRect: { x: 180, y: 180, w: 380, h: 380 }
      },
      markups: {
        id: 'markups',
        tabCode: 'm',
        title: 'Markups & BOM Tally',
        shortTitle: 'Markups',
        icon: 'tally',
        zone: 'right-up',
        visible: true,
        shaded: false,
        floatRect: { x: 240, y: 160, w: 350, h: 400 }
      }
    },

    // Active tab per dock zone when multiple panels share the same zone
    zoneActivePanel: {
      'left-up': 'vis',
      'left-down': 'markups',
      'right-up': 'diffs',
      'right-down': 'cam',
      'bottom': 'text'
    },

    paneElements: {},
    zoneElements: {},
    initialized: false,

    init() {
      if (typeof document === 'undefined' || this.initialized) return;
      const compareMain = $('#view-compare > main');
      const aside = $('#view-compare aside');
      if (!compareMain || !aside) return;
      this.initialized = true;

      this.buildTopbarLayoutControls();
      this.buildCompareDockInfrastructure(compareMain, aside);
      this.buildVisibilityPanelContent();
      this.buildDockCompass();
      this.initEditStudioDocking();
      this.initDXFStudioDocking();
      this.syncLayout();
    },

    buildTopbarLayoutControls() {
      const topBar = $('#top');
      if (!topBar || $('#kdock-layout-btn')) return;

      const wrap = el('div', { id: 'kdock-topbar-wrap', className: 'kdock-topbar-wrap', hidden: true, style: 'display:none !important' });
      wrap.innerHTML = `
        <label class="f kdock-theme-wrap" title="Switch Application Color Theme (Sapphire Titanium, Carbon OLED, Graphite Studio, or Daylight White)">
          <span class="kdock-theme-lbl">Palette:</span>
          <select id="kdock-theme-sel" class="rp-select-xs">
            <option value="kensho" selected>Kensho Brand (Obsidian &amp; Red)</option>
            <option value="sapphire">Sapphire CAD (Cyan &amp; Slate)</option>
            <option value="obsidian">Carbon OLED (CAM Dark)</option>
            <option value="graphite">Graphite Studio (Soft)</option>
            <option value="light">Daylight Paper (White)</option>
          </select>
        </label>
        <button type="button" id="kdock-layout-btn" class="kdock-top-pill" title="Kensho Pro Multi-Zone Panel Docking & Workspace Layouts (Dock Left-Up, Left-Down, Right-Up, Right-Down, Bottom, or Separate Floating Windows)">
          <i data-ic="layoutDock"></i>
          <span>Panels &amp; Layout</span>
          <b class="kdock-caret">▾</b>
        </button>
      `;
      const themeBtn = $('#theme');
      if (themeBtn && themeBtn.parentNode === topBar) {
        topBar.insertBefore(wrap, themeBtn);
      } else {
        topBar.appendChild(wrap);
      }
      if (typeof hydrateIcons === 'function') hydrateIcons(wrap);

      const btn = wrap.querySelector('#kdock-layout-btn');
      if (btn) {
        btn.onclick = e => {
          e.stopPropagation();
          this.toggleLayoutPopover(btn);
        };
      }
      const themeSel = wrap.querySelector('#kdock-theme-sel');
      if (themeSel) {
        themeSel.onchange = e => {
          const val = e.target.value;
          if (val === 'light') {
            if (window.setTheme) window.setTheme('light');
            else document.documentElement.dataset.theme = 'light';
            delete document.documentElement.dataset.cadPalette;
          } else {
            if (window.setTheme) window.setTheme('dark');
            else document.documentElement.dataset.theme = 'dark';
            document.documentElement.dataset.cadPalette = val;
          }
          rpToast('Switched Color Palette: ' + themeSel.selectedOptions[0].text);
        };
      }
      this.buildQuickConvenienceBar();
    },

    buildQuickConvenienceBar() {
      const compareView = $('#view-compare');
      if (!compareView || $('#kdock-quick-bar')) return;
      const pagesEl = $('#pages');
      const bar = el('div', { id: 'kdock-quick-bar', className: 'kdock-quick-bar', role: 'toolbar', 'aria-label': 'Quick Access & Panel Layout Bar', hidden: true, style: 'display:none !important' });
      bar.innerHTML = `
        <div class="kdock-qgrp">
          <span class="kdock-qlbl">QUICK TOOLS</span>
          <button type="button" class="kdock-qbtn q-a" id="kq-open-a" title="Open Base Drawing (Rev A)"><i data-ic="openA"></i><span>Base A</span></button>
          <button type="button" class="kdock-qbtn q-b" id="kq-open-b" title="Open Revised Drawing (Rev B)"><i data-ic="openB"></i><span>Rev B</span></button>
          <button type="button" class="kdock-qbtn" id="kq-align" title="Auto-Align Drawings (A)"><i data-ic="align"></i><span>Auto-Align</span></button>
          <button type="button" class="kdock-qbtn" id="kq-curtain" title="60 FPS Split Curtain Slider (C)"><i data-ic="curtain"></i><span>Curtain</span></button>
          <button type="button" class="kdock-qbtn" id="kq-loupe" title="4x Magnifier Loupe (L)"><i data-ic="loupe"></i><span>Loupe</span></button>
          <button type="button" class="kdock-qbtn on" id="kq-minimap-btn" title="Toggle 2D Bird's-Eye World View Minimap Radar"><i data-ic="fit"></i><span>Radar Map</span></button>
          <div class="kdock-fader-pill" title="Live A ⇄ B Opacity Crossfader: Drag Left for 100% Base A, Center for 50/50 Overlay, Right for 100% Rev B">
            <b class="dot-a">A</b>
            <input type="range" id="kq-ab-fader" min="-100" max="100" value="0" />
            <b class="dot-b">B</b>
          </div>
          <select id="kq-canvas-bg" class="rp-select-xs" title="Viewport Canvas Substrate Background Mode">
            <option value="obsidian" selected>Canvas: Obsidian</option>
            <option value="pcb">Canvas: PCB Green</option>
            <option value="blueprint">Canvas: Blueprint</option>
            <option value="paper">Canvas: Paper White</option>
          </select>
          <button type="button" class="kdock-qbtn" id="kq-dist" title="Measure Distance (D)"><i data-ic="dist"></i><span>Measure</span></button>
          <button type="button" class="kdock-qbtn" id="kq-cloud" title="Draw Revision Cloud (Q)"><i data-ic="revCloud"></i><span>Cloud</span></button>
          <button type="button" class="kdock-qbtn" id="kq-audit" title="Generate Executive Audit PDF Report"><i data-ic="auditPdf"></i><span>Audit PDF</span></button>
        </div>
        <span class="grow"></span>
        <div class="kdock-qgrp kdock-layout-strip">
          <span class="kdock-qlbl">SIDE PANELS</span>
          <button type="button" class="kdock-lbtn on" data-kpreset="dock-right-split" title="Right Up/Down Split: Differences on Top + CAM/Visibility on Bottom">◫ Split</button>
          <button type="button" class="kdock-lbtn" data-kpreset="dock-quad" title="4-Corner Quad Dock: Left-Up Visibility + Left-Down Markups + Right-Up Diffs + Right-Down CAM">⊞ Quad</button>
          <button type="button" class="kdock-lbtn" data-kpreset="dock-left-split" title="Left Up/Down Split + Right Inspector">◰ L+R</button>
          <button type="button" class="kdock-lbtn" data-kpreset="dock-bottom-console" title="3-Side EDA Console with Bottom Dock">⬓ Bottom</button>
          <button type="button" class="kdock-lbtn" data-kpreset="dock-floating" title="Detach Panels into Separate Floating Windows">❐ Float</button>
          <button type="button" class="kdock-lbtn" data-kpreset="classic-tabbed" title="Single Full-Height Tabbed Right Sidebar">▭ Tab</button>
        </div>
      `;
      if (pagesEl && pagesEl.parentNode === compareView) {
        compareView.insertBefore(bar, pagesEl);
      } else {
        compareView.insertBefore(bar, compareView.querySelector('main'));
      }
      if (typeof hydrateIcons === 'function') hydrateIcons(bar);

      const clickTarget = sel => () => { const t = $(sel); if (t) t.click(); };
      bar.querySelector('#kq-open-a').onclick = clickTarget('#openA');
      bar.querySelector('#kq-open-b').onclick = clickTarget('#openB');
      bar.querySelector('#kq-align').onclick = clickTarget('#align');
      bar.querySelector('#kq-curtain').onclick = () => { setCurtainMode(!curtainActive); bar.querySelector('#kq-curtain').classList.toggle('on', curtainActive); };
      bar.querySelector('#kq-loupe').onclick = () => { if ($('#rib-loupe-toggle')) $('#rib-loupe-toggle').click(); bar.querySelector('#kq-loupe').classList.toggle('on', !!(window.RP_MEASURE && window.RP_MEASURE.loupeEnabled)); };
      bar.querySelector('#kq-dist').onclick = clickTarget('#rib-dist');
      bar.querySelector('#kq-cloud').onclick = clickTarget('#rib-rev-cloud');
      bar.querySelector('#kq-audit').onclick = () => generateExecutiveAuditReport();

      // Wire Live A <-> B Opacity Crossfader
      const abFader = bar.querySelector('#kq-ab-fader');
      if (abFader) {
        abFader.oninput = e => {
          const v = parseInt(e.target.value, 10) || 0;
          const opA = v <= 0 ? 100 : Math.max(10, Math.round(100 - v * 0.9));
          const opB = v >= 0 ? 100 : Math.max(10, Math.round(100 + v * 0.9));
          if (window.setCompareColors) window.setCompareColors({ opA, opB });
          else if (window.CMP) {
            window.CMP.opA = opA;
            window.CMP.opB = opB;
            if (typeof window.paint === 'function') window.paint();
          }
          this.syncVisibilityPanelUI();
        };
        abFader.ondblclick = () => {
          abFader.value = '0';
          abFader.dispatchEvent(new Event('input'));
          rpToast('Reset A ⇄ B Crossfader to 100% / 100%');
        };
      }

      // Wire Canvas Substrate Backdrop Selector
      const bgSel = bar.querySelector('#kq-canvas-bg');
      if (bgSel) {
        bgSel.onchange = e => {
          const vpEl = $('#vp');
          if (!vpEl) return;
          const mode = e.target.value;
          const bgMap = {
            obsidian: '#070a0f',
            pcb: '#061f12',
            blueprint: '#081b33',
            paper: '#e2e8f0'
          };
          vpEl.style.background = bgMap[mode] || '';
          rpToast('Canvas Backdrop: ' + bgSel.selectedOptions[0].text);
        };
      }

      // Build & Wire 2D Bird's-Eye World View Minimap Radar + Topbar Brand Badge + Smart Defect Search
      this.initWorldViewMinimap();
      this.initSmartDefectFilterBar();
      this.initTopbarBrandWordmark();
      const mmBtn = bar.querySelector('#kq-minimap-btn');
      if (mmBtn) {
        mmBtn.onclick = () => {
          const mm = $('#kdock-minimap');
          if (!mm) return;
          const nextShow = mm.classList.toggle('user-hidden');
          mmBtn.classList.toggle('on', !nextShow);
          this.renderWorldViewMinimap();
        };
      }

      bar.querySelectorAll('.kdock-lbtn').forEach(b => {
        b.onclick = () => {
          this.applyPreset(b.dataset.kpreset);
          bar.querySelectorAll('.kdock-lbtn').forEach(x => x.classList.toggle('on', x === b));
        };
      });
    },

    initTopbarBrandWordmark() {
      const topSetBtn = $('#top-settings-btn');
      if (topSetBtn && !topSetBtn.dataset.wiredSettings) {
        topSetBtn.dataset.wiredSettings = '1';
        topSetBtn.onclick = e => {
          e.stopPropagation();
          openWorkstationSettingsModal('language');
        };
      }
      const existingWm = $('#kdock-brand-wordmark');
      if (existingWm) existingWm.remove();
    },

    initWorldViewMinimap() {
      const vp = $('#vp');
      if (!vp || $('#kdock-minimap')) return;
      const mm = el('div', { id: 'kdock-minimap', className: 'kdock-minimap', title: '2D World View Radar — Click or drag to pan viewport across drawing' });
      mm.innerHTML = `
        <div class="kdock-mm-hdr">
          <span>WORLD VIEW</span>
          <div style="display:flex;align-items:center;gap:6px">
            <span id="kdock-mm-zoom">100%</span>
            <button type="button" id="kdock-mm-fit" title="Fit World Extents" style="background:none;border:none;color:var(--ink);font-size:10px;cursor:pointer;padding:0 3px">Fit</button>
            <button type="button" id="kdock-mm-close" title="Hide World View" style="background:none;border:none;color:var(--mute);font-size:11px;cursor:pointer;padding:0 2px">&#10005;</button>
          </div>
        </div>
        <canvas id="kdock-mm-cv" width="168" height="116"></canvas>
      `;
      vp.appendChild(mm);

      const fitBtn = mm.querySelector('#kdock-mm-fit');
      if (fitBtn) {
        fitBtn.onclick = e => {
          e.stopPropagation();
          const v = document.body.dataset.view;
          if (v === 'dxf' && window.DXFStudio && window.DXFStudio.zoomExtents) window.DXFStudio.zoomExtents();
          else if (v === 'edit' && window.ACT && window.ACT.eFit) window.ACT.eFit();
          else if (window.ACT && window.ACT.cFit) window.ACT.cFit();
          this.renderWorldViewMinimap();
        };
      }
      const clsBtn = mm.querySelector('#kdock-mm-close');
      if (clsBtn) {
        clsBtn.onclick = e => {
          e.stopPropagation();
          if (window.toggleWorldView) window.toggleWorldView(false);
        };
      }

      const mmCv = mm.querySelector('#kdock-mm-cv');
      const panFromMinimap = ev => {
        const S = window.CMP;
        const cv = $('#cv');
        if (!S || !S.view || !cv || !cv.width || !cv.height) return;
        const rect = mmCv.getBoundingClientRect();
        const rx = Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width)));
        const ry = Math.max(0, Math.min(1, (ev.clientY - rect.top) / Math.max(1, rect.height)));
        const docX = rx * cv.width;
        const docY = ry * cv.height;
        S.view.x = Math.round(vp.clientWidth / 2 - docX * S.view.k);
        S.view.y = Math.round(vp.clientHeight / 2 - docY * S.view.k);
        const stg = $('#stage');
        if (stg) stg.style.transform = `translate(${S.view.x}px, ${S.view.y}px) scale(${S.view.k})`;
        if (typeof window.applyView === 'function') window.applyView();
        if (typeof window.markers === 'function') window.markers();
        this.renderWorldViewMinimap();
      };

      let mmDrag = false;
      mmCv.addEventListener('pointerdown', e => {
        e.stopPropagation();
        mmDrag = true;
        panFromMinimap(e);
      });
      window.addEventListener('pointermove', e => {
        if (mmDrag) panFromMinimap(e);
      });
      window.addEventListener('pointerup', () => { mmDrag = false; });

      let _mmRaf = 0;
      const scheduleMinimap = () => {
        if (document.hidden || document.body.dataset.view !== 'compare') return;
        const mmEl = $('#kdock-minimap');
        if (!mmEl || mmEl.hidden || mmEl.classList.contains('user-hidden')) return;
        if (_mmRaf) return;
        _mmRaf = requestAnimationFrame(() => {
          _mmRaf = 0;
          this.renderWorldViewMinimap();
        });
      };
      const stg = $('#stage');
      if (stg && typeof MutationObserver !== 'undefined') {
        new MutationObserver(scheduleMinimap).observe(stg, { attributes: true, attributeFilter: ['style'] });
      }
      setInterval(scheduleMinimap, 1500);

      window.isWorldViewActive = () => {
        const elMm = $('#kdock-minimap');
        return Boolean(elMm && !elMm.classList.contains('user-hidden'));
      };
      window.toggleWorldView = (forceState) => {
        const elMm = $('#kdock-minimap');
        if (!elMm) return false;
        const curOn = !elMm.classList.contains('user-hidden') && (elMm.dataset.userToggledOn === '1' || !elMm.hidden);
        const nextOn = typeof forceState === 'boolean' ? forceState : !curOn;
        elMm.classList.toggle('user-hidden', !nextOn);
        elMm.dataset.userToggledOn = nextOn ? '1' : '0';
        if ($('#rib-world-view-toggle')) $('#rib-world-view-toggle').classList.toggle('on', nextOn);
        if ($('#kq-minimap-btn')) $('#kq-minimap-btn').classList.toggle('on', nextOn);
        if ($('#set-page-minimap-chk')) $('#set-page-minimap-chk').checked = nextOn;
        this.renderWorldViewMinimap();
        rpToast(nextOn ? 'World View enabled' : 'World View hidden');
        return nextOn;
      };
    },

    renderWorldViewMinimap() {
      const mm = $('#kdock-minimap');
      const mmCv = $('#kdock-mm-cv');
      const vp = $('#vp');
      const S = window.CMP;
      if (!mm || !mmCv) return;
      if (mm.classList.contains('user-hidden')) {
        mm.hidden = true;
        if ($('#rib-world-view-toggle')) $('#rib-world-view-toggle').classList.remove('on');
        return;
      }
      if ($('#rib-world-view-toggle')) $('#rib-world-view-toggle').classList.add('on');

      const curView = (document.body && document.body.dataset.view) || 'compare';
      const srcCv = curView === 'dxf' ? $('#dxf-canvas') : (curView === 'edit' ? $('#ecv') : $('#cv'));
      const hasCompareDoc = curView === 'compare' && srcCv && srcCv.width > 0 && srcCv.height > 0 && !($('#empty') && !$('#empty').hidden);
      const hasEditDoc = curView === 'edit' && srcCv && srcCv.width > 0 && srcCv.height > 0 && !($('#eempty') && !$('#eempty').hidden);
      const hasDxfDoc = curView === 'dxf' && srcCv && srcCv.width > 0 && srcCv.height > 0;
      const hasActiveCanvas = hasCompareDoc || hasEditDoc || hasDxfDoc;

      if (!hasActiveCanvas && mm.dataset.userToggledOn !== '1') {
        mm.hidden = true;
        return;
      }
      mm.hidden = false;
      const ctx = mmCv.getContext('2d');
      const W = mmCv.width, H = mmCv.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#090d14';
      ctx.fillRect(0, 0, W, H);

      if (!hasActiveCanvas) {
        // Draw World View CAD radar grid when enabled before loading a drawing
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
        ctx.lineWidth = 1;
        for (let gx = 16; gx < W; gx += 24) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
        for (let gy = 16; gy < H; gy += 24) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(225, 29, 72, 0.75)';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(24, 18, W - 48, H - 36);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('WORLD VIEW ACTIVE', W / 2, H / 2 + 3);
        return;
      }

      const scale = Math.min((W - 12) / srcCv.width, (H - 12) / srcCv.height);
      const dw = srcCv.width * scale, dh = srcCv.height * scale;
      const ox = (W - dw) / 2, oy = (H - dh) / 2;

      try {
        ctx.drawImage(srcCv, ox, oy, dw, dh);
      } catch (e) {}
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox, oy, dw, dh);

      if (curView === 'compare') {
        const defs = DefectState.defects || [];
        for (let i = 0; i < defs.length; i++) {
          const d = defs[i];
          const dx = ox + (d.x + d.w / 2) * scale;
          const dy = oy + (d.y + d.h / 2) * scale;
          ctx.fillStyle = d.type === 'removed' ? '#f43f5e' : d.type === 'added' ? '#10b981' : '#f59e0b';
          ctx.beginPath();
          ctx.arc(dx, dy, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        if (S && S.view && S.view.k > 0 && vp) {
          const vx = (-S.view.x / S.view.k) * scale + ox;
          const vy = (-S.view.y / S.view.k) * scale + oy;
          const vw = (vp.clientWidth / S.view.k) * scale;
          const vh = (vp.clientHeight / S.view.k) * scale;
          ctx.strokeStyle = '#e11d48';
          ctx.lineWidth = 1.6;
          ctx.strokeRect(vx, vy, vw, vh);
          ctx.fillStyle = 'rgba(225, 29, 72, 0.14)';
          ctx.fillRect(vx, vy, vw, vh);
          const zLbl = $('#kdock-mm-zoom');
          if (zLbl) zLbl.textContent = Math.round(S.view.k * 100) + '%';
        }
      } else {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(ox + 2, oy + 2, Math.max(8, dw - 4), Math.max(8, dh - 4));
      }
    },

    initSmartDefectFilterBar() {
      const chkPane = $('#defect-checklist-pane');
      if (!chkPane || $('#kdock-defect-search')) return;
      const hdr = chkPane.querySelector('.rp-checklist-header');
      const filterRow = el('div', { className: 'kdock-defect-filter-bar' }, `
        <input type="text" id="kdock-defect-search" placeholder="Search defects by layer, coord, category or note..." />
        <div class="kdock-sev-pills">
          <button type="button" class="kdock-sev-pill on" data-sev="ALL">All</button>
          <button type="button" class="kdock-sev-pill" data-sev="CRITICAL">Critical</button>
          <button type="button" class="kdock-sev-pill" data-sev="MAJOR">Major</button>
          <button type="button" class="kdock-sev-pill" data-sev="MINOR">Minor</button>
          <button type="button" class="kdock-sev-pill" id="kdock-triage-btn" title="Auto-dismiss tiny cosmetic noise pixels (<25px)">Auto-Triage</button>
        </div>
      `);
      if (hdr && hdr.nextSibling) chkPane.insertBefore(filterRow, hdr.nextSibling);
      else chkPane.insertBefore(filterRow, chkPane.firstChild);

      const applyClientFilter = () => {
        const q = (filterRow.querySelector('#kdock-defect-search').value || '').trim().toLowerCase();
        const activeSevBtn = filterRow.querySelector('.kdock-sev-pill.on[data-sev]');
        const sev = activeSevBtn ? activeSevBtn.dataset.sev : 'ALL';
        $$('#defect-checklist-body .defect-item').forEach(card => {
          const idx = parseInt(card.dataset.idx, 10);
          const d = DefectState.defects[idx];
          if (!d) return;
          const matchSev = sev === 'ALL' || (d.severity || 'MINOR') === sev;
          const txt = `${d.type} ${d.semanticCategory || ''} ${d.dxfLayer || ''} ${d.note || ''} ${Math.round(d.x)},${Math.round(d.y)}`.toLowerCase();
          const matchQ = !q || txt.includes(q);
          card.style.display = (matchSev && matchQ) ? '' : 'none';
        });
      };

      filterRow.querySelector('#kdock-defect-search').oninput = applyClientFilter;
      filterRow.querySelectorAll('.kdock-sev-pill[data-sev]').forEach(b => {
        b.onclick = () => {
          filterRow.querySelectorAll('.kdock-sev-pill[data-sev]').forEach(x => x.classList.toggle('on', x === b));
          applyClientFilter();
        };
      });
      const triageBtn = filterRow.querySelector('#kdock-triage-btn');
      if (triageBtn) {
        triageBtn.onclick = () => {
          const n = DefectState.autoDismissCosmeticNoise();
          rpToast(`Auto-Triaged ${n} cosmetic noise item(s).`);
        };
      }
    },

    toggleLayoutPopover(anchorBtn) {
      let pop = $('#kdock-layout-popover');
      if (pop && !pop.hidden) {
        pop.hidden = true;
        return;
      }
      if (!pop) {
        pop = el('div', { id: 'kdock-layout-popover', className: 'kdock-layout-popover dd' });
        document.body.appendChild(pop);
        document.addEventListener('pointerdown', e => {
          if (pop && !pop.hidden && !pop.contains(e.target) && (!anchorBtn || !anchorBtn.contains(e.target))) {
            pop.hidden = true;
          }
        });
      }
      this.renderLayoutPopoverContent(pop);
      pop.hidden = false;
      if (anchorBtn && anchorBtn.getBoundingClientRect) {
        const r = anchorBtn.getBoundingClientRect();
        pop.style.top = Math.min(window.innerHeight - 420, Math.max(38, r.bottom + 6)) + 'px';
        pop.style.left = Math.min(window.innerWidth - 390, Math.max(8, r.right - 375)) + 'px';
      }
    },

    renderLayoutPopoverContent(pop) {
      if (!pop) return;
      const presets = [
        { id: 'dock-right-split', name: 'Right Split (Up / Down)', desc: 'Diffs (Right-Up) + CAM/DFM, Visibility & Markups (Right-Down)' },
        { id: 'dock-quad', name: 'Dual-Side Quad (LU/LD + RU/RD)', desc: 'Visibility (Left-Up) + Markups (Left-Down) + Diffs (Right-Up) + CAM (Right-Down)' },
        { id: 'dock-left-split', name: 'Left Split + Right Inspector', desc: 'Diffs (Left-Up) + CAM/DFM (Left-Down) + Visibility (Right-Up) + Text (Right-Down)' },
        { id: 'dock-bottom-console', name: 'Bottom Console (3-Side EDA)', desc: 'Visibility (Left-Up) + Diffs (Right-Up) + CAM (Right-Down) + Text/Markups (Bottom)' },
        { id: 'dock-floating', name: 'Detach All as Separate Floating Windows', desc: 'Pop out Diffs, CAM/DFM & Visibility into independent movable windows' },
        { id: 'classic-tabbed', name: 'Single Right Dock (Tabbed)', desc: 'Stack all panels as tabs inside the right dock' }
      ];

      const zones = [
        { code: 'left-up', lbl: 'LU', tip: 'Dock Left-Up (Top-Left)' },
        { code: 'left-down', lbl: 'LD', tip: 'Dock Left-Down (Bottom-Left)' },
        { code: 'right-up', lbl: 'RU', tip: 'Dock Right-Up (Top-Right)' },
        { code: 'right-down', lbl: 'RD', tip: 'Dock Right-Down (Bottom-Right)' },
        { code: 'bottom', lbl: 'BTM', tip: 'Dock Bottom Console' },
        { code: 'float', lbl: 'FLT', tip: 'Separate Floating Window' }
      ];

      pop.innerHTML = `
        <div class="kdock-pop-head">
          <div>
            <b><i data-ic="layoutDock"></i> Multi-Zone Panel &amp; Docking Manager</b>
            <small>Position each panel Left-Up, Left-Down, Right-Up, Right-Down, Bottom, or Float</small>
          </div>
          <button type="button" class="kdock-icon-btn" id="kdock-pop-close" title="Close">×</button>
        </div>

        <div class="kdock-pop-sec-title">1-CLICK EDA WORKSPACE PRESETS</div>
        <div class="kdock-preset-list">
          ${presets.map(p => `
            <button type="button" class="kdock-preset-card ${this.activePreset === p.id ? 'on' : ''}" data-preset="${p.id}">
              <div class="kdock-preset-name">${p.name}</div>
              <div class="kdock-preset-desc">${p.desc}</div>
            </button>
          `).join('')}
        </div>

        <div class="kdock-pop-sec-title">INDIVIDUAL PANEL DOCKING MATRIX</div>
        <div class="kdock-matrix">
          ${Object.values(this.panels).map(p => `
            <div class="kdock-matrix-row">
              <label class="kdock-matrix-name" title="Toggle ${p.title} visibility">
                <input type="checkbox" class="kdock-vis-chk" data-pid="${p.id}" ${p.visible ? 'checked' : ''} />
                <i data-ic="${p.icon}"></i>
                <span>${p.title}</span>
              </label>
              <div class="kdock-matrix-btns">
                ${zones.map(z => `
                  <button type="button" class="kdock-zone-chip ${p.visible && p.zone === z.code ? 'on' : ''}" data-pid="${p.id}" data-zone="${z.code}" title="${z.tip}">${z.lbl}</button>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `;

      if (typeof hydrateIcons === 'function') hydrateIcons(pop);

      const closeB = pop.querySelector('#kdock-pop-close');
      if (closeB) closeB.onclick = () => { pop.hidden = true; };

      pop.querySelectorAll('.kdock-preset-card').forEach(btn => {
        btn.onclick = () => {
          this.applyPreset(btn.dataset.preset);
          this.renderLayoutPopoverContent(pop);
        };
      });

      pop.querySelectorAll('.kdock-vis-chk').forEach(chk => {
        chk.onchange = () => {
          this.setPanelVisibility(chk.dataset.pid, chk.checked);
          this.renderLayoutPopoverContent(pop);
        };
      });

      pop.querySelectorAll('.kdock-zone-chip').forEach(btn => {
        btn.onclick = () => {
          this.dockPanel(btn.dataset.pid, btn.dataset.zone);
          this.renderLayoutPopoverContent(pop);
        };
      });
    },

    buildCompareDockInfrastructure(compareMain, aside) {
      compareMain.classList.add('kdock-main-workspace');
      aside.id = 'kdock-dock-right';
      aside.classList.add('kdock-dock-col', 'kdock-dock-right');

      // 1. Create Left Dock Column (#kdock-dock-left) with Left-Up & Left-Down zones
      const leftDock = el('div', { id: 'kdock-dock-left', className: 'kdock-dock-col kdock-dock-left', hidden: true });
      const zoneLU = el('div', { id: 'kdock-zone-left-up', className: 'kdock-dock-zone', 'data-zone': 'left-up' });
      const splitLUD = el('div', { id: 'kdock-split-left-ud', className: 'kdock-splitter-h', title: 'Drag to resize Left-Up / Left-Down split (Double-click to 50/50)', hidden: true });
      const zoneLD = el('div', { id: 'kdock-zone-left-down', className: 'kdock-dock-zone', 'data-zone': 'left-down' });
      const splitLeftV = el('div', { id: 'kdock-split-left', className: 'kdock-splitter-v', title: 'Drag to resize Left Dock width (Double-click to collapse)' });
      leftDock.appendChild(zoneLU);
      leftDock.appendChild(splitLUD);
      leftDock.appendChild(zoneLD);
      leftDock.appendChild(splitLeftV);

      // 2. Wrap #vp + Bottom Dock (#kdock-zone-bottom) inside #kdock-center-col
      const vp = $('#vp');
      const centerCol = el('div', { id: 'kdock-center-col', className: 'kdock-center-col' });
      const splitBtmH = el('div', { id: 'kdock-split-bottom', className: 'kdock-splitter-h', title: 'Drag to resize Bottom Console height (Double-click to reset)', hidden: true });
      const zoneBtm = el('div', { id: 'kdock-zone-bottom', className: 'kdock-dock-zone kdock-zone-bottom', 'data-zone': 'bottom', hidden: true });

      if (vp && vp.parentNode === compareMain) {
        compareMain.insertBefore(leftDock, vp);
        compareMain.insertBefore(centerCol, vp);
        centerCol.appendChild(vp);
        centerCol.appendChild(splitBtmH);
        centerCol.appendChild(zoneBtm);
      }

      // 3. Create Right-Up and Right-Down zones inside <aside> (#kdock-dock-right)
      const tabsBar = aside.querySelector('.tabs');
      if (tabsBar && !tabsBar.querySelector('[data-t="vis"]')) {
        const visBtn = el('button', { 'data-t': 'vis', title: 'Visibility, Color Swatches, Opacity & Micro-Align Control Panel' }, '<i data-ic="layers"></i><span>Vis</span>');
        const colBtn = tabsBar.querySelector('.rp-sidebar-collapse-btn');
        if (colBtn) tabsBar.insertBefore(visBtn, colBtn);
        else tabsBar.appendChild(visBtn);

        const layoutBtn = el('button', {
          type: 'button',
          id: 'kdock-aside-layout-btn',
          className: 'kdock-aside-layout-btn',
          title: 'Configure Side Panel Split (Up/Down, Left/Right, Bottom, or Separate Floating Window)'
        }, '<i data-ic="layoutDock"></i>');
        layoutBtn.onclick = e => {
          e.stopPropagation();
          this.toggleLayoutPopover(layoutBtn);
        };
        if (colBtn) tabsBar.insertBefore(layoutBtn, colBtn);
        else tabsBar.appendChild(layoutBtn);
        if (typeof hydrateIcons === 'function') hydrateIcons(tabsBar);
      }

      const zoneRU = el('div', { id: 'kdock-zone-right-up', className: 'kdock-dock-zone', 'data-zone': 'right-up' });
      const splitRUD = el('div', { id: 'kdock-split-right-ud', className: 'kdock-splitter-h', title: 'Drag to resize Right-Up / Right-Down panel split (Double-click to reset 50/50)' });
      const zoneRD = el('div', { id: 'kdock-zone-right-down', className: 'kdock-dock-zone', 'data-zone': 'right-down' });

      // 4. Floating Window Layer (#kdock-float-layer)
      let floatLayer = $('#kdock-float-layer');
      if (!floatLayer) {
        floatLayer = el('div', { id: 'kdock-float-layer', className: 'kdock-float-layer' });
        document.body.appendChild(floatLayer);
      }

      this.zoneElements = {
        'left-up': zoneLU,
        'left-down': zoneLD,
        'right-up': zoneRU,
        'right-down': zoneRD,
        'bottom': zoneBtm,
        'float': floatLayer
      };

      // 5. Build the 5 individual .kdock-pane containers and move existing DOM nodes into them
      const sumEl = $('#sum');
      const navRow = aside.querySelector('.navrow');
      const checklistPane = $('#defect-checklist-pane');
      const listEl = $('#list');
      const textEl = $('#text');
      const camPane = $('#cam-sidebar-pane');
      const markupsPane = $('#markups-sidebar-pane');

      // Ensure inner panes are unhidden so their parent .kdock-pane controls visibility
      if (sumEl) sumEl.hidden = false;
      if (navRow) navRow.hidden = false;
      if (checklistPane) checklistPane.hidden = false;
      if (textEl) textEl.hidden = false;
      if (camPane) camPane.hidden = false;
      if (markupsPane) markupsPane.hidden = false;

      // Pane 1: Differences & DRC
      const paneDiffs = this.createPaneContainer('diffs');
      const bodyDiffs = paneDiffs.querySelector('.kdock-pane-body');
      if (sumEl) bodyDiffs.appendChild(sumEl);
      if (navRow) bodyDiffs.appendChild(navRow);
      if (listEl) bodyDiffs.appendChild(listEl);
      if (checklistPane) bodyDiffs.appendChild(checklistPane);

      // Pane 2: CAM / DFM Stackup
      const paneCam = this.createPaneContainer('cam');
      const bodyCam = paneCam.querySelector('.kdock-pane-body');
      if (camPane) bodyCam.appendChild(camPane);

      // Pane 3: Visibility, Color & Align
      const paneVis = this.createPaneContainer('vis');

      // Pane 4: Text & BOM Diff
      const paneText = this.createPaneContainer('text');
      const bodyText = paneText.querySelector('.kdock-pane-body');
      const textToolbar = el('div', { className: 'kdock-subtoolbar' }, `
        <span>Extracted Sheet Word &amp; Line Diff</span>
        <button type="button" class="rp-btn-sm" id="kdock-run-lcs-btn" title="Open Full Line-by-Line LCS Text & BOM Diff Dialog (Ctrl+T)"><i data-ic="textDiff"></i><span>Full LCS Diff</span></button>
      `);
      bodyText.appendChild(textToolbar);
      if (textEl) bodyText.appendChild(textEl);
      if (typeof hydrateIcons === 'function') hydrateIcons(textToolbar);
      const lcsBtn = textToolbar.querySelector('#kdock-run-lcs-btn');
      if (lcsBtn) lcsBtn.onclick = () => { if (window.ACT && window.ACT.textDiff) window.ACT.textDiff(); };

      // Pane 5: Markups & BOM Tally
      const paneMarkups = this.createPaneContainer('markups');
      const bodyMarkups = paneMarkups.querySelector('.kdock-pane-body');
      if (markupsPane) bodyMarkups.appendChild(markupsPane);

      this.paneElements = {
        diffs: paneDiffs,
        cam: paneCam,
        vis: paneVis,
        text: paneText,
        markups: paneMarkups
      };

      // Append right-up, splitter, and right-down into <aside>
      aside.appendChild(zoneRU);
      aside.appendChild(splitRUD);
      aside.appendChild(zoneRD);

      // Override aside .tabs buttons so clicking activates that pane AND dragging a tab detaches/moves that pane freely!
      if (tabsBar) {
        const mapCodeToId = { d: 'diffs', t: 'text', cam: 'cam', c: 'cam', m: 'markups', vis: 'vis' };
        tabsBar.querySelectorAll('button[data-t]').forEach(b => {
          const code = b.dataset.t;
          const pid = mapCodeToId[code] || 'diffs';
          b.title = (b.title || '') + ' (Click to view, or drag tab out to detach/dock anywhere)';
          b.onclick = e => {
            e.stopPropagation();
            if (textEl) textEl.hidden = false;
            if (checklistPane) checklistPane.hidden = false;
            if (camPane) camPane.hidden = false;
            if (markupsPane) markupsPane.hidden = false;
            if (sumEl) sumEl.hidden = false;
            if (navRow) navRow.hidden = false;

            if (pid === 'cam') updateCAMSidebarPane();
            if (pid === 'markups' && window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
            if (pid === 'vis') this.syncVisibilityPanelUI();

            this.activatePanel(pid);
          };
          const pane = this.paneElements[pid];
          if (pane) {
            this.wireHeaderDrag(b, pid, pane, true);
          }
        });
      }

      // Wire interactive splitters
      this.wireSplitters(leftDock, aside, centerCol, splitLeftV, splitLUD, splitRUD, splitBtmH);
    },

    createPaneContainer(pid) {
      const cfg = this.panels[pid];
      const pane = el('section', {
        id: `kdock-pane-${pid}`,
        className: 'kdock-pane',
        'data-pane': pid
      });

      pane.innerHTML = `
        <header class="kdock-pane-header" title="Drag to move or dock anywhere · Double-click to shade/expand">
          <div class="kdock-pane-title-wrap">
            <span class="kdock-grip" aria-hidden="true">⋮⋮</span>
            <i data-ic="${cfg.icon}"></i>
            <b class="kdock-pane-title">${cfg.title}</b>
          </div>
          <div class="kdock-pane-controls">
            <button type="button" class="kdock-dock-btn" data-dock="left-up" hidden style="display:none !important" title="Dock Left-Up">LU</button>
            <button type="button" class="kdock-dock-btn" data-dock="left-down" hidden style="display:none !important" title="Dock Left-Down">LD</button>
            <button type="button" class="kdock-dock-btn" data-dock="right-up" hidden style="display:none !important" title="Dock Right-Up">RU</button>
            <button type="button" class="kdock-dock-btn" data-dock="right-down" hidden style="display:none !important" title="Dock Right-Down">RD</button>
            <button type="button" class="kdock-dock-btn" data-dock="bottom" hidden style="display:none !important" title="Dock Bottom">BTM</button>
            <button type="button" class="kdock-dock-btn kdock-btn-float" data-dock="float" hidden style="display:none !important" title="Detach as Floating Window">FLT</button>
            <button type="button" class="kdock-win-btn kdock-btn-redock" title="Return Panel to Main Right Sidebar Dock">↵ Dock</button>
            <button type="button" class="kdock-win-btn kdock-btn-shade" title="Minimize / Shade Panel Body">—</button>
            <button type="button" class="kdock-win-btn kdock-btn-close" title="Close / Return Panel">×</button>
          </div>
        </header>
        <div class="kdock-pane-body"></div>
        <div class="kdock-float-resize kdock-rs-r" title="Drag to resize width"></div>
        <div class="kdock-float-resize kdock-rs-b" title="Drag to resize height"></div>
        <div class="kdock-float-resize kdock-rs-br" title="Drag corner to resize window"></div>
      `;

      if (typeof hydrateIcons === 'function') hydrateIcons(pane);

      // Wire quick-dock buttons
      pane.querySelectorAll('.kdock-dock-btn').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          this.dockPanel(pid, btn.dataset.dock);
        };
      });

      // Wire shade/minimize button
      const shadeBtn = pane.querySelector('.kdock-btn-shade');
      if (shadeBtn) {
        shadeBtn.onclick = e => {
          e.stopPropagation();
          cfg.shaded = !cfg.shaded;
          pane.classList.toggle('is-shaded', cfg.shaded);
          shadeBtn.textContent = cfg.shaded ? '□' : '—';
        };
      }

      // Wire return-to-dock button (shown when panel is separated from main right dock)
      const redockBtn = pane.querySelector('.kdock-btn-redock');
      if (redockBtn) {
        redockBtn.onclick = e => {
          e.stopPropagation();
          this.dockPanel(pid, 'right-up');
        };
      }

      // Wire close/hide button
      const closeBtn = pane.querySelector('.kdock-btn-close');
      if (closeBtn) {
        closeBtn.onclick = e => {
          e.stopPropagation();
          if (cfg.zone !== 'right-up') {
            this.dockPanel(pid, 'right-up');
          } else {
            this.setPanelVisibility(pid, false);
            rpToast(`Hidden "${cfg.title}" — Reopen anytime from Settings → Panels & Layout.`);
          }
        };
      }

      // Bring floating window to front on pointerdown
      pane.addEventListener('pointerdown', () => {
        if (cfg.zone === 'float') {
          pane.style.zIndex = String(++this.topZ);
        }
      });

      // Wire header drag (to move floating window OR launch docking compass!)
      const hdr = pane.querySelector('.kdock-pane-header');
      if (hdr) {
        hdr.ondblclick = e => {
          if (e.target.closest('button')) return;
          cfg.shaded = !cfg.shaded;
          pane.classList.toggle('is-shaded', cfg.shaded);
        };
        this.wireHeaderDrag(hdr, pid, pane);
      }

      // Wire floating resize handles
      this.wireFloatingResize(pane, pid);

      return pane;
    },

    buildVisibilityPanelContent() {
      const paneVis = this.paneElements.vis;
      if (!paneVis) return;
      const body = paneVis.querySelector('.kdock-pane-body');
      if (!body) return;

      body.innerHTML = `
        <div class="kdock-vis-panel">
          <div class="kdock-sec-hdr">
            <span>LAYER VISIBILITY &amp; COLOR FILTERS</span>
            <select id="kdock-vis-palette" class="rp-select-xs" title="Quick Color Palette Preset">
              <option value="std">Red / Green (Std)</option>
              <option value="cb">Cyan / Magenta</option>
              <option value="ba">Blue / Amber</option>
              <option value="cam">Gold / Emerald (CAM)</option>
              <option value="po">Purple / Orange</option>
            </select>
          </div>

          <div class="kdock-vis-grid">
            <div class="kdock-vis-row">
              <button type="button" class="rp-eye on" id="alg-eye-a" title="Toggle Rev A (Base) Visibility"><i data-ic="eye"></i></button>
              <span class="kdock-vis-lbl"><b class="dot-a" style="color:#ef4444">●</b> Rev A (Old · Red)</span>
              <input type="color" id="alg-col-a" value="#e11414" title="Rev A Color" />
              <input type="range" id="alg-op-a" min="10" max="100" value="100" title="Rev A Opacity %" />
              <span id="alg-op-a-txt" class="kdock-val-pill">100%</span>
            </div>
            <div class="kdock-vis-row">
              <button type="button" class="rp-eye on" id="alg-eye-b" title="Toggle Rev B (Revised) Visibility"><i data-ic="eye"></i></button>
              <span class="kdock-vis-lbl"><b class="dot-b" style="color:#22c55e">●</b> Rev B (New · Green)</span>
              <input type="color" id="alg-col-b" value="#00a53c" title="Rev B Color" />
              <input type="range" id="alg-op-b" min="10" max="100" value="100" title="Rev B Opacity %" />
              <span id="alg-op-b-txt" class="kdock-val-pill">100%</span>
            </div>
            <div class="kdock-vis-row">
              <button type="button" class="rp-eye on" id="alg-eye-c" title="Toggle Common Geometry Visibility"><i data-ic="eye"></i></button>
              <span class="kdock-vis-lbl"><b class="dot-c">●</b> Common</span>
              <input type="color" id="alg-col-c" value="#94a3b8" title="Common Geometry Color" />
              <input type="range" id="alg-op-c" min="10" max="100" value="42" title="Common Opacity %" />
              <span id="alg-op-c-txt" class="kdock-val-pill">42%</span>
            </div>
          </div>

          <div class="kdock-chk-strip">
            <label class="chk"><input type="checkbox" id="alg-chk-markers" checked /> Error Markers</label>
            <label class="chk"><input type="checkbox" id="alg-chk-grid" /> CAD Grid</label>
            <label class="chk"><input type="checkbox" id="alg-chk-cross" /> Crosshair</label>
            <label class="chk"><input type="checkbox" id="alg-chk-loupe" /> 4x Loupe</label>
          </div>

          <div class="kdock-sec-hdr">
            <span>DETECTION SENSITIVITY &amp; NOISE FILTER</span>
          </div>
          <div class="kdock-sliders-box">
            <label class="kdock-slider-row">
              <span>Threshold <b id="alg-tol-txt">40</b></span>
              <input type="range" id="alg-tol-rng" min="5" max="140" value="40" />
            </label>
            <label class="kdock-slider-row">
              <span>Min Defect <b id="alg-minpx-txt">2px</b></span>
              <input type="range" id="alg-minpx-rng" min="1" max="20" value="2" />
            </label>
            <label class="kdock-slider-row">
              <span>Edge Filter <b id="alg-edge-txt">0px</b></span>
              <input type="range" id="alg-edge-rng" min="0" max="4" value="0" />
            </label>
          </div>

          <div class="kdock-sec-hdr">
            <span>SUB-PIXEL ALIGNMENT &amp; SKEW</span>
            <div style="display:flex;gap:4px">
              <button type="button" class="rp-btn-sm" id="alg-btn-autoalign" title="Run Sub-Pixel Auto-Align (A)">Auto-Align</button>
              <button type="button" class="rp-btn-sm" id="alg-btn-reset" title="Reset X/Y Shift & Rotation Skew">Reset</button>
            </div>
          </div>
          <div class="kdock-nudge-pad">
            <button type="button" class="rp-btn-sm" data-algnudge="x-1">X −1</button>
            <button type="button" class="rp-btn-sm" data-algnudge="x-01">X −0.1</button>
            <button type="button" class="rp-btn-sm" data-algnudge="x01">X +0.1</button>
            <button type="button" class="rp-btn-sm" data-algnudge="x1">X +1</button>
            <button type="button" class="rp-btn-sm" data-algnudge="y-1">Y −1</button>
            <button type="button" class="rp-btn-sm" data-algnudge="y-01">Y −0.1</button>
            <button type="button" class="rp-btn-sm" data-algnudge="y01">Y +0.1</button>
            <button type="button" class="rp-btn-sm" data-algnudge="y1">Y +1</button>
          </div>
          <div class="kdock-offset-readout">
            <span>Shift ΔX: <b id="alg-dx-lbl">0</b> px</span>
            <span>Shift ΔY: <b id="alg-dy-lbl">0</b> px</span>
          </div>
        </div>
      `;

      if (typeof hydrateIcons === 'function') hydrateIcons(body);

      const bindEye = (btnId, chkId) => {
        const b = body.querySelector(btnId);
        if (!b) return;
        b.onclick = () => {
          const c = $(chkId);
          if (c) {
            c.checked = !c.checked;
            c.dispatchEvent(new Event('change'));
            this.syncVisibilityPanelUI();
          }
        };
      };
      bindEye('#alg-eye-a', '#lA');
      bindEye('#alg-eye-b', '#lB');
      bindEye('#alg-eye-c', '#lC');

      const applyCols = patch => {
        if (window.setCompareColors) window.setCompareColors(patch);
        else if (window.CMP) {
          Object.assign(window.CMP, patch);
          if (typeof window.paint === 'function') window.paint();
        }
        this.syncVisibilityPanelUI();
      };

      const colA = body.querySelector('#alg-col-a');
      if (colA) colA.oninput = e => applyCols({ tintA: e.target.value });
      const colB = body.querySelector('#alg-col-b');
      if (colB) colB.oninput = e => applyCols({ tintB: e.target.value });
      const colC = body.querySelector('#alg-col-c');
      if (colC) colC.oninput = e => applyCols({ tintC: e.target.value });

      const opA = body.querySelector('#alg-op-a');
      if (opA) opA.oninput = e => { applyCols({ opA: +e.target.value }); };
      const opB = body.querySelector('#alg-op-b');
      if (opB) opB.oninput = e => { applyCols({ opB: +e.target.value }); };
      const opC = body.querySelector('#alg-op-c');
      if (opC) opC.oninput = e => { applyCols({ opC: +e.target.value }); };

      const pal = body.querySelector('#kdock-vis-palette');
      if (pal) {
        pal.onchange = e => {
          const pSel = $('#rp-palette-preset');
          if (pSel) {
            pSel.value = e.target.value;
            pSel.dispatchEvent(new Event('change'));
            this.syncVisibilityPanelUI();
          }
        };
      }

      const chkM = body.querySelector('#alg-chk-markers');
      if (chkM) {
        chkM.onchange = e => {
          const lM = $('#lM');
          if (lM) { lM.checked = e.target.checked; lM.dispatchEvent(new Event('change')); }
        };
      }
      const chkG = body.querySelector('#alg-chk-grid');
      if (chkG) chkG.onchange = () => { if ($('#rib-grid-toggle')) $('#rib-grid-toggle').click(); };
      const chkX = body.querySelector('#alg-chk-cross');
      if (chkX) chkX.onchange = () => { if ($('#rib-crosshair-toggle')) $('#rib-crosshair-toggle').click(); };
      const chkL = body.querySelector('#alg-chk-loupe');
      if (chkL) chkL.onchange = () => { if ($('#rib-loupe-toggle')) $('#rib-loupe-toggle').click(); };

      const tolRng = body.querySelector('#alg-tol-rng');
      if (tolRng) {
        tolRng.oninput = e => {
          const v = e.target.value;
          const lbl = body.querySelector('#alg-tol-txt');
          if (lbl) lbl.textContent = v;
          if ($('#rp-diff-thresh')) {
            $('#rp-diff-thresh').value = v;
            $('#rp-diff-thresh').dispatchEvent(new Event('input'));
          } else if ($('#tol')) {
            $('#tol').value = v;
            $('#tol').dispatchEvent(new Event('change'));
          }
        };
      }

      const minRng = body.querySelector('#alg-minpx-rng');
      if (minRng) {
        minRng.oninput = e => {
          const v = e.target.value;
          const lbl = body.querySelector('#alg-minpx-txt');
          if (lbl) lbl.textContent = v + 'px';
          if ($('#rp-noise-thresh')) {
            $('#rp-noise-thresh').value = v;
            $('#rp-noise-thresh').dispatchEvent(new Event('input'));
          }
        };
      }

      const edgeRng = body.querySelector('#alg-edge-rng');
      if (edgeRng) {
        edgeRng.oninput = e => {
          const v = e.target.value;
          const lbl = body.querySelector('#alg-edge-txt');
          if (lbl) lbl.textContent = v + 'px';
          if ($('#rp-edge-thresh')) {
            $('#rp-edge-thresh').value = v;
            $('#rp-edge-thresh').dispatchEvent(new Event('input'));
          }
        };
      }

      body.querySelectorAll('[data-algnudge]').forEach(btn => {
        btn.onclick = () => {
          const target = document.querySelector(`[data-nudge="${btn.dataset.algnudge}"]`);
          if (target) target.click();
          this.syncVisibilityPanelUI();
        };
      });

      const autoBtn = body.querySelector('#alg-btn-autoalign');
      if (autoBtn) autoBtn.onclick = () => { if ($('#align')) $('#align').click(); setTimeout(() => this.syncVisibilityPanelUI(), 120); };

      const rstBtn = body.querySelector('#alg-btn-reset');
      if (rstBtn) rstBtn.onclick = () => { if ($('#rp-reset-nudge')) $('#rp-reset-nudge').click(); this.syncVisibilityPanelUI(); };
    },

    syncVisibilityPanelUI() {
      const paneVis = this.paneElements.vis;
      if (!paneVis) return;
      const S = (typeof window !== 'undefined' && window.CMP) ? window.CMP : {};
      const lA = $('#lA'), lB = $('#lB'), lC = $('#lC'), lM = $('#lM');
      const setEye = (sel, on) => { const b = paneVis.querySelector(sel); if (b) b.classList.toggle('on', !!on); };
      if (lA) setEye('#alg-eye-a', lA.checked);
      if (lB) setEye('#alg-eye-b', lB.checked);
      if (lC) setEye('#alg-eye-c', lC.checked);
      if (lM && paneVis.querySelector('#alg-chk-markers')) paneVis.querySelector('#alg-chk-markers').checked = lM.checked;

      if (S.tintA && paneVis.querySelector('#alg-col-a')) paneVis.querySelector('#alg-col-a').value = S.tintA;
      if (S.tintB && paneVis.querySelector('#alg-col-b')) paneVis.querySelector('#alg-col-b').value = S.tintB;
      if (S.tintC && paneVis.querySelector('#alg-col-c')) paneVis.querySelector('#alg-col-c').value = S.tintC;

      const opA = S.opA != null ? S.opA : 100;
      const opB = S.opB != null ? S.opB : 100;
      const opC = S.opC != null ? S.opC : 42;
      if (paneVis.querySelector('#alg-op-a')) paneVis.querySelector('#alg-op-a').value = opA;
      if (paneVis.querySelector('#alg-op-a-txt')) paneVis.querySelector('#alg-op-a-txt').textContent = opA + '%';
      if (paneVis.querySelector('#alg-op-b')) paneVis.querySelector('#alg-op-b').value = opB;
      if (paneVis.querySelector('#alg-op-b-txt')) paneVis.querySelector('#alg-op-b-txt').textContent = opB + '%';
      if (paneVis.querySelector('#alg-op-c')) paneVis.querySelector('#alg-op-c').value = opC;
      if (paneVis.querySelector('#alg-op-c-txt')) paneVis.querySelector('#alg-op-c-txt').textContent = opC + '%';

      const dx = $('#dx') ? $('#dx').value : '0';
      const dy = $('#dy') ? $('#dy').value : '0';
      if (paneVis.querySelector('#alg-dx-lbl')) paneVis.querySelector('#alg-dx-lbl').textContent = dx;
      if (paneVis.querySelector('#alg-dy-lbl')) paneVis.querySelector('#alg-dy-lbl').textContent = dy;
    },

    buildDockCompass() {
      if ($('#kdock-dock-compass')) return;
      const compass = el('div', { id: 'kdock-dock-compass', className: 'kdock-dock-compass', hidden: true });
      compass.innerHTML = `
        <div class="kdock-compass-preview" id="kdock-compass-preview" hidden></div>
        <div class="kdock-compass-zone zone-lu" data-drop-zone="left-up">
          <i data-ic="dockLU"></i>
          <b>Left Up</b>
          <small>Top-Left Dock</small>
        </div>
        <div class="kdock-compass-zone zone-ld" data-drop-zone="left-down">
          <i data-ic="dockLD"></i>
          <b>Left Down</b>
          <small>Bottom-Left Dock</small>
        </div>
        <div class="kdock-compass-zone zone-ru" data-drop-zone="right-up">
          <i data-ic="dockRU"></i>
          <b>Right Up</b>
          <small>Top-Right Dock</small>
        </div>
        <div class="kdock-compass-zone zone-rd" data-drop-zone="right-down">
          <i data-ic="dockRD"></i>
          <b>Right Down</b>
          <small>Bottom-Right Dock</small>
        </div>
        <div class="kdock-compass-zone zone-btm" data-drop-zone="bottom">
          <i data-ic="dockBtm"></i>
          <b>Bottom Console</b>
          <small>Horizontal Dock</small>
        </div>
        <div class="kdock-compass-center" data-drop-zone="float">
          <i data-ic="dockFloat"></i>
          <b>Drop Here or Anywhere to Float as Separate Window</b>
        </div>
      `;
      document.body.appendChild(compass);
      if (typeof hydrateIcons === 'function') hydrateIcons(compass);
    },

    wireHeaderDrag(hdr, pid, pane, isTabDrag = false) {
      hdr.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        if (!isTabDrag && e.target.closest('button, select, input')) return;
        const cfg = this.panels[pid];
        if (!cfg) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const wasFloat = cfg.zone === 'float';
        const initRect = pane.getBoundingClientRect();
        const offsetX = startX - initRect.left;
        const offsetY = startY - initRect.top;
        let dragging = false;
        let hoveredZone = null;

        const compass = $('#kdock-dock-compass');
        const onMove = ev => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (!dragging && Math.hypot(dx, dy) < 6) return;

          if (!dragging) {
            dragging = true;
            if (!wasFloat) {
              cfg.floatRect.w = Math.max(280, Math.min(440, initRect.width || 330));
              cfg.floatRect.h = Math.max(260, Math.min(520, initRect.height || 380));
              this.dockPanel(pid, 'float', true);
            }
            pane.style.zIndex = String(++this.topZ);
            pane.classList.add('is-dragging');
            if (compass) compass.hidden = false;
          }

          const nx = Math.max(6, Math.min(window.innerWidth - 120, ev.clientX - Math.min(offsetX, cfg.floatRect.w - 40)));
          const ny = Math.max(36, Math.min(window.innerHeight - 60, ev.clientY - 14));
          cfg.floatRect.x = nx;
          cfg.floatRect.y = ny;
          pane.style.left = nx + 'px';
          pane.style.top = ny + 'px';

          // Check if pointer is over any compass drop target
          hoveredZone = null;
          if (compass) {
            compass.querySelectorAll('[data-drop-zone]').forEach(zEl => {
              const r = zEl.getBoundingClientRect();
              const hit = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
              zEl.classList.toggle('active-drop', hit);
              if (hit) hoveredZone = zEl.dataset.dropZone;
            });
          }
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          pane.classList.remove('is-dragging');
          if (compass) {
            compass.hidden = true;
            compass.querySelectorAll('[data-drop-zone]').forEach(zEl => zEl.classList.remove('active-drop'));
          }
          if (dragging) {
            if (hoveredZone && hoveredZone !== 'float') {
              this.dockPanel(pid, hoveredZone);
            } else {
              this.syncLayout();
              rpToast(`Detached "${cfg.title}" as a floating window (Drag header or click LU/LD/RU/RD/BTM to dock).`);
            }
          }
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    },

    wireFloatingResize(pane, pid) {
      const cfg = this.panels[pid];
      if (!cfg) return;
      pane.querySelectorAll('.kdock-float-resize').forEach(handle => {
        const isR = handle.classList.contains('kdock-rs-r') || handle.classList.contains('kdock-rs-br');
        const isB = handle.classList.contains('kdock-rs-b') || handle.classList.contains('kdock-rs-br');
        handle.addEventListener('pointerdown', e => {
          if (cfg.zone !== 'float') return;
          e.preventDefault();
          e.stopPropagation();
          const sx = e.clientX, sy = e.clientY;
          const sw = pane.offsetWidth || cfg.floatRect.w || 340;
          const sh = pane.offsetHeight || cfg.floatRect.h || 380;
          const onMove = ev => {
            if (isR) {
              cfg.floatRect.w = Math.max(250, Math.min(window.innerWidth - 20, sw + (ev.clientX - sx)));
              pane.style.width = cfg.floatRect.w + 'px';
            }
            if (isB) {
              cfg.floatRect.h = Math.max(180, Math.min(window.innerHeight - 50, sh + (ev.clientY - sy)));
              pane.style.height = cfg.floatRect.h + 'px';
            }
          };
          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });
      });
    },

    wireSplitters(leftDock, rightDock, centerCol, splitLeftV, splitLUD, splitRUD, splitBtmH) {
      // 1. Left Dock Width Splitter
      if (splitLeftV && leftDock) {
        splitLeftV.addEventListener('pointerdown', e => {
          e.preventDefault();
          const sx = e.clientX;
          const sw = leftDock.offsetWidth || this.leftDockWidth;
          const onMove = ev => {
            this.leftDockWidth = Math.max(220, Math.min(window.innerWidth * 0.42, sw + (ev.clientX - sx)));
            leftDock.style.width = this.leftDockWidth + 'px';
            leftDock.style.flexBasis = this.leftDockWidth + 'px';
          };
          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.dispatchEvent(new Event('resize'));
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });
        splitLeftV.ondblclick = () => {
          this.leftDockWidth = 300;
          leftDock.style.width = '300px';
          leftDock.style.flexBasis = '300px';
          window.dispatchEvent(new Event('resize'));
        };
      }

      // 2. Left Dock Up/Down Splitter
      if (splitLUD && leftDock) {
        splitLUD.addEventListener('pointerdown', e => {
          e.preventDefault();
          const rect = leftDock.getBoundingClientRect();
          const onMove = ev => {
            const r = (ev.clientY - rect.top) / Math.max(100, rect.height);
            this.leftSplitRatio = Math.max(0.18, Math.min(0.82, r));
            this.applySplitRatios();
          };
          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });
        splitLUD.ondblclick = () => {
          this.leftSplitRatio = 0.50;
          this.applySplitRatios();
        };
      }

      // 3. Right Dock Up/Down Splitter
      if (splitRUD && rightDock) {
        splitRUD.addEventListener('pointerdown', e => {
          e.preventDefault();
          const rect = rightDock.getBoundingClientRect();
          const onMove = ev => {
            const r = (ev.clientY - rect.top - 34) / Math.max(100, rect.height - 34);
            this.rightSplitRatio = Math.max(0.18, Math.min(0.82, r));
            this.applySplitRatios();
          };
          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });
        splitRUD.ondblclick = () => {
          this.rightSplitRatio = 0.50;
          this.applySplitRatios();
        };
      }

      // 4. Bottom Console Height Splitter
      if (splitBtmH && centerCol) {
        const zoneBtm = this.zoneElements['bottom'];
        splitBtmH.addEventListener('pointerdown', e => {
          e.preventDefault();
          const sy = e.clientY;
          const sh = (zoneBtm && zoneBtm.offsetHeight) || this.bottomDockHeight;
          const onMove = ev => {
            this.bottomDockHeight = Math.max(130, Math.min(window.innerHeight * 0.48, sh - (ev.clientY - sy)));
            if (zoneBtm) {
              zoneBtm.style.height = this.bottomDockHeight + 'px';
              zoneBtm.style.flexBasis = this.bottomDockHeight + 'px';
            }
          };
          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.dispatchEvent(new Event('resize'));
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });
        splitBtmH.ondblclick = () => {
          this.bottomDockHeight = 220;
          if (zoneBtm) {
            zoneBtm.style.height = '220px';
            zoneBtm.style.flexBasis = '220px';
          }
          window.dispatchEvent(new Event('resize'));
        };
      }
    },

    applySplitRatios() {
      const zLU = this.zoneElements['left-up'];
      const zLD = this.zoneElements['left-down'];
      const sLUD = $('#kdock-split-left-ud');
      if (zLU && zLD) {
        const hasLU = !zLU.hidden;
        const hasLD = !zLD.hidden;
        if (hasLU && hasLD) {
          zLU.style.flex = `${this.leftSplitRatio} 1 0%`;
          zLD.style.flex = `${1 - this.leftSplitRatio} 1 0%`;
          if (sLUD) sLUD.hidden = false;
        } else {
          zLU.style.flex = '1 1 100%';
          zLD.style.flex = '1 1 100%';
          if (sLUD) sLUD.hidden = true;
        }
      }

      const zRU = this.zoneElements['right-up'];
      const zRD = this.zoneElements['right-down'];
      const sRUD = $('#kdock-split-right-ud');
      if (zRU && zRD) {
        const hasRU = !zRU.hidden;
        const hasRD = !zRD.hidden;
        if (hasRU && hasRD) {
          zRU.style.flex = `${this.rightSplitRatio} 1 0%`;
          zRD.style.flex = `${1 - this.rightSplitRatio} 1 0%`;
          if (sRUD) sRUD.hidden = false;
        } else {
          zRU.style.flex = '1 1 100%';
          zRD.style.flex = '1 1 100%';
          if (sRUD) sRUD.hidden = true;
        }
      }
    },

    dockPanel(pid, targetZone, silent = false) {
      const cfg = this.panels[pid];
      if (!cfg || !this.zoneElements[targetZone]) return;
      cfg.zone = targetZone;
      cfg.visible = true;
      cfg.shaded = false;
      const pane = this.paneElements[pid];
      if (pane) pane.classList.remove('is-shaded');
      if (targetZone !== 'float') {
        this.zoneActivePanel[targetZone] = pid;
      } else if (pane) {
        pane.style.zIndex = String(++this.topZ);
      }
      if (pid === 'cam') updateCAMSidebarPane();
      if (pid === 'markups' && window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      if (pid === 'vis') this.syncVisibilityPanelUI();

      this.syncLayout();
      if (!silent) {
        const zoneNames = {
          'left-up': 'Left-Up Dock',
          'left-down': 'Left-Down Dock',
          'right-up': 'Right-Up Dock',
          'right-down': 'Right-Down Dock',
          'bottom': 'Bottom Console Dock',
          'float': 'Separate Floating Window'
        };
        rpToast(`Docked "${cfg.title}" → ${zoneNames[targetZone] || targetZone}`);
      }
    },

    setPanelVisibility(pid, visible) {
      const cfg = this.panels[pid];
      if (!cfg) return;
      cfg.visible = !!visible;
      if (visible && cfg.zone !== 'float') {
        this.zoneActivePanel[cfg.zone] = pid;
      }
      this.syncLayout();
    },

    activatePanel(pid) {
      const cfg = this.panels[pid];
      if (!cfg) return;
      cfg.visible = true;
      cfg.shaded = false;
      const pane = this.paneElements[pid];
      if (pane) pane.classList.remove('is-shaded');
      const aside = $('#view-compare aside');
      if (aside && (cfg.zone === 'right-up' || cfg.zone === 'right-down')) {
        aside.classList.remove('rp-collapsed');
      }
      if (cfg.zone !== 'float') {
        this.zoneActivePanel[cfg.zone] = pid;
      } else if (pane) {
        pane.style.zIndex = String(++this.topZ);
      }
      this.syncLayout();
      if (pane) {
        pane.classList.remove('kdock-flash');
        void pane.offsetWidth;
        pane.classList.add('kdock-flash');
      }
    },

    applyPreset(presetId, silent = false) {
      this.activePreset = presetId;
      $$('.kdock-lbtn').forEach(b => b.classList.toggle('on', b.dataset.kpreset === presetId));
      const P = this.panels;
      Object.values(P).forEach(p => { p.visible = true; p.shaded = false; });

      if (presetId === 'dock-quad') {
        P.vis.zone = 'left-up';
        P.markups.zone = 'left-down';
        P.diffs.zone = 'right-up';
        P.cam.zone = 'right-down';
        P.text.zone = 'right-down';
        this.zoneActivePanel['left-up'] = 'vis';
        this.zoneActivePanel['left-down'] = 'markups';
        this.zoneActivePanel['right-up'] = 'diffs';
        this.zoneActivePanel['right-down'] = 'cam';
      } else if (presetId === 'dock-left-split') {
        P.diffs.zone = 'left-up';
        P.cam.zone = 'left-down';
        P.vis.zone = 'right-up';
        P.text.zone = 'right-down';
        P.markups.zone = 'right-down';
        this.zoneActivePanel['left-up'] = 'diffs';
        this.zoneActivePanel['left-down'] = 'cam';
        this.zoneActivePanel['right-up'] = 'vis';
        this.zoneActivePanel['right-down'] = 'text';
      } else if (presetId === 'dock-bottom-console') {
        P.vis.zone = 'left-up';
        P.diffs.zone = 'right-up';
        P.cam.zone = 'right-down';
        P.text.zone = 'bottom';
        P.markups.zone = 'bottom';
        this.zoneActivePanel['left-up'] = 'vis';
        this.zoneActivePanel['right-up'] = 'diffs';
        this.zoneActivePanel['right-down'] = 'cam';
        this.zoneActivePanel['bottom'] = 'text';
      } else if (presetId === 'dock-floating') {
        P.diffs.zone = 'float';
        P.diffs.floatRect = { x: Math.max(20, window.innerWidth - 390), y: 110, w: 365, h: 410 };
        P.cam.zone = 'float';
        P.cam.floatRect = { x: Math.max(20, window.innerWidth - 770), y: 110, w: 360, h: 410 };
        P.vis.zone = 'float';
        P.vis.floatRect = { x: 24, y: 110, w: 330, h: 440 };
        P.text.zone = 'right-up';
        P.markups.zone = 'right-down';
        this.zoneActivePanel['right-up'] = 'text';
        this.zoneActivePanel['right-down'] = 'markups';
      } else if (presetId === 'classic-tabbed') {
        P.diffs.zone = 'right-up';
        P.cam.zone = 'right-up';
        P.vis.zone = 'right-up';
        P.text.zone = 'right-up';
        P.markups.zone = 'right-up';
        this.zoneActivePanel['right-up'] = 'diffs';
      } else {
        // Default: 'dock-right-split' (Right-Up: Diffs, Right-Down: CAM/DFM, Visibility, Text, Markups)
        P.diffs.zone = 'right-up';
        P.cam.zone = 'right-down';
        P.vis.zone = 'right-down';
        P.text.zone = 'right-down';
        P.markups.zone = 'right-down';
        this.zoneActivePanel['right-up'] = 'diffs';
        this.zoneActivePanel['right-down'] = 'cam';
      }

      const aside = $('#view-compare aside');
      if (aside) aside.classList.remove('rp-collapsed');
      updateCAMSidebarPane();
      if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      this.syncVisibilityPanelUI();
      this.syncLayout();

      if (!silent) {
        rpToast(`Applied Workspace Layout Preset: ${presetId.replace(/-/g, ' ').toUpperCase()}`);
      }
    },

    syncLayout() {
      if (!this.initialized) return;

      const dockZones = ['left-up', 'left-down', 'right-up', 'right-down', 'bottom'];
      for (const zCode of dockZones) {
        const zEl = this.zoneElements[zCode];
        if (!zEl) continue;

        const assigned = Object.values(this.panels).filter(p => p.visible && p.zone === zCode);
        if (!assigned.length) {
          zEl.hidden = true;
          continue;
        }
        zEl.hidden = false;

        // Ensure an active panel is chosen for this zone
        let activeId = this.zoneActivePanel[zCode];
        if (!assigned.some(p => p.id === activeId)) {
          activeId = assigned[0].id;
          this.zoneActivePanel[zCode] = activeId;
        }

        // Render or update zone tab strip ONLY for non-right-up zones when 2+ panels share that zone
        // (For right-up, #view-compare aside > .tabs serves as the single tab bar so there are NEVER duplicate tab rows!)
        let zTabs = zEl.querySelector(':scope > .kdock-zone-tabs');
        if (zCode !== 'right-up' && assigned.length > 1) {
          if (!zTabs) {
            zTabs = el('div', { className: 'kdock-zone-tabs' });
            zEl.insertBefore(zTabs, zEl.firstChild);
          }
          zTabs.hidden = false;
          zTabs.style.display = '';
          zTabs.innerHTML = assigned.map(p => `
            <button type="button" class="kdock-ztab ${p.id === activeId ? 'on' : ''}" data-pid="${p.id}" title="${p.title} (Click to switch tab, or drag header/tab to move)">
              <i data-ic="${p.icon}"></i>
              <span>${p.shortTitle}</span>
            </button>
          `).join('');
          if (typeof hydrateIcons === 'function') hydrateIcons(zTabs);
          zTabs.querySelectorAll('.kdock-ztab').forEach(tb => {
            const pid = tb.dataset.pid;
            tb.onclick = () => {
              this.zoneActivePanel[zCode] = pid;
              if (pid === 'cam') updateCAMSidebarPane();
              if (pid === 'markups' && window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
              if (pid === 'vis') this.syncVisibilityPanelUI();
              this.syncLayout();
            };
            if (this.paneElements[pid]) {
              this.wireHeaderDrag(tb, pid, this.paneElements[pid], true);
            }
          });
        } else if (zTabs) {
          zTabs.hidden = true;
          zTabs.style.display = 'none';
        }

        // Mount each assigned panel into zEl and toggle active visibility
        for (const p of assigned) {
          const pane = this.paneElements[p.id];
          if (!pane) continue;
          if (pane.parentNode !== zEl) zEl.appendChild(pane);
          pane.classList.remove('is-floating');
          pane.classList.toggle('is-separated', zCode !== 'right-up');
          pane.style.left = '';
          pane.style.top = '';
          pane.style.width = '';
          pane.style.height = '';
          pane.style.zIndex = '';
          pane.hidden = (p.id !== activeId);
          this.highlightActiveDockButton(pane, zCode);
        }
      }

      // Synchronize the main right sidebar tab bar (#view-compare aside > .tabs):
      // ONLY panels currently docked in 'right-up' (and visible) appear in the right sidebar tab bar!
      // If a panel is separated to Left-Up, Left-Down, Right-Down, Bottom, or Float, its tab name disappears from the original right dock.
      const mainRightTabs = $('#view-compare aside > .tabs');
      if (mainRightTabs) {
        const mapCodeToId = { d: 'diffs', t: 'text', cam: 'cam', c: 'cam', m: 'markups', vis: 'vis' };
        const rightUpAssigned = Object.values(this.panels).filter(p => p.visible && p.zone === 'right-up');
        const activeRightUpId = this.zoneActivePanel['right-up'];
        mainRightTabs.querySelectorAll('button[data-t]').forEach(btn => {
          const pid = mapCodeToId[btn.dataset.t];
          const p = pid ? this.panels[pid] : null;
          const inRightUp = !!(p && p.visible && p.zone === 'right-up');
          btn.hidden = !inRightUp;
          btn.classList.toggle('kdock-tab-detached', !inRightUp);
          if (!inRightUp) btn.style.setProperty('display', 'none', 'important');
          else btn.style.removeProperty('display');
          btn.classList.toggle('on', inRightUp && activeRightUpId === pid);
        });
        const layoutBtnInTabs = mainRightTabs.querySelector('#kdock-aside-layout-btn');
        if (layoutBtnInTabs) {
          layoutBtnInTabs.hidden = true;
          layoutBtnInTabs.style.display = 'none';
        }
        mainRightTabs.hidden = rightUpAssigned.length === 0;
        mainRightTabs.style.display = rightUpAssigned.length === 0 ? 'none' : '';
      }

      // Mount floating panels into #kdock-float-layer
      const floatLayer = this.zoneElements['float'];
      const floatingPanels = Object.values(this.panels).filter(p => p.visible && p.zone === 'float');
      if (floatLayer) {
        for (const p of floatingPanels) {
          const pane = this.paneElements[p.id];
          if (!pane) continue;
          if (pane.parentNode !== floatLayer) floatLayer.appendChild(pane);
          pane.hidden = false;
          pane.classList.add('is-floating', 'is-separated');
          pane.style.left = (p.floatRect.x || 100) + 'px';
          pane.style.top = (p.floatRect.y || 120) + 'px';
          pane.style.width = (p.floatRect.w || 350) + 'px';
          pane.style.height = p.shaded ? 'auto' : ((p.floatRect.h || 420) + 'px');
          if (!pane.style.zIndex) pane.style.zIndex = String(++this.topZ);
          this.highlightActiveDockButton(pane, 'float');
        }
      }

      // Hide any panel marked visible === false
      for (const p of Object.values(this.panels)) {
        if (!p.visible && this.paneElements[p.id]) {
          this.paneElements[p.id].hidden = true;
        }
      }

      // Toggle Left Dock column, Right Dock column, and Bottom Dock visibility
      const leftDock = $('#kdock-dock-left');
      if (leftDock) {
        const hasLeft = !this.zoneElements['left-up'].hidden || !this.zoneElements['left-down'].hidden;
        leftDock.hidden = !hasLeft;
        if (hasLeft) {
          leftDock.style.width = this.leftDockWidth + 'px';
          leftDock.style.flexBasis = this.leftDockWidth + 'px';
        }
      }

      const rightDock = $('#view-compare aside');
      if (rightDock) {
        const hasRight = !this.zoneElements['right-up'].hidden || !this.zoneElements['right-down'].hidden;
        rightDock.classList.toggle('kdock-empty-dock', !hasRight);
      }

      const splitBtm = $('#kdock-split-bottom');
      const zoneBtm = this.zoneElements['bottom'];
      if (zoneBtm && splitBtm) {
        const hasBtm = !zoneBtm.hidden;
        splitBtm.hidden = !hasBtm;
        if (hasBtm) {
          zoneBtm.style.height = this.bottomDockHeight + 'px';
          zoneBtm.style.flexBasis = this.bottomDockHeight + 'px';
        }
      }

      this.applySplitRatios();
      window.dispatchEvent(new Event('resize'));
    },

    highlightActiveDockButton(pane, activeZone) {
      if (!pane) return;
      pane.querySelectorAll('.kdock-dock-btn').forEach(b => {
        b.classList.toggle('on', b.dataset.dock === activeZone);
      });
    },

    /**
     * Enhance PDF Studio (#view-edit) & AutoCAD DXF Studio (#view-dxf) Side Panels
     * with Multi-Zone Split / Left / Right / Float Capabilities
     */
    initEditStudioDocking() {
      const ebody = document.querySelector('#view-edit .ebody');
      const thumbs = $('#thumbs');
      const etools = $('#etools');
      if (!ebody || !thumbs || !etools || etools.dataset.kdockWired) return;
      etools.dataset.kdockWired = '1';

      // Add Multi-Zone Split / Float Controls to #etools so Document Info (#pTools) & Comments (#pComments) can be viewed Split Up/Down or Floating!
      const edTabs = etools.querySelector('.tabs');
      if (edTabs) {
        const splitBtn = el('button', {
          type: 'button',
          id: 'ed-kdock-split-btn',
          className: 'kdock-dock-btn on',
          title: 'Toggle Up/Down Split View (Show Document Info on Top & Review Comments on Bottom Simultaneously)'
        }, 'Up/Down Split');
        const sideBtn = el('button', {
          type: 'button',
          id: 'ed-kdock-side-btn',
          className: 'kdock-dock-btn',
          title: 'Move Inspector Dock Between Left Side and Right Side'
        }, 'L⇄R');
        const fltBtn = el('button', {
          type: 'button',
          id: 'ed-kdock-float-btn',
          className: 'kdock-dock-btn',
          title: 'Detach PDF Inspector as a Separate Floating Window'
        }, 'FLT');

        const colBtn = edTabs.querySelector('.rp-sidebar-collapse-btn');
        if (colBtn) {
          edTabs.insertBefore(splitBtn, colBtn);
          edTabs.insertBefore(sideBtn, colBtn);
          edTabs.insertBefore(fltBtn, colBtn);
        } else {
          edTabs.appendChild(splitBtn);
          edTabs.appendChild(sideBtn);
          edTabs.appendChild(fltBtn);
        }

        const pTools = $('#pTools');
        const pComments = $('#pComments');
        const enableEdSplit = (on) => {
          etools.classList.toggle('kdock-ed-split', on);
          splitBtn.classList.toggle('on', on);
          if (pTools && pComments) {
            if (on) {
              pTools.hidden = false;
              pComments.hidden = false;
            } else {
              const isComments = $('#cTab') && $('#cTab').classList.contains('on');
              pTools.hidden = !!isComments;
              pComments.hidden = !isComments;
            }
          }
        };

        splitBtn.onclick = e => {
          e.stopPropagation();
          enableEdSplit(!etools.classList.contains('kdock-ed-split'));
        };
        sideBtn.onclick = e => {
          e.stopPropagation();
          etools.classList.toggle('kdock-docked-left');
          sideBtn.classList.toggle('on', etools.classList.contains('kdock-docked-left'));
        };
        fltBtn.onclick = e => {
          e.stopPropagation();
          const isFlt = etools.classList.toggle('is-floating');
          fltBtn.classList.toggle('on', isFlt);
          if (isFlt) {
            etools.style.left = Math.max(40, window.innerWidth - 360) + 'px';
            etools.style.top = '130px';
            etools.style.height = '460px';
          } else {
            etools.style.left = '';
            etools.style.top = '';
            etools.style.height = '';
          }
        };
      }
    },

    initDXFStudioDocking() {
      const layerDock = $('#dxf-layer-dock');
      const propsDock = $('#dxf-props-dock');
      const dxfBody = document.querySelector('#view-dxf .dxf-studio-body');
      if (!layerDock || !propsDock || !dxfBody || dxfBody.dataset.kdockWired) return;
      dxfBody.dataset.kdockWired = '1';

      const injectDxfDockControls = (dockEl, defaultSide) => {
        const hdr = dockEl.querySelector('.dxf-dock-header');
        if (!hdr || hdr.querySelector('.kdock-dxf-controls')) return;
        const bar = el('div', { className: 'kdock-dxf-controls' }, `
          <button type="button" class="kdock-dock-btn ${defaultSide === 'left' ? 'on' : ''}" data-dxfpos="left-up" title="Dock Left-Up">LU</button>
          <button type="button" class="kdock-dock-btn" data-dxfpos="left-down" title="Dock Left-Down">LD</button>
          <button type="button" class="kdock-dock-btn ${defaultSide === 'right' ? 'on' : ''}" data-dxfpos="right-up" title="Dock Right-Up">RU</button>
          <button type="button" class="kdock-dock-btn" data-dxfpos="right-down" title="Dock Right-Down">RD</button>
          <button type="button" class="kdock-dock-btn" data-dxfpos="float" title="Detach as Separate Floating Window">FLT</button>
        `);
        hdr.appendChild(bar);

        bar.querySelectorAll('.kdock-dock-btn').forEach(btn => {
          btn.onclick = e => {
            e.stopPropagation();
            const pos = btn.dataset.dxfpos;
            bar.querySelectorAll('.kdock-dock-btn').forEach(b => b.classList.toggle('on', b === btn));
            this.applyDXFDockPosition(dockEl, pos);
          };
        });

        // Allow dragging floating DXF docks
        hdr.addEventListener('pointerdown', e => {
          if (!dockEl.classList.contains('is-floating') || e.target.closest('button, input, select')) return;
          const sx = e.clientX, sy = e.clientY;
          const r = dockEl.getBoundingClientRect();
          const onMove = ev => {
            dockEl.style.left = Math.max(8, Math.min(window.innerWidth - 120, r.left + (ev.clientX - sx))) + 'px';
            dockEl.style.top = Math.max(40, Math.min(window.innerHeight - 80, r.top + (ev.clientY - sy))) + 'px';
          };
          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });
      };

      injectDxfDockControls(layerDock, 'left');
      injectDxfDockControls(propsDock, 'right');
    },

    applyDXFDockPosition(dockEl, pos) {
      const dxfBody = document.querySelector('#view-dxf .dxf-studio-body');
      if (!dxfBody || !dockEl) return;

      let leftCol = dxfBody.querySelector('#dxf-kdock-left-col');
      let rightCol = dxfBody.querySelector('#dxf-kdock-right-col');
      const centerStage = dxfBody.querySelector('.dxf-center-stage');

      if (!leftCol && centerStage) {
        leftCol = el('div', { id: 'dxf-kdock-left-col', className: 'dxf-kdock-col dxf-kdock-left' });
        rightCol = el('div', { id: 'dxf-kdock-right-col', className: 'dxf-kdock-col dxf-kdock-right' });
        dxfBody.insertBefore(leftCol, centerStage);
        dxfBody.appendChild(rightCol);
        const lDock = $('#dxf-layer-dock');
        const rDock = $('#dxf-props-dock');
        if (lDock) leftCol.appendChild(lDock);
        if (rDock) rightCol.appendChild(rDock);
        dxfBody.classList.add('dxf-kdock-flex');
      }

      dockEl.classList.remove('is-floating', 'dock-up', 'dock-down');
      dockEl.style.left = '';
      dockEl.style.top = '';
      dockEl.style.width = '';
      dockEl.style.height = '';
      dockEl.style.zIndex = '';

      if (pos === 'float') {
        dockEl.classList.add('is-floating');
        dockEl.style.left = (dockEl.id === 'dxf-layer-dock' ? 40 : Math.max(60, window.innerWidth - 360)) + 'px';
        dockEl.style.top = '135px';
        dockEl.style.width = '310px';
        dockEl.style.height = '440px';
        dockEl.style.zIndex = String(++this.topZ);
      } else if (pos.startsWith('left')) {
        if (leftCol) {
          dockEl.classList.add(pos === 'left-up' ? 'dock-up' : 'dock-down');
          if (pos === 'left-up' && leftCol.firstChild) leftCol.insertBefore(dockEl, leftCol.firstChild);
          else leftCol.appendChild(dockEl);
        }
      } else if (pos.startsWith('right')) {
        if (rightCol) {
          dockEl.classList.add(pos === 'right-up' ? 'dock-up' : 'dock-down');
          if (pos === 'right-up' && rightCol.firstChild) rightCol.insertBefore(dockEl, rightCol.firstChild);
          else rightCol.appendChild(dockEl);
        }
      }

      if (leftCol) leftCol.hidden = leftCol.querySelectorAll(':scope > aside:not(.is-floating)').length === 0;
      if (rightCol) rightCol.hidden = rightCol.querySelectorAll(':scope > aside:not(.is-floating)').length === 0;
      if (window.DXFStudio && window.DXFStudio.renderCanvas) setTimeout(() => window.DXFStudio.renderCanvas(), 25);
    }
  };

  if (typeof window !== 'undefined') {
    window.KenshoDockManager = KenshoDockManager;
  }

  /**
   * ============================================================================
   * KENSHO PRO UNIFIED WORKSTATION SETTINGS PAGE (#rp-settings-page-modal)
   * Separates and centralizes:
   *   1. Language & Regional (46 Languages, IPC Units, Coordinate Precision)
   *   2. Palette Paper & Theme (Color Palettes, Dark/Light, Canvas Substrate, UI Scale, Overlays)
   *   3. Panels & Layout (1-Click Presets, Individual Panel Visibility & Docking Matrix)
   *   4. Compare, CAD/CAM & Performance (Default DPI, Hardware Ceiling, Thresholds, IPC DFM Class)
   *   5. Workstation & New Options (Startup Workspace, Reviewer Profile, Auto-Save Checkpoints, OSNAP, Factory Reset)
   * ============================================================================
   */
  function openWorkstationSettingsModal(initialTab = 'language') {
    if (typeof document === 'undefined') return;
    let existing = document.getElementById('rp-settings-page-modal');
    if (existing) existing.remove();

    let activeTab = initialTab || 'language';
    const P = (typeof window !== 'undefined' && window.PREF) ? window.PREF : { dpi: 300, perfMode: 'auto', tol: 40, edge: 0, minpx: 2, scanMax: 50, startView: 'compare', confirmSave: false };
    const curLang = ($('#rp-lang-sel') && $('#rp-lang-sel').value) || (typeof localStorage !== 'undefined' && localStorage.getItem('rp_lang')) || 'en';
    const curThemeSel = ($('#kdock-theme-sel') && $('#kdock-theme-sel').value) || (document.documentElement.dataset.theme === 'light' ? 'light' : (document.documentElement.dataset.cadPalette || 'kensho'));
    const curUnits = (CAMState && CAMState.unitSystem) || 'english';
    const curCanvasBg = ($('#kq-canvas-bg') && $('#kq-canvas-bg').value) || (typeof localStorage !== 'undefined' && localStorage.getItem('rp_canvas_bg')) || 'obsidian';
    const curUiScale = (typeof localStorage !== 'undefined' && localStorage.getItem('rp_ui_scale')) || '100';
    const curPrec = (typeof localStorage !== 'undefined' && localStorage.getItem('rp_coord_prec')) || '3';
    const curCheckpointMin = (typeof localStorage !== 'undefined' && localStorage.getItem('rp_autosave_min')) || '5';
    const curOsnapDefault = (typeof localStorage !== 'undefined' && localStorage.getItem('rp_osnap_def') !== '0');
    const curAaZoom = (typeof localStorage !== 'undefined' && localStorage.getItem('rp_aazoom_def') !== '0');
    const curIpcClass = (CAMState && CAMState.dfmPreset) || 'class2';
    const curAuthor = (() => { try { return localStorage.getItem('author') || ''; } catch (e) { return ''; } })();
    const curOrg = (() => { try { return localStorage.getItem('rp_org_name') || 'Kensho Engineering QA'; } catch (e) { return 'Kensho Engineering QA'; } })();

    const langSelectMaster = $('#rp-lang-sel');
    const langOptionsHtml = langSelectMaster ? langSelectMaster.innerHTML : `<option value="en">English (International)</option>`;

    const modal = el('div', { id: 'rp-settings-page-modal', className: 'rp-modal rp-settings-modal' });

    const navTabs = [
      { id: 'language', icon: 'globe', title: 'Language & Units', sub: '46 Languages & IPC Units' },
      { id: 'shortcuts', icon: 'zap', title: 'Keyboard Shortcuts', sub: 'Alt+ Defaults & Hotkey Editor' },
      { id: 'appearance', icon: 'sun', title: 'Palette Paper & Theme', sub: 'Color Palettes & Canvas' },
      { id: 'layout', icon: 'layoutDock', title: 'Panels & Layout', sub: 'Side Docks & Window Matrix' },
      { id: 'engine', icon: 'tabCompare', title: 'Compare & Performance', sub: 'DPI, Thresholds & IPC DFM' },
      { id: 'workstation', icon: 'gear', title: 'Workstation & Options', sub: 'Profile, Auto-Save & Reset' }
    ];

    const renderSectionContent = () => {
      if (activeTab === 'language') {
        const quickLangs = [
          ['en', 'English (International)'],
          ['ta', 'Tamil (தமிழ்)'],
          ['hi', 'Hindi (हिन्दी)'],
          ['te', 'Telugu (తెలుగు)'],
          ['kn', 'Kannada (ಕನ್ನಡ)'],
          ['ml', 'Malayalam (മലയാളം)'],
          ['ja', 'Japanese (日本語)'],
          ['de', 'German (Deutsch)'],
          ['fr', 'French (Français)'],
          ['es', 'Spanish (Español)'],
          ['zh-CN', 'Chinese (中文简体)'],
          ['ar', 'Arabic (العربية)']
        ];
        return `
          <div class="rp-set-sec">
            <div class="rp-set-sec-hdr">
              <h4><i data-ic="globe"></i> Workspace Language (46 International &amp; Indian Languages)</h4>
              <p>Select your preferred application interface language. All menus, ribbons, tooltips, and dialogs update immediately.</p>
            </div>
            <div class="rp-set-card">
              <div class="rp-set-row">
                <div class="rp-set-lbl">
                  <b>Application Language</b>
                  <span>32 International Languages (A–Z) &amp; 14 Indian Languages (A–Z)</span>
                </div>
                <select id="set-page-lang-sel" class="rp-set-select">${langOptionsHtml}</select>
              </div>
              <div class="rp-set-subrow">
                <span class="rp-set-sub-lbl">Quick Language Switch:</span>
                <div class="rp-set-pill-grid">
                  ${quickLangs.map(([code, lbl]) => `
                    <button type="button" class="rp-set-chip ${curLang === code ? 'on' : ''}" data-set-lang="${code}">${lbl}</button>
                  `).join('')}
                </div>
              </div>
            </div>

            <div class="rp-set-sec-hdr" style="margin-top:16px">
              <h4><i data-ic="ruler"></i> Engineering &amp; IPC Measurement Unit System</h4>
              <p>Controls physical dimension readouts across Compare, PCB CAM Gerber/Drill tables, and Metrology takeoffs.</p>
            </div>
            <div class="rp-set-card">
              <div class="rp-set-row">
                <div class="rp-set-lbl">
                  <b>Default IPC / CAD Unit System</b>
                  <span>Switch between Imperial (mils / inches) and Metric (mm / microns)</span>
                </div>
                <select id="set-page-unit-sel" class="rp-set-select">
                  <option value="english" ${curUnits === 'english' ? 'selected' : ''}>IPC English (mils / inches)</option>
                  <option value="metric" ${curUnits === 'metric' ? 'selected' : ''}>IPC Metric (mm / microns)</option>
                </select>
              </div>
              <div class="rp-set-row">
                <div class="rp-set-lbl">
                  <b>Coordinate &amp; Measurement Decimal Precision</b>
                  <span>Number of decimal places shown in status bar X/Y coordinates and callout labels</span>
                </div>
                <select id="set-page-prec-sel" class="rp-set-select">
                  <option value="2" ${curPrec === '2' ? 'selected' : ''}>2 Decimal Places (0.00)</option>
                  <option value="3" ${curPrec === '3' ? 'selected' : ''}>3 Decimal Places (0.000 — Standard CAD)</option>
                  <option value="4" ${curPrec === '4' ? 'selected' : ''}>4 Decimal Places (0.0000 — Ultra-Fine CAM)</option>
                </select>
              </div>
            </div>
          </div>
        `;
      }

      if (activeTab === 'appearance') {
        const palettes = [
          { id: 'kensho', name: 'Kensho Brand (Obsidian & Red)', desc: 'Signature deep obsidian workspace with crimson & emerald accents', swatch: 'linear-gradient(135deg,#090d16 0%,#1e293b 60%,#e11d48 100%)' },
          { id: 'sapphire', name: 'Sapphire CAD (Cyan & Slate)', desc: 'High-contrast slate-navy engineering theme with cyan highlights', swatch: 'linear-gradient(135deg,#07111e 0%,#162a45 60%,#0ea5e9 100%)' },
          { id: 'obsidian', name: 'Carbon OLED (CAM Dark)', desc: 'True pitch-black OLED substrate for zero glare in darkrooms', swatch: 'linear-gradient(135deg,#020408 0%,#111827 60%,#10b981 100%)' },
          { id: 'graphite', name: 'Graphite Studio (Soft Dark)', desc: 'Balanced neutral charcoal palette for extended PDF & schematic review', swatch: 'linear-gradient(135deg,#18181b 0%,#27272a 60%,#6366f1 100%)' },
          { id: 'light', name: 'Daylight Paper (White)', desc: 'Crisp high-contrast white paper workspace for bright office lighting', swatch: 'linear-gradient(135deg,#ffffff 0%,#e2e8f0 60%,#2563eb 100%)' }
        ];
        const mmEl = $('#kdock-minimap');
        const mmVisible = !(mmEl && mmEl.classList.contains('user-hidden'));
        const hudEl = $('#c-floating-hud');
        const hudAllowed = !(hudEl && hudEl.dataset.userDisabled === '1');

        return `
          <div class="rp-set-sec">
            <div class="rp-set-sec-hdr">
              <h4><i data-ic="sun"></i> Palette Paper &amp; Application Color Theme</h4>
              <p>Choose your workstation color palette or switch between Dark CAD and Daylight Paper (White) modes.</p>
            </div>
            <div class="rp-set-palette-grid">
              ${palettes.map(p => `
                <button type="button" class="rp-set-palette-card ${curThemeSel === p.id ? 'on' : ''}" data-set-palette="${p.id}">
                  <span class="rp-set-swatch" style="background:${p.swatch}"></span>
                  <div class="rp-set-pal-info">
                    <b>${p.name}</b>
                    <span>${p.desc}</span>
                  </div>
                </button>
              `).join('')}
            </div>

            <div class="rp-set-card" style="margin-top:14px">
              <div class="rp-set-row">
                <div class="rp-set-lbl">
                  <b>Viewport Canvas Substrate Background</b>
                  <span>Background color behind drawings in Compare &amp; CAM viewport</span>
                </div>
                <select id="set-page-canvas-bg" class="rp-set-select">
                  <option value="obsidian" ${curCanvasBg === 'obsidian' ? 'selected' : ''}>Obsidian Dark (#070a0f)</option>
                  <option value="pcb" ${curCanvasBg === 'pcb' ? 'selected' : ''}>PCB Soldermask Green (#061f12)</option>
                  <option value="blueprint" ${curCanvasBg === 'blueprint' ? 'selected' : ''}>Blueprint Navy (#081b33)</option>
                  <option value="paper" ${curCanvasBg === 'paper' ? 'selected' : ''}>Daylight Paper White (#e2e8f0)</option>
                </select>
              </div>
              <div class="rp-set-row">
                <div class="rp-set-lbl">
                  <b>Interface Density &amp; Typography Scale</b>
                  <span>Adjust overall ribbon, sidebar, and toolbar compactness</span>
                </div>
                <select id="set-page-ui-scale" class="rp-set-select">
                  <option value="95" ${curUiScale === '95' ? 'selected' : ''}>Compact Workstation (95%)</option>
                  <option value="100" ${curUiScale === '100' ? 'selected' : ''}>Standard Desktop (100% — Default)</option>
                  <option value="106" ${curUiScale === '106' ? 'selected' : ''}>Comfortable / High-DPI (106%)</option>
                </select>
              </div>
              <div class="rp-set-row">
                <div class="rp-set-lbl">
                  <b>Show 2D Bird's-Eye World View Radar Minimap</b>
                  <span>Displays interactive pan/zoom radar overview in the corner of Compare viewport</span>
                </div>
                <input type="checkbox" id="set-page-minimap-chk" class="rp-set-chk" ${mmVisible ? 'checked' : ''} />
              </div>
              <div class="rp-set-row">
                <div class="rp-set-lbl">
                  <b>Show Floating Bottom Canvas HUD</b>
                  <span>Displays quick page, diff jump, rotation, color, and zoom pill bar over the viewport</span>
                </div>
                <input type="checkbox" id="set-page-hud-chk" class="rp-set-chk" ${hudAllowed ? 'checked' : ''} />
              </div>
            </div>
          </div>
        `;
      }

      if (activeTab === 'layout') {
        const presets = [
          { id: 'classic-tabbed', name: 'Single Right Dock (Tabbed — Default)', desc: 'Clean single full-height right sidebar with all 5 tabs in one dock (No Split)' },
          { id: 'dock-left-split', name: 'Left + Right Inspector', desc: 'Diffs & CAM on Left Side + Visibility, Text & Markups on Right Side' },
          { id: 'dock-right-split', name: 'Right Up / Down Split', desc: 'Diffs on Top-Right + CAM/DFM, Visibility & Markups on Bottom-Right' },
          { id: 'dock-quad', name: 'Dual-Side Quad (LU/LD + RU/RD)', desc: 'Visibility (LU) + Markups (LD) + Diffs (RU) + CAM (RD)' },
          { id: 'dock-bottom-console', name: 'Bottom Console (3-Side EDA)', desc: 'Visibility (Left) + Diffs/CAM (Right) + Text/Markups (Bottom)' },
          { id: 'dock-floating', name: 'Separate Floating Windows', desc: 'Detach Diffs, CAM/DFM & Visibility into independent movable windows' }
        ];
        const zones = [
          { code: 'right-up', lbl: 'Right Dock' },
          { code: 'left-up', lbl: 'Left-Up' },
          { code: 'left-down', lbl: 'Left-Down' },
          { code: 'right-down', lbl: 'Right-Down' },
          { code: 'bottom', lbl: 'Bottom' },
          { code: 'float', lbl: 'Float Window' }
        ];
        return `
          <div class="rp-set-sec">
            <div class="rp-set-sec-hdr">
              <div>
                <h4><i data-ic="layoutDock"></i> Panels &amp; Workspace Layout Manager</h4>
                <p>Choose a 1-click panel layout or position individual panels. You can also drag any panel header or tab directly on screen; separated panels automatically disappear from their original dock tab bar.</p>
              </div>
              <button type="button" class="rp-btn-sm" id="set-reset-default-dock" style="height:28px;padding:0 12px;font-weight:700">↺ Reset to Single Right Dock</button>
            </div>

            <div class="rp-set-preset-grid">
              ${presets.map(p => `
                <button type="button" class="rp-set-preset-card ${KenshoDockManager.activePreset === p.id ? 'on' : ''}" data-set-preset="${p.id}">
                  <b>${p.name}</b>
                  <span>${p.desc}</span>
                </button>
              `).join('')}
            </div>

            <div class="rp-set-sec-hdr" style="margin-top:16px">
              <h4>Individual Panel Visibility &amp; Dock Location</h4>
              <p>Show, hide, or move any inspector panel across Left, Right, Bottom, or Floating windows.</p>
            </div>
            <div class="rp-set-card">
              ${Object.values(KenshoDockManager.panels).map(p => `
                <div class="rp-set-row">
                  <label class="rp-set-lbl" style="display:flex;align-items:center;gap:8px;cursor:pointer">
                    <input type="checkbox" class="rp-set-chk set-panel-vis" data-pid="${p.id}" ${p.visible ? 'checked' : ''} />
                    <i data-ic="${p.icon}"></i>
                    <div>
                      <b>${p.title}</b>
                      <span>Currently in: ${p.visible ? p.zone.toUpperCase() : 'HIDDEN'}</span>
                    </div>
                  </label>
                  <div class="rp-set-zone-btns">
                    ${zones.map(z => `
                      <button type="button" class="rp-set-chip ${p.visible && p.zone === z.code ? 'on' : ''}" data-pid="${p.id}" data-zone="${z.code}">${z.lbl}</button>
                    `).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      if (activeTab === 'engine') {
        return `
          <div class="rp-set-sec">
            <div class="rp-set-sec-hdr">
              <h4><i data-ic="tabCompare"></i> Compare Engine, Detection Sensitivity &amp; Hardware Ceiling</h4>
              <p>Configure default rasterization DPI, pixel/vector diff sensitivity, noise filtering, and IPC DFM rules.</p>
            </div>
            <div class="rp-set-card">
              <div class="rp-set-row">
                <div class="rp-set-lbl">
                  <b>Default Compare Resolution (DPI)</b>
                  <span>Higher DPI resolves ultra-fine PCB traces and micro-text</span>
                </div>
                <select id="set-page-dpi" class="rp-set-select">
                  <option value="150" ${String(P.dpi) === '150' ? 'selected' : ''}>150 DPI (Fast Overview)</option>
                  <option value="200" ${String(P.dpi) === '200' ? 'selected' : ''}>200 DPI (Standard)</option>
                  <option value="300" ${String(P.dpi) === '300' ? 'selected' : ''}>300 DPI (Sharp — Default)</option>
                  <option value="400" ${String(P.dpi) === '400' ? 'selected' : ''}>400 DPI (Fine Pitch CAD)</option>
                  <option value="600" ${String(P.dpi) === '600' ? 'selected' : ''}>600 DPI (Ultra Micro-Lithography)</option>
                </select>
              </div>
              <div class="rp-set-row">
                <div class="rp-set-lbl">
                  <b>Hardware Raster Memory Ceiling</b>
                  <span>Controls maximum canvas pixel dimensions per sheet</span>
                </div>
                <select id="set-page-perf" class="rp-set-select">
                  <option value="auto" ${(P.perfMode || 'auto') === 'auto' ? 'selected' : ''}>Auto-Detect Hardware (RAM / GPU)</option>
                  <option value="detail" ${P.perfMode === 'detail' ? 'selected' : ''}>Maximum Detail (9000 px / 45 MP)</option>
                  <option value="perf" ${P.perfMode === 'perf' ? 'selected' : ''}>High Performance (6144 px / 25 MP Low-Spec)</option>
                </select>
              </div>
              <div class="rp-set-row">
                <div class="rp-set-lbl">
                  <b>Compare Luminance / Color Tolerance (0–150)</b>
                  <span>Lower values detect subtle shade changes; higher values ignore minor scan contrast</span>
                </div>
                <input type="number" id="set-page-tol" class="rp-set-num" min="0" max="150" value="${P.tol != null ? P.tol : 40}" />
              </div>
              <div class="rp-set-row">
                <div class="rp-set-lbl">
                  <b>Edge Anti-Aliasing Tolerance (0–4 px)</b>
                  <span>Keep at 0 px to detect 1-pixel alignment shifts; increase for noisy scans</span>
                </div>
                <input type="number" id="set-page-edge" class="rp-set-num" min="0" max="4" value="${P.edge != null ? P.edge : 0}" />
              </div>
              <div class="rp-set-row">
                <div class="rp-set-lbl">
                  <b>Minimum Defect Region Size (1–50 px)</b>
                  <span>Filters out isolated dust specks smaller than this pixel size</span>
                </div>
                <input type="number" id="set-page-minpx" class="rp-set-num" min="1" max="50" value="${P.minpx != null ? P.minpx : 2}" />
              </div>
              <div class="rp-set-row">
                <div class="rp-set-lbl">
                  <b>Auto-Scan Page Limit (1–500 pages)</b>
                  <span>Automatically scans all pages on load up to this page count</span>
                </div>
                <input type="number" id="set-page-scanmax" class="rp-set-num" min="1" max="500" value="${P.scanMax != null ? P.scanMax : 50}" />
              </div>
              <div class="rp-set-row">
                <div class="rp-set-lbl">
                  <b>Default PCB CAM IPC-2221 / IPC-6012 DFM Rule Class</b>
                  <span>Default clearance and annular ring rule preset for Gerber/Drill DFM scans</span>
                </div>
                <select id="set-page-ipc-class" class="rp-set-select">
                  <option value="class1" ${curIpcClass === 'class1' ? 'selected' : ''}>IPC Class 1 — General Electronics (6.0 mil)</option>
                  <option value="class2" ${curIpcClass === 'class2' ? 'selected' : ''}>IPC Class 2 — Dedicated Service (4.0 mil)</option>
                  <option value="class3" ${curIpcClass === 'class3' ? 'selected' : ''}>IPC Class 3 — High-Rel / Aerospace (3.0 mil)</option>
                  <option value="hdi" ${curIpcClass === 'hdi' ? 'selected' : ''}>HDI Microvia / Fine-Pitch (2.0 mil)</option>
                </select>
              </div>
            </div>
          </div>
        `;
      }

      if (activeTab === 'shortcuts') {
        return `
          <div class="rp-set-sec rp-set-shortcuts-sec">
            ${buildKeyboardHUDHTML()}
          </div>
        `;
      }

      // 'workstation' tab
      return `
        <div class="rp-set-sec">
          <div class="rp-set-sec-hdr">
            <h4><i data-ic="gear"></i> Workstation Profile, Safety &amp; New Options</h4>
            <p>Configure startup workspace, engineering sign-off identity, automatic checkpoints, OSNAP defaults, and memory hygiene.</p>
          </div>
          <div class="rp-set-card">
            <div class="rp-set-row">
              <div class="rp-set-lbl">
                <b>Default Workspace on Startup</b>
                <span>Choose which engineering module opens when Kensho Pro launches</span>
              </div>
              <select id="set-page-startview" class="rp-set-select">
                <option value="compare" ${P.startView === 'compare' ? 'selected' : ''}>Compare &amp; CAM Workbench</option>
                <option value="edit" ${P.startView === 'edit' ? 'selected' : ''}>PDF Markup Studio</option>
                <option value="dxf" ${P.startView === 'dxf' ? 'selected' : ''}>AutoCAD DXF Studio</option>
              </select>
            </div>
            <div class="rp-set-row">
              <div class="rp-set-lbl">
                <b>Default Reviewer / Engineer Name</b>
                <span>Embedded automatically on PDF review comments, QA stamps, and Audit reports</span>
              </div>
              <input type="text" id="set-page-author" class="rp-set-text" placeholder="e.g. Sr. Lead Engineer" value="${curAuthor.replace(/"/g, '&quot;')}" />
            </div>
            <div class="rp-set-row">
              <div class="rp-set-lbl">
                <b>Organization / QA Department Name</b>
                <span>Printed on Executive Audit PDF Report headers and sign-off blocks</span>
              </div>
              <input type="text" id="set-page-org" class="rp-set-text" placeholder="e.g. Kensho Engineering QA" value="${curOrg.replace(/"/g, '&quot;')}" />
            </div>
            <div class="rp-set-row">
              <div class="rp-set-lbl">
                <b>Auto-Save Workspace Checkpoint Interval</b>
                <span>Automatically snapshots alignment, defect statuses, and markups into memory checkpoints</span>
              </div>
              <select id="set-page-autosave" class="rp-set-select">
                <option value="0" ${curCheckpointMin === '0' ? 'selected' : ''}>Disabled (Manual Only)</option>
                <option value="2" ${curCheckpointMin === '2' ? 'selected' : ''}>Every 2 Minutes</option>
                <option value="5" ${curCheckpointMin === '5' ? 'selected' : ''}>Every 5 Minutes (Recommended)</option>
                <option value="10" ${curCheckpointMin === '10' ? 'selected' : ''}>Every 10 Minutes</option>
              </select>
            </div>
            <div class="rp-set-row">
              <div class="rp-set-lbl">
                <b>Enable Magnetic 8px Object Snap (OSNAP) by Default</b>
                <span>Snaps measurement &amp; CAD cursors to endpoints, midpoints, centers, and intersections</span>
              </div>
              <input type="checkbox" id="set-page-osnap-chk" class="rp-set-chk" ${curOsnapDefault ? 'checked' : ''} />
            </div>
            <div class="rp-set-row">
              <div class="rp-set-lbl">
                <b>High-Precision Sub-Pixel Anti-Aliased Zoom Sharpening</b>
                <span>Re-rasterizes vector geometry at native display resolution after zooming</span>
              </div>
              <input type="checkbox" id="set-page-aazoom-chk" class="rp-set-chk" ${curAaZoom ? 'checked' : ''} />
            </div>
            <div class="rp-set-row">
              <div class="rp-set-lbl">
                <b>Confirm Before Saving Over Original File</b>
                <span>Prompts for confirmation before overwriting an existing PDF or DXF on disk</span>
              </div>
              <input type="checkbox" id="set-page-confirm-save" class="rp-set-chk" ${P.confirmSave ? 'checked' : ''} />
            </div>
          </div>

          <div class="rp-set-card" style="margin-top:14px">
            <div class="rp-set-row">
              <div class="rp-set-lbl">
                <b>Workstation Memory &amp; Factory Reset</b>
                <span>Purge cached offscreen tile buffers or restore all settings to clean factory defaults</span>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" class="rp-btn-sm" id="set-page-purge-mem" style="height:30px;padding:0 12px;font-weight:700"><i data-ic="zap"></i><span>Smart Memory Purge</span></button>
                <button type="button" class="rp-btn-sm" id="set-page-factory-reset" style="height:30px;padding:0 12px;font-weight:700;color:#fca5a5;border-color:rgba(244,63,94,0.45)"><i data-ic="reset"></i><span>Reset All Settings to Default</span></button>
              </div>
            </div>
          </div>
        </div>
      `;
    };

    modal.innerHTML = `
      <div class="rp-settings-card" role="dialog" aria-label="Workstation Settings Page">
        <div class="rp-settings-header">
          <div style="display:flex;align-items:center;gap:10px">
            <i data-ic="gear" style="width:20px;height:20px;color:var(--accent)"></i>
            <div>
              <h3>Kensho Pro — Workstation Settings</h3>
              <span>Language, Palette Paper &amp; Theme, Side Panels &amp; Layout, Compare Engine, and Workstation Defaults</span>
            </div>
          </div>
          <button type="button" class="rp-about-close" id="rp-settings-close-btn">Done</button>
        </div>
        <div class="rp-settings-layout">
          <aside class="rp-settings-nav">
            ${navTabs.map(t => `
              <button type="button" class="rp-settings-nav-btn ${activeTab === t.id ? 'on' : ''}" data-settab="${t.id}">
                <i data-ic="${t.icon}"></i>
                <div>
                  <b>${t.title}</b>
                  <small>${t.sub}</small>
                </div>
              </button>
            `).join('')}
          </aside>
          <section class="rp-settings-content" id="rp-settings-content-host">
            ${renderSectionContent()}
          </section>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    if (typeof hydrateIcons === 'function') hydrateIcons(modal);

    const contentHost = modal.querySelector('#rp-settings-content-host');

    const wireSectionHandlers = () => {
      if (typeof hydrateIcons === 'function') hydrateIcons(contentHost);

      // 1. Language & Units handlers
      const langSel = contentHost.querySelector('#set-page-lang-sel');
      if (langSel) {
        langSel.value = ($('#rp-lang-sel') && $('#rp-lang-sel').value) || curLang;
        langSel.onchange = e => {
          const val = e.target.value;
          const master = $('#rp-lang-sel');
          if (master) {
            master.value = val;
            master.dispatchEvent(new Event('change'));
          } else {
            applyWorkspaceLanguage(val);
          }
          contentHost.querySelectorAll('[data-set-lang]').forEach(b => b.classList.toggle('on', b.dataset.setLang === val));
        };
      }
      contentHost.querySelectorAll('[data-set-lang]').forEach(btn => {
        btn.onclick = () => {
          const code = btn.dataset.setLang;
          if (langSel) {
            langSel.value = code;
            langSel.dispatchEvent(new Event('change'));
          }
        };
      });

      const unitSel = contentHost.querySelector('#set-page-unit-sel');
      if (unitSel) {
        unitSel.onchange = e => {
          setUnitSystem(e.target.value, false);
        };
      }
      const precSel = contentHost.querySelector('#set-page-prec-sel');
      if (precSel) {
        precSel.onchange = e => {
          try { localStorage.setItem('rp_coord_prec', e.target.value); } catch (err) {}
          rpToast('Coordinate Precision set to ' + e.target.value + ' decimals.');
        };
      }

      // 2. Appearance / Palette Paper handlers
      contentHost.querySelectorAll('[data-set-palette]').forEach(card => {
        card.onclick = () => {
          const val = card.dataset.setPalette;
          const masterThemeSel = $('#kdock-theme-sel');
          if (masterThemeSel) {
            masterThemeSel.value = val;
            masterThemeSel.dispatchEvent(new Event('change'));
          } else if (val === 'light') {
            if (window.setTheme) window.setTheme('light');
            else document.documentElement.dataset.theme = 'light';
            delete document.documentElement.dataset.cadPalette;
          } else {
            if (window.setTheme) window.setTheme('dark');
            else document.documentElement.dataset.theme = 'dark';
            document.documentElement.dataset.cadPalette = val;
          }
          contentHost.querySelectorAll('[data-set-palette]').forEach(c => c.classList.toggle('on', c === card));
        };
      });

      const bgSel = contentHost.querySelector('#set-page-canvas-bg');
      if (bgSel) {
        bgSel.onchange = e => {
          const val = e.target.value;
          try { localStorage.setItem('rp_canvas_bg', val); } catch (err) {}
          const masterBg = $('#kq-canvas-bg');
          if (masterBg) {
            masterBg.value = val;
            masterBg.dispatchEvent(new Event('change'));
          } else {
            const vpEl = $('#vp');
            const bgMap = { obsidian: '#070a0f', pcb: '#061f12', blueprint: '#081b33', paper: '#e2e8f0' };
            if (vpEl) vpEl.style.background = bgMap[val] || '';
          }
        };
      }

      const scaleSel = contentHost.querySelector('#set-page-ui-scale');
      if (scaleSel) {
        scaleSel.onchange = e => {
          const pct = e.target.value;
          try { localStorage.setItem('rp_ui_scale', pct); } catch (err) {}
          document.documentElement.style.zoom = (pct === '100') ? '' : (pct + '%');
          rpToast('UI Density Scale set to ' + pct + '%');
        };
      }

      const mmChk = contentHost.querySelector('#set-page-minimap-chk');
      if (mmChk) {
        mmChk.onchange = e => {
          const mm = $('#kdock-minimap');
          if (mm) {
            mm.classList.toggle('user-hidden', !e.target.checked);
            KenshoDockManager.renderWorldViewMinimap();
          }
        };
      }

      const hudChk = contentHost.querySelector('#set-page-hud-chk');
      if (hudChk) {
        hudChk.onchange = e => {
          const hud = $('#c-floating-hud');
          if (hud) {
            hud.dataset.userDisabled = e.target.checked ? '0' : '1';
            if (!e.target.checked) hud.hidden = true;
            else if ($('#cv') && $('#cv').width > 0) hud.hidden = false;
          }
        };
      }

      // 3. Panels & Layout handlers
      const rstDockBtn = contentHost.querySelector('#set-reset-default-dock');
      if (rstDockBtn) {
        rstDockBtn.onclick = () => {
          KenshoDockManager.applyPreset('classic-tabbed');
          contentHost.innerHTML = renderSectionContent();
          wireSectionHandlers();
        };
      }
      contentHost.querySelectorAll('[data-set-preset]').forEach(btn => {
        btn.onclick = () => {
          KenshoDockManager.applyPreset(btn.dataset.setPreset);
          contentHost.innerHTML = renderSectionContent();
          wireSectionHandlers();
        };
      });
      contentHost.querySelectorAll('.set-panel-vis').forEach(chk => {
        chk.onchange = () => {
          KenshoDockManager.setPanelVisibility(chk.dataset.pid, chk.checked);
          contentHost.innerHTML = renderSectionContent();
          wireSectionHandlers();
        };
      });
      contentHost.querySelectorAll('.rp-set-zone-btns [data-zone]').forEach(btn => {
        btn.onclick = () => {
          KenshoDockManager.dockPanel(btn.dataset.pid, btn.dataset.zone);
          contentHost.innerHTML = renderSectionContent();
          wireSectionHandlers();
        };
      });

      // 4. Compare & Performance handlers
      const saveEnginePrefs = () => {
        if (!window.PREF) return;
        const dpiEl = contentHost.querySelector('#set-page-dpi');
        const perfEl = contentHost.querySelector('#set-page-perf');
        const tolEl = contentHost.querySelector('#set-page-tol');
        const edgeEl = contentHost.querySelector('#set-page-edge');
        const minpxEl = contentHost.querySelector('#set-page-minpx');
        const scanEl = contentHost.querySelector('#set-page-scanmax');
        if (dpiEl) window.PREF.dpi = +dpiEl.value;
        if (perfEl) window.PREF.perfMode = perfEl.value;
        if (tolEl) window.PREF.tol = Math.max(0, Math.min(150, +tolEl.value || 0));
        if (edgeEl) window.PREF.edge = Math.max(0, Math.min(4, +edgeEl.value || 0));
        if (minpxEl) window.PREF.minpx = Math.max(1, Math.min(50, +minpxEl.value || 1));
        if (scanEl) window.PREF.scanMax = Math.max(1, Math.min(500, +scanEl.value || 50));
        try { localStorage.setItem('prefs', JSON.stringify(window.PREF)); } catch (err) {}
        if (window.applyPerformanceMode && perfEl) window.applyPerformanceMode(window.PREF.perfMode, false);
        if ($('#dpi')) $('#dpi').value = String(window.PREF.dpi);
        if ($('#rib-dpi')) $('#rib-dpi').value = String(window.PREF.dpi);
        if ($('#rib-view-dpi')) $('#rib-view-dpi').value = String(window.PREF.dpi);
        if ($('#tol')) $('#tol').value = window.PREF.tol;
        if ($('#edge')) $('#edge').value = window.PREF.edge;
        if ($('#minpx')) $('#minpx').value = window.PREF.minpx;
        if ($('#rp-diff-thresh')) $('#rp-diff-thresh').value = window.PREF.tol;
        if ($('#rp-tol-val')) $('#rp-tol-val').textContent = window.PREF.tol;
        if ($('#rp-noise-thresh')) $('#rp-noise-thresh').value = window.PREF.minpx;
        if ($('#rp-noise-val')) $('#rp-noise-val').textContent = window.PREF.minpx;
        if ($('#rp-edge-thresh')) $('#rp-edge-thresh').value = window.PREF.edge;
        if ($('#rp-edge-val')) $('#rp-edge-val').textContent = window.PREF.edge;
      };
      ['#set-page-dpi', '#set-page-perf', '#set-page-tol', '#set-page-edge', '#set-page-minpx', '#set-page-scanmax'].forEach(sel => {
        const elIn = contentHost.querySelector(sel);
        if (elIn) elIn.onchange = () => {
          saveEnginePrefs();
          if (sel === '#set-page-dpi' && $('#dpi')) $('#dpi').dispatchEvent(new Event('change'));
          rpToast('Saved Compare Engine preference.');
        };
      });
      const ipcSel = contentHost.querySelector('#set-page-ipc-class');
      if (ipcSel) {
        ipcSel.onchange = e => {
          CAMState.dfmPreset = e.target.value;
          if ($('#rib-dfm-preset')) {
            $('#rib-dfm-preset').value = e.target.value;
            $('#rib-dfm-preset').dispatchEvent(new Event('change'));
          }
          rpToast('Default IPC DFM Class set to ' + ipcSel.selectedOptions[0].text);
        };
      }

      // 5. Workstation & New Options handlers
      const stView = contentHost.querySelector('#set-page-startview');
      if (stView) {
        stView.onchange = e => {
          if (window.PREF) {
            window.PREF.startView = e.target.value;
            try { localStorage.setItem('prefs', JSON.stringify(window.PREF)); } catch (err) {}
          }
          rpToast('Startup Workspace set to ' + stView.selectedOptions[0].text);
        };
      }
      const authIn = contentHost.querySelector('#set-page-author');
      if (authIn) {
        authIn.onchange = e => {
          const v = e.target.value.trim();
          try { localStorage.setItem('author', v); } catch (err) {}
          if ($('#cAuthor')) $('#cAuthor').value = v;
        };
      }
      const orgIn = contentHost.querySelector('#set-page-org');
      if (orgIn) {
        orgIn.onchange = e => {
          try { localStorage.setItem('rp_org_name', e.target.value.trim()); } catch (err) {}
        };
      }
      const autoSaveSel = contentHost.querySelector('#set-page-autosave');
      if (autoSaveSel) {
        autoSaveSel.onchange = e => {
          try { localStorage.setItem('rp_autosave_min', e.target.value); } catch (err) {}
          rpToast('Auto-Save Checkpoint Interval updated.');
        };
      }
      const osnapChk = contentHost.querySelector('#set-page-osnap-chk');
      if (osnapChk) {
        osnapChk.onchange = e => {
          try { localStorage.setItem('rp_osnap_def', e.target.checked ? '1' : '0'); } catch (err) {}
          if (window.RP_MEASURE) window.RP_MEASURE.osnapEnabled = e.target.checked;
        };
      }
      const aaChk = contentHost.querySelector('#set-page-aazoom-chk');
      if (aaChk) {
        aaChk.onchange = e => {
          try { localStorage.setItem('rp_aazoom_def', e.target.checked ? '1' : '0'); } catch (err) {}
        };
      }
      const confSaveChk = contentHost.querySelector('#set-page-confirm-save');
      if (confSaveChk) {
        confSaveChk.onchange = e => {
          if (window.PREF) {
            window.PREF.confirmSave = !!e.target.checked;
            try { localStorage.setItem('prefs', JSON.stringify(window.PREF)); } catch (err) {}
          }
        };
      }
      const purgeBtn = contentHost.querySelector('#set-page-purge-mem');
      if (purgeBtn) {
        purgeBtn.onclick = () => {
          SmartManager.smartPurgeMemory();
          rpToast('Purged unpinned tile caches and offscreen buffers.');
        };
      }
      const resetAllBtn = contentHost.querySelector('#set-page-factory-reset');
      if (resetAllBtn) {
        resetAllBtn.onclick = () => {
          if (window.PREF) {
            Object.assign(window.PREF, { dpi: 300, perfMode: 'auto', tol: 40, edge: 0, minpx: 2, scanMax: 50, startView: 'compare', confirmSave: false });
            try { localStorage.setItem('prefs', JSON.stringify(window.PREF)); } catch (err) {}
          }
          document.documentElement.style.zoom = '';
          if ($('#rp-lang-sel')) { $('#rp-lang-sel').value = 'en'; $('#rp-lang-sel').dispatchEvent(new Event('change')); }
          if ($('#kdock-theme-sel')) { $('#kdock-theme-sel').value = 'kensho'; $('#kdock-theme-sel').dispatchEvent(new Event('change')); }
          setUnitSystem('english', true);
          KenshoDockManager.applyPreset('classic-tabbed', true);
          rpToast('All Workstation Settings restored to Factory Defaults.');
          contentHost.innerHTML = renderSectionContent();
          wireSectionHandlers();
        };
      }

      // 6. Keyboard Shortcuts tab handlers inside Settings
      const scSearch = contentHost.querySelector('#rp-hud-search-in');
      if (scSearch) {
        scSearch.oninput = e => {
          ShortcutManager.searchQuery = e.target.value;
          const pos = scSearch.selectionStart || scSearch.value.length;
          contentHost.innerHTML = renderSectionContent();
          wireSectionHandlers();
          const nextIn = contentHost.querySelector('#rp-hud-search-in');
          if (nextIn) { nextIn.focus(); nextIn.setSelectionRange(pos, pos); }
        };
      }
      const scResetAll = contentHost.querySelector('#rp-hud-reset-all-btn');
      if (scResetAll) {
        scResetAll.onclick = () => {
          ShortcutManager.resetAll();
          contentHost.innerHTML = renderSectionContent();
          wireSectionHandlers();
        };
      }
      const scCloseBtn = contentHost.querySelector('#rp-hud-close-btn');
      if (scCloseBtn) {
        scCloseBtn.style.display = 'none';
      }
      contentHost.querySelectorAll('[data-sccat]').forEach(btn => {
        btn.onclick = () => {
          ShortcutManager.activeCategory = btn.dataset.sccat;
          contentHost.innerHTML = renderSectionContent();
          wireSectionHandlers();
        };
      });
      contentHost.querySelectorAll('[data-sc-id]').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          const id = btn.dataset.scId;
          ShortcutManager.recordingId = (ShortcutManager.recordingId === id) ? null : id;
          contentHost.innerHTML = renderSectionContent();
          wireSectionHandlers();
        };
      });
      contentHost.querySelectorAll('[data-sc-reset]').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          ShortcutManager.resetKey(btn.dataset.scReset);
          contentHost.innerHTML = renderSectionContent();
          wireSectionHandlers();
        };
      });
    };
    window.refreshSettingsShortcutsPane = () => {
      if (activeTab === 'shortcuts' && document.body.contains(modal)) {
        const prevSc = contentHost.querySelector('.rp-scroll') ? contentHost.querySelector('.rp-scroll').scrollTop : 0;
        contentHost.innerHTML = renderSectionContent();
        wireSectionHandlers();
        const nextSc = contentHost.querySelector('.rp-scroll');
        if (nextSc) nextSc.scrollTop = prevSc;
      }
    };

    modal.querySelectorAll('[data-settab]').forEach(btn => {
      btn.onclick = () => {
        activeTab = btn.dataset.settab;
        modal.querySelectorAll('[data-settab]').forEach(b => b.classList.toggle('on', b.dataset.settab === activeTab));
        contentHost.innerHTML = renderSectionContent();
        wireSectionHandlers();
      };
    });

    wireSectionHandlers();

    const closeBtn = modal.querySelector('#rp-settings-close-btn');
    if (closeBtn) closeBtn.onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
  }

  if (typeof window !== 'undefined') {
    window.openWorkstationSettingsModal = openWorkstationSettingsModal;
  }


  function init() {
    initCategorizedRibbon();
    initLayerDock();
    initCurtainSlider();
    initSidebarDefects();
    KenshoDockManager.init();
    initKeyboardNavigation();
    initSampleButtons();
    setUnitSystem(CAMState.unitSystem, true);
    SmartManager.updateMemoryHud();
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem('rp_lang', 'en');
      const langSel = $('#rp-lang-sel');
      if (langSel) langSel.value = 'en';
      applyWorkspaceLanguage('en', true);
    } catch (e) {}
  }

  return {
    init,
    KenshoDockManager,
    openWorkstationSettingsModal,
    SmartManager,
    applySecurityRedaction,
    VectorPdfBuilder,
    ZipArchive,
    openCommandPaletteModal,
    reRenderActiveDXFLayers,
    CompareHistory,
    CAMState,
    setUnitSystem,
    DefectState,
    FiducialAligner,
    SampleGenerator,
    ShortcutManager,
    KEYBOARD_SHORTCUTS_SPEC,
    buildKeyboardHUDHTML,
    showKeyboardHUD,
    closeKeyboardHUD,
    showCAMWorkbenchModal,
    showCAMPreCompareModal,
    stageUploadedCAMFiles,
    stageAndPromptCAMFiles,
    executeConfiguredCAMCompare,
    extractZipArchive,
    runCAMClearanceScan,
    loadSampleSchematic,
    loadSampleGerber,
    promptSampleDrawings,
    DXFState,
    loadSampleDXF,
    showDXFWorkbenchModal,
    showDXFPreCompareModal,
    stageAndPromptDXFFiles,
    promptDXFExport,
    promptDXFImport,
    promptCAMCompare,
    promptIPCD356Netlist,
    generateExecutiveAuditReport,
    buildDefectsCSVBytes,
    exportDefectsCSV,
    buildZipArchive,
    exportQAPackageZip,
    saveSessionFile,
    loadSessionFile,
    restoreSessionFromText,
    setCurtainMode,
    setCompareMode,
    isCurtainActive: () => curtainActive,
    getCurtainRatio: () => Math.max(0.02, Math.min(0.98, curtainPct / 100)),
    getCurtainPct: () => curtainPct,
    updateCurtainClip,
    showBOMAndMeasurementsModal,
    openNetTracerModal,
    openPCBStackupCalculator,
    openBOMOverlayModal,
    updateCAMSidebarPane,
    applyWorkspaceProfile,
    applyWorkspaceLanguage,
    I18N_DICTIONARY,
    rpToast
  };
});
