/**
 * ============================================================================
 * KENSHO PRO — COMPARE MEMORY GUARD & PRECISION DIFF HELPERS (compare_memory_guard.js)
 * ============================================================================
 * Split companion module for `app.js` and `pro.js` providing deterministic
 * canvas/buffer memory reclamation, custom compare tint color matching, and
 * stepped 7-mil diff box & whole-word text box transformation helpers.
 * ============================================================================
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CompareMemoryGuard = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ==========================================================================
   * [MODULE SECTION: DETERMINISTIC BUFFER & CANVAS RECLAMATION]
   * WHAT THIS IS: Zeroizes and releases ImageData buffers (`A`, `B`, `cls`,
   *   `_ovData`), offscreen crop/supersample canvases, and stale CAD caches.
   * WHY / HOW TO EDIT: Call `releaseAnalysisResult(res)` or `trimCompareMemory(S)`
   *   whenever pages, documents, or views change so large multi-page PDF/DXF/CAM
   *   sessions never leak RAM or GPU canvas backing stores.
   * ========================================================================== */
  function releaseCanvas(cv) {
    if (!cv) return;
    try {
      cv.width = 0;
      cv.height = 0;
    } catch (e) {}
  }

  function releaseRenderPairEntry(entry) {
    if (!entry) return;
    if (entry.a) {
      releaseCanvas(entry.a.c);
      entry.a.text = null;
      entry.a.textItems = null;
    }
    if (entry.b) {
      releaseCanvas(entry.b.c);
      entry.b.text = null;
      entry.b.textItems = null;
    }
  }

  function releaseAnalysisResult(res, zeroFn = null) {
    if (!res) return;
    const z = zeroFn || ((typeof window !== 'undefined' && window.WorkerEngine && window.WorkerEngine.secureZeroSlice) ? window.WorkerEngine.secureZeroSlice : null);
    try {
      if (z) {
        if (res.A && res.A.data) z(res.A.data);
        if (res.B && res.B.data) z(res.B.data);
        if (res.cls) z(res.cls);
        if (res._ovData && res._ovData.data) z(res._ovData.data);
      }
    } catch (e) {}
    res.A = null;
    res.B = null;
    res.cls = null;
    res._ovData = null;
  }

  function releaseCropCanvases(cropMap) {
    if (!cropMap || typeof cropMap !== 'object') return;
    for (const k of Object.keys(cropMap)) {
      releaseCanvas(cropMap[k]);
    }
  }

  /* ==========================================================================
   * [MODULE SECTION: CUSTOM COMPARE TINT DOMINANCE & PIXEL CLASSIFIER]
   * WHAT THIS IS: Classifies whether a changed pixel belongs to Rev A (`1`) or
   *   Rev B (`2`), even when the user has customized `S.tintA` / `S.tintB` to
   *   non-default colors (e.g., Cyan, Amber, Magenta) or swapped slot colors.
   * WHY / HOW TO EDIT: Edit this helper to adjust color-distance thresholds for
   *   vector DXF / CAM anti-aliased stroke classification.
   * ========================================================================== */
  function parseHexRgb(hex, fallback) {
    if (!hex || typeof hex !== 'string' || hex.length < 7) return fallback;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return fallback;
    return [r, g, b];
  }

  function classifyDiffPixelTint(rA, gA, bA, rB, gB, bB, tol, tintAHex, tintBHex) {
    // Fast standard Red (Slot A) vs Green (Slot B) dominance check
    const redDomA = (rA - gA > 90) && (rA - rB > tol);
    const grnDomB = (gB - rB > 70) && (gB - gA > tol);
    if (redDomA && !grnDomB) return 1;
    if (grnDomB && !redDomA) return 2;

    // Custom user tint distance check when tintA or tintB is customized
    if (tintAHex || tintBHex) {
      const tA = parseHexRgb(tintAHex, [239, 68, 68]);
      const tB = parseHexRgb(tintBHex, [34, 197, 94]);
      const distA = Math.abs(rA - tA[0]) + Math.abs(gA - tA[1]) + Math.abs(bA - tA[2]);
      const distB = Math.abs(rB - tB[0]) + Math.abs(gB - tB[1]) + Math.abs(bB - tB[2]);
      const diffBetweenAB = Math.abs(rA - rB) + Math.abs(gA - gB) + Math.abs(bA - bB);
      if (diffBetweenAB > tol * 1.5) {
        if (distA < 95 && distA + 35 < distB) return 1;
        if (distB < 95 && distB + 35 < distA) return 2;
      }
    }
    return 0;
  }

  /* ==========================================================================
   * [MODULE SECTION: STEPPED SUB-BOX ROTATION & MIRROR TRANSFORMER]
   * WHAT THIS IS: Transforms an array of stepped 7-mil `subBoxes` and whole-word
   *   text boxes through cardinal sheet rotations (0°/90°/180°/270°), mirror flips,
   *   and scale ratios.
   * WHY / HOW TO EDIT: Used by CAM & DXF region mergers in `app.js` so stepped
   *   highlight boxes stay locked onto rotated or mirrored traces, lines, and words.
   * ========================================================================== */
  function transformSubBoxes(subBoxes, ratio, degA, unrotW, unrotH, finalW, finalH, mirrorX, mirrorY) {
    if (!Array.isArray(subBoxes) || !subBoxes.length) return [];
    const out = [];
    for (let i = 0; i < subBoxes.length; i++) {
      const sb = subBoxes[i];
      if (!sb) continue;
      const ux = sb.x * ratio;
      const uy = sb.y * ratio;
      const isText = !!(sb.isTextBox || sb.w > 12 || sb.h > 12);
      const uw = isText ? Math.max(6, Math.round(sb.w * ratio)) : Math.max(5, Math.min(10, Math.round(sb.w * ratio)));
      const uh = isText ? Math.max(6, Math.round(sb.h * ratio)) : Math.max(5, Math.min(10, Math.round(sb.h * ratio)));
      let bx = ux, by = uy, bw = uw, bh = uh;
      if (degA === 90) { bx = unrotH - (uy + uh); by = ux; bw = uh; bh = uw; }
      else if (degA === 180) { bx = unrotW - (ux + uw); by = unrotH - (uy + uh); }
      else if (degA === 270) { bx = uy; by = unrotW - (ux + uw); bw = uh; bh = uw; }
      if (mirrorX) bx = finalW - (bx + bw);
      if (mirrorY) by = finalH - (by + bh);
      out.push({
        x: Math.max(0, +(bx).toFixed(2)),
        y: Math.max(0, +(by).toFixed(2)),
        w: bw,
        h: bh,
        kind: sb.kind || 'c',
        isTextBox: isText,
        isTextTriangle: !!sb.isTextTriangle,
        shape: sb.shape || (sb.isTextTriangle ? 'triangle' : 'box')
      });
    }
    return out;
  }

  return {
    releaseCanvas,
    releaseRenderPairEntry,
    releaseAnalysisResult,
    releaseCropCanvases,
    parseHexRgb,
    classifyDiffPixelTint,
    transformSubBoxes
  };
});
