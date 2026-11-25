/* ============================================================================
 * [MODULE SECTION: APPLICATION MENU BAR, PREFERENCES & REFERENCE MANUAL (menu.js)]
 * WHAT THIS IS: Builds the top-level File, Edit, View, Tools, Settings, and Help
 *   dropdown menus, the workstation Preferences dialog, and the Quick Guide manual.
 * WHY / HOW TO EDIT: Edit `MENUS` or `COMPLETE_GUIDE_SECTIONS` to add new menu
 *   commands or update built-in user documentation.
 * ============================================================================ */
// ===== Menu bar, shortcuts, preferences, help, external open =====
(() => {
const V = () => document.body.dataset.view, SW_V = () => { if (V() === 'solidworks') return true; const h = document.getElementById('sw-studio-host'); return !!(h && !h.hidden); }, ED = () => V() === 'edit', DXF_V = () => V() === 'dxf' && !SW_V(), E = () => RE.E;
const hasDoc = () => ED() ? !!E().bytes : !!(S.A && S.B);
const recents = () => { try { return JSON.parse(localStorage.getItem('recent') || '[]'); } catch (e) { return []; } };
async function openRecent(r) {
  if (!r) return;
  let f = r.path ? await window.native.readFile(r.path) : null;
  if (!f && window.__recentMemFiles) {
    const mem = window.__recentMemFiles.get(r.path || r.name) || window.__recentMemFiles.get(r.name);
    if (mem && mem.bytes) f = { name: mem.name || r.name, path: mem.path || r.path || '', bytes: mem.bytes };
  }

  if (!f) {
    try { localStorage.setItem('recent', JSON.stringify(recents().filter(x => (x.path || x.name) !== (r.path || r.name)))); } catch (e) {}
    const msg = 'Recent file is no longer on disk: ' + (r.path || r.name);
    st2(msg);
    if (window.rpToast) window.rpToast(msg);
    return;
  }
  const u = b2u(f.bytes);
  if (/\.(kensho|redline)$/i.test(f.name) && window.UIRibbon && window.UIRibbon.restoreSessionFromText) {
    setView('compare');
    await window.UIRibbon.restoreSessionFromText(new TextDecoder().decode(u));
    return;
  }
  const isAlreadyPdf = u.length >= 4 && u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46;
  if (!isAlreadyPdf && (/\.dxf$/i.test(f.name) || (window.isCAMExt && window.isCAMExt(f.name))) && window.openExternalCADOrCAM) {
    await window.openExternalCADOrCAM(u, f.name, f.path, r.slot || null);
    return;
  }
  if (ED()) RE.openBytes(u, f.name, f.path);
  else compareLoadBytes(r.slot || (!S.A ? 'A' : 'B'), u, f.name, f.path);
}
const st2 = t => (ED() ? $('#est') : $('#st')).textContent = t;
const ensureEd = () => { if (!ED()) setView('edit'); };
const ensureCmp = () => { if (V() !== 'compare') setView('compare'); };
const ensureDxf = () => { if (!DXF_V()) setView('dxf'); };
const op = id => () => { ensureEd(); ACT.op(id); };
const needEd = () => !ED();

const MENUS = {
  File: () => [
    { l: 'Open Base (A)', ic: 'openA', a: () => { ensureCmp(); ACT.openA(); } },
    { l: 'Open New (B)', ic: 'openB', a: () => { ensureCmp(); ACT.openB(); } },
    { l: 'Open PDF in Studio', ic: 'open', a: () => { ensureEd(); ACT.eOpen(); } },
    { l: 'Open AutoCAD DXF Studio', ic: 'cadDxf', a: () => { ensureDxf(); if ($('#dxf-st-open')) $('#dxf-st-open').click(); } },
    { l: 'Open Gerber / Drill', ic: 'pcbDual', a: () => { ensureCmp(); if (window.UIRibbon && window.UIRibbon.promptCAMCompare) window.UIRibbon.promptCAMCompare(); } },
    {
      l: 'Open Recent',
      ic: 'recent',
      sub: [
        { h: 'Recent Drawings (Last 8)' },
        ...(recents().length
          ? recents().slice(0, 8).map((r, idx) => ({ l: `${idx + 1}. ${r.name}`, ic: 'open', tip: r.path, a: () => openRecent(r) }))
          : [{ l: '(No recent drawings yet)', dis: () => true }]),
        '-',
        { l: 'Clear Recent Drawings', ic: 'trash', a: () => { try { localStorage.removeItem('recent'); if (window.__recentMemFiles) window.__recentMemFiles.clear(); } catch (e) {} }, dis: () => !recents().length }
      ]
    },
    '-',
    {
      l: SW_V() ? 'Save .kensho3d' : (DXF_V() ? 'Save .DXF' : (ED() ? 'Save' : 'Save .redline')),
      ic: 'save',
      a: () => SW_V() && window.SolidWorksStudio ? window.SolidWorksStudio.saveKensho3D() : (DXF_V() && window.DXFStudio ? window.DXFStudio.saveModifiedDXFFile() : (ED() ? ACT.eSave() : (window.UIRibbon && window.UIRibbon.saveSessionFile && window.UIRibbon.saveSessionFile())))
    },
    {
      l: SW_V() ? 'Export .STEP' : (DXF_V() ? 'Export .dxf' : (ED() ? 'Save As' : 'Load .redline')),
      ic: 'saveas',
      a: () => SW_V() && window.SolidWorksStudio ? window.SolidWorksStudio.exportCurrentModel('step') : (DXF_V() && window.DXFStudio ? window.DXFStudio.saveModifiedDXFFile() : (ED() ? ACT.eSaveAs() : (window.UIRibbon && window.UIRibbon.loadSessionFile && window.UIRibbon.loadSessionFile())))
    },
    '-',
    { l: 'Executive Audit PDF', ic: 'auditPdf', a: () => window.UIRibbon && window.UIRibbon.generateExecutiveAuditReport && window.UIRibbon.generateExecutiveAuditReport() },
    { l: 'Comparison PDF', ic: 'report', a: () => ACT.report && ACT.report(), dis: () => !(S.A && S.B) },
    { l: 'High-Res PNG', ic: 'png', a: () => ACT.savePng && ACT.savePng(), dis: () => !(S.A || S.B) },
    { l: 'Defects CSV', ic: 'csv', a: () => window.UIRibbon && window.UIRibbon.exportDefectsCSV ? window.UIRibbon.exportDefectsCSV() : (ACT.saveCsv && ACT.saveCsv()) },
    { l: 'Export QA Package', ic: 'packageZip', a: () => window.exportQAPackageZip && window.exportQAPackageZip() },
    '-',
    { l: 'Print', ic: 'print', a: op('print'), dis: needEd },
    { l: 'Exit', ic: 'x', a: () => window.native && window.native.quit && window.native.quit() }
  ],

  Edit: () => [
    { l: 'Undo', ic: 'undo', a: () => SW_V() && window.SolidWorksStudio ? window.SolidWorksStudio.undoSW() : (ED() ? ACT.eUndo() : (DXF_V() && window.DXFStudio ? window.DXFStudio.undo() : (ACT.cUndo && ACT.cUndo()))) },
    { l: 'Redo', ic: 'redo', a: () => SW_V() && window.SolidWorksStudio ? window.SolidWorksStudio.redoSW() : (ED() ? ACT.eRedo() : (DXF_V() && window.DXFStudio ? window.DXFStudio.redo() : (ACT.cRedo && ACT.cRedo()))) },
    '-',
    { l: 'Find', ic: 'search', a: () => { ensureEd(); ACT.find(); } },
    { l: 'Ignore Area', ic: 'ignore', ck: () => !!(S && S.ignMode), a: () => { ensureCmp(); ACT.ignore(); } },
    { l: 'Clear All', ic: 'trash', a: () => {
      if (ED()) ACT.clearMeasure();
      else if ($('#rib-clear-markups')) $('#rib-clear-markups').click();
    } },
    '-',
    { l: 'Preferences...', ic: 'gear', a: prefs }
  ],

  View: () => [
    { l: 'World View', ic: 'globe', ck: () => window.isWorldViewActive ? window.isWorldViewActive() : false, a: () => window.toggleWorldView && window.toggleWorldView() },
    '-',
    { l: 'Compare', ck: () => V() === 'compare', a: () => setView('compare') },
    { l: 'PDF Studio', ck: () => ED(), a: () => setView('edit') },
    { l: 'CAD Studio (2D AutoCAD)', ck: () => DXF_V() && (!document.getElementById('sw-studio-host') || document.getElementById('sw-studio-host').hidden), a: () => { if (window.setCADStudioMode) window.setCADStudioMode('2d'); setView('dxf'); } },
    { l: 'SolidWorks 3D Studio', ck: () => !!(document.getElementById('sw-studio-host') && !document.getElementById('sw-studio-host').hidden), a: () => { if (window.setCADStudioMode) window.setCADStudioMode('solidworks'); } },
    '-',
    {
      l: 'Review & Compare',
      ic: 'tabCompare',
      sub: [
        { l: 'Overlay on paper', a: () => { ensureCmp(); window.UIRibbon && window.UIRibbon.setCompareMode ? window.UIRibbon.setCompareMode('paper') : ACT.cMode(0); } },
        { l: 'Overlay dark (CAM)', a: () => { ensureCmp(); window.UIRibbon && window.UIRibbon.setCompareMode ? window.UIRibbon.setCompareMode('over') : ACT.cMode(1); } },
        { l: 'Differences only', a: () => { ensureCmp(); window.UIRibbon && window.UIRibbon.setCompareMode ? window.UIRibbon.setCompareMode('diff') : ACT.cMode(2); } },
        { l: 'Side by side', a: () => { ensureCmp(); window.UIRibbon && window.UIRibbon.setCompareMode ? window.UIRibbon.setCompareMode('side') : ACT.cMode(3); } },
        { l: 'Blink A / B', a: () => { ensureCmp(); window.UIRibbon && window.UIRibbon.setCompareMode ? window.UIRibbon.setCompareMode('blink') : ACT.cMode(4); } },
        { l: 'Split Curtain', a: () => { ensureCmp(); if (window.UIRibbon && window.UIRibbon.setCompareMode) window.UIRibbon.setCompareMode('curtain'); } },
        { l: 'Base (A) only', a: () => { ensureCmp(); window.UIRibbon && window.UIRibbon.setCompareMode ? window.UIRibbon.setCompareMode('A') : ACT.cMode(5); } },
        { l: 'Revised (B) only', a: () => { ensureCmp(); window.UIRibbon && window.UIRibbon.setCompareMode ? window.UIRibbon.setCompareMode('B') : ACT.cMode(6); } }
      ]
    },
    {
      l: 'View & Enhance',
      ic: 'tabView',
      sub: [
        { l: 'Normal', a: () => window.setEnhanced && window.setEnhanced('off') },
        { l: 'High Contrast', a: () => window.setEnhanced && window.setEnhanced('enh') },
        { l: 'Extra Dark', a: () => window.setEnhanced && window.setEnhanced('dark') },
        { l: 'Blueprint CAD', a: () => window.setEnhanced && window.setEnhanced('blue') }
      ]
    },
    {
      l: '4x Loupe',
      ic: 'loupe',
      sub: [
        { l: 'World View', a: () => window.toggleWorldView && window.toggleWorldView() },
        { l: 'Split Curtain', a: () => { ensureCmp(); if ($('#rib-curtain-toggle')) $('#rib-curtain-toggle').click(); } },
        { l: '4x Loupe', a: () => { ensureCmp(); if ($('#rib-loupe-toggle')) $('#rib-loupe-toggle').click(); } },
        { l: 'Ref Grid', a: () => { ensureCmp(); if ($('#rib-grid-toggle')) $('#rib-grid-toggle').click(); } },
        { l: 'Crosshair', a: () => { ensureCmp(); if ($('#rib-crosshair-toggle')) $('#rib-crosshair-toggle').click(); } },
        { l: 'Markers', a: () => { ensureCmp(); if (ACT.toggleMarkers) ACT.toggleMarkers(); } }
      ]
    },
    '-',
    { l: 'Zoom In', ic: 'zoomin', a: () => SW_V() && window.SolidWorksStudio ? window.SolidWorksStudio.zoomBy(1.25) : (ED() ? ACT.eZoomIn() : (DXF_V() && $('#dxf-st-zi') ? $('#dxf-st-zi').click() : ACT.cZoomIn())) },
    { l: 'Zoom Out', ic: 'zoomout', a: () => SW_V() && window.SolidWorksStudio ? window.SolidWorksStudio.zoomBy(0.8) : (ED() ? ACT.eZoomOut() : (DXF_V() && $('#dxf-st-zo') ? $('#dxf-st-zo').click() : ACT.cZoomOut())) },
    { l: 'Fit & Sharpen', ic: 'fit', a: () => SW_V() && window.SolidWorksStudio ? window.SolidWorksStudio.zoomFit() : (ED() ? ACT.eFit() : (DXF_V() && window.DXFStudio ? window.DXFStudio.zoomExtents() : ACT.cFit())) },
    '-',
    {
      l: 'Workspace Panel Layout',
      ic: 'layoutDock',
      sub: [
        { h: 'Workspace Docking Presets' },
        { l: 'Right Split (Diffs Up / CAM Down)', a: () => window.KenshoDockManager && window.KenshoDockManager.applyPreset('dock-right-split') },
        { l: 'Dual-Side Quad (LU/LD + RU/RD)', a: () => window.KenshoDockManager && window.KenshoDockManager.applyPreset('dock-quad') },
        { l: 'Left Split + Right Inspector', a: () => window.KenshoDockManager && window.KenshoDockManager.applyPreset('dock-left-split') },
        { l: 'Bottom Console (3-Side EDA)', a: () => window.KenshoDockManager && window.KenshoDockManager.applyPreset('dock-bottom-console') },
        { l: 'Detach Panels as Floating Windows', a: () => window.KenshoDockManager && window.KenshoDockManager.applyPreset('dock-floating') },
        { l: 'Classic Single Tabbed Dock', a: () => window.KenshoDockManager && window.KenshoDockManager.applyPreset('classic-tabbed') },
        '-',
        { l: 'Open Panel Docking Matrix...', ic: 'gear', a: () => window.KenshoDockManager && window.KenshoDockManager.toggleLayoutPopover($('#kdock-layout-btn')) }
      ]
    },
    { l: 'Pages', ck: () => !$('#thumbs').hidden && !$('#thumbs').classList.contains('rp-collapsed'), a: () => { ensureEd(); ACT.toggleThumbs(); } },
    { l: 'Invert', ic: 'moon', ck: () => ACT.nightOn(), a: () => { ensureEd(); ACT.night(); } },
    { l: 'Inspector', ck: () => ED() ? !$('#etools').classList.contains('rp-collapsed') : !$('#view-compare aside').classList.contains('rp-collapsed'), a: () => {
      if (ED()) ACT.togglePanel();
      else if (DXF_V()) {
        if ($('#dxf-toggle-left-dock')) $('#dxf-toggle-left-dock').click();
        if ($('#dxf-toggle-right-dock')) $('#dxf-toggle-right-dock').click();
      } else {
        const as = $('#view-compare aside');
        if (as) { as.classList.toggle('rp-collapsed'); window.dispatchEvent(new Event('resize')); }
      }
    } },
    { l: 'Full Screen', a: () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen() }
  ],

  Tools: () => [
    { l: 'Auto-Align', ic: 'align', a: () => { ensureCmp(); ACT.align(); } },
    { l: '3-Pt Fiducial', ic: 'fiducial', a: () => { ensureCmp(); if (window.UIRibbon && window.UIRibbon.FiducialAligner) window.UIRibbon.FiducialAligner.start(); } },
    { l: 'Swap A↔B', ic: 'swap', a: () => { ensureCmp(); ACT.swap(); } },
    {
      l: 'Rotate & Mirror',
      ic: 'rotR',
      sub: [
        { l: 'Rotate Rev A 90° Clockwise', ic: 'rotR', a: () => ACT.cRotACW && ACT.cRotACW() },
        { l: 'Rotate Rev B 90° Clockwise', ic: 'rotR', a: () => ACT.cRotBCW && ACT.cRotBCW() },
        { l: 'Mirror Rev A Horizontally', ic: 'flipH', a: () => ACT.cMirAX && ACT.cMirAX() },
        { l: 'Mirror Rev B Horizontally', ic: 'flipH', a: () => ACT.cMirBX && ACT.cMirBX() },
        { l: 'Reset', ic: 'reset', a: () => ACT.cRotReset && ACT.cRotReset() }
      ]
    },
    { l: 'Scan / Re-scan all pages', ic: 'reset', a: ACT.rescan },
    { l: 'Text Diff', ic: 'textDiff', a: () => { ensureCmp(); ACT.textDiff(); } },
    { l: 'Batch Folder Compare', ic: 'open', a: () => { ensureCmp(); ACT.batch(); } },
    '-',
    {
      l: 'Measure (OSNAP)',
      ic: 'ruler',
      sub: [
        { l: 'Calibrate Scale', ic: 'calibrate', a: () => { ensureCmp(); if ($('#rib-calibrate')) $('#rib-calibrate').click(); } },
        { l: 'Distance', ic: 'ruler', a: () => { ensureCmp(); if ($('#rib-dist')) $('#rib-dist').click(); } },
        { l: 'Polyline Run', ic: 'polyline', a: () => { ensureCmp(); if ($('#rib-poly')) $('#rib-poly').click(); } },
        { l: 'Polygon Area', ic: 'area', a: () => { ensureCmp(); if ($('#rib-area')) $('#rib-area').click(); } },
        { l: 'Angle (°)', ic: 'angle', a: () => { if (ED()) { const b = document.querySelector('#mtools [data-t="angle"]'); if (b) b.click(); } else if ($('#rib-angle')) $('#rib-angle').click(); } },
        { l: '3-Pt ⌀/R', ic: 'circle', a: () => { if (ED()) { const b = document.querySelector('#mtools [data-t="rad3"]'); if (b) b.click(); } else if ($('#rib-circle-find')) $('#rib-circle-find').click(); } },
        { l: 'Tally / BOM Badge', ic: 'tally', a: () => { ensureCmp(); if ($('#rib-tally')) $('#rib-tally').click(); } },
        { l: 'Schedule & BOM', ic: 'csv', a: () => { ensureCmp(); if ($('#rib-bom-list')) $('#rib-bom-list').click(); } },
        { l: 'FAI Balloon', ic: 'pin', a: () => { if (ED()) { const b = document.querySelector('#mtools [data-t="fai"]'); if (b) b.click(); } else if ($('#rib-fai-balloon')) $('#rib-fai-balloon').click(); } },
        { l: 'GD&T', ic: 'box', a: () => { if (ED() && $('#eGdtBtn')) $('#eGdtBtn').click(); else if ($('#rib-gdt')) $('#rib-gdt').click(); } }
      ]
    },
    {
      l: 'Markup & Stamps',
      ic: 'revCloud',
      sub: [
        { l: 'Revision Cloud', ic: 'revCloud', a: () => { if (ED()) ACT.tool('cloud'); else if ($('#rib-rev-cloud')) $('#rib-rev-cloud').click(); } },
        { l: 'Leader Callout', ic: 'leader', a: () => { if (ED()) ACT.tool('leader'); else if ($('#rib-leader')) $('#rib-leader').click(); } },
        { l: 'Freehand Pen', ic: 'pen', a: () => { if (ED()) ACT.tool('draw'); else if ($('#rib-pen')) $('#rib-pen').click(); } },
        { l: 'Pin Marker', ic: 'pin', a: () => { if (ED()) ACT.tool('pin'); else if ($('#rib-pin')) $('#rib-pin').click(); } },
        { l: 'Eraser', ic: 'eraser', a: () => { if (ED()) ACT.tool('eraser'); else if ($('#rib-eraser')) $('#rib-eraser').click(); } },
        { l: 'Redact Box', ic: 'redact', a: () => { if (ED()) ACT.tool('redact'); else if ($('#rib-redact')) $('#rib-redact').click(); } },
        { l: 'Title Block', ic: 'table', a: () => { if (ED() && $('#eTitleBlockBtn')) $('#eTitleBlockBtn').click(); else if ($('#rib-title-block')) $('#rib-title-block').click(); } },
        { l: 'Symbols', ic: 'blockLib', a: () => { if (ED() && $('#eBlockLibBtn')) $('#eBlockLibBtn').click(); else if ($('#rib-sym-lib')) $('#rib-sym-lib').click(); } }
      ]
    },
    {
      l: 'CAD & CAM',
      ic: 'pcbCam',
      sub: [
        { l: 'Open Gerber / Drill', ic: 'pcbDual', a: () => { ensureCmp(); if (window.UIRibbon) window.UIRibbon.promptCAMCompare(); } },
        { l: 'CAM Tables', ic: 'pcbCam', a: () => window.showCAMWorkbenchModal && window.showCAMWorkbenchModal('format') },
        { l: 'Run DFM / DRC', ic: 'clearance', a: () => { ensureCmp(); if (window.UIRibbon) window.UIRibbon.runCAMClearanceScan(); } },
        { l: 'Stackup & Z₀', ic: 'zap', a: () => window.openPCBStackupCalculator && window.openPCBStackupCalculator() },
        { l: 'Net Tracer', ic: 'search', a: () => window.openNetTracerModal && window.openNetTracerModal() },
        { l: 'BOM Locator', ic: 'pin', a: () => window.openBOMOverlayModal && window.openBOMOverlayModal() },
        { l: 'Import DXF', ic: 'dxfIn', a: () => window.UIRibbon && window.UIRibbon.promptDXFImport() },
        { l: 'Compare Layers', ic: 'tabCompare', a: () => window.showDXFPreCompareModal && window.showDXFPreCompareModal() },
        { l: 'DXF Layers & Diff', ic: 'layers', a: () => window.showDXFWorkbenchModal && window.showDXFWorkbenchModal('layers') }
      ]
    },
    {
      l: 'PDF Studio',
      ic: 'pdfStudio',
      sub: [
        { l: 'Rotate Left', ic: 'rotL', a: op('rotL') },
        { l: 'Rotate Right', ic: 'rotR', a: op('rotR') },
        { l: 'Flip Horiz', ic: 'flipH', a: op('flipH') },
        { l: 'Flip Vert', ic: 'flipV', a: op('flipV') },
        { l: 'Duplicate', ic: 'copy', a: op('dup') },
        { l: 'New Page', ic: 'blank', a: op('blank') },
        { l: 'Insert PDF', ic: 'insertPdf', a: op('insertpdf') },
        { l: 'Extract PDF', ic: 'extract', a: op('extract') },
        { l: 'Crop Margins', ic: 'crop', a: op('crop') },
        { l: 'Resize Page', ic: 'pageSize', a: op('resize') },
        { l: 'Merge PDFs', ic: 'merge', a: op('merge') },
        { l: 'Split PDF', ic: 'split', a: op('split') },
        { l: 'Images→PDF', ic: 'images', a: op('images') },
        { l: 'Header/Footer', ic: 'headerFooter', a: op('hf') },
        { l: 'Page Numbers', ic: 'pageNums', a: op('nums') },
        { l: 'Watermark', ic: 'watermark', a: op('wm') },
        { l: 'Bates #', ic: 'bates', a: op('bates') },
        { l: 'Flatten PDF', ic: 'flatten', a: op('flatten') },
        { l: 'Optimize', ic: 'zap', a: op('opt') },
        { l: 'Properties', ic: 'info', a: op('meta') }
      ]
    }
  ],

  Settings: () => [
    { l: 'Workstation Settings Page...', ic: 'gear', a: () => window.openWorkstationSettingsModal ? window.openWorkstationSettingsModal('language') : prefs() },
    { l: 'Keyboard Shortcuts...', ic: 'zap', a: () => window.openWorkstationSettingsModal ? window.openWorkstationSettingsModal('shortcuts') : (window.showKeyboardHUD && window.showKeyboardHUD()) },
    '-',
    { l: 'Language & Units (46 Languages)...', ic: 'globe', a: () => window.openWorkstationSettingsModal && window.openWorkstationSettingsModal('language') },
    { l: 'Palette Paper & Theme...', ic: 'sun', a: () => window.openWorkstationSettingsModal && window.openWorkstationSettingsModal('appearance') },
    { l: 'Panels & Workspace Layout...', ic: 'layoutDock', a: () => window.openWorkstationSettingsModal && window.openWorkstationSettingsModal('layout') },
    { l: 'Compare, CAD & Performance...', ic: 'tabCompare', a: () => window.openWorkstationSettingsModal && window.openWorkstationSettingsModal('engine') },
    { l: 'Workstation Defaults & Options...', ic: 'gear', a: () => window.openWorkstationSettingsModal && window.openWorkstationSettingsModal('workstation') },
    '-',
    { l: 'IPC English (mils / inches)', ck: () => window.CAMState && window.CAMState.unitSystem === 'english', a: () => window.setUnitSystem && window.setUnitSystem('english') },
    { l: 'IPC Metric (mm / microns)', ck: () => window.CAMState && window.CAMState.unitSystem === 'metric', a: () => window.setUnitSystem && window.setUnitSystem('metric') },
    '-',
    { l: 'Dark theme', ic: 'moon', ck: () => document.documentElement.dataset.theme === 'dark', a: () => window.setTheme('dark') },
    { l: 'Light theme', ic: 'sun', ck: () => document.documentElement.dataset.theme === 'light', a: () => window.setTheme('light') },
    '-',
    { l: 'Maximum Detail', ck: () => (window.getComparePerfBounds ? window.getComparePerfBounds().MAXDIM === 9000 : true), a: () => { if (window.applyPerformanceMode) window.applyPerformanceMode('detail', true); } },
    { l: 'High Performance', ck: () => (window.getComparePerfBounds ? window.getComparePerfBounds().MAXDIM === 6144 : false), a: () => { if (window.applyPerformanceMode) window.applyPerformanceMode('perf', true); } },
    '-',
    { l: 'Preferences...', ic: 'gear', a: prefs }
  ],

  Help: () => [
    { l: 'Quick guide', ic: 'book', a: guide },
    '-',
    { l: 'Visit Website (textportdocx.in)', ic: 'globe', a: () => window.openExternalUrl && window.openExternalUrl('https://kensho.textportdocx.in') },
    { l: 'Check for Updates...', ic: 'zap', a: () => window.checkForUpdates ? window.checkForUpdates() : (window.openExternalUrl && window.openExternalUrl('https://kensho.textportdocx.in')) },
    '-',
    { l: 'License', ic: 'shield', a: () => window.showTerms && window.showTerms(true) },
    { l: 'About Kensho Pro', ic: 'info', a: () => $('#modal').hidden = false }
  ]
};

let openName = null, dd = null, subDd = null;
function closeSubMenu() { if (subDd) { subDd.remove(); subDd = null; } }
function closeMenu() { closeSubMenu(); if (dd) { dd.remove(); dd = null; } document.querySelectorAll('.mb.open').forEach(b => b.classList.remove('open')); openName = null; }
function showSubMenu(parentBtn, items) {
  closeSubMenu();
  subDd = document.createElement('div');
  subDd.className = 'dd rp-submenu';
  items.forEach(it => {
    if (it === '-') { const s = document.createElement('div'); s.className = 'msep'; subDd.append(s); return; }
    const tr = s => (typeof window !== 'undefined' && window.translateUIString) ? window.translateUIString(s) : s;
    if (it.h) { const h = document.createElement('div'); h.className = 'mh'; h.textContent = tr(it.h); subDd.append(h); return; }
    const b = document.createElement('button'); b.className = 'mi'; b.disabled = !!(it.dis && it.dis()); if (it.tip) b.title = it.tip;
    b.innerHTML = (it.ic ? ic(it.ic) : '<span style="width:16px"></span>') + `<span class="l"></span>`;
    b.querySelector('.l').textContent = tr(it.l);
    b.onclick = e => { e.stopPropagation(); closeMenu(); it.a && it.a(); };
    subDd.append(b);
  });
  document.body.append(subDd);
  const pr = parentBtn.getBoundingClientRect();
  const leftPos = (pr.right + subDd.offsetWidth + 8 < innerWidth) ? (pr.right + 2) : Math.max(4, pr.left - subDd.offsetWidth - 2);
  subDd.style.left = leftPos + 'px';
  subDd.style.top = Math.max(4, Math.min(pr.top, innerHeight - subDd.offsetHeight - 8)) + 'px';
}
function openMenu(name, btn) {
  closeMenu(); openName = name; btn.classList.add('open'); dd = document.createElement('div'); dd.className = 'dd';
  MENUS[name]().forEach(it => {
    if (it === '-') { const s = document.createElement('div'); s.className = 'msep'; dd.append(s); return; }
    const tr = s => (typeof window !== 'undefined' && window.translateUIString) ? window.translateUIString(s) : s;
    if (it.h) { const h = document.createElement('div'); h.className = 'mh'; h.textContent = tr(it.h); dd.append(h); return; }
    const b = document.createElement('button'); b.className = 'mi' + (it.sub ? ' has-sub' : ''); b.disabled = !!(it.dis && it.dis()); if (it.tip) b.title = it.tip;
    b.innerHTML = (it.ck ? `<span class="ck">${it.ck() ? '&#10003;' : ''}</span>` : (it.ic ? ic(it.ic) : '<span style="width:16px"></span>')) + `<span class="l"></span>` + (it.sub ? `<span class="k">&#9656;</span>` : '');
    b.querySelector('.l').textContent = tr(it.l);
    if (it.sub) {
      b.onmouseenter = () => showSubMenu(b, it.sub);
      b.onclick = e => { e.stopPropagation(); showSubMenu(b, it.sub); };
    } else {
      b.onmouseenter = () => closeSubMenu();
      b.onclick = () => { closeMenu(); it.a && it.a(); };
    }
    dd.append(b);
  });
  document.body.append(dd); const r = btn.getBoundingClientRect(); dd.style.left = Math.min(r.left, innerWidth - dd.offsetWidth - 6) + 'px'; dd.style.top = r.bottom + 2 + 'px';
  const h = dd.getBoundingClientRect().height; if (r.bottom + h > innerHeight) dd.style.maxHeight = innerHeight - r.bottom - 10 + 'px', dd.style.overflow = 'auto';
}
const bar = $('#menubar');
Object.keys(MENUS).forEach(n => { const b = document.createElement('button'); b.className = 'mb'; b.dataset.menuKey = n; b.textContent = n; b.onclick = e => { e.stopPropagation(); if (n === 'Settings' && window.openWorkstationSettingsModal) { closeMenu(); window.openWorkstationSettingsModal('language'); return; } openName === n ? closeMenu() : openMenu(n, b); }; b.onmouseenter = () => { if (openName && openName !== n && n !== 'Settings') openMenu(n, b); }; bar.append(b); });
document.addEventListener('click', () => closeMenu()); addEventListener('blur', closeMenu);

// ----- preferences -----
async function prefs() {
  if (typeof window !== 'undefined' && typeof window.openWorkstationSettingsModal === 'function') {
    window.openWorkstationSettingsModal('language');
    return;
  }
  const P = window.PREF;
  const curUnits = (window.CAMState && window.CAMState.unitSystem) || 'english';
  const r = await dialog('Preferences', [
    { type: 'select', id: 'unitSystem', label: 'IPC / CAM Measurement Units', value: curUnits, options: [{ label: 'IPC English (mils / inches)', value: 'english' }, { label: 'IPC Metric (mm / microns)', value: 'metric' }] },
    { type: 'select', id: 'dpi', label: 'Compare quality', value: String(P.dpi), options: [{ label: '150 dpi (fast)', value: '150' }, { label: '200 dpi', value: '200' }, { label: '300 dpi (default)', value: '300' }, { label: '400 dpi', value: '400' }, { label: '600 dpi', value: '600' }] },
    { type: 'select', id: 'perfMode', label: 'Hardware raster ceiling', value: P.perfMode || 'auto', options: [{ label: 'Auto-Detect Hardware (RAM / GPU)', value: 'auto' }, { label: 'Maximum Detail (9000 px / 45 MP)', value: 'detail' }, { label: 'High Performance (6144 px / 25 MP Low-Spec)', value: 'perf' }] },
    { type: 'number', id: 'tol', label: 'Compare tolerance (0-150)', value: P.tol, min: 0, max: 150 }, { type: 'number', id: 'edge', label: 'Edge tolerance (px)', value: P.edge, min: 0, max: 4 }, { type: 'number', id: 'minpx', label: 'Minimum size (px)', value: P.minpx, min: 1, max: 50 },
    { type: 'number', id: 'scanMax', label: 'Scan every page automatically up to', value: P.scanMax, min: 1, max: 500 },
    { type: 'select', id: 'startView', label: 'Open on start', value: P.startView, options: [{ label: 'Compare', value: 'compare' }, { label: 'Editor', value: 'edit' }] },
    { id: 'author', label: 'Your name (for comments)', value: (() => { try { return localStorage.getItem('author') || ''; } catch (e) { return ''; } })() },
    { type: 'checkbox', id: 'confirmSave', label: 'Ask before saving over the original file', value: P.confirmSave },
    { type: 'note', label: 'Quality and tolerance changes apply the next time pages are compared.' }
  ], 'Save');
  if (!r) return;
  if (r.unitSystem && window.setUnitSystem) window.setUnitSystem(r.unitSystem, true);
  Object.assign(P, { dpi: +r.dpi, perfMode: r.perfMode || 'auto', tol: r.tol, edge: r.edge, minpx: r.minpx, scanMax: r.scanMax, startView: r.startView, confirmSave: r.confirmSave }); savePrefs();
  if (window.applyPerformanceMode) window.applyPerformanceMode(P.perfMode, false);
  $('#dpi').value = String(P.dpi); $('#tol').value = P.tol; $('#edge').value = P.edge; $('#minpx').value = P.minpx;
  if ($('#rib-dpi')) $('#rib-dpi').value = String(P.dpi);
  if ($('#rib-view-dpi')) $('#rib-view-dpi').value = String(P.dpi);
  if ($('#rp-diff-thresh')) $('#rp-diff-thresh').value = P.tol;
  if ($('#rp-tol-val')) $('#rp-tol-val').textContent = P.tol;
  if ($('#rp-noise-thresh')) $('#rp-noise-thresh').value = P.minpx;
  if ($('#rp-noise-val')) $('#rp-noise-val').textContent = P.minpx;
  if ($('#rp-edge-thresh')) $('#rp-edge-thresh').value = P.edge;
  if ($('#rp-edge-val')) $('#rp-edge-val').textContent = P.edge;
  try { localStorage.setItem('author', r.author.trim()); } catch (e) {} const a = $('#cAuthor'); if (a) a.value = r.author.trim();
  $('#dpi').dispatchEvent(new Event('change'));
}
ACT.prefs = prefs;

// ----- Complete Option Reference Manual & Quick Guide -----
const COMPLETE_GUIDE_SECTIONS = [
  {
    id: 'menus',
    title: '1. Top Bar & Menu Bar (File, Edit, View, Tools, Settings, Help)',
    rows: [
      ['Top-Left Application Logo & About Button', 'Top Bar Left (#rp-topbar-logo-btn) & Right (i)', 'Displays the Kensho Pro CAD/CAM emblem. Click either the top-left logo or the top-right info icon (i) to open the System Architecture & Build Specification dialog.'],
      ['Compare / PDF Studio / DXF Studio Switcher', 'Top Bar Right (#modes)', 'Switches immediately between the three core engineering environments: (1) Compare & CAM Workbench for A/B drawing & Gerber inspection, (2) PDF Studio for direct text editing, redlining, and page assembly, and (3) DXF Studio for native AutoCAD vector creation and layer editing.'],
      ['Language Selector (46 Languages)', 'Top Bar Right (Language: dropdown)', 'Translates the entire application interface on the fly. Organized into two alphabetical groups: International Languages (A–Z, starting with English International followed by 31 global languages) and Indian Languages (A–Z, 14 Indian languages). Always defaults to English (International) on startup.'],
      ['Theme Toggle (Dark / Light)', 'Top Bar Right (Moon / Sun button)', 'Toggles the entire workstation between the Deep Slate-Navy CAD Dark Theme (optimized for low eye strain during PCB/CAD layout inspection) and the High-Contrast Crisp Paper Light Theme.'],
      ['File → Open Base (A) / Open New (B)', 'File Menu', 'Loads the baseline reference drawing into Slot A (red channel) and the revised target drawing into Slot B (green/blue channel) in the Compare workspace. Supports vector & raster PDFs, AutoCAD DXF, Gerber RS-274X, Excellon Drill, IPC-D-356, and PNG/JPG/TIFF/BMP/WebP images.'],
      ['File → Open PDF in Studio', 'File Menu', 'Switches to PDF Markup Studio and opens a PDF document for direct click-to-write text editing, in-place word replacement, table/equation insertion, GD&T framing, and multi-page assembly.'],
      ['File → Open AutoCAD DXF Studio', 'File Menu', 'Switches to AutoCAD DXF Studio and opens an ASCII DXF drawing (R12 through R2018) directly in the native vector canvas without rasterizing it to pixels.'],
      ['File → Open Gerber / Drill', 'File Menu', 'Opens single or multi-layer PCB CAM packages (Gerber RS-274X copper/soldermask/silkscreen, Excellon NC drill/rout, IPC-D-356 netlists, or multi-file .zip archives) and launches the CAM Stackup Setup dialog.'],
      ['File → Open Recent', 'File Menu → Submenu', 'Lists the 8 most recently opened engineering drawings and project sessions for 1-click reloading, plus a "Clear Recent Drawings" command to reset history.'],
      ['File → Save / Save As / Save .redline / Load .redline', 'File Menu', 'Context-aware save command: in PDF Studio, saves the modified PDF document; in DXF Studio, writes a clean AutoCAD R2000 ASCII .dxf file; in Compare, saves or reloads a portable .redline project session containing all drawings, alignments, defects, and markups.'],
      ['File → Executive Audit PDF', 'File Menu', 'Generates a formal multi-page QA Audit PDF report containing document metadata, SHA-256 cryptographic hashes, annotated visual comparison sheets, magnified defect callout crops, status tallies, and an engineering sign-off block.'],
      ['File → Comparison PDF / High-Res PNG / Defects CSV', 'File Menu', 'Exports the current visual comparison overlay as a standalone PDF report, a full-resolution composite PNG snapshot, or a spreadsheet-ready CSV table listing every defect coordinate (in both IPC English mils and Metric mm) and review status.'],
      ['File → Export QA Package (.zip)', 'File Menu', 'Bundles the Executive Audit PDF, High-Resolution Composite PNG, Defect Schedule CSV, and AutoCAD DXF markup overlay into a single 1-click .zip archive for manufacturing or vendor handover.'],
      ['File → Print / Exit', 'File Menu', 'Prints the active document at full vector resolution or closes the desktop workstation cleanly.'],
      ['Edit → Undo / Redo', 'Edit Menu', 'Steps backward or forward through your action history in Compare (alignment nudges, rotations, markups, ignore masks), PDF Studio (text edits, annotations, page operations), or DXF Studio (entity creation, moves, trims, layer edits).'],
      ['Edit → Find / Ignore Area / Clear All / Preferences...', 'Edit Menu', 'Searches text inside PDF documents, activates the rectangular Ignore Area mask tool in Compare to exclude title block dates from diffing, clears all placed markups on the active sheet, or opens the workstation Preferences dialog (default DPI, unit system, tolerance thresholds, hardware memory ceiling, and reviewer name).'],
      ['View → World View (2D Bird\x27s-Eye Radar & Extents Overview)', 'View Menu & View Ribbon Tab (#rib-world-view-toggle)', 'Turns the interactive World View radar navigator ON or OFF directly from the View menu or View & Enhance ribbon tab. Shows a bird\x27s-eye overview of the entire sheet/CAD drawing with defect hotspots and a live viewport frustum box—click or drag inside World View to pan anywhere instantly.'],
      ['Done, Rewind & Cancel (Drawing Save-Point & Rewind Workflow)', 'Right-Click Context Menu & Active Tool Bar (Compare, PDF Studio, DXF Studio)', 'Concise 3-action workflow while drawing or measuring: (1) Done — commits and saves the current drawn line, polyline, measurement, or markup part as a permanent Save-Point checkpoint and starts a new line/part immediately without leaving the active tool; (2) Rewind — steps back the last clicked point/segment while drawing, or brings back a part that was deleted by Cancel; (3) Cancel — deletes only the unsaved part drawn since the last Done save-point (preserving all previously saved Done parts), or clears and exits the active tool if no unsaved part is active.'],
      ['Settings → Keyboard Shortcuts (Alt+ Defaults, Per-Option Default Reset & Hotkey Editor)', 'Settings → Keyboard Shortcuts Tab', 'All keyboard shortcuts are managed cleanly inside Settings → Keyboard Shortcuts (removed from beside individual tools to keep menus uncluttered). Every option includes an Alt+... default shortcut, a per-option "Default" button to restore that individual shortcut to its Alt+ default, a "Reset All to Defaults" button, and a 1-click "Edit" key recorder so you can customize any shortcut effortlessly.'],
      ['View → Workspaces, Modes, Enhance, Optics, Zoom & Panels', 'View Menu', 'Provides complete control over the active workspace, World View, all 8 visual comparison modes, 4 line-enhancement filters, 4x Loupe / Split Curtain / Reference Grid / Crosshair optics, Zoom In / Zoom Out / Fit Page, PDF Page Thumbnails rail, Night Mode page inversion, and Left/Right Inspector Sidebars.'],
      ['Tools → Compare, Measure, Markup, CAD/CAM & PDF Studio', 'Tools Menu', 'Organized into clean functional submenus giving direct access to Auto-Align, 3-Pt Fiducial, Rotate & Mirror (Rev A/B), Scan All Pages, Text Diff, Batch Folder Compare, Measure (OSNAP), Markup & Stamps, CAD & CAM tools, and PDF Studio page operations.'],
      ['Settings → IPC Units, Theme, Performance Ceiling & Preferences', 'Settings Menu', 'Switches between IPC English (mils / inches) and IPC Metric (mm / microns), toggles Dark vs Light theme, selects Maximum Detail (9000 px / 45 MP) vs High Performance (6144 px / 25 MP) raster ceiling, and opens Preferences.'],
      ['Help → Quick Guide, Website, Check for Updates, License & About', 'Help Menu', 'Opens this detailed Option Reference Manual, visits the official Kensho Studio portal (textportdocx.in), checks for software updates, displays the 100% Free Commercial & Personal Offline License, or opens the System Architecture & About dialog.']
    ]
  },
  {
    id: 'compare',
    title: '2. Compare Workbench — Review & Compare + Layers & Align Tabs',
    rows: [
      ['Open Base (A) & Open New (B)', 'Review & Compare → Files Group', 'Loads the original baseline drawing (Rev A) and revised target drawing (Rev B). You can load PDFs, AutoCAD DXFs, Gerber RS-274X layers, Excellon drill files, or high-res scans—or drag and drop files directly onto Slot A and Slot B on the canvas.'],
      ['Swap A↔B', 'Review & Compare → Files Group', 'Swaps the loaded Base (Rev A) and Revised (Rev B) drawings in place and immediately re-computes the color-coded difference overlay so you can inspect additions vs removals from either direction.'],
      ['Undo & Redo (Compare)', 'Review & Compare → Files Group', 'Reverses or restores alignment shifts, 90° rotations, horizontal/vertical flips, ignore masks, and placed redline markups/measurements on the comparison stage.'],
      ['Mode Dropdown (8 Visual Comparison Modes)', 'Review & Compare → Mode Group (#rib-mode)', 'Selects how Rev A and Rev B are composited: (1) Overlay on Paper renders removed Rev A geometry in crimson red, added Rev B geometry in emerald green, and unchanged geometry in slate gray on white paper; (2) Overlay Dark (CAM) renders high-contrast neon overlays on a dark CAD background; (3) Differences Only isolates changed pixels/vectors and hides unchanged geometry; (4) Side by Side displays synchronized Rev A and Rev B viewports side-by-side; (5) Blink A / B strobes between Rev A and Rev B so subtle shifts pop out visually; (6) Curtain Split Slider enables a draggable wiper bar across the drawing; (7) Base (A) Only shows only Rev A; (8) Revised (B) Only shows only Rev B.'],
      ['DPI Resolution Dropdown (150–600 DPI)', 'Review & Compare → Mode Group (#rib-dpi)', 'Controls the rasterization and pixel-diffing resolution: 150 DPI for rapid multi-page overview, 200/300 DPI for standard engineering drawings, and 400/600 DPI for ultra-fine PCB traces, dense schematics, and micro-typography.'],
      ['Colors (Rev A / Rev B / Common + Opacity)', 'Review & Compare → Colors Group', 'Lets you pick custom highlight colors for Rev A (removed features), Rev B (added features), and Common (unchanged background geometry), plus a continuous opacity slider (10%–100%) to dim unchanged background lines so differences stand out sharply.'],
      ['Auto-Align (Sub-Pixel Registration)', 'Review & Compare → Alignment Group', 'Automatically computes optimal X/Y translation and rotational alignment between Rev A and Rev B—ideal when comparing scanned prints or drawings whose origin shifted between revisions.'],
      ['3-Pt Fiducial Alignment', 'Review & Compare → Alignment Group', 'Interactive 3-point affine registration: click 3 reference monuments (such as board mounting holes, fiducials, or title-block corners) on Rev A and the matching 3 points on Rev B to solve exact translation, rotation, and scale alignment.'],
      ['Rotate & Mirror Group (Target Selector + CCW/Angle/CW + Mirror)', 'Review & Compare → Rotate & Mirror Group', 'First select the target in the dropdown (Rev A, Rev B, or Rev A & B), then click Rotate Counter-Clockwise 90° (↺), pick an exact cardinal angle (0°, 90°, 180°, 270°), click Rotate Clockwise 90° (↻), or click Mirror (Shift+Click for Vertical Flip Y) to align mirrored or rotated sheets.'],
      ['Ignore Area & All Pages / Clear Ignore', 'Review & Compare → Filter Group', 'Click "Ignore Area" and drag a rectangular mask over regions you want excluded from defect detection (such as revision tables, date stamps, or signatures). Check "All Pages" to apply the mask across every sheet in a multi-page PDF, or click "Clear Ignore" to remove masks.'],
      ['Prev Page / Next Page / Scan All Pages / Text Diff', 'Review & Compare → Navigation Group', 'Steps through multi-page PDFs or multi-layer CAM stackups, runs "Scan All Pages" to batch-detect differences across every sheet in the document at once, or opens "Text Diff" for a word-by-word Longest Common Subsequence (LCS) comparison of all text and BOM tables.'],
      ['Layer A, Layer B & Common Visibility + Tint + Opacity', 'Layers & Align → Layers & Channels Groups', 'Provides individual eye toggles to hide/show Layer A, Layer B, or Common geometry, independent opacity sliders (10%–100%), and 6 color-blind-safe palette presets (Red/Green Standard, Cyan/Magenta, Blue/Amber, Gold/Emerald PCB CAM, Purple/Orange, Pink/Teal).'],
      ['Channel Filters (All Diffs / +Added / −Removed / Markers)', 'Layers & Align → Channels Group', 'Isolates only Added geometry (+Added, present in Rev B but not Rev A), only Removed geometry (−Removed, present in Rev A but not Rev B), or toggles bounding-box defect markers on the canvas.'],
      ['Thresholds Group (Threshold / Noise / Edge)', 'Layers & Align → Thresholds Group', 'Fine-tunes the 8-connected defect detector: Threshold (5–140) sets color/luminance sensitivity; Noise (1–15 px) filters out tiny dust specks below N pixels; Edge (0–4 px) suppresses sub-pixel anti-aliasing halo along line edges.'],
      ['Offset & Skew Group (1px / 0.1px X/Y Nudge + Skew A/B + Reset)', 'Layers & Align → Offset & Skew Group', 'Manually nudges Rev B left, right, up, or down in 1-pixel or sub-pixel 0.1-pixel steps, adjusts fine rotational skew (-15° to +15° in 0.05° steps) for both Rev A and Rev B, and resets all offsets to zero with 1 click.']
    ]
  },
  {
    id: 'view_markup',
    title: '3. Compare Workbench — View & Enhance + Markup & Stamps Tabs',
    rows: [
      ['Hardware Memory Ceiling (Maximum Detail vs High Performance)', 'View & Enhance → View & Ceiling Group', 'Selects Maximum Detail (up to 9000 px / 45 MP per sheet for large E-size architectural and dense PCB layouts) or High Performance (6144 px / 25 MP ceiling for rapid rendering on low-RAM laptops).'],
      ['Contrast Filters (Normal / High Contrast / Extra Dark / Blueprint CAD)', 'View & Enhance → Contrast Group', 'Applies real-time image signal processing: Normal shows unfiltered rendering; High Contrast boosts faint grey lines; Extra Dark thickens ultra-fine hairlines on light scans; Blueprint CAD renders drawings in high-contrast inverted blueprint navy.'],
      ['Split Curtain & 4x Loupe', 'View & Enhance → Split & Loupe Group', 'Split Curtain places an interactive vertical/horizontal divider bar across the viewport—drag the handle to wipe smoothly between Rev A and Rev B. 4x Loupe attaches a floating high-magnification optical lens with a crosshair reticle to your cursor.'],
      ['Ref Grid, Crosshair, Markers & Fit & Sharpen', 'View & Enhance → Optics Group', 'Overlays a calibrated mil/mm engineering coordinate grid (Ref Grid), full-viewport X/Y alignment hairlines (Crosshair), toggles difference callout boxes (Markers), or fits the sheet to the window and re-rasterizes vectors at crisp native resolution (Fit & Sharpen).'],
      ['Revision Cloud, Leader Callout, Freehand Pen & Pin Marker', 'Markup & Stamps → Markup Group', 'Draws ANSI/ISO scalloped revision clouds with delta tags (Δ Rev 2), multi-point leader arrows with text callout boxes (double-click to edit text), smooth freehand redline ink strokes, or sequential numbered inspection pin badges (#1, #2, #3...).'],
      ['Eraser, Redact Box & Clear All', 'Markup & Stamps → Erase & Redact Group', 'Eraser removes any clicked markup or scrubs freehand ink strokes using an adjustable brush radius; Redact Box places an opaque black security mask over confidential areas; Clear All removes all markups and measurements on the current sheet.'],
      ['Style Group (Size, 1px–12px Presets, Color Swatches, Alpha %, Dash, Rev Tag)', 'Markup & Stamps → Style Group (#rib-cmp-tool-opts)', 'Configures the active markup tool: set exact stroke width (1–120 px) or click 1px / 3px / 5px / 8px / 12px presets; switch between Whole Markup vs Brush Radius when using the Eraser; pick a custom hex color or 1 of 6 CAD swatches; set opacity (10–100%); choose Solid, Dashed, or Dotted line style; and customize the Revision Cloud tag text.'],
      ['Stamps Group (APPROVED / REJECTED / REVISED / SHA-256 Stamp)', 'Markup & Stamps → Stamps Group', 'Places official engineering QA sign-off stamps onto the drawing, including the cryptographic SHA-256 Stamp which computes and embeds the tamper-evident SHA-256 hash of the active drawing file.']
    ]
  },
  {
    id: 'measure_export',
    title: '4. Compare Workbench — Measure (OSNAP) + Export & Share Tabs',
    rows: [
      ['Calibrate Scale (2-Point Real-World Calibration)', 'Measure (OSNAP) → Scale & Snap Group', 'Click two endpoints of a known dimension on the drawing and enter its true physical length (in mils, inches, mm, cm, m, or ft). All subsequent Distance, Polyline, Area, and Circle measurements automatically convert to that calibrated scale.'],
      ['OSNAP: ON / OFF (8px Magnetic Object Snap)', 'Measure (OSNAP) → Scale & Snap Group', 'Toggles the 8-pixel magnetic object snap engine, which locks your cursor onto vector endpoints, line midpoints, arc/circle centers, and line intersections for zero-error CAD metrology.'],
      ['Distance, Polyline Run & Polygon Area', 'Measure (OSNAP) → Measure Group', 'Distance measures point-to-point linear length, ΔX, ΔY, and angle; Polyline Run measures cumulative multi-segment trace, wire, or piping length (double-click to finish); Polygon Area computes exact closed-loop surface area and perimeter using the Shoelace formula.'],
      ['Tally / BOM Badge & Schedule & BOM Table', 'Measure (OSNAP) → Snap & BOM Group', 'Tally / BOM Badge places sequential numbered count markers on components as you click them; Schedule & BOM opens the complete tabular schedule of all placed measurements and BOM counts with 1-click CSV export.'],
      ['Comparison PDF, High-Res PNG & Export .dxf', 'Export & Share → Export Group', 'Exports a side-by-side/overlay Comparison Report PDF, a high-resolution composite PNG image including all placed markups, or a native AutoCAD .dxf vector file containing the drawing geometry, revision clouds, and measurement callouts.'],
      ['Export QA Package (.zip), Executive Audit PDF & Defects CSV', 'Export & Share → Reports & Audit Group', 'Generates a complete zipped QA handover archive (.zip), a formal multi-page Executive Audit PDF with defect thumbnails and sign-off blocks, or a CSV spreadsheet of all detected defects with physical mil/mm coordinates.'],
      ['Save .redline & Load .redline', 'Export & Share → Session Group', 'Saves or restores your entire review state—including loaded Rev A/B files, alignment offsets, rotations, ignore areas, defect statuses/notes, calibrated scales, and redline markups—in a single portable .redline file.'],
      ['Right Sidebar: Diffs, Text, CAM/DFM & Markups Inspector', 'Compare Right Dock (aside)', 'Provides 4 full-height inspector tabs: Diffs (lists every detected difference region with status filter All/Open/Approved/Flagged/Ignored, Previous/Next/Scan All/All buttons, CSV & Audit PDF buttons), Text (word-by-word text diff), CAM/DFM (layer stackup & DRC violations), and Markups (list of all placed annotations and measurements).']
    ]
  },
  {
    id: 'cam_pcb',
    title: '5. Compare Workbench — CAD & CAM Tab (PCB Gerber RS-274X, Excellon & IPC-D-356)',
    rows: [
      ['Open Gerber / Drill & IPC-D-356 Netlist', 'CAD & CAM → CAM Files Group', 'Loads 1 to 100+ PCB fabrication files (Gerber RS-274X .gbr/.gtl/.gbl/.gko/.gts/.gbs, Excellon NC Drill .drl/.xln, IPC-D-356 netlists .ipc/.d356, or complete .zip CAM archives) and pairs Rev A and Rev B layers automatically.'],
      ['Units (IPC English mils/in vs IPC Metric mm/µm) & Display Mode', 'CAD & CAM → Display Group', 'Switches all CAM readouts, aperture tables, drill schedules, and DFM rules between IPC English (mils/in) and IPC Metric (mm/µm), and switches trace rendering between Filled (true copper width), Outline (wireframe perimeter), and Skeleton (centerline).'],
      ['Mirror Bottom (Flip X) & Negative Plane (LPC)', 'CAD & CAM → Polarity Group', 'Mirror Bottom flips bottom-side copper/silkscreen layers horizontally so they register directly with top-side layers; Negative Plane inverts dark/clear layer polarity for negative power and ground planes.'],
      ['IPC Rule Preset (Class 1 / Class 2 / Class 3 / HDI) & Run DFM / DRC', 'CAD & CAM → DFM & DRC Group', 'Selects IPC-2221 / IPC-6012 manufacturing rules (Class 1 General: 6 mil, Class 2 Dedicated Service: 4 mil, Class 3 High-Reliability Aerospace/Medical: 3 mil, or HDI Microvia: 2 mil) and runs automated spatial-hash DFM checks for trace-to-trace clearance, minimum trace width, annular ring, coincident drills, and acid traps.'],
      ['CAM Tables (PCB CAM Engineering Workbench & IPC Inspector)', 'CAD & CAM → DFM & DRC Group (#rib-cam-tables)', 'Opens the 4-tabbed CAM Engineering Workbench modal: (1) Units, Format & Stackup (zero suppression LZ/TZ, M.N coordinate format 2.4/2.5/3.3/3.4, absolute/incremental G90/G91, soldermask color theme); (2) Apertures (complete D-Code table with shapes, mil/mm sizes, flash & draw counts); (3) NC Drill Tools (T-Code schedule with hole diameters, hit counts, routed G85 slots, and drill travel distance); (4) IPC-D-356 Netlist & custom DFM thresholds.'],
      ['Net Tracer, Stackup & Z₀ Calculator & BOM Locator', 'CAD & CAM → PCB Tools Group', 'Net Tracer highlights complete electrical nets across copper and drill layers; Stackup & Z₀ opens the IPC-2141 Controlled Impedance (Microstrip/Stripline Ω) and IPC-2152 Trace Current & Temperature Rise calculator; BOM Locator imports pick-and-place CSVs to search and cross-probe component centroids (R1, U1, C12).'],
      ['Import DXF, Compare Layers & DXF Studio', 'CAD & CAM → AutoCAD DXF & Studio Group', 'Imports AutoCAD .dxf drawings into Compare, opens the Pre-Compare DXF Layer Selector (to toggle visibility, lock/freeze, or exclude specific CAD layers before diffing), or switches directly into the full AutoCAD DXF Studio editor.']
    ]
  },
  {
    id: 'dxf_studio',
    title: '6. AutoCAD DXF Studio — Native Vector CAD Editor & A/B Layer Diff',
    rows: [
      ['New DXF, Open DXF, Open Rev B, Save .DXF & Active Slot Selector', 'DXF Studio → File Group', 'Starts a clean metric (mm) or imperial (mils/in) CAD sheet, opens a Base DXF (Rev A), loads a second Revised DXF (Rev B) for native vector entity comparison, saves standards-compliant AutoCAD R2000 ASCII .dxf files, and switches between viewing Rev A, Rev B, Vector Diff Overlay (A↔B), or Side-by-Side CAD (A | B).'],
      ['Cursor & Draw Tools: Select, Pan, Line, Polyline, Box, Circle, Arc, Ellipse, Spline', 'DXF Studio → Home & Draw Tab', 'Provides full vector CAD drafting: Select (click entities to inspect properties or drag blue vertex grips to reshape geometry), Pan, Line (2-point segments), Polyline (connected multi-vertex paths), Box (rectangles), Circle (center-radius), Arc (3-point circular arcs), Ellipse, and smooth cubic Splines.'],
      ['Annotate & Hatch Tools: Text, Dimension, Hatch, Point, Block & Extents', 'DXF Studio → Home & Draw Tab', 'Inserts CAD Text/MText annotations, associative linear Dimensions with extension lines and arrows, closed-boundary Hatch patterns, reference Points, Block inserts, or zooms to full drawing Extents.'],
      ['Modify & Construct Tools: Move, Copy, Rotate, Scale, Mirror, Offset, Trim, Extend, Fillet, Explode, Match, Erase', 'DXF Studio → Modify & Construct Tab', 'Complete AutoCAD modification suite: Move, Copy, Rotate, Scale, Mirror across a 2-point axis, Offset parallel lines/arcs by exact distance, Trim or Extend to cutting edges, Fillet corners with an arc radius, Explode blocks/polylines into primitives, Match Properties across entities, or Erase selected geometry.'],
      ['Left Dock: AutoCAD Layers Manager', 'DXF Studio Left Sidebar (#dxf-layer-dock)', 'Lists every DXF layer with live search filtering, 1-click New Layer (+), All On, All Off, Unlock All, Purge Unused Layers, per-layer Visibility (On/Off), Freeze/Thaw, Lock/Unlock, ACI/TrueColor swatch picker, Linetype (Continuous/Dashed/Center/Hidden/Phantom), and Lineweight selector.'],
      ['Right Dock: Entity Properties Inspector, Vector Diff Jump List & Command Bar', 'DXF Studio Right Sidebar & Bottom Command Line', 'Displays and edits exact numeric coordinates (X1, Y1, X2, Y2, Center, Radius, Text, Layer, Color, Lineweight) of selected CAD entities, lists Added/Removed/Modified vector entities when Rev B is loaded, and provides an interactive AutoCAD command prompt (LINE, PLINE, CIRCLE, OFFSET, TRIM, EXTEND, FILLET, EXPLODE, PURGE, ZOOM EXTENTS) at the bottom.']
    ]
  },
  {
    id: 'pdf_studio',
    title: '7. PDF Markup Studio — Direct Text Editing, Typography & Page Assembly',
    rows: [
      ['New Page, Open, Save, Save As, Print, Undo & Redo', 'PDF Studio → File Group (Visible on All Tabs)', 'Creates a new blank A4 engineering sheet, opens existing PDFs into multi-document tabs, saves changes directly or as a new PDF file, prints at full vector resolution, and steps through Undo/Redo history.'],
      ['Tools & Text: Select, Pan, Type Text, Edit Text, Note, Find, Equation & Table', 'PDF Studio → Home Tab', 'Select moves/resizes annotations or selects PDF text; Type Text lets you click anywhere on the page to type new formatted paragraphs; Edit Text edits existing PDF words in-place while preserving font metrics; Note places collapsible sticky notes; Find searches document text; Equation opens the LaTeX/Math Equation Studio; Table inserts an interactive multi-row/column editable table on the page.'],
      ['Font & Paragraph Group + Styles Gallery', 'PDF Studio → Home Tab (#eFontSet)', 'Provides 45+ categorized Engineering, Sans-Serif, Serif, Monospace, International CJK/Arabic/Hebrew, and Indian script fonts + a custom .TTF/.OTF/.WOFF font file loader, font size & preset selector, line spacing, Bold/Italic/Underline/Strikeout, Superscript/Subscript, text color, highlight color, alignment (Left/Center/Right/Justify), bullet/numbered lists, indentation, and 1-click Heading/Title/Callout Quick Styles.'],
      ['Insert & Draw Tab: Pen & Shapes + Active Style Group (#eStyleDock)', 'PDF Studio → Insert & Draw Tab', 'Draws Freehand Pen strokes, Eraser (Whole Markup vs Brush Radius), Box, Circle, Line, Arrow, Polygon, Revision Cloud, and Leader Callout. The adjacent Style group sets stroke thickness (1–120 px + 1px/3px/5px/8px/12px presets), stroke color + 6 swatches, fill color (or transparent no-fill), opacity %, and Solid/Dashed/Dotted line patterns.'],
      ['Insert & Draw Tab: Pins & Stamps + CAD & Symbols', 'PDF Studio → Insert & Draw Tab', 'Inserts numbered Pin Markers, external Images/logos, drawn or typed E-Signatures, QA Stamps (APPROVED/REJECTED/DRAFT/CONFIDENTIAL), Whiteout masks, permanent black Redact boxes, ASME Y14.5 / ISO 1101 GD&T Feature Control Frames, ISO/ANSI Engineering Title Blocks, and standardized Welding/Surface/Fastener symbols.'],
      ['Review & Measure Tab: Notes, Highlights & Calibrated Metrology', 'PDF Studio → Review & Measure Tab', 'Adds PDF review annotations (Sticky Note, Highlight, Underline, Strikeout) synced with the right-hand Comments drawer, and performs calibrated engineering takeoffs directly in PDF Studio: Calibrate Scale, Distance, Polygon Area, Angle (°), 3-Pt Circle/Arc (⌀/R), and AS9102 First Article Inspection (FAI) ballooning.'],
      ['Page Layout Tab: Rotate, Flip, Insert, Duplicate, Delete, Crop, Resize, Margins, Color, Border & Cover Page', 'PDF Studio → Page Layout Tab', 'Rotates pages Left/Right/180°, Flips Horizontally or Vertically, inserts Blank pages or external PDFs, Duplicates or Deletes pages, Crops margins interactively, Resizes sheets to A4/A3/Letter/Legal/ANSI A–E, sets custom Margins, applies Page Background Color or Engineering Borders, inserts a formatted Cover Page, Extracts page ranges, or Reverses page order.'],
      ['Document & Export Tab: Merge, Split, Images→PDF, Header/Footer, Page Numbers, Watermark, Bates #, Flatten, Optimize, Properties & Exports', 'PDF Studio → Document & Export Tab', 'Combines multiple PDFs (Merge PDFs), splits a PDF into separate files, converts PNG/JPG image batches into a PDF, adds Headers/Footers, Page Numbers, diagonal/stamp Watermarks, sequential Bates numbering, Flattens all markups permanently into the page content, Optimizes file size, edits PDF Metadata Properties, exports pages as PNGs or plain text, or sends the PDF directly to Compare Slot A or Slot B.']
    ]
  }
];

const pretty = k => k.split('+').map(p => ({ ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', pageup: 'Page Up', pagedown: 'Page Down', delete: 'Delete', escape: 'Esc', space: 'Space', backspace: 'Backspace', home: 'Home', end: 'End' }[p] || (p.length === 1 ? p.toUpperCase() : p.toUpperCase()))).join('+');
function shortcuts() {
  if (window.showKeyboardHUD) return window.showKeyboardHUD();
  const groups = {}; KEYS.forEach(([k, scope, , g, d]) => { const t = (scope === 'all' ? 'Everywhere' : scope === 'edit' ? 'Editor' : 'Compare') + ' - ' + g; (groups[t] = groups[t] || []).push([k, d]); });
  const html = Object.keys(groups).map(t => `<div class="mh">${t}</div><div class="sh">` + groups[t].map(([k, d]) => `<b>${pretty(k)}</b><span>${d}</span>`).join('') + '</div>').join('');
  dialog('Keyboard shortcuts', [{ type: 'html', label: html }], 'Close');
}

function showQuickGuideModal(initialTab = 'all') {
  if (typeof document === 'undefined') return;
  let existing = document.getElementById('rp-quick-guide-modal');
  if (existing) existing.remove();

  let activeTab = initialTab || 'all';
  let searchQuery = '';

  const modal = document.createElement('div');
  modal.id = 'rp-quick-guide-modal';
  modal.className = 'rp-modal';

  const renderContent = () => {
    const q = searchQuery.trim().toLowerCase();
    const sections = COMPLETE_GUIDE_SECTIONS.filter(s => activeTab === 'all' || s.id === activeTab);

    const secHtml = sections.map(sec => {
      const filteredRows = sec.rows.filter(([name, loc, desc]) => {
        if (!q) return true;
        return name.toLowerCase().includes(q) || loc.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
      });
      if (!filteredRows.length) return '';
      const rowsHtml = filteredRows.map(([name, loc, desc]) => `
        <tr>
          <td class="opt-name">${name}</td>
          <td class="opt-loc">${loc}</td>
          <td class="opt-desc">${desc}</td>
        </tr>`).join('');
      return `
        <div class="rp-guide-sec">
          <div class="rp-guide-sec-head">
            <span>${sec.title}</span>
            <span style="font-size:11px;color:var(--mute);font-weight:600">${filteredRows.length} items</span>
          </div>
          <table class="rp-guide-table">
            <thead>
              <tr>
                <th style="width:23%">Option / Control</th>
                <th style="width:19%">Location</th>
                <th style="width:58%">Detailed Explanation &amp; How to Use It</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>`;
    }).join('');

    return secHtml || `<div style="padding:32px;text-align:center;color:var(--mute);font-size:13px">No options match "${q.replace(/</g, '&lt;')}". Clear the search box or switch to "All Sections".</div>`;
  };

  modal.innerHTML = `
    <div class="rp-guide-card" role="dialog" aria-label="Quick Guide and Complete Option Reference Manual">
      <div class="rp-guide-header">
        <div style="display:flex;align-items:center;gap:12px">
          <img src="build/logo.png" alt="Logo" class="rp-guide-logo">
          <div>
            <h3>Kensho Pro — Complete User Manual &amp; Detailed Option Reference</h3>
            <div style="font-size:11.5px;color:var(--mute);margin-top:2px">Step-by-step guide explaining every menu (File, Edit, View, Tools, Settings, Help), ribbon group, and engineering tool</div>
          </div>
        </div>
        <button type="button" class="rp-about-close" id="rp-guide-close">Close</button>
      </div>
      <div class="rp-guide-toolbar">
        <input type="text" id="rp-guide-search-in" class="rp-guide-search" placeholder="Search any option, menu, tool, or feature (e.g. Fiducial, OSNAP, Gerber, Eraser, Bates, Offset, GD&T, Merge)..." />
        <div class="rp-guide-tabs">
          <button type="button" class="rp-guide-tab ${activeTab === 'all' ? 'on' : ''}" data-gtab="all">All Sections (Complete Manual)</button>
          <button type="button" class="rp-guide-tab ${activeTab === 'menus' ? 'on' : ''}" data-gtab="menus">1. Top Bar &amp; Menus</button>
          <button type="button" class="rp-guide-tab ${activeTab === 'compare' ? 'on' : ''}" data-gtab="compare">2. Compare &amp; Align</button>
          <button type="button" class="rp-guide-tab ${activeTab === 'view_markup' ? 'on' : ''}" data-gtab="view_markup">3. View &amp; Markup</button>
          <button type="button" class="rp-guide-tab ${activeTab === 'measure_export' ? 'on' : ''}" data-gtab="measure_export">4. Measure &amp; Export</button>
          <button type="button" class="rp-guide-tab ${activeTab === 'cam_pcb' ? 'on' : ''}" data-gtab="cam_pcb">5. PCB CAM &amp; IPC</button>
          <button type="button" class="rp-guide-tab ${activeTab === 'dxf_studio' ? 'on' : ''}" data-gtab="dxf_studio">6. AutoCAD DXF Studio</button>
          <button type="button" class="rp-guide-tab ${activeTab === 'pdf_studio' ? 'on' : ''}" data-gtab="pdf_studio">7. PDF Markup Studio</button>
        </div>
      </div>
      <div class="rp-guide-body" id="rp-guide-body-container">
        ${renderContent()}
      </div>
      <div class="rp-about-footer" style="padding-top:6px;flex-shrink:0">
        <span style="font-size:11.5px;color:var(--mute)">Scroll down inside the table above to read all sections, or click any numbered category tab to filter by module.</span>
        <span style="font-size:11.5px;color:var(--mute)">Kensho Pro 1.1.0 &middot; 100% Offline Workstation</span>
      </div>
    </div>`;

  document.body.appendChild(modal);
  if (typeof hydrateIcons === 'function') hydrateIcons(modal);

  const bodyContainer = modal.querySelector('#rp-guide-body-container');
  const searchIn = modal.querySelector('#rp-guide-search-in');
  if (searchIn) {
    searchIn.oninput = () => {
      searchQuery = searchIn.value || '';
      bodyContainer.innerHTML = renderContent();
      bodyContainer.scrollTop = 0;
    };
    setTimeout(() => searchIn.focus(), 30);
  }
  modal.querySelectorAll('[data-gtab]').forEach(btn => {
    btn.onclick = () => {
      activeTab = btn.dataset.gtab;
      modal.querySelectorAll('[data-gtab]').forEach(b => b.classList.toggle('on', b.dataset.gtab === activeTab));
      bodyContainer.innerHTML = renderContent();
      bodyContainer.scrollTop = 0;
    };
  });
  modal.querySelector('#rp-guide-close').onclick = () => modal.remove();
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
}
window.showQuickGuideModal = showQuickGuideModal;
window.rpHelp = () => showQuickGuideModal('all');
function guide() {
  showQuickGuideModal('all');
}

// ----- title, external open, start -----
window.updateTitle = () => {
  let t, d = '';
  if (ED()) {
    const e = E();
    const hasEdFile = !!(e && e.bytes && e.name);
    d = hasEdFile ? e.name + (window.isDirty() ? '  \u2022 unsaved' : '') : '';
    t = (hasEdFile ? e.name + (window.isDirty() ? ' *' : '') + ' - ' : '') + 'Kensho Pro';
  } else if (DXF_V()) {
    const ds = window.DXFState;
    const st = window.DXFStudio && window.DXFStudio.StudioState;
    const hasDxf = !!(ds && (ds.parsedA || ds.parsedB));
    const dxfName = hasDxf ? ((st && st.activeSlot === 'A' ? ds.nameA : ds.nameB) || ds.nameA || ds.nameB || '') : '';
    d = dxfName ? ('DXF Studio: ' + dxfName) : '';
    t = (d ? d + ' - ' : '') + 'Kensho Pro';
  } else {
    d = (S.A && S.B) ? (S.names.A || 'Rev A') + '  vs  ' + (S.names.B || 'Rev B')
      : S.A ? 'Base (A): ' + (S.names.A || 'Loaded')
      : S.B ? 'New (B): ' + (S.names.B || 'Loaded')
      : '';
    t = (d ? d + ' - ' : '') + 'Kensho Pro';
  }
  if (document.title !== t) document.title = t;
  const dn = $('#docname');
  if (dn && dn.textContent !== d) dn.textContent = d;
};
setInterval(() => { if (!document.hidden) window.updateTitle(); }, 2000);
window.openExternal = ({ name, path, b64, slot }) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); if (/\.(kensho|redline)$/i.test(name) && window.UIRibbon && window.UIRibbon.restoreSessionFromText) { setView('compare'); window.UIRibbon.restoreSessionFromText(new TextDecoder().decode(u)); return; } if (/\.(step|stp|sldprt|sldasm|slddrw|stl|obj|kensho3d)$/i.test(name) && window.openSolidWorks3DFile) { window.openSolidWorks3DFile({ name, bytes: u, path }, slot || 'A'); return; } if ((/\.(dxf|dwg)$/i.test(name) || (window.isCAMExt && window.isCAMExt(name))) && window.openExternalCADOrCAM) { window.openExternalCADOrCAM(u, name, path, slot); return; } if (slot) { setView('compare'); compareLoadBytes(slot, u, name, path); return; } setView('edit'); RE.openBytes(u, name, path); };

// ----- Expanded Keyboard Shortcuts Engine -----
const KEYS = [
  // Workspaces & Global
  ['ctrl+1', 'all', () => setView('compare'), 'View', 'Compare & CAM Workbench'],
  ['ctrl+2', 'all', () => setView('edit'), 'View', 'PDF Markup Studio'],
  ['ctrl+3', 'all', () => { if (window.setCADStudioMode) window.setCADStudioMode('2d'); setView('dxf'); }, 'View', 'CAD Studio (2D AutoCAD)'],
  ['ctrl+4', 'all', () => { if (window.setCADStudioMode) window.setCADStudioMode('solidworks'); }, 'View', 'SolidWorks 3D Studio'],
  ['ctrl+o', 'all', () => DXF_V() && $('#dxf-st-open') ? $('#dxf-st-open').click() : (ED() ? ACT.eOpen() : ACT.openA()), 'File', 'Open Drawing (Active Workspace)'],
  ['ctrl+shift+o', 'all', () => { setView('compare'); ACT.openB(); }, 'File', 'Open Revised (Rev B) in Compare'],
  ['ctrl+alt+o', 'all', () => { ensureEd(); ACT.eOpen(); }, 'File', 'Open PDF in PDF Studio'],
  ['ctrl+alt+d', 'all', () => { ensureDxf(); if ($('#dxf-st-open')) $('#dxf-st-open').click(); }, 'File', 'Open AutoCAD DXF in DXF Studio'],
  ['ctrl+shift+g', 'all', () => { ensureCmp(); if (window.UIRibbon && window.UIRibbon.promptCAMCompare) window.UIRibbon.promptCAMCompare(); }, 'File', 'Open PCB CAM Gerber / Drill / IPC-D-356'],
  ['ctrl+s', 'all', () => DXF_V() && window.DXFStudio ? window.DXFStudio.saveModifiedDXFFile() : (ED() ? ACT.eSave() : (window.UIRibbon && window.UIRibbon.saveSessionFile && window.UIRibbon.saveSessionFile())), 'File', 'Save File / Project Session'],
  ['ctrl+shift+s', 'all', () => DXF_V() && window.DXFStudio ? window.DXFStudio.saveModifiedDXFFile() : (ED() ? ACT.eSaveAs() : (window.UIRibbon && window.UIRibbon.loadSessionFile && window.UIRibbon.loadSessionFile())), 'File', 'Save As / Load Session'],
  ['ctrl+k', 'all', () => window.openCommandPaletteModal && window.openCommandPaletteModal(), 'General', 'Command Palette & Memory Manager'],
  ['ctrl+shift+m', 'all', () => window.SmartManager && window.SmartManager.smartPurgeMemory(), 'General', 'Smart Memory Purge'],
  ['ctrl+shift+t', 'compare', () => window.SmartManager && window.SmartManager.autoDismissCosmeticNoise(), 'Differences', 'Auto-Triage: Dismiss Cosmetic Noise'],
  ['ctrl+alt+s', 'compare', () => { if (window.SmartManager) { const id = window.SmartManager.createCheckpoint('Manual Checkpoint'); if (window.rpToast) window.rpToast('Saved Workspace Checkpoint #' + id); } }, 'General', 'Create Workspace Checkpoint'],
  ['ctrl+,', 'all', () => ACT.prefs(), 'General', 'Preferences'],
  ['f1', 'all', () => (window.showKeyboardHUD ? window.showKeyboardHUD() : shortcuts()), 'General', 'Keyboard Shortcuts & Hotkey Editor'],
  ['shift+f1', 'all', () => guide(), 'General', 'Quick Guide & Complete Option Reference'],
  ['?', 'all', () => (window.showKeyboardHUD ? window.showKeyboardHUD() : shortcuts()), 'General', 'Keyboard Shortcuts & Hotkey Editor'],
  ['alt+l', 'all', () => { const sel = $('#rp-lang-sel'); if (sel) sel.focus(); }, 'General', 'Focus Workspace Language Selector'],
  ['f11', 'all', () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(), 'General', 'Full Screen Mode'],
  ['ctrl+shift+d', 'all', () => window.setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'), 'General', 'Toggle Dark / Light Theme'],
  ['ctrl+b', 'all', () => {
    if (ED()) ACT.togglePanel();
    else if (DXF_V()) { if ($('#dxf-toggle-left-dock')) $('#dxf-toggle-left-dock').click(); if ($('#dxf-toggle-right-dock')) $('#dxf-toggle-right-dock').click(); }
    else { const as = $('#view-compare aside'); if (as) { as.classList.toggle('rp-collapsed'); window.dispatchEvent(new Event('resize')); } }
  }, 'View', 'Toggle Inspector Sidebars'],
  ['ctrl+shift+backspace', 'all', () => { if (ED()) ACT.clearMeasure(); else if ($('#rib-clear-markups')) $('#rib-clear-markups').click(); }, 'Edit', 'Clear All Markups & Measurements on Sheet'],
  ['ctrl+0', 'all', () => ED() ? ACT.eFit() : (DXF_V() && window.DXFStudio ? window.DXFStudio.zoomExtents() : ACT.cFit()), 'Zoom', 'Fit Page / Zoom Extents'],
  ['ctrl+9', 'all', () => ED() ? ACT.eFitWidth() : ACT.cFit(), 'Zoom', 'Fit Width'],
  ['ctrl+shift+0', 'all', () => ED() ? ACT.eActual() : ACT.cFit(), 'Zoom', 'Actual Size (100%)'],
  ['ctrl+=', 'all', () => ED() ? ACT.eZoomIn() : (DXF_V() && $('#dxf-st-zi') ? $('#dxf-st-zi').click() : ACT.cZoomIn()), 'Zoom', 'Zoom In'],
  ['ctrl++', 'all', () => ED() ? ACT.eZoomIn() : (DXF_V() && $('#dxf-st-zi') ? $('#dxf-st-zi').click() : ACT.cZoomIn()), 'Zoom', 'Zoom In'],
  ['ctrl+-', 'all', () => ED() ? ACT.eZoomOut() : (DXF_V() && $('#dxf-st-zo') ? $('#dxf-st-zo').click() : ACT.cZoomOut()), 'Zoom', 'Zoom Out'],
  ['escape', 'edit', () => ACT.eEscape(), 'General', 'Back to Select tool, clear selection, close Find'],
  ['escape', 'compare', () => ACT.cEscape(), 'General', 'Stop ignore mode, deselect'],

  // PDF Studio Tools & Page Operations
  ['v', 'edit', () => ACT.tool('select'), 'Tools', 'Select / Move / Select Text'],
  ['e', 'edit', () => ACT.tool('edittext'), 'Tools', 'Edit Existing PDF Text'],
  ['t', 'edit', () => ACT.tool('text'), 'Tools', 'Add Text Box'],
  ['b', 'edit', () => ACT.tool('rect'), 'Tools', 'Rectangle Box'],
  ['o', 'edit', () => ACT.tool('circle'), 'Tools', 'Circle / Ellipse'],
  ['l', 'edit', () => ACT.tool('line'), 'Tools', 'Straight Vector Line'],
  ['a', 'edit', () => ACT.tool('arrow'), 'Tools', 'Directional Arrow'],
  ['p', 'edit', () => ACT.tool('draw'), 'Tools', 'Freehand Pen'],
  ['q', 'edit', () => ACT.tool('pin'), 'Tools', 'Numbered Pin Marker'],
  ['y', 'edit', () => ACT.tool('poly'), 'Tools', 'Polygon / Polyline'],
  ['c', 'edit', () => ACT.tool('cloud'), 'Tools', 'Scalloped Revision Cloud'],
  ['d', 'edit', () => ACT.tool('leader'), 'Tools', 'Leader Callout Arrow'],
  ['z', 'edit', () => ACT.tool('eraser'), 'Tools', 'Eraser Tool'],
  ['w', 'edit', () => ACT.tool('whiteout'), 'Tools', 'Whiteout Mask'],
  ['x', 'edit', () => ACT.tool('redact'), 'Tools', 'True Redaction Box'],
  ['i', 'edit', () => ACT.tool('image'), 'Tools', 'Insert Image'],
  ['g', 'edit', () => ACT.tool('sign'), 'Tools', 'Electronic Signature'],
  ['s', 'edit', () => ACT.tool('stamp'), 'Tools', 'Engineering Stamp'],
  ['h', 'edit', () => ACT.tool('hand'), 'Tools', 'Hand Pan Tool'],
  ['n', 'edit', () => ACT.tool('cnote'), 'Comments', 'Sticky Note'],
  ['j', 'edit', () => ACT.tool('chl'), 'Comments', 'Highlight Text'],
  ['u', 'edit', () => ACT.tool('cul'), 'Comments', 'Underline Text'],
  ['k', 'edit', () => ACT.tool('cst'), 'Comments', 'Strikeout Text'],
  ['m', 'edit', () => ACT.tool('measure'), 'Tools', 'Measure Distance'],
  ['ctrl+p', 'edit', () => ACT.op('print'), 'File', 'Print Document'],
  ['ctrl+z', 'all', () => ED() ? ACT.eUndo() : (DXF_V() && window.DXFStudio ? window.DXFStudio.undo() : (ACT.cUndo && ACT.cUndo())), 'Edit', 'Undo'],
  ['ctrl+y', 'all', () => ED() ? ACT.eRedo() : (DXF_V() && window.DXFStudio ? window.DXFStudio.redo() : (ACT.cRedo && ACT.cRedo())), 'Edit', 'Redo'],
  ['ctrl+shift+z', 'all', () => ED() ? ACT.eRedo() : (DXF_V() && window.DXFStudio ? window.DXFStudio.redo() : (ACT.cRedo && ACT.cRedo())), 'Edit', 'Redo'],
  ['ctrl+f', 'edit', () => ACT.find(), 'Edit', 'Find in Document'],
  ['f3', 'edit', () => ACT.findStep(1), 'Edit', 'Next Search Match'],
  ['shift+f3', 'edit', () => ACT.findStep(-1), 'Edit', 'Previous Search Match'],
  ['delete', 'edit', () => { if (!ACT.eDeleteAnn()) return false; }, 'Edit', 'Delete Selected Item'],
  ['backspace', 'edit', () => { if (!ACT.eDeleteAnn()) return false; }, 'Edit', 'Delete Selected Item'],
  ['ctrl+delete', 'edit', () => ACT.op('del'), 'Pages', 'Delete Selected Pages'],
  ['ctrl+a', 'edit', () => ACT.op('selAll'), 'Pages', 'Select All Pages'],
  ['ctrl+r', 'edit', () => ACT.op('rotR'), 'Pages', 'Rotate Page Right 90°'],
  ['ctrl+shift+r', 'edit', () => ACT.op('rotL'), 'Pages', 'Rotate Page Left 90°'],
  ['ctrl+d', 'edit', () => ACT.op('dup'), 'Pages', 'Duplicate Page'],
  ['ctrl+shift+b', 'edit', () => ACT.op('blank'), 'Pages', 'Insert Blank Page'],
  ['ctrl+shift+p', 'edit', () => ACT.toggleThumbs(), 'View', 'Toggle Page Thumbnails'],
  ['ctrl+shift+n', 'edit', () => ACT.night(), 'View', 'Night Mode (Invert Page Colors)'],
  ['ctrl+alt+m', 'edit', () => ACT.op('merge'), 'Document', 'Merge Multiple PDFs'],
  ['ctrl+alt+s', 'edit', () => ACT.op('split'), 'Document', 'Split PDF Document'],
  ['ctrl+alt+c', 'edit', () => ACT.op('crop'), 'Pages', 'Crop Page Margins'],
  ['ctrl+alt+h', 'edit', () => ACT.op('hf'), 'Document', 'Header and Footer'],
  ['ctrl+alt+w', 'edit', () => ACT.op('wm'), 'Document', 'Add Watermark'],
  ['pageup', 'edit', () => ACT.ePage(-1), 'Pages', 'Previous Page'],
  ['pagedown', 'edit', () => ACT.ePage(1), 'Pages', 'Next Page'],
  ['ctrl+home', 'edit', () => ACT.eFirst(), 'Pages', 'First Page'],
  ['ctrl+end', 'edit', () => ACT.eLast(), 'Pages', 'Last Page'],
  ['ctrl+g', 'edit', () => ACT.eGotoDialog(), 'Pages', 'Go to Page'],

  // Compare & CAM Workbench
  ['n', 'compare', () => (window.UIRibbon && window.UIRibbon.DefectState && window.UIRibbon.DefectState.defects.length ? window.UIRibbon.DefectState.next() : ACT.nextDiff()), 'Differences', 'Next Defect (Auto-center & Zoom)'],
  ['f3', 'compare', () => (window.UIRibbon && window.UIRibbon.DefectState && window.UIRibbon.DefectState.defects.length ? window.UIRibbon.DefectState.next() : ACT.nextDiff()), 'Differences', 'Next Defect (Auto-center & Zoom)'],
  ['p', 'compare', () => (window.UIRibbon && window.UIRibbon.DefectState && window.UIRibbon.DefectState.defects.length ? window.UIRibbon.DefectState.prev() : ACT.prevDiff()), 'Differences', 'Previous Defect'],
  ['shift+f3', 'compare', () => (window.UIRibbon && window.UIRibbon.DefectState && window.UIRibbon.DefectState.defects.length ? window.UIRibbon.DefectState.prev() : ACT.prevDiff()), 'Differences', 'Previous Defect'],
  ['space', 'compare', () => {
    if (S.mode === 'A') ACT.cMode(6);
    else if (S.mode === 'B') ACT.cMode(5);
    else if (S.mode === 'blink') { S.phase ^= 1; if (typeof paint === 'function') paint(); if (window.rpSharpen) window.rpSharpen(); }
    else ACT.cMode(4);
  }, 'Navigation & Diff', 'Instant Blink Toggle (A / B)'],
  ['shift+space', 'compare', () => ACT.markAll(), 'Differences', 'Mark All on Page Reviewed'],
  ['f', 'compare', () => { ACT.cFit(); if (window.rpSharpen) window.rpSharpen(); }, 'View', 'Fit Drawing to Viewport & Re-Sharpen Vectors'],
  ['m', 'compare', () => ACT.toggleMarkers(), 'View', 'Show / Hide Difference Markers'],
  ['1', 'compare', () => ACT.cMode(0), 'View modes', 'Overlay on Paper'],
  ['2', 'compare', () => ACT.cMode(1), 'View modes', 'Overlay Dark (CAM)'],
  ['3', 'compare', () => ACT.cMode(2), 'View modes', 'Differences Only'],
  ['4', 'compare', () => ACT.cMode(3), 'View modes', 'Side by Side'],
  ['5', 'compare', () => ACT.cMode(4), 'View modes', 'Blink A / B'],
  ['6', 'compare', () => ACT.cMode(5), 'View modes', 'Base (Rev A) Only'],
  ['7', 'compare', () => ACT.cMode(6), 'View modes', 'Revised (Rev B) Only'],
  ['ctrl+a', 'compare', () => ACT.align(), 'Alignment', 'Auto-Align Drawings'],
  ['a', 'compare', () => ACT.align(), 'Actions', 'Auto-Align Drawings'],
  ['s', 'compare', () => ACT.swap(), 'Actions', 'Swap Rev A and Rev B'],
  ['i', 'compare', () => ACT.ignore(), 'Actions', 'Draw Ignore Area Mask'],
  ['r', 'compare', () => ACT.rescan(), 'Actions', 'Re-Scan All Pages'],
  ['alt+r', 'compare', () => { if ($('#rib-rot-cw')) $('#rib-rot-cw').click(); else if (ACT.cRotABCW) ACT.cRotABCW(); }, 'Alignment', 'Rotate Active Target Revision 90° CW'],
  ['alt+shift+r', 'compare', () => { if ($('#rib-rot-ccw')) $('#rib-rot-ccw').click(); }, 'Alignment', 'Rotate Active Target Revision 90° CCW'],
  ['alt+m', 'compare', () => { if (window.showCAMPreCompareModal) window.showCAMPreCompareModal(); }, 'CAM', 'Open Multi-Layer CAM Stack Setup'],
  ['alt+d', 'compare', () => { if (window.UIRibbon && window.UIRibbon.runCAMClearanceScan) window.UIRibbon.runCAMClearanceScan(); }, 'CAM', 'Run IPC Class 1/2/3 DFM Clearance Scan'],
  ['alt+n', 'compare', () => { if (window.openNetTracerModal) window.openNetTracerModal(); }, 'CAM', 'Open PCB Net Connectivity Tracer'],
  ['shift+g', 'compare', () => { if ($('#rib-angle')) $('#rib-angle').click(); }, 'Measure', '3-Point Angle Protractor'],
  ['shift+c', 'compare', () => { if ($('#rib-circle-find')) $('#rib-circle-find').click(); }, 'Measure', '3-Point Circle / Arc Finder'],
  ['shift+f', 'compare', () => { if ($('#rib-fai-balloon')) $('#rib-fai-balloon').click(); }, 'Measure', 'AS9102 FAI Auto-Balloon'],
  ['alt+g', 'compare', () => { if ($('#rib-gdt')) $('#rib-gdt').click(); }, 'Measure', 'GD&T Feature Control Frame Builder'],
  ['alt+b', 'compare', () => { if ($('#rib-title-block')) $('#rib-title-block').click(); }, 'Markup', 'ISO/ANSI Title Block Stamp'],
  ['alt+s', 'compare', () => { if ($('#rib-sym-lib')) $('#rib-sym-lib').click(); }, 'Markup', 'Engineering Symbol Library'],
  ['delete', 'compare', () => { if (!ACT.hasIgnoreSel()) return false; ACT.delIgnoreSel(); }, 'Actions', 'Delete Selected Ignore Area'],
  ['backspace', 'compare', () => { if (!ACT.hasIgnoreSel()) return false; ACT.delIgnoreSel(); }, 'Actions', 'Delete Selected Ignore Area'],
  ['ctrl+e', 'compare', () => ACT.savePng(), 'Export', 'Save Comparison Image (PNG)'],
  ['ctrl+shift+e', 'compare', () => ACT.report(), 'Export', 'Comparison Report (PDF)'],
  ['ctrl+shift+c', 'compare', () => ACT.saveCsv(), 'Export', 'Differences List (CSV)'],
  ['left', 'compare', () => ACT.cPage(-1), 'Pages', 'Previous Page'],
  ['right', 'compare', () => ACT.cPage(1), 'Pages', 'Next Page'],
  ['pageup', 'compare', () => ACT.cPage(-1), 'Pages', 'Previous Page'],
  ['pagedown', 'compare', () => ACT.cPage(1), 'Pages', 'Next Page'],
  ['ctrl+home', 'compare', () => ACT.cFirst(), 'Pages', 'First Page'],
  ['ctrl+end', 'compare', () => ACT.cLast(), 'Pages', 'Last Page'],
  ['ctrl+g', 'compare', () => ACT.cGotoDialog(), 'Pages', 'Go to Page']
];
const KMAP = {}; KEYS.forEach(r => (KMAP[r[0]] = KMAP[r[0]] || []).push(r));
function keyOf(e) {
  let k = e.key; if (k === ' ') k = 'space'; else if (k.length === 1) k = k.toLowerCase(); else k = k.toLowerCase().replace('arrow', '');
  const c = e.ctrlKey || e.metaKey, symbol = k.length === 1 && !/[a-z0-9]/.test(k);
  return (c ? 'ctrl+' : '') + (e.altKey ? 'alt+' : '') + (e.shiftKey && !symbol ? 'shift+' : '') + k;
}
addEventListener('keydown', e => {
  const settingsModal = document.getElementById('rp-settings-page-modal');
  if (e.key === 'Escape' && settingsModal) { settingsModal.remove(); return; }
  const guideModal = document.getElementById('rp-quick-guide-modal');
  if (e.key === 'Escape' && guideModal) { guideModal.remove(); return; }
  const updModal = document.getElementById('rp-update-prompt-modal');
  if (e.key === 'Escape' && updModal) { updModal.remove(); return; }
  if (e.key === 'Escape' && !$('#modal').hidden) { $('#modal').hidden = true; return; }
  if (e.key === 'Escape') closeMenu();
  const hudModal = $('#rp-keyboard-hud-modal');
  if (!$('#dlg').hidden || !$('#modal').hidden || guideModal || (hudModal && !hudModal.hidden) || e.isComposing) return;
  const k = keyOf(e);
  const activeViewScope = SW_V() ? 'solidworks' : (ED() ? 'edit' : (DXF_V() ? 'dxf' : 'compare'));
  if (window.ShortcutManager) {
    const reassignedAway = window.ShortcutManager.getAllItems().some(it =>
      (it.scope === activeViewScope || it.scope === 'all') &&
      window.ShortcutManager.normalizeKeyStr(it.defaultKey) === k &&
      window.ShortcutManager.isCustomized(it.id)
    );
    if (reassignedAway) return;
  }
  const list = KMAP[k]; if (!list) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable, ctrl = k.startsWith('ctrl+');
  if (typing && (!ctrl || /^ctrl\+(shift\+)?[acvxyz]$/.test(k))) return;
  if (document.body.dataset.view === 'edit' && ctrl === false && getSelection && !getSelection().isCollapsed && ['delete', 'backspace'].includes(k)) return;
  const row = list.find(r => r[1] === 'all' || r[1] === activeViewScope); if (!row) return;
  if (row[2]() === false) return; e.preventDefault();
});
const closeAboutModal = () => {
  $('#modal').hidden = true;
  if (document.activeElement && $('#modal').contains(document.activeElement) && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }
};
$('#close').onclick = closeAboutModal;
$('#modal').onclick = e => { if (e.target.id === 'modal') closeAboutModal(); };
if ($('#about-btn')) $('#about-btn').onclick = () => { $('#modal').hidden = false; };
if ($('#brand-about')) $('#brand-about').onclick = () => { $('#modal').hidden = false; };
const APP_CURRENT_VERSION = '1.2.3.2';
const APP_BUILD_VERSION = 'O1R0A7N5G0E002026A1232';
const UPDATE_MANIFEST_URL = 'https://kensho.textportdocx.in/version.json';

function compareSemver(vRemote, vLocal) {
  const parse = v => String(v || '').replace(/^[^0-9]*/, '').split('.').map(n => parseInt(n, 10) || 0);
  const a = parse(vRemote), b = parse(vLocal);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}
window.compareSemver = compareSemver;

function showUpdateAvailablePrompt(manifest, isManual = false) {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('rp-update-prompt-modal');
  if (existing) existing.remove();

  const remoteVer = (manifest && manifest.version) ? String(manifest.version) : '1.2.0';
  const relDate = (manifest && manifest.releaseDate) ? ` &middot; Released ${manifest.releaseDate}` : '';
  const notes = (manifest && manifest.notes) ? String(manifest.notes) : 'Performance improvements, bug fixes, and updated CAD/CAM & PDF tools.';
  const isLinux = (window.native && window.native.platform === 'linux');
  const dlUrl = (isLinux && manifest && manifest.linuxDownloadUrl)
    ? manifest.linuxDownloadUrl
    : ((manifest && manifest.downloadUrl) || (manifest && manifest.websiteUrl) || 'https://kensho.textportdocx.in');

  const modal = document.createElement('div');
  modal.id = 'rp-update-prompt-modal';
  modal.className = 'rp-modal';
  modal.innerHTML = `
    <div class="rp-card" style="width:min(520px,94vw);padding:20px 22px;gap:12px" role="dialog" aria-label="Software Update Available">
      <div style="display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--line);padding-bottom:10px">
        <img src="build/logo.png" alt="Logo" style="width:42px;height:42px;border-radius:8px;border:1px solid var(--line2)">
        <div>
          <div style="display:flex;align-items:center;gap:8px">
            <h3 style="margin:0;font-size:16px;font-weight:700;color:var(--ink)">New Update Available</h3>
            <span class="rp-about-badge" style="background:rgba(16,185,129,0.15)!important;color:#10b981!important;border-color:rgba(16,185,129,0.4)!important">v${remoteVer}</span>
          </div>
          <div style="font-size:11.5px;color:var(--mute);margin-top:2px">Installed Version: <b>v${APP_CURRENT_VERSION}</b>${relDate}</div>
        </div>
      </div>
      <div style="font-size:12.5px;line-height:1.5;color:var(--ink);background:var(--panel2);border:1px solid var(--line2);border-radius:6px;padding:10px 12px">
        <b style="display:block;margin-bottom:4px;color:var(--acc)">What's New in Kensho Pro v${remoteVer}:</b>
        <span>${notes.replace(/</g, '&lt;')}</span>
      </div>
      <div style="font-size:11.5px;color:var(--mute)">Would you like to download and install the update now, or remind you later?</div>
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;padding-top:6px;border-top:1px solid var(--line)">
        <button type="button" class="rp-about-btn" id="rp-upd-later-btn" style="height:30px;padding:0 14px">Update Later</button>
        <button type="button" class="rp-about-close" id="rp-upd-now-btn" style="height:30px;padding:0 16px;background:#0284c7!important;border-color:#0284c7!important">Update Now</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.querySelector('#rp-upd-later-btn').onclick = () => {
    try { sessionStorage.setItem('rp_update_dismissed_' + remoteVer, '1'); } catch (e) {}
    modal.remove();
  };
  modal.querySelector('#rp-upd-now-btn').onclick = () => {
    modal.remove();
    if (window.openExternalUrl) window.openExternalUrl(dlUrl);
  };
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
}
window.showUpdateAvailablePrompt = showUpdateAvailablePrompt;

async function fetchWebsiteUpdateManifest() {
  if (window.native && typeof window.native.checkUpdate === 'function') {
    const res = await window.native.checkUpdate(UPDATE_MANIFEST_URL);
    if (res && res.ok && res.data && res.data.version) return res.data;
  }
  if (typeof fetch === 'function') {
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 5000) : null;
      const resp = await fetch(UPDATE_MANIFEST_URL + '?_t=' + Date.now(), {
        signal: ctrl ? ctrl.signal : undefined,
        cache: 'no-store'
      });
      if (timer) clearTimeout(timer);
      if (resp && resp.ok) {
        const data = await resp.json();
        if (data && data.version) return data;
      }
    } catch (e) {}
  }
  return null;
}

window.checkForUpdates = async (opts = {}) => {
  const silent = !!(opts && opts.silent);
  const manifest = await fetchWebsiteUpdateManifest();
  if (manifest && manifest.version) {
    const cmp = compareSemver(manifest.version, APP_CURRENT_VERSION);
    if (cmp > 0) {
      if (silent) {
        try {
          if (sessionStorage.getItem('rp_update_dismissed_' + manifest.version) === '1') return;
        } catch (e) {}
      }
      showUpdateAvailablePrompt(manifest, !silent);
      return;
    }
    if (!silent) {
      const r = await dialog('Up to Date — Kensho Pro', [
        { type: 'html', label: `<div style="display:flex;flex-direction:column;gap:8px"><div><b>You are running the latest version:</b> Kensho Pro v${APP_CURRENT_VERSION}</div><div><b>Official Website:</b> <a href="https://kensho.textportdocx.in" class="rp-ext-link">https://kensho.textportdocx.in</a></div></div>` }
      ], 'Visit Website');
      if (r && window.openExternalUrl) window.openExternalUrl('https://kensho.textportdocx.in');
    }
    return;
  }

  if (!silent) {
    const r = await dialog('Check for Updates — Kensho Pro', [
      { type: 'html', label: `<div style="display:flex;flex-direction:column;gap:8px"><div><b>Installed Version:</b> Kensho Pro v${APP_CURRENT_VERSION} (Build 2026.11 &middot; 64-Bit Desktop Workstation)</div><div><b>Update Server:</b> <a href="https://kensho.textportdocx.in" class="rp-ext-link">https://kensho.textportdocx.in</a></div><div style="color:var(--mute);font-size:12px">Could not reach <code>https://kensho.textportdocx.in/version.json</code> (you may be offline or <code>version.json</code> is not uploaded yet). Click below to open the release page in your browser.</div></div>` }
    ], 'Visit kensho.textportdocx.in');
    if (r && window.openExternalUrl) window.openExternalUrl('https://kensho.textportdocx.in');
  }
};

