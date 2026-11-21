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
    background: '#0c111a'
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
  const getKernel = () => (typeof CADKernel !== 'undefined' ? CADKernel : (typeof window !== 'undefined' ? window.CADKernel : null));

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

  function runSolidWorksFeature(type, params = {}, label = '') {
    const K = getKernel();
    if (!K) return null;
    if (!SWState.doc) SWState.doc = new K.CADDocument('Part1');
    const feat = SWState.doc.addFeature({ type, name: label || `${type}_${SWState.doc.features.length + 1}`, params });
    syncDocToViewport(`Added SolidWorks feature: ${feat.name}`);
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

    // SolidWorks gradient studio backdrop
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
      // Painter's algorithm shaded triangles
      if (SWState.displayMode === 'shaded_edges' || SWState.displayMode === 'shaded') {
        const lightDir = [0.42, -0.58, 0.70];
        const drawList = [];
        for (const body of model.bodies) {
          if (body.visible === false) continue;
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

      // Crisp B-Rep edges (Shaded+Edges, HLR, Wireframe)
      if (SWState.displayMode !== 'shaded') {
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
      items.push(`<div class="sw-tree-sec">Parametric Features (${SWState.doc.features.length})</div>`);
      SWState.doc.features.forEach(f => {
        const supStyle = f.suppressed ? 'opacity:0.45;text-decoration:line-through' : '';
        items.push(
          `<div class="sw-tree-item" style="display:flex;align-items:center;justify-content:space-between;${supStyle}">` +
          `<span>⚙ ${f.name}</span>` +
          `<span style="display:flex;gap:4px">` +
          `<button type="button" data-sw-sup="${f.id}" title="Suppress / Unsuppress" style="background:none;border:none;color:#38bdf8;cursor:pointer">${f.suppressed ? '▶' : '⏸'}</button>` +
          `<button type="button" data-sw-del="${f.id}" title="Delete Feature" style="background:none;border:none;color:#f87171;cursor:pointer">✕</button>` +
          `</span></div>`
        );
      });
    }
    if (m.holes && m.holes.length) {
      items.push(`<div class="sw-tree-sec">Holes &amp; Circular Bores (${m.holes.length})</div>`);
      m.holes.slice(0, 20).forEach((h, i) => {
        items.push(`<div class="sw-tree-item">⌀ Hole ${i + 1}: Ø${h.diameter.toFixed(2)} ${m.unitName || 'mm'}</div>`);
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
    tree.querySelectorAll('[data-sw-sup]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        if (SWState.doc) { SWState.doc.toggleSuppress(btn.dataset.swSup); syncDocToViewport('Rebuilt parametric feature tree'); }
      };
    });
    tree.querySelectorAll('[data-sw-del]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        if (SWState.doc) { SWState.doc.removeFeature(btn.dataset.swDel); syncDocToViewport('Removed feature & rebuilt solid'); }
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
    props.innerHTML = `
      <div style="display:grid;gap:6px;font-size:11.5px;padding:8px">
        <div><b>Bounding Box:</b> ${s.sizeX.toFixed(2)} × ${s.sizeY.toFixed(2)} × ${s.sizeZ.toFixed(2)} ${u}</div>
        <div><b>Volume:</b> ${s.volumeCm3.toFixed(2)} cm³ (${s.volumeMm3.toFixed(0)} mm³)</div>
        <div><b>Surface Area:</b> ${(s.surfaceAreaMm2 / 100).toFixed(2)} cm²</div>
        <div><b>Estimated Mass:</b> ${massG >= 1000 ? (massG / 1000).toFixed(3) + ' kg' : massG.toFixed(1) + ' g'}</div>
        <div><b>Geometry:</b> ${m.bodies.length} Body · ${s.totalFaces} Faces · ${s.totalEdges} Edges · ${s.holeCount} Holes</div>
        ${diffHtml}
      </div>`;
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

  function mountSolidWorksUI(hostEl) {
    if (!hostEl || SWState.mounted) return;
    const eng = getEngine();
    const matOpts = Object.keys((eng && eng.MATERIALS) || { 'Aluminum 6061-T6': 1 }).map(m => `<option value="${m}">${m}</option>`).join('');
    hostEl.innerHTML = `
      <div class="sw-shell" style="display:flex;flex-direction:column;height:100%;width:100%;background:#0b1018;color:#e2e8f0">
        <div class="sw-ribbon" style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid rgba(148,163,184,0.18);background:#0f172a;flex-wrap:wrap">
          <button type="button" class="tb" id="sw-open-a" title="Open STEP (.step/.stp), SolidWorks (.sldprt/.sldasm), STL or OBJ"><span>Open 3D</span></button>
          <button type="button" class="tb" id="sw-open-b" title="Open Rev B STEP/STL for 3D Revision Compare"><span>Compare 3D</span></button>
          <button type="button" class="tb" id="sw-sample-btn" title="Load Sample SolidWorks STEP Bracket"><span>Sample Part</span></button>
          <button type="button" class="tb" id="sw-sample-cmp-btn" title="Load Sample Rev A vs Rev B 3D STEP Compare"><span>Sample Diff</span></button>
          <span style="opacity:.25">|</span>
          <label style="font-size:11px;display:flex;align-items:center;gap:4px">Display
            <select id="sw-display-sel" style="height:22px;font-size:11px">
              <option value="shaded_edges" selected>Shaded w/ Edges</option>
              <option value="shaded">Shaded</option>
              <option value="hlr">Hidden Lines Removed</option>
              <option value="wireframe">Wireframe</option>
            </select>
          </label>
          <label style="font-size:11px;display:flex;align-items:center;gap:4px">View
            <select id="sw-view-sel" style="height:22px;font-size:11px">
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
          <label style="font-size:11px;display:flex;align-items:center;gap:4px">Section
            <select id="sw-sec-axis" style="height:22px;font-size:11px">
              <option value="none">Off</option>
              <option value="x">X Plane</option>
              <option value="y">Y Plane</option>
              <option value="z">Z Plane</option>
            </select>
            <input type="range" id="sw-sec-range" min="5" max="95" value="50" style="width:64px" />
          </label>
          <label style="font-size:11px;display:flex;align-items:center;gap:4px">Explode
            <input type="range" id="sw-explode-range" min="0" max="150" value="0" style="width:64px" />
          </label>
          <label style="font-size:11px;display:flex;align-items:center;gap:4px">Material
            <select id="sw-mat-sel" style="height:22px;font-size:11px">${matOpts}</select>
          </label>
          <button type="button" class="tb" id="sw-make-2d" title="Generate 4-View SolidWorks 2D Engineering Drawing (Front/Top/Right/Iso + Title Block) in DXF"><span>4-View Drawing</span></button>
          <span style="opacity:.25">|</span>
          <button type="button" class="tb" id="sw-feat-boss" title="Parametric Extrude Boss/Base"><span>+ Boss</span></button>
          <button type="button" class="tb" id="sw-feat-cut" title="Parametric Extrude Cut"><span>- Cut</span></button>
          <button type="button" class="tb" id="sw-feat-revolve" title="Revolve Boss 360°"><span>Revolve</span></button>
          <button type="button" class="tb" id="sw-feat-hole" title="ISO Metric Hole Wizard (M3-M20)"><span>Hole Wizard</span></button>
          <button type="button" class="tb" id="sw-feat-fillet" title="Apply Edge Fillet"><span>Fillet</span></button>
          <button type="button" class="tb" id="sw-feat-chamfer" title="Apply Edge Chamfer"><span>Chamfer</span></button>
          <button type="button" class="tb" id="sw-feat-shell" title="Hollow Shell Wall Thickness"><span>Shell</span></button>
          <button type="button" class="tb" id="sw-feat-pattern" title="Linear Feature Pattern"><span>Lin Pattern</span></button>
          <button type="button" class="tb" id="sw-feat-cpattern" title="Circular Feature Pattern (4x 360°)"><span>Circ Pattern</span></button>
          <button type="button" class="tb" id="sw-feat-mirror" title="Mirror Solid Body"><span>Mirror</span></button>
          <button type="button" class="tb" id="sw-mate-btn" title="Apply Coincident Assembly Mate Between Last Two Solid Bodies"><span>Mate</span></button>
          <button type="button" class="tb" id="sw-measure-btn" title="3D Point-to-Point Measure (Distance &amp; ΔX/ΔY/ΔZ)"><span>3D Measure</span></button>
          <button type="button" class="tb" id="sw-check-interf" title="Run Assembly Interference / Collision Detection"><span>Interference</span></button>
          <button type="button" class="tb on" id="sw-toggle-com" title="Toggle 3D Center of Mass (CoM) Crosshair"><span>CoM</span></button>
          <button type="button" class="tb on" id="sw-toggle-planes" title="Toggle Reference Origin Axes / Planes"><span>Axes</span></button>
          <button type="button" class="tb" id="sw-toggle-bg" title="Switch Dark Studio / White Paper Backdrop"><span>Backdrop</span></button>
          <button type="button" class="tb" id="sw-exp-step" title="Export Parametric Solid to ISO 10303 STEP AP214 (.step)"><span>Export STEP</span></button>
          <button type="button" class="tb" id="sw-exp-stl" title="Export Watertight Binary STL (.stl)"><span>Export STL</span></button>
          <button type="button" class="tb" id="sw-exp-obj" title="Export Wavefront OBJ (.obj)"><span>Export OBJ</span></button>
          <button type="button" class="tb" id="sw-snap-png" title="Save High-Res 3D Viewport Snapshot PNG"><span>3D PNG</span></button>
          <button type="button" class="tb" id="sw-save-k3d" title="Save Editable Parametric SolidWorks Project (.kensho3d)"><span>Save .kensho3d</span></button>
        </div>
        <div style="display:flex;flex:1;min-height:0">
          <aside style="width:240px;border-right:1px solid rgba(148,163,184,0.16);background:#0d131d;overflow:auto;padding:6px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#38bdf8;margin-bottom:6px">FeatureManager Tree</div>
            <div id="sw-feature-tree"></div>
          </aside>
          <main style="flex:1;position:relative;min-width:0;overflow:hidden">
            <canvas id="sw-canvas" style="width:100%;height:100%;display:block;cursor:grab"></canvas>
            <div id="sw-status-msg" style="position:absolute;left:12px;top:10px;font-size:11px;color:#94a3b8;background:rgba(15,23,42,0.72);padding:4px 8px;border-radius:6px;pointer-events:none">SolidWorks / STEP 3D Engine Ready · Drag to Orbit · Shift+Drag to Pan · Wheel to Zoom</div>
          </main>
          <aside style="width:250px;border-left:1px solid rgba(148,163,184,0.16);background:#0d131d;overflow:auto;padding:6px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#38bdf8;margin-bottom:6px">Mass &amp; Properties</div>
            <div id="sw-props-body"></div>
          </aside>
        </div>
      </div>`;

    const pick3D = async slot => {
      if (typeof window !== 'undefined' && window.native && window.native.openFiles) {
        const files = await window.native.openFiles({
          title: slot === 'B' ? 'Open Rev B 3D STEP / SolidWorks File' : 'Open SolidWorks / STEP / STL / OBJ 3D File',
          multi: false,
          filters: [{ name: 'SolidWorks & 3D CAD (.step, .stp, .kensho3d, .sldprt, .sldasm, .stl, .obj)', extensions: ['step', 'stp', 'kensho3d', 'sldprt', 'sldasm', 'slddrw', 'stl', 'obj'] }]
        });
        if (files && files[0]) await load3DFileEntry(files[0], slot);
      }
    };

    if ($('#sw-open-a')) $('#sw-open-a').onclick = () => pick3D('A');
    if ($('#sw-open-b')) $('#sw-open-b').onclick = () => pick3D('B');
    if ($('#sw-sample-btn')) $('#sw-sample-btn').onclick = () => loadSampleSolidWorksPair(false);
    if ($('#sw-sample-cmp-btn')) $('#sw-sample-cmp-btn').onclick = () => loadSampleSolidWorksPair(true);
    if ($('#sw-display-sel')) $('#sw-display-sel').onchange = e => { SWState.displayMode = e.target.value; render3DCanvas(); };
    if ($('#sw-view-sel')) $('#sw-view-sel').onchange = e => setView(e.target.value);
    if ($('#sw-sec-axis')) $('#sw-sec-axis').onchange = e => { SWState.sectionAxis = e.target.value; render3DCanvas(); };
    if ($('#sw-sec-range')) $('#sw-sec-range').oninput = e => { SWState.sectionRatio = Number(e.target.value) / 100; render3DCanvas(); };
    if ($('#sw-explode-range')) $('#sw-explode-range').oninput = e => { SWState.explodeFactor = Number(e.target.value) / 100; render3DCanvas(); };
    if ($('#sw-mat-sel')) $('#sw-mat-sel').onchange = e => { SWState.material = e.target.value; renderPropertyManager(); };
    if ($('#sw-make-2d')) $('#sw-make-2d').onclick = () => exportCurrentModel('dxf4');
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
    if ($('#sw-mate-btn')) $('#sw-mate-btn').onclick = () => applyQuickMate('COINCIDENT', 0);
    if ($('#sw-measure-btn')) $('#sw-measure-btn').onclick = () => toggle3DMeasureMode();
    if ($('#sw-toggle-com')) $('#sw-toggle-com').onclick = () => { SWState.showCoM = !SWState.showCoM; $('#sw-toggle-com').classList.toggle('on', SWState.showCoM); render3DCanvas(); };
    if ($('#sw-toggle-planes')) $('#sw-toggle-planes').onclick = () => { SWState.showPlanes = !SWState.showPlanes; $('#sw-toggle-planes').classList.toggle('on', SWState.showPlanes); render3DCanvas(); };
    if ($('#sw-toggle-bg')) $('#sw-toggle-bg').onclick = () => { SWState.background = SWState.background === '#ffffff' ? '#0c111a' : '#ffffff'; render3DCanvas(); };
    if ($('#sw-exp-stl')) $('#sw-exp-stl').onclick = () => exportCurrentModel('stl');
    if ($('#sw-exp-obj')) $('#sw-exp-obj').onclick = () => exportCurrentModel('obj');
    if ($('#sw-snap-png')) $('#sw-snap-png').onclick = () => export3DSnapshotPNG();
    if ($('#sw-save-k3d')) $('#sw-save-k3d').onclick = () => exportCurrentModel('kensho3d');

    const cv = $('#sw-canvas');
    if (cv) {
      let dragging = false, panDrag = false, lx = 0, ly = 0;
      cv.addEventListener('pointerdown', e => {
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
            render3DCanvas();
            return;
          }
        }
        dragging = true;
        panDrag = e.shiftKey || e.button === 2 || e.button === 1;
        lx = e.clientX; ly = e.clientY;
        cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener('pointermove', e => {
        if (!dragging) return;
        const dx = e.clientX - lx, dy = e.clientY - ly;
        lx = e.clientX; ly = e.clientY;
        if (panDrag) { SWState.panX += dx; SWState.panY += dy; }
        else { SWState.yaw += dx * 0.01; SWState.pitch = Math.max(-1.55, Math.min(1.55, SWState.pitch + dy * 0.01)); }
        render3DCanvas();
      });
      cv.addEventListener('pointerup', () => { dragging = false; });
      cv.addEventListener('wheel', e => {
        e.preventDefault();
        SWState.zoom = Math.max(0.15, Math.min(20, SWState.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
        render3DCanvas();
      }, { passive: false });
      cv.addEventListener('contextmenu', e => e.preventDefault());
      cv.addEventListener('dragover', e => { e.preventDefault(); });
      cv.addEventListener('drop', async e => {
        e.preventDefault();
        const files = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
        if (files[0]) await load3DFileEntry(files[0], 'A');
        if (files[1]) await load3DFileEntry(files[1], 'B');
      });
    }
    if (typeof window !== 'undefined' && !SWState._resizeBound) {
      SWState._resizeBound = true;
      window.addEventListener('resize', () => {
        const host = $('#sw-studio-host');
        if (host && !host.hidden) render3DCanvas();
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
    exportCurrentModel,
    toggle3DMeasureMode,
    applyQuickMate,
    export3DSnapshotPNG,
    setView,
    render3DCanvas,
    refreshSW
  };
});
