const fs = require('fs');

async function loadResEdit() {
  try {
    const mod = require('resedit');
    if (mod && mod.NtExecutable) return mod;
  } catch (_) {}
  try {
    const cjs = require('resedit/cjs');
    if (cjs && typeof cjs.load === 'function') return await cjs.load();
    if (cjs && cjs.NtExecutable) return cjs;
  } catch (_) {}
  const esm = await import('resedit');
  return esm && esm.default && esm.default.NtExecutable ? esm.default : esm;
}

(async () => {
  const exePath = process.argv[2], icoPath = process.argv[3];
  if (!exePath || !fs.existsSync(exePath)) {
    console.warn('[patch_exe] Target executable not found, skipping:', exePath);
    process.exit(0);
  }
  const R = await loadResEdit();
  const exe = R.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = R.NtExecutableResource.from(exe);
  if (icoPath && fs.existsSync(icoPath)) {
    const ico = R.Data.IconFile.from(fs.readFileSync(icoPath));
    const groups = R.Resource.IconGroupEntry.fromEntries(res.entries);
    if (groups && groups[0]) {
      const g = groups[0];
      R.Resource.IconGroupEntry.replaceIconsForResource(res.entries, g.id, g.lang, ico.icons.map(i => i.data));
    }
  }
  const pkg = require('./package.json');
  const displayVer = pkg.displayVersion || pkg.version || '1.2.3.2';
  const buildVer = pkg.buildVersion || 'O1R0A7N5G0E002026A1232';
  const viList = R.Resource.VersionInfo.fromEntries(res.entries);
  if (viList && viList[0]) {
    const vi = viList[0], lang = vi.lang && vi.lang[0] ? vi.lang[0] : { lang: 1033, codepage: 1200 };
    const parts = String(displayVer).split('.').map(n => parseInt(n, 10) || 0);
    while (parts.length < 4) parts.push(0);
    if (typeof vi.setFileVersion === 'function') vi.setFileVersion(parts[0], parts[1], parts[2], parts[3], lang.lang);
    if (typeof vi.setProductVersion === 'function') vi.setProductVersion(parts[0], parts[1], parts[2], parts[3], lang.lang);
    vi.setStringValues(lang, {
      ProductName: 'Kensho Pro',
      FileDescription: 'Kensho Pro - Engineering Review, CAD/CAM & PDF Studio',
      CompanyName: 'Kensho Studio',
      LegalCopyright: 'Kensho Studio - textportdocx.in',
      InternalName: 'KenshoPro',
      OriginalFilename: 'Kensho Pro.exe',
      ProductVersion: displayVer,
      FileVersion: displayVer,
      Comments: 'Build ' + buildVer
    });
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('patched', exePath, '-> v' + displayVer, '(' + buildVer + ')');
})().catch(err => {
  console.error('[patch_exe] ERROR:', err && err.stack ? err.stack : err);
  process.exit(1);
});
