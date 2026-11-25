/**
 * Kensho Pro 1.1.0 — Deterministic Memory Budget Engine, Pinned Generational LRU Cache,
 * 512x512 Slab Buffer Pool, Virtual Viewport Tile Pyramid & Web Worker Bridge
 *
 * Unifies the deterministic memory management architecture (`MemoryBudgetManager`,
 * `ZeroizingBuffer`, `SlabBufferPool`, `BoundedLruCache`, `VirtualTileGrid`) with
 * `WorkerClient` and `VirtualTileManager`.
 * Kensho Studio · textportdocx.in
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WorkerEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Overwrites a TypedArray or Array with zeroes so sensitive CAD/PCB pixels or
   * redacted regions are scrubbed from memory before release.
   */
  const RUST_WASM_MEMORY_B64 = 'AGFzbQEAAAABEwRgAABgAX8Bf2ACf38Bf2AAAX8DCAcAAQICAwMCBQUBARCAIAYRA38BQYAgC38BQQALfwFBAAsHfggGbWVtb3J5AgAOcnVzdF9tZW1fcmVzZXQAAA5ydXN0X21lbV9hbGxvYwABDXJ1c3RfbWVtX2ZyZWUAAg1ydXN0X21lbV96ZXJvAAMScnVzdF9tZW1fYWxsb2NhdGVkAAQNcnVzdF9tZW1fcGVhawAFCnJ1c3RfY3JjMzIABgqYAgcLAEGAICQAQQAkAQtPAQR/IABBD2pBcHEhASMAIQIgAiABaiIDPwBBEHQiBE8EQCADIARrQf//A2pBEHZAABoLIAMkACMBIAFqIgMkASADIwJKBEAgAyQCCyACCzUBAX8gAEEAIAH8CwAjASABQQ9qQXBxayICQQBIBEBBACECCyACJAEgAkUEQEGAICQACyABCw0AIABBACAB/AsAIAELBAAjAQsEACMCC2wBA39BfyECQQAhAwJAA0AgAyABTw0BIAIgACADai0AAHMhAkEAIQQCQANAIARBCE8NASACQQFxBEAgAkEBdkGghuLtfnMhAgUgAkEBdiECCyAEQQFqIQQMAAsLIANBAWohAwwACwsgAkF/cws=';

  function decodeBase64ToU8(b64) {
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      return new Uint8Array(Buffer.from(b64, 'base64'));
    }
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(0);
  }

  /**
   * RustWasmMemoryArena: Compiled Rust (`wasm32-unknown-unknown`) linear memory arena
   * providing 16-byte aligned bump allocation, deterministic `memory.fill(0)` zeroization,
   * automatic page growth, and native WASM IEEE 802.3 CRC-32 computation.
   */
  class RustWasmMemoryArena {
    constructor() {
      this.exports = null;
      this.memory = null;
      this.isNativeWasm = false;
      this._initSync();
    }

    _initSync() {
      try {
        if (typeof WebAssembly !== 'undefined') {
          const bytes = decodeBase64ToU8(RUST_WASM_MEMORY_B64);
          if (bytes.length > 0) {
            const mod = new WebAssembly.Module(bytes);
            const inst = new WebAssembly.Instance(mod, {});
            this.exports = inst.exports;
            this.memory = inst.exports.memory;
            this.isNativeWasm = true;
          }
        }
      } catch (e) {
        this.isNativeWasm = false;
      }
    }

    alloc(byteLen) {
      const sz = Math.max(16, byteLen | 0);
      if (this.isNativeWasm && this.exports) {
        return this.exports.rust_mem_alloc(sz) >>> 0;
      }
      return 0;
    }

    allocSliceU8(byteLen) {
      const sz = Math.max(0, byteLen | 0);
      if (this.isNativeWasm && this.exports && sz > 0) {
        const ptr = this.exports.rust_mem_alloc(sz) >>> 0;
        if (ptr > 0 && this.memory && this.memory.buffer && ptr + sz <= this.memory.buffer.byteLength) {
          const arena = this;
          return {
            ptr,
            byteLen: sz,
            arena,
            get slice() {
              if (!arena.memory || !arena.memory.buffer || ptr + sz > arena.memory.buffer.byteLength) {
                return new Uint8Array(0);
              }
              return new Uint8Array(arena.memory.buffer, ptr, sz);
            }
          };
        }
      }
      return { ptr: 0, byteLen: sz, slice: new Uint8Array(sz), arena: null };
    }

    free(ptr, byteLen) {
      if (this.isNativeWasm && this.exports && ptr > 0 && byteLen > 0) {
        return this.exports.rust_mem_free(ptr >>> 0, byteLen | 0) >>> 0;
      }
      return 0;
    }

    zero(ptr, byteLen) {
      if (this.isNativeWasm && this.exports && ptr > 0 && byteLen > 0) {
        return this.exports.rust_mem_zero(ptr >>> 0, byteLen | 0) >>> 0;
      }
      return 0;
    }

    reset() {
      if (this.isNativeWasm && this.exports) {
        this.exports.rust_mem_reset();
      }
    }

    allocatedBytes() {
      return (this.isNativeWasm && this.exports) ? (this.exports.rust_mem_allocated() >>> 0) : 0;
    }

    peakBytes() {
      return (this.isNativeWasm && this.exports) ? (this.exports.rust_mem_peak() >>> 0) : 0;
    }

    crc32(data) {
      const u8 = data instanceof Uint8Array ? data : new Uint8Array(data || []);
      if (this.isNativeWasm && this.exports && u8.length > 0 && u8.length <= 4 * 1024 * 1024) {
        const ptr = this.exports.rust_mem_alloc(u8.length) >>> 0;
        if (this.memory && this.memory.buffer && ptr + u8.length <= this.memory.buffer.byteLength) {
          const view = new Uint8Array(this.memory.buffer, ptr, u8.length);
          view.set(u8);
          const crc = this.exports.rust_crc32(ptr, u8.length) >>> 0;
          this.exports.rust_mem_free(ptr, u8.length);
          return crc;
        }
      }
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < u8.length; i++) {
        crc ^= u8[i];
        for (let b = 0; b < 8; b++) {
          crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1);
        }
      }
      return (~crc) >>> 0;
    }
  }

  const globalRustWasmArena = new RustWasmMemoryArena();

  function secureZeroSlice(slice) {
    if (!slice) return 0;
    try {
      if (typeof slice.fill === 'function') {
        slice.fill(0);
        return slice.byteLength || slice.length || 0;
      }
      if (slice.data && typeof slice.data.fill === 'function') {
        slice.data.fill(0);
        return slice.data.byteLength || slice.data.length || 0;
      }
    } catch (e) {}
    return 0;
  }

  /**
   * HardwareProfile: Governs rasterization ceilings and memory budgets based on system RAM.
   * - LowSpec (<= 4 GB RAM): max 6144 px dimension, 25 MP area, 256 MB cache budget.
   * - HighSpec (> 4 GB RAM): max 9000 px dimension, 45 MP area, 768 MB cache budget.
   */
  class HardwareProfile {
    constructor(tier = 'HighSpec', custom = null) {
      this.tier = tier;
      if (tier === 'LowSpec') {
        this.maxDimPx = 6144;
        this.maxAreaPx = 25000000;
        this.maxBudgetBytes = 256 * 1024 * 1024;
      } else if (tier === 'Custom' && custom) {
        this.maxDimPx = custom.maxDimPx || 9000;
        this.maxAreaPx = custom.maxAreaPx || 45000000;
        this.maxBudgetBytes = custom.maxBudgetBytes || (512 * 1024 * 1024);
      } else {
        this.tier = 'HighSpec';
        this.maxDimPx = 9000;
        this.maxAreaPx = 45000000;
        this.maxBudgetBytes = 768 * 1024 * 1024;
      }
    }

    static fromSystemRamGb(ramGb) {
      const gb = Number(ramGb) || (typeof navigator !== 'undefined' && Number(navigator.deviceMemory)) || 8;
      return gb <= 4 ? new HardwareProfile('LowSpec') : new HardwareProfile('HighSpec');
    }

    clampRasterScale(widthPt, heightPt, targetDpi = 300) {
      const w = Math.max(1.0, Number(widthPt) || 1.0);
      const h = Math.max(1.0, Number(heightPt) || 1.0);
      const dpiClamped = Math.max(72.0, Math.min(1200.0, Number(targetDpi) || 300.0));
      const dpiScale = dpiClamped / 72.0;
      const dimScale = this.maxDimPx / Math.max(w, h);
      const areaScale = Math.sqrt(this.maxAreaPx / (w * h));
      return Math.max(0.1, Math.min(32.0, dpiScale, dimScale, areaScale));
    }
  }

  const MemoryPressure = Object.freeze({
    Optimal: 'Optimal',
    Moderate: 'Moderate',
    HighLoad: 'High Load'
  });

  /**
   * ZeroizingBuffer: Deterministic buffer wrapper that tracks exact byte capacity in
   * `MemoryBudgetManager` and zeroes its backing store on `zeroAndRelease()`.
   */
  class ZeroizingBuffer {
    constructor(typedArray, manager = null) {
      this.data = typedArray;
      this.trackedBytes = typedArray ? (typedArray.byteLength || typedArray.length || 0) : 0;
      this.manager = manager || null;
      if (this.manager && this.trackedBytes > 0) {
        this.manager.recordAlloc(this.trackedBytes);
      }
    }

    static newZeroed(len, manager = null, ArrayCtor = Uint8Array) {
      const arr = new ArrayCtor(Math.max(0, len | 0));
      return new ZeroizingBuffer(arr, manager);
    }

    static fromArray(arr, manager = null) {
      const copy = arr instanceof Uint8Array || arr instanceof Uint32Array || arr instanceof Uint8ClampedArray
        ? new arr.constructor(arr)
        : new Uint8Array(arr || []);
      return new ZeroizingBuffer(copy, manager);
    }

    asSlice() {
      return this.data;
    }

    asMutSlice() {
      return this.data;
    }

    byteCapacity() {
      return this.trackedBytes;
    }

    byteSize() {
      return this.trackedBytes;
    }

    get length() {
      return this.data ? this.data.length : 0;
    }

    zeroAndRelease() {
      if (this.data) {
        secureZeroSlice(this.data);
        this.data = new Uint8Array(0);
      }
      if (this.trackedBytes > 0) {
        if (this.manager) {
          this.manager.recordDealloc(this.trackedBytes);
        }
        this.trackedBytes = 0;
      }
    }
  }

  /**
   * SlabBufferPool: Bounded pool for fixed-size 512x512 RGBA tile buffers (1,048,576 bytes)
   * that recycles allocations during rapid pan/zoom to prevent heap fragmentation.
   */
  class SlabBufferPool {
    constructor(slabByteLen = 512 * 512 * 4, maxSlabs = 32) {
      this.slabByteLen = Math.max(64, slabByteLen | 0);
      this.maxSlabs = Math.max(1, maxSlabs | 0);
      this.freeList = [];
    }

    acquire() {
      if (this.freeList.length > 0) {
        const buf = this.freeList.pop();
        if (buf.byteLength === this.slabByteLen) return buf;
      }
      return new Uint8ClampedArray(this.slabByteLen);
    }

    release(buf) {
      if (!buf || buf.byteLength < this.slabByteLen) return false;
      secureZeroSlice(buf);
      if (this.freeList.length < this.maxSlabs) {
        this.freeList.push(buf);
        return true;
      }
      return false;
    }

    clear() {
      const count = this.freeList.length;
      for (let i = 0; i < count; i++) {
        secureZeroSlice(this.freeList[i]);
      }
      this.freeList.length = 0;
      return count;
    }

    len() {
      return this.freeList.length;
    }

    isEmpty() {
      return this.freeList.length === 0;
    }

    totalPooledBytes() {
      let sum = 0;
      for (let i = 0; i < this.freeList.length; i++) {
        sum += this.freeList[i].byteLength || 0;
      }
      return sum;
    }
  }

  /**
   * MemoryBudgetManager: Real-time byte budget tracker & slab pool coordinator.
   */
  /* ============================================================================
   * [MODULE SECTION: DETERMINISTIC MEMORY BUDGET & PINNED LRU CACHE]
   * WHAT THIS IS: Enforces hardware-aware RAM budgets across multi-page comparison
   *   sessions and prevents active-page eviction via `BoundedLruCache`.
   * WHY / HOW TO EDIT: Adjust `budgetBytes()` or `BoundedLruCache` thresholds here
   *   when tuning memory limits for low-spec vs workstation hardware.
   * ============================================================================ */
  class MemoryBudgetManager {
    constructor(profile = null) {
      this._profile = profile instanceof HardwareProfile
        ? profile
        : HardwareProfile.fromSystemRamGb();
      this._allocatedBytes = 0;
      this._peakBytes = 0;
      this._budgetBytes = this._profile.maxBudgetBytes;
      this._totalAllocs = 0;
      this._totalDeallocs = 0;
      this.tileSlabPool = new SlabBufferPool(512 * 512 * 4, 32);
      this.rustArena = globalRustWasmArena;
    }

    setProfile(profile) {
      const p = profile instanceof HardwareProfile
        ? profile
        : new HardwareProfile(profile === 'LowSpec' || profile === 'perf' ? 'LowSpec' : 'HighSpec');
      this._profile = p;
      this._budgetBytes = p.maxBudgetBytes;
    }

    profile() {
      return this._profile;
    }

    recordAlloc(bytes) {
      const b = Math.max(0, Number(bytes) || 0);
      if (b === 0) return;
      this._allocatedBytes += b;
      this._totalAllocs += 1;
      if (this._allocatedBytes > this._peakBytes) {
        this._peakBytes = this._allocatedBytes;
      }
    }

    recordDealloc(bytes) {
      const b = Math.max(0, Number(bytes) || 0);
      if (b === 0) return;
      this._totalDeallocs += 1;
      this._allocatedBytes = Math.max(0, this._allocatedBytes - b);
    }

    allocatedBytes() {
      return this._allocatedBytes;
    }

    peakBytes() {
      return this._peakBytes;
    }

    budgetBytes() {
      return this._budgetBytes;
    }

    pressure() {
      const budget = Math.max(1, this._budgetBytes);
      const ratio = this._allocatedBytes / budget;
      if (ratio >= 0.85) return MemoryPressure.HighLoad;
      if (ratio >= 0.60) return MemoryPressure.Moderate;
      return MemoryPressure.Optimal;
    }

    allocZeroizingU8(len) {
      return ZeroizingBuffer.newZeroed(len, this, Uint8Array);
    }

    allocZeroizingU32(len) {
      return ZeroizingBuffer.newZeroed(len, this, Uint32Array);
    }

    acquireTileSlab() {
      const buf = this.tileSlabPool.acquire();
      this.recordAlloc(buf.byteLength);
      return buf;
    }

    releaseTileSlab(buf) {
      if (!buf) return;
      this.recordDealloc(buf.byteLength || 0);
      this.tileSlabPool.release(buf);
    }

    drainSlabPool() {
      if (this.rustArena) this.rustArena.reset();
      return this.tileSlabPool.clear();
    }

    diagnostics() {
      const allocatedBytes = this._allocatedBytes;
      const peakBytes = this._peakBytes;
      const budgetBytes = this._budgetBytes;
      return {
        profile: this._profile.tier,
        allocatedBytes,
        peakBytes,
        budgetBytes,
        allocatedMB: Number((allocatedBytes / (1024 * 1024)).toFixed(2)),
        peakMB: Number((peakBytes / (1024 * 1024)).toFixed(2)),
        budgetMB: Number((budgetBytes / (1024 * 1024)).toFixed(0)),
        utilizationPct: budgetBytes > 0 ? Number(((allocatedBytes / budgetBytes) * 100).toFixed(2)) : 0,
        totalAllocations: this._totalAllocs,
        totalDeallocations: this._totalDeallocs,
        slabPooledBuffers: this.tileSlabPool.len(),
        slabPoolBytes: this.tileSlabPool.totalPooledBytes(),
        rustWasmActive: !!(this.rustArena && this.rustArena.isNativeWasm),
        rustArenaAllocatedBytes: this.rustArena ? this.rustArena.allocatedBytes() : 0,
        rustArenaPeakBytes: this.rustArena ? this.rustArena.peakBytes() : 0,
        pressure: this.pressure()
      };
    }
  }

  /**
   * BoundedLruCache: Dual-bounded (entry cap + byte cap) generational LRU cache
   * with Active-Page Pinning (`setPinnedKey`) so the currently viewed page is never evicted
   * or zeroed while displayed on screen. Also compatible with ES6 Map interface (`get`, `set`,
   * `has`, `delete`, `clear`, `entries`, `values`, `keys`, `size`).
   */
  class BoundedLruCache extends Map {
    constructor(maxEntries = 24, maxBytes = 384 * 1024 * 1024, options = {}) {
      super();
      this.maxEntries = Math.max(1, maxEntries | 0);
      this.maxBytes = Math.max(1024, Number(maxBytes) || (384 * 1024 * 1024));
      this._currentBytes = 0;
      this.generation = 0;
      this._pinnedKey = null;
      this._pinnedPredicate = typeof options.isPinned === 'function' ? options.isPinned : null;
      this._onEvict = typeof options.onEvict === 'function' ? options.onEvict : null;
      this._budgetMgr = options.budgetManager || null;
      this._map = new Map(); // key -> { value, gen, bytes }
    }

    static estimateItemBytes(val) {
      if (!val) return 64;
      if (typeof val.byteSize === 'function') return val.byteSize();
      if (val instanceof Uint8Array || val instanceof Uint32Array || val instanceof Uint8ClampedArray) {
        return val.byteLength;
      }
      let bytes = 256;
      if (val.A && val.A.data) bytes += val.A.data.byteLength || 0;
      if (val.B && val.B.data) bytes += val.B.data.byteLength || 0;
      if (val.cls) bytes += val.cls.byteLength || 0;
      if (val._ovData && val._ovData.data) bytes += val._ovData.data.byteLength || 0;
      if (Array.isArray(val.regions)) bytes += val.regions.length * 96;
      return bytes;
    }

    get size() {
      return this._map.size;
    }

    len() {
      return this._map.size;
    }

    isEmpty() {
      return this._map.size === 0;
    }

    currentBytes() {
      return this._currentBytes;
    }

    setPinnedKey(key) {
      this._pinnedKey = key;
    }

    pinnedKey() {
      return this._pinnedKey;
    }

    _isEntryPinned(key, entry) {
      if (this._pinnedKey != null && key === this._pinnedKey) return true;
      if (this._pinnedKey != null && typeof key === 'string' && key.startsWith(this._pinnedKey + '|')) return true;
      if (entry && entry.value && this._pinnedKey != null && entry.value.n === this._pinnedKey) return true;
      if (this._pinnedPredicate && entry && this._pinnedPredicate(key, entry.value)) return true;
      return false;
    }

    has(key) {
      return this._map.has(key);
    }

    containsKey(key) {
      return this._map.has(key);
    }

    get(key) {
      const entry = this._map.get(key);
      if (!entry) return undefined;
      this.generation += 1;
      entry.gen = this.generation;
      return entry.value;
    }

    insert(key, value, explicitBytes = null) {
      const itemBytes = explicitBytes != null ? explicitBytes : BoundedLruCache.estimateItemBytes(value);
      this.generation += 1;
      const gen = this.generation;

      if (this._map.has(key)) {
        const old = this._map.get(key);
        this._currentBytes = Math.max(0, this._currentBytes - old.bytes);
        if (this._budgetMgr) this._budgetMgr.recordDealloc(old.bytes);
        this._map.delete(key);
        if (this._onEvict && old.value !== value) {
          try { this._onEvict(key, old.value); } catch (e) {}
        }
      }

      while (
        this._map.size >= this.maxEntries ||
        (this._currentBytes + itemBytes > this.maxBytes && this._map.size > 0)
      ) {
        if (!this.evictOldestUnpinned()) break;
      }

      this._currentBytes += itemBytes;
      if (this._budgetMgr) this._budgetMgr.recordAlloc(itemBytes);
      this._map.set(key, { value, gen, bytes: itemBytes });
      return this;
    }

    set(key, value) {
      return this.insert(key, value);
    }

    delete(key) {
      const entry = this._map.get(key);
      if (!entry) return false;
      this._currentBytes = Math.max(0, this._currentBytes - entry.bytes);
      if (this._budgetMgr) this._budgetMgr.recordDealloc(entry.bytes);
      this._map.delete(key);
      if (this._onEvict) {
        try { this._onEvict(key, entry.value); } catch (e) {}
      }
      return true;
    }

    evictOldestUnpinned() {
      let oldestKey = undefined;
      let oldestGen = Infinity;
      for (const [k, entry] of this._map.entries()) {
        if (this._isEntryPinned(k, entry)) continue;
        if (entry.gen < oldestGen) {
          oldestGen = entry.gen;
          oldestKey = k;
        }
      }
      if (oldestKey !== undefined) {
        const entry = this._map.get(oldestKey);
        this._map.delete(oldestKey);
        if (entry) {
          this._currentBytes = Math.max(0, this._currentBytes - entry.bytes);
          if (this._budgetMgr) this._budgetMgr.recordDealloc(entry.bytes);
          if (this._onEvict) {
            try { this._onEvict(oldestKey, entry.value); } catch (e) {}
          }
        }
        return true;
      }
      return false;
    }

    purgeUnpinned() {
      let evicted = 0;
      for (const [k, entry] of Array.from(this._map.entries())) {
        if (this._isEntryPinned(k, entry)) continue;
        this._map.delete(k);
        this._currentBytes = Math.max(0, this._currentBytes - entry.bytes);
        if (this._budgetMgr) this._budgetMgr.recordDealloc(entry.bytes);
        if (this._onEvict) {
          try { this._onEvict(k, entry.value); } catch (e) {}
        }
        evicted++;
      }
      return evicted;
    }

    clear() {
      for (const [k, entry] of this._map.entries()) {
        if (this._budgetMgr) this._budgetMgr.recordDealloc(entry.bytes);
        if (this._onEvict) {
          try { this._onEvict(k, entry.value); } catch (e) {}
        }
      }
      this._map.clear();
      this._currentBytes = 0;
      this._pinnedKey = null;
    }

    *entries() {
      for (const [k, entry] of this._map.entries()) {
        yield [k, entry.value];
      }
    }

    *values() {
      for (const entry of this._map.values()) {
        yield entry.value;
      }
    }

    *keys() {
      for (const k of this._map.keys()) {
        yield k;
      }
    }

    forEach(cb, thisArg) {
      for (const [k, entry] of this._map.entries()) {
        cb.call(thisArg, entry.value, k, this);
      }
    }

    [Symbol.iterator]() {
      return this.entries();
    }
  }

  /**
   * WorkerClient: Promise-based interface to worker.js
   */
  class WorkerClient {
    constructor() {
      this.worker = null;
      this._blobUrl = null;
      this.msgId = 0;
      this.pending = new Map();
      this._init();
    }

    _init() {
      if (typeof Worker === 'undefined') return;
      const createBlobWorker = () => {
        if (this._blobUrl || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return null;
        try {
          const inlineSrc = `
            self.onmessage = function(e) {
              const { id, type, payload } = e.data || {};
              try {
                if (type === 'DIFF_PIXELS') {
                  const res = (${this._syncDiff.toString().replace(/^_syncDiff/, 'function _syncDiff')})(payload);
                  self.postMessage({ id, status: 'ok', result: res }, [res.cls.buffer]);
                } else if (type === 'PARSE_DXF') {
                  const text = typeof payload === 'string' ? payload : (payload && payload.text) || '';
                  const lines = text.split(/\r?\n/);
                  let insunitsCode = 0, layerCount = 0, entityCount = 0, section = '';
                  for (let i = 0; i + 1 < lines.length; i += 2) {
                    const code = lines[i].trim(), val = lines[i + 1].trim();
                    if (code === '0' && val === 'SECTION') { section = (lines[i + 3] || '').trim().toUpperCase(); }
                    else if (code === '0' && val === 'ENDSEC') { section = ''; }
                    else if (section === 'HEADER' && code === '9' && val === '$INSUNITS') {
                      if (i + 3 < lines.length && lines[i + 2].trim() === '70') insunitsCode = parseInt(lines[i + 3].trim(), 10) || 0;
                    } else if (section === 'TABLES' && code === '0' && val === 'LAYER') { layerCount++; }
                    else if (section === 'ENTITIES' && code === '0' && val !== 'ENDSEC' && val !== 'VERTEX' && val !== 'SEQEND') { entityCount++; }
                  }
                  self.postMessage({ id, status: 'ok', result: { parsed: true, insunitsCode, layerCount, entityCount } });
                } else {
                  self.postMessage({ id, status: 'error', error: 'Unknown worker task type: ' + type });
                }
              } catch (err) {
                self.postMessage({ id, status: 'error', error: err.message });
              }
            };
          `;
          this._blobUrl = URL.createObjectURL(new Blob([inlineSrc], { type: 'application/javascript' }));
          return new Worker(this._blobUrl);
        } catch (e) {
          return null;
        }
      };

      const attachHandlers = (w, isBlob = false) => {
        w.onmessage = e => {
          const { id, status, result, error } = e.data || {};
          const p = this.pending.get(id);
          if (!p) return;
          this.pending.delete(id);
          if (status === 'ok') p.resolve(result);
          else p.reject(new Error(error || 'Worker task failed'));
        };
        w.onerror = (ev) => {
          if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
          try { w.terminate(); } catch (e) {}
          if (!isBlob) {
            const bw = createBlobWorker();
            if (bw) {
              this.worker = bw;
              attachHandlers(bw, true);
              for (const [id, entry] of this.pending.entries()) {
                const taskType = entry.type || 'DIFF_PIXELS';
                try { bw.postMessage({ id, type: taskType, payload: entry.payload }); }
                catch (err) {
                  this.pending.delete(id);
                  if (taskType === 'DIFF_PIXELS') entry.resolve(this._syncDiff(entry.payload));
                  else entry.reject(err);
                }
              }
              return;
            }
          } else if (this._blobUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
            try { URL.revokeObjectURL(this._blobUrl); } catch (e) {}
            this._blobUrl = null;
          }
          const pendingEntries = Array.from(this.pending.values());
          this.pending.clear();
          this.worker = null;
          for (const entry of pendingEntries) {
            try {
              if ((entry.type || 'DIFF_PIXELS') === 'DIFF_PIXELS') {
                entry.resolve(this._syncDiff(entry.payload));
              } else {
                entry.reject(new Error('Worker terminated'));
              }
            } catch (e) {
              entry.reject(e);
            }
          }
        };
      };

      try {
        this.worker = new Worker('worker.js');
        attachHandlers(this.worker, false);
      } catch (e) {
        const bw = createBlobWorker();
        if (bw) {
          this.worker = bw;
          attachHandlers(bw, true);
        } else {
          this.worker = null;
        }
      }
    }

    terminate() {
      if (this.worker) {
        try { this.worker.terminate(); } catch (e) {}
        this.worker = null;
      }
      if (this._blobUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        try { URL.revokeObjectURL(this._blobUrl); } catch (e) {}
        this._blobUrl = null;
      }
      for (const entry of this.pending.values()) {
        try { entry.reject(new Error('Worker terminated')); } catch (e) {}
      }
      this.pending.clear();
    }

    async diffPixels(payload) {
      if (!this.worker) {
        return this._syncDiff(payload);
      }

      const id = ++this.msgId;
      return new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject, payload, type: 'DIFF_PIXELS' });
        try {
          this.worker.postMessage({ id, type: 'DIFF_PIXELS', payload });
        } catch (err) {
          this.pending.delete(id);
          resolve(this._syncDiff(payload));
        }
      });
    }

    _syncDiff({
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
    } = {}) {
      tol = tol ?? threshold ?? 40;
      dataA = dataA || bufA;
      dataB = dataB || bufB;
      const W = width | 0, H = height | 0, totalPx = Math.max(0, W * H);
      const cls = new Uint8Array(totalPx);
      if (W <= 0 || H <= 0 || !dataA || !dataB) {
        return { cls, regions: [], countA: 0, countB: 0, countCommon: 0, isDarkSubstrate: false };
      }
      const dA = dataA instanceof Uint8ClampedArray || dataA instanceof Uint8Array ? dataA : new Uint8ClampedArray(dataA);
      const dB = dataB instanceof Uint8ClampedArray || dataB instanceof Uint8Array ? dataB : new Uint8ClampedArray(dataB);

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

      let countA = 0, countB = 0, countCommon = 0;
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

      const visited = new Uint8Array(totalPx);
      const regions = [];
      const stack = new Int32Array(Math.max(1, totalPx));

      for (let y = 0; y < H; y++) {
        const rowOff = y * W;
        for (let x = 0; x < W; x++) {
          const idx = rowOff + x;
          const type = cls[idx];
          if ((type === 1 || type === 2) && !visited[idx]) {
            let minX = x, maxX = x, minY = y, maxY = y, pixelCount = 0;
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

      return { cls, regions, countA, countB, countCommon, isDarkSubstrate, bgRGB: [bgR, bgG, bgB] };
    }
  }

  /**
   * VirtualTileManager / VirtualTileGrid:
   * 512x512 Virtual Tiling for massive high-density A0/E schematics.
   * Only rasterizes and retains visible viewport tiles in RAM, recycling off-screen
   * tile backing buffers through `MemoryBudgetManager`.
   */
  class VirtualTileManager {
    constructor(options = {}) {
      this.tileSize = Math.max(64, options.tileSize || 512);
      this.maxCachedTiles = Math.max(4, options.maxCachedTiles || 16);
      this.budgetMgr = options.budgetManager || null;
      this.generation = 0;
      this.tileCache = new Map(); // key "col_row_scale" -> { canvas, buffer, lastUsed, gen }
    }

    cachedTileCount() {
      return this.tileCache.size;
    }

    clear() {
      for (const tile of this.tileCache.values()) {
        if (tile.canvas) {
          tile.canvas.width = 0;
          tile.canvas.height = 0;
        }
        if (tile.buffer && typeof tile.buffer.zeroAndRelease === 'function') {
          tile.buffer.zeroAndRelease();
        }
      }
      this.tileCache.clear();
    }

    getVisibleTiles(viewX, viewY, viewW, viewH, totalW, totalH, scale = 1.0) {
      if (totalW <= 0 || totalH <= 0) return [];
      const s = this.tileSize;
      const safeScale = Math.max(0.05, Math.min(64.0, Number(scale) || 1.0));
      const docLeft = Math.max(0, -viewX / safeScale);
      const docTop = Math.max(0, -viewY / safeScale);
      const docRight = Math.min(totalW, (-viewX + viewW) / safeScale);
      const docBottom = Math.min(totalH, (-viewY + viewH) / safeScale);

      const startCol = Math.max(0, Math.floor(docLeft / s));
      const endCol = Math.min(Math.ceil(totalW / s) - 1, Math.floor(docRight / s));
      const startRow = Math.max(0, Math.floor(docTop / s));
      const endRow = Math.min(Math.ceil(totalH / s) - 1, Math.floor(docBottom / s));

      const visible = [];
      const now = Date.now();
      this.generation += 1;
      const gen = this.generation;

      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const key = `${c}_${r}_${safeScale.toFixed(2)}`;
          visible.push({
            col: c,
            row: r,
            x: c * s,
            y: r * s,
            w: Math.min(s, totalW - c * s),
            h: Math.min(s, totalH - r * s),
            key
          });

          if (this.tileCache.has(key)) {
            const entry = this.tileCache.get(key);
            entry.lastUsed = now;
            entry.gen = gen;
          }
        }
      }

      this._pruneCache(now);
      return visible;
    }

    getOrCreateTile(key, width, height) {
      this.generation += 1;
      const now = Date.now();
      if (this.tileCache.has(key)) {
        const item = this.tileCache.get(key);
        item.lastUsed = now;
        item.gen = this.generation;
        if (item.buffer) return item.buffer.asMutSlice();
        const byteLen = Math.max(4, (width | 0) * (height | 0) * 4);
        item.buffer = this.budgetMgr
          ? this.budgetMgr.allocZeroizingU8(byteLen)
          : ZeroizingBuffer.newZeroed(byteLen);
        return item.buffer.asMutSlice();
      }
      this._pruneToCapacity(this.maxCachedTiles - 1);
      const byteLen = Math.max(4, (width | 0) * (height | 0) * 4);
      const buffer = this.budgetMgr
        ? this.budgetMgr.allocZeroizingU8(byteLen)
        : ZeroizingBuffer.newZeroed(byteLen);
      const canvas = (typeof document !== 'undefined') ? document.createElement('canvas') : { width, height };
      if (canvas) {
        canvas.width = width;
        canvas.height = height;
      }
      this.tileCache.set(key, { canvas, buffer, lastUsed: now, gen: this.generation });
      return buffer.asMutSlice();
    }

    getOrCreateTileCanvas(key, width, height) {
      if (this.tileCache.has(key)) {
        const item = this.tileCache.get(key);
        item.lastUsed = Date.now();
        item.gen = ++this.generation;
        return item.canvas;
      }

      this._pruneToCapacity(this.maxCachedTiles - 1);
      const canvas = (typeof document !== 'undefined') ? document.createElement('canvas') : { width, height };
      const byteLen = Math.max(4, (width | 0) * (height | 0) * 4);
      const buffer = this.budgetMgr ? this.budgetMgr.allocZeroizingU8(byteLen) : null;
      if (canvas) {
        canvas.width = width;
        canvas.height = height;
        this.tileCache.set(key, { canvas, buffer, lastUsed: Date.now(), gen: ++this.generation });
        this._pruneCache(Date.now());
      }
      return canvas;
    }

    reclaimOutsideFrustum(visibleKeysSet) {
      let reclaimed = 0;
      const keep = visibleKeysSet instanceof Set ? visibleKeysSet : new Set(visibleKeysSet || []);
      for (const [key, item] of Array.from(this.tileCache.entries())) {
        if (!keep.has(key)) {
          if (item.canvas) {
            item.canvas.width = 0;
            item.canvas.height = 0;
          }
          if (item.buffer && typeof item.buffer.zeroAndRelease === 'function') {
            item.buffer.zeroAndRelease();
          }
          this.tileCache.delete(key);
          reclaimed++;
        }
      }
      return reclaimed;
    }

    pruneCache() {
      this._pruneToCapacity(this.maxCachedTiles);
    }

    _pruneToCapacity(targetMax) {
      const cap = Math.max(0, targetMax | 0);
      if (this.tileCache.size <= cap) return;
      const entries = Array.from(this.tileCache.entries()).sort((a, b) => (a[1].gen || a[1].lastUsed) - (b[1].gen || b[1].lastUsed));
      const toRemove = entries.slice(0, this.tileCache.size - cap);
      for (const [key, item] of toRemove) {
        if (item.canvas) {
          item.canvas.width = 0;
          item.canvas.height = 0;
        }
        if (item.buffer && typeof item.buffer.zeroAndRelease === 'function') {
          item.buffer.zeroAndRelease();
        }
        this.tileCache.delete(key);
      }
    }

    _pruneCache() {
      this._pruneToCapacity(this.maxCachedTiles);
    }
  }

  const globalMemoryBudget = new MemoryBudgetManager();
  if (typeof globalThis !== 'undefined') {
    globalThis.RPMemoryBudget = globalMemoryBudget;
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.RPRustWasmArena = globalRustWasmArena;
  }

  return {
    RUST_WASM_MEMORY_B64,
    RustWasmMemoryArena,
    globalRustWasmArena,
    secureZeroSlice,
    HardwareProfile,
    MemoryPressure,
    ZeroizingBuffer,
    SlabBufferPool,
    MemoryBudgetManager,
    BoundedLruCache,
    WorkerClient,
    VirtualTileManager,
    VirtualTileGrid: VirtualTileManager,
    globalMemoryBudget
  };
});
