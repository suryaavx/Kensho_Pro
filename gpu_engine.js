/* ============================================================================
 * [MODULE SECTION: UNIFIED VULKAN / D3D11 / OPENGL WEBGL2 GPU ENGINE (gpu_engine.js)]
 * WHAT THIS IS: Zero-copy hardware-accelerated GPU engine (NVIDIA & AMD)
 *   rendering directly to a live WebGL2/WebGL1 canvas (NO slow drawImage CPU copy):
 *     1. SolidWorks 3D Studio  — Direct hardware Z-buffered 3D mesh, 3-point CAD
 *                                Phong/Blinn shading, polygonOffset (zero Z-fighting),
 *                                persistent VBO cache, and real-time FPS telemetry.
 *     2. Compare & CAM Studio  — Fragment-shader A/B pixel diff pipeline.
 *     3. All 4 Studios         — GPU-composited viewport layer promotion.
 * ============================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KenshoGPU = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let _cachedProbe = null;
  let _swGlCanvas = null;
  let _swGl = null;
  let _swProg = null;
  let _swEdgeProg = null;
  let _diffGlCanvas = null;
  let _diffGl = null;
  let _diffProg = null;
  let _vboCache = { key: '', triCount: 0, edgeVertCount: 0, posBuf: null, normBuf: null, colBuf: null, explodeBuf: null, edgeBuf: null, edgeExplodeBuf: null };
  let _fpsSamples = [];
  let _lastFrameTime = 0;
  let _lastStats = { fps: 60, frameMs: 0.5, triCount: 0, edgeCount: 0, vboCached: false, backend: 'WebGL2 (GPU)', renderer: 'Hardware GPU' };

  const SW_VERT_SRC = `
    attribute vec3 aPos;
    attribute vec3 aNorm;
    attribute vec3 aCol;
    attribute vec3 aExplodeDir;
    uniform mat3 uRot;
    uniform vec3 uCenter;
    uniform float uScale;
    uniform float uRadius;
    uniform float uExplodeFactor;
    uniform vec2 uPan;
    uniform vec2 uViewport;
    varying vec3 vNorm;
    varying vec3 vCol;
    varying vec3 vWorld;
    void main() {
      vec3 explodedPos = aPos + aExplodeDir * uExplodeFactor;
      vWorld = explodedPos;
      vec3 p = uRot * (explodedPos - uCenter);
      float x = (p.x * uScale + uPan.x) / max(1.0, uViewport.x * 0.5);
      float y = (p.y * uScale - uPan.y) / max(1.0, uViewport.y * 0.5);
      float zRange = max(1.0, uRadius * 3.0);
      float z = clamp(-p.z / zRange, -0.96, 0.96);
      gl_Position = vec4(x, y, z, 1.0);
      vNorm = normalize(uRot * aNorm);
      vCol = aCol;
    }
  `;

  const SW_FRAG_SRC = `
    precision highp float;
    uniform int uSectionAxis;
    uniform float uSectionCut;
    uniform float uAlpha;
    uniform int uIsHlr;
    varying vec3 vNorm;
    varying vec3 vCol;
    varying vec3 vWorld;
    void main() {
      if (uSectionAxis == 1 && vWorld.x > uSectionCut) discard;
      if (uSectionAxis == 2 && vWorld.y > uSectionCut) discard;
      if (uSectionAxis == 3 && vWorld.z > uSectionCut) discard;
      if (uIsHlr == 1) {
        gl_FragColor = vec4(vCol, 1.0);
        return;
      }
      vec3 n = normalize(vNorm);
      if (!gl_FrontFacing) n = -n;
      // 3-Point SolidWorks CAD Studio Lighting (Key + Cool Fill + Rim + Specular)
      vec3 keyDir  = normalize(vec3(0.45, 0.62, 0.82));
      vec3 fillDir = normalize(vec3(-0.65, -0.25, 0.55));
      vec3 rimDir  = normalize(vec3(0.0, -0.85, -0.52));
      float keyDiff  = max(dot(n, keyDir), 0.0);
      float fillDiff = max(dot(n, fillDir), 0.0) * 0.34;
      float rimDiff  = max(dot(n, rimDir), 0.0) * 0.18;
      vec3 viewDir = vec3(0.0, 0.0, 1.0);
      vec3 halfVec = normalize(keyDir + viewDir);
      float spec = pow(max(dot(n, halfVec), 0.0), 36.0) * 0.28;
      float hemi = 0.24 + 0.10 * (n.y * 0.5 + 0.5);
      float shade = clamp(hemi + keyDiff * 0.66 + fillDiff + rimDiff, 0.18, 1.18);
      vec3 finalCol = clamp(vCol * shade + vec3(spec), 0.0, 1.0);
      gl_FragColor = vec4(finalCol, uAlpha);
    }
  `;

  const EDGE_VERT_SRC = `
    attribute vec3 aPos;
    attribute vec3 aExplodeDir;
    uniform mat3 uRot;
    uniform vec3 uCenter;
    uniform float uScale;
    uniform float uRadius;
    uniform float uExplodeFactor;
    uniform vec2 uPan;
    uniform vec2 uViewport;
    varying vec3 vWorld;
    void main() {
      vec3 explodedPos = aPos + aExplodeDir * uExplodeFactor;
      vWorld = explodedPos;
      vec3 p = uRot * (explodedPos - uCenter);
      float x = (p.x * uScale + uPan.x) / max(1.0, uViewport.x * 0.5);
      float y = (p.y * uScale - uPan.y) / max(1.0, uViewport.y * 0.5);
      float zRange = max(1.0, uRadius * 3.0);
      float z = clamp(-p.z / zRange - 0.0008, -0.98, 0.98);
      gl_Position = vec4(x, y, z, 1.0);
    }
  `;

  const EDGE_FRAG_SRC = `
    precision highp float;
    uniform int uSectionAxis;
    uniform float uSectionCut;
    uniform vec4 uEdgeCol;
    varying vec3 vWorld;
    void main() {
      if (uSectionAxis == 1 && vWorld.x > uSectionCut) discard;
      if (uSectionAxis == 2 && vWorld.y > uSectionCut) discard;
      if (uSectionAxis == 3 && vWorld.z > uSectionCut) discard;
      gl_FragColor = uEdgeCol;
    }
  `;

  const DIFF_VERT_SRC = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const DIFF_FRAG_SRC = `
    precision mediump float;
    uniform sampler2D uTexA;
    uniform sampler2D uTexB;
    uniform float uThresh;
    uniform vec3 uColA;
    uniform vec3 uColB;
    uniform vec3 uColCommon;
    varying vec2 vUv;
    void main() {
      vec4 a = texture2D(uTexA, vUv);
      vec4 b = texture2D(uTexB, vUv);
      float lumA = dot(a.rgb, vec3(0.299, 0.587, 0.114));
      float lumB = dot(b.rgb, vec3(0.299, 0.587, 0.114));
      float inkA = (1.0 - lumA) * a.a;
      float inkB = (1.0 - lumB) * b.a;
      float d = abs(inkA - inkB);
      if (inkA < uThresh && inkB < uThresh) {
        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
      } else if (d < uThresh) {
        gl_FragColor = vec4(mix(vec3(1.0), uColCommon, max(inkA, inkB)), 1.0);
      } else if (inkA > inkB) {
        gl_FragColor = vec4(mix(vec3(1.0), uColA, clamp(inkA * 1.15, 0.0, 1.0)), 1.0);
      } else {
        gl_FragColor = vec4(mix(vec3(1.0), uColB, clamp(inkB * 1.15, 0.0, 1.0)), 1.0);
      }
    }
  `;

  function compileProgram(gl, vSrc, fSrc) {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vSrc);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) return null;

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fSrc);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    return prog;
  }

  function parseHexToRgb01(hex, fallback) {
    const s = String(hex || '').replace('#', '').trim();
    if (s.length === 6) {
      const n = parseInt(s, 16);
      if (Number.isFinite(n)) return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }
    return fallback || [0.54, 0.63, 0.72];
  }

  function probe() {
    if (_cachedProbe) return _cachedProbe;
    const res = {
      supported: false,
      api: 'Canvas2D',
      renderer: 'Software',
      vendor: '',
      maxTextureSize: 0,
      hardwareAccelerated: false
    };
    if (typeof document === 'undefined') {
      _cachedProbe = res;
      return res;
    }
    try {
      const cv = document.createElement('canvas');
      cv.width = 2; cv.height = 2;
      const attrs = { antialias: true, alpha: true, powerPreference: 'high-performance', desynchronized: true };
      let gl = cv.getContext('webgl2', attrs);
      let api = 'WebGL2 (Vulkan/D3D11)';
      if (!gl) {
        gl = cv.getContext('webgl', attrs) || cv.getContext('experimental-webgl', attrs);
        api = 'WebGL1 (GPU)';
      }
      if (gl) {
        res.supported = true;
        res.api = api;
        res.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          res.renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
          res.vendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '');
        } else {
          res.renderer = String(gl.getParameter(gl.RENDERER) || 'Hardware GPU');
          res.vendor = String(gl.getParameter(gl.VENDOR) || '');
        }
        res.hardwareAccelerated = !/swiftshader|llvmpipe|software|basic render/i.test(res.renderer);
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
    } catch (_) {}
    _cachedProbe = res;
    return res;
  }

  function ensureSolidWorksGL(targetCanvas, w, h) {
    if (typeof document === 'undefined') return null;
    const liveCanvas = targetCanvas || _swGlCanvas || document.createElement('canvas');
    if (_swGlCanvas !== liveCanvas) {
      _swGlCanvas = liveCanvas;
      _swGl = null;
      _swProg = null;
      _swEdgeProg = null;
      _vboCache = { key: '', triCount: 0, edgeVertCount: 0, posBuf: null, normBuf: null, colBuf: null, explodeBuf: null, edgeBuf: null, edgeExplodeBuf: null };
    }
    if (_swGlCanvas.width !== w || _swGlCanvas.height !== h) {
      _swGlCanvas.width = w;
      _swGlCanvas.height = h;
    }
    if (!_swGl) {
      const attrs = {
        antialias: true,
        alpha: true,
        depth: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
        desynchronized: true
      };
      _swGl = _swGlCanvas.getContext('webgl2', attrs) || _swGlCanvas.getContext('webgl', attrs);
      if (!_swGl) return null;
      _swProg = compileProgram(_swGl, SW_VERT_SRC, SW_FRAG_SRC);
      _swEdgeProg = compileProgram(_swGl, EDGE_VERT_SRC, EDGE_FRAG_SRC);
      if (!_swProg || !_swEdgeProg) { _swGl = null; return null; }
    }
    return { gl: _swGl, canvas: _swGlCanvas, prog: _swProg, edgeProg: _swEdgeProg };
  }

  function makeRotMat3(yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    return new Float32Array([
      cy,        sy * cp,  sy * sp,
      -sy,       cy * cp,  cy * sp,
      0,         -sp,      cp
    ]);
  }

  /**
   * Zero-copy Hardware GPU 3D SolidWorks mesh & edge renderer.
   * When opts.glCanvas is provided, renders DIRECTLY to the GPU-composited WebGL canvas
   * (zero drawImage CPU stall -> native 60-240 FPS on NVIDIA & AMD!).
   */
  function renderSolidWorksMeshGL(targetCtx2D, W, H, opts) {
    const directCanvas = opts && opts.glCanvas ? opts.glCanvas : null;
    const ctxObj = ensureSolidWorksGL(directCanvas, W, H);
    if (!ctxObj) return false;
    const { gl, canvas, prog, edgeProg } = ctxObj;
    const { bodies, center, scale, radius, panX, panY, yaw, pitch, displayMode, sectionAxis, sectionCut, overrideTint, alpha } = opts;
    const explodeFactor = Number.isFinite(Number(opts.explodeFactor)) ? Number(opts.explodeFactor) : 0;

    const tStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const isOpaque = alpha == null || alpha >= 0.99;

    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    if (isOpaque) {
      gl.disable(gl.BLEND);
    } else {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    const rotMat = makeRotMat3(yaw, pitch);
    const secCode = sectionAxis === 'x' ? 1 : (sectionAxis === 'y' ? 2 : (sectionAxis === 'z' ? 3 : 0));
    const secVal = Number.isFinite(sectionCut) ? sectionCut : 0;
    const modelRadius = Math.max(1.0, Number(radius) || 100.0);
    const colorRev = opts.colorRev || 0;
    const isLightBg = !!opts.isLightBg;
    const cacheKey = `${bodies.length}:${bodies.map(b => `${b.id}_${b.triangles ? b.triangles.length : 0}_${b.edges ? b.edges.length : 0}_${b.color || ''}`).join('|')}:${overrideTint || ''}:${displayMode}:${colorRev}:${isLightBg ? 1 : 0}`;
    const cacheHit = _vboCache.key === cacheKey && (_vboCache.posBuf != null || _vboCache.edgeBuf != null);

    if (!cacheHit) {
      if (_vboCache.posBuf) { try { gl.deleteBuffer(_vboCache.posBuf); } catch (_) {} }
      if (_vboCache.normBuf) { try { gl.deleteBuffer(_vboCache.normBuf); } catch (_) {} }
      if (_vboCache.colBuf) { try { gl.deleteBuffer(_vboCache.colBuf); } catch (_) {} }
      if (_vboCache.explodeBuf) { try { gl.deleteBuffer(_vboCache.explodeBuf); } catch (_) {} }
      if (_vboCache.edgeBuf) { try { gl.deleteBuffer(_vboCache.edgeBuf); } catch (_) {} }
      if (_vboCache.edgeExplodeBuf) { try { gl.deleteBuffer(_vboCache.edgeExplodeBuf); } catch (_) {} }

      const getBodyExplodeDir = (b) => {
        if (!b || !Array.isArray(b.center) || !Array.isArray(center)) return [0, 0, 0];
        return [
          (b.center[0] || 0) - (center[0] || 0),
          (b.center[1] || 0) - (center[1] || 0),
          (b.center[2] || 0) - (center[2] || 0)
        ];
      };
      const upload = arr => {
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
        return buf;
      };

      let triCount = 0;
      for (const b of bodies) triCount += (b.triangles ? b.triangles.length : 0);
      let posBuf = null, normBuf = null, colBuf = null, explodeBuf = null;
      if (triCount > 0) {
        const posArr = new Float32Array(triCount * 9);
        const normArr = new Float32Array(triCount * 9);
        const colArr = new Float32Array(triCount * 9);
        const expArr = new Float32Array(triCount * 9);
        const hlrBgRgb = isLightBg ? [0.95, 0.96, 0.98] : [0.06, 0.10, 0.16];
        let p = 0;
        for (const b of bodies) {
          const baseRgb = overrideTint ? parseHexToRgb01(overrideTint) : parseHexToRgb01(b.color || '#8fa2b8');
          const eDir = getBodyExplodeDir(b);
          for (const t of (b.triangles || [])) {
            const c = displayMode === 'hlr'
              ? hlrBgRgb
              : (overrideTint ? baseRgb : (t.color ? parseHexToRgb01(t.color, baseRgb) : baseRgb));
            const n = t.n || [0, 0, 1];
            const verts = [t.a, t.b, t.c];
            for (let vi = 0; vi < 3; vi++) {
              posArr[p] = verts[vi][0]; posArr[p + 1] = verts[vi][1]; posArr[p + 2] = verts[vi][2];
              normArr[p] = n[0]; normArr[p + 1] = n[1]; normArr[p + 2] = n[2];
              colArr[p] = c[0]; colArr[p + 1] = c[1]; colArr[p + 2] = c[2];
              expArr[p] = eDir[0]; expArr[p + 1] = eDir[1]; expArr[p + 2] = eDir[2];
              p += 3;
            }
          }
        }
        posBuf = upload(posArr);
        normBuf = upload(normArr);
        colBuf = upload(colArr);
        explodeBuf = upload(expArr);
      }

      const segs = [];
      const edgeExp = [];
      for (const b of bodies) {
        const eDir = getBodyExplodeDir(b);
        for (const ed of (b.edges || [])) {
          const pts = ed.pts || [];
          for (let i = 0; i < pts.length - 1; i++) {
            segs.push(pts[i][0], pts[i][1], pts[i][2], pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]);
            edgeExp.push(eDir[0], eDir[1], eDir[2], eDir[0], eDir[1], eDir[2]);
          }
        }
      }
      let edgeBuf = null, edgeExplodeBuf = null;
      if (segs.length >= 6) {
        edgeBuf = upload(new Float32Array(segs));
        edgeExplodeBuf = upload(new Float32Array(edgeExp));
      }
      _vboCache = { key: cacheKey, triCount, edgeVertCount: segs.length / 3, posBuf, normBuf, colBuf, explodeBuf, edgeBuf, edgeExplodeBuf };
    }

    // 1. Shaded solid triangles pass with hardware PolygonOffset (eliminates all Z-fighting / color overlap!)
    if (displayMode !== 'wireframe' && _vboCache.triCount > 0 && _vboCache.posBuf) {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.5, 1.5);
      gl.useProgram(prog);
      gl.uniformMatrix3fv(gl.getUniformLocation(prog, 'uRot'), false, rotMat);
      gl.uniform3f(gl.getUniformLocation(prog, 'uCenter'), center[0], center[1], center[2]);
      gl.uniform1f(gl.getUniformLocation(prog, 'uScale'), scale);
      gl.uniform1f(gl.getUniformLocation(prog, 'uRadius'), modelRadius);
      gl.uniform1f(gl.getUniformLocation(prog, 'uExplodeFactor'), explodeFactor);
      gl.uniform2f(gl.getUniformLocation(prog, 'uPan'), panX, panY);
      gl.uniform2f(gl.getUniformLocation(prog, 'uViewport'), W, H);
      gl.uniform1i(gl.getUniformLocation(prog, 'uSectionAxis'), secCode);
      gl.uniform1f(gl.getUniformLocation(prog, 'uSectionCut'), secVal);
      gl.uniform1f(gl.getUniformLocation(prog, 'uAlpha'), alpha != null ? alpha : 1.0);
      gl.uniform1i(gl.getUniformLocation(prog, 'uIsHlr'), displayMode === 'hlr' ? 1 : 0);

      const bindCached = (name, buf) => {
        const loc = gl.getAttribLocation(prog, name);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
      };
      bindCached('aPos', _vboCache.posBuf);
      bindCached('aNorm', _vboCache.normBuf);
      bindCached('aCol', _vboCache.colBuf);
      if (_vboCache.explodeBuf) bindCached('aExplodeDir', _vboCache.explodeBuf);
      gl.drawArrays(gl.TRIANGLES, 0, _vboCache.triCount * 3);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // 2. Crisp Z-buffered B-Rep edges / wireframe pass
    if ((displayMode === 'shaded_edges' || displayMode === 'wireframe' || displayMode === 'hlr') && _vboCache.edgeVertCount >= 2 && _vboCache.edgeBuf) {
      gl.useProgram(edgeProg);
      gl.uniformMatrix3fv(gl.getUniformLocation(edgeProg, 'uRot'), false, rotMat);
      gl.uniform3f(gl.getUniformLocation(edgeProg, 'uCenter'), center[0], center[1], center[2]);
      gl.uniform1f(gl.getUniformLocation(edgeProg, 'uScale'), scale);
      gl.uniform1f(gl.getUniformLocation(edgeProg, 'uRadius'), modelRadius);
      gl.uniform1f(gl.getUniformLocation(edgeProg, 'uExplodeFactor'), explodeFactor);
      gl.uniform2f(gl.getUniformLocation(edgeProg, 'uPan'), panX, panY);
      gl.uniform2f(gl.getUniformLocation(edgeProg, 'uViewport'), W, H);
      gl.uniform1i(gl.getUniformLocation(edgeProg, 'uSectionAxis'), secCode);
      gl.uniform1f(gl.getUniformLocation(edgeProg, 'uSectionCut'), secVal);
      const ec = overrideTint
        ? parseHexToRgb01(overrideTint)
        : (displayMode === 'wireframe' ? [0.22, 0.74, 0.97] : (isLightBg ? [0.06, 0.09, 0.16] : [0.85, 0.90, 0.96]));
      gl.uniform4f(gl.getUniformLocation(edgeProg, 'uEdgeCol'), ec[0], ec[1], ec[2], 0.95);
      const loc = gl.getAttribLocation(edgeProg, 'aPos');
      gl.bindBuffer(gl.ARRAY_BUFFER, _vboCache.edgeBuf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
      const expLoc = gl.getAttribLocation(edgeProg, 'aExplodeDir');
      if (expLoc >= 0 && _vboCache.edgeExplodeBuf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, _vboCache.edgeExplodeBuf);
        gl.enableVertexAttribArray(expLoc);
        gl.vertexAttribPointer(expLoc, 3, gl.FLOAT, false, 0, 0);
      }
      gl.drawArrays(gl.LINES, 0, _vboCache.edgeVertCount);
    }

    // Zero-copy when rendering to direct GPU canvas; only copy if caller passed no directCanvas
    if (!directCanvas && targetCtx2D) {
      targetCtx2D.drawImage(canvas, 0, 0);
    }

    const tEnd = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const frameMs = Math.max(0.1, tEnd - tStart);
    if (_lastFrameTime > 0) {
      const dt = tEnd - _lastFrameTime;
      if (dt > 0 && dt < 500) {
        _fpsSamples.push(1000 / dt);
        if (_fpsSamples.length > 24) _fpsSamples.shift();
      }
    }
    _lastFrameTime = tEnd;
    const avgFps = _fpsSamples.length
      ? (_fpsSamples.reduce((s, v) => s + v, 0) / _fpsSamples.length)
      : Math.min(240, 1000 / frameMs);
    const pr = probe();
    _lastStats = {
      fps: Math.min(240, Math.round(avgFps)),
      frameMs: +frameMs.toFixed(1),
      triCount: _vboCache.triCount,
      edgeCount: Math.floor(_vboCache.edgeVertCount / 2),
      vboCached: cacheHit,
      directZeroCopy: !!directCanvas,
      backend: pr.api || 'WebGL2 (GPU)',
      renderer: pr.renderer || 'Hardware GPU'
    };
    return true;
  }

  function diffCanvasesGL(canvasA, canvasB, outCanvas, opts = {}) {
    if (typeof document === 'undefined' || !canvasA || !canvasB || !outCanvas) return false;
    const W = Math.max(canvasA.width || 0, canvasB.width || 0);
    const H = Math.max(canvasA.height || 0, canvasB.height || 0);
    if (!W || !H) return false;
    if (!_diffGlCanvas) _diffGlCanvas = document.createElement('canvas');
    if (_diffGlCanvas.width !== W || _diffGlCanvas.height !== H) {
      _diffGlCanvas.width = W; _diffGlCanvas.height = H;
    }
    if (!_diffGl) {
      _diffGl = _diffGlCanvas.getContext('webgl2', { preserveDrawingBuffer: true, powerPreference: 'high-performance' }) ||
                _diffGlCanvas.getContext('webgl', { preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      if (!_diffGl) return false;
      _diffProg = compileProgram(_diffGl, DIFF_VERT_SRC, DIFF_FRAG_SRC);
      if (!_diffProg) { _diffGl = null; return false; }
    }
    const gl = _diffGl;
    gl.viewport(0, 0, W, H);
    gl.useProgram(_diffProg);

    const makeTex = (unit, src) => {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      return tex;
    };
    const tA = makeTex(0, canvasA);
    const tB = makeTex(1, canvasB);
    gl.uniform1i(gl.getUniformLocation(_diffProg, 'uTexA'), 0);
    gl.uniform1i(gl.getUniformLocation(_diffProg, 'uTexB'), 1);
    gl.uniform1f(gl.getUniformLocation(_diffProg, 'uThresh'), opts.threshold != null ? opts.threshold : 0.08);
    const cA = parseHexToRgb01(opts.colorA || '#e11414');
    const cB = parseHexToRgb01(opts.colorB || '#00a53c');
    const cC = parseHexToRgb01(opts.colorCommon || '#334155');
    gl.uniform3f(gl.getUniformLocation(_diffProg, 'uColA'), cA[0], cA[1], cA[2]);
    gl.uniform3f(gl.getUniformLocation(_diffProg, 'uColB'), cB[0], cB[1], cB[2]);
    gl.uniform3f(gl.getUniformLocation(_diffProg, 'uColCommon'), cC[0], cC[1], cC[2]);

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(_diffProg, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.deleteBuffer(buf);
    gl.deleteTexture(tA);
    gl.deleteTexture(tB);

    outCanvas.width = W;
    outCanvas.height = H;
    const octx = outCanvas.getContext('2d');
    if (octx) octx.drawImage(_diffGlCanvas, 0, 0);
    return true;
  }

  function promoteViewportLayers() {
    if (typeof document === 'undefined') return 0;
    const ids = ['cv', 'ecv', 'eov', 'dxf-st-canvas', 'sw-gl-canvas', 'sw-canvas'];
    let count = 0;
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) {
        el.style.transform = el.style.transform || 'translateZ(0)';
        el.style.willChange = 'transform';
        count++;
      }
    }
    return count;
  }

  function getStats() {
    return { ..._lastStats };
  }

  function invalidateCache() {
    _vboCache.key = '';
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { probe(); promoteViewportLayers(); }, { once: true });
    } else {
      probe();
      promoteViewportLayers();
    }
  }

  return {
    probe,
    getStats,
    invalidateCache,
    renderSolidWorksMeshGL,
    diffCanvasesGL,
    promoteViewportLayers,
    SW_VERT_SRC,
    SW_FRAG_SRC,
    DIFF_FRAG_SRC
  };
});
