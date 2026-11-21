/* ============================================================================
 * [MODULE SECTION: WEB WORKER PIXEL DIFFING & 8-CONNECTED CLUSTERING (worker.js)]
 * WHAT THIS IS: Background worker thread for per-channel RGB pixel diffing,
 *   ignore-zone masking, and 8-connected flood-fill bounding box extraction.
 * WHY / HOW TO EDIT: Keep `diffPixelsWorker` synchronized with `WorkerClient._syncDiff`
 *   in `worker_engine.js`.
 * ============================================================================ */
/**
 * Kensho Pro 1.1.0 — Web Worker for Heavy Computational Tasks
 * Handles background pixel diffing (with dark/light substrate detection, per-channel RGB tolerance,
 * sub-pixel edge neighbor matching, and ignore-zone masking), connected region labeling, and DXF pre-parsing.
 * Kensho Studio · textportdocx.in
 */
self.onmessage = function (e) {
  const { id, type, payload } = e.data || {};

  try {
    if (type === 'DIFF_PIXELS') {
      const result = diffPixelsWorker(payload || {});
      self.postMessage({ id, status: 'ok', result }, [result.cls.buffer]);
    } else if (type === 'PARSE_DXF') {
      const result = parseDxfSummaryWorker(payload || {});
      self.postMessage({ id, status: 'ok', result });
    } else {
      self.postMessage({ id, status: 'error', error: 'Unknown worker task type: ' + type });
    }
  } catch (err) {
    self.postMessage({ id, status: 'error', error: err.message });
  }
};

function parseDxfSummaryWorker({ text = '' }) {
  const raw = typeof text === 'string' ? text : '';
  const lines = raw.split(/\r?\n/);
  let insunitsCode = 4;
  let layerCount = 0;
  let entityCount = 0;
  let section = '';
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(c)) {
      i--;
      continue;
    }
    const v = lines[i + 1].trim().toUpperCase();
    if (c === 0 && v === 'SECTION' && i + 3 < lines.length) {
      section = lines[i + 3].trim().toUpperCase();
    } else if (c === 0 && v === 'ENDSEC') {
      section = '';
    } else if (section === 'HEADER' && c === 9 && v === '$INSUNITS' && i + 3 < lines.length) {
      insunitsCode = parseInt(lines[i + 3].trim(), 10) || 4;
    } else if (section === 'TABLES' && c === 0 && v === 'LAYER') {
      layerCount++;
    } else if (section === 'ENTITIES' && c === 0 && v !== 'SEQEND' && v !== 'VERTEX') {
      entityCount++;
    }
  }
  return { parsed: true, insunitsCode, layerCount, entityCount };
}

/**
 * Pixel diffing algorithm running in background thread.
 * Supports:
 * 1. Automatic 4-corner sheet background sampling for dark PCB/CAD substrates vs white paper.
 * 2. Per-channel RGB + luminance comparison within `tol`.
 * 3. Sub-pixel `edge` neighbor window (`edge > 0`) to suppress anti-aliasing halos.
 * 4. Optional `ignoreZones` masking (`[{ x, y, w, h }]` scaled by `scale`).
 * 5. Pre-allocated flat `Int32Array` index stack for 8-connected component clustering.
 */
