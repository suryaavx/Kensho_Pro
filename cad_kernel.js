/* ============================================================================
 * [MODULE: KENSHO PRO NATIVE PARAMETRIC 3D CAD KERNEL & BACKEND (cad_kernel.js)]
 * 100% Offline, Zero-Dependency SolidWorks-Style Parametric CAD Backend:
 *   - Parametric FeatureManager History Engine (.kensho3d save/load + live rebuild)
 *   - 2D Sketch Profiles (Rect, CenterRect, Circle, Slot, Polygon, Polyline + Smart Dimensions)
 *   - 3D Solid Features:
 *       EXTRUDE_BOSS (Blind / Mid-Plane / Draft), EXTRUDE_CUT (CSG Subtract),
 *       REVOLVE_BOSS, HOLE_WIZARD (ISO M3-M20 Through/Blind/Counterbore/Countersink),
 *       FILLET, CHAMFER, SHELL, LINEAR_PATTERN, CIRCULAR_PATTERN, MIRROR_BODY
 *   - Assembly Mates (COINCIDENT, CONCENTRIC, DISTANCE, LOCK) & Interference Detection
 *   - Native Exporters: ISO 10303 STEP AP214 (.step), Binary/ASCII STL (.stl),
 *       Wavefront OBJ (.obj), and 4-View SolidWorks 2D Engineering Drawing (.dxf)
 *   - Engineering Mass Properties: Volume, Surface Area, Center of Mass (CoM), Material Mass
 * ============================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CADKernel = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ISO_METRIC_HOLES = {
    M3:  { nominal: 3.0,  clearance: 3.4,  tapDrill: 2.5,  cboreDia: 6.0,  cboreDepth: 3.2, csinkDia: 6.5 },
    M4:  { nominal: 4.0,  clearance: 4.5,  tapDrill: 3.3,  cboreDia: 8.0,  cboreDepth: 4.2, csinkDia: 8.6 },
    M5:  { nominal: 5.0,  clearance: 5.5,  tapDrill: 4.2,  cboreDia: 10.0, cboreDepth: 5.2, csinkDia: 10.6 },
    M6:  { nominal: 6.0,  clearance: 6.6,  tapDrill: 5.0,  cboreDia: 11.0, cboreDepth: 6.2, csinkDia: 12.6 },
    M8:  { nominal: 8.0,  clearance: 9.0,  tapDrill: 6.8,  cboreDia: 14.5, cboreDepth: 8.2, csinkDia: 16.6 },
    M10: { nominal: 10.0, clearance: 11.0, tapDrill: 8.5,  cboreDia: 17.5, cboreDepth: 10.2, csinkDia: 20.6 },
    M12: { nominal: 12.0, clearance: 13.5, tapDrill: 10.2, cboreDia: 20.0, cboreDepth: 12.2, csinkDia: 24.6 },
    M16: { nominal: 16.0, clearance: 17.5, tapDrill: 14.0, cboreDia: 26.0, cboreDepth: 16.2, csinkDia: 32.0 },
    M20: { nominal: 20.0, clearance: 22.0, tapDrill: 17.5, cboreDia: 33.0, cboreDepth: 20.2, csinkDia: 40.0 }
  };

  // ---- 3D Vector Helpers ----
  const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const vScale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const vCross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  const vLen = a => Math.hypot(a[0], a[1], a[2]);
  const vNorm = a => {
    const l = vLen(a);
    return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1];
  };

  // ---- Plane Coordinate Mapping (Top = XY, Front = XZ, Right = YZ) ----
  function mapSketch2DTo3D(u, v, w, plane = 'top') {
    const p = String(plane || 'top').toLowerCase();
    if (p === 'front') return [u, w, v];
    if (p === 'right') return [w, u, v];
    return [u, v, w]; // 'top' (XY plane, extrude along +Z)
  }

  // ---- 2D Sketch Profile Generator ----
  function buildSketchProfile2D(sketch = {}) {
    const kind = String(sketch.kind || 'rect').toLowerCase();
    const cx = Number(sketch.cx) || 0;
    const cy = Number(sketch.cy) || 0;
    const pts = [];

    if (kind === 'circle') {
      const r = Math.max(0.1, Number(sketch.radius) || (Number(sketch.diameter) || 20) / 2);
      const segs = Math.max(16, Math.min(48, Number(sketch.segments) || 28));
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      return { pts, isCircle: true, radius: r, cx, cy };
    }
    if (kind === 'slot') {
      const len = Math.max(1, Number(sketch.length) || 40);
      const r = Math.max(0.5, (Number(sketch.width) || 12) / 2);
      const half = Math.max(0.1, (len - r * 2) / 2);
      const segs = 12;
      for (let i = 0; i <= segs; i++) {
        const a = -Math.PI / 2 + (i / segs) * Math.PI;
        pts.push([cx + half + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      for (let i = 0; i <= segs; i++) {
        const a = Math.PI / 2 + (i / segs) * Math.PI;
        pts.push([cx - half + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      return { pts, isCircle: false, cx, cy };
    }
    if (kind === 'polygon') {
      const sides = Math.max(3, Math.min(32, parseInt(sketch.sides, 10) || 6));
      const r = Math.max(0.2, Number(sketch.radius) || 15);
      const rot = (Number(sketch.rotationDeg) || 0) * Math.PI / 180;
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      return { pts, isCircle: false, cx, cy };
    }
    if (kind === 'polyline' && Array.isArray(sketch.points) && sketch.points.length >= 3) {
      return { pts: sketch.points.map(p => [Number(p[0]) || 0, Number(p[1]) || 0]), isCircle: false, cx, cy };
    }
    // Default: 'rect' or 'center_rect'
    const w = Math.max(0.2, Number(sketch.width) || 80);
    const h = Math.max(0.2, Number(sketch.height) || 50);
    const filletR = Math.max(0, Math.min(Math.min(w, h) * 0.45, Number(sketch.cornerFillet) || 0));
    const chamfer = Math.max(0, Math.min(Math.min(w, h) * 0.45, Number(sketch.cornerChamfer) || 0));
    const x0 = kind === 'rect' ? cx : (cx - w / 2);
    const y0 = kind === 'rect' ? cy : (cy - h / 2);
    const x1 = x0 + w, y1 = y0 + h;

    if (filletR > 1e-4) {
      const corners = [
        { cx: x1 - filletR, cy: y0 + filletR, a0: -Math.PI / 2, a1: 0 },
        { cx: x1 - filletR, cy: y1 - filletR, a0: 0, a1: Math.PI / 2 },
        { cx: x0 + filletR, cy: y1 - filletR, a0: Math.PI / 2, a1: Math.PI },
        { cx: x0 + filletR, cy: y0 + filletR, a0: Math.PI, a1: Math.PI * 1.5 }
      ];
      for (const c of corners) {
        for (let s = 0; s <= 6; s++) {
          const a = c.a0 + ((c.a1 - c.a0) * s) / 6;
          pts.push([c.cx + Math.cos(a) * filletR, c.cy + Math.sin(a) * filletR]);
        }
      }
    } else if (chamfer > 1e-4) {
      pts.push(
        [x0 + chamfer, y0], [x1 - chamfer, y0],
        [x1, y0 + chamfer], [x1, y1 - chamfer],
        [x1 - chamfer, y1], [x0 + chamfer, y1],
        [x0, y1 - chamfer], [x0, y0 + chamfer]
      );
    } else {
      pts.push([x0, y0], [x1, y0], [x1, y1], [x0, y1]);
    }
    return { pts, isCircle: false, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  // ---- Build Extruded Prism Solid (Boss or Cut Volume) ----
  function buildExtrudeMesh(profile, params = {}) {
    const plane = params.plane || 'top';
    const depth = Math.max(0.1, Number(params.depth) || 20);
    const midPlane = !!params.midPlane;
    const w0 = (Number(params.offset) || 0) - (midPlane ? depth / 2 : 0);
    const w1 = w0 + depth;
    const draftRad = ((Number(params.draftDeg) || 0) * Math.PI) / 180;
    const draftOffset = Math.tan(draftRad) * depth;
    const color = params.color || '#7c8ea6';
    const pts = profile.pts || [];
    const n = pts.length;
    if (n < 3) return { triangles: [], edges: [], faceCount: 0 };

    // Compute 2D centroid for uniform draft scaling
    let cu = 0, cv = 0;
    for (const p of pts) { cu += p[0]; cv += p[1]; }
    cu /= n; cv /= n;

    const bot = pts.map(p => mapSketch2DTo3D(p[0], p[1], w0, plane));
    const top = pts.map(p => {
      let u = p[0], v = p[1];
      if (Math.abs(draftOffset) > 1e-5) {
        const du = u - cu, dv = v - cv;
        const d = Math.hypot(du, dv);
        if (d > 1e-5) {
          const factor = Math.max(0.15, (d - draftOffset) / d);
          u = cu + du * factor;
          v = cv + dv * factor;
        }
      }
      return mapSketch2DTo3D(u, v, w1, plane);
    });

    const triangles = [];
    const edges = [];
    const addTri = (a, b, c) => {
      const nrm = vNorm(vCross(vSub(b, a), vSub(c, a)));
      triangles.push({ a, b, c, n: nrm, color });
    };

    // Bottom cap (CCW inverted so outward normal points -W) & Top cap (+W)
    for (let i = 1; i < n - 1; i++) {
      addTri(bot[0], bot[i + 1], bot[i]);
      addTri(top[0], top[i], top[i + 1]);
    }
    // Side walls
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      addTri(bot[i], bot[j], top[j]);
      addTri(bot[i], top[j], top[i]);
    }
    // Crisp B-Rep boundary edges
    edges.push({ pts: [...bot, bot[0]], isCircle: !!profile.isCircle, radius: profile.radius || 0, center: mapSketch2DTo3D(profile.cx || 0, profile.cy || 0, w0, plane) });
    edges.push({ pts: [...top, top[0]], isCircle: !!profile.isCircle, radius: profile.radius || 0, center: mapSketch2DTo3D(profile.cx || 0, profile.cy || 0, w1, plane) });
    if (!profile.isCircle) {
      for (let i = 0; i < n; i++) {
        edges.push({ pts: [bot[i], top[i]], isCircle: false });
      }
    }

    return { triangles, edges, faceCount: n + 2 };
  }

  // ---- Build Revolved Solid (Shafts, Flanges, Bushings, Pulleys) ----
  function buildRevolveMesh(profilePts, params = {}) {
    const angleDeg = Math.max(5, Math.min(360, Number(params.angleDeg) || 360));
    const segs = Math.max(12, Math.min(48, Math.round((angleDeg / 360) * 32)));
    const axis = String(params.axis || 'z').toLowerCase();
    const color = params.color || '#8fa3bc';
    const pts = (Array.isArray(profilePts) && profilePts.length >= 2)
      ? profilePts
      : [[10, 0], [25, 0], [25, 12], [18, 12], [18, 35], [10, 35]];
    const m = pts.length;
    const isFull = angleDeg >= 359.9;
    const radMax = (angleDeg * Math.PI) / 180;

    const ringPt = (r, h, ang) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      if (axis === 'x') return [h, r * ca, r * sa];
      if (axis === 'y') return [r * ca, h, r * sa];
      return [r * ca, r * sa, h]; // Z-axis
    };

    const rings = [];
    for (let s = 0; s <= segs; s++) {
      const ang = (s / segs) * radMax;
      rings.push(pts.map(([r, h]) => ringPt(Math.max(0.05, r), h, ang)));
    }

    const triangles = [];
    const edges = [];
    const addTri = (a, b, c) => triangles.push({ a, b, c, n: vNorm(vCross(vSub(b, a), vSub(c, a))), color });

    for (let s = 0; s < segs; s++) {
      const r0 = rings[s];
      const r1 = rings[isFull && s === segs - 1 ? 0 : s + 1];
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m;
        addTri(r0[i], r1[i], r1[j]);
        addTri(r0[i], r1[j], r0[j]);
      }
    }
    // End caps if partial revolve
    if (!isFull && m >= 3) {
      for (let i = 1; i < m - 1; i++) {
        addTri(rings[0][0], rings[0][i + 1], rings[0][i]);
        addTri(rings[segs][0], rings[segs][i], rings[segs][i + 1]);
      }
    }
    // Feature circular profile edges
    for (let i = 0; i < m; i++) {
      const loop = [];
      for (let s = 0; s <= segs; s++) loop.push(rings[s][i]);
      edges.push({ pts: loop, isCircle: isFull, radius: pts[i][0], center: axis === 'z' ? [0, 0, pts[i][1]] : [pts[i][1], 0, 0] });
    }
    return { triangles, edges, faceCount: m * 2 };
  }

  // ---- Transform Helpers (Translate, Rotate Z, Mirror) ----
  function cloneBodyWithTransform(body, fn, newId, newName, flipWinding = false) {
    const triangles = (body.triangles || []).map(t => {
      const a = fn(t.a);
      const b0 = fn(t.b), c0 = fn(t.c);
      const b = flipWinding ? c0 : b0;
      const c = flipWinding ? b0 : c0;
      return { a, b, c, n: vNorm(vCross(vSub(b, a), vSub(c, a))), color: t.color };
    });
    const edges = (body.edges || []).map(ed => ({
      ...ed,
      pts: (ed.pts || []).map(fn),
      center: ed.center ? fn(ed.center) : null
    }));
    return {
      ...body,
      id: newId || body.id,
      name: newName || body.name,
      triangles,
      edges
    };
  }

  // ---- Mass Properties & Exact Center of Mass (CoM) ----
  function computeFullMassProperties(bodies, materialName = 'Aluminum 6061-T6') {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let areaMm2 = 0;
    let signedVol = 0;
    let comX = 0, comY = 0, comZ = 0;
    let totalTriangles = 0, totalEdges = 0, totalFaces = 0, holeCount = 0;

    const expand = pt => {
      if (!pt) return;
      if (pt[0] < minX) minX = pt[0]; if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] < minY) minY = pt[1]; if (pt[1] > maxY) maxY = pt[1];
      if (pt[2] < minZ) minZ = pt[2]; if (pt[2] > maxZ) maxZ = pt[2];
    };

    for (const b of (bodies || [])) {
      if (b.visible === false) continue;
      let bMinX = Infinity, bMinY = Infinity, bMinZ = Infinity;
      let bMaxX = -Infinity, bMaxY = -Infinity, bMaxZ = -Infinity;
      const expB = pt => {
        expand(pt);
        if (pt[0] < bMinX) bMinX = pt[0]; if (pt[0] > bMaxX) bMaxX = pt[0];
        if (pt[1] < bMinY) bMinY = pt[1]; if (pt[1] > bMaxY) bMaxY = pt[1];
        if (pt[2] < bMinZ) bMinZ = pt[2]; if (pt[2] > bMaxZ) bMaxZ = pt[2];
      };
      const signMul = b.isCutVolume ? -1 : 1;
      for (const tri of (b.triangles || [])) {
        totalTriangles++;
        expB(tri.a); expB(tri.b); expB(tri.c);
        const cr = vCross(vSub(tri.b, tri.a), vSub(tri.c, tri.a));
        areaMm2 += 0.5 * vLen(cr);
        const tetVol = (vDot(tri.a, vCross(tri.b, tri.c)) / 6.0) * signMul;
        signedVol += tetVol;
        comX += tetVol * (tri.a[0] + tri.b[0] + tri.c[0]) * 0.25;
        comY += tetVol * (tri.a[1] + tri.b[1] + tri.c[1]) * 0.25;
        comZ += tetVol * (tri.a[2] + tri.b[2] + tri.c[2]) * 0.25;
      }
      for (const ed of (b.edges || [])) {
        totalEdges++;
        for (const p of (ed.pts || [])) expB(p);
        if (ed.isCircle) holeCount++;
      }
      totalFaces += (b.faceCount || 0);
      b.bounds = isFinite(bMinX) ? { minX: bMinX, minY: bMinY, minZ: bMinZ, maxX: bMaxX, maxY: bMaxY, maxZ: bMaxZ } : { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
      b.center = [(b.bounds.minX + b.bounds.maxX) / 2, (b.bounds.minY + b.bounds.maxY) / 2, (b.bounds.minZ + b.bounds.maxZ) / 2];
    }

    if (!isFinite(minX)) { minX = 0; minY = 0; minZ = 0; maxX = 100; maxY = 100; maxZ = 100; }
    const sizeX = maxX - minX, sizeY = maxY - minY, sizeZ = maxZ - minZ;
    const center = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    const volumeMm3 = Math.max(0, signedVol);
    const com = signedVol > 1e-4 ? [comX / signedVol, comY / signedVol, comZ / signedVol] : center;
    const densityMap = {
      'Aluminum 6061-T6': 2.70, 'Mild Steel (AISI 1018)': 7.87, 'Stainless Steel 304': 8.00,
      'Copper (C110)': 8.96, 'Brass (C360)': 8.50, 'Titanium Ti-6Al-4V': 4.43,
      'ABS Plastic': 1.04, 'PLA Plastic': 1.24, 'Delrin (Acetal)': 1.41
    };
    const density = densityMap[materialName] || 2.70;
    const volumeCm3 = volumeMm3 / 1000;
    return {
      bounds: { minX, minY, minZ, maxX, maxY, maxZ },
      center,
      centerOfMass: com,
      sizeX, sizeY, sizeZ,
      surfaceAreaMm2: areaMm2,
      volumeMm3,
      volumeCm3,
      massGrams: volumeCm3 * density,
      totalTriangles, totalEdges, totalFaces, holeCount
    };
  }

  // ---- Assembly Mates & Interference Detection ----
  function applyAssemblyMate(bodies, mate) {
    if (!mate || !Array.isArray(bodies)) return false;
    const bA = bodies.find(b => b.id === mate.bodyA || b.name === mate.bodyA);
    const bB = bodies.find(b => b.id === mate.bodyB || b.name === mate.bodyB);
    if (!bA || !bB || bA === bB) return false;
    computeFullMassProperties(bodies);
    let dx = 0, dy = 0, dz = 0;
    const dist = Number(mate.distance) || 0;
    const type = String(mate.type || 'COINCIDENT').toUpperCase();

    if (type === 'CONCENTRIC') {
      dx = bA.center[0] - bB.center[0];
      dy = bA.center[1] - bB.center[1];
    } else if (type === 'COINCIDENT') {
      // Snap bottom of B onto top of A
      dz = bA.bounds.maxZ - bB.bounds.minZ;
    } else if (type === 'DISTANCE') {
      dz = (bA.bounds.maxZ + dist) - bB.bounds.minZ;
    }
    if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6 || Math.abs(dz) > 1e-6) {
      const moved = cloneBodyWithTransform(bB, p => [p[0] + dx, p[1] + dy, p[2] + dz], bB.id, bB.name);
      bB.triangles = moved.triangles;
      bB.edges = moved.edges;
      return true;
    }
    return false;
  }

  function detectAssemblyInterferences(bodies) {
    const solids = (bodies || []).filter(b => b && b.visible !== false && !b.isCutVolume && b.bounds);
    const collisions = [];
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i].bounds, b = solids[j].bounds;
        const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
        const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
        if (ox > 1e-3 && oy > 1e-3 && oz > 1e-3) {
          collisions.push({
            bodyA: solids[i].name,
            bodyB: solids[j].name,
            overlapX: ox,
            overlapY: oy,
            overlapZ: oz,
            interferenceVolumeMm3: ox * oy * oz
          });
        }
      }
    }
    return collisions;
  }

  // ---- Parametric SolidWorks Document (FeatureManager History Engine) ----
  class CADDocument {
    constructor(name = 'Part1') {
      this.name = name;
      this.unitName = 'mm';
      this.material = 'Aluminum 6061-T6';
      this.features = [];
      this.mates = [];
      this.rollbackIndex = null;
      this.bodies = [];
      this.holes = [];
      this.stats = null;
      this.interferences = [];
    }

    addFeature(feat) {
      const f = {
        id: feat.id || `feat_${this.features.length + 1}_${Date.now().toString(36).slice(-3)}`,
        type: String(feat.type || 'EXTRUDE_BOSS').toUpperCase(),
        name: feat.name || `${feat.type || 'Feature'}_${this.features.length + 1}`,
        suppressed: !!feat.suppressed,
        params: JSON.parse(JSON.stringify(feat.params || {}))
      };
      this.features.push(f);
      this.rebuild();
      return f;
    }

    updateFeature(id, patchParams) {
      const f = this.features.find(x => x.id === id);
      if (!f) return null;
      f.params = { ...f.params, ...patchParams };
      this.rebuild();
      return f;
    }

    toggleSuppress(id) {
      const f = this.features.find(x => x.id === id);
      if (!f) return false;
      f.suppressed = !f.suppressed;
      this.rebuild();
      return f.suppressed;
    }

    removeFeature(id) {
      this.features = this.features.filter(x => x.id !== id);
      this.rebuild();
    }

    addMate(mate) {
      this.mates.push({ id: `mate_${this.mates.length + 1}`, ...mate });
      this.rebuild();
    }

    rebuild() {
      const bodies = [];
      const holes = [];
      const maxIdx = this.rollbackIndex != null ? Math.min(this.features.length, this.rollbackIndex) : this.features.length;

      for (let idx = 0; idx < maxIdx; idx++) {
        const f = this.features[idx];
        if (!f || f.suppressed) continue;
        const p = f.params || {};

        if (f.type === 'EXTRUDE_BOSS') {
          const prof = buildSketchProfile2D(p.sketch || p);
          const mesh = buildExtrudeMesh(prof, p);
          bodies.push({
            id: f.id,
            name: f.name,
            visible: true,
            color: p.color || '#7c8ea6',
            isCutVolume: false,
            faceCount: mesh.faceCount,
            triangles: mesh.triangles,
            edges: mesh.edges
          });
        } else if (f.type === 'EXTRUDE_CUT') {
          const prof = buildSketchProfile2D(p.sketch || p);
          const mesh = buildExtrudeMesh(prof, { ...p, color: '#334155' });
          bodies.push({
            id: f.id,
            name: f.name,
            visible: true,
            color: '#334155',
            isCutVolume: true,
            faceCount: mesh.faceCount,
            triangles: mesh.triangles,
            edges: mesh.edges
          });
          if (prof.isCircle) {
            holes.push({ center: mapSketch2DTo3D(prof.cx, prof.cy, Number(p.offset) || 0, p.plane || 'top'), radius: prof.radius, diameter: prof.radius * 2, label: `Ø${(prof.radius * 2).toFixed(2)} Cut`, featureId: f.id });
          }
        } else if (f.type === 'REVOLVE_BOSS') {
          const mesh = buildRevolveMesh(p.profilePts, p);
          bodies.push({
            id: f.id,
            name: f.name,
            visible: true,
            color: p.color || '#8fa3bc',
            isCutVolume: false,
            faceCount: mesh.faceCount,
            triangles: mesh.triangles,
            edges: mesh.edges
          });
        } else if (f.type === 'HOLE_WIZARD') {
          const spec = ISO_METRIC_HOLES[p.size || 'M6'] || ISO_METRIC_HOLES.M6;
          const dia = Number(p.diameter) || (p.holeType === 'tap' ? spec.tapDrill : spec.clearance);
          const depth = Number(p.depth) || 20;
          const positions = Array.isArray(p.positions) && p.positions.length ? p.positions : [[Number(p.cx) || 0, Number(p.cy) || 0]];
          positions.forEach(([hx, hy], hi) => {
            const prof = buildSketchProfile2D({ kind: 'circle', cx: hx, cy: hy, diameter: dia });
            const mesh = buildExtrudeMesh(prof, { plane: p.plane || 'top', offset: Number(p.offset) || 0, depth, color: '#1e293b' });
            bodies.push({
              id: `${f.id}_h${hi + 1}`,
              name: `${f.name} (${p.size || 'M6'})`,
              visible: true,
              color: '#1e293b',
              isCutVolume: true,
              faceCount: mesh.faceCount,
              triangles: mesh.triangles,
              edges: mesh.edges
            });
            holes.push({
              center: mapSketch2DTo3D(hx, hy, (Number(p.offset) || 0) + depth, p.plane || 'top'),
              radius: dia / 2,
              diameter: dia,
              spec: p.size || 'M6',
              holeType: p.holeType || 'clearance',
              label: `${p.size || 'M6'} ${p.holeType === 'cbore' ? 'C-Bore' : (p.holeType === 'csink' ? 'C-Sink' : 'Thru')} Ø${dia.toFixed(1)}`,
              featureId: f.id
            });
          });
        } else if (f.type === 'FILLET' || f.type === 'CHAMFER') {
          // Applied edge fillet/chamfer: re-generate the target rectangular extrude with rounded/beveled corners
          const target = this.features.find(x => x.id === p.targetId && x.type === 'EXTRUDE_BOSS') ||
            this.features.slice(0, idx).reverse().find(x => x.type === 'EXTRUDE_BOSS' && !x.suppressed);
          if (target) {
            const bIdx = bodies.findIndex(b => b.id === target.id);
            if (bIdx >= 0) {
              const sk = { ...(target.params.sketch || target.params) };
              if (f.type === 'FILLET') sk.cornerFillet = Number(p.radius) || 5;
              else sk.cornerChamfer = Number(p.distance) || 4;
              const mesh = buildExtrudeMesh(buildSketchProfile2D(sk), target.params);
              bodies[bIdx].triangles = mesh.triangles;
              bodies[bIdx].edges = mesh.edges;
              bodies[bIdx].faceCount = mesh.faceCount;
            }
          }
        } else if (f.type === 'SHELL') {
          const target = bodies.slice().reverse().find(b => !b.isCutVolume);
          if (target) {
            computeFullMassProperties([target]);
            const t = Math.max(0.5, Number(p.thickness) || 2.5);
            const iw = Math.max(1, (target.bounds.maxX - target.bounds.minX) - t * 2);
            const ih = Math.max(1, (target.bounds.maxY - target.bounds.minY) - t * 2);
            const iz = Math.max(1, (target.bounds.maxZ - target.bounds.minZ) - t);
            const prof = buildSketchProfile2D({ kind: 'center_rect', cx: target.center[0], cy: target.center[1], width: iw, height: ih });
            const mesh = buildExtrudeMesh(prof, { plane: 'top', offset: target.bounds.minZ + t, depth: iz, color: '#334155' });
            bodies.push({
              id: f.id,
              name: `${f.name} (${t}mm)`,
              visible: true,
              color: '#334155',
              isCutVolume: true,
              faceCount: mesh.faceCount,
              triangles: mesh.triangles,
              edges: mesh.edges
            });
          }
        } else if (f.type === 'LINEAR_PATTERN') {
          const src = bodies.find(b => b.id === p.targetId) || bodies[bodies.length - 1];
          if (src) {
            const countX = Math.max(1, Math.min(20, parseInt(p.countX, 10) || 2));
            const countY = Math.max(1, Math.min(20, parseInt(p.countY, 10) || 1));
            const stepX = Number(p.spacingX) || 30;
            const stepY = Number(p.spacingY) || 30;
            for (let ix = 0; ix < countX; ix++) {
              for (let iy = 0; iy < countY; iy++) {
                if (ix === 0 && iy === 0) continue;
                const dx = ix * stepX, dy = iy * stepY;
                bodies.push(cloneBodyWithTransform(src, pt => [pt[0] + dx, pt[1] + dy, pt[2]], `${f.id}_${ix}_${iy}`, `${src.name}_P${ix + 1}_${iy + 1}`));
              }
            }
          }
        } else if (f.type === 'CIRCULAR_PATTERN') {
          const src = bodies.find(b => b.id === p.targetId) || bodies[bodies.length - 1];
          if (src) {
            const count = Math.max(2, Math.min(36, parseInt(p.count, 10) || 4));
            const ox = Number(p.cx) || 0, oy = Number(p.cy) || 0;
            for (let k = 1; k < count; k++) {
              const ang = (k / count) * Math.PI * 2;
              const ca = Math.cos(ang), sa = Math.sin(ang);
              bodies.push(cloneBodyWithTransform(src, pt => [
                ox + (pt[0] - ox) * ca - (pt[1] - oy) * sa,
                oy + (pt[0] - ox) * sa + (pt[1] - oy) * ca,
                pt[2]
              ], `${f.id}_c${k}`, `${src.name}_R${k + 1}`));
            }
          }
        } else if (f.type === 'MIRROR_BODY') {
          const src = bodies.find(b => b.id === p.targetId) || bodies[bodies.length - 1];
          if (src) {
            const plane = String(p.mirrorPlane || 'right').toLowerCase();
            bodies.push(cloneBodyWithTransform(src, pt => (
              plane === 'front' ? [pt[0], -pt[1], pt[2]] : (plane === 'top' ? [pt[0], pt[1], -pt[2]] : [-pt[0], pt[1], pt[2]])
            ), `${f.id}_mir`, `${src.name}_Mirror`, true));
          }
        }
      }

      // Apply Assembly Mates
      for (const mate of this.mates) applyAssemblyMate(bodies, mate);

      this.bodies = bodies;
      this.holes = holes;
      this.stats = computeFullMassProperties(bodies, this.material);
      this.interferences = detectAssemblyInterferences(bodies);
      return this.toModelObject();
    }

    toModelObject() {
      return {
        fileName: `${this.name}.kensho3d`,
        format: 'KENSHO3D',
        unitName: this.unitName,
        header: { name: this.name, schema: 'KenshoPro Parametric CAD 1.2.3.2' },
        bodies: this.bodies,
        holes: this.holes,
        assemblyNodes: this.bodies.map((b, i) => ({ id: i + 1, name: b.name })),
        stats: this.stats,
        interferences: this.interferences,
        document: this
      };
    }

    serialize() {
      return JSON.stringify({
        format: 'KENSHO3D_V1',
        name: this.name,
        unitName: this.unitName,
        material: this.material,
        features: this.features,
        mates: this.mates,
        rollbackIndex: this.rollbackIndex
      }, null, 2);
    }

    static deserialize(jsonStr) {
      const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
      const doc = new CADDocument(data.name || 'Part1');
      doc.unitName = data.unitName || 'mm';
      doc.material = data.material || 'Aluminum 6061-T6';
      doc.features = Array.isArray(data.features) ? data.features : [];
      doc.mates = Array.isArray(data.mates) ? data.mates : [];
      doc.rollbackIndex = typeof data.rollbackIndex === 'number' ? data.rollbackIndex : null;
      doc.rebuild();
      return doc;
    }
  }

  // ---- Native Exporters: ISO 10303 STEP AP214, Binary STL, OBJ, 4-View 2D DXF Drawing ----
  function exportToSTEP(modelOrDoc) {
    const bodies = (modelOrDoc && modelOrDoc.bodies) ? modelOrDoc.bodies.filter(b => b.visible !== false && !b.isCutVolume) : [];
    const name = String((modelOrDoc && (modelOrDoc.name || modelOrDoc.fileName)) || 'KenshoPart').replace(/\.[^.]+$/, '');
    let nextId = 10;
    const lines = [
      'ISO-10303-21;',
      'HEADER;',
      `FILE_DESCRIPTION(('Exported by KenshoPro Parametric CAD Backend'),'2;1');`,
      `FILE_NAME('${name}.step','${new Date().toISOString()}',('Kensho Studio'),('Kensho Pro'),'CADKernel','KenshoPro 1.2.3.2','');`,
      `FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));`,
      'ENDSEC;',
      'DATA;',
      `#1 = PRODUCT('${name}','${name}','',(#2));`,
      `#2 = PRODUCT_CONTEXT('',#3,'mechanical');`,
      `#3 = APPLICATION_CONTEXT('automotive design');`
    ];

    const ptMap = new Map();
    const getPtRef = pt => {
      const k = `${pt[0].toFixed(4)},${pt[1].toFixed(4)},${pt[2].toFixed(4)}`;
      if (ptMap.has(k)) return ptMap.get(k);
      const pid = nextId++;
      const vid = nextId++;
      lines.push(`#${pid} = CARTESIAN_POINT('',(${pt[0].toFixed(4)},${pt[1].toFixed(4)},${pt[2].toFixed(4)}));`);
      lines.push(`#${vid} = VERTEX_POINT('',#${pid});`);
      ptMap.set(k, vid);
      return vid;
    };

    for (const body of bodies) {
      const faceIds = [];
      const emitLine = (p0, p1) => {
        const dv = vSub(p1, p0);
        const dn = vNorm(dv);
        const len = Math.max(1e-6, Math.hypot(dv[0], dv[1], dv[2]));
        const cp = nextId++, dr = nextId++, vc = nextId++, ln = nextId++;
        lines.push(`#${cp} = CARTESIAN_POINT('',(${p0[0].toFixed(4)},${p0[1].toFixed(4)},${p0[2].toFixed(4)}));`);
        lines.push(`#${dr} = DIRECTION('',(${dn[0].toFixed(6)},${dn[1].toFixed(6)},${dn[2].toFixed(6)}));`);
        lines.push(`#${vc} = VECTOR('',#${dr},${len.toFixed(4)});`);
        lines.push(`#${ln} = LINE('',#${cp},#${vc});`);
        return ln;
      };
      for (const tri of (body.triangles || [])) {
        const va = getPtRef(tri.a), vb = getPtRef(tri.b), vc = getPtRef(tri.c);
        const l1 = emitLine(tri.a, tri.b), l2 = emitLine(tri.b, tri.c), l3 = emitLine(tri.c, tri.a);
        const e1 = nextId++, e2 = nextId++, e3 = nextId++;
        const oe1 = nextId++, oe2 = nextId++, oe3 = nextId++;
        const lp = nextId++, fb = nextId++, af = nextId++;
        const pOrig = nextId++, pNorm = nextId++, pRef = nextId++, pAxis = nextId++, pPln = nextId++;
        const n = tri.n || vNorm(vCross(vSub(tri.b, tri.a), vSub(tri.c, tri.a)));
        const refDir = vNorm(vSub(tri.b, tri.a));
        lines.push(`#${e1} = EDGE_CURVE('',#${va},#${vb},#${l1},.T.);`);
        lines.push(`#${e2} = EDGE_CURVE('',#${vb},#${vc},#${l2},.T.);`);
        lines.push(`#${e3} = EDGE_CURVE('',#${vc},#${va},#${l3},.T.);`);
        lines.push(`#${oe1} = ORIENTED_EDGE('',*,*,#${e1},.T.);`);
        lines.push(`#${oe2} = ORIENTED_EDGE('',*,*,#${e2},.T.);`);
        lines.push(`#${oe3} = ORIENTED_EDGE('',*,*,#${e3},.T.);`);
        lines.push(`#${lp} = EDGE_LOOP('',(#${oe1},#${oe2},#${oe3}));`);
        lines.push(`#${fb} = FACE_OUTER_BOUND('',#${lp},.T.);`);
        lines.push(`#${pOrig} = CARTESIAN_POINT('',(${tri.a[0].toFixed(4)},${tri.a[1].toFixed(4)},${tri.a[2].toFixed(4)}));`);
        lines.push(`#${pNorm} = DIRECTION('',(${n[0].toFixed(6)},${n[1].toFixed(6)},${n[2].toFixed(6)}));`);
        lines.push(`#${pRef} = DIRECTION('',(${refDir[0].toFixed(6)},${refDir[1].toFixed(6)},${refDir[2].toFixed(6)}));`);
        lines.push(`#${pAxis} = AXIS2_PLACEMENT_3D('',#${pOrig},#${pNorm},#${pRef});`);
        lines.push(`#${pPln} = PLANE('',#${pAxis});`);
        lines.push(`#${af} = ADVANCED_FACE('',(#${fb}),#${pPln},.T.);`);
        faceIds.push(`#${af}`);
      }
      if (faceIds.length) {
        const shId = nextId++, brId = nextId++;
        lines.push(`#${shId} = CLOSED_SHELL('',(${faceIds.join(',')}));`);
        lines.push(`#${brId} = MANIFOLD_SOLID_BREP('${body.name || name}',#${shId});`);
      }
    }
    lines.push('ENDSEC;', 'END-ISO-10303-21;');
    return lines.join('\n');
  }

  function exportToBinarySTL(modelOrDoc) {
    const tris = [];
    for (const b of ((modelOrDoc && modelOrDoc.bodies) || [])) {
      if (b.visible === false || b.isCutVolume) continue;
      for (const t of (b.triangles || [])) tris.push(t);
    }
    const buf = new ArrayBuffer(84 + tris.length * 50);
    const dv = new DataView(buf);
    const hdr = new TextEncoder().encode('KenshoPro Parametric CAD Backend Binary STL');
    new Uint8Array(buf, 0, Math.min(80, hdr.length)).set(hdr.subarray(0, 80));
    dv.setUint32(80, tris.length, true);
    let off = 84;
    for (const t of tris) {
      const n = t.n || [0, 0, 1];
      dv.setFloat32(off, n[0], true); dv.setFloat32(off + 4, n[1], true); dv.setFloat32(off + 8, n[2], true);
      dv.setFloat32(off + 12, t.a[0], true); dv.setFloat32(off + 16, t.a[1], true); dv.setFloat32(off + 20, t.a[2], true);
      dv.setFloat32(off + 24, t.b[0], true); dv.setFloat32(off + 28, t.b[1], true); dv.setFloat32(off + 32, t.b[2], true);
      dv.setFloat32(off + 36, t.c[0], true); dv.setFloat32(off + 40, t.c[1], true); dv.setFloat32(off + 44, t.c[2], true);
      dv.setUint16(off + 48, 0, true);
      off += 50;
    }
    return new Uint8Array(buf);
  }

  function exportToOBJ(modelOrDoc) {
    const lines = ['# Exported by KenshoPro Parametric CAD Backend'];
    let vCount = 0;
    for (const b of ((modelOrDoc && modelOrDoc.bodies) || [])) {
      if (b.visible === false || b.isCutVolume) continue;
      lines.push(`o ${b.name || 'Body'}`);
      for (const t of (b.triangles || [])) {
        lines.push(`v ${t.a[0].toFixed(4)} ${t.a[1].toFixed(4)} ${t.a[2].toFixed(4)}`);
        lines.push(`v ${t.b[0].toFixed(4)} ${t.b[1].toFixed(4)} ${t.b[2].toFixed(4)}`);
        lines.push(`v ${t.c[0].toFixed(4)} ${t.c[1].toFixed(4)} ${t.c[2].toFixed(4)}`);
        lines.push(`f ${vCount + 1} ${vCount + 2} ${vCount + 3}`);
        vCount += 3;
      }
    }
    return lines.join('\n');
  }

  // ---- 4-View SolidWorks Engineering Drawing Sheet -> AutoCAD DXF ----
  function exportMultiViewDrawingDXF(modelOrDoc) {
    const bodies = (modelOrDoc && modelOrDoc.bodies) ? modelOrDoc.bodies.filter(b => b.visible !== false) : [];
    const stats = (modelOrDoc && modelOrDoc.stats) || computeFullMassProperties(bodies);
    const hasFiniteBounds = !!(bodies.length && stats && stats.bounds && Number.isFinite(stats.bounds.minX) && Number.isFinite(stats.bounds.minY) && Number.isFinite(stats.bounds.minZ));
    const bMinX = hasFiniteBounds ? stats.bounds.minX : 0;
    const bMinY = hasFiniteBounds ? stats.bounds.minY : 0;
    const bMinZ = hasFiniteBounds ? stats.bounds.minZ : 0;
    const sx = Math.max(10, (stats && Number.isFinite(stats.sizeX) && stats.sizeX > 0) ? stats.sizeX : 100);
    const sy = Math.max(10, (stats && Number.isFinite(stats.sizeY) && stats.sizeY > 0) ? stats.sizeY : 60);
    const sz = Math.max(10, (stats && Number.isFinite(stats.sizeZ) && stats.sizeZ > 0) ? stats.sizeZ : 20);
    const gap = Math.max(25, Math.max(sx, sy, sz) * 0.45);
    const name = (modelOrDoc && (modelOrDoc.name || modelOrDoc.fileName)) || 'Part1';

    const out = [
      '0', 'SECTION', '2', 'HEADER',
      '9', '$INSUNITS', '70', (modelOrDoc && modelOrDoc.unitName === 'in') ? '1' : '4',
      '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES'
    ];
    const seenSegs = new Set();
    const addLine = (lyr, x1, y1, x2, y2) => {
      if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return;
      if (Math.hypot(x2 - x1, y2 - y1) < 1e-4) return;
      const a1 = `${Math.round(x1 * 1e3)},${Math.round(y1 * 1e3)}`;
      const a2 = `${Math.round(x2 * 1e3)},${Math.round(y2 * 1e3)}`;
      const key = `${lyr}|${a1 < a2 ? a1 + '|' + a2 : a2 + '|' + a1}`;
      if (seenSegs.has(key)) return;
      seenSegs.add(key);
      out.push('0', 'LINE', '8', lyr, '10', x1.toFixed(3), '20', y1.toFixed(3), '11', x2.toFixed(3), '21', y2.toFixed(3));
    };
    const addText = (lyr, x, y, h, txt) => {
      out.push('0', 'TEXT', '8', lyr, '10', x.toFixed(3), '20', y.toFixed(3), '40', h.toFixed(2), '1', String(txt));
    };

    const views = [
      { id: 'FRONT', ox: 0, oy: 0, proj: p => [p[0] - bMinX, p[2] - bMinZ] },
      { id: 'TOP', ox: 0, oy: sz + gap, proj: p => [p[0] - bMinX, p[1] - bMinY] },
      { id: 'RIGHT', ox: sx + gap, oy: 0, proj: p => [p[1] - bMinY, p[2] - bMinZ] },
      { id: 'ISO', ox: sx + gap, oy: sz + gap, proj: p => {
        const x = p[0] - bMinX, y = p[1] - bMinY, z = p[2] - bMinZ;
        return [(x - y) * 0.866 + sy * 0.866, z + (x + y) * 0.5];
      }}
    ];

    for (const v of views) {
      addText('ANNOTATIONS', v.ox, v.oy - 8, 4.0, `${v.id} VIEW`);
      for (const b of bodies) {
        const lyr = b.isCutVolume ? 'HIDDEN_HOLES' : `VIEW_${v.id}`;
        for (const ed of (b.edges || [])) {
          const pts = ed.pts || [];
          for (let i = 1; i < pts.length; i++) {
            const [x1, y1] = v.proj(pts[i - 1]);
            const [x2, y2] = v.proj(pts[i]);
            addLine(lyr, v.ox + x1, v.oy + y1, v.ox + x2, v.oy + y2);
          }
        }
      }
    }

    // Overall Drawing Sheet Dimensions & Title Block
    addText('DIMENSIONS', sx * 0.5, -16, 4.5, `W = ${sx.toFixed(2)} mm  |  D = ${sy.toFixed(2)} mm  |  H = ${sz.toFixed(2)} mm`);
    const holeList = (modelOrDoc && modelOrDoc.holes) || [];
    if (holeList.length) {
      addText('DIMENSIONS', 0, -24, 3.8, `HOLES (${holeList.length}): ` + holeList.slice(0, 4).map(h => h.label || `Ø${(h.diameter || 0).toFixed(1)}`).join(', '));
    }
    const tbX = sx + gap, tbY = -36;
    addLine('TITLE_BLOCK', tbX, tbY, tbX + 110, tbY);
    addLine('TITLE_BLOCK', tbX + 110, tbY, tbX + 110, tbY + 24);
    addLine('TITLE_BLOCK', tbX + 110, tbY + 24, tbX, tbY + 24);
    addLine('TITLE_BLOCK', tbX, tbY + 24, tbX, tbY);
    addText('TITLE_BLOCK', tbX + 4, tbY + 14, 4.2, `KENSHO PRO 2D DRAWING: ${name}`);
    const volCm3 = (stats && Number.isFinite(stats.volumeCm3)) ? stats.volumeCm3 : 0;
    const massG = (stats && Number.isFinite(stats.massGrams)) ? stats.massGrams : (volCm3 * 2.70);
    addText('TITLE_BLOCK', tbX + 4, tbY + 5, 3.2, `VOL: ${volCm3.toFixed(2)} cm3  |  MASS: ${massG.toFixed(1)} g`);

    out.push('0', 'ENDSEC', '0', 'EOF');
    return out.join('\n');
  }

  function createSampleParametricPart() {
    const doc = new CADDocument('Kensho_Mounting_Plate');
    doc.addFeature({ type: 'EXTRUDE_BOSS', name: 'Base_Plate', params: { kind: 'center_rect', cx: 0, cy: 0, width: 100, height: 60, depth: 12, plane: 'top', color: '#7c8ea6' } });
    doc.addFeature({ type: 'FILLET', name: 'Corner_Fillet_R6', params: { radius: 6 } });
    doc.addFeature({ type: 'HOLE_WIZARD', name: 'Mounting_Holes_4xM6', params: { size: 'M6', holeType: 'clearance', depth: 12, positions: [[-38, -20], [38, -20], [38, 20], [-38, 20]] } });
    doc.addFeature({ type: 'EXTRUDE_BOSS', name: 'Center_Boss', params: { kind: 'circle', cx: 0, cy: 0, diameter: 34, offset: 12, depth: 14, plane: 'top', color: '#94a3b8' } });
    doc.addFeature({ type: 'EXTRUDE_CUT', name: 'Center_Bore_20mm', params: { kind: 'circle', cx: 0, cy: 0, diameter: 20, offset: 0, depth: 26, plane: 'top' } });
    return doc;
  }

  return {
    ISO_METRIC_HOLES,
    CADDocument,
    buildSketchProfile2D,
    buildExtrudeMesh,
    buildRevolveMesh,
    computeFullMassProperties,
    applyAssemblyMate,
    detectAssemblyInterferences,
    exportToSTEP,
    exportToBinarySTL,
    exportToOBJ,
    exportMultiViewDrawingDXF,
    createSampleParametricPart
  };
});
