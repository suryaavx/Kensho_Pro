/* ============================================================================
 * [MODULE SECTION: ENGINEERING METROLOGY, OSNAP, AS9102 FAI & IPC CALCULATORS (measure_engine.js)]
 * WHAT THIS IS: Provides `CalibrationManager`, `OSNAPManager`, `TallyManager`,
 *   `FAIManager`, GD&T frame builders, IPC-2141/2152 calculators, and 4-point homography.
 * WHY / HOW TO EDIT: Add new metrology formulas or CAD/PCB calculators here and
 *   export them on `MeasureEngine`.
 * ============================================================================ */
/**
 * Kensho Pro 2.1 — Engineering Measurement & Markup Suite (OSNAP)
 * Module 5: Precision Calibration, Distance, Cumulative Polyline, Area/Perimeter,
 * Magnetic Object Snap (OSNAP), Tally/BOM Counter, Scalloped Revision Clouds,
 * Leader Callouts, and Dynamic SHA-256 Engineering Stamps.
 * Kensho Studio · textportdocx.in
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MeasureEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Scale Calibration State & Utilities
   */
  class CalibrationManager {
    constructor() {
      this.unit = 'mm';
      this.pxPerUnit = 72 / 25.4; // Default: PDF points per mm
      this.calibrated = false;
      this.points = []; // Calibration reference clicks
    }

    setCalibration(pixelDistance, realWorldDistance, unit = 'mm') {
      if (!pixelDistance || !realWorldDistance || realWorldDistance <= 0) return false;
      this.unit = unit;
      this.pxPerUnit = pixelDistance / realWorldDistance;
      this.calibrated = true;
      try {
        localStorage.setItem('rp_calibration', JSON.stringify({
          unit: this.unit,
          pxPerUnit: this.pxPerUnit,
          calibrated: true
        }));
      } catch (e) {}
      return true;
    }

    loadSaved() {
      try {
        const saved = localStorage.getItem('rp_calibration');
        if (saved) {
          const obj = JSON.parse(saved);
          this.unit = obj.unit || 'mm';
          this.pxPerUnit = obj.pxPerUnit || (72 / 25.4);
          this.calibrated = !!obj.calibrated;
        }
      } catch (e) {}
    }

    toRealDistance(pxDist) {
      return pxDist / this.pxPerUnit;
    }

    toRealArea(pxArea) {
      return pxArea / (this.pxPerUnit * this.pxPerUnit);
    }

    formatDistance(pxDist) {
      const real = this.toRealDistance(pxDist);
      const decimals = (this.unit === 'mils' || this.unit === 'in') ? 3 : 2;
      return `${real.toFixed(decimals)} ${this.unit}`;
    }

    formatArea(pxArea) {
      const real = this.toRealArea(pxArea);
      const unitLabel = this.unit === 'in' ? 'sq in' : (this.unit === 'mils' ? 'sq mils' : `${this.unit}²`);
      return `${real.toFixed(2)} ${unitLabel}`;
    }
  }

  /**
   * Magnetic Object Snap (OSNAP)
   * Snaps cursor to nearest vertices, line endpoints, midpoints, and center points within 8px radius.
   */
  class OSNAPManager {
    constructor(snapRadius = 8) {
      this.snapRadius = snapRadius;
      this.features = []; // List of { type: 'endpoint'|'midpoint'|'center', x, y }
      this.activeSnap = null;
      this._grid = new Map();
      this._gridCellSize = 64;
      this._indexedCount = 0;
    }

    clear() {
      this.features = [];
      this.activeSnap = null;
      this._grid.clear();
      this._indexedCount = 0;
    }

    _indexFeature(f) {
      if (!f || !Number.isFinite(f.x) || !Number.isFinite(f.y)) return;
      const cs = this._gridCellSize;
      const gx = Math.floor(f.x / cs);
      const gy = Math.floor(f.y / cs);
      const key = `${gx},${gy}`;
      let bucket = this._grid.get(key);
      if (!bucket) {
        bucket = [];
        this._grid.set(key, bucket);
      }
      bucket.push(f);
    }

    _ensureGridSynced() {
      if (this._indexedCount > this.features.length) {
        this._grid.clear();
        this._indexedCount = 0;
      }
      while (this._indexedCount < this.features.length) {
        this._indexFeature(this.features[this._indexedCount++]);
      }
    }

    addPoint(x, y, type = 'endpoint') {
      const f = { type, x, y };
      this.features.push(f);
      this._indexFeature(f);
      this._indexedCount = this.features.length;
    }

    addLine(x1, y1, x2, y2) {
      this.addPoint(x1, y1, 'endpoint');
      this.addPoint(x2, y2, 'endpoint');
      this.addPoint((x1 + x2) / 2, (y1 + y2) / 2, 'midpoint');
    }

    addRect(x, y, w, h) {
      this.addLine(x, y, x + w, y);
      this.addLine(x + w, y, x + w, y + h);
      this.addLine(x + w, y + h, x, y + h);
      this.addLine(x, y + h, x, y);
      this.addPoint(x + w / 2, y + h / 2, 'center');
    }

    addCircle(cx, cy, r) {
      this.addPoint(cx, cy, 'center');
      this.addPoint(cx + r, cy, 'endpoint');
      this.addPoint(cx - r, cy, 'endpoint');
      this.addPoint(cx, cy + r, 'endpoint');
      this.addPoint(cx, cy - r, 'endpoint');
    }

    snap(cursorX, cursorY, zoomScale = 1.0) {
      const safeZoom = Math.max(0.05, Math.min(64.0, Number.isFinite(zoomScale) && zoomScale > 0 ? zoomScale : 1.0));
      const threshold = this.snapRadius / safeZoom;
      const threshSq = threshold * threshold;
      let closest = null;
      let minDistSq = threshSq;

      this._ensureGridSynced();
      const cs = this._gridCellSize;
      const cellSpan = Math.ceil(threshold / cs);
      if (this.features.length > 64 && cellSpan <= 4) {
        const gx0 = Math.floor(cursorX / cs);
        const gy0 = Math.floor(cursorY / cs);
        for (let dyCell = -cellSpan; dyCell <= cellSpan; dyCell++) {
          for (let dxCell = -cellSpan; dxCell <= cellSpan; dxCell++) {
            const bucket = this._grid.get(`${gx0 + dxCell},${gy0 + dyCell}`);
            if (!bucket) continue;
            for (let i = 0; i < bucket.length; i++) {
              const f = bucket[i];
              const dx = f.x - cursorX;
              const dy = f.y - cursorY;
              const distSq = dx * dx + dy * dy;
              if (distSq < minDistSq) {
                minDistSq = distSq;
                closest = f;
              }
            }
          }
        }
      } else {
        for (let i = 0; i < this.features.length; i++) {
          const f = this.features[i];
          const dx = f.x - cursorX;
          const dy = f.y - cursorY;
          const distSq = dx * dx + dy * dy;
          if (distSq < minDistSq) {
            minDistSq = distSq;
            closest = f;
          }
        }
      }

      this.activeSnap = closest;
      return closest ? { x: closest.x, y: closest.y, type: closest.type } : { x: cursorX, y: cursorY, type: null };
    }

    drawSnapMarker(ctx, snap, zoomScale = 1.0) {
      if (!snap || !snap.type) return;
      const safeZoom = Math.max(0.05, Math.min(64.0, Number.isFinite(zoomScale) && zoomScale > 0 ? zoomScale : 1.0));
      const size = 6 / safeZoom;
      zoomScale = safeZoom;

      ctx.save();
      ctx.lineWidth = 1.5 / zoomScale;
      ctx.strokeStyle = '#22c55e'; // Vibrant OSNAP green
      ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';

      if (snap.type === 'endpoint') {
        // Green Square for vertex/endpoint
        ctx.beginPath();
        ctx.rect(snap.x - size, snap.y - size, size * 2, size * 2);
        ctx.fill();
        ctx.stroke();
      } else if (snap.type === 'midpoint') {
        // Green Triangle for midpoint
        ctx.beginPath();
        ctx.moveTo(snap.x, snap.y - size);
        ctx.lineTo(snap.x + size, snap.y + size);
        ctx.lineTo(snap.x - size, snap.y + size);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (snap.type === 'center') {
        // Green Circle for center
        ctx.beginPath();
        ctx.arc(snap.x, snap.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /**
   * Tally & BOM Inspection Counter
   */
  class TallyManager {
    constructor() {
      this.items = []; // List of { id, number, x, y, page, label, timestamp }
      this.nextNum = 1;
    }

    clear() {
      this.items = [];
      this.nextNum = 1;
    }

    addItem(x, y, page = 1, label = '') {
      const item = {
        id: 'tally_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        number: this.nextNum++,
        x,
        y,
        page,
        label: label || `Inspection Item #${this.nextNum - 1}`,
        timestamp: new Date().toISOString()
      };
      this.items.push(item);
      return item;
    }

    removeItem(id) {
      const idx = this.items.findIndex(it => it.id === id);
      if (idx !== -1) {
        this.items.splice(idx, 1);
        // Renumber remaining items
        this.items.forEach((it, i) => it.number = i + 1);
        this.nextNum = this.items.length + 1;
      }
    }

    toCSV() {
      const headers = ['Number', 'Page', 'X', 'Y', 'Description', 'Timestamp'];
      const rows = this.items.map(it => [
        it.number,
        it.page,
        it.x.toFixed(2),
        it.y.toFixed(2),
        `"${(it.label || '').replace(/"/g, '""')}"`,
        it.timestamp
      ]);
      return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    }

    drawBadges(ctx, page = 1, zoomScale = 1.0) {
      const safeK = Math.max(0.05, Number.isFinite(zoomScale) && zoomScale > 0 ? zoomScale : 1.0);
      const radius = 11.5 / safeK;
      const fontSize = 11 / safeK;

      for (const it of this.items) {
        if (it.page !== page) continue;

        ctx.save();
        // Badge circle: high contrast gold/orange background
        ctx.beginPath();
        ctx.arc(it.x, it.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.lineWidth = 1.6 / safeK;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Badge text
        ctx.font = `700 ${fontSize}px "Segoe UI", system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#0f172a';
        ctx.fillText(String(it.number), it.x, it.y);
        ctx.restore();
      }
    }
  }

  /**
   * Geometry & Measurement Calculations
   */
  function calcDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function calcPolylineLength(points) {
    if (!points || points.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      total += calcDistance(points[i], points[i + 1]);
    }
    return total;
  }

  function calcPolygonArea(points) {
    if (!points || points.length < 3) return 0;
    let sum = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      sum += (p1.x * p2.y) - (p2.x * p1.y);
    }
    return Math.abs(sum) / 2;
  }

  /**
   * ANSI/ISO Scalloped Revision Clouds
   * Generates outward convex circular scallops along polygon edges with Revision Delta marker.
   */
  function drawRevisionCloud(ctx, points, revText = 'Δ Rev 1', options = {}) {
    if (!points || points.length < 2) return;

    const strokeColor = options.color || '#ef4444';
    const lineWidth = options.lineWidth || 2;
    const scallopSize = options.scallopSize || 14;

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    const n = points.length;

    for (let i = 0; i < n; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segLen = Math.sqrt(dx * dx + dy * dy);
      if (segLen <= 0.1) continue;

      const numScallops = Math.max(1, Math.round(segLen / scallopSize));
      const stepX = dx / numScallops;
      const stepY = dy / numScallops;

      // Normal vector pointing outward in Y-down canvas coordinates (CW polygon)
      const nx = dy / segLen;
      const ny = -dx / segLen;
      const bulge = scallopSize * 0.45;

      let curX = p1.x;
      let curY = p1.y;

      if (i === 0) ctx.moveTo(curX, curY);

      for (let s = 0; s < numScallops; s++) {
        const nextX = curX + stepX;
        const nextY = curY + stepY;
        const midX = (curX + nextX) / 2 + nx * bulge;
        const midY = (curY + nextY) / 2 + ny * bulge;

        ctx.quadraticCurveTo(midX, midY, nextX, nextY);
        curX = nextX;
        curY = nextY;
      }
    }
    ctx.stroke();

    // Draw Revision Delta Triangle if text provided
    if (revText) {
      const firstPt = points[0];
      const triSize = 14;
      const tx = firstPt.x;
      const ty = firstPt.y - 18;

      ctx.beginPath();
      ctx.moveTo(tx, ty - triSize);
      ctx.lineTo(tx + triSize * 0.9, ty + triSize * 0.6);
      ctx.lineTo(tx - triSize * 0.9, ty + triSize * 0.6);
      ctx.closePath();

      ctx.fillStyle = '#fee2e2';
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.font = 'bold 9px sans-serif';
      ctx.fillStyle = strokeColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(revText, tx, ty + 1);
    }

    ctx.restore();
  }

  /**
   * Leader Callouts: Multi-point arrow with text box
   */
  function drawLeaderCallout(ctx, startPt, endPt, text = '', options = {}) {
    const color = options.color || '#ef4444';
    const lineWidth = options.lineWidth || 1.8;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;

    // Leader line
    ctx.beginPath();
    ctx.moveTo(startPt.x, startPt.y);
    ctx.lineTo(endPt.x, endPt.y);
    ctx.stroke();

    // Arrowhead at startPt
    const angle = Math.atan2(endPt.y - startPt.y, endPt.x - startPt.x);
    const headLen = 10;
    ctx.beginPath();
    ctx.moveTo(startPt.x, startPt.y);
    ctx.lineTo(startPt.x + headLen * Math.cos(angle - Math.PI / 6), startPt.y + headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(startPt.x + headLen * Math.cos(angle + Math.PI / 6), startPt.y + headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    // Callout Text Box at endPt
    if (text) {
      const k = Math.max(0.05, Number(options.zoomScale) || 1);
      const padding = 6.5 / k;
      const fs = 12 / k;
      const lineStep = 16 / k;
      ctx.font = `600 ${fs}px "Segoe UI", system-ui, -apple-system, sans-serif`;
      const lines = String(text).split('\n');
      let maxW = 0;
      for (const l of lines) {
        const w = ctx.measureText(l).width;
        if (w > maxW) maxW = w;
      }
      const boxW = maxW + padding * 2;
      const boxH = lines.length * lineStep + padding * 1.5;
      const boxX = endPt.x > startPt.x ? endPt.x : endPt.x - boxW;
      const boxY = endPt.y - boxH / 2;
      const r = 5 / k;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.97)';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(boxX, boxY, boxW, boxH, r);
      else ctx.rect(boxX, boxY, boxW, boxH);
      ctx.fill();
      ctx.lineWidth = Math.max(lineWidth, 1.4 / k);
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      lines.forEach((l, i) => {
        ctx.fillText(l, boxX + padding, boxY + padding * 0.75 + (i + 0.5) * lineStep);
      });
    }

    ctx.restore();
  }

  /**
   * Cryptographic Document Hashing (SHA-256)
   */
  async function computeDocumentSHA256(arrayBuffer) {
    if (!arrayBuffer) return '0000000000000000';
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        return hashHex.slice(0, 16); // High-order 16 hex chars
      }
    } catch (e) {
      console.warn('Crypto subtle unavailable, using fallback hash:', e);
    }
    // Fallback simple checksum
    const u8 = new Uint8Array(arrayBuffer);
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < u8.length; i++) {
      h1 = Math.imul(h1 ^ u8[i], 2654435761);
      h2 = Math.imul(h2 ^ u8[i], 1597334677);
    }
    return ((h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)).toUpperCase().padStart(16, '0');
  }

  /**
   * Dynamic Engineering Stamps
   * APPROVED, REJECTED, REVISED & RESUBMIT, FOR REVIEW ONLY
   */
  const STAMP_TEMPLATES = {
    APPROVED: { title: 'APPROVED', color: '#16a34a', bg: 'rgba(22, 163, 74, 0.08)' },
    REJECTED: { title: 'REJECTED', color: '#dc2626', bg: 'rgba(220, 38, 38, 0.08)' },
    'REVISED & RESUBMIT': { title: 'REVISED & RESUBMIT', color: '#ea580c', bg: 'rgba(234, 88, 12, 0.08)' },
    'FOR REVIEW ONLY': { title: 'FOR REVIEW ONLY', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.08)' }
  };

  function drawEngineeringStamp(ctx, x, y, stampType = 'APPROVED', reviewer = 'Lead Engineer', docHash = 'A3F8E902B1764D5C') {
    const tmpl = STAMP_TEMPLATES[stampType] || STAMP_TEMPLATES.APPROVED;
    const w = 210;
    const h = 76;

    ctx.save();
    ctx.translate(x, y);

    // Double-line border standard for engineering stamps
    ctx.fillStyle = tmpl.bg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = tmpl.color;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(0, 0, w, h);

    ctx.lineWidth = 1;
    ctx.strokeRect(3.5, 3.5, w - 7, h - 7);

    // Title
    ctx.fillStyle = tmpl.color;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(tmpl.title, w / 2, 8);

    // Separator line
    ctx.beginPath();
    ctx.moveTo(8, 29);
    ctx.lineTo(w - 8, 29);
    ctx.stroke();

    // Metadata lines
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10) + ' ' + now.toTimeString().slice(0, 8);

    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`BY: ${reviewer.slice(0, 22)}`, 10, 33);
    ctx.fillText(`DATE: ${dateStr}`, 10, 46);
    ctx.fillText(`SHA256: ${docHash}`, 10, 59);

    ctx.restore();
  }

  function clampZoom(zoom, min = 0.05, max = 64.0) {
    zoom = Math.max(0.05, Math.min(64.0, Number.isFinite(zoom) && zoom > 0 ? zoom : 1.0));
    return Math.max(min, Math.min(max, zoom));
  }

  function clampPan(val, fallback = 0) {
    return Number.isFinite(val) ? Math.max(-1e6, Math.min(1e6, val)) : fallback;
  }

  /**
   * 3-Point Angle Protractor (p1 -> vertex -> p3)
   * Returns { degrees, radians, startAngle, endAngle }
   */
  function calc3PointAngle(p1, vertex, p3) {
    if (!p1 || !vertex || !p3) return { degrees: 0, radians: 0, startAngle: 0, endAngle: 0 };
    const a1 = Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
    const a2 = Math.atan2(p3.y - vertex.y, p3.x - vertex.x);
    let diff = Math.abs(a2 - a1);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    const degrees = Number((diff * 180 / Math.PI).toFixed(2));
    return { degrees, radians: diff, startAngle: a1, endAngle: a2 };
  }

  /**
   * 3-Point Circumscribed Circle / Arc Radius & Diameter Finder
   * Given 3 points along a hole, pad, boss, or curved fillet, returns { cx, cy, r, diameter, valid }
   */
  function calc3PointCircle(p1, p2, p3) {
    if (!p1 || !p2 || !p3) return { cx: 0, cy: 0, r: 0, diameter: 0, valid: false };
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y, x3 = p3.x, y3 = p3.y;
    const D = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    if (Math.abs(D) < 1e-6) return { cx: (x1 + x3) / 2, cy: (y1 + y3) / 2, r: 0, diameter: 0, valid: false };
    const s1 = x1 * x1 + y1 * y1;
    const s2 = x2 * x2 + y2 * y2;
    const s3 = x3 * x3 + y3 * y3;
    const cx = (s1 * (y2 - y3) + s2 * (y3 - y1) + s3 * (y1 - y2)) / D;
    const cy = (s1 * (x3 - x2) + s2 * (x1 - x3) + s3 * (x2 - x1)) / D;
    const r = Math.hypot(x1 - cx, y1 - cy);
    return { cx, cy, r, diameter: r * 2, valid: Number.isFinite(r) && r > 0 };
  }

  /**
   * Engineering Dimension & Tolerance Parser for AS9102 First Article Inspection (FAI)
   * Parses strings like "25.40 ±0.05 mm", "⌀10.00 +0.10/-0.05", "100.0 mil"
   */
  function parseEngineeringDimension(rawText) {
    const raw = String(rawText || '').trim();
    const prefixMatch = raw.match(/^([⌀ØR]|Dia\.?)/i);
    const prefix = prefixMatch ? prefixMatch[1] : '';
    const unitMatch = raw.match(/(?:^|[\s\d])(mm|mils?|in|um|µm|deg|°|k?Ω|µF|pF|nF|V|A)(?=$|[\s,;)/])/i);
    const unit = unitMatch ? unitMatch[1] : 'mm';

    // Bilateral ± tolerance: e.g. "25.40 ± 0.05" or "25.40 +/- 0.05"
    const bi = raw.match(/(-?\d+(?:\.\d+)?)\s*(?:±|\+\/-)\s*(\d+(?:\.\d+)?)/);
    if (bi) {
      const nom = parseFloat(bi[1]);
      const tol = parseFloat(bi[2]);
      return {
        raw, prefix, nominal: nom, tolPlus: tol, tolMinus: tol,
        minLimit: Number((nom - tol).toFixed(4)),
        maxLimit: Number((nom + tol).toFixed(4)),
        unit
      };
    }

    // Asymmetric +tol / -tol: e.g. "12.00 +0.10 / -0.05"
    const asym = raw.match(/(-?\d+(?:\.\d+)?)\s*\+(\d+(?:\.\d+)?)\s*\/\s*-(\d+(?:\.\d+)?)/);
    if (asym) {
      const nom = parseFloat(asym[1]);
      const tp = parseFloat(asym[2]);
      const tm = parseFloat(asym[3]);
      return {
        raw, prefix, nominal: nom, tolPlus: tp, tolMinus: tm,
        minLimit: Number((nom - tm).toFixed(4)),
        maxLimit: Number((nom + tp).toFixed(4)),
        unit
      };
    }

    // Plain numeric nominal (default ISO 2768-m ±0.10 tolerance)
    const numMatch = raw.match(/(-?\d+(?:\.\d+)?)/);
    const nom = numMatch ? parseFloat(numMatch[1]) : 0;
    const defTol = nom > 0 ? 0.1 : 0;
    return {
      raw: raw || '0.00 ±0.10 mm',
      prefix,
      nominal: nom,
      tolPlus: defTol,
      tolMinus: defTol,
      minLimit: Number((nom - defTol).toFixed(4)),
      maxLimit: Number((nom + defTol).toFixed(4)),
      unit
    };
  }

  /**
   * FAIManager: AS9102 Form 3 First Article Inspection Ballooning & Schedule Manager
   */
  class FAIManager {
    constructor() {
      this.items = [];
      this.nextBalloon = 1;
    }

    addBalloon(x, y, page = 1, rawRequirement = '25.40 ±0.05 mm', zone = 'B2', actualMeasured = '') {
      const parsed = parseEngineeringDimension(rawRequirement);
      const num = this.nextBalloon++;
      const actualVal = actualMeasured !== '' && !isNaN(parseFloat(actualMeasured)) ? parseFloat(actualMeasured) : null;
      const status = actualVal != null
        ? (actualVal >= parsed.minLimit && actualVal <= parsed.maxLimit ? 'PASS' : 'FAIL')
        : 'PENDING';
      const item = {
        charNo: num,
        page,
        zone: zone || 'A1',
        x: Math.round(x),
        y: Math.round(y),
        requirement: parsed.raw,
        nominal: parsed.nominal,
        tolPlus: parsed.tolPlus,
        tolMinus: parsed.tolMinus,
        minLimit: parsed.minLimit,
        maxLimit: parsed.maxLimit,
        unit: parsed.unit,
        actual: actualMeasured,
        status
      };
      this.items.push(item);
      return item;
    }

    clear() {
      this.items = [];
      this.nextBalloon = 1;
    }

    toAS9102CSV() {
      const header = 'Char_No,Page,Ref_Zone,X,Y,Requirement_Text,Nominal,Tol_Plus,Tol_Minus,Min_Limit,Max_Limit,Units,Actual_Measured,Disposition';
      const rows = this.items.map(it =>
        `${it.charNo},${it.page},"${it.zone}",${it.x},${it.y},"${String(it.requirement).replace(/"/g, '""')}",${it.nominal},${it.tolPlus},${it.tolMinus},${it.minLimit},${it.maxLimit},${it.unit},"${it.actual || ''}","${it.status}"`
      );
      return [header, ...rows].join('\n');
    }
  }

  /**
   * ASME Y14.5 / ISO 1101 GD&T Feature Control Frame Definitions
   */
  const GDT_SYMBOLS = [
    { code: 'position', sym: '⌖', name: 'Position (⌖)' },
    { code: 'flatness', sym: '⏥', name: 'Flatness (⏥)' },
    { code: 'perpendicularity', sym: '⊥', name: 'Perpendicularity (⊥)' },
    { code: 'parallelism', sym: '∥', name: 'Parallelism (∥)' },
    { code: 'concentricity', sym: '◎', name: 'Concentricity (◎)' },
    { code: 'circularity', sym: '○', name: 'Circularity / Roundness (○)' },
    { code: 'cylindricity', sym: '⌭', name: 'Cylindricity (⌭)' },
    { code: 'profile_surface', sym: '⌓', name: 'Profile of a Surface (⌓)' },
    { code: 'profile_line', sym: '⌒', name: 'Profile of a Line (⌒)' },
    { code: 'angularity', sym: '∠', name: 'Angularity (∠)' },
    { code: 'runout_circular', sym: '↗', name: 'Circular Runout (↗)' },
    { code: 'runout_total', sym: '⌰', name: 'Total Runout (⌰)' },
    { code: 'straightness', sym: '―', name: 'Straightness (―)' },
    { code: 'symmetry', sym: '≡', name: 'Symmetry (≡)' }
  ];

  function buildGDTControlFrameCompartments(spec = {}) {
    const sym = spec.symbol || '⌖';
    const prefix = spec.diaPrefix != null ? spec.diaPrefix : '⌀';
    const tol = spec.tolerance || '0.05';
    const mod = spec.modifier != null ? spec.modifier : 'Ⓜ';
    const comps = [sym, `${prefix}${tol}${mod ? ' ' + mod : ''}`.trim()];
    if (spec.datumA) comps.push(String(spec.datumA).trim());
    if (spec.datumB) comps.push(String(spec.datumB).trim());
    if (spec.datumC) comps.push(String(spec.datumC).trim());
    return comps;
  }

  /**
   * IPC-2141 Microstrip & Stripline Characteristic Impedance Calculator
   * & IPC-2152 PCB Trace Current / Temperature Rise Calculator
   */
  function calcIPC2141Impedance({ mode = 'microstrip', traceWidthMils = 6.0, traceThicknessOz = 1.0, dielectricHeightMils = 4.5, er = 4.2 } = {}) {
    const w = Math.max(0.5, Number(traceWidthMils) || 6.0);
    const t = Math.max(0.1, (Number(traceThicknessOz) || 1.0) * 1.37); // 1 oz copper ≈ 1.37 mils
    const h = Math.max(0.5, Number(dielectricHeightMils) || 4.5);
    const eps = Math.max(1.0, Number(er) || 4.2);

    let z0, tpdPsPerIn;
    if (mode === 'stripline') {
      // Symmetric stripline IPC-2141 formula (b = 2*h + t)
      const b = 2 * h + t;
      z0 = (60 / Math.sqrt(eps)) * Math.log((4 * b) / (0.67 * Math.PI * (0.8 * w + t)));
      tpdPsPerIn = 84.72 * Math.sqrt(eps);
    } else {
      // Surface microstrip IPC-2141 formula
      z0 = (87 / Math.sqrt(eps + 1.41)) * Math.log((5.98 * h) / (0.8 * w + t));
      tpdPsPerIn = 84.72 * Math.sqrt(0.475 * eps + 0.67);
    }
    return {
      z0Ohms: Number(Math.max(5, z0).toFixed(2)),
      delayPsPerIn: Number(tpdPsPerIn.toFixed(1)),
      traceThicknessMils: Number(t.toFixed(2))
    };
  }

  function calcIPC2152Current({ traceWidthMils = 10.0, traceThicknessOz = 1.0, tempRiseC = 20, isInternal = false, lengthInches = 1.0 } = {}) {
    const w = Math.max(0.5, Number(traceWidthMils) || 10.0);
    const tMils = Math.max(0.1, (Number(traceThicknessOz) || 1.0) * 1.37);
    const dT = Math.max(1, Number(tempRiseC) || 20);
    const areaSqMils = w * tMils;
    const k = isInternal ? 0.024 : 0.048;
    const maxCurrentAmps = k * Math.pow(dT, 0.44) * Math.pow(areaSqMils, 0.725);
    // Copper resistivity ~ 0.6787 micro-ohm-inch at 25C
    const resistanceMilliohms = (0.6787 / areaSqMils) * (Number(lengthInches) || 1.0) * 1000;
    return {
      maxCurrentAmps: Number(maxCurrentAmps.toFixed(2)),
      areaSqMils: Number(areaSqMils.toFixed(1)),
      resistanceMilliohms: Number(resistanceMilliohms.toFixed(2))
    };
  }

  /**
   * 4-Corner Perspective Projective Homography Solver (8-DOF Direct Linear Transform)
   * Maps 4 source points [{x,y}...] to 4 destination points [{x,y}...]
   */
  function computeHomography4Pt(srcPts, dstPts) {
    if (!srcPts || !dstPts || srcPts.length < 4 || dstPts.length < 4) {
      return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    }
    const A = [];
    const B = [];
    for (let i = 0; i < 4; i++) {
      const x = srcPts[i].x, y = srcPts[i].y;
      const u = dstPts[i].x, v = dstPts[i].y;
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
      B.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
      B.push(v);
    }
    // Gaussian elimination with partial pivoting on 8x8 system
    const n = 8;
    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
      }
      [A[i], A[maxRow]] = [A[maxRow], A[i]];
      [B[i], B[maxRow]] = [B[maxRow], B[i]];
      const piv = A[i][i];
      if (Math.abs(piv) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
      for (let j = i; j < n; j++) A[i][j] /= piv;
      B[i] /= piv;
      for (let k = 0; k < n; k++) {
        if (k === i) continue;
        const factor = A[k][i];
        for (let j = i; j < n; j++) A[k][j] -= factor * A[i][j];
        B[k] -= factor * B[i];
      }
    }
    return [B[0], B[1], B[2], B[3], B[4], B[5], B[6], B[7], 1];
  }

  function applyHomographyPt(H, x, y) {
    if (!H || H.length < 9) return { x, y };
    const denom = H[6] * x + H[7] * y + H[8];
    if (Math.abs(denom) < 1e-9) return { x, y };
    return {
      x: (H[0] * x + H[1] * y + H[2]) / denom,
      y: (H[3] * x + H[4] * y + H[5]) / denom
    };
  }

  return {
    CalibrationManager,
    clampZoom,
    clampPan,
    OSNAPManager,
    TallyManager,
    calcDistance,
    calcPolylineLength,
    calcPolygonArea,
    drawRevisionCloud,
    drawLeaderCallout,
    computeDocumentSHA256,
    drawEngineeringStamp,
    STAMP_TEMPLATES,
    calc3PointAngle,
    calc3PointCircle,
    parseEngineeringDimension,
    FAIManager,
    GDT_SYMBOLS,
    buildGDTControlFrameCompartments,
    calcIPC2141Impedance,
    calcIPC2152Current,
    computeHomography4Pt,
    applyHomographyPt
  };
});
