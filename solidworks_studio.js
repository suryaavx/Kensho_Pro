/* ============================================================================
 * [MODULE: KENSHO PRO SOLIDWORKS 3D / STEP STUDIO (solidworks_studio.js)]
 * Full SolidWorks-style 3D CAD Workspace inside CAD Studio:
 *   - Interactive 3D Viewport (Shaded+Edges, Shaded, HLR, Wireframe, Orbit/Pan/Zoom)
 *   - SolidWorks FeatureManager Design Tree (Parts, Bodies, Planes, Holes)
 *   - PropertyManager & Mass Properties (BBox, Volume, Surface Area, Material Mass)
 *   - Section View (X/Y/Z Live Clipping), Exploded View, 3D Measure
 *   - Make 2D Drawing (STEP -> AutoCAD DXF) & 3D STEP vs. STEP Compare
 * ============================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SolidWorksStudio = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SWState = {
    mounted: false,
    active: false,
    doc: null,
    showCoM: true,
    useOpenGL: true,
    showFpsHud: true,
    colorMode: 'native', // 'native' | 'material' | 'custom' | 'per_body'
    customColor: '#3b82f6',
    colorRev: 0,
    modelA: null,
    modelB: null,
    diff3D: null,
    compareMode: false,
    displayMode: 'shaded_edges', // 'shaded_edges' | 'shaded' | 'hlr' | 'wireframe'
    material: 'Aluminum 6061-T6',
    yaw: -Math.PI / 4,
    pitch: 0.58,
    zoom: 1.0,
    panX: 0,
    panY: 0,
    sectionAxis: 'none', // 'none' | 'x' | 'y' | 'z'
    sectionRatio: 0.5,
    explodeFactor: 0,
    showPlanes: true,
    measureMode: false,
    measurePts: [],
    selectedBodyId: null,
    selectedFeatureId: null,
    undoStack: [],
    redoStack: [],
    background: '#0c111a',
    openTabs: [],
    activeTabId: null
  };

  const VIEW_ANGLES = {
    iso: { yaw: -Math.PI / 4, pitch: 0.58 },
    trimetric: { yaw: -0.62, pitch: 0.44 },
    front: { yaw: 0, pitch: 0 },
    back: { yaw: Math.PI, pitch: 0 },
    right: { yaw: -Math.PI / 2, pitch: 0 },
    left: { yaw: Math.PI / 2, pitch: 0 },
    top: { yaw: 0, pitch: Math.PI / 2 - 0.001 },
    bottom: { yaw: 0, pitch: -Math.PI / 2 + 0.001 }
  };

  const $ = s => (typeof document !== 'undefined' ? document.querySelector(s) : null);
  const getEngine = () => (typeof CAD3DEngine !== 'undefined' ? CAD3DEngine : (typeof window !== 'undefined' ? window.CAD3DEngine : null));
  const getKernel = () => (typeof CADKernel !== 'undefined' ? CADKernel : (typeof window !== 'undefined' && window.CADKernel ? window.CADKernel : (typeof require === 'function' ? (() => { try { return require('./cad_kernel.js'); } catch (_e) { return null; } })() : null)));

  function ensureParametricDoc() {
    const K = getKernel();
    if (!K) return null;
    if (!SWState.doc) {
      SWState.doc = K.createSampleParametricPart();
      SWState.modelA = SWState.doc.toModelObject();
    }
    return SWState.doc;
  }

  function syncDocToViewport(msg = '') {
    if (!SWState.doc) return;
    SWState.doc.material = SWState.material;
    SWState.modelA = SWState.doc.rebuild();
    SWState.compareMode = false;
    refreshSW();
    if (msg) toast(msg);
  }

  function pushSWUndo() {
    if (!SWState.doc) return;
    SWState.undoStack.push(SWState.doc.serialize());
    if (SWState.undoStack.length > 40) SWState.undoStack.shift();
    SWState.redoStack = [];
  }

  function undoSW() {
    const K = getKernel();
    if (!K || !SWState.undoStack.length) { toast('Nothing to undo in SolidWorks 3D.'); return false; }
    if (SWState.doc) SWState.redoStack.push(SWState.doc.serialize());
    SWState.doc = K.CADDocument.deserialize(SWState.undoStack.pop());
    SWState.modelA = SWState.doc.toModelObject();
    refreshSW();
    toast('Undid last parametric SolidWorks edit.');
    return true;
  }

  function redoSW() {
    const K = getKernel();
    if (!K || !SWState.redoStack.length) { toast('Nothing to redo in SolidWorks 3D.'); return false; }
    if (SWState.doc) SWState.undoStack.push(SWState.doc.serialize());
    SWState.doc = K.CADDocument.deserialize(SWState.redoStack.pop());
    SWState.modelA = SWState.doc.toModelObject();
    refreshSW();
    toast('Redid parametric SolidWorks edit.');
    return true;
  }

  function editFeatureParams(featureId, patchParams = {}, newName = null) {
    if (!SWState.doc || !featureId) return null;
    const f = SWState.doc.features.find(x => x.id === featureId);
    if (!f) return null;
    pushSWUndo();
    if (newName && String(newName).trim()) f.name = String(newName).trim();
    const updated = SWState.doc.updateFeature(featureId, patchParams);
    SWState.selectedFeatureId = featureId;
    syncDocToViewport(`Updated ${f.name} & rebuilt 3D solid`);
    return updated;
  }

  function runSolidWorksFeature(type, params = {}, label = '') {
    const K = getKernel();
    if (!K) return null;
    if (!SWState.doc) SWState.doc = new K.CADDocument('Part1');
    pushSWUndo();
    const feat = SWState.doc.addFeature({ type, name: label || `${type}_${SWState.doc.features.length + 1}`, params });
    SWState.selectedFeatureId = feat.id;
    syncDocToViewport(`Added ${feat.name} — edit dimensions & hole sizes in PropertyManager →`);
    return feat;
  }

  function toggle3DMeasureMode() {
    SWState.measureMode = !SWState.measureMode;
    SWState.measurePts = [];
    const btn = $('#sw-measure-btn');
    if (btn) btn.classList.toggle('on', SWState.measureMode);
    render3DCanvas();
    toast(SWState.measureMode ? '3D Measure ON: Click two vertices on the 3D model to measure distance & ΔX/ΔY/ΔZ.' : '3D Measure OFF.');
    return SWState.measureMode;
  }

  function pickNearest3DVertex(clientX, clientY) {
    const cv = $('#sw-canvas');
    const model = SWState.modelA;
    if (!cv || !model || !model.stats) return null;
    const rect = cv.getBoundingClientRect();
    const dpr = cv.width / Math.max(1, rect.width);
    const sx = (clientX - rect.left) * dpr;
    const sy = (clientY - rect.top) * dpr;
    const stats = model.stats;
    const span = Math.max(1e-3, Math.hypot(stats.sizeX, stats.sizeY, stats.sizeZ));
    const effScale = ((Math.min(cv.width, cv.height) * 0.62) / span) * SWState.zoom;
    let bestPt = null, bestD = 26 * dpr;
    for (const b of model.bodies) {
      if (b.visible === false) continue;
      for (const ed of (b.edges || [])) {
        for (const rawP of (ed.pts || [])) {
          const p = getExplodedPoint(rawP, b.center, stats.center);
          const pr = projectPoint3D(p, stats.center, effScale, cv.width, cv.height, SWState.yaw, SWState.pitch, SWState.panX * dpr, SWState.panY * dpr);
          const d = Math.hypot(pr.sx - sx, pr.sy - sy);
          if (d < bestD) { bestD = d; bestPt = p; }
        }
      }
    }
    return bestPt;
  }

  async function export3DSnapshotPNG() {
    const cv = $('#sw-canvas');
    if (!cv || !cv.width) return null;
    render3DCanvas();
    const dataUrl = cv.toDataURL('image/png');
    const bin = atob((dataUrl.split(',')[1]) || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const base = String((SWState.modelA && SWState.modelA.fileName) || 'SolidWorks_View').replace(/\.[^.]+$/, '');
    if (typeof window !== 'undefined' && window.native && window.native.saveFile) {
      const saved = await window.native.saveFile({ name: `${base}_3D.png`, bytes, filters: [{ name: 'PNG Image (.png)', extensions: ['png'] }] });
      if (saved) toast(`Saved 3D Snapshot PNG: ${saved}`);
      return saved;
    }
    return bytes;
  }

  function applyQuickMate(type = 'COINCIDENT', distance = 0) {
    if (!SWState.doc || SWState.doc.bodies.length < 2) {
      toast('Mate requires at least 2 solid bodies in the FeatureManager tree.');
      return false;
    }
    const solids = SWState.doc.bodies.filter(b => !b.isCutVolume);
    if (solids.length < 2) {
      toast('Add a second solid body (+ Boss or Revolve) before applying a Mate.');
      return false;
    }
    const bA = solids[solids.length - 2].name;
    const bB = solids[solids.length - 1].name;
    pushSWUndo();
    SWState.doc.addMate({ type, bodyA: bA, bodyB: bB, distance });
    syncDocToViewport(`Applied ${type} Mate between ${bA} & ${bB}`);
    return true;
  }

  async function exportCurrentModel(fmt = 'step') {
    const K = getKernel();
    const target = SWState.doc || SWState.modelA;
    if (!K || !target) { toast('Create or open a 3D part first.'); return null; }
    const base = String(target.name || target.fileName || 'KenshoPart').replace(/\.[^.]+$/, '');
    let outName = `${base}.${fmt}`, bytes = null, filterName = 'STEP AP214 (.step)', ext = fmt;
    if (fmt === 'step') {
      bytes = new TextEncoder().encode(K.exportToSTEP(target));
    } else if (fmt === 'stl') {
      bytes = K.exportToBinarySTL(target);
      filterName = 'Binary STL (.stl)';
    } else if (fmt === 'obj') {
      bytes = new TextEncoder().encode(K.exportToOBJ(target));
      filterName = 'Wavefront OBJ (.obj)';
    } else if (fmt === 'kensho3d' && SWState.doc) {
      bytes = new TextEncoder().encode(SWState.doc.serialize());
      filterName = 'KenshoPro Parametric Part (.kensho3d)';
    } else if (fmt === 'dxf' || fmt === 'dxf_top' || fmt === 'dxf_front' || fmt === 'dxf_right' || fmt === 'dxf_iso') {
      const eng = getEngine();
      let dxfStr = '';
      if (fmt === 'dxf') {
        dxfStr = K.exportMultiViewDrawingDXF(target);
        outName = `${base}.dxf`;
      } else {
        const viewKey = fmt.replace('dxf_', '');
        const mdl = SWState.modelA || (SWState.doc && SWState.doc.toModelObject ? SWState.doc.toModelObject() : target);
        dxfStr = (eng && typeof eng.projectModelToDXF === 'function')
          ? eng.projectModelToDXF(mdl, viewKey)
          : K.exportMultiViewDrawingDXF(target);
        outName = `${base}_${viewKey}.dxf`;
      }
      bytes = new TextEncoder().encode(dxfStr);
      filterName = 'AutoCAD DXF Drawing (.dxf)';
      ext = 'dxf';
    } else if (fmt === 'dxf4') {
      const dxfStr = K.exportMultiViewDrawingDXF(target);
      if (typeof window !== 'undefined' && window.DXFStudio && typeof window.DXFStudio.handleDroppedFiles === 'function') {
        if (typeof window.setCADStudioMode === 'function') window.setCADStudioMode('2d');
        window.DXFStudio.handleDroppedFiles([{ name: `${base}_4View_Drawing.dxf`, text: dxfStr }], 'A');
        toast(`Generated 4-View SolidWorks 2D Engineering Drawing (${base}_4View_Drawing.dxf) in CAD Studio.`);
      }
      return dxfStr;
    }
    if (bytes && typeof window !== 'undefined' && window.native && window.native.saveFile) {
      const saved = await window.native.saveFile({ name: outName, bytes, filters: [{ name: filterName, extensions: [ext] }] });
      if (saved) toast(`Exported ${outName}`);
      return saved;
    }
    return bytes;
  }

  function toast(msg) {
    if (typeof window !== 'undefined' && typeof window.rpToast === 'function') window.rpToast(msg);
    const stEl = $('#sw-status-msg');
    if (stEl) stEl.textContent = msg;
  }

  function hexToRgb(hex) {
    const h = String(hex || '#7c8ea6').replace('#', '');
    if (h.length !== 6) return [124, 142, 166];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function projectPoint3D(pt, center, scale, W, H, yaw, pitch, panX, panY) {
    const x = pt[0] - center[0];
    const y = pt[1] - center[1];
    const z = pt[2] - center[2];
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    // Rotate around Z (yaw) then X (pitch) — SolidWorks Z-up convention
    const x1 = x * cy - y * sy;
    const y1 = x * sy + y * cy;
    const z1 = z;
    const x2 = x1;
    const y2 = y1 * cp - z1 * sp;
    const z2 = y1 * sp + z1 * cp;
    return {
      sx: W * 0.5 + panX + x2 * scale,
      sy: H * 0.5 + panY - z2 * scale,
      depth: y2
    };
  }

  function isClippedBySection(pt, bounds) {
    if (SWState.sectionAxis === 'none' || !bounds) return false;
    const r = Math.max(0.02, Math.min(0.98, SWState.sectionRatio));
    if (SWState.sectionAxis === 'x') return pt[0] > bounds.minX + (bounds.maxX - bounds.minX) * r;
    if (SWState.sectionAxis === 'y') return pt[1] > bounds.minY + (bounds.maxY - bounds.minY) * r;
    if (SWState.sectionAxis === 'z') return pt[2] > bounds.minZ + (bounds.maxZ - bounds.minZ) * r;
    return false;
  }

  function getExplodedPoint(pt, bodyCenter, modelCenter) {
    if (!SWState.explodeFactor || !bodyCenter || !modelCenter) return pt;
    const f = SWState.explodeFactor;
    return [
      pt[0] + (bodyCenter[0] - modelCenter[0]) * f,
      pt[1] + (bodyCenter[1] - modelCenter[1]) * f,
      pt[2] + (bodyCenter[2] - modelCenter[2]) * f
    ];
  }

  function render3DCanvas() {
    const cv = $('#sw-canvas');
    if (!cv) return;
    const rect = cv.parentElement ? cv.parentElement.getBoundingClientRect() : { width: 900, height: 600 };
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(2, window.devicePixelRatio) : 1;
    const W = Math.max(300, Math.round(rect.width * dpr));
    const H = Math.max(200, Math.round(rect.height * dpr));
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const vpMain = $('#sw-viewport-main');
    const glCv = $('#sw-gl-canvas');
    const canUseDirectGL = !!(SWState.useOpenGL && !SWState.compareMode && glCv && typeof window !== 'undefined' && window.KenshoGPU);
    if (vpMain) {
      vpMain.style.background = SWState.background === '#ffffff'
        ? 'linear-gradient(180deg,#eef2f6 0%,#ffffff 100%)'
        : 'linear-gradient(180deg,#0d1522 0%,#162234 100%)';
    }
    if (canUseDirectGL) {
      ctx.clearRect(0, 0, W, H);
      glCv.style.display = 'block';
    } else {
      if (glCv) glCv.style.display = 'none';
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      if (SWState.background === '#ffffff') {
        grad.addColorStop(0, '#eef2f6');
        grad.addColorStop(1, '#ffffff');
      } else {
        grad.addColorStop(0, '#0d1522');
        grad.addColorStop(1, '#162234');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    const model = SWState.modelA;
    if (!model || !model.stats) {
      ctx.fillStyle = SWState.background === '#ffffff' ? '#475569' : '#94a3b8';
      ctx.font = `600 ${15 * dpr}px -apple-system, Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Open a SolidWorks (.sldprt / .sldasm) or STEP (.step / .stp) / STL / OBJ 3D File', W / 2, H / 2 - 12 * dpr);
      ctx.font = `400 ${12 * dpr}px -apple-system, Segoe UI, sans-serif`;
      ctx.fillText('Or click "Sample Bracket" in the SolidWorks ribbon to inspect & compare 3D STEP models', W / 2, H / 2 + 14 * dpr);
      return;
    }

    const stats = model.stats;
    const span = Math.max(1e-3, Math.hypot(stats.sizeX, stats.sizeY, stats.sizeZ));
    const baseScale = (Math.min(W, H) * 0.62) / span;
    const effScale = baseScale * SWState.zoom;
    const proj = pt => projectPoint3D(pt, stats.center, effScale, W, H, SWState.yaw, SWState.pitch, SWState.panX * dpr, SWState.panY * dpr);

    // Reference Origin Planes (subtle SolidWorks cyan/green/red guides)
    if (SWState.showPlanes) {
      const pSpan = span * 0.32;
      const o = stats.center;
      const drawAxis = (p2, col, lbl) => {
        const a = proj(o), b = proj(p2);
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.2 * dpr;
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = col;
        ctx.font = `700 ${10 * dpr}px monospace`;
        ctx.fillText(lbl, b.sx + 4 * dpr, b.sy);
        ctx.restore();
      };
      drawAxis([o[0] + pSpan, o[1], o[2]], 'rgba(255,42,75,0.65)', 'X');
      drawAxis([o[0], o[1] + pSpan, o[2]], 'rgba(34,197,94,0.65)', 'Y');
      drawAxis([o[0], o[1], o[2] + pSpan], 'rgba(0,240,255,0.65)', 'Z');
    }

    // 3D STEP vs STEP Revision Compare Overlay Mode
    if (SWState.compareMode && SWState.diff3D) {
      const drawSegList = (list, col, lw, alpha) => {
        ctx.save();
        ctx.strokeStyle = col;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = lw * dpr;
        ctx.beginPath();
        for (const seg of list) {
          if (isClippedBySection(seg.p1, stats.bounds) && isClippedBySection(seg.p2, stats.bounds)) continue;
          const a = proj(seg.p1), b = proj(seg.p2);
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
        }
        ctx.stroke();
        ctx.restore();
      };
      const isLight = SWState.background === '#ffffff';
      drawSegList(SWState.diff3D.commonEdges, isLight ? '#94a3b8' : '#475569', 1.0, 0.38);
      drawSegList(SWState.diff3D.removedEdges, isLight ? '#e11d48' : '#ff2a4b', 2.0, 1.0);
      drawSegList(SWState.diff3D.addedEdges, isLight ? '#0066ff' : '#00f0ff', 2.0, 1.0);
    } else {
      const tFrameStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const engForMat = getEngine();
      const matCol = (engForMat && engForMat.MATERIALS && engForMat.MATERIALS[SWState.material] && engForMat.MATERIALS[SWState.material].color) || '#94a3b8';
      const DISTINCT_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16'];
      const resolveBodyOverrideTint = (body, idx) => {
        if (SWState.selectedBodyId && SWState.selectedBodyId === body.id) return '#38bdf8';
        if (SWState.colorMode === 'custom') return SWState.customColor || '#3b82f6';
        if (SWState.colorMode === 'material') return matCol;
        if (SWState.colorMode === 'per_body') return DISTINCT_PALETTE[idx % DISTINCT_PALETTE.length];
        return null; // 'native' preserves real STEP COLOUR_RGB per-face & per-body colors
      };
      const visKey = `${model.fileName || ''}:${(model.bodies || []).length}:${(model.bodies || []).map(b => b.visible === false ? 0 : 1).join('')}:${SWState.selectedBodyId || ''}:${SWState.colorMode}:${SWState.customColor}:${SWState.material}:${SWState.colorRev}`;
      let visibleBodies;
      if (SWState._visBodiesCache && SWState._visBodiesCache.key === visKey && SWState._visBodiesCache.model === model) {
        visibleBodies = SWState._visBodiesCache.bodies;
      } else {
        visibleBodies = (model.bodies || []).filter(b => b.visible !== false).map((b, idx) => {
          const tint = resolveBodyOverrideTint(b, idx);
          if (!tint) return b;
          return { ...b, color: tint, triangles: (b.triangles || []).map(t => ({ ...t, color: tint })) };
        });
        SWState._visBodiesCache = { key: visKey, model, bodies: visibleBodies };
      }

      let renderedByGL = false;
      if (SWState.useOpenGL && typeof window !== 'undefined' && window.KenshoGPU && typeof window.KenshoGPU.renderSolidWorksMeshGL === 'function') {
        const bnd = stats.bounds || { minX: -50, maxX: 50, minY: -50, maxY: 50, minZ: -50, maxZ: 50 };
        const secCut = SWState.sectionAxis === 'x' ? (bnd.minX + (bnd.maxX - bnd.minX) * SWState.sectionRatio)
          : (SWState.sectionAxis === 'y' ? (bnd.minY + (bnd.maxY - bnd.minY) * SWState.sectionRatio)
          : (SWState.sectionAxis === 'z' ? (bnd.minZ + (bnd.maxZ - bnd.minZ) * SWState.sectionRatio) : 0));
        renderedByGL = !!window.KenshoGPU.renderSolidWorksMeshGL(ctx, W, H, {
          glCanvas: glCv,
          bodies: visibleBodies,
          center: stats.center,
          scale: effScale,
          radius: span * 0.65,
          explodeFactor: SWState.explodeFactor || 0,
          panX: SWState.panX * dpr,
          panY: SWState.panY * dpr,
          yaw: SWState.yaw,
          pitch: SWState.pitch,
          displayMode: SWState.displayMode,
          sectionAxis: SWState.sectionAxis,
          sectionCut: secCut,
          overrideTint: null,
          alpha: 1.0,
          colorRev: SWState.colorRev,
          isLightBg: SWState.background === '#ffffff'
        });
      }
      // Painter's algorithm shaded triangles (fallback when OpenGL is off or exploded)
      if (!renderedByGL && (SWState.displayMode === 'shaded_edges' || SWState.displayMode === 'shaded')) {
        const lightDir = [0.42, -0.58, 0.70];
        const drawList = [];
        for (const body of visibleBodies) {
          const isSel = SWState.selectedBodyId === body.id;
          for (const tri of (body.triangles || [])) {
            const pa = getExplodedPoint(tri.a, body.center, stats.center);
            const pb = getExplodedPoint(tri.b, body.center, stats.center);
            const pc = getExplodedPoint(tri.c, body.center, stats.center);
            const mid = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3];
            if (isClippedBySection(mid, stats.bounds)) continue;
            const pA = proj(pa), pB = proj(pb), pC = proj(pc);
            const avgDepth = (pA.depth + pB.depth + pC.depth) / 3;
            const n = tri.n || [0, 0, 1];
            const ndl = Math.abs(n[0] * lightDir[0] + n[1] * lightDir[1] + n[2] * lightDir[2]);
            const shade = 0.36 + 0.64 * Math.min(1, ndl);
            const rgb = hexToRgb(isSel ? '#38bdf8' : (tri.color || body.color || '#7c8ea6'));
            drawList.push({
              depth: avgDepth,
              pA, pB, pC,
              fill: `rgb(${Math.round(rgb[0] * shade)},${Math.round(rgb[1] * shade)},${Math.round(rgb[2] * shade)})`
            });
          }
        }
        drawList.sort((u, v) => v.depth - u.depth);
        for (const item of drawList) {
          ctx.fillStyle = item.fill;
          ctx.beginPath();
          ctx.moveTo(item.pA.sx, item.pA.sy);
          ctx.lineTo(item.pB.sx, item.pB.sy);
          ctx.lineTo(item.pC.sx, item.pC.sy);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Update live GPU & FPS HUD readout
      const fpsHud = $('#sw-fps-hud');
      if (fpsHud) {
        fpsHud.hidden = !SWState.showFpsHud;
        if (SWState.showFpsHud) {
          if (renderedByGL && window.KenshoGPU && typeof window.KenshoGPU.getStats === 'function') {
            const st = window.KenshoGPU.getStats();
            const gpuLabel = (st.renderer && st.renderer.length > 28) ? st.renderer.slice(0, 28) + '…' : (st.renderer || st.backend);
            fpsHud.textContent = `OpenGL GPU · ${st.fps} FPS (${st.frameMs} ms) · ${st.triCount} tris · ${gpuLabel}`;
          } else {
            const dtMs = Math.max(0.1, ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - tFrameStart);
            const estFps = Math.min(120, Math.round(1000 / dtMs));
            const triTotal = visibleBodies.reduce((s, b) => s + (b.triangles ? b.triangles.length : 0), 0);
            fpsHud.textContent = `Canvas2D · ${estFps} FPS (${dtMs.toFixed(1)} ms) · ${triTotal} tris`;
          }
        }
      }

      // Crisp B-Rep edges (Canvas 2D fallback only — OpenGL already renders depth-tested edges)
      if (!renderedByGL && SWState.displayMode !== 'shaded') {
        ctx.save();
        ctx.strokeStyle = SWState.background === '#ffffff' ? '#0f172a' : (SWState.displayMode === 'wireframe' ? '#38bdf8' : '#e2e8f0');
        ctx.lineWidth = (SWState.displayMode === 'wireframe' ? 1.15 : 1.05) * dpr;
        ctx.beginPath();
        for (const body of model.bodies) {
          if (body.visible === false) continue;
          for (const ed of (body.edges || [])) {
            const pts = ed.pts || [];
            for (let i = 1; i < pts.length; i++) {
              const p1 = getExplodedPoint(pts[i - 1], body.center, stats.center);
              const p2 = getExplodedPoint(pts[i], body.center, stats.center);
              if (isClippedBySection(p1, stats.bounds) && isClippedBySection(p2, stats.bounds)) continue;
              const a = proj(p1), b = proj(p2);
              ctx.moveTo(a.sx, a.sy);
              ctx.lineTo(b.sx, b.sy);
            }
          }
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // 3D Measurement Overlay
    if (SWState.measurePts.length > 0) {
      ctx.save();
      const p0 = proj(SWState.measurePts[0]);
      ctx.fillStyle = '#facc15';
      ctx.beginPath(); ctx.arc(p0.sx, p0.sy, 4.5 * dpr, 0, Math.PI * 2); ctx.fill();
      if (SWState.measurePts.length >= 2) {
        const p1 = proj(SWState.measurePts[1]);
        ctx.beginPath(); ctx.arc(p1.sx, p1.sy, 4.5 * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(p1.sx, p1.sy); ctx.stroke();
        const a3 = SWState.measurePts[0], b3 = SWState.measurePts[1];
        const dist = Math.hypot(b3[0] - a3[0], b3[1] - a3[1], b3[2] - a3[2]);
        const lbl = `${dist.toFixed(3)} ${model.unitName || 'mm'}`;
        ctx.font = `700 ${12 * dpr}px monospace`;
        ctx.fillStyle = '#fef08a';
        ctx.fillText(lbl, (p0.sx + p1.sx) / 2 + 6 * dpr, (p0.sy + p1.sy) / 2 - 6 * dpr);
      }
      ctx.restore();
    }

    // Center of Mass (CoM) 3D Crosshair Marker
    if (SWState.showCoM && stats.centerOfMass) {
      const cPt = proj(stats.centerOfMass);
      ctx.save();
      ctx.strokeStyle = '#facc15';
      ctx.fillStyle = '#facc15';
      ctx.lineWidth = 1.6 * dpr;
      ctx.beginPath(); ctx.arc(cPt.sx, cPt.sy, 5.5 * dpr, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cPt.sx - 9 * dpr, cPt.sy); ctx.lineTo(cPt.sx + 9 * dpr, cPt.sy);
      ctx.moveTo(cPt.sx, cPt.sy - 9 * dpr); ctx.lineTo(cPt.sx, cPt.sy + 9 * dpr);
      ctx.stroke();
      ctx.font = `700 ${9.5 * dpr}px monospace`;
      ctx.fillText('CoM', cPt.sx + 8 * dpr, cPt.sy - 6 * dpr);
      ctx.restore();
    }

    // Bottom-left SolidWorks Orientation Triad
    const triX = 48 * dpr, triY = H - 48 * dpr, triR = 26 * dpr;
    const drawTriadAxis = (vec, col, lbl) => {
      const p = projectPoint3D(vec, [0, 0, 0], triR, triX * 2, triY * 2, SWState.yaw, SWState.pitch, 0, 0);
      ctx.strokeStyle = col; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.moveTo(triX, triY); ctx.lineTo(p.sx, p.sy); ctx.stroke();
      ctx.fillStyle = col; ctx.font = `700 ${10 * dpr}px monospace`;
      ctx.fillText(lbl, p.sx + 3 * dpr, p.sy + 3 * dpr);
    };
    drawTriadAxis([1, 0, 0], '#ff2a4b', 'X');
    drawTriadAxis([0, 1, 0], '#22c55e', 'Y');
    drawTriadAxis([0, 0, 1], '#00f0ff', 'Z');
  }

  function renderFeatureManagerTree() {
    const tree = $('#sw-feature-tree');
    if (!tree) return;
    const m = SWState.modelA;
    if (!m) {
      tree.innerHTML = '<div style="padding:10px;color:#64748b;font-size:11.5px">No 3D Part / Assembly loaded.</div>';
      return;
    }
    const items = [
      `<div class="sw-tree-hdr"><strong>${m.fileName || 'Part.step'}</strong> <span style="opacity:.7">(${m.header && m.header.schema ? m.header.schema : 'STEP'})</span></div>`,
      `<div class="sw-tree-item">📐 Front Plane · Top Plane · Right Plane</div>`,
      `<div class="sw-tree-item">⊕ Origin (0, 0, 0)</div>`,
      `<div class="sw-tree-sec">Solid Bodies (${m.bodies.length})</div>`
    ];
    for (const b of m.bodies) {
      const selCls = SWState.selectedBodyId === b.id ? ' on' : '';
      items.push(
        `<div class="sw-tree-item${selCls}" data-sw-body="${b.id}" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer">` +
        `<span>🧊 ${b.name} (${b.faceCount} faces)</span>` +
        `<button type="button" class="sw-vis-btn" data-sw-vis="${b.id}" title="Toggle Body Visibility" style="background:none;border:none;color:inherit;cursor:pointer">${b.visible !== false ? '👁' : '🚫'}</button>` +
        `</div>`
      );
    }
    if (SWState.doc && Array.isArray(SWState.doc.features) && SWState.doc.features.length) {
      const nF = SWState.doc.features.length;
      const rbVal = SWState.doc.rollbackIndex != null ? SWState.doc.rollbackIndex : nF;
      items.push(`<div class="sw-tree-sec">Parametric Features (${nF}) <span style="font-weight:400;opacity:.7">· click to edit</span></div>`);
      SWState.doc.features.forEach((f, idx) => {
        const isSel = SWState.selectedFeatureId === f.id;
        const rolled = idx >= rbVal;
        const supStyle = (f.suppressed || rolled) ? 'opacity:0.42;text-decoration:line-through;' : '';
        const selBg = isSel ? 'background:rgba(56,189,248,0.18);border-radius:5px;padding:2px 4px;' : 'padding:2px 4px;';
        items.push(
          `<div class="sw-tree-item" data-sw-feat="${f.id}" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;${selBg}${supStyle}">` +
          `<span>⚙ ${f.name}</span>` +
          `<span style="display:flex;gap:4px">` +
          `<button type="button" data-sw-edit="${f.id}" title="Edit Feature Dimensions" style="background:none;border:none;color:#facc15;cursor:pointer">✎</button>` +
          `<button type="button" data-sw-sup="${f.id}" title="Suppress / Unsuppress" style="background:none;border:none;color:#38bdf8;cursor:pointer">${f.suppressed ? '▶' : '⏸'}</button>` +
          `<button type="button" data-sw-del="${f.id}" title="Delete Feature" style="background:none;border:none;color:#f87171;cursor:pointer">✕</button>` +
          `</span></div>`
        );
      });
      items.push(
        `<div style="margin:6px 4px;padding:5px 6px;border-top:2px solid #38bdf8;background:rgba(56,189,248,0.08);border-radius:4px;font-size:10.5px">` +
        `<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="color:#38bdf8;font-weight:700">Rollback Bar</span><span>${rbVal}/${nF}</span></div>` +
        `<input type="range" id="sw-rollback-range" min="1" max="${nF}" value="${rbVal}" style="width:100%" />` +
        `</div>`
      );
    }
    if (m.holes && m.holes.length) {
      items.push(`<div class="sw-tree-sec">Holes &amp; Circular Bores (${m.holes.length})</div>`);
      m.holes.slice(0, 20).forEach((h, i) => {
        const fidAttr = h.featureId ? ` data-sw-feat="${h.featureId}" style="cursor:pointer" title="Click to edit hole size"` : '';
        items.push(`<div class="sw-tree-item"${fidAttr}>⌀ ${h.label || ('Hole ' + (i + 1) + ': Ø' + h.diameter.toFixed(2) + ' ' + (m.unitName || 'mm'))}</div>`);
      });
    }
    tree.innerHTML = items.join('');
    tree.querySelectorAll('[data-sw-body]').forEach(el => {
      el.onclick = () => {
        SWState.selectedBodyId = el.dataset.swBody;
        renderFeatureManagerTree();
        render3DCanvas();
      };
    });
    tree.querySelectorAll('[data-sw-vis]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const b = m.bodies.find(x => x.id === btn.dataset.swVis);
        if (b) { b.visible = !(b.visible !== false); renderFeatureManagerTree(); render3DCanvas(); }
      };
    });
    tree.querySelectorAll('[data-sw-feat], [data-sw-edit]').forEach(el => {
      el.onclick = e => {
        e.stopPropagation();
        SWState.selectedFeatureId = el.dataset.swFeat || el.dataset.swEdit;
        renderFeatureManagerTree();
        renderPropertyManager();
      };
    });
    const rbEl = $('#sw-rollback-range');
    if (rbEl && SWState.doc) {
      rbEl.oninput = e => {
        SWState.doc.rollbackIndex = parseInt(e.target.value, 10);
        SWState.modelA = SWState.doc.rebuild();
        render3DCanvas();
        renderPropertyManager();
      };
      rbEl.onchange = e => {
        SWState.doc.rollbackIndex = parseInt(e.target.value, 10);
        syncDocToViewport(`Rolled back feature tree to ${SWState.doc.rollbackIndex}/${SWState.doc.features.length}`);
      };
    }
    tree.querySelectorAll('[data-sw-sup]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        if (SWState.doc) { pushSWUndo(); SWState.doc.toggleSuppress(btn.dataset.swSup); syncDocToViewport('Rebuilt parametric feature tree'); }
      };
    });
    tree.querySelectorAll('[data-sw-del]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        if (SWState.doc) {
          pushSWUndo();
          if (SWState.selectedFeatureId === btn.dataset.swDel) SWState.selectedFeatureId = null;
          SWState.doc.removeFeature(btn.dataset.swDel);
          syncDocToViewport('Removed feature & rebuilt solid');
        }
      };
    });
  }

  function renderPropertyManager() {
    const props = $('#sw-props-body');
    if (!props) return;
    const m = SWState.modelA;
    const eng = getEngine();
    if (!m || !m.stats || !eng) {
      props.innerHTML = '<div style="padding:10px;color:#64748b;font-size:11.5px">Load a STEP, SolidWorks, STL, or OBJ model to inspect Mass Properties.</div>';
      return;
    }
    const s = m.stats;
    const massG = eng.calculateMassGrams(s.volumeCm3, SWState.material);
    const u = m.unitName || 'mm';
    let diffHtml = '';
    if (SWState.compareMode && SWState.diff3D) {
      const d = SWState.diff3D;
      diffHtml = `
        <div style="margin-top:10px;padding:8px;border-radius:8px;background:rgba(0,240,255,0.08);border:1px solid rgba(0,240,255,0.28)">
          <div style="font-weight:700;font-size:11.5px;margin-bottom:4px;color:#00f0ff">3D Revision Compare (A vs B)</div>
          <div style="font-size:11px;line-height:1.5">
            <div><span style="color:#ff2a4b">■</span> Removed Edges: <b>${d.removedCount}</b></div>
            <div><span style="color:#00f0ff">■</span> Added Edges: <b>${d.addedCount}</b></div>
            <div>Unchanged Edges: <b>${d.unchangedCount}</b></div>
            <div>Δ Size X/Y/Z: <b>${d.deltaSizeX >= 0 ? '+' : ''}${d.deltaSizeX.toFixed(2)} / ${d.deltaSizeY >= 0 ? '+' : ''}${d.deltaSizeY.toFixed(2)} / ${d.deltaSizeZ >= 0 ? '+' : ''}${d.deltaSizeZ.toFixed(2)} ${u}</b></div>
            <div>Δ Volume: <b>${d.deltaVolumeCm3 >= 0 ? '+' : ''}${d.deltaVolumeCm3.toFixed(2)} cm³</b></div>
          </div>
        </div>`;
    }
    const K = getKernel();
    const selFeat = (SWState.doc && SWState.selectedFeatureId) ? SWState.doc.features.find(x => x.id === SWState.selectedFeatureId) : null;
    let editorHtml = '';
    if (selFeat) {
      const p = selFeat.params || {};
      const inpStyle = 'width:100%;height:24px;font-size:11px;background:var(--btn);color:var(--ink);border:1px solid var(--line2);border-radius:4px;padding:2px 6px';
      const row = (lbl, ctrl) => `<label style="display:grid;grid-template-columns:86px 1fr;align-items:center;gap:6px;font-size:11px"><span style="color:#94a3b8">${lbl}</span>${ctrl}</label>`;
      let fields = row('Name', `<input id="sw-pm-name" style="${inpStyle}" value="${String(selFeat.name || '').replace(/"/g, '&quot;')}" />`);

      if (selFeat.type === 'EXTRUDE_BOSS' || selFeat.type === 'EXTRUDE_CUT') {
        const kind = p.kind || 'center_rect';
        const plane = p.plane || 'top';
        fields += row('Profile', `<select id="sw-pm-kind" style="${inpStyle}">
          <option value="center_rect"${kind==='center_rect'?' selected':''}>Center Rectangle</option>
          <option value="rect"${kind==='rect'?' selected':''}>Corner Rectangle</option>
          <option value="circle"${kind==='circle'?' selected':''}>Circle</option>
          <option value="slot"${kind==='slot'?' selected':''}>Slot</option>
          <option value="polygon"${kind==='polygon'?' selected':''}>Polygon</option>
        </select>`);
        fields += row('Plane', `<select id="sw-pm-plane" style="${inpStyle}">
          <option value="top"${plane==='top'?' selected':''}>Top (XY)</option>
          <option value="front"${plane==='front'?' selected':''}>Front (XZ)</option>
          <option value="right"${plane==='right'?' selected':''}>Right (YZ)</option>
        </select>`);
        if (kind === 'circle') {
          fields += row('Diameter', `<input id="sw-pm-dia" type="number" step="0.5" style="${inpStyle}" value="${p.diameter || ((p.radius || 10) * 2)}" />`);
        } else if (kind === 'polygon') {
          fields += row('Sides', `<input id="sw-pm-sides" type="number" min="3" max="32" style="${inpStyle}" value="${p.sides || 6}" />`);
          fields += row('Radius', `<input id="sw-pm-rad" type="number" step="0.5" style="${inpStyle}" value="${p.radius || 15}" />`);
        } else if (kind === 'slot') {
          fields += row('Length', `<input id="sw-pm-len" type="number" step="1" style="${inpStyle}" value="${p.length || 40}" />`);
          fields += row('Width', `<input id="sw-pm-w" type="number" step="0.5" style="${inpStyle}" value="${p.width || 12}" />`);
        } else {
          fields += row('Width', `<input id="sw-pm-w" type="number" step="1" style="${inpStyle}" value="${p.width || 80}" />`);
          fields += row('Height', `<input id="sw-pm-h" type="number" step="1" style="${inpStyle}" value="${p.height || 50}" />`);
        }
        fields += row('Center X', `<input id="sw-pm-cx" type="number" step="1" style="${inpStyle}" value="${p.cx || 0}" />`);
        fields += row('Center Y', `<input id="sw-pm-cy" type="number" step="1" style="${inpStyle}" value="${p.cy || 0}" />`);
        fields += row('Depth', `<input id="sw-pm-depth" type="number" step="0.5" style="${inpStyle}" value="${p.depth || 15}" />`);
        fields += row('Offset Z', `<input id="sw-pm-offset" type="number" step="0.5" style="${inpStyle}" value="${p.offset || 0}" />`);
        fields += row('Draft (°)', `<input id="sw-pm-draft" type="number" step="0.5" style="${inpStyle}" value="${p.draftDeg || 0}" />`);
        fields += row('Mid-Plane', `<input id="sw-pm-mid" type="checkbox"${p.midPlane ? ' checked' : ''} />`);
        if (selFeat.type === 'EXTRUDE_BOSS') {
          fields += row('Color', `<input id="sw-pm-col" type="color" value="${p.color || '#7c8ea6'}" style="width:44px;height:22px;border:none;background:none" />`);
        }
      } else if (selFeat.type === 'HOLE_WIZARD') {
        const sizes = Object.keys((K && K.ISO_METRIC_HOLES) || { M3:1, M4:1, M5:1, M6:1, M8:1, M10:1, M12:1, M16:1, M20:1 });
        const curSize = p.size || 'M6';
        const curHType = p.holeType || 'clearance';
        const posStr = (Array.isArray(p.positions) ? p.positions : [[p.cx || 0, p.cy || 0]]).map(pt => `${pt[0]},${pt[1]}`).join('; ');
        fields += row('ISO Size', `<select id="sw-pm-hsize" style="${inpStyle}">${sizes.map(sz => `<option value="${sz}"${sz===curSize?' selected':''}>${sz}</option>`).join('')}</select>`);
        fields += row('Hole Type', `<select id="sw-pm-htype" style="${inpStyle}">
          <option value="clearance"${curHType==='clearance'?' selected':''}>Clearance (Thru)</option>
          <option value="tap"${curHType==='tap'?' selected':''}>Tap Drill</option>
          <option value="cbore"${curHType==='cbore'?' selected':''}>Counterbore</option>
          <option value="csink"${curHType==='csink'?' selected':''}>Countersink</option>
        </select>`);
        fields += row('Custom Ø', `<input id="sw-pm-hdia" type="number" step="0.1" placeholder="Auto ISO" style="${inpStyle}" value="${p.diameter || ''}" />`);
        fields += row('Depth', `<input id="sw-pm-depth" type="number" step="0.5" style="${inpStyle}" value="${p.depth || 20}" />`);
        fields += row('X,Y List', `<input id="sw-pm-pos" style="${inpStyle}" value="${posStr}" title="Semicolon-separated X,Y pairs e.g. -25,-15; 25,-15" />`);
      } else if (selFeat.type === 'FILLET') {
        fields += row('Radius', `<input id="sw-pm-rad" type="number" step="0.5" min="0.5" style="${inpStyle}" value="${p.radius || 6}" />`);
      } else if (selFeat.type === 'CHAMFER') {
        fields += row('Distance', `<input id="sw-pm-dist" type="number" step="0.5" min="0.5" style="${inpStyle}" value="${p.distance || 4}" />`);
      } else if (selFeat.type === 'SHELL') {
        fields += row('Wall Thk', `<input id="sw-pm-thk" type="number" step="0.2" min="0.5" style="${inpStyle}" value="${p.thickness || 2.5}" />`);
      } else if (selFeat.type === 'REVOLVE_BOSS') {
        fields += row('Angle (°)', `<input id="sw-pm-ang" type="number" min="5" max="360" step="5" style="${inpStyle}" value="${p.angleDeg || 360}" />`);
        fields += row('Axis', `<select id="sw-pm-axis" style="${inpStyle}"><option value="z"${(p.axis||'z')==='z'?' selected':''}>Z Axis</option><option value="x"${p.axis==='x'?' selected':''}>X Axis</option><option value="y"${p.axis==='y'?' selected':''}>Y Axis</option></select>`);
      } else if (selFeat.type === 'LINEAR_PATTERN') {
        fields += row('Count X', `<input id="sw-pm-cxn" type="number" min="1" max="20" style="${inpStyle}" value="${p.countX || 2}" />`);
        fields += row('Count Y', `<input id="sw-pm-cyn" type="number" min="1" max="20" style="${inpStyle}" value="${p.countY || 1}" />`);
        fields += row('Spacing X', `<input id="sw-pm-spx" type="number" step="1" style="${inpStyle}" value="${p.spacingX || 95}" />`);
        fields += row('Spacing Y', `<input id="sw-pm-spy" type="number" step="1" style="${inpStyle}" value="${p.spacingY || 60}" />`);
      } else if (selFeat.type === 'CIRCULAR_PATTERN') {
        fields += row('Count', `<input id="sw-pm-cnt" type="number" min="2" max="36" style="${inpStyle}" value="${p.count || 4}" />`);
        fields += row('Center X', `<input id="sw-pm-cx" type="number" step="1" style="${inpStyle}" value="${p.cx || 0}" />`);
        fields += row('Center Y', `<input id="sw-pm-cy" type="number" step="1" style="${inpStyle}" value="${p.cy || 0}" />`);
      } else if (selFeat.type === 'MIRROR_BODY') {
        fields += row('Plane', `<select id="sw-pm-mplane" style="${inpStyle}"><option value="right"${(p.mirrorPlane||'right')==='right'?' selected':''}>Right (YZ)</option><option value="front"${p.mirrorPlane==='front'?' selected':''}>Front (XZ)</option><option value="top"${p.mirrorPlane==='top'?' selected':''}>Top (XY)</option></select>`);
      }

      editorHtml = `
        <div style="margin-bottom:10px;padding:8px;border-radius:8px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.32)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px">
            <span style="font-weight:700;font-size:11.5px;color:#38bdf8">PropertyManager: ${selFeat.type}</span>
            <button type="button" id="sw-pm-close" style="background:none;border:none;color:#94a3b8;cursor:pointer" title="Close Editor">✕</button>
          </div>
          <div style="display:grid;gap:5px">${fields}</div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button type="button" id="sw-pm-apply" style="flex:1;height:26px;border-radius:5px;border:none;background:#0284c7;color:#fff;font-weight:700;font-size:11.5px;cursor:pointer">✓ Apply &amp; Rebuild</button>
          </div>
        </div>`;
    }

    props.innerHTML = `
      <div style="display:grid;gap:6px;font-size:11.5px;padding:8px">
        ${editorHtml}
        <div><b>Bounding Box:</b> ${s.sizeX.toFixed(2)} × ${s.sizeY.toFixed(2)} × ${s.sizeZ.toFixed(2)} ${u}</div>
        <div><b>Volume:</b> ${s.volumeCm3.toFixed(2)} cm³ (${s.volumeMm3.toFixed(0)} mm³)</div>
        <div><b>Surface Area:</b> ${(s.surfaceAreaMm2 / 100).toFixed(2)} cm²</div>
        <div><b>Estimated Mass:</b> ${massG >= 1000 ? (massG / 1000).toFixed(3) + ' kg' : massG.toFixed(1) + ' g'}</div>
        <div><b>Geometry:</b> ${m.bodies.length} Body · ${s.totalFaces} Faces · ${s.totalEdges} Edges · ${s.holeCount} Holes</div>
        ${diffHtml}
      </div>`;

    if (selFeat && $('#sw-pm-apply')) {
      if ($('#sw-pm-close')) $('#sw-pm-close').onclick = () => { SWState.selectedFeatureId = null; renderFeatureManagerTree(); renderPropertyManager(); };
      if ($('#sw-pm-kind')) $('#sw-pm-kind').onchange = e => { editFeatureParams(selFeat.id, { kind: e.target.value }); };
      $('#sw-pm-apply').onclick = () => {
        const patch = {};
        const newName = $('#sw-pm-name') ? $('#sw-pm-name').value : selFeat.name;
        const num = id => { const el = $(id); return el && el.value !== '' ? parseFloat(el.value) : undefined; };
        if (selFeat.type === 'EXTRUDE_BOSS' || selFeat.type === 'EXTRUDE_CUT') {
          if ($('#sw-pm-kind')) patch.kind = $('#sw-pm-kind').value;
          if ($('#sw-pm-plane')) patch.plane = $('#sw-pm-plane').value;
          if (num('#sw-pm-w') != null) patch.width = num('#sw-pm-w');
          if (num('#sw-pm-h') != null) patch.height = num('#sw-pm-h');
          if (num('#sw-pm-dia') != null) patch.diameter = num('#sw-pm-dia');
          if (num('#sw-pm-rad') != null) patch.radius = num('#sw-pm-rad');
          if (num('#sw-pm-sides') != null) patch.sides = Math.round(num('#sw-pm-sides'));
          if (num('#sw-pm-len') != null) patch.length = num('#sw-pm-len');
          if (num('#sw-pm-cx') != null) patch.cx = num('#sw-pm-cx');
          if (num('#sw-pm-cy') != null) patch.cy = num('#sw-pm-cy');
          if (num('#sw-pm-depth') != null) patch.depth = num('#sw-pm-depth');
          if (num('#sw-pm-offset') != null) patch.offset = num('#sw-pm-offset');
          if (num('#sw-pm-draft') != null) patch.draftDeg = num('#sw-pm-draft');
          if ($('#sw-pm-mid')) patch.midPlane = !!$('#sw-pm-mid').checked;
          if ($('#sw-pm-col')) patch.color = $('#sw-pm-col').value;
        } else if (selFeat.type === 'HOLE_WIZARD') {
          if ($('#sw-pm-hsize')) patch.size = $('#sw-pm-hsize').value;
          if ($('#sw-pm-htype')) patch.holeType = $('#sw-pm-htype').value;
          const customDia = num('#sw-pm-hdia');
          patch.diameter = (customDia != null && customDia > 0) ? customDia : null;
          if (num('#sw-pm-depth') != null) patch.depth = num('#sw-pm-depth');
          if ($('#sw-pm-pos')) {
            const parsedPos = $('#sw-pm-pos').value.split(';').map(s2 => {
              const pair = s2.split(',').map(v => parseFloat(v.trim()));
              return (pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1])) ? [pair[0], pair[1]] : null;
            }).filter(Boolean);
            if (parsedPos.length) patch.positions = parsedPos;
          }
        } else if (selFeat.type === 'FILLET') {
          if (num('#sw-pm-rad') != null) patch.radius = num('#sw-pm-rad');
        } else if (selFeat.type === 'CHAMFER') {
          if (num('#sw-pm-dist') != null) patch.distance = num('#sw-pm-dist');
        } else if (selFeat.type === 'SHELL') {
          if (num('#sw-pm-thk') != null) patch.thickness = num('#sw-pm-thk');
        } else if (selFeat.type === 'REVOLVE_BOSS') {
          if (num('#sw-pm-ang') != null) patch.angleDeg = num('#sw-pm-ang');
          if ($('#sw-pm-axis')) patch.axis = $('#sw-pm-axis').value;
        } else if (selFeat.type === 'LINEAR_PATTERN') {
          if (num('#sw-pm-cxn') != null) patch.countX = Math.round(num('#sw-pm-cxn'));
          if (num('#sw-pm-cyn') != null) patch.countY = Math.round(num('#sw-pm-cyn'));
          if (num('#sw-pm-spx') != null) patch.spacingX = num('#sw-pm-spx');
          if (num('#sw-pm-spy') != null) patch.spacingY = num('#sw-pm-spy');
        } else if (selFeat.type === 'CIRCULAR_PATTERN') {
          if (num('#sw-pm-cnt') != null) patch.count = Math.round(num('#sw-pm-cnt'));
          if (num('#sw-pm-cx') != null) patch.cx = num('#sw-pm-cx');
          if (num('#sw-pm-cy') != null) patch.cy = num('#sw-pm-cy');
        } else if (selFeat.type === 'MIRROR_BODY') {
          if ($('#sw-pm-mplane')) patch.mirrorPlane = $('#sw-pm-mplane').value;
        }
        editFeatureParams(selFeat.id, patch, newName);
      };
    }
  }

  function refreshSW() {
    renderFeatureManagerTree();
    renderPropertyManager();
    render3DCanvas();
  }

  function setView(preset) {
    const v = VIEW_ANGLES[preset];
    if (v) { SWState.yaw = v.yaw; SWState.pitch = v.pitch; }
    SWState.panX = 0; SWState.panY = 0; SWState.zoom = 1.0;
    render3DCanvas();
  }

  async function load3DFileEntry(fileObj, slot = 'A') {
    const eng = getEngine();
    if (!eng || !fileObj) return null;
    let name = fileObj.name || 'Model.step';
    let bytes = fileObj.bytes ? (fileObj.bytes instanceof Uint8Array ? fileObj.bytes : new Uint8Array(fileObj.bytes)) : null;
    if (!bytes && typeof fileObj.arrayBuffer === 'function') bytes = new Uint8Array(await fileObj.arrayBuffer());
    let text = typeof fileObj.text === 'string' ? fileObj.text : null;

    if (eng.isSolidWorksFileName(name)) {
      if (typeof window !== 'undefined' && window.native && typeof window.native.convertSolidWorksToStep === 'function') {
        toast(`Converting SolidWorks file (${name}) to STEP offline...`);
        const conv = await window.native.convertSolidWorksToStep({ path: fileObj.path || '', bytes, name });
        if (conv && conv.ok && conv.bytes) {
          bytes = conv.bytes instanceof Uint8Array ? conv.bytes : new Uint8Array(conv.bytes);
          name = conv.name || name.replace(/\.(sldprt|sldasm|slddrw)$/i, '.step');
          text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        } else {
          const meta = eng.inspectSolidWorksMetadata(bytes, name);
          toast((conv && conv.error) || `${meta.docType} (${name}) detected. Install SolidWorks or FreeCAD for automatic binary conversion, or save as STEP (.step/.stp).`);
          return null;
        }
      } else {
        toast('Native .sldprt/.sldasm conversion requires the desktop app with SolidWorks or FreeCAD installed, or export as STEP (.step/.stp).');
        return null;
      }
    }

    const K = getKernel();
    if (name.toLowerCase().endsWith('.kensho3d') && K) {
      const kStr = text || new TextDecoder('utf-8', { fatal: false }).decode(bytes || new Uint8Array());
      SWState.doc = K.CADDocument.deserialize(kStr);
      SWState.modelA = SWState.doc.toModelObject();
      SWState.compareMode = false;
      setView('iso');
      refreshSW();
      toast(`Loaded Parametric SolidWorks Project: ${name}`);
      return SWState.modelA;
    }
    const payload = (name.toLowerCase().endsWith('.stl') && bytes) ? bytes : (text || new TextDecoder('utf-8', { fatal: false }).decode(bytes || new Uint8Array()));
    const model = eng.parse3DCAD(payload, name);
    if (slot === 'B') {
      SWState.modelB = model;
      if (SWState.modelA) {
        SWState.diff3D = eng.compare3DModels(SWState.modelA, SWState.modelB);
        SWState.compareMode = true;
      }
    } else {
      SWState.doc = null;
      SWState.modelA = model;
      SWState.compareMode = false;
      SWState.diff3D = null;
    }
    setView('iso');
    refreshSW();
    toast(`Loaded 3D Model (${slot}): ${name}`);
    return model;
  }

  function loadSampleSolidWorksPair(withCompare = false) {
    const eng = getEngine();
    if (!eng) return;
    SWState.doc = null;
    SWState.modelA = eng.parse3DCAD(eng.generateSampleSTEP('A'), 'Kensho_Bracket_RevA.step');
    if (withCompare) {
      SWState.modelB = eng.parse3DCAD(eng.generateSampleSTEP('B'), 'Kensho_Bracket_RevB.step');
      SWState.diff3D = eng.compare3DModels(SWState.modelA, SWState.modelB);
      SWState.compareMode = true;
    } else {
      SWState.modelB = null;
      SWState.diff3D = null;
      SWState.compareMode = false;
    }
    setView('iso');
    refreshSW();
    toast(withCompare ? 'Loaded SolidWorks Sample Rev A vs Rev B 3D STEP Compare' : 'Loaded SolidWorks Sample Bracket (STEP AP214)');
  }

  function make2DDrawingInCADStudio(view = 'top') {
    const eng = getEngine();
    if (!eng || !SWState.modelA) {
      toast('Load a 3D STEP / SolidWorks model first.');
      return '';
    }
    const dxfStr = eng.project3DToDXF(SWState.modelA, view);
    if (typeof window !== 'undefined' && window.DXFStudio && typeof window.DXFStudio.handleDroppedFiles === 'function') {
      if (typeof window.setCADStudioMode === 'function') window.setCADStudioMode('2d');
      window.DXFStudio.handleDroppedFiles([{
        name: (SWState.modelA.fileName || 'Part').replace(/\.\w+$/, '') + `_${view}.dxf`,
        text: dxfStr
      }], 'A');
      toast(`Projected 3D ${view.toUpperCase()} view into 2D CAD Studio.`);
    }
    return dxfStr;
  }

  async function exportSTEPToDXFDialog() {
    const target = SWState.doc || SWState.modelA;
    if (!target) { toast('Create or open a 3D STEP/CAD model first.'); return null; }
    if (typeof window !== 'undefined' && typeof window.dialog === 'function') {
      const r = await window.dialog('Export 3D STEP / Part as AutoCAD DXF', [
        {
          type: 'select', id: 'proj', label: '2D DXF Projection', value: 'dxf',
          options: [
            { label: '4-View Engineering Drawing (Front / Top / Right / Iso)', value: 'dxf' },
            { label: 'Top Plan View (XY)', value: 'dxf_top' },
            { label: 'Front Elevation (XZ)', value: 'dxf_front' },
            { label: 'Right Side View (YZ)', value: 'dxf_right' },
            { label: '3D Isometric Projection', value: 'dxf_iso' }
          ]
        },
        {
          type: 'select', id: 'dest', label: 'Output Destination', value: 'save',
          options: [
            { label: 'Save .dxf File to Disk (Like CAD Studio)', value: 'save' },
            { label: 'Open Directly in CAD (DXF) Studio', value: 'cad' }
          ]
        }
      ], 'Export DXF');
      if (!r) return null;
      if (r.dest === 'cad') {
        if (r.proj === 'dxf') return exportCurrentModel('dxf4');
        return make2DDrawingInCADStudio(r.proj.replace('dxf_', ''));
      }
      return exportCurrentModel(r.proj || 'dxf');
    }
    return exportCurrentModel('dxf');
  }

  function renderSWDocTabs() {
    const bar = $('#sw-doc-tabs');
    if (!bar) return;
    if (!SWState.openTabs || SWState.openTabs.length <= 1) {
      bar.hidden = true;
      bar.innerHTML = '';
      return;
    }
    bar.hidden = false;
    bar.innerHTML = SWState.openTabs.map(tab => {
      const isAct = tab.id === SWState.activeTabId;
      return `<div class="sw-doc-tab${isAct ? ' active' : ''}" data-sw-tabid="${esc(tab.id)}" title="${esc(tab.name)}">` +
        `<span class="sw-doc-tab-name">${esc(tab.name)}</span>` +
        `<button type="button" class="sw-doc-tab-x" data-sw-closeid="${esc(tab.id)}" title="Close Tab">&times;</button>` +
      `</div>`;
    }).join('');
    bar.querySelectorAll('.sw-doc-tab').forEach(el => {
      el.onclick = ev => {
        if (ev.target && ev.target.closest('.sw-doc-tab-x')) return;
        switchSWDocTab(el.getAttribute('data-sw-tabid'));
      };
    });
    bar.querySelectorAll('.sw-doc-tab-x').forEach(btn => {
      btn.onclick = ev => {
        ev.stopPropagation();
        closeSWDocTab(btn.getAttribute('data-sw-closeid'));
      };
    });
  }

  function syncActiveSWTabSnapshot() {
    if (!SWState.activeTabId || !SWState.openTabs.length) return;
    const cur = SWState.openTabs.find(t => t.id === SWState.activeTabId);
    if (!cur) return;
    cur.modelA = SWState.modelA;
    cur.doc = SWState.doc;
    cur.yaw = SWState.yaw;
    cur.pitch = SWState.pitch;
    cur.zoom = SWState.zoom;
    cur.panX = SWState.panX;
    cur.panY = SWState.panY;
    cur.explodeFactor = SWState.explodeFactor;
  }

  function registerSWDocTab(name, modelA, doc) {
    syncActiveSWTabSnapshot();
    const id = 'swtab_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const tab = {
      id,
      name: String(name || 'Part.step'),
      modelA,
      doc: doc || null,
      yaw: SWState.yaw,
      pitch: SWState.pitch,
      zoom: SWState.zoom,
      panX: SWState.panX,
      panY: SWState.panY,
      explodeFactor: 0
    };
    SWState.openTabs.push(tab);
    SWState.activeTabId = id;
    renderSWDocTabs();
    return tab;
  }

  function switchSWDocTab(tabId) {
    const next = SWState.openTabs.find(t => t.id === tabId);
    if (!next || next.id === SWState.activeTabId) return;
    syncActiveSWTabSnapshot();
    SWState.activeTabId = next.id;
    SWState.modelA = next.modelA;
    SWState.doc = next.doc || null;
    SWState.yaw = next.yaw != null ? next.yaw : VIEW_ANGLES.iso.yaw;
    SWState.pitch = next.pitch != null ? next.pitch : VIEW_ANGLES.iso.pitch;
    SWState.zoom = next.zoom || 1.0;
    SWState.panX = next.panX || 0;
    SWState.panY = next.panY || 0;
    SWState.explodeFactor = next.explodeFactor || 0;
    SWState.compareMode = false;
    SWState.selectedBodyId = null;
    SWState._visBodiesCache = null;
    if ($('#sw-explode-range')) $('#sw-explode-range').value = Math.round(SWState.explodeFactor * 100);
    if (typeof window !== 'undefined' && window.KenshoGPU && window.KenshoGPU.invalidateCache) window.KenshoGPU.invalidateCache();
    renderSWDocTabs();
    refreshSW();
  }

  function closeSWDocTab(tabId) {
    const idx = SWState.openTabs.findIndex(t => t.id === tabId);
    if (idx < 0) return;
    SWState.openTabs.splice(idx, 1);
    if (SWState.activeTabId === tabId) {
      const next = SWState.openTabs[Math.min(idx, SWState.openTabs.length - 1)] || null;
      if (next) {
        SWState.activeTabId = null;
        switchSWDocTab(next.id);
      } else {
        SWState.activeTabId = null;
        SWState.modelA = null;
        SWState.doc = null;
        SWState._visBodiesCache = null;
        renderSWDocTabs();
        refreshSW();
      }
    } else {
      renderSWDocTabs();
    }
  }

  async function openMultiple3DFiles(files, slot = 'A') {
    if (!files || !files.length) return;
    if (slot === 'B') {
      await load3DFileEntry(files[0], 'B');
      return;
    }
    for (let i = 0; i < files.length; i++) {
      await load3DFileEntry(files[i], 'A');
      if (SWState.modelA) {
        registerSWDocTab(SWState.modelA.fileName || files[i].name || ('Part_' + (i + 1)), SWState.modelA, SWState.doc);
      }
    }
    if (files.length > 1) {
      toast(`Opened ${files.length} 3D CAD files in SolidWorks Studio tabs.`);
    }
  }

  function mountSolidWorksUI(hostEl) {
    if (!hostEl || SWState.mounted) return;
    const eng = getEngine();
    const matOpts = Object.keys((eng && eng.MATERIALS) || { 'Aluminum 6061-T6': 1 }).map(m => `<option value="${m}">${m}</option>`).join('');
    hostEl.innerHTML = `
      <div class="sw-shell" style="display:flex;flex-direction:column;height:100%;width:100%;background:var(--bg);color:var(--ink)">
        <div id="sw-studio-tabs" class="rp-ribbon-tabs sw-ribbon-tabs" role="tablist" aria-label="SolidWorks CommandManager Tabs">
          <button type="button" class="rp-tab-btn active" data-sw-tab="file" role="tab" aria-selected="true"><i data-ic="cube3d"></i><span>File &amp; Home</span></button>
          <button type="button" class="rp-tab-btn" data-sw-tab="features" role="tab" aria-selected="false"><i data-ic="box"></i><span>Features &amp; Modeling</span></button>
          <button type="button" class="rp-tab-btn" data-sw-tab="assembly" role="tab" aria-selected="false"><i data-ic="layers"></i><span>Assembly &amp; Mates</span></button>
          <button type="button" class="rp-tab-btn" data-sw-tab="view" role="tab" aria-selected="false"><i data-ic="orbit3d"></i><span>View &amp; Section</span></button>
          <button type="button" class="rp-tab-btn" data-sw-tab="export" role="tab" aria-selected="false"><i data-ic="tabExport"></i><span>Evaluate &amp; Export</span></button>
          <button type="button" class="rp-tab-btn" data-sw-tab="all" role="tab" aria-selected="false"><i data-ic="allTools"></i><span>All Tools</span></button>
          <div class="sw-tab-spacer" style="flex:1"></div>
          <button type="button" class="rp-tab-btn sw-dock-toggle on" id="sw-toggle-tree-dock" title="Toggle FeatureManager Tree Panel"><i data-ic="layers"></i><span>Tree</span></button>
          <button type="button" class="rp-tab-btn sw-dock-toggle on" id="sw-toggle-props-dock" title="Toggle Mass &amp; Properties Panel"><i data-ic="gear"></i><span>Properties</span></button>
        </div>
        <div id="sw-studio-ribbon" class="sw-ribbon rp-ribbon-strip">
          <!-- TAB 1: FILE & HOME -->
          <div class="grp sw-grp" data-sw-group="file">
            <div class="sw-grp-row">
              <button type="button" class="tb sw-anim-btn" id="sw-new-part" title="Create New Blank Parametric SolidWorks Part"><i data-ic="blank"></i><span>New Part</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-open-a" title="Open One or Multiple STEP (.step/.stp), SolidWorks (.sldprt/.sldasm), STL or OBJ Files"><i data-ic="open"></i><span>Open 3D</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-open-b" title="Open Rev B STEP/STL for 3D Revision Compare"><i data-ic="tabCompare"></i><span>Compare 3D</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-save-k3d" title="Save Editable Parametric SolidWorks Project (.kensho3d)"><i data-ic="save"></i><span>Save .kensho3d</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-undo-btn" title="Undo Parametric Feature Edit (Ctrl+Z)"><i data-ic="undo"></i><span>Undo</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-redo-btn" title="Redo Parametric Feature Edit (Ctrl+Y)"><i data-ic="redo"></i><span>Redo</span></button>
            </div>
            <div class="gl">FILE</div>
          </div>
          <div class="grp sw-grp" data-sw-group="file">
            <div class="sw-grp-row">
              <button type="button" class="tb sw-anim-btn" id="sw-sample-btn" title="Load Sample SolidWorks STEP Bracket"><i data-ic="cube3d"></i><span>Sample Part</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-sample-cmp-btn" title="Load Sample Rev A vs Rev B 3D STEP Compare"><i data-ic="swap"></i><span>Sample Diff</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-exp-dxf-home" title="Export 3D STEP / Part Directly as AutoCAD DXF (.dxf)"><i data-ic="dxfOut"></i><span>Export DXF</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-make-2d" title="Generate 4-View SolidWorks 2D Engineering Drawing (Front/Top/Right/Iso + Title Block) in CAD Studio"><i data-ic="cadDxf"></i><span>4-View Drawing</span></button>
            </div>
            <div class="gl">SAMPLES &amp; DXF DRAWING</div>
          </div>

          <!-- TAB 2: FEATURES & MODELING -->
          <div class="grp sw-grp" data-sw-group="features" hidden>
            <div class="sw-grp-row">
              <button type="button" class="tb sw-anim-btn" id="sw-feat-boss" title="Parametric Extrude Boss/Base"><i data-ic="plus"></i><span>+ Boss</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-feat-cut" title="Parametric Extrude Cut"><i data-ic="trim"></i><span>- Cut</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-feat-revolve" title="Revolve Boss 360°"><i data-ic="rotR"></i><span>Revolve</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-feat-hole" title="ISO Metric Hole Wizard (M3-M20)"><i data-ic="circle"></i><span>Hole Wizard</span></button>
            </div>
            <div class="gl">ADD / REMOVE</div>
          </div>
          <div class="grp sw-grp" data-sw-group="features" hidden>
            <div class="sw-grp-row">
              <button type="button" class="tb sw-anim-btn" id="sw-feat-fillet" title="Apply Edge Fillet"><i data-ic="fillet"></i><span>Fillet</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-feat-chamfer" title="Apply Edge Chamfer"><i data-ic="chamfer"></i><span>Chamfer</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-feat-shell" title="Hollow Shell Wall Thickness"><i data-ic="box"></i><span>Shell</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-feat-pattern" title="Linear Feature Pattern"><i data-ic="arrayRect"></i><span>Lin Pattern</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-feat-cpattern" title="Circular Feature Pattern (4x 360°)"><i data-ic="arrayPolar"></i><span>Circ Pattern</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-feat-mirror" title="Mirror Solid Body"><i data-ic="mirror"></i><span>Mirror</span></button>
            </div>
            <div class="gl">MODIFY &amp; PATTERN</div>
          </div>

          <!-- TAB 3: ASSEMBLY & MATES -->
          <div class="grp sw-grp" data-sw-group="assembly" hidden>
            <div class="sw-grp-row">
              <select id="sw-mate-type" style="height:24px;font-size:11px" title="Assembly Mate Type">
                <option value="COINCIDENT">Mate: Coincident</option>
                <option value="CONCENTRIC">Mate: Concentric</option>
                <option value="DISTANCE:5">Mate: Dist 5mm</option>
                <option value="DISTANCE:10">Mate: Dist 10mm</option>
              </select>
              <button type="button" class="tb sw-anim-btn" id="sw-mate-btn" title="Apply Selected Assembly Mate Between Last Two Solid Bodies"><i data-ic="join"></i><span>Apply Mate</span></button>
            </div>
            <div class="gl">MATES</div>
          </div>
          <div class="grp sw-grp" data-sw-group="assembly" hidden>
            <div class="sw-grp-row">
              <label style="font-size:11px;display:flex;align-items:center;gap:5px" title="Hardware GPU Exploded View (60 FPS)">Explode
                <input type="range" id="sw-explode-range" min="0" max="150" value="0" style="width:76px" />
              </label>
              <button type="button" class="tb sw-anim-btn" id="sw-check-interf" title="Run Assembly Interference / Collision Detection"><i data-ic="search"></i><span>Interference</span></button>
            </div>
            <div class="gl">EXPLODE &amp; CHECK</div>
          </div>

          <!-- TAB 4: VIEW & SECTION -->
          <div class="grp sw-grp" data-sw-group="view" hidden>
            <div class="sw-grp-row">
              <label style="font-size:11px;display:flex;align-items:center;gap:4px">Display
                <select id="sw-display-sel" style="height:24px;font-size:11px">
                  <option value="shaded_edges" selected>Shaded w/ Edges</option>
                  <option value="shaded">Shaded</option>
                  <option value="hlr">Hidden Lines Removed</option>
                  <option value="wireframe">Wireframe</option>
                </select>
              </label>
              <label style="font-size:11px;display:flex;align-items:center;gap:4px">View
                <select id="sw-view-sel" style="height:24px;font-size:11px">
                  <option value="iso">Isometric</option>
                  <option value="trimetric">Trimetric</option>
                  <option value="front">Front</option>
                  <option value="top">Top</option>
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                  <option value="back">Back</option>
                  <option value="bottom">Bottom</option>
                </select>
              </label>
            </div>
            <div class="gl">DISPLAY &amp; CAMERA</div>
          </div>
          <div class="grp sw-grp" data-sw-group="view" hidden>
            <div class="sw-grp-row">
              <label style="font-size:11px;display:flex;align-items:center;gap:4px">Section
                <select id="sw-sec-axis" style="height:24px;font-size:11px">
                  <option value="none">Off</option>
                  <option value="x">X Plane</option>
                  <option value="y">Y Plane</option>
                  <option value="z">Z Plane</option>
                </select>
                <input type="range" id="sw-sec-range" min="5" max="95" value="50" style="width:68px" />
              </label>
              <button type="button" class="tb sw-anim-btn on" id="sw-toggle-com" title="Toggle 3D Center of Mass (CoM) Crosshair"><i data-ic="align"></i><span>CoM</span></button>
              <button type="button" class="tb sw-anim-btn on" id="sw-toggle-planes" title="Toggle Reference Origin Axes / Planes"><i data-ic="crosshair"></i><span>Axes</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-toggle-bg" title="Switch Dark Studio / White Paper Backdrop"><i data-ic="sun"></i><span>Backdrop</span></button>
              <button type="button" class="tb sw-anim-btn on" id="sw-toggle-gpu" title="Toggle Hardware OpenGL/WebGL 3D GPU Renderer"><i data-ic="zap"></i><span>OpenGL GPU</span></button>
              <button type="button" class="tb sw-anim-btn on" id="sw-toggle-fps" title="Toggle Live GPU &amp; FPS Counter HUD"><i data-ic="info"></i><span>FPS HUD</span></button>
            </div>
            <div class="gl">SECTION, GPU &amp; FPS</div>
          </div>
          <div class="grp sw-grp" data-sw-group="view" hidden>
            <div class="sw-grp-row">
              <label style="font-size:11px;display:flex;align-items:center;gap:4px">Color
                <select id="sw-color-mode" style="height:24px;font-size:11px" title="3D Part Shading Color Source">
                  <option value="native" selected>STEP Native Colors</option>
                  <option value="material">Material Finish</option>
                  <option value="custom">Custom Color</option>
                  <option value="per_body">Distinct Per-Body</option>
                </select>
              </label>
              <input type="color" id="sw-color-picker" value="#3b82f6" title="Pick Custom 3D Part Color" style="width:28px;height:24px;padding:1px;border:1px solid var(--line2);border-radius:4px;background:var(--btn);cursor:pointer" />
              <button type="button" class="tb sw-anim-btn" id="sw-color-reset" title="Restore Native STEP File Colors"><i data-ic="reset"></i><span>Reset Color</span></button>
            </div>
            <div class="gl">3D APPEARANCE &amp; COLOR</div>
          </div>

          <!-- TAB 5: EVALUATE & EXPORT -->
          <div class="grp sw-grp" data-sw-group="export" hidden>
            <div class="sw-grp-row">
              <label style="font-size:11px;display:flex;align-items:center;gap:4px">Material
                <select id="sw-mat-sel" style="height:24px;font-size:11px">${matOpts}</select>
              </label>
              <button type="button" class="tb sw-anim-btn" id="sw-measure-btn" title="3D Point-to-Point Measure (Distance &amp; ΔX/ΔY/ΔZ)"><i data-ic="ruler"></i><span>3D Measure</span></button>
            </div>
            <div class="gl">EVALUATE</div>
          </div>
          <div class="grp sw-grp" data-sw-group="export" hidden>
            <div class="sw-grp-row">
              <button type="button" class="tb sw-anim-btn" id="sw-exp-step" title="Export Parametric Solid to ISO 10303 STEP AP214 (.step)"><i data-ic="saveas"></i><span>Export STEP</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-exp-dxf" title="Export 3D STEP / Part as AutoCAD DXF (.dxf) — 4-View or Single Projection"><i data-ic="dxfOut"></i><span>Export DXF</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-exp-stl" title="Export Watertight Binary STL (.stl)"><i data-ic="cube3d"></i><span>Export STL</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-exp-obj" title="Export Wavefront OBJ (.obj)"><i data-ic="layers"></i><span>Export OBJ</span></button>
              <button type="button" class="tb sw-anim-btn" id="sw-snap-png" title="Save High-Res 3D Viewport Snapshot PNG"><i data-ic="png"></i><span>3D PNG</span></button>
            </div>
            <div class="gl">EXPORT 3D / DXF / SNAPSHOT</div>
          </div>
        </div>
        <div id="sw-doc-tabs" class="sw-doc-tabs" hidden></div>
        <div class="sw-body" style="display:flex;flex:1;min-height:0">
          <aside id="sw-tree-dock" class="sw-aside" style="width:240px;border-right:1px solid var(--line);background:var(--panel);overflow:auto;padding:8px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--acc);margin-bottom:6px">FeatureManager Tree</div>
            <div id="sw-feature-tree"></div>
          </aside>
          <main id="sw-viewport-main" style="flex:1;position:relative;min-width:0;overflow:hidden;background:linear-gradient(180deg,#0d1522 0%,#162234 100%)">
            <canvas id="sw-gl-canvas" style="position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:1"></canvas>
            <canvas id="sw-canvas" style="position:relative;width:100%;height:100%;display:block;cursor:grab;z-index:2;background:transparent"></canvas>
            <div id="sw-status-msg" style="position:absolute;left:12px;top:10px;font-size:11px;color:var(--ink);background:var(--panel);border:1px solid var(--line);opacity:0.92;padding:4px 9px;border-radius:6px;pointer-events:none">SolidWorks / STEP 3D Engine Ready · Left-Drag Orbit · Right-Drag Pan · Right-Click Menu · Wheel Zoom</div>
            <div id="sw-fps-hud" class="sw-fps-hud">OpenGL GPU · Ready</div>
          </main>
          <aside id="sw-props-dock" class="sw-aside" style="width:250px;border-left:1px solid var(--line);background:var(--panel);overflow:auto;padding:8px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--acc);margin-bottom:6px">Mass &amp; Properties</div>
            <div id="sw-props-body"></div>
          </aside>
        </div>
      </div>`;

    if (typeof window !== 'undefined' && typeof window.hydrateIcons === 'function') {
      window.hydrateIcons(hostEl);
    }

    let _swSliderRaf = 0;
    const scheduleSliderRender3D = () => {
      if (_swSliderRaf) return;
      _swSliderRaf = (typeof requestAnimationFrame === 'function')
        ? requestAnimationFrame(() => { _swSliderRaf = 0; render3DCanvas(); })
        : (render3DCanvas(), 0);
    };

    const pick3D = async slot => {
      if (typeof window !== 'undefined' && window.native && window.native.openFiles) {
        const files = await window.native.openFiles({
          title: slot === 'B' ? 'Open Rev B 3D STEP / SolidWorks File' : 'Open One or Multiple 3D STEP / SolidWorks / STL / OBJ Files',
          multi: slot !== 'B',
          filters: [{ name: 'SolidWorks & 3D CAD (.step, .stp, .kensho3d, .sldprt, .sldasm, .stl, .obj)', extensions: ['step', 'stp', 'kensho3d', 'sldprt', 'sldasm', 'slddrw', 'stl', 'obj'] }]
        });
        if (files && files.length) await openMultiple3DFiles(files, slot);
      }
    };

    if ($('#sw-new-part')) $('#sw-new-part').onclick = () => {
      const K = getKernel();
      if (!K) return;
      const partName = 'Part_' + Math.floor(Date.now() % 1000);
      SWState.doc = new K.CADDocument(partName);
      SWState.doc.addFeature({ type: 'EXTRUDE_BOSS', name: 'Base_Extrude', params: { kind: 'center_rect', width: 80, height: 50, depth: 15, plane: 'top' } });
      SWState.selectedFeatureId = SWState.doc.features[0].id;
      SWState.undoStack = []; SWState.redoStack = [];
      SWState.modelA = SWState.doc.toModelObject();
      SWState.compareMode = false;
      SWState.explodeFactor = 0;
      if ($('#sw-explode-range')) $('#sw-explode-range').value = 0;
      registerSWDocTab(partName + '.kensho3d', SWState.modelA, SWState.doc);
      setView('iso');
      refreshSW();
      toast('Created new parametric SolidWorks part.');
    };
    if ($('#sw-open-a')) $('#sw-open-a').onclick = () => pick3D('A');
    if ($('#sw-open-b')) $('#sw-open-b').onclick = () => pick3D('B');
    if ($('#sw-sample-btn')) $('#sw-sample-btn').onclick = () => loadSampleSolidWorksPair(false);
    if ($('#sw-sample-cmp-btn')) $('#sw-sample-cmp-btn').onclick = () => loadSampleSolidWorksPair(true);
    if ($('#sw-display-sel')) $('#sw-display-sel').onchange = e => { SWState.displayMode = e.target.value; render3DCanvas(); };
    if ($('#sw-view-sel')) $('#sw-view-sel').onchange = e => setView(e.target.value);
    if ($('#sw-sec-axis')) $('#sw-sec-axis').onchange = e => { SWState.sectionAxis = e.target.value; render3DCanvas(); };
    if ($('#sw-sec-range')) $('#sw-sec-range').oninput = e => { SWState.sectionRatio = Number(e.target.value) / 100; scheduleSliderRender3D(); };
    if ($('#sw-explode-range')) $('#sw-explode-range').oninput = e => { SWState.explodeFactor = Number(e.target.value) / 100; scheduleSliderRender3D(); };
    if ($('#sw-mat-sel')) $('#sw-mat-sel').onchange = e => { SWState.material = e.target.value; if (SWState.doc) SWState.doc.material = SWState.material; renderPropertyManager(); };
    if ($('#sw-exp-dxf-home')) $('#sw-exp-dxf-home').onclick = () => exportSTEPToDXFDialog();
    if ($('#sw-exp-dxf')) $('#sw-exp-dxf').onclick = () => exportSTEPToDXFDialog();
    if ($('#sw-make-2d')) $('#sw-make-2d').onclick = () => exportCurrentModel('dxf4');
    if ($('#sw-undo-btn')) $('#sw-undo-btn').onclick = () => undoSW();
    if ($('#sw-redo-btn')) $('#sw-redo-btn').onclick = () => redoSW();
    if ($('#sw-feat-boss')) $('#sw-feat-boss').onclick = () => runSolidWorksFeature('EXTRUDE_BOSS', { kind: 'center_rect', width: 80, height: 50, depth: 15, offset: SWState.doc ? 12 : 0, plane: 'top' }, 'Extrude_Boss');
    if ($('#sw-feat-cut')) $('#sw-feat-cut').onclick = () => runSolidWorksFeature('EXTRUDE_CUT', { kind: 'circle', cx: 0, cy: 0, diameter: 16, depth: 30, offset: 0, plane: 'top' }, 'Extrude_Cut');
    if ($('#sw-feat-revolve')) $('#sw-feat-revolve').onclick = () => runSolidWorksFeature('REVOLVE_BOSS', { angleDeg: 360, axis: 'z' }, 'Revolve_Boss');
    if ($('#sw-feat-hole')) $('#sw-feat-hole').onclick = () => runSolidWorksFeature('HOLE_WIZARD', { size: 'M6', holeType: 'clearance', depth: 20, positions: [[-25, -15], [25, -15], [25, 15], [-25, 15]] }, 'Hole_Wizard_M6');
    if ($('#sw-feat-fillet')) $('#sw-feat-fillet').onclick = () => runSolidWorksFeature('FILLET', { radius: 6 }, 'Fillet_R6');
    if ($('#sw-feat-chamfer')) $('#sw-feat-chamfer').onclick = () => runSolidWorksFeature('CHAMFER', { distance: 4 }, 'Chamfer_4mm');
    if ($('#sw-feat-shell')) $('#sw-feat-shell').onclick = () => runSolidWorksFeature('SHELL', { thickness: 2.5 }, 'Shell_2.5mm');
    if ($('#sw-feat-pattern')) $('#sw-feat-pattern').onclick = () => runSolidWorksFeature('LINEAR_PATTERN', { countX: 2, countY: 1, spacingX: 95 }, 'Linear_Pattern');
    if ($('#sw-feat-mirror')) $('#sw-feat-mirror').onclick = () => runSolidWorksFeature('MIRROR_BODY', { mirrorPlane: 'right' }, 'Mirror_Body');
    if ($('#sw-check-interf')) $('#sw-check-interf').onclick = () => {
      const K = getKernel();
      const bodies = (SWState.modelA && SWState.modelA.bodies) || [];
      const cols = K ? K.detectAssemblyInterferences(bodies) : [];
      toast(cols.length ? `Interference Detected: ${cols.length} overlapping body pair(s) (${cols[0].bodyA} ∩ ${cols[0].bodyB})` : 'Interference Check Passed: 0 body collisions.');
    };
    if ($('#sw-exp-step')) $('#sw-exp-step').onclick = () => exportCurrentModel('step');
    if ($('#sw-feat-cpattern')) $('#sw-feat-cpattern').onclick = () => runSolidWorksFeature('CIRCULAR_PATTERN', { count: 4, cx: 0, cy: 0 }, 'Circular_Pattern_4x');
    if ($('#sw-mate-btn')) $('#sw-mate-btn').onclick = () => {
      const raw = $('#sw-mate-type') ? $('#sw-mate-type').value : 'COINCIDENT';
      const [mType, mDist] = String(raw).split(':');
      applyQuickMate(mType || 'COINCIDENT', parseFloat(mDist) || 0);
    };
    if ($('#sw-measure-btn')) $('#sw-measure-btn').onclick = () => toggle3DMeasureMode();
    if ($('#sw-toggle-com')) $('#sw-toggle-com').onclick = () => { SWState.showCoM = !SWState.showCoM; $('#sw-toggle-com').classList.toggle('on', SWState.showCoM); render3DCanvas(); };
    if ($('#sw-toggle-planes')) $('#sw-toggle-planes').onclick = () => { SWState.showPlanes = !SWState.showPlanes; $('#sw-toggle-planes').classList.toggle('on', SWState.showPlanes); render3DCanvas(); };
    if ($('#sw-toggle-bg')) $('#sw-toggle-bg').onclick = () => { SWState.background = SWState.background === '#ffffff' ? '#0c111a' : '#ffffff'; render3DCanvas(); };
    if ($('#sw-toggle-gpu')) $('#sw-toggle-gpu').onclick = () => { SWState.useOpenGL = !SWState.useOpenGL; $('#sw-toggle-gpu').classList.toggle('on', SWState.useOpenGL); render3DCanvas(); toast(SWState.useOpenGL ? 'OpenGL GPU 3D Renderer Enabled' : 'Switched to 2D Software Painter'); };
    if ($('#sw-toggle-fps')) $('#sw-toggle-fps').onclick = () => { SWState.showFpsHud = !SWState.showFpsHud; $('#sw-toggle-fps').classList.toggle('on', SWState.showFpsHud); render3DCanvas(); };
    if ($('#sw-color-mode')) $('#sw-color-mode').onchange = e => {
      SWState.colorMode = e.target.value;
      SWState.colorRev++;
      if (window.KenshoGPU && window.KenshoGPU.invalidateCache) window.KenshoGPU.invalidateCache();
      render3DCanvas();
    };
    if ($('#sw-color-picker')) $('#sw-color-picker').oninput = e => {
      SWState.customColor = e.target.value;
      SWState.colorMode = 'custom';
      if ($('#sw-color-mode')) $('#sw-color-mode').value = 'custom';
      SWState.colorRev++;
      if (window.KenshoGPU && window.KenshoGPU.invalidateCache) window.KenshoGPU.invalidateCache();
      render3DCanvas();
    };
    if ($('#sw-color-reset')) $('#sw-color-reset').onclick = () => {
      SWState.colorMode = 'native';
      SWState.selectedBodyId = null;
      if ($('#sw-color-mode')) $('#sw-color-mode').value = 'native';
      SWState.colorRev++;
      if (window.KenshoGPU && window.KenshoGPU.invalidateCache) window.KenshoGPU.invalidateCache();
      render3DCanvas();
      toast('Restored native STEP file colors.');
    };
    if ($('#sw-exp-stl')) $('#sw-exp-stl').onclick = () => exportCurrentModel('stl');
    if ($('#sw-exp-obj')) $('#sw-exp-obj').onclick = () => exportCurrentModel('obj');
    if ($('#sw-snap-png')) $('#sw-snap-png').onclick = () => export3DSnapshotPNG();
    if ($('#sw-save-k3d')) $('#sw-save-k3d').onclick = () => exportCurrentModel('kensho3d');

    const setSWTab = tabName => {
      const target = tabName || 'file';
      hostEl.querySelectorAll('#sw-studio-tabs [data-sw-tab]').forEach(btn => {
        const active = btn.getAttribute('data-sw-tab') === target;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      hostEl.querySelectorAll('#sw-studio-ribbon [data-sw-group]').forEach(grp => {
        grp.hidden = (target !== 'all') && (grp.getAttribute('data-sw-group') !== target);
      });
    };
    hostEl.querySelectorAll('#sw-studio-tabs [data-sw-tab]').forEach(btn => {
      btn.onclick = () => setSWTab(btn.getAttribute('data-sw-tab'));
    });
    setSWTab('file');

    if ($('#sw-toggle-tree-dock')) {
      $('#sw-toggle-tree-dock').onclick = () => {
        const d = $('#sw-tree-dock');
        if (!d) return;
        const hidden = d.classList.toggle('is-collapsed');
        $('#sw-toggle-tree-dock').classList.toggle('on', !hidden);
        render3DCanvas();
      };
    }
    if ($('#sw-toggle-props-dock')) {
      $('#sw-toggle-props-dock').onclick = () => {
        const d = $('#sw-props-dock');
        if (!d) return;
        const hidden = d.classList.toggle('is-collapsed');
        $('#sw-toggle-props-dock').classList.toggle('on', !hidden);
        render3DCanvas();
      };
    }

    const closeSWContextMenu = () => {
      const existing = document.getElementById('sw-ctx-menu');
      if (existing) existing.remove();
    };
    const showSWContextMenu = (clientX, clientY) => {
      closeSWContextMenu();
      const menu = document.createElement('div');
      menu.id = 'sw-ctx-menu';
      menu.className = 'dd sw-ctx-menu';
      const items = [
        { lbl: 'Fit & Reset View (Isometric)', fn: () => setView('iso') },
        { lbl: 'Front View', fn: () => setView('front') },
        { lbl: 'Top View', fn: () => setView('top') },
        { lbl: 'Right View', fn: () => setView('right') },
        { sep: true },
        { lbl: 'Display: Shaded w/ Edges', fn: () => { SWState.displayMode = 'shaded_edges'; if ($('#sw-display-sel')) $('#sw-display-sel').value = 'shaded_edges'; render3DCanvas(); } },
        { lbl: 'Display: Shaded (No Edges)', fn: () => { SWState.displayMode = 'shaded'; if ($('#sw-display-sel')) $('#sw-display-sel').value = 'shaded'; render3DCanvas(); } },
        { lbl: 'Display: Hidden Lines Removed', fn: () => { SWState.displayMode = 'hlr'; if ($('#sw-display-sel')) $('#sw-display-sel').value = 'hlr'; render3DCanvas(); } },
        { lbl: 'Display: Wireframe', fn: () => { SWState.displayMode = 'wireframe'; if ($('#sw-display-sel')) $('#sw-display-sel').value = 'wireframe'; render3DCanvas(); } },
        { sep: true },
        { lbl: 'Color: STEP Native Colors', fn: () => { if ($('#sw-color-reset')) $('#sw-color-reset').click(); } },
        { lbl: 'Color: Material Finish', fn: () => { SWState.colorMode = 'material'; if ($('#sw-color-mode')) $('#sw-color-mode').value = 'material'; SWState.colorRev++; render3DCanvas(); } },
        { lbl: 'Color: Distinct Per-Body', fn: () => { SWState.colorMode = 'per_body'; if ($('#sw-color-mode')) $('#sw-color-mode').value = 'per_body'; SWState.colorRev++; render3DCanvas(); } },
        { lbl: 'Color: Pick Custom Color…', fn: () => { if ($('#sw-color-picker')) $('#sw-color-picker').click(); } },
        { sep: true },
        { lbl: (SWState.useOpenGL ? '✓ ' : '') + 'OpenGL GPU Acceleration', fn: () => { if ($('#sw-toggle-gpu')) $('#sw-toggle-gpu').click(); } },
        { lbl: (SWState.showFpsHud ? '✓ ' : '') + 'Show Live FPS HUD', fn: () => { if ($('#sw-toggle-fps')) $('#sw-toggle-fps').click(); } },
        { lbl: 'Switch Backdrop (Dark / Light)', fn: () => { if ($('#sw-toggle-bg')) $('#sw-toggle-bg').click(); } },
        { lbl: '3D Point-to-Point Measure', fn: () => toggle3DMeasureMode() },
        ...(SWState.explodeFactor > 0.01 ? [{ lbl: 'Reset Exploded View (0%)', fn: () => { SWState.explodeFactor = 0; if ($('#sw-explode-range')) $('#sw-explode-range').value = 0; render3DCanvas(); } }] : []),
        { sep: true },
        { lbl: 'Export as AutoCAD DXF (.dxf)…', fn: () => exportSTEPToDXFDialog() },
        { lbl: 'Open 4-View Drawing in CAD Studio', fn: () => exportCurrentModel('dxf4') },
        { lbl: 'Export STEP (.step)', fn: () => exportCurrentModel('step') },
        { lbl: 'Export STL (.stl)', fn: () => exportCurrentModel('stl') },
        { lbl: 'Save 3D Snapshot (.png)', fn: () => export3DSnapshotPNG() }
      ];
      menu.style.position = 'fixed';
      menu.style.zIndex = '99999';
      menu.style.visibility = 'hidden';
      items.forEach(it => {
        if (it.sep) {
          const s = document.createElement('div');
          s.className = 'msep';
          menu.appendChild(s);
          return;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mi';
        btn.textContent = it.lbl;
        btn.onclick = () => { closeSWContextMenu(); it.fn(); };
        menu.appendChild(btn);
      });
      document.body.appendChild(menu);
      const rectM = menu.getBoundingClientRect();
      const mw = rectM.width || 236;
      const mh = rectM.height || 380;
      const x = Math.max(8, Math.min(window.innerWidth - mw - 8, clientX));
      const y = Math.max(8, Math.min(window.innerHeight - mh - 8, clientY));
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      menu.style.visibility = 'visible';
    };
    document.addEventListener('pointerdown', e => {
      const m = document.getElementById('sw-ctx-menu');
      if (m && !m.contains(e.target)) closeSWContextMenu();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeSWContextMenu();
    });

    const cv = $('#sw-canvas');
    if (cv) {
      let dragging = false, panDrag = false, lx = 0, ly = 0, downX = 0, downY = 0, downBtn = -1, dragMoved = 0;
      let _rafPending = false;
      const scheduleRender3D = () => {
        if (_rafPending) return;
        _rafPending = true;
        const cb = () => { _rafPending = false; render3DCanvas(); };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(cb);
        else cb();
      };
      cv.addEventListener('pointerdown', e => {
        closeSWContextMenu();
        if (SWState.measureMode && e.button === 0 && !e.shiftKey) {
          const hitPt = pickNearest3DVertex(e.clientX, e.clientY);
          if (hitPt) {
            if (SWState.measurePts.length >= 2) SWState.measurePts = [];
            SWState.measurePts.push(hitPt);
            if (SWState.measurePts.length === 2) {
              const [a, b] = SWState.measurePts;
              const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
              toast(`3D Measure: ${d.toFixed(3)} mm (ΔX=${(b[0]-a[0]).toFixed(2)}, ΔY=${(b[1]-a[1]).toFixed(2)}, ΔZ=${(b[2]-a[2]).toFixed(2)})`);
            } else {
              toast(`3D Measure P1: (${hitPt[0].toFixed(2)}, ${hitPt[1].toFixed(2)}, ${hitPt[2].toFixed(2)}) — click second vertex.`);
            }
            scheduleRender3D();
            return;
          }
        }
        dragging = true;
        downBtn = e.button;
        downX = e.clientX; downY = e.clientY; dragMoved = 0;
        panDrag = e.shiftKey || e.button === 2 || e.button === 1;
        lx = e.clientX; ly = e.clientY;
        try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      });
      cv.addEventListener('pointermove', e => {
        if (!dragging) return;
        const dx = e.clientX - lx, dy = e.clientY - ly;
        dragMoved += Math.hypot(dx, dy);
        lx = e.clientX; ly = e.clientY;
        if (panDrag) { SWState.panX += dx; SWState.panY += dy; }
        else { SWState.yaw += dx * 0.01; SWState.pitch = Math.max(-1.55, Math.min(1.55, SWState.pitch + dy * 0.01)); }
        scheduleRender3D();
      });
      cv.addEventListener('pointerup', e => {
        try { if (cv.hasPointerCapture && cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId); } catch (_) {}
        dragging = false;
        downBtn = -1;
      });
      cv.addEventListener('pointercancel', () => {
        dragging = false;
        downBtn = -1;
      });
      cv.addEventListener('wheel', e => {
        closeSWContextMenu();
        e.preventDefault();
        SWState.zoom = Math.max(0.15, Math.min(20, SWState.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
        scheduleRender3D();
      }, { passive: false });
      cv.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        if (dragMoved < 8) showSWContextMenu(e.clientX, e.clientY);
      });
      cv.addEventListener('dragover', e => { e.preventDefault(); });
      cv.addEventListener('drop', async e => {
        e.preventDefault();
        const files = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
        if (files.length) await openMultiple3DFiles(files, 'A');
      });
    }
    if (typeof window !== 'undefined' && !SWState._resizeBound) {
      SWState._resizeBound = true;
      window.addEventListener('resize', () => {
        const host = $('#sw-studio-host');
        if (host && !host.hidden) render3DCanvas();
      });
      window.addEventListener('keydown', e => {
        const host = $('#sw-studio-host');
        if (!host || host.hidden) return;
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) redoSW(); else undoSW();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
          e.preventDefault(); redoSW();
        } else if (e.key === 'f' || e.key === 'F') {
          setView('iso');
        } else if (e.key === 'Escape') {
          if (SWState.measureMode) toggle3DMeasureMode();
          else if (SWState.selectedFeatureId) { SWState.selectedFeatureId = null; refreshSW(); }
        } else if (!e.ctrlKey && !e.altKey && !e.metaKey) {
          const vMap = { '1': 'front', '2': 'back', '3': 'left', '4': 'right', '5': 'top', '6': 'iso' };
          if (vMap[e.key]) setView(vMap[e.key]);
        }
      });
    }

    SWState.mounted = true;
    refreshSW();
  }

  return {
    SWState,
    VIEW_ANGLES,
    mountSolidWorksUI,
    load3DFileEntry,
    loadSampleSolidWorksPair,
    make2DDrawingInCADStudio,
    ensureParametricDoc,
    runSolidWorksFeature,
    editFeatureParams,
    undoSW,
    redoSW,
    exportCurrentModel,
    exportSTEPToDXFDialog,
    openMultiple3DFiles,
    switchSWDocTab,
    closeSWDocTab,
    toggle3DMeasureMode,
    applyQuickMate,
    export3DSnapshotPNG,
    setView,
    render3DCanvas,
    refreshSW
  };
});
