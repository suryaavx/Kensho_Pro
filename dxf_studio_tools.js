/**
 * ============================================================================
 * KENSHO PRO — DXF STUDIO PRECISION TOOLS & COMPARE OVERLAY (dxf_studio_tools.js)
 * ============================================================================
 * Split companion module for `dxf_studio.js` providing advanced AutoCAD Modify,
 * Metrology, Drawing Cleanup (`BREAK`, `LENGTHEN`, `ORIGIN`, `PURGE`, `AREA`),
 * and Stepped 5-10 Mil Highlight Box Overlay controls.
 * ============================================================================
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DXFStudioTools = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ==========================================================================
   * [MODULE SECTION: BREAK ENTITY AT POINT (AUTO-SPLIT LINE / ARC / CIRCLE)]
   * WHAT THIS IS: Splits a LINE, ARC, or CIRCLE into two distinct CAD entities
   *   at a user-specified world coordinate `(wx, wy)`.
   * WHY / HOW TO EDIT: Engineers can extend this function to support breaking
   *   SPLINE or ELLIPSE entities at arbitrary parametric coordinates.
   * ========================================================================== */
  function breakEntityAtPoint(ent, wx, wy, parser) {
    if (!ent || !parser || !Array.isArray(parser.entities)) return { ok: false, reason: 'No target entity' };
    const idx = parser.entities.indexOf(ent);
    if (idx === -1) return { ok: false, reason: 'Entity not in drawing' };

    if (ent.type === 'LINE') {
      const dx = (ent.x2 || 0) - (ent.x1 || 0);
      const dy = (ent.y2 || 0) - (ent.y1 || 0);
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1e-6) return { ok: false, reason: 'Line too short to break' };
      let t = (((wx - ent.x1) * dx + (wy - ent.y1) * dy) / lenSq);
      t = Math.max(0.15, Math.min(0.85, t));
      const bx = ent.x1 + dx * t;
      const by = ent.y1 + dy * t;
      const origX2 = ent.x2, origY2 = ent.y2;
      ent.x2 = +bx.toFixed(4);
      ent.y2 = +by.toFixed(4);
      ent._cachedBBox = null;
      const secondLine = {
        ...ent,
        _id: 'ent_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
        x1: +bx.toFixed(4),
        y1: +by.toFixed(4),
        x2: origX2,
        y2: origY2,
        _cachedBBox: null
      };
      parser.entities.splice(idx + 1, 0, secondLine);
      return { ok: true, created: secondLine, splitPoint: { x: bx, y: by } };
    }

    if (ent.type === 'ARC') {
      let sAng = ((Number(ent.startAngle) || 0) % 360 + 360) % 360;
      let eAng = ((ent.endAngle != null ? Number(ent.endAngle) : 360) % 360 + 360) % 360;
      if (eAng <= sAng) eAng += 360;
      let clickAng = (Math.atan2(wy - (ent.cy || 0), wx - (ent.cx || 0)) * 180) / Math.PI;
      clickAng = ((clickAng % 360) + 360) % 360;
      if (clickAng < sAng) clickAng += 360;
      if (clickAng <= sAng + 2 || clickAng >= eAng - 2) {
        clickAng = (sAng + eAng) * 0.5;
      }
      const origEnd = +(eAng % 360).toFixed(2);
      const splitMod = +(clickAng % 360).toFixed(2);
      ent.startAngle = +(sAng % 360).toFixed(2);
      ent.endAngle = splitMod;
      ent._cachedBBox = null;
      const secondArc = {
        ...ent,
        _id: 'ent_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
        startAngle: splitMod,
        endAngle: origEnd,
        _cachedBBox: null
      };
      parser.entities.splice(idx + 1, 0, secondArc);
      return { ok: true, created: secondArc, splitAngle: splitMod };
    }

    if (ent.type === 'CIRCLE') {
      let clickAng = (Math.atan2(wy - (ent.cy || 0), wx - (ent.cx || 0)) * 180) / Math.PI;
      clickAng = ((clickAng % 360) + 360) % 360;
      const oppositeAng = (clickAng + 180) % 360;
      ent.type = 'ARC';
      ent.startAngle = +clickAng.toFixed(2);
      ent.endAngle = +oppositeAng.toFixed(2);
      ent._cachedBBox = null;
      const secondHalf = {
        ...ent,
        _id: 'ent_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
        type: 'ARC',
        startAngle: +oppositeAng.toFixed(2),
        endAngle: +clickAng.toFixed(2),
        _cachedBBox: null
      };
      parser.entities.splice(idx + 1, 0, secondHalf);
      return { ok: true, created: secondHalf, splitAngle: clickAng };
    }

    return { ok: false, reason: `BREAK is supported on LINE, ARC, and CIRCLE (got ${ent.type})` };
  }

  /* ==========================================================================
   * [MODULE SECTION: LENGTHEN / DELTA LINE & ARC MODIFIER]
   * WHAT THIS IS: Extends or shortens LINE, ARC, and open LWPOLYLINE entities
   *   by an exact delta distance while preserving their exact angle or curvature.
   * WHY / HOW TO EDIT: Edit this section to support total-length specification
   *   or bi-directional symmetric lengthening.
   * ========================================================================== */
  function lengthenEntity(ent, deltaDist = 5.0) {
    if (!ent || !Number.isFinite(deltaDist)) return false;
    if (ent.type === 'LINE') {
      const dx = (ent.x2 || 0) - (ent.x1 || 0);
      const dy = (ent.y2 || 0) - (ent.y1 || 0);
      const len = Math.hypot(dx, dy);
      if (len < 1e-6 || len + deltaDist <= 1e-4) return false;
      const ux = dx / len, uy = dy / len;
      ent.x2 = +(ent.x2 + ux * deltaDist).toFixed(4);
      ent.y2 = +(ent.y2 + uy * deltaDist).toFixed(4);
      ent._cachedBBox = null;
      return true;
    }
    if (ent.type === 'ARC' && (ent.r || 0) > 1e-4) {
      let sAng = ((Number(ent.startAngle) || 0) % 360 + 360) % 360;
      let eAng = ((ent.endAngle != null ? Number(ent.endAngle) : 360) % 360 + 360) % 360;
      if (eAng <= sAng) eAng += 360;
      const sweep = eAng - sAng;
      const dAng = (deltaDist / ent.r) * (180 / Math.PI);
      const newSweep = Math.max(1.0, Math.min(359.5, sweep + dAng));
      ent.endAngle = +(((sAng + newSweep) % 360 + 360) % 360).toFixed(2);
      ent._cachedBBox = null;
      return true;
    }
    if (ent.type === 'LWPOLYLINE' && !ent.closed && Array.isArray(ent.points) && ent.points.length >= 2) {
      const n = ent.points.length;
      const pPrev = ent.points[n - 2];
      const pLast = ent.points[n - 1];
      const dx = (pLast[0] || 0) - (pPrev[0] || 0);
      const dy = (pLast[1] || 0) - (pPrev[1] || 0);
      const len = Math.hypot(dx, dy);
      if (len < 1e-6 || len + deltaDist <= 1e-4) return false;
      const ux = dx / len, uy = dy / len;
      pLast[0] = +(pLast[0] + ux * deltaDist).toFixed(4);
      pLast[1] = +(pLast[1] + uy * deltaDist).toFixed(4);
      delete ent.renderPoints;
      ent._cachedBBox = null;
      return true;
    }
    return false;
  }

  /* ==========================================================================
   * [MODULE SECTION: DATUM ORIGIN NORMALIZATION & DRAWING PURGE]
   * WHAT THIS IS: Normalizes selected entities (or the entire drawing) to CAD
   *   origin `(0,0)` and purges unused empty layers & degenerate 0-length geometry.
   * WHY / HOW TO EDIT: Useful for preparing imported PCB/mechanical DXFs before
   *   running A/B comparison or CAM export.
   * ========================================================================== */
  function moveEntitiesToOrigin(entities, parser, translateFn, useCenter = false) {
    if (!Array.isArray(entities) || !entities.length || typeof translateFn !== 'function') {
      return { moved: 0, dx: 0, dy: 0 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of entities) {
      const bb = parser && typeof parser.getEntityBBox === 'function' ? parser.getEntityBBox(e) : e._bbox;
      if (!bb || !isFinite(bb.minX)) continue;
      if (bb.minX < minX) minX = bb.minX;
      if (bb.minY < minY) minY = bb.minY;
      if (bb.maxX > maxX) maxX = bb.maxX;
      if (bb.maxY > maxY) maxY = bb.maxY;
    }
    if (!isFinite(minX)) return { moved: 0, dx: 0, dy: 0 };
    const refX = useCenter ? (minX + maxX) * 0.5 : minX;
    const refY = useCenter ? (minY + maxY) * 0.5 : minY;
    const dx = -refX, dy = -refY;
    for (const e of entities) {
      translateFn(e, dx, dy);
    }
    return { moved: entities.length, dx: +dx.toFixed(4), dy: +dy.toFixed(4) };
  }

  function purgeDrawing(parser, protectedLayers = new Set(['0', 'DEFPOINTS'])) {
    if (!parser || !Array.isArray(parser.entities)) return { removedDegenerate: 0, purgedLayers: 0 };
    const beforeEnts = parser.entities.length;
    parser.entities = parser.entities.filter(e => {
      if (!e) return false;
      if (e.type === 'LINE') return Math.hypot((e.x2 || 0) - (e.x1 || 0), (e.y2 || 0) - (e.y1 || 0)) > 1e-5;
      if (e.type === 'CIRCLE' || e.type === 'ARC') return (Number(e.r) || 0) > 1e-5;
      if (e.type === 'LWPOLYLINE' || e.type === 'SPLINE') return Array.isArray(e.points) && e.points.length >= 2;
      return true;
    });
    const removedDegenerate = beforeEnts - parser.entities.length;

    const usedLayers = new Set(parser.entities.map(e => e.layer || '0'));
    let purgedLayers = 0;
    if (parser.layers && typeof parser.layers === 'object') {
      for (const lName of Object.keys(parser.layers)) {
        if (protectedLayers.has(lName.toUpperCase()) || usedLayers.has(lName)) continue;
        if (parser.layers[lName] && parser.layers[lName].locked) continue;
        delete parser.layers[lName];
        purgedLayers++;
      }
    }
    return { removedDegenerate, purgedLayers };
  }

  /* ==========================================================================
   * [MODULE SECTION: CAD METROLOGY (EXACT LENGTH, AREA & BOUNDING SPAN)]
   * WHAT THIS IS: Computes total path length, enclosed polygon/circle area,
   *   and bounding box dimensions for selected CAD entities.
   * WHY / HOW TO EDIT: Add new entity formulas here to expand CAD inquiry reporting.
   * ========================================================================== */
  function computeSelectionMetrics(entities, parser) {
    if (!Array.isArray(entities) || !entities.length) {
      return { count: 0, totalLength: 0, totalArea: 0, spanX: 0, spanY: 0 };
    }
    let totalLength = 0;
    let totalArea = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const e of entities) {
      if (!e) continue;
      const bb = parser && typeof parser.getEntityBBox === 'function' ? parser.getEntityBBox(e) : e._bbox;
      if (bb && isFinite(bb.minX)) {
        if (bb.minX < minX) minX = bb.minX;
        if (bb.minY < minY) minY = bb.minY;
        if (bb.maxX > maxX) maxX = bb.maxX;
        if (bb.maxY > maxY) maxY = bb.maxY;
      }
      if (e.type === 'LINE') {
        totalLength += Math.hypot((e.x2 || 0) - (e.x1 || 0), (e.y2 || 0) - (e.y1 || 0));
      } else if (e.type === 'CIRCLE') {
        const r = Number(e.r) || 0;
        totalLength += 2 * Math.PI * r;
        totalArea += Math.PI * r * r;
      } else if (e.type === 'ARC') {
        const r = Number(e.r) || 0;
        let s = ((Number(e.startAngle) || 0) % 360 + 360) % 360;
        let end = ((e.endAngle != null ? Number(e.endAngle) : 360) % 360 + 360) % 360;
        if (end <= s) end += 360;
        totalLength += r * ((end - s) * Math.PI / 180);
      } else if ((e.type === 'LWPOLYLINE' || e.type === 'SOLID') && Array.isArray(e.points) && e.points.length >= 2) {
        const pts = e.renderPoints || e.points;
        const closed = !!(e.closed || e.type === 'SOLID');
        const n = pts.length;
        for (let i = 0; i < (closed ? n : n - 1); i++) {
          const p1 = pts[i], p2 = pts[(i + 1) % n];
          totalLength += Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        }
        if (closed && n >= 3) {
          let shoelace = 0;
          for (let i = 0; i < n; i++) {
            const p1 = pts[i], p2 = pts[(i + 1) % n];
            shoelace += p1[0] * p2[1] - p2[0] * p1[1];
          }
          totalArea += Math.abs(shoelace) * 0.5;
        }
      }
    }

    return {
      count: entities.length,
      totalLength: +totalLength.toFixed(3),
      totalArea: +totalArea.toFixed(3),
      spanX: isFinite(minX) ? +(maxX - minX).toFixed(3) : 0,
      spanY: isFinite(minY) ? +(maxY - minY).toFixed(3) : 0
    };
  }

  return {
    breakEntityAtPoint,
    lengthenEntity,
    moveEntitiesToOrigin,
    purgeDrawing,
    computeSelectionMetrics
  };
});
