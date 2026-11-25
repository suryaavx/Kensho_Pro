// ===== Kensho Pro 1.2.3.2 — Kensho Studio (textportdocx.in) =====
(function () {
  const $ = s => document.querySelector(s), DPR = () => window.devicePixelRatio || 1, S = window.CMP;
  const el = (t, a, h) => { const e = document.createElement(t); Object.assign(e, a || {}); if (h != null) e.innerHTML = h; return e; };
  const safeGet = (k, def = null) => { try { const v = localStorage.getItem(k); return v != null ? v : def; } catch (e) { return def; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const safeRemove = k => { try { localStorage.removeItem(k); } catch (e) {} };

  // In-App End-User License Agreement (EULA) & Zero-Telemetry Guarantee Modal
  const FULL_EULA_TEXT = 'KENSHO PRO - END-USER LICENSE AGREEMENT (EULA)\nVersion 1.2.3.2  |  Publisher: Kensho Studio  |  Website: textportdocx.in\n\nPLEASE READ THIS AGREEMENT BEFORE INSTALLING OR USING KENSHO PRO.\nBy clicking "I accept the terms of the License Agreement", "I Agree",\ninstalling, copying or using Kensho Pro (the "Software"), you agree to\nthis End-User License Agreement ("Agreement"). If you do not agree, do\nnot install or use the Software and delete any copy in your possession.\nIf you use the Software on behalf of an organization, you confirm that\nyou are authorized to accept this Agreement for it; "you" then includes\nthat organization.\n\n1. DEFINITIONS\n"Publisher", "we" or "us" means Kensho Studio. "Output" means reports,\nmarkups, comparisons, exports or other materials you create using the\nSoftware. "Third-Party Components" means software distributed with or used\nby the Software that is subject to a separate license.\n\n2. LICENSE GRANT AND COST\nSubject to this Agreement, the Publisher grants you a free, non-exclusive,\nworldwide, perpetual, royalty-free license to install and use the Software\non computers you own or control, for personal, educational and commercial\nengineering, CAD, CAM, architectural, and quality-assurance work. There\nare no license fees, subscriptions or account requirements for the license\ngranted here. This license is for use of the Software and does not transfer\nownership of the Software or its intellectual property to you.\n\n3. PERMITTED USE AND YOUR OUTPUT\n a) You may use the Software to view, compare, annotate, edit, convert and\n    review PDF documents, AutoCAD DXF drawings, PCB Gerber/Excellon/IPC CAM\n    layers, schematics and related files.\n b) You may use, share, publish and sell your Output. As between you and the\n    Publisher, you retain your rights in your Output. The Software does not\n    give you rights to third-party material in your source files or Output.\n c) You may share an unmodified official installer or portable copy without\n    charge, provided that you include this Agreement and do not suggest that\n    the copy is an official download or endorsed by the Publisher.\n\n4. RESTRICTIONS\nYou must not, and must not help another person to:\n a) sell, rent, lease, sublicense or charge for access to the Software itself;\n b) remove, obscure or alter the Software\'s name, branding, copyright or\n    other proprietary notices, or this Agreement;\n c) modify, adapt or redistribute the Software as an official Kensho Pro\n    release, or misrepresent the source or authenticity of a copy;\n d) reverse engineer, decompile or disassemble the Software, except to the\n    extent that applicable law does not allow this restriction;\n e) bypass or interfere with security, licensing or integrity features;\n f) use the Software in violation of applicable law or another person\'s\n    rights; or\n g) use the Software to introduce malware, disrupt systems or interfere with\n    another person\'s use of the Software.\n\n5. OWNERSHIP AND FEEDBACK\nThe Software, including its code, design, names, branding and documentation,\nis owned by the Publisher or its licensors and is protected by applicable\nintellectual-property laws. Except for the limited license in this\nAgreement, no rights are granted to you. If you choose to send suggestions\nor feedback, you allow the Publisher to use them without restriction or\npayment, but this does not grant rights to your files or Output.\n\n6. YOUR FILES, PRIVACY AND SECURITY\nThe Software is designed to process files 100% locally on your computer.\nIt does not upload your documents or include tracking or telemetry. Optional\nwebsite or other external links open only when you explicitly choose them;\nvisiting an external site may be subject to that site\'s own terms and\nprivacy practices. Your device, operating system or other software may\nseparately collect or transmit information.\n\nYou are responsible for the files you select, the permissions and rights\nneeded to use them, securing your device, and keeping appropriate backups.\nThe Publisher cannot restore files that are lost, damaged or overwritten.\nBefore saving over an original, make a separate copy if you need to preserve\nit.\n\n7. YOUR REVIEW AND USE OF RESULTS\nThe Software is an assistance tool, not a substitute for professional\njudgment or independent verification. Results can be incomplete or\ninaccurate because of source-file quality, scanning, scaling, alignment,\nfonts, settings or other conditions. You are responsible for reviewing\nresults and deciding whether they are suitable for your use.\n\nBefore approving, releasing, manufacturing, constructing or acting on\ntechnical material, a qualified person must independently verify all\ncritical dimensions, values, part numbers, revisions and changes against\nthe authoritative source documents. Do not rely solely on an automated\ncomparison for safety-critical, regulated or high-consequence decisions.\n\n8. COMPATIBILITY, AVAILABILITY AND SUPPORT\nThe Software may depend on your device, operating system and other software.\nYou are responsible for ensuring that your environment is suitable and for\nmaintaining it. The Publisher does not promise that the Software will work\nwith every device, file, format or future operating-system version, or that\nit will be continuously available, error-free or supported. No technical\nsupport or maintenance is included unless separately offered in writing.\n\n9. UPDATES AND TERMS\nThe Publisher may offer updates, corrections or new versions, but this\nAgreement does not require the Publisher to provide them. Updates may add,\nchange or remove features and may be subject to additional terms presented\nwith that update. This Agreement applies to the version of the Software\nwith which it is distributed. A revised Agreement applies to a later\nversion only if presented for that version; it does not retroactively\nchange the terms for a copy already licensed to you.\n\n10. THIRD-PARTY COMPONENTS\nThe Software includes or relies on Third-Party Components, which may include\nElectron, PDF.js and pdf-lib. Those components remain subject to their own\ncopyright notices and licenses. If a third-party license conflicts with\nthis Agreement as to that component, the third-party license controls for\nthat component. Nothing in this Agreement limits rights that a third-party\nlicense grants to you.\n\n11. DISCLAIMER OF WARRANTIES\nTO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SOFTWARE IS PROVIDED\n"AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,\nEXPRESS, IMPLIED OR STATUTORY, INCLUDING WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE, ACCURACY, TITLE AND NON-INFRINGEMENT. THE\nPUBLISHER DOES NOT WARRANT THAT DEFECTS WILL BE CORRECTED OR THAT THE\nSOFTWARE WILL MEET YOUR REQUIREMENTS. THIS SECTION DOES NOT EXCLUDE ANY\nWARRANTY OR RIGHT THAT CANNOT LAWFULLY BE EXCLUDED.\n\n12. LIMITATION OF LIABILITY\nTO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE PUBLISHER AND ITS\nLICENSORS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY OR\nCONSEQUENTIAL LOSS OR DAMAGE, OR FOR LOSS OF PROFITS, REVENUE, DATA,\nGOODWILL, PRODUCTION, BUSINESS OPPORTUNITY OR TIME, ARISING OUT OF OR\nRELATED TO THE SOFTWARE OR THIS AGREEMENT, EVEN IF ADVISED OF THE\nPOSSIBILITY OF SUCH LOSS.\n\nTO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE PUBLISHER\'S TOTAL\nLIABILITY FOR ALL CLAIMS RELATING TO THE SOFTWARE OR THIS AGREEMENT WILL\nNOT EXCEED THE AMOUNT YOU PAID, IF ANY, TO OBTAIN THE SOFTWARE. Because the\nSoftware is provided free of charge, this amount may be zero. Nothing in\nthis Agreement excludes or limits liability that cannot lawfully be\nexcluded or limited, including liability for fraud or intentional\nmisconduct where such limitation is prohibited.\n\n13. INDEMNITY FOR UNLAWFUL USE\nTo the extent permitted by applicable law, you are responsible for claims\narising from your unlawful use of the Software or your violation of another\nperson\'s rights. This section does not require you to indemnify the\nPublisher for the Publisher\'s own unlawful conduct or for liability that\ncannot lawfully be shifted to you.\n\n14. SUSPENSION AND TERMINATION\nYour license continues unless it ends under this section. It terminates\nautomatically if you materially breach this Agreement. Where the breach can\nbe remedied, the Publisher may give you notice and a reasonable opportunity\nto remedy it before termination. Upon termination, stop using the Software\nand delete the copies you control. Sections that by their nature should\ncontinue after termination, including ownership, disclaimers, limitations\nof liability and general terms, will survive.\n\n15. GOVERNING LAW AND GENERAL TERMS\nThis Agreement is governed by the laws of India, without regard to conflict\nof law principles, subject to any mandatory consumer protections and rights\nthat apply to you. Any dispute will be handled by a court or other forum\nwith jurisdiction under applicable law.\n\nThis Agreement is the entire agreement between you and the Publisher about\nthe Software and replaces prior agreements on that subject. If a provision\nis found unenforceable, it will be limited to the minimum extent necessary\nand the remaining provisions will continue in effect. A failure to enforce\na provision is not a waiver of the right to enforce it later. You may not\ntransfer this Agreement or your license except as permitted by applicable\nlaw. The Publisher may transfer its rights and obligations as part of a\nbusiness reorganization or transfer, provided this does not reduce your\nmandatory legal rights. This Agreement does not create an agency,\npartnership or employment relationship.\n\n16. MANDATORY RIGHTS\nNothing in this Agreement is intended to exclude, restrict or waive a\nconsumer protection, statutory guarantee or other right that applicable\nlaw does not permit you to waive. Where a term conflicts with such a right,\nthat term applies only to the extent permitted by law.\n\nCopyright (c) 2026 Kensho Studio - textportdocx.in. All rights reserved.';
  function showTerms() {
    const existing = document.getElementById('rp-license-modal');
    if (existing) existing.remove();
    const d = el('div', { id: 'rp-license-modal', className: 'rp-modal' }, `<div class="rp-card rp-wide"><h2>Kensho Pro — End-User License Agreement (EULA) &amp; Zero-Telemetry Guarantee</h2><p class="rp-sub">Kensho Pro 1.2.3.2 &middot; Kensho Studio &middot; textportdocx.in &middot; Free for Personal &amp; Commercial Use</p>
      <div class="rp-scroll" style="display:flex;flex-direction:column;gap:10px;max-height:62vh;overflow-y:auto">
        <div><b>1. Grant of License (100% Free Commercial &amp; Personal Use)</b><br>Kensho Studio grants you a perpetual, worldwide, royalty-free, non-exclusive license to install and use Kensho Pro 1.2.3.2 on unlimited workstations for both personal and commercial engineering, PCB design, manufacturing, architectural, and quality-assurance workflows.</div>
        <div><b>2. 100% Offline &amp; Air-Gapped Privacy Guarantee</b><br>All PDF drawings, AutoCAD DXF files, Gerber RS-274X layers, Excellon NC drill files, IPC-D-356 netlists, and project sessions (.kensho / .redline) are processed 100% locally on your machine. Kensho Pro contains zero telemetry, zero analytics, zero cloud uploads, and makes zero unsolicited external network requests.</div>
        <div><b>3. Intellectual Property &amp; Redistribution</b><br>Kensho Pro is copyright &copy; 2026 Kensho Studio (textportdocx.in). You may freely distribute unmodified copies of the official installer or portable package within your organization.</div>
        <div><b>4. Disclaimer of Warranty</b><br>This software is provided "AS IS" without warranty of any kind, express or implied. Verify critical fabrication clearances, drill schedules, and engineering tolerances prior to manufacturing release. The full license text is shown below and included in LICENSE.txt in the application folder.</div>
        <details open style="margin-top:4px;border:1px solid var(--line2);border-radius:6px;padding:8px 10px;background:var(--panel2)">
          <summary style="cursor:pointer;font-weight:700;font-size:12px">Complete End-User License Agreement (LICENSE.txt — Version 1.2.3.2)</summary>
          <pre style="margin:8px 0 0 0;white-space:pre-wrap;font-family:Consolas,monospace;font-size:11px;line-height:1.45;color:var(--ink)">KENSHO PRO - END-USER LICENSE AGREEMENT (EULA)
Version 1.2.3.2  |  Publisher: Kensho Studio  |  Website: textportdocx.in

PLEASE READ THIS AGREEMENT BEFORE INSTALLING OR USING KENSHO PRO.
By clicking "I accept the terms of the License Agreement", "I Agree",
installing, copying or using Kensho Pro (the "Software"), you agree to
this End-User License Agreement ("Agreement"). If you do not agree, do
not install or use the Software and delete any copy in your possession.
If you use the Software on behalf of an organization, you confirm that
you are authorized to accept this Agreement for it; "you" then includes
that organization.

1. DEFINITIONS
"Publisher", "we" or "us" means Kensho Studio. "Output" means reports,
markups, comparisons, exports or other materials you create using the
Software. "Third-Party Components" means software distributed with or used
by the Software that is subject to a separate license.

2. LICENSE GRANT AND COST
Subject to this Agreement, the Publisher grants you a free, non-exclusive,
worldwide, perpetual, royalty-free license to install and use the Software
on computers you own or control, for personal, educational and commercial
engineering, CAD, CAM, architectural, and quality-assurance work. There
are no license fees, subscriptions or account requirements for the license
granted here. This license is for use of the Software and does not transfer
ownership of the Software or its intellectual property to you.

3. PERMITTED USE AND YOUR OUTPUT
 a) You may use the Software to view, compare, annotate, edit, convert and
    review PDF documents, AutoCAD DXF drawings, PCB Gerber/Excellon/IPC CAM
    layers, schematics and related files.
 b) You may use, share, publish and sell your Output. As between you and the
    Publisher, you retain your rights in your Output. The Software does not
    give you rights to third-party material in your source files or Output.
 c) You may share an unmodified official installer or portable copy without
    charge, provided that you include this Agreement and do not suggest that
    the copy is an official download or endorsed by the Publisher.

4. RESTRICTIONS
You must not, and must not help another person to:
 a) sell, rent, lease, sublicense or charge for access to the Software itself;
 b) remove, obscure or alter the Software's name, branding, copyright or
    other proprietary notices, or this Agreement;
 c) modify, adapt or redistribute the Software as an official Kensho Pro
    release, or misrepresent the source or authenticity of a copy;
 d) reverse engineer, decompile or disassemble the Software, except to the
    extent that applicable law does not allow this restriction;
 e) bypass or interfere with security, licensing or integrity features;
 f) use the Software in violation of applicable law or another person's
    rights; or
 g) use the Software to introduce malware, disrupt systems or interfere with
    another person's use of the Software.

5. OWNERSHIP AND FEEDBACK
The Software, including its code, design, names, branding and documentation,
is owned by the Publisher or its licensors and is protected by applicable
intellectual-property laws. Except for the limited license in this
Agreement, no rights are granted to you. If you choose to send suggestions
or feedback, you allow the Publisher to use them without restriction or
payment, but this does not grant rights to your files or Output.

6. YOUR FILES, PRIVACY AND SECURITY
The Software is designed to process files 100% locally on your computer.
It does not upload your documents or include tracking or telemetry. Optional
website or other external links open only when you explicitly choose them;
visiting an external site may be subject to that site's own terms and
privacy practices. Your device, operating system or other software may
separately collect or transmit information.

You are responsible for the files you select, the permissions and rights
needed to use them, securing your device, and keeping appropriate backups.
The Publisher cannot restore files that are lost, damaged or overwritten.
Before saving over an original, make a separate copy if you need to preserve
it.

7. YOUR REVIEW AND USE OF RESULTS
The Software is an assistance tool, not a substitute for professional
judgment or independent verification. Results can be incomplete or
inaccurate because of source-file quality, scanning, scaling, alignment,
fonts, settings or other conditions. You are responsible for reviewing
results and deciding whether they are suitable for your use.

Before approving, releasing, manufacturing, constructing or acting on
technical material, a qualified person must independently verify all
critical dimensions, values, part numbers, revisions and changes against
the authoritative source documents. Do not rely solely on an automated
comparison for safety-critical, regulated or high-consequence decisions.

8. COMPATIBILITY, AVAILABILITY AND SUPPORT
The Software may depend on your device, operating system and other software.
You are responsible for ensuring that your environment is suitable and for
maintaining it. The Publisher does not promise that the Software will work
with every device, file, format or future operating-system version, or that
it will be continuously available, error-free or supported. No technical
support or maintenance is included unless separately offered in writing.

9. UPDATES AND TERMS
The Publisher may offer updates, corrections or new versions, but this
Agreement does not require the Publisher to provide them. Updates may add,
change or remove features and may be subject to additional terms presented
with that update. This Agreement applies to the version of the Software
with which it is distributed. A revised Agreement applies to a later
version only if presented for that version; it does not retroactively
change the terms for a copy already licensed to you.

10. THIRD-PARTY COMPONENTS
The Software includes or relies on Third-Party Components, which may include
Electron, PDF.js and pdf-lib. Those components remain subject to their own
copyright notices and licenses. If a third-party license conflicts with
this Agreement as to that component, the third-party license controls for
that component. Nothing in this Agreement limits rights that a third-party
license grants to you.

11. DISCLAIMER OF WARRANTIES
TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SOFTWARE IS PROVIDED
"AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
EXPRESS, IMPLIED OR STATUTORY, INCLUDING WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, TITLE AND NON-INFRINGEMENT. THE
PUBLISHER DOES NOT WARRANT THAT DEFECTS WILL BE CORRECTED OR THAT THE
SOFTWARE WILL MEET YOUR REQUIREMENTS. THIS SECTION DOES NOT EXCLUDE ANY
WARRANTY OR RIGHT THAT CANNOT LAWFULLY BE EXCLUDED.

12. LIMITATION OF LIABILITY
TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE PUBLISHER AND ITS
LICENSORS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY OR
CONSEQUENTIAL LOSS OR DAMAGE, OR FOR LOSS OF PROFITS, REVENUE, DATA,
GOODWILL, PRODUCTION, BUSINESS OPPORTUNITY OR TIME, ARISING OUT OF OR
RELATED TO THE SOFTWARE OR THIS AGREEMENT, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH LOSS.

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE PUBLISHER'S TOTAL
LIABILITY FOR ALL CLAIMS RELATING TO THE SOFTWARE OR THIS AGREEMENT WILL
NOT EXCEED THE AMOUNT YOU PAID, IF ANY, TO OBTAIN THE SOFTWARE. Because the
Software is provided free of charge, this amount may be zero. Nothing in
this Agreement excludes or limits liability that cannot lawfully be
excluded or limited, including liability for fraud or intentional
misconduct where such limitation is prohibited.

13. INDEMNITY FOR UNLAWFUL USE
To the extent permitted by applicable law, you are responsible for claims
arising from your unlawful use of the Software or your violation of another
person's rights. This section does not require you to indemnify the
Publisher for the Publisher's own unlawful conduct or for liability that
cannot lawfully be shifted to you.

14. SUSPENSION AND TERMINATION
Your license continues unless it ends under this section. It terminates
automatically if you materially breach this Agreement. Where the breach can
be remedied, the Publisher may give you notice and a reasonable opportunity
to remedy it before termination. Upon termination, stop using the Software
and delete the copies you control. Sections that by their nature should
continue after termination, including ownership, disclaimers, limitations
of liability and general terms, will survive.

15. GOVERNING LAW AND GENERAL TERMS
This Agreement is governed by the laws of India, without regard to conflict
of law principles, subject to any mandatory consumer protections and rights
that apply to you. Any dispute will be handled by a court or other forum
with jurisdiction under applicable law.

This Agreement is the entire agreement between you and the Publisher about
the Software and replaces prior agreements on that subject. If a provision
is found unenforceable, it will be limited to the minimum extent necessary
and the remaining provisions will continue in effect. A failure to enforce
a provision is not a waiver of the right to enforce it later. You may not
transfer this Agreement or your license except as permitted by applicable
law. The Publisher may transfer its rights and obligations as part of a
business reorganization or transfer, provided this does not reduce your
mandatory legal rights. This Agreement does not create an agency,
partnership or employment relationship.

16. MANDATORY RIGHTS
Nothing in this Agreement is intended to exclude, restrict or waive a
consumer protection, statutory guarantee or other right that applicable
law does not permit you to waive. Where a term conflicts with such a right,
that term applies only to the extent permitted by law.

Copyright (c) 2026 Kensho Studio - textportdocx.in. All rights reserved.</pre>
        </details>
      </div>
      <div class="rp-btns"><button type="button" id="rp-lic-copy">Copy License</button><button type="button" id="rp-lic-about">About Kensho Pro</button><button type="button" class="rp-primary" id="rp-lic-close">I Agree &amp; Close</button></div></div>`);
    document.body.appendChild(d);
    d.onclick = e => { if (e.target === d) d.remove(); };
    const copyBtn = d.querySelector('#rp-lic-copy');
    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          if (window.native && window.native.copyText) await window.native.copyText(FULL_EULA_TEXT);
          else if (navigator.clipboard) await navigator.clipboard.writeText(FULL_EULA_TEXT);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy License'; }, 1600);
        } catch (e) {}
      };
    }
    d.querySelector('#rp-lic-close').onclick = () => {
      safeSet('termsAccepted', '1.2.3.2');
      d.remove();
    };
    d.querySelector('#rp-lic-about').onclick = () => { d.remove(); if ($('#modal')) $('#modal').hidden = false; };
  }
  window.showTerms = showTerms;

  // ---------- Multi-Layered CAD Loading Animation System (Bottom-Right Pill + Stage Reticle Banner) ----------
  const cadSpinnerSvg = `<svg class="rp-cad-reticle-svg" viewBox="0 0 36 36" fill="none" aria-hidden="true">
    <circle class="rp-ret-track" cx="18" cy="18" r="14" stroke-width="2"/>
    <circle class="rp-ret-outer" cx="18" cy="18" r="14" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="28 60"/>
    <circle class="rp-ret-inner" cx="18" cy="18" r="8.5" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="16 38"/>
    <path class="rp-ret-cross" d="M18 2v4M18 30v4M2 18h4M30 18h4" stroke-width="1.5" stroke-linecap="round"/>
    <circle class="rp-ret-core" cx="18" cy="18" r="2"/>
  </svg>`;
  const ld = el('div', { id: 'rp-load', className: 'rp-load-card', hidden: true, role: 'status', 'aria-live': 'polite' },
    `<div class="rp-ring rp-cad-spinner">${cadSpinnerSvg}</div>` +
    `<div class="rp-load-body">` +
      `<div class="rp-load-top"><b id="rp-lt">Loading</b><span id="rp-lp">0%</span></div>` +
      `<small id="rp-ls" class="rp-load-sub">Initializing precision CAD/PDF pipeline</small>` +
      `<div class="rp-bar"><i id="rp-lb"></i></div>` +
    `</div>`
  );
  document.body.appendChild(ld);

  const stageLd = el('div', { id: 'rp-stage-loader', className: 'rp-stage-loader', hidden: true, 'aria-hidden': 'true' },
    `<div class="rp-stage-reticle">${cadSpinnerSvg}</div>` +
    `<div class="rp-stage-meta"><b id="rp-slt">Processing Drawing</b><small id="rp-sls">300 DPI Vector &amp; Pixel Pipeline</small></div>` +
    `<span id="rp-slp" class="rp-stage-pct">0%</span>`
  );
  if ($('#vp')) $('#vp').appendChild(stageLd);
  else document.body.appendChild(stageLd);

  // Mount live Thinking Orbs (Jakubantalik/thinking-orbs) into both telemetry pill & viewport stage loader
  const _ldOrbHost = ld.querySelector('.rp-ring');
  const _stageOrbHost = stageLd.querySelector('.rp-stage-reticle');
  const _ldOrb = (typeof window !== 'undefined' && window.ThinkingOrbs && _ldOrbHost)
    ? window.ThinkingOrbs.mount(_ldOrbHost, { state: 'working', size: 20, displaySize: 28, theme: 'auto', paused: true })
    : null;
  const _stageOrb = (typeof window !== 'undefined' && window.ThinkingOrbs && _stageOrbHost)
    ? window.ThinkingOrbs.mount(_stageOrbHost, { state: 'searching', size: 64, displaySize: 34, theme: 'auto', paused: true })
    : null;
  if (_ldOrbHost && _ldOrb) _ldOrbHost.classList.add('rp-orb-active');
  if (_stageOrbHost && _stageOrb) _stageOrbHost.classList.add('rp-orb-active');

  const inferProgressSub = (lbl) => {
    const s = String(lbl || '').toLowerCase();
    if (s.includes('opening') || s.includes('reading')) return 'Parsing PDF stream & vector geometry';
    if (s.includes('comparing')) return 'Executing pixel & vector differential scan';
    if (s.includes('scanning')) return 'Multi-sheet batch differential audit';
    if (s.includes('align')) return 'Sub-pixel SAD & Procrustes registration';
    if (s.includes('report') || s.includes('export')) return 'Compiling executive engineering deliverable';
    if (s.includes('rendering')) return 'Rasterizing high-DPI viewport buffer';
    if (s.includes('ready')) return 'Workstation pipeline synchronized';
    return 'Active high-precision CAD/PDF task';
  };

  let ldN = 0, hideTimer = null;
  window.rpProgress = (label, frac, subLabel) => {
    clearTimeout(hideTimer);
    if (window.native && window.native.setProgress) {
      try { window.native.setProgress(frac == null ? -1 : frac); } catch (e) {}
    }
    if (frac == null) {
      ld.hidden = true;
      stageLd.hidden = true;
      if (_ldOrb) _ldOrb.setPaused(true);
      if (_stageOrb) _stageOrb.setPaused(true);
      return;
    }
    const host = (document.body.dataset.view === 'edit' ? $('#eview') : $('#vp')) || $('#vp');
    if (host && stageLd.parentElement !== host) host.appendChild(stageLd);
    const titleTxt = label || 'Loading';
    const subTxt = subLabel || inferProgressSub(titleTxt);
    const p = Math.max(0, Math.min(100, Math.round(frac * 100)));
    ld.hidden = false;
    stageLd.hidden = false;
    if (window.ThinkingOrbs) {
      const orbState = window.ThinkingOrbs.inferState(titleTxt + ' ' + subTxt);
      if (_ldOrb) { _ldOrb.setState(orbState); _ldOrb.setPaused(false); _ldOrb.poke(); }
      if (_stageOrb) { _stageOrb.setState(orbState); _stageOrb.setPaused(false); _stageOrb.poke(); }
    }
    $('#rp-lt').textContent = titleTxt;
    $('#rp-ls').textContent = subTxt;
    $('#rp-lb').style.width = p + '%';
    $('#rp-lp').textContent = p + '%';
    $('#rp-slt').textContent = titleTxt;
    $('#rp-sls').textContent = subTxt;
    $('#rp-slp').textContent = p + '%';
  };
  const gd = pdfjsLib.getDocument;
  pdfjsLib.getDocument = function (src) {
    if (src && typeof src === "object" && !ArrayBuffer.isView(src) && !(src instanceof ArrayBuffer)) {
      if (src.verbosity === undefined) src.verbosity = 0;
      if (src.isOffscreenCanvasSupported === undefined) src.isOffscreenCanvasSupported = false;
    }
    const t = gd.apply(this, arguments); ldN++;
    t.onProgress = p => window.rpProgress('Opening PDF', p.total ? p.loaded / p.total : .35);
    if (ld.hidden) window.rpProgress('Opening PDF', .15);
    t.promise.then(() => {
      if (--ldN <= 0) {
        ldN = 0;
        const stillBusy = $('#busy') && !$('#busy').hidden;
        if (stillBusy) {
          window.rpProgress('Rendering page...', .65);
        } else {
          window.rpProgress('Ready', 1);
          hideTimer = setTimeout(() => { if (!ldN && (!$('#busy') || $('#busy').hidden)) window.rpProgress(null); }, 260);
        }
      }
    }, () => {
      ldN = Math.max(0, ldN - 1);
      if (!ldN && (!$('#busy') || $('#busy').hidden)) window.rpProgress(null);
    });
    return t;
  };
  const observeStatusProgress = (elRef, defaultLabel) => {
    if (!elRef) return;
    new MutationObserver(() => {
      const txt = (elRef.textContent || '').trim();
      if (!txt) return;
      // Only trigger progress updates on active progress verbs, NEVER on completed summary messages like "2 of 2 pages have differences."
      const isBusy = $('#busy') && !$('#busy').hidden;
      if (!isBusy && !ldN) return;
      const m = /^(Scanning|Comparing|Report|Unlocking|Preparing|Exporting|Merging|Splitting|Processing|Reading)\b[^0-9]*(\d+)\s*(?:\/|of)\s*(\d+)/i.exec(txt);
      if (m && +m[3] >= 1) {
        const verb = m[1];
        const cur = +m[2], tot = +m[3];
        const lbl = verb.toLowerCase() === 'scanning' ? `Scanning page ${cur}/${tot}`
          : verb.toLowerCase() === 'comparing' ? `Comparing page ${cur}/${tot}`
          : `${verb} (${cur}/${tot})`;
        window.rpProgress(lbl, Math.min(0.98, Math.max(0.1, cur / tot)));
      } else if (/^Comparing page (\d+)/i.test(txt)) {
        window.rpProgress(txt.replace(/\.\.\.$/, ''), 0.55);
      } else if (/^Reading\s+/i.test(txt)) {
        window.rpProgress(txt.slice(0, 28), 0.25);
      } else if (/^Aligning/i.test(txt)) {
        window.rpProgress('Auto-Aligning...', 0.5);
      }
    }).observe(elRef, { childList: true, characterData: true, subtree: true });
  };
  observeStatusProgress($('#st'), 'Comparing pages');
  observeStatusProgress($('#est'), 'Processing pages');
  const ob = window.busy; let bt;
  window.busy = on => {
    ob(on);
    const isBusy = !$('#busy').hidden;
    if (window.native && window.native.setBusyLock) {
      try { window.native.setBusyLock(isBusy); } catch (e) {}
    }
    clearTimeout(bt);
    if (isBusy) {
      bt = setTimeout(() => { if (ld.hidden && !$('#busy').hidden) window.rpProgress('Working...', .45); }, 180);
    } else if (!ldN) {
      clearTimeout(hideTimer);
      window.rpProgress(null);
    }
  };

  // ---------- Enhanced View (darker, crisper lines; screen only) ----------
  const EV = { off: 'none', enh: 'contrast(1.45) brightness(.9) saturate(1.15)', dark: 'contrast(1.7) brightness(.78) saturate(1.2)', blue: 'invert(1) hue-rotate(180deg) contrast(1.3) brightness(.95)' };
  const EV_NAMES = { off: 'Normal (Unfiltered)', enh: 'High Contrast Boost', dark: 'Extra Dark Line Density', blue: 'Blueprint CAD Mode' };
  function setEnh(m, silent = false) {
    const mode = EV[m] ? m : 'off';
    safeSet('enh', mode);
    document.documentElement.dataset.enhMode = mode;
    document.documentElement.style.setProperty('--rp-filter', EV[mode] || 'none');
    document.querySelectorAll('[data-enh]').forEach(b => b.classList.toggle('on', b.dataset.enh === mode));
    const mapId = { off: '#rib-enh-norm', enh: '#rib-enh-boost', dark: '#rib-enh-dark', blue: '#rib-enh-inv' };
    Object.entries(mapId).forEach(([k, sel]) => { const b = $(sel); if (b) b.classList.toggle('on', k === mode); });
    if (typeof renderViewportHUD === 'function' && window.RP_MEASURE && window.RP_MEASURE.loupeEnabled) {
      renderViewportHUD();
    }
    if (window.rpRedrawOverlay) window.rpRedrawOverlay();
    if (!silent && window.rpToast) {
      window.rpToast(`Signal & Line Enhancement: ${EV_NAMES[mode] || mode}`);
    }
  }
  window.setEnhanced = setEnh;

  // ---------- Sharp zoom in Compare: redraw the visible area from the PDF's own lines ----------
  const vp = $('#vp'), stg = $('#stage'), hq = el('canvas', { id: 'hq' });
  if (stg && $('#mk')) stg.insertBefore(hq, $('#mk'));
  else if (stg) stg.appendChild(hq);
  else vp.appendChild(hq);
  let hqT, hqTok = 0, _hqTasks = [];
  const cancelHqTasks = () => {
    while (_hqTasks.length) {
      const rt = _hqTasks.pop();
      if (rt && typeof rt.cancel === 'function') {
        try { rt.cancel(); } catch (e) {}
      }
    }
  };
  const kick = (d, hideNow = false) => {
    if (stg) lastT = stg.style.transform;
    cancelHqTasks();
    const v = S && S.view ? S.view : null;
    const isNativeDXFActive = !!(S && S.cur && S.cur.isNativeDXF && !S._isCAMScan && window.DXFState && window.DXFState._isActiveDXFSession && window.DXFState.parsedA && window.DXFState.parsedB);
    const zoomLow = !v || (v.k * DPR() <= 1.02);
    const zoomChanged = !!(v && hq._lastZoomK && Math.abs(v.k - hq._lastZoomK) / hq._lastZoomK > 0.005);
    if (hideNow || zoomLow || zoomChanged) {
      if (!isNativeDXFActive) {
        hq.style.display = 'none';
        hq._cropA = null;
        hq._cropB = null;
        hq._lastKey = '';
      }
    }
    hqTok++;
    clearTimeout(hqT);
    if (vp && vp.classList.contains('drag')) {
      return;
    }
    if (v && (isNativeDXFActive ? v.k > 0.05 : !zoomLow)) {
      hqT = setTimeout(sharpen, isNativeDXFActive ? 16 : Math.max(40, d || 65));
    }
  };
  window.rpAfterPan = () => kick(55, false);
  const pageScale = () => {
    if (S.cur && S.cur.dpi) return S.cur.dpi / 72;
    if (S.preview && S.preview.dpi) return S.preview.dpi / 72;
    return (+($('#dpi') && $('#dpi').value) || 300) / 72;
  };
  const _cropCanvases = { A: null, B: null };
  let _sharedHqImgData = null;
  async function crop(k, n, s, ox, oy, w, h) {
    const c = _cropCanvases[k] || (_cropCanvases[k] = document.createElement('canvas'));
    c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    if (S[k] && n <= S[k].numPages) {
      const p = await S[k].getPage(n);
      const slotDeg = window.getSlotCardinalDeg ? window.getSlotCardinalDeg(k) : (k === 'A' ? (S.degA || 0) : (S.degB || 0));
      const mir = window.getSlotMirror ? window.getSlotMirror(k) : { x: false, y: false };
      const rot = (((p.rotate || 0) + slotDeg) % 360 + 360) % 360;
      let effOx = ox, effOy = oy;
      if (mir.x || mir.y) {
        const vpFull = p.getViewport({ scale: s, rotation: rot });
        if (mir.x) effOx = vpFull.width - ox - w;
        if (mir.y) effOy = vpFull.height - oy - h;
      }
      const useSS = s < 2.2 && (w * h * 4 <= 1.2e7);
      if (useSS) {
        const ss = _cropCanvases[k + '_ss'] || (_cropCanvases[k + '_ss'] = document.createElement('canvas'));
        const sw = w * 2, sh = h * 2;
        ss.width = sw; ss.height = sh;
        const sx = ss.getContext('2d', { willReadFrequently: true });
        sx.fillStyle = '#fff'; sx.fillRect(0, 0, sw, sh);
        const rt = p.render({ canvasContext: sx, viewport: p.getViewport({ scale: s * 2, rotation: rot, offsetX: -effOx * 2, offsetY: -effOy * 2 }) });
        _hqTasks.push(rt);
        try {
          await rt.promise;
        } finally {
          const idx = _hqTasks.indexOf(rt);
          if (idx !== -1) _hqTasks.splice(idx, 1);
        }
        x.imageSmoothingEnabled = true;
        x.imageSmoothingQuality = 'high';
        x.drawImage(ss, 0, 0, w, h);
        try {
          const sData = sx.getImageData(0, 0, sw, sh).data;
          const dImg = x.getImageData(0, 0, w, h);
          const dData = dImg.data;
          for (let y = 0; y < h; y++) {
            const sy0 = y << 1, sy1 = sy0 + 1, dRow = y * w;
            for (let xx = 0; xx < w; xx++) {
              const sx0 = xx << 1, sx1 = sx0 + 1, di = (dRow + xx) * 4;
              const avgR = dData[di], avgG = dData[di + 1], avgB = dData[di + 2];
              const avgInk = 255 - (avgR < avgG ? (avgR < avgB ? avgR : avgB) : (avgG < avgB ? avgG : avgB));
              let bestInk = avgInk, bR = avgR, bG = avgG, bB = avgB;
              for (let sy = sy0; sy <= sy1; sy++) {
                const sRow = sy * sw;
                for (let sxx = sx0; sxx <= sx1; sxx++) {
                  const si = (sRow + sxx) * 4;
                  const sr = sData[si], sg = sData[si + 1], sb = sData[si + 2];
                  const sMin = sr < sg ? (sr < sb ? sr : sb) : (sg < sb ? sg : sb);
                  const sInk = 255 - sMin;
                  if (sInk > bestInk) { bestInk = sInk; bR = sr; bG = sg; bB = sb; }
                }
              }
              if (bestInk > avgInk + 10) {
                dData[di]     = Math.round(avgR * 0.4 + bR * 0.6);
                dData[di + 1] = Math.round(avgG * 0.4 + bG * 0.6);
                dData[di + 2] = Math.round(avgB * 0.4 + bB * 0.6);
              }
            }
          }
          x.putImageData(dImg, 0, 0);
        } catch (e) {}
        ss.width = 0; ss.height = 0;
      } else {
        const rt = p.render({ canvasContext: x, viewport: p.getViewport({ scale: s, rotation: rot, offsetX: -effOx, offsetY: -effOy }) });
        _hqTasks.push(rt);
        try {
          await rt.promise;
        } finally {
          const idx = _hqTasks.indexOf(rt);
          if (idx !== -1) _hqTasks.splice(idx, 1);
        }
      }
      if (mir.x || mir.y) {
        const flip = _cropCanvases._flip || (_cropCanvases._flip = document.createElement('canvas'));
        flip.width = w; flip.height = h;
        const fx = flip.getContext('2d');
        fx.clearRect(0, 0, w, h);
        fx.drawImage(c, 0, 0);
        x.save();
        x.setTransform(mir.x ? -1 : 1, 0, 0, mir.y ? -1 : 1, mir.x ? w : 0, mir.y ? h : 0);
        x.drawImage(flip, 0, 0);
        x.restore();
        flip.width = 0; flip.height = 0;
      }
    }
    const imgData = x.getImageData(0, 0, w, h);
    c.width = 0; c.height = 0;
    return imgData;
  }
  const hex2rgb = (h, def) => {
    if (!h || h.length < 7) return def;
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  };
  function maskOutsidePage(imgData, W, H, ox, oy, inv, RW, RH) {
    if (!imgData) return;
    const d = imgData.data;
    for (let yy = 0, i = 0; yy < H; yy++) {
      const py = Math.floor((yy + oy) * inv);
      const outY = py < 0 || py >= RH;
      for (let xx = 0; xx < W; xx++, i += 4) {
        if (outY) { d[i + 3] = 0; continue; }
        const px = Math.floor((xx + ox) * inv);
        if (px < 0 || px >= RW) d[i + 3] = 0;
      }
    }
  }
  /* ============================================================================
   * [MODULE SECTION: HIGH-RESOLUTION VIEWPORT VECTOR SHARPENING ENGINE (#hq)]
   * WHAT THIS IS: Re-renders only the visible zoomed viewport crop at native
   *   screen device-pixel resolution after pan/zoom settles.
   * WHY / HOW TO EDIT: Edit `crop()` or `sharpen()` to adjust supersampling
   *   thresholds or high-zoom sub-pixel edge classification.
   * ============================================================================ */
  async function sharpen() {
    if (stg) lastT = stg.style.transform;
    clearTimeout(hqT);
    cancelHqTasks();
    if (vp && vp.classList.contains('drag')) return;
    const r = S.cur, prev = (!r && S.preview) ? S.preview : null, v = S.view, d = Math.max(DPR(), 1.5), m = S.mode;
    const curtainOn = !!(window.UIRibbon && window.UIRibbon.isCurtainActive && window.UIRibbon.isCurtainActive());
    if (prev && v && (v.k * d > 0.05) && !S._isCAMScan) {
      const W = Math.round(vp.clientWidth * d), H = Math.round(vp.clientHeight * d);
      if (!W || !H || W * H > 20e6) return;
      const vx0 = v.x, vy0 = v.y, k0 = v.k;
      const prevDeg = window.getSlotCardinalDeg ? window.getSlotCardinalDeg(prev.k) : 0;
      const prevMir = window.getSlotMirror ? window.getSlotMirror(prev.k) : { x: false, y: false };
      const prevKey = `P|${prev.k}|${prev.n}|${prevDeg}|${prevMir.x ? 1 : 0}${prevMir.y ? 1 : 0}|${S.gen || 0}|${vx0.toFixed(1)}|${vy0.toFixed(1)}|${k0.toFixed(4)}|${W}x${H}`;
      if (hq.style.display === 'block' && hq._lastKey === prevKey) return;
      const my = ++hqTok;
      const s = pageScale() * k0 * d, ox = -vx0 * d, oy = -vy0 * d;
      let singleImg = null;
      try { singleImg = await crop(prev.k, prev.n, s, ox, oy, W, H); } catch (e) { return; }
      if (my !== hqTok) return;
      const inv = 1 / (k0 * d);
      maskOutsidePage(singleImg, W, H, ox, oy, inv, prev.W, prev.H);
      if (hq.width !== W || hq.height !== H) { hq.width = W; hq.height = H; }
      hq.style.width = vp.clientWidth + 'px'; hq.style.height = vp.clientHeight + 'px';
      hq.style.transformOrigin = '0 0';
      hq.style.transform = `translate(${-vx0 / k0}px, ${-vy0 / k0}px) scale(${1 / k0})`;
      hq.getContext('2d').putImageData(singleImg, 0, 0);
      hq.style.clipPath = 'none';
      hq._lastKey = prevKey;
      hq._lastZoomK = k0; hq.style.display = 'block';
      return;
    }
    // Native Vector DXF vs DXF Crisp Viewport Rendering (identical vector path to DXF Studio, sharp at 800%+ zoom!)
    const ds = (typeof window !== 'undefined' && window.DXFState) ? window.DXFState : null;
    if (r && r.isNativeDXF && !S._isCAMScan && ds && ds._isActiveDXFSession && ds.parsedA && ds.parsedB && typeof DXFEngine !== 'undefined' && typeof DXFEngine.renderNativeDXFComparison === 'function' && v && (v.k * d > 0.05)) {
      const W = Math.round(vp.clientWidth * d), H = Math.round(vp.clientHeight * d);
      if (!W || !H || W * H > 20e6) return;
      const vx0 = v.x, vy0 = v.y, k0 = v.k;
      const degA = window.getSlotCardinalDeg ? window.getSlotCardinalDeg('A') : (S.degA || 0);
      const degB = window.getSlotCardinalDeg ? window.getSlotCardinalDeg('B') : (S.degB || 0);
      const mirA = (S.mirrorXA ? 1 : 0) | (S.mirrorYA ? 2 : 0), mirB = (S.mirrorXB ? 1 : 0) | (S.mirrorYB ? 2 : 0);
      const effMode = curtainOn ? 'curtain' : m;
      const meta = ds.lastRenderMeta || {};
      const splitRatio = (window.UIRibbon && typeof window.UIRibbon.getCurtainRatio === 'function') ? window.UIRibbon.getCurtainRatio() : 0.5;
      const dxfKey = `DXFVEC|${r.n}|${degA}|${degB}|${mirA}|${mirB}|${S.gen || 0}|${effMode}|${S.phase || 0}|${splitRatio.toFixed(3)}|${vx0.toFixed(1)}|${vy0.toFixed(1)}|${k0.toFixed(4)}|${W}x${H}|${$('#dx').value}|${$('#dy').value}|${$('#lA').checked}|${$('#lB').checked}|${$('#lC').checked}|${S.tintA || ''}|${S.tintB || ''}|${S.tintC || ''}|${S.opA ?? 100}|${S.opB ?? 100}|${S.opC ?? 42}`;
      if (hq.style.display === 'block' && hq._lastKey === dxfKey) return;
      if (hq.width !== W || hq.height !== H) { hq.width = W; hq.height = H; }
      hq.style.width = vp.clientWidth + 'px';
      hq.style.height = vp.clientHeight + 'px';
      hq.style.transformOrigin = '0 0';
      hq.style.transform = `translate(${-vx0 / k0}px, ${-vy0 / k0}px) scale(${1 / k0})`;
      const isPaperMode = effMode === 'paper';
      DXFEngine.renderNativeDXFComparison(hq, ds.parsedA, ds.parsedB, ds.lastEntityDiff, {
        viewportMode: true,
        viewK: k0,
        viewX: vx0,
        viewY: vy0,
        dpr: d,
        baseCanvasW: r.W,
        baseCanvasH: r.H,
        mode: effMode,
        blinkPhase: S.phase || 0,
        curtainSplitX: W * splitRatio,
        alignDx: parseFloat($('#dx').value) || 0,
        alignDy: parseFloat($('#dy').value) || 0,
        rotDegA: degA,
        rotDegB: degB,
        mirXA: !!S.mirrorXA,
        mirYA: !!S.mirrorYA,
        mirXB: !!S.mirrorXB,
        mirYB: !!S.mirrorYB,
        sharedBounds: meta.sharedBoundsA || meta.sharedBounds,
        centerOffsetB: meta.centerOffsetB || { dx: 0, dy: 0 },
        hiddenLayers: meta.effectiveHidden,
        comparedLayers: ds.comparedLayers && ds.comparedLayers.size ? ds.comparedLayers : null,
        background: isPaperMode ? '#ffffff' : (ds.background || '#0c1017'),
        showLayerA: $('#lA').checked,
        showLayerB: $('#lB').checked,
        showCommon: $('#lC').checked,
        showDiffBoxes: false,
        showGrid: false,
        isInteracting: !!(vp && vp.classList.contains('drag')),
        lineWidth: ds.lineWidth || 1.0
      });
      hq.style.clipPath = 'none';
      hq._lastKey = dxfKey;
      hq._lastZoomK = k0;
      hq._isNativeDXFVector = true;
      hq.style.display = 'block';
      return;
    }
    if (!r || (!curtainOn && (m === 'side' || m === 'blink')) || !r.cls || !v || (v.k * DPR() <= 1.02) || S._isCAMScan || Math.abs(S.rotA || 0) > 0.001 || Math.abs(S.rotB || 0) > 0.001) { hq.style.display = 'none'; hq._cropA = null; hq._cropB = null; hq._lastKey = ''; return; }
    const W = Math.round(vp.clientWidth * d), H = Math.round(vp.clientHeight * d);
    if (!W || !H || W * H > 20e6) return;
    const vx0 = v.x, vy0 = v.y, k0 = v.k;
    const cvEl = $('#cv');
    const degA = window.getSlotCardinalDeg ? window.getSlotCardinalDeg('A') : (S.degA || 0);
    const degB = window.getSlotCardinalDeg ? window.getSlotCardinalDeg('B') : (S.degB || 0);
    const mirA = (S.mirrorXA ? 1 : 0) | (S.mirrorYA ? 2 : 0), mirB = (S.mirrorXB ? 1 : 0) | (S.mirrorYB ? 2 : 0);
    const sharpenKey = `C|${r.n}|${degA}|${degB}|${mirA}|${mirB}|${S.gen || 0}|${cvEl ? (cvEl._paintGen || 0) : 0}|${m}|${curtainOn}|${vx0.toFixed(1)}|${vy0.toFixed(1)}|${k0.toFixed(4)}|${W}x${H}|${$('#dx').value}|${$('#dy').value}|${$('#lA').checked}|${$('#lB').checked}|${$('#lC').checked}|${S.tintA || ''}|${S.tintB || ''}|${S.tintC || ''}|${S.opA ?? 100}|${S.opB ?? 100}|${S.opC ?? 42}|${$('#tol').value}`;
    if (hq.style.display === 'block' && hq._lastKey === sharpenKey) return;
    const my = ++hqTok;
    const s = pageScale() * k0 * d, ox = -vx0 * d, oy = -vy0 * d, dx = (parseFloat($('#dx').value) || 0) * k0 * d, dy = (parseFloat($('#dy').value) || 0) * k0 * d;
    const showA = !curtainOn && m === 'A';
    const showB = !curtainOn && m === 'B';
    let a = null, b = null;
    try {
      if (showA) a = await crop('A', r.n, s, ox, oy, W, H);
      else if (showB) b = await crop('B', r.n, s, ox - dx, oy - dy, W, H);
      else [a, b] = await Promise.all([crop('A', r.n, s, ox, oy, W, H), crop('B', r.n, s, ox - dx, oy - dy, W, H)]);
    } catch (e) { return; }
    if (my !== hqTok) return;
    const RW = r.W, RH = r.H, inv = 1 / (k0 * d);
    if (hq.width !== W || hq.height !== H) { hq.width = W; hq.height = H; }
    hq.style.width = vp.clientWidth + 'px'; hq.style.height = vp.clientHeight + 'px';
    hq.style.transformOrigin = '0 0';
    hq.style.transform = `translate(${-vx0 / k0}px, ${-vy0 / k0}px) scale(${1 / k0})`;
    const x = hq.getContext('2d');
    if (curtainOn && a && b) {
      maskOutsidePage(a, W, H, ox, oy, inv, RW, RH);
      maskOutsidePage(b, W, H, ox, oy, inv, RW, RH);
      hq._cropA = a;
      hq._cropB = b;
      x.putImageData(a, 0, 0);
      const splitPx = Math.max(0, Math.min(W, Math.round(((window.UIRibbon.getCurtainPct ? window.UIRibbon.getCurtainPct() : 50) / 100) * W)));
      if (splitPx < W) {
        x.putImageData(b, 0, 0, splitPx, 0, W - splitPx, H);
      }
      hq.style.clipPath = 'none';
      hq._lastKey = sharpenKey;
      hq._lastZoomK = k0;
      hq._lastVx = vx0;
      hq._lastDpr = d;
      hq.style.display = 'block';
      return;
    }
    hq._cropA = null;
    hq._cropB = null;
    if (showA || showB) {
      const targetImg = showA ? a : b;
      maskOutsidePage(targetImg, W, H, ox, oy, inv, RW, RH);
      x.putImageData(targetImg, 0, 0);
      hq._lastKey = sharpenKey;
      hq._lastZoomK = k0; hq.style.display = 'block';
      if (window.UIRibbon && window.UIRibbon.updateCurtainClip) window.UIRibbon.updateCurtainClip();
      return;
    }
    if (!_sharedHqImgData || _sharedHqImgData.width !== W || _sharedHqImgData.height !== H) {
      _sharedHqImgData = new ImageData(W, H);
    } else {
      new Uint32Array(_sharedHqImgData.data.buffer).fill(0);
    }
    const o = _sharedHqImgData, pa = a.data, pb = b.data, o32 = new Uint32Array(o.data.buffer), c = r.cls, paper = m === 'paper', darkSub = !!r.isDarkSubstrate, isDxf = !!r.isNativeDXF;
    const lA = $('#lA').checked, lB = $('#lB').checked, lC = $('#lC').checked, dim = m === 'diff' ? 20 : 120;
    const tol = +($('#tol') && $('#tol').value) || 40;
    const minDiff = Math.min(12, tol * 0.35);
    const pk = (R, G, B) => (255 << 24) | ((B & 255) << 16) | ((G & 255) << 8) | (R & 255);
    const sBgR = r.bgSrcR != null ? r.bgSrcR : (darkSub ? 10 : 255);
    const sBgG = r.bgSrcG != null ? r.bgSrcG : (darkSub ? 46 : 255);
    const sBgB = r.bgSrcB != null ? r.bgSrcB : (darkSub ? 22 : 255);
    const bg = (m === 'paper') ? [255, 255, 255] : ((m === 'over') ? ((isDxf && darkSub) ? [sBgR, sBgG, sBgB] : [6, 10, 8]) : ((isDxf && m !== 'diff') ? [sBgR, sBgG, sBgB] : (paper ? [255, 255, 255] : [6, 10, 8])));
    const bg32 = pk(bg[0], bg[1], bg[2]);
    const useLightTints = (m === 'paper') ? true : ((m === 'over') ? false : (isDxf ? !darkSub : paper));
    const cA = hex2rgb(S.tintA, useLightTints ? [225, 20, 20] : [255, 64, 64]);
    const cB = hex2rgb(S.tintB, useLightTints ? [0, 165, 60] : [61, 255, 122]);
    const hasCustomTintC = !!(S.tintC && S.tintC.toLowerCase() !== '#94a3b8');
    const cC = hex2rgb(S.tintC, useLightTints ? [100, 116, 139] : [148, 163, 184]);
    const opA = (S.opA != null ? S.opA : 100) / 100, opB = (S.opB != null ? S.opB : 100) / 100;
    const opC = (m === 'diff') ? 0.14 : ((S.opC != null ? S.opC : 42) / 100);
    // Precompute 256-entry packed-RGBA lookup tables (lutA, lutB, lutC) for O(1) high-res viewport compositing
    const lutA = new Uint32Array(256), lutB = new Uint32Array(256), lutC = new Uint32Array(256);
    for (let rawInk = 0; rawInk < 256; rawInk++) {
      const normInk = Math.min(1, Math.max(0, (rawInk - 6) / 210));
      const baseCurve = rawInk >= 8 ? Math.pow(normInk, 0.82) : 0;
      const inkA = lA ? baseCurve * opA : 0;
      const inkB = lB ? baseCurve * opB : 0;
      lutA[rawInk] = pk(
        Math.round(bg[0] + (cA[0] - bg[0]) * inkA),
        Math.round(bg[1] + (cA[1] - bg[1]) * inkA),
        Math.round(bg[2] + (cA[2] - bg[2]) * inkA)
      );
      lutB[rawInk] = pk(
        Math.round(bg[0] + (cB[0] - bg[0]) * inkB),
        Math.round(bg[1] + (cB[1] - bg[1]) * inkB),
        Math.round(bg[2] + (cB[2] - bg[2]) * inkB)
      );
      const inkC = Math.min(1, rawInk / 215) * opC;
      lutC[rawInk] = pk(
        Math.round(bg[0] + (cC[0] - bg[0]) * inkC),
        Math.round(bg[1] + (cC[1] - bg[1]) * inkC),
        Math.round(bg[2] + (cC[2] - bg[2]) * inkC)
      );
    }
    const useCustomCommonLUT = isDxf || hasCustomTintC;
    const paperColorScale = (S.opC != null && S.opC !== 42) ? Math.max(0.05, Math.min(1, S.opC / 100)) : 1.0;
    const hqDiffThresh = Math.max(14, tol * 0.45);
    const scSheet = r.dpi ? (r.dpi / 72) : ((+$('#dpi').value || 300) / 72);
    const ignList = (S.ignore || []).filter(ig => ig.page == null || ig.page === r.n).map(ig => [ig.x * scSheet, ig.y * scSheet, (ig.x + ig.w) * scSheet, (ig.y + ig.h) * scSheet]);
    const hasIgn = ignList.length > 0;
    for (let yy = 0, pIdx = 0, i = 0; yy < H; yy++) {
      const py = Math.floor((yy + oy) * inv);
      if (py < 0 || py >= RH) { pIdx += W; i += W * 4; continue; }
      const row = py * RW;
      for (let xx = 0; xx < W; xx++, pIdx++, i += 4) {
        const px = Math.floor((xx + ox) * inv);
        if (px < 0 || px >= RW) continue;
        const ia = darkSub
          ? Math.min(255, (Math.max(Math.abs(pa[i] - sBgR), Math.abs(pa[i + 1] - sBgG), Math.abs(pa[i + 2] - sBgB)) * 1.15) | 0)
          : 255 - Math.min(pa[i], pa[i + 1], pa[i + 2]);
        const ib = darkSub
          ? Math.min(255, (Math.max(Math.abs(pb[i] - sBgR), Math.abs(pb[i + 1] - sBgG), Math.abs(pb[i + 2] - sBgB)) * 1.15) | 0)
          : 255 - Math.min(pb[i], pb[i + 1], pb[i + 2]);
        if (ia < 8 && ib < 8) {
          o32[pIdx] = bg32;
          continue;
        }
        const dr = pa[i] - pb[i], dg = pa[i + 1] - pb[i + 1], db = pa[i + 2] - pb[i + 2];
        const maxChDiff = Math.max(dr < 0 ? -dr : dr, dg < 0 ? -dg : dg, db < 0 ? -db : db);
        const diffAB = ia >= ib ? (ia - ib) : (ib - ia);
        let t = c[row + px];
        if (t === 0 && inv > 1.05) {
          const py1 = Math.min(RH - 1, Math.floor((yy + 1 + oy) * inv));
          const px1 = Math.min(RW - 1, Math.floor((xx + 1 + ox) * inv));
          for (let sy = py; sy <= py1 && !t; sy++) {
            const sRow = sy * RW;
            for (let sx = px; sx <= px1; sx++) {
              const cv = c[sRow + sx];
              if (cv !== 0) { t = cv; break; }
            }
          }
        }
        if (t === 0 && (maxChDiff > tol || diffAB > tol)) {
          // Only refine sub-pixel boundary if an immediate 3x3 neighbor in the authoritative r.cls map is an actual difference
          let nearCls = 0;
          const ny0 = py > 0 ? py - 1 : 0, ny1 = py + 1 < RH ? py + 1 : RH - 1;
          const nx0 = px > 0 ? px - 1 : 0, nx1 = px + 1 < RW ? px + 1 : RW - 1;
          for (let nyy = ny0; nyy <= ny1 && !nearCls; nyy++) {
            const nRow = nyy * RW;
            for (let nxx = nx0; nxx <= nx1; nxx++) {
              const cv = c[nRow + nxx];
              if (cv !== 0) { nearCls = cv; break; }
            }
          }
          if (nearCls !== 0) {
            let inIgn = false;
            if (hasIgn) {
              for (let k = 0; k < ignList.length; k++) {
                const g = ignList[k];
                if (px >= g[0] && px < g[2] && py >= g[1] && py < g[3]) { inIgn = true; break; }
              }
            }
            if (!inIgn) {
              const tintCls = (typeof CompareMemoryGuard !== 'undefined' && CompareMemoryGuard && CompareMemoryGuard.classifyDiffPixelTint)
                ? CompareMemoryGuard.classifyDiffPixelTint(pa[i], pa[i + 1], pa[i + 2], pb[i], pb[i + 1], pb[i + 2], hqDiffThresh, S.tintA, S.tintB)
                : 0;
              const redDomA = (tintCls === 1) || ((pa[i] - pa[i + 1] > 75) && (pa[i] - pb[i] > hqDiffThresh));
              const grnDomB = (tintCls === 2) || ((pb[i + 1] - pb[i] > 60) && (pb[i + 1] - pa[i + 1] > hqDiffThresh));
              if (redDomA && !grnDomB) t = 1;
              else if (grnDomB && !redDomA) t = 2;
              else t = ia >= ib ? 1 : 2;
            }
          }
        }
        // High-res anti-aliased glyph & stroke classification: preserve smooth font edges without 0.84 opacity bloating or pb[] grey halos
        const isHighResDiff = (t === 1 || t === 2)
          ? (maxChDiff > 10 || diffAB > 8 || (ia < 12 && ib >= 8) || (ib < 12 && ia >= 8))
          : false;
        if (isHighResDiff) {
          const tintCls = (typeof CompareMemoryGuard !== 'undefined' && CompareMemoryGuard && CompareMemoryGuard.classifyDiffPixelTint)
            ? CompareMemoryGuard.classifyDiffPixelTint(pa[i], pa[i + 1], pa[i + 2], pb[i], pb[i + 1], pb[i + 2], 10, S.tintA, S.tintB)
            : 0;
          const redDomA = (tintCls === 1) || ((pa[i] - pa[i + 1] > 75) && (pa[i] - pb[i] > 10));
          const grnDomB = (tintCls === 2) || ((pb[i + 1] - pb[i] > 60) && (pb[i + 1] - pa[i + 1] > 10));
          const isA = redDomA ? true : (grnDomB ? false : (ia >= ib));
          if (isA) {
            o32[pIdx] = lA ? lutA[ia] : ((ib >= 8 && lB) ? lutB[ib] : bg32);
          } else {
            o32[pIdx] = lB ? lutB[ib] : ((ia >= 8 && lA) ? lutA[ia] : bg32);
          }
        } else if (!lC || (ia < 8 && ib < 8)) {
          o32[pIdx] = bg32;
        } else if (useCustomCommonLUT) {
          const maxInk = ia > ib ? ia : ib;
          o32[pIdx] = lutC[maxInk];
        } else if (paper) {
          if (darkSub) {
            const maxInk = ia > ib ? ia : ib;
            const v = Math.max(24, Math.round(255 - Math.min(230, Math.pow(maxInk / 255, 1.05) * 228)));
            o32[pIdx] = pk(v, v, Math.min(255, v + 8));
          } else if (paperColorScale >= 0.999) {
            o32[pIdx] = pk(pb[i], pb[i + 1], pb[i + 2]);
          } else {
            o32[pIdx] = pk(Math.round(255 - (255 - pb[i]) * paperColorScale), Math.round(255 - (255 - pb[i + 1]) * paperColorScale), Math.round(255 - (255 - pb[i + 2]) * paperColorScale));
          }
        } else if (darkSub && m === 'over') {
          const rC = Math.min(255, Math.round(18 + Math.max(pa[i], pb[i]) * 0.65));
          const gC = Math.min(255, Math.round(22 + Math.max(pa[i + 1], pb[i + 1]) * 0.65));
          const bC = Math.min(255, Math.round(20 + Math.max(pa[i + 2], pb[i + 2]) * 0.65));
          o32[pIdx] = pk(rC, gC, bC);
        } else {
          const maxInk = ia > ib ? ia : ib;
          const R = Math.round(8 + Math.pow(maxInk / 255, 1.05) * dim);
          o32[pIdx] = pk(R, R + 4, R + 2);
        }
      }
    }
    x.putImageData(o, 0, 0);
    hq._lastKey = sharpenKey;
    hq._lastZoomK = k0; hq.style.display = 'block';
    if (window.UIRibbon && window.UIRibbon.updateCurtainClip) window.UIRibbon.updateCurtainClip();
  }
  let lastT = '';
  new MutationObserver(() => { if (stg.style.transform !== lastT) { lastT = stg.style.transform; kick(85, false); } }).observe(stg, { attributes: true, attributeFilter: ['style'] });
  // #cv updates are handled synchronously via window.rpAfterPaint without delayed MutationObserver microtasks
  ['lA', 'lB', 'lC'].forEach(id => { const e = $('#' + id); e && e.addEventListener('change', () => kick(60, false)); });
  addEventListener('resize', () => kick(160, false));
  window.rpSharpen = sharpen;
  window.rpCancelSharpen = () => {
    cancelHqTasks();
    hqTok++;
    clearTimeout(hqT);
    hq.style.display = 'none';
    hq.width = 0;
    hq.height = 0;
    hq._cropA = null;
    hq._cropB = null;
    hq._lastKey = '';
    _sharedHqImgData = null;
    if (typeof CompareMemoryGuard !== 'undefined' && CompareMemoryGuard && CompareMemoryGuard.releaseCropCanvases) {
      CompareMemoryGuard.releaseCropCanvases(_cropCanvases);
    } else {
      for (const ck of Object.keys(_cropCanvases)) {
        if (_cropCanvases[ck]) { _cropCanvases[ck].width = 0; _cropCanvases[ck].height = 0; }
      }
    }
  };

  // ---------- Resizable / collapsible side panels ----------
  function resizable(panel, key) {
    const h = el('div', { className: 'rp-resize', title: 'Drag to resize. Double-click or Ctrl+B to collapse/expand.' });
    panel.style.position = 'relative';
    panel.appendChild(h);
    const w0 = +safeGet(key, 0); if (w0 >= 200) panel.style.width = w0 + 'px';
    h.onpointerdown = e => {
      e.preventDefault(); h.setPointerCapture(e.pointerId);
      const x0 = e.clientX, w = panel.classList.contains('rp-collapsed') ? (w0 >= 200 ? w0 : 330) : (panel.offsetWidth || 330);
      let dragged = false, rafId = 0;
      h.onpointermove = ev => {
        if (Math.abs(ev.clientX - x0) < 4 && !dragged) return;
        dragged = true;
        const cx = ev.clientX;
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          panel.classList.remove('rp-collapsed');
          const nw = Math.max(220, Math.min(innerWidth * .5, w + x0 - cx));
          panel.style.width = nw + 'px';
        });
      };
      h.onpointerup = () => {
        h.onpointermove = null;
        if (dragged && !panel.classList.contains('rp-collapsed') && panel.offsetWidth >= 200) {
          safeSet(key, panel.offsetWidth);
          dispatchEvent(new Event('resize'));
        }
      };
    };
    h.ondblclick = () => { panel.classList.toggle('rp-collapsed'); dispatchEvent(new Event('resize')); };
  }
  document.querySelectorAll('#view-compare aside, #etools').forEach((a, i) => resizable(a, 'asideW' + i));

  // ---------- Bottom status-bar scale/unit toggle, memory telemetry pill, and shortcut status ----------
  const status = el('div', { id: 'rp-top-status', className: 'rp-footer-status' }, `
    <span id="rp-shortcut-hint" hidden style="display:none !important"></span>
    <span id="rp-mem-pill" class="rp-status-chip" style="cursor:pointer" title="Click to run Smart Memory Purge (Ctrl+Shift+M)">Memory: 0 KB / 768 MB (Optimal)</span>
    <span id="rp-cal-badge" class="rp-status-chip" style="cursor:pointer" title="Click to toggle IPC English (mils/in) vs IPC Metric (mm/µm) · Shortcut: U"><i data-ic="calibrate"></i><b id="rp-cal-txt">Units: mil (IPC English)</b></span>`);
  if (typeof hydrateIcons === 'function') hydrateIcons(status);
  const mountFooterStatus = () => {
    const isEdit = document.body.dataset.view === 'edit';
    const foot = document.querySelector(isEdit ? '#view-edit > footer' : '#view-compare > footer')
      || document.querySelector('footer');
    if (foot && status.parentElement !== foot) {
      const ref = foot.querySelector(isEdit ? '#esz' : '#pos');
      foot.insertBefore(status, ref || null);
    }
  };
  mountFooterStatus();
  if (typeof window.setView === 'function' && !window.setView.__rpFooterWrapped) {
    const _origSetView = window.setView;
    const wrappedSetView = function (v) {
      const r = _origSetView.apply(this, arguments);
      mountFooterStatus();
      return r;
    };
    wrappedSetView.__rpFooterWrapped = true;
    window.setView = wrappedSetView;
  }
  if (typeof hydrateIcons === 'function') hydrateIcons(status);
  const memPillEl = status.querySelector('#rp-mem-pill');
  if (memPillEl) {
    memPillEl.onclick = () => {
      if (window.SmartManager && typeof window.SmartManager.smartPurgeMemory === 'function') {
        window.SmartManager.smartPurgeMemory();
      }
    };
  }
  const calBadgeEl = status.querySelector('#rp-cal-badge');
  if (calBadgeEl) {
    calBadgeEl.onclick = () => {
      if (window.setUnitSystem && window.CAMState) {
        window.setUnitSystem(window.CAMState.unitSystem === 'english' ? 'metric' : 'english');
      }
    };
  }
  document.querySelectorAll('[data-enh]').forEach(b => b.onclick = () => setEnh(b.dataset.enh));
  setEnh('off', true);
  const hintEl = status.querySelector('#rp-shortcut-hint');
  if (hintEl) {
    hintEl.hidden = true; hintEl.style.display = 'none';
    hintEl.onclick = () => { if (window.showKeyboardHUD) window.showKeyboardHUD(); };
  }

  // ---------- Help centre ----------
  function help() {
    if (window.showQuickGuideModal) return window.showQuickGuideModal('all');
    const d = el('div', { className: 'rp-modal' }, `<div class="rp-card rp-wide"><h2>Kensho Pro Help</h2><p class="rp-sub">Kensho Studio &middot; textportdocx.in &middot; Version 1.2.3.2</p>
    <div class="rp-scroll rp-grid">
    <section><h4>Compare &amp; Auto-Align</h4><p>Open Base (Rev A) and Revised (Rev B). Use Auto-Align or 3-Point Fiducial Snap. N / F3 and P / Shift+F3 jump between defects.</p></section>
    <section><h4>60 FPS Split Curtain</h4><p>Toggle Split Curtain in View &amp; Enhance (or Mode selector, shortcut C) and drag the divider handle to reveal Rev A on the left and Rev B on the right.</p></section>
    <section><h4>PCB CAM &amp; IPC English / Metric</h4><p>Full Gerber RS-274X, Excellon NC Drill &amp; Rout, and IPC-D-356 Netlist inspection. Switch between IPC English (mils/in) and Metric (mm/µm) with shortcut U.</p></section>
    <section><h4>Measure (OSNAP) &amp; BOM</h4><p>Calibrate scale against any known dimension, then measure point-to-point distances, cumulative polylines, closed polygon areas, and BOM tallies (shortcut O toggles OSNAP).</p></section>
    <section><h4>Markups &amp; Crypto Stamps</h4><p>Draw ANSI/ISO scalloped revision clouds (Δ Rev), leader callout arrows, and dynamic stamps with SHA-256 document hashes.</p></section>
    <section><h4>Inspection Optics</h4><p>Press L for the 4x Magnifier Loupe, G for the calibrated Reference Grid, and X for the full-viewport Precision Crosshair.</p></section>
    <section><h4>Audit Reports &amp; Sessions</h4><p>Save your review state to a .redline file, export CSV defect checklists, or generate a multi-page Executive Audit PDF.</p></section>
    <section><h4>Zero Telemetry Privacy</h4><p>100% client-side execution. No cloud uploads, no accounts, no network requests.</p></section></div>
    <div class="rp-btns"><button id="rp-hk">Keyboard Shortcuts (?)</button><button id="rp-tv">License</button><button class="rp-primary" id="rp-hc">Close</button></div></div>`);
    document.body.appendChild(d); d.onclick = e => { if (e.target === d) d.remove(); };
    d.querySelector('#rp-hc').onclick = () => d.remove();
    d.querySelector('#rp-tv').onclick = () => { d.remove(); showTerms(); };
    d.querySelector('#rp-hk').onclick = () => { d.remove(); if (window.showKeyboardHUD) window.showKeyboardHUD(); };
  }
  window.rpHelp = help;

  // =========================================================================
  // KENSHO PRO 1.0 INTERACTIVE OVERLAY ENGINE (#rp-ov, Loupe, Grid, OSNAP)
  // =========================================================================
  const rpOv = el('canvas', { id: 'rp-ov', style: 'position:absolute;left:0;top:0;pointer-events:none;z-index:4;' });
  stg.appendChild(rpOv);

  const vpHud = el('canvas', { id: 'rp-hud', style: 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:12;' });
  vp.appendChild(vpHud);

  const RM = {
    activeTool: null, // 'calibrate'|'dist'|'poly'|'area'|'tally'|'cloud'|'leader'|'pen'|'pin'|'eraser'|'redact'|'stamp'
    osnapEnabled: true,
    loupeEnabled: false,
    gridEnabled: false,
    crosshairEnabled: false,
    stampType: 'APPROVED',
    docHash: 'A3F8E902B1764D5C',
    strokeWidth: 3,
    strokeColor: '#e11d48',
    opacity: 1.0,
    dash: 'solid',
    cloudRevText: 'Δ Rev 2',
    pinSize: 24,
    nextPinNum: 1,
    eraserRadius: 20,
    eraserMode: 'object',
    toolSettings: {
      pen: { size: 3, color: '#e11d48', dash: 'solid', opacity: 100 },
      cloud: { size: 2.5, color: '#ef4444', dash: 'solid', opacity: 100 },
      leader: { size: 2, color: '#ef4444', dash: 'solid', opacity: 100 },
      pin: { size: 24, color: '#f59e0b', dash: 'solid', opacity: 100 },
      eraser: { size: 20 },
      dist: { size: 2, color: '#06b6d4', dash: 'solid', opacity: 100 },
      poly: { size: 2.2, color: '#3b82f6', dash: 'solid', opacity: 100 },
      area: { size: 2, color: '#10b981', dash: 'solid', opacity: 100 }
    },
    points: [],
    uncommittedAnns: [],
    uncommittedTallies: [],
    uncommittedIgnores: [],
    rewindBuffer: [],
    cursorImg: { x: 0, y: 0 },
    cursorScreen: { x: -1, y: -1 },
    currentSnap: null,
    annotations: [],
    calibrator: (typeof MeasureEngine !== 'undefined') ? new MeasureEngine.CalibrationManager() : null,
    osnap: (typeof MeasureEngine !== 'undefined') ? new MeasureEngine.OSNAPManager(10) : null,
    tally: (typeof MeasureEngine !== 'undefined') ? new MeasureEngine.TallyManager() : null
  };
  window.RP_MEASURE = RM;

  if (RM.calibrator) {
    RM.calibrator.loadSaved();
    // Always start fresh on native scale until the user explicitly calibrates the current drawing
    RM.calibrator.calibrated = false;
  }

  function syncNativeCalibratorScale() {
    if (!RM.calibrator || RM.calibrator.calibrated) return;
    const baseDpi = (S && S.cur && S.cur.dpi) ? S.cur.dpi : ((S && S.preview && S.preview.dpi) ? S.preview.dpi : (+($('#dpi') && $('#dpi').value) || 300));
    const effDpi = (window.CAMState && typeof window.CAMState.getEffectiveDpi === 'function')
      ? window.CAMState.getEffectiveDpi(baseDpi)
      : baseDpi;
    const isMet = window.CAMState ? window.CAMState.unitSystem === 'metric' : (RM.calibrator.unit === 'mm');
    const u = RM.calibrator.unit || (isMet ? 'mm' : 'mils');
    RM.calibrator.unit = u;
    RM.calibrator.pxPerUnit = u === 'mm' ? (effDpi / 25.4) : u === 'in' ? effDpi : u === 'um' ? (effDpi / 25400) : (effDpi / 1000);
  }
  window.rpSyncNativeCalibrator = syncNativeCalibratorScale;

  function updateCalBadge() {
    const b = $('#rp-cal-txt') || $('#rp-cal-badge');
    if (b && RM.calibrator) {
      syncNativeCalibratorScale();
      const isMet = window.CAMState ? window.CAMState.unitSystem === 'metric' : (RM.calibrator.unit === 'mm' || RM.calibrator.unit === 'um');
      const unitLbl = isMet ? 'mm (IPC Metric)' : 'mil (IPC English)';
      const calTag = RM.calibrator.calibrated ? ' [Calibrated]' : '';
      b.textContent = `Units: ${unitLbl} · ${(1 / Math.max(1e-6, RM.calibrator.pxPerUnit)).toFixed(isMet ? 3 : 2)} ${RM.calibrator.unit}/px${calTag}`;
    }
  }
  window.rpUpdateCalBadge = updateCalBadge;
  updateCalBadge();

  function updateCompareToolOptionsUI(tool) {
    const activeTool = tool !== undefined ? tool : RM.activeTool;
    const showOpts = true;
    if ($('#rib-cmp-tool-opts')) $('#rib-cmp-tool-opts').hidden = false;

    const t = activeTool || 'pen';
    const isEraser = t === 'eraser';
    const isPin = t === 'pin';
    const isStroke = !isEraser && !isPin;

    if ($('#rib-mk-pen-presets')) $('#rib-mk-pen-presets').hidden = !isStroke;
    if ($('#rib-mk-eraser-presets')) $('#rib-mk-eraser-presets').hidden = !isEraser;
    if ($('#rib-mk-pin-presets')) $('#rib-mk-pin-presets').hidden = !isPin;
    if ($('#rib-mk-style-row')) $('#rib-mk-style-row').hidden = isEraser;
    if ($('#rib-mk-revtxt')) $('#rib-mk-revtxt').hidden = (t !== 'cloud');
    if ($('#rib-mk-dash')) $('#rib-mk-dash').hidden = isPin;

    const lbl = $('#rib-mk-size-lbl');
    if (lbl) {
      if (isEraser) lbl.textContent = 'Radius (px)';
      else if (isPin) lbl.textContent = 'Pin (px)';
      else if (t === 'pen') lbl.textContent = 'Pen (px)';
      else lbl.textContent = 'Stroke (px)';
    }

    const cap = $('#rib-mk-opts-cap');
    if (cap) {
      const capMap = {
        pen: 'Freehand Pen Options (Thickness, Colour, Opacity & Dash)',
        eraser: 'Eraser Options (Mode & Brush Radius)',
        pin: 'Pin Marker Options (Badge Size & Colour)',
        cloud: 'Revision Cloud Options (Thickness, Delta Label & Colour)',
        leader: 'Leader Callout Options (Stroke Width & Colour)',
        redact: 'Redaction Box Options'
      };
      cap.title = capMap[t] || 'Pen, Pin & Eraser Tool Options';
      cap.textContent = 'Style';
    }

    const cfg = RM.toolSettings[t] || {};
    const curSz = isEraser ? (cfg.size || RM.eraserRadius || 20) : isPin ? (cfg.size || RM.pinSize || 24) : (cfg.size || RM.strokeWidth || 3);
    if ($('#rib-mk-size')) $('#rib-mk-size').value = curSz;
    if (isEraser) RM.eraserRadius = curSz;
    else if (isPin) RM.pinSize = curSz;
    else RM.strokeWidth = curSz;

    if (activeTool && cfg.color && !isEraser) {
      RM.strokeColor = cfg.color;
      if ($('#rib-mk-color')) $('#rib-mk-color').value = cfg.color;
      const low = String(cfg.color).toLowerCase();
      document.querySelectorAll('#rib-mk-swatches .rp-swatch').forEach(b => b.classList.toggle('on', (b.dataset.col || '').toLowerCase() === low));
    }
    if (activeTool && cfg.opacity != null && !isEraser) {
      RM.opacity = Math.max(0.1, Math.min(1.0, cfg.opacity / 100));
      if ($('#rib-mk-op')) $('#rib-mk-op').value = Math.round(RM.opacity * 100);
    }
    if (activeTool && cfg.dash && !isEraser && !isPin) {
      RM.dash = cfg.dash;
      if ($('#rib-mk-dash')) $('#rib-mk-dash').value = cfg.dash;
    }

    const roundSz = Math.round(curSz);
    document.querySelectorAll('#rib-mk-pen-presets .rp-cmp-sz').forEach(b => b.classList.toggle('on', +b.dataset.sz === roundSz));
    document.querySelectorAll('#rib-mk-eraser-presets .rp-cmp-er').forEach(b => b.classList.toggle('on', +b.dataset.er === roundSz));
    document.querySelectorAll('#rib-mk-pin-presets .rp-cmp-pin').forEach(b => b.classList.toggle('on', +b.dataset.psz === roundSz));
  }
  window.rpUpdateCompareToolOptionsUI = updateCompareToolOptionsUI;

  function setCompareToolSize(val) {
    const v = Math.max(1, Math.min(120, +val || 1));
    const t = RM.activeTool || 'pen';
    RM.toolSettings[t] = RM.toolSettings[t] || {};
    RM.toolSettings[t].size = v;
    if (t === 'eraser') RM.eraserRadius = v;
    else if (t === 'pin') RM.pinSize = v;
    else RM.strokeWidth = v;
    updateCompareToolOptionsUI(t);
    redrawOverlay();
  }
  window.rpSetCompareToolSize = setCompareToolSize;

  function setActiveTool(tool, label = '', btnId = null) {
    if (tool && S && S.ignMode) {
      S.ignMode = false;
      if ($('#ignBtn')) $('#ignBtn').classList.remove('on');
      if ($('#rib-ignore')) $('#rib-ignore').classList.remove('on');
      vp.classList.remove('ign');
    }
    RM.activeTool = tool;
    RM.points = [];
    document.querySelectorAll('[data-rptool]').forEach(b => {
      if (btnId) b.classList.toggle('on', b.id === btnId && !!tool);
      else b.classList.toggle('on', b.dataset.rptool === tool && (!label || b.textContent.includes(label.split(' ')[0])));
    });
    updateCompareToolOptionsUI(tool);
    const pill = $('#rp-active-tool-pill');
    const pillName = $('#rp-active-tool-name');
    const finBtn = $('#rp-finish-tool-btn');
    if (pill && pillName) {
      if (tool) {
        pill.hidden = false;
        if (finBtn) finBtn.hidden = false;
        pillName.textContent = `Active: ${label ? label.split('(')[0].trim() : tool.toUpperCase()} · Right-click for Done / Rewind / Cancel`;
      } else if (!(S && S.ignMode)) {
        pill.hidden = true;
      }
    }
    vp.style.cursor = (tool || (S && S.ignMode)) ? 'crosshair' : '';
    redrawOverlay();
  }
  window.rpSetActiveTool = setActiveTool;
  RM.setTool = setActiveTool;

  function reformatAllMeasurementAnnotations() {
    const cal = RM.calibrator;
    if (!cal || typeof MeasureEngine === 'undefined') return;
    for (const a of (RM.annotations || [])) {
      if (a.kind === 'dist' && a.pts && a.pts.length >= 2) {
        const dPx = MeasureEngine.calcDistance(a.pts[0], a.pts[1]);
        a.label = cal.formatDistance(dPx);
      } else if (a.kind === 'poly' && a.pts && a.pts.length >= 2) {
        const lenPx = MeasureEngine.calcPolylineLength(a.pts);
        a.label = `Σ = ${cal.formatDistance(lenPx)}`;
      } else if (a.kind === 'area' && a.pts && a.pts.length >= 3) {
        const areaPx = MeasureEngine.calcPolygonArea(a.pts);
        const perimPx = MeasureEngine.calcPolylineLength([...a.pts, a.pts[0]]);
        a.label = `${cal.formatArea(areaPx)} (P: ${cal.formatDistance(perimPx)})`;
      }
    }
    redrawOverlay();
    if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
  }
  window.rpReformatMeasurements = reformatAllMeasurementAnnotations;

  function rebuildOSNAPFeatures() {
    if (!RM.osnap) return;
    RM.osnap.clear();
    const cv = $('#cv');
    if (cv && cv.width > 0 && cv.height > 0) {
      RM.osnap.addRect(0, 0, cv.width, cv.height);
    }
    if (S && S.cur && S.cur.regions) {
      const maxReg = Math.min(200, S.cur.regions.length);
      for (let i = 0; i < maxReg; i++) {
        const r = S.cur.regions[i];
        RM.osnap.addRect(r.x, r.y, r.w, r.h);
      }
    }
    const curPage = (S && S.n) || 1;
    for (const a of RM.annotations) {
      if (a.page != null && a.page !== curPage) continue;
      if (a.pts) {
        for (let i = 0; i < a.pts.length; i++) {
          RM.osnap.addPoint(a.pts[i].x, a.pts[i].y, 'endpoint');
          if (i + 1 < a.pts.length) {
            RM.osnap.addLine(a.pts[i].x, a.pts[i].y, a.pts[i + 1].x, a.pts[i + 1].y);
          }
        }
      }
    }
    if (typeof window.registerActiveDXFOSNAP === 'function' && S && ((S.A && S.A.isNativeDXF) || (S.B && S.B.isNativeDXF))) {
      window.registerActiveDXFOSNAP();
    }
  }

  function drawOverlayToContext(ctx, k, sheetW, sheetH) {
    const safeK = Math.max(0.05, Number.isFinite(k) && k > 0 ? k : 1);
    if (RM.gridEnabled) {
      ctx.save();
      const stepPx = Math.max(25, Math.round((RM.calibrator ? RM.calibrator.pxPerUnit * (RM.calibrator.unit === 'mils' ? 200 : 10) : 50)));
      const isDarkBg = (S && (S.mode === 'over' || S.mode === 'diff' || (S.cur && S.cur.isDarkSubstrate))) || safeGet('enh', 'off') === 'blue';
      ctx.strokeStyle = isDarkBg ? 'rgba(56, 189, 248, 0.38)' : 'rgba(2, 132, 199, 0.35)';
      ctx.lineWidth = 1 / safeK;
      ctx.beginPath();
      for (let x = 0, i = 0; x <= sheetW; x += stepPx, i++) {
        if (i % 5 === 0) continue;
        ctx.moveTo(x, 0); ctx.lineTo(x, sheetH);
      }
      for (let y = 0, j = 0; y <= sheetH; y += stepPx, j++) {
        if (j % 5 === 0) continue;
        ctx.moveTo(0, y); ctx.lineTo(sheetW, y);
      }
      ctx.stroke();
      ctx.strokeStyle = isDarkBg ? 'rgba(56, 189, 248, 0.65)' : 'rgba(2, 132, 199, 0.62)';
      ctx.lineWidth = 1.6 / safeK;
      ctx.beginPath();
      for (let x = 0; x <= sheetW; x += stepPx * 5) { ctx.moveTo(x, 0); ctx.lineTo(x, sheetH); }
      for (let y = 0; y <= sheetH; y += stepPx * 5) { ctx.moveTo(0, y); ctx.lineTo(sheetW, y); }
      ctx.stroke();
      ctx.restore();
    }

    const curPage = (S && S.n) || 1;
    for (const a of RM.annotations) {
      if (a.page == null || a.page === curPage) {
        renderSingleAnnotation(ctx, a, safeK);
      }
    }

    if (RM.tally && RM.tally.items.length) {
      RM.tally.drawBadges(ctx, curPage, safeK);
    }

    if (window.UIRibbon && window.UIRibbon.FiducialAligner && window.UIRibbon.FiducialAligner.active) {
      const FA = window.UIRibbon.FiducialAligner;
      const drawFid = (pt, i, col, tag) => {
        ctx.save();
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.lineWidth = 2 / safeK;
        const r = 10 / safeK;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pt.x - r * 1.4, pt.y); ctx.lineTo(pt.x + r * 1.4, pt.y);
        ctx.moveTo(pt.x, pt.y - r * 1.4); ctx.lineTo(pt.x, pt.y + r * 1.4);
        ctx.stroke();
        ctx.font = `700 ${12 / safeK}px "Segoe UI", system-ui, sans-serif`;
        ctx.fillText(`${tag}${i + 1}`, pt.x + r * 1.3, pt.y - r * 0.8);
        ctx.restore();
      };
      FA.pointsA.forEach((p, i) => drawFid(p, i, '#ef4444', 'A'));
      FA.pointsB.forEach((p, i) => drawFid(p, i, '#22c55e', 'B'));
    }

    // Render CAM Net Tracer highlighted nodes & BOM Centroid pins with accurate physical-to-canvas coordinate transform
    if (window.UIRibbon && window.UIRibbon.CAMState) {
      const CS = window.UIRibbon.CAMState;
      const gbr = CS.parsedGerberB || CS.parsedGerberA;
      const sb = CS.activeSharedBoundsInches || ((gbr && isFinite(gbr.bounds.minX)) ? {
        minX: gbr.toInches(gbr.bounds.minX),
        maxX: gbr.toInches(gbr.bounds.maxX),
        minY: gbr.toInches(gbr.bounds.minY),
        maxY: gbr.toInches(gbr.bounds.maxY)
      } : { minX: 0, maxX: 2.5, minY: 0, maxY: 1.5 });
      const bw = Math.max(1e-4, sb.maxX - sb.minX);
      const bh = Math.max(1e-4, sb.maxY - sb.minY);
      const pad = 36 * (sheetW / 1100);
      const tw = Math.max(10, sheetW - pad * 2);
      const th = Math.max(10, sheetH - pad * 2);
      const sc = Math.min(tw / bw, th / bh);
      const ox = pad + (tw - bw * sc) / 2;
      const oy = pad + (th - bh * sc) / 2;
      const effMirrorX = (typeof CS.isActiveLayerMirroredX === 'function') ? CS.isActiveLayerMirroredX(curPage) : !!CS.mirrorX;
      const mapBoardInchesToPx = (xIn, yIn) => {
        const normX = effMirrorX ? (sb.maxX - (xIn - sb.minX)) : xIn;
        const normY = CS.mirrorY ? (sb.maxY - (yIn - sb.minY)) : yIn;
        return {
          x: ox + (normX - sb.minX) * sc,
          y: sheetH - (oy + (normY - sb.minY) * sc)
        };
      };
      if (CS.highlightedNodes && CS.highlightedNodes.length > 0) {
        ctx.save();
        ctx.strokeStyle = '#fbbf24';
        ctx.fillStyle = 'rgba(251, 191, 36, 0.28)';
        ctx.lineWidth = 2.5 / safeK;
        for (const n of CS.highlightedNodes) {
          const xIn = n.xIn != null ? n.xIn : ((n.x || 0) / 1000);
          const yIn = n.yIn != null ? n.yIn : ((n.y || 0) / 1000);
          const { x: nx, y: ny } = mapBoardInchesToPx(xIn, yIn);
          const r = 12 / safeK;
          ctx.beginPath();
          ctx.arc(nx, ny, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#fef08a';
          ctx.font = `700 ${11.5 / safeK}px Consolas, monospace`;
          const netLbl = (n.net || n.netName || 'NET') + (n.refDes ? ` (${n.refDes}-${n.pin || 1})` : '');
          ctx.fillText(netLbl, nx + r + 4 / safeK, ny + 3 / safeK);
          ctx.fillStyle = 'rgba(251, 191, 36, 0.28)';
        }
        ctx.restore();
      }
      if (CS.showBOMOverlay && CS.bomItems && CS.bomItems.length > 0) {
        ctx.save();
        for (const item of CS.bomItems) {
          const xIn = item.xIn != null ? item.xIn : ((item.xMil != null ? item.xMil : (item.x || 0)) / 1000);
          const yIn = item.yIn != null ? item.yIn : ((item.yMil != null ? item.yMil : (item.y || 0)) / 1000);
          const { x: bx, y: by } = mapBoardInchesToPx(xIn, yIn);
          const isTarget = CS.highlightedRefDes === item.refDes;
          const col = isTarget ? '#22c55e' : '#38bdf8';
          const r = (isTarget ? 12 : 7) / safeK;
          ctx.strokeStyle = col;
          ctx.fillStyle = isTarget ? 'rgba(34, 197, 94, 0.30)' : 'rgba(56, 189, 248, 0.18)';
          ctx.lineWidth = (isTarget ? 2.5 : 1.5) / safeK;
          ctx.beginPath();
          ctx.arc(bx, by, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = col;
          ctx.font = `700 ${(isTarget ? 12 : 10.5) / safeK}px Consolas, monospace`;
          ctx.fillText(`${item.refDes}${item.value ? ' (' + item.value + ')' : ''}`, bx + r + 3 / safeK, by + 3 / safeK);
        }
        ctx.restore();
      }
    }

    if (RM.activeTool === 'eraser' && RM.cursorScreen.x >= 0) {
      ctx.save();
      const erR = (RM.eraserRadius || 20) / safeK;
      ctx.beginPath();
      ctx.arc(RM.cursorImg.x, RM.cursorImg.y, Math.max(4 / safeK, erR), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
      ctx.fill();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.6 / safeK;
      ctx.setLineDash([4 / safeK, 3 / safeK]);
      ctx.stroke();
      ctx.restore();
    }

    if (RM.activeTool && RM.points.length > 0) {
      const previewPts = [...RM.points, RM.cursorImg];
      renderInProgressPreview(ctx, RM.activeTool, previewPts, safeK);
    }

    if (RM.osnapEnabled && RM.currentSnap && RM.currentSnap.type && RM.osnap) {
      RM.osnap.drawSnapMarker(ctx, RM.currentSnap, safeK);
    }
  }

  window.drawOverlayToSheetCanvas = function(targetCtx, scale = 1) {
    const cv = $('#cv');
    if (!targetCtx || !cv || !cv.width || !cv.height) return;
    targetCtx.save();
    if (scale !== 1) targetCtx.scale(scale, scale);
    drawOverlayToContext(targetCtx, 1, cv.width, cv.height);
    targetCtx.restore();
  };

  function redrawOverlay() {
    const cv = $('#cv');
    if (!cv || !cv.width || !cv.height) return;
    const ctx = rpOv.getContext('2d');
    const k = Math.max(0.05, (S && S.view && S.view.k) ? S.view.k : 1);
    const vx = (S && S.view && S.view.x) || 0;
    const vy = (S && S.view && S.view.y) || 0;
    const dpr = Math.max(DPR(), 2.0);
    const vpW = (vp && vp.clientWidth) || 0;
    const vpH = (vp && vp.clientHeight) || 0;

    // Render #rp-ov in native viewport HiDPI space (matching #mk) so measurement tags & markups are 100% razor-sharp at every zoom!
    if (vpW > 10 && vpH > 10) {
      const targetW = Math.max(1, Math.round(vpW * dpr));
      const targetH = Math.max(1, Math.round(vpH * dpr));
      if (rpOv.width !== targetW || rpOv.height !== targetH) {
        rpOv.width = targetW;
        rpOv.height = targetH;
      }
      rpOv.style.width = vpW + 'px';
      rpOv.style.height = vpH + 'px';
      rpOv.style.transformOrigin = '0 0';
      rpOv.style.transform = `translate(${-vx / k}px, ${-vy / k}px) scale(${1 / k})`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, rpOv.width, rpOv.height);
      ctx.setTransform(dpr * k, 0, 0, dpr * k, vx * dpr, vy * dpr);
      drawOverlayToContext(ctx, k, cv.width, cv.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      rpOv.style.width = '';
      rpOv.style.height = '';
      rpOv.style.transform = '';
      if (rpOv.width !== cv.width || rpOv.height !== cv.height) {
        rpOv.width = cv.width;
        rpOv.height = cv.height;
      } else {
        ctx.clearRect(0, 0, rpOv.width, rpOv.height);
      }
      drawOverlayToContext(ctx, k, cv.width, cv.height);
    }
  }
  window.rpRedrawOverlay = redrawOverlay;

  function drawPillLabel(ctx, text, x, y, k, bgColor = 'rgba(15, 23, 42, 0.94)', textColor = '#38bdf8') {
    if (!text) return;
    const safeK = Math.max(0.05, Number.isFinite(k) && k > 0 ? k : 1);
    ctx.save();
    ctx.setLineDash([]);
    const fs = 12.5 / safeK;
    ctx.font = `700 ${fs}px "Segoe UI", system-ui, -apple-system, Consolas, sans-serif`;
    const padX = 7.5 / safeK, padY = 4.5 / safeK;
    const tw = ctx.measureText(text).width;
    const bw = tw + padX * 2, bh = fs + padY * 2;
    const bx = x - bw / 2, by = y - bh / 2;
    const r = Math.min(6 / safeK, bh / 2);
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, bw, bh, r);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 1.4 / safeK;
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function applyCompareDash(ctx, dash, lw, k) {
    if (dash === 'dashed') ctx.setLineDash([Math.max(5, lw * 3) / k, Math.max(3, lw * 2) / k]);
    else if (dash === 'dotted') ctx.setLineDash([Math.max(1.5, lw) / k, Math.max(3, lw * 2) / k]);
    else ctx.setLineDash([]);
  }

  function renderSingleAnnotation(ctx, a, k) {
    ctx.save();
    ctx.globalAlpha = a.opacity != null ? a.opacity : 1.0;
    const lw = a.lineWidth || 2.5;
    applyCompareDash(ctx, a.dash, lw, k);

    if (a.kind === 'dist' && a.pts && a.pts.length >= 2) {
      const [p1, p2] = a.pts;
      ctx.strokeStyle = a.color || '#06b6d4';
      ctx.lineWidth = (a.lineWidth || 2) / k;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const r = 4 / k;
      ctx.fillStyle = a.color || '#06b6d4';
      ctx.beginPath(); ctx.arc(p1.x, p1.y, r, 0, Math.PI * 2); ctx.arc(p2.x, p2.y, r, 0, Math.PI * 2); ctx.fill();
      drawPillLabel(ctx, a.label, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2 - 12 / k, k);
    } else if (a.kind === 'poly' && a.pts && a.pts.length >= 2) {
      ctx.strokeStyle = a.color || '#3b82f6';
      ctx.lineWidth = (a.lineWidth || 2.2) / k;
      ctx.beginPath();
      ctx.moveTo(a.pts[0].x, a.pts[0].y);
      for (let i = 1; i < a.pts.length; i++) ctx.lineTo(a.pts[i].x, a.pts[i].y);
      ctx.stroke();
      ctx.setLineDash([]);
      const last = a.pts[a.pts.length - 1];
      drawPillLabel(ctx, a.label, last.x, last.y - 14 / k, k, 'rgba(15, 23, 42, 0.9)', '#60a5fa');
    } else if (a.kind === 'area' && a.pts && a.pts.length >= 2) {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
      ctx.strokeStyle = a.color || '#10b981';
      ctx.lineWidth = (a.lineWidth || 2) / k;
      ctx.beginPath();
      ctx.moveTo(a.pts[0].x, a.pts[0].y);
      for (let i = 1; i < a.pts.length; i++) ctx.lineTo(a.pts[i].x, a.pts[i].y);
      if (a.pts.length >= 3) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const rDot = 4 / k;
      ctx.fillStyle = a.color || '#10b981';
      for (const p of a.pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, rDot, 0, Math.PI * 2);
        ctx.fill();
      }
      const cx = a.pts.reduce((s, p) => s + p.x, 0) / a.pts.length;
      const cy = a.pts.reduce((s, p) => s + p.y, 0) / a.pts.length;
      drawPillLabel(ctx, a.label, cx, a.pts.length === 2 ? cy - 12 / k : cy, k, 'rgba(6, 78, 59, 0.92)', '#34d399');
    } else if (a.kind === 'cloud' && a.pts && a.pts.length >= 2 && typeof MeasureEngine !== 'undefined') {
      ctx.setLineDash([]);
      MeasureEngine.drawRevisionCloud(ctx, a.pts, a.revText != null ? a.revText : 'Δ Rev 2', { color: a.color || '#ef4444', lineWidth: (a.lineWidth || 2.2) / k, scallopSize: 16 / k, zoomScale: k });
    } else if (a.kind === 'leader' && a.pts && a.pts.length >= 2 && typeof MeasureEngine !== 'undefined') {
      ctx.setLineDash([]);
      MeasureEngine.drawLeaderCallout(ctx, a.pts[0], a.pts[1], a.label || 'Engineering Note', { color: a.color || '#ef4444', lineWidth: (a.lineWidth || 2) / k, zoomScale: k });
    } else if (a.kind === 'pen' && a.pts && a.pts.length >= 1) {
      ctx.strokeStyle = a.color || '#e11d48';
      ctx.lineWidth = (a.lineWidth || 3) / k;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(a.pts[0].x, a.pts[0].y);
      if (a.pts.length === 1) ctx.lineTo(a.pts[0].x + 0.1, a.pts[0].y);
      for (let i = 1; i < a.pts.length; i++) ctx.lineTo(a.pts[i].x, a.pts[i].y);
      ctx.stroke();
    } else if (a.kind === 'pin') {
      ctx.setLineDash([]);
      const pSz = (a.size || 24) / k;
      const pH = pSz * 1.25;
      const cx = a.x;
      const tipY = a.y;
      const headCy = tipY - pH + pSz * 0.45;
      const r = pSz * 0.44;
      ctx.fillStyle = a.color || '#f59e0b';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.2 / k, pSz * 0.07);
      ctx.beginPath();
      ctx.arc(cx, headCy, r, Math.PI * 0.82, Math.PI * 0.18, false);
      ctx.lineTo(cx, tipY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${r * 0.95}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(a.pinNum || 1), cx, headCy);
      if (a.label) {
        drawPillLabel(ctx, a.label, cx, headCy - r - 10 / k, k, 'rgba(15, 23, 42, 0.92)', a.color || '#f59e0b');
      }
    } else if (a.kind === 'redact' && a.pts && a.pts.length >= 2) {
      ctx.setLineDash([]);
      const [p1, p2] = a.pts;
      ctx.fillStyle = '#000000';
      ctx.fillRect(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
    } else if (a.kind === 'angle' && a.pts && a.pts.length >= 2) {
      ctx.strokeStyle = a.color || '#8b5cf6';
      ctx.lineWidth = (a.lineWidth || 2.2) / k;
      ctx.beginPath();
      ctx.moveTo(a.pts[0].x, a.pts[0].y);
      ctx.lineTo(a.pts[1].x, a.pts[1].y);
      if (a.pts[2]) ctx.lineTo(a.pts[2].x, a.pts[2].y);
      ctx.stroke();
      ctx.setLineDash([]);
      const vtx = a.pts[1];
      drawPillLabel(ctx, a.label || 'Angle', vtx.x, vtx.y - 14 / k, k, 'rgba(46, 16, 101, 0.92)', '#c4b5fd');
    } else if (a.kind === 'rad3' && a.pts && a.pts.length >= 2) {
      ctx.strokeStyle = a.color || '#0284c7';
      ctx.lineWidth = (a.lineWidth || 2.2) / k;
      if (a.circle && a.circle.r > 0) {
        ctx.beginPath();
        ctx.arc(a.circle.cx, a.circle.cy, a.circle.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        drawPillLabel(ctx, a.label || '⌀ / R', a.circle.cx, a.circle.cy - a.circle.r - 12 / k, k, 'rgba(12, 74, 110, 0.92)', '#7dd3fc');
      } else {
        ctx.beginPath();
        ctx.moveTo(a.pts[0].x, a.pts[0].y);
        for (let i = 1; i < a.pts.length; i++) ctx.lineTo(a.pts[i].x, a.pts[i].y);
        ctx.stroke();
      }
    } else if (a.kind === 'fai') {
      ctx.setLineDash([]);
      const r = (a.size || 24) / (2 * k);
      ctx.fillStyle = 'rgba(220, 38, 38, 0.16)';
      ctx.strokeStyle = a.color || '#dc2626';
      ctx.lineWidth = 2.2 / k;
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = a.color || '#dc2626';
      ctx.font = `700 ${r * 0.92}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(a.charNo || 1), a.x, a.y);
      if (a.label) {
        drawPillLabel(ctx, a.label, a.x, a.y - r - 10 / k, k, 'rgba(127, 29, 29, 0.92)', '#fca5a5');
      }
    } else if (a.kind === 'stamp' && typeof MeasureEngine !== 'undefined') {
      ctx.setLineDash([]);
      MeasureEngine.drawEngineeringStamp(ctx, a.x, a.y, a.stampType, a.reviewer || 'Lead Engineer', a.docHash || RM.docHash);
    }
    ctx.restore();
  }

  function renderInProgressPreview(ctx, tool, pts, k) {
    if (pts.length < 2) return;
    const cal = RM.calibrator;
    const curCol = RM.strokeColor || '#e11d48';
    const curW = RM.strokeWidth || 3;
    const curOp = RM.opacity != null ? RM.opacity : 1.0;
    const curDash = RM.dash || 'solid';
    const curRev = ($('#rib-mk-revtxt') && $('#rib-mk-revtxt').value) || RM.cloudRevText || 'Δ Rev 2';
    if (tool === 'calibrate' || tool === 'dist') {
      const dPx = MeasureEngine.calcDistance(pts[0], pts[1]);
      const lbl = tool === 'calibrate' ? `${dPx.toFixed(1)} px (Click to set scale)` : (cal ? cal.formatDistance(dPx) : `${dPx.toFixed(1)} px`);
      renderSingleAnnotation(ctx, { kind: 'dist', pts, label: lbl, color: curCol, lineWidth: curW }, k);
    } else if (tool === 'poly') {
      const lenPx = MeasureEngine.calcPolylineLength(pts);
      const lbl = `Σ = ${cal ? cal.formatDistance(lenPx) : lenPx.toFixed(1) + ' px'}`;
      renderSingleAnnotation(ctx, { kind: 'poly', pts, label: lbl, color: curCol, lineWidth: curW }, k);
    } else if (tool === 'area') {
      let drawPts = pts;
      if (pts.length === 2 && RM._areaDragging && Math.abs(pts[1].x - pts[0].x) > 4 / k && Math.abs(pts[1].y - pts[0].y) > 4 / k) {
        const [p1, p2] = pts;
        drawPts = [
          { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y) },
          { x: Math.max(p1.x, p2.x), y: Math.min(p1.y, p2.y) },
          { x: Math.max(p1.x, p2.x), y: Math.max(p1.y, p2.y) },
          { x: Math.min(p1.x, p2.x), y: Math.max(p1.y, p2.y) }
        ];
      }
      const areaPx = drawPts.length >= 3 ? MeasureEngine.calcPolygonArea(drawPts) : 0;
      const perimPx = drawPts.length >= 3 ? MeasureEngine.calcPolylineLength([...drawPts, drawPts[0]]) : MeasureEngine.calcDistance(drawPts[0], drawPts[1]);
      const lbl = drawPts.length >= 3
        ? `Area: ${cal ? cal.formatArea(areaPx) : Math.round(areaPx) + ' px²'} | Perim: ${cal ? cal.formatDistance(perimPx) : Math.round(perimPx) + ' px'}`
        : `${cal ? cal.formatDistance(perimPx) : Math.round(perimPx) + ' px'} (Click 3+ vertices or drag box)`;
      renderSingleAnnotation(ctx, { kind: 'area', pts: drawPts, label: lbl, color: curCol, lineWidth: curW }, k);
    } else if (tool === 'cloud') {
      if (pts.length === 2) {
        const [p1, p2] = pts;
        const rectPts = [
          { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y) },
          { x: Math.max(p1.x, p2.x), y: Math.min(p1.y, p2.y) },
          { x: Math.max(p1.x, p2.x), y: Math.max(p1.y, p2.y) },
          { x: Math.min(p1.x, p2.x), y: Math.max(p1.y, p2.y) }
        ];
        renderSingleAnnotation(ctx, { kind: 'cloud', pts: rectPts, revText: curRev, color: curCol, lineWidth: curW, opacity: curOp }, k);
      } else {
        renderSingleAnnotation(ctx, { kind: 'cloud', pts, revText: curRev, color: curCol, lineWidth: curW, opacity: curOp }, k);
      }
    } else if (tool === 'leader') {
      renderSingleAnnotation(ctx, { kind: 'leader', pts: [pts[0], pts[1]], label: 'Callout...', color: curCol, lineWidth: curW, opacity: curOp }, k);
    } else if (tool === 'pen') {
      renderSingleAnnotation(ctx, { kind: 'pen', pts, color: curCol, lineWidth: curW, opacity: curOp, dash: curDash }, k);
    } else if (tool === 'angle') {
      const angRes = (pts.length >= 3 && typeof MeasureEngine !== 'undefined' && MeasureEngine.calc3PointAngle)
        ? MeasureEngine.calc3PointAngle(pts[0], pts[1], pts[2])
        : null;
      const deg = angRes ? angRes.degrees : 0;
      const lbl = pts.length >= 3 ? `∠ ${deg.toFixed(2)}°` : 'Click vertex then 3rd point';
      renderSingleAnnotation(ctx, { kind: 'angle', pts, label: lbl, color: '#8b5cf6', lineWidth: 2.2 }, k);
    } else if (tool === 'rad3') {
      const circRaw = (pts.length >= 3 && typeof MeasureEngine !== 'undefined' && MeasureEngine.calc3PointCircle)
        ? MeasureEngine.calc3PointCircle(pts[0], pts[1], pts[2])
        : null;
      const circ = (circRaw && circRaw.valid) ? circRaw : null;
      const lbl = circ ? (cal ? `⌀ ${cal.formatDistance(circ.diameter)} (R: ${cal.formatDistance(circ.r)})` : `⌀ ${(circ.diameter).toFixed(1)} px`) : 'Click 3 points on arc/circle';
      renderSingleAnnotation(ctx, { kind: 'rad3', pts, circle: circ, label: lbl, color: '#0284c7', lineWidth: 2.2 }, k);
    } else if (tool === 'redact') {
      renderSingleAnnotation(ctx, { kind: 'redact', pts: [pts[0], pts[pts.length - 1]] }, k);
    }
  }

  function renderViewportHUD() {
    const devicePixelRatio = DPR();
    const logicalWidth = vp.clientWidth || 1;
    const logicalHeight = vp.clientHeight || 1;
    const targetW = Math.max(1, Math.round(logicalWidth * devicePixelRatio));
    const targetH = Math.max(1, Math.round(logicalHeight * devicePixelRatio));
    if (vpHud.width !== targetW || vpHud.height !== targetH) {
      vpHud.width = targetW;
      vpHud.height = targetH;
      vpHud.style.width = logicalWidth + 'px';
      vpHud.style.height = logicalHeight + 'px';
    }
    const ctx = vpHud.getContext('2d');
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);

    const sx = RM.cursorScreen.x;
    const sy = RM.cursorScreen.y;

    if (RM.crosshairEnabled && sx >= 0 && sy >= 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 77, 77, 0.65)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(sx, 0); ctx.lineTo(sx, logicalHeight);
      ctx.moveTo(0, sy); ctx.lineTo(logicalWidth, sy);
      ctx.stroke();
      ctx.restore();
    }

    if (RM.loupeEnabled && sx >= 0 && sy >= 0) {
      const cv = $('#cv');
      if (cv && cv.width > 0) {
        const radius = 92;
        const zoom = 4;
        const srcR = radius / (zoom * ((S && S.view && S.view.k) || 1));

        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.clip();

        ctx.fillStyle = '#0a120f';
        ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);

        ctx.imageSmoothingEnabled = false;
        const activeFilter = getComputedStyle(document.documentElement).getPropertyValue('--rp-filter').trim() || 'none';
        ctx.filter = activeFilter;
        const curtainOn = !!(window.UIRibbon && window.UIRibbon.isCurtainActive && window.UIRibbon.isCurtainActive());
        const cvA = $('#cvA');
        if (curtainOn && cvA && cvA.width === cv.width) {
          ctx.drawImage(
            cvA,
            RM.cursorImg.x - srcR, RM.cursorImg.y - srcR, srcR * 2, srcR * 2,
            sx - radius, sy - radius, radius * 2, radius * 2
          );
          const pct = (window.UIRibbon.getCurtainPct ? window.UIRibbon.getCurtainPct() : 50) / 100;
          const splitScreenX = pct * (vp.clientWidth || 1);
          const k = (S && S.view && S.view.k) || 1;
          const splitImgX = (splitScreenX - ((S && S.view && S.view.x) || 0)) / k;
          const relSplit = (splitImgX - (RM.cursorImg.x - srcR)) / (srcR * 2);
          const clipLeft = Math.max(sx - radius, Math.min(sx + radius, sx - radius + relSplit * (radius * 2)));
          if (clipLeft < sx + radius) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(clipLeft, sy - radius, (sx + radius) - clipLeft, radius * 2);
            ctx.clip();
            ctx.drawImage(
              cv,
              RM.cursorImg.x - srcR, RM.cursorImg.y - srcR, srcR * 2, srcR * 2,
              sx - radius, sy - radius, radius * 2, radius * 2
            );
            ctx.restore();
          }
        } else {
          ctx.drawImage(
            cv,
            RM.cursorImg.x - srcR, RM.cursorImg.y - srcR, srcR * 2, srcR * 2,
            sx - radius, sy - radius, radius * 2, radius * 2
          );
        }
        ctx.filter = 'none';
        const mk = $('#mk');
        if (mk && mk.width === cv.width && mk.height === cv.height && $('#lM') && $('#lM').checked) {
          ctx.drawImage(
            mk,
            RM.cursorImg.x - srcR, RM.cursorImg.y - srcR, srcR * 2, srcR * 2,
            sx - radius, sy - radius, radius * 2, radius * 2
          );
        }
        if (rpOv && rpOv.width === cv.width && rpOv.height === cv.height) {
          ctx.drawImage(
            rpOv,
            RM.cursorImg.x - srcR, RM.cursorImg.y - srcR, srcR * 2, srcR * 2,
            sx - radius, sy - radius, radius * 2, radius * 2
          );
        }

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx - radius, sy); ctx.lineTo(sx + radius, sy);
        ctx.moveTo(sx, sy - radius); ctx.lineTo(sx, sy + radius);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff4d4d';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  window.rpAfterPaint = () => {
    kick(60, true);
    if (RM.calibrator && !RM.calibrator.calibrated) {
      syncNativeCalibratorScale();
      updateCalBadge();
    }
    rebuildOSNAPFeatures();
    redrawOverlay();
    if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
    if (window.UIRibbon && window.UIRibbon.updateCurtainClip) window.UIRibbon.updateCurtainClip();
  };

  function getImgCoords(e) {
    const b = vp.getBoundingClientRect();
    const sx = e.clientX - b.left;
    const sy = e.clientY - b.top;
    RM.cursorScreen = { x: sx, y: sy };
    const k = (S && S.view && S.view.k) ? S.view.k : 1;
    const vx = (S && S.view) ? S.view.x : 0;
    const vy = (S && S.view) ? S.view.y : 0;
    const rawX = (sx - vx) / k;
    const rawY = (sy - vy) / k;

    const fidActive = !!(window.UIRibbon && window.UIRibbon.FiducialAligner && window.UIRibbon.FiducialAligner.active);
    if (RM.osnapEnabled && RM.osnap && (RM.activeTool || fidActive) && RM.activeTool !== 'eraser') {
      const snapped = RM.osnap.snap(rawX, rawY, k);
      RM.currentSnap = snapped;
      return { x: snapped.x, y: snapped.y, snapType: snapped.type };
    }
    RM.currentSnap = null;
    return { x: rawX, y: rawY, snapType: null };
  }

  function distToSegmentCmp(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function hitCompareAnnotation(a, x, y, rad) {
    if (a.kind === 'pin') {
      const sz = a.size || 24;
      return Math.hypot(x - a.x, y - (a.y - sz * 0.6)) <= Math.max(rad, sz * 0.75);
    }
    if (a.kind === 'fai') {
      const r = (a.size || 24) / 2;
      return Math.hypot(x - a.x, y - a.y) <= Math.max(rad, r + 4);
    }
    if (a.kind === 'stamp') {
      return x >= a.x - rad && x <= a.x + 210 + rad && y >= a.y - rad && y <= a.y + 76 + rad;
    }
    if (a.kind === 'redact' && a.pts && a.pts.length >= 2) {
      const [p1, p2] = a.pts;
      const x0 = Math.min(p1.x, p2.x), x1 = Math.max(p1.x, p2.x);
      const y0 = Math.min(p1.y, p2.y), y1 = Math.max(p1.y, p2.y);
      return x >= x0 - rad && x <= x1 + rad && y >= y0 - rad && y <= y1 + rad;
    }
    if (a.pts && a.pts.length >= 1) {
      const tol = Math.max(rad, (a.lineWidth || 3) / 2 + 4);
      if (a.pts.length === 1) return Math.hypot(x - a.pts[0].x, y - a.pts[0].y) <= tol;
      for (let i = 0; i < a.pts.length - 1; i++) {
        if (distToSegmentCmp(x, y, a.pts[i].x, a.pts[i].y, a.pts[i + 1].x, a.pts[i + 1].y) <= tol) return true;
      }
      if ((a.kind === 'cloud' || a.kind === 'area') && a.pts.length >= 3) {
        const last = a.pts[a.pts.length - 1];
        if (distToSegmentCmp(x, y, last.x, last.y, a.pts[0].x, a.pts[0].y) <= tol) return true;
      }
    }
    return false;
  }

  function eraseCompareAt(x, y, curPage) {
    const k = (S && S.view && S.view.k) ? S.view.k : 1;
    const rad = (RM.eraserRadius || 20) / k;
    const mode = ($('#rib-mk-eraser-mode') && $('#rib-mk-eraser-mode').value) || RM.eraserMode || 'object';
    let changed = false;

    if (mode === 'brush') {
      const densifyCmpPts = (pts, hitR) => {
        const out = [];
        for (let i = 0; i < pts.length; i++) {
          const p0 = pts[i];
          out.push(p0);
          if (i + 1 < pts.length) {
            const p1 = pts[i + 1];
            const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
            if (segLen > 3 && distToSegmentCmp(x, y, p0.x, p0.y, p1.x, p1.y) <= hitR + 2) {
              const steps = Math.min(40, Math.ceil(segLen / 2.5));
              for (let s = 1; s < steps; s++) {
                const t = s / steps;
                out.push({ x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t });
              }
            }
          }
        }
        return out;
      };
      const nextAnns = [];
      for (const a of RM.annotations) {
        if (a.page != null && a.page !== curPage) { nextAnns.push(a); continue; }
        if (a.kind === 'pen' && Array.isArray(a.pts) && a.pts.length >= 1) {
          const hitR = rad + (a.lineWidth || 3) / 2;
          if (a.pts.length === 1) {
            if (Math.hypot(a.pts[0].x - x, a.pts[0].y - y) <= hitR) changed = true;
            else nextAnns.push(a);
            continue;
          }
          const densePts = densifyCmpPts(a.pts, hitR);
          let seg = [];
          let cut = false;
          for (const p of densePts) {
            if (Math.hypot(p.x - x, p.y - y) <= hitR) {
              cut = true;
              if (seg.length >= 2) nextAnns.push({ ...a, pts: seg });
              seg = [];
            } else {
              seg.push(p);
            }
          }
          if (cut) {
            changed = true;
            if (seg.length >= 2) nextAnns.push({ ...a, pts: seg });
          } else {
            nextAnns.push(a);
          }
        } else if (hitCompareAnnotation(a, x, y, rad)) {
          changed = true;
        } else {
          nextAnns.push(a);
        }
      }
      RM.annotations = nextAnns;
    } else {
      const before = RM.annotations.length;
      RM.annotations = RM.annotations.filter(a => {
        if (a.page != null && a.page !== curPage) return true;
        return !hitCompareAnnotation(a, x, y, rad);
      });
      if (RM.annotations.length !== before) changed = true;
    }

    if (RM.tally && Array.isArray(RM.tally.items)) {
      const hitTally = RM.tally.items.find(it => it.page === curPage && Math.hypot(it.x - x, it.y - y) <= Math.max(rad, 14 / k));
      if (hitTally) {
        RM.tally.removeItem(hitTally.id);
        changed = true;
      }
    }
    return changed;
  }
  window.rpEraseCompareAt = eraseCompareAt;

  let penDown = false;
  let eraseDown = false;
  let erasedInStroke = false;
  let twoPtDragStart = null;
  let _ovRaf = 0, _hudRaf = 0;
  const scheduleRedrawOverlay = () => {
    if (_ovRaf) return;
    _ovRaf = requestAnimationFrame(() => { _ovRaf = 0; redrawOverlay(); });
  };
  const scheduleViewportHUD = () => {
    if (_hudRaf) return;
    _hudRaf = requestAnimationFrame(() => { _hudRaf = 0; renderViewportHUD(); });
  };
  vp.addEventListener('pointermove', e => {
    if (vp.classList.contains('drag') && !RM.activeTool) {
      if (RM.loupeEnabled || RM.crosshairEnabled) {
        const b = vp.getBoundingClientRect();
        RM.cursorScreen = { x: e.clientX - b.left, y: e.clientY - b.top };
        scheduleViewportHUD();
      }
      return;
    }
    const pt = getImgCoords(e);
    RM.cursorImg = { x: pt.x, y: pt.y };
    if (twoPtDragStart && RM.activeTool === 'area' && RM.points.length === 1) {
      const k = (S && S.view && S.view.k) ? S.view.k : 1;
      RM._areaDragging = Math.hypot(pt.x - twoPtDragStart.x, pt.y - twoPtDragStart.y) > 8 / k;
    }

    if (penDown && (RM.activeTool === 'pen' || RM.activeTool === 'redact')) {
      RM.points.push({ x: pt.x, y: pt.y });
    }
    if (eraseDown && RM.activeTool === 'eraser') {
      const curPage = (S && S.n) || 1;
      if (eraseCompareAt(pt.x, pt.y, curPage)) {
        erasedInStroke = true;
        if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      }
    }

    if (RM.calibrator && !RM._posRaf) {
      RM._posRaf = requestAnimationFrame(() => {
        RM._posRaf = 0;
        const posEl = $('#pos');
        if (!posEl || !((S && S.cur) || (S && S.preview) || ($('#cv') && $('#cv').width > 0))) return;
        const cx = RM.cursorImg.x, cy = RM.cursorImg.y;
        const baseDpi = (S && S.cur && S.cur.dpi) ? S.cur.dpi : ((S && S.preview && S.preview.dpi) ? S.preview.dpi : 300);
        const dpi = (window.CAMState && typeof window.CAMState.getEffectiveDpi === 'function')
          ? window.CAMState.getEffectiveDpi(baseDpi)
          : baseDpi;
        const isEng = window.CAMState && window.CAMState.unitSystem === 'english';
        const xMils = (cx / dpi * 1000).toFixed(1), yMils = (cy / dpi * 1000).toFixed(1);
        const xMM = (cx / dpi * 25.4).toFixed(2), yMM = (cy / dpi * 25.4).toFixed(2);
        const coordText = RM.calibrator.calibrated
          ? `X: ${RM.calibrator.formatDistance(cx)}, Y: ${RM.calibrator.formatDistance(cy)}`
          : (isEng ? `X: ${xMils} mil, Y: ${yMils} mil (${xMM}, ${yMM} mm)` : `X: ${xMM} mm, Y: ${yMM} mm (${xMils}, ${yMils} mil)`);
        const snapStr = (RM.currentSnap && RM.currentSnap.type) ? ` [OSNAP: ${RM.currentSnap.type.toUpperCase()}]` : '';
        const zoomPct = (S && S.view) ? Math.round(S.view.k * 100) : 100;
        posEl.textContent = `${coordText} · ${zoomPct}%${snapStr}`;
      });
    }

    if (!penDown && !eraseDown && !vp.classList.contains('drag') && window.RPNotePreview && !RM._hovRaf) {
      RM._hovRaf = requestAnimationFrame(() => {
        RM._hovRaf = 0;
        checkCompareNoteHover(RM.cursorImg.x, RM.cursorImg.y);
      });
    }

    const fidActive = !!(window.UIRibbon && window.UIRibbon.FiducialAligner && window.UIRibbon.FiducialAligner.active);
    if (RM.activeTool || fidActive) scheduleRedrawOverlay();
    if (RM.loupeEnabled || RM.crosshairEnabled) scheduleViewportHUD();
  });

  vp.addEventListener('pointerleave', () => {
    RM.cursorScreen = { x: -1, y: -1 };
    RM.currentSnap = null;
    if (window.RPNotePreview && !window.RPNotePreview.isPinned()) {
      window.RPNotePreview.scheduleHide(140);
    }
    if (RM.osnapEnabled || RM.activeTool === 'eraser') redrawOverlay();
    if (RM.loupeEnabled || RM.crosshairEnabled) renderViewportHUD();
  });

  async function completeTwoPointTool(tool) {
    const cal = RM.calibrator;
    const curPage = (S && S.n) || 1;
    const curCol = RM.strokeColor || '#e11d48';
    const curW = RM.strokeWidth || 3;
    const curOp = RM.opacity != null ? RM.opacity : 1.0;
    const curDash = RM.dash || 'solid';

    if (tool === 'calibrate' && RM.points.length >= 2) {
      const dPx = MeasureEngine.calcDistance(RM.points[0], RM.points[1]);
      if (dPx < 1.5) {
        RM.points.pop();
        return;
      }
      const defUnit = (window.CAMState && window.CAMState.unitSystem === 'english') ? 'mils' : 'mm';
      const estDist = cal ? +(dPx / Math.max(1e-6, cal.pxPerUnit)).toFixed(defUnit === 'mils' ? 1 : 2) : (defUnit === 'mils' ? 100 : 25.4);
      if (window.dialog) {
        const res = await window.dialog('Calibrate Real-World Scale', [
          { type: 'note', label: `Reference line measured ${dPx.toFixed(2)} pixels on sheet.` },
          { type: 'number', id: 'val', label: 'Known Real-World Distance', value: estDist > 0 ? estDist : (defUnit === 'mils' ? 100 : 25.4), min: 0.0001, step: 0.01 },
          { type: 'select', id: 'unit', label: 'Measurement Unit (IPC)', value: defUnit, options: [
            { label: 'Mils / Thou (mil — IPC English)', value: 'mils' },
            { label: 'Inches (in — IPC English)', value: 'in' },
            { label: 'Millimeters (mm — IPC Metric)', value: 'mm' },
            { label: 'Microns (µm — IPC Metric)', value: 'um' }
          ] },
          { type: 'check', id: 'resetNative', label: 'Reset to Native 1:1 Drawing / CAM Scale', value: false }
        ], 'Apply Scale');
        setActiveTool(null);
        if (res && cal) {
          if (res.resetNative) {
            cal.calibrated = false;
            syncNativeCalibratorScale();
            updateCalBadge();
            reformatAllMeasurementAnnotations();
            if (window.renderList) window.renderList();
            if (window.rpToast) window.rpToast('Reset to native 1:1 drawing scale.');
          } else if (parseFloat(res.val) > 0) {
            cal.setCalibration(dPx, parseFloat(res.val), res.unit);
            if (window.setUnitSystem) window.setUnitSystem((res.unit === 'mm' || res.unit === 'um') ? 'metric' : 'english', true, true);
            updateCalBadge();
            reformatAllMeasurementAnnotations();
            if (window.renderList) window.renderList();
            if (window.rpToast) window.rpToast(`Scale Calibrated: ${dPx.toFixed(1)} px = ${res.val} ${res.unit}`);
          }
        }
      } else {
        setActiveTool(null);
      }
    } else if (tool === 'dist' && RM.points.length >= 2) {
      const dPx = MeasureEngine.calcDistance(RM.points[0], RM.points[1]);
      const lbl = cal ? cal.formatDistance(dPx) : `${dPx.toFixed(1)} px`;
      if (window.rpPushCompareHistory) window.rpPushCompareHistory('Distance measurement');
      const _newDist = { kind: 'dist', page: curPage, pts: [RM.points[0], RM.points[1]], label: lbl, color: curCol, lineWidth: curW, opacity: curOp, dash: curDash, _uncommitted: true }; RM.annotations.push(_newDist); RM.uncommittedAnns.push(_newDist);
      RM.points = [];
      redrawOverlay();
      if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      if (window.rpToast) window.rpToast(`Measured Distance: ${lbl}`);
    } else if (tool === 'leader' && RM.points.length >= 2) {
      const savedPts = [RM.points[0], RM.points[1]];
      RM.points = [];
      let note = 'Check tolerance & clearance';
      if (window.dialog) {
        const r = await window.dialog('Add Leader Callout', [
          { id: 'txt', label: 'Callout Annotation Text', value: 'Check tolerance & clearance' }
        ], 'Place Callout');
        if (!r) { redrawOverlay(); return; }
        note = r.txt || note;
      }
      if (window.rpPushCompareHistory) window.rpPushCompareHistory('Leader callout');
      const _newLdr = { kind: 'leader', page: curPage, pts: savedPts, label: note, color: curCol, lineWidth: curW, opacity: curOp, _uncommitted: true };
      RM.annotations.push(_newLdr);
      RM.uncommittedAnns.push(_newLdr);
      redrawOverlay();
      if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      if (window.rpToast) window.rpToast('Placed Leader Callout.');
    } else if (tool === 'cloud' && RM.points.length >= 2) {
      const [p1, p2] = RM.points;
      const rectPts = [
        { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y) },
        { x: Math.max(p1.x, p2.x), y: Math.min(p1.y, p2.y) },
        { x: Math.max(p1.x, p2.x), y: Math.max(p1.y, p2.y) },
        { x: Math.min(p1.x, p2.x), y: Math.max(p1.y, p2.y) }
      ];
      const revTxt = ($('#rib-mk-revtxt') && $('#rib-mk-revtxt').value) || RM.cloudRevText || 'Δ Rev 2';
      if (window.rpPushCompareHistory) window.rpPushCompareHistory('Revision cloud');
      const _newCld = { kind: 'cloud', page: curPage, pts: rectPts, revText: revTxt, color: curCol, lineWidth: curW, opacity: curOp, _uncommitted: true }; RM.annotations.push(_newCld); RM.uncommittedAnns.push(_newCld);
      RM.points = [];
      redrawOverlay();
      if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      if (window.rpToast) window.rpToast(`Placed ANSI/ISO Scalloped Revision Cloud (${revTxt}).`);
    }
  }

  // Pointer Down on #vp: handle Fiducial Aligner & Interactive Measurement / Markup Tools
  vp.addEventListener('pointerdown', async e => {
    if (e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest('#empty, #c-floating-hud, #rp-curtain-handle, button, select, input, a, label')) return;

    if (window.UIRibbon && window.UIRibbon.FiducialAligner && window.UIRibbon.FiducialAligner.active) {
      const pt = getImgCoords(e);
      if (window.UIRibbon.FiducialAligner.addPoint(pt.x, pt.y)) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }
    }

    if (!RM.activeTool) return;
    e.stopImmediatePropagation();
    e.preventDefault();

    const cv = $('#cv');
    if (!cv || !cv.width || !cv.height) {
      if (window.rpToast) window.rpToast('Open a drawing first to measure or place markups.');
      return;
    }

    const pt = getImgCoords(e);
    const tool = RM.activeTool;
    const curPage = (S && S.n) || 1;
    const curCol = RM.strokeColor || '#e11d48';
    const curOp = RM.opacity != null ? RM.opacity : 1.0;
    const k = (S && S.view && S.view.k) ? S.view.k : 1;

    if (tool === 'eraser') {
      if (window.rpPushCompareHistory) window.rpPushCompareHistory('Erase markup');
      eraseDown = true;
      erasedInStroke = eraseCompareAt(pt.x, pt.y, curPage);
      redrawOverlay();
      if (erasedInStroke && window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      return;
    }

    if (tool === 'pin') {
      if (window.rpPushCompareHistory) window.rpPushCompareHistory('Place pin marker');
      const pinNum = RM.nextPinNum++;
      const _newPin = {
        kind: 'pin',
        page: curPage,
        x: pt.x,
        y: pt.y,
        size: RM.pinSize || 24,
        pinNum,
        color: curCol || '#f59e0b',
        opacity: curOp,
        label: `Pin #${pinNum}`,
        _uncommitted: true
      };
      RM.annotations.push(_newPin);
      RM.uncommittedAnns.push(_newPin);
      redrawOverlay();
      if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      if (window.rpToast) window.rpToast(`Placed Inspection Pin #${pinNum} (${RM.pinSize || 24}px).`);
      return;
    }

    if (tool === 'tally') {
      if (RM.tally) {
        if (window.rpPushCompareHistory) window.rpPushCompareHistory('Add BOM badge');
        const badge = RM.tally.addItem(pt.x, pt.y, curPage, `BOM Item #${RM.tally.nextNum}`); if (badge && badge.id) RM.uncommittedTallies.push(badge.id);
        redrawOverlay();
        if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
        if (window.rpToast) window.rpToast(`Placed Inspection Badge #${badge.number} at (${Math.round(pt.x)}, ${Math.round(pt.y)}).`);
      }
      return;
    }

    if (tool === 'fai') {
      if (!RM.faiManager && typeof MeasureEngine !== 'undefined' && MeasureEngine.FAIManager) {
        RM.faiManager = new MeasureEngine.FAIManager();
      }
      const nextChar = RM.faiManager ? RM.faiManager.nextBalloon : ((RM.nextPinNum || 1));
      let reqTxt = '12.50 ±0.05 mm';
      let zoneTxt = `P${curPage}`;
      if (window.dialog) {
        const r = await window.dialog(`AS9102 FAI Balloon #${nextChar}`, [
          { id: 'req', label: 'Drawing Requirement & Tolerance', value: reqTxt },
          { id: 'zone', label: 'Sheet Zone', value: zoneTxt }
        ], 'Place FAI Balloon');
        if (!r) return;
        reqTxt = r.req || reqTxt;
        zoneTxt = r.zone || zoneTxt;
      }
      const item = RM.faiManager ? RM.faiManager.addBalloon(pt.x, pt.y, curPage, reqTxt, zoneTxt, '') : { charNo: nextChar, requirement: reqTxt };
      if (window.rpPushCompareHistory) window.rpPushCompareHistory('Place FAI balloon');
      RM.annotations.push({
        kind: 'fai',
        page: curPage,
        x: pt.x,
        y: pt.y,
        size: 24,
        charNo: item.charNo,
        label: `FAI #${item.charNo}: ${item.requirement}`,
        color: '#dc2626'
      });
      redrawOverlay();
      if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      if (window.rpToast) window.rpToast(`Placed AS9102 FAI Balloon #${item.charNo} (${item.requirement}).`);
      return;
    }

    if (tool === 'angle' || tool === 'rad3') {
      RM.points.push({ x: pt.x, y: pt.y });
      if (RM.points.length >= 3) {
        const [p1, p2, p3] = RM.points;
        const cal = RM.calibrator;
        if (tool === 'angle') {
          const angRes = (typeof MeasureEngine !== 'undefined' && MeasureEngine.calc3PointAngle)
            ? MeasureEngine.calc3PointAngle(p1, p2, p3)
            : null;
          const deg = angRes ? angRes.degrees : 0;
          const lbl = `∠ ${deg.toFixed(2)}°`;
          if (window.rpPushCompareHistory) window.rpPushCompareHistory('3-Point Angle');
          const _newAng = { kind: 'angle', page: curPage, pts: [p1, p2, p3], label: lbl, color: '#8b5cf6', lineWidth: 2.2, _uncommitted: true }; RM.annotations.push(_newAng); RM.uncommittedAnns.push(_newAng);
          if (window.rpToast) window.rpToast(`Measured 3-Point Angle: ${lbl}`);
        } else {
          const circRaw = (typeof MeasureEngine !== 'undefined' && MeasureEngine.calc3PointCircle)
            ? MeasureEngine.calc3PointCircle(p1, p2, p3)
            : null;
          const circ = (circRaw && circRaw.valid) ? circRaw : null;
          if (circ) {
            const lbl = cal ? `⌀ ${cal.formatDistance(circ.diameter)} (R: ${cal.formatDistance(circ.r)})` : `⌀ ${circ.diameter.toFixed(1)} px (R: ${circ.r.toFixed(1)} px)`;
            if (window.rpPushCompareHistory) window.rpPushCompareHistory('3-Point Circle');
            const _newRad = { kind: 'rad3', page: curPage, pts: [p1, p2, p3], circle: circ, label: lbl, color: '#0284c7', lineWidth: 2.2, _uncommitted: true }; RM.annotations.push(_newRad); RM.uncommittedAnns.push(_newRad);
            if (window.rpToast) window.rpToast(`Measured 3-Point Circle: ${lbl}`);
          } else if (window.rpToast) {
            window.rpToast('Points are collinear — click 3 non-collinear points along the arc or circle.');
          }
        }
        RM.points = [];
      }
      redrawOverlay();
      if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      return;
    }

    if (tool === 'stamp') {
      const reviewer = safeGet('author', 'Lead Engineer') || 'Lead Engineer';
      if (window.rpPushCompareHistory) window.rpPushCompareHistory(`Stamp ${RM.stampType}`);
      RM.annotations.push({
        kind: 'stamp',
        page: curPage,
        x: pt.x - 105,
        y: pt.y - 38,
        stampType: RM.stampType,
        reviewer,
        docHash: RM.docHash
      });
      setActiveTool(null);
      if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      if (window.rpToast) window.rpToast(`Stamped [${RM.stampType}] with SHA-256 verification hash.`);
      return;
    }

    if (tool === 'pen' || tool === 'redact') {
      penDown = true;
      RM.points = [{ x: pt.x, y: pt.y }];
      return;
    }

    if (tool === 'poly' || tool === 'area') {
      if (e.detail >= 2 && RM.points.length >= (tool === 'area' ? 3 : 2)) {
        RM._areaDragging = false;
        twoPtDragStart = null;
        finishMultiPointTool();
        return;
      }
      if (tool === 'area' && RM.points.length >= 3 && Math.hypot(pt.x - RM.points[0].x, pt.y - RM.points[0].y) <= 14 / k) {
        RM._areaDragging = false;
        twoPtDragStart = null;
        finishMultiPointTool();
        return;
      }
      if (RM.points.length === 0) {
        twoPtDragStart = { x: pt.x, y: pt.y };
        RM._areaDragging = false;
      } else {
        twoPtDragStart = null;
        RM._areaDragging = false;
        const lastPt = RM.points[RM.points.length - 1];
        if (Math.hypot(pt.x - lastPt.x, pt.y - lastPt.y) < 1.5 / k) {
          redrawOverlay();
          return;
        }
      }
      RM.points.push({ x: pt.x, y: pt.y });
      redrawOverlay();
      return;
    }

    if (RM.points.length === 0) {
      twoPtDragStart = { x: pt.x, y: pt.y };
    } else {
      const prevPt = RM.points[RM.points.length - 1];
      if (Math.hypot(pt.x - prevPt.x, pt.y - prevPt.y) < 2 / k) {
        return;
      }
      twoPtDragStart = null;
    }
    RM.points.push({ x: pt.x, y: pt.y });

    if (['calibrate', 'dist', 'leader', 'cloud'].includes(tool) && RM.points.length >= 2) {
      twoPtDragStart = null;
      await completeTwoPointTool(tool);
    } else {
      redrawOverlay();
    }
  }, true);

  window.addEventListener('pointerup', async e => {
    if (eraseDown) {
      eraseDown = false;
      if (!erasedInStroke && window.CompareHistory && window.CompareHistory.undoStack.length) {
        window.CompareHistory.undoStack.pop();
      }
      erasedInStroke = false;
      return;
    }
    if (twoPtDragStart && RM.activeTool && RM.points.length === 1) {
      const startPt = twoPtDragStart;
      twoPtDragStart = null;
      const pt = getImgCoords(e);
      const k = (S && S.view && S.view.k) ? S.view.k : 1;
      const dragDist = Math.hypot(pt.x - startPt.x, pt.y - startPt.y);
      if (dragDist > 8 / k) {
        if (RM.activeTool === 'area' && Math.abs(pt.x - startPt.x) > 4 / k && Math.abs(pt.y - startPt.y) > 4 / k) {
          RM._areaDragging = false;
          RM.points = [
            { x: Math.min(startPt.x, pt.x), y: Math.min(startPt.y, pt.y) },
            { x: Math.max(startPt.x, pt.x), y: Math.min(startPt.y, pt.y) },
            { x: Math.max(startPt.x, pt.x), y: Math.max(startPt.y, pt.y) },
            { x: Math.min(startPt.x, pt.x), y: Math.max(startPt.y, pt.y) }
          ];
          finishMultiPointTool();
          return;
        } else if (['calibrate', 'dist', 'leader', 'cloud'].includes(RM.activeTool)) {
          RM.points.push({ x: pt.x, y: pt.y });
          await completeTwoPointTool(RM.activeTool);
          return;
        }
      }
      RM._areaDragging = false;
    }
    if (!penDown) return;
    penDown = false;
    const curPage = (S && S.n) || 1;
    if (RM.activeTool === 'pen' && RM.points.length >= 1) {
      if (window.rpPushCompareHistory) window.rpPushCompareHistory('Freehand pen markup');
      const _newPen = {
        kind: 'pen',
        page: curPage,
        pts: [...RM.points],
        color: RM.strokeColor || '#e11d48',
        lineWidth: RM.strokeWidth || 3,
        opacity: RM.opacity != null ? RM.opacity : 1.0,
        dash: RM.dash || 'solid',
        _uncommitted: true
      };
      RM.annotations.push(_newPen);
      RM.uncommittedAnns.push(_newPen);
      RM.points = [];
      redrawOverlay();
      if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
    } else if (RM.activeTool === 'redact' && RM.points.length > 1) {
      if (window.rpPushCompareHistory) window.rpPushCompareHistory('Redaction box');
      const _newRed = { kind: 'redact', page: curPage, pts: [RM.points[0], RM.points[RM.points.length - 1]], _uncommitted: true }; RM.annotations.push(_newRed); RM.uncommittedAnns.push(_newRed);
      RM.points = [];
      redrawOverlay();
      if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      if (window.rpToast) window.rpToast('Placed Redaction Box.');
    }
  });

  function finishMultiPointTool() {
    const cal = RM.calibrator;
    const curPage = (S && S.n) || 1;
    const curCol = RM.strokeColor || '#3b82f6';
    const curW = RM.strokeWidth || 2.2;
    const curOp = RM.opacity != null ? RM.opacity : 1.0;
    const curDash = RM.dash || 'solid';
    if (RM.activeTool === 'poly' && RM.points.length >= 2) {
      const lenPx = MeasureEngine.calcPolylineLength(RM.points);
      const lbl = `Σ = ${cal ? cal.formatDistance(lenPx) : lenPx.toFixed(1) + ' px'}`;
      if (window.rpPushCompareHistory) window.rpPushCompareHistory('Polyline measurement');
      const _newPoly = { kind: 'poly', page: curPage, pts: [...RM.points], label: lbl, color: curCol, lineWidth: curW, opacity: curOp, dash: curDash, _uncommitted: true }; RM.annotations.push(_newPoly); RM.uncommittedAnns.push(_newPoly);
      RM.points = [];
      redrawOverlay();
      if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      if (window.rpToast) window.rpToast(`Completed Polyline Run: ${lbl}`);
    } else if (RM.activeTool === 'area' && RM.points.length >= 3) {
      const areaPx = MeasureEngine.calcPolygonArea(RM.points);
      const perimPx = MeasureEngine.calcPolylineLength([...RM.points, RM.points[0]]);
      const lbl = `${cal ? cal.formatArea(areaPx) : Math.round(areaPx) + ' px²'} (P: ${cal ? cal.formatDistance(perimPx) : Math.round(perimPx) + ' px'})`;
      if (window.rpPushCompareHistory) window.rpPushCompareHistory('Polygon area measurement');
      const _newArea = { kind: 'area', page: curPage, pts: [...RM.points], label: lbl, color: curCol, lineWidth: curW, opacity: curOp, dash: curDash, _uncommitted: true }; RM.annotations.push(_newArea); RM.uncommittedAnns.push(_newArea);
      RM.points = [];
      redrawOverlay();
      if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      if (window.rpToast) window.rpToast(`Completed Polygon Area: ${lbl}`);
    }
  }


  /**
   * Compare Tool Session Save-Point Engine:
   * - Done (toolDone): Finishes current line/polygon, commits all work as a permanent Save Point, and starts next new line.
   * - Cancel (toolCancel): If user didn't click Done, deletes uncommitted part(s) since last Done save point (storing them in rewindBuffer).
   * - Rewind (toolRewind): Restores deleted/canceled parts from rewindBuffer or steps back the last point/part.
   * - Off (toolOff): Commits finished parts and turns off the active tool.
   */
  async function toolDone() {
    if (RM.activeTool === 'poly' && RM.points.length >= 2) {
      finishMultiPointTool();
    } else if (RM.activeTool === 'area' && RM.points.length >= 3) {
      finishMultiPointTool();
    } else if (['dist', 'cloud', 'leader'].includes(RM.activeTool) && RM.points.length === 1 && RM.cursorImg) {
      const d = Math.hypot(RM.cursorImg.x - RM.points[0].x, RM.cursorImg.y - RM.points[0].y);
      if (d > 3) {
        RM.points.push({ x: RM.cursorImg.x, y: RM.cursorImg.y });
        await completeTwoPointTool(RM.activeTool);
      }
    }
    const savedCount = RM.uncommittedAnns.length + RM.uncommittedTallies.length + RM.uncommittedIgnores.length;
    RM.uncommittedAnns.forEach(a => { if (a) delete a._uncommitted; });
    RM.uncommittedAnns = [];
    RM.uncommittedTallies = [];
    RM.uncommittedIgnores = [];
    RM.points = [];
    twoPtDragStart = null;
    RM._areaDragging = false;
    redrawOverlay();
    if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
    if (window.rpToast) {
      window.rpToast(savedCount > 0
        ? `✓ Done — Saved ${savedCount} part(s) at checkpoint. Click drawing to start next new line!`
        : `✓ Done — Save point set. Ready to start next new line (or click ⏻ Off to exit tool).`);
    }
    return savedCount;
  }

  function toolCancel() {
    const hasDraftPts = RM.points && RM.points.length > 0;
    const hasUncommitted = RM.uncommittedAnns.length > 0 || RM.uncommittedTallies.length > 0 || RM.uncommittedIgnores.length > 0;

    if (hasDraftPts || hasUncommitted) {
      const removedAnns = [...RM.uncommittedAnns];
      const removedTallies = (RM.tally && Array.isArray(RM.tally.items))
        ? RM.tally.items.filter(it => RM.uncommittedTallies.includes(it.id))
        : [];
      const removedIgnores = (S && Array.isArray(S.ignore))
        ? S.ignore.filter(g => RM.uncommittedIgnores.includes(g.id))
        : [];
      const removedPts = [...(RM.points || [])];

      RM.rewindBuffer.push({
        anns: removedAnns,
        tallies: removedTallies,
        ignores: removedIgnores,
        points: removedPts,
        tool: RM.activeTool || (S && S.ignMode ? 'ignore' : null)
      });

      if (removedAnns.length) {
        const remSet = new Set(removedAnns);
        RM.annotations = RM.annotations.filter(a => !remSet.has(a));
      }
      if (removedTallies.length && RM.tally && Array.isArray(RM.tally.items)) {
        const tIds = new Set(RM.uncommittedTallies);
        RM.tally.items = RM.tally.items.filter(it => !tIds.has(it.id));
      }
      if (removedIgnores.length && S && Array.isArray(S.ignore)) {
        const igIds = new Set(RM.uncommittedIgnores);
        S.ignore = S.ignore.filter(g => !igIds.has(g.id));
        if (typeof window.markers === 'function') window.markers();
        if (typeof window.refresh === 'function') window.refresh();
      }

      RM.uncommittedAnns = [];
      RM.uncommittedTallies = [];
      RM.uncommittedIgnores = [];
      RM.points = [];
      twoPtDragStart = null;
      RM._areaDragging = false;
      redrawOverlay();
      if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      if (window.rpToast) {
        window.rpToast('✕ Canceled unsaved part (Deleted work since last Done save point — Right-click → Rewind to bring it back).');
      }
      return true;
    }

    // No uncommitted work left -> turn off active tool
    toolOff();
    return false;
  }

  function toolRewind() {
    // 1. If rewindBuffer has canceled/deleted parts or points, restore them back onto the drawing!
    if (RM.rewindBuffer && RM.rewindBuffer.length > 0) {
      const snap = RM.rewindBuffer.pop();
      if (snap.tool && snap.tool !== 'ignore' && !RM.activeTool) {
        setActiveTool(snap.tool);
      }
      if (snap.anns && snap.anns.length) {
        snap.anns.forEach(a => {
          a._uncommitted = true;
          RM.annotations.push(a);
          RM.uncommittedAnns.push(a);
        });
      }
      if (snap.tallies && snap.tallies.length && RM.tally && Array.isArray(RM.tally.items)) {
        snap.tallies.forEach(t => {
          RM.tally.items.push(t);
          RM.uncommittedTallies.push(t.id);
        });
      }
      if (snap.ignores && snap.ignores.length && S && Array.isArray(S.ignore)) {
        snap.ignores.forEach(g => {
          S.ignore.push(g);
          RM.uncommittedIgnores.push(g.id);
        });
        if (typeof window.markers === 'function') window.markers();
        if (typeof window.refresh === 'function') window.refresh();
      }
      if (snap.points && snap.points.length) {
        RM.points = [...snap.points];
      }
      redrawOverlay();
      if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      if (window.rpToast) {
        window.rpToast('↺ Rewind — Restored part back onto drawing!');
      }
      return true;
    }

    // 2. If mid-draw points exist, step back the last placed point (and store in rewindBuffer)
    if (RM.points && RM.points.length > 0) {
      const prevPts = [...RM.points];
      RM.points.pop();
      RM.rewindBuffer.push({ anns: [], tallies: [], ignores: [], points: prevPts, tool: RM.activeTool });
      redrawOverlay();
      if (window.rpToast) {
        window.rpToast(`↺ Rewind — Stepped back last point (${RM.points.length} point(s) remaining).`);
      }
      return true;
    }

    // 3. Otherwise step back the most recent annotation on the active page (and store in rewindBuffer so Rewind can bring it back)
    if (RM.annotations && RM.annotations.length > 0) {
      const lastAnn = RM.annotations.pop();
      RM.uncommittedAnns = RM.uncommittedAnns.filter(a => a !== lastAnn);
      RM.rewindBuffer.push({ anns: [lastAnn], tallies: [], ignores: [], points: [], tool: RM.activeTool });
      redrawOverlay();
      if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      if (window.rpToast) {
        window.rpToast('↺ Rewind — Stepped back last part (Right-click → Rewind to bring it back).');
      }
      return true;
    }

    if (window.rpToast) window.rpToast('Nothing to rewind.');
    return false;
  }

  function toolOff() {
    RM.uncommittedAnns.forEach(a => { if (a) delete a._uncommitted; });
    RM.uncommittedAnns = [];
    RM.uncommittedTallies = [];
    RM.uncommittedIgnores = [];
    RM.points = [];
    twoPtDragStart = null;
    RM._areaDragging = false;
    if (S && S.ignMode && $('#ignBtn')) {
      $('#ignBtn').click();
    }
    if (window.UIRibbon && window.UIRibbon.FiducialAligner && window.UIRibbon.FiducialAligner.active) {
      window.UIRibbon.FiducialAligner.active = false;
      const fm = $('#fiducial-modal');
      if (fm) fm.hidden = true;
      if ($('#rib-fiducial')) $('#rib-fiducial').classList.remove('on');
    }
    setActiveTool(null);
    if (window.rpToast) window.rpToast('⏻ Active tool turned off.');
  }

  RM.toolDone = toolDone;
  RM.toolCancel = toolCancel;
  RM.toolRewind = toolRewind;
  RM.toolOff = toolOff;
  window.rpToolDone = toolDone;
  window.rpToolCancel = toolCancel;
  window.rpToolRewind = toolRewind;
  window.rpToolOff = toolOff;

  function findCompareAnnotationAt(x, y, curPage, customScreenTol = 10) {
    const k = (S && S.view && S.view.k) ? S.view.k : 1;
    const tol = customScreenTol / k;
    for (let i = RM.annotations.length - 1; i >= 0; i--) {
      const a = RM.annotations[i];
      if (a.page != null && a.page !== curPage) continue;
      if (hitCompareAnnotation(a, x, y, tol)) return { ann: a, idx: i };
    }
    return null;
  }

  function imgRectToScreenRect(ix, iy, iw, ih) {
    const b = vp.getBoundingClientRect();
    const k = (S && S.view && S.view.k) ? S.view.k : 1;
    const vx = (S && S.view) ? S.view.x : 0;
    const vy = (S && S.view) ? S.view.y : 0;
    const left = b.left + vx + ix * k;
    const top = b.top + vy + iy * k;
    return {
      left,
      top,
      right: left + Math.max(16, iw * k),
      bottom: top + Math.max(16, ih * k)
    };
  }

  function checkCompareNoteHover(x, y) {
    if (!window.RPNotePreview) return;
    const curPage = (S && S.n) || 1;
    const k = (S && S.view && S.view.k) ? S.view.k : 1;

    // 1. Check Compare Annotations (Pin, Leader Callout, Revision Cloud) within 26px screen proximity
    const hitRes = findCompareAnnotationAt(x, y, curPage, 26);
    if (hitRes && ['pin', 'leader', 'cloud'].includes(hitRes.ann.kind)) {
      const a = hitRes.ann;
      let anchorRect;
      if (a.kind === 'pin') {
        const sz = a.size || 24;
        anchorRect = imgRectToScreenRect(a.x - sz / 2, a.y - sz, sz, sz);
      } else {
        const xs = (a.pts || []).map(p => p.x), ys = (a.pts || []).map(p => p.y);
        const minX = Math.min(...xs), minY = Math.min(...ys);
        anchorRect = imgRectToScreenRect(minX, minY, Math.max(20, Math.max(...xs) - minX), Math.max(20, Math.max(...ys) - minY));
      }
      const title = a.kind === 'pin' ? `Inspection Pin #${a.pinNum || 1}` : a.kind === 'leader' ? 'Leader Callout' : 'Revision Cloud';
      const txt = a.kind === 'cloud' ? (a.revText || '') : (a.note || a.label || '');
      window.RPNotePreview.show({
        key: `cmp_ann_${hitRes.idx}_${txt}`,
        title,
        color: a.color || '#f59e0b',
        sub: `Sheet ${curPage}`,
        text: txt,
        emptyHint: 'No note text written yet — click Edit Note to write.',
        anchorRect,
        actions: [
          { label: 'Edit Note', run: () => editCompareAnnotation(a) },
          {
            label: 'Delete',
            danger: true,
            run: () => {
              if (window.rpPushCompareHistory) window.rpPushCompareHistory('Delete markup');
              RM.annotations.splice(hitRes.idx, 1);
              redrawOverlay();
              if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
            }
          }
        ]
      }, false);
      return;
    }

    // 2. Check BOM Tally Badges within 24px screen proximity
    if (RM.tally && Array.isArray(RM.tally.items)) {
      const hitTally = RM.tally.items.find(it => it.page === curPage && Math.hypot(it.x - x, it.y - y) <= 24 / k);
      if (hitTally) {
        const anchorRect = imgRectToScreenRect(hitTally.x - 14, hitTally.y - 14, 28, 28);
        window.RPNotePreview.show({
          key: `cmp_tally_${hitTally.id}_${hitTally.label}`,
          title: `BOM Tally Badge #${hitTally.number}`,
          color: '#10b981',
          sub: `Sheet ${curPage} · (${Math.round(hitTally.x)}, ${Math.round(hitTally.y)})`,
          text: hitTally.label || '',
          anchorRect,
          actions: [
            {
              label: 'Edit Note',
              run: async () => {
                if (!window.dialog) return;
                const r = await window.dialog(`Edit BOM Tally Badge #${hitTally.number}`, [
                  { type: 'textarea', id: 'lbl', label: 'Component / BOM Note', rows: 3, value: hitTally.label || '' }
                ], 'Save Note');
                if (r && r.lbl != null) {
                  hitTally.label = r.lbl.trim();
                  redrawOverlay();
                  if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
                }
              }
            }
          ]
        }, false);
        return;
      }
    }

    // 3. Difference notes are shown in the Notes panel when touching/clicking a difference box (no floating hover popup over difference boxes)

    if (!window.RPNotePreview.isPinned()) {
      window.RPNotePreview.scheduleHide(140);
    }
  }

  async function editCompareAnnotation(a) {
    if (!a || !window.dialog) return;
    if (a.kind === 'pin') {
      const r = await window.dialog(`Edit Inspection Pin #${a.pinNum || 1}`, [
        { type: 'textarea', id: 'lbl', label: 'Pin Callout Tag / Note', rows: 3, value: a.label || `Pin #${a.pinNum || 1}` },
        { type: 'color', id: 'col', label: 'Pin Colour', value: a.color || '#f59e0b' }
      ], 'Update Pin');
      if (r) {
        if (window.rpPushCompareHistory) window.rpPushCompareHistory('Edit pin marker');
        a.label = r.lbl || '';
        a.note = r.lbl || '';
        if (r.col) a.color = r.col;
        redrawOverlay();
        if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      }
    } else if (a.kind === 'leader') {
      const r = await window.dialog('Edit Leader Callout', [
        { id: 'lbl', label: 'Callout Annotation Text', value: a.label || 'Engineering Note' },
        { type: 'color', id: 'col', label: 'Callout Colour', value: a.color || '#ef4444' }
      ], 'Update Callout');
      if (r && r.lbl != null) {
        if (window.rpPushCompareHistory) window.rpPushCompareHistory('Edit leader callout');
        a.label = r.lbl;
        if (r.col) a.color = r.col;
        redrawOverlay();
        if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      }
    } else if (a.kind === 'cloud') {
      const r = await window.dialog('Edit Revision Cloud', [
        { id: 'rev', label: 'Revision Delta Tag', value: a.revText || 'Δ Rev 2' },
        { type: 'color', id: 'col', label: 'Cloud Colour', value: a.color || '#ef4444' }
      ], 'Update Cloud');
      if (r && r.rev != null) {
        if (window.rpPushCompareHistory) window.rpPushCompareHistory('Edit revision cloud');
        a.revText = r.rev;
        if (r.col) a.color = r.col;
        redrawOverlay();
        if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
      }
    }
  }

  RM.hitAt = findCompareAnnotationAt;
  RM.editAnnotation = editCompareAnnotation;
  RM.renderSingleAnnotation = renderSingleAnnotation;

  vp.addEventListener('dblclick', async e => {
    if (RM.activeTool === 'poly' || RM.activeTool === 'area') {
      e.preventDefault();
      finishMultiPointTool();
      return;
    }
    const pt = getImgCoords(e);
    const curPage = (S && S.n) || 1;
    const hitRes = findCompareAnnotationAt(pt.x, pt.y, curPage);
    if (hitRes && ['pin', 'leader', 'cloud'].includes(hitRes.ann.kind)) {
      e.preventDefault();
      await editCompareAnnotation(hitRes.ann);
    }
  });

  addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
    if (e.key === 'Escape') {
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.rp-modal, #modal, #dlg') && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      document.querySelectorAll('.rp-modal').forEach(m => { m.hidden = true; if (m.parentNode && (!m.id || /^rp-(equation|gdt|block-lib|net-tracer|pcb-calc|bom|bom-meas)-modal$/.test(m.id))) m.remove(); });
      if (RM.activeTool) {
        setActiveTool(null);
        if (window.rpToast) window.rpToast('Exited active tool.');
      }
    } else if (e.key === 'Enter' && (RM.activeTool === 'poly' || RM.activeTool === 'area')) {
      e.preventDefault();
      finishMultiPointTool();
    } else if ((e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey && document.body.dataset.view === 'compare') {
      $('#rib-loupe-toggle') && $('#rib-loupe-toggle').click();
    } else if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey && document.body.dataset.view === 'compare') {
      $('#rib-grid-toggle') && $('#rib-grid-toggle').click();
    } else if ((e.key === 'x' || e.key === 'X') && !e.ctrlKey && !e.metaKey && document.body.dataset.view === 'compare') {
      $('#rib-crosshair-toggle') && $('#rib-crosshair-toggle').click();
    }
  });

  const listEl = $('#list');
  if (listEl) {
    new MutationObserver(() => {
      if (window.UIRibbon && window.UIRibbon.DefectState && S.cur && S.cur.regions) {
        if (window.UIRibbon.DefectState._activePage !== S.cur.n || (!window.UIRibbon.DefectState.defects.length && S.cur.regions.length)) {
          window.UIRibbon.DefectState.initFromRegions(S.cur.regions);
        }
        rebuildOSNAPFeatures();
      }
    }).observe(listEl, { childList: true });
  }

  function initRedlineProUI() {
    if (window.UIRibbon && window.UIRibbon.init) {
      window.UIRibbon.init();
    }

    const wire = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };

    wire('#rp-finish-tool-btn', () => toolDone());
    wire('#rp-rewind-tool-btn', () => toolRewind());
    wire('#rp-cancel-tool-btn', () => toolCancel());
    wire('#rp-off-tool-btn', () => toolOff());

    wire('#rib-calibrate', () => {
      setActiveTool(RM.activeTool === 'calibrate' ? null : 'calibrate', 'Calibrate Scale (Click 2 points)');
    });
    wire('#rib-dist', () => {
      setActiveTool(RM.activeTool === 'dist' ? null : 'dist', 'Distance (Click 2 points)');
    });
    wire('#rib-poly', () => {
      setActiveTool(RM.activeTool === 'poly' ? null : 'poly', 'Cumulative Polyline (Double-click to finish)');
    });
    wire('#rib-area', () => {
      setActiveTool(RM.activeTool === 'area' ? null : 'area', 'Polygon Area (Double-click to close)');
    });
    wire('#rib-tally', () => {
      setActiveTool(RM.activeTool === 'tally' ? null : 'tally', 'Tally / BOM Counter (Click to place badge)');
    });
    wire('#rib-angle', () => {
      setActiveTool(RM.activeTool === 'angle' ? null : 'angle', '3-Point Angle Protractor (Click Start, Vertex, End)', 'rib-angle');
    });
    wire('#rib-circle-find', () => {
      setActiveTool(RM.activeTool === 'rad3' ? null : 'rad3', '3-Point Circle / Arc ⌀ & R Finder (Click 3 points on arc)', 'rib-circle-find');
    });
    wire('#rib-fai-balloon', () => {
      setActiveTool(RM.activeTool === 'fai' ? null : 'fai', 'AS9102 FAI Auto-Balloon (Click dimension to balloon)', 'rib-fai-balloon');
    });
    wire('#rib-gdt', () => {
      if (typeof window.setView === 'function') window.setView('edit');
      if ($('#eGdtBtn')) $('#eGdtBtn').click();
    });
    wire('#rib-title-block', () => {
      if (typeof window.setView === 'function') window.setView('edit');
      if ($('#eTitleBlockBtn')) $('#eTitleBlockBtn').click();
    });
    wire('#rib-sym-lib', () => {
      if (typeof window.setView === 'function') window.setView('edit');
      if ($('#eBlockLibBtn')) $('#eBlockLibBtn').click();
    });

    wire('#rib-osnap-toggle', () => {
      RM.osnapEnabled = !RM.osnapEnabled;
      const b = $('#rib-osnap-toggle');
      if (b) {
        b.classList.toggle('on', RM.osnapEnabled);
        const sp = b.querySelector('span'); if (sp) sp.textContent = `OSNAP: ${RM.osnapEnabled ? 'ON' : 'OFF'}`;
      }
      redrawOverlay();
      if (window.rpToast) window.rpToast(`Magnetic Object Snap (OSNAP) ${RM.osnapEnabled ? 'ENABLED' : 'DISABLED'}.`);
    });

    const ensureHudCursorPosition = () => {
      if (RM.cursorScreen.x < 0 || RM.cursorScreen.y < 0) {
        const cx = Math.round((vp.clientWidth || 600) / 2);
        const cy = Math.round((vp.clientHeight || 400) / 2);
        RM.cursorScreen = { x: cx, y: cy };
        const k = (S && S.view && S.view.k) ? S.view.k : 1;
        const vx = (S && S.view) ? S.view.x : 0;
        const vy = (S && S.view) ? S.view.y : 0;
        RM.cursorImg = { x: (cx - vx) / k, y: (cy - vy) / k };
      }
    };

    wire('#rib-loupe-toggle', () => {
      RM.loupeEnabled = !RM.loupeEnabled;
      if (RM.loupeEnabled) ensureHudCursorPosition();
      const b = $('#rib-loupe-toggle');
      if (b) b.classList.toggle('on', RM.loupeEnabled);
      if ($('#cHudLoupe')) $('#cHudLoupe').classList.toggle('on', RM.loupeEnabled);
      renderViewportHUD();
      if (window.rpToast) window.rpToast(`4x Magnifier Loupe ${RM.loupeEnabled ? 'ON (Move cursor over drawing)' : 'OFF'}.`);
    });

    wire('#rib-grid-toggle', () => {
      RM.gridEnabled = !RM.gridEnabled;
      const b = $('#rib-grid-toggle');
      if (b) b.classList.toggle('on', RM.gridEnabled);
      redrawOverlay();
      if (window.rpToast) window.rpToast(`Engineering Reference Grid ${RM.gridEnabled ? 'ON' : 'OFF'}.`);
    });

    wire('#rib-crosshair-toggle', () => {
      RM.crosshairEnabled = !RM.crosshairEnabled;
      if (RM.crosshairEnabled) ensureHudCursorPosition();
      const b = $('#rib-crosshair-toggle');
      if (b) b.classList.toggle('on', RM.crosshairEnabled);
      if ($('#cHudCross')) $('#cHudCross').classList.toggle('on', RM.crosshairEnabled);
      renderViewportHUD();
      if (window.rpToast) window.rpToast(`Precision Crosshair ${RM.crosshairEnabled ? 'ON' : 'OFF'}.`);
    });

    wire('#rib-rev-cloud', () => {
      setActiveTool(RM.activeTool === 'cloud' ? null : 'cloud', 'Revision Cloud (Click 2 corners)');
    });
    wire('#rib-leader', () => {
      setActiveTool(RM.activeTool === 'leader' ? null : 'leader', 'Leader Callout (Click arrow target then text box)');
    });
    wire('#rib-pen', () => {
      setActiveTool(RM.activeTool === 'pen' ? null : 'pen', `Freehand Redline Pen (${RM.strokeWidth || 3}px — Drag to draw)`);
    });
    wire('#rib-pin', () => {
      setActiveTool(RM.activeTool === 'pin' ? null : 'pin', `Pin Marker (${RM.pinSize || 24}px — Click to place badge)`);
    });
    wire('#rib-eraser', () => {
      setActiveTool(RM.activeTool === 'eraser' ? null : 'eraser', `Eraser (${RM.eraserRadius || 20}px — Click or drag over markup)`);
    });
    wire('#rib-redact', () => {
      setActiveTool(RM.activeTool === 'redact' ? null : 'redact', 'Redact Box (Drag to black out)');
    });

    // Wire Compare Tool Options controls (#rib-mk-*)
    if ($('#rib-mk-size')) {
      $('#rib-mk-size').oninput = e => { if (+e.target.value > 0) setCompareToolSize(+e.target.value); };
    }
    document.querySelectorAll('#rib-mk-pen-presets .rp-cmp-sz').forEach(btn => {
      btn.onclick = () => setCompareToolSize(+btn.dataset.sz);
    });
    document.querySelectorAll('#rib-mk-eraser-presets .rp-cmp-er').forEach(btn => {
      btn.onclick = () => setCompareToolSize(+btn.dataset.er);
    });
    document.querySelectorAll('#rib-mk-pin-presets .rp-cmp-pin').forEach(btn => {
      btn.onclick = () => setCompareToolSize(+btn.dataset.psz);
    });
    if ($('#rib-mk-eraser-mode')) {
      $('#rib-mk-eraser-mode').onchange = e => {
        RM.eraserMode = e.target.value;
        if (window.rpToast) window.rpToast(`Compare Eraser Mode: ${RM.eraserMode === 'brush' ? 'Brush Radius' : 'Whole Markup'}`);
      };
    }
    const setCmpColor = col => {
      RM.strokeColor = col;
      const t = RM.activeTool || 'pen';
      RM.toolSettings[t] = RM.toolSettings[t] || {};
      RM.toolSettings[t].color = col;
      if ($('#rib-mk-color')) $('#rib-mk-color').value = col;
      const low = String(col || '').toLowerCase();
      document.querySelectorAll('#rib-mk-swatches .rp-swatch').forEach(b => b.classList.toggle('on', (b.dataset.col || '').toLowerCase() === low));
      redrawOverlay();
    };
    if ($('#rib-mk-color')) {
      $('#rib-mk-color').oninput = e => setCmpColor(e.target.value);
    }
    document.querySelectorAll('#rib-mk-swatches .rp-swatch').forEach(btn => {
      btn.onclick = () => setCmpColor(btn.dataset.col || '#e11d48');
    });
    if ($('#rib-mk-op')) {
      $('#rib-mk-op').oninput = e => {
        const pct = Math.max(10, Math.min(100, +e.target.value || 100));
        RM.opacity = pct / 100;
        const t = RM.activeTool || 'pen';
        RM.toolSettings[t] = RM.toolSettings[t] || {};
        RM.toolSettings[t].opacity = pct;
        redrawOverlay();
      };
    }
    if ($('#rib-mk-dash')) {
      $('#rib-mk-dash').onchange = e => {
        RM.dash = e.target.value;
        const t = RM.activeTool || 'pen';
        RM.toolSettings[t] = RM.toolSettings[t] || {};
        RM.toolSettings[t].dash = RM.dash;
        redrawOverlay();
      };
    }
    if ($('#rib-mk-revtxt')) {
      $('#rib-mk-revtxt').oninput = e => {
        RM.cloudRevText = e.target.value || 'Δ Rev 2';
      };
    }
    updateCompareToolOptionsUI('pen');

    const activateStamp = async (type, btnId) => {
      if (RM.activeTool === 'stamp' && RM.stampType === type) {
        toolOff();
        return;
      }
      RM.stampType = type;
      if (typeof MeasureEngine !== 'undefined' && S && S.cur && S.cur.A) {
        RM.docHash = await MeasureEngine.computeDocumentSHA256(S.cur.A.data.buffer);
      }
      setActiveTool('stamp', `${type} Stamp (Click sheet to place)`, btnId);
    };

    wire('#rib-stamp-app', () => activateStamp('APPROVED', 'rib-stamp-app'));
    wire('#rib-stamp-rej', () => activateStamp('REJECTED', 'rib-stamp-rej'));
    wire('#rib-stamp-rev', () => activateStamp('REVISED & RESUBMIT', 'rib-stamp-rev'));
    wire('#rib-stamp-sha', () => activateStamp('FOR REVIEW ONLY', 'rib-stamp-sha'));

    wire('#rp-cmp-open-a-btn', () => { if ($('#openA')) $('#openA').click(); });
    wire('#rp-cmp-open-b-btn', () => { if ($('#openB')) $('#openB').click(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRedlineProUI);
  } else {
    initRedlineProUI();
  }

  safeSet('termsAccepted', '1.2.3.2');
})();
