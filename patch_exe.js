const fs = require('fs'), R = require('resedit');
const exePath = process.argv[2], icoPath = process.argv[3];
if (!exePath || !fs.existsSync(exePath)) {
  console.warn('[patch_exe] Target executable not found, skipping:', exePath);
  process.exit(0);
}
const exe = R.NtExecutable.from(fs.readFileSync(exePath)), res = R.NtExecutableResource.from(exe);
if (icoPath && fs.existsSync(icoPath)) {
  const ico = R.Data.IconFile.from(fs.readFileSync(icoPath));
  const groups = R.Resource.IconGroupEntry.fromEntries(res.entries);
  if (groups && groups[0]) {
    const g = groups[0];
    R.Resource.IconGroupEntry.replaceIconsForResource(res.entries, g.id, g.lang, ico.icons.map(i => i.data));
  }
}
const viList = R.Resource.VersionInfo.fromEntries(res.entries);
if (viList && viList[0]) {
  const vi = viList[0], lang = vi.lang && vi.lang[0] ? vi.lang[0] : { lang: 1033, codepage: 1200 };
  vi.setStringValues(lang, {
    ProductName: 'Kensho Pro',
    FileDescription: 'Kensho Pro - Engineering Review, CAD/CAM & PDF Studio',
    CompanyName: 'Kensho Studio',
    LegalCopyright: 'Kensho Studio - textportdocx.in',
    InternalName: 'KenshoPro',
    OriginalFilename: 'Kensho Pro.exe',
    ProductVersion: '1.1.0',
    FileVersion: '1.1.0'
  });
  vi.outputToResourceEntries(res.entries);
}
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log('patched', exePath);
