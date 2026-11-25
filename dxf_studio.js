/**
 * ============================================================================
 * KENSHO PRO — AUTOCAD-STYLE DXF STUDIO (dxf_studio.js)
 * Native Vector CAD Authoring, Layer Properties Manager (On/Off, Freeze, Lock,
 * Color, Linetype, Lineweight, Rename, Remove/Delete, Isolate, Purge), Full
 * Entity Modify Suite (Move, Copy, Rotate, Scale, Mirror, Offset, Trim, Extend,
 * Tangent-Arc Fillet, Chamfer, Explode, Match Properties, Erase), Real-Time
 * Properties Inspector, Live Ghost Preview, Context Menu, Command Line, SVG/PNG/DXF
 * Export, and Native Vector A/B DXF Comparison (Overlay & Side-by-Side).
 * ============================================================================
 */
(function (root, factory) {
  if (typeof DXFEngine === "undefined" && typeof require === "function") {
    try { global.DXFEngine = require("./dxf_engine.js"); } catch (e) {}
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DXFStudio = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const $ = s => (typeof document !== 'undefined' ? document.querySelector(s) : null);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = msg => {
    if (typeof window !== 'undefined' && window.rpToast) window.rpToast(msg);
  };

  const LINETYPES = ['CONTINUOUS', 'DASHED', 'HIDDEN', 'CENTER', 'PHANTOM', 'DOT'];
  const LINEWEIGHTS = [
    { v: -3, l: 'Default' },
    { v: 9, l: '0.09 mm' },
    { v: 13, l: '0.13 mm' },
    { v: 18, l: '0.18 mm' },
    { v: 25, l: '0.25 mm' },
    { v: 35, l: '0.35 mm' },
    { v: 50, l: '0.50 mm' },
    { v: 70, l: '0.70 mm' },
    { v: 100, l: '1.00 mm' },
    { v: 140, l: '1.40 mm' },
    { v: 158, l: '1.58 mm' },
    { v: 211, l: '2.11 mm' }
  ];

  const BUILTIN_CAD_BLOCKS = {
    FIDUCIAL_TARGET: {
      name: 'FIDUCIAL_TARGET',
      baseX: 0,
      baseY: 0,
      entities: [
        { type: 'CIRCLE', layer: '0', cx: 0, cy: 0, r: 2.5 },
        { type: 'CIRCLE', layer: '0', cx: 0, cy: 0, r: 5.0 },
        { type: 'LINE', layer: '0', x1: -7, y1: 0, x2: 7, y2: 0 },
        { type: 'LINE', layer: '0', x1: 0, y1: -7, x2: 0, y2: 7 }
      ]
    },
    M3_MOUNTING_HOLE: {
      name: 'M3_MOUNTING_HOLE',
      baseX: 0,
      baseY: 0,
      entities: [
        { type: 'CIRCLE', layer: '0', cx: 0, cy: 0, r: 1.6 },
        { type: 'CIRCLE', layer: '0', cx: 0, cy: 0, r: 3.2, linetype: 'DASHED' },
        { type: 'LINE', layer: '0', x1: -4.2, y1: 0, x2: 4.2, y2: 0, linetype: 'CENTER' },
        { type: 'LINE', layer: '0', x1: 0, y1: -4.2, x2: 0, y2: 4.2, linetype: 'CENTER' }
      ]
    },
    GND_EARTH_SYMBOL: {
      name: 'GND_EARTH_SYMBOL',
      baseX: 0,
      baseY: 0,
      entities: [
        { type: 'LINE', layer: '0', x1: 0, y1: 0, x2: 0, y2: -4 },
        { type: 'LINE', layer: '0', x1: -4, y1: -4, x2: 4, y2: -4 },
        { type: 'LINE', layer: '0', x1: -2.6, y1: -5.8, x2: 2.6, y2: -5.8 },
        { type: 'LINE', layer: '0', x1: -1.2, y1: -7.6, x2: 1.2, y2: -7.6 }
      ]
    },
    REV_DELTA_TAG: {
      name: 'REV_DELTA_TAG',
      baseX: 0,
      baseY: 0,
      entities: [
        { type: 'LWPOLYLINE', layer: '0', closed: true, points: [[0, 4.5, 0], [-4, -2.5, 0], [4, -2.5, 0]] },
        { type: 'TEXT', layer: '0', x: -1.2, y: -1.5, height: 2.5, text: 'B' }
      ]
    },
    M4_TAPPED_HOLE: {
      baseX: 0, baseY: 0,
      entities: [
        { type: 'CIRCLE', layer: '0', cx: 0, cy: 0, r: 2.0, thickness: 8 },
        { type: 'ARC', layer: '0', cx: 0, cy: 0, r: 2.45, startAngle: 0, endAngle: 270 },
        { type: 'LINE', layer: '0', x1: -3.2, y1: 0, x2: 3.2, y2: 0 },
        { type: 'LINE', layer: '0', x1: 0, y1: -3.2, x2: 0, y2: 3.2 }
      ]
    },
    GDT_DATUM_A: {
      baseX: 0, baseY: 0,
      entities: [
        { type: 'LWPOLYLINE', layer: '0', closed: true, points: [[-3, 0, 0], [3, 0, 0], [0, 5, 0]] },
        { type: 'LINE', layer: '0', x1: 0, y1: 5, x2: 0, y2: 11 },
        { type: 'LWPOLYLINE', layer: '0', closed: true, points: [[-4, 11, 0], [4, 11, 0], [4, 19, 0], [-4, 19, 0]] },
        { type: 'TEXT', layer: '0', x: -1.8, y: 12.8, height: 4.2, text: 'A' }
      ]
    },
    IC_QFP_FOOTPRINT: {
      baseX: 0, baseY: 0,
      entities: [
        { type: 'LWPOLYLINE', layer: '0', closed: true, thickness: 3.5, points: [[-7, -7, 0], [7, -7, 0], [7, 7, 0], [-7, 7, 0]] },
        { type: 'CIRCLE', layer: '0', cx: -4.8, cy: 4.8, r: 0.8 },
        { type: 'LINE', layer: '0', x1: -9.5, y1: -4, x2: -7, y2: -4 },
        { type: 'LINE', layer: '0', x1: -9.5, y1: 0, x2: -7, y2: 0 },
        { type: 'LINE', layer: '0', x1: -9.5, y1: 4, x2: -7, y2: 4 },
        { type: 'LINE', layer: '0', x1: 7, y1: -4, x2: 9.5, y2: -4 },
        { type: 'LINE', layer: '0', x1: 7, y1: 0, x2: 9.5, y2: 0 },
        { type: 'LINE', layer: '0', x1: 7, y1: 4, x2: 9.5, y2: 4 }
      ]
    }
  };

  const StudioState = {
    initialized: false,
    activeSlot: 'B',          // 'A' | 'B'
    viewMode: 'single',       // 'single' | 'overlay' | 'side'
    showDiffBoxes: false,     // Diff boxes only appear in Compare view; DXF Studio uses vector overlay colors only
    lengthenDelta: 5.0,       // Default delta distance for LENGTHEN tool
    activeTool: 'select',     // 'select' | 'pan' | 'line' | 'polyline' | 'rect' | 'circle' | 'arc' | 'ellipse' | 'spline' | 'text' | 'dim' | 'hatch' | 'point' | 'insert' | 'move' | 'copy' | 'rotate' | 'scale' | 'mirror' | 'offset' | 'trim' | 'extend' | 'fillet' | 'matchprop'
    lastTool: 'line',
    activeRibbonTab: 'home',  // 'home' | 'modify' | 'layers' | 'compare' | 'all'
    currentLayer: '0',
    activeColor: 'BYLAYER',
    activeCustomHex: '#38bdf8',
    activeLinetype: 'BYLAYER',
    activeLineweight: -1,
    orthoEnabled: false,
    polarEnabled: true,
    osnapEnabled: true,
    gridEnabled: true,
    showLineweights: true,
    background: '#0c1017',
    offsetDistance: 5.0,
    filletRadius: 2.0,
    chamferDist1: 5.0,
    chamferDist2: 5.0,
    polygonSides: 6,
    triangleWidth: 60.0,
    triangleHeight: 50.0,
    triangleType: 'isosceles', // 'isosceles' | 'right-left' | 'right-right' | 'equilateral'
    triangleFixedSize: false,
    donutInnerR: 3.0,
    donutOuterR: 8.0,
    box3dHeight: 18.0,
    arrayRows: 3,
    arrayCols: 3,
    arrayRowSpacing: 20.0,
    arrayColSpacing: 20.0,
    arrayPolarItems: 6,
    textHeight: 3.5,
    dimOffset: 8.0,
    viewPreset: 'top',
    yaw: 0,
    pitch: 0,
    roll: 0,
    visualStyle: '2d',
    defaultElevation: 0,
    defaultThickness: 0,
    auto3DExtrude: true,
    auto3DDepth: 12.0,
    dynInputEnabled: true,
    dockLayout: 'lr',
    orbitDrag: null,
    lastMeasureResult: null,
    activeBlockName: 'FIDUCIAL_TARGET',
    layerSearch: '',
    openDocs: [],
    activeDocId: null,
    // Viewport transform: screenX = panX + worldX * zoom, screenY = canvasH - (panY + worldY * zoom)
    zoom: 4.0,
    panX: 120,
    panY: 100,
    // Selection, clipboard & interaction
    selectedIds: new Set(),
    clipboardEntities: [],
    hoveredId: null,
    activeGrip: null,
    dragBox: null,            // { x0, y0, x1, y1, crossing }
    panDrag: null,
    tempPoints: [],           // World coordinates for active drawing/modify command
    uncommittedEntityIds: new Set(), // Entities created since last Done save point
    rewindBuffer: [],         // Canceled/stepped-back entities & points for Rewind recovery
    cursorWorld: { x: 0, y: 0 },
    snapPoint: null,          // { x, y, type }
    matchSourceEnt: null,
    cmdHistory: ['AutoCAD DXF Studio Ready. Select a Draw/Modify tool above or type any command (LINE, PLINE, CIRCLE, MOVE, OFFSET, TRIM, FILLET, EXPLODE, LAYER, COMPARE).'],
    undoStack: [],            // { label, slot, dxfText, comparedLayers, hiddenLayers, frozenLayers, lockedLayers }
    redoStack: []
  };

  function getDXFState() {
    return (typeof window !== 'undefined' && window.DXFState) ? window.DXFState : null;
  }

  function getActiveParser() {
    const ds = getDXFState();
    if (!ds) return null;
    if (StudioState.activeSlot === 'A') {
      if (ds.parsedA) return ds.parsedA;
      if (ds.parsedB) {
        StudioState.activeSlot = 'B';
        if ($('#dxf-st-slot-sel') && StudioState.viewMode === 'single') $('#dxf-st-slot-sel').value = 'B';
        return ds.parsedB;
      }
      return null;
    }
    if (ds.parsedB) return ds.parsedB;
    if (ds.parsedA) {
      StudioState.activeSlot = 'A';
      if ($('#dxf-st-slot-sel') && StudioState.viewMode === 'single') $('#dxf-st-slot-sel').value = 'A';
      return ds.parsedA;
    }
    return null;
  }

  function ensureStandardBlocksOnParser(parser) {
    if (!parser) return;
    parser.blocks = parser.blocks || {};
    for (const [bName, bDef] of Object.entries(BUILTIN_CAD_BLOCKS)) {
      if (!parser.blocks[bName]) {
        const copy = JSON.parse(JSON.stringify(bDef));
        parser.blocks[bName] = copy;
        parser.blocks[bName.toUpperCase()] = copy;
      }
    }
  }

    function updateEmptyOverlay() {
    const emptyEl = $('#dxf-empty');
    if (!emptyEl) return;
    const hasDrawing = !!(getActiveParser());
    emptyEl.hidden = hasDrawing;
  }

  function ensureActiveParser(autoCreateBlank = false) {
    const ds = getDXFState();
    if (!ds || typeof DXFEngine === 'undefined') return null;
    let parser = getActiveParser();
    if (!parser && autoCreateBlank) {
      const unit = (window.CAMState && window.CAMState.unitSystem === 'english') ? 'mils' : 'mm';
      createNewBlankDXF(unit);
      parser = getActiveParser();
    }
    if (parser) {
      ensureStandardBlocksOnParser(parser);
      if (!StudioState.currentLayer || !parser.layers[StudioState.currentLayer]) {
        const lNames = Object.keys(parser.layers || {});
        const withEnts = lNames.find(n => parser.layers[n] && parser.layers[n].count > 0 && parser.layers[n].visible !== false);
        StudioState.currentLayer = lNames.includes('BOARD_OUTLINE') ? 'BOARD_OUTLINE' : (lNames.includes('OUTLINE') ? 'OUTLINE' : (withEnts || lNames[0] || '0'));
      }
    }
    updateEmptyOverlay();
    return parser;
  }

  function createNewBlankDXF(unit = 'mm') {
    if (typeof DXFEngine === 'undefined') return null;
    const w = new DXFEngine.DXFWriter({ unit, scale: 1.0 });
    const f = 1 / (w.scaleFactor || 1);
    w.addLayer('BOARD_OUTLINE', 7, 'CONTINUOUS');
    w.addLayer('MOUNTING_HOLES', 3, 'CONTINUOUS');
    w.addLayer('CONNECTOR_CUTOUTS', 1, 'CONTINUOUS');
    w.addLayer('DIMENSIONS', 6, 'CONTINUOUS');
    w.addLayer('CENTERLINES', 4, 'CENTER');
    w.addLayer('TEXT', 2, 'CONTINUOUS');
    // Add a clean reference origin border frame (200 x 140)
    w.addRect(0, 0, 200 * f, 140 * f, 'BOARD_OUTLINE');
    const dxfStr = w.toDXFString();
    const ds = getDXFState();
    if (ds) {
      const parsed = new DXFEngine.DXFParser(dxfStr).parse();
      ensureStandardBlocksOnParser(parsed);
      if (StudioState.activeSlot === 'A') {
        ds.rawA = dxfStr; ds.nameA = `Blank_Drawing_RevA_${unit}.dxf`; ds.parsedA = parsed;
      } else {
        ds.rawB = dxfStr; ds.nameB = `Blank_Drawing_RevB_${unit}.dxf`; ds.parsedB = parsed;
      }
      ds._isActiveDXFSession = true;
      ds._isSampleDXF = false;
      ds.comparedLayers.clear();
      ds.syncLayerSetsFromParsers();
      StudioState.currentLayer = 'BOARD_OUTLINE';
      StudioState.selectedIds.clear();
      syncParserMutation();
      refreshAllUI();
      zoomExtents();
      logCommand(`Initialized new AutoCAD DXF drawing in ${unit.toUpperCase()} units.`);
      toast(`Created new AutoCAD DXF sheet (${unit.toUpperCase()}).`);
    }
    return dxfStr;
  }

  function safeCloneEntities(ents) {
    return JSON.parse(JSON.stringify(ents || [], (k, v) => (k === '_normEnt' || k === '_diffSubIndices') ? undefined : v));
  }

  function createParserSnapshot(label, parser, ds) {
    const curSlot = (StudioState.activeSlot === 'A' && ds.parsedA === parser) ? 'A' : (ds.parsedB === parser ? 'B' : 'A');
    return {
      label,
      slot: curSlot,
      parserRef: parser,
      entitiesClone: safeCloneEntities(parser.entities),
      layersClone: JSON.parse(JSON.stringify(parser.layers || {})),
      comparedLayers: [...ds.comparedLayers],
      hiddenLayers: [...ds.hiddenLayers],
      frozenLayers: [...ds.frozenLayers],
      lockedLayers: [...ds.lockedLayers]
    };
  }

  function estimateSnapshotBytes(snap) {
    if (!snap) return 0;
    const entCount = Array.isArray(snap.entitiesClone) ? snap.entitiesClone.length : 0;
    const lyrCount = snap.layersClone ? Object.keys(snap.layersClone).length : 0;
    return 512 + entCount * 192 + lyrCount * 96;
  }

  function pushUndoSnapshot(label = 'Edit DXF') {
    const parser = getActiveParser();
    const ds = getDXFState();
    if (!parser || !ds) return;
    const snap = createParserSnapshot(label, parser, ds);
    snap._trackedBytes = estimateSnapshotBytes(snap);
    const budget = (typeof window !== 'undefined' && window.RPMemoryBudget) ? window.RPMemoryBudget : ((typeof WorkerEngine !== 'undefined' && WorkerEngine.globalMemoryBudget) ? WorkerEngine.globalMemoryBudget : null);
    if (budget && snap._trackedBytes > 0) budget.recordAlloc(snap._trackedBytes);
    StudioState.undoStack.push(snap);
    let totalUndoBytes = 0;
    for (let i = 0; i < StudioState.undoStack.length; i++) {
      totalUndoBytes += (StudioState.undoStack[i] && StudioState.undoStack[i]._trackedBytes) || 0;
    }
    const maxUndoBytes = 32 * 1024 * 1024;
    while (StudioState.undoStack.length > 50 || (totalUndoBytes > maxUndoBytes && StudioState.undoStack.length > 2)) {
      const evicted = StudioState.undoStack.shift();
      if (evicted && evicted._trackedBytes) {
        totalUndoBytes = Math.max(0, totalUndoBytes - evicted._trackedBytes);
        if (budget) budget.recordDealloc(evicted._trackedBytes);
      }
    }
    for (const r of StudioState.redoStack) {
      if (r && r._trackedBytes && budget) budget.recordDealloc(r._trackedBytes);
    }
    StudioState.redoStack = [];
    if (typeof window !== 'undefined' && window.SmartManager && typeof window.SmartManager.updateMemoryHud === 'function') {
      window.SmartManager.updateMemoryHud();
    }
    updateUndoRedoButtons();
  }

  function applySnapshot(snap) {
    const ds = getDXFState();
    if (!snap || !ds || typeof DXFEngine === 'undefined') return;
    const targetParser = snap.parserRef || (snap.slot === 'A' ? ds.parsedA : ds.parsedB) || getActiveParser();
    if (targetParser && Array.isArray(snap.entitiesClone)) {
      targetParser.entities = JSON.parse(JSON.stringify(snap.entitiesClone));
      if (snap.layersClone) targetParser.layers = JSON.parse(JSON.stringify(snap.layersClone));
      targetParser.recomputeBoundsAndCounts();
    }
    ds.comparedLayers = new Set(snap.comparedLayers || []);
    ds.hiddenLayers = new Set(snap.hiddenLayers || []);
    ds.frozenLayers = new Set(snap.frozenLayers || []);
    ds.lockedLayers = new Set(snap.lockedLayers || []);
    if (targetParser && targetParser.layers) {
      for (const lName of Object.keys(targetParser.layers)) {
        targetParser.setLayerState(lName, {
          visible: !ds.hiddenLayers.has(lName),
          frozen: ds.frozenLayers.has(lName),
          locked: ds.lockedLayers.has(lName)
        });
      }
    }
    syncParserMutation(false);
    StudioState.selectedIds.clear();
    refreshAllUI();
  }

  function undo() {
    if (!StudioState.undoStack.length) {
      logCommand('Nothing to undo.');
      toast('Nothing to undo in DXF Studio.');
      return false;
    }
    const snap = StudioState.undoStack.pop();
    const ds = getDXFState();
    const targetParser = (snap && snap.parserRef) || (ds && snap && snap.slot === 'A' ? ds.parsedA : (ds && snap && snap.slot === 'B' ? ds.parsedB : null)) || getActiveParser();
    if (targetParser && ds) {
      const redoSnap = createParserSnapshot(snap ? snap.label : 'Redo', targetParser, ds);
      if (snap && snap.slot) redoSnap.slot = snap.slot;
      StudioState.redoStack.push(redoSnap);
    }
    applySnapshot(snap);
    updateUndoRedoButtons();
    logCommand(`Undone: ${snap.label}`);
    toast(`Undone: ${snap.label}`);
    return true;
  }

  function redo() {
    if (!StudioState.redoStack.length) {
      logCommand('Nothing to redo.');
      toast('Nothing to redo in DXF Studio.');
      return false;
    }
    const snap = StudioState.redoStack.pop();
    const ds = getDXFState();
    const targetParser = (snap && snap.parserRef) || (ds && snap && snap.slot === 'A' ? ds.parsedA : (ds && snap && snap.slot === 'B' ? ds.parsedB : null)) || getActiveParser();
    if (targetParser && ds) {
      const undoSnap = createParserSnapshot(snap ? snap.label : 'Undo', targetParser, ds);
      if (snap && snap.slot) undoSnap.slot = snap.slot;
      StudioState.undoStack.push(undoSnap);
    }
    applySnapshot(snap);
    updateUndoRedoButtons();
    logCommand(`Redone: ${snap.label}`);
    toast(`Redone: ${snap.label}`);
    return true;
  }

  function updateUndoRedoButtons() {
    const uBtn = $('#dxf-st-undo');
    const rBtn = $('#dxf-st-redo');
    if (uBtn) uBtn.disabled = StudioState.undoStack.length === 0;
    if (rBtn) rBtn.disabled = StudioState.redoStack.length === 0;
  }

  function isLayerLocked(parser, layerName) {
    const ds = getDXFState();
    if (ds && ds.lockedLayers && ds.lockedLayers.has(layerName)) return true;
    const lyr = parser && parser.layers && parser.layers[layerName];
    return !!(lyr && lyr.locked);
  }

  function isLayerVisible(parser, layerName) {
    const ds = getDXFState();
    if (ds) {
      if (ds.hiddenLayers.has(layerName) || ds.frozenLayers.has(layerName)) return false;
    }
    const lyr = parser && parser.layers && parser.layers[layerName];
    if (lyr && (lyr.visible === false || lyr.frozen)) return false;
    return true;
  }

  function syncParserMutation(serializeRaw = true) {
    const ds = getDXFState();
    const parser = getActiveParser();
    if (!ds || !parser) return;
    ds._studioDirty = true;
    ds._pdfDirty = true;
    parser._cachedPdfKey = null;
    parser._cachedPdfBytes = null;
    parser.recomputeBoundsAndCounts();
    if (serializeRaw && parser.entities.length <= 10000) {
      try {
        if (StudioState.activeSlot === 'A' && ds.parsedA === parser) {
          ds.rawA = parser.toDXFString();
        } else if (ds.parsedB === parser) {
          ds.rawB = parser.toDXFString();
        } else if (ds.parsedA === parser) {
          ds.rawA = parser.toDXFString();
        }
      } catch (_e) {}
    }
    if (ds.parsedA && ds.parsedB && typeof DXFEngine !== 'undefined' && (ds.parsedA.entities.length + ds.parsedB.entities.length) <= 25000) {
      ds.lastEntityDiff = DXFEngine.compareDXFEntities(ds.parsedA, ds.parsedB, {
        tol: ds.compareTol || 0.005,
        comparedLayers: ds.comparedLayers.size ? ds.comparedLayers : null,
        hiddenLayers: ds.hiddenLayers,
        frozenLayers: ds.frozenLayers,
        lockedLayers: ds.lockedLayers,
        ignoreLockedLayers: ds.ignoreLockedLayers,
        ignoreText: ds.ignoreText,
        ignoreDimensions: ds.ignoreDimensions,
        layerMapping: ds.layerMapping
      });
    }
  }

  function logCommand(msg) {
    StudioState.cmdHistory.push(msg);
    if (StudioState.cmdHistory.length > 40) StudioState.cmdHistory.shift();
    const logEl = $('#dxf-cmd-log');
    if (logEl) {
      logEl.textContent = StudioState.cmdHistory[StudioState.cmdHistory.length - 1];
      logEl.title = StudioState.cmdHistory.slice(-8).join('\n');
    }
  }

  // ==========================================================================
  // 2D & 3D MULTI-ANGLE COORDINATE PROJECTION & OSNAP ENGINE
  // ==========================================================================
  const VIEW_PRESETS = {
    top:       { yaw: 0,    pitch: 0,       roll: 0, label: 'Top (2D Plan XY)' },
    bottom:    { yaw: 180,  pitch: 180,     roll: 0, label: 'Bottom (-XY)' },
    front:     { yaw: 0,    pitch: 90,      roll: 0, label: 'Front (XZ Elevation)' },
    back:      { yaw: 180,  pitch: 90,      roll: 0, label: 'Back (-XZ Elevation)' },
    left:      { yaw: -90,  pitch: 90,      roll: 0, label: 'Left (YZ Side)' },
    right:     { yaw: 90,   pitch: 90,      roll: 0, label: 'Right (-YZ Side)' },
    sw_iso:    { yaw: -45,  pitch: 54.7356, roll: 0, label: 'SW Isometric (3D)' },
    se_iso:    { yaw: 45,   pitch: 54.7356, roll: 0, label: 'SE Isometric (3D)' },
    ne_iso:    { yaw: 135,  pitch: 54.7356, roll: 0, label: 'NE Isometric (3D)' },
    nw_iso:    { yaw: -135, pitch: 54.7356, roll: 0, label: 'NW Isometric (3D)' },
    dimetric:  { yaw: -30,  pitch: 60,      roll: 0, label: 'Dimetric (3D)' },
    trimetric: { yaw: -25,  pitch: 50,      roll: 8, label: 'Trimetric (3D)' }
  };

  function is3DViewActive() {
    return Math.abs(StudioState.yaw || 0) > 1e-3 ||
           Math.abs(StudioState.pitch || 0) > 1e-3 ||
           Math.abs(StudioState.roll || 0) > 1e-3 ||
           (StudioState.visualStyle && StudioState.visualStyle !== '2d');
  }

  function get3DPivot() {
    const p = getActiveParser();
    if (p && p.bounds && isFinite(p.bounds.minX) && isFinite(p.bounds.maxX)) {
      return {
        x: (p.bounds.minX + p.bounds.maxX) * 0.5,
        y: (p.bounds.minY + p.bounds.maxY) * 0.5,
        z: 0
      };
    }
    return { x: 100, y: 70, z: 0 };
  }

  function rotate3DDelta(dx, dy, dz) {
    const yawRad = ((StudioState.yaw || 0) * Math.PI) / 180;
    const pitchRad = ((StudioState.pitch || 0) * Math.PI) / 180;
    const rollRad = ((StudioState.roll || 0) * Math.PI) / 180;
    const cosY = Math.cos(yawRad), sinY = Math.sin(yawRad);
    const cosP = Math.cos(pitchRad), sinP = Math.sin(pitchRad);
    const cosR = Math.cos(rollRad), sinR = Math.sin(rollRad);

    // 1. Rotate around Z (Yaw)
    const x1 = dx * cosY - dy * sinY;
    const y1 = dx * sinY + dy * cosY;
    const z1 = dz;

    // 2. Tilt around X (Pitch: 0 = Top XY, 90 = Front XZ)
    const x2 = x1;
    const y2 = y1 * cosP + z1 * sinP;
    const z2 = -y1 * sinP + z1 * cosP;

    // 3. Roll in screen plane
    const x3 = x2 * cosR - y2 * sinR;
    const y3 = x2 * sinR + y2 * cosR;
    return { x: x3, y: y3, z: z2 };
  }

  function project3DPoint(wx, wy, wz = 0, canvasH = null, panXOverride = null) {
    const h = canvasH || ($('#dxf-canvas') ? $('#dxf-canvas').height : 800);
    const effPanX = panXOverride != null ? panXOverride : StudioState.panX;
    if (Math.abs(StudioState.yaw || 0) < 1e-4 && Math.abs(StudioState.pitch || 0) < 1e-4 && Math.abs(StudioState.roll || 0) < 1e-4) {
      return {
        x: effPanX + wx * StudioState.zoom,
        y: h - (StudioState.panY + wy * StudioState.zoom),
        depth: wz || 0
      };
    }
    const piv = get3DPivot();
    const rot = rotate3DDelta(wx - piv.x, wy - piv.y, (wz || 0) - piv.z);
    const px = piv.x + rot.x;
    const py = piv.y + rot.y;
    return {
      x: effPanX + px * StudioState.zoom,
      y: h - (StudioState.panY + py * StudioState.zoom),
      depth: rot.z
    };
  }

  function worldToScreen(wx, wy, canvasH, wz = 0) {
    const p = project3DPoint(wx, wy, wz || StudioState.defaultElevation || 0, canvasH, null);
    return { x: p.x, y: p.y };
  }

  function screenToWorld(sx, sy, canvasH) {
    const h = canvasH || ($('#dxf-canvas') ? $('#dxf-canvas').height : 800);
    const targetX = (sx - StudioState.panX) / Math.max(1e-9, StudioState.zoom);
    const targetY = ((h - sy) - StudioState.panY) / Math.max(1e-9, StudioState.zoom);
    if (Math.abs(StudioState.yaw || 0) < 1e-4 && Math.abs(StudioState.pitch || 0) < 1e-4 && Math.abs(StudioState.roll || 0) < 1e-4) {
      return { x: targetX, y: targetY, z: StudioState.defaultElevation || 0 };
    }
    const piv = get3DPivot();
    const rx = targetX - piv.x;
    const ry = targetY - piv.y;
    const rollRad = (-(StudioState.roll || 0) * Math.PI) / 180;
    const x2 = rx * Math.cos(rollRad) - ry * Math.sin(rollRad);
    const y2 = rx * Math.sin(rollRad) + ry * Math.cos(rollRad);
    const pitchRad = ((StudioState.pitch || 0) * Math.PI) / 180;
    const cosP = Math.cos(pitchRad), sinP = Math.sin(pitchRad);
    const dz = (StudioState.defaultElevation || 0) - piv.z;
    const effCosP = Math.abs(cosP) < 0.08 ? (cosP < 0 ? -0.08 : 0.08) : cosP;
    const x1 = x2;
    const y1 = (y2 - dz * sinP) / effCosP;
    const yawRad = (-(StudioState.yaw || 0) * Math.PI) / 180;
    const dx = x1 * Math.cos(yawRad) - y1 * Math.sin(yawRad);
    const dy = x1 * Math.sin(yawRad) + y1 * Math.cos(yawRad);
    return {
      x: piv.x + dx,
      y: piv.y + dy,
      z: StudioState.defaultElevation || 0
    };
  }

  function ensure3DModelspaceReady() {
    if (getActiveParser()) {
      updateEmptyOverlay();
      return getActiveParser();
    }
    if (typeof document !== 'undefined' && document.body && document.body.dataset.view === 'dxf') {
      const p = ensureActiveParser(true);
      if (p && p.entities && p.entities.length <= 1) {
        // Add 3D-ready reference holes and center boss on the blank sheet so 2D/3D Views & Orbit show clear 3D geometry immediately
        p.entities.push(
          { _id: 'ref_c1', type: 'CIRCLE', layer: 'MOUNTING_HOLES', cx: 20, cy: 20, r: 8, thickness: 12 },
          { _id: 'ref_c2', type: 'CIRCLE', layer: 'MOUNTING_HOLES', cx: 180, cy: 20, r: 8, thickness: 12 },
          { _id: 'ref_c3', type: 'CIRCLE', layer: 'MOUNTING_HOLES', cx: 180, cy: 120, r: 8, thickness: 12 },
          { _id: 'ref_c4', type: 'CIRCLE', layer: 'MOUNTING_HOLES', cx: 20, cy: 120, r: 8, thickness: 12 },
          { _id: 'ref_boss', type: 'CIRCLE', layer: 'CONNECTOR_CUTOUTS', cx: 100, cy: 70, r: 28, thickness: 18 },
          { _id: 'ref_slot', type: 'LWPOLYLINE', layer: 'CONNECTOR_CUTOUTS', closed: true, thickness: 24, points: [[76, 54, 0], [124, 54, 0], [124, 86, 0], [76, 86, 0]] }
        );
        p.recomputeBoundsAndCounts();
        refreshAllUI();
        zoomExtents();
      }
      return p;
    }
    return getActiveParser();
  }

  function center3DPivotInViewport() {
    const cv = $('#dxf-canvas');
    const wrap = $('#dxf-canvas-wrap');
    if (!cv) return;
    if (wrap) {
      const rect = wrap.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 50) {
        cv.width = Math.floor(rect.width);
        cv.height = Math.floor(rect.height);
      }
    }
    const W = cv.width || 900;
    const H = cv.height || 600;
    const piv = get3DPivot();
    const effW = StudioState.viewMode === 'side' ? Math.floor(W / 2) : W;
    StudioState.panX = (effW * 0.5) - piv.x * StudioState.zoom;
    StudioState.panY = (H * 0.5) - piv.y * StudioState.zoom;
  }

  function setViewPreset(presetKey) {
    const key = String(presetKey || 'top').toLowerCase();
    const preset = VIEW_PRESETS[key];
    if (!preset) return false;
    ensure3DModelspaceReady();
    StudioState.viewPreset = key;
    StudioState.yaw = preset.yaw;
    StudioState.pitch = preset.pitch;
    StudioState.roll = preset.roll;
    if (key === 'top') {
      if (StudioState.visualStyle === '3d_shaded') StudioState.visualStyle = '2d';
    } else if (StudioState.visualStyle === '2d') {
      StudioState.visualStyle = '3d_shaded';
    }
    center3DPivotInViewport();
    syncViewCubeControls();
    renderCanvas();
    updateStatusBar();
    logCommand(`View preset set to ${preset.label} (Yaw=${preset.yaw}°, Pitch=${preset.pitch.toFixed(1)}°).`);
    return true;
  }

  function setViewAngles(yaw, pitch, roll = 0) {
    ensure3DModelspaceReady();
    StudioState.viewPreset = 'custom';
    StudioState.yaw = ((Number(yaw) || 0) % 360);
    StudioState.pitch = Math.max(-180, Math.min(180, Number(pitch) || 0));
    StudioState.roll = ((Number(roll) || 0) % 360);
    if (is3DViewActive() && StudioState.visualStyle === '2d') {
      StudioState.visualStyle = '3d_shaded';
    }
    center3DPivotInViewport();
    syncViewCubeControls();
    renderCanvas();
    updateStatusBar();
    return { yaw: StudioState.yaw, pitch: StudioState.pitch, roll: StudioState.roll };
  }

  function setVisualStyle(styleKey) {
    const valid = ['2d', '3d_wire', '3d_shaded', '3d_hidden'];
    const s = valid.includes(styleKey) ? styleKey : '2d';
    ensure3DModelspaceReady();
    StudioState.visualStyle = s;
    if (s !== '2d' && Math.abs(StudioState.yaw || 0) < 1e-3 && Math.abs(StudioState.pitch || 0) < 1e-3) {
      // Automatically tilt to SW Isometric when user selects a 3D visual style from flat 2D Top view
      StudioState.viewPreset = 'sw_iso';
      StudioState.yaw = VIEW_PRESETS.sw_iso.yaw;
      StudioState.pitch = VIEW_PRESETS.sw_iso.pitch;
      StudioState.roll = VIEW_PRESETS.sw_iso.roll;
      center3DPivotInViewport();
    }
    syncViewCubeControls();
    renderCanvas();
    updateStatusBar();
    logCommand(`Visual style set to ${s.toUpperCase()}.`);
    return s;
  }

  function syncViewCubeControls() {
    if (typeof document === 'undefined') return;
    if ($('#dxf-qb-view-sel')) $('#dxf-qb-view-sel').value = VIEW_PRESETS[StudioState.viewPreset] ? StudioState.viewPreset : 'sw_iso';
    if ($('#dxf-st-view-sel')) $('#dxf-st-view-sel').value = VIEW_PRESETS[StudioState.viewPreset] ? StudioState.viewPreset : 'sw_iso';
    if ($('#dxf-qb-style-sel')) $('#dxf-qb-style-sel').value = StudioState.visualStyle || '2d';
    if ($('#dxf-st-style-sel')) $('#dxf-st-style-sel').value = StudioState.visualStyle || '2d';
    if ($('#dxf-vc-yaw')) $('#dxf-vc-yaw').value = Math.round(StudioState.yaw || 0);
    if ($('#dxf-vc-pitch')) $('#dxf-vc-pitch').value = Math.round(StudioState.pitch || 0);
    if ($('#dxf-vc-roll')) $('#dxf-vc-roll').value = Math.round(StudioState.roll || 0);
    if ($('#dxf-st-yaw')) $('#dxf-st-yaw').value = Math.round(StudioState.yaw || 0);
    if ($('#dxf-st-pitch')) $('#dxf-st-pitch').value = Math.round(StudioState.pitch || 0);
    if ($('#dxf-st-roll')) $('#dxf-st-roll').value = Math.round(StudioState.roll || 0);
    if ($('#dxf-aid-3d')) $('#dxf-aid-3d').classList.toggle('on', is3DViewActive());
    document.querySelectorAll('#dxf-viewcube-hud [data-vc-preset]').forEach(btn => {
      btn.classList.toggle('on', btn.dataset.vcPreset === StudioState.viewPreset);
    });
    document.querySelectorAll('#view-dxf [data-dxf-vpreset]').forEach(btn => {
      btn.classList.toggle('on', btn.dataset.dxfVpreset === StudioState.viewPreset);
    });
    const cubeG = $('#dxf-vc-cube-svg');
    if (cubeG) {
      const y = StudioState.yaw || 0;
      const p = StudioState.pitch || 0;
      const lbl = (VIEW_PRESETS[StudioState.viewPreset] && VIEW_PRESETS[StudioState.viewPreset].label.split(' ')[0].toUpperCase()) || (is3DViewActive() ? '3D ORBIT' : 'TOP 2D');
      const txtEl = $('#dxf-vc-face-lbl');
      if (txtEl) txtEl.textContent = lbl;
      cubeG.style.transform = `rotateX(${(p * 0.45).toFixed(1)}deg) rotateZ(${(-y * 0.65).toFixed(1)}deg)`;
    }
  }

  function zoomExtents() {
    const parser = ensureActiveParser();
    const cv = $('#dxf-canvas');
    const wrap = $('#dxf-canvas-wrap');
    if (!parser || !cv) return;
    if (wrap) {
      const rect = wrap.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 50) {
        cv.width = Math.floor(rect.width);
        cv.height = Math.floor(rect.height);
      } else if (!cv.width || !cv.height) {
        cv.width = 960;
        cv.height = 640;
      }
    }
    parser.recomputeBoundsAndCounts();
    const b = parser.bounds;
    const minX = isFinite(b.minX) ? b.minX : 0;
    const minY = isFinite(b.minY) ? b.minY : 0;
    const maxX = isFinite(b.maxX) && b.maxX > minX ? b.maxX : minX + 200;
    const maxY = isFinite(b.maxY) && b.maxY > minY ? b.maxY : minY + 140;
    const bw = Math.max(1e-4, maxX - minX);
    const bh = Math.max(1e-4, maxY - minY);
    const pad = Math.min(54, Math.floor(Math.min(cv.width, cv.height) * 0.08));
    const effW = StudioState.viewMode === 'side' ? Math.floor(cv.width / 2) : cv.width;
    const availW = Math.max(80, effW - pad * 2);
    const availH = Math.max(80, cv.height - pad * 2);
    // Support full CAD zoom range [1e-6 .. 1e6] so both micro-parts and large architectural/site AutoCAD drawings fit 100% on screen
    StudioState.zoom = Math.max(1e-6, Math.min(1e6, Math.min(availW / bw, availH / bh)));
    StudioState.baseFitZoom = StudioState.zoom;
    StudioState._fittedParserRef = parser;
    StudioState._needsZoomExtents = false;
    StudioState.panX = pad + (availW - bw * StudioState.zoom) / 2 - minX * StudioState.zoom;
    StudioState.panY = pad + (availH - bh * StudioState.zoom) / 2 - minY * StudioState.zoom;
    renderCanvas();
    updateStatusBar();
  }

  function syncGeom(ent) {
    if (!ent) return ent;
    if (typeof DXFEngine !== 'undefined' && typeof DXFEngine.syncEntityRenderGeometry === 'function') {
      return DXFEngine.syncEntityRenderGeometry(ent);
    }
    ent._bbox = null;
    ent._cachedBBox = null;
    return ent;
  }

  function computeOSNAP(worldPt) {
    if (!StudioState.osnapEnabled) return null;
    const parser = getActiveParser();
    if (!parser) return null;
    const snapRadiusWorld = 11 / Math.max(1e-6, StudioState.zoom);
    let best = null;
    let bestDist = snapRadiusWorld;

    const checkPt = (x, y, type) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const dx = x - worldPt.x, dy = y - worldPt.y;
      if (Math.abs(dx) >= bestDist || Math.abs(dy) >= bestDist) return;
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        best = { x, y, type };
      }
    };

    for (let idx = 0; idx < parser.entities.length; idx++) {
      const ent = parser.entities[idx];
      if (!isLayerVisible(parser, ent.layer)) continue;
      // Fast O(1) bounding box rejection before checking vertices
      const eb = parser.getEntityBBox ? parser.getEntityBBox(ent) : null;
      if (eb && isFinite(eb.minX)) {
        if (worldPt.x < eb.minX - bestDist || worldPt.x > eb.maxX + bestDist ||
            worldPt.y < eb.minY - bestDist || worldPt.y > eb.maxY + bestDist) {
          continue;
        }
      }
      if (ent.type === 'LINE') {
        checkPt(ent.x1, ent.y1, 'ENDPOINT');
        checkPt(ent.x2, ent.y2, 'ENDPOINT');
        checkPt((ent.x1 + ent.x2) * 0.5, (ent.y1 + ent.y2) * 0.5, 'MIDPOINT');
      } else if ((ent.type === 'LWPOLYLINE' || ent.type === 'SPLINE' || ent.type === 'SOLID') && Array.isArray(ent.points)) {
        const pts = ent.points;
        const n = pts.length;
        for (let i = 0; i < n; i++) {
          const p1 = pts[i];
          checkPt(p1[0], p1[1], 'ENDPOINT');
          if (i < n - 1 || ent.closed) {
            const p2 = pts[(i + 1) % n];
            checkPt((p1[0] + p2[0]) * 0.5, (p1[1] + p2[1]) * 0.5, 'MIDPOINT');
          }
        }
      } else if (ent.type === 'CIRCLE' || ent.type === 'ARC') {
        checkPt(ent.cx, ent.cy, 'CENTER');
        if (ent.type === 'CIRCLE') {
          checkPt(ent.cx + ent.r, ent.cy, 'QUADRANT');
          checkPt(ent.cx - ent.r, ent.cy, 'QUADRANT');
          checkPt(ent.cx, ent.cy + ent.r, 'QUADRANT');
          checkPt(ent.cx, ent.cy - ent.r, 'QUADRANT');
        } else {
          const a1 = (ent.startAngle || 0) * Math.PI / 180;
          const a2 = (ent.endAngle || 0) * Math.PI / 180;
          checkPt(ent.cx + ent.r * Math.cos(a1), ent.cy + ent.r * Math.sin(a1), 'ENDPOINT');
          checkPt(ent.cx + ent.r * Math.cos(a2), ent.cy + ent.r * Math.sin(a2), 'ENDPOINT');
        }
      } else if (ent.type === 'ELLIPSE') {
        checkPt(ent.cx, ent.cy, 'CENTER');
        checkPt(ent.cx + (ent.mx || ent.rx || 0), ent.cy + (ent.my || 0), 'QUADRANT');
      } else if (ent.type === 'TEXT' || ent.type === 'INSERT' || ent.type === 'POINT') {
        checkPt(ent.x, ent.y, 'NODE');
      } else if (ent.type === 'DIMENSION') {
        if (Number.isFinite(ent.x1) && Number.isFinite(ent.y1)) checkPt(ent.x1, ent.y1, 'ENDPOINT');
        if (Number.isFinite(ent.x2) && Number.isFinite(ent.y2)) checkPt(ent.x2, ent.y2, 'ENDPOINT');
      }
      // PERPENDICULAR & NEAREST snap on LINE segments when drawing from a previous point
      if (ent.type === 'LINE') {
        if (StudioState.tempPoints.length > 0) {
          const prev = StudioState.tempPoints[StudioState.tempPoints.length - 1];
          const dx = ent.x2 - ent.x1, dy = ent.y2 - ent.y1;
          const lenSq = dx * dx + dy * dy;
          if (lenSq > 1e-6) {
            const t = ((prev.x - ent.x1) * dx + (prev.y - ent.y1) * dy) / lenSq;
            if (t >= 0 && t <= 1) {
              checkPt(ent.x1 + t * dx, ent.y1 + t * dy, 'PERPENDICULAR');
            }
          }
        }
      } else if (ent.type === 'CIRCLE' && StudioState.tempPoints.length > 0) {
        // TANGENT snap from previous point onto CIRCLE
        const prev = StudioState.tempPoints[StudioState.tempPoints.length - 1];
        const dCenter = Math.hypot(prev.x - ent.cx, prev.y - ent.cy);
        if (dCenter > ent.r * 1.02) {
          const baseAng = Math.atan2(prev.y - ent.cy, prev.x - ent.cx);
          const dAng = Math.acos(Math.min(1, ent.r / dCenter));
          checkPt(ent.cx + ent.r * Math.cos(baseAng + dAng), ent.cy + ent.r * Math.sin(baseAng + dAng), 'TANGENT');
          checkPt(ent.cx + ent.r * Math.cos(baseAng - dAng), ent.cy + ent.r * Math.sin(baseAng - dAng), 'TANGENT');
        }
      }
    }
    // Check World Origin (0,0)
    checkPt(0, 0, 'ORIGIN');

    // Check Line-Line INTERSECTION if no closer endpoint/midpoint already locked
    if (!best && parser.entities.length <= 400) {
      const candLines = [];
      for (let i = 0; i < parser.entities.length; i++) {
        const e = parser.entities[i];
        if (e.type === 'LINE' && isLayerVisible(parser, e.layer)) {
          if (distToSegment(worldPt.x, worldPt.y, e.x1, e.y1, e.x2, e.y2) <= snapRadiusWorld * 1.6) {
            candLines.push(e);
          }
        }
      }
      for (let a = 0; a < candLines.length; a++) {
        for (let b = a + 1; b < candLines.length; b++) {
          const ix = lineLineIntersection(candLines[a].x1, candLines[a].y1, candLines[a].x2, candLines[a].y2, candLines[b].x1, candLines[b].y1, candLines[b].x2, candLines[b].y2, false);
          if (ix) checkPt(ix.x, ix.y, 'INTERSECTION');
        }
      }
    }
    return best;
  }

  function applyOrthoAndSnap(rawWorld) {
    let pt = { x: rawWorld.x, y: rawWorld.y };
    const snap = computeOSNAP(pt);
    StudioState.snapPoint = snap;
    if (snap) {
      pt = { x: snap.x, y: snap.y };
    } else if (StudioState.orthoEnabled && StudioState.tempPoints.length > 0) {
      const prev = StudioState.tempPoints[StudioState.tempPoints.length - 1];
      const dx = pt.x - prev.x;
      const dy = pt.y - prev.y;
      if (Math.abs(dx) >= Math.abs(dy)) pt.y = prev.y;
      else pt.x = prev.x;
    } else if (StudioState.polarEnabled && StudioState.tempPoints.length > 0) {
      const prev = StudioState.tempPoints[StudioState.tempPoints.length - 1];
      const dx = pt.x - prev.x;
      const dy = pt.y - prev.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1e-4) {
        const angDeg = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        const nearest45 = Math.round(angDeg / 45) * 45;
        if (Math.abs(angDeg - nearest45) <= 4.0) {
          const rad = nearest45 * Math.PI / 180;
          pt.x = prev.x + dist * Math.cos(rad);
          pt.y = prev.y + dist * Math.sin(rad);
        }
      }
    }
    return pt;
  }

  // ==========================================================================
  // HIT TESTING & GRIP HANDLES
  // ==========================================================================
  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-9) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function distanceToEntity(ent, wx, wy, parser, depth = 0) {
    if (!ent || depth > 6) return Infinity;
    if (ent.type === 'LINE') {
      return distToSegment(wx, wy, ent.x1, ent.y1, ent.x2, ent.y2);
    }
    if ((ent.type === 'LWPOLYLINE' || ent.type === 'SPLINE' || ent.type === 'SOLID') && Array.isArray(ent.renderPoints || ent.points) && (ent.renderPoints || ent.points).length >= 2) {
      const pts = ent.renderPoints || ent.points;
      let minD = Infinity;
      const n = pts.length;
      const count = (ent.closed || ent.type === 'SOLID') ? n : n - 1;
      for (let i = 0; i < count; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % n];
        const d = distToSegment(wx, wy, p1[0], p1[1], p2[0], p2[1]);
        if (d < minD) minD = d;
      }
      return minD;
    }
    if (ent.type === 'HATCH') {
      const loops = (Array.isArray(ent.loops) && ent.loops.length) ? ent.loops : (Array.isArray(ent.points) && ent.points.length >= 2 ? [ent.points] : []);
      let minD = Infinity;
      for (const lp of loops) {
        if (!lp || lp.length < 2) continue;
        for (let i = 0; i < lp.length - 1; i++) {
          const d = distToSegment(wx, wy, lp[i][0], lp[i][1], lp[i + 1][0], lp[i + 1][1]);
          if (d < minD) minD = d;
        }
      }
      return minD;
    }
    if (ent.type === 'CIRCLE') {
      return Math.abs(Math.hypot(wx - ent.cx, wy - ent.cy) - ent.r);
    }
    if (ent.type === 'ARC') {
      const dRad = Math.abs(Math.hypot(wx - ent.cx, wy - ent.cy) - ent.r);
      let ang = (Math.atan2(wy - ent.cy, wx - ent.cx) * 180 / Math.PI + 360) % 360;
      let s = ((ent.startAngle || 0) % 360 + 360) % 360;
      let e = ((ent.endAngle != null ? ent.endAngle : 360) % 360 + 360) % 360;
      const inArc = s <= e ? (ang >= s - 5 && ang <= e + 5) : (ang >= s - 5 || ang <= e + 5);
      return inArc ? dRad : Infinity;
    }
    if (ent.type === 'ELLIPSE') {
      const rx = Math.max(1e-3, ent.rx || Math.hypot(ent.mx || 10, ent.my || 0));
      const ry = Math.max(1e-3, ent.ry || rx * (ent.ratio || 0.5));
      const rot = ent.rotation != null ? ent.rotation : Math.atan2(ent.my || 0, ent.mx || 1);
      const dx = wx - ent.cx, dy = wy - ent.cy;
      const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      const norm = Math.hypot(lx / rx, ly / ry);
      return Math.abs(norm - 1) * Math.min(rx, ry);
    }
    if (ent.type === 'POINT') {
      return Math.hypot(wx - (ent.x || 0), wy - (ent.y || 0));
    }
    if (ent.type === 'INSERT' && parser) {
      const blk = parser._getBlock ? parser._getBlock(ent.blockName) : (parser.blocks && parser.blocks[ent.blockName]);
      if (blk && Array.isArray(blk.entities) && blk.entities.length) {
        const sx = ent.scaleX || 1, sy = ent.scaleY || 1;
        const rad = -((ent.rotation || 0) * Math.PI) / 180;
        const dx = wx - (ent.x || 0), dy = wy - (ent.y || 0);
        const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
        const lx = (blk.baseX || 0) + rx / (Math.abs(sx) > 1e-6 ? sx : 1);
        const ly = (blk.baseY || 0) + ry / (Math.abs(sy) > 1e-6 ? sy : 1);
        const scaleAvg = (Math.abs(sx) + Math.abs(sy)) * 0.5;
        let minSub = Infinity;
        for (const sub of blk.entities) {
          if (!sub || (sub.type === 'POINT' && /^defpoints$/i.test(sub.layer || ''))) continue;
          const sd = distanceToEntity(sub, lx, ly, parser, depth + 1) * scaleAvg;
          if (sd < minSub) minSub = sd;
        }
        return isFinite(minSub) ? minSub : Math.hypot(dx, dy);
      }
      return Math.hypot(wx - (ent.x || 0), wy - (ent.y || 0));
    }
    if (ent.type === 'DIMENSION') {
      const dimBlk = (ent.blockName && parser) ? (parser._getBlock ? parser._getBlock(ent.blockName) : (parser.blocks && parser.blocks[ent.blockName])) : null;
      if (dimBlk && Array.isArray(dimBlk.entities) && dimBlk.entities.length) {
        let minSub = Infinity;
        for (const sub of dimBlk.entities) {
          if (!sub || sub.type === 'POINT') continue;
          const sd = distanceToEntity(sub, wx, wy, parser, depth + 1);
          if (sd < minSub) minSub = sd;
        }
        if (isFinite(minSub)) return minSub;
      }
      const x1 = ent.x1 ?? ent.x ?? 0, y1 = ent.y1 ?? ent.y ?? 0;
      const x2 = ent.x2 ?? x1, y2 = ent.y2 ?? y1;
      const tx = ent.textX ?? ent.x ?? (x1 + x2) * 0.5, ty = ent.textY ?? ent.y ?? (y1 + y2) * 0.5;
      const dxSpan = Math.abs(x2 - x1), dySpan = Math.abs(y2 - y1);
      if (dySpan > dxSpan * 1.2 && Math.abs(tx - (x1 + x2) * 0.5) > 1e-3) {
        return Math.min(
          distToSegment(wx, wy, x1, y1, tx, y1),
          distToSegment(wx, wy, x2, y2, tx, y2),
          distToSegment(wx, wy, tx, y1, tx, y2),
          Math.hypot(wx - tx, wy - ty)
        );
      }
      if (dxSpan >= dySpan * 1.2 && Math.abs(ty - (y1 + y2) * 0.5) > 1e-3) {
        return Math.min(
          distToSegment(wx, wy, x1, y1, x1, ty),
          distToSegment(wx, wy, x2, y2, x2, ty),
          distToSegment(wx, wy, x1, ty, x2, ty),
          Math.hypot(wx - tx, wy - ty)
        );
      }
      return Math.min(
        distToSegment(wx, wy, x1, y1, x2, y2),
        Math.hypot(wx - tx, wy - ty)
      );
    }
    const bbox = (parser && parser.getEntityBBox)
      ? parser.getEntityBBox(ent)
      : ((typeof DXFEngine !== 'undefined' && DXFEngine.getDXFEntityBBox) ? DXFEngine.getDXFEntityBBox(ent, parser ? parser.blocks : null) : null);
    if (bbox && isFinite(bbox.minX)) {
      if (wx >= bbox.minX && wx <= bbox.maxX && wy >= bbox.minY && wy <= bbox.maxY) {
        return 0;
      }
      const dx = Math.max(bbox.minX - wx, 0, wx - bbox.maxX);
      const dy = Math.max(bbox.minY - wy, 0, wy - bbox.maxY);
      return Math.hypot(dx, dy);
    }
    return Infinity;
  }

  function findEntityAt(wx, wy) {
    const parser = getActiveParser();
    if (!parser) return null;
    const hitTol = 8.5 / Math.max(1e-6, StudioState.zoom);
    let bestEnt = null;
    let bestDist = hitTol;
    const searchParser = (pObj) => {
      if (!pObj || !Array.isArray(pObj.entities)) return;
      for (let i = pObj.entities.length - 1; i >= 0; i--) {
        const ent = pObj.entities[i];
        if (!isLayerVisible(pObj, ent.layer)) continue;
        const eb = pObj.getEntityBBox ? pObj.getEntityBBox(ent) : null;
        if (eb && isFinite(eb.minX)) {
          if (wx < eb.minX - bestDist || wx > eb.maxX + bestDist ||
              wy < eb.minY - bestDist || wy > eb.maxY + bestDist) {
            continue;
          }
        }
        const d = distanceToEntity(ent, wx, wy, pObj);
        if (d <= bestDist) {
          bestDist = d;
          bestEnt = ent;
        }
      }
    };
    searchParser(parser);
    if (!bestEnt && StudioState.viewMode === 'overlay') {
      const ds = getDXFState();
      const otherParser = (ds && parser === ds.parsedB) ? ds.parsedA : (ds ? ds.parsedB : null);
      if (otherParser) {
        searchParser(otherParser);
        if (bestEnt && ds) {
          StudioState.activeSlot = (otherParser === ds.parsedA) ? 'A' : 'B';
        }
      }
    }
    if (bestEnt && (bestEnt.type === 'INSERT' || bestEnt.type === 'DIMENSION')) {
      const activeP = getActiveParser() || parser;
      const blk = (bestEnt.blockName && activeP)
        ? (activeP._getBlock ? activeP._getBlock(bestEnt.blockName) : (activeP.blocks && activeP.blocks[bestEnt.blockName]))
        : null;
      if (blk && Array.isArray(blk.entities) && blk.entities.length > 1) {
        let lx = wx, ly = wy;
        if (bestEnt.type === 'INSERT') {
          const sx = bestEnt.scaleX || 1, sy = bestEnt.scaleY || 1;
          const rad = -((bestEnt.rotation || 0) * Math.PI) / 180;
          const dx = wx - (bestEnt.x || 0), dy = wy - (bestEnt.y || 0);
          const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
          const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
          lx = (blk.baseX || 0) + rx / (Math.abs(sx) > 1e-6 ? sx : 1);
          ly = (blk.baseY || 0) + ry / (Math.abs(sy) > 1e-6 ? sy : 1);
        }
        let bestSi = -1, bestSd = Infinity;
        for (let si = 0; si < blk.entities.length; si++) {
          const sub = blk.entities[si];
          if (!sub || sub.type === 'POINT') continue;
          const sd = distanceToEntity(sub, lx, ly, activeP, 1);
          if (sd < bestSd) { bestSd = sd; bestSi = si; }
        }
        StudioState.lastHitSub = bestSi >= 0 ? { entId: bestEnt._id, subIdx: bestSi, wx, wy } : null;
      } else {
        StudioState.lastHitSub = null;
      }
    } else {
      StudioState.lastHitSub = null;
    }
    return bestEnt;
  }

  function getEntityGrips(ent) {
    if (!ent) return [];
    if (ent.type === 'LINE') {
      return [
        { entId: ent._id, kind: 'p1', x: ent.x1, y: ent.y1 },
        { entId: ent._id, kind: 'mid', x: (ent.x1 + ent.x2) / 2, y: (ent.y1 + ent.y2) / 2 },
        { entId: ent._id, kind: 'p2', x: ent.x2, y: ent.y2 }
      ];
    }
    if (ent.type === 'CIRCLE') {
      return [
        { entId: ent._id, kind: 'center', x: ent.cx, y: ent.cy },
        { entId: ent._id, kind: 'rad_e', x: ent.cx + ent.r, y: ent.cy },
        { entId: ent._id, kind: 'rad_n', x: ent.cx, y: ent.cy + ent.r }
      ];
    }
    if (ent.type === 'ARC') {
      const a1 = (ent.startAngle || 0) * Math.PI / 180;
      const a2 = (ent.endAngle || 0) * Math.PI / 180;
      return [
        { entId: ent._id, kind: 'center', x: ent.cx, y: ent.cy },
        { entId: ent._id, kind: 'start', x: ent.cx + ent.r * Math.cos(a1), y: ent.cy + ent.r * Math.sin(a1) },
        { entId: ent._id, kind: 'end', x: ent.cx + ent.r * Math.cos(a2), y: ent.cy + ent.r * Math.sin(a2) }
      ];
    }
    if ((ent.type === 'LWPOLYLINE' || ent.type === 'SPLINE' || ent.type === 'SOLID' || ent.type === 'HATCH') && Array.isArray(ent.points) && ent.points.length) {
      return ent.points.map((pt, idx) => ({
        entId: ent._id,
        kind: 'vertex',
        vertexIndex: idx,
        x: pt[0],
        y: pt[1]
      }));
    }
    if (ent.type === 'ELLIPSE') {
      const mx = ent.mx != null ? ent.mx : ((ent.rx || 10) * Math.cos(ent.rotation || 0));
      const my = ent.my != null ? ent.my : ((ent.rx || 10) * Math.sin(ent.rotation || 0));
      return [
        { entId: ent._id, kind: 'center', x: ent.cx || 0, y: ent.cy || 0 },
        { entId: ent._id, kind: 'major', x: (ent.cx || 0) + mx, y: (ent.cy || 0) + my }
      ];
    }
    if (ent.type === 'TEXT' || ent.type === 'INSERT' || ent.type === 'POINT') {
      return [{ entId: ent._id, kind: 'pos', x: ent.x || 0, y: ent.y || 0 }];
    }
    if (ent.type === 'DIMENSION') {
      return [
        { entId: ent._id, kind: 'p1', x: ent.x1 || 0, y: ent.y1 || 0 },
        { entId: ent._id, kind: 'p2', x: ent.x2 || 0, y: ent.y2 || 0 },
        { entId: ent._id, kind: 'text', x: ent.x || 0, y: ent.y || 0 }
      ];
    }
    return [];
  }

  function applyGripDrag(grip, wx, wy) {
    const parser = getActiveParser();
    if (!parser || !grip) return;
    const ent = parser.entities.find(e => e._id === grip.entId);
    if (!ent || isLayerLocked(parser, ent.layer)) return;
    if (ent.type === 'LINE') {
      if (grip.kind === 'p1') { ent.x1 = wx; ent.y1 = wy; }
      else if (grip.kind === 'p2') { ent.x2 = wx; ent.y2 = wy; }
      else if (grip.kind === 'mid') {
        const dx = wx - (ent.x1 + ent.x2) / 2;
        const dy = wy - (ent.y1 + ent.y2) / 2;
        ent.x1 += dx; ent.y1 += dy; ent.x2 += dx; ent.y2 += dy;
      }
    } else if (ent.type === 'CIRCLE') {
      if (grip.kind === 'center') { ent.cx = wx; ent.cy = wy; }
      else { ent.r = Math.max(0.1, Math.hypot(wx - ent.cx, wy - ent.cy)); }
    } else if (ent.type === 'ARC') {
      if (grip.kind === 'center') { ent.cx = wx; ent.cy = wy; }
      else if (grip.kind === 'start') {
        ent.startAngle = (Math.atan2(wy - ent.cy, wx - ent.cx) * 180 / Math.PI + 360) % 360;
      } else if (grip.kind === 'end') {
        ent.endAngle = (Math.atan2(wy - ent.cy, wx - ent.cx) * 180 / Math.PI + 360) % 360;
      }
    } else if (ent.type === 'ELLIPSE') {
      if (grip.kind === 'center') { ent.cx = wx; ent.cy = wy; }
      else if (grip.kind === 'major') {
        ent.mx = wx - (ent.cx || 0);
        ent.my = wy - (ent.cy || 0);
        ent.rx = Math.max(0.1, Math.hypot(ent.mx, ent.my));
        ent.ry = Math.max(0.05, ent.rx * (ent.ratio || 0.5));
        ent.rotation = Math.atan2(ent.my, ent.mx);
      }
    } else if ((ent.type === 'LWPOLYLINE' || ent.type === 'SPLINE' || ent.type === 'SOLID' || ent.type === 'HATCH') && grip.kind === 'vertex' && ent.points && ent.points[grip.vertexIndex]) {
      ent.points[grip.vertexIndex][0] = wx;
      ent.points[grip.vertexIndex][1] = wy;
      if (ent.type === 'HATCH' && Array.isArray(ent.loops) && ent.loops[0] && ent.loops[0][grip.vertexIndex]) {
        ent.loops[0][grip.vertexIndex][0] = wx;
        ent.loops[0][grip.vertexIndex][1] = wy;
        if (grip.vertexIndex === 0 && ent.loops[0].length > ent.points.length) {
          ent.loops[0][ent.loops[0].length - 1][0] = wx;
          ent.loops[0][ent.loops[0].length - 1][1] = wy;
        }
      }
    } else if (ent.type === 'TEXT' || ent.type === 'INSERT' || ent.type === 'POINT') {
      ent.x = wx; ent.y = wy;
    } else if (ent.type === 'DIMENSION') {
      if (grip.kind === 'p1') { ent.x1 = wx; ent.y1 = wy; }
      else if (grip.kind === 'p2') { ent.x2 = wx; ent.y2 = wy; }
      else if (grip.kind === 'text') { ent.x = wx; ent.y = wy; ent.textX = wx; ent.textY = wy; }
      delete ent.blockName;
      if (grip.kind !== 'text' && Number.isFinite(ent.x1) && Number.isFinite(ent.x2)) {
        const dist = Math.hypot(ent.x2 - ent.x1, ent.y2 - ent.y1);
        ent.measurement = dist;
        ent.text = `${Number(dist.toFixed(4))}`;
      }
    }
    syncGeom(ent);
  }

  // ==========================================================================
  // ENTITY GEOMETRY MUTATION & MODIFY TOOLS (MOVE, COPY, ROTATE, SCALE, MIRROR, OFFSET, TRIM, EXTEND, FILLET, EXPLODE)
  // ==========================================================================
  function cloneEntity(ent) {
    const copy = JSON.parse(JSON.stringify(ent, (k, v) => (k === '_normEnt' || k === '_diffSubIndices') ? undefined : v));
    copy._id = `ent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    copy.handle = Math.floor(Math.random() * 0xFFFFF).toString(16).toUpperCase();
    return syncGeom(copy);
  }

  function cloneAndTransformDimBlock(ent, parser, fn) {
    if (!ent || !ent.blockName || !parser || !parser.blocks) return false;
    const srcBlk = parser._getBlock ? parser._getBlock(ent.blockName) : parser.blocks[ent.blockName];
    if (!srcBlk || !Array.isArray(srcBlk.entities) || !srcBlk.entities.length) return false;
    const newName = `*D_XF_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const clonedEnts = srcBlk.entities.map(se => {
      const c = cloneEntity(se);
      fn(c);
      return c;
    });
    const newBlk = { name: newName, baseX: srcBlk.baseX || 0, baseY: srcBlk.baseY || 0, entities: clonedEnts };
    parser.blocks[newName] = newBlk;
    parser.blocks[newName.toUpperCase()] = newBlk;
    ent.blockName = newName;
    return true;
  }

  function mutatePointArraysSafe(ent, ptFn, isMirror = false) {
    // Guard against shared array/point references (e.g. ent.renderPoints === ent.points or ent.ctrlPoints === ent.points)
    // so LWPOLYLINE/HATCH/SOLID vertices are NEVER double-transformed!
    const seenPts = new Set();
    const visitPt = (p, flipBulge) => {
      if (!p || seenPts.has(p)) return;
      seenPts.add(p);
      if (Array.isArray(p)) {
        const [nx, ny] = ptFn(p[0], p[1]);
        p[0] = nx;
        p[1] = ny;
        if (flipBulge && p[2]) p[2] = -p[2];
      } else if (typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        const [nx, ny] = ptFn(p.x, p.y);
        p.x = nx;
        p.y = ny;
        if (flipBulge && p.bulge) p.bulge = -p.bulge;
      }
    };
    if (Array.isArray(ent.points)) ent.points.forEach(p => visitPt(p, isMirror));
    if (Array.isArray(ent.points3D)) ent.points3D.forEach(p => visitPt(p, false));
    if (Array.isArray(ent.loops)) ent.loops.forEach(lp => Array.isArray(lp) && lp.forEach(p => visitPt(p, false)));
    // Drop cached renderPoints so syncGeom(ent) regenerates exact bulges/splines without double-transform drift
    delete ent.renderPoints;
  }

  function translateEntity(ent, dx, dy, parser = null) {
    if (!ent) return;
    const pRef = parser || getActiveParser();
    if (ent.type === 'LINE') {
      ent.x1 += dx; ent.y1 += dy; ent.x2 += dx; ent.y2 += dy;
    } else if (ent.type === 'CIRCLE' || ent.type === 'ARC' || ent.type === 'ELLIPSE') {
      ent.cx += dx; ent.cy += dy;
    } else if (ent.type === 'LWPOLYLINE' || ent.type === 'SPLINE' || ent.type === 'SOLID' || ent.type === 'HATCH') {
      mutatePointArraysSafe(ent, (px, py) => [px + dx, py + dy], false);
    } else if (ent.type === 'TEXT') {
      ent.x = (ent.x || 0) + dx; ent.y = (ent.y || 0) + dy;
      if (Number.isFinite(ent.x2) && Number.isFinite(ent.y2)) { ent.x2 += dx; ent.y2 += dy; }
    } else if (ent.type === 'INSERT' || ent.type === 'POINT') {
      ent.x = (ent.x || 0) + dx; ent.y = (ent.y || 0) + dy;
    } else if (ent.type === 'DIMENSION') {
      if (Number.isFinite(ent.defX)) ent.defX += dx;
      if (Number.isFinite(ent.defY)) ent.defY += dy;
      if (Number.isFinite(ent.x)) ent.x += dx;
      if (Number.isFinite(ent.y)) ent.y += dy;
      if (Number.isFinite(ent.textX)) ent.textX += dx;
      if (Number.isFinite(ent.textY)) ent.textY += dy;
      if (Number.isFinite(ent.x1)) ent.x1 += dx;
      if (Number.isFinite(ent.y1)) ent.y1 += dy;
      if (Number.isFinite(ent.x2)) ent.x2 += dx;
      if (Number.isFinite(ent.y2)) ent.y2 += dy;
      if (ent.blockName && !cloneAndTransformDimBlock(ent, pRef, se => translateEntity(se, dx, dy, pRef))) {
        delete ent.blockName;
      }
    }
    syncGeom(ent);
  }

  function rotatePoint(x, y, cx, cy, rad) {
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = x - cx, dy = y - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
  }

  function rotateEntity(ent, cx, cy, angleDeg, parser = null) {
    const pRef = parser || getActiveParser();
    const rad = angleDeg * Math.PI / 180;
    if (ent.type === 'LINE') {
      [ent.x1, ent.y1] = rotatePoint(ent.x1, ent.y1, cx, cy, rad);
      [ent.x2, ent.y2] = rotatePoint(ent.x2, ent.y2, cx, cy, rad);
    } else if (ent.type === 'CIRCLE') {
      [ent.cx, ent.cy] = rotatePoint(ent.cx, ent.cy, cx, cy, rad);
    } else if (ent.type === 'ARC') {
      [ent.cx, ent.cy] = rotatePoint(ent.cx, ent.cy, cx, cy, rad);
      ent.startAngle = ((ent.startAngle || 0) + angleDeg + 360) % 360;
      ent.endAngle = ((ent.endAngle || 0) + angleDeg + 360) % 360;
    } else if (ent.type === 'ELLIPSE') {
      [ent.cx, ent.cy] = rotatePoint(ent.cx, ent.cy, cx, cy, rad);
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const mx = ent.mx != null ? ent.mx : ((ent.rx || 10) * Math.cos(ent.rotation || 0));
      const my = ent.my != null ? ent.my : ((ent.rx || 10) * Math.sin(ent.rotation || 0));
      ent.mx = mx * cos - my * sin;
      ent.my = mx * sin + my * cos;
      ent.rotation = Math.atan2(ent.my, ent.mx);
      ent.rx = Math.hypot(ent.mx, ent.my);
    } else if (ent.type === 'LWPOLYLINE' || ent.type === 'SPLINE' || ent.type === 'SOLID' || ent.type === 'HATCH') {
      mutatePointArraysSafe(ent, (px, py) => rotatePoint(px, py, cx, cy, rad), false);
    } else if (ent.type === 'TEXT') {
      [ent.x, ent.y] = rotatePoint(ent.x || 0, ent.y || 0, cx, cy, rad);
      if (Number.isFinite(ent.x2) && Number.isFinite(ent.y2)) [ent.x2, ent.y2] = rotatePoint(ent.x2, ent.y2, cx, cy, rad);
      ent.rotation = ((ent.rotation || 0) + angleDeg + 360) % 360;
    } else if (ent.type === 'INSERT' || ent.type === 'POINT') {
      [ent.x, ent.y] = rotatePoint(ent.x || 0, ent.y || 0, cx, cy, rad);
      ent.rotation = ((ent.rotation || 0) + angleDeg + 360) % 360;
    } else if (ent.type === 'DIMENSION') {
      if (Number.isFinite(ent.defX)) [ent.defX, ent.defY] = rotatePoint(ent.defX, ent.defY, cx, cy, rad);
      if (Number.isFinite(ent.x1)) [ent.x1, ent.y1] = rotatePoint(ent.x1, ent.y1, cx, cy, rad);
      if (Number.isFinite(ent.x2)) [ent.x2, ent.y2] = rotatePoint(ent.x2, ent.y2, cx, cy, rad);
      if (Number.isFinite(ent.x)) [ent.x, ent.y] = rotatePoint(ent.x, ent.y, cx, cy, rad);
      if (Number.isFinite(ent.textX)) [ent.textX, ent.textY] = rotatePoint(ent.textX, ent.textY, cx, cy, rad);
      if (ent.blockName && !cloneAndTransformDimBlock(ent, pRef, se => rotateEntity(se, cx, cy, angleDeg, pRef))) {
        delete ent.blockName;
      }
    }
    syncGeom(ent);
  }

  function scaleEntity(ent, cx, cy, factor, parser = null) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const pRef = parser || getActiveParser();
    const scPt = (x, y) => [cx + (x - cx) * factor, cy + (y - cy) * factor];
    if (ent.type === 'LINE') {
      [ent.x1, ent.y1] = scPt(ent.x1, ent.y1);
      [ent.x2, ent.y2] = scPt(ent.x2, ent.y2);
    } else if (ent.type === 'CIRCLE' || ent.type === 'ARC') {
      [ent.cx, ent.cy] = scPt(ent.cx, ent.cy);
      ent.r = Math.max(0.01, (ent.r || 1) * factor);
    } else if (ent.type === 'ELLIPSE') {
      [ent.cx, ent.cy] = scPt(ent.cx, ent.cy);
      ent.mx = (ent.mx != null ? ent.mx : ((ent.rx || 10) * Math.cos(ent.rotation || 0))) * factor;
      ent.my = (ent.my != null ? ent.my : ((ent.rx || 10) * Math.sin(ent.rotation || 0))) * factor;
      ent.rx = Math.hypot(ent.mx, ent.my);
      ent.ry = (ent.ry != null ? ent.ry * factor : ent.rx * (ent.ratio || 0.5));
      ent.rotation = Math.atan2(ent.my, ent.mx);
    } else if (ent.type === 'LWPOLYLINE' || ent.type === 'SPLINE' || ent.type === 'SOLID' || ent.type === 'HATCH') {
      mutatePointArraysSafe(ent, scPt, false);
    } else if (ent.type === 'TEXT') {
      [ent.x, ent.y] = scPt(ent.x || 0, ent.y || 0);
      if (Number.isFinite(ent.x2) && Number.isFinite(ent.y2)) [ent.x2, ent.y2] = scPt(ent.x2, ent.y2);
      ent.height = Math.max(0.01, (ent.height || 2.5) * factor);
      if (ent.boxWidth > 0) ent.boxWidth *= factor;
      if (ent.fitWidth > 0) ent.fitWidth *= factor;
    } else if (ent.type === 'INSERT') {
      [ent.x, ent.y] = scPt(ent.x || 0, ent.y || 0);
      ent.scaleX = (ent.scaleX || 1) * factor;
      ent.scaleY = (ent.scaleY || 1) * factor;
    } else if (ent.type === 'DIMENSION') {
      if (Number.isFinite(ent.defX)) [ent.defX, ent.defY] = scPt(ent.defX, ent.defY);
      if (Number.isFinite(ent.x1)) [ent.x1, ent.y1] = scPt(ent.x1, ent.y1);
      if (Number.isFinite(ent.x2)) [ent.x2, ent.y2] = scPt(ent.x2, ent.y2);
      if (Number.isFinite(ent.x)) [ent.x, ent.y] = scPt(ent.x, ent.y);
      if (Number.isFinite(ent.textX)) [ent.textX, ent.textY] = scPt(ent.textX, ent.textY);
      delete ent.blockName;
      if (Number.isFinite(ent.x1) && Number.isFinite(ent.x2)) {
        const dist = Math.hypot(ent.x2 - ent.x1, ent.y2 - ent.y1);
        ent.measurement = dist;
        ent.text = `${Number(dist.toFixed(4))}`;
      }
    }
    syncGeom(ent);
  }

  function mirrorPoint(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-9) return [px, py];
    const t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    const projX = x1 + t * dx, projY = y1 + t * dy;
    return [2 * projX - px, 2 * projY - py];
  }

  function mirrorEntity(ent, x1, y1, x2, y2, parser = null) {
    const pRef = parser || getActiveParser();
    const axisAngDeg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    if (ent.type === 'LINE') {
      [ent.x1, ent.y1] = mirrorPoint(ent.x1, ent.y1, x1, y1, x2, y2);
      [ent.x2, ent.y2] = mirrorPoint(ent.x2, ent.y2, x1, y1, x2, y2);
    } else if (ent.type === 'CIRCLE') {
      [ent.cx, ent.cy] = mirrorPoint(ent.cx, ent.cy, x1, y1, x2, y2);
    } else if (ent.type === 'ARC') {
      const a1 = (ent.startAngle || 0) * Math.PI / 180;
      const a2 = (ent.endAngle || 0) * Math.PI / 180;
      const [sx, sy] = mirrorPoint(ent.cx + ent.r * Math.cos(a1), ent.cy + ent.r * Math.sin(a1), x1, y1, x2, y2);
      const [ex, ey] = mirrorPoint(ent.cx + ent.r * Math.cos(a2), ent.cy + ent.r * Math.sin(a2), x1, y1, x2, y2);
      [ent.cx, ent.cy] = mirrorPoint(ent.cx, ent.cy, x1, y1, x2, y2);
      ent.startAngle = (Math.atan2(ey - ent.cy, ex - ent.cx) * 180 / Math.PI + 360) % 360;
      ent.endAngle = (Math.atan2(sy - ent.cy, sx - ent.cx) * 180 / Math.PI + 360) % 360;
    } else if (ent.type === 'ELLIPSE') {
      const mx = ent.mx != null ? ent.mx : ((ent.rx || 10) * Math.cos(ent.rotation || 0));
      const my = ent.my != null ? ent.my : ((ent.rx || 10) * Math.sin(ent.rotation || 0));
      const [mcx, mcy] = mirrorPoint(ent.cx, ent.cy, x1, y1, x2, y2);
      const [mex, mey] = mirrorPoint(ent.cx + mx, ent.cy + my, x1, y1, x2, y2);
      ent.cx = mcx; ent.cy = mcy;
      ent.mx = mex - mcx; ent.my = mey - mcy;
      ent.rotation = Math.atan2(ent.my, ent.mx);
      ent.rx = Math.hypot(ent.mx, ent.my);
    } else if (ent.type === 'LWPOLYLINE' || ent.type === 'SPLINE' || ent.type === 'SOLID' || ent.type === 'HATCH') {
      mutatePointArraysSafe(ent, (px, py) => mirrorPoint(px, py, x1, y1, x2, y2), true);
    } else if (ent.type === 'INSERT') {
      [ent.x, ent.y] = mirrorPoint(ent.x || 0, ent.y || 0, x1, y1, x2, y2);
      ent.scaleX = -(ent.scaleX || 1);
      ent.rotation = (((2 * axisAngDeg - (ent.rotation || 0)) % 360) + 360) % 360;
    } else if (ent.type === 'TEXT') {
      [ent.x, ent.y] = mirrorPoint(ent.x || 0, ent.y || 0, x1, y1, x2, y2);
      if (Number.isFinite(ent.x2) && Number.isFinite(ent.y2)) [ent.x2, ent.y2] = mirrorPoint(ent.x2, ent.y2, x1, y1, x2, y2);
      ent.rotation = (((2 * axisAngDeg - (ent.rotation || 0)) % 360) + 360) % 360;
    } else if (ent.type === 'POINT') {
      [ent.x, ent.y] = mirrorPoint(ent.x || 0, ent.y || 0, x1, y1, x2, y2);
    } else if (ent.type === 'DIMENSION') {
      if (Number.isFinite(ent.defX)) [ent.defX, ent.defY] = mirrorPoint(ent.defX, ent.defY, x1, y1, x2, y2);
      if (Number.isFinite(ent.x1)) [ent.x1, ent.y1] = mirrorPoint(ent.x1, ent.y1, x1, y1, x2, y2);
      if (Number.isFinite(ent.x2)) [ent.x2, ent.y2] = mirrorPoint(ent.x2, ent.y2, x1, y1, x2, y2);
      if (Number.isFinite(ent.x)) [ent.x, ent.y] = mirrorPoint(ent.x, ent.y, x1, y1, x2, y2);
      if (Number.isFinite(ent.textX)) [ent.textX, ent.textY] = mirrorPoint(ent.textX, ent.textY, x1, y1, x2, y2);
      if (ent.blockName && !cloneAndTransformDimBlock(ent, pRef, se => mirrorEntity(se, x1, y1, x2, y2, pRef))) {
        delete ent.blockName;
      }
    }
    syncGeom(ent);
  }

  function createOffsetEntity(ent, sidePt, dist) {
    const d = Math.abs(dist || StudioState.offsetDistance || 5);
    if (ent.type === 'LINE') {
      const dx = ent.x2 - ent.x1, dy = ent.y2 - ent.y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return null;
      let nx = -dy / len, ny = dx / len;
      const side = (sidePt.x - ent.x1) * nx + (sidePt.y - ent.y1) * ny;
      if (side < 0) { nx = -nx; ny = -ny; }
      const copy = cloneEntity(ent);
      copy.x1 += nx * d; copy.y1 += ny * d;
      copy.x2 += nx * d; copy.y2 += ny * d;
      return syncGeom(copy);
    }
    if (ent.type === 'CIRCLE' || ent.type === 'ARC') {
      const curR = ent.r || 10;
      const clickR = Math.hypot(sidePt.x - ent.cx, sidePt.y - ent.cy);
      const nextR = clickR >= curR ? curR + d : Math.max(0.2, curR - d);
      const copy = cloneEntity(ent);
      copy.r = nextR;
      return syncGeom(copy);
    }
    if (ent.type === 'LWPOLYLINE' && Array.isArray(ent.points) && ent.points.length >= 2) {
      const pts = ent.points;
      const n = pts.length;
      const isClosed = !!ent.closed && n >= 3;
      let cx = 0, cy = 0;
      pts.forEach(p => { cx += p[0]; cy += p[1]; });
      cx /= n; cy /= n;
      // Determine signed area / winding and whether sidePt is outside or inside
      let bestSegIdx = 0, bestSegDist = Infinity;
      const segCount = isClosed ? n : n - 1;
      for (let i = 0; i < segCount; i++) {
        const p1 = pts[i], p2 = pts[(i + 1) % n];
        const sd = distToSegment(sidePt.x, sidePt.y, p1[0], p1[1], p2[0], p2[1]);
        if (sd < bestSegDist) { bestSegDist = sd; bestSegIdx = i; }
      }
      const sp1 = pts[bestSegIdx], sp2 = pts[(bestSegIdx + 1) % n];
      const sdx = sp2[0] - sp1[0], sdy = sp2[1] - sp1[1];
      const slen = Math.hypot(sdx, sdy) || 1;
      const snx = -sdy / slen, sny = sdx / slen;
      const sideDot = (sidePt.x - sp1[0]) * snx + (sidePt.y - sp1[1]) * sny;
      const dirSign = sideDot >= 0 ? 1 : -1;

      const offsetLines = [];
      for (let i = 0; i < segCount; i++) {
        const p1 = pts[i], p2 = pts[(i + 1) % n];
        const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * dirSign, ny = (dx / len) * dirSign;
        offsetLines.push({
          x1: p1[0] + nx * d, y1: p1[1] + ny * d,
          x2: p2[0] + nx * d, y2: p2[1] + ny * d,
          nx, ny, bulge: p1[2] || 0
        });
      }
      const newPts = [];
      for (let i = 0; i < n; i++) {
        if (!isClosed && i === 0) {
          newPts.push([offsetLines[0].x1, offsetLines[0].y1, pts[0][2] || 0]);
        } else if (!isClosed && i === n - 1) {
          const lastL = offsetLines[offsetLines.length - 1];
          newPts.push([lastL.x2, lastL.y2, pts[n - 1][2] || 0]);
        } else {
          const prevL = offsetLines[(i - 1 + segCount) % segCount];
          const currL = offsetLines[i % segCount];
          const ix = lineLineIntersection(prevL.x1, prevL.y1, prevL.x2, prevL.y2, currL.x1, currL.y1, currL.x2, currL.y2, true);
          if (ix && Math.hypot(ix.x - prevL.x2, ix.y - prevL.y2) <= d * 4) {
            newPts.push([ix.x, ix.y, pts[i][2] || 0]);
          } else {
            newPts.push([(prevL.x2 + currL.x1) * 0.5, (prevL.y2 + currL.y1) * 0.5, pts[i][2] || 0]);
          }
        }
      }
      const copy = cloneEntity(ent);
      copy.points = newPts;
      delete copy.renderPoints;
      return syncGeom(copy);
    }
    return null;
  }

  function explodeEntity(ent, parser) {
    if (!ent || !parser) return [];
    const results = [];
    if (ent.type === 'LWPOLYLINE' && Array.isArray(ent.points) && ent.points.length >= 2) {
      const n = ent.points.length;
      const segs = ent.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const p1 = ent.points[i];
        const p2 = ent.points[(i + 1) % n];
        const bulge = p1[2] || (ent.bulges && ent.bulges[i]) || 0;
        const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
        const chord = Math.hypot(dx, dy);
        if (Math.abs(bulge) > 1e-6 && chord > 1e-6) {
          const theta = 4 * Math.atan(bulge);
          const radius = Math.abs(chord / (2 * Math.sin(theta / 2)));
          const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
          const d = Math.sqrt(Math.max(0, radius * radius - (chord * chord) / 4));
          const sign = (bulge > 0 ? 1 : -1) * (Math.abs(bulge) <= 1 ? 1 : -1);
          const nx = -dy / chord, ny = dx / chord;
          const cx = mx + sign * d * nx;
          const cy = my + sign * d * ny;
          const a1 = (Math.atan2(p1[1] - cy, p1[0] - cx) * 180 / Math.PI + 360) % 360;
          const a2 = (Math.atan2(p2[1] - cy, p2[0] - cx) * 180 / Math.PI + 360) % 360;
          results.push(syncGeom({
            _id: `ent_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'ARC',
            layer: ent.layer || '0',
            color: ent.color ?? null,
            trueColor: ent.trueColor ?? null,
            customHex: ent.customHex || null,
            linetype: ent.linetype || 'BYLAYER',
            lineweight: ent.lineweight ?? -1,
            cx, cy, r: radius,
            startAngle: bulge > 0 ? a1 : a2,
            endAngle: bulge > 0 ? a2 : a1
          }));
        } else if (chord > 1e-6) {
          results.push(syncGeom({
            _id: `ent_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'LINE',
            layer: ent.layer || '0',
            color: ent.color ?? null,
            trueColor: ent.trueColor ?? null,
            customHex: ent.customHex || null,
            linetype: ent.linetype || 'BYLAYER',
            lineweight: ent.lineweight ?? -1,
            x1: p1[0], y1: p1[1],
            x2: p2[0], y2: p2[1]
          }));
        }
      }
      return results;
    }
    if ((ent.type === 'SOLID' || ent.type === 'HATCH') && Array.isArray(ent.points) && ent.points.length >= 2) {
      const n = ent.points.length;
      for (let i = 0; i < n; i++) {
        const p1 = ent.points[i], p2 = ent.points[(i + 1) % n];
        if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) > 1e-6) {
          results.push(syncGeom({
            _id: `ent_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'LINE',
            layer: ent.layer || '0',
            color: ent.color ?? null,
            trueColor: ent.trueColor ?? null,
            customHex: ent.customHex || null,
            linetype: ent.linetype || 'BYLAYER',
            lineweight: ent.lineweight ?? -1,
            x1: p1[0], y1: p1[1],
            x2: p2[0], y2: p2[1]
          }));
        }
      }
      return results;
    }
    if ((ent.type === 'INSERT' || ent.type === 'DIMENSION') && ent.blockName && parser) {
      const blk = parser._getBlock ? parser._getBlock(ent.blockName) : (parser.blocks && (parser.blocks[ent.blockName] || parser.blocks[String(ent.blockName).toUpperCase()]));
      if (blk && Array.isArray(blk.entities)) {
        const sx = ent.scaleX || 1, sy = ent.scaleY || 1;
        const bx = blk.baseX || 0, by = blk.baseY || 0;
        const isDimBlk = ent.type === 'DIMENSION' || /^\*D/i.test(ent.blockName || '');
        for (const sub of blk.entities) {
          if (!sub || (isDimBlk && sub.type === 'POINT')) continue;
          const copy = cloneEntity(sub);
          if (!copy.layer || copy.layer === '0') copy.layer = ent.layer || '0';
          if (!copy.color && !copy.customHex) {
            copy.color = ent.color ?? null;
            copy.trueColor = ent.trueColor ?? null;
            copy.customHex = ent.customHex || null;
          }
          if (ent.type === 'INSERT') {
            if (sx < 0) mirrorEntity(copy, bx, by, bx, by + 10);
            if (sy < 0) mirrorEntity(copy, bx, by, bx + 10, by);
            const avgScale = (Math.abs(sx) + Math.abs(sy)) * 0.5;
            if (Math.abs(avgScale - 1) > 1e-4) scaleEntity(copy, bx, by, avgScale);
            if (Math.abs(ent.rotation || 0) > 1e-4) rotateEntity(copy, bx, by, ent.rotation || 0);
            translateEntity(copy, (ent.x || 0) - bx, (ent.y || 0) - by);
          }
          results.push(syncGeom(copy));
        }
        return results;
      }
    }
    return [];
  }

  function lineLineIntersection(x1, y1, x2, y2, x3, y3, x4, y4, infinite = false) {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    if (!infinite && (t < -1e-4 || t > 1 + 1e-4 || u < -1e-4 || u > 1 + 1e-4)) return null;
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), t, u };
  }

  function lineCircleIntersections(x1, y1, x2, y2, cx, cy, r, startAngle = null, endAngle = null) {
    const dx = x2 - x1, dy = y2 - y1;
    const fx = x1 - cx, fy = y1 - cy;
    const a = dx * dx + dy * dy;
    if (a < 1e-9 || r <= 1e-6) return [];
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return [];
    const sq = Math.sqrt(Math.max(0, disc));
    const tCandidates = [(-b - sq) / (2 * a), (-b + sq) / (2 * a)];
    const hits = [];
    for (const t of tCandidates) {
      const ix = x1 + t * dx, iy = y1 + t * dy;
      if (startAngle != null && endAngle != null) {
        let ang = (Math.atan2(iy - cy, ix - cx) * 180 / Math.PI + 360) % 360;
        let s = ((startAngle % 360) + 360) % 360;
        let e = ((endAngle % 360) + 360) % 360;
        if (e <= s) e += 360;
        if (ang < s) ang += 360;
        if (ang < s - 1e-2 || ang > e + 1e-2) continue;
      }
      hits.push({ x: ix, y: iy, t });
    }
    return hits;
  }

  function trimEntityAtPoint(ent, wx, wy, parser) {
    if (!ent || !parser || isLayerLocked(parser, ent.layer)) return false;
    if (ent.type === 'LWPOLYLINE' && Array.isArray(ent.points) && ent.points.length >= 2) {
      const parts = explodeEntity(ent, parser);
      const lineParts = parts.filter(p => p && p.type === 'LINE');
      if (lineParts.length) {
        const closest = lineParts.reduce((best, p) => {
          const d = distToSegment(wx, wy, p.x1, p.y1, p.x2, p.y2);
          return (!best || d < best.d) ? { p, d } : best;
        }, null);
        if (closest && closest.p) {
          const idx = parser.entities.indexOf(ent);
          if (idx !== -1) parser.entities.splice(idx, 1, ...parts);
          const trimmed = trimEntityAtPoint(closest.p, wx, wy, parser);
          if (!trimmed && idx !== -1) {
            const removeSet = new Set(parts);
            parser.entities = parser.entities.filter(e => !removeSet.has(e));
            parser.entities.splice(Math.min(idx, parser.entities.length), 0, ent);
          }
          return trimmed;
        }
      }
      return false;
    }
    if (ent.type === 'LINE') {
      const ts = [0, 1];
      for (const other of parser.entities) {
        if (other._id === ent._id || !isLayerVisible(parser, other.layer)) continue;
        if (other.type === 'LINE') {
          const ix = lineLineIntersection(ent.x1, ent.y1, ent.x2, ent.y2, other.x1, other.y1, other.x2, other.y2, false);
          if (ix && ix.t > 0.01 && ix.t < 0.99) ts.push(ix.t);
        } else if (other.type === 'LWPOLYLINE' && Array.isArray(other.points)) {
          const n = other.points.length;
          const cnt = other.closed ? n : n - 1;
          for (let i = 0; i < cnt; i++) {
            const p1 = other.points[i], p2 = other.points[(i + 1) % n];
            const ix = lineLineIntersection(ent.x1, ent.y1, ent.x2, ent.y2, p1[0], p1[1], p2[0], p2[1], false);
            if (ix && ix.t > 0.01 && ix.t < 0.99) ts.push(ix.t);
          }
        } else if (other.type === 'CIRCLE' || other.type === 'ARC') {
          const cHits = lineCircleIntersections(
            ent.x1, ent.y1, ent.x2, ent.y2,
            other.cx, other.cy, other.r,
            other.type === 'ARC' ? (other.startAngle || 0) : null,
            other.type === 'ARC' ? (other.endAngle ?? 360) : null
          );
          for (const ch of cHits) {
            if (ch.t > 0.01 && ch.t < 0.99) ts.push(ch.t);
          }
        }
      }
      ts.sort((a, b) => a - b);
      if (ts.length <= 2) {
        const d1 = Math.hypot(wx - ent.x1, wy - ent.y1);
        const d2 = Math.hypot(wx - ent.x2, wy - ent.y2);
        const mx = (ent.x1 + ent.x2) / 2, my = (ent.y1 + ent.y2) / 2;
        if (d1 < d2) { ent.x1 = mx; ent.y1 = my; }
        else { ent.x2 = mx; ent.y2 = my; }
        syncGeom(ent);
        return true;
      }
      const dx = ent.x2 - ent.x1, dy = ent.y2 - ent.y1;
      const lenSq = dx * dx + dy * dy;
      const clickT = Math.max(0, Math.min(1, ((wx - ent.x1) * dx + (wy - ent.y1) * dy) / lenSq));
      let segIdx = 0;
      for (let i = 0; i < ts.length - 1; i++) {
        if (clickT >= ts[i] && clickT <= ts[i + 1]) { segIdx = i; break; }
      }
      const tStart = ts[segIdx], tEnd = ts[segIdx + 1];
      if (segIdx === 0) {
        ent.x1 = ent.x1 + tEnd * dx;
        ent.y1 = ent.y1 + tEnd * dy;
      } else if (segIdx === ts.length - 2) {
        ent.x2 = ent.x1 + tStart * dx;
        ent.y2 = ent.y1 + tStart * dy;
      } else {
        const origX2 = ent.x2, origY2 = ent.y2;
        const origX1 = ent.x1, origY1 = ent.y1;
        ent.x2 = origX1 + tStart * dx;
        ent.y2 = origY1 + tStart * dy;
        const secondHalf = cloneEntity(ent);
        secondHalf.x1 = origX1 + tEnd * dx;
        secondHalf.y1 = origY1 + tEnd * dy;
        secondHalf.x2 = origX2;
        secondHalf.y2 = origY2;
        parser.entities.push(syncGeom(secondHalf));
      }
      syncGeom(ent);
      return true;
    }
    return false;
  }

  function extendEntityAtPoint(ent, wx, wy, parser) {
    if (!ent || ent.type !== 'LINE' || !parser || isLayerLocked(parser, ent.layer)) return false;
    const d1 = Math.hypot(wx - ent.x1, wy - ent.y1);
    const d2 = Math.hypot(wx - ent.x2, wy - ent.y2);
    const extendEnd2 = d2 <= d1;
    const sx = extendEnd2 ? ent.x1 : ent.x2;
    const sy = extendEnd2 ? ent.y1 : ent.y2;
    const ex = extendEnd2 ? ent.x2 : ent.x1;
    const ey = extendEnd2 ? ent.y2 : ent.y1;

    let bestT = Infinity;
    let bestPt = null;
    for (const other of parser.entities) {
      if (other._id === ent._id || !isLayerVisible(parser, other.layer)) continue;
      if (other.type === 'LINE') {
        const ix = lineLineIntersection(sx, sy, ex, ey, other.x1, other.y1, other.x2, other.y2, true);
        if (ix && ix.t > 1.001 && ix.u >= -1e-4 && ix.u <= 1.0001 && ix.t < bestT) {
          bestT = ix.t;
          bestPt = { x: ix.x, y: ix.y };
        }
      } else if (other.type === 'LWPOLYLINE' && Array.isArray(other.points)) {
        const n = other.points.length;
        const cnt = other.closed ? n : n - 1;
        for (let i = 0; i < cnt; i++) {
          const p1 = other.points[i], p2 = other.points[(i + 1) % n];
          const ix = lineLineIntersection(sx, sy, ex, ey, p1[0], p1[1], p2[0], p2[1], true);
          if (ix && ix.t > 1.001 && ix.u >= -1e-4 && ix.u <= 1.0001 && ix.t < bestT) {
            bestT = ix.t;
            bestPt = { x: ix.x, y: ix.y };
          }
        }
      } else if (other.type === 'CIRCLE' || other.type === 'ARC') {
        const cHits = lineCircleIntersections(
          sx, sy, ex, ey,
          other.cx, other.cy, other.r,
          other.type === 'ARC' ? (other.startAngle || 0) : null,
          other.type === 'ARC' ? (other.endAngle ?? 360) : null
        );
        for (const ch of cHits) {
          if (ch.t > 1.001 && ch.t < bestT) {
            bestT = ch.t;
            bestPt = { x: ch.x, y: ch.y };
          }
        }
      }
    }
    if (bestPt) {
      if (extendEnd2) { ent.x2 = bestPt.x; ent.y2 = bestPt.y; }
      else { ent.x1 = bestPt.x; ent.y1 = bestPt.y; }
      syncGeom(ent);
      return true;
    }
    const dx = ex - sx, dy = ey - sy;
    if (extendEnd2) { ent.x2 += dx * 0.25; ent.y2 += dy * 0.25; }
    else { ent.x1 += dx * 0.25; ent.y1 += dy * 0.25; }
    syncGeom(ent);
    return true;
  }

  /**
   * True AutoCAD Tangent-Arc Fillet (when radius > 0) or Sharp Corner Join (when radius === 0)
   */
  function filletTwoLines(line1, line2, radius, parser) {
    if (!line1 || !line2 || line1.type !== 'LINE' || line2.type !== 'LINE' || !parser) return false;
    if (isLayerLocked(parser, line1.layer) || isLayerLocked(parser, line2.layer)) return false;
    const ix = lineLineIntersection(line1.x1, line1.y1, line1.x2, line1.y2, line2.x1, line2.y1, line2.x2, line2.y2, true);
    if (!ix) return false;

    const r = Math.max(0, Number(radius) || 0);
    // Determine the far endpoints of line1 and line2 relative to intersection ix
    const d1a = Math.hypot(line1.x1 - ix.x, line1.y1 - ix.y);
    const d1b = Math.hypot(line1.x2 - ix.x, line1.y2 - ix.y);
    const far1 = d1a >= d1b ? { x: line1.x1, y: line1.y1, trimP2: true } : { x: line1.x2, y: line1.y2, trimP2: false };

    const d2a = Math.hypot(line2.x1 - ix.x, line2.y1 - ix.y);
    const d2b = Math.hypot(line2.x2 - ix.x, line2.y2 - ix.y);
    const far2 = d2a >= d2b ? { x: line2.x1, y: line2.y1, trimP2: true } : { x: line2.x2, y: line2.y2, trimP2: false };

    if (r <= 1e-4) {
      if (far1.trimP2) { line1.x2 = ix.x; line1.y2 = ix.y; } else { line1.x1 = ix.x; line1.y1 = ix.y; }
      if (far2.trimP2) { line2.x2 = ix.x; line2.y2 = ix.y; } else { line2.x1 = ix.x; line2.y1 = ix.y; }
      syncGeom(line1);
      syncGeom(line2);
      return true;
    }

    const v1x = far1.x - ix.x, v1y = far1.y - ix.y;
    const len1 = Math.hypot(v1x, v1y);
    const v2x = far2.x - ix.x, v2y = far2.y - ix.y;
    const len2 = Math.hypot(v2x, v2y);
    if (len1 < 1e-4 || len2 < 1e-4) return false;

    const u1x = v1x / len1, u1y = v1y / len1;
    const u2x = v2x / len2, u2y = v2y / len2;
    const cosAng = Math.max(-0.999, Math.min(0.999, u1x * u2x + u1y * u2y));
    const halfAngle = Math.acos(cosAng) / 2;
    const tanDist = r / Math.tan(halfAngle);

    if (tanDist > len1 * 0.95 || tanDist > len2 * 0.95) {
      // Fallback to sharp corner if radius is too large for segment lengths
      if (far1.trimP2) { line1.x2 = ix.x; line1.y2 = ix.y; } else { line1.x1 = ix.x; line1.y1 = ix.y; }
      if (far2.trimP2) { line2.x2 = ix.x; line2.y2 = ix.y; } else { line2.x1 = ix.x; line2.y1 = ix.y; }
      syncGeom(line1);
      syncGeom(line2);
      return true;
    }

    const t1x = ix.x + u1x * tanDist, t1y = ix.y + u1y * tanDist;
    const t2x = ix.x + u2x * tanDist, t2y = ix.y + u2y * tanDist;

    if (far1.trimP2) { line1.x2 = t1x; line1.y2 = t1y; } else { line1.x1 = t1x; line1.y1 = t1y; }
    if (far2.trimP2) { line2.x2 = t2x; line2.y2 = t2y; } else { line2.x1 = t2x; line2.y1 = t2y; }
    syncGeom(line1);
    syncGeom(line2);

    // Bisector direction for arc center
    let bx = u1x + u2x, by = u1y + u2y;
    const bLen = Math.hypot(bx, by) || 1;
    bx /= bLen; by /= bLen;
    const centerDist = r / Math.sin(halfAngle);
    const cx = ix.x + bx * centerDist;
    const cy = ix.y + by * centerDist;

    const ang1 = (Math.atan2(t1y - cy, t1x - cx) * 180 / Math.PI + 360) % 360;
    const ang2 = (Math.atan2(t2y - cy, t2x - cx) * 180 / Math.PI + 360) % 360;
    const diffCCW = (ang2 - ang1 + 360) % 360;
    const startAngle = diffCCW <= 180 ? ang1 : ang2;
    const endAngle = diffCCW <= 180 ? ang2 : ang1;

    parser.entities.push(syncGeom({
      _id: `ent_${Date.now()}_fillet_${Math.random().toString(36).slice(2, 6)}`,
      type: 'ARC',
      layer: line1.layer || StudioState.currentLayer || '0',
      color: line1.color ?? null,
      trueColor: line1.trueColor ?? null,
      customHex: line1.customHex || null,
      linetype: line1.linetype || 'BYLAYER',
      lineweight: line1.lineweight ?? -1,
      cx,
      cy,
      r,
      startAngle,
      endAngle
    }));
    return true;
  }

  /**
   * True AutoCAD CHAMFER between two intersecting LINE entities with Distances D1 and D2
   */
  function chamferTwoLines(line1, line2, d1, d2, parser) {
    if (!line1 || !line2 || line1.type !== 'LINE' || line2.type !== 'LINE' || !parser) return false;
    if (isLayerLocked(parser, line1.layer) || isLayerLocked(parser, line2.layer)) return false;
    const ix = lineLineIntersection(line1.x1, line1.y1, line1.x2, line1.y2, line2.x1, line2.y1, line2.x2, line2.y2, true);
    if (!ix) return false;
    const dist1 = Math.max(0, Number(d1 != null ? d1 : StudioState.chamferDist1) || 0);
    const dist2 = Math.max(0, Number(d2 != null ? d2 : StudioState.chamferDist2) || dist1);

    const d1a = Math.hypot(line1.x1 - ix.x, line1.y1 - ix.y);
    const d1b = Math.hypot(line1.x2 - ix.x, line1.y2 - ix.y);
    const far1 = d1a >= d1b ? { x: line1.x1, y: line1.y1, trimP2: true } : { x: line1.x2, y: line1.y2, trimP2: false };

    const d2a = Math.hypot(line2.x1 - ix.x, line2.y1 - ix.y);
    const d2b = Math.hypot(line2.x2 - ix.x, line2.y2 - ix.y);
    const far2 = d2a >= d2b ? { x: line2.x1, y: line2.y1, trimP2: true } : { x: line2.x2, y: line2.y2, trimP2: false };

    const len1 = Math.hypot(far1.x - ix.x, far1.y - ix.y);
    const len2 = Math.hypot(far2.x - ix.x, far2.y - ix.y);
    if (len1 < 1e-4 || len2 < 1e-4) return false;

    const effD1 = Math.min(dist1, len1 * 0.9);
    const effD2 = Math.min(dist2, len2 * 0.9);
    const u1x = (far1.x - ix.x) / len1, u1y = (far1.y - ix.y) / len1;
    const u2x = (far2.x - ix.x) / len2, u2y = (far2.y - ix.y) / len2;

    const c1x = ix.x + u1x * effD1, c1y = ix.y + u1y * effD1;
    const c2x = ix.x + u2x * effD2, c2y = ix.y + u2y * effD2;

    if (far1.trimP2) { line1.x2 = c1x; line1.y2 = c1y; } else { line1.x1 = c1x; line1.y1 = c1y; }
    if (far2.trimP2) { line2.x2 = c2x; line2.y2 = c2y; } else { line2.x1 = c2x; line2.y1 = c2y; }
    syncGeom(line1);
    syncGeom(line2);

    if (effD1 > 1e-4 || effD2 > 1e-4) {
      const bev = syncGeom({
        ...createBaseEntityProps('LINE'),
        layer: line1.layer || StudioState.currentLayer || '0',
        color: line1.color ?? null,
        customHex: line1.customHex || null,
        x1: c1x, y1: c1y,
        x2: c2x, y2: c2y
      });
      parser.entities.push(bev);
    }
    return true;
  }

  /**
   * Create Regular N-Sided AutoCAD Polygon (3 .. 36 sides)
   */
  function buildTrianglePoints(x0, y0, width, height, triType = 'isosceles') {
    const w = Math.max(0.1, Math.abs(Number(width) || 60));
    const tType = triType || StudioState.triangleType || 'isosceles';
    const h = tType === 'equilateral'
      ? (w * Math.sqrt(3) / 2)
      : Math.max(0.1, Math.abs(Number(height) || 50));
    const sgnX = (Number(width) < 0) ? -1 : 1;
    const sgnY = (Number(height) < 0) ? -1 : 1;
    const x1 = x0;
    const x2 = x0 + w * sgnX;
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const baseY = y0;
    const apexY = y0 + h * sgnY;
    let apexX = (minX + maxX) * 0.5;
    if (tType === 'right-left') apexX = minX;
    else if (tType === 'right-right') apexX = maxX;
    return [
      [minX, baseY, 0],
      [maxX, baseY, 0],
      [apexX, apexY, 0]
    ];
  }

  function createTriangleEntity(x0, y0, width = null, height = null, triType = null) {
    const tType = triType || StudioState.triangleType || 'isosceles';
    const w = width != null ? Number(width) : (StudioState.triangleWidth || 60);
    const h = height != null ? Number(height) : (StudioState.triangleHeight || 50);
    const pts = buildTrianglePoints(x0, y0, w, h, tType);
    return syncGeom({
      ...createBaseEntityProps('LWPOLYLINE'),
      closed: true,
      _shapeKind: 'triangle',
      triType: tType,
      elevation: StudioState.defaultElevation || 0,
      thickness: StudioState.defaultThickness || 0,
      points: pts
    });
  }

  function detectShapeKind(ent) {
    if (!ent || ent.type !== 'LWPOLYLINE' || !ent.closed || !Array.isArray(ent.points)) return null;
    if (ent.points.length === 3) return 'triangle';
    if (ent.points.length === 4) {
      const xs = ent.points.map(p => p[0]), ys = ent.points.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const tol = Math.max(1e-3, Math.max(maxX - minX, maxY - minY) * 1e-4);
      const isAxisRect = ent.points.every(p =>
        (Math.abs(p[0] - minX) <= tol || Math.abs(p[0] - maxX) <= tol) &&
        (Math.abs(p[1] - minY) <= tol || Math.abs(p[1] - maxY) <= tol)
      );
      if (isAxisRect && (maxX - minX) > 1e-4 && (maxY - minY) > 1e-4) return 'rect';
    }
    return null;
  }

  function resizeTriangleEntity(ent, newW, newH, newType = null) {
    if (!ent || !Array.isArray(ent.points) || ent.points.length !== 3) return false;
    const xs = ent.points.map(p => p[0]), ys = ent.points.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const curW = Math.max(0.1, maxX - minX);
    const curH = Math.max(0.1, maxY - minY);
    const w = Math.max(0.1, Number.isFinite(Number(newW)) && Number(newW) > 0 ? Number(newW) : curW);
    const tType = newType || ent.triType || 'isosceles';
    const h = tType === 'equilateral'
      ? (w * Math.sqrt(3) / 2)
      : Math.max(0.1, Number.isFinite(Number(newH)) && Number(newH) > 0 ? Number(newH) : curH);
    const cx = (minX + maxX) * 0.5;
    ent.triType = tType;
    ent._shapeKind = 'triangle';
    ent.points = buildTrianglePoints(cx - w * 0.5, minY, w, h, tType);
    syncGeom(ent);
    return true;
  }

  function resizeRectEntity(ent, newW, newH) {
    if (!ent || !Array.isArray(ent.points) || ent.points.length !== 4) return false;
    const xs = ent.points.map(p => p[0]), ys = ent.points.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = Math.max(0.1, Number.isFinite(Number(newW)) && Number(newW) > 0 ? Number(newW) : (maxX - minX));
    const h = Math.max(0.1, Number.isFinite(Number(newH)) && Number(newH) > 0 ? Number(newH) : (maxY - minY));
    ent.points = [
      [minX, minY, 0],
      [minX + w, minY, 0],
      [minX + w, minY + h, 0],
      [minX, minY + h, 0]
    ];
    syncGeom(ent);
    return true;
  }

  function setActiveLineweight(lwVal, applyToSelection = true) {
    const v = parseInt(lwVal, 10);
    if (!Number.isFinite(v)) return;
    StudioState.activeLineweight = v;
    if ($('#dxf-st-lw-sel')) $('#dxf-st-lw-sel').value = String(v);
    if ($('#dxf-st-lw-sel-lyr')) $('#dxf-st-lw-sel-lyr').value = String(v);
    const p = getActiveParser();
    if (applyToSelection && p && StudioState.selectedIds.size > 0) {
      const sel = p.entities.filter(ent => StudioState.selectedIds.has(ent._id) && !isLayerLocked(p, ent.layer));
      if (sel.length) {
        pushUndoSnapshot('Change Entity Thickness / Lineweight');
        sel.forEach(ent => { ent.lineweight = v; });
        syncParserMutation();
        refreshAllUI();
        return;
      }
    }
    renderCanvas();
  }

  function setDefaultThickness(thkVal, applyToSelection = true) {
    const v = parseFloat(thkVal);
    if (!Number.isFinite(v)) return;
    StudioState.defaultThickness = v;
    if ($('#dxf-st-thk-val')) $('#dxf-st-thk-val').value = String(v);
    const p = getActiveParser();
    if (applyToSelection && p && StudioState.selectedIds.size > 0) {
      const sel = p.entities.filter(ent => StudioState.selectedIds.has(ent._id) && !isLayerLocked(p, ent.layer));
      if (sel.length) {
        pushUndoSnapshot('Change Entity 3D Thickness');
        sel.forEach(ent => { ent.thickness = v; });
        syncParserMutation();
        refreshAllUI();
        return;
      }
    }
    renderCanvas();
  }

  function createRegularPolygon(cx, cy, radiusPtX, radiusPtY, sides = 6) {
    const n = Math.max(3, Math.min(36, parseInt(sides || StudioState.polygonSides || 6, 10) || 6));
    const r = Math.max(0.2, Math.hypot(radiusPtX - cx, radiusPtY - cy));
    const startAng = Math.atan2(radiusPtY - cy, radiusPtX - cx);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const ang = startAng + (i * 2 * Math.PI) / n;
      pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang), 0]);
    }
    return syncGeom({
      ...createBaseEntityProps('LWPOLYLINE'),
      closed: true,
      elevation: StudioState.defaultElevation || 0,
      thickness: StudioState.defaultThickness || 0,
      points: pts
    });
  }

  /**
   * Create AutoCAD DONUT (Filled Concentric Ring / PCB Pad)
   */
  function createDonutEntity(cx, cy, innerR = null, outerR = null) {
    const rIn = Math.max(0, Number(innerR != null ? innerR : StudioState.donutInnerR) || 2.5);
    const rOut = Math.max(rIn + 0.5, Number(outerR != null ? outerR : StudioState.donutOuterR) || 7.5);
    const rMid = (rIn + rOut) * 0.5;
    return syncGeom({
      ...createBaseEntityProps('LWPOLYLINE'),
      closed: true,
      constantWidth: rOut - rIn,
      isDonut: true,
      donutInnerR: rIn,
      donutOuterR: rOut,
      elevation: StudioState.defaultElevation || 0,
      thickness: StudioState.defaultThickness || 0,
      points: [
        [cx - rMid, cy, 1.0],
        [cx + rMid, cy, 1.0]
      ]
    });
  }

  /**
   * Create AutoCAD REVCLOUD (Scalloped Revision Cloud with Bulge Arcs)
   */
  function createRevisionCloud(x1, y1, x2, y2) {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    const w = Math.max(4, maxX - minX), h = Math.max(4, maxY - minY);
    const step = Math.max(3, Math.min(18, Math.min(w, h) / 4));
    const nx = Math.max(2, Math.round(w / step));
    const ny = Math.max(2, Math.round(h / step));
    const pts = [];
    const bulge = -0.52;
    for (let i = 0; i < nx; i++) pts.push([minX + (w * i) / nx, minY, bulge]);
    for (let i = 0; i < ny; i++) pts.push([maxX, minY + (h * i) / ny, bulge]);
    for (let i = 0; i < nx; i++) pts.push([maxX - (w * i) / nx, maxY, bulge]);
    for (let i = 0; i < ny; i++) pts.push([minX, maxY - (h * i) / ny, bulge]);
    return syncGeom({
      ...createBaseEntityProps('LWPOLYLINE'),
      closed: true,
      isRevCloud: true,
      points: pts
    });
  }

  /**
   * Create 3D Extruded Box / 3DFACE Solid Entity
   */
  function create3DBoxEntity(x1, y1, x2, y2, heightZ = null) {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    const hZ = Number(heightZ != null ? heightZ : StudioState.box3dHeight) || 18;
    const z0 = StudioState.defaultElevation || 0;
    return syncGeom({
      ...createBaseEntityProps('LWPOLYLINE'),
      closed: true,
      is3DBox: true,
      elevation: z0,
      thickness: hZ,
      points: [
        [minX, minY, 0],
        [maxX, minY, 0],
        [maxX, maxY, 0],
        [minX, maxY, 0]
      ]
    });
  }

  /**
   * Rectangular Array (ARRAYRECT) on Selected Entities
   */
  function arrayRectSelectedEntities(rows = null, cols = null, rowSpacing = null, colSpacing = null) {
    const parser = ensureActiveParser();
    if (!parser || StudioState.selectedIds.size === 0) {
      toast('Select one or more entities first to create a Rectangular Array.');
      return 0;
    }
    const selEnts = parser.entities.filter(e => StudioState.selectedIds.has(e._id) && !isLayerLocked(parser, e.layer));
    if (!selEnts.length) return 0;
    const rCnt = Math.max(1, Math.min(50, parseInt(rows != null ? rows : StudioState.arrayRows, 10) || 3));
    const cCnt = Math.max(1, Math.min(50, parseInt(cols != null ? cols : StudioState.arrayCols, 10) || 3));
    const rSp = Number(rowSpacing != null ? rowSpacing : StudioState.arrayRowSpacing) || 20;
    const cSp = Number(colSpacing != null ? colSpacing : StudioState.arrayColSpacing) || 20;
    pushUndoSnapshot(`Rectangular Array (${rCnt}×${cCnt})`);
    const newIds = new Set(StudioState.selectedIds);
    let createdCount = 0;
    for (let r = 0; r < rCnt; r++) {
      for (let c = 0; c < cCnt; c++) {
        if (r === 0 && c === 0) continue;
        const dx = c * cSp;
        const dy = r * rSp;
        for (const srcEnt of selEnts) {
          const copy = cloneEntity(srcEnt);
          translateEntity(copy, dx, dy, parser);
          parser.entities.push(copy);
          newIds.add(copy._id);
          createdCount++;
        }
      }
    }
    StudioState.selectedIds = newIds;
    syncParserMutation();
    refreshAllUI();
    logCommand(`ARRAYRECT: Created ${createdCount} arrayed copies (${rCnt} rows × ${cCnt} cols, ΔX=${cSp}, ΔY=${rSp}).`);
    return createdCount;
  }

  /**
   * Polar Circular Array (ARRAYPOLAR) on Selected Entities around Center (cx, cy)
   */
  function arrayPolarSelectedEntities(cx, cy, count = null, fillAngleDeg = 360) {
    const parser = ensureActiveParser();
    if (!parser || StudioState.selectedIds.size === 0) {
      toast('Select one or more entities first to create a Polar Array.');
      return 0;
    }
    const selEnts = parser.entities.filter(e => StudioState.selectedIds.has(e._id) && !isLayerLocked(parser, e.layer));
    if (!selEnts.length) return 0;
    const nItems = Math.max(2, Math.min(72, parseInt(count != null ? count : StudioState.arrayPolarItems, 10) || 6));
    const totalAng = Number(fillAngleDeg) || 360;
    const stepAng = totalAng / nItems;
    pushUndoSnapshot(`Polar Array (${nItems} items)`);
    const newIds = new Set(StudioState.selectedIds);
    let createdCount = 0;
    for (let i = 1; i < nItems; i++) {
      const ang = stepAng * i;
      for (const srcEnt of selEnts) {
        const copy = cloneEntity(srcEnt);
        rotateEntity(copy, cx, cy, ang);
        parser.entities.push(copy);
        newIds.add(copy._id);
        createdCount++;
      }
    }
    StudioState.selectedIds = newIds;
    syncParserMutation();
    refreshAllUI();
    logCommand(`ARRAYPOLAR: Created ${createdCount} circular copies (${nItems} items around ${cx.toFixed(2)}, ${cy.toFixed(2)}).`);
    return createdCount;
  }

  /**
   * AutoCAD JOIN: Merge selected contiguous or collinear LINE & LWPOLYLINE segments
   */
  function joinSelectedEntities() {
    const parser = ensureActiveParser();
    if (!parser || StudioState.selectedIds.size < 2) {
      toast('Select 2 or more contiguous LINE or LWPOLYLINE entities to JOIN.');
      return 0;
    }
    const sel = parser.entities.filter(e => StudioState.selectedIds.has(e._id) && (e.type === 'LINE' || e.type === 'LWPOLYLINE') && !isLayerLocked(parser, e.layer));
    if (sel.length < 2) return 0;
    pushUndoSnapshot('Join Entities');
    const chains = sel.map(e => {
      if (e.type === 'LINE') return [[e.x1, e.y1, 0], [e.x2, e.y2, 0]];
      return (e.points || []).map(p => [p[0], p[1], p[2] || 0]);
    }).filter(c => c.length >= 2);
    if (chains.length < 2) return 0;
    const merged = chains.shift();
    const tol = 0.5;
    let changed = true;
    while (changed && chains.length > 0) {
      changed = false;
      for (let i = 0; i < chains.length; i++) {
        const c = chains[i];
        const head = merged[0], tail = merged[merged.length - 1];
        const cHead = c[0], cTail = c[c.length - 1];
        if (Math.hypot(tail[0] - cHead[0], tail[1] - cHead[1]) <= tol) {
          merged.push(...c.slice(1));
          chains.splice(i, 1); changed = true; break;
        } else if (Math.hypot(tail[0] - cTail[0], tail[1] - cTail[1]) <= tol) {
          merged.push(...c.slice(0, -1).reverse());
          chains.splice(i, 1); changed = true; break;
        } else if (Math.hypot(head[0] - cTail[0], head[1] - cTail[1]) <= tol) {
          merged.unshift(...c.slice(0, -1));
          chains.splice(i, 1); changed = true; break;
        } else if (Math.hypot(head[0] - cHead[0], head[1] - cHead[1]) <= tol) {
          merged.unshift(...c.slice(1).reverse());
          chains.splice(i, 1); changed = true; break;
        }
      }
    }
    const closed = merged.length >= 3 && Math.hypot(merged[0][0] - merged[merged.length - 1][0], merged[0][1] - merged[merged.length - 1][1]) <= tol;
    if (closed) merged.pop();
    const first = sel[0];
    const poly = syncGeom({
      ...createBaseEntityProps('LWPOLYLINE'),
      layer: first.layer || StudioState.currentLayer || '0',
      color: first.color ?? null,
      customHex: first.customHex || null,
      closed,
      points: merged
    });
    const removeSet = new Set(sel.map(e => e._id));
    parser.entities = parser.entities.filter(e => !removeSet.has(e._id));
    parser.entities.push(poly);
    StudioState.selectedIds = new Set([poly._id]);
    syncParserMutation();
    refreshAllUI();
    logCommand(`JOIN: Merged ${sel.length} segments into a ${closed ? 'closed' : 'continuous'} LWPOLYLINE (${merged.length} vertices).`);
    return sel.length;
  }

  /**
   * AutoCAD OVERKILL: Remove duplicate / overlapping CAD entities on the same layer
   */
  function overkillDuplicateEntities(tol = 0.005) {
    const parser = ensureActiveParser();
    if (!parser) return 0;
    const seen = new Set();
    const kept = [];
    let removed = 0;
    const q = v => Math.round((Number(v) || 0) / tol);
    for (const e of parser.entities) {
      if (isLayerLocked(parser, e.layer)) {
        kept.push(e);
        continue;
      }
      let sig = `${e.type}:${e.layer}:`;
      if (e.type === 'LINE') {
        const pA = `${q(e.x1)},${q(e.y1)}`, pB = `${q(e.x2)},${q(e.y2)}`;
        sig += (pA < pB ? `${pA}-${pB}` : `${pB}-${pA}`);
      } else if (e.type === 'CIRCLE') {
        sig += `${q(e.cx)},${q(e.cy)},${q(e.r)}`;
      } else if (e.type === 'ARC') {
        sig += `${q(e.cx)},${q(e.cy)},${q(e.r)},${q(e.startAngle || 0)},${q(e.endAngle ?? 360)}`;
      } else if (e.type === 'TEXT') {
        sig += `${e.text || ''}@${q(e.x)},${q(e.y)}:${q(e.rotation || 0)}`;
      } else if (e.type === 'LWPOLYLINE' && Array.isArray(e.points)) {
        const fwd = e.points.map(p => `${q(p[0])},${q(p[1])},${q(p[2] || 0)}`).join(';');
        const rev = [...e.points].reverse().map(p => `${q(p[0])},${q(p[1])},${q(-(p[2] || 0))}`).join(';');
        sig += `${e.closed ? 1 : 0}:` + (fwd < rev ? fwd : rev);
      } else {
        kept.push(e);
        continue;
      }
      if (seen.has(sig)) {
        removed++;
      } else {
        seen.add(sig);
        kept.push(e);
      }
    }
    if (removed > 0) {
      pushUndoSnapshot(`Overkill (${removed} duplicates)`);
      parser.entities = kept;
      syncParserMutation();
      refreshAllUI();
    }
    logCommand(removed > 0 ? `OVERKILL: Removed ${removed} duplicate overlapping entity(s).` : 'OVERKILL: No duplicate entities found.');
    toast(removed > 0 ? `OVERKILL removed ${removed} duplicate entity(s).` : 'No duplicate entities found.');
    return removed;
  }

  /* ==========================================================================
   * [MODULE SECTION: PRECISION CAD TOOLS BRIDGE (dxf_studio_tools.js)]
   * WHAT THIS IS: Connects DXF Studio to the split `dxf_studio_tools.js` module
   *   for BREAK, LENGTHEN, ORIGIN (0,0 datum), PURGE, AREA inquiry, and Stepped
   *   5-10 mil Highlight Box controls (`setHighlightBoxMils`, `toggleDiffBoxes`).
   * WHY / HOW TO EDIT: Add new CAD modify/inquiry algorithms in `dxf_studio_tools.js`
   *   and expose their UI/command triggers here.
   * ========================================================================== */
  const _dxfToolsExt = (typeof DXFStudioTools !== 'undefined' && DXFStudioTools)
    ? DXFStudioTools
    : (typeof require === 'function' ? (() => { try { return require('./dxf_studio_tools.js'); } catch (e) { return null; } })() : null);

  function breakEntityAtPoint(ent, wx, wy, parser = null) {
    const p = parser || ensureActiveParser();
    if (!_dxfToolsExt || !p || !ent) return { ok: false };
    if (isLayerLocked(p, ent.layer)) return { ok: false, reason: 'Layer is locked' };
    const prevRedo = StudioState.redoStack.slice();
    pushUndoSnapshot('Break Entity');
    const res = _dxfToolsExt.breakEntityAtPoint(ent, wx, wy, p);
    if (res && res.ok) {
      if (res.created) syncGeom(res.created);
      syncGeom(ent);
      syncParserMutation();
      refreshAllUI();
      logCommand(`BREAK split ${ent.type} into 2 entities.`);
    } else {
      StudioState.undoStack.pop();
      StudioState.redoStack = prevRedo;
      updateUndoRedoButtons();
    }
    return res;
  }

  function lengthenSelectedEntities(deltaDist = null) {
    const parser = ensureActiveParser();
    if (!parser || !_dxfToolsExt) return 0;
    const d = Number.isFinite(Number(deltaDist)) ? Number(deltaDist) : (StudioState.lengthenDelta || 5.0);
    const sel = parser.entities.filter(e => StudioState.selectedIds.has(e._id) && !isLayerLocked(parser, e.layer));
    if (!sel.length) {
      logCommand('LENGTHEN: Select one or more LINE or ARC entities first.');
      return 0;
    }
    const prevRedo = StudioState.redoStack.slice();
    pushUndoSnapshot(`Lengthen (${d >= 0 ? '+' : ''}${d})`);
    let count = 0;
    for (const e of sel) {
      if (_dxfToolsExt.lengthenEntity(e, d)) {
        syncGeom(e);
        count++;
      }
    }
    if (count > 0) {
      syncParserMutation();
      refreshAllUI();
      logCommand(`LENGTHEN adjusted ${count} entity(s) by ${d >= 0 ? '+' : ''}${d} ${parser.unitName || 'mm'}.`);
    } else {
      StudioState.undoStack.pop();
      StudioState.redoStack = prevRedo;
      updateUndoRedoButtons();
    }
    return count;
  }

  function moveSelectionToOrigin(useCenter = false) {
    const parser = ensureActiveParser();
    if (!parser || !_dxfToolsExt) return { moved: 0, dx: 0, dy: 0 };
    const targets = StudioState.selectedIds.size > 0
      ? parser.entities.filter(e => StudioState.selectedIds.has(e._id) && !isLayerLocked(parser, e.layer))
      : parser.entities.filter(e => !isLayerLocked(parser, e.layer));
    if (!targets.length) return { moved: 0, dx: 0, dy: 0 };
    pushUndoSnapshot('Move to Origin (0,0)');
    const res = _dxfToolsExt.moveEntitiesToOrigin(targets, parser, translateEntity, useCenter);
    if (res.moved > 0) {
      syncParserMutation();
      zoomExtents();
      refreshAllUI();
      logCommand(`Aligned ${res.moved} entity(s) to CAD Origin (0,0) [Δx=${res.dx}, Δy=${res.dy}].`);
    }
    return res;
  }

  function purgeUnusedLayersAndZeroEntities() {
    const parser = ensureActiveParser();
    if (!parser || !_dxfToolsExt) return { removedDegenerate: 0, purgedLayers: 0 };
    pushUndoSnapshot('Purge Drawing');
    const res = _dxfToolsExt.purgeDrawing(parser);
    syncParserMutation();
    refreshAllUI();
    logCommand(`PURGE removed ${res.removedDegenerate} zero-length entity(s) and ${res.purgedLayers} unused layer(s).`);
    return res;
  }

  function computeSelectionAreaAndLength() {
    const parser = ensureActiveParser();
    if (!parser || !_dxfToolsExt) return { count: 0, totalLength: 0, totalArea: 0, spanX: 0, spanY: 0 };
    const targets = StudioState.selectedIds.size > 0
      ? parser.entities.filter(e => StudioState.selectedIds.has(e._id))
      : parser.entities;
    const m = _dxfToolsExt.computeSelectionMetrics(targets, parser);
    const u = parser.unitName || 'mm';
    logCommand(`AREA / MEASUREGEOM (${m.count} ent): Length = ${m.totalLength} ${u} | Area = ${m.totalArea} ${u}² | Span = ${m.spanX} × ${m.spanY} ${u}`);
    return m;
  }

  function setHighlightBoxMils(mils = 7) {
    const val = Math.max(2, Math.min(25, Number(mils) || 7));
    const ds = getDXFState();
    if (ds) ds.highlightBoxMils = val;
    if ($('#dxf-st-box-mils')) $('#dxf-st-box-mils').value = String(val);
    if ($('#dxf-pre-box-mils')) $('#dxf-pre-box-mils').value = String(val);
    if (typeof window !== 'undefined' && window.CMP && window.CMP.analysisCache instanceof Map) {
      window.CMP.analysisCache.clear();
    }
    scheduleRenderCanvas();
    logCommand(`Highlight box size set to ${val} mils (stepped line boxes).`);
    return val;
  }

  function toggleDiffBoxes(forceState = null) {
    StudioState.showDiffBoxes = typeof forceState === 'boolean' ? forceState : !StudioState.showDiffBoxes;
    if ($('#dxf-st-box-toggle')) $('#dxf-st-box-toggle').classList.toggle('on', StudioState.showDiffBoxes);
    scheduleRenderCanvas();
    logCommand(`Stepped difference highlight boxes: ${StudioState.showDiffBoxes ? 'ON' : 'OFF'}.`);
    return StudioState.showDiffBoxes;
  }

  function trimMemory() {
    const budget = (typeof window !== 'undefined' && window.RPMemoryBudget) ? window.RPMemoryBudget : ((typeof WorkerEngine !== 'undefined' && WorkerEngine.globalMemoryBudget) ? WorkerEngine.globalMemoryBudget : null);
    while (StudioState.undoStack.length > 6) {
      const ev = StudioState.undoStack.shift();
      if (ev && ev._trackedBytes && budget) budget.recordDealloc(ev._trackedBytes);
    }
    for (const r of StudioState.redoStack) {
      if (r && r._trackedBytes && budget) budget.recordDealloc(r._trackedBytes);
    }
    StudioState.redoStack = [];
  }

  // ==========================================================================
  // HIGH-DPI MODELSPACE CANVAS RENDERER (WITH SIDE-BY-SIDE & LIVE GHOST PREVIEW)
  // ==========================================================================
  function getEntityStrokeColor(ent, parser, isDarkBg) {
    const adjust = hex => (typeof DXFEngine !== 'undefined' && DXFEngine.contrastAdjustHex)
      ? DXFEngine.contrastAdjustHex(hex, isDarkBg)
      : hex;
    const lyr = parser && parser.layers && parser.layers[ent.layer];
    if (ent.customHex) return adjust(ent.customHex);
    if (ent.trueColor != null && ent.trueColor > 0 && typeof DXFEngine !== 'undefined' && DXFEngine.trueColorToHex) {
      return adjust(DXFEngine.trueColorToHex(ent.trueColor));
    }
    if (ent.color && ent.color !== 256 && ent.color !== 0 && typeof DXFEngine !== 'undefined' && DXFEngine.aciToHex) {
      return DXFEngine.aciToHex(ent.color, isDarkBg);
    }
    if (lyr) {
      if (lyr.customHex) return adjust(lyr.customHex);
      if (lyr.trueColor != null && lyr.trueColor > 0 && typeof DXFEngine !== 'undefined' && DXFEngine.trueColorToHex) {
        return adjust(DXFEngine.trueColorToHex(lyr.trueColor));
      }
      if (typeof DXFEngine !== 'undefined' && DXFEngine.aciToHex) {
        return DXFEngine.aciToHex(lyr.color, isDarkBg);
      }
    }
    return isDarkBg ? '#e2e8f0' : '#1e293b';
  }

  function applyEntityDash(ctx, ent, parser) {
    const lyr = parser && parser.layers && parser.layers[ent.layer];
    const lt = String((ent.linetype && ent.linetype !== 'BYLAYER') ? ent.linetype : (lyr && lyr.linetype) || 'CONTINUOUS').toUpperCase();
    if (lt.includes('DASH')) ctx.setLineDash([8, 4]);
    else if (lt.includes('HIDDEN')) ctx.setLineDash([4, 3]);
    else if (lt.includes('CENTER')) ctx.setLineDash([12, 3, 3, 3]);
    else if (lt.includes('PHANTOM')) ctx.setLineDash([14, 3, 3, 3, 3, 3]);
    else if (lt.includes('DOT')) ctx.setLineDash([2, 3]);
    else ctx.setLineDash([]);
  }

  function hexToRgbaStr(hex, alpha = 0.42) {
    if (!hex || typeof hex !== 'string' || hex.length < 7) return `rgba(148,163,184,${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16) || 148;
    const g = parseInt(hex.slice(3, 5), 16) || 163;
    const b = parseInt(hex.slice(5, 7), 16) || 184;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  function getCommonCompareColor(isDarkBg) {
    const cmp = (typeof window !== 'undefined' && window.CMP) ? window.CMP : null;
    const op = (cmp && cmp.opC != null) ? Math.max(0.08, Math.min(0.65, cmp.opC / 100)) : (isDarkBg ? 0.34 : 0.36);
    if (cmp && cmp.tintC) return hexToRgbaStr(cmp.tintC, op);
    return isDarkBg ? 'rgba(100,116,139,0.34)' : 'rgba(148,163,184,0.36)';
  }
  function getRevACompareColor(isDarkBg = true) {
    const tA = (typeof window !== 'undefined' && window.CMP && window.CMP.tintA) ? window.CMP.tintA : null;
    const isDef = !tA || /^#(e11414|ef4444|dc2626)$/i.test(tA);
    const col = isDef ? (isDarkBg ? '#ff2a4b' : '#e11d48') : tA;
    return (typeof DXFEngine !== 'undefined' && DXFEngine.contrastAdjustHex) ? DXFEngine.contrastAdjustHex(col, isDarkBg) : col;
  }
  function getRevBCompareColor(isDarkBg = true) {
    const tB = (typeof window !== 'undefined' && window.CMP && window.CMP.tintB) ? window.CMP.tintB : null;
    const isDef = !tB || /^#(00a53c|16a34a|ffffff|fff)$/i.test(tB);
    const col = isDef ? (isDarkBg ? '#00f0ff' : '#0066ff') : tB;
    return (typeof DXFEngine !== 'undefined' && DXFEngine.contrastAdjustHex) ? DXFEngine.contrastAdjustHex(col, isDarkBg) : col;
  }

  function drawSingleEntityOnCtx(ctx, ent, parser, canvasH, isDarkBg, overrideColor = null, extraWidth = 0, panXOverride = null, parentTf = null, depth = 0, inDimBlock = false) {
    if (!ent || depth > 8) return;
    const effLayer = (ent.layer === '0' && parentTf && parentTf.parentLayer) ? parentTf.parentLayer : (ent.layer || '0');
    if (!inDimBlock && /^defpoints$/i.test(effLayer)) return;
    if (!inDimBlock && depth > 0 && parser && !isLayerVisible(parser, effLayer)) return;
    if (ent.type === 'POINT' && inDimBlock) return;

    const strokeCol = overrideColor || getEntityStrokeColor(
      (ent.layer === '0' && parentTf && parentTf.parentLayer && !ent.color && !ent.customHex && !ent.trueColor)
        ? { ...ent, layer: parentTf.parentLayer, color: parentTf.parentColor }
        : ent,
      parser,
      isDarkBg
    );
    const lyr = parser && parser.layers && parser.layers[effLayer];
    const locked = isLayerLocked(parser, effLayer);
    const lwRaw = (ent.lineweight != null && ent.lineweight > 0) ? ent.lineweight : ((lyr && lyr.lineweight > 0) ? lyr.lineweight : 18);
    const basePx = StudioState.showLineweights ? Math.max(1.0, Math.min(10.0, lwRaw / 15)) : 1.15;
    const effPanX = panXOverride != null ? panXOverride : StudioState.panX;

    const is3D = is3DViewActive();
    const entZ0 = Number(ent.elevation || ent.z || 0);
    const rawThk = Number(ent.thickness || 0);
    const allowAutoExtrude = is3D && StudioState.auto3DExtrude && StudioState.visualStyle !== '2d' && depth <= 1 && !inDimBlock;
    const effThk = rawThk !== 0
      ? rawThk
      : ((allowAutoExtrude && ['LINE', 'LWPOLYLINE', 'CIRCLE', 'ARC', 'ELLIPSE', 'SPLINE', 'SOLID', 'HATCH'].includes(ent.type))
          ? (ent.type === 'CIRCLE' ? (StudioState.auto3DDepth || 12) * 0.75 : (StudioState.auto3DDepth || 12))
          : 0);
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
    const mapScreenZ = (lx, ly, lz = entZ0) => {
      const [wx, wy] = mapWorld(lx, ly);
      const p = project3DPoint(wx, wy, lz, canvasH, effPanX);
      return [p.x, p.y];
    };
    const mapScreen = (lx, ly) => mapScreenZ(lx, ly, entZ0);

    ctx.save();
    ctx.strokeStyle = strokeCol;
    ctx.fillStyle = strokeCol;
    ctx.globalAlpha = locked ? 0.55 : 1.0;
    ctx.lineWidth = (inDimBlock ? basePx * 0.78 : basePx) + extraWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    applyEntityDash(ctx, ent, parser);

    if (ent.type === 'LINE') {
      const [x1, y1] = mapScreen(ent.x1, ent.y1);
      const [x2, y2] = mapScreen(ent.x2, ent.y2);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else if (ent.type === 'LWPOLYLINE' && Array.isArray(ent.points) && ent.points.length >= 2) {
      const rPts = ent.renderPoints || ent.points;
      const [x0, y0] = mapScreen(rPts[0][0], rPts[0][1]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      if (ent.renderPoints) {
        for (let i = 1; i < rPts.length; i++) {
          const [px, py] = mapScreen(rPts[i][0], rPts[i][1]);
          ctx.lineTo(px, py);
        }
        if (ent.closed) ctx.closePath();
      } else {
        const count = ent.closed ? ent.points.length : ent.points.length - 1;
        for (let i = 0; i < count; i++) {
          const p1 = ent.points[i];
          const p2 = ent.points[(i + 1) % ent.points.length];
          const bulge = p1[2] || 0;
          if (Math.abs(bulge) > 1e-5 && typeof DXFEngine !== 'undefined' && DXFEngine.tessellateBulgeArc) {
            const arcPts = DXFEngine.tessellateBulgeArc(p1[0], p1[1], p2[0], p2[1], bulge, 16);
            for (const ap of arcPts) {
              const [ax, ay] = mapScreen(ap[0], ap[1]);
              ctx.lineTo(ax, ay);
            }
          } else {
            const [px, py] = mapScreen(p2[0], p2[1]);
            ctx.lineTo(px, py);
          }
        }
      }
      ctx.stroke();
      if (ent.isLeader && rPts.length >= 2) {
        const [lx1, ly1] = mapScreen(rPts[0][0], rPts[0][1]);
        const [lx2, ly2] = mapScreen(rPts[1][0], rPts[1][1]);
        const ang = Math.atan2(ly2 - ly1, lx2 - lx1);
        const ah = 7;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(lx1, ly1);
        ctx.lineTo(lx1 + ah * Math.cos(ang - 0.32), ly1 + ah * Math.sin(ang - 0.32));
        ctx.lineTo(lx1 + ah * Math.cos(ang + 0.32), ly1 + ah * Math.sin(ang + 0.32));
        ctx.closePath();
        ctx.fill();
      }
    } else if (ent.type === 'CIRCLE') {
      const nonUniformBlk = !!(parentTf && Math.abs(Math.abs(parentTf.sx || 1) - Math.abs(parentTf.sy || 1)) > 1e-3);
      if (nonUniformBlk || (is3D && (Math.abs(StudioState.pitch || 0) > 0.5 || Math.abs(StudioState.yaw || 0) > 0.5))) {
        const steps = 40;
        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
          const rad = (s * 2 * Math.PI) / steps;
          const [px, py] = mapScreen(ent.cx + (ent.r || 1) * Math.cos(rad), ent.cy + (ent.r || 1) * Math.sin(rad));
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      } else {
        const [cx, cy] = mapScreen(ent.cx, ent.cy);
        const rScale = parentTf ? Math.max(Math.abs(parentTf.sx || 1), Math.abs(parentTf.sy || 1)) : 1;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(0.5, (ent.r || 1) * rScale * StudioState.zoom), 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (ent.type === 'ARC') {
      const sAng = ent.startAngle || 0;
      let eAng = ent.endAngle != null ? ent.endAngle : 360;
      if (eAng <= sAng) eAng += 360;
      const sweep = eAng - sAng;
      const steps = Math.max(12, Math.min(72, Math.ceil(sweep / 4)));
      ctx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const rad = ((sAng + (sweep * s) / steps) * Math.PI) / 180;
        const [ax, ay] = mapScreen(ent.cx + (ent.r || 1) * Math.cos(rad), ent.cy + (ent.r || 1) * Math.sin(rad));
        if (s === 0) ctx.moveTo(ax, ay);
        else ctx.lineTo(ax, ay);
      }
      ctx.stroke();
    } else if (ent.type === 'ELLIPSE') {
      const rx = ent.rx || Math.hypot(ent.mx || 10, ent.my || 0) || 10;
      const ry = ent.ry || (rx * (ent.ratio || 0.5)) || 5;
      const rot = ent.rotation != null ? ent.rotation : Math.atan2(ent.my || 0, ent.mx || 1);
      const sParam = ent.startParam ?? 0;
      let eParam = ent.endParam ?? (Math.PI * 2);
      if (eParam <= sParam) eParam += Math.PI * 2;
      const steps = 48;
      const cosE = Math.cos(rot), sinE = Math.sin(rot);
      ctx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const t = sParam + ((eParam - sParam) * s) / steps;
        const lx = rx * Math.cos(t), ly = ry * Math.sin(t);
        const [ex, ey] = mapScreen(ent.cx + lx * cosE - ly * sinE, ent.cy + lx * sinE + ly * cosE);
        if (s === 0) ctx.moveTo(ex, ey);
        else ctx.lineTo(ex, ey);
      }
      ctx.stroke();
    } else if (ent.type === 'SPLINE' && Array.isArray(ent.points) && ent.points.length >= 2) {
      const rPts = ent.renderPoints || ent.points;
      const [x0, y0] = mapScreen(rPts[0][0], rPts[0][1]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      for (let i = 1; i < rPts.length; i++) {
        const [px, py] = mapScreen(rPts[i][0], rPts[i][1]);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    } else if (ent.type === 'HATCH' && Array.isArray(ent.loops) && ent.loops.length > 0) {
      ctx.setLineDash([]);
      for (const lp of ent.loops) {
        if (!lp || lp.length < 2) continue;
        const [x0, y0] = mapScreen(lp[0][0], lp[0][1]);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        for (let i = 1; i < lp.length; i++) {
          const [px, py] = mapScreen(lp[i][0], lp[i][1]);
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    } else if ((ent.type === 'SOLID' || ent.type === 'HATCH') && Array.isArray(ent.points) && ent.points.length >= 3) {
      const [x0, y0] = mapScreen(ent.points[0][0], ent.points[0][1]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      for (let i = 1; i < ent.points.length; i++) {
        const [px, py] = mapScreen(ent.points[i][0], ent.points[i][1]);
        ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.save();
      ctx.globalAlpha = inDimBlock ? 0.85 : 0.25;
      ctx.fill();
      ctx.restore();
      ctx.stroke();
    } else if (ent.type === 'POINT') {
      const [px, py] = mapScreen(ent.x || 0, ent.y || 0);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(px, py, 3.0, 0, Math.PI * 2);
      ctx.moveTo(px - 5, py); ctx.lineTo(px + 5, py);
      ctx.moveTo(px, py - 5); ctx.lineTo(px, py + 5);
      ctx.stroke();
    } else if (ent.type === 'TEXT') {
      ctx.setLineDash([]);
      const [px, py] = mapScreen(ent.x || 0, ent.y || 0);
      const blkScaleY = parentTf ? Math.abs(parentTf.sy || parentTf.sx || 1) : 1;
      const blkScaleX = parentTf ? Math.abs(parentTf.sx || parentTf.sy || 1) : 1;
      const hdrTxtH = parser && parser.header ? parseFloat(parser.header['$TEXTSIZE']) : 0;
      const unitDefH = (parser && parser.unitName === 'in') ? 0.125 : ((parser && parser.unitName === 'm') ? 0.05 : 2.5);
      const rawH = ent.height > 0 ? ent.height : (Number.isFinite(hdrTxtH) && hdrTxtH > 0 ? hdrTxtH : unitDefH);
      const fontPx = Math.max(1.2, Math.min(2048, rawH * blkScaleY * StudioState.zoom * 0.80));
      if (fontPx >= 1.2) {
        const parentMirrorFlip = parentTf && ((parentTf.sx || 1) * (parentTf.sy || 1) < 0) ? -1 : 1;
        const rotDeg = (ent.rotation || 0) * parentMirrorFlip + (parentTf ? (parentTf.rotDeg || 0) : 0);
        let wf = (ent.widthFactor || 0.86) * (blkScaleX / Math.max(1e-4, blkScaleY));
        const lines = (ent.isMText && ent.boxWidth > 0 && typeof DXFEngine !== 'undefined' && typeof DXFEngine.wrapMTextLines === 'function')
          ? DXFEngine.wrapMTextLines(ent.text, ent.boxWidth, rawH, ent.widthFactor || 0.86)
          : String(ent.text || '').split('\n');
        const lineStep = fontPx * (ent.lineSpacing || 1.2);
        const totalH = fontPx + (lines.length - 1) * lineStep;
        const hMode = ent.hMode || 'left';
        const vMode = ent.vMode || 'baseline';
        ctx.save();
        ctx.translate(px, py);
        if (rotDeg) ctx.rotate(-rotDeg * Math.PI / 180);
        ctx.font = `500 ${fontPx}px "Segoe UI", Arial, sans-serif`;
        if (ent.fitWidth > 0 && lines.length === 1) {
          const targetPx = ent.fitWidth * blkScaleX * StudioState.zoom;
          const measured = ctx.measureText(lines[0]).width;
          if (measured > 1) wf = Math.min(wf, targetPx / measured);
        }
        if (Math.abs(wf - 1) > 0.02) ctx.scale(wf, 1);
        ctx.textAlign = hMode;
        ctx.textBaseline = 'alphabetic';
        lines.forEach((ln, idx) => {
          if (!ln) return;
          let ly = idx * lineStep;
          if (vMode === 'top') ly = fontPx * 0.82 + idx * lineStep;
          else if (vMode === 'middle') ly = -totalH / 2 + fontPx * 0.82 + idx * lineStep;
          else if (vMode === 'bottom') ly = -(lines.length - 1 - idx) * lineStep - fontPx * 0.12;
          ctx.fillText(ln, 0, ly);
        });
        ctx.restore();
      }
    } else if (ent.type === 'DIMENSION') {
      const dimBlk = (ent.blockName && parser) ? (parser._getBlock ? parser._getBlock(ent.blockName) : (parser.blocks && parser.blocks[ent.blockName])) : null;
      if (dimBlk && Array.isArray(dimBlk.entities) && dimBlk.entities.length > 0) {
        const subSet = (overrideColor && ent._diffSubIndices && ent._diffSubIndices.size > 0) ? ent._diffSubIndices : null;
        const neutralCol = getCommonCompareColor(isDarkBg);
        let hasDimText = false;
        for (let si = 0; si < dimBlk.entities.length; si++) {
          const subE = dimBlk.entities[si];
          if (subE && (subE.type === 'TEXT' || subE.type === 'MTEXT') && String(subE.text || '').trim().length > 0) hasDimText = true;
          const isDiffSub = subSet ? subSet.has(si) : true;
          drawSingleEntityOnCtx(ctx, subE, parser, canvasH, isDarkBg, isDiffSub ? overrideColor : neutralCol, isDiffSub ? extraWidth : 0, panXOverride, parentTf, depth + 1, true);
        }
        if (!hasDimText) {
          const lbl = (typeof DXFEngine !== 'undefined' && DXFEngine.resolveDimensionLabel)
            ? DXFEngine.resolveDimensionLabel(ent)
            : (ent.text || (ent.measurement != null ? String(Number(Number(ent.measurement).toFixed(4))) : ''));
          if (lbl) {
            const mp = w2s(ent.textX ?? ent.x ?? ((ent.x1 + ent.x2) / 2), ent.textY ?? ent.y ?? ((ent.y1 + ent.y2) / 2), canvasH, panXOverride);
            const dimFs = Math.max(10, Math.min(28, 12));
            ctx.save();
            ctx.font = `600 ${dimFs}px ${MULTILINGUAL_FONT_STACK}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = col;
            ctx.fillText(lbl, mp.sx, mp.sy);
            ctx.restore();
          }
        }
      } else {
        ctx.setLineDash([]);
        const hdrDimTxt = parser && parser.header ? parseFloat(parser.header['$DIMTXT']) : 0;
        const hdrDimScale = parser && parser.header ? parseFloat(parser.header['$DIMSCALE']) : 1;
        const effDimScale = (Number.isFinite(hdrDimScale) && hdrDimScale > 0) ? hdrDimScale : 1;
        const bSpan = parser && parser.bounds ? Math.max(1e-3, Math.hypot((parser.bounds.maxX || 0) - (parser.bounds.minX || 0), (parser.bounds.maxY || 0) - (parser.bounds.minY || 0))) : 100;
        const dimWorldH = (ent.height > 0 ? ent.height : ((Number.isFinite(hdrDimTxt) && hdrDimTxt > 0) ? hdrDimTxt * effDimScale : Math.max(0.05, bSpan * 0.014)));
        const fontPx = Math.max(1.5, Math.min(2048, dimWorldH * StudioState.zoom * 0.80));
        if (Number.isFinite(ent.x1) && Number.isFinite(ent.x2)) {
          const [sx1, sy1] = mapScreen(ent.x1, ent.y1);
          const [sx2, sy2] = mapScreen(ent.x2, ent.y2);
          const txCoord = ent.textX != null ? ent.textX : (ent.x != null ? ent.x : (ent.x1 + ent.x2) / 2);
          const tyCoord = ent.textY != null ? ent.textY : (ent.y != null ? ent.y : (ent.y1 + ent.y2) / 2);
          const [dmx, dmy] = mapScreen(txCoord, tyCoord);
          const dxSpan = Math.abs(ent.x2 - ent.x1), dySpan = Math.abs(ent.y2 - ent.y1);
          ctx.beginPath();
          if (dySpan > dxSpan * 1.2 && Math.abs(txCoord - (ent.x1 + ent.x2) * 0.5) > 1e-3) {
            ctx.moveTo(sx1, sy1); ctx.lineTo(dmx, sy1);
            ctx.moveTo(sx2, sy2); ctx.lineTo(dmx, sy2);
            ctx.moveTo(dmx, sy1); ctx.lineTo(dmx, sy2);
          } else if (dxSpan >= dySpan * 1.2 && Math.abs(tyCoord - (ent.y1 + ent.y2) * 0.5) > 1e-3) {
            ctx.moveTo(sx1, sy1); ctx.lineTo(sx1, dmy);
            ctx.moveTo(sx2, sy2); ctx.lineTo(sx2, dmy);
            ctx.moveTo(sx1, dmy); ctx.lineTo(sx2, dmy);
          } else {
            ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2);
          }
          ctx.stroke();
          if (fontPx >= 2.0) {
            ctx.font = `600 ${fontPx}px "Segoe UI", system-ui, Consolas, sans-serif`;
            const lbl = ent.text && ent.text !== '<>' ? ent.text : `${Math.hypot(ent.x2 - ent.x1, ent.y2 - ent.y1).toFixed(2)}`;
            const midX = (sx1 + sx2) / 2, midY = dmy - fontPx * 0.45;
            ctx.fillStyle = strokeCol;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(lbl, midX, midY);
          }
        } else if (ent.text && fontPx >= 2.0) {
          const [dmx, dmy] = mapScreen(ent.textX ?? ent.x ?? 0, ent.textY ?? ent.y ?? 0);
          ctx.font = `600 ${fontPx}px Consolas, monospace`;
          ctx.fillText(ent.text, dmx, dmy);
        }
      }
    } else if (ent.type === 'INSERT' && parser) {
      const blk = parser._getBlock ? parser._getBlock(ent.blockName) : (parser.blocks && parser.blocks[ent.blockName]);
      if (blk && Array.isArray(blk.entities)) {
        const parentMirrorFlip = parentTf && ((parentTf.sx || 1) * (parentTf.sy || 1) < 0) ? -1 : 1;
        const rotDeg = (ent.rotation || 0) * parentMirrorFlip + (parentTf ? (parentTf.rotDeg || 0) : 0);
        const rad = rotDeg * Math.PI / 180;
        const [insWx, insWy] = mapWorld(ent.x || 0, ent.y || 0);
        const tf = {
          bx: blk.baseX || 0,
          by: blk.baseY || 0,
          ix: insWx,
          iy: insWy,
          sx: (ent.scaleX || 1) * (parentTf ? (parentTf.sx || 1) : 1),
          sy: (ent.scaleY || 1) * (parentTf ? (parentTf.sy || 1) : 1),
          cosR: Math.cos(rad),
          sinR: Math.sin(rad),
          rotDeg,
          parentLayer: (ent.layer && ent.layer !== '0') ? ent.layer : (parentTf ? parentTf.parentLayer : '0'),
          parentColor: ent.color || (parentTf ? parentTf.parentColor : null)
        };
        const isDim = inDimBlock || /^\*D/i.test(ent.blockName || '');
        const subSet = (overrideColor && ent._diffSubIndices && ent._diffSubIndices.size > 0) ? ent._diffSubIndices : null;
        const targetSubIdx = (depth === 0 && !subSet && blk.entities.length > 1)
          ? ((overrideColor === '#38bdf8' && StudioState.selectedSubIndex && StudioState.selectedSubIndex.entId === ent._id)
              ? StudioState.selectedSubIndex.subIdx
              : ((overrideColor === '#fbbf24' && StudioState.hoveredSubIndex && StudioState.hoveredSubIndex.entId === ent._id)
                  ? StudioState.hoveredSubIndex.subIdx
                  : null))
          : null;
        const neutralCol = getCommonCompareColor(isDarkBg);
        for (let si = 0; si < blk.entities.length; si++) {
          if (targetSubIdx != null) {
            const isTarget = (si === targetSubIdx);
            drawSingleEntityOnCtx(ctx, blk.entities[si], parser, canvasH, isDarkBg, isTarget ? overrideColor : null, isTarget ? extraWidth : 0, panXOverride, tf, depth + 1, isDim);
          } else {
            const isDiffSub = subSet ? subSet.has(si) : true;
            drawSingleEntityOnCtx(ctx, blk.entities[si], parser, canvasH, isDarkBg, isDiffSub ? overrideColor : neutralCol, isDiffSub ? extraWidth : 0, panXOverride, tf, depth + 1, isDim);
          }
        }
      }
    }

    // 3D Extrusion / Z-Thickness Rendering when in 3D view or entity has explicit 3D thickness
    if (is3D && Math.abs(effThk) > 1e-3 && !inDimBlock) {
      const zTop = entZ0 + effThk;
      const isShaded = StudioState.visualStyle === '3d_shaded';
      const isHiddenLine = StudioState.visualStyle === '3d_hidden';
      const occludeBg = StudioState.background || (isDarkBg ? '#0c1017' : '#ffffff');
      ctx.save();
      ctx.setLineDash([]);
      ctx.lineWidth = Math.max(0.95, basePx * 0.9);
      if (ent.type === 'LINE') {
        const [bx1, by1] = mapScreenZ(ent.x1, ent.y1, ent.z1 || entZ0);
        const [bx2, by2] = mapScreenZ(ent.x2, ent.y2, ent.z2 || entZ0);
        const [tx1, ty1] = mapScreenZ(ent.x1, ent.y1, (ent.z1 || entZ0) + effThk);
        const [tx2, ty2] = mapScreenZ(ent.x2, ent.y2, (ent.z2 || entZ0) + effThk);
        if (isShaded || isHiddenLine) {
          ctx.fillStyle = isHiddenLine ? occludeBg : strokeCol;
          ctx.globalAlpha = isHiddenLine ? 0.92 : 0.22;
          ctx.beginPath(); ctx.moveTo(bx1, by1); ctx.lineTo(bx2, by2); ctx.lineTo(tx2, ty2); ctx.lineTo(tx1, ty1); ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = strokeCol;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(tx1, ty1); ctx.lineTo(tx2, ty2);
        ctx.moveTo(bx1, by1); ctx.lineTo(tx1, ty1);
        ctx.moveTo(bx2, by2); ctx.lineTo(tx2, ty2);
        ctx.stroke();
      } else if ((ent.type === 'LWPOLYLINE' || ent.type === 'SOLID' || ent.type === 'SPLINE' || ent.type === 'HATCH') && Array.isArray(ent.renderPoints || ent.points) && (ent.renderPoints || ent.points).length >= 2) {
        const rPts = ent.renderPoints || ent.points;
        const isClosedPoly = !!(ent.closed || ent.type === 'SOLID' || ent.type === 'HATCH');
        const botPts = rPts.map(p => mapScreenZ(p[0], p[1], entZ0));
        const topPts = rPts.map(p => mapScreenZ(p[0], p[1], zTop));
        if (isShaded || isHiddenLine) {
          ctx.fillStyle = isHiddenLine ? occludeBg : strokeCol;
          ctx.globalAlpha = isHiddenLine ? 0.92 : 0.18;
          const cnt = isClosedPoly ? rPts.length : rPts.length - 1;
          for (let i = 0; i < cnt; i++) {
            const j = (i + 1) % rPts.length;
            ctx.beginPath();
            ctx.moveTo(botPts[i][0], botPts[i][1]);
            ctx.lineTo(botPts[j][0], botPts[j][1]);
            ctx.lineTo(topPts[j][0], topPts[j][1]);
            ctx.lineTo(topPts[i][0], topPts[i][1]);
            ctx.closePath();
            ctx.fill();
          }
          if (isClosedPoly) {
            ctx.globalAlpha = isHiddenLine ? 0.95 : 0.28;
            ctx.beginPath();
            ctx.moveTo(topPts[0][0], topPts[0][1]);
            for (let i = 1; i < topPts.length; i++) ctx.lineTo(topPts[i][0], topPts[i][1]);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.strokeStyle = strokeCol;
        ctx.globalAlpha = 0.88;
        ctx.beginPath();
        ctx.moveTo(topPts[0][0], topPts[0][1]);
        for (let i = 1; i < topPts.length; i++) ctx.lineTo(topPts[i][0], topPts[i][1]);
        if (isClosedPoly) ctx.closePath();
        const pillarStep = Math.max(1, Math.floor(rPts.length / 12));
        for (let i = 0; i < rPts.length; i += pillarStep) {
          ctx.moveTo(botPts[i][0], botPts[i][1]);
          ctx.lineTo(topPts[i][0], topPts[i][1]);
        }
        ctx.stroke();
      } else if (ent.type === 'CIRCLE' || ent.type === 'ARC' || ent.type === 'ELLIPSE') {
        const steps = 28;
        const botPts = [], topPts = [];
        const isClosedCurve = ent.type === 'CIRCLE' || (ent.type === 'ELLIPSE' && Math.abs((ent.endParam ?? Math.PI * 2) - (ent.startParam ?? 0)) >= Math.PI * 1.99);
        if (ent.type === 'ELLIPSE') {
          const rx = ent.rx || Math.hypot(ent.mx || 10, ent.my || 0) || 10;
          const ry = ent.ry || (rx * (ent.ratio || 0.5)) || 5;
          const rot = ent.rotation != null ? ent.rotation : Math.atan2(ent.my || 0, ent.mx || 1);
          const sP = ent.startParam ?? 0;
          let eP = ent.endParam ?? (Math.PI * 2);
          if (eP <= sP) eP += Math.PI * 2;
          const cosE = Math.cos(rot), sinE = Math.sin(rot);
          for (let s = 0; s <= steps; s++) {
            const t = sP + ((eP - sP) * s) / steps;
            const lx = rx * Math.cos(t), ly = ry * Math.sin(t);
            const wx = ent.cx + lx * cosE - ly * sinE;
            const wy = ent.cy + lx * sinE + ly * cosE;
            botPts.push(mapScreenZ(wx, wy, entZ0));
            topPts.push(mapScreenZ(wx, wy, zTop));
          }
        } else {
          const sAng = ent.type === 'ARC' ? (ent.startAngle || 0) : 0;
          let eAng = ent.type === 'ARC' ? (ent.endAngle != null ? ent.endAngle : 360) : 360;
          if (eAng <= sAng) eAng += 360;
          const sweep = eAng - sAng;
          for (let s = 0; s <= steps; s++) {
            const rad = ((sAng + (sweep * s) / steps) * Math.PI) / 180;
            const px = ent.cx + (ent.r || 1) * Math.cos(rad);
            const py = ent.cy + (ent.r || 1) * Math.sin(rad);
            botPts.push(mapScreenZ(px, py, entZ0));
            topPts.push(mapScreenZ(px, py, zTop));
          }
        }
        if (isShaded || isHiddenLine) {
          ctx.fillStyle = isHiddenLine ? occludeBg : strokeCol;
          ctx.globalAlpha = isHiddenLine ? 0.9 : 0.16;
          for (let i = 0; i < steps; i++) {
            ctx.beginPath();
            ctx.moveTo(botPts[i][0], botPts[i][1]);
            ctx.lineTo(botPts[i + 1][0], botPts[i + 1][1]);
            ctx.lineTo(topPts[i + 1][0], topPts[i + 1][1]);
            ctx.lineTo(topPts[i][0], topPts[i][1]);
            ctx.closePath();
            ctx.fill();
          }
          if (isClosedCurve) {
            ctx.globalAlpha = isHiddenLine ? 0.94 : 0.24;
            ctx.beginPath();
            ctx.moveTo(topPts[0][0], topPts[0][1]);
            for (let i = 1; i < topPts.length; i++) ctx.lineTo(topPts[i][0], topPts[i][1]);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.strokeStyle = strokeCol;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(topPts[0][0], topPts[0][1]);
        for (let i = 1; i < topPts.length; i++) ctx.lineTo(topPts[i][0], topPts[i][1]);
        for (let q = 0; q <= steps; q += 7) {
          ctx.moveTo(botPts[q][0], botPts[q][1]);
          ctx.lineTo(topPts[q][0], topPts[q][1]);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  let _studioRenderRaf = 0;
  function scheduleRenderCanvas() {
    if (_studioRenderRaf) return;
    if (typeof requestAnimationFrame === 'function') {
      _studioRenderRaf = requestAnimationFrame(() => {
        _studioRenderRaf = 0;
        renderCanvas();
      });
    } else {
      renderCanvas();
    }
  }

  function renderCanvas() {
    if (_studioRenderRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(_studioRenderRaf);
      _studioRenderRaf = 0;
    }
    const host = $('#view-dxf');
    if (host && host.hidden) return;
    const cv = $('#dxf-canvas');
    const wrap = $('#dxf-canvas-wrap');
    if (!cv || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const W = Math.max(300, Math.floor(rect.width || 900));
    const H = Math.max(240, Math.floor(rect.height || 600));
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }

    const ctx = cv.getContext('2d');
    const bg = StudioState.background || '#0c1017';
    const isDarkBg = !/^#?(fff|ffffff|f8fafc)$/i.test(bg.trim());
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 1. Calibrated AutoCAD Grid & UCS Origin Axes (Adaptive across all zoom scales [1e-6 .. 1e6])
    if (StudioState.gridEnabled) {
      const rawStep = 65 / Math.max(1e-9, StudioState.zoom);
      const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, rawStep))));
      const norm = rawStep / mag;
      const worldStep = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
      const minorStep = worldStep / 5;

      if (is3DViewActive() && worldStep > 0) {
        // True 3D Projected Ground Plane Grid on Z=0
        const piv = get3DPivot();
        const halfSpan = Math.min(worldStep * 18, Math.max(worldStep * 8, (Math.max(W, H) / Math.max(1e-6, StudioState.zoom)) * 0.75));
        const gxMin = Math.floor((piv.x - halfSpan) / worldStep) * worldStep;
        const gxMax = Math.ceil((piv.x + halfSpan) / worldStep) * worldStep;
        const gyMin = Math.floor((piv.y - halfSpan) / worldStep) * worldStep;
        const gyMax = Math.ceil((piv.y + halfSpan) / worldStep) * worldStep;
        ctx.strokeStyle = isDarkBg ? 'rgba(56, 189, 248, 0.14)' : 'rgba(15, 23, 42, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let gx = gxMin; gx <= gxMax; gx += worldStep) {
          const p0 = project3DPoint(gx, gyMin, 0, H);
          const p1 = project3DPoint(gx, gyMax, 0, H);
          ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        }
        for (let gy = gyMin; gy <= gyMax; gy += worldStep) {
          const p0 = project3DPoint(gxMin, gy, 0, H);
          const p1 = project3DPoint(gxMax, gy, 0, H);
          ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        }
        ctx.stroke();
      } else {
        const wMin = screenToWorld(0, H, H);
        const wMax = screenToWorld(W, 0, H);
        const spanX = Math.max(0, wMax.x - wMin.x);
        const spanY = Math.max(0, wMax.y - wMin.y);

        if (minorStep > 0 && minorStep * StudioState.zoom >= 8 && (spanX / minorStep) <= 240 && (spanY / minorStep) <= 240) {
          ctx.strokeStyle = isDarkBg ? 'rgba(148, 163, 184, 0.055)' : 'rgba(15, 23, 42, 0.045)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let gx = Math.floor(wMin.x / minorStep) * minorStep; gx <= wMax.x; gx += minorStep) {
            const sx = Math.round(StudioState.panX + gx * StudioState.zoom) + 0.5;
            ctx.moveTo(sx, 0); ctx.lineTo(sx, H);
          }
          for (let gy = Math.floor(wMin.y / minorStep) * minorStep; gy <= wMax.y; gy += minorStep) {
            const sy = Math.round(H - (StudioState.panY + gy * StudioState.zoom)) + 0.5;
            ctx.moveTo(0, sy); ctx.lineTo(W, sy);
          }
          ctx.stroke();
        }

        if (worldStep > 0 && (spanX / worldStep) <= 120 && (spanY / worldStep) <= 120) {
          ctx.strokeStyle = isDarkBg ? 'rgba(148, 163, 184, 0.13)' : 'rgba(15, 23, 42, 0.11)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let gx = Math.floor(wMin.x / worldStep) * worldStep; gx <= wMax.x; gx += worldStep) {
            const sx = Math.round(StudioState.panX + gx * StudioState.zoom) + 0.5;
            ctx.moveTo(sx, 0); ctx.lineTo(sx, H);
          }
          for (let gy = Math.floor(wMin.y / worldStep) * worldStep; gy <= wMax.y; gy += worldStep) {
            const sy = Math.round(H - (StudioState.panY + gy * StudioState.zoom)) + 0.5;
            ctx.moveTo(0, sy); ctx.lineTo(W, sy);
          }
          ctx.stroke();
        }
      }

      // UCS Origin (0,0,0) 2D/3D X/Y/Z Axis Triad Indicator
      const axisWorldLen = 48 / Math.max(1e-6, StudioState.zoom);
      const orig = project3DPoint(0, 0, 0, H);
      const xTip = project3DPoint(axisWorldLen, 0, 0, H);
      const yTip = project3DPoint(0, axisWorldLen, 0, H);
      const zTip = project3DPoint(0, 0, axisWorldLen, H);
      if (orig.x >= -150 && orig.x <= W + 150 && orig.y >= -150 && orig.y <= H + 150) {
        ctx.save();
        ctx.lineWidth = 1.8;
        // X Axis (Red)
        ctx.strokeStyle = '#ef4444';
        ctx.beginPath(); ctx.moveTo(orig.x, orig.y); ctx.lineTo(xTip.x, xTip.y); ctx.stroke();
        // Y Axis (Green)
        ctx.strokeStyle = '#22c55e';
        ctx.beginPath(); ctx.moveTo(orig.x, orig.y); ctx.lineTo(yTip.x, yTip.y); ctx.stroke();
        ctx.font = '700 10px Consolas, monospace';
        ctx.fillStyle = '#ef4444';
        ctx.fillText('X', xTip.x + 4, xTip.y + 3);
        ctx.fillStyle = '#22c55e';
        ctx.fillText('Y', yTip.x - 3, yTip.y - 5);
        // Z Axis (Blue) when 3D view is active
        if (is3DViewActive()) {
          ctx.strokeStyle = '#38bdf8';
          ctx.beginPath(); ctx.moveTo(orig.x, orig.y); ctx.lineTo(zTip.x, zTip.y); ctx.stroke();
          ctx.fillStyle = '#38bdf8';
          ctx.fillText('Z', zTip.x + 4, zTip.y - 4);
        }
        ctx.strokeStyle = isDarkBg ? '#94a3b8' : '#475569';
        ctx.strokeRect(orig.x - 3.5, orig.y - 3.5, 7, 7);
        ctx.restore();
      }
    }

    const ds = getDXFState();
    const parser = ensureActiveParser();
    if (!parser) return;

    // Viewport Frustum Culling Bounds in World Coordinates (Disabled in 3D view so rotated/tilted entities never clip)
    const is3DNow = is3DViewActive();
    const vMin = screenToWorld(-24, H + 24, H);
    const vMax = screenToWorld(W + 24, -24, H);
    const minWX = Math.min(vMin.x, vMax.x), maxWX = Math.max(vMin.x, vMax.x);
    const minWY = Math.min(vMin.y, vMax.y), maxWY = Math.max(vMin.y, vMax.y);
    const isVisibleInFrustum = (ent, pRef, panXOff = 0) => {
      if (is3DNow) return true;
      if (!pRef || !pRef.getEntityBBox) return true;
      const bb = pRef.getEntityBBox(ent);
      if (!bb || !isFinite(bb.minX)) return true;
      const xShift = panXOff / Math.max(1e-9, StudioState.zoom);
      return !(bb.maxX + xShift < minWX || bb.minX + xShift > maxWX || bb.maxY < minWY || bb.minY > maxWY);
    };

    // Draw interactive 3D Orbit Gimbal Sphere & Angle Readout when Orbit tool or 3D drag is active
    if (StudioState.activeTool === 'orbit' || StudioState.orbitDrag) {
      const piv = get3DPivot();
      const cScr = project3DPoint(piv.x, piv.y, piv.z, H);
      const rad = Math.max(76, Math.min(W, H) * 0.28);
      ctx.save();
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.65)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cScr.x, cScr.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Cardinal handles on orbit sphere
      [[cScr.x, cScr.y - rad], [cScr.x, cScr.y + rad], [cScr.x - rad, cScr.y], [cScr.x + rad, cScr.y]].forEach(([hx, hy]) => {
        ctx.fillStyle = '#10b981';
        ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill();
      });
      // Center pivot crosshair
      ctx.strokeStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(cScr.x - 8, cScr.y); ctx.lineTo(cScr.x + 8, cScr.y);
      ctx.moveTo(cScr.x, cScr.y - 8); ctx.lineTo(cScr.x, cScr.y + 8);
      ctx.stroke();
      ctx.font = '700 11px Consolas, monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`3D ORBIT · Yaw ${Math.round(StudioState.yaw || 0)}° · Pitch ${Math.round(StudioState.pitch || 0)}° · Roll ${Math.round(StudioState.roll || 0)}°`, cScr.x - 135, cScr.y + rad + 18);
      ctx.restore();
    }

    // 2. Render Entities (Single Active Slot vs Native Vector Overlay A↔B vs Side-by-Side A | B)
    if (StudioState.viewMode === 'side' && ds && ds.parsedA && ds.parsedB) {
      const halfW = Math.floor(W / 2);
      const diff = ds.lastEntityDiff || (ds.lastEntityDiff = DXFEngine.compareDXFEntities(ds.parsedA, ds.parsedB, {
        tol: ds.compareTol || 0.005,
        comparedLayers: ds.comparedLayers.size ? ds.comparedLayers : null,
        hiddenLayers: ds.hiddenLayers,
        frozenLayers: ds.frozenLayers,
        lockedLayers: ds.lockedLayers,
        ignoreLockedLayers: ds.ignoreLockedLayers,
        ignoreText: ds.ignoreText,
        ignoreDimensions: ds.ignoreDimensions,
        layerMapping: ds.layerMapping
      }));
      const remIds = new Set((diff.removed || []).map(e => e._id));
      const addIds = new Set((diff.added || []).map(e => e._id));
      const colRevA = getRevACompareColor(isDarkBg);
      const colRevB = getRevBCompareColor(isDarkBg);
      const colComm = getCommonCompareColor(isDarkBg);

      const drawSideDiffBoxes = (ent, pObj, boxCol, xOff = 0) => {
        if (StudioState.showDiffBoxes === false) return;
        if (typeof DXFEngine === 'undefined' || typeof DXFEngine.computeSteppedDiffBoxes !== 'function') return;
        const uInfo = (pObj && pObj.unitName && DXFEngine.UNITS && DXFEngine.UNITS[pObj.unitName]) ? DXFEngine.UNITS[pObj.unitName] : { toMils: 39.3700787 };
        const boxMils = (ds && Number(ds.highlightBoxMils) > 0) ? Number(ds.highlightBoxMils) : 7;
        const boxes = DXFEngine.computeSteppedDiffBoxes(ent, (wx, wy) => {
          const sp = worldToScreen(wx, wy, H, StudioState.panX + xOff);
          return [sp.x, sp.y];
        }, {
          boxSizeMils: boxMils,
          toMils: uInfo.toMils || 39.3700787,
          scale: StudioState.zoom || 1,
          canvasW: W,
          canvasH: H,
          parser: pObj
        });
        if (!boxes.length) return;
        ctx.save();
        ctx.strokeStyle = boxCol;
        let fillRgba = 'rgba(239, 68, 68, 0.22)';
        if (boxCol && /^#[0-9a-f]{6}$/i.test(boxCol)) {
          const rC = parseInt(boxCol.slice(1, 3), 16), gC = parseInt(boxCol.slice(3, 5), 16), bC = parseInt(boxCol.slice(5, 7), 16);
          fillRgba = `rgba(${rC}, ${gC}, ${bC}, 0.22)`;
        }
        ctx.fillStyle = fillRgba;
        ctx.lineWidth = 1.75;
        ctx.setLineDash([]);
        ctx.beginPath();
        for (const sb of boxes) {
          ctx.fillRect(sb.x, sb.y, sb.w, sb.h);
          ctx.rect(sb.x, sb.y, sb.w, sb.h);
        }
        ctx.stroke();
        ctx.restore();
      };

      // Left Viewport: Rev A
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, halfW, H); ctx.clip();
      for (const ent of ds.parsedA.entities) {
        if (!isLayerVisible(ds.parsedA, ent.layer)) continue;
        if (ds.comparedLayers.size > 0 && !ds.comparedLayers.has(ent.layer)) continue;
        if (!isVisibleInFrustum(ent, ds.parsedA, 0)) continue;
        const isSel = StudioState.selectedIds.has(ent._id);
        const isHov = StudioState.hoveredId === ent._id;
        const isRem = remIds.has(ent._id);
        const col = isSel ? '#38bdf8' : (isHov ? '#fbbf24' : (isRem ? colRevA : colComm));
        drawSingleEntityOnCtx(ctx, ent, ds.parsedA, H, isDarkBg, col, isSel ? 1.8 : (isHov ? 1.0 : (isRem ? 0.8 : 0)), StudioState.panX);
      }
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(10, 10, 165, 22);
      ctx.fillStyle = colRevA;
      ctx.font = '700 11px Consolas, monospace';
      ctx.fillText(`REV A: ${(ds.nameA || 'Base.dxf').slice(0, 16)}`, 16, 25);
      ctx.restore();

      // Right Viewport: Rev B (using normalized cross-unit coordinates when unitRatio !== 1)
      ctx.save();
      ctx.beginPath(); ctx.rect(halfW, 0, W - halfW, H); ctx.clip();
      for (const ent of ds.parsedB.entities) {
        if (!isLayerVisible(ds.parsedB, ent.layer)) continue;
        if (ds.comparedLayers.size > 0 && !ds.comparedLayers.has(ent.layer)) continue;
        const drawEnt = ent._normEnt || ent;
        if (!isVisibleInFrustum(drawEnt, ds.parsedB, halfW)) continue;
        const isSel = StudioState.selectedIds.has(ent._id);
        const isHov = StudioState.hoveredId === ent._id;
        const isAdd = addIds.has(ent._id);
        const col = isSel ? '#38bdf8' : (isHov ? '#fbbf24' : (isAdd ? colRevB : colComm));
        drawSingleEntityOnCtx(ctx, drawEnt, ds.parsedB, H, isDarkBg, col, isSel ? 1.8 : (isHov ? 1.0 : (isAdd ? 0.8 : 0)), StudioState.panX + halfW);
      }
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(halfW + 10, 10, 165, 22);
      ctx.fillStyle = colRevB;
      ctx.font = '700 11px Consolas, monospace';
      ctx.fillText(`REV B: ${(ds.nameB || 'RevB.dxf').slice(0, 16)}`, halfW + 16, 25);
      ctx.restore();

      // Center Divider Line
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(halfW, 0); ctx.lineTo(halfW, H); ctx.stroke();
      ctx.restore();
    } else if (StudioState.viewMode === 'overlay' && ds && ds.parsedA && ds.parsedB) {
      const diff = ds.lastEntityDiff || (ds.lastEntityDiff = DXFEngine.compareDXFEntities(ds.parsedA, ds.parsedB, {
        tol: ds.compareTol || 0.005,
        comparedLayers: ds.comparedLayers.size ? ds.comparedLayers : null,
        hiddenLayers: ds.hiddenLayers,
        frozenLayers: ds.frozenLayers,
        lockedLayers: ds.lockedLayers,
        ignoreLockedLayers: ds.ignoreLockedLayers,
        ignoreText: ds.ignoreText,
        ignoreDimensions: ds.ignoreDimensions,
        layerMapping: ds.layerMapping
      }));
      const remIds = new Set((diff.removed || []).map(e => e._id));
      const addIds = new Set((diff.added || []).map(e => e._id));
      const colRevA = getRevACompareColor(isDarkBg);
      const colRevB = getRevBCompareColor(isDarkBg);
      const colComm = getCommonCompareColor(isDarkBg);
      for (const ent of ds.parsedA.entities) {
        if (!isLayerVisible(ds.parsedA, ent.layer)) continue;
        if (ds.comparedLayers.size > 0 && !ds.comparedLayers.has(ent.layer)) continue;
        if (!remIds.has(ent._id)) {
          if (!isVisibleInFrustum(ent, ds.parsedA, 0)) continue;
          const isSel = StudioState.selectedIds.has(ent._id);
          const isHov = StudioState.hoveredId === ent._id;
          drawSingleEntityOnCtx(ctx, ent, ds.parsedA, H, isDarkBg, isSel ? '#38bdf8' : (isHov ? '#fbbf24' : colComm), isSel ? 1.8 : (isHov ? 1.0 : 0));
        }
      }
      const drawEntityWithPreciseSubSegments = (ent, pObj, diffCol) => {
        const isSel = StudioState.selectedIds.has(ent._id);
        const isHov = StudioState.hoveredId === ent._id;
        const activeCol = isSel ? '#38bdf8' : (isHov ? '#fbbf24' : diffCol);
        const activeExtra = isSel ? 1.8 : (isHov ? 1.0 : 0);
        if ((Array.isArray(ent._commonSubSegments) && ent._commonSubSegments.length > 0) || (Array.isArray(ent._diffSubSegments) && ent._diffSubSegments.length > 0)) {
          if (Array.isArray(ent._commonSubSegments)) {
            for (const cSeg of ent._commonSubSegments) {
              drawSingleEntityOnCtx(ctx, cSeg, pObj, H, isDarkBg, colComm, 0);
            }
          }
          if ((ent.type === 'INSERT' || ent.type === 'DIMENSION') && ent.blockName && pObj && (ent._diffSubIndices instanceof Set)) {
            const blk = pObj._getBlock ? pObj._getBlock(ent.blockName) : (pObj.blocks && pObj.blocks[ent.blockName]);
            if (blk && Array.isArray(blk.entities)) {
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
                  drawSingleEntityOnCtx(ctx, se, pObj, H, isDarkBg, colComm, 0, StudioState.panX, tf, 1, isDim);
                }
              }
            }
          }
          if (Array.isArray(ent._diffSubSegments)) {
            for (const dSeg of ent._diffSubSegments) {
              drawSingleEntityOnCtx(ctx, dSeg, pObj, H, isDarkBg, activeCol, activeExtra + 0.8);
            }
          }
          if (Array.isArray(ent._diffTextEntities) && ent._diffTextEntities.length > 0) {
            for (const dte of ent._diffTextEntities) {
              drawSingleEntityOnCtx(ctx, dte, pObj, H, isDarkBg, activeCol, activeExtra + 0.8);
            }
          } else if (ent.type === 'DIMENSION' && (!ent._diffSubSegments || ent._diffSubSegments.length === 0)) {
            drawSingleEntityOnCtx(ctx, ent, pObj, H, isDarkBg, activeCol, activeExtra + 0.8);
          }
        } else {
          drawSingleEntityOnCtx(ctx, ent, pObj, H, isDarkBg, activeCol, activeExtra + 0.8);
        }
      };
      const drawSteppedBoxesForEntity = (ent, pObj, boxCol) => {
        if (StudioState.showDiffBoxes === false) return;
        if (typeof DXFEngine === 'undefined' || typeof DXFEngine.computeSteppedDiffBoxes !== 'function') return;
        const uInfo = (pObj && pObj.unitName && DXFEngine.UNITS && DXFEngine.UNITS[pObj.unitName]) ? DXFEngine.UNITS[pObj.unitName] : { toMils: 39.3700787 };
        const boxMils = (ds && Number(ds.highlightBoxMils) > 0) ? Number(ds.highlightBoxMils) : 7;
        const boxes = DXFEngine.computeSteppedDiffBoxes(ent, (wx, wy) => {
          const sp = worldToScreen(wx, wy, H);
          return [sp.x, sp.y];
        }, {
          boxSizeMils: boxMils,
          toMils: uInfo.toMils || 39.3700787,
          scale: StudioState.zoom || 1,
          canvasW: W,
          canvasH: H,
          parser: pObj
        });
        if (!boxes.length) return;
        ctx.save();
        ctx.strokeStyle = boxCol;
        let fillRgba = 'rgba(239, 68, 68, 0.22)';
        if (boxCol && /^#[0-9a-f]{6}$/i.test(boxCol)) {
          const rC = parseInt(boxCol.slice(1, 3), 16), gC = parseInt(boxCol.slice(3, 5), 16), bC = parseInt(boxCol.slice(5, 7), 16);
          fillRgba = `rgba(${rC}, ${gC}, ${bC}, 0.22)`;
        }
        ctx.fillStyle = fillRgba;
        ctx.lineWidth = 1.75;
        ctx.setLineDash([]);
        ctx.beginPath();
        for (const sb of boxes) {
          ctx.fillRect(sb.x, sb.y, sb.w, sb.h);
          ctx.rect(sb.x, sb.y, sb.w, sb.h);
        }
        ctx.stroke();
        ctx.restore();
      };
      for (const ent of ds.parsedA.entities) {
        if (!isLayerVisible(ds.parsedA, ent.layer)) continue;
        if (ds.comparedLayers.size > 0 && !ds.comparedLayers.has(ent.layer)) continue;
        if (remIds.has(ent._id)) {
          if (!isVisibleInFrustum(ent, ds.parsedA, 0)) continue;
          drawEntityWithPreciseSubSegments(ent, ds.parsedA, colRevA);
        }
      }
      for (const ent of ds.parsedB.entities) {
        if (!isLayerVisible(ds.parsedB, ent.layer)) continue;
        if (ds.comparedLayers.size > 0 && !ds.comparedLayers.has(ent.layer)) continue;
        if (addIds.has(ent._id)) {
          const drawEnt = ent._normEnt || ent;
          if (!isVisibleInFrustum(drawEnt, ds.parsedB, 0)) continue;
          drawEntityWithPreciseSubSegments(drawEnt, ds.parsedB, colRevB);
        }
      }
    } else {
      for (const ent of parser.entities) {
        if (!isLayerVisible(parser, ent.layer)) continue;
        if (!isVisibleInFrustum(ent, parser, 0)) continue;
        const isSel = StudioState.selectedIds.has(ent._id);
        const isHov = StudioState.hoveredId === ent._id;
        if (isSel) {
          drawSingleEntityOnCtx(ctx, ent, parser, H, isDarkBg, '#38bdf8', 1.8);
        } else if (isHov) {
          drawSingleEntityOnCtx(ctx, ent, parser, H, isDarkBg, '#fbbf24', 1.0);
        } else {
          drawSingleEntityOnCtx(ctx, ent, parser, H, isDarkBg, null, 0);
        }
      }
    }

    // 3. Draw Blue AutoCAD Grip Handles on Selected Entities
    if (StudioState.selectedIds.size > 0 && StudioState.selectedIds.size <= 40) {
      for (const ent of parser.entities) {
        if (!StudioState.selectedIds.has(ent._id)) continue;
        const grips = getEntityGrips(ent);
        for (const g of grips) {
          const sp = worldToScreen(g.x, g.y, H);
          ctx.fillStyle = '#0284c7';
          ctx.strokeStyle = '#e0f2fe';
          ctx.lineWidth = 1.3;
          ctx.fillRect(sp.x - 4.5, sp.y - 4.5, 9, 9);
          ctx.strokeRect(sp.x - 4.5, sp.y - 4.5, 9, 9);
        }
      }
    }

    // 4. Draw Active Command Rubber-Band & Live Ghost Preview
    if (StudioState.tempPoints.length > 0) {
      const pts = StudioState.tempPoints;
      const cur = StudioState.cursorWorld;
      const p0 = worldToScreen(pts[0].x, pts[0].y, H);
      const pCur = worldToScreen(cur.x, cur.y, H);
      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([6, 4]);

      const t = StudioState.activeTool;
      if (t === 'line' || t === 'move' || t === 'copy' || t === 'rotate' || t === 'scale' || t === 'mirror' || t === 'dim') {
        const last = worldToScreen(pts[pts.length - 1].x, pts[pts.length - 1].y, H);
        ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(pCur.x, pCur.y); ctx.stroke();

        // Live Ghost Preview of transformed selected entities for Move, Copy, Rotate, Scale, Mirror
        if (['move', 'copy', 'rotate', 'scale', 'mirror'].includes(t) && StudioState.selectedIds.size > 0) {
          const selEnts = parser.entities.filter(e => StudioState.selectedIds.has(e._id) && !isLayerLocked(parser, e.layer));
          if (selEnts.length <= 250) {
            for (const se of selEnts) {
              const ghost = cloneEntity(se);
              if (t === 'move' || t === 'copy') {
                translateEntity(ghost, cur.x - pts[0].x, cur.y - pts[0].y, null);
              } else if (t === 'rotate') {
                const angDeg = Math.atan2(cur.y - pts[0].y, cur.x - pts[0].x) * 180 / Math.PI;
                rotateEntity(ghost, pts[0].x, pts[0].y, angDeg, null);
              } else if (t === 'scale') {
                const dist = Math.hypot(cur.x - pts[0].x, cur.y - pts[0].y);
                const factor = Math.max(0.05, Math.min(20, dist / 25));
                scaleEntity(ghost, pts[0].x, pts[0].y, factor, null);
              } else if (t === 'mirror') {
                mirrorEntity(ghost, pts[0].x, pts[0].y, cur.x, cur.y, null);
              }
              drawSingleEntityOnCtx(ctx, ghost, parser, H, isDarkBg, 'rgba(56, 189, 248, 0.72)', 0.5);
            }
          } else if (t === 'move' || t === 'copy') {
            let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
            for (const se of selEnts) {
              const bb = parser.getEntityBBox ? parser.getEntityBBox(se) : se._bbox;
              if (bb && isFinite(bb.minX)) {
                if (bb.minX < bMinX) bMinX = bb.minX; if (bb.maxX > bMaxX) bMaxX = bb.maxX;
                if (bb.minY < bMinY) bMinY = bb.minY; if (bb.maxY > bMaxY) bMaxY = bb.maxY;
              }
            }
            if (isFinite(bMinX)) {
              const dxM = cur.x - pts[0].x, dyM = cur.y - pts[0].y;
              const s0 = worldToScreen(bMinX + dxM, bMaxY + dyM, H);
              const s1 = worldToScreen(bMaxX + dxM, bMinY + dyM, H);
              ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
              ctx.strokeRect(s0.x, s0.y, s1.x - s0.x, s1.y - s0.y);
            }
          }
        }
      } else if (t === 'polyline' || t === 'spline' || t === 'hatch') {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < pts.length; i++) {
          const sp = worldToScreen(pts[i].x, pts[i].y, H);
          ctx.lineTo(sp.x, sp.y);
        }
        ctx.lineTo(pCur.x, pCur.y);
        if (t === 'hatch') ctx.closePath();
        ctx.stroke();
      } else if (t === 'rect' || t === 'revcloud' || t === 'box3d') {
        const rx = Math.min(p0.x, pCur.x), ry = Math.min(p0.y, pCur.y);
        const rw = Math.abs(pCur.x - p0.x), rh = Math.abs(pCur.y - p0.y);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.fillRect(rx, ry, rw, rh);
        const wWorld = Math.abs(cur.x - pts[0].x).toFixed(2);
        const hWorld = Math.abs(cur.y - pts[0].y).toFixed(2);
        ctx.setLineDash([]);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(pCur.x + 8, pCur.y - 22, 118, 18);
        ctx.fillStyle = '#fbbf24';
        ctx.font = '700 11px Consolas, monospace';
        ctx.fillText(`W:${wWorld} × H:${hWorld}`, pCur.x + 12, pCur.y - 9);
      } else if (t === 'triangle') {
        const triW = cur.x - pts[0].x;
        const triH = cur.y - pts[0].y;
        const tPts = buildTrianglePoints(pts[0].x, pts[0].y, Math.abs(triW) > 1e-3 ? triW : 1, Math.abs(triH) > 1e-3 ? triH : 1, StudioState.triangleType);
        const s0 = worldToScreen(tPts[0][0], tPts[0][1], H);
        const s1 = worldToScreen(tPts[1][0], tPts[1][1], H);
        const s2 = worldToScreen(tPts[2][0], tPts[2][1], H);
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.closePath();
        ctx.fill();
        ctx.stroke();
        const wWorld = Math.abs(triW).toFixed(2);
        const hWorld = (StudioState.triangleType === 'equilateral' ? Math.abs(triW) * Math.sqrt(3) / 2 : Math.abs(triH)).toFixed(2);
        ctx.setLineDash([]);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(pCur.x + 8, pCur.y - 22, 132, 18);
        ctx.fillStyle = '#38bdf8';
        ctx.font = '700 11px Consolas, monospace';
        ctx.fillText(`△ W:${wWorld} × H:${hWorld}`, pCur.x + 12, pCur.y - 9);
      } else if (t === 'polygon') {
        const nSides = Math.max(3, Math.min(36, parseInt(StudioState.polygonSides || 6, 10) || 6));
        const rPx = Math.max(2, Math.hypot(pCur.x - p0.x, pCur.y - p0.y));
        const a0 = Math.atan2(pCur.y - p0.y, pCur.x - p0.x);
        ctx.beginPath();
        for (let i = 0; i < nSides; i++) {
          const ang = a0 + (i * 2 * Math.PI) / nSides;
          const vx = p0.x + rPx * Math.cos(ang), vy = p0.y + rPx * Math.sin(ang);
          if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (t === 'xline' || t === 'leader' || t === 'measure') {
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(pCur.x, pCur.y); ctx.stroke();
      } else if (t === 'circle' || t === 'arc' || t === 'ellipse') {
        const rPx = Math.hypot(pCur.x - p0.x, pCur.y - p0.y);
        ctx.beginPath(); ctx.arc(p0.x, p0.y, Math.max(1, rPx), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    } else if (StudioState.activeTool === 'offset' && StudioState.matchSourceEnt) {
      // Live Ghost Preview for Offset
      const ghost = createOffsetEntity(StudioState.matchSourceEnt, StudioState.cursorWorld, StudioState.offsetDistance);
      if (ghost) drawSingleEntityOnCtx(ctx, ghost, parser, H, isDarkBg, 'rgba(56, 189, 248, 0.75)', 0.6);
    }

    // 5. Draw Window (Blue) / Crossing (Green Dashed) Selection Box
    if (StudioState.dragBox) {
      const b = StudioState.dragBox;
      const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1);
      const w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0);
      ctx.save();
      if (b.crossing) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
        ctx.strokeStyle = '#10b981';
        ctx.setLineDash([6, 4]);
      } else {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
        ctx.strokeStyle = '#38bdf8';
        ctx.setLineDash([]);
      }
      ctx.lineWidth = 1.4;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }

    // 6. Draw Magnetic OSNAP Indicator
    if (StudioState.snapPoint) {
      const sp = worldToScreen(StudioState.snapPoint.x, StudioState.snapPoint.y, H);
      ctx.save();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      const st = StudioState.snapPoint.type;
      if (st === 'ENDPOINT') {
        ctx.strokeRect(sp.x - 6, sp.y - 6, 12, 12);
      } else if (st === 'MIDPOINT') {
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y - 7);
        ctx.lineTo(sp.x - 7, sp.y + 6);
        ctx.lineTo(sp.x + 7, sp.y + 6);
        ctx.closePath();
        ctx.stroke();
      } else if (st === 'CENTER' || st === 'QUADRANT') {
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(sp.x - 6, sp.y - 6); ctx.lineTo(sp.x + 6, sp.y + 6);
        ctx.moveTo(sp.x + 6, sp.y - 6); ctx.lineTo(sp.x - 6, sp.y + 6);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(sp.x + 10, sp.y - 18, 72, 16);
      ctx.fillStyle = '#10b981';
      ctx.font = '700 10px Consolas, monospace';
      ctx.fillText(st, sp.x + 14, sp.y - 7);
      ctx.restore();
    }

    // 7. Dynamic Input HUD (Live Distance, Angle & 3D Coordinate Readout beside Cursor)
    if (StudioState.dynInputEnabled && StudioState.tempPoints.length > 0) {
      const last = StudioState.tempPoints[StudioState.tempPoints.length - 1];
      const cur = StudioState.cursorWorld;
      const pCur = worldToScreen(cur.x, cur.y, H);
      const dist = Math.hypot(cur.x - last.x, cur.y - last.y);
      const ang = ((Math.atan2(cur.y - last.y, cur.x - last.x) * 180) / Math.PI + 360) % 360;
      const hudTxt = `L=${dist.toFixed(2)} ${parser.unitName}  ∠${ang.toFixed(1)}°`;
      ctx.save();
      ctx.font = '700 11.5px "Segoe UI", system-ui, Consolas, sans-serif';
      const tw = ctx.measureText(hudTxt).width + 16;
      const bh = 22;
      const hx = Math.min(W - tw - 8, pCur.x + 14);
      const hy = Math.max(24, pCur.y + 22);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(hx, hy - bh / 2, tw, bh, 5);
      else ctx.rect(hx, hy - bh / 2, tw, bh);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hudTxt, hx + tw / 2, hy);
      ctx.restore();
    }
  }

  // ==========================================================================
  // INTERACTIVE DRAWING & MODIFY TOOL EXECUTION
  // ==========================================================================
  function setActiveTool(tool) {
    if (tool && tool !== 'select' && tool !== 'pan') {
      StudioState.lastTool = tool;
    }
    StudioState.activeTool = tool || 'select';
    if (StudioState.activeTool === 'orbit') {
      ensure3DModelspaceReady();
      if (Math.abs(StudioState.yaw || 0) < 1e-3 && Math.abs(StudioState.pitch || 0) < 1e-3) {
        StudioState.viewPreset = 'sw_iso';
        StudioState.yaw = VIEW_PRESETS.sw_iso.yaw;
        StudioState.pitch = VIEW_PRESETS.sw_iso.pitch;
        StudioState.roll = VIEW_PRESETS.sw_iso.roll;
      }
      if (StudioState.visualStyle === '2d') {
        StudioState.visualStyle = '3d_shaded';
      }
      center3DPivotInViewport();
      syncViewCubeControls();
    }
    const cvEl = $('#dxf-canvas');
    if (cvEl) {
      cvEl.style.cursor = StudioState.activeTool === 'orbit' ? 'grab' : (StudioState.activeTool === 'pan' ? 'grab' : 'crosshair');
    }
    StudioState.tempPoints = [];
    StudioState.matchSourceEnt = null;
    if (typeof document !== 'undefined') document.querySelectorAll('#view-dxf [data-dxf-tool]').forEach(btn => {
      btn.classList.toggle('on', btn.dataset.dxfTool === StudioState.activeTool);
    });
    const prompts = {
      select: 'Select mode: Click entity, drag Window (L→R blue) / Crossing (R→L green), or drag blue vertex grips.',
      pan: 'Pan mode: Drag canvas to pan modelspace.',
      line: 'LINE: Click start point, then next point(s). Press Enter or Esc to finish.',
      polyline: 'PLINE: Click vertices to draw LWPOLYLINE. Press Enter or double-click to finish.',
      rect: 'RECTANG: Click first corner point, then opposite corner point (uses active Thickness/Lineweight).',
      triangle: StudioState.triangleFixedSize
        ? `TRIANGLE (1-Click Fixed W=${StudioState.triangleWidth} × H=${StudioState.triangleHeight}, ${StudioState.triangleType}): Click anywhere to place triangle.`
        : `TRIANGLE (${StudioState.triangleType}): Click base corner, then drag/click opposite corner to set Width & Height — or enable 1-Click W×H in the ribbon.`,
      circle: 'CIRCLE: Click center point, then radius point.',
      arc: 'ARC: Click center point, then radius/start point, then end angle point.',
      ellipse: 'ELLIPSE: Click center point, then major axis endpoint.',
      spline: 'SPLINE: Click control points, then press Enter or double-click to finish.',
      text: 'TEXT: Click insertion point to place CAD text annotation.',
      dim: 'DIMENSION: Click first extension origin, then second extension point.',
      hatch: 'HATCH / SOLID: Click polygon boundary vertices, then press Enter to fill.',
      point: 'POINT: Click anywhere in modelspace to place a CAD POINT.',
      insert: `INSERT BLOCK (${StudioState.activeBlockName}): Click insertion point in modelspace.`,
      move: 'MOVE: Select entities first, then click base point and destination point.',
      copy: 'COPY: Select entities first, then click base point and destination point(s).',
      rotate: 'ROTATE: Select entities first, then click base point and rotation angle.',
      scale: 'SCALE: Select entities first, then click base point and scale reference.',
      mirror: 'MIRROR: Select entities first, then click 2 points defining the mirror line.',
      offset: `OFFSET (Dist=${StudioState.offsetDistance}): Click an entity (Line, Polyline, Circle, Arc), then click side to offset.`,
      trim: 'TRIM: Click any LINE or LWPOLYLINE segment to trim it at its nearest cutting edges.',
      extend: 'EXTEND: Click near the end of any LINE to extend it to the nearest boundary.',
      fillet: `FILLET (R=${StudioState.filletRadius}): Click first LINE, then second intersecting LINE to join with radius ${StudioState.filletRadius}.`,
      matchprop: 'MATCHPROP: Click source entity to copy properties from, then click target entity.'
    };
    const pill = $('#dxf-active-tool-pill');
    const pillName = $('#dxf-active-tool-name');
    if (pill && pillName) {
      const isAct = StudioState.activeTool && StudioState.activeTool !== 'select';
      pill.hidden = !isAct;
      if (isAct) {
        pillName.textContent = `Tool: ${StudioState.activeTool.toUpperCase()}`;
      }
    }
    logCommand(prompts[StudioState.activeTool] || `Active tool: ${StudioState.activeTool.toUpperCase()}`);
    renderCanvas();
    updateStatusBar();
  }

  function createBaseEntityProps(type) {
    const parser = ensureActiveParser(true);
    const lyr = StudioState.currentLayer || '0';
    if (parser && parser.layers && !parser.layers[lyr]) {
      parser.addLayer(lyr, { color: 7 });
    }
    const newId = `ent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    if (StudioState.uncommittedEntityIds) {
      StudioState.uncommittedEntityIds.add(newId);
    }
    const actCol = StudioState.activeColor;
    const isCustom = actCol === 'CUSTOM';
    const isAci = !isCustom && actCol !== 'BYLAYER' && Number.isFinite(parseInt(actCol, 10));
    const aciVal = isAci ? parseInt(actCol, 10) : (isCustom && typeof DXFEngine !== 'undefined' && DXFEngine.hexToNearestACI ? DXFEngine.hexToNearestACI(StudioState.activeCustomHex) : null);
    const tcVal = isCustom && typeof DXFEngine !== 'undefined' && DXFEngine.hexToTrueColor ? DXFEngine.hexToTrueColor(StudioState.activeCustomHex) : null;
    return {
      _id: newId,
      handle: Math.floor(Math.random() * 0xFFFFF).toString(16).toUpperCase(),
      type,
      layer: lyr,
      color: aciVal,
      trueColor: tcVal,
      customHex: isCustom ? StudioState.activeCustomHex : null,
      linetype: StudioState.activeLinetype !== 'BYLAYER' ? StudioState.activeLinetype : 'BYLAYER',
      lineweight: StudioState.activeLineweight,
      elevation: StudioState.defaultElevation || 0,
      thickness: StudioState.defaultThickness || 0
    };
  }

  async function handleCanvasClickPoint(pt) {
    const parser = ensureActiveParser(true);
    if (!parser) return;
    const t = StudioState.activeTool;

    if (isLayerLocked(parser, StudioState.currentLayer) && ['line', 'polyline', 'rect', 'triangle', 'polygon', 'donut', 'revcloud', 'box3d', 'xline', 'circle', 'arc', 'ellipse', 'spline', 'text', 'dim', 'dimang', 'dimrad', 'dimdia', 'leader', 'hatch', 'point', 'insert'].includes(t)) {
      toast(`Current layer "${StudioState.currentLayer}" is LOCKED. Unlock it first to draw new entities.`);
      logCommand(`Blocked: Layer "${StudioState.currentLayer}" is locked.`);
      return;
    }

    if (t === 'break') {
      const hit = findEntityAt(pt.x, pt.y);
      if (!hit) { logCommand('BREAK: Click directly on a LINE, ARC, or CIRCLE to split it at that point.'); return; }
      const brkRes = breakEntityAtPoint(hit, pt.x, pt.y, parser);
      if (brkRes && brkRes.ok && brkRes.created) {
        StudioState.selectedIds = new Set([hit._id, brkRes.created._id]);
        refreshAllUI();
      }
      return;
    }

    if (t === 'point') {
      pushUndoSnapshot('Draw Point');
      const ent = { ...createBaseEntityProps('POINT'), x: pt.x, y: pt.y };
      parser.entities.push(ent);
      syncParserMutation();
      StudioState.selectedIds = new Set([ent._id]);
      refreshAllUI();
      logCommand(`Placed POINT at (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}) on layer ${ent.layer}.`);
      return;
    }

    if (t === 'text') {
      let str = 'ENGINEERING NOTE';
      let hVal = StudioState.textHeight || 3.5;
      if (typeof window !== 'undefined' && window.dialog) {
        const r = await window.dialog('Insert AutoCAD Text (TEXT / MTEXT)', [
          { type: 'text', id: 'txt', label: 'Text String', value: 'REV B MODIFIED' },
          { type: 'number', id: 'h', label: `Text Height (${parser.unitName})`, value: hVal, min: 0.2, step: 0.5 },
          { type: 'number', id: 'rot', label: 'Rotation Angle (°)', value: 0, min: -360, max: 360, step: 15 }
        ], 'Place Text');
        if (!r || !r.txt) return;
        str = r.txt;
        hVal = parseFloat(r.h) || hVal;
        StudioState.textHeight = hVal;
        if ($('#dxf-st-texth-val')) $('#dxf-st-texth-val').value = hVal;
        pushUndoSnapshot('Insert Text');
        const ent = syncGeom({ ...createBaseEntityProps('TEXT'), x: pt.x, y: pt.y, height: hVal, rotation: parseFloat(r.rot) || 0, text: str });
        parser.entities.push(ent);
      } else {
        pushUndoSnapshot('Insert Text');
        const ent = syncGeom({ ...createBaseEntityProps('TEXT'), x: pt.x, y: pt.y, height: hVal, rotation: 0, text: str });
        parser.entities.push(ent);
      }
      syncParserMutation();
      refreshAllUI();
      setActiveTool('select');
      return;
    }

    if (t === 'insert') {
      ensureStandardBlocksOnParser(parser);
      const blkNames = Object.keys(parser.blocks || {});
      let chosenBlk = StudioState.activeBlockName || blkNames[0] || 'FIDUCIAL_TARGET';
      let scVal = 1.0, rotVal = 0;
      if (typeof window !== 'undefined' && window.dialog && blkNames.length > 0) {
        const r = await window.dialog('Insert AutoCAD Block Reference (INSERT)', [
          { type: 'select', id: 'blk', label: 'Block Definition', value: chosenBlk, options: blkNames.map(n => ({ label: n, value: n })) },
          { type: 'number', id: 'sc', label: 'Scale Factor', value: 1.0, min: 0.1, step: 0.25 },
          { type: 'number', id: 'rot', label: 'Rotation Angle (°)', value: 0, min: -360, max: 360, step: 15 }
        ], 'Insert Block');
        if (!r) return;
        chosenBlk = r.blk || chosenBlk;
        scVal = parseFloat(r.sc) || 1.0;
        rotVal = parseFloat(r.rot) || 0;
        StudioState.activeBlockName = chosenBlk;
      }
      pushUndoSnapshot(`Insert Block ${chosenBlk}`);
      const ent = syncGeom({ ...createBaseEntityProps('INSERT'), blockName: chosenBlk, x: pt.x, y: pt.y, scaleX: scVal, scaleY: scVal, rotation: rotVal });
      parser.entities.push(ent);
      syncParserMutation();
      StudioState.selectedIds = new Set([ent._id]);
      refreshAllUI();
      setActiveTool('select');
      logCommand(`Inserted block "${chosenBlk}" at (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}).`);
      return;
    }

    if (t === 'trim') {
      const hit = findEntityAt(pt.x, pt.y);
      if (!hit) return logCommand('TRIM: No entity found at cursor.');
      if (isLayerLocked(parser, hit.layer)) return toast(`Layer "${hit.layer}" is LOCKED.`);
      pushUndoSnapshot('Trim Entity');
      if (trimEntityAtPoint(hit, pt.x, pt.y, parser)) {
        syncParserMutation();
        refreshAllUI();
        logCommand(`Trimmed ${hit.type} on layer ${hit.layer}.`);
      }
      return;
    }

    if (t === 'extend') {
      const hit = findEntityAt(pt.x, pt.y);
      if (!hit) return logCommand('EXTEND: Click near the endpoint of a LINE.');
      if (isLayerLocked(parser, hit.layer)) return toast(`Layer "${hit.layer}" is LOCKED.`);
      pushUndoSnapshot('Extend Entity');
      if (extendEntityAtPoint(hit, pt.x, pt.y, parser)) {
        syncParserMutation();
        refreshAllUI();
        logCommand(`Extended ${hit.type} on layer ${hit.layer}.`);
      }
      return;
    }

    if (t === 'fillet') {
      const hit = findEntityAt(pt.x, pt.y);
      if (!hit || hit.type !== 'LINE') return logCommand('FILLET: Click a LINE entity.');
      if (!StudioState.matchSourceEnt) {
        StudioState.matchSourceEnt = hit;
        logCommand(`FILLET (R=${StudioState.filletRadius}): First line selected. Now click the second intersecting LINE.`);
      } else {
        pushUndoSnapshot('Fillet Lines');
        if (filletTwoLines(StudioState.matchSourceEnt, hit, StudioState.filletRadius, parser)) {
          syncParserMutation();
          refreshAllUI();
          logCommand(`Applied Fillet (R=${StudioState.filletRadius}) between two intersecting lines.`);
        }
        StudioState.matchSourceEnt = null;
      }
      return;
    }

    if (t === 'chamfer') {
      const hit = findEntityAt(pt.x, pt.y);
      if (!hit || hit.type !== 'LINE') return logCommand('CHAMFER: Click a LINE entity.');
      if (!StudioState.matchSourceEnt) {
        StudioState.matchSourceEnt = hit;
        logCommand(`CHAMFER (D1=${StudioState.chamferDist1}, D2=${StudioState.chamferDist2}): First line selected. Click second intersecting LINE.`);
      } else {
        pushUndoSnapshot('Chamfer Lines');
        if (chamferTwoLines(StudioState.matchSourceEnt, hit, StudioState.chamferDist1, StudioState.chamferDist2, parser)) {
          syncParserMutation();
          refreshAllUI();
          logCommand(`Applied Chamfer (${StudioState.chamferDist1} × ${StudioState.chamferDist2}) between two intersecting lines.`);
        }
        StudioState.matchSourceEnt = null;
      }
      return;
    }

    if (t === 'donut') {
      pushUndoSnapshot('Draw Donut');
      const ent = createDonutEntity(pt.x, pt.y, StudioState.donutInnerR, StudioState.donutOuterR);
      parser.entities.push(ent);
      syncParserMutation();
      StudioState.selectedIds = new Set([ent._id]);
      refreshAllUI();
      logCommand(`Placed DONUT (ID=${(StudioState.donutInnerR * 2).toFixed(2)}, OD=${(StudioState.donutOuterR * 2).toFixed(2)}) at (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}).`);
      return;
    }

    if (t === 'id') {
      const zVal = StudioState.defaultElevation || 0;
      const msg = `ID Coordinate: X = ${pt.x.toFixed(4)} ${parser.unitName},  Y = ${pt.y.toFixed(4)} ${parser.unitName},  Z = ${zVal.toFixed(4)} ${parser.unitName}`;
      logCommand(msg);
      toast(msg);
      return;
    }

    if (t === 'dimrad' || t === 'dimdia') {
      const hit = findEntityAt(pt.x, pt.y);
      if (!hit || (hit.type !== 'CIRCLE' && hit.type !== 'ARC')) {
        logCommand(`${t.toUpperCase()}: Click on a CIRCLE or ARC entity.`);
        return;
      }
      pushUndoSnapshot(t === 'dimrad' ? 'Radius Dimension' : 'Diameter Dimension');
      const r = hit.r || 10;
      const ang = Math.atan2(pt.y - hit.cy, pt.x - hit.cx);
      const ex = hit.cx + r * Math.cos(ang), ey = hit.cy + r * Math.sin(ang);
      const lbl = t === 'dimrad' ? `R${r.toFixed(2)}` : `⌀${(r * 2).toFixed(2)}`;
      const dimEnt = syncGeom({
        ...createBaseEntityProps('DIMENSION'),
        x1: hit.cx, y1: hit.cy,
        x2: ex, y2: ey,
        x: ex + Math.cos(ang) * 6,
        y: ey + Math.sin(ang) * 6,
        textX: ex + Math.cos(ang) * 6,
        textY: ey + Math.sin(ang) * 6,
        text: lbl
      });
      parser.entities.push(dimEnt);
      syncParserMutation();
      StudioState.selectedIds = new Set([dimEnt._id]);
      setActiveTool('select');
      refreshAllUI();
      logCommand(`Placed ${lbl} dimension on ${hit.type}.`);
      return;
    }

    if (t === 'arraypolar') {
      if (StudioState.selectedIds.size === 0) {
        const hit = findEntityAt(pt.x, pt.y);
        if (hit) {
          StudioState.selectedIds.add(hit._id);
          refreshAllUI();
          logCommand(`Selected ${hit.type}. Now click the center point for Polar Array (${StudioState.arrayPolarItems} items).`);
        } else {
          toast('Select one or more entities first, then click the Polar Array center point.');
        }
        return;
      }
      arrayPolarSelectedEntities(pt.x, pt.y, StudioState.arrayPolarItems, 360);
      setActiveTool('select');
      return;
    }



    if (t === 'matchprop') {
      const hit = findEntityAt(pt.x, pt.y);
      if (!hit) return;
      if (!StudioState.matchSourceEnt) {
        StudioState.matchSourceEnt = hit;
        logCommand(`MATCHPROP: Copied style from ${hit.type} (Layer=${hit.layer}). Now click target entity.`);
      } else {
        if (isLayerLocked(parser, hit.layer)) return toast(`Layer "${hit.layer}" is LOCKED.`);
        pushUndoSnapshot('Match Properties');
        hit.layer = StudioState.matchSourceEnt.layer;
        hit.color = StudioState.matchSourceEnt.color;
        hit.trueColor = StudioState.matchSourceEnt.trueColor;
        hit.customHex = StudioState.matchSourceEnt.customHex;
        hit.linetype = StudioState.matchSourceEnt.linetype;
        hit.lineweight = StudioState.matchSourceEnt.lineweight;
        hit.thickness = StudioState.matchSourceEnt.thickness || 0;
        syncParserMutation();
        refreshAllUI();
        logCommand(`Applied properties (Layer=${hit.layer}) to ${hit.type}.`);
      }
      return;
    }

    if (t === 'offset') {
      if (!StudioState.matchSourceEnt) {
        const hit = findEntityAt(pt.x, pt.y);
        if (!hit) return logCommand('OFFSET: Click a Line, Polyline, Circle, or Arc to offset.');
        StudioState.matchSourceEnt = hit;
        logCommand(`OFFSET: Selected ${hit.type}. Now click on the side to offset by ${StudioState.offsetDistance} ${parser.unitName}.`);
      } else {
        pushUndoSnapshot('Offset Entity');
        const created = createOffsetEntity(StudioState.matchSourceEnt, pt, StudioState.offsetDistance);
        StudioState.matchSourceEnt = null;
        if (created) {
          parser.entities.push(created);
          syncParserMutation();
          StudioState.selectedIds = new Set([created._id]);
          refreshAllUI();
          logCommand(`Created offset ${created.type} at distance ${StudioState.offsetDistance}.`);
        }
      }
      return;
    }

    // If user clicks Move/Copy/Rotate/Scale/Mirror without pre-selecting an entity, auto-select the entity clicked on!
    if (['move', 'copy', 'rotate', 'scale', 'mirror'].includes(t) && StudioState.selectedIds.size === 0) {
      const hit = findEntityAt(pt.x, pt.y);
      if (hit) {
        StudioState.selectedIds.add(hit._id);
        refreshAllUI();
        logCommand(`Selected ${hit.type} on layer ${hit.layer}. Now click base point, then destination point.`);
        return;
      }
      toast('Select one or more entities first before running Modify commands.');
      return;
    }

    // Multi-point tools
    StudioState.tempPoints.push({ x: pt.x, y: pt.y });
    const pts = StudioState.tempPoints;

    if (t === 'line' && pts.length >= 2) {
      const p1 = pts[pts.length - 2];
      const p2 = pts[pts.length - 1];
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) > 1e-4) {
        pushUndoSnapshot('Draw Line');
        const ent = syncGeom({ ...createBaseEntityProps('LINE'), x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
        parser.entities.push(ent);
        syncParserMutation();
        StudioState.selectedIds = new Set([ent._id]);
        refreshAllUI();
        logCommand(`LINE segment (${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}) → (${p2.x.toFixed(2)}, ${p2.y.toFixed(2)}). Click next point or press Esc.`);
      }
      return;
    }

    if (t === 'polygon' && pts.length >= 2) {
      const [c, rPt] = pts;
      pushUndoSnapshot('Draw Polygon');
      const ent = createRegularPolygon(c.x, c.y, rPt.x, rPt.y, StudioState.polygonSides);
      parser.entities.push(ent);
      syncParserMutation();
      StudioState.selectedIds = new Set([ent._id]);
      StudioState.tempPoints = [];
      setActiveTool('select');
      refreshAllUI();
      logCommand(`Created ${StudioState.polygonSides}-sided POLYGON at (${c.x.toFixed(2)}, ${c.y.toFixed(2)}).`);
      return;
    }

    if (t === 'revcloud' && pts.length >= 2) {
      const [p1, p2] = pts;
      pushUndoSnapshot('Draw Revision Cloud');
      const ent = createRevisionCloud(p1.x, p1.y, p2.x, p2.y);
      parser.entities.push(ent);
      syncParserMutation();
      StudioState.selectedIds = new Set([ent._id]);
      StudioState.tempPoints = [];
      setActiveTool('select');
      refreshAllUI();
      logCommand(`Created scalloped REVCLOUD (${Math.abs(p2.x - p1.x).toFixed(2)} × ${Math.abs(p2.y - p1.y).toFixed(2)}).`);
      return;
    }

    if (t === 'box3d' && pts.length >= 2) {
      const [p1, p2] = pts;
      pushUndoSnapshot('Draw 3D Box');
      const ent = create3DBoxEntity(p1.x, p1.y, p2.x, p2.y, StudioState.box3dHeight);
      parser.entities.push(ent);
      syncParserMutation();
      StudioState.selectedIds = new Set([ent._id]);
      StudioState.tempPoints = [];
      if (!is3DViewActive()) setViewPreset('sw_iso');
      setActiveTool('select');
      refreshAllUI();
      logCommand(`Created 3D Extruded Box (${Math.abs(p2.x - p1.x).toFixed(1)} × ${Math.abs(p2.y - p1.y).toFixed(1)} × Z=${StudioState.box3dHeight}).`);
      return;
    }

    if (t === 'xline' && pts.length >= 2) {
      const [p1, p2] = pts;
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const span = 500;
      pushUndoSnapshot('Draw Construction XLine');
      const ent = syncGeom({
        ...createBaseEntityProps('LINE'),
        linetype: 'DASHED',
        x1: p1.x - (dx / len) * span,
        y1: p1.y - (dy / len) * span,
        x2: p1.x + (dx / len) * span,
        y2: p1.y + (dy / len) * span
      });
      parser.entities.push(ent);
      syncParserMutation();
      StudioState.selectedIds = new Set([ent._id]);
      StudioState.tempPoints = [];
      setActiveTool('select');
      refreshAllUI();
      logCommand(`Created construction XLINE through (${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}).`);
      return;
    }

    if (t === 'leader' && pts.length >= 2) {
      const [p1, p2] = pts;
      pushUndoSnapshot('Draw Leader Callout');
      const leaderEnt = syncGeom({
        ...createBaseEntityProps('LWPOLYLINE'),
        isLeader: true,
        closed: false,
        points: [[p1.x, p1.y, 0], [p2.x, p2.y, 0], [p2.x + 8, p2.y, 0]]
      });
      const txtEnt = syncGeom({
        ...createBaseEntityProps('TEXT'),
        x: p2.x + 10,
        y: p2.y - 1,
        height: StudioState.textHeight || 3.5,
        text: 'CALLOUT NOTE'
      });
      parser.entities.push(leaderEnt, txtEnt);
      syncParserMutation();
      StudioState.selectedIds = new Set([leaderEnt._id, txtEnt._id]);
      StudioState.tempPoints = [];
      setActiveTool('select');
      refreshAllUI();
      logCommand(`Placed LEADER arrow callout at (${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}).`);
      return;
    }

    if (t === 'dimang' && pts.length >= 3) {
      const [vtx, p1, p2] = pts;
      const a1 = (Math.atan2(p1.y - vtx.y, p1.x - vtx.x) * 180 / Math.PI + 360) % 360;
      const a2 = (Math.atan2(p2.y - vtx.y, p2.x - vtx.x) * 180 / Math.PI + 360) % 360;
      let sweep = Math.abs(a2 - a1);
      if (sweep > 180) sweep = 360 - sweep;
      const midRad = (((a1 + a2) * 0.5) * Math.PI) / 180;
      const rArc = Math.max(6, Math.hypot(p1.x - vtx.x, p1.y - vtx.y) * 0.65);
      pushUndoSnapshot('Angular Dimension');
      const dimEnt = syncGeom({
        ...createBaseEntityProps('DIMENSION'),
        x1: p1.x, y1: p1.y,
        x2: p2.x, y2: p2.y,
        x: vtx.x + rArc * Math.cos(midRad),
        y: vtx.y + rArc * Math.sin(midRad),
        textX: vtx.x + rArc * Math.cos(midRad),
        textY: vtx.y + rArc * Math.sin(midRad),
        text: `${sweep.toFixed(1)}°`
      });
      parser.entities.push(dimEnt);
      syncParserMutation();
      StudioState.selectedIds = new Set([dimEnt._id]);
      StudioState.tempPoints = [];
      setActiveTool('select');
      refreshAllUI();
      logCommand(`Placed Angular Dimension: ${sweep.toFixed(1)}°.`);
      return;
    }

    if (t === 'measure' && pts.length >= 2) {
      const [p1, p2] = pts;
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      const ang = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      StudioState.lastMeasureResult = { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, dx, dy, dist, angle: ang };
      StudioState.tempPoints = [];
      const msg = `DIST = ${dist.toFixed(4)} ${parser.unitName}  |  ΔX = ${dx.toFixed(4)}, ΔY = ${dy.toFixed(4)}  |  Angle = ${ang.toFixed(2)}°`;
      logCommand(msg);
      toast(msg);
      renderCanvas();
      return;
    }

    if (t === 'triangle' && StudioState.triangleFixedSize && pts.length >= 1) {
      const p0 = pts[0];
      const w = Math.max(0.1, Number(StudioState.triangleWidth) || 60);
      const h = Math.max(0.1, Number(StudioState.triangleHeight) || 50);
      pushUndoSnapshot('Draw Triangle');
      const ent = createTriangleEntity(p0.x - w * 0.5, p0.y, w, h, StudioState.triangleType);
      parser.entities.push(ent);
      syncParserMutation();
      StudioState.selectedIds = new Set([ent._id]);
      StudioState.tempPoints = [];
      refreshAllUI();
      const effH = StudioState.triangleType === 'equilateral' ? (w * Math.sqrt(3) / 2) : h;
      logCommand(`Created ${StudioState.triangleType.toUpperCase()} TRIANGLE (W=${w.toFixed(2)} × H=${effH.toFixed(2)}) at (${p0.x.toFixed(2)}, ${p0.y.toFixed(2)}).`);
      return;
    }

    if (t === 'triangle' && pts.length >= 2) {
      const [p1, p2] = pts;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const w = Math.abs(dx) > 1e-3 ? dx : (StudioState.triangleWidth || 60);
      const h = Math.abs(dy) > 1e-3 ? dy : (StudioState.triangleHeight || 50);
      pushUndoSnapshot('Draw Triangle');
      const ent = createTriangleEntity(p1.x, p1.y, w, h, StudioState.triangleType);
      parser.entities.push(ent);
      syncParserMutation();
      StudioState.triangleWidth = +Math.abs(w).toFixed(2);
      StudioState.triangleHeight = +(StudioState.triangleType === 'equilateral' ? Math.abs(w) * Math.sqrt(3) / 2 : Math.abs(h)).toFixed(2);
      if ($('#dxf-st-tri-w')) $('#dxf-st-tri-w').value = StudioState.triangleWidth;
      if ($('#dxf-st-tri-h')) $('#dxf-st-tri-h').value = StudioState.triangleHeight;
      StudioState.selectedIds = new Set([ent._id]);
      StudioState.tempPoints = [];
      setActiveTool('select');
      refreshAllUI();
      logCommand(`Created ${StudioState.triangleType.toUpperCase()} TRIANGLE (W=${StudioState.triangleWidth} × H=${StudioState.triangleHeight}).`);
      return;
    }

    if (t === 'rect' && pts.length >= 2) {
      const [p1, p2] = pts;
      pushUndoSnapshot('Draw Rectangle');
      const ent = syncGeom({
        ...createBaseEntityProps('LWPOLYLINE'),
        closed: true,
        points: [
          [Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), 0],
          [Math.max(p1.x, p2.x), Math.min(p1.y, p2.y), 0],
          [Math.max(p1.x, p2.x), Math.max(p1.y, p2.y), 0],
          [Math.min(p1.x, p2.x), Math.max(p1.y, p2.y), 0]
        ]
      });
      parser.entities.push(ent);
      syncParserMutation();
      StudioState.selectedIds = new Set([ent._id]);
      StudioState.tempPoints = [];
      setActiveTool('select');
      refreshAllUI();
      logCommand(`Created RECTANGLE (${Math.abs(p2.x - p1.x).toFixed(2)} × ${Math.abs(p2.y - p1.y).toFixed(2)}).`);
      return;
    }

    if (t === 'circle' && pts.length >= 2) {
      const [c, rPt] = pts;
      const r = Math.max(0.1, Math.hypot(rPt.x - c.x, rPt.y - c.y));
      pushUndoSnapshot('Draw Circle');
      const ent = syncGeom({ ...createBaseEntityProps('CIRCLE'), cx: c.x, cy: c.y, r });
      parser.entities.push(ent);
      syncParserMutation();
      StudioState.selectedIds = new Set([ent._id]);
      StudioState.tempPoints = [];
      setActiveTool('select');
      refreshAllUI();
      logCommand(`Created CIRCLE R=${r.toFixed(2)} at (${c.x.toFixed(2)}, ${c.y.toFixed(2)}).`);
      return;
    }

    if (t === 'arc' && pts.length >= 3) {
      const [c, pStart, pEnd] = pts;
      const r = Math.max(0.1, Math.hypot(pStart.x - c.x, pStart.y - c.y));
      const startAngle = (Math.atan2(pStart.y - c.y, pStart.x - c.x) * 180 / Math.PI + 360) % 360;
      const endAngle = (Math.atan2(pEnd.y - c.y, pEnd.x - c.x) * 180 / Math.PI + 360) % 360;
      pushUndoSnapshot('Draw Arc');
      const ent = syncGeom({ ...createBaseEntityProps('ARC'), cx: c.x, cy: c.y, r, startAngle, endAngle });
      parser.entities.push(ent);
      syncParserMutation();
      StudioState.selectedIds = new Set([ent._id]);
      StudioState.tempPoints = [];
      setActiveTool('select');
      refreshAllUI();
      logCommand(`Created ARC R=${r.toFixed(2)} (${startAngle.toFixed(1)}° → ${endAngle.toFixed(1)}°).`);
      return;
    }

    if (t === 'ellipse' && pts.length >= 2) {
      const [c, pMaj] = pts;
      const mx = (pMaj.x - c.x) || 15, my = pMaj.y - c.y;
      const majorR = Math.hypot(mx, my) || 15;
      pushUndoSnapshot('Draw Ellipse');
      const ent = syncGeom({
        ...createBaseEntityProps('ELLIPSE'),
        cx: c.x, cy: c.y,
        mx, my,
        ratio: 0.55,
        rx: majorR,
        ry: majorR * 0.55,
        rotation: Math.atan2(my, mx),
        startParam: 0,
        endParam: Math.PI * 2
      });
      parser.entities.push(ent);
      syncParserMutation();
      StudioState.selectedIds = new Set([ent._id]);
      StudioState.tempPoints = [];
      setActiveTool('select');
      refreshAllUI();
      logCommand(`Created ELLIPSE at (${c.x.toFixed(2)}, ${c.y.toFixed(2)}).`);
      return;
    }

    if (t === 'dim' && pts.length >= 2) {
      const [p1, p2] = pts;
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const midX = (p1.x + p2.x) / 2;
      const midY = Math.max(p1.y, p2.y) + (StudioState.dimOffset || 8);
      pushUndoSnapshot('Add Linear Dimension');
      const ent = syncGeom({
        ...createBaseEntityProps('DIMENSION'),
        x1: p1.x, y1: p1.y,
        x2: p2.x, y2: p2.y,
        x: midX, y: midY,
        textX: midX, textY: midY,
        text: `${dist.toFixed(2)} ${parser.unitName}`
      });
      parser.entities.push(ent);
      syncParserMutation();
      StudioState.selectedIds = new Set([ent._id]);
      StudioState.tempPoints = [];
      setActiveTool('select');
      refreshAllUI();
      logCommand(`Placed Linear Dimension: ${ent.text}`);
      return;
    }

    // Modify 2-point operations on selected entities
    if (['move', 'copy', 'rotate', 'scale', 'mirror'].includes(t) && pts.length >= 2) {
      const [p1, p2] = pts;
      const selEnts = parser.entities.filter(e => StudioState.selectedIds.has(e._id) && !isLayerLocked(parser, e.layer));
      if (!selEnts.length) {
        toast('Selected entities are on a locked layer. Unlock the layer first.');
        StudioState.tempPoints = [];
        setActiveTool('select');
        return;
      }
      pushUndoSnapshot(t.toUpperCase());
      if (t === 'move') {
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        selEnts.forEach(e => translateEntity(e, dx, dy, parser));
        logCommand(`Moved ${selEnts.length} entity(s) by (${dx.toFixed(2)}, ${dy.toFixed(2)}).`);
      } else if (t === 'copy') {
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const newIds = new Set();
        selEnts.forEach(e => {
          const copy = cloneEntity(e);
          translateEntity(copy, dx, dy, parser);
          parser.entities.push(copy);
          newIds.add(copy._id);
        });
        StudioState.selectedIds = newIds;
        logCommand(`Copied ${selEnts.length} entity(s) by (${dx.toFixed(2)}, ${dy.toFixed(2)}).`);
      } else if (t === 'rotate') {
        const angDeg = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
        selEnts.forEach(e => rotateEntity(e, p1.x, p1.y, angDeg, parser));
        logCommand(`Rotated ${selEnts.length} entity(s) by ${angDeg.toFixed(1)}°.`);
      } else if (t === 'scale') {
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const factor = Math.max(0.05, Math.min(20, dist / 25));
        selEnts.forEach(e => scaleEntity(e, p1.x, p1.y, factor, parser));
        logCommand(`Scaled ${selEnts.length} entity(s) by ${factor.toFixed(3)}x.`);
      } else if (t === 'mirror') {
        selEnts.forEach(e => mirrorEntity(e, p1.x, p1.y, p2.x, p2.y, parser));
        logCommand(`Mirrored ${selEnts.length} entity(s) across axis.`);
      }
      syncParserMutation();
      StudioState.tempPoints = [];
      setActiveTool('select');
      refreshAllUI();
    }
  }

  function finishMultiVertexTool(closePoly = false, keepToolActive = true) {
    const parser = ensureActiveParser();
    const pts = StudioState.tempPoints;
    const t = StudioState.activeTool;
    if (!parser || pts.length < 2) {
      StudioState.tempPoints = [];
      if (!keepToolActive) setActiveTool('select');
      else renderCanvas();
      return;
    }
    if (t === 'polyline') {
      pushUndoSnapshot('Draw Polyline');
      const ent = syncGeom({
        ...createBaseEntityProps('LWPOLYLINE'),
        closed: !!closePoly,
        points: pts.map(p => [p.x, p.y, 0])
      });
      parser.entities.push(ent);
      syncParserMutation();
      StudioState.selectedIds = new Set([ent._id]);
      logCommand(`Created LWPOLYLINE with ${pts.length} vertices${closePoly ? ' (Closed)' : ''}.`);
    } else if (t === 'spline') {
      pushUndoSnapshot('Draw Spline');
      const ent = syncGeom({
        ...createBaseEntityProps('SPLINE'),
        points: pts.map(p => [p.x, p.y])
      });
      parser.entities.push(ent);
      syncParserMutation();
      StudioState.selectedIds = new Set([ent._id]);
      logCommand(`Created SPLINE with ${pts.length} control points.`);
    } else if (t === 'hatch' && pts.length >= 3) {
      pushUndoSnapshot('Draw Hatch');
      const loopPts = pts.map(p => [p.x, p.y]);
      loopPts.push([pts[0].x, pts[0].y]);
      const ent = syncGeom({
        ...createBaseEntityProps('HATCH'),
        closed: true,
        solid: true,
        points: pts.map(p => [p.x, p.y]),
        loops: [loopPts]
      });
      parser.entities.push(ent);
      syncParserMutation();
      StudioState.selectedIds = new Set([ent._id]);
      logCommand(`Created HATCH fill with ${pts.length} boundary vertices.`);
    }
    StudioState.tempPoints = [];
    if (!keepToolActive) setActiveTool('select');
    refreshAllUI();
  }

  /**
   * AutoCAD DXF Studio Save-Point Engine:
   * - Done (toolDone): Finishes current line/polyline, commits all uncommitted entities as a permanent Save Point, and resets tempPoints so next click starts a new line.
   * - Cancel (toolCancel): If user didn't click Done, deletes uncommitted entities/points created since last Done save point (storing them in rewindBuffer).
   * - Rewind (toolRewind): Restores canceled/deleted entities/points from rewindBuffer or steps back the last vertex/segment.
   * - Off (toolOff): Commits finished entities and turns off the active tool back to 'select'.
   */
  function toolDone(closeLoop = false) {
    const t = StudioState.activeTool;
    if (['polyline', 'spline', 'hatch'].includes(t) && StudioState.tempPoints.length >= 2) {
      finishMultiVertexTool(closeLoop || t === 'hatch', true);
    }
    const savedCount = StudioState.uncommittedEntityIds ? StudioState.uncommittedEntityIds.size : 0;
    if (StudioState.uncommittedEntityIds) StudioState.uncommittedEntityIds.clear();
    StudioState.tempPoints = [];
    StudioState.matchSourceEnt = null;
    refreshAllUI();
    const msg = savedCount > 0
      ? `✓ Done — Saved ${savedCount} CAD part(s) at checkpoint. Click modelspace to start next new line!`
      : `✓ Done — First line/part finished & saved. Click modelspace to start second new line (or click ⏻ Off to exit).`;
    logCommand(msg);
    toast(msg);
    return savedCount;
  }

  function toolCancel() {
    const parser = getActiveParser();
    const hasDraftPts = StudioState.tempPoints && StudioState.tempPoints.length > 0;
    const uncommittedIds = StudioState.uncommittedEntityIds ? Array.from(StudioState.uncommittedEntityIds) : [];
    const hasUncommitted = uncommittedIds.length > 0;

    if (hasDraftPts || hasUncommitted) {
      const removedEnts = [];
      if (parser && hasUncommitted) {
        const idSet = StudioState.uncommittedEntityIds;
        for (const e of parser.entities) {
          if (idSet.has(e._id)) removedEnts.push({ ...cloneEntity(e), _id: e._id });
        }
        parser.entities = parser.entities.filter(e => !idSet.has(e._id));
      }
      const removedPts = [...(StudioState.tempPoints || [])];
      StudioState.rewindBuffer.push({
        entities: removedEnts,
        tempPoints: removedPts,
        tool: StudioState.activeTool
      });

      if (StudioState.uncommittedEntityIds) StudioState.uncommittedEntityIds.clear();
      StudioState.tempPoints = [];
      StudioState.matchSourceEnt = null;
      StudioState.selectedIds.clear();
      syncParserMutation();
      refreshAllUI();
      const msg = '✕ Canceled unsaved CAD part (Deleted work since last Done save point — Right-click → Rewind to bring it back).';
      logCommand(msg);
      toast(msg);
      return true;
    }

    toolOff();
    return false;
  }

  function toolRewind() {
    const parser = ensureActiveParser(true);

    // 1. Restore from rewindBuffer if canceled or stepped-back parts exist
    if (StudioState.rewindBuffer && StudioState.rewindBuffer.length > 0) {
      const snap = StudioState.rewindBuffer.pop();
      if (snap.tool && snap.tool !== 'select' && StudioState.activeTool === 'select') {
        setActiveTool(snap.tool);
      }
      if (parser && snap.entities && snap.entities.length) {
        for (const ent of snap.entities) {
          parser.entities.push(ent);
          StudioState.uncommittedEntityIds.add(ent._id);
        }
      }
      if (snap.tempPoints && snap.tempPoints.length) {
        StudioState.tempPoints = [...snap.tempPoints];
      }
      syncParserMutation();
      refreshAllUI();
      const msg = '↺ Rewind — Restored CAD part back into modelspace!';
      logCommand(msg);
      toast(msg);
      return true;
    }

    // 2. If mid-draw tempPoints exist, step back the last vertex (and last uncommitted line segment if in LINE tool)
    if (StudioState.tempPoints && StudioState.tempPoints.length > 0) {
      const prevPts = [...StudioState.tempPoints];
      StudioState.tempPoints.pop();
      const poppedEnts = [];
      if (StudioState.activeTool === 'line' && parser && parser.entities.length > 0 && StudioState.uncommittedEntityIds.size > 0) {
        const lastEnt = parser.entities[parser.entities.length - 1];
        if (lastEnt && StudioState.uncommittedEntityIds.has(lastEnt._id)) {
          parser.entities.pop();
          StudioState.uncommittedEntityIds.delete(lastEnt._id);
          poppedEnts.push({ ...cloneEntity(lastEnt), _id: lastEnt._id });
        }
      }
      StudioState.rewindBuffer.push({
        entities: poppedEnts,
        tempPoints: prevPts,
        tool: StudioState.activeTool
      });
      syncParserMutation();
      refreshAllUI();
      const msg = `↺ Rewind — Stepped back last point/segment (${StudioState.tempPoints.length} point(s) active).`;
      logCommand(msg);
      toast(msg);
      return true;
    }

    // 3. Otherwise step back the most recent entity in parser.entities (and save in rewindBuffer so Rewind can bring it back)
    if (parser && parser.entities.length > 0) {
      const lastEnt = parser.entities.pop();
      StudioState.uncommittedEntityIds.delete(lastEnt._id);
      StudioState.selectedIds.delete(lastEnt._id);
      StudioState.rewindBuffer.push({
        entities: [{ ...cloneEntity(lastEnt), _id: lastEnt._id }],
        tempPoints: [],
        tool: StudioState.activeTool
      });
      syncParserMutation();
      refreshAllUI();
      const msg = '↺ Rewind — Stepped back last CAD entity (Right-click → Rewind to bring it back).';
      logCommand(msg);
      toast(msg);
      return true;
    }

    toast('Nothing to rewind.');
    return false;
  }

  function toolOff() {
    if (StudioState.uncommittedEntityIds) StudioState.uncommittedEntityIds.clear();
    StudioState.tempPoints = [];
    StudioState.matchSourceEnt = null;
    setActiveTool('select');
    toast('⏻ Active CAD tool turned off — returned to Select mode.');
  }

  if (typeof window !== 'undefined') {
    window.dxfToolDone = toolDone;
    window.dxfToolCancel = toolCancel;
    window.dxfToolRewind = toolRewind;
    window.dxfToolOff = toolOff;
  }

  function deleteSelectedEntities() {
    const parser = getActiveParser();
    if (!parser || StudioState.selectedIds.size === 0) {
      toast('Select one or more entities first to delete.');
      return 0;
    }
    let lockedSkipped = 0;
    const toRemove = new Set();
    for (const ent of parser.entities) {
      if (StudioState.selectedIds.has(ent._id)) {
        if (isLayerLocked(parser, ent.layer)) lockedSkipped++;
        else toRemove.add(ent._id);
      }
    }
    if (!toRemove.size) {
      if (lockedSkipped > 0) toast(`Cannot delete: ${lockedSkipped} selected entity(s) are on a LOCKED layer.`);
      return 0;
    }
    if (toRemove.size === 1 && StudioState.selectedSubIndex) {
      const onlyId = [...toRemove][0];
      const targetEnt = parser.entities.find(e => e._id === onlyId);
      if (targetEnt && targetEnt.type === 'INSERT' && StudioState.selectedSubIndex.entId === onlyId) {
        const blk = parser._getBlock ? parser._getBlock(targetEnt.blockName) : (parser.blocks && parser.blocks[targetEnt.blockName]);
        const subIdx = StudioState.selectedSubIndex.subIdx;
        if (blk && Array.isArray(blk.entities) && blk.entities.length > 1 && subIdx >= 0 && subIdx < blk.entities.length) {
          pushUndoSnapshot(`Delete Sub-Entity from Block ${targetEnt.blockName}`);
          const newBlkName = `${targetEnt.blockName}_EDIT_${Date.now().toString(36)}`;
          const newBlk = {
            name: newBlkName,
            baseX: blk.baseX || 0,
            baseY: blk.baseY || 0,
            entities: blk.entities.filter((_, idx) => idx !== subIdx).map(se => JSON.parse(JSON.stringify(se)))
          };
          parser.blocks = parser.blocks || {};
          parser.blocks[newBlkName] = newBlk;
          parser.blocks[newBlkName.toUpperCase()] = newBlk;
          targetEnt.blockName = newBlkName;
          syncGeom(targetEnt);
          StudioState.selectedIds.clear();
          StudioState.selectedSubIndex = null;
          syncParserMutation();
          refreshAllUI();
          const subMsg = `Deleted 1 clicked primitive from block (${newBlk.entities.length} remaining).`;
          logCommand(subMsg);
          toast(subMsg);
          return 1;
        }
      }
    }
    pushUndoSnapshot(`Delete ${toRemove.size} Entity(s)`);
    parser.entities = parser.entities.filter(e => !toRemove.has(e._id));
    StudioState.selectedIds.clear();
    StudioState.selectedSubIndex = null;
    syncParserMutation();
    refreshAllUI();
    const msg = `Deleted ${toRemove.size} entity(s)` + (lockedSkipped ? ` (${lockedSkipped} on locked layer protected)` : '');
    logCommand(msg);
    toast(msg);
    return toRemove.size;
  }

  function duplicateSelectedEntities(dx = 10, dy = 10) {
    const parser = getActiveParser();
    if (!parser || StudioState.selectedIds.size === 0) {
      toast('Select one or more entities first to duplicate.');
      return 0;
    }
    const selEnts = parser.entities.filter(e => StudioState.selectedIds.has(e._id));
    if (!selEnts.length) return 0;
    pushUndoSnapshot(`Duplicate ${selEnts.length} Entity(s)`);
    const newIds = new Set();
    for (const ent of selEnts) {
      const copy = cloneEntity(ent);
      translateEntity(copy, dx, dy);
      parser.entities.push(copy);
      newIds.add(copy._id);
    }
    StudioState.selectedIds = newIds;
    syncParserMutation();
    refreshAllUI();
    logCommand(`Duplicated ${newIds.size} entity(s) with offset (+${dx}, +${dy}).`);
    toast(`Duplicated ${newIds.size} entity(s).`);
    return newIds.size;
  }

  function explodeSelectedEntities() {
    const parser = getActiveParser();
    if (!parser || StudioState.selectedIds.size === 0) {
      toast('Select a Polyline, Rectangle, or Block Insert first to EXPLODE.');
      return 0;
    }
    const nextEntities = [];
    const newSel = new Set();
    let explodedCount = 0;
    pushUndoSnapshot('Explode Entities');
    for (const ent of parser.entities) {
      if (StudioState.selectedIds.has(ent._id) && !isLayerLocked(parser, ent.layer)) {
        const parts = explodeEntity(ent, parser);
        if (parts.length > 0) {
          explodedCount++;
          parts.forEach(p => { nextEntities.push(p); newSel.add(p._id); });
          continue;
        }
      }
      nextEntities.push(ent);
    }
    if (!explodedCount) {
      StudioState.undoStack.pop();
      toast('Selected entity cannot be exploded (select an LWPOLYLINE, Rectangle, or Block INSERT).');
      return 0;
    }
    parser.entities = nextEntities;
    StudioState.selectedIds = newSel;
    syncParserMutation();
    refreshAllUI();
    logCommand(`Exploded ${explodedCount} compound entity(s) into ${newSel.size} primitive segments.`);
    toast(`Exploded into ${newSel.size} primitives.`);
    return newSel.size;
  }

  // ==========================================================================
  // LEFT DOCK: AUTOCAD LAYER PROPERTIES MANAGER (WITH RENAME, LINEWEIGHT, LOCK & DELETE)
  // ==========================================================================
  function renderLayerManagerDock() {
    const body = $('#dxf-layer-list-body');
    const clayerSel = $('#dxf-clayer-sel');
    const ds = getDXFState();
    const parser = ensureActiveParser(false);
    if (!body || !ds) return;
    if (!parser) {
      if (clayerSel) clayerSel.innerHTML = '<option value="0">0</option>';
      const countBadge = $('#dxf-layer-count-pill');
      if (countBadge) countBadge.textContent = '0/0';
      body.innerHTML = '<div class="rp-empty-msg" style="padding:18px 12px;text-align:center;color:var(--mute);font-size:11.5px">No AutoCAD DXF loaded.<br><br>Click <b>Open DXF</b> or <b>New DXF</b> to manage layers.</div>';
      return;
    }

    const layers = ds.syncLayerSetsFromParsers();
    const q = (StudioState.layerSearch || '').trim().toLowerCase();
    const filtered = layers.filter(l => !q || l.name.toLowerCase().includes(q));

    if (clayerSel) {
      clayerSel.innerHTML = layers.map(l => `<option value="${esc(l.name)}" ${l.name === StudioState.currentLayer ? 'selected' : ''}>${esc(l.name)}${ds.lockedLayers.has(l.name) ? ' [LOCKED]' : ''}</option>`).join('');
    }

    const countBadge = $('#dxf-layer-count-pill');
    if (countBadge) countBadge.textContent = `${ds.comparedLayers.size}/${layers.length}`;

    body.innerHTML = filtered.map(l => {
      const isCur = l.name === StudioState.currentLayer;
      const isVis = !ds.hiddenLayers.has(l.name);
      const isFrz = ds.frozenLayers.has(l.name);
      const isLck = ds.lockedLayers.has(l.name);
      const isCmp = ds.comparedLayers.has(l.name);
      const entCnt = StudioState.activeSlot === 'A' ? l.countA : l.countB;

      return `
        <div class="dxf-lyr-card ${isCur ? 'is-current' : ''} ${!isVis || isFrz ? 'is-off' : ''}" data-lyr-card="${esc(l.name)}">
          <div class="dxf-lyr-top">
            <input type="checkbox" class="dxf-dock-cmp-chk" data-lyr="${esc(l.name)}" ${isCmp ? 'checked' : ''} title="Include Layer '${esc(l.name)}' in DXF Vector Comparison" />
            <input type="color" class="dxf-dock-col" data-lyr="${esc(l.name)}" value="${l.hexDark}" title="Change Layer Color" />
            <button type="button" class="dxf-lyr-name-btn" data-lyr="${esc(l.name)}" title="Click to set '${esc(l.name)}' as Current Drawing Layer (${entCnt} entities)">
              <b>${esc(l.name)}</b>
              ${isCur ? '<span class="dxf-cur-tag">ACTIVE</span>' : ''}
              ${isLck ? '<span class="dxf-lck-tag">LOCKED</span>' : ''}
            </button>
            <span class="rp-count-pill" title="${entCnt} entities on layer">${entCnt}</span>
          </div>
          <div class="dxf-lyr-actions">
            <button type="button" class="rp-btn-sm dxf-dock-vis ${isVis ? 'on' : ''}" data-lyr="${esc(l.name)}" title="${isVis ? 'Layer On (Click to Turn Off)' : 'Layer Off (Click to Turn On)'}"><i data-ic="${isVis ? 'eye' : 'eyeOff'}"></i></button>
            <button type="button" class="rp-btn-sm dxf-dock-frz ${isFrz ? 'on' : ''}" data-lyr="${esc(l.name)}" title="${isFrz ? 'Frozen (Click to Thaw)' : 'Thawed (Click to Freeze)'}" style="${isFrz ? 'border-color:#38bdf8;color:#38bdf8' : ''}"><i data-ic="freeze"></i></button>
            <button type="button" class="rp-btn-sm dxf-dock-lck ${isLck ? 'on' : ''}" data-lyr="${esc(l.name)}" title="${isLck ? 'Locked (Click to Unlock)' : 'Unlocked (Click to Lock Layer like AutoCAD)'}" style="${isLck ? 'border-color:#f59e0b;color:#f59e0b' : ''}"><i data-ic="${isLck ? 'lock' : 'unlock'}"></i></button>
            <select class="rp-select-xs dxf-dock-lt" data-lyr="${esc(l.name)}" title="Layer Linetype">
              ${LINETYPES.map(lt => `<option value="${lt}" ${l.linetype === lt ? 'selected' : ''}>${lt.slice(0, 6)}</option>`).join('')}
            </select>
            <button type="button" class="rp-btn-sm dxf-dock-solo" data-lyr="${esc(l.name)}" title="Isolate / Solo Only This Layer">Solo</button>
            <button type="button" class="rp-btn-sm dxf-dock-ren" data-lyr="${esc(l.name)}" title="Rename Layer '${esc(l.name)}'"><i data-ic="edittext"></i></button>
            <button type="button" class="rp-btn-sm dxf-dock-del" data-lyr="${esc(l.name)}" title="Remove / Delete Layer '${esc(l.name)}' and its entities" style="color:#dc2626;border-color:rgba(220,38,38,0.35)"><i data-ic="trash"></i></button>
          </div>
        </div>
      `;
    }).join('');

    if (typeof hydrateIcons === 'function') hydrateIcons(body);

    body.querySelectorAll('.dxf-lyr-name-btn').forEach(btn => {
      btn.onclick = () => {
        StudioState.currentLayer = btn.dataset.lyr;
        renderLayerManagerDock();
        updateStatusBar();
        logCommand(`Current drawing layer set to "${StudioState.currentLayer}".`);
      };
    });

    body.querySelectorAll('.dxf-dock-cmp-chk').forEach(chk => {
      chk.onchange = () => {
        ds.applyLayerStateToParsers(chk.dataset.lyr, { compared: chk.checked, visible: chk.checked });
        syncParserMutation();
        refreshAllUI();
      };
    });

    body.querySelectorAll('.dxf-dock-col').forEach(inp => {
      inp.oninput = () => {
        ds.applyLayerStateToParsers(inp.dataset.lyr, { customHex: inp.value });
        syncParserMutation(false);
        renderCanvas();
      };
      inp.onchange = () => {
        pushUndoSnapshot(`Change Layer ${inp.dataset.lyr} Color`);
        ds.applyLayerStateToParsers(inp.dataset.lyr, { customHex: inp.value });
        syncParserMutation();
        refreshAllUI();
      };
    });

    body.querySelectorAll('.dxf-dock-vis').forEach(btn => {
      btn.onclick = () => {
        const lyr = btn.dataset.lyr;
        const nextVis = ds.hiddenLayers.has(lyr);
        ds.applyLayerStateToParsers(lyr, { visible: nextVis, compared: nextVis });
        syncParserMutation();
        refreshAllUI();
        logCommand(`Layer "${lyr}" turned ${nextVis ? 'ON' : 'OFF'}.`);
      };
    });

    body.querySelectorAll('.dxf-dock-frz').forEach(btn => {
      btn.onclick = () => {
        const lyr = btn.dataset.lyr;
        const nextFrz = !ds.frozenLayers.has(lyr);
        ds.applyLayerStateToParsers(lyr, { frozen: nextFrz, visible: !nextFrz });
        syncParserMutation();
        refreshAllUI();
        logCommand(`Layer "${lyr}" ${nextFrz ? 'FROZEN' : 'THAWED'}.`);
      };
    });

    body.querySelectorAll('.dxf-dock-lck').forEach(btn => {
      btn.onclick = () => {
        const lyr = btn.dataset.lyr;
        const nextLck = !ds.lockedLayers.has(lyr);
        ds.applyLayerStateToParsers(lyr, { locked: nextLck });
        refreshAllUI();
        const msg = `Layer "${lyr}" ${nextLck ? 'LOCKED (entities protected)' : 'UNLOCKED'}.`;
        logCommand(msg);
        toast(msg);
      };
    });

    body.querySelectorAll('.dxf-dock-lt').forEach(sel => {
      sel.onchange = () => {
        ds.applyLayerStateToParsers(sel.dataset.lyr, { linetype: sel.value });
        refreshAllUI();
      };
    });

    body.querySelectorAll('.dxf-dock-solo').forEach(btn => {
      btn.onclick = () => {
        const target = btn.dataset.lyr;
        const allLayers = ds.syncLayerSetsFromParsers();
        const onlyTargetVisible = allLayers.every(l => (l.name === target) ? !ds.hiddenLayers.has(l.name) : ds.hiddenLayers.has(l.name));
        if (onlyTargetVisible) {
          allLayers.forEach(l => ds.applyLayerStateToParsers(l.name, { visible: true, frozen: false, compared: true }));
          logCommand('Unisolated all layers (All Layers ON).');
        } else {
          allLayers.forEach(l => {
            const on = l.name === target;
            ds.applyLayerStateToParsers(l.name, { visible: on, compared: on });
          });
          logCommand(`Isolated layer "${target}". Click Solo again to restore all layers.`);
        }
        syncParserMutation();
        refreshAllUI();
      };
    });

    body.querySelectorAll('.dxf-dock-ren').forEach(btn => {
      btn.onclick = async () => {
        const oldName = btn.dataset.lyr;
        if (oldName === '0') return toast('Standard Layer "0" cannot be renamed.');
        if (ds.lockedLayers.has(oldName)) return toast(`Layer "${oldName}" is LOCKED. Unlock it first.`);
        if (!window.dialog) return;
        const r = await window.dialog(`Rename AutoCAD Layer "${oldName}"`, [
          { type: 'text', id: 'name', label: 'New Layer Name', value: oldName }
        ], 'Rename Layer');
        if (!r || !r.name || r.name.trim() === oldName) return;
        const newName = r.name.trim();
        pushUndoSnapshot(`Rename Layer ${oldName} -> ${newName}`);
        [ds.parsedA, ds.parsedB].forEach(p => { if (p && p.renameLayer) p.renameLayer(oldName, newName); });
        if (ds.comparedLayers.has(oldName)) { ds.comparedLayers.delete(oldName); ds.comparedLayers.add(newName); }
        if (StudioState.currentLayer === oldName) StudioState.currentLayer = newName;
        syncParserMutation();
        refreshAllUI();
        toast(`Renamed layer "${oldName}" to "${newName}".`);
      };
    });

    body.querySelectorAll('.dxf-dock-del').forEach(btn => {
      btn.onclick = () => {
        const lyr = btn.dataset.lyr;
        if (ds.lockedLayers.has(lyr)) {
          toast(`Layer "${lyr}" is LOCKED. Unlock it first before removing.`);
          return;
        }
        pushUndoSnapshot(`Remove Layer ${lyr}`);
        const res = ds.deleteLayerFromParsers(lyr, 'both', 'delete_entities');
        if (!res.ok) {
          StudioState.undoStack.pop();
          toast(res.reason);
          return;
        }
        if (StudioState.currentLayer === lyr) StudioState.currentLayer = '0';
        syncParserMutation();
        refreshAllUI();
        const msg = `Removed layer "${lyr}" and deleted ${res.removedCount} entity(s).`;
        logCommand(msg);
        toast(msg);
      };
    });
  }

  // ==========================================================================
  // RIGHT DOCK: REAL-TIME ENTITY PROPERTIES INSPECTOR & VECTOR DIFF LIST
  // ==========================================================================
  function renderPropertiesDock() {
    const pane = $('#dxf-props-body');
    const parser = ensureActiveParser(false);
    const ds = getDXFState();
    if (!pane || !ds) return;
    if (!parser) {
      pane.innerHTML = `
        <div class="dxf-prop-section">
          <div class="dxf-prop-head"><span>Drawing Summary</span></div>
          <div class="rp-empty-msg" style="padding:16px 10px;text-align:center;color:var(--mute);font-size:11.5px">
            Open an AutoCAD <b>.dxf</b> drawing (Rev A or Rev B) or create a <b>New DXF</b> sheet to inspect entities and vector differences.
          </div>
        </div>
      `;
      return;
    }

    const selEnts = parser.entities.filter(e => StudioState.selectedIds.has(e._id));
    const layers = Object.keys(parser.layers || {});

    if (selEnts.length === 0) {
      const counts = parser.getEntitySummary();
      const b = parser.bounds;
      const w = isFinite(b.minX) ? (b.maxX - b.minX).toFixed(2) : '0.00';
      const h = isFinite(b.minY) ? (b.maxY - b.minY).toFixed(2) : '0.00';
      const diff = ds.lastEntityDiff;

      const diffItems = [];
      if (diff) {
        const modIdsA = new Set((diff.modifiedPairs || []).map(m => m.before && m.before._id));
        const modIdsB = new Set((diff.modifiedPairs || []).map(m => m.after && m.after._id));
        const isOnlyCommonSub = e => {
          const de = e._normEnt || e;
          return (Array.isArray(de._diffSubSegments) && de._diffSubSegments.length === 0 && Array.isArray(de._commonSubSegments) && de._commonSubSegments.length > 0 && (!Array.isArray(de._diffTextEntities) || de._diffTextEntities.length === 0)) ||
                 (Array.isArray(e._diffSubSegments) && e._diffSubSegments.length === 0 && Array.isArray(e._commonSubSegments) && e._commonSubSegments.length > 0 && (!Array.isArray(e._diffTextEntities) || e._diffTextEntities.length === 0));
        };
        (diff.modifiedPairs || []).forEach(m => {
          if (m.after) diffItems.push({ kind: 'MODIFIED', cls: 'changed', col: '#f59e0b', ent: m.after, slot: 'B', desc: m.summary });
        });
        (diff.added || []).forEach(e => {
          if (!modIdsB.has(e._id) && !isOnlyCommonSub(e)) {
            diffItems.push({ kind: '+ ADDED', cls: 'added', col: '#10b981', ent: e, slot: 'B', desc: e._summary || DXFEngine.describeDXFEntity(e) });
          }
        });
        (diff.removed || []).forEach(e => {
          if (!modIdsA.has(e._id) && !isOnlyCommonSub(e)) {
            diffItems.push({ kind: '− REMOVED', cls: 'removed', col: '#ef4444', ent: e, slot: 'A', desc: e._summary || DXFEngine.describeDXFEntity(e) });
          }
        });
      }

      pane.innerHTML = `
        <div class="dxf-prop-section">
          <div class="dxf-prop-head">Drawing Summary (${StudioState.activeSlot === 'A' ? esc(ds.nameA) : esc(ds.nameB)})</div>
          <div class="dxf-prop-grid">
            <div><small>Units ($INSUNITS)</small><b>${parser.unitName.toUpperCase()}</b></div>
            <div><small>Extents (W × H)</small><b>${w} × ${h} ${parser.unitName}</b></div>
            <div><small>Total Entities</small><b>${parser.entities.length}</b></div>
            <div><small>CAD Layers</small><b>${layers.length} (${ds.comparedLayers.size} Cmp)</b></div>
            <div><small>Lines / Polylines</small><b>${(counts.LINE || 0) + (counts.LWPOLYLINE || 0)}</b></div>
            <div><small>Circles / Arcs</small><b>${(counts.CIRCLE || 0) + (counts.ARC || 0) + (counts.ELLIPSE || 0)}</b></div>
          </div>
        </div>

        <div class="dxf-prop-section" style="flex:1;display:flex;flex-direction:column;min-height:0">
          <div class="dxf-prop-head" style="display:flex;justify-content:space-between;align-items:center">
            <span>Native Vector Diffs (${diffItems.length})</span>
            <button type="button" class="rp-btn-sm" id="dxf-prop-precompare-btn" title="Select Which DXF Layers to Compare">Filter Layers</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;overflow-y:auto;overflow-x:hidden;max-height:360px;padding-right:2px">
            ${diffItems.length ? diffItems.slice(0, 80).map(it => `
              <div class="defect-item dxf-diff-jump-card" data-entid="${esc(it.ent._id)}" data-slot="${it.slot}" style="cursor:pointer;padding:6px 8px;overflow:hidden;word-break:break-word">
                <div class="defect-header" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;min-width:0">
                  <span class="defect-badge ${it.cls}" style="font-size:9.5px;flex-shrink:0">${it.kind}</span>
                  <b class="dxf-diff-lyr-tag" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:125px">[${esc(it.ent.layer)}]</b>
                  <span style="font-size:10.5px;opacity:.8;margin-left:auto">${esc(it.ent.type)}</span>
                </div>
                <div style="font-size:10.5px;opacity:.88;margin-top:3px;line-height:1.35;word-break:break-word;overflow-wrap:anywhere">${esc(it.desc)}</div>
              </div>
            `).join('') : `<div class="rp-empty-msg" style="padding:12px">No vector differences on selected layers, or only one DXF loaded.</div>`}
          </div>
        </div>
      `;

      if ($('#dxf-prop-precompare-btn')) {
        $('#dxf-prop-precompare-btn').onclick = () => {
          if (window.showDXFPreCompareModal) window.showDXFPreCompareModal();
        };
      }

      pane.querySelectorAll('.dxf-diff-jump-card').forEach(card => {
        card.onclick = () => {
          const targetSlot = card.dataset.slot;
          const entId = card.dataset.entId || card.getAttribute('data-entid');
          if (targetSlot === 'A' || targetSlot === 'B') {
            StudioState.activeSlot = targetSlot;
            if (StudioState.viewMode === 'single' && $('#dxf-st-slot-sel')) {
              $('#dxf-st-slot-sel').value = targetSlot;
            }
          }
          const targetP = (targetSlot === 'A' ? ds.parsedA : ds.parsedB) || getActiveParser();
          const ent = targetP && targetP.entities.find(e => e._id === entId);
          if (ent) {
            StudioState.selectedIds = new Set([ent._id]);
            const drawEnt = (targetSlot === 'B' && ent._normEnt) ? ent._normEnt : ent;
            const bbox = drawEnt._diffBBox || ent._diffBBox || DXFEngine.getDXFEntityBBox(drawEnt, targetP.blocks);
            if (bbox && isFinite(bbox.minX)) {
              const cv = $('#dxf-canvas');
              const cx = (bbox.minX + bbox.maxX) / 2;
              const cy = (bbox.minY + bbox.maxY) / 2;
              if (cv) {
                const effW = StudioState.viewMode === 'side' ? Math.floor(cv.width / 2) : cv.width;
                StudioState.panX = Math.round(effW / 2 - cx * StudioState.zoom);
                StudioState.panY = Math.round(cv.height / 2 - cy * StudioState.zoom);
              }
            }
            refreshAllUI();
          }
        };
      });
      return;
    }

    const ent = selEnts[0];
    const isMulti = selEnts.length > 1;
    if (!isMulti && ent) {
      const lwVal = ent.lineweight != null ? ent.lineweight : -1;
      if ($('#dxf-st-lw-sel')) $('#dxf-st-lw-sel').value = String(lwVal);
      if ($('#dxf-st-lw-sel-lyr')) $('#dxf-st-lw-sel-lyr').value = String(lwVal);
      if ($('#dxf-st-thk-val')) $('#dxf-st-thk-val').value = String(Number(ent.thickness || 0));
      if (detectShapeKind(ent) === 'triangle' && Array.isArray(ent.points)) {
        const txs = ent.points.map(p => p[0]), tys = ent.points.map(p => p[1]);
        const tw = +(Math.max(...txs) - Math.min(...txs)).toFixed(2);
        const th = +(Math.max(...tys) - Math.min(...tys)).toFixed(2);
        if ($('#dxf-st-tri-w')) $('#dxf-st-tri-w').value = tw;
        if ($('#dxf-st-tri-h')) $('#dxf-st-tri-h').value = th;
        if (ent.triType && $('#dxf-st-tri-type')) $('#dxf-st-tri-type').value = ent.triType;
      }
    }
    const locked = isLayerLocked(parser, ent.layer);
    const curHex = getEntityStrokeColor(ent, parser, true);

    let geomFieldsHTML = '';
    if (!isMulti) {
      if (ent.type === 'LINE') {
        const len = Math.hypot(ent.x2 - ent.x1, ent.y2 - ent.y1).toFixed(3);
        const ang = (Math.atan2(ent.y2 - ent.y1, ent.x2 - ent.x1) * 180 / Math.PI).toFixed(2);
        geomFieldsHTML = `
          <div class="dxf-prop-row"><label>Start X (x1)</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="x1" value="${ent.x1.toFixed(3)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Start Y (y1)</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="y1" value="${ent.y1.toFixed(3)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>End X (x2)</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="x2" value="${ent.x2.toFixed(3)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>End Y (y2)</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="y2" value="${ent.y2.toFixed(3)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Length</label><b>${len} ${parser.unitName} (${ang}°)</b></div>
        `;
      } else if (ent.type === 'CIRCLE') {
        geomFieldsHTML = `
          <div class="dxf-prop-row"><label>Center X</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="cx" value="${ent.cx.toFixed(4)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Center Y</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="cy" value="${ent.cy.toFixed(4)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Radius (R)</label><input type="number" step="0.1" min="0.01" class="dxf-geom-in" data-prop="r" value="${ent.r.toFixed(4)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Diameter (⌀)</label><b>${(ent.r * 2).toFixed(3)} ${parser.unitName}</b></div>
        `;
      } else if (ent.type === 'ARC') {
        geomFieldsHTML = `
          <div class="dxf-prop-row"><label>Center X</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="cx" value="${ent.cx.toFixed(4)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Center Y</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="cy" value="${ent.cy.toFixed(4)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Radius (R)</label><input type="number" step="0.1" min="0.01" class="dxf-geom-in" data-prop="r" value="${ent.r.toFixed(4)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Start Angle (°)</label><input type="number" step="1" class="dxf-geom-in" data-prop="startAngle" value="${(ent.startAngle || 0).toFixed(1)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>End Angle (°)</label><input type="number" step="1" class="dxf-geom-in" data-prop="endAngle" value="${(ent.endAngle || 0).toFixed(1)}" ${locked ? 'disabled' : ''} /></div>
        `;
      } else if (ent.type === 'LWPOLYLINE' && Array.isArray(ent.points)) {
        const shapeKind = detectShapeKind(ent);
        let shapeSizeHTML = '';
        if (shapeKind === 'triangle' || shapeKind === 'rect') {
          const xs = ent.points.map(p => p[0]), ys = ent.points.map(p => p[1]);
          const bW = Math.max(0.01, Math.max(...xs) - Math.min(...xs));
          const bH = Math.max(0.01, Math.max(...ys) - Math.min(...ys));
          if (shapeKind === 'triangle') {
            const curTriType = ent.triType || 'isosceles';
            shapeSizeHTML = `
              <div class="dxf-prop-row"><label><b>Triangle Width (W)</b></label><input type="number" step="1" min="0.1" id="dxf-prop-tri-w" value="${bW.toFixed(2)}" ${locked ? 'disabled' : ''} /></div>
              <div class="dxf-prop-row"><label><b>Triangle Height (H)</b></label><input type="number" step="1" min="0.1" id="dxf-prop-tri-h" value="${bH.toFixed(2)}" ${locked || curTriType === 'equilateral' ? 'disabled' : ''} /></div>
              <div class="dxf-prop-row"><label>Triangle Type</label>
                <select id="dxf-prop-tri-type" ${locked ? 'disabled' : ''}>
                  <option value="isosceles" ${curTriType === 'isosceles' ? 'selected' : ''}>Isosceles</option>
                  <option value="right-left" ${curTriType === 'right-left' ? 'selected' : ''}>Right (Left 90°)</option>
                  <option value="right-right" ${curTriType === 'right-right' ? 'selected' : ''}>Right (Right 90°)</option>
                  <option value="equilateral" ${curTriType === 'equilateral' ? 'selected' : ''}>Equilateral</option>
                </select>
              </div>
            `;
          } else {
            shapeSizeHTML = `
              <div class="dxf-prop-row"><label><b>Rect Width (W)</b></label><input type="number" step="1" min="0.1" id="dxf-prop-rect-w" value="${bW.toFixed(2)}" ${locked ? 'disabled' : ''} /></div>
              <div class="dxf-prop-row"><label><b>Rect Height (H)</b></label><input type="number" step="1" min="0.1" id="dxf-prop-rect-h" value="${bH.toFixed(2)}" ${locked ? 'disabled' : ''} /></div>
            `;
          }
        }
        geomFieldsHTML = `
          ${shapeSizeHTML}
          <div class="dxf-prop-row"><label>Closed Loop</label><input type="checkbox" id="dxf-poly-closed" ${ent.closed ? 'checked' : ''} ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Vertices</label><b>${ent.points.length} pts</b></div>
          <div style="max-height:150px;overflow-y:auto;border:1px solid var(--line);border-radius:4px;padding:4px;margin-top:4px">
            ${ent.points.map((pt, idx) => `
              <div style="display:grid;grid-template-columns:28px 1fr 1fr;gap:4px;align-items:center;margin-bottom:3px;font-size:11px">
                <span>V${idx + 1}</span>
                <input type="number" step="0.1" class="dxf-poly-pt" data-vidx="${idx}" data-axis="0" value="${pt[0].toFixed(4)}" ${locked ? 'disabled' : ''} style="width:100%" />
                <input type="number" step="0.1" class="dxf-poly-pt" data-vidx="${idx}" data-axis="1" value="${pt[1].toFixed(4)}" ${locked ? 'disabled' : ''} style="width:100%" />
              </div>
            `).join('')}
          </div>
        `;
      } else if (ent.type === 'TEXT' || ent.type === 'DIMENSION') {
        geomFieldsHTML = `
          <div class="dxf-prop-row"><label>Text String</label><input type="text" class="dxf-geom-str" data-prop="text" value="${esc(ent.text || '')}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Position X</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="x" value="${(ent.x || 0).toFixed(4)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Position Y</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="y" value="${(ent.y || 0).toFixed(4)}" ${locked ? 'disabled' : ''} /></div>
          ${ent.type === 'TEXT' ? `
            <div class="dxf-prop-row"><label>Text Height</label><input type="number" step="0.2" min="0.2" class="dxf-geom-in" data-prop="height" value="${(ent.height || 2.5).toFixed(2)}" ${locked ? 'disabled' : ''} /></div>
            <div class="dxf-prop-row"><label>Rotation (°)</label><input type="number" step="5" class="dxf-geom-in" data-prop="rotation" value="${(ent.rotation || 0).toFixed(1)}" ${locked ? 'disabled' : ''} /></div>
          ` : ''}
        `;
      } else if (ent.type === 'INSERT') {
        geomFieldsHTML = `
          <div class="dxf-prop-row"><label>Block Name</label><b>${esc(ent.blockName)}</b></div>
          <div class="dxf-prop-row"><label>Insert X</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="x" value="${(ent.x || 0).toFixed(4)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Insert Y</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="y" value="${(ent.y || 0).toFixed(4)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Scale X</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="scaleX" value="${(ent.scaleX || 1).toFixed(2)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Scale Y</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="scaleY" value="${(ent.scaleY || 1).toFixed(2)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Rotation (°)</label><input type="number" step="5" class="dxf-geom-in" data-prop="rotation" value="${(ent.rotation || 0).toFixed(1)}" ${locked ? 'disabled' : ''} /></div>
        `;
      } else if (ent.type === 'ELLIPSE') {
        const rx = ent.rx || Math.hypot(ent.mx || 10, ent.my || 0) || 10;
        const ry = ent.ry || rx * (ent.ratio || 0.5);
        geomFieldsHTML = `
          <div class="dxf-prop-row"><label>Center X</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="cx" value="${(ent.cx || 0).toFixed(3)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Center Y</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="cy" value="${(ent.cy || 0).toFixed(3)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Major R (rx)</label><input type="number" step="0.1" min="0.1" class="dxf-geom-in" data-prop="rx" value="${rx.toFixed(3)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Minor R (ry)</label><input type="number" step="0.1" min="0.1" class="dxf-geom-in" data-prop="ry" value="${ry.toFixed(3)}" ${locked ? 'disabled' : ''} /></div>
        `;
      } else if (ent.type === 'POINT') {
        geomFieldsHTML = `
          <div class="dxf-prop-row"><label>Point X</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="x" value="${(ent.x || 0).toFixed(4)}" ${locked ? 'disabled' : ''} /></div>
          <div class="dxf-prop-row"><label>Point Y</label><input type="number" step="0.1" class="dxf-geom-in" data-prop="y" value="${(ent.y || 0).toFixed(4)}" ${locked ? 'disabled' : ''} /></div>
        `;
      } else if ((ent.type === 'SPLINE' || ent.type === 'HATCH' || ent.type === 'SOLID') && Array.isArray(ent.points)) {
        geomFieldsHTML = `
          <div class="dxf-prop-row"><label>Vertices</label><b>${ent.points.length} pts</b></div>
          <div style="max-height:150px;overflow-y:auto;border:1px solid var(--line);border-radius:4px;padding:4px;margin-top:4px">
            ${ent.points.map((pt, idx) => `
              <div style="display:grid;grid-template-columns:28px 1fr 1fr;gap:4px;align-items:center;margin-bottom:3px;font-size:11px">
                <span>V${idx + 1}</span>
                <input type="number" step="0.1" class="dxf-poly-pt" data-vidx="${idx}" data-axis="0" value="${(pt[0] || 0).toFixed(2)}" ${locked ? 'disabled' : ''} style="width:100%" />
                <input type="number" step="0.1" class="dxf-poly-pt" data-vidx="${idx}" data-axis="1" value="${(pt[1] || 0).toFixed(2)}" ${locked ? 'disabled' : ''} style="width:100%" />
              </div>
            `).join('' )}
          </div>
        `;
      }
    }

    pane.innerHTML = `
      <div class="dxf-prop-section">
        <div class="dxf-prop-head">
          <span>${isMulti ? `Selected (${selEnts.length} Entities)` : `${ent.type} Properties`}</span>
          ${locked ? '<span class="dxf-lck-tag">LAYER LOCKED</span>' : ''}
        </div>
        <div class="dxf-prop-row">
          <label>CAD Layer</label>
          <select id="dxf-prop-layer" ${locked ? 'disabled' : ''}>
            ${layers.map(l => `<option value="${esc(l)}" ${l === ent.layer ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select>
        </div>
        <div class="dxf-prop-row">
          <label>Color Override</label>
          <div style="display:flex;gap:4px;align-items:center">
            <input type="color" id="dxf-prop-col" value="${curHex}" ${locked ? 'disabled' : ''} style="width:24px;height:22px;padding:0;border:none;background:transparent" />
            <button type="button" class="rp-btn-sm" id="dxf-prop-bylayer" ${locked ? 'disabled' : ''}>ByLayer</button>
          </div>
        </div>
        <div class="dxf-prop-row">
          <label>Linetype</label>
          <select id="dxf-prop-ltype" ${locked ? 'disabled' : ''}>
            <option value="BYLAYER" ${(!ent.linetype || ent.linetype === 'BYLAYER') ? 'selected' : ''}>ByLayer</option>
            ${LINETYPES.map(lt => `<option value="${lt}" ${ent.linetype === lt ? 'selected' : ''}>${lt}</option>`).join('')}
          </select>
        </div>
        <div class="dxf-prop-row">
          <label>Thickness (LW)</label>
          <select id="dxf-prop-lw" ${locked ? 'disabled' : ''}>
            <option value="-1" ${(ent.lineweight == null || ent.lineweight < 0) ? 'selected' : ''}>ByLayer</option>
            ${LINEWEIGHTS.filter(w => w.v > 0).map(lw => `<option value="${lw.v}" ${ent.lineweight === lw.v ? 'selected' : ''}>${lw.l}</option>`).join('')}
          </select>
        </div>
        <div class="dxf-prop-row">
          <label>Z Elevation</label>
          <input type="number" step="0.5" id="dxf-prop-elev" value="${Number(ent.elevation || ent.z || 0).toFixed(2)}" ${locked ? 'disabled' : ''} />
        </div>
        <div class="dxf-prop-row">
          <label>3D Thickness</label>
          <input type="number" step="1.0" id="dxf-prop-thk" value="${Number(ent.thickness || 0).toFixed(2)}" ${locked ? 'disabled' : ''} />
        </div>
      </div>

      ${!isMulti ? `
        <div class="dxf-prop-section">
          <div class="dxf-prop-head">Geometry Coordinates (${parser.unitName})</div>
          ${geomFieldsHTML}
        </div>
      ` : ''}

      <div class="dxf-prop-section">
        <div class="dxf-prop-head">Quick Entity Actions</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <button type="button" class="rp-btn-sm" id="dxf-prop-move-btn" ${locked ? 'disabled' : ''}><i data-ic="move"></i><span>Move</span></button>
          <button type="button" class="rp-btn-sm" id="dxf-prop-copy-btn" ${locked ? 'disabled' : ''}><i data-ic="copy"></i><span>Duplicate</span></button>
          <button type="button" class="rp-btn-sm" id="dxf-prop-rot-btn" ${locked ? 'disabled' : ''}><i data-ic="rotR"></i><span>Rotate 90°</span></button>
          <button type="button" class="rp-btn-sm" id="dxf-prop-exp-btn" ${locked ? 'disabled' : ''}><i data-ic="explode"></i><span>Explode</span></button>
          <button type="button" class="rp-btn-sm" id="dxf-prop-del-btn" ${locked ? 'disabled' : ''} style="grid-column:span 2;color:#f87171;border-color:rgba(239,68,68,0.45)"><i data-ic="trash"></i><span>Delete Selected (${selEnts.length})</span></button>
        </div>
      </div>
    `;

    if (typeof hydrateIcons === 'function') hydrateIcons(pane);

    const lyrSel = $('#dxf-prop-layer');
    if (lyrSel) {
      lyrSel.onchange = () => {
        pushUndoSnapshot('Change Entity Layer');
        selEnts.forEach(e => { e.layer = lyrSel.value; });
        syncParserMutation();
        refreshAllUI();
        logCommand(`Moved ${selEnts.length} entity(s) to layer "${lyrSel.value}".`);
      };
    }

    const colIn = $('#dxf-prop-col');
    if (colIn) {
      const applyEntHex = (hexVal, commit) => {
        const tc = (typeof DXFEngine !== 'undefined' && DXFEngine.hexToTrueColor) ? DXFEngine.hexToTrueColor(hexVal) : null;
        const aci = (typeof DXFEngine !== 'undefined' && DXFEngine.hexToNearestACI) ? DXFEngine.hexToNearestACI(hexVal) : null;
        selEnts.forEach(e => { e.customHex = hexVal; e.trueColor = tc; if (aci) e.color = aci; });
        if (commit) {
          syncParserMutation();
          refreshAllUI();
        } else {
          renderCanvas();
        }
      };
      colIn.oninput = () => applyEntHex(colIn.value, false);
      colIn.onchange = () => {
        pushUndoSnapshot('Change Entity Color');
        applyEntHex(colIn.value, true);
      };
    }

    const byLyrBtn = $('#dxf-prop-bylayer');
    if (byLyrBtn) {
      byLyrBtn.onclick = () => {
        pushUndoSnapshot('Reset Color to ByLayer');
        selEnts.forEach(e => { e.customHex = null; e.trueColor = null; e.color = null; });
        syncParserMutation();
        refreshAllUI();
      };
    }

    const ltSel = $('#dxf-prop-ltype');
    if (ltSel) {
      ltSel.onchange = () => {
        pushUndoSnapshot('Change Entity Linetype');
        selEnts.forEach(e => { e.linetype = ltSel.value; });
        syncParserMutation();
        refreshAllUI();
      };
    }

    const lwSel = $('#dxf-prop-lw');
    if (lwSel) {
      lwSel.onchange = () => {
        pushUndoSnapshot('Change Entity Lineweight');
        selEnts.forEach(e => { e.lineweight = parseInt(lwSel.value, 10); });
        syncParserMutation();
        refreshAllUI();
      };
    }
    const elevIn = $('#dxf-prop-elev');
    if (elevIn) {
      elevIn.onchange = () => {
        const val = parseFloat(elevIn.value) || 0;
        pushUndoSnapshot('Change Z Elevation');
        selEnts.forEach(e => { e.elevation = val; e.z = val; });
        syncParserMutation();
        refreshAllUI();
      };
    }
    const thkIn = $('#dxf-prop-thk');
    if (thkIn) {
      thkIn.onchange = () => {
        const val = parseFloat(thkIn.value) || 0;
        pushUndoSnapshot('Change 3D Extrusion Thickness');
        selEnts.forEach(e => { e.thickness = val; });
        syncParserMutation();
        refreshAllUI();
      };
    }

    pane.querySelectorAll('.dxf-geom-in').forEach(inp => {
      inp.onchange = () => {
        const val = parseFloat(inp.value);
        if (!Number.isFinite(val)) return;
        pushUndoSnapshot(`Edit ${ent.type} ${inp.dataset.prop}`);
        ent[inp.dataset.prop] = val;
        if (ent.type === 'DIMENSION' && (inp.dataset.prop === 'x' || inp.dataset.prop === 'y')) {
          if (inp.dataset.prop === 'x') ent.textX = val;
          if (inp.dataset.prop === 'y') ent.textY = val;
        } else if (ent.type === 'ELLIPSE' && (inp.dataset.prop === 'rx' || inp.dataset.prop === 'ry')) {
          const rx = Math.max(0.1, ent.rx || 10);
          const ry = Math.max(0.05, ent.ry || 5);
          const rot = ent.rotation || 0;
          ent.mx = rx * Math.cos(rot);
          ent.my = rx * Math.sin(rot);
          ent.ratio = ry / rx;
        }
        syncGeom(ent);
        syncParserMutation();
        refreshAllUI();
      };
    });

    pane.querySelectorAll('.dxf-geom-str').forEach(inp => {
      inp.onchange = () => {
        pushUndoSnapshot(`Edit ${ent.type} Text`);
        ent[inp.dataset.prop] = inp.value;
        if (ent.type === 'DIMENSION' && inp.dataset.prop === 'text') {
          ent._textEdited = true;
          const numVal = parseFloat(inp.value);
          if (Number.isFinite(numVal) && numVal > 0) ent.measurement = numVal;
          const parser = getActiveParser();
          if (parser && ent.blockName) {
            const dBlk = parser._getBlock ? parser._getBlock(ent.blockName) : (parser.blocks && parser.blocks[ent.blockName]);
            if (dBlk && Array.isArray(dBlk.entities)) {
              const tSub = dBlk.entities.find(se => se && se.type === 'TEXT');
              if (tSub) tSub.text = inp.value;
            }
          }
        }
        syncGeom(ent);
        syncParserMutation();
        refreshAllUI();
      };
    });

    const triWIn = $('#dxf-prop-tri-w');
    const triHIn = $('#dxf-prop-tri-h');
    const triTypeSel = $('#dxf-prop-tri-type');
    if (triWIn || triHIn || triTypeSel) {
      const applyTriEdit = () => {
        const nw = parseFloat(triWIn ? triWIn.value : '');
        const nh = parseFloat(triHIn ? triHIn.value : '');
        const nt = triTypeSel ? triTypeSel.value : (ent.triType || 'isosceles');
        pushUndoSnapshot('Resize Triangle');
        resizeTriangleEntity(ent, nw, nh, nt);
        syncParserMutation();
        refreshAllUI();
      };
      if (triWIn) triWIn.onchange = applyTriEdit;
      if (triHIn) triHIn.onchange = applyTriEdit;
      if (triTypeSel) triTypeSel.onchange = applyTriEdit;
    }
    const rectWIn = $('#dxf-prop-rect-w');
    const rectHIn = $('#dxf-prop-rect-h');
    if (rectWIn || rectHIn) {
      const applyRectEdit = () => {
        const nw = parseFloat(rectWIn ? rectWIn.value : '');
        const nh = parseFloat(rectHIn ? rectHIn.value : '');
        pushUndoSnapshot('Resize Rectangle');
        resizeRectEntity(ent, nw, nh);
        syncParserMutation();
        refreshAllUI();
      };
      if (rectWIn) rectWIn.onchange = applyRectEdit;
      if (rectHIn) rectHIn.onchange = applyRectEdit;
    }
    const polyClosed = $('#dxf-poly-closed');
    if (polyClosed) {
      polyClosed.onchange = () => {
        pushUndoSnapshot('Toggle Polyline Closed');
        ent.closed = polyClosed.checked;
        syncGeom(ent);
        syncParserMutation();
        refreshAllUI();
      };
    }

    pane.querySelectorAll('.dxf-poly-pt').forEach(inp => {
      inp.onchange = () => {
        const vidx = parseInt(inp.dataset.vidx, 10);
        const axis = parseInt(inp.dataset.axis, 10);
        const val = parseFloat(inp.value);
        if (!Number.isFinite(val) || !ent.points || !ent.points[vidx]) return;
        pushUndoSnapshot('Edit Polyline Vertex');
        ent.points[vidx][axis] = val;
        if (ent.type === 'HATCH' && Array.isArray(ent.loops) && ent.loops[0] && ent.loops[0][vidx]) {
          ent.loops[0][vidx][axis] = val;
          if (vidx === 0 && ent.loops[0].length > ent.points.length) {
            ent.loops[0][ent.loops[0].length - 1][axis] = val;
          }
        }
        syncGeom(ent);
        syncParserMutation();
        refreshAllUI();
      };
    });

    if ($('#dxf-prop-move-btn')) $('#dxf-prop-move-btn').onclick = () => setActiveTool('move');
    if ($('#dxf-prop-copy-btn')) $('#dxf-prop-copy-btn').onclick = () => duplicateSelectedEntities(10, 10);
    if ($('#dxf-prop-rot-btn')) {
      $('#dxf-prop-rot-btn').onclick = () => {
        pushUndoSnapshot('Rotate 90°');
        const bbox = DXFEngine.getDXFEntityBBox(ent, parser.blocks);
        const cx = bbox && isFinite(bbox.minX) ? (bbox.minX + bbox.maxX) / 2 : 0;
        const cy = bbox && isFinite(bbox.minY) ? (bbox.minY + bbox.maxY) / 2 : 0;
        selEnts.forEach(e => rotateEntity(e, cx, cy, 90));
        syncParserMutation();
        refreshAllUI();
      };
    }
    if ($('#dxf-prop-exp-btn')) $('#dxf-prop-exp-btn').onclick = () => explodeSelectedEntities();
    if ($('#dxf-prop-del-btn')) $('#dxf-prop-del-btn').onclick = () => deleteSelectedEntities();
  }

  function updateStatusBar() {
    const parser = getActiveParser();
    const uName = (parser && parser.unitName) ? parser.unitName : 'mm';
    const coordEl = $('#dxf-st-coords');
    if (coordEl) {
      const snapTxt = StudioState.snapPoint ? ` [OSNAP: ${StudioState.snapPoint.type}]` : '';
      const baseZ = StudioState.baseFitZoom || 4.0;
      const zoomPct = Math.max(1, Math.round((StudioState.zoom / Math.max(1e-9, baseZ)) * 100));
      coordEl.textContent = `X: ${StudioState.cursorWorld.x.toFixed(3)} ${uName}   Y: ${StudioState.cursorWorld.y.toFixed(3)} ${uName}   Zoom: ${zoomPct}%${snapTxt}`;
    }
    const selEl = $('#dxf-st-sel-info');
    if (selEl) {
      if (parser) {
        const modeLbl = StudioState.viewMode === 'overlay' ? 'Vector Overlay A↔B' : (StudioState.viewMode === 'side' ? 'Side-by-Side A|B' : `Slot ${StudioState.activeSlot}`);
        selEl.textContent = `${modeLbl} · Layer: ${StudioState.currentLayer} · Entities: ${parser.entities.length} · Selected: ${StudioState.selectedIds.size}`;
      } else {
        selEl.textContent = 'Ready — Open or Create an AutoCAD DXF Drawing';
      }
    }
    [['#dxf-aid-grid', StudioState.gridEnabled], ['#dxf-aid-ortho', StudioState.orthoEnabled], ['#dxf-aid-polar', StudioState.polarEnabled], ['#dxf-aid-osnap', StudioState.osnapEnabled], ['#dxf-aid-lwt', StudioState.showLineweights]].forEach(([sel, on]) => {
      const b = $(sel);
      if (b) b.classList.toggle('on', !!on);
    });
  }

  function refreshAllUI() {
    updateEmptyOverlay();
    renderLayerManagerDock();
    renderPropertiesDock();
    renderCanvas();
    updateStatusBar();
    updateUndoRedoButtons();
  }

  // ==========================================================================
  // EXPORT SVG, PNG, DXF & SEND TO PDF STUDIO / COMPARE
  // ==========================================================================
  async function saveModifiedDXFFile() {
    const parser = ensureActiveParser();
    const ds = getDXFState();
    if (!parser || !ds) return;
    syncParserMutation();
    const dxfStr = parser.toDXFString();
    const bytes = new TextEncoder().encode(dxfStr);
    const rawName = (StudioState.activeSlot === 'A' ? ds.nameA : ds.nameB) || 'Drawing.dxf';
    const outName = rawName.replace(/\.dxf$/i, '') + '_Edited.dxf';
    if (typeof window !== 'undefined' && window.native && window.native.saveFile) {
      const saved = await window.native.saveFile({
        name: outName,
        bytes,
        filters: [{ name: 'AutoCAD DXF (.dxf)', extensions: ['dxf'] }]
      });
      if (saved) {
        logCommand(`Saved AutoCAD DXF: ${saved}`);
        toast(`Saved AutoCAD DXF: ${saved}`);
      }
    }
    return dxfStr;
  }

  async function exportDXFStudioSVG() {
    const parser = ensureActiveParser();
    const ds = getDXFState();
    if (!parser || !ds) return '';
    parser.recomputeBoundsAndCounts();
    const b = parser.bounds;
    const minX = isFinite(b.minX) ? b.minX - 10 : -10;
    const minY = isFinite(b.minY) ? b.minY - 10 : -10;
    const maxX = isFinite(b.maxX) ? b.maxX + 10 : 210;
    const maxY = isFinite(b.maxY) ? b.maxY + 10 : 150;
    const w = Math.max(10, maxX - minX);
    const h = Math.max(10, maxY - minY);
    const isDarkBg = !/^#?(fff|ffffff|f8fafc)$/i.test((StudioState.background || '#0c1017').trim());

    const svgLines = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(3)} ${(-maxY).toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)}" width="100%" height="100%" style="background:${StudioState.background || '#0c1017'}">`,
      `  <g fill="none" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round">`
    ];
    for (const ent of parser.entities) {
      if (!isLayerVisible(parser, ent.layer)) continue;
      const col = getEntityStrokeColor(ent, parser, isDarkBg);
      if (ent.type === 'LINE') {
        svgLines.push(`    <line x1="${ent.x1.toFixed(3)}" y1="${(-ent.y1).toFixed(3)}" x2="${ent.x2.toFixed(3)}" y2="${(-ent.y2).toFixed(3)}" stroke="${col}" />`);
      } else if (ent.type === 'CIRCLE') {
        svgLines.push(`    <circle cx="${ent.cx.toFixed(3)}" cy="${(-ent.cy).toFixed(3)}" r="${ent.r.toFixed(3)}" stroke="${col}" />`);
      } else if (ent.type === 'ARC') {
        const sA = (ent.startAngle || 0) * Math.PI / 180;
        const eA = (ent.endAngle != null ? ent.endAngle : 360) * Math.PI / 180;
        const x1 = ent.cx + ent.r * Math.cos(sA), y1 = -(ent.cy + ent.r * Math.sin(sA));
        const x2 = ent.cx + ent.r * Math.cos(eA), y2 = -(ent.cy + ent.r * Math.sin(eA));
        const sweep = (((ent.endAngle != null ? ent.endAngle : 360) - (ent.startAngle || 0)) % 360 + 360) % 360;
        const largeArc = sweep > 180 ? 1 : 0;
        svgLines.push(`    <path d="M ${x1.toFixed(3)} ${y1.toFixed(3)} A ${ent.r.toFixed(3)} ${ent.r.toFixed(3)} 0 ${largeArc} 0 ${x2.toFixed(3)} ${y2.toFixed(3)}" stroke="${col}" />`);
      } else if (ent.type === 'ELLIPSE') {
        const rx = ent.rx || Math.hypot(ent.mx || 10, ent.my || 0) || 10;
        const ry = ent.ry || rx * (ent.ratio || 0.5);
        const rotDeg = -((ent.rotation != null ? ent.rotation : Math.atan2(ent.my || 0, ent.mx || 1)) * 180 / Math.PI);
        svgLines.push(`    <ellipse cx="${ent.cx.toFixed(3)}" cy="${(-ent.cy).toFixed(3)}" rx="${rx.toFixed(3)}" ry="${ry.toFixed(3)}" transform="rotate(${rotDeg.toFixed(2)} ${ent.cx.toFixed(3)} ${(-ent.cy).toFixed(3)})" stroke="${col}" />`);
      } else if ((ent.type === 'LWPOLYLINE' || ent.type === 'SPLINE' || ent.type === 'SOLID') && Array.isArray(ent.renderPoints || ent.points) && (ent.renderPoints || ent.points).length >= 2) {
        const rPts = ent.renderPoints || ent.points;
        const ptsAttr = rPts.map(p => `${p[0].toFixed(3)},${(-p[1]).toFixed(3)}`).join(' ');
        const tag = (ent.closed || ent.type === 'SOLID') ? 'polygon' : 'polyline';
        svgLines.push(`    <${tag} points="${ptsAttr}" stroke="${col}" ${ent.type === 'SOLID' ? `fill="${col}" fill-opacity="0.35"` : ''} />`);
      } else if (ent.type === 'HATCH') {
        const loops = (Array.isArray(ent.loops) && ent.loops.length) ? ent.loops : (Array.isArray(ent.points) && ent.points.length >= 2 ? [ent.points] : []);
        for (const lp of loops) {
          if (lp && lp.length >= 2) {
            const ptsAttr = lp.map(p => `${p[0].toFixed(3)},${(-p[1]).toFixed(3)}`).join(' ');
            svgLines.push(`    <polygon points="${ptsAttr}" stroke="${col}" fill="${col}" fill-opacity="0.22" />`);
          }
        }
      } else if (ent.type === 'TEXT' && ent.text) {
        svgLines.push(`    <text x="${(ent.x || 0).toFixed(3)}" y="${(-(ent.y || 0)).toFixed(3)}" fill="${col}" font-family="Segoe UI, Arial, sans-serif" font-size="${(ent.height || 3).toFixed(2)}">${esc(ent.text)}</text>`);
      } else if (ent.type === 'DIMENSION') {
        const x1 = ent.x1 || 0, y1 = -(ent.y1 || 0), x2 = ent.x2 || 0, y2 = -(ent.y2 || 0);
        svgLines.push(`    <line x1="${x1.toFixed(3)}" y1="${y1.toFixed(3)}" x2="${x2.toFixed(3)}" y2="${y2.toFixed(3)}" stroke="${col}" />`);
        if (ent.text) {
          const tx = ent.textX ?? ent.x ?? (x1 + x2) / 2, ty = -(ent.textY ?? ent.y ?? -(y1 + y2) / 2);
          svgLines.push(`    <text x="${tx.toFixed(3)}" y="${ty.toFixed(3)}" fill="${col}" font-family="Segoe UI, Arial, sans-serif" font-size="2.8" text-anchor="middle">${esc(ent.text)}</text>`);
        }
      }
    }
    svgLines.push(`  </g>`, `</svg>`);
    const svgStr = svgLines.join('\n');
    const rawName = (StudioState.activeSlot === 'A' ? ds.nameA : ds.nameB) || 'Drawing.dxf';
    const outName = rawName.replace(/\.dxf$/i, '') + '.svg';
    if (typeof window !== 'undefined' && window.native && window.native.saveFile) {
      const saved = await window.native.saveFile({
        name: outName,
        bytes: new TextEncoder().encode(svgStr),
        filters: [{ name: 'Scalable Vector Graphics (.svg)', extensions: ['svg'] }]
      });
      if (saved) toast(`Exported CAD SVG: ${saved}`);
    }
    return svgStr;
  }

  async function exportDXFStudioPNG() {
    const cv = $('#dxf-canvas');
    const ds = getDXFState();
    if (!cv || !cv.width) return;
    renderCanvas();
    const dataUrl = cv.toDataURL('image/png');
    const b64 = (dataUrl && dataUrl.split(',')[1]) || '';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const rawName = (ds && (StudioState.activeSlot === 'A' ? ds.nameA : ds.nameB)) || 'Drawing.dxf';
    const outName = rawName.replace(/\.dxf$/i, '') + '_Modelspace.png';
    if (typeof window !== 'undefined' && window.native && window.native.saveFile) {
      const saved = await window.native.saveFile({
        name: outName,
        bytes,
        filters: [{ name: 'PNG Image (.png)', extensions: ['png'] }]
      });
      if (saved) toast(`Exported Modelspace PNG: ${saved}`);
    }
  }

  async function sendDXFToPDFStudio() {
    const parser = ensureActiveParser();
    const ds = getDXFState();
    if (!parser || !ds) return;
    syncParserMutation();
    try {
      const pdfBytes = await parser.toVectorPDFBytes({
        background: '#ffffff',
        lineWidth: 1.4,
        showGrid: false,
        hiddenLayers: new Set([...ds.hiddenLayers, ...ds.frozenLayers])
      });
      const rawName = (StudioState.activeSlot === 'A' ? ds.nameA : ds.nameB) || 'Drawing.dxf';
      ds._loadedInPdfStudio = true;
      ds._pdfDirty = false;
      if (typeof window !== 'undefined' && window.setView) window.setView('edit');
      if (typeof window !== 'undefined' && window.RE && window.RE.openBytes) {
        await window.RE.openBytes(pdfBytes, rawName.replace(/\.dxf$/i, '.pdf'), '');
        toast(`Opened ${rawName} as Vector PDF in PDF Studio.`);
      }
    } catch (e) {
      toast('Could not convert DXF to PDF Studio: ' + e.message);
    }
  }

  async function syncAndSendToCompare() {
    const ds = getDXFState();
    if (!ds) return;
    syncParserMutation();
    ds._studioDirty = false;
    if (typeof window !== 'undefined' && window.setView) {
      window.setView('compare');
    }
    if (typeof window !== 'undefined' && window.UIRibbon && typeof window.UIRibbon.reRenderActiveDXFLayers === 'function') {
      await window.UIRibbon.reRenderActiveDXFLayers();
    }
    if (window.showDXFPreCompareModal && ds.parsedA && ds.parsedB && !window.__autoConfirmDXF) {
      window.showDXFPreCompareModal();
    }
  }

  // ==========================================================================
  // FULL AUTOCAD COMMAND LINE INTERPRETER (60+ COMMANDS, POLAR & DIRECT ENTRY)
  // ==========================================================================
  function createBlockFromSelection(blockNameInput) {
    const parser = ensureActiveParser();
    if (!parser || StudioState.selectedIds.size === 0) {
      logCommand('BLOCK: Select one or more entities first, then run BLOCK <name>.');
      return null;
    }
    const selEnts = parser.entities.filter(e => StudioState.selectedIds.has(e._id) && !isLayerLocked(parser, e.layer));
    if (!selEnts.length) {
      logCommand('BLOCK: No unlocked entities selected.');
      return null;
    }
    const rawName = String(blockNameInput || '').trim() || ('BLK_' + Math.floor(Date.now() % 100000));
    const safeName = rawName.replace(/[^A-Za-z0-9_$-]/g, '_');
    let minX = Infinity, minY = Infinity;
    for (const e of selEnts) {
      const bb = DXFEngine.computeStandaloneEntityBBox(e, parser);
      if (bb) {
        if (bb.minX < minX) minX = bb.minX;
        if (bb.minY < minY) minY = bb.minY;
      }
    }
    const bx = Number.isFinite(minX) ? minX : 0;
    const by = Number.isFinite(minY) ? minY : 0;
    pushUndoSnapshot(`Create Block ${safeName}`);
    const blkEnts = selEnts.map(e => {
      const clone = JSON.parse(JSON.stringify(e));
      delete clone._id;
      return clone;
    });
    if (!parser.blocks) parser.blocks = {};
    const newBlkObj = { name: safeName, baseX: bx, baseY: by, entities: blkEnts };
    parser.blocks[safeName] = newBlkObj;
    parser.blocks[safeName.toUpperCase()] = newBlkObj;
    const selSet = new Set(selEnts.map(e => e._id));
    parser.entities = parser.entities.filter(e => !selSet.has(e._id));
    const ins = {
      _id: (`dxf_cad_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`),
      type: 'INSERT',
      layer: StudioState.currentLayer || '0',
      blockName: safeName,
      x: bx, y: by, z: 0,
      scaleX: 1, scaleY: 1, scaleZ: 1,
      rotation: 0,
      color: null,
      trueColor: null
    };
    parser.entities.push(ins);
    StudioState.selectedIds = new Set([ins._id]);
    syncParserMutation();
    refreshAllUI();
    logCommand(`BLOCK "${safeName}" created from ${selEnts.length} entity(s) at (${bx.toFixed(2)}, ${by.toFixed(2)}).`);
    return safeName;
  }

  function divideSelectedEntities(segmentsCount) {
    const parser = ensureActiveParser();
    const n = Math.max(2, Math.min(200, parseInt(segmentsCount, 10) || 4));
    if (!parser || StudioState.selectedIds.size === 0) {
      logCommand('DIVIDE: Select a LINE, CIRCLE, ARC, or POLYLINE first, then run DIVIDE <segments>.');
      return 0;
    }
    const selEnts = parser.entities.filter(e => StudioState.selectedIds.has(e._id) && !isLayerLocked(parser, e.layer));
    if (!selEnts.length) return 0;
    pushUndoSnapshot(`Divide (${n})`);
    let added = 0;
    for (const e of selEnts) {
      const ptsToAdd = [];
      if (e.type === 'LINE') {
        for (let i = 1; i < n; i++) {
          const t = i / n;
          ptsToAdd.push({ x: e.x1 + (e.x2 - e.x1) * t, y: e.y1 + (e.y2 - e.y1) * t });
        }
      } else if (e.type === 'CIRCLE') {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          ptsToAdd.push({ x: e.cx + e.r * Math.cos(a), y: e.cy + e.r * Math.sin(a) });
        }
      } else if (e.type === 'ARC') {
        let sa = (e.startAngle || 0) * Math.PI / 180;
        let ea = (e.endAngle || 0) * Math.PI / 180;
        while (ea <= sa) ea += Math.PI * 2;
        for (let i = 1; i < n; i++) {
          const a = sa + (ea - sa) * (i / n);
          ptsToAdd.push({ x: e.cx + e.r * Math.cos(a), y: e.cy + e.r * Math.sin(a) });
        }
      } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
        const rp = e.renderPoints || e.points || [];
        const ptXY = p => Array.isArray(p) ? [Number(p[0]) || 0, Number(p[1]) || 0] : [Number(p && p.x) || 0, Number(p && p.y) || 0];
        if (rp.length >= 2) {
          const segLens = [];
          let total = 0;
          const cnt = e.closed ? rp.length : rp.length - 1;
          for (let i = 0; i < cnt; i++) {
            const [x0, y0] = ptXY(rp[i]);
            const [x1, y1] = ptXY(rp[(i + 1) % rp.length]);
            const d = Math.hypot(x1 - x0, y1 - y0);
            segLens.push(d);
            total += d;
          }
          if (total > 1e-9) {
            for (let k = 1; k < n; k++) {
              let target = (total * k) / n;
              for (let i = 0; i < cnt; i++) {
                if (target <= segLens[i] || i === cnt - 1) {
                  const [x0, y0] = ptXY(rp[i]);
                  const [x1, y1] = ptXY(rp[(i + 1) % rp.length]);
                  const t = segLens[i] > 1e-9 ? Math.max(0, Math.min(1, target / segLens[i])) : 0;
                  ptsToAdd.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
                  break;
                }
                target -= segLens[i];
              }
            }
          }
        }
      }
      for (const p of ptsToAdd) {
        parser.entities.push({
          _id: (`dxf_cad_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`),
          type: 'POINT',
          layer: StudioState.currentLayer || e.layer || '0',
          x: p.x, y: p.y, z: 0,
          color: null, trueColor: null
        });
        added++;
      }
    }
    if (added > 0) {
      syncParserMutation();
      refreshAllUI();
      logCommand(`DIVIDE: Placed ${added} division point(s) across ${selEnts.length} entity(s) (${n} segments).`);
    } else {
      logCommand('DIVIDE: Selected entity type does not support division.');
    }
    return added;
  }

  function listSelectedEntitiesInfo() {
    const parser = ensureActiveParser();
    if (!parser) return [];
    const selEnts = parser.entities.filter(e => StudioState.selectedIds.has(e._id));
    if (!selEnts.length) {
      logCommand(`LIST: No entities selected. Drawing has ${parser.entities.length} entities (${parser.unitName || 'mm'}).`);
      return [];
    }
    const unit = parser.unitName || 'mm';
    const lines = selEnts.slice(0, 12).map(e => {
      const bb = DXFEngine.computeStandaloneEntityBBox(e, parser);
      const sz = bb ? `${(bb.maxX - bb.minX).toFixed(2)}×${(bb.maxY - bb.minY).toFixed(2)} ${unit}` : 'n/a';
      let extra = '';
      if (e.type === 'LINE') extra = `len=${Math.hypot(e.x2 - e.x1, e.y2 - e.y1).toFixed(3)} ${unit}`;
      else if (e.type === 'CIRCLE') extra = `R=${(e.r || 0).toFixed(3)} Ø=${((e.r || 0) * 2).toFixed(3)} ${unit}`;
      else if (e.type === 'ARC') extra = `R=${(e.r || 0).toFixed(3)} (${(e.startAngle || 0).toFixed(1)}°..${(e.endAngle || 0).toFixed(1)}°)`;
      else if (e.type === 'TEXT') extra = `"${String(e.text || '').slice(0, 28)}" H=${(e.height || 0).toFixed(3)}`;
      else if (e.type === 'INSERT') extra = `block=${e.blockName} scale=(${e.scaleX || 1},${e.scaleY || 1}) rot=${(e.rotation || 0).toFixed(1)}°`;
      else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') extra = `pts=${(e.points || []).length} ${e.closed ? 'CLOSED' : 'OPEN'}`;
      return `${e.type} [Layer:${e.layer || '0'}] ${extra} bbox=${sz}`;
    });
    logCommand(`LIST (${selEnts.length}): ` + lines.join(' | '));
    return lines;
  }

  function isolateSelectedLayer(explicitLayer = null) {
    const parser = ensureActiveParser();
    const ds = getDXFState();
    if (!parser || !ds) return 0;
    const targetLayers = new Set();
    if (explicitLayer) {
      targetLayers.add(String(explicitLayer));
    } else if (StudioState.selectedIds.size > 0) {
      for (const e of parser.entities) {
        if (StudioState.selectedIds.has(e._id)) targetLayers.add(e.layer || '0');
      }
    } else {
      targetLayers.add(StudioState.currentLayer || '0');
    }
    if (!StudioState._preIsoHidden) {
      StudioState._preIsoHidden = new Set(ds.hiddenLayers);
    }
    const allLayers = new Set(Object.keys(parser.layers || {}));
    for (const e of parser.entities) allLayers.add(e.layer || '0');
    let hiddenCount = 0;
    for (const lyr of allLayers) {
      if (!targetLayers.has(lyr)) {
        ds.hiddenLayers.add(lyr);
        hiddenCount++;
      } else {
        ds.hiddenLayers.delete(lyr);
      }
    }
    refreshAllUI();
    logCommand(`LAYISO: Isolated layer(s) [${[...targetLayers].join(', ')}] (hid ${hiddenCount} other layer(s)).`);
    return hiddenCount;
  }

  function unisolateLayers() {
    const ds = getDXFState();
    if (!ds) return false;
    if (StudioState._preIsoHidden) {
      ds.hiddenLayers = new Set(StudioState._preIsoHidden);
      StudioState._preIsoHidden = null;
    } else {
      ds.hiddenLayers.clear();
    }
    refreshAllUI();
    logCommand('LAYUNISO: Restored all isolated layers.');
    return true;
  }

  function quickSelectEntities(criteria = '') {
    const parser = ensureActiveParser();
    if (!parser) return 0;
    const raw = String(criteria || '').trim();
    if (!raw) {
      logCommand('QSELECT: Usage QSELECT <TYPE|LAYER> (e.g. QSELECT CIRCLE, QSELECT TEXT, QSELECT LAYER:DIM).');
      return 0;
    }
    const upper = raw.toUpperCase();
    const isLayerQuery = upper.startsWith('LAYER:');
    const layerTarget = isLayerQuery ? raw.slice(6).trim().toUpperCase() : upper;
    const matched = [];
    for (const e of parser.entities) {
      if (isLayerHiddenOrFrozen(parser, e.layer)) continue;
      if (isLayerQuery) {
        if (String(e.layer || '0').toUpperCase() === layerTarget) matched.push(e._id);
      } else if (String(e.type || '').toUpperCase() === upper || String(e.layer || '0').toUpperCase() === upper) {
        matched.push(e._id);
      }
    }
    StudioState.selectedIds = new Set(matched);
    refreshAllUI();
    logCommand(`QSELECT "${raw}": Selected ${matched.length} entity(s).`);
    return matched.length;
  }

  function findAndReplaceDXFText(query, replacement = null, parserOverride = null) {
    const parser = parserOverride || ensureActiveParser();
    const q = String(query || '').trim();
    if (!parser || !q) {
      logCommand('FIND: Usage FIND <text> or FIND <old> -> <new>.');
      return { matched: 0, replaced: 0 };
    }
    const qLower = q.toLowerCase();
    const hits = [];
    for (const e of parser.entities) {
      if (e.type === 'TEXT' || e.type === 'MTEXT') {
        const txt = String(e.text || '');
        if (txt.toLowerCase().includes(qLower)) hits.push(e);
      }
    }
    if (!hits.length) {
      logCommand(`FIND: No text entities matching "${q}".`);
      return { matched: 0, replaced: 0 };
    }
    let replaced = 0;
    if (replacement !== null && replacement !== undefined) {
      if (!parserOverride) pushUndoSnapshot(`Find & Replace "${q}"`);
      const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(esc, 'gi');
      for (const e of hits) {
        if (isLayerLocked(parser, e.layer)) continue;
        e.text = String(e.text || '').replace(re, String(replacement));
        replaced++;
      }
      if (!parserOverride) syncParserMutation();
    }
    if (!parserOverride) {
      StudioState.selectedIds = new Set(hits.map(e => e._id));
      refreshAllUI();
    }
    logCommand(replacement !== null && replacement !== undefined
      ? `FIND & REPLACE: Updated ${replaced} of ${hits.length} text entity(s) ("${q}" -> "${replacement}").`
      : `FIND: Selected ${hits.length} text entity(s) matching "${q}".`);
    return { matched: hits.length, replaced };
  }

  async function exportDXFBOMCSV(saveToFile = true, parserOverride = null) {
    const parser = parserOverride || ensureActiveParser();
    if (!parser) return '';
    const blockCounts = {};
    const typeCounts = {};
    const layerLengths = {};
    for (const e of parser.entities) {
      const t = e.type || 'UNKNOWN';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
      const lyr = e.layer || '0';
      if (t === 'INSERT' && e.blockName) {
        blockCounts[e.blockName] = (blockCounts[e.blockName] || 0) + 1;
      }
      let len = 0;
      if (t === 'LINE') len = Math.hypot((e.x2 || 0) - (e.x1 || 0), (e.y2 || 0) - (e.y1 || 0));
      else if (t === 'CIRCLE') len = 2 * Math.PI * (e.r || 0);
      else if (t === 'LWPOLYLINE' || t === 'POLYLINE') {
        const pts = e.renderPoints || e.points || [];
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          const ax = Array.isArray(a) ? a[0] : a.x, ay = Array.isArray(a) ? a[1] : a.y;
          const bx = Array.isArray(b) ? b[0] : b.x, by = Array.isArray(b) ? b[1] : b.y;
          if (Number.isFinite(ax) && Number.isFinite(bx)) len += Math.hypot(bx - ax, by - ay);
        }
      }
      layerLengths[lyr] = (layerLengths[lyr] || 0) + len;
    }
    const unit = parser.unitName || 'mm';
    const rows = ['Category,Name,Count,TotalLength_' + unit];
    for (const [blk, cnt] of Object.entries(blockCounts).sort()) {
      rows.push(`BLOCK,"${blk.replace(/"/g, '""')}",${cnt},0`);
    }
    for (const [tp, cnt] of Object.entries(typeCounts).sort()) {
      rows.push(`ENTITY_TYPE,"${tp}",${cnt},0`);
    }
    for (const [lyr, len] of Object.entries(layerLengths).sort()) {
      rows.push(`LAYER_LENGTH,"${lyr.replace(/"/g, '""')}",1,${len.toFixed(3)}`);
    }
    const csv = rows.join('\n');
    const blkSummary = Object.entries(blockCounts).map(([k, v]) => `${k}:${v}`).join(', ') || 'none';
    logCommand(`BCOUNT/BOM: ${parser.entities.length} entities | Blocks: ${blkSummary}.`);
    if (saveToFile && typeof window !== 'undefined' && window.native && window.native.saveFile) {
      const saved = await window.native.saveFile({
        name: 'DXF_Drawing_BOM.csv',
        bytes: new TextEncoder().encode(csv),
        filters: [{ name: 'CSV Bill of Materials (.csv)', extensions: ['csv'] }]
      });
      if (saved) toast(`Exported DXF BOM CSV: ${saved}`);
    }
    return csv;
  }

  function generateBoltCirclePattern(cx = 0, cy = 0, pcd = 60, count = 6, holeDia = 6.6, startDeg = 0, parserOverride = null) {
    const parser = parserOverride || ensureActiveParser(true);
    if (!parser) return 0;
    const n = Math.max(2, Math.min(64, parseInt(count, 10) || 6));
    const rPitch = Math.max(1, (Number(pcd) || 60) / 2);
    const rHole = Math.max(0.25, (Number(holeDia) || 6.6) / 2);
    if (!parserOverride) pushUndoSnapshot(`Bolt Circle ${n}x Ø${(rHole * 2).toFixed(1)} on PCD ${(rPitch * 2).toFixed(1)}`);
    const lyr = StudioState.currentLayer || '0';
    // Pitch reference circle (CENTER linetype)
    parser.entities.push({
      _id: (`dxf_cad_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`), type: 'CIRCLE', layer: lyr, cx, cy, r: rPitch,
      linetype: 'CENTER', color: 4, trueColor: null
    });
    for (let i = 0; i < n; i++) {
      const ang = ((Number(startDeg) || 0) + (360 * i) / n) * Math.PI / 180;
      const hx = cx + Math.cos(ang) * rPitch;
      const hy = cy + Math.sin(ang) * rPitch;
      parser.entities.push({
        _id: (`dxf_cad_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`), type: 'CIRCLE', layer: lyr, cx: hx, cy: hy, r: rHole,
        linetype: 'CONTINUOUS', color: null, trueColor: null
      });
    }
    if (!parserOverride) {
      syncParserMutation();
      refreshAllUI();
      logCommand(`BOLTCIRCLE: Created ${n}× Ø${(rHole * 2).toFixed(2)} holes on PCD ${(rPitch * 2).toFixed(2)} at (${cx}, ${cy}).`);
    }
    return n + 1;
  }

  function insertMechanicalTitleBlock(titleText = 'KENSHO PRO CAD DRAWING', parserOverride = null) {
    const parser = parserOverride || ensureActiveParser(true);
    if (!parser) return false;
    if (!parserOverride) pushUndoSnapshot('Insert Mechanical Title Block');
    if (typeof parser.computeBounds === 'function') parser.computeBounds();
    const bb = (parser.bounds && isFinite(parser.bounds.minX)) ? parser.bounds : { minX: 0, minY: 0, maxX: 200, maxY: 140 };
    const pad = Math.max(15, Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) * 0.14);
    const x0 = bb.minX - pad, y0 = bb.minY - pad, x1 = bb.maxX + pad, y1 = bb.maxY + pad;
    const tbW = Math.min((x1 - x0) * 0.45, Math.max(70, (x1 - x0) * 0.32));
    const tbH = Math.max(18, (y1 - y0) * 0.14);
    const addL = (ax, ay, bx, by) => parser.entities.push({ _id: (`dxf_cad_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`), type: 'LINE', layer: 'TITLE_BLOCK', x1: ax, y1: ay, x2: bx, y2: by, color: 7, trueColor: null });
    // Outer drawing frame
    addL(x0, y0, x1, y0); addL(x1, y0, x1, y1); addL(x1, y1, x0, y1); addL(x0, y1, x0, y0);
    // Title block box at bottom-right
    addL(x1 - tbW, y0, x1 - tbW, y0 + tbH);
    addL(x1 - tbW, y0 + tbH, x1, y0 + tbH);
    addL(x1 - tbW, y0 + tbH * 0.5, x1, y0 + tbH * 0.5);
    const txtH = Math.max(2.2, tbH * 0.22);
    parser.entities.push({ _id: (`dxf_cad_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`), type: 'TEXT', layer: 'TITLE_BLOCK', x: x1 - tbW + txtH, y: y0 + tbH * 0.62, height: txtH, text: String(titleText), color: 7, trueColor: null });
    parser.entities.push({ _id: (`dxf_cad_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`), type: 'TEXT', layer: 'TITLE_BLOCK', x: x1 - tbW + txtH, y: y0 + tbH * 0.16, height: txtH * 0.78, text: `UNITS: ${(parser.unitName || 'mm').toUpperCase()}  |  KENSHO PRO v1.2.3.2`, color: 7, trueColor: null });
    if (!parserOverride) {
      syncParserMutation();
      refreshAllUI();
      zoomExtents();
      logCommand(`TITLEBLOCK: Inserted ISO/ANSI border & title block ("${titleText}").`);
    }
    return true;
  }

  function regenDrawing() {
    const parser = ensureActiveParser();
    if (!parser) return;
    if (DXFEngine && typeof DXFEngine.syncEntityRenderGeometry === 'function') {
      for (const e of parser.entities) {
        DXFEngine.syncEntityRenderGeometry(e);
      }
    }
    if (typeof parser.computeBounds === 'function') parser.computeBounds();
    refreshAllUI();
    renderCanvas();
    logCommand(`REGEN: Rebuilt geometry caches and bounds for ${parser.entities.length} entities.`);
  }

  function executeCommandLine(rawInput) {
    let cmdStr = String(rawInput || '').trim();
    if (!cmdStr) {
      if (StudioState.lastCommand) {
        cmdStr = StudioState.lastCommand;
      } else {
        return;
      }
    }
    if (!Array.isArray(StudioState.commandHistory)) StudioState.commandHistory = [];
    if (StudioState.commandHistory[StudioState.commandHistory.length - 1] !== cmdStr) {
      StudioState.commandHistory.push(cmdStr);
      if (StudioState.commandHistory.length > 60) StudioState.commandHistory.shift();
    }
    StudioState.commandHistoryIdx = StudioState.commandHistory.length;

    const upper = cmdStr.toUpperCase();
    const tokens = cmdStr.split(/\s+/);
    const cmdHead = (tokens[0] || '').toUpperCase();
    const cmdArg = tokens.slice(1).join(' ').trim();
    const parser = ensureActiveParser();

    // 1. Polar coordinates: "@dist<angle" or "dist<angle" (AutoCAD standard)
    const polarMatch = /^(@)?\s*(-?\d+(?:\.\d+)?)\s*<\s*(-?\d+(?:\.\d+)?)$/.exec(cmdStr);
    if (polarMatch) {
      const isRel = !!polarMatch[1];
      const dist = parseFloat(polarMatch[2]);
      const angRad = parseFloat(polarMatch[3]) * Math.PI / 180;
      let ox = 0, oy = 0;
      if (isRel && StudioState.tempPoints.length > 0) {
        const last = StudioState.tempPoints[StudioState.tempPoints.length - 1];
        ox = last.x;
        oy = last.y;
      }
      const px = ox + dist * Math.cos(angRad);
      const py = oy + dist * Math.sin(angRad);
      logCommand(`Polar point: (${px.toFixed(3)}, ${py.toFixed(3)}) [${isRel ? '@' : ''}${dist}<${polarMatch[3]}°]`);
      handleCanvasClickPoint({ x: px, y: py });
      return;
    }

    // 2. Cartesian coordinates: "X,Y" or relative "@dx,dy"
    const coordMatch = /^(@)?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(cmdStr);
    if (coordMatch) {
      const isRel = !!coordMatch[1];
      let x = parseFloat(coordMatch[2]);
      let y = parseFloat(coordMatch[3]);
      if (isRel && StudioState.tempPoints.length > 0) {
        const last = StudioState.tempPoints[StudioState.tempPoints.length - 1];
        x += last.x;
        y += last.y;
      }
      handleCanvasClickPoint({ x, y });
      return;
    }

    // 3. Numeric input: Offset / Fillet / Rotate / Scale / Direct Distance Entry (AutoCAD DDE)
    if (/^-?\d+(?:\.\d+)?$/.test(cmdStr)) {
      const numVal = parseFloat(cmdStr);
      if (StudioState.activeTool === 'offset' && numVal > 0) {
        StudioState.offsetDistance = numVal;
        if ($('#dxf-st-offset-val')) $('#dxf-st-offset-val').value = numVal;
        logCommand(`Offset distance set to ${numVal} ${parser ? parser.unitName : 'mm'}.`);
        return;
      }
      if (StudioState.activeTool === 'fillet' && numVal >= 0) {
        StudioState.filletRadius = numVal;
        if ($('#dxf-st-fillet-val')) $('#dxf-st-fillet-val').value = numVal;
        logCommand(`Fillet radius set to ${numVal} ${parser ? parser.unitName : 'mm'}.`);
        return;
      }
      if (StudioState.activeTool === 'rotate' && StudioState.selectedIds.size > 0 && parser) {
        const selEnts = parser.entities.filter(e => StudioState.selectedIds.has(e._id) && !isLayerLocked(parser, e.layer));
        if (selEnts.length) {
          pushUndoSnapshot(`Rotate ${numVal}°`);
          const base = StudioState.tempPoints[0] || { x: 0, y: 0 };
          selEnts.forEach(e => rotateEntity(e, base.x, base.y, numVal, parser));
          syncParserMutation();
          StudioState.tempPoints = [];
          setActiveTool('select');
          refreshAllUI();
          logCommand(`Rotated ${selEnts.length} entity(s) by ${numVal}°.`);
          return;
        }
      }
      if (StudioState.activeTool === 'scale' && StudioState.selectedIds.size > 0 && numVal > 0 && parser) {
        const selEnts = parser.entities.filter(e => StudioState.selectedIds.has(e._id) && !isLayerLocked(parser, e.layer));
        if (selEnts.length) {
          pushUndoSnapshot(`Scale ${numVal}x`);
          const base = StudioState.tempPoints[0] || { x: 0, y: 0 };
          selEnts.forEach(e => scaleEntity(e, base.x, base.y, numVal, parser));
          syncParserMutation();
          StudioState.tempPoints = [];
          setActiveTool('select');
          refreshAllUI();
          logCommand(`Scaled ${selEnts.length} entity(s) by ${numVal}x.`);
          return;
        }
      }
      // AutoCAD Direct Distance Entry along cursor direction for drawing/move/copy/circle
      const ddeTools = new Set(['line', 'polyline', 'circle', 'xline', 'move', 'copy']);
      if (ddeTools.has(StudioState.activeTool) && StudioState.tempPoints.length > 0 && numVal > 0) {
        const base = StudioState.tempPoints[StudioState.tempPoints.length - 1];
        const cur = StudioState.cursorWorld || { x: base.x + 1, y: base.y };
        let dx = cur.x - base.x;
        let dy = cur.y - base.y;
        const len = Math.hypot(dx, dy);
        if (len > 1e-9) {
          if (StudioState.orthoEnabled) {
            if (Math.abs(dx) >= Math.abs(dy)) { dx = dx >= 0 ? 1 : -1; dy = 0; }
            else { dx = 0; dy = dy >= 0 ? 1 : -1; }
          } else {
            dx /= len;
            dy /= len;
          }
        } else {
          dx = 1; dy = 0;
        }
        const pt = { x: base.x + dx * numVal, y: base.y + dy * numVal };
        logCommand(`Direct distance ${numVal} -> (${pt.x.toFixed(3)}, ${pt.y.toFixed(3)})`);
        handleCanvasClickPoint(pt);
        return;
      }
    }

    // Track last non-coordinate command for Enter/Space repeat
    StudioState.lastCommand = cmdStr;

    const aliases = {
      L: 'line', LINE: 'line',
      PL: 'polyline', PLINE: 'polyline', POLYLINE: 'polyline', PE: 'polyline', PEDIT: 'polyline',
      REC: 'rect', RECT: 'rect', RECTANG: 'rect', RECTANGLE: 'rect',
      TRI: 'triangle', TRIANGLE: 'triangle',
      POL: 'polygon', POLYGON: 'polygon',
      DO: 'donut', DONUT: 'donut', DOUGHNUT: 'donut',
      RC: 'revcloud', REVCLOUD: 'revcloud',
      XL: 'xline', XLINE: 'xline', RAY: 'xline',
      BOX: 'box3d', '3DBOX': 'box3d', '3DFACE': 'box3d', EXTRUDE: 'box3d',
      C: 'circle', CIRCLE: 'circle',
      A: 'arc', ARC: 'arc',
      EL: 'ellipse', ELLIPSE: 'ellipse',
      SPL: 'spline', SPLINE: 'spline',
      T: 'text', MT: 'text', TEXT: 'text', MTEXT: 'text', DT: 'text', DTEXT: 'text', ED: 'text', DDEDIT: 'text',
      DIM: 'dim', DLI: 'dim', DAL: 'dim', DIMLINEAR: 'dim', DIMALIGNED: 'dim', DIMENSION: 'dim',
      DAN: 'dimang', DIMANGULAR: 'dimang',
      DRA: 'dimrad', DIMRADIUS: 'dimrad',
      DDI: 'dimdia', DIMDIAMETER: 'dimdia',
      LE: 'leader', LEADER: 'leader', QLEADER: 'leader', MLEADER: 'leader',
      H: 'hatch', BH: 'hatch', HATCH: 'hatch', BHATCH: 'hatch',
      PO: 'point', POINT: 'point',
      I: 'insert', INSERT: 'insert',
      M: 'move', MOVE: 'move',
      S: 'move', STRETCH: 'move', AL: 'move', ALIGN: 'move',
      CO: 'copy', CP: 'copy', COPY: 'copy',
      RO: 'rotate', ROTATE: 'rotate',
      SC: 'scale', SCALE: 'scale',
      MI: 'mirror', MIRROR: 'mirror',
      O: 'offset', OFFSET: 'offset',
      TR: 'trim', TRIM: 'trim',
      EX: 'extend', EXTEND: 'extend',
      F: 'fillet', FILLET: 'fillet',
      CHA: 'chamfer', CHAMFER: 'chamfer',
      BR: 'break', BREAK: 'break',
      AP: 'arraypolar', ARRAYPOLAR: 'arraypolar',
      MA: 'matchprop', MATCHPROP: 'matchprop',
      DI: 'measure', DIST: 'measure', MEASUREGEOM: 'measure',
      ID: 'id',
      ORBIT: 'orbit', '3DORBIT': 'orbit', '3DO': 'orbit',
      PAN: 'pan', P: 'pan',
      SELECT: 'select', ESC: 'select'
    };

    if (aliases[cmdHead]) {
      if (cmdHead === 'S' || cmdHead === 'STRETCH') {
        logCommand('STRETCH: Specify base point and displacement (or enter @dx,dy / @dist<angle).');
      }
      setActiveTool(aliases[cmdHead]);
      return;
    }
    if (cmdHead === 'LW' || cmdHead === 'LINEWEIGHT') {
      const mmVal = parseFloat(cmdArg);
      if (Number.isFinite(mmVal) && mmVal > 0) {
        const code = mmVal <= 5 ? Math.round(mmVal * 100) : Math.round(mmVal);
        setActiveLineweight(code, true);
        logCommand(`LINEWEIGHT set to ${(code / 100).toFixed(2)} mm.`);
      } else {
        setActiveLineweight(-1, true);
        logCommand('LINEWEIGHT reset to ByLayer.');
      }
      return;
    }
    if (cmdHead === 'THICKNESS' || cmdHead === 'THK') {
      const tv = parseFloat(cmdArg);
      if (Number.isFinite(tv)) {
        setDefaultThickness(tv, true);
        logCommand(`3D THICKNESS set to ${tv}.`);
      }
      return;
    }
    if (cmdHead === 'B' || cmdHead === 'BLOCK') {
      createBlockFromSelection(cmdArg);
      return;
    }
    if (cmdHead === 'DIV' || cmdHead === 'DIVIDE' || cmdHead === 'ME' || cmdHead === 'MEASURE') {
      divideSelectedEntities(parseInt(cmdArg, 10) || 4);
      return;
    }
    if (cmdHead === 'LI' || cmdHead === 'LIST') {
      listSelectedEntitiesInfo();
      return;
    }
    if (cmdHead === 'RE' || cmdHead === 'REGEN' || cmdHead === 'REGENALL') {
      regenDrawing();
      return;
    }
    if (cmdHead === 'UN' || cmdHead === 'UNITS') {
      const unitMap = { MM: [4, 'mm'], CM: [5, 'cm'], M: [6, 'm'], IN: [1, 'in'], INCH: [1, 'in'], INCHES: [1, 'in'], FT: [2, 'ft'], FEET: [2, 'ft'] };
      const uKey = cmdArg.toUpperCase();
      if (parser && unitMap[uKey]) {
        const [code, uName] = unitMap[uKey];
        parser.insunitsCode = code;
        parser.unitCode = code;
        parser.unitName = uName;
        if (parser.header) parser.header['$INSUNITS'] = String(code);
        refreshAllUI();
        logCommand(`UNITS: Drawing units set to ${uName} ($INSUNITS=${code}).`);
      } else {
        logCommand(`UNITS: Current drawing units = ${parser ? parser.unitName : 'mm'}. Usage: UNITS MM | IN | CM | M | FT.`);
      }
      return;
    }
    if (cmdHead === 'OS' || cmdHead === 'OSNAP') {
      StudioState.osnapEnabled = cmdArg ? !/^(OFF|0|FALSE)$/i.test(cmdArg) : !StudioState.osnapEnabled;
      if ($('#dxf-aid-osnap')) $('#dxf-aid-osnap').classList.toggle('on', StudioState.osnapEnabled);
      updateStatusBar();
      logCommand(`OSNAP: ${StudioState.osnapEnabled ? 'ON' : 'OFF'}.`);
      return;
    }
    if (cmdHead === 'ORTHO') {
      StudioState.orthoEnabled = cmdArg ? !/^(OFF|0|FALSE)$/i.test(cmdArg) : !StudioState.orthoEnabled;
      if ($('#dxf-aid-ortho')) $('#dxf-aid-ortho').classList.toggle('on', StudioState.orthoEnabled);
      updateStatusBar();
      logCommand(`ORTHO: ${StudioState.orthoEnabled ? 'ON' : 'OFF'}.`);
      return;
    }
    if (cmdHead === 'POLAR') {
      StudioState.polarEnabled = cmdArg ? !/^(OFF|0|FALSE)$/i.test(cmdArg) : !StudioState.polarEnabled;
      if ($('#dxf-aid-polar')) $('#dxf-aid-polar').classList.toggle('on', StudioState.polarEnabled);
      updateStatusBar();
      logCommand(`POLAR TRACKING: ${StudioState.polarEnabled ? 'ON' : 'OFF'}.`);
      return;
    }
    if (cmdHead === 'GRID') {
      StudioState.gridEnabled = cmdArg ? !/^(OFF|0|FALSE)$/i.test(cmdArg) : !StudioState.gridEnabled;
      if ($('#dxf-aid-grid')) $('#dxf-aid-grid').classList.toggle('on', StudioState.gridEnabled);
      renderCanvas();
      updateStatusBar();
      logCommand(`GRID: ${StudioState.gridEnabled ? 'ON' : 'OFF'}.`);
      return;
    }
    if (cmdHead === 'LAYISO' || cmdHead === 'ISOLATE') {
      isolateSelectedLayer(cmdArg || null);
      return;
    }
    if (cmdHead === 'LAYUNISO' || cmdHead === 'UNISOLATE') {
      unisolateLayers();
      return;
    }
    if (cmdHead === 'QSELECT' || cmdHead === 'QS') {
      quickSelectEntities(cmdArg || 'LINE');
      return;
    }
    if (cmdHead === 'FIND') {
      const arrowIdx = cmdArg.indexOf('->');
      if (arrowIdx >= 0) {
        const findStr = cmdArg.slice(0, arrowIdx).trim();
        const replStr = cmdArg.slice(arrowIdx + 2).trim();
        findAndReplaceDXFText(findStr, replStr);
      } else {
        findAndReplaceDXFText(cmdArg, null);
      }
      return;
    }
    if (cmdHead === 'BCOUNT' || cmdHead === 'BOM') {
      exportDXFBOMCSV(cmdHead === 'BOM');
      return;
    }
    if (cmdHead === 'BOLTCIRCLE' || cmdHead === 'PCD') {
      const nums = cmdArg.split(/[\s,]+/).map(Number).filter(Number.isFinite);
      generateBoltCirclePattern(0, 0, nums[0] || 60, nums[1] || 6, nums[2] || 6.6, nums[3] || 0);
      return;
    }
    if (cmdHead === 'TITLEBLOCK' || cmdHead === 'BORDER') {
      insertMechanicalTitleBlock(cmdArg || 'KENSHO PRO CAD DRAWING');
      return;
    }
    if (cmdHead === 'SELECTALL' || cmdHead === 'AI_SELALL') {
      if (parser) {
        StudioState.selectedIds = new Set(parser.entities.filter(e => !isLayerHiddenOrFrozen(parser, e.layer)).map(e => e._id));
        refreshAllUI();
        logCommand(`Selected all ${StudioState.selectedIds.size} visible entities.`);
      }
      return;
    }
    if (cmdHead === 'DESELECT' || cmdHead === 'CLEARSEL') {
      StudioState.selectedIds.clear();
      refreshAllUI();
      logCommand('Selection cleared.');
      return;
    }
    if (cmdHead === 'AR' || cmdHead === 'ARRAY' || cmdHead === 'ARRAYRECT') {
      arrayRectSelectedEntities();
      return;
    }
    if (cmdHead === 'J' || cmdHead === 'JOIN') {
      joinSelectedEntities();
      return;
    }
    if (cmdHead === 'OV' || cmdHead === 'OVERKILL') {
      overkillDuplicateEntities();
      return;
    }
    if (VIEW_PRESETS[upper.toLowerCase()]) {
      setViewPreset(upper.toLowerCase());
      return;
    }
    if (cmdHead === '2D' || cmdHead === 'PLAN' || cmdHead === 'TOP') {
      setViewPreset('top');
      return;
    }
    if (cmdHead === '3D' || cmdHead === 'ISO' || cmdHead === 'SWISO') {
      setViewPreset('sw_iso');
      return;
    }
    if (cmdHead === 'E' || cmdHead === 'ERASE' || cmdHead === 'DEL' || cmdHead === 'DELETE') {
      deleteSelectedEntities();
      return;
    }
    if (cmdHead === 'X' || cmdHead === 'EXPLODE') {
      explodeSelectedEntities();
      return;
    }
    if (cmdHead === 'U' || cmdHead === 'UNDO') {
      undo();
      return;
    }
    if (cmdHead === 'REDO') {
      redo();
      return;
    }
    if (cmdHead === 'Z' || cmdHead === 'ZOOM' || cmdHead === 'ZE' || cmdHead === 'ZA') {
      const sub = cmdArg.toUpperCase();
      if (sub === 'IN' || sub === '+') {
        StudioState.zoom *= 1.35;
        renderCanvas();
        logCommand('Zoomed in.');
      } else if (sub === 'OUT' || sub === '-') {
        StudioState.zoom = Math.max(0.001, StudioState.zoom / 1.35);
        renderCanvas();
        logCommand('Zoomed out.');
      } else {
        zoomExtents();
        logCommand('Zoomed to drawing extents.');
      }
      return;
    }
    if (cmdHead === 'LA' || cmdHead === 'LAYER') {
      if (window.showDXFWorkbenchModal) window.showDXFWorkbenchModal('layers');
      return;
    }
    if (cmdHead === 'LEN' || cmdHead === 'LENGTHEN') {
      const arg = parseFloat(cmdArg);
      lengthenSelectedEntities(Number.isFinite(arg) ? arg : null);
      return;
    }
    if (cmdHead === 'ORIGIN' || cmdHead === 'ZERO' || cmdHead === 'CENTERORIGIN') {
      moveSelectionToOrigin(cmdHead === 'CENTERORIGIN');
      return;
    }
    if (cmdHead === 'AA' || cmdHead === 'AREA' || cmdHead === 'PERIMETER') {
      computeSelectionAreaAndLength();
      return;
    }
    if (cmdHead === 'BOXSIZE') {
      const mv = parseFloat(cmdArg) || 7;
      setHighlightBoxMils(mv);
      return;
    }
    if (cmdHead === 'DIFFBOXES' || cmdHead === 'REVBOXES') {
      toggleDiffBoxes();
      return;
    }
    if ((cmdHead === 'PU' || cmdHead === 'PURGE') && parser) {
      purgeUnusedLayersAndZeroEntities();
      return;
    }
    if (cmdHead === 'COMPARE' || cmdHead === 'DIFF') {
      if (window.showDXFPreCompareModal) window.showDXFPreCompareModal();
      return;
    }
    if (cmdHead === 'SAVE' || cmdHead === 'QSAVE' || cmdHead === 'SAVEAS' || cmdHead === 'EXPORT') {
      saveModifiedDXFFile();
      return;
    }
    if (cmdHead === 'NEW' || cmdHead === 'BLANK') {
      createNewBlankDXF(parser ? parser.unitName : 'mm');
      return;
    }
    if (cmdHead === 'HELP' || cmdHead === '?') {
      logCommand('AutoCAD Commands: DRAW(L,PL,C,A,REC,POL,EL,SPL,T,MT,H,PO,DO,XL,RC) | MODIFY(M,CO,RO,SC,MI,S,O,TR,EX,F,CHA,X,J,BR,LEN,AR,AP,E,MA,OV,DIV,B,I) | DIM(DLI,DAL,DAN,DRA,DDI,LE) | INQUIRY(DI,AA,ID,LI) | VIEW/MODE(Z,P,RE,UN,LA,OS,ORTHO,POLAR,GRID,U,REDO,PU,QSAVE) | COORDS(X,Y | @dx,dy | @dist<ang | direct distance).');
      return;
    }
    logCommand(`Unknown command "${cmdStr}". Type HELP or ? for the full AutoCAD command list.`);
  }

  async function readDXFFileEntry(f) {
    if (!f) return null;
    let name = f.name || 'Drawing.dxf';
    if (typeof f.text === 'string' && !/\.dwg$/i.test(name)) return { name, text: f.text };
    let buf = null;
    if (f.bytes) buf = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes);
    else if (f.data) buf = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
    else if (typeof f.arrayBuffer === 'function') buf = new Uint8Array(await f.arrayBuffer());
    else if (typeof f.text === 'function') return { name, text: await f.text() };
    if (!buf) return null;
    if (/\.dwg$/i.test(name)) {
      if (typeof window !== 'undefined' && window.native && typeof window.native.convertDwgToDxf === 'function') {
        const filePath = f.path || (window.native.getPathForFile ? window.native.getPathForFile(f) : '') || '';
        toast(`Converting AutoCAD DWG (${name}) offline...`);
        const conv = await window.native.convertDwgToDxf({ path: filePath, bytes: buf, name });
        if (!conv || !conv.ok || !conv.bytes) {
          toast((conv && conv.error) || 'AutoCAD .dwg conversion requires ODA File Converter or LibreDWG dwg2dxf.');
          return null;
        }
        buf = conv.bytes instanceof Uint8Array ? conv.bytes : new Uint8Array(conv.bytes);
        name = conv.name || name.replace(/\.dwg$/i, '.dxf');
      } else {
        toast('AutoCAD .dwg conversion requires the desktop app with ODA File Converter or LibreDWG dwg2dxf.');
        return null;
      }
    }
    const isBinDXF = buf.length >= 24 && String.fromCharCode(...buf.subarray(0, 18)) === 'AutoCAD Binary DXF';
    if (isBinDXF) {
      return { name, bytes: buf, isBinary: true, text: '' };
    }
    const text = (typeof DXFEngine !== 'undefined' && DXFEngine.decodeDXFBytes)
      ? DXFEngine.decodeDXFBytes(buf)
      : new TextDecoder().decode(buf);
    return { name, text };
  }

  function renderDXFDocTabs() {
    const bar = $('#dxf-doc-tabs');
    if (!bar) return;
    if (!StudioState.openDocs || StudioState.openDocs.length <= 1) {
      bar.hidden = true;
      bar.innerHTML = '';
      return;
    }
    bar.hidden = false;
    bar.innerHTML = StudioState.openDocs.map(doc => {
      const isAct = doc.id === StudioState.activeDocId;
      return `<div class="dxf-doc-tab${isAct ? ' active' : ''}" data-dxf-docid="${esc(doc.id)}" title="${esc(doc.name)}">` +
        `<span class="dxf-doc-tab-name">${esc(doc.name)}</span>` +
        `<button type="button" class="dxf-doc-tab-x" data-dxf-closeid="${esc(doc.id)}" title="Close Drawing">&times;</button>` +
      `</div>`;
    }).join('');
    bar.querySelectorAll('.dxf-doc-tab').forEach(el => {
      el.onclick = ev => {
        if (ev.target && ev.target.closest('.dxf-doc-tab-x')) return;
        switchDXFDocTab(el.getAttribute('data-dxf-docid'));
      };
    });
    bar.querySelectorAll('.dxf-doc-tab-x').forEach(btn => {
      btn.onclick = ev => {
        ev.stopPropagation();
        closeDXFDocTab(btn.getAttribute('data-dxf-closeid'));
      };
    });
  }

  function registerDXFDocTab(name, raw, parsed) {
    const existing = StudioState.openDocs.find(d => d.name === name && d.parsed === parsed);
    if (existing) {
      StudioState.activeDocId = existing.id;
      renderDXFDocTabs();
      return existing;
    }
    const id = 'dxfdoc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const rec = { id, name: String(name || 'Drawing.dxf'), raw, parsed };
    StudioState.openDocs.push(rec);
    StudioState.activeDocId = id;
    renderDXFDocTabs();
    return rec;
  }

  function switchDXFDocTab(docId) {
    const rec = StudioState.openDocs.find(d => d.id === docId);
    const ds = getDXFState();
    if (!rec || !ds) return;
    StudioState.activeDocId = rec.id;
    StudioState.viewMode = 'single';
    StudioState.activeSlot = 'B';
    ds.rawB = rec.raw;
    ds.nameB = rec.name;
    ds.parsedB = rec.parsed;
    ds._isActiveDXFSession = true;
    ds._isSampleDXF = false;
    StudioState.selectedIds.clear();
    if (typeof ds.syncLayerSetsFromParsers === 'function') ds.syncLayerSetsFromParsers();
    renderDXFDocTabs();
    refreshAllUI();
    zoomExtents();
  }

  function closeDXFDocTab(docId) {
    const idx = StudioState.openDocs.findIndex(d => d.id === docId);
    if (idx < 0) return;
    StudioState.openDocs.splice(idx, 1);
    if (StudioState.activeDocId === docId) {
      const next = StudioState.openDocs[Math.min(idx, StudioState.openDocs.length - 1)] || null;
      if (next) switchDXFDocTab(next.id);
      else { StudioState.activeDocId = null; renderDXFDocTabs(); }
    } else {
      renderDXFDocTabs();
    }
  }

  async function handleDroppedFiles(files, targetSlot = null) {
    if (!files || !files.length || typeof DXFEngine === 'undefined') return;
    const ds = getDXFState();
    if (!ds) return;
    try {
      // If the sample mechanical enclosure was auto-loaded earlier, clear it completely before loading the user's real AutoCAD file(s)!
      if (ds._isSampleDXF) {
        ds.parsedA = null; ds.rawA = null; ds.nameA = '';
        ds.parsedB = null; ds.rawB = null; ds.nameB = '';
        ds.lastEntityDiff = null;
        ds.hiddenLayers.clear();
        ds.frozenLayers.clear();
        ds.lockedLayers.clear();
        ds.comparedLayers.clear();
        ds._isSampleDXF = false;
      }

      if (files.length >= 2) {
        const entryA = await readDXFFileEntry(files[0]);
        const entryB = await readDXFFileEntry(files[1]);
        if (!entryA || !entryB) return;
        const parsedA = new DXFEngine.DXFParser(entryA.isBinary ? entryA.bytes : entryA.text).parse();
        const parsedB = new DXFEngine.DXFParser(entryB.isBinary ? entryB.bytes : entryB.text).parse();
        ensureStandardBlocksOnParser(parsedA);
        ensureStandardBlocksOnParser(parsedB);
        ds.rawA = entryA.isBinary ? entryA.bytes : entryA.text; ds.nameA = entryA.name; ds.parsedA = parsedA;
        ds.rawB = entryB.isBinary ? entryB.bytes : entryB.text; ds.nameB = entryB.name; ds.parsedB = parsedB;
        registerDXFDocTab(entryA.name, ds.rawA, parsedA);
        registerDXFDocTab(entryB.name, ds.rawB, parsedB);
        for (let fi = 2; fi < files.length; fi++) {
          const extra = await readDXFFileEntry(files[fi]);
          if (extra) {
            const pExtra = new DXFEngine.DXFParser(extra.isBinary ? extra.bytes : extra.text).parse();
            ensureStandardBlocksOnParser(pExtra);
            registerDXFDocTab(extra.name, extra.isBinary ? extra.bytes : extra.text, pExtra);
          }
        }
        ds._isActiveDXFSession = true;
      ds._isSampleDXF = false;
        ds.hiddenLayers.clear();
        ds.frozenLayers.clear();
        ds.lockedLayers.clear();
        ds.comparedLayers.clear();
        ds.syncLayerSetsFromParsers();
        ds.lastEntityDiff = DXFEngine.compareDXFEntities(parsedA, parsedB, {
          tol: ds.compareTol || 0.005,
          comparedLayers: ds.comparedLayers.size ? ds.comparedLayers : null,
          hiddenLayers: ds.hiddenLayers,
          frozenLayers: ds.frozenLayers,
          lockedLayers: ds.lockedLayers,
          ignoreLockedLayers: ds.ignoreLockedLayers,
          ignoreText: ds.ignoreText,
          ignoreDimensions: ds.ignoreDimensions,
          layerMapping: ds.layerMapping
        });
        StudioState.viewMode = 'overlay';
        if ($('#dxf-st-slot-sel')) $('#dxf-st-slot-sel').value = 'overlay';
        StudioState.selectedIds.clear();
        refreshAllUI();
        zoomExtents();
        logCommand(`Loaded ${entryA.name} (Rev A) & ${entryB.name} (Rev B) for Native Vector Compare.`);
        toast(`Loaded ${entryA.name} & ${entryB.name} into DXF Studio.`);
        return;
      }

      const entry = await readDXFFileEntry(files[0]);
      if (!entry) return;
      const parsed = new DXFEngine.DXFParser(entry.isBinary ? entry.bytes : entry.text).parse();
      ensureStandardBlocksOnParser(parsed);
      if (/^Blank_Drawing_/i.test(ds.nameA || '')) { ds.parsedA = null; ds.rawA = null; ds.nameA = ''; }
      if (/^Blank_Drawing_/i.test(ds.nameB || '')) { ds.parsedB = null; ds.rawB = null; ds.nameB = ''; }
      const slot = (targetSlot === 'A' || targetSlot === 'B') ? targetSlot : (StudioState.activeSlot === 'A' ? 'A' : 'B');
      StudioState.activeSlot = slot;
      StudioState.viewMode = 'single';
      if ($('#dxf-st-slot-sel')) $('#dxf-st-slot-sel').value = slot;

      const rawPayload = entry.isBinary ? entry.bytes : entry.text;
      if (slot === 'A') {
        ds.rawA = rawPayload; ds.nameA = entry.name; ds.parsedA = parsed;
      } else {
        ds.rawB = rawPayload; ds.nameB = entry.name; ds.parsedB = parsed;
        if (!targetSlot && !ds.parsedA) {
          const baseCopy = new DXFEngine.DXFParser(entry.text).parse();
          ensureStandardBlocksOnParser(baseCopy);
          ds.rawA = entry.text;
          ds.nameA = entry.name;
          ds.parsedA = baseCopy;
        }
      }
      registerDXFDocTab(entry.name, rawPayload, parsed);
      ds._isActiveDXFSession = true;
      ds._isSampleDXF = false;
      ds.hiddenLayers.clear();
      ds.frozenLayers.clear();
      ds.lockedLayers.clear();
      ds.comparedLayers.clear();
      ds.syncLayerSetsFromParsers();
      const lNames = Object.keys(parsed.layers || {});
      const firstVisLayer = lNames.find(n => parsed.layers[n] && parsed.layers[n].count > 0 && parsed.layers[n].visible !== false) || lNames[0] || '0';
      StudioState.currentLayer = firstVisLayer;
      StudioState.selectedIds.clear();
    const _b = (typeof window !== 'undefined' && window.RPMemoryBudget) ? window.RPMemoryBudget : ((typeof WorkerEngine !== 'undefined' && WorkerEngine.globalMemoryBudget) ? WorkerEngine.globalMemoryBudget : null);
    if (_b) {
      for (const s of StudioState.undoStack) { if (s && s._trackedBytes) _b.recordDealloc(s._trackedBytes); }
      for (const s of StudioState.redoStack) { if (s && s._trackedBytes) _b.recordDealloc(s._trackedBytes); }
    }
    StudioState.undoStack = [];
    StudioState.redoStack = [];
      syncParserMutation(false);
      refreshAllUI();
      zoomExtents();
      logCommand(`Opened AutoCAD DXF "${entry.name}" (${parsed.entities.length} entities, ${lNames.length} layers, units: ${parsed.unitName.toUpperCase()}).`);
      toast(`Loaded ${entry.name} (${parsed.entities.length} entities, ${lNames.length} layers).`);
    } catch (err) {
      const msg = `Could not open DXF file: ${err && err.message ? err.message : err}`;
      logCommand(msg);
      toast(msg);
    }
  }

  // ==========================================================================
  // INITIALIZE DXF STUDIO DOM & EVENT LISTENERS
  // ==========================================================================
  function init() {
    if (StudioState.initialized || typeof document === 'undefined') return;
    const host = $('#view-dxf');
    if (!host) return;
    StudioState.initialized = true;

    host.innerHTML = `
      <div class="rp-ribbon-container dxf-studio-header">
        <div class="rp-ribbon-tabs" id="dxf-studio-tabs">
          <button type="button" class="rp-tab-btn active" data-dxfrtab="home"><i data-ic="cadDxf"></i><span>Home &amp; Draw</span></button>
          <button type="button" class="rp-tab-btn" data-dxfrtab="modify"><i data-ic="move"></i><span>Modify &amp; Construct</span></button>
          <button type="button" class="rp-tab-btn" data-dxfrtab="annotate"><i data-ic="dim"></i><span>Annotate &amp; Dim</span></button>
          <button type="button" class="rp-tab-btn" data-dxfrtab="view3d"><i data-ic="cube3d"></i><span>2D / 3D Views &amp; Orbit</span></button>
          <button type="button" class="rp-tab-btn" data-dxfrtab="layers"><i data-ic="layers"></i><span>Layers &amp; Properties</span></button>
          <button type="button" class="rp-tab-btn" data-dxfrtab="compare"><i data-ic="tabCompare"></i><span>Native DXF Compare</span></button>
          <button type="button" class="rp-tab-btn" data-dxfrtab="all" hidden style="display:none"><i data-ic="allTools"></i><span>All CAD Tools</span></button>
          <span class="grow"></span>
          <div id="dxf-active-tool-pill" class="rp-tool-pill" hidden>
            <i data-ic="crosshair"></i>
            <span id="dxf-active-tool-name">Tool: Select</span>
            <button type="button" id="dxf-finish-tool-btn" class="rp-tool-act-btn act-done" title="Done">Done</button>
            <button type="button" id="dxf-rewind-tool-btn" class="rp-tool-act-btn act-rewind" title="Rewind">Rewind</button>
            <button type="button" id="dxf-cancel-tool-btn" class="rp-tool-act-btn act-cancel" title="Cancel">Cancel</button>
            <button type="button" id="dxf-off-tool-btn" class="rp-tool-act-btn act-off" title="Turn Off Tool">Off</button>
          </div>
          <div class="rp-edit-quickbar" style="gap:6px">
            <button type="button" class="rp-btn-sm on" id="dxf-toggle-left-dock" title="Toggle AutoCAD Layers Dock" style="height:24px;padding:0 8px;font-size:11px"><i data-ic="layers"></i><span>Layers</span></button>
            <button type="button" class="rp-btn-sm on" id="dxf-toggle-right-dock" title="Toggle Properties &amp; Vector Diffs Dock" style="height:24px;padding:0 8px;font-size:11px"><i data-ic="gear"></i><span>Inspector</span></button>
          </div>
        </div>

        <div class="ribbon dxf-studio-ribbon" id="dxf-studio-ribbon">
          <!-- TAB 1: HOME & DRAW (File, Cursor & Zoom, AutoCAD Draw, Annotate & Hatch packed together) -->
          <div class="grp" data-dxfgrp="home"><div class="row">
            <button type="button" class="tb" id="dxf-st-blank" title="Create New Blank AutoCAD DXF Sheet"><i data-ic="blank"></i><span>New</span></button>
            <button type="button" class="tb" id="dxf-st-open" title="Open AutoCAD .dxf File(s)"><i data-ic="dxfIn"></i><span>Open</span></button>
            <button type="button" class="tb" id="dxf-st-save" title="Save Modified Drawing as Native AutoCAD .dxf (Ctrl+S)"><i data-ic="save"></i><span>Save</span></button>
            <button type="button" class="tb" id="dxf-st-undo" title="Undo Last CAD Action (Ctrl+Z)" disabled><i data-ic="undo"></i><span>Undo</span></button>
            <button type="button" class="tb" id="dxf-st-redo" title="Redo CAD Action (Ctrl+Y)" disabled><i data-ic="redo"></i><span>Redo</span></button>
          </div><div class="cap">File</div></div>

          <div class="grp" data-dxfgrp="home"><div class="row">
            <button type="button" class="tb on" data-dxf-tool="select" title="Select Entities / Window / Crossing / Vertex Grips (V / Esc)"><i data-ic="select"></i><span>Select</span></button>
            <button type="button" class="tb" data-dxf-tool="pan" title="Pan Modelspace (H)"><i data-ic="hand"></i><span>Pan</span></button>
            <button type="button" class="tb sm1" id="dxf-st-zi" title="Zoom In"><i data-ic="zoomin"></i><span>Zoom In</span></button>
            <button type="button" class="tb sm1" id="dxf-st-zo" title="Zoom Out"><i data-ic="zoomout"></i><span>Zoom Out</span></button>
            <button type="button" class="tb" id="dxf-st-ze" title="Zoom Extents (Fit Drawing)"><i data-ic="fit"></i><span>Extents</span></button>
          </div><div class="cap">Cursor &amp; Zoom</div></div>

          <div class="grp" data-dxfgrp="home"><div class="row">
            <button type="button" class="tb" data-dxf-tool="line" title="Draw Line Segment (L)"><i data-ic="line"></i><span>Line</span></button>
            <button type="button" class="tb" data-dxf-tool="polyline" title="Draw Multi-Vertex Polyline (PL)"><i data-ic="polyline"></i><span>Pline</span></button>
            <button type="button" class="tb" data-dxf-tool="rect" title="Draw Closed Rectangle (REC)"><i data-ic="box"></i><span>Rect</span></button>
            <button type="button" class="tb" data-dxf-tool="triangle" title="Draw Triangle with Easy Width &amp; Height Settings (TRI)"><i data-ic="triangle"></i><span>Triangle</span></button>
            <button type="button" class="tb" data-dxf-tool="polygon" title="Draw Regular N-Sided Polygon (POL)"><i data-ic="polygon"></i><span>Poly</span></button>
            <button type="button" class="tb" data-dxf-tool="circle" title="Draw Center-Radius Circle (C)"><i data-ic="circle"></i><span>Circle</span></button>
            <button type="button" class="tb" data-dxf-tool="arc" title="Draw 3-Point Arc (A)"><i data-ic="arc"></i><span>Arc</span></button>
            <button type="button" class="tb" data-dxf-tool="ellipse" title="Draw Ellipse (EL)"><i data-ic="ellipse"></i><span>Ellipse</span></button>
            <button type="button" class="tb" data-dxf-tool="spline" title="Draw Smooth Spline Curve (SPL)"><i data-ic="spline"></i><span>Spline</span></button>
            <button type="button" class="tb" data-dxf-tool="donut" title="Draw Concentric Ring / Donut Pad (DO)"><i data-ic="donut"></i><span>Donut</span></button>
            <button type="button" class="tb" data-dxf-tool="revcloud" title="Draw Scalloped Revision Cloud (REVCLOUD)"><i data-ic="cloud"></i><span>Cloud</span></button>
            <button type="button" class="tb" data-dxf-tool="xline" title="Draw Construction XLine (XL)"><i data-ic="xline"></i><span>XLine</span></button>
            <button type="button" class="tb" data-dxf-tool="box3d" title="Draw 3D Extruded Box Solid (BOX)"><i data-ic="cube3d"></i><span>3D Box</span></button>
          </div><div class="cap">AutoCAD 2D / 3D Draw</div></div>

          <div class="grp" data-dxfgrp="home"><div class="row" style="gap:5px;flex-wrap:nowrap;align-items:center">
            <label class="f" style="font-size:11px;gap:3px" title="Stroke Thickness / Lineweight for Line, Rect, Triangle &amp; All Shapes">Thick
              <select id="dxf-st-lw-sel" style="height:22px;font-size:11px;font-weight:600">
                <option value="-1" selected>ByLayer</option>
                ${LINEWEIGHTS.filter(w => w.v > 0).map(lw => `<option value="${lw.v}">${lw.l}</option>`).join('')}
              </select>
            </label>
            <label class="f" style="font-size:11px;gap:2px" title="3D Extrusion Z-Thickness for New &amp; Selected Shapes">Z-Thk <input type="number" id="dxf-st-thk-val" value="0" step="1" style="width:40px;height:22px"></label>
            <span style="width:1px;height:18px;background:var(--line);margin:0 2px"></span>
            <label class="f" style="font-size:11px;gap:2px" title="Triangle Width">Tri W <input type="number" id="dxf-st-tri-w" value="60" min="0.1" step="5" style="width:46px;height:22px"></label>
            <label class="f" style="font-size:11px;gap:2px" title="Triangle Height">Tri H <input type="number" id="dxf-st-tri-h" value="50" min="0.1" step="5" style="width:46px;height:22px"></label>
            <select id="dxf-st-tri-type" style="height:22px;font-size:11px" title="Triangle Geometry Type">
              <option value="isosceles" selected>Isosceles</option>
              <option value="right-left">Right (L)</option>
              <option value="right-right">Right (R)</option>
              <option value="equilateral">Equilat</option>
            </select>
            <label class="f" style="font-size:11px;gap:2px;cursor:pointer" title="1-Click places exact Tri W × Tri H immediately"><input type="checkbox" id="dxf-st-tri-fixed">1-Click</label>
            <button type="button" class="rp-btn-sm" id="dxf-st-tri-place" title="Insert Triangle with Current W × H at View Center" style="height:22px;padding:0 7px;font-size:11px">+ Tri</button>
          </div><div class="cap">Shape Thickness &amp; Triangle W×H</div></div>

          <div class="grp" data-dxfgrp="annotate" hidden><div class="row">
            <button type="button" class="tb" data-dxf-tool="text" title="Insert CAD Text / MText (T)"><i data-ic="text"></i><span>Text</span></button>
            <button type="button" class="tb" data-dxf-tool="dim" title="Place Linear Dimension (DLI)"><i data-ic="dim"></i><span>Linear Dim</span></button>
            <button type="button" class="tb" data-dxf-tool="dimang" title="Place 3-Point Angular Dimension (DAN)"><i data-ic="dimAng"></i><span>Angle°</span></button>
            <button type="button" class="tb" data-dxf-tool="dimrad" title="Place Radial Dimension on Circle/Arc (DRA)"><i data-ic="dimRad"></i><span>Radius</span></button>
            <button type="button" class="tb" data-dxf-tool="dimdia" title="Place Diameter Dimension on Circle/Arc (DDI)"><i data-ic="dimDia"></i><span>Diameter</span></button>
            <button type="button" class="tb" data-dxf-tool="leader" title="Place Arrow Callout Leader (LE)"><i data-ic="callout"></i><span>Leader</span></button>
            <button type="button" class="tb" data-dxf-tool="hatch" title="Draw Solid / Hatch Fill Boundary (H)"><i data-ic="hatch"></i><span>Hatch</span></button>
            <button type="button" class="tb" data-dxf-tool="point" title="Place CAD Point (PO)"><i data-ic="point"></i><span>Point</span></button>
            <button type="button" class="tb" data-dxf-tool="insert" title="Insert Block Reference (I)"><i data-ic="blockLib"></i><span>Block</span></button>
            <button type="button" class="tb" data-dxf-tool="measure" title="High-Precision Distance &amp; Angle Inquiry (DIST / DI)"><i data-ic="dist"></i><span>Dist</span></button>
          </div><div class="cap">Dimension, Annotate &amp; Inquiry</div></div>

          <!-- TAB 2: MODIFY & CONSTRUCT (Transform, Modify, and Parameters packed together) -->
          <div class="grp" data-dxfgrp="modify" hidden><div class="row">
            <button type="button" class="tb" data-dxf-tool="move" title="Move Selected Entities (M)"><i data-ic="move"></i><span>Move</span></button>
            <button type="button" class="tb" data-dxf-tool="copy" title="Copy Selected Entities (CO)"><i data-ic="copy"></i><span>Copy</span></button>
            <button type="button" class="tb" data-dxf-tool="rotate" title="Rotate Selected Entities (RO)"><i data-ic="rotR"></i><span>Rotate</span></button>
            <button type="button" class="tb" data-dxf-tool="scale" title="Scale Selected Entities (SC)"><i data-ic="scale"></i><span>Scale</span></button>
            <button type="button" class="tb" data-dxf-tool="mirror" title="Mirror Selected Entities Across Axis (MI)"><i data-ic="mirror"></i><span>Mirror</span></button>
          </div><div class="cap">Transform</div></div>

          <div class="grp" data-dxfgrp="modify" hidden><div class="row">
            <button type="button" class="tb" data-dxf-tool="offset" title="Offset Line, Polyline, Circle or Arc (O)"><i data-ic="offset"></i><span>Offset</span></button>
            <button type="button" class="tb" data-dxf-tool="trim" title="Trim Line or Polyline at Cutting Edges (TR)"><i data-ic="trim"></i><span>Trim</span></button>
            <button type="button" class="tb" data-dxf-tool="extend" title="Extend Line to Boundary (EX)"><i data-ic="extend"></i><span>Extend</span></button>
            <button type="button" class="tb" data-dxf-tool="fillet" title="Tangent-Arc Fillet Two Lines (F)"><i data-ic="fillet"></i><span>Fillet</span></button>
            <button type="button" class="tb" data-dxf-tool="chamfer" title="Bevel Chamfer Corner Between Two Lines (CHA)"><i data-ic="chamfer"></i><span>Chamf</span></button>
            <button type="button" class="tb" data-dxf-tool="break" title="Break / Split Line at Point (BR)"><i data-ic="breakLine"></i><span>Break</span></button>
            <button type="button" class="tb" id="dxf-st-join" title="Join Contiguous Lines &amp; Polylines (J)"><i data-ic="join"></i><span>Join</span></button>
            <button type="button" class="tb" id="dxf-st-array-rect" title="Create Rectangular Array of Selected Entities (AR)"><i data-ic="arrayRect"></i><span>Rect Array</span></button>
            <button type="button" class="tb" data-dxf-tool="arraypolar" title="Create Polar Circular Array Around Center Point (AP)"><i data-ic="arrayPolar"></i><span>Polar Array</span></button>
            <button type="button" class="tb" id="dxf-st-overkill" title="Remove Duplicate Overlapping Entities (OVERKILL)"><i data-ic="overkill"></i><span>Overkill</span></button>
            <button type="button" class="tb" id="dxf-st-explode" title="Explode Polyline or Block into Primitives (X)"><i data-ic="explode"></i><span>Explode</span></button>
            <button type="button" class="tb" id="dxf-st-lengthen" title="Lengthen Selected Lines or Arcs by Delta (LEN)"><i data-ic="extend"></i><span>Lengthen</span></button>
            <button type="button" class="tb" id="dxf-st-origin" title="Move Selection or Drawing Extents to CAD Origin (0,0) (ORIGIN)"><i data-ic="fit"></i><span>To (0,0)</span></button>
            <button type="button" class="tb" id="dxf-st-area" title="Calculate Total Path Length, Enclosed Area &amp; Span (AREA)"><i data-ic="measure"></i><span>Area</span></button>
            <button type="button" class="tb" data-dxf-tool="matchprop" title="Match Properties Across Entities (MA)"><i data-ic="matchProp"></i><span>Match</span></button>
            <button type="button" class="tb" id="dxf-st-erase" title="Erase / Delete Selected Entities (Del / E)"><i data-ic="trash"></i><span>Erase</span></button>
          </div><div class="cap">AutoCAD Modify &amp; Construct</div></div>

          <div class="grp" data-dxfgrp="annotate" hidden><div class="row" style="gap:5px;flex-wrap:nowrap;align-items:center">
            <label class="f" style="font-size:11px;gap:3px" title="Offset Distance">Offset <input type="number" id="dxf-st-offset-val" value="5.0" min="0.1" step="0.5" style="width:42px;height:22px"></label>
            <label class="f" style="font-size:11px;gap:3px" title="Fillet Arc Radius">Fillet R <input type="number" id="dxf-st-fillet-val" value="2.0" min="0" step="0.5" style="width:42px;height:22px"></label>
            <label class="f" style="font-size:11px;gap:3px" title="Chamfer Distance D1/D2">Chamfer <input type="number" id="dxf-st-chamfer-val" value="5.0" min="0.1" step="0.5" style="width:42px;height:22px"></label>
            <label class="f" style="font-size:11px;gap:3px" title="Polygon Sides (3..36)">Sides <input type="number" id="dxf-st-poly-sides" value="6" min="3" max="36" step="1" style="width:38px;height:22px"></label>
            <label class="f" style="font-size:11px;gap:2px" title="Array Rows × Cols">Array <input type="number" id="dxf-st-arr-r" value="3" min="1" max="30" style="width:32px;height:22px">×<input type="number" id="dxf-st-arr-c" value="3" min="1" max="30" style="width:32px;height:22px"></label>
            <label class="f" style="font-size:11px;gap:3px" title="Default Text Height">Text H <input type="number" id="dxf-st-texth-val" value="3.5" min="0.5" step="0.5" style="width:40px;height:22px"></label>
          </div><div class="cap">Precision Parameters</div></div>

          <!-- TAB 2.5: 2D / 3D VIEWS, ANGLE PROJECTION & FREE ORBIT -->
          <div class="grp" data-dxfgrp="view3d" hidden><div class="row">
            <button type="button" class="tb on" data-dxf-vpreset="top" title="Top 2D Plan View (XY Plane)"><i data-ic="fit"></i><span>Top</span></button>
            <button type="button" class="tb" data-dxf-vpreset="front" title="Front 3D Elevation View (XZ Plane)"><i data-ic="cube3d"></i><span>Front</span></button>
            <button type="button" class="tb" data-dxf-vpreset="right" title="Right Side 3D View (YZ Plane)"><i data-ic="cube3d"></i><span>Right</span></button>
            <button type="button" class="tb" data-dxf-vpreset="left" title="Left Side 3D View (-YZ Plane)"><i data-ic="cube3d"></i><span>Left</span></button>
            <button type="button" class="tb" data-dxf-vpreset="back" title="Back 3D Elevation View (-XZ Plane)"><i data-ic="cube3d"></i><span>Back</span></button>
            <button type="button" class="tb" data-dxf-vpreset="bottom" title="Bottom View (-XY Plane)"><i data-ic="cube3d"></i><span>Bottom</span></button>
          </div><div class="cap">Orthographic 2D / 3D Views</div></div>

          <div class="grp" data-dxfgrp="view3d" hidden><div class="row">
            <button type="button" class="tb" data-dxf-vpreset="sw_iso" title="South-West 3D Isometric View"><i data-ic="cube3d"></i><span>SW Iso</span></button>
            <button type="button" class="tb" data-dxf-vpreset="se_iso" title="South-East 3D Isometric View"><i data-ic="cube3d"></i><span>SE Iso</span></button>
            <button type="button" class="tb" data-dxf-vpreset="ne_iso" title="North-East 3D Isometric View"><i data-ic="cube3d"></i><span>NE Iso</span></button>
            <button type="button" class="tb" data-dxf-vpreset="nw_iso" title="North-West 3D Isometric View"><i data-ic="cube3d"></i><span>NW Iso</span></button>
            <button type="button" class="tb" data-dxf-vpreset="dimetric" title="Dimetric 3D Engineering Projection"><i data-ic="cube3d"></i><span>Dimetric</span></button>
            <button type="button" class="tb" data-dxf-vpreset="trimetric" title="Trimetric 3D Engineering Projection"><i data-ic="cube3d"></i><span>Trimetric</span></button>
            <button type="button" class="tb" data-dxf-tool="orbit" title="Interactive 3D Free Orbit Tool (3DORBIT / Drag on Canvas)"><i data-ic="orbit3d"></i><span>Orbit</span></button>
          </div><div class="cap">Isometric, Axonometric &amp; Orbit</div></div>

          <div class="grp" data-dxfgrp="view3d" hidden><div class="row" style="gap:6px;flex-wrap:nowrap;align-items:center">
            <label class="f" style="font-size:11px;gap:4px">Style
              <select id="dxf-st-style-sel" style="height:22px;font-size:11px;font-weight:600">
                <option value="2d">2D Wireframe</option>
                <option value="3d_wire">3D Wireframe</option>
                <option value="3d_shaded">3D Shaded Extrusion</option>
                <option value="3d_hidden">3D Hidden-Line</option>
              </select>
            </label>
            <label class="f" style="font-size:11px;gap:3px" title="Default 3D Extrusion Depth for 2D Profiles">Depth
              <input type="number" id="dxf-st-3d-depth" value="12" min="0" max="200" step="2" style="width:42px;height:22px">
            </label>
            <label class="f" style="font-size:11px;gap:3px">Yaw° <input type="number" id="dxf-st-yaw" value="0" min="-180" max="180" step="5" style="width:44px;height:22px"></label>
            <label class="f" style="font-size:11px;gap:3px">Pitch° <input type="number" id="dxf-st-pitch" value="0" min="-90" max="90" step="5" style="width:44px;height:22px"></label>
            <label class="f" style="font-size:11px;gap:3px">Roll° <input type="number" id="dxf-st-roll" value="0" min="-180" max="180" step="5" style="width:44px;height:22px"></label>
          </div><div class="cap">3D Visual Style &amp; Angles</div></div>

          <!-- TAB 3: LAYERS & PROPERTIES (Active Layer, Style, Layer Actions, Export packed together) -->
          <div class="grp" data-dxfgrp="layers" hidden><div class="row" style="gap:6px;flex-wrap:nowrap;align-items:center">
            <label class="f" style="font-size:11px;gap:3px" title="Current AutoCAD Drawing Layer (CLAYER)">Layer <select id="dxf-clayer-sel" style="height:22px;font-size:11px;font-weight:600;min-width:105px"></select></label>
            <label class="f" style="font-size:11px;gap:3px" title="Modelspace Background">Canvas
              <select id="dxf-st-bg-sel" style="height:22px;font-size:11px">
                <option value="#0c1017" selected>Dark Modelspace</option>
                <option value="#ffffff">White Paper</option>
                <option value="#08182b">Blueprint Navy</option>
              </select>
            </label>
            <label class="f" style="font-size:11px;gap:3px" title="Active Entity Color">Color
              <select id="dxf-st-col-mode" style="height:22px;font-size:11px"><option value="BYLAYER" selected>ByLayer</option><option value="1">1 Red</option><option value="2">2 Yellow</option><option value="3">3 Green</option><option value="4">4 Cyan</option><option value="5">5 Blue</option><option value="6">6 Magenta</option><option value="7">7 White/Black</option><option value="8">8 Gray</option><option value="30">30 Orange</option><option value="CUSTOM">Custom</option></select>
              <input type="color" id="dxf-st-col-pick" value="#38bdf8" style="width:20px;height:20px;padding:0;border:none;background:transparent">
            </label>
            <label class="f" style="font-size:11px;gap:3px" title="Active Linetype">LType
              <select id="dxf-st-lt-sel" style="height:22px;font-size:11px"><option value="BYLAYER" selected>ByLayer</option>${LINETYPES.map(lt => `<option value="${lt}">${lt}</option>`).join('')}</select>
            </label>
            <label class="f" style="font-size:11px;gap:3px" title="Active Thickness / Lineweight for All Shapes">Thick
              <select id="dxf-st-lw-sel-lyr" style="height:22px;font-size:11px"><option value="-1" selected>ByLayer</option>${LINEWEIGHTS.filter(w => w.v > 0).map(lw => `<option value="${lw.v}">${lw.l}</option>`).join('')}</select>
            </label>
            <label class="f" style="font-size:11px;gap:3px" title="Drawing Units ($INSUNITS)">Units
              <select id="dxf-st-units-sel" style="height:22px;font-size:11px"><option value="mm">mm</option><option value="mils">mils</option><option value="in">in</option></select>
            </label>
          </div><div class="cap">Active Layer &amp; Style</div></div>

          <div class="grp" data-dxfgrp="layers" hidden><div class="row">
            <button type="button" class="tb" id="dxf-st-add-lyr" title="Create New AutoCAD Layer"><i data-ic="plus"></i><span>New Layer</span></button>
            <button type="button" class="tb" id="dxf-lay-iso" title="Isolate Selected Entity Layer (LAYISO)"><i data-ic="layers"></i><span>Isolate</span></button>
            <button type="button" class="tb" id="dxf-lay-uniso" title="Restore All Isolated Layers (LAYUNISO)"><i data-ic="eye"></i><span>Unisolate</span></button>
            <button type="button" class="tb" id="dxf-st-qselect" title="Quick Select Entities by Type or Layer (QSELECT)"><i data-ic="selectall"></i><span>QSelect</span></button>
            <button type="button" class="tb" id="dxf-st-find-text" title="Find &amp; Replace Text in DXF Drawing (FIND)"><i data-ic="search"></i><span>Find Text</span></button>
            <button type="button" class="tb" id="dxf-st-bom-csv" title="Export Block Count &amp; Layer Cut-Length BOM to CSV (BCOUNT / BOM)"><i data-ic="csv"></i><span>BOM CSV</span></button>
            <button type="button" class="tb" id="dxf-st-boltcircle" title="Generate Precision Bolt-Hole Circle Pattern (BOLTCIRCLE / PCD)"><i data-ic="circle"></i><span>Bolt Circle</span></button>
            <button type="button" class="tb" id="dxf-st-titleblock" title="Insert ISO/ANSI Mechanical Drawing Border &amp; Title Block (TITLEBLOCK)"><i data-ic="titleBlock"></i><span>Title Block</span></button>
            <button type="button" class="tb" id="dxf-st-unlock-all" title="Unlock All Layers"><i data-ic="unlock"></i><span>Unlock All</span></button>
            <button type="button" class="tb" id="dxf-st-thaw-all" title="Thaw &amp; Turn On All Layers"><i data-ic="eye"></i><span>All On/Thaw</span></button>
            <button type="button" class="tb" id="dxf-st-purge" title="Purge Unused Empty Layers"><i data-ic="trash"></i><span>Purge Unused</span></button>
            <button type="button" class="tb" id="dxf-st-wb-btn" title="Open Full DXF Layer &amp; Export Workbench"><i data-ic="gear"></i><span>Workbench</span></button>
          </div><div class="cap">Layer Management</div></div>

          <div class="grp" data-dxfgrp="compare" hidden><div class="row">
            <button type="button" class="tb" id="dxf-st-svg" title="Export CAD Modelspace as Vector SVG (.svg)"><i data-ic="dxfOut"></i><span>Export SVG</span></button>
            <button type="button" class="tb" id="dxf-st-png" title="Export Modelspace Snapshot as PNG (.png)"><i data-ic="png"></i><span>Export PNG</span></button>
            <button type="button" class="tb" id="dxf-st-to-pdf" title="Convert DXF to Vector PDF &amp; Open in PDF Studio"><i data-ic="pdfStudio"></i><span>To PDF Studio</span></button>
          </div><div class="cap">Deliverables</div></div>

          <!-- TAB 4: NATIVE DXF COMPARE (All DXF Compare options packed together in one tab!) -->
          <div class="grp" data-dxfgrp="compare" hidden><div class="row">
            <button type="button" class="tb" id="dxf-st-open-b" title="Open Revised AutoCAD .dxf into Slot B (Rev B)"><i data-ic="openB"></i><span>Open Rev B</span></button>
            <button type="button" class="tb" id="dxf-st-precompare" title="Choose Which DXF Layers to Compare, Lock or Remove Before Comparing"><i data-ic="tabCompare"></i><span>Compare Layers</span></button>
            <button type="button" class="tb" id="dxf-st-send-cmp" title="Send Modified DXF to Compare View"><i data-ic="sendA"></i><span>To Compare</span></button>
          </div><div class="cap">DXF Revisions (A / B)</div></div>

          <div class="grp" data-dxfgrp="compare" hidden><div class="row" style="gap:8px;flex-wrap:nowrap;align-items:center">
            <label class="f" style="font-size:11px;gap:4px" title="Active Revision Slot or Native Vector Compare Mode">
              <span>Mode:</span>
              <select id="dxf-st-slot-sel" style="height:22px;font-size:11px;font-weight:700">
                <option value="B" selected>Edit Revised (Rev B)</option>
                <option value="A">Edit Base (Rev A)</option>
                <option value="overlay">Vector Diff Overlay (A↔B)</option>
                <option value="side">Side-by-Side CAD (A | B)</option>
              </select>
            </label>
            <label class="f" style="font-size:11px;gap:3px">Rev A <input type="color" id="dxf-st-col-a" value="#e11414" style="width:20px;height:18px;padding:0;border:none;background:transparent;cursor:pointer" title="Rev A (Removed) Color"></label>
            <label class="f" style="font-size:11px;gap:3px">Rev B <input type="color" id="dxf-st-col-b" value="#00a53c" style="width:20px;height:18px;padding:0;border:none;background:transparent;cursor:pointer" title="Rev B (Added) Color"></label>
            <label class="f" style="font-size:11px;gap:3px">Common <input type="color" id="dxf-st-col-c" value="#94a3b8" style="width:20px;height:18px;padding:0;border:none;background:transparent;cursor:pointer" title="Common (Unchanged) Color"></label>
          </div><div class="cap">Compare View &amp; Colors</div></div>
        </div>

        <div id="dxf-doc-tabs" class="dxf-doc-tabs" hidden></div>

        <!-- KENSHO PRO DXF QUICK CONVENIENCE BAR (1-Click Tools, 2D/3D View Presets & Side-Panel Window Layouts) -->
        <div class="kdock-quick-bar dxf-quick-bar" id="dxf-quick-bar" hidden style="display:none !important">
          <div class="kq-group">
            <span class="kq-label">DRAW</span>
            <button type="button" class="kq-btn on" data-dxf-tool="select" title="Select / Vertex Grips (V)"><i data-ic="select"></i><span>Select</span></button>
            <button type="button" class="kq-btn" data-dxf-tool="line" title="Draw Line (L)"><i data-ic="line"></i><span>Line</span></button>
            <button type="button" class="kq-btn" data-dxf-tool="polyline" title="Draw Polyline (PL)"><i data-ic="polyline"></i><span>Pline</span></button>
            <button type="button" class="kq-btn" data-dxf-tool="rect" title="Draw Rectangle (REC)"><i data-ic="box"></i><span>Rect</span></button>
            <button type="button" class="kq-btn" data-dxf-tool="triangle" title="Draw Triangle (TRI)"><i data-ic="triangle"></i><span>Triangle</span></button>
            <button type="button" class="kq-btn" data-dxf-tool="polygon" title="Draw Regular Polygon (POL)"><i data-ic="polygon"></i><span>Poly</span></button>
            <button type="button" class="kq-btn" data-dxf-tool="circle" title="Draw Circle (C)"><i data-ic="circle"></i><span>Circle</span></button>
            <button type="button" class="kq-btn" data-dxf-tool="arc" title="Draw 3-Point Arc (A)"><i data-ic="arc"></i><span>Arc</span></button>
            <button type="button" class="kq-btn" data-dxf-tool="donut" title="Draw Donut Ring (DO)"><i data-ic="donut"></i><span>Donut</span></button>
            <button type="button" class="kq-btn" data-dxf-tool="box3d" title="Draw 3D Box Solid (BOX)"><i data-ic="cube3d"></i><span>3D Box</span></button>
            <button type="button" class="kq-btn" data-dxf-tool="dim" title="Linear Dimension (DLI)"><i data-ic="dim"></i><span>Dim</span></button>
            <button type="button" class="kq-btn" data-dxf-tool="measure" title="Precision Distance &amp; Angle Inquiry (DIST)"><i data-ic="dist"></i><span>Dist</span></button>
          </div>
          <div class="kq-sep"></div>
          <div class="kq-group">
            <span class="kq-label">MODIFY</span>
            <button type="button" class="kq-btn" data-dxf-tool="trim" title="Trim Entity (TR)"><i data-ic="trim"></i><span>Trim</span></button>
            <button type="button" class="kq-btn" data-dxf-tool="offset" title="Offset Entity (O)"><i data-ic="offset"></i><span>Offset</span></button>
            <button type="button" class="kq-btn" data-dxf-tool="fillet" title="Fillet Corner (F)"><i data-ic="fillet"></i><span>Fillet</span></button>
            <button type="button" class="kq-btn" data-dxf-tool="chamfer" title="Chamfer Bevel Corner (CHA)"><i data-ic="chamfer"></i><span>Chamf</span></button>
            <button type="button" class="kq-btn" id="dxf-qb-arr-rect" title="Rectangular Array (AR)"><i data-ic="arrayRect"></i><span>Array</span></button>
          </div>
          <div class="kq-sep"></div>
          <div class="kq-group">
            <span class="kq-label">VIEW</span>
            <select id="dxf-qb-view-sel" class="kdock-theme-select" style="height:22px;font-size:10px;width:106px;min-width:106px" title="Switch AutoCAD 2D Orthographic or 3D Isometric / Axonometric View Angle">
              <option value="top" selected>Top (2D Plan XY)</option>
              <option value="sw_iso">SW Isometric (3D)</option>
              <option value="se_iso">SE Isometric (3D)</option>
              <option value="ne_iso">NE Isometric (3D)</option>
              <option value="nw_iso">NW Isometric (3D)</option>
              <option value="front">Front (XZ Elevation)</option>
              <option value="back">Back (-XZ Elevation)</option>
              <option value="right">Right (YZ Side)</option>
              <option value="left">Left (-YZ Side)</option>
              <option value="bottom">Bottom (-XY)</option>
              <option value="dimetric">Dimetric (3D)</option>
              <option value="trimetric">Trimetric (3D)</option>
            </select>
            <select id="dxf-qb-style-sel" class="kdock-theme-select" style="height:22px;font-size:10px;width:92px;min-width:92px" title="Switch 2D / 3D Visual Style">
              <option value="2d" selected>2D Wireframe</option>
              <option value="3d_wire">3D Wireframe</option>
              <option value="3d_shaded">3D Shaded Solid</option>
              <option value="3d_hidden">3D Hidden-Line</option>
            </select>
            <button type="button" class="kq-btn" data-dxf-tool="orbit" title="Interactive 3D Free Orbit (3DORBIT / Alt+Drag)"><i data-ic="orbit3d"></i><span>Orbit</span></button>
          </div>
          <div class="kq-sep"></div>
          <div class="kq-group kq-dock-presets">
            <span class="kq-label">PANELS</span>
            <button type="button" class="kq-btn on" data-dxf-layout="lr" title="Left Layers + Right Inspector">◫ L+R</button>
            <button type="button" class="kq-btn" data-dxf-layout="rud" title="Stack Both Panels on Right (Up/Down)">◰ R-Split</button>
            <button type="button" class="kq-btn" data-dxf-layout="lud" title="Stack Both Panels on Left (Up/Down)">◱ L-Split</button>
            <button type="button" class="kq-btn" data-dxf-layout="btm" title="Dock Panels to Bottom Shelf">⬓ Bottom</button>
            <button type="button" class="kq-btn" data-dxf-layout="float" title="Detach Panels as Draggable Floating Windows">❐ Float</button>
            <button type="button" class="kq-btn" data-dxf-layout="canvas" title="Maximize Full-Screen CAD Modelspace">▭ Max</button>
          </div>
        </div>
      </div>

      <!-- MAIN 3-COLUMN AUTOCAD WORKSPACE -->
      <div class="dxf-studio-body" id="dxf-studio-body" data-dxf-layout="lr">
        <!-- LEFT DOCK: AUTOCAD LAYER PROPERTIES MANAGER -->
        <aside class="dxf-layer-dock" id="dxf-layer-dock">
          <div class="dxf-dock-header kdock-pane-header">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="kdock-grip">⋮⋮</span>
              <i data-ic="layers"></i>
              <b>Layers</b>
              <span id="dxf-layer-count-pill" class="rp-count-pill">0</span>
            </div>
            <div style="display:flex;gap:3px;align-items:center">
              <button type="button" class="kdock-act" data-dxf-pane="layers" data-dxf-pos="float" title="Detach Layers as Floating Window" style="display:none">❐</button>
              <button type="button" class="kdock-act" data-dxf-pane="layers" data-dxf-pos="hide" title="Minimize Layers Dock">—</button>
            </div>
          </div>
          <div style="padding:6px 8px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:5px">
            <div style="display:flex;gap:4px;align-items:center">
              <input type="text" id="dxf-layer-search" placeholder="Filter layers..." style="flex:1;min-width:0;height:24px;font-size:11px" />
              <button type="button" class="rp-btn-sm" id="dxf-dock-new-btn" title="Add New Layer" style="height:24px;padding:0 7px;font-weight:700">+Layer</button>
              <button type="button" class="rp-btn-sm" id="dxf-dock-pre-btn" title="Pre-Compare Layer Selection" style="height:24px;padding:0 7px">Compare</button>
            </div>
            <div style="display:flex;gap:3px;flex-wrap:wrap">
              <button type="button" class="rp-btn-sm" id="dxf-dock-all-on" style="flex:1;font-size:10px">All On</button>
              <button type="button" class="rp-btn-sm" id="dxf-dock-all-off" style="flex:1;font-size:10px">All Off</button>
              <button type="button" class="rp-btn-sm" id="dxf-dock-unlock" style="flex:1;font-size:10px">Unlock All</button>
              <button type="button" class="rp-btn-sm" id="dxf-dock-purge" style="flex:1;font-size:10px" title="Remove empty unused layers">Purge</button>
            </div>
          </div>
          <div id="dxf-layer-list-body" class="dxf-layer-list-body"></div>
        </aside>

        <!-- CENTER: INTERACTIVE MODELSPACE CANVAS + FLOATING HUD + COMMAND LINE -->
        <div class="dxf-center-stage">
          <div class="dxf-canvas-wrap" id="dxf-canvas-wrap">
            <canvas id="dxf-canvas"></canvas>
            <div id="dxf-empty">
              <div class="rp-empty-hero rp-studio-launchpad rp-ws-start">
                <div class="rp-ws-head">
                  <div class="rp-ws-brand">
                    <div class="rp-ws-title-wrap">
                      <div class="rp-launchpad-badge"><i data-ic="cadDxf"></i><span id="dxf-lp-badge">AUTOCAD DXF STUDIO &amp; VECTOR COMPARE</span></div>
                      <div class="rp-launchpad-title" id="dxf-lp-title">Open or Create an AutoCAD DXF Drawing</div>
                    </div>
                  </div>
                  <span class="rp-ws-formats">ASCII R12–R2018 · Layers · OSNAP · A/B Diff</span>
                </div>
                <div class="rp-ws-slots rp-sample-actions">
                  <div class="rp-ws-slot slot-a">
                    <div class="rp-ws-slot-meta"><span class="rp-slot-tag tag-a">REV A</span><b id="dxf-lp-base-title">Base CAD Drawing (Slot A)</b><small id="dxf-lp-base-sub">Original AutoCAD .dxf reference drawing</small></div>
                    <button type="button" id="dxf-empty-open-a" class="rp-sample-btn rp-btn-hero-primary" title="Open Base AutoCAD DXF (Slot A)"><i data-ic="openA"></i><span id="dxf-lp-btn-a">Open Base DXF (A)</span></button>
                  </div>
                  <div class="rp-ws-slot slot-b">
                    <div class="rp-ws-slot-meta"><span class="rp-slot-tag tag-b">REV B</span><b id="dxf-lp-rev-title">Revised CAD Drawing (Slot B)</b><small id="dxf-lp-rev-sub">Modified AutoCAD .dxf target drawing</small></div>
                    <button type="button" id="dxf-empty-open-b" class="rp-sample-btn" title="Open Revised AutoCAD DXF (Slot B)"><i data-ic="openB"></i><span id="dxf-lp-btn-b">Open Revised DXF (B)</span></button>
                  </div>
                </div>
                <div class="rp-ws-section-lbl" id="dxf-lp-sec-lbl">DIRECT CAD OPERATIONS</div>
                <div class="rp-launchpad-grid">
                  <button type="button" class="rp-launch-card" id="dxf-empty-new-mm" title="Create New Blank AutoCAD DXF Sheet (Metric mm)">
                    <i data-ic="blank"></i>
                    <div><b id="dxf-lp-card1-t">New Blank DXF (MM)</b><span id="dxf-lp-card1-s">Create metric CAD sheet with standard layers</span></div>
                    <kbd class="rp-ws-kbd">MM</kbd>
                  </button>
                  <button type="button" class="rp-launch-card" id="dxf-empty-new-mils" title="Create New Blank AutoCAD DXF Sheet (English mils)">
                    <i data-ic="blank"></i>
                    <div><b id="dxf-lp-card2-t">New Blank DXF (MILS)</b><span id="dxf-lp-card2-s">Create IPC English CAD sheet in mils</span></div>
                    <kbd class="rp-ws-kbd">MILS</kbd>
                  </button>
                  <button type="button" class="rp-launch-card" id="dxf-empty-pair" title="Select Two AutoCAD DXF Files (Rev A &amp; Rev B) for Vector Compare">
                    <i data-ic="tabCompare"></i>
                    <div><b id="dxf-lp-card3-t">Compare DXF Pair (A↔B)</b><span id="dxf-lp-card3-s">Load two .dxf files for vector overlay diff</span></div>
                    <kbd class="rp-ws-kbd">A↔B</kbd>
                  </button>
                  <button type="button" class="rp-launch-card" id="dxf-empty-layers" title="Open Pre-Compare DXF Layer Selector">
                    <i data-ic="layers"></i>
                    <div><b id="dxf-lp-card4-t">Layer Setup &amp; Filter</b><span id="dxf-lp-card4-s">Configure compared, locked &amp; frozen layers</span></div>
                    <kbd class="rp-ws-kbd">Layers</kbd>
                  </button>
                </div>
              </div>
            </div>
            <!-- ON-CANVAS 3D VIEWCUBE & MULTI-ANGLE PROJECTION HUD -->
            <div class="dxf-viewcube-hud" id="dxf-viewcube-hud">
              <div class="dxf-vc-top">
                <div class="dxf-vc-cube-wrap" id="dxf-vc-cube-btn" title="Click to toggle 2D Top / 3D SW Isometric · Alt+Drag on Canvas to Free Orbit">
                  <div class="dxf-vc-cube" id="dxf-vc-cube-svg">
                    <span id="dxf-vc-face-lbl">TOP 2D</span>
                  </div>
                </div>
                <div class="dxf-vc-grid">
                  <button type="button" class="dxf-vc-btn on" data-vc-preset="top" title="Top 2D Plan View (XY)">TOP</button>
                  <button type="button" class="dxf-vc-btn" data-vc-preset="front" title="Front 3D Elevation (XZ)">FRONT</button>
                  <button type="button" class="dxf-vc-btn" data-vc-preset="right" title="Right Side 3D View (YZ)">RIGHT</button>
                  <button type="button" class="dxf-vc-btn" data-vc-preset="left" title="Left Side 3D View (-YZ)">LEFT</button>
                  <button type="button" class="dxf-vc-btn" data-vc-preset="sw_iso" title="SW 3D Isometric View">SW ISO</button>
                  <button type="button" class="dxf-vc-btn" data-vc-preset="se_iso" title="SE 3D Isometric View">SE ISO</button>
                  <button type="button" class="dxf-vc-btn" data-vc-preset="ne_iso" title="NE 3D Isometric View">NE ISO</button>
                  <button type="button" class="dxf-vc-btn" data-vc-preset="nw_iso" title="NW 3D Isometric View">NW ISO</button>
                </div>
              </div>
              <div class="dxf-vc-angles">
                <label title="3D Yaw Angle (°)">Y°<input type="number" id="dxf-vc-yaw" value="0" step="15"></label>
                <label title="3D Pitch Angle (°)">P°<input type="number" id="dxf-vc-pitch" value="0" step="15"></label>
                <label title="3D Roll Angle (°)">R°<input type="number" id="dxf-vc-roll" value="0" step="15"></label>
                <button type="button" class="dxf-vc-btn" id="dxf-vc-orbit-btn" data-dxf-tool="orbit" title="Interactive 3D Free Orbit Tool">↻ ORBIT</button>
              </div>
            </div>

            <div class="dxf-stage-hud">
              <button type="button" class="rp-btn-sm on" id="dxf-aid-grid" title="Toggle Calibrated CAD Grid (F7)">GRID</button>
              <button type="button" class="rp-btn-sm" id="dxf-aid-ortho" title="Toggle Orthogonal 0°/90° Lock (F8)">ORTHO</button>
              <button type="button" class="rp-btn-sm on" id="dxf-aid-polar" title="Toggle 45° Polar Tracking (F10)">POLAR</button>
              <button type="button" class="rp-btn-sm on" id="dxf-aid-osnap" title="Toggle 10-Mode Magnetic Object Snap: Endpoint, Midpoint, Center, Quadrant, Intersection, Perpendicular, Tangent (F3)">OSNAP</button>
              <button type="button" class="rp-btn-sm on" id="dxf-aid-dyn" title="Toggle Live Dynamic Input HUD">DYN</button>
              <button type="button" class="rp-btn-sm on" id="dxf-aid-lwt" title="Toggle Lineweight Display">LWT</button>
              <button type="button" class="rp-btn-sm" id="dxf-aid-3d" title="Toggle 3D Isometric Extrusion View">3D ISO</button>
            </div>
          </div>
          <div class="dxf-cmdline-bar">
            <span class="dxf-cmd-prompt">Command:</span>
            <input type="text" id="dxf-cmd-input" placeholder="Type AutoCAD command (LINE, PLINE, POLYGON, CIRCLE, DONUT, REVCLOUD, 3DBOX, CHAMFER, ARRAYRECT, ARRAYPOLAR, JOIN, OVERKILL, 3DORBIT) or X,Y / @dx,dy..." autocomplete="off" />
            <span id="dxf-cmd-log" class="dxf-cmd-log">Ready</span>
          </div>
        </div>

        <!-- RIGHT DOCK: ENTITY PROPERTIES INSPECTOR & VECTOR DIFFS -->
        <aside class="dxf-props-dock" id="dxf-props-dock">
          <div class="dxf-dock-header kdock-pane-header">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="kdock-grip">⋮⋮</span>
              <i data-ic="gear"></i>
              <b>Inspector &amp; Diffs</b>
            </div>
            <div style="display:flex;gap:3px;align-items:center">
              <button type="button" class="rp-btn-sm" id="dxf-prop-clear-sel" title="Deselect All (Esc)" style="height:18px;padding:0 5px;font-size:9.5px">Clear</button>
              <button type="button" class="kdock-act" data-dxf-pane="props" data-dxf-pos="float" title="Detach Inspector as Floating Window" style="display:none">❐</button>
              <button type="button" class="kdock-act" data-dxf-pane="props" data-dxf-pos="hide" title="Minimize Inspector Dock">—</button>
            </div>
          </div>
          <div id="dxf-props-body" class="dxf-props-body"></div>
        </aside>
      </div>

      <footer class="dxf-statusbar">
        <span id="dxf-st-sel-info">Slot B · Ready</span>
        <span id="dxf-st-coords">X: 0.000 mm   Y: 0.000 mm   Zoom: 100%</span>
      </footer>
    `;

    if (typeof hydrateIcons === 'function') hydrateIcons(host);

    // Wire Ribbon Tab Switching
    host.querySelectorAll('#dxf-studio-tabs [data-dxfrtab]').forEach(btn => {
      btn.onclick = () => {
        const tab = btn.dataset.dxfrtab;
        StudioState.activeRibbonTab = tab;
        host.querySelectorAll('#dxf-studio-tabs [data-dxfrtab]').forEach(b => b.classList.toggle('active', b === btn));
        host.querySelectorAll('#dxf-studio-ribbon [data-dxfgrp]').forEach(grp => {
          const tokens = (grp.dataset.dxfgrp || '').split(/\s+/);
          const show = tab === 'all' || tokens.includes(tab);
          grp.hidden = !show;
          grp.style.display = show ? '' : 'none';
        });
      };
    });

    ['#dxf-st-col-a', '#dxf-st-col-b', '#dxf-st-col-c'].forEach(sel => {
      const el = $(sel);
      if (!el) return;
      el.oninput = e => {
        const v = e.target.value;
        if (window.setCompareColors) {
          if (sel.endsWith('-a')) window.setCompareColors({ tintA: v });
          else if (sel.endsWith('-b')) window.setCompareColors({ tintB: v });
          else window.setCompareColors({ tintC: v });
        }
        renderCanvas();
      };
    });
    const dxfBody = host.querySelector('.dxf-studio-body');
    if ($('#dxf-toggle-left-dock') && dxfBody) {
      $('#dxf-toggle-left-dock').onclick = () => {
        const lDock = $('#dxf-layer-dock');
        if (!lDock) return;
        const hide = !lDock.hidden;
        lDock.hidden = hide;
        dxfBody.classList.toggle('hide-left-dock', hide);
        $('#dxf-toggle-left-dock').classList.toggle('on', !hide);
        setTimeout(() => renderCanvas(), 20);
      };
    }
    if ($('#dxf-toggle-right-dock') && dxfBody) {
      $('#dxf-toggle-right-dock').onclick = () => {
        const rDock = $('#dxf-props-dock');
        if (!rDock) return;
        const hide = !rDock.hidden;
        rDock.hidden = hide;
        dxfBody.classList.toggle('hide-right-dock', hide);
        $('#dxf-toggle-right-dock').classList.toggle('on', !hide);
        setTimeout(() => renderCanvas(), 20);
      };
    }

    // Wire Tool Buttons (Click active tool button again to toggle it OFF back to 'select')
    host.querySelectorAll('[data-dxf-tool]').forEach(btn => {
      btn.onclick = () => {
        const target = btn.dataset.dxfTool;
        if (StudioState.activeTool === target && target !== 'select') {
          toolOff();
        } else {
          setActiveTool(target);
        }
      };
    });
    if ($('#dxf-finish-tool-btn')) $('#dxf-finish-tool-btn').onclick = () => toolDone();
    if ($('#dxf-rewind-tool-btn')) $('#dxf-rewind-tool-btn').onclick = () => toolRewind();
    if ($('#dxf-cancel-tool-btn')) $('#dxf-cancel-tool-btn').onclick = () => toolCancel();
    if ($('#dxf-off-tool-btn')) $('#dxf-off-tool-btn').onclick = () => toolOff();

    // Wire File & Export Buttons
    $('#dxf-st-blank').onclick = () => {
      const p = getActiveParser();
      createNewBlankDXF((p && p.unitName) || 'mm');
    };
    const openDxfForSlot = async (targetSlot = null) => {
      if (!window.native || !window.native.openFiles) return;
      const files = await window.native.openFiles({
        title: targetSlot ? `Open AutoCAD DXF into Slot ${targetSlot}` : `Open AutoCAD DXF in DXF Studio (Select 1 File to Edit or 2 Files to Compare)`,
        multi: !targetSlot,
        filters: [{ name: 'AutoCAD Drawings (.dxf, .dwg)', extensions: ['dxf', 'dwg'] }]
      });
      if (!files || !files.length) return;
      await handleDroppedFiles(files, targetSlot);
    };
    if ($('#dxf-st-open-b')) $('#dxf-st-open-b').onclick = () => openDxfForSlot('B');
    if ($('#dxf-empty-open-a')) $('#dxf-empty-open-a').onclick = () => openDxfForSlot('A');
    if ($('#dxf-empty-open-b')) $('#dxf-empty-open-b').onclick = () => openDxfForSlot('B');
    if ($('#dxf-empty-new-mm')) $('#dxf-empty-new-mm').onclick = () => createNewBlankDXF('mm');
    if ($('#dxf-empty-new-mils')) $('#dxf-empty-new-mils').onclick = () => createNewBlankDXF('mils');
    if ($('#dxf-empty-pair')) $('#dxf-empty-pair').onclick = () => openDxfForSlot(null);
    if ($('#dxf-empty-layers')) $('#dxf-empty-layers').onclick = () => { if (window.showDXFPreCompareModal) window.showDXFPreCompareModal(); };
    $('#dxf-st-open').onclick = async () => {
      if (!window.native || !window.native.openFiles) return;
      const files = await window.native.openFiles({
        title: `Open AutoCAD DXF in DXF Studio (Select 1 File to Edit or 2 Files to Compare)`,
        multi: true,
        filters: [{ name: 'AutoCAD Drawings (.dxf, .dwg)', extensions: ['dxf', 'dwg'] }]
      });
      if (!files || !files.length) return;
      await handleDroppedFiles(files);
    };
    $('#dxf-st-save').onclick = () => saveModifiedDXFFile();
    $('#dxf-st-svg').onclick = () => exportDXFStudioSVG();
    $('#dxf-st-png').onclick = () => exportDXFStudioPNG();
    $('#dxf-st-to-pdf').onclick = () => sendDXFToPDFStudio();
    $('#dxf-st-precompare').onclick = () => { if (window.showDXFPreCompareModal) window.showDXFPreCompareModal(); };
    $('#dxf-st-send-cmp').onclick = () => syncAndSendToCompare();
    $('#dxf-st-undo').onclick = () => undo();
    $('#dxf-st-redo').onclick = () => redo();
    $('#dxf-st-explode').onclick = () => explodeSelectedEntities();
    $('#dxf-st-erase').onclick = () => deleteSelectedEntities();
    if ($('#dxf-st-lengthen')) $('#dxf-st-lengthen').onclick = () => lengthenSelectedEntities();
    if ($('#dxf-st-origin')) $('#dxf-st-origin').onclick = () => moveSelectionToOrigin(false);
    if ($('#dxf-st-area')) $('#dxf-st-area').onclick = () => computeSelectionAreaAndLength();
    if ($('#dxf-st-box-mils')) $('#dxf-st-box-mils').onchange = e => setHighlightBoxMils(parseFloat(e.target.value) || 7);
    if ($('#dxf-st-box-toggle')) $('#dxf-st-box-toggle').onclick = () => toggleDiffBoxes();

    // Wire Parameters & Style Controls in Ribbon
    if ($('#dxf-st-offset-val')) {
      $('#dxf-st-offset-val').onchange = e => {
        const v = parseFloat(e.target.value);
        if (v > 0) StudioState.offsetDistance = v;
      };
    }
    if ($('#dxf-st-fillet-val')) {
      $('#dxf-st-fillet-val').onchange = e => {
        const v = parseFloat(e.target.value);
        if (v >= 0) StudioState.filletRadius = v;
      };
    }
    if ($('#dxf-st-texth-val')) {
      $('#dxf-st-texth-val').onchange = e => {
        const v = parseFloat(e.target.value);
        if (v > 0) StudioState.textHeight = v;
      };
    }
    if ($('#dxf-st-col-mode')) {
      $('#dxf-st-col-mode').onchange = e => {
        const mode = e.target.value;
        StudioState.activeColor = mode;
        const p = getActiveParser();
        if (mode !== 'BYLAYER' && mode !== 'CUSTOM' && typeof DXFEngine !== 'undefined' && DXFEngine.aciToHex) {
          const hex = DXFEngine.aciToHex(parseInt(mode, 10), true);
          StudioState.activeCustomHex = hex;
          if ($('#dxf-st-col-pick')) $('#dxf-st-col-pick').value = hex;
        }
        if (p && StudioState.selectedIds.size > 0) {
          const sel = p.entities.filter(ent => StudioState.selectedIds.has(ent._id) && !isLayerLocked(p, ent.layer));
          if (sel.length) {
            pushUndoSnapshot('Change Entity Color');
            sel.forEach(ent => {
              if (mode === 'BYLAYER') {
                ent.color = null; ent.trueColor = null; ent.customHex = null;
              } else if (mode === 'CUSTOM') {
                ent.customHex = StudioState.activeCustomHex;
                ent.trueColor = (typeof DXFEngine !== 'undefined' && DXFEngine.hexToTrueColor) ? DXFEngine.hexToTrueColor(StudioState.activeCustomHex) : null;
                ent.color = (typeof DXFEngine !== 'undefined' && DXFEngine.hexToNearestACI) ? DXFEngine.hexToNearestACI(StudioState.activeCustomHex) : null;
              } else {
                ent.color = parseInt(mode, 10);
                ent.trueColor = null;
                ent.customHex = null;
              }
            });
            syncParserMutation();
            refreshAllUI();
          }
        }
      };
    }
    if ($('#dxf-st-col-pick')) {
      const applyRibbonPick = (hex, commit) => {
        StudioState.activeCustomHex = hex;
        StudioState.activeColor = 'CUSTOM';
        if ($('#dxf-st-col-mode')) $('#dxf-st-col-mode').value = 'CUSTOM';
        const p = getActiveParser();
        if (p && StudioState.selectedIds.size > 0) {
          const sel = p.entities.filter(ent => StudioState.selectedIds.has(ent._id) && !isLayerLocked(p, ent.layer));
          if (sel.length) {
            if (commit) pushUndoSnapshot('Change Entity Color');
            const tc = (typeof DXFEngine !== 'undefined' && DXFEngine.hexToTrueColor) ? DXFEngine.hexToTrueColor(hex) : null;
            const aci = (typeof DXFEngine !== 'undefined' && DXFEngine.hexToNearestACI) ? DXFEngine.hexToNearestACI(hex) : null;
            sel.forEach(ent => { ent.customHex = hex; ent.trueColor = tc; if (aci) ent.color = aci; });
            if (commit) { syncParserMutation(); refreshAllUI(); }
            else renderCanvas();
          }
        }
      };
      $('#dxf-st-col-pick').oninput = e => applyRibbonPick(e.target.value, false);
      $('#dxf-st-col-pick').onchange = e => applyRibbonPick(e.target.value, true);
    }
    if ($('#dxf-st-lw-sel')) {
      $('#dxf-st-lw-sel').onchange = e => setActiveLineweight(e.target.value, true);
    }
    if ($('#dxf-st-lw-sel-lyr')) {
      $('#dxf-st-lw-sel-lyr').onchange = e => setActiveLineweight(e.target.value, true);
    }
    if ($('#dxf-st-thk-val')) {
      $('#dxf-st-thk-val').onchange = e => setDefaultThickness(e.target.value, true);
    }
    if ($('#dxf-st-tri-w')) {
      $('#dxf-st-tri-w').onchange = e => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v) && v > 0) {
          StudioState.triangleWidth = v;
          if (StudioState.triangleType === 'equilateral') {
            StudioState.triangleHeight = +(v * Math.sqrt(3) / 2).toFixed(2);
            if ($('#dxf-st-tri-h')) $('#dxf-st-tri-h').value = StudioState.triangleHeight;
          }
          const p = getActiveParser();
          if (p && StudioState.selectedIds.size === 1) {
            const selEnt = p.entities.find(ent => StudioState.selectedIds.has(ent._id) && !isLayerLocked(p, ent.layer));
            if (selEnt && detectShapeKind(selEnt) === 'triangle') {
              pushUndoSnapshot('Resize Triangle Width');
              resizeTriangleEntity(selEnt, StudioState.triangleWidth, StudioState.triangleHeight, selEnt.triType || StudioState.triangleType);
              syncParserMutation();
              refreshAllUI();
            }
          }
        }
      };
    }
    if ($('#dxf-st-tri-h')) {
      $('#dxf-st-tri-h').onchange = e => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v) && v > 0) {
          StudioState.triangleHeight = v;
          const p = getActiveParser();
          if (p && StudioState.selectedIds.size === 1) {
            const selEnt = p.entities.find(ent => StudioState.selectedIds.has(ent._id) && !isLayerLocked(p, ent.layer));
            if (selEnt && detectShapeKind(selEnt) === 'triangle') {
              pushUndoSnapshot('Resize Triangle Height');
              resizeTriangleEntity(selEnt, StudioState.triangleWidth, StudioState.triangleHeight, selEnt.triType || StudioState.triangleType);
              syncParserMutation();
              refreshAllUI();
            }
          }
        }
      };
    }
    if ($('#dxf-st-tri-type')) {
      $('#dxf-st-tri-type').onchange = e => {
        StudioState.triangleType = e.target.value || 'isosceles';
        const isEq = StudioState.triangleType === 'equilateral';
        if ($('#dxf-st-tri-h')) $('#dxf-st-tri-h').disabled = isEq;
        if (isEq) {
          StudioState.triangleHeight = +(StudioState.triangleWidth * Math.sqrt(3) / 2).toFixed(2);
          if ($('#dxf-st-tri-h')) $('#dxf-st-tri-h').value = StudioState.triangleHeight;
        }
        const p = getActiveParser();
        if (p && StudioState.selectedIds.size === 1) {
          const selEnt = p.entities.find(ent => StudioState.selectedIds.has(ent._id) && !isLayerLocked(p, ent.layer));
          if (selEnt && detectShapeKind(selEnt) === 'triangle') {
            pushUndoSnapshot('Change Triangle Type');
            resizeTriangleEntity(selEnt, StudioState.triangleWidth, StudioState.triangleHeight, StudioState.triangleType);
            syncParserMutation();
            refreshAllUI();
          }
        }
      };
    }
    if ($('#dxf-st-tri-fixed')) {
      $('#dxf-st-tri-fixed').onchange = e => {
        StudioState.triangleFixedSize = !!e.target.checked;
        if (StudioState.activeTool === 'triangle') setActiveTool('triangle');
      };
    }
    if ($('#dxf-st-tri-place')) {
      $('#dxf-st-tri-place').onclick = () => {
        const p = ensureActiveParser(true);
        if (!p) return;
        if (isLayerLocked(p, StudioState.currentLayer)) return toast(`Layer "${StudioState.currentLayer}" is LOCKED.`);
        const cvEl = $('#dxf-canvas');
        const cx = cvEl ? ((cvEl.width * 0.5 - StudioState.panX) / (StudioState.zoom || 1)) : 100;
        const cy = cvEl ? ((cvEl.height * 0.5 - StudioState.panY) / (StudioState.zoom || 1)) : 70;
        const w = Math.max(0.1, parseFloat($('#dxf-st-tri-w') && $('#dxf-st-tri-w').value) || StudioState.triangleWidth || 60);
        const h = Math.max(0.1, parseFloat($('#dxf-st-tri-h') && $('#dxf-st-tri-h').value) || StudioState.triangleHeight || 50);
        StudioState.triangleWidth = w;
        StudioState.triangleHeight = h;
        pushUndoSnapshot('Place Triangle');
        const ent = createTriangleEntity(cx - w * 0.5, cy - h * 0.5, w, h, StudioState.triangleType);
        p.entities.push(ent);
        syncParserMutation();
        StudioState.selectedIds = new Set([ent._id]);
        refreshAllUI();
        logCommand(`Placed ${StudioState.triangleType.toUpperCase()} TRIANGLE (W=${w.toFixed(2)} × H=${h.toFixed(2)}) at center.`);
      };
    }
    if ($('#dxf-st-lt-sel')) {
      $('#dxf-st-lt-sel').onchange = e => {
        StudioState.activeLinetype = e.target.value;
        const p = getActiveParser();
        if (p && StudioState.selectedIds.size > 0) {
          const sel = p.entities.filter(ent => StudioState.selectedIds.has(ent._id) && !isLayerLocked(p, ent.layer));
          if (sel.length) {
            pushUndoSnapshot('Change Entity Linetype');
            sel.forEach(ent => { ent.linetype = e.target.value; });
            syncParserMutation();
            refreshAllUI();
          }
        }
      };
    }
    if ($('#dxf-st-units-sel')) {
      $('#dxf-st-units-sel').onchange = e => {
        const p = getActiveParser();
        if (p) {
          p.unitName = e.target.value;
          p.insunitsCode = e.target.value === 'in' ? 1 : (e.target.value === 'mils' ? 10 : 4);
          refreshAllUI();
          toast(`Drawing units set to ${e.target.value.toUpperCase()}.`);
        }
      };
    }

    // Wire Quickbar Selects
    $('#dxf-st-slot-sel').onchange = e => {
      const v = e.target.value;
      if (v === 'overlay' || v === 'side') {
        StudioState.viewMode = v;
      } else {
        StudioState.viewMode = 'single';
        StudioState.activeSlot = v;
      }
      StudioState.selectedIds.clear();
      refreshAllUI();
    };
    $('#dxf-clayer-sel').onchange = e => {
      StudioState.currentLayer = e.target.value;
      renderLayerManagerDock();
      updateStatusBar();
    };
    $('#dxf-st-bg-sel').onchange = e => {
      StudioState.background = e.target.value;
      const ds = getDXFState();
      if (ds) ds.background = e.target.value;
      renderCanvas();
    };
    if ($('#dxf-lay-iso')) $('#dxf-lay-iso').onclick = () => isolateSelectedLayer();
    if ($('#dxf-lay-uniso')) $('#dxf-lay-uniso').onclick = () => unisolateLayers();
    if ($('#dxf-st-qselect')) $('#dxf-st-qselect').onclick = async () => {
      const q = (typeof window !== 'undefined' && typeof window.rpPrompt === 'function')
        ? await window.rpPrompt('Quick Select (QSELECT)', 'Enter entity type (LINE, CIRCLE, TEXT, INSERT, LWPOLYLINE, DIMENSION) or LAYER:<name>:', 'CIRCLE')
        : (typeof prompt === 'function' ? prompt('QSELECT entity type or LAYER:<name>:', 'CIRCLE') : '');
      if (q) quickSelectEntities(q);
    };
    if ($('#dxf-st-find-text')) $('#dxf-st-find-text').onclick = async () => {
      const q = (typeof window !== 'undefined' && typeof window.rpPrompt === 'function')
        ? await window.rpPrompt('Find & Replace DXF Text', 'Enter search text, or "old -> new" to replace:', '')
        : (typeof prompt === 'function' ? prompt('Find text (or "old -> new" to replace):', '') : '');
      if (q) {
        const idx = q.indexOf('->');
        if (idx >= 0) findAndReplaceDXFText(q.slice(0, idx).trim(), q.slice(idx + 2).trim());
        else findAndReplaceDXFText(q, null);
      }
    };
    if ($('#dxf-st-bom-csv')) $('#dxf-st-bom-csv').onclick = () => exportDXFBOMCSV(true);
    if ($('#dxf-st-boltcircle')) $('#dxf-st-boltcircle').onclick = () => generateBoltCirclePattern(0, 0, 60, 6, 6.6, 0);
    if ($('#dxf-st-titleblock')) $('#dxf-st-titleblock').onclick = () => insertMechanicalTitleBlock('KENSHO PRO CAD DRAWING');
    if ($('#dxf-vc-orbit-btn')) $('#dxf-vc-orbit-btn').onclick = () => setActiveTool(StudioState.activeTool === 'orbit' ? 'select' : 'orbit');

    // Wire Layer Dock Quick Buttons
    const addNewLayerPrompt = async () => {
      const parser = ensureActiveParser(true);
      const ds = getDXFState();
      if (!parser || !ds) return;
      const defaultName = `LAYER_${Object.keys(parser.layers).length + 1}`;
      let name = defaultName;
      if (window.dialog) {
        const r = await window.dialog('Create New AutoCAD Layer', [
          { type: 'text', id: 'name', label: 'Layer Name', value: defaultName },
          { type: 'color', id: 'col', label: 'Layer Color', value: '#38bdf8' }
        ], 'Create Layer');
        if (!r || !r.name) return;
        name = r.name.trim();
        [ds.parsedA, ds.parsedB].forEach(p => { if (p) p.addLayer(name, { color: 4, customHex: r.col }); });
      } else {
        [ds.parsedA, ds.parsedB].forEach(p => { if (p) p.addLayer(name, { color: 4 }); });
      }
      ds.comparedLayers.add(name);
      StudioState.currentLayer = name;
      refreshAllUI();
      logCommand(`Created layer "${name}".`);
    };
    if ($('#dxf-dock-new-btn')) $('#dxf-dock-new-btn').onclick = addNewLayerPrompt;
    if ($('#dxf-st-add-lyr')) $('#dxf-st-add-lyr').onclick = addNewLayerPrompt;
    if ($('#dxf-dock-pre-btn')) $('#dxf-dock-pre-btn').onclick = () => { if (window.showDXFPreCompareModal) window.showDXFPreCompareModal(); };
    if ($('#dxf-layer-search')) {
      $('#dxf-layer-search').oninput = e => {
        StudioState.layerSearch = e.target.value;
        renderLayerManagerDock();
      };
    }
    const setAllLayersVis = on => {
      const ds = getDXFState();
      if (!ds) return;
      ds.syncLayerSetsFromParsers().forEach(l => ds.applyLayerStateToParsers(l.name, { visible: on, frozen: false, compared: on }));
      syncParserMutation();
      refreshAllUI();
    };
    if ($('#dxf-dock-all-on')) $('#dxf-dock-all-on').onclick = () => setAllLayersVis(true);
    if ($('#dxf-st-thaw-all')) $('#dxf-st-thaw-all').onclick = () => setAllLayersVis(true);
    if ($('#dxf-dock-all-off')) $('#dxf-dock-all-off').onclick = () => setAllLayersVis(false);
    const unlockAllLayers = () => {
      const ds = getDXFState();
      if (!ds) return;
      ds.syncLayerSetsFromParsers().forEach(l => ds.applyLayerStateToParsers(l.name, { locked: false }));
      refreshAllUI();
      toast('Unlocked all AutoCAD layers.');
    };
    if ($('#dxf-dock-unlock')) $('#dxf-dock-unlock').onclick = unlockAllLayers;
    if ($('#dxf-st-unlock-all')) $('#dxf-st-unlock-all').onclick = unlockAllLayers;
    const purgeUnused = () => {
      const ds = getDXFState();
      if (!ds) return;
      let count = 0;
      [ds.parsedA, ds.parsedB].forEach(p => { if (p && p.purgeUnusedLayers) count += p.purgeUnusedLayers().length; });
      refreshAllUI();
      toast(count ? `Purged ${count} empty unused layer(s).` : 'No unused layers to purge.');
    };
    if ($('#dxf-dock-purge')) $('#dxf-dock-purge').onclick = purgeUnused;
    if ($('#dxf-st-purge')) $('#dxf-st-purge').onclick = purgeUnused;
    if ($('#dxf-st-wb-btn')) $('#dxf-st-wb-btn').onclick = () => { if (window.showDXFWorkbenchModal) window.showDXFWorkbenchModal('layers'); };
    if ($('#dxf-prop-clear-sel')) {
      $('#dxf-prop-clear-sel').onclick = () => {
        StudioState.selectedIds.clear();
        refreshAllUI();
      };
    }

    // Wire Zoom & Drafting Aid Buttons
    $('#dxf-st-zi').onclick = () => { StudioState.zoom = Math.min(1e6, StudioState.zoom * 1.25); renderCanvas(); updateStatusBar(); };
    $('#dxf-st-zo').onclick = () => { StudioState.zoom = Math.max(1e-6, StudioState.zoom / 1.25); renderCanvas(); updateStatusBar(); };
    $('#dxf-st-ze').onclick = () => zoomExtents();
    $('#dxf-aid-grid').onclick = () => { StudioState.gridEnabled = !StudioState.gridEnabled; renderCanvas(); updateStatusBar(); };
    $('#dxf-aid-ortho').onclick = () => { StudioState.orthoEnabled = !StudioState.orthoEnabled; updateStatusBar(); };
    $('#dxf-aid-polar').onclick = () => { StudioState.polarEnabled = !StudioState.polarEnabled; updateStatusBar(); };
    $('#dxf-aid-osnap').onclick = () => { StudioState.osnapEnabled = !StudioState.osnapEnabled; renderCanvas(); updateStatusBar(); };
    $('#dxf-aid-lwt').onclick = () => { StudioState.showLineweights = !StudioState.showLineweights; renderCanvas(); updateStatusBar(); };
    if ($('#dxf-aid-dyn')) {
      $('#dxf-aid-dyn').onclick = () => {
        StudioState.dynInputEnabled = !StudioState.dynInputEnabled;
        $('#dxf-aid-dyn').classList.toggle('on', StudioState.dynInputEnabled);
        renderCanvas();
      };
    }
    if ($('#dxf-aid-3d')) {
      $('#dxf-aid-3d').onclick = () => {
        if (is3DViewActive()) setViewPreset('top');
        else setViewPreset('sw_iso');
        $('#dxf-aid-3d').classList.toggle('on', is3DViewActive());
      };
    }

    // Wire 2D/3D View Preset Buttons & Selectors
    host.querySelectorAll('[data-dxf-vpreset], [data-vc-preset]').forEach(btn => {
      btn.onclick = () => {
        const p = btn.dataset.dxfVpreset || btn.dataset.vcPreset;
        setViewPreset(p);
        if ($('#dxf-aid-3d')) $('#dxf-aid-3d').classList.toggle('on', is3DViewActive());
      };
    });
    if ($('#dxf-vc-cube-btn')) {
      $('#dxf-vc-cube-btn').onclick = () => {
        setViewPreset(is3DViewActive() ? 'top' : 'sw_iso');
        if ($('#dxf-aid-3d')) $('#dxf-aid-3d').classList.toggle('on', is3DViewActive());
      };
    }
    if ($('#dxf-qb-view-sel')) $('#dxf-qb-view-sel').onchange = e => setViewPreset(e.target.value);
    if ($('#dxf-qb-style-sel')) $('#dxf-qb-style-sel').onchange = e => setVisualStyle(e.target.value);
    if ($('#dxf-st-style-sel')) $('#dxf-st-style-sel').onchange = e => setVisualStyle(e.target.value);
    if ($('#dxf-st-3d-depth')) {
      $('#dxf-st-3d-depth').onchange = e => {
        StudioState.auto3DDepth = Math.max(0, parseFloat(e.target.value) || 0);
        renderCanvas();
      };
    }
    ['yaw', 'pitch', 'roll'].forEach(axis => {
      const vcIn = $(`#dxf-vc-${axis}`);
      const stIn = $(`#dxf-st-${axis}`);
      const applyAxis = val => {
        const num = parseFloat(val) || 0;
        ensure3DModelspaceReady();
        StudioState[axis] = num;
        StudioState.viewPreset = 'custom';
        if (is3DViewActive() && StudioState.visualStyle === '2d') {
          StudioState.visualStyle = '3d_shaded';
        }
        center3DPivotInViewport();
        if (vcIn) vcIn.value = Math.round(num);
        if (stIn) stIn.value = Math.round(num);
        syncViewCubeControls();
        renderCanvas();
        updateStatusBar();
      };
      if (vcIn) vcIn.onchange = e => applyAxis(e.target.value);
      if (stIn) stIn.onchange = e => applyAxis(e.target.value);
    });

    // Wire New Modify & Construct Buttons + Parameters
    if ($('#dxf-st-join')) $('#dxf-st-join').onclick = () => joinSelectedEntities();
    if ($('#dxf-st-array-rect')) $('#dxf-st-array-rect').onclick = () => arrayRectSelectedEntities();
    if ($('#dxf-qb-arr-rect')) $('#dxf-qb-arr-rect').onclick = () => arrayRectSelectedEntities();
    if ($('#dxf-st-overkill')) $('#dxf-st-overkill').onclick = () => overkillDuplicateEntities();
    if ($('#dxf-st-chamfer-val')) {
      $('#dxf-st-chamfer-val').onchange = e => {
        const v = parseFloat(e.target.value);
        if (v >= 0) { StudioState.chamferDist1 = v; StudioState.chamferDist2 = v; }
      };
    }
    if ($('#dxf-st-poly-sides')) {
      $('#dxf-st-poly-sides').onchange = e => {
        StudioState.polygonSides = Math.max(3, Math.min(36, parseInt(e.target.value, 10) || 6));
      };
    }
    if ($('#dxf-st-arr-r')) $('#dxf-st-arr-r').onchange = e => { StudioState.arrayRows = Math.max(1, parseInt(e.target.value, 10) || 3); };
    if ($('#dxf-st-arr-c')) $('#dxf-st-arr-c').onchange = e => { StudioState.arrayCols = Math.max(1, parseInt(e.target.value, 10) || 3); };

    // Wire DXF Studio Side-Panel Multi-Window Layout Presets (lr, rud, lud, btm, float, canvas)
    const applyDXFDockLayout = (mode) => {
      const bodyEl = $('#dxf-studio-body');
      const lDock = $('#dxf-layer-dock');
      const rDock = $('#dxf-props-dock');
      if (!bodyEl || !lDock || !rDock) return;
      StudioState.dockLayout = mode;
      bodyEl.dataset.dxfLayout = mode;
      lDock.classList.remove('is-floating');
      rDock.classList.remove('is-floating');
      lDock.style.cssText = '';
      rDock.style.cssText = '';
      if (mode === 'canvas') {
        lDock.hidden = true;
        rDock.hidden = true;
        bodyEl.classList.add('hide-left-dock', 'hide-right-dock');
      } else {
        lDock.hidden = false;
        rDock.hidden = false;
        bodyEl.classList.remove('hide-left-dock', 'hide-right-dock');
        if (mode === 'float') {
          lDock.classList.add('is-floating');
          rDock.classList.add('is-floating');
          lDock.style.cssText = 'position:fixed;left:28px;top:156px;width:270px;height:440px;z-index:1200;';
          rDock.style.cssText = 'position:fixed;right:28px;top:156px;width:300px;height:440px;z-index:1200;';
        }
      }
      host.querySelectorAll('[data-dxf-layout]').forEach(b => b.classList.toggle('on', b.dataset.dxfLayout === mode));
      setTimeout(() => renderCanvas(), 25);
    };
    host.querySelectorAll('[data-dxf-layout]').forEach(btn => {
      btn.onclick = () => applyDXFDockLayout(btn.dataset.dxfLayout);
    });
    host.querySelectorAll('[data-dxf-pane]').forEach(btn => {
      btn.onclick = () => {
        const pane = btn.dataset.dxfPane === 'layers' ? $('#dxf-layer-dock') : $('#dxf-props-dock');
        if (!pane) return;
        if (btn.dataset.dxfPos === 'hide') {
          pane.hidden = true;
          const bodyEl = $('#dxf-studio-body');
          if (btn.dataset.dxfPane === 'layers') {
            if (bodyEl) bodyEl.classList.add('hide-left-dock');
            if ($('#dxf-toggle-left-dock')) $('#dxf-toggle-left-dock').classList.remove('on');
          } else {
            if (bodyEl) bodyEl.classList.add('hide-right-dock');
            if ($('#dxf-toggle-right-dock')) $('#dxf-toggle-right-dock').classList.remove('on');
          }
          setTimeout(() => renderCanvas(), 20);
        } else if (btn.dataset.dxfPos === 'float') {
          pane.hidden = false;
          pane.classList.toggle('is-floating');
          if (pane.classList.contains('is-floating')) {
            pane.style.cssText = btn.dataset.dxfPane === 'layers'
              ? 'position:fixed;left:36px;top:160px;width:275px;height:440px;z-index:1200;'
              : 'position:fixed;right:36px;top:160px;width:300px;height:440px;z-index:1200;';
          } else {
            pane.style.cssText = '';
          }
          setTimeout(() => renderCanvas(), 20);
        }
      };
    });

    // Wire Command Input (with AutoCAD Up/Down history & Enter repeat)
    const cmdIn = $('#dxf-cmd-input');
    if (cmdIn) {
      cmdIn.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const v = cmdIn.value;
          cmdIn.value = '';
          executeCommandLine(v);
        } else if (e.key === 'ArrowUp') {
          const hist = StudioState.commandHistory || [];
          if (hist.length) {
            e.preventDefault();
            StudioState.commandHistoryIdx = Math.max(0, (StudioState.commandHistoryIdx ?? hist.length) - 1);
            cmdIn.value = hist[StudioState.commandHistoryIdx] || '';
          }
        } else if (e.key === 'ArrowDown') {
          const hist = StudioState.commandHistory || [];
          if (hist.length) {
            e.preventDefault();
            StudioState.commandHistoryIdx = Math.min(hist.length, (StudioState.commandHistoryIdx ?? hist.length) + 1);
            cmdIn.value = hist[StudioState.commandHistoryIdx] || '';
          }
        } else if (e.key === 'Escape') {
          cmdIn.blur();
          setActiveTool('select');
        }
      });
    }

    // Wire Canvas Pointer, Wheel & Right-Click Context Menu Events
    const cv = $('#dxf-canvas');
    if (cv) {
      cv.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (typeof window === 'undefined' || !window.showCtx) return;
        const rect = cv.getBoundingClientRect();
        const scaleX = rect.width > 0 ? (cv.width / rect.width) : 1;
        const scaleY = rect.height > 0 ? (cv.height / rect.height) : 1;
        const rawW = screenToWorld((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY, cv.height);
        const parser = ensureActiveParser();
        const hit = findEntityAt(rawW.x, rawW.y);
        if (hit && !StudioState.selectedIds.has(hit._id)) {
          StudioState.selectedIds = new Set([hit._id]);
          refreshAllUI();
        }
        const hasSel = StudioState.selectedIds.size > 0;
        const items = [];
        const hasActiveTool = !!(StudioState.activeTool && StudioState.activeTool !== 'select');
        const hasUncommitted = !!((StudioState.tempPoints && StudioState.tempPoints.length > 0) || (StudioState.uncommittedEntityIds && StudioState.uncommittedEntityIds.size > 0));
        const hasRewind = !!((StudioState.rewindBuffer && StudioState.rewindBuffer.length > 0) || (StudioState.tempPoints && StudioState.tempPoints.length > 0) || (parser && parser.entities && parser.entities.length > 0));
        const toolLbl = hasActiveTool ? StudioState.activeTool.toUpperCase() : 'CAD';

        // ✓ Done — Save Part & Start Second New Line (Full explanation in Help -> Quick Guide)
        items.push(
          { h: hasActiveTool ? `Active Tool: ${toolLbl}` : 'CAD Options' },
          {
            l: 'Done',
            ic: 'check',
            a: () => toolDone(false),
            dis: !hasActiveTool && !hasUncommitted
          },
          ...((['polyline', 'spline', 'hatch'].includes(StudioState.activeTool) && StudioState.tempPoints.length >= 2) ? [{
            l: 'Done (Close Loop)',
            ic: 'box',
            a: () => toolDone(true)
          }] : []),
          {
            l: 'Rewind',
            ic: 'undo',
            a: () => toolRewind(),
            dis: !hasRewind
          },
          {
            l: 'Cancel',
            ic: 'x',
            a: () => toolCancel(),
            dis: !hasActiveTool && !hasUncommitted
          },
          ...(hasActiveTool ? [{
            l: 'Turn Off Tool',
            ic: 'select',
            a: () => toolOff()
          }] : (StudioState.lastTool ? [{
            l: `Repeat ${StudioState.lastTool.toUpperCase()}`,
            ic: 'cadDxf',
            a: () => setActiveTool(StudioState.lastTool)
          }] : [])),
          '-'
        );
        if (hasSel && parser) {
          const firstEnt = parser.entities.find(en => StudioState.selectedIds.has(en._id));
          const lyrName = firstEnt ? firstEnt.layer : StudioState.currentLayer;
          const isLck = isLayerLocked(parser, lyrName);
          items.push(
            { h: `Selected (${StudioState.selectedIds.size} CAD Entit${StudioState.selectedIds.size === 1 ? 'y' : 'ies'})` },
            { l: 'Move Selected', ic: 'move', k: 'M', a: () => setActiveTool('move'), dis: isLck },
            { l: 'Copy Selected', ic: 'copy', k: 'CO', a: () => setActiveTool('copy') },
            { l: 'Duplicate (+10, +10)', ic: 'copy', k: 'Ctrl+D', a: () => duplicateSelectedEntities(10, 10) },
            { l: 'Rotate 90° CCW', ic: 'rotL', a: () => {
              const b = DXFEngine.getDXFEntityBBox(firstEnt, parser.blocks);
              const cx = b && isFinite(b.minX) ? (b.minX + b.maxX) / 2 : 0;
              const cy = b && isFinite(b.minY) ? (b.minY + b.maxY) / 2 : 0;
              pushUndoSnapshot('Rotate 90°');
              parser.entities.filter(en => StudioState.selectedIds.has(en._id)).forEach(en => rotateEntity(en, cx, cy, 90));
              syncParserMutation(); refreshAllUI();
            }, dis: isLck },
            { l: 'Mirror Horizontal', ic: 'mirror', a: () => {
              const b = DXFEngine.getDXFEntityBBox(firstEnt, parser.blocks);
              const cx = b && isFinite(b.minX) ? (b.minX + b.maxX) / 2 : 0;
              pushUndoSnapshot('Mirror Horizontal');
              parser.entities.filter(en => StudioState.selectedIds.has(en._id)).forEach(en => mirrorEntity(en, cx, -100, cx, 100));
              syncParserMutation(); refreshAllUI();
            }, dis: isLck },
            { l: 'Explode into Primitives', ic: 'explode', k: 'X', a: () => explodeSelectedEntities(), dis: isLck },
            { l: `${isLck ? 'Unlock' : 'Lock'} Layer "${lyrName}"`, ic: isLck ? 'unlock' : 'lock', a: () => {
              const ds = getDXFState();
              if (ds) ds.applyLayerStateToParsers(lyrName, { locked: !isLck });
              refreshAllUI();
            } },
            { l: 'Erase / Delete Selected', ic: 'trash', k: 'Del', a: () => deleteSelectedEntities(), dis: isLck },
            '-'
          );
        }
        items.push(
          { h: 'AutoCAD Draw & Modify' },
          { l: 'Draw Line', ic: 'line', a: () => setActiveTool('line') },
          { l: 'Draw Polyline', ic: 'polyline', a: () => setActiveTool('polyline') },
          { l: 'Draw Circle', ic: 'circle', a: () => setActiveTool('circle') },
          { l: 'Offset Entity', ic: 'offset', a: () => setActiveTool('offset') },
          { l: 'Trim Entity', ic: 'trim', a: () => setActiveTool('trim') },
          { l: 'Fillet Corner', ic: 'fillet', a: () => setActiveTool('fillet') },
          '-',
          { h: 'Layers, Compare & Export' },
          { l: 'Pre-Compare DXF Layer Selector...', ic: 'tabCompare', a: () => window.showDXFPreCompareModal && window.showDXFPreCompareModal() },
          { l: 'World View', ic: 'globe', a: () => window.toggleWorldView && window.toggleWorldView() },
          { l: 'Zoom Extents', ic: 'fit', a: () => zoomExtents() },
          { l: 'Save Modified AutoCAD .dxf', ic: 'save', k: 'Ctrl+S', a: () => saveModifiedDXFFile() },
          { l: 'Export Vector SVG (.svg)', ic: 'dxfOut', a: () => exportDXFStudioSVG() },
          { l: 'Send to PDF Studio', ic: 'pdfStudio', a: () => sendDXFToPDFStudio() }
        );
        window.showCtx(e.clientX, e.clientY, items);
      });

      const getCanvasXY = (ev, cachedRect = null) => {
        const r = cachedRect || cv.getBoundingClientRect();
        const scaleX = cv.width / Math.max(1, r.width);
        const scaleY = cv.height / Math.max(1, r.height);
        return [(ev.clientX - r.left) * scaleX, (ev.clientY - r.top) * scaleY, r];
      };
      cv.addEventListener('pointerdown', e => {
        const [sx, sy] = getCanvasXY(e);
        const rawW = screenToWorld(sx, sy, cv.height);
        const snappedW = applyOrthoAndSnap(rawW);

        // 3D Orbit tool or Alt+LeftDrag or Shift+MiddleDrag -> Interactive 3D Free Orbit
        if (StudioState.activeTool === 'orbit' || (e.altKey && e.button === 0) || (e.shiftKey && e.button === 1)) {
          StudioState.orbitDrag = {
            startX: e.clientX,
            startY: e.clientY,
            origYaw: StudioState.yaw || 0,
            origPitch: StudioState.pitch || 0
          };
          if (StudioState.visualStyle === '2d') StudioState.visualStyle = '3d_shaded';
          cv.setPointerCapture(e.pointerId);
          return;
        }

        // Middle mouse or Pan tool -> Pan
        if (e.button === 1 || StudioState.activeTool === 'pan' || (e.button === 0 && e.spaceKey)) {
          StudioState.panDrag = { startX: e.clientX, startY: e.clientY, origPanX: StudioState.panX, origPanY: StudioState.panY };
          cv.setPointerCapture(e.pointerId);
          return;
        }
        if (e.button !== 0) return;

        const isDrawTool = ['line', 'polyline', 'rect', 'polygon', 'donut', 'revcloud', 'box3d', 'xline', 'circle', 'arc', 'ellipse', 'spline', 'hatch', 'point', 'text', 'dim', 'dimang', 'dimrad', 'dimdia', 'leader', 'insert'].includes(StudioState.activeTool);
        const parser = ensureActiveParser(isDrawTool);
        if (!parser) return;

        if (StudioState.activeTool === 'select') {
          // 1. Check if clicking an active blue grip handle
          if (StudioState.selectedIds.size > 0 && StudioState.selectedIds.size <= 40) {
            for (const ent of parser.entities) {
              if (!StudioState.selectedIds.has(ent._id)) continue;
              const grips = getEntityGrips(ent);
              for (const g of grips) {
                const sp = worldToScreen(g.x, g.y, cv.height);
                if (Math.hypot(sx - sp.x, sy - sp.y) <= 8) {
                  if (isLayerLocked(parser, ent.layer)) {
                    toast(`Layer "${ent.layer}" is LOCKED. Unlock it to edit vertex grips.`);
                    return;
                  }
                  pushUndoSnapshot(`Grip Edit ${ent.type}`);
                  StudioState.activeGrip = g;
                  cv.setPointerCapture(e.pointerId);
                  return;
                }
              }
            }
          }

          // 2. Check entity hit at cursor
          const hit = findEntityAt(rawW.x, rawW.y);
          if (hit) {
            if (e.shiftKey) {
              if (StudioState.selectedIds.has(hit._id)) StudioState.selectedIds.delete(hit._id);
              else StudioState.selectedIds.add(hit._id);
              StudioState.selectedSubIndex = null;
            } else {
              StudioState.selectedIds = new Set([hit._id]);
              StudioState.selectedSubIndex = StudioState.lastHitSub && StudioState.lastHitSub.entId === hit._id ? { ...StudioState.lastHitSub } : null;
            }
            refreshAllUI();
            return;
          }

          // 3. Start Window / Crossing Selection Box
          if (!e.shiftKey) { StudioState.selectedIds.clear(); StudioState.selectedSubIndex = null; }
          StudioState.dragBox = { x0: sx, y0: sy, x1: sx, y1: sy, crossing: false };
          cv.setPointerCapture(e.pointerId);
          refreshAllUI();
          return;
        }

        // Drawing or Modify Tool Click
        handleCanvasClickPoint(snappedW);
      });

      let _hovRaf = 0, _stRaf = 0;
      const scheduleStatusBar = () => {
        if (_stRaf) return;
        if (typeof requestAnimationFrame === 'function') {
          _stRaf = requestAnimationFrame(() => { _stRaf = 0; updateStatusBar(); });
        } else {
          updateStatusBar();
        }
      };
      cv.addEventListener('pointermove', e => {
        const [sx, sy] = getCanvasXY(e, (StudioState.panDrag && StudioState.panDrag.rect) ? StudioState.panDrag.rect : null);
        const rawW = screenToWorld(sx, sy, cv.height);

        if (StudioState.orbitDrag) {
          const dx = e.clientX - StudioState.orbitDrag.startX;
          const dy = e.clientY - StudioState.orbitDrag.startY;
          StudioState.viewPreset = 'orbit';
          StudioState.yaw = ((StudioState.orbitDrag.origYaw + dx * 0.65) % 360);
          StudioState.pitch = Math.max(-89, Math.min(89, StudioState.orbitDrag.origPitch + dy * 0.55));
          syncViewCubeControls();
          scheduleRenderCanvas();
          scheduleStatusBar();
          return;
        }
        if (StudioState.panDrag) {
          const dx = e.clientX - StudioState.panDrag.startX;
          const dy = e.clientY - StudioState.panDrag.startY;
          StudioState.panX = StudioState.panDrag.origPanX + dx;
          StudioState.panY = StudioState.panDrag.origPanY - dy;
          StudioState.cursorWorld = rawW;
          scheduleRenderCanvas();
          scheduleStatusBar();
          return;
        }

        if (StudioState.activeGrip) {
          StudioState.cursorWorld = applyOrthoAndSnap(rawW);
          applyGripDrag(StudioState.activeGrip, StudioState.cursorWorld.x, StudioState.cursorWorld.y);
          scheduleRenderCanvas();
          scheduleStatusBar();
          return;
        }

        if (StudioState.dragBox) {
          StudioState.cursorWorld = rawW;
          StudioState.dragBox.x1 = sx;
          StudioState.dragBox.y1 = sy;
          StudioState.dragBox.crossing = sx < StudioState.dragBox.x0;
          scheduleRenderCanvas();
          return;
        }

        if (StudioState.activeTool === 'select' || StudioState.activeTool === 'pan') {
          StudioState.cursorWorld = rawW;
          if (StudioState.snapPoint) {
            StudioState.snapPoint = null;
            scheduleRenderCanvas();
          }
          if (StudioState.activeTool === 'select' && !_hovRaf) {
            _hovRaf = requestAnimationFrame(() => {
              _hovRaf = 0;
              const hit = findEntityAt(StudioState.cursorWorld.x, StudioState.cursorWorld.y);
              const nextHov = hit ? hit._id : null;
              const nextSub = hit && StudioState.lastHitSub && StudioState.lastHitSub.entId === hit._id ? { ...StudioState.lastHitSub } : null;
              const prevSubIdx = StudioState.hoveredSubIndex ? StudioState.hoveredSubIndex.subIdx : -1;
              const nextSubIdx = nextSub ? nextSub.subIdx : -1;
              if (nextHov !== StudioState.hoveredId || prevSubIdx !== nextSubIdx) {
                StudioState.hoveredId = nextHov;
                StudioState.hoveredSubIndex = nextSub;
                scheduleRenderCanvas();
              }
            });
          }
        } else {
          StudioState.cursorWorld = applyOrthoAndSnap(rawW);
          scheduleRenderCanvas();
        }
        scheduleStatusBar();
      });

      cv.addEventListener('pointerup', () => {
        if (StudioState.orbitDrag) {
          StudioState.orbitDrag = null;
          return;
        }
        if (StudioState.panDrag) {
          StudioState.panDrag = null;
          return;
        }
        if (StudioState.activeGrip) {
          StudioState.activeGrip = null;
          syncParserMutation();
          refreshAllUI();
          return;
        }
        if (StudioState.dragBox) {
          const b = StudioState.dragBox;
          StudioState.dragBox = null;
          if (Math.hypot(b.x1 - b.x0, b.y1 - b.y0) > 4) {
            const w0 = screenToWorld(Math.min(b.x0, b.x1), Math.max(b.y0, b.y1), cv.height);
            const w1 = screenToWorld(Math.max(b.x0, b.x1), Math.min(b.y0, b.y1), cv.height);
            const parser = getActiveParser();
            if (parser) {
              for (const ent of parser.entities) {
                if (!isLayerVisible(parser, ent.layer)) continue;
                const eb = DXFEngine.getDXFEntityBBox(ent, parser.blocks);
                if (!eb || !isFinite(eb.minX)) continue;
                const inside = eb.minX >= w0.x && eb.maxX <= w1.x && eb.minY >= w0.y && eb.maxY <= w1.y;
                const aabbOverlap = eb.maxX >= w0.x && eb.minX <= w1.x && eb.maxY >= w0.y && eb.minY <= w1.y;
                let crossingHit = false;
                if (!inside && b.crossing && aabbOverlap) {
                  const ptInBox = (px, py) => px >= w0.x && px <= w1.x && py >= w0.y && py <= w1.y;
                  const segHitsBox = (x1, y1, x2, y2) => {
                    if (ptInBox(x1, y1) || ptInBox(x2, y2)) return true;
                    return !!(
                      lineLineIntersection(x1, y1, x2, y2, w0.x, w0.y, w1.x, w0.y, false) ||
                      lineLineIntersection(x1, y1, x2, y2, w1.x, w0.y, w1.x, w1.y, false) ||
                      lineLineIntersection(x1, y1, x2, y2, w1.x, w1.y, w0.x, w1.y, false) ||
                      lineLineIntersection(x1, y1, x2, y2, w0.x, w1.y, w0.x, w0.y, false)
                    );
                  };
                  const segs = (typeof DXFEngine !== 'undefined' && DXFEngine.extractEntityPrimitiveSegments)
                    ? DXFEngine.extractEntityPrimitiveSegments(ent, parser)
                    : [];
                  if (segs.length > 0) {
                    for (const s of segs) {
                      if (s.type === 'LINE' && segHitsBox(s.x1, s.y1, s.x2, s.y2)) { crossingHit = true; break; }
                      if (s.type === 'ARC') {
                        const steps = 24;
                        let sA = s.startAngle || 0, eA = s.endAngle != null ? s.endAngle : 360;
                        if (eA <= sA) eA += 360;
                        for (let k = 0; k < steps; k++) {
                          const r1 = ((sA + (eA - sA) * (k / steps)) * Math.PI) / 180;
                          const r2 = ((sA + (eA - sA) * ((k + 1) / steps)) * Math.PI) / 180;
                          if (segHitsBox(s.cx + s.r * Math.cos(r1), s.cy + s.r * Math.sin(r1), s.cx + s.r * Math.cos(r2), s.cy + s.r * Math.sin(r2))) {
                            crossingHit = true; break;
                          }
                        }
                        if (crossingHit) break;
                      }
                    }
                  } else {
                    crossingHit = aabbOverlap;
                  }
                }
                if (inside || crossingHit) {
                  StudioState.selectedIds.add(ent._id);
                }
              }
            }
          }
          refreshAllUI();
        }
      });

      cv.addEventListener('dblclick', async e => {
        if (['polyline', 'spline', 'hatch'].includes(StudioState.activeTool)) {
          e.preventDefault();
          finishMultiVertexTool(StudioState.activeTool === 'hatch');
          return;
        }
        const rect = cv.getBoundingClientRect();
        const scaleX = rect.width > 0 ? (cv.width / rect.width) : 1;
        const scaleY = rect.height > 0 ? (cv.height / rect.height) : 1;
        const rawW = screenToWorld((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY, cv.height);
        const hit = findEntityAt(rawW.x, rawW.y);
        const parser = getActiveParser();
        if (hit && parser && (hit.type === 'TEXT' || hit.type === 'DIMENSION') && window.dialog) {
          if (isLayerLocked(parser, hit.layer)) return toast(`Layer "${hit.layer}" is LOCKED.`);
          const r = await window.dialog(`Edit ${hit.type} String`, [
            { type: 'text', id: 'txt', label: 'Text Content', value: hit.text || '' }
          ], 'Update');
          if (r && r.txt != null) {
            pushUndoSnapshot(`Edit ${hit.type} Text`);
            hit.text = r.txt;
            syncParserMutation();
            refreshAllUI();
          }
        }
      });

      cv.addEventListener('wheel', e => {
        e.preventDefault();
        const rect = cv.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const before = screenToWorld(mx, my, cv.height);
        const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
        StudioState.zoom = Math.max(1e-6, Math.min(1e6, StudioState.zoom * factor));
        StudioState.panX = mx - before.x * StudioState.zoom;
        StudioState.panY = (cv.height - my) - before.y * StudioState.zoom;
        scheduleRenderCanvas();
        updateStatusBar();
      }, { passive: false });
    }

    // Keyboard shortcuts when in DXF Studio view
    window.addEventListener('keydown', e => {
      if (document.body.dataset.view !== 'dxf') return;
      const tag = (document.activeElement || {}).tagName || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;

      const kLow = e.key.toLowerCase();
      if (e.key === 'Escape') {
        StudioState.tempPoints = [];
        StudioState.selectedIds.clear();
        setActiveTool('select');
        refreshAllUI();
      } else if (e.key === 'Enter') {
        if (StudioState.activeTool && StudioState.activeTool !== 'select') {
          e.preventDefault();
          toolDone(StudioState.activeTool === 'hatch');
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (StudioState.selectedIds.size > 0) {
          e.preventDefault();
          deleteSelectedEntities();
        }
      } else if (e.key === 'F7') {
        e.preventDefault();
        StudioState.gridEnabled = !StudioState.gridEnabled;
        renderCanvas(); updateStatusBar();
      } else if (e.key === 'F8') {
        e.preventDefault();
        StudioState.orthoEnabled = !StudioState.orthoEnabled;
        updateStatusBar();
      } else if (e.key === 'F10') {
        e.preventDefault();
        StudioState.polarEnabled = !StudioState.polarEnabled;
        updateStatusBar();
      } else if (e.key === 'F3') {
        e.preventDefault();
        StudioState.osnapEnabled = !StudioState.osnapEnabled;
        renderCanvas(); updateStatusBar();
      } else if ((e.ctrlKey || e.metaKey) && kLow === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && kLow === 'y') {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && kLow === 's') {
        e.preventDefault();
        saveModifiedDXFFile();
      } else if ((e.ctrlKey || e.metaKey) && kLow === 'a') {
        e.preventDefault();
        const p = getActiveParser();
        if (p) {
          StudioState.selectedIds = new Set(p.entities.filter(en => isLayerVisible(p, en.layer) && !isLayerLocked(p, en.layer)).map(en => en._id));
          refreshAllUI();
        }
      } else if ((e.ctrlKey || e.metaKey) && kLow === 'd') {
        e.preventDefault();
        duplicateSelectedEntities(10, 10);
      } else if ((e.ctrlKey || e.metaKey) && kLow === 'c') {
        const p = getActiveParser();
        if (p && StudioState.selectedIds.size > 0) {
          StudioState.clipboardEntities = p.entities.filter(en => StudioState.selectedIds.has(en._id)).map(en => cloneEntity(en));
          toast(`Copied ${StudioState.clipboardEntities.length} CAD entity(s).`);
        }
      } else if ((e.ctrlKey || e.metaKey) && kLow === 'v') {
        const p = getActiveParser();
        if (p && StudioState.clipboardEntities.length > 0) {
          pushUndoSnapshot('Paste Entities');
          const newIds = new Set();
          for (const ce of StudioState.clipboardEntities) {
            const copy = cloneEntity(ce);
            translateEntity(copy, 12, 12);
            p.entities.push(copy);
            newIds.add(copy._id);
          }
          StudioState.selectedIds = newIds;
          syncParserMutation();
          refreshAllUI();
          toast(`Pasted ${newIds.size} CAD entity(s).`);
        }
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        // Single-key CAD tool hotkeys in DXF Studio
        const quickMap = {
          v: 'select', h: 'pan', l: 'line', p: 'polyline', b: 'rect',
          c: 'circle', a: 'arc', t: 'text', d: 'dim', i: 'insert',
          m: 'move', o: 'offset', f: 'fillet', r: 'rotate', s: 'scale'
        };
        if (quickMap[kLow]) {
          e.preventDefault();
          setActiveTool(quickMap[kLow]);
        } else if (kLow === 'e') {
          e.preventDefault();
          deleteSelectedEntities();
        } else if (kLow === 'x') {
          e.preventDefault();
          explodeSelectedEntities();
        } else if (kLow === 'z') {
          e.preventDefault();
          zoomExtents();
        }
      }
    });

    if (typeof ResizeObserver !== 'undefined' && $('#dxf-canvas-wrap')) {
      let _dxfRoW = 0, _dxfRoH = 0;
      new ResizeObserver(entries => {
        for (const en of entries) {
          const w = Math.round(en.contentRect.width), h = Math.round(en.contentRect.height);
          if (w > 0 && h > 0 && (Math.abs(w - _dxfRoW) > 1 || Math.abs(h - _dxfRoH) > 1)) {
            _dxfRoW = w; _dxfRoH = h;
            if (document.body.dataset.view === 'dxf') scheduleRenderCanvas();
          }
        }
      }).observe($('#dxf-canvas-wrap'));
    }
  }

  function onShow() {
    init();
    if (typeof window !== 'undefined' && typeof window.syncCompareColorUI === 'function') {
      window.syncCompareColorUI();
    }
    if (typeof window !== 'undefined' && window.KenshoDockManager && typeof window.KenshoDockManager.initDXFStudioDocking === 'function') {
      window.KenshoDockManager.initDXFStudioDocking();
    }
    const parser = ensureActiveParser(false);
    refreshAllUI();
    if (typeof window !== 'undefined' && typeof window.applyWorkspaceLanguage === 'function') {
      const savedLang = (document.getElementById('rp-lang-sel') && document.getElementById('rp-lang-sel').value) || 'en';
      if (savedLang && savedLang !== 'en') window.applyWorkspaceLanguage(savedLang, true);
    }
    setTimeout(() => {
      const cv = $('#dxf-canvas');
      if (cv && (!cv.width || StudioState._needsZoomExtents || StudioState._fittedParserRef !== parser)) {
        zoomExtents();
      } else {
        renderCanvas();
      }
    }, 25);
  }

  function syncFromDXFState() {
    if (!StudioState.initialized) return;
    const ds = getDXFState();
    if (ds) {
      if (ds.parsedA && !ds.parsedB) {
        StudioState.activeSlot = 'A';
        StudioState.viewMode = 'single';
        if ($('#dxf-st-slot-sel')) $('#dxf-st-slot-sel').value = 'A';
      } else if (ds.parsedB && !ds.parsedA) {
        StudioState.activeSlot = 'B';
        StudioState.viewMode = 'single';
        if ($('#dxf-st-slot-sel')) $('#dxf-st-slot-sel').value = 'B';
      }
    }
    StudioState._needsZoomExtents = true;
    const host = $('#view-dxf');
    if (host && !host.hidden) {
      refreshAllUI();
      zoomExtents();
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  return {
    StudioState,
    VIEW_PRESETS,
    BUILTIN_CAD_BLOCKS,
    init,
    onShow,
    renderCanvas,
    syncFromDXFState,
    createNewBlankDXF,
    setActiveTool,
    setViewPreset,
    setViewAngles,
    setVisualStyle,
    project3DPoint,
    worldToScreen,
    screenToWorld,
    executeCommandLine,
    zoomExtents,
    getEntityGrips,
    applyGripDrag,
    applyOrthoAndSnap,
    chamferTwoLines,
    createRegularPolygon,
    createDonutEntity,
    createRevisionCloud,
    create3DBoxEntity,
    arrayRectSelectedEntities,
    arrayPolarSelectedEntities,
    joinSelectedEntities,
    overkillDuplicateEntities,
    breakEntityAtPoint,
    lengthenSelectedEntities,
    moveSelectionToOrigin,
    purgeUnusedLayersAndZeroEntities,
    computeSelectionAreaAndLength,
    setHighlightBoxMils,
    toggleDiffBoxes,
    trimMemory,
    deleteSelectedEntities,
    duplicateSelectedEntities,
    explodeSelectedEntities,
    saveModifiedDXFFile,
    exportDXFStudioSVG,
    exportDXFStudioPNG,
    sendDXFToPDFStudio,
    syncToPDFStudioIfNeeded: async function() {
      const ds = getDXFState();
      if (!ds || !ds._loadedInPdfStudio || !ds._pdfDirty) return false;
      const parser = getActiveParser();
      if (!parser || typeof parser.toVectorPDFBytes !== 'function') return false;
      try {
        ds._pdfDirty = false;
        const pdfBytes = await parser.toVectorPDFBytes({
          background: '#ffffff',
          lineWidth: 1.4,
          showGrid: false,
          hiddenLayers: new Set([...ds.hiddenLayers, ...ds.frozenLayers])
        });
        const rawName = (StudioState.activeSlot === 'A' ? ds.nameA : ds.nameB) || 'Drawing.dxf';
        if (typeof window !== 'undefined' && window.RE && window.RE.openBytes && pdfBytes) {
          await window.RE.openBytes(pdfBytes, rawName.replace(/\.dxf$/i, '.pdf'), '');
          return true;
        }
      } catch (_e) {}
      return false;
    },
    handleDroppedFiles,
    registerDXFDocTab,
    switchDXFDocTab,
    closeDXFDocTab,
    readDXFFileEntry,
    executeCommandLine,
    translateEntity,
    rotateEntity,
    scaleEntity,
    mirrorEntity,
    createBlockFromSelection,
    divideSelectedEntities,
    listSelectedEntitiesInfo,
    regenDrawing,
    isolateSelectedLayer,
    unisolateLayers,
    quickSelectEntities,
    findAndReplaceDXFText,
    exportDXFBOMCSV,
    createTriangleEntity,
    resizeTriangleEntity,
    resizeRectEntity,
    detectShapeKind,
    setActiveLineweight,
    setDefaultThickness,
    generateBoltCirclePattern,
    insertMechanicalTitleBlock,
    toolDone,
    toolCancel,
    toolRewind,
    toolOff,
    undo,
    redo,
    refreshAllUI
  };
});
