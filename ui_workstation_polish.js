/* ============================================================================
 * Kensho Pro — Workstation UI Polish, Command Palette (Ctrl+K),
 * Unified Status Bar, Zen Focus Mode, Compact Density & Toast System
 * Version 1.2.3.2 (Build O1R0A7N5G0E002026A1232)
 * ============================================================================ */
(function (global) {
  'use strict';

  const STORAGE_DENSITY = 'kp_ui_density_v1';
  const STORAGE_RECENT = 'kp_recent_files_v1';
  const MAX_RECENT = 6;

  const THEME_LIST = [
    { id: 'dark',       label: 'Obsidian Dark',      swatch: '#0c1117', accent: '#38bdf8' },
    { id: 'light',      label: 'Crisp Daylight',     swatch: '#f8fafc', accent: '#0284c7' },
    { id: 'autocad',    label: 'AutoCAD Classic',    swatch: '#181b20', accent: '#22c55e' },
    { id: 'solidworks', label: 'SolidWorks Blue',    swatch: '#eef2f7', accent: '#2563eb' },
    { id: 'blueprint',  label: 'Blueprint Navy',     swatch: '#0a192f', accent: '#60a5fa' },
    { id: 'nord',       label: 'Nordic Frost',       swatch: '#2e3440', accent: '#88c0d0' },
    { id: 'amber',      label: 'PCB Amber Lab',      swatch: '#16120c', accent: '#f59e0b' },
    { id: 'emerald',    label: 'Soldermask Emerald', swatch: '#0b1914', accent: '#10b981' }
  ];

  const STUDIO_LABELS = {
    compare: 'Compare & CAM',
    edit: 'PDF Studio',
    dxf: 'CAD Studio (2D)',
    solidworks: 'SolidWorks 3D'
  };

  /* ── Toast Notifications ──────────────────────────────────────────────── */
  function ensureToastHost() {
    if (typeof document === 'undefined') return null;
    let host = document.getElementById('kp-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'kp-toast-host';
      host.className = 'kp-toast-host';
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    return host;
  }

  function showToast(message, type) {
    const host = ensureToastHost();
    if (!host || !message) return;
    const item = document.createElement('div');
    item.className = 'kp-toast' + (type ? ' kp-toast-' + type : '');
    const dot = document.createElement('span');
    dot.className = 'kp-toast-dot';
    const txt = document.createElement('span');
    txt.className = 'kp-toast-msg';
    txt.textContent = String(message);
    item.appendChild(dot);
    item.appendChild(txt);
    host.appendChild(item);
    requestAnimationFrame(() => item.classList.add('is-visible'));
    setTimeout(() => {
      item.classList.remove('is-visible');
      setTimeout(() => { if (item.parentNode) item.parentNode.removeChild(item); }, 240);
    }, 2400);
  }

  /* ── Studio & Theme Helpers ───────────────────────────────────────────── */
  function clickIfPresent(id) {
    const el = document.getElementById(id);
    if (el && typeof el.click === 'function') {
      el.click();
      return true;
    }
    return false;
  }

  function switchStudio(studioId) {
    if (studioId === 'solidworks') {
      if (clickIfPresent('nav-solidworks')) return true;
    } else {
      const btn = document.querySelector('#modes button[data-v="' + studioId + '"]');
      if (btn) {
        btn.click();
        return true;
      }
    }
    return false;
  }

  function applyTheme(themeId) {
    const sel = document.getElementById('theme-preset-sel');
    if (sel) {
      sel.value = themeId;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (typeof global.setTheme === 'function') {
      global.setTheme(themeId);
    }
    const meta = THEME_LIST.find(t => t.id === themeId);
    showToast('Theme: ' + (meta ? meta.label : themeId), 'info');
    updateStatusBar();
  }

  function getActiveStudio() {
    const swBtn = document.getElementById('nav-solidworks');
    if (swBtn && swBtn.classList.contains('on')) return 'solidworks';
    const active = document.querySelector('#modes button.on[data-v]');
    if (active) return active.getAttribute('data-v') || 'compare';
    return document.body.getAttribute('data-view') || 'compare';
  }

  function getActiveThemeLabel() {
    const sel = document.getElementById('theme-preset-sel');
    const id = sel ? sel.value : (document.documentElement.dataset.theme || 'dark');
    const meta = THEME_LIST.find(t => t.id === id);
    return meta ? meta.label : id;
  }

  /* ── Zen Focus Mode & Compact Density ─────────────────────────────────── */
  function toggleZenMode(force) {
    const next = typeof force === 'boolean' ? force : !document.body.classList.contains('kp-zen-mode');
    document.body.classList.toggle('kp-zen-mode', next);
    showToast(next ? 'Zen Focus Mode ON (Ctrl+\\ to exit)' : 'Zen Focus Mode OFF', 'info');
    updateStatusBar();
    return next;
  }

  function setDensity(mode) {
    const isCompact = mode === 'compact';
    document.body.classList.toggle('kp-density-compact', isCompact);
    try { localStorage.setItem(STORAGE_DENSITY, isCompact ? 'compact' : 'comfortable'); } catch (_) {}
    updateStatusBar();
    return isCompact ? 'compact' : 'comfortable';
  }

  function toggleDensity() {
    const next = document.body.classList.contains('kp-density-compact') ? 'comfortable' : 'compact';
    setDensity(next);
    showToast('UI Density: ' + (next === 'compact' ? 'Compact CAD' : 'Comfortable'), 'info');
    return next;
  }

  /* ── Recent Files Memory (Local Start Screen Helper) ──────────────────── */
  function getRecentFiles() {
    try {
      const raw = localStorage.getItem(STORAGE_RECENT);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
    } catch (_) {
      return [];
    }
  }

  function recordRecentFile(name, studio) {
    if (!name || typeof name !== 'string') return;
    const clean = name.trim();
    if (!clean || clean === 'Kensho Pro' || clean.length < 3) return;
    const extMatch = clean.match(/\.([a-z0-9]{2,8})$/i);
    const ext = extMatch ? extMatch[1].toUpperCase() : (studio || 'DOC').toUpperCase();
    const list = getRecentFiles().filter(item => item.name !== clean);
    list.unshift({ name: clean, ext: ext, studio: studio || getActiveStudio(), ts: Date.now() });
    try { localStorage.setItem(STORAGE_RECENT, JSON.stringify(list.slice(0, MAX_RECENT))); } catch (_) {}
    renderRecentStrips();
  }

  function renderRecentStrips() {
    const items = getRecentFiles();
    ['empty', 'eempty'].forEach(containerId => {
      const host = document.getElementById(containerId);
      if (!host) return;
      const hero = host.querySelector('.rp-empty-hero');
      if (!hero) return;
      let strip = hero.querySelector('.kp-recent-strip');
      if (!items.length) {
        if (strip) strip.remove();
        return;
      }
      if (!strip) {
        strip = document.createElement('div');
        strip.className = 'kp-recent-strip';
        hero.appendChild(strip);
      }
      strip.innerHTML =
        '<div class="kp-recent-head">' +
          '<span class="kp-recent-title">RECENT WORKSPACE FILES</span>' +
          '<button type="button" class="kp-recent-clear" title="Clear recent list">Clear</button>' +
        '</div>' +
        '<div class="kp-recent-list">' +
          items.map((it, idx) =>
            '<button type="button" class="kp-recent-chip" data-recent-idx="' + idx + '" title="' + escapeHtml(it.path || it.name) + '">' +
              '<span class="kp-recent-ext">' + escapeHtml(it.ext) + '</span>' +
              '<span class="kp-recent-name">' + escapeHtml(it.name) + '</span>' +
            '</button>'
          ).join('') +
        '</div>';
      strip.querySelectorAll('.kp-recent-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const idx = parseInt(chip.getAttribute('data-recent-idx'), 10);
          const item = items[idx];
          if (!item) return;
          if (typeof global.openRecent === 'function') global.openRecent(item);
          else if (item.path && global.native && typeof global.native.readFile === 'function') {
            global.native.readFile(item.path).then(f => {
              if (f && global.compareLoadBytes) global.compareLoadBytes('A', f.bytes, f.name, f.path);
            }).catch(() => {});
          }
        });
      });
      const clearBtn = strip.querySelector('.kp-recent-clear');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          try { localStorage.removeItem(STORAGE_RECENT); } catch (_) {}
          renderRecentStrips();
        });
      }
    });
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Command Palette Registry ─────────────────────────────────────────── */
  function buildCommandCatalog() {
    const cmds = [
      // Studios
      { id: 'studio-compare',    cat: 'Studio', title: 'Switch to Compare & CAM Studio',     kbd: 'Ctrl+1', run: () => switchStudio('compare') },
      { id: 'studio-edit',       cat: 'Studio', title: 'Switch to PDF Markup Studio',        kbd: 'Ctrl+2', run: () => switchStudio('edit') },
      { id: 'studio-dxf',        cat: 'Studio', title: 'Switch to 2D CAD / DXF Studio',      kbd: 'Ctrl+3', run: () => switchStudio('dxf') },
      { id: 'studio-solidworks', cat: 'Studio', title: 'Switch to SolidWorks 3D / STEP',     kbd: 'Ctrl+4', run: () => switchStudio('solidworks') },

      // File & Compare
      { id: 'file-open-a',       cat: 'File',   title: 'Open Base Drawing (Rev A)',          kbd: 'Rev A',  run: () => { switchStudio('compare'); clickIfPresent('rp-cmp-open-a-btn'); } },
      { id: 'file-open-b',       cat: 'File',   title: 'Open Revised Drawing (Rev B)',       kbd: 'Rev B',  run: () => { switchStudio('compare'); clickIfPresent('rp-cmp-open-b-btn'); } },
      { id: 'file-open-pdf',     cat: 'File',   title: 'Open PDF / DXF in PDF Studio',       kbd: 'Ctrl+O', run: () => { switchStudio('edit'); clickIfPresent('rp-edit-open-btn'); } },
      { id: 'file-new-blank',    cat: 'File',   title: 'New Blank A4 PDF Sheet',             kbd: 'Ctrl+Shift+B', run: () => { switchStudio('edit'); clickIfPresent('rp-launch-blank'); } },
      { id: 'file-merge-pdf',    cat: 'File',   title: 'Merge PDF Package',                  kbd: 'PDF',    run: () => { switchStudio('edit'); clickIfPresent('rp-launch-merge'); } },
      { id: 'file-img-pdf',      cat: 'File',   title: 'Convert Images to PDF',              kbd: 'Import', run: () => { switchStudio('edit'); clickIfPresent('rp-launch-images'); } },

      // Workspace UI
      { id: 'ui-zen',            cat: 'View',   title: 'Toggle Zen Focus Mode (Maximize Canvas)', kbd: 'Ctrl+\\', run: () => toggleZenMode() },
      { id: 'ui-density',        cat: 'View',   title: 'Toggle UI Density (Compact / Comfortable)', kbd: 'Density', run: () => toggleDensity() },
      { id: 'ui-free-ram',       cat: 'System', title: 'Free Workspace Memory (Purge Caches & GC)', kbd: 'RAM', run: () => reclaimMemoryNow(true) },
      { id: 'ui-settings',       cat: 'View',   title: 'Open Workstation Settings',          kbd: 'Ctrl+,', run: () => clickIfPresent('top-settings-btn') },
      { id: 'ui-theme-toggle',   cat: 'Theme',  title: 'Quick Toggle Dark / Light Mode',     kbd: 'Ctrl+Shift+D', run: () => clickIfPresent('theme') }
    ];

    THEME_LIST.forEach(t => {
      cmds.push({
        id: 'theme-' + t.id,
        cat: 'Theme',
        title: 'Theme: ' + t.label,
        swatch: t.swatch,
        accent: t.accent,
        kbd: t.id,
        run: () => applyTheme(t.id)
      });
    });

    return cmds;
  }

  function fuzzyScore(query, text) {
    if (!query) return 1;
    const q = query.toLowerCase().trim();
    const t = text.toLowerCase();
    if (t.includes(q)) return 100 - t.indexOf(q);
    let qi = 0;
    let score = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) {
        score += 10;
        qi++;
      }
    }
    return qi === q.length ? score : -1;
  }

  let paletteState = { open: false, selectedIdx: 0, filtered: [] };

  function ensurePaletteDOM() {
    let overlay = document.getElementById('kp-cmd-palette');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'kp-cmd-palette';
    overlay.className = 'kp-cmd-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Kensho Pro Command Palette');
    overlay.innerHTML =
      '<div class="kp-cmd-modal">' +
        '<div class="kp-cmd-input-row">' +
          '<span class="kp-cmd-search-ic" aria-hidden="true">&#8981;</span>' +
          '<input type="text" id="kp-cmd-input" class="kp-cmd-input" placeholder="Jump to studio, tool, file action, or theme..." autocomplete="off" spellcheck="false" />' +
          '<kbd class="kp-cmd-esc">ESC</kbd>' +
        '</div>' +
        '<div id="kp-cmd-list" class="kp-cmd-list" role="listbox"></div>' +
        '<div class="kp-cmd-footer">' +
          '<span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>' +
          '<span><kbd>Enter</kbd> Run</span>' +
          '<span><kbd>Ctrl+K</kbd> Toggle</span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) closeCommandPalette();
    });

    const input = overlay.querySelector('#kp-cmd-input');
    input.addEventListener('input', () => {
      paletteState.selectedIdx = 0;
      renderPaletteList(input.value);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCommandPalette();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (paletteState.filtered.length) {
          paletteState.selectedIdx = (paletteState.selectedIdx + 1) % paletteState.filtered.length;
          renderPaletteList(input.value);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (paletteState.filtered.length) {
          paletteState.selectedIdx = (paletteState.selectedIdx - 1 + paletteState.filtered.length) % paletteState.filtered.length;
          renderPaletteList(input.value);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = paletteState.filtered[paletteState.selectedIdx];
        if (chosen) executeCommand(chosen);
      }
    });

    return overlay;
  }

  function renderPaletteList(query) {
    const listEl = document.getElementById('kp-cmd-list');
    if (!listEl) return;
    const all = buildCommandCatalog();
    const scored = all
      .map(cmd => ({ cmd, score: fuzzyScore(query, cmd.cat + ' ' + cmd.title + ' ' + (cmd.kbd || '')) }))
      .filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.cmd);

    paletteState.filtered = scored;
    if (paletteState.selectedIdx >= scored.length) paletteState.selectedIdx = 0;

    if (!scored.length) {
      listEl.innerHTML = '<div class="kp-cmd-empty">No matching workstation commands</div>';
      return;
    }

    listEl.innerHTML = scored.map((cmd, idx) => {
      const sel = idx === paletteState.selectedIdx ? ' is-selected' : '';
      const swatch = cmd.swatch
        ? '<span class="kp-cmd-swatch" style="background:' + cmd.swatch + ';border-color:' + cmd.accent + '"></span>'
        : '';
      const kbd = cmd.kbd ? '<kbd class="kp-cmd-kbd">' + escapeHtml(cmd.kbd) + '</kbd>' : '';
      return (
        '<button type="button" class="kp-cmd-item' + sel + '" data-cmd-idx="' + idx + '" role="option">' +
          '<span class="kp-cmd-cat">' + escapeHtml(cmd.cat) + '</span>' +
          swatch +
          '<span class="kp-cmd-title">' + escapeHtml(cmd.title) + '</span>' +
          kbd +
        '</button>'
      );
    }).join('');

    listEl.querySelectorAll('.kp-cmd-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-cmd-idx'), 10);
        if (paletteState.filtered[idx]) executeCommand(paletteState.filtered[idx]);
      });
    });

    const activeItem = listEl.querySelector('.kp-cmd-item.is-selected');
    if (activeItem && typeof activeItem.scrollIntoView === 'function') {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }

  function executeCommand(cmd) {
    closeCommandPalette();
    try {
      if (typeof cmd.run === 'function') cmd.run();
    } catch (err) {
      console.warn('[KenshoUI] Command error:', err);
    }
  }

  function openCommandPalette(initialQuery) {
    const overlay = ensurePaletteDOM();
    overlay.hidden = false;
    paletteState.open = true;
    paletteState.selectedIdx = 0;
    const input = overlay.querySelector('#kp-cmd-input');
    if (input) {
      input.value = typeof initialQuery === 'string' ? initialQuery : '';
      renderPaletteList(input.value);
      setTimeout(() => input.focus(), 10);
    }
  }

  function closeCommandPalette() {
    const overlay = document.getElementById('kp-cmd-palette');
    if (overlay) overlay.hidden = true;
    paletteState.open = false;
  }

  /* ── Top-Bar Command Trigger & Unified Status Bar ─────────────────────── */
  function injectTopBarTrigger() {
    const top = document.getElementById('top');
    if (!top || document.getElementById('kp-cmd-trigger')) return;
    const settingsBtn = document.getElementById('top-settings-btn');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'kp-cmd-trigger';
    btn.className = 'kp-cmd-trigger';
    btn.title = 'Open Global Command Palette (Ctrl+K)';
    btn.innerHTML = '<span class="kp-cmd-trigger-ic">&#8981;</span><span class="kp-cmd-trigger-lbl">Commands</span><kbd>Ctrl+K</kbd>';
    btn.addEventListener('click', () => openCommandPalette(''));
    if (settingsBtn && settingsBtn.parentNode === top) {
      top.insertBefore(btn, settingsBtn);
    } else {
      top.appendChild(btn);
    }
  }

  function injectStatusBar() {
    if (document.getElementById('kp-statusbar')) return;
    const bar = document.createElement('footer');
    bar.id = 'kp-statusbar';
    bar.className = 'kp-statusbar';
    bar.setAttribute('role', 'contentinfo');
    bar.innerHTML =
      '<div class="kp-sb-left">' +
        '<button type="button" id="kp-sb-studio" class="kp-sb-item kp-sb-studio" title="Active Workspace — Click to switch via Command Palette">Compare &amp; CAM</button>' +
        '<span class="kp-sb-sep"></span>' +
        '<span id="kp-sb-doc" class="kp-sb-item kp-sb-doc" title="Active Document">Ready</span>' +
      '</div>' +
      '<div class="kp-sb-right">' +
        '<button type="button" id="kp-sb-mem" class="kp-sb-item kp-sb-mem" title="Click to free cached pages &amp; run Garbage Collection">RAM: --</button>' +
        '<span class="kp-sb-sep"></span>' +
        '<button type="button" id="kp-sb-density" class="kp-sb-item" title="Toggle UI Density (Compact / Comfortable)">Density: Standard</button>' +
        '<span class="kp-sb-sep"></span>' +
        '<button type="button" id="kp-sb-zen" class="kp-sb-item" title="Toggle Zen Focus Mode (Ctrl+\\)">Focus</button>' +
        '<span class="kp-sb-sep"></span>' +
        '<button type="button" id="kp-sb-theme" class="kp-sb-item" title="Switch Workstation Theme">Obsidian Dark</button>' +
        '<span class="kp-sb-sep"></span>' +
        '<button type="button" id="kp-sb-cmd" class="kp-sb-item kp-sb-kbd-hint" title="Open Command Palette (Ctrl+K)">Ctrl+K</button>' +
        '<span class="kp-sb-sep"></span>' +
        '<span class="kp-sb-gpu" id="kp-sb-gpu" title="Hardware OpenGL/WebGL GPU Acceleration" style="padding:1px 6px;border-radius:4px;border:1px solid var(--line2);font-size:10.5px;color:var(--acc-bright,var(--acc))">GPU: OpenGL</span>' +
        '<span class="kp-sb-ver" title="Build O1R0A7N5G0E002026A1232">v1.2.3.2 Stable (O1R0A7N5G0E002026A1232)</span>' +
      '</div>';
    document.body.appendChild(bar);

    bar.querySelector('#kp-sb-studio').addEventListener('click', () => openCommandPalette('Studio '));
    bar.querySelector('#kp-sb-mem').addEventListener('click', () => reclaimMemoryNow(true));
    bar.querySelector('#kp-sb-density').addEventListener('click', () => toggleDensity());
    bar.querySelector('#kp-sb-zen').addEventListener('click', () => toggleZenMode());
    bar.querySelector('#kp-sb-theme').addEventListener('click', () => openCommandPalette('Theme: '));
    bar.querySelector('#kp-sb-cmd').addEventListener('click', () => openCommandPalette(''));
  }

  function updateStatusBar() {
    const studioEl = document.getElementById('kp-sb-studio');
    const docEl = document.getElementById('kp-sb-doc');
    const densEl = document.getElementById('kp-sb-density');
    const zenEl = document.getElementById('kp-sb-zen');
    const themeEl = document.getElementById('kp-sb-theme');
    if (!studioEl) return;

    const studio = getActiveStudio();
    studioEl.textContent = STUDIO_LABELS[studio] || 'Workspace';

    const docname = document.getElementById('docname');
    const docTxt = docname && docname.textContent ? docname.textContent.trim() : '';
    if (docTxt && docTxt !== 'Kensho Pro') {
      docEl.textContent = docTxt;
      recordRecentFile(docTxt, studio);
    } else {
      docEl.textContent = 'Ready · Local Offline Engine';
    }

    const isCompact = document.body.classList.contains('kp-density-compact');
    densEl.textContent = isCompact ? 'Density: Compact' : 'Density: Standard';
    densEl.classList.toggle('is-active', isCompact);

    const isZen = document.body.classList.contains('kp-zen-mode');
    zenEl.textContent = isZen ? 'Focus: ON' : 'Focus';
    zenEl.classList.toggle('is-active', isZen);

    themeEl.textContent = getActiveThemeLabel();
  }


  /* ── Memory Reclamation, Live RAM Readout & Zero-Lag Pan/Zoom Guard ───── */
  function reclaimMemoryNow(notify) {
    let freed = 0;
    try {
      if (global.CompareMemoryGuard && typeof global.CompareMemoryGuard.reclaimWorkspaceMemory === 'function') {
        const res = global.CompareMemoryGuard.reclaimWorkspaceMemory({ keepCurrentPage: true });
        freed = (res && res.freedEntries) || 0;
      } else if (typeof global.gc === 'function') {
        global.gc();
      }
    } catch (_) {}
    updateMemReadout();
    if (notify) {
      showToast(freed > 0 ? ('Freed ' + freed + ' cached page(s) & compacted RAM') : 'Workspace RAM compacted', 'info');
    }
    return freed;
  }

  function updateMemReadout() {
    const el = document.getElementById('kp-sb-mem');
    if (!el) return;
    const perf = global.performance && global.performance.memory;
    if (perf && Number.isFinite(perf.usedJSHeapSize)) {
      const mb = Math.round(perf.usedJSHeapSize / (1024 * 1024));
      el.textContent = 'RAM: ' + mb + ' MB';
    } else {
      el.textContent = 'RAM: Opt';
    }
  }

  function installInteractionLagGuard() {
    let interactTimer = 0;
    const markInteracting = () => {
      if (!document.body.classList.contains('kp-interacting')) {
        document.body.classList.add('kp-interacting');
      }
      if (interactTimer) clearTimeout(interactTimer);
      interactTimer = setTimeout(() => {
        interactTimer = 0;
        document.body.classList.remove('kp-interacting');
      }, 140);
    };
    document.addEventListener('wheel', markInteracting, { passive: true });
    let dragging = false;
    document.addEventListener('pointerdown', (e) => { if (e.button === 0 || e.button === 1) dragging = true; }, { passive: true });
    document.addEventListener('pointermove', () => { if (dragging) markInteracting(); }, { passive: true });
    document.addEventListener('pointerup', () => { dragging = false; }, { passive: true });
    document.addEventListener('pointercancel', () => { dragging = false; }, { passive: true });

    // Reclaim idle cache when window is minimized/hidden
    let hiddenTimer = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        hiddenTimer = setTimeout(() => reclaimMemoryNow(false), 20000);
      } else {
        if (hiddenTimer) { clearTimeout(hiddenTimer); hiddenTimer = 0; }
        updateMemReadout();
      }
    });

    // Lightweight 5s RAM readout updater (only when visible)
    setInterval(() => { if (!document.hidden) updateMemReadout(); }, 5000);
    updateMemReadout();
  }

  /* ── Initialization & Global Keybindings ──────────────────────────────── */
  function init() {
    if (typeof document === 'undefined' || !document.body) return;

    injectTopBarTrigger();
    injectStatusBar();
    ensurePaletteDOM();

    try {
      const savedDensity = localStorage.getItem(STORAGE_DENSITY);
      if (savedDensity === 'compact') {
        document.body.classList.add('kp-density-compact');
      }
    } catch (_) {}

    renderRecentStrips();
    updateStatusBar();
    installInteractionLagGuard();

    // Sync status bar when studio tabs, theme, or docname change
    const modes = document.getElementById('modes');
    if (modes) {
      modes.addEventListener('click', () => { setTimeout(() => { reclaimMemoryNow(false); updateStatusBar(); }, 60); });
    }
    const themeSel = document.getElementById('theme-preset-sel');
    if (themeSel) {
      themeSel.addEventListener('change', () => setTimeout(updateStatusBar, 40));
    }
    const themeBtn = document.getElementById('theme');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => setTimeout(updateStatusBar, 40));
    }

    if (typeof MutationObserver !== 'undefined') {
      const docname = document.getElementById('docname');
      if (docname) {
        new MutationObserver(() => updateStatusBar()).observe(docname, {
          childList: true, characterData: true, subtree: true
        });
      }
    }

    // Global shortcuts: Ctrl+K (Command Palette), Ctrl+\ (Zen Focus Mode)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && paletteState.open) {
        e.preventDefault();
        closeCommandPalette();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (paletteState.open) closeCommandPalette();
        else openCommandPalette('');
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === '\\') {
        e.preventDefault();
        toggleZenMode();
      }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  global.KenshoToast = { show: showToast };
  global.KenshoUI = {
    openCommandPalette: openCommandPalette,
    closeCommandPalette: closeCommandPalette,
    toggleZenMode: toggleZenMode,
    toggleDensity: toggleDensity,
    setDensity: setDensity,
    applyTheme: applyTheme,
    switchStudio: switchStudio,
    updateStatusBar: updateStatusBar,
    reclaimMemoryNow: reclaimMemoryNow,
    recordRecentFile: recordRecentFile,
    getRecentFiles: getRecentFiles,
    buildCommandCatalog: buildCommandCatalog,
    THEME_LIST: THEME_LIST
  };
})(typeof window !== 'undefined' ? window : globalThis);
