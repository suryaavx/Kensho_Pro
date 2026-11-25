/* ============================================================================
 * [MODULE: KENSHO PRO 3D CAD & SOLIDWORKS / STEP ENGINE (cad3d_engine.js)]
 * 100% Offline Plain-JS Engine for:
 *   - ISO 10303 STEP (AP203 / AP214 / AP242: .step, .stp) B-Rep & Assembly Parser
 *   - STL (ASCII & Binary .stl) and Wavefront OBJ (.obj) Mesh Parsers
 *   - SolidWorks Native (.sldprt, .sldasm, .slddrw) OLE Header & Metadata Extractor
 *   - Engineering Mass Properties (BBox, Volume, Surface Area, Material Density Mass)
 *   - 2D Orthographic Projection Exporter (STEP/3D -> AutoCAD DXF)
 *   - 3D Revision Compare (Rev A vs Rev B STEP/STL Feature & Face/Edge Diff)
 * ============================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CAD3DEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MATERIALS = {
    'Aluminum 6061-T6': { densityGcm3: 2.70, color: '#94a3b8' },
    'Mild Steel (AISI 1018)': { densityGcm3: 7.87, color: '#64748b' },
    'Stainless Steel 304': { densityGcm3: 8.00, color: '#cbd5e1' },
    'Copper (C110)': { densityGcm3: 8.96, color: '#d97706' },
    'Brass (C360)': { densityGcm3: 8.50, color: '#eab308' },
    'Titanium Ti-6Al-4V': { densityGcm3: 4.43, color: '#a1a1aa' },
    'ABS Plastic': { densityGcm3: 1.04, color: '#38bdf8' },
    'PLA Plastic': { densityGcm3: 1.24, color: '#22c55e' },
    'Delrin (Acetal)': { densityGcm3: 1.41, color: '#e2e8f0' }
  };

  function is3DCADFileName(name = '') {
    return /\.(step|stp|sldprt|sldasm|slddrw|stl|obj)$/i.test(String(name || '').trim());
  }

  function isSolidWorksFileName(name = '') {
    return /\.(sldprt|sldasm|slddrw)$/i.test(String(name || '').trim());
  }

  function isSTEPFileName(name = '') {
    return /\.(step|stp)$/i.test(String(name || '').trim());
  }

  // ---- Vector / Matrix 3D Math Helpers ----
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

  function buildAxisFrame(origin, zAxis, xAxis) {
    const o = origin || [0, 0, 0];
    const z = vNorm(zAxis || [0, 0, 1]);
    let x = xAxis ? vNorm(xAxis) : (Math.abs(z[2]) < 0.9 ? vNorm(vCross([0, 0, 1], z)) : [1, 0, 0]);
    const y = vNorm(vCross(z, x));
    x = vNorm(vCross(y, z));
    return { o, x, y, z };
  }

  function applyAxisTransform(pt, fromFrame, toFrame) {
    if (!fromFrame || !toFrame) return pt;
    const d = vSub(pt, fromFrame.o);
    const lx = vDot(d, fromFrame.x);
    const ly = vDot(d, fromFrame.y);
    const lz = vDot(d, fromFrame.z);
    return [
      toFrame.o[0] + toFrame.x[0] * lx + toFrame.y[0] * ly + toFrame.z[0] * lz,
      toFrame.o[1] + toFrame.x[1] * lx + toFrame.y[1] * ly + toFrame.z[1] * lz,
      toFrame.o[2] + toFrame.x[2] * lx + toFrame.y[2] * ly + toFrame.z[2] * lz
    ];
  }

  // ---- STEP Tokenizer & Argument Parser ----
  function parseSTEPArgs(argStr) {
    const out = [];
    let i = 0;
    const n = argStr.length;
    const skipWs = () => { while (i < n && (argStr[i] === ' ' || argStr[i] === '\t' || argStr[i] === '\r' || argStr[i] === '\n')) i++; };

    const parseVal = () => {
      skipWs();
      if (i >= n) return null;
      const ch = argStr[i];
      if (ch === '(') {
        i++;
        const arr = [];
        skipWs();
        while (i < n && argStr[i] !== ')') {
          arr.push(parseVal());
          skipWs();
          if (argStr[i] === ',') i++;
          skipWs();
        }
        if (argStr[i] === ')') i++;
        return arr;
      }
      if (ch === "'") {
        i++;
        let s = '';
        while (i < n) {
          if (argStr[i] === "'" && argStr[i + 1] === "'") { s += "'"; i += 2; continue; }
          if (argStr[i] === "'") { i++; break; }
          s += argStr[i++];
        }
        return s;
      }
      if (ch === '#') {
        i++;
        let num = '';
        while (i < n && argStr[i] >= '0' && argStr[i] <= '9') num += argStr[i++];
        return { ref: parseInt(num, 10) };
      }
      if (ch === '$') { i++; return null; }
      if (ch === '*') { i++; return '*'; }
      if (ch === '.') {
        i++;
        let en = '';
        while (i < n && argStr[i] !== '.') en += argStr[i++];
        if (argStr[i] === '.') i++;
        if (en === 'T') return true;
        if (en === 'F') return false;
        return en;
      }
      // Number or keyword
      let tok = '';
      while (i < n && argStr[i] !== ',' && argStr[i] !== ')' && argStr[i] !== '(') tok += argStr[i++];
      tok = tok.trim();
      if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(tok)) return parseFloat(tok);
      // Typed wrapper e.g. LENGTH_MEASURE(10.0)
      if (i < n && argStr[i] === '(') {
        const inner = parseVal();
        return { typed: tok, value: inner };
      }
      return tok;
    };

    while (i < n) {
      skipWs();
      if (i >= n) break;
      out.push(parseVal());
      skipWs();
      if (argStr[i] === ',') i++;
    }
    return out;
  }

  function computeMeshStats(bodies) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let surfaceAreaMm2 = 0;
    let signedVolumeMm3 = 0;
    let totalTriangles = 0;
    let totalEdges = 0;
    let totalFaces = 0;
    let holeCount = 0;

    for (const b of bodies) {
      let bMinX = Infinity, bMinY = Infinity, bMinZ = Infinity;
      let bMaxX = -Infinity, bMaxY = -Infinity, bMaxZ = -Infinity;
      const expand = pt => {
        if (!pt || !Number.isFinite(pt[0])) return;
        if (pt[0] < minX) minX = pt[0]; if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1]; if (pt[1] > maxY) maxY = pt[1];
        if (pt[2] < minZ) minZ = pt[2]; if (pt[2] > maxZ) maxZ = pt[2];
        if (pt[0] < bMinX) bMinX = pt[0]; if (pt[0] > bMaxX) bMaxX = pt[0];
        if (pt[1] < bMinY) bMinY = pt[1]; if (pt[1] > bMaxY) bMaxY = pt[1];
        if (pt[2] < bMinZ) bMinZ = pt[2]; if (pt[2] > bMaxZ) bMaxZ = pt[2];
      };
      for (const tri of (b.triangles || [])) {
        totalTriangles++;
        expand(tri.a); expand(tri.b); expand(tri.c);
        const ab = vSub(tri.b, tri.a);
        const ac = vSub(tri.c, tri.a);
        const cr = vCross(ab, ac);
        surfaceAreaMm2 += 0.5 * vLen(cr);
        signedVolumeMm3 += vDot(tri.a, vCross(tri.b, tri.c)) / 6.0;
      }
      for (const ed of (b.edges || [])) {
        totalEdges++;
        for (const pt of (ed.pts || [])) expand(pt);
        if (ed.isCircle) holeCount++;
      }
      totalFaces += (b.faceCount || (b.triangles ? b.triangles.length : 0));
      if (isFinite(bMinX)) {
        b.bounds = { minX: bMinX, minY: bMinY, minZ: bMinZ, maxX: bMaxX, maxY: bMaxY, maxZ: bMaxZ };
        b.center = [(bMinX + bMaxX) / 2, (bMinY + bMaxY) / 2, (bMinZ + bMaxZ) / 2];
      } else {
        b.bounds = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
        b.center = [0, 0, 0];
      }
    }

    if (!isFinite(minX)) {
      minX = 0; minY = 0; minZ = 0; maxX = 100; maxY = 100; maxZ = 100;
    }
    const sizeX = Math.max(0, maxX - minX);
    const sizeY = Math.max(0, maxY - minY);
    const sizeZ = Math.max(0, maxZ - minZ);
    const bboxVol = sizeX * sizeY * sizeZ;
    let volumeMm3 = Math.abs(signedVolumeMm3);
    if (volumeMm3 < 1e-3 && bboxVol > 0) volumeMm3 = bboxVol * 0.45; // fallback for open/wireframe STEP shells

    return {
      bounds: { minX, minY, minZ, maxX, maxY, maxZ },
      center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
      sizeX, sizeY, sizeZ,
      surfaceAreaMm2,
      volumeMm3,
      volumeCm3: volumeMm3 / 1000,
      totalTriangles,
      totalEdges,
      totalFaces,
      holeCount
    };
  }

  function calculateMassGrams(volumeCm3, materialName = 'Aluminum 6061-T6') {
    const mat = MATERIALS[materialName] || MATERIALS['Aluminum 6061-T6'];
    return (Number(volumeCm3) || 0) * mat.densityGcm3;
  }

  // ---- ISO 10303 STEP (AP203 / AP214 / AP242) Parser ----
  class STEPParser {
    constructor(content, fileName = 'Part.step') {
      this.raw = typeof content === 'string' ? content : new TextDecoder('utf-8', { fatal: false }).decode(content || new Uint8Array());
      this.fileName = fileName;
      this.entities = new Map();
      this.header = { name: fileName, schema: 'AP214', description: '', originatingSystem: '' };
      this.unitName = 'mm';
      this.bodies = [];
      this.holes = [];
      this.assemblyNodes = [];
      this.stats = null;
    }

    parse() {
      const text = this.raw.replace(/\/\*[\s\S]*?\*\//g, '');
      // Parse HEADER metadata
      const hdrMatch = /HEADER\s*;([\s\S]*?)ENDSEC\s*;/i.exec(text);
      if (hdrMatch) {
        const hdr = hdrMatch[1];
        const fnM = /FILE_NAME\s*\(\s*'([^']*)'/i.exec(hdr);
        if (fnM && fnM[1]) this.header.name = fnM[1];
        const scM = /FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i.exec(hdr);
        if (scM && scM[1]) this.header.schema = scM[1];
      }

      // Extract DATA section statements (#id = TYPE(...);)
      const dataMatch = /DATA\s*;([\s\S]*?)ENDSEC\s*;/i.exec(text);
      const dataStr = dataMatch ? dataMatch[1] : text;
      const stmtRe = /#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*?)\)\s*;/g;
      let m;
      while ((m = stmtRe.exec(dataStr)) !== null) {
        const id = parseInt(m[1], 10);
        const type = m[2].toUpperCase();
        const args = parseSTEPArgs(m[3]);
        this.entities.set(id, { id, type, args });
      }

      // Detect unit (mm vs in), including complex STEP entity instances
      for (const ent of this.entities.values()) {
        if (ent.type === 'CONVERSION_BASED_UNIT' && String(ent.args[0] || '').toUpperCase().includes('INCH')) {
          this.unitName = 'in';
        }
      }
      if (this.unitName !== 'in' && /CONVERSION_BASED_UNIT\s*\(\s*'[^']*INCH[^']*'/i.test(dataStr)) {
        this.unitName = 'in';
      }

      const getEnt = refObj => (refObj && typeof refObj === 'object' && refObj.ref != null) ? this.entities.get(refObj.ref) : null;

      // Resolve CARTESIAN_POINT -> [x, y, z]
      const ptCache = new Map();
      const getPoint = refObj => {
        if (!refObj || refObj.ref == null) return null;
        if (ptCache.has(refObj.ref)) return ptCache.get(refObj.ref);
        const e = this.entities.get(refObj.ref);
        if (!e) return null;
        if (e.type === 'CARTESIAN_POINT' && Array.isArray(e.args[1])) {
          const p = [Number(e.args[1][0]) || 0, Number(e.args[1][1]) || 0, Number(e.args[1][2]) || 0];
          ptCache.set(refObj.ref, p);
          return p;
        }
        if (e.type === 'VERTEX_POINT') {
          const p = getPoint(e.args[1]);
          if (p) ptCache.set(refObj.ref, p);
          return p;
        }
        return null;
      };

      const getDir = refObj => {
        const e = getEnt(refObj);
        if (!e || e.type !== 'DIRECTION' || !Array.isArray(e.args[1])) return null;
        return vNorm([Number(e.args[1][0]) || 0, Number(e.args[1][1]) || 0, Number(e.args[1][2]) || 0]);
      };

      const getAxisFrame = refObj => {
        const e = getEnt(refObj);
        if (!e || (e.type !== 'AXIS2_PLACEMENT_3D' && e.type !== 'AXIS2_PLACEMENT_2D')) return buildAxisFrame([0, 0, 0], [0, 0, 1], [1, 0, 0]);
        const o = getPoint(e.args[1]) || [0, 0, 0];
        const z = getDir(e.args[2]) || [0, 0, 1];
        const x = getDir(e.args[3]) || null;
        return buildAxisFrame(o, z, x);
      };

      // Extract real STEP AP214/AP242 RGB & predefined colors mapped by styled item target
      const PREDEF_STEP_COLORS = {
        red: '#dc2626', green: '#16a34a', blue: '#2563eb', yellow: '#eab308',
        magenta: '#d946ef', cyan: '#06b6d4', white: '#f1f5f9', black: '#1e293b',
        orange: '#f97316', grey: '#94a3b8', gray: '#94a3b8'
      };
      const itemColors = new Map();
      const overrideColors = new Map();
      let defaultRepColor = null;

      for (const ent of this.entities.values()) {
        if (ent.type === 'COLOUR_RGB' && ent.args.length >= 4) {
          const rRaw = Number(ent.args[1]);
          const gRaw = Number(ent.args[2]);
          const bRaw = Number(ent.args[3]);
          const scale = (rRaw > 1.001 || gRaw > 1.001 || bRaw > 1.001) ? 1 : 255;
          const r = Math.max(0, Math.min(255, Math.round((Number.isFinite(rRaw) ? rRaw : 0) * scale)));
          const g = Math.max(0, Math.min(255, Math.round((Number.isFinite(gRaw) ? gRaw : 0) * scale)));
          const b = Math.max(0, Math.min(255, Math.round((Number.isFinite(bRaw) ? bRaw : 0) * scale)));
          ent._hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        } else if (ent.type === 'DRAUGHTING_PRE_DEFINED_COLOUR' && ent.args.length >= 1) {
          const cname = String(ent.args[0] || '').trim().toLowerCase();
          if (PREDEF_STEP_COLORS[cname]) ent._hex = PREDEF_STEP_COLORS[cname];
        }
      }

      const findRgbHex = (node, depth = 0, visited = new Set()) => {
        if (!node || depth > 28) return null;
        if (node._hex) return node._hex;
        if (Array.isArray(node)) {
          for (const x of node) {
            const h = findRgbHex(x, depth + 1, visited);
            if (h) return h;
          }
          return null;
        }
        if (node.ref != null) {
          if (visited.has(node.ref)) return null;
          visited.add(node.ref);
          return findRgbHex(this.entities.get(node.ref), depth + 1, visited);
        }
        if (node.args) return findRgbHex(node.args, depth + 1, visited);
        return null;
      };

      for (const ent of this.entities.values()) {
        if ((ent.type === 'STYLED_ITEM' || ent.type === 'OVER_RIDING_STYLED_ITEM') && ent.args[2] && ent.args[2].ref != null) {
          const hex = findRgbHex(ent.args[1], 0, new Set());
          if (hex) {
            if (ent.type === 'OVER_RIDING_STYLED_ITEM') overrideColors.set(ent.args[2].ref, hex);
            else itemColors.set(ent.args[2].ref, hex);
            const targetEnt = this.entities.get(ent.args[2].ref);
            if (!defaultRepColor && targetEnt && /SHAPE_REPRESENTATION|SHELL_BASED_SURFACE_MODEL/i.test(targetEnt.type)) {
              defaultRepColor = hex;
            }
          }
        }
      }
      // Merge OVER_RIDING_STYLED_ITEM on top of STYLED_ITEM so face overrides always win
      for (const [refId, hex] of overrideColors.entries()) {
        itemColors.set(refId, hex);
      }

      // Tessellate an EDGE_CURVE into 3D polyline points
      const sampleEdgeCurve = (ecEnt, sameSense = true) => {
        if (!ecEnt || ecEnt.type !== 'EDGE_CURVE') return null;
        const pStart = getPoint(ecEnt.args[1]);
        const pEnd = getPoint(ecEnt.args[2]);
        const geom = getEnt(ecEnt.args[3]);
        const ecSense = ecEnt.args[4] !== false;
        const forward = sameSense ? ecSense : !ecSense;
        const pts = [];
        let isCircle = false;
        let radius = 0;
        let center = null;

        if (geom && geom.type === 'CIRCLE') {
          isCircle = true;
          const frame = getAxisFrame(geom.args[1]);
          radius = Number(geom.args[2]) || 0;
          center = frame.o;
          if (radius > 1e-6) {
            const p0 = forward ? pStart : pEnd;
            const p1 = forward ? pEnd : pStart;
            const isFull = !p0 || !p1 || vLen(vSub(p0, p1)) < 1e-4;
            let a0 = 0, sweep = Math.PI * 2;
            if (!isFull) {
              const d0 = vSub(p0, frame.o);
              const d1 = vSub(p1, frame.o);
              a0 = Math.atan2(vDot(d0, frame.y), vDot(d0, frame.x));
              const a1 = Math.atan2(vDot(d1, frame.y), vDot(d1, frame.x));
              sweep = a1 - a0;
              if (forward) { while (sweep <= 0) sweep += Math.PI * 2; }
              else { while (sweep >= 0) sweep -= Math.PI * 2; }
            }
            const segs = Math.max(12, Math.min(36, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * 28)));
            for (let s = 0; s <= segs; s++) {
              const ang = a0 + (sweep * s) / segs;
              pts.push(vAdd(frame.o, vAdd(vScale(frame.x, Math.cos(ang) * radius), vScale(frame.y, Math.sin(ang) * radius))));
            }
          }
        } else if (geom && geom.type === 'ELLIPSE') {
          const frame = getAxisFrame(geom.args[1]);
          const r1 = Number(geom.args[2]) || 0;
          const r2 = Number(geom.args[3]) || r1;
          const segs = 28;
          for (let s = 0; s <= segs; s++) {
            const ang = (s / segs) * Math.PI * 2;
            pts.push(vAdd(frame.o, vAdd(vScale(frame.x, Math.cos(ang) * r1), vScale(frame.y, Math.sin(ang) * r2))));
          }
        } else if (geom && geom.type === 'B_SPLINE_CURVE_WITH_KNOTS' && Array.isArray(geom.args[2])) {
          const ctrl = geom.args[2].map(getPoint).filter(Boolean);
          if (ctrl.length >= 2) {
            if (!forward) ctrl.reverse();
            pts.push(...ctrl);
          }
        } else if (pStart && pEnd) {
          pts.push(forward ? pStart : pEnd, forward ? pEnd : pStart);
        }

        if (pts.length < 2) return null;
        return { pts, isCircle, radius, center };
      };

      // Extract Product / Assembly names
      const productNames = [];
      for (const ent of this.entities.values()) {
        if (ent.type === 'PRODUCT' && ent.args[1]) {
          productNames.push(String(ent.args[1]));
        }
        if (ent.type === 'NEXT_ASSEMBLY_USAGE_OCCURRENCE') {
          this.assemblyNodes.push({
            id: ent.id,
            name: String(ent.args[1] || ent.args[0] || `Component_${ent.id}`),
            parentRef: ent.args[3] && ent.args[3].ref,
            childRef: ent.args[4] && ent.args[4].ref
          });
        }
      }

      // Build bodies from MANIFOLD_SOLID_BREP / SHELL_BASED_SURFACE_MODEL / CLOSED_SHELL
      const solidEnts = [];
      for (const ent of this.entities.values()) {
        if (ent.type === 'MANIFOLD_SOLID_BREP' || ent.type === 'BREP_WITH_VOIDS') solidEnts.push(ent);
      }
      if (!solidEnts.length) {
        for (const ent of this.entities.values()) {
          if (ent.type === 'CLOSED_SHELL' || ent.type === 'OPEN_SHELL') solidEnts.push(ent);
        }
      }

      const buildBodyFromFaces = (name, faceRefs, bodyColor) => {
        const triangles = [];
        const edges = [];
        const seenCircles = new Set();
        let faceCount = 0;

        for (const fRef of faceRefs) {
          const fEnt = getEnt(fRef);
          if (!fEnt || (fEnt.type !== 'ADVANCED_FACE' && fEnt.type !== 'FACE_SURFACE')) continue;
          faceCount++;
          const faceColor = itemColors.get(fEnt.id) || bodyColor;
          const boundRefs = Array.isArray(fEnt.args[1]) ? fEnt.args[1] : [];
          let outerLoopPts = null;

          for (const bRef of boundRefs) {
            const bEnt = getEnt(bRef);
            if (!bEnt) continue;
            const isOuter = (bEnt.type === 'FACE_OUTER_BOUND') || !outerLoopPts;
            const loopEnt = getEnt(bEnt.args[1]);
            if (!loopEnt || loopEnt.type !== 'EDGE_LOOP' || !Array.isArray(loopEnt.args[1])) continue;
            const loopPts = [];
            for (const oeRef of loopEnt.args[1]) {
              const oeEnt = getEnt(oeRef);
              if (!oeEnt || oeEnt.type !== 'ORIENTED_EDGE') continue;
              const ecEnt = getEnt(oeEnt.args[3]);
              const sense = oeEnt.args[4] !== false;
              const sampled = sampleEdgeCurve(ecEnt, sense);
              if (!sampled) continue;
              edges.push({ pts: sampled.pts, isCircle: sampled.isCircle, radius: sampled.radius, center: sampled.center });
              if (sampled.isCircle && sampled.radius > 1e-4 && sampled.center) {
                const cKey = `${sampled.center[0].toFixed(2)},${sampled.center[1].toFixed(2)},${sampled.center[2].toFixed(2)},${sampled.radius.toFixed(3)}`;
                if (!seenCircles.has(cKey)) {
                  seenCircles.add(cKey);
                  this.holes.push({ center: sampled.center, radius: sampled.radius, diameter: sampled.radius * 2, bodyName: name });
                }
              }
              for (let pi = 0; pi < sampled.pts.length; pi++) {
                const pt = sampled.pts[pi];
                if (!loopPts.length || vLen(vSub(loopPts[loopPts.length - 1], pt)) > 1e-5) {
                  loopPts.push(pt);
                }
              }
            }
            if (loopPts.length >= 3 && vLen(vSub(loopPts[0], loopPts[loopPts.length - 1])) < 1e-4) {
              loopPts.pop();
            }
            if (isOuter && loopPts.length >= 3) outerLoopPts = loopPts;
          }

          // Fan-triangulate outer face polygon for crisp 3D shading
          if (outerLoopPts && outerLoopPts.length >= 3) {
            const v0 = outerLoopPts[0];
            for (let k = 1; k < outerLoopPts.length - 1; k++) {
              const a = v0, b = outerLoopPts[k], c = outerLoopPts[k + 1];
              const nrm = vNorm(vCross(vSub(b, a), vSub(c, a)));
              triangles.push({ a, b, c, n: nrm, color: faceColor, _origColor: faceColor });
            }
          }
        }
        const resolvedBodyCol = bodyColor || '#64748b';
        return {
          id: `body_${this.bodies.length + 1}`,
          name: name || `Solid_${this.bodies.length + 1}`,
          visible: true,
          color: resolvedBodyCol,
          _origColor: resolvedBodyCol,
          hasStepColor: !!(bodyColor && bodyColor !== '#7c8ea6'),
          faceCount,
          triangles,
          edges
        };
      };

      solidEnts.forEach((sEnt, idx) => {
        const bName = (typeof sEnt.args[0] === 'string' && sEnt.args[0].trim())
          ? sEnt.args[0].trim()
          : (productNames[idx] || `SolidBody_${idx + 1}`);
        const shellEnt = (sEnt.type === 'CLOSED_SHELL' || sEnt.type === 'OPEN_SHELL') ? sEnt : getEnt(sEnt.args[1]);
        const faceRefs = (shellEnt && Array.isArray(shellEnt.args[1])) ? shellEnt.args[1] : [];
        const bColor = itemColors.get(sEnt.id) || (shellEnt && itemColors.get(shellEnt.id)) || defaultRepColor || '#7c8ea6';
        const body = buildBodyFromFaces(bName, faceRefs, bColor);
        if (body.triangles.length > 0 || body.edges.length > 0) this.bodies.push(body);
      });

      // Fallback: if STEP only had standalone EDGE_CURVEs or geometric curves
      if (!this.bodies.length) {
        const looseEdges = [];
        for (const ent of this.entities.values()) {
          if (ent.type === 'EDGE_CURVE') {
            const s = sampleEdgeCurve(ent, true);
            if (s) looseEdges.push(s);
          }
        }
        if (looseEdges.length) {
          this.bodies.push({
            id: 'body_1',
            name: productNames[0] || this.header.name || 'WireframeBody',
            visible: true,
            color: '#7c8ea6',
            faceCount: 0,
            triangles: [],
            edges: looseEdges
          });
        }
      }

      this.stats = computeMeshStats(this.bodies);
      return this;
    }
  }

  // ---- STL (ASCII & Binary) Parser ----
  function parseSTL(bytesOrStr, fileName = 'Model.stl') {
    const u8 = (bytesOrStr instanceof Uint8Array) ? bytesOrStr
      : (typeof bytesOrStr === 'string' ? new TextEncoder().encode(bytesOrStr) : new Uint8Array(bytesOrStr || []));
    const triangles = [];
    const edges = [];

    // Check binary STL: 80-byte header + 4-byte uint32 triCount + 50*triCount bytes
    let isBinary = false;
    if (u8.length >= 84) {
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      const triCount = dv.getUint32(80, true);
      if (84 + triCount * 50 === u8.length) {
        isBinary = true;
        let off = 84;
        for (let i = 0; i < triCount; i++) {
          const nx = dv.getFloat32(off, true), ny = dv.getFloat32(off + 4, true), nz = dv.getFloat32(off + 8, true);
          const a = [dv.getFloat32(off + 12, true), dv.getFloat32(off + 16, true), dv.getFloat32(off + 20, true)];
          const b = [dv.getFloat32(off + 24, true), dv.getFloat32(off + 28, true), dv.getFloat32(off + 32, true)];
          const c = [dv.getFloat32(off + 36, true), dv.getFloat32(off + 40, true), dv.getFloat32(off + 44, true)];
          const n = (Math.hypot(nx, ny, nz) > 1e-6) ? vNorm([nx, ny, nz]) : vNorm(vCross(vSub(b, a), vSub(c, a)));
          triangles.push({ a, b, c, n, color: '#7c8ea6' });
          off += 50;
        }
      }
    }
    if (!isBinary) {
      const txt = typeof bytesOrStr === 'string' ? bytesOrStr : new TextDecoder('utf-8', { fatal: false }).decode(u8);
      const vRe = /vertex\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)/gi;
      const verts = [];
      let m;
      while ((m = vRe.exec(txt)) !== null) {
        verts.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
      }
      for (let i = 0; i + 2 < verts.length; i += 3) {
        const a = verts[i], b = verts[i + 1], c = verts[i + 2];
        const n = vNorm(vCross(vSub(b, a), vSub(c, a)));
        triangles.push({ a, b, c, n, color: '#7c8ea6' });
      }
    }
    // Extract sharp feature edges for crisp CAD wireframe
    for (let i = 0; i < Math.min(triangles.length, 4000); i++) {
      const t = triangles[i];
      edges.push({ pts: [t.a, t.b, t.c, t.a], isCircle: false });
    }
    const bodies = [{
      id: 'body_1',
      name: fileName.replace(/\.stl$/i, '') || 'STL_Mesh',
      visible: true,
      color: '#7c8ea6',
      faceCount: triangles.length,
      triangles,
      edges
    }];
    return {
      fileName,
      format: 'STL',
      unitName: 'mm',
      header: { name: fileName, schema: isBinary ? 'Binary STL' : 'ASCII STL' },
      bodies,
      holes: [],
      assemblyNodes: [],
      stats: computeMeshStats(bodies)
    };
  }

  // ---- Wavefront OBJ Parser ----
  function parseOBJ(content, fileName = 'Model.obj') {
    const txt = typeof content === 'string' ? content : new TextDecoder('utf-8', { fatal: false }).decode(content || new Uint8Array());
    const verts = [];
    const triangles = [];
    const edges = [];
    for (const line of txt.split(/\r?\n/)) {
      const t = line.trim();
      if (t.startsWith('v ')) {
        const p = t.split(/\s+/);
        if (p.length >= 4) verts.push([parseFloat(p[1]) || 0, parseFloat(p[2]) || 0, parseFloat(p[3]) || 0]);
      } else if (t.startsWith('f ')) {
        const idx = t.split(/\s+/).slice(1).map(tok => { const raw = parseInt(tok.split('/')[0], 10); if (!Number.isFinite(raw) || raw === 0) return -1; return raw < 0 ? verts.length + raw : raw - 1; }).filter(k => k >= 0 && k < verts.length);
        if (idx.length >= 3) {
          for (let k = 1; k < idx.length - 1; k++) {
            const a = verts[idx[0]], b = verts[idx[k]], c = verts[idx[k + 1]];
            triangles.push({ a, b, c, n: vNorm(vCross(vSub(b, a), vSub(c, a))), color: '#7c8ea6' });
          }
          edges.push({ pts: [...idx.map(k => verts[k]), verts[idx[0]]], isCircle: false });
        }
      }
    }
    const bodies = [{
      id: 'body_1',
      name: fileName.replace(/\.obj$/i, '') || 'OBJ_Mesh',
      visible: true,
      color: '#7c8ea6',
      faceCount: triangles.length,
      triangles,
      edges
    }];
    return {
      fileName,
      format: 'OBJ',
      unitName: 'mm',
      header: { name: fileName, schema: 'Wavefront OBJ' },
      bodies,
      holes: [],
      assemblyNodes: [],
      stats: computeMeshStats(bodies)
    };
  }

  // ---- SolidWorks OLE Header & Metadata Probe ----
  function inspectSolidWorksMetadata(bytes, fileName = 'Part.sldprt') {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    const isOLE = u8.length >= 8 && u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0;
    const ext = (fileName.split('.').pop() || 'sldprt').toUpperCase();
    const docType = ext === 'SLDASM' ? 'SolidWorks Assembly' : (ext === 'SLDDRW' ? 'SolidWorks Drawing' : 'SolidWorks Part');
    return {
      fileName,
      docType,
      isOLECompound: isOLE,
      byteLength: u8.length
    };
  }

  // ---- Project 3D Model to 2D Orthographic AutoCAD DXF (Front / Top / Right / Iso) ----
  function project3DToDXF(model, view = 'front') {
    if (!model || !Array.isArray(model.bodies)) return '';
    const projectPt = pt => {
      const [x, y, z] = pt;
      if (view === 'top') return [x, y];
      if (view === 'right') return [y, z];
      if (view === 'iso') {
        const c30 = Math.cos(Math.PI / 6), s30 = Math.sin(Math.PI / 6);
        return [(x - y) * c30, z + (x + y) * s30];
      }
      return [x, z]; // 'front'
    };

    const lines = [
      '0', 'SECTION', '2', 'HEADER',
      '9', '$INSUNITS', '70', model.unitName === 'in' ? '1' : '4',
      '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES'
    ];
    const seenEdges = new Set();
    for (const body of model.bodies) {
      if (body.visible === false) continue;
      const lyr = String(body.name || 'SOLID').replace(/[^A-Za-z0-9_-]/g, '_');
      for (const ed of (body.edges || [])) {
        const pts = ed.pts || [];
        for (let i = 1; i < pts.length; i++) {
          const [x1, y1] = projectPt(pts[i - 1]);
          const [x2, y2] = projectPt(pts[i]);
          if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) continue;
          if (Math.hypot(x2 - x1, y2 - y1) < 1e-5) continue;
          const a1 = `${Math.round(x1 * 1e3)},${Math.round(y1 * 1e3)}`;
          const a2 = `${Math.round(x2 * 1e3)},${Math.round(y2 * 1e3)}`;
          const key = `${lyr}|${a1 < a2 ? a1 + '|' + a2 : a2 + '|' + a1}`;
          if (seenEdges.has(key)) continue;
          seenEdges.add(key);
          lines.push(
            '0', 'LINE', '8', lyr,
            '10', x1.toFixed(4), '20', y1.toFixed(4),
            '11', x2.toFixed(4), '21', y2.toFixed(4)
          );
        }
      }
    }
    lines.push('0', 'ENDSEC', '0', 'EOF');
    return lines.join('\n');
  }

  // ---- 3D STEP vs. STEP Revision Compare Engine ----
  function compare3DModels(modelA, modelB, tol = 0.05) {
    const q = v => Math.round((Number(v) || 0) / Math.max(1e-4, tol));
    const edgeKey = (p1, p2) => {
      const k1 = `${q(p1[0])},${q(p1[1])},${q(p1[2])}`;
      const k2 = `${q(p2[0])},${q(p2[1])},${q(p2[2])}`;
      return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
    };
    const collectEdgeMap = model => {
      const map = new Map();
      for (const b of (model && model.bodies ? model.bodies : [])) {
        if (b.visible === false) continue;
        for (const ed of (b.edges || [])) {
          const pts = ed.pts || [];
          for (let i = 1; i < pts.length; i++) {
            const k = edgeKey(pts[i - 1], pts[i]);
            if (!map.has(k)) map.set(k, { p1: pts[i - 1], p2: pts[i], body: b.name, isCircle: !!ed.isCircle });
          }
        }
      }
      return map;
    };

    const mapA = collectEdgeMap(modelA);
    const mapB = collectEdgeMap(modelB);
    const commonEdges = [];
    const removedEdges = [];
    const addedEdges = [];

    for (const [k, seg] of mapA.entries()) {
      if (mapB.has(k)) commonEdges.push(seg);
      else removedEdges.push(seg);
    }
    for (const [k, seg] of mapB.entries()) {
      if (!mapA.has(k)) addedEdges.push(seg);
    }

    const sA = (modelA && modelA.stats) || computeMeshStats((modelA && modelA.bodies) || []);
    const sB = (modelB && modelB.stats) || computeMeshStats((modelB && modelB.bodies) || []);

    return {
      commonEdges,
      removedEdges,
      addedEdges,
      unchangedCount: commonEdges.length,
      removedCount: removedEdges.length,
      addedCount: addedEdges.length,
      deltaSizeX: sB.sizeX - sA.sizeX,
      deltaSizeY: sB.sizeY - sA.sizeY,
      deltaSizeZ: sB.sizeZ - sA.sizeZ,
      deltaVolumeCm3: sB.volumeCm3 - sA.volumeCm3,
      deltaHoles: sB.holeCount - sA.holeCount
    };
  }

  // ---- Synthetic SolidWorks Mechanical Bracket STEP Generator (Rev A & Rev B) ----
  function generateSampleSTEP(revision = 'A') {
    const isB = String(revision).toUpperCase() === 'B';
    const W = isB ? 110.0 : 100.0;
    const D = 60.0;
    const H = 20.0;
    const holeR = isB ? 10.0 : 8.0;
    const name = isB ? 'Kensho_Bracket_RevB' : 'Kensho_Bracket_RevA';
    return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('SolidWorks 2026 Mechanical Bracket ${revision}'),'2;1');
FILE_NAME('${name}.step','2026-11-20T10:00:00',('Kensho Studio'),('Kensho Pro'),'CAD3DEngine','SolidWorks','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
#1 = PRODUCT('${name}','${name}','',(#2));
#2 = PRODUCT_CONTEXT('',#3,'mechanical');
#3 = APPLICATION_CONTEXT('automotive design');
#10 = CARTESIAN_POINT('P0',(0.0,0.0,0.0));
#11 = CARTESIAN_POINT('P1',(${W.toFixed(1)},0.0,0.0));
#12 = CARTESIAN_POINT('P2',(${W.toFixed(1)},${D.toFixed(1)},0.0));
#13 = CARTESIAN_POINT('P3',(0.0,${D.toFixed(1)},0.0));
#14 = CARTESIAN_POINT('P4',(0.0,0.0,${H.toFixed(1)}));
#15 = CARTESIAN_POINT('P5',(${W.toFixed(1)},0.0,${H.toFixed(1)}));
#16 = CARTESIAN_POINT('P6',(${W.toFixed(1)},${D.toFixed(1)},${H.toFixed(1)}));
#17 = CARTESIAN_POINT('P7',(0.0,${D.toFixed(1)},${H.toFixed(1)}));
#18 = CARTESIAN_POINT('HC',(${(W / 2).toFixed(1)},${(D / 2).toFixed(1)},${H.toFixed(1)}));
#19 = DIRECTION('Z',(0.0,0.0,1.0));
#20 = DIRECTION('X',(1.0,0.0,0.0));
#21 = AXIS2_PLACEMENT_3D('HOLE_AX',#18,#19,#20);
#22 = CIRCLE('BORE_C',#21,${holeR.toFixed(1)});
#23 = CARTESIAN_POINT('HP0',(${(W / 2 + holeR).toFixed(1)},${(D / 2).toFixed(1)},${H.toFixed(1)}));
#24 = VERTEX_POINT('V0',#10);
#25 = VERTEX_POINT('V1',#11);
#26 = VERTEX_POINT('V2',#12);
#27 = VERTEX_POINT('V3',#13);
#28 = VERTEX_POINT('V4',#14);
#29 = VERTEX_POINT('V5',#15);
#30 = VERTEX_POINT('V6',#16);
#31 = VERTEX_POINT('V7',#17);
#32 = VERTEX_POINT('VH',#23);
#40 = EDGE_CURVE('E01',#24,#25,$,.T.);
#41 = EDGE_CURVE('E12',#25,#26,$,.T.);
#42 = EDGE_CURVE('E23',#26,#27,$,.T.);
#43 = EDGE_CURVE('E30',#27,#24,$,.T.);
#44 = EDGE_CURVE('E45',#28,#29,$,.T.);
#45 = EDGE_CURVE('E56',#29,#30,$,.T.);
#46 = EDGE_CURVE('E67',#30,#31,$,.T.);
#47 = EDGE_CURVE('E74',#31,#28,$,.T.);
#48 = EDGE_CURVE('E04',#24,#28,$,.T.);
#49 = EDGE_CURVE('E15',#25,#29,$,.T.);
#50 = EDGE_CURVE('E26',#26,#30,$,.T.);
#51 = EDGE_CURVE('E37',#27,#31,$,.T.);
#52 = EDGE_CURVE('EHOLE',#32,#32,#22,.T.);
#60 = ORIENTED_EDGE('',*,*,#40,.T.);
#61 = ORIENTED_EDGE('',*,*,#41,.T.);
#62 = ORIENTED_EDGE('',*,*,#42,.T.);
#63 = ORIENTED_EDGE('',*,*,#43,.T.);
#64 = ORIENTED_EDGE('',*,*,#44,.T.);
#65 = ORIENTED_EDGE('',*,*,#45,.T.);
#66 = ORIENTED_EDGE('',*,*,#46,.T.);
#67 = ORIENTED_EDGE('',*,*,#47,.T.);
#68 = ORIENTED_EDGE('',*,*,#48,.T.);
#69 = ORIENTED_EDGE('',*,*,#49,.T.);
#70 = ORIENTED_EDGE('',*,*,#50,.T.);
#71 = ORIENTED_EDGE('',*,*,#51,.T.);
#72 = ORIENTED_EDGE('',*,*,#40,.F.);
#73 = ORIENTED_EDGE('',*,*,#44,.F.);
#74 = ORIENTED_EDGE('',*,*,#49,.F.);
#75 = ORIENTED_EDGE('',*,*,#48,.F.);
#76 = ORIENTED_EDGE('',*,*,#41,.F.);
#77 = ORIENTED_EDGE('',*,*,#45,.F.);
#78 = ORIENTED_EDGE('',*,*,#50,.F.);
#79 = ORIENTED_EDGE('',*,*,#42,.F.);
#80 = ORIENTED_EDGE('',*,*,#46,.F.);
#81 = ORIENTED_EDGE('',*,*,#51,.F.);
#82 = ORIENTED_EDGE('',*,*,#43,.F.);
#83 = ORIENTED_EDGE('',*,*,#47,.F.);
#84 = ORIENTED_EDGE('',*,*,#52,.T.);
#90 = EDGE_LOOP('L_BOT',(#63,#62,#61,#60));
#91 = EDGE_LOOP('L_TOP',(#64,#65,#66,#67));
#92 = EDGE_LOOP('L_FRONT',(#60,#69,#73,#75));
#93 = EDGE_LOOP('L_RIGHT',(#61,#70,#77,#74));
#94 = EDGE_LOOP('L_BACK',(#62,#71,#80,#78));
#95 = EDGE_LOOP('L_LEFT',(#63,#68,#83,#81));
#96 = EDGE_LOOP('L_HOLE',(#84));
#100 = FACE_OUTER_BOUND('FB_BOT',#90,.T.);
#101 = FACE_OUTER_BOUND('FB_TOP',#91,.T.);
#102 = FACE_OUTER_BOUND('FB_FRONT',#92,.T.);
#103 = FACE_OUTER_BOUND('FB_RIGHT',#93,.T.);
#104 = FACE_OUTER_BOUND('FB_BACK',#94,.T.);
#105 = FACE_OUTER_BOUND('FB_LEFT',#95,.T.);
#106 = FACE_BOUND('FB_HOLE',#96,.T.);
#110 = ADVANCED_FACE('F_BOT',(#100),$,.T.);
#111 = ADVANCED_FACE('F_TOP',(#101,#106),$,.T.);
#112 = ADVANCED_FACE('F_FRONT',(#102),$,.T.);
#113 = ADVANCED_FACE('F_RIGHT',(#103),$,.T.);
#114 = ADVANCED_FACE('F_BACK',(#104),$,.T.);
#115 = ADVANCED_FACE('F_LEFT',(#105),$,.T.);
#120 = CLOSED_SHELL('SHELL_1',(#110,#111,#112,#113,#114,#115));
#121 = MANIFOLD_SOLID_BREP('${name}',#120);
#200 = COLOUR_RGB('Anodized_Blue',0.18,0.48,0.82);
#201 = FILL_AREA_STYLE_COLOUR('',#200);
#202 = FILL_AREA_STYLE('',(#201));
#203 = SURFACE_STYLE_FILL_AREA(#202);
#204 = SURFACE_SIDE_STYLE('',(#203));
#205 = SURFACE_STYLE_USAGE(.BOTH.,#204);
#206 = PRESENTATION_STYLE_ASSIGNMENT((#205));
#207 = STYLED_ITEM('BodyColor',(#206),#121);
#210 = COLOUR_RGB('Machined_Gold',0.88,0.68,0.18);
#211 = FILL_AREA_STYLE_COLOUR('',#210);
#212 = FILL_AREA_STYLE('',(#211));
#213 = SURFACE_STYLE_FILL_AREA(#212);
#214 = SURFACE_SIDE_STYLE('',(#213));
#215 = SURFACE_STYLE_USAGE(.BOTH.,#214);
#216 = PRESENTATION_STYLE_ASSIGNMENT((#215));
#217 = OVER_RIDING_STYLED_ITEM('TopFaceColor',(#216),#111,#207);
ENDSEC;
END-ISO-10303-21;`;
  }

  function parse3DCAD(content, fileName = 'Model.step') {
    const lower = String(fileName || '').toLowerCase();
    if (lower.endsWith('.stl')) return parseSTL(content, fileName);
    if (lower.endsWith('.obj')) return parseOBJ(content, fileName);
    return new STEPParser(content, fileName).parse();
  }

  return {
    MATERIALS,
    is3DCADFileName,
    isSolidWorksFileName,
    isSTEPFileName,
    STEPParser,
    parse3DCAD,
    parseSTL,
    parseOBJ,
    inspectSolidWorksMetadata,
    computeMeshStats,
    calculateMassGrams,
    project3DToDXF,
    compare3DModels,
    generateSampleSTEP
  };
});