// Zero-telemetry offline guarantee: update checks run strictly on explicit user action (Help -> Check for Updates)
if ($('#about-website-btn')) $('#about-website-btn').onclick = () => { if (window.openExternalUrl) window.openExternalUrl('https://kensho.textportdocx.in'); };
if ($('#about-updates-btn')) $('#about-updates-btn').onclick = () => { $('#modal').hidden = true; window.checkForUpdates(); };
if ($('#about-guide-btn')) $('#about-guide-btn').onclick = () => { $('#modal').hidden = true; guide(); };
if ($('#about-shortcuts-btn')) $('#about-shortcuts-btn').onclick = () => { $('#modal').hidden = true; shortcuts(); };
if ($('#about-license-btn')) $('#about-license-btn').onclick = () => { $('#modal').hidden = true; if (window.showTerms) window.showTerms(true); };
if ($('#about-copy-btn')) $('#about-copy-btn').onclick = async () => {
  const units = (window.CAMState && window.CAMState.unitSystem === 'metric') ? 'IPC Metric (mm/µm)' : 'IPC English (mil/in)';
  const theme = document.documentElement.dataset.theme || 'dark';
  const dpi = ($('#dpi') && $('#dpi').value) || '300';
  const lang = ($('#rp-lang-sel') && $('#rp-lang-sel').value) || 'en';
  const info = [
    'Kensho Pro — Version 1.1.0 (Build 2026.11 · 64-Bit Offline Workstation)',
    'Publisher: Kensho Studio · textportdocx.in',
    'License: Perpetual Commercial & Personal Use (100% Local Offline / Zero Telemetry)',
    'Engines: PDF.js + PDF-Lib Vector Core · AutoCAD DXF R12–R2018 · PCB CAM Gerber RS-274X / Excellon / IPC-D-356A · OSNAP Measure',
    'Active Configuration: ' + dpi + ' DPI · ' + units + ' · Language: ' + lang + ' · Theme: ' + theme
  ].join('\n');
  try { if (window.native && window.native.copyText) await window.native.copyText(info); else await navigator.clipboard.writeText(info); } catch (e) {}
  const lbl = $('#about-copy-lbl');
  if (lbl) { lbl.textContent = 'Copied!'; setTimeout(() => { lbl.textContent = 'Copy Diagnostics'; }, 1800); }
};
const TIP = { 'pin': 'Pin Marker Badge (Q)', 'eraser': 'Eraser (Z)', 'select': 'Select (V)', 'edittext': 'Edit text (E)', 'text': 'Text (T)', 'rect': 'Box (B)', 'line': 'Line (L)', 'arrow': 'Arrow (A)', 'draw': 'Pen (P)', 'whiteout': 'Whiteout (W)', 'redact': 'Redact (X)', 'image': 'Image (I)', 'sign': 'Signature (G)', 'stamp': 'Stamp (S)', 'cnote': 'Note (N)', 'chl': 'Highlight (J)', 'cul': 'Underline (U)', 'cst': 'Strikeout (K)', 'measure': 'Measure (M)' };
document.querySelectorAll('[data-t]').forEach(b => { if (!b.title && TIP[b.dataset.t]) b.title = TIP[b.dataset.t]; });
const BT = { eSave: 'Save (Ctrl+S)', eSaveAs: 'Save as (Ctrl+Shift+S)', eUndo: 'Undo (Ctrl+Z)', eRedo: 'Redo (Ctrl+Y)', eFind: 'Find (Ctrl+F)', eOpen: 'Open (Ctrl+O)', openA: 'Open A (Ctrl+O)', openB: 'Open B (Ctrl+Shift+O)', align: 'Auto-align (A)', swap: 'Swap A and B (S)', ignBtn: 'Draw an ignore area (I). Right-click an area to delete it', report: 'Comparison report (Ctrl+Shift+E)', png: 'Save image (Ctrl+E)', csv: 'Differences list (Ctrl+Shift+C)', prevD: 'Previous difference (P)', nextD: 'Next difference (N)', eFit: 'Fit page (Ctrl+0)', eZi: 'Zoom in (Ctrl +)', eZo: 'Zoom out (Ctrl -)' };
Object.keys(BT).forEach(id => { const el = document.getElementById(id); if (el) el.title = BT[id]; });
hydrateIcons();
const urlView = (typeof location !== 'undefined' && location.search) ? new URLSearchParams(location.search).get('view') : null;
if (urlView === 'edit' || urlView === 'studio') setView('edit');
else if (urlView === 'dxf') setView('dxf');
else if (urlView === 'cam') { setView('compare'); setTimeout(() => { const b = document.querySelector('[data-tab="tab-cad"], [data-rib-tab="cam"]'); if (b) b.click(); }, 60); }
else if (urlView === 'compare') setView('compare');
else if (PREF.startView === 'edit') setView('edit');
window.updateTitle();
})();