function diffPixelsWorker({
  width,
  height,
  dataA,
  dataB,
  bufA,
  bufB,
  tol,
  threshold,
  minpx = 2,
  edge = 0,
  scale = 1,
  ignoreZones = [],
  tintA = '',
  tintB = ''
}) {
  tol = tol ?? threshold ?? 40;
  dataA = dataA || bufA;
  dataB = dataB || bufB;
  const W = width | 0;
  const H = height | 0;
  const totalPx = Math.max(0, W * H);
  const cls = new Uint8Array(totalPx); // 0=none, 1=A only, 2=B only, 3=common
  if (W <= 0 || H <= 0 || !dataA || !dataB) {
    return { cls, regions: [], countA: 0, countB: 0, countCommon: 0, isDarkSubstrate: false };
  }

  const dA = dataA instanceof Uint8ClampedArray || dataA instanceof Uint8Array ? dataA : new Uint8ClampedArray(dataA);
  const dB = dataB instanceof Uint8ClampedArray || dataB instanceof Uint8Array ? dataB : new Uint8ClampedArray(dataB);

  // Sample 4 sheet corners to detect dark PCB/CAD substrates vs white paper
  const corners = [
    0,
    Math.max(0, (W - 1) * 4),
    Math.max(0, (H - 1) * W * 4),
    Math.max(0, ((H - 1) * W + (W - 1)) * 4)
  ];
  let sumR = 0, sumG = 0, sumB = 0, validCorners = 0;
  for (let cIdx = 0; cIdx < corners.length; cIdx++) {
    const si = corners[cIdx];
    if (si + 2 < dA.length && si + 2 < dB.length) {
      sumR += (dA[si] + dB[si]) * 0.5;
      sumG += (dA[si + 1] + dB[si + 1]) * 0.5;
      sumB += (dA[si + 2] + dB[si + 2]) * 0.5;
      validCorners++;
    }
  }
  const bgR = validCorners ? Math.round(sumR / validCorners) : 255;
  const bgG = validCorners ? Math.round(sumG / validCorners) : 255;
  const bgB = validCorners ? Math.round(sumB / validCorners) : 255;
  const isDarkSubstrate = ((bgR * 299 + bgG * 587 + bgB * 114) / 1000) < 128;

  // Pre-scale ignore zones into flat pixel coordinates
  const sc = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const hasIgn = Array.isArray(ignoreZones) && ignoreZones.length > 0;
  const ignFlat = hasIgn ? new Float64Array(ignoreZones.length * 4) : null;
  if (hasIgn) {
    for (let k = 0; k < ignoreZones.length; k++) {
      const z = ignoreZones[k] || {};
      const base = k * 4;
      ignFlat[base] = (z.x || 0) * sc;
      ignFlat[base + 1] = (z.y || 0) * sc;
      ignFlat[base + 2] = ((z.x || 0) + (z.w || 0)) * sc;
      ignFlat[base + 3] = ((z.y || 0) + (z.h || 0)) * sc;
    }
  }

  let countA = 0;
  let countB = 0;
  let countCommon = 0;
  const edgeRadius = Math.max(0, edge | 0);
  const parseHexRgb = h => {
    if (!h || typeof h !== 'string' || h.length < 7 || h[0] !== '#') return null;
    const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    return (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) ? [r, g, b] : null;
  };
  const rgbTintA = parseHexRgb(tintA);
  const rgbTintB = parseHexRgb(tintB);

  const nearMatch = (src, dst, x, y, i) => {
    if (edgeRadius <= 0) return false;
    const r0 = src[i], g0 = src[i + 1], b0 = src[i + 2];
    const y0 = Math.max(0, y - edgeRadius), y1 = Math.min(H - 1, y + edgeRadius);
    const x0 = Math.max(0, x - edgeRadius), x1 = Math.min(W - 1, x + edgeRadius);
    for (let ny = y0; ny <= y1; ny++) {
      const row = ny * W;
      for (let nx = x0; nx <= x1; nx++) {
        const j = (row + nx) << 2;
        if (
          Math.abs(r0 - dst[j]) <= tol &&
          Math.abs(g0 - dst[j + 1]) <= tol &&
          Math.abs(b0 - dst[j + 2]) <= tol
        ) {
          return true;
        }
      }
    }
    return false;
  };

  for (let y = 0, p = 0, i = 0; y < H; y++) {
    for (let x = 0; x < W; x++, p++, i += 4) {
      const lumA = (dA[i] * 77 + dA[i + 1] * 150 + dA[i + 2] * 29) >> 8;
      const lumB = (dB[i] * 77 + dB[i + 1] * 150 + dB[i + 2] * 29) >> 8;
      const ra = dA[i], ga = dA[i + 1], ba = dA[i + 2], aa = dA[i + 3];
      const rb = dB[i], gb = dB[i + 1], bb = dB[i + 2], ab = dB[i + 3];
      const dr = ra - rb, dg = ga - gb, db = ba - bb;
      const lumDiff = lumA >= lumB ? (lumA - lumB) : (lumB - lumA);

      if (Math.abs(dr) <= tol && Math.abs(dg) <= tol && Math.abs(db) <= tol) {
        const distBgA = Math.abs(ra - bgR) + Math.abs(ga - bgG) + Math.abs(ba - bgB);
        const distBgB = Math.abs(rb - bgR) + Math.abs(gb - bgG) + Math.abs(bb - bgB);
        if ((aa > 30 && distBgA > 24) || (ab > 30 && distBgB > 24)) {
          cls[p] = 3;
          countCommon++;
        }
        continue;
      }

      if (hasIgn) {
        let inIgn = false;
        for (let k = 0; k < ignFlat.length; k += 4) {
          if (x >= ignFlat[k] && x < ignFlat[k + 2] && y >= ignFlat[k + 1] && y < ignFlat[k + 3]) {
            inIgn = true;
            break;
          }
        }
        if (inIgn) continue;
      }

      if (edgeRadius > 0 && nearMatch(dA, dB, x, y, i) && nearMatch(dB, dA, x, y, i)) {
        cls[p] = 3;
        countCommon++;
        continue;
      }

      let tintCls = 0;
      if (rgbTintA || rgbTintB) {
        const dATint = rgbTintA ? (Math.abs(ra - rgbTintA[0]) + Math.abs(ga - rgbTintA[1]) + Math.abs(ba - rgbTintA[2])) : 999;
        const dBTint = rgbTintB ? (Math.abs(rb - rgbTintB[0]) + Math.abs(gb - rgbTintB[1]) + Math.abs(bb - rgbTintB[2])) : 999;
        const crossA = rgbTintA ? (Math.abs(rb - rgbTintA[0]) + Math.abs(gb - rgbTintA[1]) + Math.abs(bb - rgbTintA[2])) : 999;
        const crossB = rgbTintB ? (Math.abs(ra - rgbTintB[0]) + Math.abs(ga - rgbTintB[1]) + Math.abs(ba - rgbTintB[2])) : 999;
        const matchA = dATint < 135 && (crossA - dATint) > tol;
        const matchB = dBTint < 135 && (crossB - dBTint) > tol;
        if (matchA && !matchB) tintCls = 1;
        else if (matchB && !matchA) tintCls = 2;
      }
      const redDomA = (tintCls === 1) || ((ra - ga > 90) && (ra - rb > tol));
      const grnDomB = (tintCls === 2) || ((gb - rb > 70) && (gb - ga > tol));
      let t;
      if (redDomA && !grnDomB) {
        t = 1;
      } else if (grnDomB && !redDomA) {
        t = 2;
      } else if (isDarkSubstrate) {
        const distA = Math.abs(ra - bgR) + Math.abs(ga - bgG) + Math.abs(ba - bgB);
        const distB = Math.abs(rb - bgR) + Math.abs(gb - bgG) + Math.abs(bb - bgB);
        t = distA >= distB ? 1 : 2;
      } else {
        t = (dr + dg + db) <= 0 ? 1 : 2;
      }

      cls[p] = t;
      if (t === 1) countA++;
      else countB++;
    }
  }

  // Label connected components / bounding boxes (8-connected flood fill using flat Int32Array stack)
  const visited = new Uint8Array(totalPx);
  const regions = [];
  const stack = new Int32Array(Math.max(1, totalPx));

  for (let y = 0; y < H; y++) {
    const rowOff = y * W;
    for (let x = 0; x < W; x++) {
      const idx = rowOff + x;
      const type = cls[idx];
      if ((type === 1 || type === 2) && !visited[idx]) {
        let minX = x, maxX = x, minY = y, maxY = y;
        let pixelCount = 0;
        let sp = 0;
        stack[sp++] = idx;
        visited[idx] = 1;

        while (sp > 0) {
          const curIdx = stack[--sp];
          const cy = (curIdx / W) | 0;
          const cx = curIdx - cy * W;
          pixelCount++;

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          for (let dy = -1; dy <= 1; dy++) {
            const ny = cy + dy;
            if (ny < 0 || ny >= H) continue;
            const nRow = ny * W;
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx;
              if (nx < 0 || nx >= W) continue;
              const nIdx = nRow + nx;
              if (!visited[nIdx] && cls[nIdx] === type) {
                visited[nIdx] = 1;
                stack[sp++] = nIdx;
              }
            }
          }
        }

        if (pixelCount >= minpx) {
          regions.push({
            type: type === 1 ? 'removed' : 'added',
            kind: type === 1 ? 'r' : 'a',
            x: minX,
            y: minY,
            w: maxX - minX + 1,
            h: maxY - minY + 1,
            pixelCount
          });
        }
      }
    }
  }

  return {
    cls,
    regions,
    countA,
    countB,
    countCommon,
    isDarkSubstrate,
    bgRGB: [bgR, bgG, bgB]
  };
}
