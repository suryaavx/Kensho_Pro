/**
 * Kensho Pro 1.0 — Comprehensive Automated Verification Test Suite
 * Tests all 6 modules:
 * 1. Categorized Ribbon & UI State
 * 2. Precision Auto-Alignment & Jump-to-Defect Navigator
 * 3. Offline Bi-Directional CAD (DXF) Engine
 * 4. Industrial PCB CAM (Gerber RS-274X & Excellon Drill) Engine
 * 5. Engineering Measurement & Markup Suite (OSNAP)
 * 6. Virtual Viewport Memory Optimization & Audit Reporting
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT_DIR = fs.existsSync(path.resolve(__dirname, '../package.json'))
  ? path.resolve(__dirname, '..')
  : path.resolve(__dirname, '..', '..');

console.log('====================================================');
console.log('   KENSHO PRO 1.0 AUTOMATED VERIFICATION SUITE     ');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Error: ${err.message}`);
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
  }
}

async function testAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Error: ${err.message}`);
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
  }
}

(async () => {
  // ----------------------------------------------------
  // MODULE 3: CAD (DXF) ENGINE TESTS
  // ----------------------------------------------------
  console.log('\n--- MODULE 3: CAD (DXF) Engine ---');
  const DXF = require(path.join(ROOT_DIR, 'dxf_engine.js'));

  test('DXFWriter initializes with correct unit scales', () => {
    const wMM = new DXF.DXFWriter({ unit: 'mm', scale: 1.0 });
    assert.strictEqual(wMM.unitInfo.code, 4);
    assert.strictEqual(wMM.unitInfo.name, 'Millimeters');

    const wMils = new DXF.DXFWriter({ unit: 'mils', scale: 1.0 });
    assert.strictEqual(wMils.unitInfo.code, 10);
    assert.strictEqual(wMils.unitInfo.name, 'Mils');

    const wIn = new DXF.DXFWriter({ unit: 'in', scale: 1.0 });
    assert.strictEqual(wIn.unitInfo.code, 1);
    assert.strictEqual(wIn.unitInfo.name, 'Inches');
  });

  test('DXFWriter generates AutoCAD 2000 compliant ASCII DXF with layers', () => {
    const writer = new DXF.DXFWriter({ unit: 'mm', scale: 1.0 });
    writer.addLine(0, 0, 100, 100, 'GEOMETRY');
    writer.addCircle(50, 50, 20, 'GEOMETRY');
    writer.addRect(0, 0, 500, 300, 'SHEET_BORDER');
    writer.addText('Schematic Revision 2.1', 20, 20, 12, 0, 'TEXT');
    writer.addSolid([10, 10], [20, 10], [20, 20], [10, 20], 'REDLINE_DIFFS');

    const dxfStr = writer.generateString();
    assert(dxfStr.includes('AC1015'), 'Header must declare AutoCAD 2000 (AC1015)');
    assert(dxfStr.includes('$INSUNITS'), 'Header must declare $INSUNITS');
    assert(dxfStr.includes('SHEET_BORDER'), 'Must contain SHEET_BORDER layer');
    assert(dxfStr.includes('GEOMETRY'), 'Must contain GEOMETRY layer');
    assert(dxfStr.includes('TEXT'), 'Must contain TEXT layer');
    assert(dxfStr.includes('REDLINE_DIFFS'), 'Must contain REDLINE_DIFFS layer');
    assert(dxfStr.endsWith('0\r\nEOF\r\n'), 'Must terminate with standard 0 EOF');
  });

  test('DXFParser successfully parses LINE, CIRCLE, LWPOLYLINE, TEXT and computes bounding box', () => {
    const writer = new DXF.DXFWriter({ unit: 'mm', scale: 1.0 });
    writer.addLine(10, 20, 110, 120, 'GEOMETRY');
    writer.addCircle(60, 70, 25, 'GEOMETRY');
    writer.addRect(0, 0, 200, 150, 'SHEET_BORDER');
    writer.addText('BOARD_OUTLINE', 15, 25, 10, 0, 'TEXT');

    const dxfStr = writer.generateString();
    const parser = new DXF.DXFParser(dxfStr).parse();

    assert.strictEqual(parser.entities.length, 4, 'Must parse exactly 4 entities');
    assert.strictEqual(parser.entities[0].type, 'LINE');
    assert.strictEqual(parser.entities[1].type, 'CIRCLE');
    assert.strictEqual(parser.entities[2].type, 'LWPOLYLINE');
    assert.strictEqual(parser.entities[3].type, 'TEXT');
    assert.strictEqual(parser.entities[3].text, 'BOARD_OUTLINE');
    assert(parser.bounds.maxX > parser.bounds.minX, 'Bounds must be valid positive area');
  });

  // ----------------------------------------------------
  // MODULE 4: INDUSTRIAL PCB CAM ENGINE TESTS
  // ----------------------------------------------------
  console.log('\n--- MODULE 4: Industrial PCB CAM Engine ---');
  const CAM = require(path.join(ROOT_DIR, 'cam_engine.js'));

  test('GerberParser parses coordinate formats (%FS%), units (%MO%), and apertures (%ADD%)', () => {
    const gerberData = [
      '%FSLAX24Y24*%',
      '%MOIN*%',
      '%ADD10C,0.010*%',
      '%ADD11R,0.050X0.025*%',
      '%ADD12O,0.060X0.030*%',
      '%ADD13P,0.040X6*%',
      'D10*',
      'X010000Y010000D02*',
      'X020000Y010000D01*',
      'D11*',
      'X030000Y020000D03*',
      'M02*'
    ].join('\n');

    const parser = new CAM.GerberParser(gerberData).parse();
    assert.strictEqual(parser.units, 'IN');
    assert.strictEqual(parser.format.zeroSuppression, 'L');
    assert.strictEqual(parser.format.xInt, 2);
    assert.strictEqual(parser.format.xDec, 4);

    assert(parser.apertures.has(10), 'Aperture D10 must be registered');
    assert.strictEqual(parser.apertures.get(10).type, 'C');
    assert.strictEqual(parser.apertures.get(11).type, 'R');
    assert.strictEqual(parser.apertures.get(12).type, 'O');
    assert.strictEqual(parser.apertures.get(13).type, 'P');

    assert.strictEqual(parser.commands.length, 2, 'Must contain 1 DRAW and 1 FLASH command');
    assert.strictEqual(parser.commands[0].op, 'DRAW');
    assert.strictEqual(parser.commands[0].x1, 1.0);
    assert.strictEqual(parser.commands[0].x2, 2.0);
    assert.strictEqual(parser.commands[1].op, 'FLASH');
    assert.strictEqual(parser.commands[1].x, 3.0);
    assert.strictEqual(parser.commands[1].y, 2.0);
  });

  test('Excellon NC Drill Parser parses tools (T01C...) and hit coordinates', () => {
    const drillData = [
      'M48',
      'INCH',
      'T01C0.032',
      'T02C0.040',
      'T03C0.062',
      '%',
      'T01',
      'X1.0000Y1.0000',
      'X1.5000Y1.0000',
      'T02',
      'X2.0000Y2.0000',
      'T03',
      'X3.0000Y3.0000',
      'M30'
    ].join('\n');

    const parser = new CAM.ExcellonParser(drillData).parse();
    assert.strictEqual(parser.units, 'INCH');
    assert.strictEqual(parser.tools.size, 3);
    assert.strictEqual(parser.tools.get(1), 0.032);
    assert.strictEqual(parser.tools.get(2), 0.040);
    assert.strictEqual(parser.tools.get(3), 0.062);

    assert.strictEqual(parser.hits.length, 4, 'Must parse exactly 4 drill hits');
    assert.strictEqual(parser.hits[0].tool, 1);
    assert.strictEqual(parser.hits[0].x, 1.0);
    assert.strictEqual(parser.hits[2].tool, 2);
    assert.strictEqual(parser.hits[2].x, 2.0);
  });

  // ----------------------------------------------------
  // MODULE 5: MEASUREMENT & OSNAP ENGINE TESTS
  // ----------------------------------------------------
  console.log('\n--- MODULE 5: Engineering Measurement & OSNAP Suite ---');
  const Measure = require(path.join(ROOT_DIR, 'measure_engine.js'));

  test('CalibrationManager computes real-world dimensions and formatted readouts', () => {
    const cal = new Measure.CalibrationManager();
    cal.setCalibration(100, 25.4, 'mm'); // 100 pixels = 25.4 mm (1 inch)
    assert.strictEqual(cal.formatDistance(100), '25.40 mm');
    assert.strictEqual(cal.formatDistance(200), '50.80 mm');

    cal.setCalibration(100, 1000, 'mils');
    assert.strictEqual(cal.formatDistance(100), '1000.000 mils');
  });

  test('OSNAPManager snaps to nearest endpoints, midpoints, and center points', () => {
    const osnap = new Measure.OSNAPManager(8);
    osnap.addLine(0, 0, 100, 0);
    osnap.addRect(200, 200, 50, 50);
    osnap.addCircle(400, 400, 20);

    // Near endpoint (0, 0)
    const snap1 = osnap.snap(3, 2, 1.0);
    assert.strictEqual(snap1.type, 'endpoint');
    assert.strictEqual(snap1.x, 0);
    assert.strictEqual(snap1.y, 0);

    // Near midpoint (50, 0)
    const snap2 = osnap.snap(52, 1, 1.0);
    assert.strictEqual(snap2.type, 'midpoint');
    assert.strictEqual(snap2.x, 50);
    assert.strictEqual(snap2.y, 0);

    // Near rect center (225, 225)
    const snap3 = osnap.snap(226, 224, 1.0);
    assert.strictEqual(snap3.type, 'center');
    assert.strictEqual(snap3.x, 225);
    assert.strictEqual(snap3.y, 225);

    // Outside snap radius (> 8px)
    const snapNone = osnap.snap(800, 800, 1.0);
    assert.strictEqual(snapNone.type, null);
  });

  test('Geometric calculations (Polyline Length & Polygon Shoelace Area)', () => {
    const poly = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }];
    const length = Measure.calcPolylineLength(poly);
    assert.strictEqual(length, 70, '30 + 40 = 70');

    // Right triangle 30 x 40 -> Area = 600
    const tri = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }];
    const area = Measure.calcPolygonArea(tri);
    assert.strictEqual(area, 600, 'Triangle area should be 600');
  });

  test('Tally & BOM Counter places inspection badges and generates CSV export', () => {
    const tally = new Measure.TallyManager();
    tally.addItem(100, 150, 1, 'Inspect capacitor C1');
    tally.addItem(200, 250, 1, 'Verify resistor R14 value');
    tally.addItem(300, 350, 2, 'Check ground plane clearance');

    assert.strictEqual(tally.items.length, 3);
    assert.strictEqual(tally.items[0].number, 1);
    assert.strictEqual(tally.items[1].number, 2);
    assert.strictEqual(tally.items[2].number, 3);

    const csv = tally.toCSV();
    assert(csv.includes('Number,Page,X,Y,Description,Timestamp'), 'CSV header present');
    assert(csv.includes('Inspect capacitor C1'), 'Item 1 in CSV');
    assert(csv.includes('Verify resistor R14 value'), 'Item 2 in CSV');
  });

  await testAsync('Cryptographic SHA-256 document hashing works reliably', async () => {
    const testBuf = Buffer.from('Kensho Pro 2.1 Confidential Engineering Review');
    const hash = await Measure.computeDocumentSHA256(testBuf.buffer);
    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(hash.length, 16, 'SHA-256 high-order checksum length must be 16 hex chars');
  });

  // ----------------------------------------------------
  // MODULE 6: VIRTUAL TILING & WEB WORKER TESTS
  // ----------------------------------------------------
  console.log('\n--- MODULE 6: Virtual Viewport Memory Optimization ---');
  const WE = require(path.join(ROOT_DIR, 'worker_engine.js'));

  test('VirtualTileManager computes visible 512x512 tiles and disposes off-screen tiles', () => {
    const tm = new WE.VirtualTileManager({ tileSize: 512, maxCachedTiles: 4 });
    const visible = tm.getVisibleTiles(0, 0, 1024, 768, 4000, 3000, 1.0);

    assert(visible.length > 0, 'Must produce visible tile coordinates');
    assert.strictEqual(visible[0].w, 512);
    assert.strictEqual(visible[0].h, 512);

    // Simulate allocating canvases
    for (const t of visible) {
      tm.getOrCreateTileCanvas(t.key, t.w, t.h);
    }
    assert(tm.tileCache.size <= 4, 'LRU cache must prune to maxCachedTiles');
  });

  // ----------------------------------------------------
  // MODULE 1 & 2: DEFECT NAVIGATOR & UI STATE TESTS
  // ----------------------------------------------------
  console.log('\n--- MODULE 1 & 2: Defect Navigator & Session State ---');
  const UI = require(path.join(ROOT_DIR, 'ui_ribbon.js'));

  test('DefectState groups regions, filters noise, and manages review checklist', () => {
    const mockRegions = [
      { type: 'added', x: 100, y: 100, w: 20, h: 20, pixelCount: 400 },
      { type: 'removed', x: 250, y: 150, w: 15, h: 10, pixelCount: 150 },
      { type: 'added', x: 400, y: 300, w: 1, h: 1, pixelCount: 1 } // Noise pixel!
    ];

    UI.DefectState.noiseThreshold = 3;
    UI.DefectState.initFromRegions(mockRegions);

    assert.strictEqual(UI.DefectState.defects.length, 2, 'Single-pixel noise must be filtered out');
    assert.strictEqual(UI.DefectState.defects[0].status, 'Open');
    assert.strictEqual(UI.DefectState.currentIndex, 0);

    UI.DefectState.next();
    assert.strictEqual(UI.DefectState.currentIndex, 1);

    UI.DefectState.setStatus(1, 'Approved');
    assert.strictEqual(UI.DefectState.defects[1].status, 'Approved');

    UI.DefectState.prev();
    assert.strictEqual(UI.DefectState.currentIndex, 0);
  });

  // ----------------------------------------------------
  // METADATA & INTEGRITY TESTS
  // ----------------------------------------------------
  console.log('\n--- METADATA & INTEGRITY CHECKS ---');

  test('Package metadata matches Version 1.2.3 and Kensho Studio', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    assert.strictEqual(pkg.name, 'kensho-pro');
    assert.strictEqual(pkg.version, '1.2.3');
    assert.strictEqual(typeof pkg.author === 'object' ? pkg.author.name : pkg.author, 'Kensho Studio');
    assert(pkg.description.includes('textportdocx.in'));
  });

  test('NSIS Installer script matches Version 1.2.3 and VIProductVersion 1.2.3.0', () => {
    const nsi = fs.readFileSync('installer.nsi', 'utf8');
    assert(nsi.includes('!define VERSION "1.2.3"'));
    assert(nsi.includes('VIProductVersion "1.2.3.0"'));
    assert(nsi.includes('Kensho Studio - textportdocx.in'));
  });

  test('All JavaScript codebase modules compile with zero syntax errors', () => {
    const vm = require('vm');
    const jsFiles = [
      'main.js', 'preload.js', 'pre.js', 'icons.js', 'app.js', 'editor.js',
      'menu.js', 'extras.js', 'pro.js', 'ui_ribbon.js', 'dxf_engine.js',
      'cam_engine.js', 'measure_engine.js', 'worker_engine.js', 'worker.js', 'patch_exe.js',
      'dxf_compare_core.js', 'dxf_studio_tools.js', 'compare_memory_guard.js', 'ui_i18n_catalog.js'
    ];
    for (const file of jsFiles) {
      const code = fs.readFileSync(file, 'utf8');
      assert.doesNotThrow(() => {
        new vm.Script(code, { filename: file });
      }, `Syntax error in ${file}`);
    }
  });

  test('Index.html loads all new v2.1 modules in strict offline order', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert(html.includes('dxf_engine.js'), 'Must load dxf_engine.js');
    assert(html.includes('cam_engine.js'), 'Must load cam_engine.js');
    assert(html.includes('measure_engine.js'), 'Must load measure_engine.js');
    assert(html.includes('worker_engine.js'), 'Must load worker_engine.js');
    assert(html.includes('ui_ribbon.js'), 'Must load ui_ribbon.js');
    assert(html.includes('Version 1.2.3'), 'Modal must show Version 1.2.3');
    assert(html.includes('rp-about-card'), 'About modal must include enterprise .rp-about-card layout');
    assert(html.includes('rp-about-grid'), 'About modal must include 6-module capability grid');
    assert(html.includes('about-guide-btn') && html.includes('about-shortcuts-btn') && html.includes('about-license-btn') && html.includes('about-copy-btn'), 'About modal must include interactive footer buttons');
    assert(html.includes('rp-cmp-open-a-btn') && html.includes('rp-cmp-open-b-btn'), 'Empty start screen must include Open Base (A) and Open Revised (B) buttons');
    assert(!html.includes('rp-sample-schematic-btn') && !html.includes('rp-sample-gerber-btn') && !html.includes('rp-edit-sample-btn'), 'Start screens must not display built-in sample buttons');
  });

  // ----------------------------------------------------
  // COMMERCIAL POLISH REFINEMENTS (NSIS, SAMPLES, HUD)
  // ----------------------------------------------------
  console.log('\n--- COMMERCIAL POLISH REFINEMENTS ---');

  test('NSIS Installer contains updated Kensho Pro context menus, .dxf/.gbr shell associations, and clean uninstallation keys', () => {
    const nsi = fs.readFileSync('installer.nsi', 'utf8');
    // Updated PDF context menus
    assert(nsi.includes('WriteRegStr HKCU "Software\\Classes\\SystemFileAssociations\\.pdf\\shell\\KenshoEdit" "" "Edit with Kensho Pro"'), 'Must set Edit with Kensho Pro');
    assert(nsi.includes('WriteRegStr HKCU "Software\\Classes\\SystemFileAssociations\\.pdf\\shell\\KenshoCompare" "" "Compare with Kensho Pro"'), 'Must set Compare with Kensho Pro');
    assert(!nsi.includes('"Edit with Redline"'), 'Legacy Edit with Redline string must be replaced');
    assert(!nsi.includes('"Compare with Redline"'), 'Legacy Compare with Redline string must be replaced');

    // CAD (.dxf) and CAM (.gbr) SystemFileAssociations
    assert(nsi.includes('Software\\Classes\\SystemFileAssociations\\.dxf\\shell\\KenshoInspectCAD" "" "Inspect CAD with Kensho Pro"'), 'Must register .dxf Inspect CAD with Kensho Pro');
    assert(nsi.includes('Software\\Classes\\SystemFileAssociations\\.dxf\\shell\\KenshoInspectCAD\\command" "" \'"$INSTDIR\\${APPEXE}" "%1"\''), 'Must pass "%1" to .dxf command');
    assert(nsi.includes('Software\\Classes\\SystemFileAssociations\\.gbr\\shell\\KenshoInspectGerber" "" "Inspect Gerber with Kensho Pro"'), 'Must register .gbr Inspect Gerber with Kensho Pro');
    assert(nsi.includes('Software\\Classes\\SystemFileAssociations\\.gbr\\shell\\KenshoInspectGerber\\command" "" \'"$INSTDIR\\${APPEXE}" "%1"\''), 'Must pass "%1" to .gbr command');

    // Clean uninstallation registry keys
    assert(nsi.includes('DeleteRegKey HKCU "Software\\Classes\\SystemFileAssociations\\.pdf\\shell\\KenshoEdit"'), 'Uninstall must remove RedlineEdit');
    assert(nsi.includes('DeleteRegKey HKCU "Software\\Classes\\SystemFileAssociations\\.pdf\\shell\\KenshoCompare"'), 'Uninstall must remove RedlineCompare');
    assert(nsi.includes('DeleteRegKey HKCU "Software\\Classes\\SystemFileAssociations\\.dxf\\shell\\KenshoInspectCAD"'), 'Uninstall must remove .dxf RedlineInspectCAD');
    assert(nsi.includes('DeleteRegKey HKCU "Software\\Classes\\SystemFileAssociations\\.gbr\\shell\\KenshoInspectGerber"'), 'Uninstall must remove .gbr RedlineInspectGerber');
  });

  await testAsync('Sample Schematic Generator dynamically builds 2-page Rev A & Rev B vector PDFs 100% offline', async () => {
    const specA = UI.SampleGenerator.getSchematicSpec(false);
    const specB = UI.SampleGenerator.getSchematicSpec(true);

    assert.strictEqual(specA.pages, 2);
    assert.strictEqual(specA.fuse, 'FUSE 10A');
    assert.strictEqual(specA.resistor.id, 'R1');
    assert.strictEqual(specA.resistor.value, '10k\u03A9');
    assert.strictEqual(specA.capacitors[0].id, 'C1');
    assert.strictEqual(specA.capacitors[0].value, '100\u00B5F');
    assert.strictEqual(specA.gndRail.label, 'GND rail');

    assert.strictEqual(specB.pages, 2);
    assert.strictEqual(specB.fuse, 'FUSE 16A');
    assert.strictEqual(specB.resistor.relocated, true);
    assert.notStrictEqual(specA.resistor.x, specB.resistor.x, 'R1 must be relocated in Rev B');
    assert.strictEqual(specB.capacitors.length, 2, 'Rev B must include added C2 filter cap');
    assert.strictEqual(specB.capacitors[1].id, 'C2');
    assert.strictEqual(specB.capacitors[1].value, '10\u00B5F');
    assert.notStrictEqual(specA.testpoint, specB.testpoint, 'Testpoint label must change in Rev B');

    const pdfBytesA = await UI.SampleGenerator.generateSampleSchematicPDF(false);
    const pdfBytesB = await UI.SampleGenerator.generateSampleSchematicPDF(true);
    assert(pdfBytesA instanceof Uint8Array && pdfBytesA.length > 1000, 'Rev A PDF bytes must be valid');
    assert(pdfBytesB instanceof Uint8Array && pdfBytesB.length > 1000, 'Rev B PDF bytes must be valid');

    const PDFLib = require(path.join(ROOT_DIR, 'lib/pdf-lib.min.js'));
    const docA = await PDFLib.PDFDocument.load(pdfBytesA);
    const docB = await PDFLib.PDFDocument.load(pdfBytesB);
    assert.strictEqual(docA.getPageCount(), 2, 'Rev A schematic must have 2 pages');
    assert.strictEqual(docB.getPageCount(), 2, 'Rev B schematic must have 2 pages');
  });

  test('Sample PCB Gerber & Excellon Drill Generator produces valid CAM layers and flags 4-mil clearance violation', () => {
    const gbrA = UI.SampleGenerator.generateSampleGerberCopper(false);
    const gbrB = UI.SampleGenerator.generateSampleGerberCopper(true);
    const drl = UI.SampleGenerator.generateSampleExcellonDrill();
    const drc = UI.SampleGenerator.verifyClearanceViolation();

    const parsedGbrA = new CAM.GerberParser(gbrA).parse();
    const parsedGbrB = new CAM.GerberParser(gbrB).parse();
    const parsedDrl = new CAM.ExcellonParser(drl).parse();

    assert(parsedGbrA.commands.length >= 6, 'Copper Gerber A must have traces and pads');
    assert(parsedGbrB.commands.length > parsedGbrA.commands.length, 'Copper Gerber B must include violation trace');
    assert(parsedDrl.hits.length >= 6, 'Excellon drill file must contain drill hits matching pads');
    assert.strictEqual(drc.ruleMils, 4.0);
    assert.strictEqual(drc.hasViolation, true, 'Must flag 4-mil clearance spacing violation');
    assert(drc.measuredMils < 4.0, 'Measured clearance must be < 4.0 mils');
  });

  test('Interactive Keyboard Shortcut HUD (F1 / ?) renders all required Navigation, Diff & Alignment hotkeys', () => {
    const hudHtml = UI.buildKeyboardHUDHTML();
    assert(hudHtml.includes('Navigation &amp; Diff'), 'Must contain Navigation & Diff section');
    assert(hudHtml.includes('Alignment &amp; Tools'), 'Must contain Alignment & Tools section');
    assert(hudHtml.includes('Next Defect (Auto-center &amp; Zoom)') || hudHtml.includes('Next Defect (Auto-center & Zoom)'));
    assert(hudHtml.includes('Previous Defect'));
    assert(hudHtml.includes('Instant Blink Toggle (A / B)'));
    assert(hudHtml.includes('Toggle Interactive Curtain Split Slider'));
    assert(hudHtml.includes('Fit Drawing to Viewport &amp; Re-Sharpen Vectors') || hudHtml.includes('Fit Drawing to Viewport & Re-Sharpen Vectors'));
    assert(hudHtml.includes('Precision Full-Viewport Crosshair Toggle'));
    assert(hudHtml.includes('Auto-Align Drawings'));
    assert(hudHtml.includes('Toggle 8px Magnetic Object Snap (OSNAP)'));
    assert(hudHtml.includes('Collapse / Expand Sidebar'));
    assert(hudHtml.includes('Compare Workspace  |  Editor Workspace'));
  });

  test('Background Anti-Throttling, PowerSaveBlocker & Windows Taskbar Progress hooks are configured', () => {
    const mainJs = fs.readFileSync('main.js', 'utf8');
    const preloadJs = fs.readFileSync('preload.js', 'utf8');
    const appJs = fs.readFileSync('app.js', 'utf8');
    const proJs = fs.readFileSync('pro.js', 'utf8');

    // Chromium command-line switches in main.js
    assert(mainJs.includes('powerSaveBlocker'), 'main.js must import powerSaveBlocker');
    assert(mainJs.includes("app.commandLine.appendSwitch('disable-background-timer-throttling')"), 'Must disable background timer throttling');
    assert(mainJs.includes("app.commandLine.appendSwitch('disable-renderer-backgrounding')"), 'Must disable renderer backgrounding');
    assert(mainJs.includes("app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')"), 'Must disable occluded window backgrounding');
    assert(mainJs.includes('backgroundThrottling: false'), 'BrowserWindow webPreferences must set backgroundThrottling: false');
    assert(mainJs.includes("powerSaveBlocker.start('prevent-app-suspension')"), 'Must start prevent-app-suspension powerSaveBlocker');
    assert(mainJs.includes('win.setProgressBar('), 'Must update Windows Taskbar progress via win.setProgressBar');

    // Preload IPC bridge
    assert(preloadJs.includes('setProgress:'), 'preload.js must expose setProgress');
    assert(preloadJs.includes('setBusyLock:'), 'preload.js must expose setBusyLock');

    // Unthrottled MessageChannel tick & progress forwarding
    assert(appJs.includes('MessageChannel'), 'app.js must use unthrottled MessageChannel tick');
    assert(proJs.includes('window.native.setProgress'), 'pro.js must forward progress to taskbar via window.native.setProgress');
    assert(proJs.includes('window.native.setBusyLock'), 'pro.js must toggle powerSaveBlocker via window.native.setBusyLock');
  });


  test("PCB CAM IPC English (mils/in) & Metric (mm/um) UnitConverter converts and formats accurately", () => {
    assert(Math.abs(CAM.UnitConverter.convert(100, "MILS", "MM") - 2.54) < 1e-4, "100 mils must equal 2.54 mm");
    assert(Math.abs(CAM.UnitConverter.convert(2.54, "MM", "MILS") - 100) < 1e-4, "2.54 mm must equal 100 mils");
    assert.strictEqual(CAM.UnitConverter.format(0.004, "english", 1), "4.0 mil");
    assert.strictEqual(CAM.UnitConverter.format(0.004, "metric", 3), "0.102 mm");
  });

  test("GerberParser supports G36/G37 polygon copper pours and generates PCB CAM D-Code Aperture Table", () => {
    const gbrWithPour = [
      "%FSLAX24Y24*%",
      "%MOMM*%",
      "%ADD10C,0.254*%",
      "%ADD11R,1.270X1.270*%",
      "G36*",
      "X00000Y00000D02*",
      "X100000Y00000D01*",
      "X100000Y100000D01*",
      "X00000Y100000D01*",
      "X00000Y00000D01*",
      "G37*",
      "D11*",
      "X050000Y050000D03*",
      "M02*"
    ].join("\n");
    const p = new CAM.GerberParser(gbrWithPour).parse();
    assert.strictEqual(p.units, "MM");
    assert(p.commands.some(c => c.op === "REGION"), "Must parse G36/G37 polygon region");
    const apTable = p.getApertureTable();
    assert.strictEqual(apTable.length, 2);
    assert.strictEqual(apTable[0].dCode, "D10");
    assert(Math.abs(apTable[0].widthMils - 10.0) < 0.1, "0.254 mm must convert to 10.0 mils in D-Code table");
    assert.strictEqual(apTable[1].flashes, 1);
  });

  test("ExcellonParser parses G85 routed slots and generates PCB CAM T-Code Drill Schedule", () => {
    const drlMetric = [
      "M48",
      "METRIC,LZ",
      ";FILE_FORMAT=3:3",
      "T01C0.800",
      "T02C1.000",
      "%",
      "T01",
      "X010.000Y010.000",
      "X020.000Y010.000",
      "T02",
      "X030.000Y010.000G85X035.000Y010.000",
      "M30"
    ].join("\n");
    const dp = new CAM.ExcellonParser(drlMetric).parse();
    assert.strictEqual(dp.units, "METRIC");
    assert.strictEqual(dp.hits.length, 2);
    assert.strictEqual(dp.slots.length, 1);
    const tTable = dp.getToolTable();
    assert.strictEqual(tTable.length, 2);
    assert.strictEqual(tTable[0].tCode, "T01");
    assert.strictEqual(tTable[0].diaMM, 0.8);
    assert(Math.abs(tTable[0].diaMils - 31.5) < 0.1);
    assert.strictEqual(tTable[1].slots, 1);
  });

  test("IPCD356Parser parses CUST 0 (English mils) & CUST 1 (Metric mm) netlists and detects netlist diffs", () => {
    const ipcEng = UI.SampleGenerator.generateSampleIPCD356Netlist(false);
    const ipcMet = UI.SampleGenerator.generateSampleIPCD356Netlist(true);
    const pEng = new CAM.IPCD356Parser(ipcEng).parse();
    const pMet = new CAM.IPCD356Parser(ipcMet).parse();

    assert.strictEqual(pEng.units, "MILS");
    assert.strictEqual(pMet.units, "MM");
    assert.strictEqual(pEng.records.length, 6);
    assert.strictEqual(pMet.records.length, 6);
    assert(Math.abs(pEng.records[0].xIn - pMet.records[0].xIn) < 1e-3, "English and Metric IPC-D-356 coordinates must match in physical inches");

    const diffsSame = CAM.IPCD356Parser.compareNetlists(pEng, pMet, 2.0);
    assert.strictEqual(diffsSame.length, 0, "Identical physical netlists in English vs Metric must have 0 diffs");
  });

  test("CAMCompare runs IPC Class 1/2/3 DFM checks (Min Trace Width, Annular Ring, Coincident Drill, Acid Trap)", () => {
    const gbr = new CAM.GerberParser([
      "%FSLAX24Y24*%",
      "%MOIN*%",
      "%ADD10C,0.0030*%",
      "%ADD11C,0.0400*%",
      "D11*",
      "X010000Y010000D03*",
      "D10*",
      "X010000Y010000D02*",
      "X015000Y010000D01*",
      "X011000Y011000D01*",
      "M02*"
    ].join("\n")).parse();
    const drl = new CAM.ExcellonParser([
      "M48",
      "INCH",
      "T01C0.036",
      "%",
      "T01",
      "X1.0000Y1.0000",
      "X1.0000Y1.0000",
      "M30"
    ].join("\n")).parse();

    const cmp = new CAM.CAMCompare(800, 600);
    const violations = cmp.runDFMChecks(gbr, drl, CAM.IPC_DFM_RULES.class2);
    assert(violations.some(v => v.category === "MIN_TRACE_WIDTH"), "Must detect 3.0 mil trace < 4.0 mil Class 2 rule");
    assert(violations.some(v => v.category === "ANNULAR_RING"), "Must detect 2.0 mil annular ring < 3.5 mil Class 2 rule");
    assert(violations.some(v => v.category === "COINCIDENT_DRILL"), "Must detect coincident duplicate drill hits");
    assert(violations.some(v => v.category === "ACID_TRAP"), "Must detect acute angle acid trap");
  });

  test("UIRibbon setUnitSystem toggles cleanly between IPC English (mils) and IPC Metric (mm)", () => {
    UI.setUnitSystem("metric", true);
    assert.strictEqual(UI.CAMState.unitSystem, "metric");
    assert(UI.CAMState.formatDimFromPx(300, 300).includes("25.40 mm"));

    UI.setUnitSystem("english", true);
    assert.strictEqual(UI.CAMState.unitSystem, "english");
    assert(UI.CAMState.formatDimFromPx(300, 300).includes("1000.0 mil"));
  });


  test("CompareHistory (Ctrl+Z / Ctrl+Y) accurately records and reverses Compare actions", () => {
    UI.CompareHistory.undoStack = [];
    UI.CompareHistory.redoStack = [];
    UI.DefectState.defects = [{ id: 1, type: "added", x: 10, y: 20, w: 30, h: 40, status: "Open", note: "Initial" }];
    UI.CompareHistory.push("Edit defect note");
    UI.DefectState.defects[0].note = "Wrong text typed";
    assert.strictEqual(UI.DefectState.defects[0].note, "Wrong text typed");

    const undone = UI.CompareHistory.undo();
    assert.strictEqual(undone, true);
    assert.strictEqual(UI.DefectState.defects[0].note, "Initial", "Ctrl+Z undo must restore previous state");

    const redone = UI.CompareHistory.redo();
    assert.strictEqual(redone, true);
    assert.strictEqual(UI.DefectState.defects[0].note, "Wrong text typed", "Ctrl+Y redo must restore undone state");
  });

  test("DXFEngine supports TABLES/LAYER, LWPOLYLINE bulges, Sample Mechanical DXF & Vector Entity A/B Diffing", () => {
    const dxfA = DXF.generateSampleMechanicalDXF(false, "mm");
    const dxfB = DXF.generateSampleMechanicalDXF(true, "mm");
    const pA = new DXF.DXFParser(dxfA).parse();
    const pB = new DXF.DXFParser(dxfB).parse();

    assert(pA.entities.length >= 15, "Sample DXF Rev A must contain >= 15 CAD entities");
    assert(pB.entities.length > pA.entities.length, "Sample DXF Rev B must have additional cooling slot entities");
    const layers = pB.getLayerSummary();
    assert(layers.some(l => l.name === "MOUNTING_HOLES"), "DXFParser must parse TABLES -> LAYER definitions");
    assert(layers.some(l => l.name === "CONNECTOR_CUTOUTS"), "DXFParser must track CONNECTOR_CUTOUTS layer");

    const diff = DXF.compareDXFEntities(pA, pB);
    assert(diff.added.length > 0 && diff.removed.length > 0, "compareDXFEntities must detect added and removed CAD primitives between Rev A and Rev B");
    assert(diff.unchangedCount > 5, "compareDXFEntities must preserve unchanged common CAD primitives");
  });

  test("Full-height side-docked Layer Dock and zero-width collapsed sidebar CSS rules are enforced", () => {
    const css = fs.readFileSync("style.css", "utf8");
    assert(css.includes("aside.rp-collapsed,main>aside.rp-collapsed") && css.includes("flex:0 0 0px!important"), "Collapsed sidebar must override flex-basis to 0px so full PDF page is accessible");
    assert(css.includes(".rp-layer-dock.docked") && css.includes("height: 100% !important"), "Docked Layer Dock must be a full-height side panel by default");
    assert(css.includes(".rp-layer-dock.floating"), "Layer Dock must support floating mode with snap-to-side docking");
  });

  test("GerberParser supports legacy RS-274X G54Dxx* aperture selection and ExcellonParser supports G00/G01/G05 prefixed drill hits", () => {
    const legacyGbr = [
      "%FSLAX24Y24*%",
      "%MOIN*%",
      "%ADD10C,0.015*%",
      "%ADD12R,0.060X0.060*%",
      "G54D12*",
      "X010000Y010000D03*",
      "G54D10*",
      "X010000Y010000D02*",
      "X020000Y015000D01*",
      "M02*"
    ].join("\n");
    const gp = new CAM.GerberParser(legacyGbr).parse();
    assert.strictEqual(gp.commands.length, 2, "Must parse flash and draw under G54Dxx* selection");
    assert.strictEqual(gp.commands[0].aperture, 12, "First flash must use D12 selected via G54D12*");
    assert.strictEqual(gp.commands[1].aperture, 10, "Draw must use D10 selected via G54D10*");

    const gcodeDrl = [
      "M48",
      "INCH",
      "T01C0.032",
      "T02C0.045",
      "%",
      "G05",
      "T01",
      "G00X1.0000Y1.0000",
      "G01X1.5000Y1.2500",
      "T02X2.0000Y2.2500",
      "M30"
    ].join("\n");
    const dp = new CAM.ExcellonParser(gcodeDrl).parse();
    assert.strictEqual(dp.hits.length, 3, "Must parse G00, G01, and inline T02 prefixed drill hits");
    assert.strictEqual(dp.hits[2].tool, 2);
    assert.strictEqual(dp.hits[2].x, 2.0);
  });

  test("DXFEngine accurately diffs ELLIPSE, SOLID, DIMENSION, and INSERT entities and transliterates engineering symbols", () => {
    const w = new DXF.DXFWriter({ unit: "mm", scale: 1.0 });
    w.addText("R1 = 10kΩ ±1% ⌀5mm ΔT=25°C 100µF", 10, 10, 5, 0, "TEXT");
    const out = w.generateString();
    assert(out.includes("10kOhm") && out.includes("%%p1%") && out.includes("%%c5mm") && out.includes("Delta T=25%%dC") && out.includes("100uF"),
      "DXFWriter must transliterate engineering symbols cleanly without question marks");

    const dxfWithSolidsA = [
      "0", "SECTION", "2", "ENTITIES",
      "0", "SOLID", "8", "0", "10", "0", "20", "0", "11", "10", "21", "0", "12", "10", "22", "10", "13", "0", "23", "10",
      "0", "DIMENSION", "8", "DIMS", "1", "50.0 mm", "10", "50", "20", "10", "11", "25", "21", "10", "13", "0", "23", "0", "14", "50", "24", "0",
      "0", "ENDSEC", "0", "EOF"
    ].join("\r\n");
    const dxfWithSolidsB = [
      "0", "SECTION", "2", "ENTITIES",
      "0", "SOLID", "8", "0", "10", "20", "20", "20", "11", "30", "21", "20", "12", "30", "22", "30", "13", "20", "23", "30",
      "0", "DIMENSION", "8", "DIMS", "1", "75.0 mm", "10", "75", "20", "10", "11", "37.5", "21", "10", "13", "0", "23", "0", "14", "75", "24", "0",
      "0", "ENDSEC", "0", "EOF"
    ].join("\r\n");
    const pA = new DXF.DXFParser(dxfWithSolidsA).parse();
    const pB = new DXF.DXFParser(dxfWithSolidsB).parse();
    const diff = DXF.compareDXFEntities(pA, pB);
    assert.strictEqual(diff.added.length, 2, "Must detect modified SOLID and DIMENSION as added in B");
    assert.strictEqual(diff.removed.length, 2, "Must detect original SOLID and DIMENSION as removed from A");
  });

  test("WorkerEngine._syncDiff fallback computes 8-connected bounding-box regions identically to Web Worker", () => {
    const engine = new WE.WorkerClient();
    const w = 40, h = 40;
    const bufA = new Uint8ClampedArray(w * h * 4).fill(255);
    const bufB = new Uint8ClampedArray(w * h * 4).fill(255);
    // Draw a 6x6 black square in bufB at (10..15, 12..17)
    for (let y = 12; y <= 17; y++) {
      for (let x = 10; x <= 15; x++) {
        const idx = (y * w + x) * 4;
        bufB[idx] = 0; bufB[idx + 1] = 0; bufB[idx + 2] = 0;
      }
    }
    const res = engine._syncDiff({ bufA, bufB, width: w, height: h, threshold: 35 });
    assert(Array.isArray(res.regions) && res.regions.length === 1, "Fallback _syncDiff must cluster connected diff pixels into 1 region");
    assert.strictEqual(res.regions[0].x, 10);
    assert.strictEqual(res.regions[0].y, 12);
    assert.strictEqual(res.regions[0].w, 6);
    assert.strictEqual(res.regions[0].h, 6);
    assert.strictEqual(res.regions[0].pixelCount, 36);
  });

  test("DefectState preserves original regionIndex after noise filtering and retains per-page defect statuses", () => {
    UI.DefectState.clearAllPages();
    UI.DefectState.noiseThreshold = 5;
    const regionsPage1 = [
      { type: "added", x: 10, y: 10, w: 1, h: 1, pixelCount: 1 }, // index 0 (filtered out as noise)
      { type: "removed", x: 120, y: 80, w: 20, h: 20, pixelCount: 400 } // index 1 (kept as defect #1)
    ];
    UI.DefectState.initFromRegions(regionsPage1);
    assert.strictEqual(UI.DefectState.defects.length, 1);
    assert.strictEqual(UI.DefectState.defects[0].regionIndex, 1, "Must preserve original S.cur.regions index (1) when earlier noise is filtered");
  });

  test("GerberParser supports modal D01/D02/D03 operations and inline D01X... / G54D10X... coordinate blocks", () => {
    const modalGbr = [
      "%FSLAX24Y24*%",
      "%MOIN*%",
      "%ADD10C,0.012*%",
      "%ADD15C,0.050*%",
      "G54D15X010000Y010000D03*",
      "X020000Y010000*",
      "X030000Y010000*",
      "G54D10X010000Y010000D02*",
      "D01X030000Y010000*",
      "M02*"
    ].join("\n");
    const gp = new CAM.GerberParser(modalGbr).parse();
    const flashes = gp.commands.filter(c => c.op === "FLASH");
    const draws = gp.commands.filter(c => c.op === "DRAW");
    assert.strictEqual(flashes.length, 3, "Modal D03 must flash all 3 subsequent coordinate blocks");
    assert.strictEqual(draws.length, 1, "Inline D01X... after G54D10...D02* must produce 1 draw segment");
    assert.strictEqual(draws[0].x1, 1.0);
    assert.strictEqual(draws[0].x2, 3.0);
  });

  test("ExcellonParser supports incremental coordinates (ICI,ON and G91)", () => {
    const incDrl = [
      "M48",
      "INCH",
      "ICI,ON",
      "T01C0.032",
      "%",
      "T01",
      "X1.0000Y1.0000",
      "X0.5000Y0.2500",
      "X0.5000Y-0.2500",
      "M30"
    ].join("\n");
    const dp = new CAM.ExcellonParser(incDrl).parse();
    assert.strictEqual(dp.hits.length, 3);
    assert(Math.abs(dp.hits[0].x - 1.0) < 1e-4 && Math.abs(dp.hits[0].y - 1.0) < 1e-4);
    assert(Math.abs(dp.hits[1].x - 1.5) < 1e-4 && Math.abs(dp.hits[1].y - 1.25) < 1e-4, "Second hit must accumulate incremental delta (+0.5, +0.25)");
    assert(Math.abs(dp.hits[2].x - 2.0) < 1e-4 && Math.abs(dp.hits[2].y - 1.0) < 1e-4, "Third hit must accumulate incremental delta (+0.5, -0.25)");
  });

  test("DXFWriter.addArc updates header extents ($EXTMIN/$EXTMAX) and DXFParser parses fit-point SPLINE entities", () => {
    const w = new DXF.DXFWriter({ unit: "mm", scale: 1.0 });
    w.addArc(100, 100, 50, 0, 180, "GEOMETRY");
    assert(w.minX < 100 * w.scaleFactor && w.maxX > 100 * w.scaleFactor, "addArc must expand minX/maxX by arc radius");

    const fitSplineDxf = [
      "0", "SECTION", "2", "ENTITIES",
      "0", "SPLINE", "8", "CURVES", "70", "0",
      "11", "0.0", "21", "0.0",
      "11", "25.0", "21", "40.0",
      "11", "60.0", "21", "15.0",
      "0", "ENDSEC", "0", "EOF"
    ].join("\r\n");
    const sp = new DXF.DXFParser(fitSplineDxf).parse();
    assert.strictEqual(sp.entities.length, 1, "Must parse SPLINE with fit points (group codes 11/21)");
    assert.strictEqual(sp.entities[0].points.length, 3);
  });

  // ----------------------------------------------------
  // MODULE 7: PEN, PIN & ERASER CONTEXTUAL TOOL OPTIONS
  // ----------------------------------------------------
  console.log('\n--- MODULE 7: Pen, Pin & Eraser Contextual Tool Options ---');

  test("PDF Studio (index.html & editor.js) defines Pin tool, Eraser options, Pen thickness presets, and per-tool settings memory", () => {
    const html = fs.readFileSync("index.html", "utf8");
    const edJs = fs.readFileSync("editor.js", "utf8");

    assert(html.includes('data-t="pin"'), "PDF Studio toolbar must include Pin tool button (data-t=\"pin\")");
    assert(html.includes('id="eStyleDock"'), "PDF Studio must include contextual #eStyleDock group");
    assert(html.includes('id="ePenPresets"'), "PDF Studio must include #ePenPresets quick thickness buttons");
    assert(html.includes('id="eEraserOpts"') && html.includes('id="eEraserMode"'), "PDF Studio must include #eEraserOpts and #eEraserMode selector");
    assert(html.includes('id="eErasePageBtn"'), "PDF Studio must include #eErasePageBtn clear page button");
    assert(html.includes('id="ePinOpts"'), "PDF Studio must include #ePinOpts pin marker size presets");

    assert(edJs.includes("toolSettings:") && edJs.includes("getToolSetting") && edJs.includes("saveToolSetting"),
      "editor.js must maintain independent per-tool size and color settings");
    assert(edJs.includes("function updateContextualToolDock("),
      "editor.js must dynamically update the Tool Options dock when switching tools");
    assert(edJs.includes("function distToSeg(") && edJs.includes("function hitAnnAt(") && edJs.includes("function eraseAtPoint("),
      "editor.js must implement segment-accurate hit-testing and object/brush-radius erasing");
    assert(edJs.includes("a.t === 'pin'"),
      "editor.js must render, hit-test, edit, and vector-export Pin annotations");
  });

  await testAsync("Compare Ribbon (ui_ribbon.js & pro.js) defines Pin Marker, Eraser, contextual Tool Options dock, and DXF export support", async () => {
    const ribHtml = fs.readFileSync("ui_ribbon.js", "utf8");
    const proJs = fs.readFileSync("pro.js", "utf8");

    assert(ribHtml.includes('id="rib-pin"') && ribHtml.includes('data-rptool="pin"'), "Compare Markup ribbon must include Pin Marker tool (#rib-pin)");
    assert(ribHtml.includes('id="rib-eraser"') && ribHtml.includes('data-rptool="eraser"'), "Compare Markup ribbon must include Eraser tool (#rib-eraser)");
    assert(ribHtml.includes('id="rib-cmp-tool-opts"'), "Compare Markup ribbon must include contextual #rib-cmp-tool-opts dock");
    assert(ribHtml.includes('id="rib-mk-size"') && ribHtml.includes('id="rib-mk-pen-presets"'), "Compare Markup ribbon must include thickness input and presets");
    assert(ribHtml.includes('id="rib-mk-eraser-presets"') && ribHtml.includes('id="rib-mk-eraser-mode"'), "Compare Markup ribbon must include Eraser mode and radius presets");
    assert(ribHtml.includes('id="rib-mk-pin-presets"'), "Compare Markup ribbon must include Pin size presets");
    assert(ribHtml.includes('id="rib-mk-color"') && ribHtml.includes('id="rib-mk-swatches"'), "Compare Markup ribbon must include color picker and swatches");

    assert(proJs.includes("updateCompareToolOptionsUI") && proJs.includes("setCompareToolSize"),
      "pro.js must dynamically update Compare tool options when switching tools");
    assert(proJs.includes("hitCompareAnnotation") && proJs.includes("eraseCompareAt"),
      "pro.js must support segment-accurate hit testing and object/brush erasing in Compare view");

    // Verify DXF export handles both freehand 'pen' polylines and 'pin' inspection markers
    const mockPage = {
      getViewport: () => ({ width: 400, height: 300 }),
      getTextContent: async () => ({ items: [] }),
      getOperatorList: async () => ({ fnArray: [], argsArray: [] })
    };
    const dxfOut = await DXF.exportPDFToDXF(mockPage, {
      unit: "mm",
      scale: 1.0,
      annotations: [
        { kind: "pen", pts: [{ x: 10, y: 10 }, { x: 40, y: 25 }, { x: 80, y: 60 }] },
        { kind: "pin", x: 120, y: 90, pinNum: 1, label: "Pin #1: Check trace width" },
        { t: "pin", x: 160, y: 110, w: 24, h: 30, pinNum: 2, text: "Pin #2: Verify pad clearance" }
      ]
    });
    assert(dxfOut.includes("LWPOLYLINE"), "DXF export must write LWPOLYLINE for freehand pen strokes");
    assert(dxfOut.includes("#1 Pin #1: Check trace width"), "DXF export must write TEXT and CIRCLE for Compare Pin markers");
    assert(dxfOut.includes("#2 Pin #2: Verify pad clearance"), "DXF export must write TEXT and CIRCLE for PDF Studio Pin markers");
  });

  test("Second-pass tool audit fixes: Pen dash support, Pin/Leader/Meas bbox padding, hollow shape perimeter hit-testing, and densified brush erasing", () => {
    const edJs = fs.readFileSync("editor.js", "utf8");
    const proJs = fs.readFileSync("pro.js", "utf8");
    const ribJs = fs.readFileSync("ui_ribbon.js", "utf8");
    const appJs = fs.readFileSync("app.js", "utf8");
    const menuJs = fs.readFileSync("menu.js", "utf8");

    // 1. Freehand Pen supports dashed/dotted styles and vector/sprite PDF export
    assert(edJs.includes("['draw', 'rect', 'circle', 'line', 'arrow', 'poly', 'leader'].includes(t)"),
      "editor.js must expose line dash selector for Freehand Pen ('draw')");
    assert(edJs.includes("if (a.dash && a.dash !== 'solid')"),
      "editor.js vector() must export dashed/dotted freehand pen strokes");

    // 2. Hollow rect & circle perimeter hit-testing and densified brush erasing
    assert(edJs.includes("if (a.t === 'rect' && !a.fill)") && edJs.includes("if (a.t === 'circle' && !a.fill)"),
      "editor.js hitAnnAt must hit-test hollow rect/circle perimeters so interior markups remain selectable");
    assert(edJs.includes("function densifyStrokeForBrush(") && proJs.includes("const densifyCmpPts ="),
      "editor.js and pro.js must subdivide long stroke segments during brush-radius erasing");

    // 3. Compare workspace double-click & inline sidebar editing of Pin, Leader Callout, and Revision Cloud
    assert(proJs.includes("function findCompareAnnotationAt(") && proJs.includes("async function editCompareAnnotation("),
      "pro.js must support double-click and context-menu editing of placed Compare markups");
    assert(ribJs.includes("rp-side-ann-in"),
      "ui_ribbon.js must provide inline editable inputs for Pin, Leader, and Cloud labels in the Markups sidebar");
    assert(appJs.includes("rm.renderSingleAnnotation(x, a, 1)"),
      "app.js exportReport must composite placed RP_MEASURE markups and BOM badges onto comparison report pages");
    assert(menuJs.includes("['backspace', 'edit'") && menuJs.includes("['q', 'edit', () => ACT.tool('pin')"),
      "menu.js must bind Backspace annotation deletion and Q shortcut for Pin Marker");
  });

  await testAsync("5 Enterprise Polish Features: External Link Bridge, Drag-and-Drop Backdrop, Empty-State Cards, Recent Submenu & 1-Click QA Package (.zip)", async () => {
    const mainJs = fs.readFileSync("main.js", "utf8");
    const preloadJs = fs.readFileSync("preload.js", "utf8");
    const preJs = fs.readFileSync("pre.js", "utf8");
    const nsi = fs.readFileSync("installer.nsi", "utf8");
    const html = fs.readFileSync("index.html", "utf8");
    const appJs = fs.readFileSync("app.js", "utf8");
    const menuJs = fs.readFileSync("menu.js", "utf8");
    const ribJs = fs.readFileSync("ui_ribbon.js", "utf8");

    // 1. External Link Bridge & Website Connectivity
    assert(mainJs.includes("setWindowOpenHandler") && mainJs.includes("shell.openExternal") && mainJs.includes("ipcMain.handle('open-url'"),
      "main.js must route external http/https links via setWindowOpenHandler and open-url IPC");
    assert(preloadJs.includes("openUrl:") && preJs.includes("window.openExternalUrl"),
      "preload.js and pre.js must expose openUrl and window.openExternalUrl");
    assert(menuJs.includes("Visit Website (textportdocx.in)") && menuJs.includes("Check for Updates..."),
      "Help menu must include Visit Website (textportdocx.in) and Check for Updates...");
    assert(html.includes('id="about-website-btn"') && html.includes('id="about-updates-btn"'),
      "About modal footer must include Visit Website and Check for Updates buttons");
    assert(nsi.includes('WriteRegStr HKCU "${UNINSTKEY}" "URLInfoAbout" "https://kensho.textportdocx.in"') &&
           nsi.includes('WriteRegStr HKCU "${UNINSTKEY}" "HelpLink" "https://kensho.textportdocx.in"') &&
           nsi.includes('WriteRegStr HKCU "${UNINSTKEY}" "URLUpdateInfo" "https://kensho.textportdocx.in"'),
      "installer.nsi must write URLInfoAbout, HelpLink, and URLUpdateInfo under UNINSTKEY");

    // 2. Full-Window Drag-and-Drop Visual Target
    assert(html.includes('id="rp-drop-backdrop"') &&
           html.includes('data-dropzone="A"') &&
           html.includes('data-dropzone="B"') &&
           html.includes('data-dropzone="edit"'),
      "index.html must include #rp-drop-backdrop with Drop Slot A, Drop Slot B, and PDF Studio drop zones");
    assert(appJs.includes("hideDropBackdrop") && appJs.includes("targetZone === 'A'") && appJs.includes("targetZone === 'B'"),
      "app.js must route dropped files based on active dropzone target");

    // 3. Canvas Empty-State Quick-Launch Cards
    assert(html.includes('id="rp-card-compare-drawings"') &&
           html.includes('id="rp-card-pdf-studio"') &&
           html.includes('id="rp-card-cam-setup"'),
      "index.html must render the 3 primary Empty-State Quick-Launch Cards");

    // 4. Recent Files Submenu in File Menu
    assert(menuJs.includes("l: 'Open Recent'") && menuJs.includes("showSubMenu") && appJs.includes("r.slice(0, 8)"),
      "menu.js and app.js must store the last 8 opened files and populate File > Open Recent submenu");

    // 5. 1-Click QA Package Export (.ZIP Bundle)
    assert(ribJs.includes('id="rib-export-qa-zip"') && typeof UI.buildZipArchive === "function" && typeof UI.exportQAPackageZip === "function",
      "ui_ribbon.js must expose #rib-export-qa-zip, buildZipArchive, and exportQAPackageZip");

    const pkgRes = await UI.exportQAPackageZip();
    assert(pkgRes && pkgRes.zipBytes instanceof Uint8Array && pkgRes.zipBytes.length > 500,
      "exportQAPackageZip must generate a valid non-empty Uint8Array .zip bundle");
    // Verify PKZIP magic signature 0x50 0x4b 0x03 0x04 ('PK\x03\x04')
    assert.strictEqual(pkgRes.zipBytes[0], 0x50);
    assert.strictEqual(pkgRes.zipBytes[1], 0x4b);
    assert.strictEqual(pkgRes.zipBytes[2], 0x03);
    assert.strictEqual(pkgRes.zipBytes[3], 0x04);
    assert(pkgRes.files.some(n => n.endsWith("_Executive_Audit_Report.pdf")), "QA ZIP must bundle Annotated Executive Audit PDF");
    assert(pkgRes.files.some(n => n.endsWith("_Defect_Schedule.csv")), "QA ZIP must bundle Defect CSV Schedule");
  });

  test("Mode, View & Enhance, Area & DPI Audit Fixes: synchronized Mode/DPI controls, #hq z-index, drag/click Area, and PDF Studio Area tool", () => {
    const html = fs.readFileSync("index.html", "utf8");
    const css = fs.readFileSync("style.css", "utf8");
    const appJs = fs.readFileSync("app.js", "utf8");
    const proJs = fs.readFileSync("pro.js", "utf8");
    const ribJs = fs.readFileSync("ui_ribbon.js", "utf8");
    const edJs = fs.readFileSync("editor.js", "utf8");

    assert(ribJs.includes("function setCompareMode(") && ribJs.includes("id=\"rib-view-mode\"") && ribJs.includes("id=\"rib-view-dpi\""),
      "ui_ribbon.js must provide synchronized Mode and DPI controls in both Review & Compare and View & Enhance");
    assert(css.includes("#vp #cv,#vp #cvA,#vp #lv,#vp #hq,#ewrap #ecv{filter:var(--rp-filter,none)}"),
      "style.css must scope --rp-filter to drawing canvases so #mk and #rp-ov are not inverted");
    assert(proJs.includes("insertBefore(hq,") && ribJs.includes("id=\"rp-finish-tool-btn\""),
      "pro.js must mount #hq inside #stage below #mk and #rp-ov, and ui_ribbon.js must provide #rp-finish-tool-btn");
    assert(appJs.includes("oldDpi"),
      "app.js show(n) must scale S.view.k, calibration pxPerUnit, and annotations when DPI changes on the current page");
    assert(html.includes("data-t=\"area\"") && edJs.includes("case 'area':"),
      "index.html and editor.js must provide full Area measurement support in PDF Studio");
    assert(html.includes("id=\"eFontSet\"") && html.includes("data-etab=\"pages\"") && html.includes("data-etab=\"doc\""),
      "index.html must organize PDF Studio into MS Office set-wise tabs with an always-outside Font & Paragraph set (#eFontSet)");
    assert(edJs.includes("function shouldShowContextualDock(") && edJs.includes("function openInlineTextEditor(") && edJs.includes("function commitInlineTextEditor("),
      "editor.js must show #eStyleDock only for Pen/Shape/Eraser/Pin tools and provide direct on-page inline WYSIWYG text typing");
  });

  test("Full Application Audit Fixes: #lM Markers sync, cadDxf/rect SVG icons, editFromSelection partial-word support, offscreen canvas zeroing & WorkerClient.terminate()", () => {
    const icJs = fs.readFileSync("icons.js", "utf8");
    const html = fs.readFileSync("index.html", "utf8");
    const appJs = fs.readFileSync("app.js", "utf8");
    const proJs = fs.readFileSync("pro.js", "utf8");
    const ribJs = fs.readFileSync("ui_ribbon.js", "utf8");
    const edJs = fs.readFileSync("editor.js", "utf8");
    const weJs = fs.readFileSync("worker_engine.js", "utf8");

    assert(icJs.includes("rect:") && icJs.includes("cadDxf:"), "icons.js must define rect and cadDxf SVG icons");
    assert(html.includes("rel=\"icon\" href=\"build/icon.png\""), "index.html must include favicon link to prevent 404 console error");
    assert(ribJs.includes("$('#lM') || $('#boxes')"), "ui_ribbon.js Markers toggles (#rib-view-markers and #rp-markers-chk) must bind to #lM");
    assert(edJs.includes("return editItems(items, items.length === 1 && items[0].str.includes(t) ? t : null);"),
      "editor.js editFromSelection must delegate to editItems with partial-word target support");
    assert(edJs.includes("_scratchCanvas") && edJs.includes("E._rendering") && edJs.includes("E._renderQueued"),
      "editor.js must reuse _scratchCanvas for text metrics and serialize concurrent PDF.js render tasks cleanly");
    assert(appJs.includes("c.width = 0; c.height = 0;") && proJs.includes("hq._cropA = null"),
      "app.js and pro.js must release offscreen canvas buffers and cached loupe crops");
    assert(weJs.includes("terminate()"), "WorkerClient must provide a terminate() method to clean up worker and pending callbacks");
  });

  test("Loading Behaviour & Zero-Error Audit Fixes: launchpad SVG sizing, zero-size initial canvas, non-intrusive #rp-load progress, and universal image/CAD loading", () => {
    const css = fs.readFileSync("style.css", "utf8");
    const html = fs.readFileSync("index.html", "utf8");
    const preJs = fs.readFileSync("pre.js", "utf8");
    const proJs = fs.readFileSync("pro.js", "utf8");
    const appJs = fs.readFileSync("app.js", "utf8");
    const edJs = fs.readFileSync("editor.js", "utf8");
    const menuJs = fs.readFileSync("menu.js", "utf8");

    assert(css.includes("#empty>svg:not(.ic),#eempty>svg:not(.ic)") && css.includes(".card>svg:not(.ic)"),
      "style.css must scope 84px/80px SVG sizing to direct children so launchpad button icons remain 18px");
    assert(html.includes("<canvas id=\"cv\" width=\"0\" height=\"0\"></canvas>"),
      "index.html must initialize #cv with width=0 height=0 so #c-floating-hud stays hidden on startup");
    assert(preJs.includes("verbosity = 0") && preJs.includes("isOffscreenCanvasSupported = false"),
      "pre.js must configure PDF.js verbosity=0 and isOffscreenCanvasSupported=false for clean loading");
    assert(proJs.includes("window.rpCancelSharpen") && proJs.includes("^(Scanning|Comparing|Report|Unlocking|Preparing|Exporting|Merging|Splitting|Processing|Reading)"),
      "pro.js must expose rpCancelSharpen and restrict #rp-load status progress to active loading verbs");
    assert(appJs.includes("async function imageBytesToPDF(") && appJs.includes("window.__recentMemFiles"),
      "app.js must support converting opened images to PDF and caching recent in-memory files");
    assert(edJs.includes("const newDoc = await pdfjsLib.getDocument") && menuJs.includes("const hasEdFile = !!(e && e.bytes && e.name);"),
      "editor.js reload() must await newDoc before replacing E.doc and menu.js must keep #docname empty when no file is loaded");
  });

  // ----------------------------------------------------
  // MODULE 8: PRODUCTION STABILITY, MEMORY & CRASH RESILIENCE
  // ----------------------------------------------------
  console.log('\n--- MODULE 8: Production Stability, Memory Reclamation & Crash Resilience ---');

  test('Global crash handlers and unhandled rejection guards are registered', () => {
    const mainJs = fs.readFileSync('main.js', 'utf8');
    const preJs = fs.readFileSync('pre.js', 'utf8');

    assert(mainJs.includes("process.on('uncaughtException'") && mainJs.includes("process.on('unhandledRejection'"),
      'main.js must register process uncaughtException and unhandledRejection handlers');
    assert(mainJs.includes('Kensho Pro System Notice') && mainJs.includes('dialog.showMessageBoxSync') && mainJs.includes('clipboard.writeText'),
      'main.js must display Kensho Pro System Notice dialog with clipboard diagnostic copy support');
    assert(preJs.includes('window.onerror =') && preJs.includes("window.addEventListener('unhandledrejection'"),
      'pre.js must register window.onerror and unhandledrejection guards');
    assert(preJs.includes('⚠️ A background task encountered an issue and was safely contained.'),
      'pre.js must show the non-intrusive containment toast via #rp-toast');
  });

  test('PDF document destroy() and canvas dimension zeroing release memory properly', () => {
    const appJs = fs.readFileSync('app.js', 'utf8');
    const edJs = fs.readFileSync('editor.js', 'utf8');
    const extJs = fs.readFileSync('extras.js', 'utf8');
    const weJs = fs.readFileSync('worker_engine.js', 'utf8');
    const WE = require(path.join(ROOT_DIR, 'worker_engine.js'));

    assert(appJs.includes('await prevDoc.destroy()') && edJs.includes('await prevDoc.destroy()'),
      'app.js and editor.js must explicitly await prevDoc.destroy() when replacing loaded PDF documents');
    assert(appJs.includes('renderTask.cancel()') && edJs.includes('E._renderTask.cancel()'),
      'app.js and editor.js must cancel in-flight render tasks when switching or closing documents');
    assert(weJs.includes('tile.canvas.width = 0;') && weJs.includes('tile.canvas.height = 0;'),
      'VirtualTileManager.clear() must zero tile canvas width and height to free GPU memory');
    assert(extJs.includes("$('#ecv').width = 0") && appJs.includes('window.rpTileManager.clear()'),
      'Closing tabs or switching Compare slots must zero canvases and clear VirtualTileManager');

    const vtm = new WE.VirtualTileManager({ tileSize: 512, maxCachedTiles: 8 });
    const tileCv = vtm.getOrCreateTileCanvas('0_0_1.00', 512, 512);
    assert.strictEqual(tileCv.width, 512);
    vtm.clear();
    assert.strictEqual(tileCv.width, 0, 'Tile canvas width must be 0 after VirtualTileManager.clear()');
    assert.strictEqual(tileCv.height, 0, 'Tile canvas height must be 0 after VirtualTileManager.clear()');
  });

  test('Corrupt DXF and encrypted PDF guards fail safely with descriptive errors', () => {
    const preJs = fs.readFileSync('pre.js', 'utf8');
    const appJs = fs.readFileSync('app.js', 'utf8');
    const edJs = fs.readFileSync('editor.js', 'utf8');

    // Verify DXFParser rejects empty, binary, and malformed DXF inputs with descriptive error
    assert.throws(() => new DXF.DXFParser('').parse(), /Invalid or binary DXF format\. Please provide standard ASCII DXF\./);
    assert.throws(() => new DXF.DXFParser('AutoCAD Binary DXF\r\n\x1a\x00').parse(), /Invalid or binary DXF format\. Please provide standard ASCII DXF\./);
    assert.throws(() => new DXF.DXFParser('NOT_A_DXF_FILE_AT_ALL').parse(), /Invalid or binary DXF format\. Please provide standard ASCII DXF\./);

    // Verify GerberParser rejects empty, binary, or non-RS-274X inputs cleanly without hanging
    assert.throws(() => new CAM.GerberParser('').parse(), /Invalid or corrupt Gerber RS-274X format/);
    assert.throws(() => new CAM.GerberParser('%PDF-1.7 binary garbage \x00').parse(), /Invalid or corrupt Gerber RS-274X format/);

    // Verify encrypted/password-protected PDF modal message is present in pre.js, app.js, and editor.js
    const expectedEncMsg = 'This document is password-protected or encrypted. Please decrypt or unlock the file before comparing or markup.';
    assert(preJs.includes(expectedEncMsg) && appJs.includes(expectedEncMsg) && edJs.includes(expectedEncMsg),
      'PasswordException guard must display the descriptive encrypted PDF message and reset workspace state');
  });

  test('Zoom clamp protects against NaN, zero, and infinite scale values', () => {
    const ME = require(path.join(ROOT_DIR, 'measure_engine.js'));
    const proJs = fs.readFileSync('pro.js', 'utf8');
    const edJs = fs.readFileSync('editor.js', 'utf8');

    assert.strictEqual(typeof ME.clampZoom, 'function', 'MeasureEngine must export clampZoom');
    assert.strictEqual(ME.clampZoom(NaN), 1.0, 'NaN zoom must fallback to 1.0');
    assert.strictEqual(ME.clampZoom(0), 1.0, 'Zero zoom must fallback to 1.0');
    assert.strictEqual(ME.clampZoom(-5), 1.0, 'Negative zoom must fallback to 1.0');
    assert.strictEqual(ME.clampZoom(Infinity), 1.0, 'Infinite zoom must fallback to 1.0');
    assert.strictEqual(ME.clampZoom(0.001), 0.05, 'Sub-minimum zoom must clamp to 0.05');
    assert.strictEqual(ME.clampZoom(500), 64.0, 'Super-maximum zoom must clamp to 64.0');
    assert.strictEqual(ME.clampZoom(2.5), 2.5, 'Valid zoom within [0.05, 64.0] must be preserved');

    // Verify OSNAPManager.snap never produces NaN/Infinity even when passed 0 or NaN zoomScale
    const osnap = new ME.OSNAPManager(8);
    osnap.addPoint(100, 100, 'endpoint');
    const snapZero = osnap.snap(102, 102, 0);
    const snapNaN = osnap.snap(102, 102, NaN);
    assert(Number.isFinite(snapZero.x) && Number.isFinite(snapNaN.x), 'OSNAP snap must remain finite under 0 or NaN zoomScale');

    // Verify High-DPI Math.round(logicalWidth * devicePixelRatio) backing buffer sizing
    assert(proJs.includes('Math.round(logicalWidth * devicePixelRatio)') && proJs.includes('Math.round(logicalHeight * devicePixelRatio)'),
      'pro.js must compute backing buffer dimensions using Math.round(logicalWidth * devicePixelRatio)');
    assert(edJs.includes('Math.round(logicalWidth * d)') && edJs.includes('Math.round(logicalHeight * d)'),
      'editor.js must compute backing buffer dimensions using Math.round(logicalWidth * d)');
  });

  test('Special characters and spaces in file paths are sanitized and preserved', () => {
    const mainJs = fs.readFileSync('main.js', 'utf8');
    const appJs = fs.readFileSync('app.js', 'utf8');

    assert(mainJs.includes('function sanitizeFilePath(') && mainJs.includes('function ensureSaveExtension('),
      'main.js must define sanitizeFilePath and ensureSaveExtension helpers');
    assert(mainJs.includes('const payload = JSON.stringify({ name: path.basename(f), path: f, b64, slot })'),
      'main.js sendOpen must serialize file open payloads safely with JSON.stringify');
    assert(appJs.includes('function sanitizeFilePath('), 'app.js must define sanitizeFilePath');

    const complexName = 'Rev A & B [Final #2] (2026) — 电路图_Ω.pdf';
    const complexDir = path.join('/tmp', 'Engineering & CAM [2026] #1 (Test)');
    const fullPath = path.join(complexDir, complexName);
    const quoted = `"${fullPath}"`;
    const sanitized = quoted.trim().replace(/^["']+|["']+$/g, '');
    assert.strictEqual(path.basename(sanitized), complexName, 'Complex filename with spaces, &, [], #, (), and Unicode must be preserved');
  });

  test('Deep Memory Leak Prevention: bounded caches, thumbnail canvas zeroing, page.cleanup() & offscreen CAM/DXF canvas disposal', () => {
    const appJs = fs.readFileSync('app.js', 'utf8');
    const edJs = fs.readFileSync('editor.js', 'utf8');
    const extJs = fs.readFileSync('extras.js', 'utf8');
    const ribJs = fs.readFileSync('ui_ribbon.js', 'utf8');

    assert(appJs.includes('while (window.__recentMemFiles.size > 6)') && appJs.includes('p.cleanup()'),
      'app.js must cap __recentMemFiles cache and call p.cleanup() on background scanned pages');
    assert(appJs.includes('r.A = null; r.B = null; r.cls = null;'),
      'app.js must null out intermediate ImageData (r.A, r.B) and classification buffers (r.cls) during multi-page scans');
    assert(edJs.includes("box.querySelectorAll('canvas').forEach(cv => { cv.width = 0; cv.height = 0; });") && edJs.includes('p.cleanup()'),
      'editor.js must zero detached thumbnail and dialog canvases and call p.cleanup() on non-active pages');
    assert(extJs.includes('SKIP_SNAP_KEYS') && extJs.includes('pg.cleanup()'),
      'extras.js must exclude live render/DOM handles from tab snapshots and clean up batch-compared PDF pages');
    assert(ribJs.includes('cvRevA.width = 0; cvRevA.height = 0;') && ribJs.includes('CompareHistory') && ribJs.includes('clear()'),
      'ui_ribbon.js must zero temporary CAM/DXF offscreen canvases and clear CompareHistory on new document loads');
  });

  test('Windows CI/CD & NSIS Setup Builder (build_setup.js): resolves makensis across electron-builder cache, Program Files & Chocolatey', () => {
    const bs = require(path.join(ROOT_DIR, 'build_setup.js'));
    const wf = fs.readFileSync('.github/workflows/build-windows.yml', 'utf8');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

    assert.strictEqual(typeof bs.findMakensis, 'function', 'build_setup.js must export findMakensis()');
    assert.strictEqual(typeof bs.findInElectronBuilderCache, 'function', 'build_setup.js must export findInElectronBuilderCache()');
    assert(wf.includes('node build_setup.js') && wf.includes('C:\\Program Files (x86)\\NSIS'),
      '.github/workflows/build-windows.yml must resolve NSIS paths and run node build_setup.js');
    assert.strictEqual(pkg.scripts['dist:setup'], 'node build_setup.js', 'package.json dist:setup must invoke node build_setup.js');
    assert(pkg.build && pkg.build.nsis && pkg.build.nsis.artifactName === 'KenshoPro-Setup-1.2.3.exe',
      'package.json must configure build.nsis.artifactName as KenshoPro-Setup-1.2.3.exe');
  });

  test('Industrial CAD/CAM Workstation UI: bottom status-bar unit/shortcut dock, single-line sidebar tabs & rectangular geometry', () => {
    const proJs = fs.readFileSync('pro.js', 'utf8');
    const css = fs.readFileSync('style.css', 'utf8');
    const html = fs.readFileSync('index.html', 'utf8');
    const ribJs = fs.readFileSync('ui_ribbon.js', 'utf8');

    assert(proJs.includes('mountFooterStatus') && proJs.includes('#view-compare > footer') && proJs.includes('#view-edit > footer'),
      'pro.js must mount #rp-top-status (#rp-cal-badge and #rp-shortcut-hint) inside the bottom footer status bar');
    assert(css.includes('/* ===== Industrial CAD/CAM Engineering Workstation UI Overhaul ===== */') && css.includes('border-radius: 2px !important;'),
      'style.css must style #rp-cal-badge and HUD elements with rectangular CAD geometry');
    assert(html.includes('<span>Diffs</span>') && ribJs.includes('<span>CAM/DFM</span>') && ribJs.includes('<span>Markups</span>'),
      'Sidebar tabs must use concise single-line labels (Diffs, Text, CAM/DFM, Markups)');
  });

  test('Linux Portable (.AppImage / .tar.gz) & Setup (.deb / .run / install-linux.sh) packaging and cross-platform runtime', () => {
    const os = require('os');
    const { execFileSync } = require('child_process');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const mainJs = fs.readFileSync('main.js', 'utf8');
    const proJs = fs.readFileSync('pro.js', 'utf8');
    const linuxBuilder = require(path.join(ROOT_DIR, 'build_linux_setup.js'));

    // Verify no stray ASCII backspace exists in pro.js regex
    assert(!proJs.includes('\x08'), 'pro.js must not contain stray 0x08 control character in regex');
    assert(proJs.includes('(Scanning|Comparing|Report|Unlocking|Preparing|Exporting|Merging|Splitting|Processing|Reading)\\b'),
      'pro.js status observer must use proper \\b word boundary');

    // Verify main.js Linux runtime support
    assert(mainJs.includes("process.platform === 'linux'") && mainJs.includes("appendSwitch('no-sandbox')"),
      'main.js must configure --no-sandbox and desktopName on Linux');
    assert(mainJs.includes('url.fileURLToPath') && mainJs.includes("ipcMain.handle('copy-text'"),
      'main.js must decode file:// URIs on Linux and provide copy-text IPC handler');

    // Verify package.json Linux build configuration
    assert(pkg.scripts['dist:linux'] && pkg.scripts['dist:linux:portable'] && pkg.scripts['dist:linux:setup'],
      'package.json must define dist:linux, dist:linux:portable, and dist:linux:setup scripts');
    assert(pkg.build.linux && pkg.build.appImage && pkg.build.deb && pkg.build.rpm,
      'package.json must configure build.linux, build.appImage, build.deb, and build.rpm');
    assert.strictEqual(pkg.build.appImage.artifactName, 'KenshoPro-Portable-1.2.3-${arch}.AppImage');
    assert.strictEqual(pkg.build.deb.artifactName, 'KenshoPro-Setup-1.2.3-${arch}.deb');

    // Verify Linux packaging scripts and workflows exist
    assert(fs.existsSync('install-linux.sh'), 'install-linux.sh must exist');
    assert(fs.existsSync('Build-Linux-Packages.sh'), 'Build-Linux-Packages.sh must exist');
    assert(fs.existsSync('build/linux/after-install.sh') && fs.existsSync('build/linux/after-remove.sh'),
      'Debian/RPM post-install and post-remove scripts must exist');
    assert(fs.existsSync('build/linux/in.textportdocx.kenshopro.xml'),
      'Linux XDG MIME package definition must exist');
    assert(fs.existsSync('.github/workflows/build-linux.yml'),
      '.github/workflows/build-linux.yml must exist');

    // End-to-end test of createPortableLauncher & buildSelfExtractingRunInstaller in a temp directory
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-linux-test-'));
    try {
      const fakeUnpacked = path.join(tmpDir, 'linux-unpacked');
      fs.mkdirSync(fakeUnpacked, { recursive: true });
      fs.writeFileSync(path.join(fakeUnpacked, 'kensho-pro'), '#!/bin/sh\necho "Kensho Pro Linux Binary"\n', { mode: 0o755 });
      fs.copyFileSync('install-linux.sh', path.join(fakeUnpacked, 'install-linux.sh'));
      fs.chmodSync(path.join(fakeUnpacked, 'install-linux.sh'), 0o755);

      const launcher = linuxBuilder.createPortableLauncher(fakeUnpacked);
      assert(fs.existsSync(launcher), 'KenshoPro-Portable.sh launcher must be created');
      const launcherContent = fs.readFileSync(launcher, 'utf8');
      assert(launcherContent.includes('--user-data-dir="$PORTABLE_DATA"') && launcherContent.includes('--no-sandbox'),
        'Portable launcher must pass --no-sandbox and isolated --user-data-dir');

      const tarPath = path.join(tmpDir, 'KenshoPro-Portable-1.2.3-linux-x64.tar.gz');
      execFileSync('tar', ['-czf', tarPath, '-C', tmpDir, 'linux-unpacked']);
      const runPath = path.join(tmpDir, 'KenshoPro-Setup-1.2.3-linux-x64.run');
      linuxBuilder.buildSelfExtractingRunInstaller(tarPath, runPath);
      assert(fs.existsSync(runPath) && fs.statSync(runPath).size > fs.statSync(tarPath).size,
        'Self-extracting .run Setup installer must be created and contain archive payload');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('Single Unified Application Installer (Kensho Pro Only) & CLI View Routing across Windows & Linux', () => {
    const mainJs = fs.readFileSync('main.js', 'utf8');
    const menuJs = fs.readFileSync('menu.js', 'utf8');
    const nsi = fs.readFileSync('installer.nsi', 'utf8');
    const linuxSh = fs.readFileSync('install-linux.sh', 'utf8');
    const afterInst = fs.readFileSync('build/linux/after-install.sh', 'utf8');

    assert(mainJs.includes('function sendViewMode(') && mainJs.includes('^--(view=edit|edit|studio)$'),
      'main.js must route --view=edit / --studio and --view=compare CLI flags to setView');
    assert(menuJs.includes('new URLSearchParams(location.search)'),
      'menu.js must support ?view=edit and ?view=compare startup routing');
    assert(nsi.includes('CreateShortcut "$DESKTOP\\${APPNAME}.lnk" "$INSTDIR\\${APPEXE}"') &&
           !nsi.includes('CreateShortcut "$DESKTOP\\Kensho PDF Studio.lnk"'),
      'installer.nsi must install only a single Kensho Pro desktop/start-menu application shortcut');
    assert(!linuxSh.includes('cat > "$APPS_DIR/$APP_ID-studio.desktop"') && !afterInst.includes('EOF_STUDIO'),
      'Linux installers must install only one unified Kensho Pro desktop application');
  });


  // ----------------------------------------------------
  // MODULE 9: COMPREHENSIVE BUG FIXES & MS WORD-STYLE PDF STUDIO UI VERIFICATION
  // ----------------------------------------------------
  console.log('\n--- MODULE 9: Bug Fixes & MS Word-Style PDF Studio UI ---');

  test('Bug Fixes Verification: WorkerClient file:// fallback, grayOf RGB luminance, Fiducial 3-pt Procrustes, DXF cross-unit compare & UI/CSS fixes', () => {
    const weJs = fs.readFileSync('worker_engine.js', 'utf8');
    const wkJs = fs.readFileSync('worker.js', 'utf8');
    const appJs = fs.readFileSync('app.js', 'utf8');
    const ribJs = fs.readFileSync('ui_ribbon.js', 'utf8');
    const edJs = fs.readFileSync('editor.js', 'utf8');
    const extJs = fs.readFileSync('extras.js', 'utf8');
    const menuJs = fs.readFileSync('menu.js', 'utf8');
    const css = fs.readFileSync('style.css', 'utf8');

    // 1. WorkerClient file:// Blob Worker fallback & Int32Array flood-fill stack
    assert(!weJs.includes("location.protocol === 'file:') {\n          this.worker = null;"), 'WorkerClient must not unconditionally disable Web Worker on file:// protocol');
    assert(weJs.includes('new Int32Array') && wkJs.includes('new Int32Array'), 'worker_engine.js and worker.js must use pre-allocated Int32Array flood-fill stack');

    // 2. app.js grayOf ITU-R BT.601 RGB luminance & overlayData dark-substrate background
    assert(appJs.includes('(d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8'), 'app.js grayOf must compute full RGB luminance instead of Green channel only');
    assert(!appJs.includes('lC || !paper ? bg : bg'), 'Redundant ternary in overlayData must be removed');

    // 3. FiducialAligner 3-point Procrustes rotation & pivot center compensation
    assert(ribJs.includes('sumCos') && ribJs.includes('sumSin') && ribJs.includes('rotCBx'), 'FiducialAligner.applyTransform must compute 3-point Procrustes rotation and compensate for canvas center pivot');

    // 4. editor.js duplicateSelectedAnn & drawAnn image safety, ops.nums {N} fix, v2u CropBox, multi-word find
    assert(edJs.includes('delete copy.img;') && edJs.includes("'complete' in a.img"), 'editor.js must guard against serialized {} HTMLImageElement objects when duplicating/copying annotations');
    assert(edJs.includes("replace(/\\{n\\}/gi, String(i + p.start)).replace(/\\{N\\}/gi, String(N))"), 'ops.nums must replace {n} and {N} globally with true total page count N');
    assert(edJs.includes('pg.getCropBox ? pg.getCropBox() : null'), 'v2u and ops.nums must respect existing page CropBox');
    assert(extJs.includes('cloneBucket(E.ann)'), 'extras.js snap() must deep-clone annotation buckets across tabs');
    assert(menuJs.includes("['h', 'edit', () => ACT.tool('hand')") && menuJs.includes("['j', 'edit', () => ACT.tool('chl')"), 'menu.js must bind H to Hand Tool and J to Highlight without conflict');
    assert(!css.includes('title: "Collapse Sidebar ([)";'), 'Invalid CSS property title: must be removed from style.css');

    // 5. DXF cross-unit entity comparison (mm vs inches)
    const wMM = new DXF.DXFWriter({ unit: 'mm', scale: 1.0 });
    const fMM = 1 / wMM.scaleFactor;
    wMM.addLine(0, 0, 25.4 * fMM, 0, 'GEOMETRY');
    const wIN = new DXF.DXFWriter({ unit: 'in', scale: 1.0 });
    const fIN = 1 / wIN.scaleFactor;
    wIN.addLine(0, 0, 1.0 * fIN, 0, 'GEOMETRY');
    const pMM = new DXF.DXFParser(wMM.generateString()).parse();
    const pIN = new DXF.DXFParser(wIN.generateString()).parse();
    const crossDiff = DXF.compareDXFEntities(pMM, pIN, 0.05);
    assert.strictEqual(crossDiff.unchangedCount, 1, '25.4 mm line and 1.0 inch line must match as identical physical geometry');
  });

  test('MS Word-Style PDF Studio UI: Quick Styles Gallery, Print Ruler, List Formatting, and Zero-Jump Inline PDF Text Box', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const edJs = fs.readFileSync('editor.js', 'utf8');
    const css = fs.readFileSync('style.css', 'utf8');

    // Ensure no separate Word editor workspace exists — strictly a PDF Editor styled like MS Word
    assert(!html.includes('id="eword-workspace"'), 'Must not switch away to a separate Word editor workspace');
    assert(html.includes('id="eWordStylesGrp"') && html.includes('id="eQuickStylesRow"'), 'PDF Studio Home ribbon must include MS Word Quick Styles gallery (#eWordStylesGrp)');
    assert(html.includes('data-wstyle="normal"') && html.includes('data-wstyle="h1"') && html.includes('data-wstyle="title"'), 'Quick Styles must include Normal, Heading 1, Heading 2, Title, and Callout cards');
    assert(html.includes('id="rp-pdf-ruler"') && html.includes('id="rp-pdf-ruler-ticks"'), 'PDF Studio must include MS Word horizontal print ruler (#rp-pdf-ruler) above the PDF canvas');
    assert(html.includes('id="eListUl"') && html.includes('id="eListOl"') && html.includes('id="eNewBlankBtn"'), 'PDF Studio must include Bullet/Numbered list buttons and 1-click New Page button');
    assert(edJs.includes('applyMSWordStylePreset') && edJs.includes('togglePdfTextListFormat'), 'editor.js must implement applyMSWordStylePreset and togglePdfTextListFormat for PDF text');
    assert(css.includes('bottom: calc(100% + 4px)') && css.includes('.rp-inline-text-box.flip-bar-below'), 'style.css must position .rp-inline-text-bar above textarea to eliminate the 31px vertical jump when typing on PDF');
  });


  test('MS Word 45+ Fonts, Direct Click-to-Write on PDF Page, Equation Studio (Alt+=) & Page Modifications', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const edJs = fs.readFileSync('editor.js', 'utf8');
    const icJs = fs.readFileSync('icons.js', 'utf8');

    // 1. 45+ MS Word, Serif, Math & CAD fonts
    assert(html.includes('value="Calibri"') && html.includes('value="Aptos"') && html.includes('value="Cambria Math"') && html.includes('value="Cascadia Code"') && html.includes('value="ISOCPEUR"'),
      'index.html #eFontFam must include 45+ MS Word, Math & CAD fonts');
    assert(edJs.includes("'Cambria Math':") && edJs.includes("'Aptos':") && edJs.includes("'Cascadia Code':"),
      'editor.js FONT_STACKS must define full CSS font stacks for all 45+ fonts');

    // 2. Direct Click-to-Write on PDF Page in Select mode
    assert(edJs.includes("wrapEl.addEventListener('pointerup'") && edJs.includes("openInlineTextEditor({ mode: 'new', x: px, y: py })"),
      'editor.js must allow putting cursor anywhere on the PDF page and clicking to immediately write text');

    // 3. MS Word Equation Studio (Alt+=, 14 presets, 2D AST parser & canvas renderer)
    assert(icJs.includes('equation:') && html.includes('id="eEquationBtn"'), 'icons.js and index.html must include Equation tool button (#eEquationBtn)');
    assert(edJs.includes('EQUATION_PRESETS') && edJs.includes('function parseMathTokens(') && edJs.includes('function renderMathFormulaToCanvas(') && edJs.includes('function openEquationStudio('),
      'editor.js must implement MS Word Equation Studio with 2D fraction/radical/integral/summation rendering');

    // 4. MS Word Font & Paragraph extensions (Subscript, Superscript, Change Case, Clear Formatting, Line Spacing, Indent/Outdent, Justify, Checklist)
    assert(html.includes('id="eSubscript"') && html.includes('id="eSuperscript"') && html.includes('id="eChangeCase"') && html.includes('id="eClearFmt"') && html.includes('id="eLineSpacing"') && html.includes('id="eAlignJ"'),
      'index.html must include Subscript, Superscript, Change Case, Clear Formatting, Line Spacing, and Justify controls');

    // 5. MS Word Page Modifications (Margins, Page Color, Page Border, Cover Page, Insert Table)
    assert(html.includes('data-op="margins"') && html.includes('data-op="pagecolor"') && html.includes('data-op="pageborder"') && html.includes('data-op="coverpage"') && html.includes('data-op="table"'),
      'index.html must include Margins, Page Color, Page Border, Cover Page, and Table buttons');
    assert(edJs.includes('async margins(') && edJs.includes('async pagecolor(') && edJs.includes('async pageborder(') && edJs.includes('async coverpage(') && edJs.includes('async table('),
      'editor.js ops must implement margins, pagecolor, pageborder, coverpage, and table operations');
  });


  // ----------------------------------------------------
  // MODULE 10: 12 ENGINEERING & ADAPTABILITY UPGRADES
  // ----------------------------------------------------
  console.log('\n--- MODULE 10: 12 Engineering & Adaptability Upgrades ---');

  test('Mechanical & CAD Metrology: 3-Point Angle Protractor, 3-Point Circle/Arc ⌀/R Finder, Dimension Tolerance Parser & AS9102 FAI Schedule', () => {
    // 1. 3-Point Angle Protractor (90 deg right angle & 60 deg equilateral)
    const ang90 = Measure.calc3PointAngle({ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 100 });
    assert(Math.abs(ang90.degrees - 90.0) < 1e-6, '3-Point Angle for (100,0)-(0,0)-(0,100) must equal 90.0 deg');
    const ang60 = Measure.calc3PointAngle({ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 50, y: Math.sqrt(7500) });
    assert(Math.abs(ang60.degrees - 60.0) < 1e-2, '3-Point Angle must accurately compute 60.0 deg');

    // 2. 3-Point Circle / Arc Circumscribed Finder
    const circ = Measure.calc3PointCircle({ x: 100, y: 0 }, { x: 0, y: 100 }, { x: -100, y: 0 });
    assert(circ.valid === true, 'calc3PointCircle must solve non-collinear points');
    assert(Math.abs(circ.cx - 0) < 1e-6 && Math.abs(circ.cy - 0) < 1e-6, 'Circle center must be (0,0)');
    assert(Math.abs(circ.r - 100) < 1e-6 && Math.abs(circ.diameter - 200) < 1e-6, 'Radius must be 100 and diameter 200');

    // 3. Engineering Dimension Tolerance Parser & AS9102 Form 3 FAI Balloon Manager
    const dimSym = Measure.parseEngineeringDimension('⌀12.5 ±0.05 mm');
    assert.strictEqual(dimSym.prefix, '⌀');
    assert(Math.abs(dimSym.nominal - 12.5) < 1e-6);
    assert(Math.abs(dimSym.tolPlus - 0.05) < 1e-6 && Math.abs(dimSym.tolMinus - 0.05) < 1e-6);
    assert(Math.abs(dimSym.maxLimit - 12.55) < 1e-6 && Math.abs(dimSym.minLimit - 12.45) < 1e-6);

    const fai = new Measure.FAIManager();
    const b1 = fai.addBalloon(120, 240, 1, '⌀12.5 ±0.05 mm', 'B4', '12.52');
    const b2 = fai.addBalloon(300, 180, 1, '25.0 +0.10 / -0.05 mm', 'C2', '25.20');
    assert.strictEqual(b1.charNo, 1);
    assert.strictEqual(b1.status, 'PASS');
    assert.strictEqual(b2.charNo, 2);
    assert.strictEqual(b2.status, 'FAIL');
    const csv = fai.toAS9102CSV();
    assert(csv.includes('Char_No,Page,Ref_Zone,X,Y,Requirement_Text,Nominal,Tol_Plus,Tol_Minus,Min_Limit,Max_Limit,Units,Actual_Measured,Disposition'));
    assert(csv.includes('1,1,"B4",120,240,"⌀12.5 ±0.05 mm",12.5,0.05,0.05,12.45,12.55,mm,"12.52","PASS"'));
    assert(csv.includes('2,1,"C2",300,180,"25.0 +0.10 / -0.05 mm",25,0.1,0.05,24.95,25.1,mm,"25.20","FAIL"'));
  });

  test('ASME Y14.5 / ISO 1101 GD&T Feature Control Frame Compartments & Symbols', () => {
    assert(Array.isArray(Measure.GDT_SYMBOLS) && Measure.GDT_SYMBOLS.length >= 14, 'Must define 14 standard ASME Y14.5 GD&T symbols');
    assert(Measure.GDT_SYMBOLS.some(s => s.code === 'position' && s.sym === '⌖'), 'Must include Position (⌖)');
    const comps = Measure.buildGDTControlFrameCompartments({
      symbol: '⌖',
      diaPrefix: '⌀',
      tolerance: '0.05',
      modifier: 'Ⓜ',
      datumA: 'A',
      datumB: 'B',
      datumC: 'C(M)'
    });
    assert.strictEqual(comps[0], '⌖');
    assert.strictEqual(comps[1], '⌀0.05 Ⓜ');
    assert.strictEqual(comps[2], 'A');
    assert.strictEqual(comps[3], 'B');
    assert.strictEqual(comps[4], 'C(M)');
  });

  test('Electrical / PCB CAM: IPC-2141 Controlled Impedance (Microstrip/Stripline) & IPC-2152 Trace Current Calculator', () => {
    const ms = Measure.calcIPC2141Impedance({ mode: 'microstrip', traceWidthMils: 8, dielectricHeightMils: 4.5, traceThicknessOz: 1.0, er: 4.2 });
    assert(ms.z0Ohms > 35 && ms.z0Ohms < 75, 'Microstrip Z0 must be within physical RF impedance range (35-75 Ohms)');
    assert(ms.delayPsPerIn > 120 && ms.delayPsPerIn < 180, 'Microstrip propagation delay must be ~140-160 ps/in');

    const sl = Measure.calcIPC2141Impedance({ mode: 'stripline', traceWidthMils: 5, dielectricHeightMils: 10, traceThicknessOz: 1.0, er: 4.2 });
    assert(sl.z0Ohms > 30 && sl.z0Ohms < 90, 'Stripline Z0 must be within physical range');

    const cur = Measure.calcIPC2152Current({ traceWidthMils: 20, traceThicknessOz: 1.0, tempRiseC: 10, isInternal: false, lengthInches: 2.0 });
    assert.strictEqual(cur.areaSqMils, 27.4, '20 mil x 1.37 mil (1 oz) cross section must equal 27.4 sq mils');
    assert(cur.maxCurrentAmps > 1.2 && cur.maxCurrentAmps < 2.5, 'External 20 mil 1oz trace at +10C must carry ~1.46A');
    assert(cur.resistanceMilliohms > 0, 'Must compute DC resistance in milliohms');
  });

  test('Smart Compare & Alignment: 4-Corner Projective Homography Solver & AI-Free Semantic Defect Classification', () => {
    const src = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const dst = [{ x: 15, y: 25 }, { x: 215, y: 25 }, { x: 215, y: 225 }, { x: 15, y: 225 }];
    const H = Measure.computeHomography4Pt(src, dst);
    assert(Array.isArray(H) && H.length === 9, 'computeHomography4Pt must return 3x3 matrix');
    const mapped = Measure.applyHomographyPt(H, 50, 50);
    assert(Math.abs(mapped.x - 115) < 1e-4 && Math.abs(mapped.y - 125) < 1e-4, 'Homography must map center (50,50) to (115,125)');

    // Semantic Defect Classification
    const catTB = UI.DefectState.classifySemanticCategory({ x: 850, y: 880, w: 120, h: 60, area: 4000 }, 1000, 1000);
    const catDim = UI.DefectState.classifySemanticCategory({ x: 200, y: 200, w: 60, h: 8, area: 180 }, 1000, 1000);
    const catComp = UI.DefectState.classifySemanticCategory({ x: 400, y: 400, w: 40, h: 40, area: 1200 }, 1000, 1000);
    const catGeom = UI.DefectState.classifySemanticCategory({ x: 300, y: 300, w: 200, h: 150, area: 9500 }, 1000, 1000);
    assert.strictEqual(catTB, 'Title Block');
    assert.strictEqual(catDim, 'Dimension');
    assert.strictEqual(catComp, 'Component');
    assert.strictEqual(catGeom, 'Geometry');
  });

  test('UI & Workflow Adaptability: GD&T Builder, Title Block Stamp, Symbol Library, Net Tracer, BOM Locator, Markup Layers, Workspace Profiles & CLI --batch-ci', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const edJs = fs.readFileSync('editor.js', 'utf8');
    const ribJs = fs.readFileSync('ui_ribbon.js', 'utf8');
    const mainJs = fs.readFileSync('main.js', 'utf8');

    assert(!html.includes('id="rp-profile-sel"') && html.includes('id="rp-lang-sel"'), 'Top bar must remove #rp-profile-sel and include #rp-lang-sel');
    assert(html.includes('id="eMarkupLayerSel"'), 'Editor quickbar must include Multi-Discipline Markup Layer selector (#eMarkupLayerSel)');
    assert(html.includes('id="eGdtBtn"') && html.includes('id="eTitleBlockBtn"') && html.includes('id="eBlockLibBtn"'), 'Editor ribbon must include GD&T Frame, Title Block, and Symbol Library buttons');
    assert(html.includes('data-t="angle"') && html.includes('data-t="rad3"') && html.includes('data-t="fai"') && html.includes('id="eFaiExportBtn"'), 'Editor Measure ribbon must include Angle, 3-Pt Circle, FAI Balloon, and FAI CSV export buttons');
    assert(ribJs.includes('id="rib-net-tracer"') && ribJs.includes('id="rib-pcb-calc"') && ribJs.includes('id="rib-bom-locator"'), 'CAD/CAM ribbon must include Net Tracer, Stackup & Z0 Calculator, and BOM Locator buttons');
    assert(edJs.includes('function openGDTBuilder(') && edJs.includes('function openBlockLibraryModal(') && edJs.includes('async titleblock('), 'editor.js must implement openGDTBuilder, openBlockLibraryModal, and ops.titleblock');
    assert(mainJs.includes('batch-ci') && mainJs.includes('exportQAPackageZip'), 'main.js must support --batch-ci CLI automation');
  });


  test('Comprehensive UI Layout, Overflow, Modal Z-Index, Toast Placement & Fit-Page Scrollbar Fixes', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const css = fs.readFileSync('style.css', 'utf8');
    const edJs = fs.readFileSync('editor.js', 'utf8');
    const ribJs = fs.readFileSync('ui_ribbon.js', 'utf8');

    // 1. Top bar & quickbar select widths prevent text clipping
    assert(html.includes('id="rp-lang-sel"') && html.includes('International Languages') && html.includes('Indian Languages'),
      'index.html #rp-lang-sel must group International Languages first and Indian Languages last');
    assert(html.includes('id="eMarkupLayerSel" style="height:24px;font-size:11px;font-weight:600;max-width:176px;width:auto"'),
      'index.html #eMarkupLayerSel must have max-width:176px so Layer: All Disciplines never clips');

    // 2. Draw & Stamp groups start hidden on initial Home tab load
    assert(html.includes('<div class="grp" data-egrp="draw" hidden><div class="row" id="tools">'),
      'index.html #tools group must be hidden on initial Home tab startup');
    assert(html.includes('<div class="grp" data-egrp="draw" hidden><div class="row" id="eStampTools">'),
      'index.html #eStampTools group must be hidden on initial Home tab startup');

    // 3. Toast positioned above floating HUDs (#c-floating-hud & #e-floating-hud)
    assert(css.includes('#rp-toast-container') && css.includes('bottom: 68px !important;'),
      'style.css must position toast notifications at bottom: 68px above floating canvas HUDs');

    // 4. Empty thumbnails rail hidden when no PDF is loaded & Fit Page zero-scrollbar padding
    assert(css.includes('#thumbs:empty') && css.includes('padding-bottom: 10px !important;'),
      'style.css must hide empty #thumbs rail and eliminate excess #eview bottom padding');

    // 5. Dialog input width, checkbox alignment, focus scrollLeft reset, and z-index hierarchy
    assert(css.includes('z-index: 10050 !important;') && css.includes('.dl .fl input[type="checkbox"]'),
      'style.css must enforce #dlg z-index above .rp-modal and right-align 16px checkboxes in .dl .fl');
    assert(edJs.includes('first.scrollLeft = 0;') && edJs.includes('opts.text || opts.initialText'),
      'editor.js dialog() must keep input scrollLeft at 0 and openInlineTextEditor must support opts.initialText');
  });

  await testAsync('Native Vector DXF-to-PDF Engine (toVectorPDFBytes & dxfBytesToPDF) & Complete PDF-to-DXF Operator Extraction', async () => {
    const sampleDxf = DXF.generateSampleMechanicalDXF(true, 'mm');
    const parser = new DXF.DXFParser(sampleDxf).parse();
    assert(typeof parser.toVectorPDFBytes === 'function', 'DXFParser must expose toVectorPDFBytes()');
    assert(typeof DXF.dxfBytesToPDF === 'function', 'DXFEngine must expose dxfBytesToPDF()');

    const pdfBytes = await parser.toVectorPDFBytes({ background: '#ffffff', lineWidth: 1.8, showGrid: true });
    assert(pdfBytes instanceof Uint8Array && pdfBytes.length > 500, 'toVectorPDFBytes must generate valid PDF bytes');
    const headerStr = Buffer.from(pdfBytes.slice(0, 8)).toString('utf8');
    assert(headerStr.startsWith('%PDF-'), 'Generated DXF vector PDF must start with %PDF- header');

    const dxfSrc = fs.readFileSync('dxf_engine.js', 'utf8');
    assert(dxfSrc.includes('fillStroke: 24') && dxfSrc.includes('closeStroke: 21') && dxfSrc.includes('endPath: 28'),
      'exportPDFToDXF must support fillStroke, closeStroke, and endPath PDF operators');
  });

  test('High-DPI Vector Quality & Anti-Lag Architecture (Compare & PDF Studio)', () => {
    const appJs = fs.readFileSync('app.js', 'utf8');
    const proJs = fs.readFileSync('pro.js', 'utf8');
    const edJs = fs.readFileSync('editor.js', 'utf8');
    const ribJs = fs.readFileSync('ui_ribbon.js', 'utf8');
    const css = fs.readFileSync('style.css', 'utf8');

    // 1. Compare single-slot preview state, DPR-aware mipmaps, parallel render, and zero-copy unshifted getImageData
    assert(appJs.includes('S.preview = { k, n, W: r.c.width, H: r.c.height, dpi: sc * 72 }'),
      'app.js previewSingleSlot must populate S.preview for mipmaps and high-DPI vector sharpening');
    assert(appJs.includes('const effK = v.k * dpr;') && appJs.includes('effK < 0.5'),
      'app.js applyView must compute DPR-aware effK before selecting mipmap downsampling level');
    assert(appJs.includes("Promise.all([render('A', n, sc, !!keep), render('B', n, sc, !!keep)])"),
      'app.js analyze must render A and B concurrently via Promise.all');
    assert(appJs.includes('if (!ox && !oy && !rot && src && src.width === W && src.height === H)'),
      'app.js analyze get() must read unshifted canvas ImageData directly without allocating an extra WxH canvas');

    // 2. pro.js sharpen() task cancellation, sub-pixel anti-aliased diff ink, and rAF pointermove coalescing
    assert(proJs.includes('const cancelHqTasks = () =>') && proJs.includes('_hqTasks.push(rt)'),
      'pro.js must track and cancel in-flight PDF.js crop render tasks during pan/zoom');
    assert(!proJs.includes('Math.max(t === 1 ? ia : ib, 90)'),
      'pro.js sharpen() must not paint blocky 90/255 low-res background halos over white paper');
    assert(proJs.includes('scheduleRedrawOverlay') && proJs.includes('scheduleViewportHUD'),
      'pro.js must coalesce overlay and HUD redraws via requestAnimationFrame and skip passive OSNAP redraws');

    // 3. editor.js 2x Retina supersampling, task cancellation on queued zoom, cached text layer, and native DXF open
    assert(edJs.includes('let d = Math.max(dOv, 2.0);'),
      'editor.js renderPage must super-sample #ecv at >= 2.0x density for crisp text and CAD lines');
    assert(edJs.includes('E._tcCache') && edJs.includes('scheduleOverlay()'),
      'editor.js must cache page text content across zoom levels and coalesce pointermove overlay redraws');
    assert(edJs.includes('window.dxfBytesToPDF') && ribJs.includes('parser.toVectorPDFBytes'),
      'editor.js and ui_ribbon.js must render DXF files as native vector PDFs');
    assert(css.includes('will-change: transform;'),
      'style.css must promote #stage with will-change: transform for GPU compositor panning');
  });

  await testAsync('One-Time Conversion Caching & Zero-Lag Click Architecture', async () => {
    const appJs = fs.readFileSync('app.js', 'utf8');
    const proJs = fs.readFileSync('pro.js', 'utf8');
    const edJs = fs.readFileSync('editor.js', 'utf8');
    const ribJs = fs.readFileSync('ui_ribbon.js', 'utf8');

    // 1. Verify DXFParser.toVectorPDFBytes caches converted PDF bytes and returns identical reference on repeat call
    const dxfStr = DXF.generateSampleMechanicalDXF(false, 'mm');
    const parser = new DXF.DXFParser(dxfStr).parse();
    const pdf1 = await parser.toVectorPDFBytes({ background: '#ffffff', lineWidth: 2.0 });
    const pdf2 = await parser.toVectorPDFBytes({ background: '#ffffff', lineWidth: 2.0 });
    assert(pdf1 === pdf2, 'DXFParser.toVectorPDFBytes must return cached Uint8Array without re-converting when options match');

    // 2. Verify dxfBytesToPDF caches and passes through already-converted %PDF bytes
    const pdf3 = await DXF.dxfBytesToPDF(dxfStr);
    const pdf4 = await DXF.dxfBytesToPDF(dxfStr);
    const pdf5 = await DXF.dxfBytesToPDF(pdf3);
    assert(pdf3 === pdf4 && pdf5 === pdf3, 'dxfBytesToPDF must convert only once per DXF and never re-convert existing %PDF bytes');

    // 3. Verify CAMState.ensureParsed(), multi-page S.rcMap / S.analysisCache, 3px drag threshold, and editor page cache
    assert(ribJs.includes('ensureParsed()') && ribJs.includes('_cachedRenderKey'),
      'ui_ribbon.js must cache parsed CAM layers and converted CAM PDF bytes');
    assert(appJs.includes('S.rcMap') && appJs.includes('S.analysisCache') && appJs.includes('Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) <= 3'),
      'app.js must cache multi-page renders/analyses and enforce a 3px drag threshold on #vp clicks');
    assert(proJs.includes('hq._lastKey') && proJs.includes('window.rpAfterPan'),
      'pro.js sharpen() must memoize hq._lastKey and defer sharpen during active drag');
    assert(edJs.includes('E._pageCanvasCache') && edJs.includes('if (down.hadInline || down.hadSel) return;'),
      'editor.js must cache rendered page canvases and prevent inline text reopen when clicking to dismiss');
  });

  await testAsync('Multi-Layer CAM Stackup Engine (1 Layer = 1 CAM File, 100 Layers = 100 CAM Files) & ZIP Unpacking', async () => {
    // 1. Verify isCAMFileName and detectLayerType across 1..100+ layers
    assert(CAM.isCAMFileName('Board_Top.gtl') && CAM.isCAMFileName('Inner_Layer99.g99') && CAM.isCAMFileName('Signal_L100.l100'),
      'isCAMFileName must recognize .gtl, .g1..g100, and .l1..l100 layer extensions');

    const stackA = CAM.CAMJobStack.generateSampleMultiLayerStack(100, false, 'MM');
    const stackB = CAM.CAMJobStack.generateSampleMultiLayerStack(100, true, 'IN');
    assert.strictEqual(stackA.length, 100, 'Must generate 100 CAM layer files for Rev A');
    assert.strictEqual(stackB.length, 100, 'Must generate 100 CAM layer files for Rev B');

    // 2. Stage 100 CAM files into Rev A and 100 CAM files into Rev B (without auto-starting compare)
    UI.CAMState.layersA = [];
    UI.CAMState.layersB = [];
    const stagedA = await UI.stageUploadedCAMFiles(stackA, 'A', true);
    const stagedB = await UI.stageUploadedCAMFiles(stackB, 'B', true);
    assert.strictEqual(stagedA.countA, 100, 'Slot A must hold all 100 CAM layer files');
    assert.strictEqual(stagedB.countB, 100, 'Slot B must hold all 100 CAM layer files');
    assert.strictEqual(stagedB.pairedCount, 100, 'All 100 CAM layers must auto-pair 1-to-1 between Rev A and Rev B');

    // 3. Verify ZIP archive packing and unpacking for multi-file CAM bundles
    const zipSample = UI.buildZipArchive([
      { name: 'L1_Top.gtl', bytes: new TextEncoder().encode(stackA[0].text) },
      { name: 'L2_Inner1.g1', bytes: new TextEncoder().encode(stackA[1].text) },
      { name: 'L100_Bot.gbl', bytes: new TextEncoder().encode(stackA[99].text) }
    ]);
    const extracted = await UI.extractZipArchive(zipSample);
    assert.strictEqual(extracted.length, 3, 'extractZipArchive must unpack all 3 CAM layer files from .zip bundle');
    assert.strictEqual(extracted[2].name, 'L100_Bot.gbl');

    // 4. Verify Native Vector Multi-Page PDF generation for CAM layers
    UI.CAMState.ensureParsed();
    const sharedBounds = CAM.CAMJobStack.computeUnifiedBoundsInches([
      UI.CAMState.pairedLayers[0].layerA,
      UI.CAMState.pairedLayers[0].layerB
    ]);
    const vecPdf = await CAM.layersToVectorPDFBytes([
      { title: 'Layer 1', entries: [UI.CAMState.pairedLayers[0].layerA] },
      { title: 'Layer 2', entries: [UI.CAMState.pairedLayers[1].layerA] }
    ], { sharedBoundsInches: sharedBounds });
    assert(vecPdf instanceof Uint8Array && vecPdf.length > 500, 'layersToVectorPDFBytes must generate valid multi-page vector PDF');
  });

  test('Pre-Compare CAM Setup Modal (Ask Metric vs English & Format Before Compare) & Parser/Overlay Bug Fixes', () => {
    const appJs = fs.readFileSync('app.js', 'utf8');
    const proJs = fs.readFileSync('pro.js', 'utf8');
    const ribJs = fs.readFileSync('ui_ribbon.js', 'utf8');

    // 1. Verify upload routes through stageAndPromptCAMFiles & showCAMPreCompareModal instead of auto-comparing
    assert(appJs.includes('window.UIRibbon.stageAndPromptCAMFiles(camFiles, k)'),
      'app.js pickCompare must stage all selected CAM files and open Pre-Compare Setup Dialog instead of auto-comparing');
    assert(ribJs.includes('function showCAMPreCompareModal(') && ribJs.includes('Are these CAM layers in Metric (mm) or English (mils / inches)?'),
      'ui_ribbon.js must provide showCAMPreCompareModal asking Metric vs English and coordinate format before starting compare');

    // 2. Verify CAMState.getParseOptions passes defaultUnits and forceUnits overrides
    UI.setUnitSystem('metric', true);
    UI.CAMState.unitsOverrideA = 'METRIC';
    UI.CAMState.unitsOverrideB = 'ENGLISH';
    const optsA = UI.CAMState.getParseOptions('A');
    const optsB = UI.CAMState.getParseOptions('B');
    assert.strictEqual(optsA.units, 'MM');
    assert.strictEqual(optsA.forceUnits, true);
    assert.strictEqual(optsB.units, 'IN');
    assert.strictEqual(optsB.forceUnits, true);
    UI.CAMState.unitsOverrideA = 'AUTO';
    UI.CAMState.unitsOverrideB = 'AUTO';

    // 3. Verify ExcellonParser ;FILE_FORMAT=M:N and M71,LZ / M72,TZ bug fix
    const drlFmt = [
      'M48',
      'M71,LZ',
      ';FILE_FORMAT=4:2',
      'T01C1.00',
      '%',
      'T01',
      'X002540Y005080',
      'M30'
    ].join('\n');
    const dp = new CAM.ExcellonParser(drlFmt).parse();
    assert.strictEqual(dp.units, 'METRIC', 'M71,LZ must set METRIC units');
    assert.strictEqual(dp.intDigits, 4, ';FILE_FORMAT=4:2 must set intDigits=4');
    assert.strictEqual(dp.decDigits, 2, ';FILE_FORMAT=4:2 must set decDigits=2');
    assert(Math.abs(dp.hits[0].x - 25.4) < 1e-4 && Math.abs(dp.hits[0].y - 50.8) < 1e-4,
      '_parseExcellonNumber must use parsed 4:2 format digits (002540 -> 25.40 mm)');

    // 4. Verify CAMCompare.comparePrimitives & headless compare across Metric (MM) vs English (IN)
    const gA = new CAM.GerberParser(UI.CAMState.layersA[0].text, { units: 'MM', forceUnits: true }).parse();
    const gB = new CAM.GerberParser(UI.CAMState.layersB[0].text, { units: 'IN', forceUnits: true }).parse();
    const cmpRes = new CAM.CAMCompare(800, 600).compare(gA, gB, { compareTolMils: 0.5 });
    assert(cmpRes.primitiveDiff && cmpRes.primitiveDiff.totalDiffs > 0,
      'CAMCompare must detect modified trace on Layer 1 between Metric Rev A and English Rev B');

    // 5. Verify Net Tracer normRecords fix and pro.js mapBoardInchesToPx physical coordinate mapping
    assert(ribJs.includes('netName: r.netName || r.net') && proJs.includes('const mapBoardInchesToPx ='),
      'ui_ribbon.js Net Tracer must normalize r.net/r.netName and pro.js must map physical board coordinates (xIn/yIn & xMil/yMil)');
  });

  await testAsync('Anti-Lag Spatial Hash DFM Engine, Native Vector CAM PDF Cache & Bounded Memory Management', async () => {
    const camJs = fs.readFileSync('cam_engine.js', 'utf8');
    const appJs = fs.readFileSync('app.js', 'utf8');
    const edJs = fs.readFileSync('editor.js', 'utf8');
    const proJs = fs.readFileSync('pro.js', 'utf8');
    const extJs = fs.readFileSync('extras.js', 'utf8');
    const ribJs = fs.readFileSync('ui_ribbon.js', 'utf8');

    // 1. Verify Spatial Hash Grid in runDFMChecks and Vector Stack PDF Cache in layersToVectorPDFBytes
    assert(camJs.includes('flashGrid = new Map()') && camJs.includes('drillGrid = new Map()') && camJs.includes('_vectorStackPdfCache = new Map()'),
      'cam_engine.js must accelerate runDFMChecks with 2D spatial grid hashing and cache vector stackup PDFs');

    // 2. Verify layersToVectorPDFBytes returns identical cached Uint8Array reference on repeat call
    const gSample = new CAM.GerberParser('%FSLAX24Y24*%\n%MOIN*%\n%ADD10C,0.010*%\nD10*\nX1000Y1000D02*\nX2000Y2000D01*\nM02*').parse();
    const slide = [{ title: 'L1', entries: [{ id: 't1', name: 'L1.gtl', text: 'abc', _parseKey: 'k1', parsedGbr: gSample }] }];
    const vec1 = await CAM.layersToVectorPDFBytes(slide, { sharedBoundsInches: { minX: 0, minY: 0, maxX: 1, maxY: 1 } });
    const vec2 = await CAM.layersToVectorPDFBytes(slide, { sharedBoundsInches: { minX: 0, minY: 0, maxX: 1, maxY: 1 } });
    assert(vec1 === vec2, 'layersToVectorPDFBytes must return cached PDF bytes on identical layer/option signature');

    // 3. Verify app.js, editor.js, pro.js, extras.js, and ui_ribbon.js memory & anti-lag guards
    assert(appJs.includes('res.A = null; res.B = null; res.cls = null; res._ovData = null;') && appJs.includes('const camStats ='),
      'app.js must explicitly null out evicted ImageData buffers and use precomputed CAM layer stats in scanAll');
    assert(edJs.includes('const thumbQueue = [];') && edJs.includes('E._pageCanvasCache.size >= 1'),
      'editor.js must serialize thumbnail rendering via thumbQueue and cap _pageCanvasCache at 3 pages');
    assert(proJs.includes('o32 = new Uint32Array(o.data.buffer)') && proJs.includes('RM._posRaf = requestAnimationFrame'),
      'pro.js must use 32-bit pixel writes in sharpen() and throttle #pos coordinate DOM updates via requestAnimationFrame');
    assert(extJs.includes("'hist', 'redo', 'annUndo', 'annRedo'") && ribJs.includes('p._cachedStatsKey'),
      'extras.js must exclude heavy undo stacks from tab snapshots and ui_ribbon.js must cache per-layer DFM/primitive stats');
  });

  test('Uncompromised View/Check Resolution & Plain Icon-Driven Professional UI', () => {
    const appJs = fs.readFileSync('app.js', 'utf8');
    const edJs = fs.readFileSync('editor.js', 'utf8');
    const proJs = fs.readFileSync('pro.js', 'utf8');
    const ribJs = fs.readFileSync('ui_ribbon.js', 'utf8');
    const menuJs = fs.readFileSync('menu.js', 'utf8');
    const html = fs.readFileSync('index.html', 'utf8');
    const css = fs.readFileSync('style.css', 'utf8');

    // 1. Verify full-resolution ceilings are preserved without compromise
    assert(appJs.includes('MAXDIM = 9000, MAXAREA = 45e6'), 'app.js must maintain full 9000px / 45MP compare raster ceiling');
    assert(edJs.includes('area > 6e7') && edJs.includes('scale: s * DPR()'), 'editor.js must maintain full 60MP ceiling and Retina DPR thumbnails');
    assert(proJs.includes('W * H > 20e6'), 'pro.js sharpen() must maintain full 20MP high-zoom vector re-rasterization ceiling');
    assert(ribJs.includes('const mapPrimToRegion ='), 'ui_ribbon.js must map CAM primitive diffs to exact 300 DPI page coordinates');

    // 2. Verify AI-style decorative emojis and marketing hype are removed from UI files
    for (const [name, content] of [['index.html', html], ['ui_ribbon.js', ribJs], ['menu.js', menuJs], ['pro.js', proJs]]) {
      assert(!/[⚡📐📦🧩✨]/.test(content), `${name} must not contain decorative AI-style emojis`);
    }
    assert(!html.includes('100% OFFLINE') && !ribJs.includes('100% OFFLINE'), 'Marketing hype badges must be removed');
    assert(!menuJs.includes('Load Sample') && !menuJs.includes('Sample Schematic') && !proJs.includes('rp-help-sample-sch'), 'Menus and Help modal must not include built-in sample buttons');
    assert(!ribJs.includes('cam-pre-demo-8lyr') && !ribJs.includes('dxf-wb-sample-btn') && !ribJs.includes('cam-wb-sample-gbr'), 'Workbenches and setup modals must not include sample/demo buttons');
    assert(css.includes('19. Plain Professional CAD/CAM Workstation Aesthetic'), 'style.css must include plain professional workstation overrides');
    assert(appJs.includes('let _sharedOvData = null;') && proJs.includes('let _sharedHqImgData = null;') && edJs.includes('MAX_HIST_BYTES'), 'Compare, Sharpen, and PDF Studio must reuse shared ImageData buffers and bound undo history byte footprint');
    // 3. Verify idempotent parse() after raw string reclamation in CAM & DXF parsers
    const gp = new CAM.GerberParser('%FSLAX24Y24*%\n%MOIN*%\n%ADD10C,0.010*%\nD10*\nX1000Y1000D03*\nM02*').parse();
    assert.strictEqual(gp.raw, '', 'GerberParser must clear raw string after parse() to save RAM');
    assert.strictEqual(gp.parse(), gp, 'GerberParser.parse() must be idempotent on repeat calls');
    const dp = new DXF.DXFParser(DXF.generateSampleMechanicalDXF(false, 'mm')).parse();
    assert.strictEqual(dp.content, '', 'DXFParser must clear content string after parse() to save RAM');
    assert.strictEqual(dp.parse(), dp, 'DXFParser.parse() must be idempotent on repeat calls');
  });


  // ============================================================================
  // SUITE 30: Precision Stepped-Box Sub-Segment DXF Diffing & 5-10 Mil Stepped
  //           Small Box Highlighting ("box box box" along differing lines/curves)
  // ============================================================================
  test('SUITE 30: Precision Stepped-Box Sub-Segment DXF Diffing & 5-10 Mil Stepped Box Highlighting', () => {
    const DXFEngine = require(path.join(ROOT_DIR, 'dxf_engine.js'));
    const appSrc = fs.readFileSync(path.join(ROOT_DIR, 'app.js'), 'utf8');
    const studioSrc = fs.readFileSync(path.join(ROOT_DIR, 'dxf_studio.js'), 'utf8');
    const ribSrc = fs.readFileSync(path.join(ROOT_DIR, 'ui_ribbon.js'), 'utf8');

    // 1. Verify collinear line extension / partial polyline modification clips out common segments and isolates only the changed segment
    const dxfRectA = new DXFEngine.DXFWriter({ unit: 'mm', scale: 1.0 });
    const fA = 1 / dxfRectA.scaleFactor;
    dxfRectA.addRect(38 * fA, 66 * fA, 26 * fA, 14 * fA, 'CONNECTOR_CUTOUTS'); // x=38..64, y=66..80
    dxfRectA.addLine(10 * fA, 20 * fA, 80 * fA, 20 * fA, 'TRACES');            // Line from x=10 to x=80

    const dxfRectB = new DXFEngine.DXFWriter({ unit: 'mm', scale: 1.0 });
    const fB = 1 / dxfRectB.scaleFactor;
    dxfRectB.addRect(38 * fB, 66 * fB, 34 * fB, 14 * fB, 'CONNECTOR_CUTOUTS'); // x=38..72, y=66..80 (only right side x=64..72 changed!)
    dxfRectB.addLine(10 * fB, 20 * fB, 100 * fB, 20 * fB, 'TRACES');           // Extended line from x=10..80 to x=10..100 (only x=80..100 added!)

    const pRectA = new DXFEngine.DXFParser(dxfRectA.generateString()).parse();
    const pRectB = new DXFEngine.DXFParser(dxfRectB.generateString()).parse();
    const diff = DXFEngine.compareDXFEntities(pRectA, pRectB, { tol: 0.05 });

    const traceAdd = diff.added.find(e => e.layer === 'TRACES');
    assert(traceAdd && Array.isArray(traceAdd._diffSubSegments) && traceAdd._diffSubSegments.length === 1,
      'Extended LINE (10..80 -> 10..100) must isolate exactly 1 added sub-segment (80..100)');
    assert(Array.isArray(traceAdd._commonSubSegments) && traceAdd._commonSubSegments.length === 1,
      'Extended LINE must preserve the shared (10..80) segment in _commonSubSegments so it is not falsely highlighted');
    assert(Math.abs(traceAdd._diffBBox.minX - 80) < 0.2 && Math.abs(traceAdd._diffBBox.maxX - 100) < 0.2,
      `Sub-segment _diffBBox must tighten to the changed extension [80..100], got [${traceAdd._diffBBox.minX}..${traceAdd._diffBBox.maxX}]`);

    const cutoutPair = diff.modifiedPairs.find(m => m.layer === 'CONNECTOR_CUTOUTS');
    assert(cutoutPair && cutoutPair.bbox.minX >= 63.8,
      `Modified rectangle pairBBox must tighten to the changed right section (minX >= 63.8 instead of 38), got minX=${cutoutPair && cutoutPair.bbox.minX}`);

    // 2. Verify computeSteppedDiffBoxes generates a chain of small 5-10 mil square boxes ("box box box") along lines & curves
    const boxes5Mil = DXFEngine.computeSteppedDiffBoxes(traceAdd, (wx, wy) => [wx * 10, wy * 10], {
      boxSizeMils: 5,
      toMils: 39.3700787,
      scale: 10,
      canvasW: 2000,
      canvasH: 1500
    });
    assert(Array.isArray(boxes5Mil) && boxes5Mil.length >= 10,
      `computeSteppedDiffBoxes must step multiple small boxes ("box box box") along a line segment, got ${boxes5Mil.length} boxes`);
    for (const sb of boxes5Mil) {
      assert(sb.w >= 5 && sb.w <= 10 && sb.w === sb.h && sb.mils === 5,
        `Every stepped highlight box must be a small square (5-10 px, 5 mils), got ${sb.w}x${sb.h}`);
      // Ensure no boxes are generated on the unchanged x=10..80 (100..800 px) portion of the line!
      assert(sb.x + sb.w * 0.5 >= 795,
        `Stepped highlight boxes must only be placed on the changed extension (px >= 795), got box at x=${sb.x}`);
    }

    // 3. Verify app.js, dxf_studio.js, and ui_ribbon.js wire up subBoxes and standard 7-mil highlightBoxMils
    assert(appSrc.includes('computeSteppedDiffBoxes') && appSrc.includes('g.subBoxes'),
      'app.js must generate and render stepped g.subBoxes in analyze(), drawMarkersToContext(), and hitRegionAt()');
    assert(studioSrc.includes('drawSteppedBoxesForEntity') && studioSrc.includes('drawEntityWithPreciseSubSegments'),
      'dxf_studio.js must render sub-segment diffs and highlight boxes in Overlay mode');
    assert(ribSrc.includes('highlightBoxMils: 7') && !ribSrc.includes('id="dxf-pre-box-mils"') && !studioSrc.includes('id="dxf-st-box-toggle"'),
      'Native Compare must use standard 7 mils (highlightBoxMils: 7) and remove the Boxes toggle and 5 mils dropdown');
  });


  // ============================================================================
  // SUITE 31: Modular File Split Architecture, Comparing & Memory Bug Fixes,
  //           DXF Studio Precision Tools (BREAK, LENGTHEN, ORIGIN, PURGE, AREA)
  //           & Engineering Section Documentation Labels
  // ============================================================================
  test('SUITE 31: Modular File Split, Comparing & Memory Fixes, DXF Studio Tools & Engineering Labels', () => {
    const DXFCmpCore = require(path.join(ROOT_DIR, 'dxf_compare_core.js'));
    const DXFStTools = require(path.join(ROOT_DIR, 'dxf_studio_tools.js'));
    const CmpMemGuard = require(path.join(ROOT_DIR, 'compare_memory_guard.js'));
    const I18nCat = require(path.join(ROOT_DIR, 'ui_i18n_catalog.js'));
    const DXFEngine = require(path.join(ROOT_DIR, 'dxf_engine.js'));
    const DXFStudio = require(path.join(ROOT_DIR, 'dxf_studio.js'));
    const UI = require(path.join(ROOT_DIR, 'ui_ribbon.js'));

    // 1. Verify all 4 split companion modules load and export their APIs cleanly
    assert(DXFCmpCore && typeof DXFCmpCore.computeSteppedDiffBoxes === 'function' && typeof DXFCmpCore.clipSegmentAgainstPool === 'function',
      'dxf_compare_core.js must export computeSteppedDiffBoxes and clipSegmentAgainstPool');
    assert(DXFStTools && typeof DXFStTools.breakEntityAtPoint === 'function' && typeof DXFStTools.lengthenEntity === 'function' &&
           typeof DXFStTools.moveEntitiesToOrigin === 'function' && typeof DXFStTools.purgeDrawing === 'function' &&
           typeof DXFStTools.computeSelectionMetrics === 'function',
      'dxf_studio_tools.js must export breakEntityAtPoint, lengthenEntity, moveEntitiesToOrigin, purgeDrawing, and computeSelectionMetrics');
    assert(CmpMemGuard && typeof CmpMemGuard.releaseAnalysisResult === 'function' && typeof CmpMemGuard.classifyDiffPixelTint === 'function' &&
           typeof CmpMemGuard.transformSubBoxes === 'function',
      'compare_memory_guard.js must export releaseAnalysisResult, classifyDiffPixelTint, and transformSubBoxes');
    assert(I18nCat && Array.isArray(I18nCat.I18N_BASE_KEYS) && I18nCat.I18N_BASE_KEYS.length > 50 && I18nCat.RAW_LANG_PACKS && I18nCat.RAW_LANG_PACKS.en,
      'ui_i18n_catalog.js must export I18N_BASE_KEYS and 46-language RAW_LANG_PACKS');

    // 2. Verify CompareMemoryGuard custom tint classification and deterministic buffer zeroization
    const dummyRes = {
      A: { data: new Uint8ClampedArray([255, 128, 64, 255]) },
      B: { data: new Uint8ClampedArray([10, 200, 30, 255]) },
      cls: new Uint8Array([1, 2, 0, 1]),
      _ovData: { data: new Uint8ClampedArray([100, 100, 100, 255]) }
    };
    const bufRefA = dummyRes.A.data;
    CmpMemGuard.releaseAnalysisResult(dummyRes, slice => slice.fill(0));
    assert.strictEqual(bufRefA[0], 0, 'releaseAnalysisResult must deterministically zeroize underlying pixel buffer before releasing references');
    assert.strictEqual(dummyRes.A, null, 'releaseAnalysisResult must null out res.A');
    assert.strictEqual(dummyRes.cls, null, 'releaseAnalysisResult must null out res.cls');

    // Custom tint classification (e.g., Cyan #06b6d4 for Rev A vs Magenta #d946ef for Rev B)
    const clsCyanA = CmpMemGuard.classifyDiffPixelTint(6, 182, 212, 255, 255, 255, 30, '#06b6d4', '#d946ef');
    const clsMagB = CmpMemGuard.classifyDiffPixelTint(255, 255, 255, 217, 70, 239, 30, '#06b6d4', '#d946ef');
    assert.strictEqual(clsCyanA, 1, 'classifyDiffPixelTint must classify custom Cyan Rev A stroke as Slot A (1)');
    assert.strictEqual(clsMagB, 2, 'classifyDiffPixelTint must classify custom Magenta Rev B stroke as Slot B (2)');

    // 3. Verify DXFStudio new precision tools: BREAK, LENGTHEN, ORIGIN, PURGE, AREA, BOXSIZE, DIFFBOXES, trimMemory
    global.window = global.window || {};
    global.window.DXFState = UI.DXFState;
    DXFStudio.createNewBlankDXF('mm');
    const parser = UI.DXFState.parsedB;
    const testLine = { _id: 'brk_l1', type: 'LINE', layer: '0', x1: 10, y1: 20, x2: 110, y2: 20 };
    parser.entities.push(testLine);
    const brkRes = DXFStudio.breakEntityAtPoint(testLine, 60, 20, parser);
    assert(brkRes && brkRes.ok && Math.abs(testLine.x2 - 60) < 0.01 && Math.abs(brkRes.created.x1 - 60) < 0.01,
      'breakEntityAtPoint must split a 100mm LINE at X=60 into two connected 50mm LINE entities');

    DXFStudio.StudioState.selectedIds = new Set([brkRes.created._id]);
    const lenCnt = DXFStudio.lengthenSelectedEntities(15);
    assert.strictEqual(lenCnt, 1, 'lengthenSelectedEntities(15) must lengthen the selected LINE');
    assert(Math.abs(brkRes.created.x2 - 125) < 0.01, `Lengthened LINE x2 must advance from 110 to 125, got ${brkRes.created.x2}`);

    const metrics = DXFStudio.computeSelectionAreaAndLength();
    assert(Math.abs(metrics.totalLength - 65) < 0.01, `computeSelectionAreaAndLength must report 65mm length, got ${metrics.totalLength}`);

    const origRes = DXFStudio.moveSelectionToOrigin(false);
    assert(origRes.moved === 1 && Math.abs(brkRes.created.x1 - 0) < 0.01 && Math.abs(brkRes.created.y1 - 0) < 0.01,
      'moveSelectionToOrigin must shift selected entity min-extents to (0,0)');

    assert.strictEqual(DXFStudio.setHighlightBoxMils(10), 10, 'setHighlightBoxMils(10) must update DXFState.highlightBoxMils to 10 mils');
    assert.strictEqual(UI.DXFState.highlightBoxMils, 10, 'DXFState.highlightBoxMils must equal 10');
    DXFStudio.setHighlightBoxMils(7);

    // 4. Verify Engineering Section Labels ("[MODULE SECTION:") are present across core & split modules
    for (const fn of ['app.js', 'pro.js', 'dxf_engine.js', 'dxf_studio.js', 'ui_ribbon.js', 'cam_engine.js', 'worker_engine.js',
                      'dxf_compare_core.js', 'dxf_studio_tools.js', 'compare_memory_guard.js', 'ui_i18n_catalog.js']) {
      const content = fs.readFileSync(path.join(ROOT_DIR, fn), 'utf8');
      assert(content.includes('[MODULE SECTION:') && content.includes('WHAT THIS IS:') && content.includes('WHY / HOW TO EDIT:'),
        `${fn} must include structured [MODULE SECTION:] engineering documentation headers`);
    }
  });

  console.log('\n====================================================');
  
test("Report Generation, Gerber Zoom Fine-Text Sharpness, Scale Calibration & Full Keyboard Shortcuts", () => {
  const appSrc = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
  const ribbonSrc = fs.readFileSync(path.join(ROOT_DIR, "ui_ribbon.js"), "utf8");
  const camSrc = fs.readFileSync(path.join(ROOT_DIR, "cam_engine.js"), "utf8");
  const proSrc = fs.readFileSync(path.join(ROOT_DIR, "pro.js"), "utf8");
  const editorSrc = fs.readFileSync(path.join(ROOT_DIR, "editor.js"), "utf8");
  const indexSrc = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");
  assert(appSrc.includes("canvasToJpgBytesSafe") && appSrc.includes("Ohm"), "app.js must sanitize Unicode/WinAnsi chars and safely encode canvas images in exportReport");
  assert(ribbonSrc.includes("3B. IPC DFM / DRC Rule Alerts") && ribbonSrc.includes("DefectState.initFromRegions"), "ui_ribbon.js generateExecutiveAuditReport must sync DefectState and include IPC DFM/DRC alerts");
  assert(camSrc.includes("isFineTextOrSilk ? 0.06 : 0.14") && camSrc.includes("diaIn <= 0.006"), "cam_engine.js must preserve fine 0-aperture silkscreen/copper text without 0.75pt stroke bloating");
  assert(proSrc.includes("bgSrcR") && appSrc.includes("bgSrcR"), "app.js and pro.js must compute dark-substrate ink against bgSrcR/G/B to prevent anti-aliased text haloing on zoom");
  assert(ribbonSrc.includes("getEffectiveDpi(") && proSrc.includes("CAMState.getEffectiveDpi"), "ui_ribbon.js and pro.js must compute true physical DPI from Gerber/CAM and DXF bounds");
  assert(editorSrc.includes("calPtsPerInch") && indexSrc.includes("data-t=\"calibrate\""), "PDF Studio must support interactive 2-point scale calibration");
  assert(ribbonSrc.includes("pdfStudioAndExport") && ribbonSrc.includes("Alt+Arrows"), "KEYBOARD_SHORTCUTS_SPEC must include all 4 comprehensive shortcut groups");
});


test("Compare Page Navigation Keys, Interactive Shortcut Editor (Custom + Default) & UI Leak Fixes", () => {
  const sm = UI.ShortcutManager;
  assert(sm && typeof sm.getAllItems === "function", "UIRibbon must expose ShortcutManager");
  const allItems = sm.getAllItems();
  assert(allItems.length >= 65, "ShortcutManager must register 65+ customizable actions across all modules");
  assert.strictEqual(sm.getDefaultKey("cmp_next_page"), "right", "Default key for Compare Next Page must be Right Arrow");
  assert.strictEqual(sm.getDefaultKey("cmp_prev_page"), "left", "Default key for Compare Previous Page must be Left Arrow");

  // Verify setting custom shortcut and resetting to default
  sm.setCustomKey("cmp_next_page", "f8");
  assert.strictEqual(sm.getActiveKey("cmp_next_page"), "f8", "Custom shortcut f8 must override default key");
  assert.strictEqual(sm.isCustomized("cmp_next_page"), true, "isCustomized must be true when custom key is set");
  assert.strictEqual(sm.getDefaultKey("cmp_next_page"), "right", "getDefaultKey must preserve factory default right");
  sm.resetKey("cmp_next_page");
  assert.strictEqual(sm.getActiveKey("cmp_next_page"), "right", "resetKey must restore factory default right");
  assert.strictEqual(sm.isCustomized("cmp_next_page"), false, "isCustomized must be false after reset");

  // Verify HUD HTML includes custom shortcut editor controls and default labels
  const hudHtml = UI.buildKeyboardHUDHTML();
  assert(hudHtml.includes("rp-sc-edit-btn") && hudHtml.includes("rp-sc-reset-btn") && hudHtml.includes("Default:"), "HUD must render interactive custom shortcut buttons, reset buttons, and Default labels");

  // Verify UI leak fixes in style.css and index.html
  const cssSrc = fs.readFileSync(path.join(ROOT_DIR, "style.css"), "utf8");
  const htmlSrc = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");
  assert(cssSrc.includes("grid-template-columns: repeat(3, minmax(0, 1fr)) !important"), "Launchpad cards must use minmax(0, 1fr) to prevent card overflow leak");
  assert(cssSrc.includes("flex-wrap: wrap !important") && htmlSrc.includes("id=\"cHudNextPg\"") && htmlSrc.includes("id=\"shortcuts-btn\""), "Ribbon must wrap cleanly and include Compare HUD page navigation and topbar shortcuts button");
});


await testAsync("Instant Multi-Page Compare Cache (Zero Re-Compare on Page Switch) & Full Gerber Arc/Obround/Macro Fidelity", async () => {
  const appSrc = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
  const edSrc = fs.readFileSync(path.join(ROOT_DIR, "editor.js"), "utf8");
  const camSrc = fs.readFileSync(path.join(ROOT_DIR, "cam_engine.js"), "utf8");
  const proSrc = fs.readFileSync(path.join(ROOT_DIR, "pro.js"), "utf8");

  // 1. Verify instant page switch cache (getCachedPageAnalysis, S.inflightAnalyze, keepInCache = n <= 12)
  assert(appSrc.includes("function getCachedPageAnalysis(n)") && appSrc.includes("S.inflightAnalyze") && appSrc.includes("const keepInCache = n <= 12;"),
    "app.js must cache up to 12 compared pages during scanAll and switch pages synchronously via getCachedPageAnalysis without re-comparing");
  assert(edSrc.includes("E._pageCanvasCache.size >= 10"),
    "editor.js must maintain a 10-page LRU canvas cache for instant page switching");

  // 2. Verify Gerber G02/G03 arc tessellation in G36 regions and layersToVectorPDFBytes, plus Obround (O) & Macro support
  const gbrArcAndMacro = [
    "%FSLAX24Y24*%",
    "%MOMM*%",
    "%AMTHERM80*21,1,0.850,0.450,0,0,0*%",
    "%ADD10C,0.150*%",
    "%ADD11O,1.200X0.600*%",
    "%ADD12THERM80*%",
    "G75*",
    "D10*",
    "X100000Y100000D02*",
    "G02X150000Y150000I50000J0D01*",
    "G36*",
    "X200000Y200000D02*",
    "G03X250000Y250000I50000J0D01*",
    "G01X200000Y250000D01*",
    "X200000Y200000D01*",
    "G37*",
    "D11*",
    "X300000Y300000D03*",
    "D12*",
    "X350000Y350000D03*",
    "M02*"
  ].join("\n");
  const parsedArcGbr = new CAM.GerberParser(gbrArcAndMacro).parse();
  const ap12 = parsedArcGbr.apertures.get(12);
  assert(ap12 && ap12.type === "R" && Math.abs(ap12.params[0] - 0.85) < 1e-3, "GerberParser must extract shape and dimensions from %AM macro definitions");
  const regCmd = parsedArcGbr.commands.find(c => c.op === "REGION");
  assert(regCmd && regCmd.points.length > 6, "GerberParser must tessellate G02/G03 arcs inside G36/G37 copper pour regions");
  const pdfVec = await CAM.layersToVectorPDFBytes([{ title: "ArcTest", entries: [{ id: "a1", name: "arc.gtl", parsedGbr: parsedArcGbr }] }]);
  assert(pdfVec && pdfVec.length > 500, "layersToVectorPDFBytes must render tessellated G02/G03 arcs and Obround pads cleanly");
  assert(camSrc.includes("ap.type === \x27O\x27 && renderMode === \x27fill\x27") && proSrc.includes("darkSub && m === \x27over\x27"),
    "cam_engine.js and pro.js must render true Obround stadium pads and preserve PCB trace contrast in Overlay dark (CAM) mode");
});


test("Workstation Dark/White Theme Overhaul, Multi-Layered CAD Loading Animation & Algorithmic Optimizations", () => {
  const htmlSrc = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");
  const cssSrc = fs.readFileSync(path.join(ROOT_DIR, "style.css"), "utf8");
  const proSrc = fs.readFileSync(path.join(ROOT_DIR, "pro.js"), "utf8");
  const appSrc = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
  const edSrc = fs.readFileSync(path.join(ROOT_DIR, "editor.js"), "utf8");
  const weSrc = fs.readFileSync(path.join(ROOT_DIR, "worker_engine.js"), "utf8");

  // 1. Verify Structured CAD/CAM Workstation Start Panels
  assert(htmlSrc.includes("rp-ws-start") && htmlSrc.includes("rp-ws-slots") && htmlSrc.includes("rp-ws-kbd"),
    "index.html must structure #empty and #eempty as professional CAD/CAM workstation start panels");

  // 2. Verify Multi-Layered CAD Loading Animation System (#rp-load SVG reticle + #rp-stage-loader banner)
  assert(proSrc.includes("rp-cad-reticle-svg") && proSrc.includes("rp-stage-loader") && proSrc.includes("inferProgressSub"),
    "pro.js must implement dual-ring SVG CAD spinner (#rp-load) and in-viewport stage reticle banner (#rp-stage-loader)");

  // 3. Verify Dark Slate & Daylight White Workstation Themes in style.css
  assert(cssSrc.includes("--bg:#0d1117;--panel:#131820") && cssSrc.includes("--bg:#f1f5f9;--panel:#ffffff"),
    "style.css must define cohesive Dark Slate and Daylight White workstation color tokens");
  assert(cssSrc.includes("@keyframes rpReticleCW") && cssSrc.includes("@keyframes rpReticleCCW"),
    "style.css must define counter-rotating SVG CAD reticle keyframe animations");

  // 4. Verify Algorithmic Optimizations & Bug Fixes (ignFlat Float64Array, Int32Array BFS stack, syncPrintRuler, async Blob worker fallback)
  assert(appSrc.includes("const ignFlat = hasIgn ? new Float64Array(ign.length * 4) : null;") && appSrc.includes("q = new Int32Array(Math.max(1, gw * gh))"),
    "app.js analyze() must use flat Float64Array ignore bounds and pre-allocated Int32Array BFS stack");
  assert(edSrc.includes("function syncPrintRuler(vp1, logicalWidth)"),
    "editor.js must synchronize #rp-pdf-ruler across all renderPage cache and fresh render paths");
  assert(weSrc.includes("const createBlobWorker = () =>") && weSrc.includes("(dA[i] * 77 + dA[i + 1] * 150 + dA[i + 2] * 29) >> 8"),
    "worker_engine.js must provide async onerror Blob Worker fallback and fast integer luminance diffing");
});


test("v1.2.3 Hardening: npm test script, Headless Test Guards, Adaptive Hardware Safeguard & Explicit Control Bindings", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  const nsi = fs.readFileSync(path.join(ROOT_DIR, "installer.nsi"), "utf8");
  const html = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");
  const readme = fs.readFileSync(path.join(ROOT_DIR, "README.md"), "utf8");
  const buildSetup = fs.readFileSync(path.join(ROOT_DIR, "build_setup.js"), "utf8");
  const appSrc = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
  const edSrc = fs.readFileSync(path.join(ROOT_DIR, "editor.js"), "utf8");
  const ribSrc = fs.readFileSync(path.join(ROOT_DIR, "ui_ribbon.js"), "utf8");
  const errLog = fs.readFileSync(path.join(ROOT_DIR, "error.txt"), "utf8");

  // Module 1: package.json test script & guarded legacy browser scripts in tests/
  assert.strictEqual(pkg.scripts.test, "node tests/v21_test_suite.js", "package.json must define test script");
  for (const tf of ["smoke.js", "blank.js", "fit.js", "text.js", "editor.js", "ops.js"]) {
    const tfSrc = fs.readFileSync(path.join(ROOT_DIR, "tests", tf), "utf8");
    assert(tfSrc.includes("typeof window === 'undefined'"), `tests/${tf} must guard against missing window/document in headless Node.js`);
  }

  // Module 2: Version 1.2.3 synchronization
  assert.strictEqual(pkg.version, "1.2.3");
  assert(nsi.includes('!define VERSION "1.2.3"') && nsi.includes('VIProductVersion "1.2.3.0"'));
  assert(html.includes("Version 1.2.3") && readme.includes("1.2.3") && buildSetup.includes("KenshoPro-Setup-1.2.3.exe"));

  // Module 3: Adaptive hardware & low-spec memory safeguard in app.js
  assert(appSrc.includes("const devMem = (typeof navigator !== 'undefined' && navigator.deviceMemory) ? navigator.deviceMemory : 8;"));
  assert(appSrc.includes("const isLowSpec = devMem <= 4;"));
  assert(appSrc.includes("MAXDIM = 6144; MAXAREA = 25000000;") && appSrc.includes("function applyPerformanceMode("));
  assert(ribSrc.includes('id="rib-perf-mode"') && ribSrc.includes("Maximum Detail") && ribSrc.includes("High Performance"));

  // Module 4: Explicit control bindings, modal focus/backdrop cleanup, and error.txt audit log
  assert(edSrc.includes("if ($('#eNewBlankBtn')) $('#eNewBlankBtn').onclick = () => ACT.op('blank');"));
  assert(edSrc.includes("if ($('#eInsertTableBtn')) $('#eInsertTableBtn').onclick = () => ACT.op('table');"));
  assert(edSrc.includes("$('#dlg').onclick = ev => { if (ev.target.id === 'dlg') done(null); };"));
  assert(errLog.includes("KENSHO PRO v1.2.3"));
});


await testAsync("Previous-Page Compare Overlay Isolation, S.analysisCache Integrity, View Restore & CAM/DXF Fixes", async () => {
  const appSrc = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
  const camSrc = fs.readFileSync(path.join(ROOT_DIR, "cam_engine.js"), "utf8");
  const dxfSrc = fs.readFileSync(path.join(ROOT_DIR, "dxf_engine.js"), "utf8");
  const ribSrc = fs.readFileSync(path.join(ROOT_DIR, "ui_ribbon.js"), "utf8");

  // 1. Verify per-page r._ovData isolation in overlayData(r, m) and isAnalysisCached guard
  assert(appSrc.includes("if (r._ovKey === ovKey && r._ovData && r._ovData.width === W && r._ovData.height === H)") &&
         appSrc.includes("r._ovData = new ImageData(W, H);") &&
         appSrc.includes("function isAnalysisCached(res)"),
    "app.js must isolate per-page composite ImageData in r._ovData and protect S.analysisCache entries from buffer nulling");

  // 2. Verify balanced busy(true)/busy(false) via didBusy and setView('compare') repaint restoration
  assert(appSrc.includes("let didBusy = false;") && appSrc.includes("finally { if (didBusy) busy(false); }"),
    "app.js show(n) must balance busy(true) and busy(false) on fast cached page switches");
  assert(appSrc.includes("if (v === 'compare')") && appSrc.includes("if (window.rpSharpen) window.rpSharpen();"),
    "app.js setView('compare') must repaint and re-sharpen when returning from PDF Studio Editor to Compare");

  // 3. Verify DefectState.initFromRegions does not bleed previous page defects onto new pages
  assert(ribSrc.includes("const priorList = (this.byPage && this.byPage[pageN]) ? this.byPage[pageN] : [];"),
    "ui_ribbon.js DefectState.initFromRegions must not fall back to previous page this.defects");

  // 4. Verify CAM PCBRenderer gUnit fix and 2-file auto-pairing in stageUploadedCAMFiles
  assert(!camSrc.includes("gerber.units") && camSrc.includes("gUnit === 'MM' ? 0.0635 : 0.0025"),
    "cam_engine.js PCBRenderer.render must reference gUnit instead of undeclared gerber.units");
  UI.CAMState.layersA = [];
  UI.CAMState.layersB = [];
  const pairRes = await UI.stageUploadedCAMFiles([
    { name: "Board_RevA.gtl", text: "%FSLAX24Y24*%\n%MOIN*%\n%ADD10C,0.010*%\nD10*\nX1000Y1000D03*\nM02*" },
    { name: "Board_RevB.gtl", text: "%FSLAX24Y24*%\n%MOIN*%\n%ADD10C,0.010*%\nD10*\nX2000Y2000D03*\nM02*" }
  ], "A", false);
  assert.strictEqual(pairRes.countA, 1, "Selecting 2 CAM files (RevA & RevB) via Open Base (A) must stage RevA in Slot A");
  assert.strictEqual(pairRes.countB, 1, "Selecting 2 CAM files (RevA & RevB) via Open Base (A) must stage RevB in Slot B");

  // 5. Verify DXFParser handles leading blank lines and cross-unit DXF comparison
  const dxfWithLeadingBlanks = "\n\n   \n  0\nSECTION\n  2\nHEADER\n  9\n$INSUNITS\n 70\n4\n  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES\n  0\nLINE\n  8\n0\n 10\n25.4\n 20\n25.4\n 11\n50.8\n 21\n50.8\n  0\nENDSEC\n  0\nEOF\n";
  const dxfInInches = "  0\nSECTION\n  2\nHEADER\n  9\n$INSUNITS\n 70\n1\n  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES\n  0\nLINE\n  8\n0\n 10\n1.0\n 20\n1.0\n 11\n2.0\n 21\n2.0\n  0\nENDSEC\n  0\nEOF\n";
  const pMm = new DXF.DXFParser(dxfWithLeadingBlanks).parse();
  const pIn = new DXF.DXFParser(dxfInInches).parse();
  assert.strictEqual(pMm.entities.length, 1, "DXFParser must parse ASCII DXF files with leading blank lines without desynchronizing pairs");
  const crossUnitDiff = DXF.compareDXFEntities(pMm, pIn, 0.05);
  assert.strictEqual(crossUnitDiff.unchangedCount, 1, "compareDXFEntities must match identical geometry across mm ($INSUNITS=4) and inches ($INSUNITS=1)");
  assert(ribSrc.includes("const sharedBoundsB = (pA && pB && bToARatio !== 1.0)"),
    "reRenderActiveDXFLayers must normalize sharedBounds across different DXF $INSUNITS");
});


test("Scan All Pages Options in Compare & Crisp Black Font Color in White Theme", () => {
  const html = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");
  const appSrc = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
  const ribSrc = fs.readFileSync(path.join(ROOT_DIR, "ui_ribbon.js"), "utf8");
  const menuSrc = fs.readFileSync(path.join(ROOT_DIR, "menu.js"), "utf8");
  const cssSrc = fs.readFileSync(path.join(ROOT_DIR, "style.css"), "utf8");

  // 1. Verify Scan All Pages options in Compare (Top Ribbon, Sidebar navrow, #pages bar, Tools menu & Context menu)
  assert(ribSrc.includes('id="rib-scan-all"') && ribSrc.includes('<span>Scan All Pages</span>'),
    "ui_ribbon.js must provide a Scan All Pages button (#rib-scan-all) in the Compare Navigation ribbon");
  assert(html.includes('id="scanAllBtn"') && appSrc.includes("$('#scanAllBtn')"),
    "index.html and app.js must provide and wire #scanAllBtn in the Compare sidebar .navrow");
  assert(appSrc.includes("b.id = 'cPagesScanAll'") && !appSrc.includes("prevB.className = 'sm pg-nav'"),
    "app.js addScanBtn must create #cPagesScanAll without being blocked by prevB/nextB .pg-nav buttons");
  assert(appSrc.includes("scanAll: () => ACT.rescan && ACT.rescan()") && menuSrc.includes("Scan / Re-scan all pages"),
    "app.js and menu.js must expose ACT.scanAll / ACT.rescan across Tools and right-click context menus");

  // 2. Verify crisp #000000 black font color in White / Light Theme
  assert(cssSrc.includes('--ink: #000000 !important;') &&
         cssSrc.includes('--mute: #000000 !important;') &&
         cssSrc.includes('--mute2: #000000 !important;'),
    "style.css must set --ink, --mute, and --mute2 to pure black (#000000) in white/light theme");
});


test("Smooth Focal Zoom, Interactive Editable PDF Table Engine & Curved UI/Canvas Geometry", () => {
  const edSrc = fs.readFileSync(path.join(ROOT_DIR, "editor.js"), "utf8");
  const cssSrc = fs.readFileSync(path.join(ROOT_DIR, "style.css"), "utf8");

  // 1. Verify smooth RAF focal zoom and adaptive high-zoom supersampling
  assert(edSrc.includes("function applySmoothZoomStep(") && edSrc.includes("const maxSmoothArea = 1.25e7;"),
    "editor.js must implement applySmoothZoomStep with RAF focal-point anchoring and adaptive 12.5MP high-zoom cap");
  assert(edSrc.includes("if (tl._renderedDoc === E.doc && tl._renderedPage === E.cur && tl.childElementCount > 0)"),
    "editor.js buildTextLayer must reuse existing text layer DOM spans across zoom steps via --scale-factor");

  // 2. Verify interactive editable PDF tables (no static 'Row 1 · Col 1' placeholders)
  assert(!edSrc.includes("`Row ${r} · Col ${c + 1}`"),
    "editor.js must not hardcode uneditable 'Row r · Col c' placeholder text into table cells");
  assert(edSrc.includes("function createTableSpec(") &&
         edSrc.includes("function renderTableToCanvas(") &&
         edSrc.includes("function openInlineTableEditor(") &&
         edSrc.includes("function commitInlineTableEditor(") &&
         edSrc.includes("function openTableStudio("),
    "editor.js must provide createTableSpec, renderTableToCanvas, openInlineTableEditor, commitInlineTableEditor, and openTableStudio");

  // 3. Verify smooth curved edges across UI CSS and canvas annotation helpers
  assert(edSrc.includes("function roundRectPath(") && edSrc.includes("function fillRoundRect(") && edSrc.includes("function strokeRoundRect("),
    "editor.js must render rectangles, tables, stamps, and callout boxes with smooth rounded corners");
  assert(cssSrc.includes("--rp-radius-sm: 8px;") && cssSrc.includes("--rp-radius-md: 10px;") && cssSrc.includes("--rp-radius-lg: 14px;") && cssSrc.includes(".rp-inline-table-box"),
    "style.css must define smooth curved border-radius tokens and inline table editor styles");
});

test("DXF Strict Non-Overlapping Scaling/Spacing & Multilingual CJK / Global Script Support (Zero ??? Corruption)", () => {
  const dxfSrc = fs.readFileSync(path.join(ROOT_DIR, "dxf_engine.js"), "utf8");
  const edSrc = fs.readFileSync(path.join(ROOT_DIR, "editor.js"), "utf8");
  const ribSrc = fs.readFileSync(path.join(ROOT_DIR, "ui_ribbon.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");

  // 1. Verify cleanDXFText decodes \U+XXXX and AutoCAD MIF \M+nXXXX before stripping formatting codes, preserving Japanese, Chinese, Korean, Tamil, Hindi, Arabic, Russian
  const cleanedCjk = DXF.cleanDXFText("{\\fNoto Sans JP|b1;\\U+65E5\\U+672C\\U+8A9E \\U+4E2D\\U+6587 \\U+D55C\\U+AD6D\\U+C5B4 \\P%%c12.5%%p0.05}");
  assert(cleanedCjk.includes("日本語") && cleanedCjk.includes("中文") && cleanedCjk.includes("한국어") && cleanedCjk.includes("⌀12.5±0.05"),
    "cleanDXFText must decode \\U+XXXX inside MTEXT formatting blocks without stripping CJK characters or turning them into ???");
  assert(!cleanedCjk.includes("?"), "cleanDXFText must never replace valid CJK/Unicode characters with ?");

  // 2. Verify sanitizeAsciiDXFText preserves Unicode characters instead of replacing non-ASCII with ?
  const sanUnicode = DXF.sanitizeAsciiDXFText("図面検査・中文测试・한국어・தமிழ்・हिन्दी・Русский・العربية ±0.05⌀");
  assert(sanUnicode.includes("図面検査") && sanUnicode.includes("中文测试") && sanUnicode.includes("한국어") && sanUnicode.includes("தமிழ்") && !sanUnicode.includes("???"),
    "sanitizeAsciiDXFText must preserve full Unicode scripts without replacing characters > 127 with ?");

  // 3. Verify decodeDXFBytes handles UTF-8 and Shift-JIS / GBK codepage detection
  const utf8Bytes = new TextEncoder().encode("0\nSECTION\n2\nHEADER\n9\n$DWGCODEPAGE\n3\nUTF-8\n0\nENDSEC\n0\nTEXT\n1\n日本語テスト・中文测试\n0\nEOF");
  const decodedStr = DXF.decodeDXFBytes(utf8Bytes);
  assert(decodedStr.includes("日本語テスト・中文测试"), "decodeDXFBytes must cleanly decode UTF-8/CJK DXF byte streams");

  // 4. Verify Model Space isolation (code 67=1 Paper Space & ATTDEF / invisible ATTRIB skipped) and TEXT justification at (11, 21)
  const mixedSpaceDxf = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LINE", "8", "0", "10", "0", "20", "0", "11", "100", "21", "50",
    "0", "LINE", "8", "PAPER_BORDER", "67", "1", "10", "-5000", "20", "-5000", "11", "5000", "21", "5000",
    "0", "ATTDEF", "8", "0", "10", "10", "20", "10", "40", "5", "1", "RAW_TAG_DO_NOT_SHOW",
    "0", "ATTRIB", "8", "0", "70", "1", "10", "10", "20", "10", "40", "5", "1", "HIDDEN_ATTRIB",
    "0", "TEXT", "8", "TEXT", "10", "0", "20", "0", "11", "80", "21", "40", "40", "3.5", "72", "1", "73", "2", "1", "CENTERED_AT_80_40",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");
  const parsedMixed = new DXF.DXFParser(mixedSpaceDxf).parse();
  assert.strictEqual(parsedMixed.entities.length, 2, "DXFParser must isolate Model Space entities and skip Paper Space (67=1), ATTDEF, and invisible ATTRIB (70=1) entities");
  assert(parsedMixed.bounds.minX >= -1 && parsedMixed.bounds.maxX <= 120, "Paper Space border (-5000..5000) must not pollute Model Space bounds");
  const txtEnt = parsedMixed.entities.find(e => e.type === "TEXT");
  assert.strictEqual(txtEnt.hAlign, 1, "TEXT entity must preserve code 72 horizontal justification");
  assert.strictEqual(txtEnt.vAlign, 2, "TEXT entity must preserve code 73 vertical justification");
  assert.strictEqual(txtEnt.x2, 80, "TEXT entity must preserve code 11 alignment X coordinate");
  assert.strictEqual(txtEnt.y2, 40, "TEXT entity must preserve code 21 alignment Y coordinate");

  // 5. Verify no artificial 9px / 5pt font size floor in dxf_engine.js and full multilingual UI/font support
  assert(!dxfSrc.includes("Math.max(9, (ent.height") && !dxfSrc.includes("Math.max(5, (ent.height"),
    "dxf_engine.js must scale DXF text strictly proportional to world coordinates without 9px/5pt minimum clamps");
  assert(html.includes('id="rp-lang-sel"') && html.includes('value="Noto Sans JP"') && html.includes('value="Noto Sans SC"') && html.includes('value="Noto Sans Tamil"'),
    "index.html must include #rp-lang-sel language selector and CJK/multilingual font options in #eFontFam");
  assert(edSrc.includes("MULTILINGUAL_FALLBACK_FONTS") && edSrc.includes("async function drawPdfTextOrSprite("),
    "editor.js must include MULTILINGUAL_FALLBACK_FONTS and drawPdfTextOrSprite for non-ASCII PDF text rendering");
  assert(ribSrc.includes("I18N_DICTIONARY") && ribSrc.includes("applyWorkspaceLanguage"),
    "ui_ribbon.js must expose I18N_DICTIONARY and applyWorkspaceLanguage");
});


test("Rev A & Rev B Rotation Options, Crisp AutoCAD Hairline DXF Look, Background Task Containment Fix & Copyright-Safe CAM Naming", () => {
  const appSrc = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
  const proSrc = fs.readFileSync(path.join(ROOT_DIR, "pro.js"), "utf8");
  const ribSrc = fs.readFileSync(path.join(ROOT_DIR, "ui_ribbon.js"), "utf8");
  const dxfSrc = fs.readFileSync(path.join(ROOT_DIR, "dxf_engine.js"), "utf8");
  const camSrc = fs.readFileSync(path.join(ROOT_DIR, "cam_engine.js"), "utf8");
  const preSrc = fs.readFileSync(path.join(ROOT_DIR, "pre.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");
  const menuSrc = fs.readFileSync(path.join(ROOT_DIR, "menu.js"), "utf8");

  // 1. Verify zero copyrighted external CAM tool strings across application modules
  for (const [name, content] of [["app.js", appSrc], ["ui_ribbon.js", ribSrc], ["cam_engine.js", camSrc], ["index.html", html], ["menu.js", menuSrc], ["pro.js", proSrc]]) {
    assert(!/cam\s*350/i.test(content), `${name} must not contain copyrighted external CAM naming`);
  }

  // 2. Verify independent & combined Rev A and Rev B rotation controls in Compare mode
  assert(appSrc.includes("window.setCompareSlotRotation =") && appSrc.includes("window.rotateCompareSlot =") && appSrc.includes("function getSlotCardinalDeg("),
    "app.js must expose setCompareSlotRotation, rotateCompareSlot, and getSlotCardinalDeg for Rev A & Rev B");
  assert(ribSrc.includes('id="rib-rot-a-sel"') && ribSrc.includes('id="rib-rot-b-sel"') && ribSrc.includes('id="rp-deg-a"') && ribSrc.includes('id="rp-deg-b"'),
    "ui_ribbon.js must provide Rev A and Rev B rotation controls in both Review & Compare and Layers & Align tabs");
  assert(html.includes('id="cHudRotA"') && html.includes('id="cHudRotB"'),
    "index.html must include quick Rev A and Rev B rotation buttons in the Compare floating HUD");
  assert(menuSrc.includes("Rotate Rev A 90° Clockwise") && menuSrc.includes("Rotate Rev B 90° Clockwise"),
    "menu.js must expose Rev A and Rev B rotation commands in the Compare Tools menu");

  // 3. Verify crisp AutoCAD hairline DXF rendering, HATCH/DEFPOINTS support, and non-bloated WinAnsi vector text
  assert(dxfSrc.includes("getTotalPrimitiveCount()") && dxfSrc.includes("toWinAnsiVectorText") && dxfSrc.includes("_parseHatchEntity"),
    "dxf_engine.js must compute total nested primitive count for hairline strokes, use native WinAnsi vector text for CAD symbols, and parse HATCH loops");
  assert.strictEqual(UI.DXFState.lineWidth, 1.0, "DXFState default lineWidth must be 1.0 for crisp AutoCAD hairline appearance");

  // 4. Verify background task error containment fix in pre.js and try/catch guards
  assert(preSrc.includes("if (errOrMsg.name) parts.push(String(errOrMsg.name));") && preSrc.includes("if (errOrMsg.message) parts.push(String(errOrMsg.message));"),
    "pre.js isBenignWorkerOrRenderAbort must inspect both Error.name and Error.message without short-circuiting");
});


test("CAM & Gerber Engine Upgrades: Trailing Zero Suppression, Macro ($1/$2) Primitives, %SR Step-and-Repeat, Multi-Contour G36/G37 & Trace-to-Trace DFM", () => {
  // 1. Trailing Zero Suppression (%FSTAX24Y24*%)
  const tzGbr = [
    "%FSTAX24Y24*%",
    "%MOIN*%",
    "%ADD10C,0.010*%",
    "D10*",
    "X015Y025D03*",
    "M02*"
  ].join("\n");
  const parsedTz = new CAM.GerberParser(tzGbr).parse();
  const flashTz = parsedTz.commands.find(c => c.op === "FLASH");
  assert(flashTz && Math.abs(flashTz.x - 1.5) < 1e-6 && Math.abs(flashTz.y - 2.5) < 1e-6,
    "GerberParser must pad trailing zeros on the right in %FSTA Trailing Zero Suppression mode (X15 in 2.4 TZ -> 1.5)");

  // 2. Excellon Trailing Zero Suppression & Mils Tool Diameter Normalization
  const tzDrl = [
    "M48",
    "INCH,TZ",
    "T01C12",
    "%",
    "T01",
    "X015Y025",
    "M30"
  ].join("\n");
  const parsedDrlTz = new CAM.ExcellonParser(tzDrl).parse();
  assert(Math.abs((parsedDrlTz.tools.get(1) || 0) - 0.012) < 1e-6, "ExcellonParser must normalize mils tool diameter T01C12 -> 0.012 in");
  assert(parsedDrlTz.hits.length === 1 && Math.abs(parsedDrlTz.hits[0].x - 1.5) < 1e-6, "ExcellonParser must support TZ coordinate padding");

  // 3. Aperture Macro (%AM...*%) with $1/$2 arithmetic and Step-and-Repeat (%SRX2Y2I0.5J0.4*%)
  const macroSrGbr = [
    "%FSLAX24Y24*%",
    "%MOIN*%",
    "%AMTHERM_PAD*",
    "7,0,0,$1,$2,0.008,45*",
    "21,1,$1,$1/2,0,0,0*%",
    "%ADD15THERM_PAD,0.080X0.050*%",
    "%SRX2Y2I0.5000J0.4000*%",
    "D15*",
    "X010000Y010000D03*",
    "%SR*%",
    "M02*"
  ].join("\n");
  const parsedMacroSr = new CAM.GerberParser(macroSrGbr).parse();
  const ap15 = (parsedMacroSr.apertures.get(15) || parsedMacroSr.apertures.get("D15"));
  assert(ap15 && Array.isArray(ap15.macroPrimitives) && ap15.macroPrimitives.length === 2, "GerberParser must evaluate %AM macro primitives with $1/$2 parameters");
  const flashes = parsedMacroSr.commands.filter(c => c.op === "FLASH");
  assert.strictEqual(flashes.length, 4, "%SRX2Y2 must replicate the flash command into 4 step-and-repeat instances");

  // 4. Multi-contour G36/G37 copper pour with inline coordinates
  const regionGbr = [
    "%FSLAX24Y24*%",
    "%MOIN*%",
    "G36X000000Y000000D02*",
    "X010000Y000000D01*",
    "X010000Y010000D01*",
    "X000000Y010000D01*",
    "X000000Y000000D01*",
    "X002000Y002000D02*",
    "X008000Y002000D01*",
    "X008000Y008000D01*",
    "X002000Y002000D01*",
    "G37*",
    "M02*"
  ].join("\n");
  const parsedReg = new CAM.GerberParser(regionGbr).parse();
  const regCmd = parsedReg.commands.find(c => c.op === "REGION");
  assert(regCmd && Array.isArray(regCmd.contours) && regCmd.contours.length === 2, "G36/G37 must preserve multiple sub-contours for cut-in copper pours");

  // 5. Trace-to-Trace Clearance & Vertex-Hashed Acid Trap Detection in CAMCompare.runDFMChecks
  const dfmGbr = [
    "%FSLAX24Y24*%",
    "%MOIN*%",
    "%ADD10C,0.006*%",
    "D10*",
    "X010000Y010000D02*",
    "X020000Y010000D01*",
    "X010000Y010080D02*",
    "X020000Y010080D01*",
    "X030000Y030000D02*",
    "X040000Y030000D01*",
    "X030000Y030000D02*",
    "X038000Y032000D01*",
    "M02*"
  ].join("\n");
  const parsedDfm = new CAM.GerberParser(dfmGbr).parse();
  const cmp = new CAM.CAMCompare(1200, 900);
  const viols = cmp.runDFMChecks(parsedDfm, null, CAM.IPC_DFM_RULES.class2);
  assert(viols.some(v => v.category === "TRACE_TO_TRACE_CLEARANCE"), "runDFMChecks must detect TRACE_TO_TRACE_CLEARANCE between parallel traces");
  assert(viols.some(v => v.category === "ACID_TRAP"), "runDFMChecks must detect acute-angle ACID_TRAP junctions regardless of command order");
});

test("AutoCAD DXF Layer Management (Lock, Freeze, Visibility, Remove/Delete) & Pre-Compare Layer Selection", () => {
  const dxfA = DXF.generateSampleMechanicalDXF(false, "mm");
  const dxfB = DXF.generateSampleMechanicalDXF(true, "mm");
  const pA = new DXF.DXFParser(dxfA).parse();
  const pB = new DXF.DXFParser(dxfB).parse();

  // 1. Lock a layer and verify deleteLayer is blocked while locked
  pB.setLayerState("CONNECTOR_CUTOUTS", { locked: true });
  assert.strictEqual(pB.layers["CONNECTOR_CUTOUTS"].locked, true, "setLayerState must lock layer CONNECTOR_CUTOUTS");
  const blockedDel = pB.deleteLayer("CONNECTOR_CUTOUTS", "delete_entities");
  assert.strictEqual(blockedDel.ok, false, "deleteLayer must refuse to delete a locked AutoCAD layer");

  // 2. Unlock layer and delete it along with its entities
  pB.setLayerState("CONNECTOR_CUTOUTS", { locked: false });
  const beforeCount = pB.entities.length;
  const okDel = pB.deleteLayer("CONNECTOR_CUTOUTS", "delete_entities");
  assert(okDel.ok && okDel.removedEntities > 0 && pB.entities.length < beforeCount && !pB.layers["CONNECTOR_CUTOUTS"],
    "deleteLayer must remove unlocked layer and delete its entities");

  // 3. Round-trip serialize modified DXF via toDXFString()
  pA.setLayerState("DIMENSIONS", { locked: true, frozen: true, customHex: "#ff00ff" });
  const serialized = pA.toDXFString();
  const reparsed = new DXF.DXFParser(serialized).parse();
  assert(reparsed.layers["DIMENSIONS"] && reparsed.layers["DIMENSIONS"].locked && reparsed.layers["DIMENSIONS"].frozen,
    "toDXFString() must preserve AutoCAD layer locked (bit 4) and frozen (bit 1) flags");

  // 4. Pre-Compare Layer Filtering in compareDXFEntities
  const pBFull = new DXF.DXFParser(dxfB).parse();
  const diffAll = DXF.compareDXFEntities(pA, pBFull, { tol: 0.05 });
  assert(diffAll.added.length > 0 && diffAll.layerDiffStats && diffAll.layerDiffStats["CONNECTOR_CUTOUTS"],
    "compareDXFEntities must compute layerDiffStats across all layers");

  const diffOnlyOutline = DXF.compareDXFEntities(pA, pBFull, {
    tol: 0.05,
    comparedLayers: new Set(["BOARD_OUTLINE"])
  });
  assert.strictEqual(diffOnlyOutline.added.length, 0, "compareDXFEntities must compare ONLY the user-selected comparedLayers (OUTLINE is identical between Rev A and Rev B)");
  assert.strictEqual(diffOnlyOutline.removed.length, 0, "compareDXFEntities must ignore differences on unselected layers");
});

test("Native Vector DXF Compare (No PDF Conversion) & AutoCAD-Style DXF Studio (#view-dxf)", () => {
  const DXFStudio = require(path.join(ROOT_DIR, "dxf_studio.js"));
  const appSrc = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
  const ribSrc = fs.readFileSync(path.join(ROOT_DIR, "ui_ribbon.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");

  // 1. Verify Native Vector DXF Comparison hooks (NOT as PDF)
  assert(typeof DXF.renderNativeDXFComparison === "function", "DXFEngine must expose renderNativeDXFComparison()");
  assert(appSrc.includes("window.compareLoadNativeDXF =") && ribSrc.includes("createNativeDXFDocProxy"),
    "app.js and ui_ribbon.js must load DXF comparisons via compareLoadNativeDXF and createNativeDXFDocProxy without PDF conversion");
  assert(ribSrc.includes("showDXFPreCompareModal") && ribSrc.includes("stageAndPromptDXFFiles"),
    "ui_ribbon.js must expose showDXFPreCompareModal and stageAndPromptDXFFiles to select layers before comparing two DXFs");

  // 2. Verify DXF Studio view (#view-dxf) and dxf_studio.js module
  assert(html.includes('data-v="dxf"') && html.includes('id="view-dxf"') && html.includes('src="dxf_studio.js"'),
    "index.html must include the DXF Studio view button, #view-dxf container, and dxf_studio.js script");
  assert(DXFStudio && typeof DXFStudio.setActiveTool === "function" && typeof DXFStudio.executeCommandLine === "function" &&
    typeof DXFStudio.deleteSelectedEntities === "function" && typeof DXFStudio.explodeSelectedEntities === "function" &&
    typeof DXFStudio.createNewBlankDXF === "function" && typeof DXFStudio.duplicateSelectedEntities === "function" &&
    typeof DXFStudio.exportDXFStudioSVG === "function" && typeof DXFStudio.undo === "function" && typeof DXFStudio.redo === "function",
    "dxf_studio.js must expose full AutoCAD drawing, modification, layer management, command line, SVG/DXF export, and undo/redo APIs");

  // 3. Test end-to-end DXFStudio blank sheet creation, command-line LINE/CIRCLE/FILLET authoring, duplicate, undo/redo, and SVG export
  global.window = global.window || {};
  global.window.DXFState = UI.DXFState;
  const blankStr = DXFStudio.createNewBlankDXF("mm");
  assert(typeof blankStr === "string" && blankStr.includes("BOARD_OUTLINE"), "createNewBlankDXF must initialize a clean AutoCAD R2000 drawing with standard layers");
  const initialCount = UI.DXFState.parsedB.entities.length;
  DXFStudio.executeCommandLine("LINE");
  DXFStudio.executeCommandLine("10,10");
  DXFStudio.executeCommandLine("90,10");
  assert.strictEqual(UI.DXFState.parsedB.entities.length, initialCount + 1, "Command line LINE 10,10 -> 90,10 must add a LINE entity to the active DXF");
  DXFStudio.duplicateSelectedEntities(5, 5);
  assert.strictEqual(UI.DXFState.parsedB.entities.length, initialCount + 2, "duplicateSelectedEntities must clone the selected entity with offset");
  DXFStudio.undo();
  assert.strictEqual(UI.DXFState.parsedB.entities.length, initialCount + 1, "DXFStudio.undo() must restore previous entity state");
  DXFStudio.redo();
  assert.strictEqual(UI.DXFState.parsedB.entities.length, initialCount + 2, "DXFStudio.redo() must reapply undone entity state");
});

test("SUITE 12: DXF Unicode Escape (Invalid Code Point 5126724 Fix), JSON Schema & UI Deduplication", () => {
  // 1. Verify \U+4E3A44 decodes strictly 4 hex digits (\U+4E3A -> '为') followed by '44' without throwing RangeError: Invalid code point 5126724 (0x4E3A44)
  const decoded = DXFEngine.cleanDXFText("\\U+4E3A44mm \\U+8BBE\\U+8BA1AB");
  assert.strictEqual(decoded, "为44mm 设计AB", "cleanDXFText must decode 4-hex-digit AutoCAD CIF escapes without consuming trailing hex characters (0x4E3A44 = 5126724)");

  // 2. Verify full DXF parsing & vector diff with \U+4E3A44 inside TEXT/MTEXT/DIMENSION entities
  const dxfWith5126724 = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "TEXT", "8", "NOTES", "10", "10", "20", "20", "40", "3.5", "1", "\\U+4E3A44-REV-A",
    "0", "MTEXT", "8", "NOTES", "10", "10", "20", "30", "40", "3.5", "1", "{\\fSimSun;\\U+4E3A4400}",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");
  const p = new DXFEngine.DXFParser(dxfWith5126724).parse();
  assert.strictEqual(p.entities.length, 2, "DXF with \\U+4E3A44 must parse both TEXT and MTEXT entities cleanly");
  assert.strictEqual(p.entities[0].text, "为44-REV-A", "TEXT entity with \\U+4E3A44 must decode to '为44-REV-A'");
  assert.strictEqual(p.entities[1].text, "为4400", "MTEXT entity with \\U+4E3A4400 must decode to '为4400'");

  // 3. Verify package.json and package-lock.json validity & schema compliance
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  const plock = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package-lock.json"), "utf8"));
  assert.strictEqual(pkg.version, plock.version, "package.json and package-lock.json versions must match");
  assert(pkg.build.files.includes("dxf_studio.js"), "package.json build.files must include dxf_studio.js");
  assert(!("signAndEditExecutable" in (pkg.build.win || {})), "package.json build.win must not contain invalid signAndEditExecutable schema key");

  // 4. Verify zero stray ASCII control bytes across all source files
  const filesToCheck = ["app.js", "pro.js", "dxf_engine.js", "dxf_studio.js", "ui_ribbon.js", "cam_engine.js", "main.js", "preload.js", "index.html", "style.css", "package.json", "package-lock.json"];
  for (const fn of filesToCheck) {
    const raw = fs.readFileSync(path.join(ROOT_DIR, fn), "utf8");
    for (let i = 0; i < raw.length; i++) {
      const code = raw.charCodeAt(i);
      assert(!(code < 32 && code !== 9 && code !== 10 && code !== 13), `File ${fn} must not contain control byte 0x${code.toString(16)} at index ${i}`);
    }
  }

  // 5. Verify DXF Studio dock CSS isolation and collapsible dock toggles
  const cssSrc = fs.readFileSync(path.join(ROOT_DIR, "style.css"), "utf8");
  assert(cssSrc.includes("#view-dxf .dxf-layer-dock, #view-dxf .dxf-props-dock") && cssSrc.includes("width: 100% !important"), "style.css must isolate DXF Studio docks from global aside width");
  const dxfStSrc = fs.readFileSync(path.join(ROOT_DIR, "dxf_studio.js"), "utf8");
  assert(dxfStSrc.includes("dxf-toggle-left-dock") && dxfStSrc.includes("dxf-toggle-right-dock"), "dxf_studio.js must provide collapsible left and right dock toggles");
});

await testAsync("SUITE 13: Real-World AutoCAD DXF Parsing (Blocks, *D Dimensions, Polyface, Mirrored OCS, Outlier Bounds) & DXF Studio Load", async () => {
  // 1. Verify DXFEngine exports aciToHex, getDXFEntityBBox, and tessellateBulgeArc
  assert.strictEqual(typeof DXFEngine.aciToHex, "function", "DXFEngine.aciToHex must be exported");
  assert.strictEqual(typeof DXFEngine.getDXFEntityBBox, "function", "DXFEngine.getDXFEntityBBox must be exported");
  assert.strictEqual(typeof DXFEngine.tessellateBulgeArc, "function", "DXFEngine.tessellateBulgeArc must be exported");
  assert(/^#[0-9a-f]{6}$/i.test(DXFEngine.aciToHex(34, true)), "aciToHex must resolve intermediate AutoCAD ACI colors (10..249)");

  // 2. Construct a real-world AutoCAD R2018 DXF with:
  //    - Case-insensitive BLOCK (*D1 dimension block + nested component block)
  //    - DIMENSION entity with code 3 = "ISO-25" (DIMSTYLE name) and code 42 = 125.50 (measurement)
  //    - Mirrored ARC with code 230 = -1 (OCS extrusion flip)
  //    - 3DFACE and Polyface Mesh POLYLINE with a (0,0) Face Record
  //    - Stray (0,0) datum point while the actual drawing is at (50000, 40000)..(50200, 40150)
  const realAutoCadDxf = [
    "0", "SECTION", "2", "HEADER",
    "9", "$ACADVER", "1", "AC1032",
    "9", "$INSUNITS", "70", "4",
    "9", "$EXTMIN", "10", "1E+20", "20", "1E+20",
    "9", "$EXTMAX", "10", "-1E+20", "20", "-1E+20",
    "0", "ENDSEC",
    "0", "SECTION", "2", "TABLES",
    "0", "TABLE", "2", "LAYER",
    "0", "LAYER", "2", "MECH_PART", "70", "0", "62", "3", "6", "CONTINUOUS",
    "0", "ENDTAB",
    "0", "ENDSEC",
    "0", "SECTION", "2", "BLOCKS",
    "0", "BLOCK", "8", "0", "2", "*d1", "70", "1", "10", "0", "20", "0",
    "0", "LINE", "8", "0", "10", "50000", "20", "40160", "11", "50200", "21", "40160",
    "0", "POINT", "8", "0", "10", "0", "20", "0",
    "0", "ENDBLK",
    "0", "BLOCK", "8", "0", "2", "Flange_Sub", "70", "0", "10", "0", "20", "0",
    "0", "CIRCLE", "8", "0", "10", "20", "20", "20", "40", "8",
    "0", "ENDBLK",
    "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    // Stray datum point at (0,0) that must NOT blow up the bounding box of the (50000, 40000) drawing
    "0", "POINT", "8", "MECH_PART", "10", "0", "20", "0",
    // Main geometry at (50000, 40000)..(50200, 40150)
    "0", "LINE", "8", "MECH_PART", "10", "50000", "20", "40000", "11", "50200", "21", "40000",
    "0", "LINE", "8", "MECH_PART", "10", "50200", "20", "40000", "11", "50200", "21", "40150",
    "0", "LINE", "8", "MECH_PART", "10", "50200", "20", "40150", "11", "50000", "21", "40150",
    "0", "LINE", "8", "MECH_PART", "10", "50000", "20", "40150", "11", "50000", "21", "40000",
    "0", "CIRCLE", "8", "MECH_PART", "10", "50100", "20", "40075", "40", "25",
    // Case-insensitive INSERT ("FLANGE_SUB" vs "Flange_Sub")
    "0", "INSERT", "8", "MECH_PART", "2", "FLANGE_SUB", "10", "50050", "20", "40050", "41", "1", "42", "1", "50", "0",
    // DIMENSION with code 3 = "ISO-25" (DIMSTYLE) and code 42 = 200.0 (measurement) + *D1 block
    "0", "DIMENSION", "8", "MECH_PART", "2", "*D1", "3", "ISO-25", "10", "50200", "20", "40160", "11", "50100", "21", "40162", "42", "200.0",
    // 3DFACE at (50020, 40020)
    "0", "3DFACE", "8", "MECH_PART", "10", "50020", "20", "40020", "11", "50040", "21", "40020", "12", "50040", "22", "40040", "13", "50020", "23", "40040",
    "0", "ENDSEC",
    "0", "EOF"
  ].join("\r\n");

  const parsed = new DXFEngine.DXFParser(realAutoCadDxf).parse();
  assert(parsed.entities.length >= 8, "Real AutoCAD DXF must parse all Model Space entities");
  const dimEnt = parsed.entities.find(e => e.type === "DIMENSION");
  assert(dimEnt && dimEnt.text === "200", `DIMENSION text must use code 42 measurement ("200"), never code 3 DIMSTYLE ("ISO-25"), got: ${dimEnt && dimEnt.text}`);
  // Verify outlier (0,0) point was filtered out of bounds so bounds tightly frame (50000..50200, 40000..40160)
  assert(parsed.bounds.minX >= 49000 && parsed.bounds.maxX <= 51000, `Outlier-resistant bounds must frame (50000..50200), got minX=${parsed.bounds.minX}, maxX=${parsed.bounds.maxX}`);

  // 3. Verify DXFStudio.handleDroppedFiles loads the real AutoCAD DXF cleanly and clears any prior sample DXF
  const UI = require(path.join(ROOT_DIR, "ui_ribbon.js"));
  const DXFStudio = require(path.join(ROOT_DIR, "dxf_studio.js"));
  global.window = global.window || {};
  global.window.DXFState = UI.DXFState;
  await DXFStudio.handleDroppedFiles([{ name: "Customer_AutoCAD_Part.dxf", text: realAutoCadDxf }], "A");
  assert.strictEqual(UI.DXFState.nameA, "Customer_AutoCAD_Part.dxf", "DXFStudio.handleDroppedFiles must load the file into DXFState");
  assert.strictEqual(DXFStudio.StudioState.activeSlot, "A", "DXFStudio must switch activeSlot to the loaded slot");
  assert.strictEqual(UI.DXFState._isSampleDXF, false, "Loading a real DXF must clear _isSampleDXF flag");
});


await testAsync("SUITE 14: Anti-Lag DXF Engine, Exact Arc/Hatch/Spline/Ellipse Geometry, Tolerance-Exact Diff & Spatial Hash OSNAP", async () => {
  // 1. Verify new DXFEngine geometry helpers & exact arc bounding box
  assert.strictEqual(typeof DXFEngine.computeExactArcBBox, "function", "DXFEngine.computeExactArcBBox must be exported");
  assert.strictEqual(typeof DXFEngine.computeSplinePoints, "function", "DXFEngine.computeSplinePoints must be exported");
  assert.strictEqual(typeof DXFEngine.syncEntityRenderGeometry, "function", "DXFEngine.syncEntityRenderGeometry must be exported");

  // Semicircle from 0 to 180 deg at (0,0) with R=10 -> minX=-10, maxX=10, minY=0, maxY=10
  const semiArcBBox = DXFEngine.computeExactArcBBox(0, 0, 10, 0, 180);
  assert(Math.abs(semiArcBBox.minX - (-10)) < 1e-6 && Math.abs(semiArcBBox.maxX - 10) < 1e-6, "Semicircle arc bbox X must be [-10, 10]");
  assert(Math.abs(semiArcBBox.minY - 0) < 1e-6 && Math.abs(semiArcBBox.maxY - 10) < 1e-6, "Semicircle arc bbox Y must be [0, 10] without full-circle [-10] over-expansion");

  // 2. Verify HATCH Polyline Boundary Path (flag & 2) vs Edge Boundary Path parsing
  const hatchDxf = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "HATCH", "8", "HATCH_LYR", "2", "SOLID", "70", "1", "91", "1",
    "92", "7", "72", "0", "73", "1", "93", "4",
    "10", "10", "20", "10",
    "10", "50", "20", "10",
    "10", "50", "20", "40",
    "10", "10", "20", "40",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");
  const parsedHatch = new DXFEngine.DXFParser(hatchDxf).parse();
  const hEnt = parsedHatch.entities.find(e => e.type === "HATCH");
  assert(hEnt && hEnt.solid === true && Array.isArray(hEnt.loops) && hEnt.loops.length === 1, "HATCH polyline boundary path must populate hEnt.loops and hEnt.solid");
  assert(hEnt.points.length >= 4 && Math.abs(parsedHatch.bounds.minX - 10) < 1e-3 && Math.abs(parsedHatch.bounds.maxX - 50) < 1e-3, "HATCH polyline vertices must not treat group code 72 hasBulge flag as edgeType");

  // 3. Verify LWPOLYLINE control points vs renderPoints and bulge round-trip serialization
  const bulgePolyDxf = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LWPOLYLINE", "8", "0", "70", "1",
    "10", "0", "20", "0", "42", "0.5",
    "10", "20", "20", "0",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");
  const pPoly = new DXFEngine.DXFParser(bulgePolyDxf).parse();
  const lw = pPoly.entities[0];
  assert.strictEqual(lw.points.length, 2, "LWPOLYLINE ent.points must preserve exact control vertices (not 18 tessellated arc segments)");
  assert(Array.isArray(lw.renderPoints) && lw.renderPoints.length > 2, "LWPOLYLINE ent.renderPoints must contain tessellated bulge arc points");
  const roundTripStr = pPoly.toDXFString();
  assert(/\r?\n42\r?\n0\.5/.test(roundTripStr), "toDXFString must preserve LWPOLYLINE bulge code 42");

  // 4. Verify compareDXFEntities tolerance-exact matching (no rounding boundary false positives) & block geometry digest
  const dxfBase = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LINE", "8", "0", "10", "10.024", "20", "20.000", "11", "50.000", "21", "20.000",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");
  const dxfSlightlyShifted = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LINE", "8", "0", "10", "10.026", "20", "20.000", "11", "50.000", "21", "20.000",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");
  const pBase = new DXFEngine.DXFParser(dxfBase).parse();
  const pShift = new DXFEngine.DXFParser(dxfSlightlyShifted).parse();
  const tolDiff = DXFEngine.compareDXFEntities(pBase, pShift, { tol: 0.05 });
  assert.strictEqual(tolDiff.unchangedCount, 1, "Entities differing by 0.002 (< tol 0.05) across quantization bin boundary 10.025 must match as unchanged");
  assert.strictEqual(tolDiff.added.length, 0, "No false-positive added entity across quantization boundary");

  // 5. Verify OSNAPManager 2D spatial hash grid O(1) lookup accuracy
  const osnap = new (require(path.join(ROOT_DIR, "measure_engine.js"))).OSNAPManager(8);
  for (let i = 0; i < 500; i++) {
    osnap.addPoint(i * 20, i * 15, "endpoint");
  }
  const snapRes = osnap.snap(200 * 20 + 2, 200 * 15 - 1, 1.0);
  assert.strictEqual(snapRes.type, "endpoint", "Spatial-hashed OSNAPManager must snap accurately across 500+ CAD features");
  assert.strictEqual(snapRes.x, 4000, "Spatial-hashed OSNAPManager must return exact feature X");
  assert.strictEqual(snapRes.y, 3000, "Spatial-hashed OSNAPManager must return exact feature Y");

  // 6. Verify Screen-Space Crisp Error-Area Markers (#mk), Two-Pass DXF Diff Highlighting & Diff-Preserving Mipmaps
  const appSrc14 = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
  const dxfSrc14 = fs.readFileSync(path.join(ROOT_DIR, "dxf_engine.js"), "utf8");
  const uiSrc14 = fs.readFileSync(path.join(ROOT_DIR, "ui_ribbon.js"), "utf8");
  assert(appSrc14.includes("drawMarkersToContext") && appSrc14.includes("x.setTransform(dpr * k, 0, 0, dpr * k, vx * dpr, vy * dpr)"),
    "app.js markers() must render #mk error-area boxes in native viewport device-pixel space to eliminate zoom blur");
  assert(appSrc14.includes("Diff-Preserving Mipmap Enhancement"),
    "app.js buildMip() must preserve active diff pixels across all downsampled mipmap levels in shrink view");
  assert(dxfSrc14.includes("diffEntityIds") && dxfSrc14.includes("diffHighlightColor") && uiSrc14.includes("diffIdsA") && uiSrc14.includes("diffIdsB"),
    "dxf_engine.js and ui_ribbon.js must render changed DXF entities in a dedicated top pass with high-visibility stroke weight and diff highlight color");

});

await testAsync("SUITE 15: Precision Alignment & Wording Diffs (PDF/DXF/CAM) + 60 FPS Smooth Viewport Engine", async () => {
  // 1. DXF Wording, Justification/Alignment (hMode/vMode), Rotation, Height, Dimension & Hatch Comparison
  const dxfRevA = [
    "0", "SECTION", "2", "BLOCKS",
    "0", "BLOCK", "8", "0", "2", "TITLE_BLK", "70", "0", "10", "0", "20", "0",
    "0", "LINE", "8", "0", "10", "0", "20", "0", "11", "200", "21", "0",
    "0", "TEXT", "8", "0", "10", "150", "20", "10", "40", "3.0", "1", "REV-A APPROVED",
    "0", "ENDBLK",
    "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    // Text that will change horizontal alignment (left -> center) at same (x,y)
    "0", "TEXT", "8", "NOTES", "10", "50.0", "20", "80.0", "40", "2.5", "72", "0", "1", "CHECK_CLEARANCE",
    // Text that will shift by a small alignment offset (0.12 mm > 0.05 tol)
    "0", "TEXT", "8", "NOTES", "10", "20.00", "20", "40.00", "40", "2.5", "1", "PIN_1_NET",
    // HATCH whose vertex will shift
    "0", "HATCH", "8", "COPPER", "2", "SOLID", "70", "1", "91", "1", "92", "7", "72", "0", "73", "1", "93", "4",
    "10", "0", "20", "0", "10", "10", "20", "0", "10", "10", "20", "10", "10", "0", "20", "10",
    // Block INSERT at (0,0) whose internal text changes in Rev B
    "0", "INSERT", "8", "0", "2", "TITLE_BLK", "10", "0", "20", "0", "41", "1", "42", "1", "50", "0",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");

  const dxfRevB = [
    "0", "SECTION", "2", "BLOCKS",
    "0", "BLOCK", "8", "0", "2", "TITLE_BLK", "70", "0", "10", "0", "20", "0",
    "0", "LINE", "8", "0", "10", "0", "20", "0", "11", "200", "21", "0",
    "0", "TEXT", "8", "0", "10", "150", "20", "10", "40", "3.0", "1", "REV-B RELEASED",
    "0", "ENDBLK",
    "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    // Same (50,80) and same text, but hAlign=1 (center) so wording is misaligned
    "0", "TEXT", "8", "NOTES", "10", "50.0", "20", "80.0", "11", "50.0", "21", "80.0", "40", "2.5", "72", "1", "1", "CHECK_CLEARANCE",
    // Shifted by 0.12 mm in X
    "0", "TEXT", "8", "NOTES", "10", "20.12", "20", "40.00", "40", "2.5", "1", "PIN_1_NET",
    // HATCH vertex (10,10) changed to (12,10)
    "0", "HATCH", "8", "COPPER", "2", "SOLID", "70", "1", "91", "1", "92", "7", "72", "0", "73", "1", "93", "4",
    "10", "0", "20", "0", "10", "10", "20", "0", "10", "12", "20", "10", "10", "0", "20", "10",
    // Same INSERT placement, but internal block text changed
    "0", "INSERT", "8", "0", "2", "TITLE_BLK", "10", "0", "20", "0", "41", "1", "42", "1", "50", "0",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");

  const pRevA = new DXFEngine.DXFParser(dxfRevA).parse();
  const pRevB = new DXFEngine.DXFParser(dxfRevB).parse();
  const dxfDiff = DXFEngine.compareDXFEntities(pRevA, pRevB, { tol: 0.05 });
  assert.strictEqual(dxfDiff.unchangedCount, 0, "All 4 modified DXF entities (alignment-changed TEXT, shifted TEXT, reshaped HATCH, and sub-block-modified INSERT) must be flagged as changed");
  assert.strictEqual(dxfDiff.modifiedPairs.length, 4, "All 4 modified DXF entities must pair cleanly in modifiedPairs");
  const insPair = dxfDiff.modifiedPairs.find(m => m.type === "INSERT");
  assert(insPair && insPair.after._diffSubIndices && insPair.after._diffSubIndices.has(1) && !insPair.after._diffSubIndices.has(0),
    "Sub-block diffing on INSERT must pinpoint the changed TEXT sub-entity (index 1) while leaving the unchanged border LINE (index 0) unflagged");
  assert(insPair.bbox.minX >= 140, `Sub-block diffing must tighten pairBBox to the changed text at X=150 instead of 0..200, got minX=${insPair.bbox.minX}`);

  // 2. CAM Primitive Comparison: Small Alignment Mistakes, Polygon Pour Vertex Diffs, and Drill/IPC Offset Alignment
  const gbrA = [
    "%FSLAX24Y24*%", "%MOIN*%",
    "%ADD10C,0.010*%", "%ADD12R,0.040X0.020*%",
    "D12*", "X010000Y010000D03*",
    "G36*", "X020000Y020000D02*", "X030000Y020000D01*", "X030000Y030000D01*", "X020000Y020000D01*", "G37*",
    "M02*"
  ].join("\n");
  const gbrB = [
    "%FSLAX24Y24*%", "%MOIN*%",
    "%ADD10C,0.010*%", "%ADD12R,0.040X0.020*%",
    // Pad shifted by 0.5 mil (X010005 vs X010000) > 0.25 mil tol
    "D12*", "X010005Y010000D03*",
    // Region vertex shifted (X030500 vs X030000) while keeping vertex count = 4
    "G36*", "X020000Y020000D02*", "X030500Y020000D01*", "X030000Y030000D01*", "X020000Y020000D01*", "G37*",
    "M02*"
  ].join("\n");
  const cGbrA = new CAM.GerberParser(gbrA).parse();
  const cGbrB = new CAM.GerberParser(gbrB).parse();
  const camCmp = new CAM.CAMCompare(1200, 900);
  const primDiff = camCmp.comparePrimitives(cGbrA, cGbrB, { compareTolMils: 0.25 });
  assert.strictEqual(primDiff.unchangedCount, 0, "0.5-mil pad shift and G36/G37 vertex shift must both be detected as CAM diffs");
  assert.strictEqual(primDiff.added.length, 2, "Both shifted FLASH and modified REGION must appear in added");
  assert.strictEqual(primDiff.removed.length, 2, "Both original FLASH and original REGION must appear in removed");

  // Verify Drill & IPC offsetBInches support in comparePrimitives
  const drlA = new CAM.ExcellonParser("M48\nINCH,LZ\nT01C0.032\n%\nT01\nX01.0000Y01.0000\nM30").parse();
  const drlB = new CAM.ExcellonParser("M48\nINCH,LZ\nT01C0.032\n%\nT01\nX01.1000Y01.0500\nM30").parse();
  const drlDiffAligned = camCmp.comparePrimitives(null, null, {
    compareTolMils: 0.25,
    drillA: drlA,
    drillB: drlB,
    offsetBInches: { dxIn: -0.1, dyIn: -0.05 }
  });
  assert.strictEqual(drlDiffAligned.totalDiffs, 0, "Drill hits shifted by offsetBInches must align 1:1 with zero false diffs");

  // 3. Verify PDF Compare 0-px Default Edge Tolerance, Single-Pixel Neighbor near(), Positional Text Diffing & Smooth RAF Scheduling
  const html15 = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");
  const app15 = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
  const pro15 = fs.readFileSync(path.join(ROOT_DIR, "pro.js"), "utf8");
  const st15 = fs.readFileSync(path.join(ROOT_DIR, "dxf_studio.js"), "utf8");
  assert(html15.includes('id="edge" value="0"') && app15.includes("edge: 0"),
    "index.html and app.js PREF must default #edge to 0 so 1-pixel alignment shifts and wording changes are never masked");
  assert(app15.includes("TEXT Misaligned:") && app15.includes("TEXT Wording:") && app15.includes("textItems"),
    "app.js must extract viewport textItems and detect both wording changes and positional text misalignments");
  assert(app15.includes("function scheduleMarkers()") && pro15.includes("Math.max(40, d || 65)") && st15.includes("scheduleStatusBar"),
    "app.js, pro.js, and dxf_studio.js must coalesce marker, hover, status bar, and sharpen updates for smooth 60 FPS interaction");

  // 4. Verify Crisp Anti-Aliased Zoom Text Rendering, Non-Blurring Post-Zoom #hq Threshold & AutoCAD Hairline DXF Parity
  const dxfEng15 = fs.readFileSync(path.join(ROOT_DIR, "dxf_engine.js"), "utf8");
  const ed15 = fs.readFileSync(path.join(ROOT_DIR, "editor.js"), "utf8");
  assert(pro15.includes("const zoomLow = !v || (v.k * DPR() <= 1.02);") && pro15.includes("if (hideNow || zoomLow || zoomChanged)"),
    "pro.js must hide stale #hq crops during active zoom and only run sharpen() when magnifying beyond 1.02x native resolution");
  assert(pro15.includes("Math.pow(normInk, 0.82)") && !pro15.includes("Math.max(0.84, rawInk / 145)"),
    "pro.js sharpen() must preserve smooth proportional anti-aliased font edges without 0.84 opacity bloating or pb[] grey halos");
  assert(app15.includes("Math.pow(normA, 0.82)") && !app15.includes("if (nT === 1 && lA) { o32[p] = cAEdge;"),
    "app.js overlayData() must render anti-aliased text without 1-pixel morphological dilation that closes small font loops");
  assert(dxfEng15.includes("Math.min(2048, rawH * blkScaleY * scale * 0.80)") && st15.includes("Math.min(2048, rawH * blkScaleY * StudioState.zoom * 0.80)") && !dxfEng15.includes("ctx.strokeText("),
    "dxf_engine.js and dxf_studio.js must scale zoomed CAD text up to 2048px without 96px clamping or blurry strokeText double-stroking");
  assert(ed15.includes("d = Math.max(Math.min(dOv, 1.5), 1.0, d * Math.sqrt(maxSmoothArea / area))"),
    "editor.js must keep page render scale >= 1.0x at high zoom so PDF Studio text never blurs after zooming");

  // 5. Verify Compare & PDF Studio Mirroring (Flip H / Flip V), Rotation Fixes & UI Controls
  const rib15 = fs.readFileSync(path.join(ROOT_DIR, "ui_ribbon.js"), "utf8");
  const css15 = fs.readFileSync(path.join(ROOT_DIR, "style.css"), "utf8");
  const menu15 = fs.readFileSync(path.join(ROOT_DIR, "menu.js"), "utf8");
  assert(app15.includes("window.setCompareSlotMirror =") && app15.includes("window.toggleCompareSlotMirror =") && app15.includes("function getSlotMirror("),
    "app.js must expose getSlotMirror, setCompareSlotMirror, and toggleCompareSlotMirror for Rev A & Rev B horizontal/vertical mirroring");
  assert(rib15.includes('id="rib-mir-a-x"') && rib15.includes('id="rib-mir-a-y"') && rib15.includes('id="rib-mir-b-x"') && rib15.includes('id="rib-mir-b-y"') &&
         rib15.includes('id="rp-mir-a-x"') && rib15.includes('id="rp-mir-b-x"'),
    "ui_ribbon.js must provide Flip H and Flip V mirror buttons for Rev A and Rev B in both Review & Compare and Layers & Align tabs");
  assert(html15.includes('id="cHudMirA"') && html15.includes('id="cHudMirB"') && css15.includes("#cHudRotA, #cHudRotB, #cHudMirA, #cHudMirB"),
    "index.html and style.css must include and style #cHudMirA and #cHudMirB in the Compare floating HUD");
  assert(dxfEng15.includes("const totalRotDeg = rotDegPage - rotDeg;") && dxfEng15.includes("const pageMirX = !!options.mirrorX;"),
    "dxf_engine.js renderToCanvas must rotate TEXT and DIMENSION labels by rotDegPage and support mirrorX/mirrorY");
  assert(ed15.includes("async flipH()") && ed15.includes("async flipV()") && html15.includes('data-op="flipH"') && menu15.includes("Mirror Rev A Horizontally"),
    "editor.js, index.html, and menu.js must expose horizontal and vertical mirroring across Compare and PDF Studio");

  // Verify CompareHistory undo/redo preserves mirrorXA/mirrorYA/mirrorXB/mirrorYB and degA/degB
  global.window.CMP = global.window.CMP || {};
  global.window.CMP.degA = 0; global.window.CMP.degB = 0;
  global.window.CMP.mirrorXA = false; global.window.CMP.mirrorYB = false;
  UI.CompareHistory.undoStack = [];
  UI.CompareHistory.redoStack = [];
  UI.CompareHistory.push("Mirror & Rotate test");
  global.window.CMP.degA = 90;
  global.window.CMP.mirrorXA = true;
  global.window.CMP.mirrorYB = true;
  UI.CompareHistory.undo();
  assert.strictEqual(global.window.CMP.degA, 0, "CompareHistory.undo() must restore degA to 0");
  assert.strictEqual(global.window.CMP.mirrorXA, false, "CompareHistory.undo() must restore mirrorXA to false");
  assert.strictEqual(global.window.CMP.mirrorYB, false, "CompareHistory.undo() must restore mirrorYB to false");
  UI.CompareHistory.redo();
  assert.strictEqual(global.window.CMP.degA, 90, "CompareHistory.redo() must reapply degA = 90");
  assert.strictEqual(global.window.CMP.mirrorXA, true, "CompareHistory.redo() must reapply mirrorXA = true");
  assert.strictEqual(global.window.CMP.mirrorYB, true, "CompareHistory.redo() must reapply mirrorYB = true");

  // 6. Verify Restored Muted Common Override (rgba(100,116,139,0.34)) & Full Individual Color Pickers (Rev A, Rev B & Common)
  assert(st15.includes("rgba(100,116,139,0.34)") && st15.includes("getCommonCompareColor") && st15.includes("getRevACompareColor") && st15.includes("getRevBCompareColor"),
    "dxf_studio.js must restore rgba(100,116,139,0.34) default common color and support individual Rev A, Rev B, and Common custom colors");
  assert(app15.includes("window.setCompareColors =") && app15.includes("window.syncCompareColorUI =") && app15.includes("tintC: '#94a3b8'"),
    "app.js must expose setCompareColors and syncCompareColorUI with individual tintA, tintB, tintC, opA, opB, and opC controls");
  assert(rib15.includes('id="rib-tint-a"') && rib15.includes('id="rib-tint-b"') && rib15.includes('id="rib-tint-c"') &&
         rib15.includes('id="rp-tint-c"') && html15.includes('id="cHudTintA"') && html15.includes('id="cHudTintB"') && html15.includes('id="cHudTintC"') &&
         st15.includes('id="dxf-st-col-a"') && st15.includes('id="dxf-st-col-b"') && st15.includes('id="dxf-st-col-c"'),
    "Individual color pickers for Rev A, Rev B, and Common must be available in Review & Compare tab, Layers & Align tab, Floating HUD, and DXF Studio");

  // 7. Verify 256-Entry Precomputed Color LUTs, DocumentFragment Batching, DefectState Sync & DXF Studio syncGeom Fixes
  assert(app15.includes("const lutA = new Uint32Array(256), lutB = new Uint32Array(256), lutC = new Uint32Array(256);") &&
         pro15.includes("const lutA = new Uint32Array(256), lutB = new Uint32Array(256), lutC = new Uint32Array(256);"),
    "app.js overlayData() and pro.js sharpen() must precompute 256-entry packed-RGBA lookup tables for O(1) per-pixel compositing");
  assert(app15.includes("const frag = document.createDocumentFragment();") && app15.includes("ds.setStatusByRegion"),
    "app.js renderList() must batch DOM insertion with DocumentFragment and sync DefectState on checkbox toggle and #markAll");
  assert(st15.includes("const ent = syncGeom({ ...createBaseEntityProps(") &&
         st15.includes("CIRCLE") && st15.includes("ARC") && st15.includes("LINE"),
    "dxf_studio.js must wrap interactive LINE, RECT, CIRCLE, ARC, TEXT, and INSERT creation with syncGeom() for immediate _bbox caching");
});


  // ============================================================================
  // SUITE 16: Deterministic Memory Budget Engine, Pinned BoundedLruCache,
  //           SmartManager, Command Palette (Ctrl+K), Security Redaction & ZIP 0x08
  // ============================================================================
  await testAsync("SUITE 16: Deterministic Memory Budget Engine, Pinned BoundedLruCache, SmartManager, Security Redaction & Port Fixes", async () => {
    const WE = require(path.join(ROOT_DIR, "worker_engine.js"));
    const UI = require(path.join(ROOT_DIR, "ui_ribbon.js"));
    const DXFSt = require(path.join(ROOT_DIR, "dxf_studio.js"));

    // 1. Verify MemoryBudgetManager & ZeroizingBuffer deterministic drop/release
    const mgr = new WE.MemoryBudgetManager(new WE.HardwareProfile("LowSpec"));
    assert.strictEqual(mgr.allocatedBytes(), 0, "Initial allocatedBytes must be 0");
    const zbuf = mgr.allocZeroizingU8(1024 * 1024);
    zbuf.asMutSlice()[0] = 0xAA;
    assert(mgr.allocatedBytes() >= 1024 * 1024, "ZeroizingBuffer must increment allocatedBytes");
    assert(mgr.peakBytes() >= 1024 * 1024, "ZeroizingBuffer must update peakBytes high-water mark");
    zbuf.zeroAndRelease();
    assert.strictEqual(mgr.allocatedBytes(), 0, "zeroAndRelease() must return allocatedBytes to 0");
    assert.strictEqual(zbuf.length, 0, "zeroAndRelease() must release backing slice");

    // 2. Verify SlabBufferPool 512x512 RGBA tile recycling
    const tileSlab = mgr.acquireTileSlab();
    assert.strictEqual(tileSlab.byteLength, 512 * 512 * 4, "Tile slab must be 512x512x4 bytes (1 MB)");
    mgr.releaseTileSlab(tileSlab);
    assert.strictEqual(mgr.diagnostics().slabPooledBuffers, 1, "Released slab must be retained in pool");
    const drained = mgr.drainSlabPool();
    assert.strictEqual(drained, 1, "drainSlabPool() must free pooled slabs");
    assert.strictEqual(mgr.diagnostics().slabPooledBuffers, 0, "Pool must be empty after drain");

    // 3. Verify BoundedLruCache active-page pinning and Map compatibility
    const lru = new WE.BoundedLruCache(3, 4096, { budgetManager: mgr });
    assert(lru instanceof Map, "BoundedLruCache must be an instance of Map");
    lru.setPinnedKey(1);
    lru.insert(1, new Uint8Array(512));
    lru.insert(2, new Uint8Array(512));
    lru.insert(3, new Uint8Array(512));
    lru.get(2); // Touch key 2 so key 3 is oldest unpinned
    lru.insert(4, new Uint8Array(512));
    assert(lru.containsKey(1), "Pinned active page 1 must never be evicted");
    assert(lru.containsKey(2), "Recently touched page 2 must be retained");
    assert(lru.containsKey(4), "Newly inserted page 4 must be retained");
    assert(!lru.containsKey(3), "Oldest unpinned page 3 must be evicted");
    const purgedCount = lru.purgeUnpinned();
    assert.strictEqual(purgedCount, 2, "purgeUnpinned() must evict all unpinned entries while keeping pinned page 1");
    assert.strictEqual(lru.size, 1, "Only pinned page 1 must remain after purgeUnpinned()");

    // 4. Verify SmartManager defect triage, checkpoints, smart purge, and fuzzy Command Palette
    assert(UI.SmartManager && typeof UI.SmartManager.smartPurgeMemory === "function", "UIRibbon must expose SmartManager");
    UI.SmartManager.ingestPageRegions(1, [
      { x: 10, y: 10, w: 60, h: 60, pixelCount: 600, kind: "r" },
      { x: 100, y: 100, w: 4, h: 4, pixelCount: 8, kind: "a" }
    ]);
    assert.strictEqual(UI.SmartManager.defects.length, 2, "SmartManager must ingest 2 regions");
    assert.strictEqual(UI.SmartManager.defects[0].severity, "CRITICAL", "Large region must classify as CRITICAL");
    assert.strictEqual(UI.SmartManager.defects[1].severity, "COSMETIC", "Tiny noise region must classify as COSMETIC");
    const cpId = UI.SmartManager.createCheckpoint("Before Triage", 1);
    const dismissed = UI.SmartManager.autoDismissCosmeticNoise();
    assert(dismissed >= 1, "autoDismissCosmeticNoise() must dismiss COSMETIC noise defects");
    assert.strictEqual(UI.SmartManager.restoreCheckpoint(cpId), 1, "restoreCheckpoint() must restore saved state");
    const cmdResults = UI.SmartManager.searchCommands("purge");
    assert(cmdResults.length >= 1 && cmdResults[0].item.id === "cmd_smart_purge", "Fuzzy Command Palette search must match Smart Memory Purge");

    // 5. Verify VectorPdfBuilder & ZipArchive roundtrip + 0x08 Data Descriptor ZIP extraction
    const pdfBuilder = new UI.VectorPdfBuilder("Audit Test");
    pdfBuilder.addAuditSummaryPage("RevA.dxf", "RevB.dxf", "aaaa", "bbbb", [[1, "CRITICAL", "OPEN", "Hole shift"]]);
    const pdfBytes = pdfBuilder.toPdfBytes();
    assert(pdfBytes.length > 200 && pdfBytes[0] === 0x25 && pdfBytes[1] === 0x50, "VectorPdfBuilder must generate valid %PDF-1.4 bytes");

    const zipArch = new UI.ZipArchive();
    zipArch.addFile("Report.pdf", pdfBytes);
    zipArch.addFile("Top.gtl", "%MOMM*%\nM02*\n");
    const zipBytes = zipArch.toZipBytes();
    const parsedZip = UI.ZipArchive.fromZipBytes(zipBytes);
    assert.strictEqual(parsedZip.entries.length, 2, "ZipArchive.fromZipBytes must parse central directory entries");

    // Simulate a streaming ZIP with bit flag 0x08 (where local header compSize is 0, but Central Directory has real compSize)
    const streamZip = new Uint8Array(zipBytes);
    const dv = new DataView(streamZip.buffer, streamZip.byteOffset, streamZip.byteLength);
    dv.setUint16(6, 0x0008, true); // Set General Purpose Bit Flag 0x08 on first local header
    dv.setUint32(18, 0, true);     // Zero out local header compSize (simulating streaming ZIP writer)
    const extracted = await UI.extractZipArchive(streamZip);
    assert.strictEqual(extracted.length, 2, "extractZipArchive must unpack all files even when local header has flag 0x08 and compSize=0");

    // 6. Verify exported methods fixed across UIRibbon, DXFStudio, DefectState, and PDF Studio (window.RE)
    assert.strictEqual(typeof UI.reRenderActiveDXFLayers, "function", "UIRibbon must export reRenderActiveDXFLayers");
    assert.strictEqual(typeof UI.DefectState.saveCurrentPageState, "function", "DefectState must implement saveCurrentPageState");
    assert.strictEqual(typeof DXFSt.renderCanvas, "function", "DXFStudio must export renderCanvas");
    assert.strictEqual(typeof DXFSt.getEntityGrips, "function", "DXFStudio must export getEntityGrips");
    const edSrc16 = fs.readFileSync(path.join(ROOT_DIR, "editor.js"), "utf8");
    assert(edSrc16.includes("function applySecurityRedaction(") && edSrc16.includes("async function signDocument(") && edSrc16.includes("window.RE = { applySecurityRedaction, signDocument,"),
      "editor.js must implement and export applySecurityRedaction and signDocument on window.RE");
    assert.strictEqual(typeof UI.applySecurityRedaction, "function", "UIRibbon must also expose applySecurityRedaction");

    const mockImg = { width: 40, height: 40, data: new Uint8ClampedArray(40 * 40 * 4).fill(240) };
    const mockTexts = [
      { str: "CLASSIFIED-NET", x: 12, y: 12, w: 15, h: 8 },
      { str: "PUBLIC-LABEL", x: 32, y: 32, w: 6, h: 5 }
    ];
    const scrubbedPx = UI.applySecurityRedaction(1, mockImg, mockTexts, 10, 10, 20, 15, "ITAR");
    assert.strictEqual(scrubbedPx, 20 * 15, "applySecurityRedaction must scrub exact pixel area");
    assert.strictEqual(mockTexts.length, 1, "applySecurityRedaction must strip overlapping text items");
    assert.strictEqual(mockTexts[0].str, "PUBLIC-LABEL", "Non-overlapping text items must remain intact");
  });


  // ============================================================================
  // SUITE 17: DXF Studio Editing/Deleting Fix (Zero Circular _normEnt),
  //           Rust/WASM Linear Memory Arena & Full CAD Tool/Property Coverage
  // ============================================================================
  await testAsync("SUITE 17: DXF Studio Editing/Deleting Fix (Zero Circular _normEnt), Rust/WASM Memory Arena & Full CAD Coverage", async () => {
    const WE = require(path.join(ROOT_DIR, "worker_engine.js"));
    const DXF = require(path.join(ROOT_DIR, "dxf_engine.js"));
    const DXFSt = require(path.join(ROOT_DIR, "dxf_studio.js"));
    const UI = require(path.join(ROOT_DIR, "ui_ribbon.js"));

    // 1. Verify Rust/WASM Linear Memory Arena (`RustWasmMemoryArena`) is compiled, instantiated, and zeroizes on free
    assert(WE.globalRustWasmArena && WE.globalRustWasmArena.isNativeWasm === true, "RustWasmMemoryArena must instantiate native WebAssembly module");
    const arena = WE.globalRustWasmArena;
    arena.reset();
    assert.strictEqual(arena.allocatedBytes(), 0, "Rust arena must start at 0 allocated bytes after reset");
    const block = arena.allocSliceU8(2048);
    block.slice[0] = 0x7F;
    block.slice[2047] = 0xAB;
    assert(arena.allocatedBytes() >= 2048, "Rust arena must track allocated bytes");
    assert(arena.peakBytes() >= 2048, "Rust arena must track high-water peak bytes");
    const crcVal = arena.crc32(new Uint8Array([104, 101, 108, 108, 111]));
    assert.strictEqual(crcVal >>> 0, 0x3610A686, "Rust WASM CRC-32 must compute exact IEEE 802.3 checksum");
    arena.free(block.ptr, block.byteLen);
    assert.strictEqual(block.slice[0], 0, "rust_mem_free must deterministically zeroize linear memory");
    assert.strictEqual(block.slice[2047], 0, "rust_mem_free must zeroize entire slice");
    assert.strictEqual(arena.allocatedBytes(), 0, "rust_mem_free must return allocatedBytes to 0");
    assert(fs.existsSync(path.join(ROOT_DIR, "rust_memory", "Cargo.toml")) && fs.existsSync(path.join(ROOT_DIR, "rust_memory", "src", "lib.rs")),
      "rust_memory crate (Cargo.toml & src/lib.rs) must be present in source tree");

    // 2. Verify compareDXFEntities never attaches circular _normEnt references when unitRatio === 1
    const dxfA = DXF.generateSampleMechanicalDXF(false, "mm");
    const dxfB = DXF.generateSampleMechanicalDXF(true, "mm");
    const pA = new DXF.DXFParser(dxfA).parse();
    const pB = new DXF.DXFParser(dxfB).parse();
    const diff = DXF.compareDXFEntities(pA, pB, { tol: 0.05 });
    assert(diff && diff.added.length > 0, "compareDXFEntities must detect added entities");
    let jsonOk = false;
    try {
      const ser = JSON.stringify(pB.entities);
      jsonOk = typeof ser === "string" && ser.length > 10;
    } catch (e) {
      jsonOk = false;
    }
    assert.strictEqual(jsonOk, true, "parsedB.entities must serialize cleanly via JSON.stringify after compareDXFEntities without circular _normEnt errors");

    // 3. Verify DXFStudio editing, deleting, grip dragging, exploding, duplicating, and undo/redo work after compareDXFEntities
    global.window = global.window || {};
    global.window.DXFState = UI.DXFState;
    UI.DXFState.parsedA = pA;
    UI.DXFState.parsedB = pB;
    UI.DXFState.lastEntityDiff = diff;
    DXFSt.StudioState.activeSlot = "B";
    DXFSt.StudioState.viewMode = "single";

    const startCount = pB.entities.length;
    const firstEnt = pB.entities[0];
    DXFSt.StudioState.selectedIds = new Set([firstEnt._id]);
    const deletedCount = DXFSt.deleteSelectedEntities();
    assert.strictEqual(deletedCount, 1, "deleteSelectedEntities() must delete the selected entity without throwing");
    assert.strictEqual(pB.entities.length, startCount - 1, "Entity count must decrease by 1 after deletion");

    DXFSt.undo();
    assert.strictEqual(pB.entities.length, startCount, "undo() must restore the deleted entity");
    DXFSt.redo();
    assert.strictEqual(pB.entities.length, startCount - 1, "redo() must re-apply the deletion");

    // Test grips for ELLIPSE, SPLINE, SOLID, HATCH
    const ellipseGrips = DXFSt.getEntityGrips({ _id: "e1", type: "ELLIPSE", cx: 10, cy: 20, rx: 15, ry: 8, mx: 15, my: 0 });
    const splineGrips = DXFSt.getEntityGrips({ _id: "s1", type: "SPLINE", points: [[0, 0], [10, 15], [20, 0]] });
    const hatchGrips = DXFSt.getEntityGrips({ _id: "h1", type: "HATCH", points: [[0, 0], [10, 0], [10, 10]] });
    assert.strictEqual(ellipseGrips.length, 2, "ELLIPSE must expose center and major-axis grips");
    assert.strictEqual(splineGrips.length, 3, "SPLINE must expose control-point grips");
    assert.strictEqual(hatchGrips.length, 3, "HATCH must expose boundary vertex grips");
  });


  // ============================================================================
  // SUITE 18: Clean Professional DXF Studio Launchpad (Zero Auto-Loaded Sample DXF),
  //           26-Language Full-Workspace i18n & Single-Row Layer Card UI Fixes
  // ============================================================================
  await testAsync("SUITE 18: Clean Professional DXF Studio Launchpad, 26-Language Full-Workspace i18n & UI Fixes", async () => {
    const UI = require(path.join(ROOT_DIR, "ui_ribbon.js"));
    const dxfStSrc = fs.readFileSync(path.join(ROOT_DIR, "dxf_studio.js"), "utf8");
    const cssSrc = fs.readFileSync(path.join(ROOT_DIR, "style.css"), "utf8");
    const htmlSrc = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");

    // 1. Verify DXF Studio never auto-loads Enclosure_Carrier_RevA/B sample DXF on start and provides #dxf-empty Launchpad
    assert(!dxfStSrc.includes("Enclosure_Carrier_RevA.dxf") && !dxfStSrc.includes("Sample DXF"),
      "dxf_studio.js must never auto-load Enclosure_Carrier_RevA.dxf or show a Sample DXF button");
    assert(dxfStSrc.includes('id="dxf-empty"') && dxfStSrc.includes('id="dxf-empty-open-a"') && dxfStSrc.includes('id="dxf-st-open-b"'),
      "dxf_studio.js must render the #dxf-empty launchpad screen and #dxf-st-open-b button");

    // 2. Verify all 26 languages exist in I18N_DICTIONARY with complete key coverage
    const expectedLangs = [
      "en", "ta", "hi", "te", "kn", "ml", "bn", "mr", "gu",
      "ja", "zh-CN", "zh-TW", "ko", "es", "de", "fr", "it",
      "pt", "nl", "pl", "tr", "ru", "vi", "th", "id", "ar"
    ];
    for (const lg of expectedLangs) {
      assert(UI.I18N_DICTIONARY[lg], `I18N_DICTIONARY must include language '${lg}'`);
      assert(UI.I18N_DICTIONARY[lg].compareTab && UI.I18N_DICTIONARY[lg].dxfStudioTab && UI.I18N_DICTIONARY[lg].dxfLayersHead,
        `Language '${lg}' must define compareTab, dxfStudioTab, and dxfLayersHead`);
      assert(htmlSrc.includes(`value="${lg}"`), `index.html #rp-lang-sel must include option value="${lg}"`);
    }

    // 3. Verify single-row layer action buttons and high-contrast Light/Dark theme CSS rules
    assert(cssSrc.includes(".dxf-lyr-actions") && cssSrc.includes("flex-wrap: nowrap"),
      "style.css .dxf-lyr-actions must keep all 7 layer action controls on a single non-wrapping row");
    assert(cssSrc.includes('html[data-theme="light"] .rp-count-pill') && cssSrc.includes("#dxf-empty"),
      "style.css must define high-contrast Light theme .rp-count-pill and #dxf-empty launchpad styles");

    // 4. Verify unified Target Revision dropdown (#rib-target-rev) + single Rotate + Mirror button in Compare Ribbon
    const ribSrc = fs.readFileSync(path.join(ROOT_DIR, "ui_ribbon.js"), "utf8");
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
    assert(ribSrc.includes('id="rib-target-rev"') && ribSrc.includes('id="rib-rot-ccw"') && ribSrc.includes('id="rib-rot-sel"') && ribSrc.includes('id="rib-rot-cw"') && ribSrc.includes('id="rib-mirror-btn"'),
      "ui_ribbon.js must provide unified #rib-target-rev selector, single rotate controls, and single Mirror button");
    assert(pkg.scripts.build && pkg.scripts.dist && pkg.scripts.pack && pkg.build.files.includes("build/icon.ico"),
      "package.json must define build, dist, and pack scripts and include build/icon.ico in build.files");

  });

  test('SUITE 19: Groupwise UI, Style Ribbon Fix, Profile Removal, Single Top Branding & 46-Language i18n (32 International A-Z + 14 Indian A-Z)', () => {
    const htmlCode = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    const ribCode = fs.readFileSync(path.join(ROOT_DIR, 'ui_ribbon.js'), 'utf8');
    const cssCode = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
    const dxfCode = fs.readFileSync(path.join(ROOT_DIR, 'dxf_studio.js'), 'utf8');
    const UI = require(path.join(ROOT_DIR, 'ui_ribbon.js'));

    assert(!htmlCode.includes('id="rp-profile-sel"'), 'index.html must remove #rp-profile-sel from the topbar');
    assert(htmlCode.includes('id="brand-about"') && htmlCode.includes('display:none !important'), '#brand-about in #top must be hidden so Kensho Pro only appears once on top');
    assert(!htmlCode.includes('alt="Kensho Pro" class="rp-img"'), 'index.html empty states must not repeat Kensho Pro logo');
    assert(!dxfCode.includes('alt="Kensho Pro" class="rp-img"'), 'dxf_studio.js empty state must not repeat Kensho Pro logo');

    assert(htmlCode.includes('id="rp-lang-lbl"') && htmlCode.includes('>Language:<'), 'Language selector must be labeled Language:');
    const intlIdx = htmlCode.indexOf('label="International Languages (A–Z)"');
    const indIdx = htmlCode.indexOf('label="Indian Languages (A–Z)"');
    assert(intlIdx !== -1 && indIdx !== -1 && intlIdx < indIdx, 'International Languages optgroup must come before Indian Languages optgroup');

    const all46 = [
      'en', 'ar', 'zh-CN', 'zh-TW', 'cs', 'da', 'nl', 'fi', 'fr', 'de', 'el', 'he', 'hu', 'id', 'it', 'ja',
      'ko', 'ms', 'no', 'fa', 'pl', 'pt', 'ro', 'ru', 'sk', 'es', 'sw', 'sv', 'th', 'tr', 'uk', 'vi',
      'as', 'bn', 'gu', 'hi', 'kn', 'ml', 'mr', 'ne', 'or', 'pa', 'sa', 'ta', 'te', 'ur'
    ];
    all46.forEach(code => {
      assert(htmlCode.includes('value="' + code + '"'), 'index.html #rp-lang-sel must include option for ' + code);
      assert(UI.I18N_DICTIONARY[code], 'I18N_DICTIONARY must define pack for ' + code);
      assert(Object.keys(UI.I18N_DICTIONARY[code]).length >= 200, 'Language pack ' + code + ' must translate all 200+ UI keys');
    });

    assert(cssCode.includes('.rp-preset-bar') && cssCode.includes('.rp-contextual-tool-set'), 'style.css must define clean .rp-contextual-tool-set and .rp-preset-bar rules');
    assert(ribCode.includes('rp-preset-bar'), 'ui_ribbon.js must group pen thickness presets in .rp-preset-bar');
    assert(htmlCode.includes('rp-preset-bar'), 'index.html must group PDF Studio pen thickness presets in .rp-preset-bar');
  });

  test('SUITE 20: Desktop System-Spec About Dialog, Clean Menus with Full 46-Language Translation, CAD & CAM Localization & 100% English Restore', () => {
    const htmlCode = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    const menuCode = fs.readFileSync(path.join(ROOT_DIR, 'menu.js'), 'utf8');
    const cssCode = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
    const UI = require(path.join(ROOT_DIR, 'ui_ribbon.js'));

    // 1. Desktop System-Spec About dialog & Shortcuts UI hidden
    assert(!htmlCode.includes('rp-about-pills'), 'About dialog must remove AI-style pill badges');
    assert(htmlCode.includes('rp-about-spec-key') && htmlCode.includes('rp-about-spec-val'), 'About dialog must use structured technical specification rows');
    assert(cssCode.includes('#shortcuts-btn') && cssCode.includes('display: none !important'), 'Shortcuts UI clutter must be hidden');

    // 2. Navrow buttons wrap text in <span> so icons and English restore never corrupt
    assert(htmlCode.includes('<button id="prevD" class="sm"><i data-ic="prev"></i><span>Previous</span></button>'), '#prevD must wrap Previous in <span>');
    assert(htmlCode.includes('<button id="nextD" class="sm"><span>Next</span><i data-ic="next"></i></button>'), '#nextD must wrap Next in <span>');

    // 3. Verify CAD & CAM (ribCam) and CAM/DFM (camDfmTab) translate in non-English languages
    ['ta', 'hi', 'ja', 'zh-CN', 'ko', 'ar', 'ru', 'de', 'fr', 'es'].forEach(lg => {
      assert(UI.I18N_DICTIONARY[lg].ribCam !== 'CAD & CAM', `Language ${lg} must translate ribCam (CAD & CAM)`);
      assert(UI.I18N_DICTIONARY[lg].camDfmTab !== 'CAM/DFM', `Language ${lg} must translate camDfmTab (CAM/DFM)`);
    });

    // 4. Verify File, Edit, View, Tools, Settings, Help menu items translate via translateUIString
    assert(menuCode.includes('COMPLETE_GUIDE_SECTIONS') && menuCode.includes('showQuickGuideModal'), 'menu.js must provide COMPLETE_GUIDE_SECTIONS and showQuickGuideModal');
  });


  test('SUITE 21: Kensho Pro Rebranding, NSIS/Linux Installer Bug Fixes, DIB Icon & EULA License Verification', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
    const plock = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package-lock.json'), 'utf8'));
    const nsi = fs.readFileSync(path.join(ROOT_DIR, 'installer.nsi'), 'utf8');
    const lic = fs.readFileSync(path.join(ROOT_DIR, 'LICENSE.txt'), 'utf8');
    const proSrc = fs.readFileSync(path.join(ROOT_DIR, 'pro.js'), 'utf8');
    const menuSrc = fs.readFileSync(path.join(ROOT_DIR, 'menu.js'), 'utf8');
    const bs = require(path.join(ROOT_DIR, 'build_setup.js'));
    const linuxSh = fs.readFileSync(path.join(ROOT_DIR, 'install-linux.sh'), 'utf8');
    const linuxSubSh = fs.readFileSync(path.join(ROOT_DIR, 'build/linux/install-linux.sh'), 'utf8');
    const afterInst = fs.readFileSync(path.join(ROOT_DIR, 'build/linux/after-install.sh'), 'utf8');

    // 1. Verify Kensho Pro rebranding across package.json, package-lock.json, LICENSE.txt, and installer.nsi
    assert.strictEqual(pkg.name, 'kensho-pro');
    assert.strictEqual(plock.name, 'kensho-pro');
    assert.strictEqual(pkg.build.productName, 'Kensho Pro');
    assert.strictEqual(pkg.build.appId, 'in.textportdocx.kenshopro');
    assert(lic.startsWith('KENSHO PRO - END-USER LICENSE AGREEMENT (EULA)'), 'LICENSE.txt must be rebranded to Kensho Pro EULA');
    assert(lic.includes('Version 1.2.3  |  Publisher: Kensho Studio'), 'LICENSE.txt must match Version 1.2.3 and Kensho Studio');
    assert(lic.includes('I accept the terms of the License Agreement'), 'LICENSE.txt acceptance wording must match NSIS radio button');

    // 2. Verify build/icon.ico uses uncompressed 32-bit BGRA BITMAPINFOHEADER (biSize=40) DIB frames so makensis never rejects small icons
    const icoBuf = fs.readFileSync(path.join(ROOT_DIR, 'build/icon.ico'));
    assert.strictEqual(icoBuf.readUInt16LE(0), 0);
    assert.strictEqual(icoBuf.readUInt16LE(2), 1);
    const icoCount = icoBuf.readUInt16LE(4);
    assert(icoCount >= 6, 'icon.ico must contain at least 6 multi-resolution icon entries');
    const firstOffset = icoBuf.readUInt32LE(6 + 12);
    const biSize = icoBuf.readUInt32LE(firstOffset);
    assert.strictEqual(biSize, 40, 'First icon entry in build/icon.ico must be a standard 40-byte BITMAPINFOHEADER DIB (not raw PNG)');

    // 3. Verify NSIS MUI2 macro ordering (MUI_FINISHPAGE_RUN right before MUI_PAGE_FINISH) & VIFileVersion
    const welcomeIdx = nsi.indexOf('!insertmacro MUI_PAGE_WELCOME');
    const finishRunIdx = nsi.indexOf('!define MUI_FINISHPAGE_RUN');
    const finishPageIdx = nsi.indexOf('!insertmacro MUI_PAGE_FINISH');
    assert(welcomeIdx !== -1 && finishRunIdx > welcomeIdx && finishRunIdx < finishPageIdx,
      'installer.nsi must define MUI_FINISHPAGE_RUN after MUI_PAGE_WELCOME and immediately before MUI_PAGE_FINISH');
    assert(nsi.includes('VIFileVersion "1.2.3.0"') && nsi.includes('SetShellVarContext current'),
      'installer.nsi must include VIFileVersion and SetShellVarContext current');

    // 4. Verify build_setup.js exports findNsisResourcesPluginDir and Linux scripts are synchronized
    assert.strictEqual(typeof bs.findNsisResourcesPluginDir, 'function', 'build_setup.js must export findNsisResourcesPluginDir');
    assert.strictEqual(linuxSh, linuxSubSh, 'install-linux.sh and build/linux/install-linux.sh must be 100% synchronized at v1.2.3');
    assert(!afterInst.includes("<< 'EOF_STUDIO'"), 'after-install.sh must expand $APP_DIR in studio desktop launcher');
    assert(!('license' in (pkg.build.appImage || {})), 'package.json build.appImage must not set blocking terminal license prompt');

    // 5. Verify in-app EULA modal (FULL_EULA_TEXT) and removal of unsolicited startup network update check
    assert(proSrc.includes('FULL_EULA_TEXT') && proSrc.includes("id: 'rp-license-modal'") && proSrc.includes("safeSet('termsAccepted', '1.2.3')"),
      'pro.js showTerms() must embed full EULA text and persist termsAccepted');
    assert(!menuSrc.includes('window.checkForUpdates({ silent: true })'),
      'menu.js must not make unsolicited background network calls on startup');
  });


  test('SUITE 22: Multi-Zone Dockable & Floating Panel Engine (LU, LD, RU, RD, BTM, FLT) & EDA Workstation UI', () => {
    const UI = require(path.join(ROOT_DIR, 'ui_ribbon.js'));
    const cssSrc = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
    const menuSrc = fs.readFileSync(path.join(ROOT_DIR, 'menu.js'), 'utf8');
    const icSrc = fs.readFileSync(path.join(ROOT_DIR, 'icons.js'), 'utf8');

    assert(UI.KenshoDockManager && typeof UI.KenshoDockManager.dockPanel === 'function' && typeof UI.KenshoDockManager.applyPreset === 'function',
      'UIRibbon must expose KenshoDockManager with dockPanel and applyPreset APIs');
    const panels = UI.KenshoDockManager.panels;
    assert(panels.diffs && panels.cam && panels.vis && panels.text && panels.markups,
      'KenshoDockManager must register diffs, cam, vis, text, and markups panels');
    assert.strictEqual(panels.diffs.zone, 'right-up', 'Default diffs zone must be right-up');
    assert.strictEqual(panels.cam.zone, 'right-up', 'Default cam zone must be right-up in unsplit classic-tabbed mode');

    assert(cssSrc.includes('.kdock-dock-zone') && cssSrc.includes('.kdock-pane.is-floating') && cssSrc.includes('.kdock-dock-compass'),
      'style.css must define multi-zone dock containers, floating windows, and drag-to-dock compass styles');
    assert(menuSrc.includes('Workspace Panel Layout') && icSrc.includes('layoutDock:'),
      'menu.js and icons.js must include Workspace Panel Layout submenu and vector icons');
  });


  test('SUITE 23: DXF Studio 2D/3D Multi-Angle Projection, ViewCube HUD & Precision AutoCAD Tools', () => {
    const dxfStudioSrc = fs.readFileSync(path.join(ROOT_DIR, 'dxf_studio.js'), 'utf8');
    const DXFStudio = require(path.join(ROOT_DIR, 'dxf_studio.js'));
    const DXFEngine = require(path.join(ROOT_DIR, 'dxf_engine.js'));
    const UI = require(path.join(ROOT_DIR, 'ui_ribbon.js'));

    assert(dxfStudioSrc.includes('sw_iso:') && dxfStudioSrc.includes('se_iso:') && dxfStudioSrc.includes('ne_iso:') &&
           dxfStudioSrc.includes('nw_iso:') && dxfStudioSrc.includes('dimetric:') && dxfStudioSrc.includes('trimetric:'),
      'DXF Studio must define 12 Orthographic, Isometric & Axonometric 2D/3D View Presets');
    assert(dxfStudioSrc.includes('id="dxf-quick-bar"') && dxfStudioSrc.includes('id="dxf-viewcube-hud"'),
      'DXF Studio must include Quick Convenience Bar (#dxf-quick-bar) and On-Canvas 3D ViewCube HUD (#dxf-viewcube-hud)');
    assert(dxfStudioSrc.includes('data-dxf-layout="rud"') && dxfStudioSrc.includes('data-dxf-layout="btm"') && dxfStudioSrc.includes('data-dxf-layout="float"'),
      'DXF Studio must support multi-window side-panel layouts (lr, rud, lud, btm, float, canvas)');

    // Programmatic verification of 2D/3D projection & precision AutoCAD tools
    DXFStudio.createNewBlankDXF('mm');
    const parser = UI.DXFState.parsedB;
    assert(parser && Array.isArray(parser.entities), 'Active DXFParser must be initialized');

    // 1. Verify 2D/3D View Presets & project3DPoint math
    DXFStudio.setViewPreset('top');
    DXFStudio.setViewPreset('sw_iso');
    const pt3dZ0 = DXFStudio.project3DPoint(50, 50, 0, 800);
    const pt3dZ25 = DXFStudio.project3DPoint(50, 50, 25, 800);
    assert(Math.abs(DXFStudio.StudioState.yaw - (-45)) < 0.01 && Math.abs(DXFStudio.StudioState.pitch - 54.7356) < 0.01,
      'SW Isometric preset must set yaw=-45° and pitch=54.7356°');
    assert(Math.abs(pt3dZ25.y - pt3dZ0.y) > 5,
      'project3DPoint must project Z=0 and Z=25 to distinct vertical screen coordinates in 3D view');
    DXFStudio.setViewPreset('top');

    // 2. Verify Regular Polygon, Donut, Revision Cloud, and 3D Box generators
    const hexPoly = DXFStudio.createRegularPolygon(40, 40, 55, 40, 6);
    parser.entities.push(hexPoly);
    assert(hexPoly.type === 'LWPOLYLINE' && hexPoly.closed === true && hexPoly.points.length === 6,
      'createRegularPolygon must create a closed 6-vertex regular hexagon LWPOLYLINE');

    const donut = DXFStudio.createDonutEntity(80, 40, 3, 8);
    parser.entities.push(donut);
    assert(donut.type === 'LWPOLYLINE' && donut.isDonut === true && donut.points.length === 2,
      'createDonutEntity must create a closed bulge-arc ring with inner/outer radii');

    const cloud = DXFStudio.createRevisionCloud(10, 10, 50, 35);
    parser.entities.push(cloud);
    assert(cloud.type === 'LWPOLYLINE' && cloud.isRevCloud === true && cloud.points.length >= 8,
      'createRevisionCloud must create a scalloped bulge-arc revision cloud');

    const box3d = DXFStudio.create3DBoxEntity(100, 20, 130, 50, 24);
    parser.entities.push(box3d);
    assert(box3d.type === 'LWPOLYLINE' && box3d.thickness === 24,
      'create3DBoxEntity must create a 3D extruded solid with Z thickness=24');

    // 3. Verify AutoCAD CHAMFER between two orthogonal lines
    const l1 = { _id: 'ch_1', type: 'LINE', layer: '0', x1: 0, y1: 0, x2: 40, y2: 0 };
    const l2 = { _id: 'ch_2', type: 'LINE', layer: '0', x1: 40, y1: 0, x2: 40, y2: 40 };
    parser.entities.push(l1, l2);
    const chOk = DXFStudio.chamferTwoLines(l1, l2, 6, 6, parser);
    assert(chOk === true && Math.abs(l1.x2 - 34) < 0.01 && Math.abs(l2.y1 - 6) < 0.01,
      'chamferTwoLines must trim both intersecting lines by D1=6, D2=6 and insert a bevel line');

    // 4. Verify Rectangular & Polar Arrays
    const seedCircle = { _id: 'arr_seed', type: 'CIRCLE', layer: '0', cx: 10, cy: 10, r: 2.5 };
    parser.entities.push(seedCircle);
    DXFStudio.StudioState.selectedIds = new Set(['arr_seed']);
    const rectAdded = DXFStudio.arrayRectSelectedEntities(2, 3, 15, 15);
    assert.strictEqual(rectAdded, 5, 'arrayRectSelectedEntities(2, 3) must create 5 arrayed copies (6 total)');

    DXFStudio.StudioState.selectedIds = new Set(['arr_seed']);
    const polarAdded = DXFStudio.arrayPolarSelectedEntities(0, 0, 4, 360);
    assert.strictEqual(polarAdded, 3, 'arrayPolarSelectedEntities(4 items) must create 3 rotated copies around center');

    // 5. Verify JOIN and OVERKILL
    const j1 = { _id: 'jn_1', type: 'LINE', layer: '0', x1: 200, y1: 10, x2: 220, y2: 10 };
    const j2 = { _id: 'jn_2', type: 'LINE', layer: '0', x1: 220, y1: 10, x2: 220, y2: 30 };
    parser.entities.push(j1, j2);
    DXFStudio.StudioState.selectedIds = new Set(['jn_1', 'jn_2']);
    const joinedCnt = DXFStudio.joinSelectedEntities();
    assert.strictEqual(joinedCnt, 2, 'joinSelectedEntities must merge contiguous LINE segments into a unified LWPOLYLINE');

    const dup1 = { _id: 'dup_1', type: 'LINE', layer: '0', x1: 300, y1: 50, x2: 350, y2: 50 };
    const dup2 = { _id: 'dup_2', type: 'LINE', layer: '0', x1: 300, y1: 50, x2: 350, y2: 50 };
    parser.entities.push(dup1, dup2);
    const removedDups = DXFStudio.overkillDuplicateEntities();
    assert(removedDups >= 1, 'overkillDuplicateEntities must detect and remove overlapping duplicate CAD geometry');

    // 6. Verify 3D DXF group codes (38=elevation, 39=thickness) round-trip serialization
    const dxfOut = parser.toDXFString();
    const reparsed = new DXFEngine.DXFParser(dxfOut).parse();
    const has3dThk = reparsed.entities.some(e => Math.abs((e.thickness || 0) - 24) < 0.01);
    assert.strictEqual(has3dThk, true, 'DXFParser must round-trip 3D extrusion thickness (group code 39) accurately');
  });


  test('SUITE 24: PDF Studio Ordered Multi-Select (1 -> 2 -> 3 -> 4 Strict Selection Order Preservation)', () => {
    const htmlSrc = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    const edSrc = fs.readFileSync(path.join(ROOT_DIR, 'editor.js'), 'utf8');
    const cssSrc = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');

    assert(htmlSrc.includes('id="eMultiSelBtn"') && htmlSrc.includes('data-t="multisel"') && htmlSrc.includes('id="sbAddOrder"'),
      'index.html must include #eMultiSelBtn (Multi-Select 1·2·3) and #sbAddOrder (+Select in Order)');
    assert(edSrc.includes('function addOrderedSelectionItem(') && edSrc.includes('function getOrderedSelectionText(') &&
           edSrc.includes('function editOrderedSelectionInOrder(') && edSrc.includes('function wordAt('),
      'editor.js must implement wordAt, addOrderedSelectionItem, getOrderedSelectionText, and editOrderedSelectionInOrder');
    assert(cssSrc.includes('.rp-ordered-sel-bar') && cssSrc.includes('.osb-chip-num') &&
           cssSrc.includes('calc(50% - var(--osb-half-w, 0px))') && cssSrc.includes('calc(50% - var(--hud-half-w, 0px))'),
      'style.css must style and horizontally center the Ordered Multi-Select Bar and Bottom HUD Bar across horizontal scroll');
    assert(edSrc.includes('function syncEditorFloatingBars()') && edSrc.includes('--osb-half-w') && edSrc.includes('--hud-half-w'),
      'editor.js must implement syncEditorFloatingBars() to keep #rp-ordered-sel-bar and #e-floating-hud centered in #eview');
    assert(edSrc.includes('function samplePdfTextColors(') && edSrc.includes('function downsamplePreservingTrueColor('),
      'editor.js must sample original PDF text ink/background colors and preserve true-color high-DPI sharpness when unzoomed');

    assert(edSrc.includes('window.RE = { applySecurityRedaction, signDocument,') && edSrc.includes('addOrderedSelectionItem, removeOrderedSelectionItem, moveOrderedSelectionItem, clearOrderedSelection, getOrderedSelectionText, copyOrderedSelection, applyOrderedWordsReplacements, editOrderedSelectionInOrder'),
      'window.RE must export all Ordered Multi-Select functions');
    // Extract and test the Ordered Multi-Select state machine directly
    const E = { cur: 0, multiSel: [], wordItems: [], titems: [], multiSelJoiner: ' ', multiSelKeepOrder: true, ann: {}, annUndo: [], annRedo: [] };
    const bbox = a => [a.x || 0, a.y || 0, a.w || 20, a.h || 12];
    const famOf = t => /serif/.test(t.fam) && !/sans/.test(t.fam) ? 'Times' : /mono/.test(t.fam) ? 'Courier' : 'Helvetica';
    const BASE = 0.85;
    const pushAnnState = () => {};
    const overlay = () => {};
    const updateDocInspector = () => {};
    const st = () => {};
    const startIdx = edSrc.indexOf('function wordAt(x, y)');
    const endIdx = edSrc.indexOf('function renderOrderedSelectionBar()');
    const fnBlock = edSrc.slice(startIdx, endIdx) + 'function renderOrderedSelectionBar() {}';
    const factory = new Function('E', 'bbox', 'famOf', 'BASE', 'pushAnnState', 'overlay', 'updateDocInspector', 'st',
      fnBlock + '; return { E, wordAt, addOrderedSelectionItem, removeOrderedSelectionItem, moveOrderedSelectionItem, clearOrderedSelection, getOrderedSelectionText, applyOrderedWordsReplacements };');
    const RE = factory(E, bbox, famOf, BASE, pushAnnState, overlay, updateDocInspector, st);

    // Clear and populate 4 words at deliberately non-sequential page coordinates (bottom-right -> top-left -> middle -> bottom-left)
    RE.clearOrderedSelection();
    RE.addOrderedSelectionItem({ id: 'w1', str: 'FIRST_WORD',  x: 450, y: 620, base: 632, w: 60, h: 12, page: 0 });
    RE.addOrderedSelectionItem({ id: 'w2', str: 'SECOND_WORD', x: 40,  y: 30,  base: 42,  w: 70, h: 12, page: 0 });
    RE.addOrderedSelectionItem({ id: 'w3', str: 'THIRD_WORD',  x: 240, y: 310, base: 322, w: 65, h: 12, page: 0 });
    RE.addOrderedSelectionItem({ id: 'w4', str: 'FOURTH_WORD', x: 80,  y: 510, base: 522, w: 72, h: 12, page: 0 });

    assert.strictEqual(RE.E.multiSel.length, 4, 'Must hold 4 selected words');
    assert.deepStrictEqual(
      RE.E.multiSel.map(it => `${it.order}:${it.str}`),
      ['1:FIRST_WORD', '2:SECOND_WORD', '3:THIRD_WORD', '4:FOURTH_WORD'],
      'Ordered Multi-Select must strictly preserve exact 1 -> 2 -> 3 -> 4 click order regardless of X/Y page coordinates'
    );
    assert.strictEqual(
      RE.getOrderedSelectionText(' '),
      'FIRST_WORD SECOND_WORD THIRD_WORD FOURTH_WORD',
      'getOrderedSelectionText must output words in exact 1 -> 2 -> 3 -> 4 order'
    );
    assert.strictEqual(
      RE.getOrderedSelectionText('numbered'),
      '1. FIRST_WORD\n2. SECOND_WORD\n3. THIRD_WORD\n4. FOURTH_WORD',
      'getOrderedSelectionText("numbered") must format 1..4 in exact order'
    );

    // Verify in-place replacement in exact 1 -> 2 -> 3 -> 4 order
    const replacedCount = RE.applyOrderedWordsReplacements(['ALPHA', 'BETA', 'GAMMA', 'DELTA'], { fam: 'Helvetica', sz: 12, col: '#e11d48' });
    assert.strictEqual(replacedCount, 4, 'applyOrderedWordsReplacements must update all 4 selected words in order');
    assert.strictEqual(RE.getOrderedSelectionText(' '), 'ALPHA BETA GAMMA DELTA');

    // Verify removing #2 renumbers remaining items 1, 2, 3 without changing their relative order
    RE.removeOrderedSelectionItem(1);
    assert.deepStrictEqual(
      RE.E.multiSel.map(it => `${it.order}:${it.str}`),
      ['1:ALPHA', '2:GAMMA', '3:DELTA'],
      'Removing item #2 must renumber remaining items 1, 2, 3 while keeping exact order'
    );
    RE.clearOrderedSelection();
  });


  test('SUITE 25: Linux Builder Boolean Fix, Complete Icon Registry, Compare Metrology Bindings & DXF Shortcut Alignment', () => {
    const linuxSetupSrc = fs.readFileSync(path.join(ROOT_DIR, 'build_linux_setup.js'), 'utf8');
    const iconsSrc = fs.readFileSync(path.join(ROOT_DIR, 'icons.js'), 'utf8');
    const dxfStudioSrc = fs.readFileSync(path.join(ROOT_DIR, 'dxf_studio.js'), 'utf8');
    const ribSrc = fs.readFileSync(path.join(ROOT_DIR, 'ui_ribbon.js'), 'utf8');
    const proSrc = fs.readFileSync(path.join(ROOT_DIR, 'pro.js'), 'utf8');
    const mainSrc = fs.readFileSync(path.join(ROOT_DIR, 'main.js'), 'utf8');
    const menuSrc = fs.readFileSync(path.join(ROOT_DIR, 'menu.js'), 'utf8');
    const rsSrc = fs.readFileSync(path.join(ROOT_DIR, 'rust_memory/src/lib.rs'), 'utf8');
    const weSrc = fs.readFileSync(path.join(ROOT_DIR, 'worker_engine.js'), 'utf8');

    // 1. Verify build_linux_setup.js has zero Python-style True/False identifiers
    assert(!/\b(True|False)\b/.test(linuxSetupSrc), 'build_linux_setup.js must use lowercase JS booleans (recursive: true)');
    assert(linuxSetupSrc.includes('{ recursive: true }'), 'build_linux_setup.js must pass { recursive: true } to fs.mkdirSync');

    // 2. Verify icons.js defines cloud and callout so every [data-ic] across all modules resolves cleanly
    assert(iconsSrc.includes('cloud:') && iconsSrc.includes('callout:'), 'icons.js must define cloud and callout vector icons');

    // 3. Verify dxf_studio.js syncViewCubeControls updates both ViewCube (#dxf-vc-*) and Ribbon (#dxf-st-*) angle inputs
    assert(
      dxfStudioSrc.includes("$('#dxf-st-yaw')") &&
      dxfStudioSrc.includes("$('#dxf-st-pitch')") &&
      dxfStudioSrc.includes("$('#dxf-st-roll')"),
      'dxf_studio.js syncViewCubeControls must keep #dxf-st-yaw, #dxf-st-pitch, and #dxf-st-roll synchronized'
    );

    // 4. Verify Compare Ribbon defines and pro.js wires #rib-angle, #rib-circle-find, #rib-fai-balloon, #rib-gdt, #rib-title-block, and #rib-sym-lib
    for (const id of ['rib-angle', 'rib-circle-find', 'rib-fai-balloon', 'rib-gdt', 'rib-title-block', 'rib-sym-lib']) {
      assert(ribSrc.includes(`id="${id}"`), `ui_ribbon.js must render #${id} in Compare Ribbon`);
      assert(proSrc.includes(`#${id}`), `pro.js must wire #${id} handler`);
    }

    // 5. Verify DXF Studio shortcut spec in ui_ribbon.js targets #dxf-aid-osnap, #dxf-aid-grid, and #dxf-aid-ortho
    assert(
      ribSrc.includes('#dxf-aid-osnap') && ribSrc.includes('#dxf-aid-grid') && ribSrc.includes('#dxf-aid-ortho'),
      'ui_ribbon.js KEYBOARD_SHORTCUTS_SPEC.dxfStudioTools must target #dxf-aid-osnap, #dxf-aid-grid, and #dxf-aid-ortho'
    );

    // 6. Verify --view=cam / ?view=cam tab selector compatibility in main.js, menu.js, and ui_ribbon.js
    assert(ribSrc.includes('data-rib-tab="cam"'), 'ui_ribbon.js must include data-rib-tab="cam" on CAD & CAM ribbon tab');
    assert(mainSrc.includes('[data-tab="tab-cad"]'), 'main.js must support [data-tab="tab-cad"] for --cam CLI routing');
    assert(menuSrc.includes('[data-tab="tab-cad"]'), 'menu.js must support [data-tab="tab-cad"] for ?view=cam routing');

    // 7. Verify Rust/WASM linear memory page growth and bounds check in worker_engine.js
    assert(rsSrc.includes('memory_grow') && weSrc.includes('this.memory.buffer.byteLength'),
      'rust_memory/src/lib.rs and worker_engine.js must guard and grow WASM linear memory safely');

    // 8. Verify Topbar Cleanup, Centered #modes, Workstation Settings Page & Dynamic Detached Tab Hiding
    const htmlSrc25 = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    const cssSrc25 = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
    const UI25 = require(path.join(ROOT_DIR, 'ui_ribbon.js'));
    assert(htmlSrc25.includes('id="docname" hidden') && cssSrc25.includes('#top #docname'),
      'index.html and style.css must hide #docname in #top so truncated "A..." pill never appears next to Help');
    assert(htmlSrc25.includes('id="top-settings-btn"') && typeof UI25.openWorkstationSettingsModal === 'function',
      'index.html and ui_ribbon.js must provide #top-settings-btn and openWorkstationSettingsModal');
    assert(cssSrc25.includes('#top #modes') && cssSrc25.includes('left: 50% !important') && cssSrc25.includes('transform: translateX(-50%) !important'),
      'style.css must keep #modes (Compare | PDF Studio | DXF Studio) centered at 50% in #top');
    assert(ribSrc.includes("mainRightTabs.querySelectorAll('button[data-t]')") && ribSrc.includes("btn.hidden = !inRightUp"),
      'KenshoDockManager.syncLayout must hide detached panel tab names from the original right dock (#view-compare aside > .tabs)');

    // 9. Verify Right-Click Done / Rewind / Cancel / Turn Off Tool Save-Point Engine across Compare, PDF Studio & DXF Studio
    const appSrc25 = fs.readFileSync(path.join(ROOT_DIR, 'app.js'), 'utf8');
    const edSrc25 = fs.readFileSync(path.join(ROOT_DIR, 'editor.js'), 'utf8');
    const extSrc25 = fs.readFileSync(path.join(ROOT_DIR, 'extras.js'), 'utf8');
    const DXFSt25 = require(path.join(ROOT_DIR, 'dxf_studio.js'));

    assert(proSrc.includes('function toolDone(') && proSrc.includes('function toolCancel(') && proSrc.includes('function toolRewind(') && proSrc.includes('function toolOff('),
      'pro.js must implement toolDone, toolCancel, toolRewind, and toolOff for Compare workspace');
    assert(edSrc25.includes('async function toolDone(') && edSrc25.includes('function toolCancel(') && edSrc25.includes('function toolRewind(') && edSrc25.includes('function toolOff('),
      'editor.js must implement toolDone, toolCancel, toolRewind, and toolOff for PDF Studio');
    assert(typeof DXFSt25.toolDone === 'function' && typeof DXFSt25.toolCancel === 'function' && typeof DXFSt25.toolRewind === 'function' && typeof DXFSt25.toolOff === 'function',
      'dxf_studio.js must export toolDone, toolCancel, toolRewind, and toolOff');
    assert(appSrc25.includes('✓ Done — Save Part & Start Second New Line') && extSrc25.includes('✓ Done — Save Part & Start Second New Line') && dxfStudioSrc.includes('✓ Done — Save Part & Start Second New Line'),
      'Right-click context menus in Compare (app.js), PDF Studio (extras.js), and DXF Studio (dxf_studio.js) must expose Done, Rewind, Cancel, and Turn Off Tool options');

    // Programmatically test DXF Studio Done -> Cancel (delete unsaved part) -> Rewind (restore canceled part)
    DXFSt25.createNewBlankDXF('mm');
    const p25 = UI25.DXFState.parsedB;
    const baseCount = p25.entities.length;
    DXFSt25.setActiveTool('line');
    // Simulate Line 1 (saved with Done)
    const line1 = { _id: 'line_saved_1', type: 'LINE', layer: '0', x1: 0, y1: 0, x2: 50, y2: 0 };
    p25.entities.push(line1);
    DXFSt25.StudioState.uncommittedEntityIds.add(line1._id);
    DXFSt25.StudioState.tempPoints = [{ x: 0, y: 0 }, { x: 50, y: 0 }];
    DXFSt25.toolDone();
    assert.strictEqual(DXFSt25.StudioState.uncommittedEntityIds.size, 0, 'toolDone() must commit Line 1 as a Save Point');
    assert.strictEqual(DXFSt25.StudioState.tempPoints.length, 0, 'toolDone() must clear tempPoints to start a second new line');
    assert.strictEqual(DXFSt25.StudioState.activeTool, 'line', 'toolDone() must keep active tool ready for second line');

    // Simulate Line 2 (NOT saved with Done -> deleted by Cancel -> brought back by Rewind!)
    const line2 = { _id: 'line_unsaved_2', type: 'LINE', layer: '0', x1: 20, y1: 20, x2: 80, y2: 20 };
    p25.entities.push(line2);
    DXFSt25.StudioState.uncommittedEntityIds.add(line2._id);
    assert.strictEqual(p25.entities.length, baseCount + 2, 'Both Line 1 and Line 2 must exist before Cancel');

    DXFSt25.toolCancel();
    assert.strictEqual(p25.entities.length, baseCount + 1, 'toolCancel() must delete unsaved Line 2 while preserving Done-saved Line 1');
    assert(p25.entities.some(e => e._id === 'line_saved_1') && !p25.entities.some(e => e._id === 'line_unsaved_2'),
      'Line 1 must remain saved and Line 2 must be deleted on Cancel');

    DXFSt25.toolRewind();
    assert.strictEqual(p25.entities.length, baseCount + 2, 'toolRewind() must bring back the canceled Line 2');
    assert(p25.entities.some(e => e._id === 'line_unsaved_2'), 'Line 2 must be restored by toolRewind()');

    DXFSt25.toolOff();
    assert.strictEqual(DXFSt25.StudioState.activeTool, 'select', 'toolOff() must turn off the active tool and return to select');
  });


  test("SUITE 26: Single-Line Dock Ribbons (PDF Studio & DXF Studio) & 2D/3D Views & Orbit Engine Fixes", () => {
    const htmlSrc = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");
    const dxfSrc = fs.readFileSync(path.join(ROOT_DIR, "dxf_studio.js"), "utf8");
    const cssSrc = fs.readFileSync(path.join(ROOT_DIR, "style.css"), "utf8");
    const DXFSt = require(path.join(ROOT_DIR, "dxf_studio.js"));
    const UI = require(path.join(ROOT_DIR, "ui_ribbon.js"));

    // 1. Verify zero .row.col 2-line stacking inside PDF Studio (#view-edit) and DXF Studio (#dxf-studio-ribbon)
    const editRibbonSegment = htmlSrc.slice(htmlSrc.indexOf("class=\"ribbon rp-edit-ribbon\""), htmlSrc.indexOf("<div id=\"fbar\""));
    assert(!editRibbonSegment.includes("class=\"row col\""), "PDF Studio ribbon must not contain 2-line .row.col groups");
    const dxfRibbonSegment = dxfSrc.slice(dxfSrc.indexOf("id=\"dxf-studio-ribbon\""), dxfSrc.indexOf("id=\"dxf-quick-bar\""));
    assert(!dxfRibbonSegment.includes("class=\"row col\""), "DXF Studio ribbon must not contain 2-line .row.col groups");
    assert(cssSrc.includes("KENSHO PRO PASS 5: STRICT 1-LINE DOCK RIBBON") && cssSrc.includes("grid-template-rows: none !important"),
      "style.css must enforce 1-line non-wrapping ribbon layout across PDF Studio and DXF Studio");

    // 2. Verify createNewBlankDXF creates exact 200x140 BOARD_OUTLINE using 1 / w.scaleFactor
    global.window = global.window || {};
    global.window.DXFState = UI.DXFState;
    DXFSt.createNewBlankDXF("mm");
    const p = UI.DXFState.parsedB;
    assert(Math.abs(p.bounds.maxX - 200) < 0.01 && Math.abs(p.bounds.maxY - 140) < 0.01,
      "createNewBlankDXF must create exact 200x140 BOARD_OUTLINE rectangle without 25.4/72 shrinkage");

    // 3. Verify all 12 2D/3D View Presets, 4 Visual Styles, and Orbit tool auto-tilt
    const presets = ["top", "front", "right", "left", "back", "bottom", "sw_iso", "se_iso", "ne_iso", "nw_iso", "dimetric", "trimetric"];
    for (const pr of presets) {
      assert.strictEqual(DXFSt.setViewPreset(pr), true, "setViewPreset(" + pr + ") must succeed");
      assert.strictEqual(DXFSt.StudioState.viewPreset, pr, "StudioState.viewPreset must match " + pr);
    }
    DXFSt.setViewPreset("top");
    assert.strictEqual(DXFSt.StudioState.yaw, 0);
    assert.strictEqual(DXFSt.StudioState.pitch, 0);

    // Selecting 3d_shaded or 3d_hidden from flat 2D Top view must automatically tilt to sw_iso so 3D extrusion is visible
    DXFSt.setVisualStyle("3d_hidden");
    assert.strictEqual(DXFSt.StudioState.visualStyle, "3d_hidden");
    assert(Math.abs(DXFSt.StudioState.pitch - 54.7356) < 0.01, "Selecting 3D visual style from flat 2D view must tilt to SW Isometric");

    // Selecting orbit tool from flat 2D Top view must automatically tilt to SW Isometric & 3d_shaded
    DXFSt.setViewPreset("top");
    DXFSt.setActiveTool("orbit");
    assert.strictEqual(DXFSt.StudioState.activeTool, "orbit");
    assert(Math.abs(DXFSt.StudioState.pitch - 54.7356) < 0.01, "Activating orbit tool from flat 2D view must tilt into 3D isometric angle");
    DXFSt.setActiveTool("select");
    DXFSt.setViewPreset("top");
  });


  test("SUITE 27: Unclipped 1-Line Top Ribbon Layout Across Compare, PDF Studio (Text & Font / Stamps & CAD) & DXF Studio (Annotate & Dim)", () => {
    const htmlSrc = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");
    const uiSrc = fs.readFileSync(path.join(ROOT_DIR, "ui_ribbon.js"), "utf8");
    const dxfSrc = fs.readFileSync(path.join(ROOT_DIR, "dxf_studio.js"), "utf8");
    const cssSrc = fs.readFileSync(path.join(ROOT_DIR, "style.css"), "utf8");

    // 1. Compare ribbon panels must not contain 2-line .row.col stacks that clip inside the top ribbon
    const cmpRibbonSegment = uiSrc.slice(uiSrc.indexOf('<div class="rp-ribbon-content">'), uiSrc.indexOf("// Keep oldRibbon in DOM"));
    assert(!cmpRibbonSegment.includes('class="row col"'), "Compare categorized ribbon must use single-line .row groups with zero .row.col vertical stacking");

    // 2. PDF Studio must provide dedicated Text & Font (data-etab="typo") and Stamps & CAD (data-etab="stamps") tabs
    assert(htmlSrc.includes('data-etab="typo"') && htmlSrc.includes('data-etab="stamps"'),
      "PDF Studio ribbon must include dedicated Text & Font (typo) and Stamps & CAD (stamps) tabs");

    // 3. DXF Studio must provide dedicated Annotate & Dim (data-dxfrtab="annotate") tab
    assert(dxfSrc.includes('data-dxfrtab="annotate"') && dxfSrc.includes('data-dxfgrp="annotate"'),
      "DXF Studio ribbon must include dedicated Annotate & Dim (annotate) tab");

    // 4. style.css must set max-height: none !important and overflow-y: visible !important on all 3 ribbons so .cap titles never clip
    assert(cssSrc.includes("max-height: none !important") && cssSrc.includes("overflow-y: visible !important"),
      "style.css must allow full vertical visibility for ribbon controls and .cap group captions");
  });


  test("SUITE 28: World View in View Menu/Ribbon, Concise Done/Rewind/Cancel + Quick Guide Docs & Settings Keyboard Shortcuts (Alt+ Defaults)", () => {
    const appSrc = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
    const extSrc = fs.readFileSync(path.join(ROOT_DIR, "extras.js"), "utf8");
    const dxfSrc = fs.readFileSync(path.join(ROOT_DIR, "dxf_studio.js"), "utf8");
    const menuSrc = fs.readFileSync(path.join(ROOT_DIR, "menu.js"), "utf8");
    const ribSrc = fs.readFileSync(path.join(ROOT_DIR, "ui_ribbon.js"), "utf8");
    const UI28 = require(path.join(ROOT_DIR, "ui_ribbon.js"));

    assert(menuSrc.includes("l: 'World View'") && menuSrc.includes("window.toggleWorldView"), "menu.js View menu must include World View toggle");
    assert(ribSrc.includes("id=\"rib-world-view-toggle\"") && ribSrc.includes("window.toggleWorldView ="), "ui_ribbon.js #tab-view must include #rib-world-view-toggle and window.toggleWorldView");
    for (const [name, src] of [["app.js", appSrc], ["extras.js", extSrc], ["dxf_studio.js", dxfSrc]]) {
      assert(src.includes("l: 'Done'") && src.includes("l: 'Rewind'") && src.includes("l: 'Cancel'"), `${name} context menu must use concise Done, Rewind, and Cancel labels`);
    }
    assert(!appSrc.includes("`<span class=\"k\">${it.k}</span>`"), "app.js showCtx must not render shortcut key badges near tools");
    assert(menuSrc.includes("Done, Rewind & Cancel (Drawing Save-Point & Rewind Workflow)"), "menu.js Help Quick Guide must document Done, Rewind & Cancel workflow");
    assert(ribSrc.includes("{ id: 'shortcuts', icon: 'zap', title: 'Keyboard Shortcuts'"), "openWorkstationSettingsModal must include Keyboard Shortcuts tab");
    const hudHtml = UI28.buildKeyboardHUDHTML();
    assert(hudHtml.includes("&#9998; Edit") && hudHtml.includes("&#8634; Default") && hudHtml.includes("Alt+"), "Keyboard Shortcuts editor must render Alt+ defaults, Edit button, and Default reset button on every option");
    assert(typeof UI28.DefectState.selectByRegion === "function" && appSrc.includes("function hitRegionAt("), "Touching a difference box on canvas must select that difference and display its note in Difference Notes");
  });


  test("SUITE 29: Colour System, Light/Dark Palette Cascade, DXF TrueColor (420) Round-Trip & DXF Studio Modify/Explode/Dock Fixes", () => {
    const cssSrc = fs.readFileSync(path.join(ROOT_DIR, "style.css"), "utf8");
    const appSrc = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
    const dxfSrc = fs.readFileSync(path.join(ROOT_DIR, "dxf_studio.js"), "utf8");
    const DXF = require(path.join(ROOT_DIR, "dxf_engine.js"));
    const DXFSt = require(path.join(ROOT_DIR, "dxf_studio.js"));
    const UI = require(path.join(ROOT_DIR, "ui_ribbon.js"));

    // 1. Verify CSS Light Theme high-specificity override and --fg / --accent variables
    assert(cssSrc.includes(":root[data-theme=\"light\"][data-cad-palette]") && cssSrc.includes("--fg: var(--ink)") && cssSrc.includes("--accent: var(--acc)"),
      "style.css must define high-specificity Light Theme override over data-cad-palette and provide --fg and --accent variables");

    // 2. Verify app.js syncs #kdock-theme-sel in setTheme and #alg-col-a/b/c in syncCompareColorUI
    assert(appSrc.includes("getElementById('kdock-theme-sel')") && appSrc.includes("'#alg-col-a'") && appSrc.includes("'#alg-col-b'") && appSrc.includes("'#alg-col-c'"),
      "app.js must synchronize #kdock-theme-sel in setTheme() and #alg-col-a/b/c in syncCompareColorUI()");

    // 3. Verify DXFEngine TrueColor (420), hexToTrueColor, hexToNearestACI, contrastAdjustHex, and customHex round-trip serialization
    assert.strictEqual(DXF.trueColorToHex(0x38bdf8), "#38bdf8", "trueColorToHex must convert 24-bit integer to #rrggbb");
    assert.strictEqual(DXF.hexToTrueColor("#38bdf8"), 0x38bdf8, "hexToTrueColor must convert #rrggbb to 24-bit integer");
    assert.strictEqual(DXF.contrastAdjustHex("#ffffff", false), "#0f172a", "contrastAdjustHex must invert white stroke on light paper background");
    assert.strictEqual(DXF.contrastAdjustHex("#000000", true), "#f8fafc", "contrastAdjustHex must invert black stroke on dark modelspace background");

    DXFSt.createNewBlankDXF("mm");
    const p = UI.DXFState.parsedB;
    p.addLayer("CUSTOM_LYR", { customHex: "#ff0055" });
    DXFSt.StudioState.currentLayer = "CUSTOM_LYR";
    DXFSt.StudioState.activeColor = "CUSTOM";
    DXFSt.StudioState.activeCustomHex = "#00d4ff";
    const lineEnt = { _id: "tc_line_1", type: "LINE", layer: "CUSTOM_LYR", customHex: "#00d4ff", x1: 10, y1: 10, x2: 90, y2: 40 };
    p.entities.push(lineEnt);
    const serialized = p.toDXFString();
    assert(serialized.includes("420\r\n" + DXF.hexToTrueColor("#00d4ff")), "toDXFString() must serialize entity customHex as group code 420 TrueColor");
    assert(serialized.includes("420\r\n" + DXF.hexToTrueColor("#ff0055")), "toDXFString() must serialize layer customHex as group code 420 TrueColor");

    const reparsed = new DXF.DXFParser(serialized).parse();
    const repLine = reparsed.entities.find(e => e.type === "LINE" && e.layer === "CUSTOM_LYR");
    assert(repLine && repLine.customHex === "#00d4ff", "DXFParser must restore entity customHex from group code 420 TrueColor");
    assert(reparsed.layers["CUSTOM_LYR"] && reparsed.layers["CUSTOM_LYR"].customHex === "#ff0055", "DXFParser must restore layer customHex from group code 420 TrueColor");

    // 4. Verify exploding a Donut (bulge-arc LWPOLYLINE) produces true ARC entities with cached _bbox
    const donut = DXFSt.createDonutEntity(50, 50, 4, 10);
    p.entities.push(donut);
    DXFSt.StudioState.selectedIds = new Set([donut._id]);
    const explodedCnt = DXFSt.explodeSelectedEntities();
    assert(explodedCnt >= 2, "explodeSelectedEntities on a bulge-arc Donut LWPOLYLINE must produce 2 semicircular ARC entities");
    const arcs = p.entities.filter(e => e.type === "ARC");
    assert(arcs.length >= 2 && arcs[0]._bbox && isFinite(arcs[0]._bbox.minX), "Exploded ARC entities must have valid _bbox via syncGeom");

    // 5. Verify DXF Studio #dxf-st-col-mode includes standard AutoCAD ACI colors and dock hide updates hide-left-dock/hide-right-dock
    assert(dxfSrc.includes("<option value=\"1\">1 Red</option>") && dxfSrc.includes("<option value=\"7\">7 White/Black</option>"),
      "dxf_studio.js #dxf-st-col-mode must include standard AutoCAD ACI color options");
    assert(dxfSrc.includes("bodyEl.classList.add('hide-left-dock')") && dxfSrc.includes("bodyEl.classList.add('hide-right-dock')"),
      "dxf_studio.js dock minimize buttons must add hide-left-dock / hide-right-dock to #dxf-studio-body");
  });

  test("SUITE 32: Cross-Unit Stepped Box Coordinate Alignment, Cross-Unit Block Digest, Icon Registry Completeness & Custom Tint High-Res Classification", () => {
    const DXF = require(path.join(ROOT_DIR, "dxf_engine.js"));
    const DXFStTools = require(path.join(ROOT_DIR, "dxf_studio_tools.js"));
    const iconsSrc = fs.readFileSync(path.join(ROOT_DIR, "icons.js"), "utf8");
    const appSrc = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
    const proSrc = fs.readFileSync(path.join(ROOT_DIR, "pro.js"), "utf8");
    const workerSrc = fs.readFileSync(path.join(ROOT_DIR, "worker.js"), "utf8");
    const weSrc = fs.readFileSync(path.join(ROOT_DIR, "worker_engine.js"), "utf8");

    // 1. Verify zero missing [data-ic] icon definitions across the entire application
    assert(iconsSrc.includes("measure:"), "icons.js must define measure icon for DXF Studio #dxf-st-area");
    const definedIcons = new Set([...iconsSrc.matchAll(/^\s*([a-zA-Z0-9_]+)\s*:/gm)].map(m => m[1]));
    for (const fn of ["index.html", "app.js", "pro.js", "editor.js", "dxf_studio.js", "ui_ribbon.js", "menu.js", "extras.js"]) {
      const fContent = fs.readFileSync(path.join(ROOT_DIR, fn), "utf8");
      for (const m of fContent.matchAll(/data-ic=["']([a-zA-Z0-9_]+)["']/g)) {
        assert(definedIcons.has(m[1]), `Icon "${m[1]}" referenced in ${fn} must be defined in icons.js`);
      }
    }

    // 2. Verify cross-unit (mm vs inch) sub-segment stepped boxes align in both normalized and local coordinate pipelines
    const wMm = new DXF.DXFWriter({ unit: "mm" });
    wMm.addLine(0, 0, 100 / wMm.scaleFactor, 0, "TRACES"); // 0..100 mm
    const wIn = new DXF.DXFWriter({ unit: "in" });
    wIn.addLine(0, 0, (120 / 25.4) / wIn.scaleFactor, 0, "TRACES"); // 0..120 mm in inches
    const pMm = new DXF.DXFParser(wMm.generateString()).parse();
    const pIn = new DXF.DXFParser(wIn.generateString()).parse();
    const diffCross = DXF.compareDXFEntities(pMm, pIn, { tol: 0.05 });
    const eAdded = diffCross.added[0];
    assert(eAdded && eAdded._normEnt && eAdded._normEnt._diffBBox, "Cross-unit added entity must populate _diffBBox on _normEnt");
    const boxesNorm = DXF.computeSteppedDiffBoxes(eAdded, (wx, wy) => [wx * 5, wy * 5], { boxSizeMils: 5, toMils: 39.37, scale: 5 });
    const boxesLocal = DXF.computeSteppedDiffBoxes(eAdded, (wx, wy) => [wx * 25.4 * 5, wy * 25.4 * 5], { boxSizeMils: 5, toMils: 39.37, scale: 5, useLocalCoords: true });
    assert(boxesNorm.length >= 10 && Math.abs(boxesNorm[0].x - boxesLocal[0].x) < 1.0 && boxesNorm[0].x >= 490,
      `Cross-unit stepped boxes must align at x>=490 in both normalized and local pipelines, got ${boxesNorm[0].x} vs ${boxesLocal[0].x}`);

    // 3. Verify ARC break & lengthen across 0°/360° wrap and open LWPOLYLINE lengthen
    const pArc = { entities: [] };
    const wrapArc = { _id: "wrap_arc", type: "ARC", layer: "0", cx: 0, cy: 0, r: 20, startAngle: 350, endAngle: 10 };
    pArc.entities.push(wrapArc);
    const brkArc = DXFStTools.breakEntityAtPoint(wrapArc, 20, 0, pArc);
    assert(brkArc && brkArc.ok && pArc.entities.length === 2, "breakEntityAtPoint must cleanly split an ARC crossing 0°/360°");
    const openPoly = { _id: "open_pl", type: "LWPOLYLINE", closed: false, points: [[0, 0, 0], [50, 0, 0]], renderPoints: [[0, 0], [50, 0]] };
    assert.strictEqual(DXFStTools.lengthenEntity(openPoly, 10), true, "lengthenEntity must support open LWPOLYLINE entities");
    assert(Math.abs(openPoly.points[1][0] - 60) < 0.01 && !openPoly.renderPoints, "Lengthened LWPOLYLINE must advance endpoint to 60 and invalidate stale renderPoints");

    // 4. Verify worker.js, worker_engine.js, pro.js, and app.js pixel classification & cache key guards
    assert(workerSrc.includes("(gb - rb > 70)") && weSrc.includes("(gb - rb > 70)"),
      "worker.js and worker_engine.js must compare green channel against red channel (gb - rb > 70) for Slot B dominance");
    assert(proSrc.includes("CompareMemoryGuard.classifyDiffPixelTint") && proSrc.includes("CompareMemoryGuard.releaseCropCanvases"),
      "pro.js must use CompareMemoryGuard.classifyDiffPixelTint and releaseCropCanvases");
    assert(appSrc.includes("const boxMils = (window.DXFState && Number(window.DXFState.highlightBoxMils) > 0)"),
      "app.js getPageSettingsSuffix must include DXFState.highlightBoxMils so box size changes refresh cached page analysis");

    // 4b. Verify removing a 50 cm (500 mm) mark line from a wheel DXF (block, polyline, or dimension) highlights ONLY the 50 cm mark line and NEVER the whole DXF or a 4-sided bbox perimeter
    const wheelDxfA = [
      "0", "SECTION", "2", "BLOCKS",
      "0", "BLOCK", "8", "0", "2", "WHEEL_BLK", "70", "0", "10", "0", "20", "0",
      "0", "CIRCLE", "8", "WHEEL", "10", "0", "20", "0", "40", "200",
      "0", "CIRCLE", "8", "WHEEL", "10", "0", "20", "0", "40", "30",
      "0", "LINE", "8", "MARK", "10", "-245", "20", "-250", "11", "-245", "21", "250",
      "0", "MTEXT", "8", "DIMENSIONS", "10", "-245", "20", "0", "40", "3.5", "71", "5", "1", "500",
      "0", "ENDBLK",
      "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES",
      "0", "INSERT", "8", "WHEEL", "2", "WHEEL_BLK", "10", "0", "20", "0", "41", "1", "42", "1", "50", "0",
      "0", "LWPOLYLINE", "8", "WHEEL", "90", "4", "70", "0",
      "10", "-100", "20", "-100",
      "10", "100", "20", "-100",
      "10", "100", "20", "100",
      "10", "-245", "20", "100",
      "0", "ENDSEC", "0", "EOF"
    ].join("\r\n");
    const pWheelA = new DXF.DXFParser(wheelDxfA).parse();
    const pWheelB = new DXF.DXFParser(pWheelA.toDXFString()).parse();
    const rtDiff0 = DXF.compareDXFEntities(pWheelA, pWheelB, { tol: 0.05 });
    assert.strictEqual(rtDiff0.removed.length, 0, "Round-tripped DXF with MTEXT attachmentPoint 71 must have 0 false removed entities");
    assert.strictEqual(rtDiff0.added.length, 0, "Round-tripped DXF with MTEXT attachmentPoint 71 must have 0 false added entities");

    // Remove the 500 mm (50 cm) mark line from WHEEL_BLK and the last segment from the LWPOLYLINE in Rev B
    pWheelB.blocks["WHEEL_BLK"].entities = pWheelB.blocks["WHEEL_BLK"].entities.filter(e => e.type !== "LINE");
    pWheelB.entities.find(e => e.type === "LWPOLYLINE").points.pop();
    pWheelB.recomputeBoundsAndCounts();

    DXF.compareDXFEntities(pWheelA, pWheelB, { tol: 0.05 });
    const polyBAfter = pWheelB.entities.find(e => e.type === "LWPOLYLINE");
    const boxesPolyB = DXF.computeSteppedDiffBoxes(polyBAfter, (wx, wy) => [wx + 500, 500 - wy], { boxSizeMils: 5, toMils: 39.37, scale: 1 });
    assert.strictEqual(boxesPolyB.length, 0, "Unchanged remaining segments of LWPOLYLINE in Rev B after removing mark segment must generate 0 diff boxes");

    const insBAfter = pWheelB.entities.find(e => e.type === "INSERT");
    const boxesInsB = DXF.computeSteppedDiffBoxes(insBAfter, (wx, wy) => [wx + 500, 500 - wy], { boxSizeMils: 5, toMils: 39.37, scale: 1, parser: pWheelB });
    assert.strictEqual(boxesInsB.length, 0, "Unchanged remaining circles of INSERT block in Rev B after removing mark line must generate 0 diff boxes");

    const insABefore = pWheelA.entities.find(e => e.type === "INSERT");
    const boxesInsA = DXF.computeSteppedDiffBoxes(insABefore, (wx, wy) => [wx + 500, 500 - wy], { boxSizeMils: 5, toMils: 39.37, scale: 1, parser: pWheelA });
    assert(boxesInsA.length > 0, "Removed 50 cm mark line inside INSERT block must generate stepped boxes");
    for (const b of boxesInsA) {
      assert(Math.abs((b.x + b.w * 0.5) - 255) <= 8, `Stepped box must stay on removed x=-245 mark line (got screen x=${b.x})`);
    }

    // 4c. Verify Electron close/reopen memory cleanup & fullscreen resize performance guards
    const mainSrc = fs.readFileSync(path.join(ROOT_DIR, "main.js"), "utf8");
    const styleSrc = fs.readFileSync(path.join(ROOT_DIR, "style.css"), "utf8");
    const dxfStudioSrc = fs.readFileSync(path.join(ROOT_DIR, "dxf_studio.js"), "utf8");
    assert(!mainSrc.includes("--optimize-for-size"), "main.js must not throttle V8 JIT with --optimize-for-size");
    assert(mainSrc.includes("disable-http-cache") && mainSrc.includes("releaseSingleInstanceLock"),
      "main.js must disable unused HTTP cache and release single-instance lock on close");
    assert(appSrc.includes("window.__kenshoCleanupOnClose") && appSrc.includes("is-resizing"),
      "app.js must expose __kenshoCleanupOnClose and toggle body.is-resizing during window resize/fullscreen");
    assert(styleSrc.includes("body.is-resizing"), "style.css must pause backdrop-filter and transitions during body.is-resizing");
    assert(dxfStudioSrc.includes("if (document.body.dataset.view === 'dxf') scheduleRenderCanvas();"),
      "dxf_studio.js ResizeObserver must use debounced scheduleRenderCanvas() instead of synchronous renderCanvas()");

    // 5. Verify zero literal copyrighted CAM strings across all repository JS/HTML/CSS files (including test suite)
    for (const fn of ["app.js", "pro.js", "dxf_engine.js", "dxf_compare_core.js", "dxf_studio.js", "dxf_studio_tools.js", "compare_memory_guard.js", "ui_ribbon.js", "ui_i18n_catalog.js", "cam_engine.js", "editor.js", "worker_engine.js", "worker.js", "measure_engine.js", "menu.js", "extras.js", "main.js", "preload.js", "pre.js", "icons.js", "tests/v21_test_suite.js"]) {
      const text = fs.readFileSync(path.join(ROOT_DIR, fn), "utf8");
      assert(!/cam\s*350/i.test(text), `${fn} must not contain literal copyrighted CAM string`);
    }
  });


  test('SUITE 33: High-Precision DXF Slight-Move Detection, Measurement Value Diff Boxes, Red/White Rev A/B & Accurate DXF Save', () => {
    const DXFCompareCore = global.DXFCompareCore = require(path.join(ROOT_DIR, 'dxf_compare_core.js'));
    const DXFEngine = require(path.join(ROOT_DIR, 'dxf_engine.js'));

    // 1. Slight 0.01 mm movement & slight text value modification must be detected by default tol (0.005)
    const wA = new DXFEngine.DXFWriter({ unit: 'mm', scale: 1.0 });
    const fA = 1 / wA.scaleFactor;
    wA.addLine(0, 0, 100 * fA, 0, 'OUTLINE');
    wA.addText('10.00', 50 * fA, 20 * fA, 3 * fA, 0, 'DIMS');
    const wB = new DXFEngine.DXFWriter({ unit: 'mm', scale: 1.0 });
    const fB = 1 / wB.scaleFactor;
    wB.addLine(0, 0.01 * fB, 100 * fB, 0.01 * fB, 'OUTLINE');
    wB.addText('10.02', 50 * fB, 20 * fB, 3 * fB, 0, 'DIMS');
    const pA = new DXFEngine.DXFParser(wA.generateString()).parse();
    const pB = new DXFEngine.DXFParser(wB.generateString()).parse();
    const diff = DXFEngine.compareDXFEntities(pA, pB);
    assert.strictEqual(diff.removed.length, 2, 'Must detect 0.01mm moved LINE and modified TEXT in Rev A');
    assert.strictEqual(diff.added.length, 2, 'Must detect 0.01mm moved LINE and modified TEXT in Rev B');

    // 2. DIMENSION with unchanged geometry but modified measurement value generates stepped boxes around the value
    const dxfDimA = [
      '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
      '0','SECTION','2','ENTITIES',
      '0','DIMENSION','8','DIMS','1','<>','42','10.00','10','10','20','20','11','5','21','22','13','0','23','0','14','10','24','0',
      '0','ENDSEC','0','EOF'
    ].join('\r\n');
    const dxfDimB = [
      '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
      '0','SECTION','2','ENTITIES',
      '0','DIMENSION','8','DIMS','1','<>','42','10.02','10','10','20','20','11','5','21','22','13','0','23','0','14','10','24','0',
      '0','ENDSEC','0','EOF'
    ].join('\r\n');
    const pDimA = new DXFEngine.DXFParser(dxfDimA).parse();
    const pDimB = new DXFEngine.DXFParser(dxfDimB).parse();
    const dimDiff = DXFEngine.compareDXFEntities(pDimA, pDimB);
    assert.strictEqual(dimDiff.modifiedPairs.length, 1, 'Must detect slightly modified DIMENSION measurement value');
    const dimBoxes = DXFCompareCore.computeSteppedDiffBoxes(dimDiff.modifiedPairs[0].after, (wx, wy) => [wx * 10, wy * 10], {
      boxSizeMils: 5, toMils: 39.3700787, scale: 10, canvasW: 2000, canvasH: 1500, parser: pDimB
    });
    assert(dimBoxes.length > 0, 'Modified DIMENSION measurement value must generate stepped boxes');

    // 3. Accurate DXF saving round-trip with 0.001 tolerance
    const sample = DXFEngine.generateSampleMechanicalDXF(true, 'mm');
    const pOrig = new DXFEngine.DXFParser(sample).parse();
    const pSaved = new DXFEngine.DXFParser(pOrig.toDXFString()).parse();
    const rtDiff = DXFEngine.compareDXFEntities(pOrig, pSaved, 0.001);
    assert.strictEqual(rtDiff.added.length + rtDiff.removed.length + rtDiff.modifiedPairs.length, 0,
      'Saved DXF round-trip must match original with zero false diffs');

    // 4. Red Rev A / White Rev B default tints in DXF Studio & Native DXF Compare
    const dxfSrc = fs.readFileSync(path.join(ROOT_DIR, 'dxf_engine.js'), 'utf8');
    const dsSrc = fs.readFileSync(path.join(ROOT_DIR, 'dxf_studio.js'), 'utf8');
    assert(dxfSrc.includes("'#ffffff'") && dsSrc.includes("'#ffffff'"),
      'DXF comparison must default Rev B to White (#ffffff) and Rev A to Red (#ef4444)');
  });

  test('SUITE 34: Single Red Triangle Text Change Indicator, No Boxes in DXF Studio Overlay, 7-Mil Drawing Boxes & Text Size Independence', () => {
    const DXFCompareCore = global.DXFCompareCore = require(path.join(ROOT_DIR, 'dxf_compare_core.js'));
    const DXFEngine = require(path.join(ROOT_DIR, 'dxf_engine.js'));
    const DXFStudio = require(path.join(ROOT_DIR, 'dxf_studio.js'));
    const UI = require(path.join(ROOT_DIR, 'ui_ribbon.js'));

    // 1. Standard 7 mils default on drawing geometry (lines/arcs/circles)
    assert.strictEqual(UI.DXFState.highlightBoxMils, 7, 'DXFState.highlightBoxMils must default to 7 mils');
    const lineEnt = { type: 'LINE', layer: 'OUTLINE', x1: 0, y1: 0, x2: 50, y2: 0 };
    const lineBoxes = DXFCompareCore.computeSteppedDiffBoxes(lineEnt, (wx, wy) => [wx * 10, wy * 10], {
      toMils: 39.3700787, scale: 10, canvasW: 2000, canvasH: 1500
    });
    assert(lineBoxes.length >= 10 && lineBoxes.every(b => b.mils === 7 && !b.isTextTriangle && b.w === b.h),
      'Drawing geometry must generate small stepped square boxes at standard 7 mils');

    // 2. DXF Studio Vector Diff Overlay must NOT draw diff boxes (colors only in DXF Studio; boxes only in Compare)
    assert.strictEqual(DXFStudio.StudioState.showDiffBoxes, false,
      'DXF Studio must have showDiffBoxes: false so Vector Diff Overlay uses revision colors without boxes');

    // 3. Changed TEXT must emit ONLY ONE Red Triangle indication (isTextTriangle: true, shape: "triangle", kind: "r")
    const textEnt = { type: 'TEXT', layer: 'NOTES', text: 'PRODUCTION_REV_B', x: 20, y: 40, height: 4.0, rotation: 0, hMode: 'left', vMode: 'baseline', widthFactor: 0.86 };
    const textInd = DXFCompareCore.computeSteppedDiffBoxes(textEnt, (wx, wy) => [wx * 10, 1000 - wy * 10], {
      toMils: 39.3700787, scale: 10, canvasW: 2000, canvasH: 1500
    });
    assert.strictEqual(textInd.length, 1, 'Changed TEXT must generate ONLY ONE indication');
    assert.strictEqual(textInd[0].isTextTriangle, true, 'Text change indicator must be a red triangle (isTextTriangle: true)');
    assert.strictEqual(textInd[0].shape, 'triangle', 'Text change indicator must have shape: "triangle"');
    assert.strictEqual(textInd[0].kind, 'r', 'Text change triangle indicator must be red (kind: "r")');

    // 4. Multi-word modified TEXT at the same position must also emit ONLY ONE red triangle indication
    const wWordA = new DXFEngine.DXFWriter({ unit: 'mm', scale: 1.0 });
    const fWA = 1 / wWordA.scaleFactor;
    wWordA.addText('REV A: INITIAL PRODUCTION RELEASE', 10 * fWA, 20 * fWA, 3.0 * fWA, 0, 'TITLE');
    const wWordB = new DXFEngine.DXFWriter({ unit: 'mm', scale: 1.0 });
    const fWB = 1 / wWordB.scaleFactor;
    wWordB.addText('REV B: INITIAL PRODUCTION RELEASE', 10 * fWB, 20 * fWB, 3.0 * fWB, 0, 'TITLE');
    const pWordA = new DXFEngine.DXFParser(wWordA.generateString()).parse();
    const pWordB = new DXFEngine.DXFParser(wWordB.generateString()).parse();
    const diffWord = DXFEngine.compareDXFEntities(pWordA, pWordB);
    assert.strictEqual(diffWord.modifiedPairs.length, 1, 'Modified multi-word TEXT must pair in modifiedPairs');
    const afterWordEnt = diffWord.modifiedPairs[0].after;
    const wordInd = DXFCompareCore.computeSteppedDiffBoxes(afterWordEnt, (wx, wy) => [wx * 10, 1000 - wy * 10], {
      toMils: 39.3700787, scale: 10, canvasW: 2000, canvasH: 1500
    });
    assert.strictEqual(wordInd.length, 1, 'Modified multi-word TEXT must emit ONLY ONE red triangle indication');
    assert.strictEqual(wordInd[0].isTextTriangle, true, 'Modified multi-word TEXT indicator must be a red triangle');

    // 5. Text size independence: identical wording, position, rotation, and alignment with different height/boxWidth must not trigger false diffs
    const dxfTxtSizeA = ['0','SECTION','2','ENTITIES','0','TEXT','8','NOTES','10','15','20','25','40','2.5','41','0.85','1','M4 TAPPED HOLE','0','ENDSEC','0','EOF'].join('\r\n');
    const dxfTxtSizeB = ['0','SECTION','2','ENTITIES','0','TEXT','8','NOTES','10','15','20','25','40','3.5','41','1.00','1','M4 TAPPED HOLE','0','ENDSEC','0','EOF'].join('\r\n');
    const pTS1 = new DXFEngine.DXFParser(dxfTxtSizeA).parse();
    const pTS2 = new DXFEngine.DXFParser(dxfTxtSizeB).parse();
    const diffTS = DXFEngine.compareDXFEntities(pTS1, pTS2);
    assert.strictEqual(diffTS.added.length + diffTS.removed.length, 0,
      'TEXT with identical wording, position, and alignment must be treated as unchanged regardless of text height/widthFactor');

    // 6. Split collinear lines with 100% shared geometry on a layer must be recognized as unchanged (0 false diffs)
    const wColA = new DXFEngine.DXFWriter({ unit: 'mm', scale: 1.0 });
    const fCA = 1 / wColA.scaleFactor;
    wColA.addLine(0, 0, 50 * fCA, 0, 'TRACES');
    wColA.addLine(50 * fCA, 0, 100 * fCA, 0, 'TRACES');
    const wColB = new DXFEngine.DXFWriter({ unit: 'mm', scale: 1.0 });
    const fCB = 1 / wColB.scaleFactor;
    wColB.addLine(0, 0, 100 * fCB, 0, 'TRACES');
    const pColA = new DXFEngine.DXFParser(wColA.generateString()).parse();
    const pColB = new DXFEngine.DXFParser(wColB.generateString()).parse();
    const diffCol = DXFEngine.compareDXFEntities(pColA, pColB, { tol: 0.05 });
    assert.strictEqual(diffCol.added.length + diffCol.removed.length, 0,
      'Split collinear LINE segments (0..50 + 50..100 vs 0..100) must produce 0 false-positive diffs');
  });

  test('SUITE 35: PDF Compare & CAM Compare Strict Audit Fixes (Arc Bounds, Region Winding/Closing, Rotated Pads, Custom Tints & Stepped CAM Boxes)', () => {
    const CAMEngine = require(path.join(ROOT_DIR, 'cam_engine.js'));
    const WorkerEngine = require(path.join(ROOT_DIR, 'worker_engine.js'));
    const UI = require(path.join(ROOT_DIR, 'ui_ribbon.js'));
    const appSrc = fs.readFileSync(path.join(ROOT_DIR, 'app.js'), 'utf8');
    const uiSrc = fs.readFileSync(path.join(ROOT_DIR, 'ui_ribbon.js'), 'utf8');
    const proSrc = fs.readFileSync(path.join(ROOT_DIR, 'pro.js'), 'utf8');

    const cmp = new CAMEngine.CAMCompare(1200, 900);

    // 1. CAM Compare: Full-circle G02/G03 arc (x1===x2, y1===y2) must compute true radius & bounding box and match identical arcs
    const gbrArcA = new CAMEngine.GerberParser([
      '%FSLAX24Y24*%',
      '%MOIN*%',
      '%ADD10C,0.010*%',
      'D10*',
      'G75*',
      'X10000Y10000D02*',
      'G02X10000Y10000I05000J00000D01*',
      'M02*'
    ].join('\n')).parse();
    const gbrArcB = new CAMEngine.GerberParser([
      '%FSLAX24Y24*%',
      '%MOIN*%',
      '%ADD10C,0.010*%',
      'D10*',
      'G75*',
      'X20000Y10000D02*',
      'G02X20000Y10000I-05000J00000D01*',
      'M02*'
    ].join('\n')).parse();
    const arcDiffSame = cmp.comparePrimitives(gbrArcA, gbrArcB, { compareTolMils: 0.5 });
    assert.strictEqual(arcDiffSame.totalDiffs, 0, 'Full-circle G02 arcs with same center (1.5, 1.0) and radius (0.5 in) must match with 0 diffs');

    // Different radius full circle must be flagged with full circle bounding box
    const gbrArcDiffR = new CAMEngine.GerberParser([
      '%FSLAX24Y24*%',
      '%MOIN*%',
      '%ADD10C,0.010*%',
      'D10*',
      'G75*',
      'X10000Y10000D02*',
      'G02X10000Y10000I08000J00000D01*',
      'M02*'
    ].join('\n')).parse();
    const arcDiffChanged = cmp.comparePrimitives(gbrArcA, gbrArcDiffR, { compareTolMils: 0.5 });
    assert.strictEqual(arcDiffChanged.added.length, 1, 'Changed full-circle G02 arc radius must be detected');
    const addedArc = arcDiffChanged.added[0];
    assert(addedArc.arcRIn > 0.79 && (addedArc.maxXIn - addedArc.minXIn) > 1.55,
      'Full-circle G02 arc primitive must have full circle bounding box (> 1.55 in wide), not a point bbox');

    // 2. CAM Compare: G36/G37 REGION copper pour with duplicate closing vertex, cyclic vertex shift, or reversed winding must match with 0 false diffs
    const gbrRegA = new CAMEngine.GerberParser([
      '%FSLAX24Y24*%',
      '%MOIN*%',
      'G36*',
      'X00000Y00000D02*',
      'X10000Y00000D01*',
      'X10000Y10000D01*',
      'X00000Y10000D01*',
      'X00000Y00000D01*',
      'G37*',
      'M02*'
    ].join('\n')).parse();
    const gbrRegB = new CAMEngine.GerberParser([
      '%FSLAX24Y24*%',
      '%MOIN*%',
      'G36*',
      'X10000Y10000D02*',
      'X10000Y00000D01*',
      'X00000Y00000D01*',
      'X00000Y10000D01*',
      'G37*',
      'M02*'
    ].join('\n')).parse();
    const regDiff = cmp.comparePrimitives(gbrRegA, gbrRegB, { compareTolMils: 0.5 });
    assert.strictEqual(regDiff.totalDiffs, 0,
      'Gerber G36/G37 REGION copper pour with closing duplicate vertex vs cyclically shifted/reversed contour must produce 0 false diffs');

    // 3. CAM Compare: FLASH rotational symmetry (circle invariant to rotation; 90-deg rotated rectangle 20x40 mil matches 0-deg 40x20 mil)
    const gbrFlashA = new CAMEngine.GerberParser([
      '%FSLAX24Y24*%',
      '%MOIN*%',
      '%ADD10C,0.030*%',
      '%ADD11R,0.020X0.040*%',
      '%LR90.0*%',
      'D10*',
      'X05000Y05000D03*',
      'D11*',
      'X10000Y10000D03*',
      'M02*'
    ].join('\n')).parse();
    const gbrFlashB = new CAMEngine.GerberParser([
      '%FSLAX24Y24*%',
      '%MOIN*%',
      '%ADD10C,0.030*%',
      '%ADD11R,0.040X0.020*%',
      'D10*',
      'X05000Y05000D03*',
      'D11*',
      'X10000Y10000D03*',
      'M02*'
    ].join('\n')).parse();
    const flashDiff = cmp.comparePrimitives(gbrFlashA, gbrFlashB, { compareTolMils: 0.5 });
    assert.strictEqual(flashDiff.totalDiffs, 0,
      'Circle pad with %LR90% and 90-deg rotated 20x40 rectangle pad must match 0-deg 40x20 rectangle pad with 0 false diffs');

    // 4. WorkerEngine._syncDiff custom tintA / tintB pixel classification & negative edge clamp
    const wPxA = new Uint8ClampedArray([
      255, 255, 255, 255,  255, 255, 255, 255,
      255, 255, 255, 255,  16, 185, 129, 255
    ]);
    const wPxB = new Uint8ClampedArray([
      255, 255, 255, 255,  255, 255, 255, 255,
      255, 255, 255, 255,  59, 130, 246, 255
    ]);
    const wDiff = new WorkerEngine.WorkerClient()._syncDiff({
      width: 2, height: 2, dataA: wPxA, dataB: wPxB, tol: 20, edge: -3, tintA: '#10b981', tintB: '#3b82f6'
    });
    assert.strictEqual(wDiff.cls[3], 1, 'Worker _syncDiff must classify custom tintA (#10b981) pixel as class 1 even with negative edge input');

    // 5. PDF Compare & CAM Compare source code checks (source canvas center pivots, stepped CAM subBoxes, bottom-layer auto-mirror)
    assert(appSrc.includes('const srcWA = (a && a.c && a.c.width) ? a.c.width : W') && appSrc.includes('const cx = srcWB / 2, cy = srcHB / 2'),
      'app.js must capture srcWA/srcWB before zeroing canvases and use them as rotation pivots in transformPtA/transformPtB');
    assert(uiSrc.includes('isActiveLayerMirroredX') && proSrc.includes('CS.isActiveLayerMirroredX'),
      'CAMState.isActiveLayerMirroredX must align bottom-layer auto-mirror coordinates across pro.js and ui_ribbon.js');
    assert(uiSrc.includes('addSampledLineBoxes(item.x1In, item.y1In, item.x2In, item.y2In)'),
      'ui_ribbon.js mapPrimToRegion must generate stepped 7-mil subBoxes along CAM traces and slots');
  });


  // ============================================================================
  // SUITE 36: AutoCAD Binary DXF & DWG Support, Accurate Move/Transform (Zero Double-Transform),
  //           Calibrated Text & Structure Rendering, and Full 60+ AutoCAD Command Engine
  // ============================================================================
  await testAsync("SUITE 36: AutoCAD File Support (Binary DXF & DWG), Accurate Move/Transform, Text/Structure Rework & Full AutoCAD Command Engine", async () => {
    const dxfEngSrc = fs.readFileSync(path.join(ROOT_DIR, "dxf_engine.js"), "utf8");
    const studioSrc = fs.readFileSync(path.join(ROOT_DIR, "dxf_studio.js"), "utf8");
    const DXFStudio = require(path.join(ROOT_DIR, "dxf_studio.js"));
    const mainSrc = fs.readFileSync(path.join(ROOT_DIR, "main.js"), "utf8");
    const preloadSrc = fs.readFileSync(path.join(ROOT_DIR, "preload.js"), "utf8");
    const appSrc = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
    const uiSrc = fs.readFileSync(path.join(ROOT_DIR, "ui_ribbon.js"), "utf8");

    // 1. Native AutoCAD Binary DXF parsing (22-byte sentinel + Int16 group codes + Float64/NullStr payloads)
    const chunks = [];
    const pushStr = s => chunks.push(Buffer.from(s + "\0", "utf8"));
    const pushI16 = n => { const b = Buffer.alloc(2); b.writeInt16LE(n, 0); chunks.push(b); };
    const pushF64 = n => { const b = Buffer.alloc(8); b.writeDoubleLE(n, 0); chunks.push(b); };
    chunks.push(Buffer.from("AutoCAD Binary DXF\r\n\x1a\x00", "ascii"));
    const addStrPair = (c, v) => { pushI16(c); pushStr(v); };
    const addF64Pair = (c, v) => { pushI16(c); pushF64(v); };
    addStrPair(0, "SECTION"); addStrPair(2, "ENTITIES");
    addStrPair(0, "LINE"); addStrPair(8, "0");
    addF64Pair(10, 12.5); addF64Pair(20, 25.0);
    addF64Pair(11, 112.5); addF64Pair(21, 75.0);
    addStrPair(0, "TEXT"); addStrPair(8, "NOTES");
    addF64Pair(10, 30.0); addF64Pair(20, 40.0); addF64Pair(40, 3.5);
    addStrPair(1, "BIN_DXF_OK");
    addStrPair(0, "ENDSEC"); addStrPair(0, "EOF");
    const binU8 = new Uint8Array(Buffer.concat(chunks));
    const binParser = new DXFEngine.DXFParser(binU8).parse();
    assert.strictEqual(binParser.entities.length, 2, "Binary DXF parser must decode LINE and TEXT entities cleanly");
    assert(Math.abs(binParser.entities[0].x1 - 12.5) < 1e-6 && Math.abs(binParser.entities[0].y2 - 75.0) < 1e-6,
      "Binary DXF LINE coordinates must match IEEE-754 Float64 payload");
    assert.strictEqual(binParser.entities[1].text, "BIN_DXF_OK", "Binary DXF TEXT string must decode cleanly");
    assert.strictEqual(DXFEngine.isAutoCADFileName("bracket.dwg"), true, "isAutoCADFileName must recognize .dwg files");

    // 2. Offline .dwg IPC & file routing presence across main.js, preload.js, app.js, ui_ribbon.js, dxf_studio.js
    assert(mainSrc.includes("convert-dwg-to-dxf") && preloadSrc.includes("convertDwgToDxf"),
      "main.js and preload.js must expose offline convert-dwg-to-dxf IPC bridge");
    assert(appSrc.includes("dwg") && uiSrc.includes("convertDwgToDxf") && studioSrc.includes("convertDwgToDxf"),
      "app.js, ui_ribbon.js, and dxf_studio.js must route and convert .dwg AutoCAD files");

    // 3. Zero Double-Transform Accuracy on LWPOLYLINE (where ent.renderPoints === ent.points) + *D Block Preservation
    const polyEnt = {
      _id: 101, type: "LWPOLYLINE", layer: "0", closed: true,
      points: [{ x: 0, y: 0, bulge: 0 }, { x: 10, y: 0, bulge: 0 }, { x: 10, y: 10, bulge: 0 }]
    };
    polyEnt.renderPoints = polyEnt.points; // Exact shared-reference layout produced by DXFParser!
    DXFStudio.translateEntity(polyEnt, 15, 25, null);
    assert(Math.abs(polyEnt.points[0].x - 15) < 1e-6 && Math.abs(polyEnt.points[0].y - 25) < 1e-6,
      "translateEntity must move shared-reference LWPOLYLINE by 1x (15,25), NEVER 2x (30,50)");
    assert(Math.abs(polyEnt.points[1].x - 25) < 1e-6 && Math.abs(polyEnt.points[1].y - 25) < 1e-6,
      "translateEntity must preserve LWPOLYLINE rigid geometry without structure collapse");

    const rotEnt = { _id: 102, type: "LWPOLYLINE", layer: "0", closed: false, points: [{ x: 10, y: 0, bulge: 0 }] };
    rotEnt.renderPoints = rotEnt.points;
    DXFStudio.rotateEntity(rotEnt, 0, 0, 90, null);
    assert(Math.abs(rotEnt.points[0].x) < 1e-5 && Math.abs(rotEnt.points[0].y - 10) < 1e-5,
      "rotateEntity must rotate shared-reference LWPOLYLINE by 90 deg, NEVER 180 deg");

    const scEnt = { _id: 103, type: "LWPOLYLINE", layer: "0", closed: false, points: [{ x: 10, y: 5, bulge: 0 }] };
    scEnt.renderPoints = scEnt.points;
    DXFStudio.scaleEntity(scEnt, 0, 0, 2, null);
    assert(Math.abs(scEnt.points[0].x - 20) < 1e-6 && Math.abs(scEnt.points[0].y - 10) < 1e-6,
      "scaleEntity must scale shared-reference LWPOLYLINE by 2x, NEVER 4x");

    const mirEnt = { _id: 104, type: "LWPOLYLINE", layer: "0", closed: false, points: [{ x: 10, y: 5, bulge: 0 }] };
    mirEnt.renderPoints = mirEnt.points;
    DXFStudio.mirrorEntity(mirEnt, 0, 0, 0, 10, null);
    assert(Math.abs(mirEnt.points[0].x - (-10)) < 1e-6 && Math.abs(mirEnt.points[0].y - 5) < 1e-6,
      "mirrorEntity must mirror shared-reference LWPOLYLINE once across Y-axis, NEVER twice");

    // Verify DIMENSION *D block is cloned & translated rather than deleted
    const mockParser = {
      blocks: {
        "*D1": { name: "*D1", baseX: 0, baseY: 0, entities: [{ type: "LINE", x1: 0, y1: 0, x2: 10, y2: 0 }] }
      }
    };
    const dimEnt = { _id: 105, type: "DIMENSION", layer: "DIM", blockName: "*D1", defX: 0, defY: 0, midX: 5, midY: 2 };
    DXFStudio.translateEntity(dimEnt, 20, 30, mockParser);
    assert(dimEnt.blockName && dimEnt.blockName !== "*D1" && mockParser.blocks[dimEnt.blockName],
      "translateEntity must clone and preserve DIMENSION *D block geometry instead of deleting blockName");
    assert(Math.abs(mockParser.blocks[dimEnt.blockName].entities[0].x1 - 20) < 1e-6,
      "Cloned *D block sub-entities must be translated by exact (dx, dy)");

    // 4. Text Sizing ($TEXTSIZE + Unit-Aware Default), MTEXT Wrapping, Proportional Dimension Text & Normalized Pointer Coords
    const inchTextDXF = [
      "0","SECTION","2","HEADER","9","$INSUNITS","70","1","9","$TEXTSIZE","40","0.18","0","ENDSEC",
      "0","SECTION","2","ENTITIES","0","TEXT","8","0","10","0","20","0","1","INCH_NOTE","0","ENDSEC","0","EOF"
    ].join("\n");
    const inchParsed = new DXFEngine.DXFParser(inchTextDXF).parse();
    assert(Math.abs(inchParsed.entities[0].height - 0.18) < 1e-6,
      "DXFParser must respect $TEXTSIZE (0.18 in) instead of hardcoded 2.5");
    assert(studioSrc.includes("DXFEngine.wrapMTextLines") && !studioSrc.includes("Math.max(11, Math.min(2048, 2.5 * StudioState.zoom))"),
      "dxf_studio.js must wrap MTEXT and use proportional DIMENSION text without the giant 11px/2.5*zoom box fallback");
    assert(studioSrc.includes("const scaleX = rect.width > 0 ? (cv.width / rect.width) : 1;"),
      "dxf_studio.js must normalize CSS-to-backing-store canvas coordinates on pointer events");

    // 5. Full AutoCAD Command Engine (60+ commands, polar @dist<angle, direct distance, history)
    assert(studioSrc.includes("polarMatch") && studioSrc.includes("STRETCH") && studioSrc.includes("DIVIDE") &&
           studioSrc.includes("REGEN") && studioSrc.includes("createBlockFromSelection") && studioSrc.includes("listSelectedEntitiesInfo") &&
           studioSrc.includes("ArrowUp") && studioSrc.includes("StudioState.commandHistory"),
      "dxf_studio.js must implement full AutoCAD command engine with polar @dist<ang, direct distance entry, STRETCH/BLOCK/DIVIDE/LIST/REGEN/UNITS/ORTHO/OSNAP/GRID/HELP and Up/Down history");
  });


  // ============================================================================
  // SUITE 37: PDF Studio, Compare Area & DXF Studio Bug Fixes + New Engineering Options
  // ============================================================================
  await testAsync("SUITE 37: PDF Studio (Undo/MultiSel Fix, Align, Snap Grid, Lock, Page PNG), Compare (Reset Align, Blink Speed, Diffs JSON) & DXF Studio (Aid Bindings Fix, LAYISO, QSELECT, FIND, BOM CSV)", async () => {
    const edSrc = fs.readFileSync(path.join(ROOT_DIR, "editor.js"), "utf8");
    const htmlSrc = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");
    const appSrc = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
    const ribSrc = fs.readFileSync(path.join(ROOT_DIR, "ui_ribbon.js"), "utf8");
    const dsSrc = fs.readFileSync(path.join(ROOT_DIR, "dxf_studio.js"), "utf8");
    const DXFStudio = require(path.join(ROOT_DIR, "dxf_studio.js"));

    // 1. PDF Studio fixes & new options
    assert(edSrc.includes("if (Array.isArray(E.multiSel)) E.multiSel = [];"),
      "editor.js undo/redo must clear stale E.multiSel selection handles");
    assert(edSrc.includes("function alignSelectedAnns(") && edSrc.includes("function toggleSnapGrid(") &&
           edSrc.includes("function toggleLockSelectedAnn(") && edSrc.includes("async function exportCurrentPagePNG("),
      "editor.js must implement alignSelectedAnns, toggleSnapGrid, toggleLockSelectedAnn, and exportCurrentPagePNG");
    assert(htmlSrc.includes('id="eSnapGridBtn"') && htmlSrc.includes('id="eLockAnnBtn"') &&
           htmlSrc.includes('id="eAlignLeftBtn"') && htmlSrc.includes('id="eDistHBtn"') && htmlSrc.includes('id="eExportPngBtn"'),
      "index.html PDF Studio ribbon must expose Snap Grid, Lock, Align, Distribute, and Export Page PNG buttons");

    // 2. Compare Area fixes & new options
    assert(appSrc.includes("function resetCompareAlignment(") && appSrc.includes("function setBlinkIntervalMs(") &&
           appSrc.includes("function getCompareDiffSummary(") && appSrc.includes("async function exportCompareDiffsJSON("),
      "app.js must implement resetCompareAlignment, setBlinkIntervalMs, getCompareDiffSummary, and exportCompareDiffsJSON");
    assert(ribSrc.includes('id="rib-reset-align"') && ribSrc.includes('id="rib-blink-speed"') && ribSrc.includes('id="rib-export-json"'),
      "ui_ribbon.js Compare ribbon must expose Reset Align, Blink Speed, and Diffs JSON export controls");

    // 3. DXF Studio drafting-aid bug fix & new options (live functional tests!)
    assert(dsSrc.includes("StudioState.osnapEnabled") && dsSrc.includes("#dxf-aid-osnap") &&
           dsSrc.includes("StudioState.orthoEnabled") && dsSrc.includes("#dxf-aid-ortho") &&
           !dsSrc.includes("#dxf-st-snap") && !dsSrc.includes("#dxf-st-ortho"),
      "dxf_studio.js executeCommandLine must bind to real StudioState.*Enabled and #dxf-aid-* controls");
    assert(dsSrc.includes('id="dxf-lay-iso"') && dsSrc.includes('id="dxf-lay-uniso"') &&
           dsSrc.includes('id="dxf-st-qselect"') && dsSrc.includes('id="dxf-st-find-text"') && dsSrc.includes('id="dxf-st-bom-csv"'),
      "dxf_studio.js Layers ribbon must expose Isolate, Unisolate, QSelect, Find Text, and BOM CSV buttons");

    // Live test findAndReplaceDXFText & exportDXFBOMCSV
    const mockDxfParser = {
      unitName: "mm",
      layers: { "0": {}, "NOTES": {} },
      entities: [
        { _id: 1, type: "LINE", layer: "0", x1: 0, y1: 0, x2: 100, y2: 0 },
        { _id: 2, type: "INSERT", layer: "0", blockName: "BOLT_M6", x: 10, y: 10 },
        { _id: 3, type: "INSERT", layer: "0", blockName: "BOLT_M6", x: 50, y: 10 },
        { _id: 4, type: "TEXT", layer: "NOTES", x: 5, y: 5, text: "REV A BRACKET" }
      ]
    };
    const fr = DXFStudio.findAndReplaceDXFText("REV A", "REV B", mockDxfParser);
    assert.strictEqual(fr.matched, 1, "findAndReplaceDXFText must match 1 TEXT entity");
    assert.strictEqual(fr.replaced, 1, "findAndReplaceDXFText must replace 1 TEXT entity");
    assert.strictEqual(mockDxfParser.entities[3].text, "REV B BRACKET", "findAndReplaceDXFText must update entity text cleanly");

    const bomCsv = await DXFStudio.exportDXFBOMCSV(false, mockDxfParser);
    assert(bomCsv.includes('BLOCK,"BOLT_M6",2,0') && bomCsv.includes('LAYER_LENGTH,"0",1,100.000'),
      "exportDXFBOMCSV must aggregate block counts (BOLT_M6=2) and exact layer cut lengths (100.000 mm)");
  });


  // ============================================================================
  // SUITE 38: High-Contrast Color System, Visible DXF Measurement Data & Color-Only DXF Compare
  // ============================================================================
  await testAsync("SUITE 38: Chromatic/Achromatic Contrast Guard, Visible DIMENSION Measurement Text & High-Contrast Color-Only DXF Compare", async () => {
    const engSrc = fs.readFileSync(path.join(ROOT_DIR, "dxf_engine.js"), "utf8");
    const stSrc = fs.readFileSync(path.join(ROOT_DIR, "dxf_studio.js"), "utf8");
    const appSrc = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");

    // 1. Verify WCAG chromatic + achromatic contrastAdjustHex fixes invisible yellow/dark-blue text
    const adjYellowOnWhite = DXFEngine.contrastAdjustHex("#ffff00", false);
    const tcY = DXFEngine.hexToTrueColor(adjYellowOnWhite);
    const lumY = 0.2126 * ((tcY >> 16) & 255) + 0.7152 * ((tcY >> 8) & 255) + 0.0722 * (tcY & 255);
    assert(lumY < 170, "Yellow (#ffff00) on white paper must darken to high-contrast readable color (got " + adjYellowOnWhite + ")");

    const adjNavyOnDark = DXFEngine.contrastAdjustHex("#000080", true);
    const tcN = DXFEngine.hexToTrueColor(adjNavyOnDark);
    const lumN = 0.2126 * ((tcN >> 16) & 255) + 0.7152 * ((tcN >> 8) & 255) + 0.0722 * (tcN & 255);
    assert(lumN > 100, "Dark navy (#000080) on dark background must lift to high-contrast readable color (got " + adjNavyOnDark + ")");
    assert.strictEqual(DXFEngine.contrastAdjustHex("#ffffff", false), "#0f172a", "White on white must invert to deep ink");
    assert.strictEqual(DXFEngine.contrastAdjustHex("#000000", true), "#f8fafc", "Black on dark must invert to crisp white");

    // 2. Verify resolveDimensionLabel handles <>, measurement values, and geometric distance fallback
    assert.strictEqual(DXFEngine.resolveDimensionLabel({ text: "<>", measurement: 25.4 }), "25.4", "resolveDimensionLabel must substitute <> with measurement");
    assert.strictEqual(DXFEngine.resolveDimensionLabel({ text: "DIA <> mm", measurement: 12.5 }), "DIA 12.5 mm", "resolveDimensionLabel must preserve prefix/suffix around <>");
    assert.strictEqual(DXFEngine.resolveDimensionLabel({ text: "", x1: 0, y1: 0, x2: 30, y2: 40 }), "50", "resolveDimensionLabel must compute geometric distance fallback when code42Val is absent");

    // 3. Verify High-Contrast Neon Red vs Electric Cyan/Blue (never white Rev B) & Color-Only DXF Compare (no clutter boxes)
    assert(engSrc.includes("#ff2a4b") && engSrc.includes("#00f0ff") && engSrc.includes("#0066ff") && engSrc.includes("ctx.shadowColor = col;"),
      "dxf_engine.js renderNativeDXFComparison must use high-contrast Neon Red vs Electric Cyan/Blue with luminous halo");
    assert(stSrc.includes("#ff2a4b") && stSrc.includes("#00f0ff") && stSrc.includes("#0066ff") && stSrc.includes("if (!inDimBlock && /^defpoints$/i.test(effLayer)) return;"),
      "dxf_studio.js must use Light/Dark adaptive high-contrast compare colors and never drop *D dimension block text");
    assert(appSrc.includes("if (r.isNativeDXF && !sel) return;"),
      "app.js Native DXF Compare must use color-only high-contrast highlighting without cluttering diff boxes");
  });


  // ============================================================================
  // SUITE 39: Native Vector DXF Compare (MTEXT/*D/INSERT/TOLERANCE Extraction,
  //           Changed Measurement old -> new Diff & Crisp 800% Vector Zoom)
  // ============================================================================
  await testAsync("SUITE 39: MTEXT & *D-Block Dimension Extraction, Changed Dimension old->new Diff & Crisp 800% Native Vector Zoom", async () => {
    const proSrc = fs.readFileSync(path.join(ROOT_DIR, "pro.js"), "utf8");
    const ribSrc = fs.readFileSync(path.join(ROOT_DIR, "ui_ribbon.js"), "utf8");
    const appSrc = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");

    // 1. Test MTEXT, TOLERANCE, INSERT block, and Defpoints *D-block DIMENSION extraction
    const dxfRich = [
      "0","SECTION","2","BLOCKS",
      "0","BLOCK","8","0","2","*D1","10","0","20","0",
      "0","LINE","8","0","10","0","20","10","11","25","21","10",
      "0","MTEXT","8","0","10","12.5","20","12","40","2.5","1","%%c25.00 %%p0.05",
      "0","ENDBLK",
      "0","BLOCK","8","0","2","TITLE_BLK","10","0","20","0",
      "0","TEXT","8","0","10","5","20","5","40","3.0","1","REV A",
      "0","ENDBLK",
      "0","ENDSEC",
      "0","SECTION","2","ENTITIES",
      "0","MTEXT","8","NOTES","10","10","20","50","40","3.0","1","PLATE THK 6.00\\P%%c12.5",
      "0","TOLERANCE","8","GDT","10","40","20","50","40","2.5","1","{\\Fgdt;j}%%v%%c0.05%%vA",
      "0","DIMENSION","8","Defpoints","2","*D1","10","25","20","10","11","12.5","21","12","13","0","23","0","14","25","24","0","42","25.0","1","<>",
      "0","INSERT","8","0","2","TITLE_BLK","10","100","20","100",
      "0","ENDSEC","0","EOF"
    ].join("\n");
    const parsedRich = new DXFEngine.DXFParser(dxfRich).parse();
    const extracted = DXFEngine.extractAllDXFTextItems(parsedRich, {
      hiddenLayers: new Set(["Defpoints"]),
      includeDimValues: true
    });
    const strs = extracted.map(it => it.str);
    assert(strs.some(t => t.includes("PLATE THK 6.00")), "extractAllDXFTextItems must extract MTEXT");
    assert(strs.some(t => t.includes("⌀25.00 ±0.05")), "extractAllDXFTextItems must extract *D-block DIMENSION value even when layer is Defpoints");
    assert(strs.some(t => t.includes("⌀0.05") && t.includes("|")), "extractAllDXFTextItems must extract TOLERANCE GD&T frame text");
    assert(strs.some(t => t === "REV A"), "extractAllDXFTextItems must extract TEXT inside INSERT blocks");

    // 2. Test changed DIMENSION value showing as old -> new diff
    const makeDimDxf = (valStr, measNum) => [
      "0","SECTION","2","BLOCKS",
      "0","BLOCK","8","0","2","*D1","10","0","20","0",
      "0","LINE","8","0","10","0","20","10","11","25","21","10",
      "0","MTEXT","8","0","10","12.5","20","12","40","2.5","1",valStr,
      "0","ENDBLK",
      "0","ENDSEC",
      "0","SECTION","2","ENTITIES",
      "0","LINE","8","0","10","0","20","0","11","100","21","0",
      "0","DIMENSION","8","Defpoints","2","*D1","10","25","20","10","11","12.5","21","12","13","0","23","0","14","25","24","0","42",String(measNum),"1","<>",
      "0","ENDSEC","0","EOF"
    ].join("\n");
    const pDimA = new DXFEngine.DXFParser(makeDimDxf("25.00", 25.0)).parse();
    const pDimB = new DXFEngine.DXFParser(makeDimDxf("25.50", 25.5)).parse();
    const dimDiff = DXFEngine.compareDXFEntities(pDimA, pDimB, { tol: 0.005 });
    assert(Array.isArray(dimDiff.pairedMeasurementDiffs) && dimDiff.pairedMeasurementDiffs.length === 1,
      "compareDXFEntities must pair changed DIMENSION measurement values");
    assert.strictEqual(dimDiff.pairedMeasurementDiffs[0].label, "25.00 → 25.50",
      "Changed dimension must report old → new (25.00 → 25.50)");
    const desc = DXFEngine.describeDXFEntity(dimDiff.pairedMeasurementDiffs[0].entB, pDimB);
    assert(desc.includes("25.00") && desc.includes("25.50") && desc.includes("→"),
      "describeDXFEntity must display old → new measurement diff");

    // 3. Test 800% Native Vector Zoom stays crisp (true 8x*dpr vector scale + Defpoints value drawn + offscreen frustum culling)
    let strokeCalls = 0, textCalls = [];
    const mockCtx = {
      save() {}, restore() {}, beginPath() {}, closePath() {},
      moveTo() {}, lineTo() {}, arc() {}, rect() {}, clip() {},
      stroke() { strokeCalls++; }, fill() {}, fillRect() {}, strokeRect() {},
      setLineDash() {}, translate() {}, rotate() {}, scale() {},
      measureText(t) { return { width: String(t || "").length * 8 }; },
      fillText(t) { textCalls.push(String(t || "")); }
    };
    const mockCv = { width: 1600, height: 1200, getContext: () => mockCtx };
    const r100 = DXFEngine.renderNativeDXFComparison(mockCv, pDimA, pDimB, dimDiff, {
      viewportMode: true, viewK: 1.0, viewX: 0, viewY: 0, dpr: 2,
      baseCanvasW: 2200, baseCanvasH: 1600, mode: "over", showDiffBoxes: false, showGrid: false
    });
    strokeCalls = 0; textCalls = [];
    const dimBaseX = r100.offsetX + (12.5 - r100.sharedBounds.minX) * (r100.scale / 2);
    const dimBaseY = 1600 - (r100.offsetY + (12 - r100.sharedBounds.minY) * (r100.scale / 2));
    const r800 = DXFEngine.renderNativeDXFComparison(mockCv, pDimA, pDimB, dimDiff, {
      viewportMode: true, viewK: 8.0, viewX: 400 - dimBaseX * 8.0, viewY: 300 - dimBaseY * 8.0, dpr: 2,
      baseCanvasW: 2200, baseCanvasH: 1600, mode: "over", showDiffBoxes: false, showGrid: false
    });
    assert(Math.abs((r800.scale / r100.scale) - 8.0) < 1e-6,
      "At 800% zoom (viewK=8.0), renderNativeDXFComparison must scale native vector coordinates by exact 8.0x (no blurry bitmap upscaling)");
    assert(textCalls.some(t => t.includes("25.50") || t.includes("25.00")),
      "Defpoints DIMENSION measurement value must still be drawn crisply at 800% zoom");

    // 4. Verify wiring in pro.js, ui_ribbon.js, and app.js (without altering PDF/Gerber compare)
    assert(proSrc.includes("DXFEngine.renderNativeDXFComparison(hq, ds.parsedA, ds.parsedB") && proSrc.includes("viewportMode: true"),
      "pro.js sharpen() must route DXF vs DXF Compare through crisp native vector renderNativeDXFComparison");
    assert(ribSrc.includes("DXFEngine.extractAllDXFTextItems(parser"),
      "ui_ribbon.js DXF shim getTextContent must use DXFEngine.extractAllDXFTextItems");
    assert(appSrc.includes("diff.pairedMeasurementDiffs"),
      "app.js Compare defect list must surface pairedMeasurementDiffs as old → new");
  });


  // ============================================================================
  // SUITE 40: Native Electron Splash Screen (build/logo.png) & Version 1.2.3 Sync
  // ============================================================================
  await testAsync("SUITE 40: Native Splash Screen with Application Logo & Version 1.2.3 Synchronization", async () => {
    const splashPath = path.join(ROOT_DIR, "splash.html");
    assert(fs.existsSync(splashPath), "splash.html must exist at project root");
    const splashHtml = fs.readFileSync(splashPath, "utf8");
    const mainSrc = fs.readFileSync(path.join(ROOT_DIR, "main.js"), "utf8");
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
    const ver = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "version.json"), "utf8"));
    assert(fs.existsSync(path.join(ROOT_DIR, "build", "logo.png")), "build/logo.png must exist for splash screen");
    assert(splashHtml.includes("build/logo.png") && splashHtml.includes("v1.2.3") && splashHtml.includes("Version 1.2.3"),
      "splash.html must render the application logo (build/logo.png) and display version 1.2.3");
    assert(mainSrc.includes("splash.html") && mainSrc.includes("closeSplashSafely"),
      "main.js must launch splash.html on startup and close it cleanly on ready-to-show");
    assert.strictEqual(pkg.version, "1.2.3", "package.json version must be 1.2.3");
    assert.strictEqual(ver.version, "1.2.3", "version.json version must be 1.2.3");
    assert(pkg.build.files.includes("splash.html") && pkg.build.files.includes("build/logo.png"),
      "package.json build.files must bundle splash.html and build/logo.png");
  });


  // ============================================================================
  // SUITE 41: CAM Gerber Trace-Bend Unwanted Circle Fix & Always-On Live AutoCAD DXF Compare
  // ============================================================================
  await testAsync("SUITE 41: CAM G74/G75 Trace-Bend Arc Resolver (Zero Unwanted Circles) & Always-On Live AutoCAD DXF Vector Compare", async () => {
    const CAMEngine = require(path.join(ROOT_DIR, "cam_engine.js"));
    const proSrc = fs.readFileSync(path.join(ROOT_DIR, "pro.js"), "utf8");
    const appSrc = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");

    // 1. G74 Single-Quadrant 90° trace bend MUST choose center (0,0) with sweep=pi/2, NEVER reflex 270° circle at (1,1)!
    const g74Bend = CAMEngine.resolveGerberArc(1, 0, 0, 1, 1, 0, "G03", "SINGLE");
    assert(Math.abs(g74Bend.cx - 0) < 1e-6 && Math.abs(g74Bend.cy - 0) < 1e-6,
      "G74 single-quadrant G03 bend must pick true center (0,0), not reflex center (1,1)");
    assert(Math.abs(g74Bend.sweep - Math.PI / 2) < 1e-4 && !g74Bend.isFullCircle && !g74Bend.isChordFallback,
      "G74 single-quadrant bend must have exact 90° sweep without drawing an unwanted 270° circle");

    // 2. G74 zero-length arc MUST NOT draw a 360° full circle
    const g74Zero = CAMEngine.resolveGerberArc(5, 5, 5, 5, 1, 0, "G02", "SINGLE");
    assert.strictEqual(g74Zero.isFullCircle, false, "G74 start==end must never draw a 360° full circle");
    assert.strictEqual(g74Zero.isZeroLength, true, "G74 start==end must be flagged as zero-length");

    // 3. G75 microscopic trace-bend fillet with floating-point sign flip (sweep ~ 359.9°) MUST fall back to short chord, NEVER a 359.9° circle!
    const g75Glitch = CAMEngine.resolveGerberArc(1, 0, 1, -0.001, -1, 0, "G03", "MULTI");
    assert.strictEqual(g75Glitch.isChordFallback, true, "G75 microscopic reflex wrap-around must fall back to short chord");
    assert.strictEqual(g75Glitch.isFullCircle, false, "G75 microscopic reflex wrap-around must not draw a full circle");

    // 4. Genuine G75 full 360° circle (start === end, rad > 0) MUST still work
    const g75Full = CAMEngine.resolveGerberArc(1, 0, 1, 0, -1, 0, "G03", "MULTI");
    assert.strictEqual(g75Full.isFullCircle, true, "Genuine G75 start==end full circle must remain intact");

    // 5. Verify Always-On Live AutoCAD DXF Vector Compare (never hidden at fit-to-screen zoomLow, never blurry #lv mipmap)
    assert(proSrc.includes("const isNativeDXFActive =") && proSrc.includes("if (!isNativeDXFActive)"),
      "pro.js kick() must keep native AutoCAD DXF vector #hq visible at fit-to-screen and all zoom levels");
    assert(appSrc.includes("const isNativeDxfView =") && appSrc.includes("if (S.cur && S.cur.isNativeDXF && typeof window.rpSharpen === \x27function\x27) window.rpSharpen();"),
      "app.js must bypass blurry #lv mipmap for Native DXF Compare and trigger crisp vector render on fit()");
  });


  // ============================================================================
  // SUITE 42: CAD Studio & SolidWorks 3D / STEP (AP203/AP214/AP242), STL, OBJ Support
  // ============================================================================
  await testAsync("SUITE 42: Native STEP B-Rep Parser, STL/OBJ, Mass Properties, STEP->DXF Projection, 3D Compare & SolidWorks Workspace", async () => {
    const CAD3D = require(path.join(ROOT_DIR, "cad3d_engine.js"));
    const SWStudio = require(path.join(ROOT_DIR, "solidworks_studio.js"));
    const htmlSrc = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");
    const mainSrc = fs.readFileSync(path.join(ROOT_DIR, "main.js"), "utf8");
    const preloadSrc = fs.readFileSync(path.join(ROOT_DIR, "preload.js"), "utf8");
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));

    // 1. Native STEP AP214 parsing, exact volume/mass & bore detection
    const mA = CAD3D.parse3DCAD(CAD3D.generateSampleSTEP("A"), "Bracket_RevA.step");
    const mB = CAD3D.parse3DCAD(CAD3D.generateSampleSTEP("B"), "Bracket_RevB.step");
    assert(Math.abs(mA.stats.sizeX - 100) < 1e-3 && Math.abs(mA.stats.sizeY - 60) < 1e-3 && Math.abs(mA.stats.sizeZ - 20) < 1e-3,
      "STEPParser must compute exact 100x60x20 mm bounding box");
    assert(Math.abs(mA.stats.volumeCm3 - 120.0) < 0.5, "STEPParser must compute exact 120.0 cm3 volume");
    assert(Math.abs(CAD3D.calculateMassGrams(mA.stats.volumeCm3, "Aluminum 6061-T6") - 324.0) < 1.5,
      "calculateMassGrams must compute 324.0g for Aluminum 6061-T6");
    assert(mA.holes.length === 1 && Math.abs(mA.holes[0].diameter - 16.0) < 1e-3,
      "STEPParser must extract circular bore diameter (16.0 mm)");

    // 2. STEP -> 2D Orthographic DXF Projection round-trip
    const dxf2d = CAD3D.project3DToDXF(mA, "top");
    const parsedProj = new DXFEngine.DXFParser(dxf2d).parse();
    assert(parsedProj.entities.length >= 20, "project3DToDXF must emit valid 2D DXF lines parseable by DXFEngine");

    // 3. 3D STEP vs STEP Revision Compare
    const d3 = CAD3D.compare3DModels(mA, mB);
    assert(Math.abs(d3.deltaSizeX - 10.0) < 1e-3 && d3.removedCount > 0 && d3.addedCount > 0,
      "compare3DModels must detect +10mm X growth and changed 3D edges between Rev A and Rev B");

    // 4. STL & OBJ parsing + SolidWorks OLE probe
    const stlModel = CAD3D.parseSTL("solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid t", "tri.stl");
    assert.strictEqual(stlModel.bodies[0].triangles.length, 1, "parseSTL must parse ASCII STL triangles");
    const objModel = CAD3D.parseOBJ("v 0 0 0\nv 10 0 0\nv 0 10 0\nf 1 2 3\n", "tri.obj");
    assert.strictEqual(objModel.bodies[0].triangles.length, 1, "parseOBJ must parse OBJ faces");
    const swMeta = CAD3D.inspectSolidWorksMetadata(new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]), "housing.sldprt");
    assert.strictEqual(swMeta.isOLECompound, true, "inspectSolidWorksMetadata must recognize OLE2 SolidWorks header");
    assert.strictEqual(swMeta.docType, "SolidWorks Part");

    // 5. CAD Studio & SolidWorks UI / IPC / Packaging verification
    assert(typeof SWStudio.mountSolidWorksUI === "function" && typeof SWStudio.make2DDrawingInCADStudio === "function",
      "SolidWorksStudio must export mountSolidWorksUI and make2DDrawingInCADStudio");
    assert(htmlSrc.includes("<span>CAD Studio</span>") && htmlSrc.includes("id=\"nav-solidworks\"") && htmlSrc.includes("id=\"sw-studio-host\""),
      "index.html must expose CAD Studio tab, SolidWorks nav option, and #sw-studio-host container");
    assert(mainSrc.includes("convert-solidworks-to-step") && preloadSrc.includes("convertSolidWorksToStep"),
      "main.js and preload.js must expose offline convert-solidworks-to-step IPC bridge");
    assert(pkg.build.files.includes("cad3d_engine.js") && pkg.build.files.includes("solidworks_studio.js"),
      "package.json build.files must bundle cad3d_engine.js and solidworks_studio.js");
  });


  // ============================================================================
  // SUITE 43: Native SolidWorks Parametric CAD Backend (cad_kernel.js) End-to-End
  // ============================================================================
  await testAsync("SUITE 43: Parametric Feature-History Backend (Extrude/Cut/Revolve/HoleWizard/Fillet/Shell/Pattern/Mirror, Mates, Interference, STEP/STL/4-View DXF & .kensho3d)", async () => {
    const K = require(path.join(ROOT_DIR, "cad_kernel.js"));
    const CAD3D = require(path.join(ROOT_DIR, "cad3d_engine.js"));
    const swSrc = fs.readFileSync(path.join(ROOT_DIR, "solidworks_studio.js"), "utf8");
    const htmlSrc = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));

    // 1. Parametric part creation, suppress/unsuppress rebuild & exact volume/CoM update
    const doc = K.createSampleParametricPart();
    const volWithCut = doc.stats.volumeCm3;
    assert(doc.holes.length === 5 && volWithCut > 50 && doc.stats.centerOfMass.length === 3,
      "Sample parametric part must build 5 holes, positive net volume, and 3D Center of Mass");
    const cutFeat = doc.features.find(f => f.type === "EXTRUDE_CUT");
    doc.toggleSuppress(cutFeat.id);
    assert(doc.stats.volumeCm3 > volWithCut + 2.0,
      "Suppressing EXTRUDE_CUT must dynamically increase rebuilt solid volume");
    doc.toggleSuppress(cutFeat.id);
    assert(Math.abs(doc.stats.volumeCm3 - volWithCut) < 1e-3,
      "Unsuppressing EXTRUDE_CUT must restore exact parametric volume");

    // 2. Revolve, Shell, Linear Pattern, Circular Pattern & Mirror
    const doc2 = new K.CADDocument("Shaft_Assembly");
    doc2.addFeature({ type: "REVOLVE_BOSS", name: "Stepped_Shaft", params: { angleDeg: 360, axis: "z" } });
    doc2.addFeature({ type: "LINEAR_PATTERN", name: "Pattern_2x", params: { countX: 2, countY: 1, spacingX: 70 } });
    doc2.addFeature({ type: "MIRROR_BODY", name: "Mirror_X", params: { mirrorPlane: "right" } });
    assert(doc2.bodies.length === 3, "Revolve + Linear Pattern (2x) + Mirror must generate 3 solid bodies");

    // 3. Assembly Mates & Interference Detection
    const asmDoc = new K.CADDocument("Mate_Test");
    asmDoc.addFeature({ type: "EXTRUDE_BOSS", name: "BlockA", params: { kind: "center_rect", width: 40, height: 40, depth: 20, offset: 0 } });
    asmDoc.addFeature({ type: "EXTRUDE_BOSS", name: "BlockB", params: { kind: "center_rect", width: 40, height: 40, depth: 20, offset: 5 } });
    assert(asmDoc.interferences.length === 1, "Overlapping blocks must trigger interference detection");
    asmDoc.addMate({ type: "COINCIDENT", bodyA: "BlockA", bodyB: "BlockB" });
    assert.strictEqual(asmDoc.interferences.length, 0, "COINCIDENT mate must stack BlockB flush onto BlockA with zero interference");

    // 4. Native STEP AP214, Binary STL, OBJ, 4-View 2D DXF Drawing & .kensho3d Round-Trips
    const stepStr = K.exportToSTEP(doc);
    const reStep = CAD3D.parse3DCAD(stepStr, "out.step");
    assert(reStep.bodies.length >= 2 && reStep.stats.totalFaces >= 100, "STEP AP214 export must round-trip cleanly");

    const stlU8 = K.exportToBinarySTL(doc);
    const reStl = CAD3D.parseSTL(stlU8, "out.stl");
    assert(reStl.bodies[0].triangles.length >= 100, "Binary STL export must round-trip cleanly");

    const objStr = K.exportToOBJ(doc);
    assert(objStr.includes("v ") && objStr.includes("f "), "OBJ export must emit valid vertices and faces");

    const dxf4 = K.exportMultiViewDrawingDXF(doc);
    const pDxf4 = new DXFEngine.DXFParser(dxf4).parse();
    assert(pDxf4.entities.length >= 100 && dxf4.includes("FRONT VIEW") && dxf4.includes("TITLE_BLOCK"),
      "exportMultiViewDrawingDXF must generate 4-view drawing sheet with title block parseable by DXFEngine");

    const k3dJson = doc.serialize();
    const docReloaded = K.CADDocument.deserialize(k3dJson);
    assert.strictEqual(docReloaded.features.length, doc.features.length, ".kensho3d round-trip must preserve full feature tree");
    assert(Math.abs(docReloaded.stats.volumeCm3 - doc.stats.volumeCm3) < 1e-3, ".kensho3d rebuild must match exact volume");

    // 5. UI & Packaging checks
    assert(swSrc.includes("id=\"sw-feat-boss\"") && swSrc.includes("id=\"sw-feat-hole\"") && swSrc.includes("id=\"sw-exp-step\"") && swSrc.includes("id=\"sw-save-k3d\""),
      "solidworks_studio.js must expose CommandManager feature & export buttons");
    assert(htmlSrc.includes("cad_kernel.js") && pkg.build.files.includes("cad_kernel.js"),
      "index.html and package.json must load and bundle cad_kernel.js");
  });


  // ============================================================================
  // SUITE 44: CAD Studio New Options (2D Bolt Circle & Title Block + 3D Measure, Mate, Circ Pattern, OBJ, 3D PNG)
  // ============================================================================
  await testAsync("SUITE 44: 2D CAD Bolt-Circle & Title Block + 3D SolidWorks Measure, Mate, Circular Pattern, OBJ & 3D PNG", async () => {
    const DXFStudio = require(path.join(ROOT_DIR, "dxf_studio.js"));
    const SWStudio = require(path.join(ROOT_DIR, "solidworks_studio.js"));
    const swSrc = fs.readFileSync(path.join(ROOT_DIR, "solidworks_studio.js"), "utf8");
    const dsSrc = fs.readFileSync(path.join(ROOT_DIR, "dxf_studio.js"), "utf8");

    // 1. 2D CAD Bolt-Circle & Mechanical Title Block functional verification
    const mockP = { entities: [], unitName: "mm", bounds: { minX: -40, minY: -40, maxX: 40, maxY: 40 }, computeBounds() {} };
    const addedBc = DXFStudio.generateBoltCirclePattern(0, 0, 60, 6, 6.6, 0, mockP);
    assert.strictEqual(addedBc, 7, "generateBoltCirclePattern(6 holes) must add 1 CENTER pitch circle + 6 hole circles");
    assert(mockP.entities.some(e => e.type === "CIRCLE" && e.linetype === "CENTER" && Math.abs(e.r - 30) < 1e-6),
      "Bolt circle must include CENTER pitch circle of radius PCD/2");

    const okTb = DXFStudio.insertMechanicalTitleBlock("TEST PART REV C", mockP);
    assert.strictEqual(okTb, true, "insertMechanicalTitleBlock must succeed");
    assert(mockP.entities.some(e => e.type === "TEXT" && e.layer === "TITLE_BLOCK" && e.text === "TEST PART REV C"),
      "Title block must insert labeled TITLE_BLOCK text entity");

    // 2. 3D SolidWorks Studio new options & ribbon controls
    assert(typeof SWStudio.toggle3DMeasureMode === "function" && typeof SWStudio.applyQuickMate === "function" && typeof SWStudio.export3DSnapshotPNG === "function",
      "SolidWorksStudio must export toggle3DMeasureMode, applyQuickMate, and export3DSnapshotPNG");
    assert(swSrc.includes("id=\"sw-feat-cpattern\"") && swSrc.includes("id=\"sw-mate-btn\"") && swSrc.includes("id=\"sw-measure-btn\"") &&
           swSrc.includes("id=\"sw-toggle-com\"") && swSrc.includes("id=\"sw-toggle-planes\"") && swSrc.includes("id=\"sw-toggle-bg\"") &&
           swSrc.includes("id=\"sw-exp-obj\"") && swSrc.includes("id=\"sw-snap-png\""),
      "SolidWorks ribbon must expose Circ Pattern, Mate, 3D Measure, CoM, Axes, Backdrop, Export OBJ, and 3D PNG");
    assert(dsSrc.includes("id=\"dxf-st-boltcircle\"") && dsSrc.includes("id=\"dxf-st-titleblock\"") && dsSrc.includes("BOLTCIRCLE"),
      "2D CAD Studio must expose Bolt Circle and Title Block buttons and CLI commands");
  });


  // ============================================================================
  // SUITE 45: Full Bug Sweep Verification (3D Drag-Drop, pick-folder, Stale Doc Reset, Resize & .kensho3d Picker)
  // ============================================================================
  await testAsync("SUITE 45: Bug Sweep — 3D Drag-and-Drop Routing, Stale Parametric Doc Reset, Resize Redraw & .kensho3d File Picker", async () => {
    const appSrc = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
    const mainSrc = fs.readFileSync(path.join(ROOT_DIR, "main.js"), "utf8");
    const swSrc = fs.readFileSync(path.join(ROOT_DIR, "solidworks_studio.js"), "utf8");
    const dsSrc = fs.readFileSync(path.join(ROOT_DIR, "dxf_studio.js"), "utf8");

    assert(appSrc.includes("const cad3dDropped =") && appSrc.includes("openSolidWorks3DFile(cad3dDropped[0]"),
      "app.js drag-and-drop must route dropped .step/.stp/.sldprt/.stl/.obj/.kensho3d files to SolidWorks 3D Studio");
    assert(mainSrc.includes("step|stp|sldprt|sldasm|slddrw|stl|obj|kensho3d"),
      "main.js pick-folder and CLI must include all 3D CAD and .kensho3d extensions");
    assert(swSrc.includes("SWState.doc = null;") && swSrc.includes("SWState._resizeBound") && swSrc.includes("addEventListener(\x27drop\x27") && swSrc.includes("\x27kensho3d\x27"),
      "solidworks_studio.js must clear stale SWState.doc on STEP/sample load, support .kensho3d picker, handle canvas drop, and redraw on window resize");
    assert(!dsSrc.includes("nextEntityId("),
      "dxf_studio.js must have zero undefined nextEntityId() calls");
  });

  console.log(`SUMMARY: ${passedTests} / ${totalTests} tests passed successfully.`);
  console.log('====================================================');
  if (passedTests === totalTests) {
    console.log('ALL V1.0 ENTERPRISE MODULES VERIFIED 100% OPERATIONAL!');
  } else {
    process.exit(1);
  }
})();
