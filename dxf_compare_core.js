/**
 * ============================================================================
 * KENSHO PRO — DXF COMPARE CORE & STEPPED BOX ENGINE (dxf_compare_core.js)
 * ============================================================================
 * Split companion module for `dxf_engine.js` to keep CAD comparison geometry,
 * sub-segment interval clipping, single red triangle text change indication,
 * and standard 7-mil stepped drawing highlight box generation modular and fast.
 * ============================================================================
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DXFCompareCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ==========================================================================
   * [MODULE SECTION: CAD PRIMITIVE SEGMENT DECOMPOSITION]
   * WHAT THIS IS: Converts compound or atomic CAD entities (LINE, CIRCLE, ARC,
   *   LWPOLYLINE, SPLINE, SOLID, HATCH, ELLIPSE) into normalized LINE and ARC
   *   primitive segments in world coordinates.
   * WHY / HOW TO EDIT: Edit or extend this function when adding support for new
   *   AutoCAD entity types (e.g., MLEADER, RAY, XLINE, REGION) so sub-segment
   *   comparison and stepped highlight boxes automatically work on them.
   * ========================================================================== */
  function tessellateBulgeArcFallback(x1, y1, x2, y2, bulge, segments = 16) {
    if (!bulge || Math.abs(bulge) < 1e-6) return [[x2, y2]];
    const chordX = x2 - x1, chordY = y2 - y1;
    const chordLen = Math.hypot(chordX, chordY);
    if (chordLen < 1e-9) return [[x2, y2]];
    const theta = 4 * Math.atan(bulge);
    const radius = Math.abs(chordLen / (2 * Math.sin(theta / 2)));
    const midX = (x1 + x2) * 0.5, midY = (y1 + y2) * 0.5;
    const normalX = -chordY / chordLen, normalY = chordX / chordLen;
    const distToCenter = (chordLen * 0.5) * ((1 - bulge * bulge) / (2 * bulge));
    const cx = midX + normalX * distToCenter;
    const cy = midY + normalY * distToCenter;
    const startAng = Math.atan2(y1 - cy, x1 - cx);
    const steps = Math.max(4, Math.min(48, segments));
    const pts = [];
    for (let i = 1; i <= steps; i++) {
      const ang = startAng + (theta * i) / steps;
      pts.push([cx + radius * Math.cos(ang), cy + radius * Math.sin(ang)]);
    }
    return pts;
  }

  function computeExactArcBBoxLocal(cx, cy, r, startAngle, endAngle) {
    let s = ((Number(startAngle) || 0) % 360 + 360) % 360;
    let e = ((endAngle != null ? Number(endAngle) : 360) % 360 + 360) % 360;
    if (e <= s) e += 360;
    const sRad = (s * Math.PI) / 180, eRad = (e * Math.PI) / 180;
    let minX = Math.min(cx + r * Math.cos(sRad), cx + r * Math.cos(eRad));
    let maxX = Math.max(cx + r * Math.cos(sRad), cx + r * Math.cos(eRad));
    let minY = Math.min(cy + r * Math.sin(sRad), cy + r * Math.sin(eRad));
    let maxY = Math.max(cy + r * Math.sin(sRad), cy + r * Math.sin(eRad));
    for (const card of [0, 90, 180, 270, 360, 450, 540, 630]) {
      if (card > s && card < e) {
        const rad = (card * Math.PI) / 180;
        const px = cx + r * Math.cos(rad), py = cy + r * Math.sin(rad);
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
    }
    return { minX, minY, maxX, maxY };
  }

  function computeTextEntityBBoxLocal(ent) {
    if (!ent) return null;
    const h = Math.max(0.5, Number(ent.height) || 2.5);
    const wf = Number(ent.widthFactor) || 0.86;
    const rawText = String(ent.text || '');
    const lines = rawText.split(/\r?\n/);
    let maxChars = 1;
    for (let li = 0; li < lines.length; li++) {
      const trimmedLen = lines[li].trimEnd().length || lines[li].length;
      if (trimmedLen > maxChars) maxChars = trimmedLen;
    }
    const textW = Math.max(h * 0.6, maxChars * h * 0.62 * wf);
    const w = ent.fitWidth > 0 ? ent.fitWidth : (ent.isMText && ent.boxWidth > 0 ? Math.min(ent.boxWidth, textW) : textW);
    const lineStep = h * (Number(ent.lineSpacing) || 1.2);
    const totalH = h + (lines.length - 1) * lineStep;
    const lx0 = ent.hMode === 'center' ? -w / 2 : (ent.hMode === 'right' ? -w : 0);
    const lx1 = lx0 + w;
    let ly0 = -(lines.length - 1) * lineStep - h * 0.2, ly1 = h * 0.98;
    if (ent.vMode === 'top') { ly0 = -totalH - h * 0.12; ly1 = h * 0.15; }
    else if (ent.vMode === 'middle') { ly0 = -totalH * 0.55; ly1 = totalH * 0.55; }
    else if (ent.vMode === 'bottom') { ly0 = -h * 0.12; ly1 = totalH + h * 0.12; }
    const rotDeg = Number(ent.rotation) || 0;
    const ox = Number(ent.x) || 0, oy = Number(ent.y) || 0;
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
      return { minX, minY, maxX, maxY };
    }
    return { minX: ox + lx0, minY: oy + ly0, maxX: ox + lx1, maxY: oy + ly1 };
  }

  function computeWordBBoxInText(ent, lineIdx, totalLines, charStart, charEnd, totalLineChars) {
    const h = Math.max(0.5, Number(ent.height) || 2.5);
    const wf = Number(ent.widthFactor) || 0.86;
    const lineChars = Math.max(1, totalLineChars);
    const textW = Math.max(h * 0.6, lineChars * h * 0.62 * wf);
    const lineW = ent.fitWidth > 0 ? ent.fitWidth : (ent.isMText && ent.boxWidth > 0 ? Math.min(ent.boxWidth, textW) : textW);
    const lineStep = h * (Number(ent.lineSpacing) || 1.2);
    const totalH = h + (Math.max(1, totalLines) - 1) * lineStep;
    const lx0 = ent.hMode === 'center' ? -lineW / 2 : (ent.hMode === 'right' ? -lineW : 0);
    const wLx0 = lx0 + (Math.max(0, charStart) / lineChars) * lineW;
    const wLx1 = lx0 + (Math.min(lineChars, Math.max(charStart + 1, charEnd)) / lineChars) * lineW;
    let wLy0 = -lineIdx * lineStep - h * 0.2, wLy1 = -lineIdx * lineStep + h * 0.98;
    if (ent.vMode === 'top') {
      wLy1 = h * 0.15 - lineIdx * lineStep;
      wLy0 = wLy1 - h * 1.12;
    } else if (ent.vMode === 'middle') {
      const topY = totalH * 0.55;
      wLy1 = topY - lineIdx * lineStep;
      wLy0 = wLy1 - h * 1.1;
    } else if (ent.vMode === 'bottom') {
      wLy0 = (Math.max(1, totalLines) - 1 - lineIdx) * lineStep - h * 0.12;
      wLy1 = wLy0 + h * 1.1;
    }
    const rotDeg = Number(ent.rotation) || 0;
    const ox = Number(ent.x) || 0, oy = Number(ent.y) || 0;
    if (Math.abs(rotDeg) > 1e-3) {
      const rad = (rotDeg * Math.PI) / 180;
      const cosR = Math.cos(rad), sinR = Math.sin(rad);
      const corners = [[wLx0, wLy0], [wLx1, wLy0], [wLx1, wLy1], [wLx0, wLy1]];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let c = 0; c < 4; c++) {
        const wx = ox + corners[c][0] * cosR - corners[c][1] * sinR;
        const wy = oy + corners[c][0] * sinR + corners[c][1] * cosR;
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
      }
      return { minX, minY, maxX, maxY };
    }
    return { minX: ox + wLx0, minY: oy + wLy0, maxX: ox + wLx1, maxY: oy + wLy1 };
  }

  function tokenizeLineWords(lineStr) {
    const out = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(lineStr)) !== null) {
      out.push({ word: m[0], start: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  function computeWordDiffBoxes(entA, entB) {
    if (!entA || !entB) return null;
    const linesA = String(entA.text || '').split(/\r?\n/);
    const linesB = String(entB.text || '').split(/\r?\n/);
    const maxLines = Math.max(linesA.length, linesB.length);
    const boxesA = [];
    const boxesB = [];
    let anyUnchangedWord = false;

    for (let li = 0; li < maxLines; li++) {
      const lnA = linesA[li] || '';
      const lnB = linesB[li] || '';
      if (lnA === lnB) {
        if (lnA.trim().length > 0) anyUnchangedWord = true;
        continue;
      }
      const toksA = tokenizeLineWords(lnA);
      const toksB = tokenizeLineWords(lnB);
      if (toksA.length === 0 && toksB.length > 0) {
        for (const tb of toksB) {
          boxesB.push(computeWordBBoxInText(entB, li, linesB.length, tb.start, tb.end, lnB.length));
        }
        continue;
      }
      if (toksB.length === 0 && toksA.length > 0) {
        for (const ta of toksA) {
          boxesA.push(computeWordBBoxInText(entA, li, linesA.length, ta.start, ta.end, lnA.length));
        }
        continue;
      }
      let pfx = 0;
      while (pfx < toksA.length && pfx < toksB.length && toksA[pfx].word === toksB[pfx].word) {
        pfx++;
      }
      let sfx = 0;
      while (
        sfx < (toksA.length - pfx) &&
        sfx < (toksB.length - pfx) &&
        toksA[toksA.length - 1 - sfx].word === toksB[toksB.length - 1 - sfx].word
      ) {
        sfx++;
      }
      if (pfx > 0 || sfx > 0) anyUnchangedWord = true;
      for (let i = pfx; i < toksA.length - sfx; i++) {
        const t = toksA[i];
        boxesA.push(computeWordBBoxInText(entA, li, linesA.length, t.start, t.end, lnA.length));
      }
      for (let i = pfx; i < toksB.length - sfx; i++) {
        const t = toksB[i];
        boxesB.push(computeWordBBoxInText(entB, li, linesB.length, t.start, t.end, lnB.length));
      }
    }

    if (!anyUnchangedWord) return null;
    return { boxesA, boxesB };
  }

  function extractEntityPrimitiveSegments(ent, parser = null, parentTf = null, depth = 0, tessellateFn = null) {
    if (!ent || depth > 6) return [];
    const tessFn = tessellateFn || tessellateBulgeArcFallback;
    const lyr = ent.layer || '0';
    const mapW = (x, y) => {
      if (!parentTf) return [Number(x) || 0, Number(y) || 0];
      const { bx, by, ix, iy, sx, sy, cosR, sinR } = parentTf;
      const dx = ((Number(x) || 0) - bx) * sx;
      const dy = ((Number(y) || 0) - by) * sy;
      return [ix + dx * cosR - dy * sinR, iy + dx * sinR + dy * cosR];
    };
    const isMirroredOrNonUniformTf = !!(
      parentTf &&
      ((parentTf.sx || 1) < 0 ||
       (parentTf.sy || 1) < 0 ||
       Math.abs(Math.abs(parentTf.sx || 1) - Math.abs(parentTf.sy || 1)) > 1e-4)
    );
    const segs = [];
    if (ent.type === 'LINE') {
      const [x1, y1] = mapW(ent.x1, ent.y1);
      const [x2, y2] = mapW(ent.x2, ent.y2);
      if (Math.hypot(x2 - x1, y2 - y1) > 1e-6) {
        segs.push({ type: 'LINE', x1, y1, x2, y2, layer: lyr });
      }
    } else if (ent.type === 'CIRCLE') {
      const rRaw = Number(ent.r) || 0;
      if (rRaw > 1e-6) {
        if (isMirroredOrNonUniformTf && Math.abs(Math.abs(parentTf.sx || 1) - Math.abs(parentTf.sy || 1)) > 1e-4) {
          const steps = 32;
          let prev = null;
          for (let s = 0; s <= steps; s++) {
            const rad = (s / steps) * Math.PI * 2;
            const cur = mapW((ent.cx || 0) + rRaw * Math.cos(rad), (ent.cy || 0) + rRaw * Math.sin(rad));
            if (prev && Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) > 1e-6) {
              segs.push({ type: 'LINE', x1: prev[0], y1: prev[1], x2: cur[0], y2: cur[1], layer: lyr });
            }
            prev = cur;
          }
        } else {
          const [cx, cy] = mapW(ent.cx, ent.cy);
          const rScale = parentTf ? Math.abs(parentTf.sx || 1) : 1;
          const r = rRaw * rScale;
          segs.push({ type: 'ARC', cx, cy, r, startAngle: 0, endAngle: 360, isFullCircle: true, layer: lyr });
        }
      }
    } else if (ent.type === 'ARC') {
      const rRaw = Number(ent.r) || 0;
      if (rRaw > 1e-6) {
        if (isMirroredOrNonUniformTf) {
          let sAng = Number(ent.startAngle) || 0;
          let eAng = ent.endAngle != null ? Number(ent.endAngle) : 360;
          if (eAng <= sAng) eAng += 360;
          const sweep = eAng - sAng;
          const steps = Math.max(12, Math.min(48, Math.ceil(sweep / 6)));
          let prev = null;
          for (let s = 0; s <= steps; s++) {
            const rad = ((sAng + (sweep * s) / steps) * Math.PI) / 180;
            const cur = mapW((ent.cx || 0) + rRaw * Math.cos(rad), (ent.cy || 0) + rRaw * Math.sin(rad));
            if (prev && Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) > 1e-6) {
              segs.push({ type: 'LINE', x1: prev[0], y1: prev[1], x2: cur[0], y2: cur[1], layer: lyr });
            }
            prev = cur;
          }
        } else {
          const [cx, cy] = mapW(ent.cx, ent.cy);
          const rScale = parentTf ? Math.abs(parentTf.sx || 1) : 1;
          const r = rRaw * rScale;
          const rotOff = parentTf ? (parentTf.rotDeg || 0) : 0;
          segs.push({
            type: 'ARC',
            cx,
            cy,
            r,
            startAngle: (Number(ent.startAngle) || 0) + rotOff,
            endAngle: (ent.endAngle != null ? Number(ent.endAngle) : 360) + rotOff,
            layer: lyr
          });
        }
      }
    } else if ((ent.type === 'LWPOLYLINE' || ent.type === 'SPLINE' || ent.type === 'SOLID') && Array.isArray(ent.points) && ent.points.length >= 2) {
      const pts = ((ent.type === 'SPLINE' || ent.isSpline) && Array.isArray(ent.renderPoints) && ent.renderPoints.length >= 2)
        ? ent.renderPoints
        : ent.points;
      const isClosed = !!(ent.closed || ent.type === 'SOLID');
      const count = isClosed ? pts.length : pts.length - 1;
      for (let i = 0; i < count; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        if (!p1 || !p2) continue;
        const bulge = (pts === ent.points && p1[2]) ? Number(p1[2]) : 0;
        if (Math.abs(bulge) > 1e-5) {
          const arcPts = tessFn(p1[0], p1[1], p2[0], p2[1], bulge, 16);
          let prev = mapW(p1[0], p1[1]);
          for (const ap of arcPts) {
            const cur = mapW(ap[0], ap[1]);
            if (Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) > 1e-6) {
              segs.push({ type: 'LINE', x1: prev[0], y1: prev[1], x2: cur[0], y2: cur[1], layer: lyr });
            }
            prev = cur;
          }
        } else {
          const [x1, y1] = mapW(p1[0], p1[1]);
          const [x2, y2] = mapW(p2[0], p2[1]);
          if (Math.hypot(x2 - x1, y2 - y1) > 1e-6) {
            segs.push({ type: 'LINE', x1, y1, x2, y2, layer: lyr });
          }
        }
      }
    } else if (ent.type === 'HATCH') {
      const loops = Array.isArray(ent.loops) && ent.loops.length ? ent.loops : (Array.isArray(ent.points) ? [ent.points] : []);
      for (const lp of loops) {
        if (!Array.isArray(lp) || lp.length < 2) continue;
        for (let i = 0; i < lp.length; i++) {
          const p1 = lp[i];
          const p2 = lp[(i + 1) % lp.length];
          if (!p1 || !p2) continue;
          const [x1, y1] = mapW(p1[0], p1[1]);
          const [x2, y2] = mapW(p2[0], p2[1]);
          if (Math.hypot(x2 - x1, y2 - y1) > 1e-6) {
            segs.push({ type: 'LINE', x1, y1, x2, y2, layer: lyr });
          }
        }
      }
    } else if (ent.type === 'ELLIPSE') {
      const rx = ent.rx || Math.hypot(ent.mx || 10, ent.my || 0) || 10;
      const ry = ent.ry || (rx * (ent.ratio || 0.5)) || 5;
      const rot = ent.rotation != null ? ent.rotation : Math.atan2(ent.my || 0, ent.mx || 1);
      const sParam = ent.startParam ?? 0;
      let eParam = ent.endParam ?? (Math.PI * 2);
      if (eParam <= sParam) eParam += Math.PI * 2;
      const steps = 32;
      const cosE = Math.cos(rot), sinE = Math.sin(rot);
      let prev = null;
      for (let s = 0; s <= steps; s++) {
        const t = sParam + ((eParam - sParam) * s) / steps;
        const lx = rx * Math.cos(t), ly = ry * Math.sin(t);
        const cur = mapW((ent.cx || 0) + lx * cosE - ly * sinE, (ent.cy || 0) + lx * sinE + ly * cosE);
        if (prev && Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) > 1e-6) {
          segs.push({ type: 'LINE', x1: prev[0], y1: prev[1], x2: cur[0], y2: cur[1], layer: lyr });
        }
        prev = cur;
      }
    } else if (ent.type === 'DIMENSION' && parser) {
      const dimBlk = ent.blockName
        ? (parser._getBlock ? parser._getBlock(ent.blockName) : (parser.blocks && (parser.blocks[ent.blockName] || parser.blocks[String(ent.blockName).toUpperCase()])))
        : null;
      if (dimBlk && Array.isArray(dimBlk.entities) && dimBlk.entities.length > 0) {
        const subFilter = (ent._diffSubIndices instanceof Set && ent._diffSubIndices.size > 0) ? ent._diffSubIndices : null;
        for (let si = 0; si < dimBlk.entities.length; si++) {
          if (subFilter && !subFilter.has(si)) continue;
          const subE = dimBlk.entities[si];
          if (!subE || subE.type === 'POINT') continue;
          const subSegs = extractEntityPrimitiveSegments(subE, parser, parentTf, depth + 1, tessFn);
          for (const ss of subSegs) {
            ss.layer = lyr;
            segs.push(ss);
          }
        }
      } else if (Number.isFinite(ent.x1) && Number.isFinite(ent.x2)) {
        const [x1, y1] = mapW(ent.x1, ent.y1);
        const [x2, y2] = mapW(ent.x2, ent.y2);
        const txCoord = ent.textX != null ? ent.textX : (ent.x != null ? ent.x : (ent.x1 + ent.x2) * 0.5);
        const tyCoord = ent.textY != null ? ent.textY : (ent.y != null ? ent.y : (ent.y1 + ent.y2) * 0.5);
        const [dmx, dmy] = mapW(txCoord, tyCoord);
        const dxSpan = Math.abs(x2 - x1), dySpan = Math.abs(y2 - y1);
        if (dySpan > dxSpan * 1.2 && Math.abs(dmx - (x1 + x2) * 0.5) > 1e-3) {
          if (Math.abs(dmx - x1) > 1e-6) segs.push({ type: 'LINE', x1, y1, x2: dmx, y2: y1, layer: lyr });
          if (Math.abs(dmx - x2) > 1e-6) segs.push({ type: 'LINE', x1: x2, y1: y2, x2: dmx, y2, layer: lyr });
          if (Math.hypot(x2 - x1, y2 - y1) > 1e-6) segs.push({ type: 'LINE', x1: dmx, y1, x2: dmx, y2, layer: lyr });
        } else if (dxSpan >= dySpan * 1.2 && Math.abs(dmy - (y1 + y2) * 0.5) > 1e-3) {
          if (Math.abs(dmy - y1) > 1e-6) segs.push({ type: 'LINE', x1, y1, x2: x1, y2: dmy, layer: lyr });
          if (Math.abs(dmy - y2) > 1e-6) segs.push({ type: 'LINE', x1: x2, y1: y2, x2, y2: dmy, layer: lyr });
          if (Math.hypot(x2 - x1, y2 - y1) > 1e-6) segs.push({ type: 'LINE', x1, y1: dmy, x2, y2: dmy, layer: lyr });
        } else if (Math.hypot(x2 - x1, y2 - y1) > 1e-6) {
          segs.push({ type: 'LINE', x1, y1, x2, y2, layer: lyr });
        }
      }
    } else if (ent.type === 'INSERT' && parser) {
      const blk = parser._getBlock
        ? parser._getBlock(ent.blockName)
        : (parser.blocks && (parser.blocks[ent.blockName] || parser.blocks[String(ent.blockName || '').toUpperCase()]));
      if (blk && Array.isArray(blk.entities) && blk.entities.length > 0) {
        const rotDeg = (Number(ent.rotation) || 0) + (parentTf ? (parentTf.rotDeg || 0) : 0);
        const rad = (rotDeg * Math.PI) / 180;
        const [insWx, insWy] = mapW(ent.x || 0, ent.y || 0);
        const tf = {
          bx: blk.baseX || 0,
          by: blk.baseY || 0,
          ix: insWx,
          iy: insWy,
          sx: (Number(ent.scaleX) || 1) * (parentTf ? (parentTf.sx || 1) : 1),
          sy: (Number(ent.scaleY) || 1) * (parentTf ? (parentTf.sy || 1) : 1),
          cosR: Math.cos(rad),
          sinR: Math.sin(rad),
          rotDeg
        };
        const isDimBlk = /^\*D/i.test(ent.blockName || '');
        const subFilter = (ent._diffSubIndices instanceof Set && ent._diffSubIndices.size > 0) ? ent._diffSubIndices : null;
        for (let si = 0; si < blk.entities.length; si++) {
          if (subFilter && !subFilter.has(si)) continue;
          const subE = blk.entities[si];
          if (!subE || (isDimBlk && subE.type === 'POINT')) continue;
          const subSegs = extractEntityPrimitiveSegments(subE, parser, tf, depth + 1, tessFn);
          for (const ss of subSegs) {
            if (!subE.layer || subE.layer === '0') ss.layer = lyr;
            segs.push(ss);
          }
        }
      }
    }
    return segs;
  }

  /* ==========================================================================
   * [MODULE SECTION: 1D COLLINEAR & ANGULAR INTERVAL CLIPPING]
   * WHAT THIS IS: Clips a LINE or ARC segment against a pool of candidate segments
   *   on the same layer, separating unchanged shared intervals (`common`) from
   *   genuinely added/removed intervals (`diff`).
   * WHY / HOW TO EDIT: Adjust `effTol` or angular tolerance here if you want to
   *   tune how aggressively overlapping polylines or extended lines merge.
   * ========================================================================== */
  function merge1DIntervals(intervals) {
    if (!intervals || !intervals.length) return [];
    intervals.sort((a, b) => a[0] - b[0]);
    const merged = [intervals[0].slice()];
    for (let i = 1; i < intervals.length; i++) {
      const cur = intervals[i];
      const last = merged[merged.length - 1];
      if (cur[0] <= last[1] + 1e-5) {
        if (cur[1] > last[1]) last[1] = cur[1];
      } else {
        merged.push(cur.slice());
      }
    }
    return merged;
  }

  function clipSegmentAgainstPool(seg, candSegs, tol) {
    if (!seg || !candSegs || !candSegs.length) {
      return { diff: [seg], common: [] };
    }
    const effTol = Math.max(1e-4, tol * 1.15);
    if (seg.type === 'LINE') {
      const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
      const len = Math.hypot(dx, dy);
      if (len <= 1e-6) return { diff: [], common: [] };
      const ux = dx / len, uy = dy / len;
      const nx = -uy, ny = ux;
      const minX = Math.min(seg.x1, seg.x2) - effTol;
      const maxX = Math.max(seg.x1, seg.x2) + effTol;
      const minY = Math.min(seg.y1, seg.y2) - effTol;
      const maxY = Math.max(seg.y1, seg.y2) + effTol;
      const covered = [];

      for (let i = 0; i < candSegs.length; i++) {
        const c = candSegs[i];
        if (!c || c.type !== 'LINE') continue;
        if (Math.max(c.x1, c.x2) < minX || Math.min(c.x1, c.x2) > maxX ||
            Math.max(c.y1, c.y2) < minY || Math.min(c.y1, c.y2) > maxY) continue;
        const cdx = c.x2 - c.x1, cdy = c.y2 - c.y1;
        const cLen = Math.hypot(cdx, cdy);
        if (cLen <= 1e-6) continue;
        const dPerp1 = Math.abs((c.x1 - seg.x1) * nx + (c.y1 - seg.y1) * ny);
        const dPerp2 = Math.abs((c.x2 - seg.x1) * nx + (c.y2 - seg.y1) * ny);
        const cross = Math.abs(ux * (cdy / cLen) - uy * (cdx / cLen));
        if (dPerp1 <= effTol && dPerp2 <= effTol && cross <= Math.max(0.02, effTol / Math.max(0.5, Math.min(len, cLen)))) {
          const t1 = (c.x1 - seg.x1) * ux + (c.y1 - seg.y1) * uy;
          const t2 = (c.x2 - seg.x1) * ux + (c.y2 - seg.y1) * uy;
          const a = Math.max(0, Math.min(t1, t2));
          const b = Math.min(len, Math.max(t1, t2));
          if (b - a > 1e-5) covered.push([a, b]);
        }
      }
      if (!covered.length) return { diff: [seg], common: [] };
      const merged = merge1DIntervals(covered);
      const diff = [];
      const common = [];
      let cursor = 0;
      for (const [a, b] of merged) {
        if (a - cursor > effTol) {
          diff.push({
            type: 'LINE',
            x1: seg.x1 + ux * cursor,
            y1: seg.y1 + uy * cursor,
            x2: seg.x1 + ux * a,
            y2: seg.y1 + uy * a,
            layer: seg.layer
          });
        }
        if (b - a > 1e-5) {
          common.push({
            type: 'LINE',
            x1: seg.x1 + ux * a,
            y1: seg.y1 + uy * a,
            x2: seg.x1 + ux * b,
            y2: seg.y1 + uy * b,
            layer: seg.layer
          });
        }
        cursor = Math.max(cursor, b);
      }
      if (len - cursor > effTol) {
        diff.push({
          type: 'LINE',
          x1: seg.x1 + ux * cursor,
          y1: seg.y1 + uy * cursor,
          x2: seg.x1 + ux * len,
          y2: seg.y1 + uy * len,
          layer: seg.layer
        });
      }
      return { diff, common };
    }

    if (seg.type === 'ARC') {
      let sA = Number(seg.startAngle) || 0;
      let eA = seg.endAngle != null ? Number(seg.endAngle) : 360;
      if (seg.isFullCircle) { sA = 0; eA = 360; }
      else {
        sA = ((sA % 360) + 360) % 360;
        eA = ((eA % 360) + 360) % 360;
        if (eA <= sA) eA += 360;
      }
      const covered = [];
      for (let i = 0; i < candSegs.length; i++) {
        const c = candSegs[i];
        if (!c || c.type !== 'ARC') continue;
        if (Math.hypot(c.cx - seg.cx, c.cy - seg.cy) > effTol || Math.abs(c.r - seg.r) > effTol) continue;
        if (c.isFullCircle) {
          covered.push([sA, eA]);
          break;
        }
        let cs = ((Number(c.startAngle) || 0) % 360 + 360) % 360;
        let ce = ((c.endAngle != null ? Number(c.endAngle) : 360) % 360 + 360) % 360;
        if (ce <= cs) ce += 360;
        for (const shift of [-360, 0, 360]) {
          const a = Math.max(sA, cs + shift);
          const b = Math.min(eA, ce + shift);
          if (b - a > 0.25) covered.push([a, b]);
        }
      }
      if (!covered.length) return { diff: [seg], common: [] };
      const merged = merge1DIntervals(covered);
      const angTolDeg = Math.max(0.5, (effTol / Math.max(0.5, seg.r)) * (180 / Math.PI));
      const diff = [];
      const common = [];
      let cursor = sA;
      for (const [a, b] of merged) {
        if (a - cursor > angTolDeg) {
          diff.push({ type: 'ARC', cx: seg.cx, cy: seg.cy, r: seg.r, startAngle: cursor, endAngle: a, layer: seg.layer });
        }
        if (b - a > 0.1) {
          common.push({ type: 'ARC', cx: seg.cx, cy: seg.cy, r: seg.r, startAngle: a, endAngle: b, layer: seg.layer });
        }
        cursor = Math.max(cursor, b);
      }
      if (eA - cursor > angTolDeg) {
        diff.push({ type: 'ARC', cx: seg.cx, cy: seg.cy, r: seg.r, startAngle: cursor, endAngle: eA, layer: seg.layer });
      }
      return { diff, common };
    }

    return { diff: [seg], common: [] };
  }

  function computeSegmentsBBox(segs) {
    if (!Array.isArray(segs) || !segs.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of segs) {
      if (!s) continue;
      if (s.type === 'LINE') {
        if (s.x1 < minX) minX = s.x1; if (s.x1 > maxX) maxX = s.x1;
        if (s.x2 < minX) minX = s.x2; if (s.x2 > maxX) maxX = s.x2;
        if (s.y1 < minY) minY = s.y1; if (s.y1 > maxY) maxY = s.y1;
        if (s.y2 < minY) minY = s.y2; if (s.y2 > maxY) maxY = s.y2;
      } else if (s.type === 'ARC') {
        const bb = computeExactArcBBoxLocal(s.cx, s.cy, s.r, s.startAngle || 0, s.endAngle != null ? s.endAngle : 360);
        if (bb.minX < minX) minX = bb.minX; if (bb.maxX > maxX) maxX = bb.maxX;
        if (bb.minY < minY) minY = bb.minY; if (bb.maxY > maxY) maxY = bb.maxY;
      }
    }
    return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  }

  /* ==========================================================================
   * [MODULE SECTION: STEPPED 7-MIL DRAWING BOX & RED TRIANGLE TEXT INDICATOR]
   * WHAT THIS IS: Generates standard 7-mil small square boxes (`box box box`
   *   along lines, arcs, circles, and polylines) for CAD drawing geometry, and
   *   a single Red Triangle indication (`isTextTriangle: true`, `shape: 'triangle'`)
   *   for any TEXT, MTEXT, or DIMENSION text change so the text itself remains
   *   completely unobstructed while clearly indicating a text difference.
   * WHY / HOW TO EDIT: Modify `boxSizeMils` (default 7 mils) for drawing
   *   geometry or `pushSingleTextTriangle` for text change triangle markers.
   * ========================================================================== */
  function computeSteppedDiffBoxes(ent, mapPtFn, options = {}) {
    if (!ent || typeof mapPtFn !== 'function') return [];
    const boxSizeMils = Number(options.boxSizeMils) > 0 ? Number(options.boxSizeMils) : 7;
    const toMils = Number(options.toMils) > 0 ? Number(options.toMils) : 39.3700787;
    const scalePxPerWorld = Number(options.scale) > 0 ? Number(options.scale) : 1.0;
    const worldBoxSpan = boxSizeMils / toMils;
    const rawBoxPx = worldBoxSpan * scalePxPerWorld;
    const boxPx = Math.max(6, Math.min(10, Math.round(Number.isFinite(rawBoxPx) && rawBoxPx >= 5 ? rawBoxPx : 7)));
    const stepPx = Math.max(4.5, boxPx * 0.9);
    const maxW = options.canvasW || Infinity;
    const maxH = options.canvasH || Infinity;
    const rawBoxes = [];

    const pushBoxAt = (px, py) => {
      if (!Number.isFinite(px) || !Number.isFinite(py)) return;
      const bx = Math.max(0, Math.min(maxW - boxPx, px - boxPx * 0.5));
      const by = Math.max(0, Math.min(maxH - boxPx, py - boxPx * 0.5));
      rawBoxes.push({
        x: +bx.toFixed(2),
        y: +by.toFixed(2),
        w: boxPx,
        h: boxPx,
        mils: boxSizeMils
      });
    };

    const pushSingleTextTriangle = (minX, minY, maxX, maxY) => {
      if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return;
      const [x1, y1] = mapPtFn(minX, minY);
      const [x2, y2] = mapPtFn(maxX, minY);
      const [x3, y3] = mapPtFn(maxX, maxY);
      const [x4, y4] = mapPtFn(minX, maxY);
      if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x3) || !Number.isFinite(y3)) return;
      const left = Math.min(x1, x2, x3, x4);
      const right = Math.max(x1, x2, x3, x4);
      const top = Math.min(y1, y2, y3, y4);
      const bottom = Math.max(y1, y2, y3, y4);
      const triSize = 10;
      const tx = Math.max(0, Math.min(maxW - triSize, left - triSize - 3));
      const ty = Math.max(0, Math.min(maxH - triSize, (top + bottom) * 0.5 - triSize * 0.5));
      rawBoxes.push({
        x: +tx.toFixed(2),
        y: +ty.toFixed(2),
        w: triSize,
        h: triSize,
        textX: +Math.max(0, left).toFixed(2),
        textY: +Math.max(0, top).toFixed(2),
        textW: +Math.max(8, right - left).toFixed(2),
        textH: +Math.max(8, bottom - top).toFixed(2),
        mils: boxSizeMils,
        kind: 'r',
        isTextBox: true,
        isTextTriangle: true,
        shape: 'triangle'
      });
    };

    const stepLineSeg = (x1, y1, x2, y2) => {
      const [px1, py1] = mapPtFn(x1, y1);
      const [px2, py2] = mapPtFn(x2, y2);
      const distPx = Math.hypot(px2 - px1, py2 - py1);
      if (!Number.isFinite(distPx)) return;
      if (distPx <= stepPx * 0.65) {
        pushBoxAt((px1 + px2) * 0.5, (py1 + py2) * 0.5);
        return;
      }
      const count = Math.min(400, Math.max(2, Math.ceil(distPx / stepPx) + 1));
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        pushBoxAt(px1 + (px2 - px1) * t, py1 + (py2 - py1) * t);
      }
    };

    const stepArcSeg = (cx, cy, r, startAngle = 0, endAngle = 360) => {
      let sAng = Number(startAngle) || 0;
      let eAng = endAngle != null ? Number(endAngle) : 360;
      if (eAng <= sAng) eAng += 360;
      const sweep = eAng - sAng;
      const [cPx, cPy] = mapPtFn(cx, cy);
      const [edgePx, edgePy] = mapPtFn(cx + r, cy);
      const rPx = Math.hypot(edgePx - cPx, edgePy - cPy);
      const arcLenPx = Math.max(1, rPx * (sweep * Math.PI / 180));
      const isFull = sweep >= 359.9;
      const count = arcLenPx <= stepPx * 0.75 ? 1 : Math.min(400, Math.max(4, Math.ceil(arcLenPx / stepPx) + (isFull ? 0 : 1)));
      for (let i = 0; i < count; i++) {
        const t = isFull ? (i / count) : (count === 1 ? 0.5 : (i / (count - 1)));
        const rad = ((sAng + sweep * t) * Math.PI) / 180;
        const [ax, ay] = mapPtFn(cx + r * Math.cos(rad), cy + r * Math.sin(rad));
        pushBoxAt(ax, ay);
      }
    };

    const stepRectPerimeter = (minX, minY, maxX, maxY) => {
      if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return;
      const [p1x, p1y] = mapPtFn(minX, minY);
      const [p2x, p2y] = mapPtFn(maxX, maxY);
      const pxSpan = Math.abs(p2x - p1x);
      const pySpan = Math.abs(p2y - p1y);
      if (pxSpan <= boxPx * 1.1 && pySpan <= boxPx * 1.1) {
        pushBoxAt((p1x + p2x) * 0.5, (p1y + p2y) * 0.5);
        return;
      }
      if (pySpan <= boxPx * 0.85) {
        const midY = (minY + maxY) * 0.5;
        stepLineSeg(minX, midY, maxX, midY);
        return;
      }
      if (pxSpan <= boxPx * 0.85) {
        const midX = (minX + maxX) * 0.5;
        stepLineSeg(midX, minY, midX, maxY);
        return;
      }
      stepLineSeg(minX, minY, maxX, minY);
      stepLineSeg(maxX, minY, maxX, maxY);
      stepLineSeg(maxX, maxY, minX, maxY);
      stepLineSeg(minX, maxY, minX, minY);
    };

    const useLocalCoords = !!options.useLocalCoords;
    const drawEnt = useLocalCoords ? ent : (ent._normEnt || ent);
    const diffTextList = useLocalCoords
      ? (Array.isArray(ent._diffTextEntities) && ent._diffTextEntities.length > 0 ? ent._diffTextEntities : null)
      : (Array.isArray(drawEnt._diffTextEntities) && drawEnt._diffTextEntities.length > 0
          ? drawEnt._diffTextEntities
          : (Array.isArray(ent._diffTextEntities) && ent._diffTextEntities.length > 0 ? ent._diffTextEntities : null));
    const hasEmptyDiffWithCommon =
      (Array.isArray(drawEnt._diffSubSegments) && drawEnt._diffSubSegments.length === 0 && Array.isArray(drawEnt._commonSubSegments) && drawEnt._commonSubSegments.length > 0) ||
      (Array.isArray(ent._diffSubSegments) && ent._diffSubSegments.length === 0 && Array.isArray(ent._commonSubSegments) && ent._commonSubSegments.length > 0);
    if (hasEmptyDiffWithCommon && !diffTextList) return [];
    const subSegs = useLocalCoords
      ? ((Array.isArray(ent._diffSubSegments) && ent._diffSubSegments.length > 0) ? ent._diffSubSegments : null)
      : ((Array.isArray(drawEnt._diffSubSegments) && drawEnt._diffSubSegments.length > 0)
          ? drawEnt._diffSubSegments
          : ((Array.isArray(ent._diffSubSegments) && ent._diffSubSegments.length > 0) ? ent._diffSubSegments : null));

    if (subSegs || diffTextList) {
      if (subSegs) {
        for (const seg of subSegs) {
          if (seg.type === 'LINE') stepLineSeg(seg.x1, seg.y1, seg.x2, seg.y2);
          else if (seg.type === 'ARC') stepArcSeg(seg.cx, seg.cy, seg.r, seg.startAngle, seg.endAngle);
        }
      }
      if (diffTextList) {
        // Emit ONLY ONE red triangle indication across the changed text items on this entity
        let tMinX = Infinity, tMinY = Infinity, tMaxX = -Infinity, tMaxY = -Infinity;
        for (const dt of diffTextList) {
          if (!dt) continue;
          const tb = dt._diffBBox || dt._bbox || dt.bbox || computeTextEntityBBoxLocal(dt);
          if (tb && isFinite(tb.minX)) {
            if (tb.minX < tMinX) tMinX = tb.minX;
            if (tb.minY < tMinY) tMinY = tb.minY;
            if (tb.maxX > tMaxX) tMaxX = tb.maxX;
            if (tb.maxY > tMaxY) tMaxY = tb.maxY;
          } else {
            const h = Math.max(0.5, Number(dt.height) || 2.5);
            const w = Math.max(h, String(dt.text || 'X').length * h * 0.6);
            const x0 = (dt.x || 0) - w * 0.5, y0 = (dt.y || 0) - h * 0.2;
            if (x0 < tMinX) tMinX = x0;
            if (y0 < tMinY) tMinY = y0;
            if (x0 + w > tMaxX) tMaxX = x0 + w;
            if (y0 + h * 1.2 > tMaxY) tMaxY = y0 + h * 1.2;
          }
        }
        if (isFinite(tMinX)) {
          pushSingleTextTriangle(tMinX, tMinY, tMaxX, tMaxY);
        }
      }
    } else if (drawEnt.type === 'TEXT' || ent.type === 'TEXT') {
      const eb = (useLocalCoords
        ? (ent._diffBBox || ent._bbox)
        : (drawEnt._diffBBox || ent._diffBBox || drawEnt._bbox || ent._bbox)) || computeTextEntityBBoxLocal(drawEnt);
      if (eb && isFinite(eb.minX)) {
        pushSingleTextTriangle(eb.minX, eb.minY, eb.maxX, eb.maxY);
      } else {
        const h = Math.max(0.5, Number(drawEnt.height) || 2.5);
        const w = Math.max(h, String(drawEnt.text || 'X').length * h * 0.6);
        pushSingleTextTriangle((drawEnt.x || 0), (drawEnt.y || 0) - h * 0.2, (drawEnt.x || 0) + w, (drawEnt.y || 0) + h);
      }
    } else {
      const primSegs = extractEntityPrimitiveSegments(drawEnt, options.parser || null);
      if (primSegs.length > 0) {
        for (const seg of primSegs) {
          if (seg.type === 'LINE') stepLineSeg(seg.x1, seg.y1, seg.x2, seg.y2);
          else if (seg.type === 'ARC') stepArcSeg(seg.cx, seg.cy, seg.r, seg.startAngle, seg.endAngle);
        }
      } else if (drawEnt.type === 'POINT') {
        const [px, py] = mapPtFn(drawEnt.x || 0, drawEnt.y || 0);
        pushBoxAt(px, py);
      } else {
        const eb = drawEnt._diffBBox || ent._diffBBox;
        if (eb && isFinite(eb.minX)) {
          stepRectPerimeter(eb.minX, eb.minY, eb.maxX, eb.maxY);
        } else if (Number.isFinite(drawEnt.x1) && Number.isFinite(drawEnt.x2)) {
          stepLineSeg(drawEnt.x1, drawEnt.y1 || 0, drawEnt.x2, drawEnt.y2 || 0);
        } else if (Number.isFinite(drawEnt.x) && Number.isFinite(drawEnt.y)) {
          const [px, py] = mapPtFn(drawEnt.x, drawEnt.y);
          pushBoxAt(px, py);
        }
      }
    }

    const dedup = [];
    const minDistSq = (boxPx * 0.42) * (boxPx * 0.42);
    for (let i = 0; i < rawBoxes.length; i++) {
      const b = rawBoxes[i];
      let dup = false;
      for (let j = dedup.length - 1; j >= Math.max(0, dedup.length - 16); j--) {
        const d = dedup[j];
        if (b.isTextBox || d.isTextBox) {
          if (b.isTextBox && d.isTextBox &&
              Math.abs(b.x - d.x) < 2 && Math.abs(b.y - d.y) < 2) {
            dup = true;
            break;
          }
          continue;
        }
        const dx = b.x - d.x, dy = b.y - d.y;
        if (dx * dx + dy * dy < minDistSq) {
          dup = true;
          break;
        }
      }
      if (!dup) dedup.push(b);
    }
    return dedup;
  }

  return {
    extractEntityPrimitiveSegments,
    merge1DIntervals,
    clipSegmentAgainstPool,
    computeSegmentsBBox,
    computeTextEntityBBoxLocal,
    computeWordBBoxInText,
    computeWordDiffBoxes,
    computeSteppedDiffBoxes
  };
});
