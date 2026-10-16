/* pdf.js - a bill or quotation as a PDF FILE (to send to the customer on WhatsApp, or to keep).
   The bill is drawn exactly as it is printed (the same bilingual A4 layout), turned into pictures by html2canvas
   (js/vendor/html2canvas.min.js, MIT licence, kept inside the project so it works with no internet),
   and written into a small, valid PDF by the few lines below. Long bills continue on a second page, cut between table rows.
   No server is involved: the PDF is made in the browser.
   Sending: on a phone (and on browsers that allow it) the "share" sheet gives WhatsApp the PDF directly; otherwise the PDF is
   saved to the computer and WhatsApp opens on the customer's chat, so he only has to attach it with the paperclip. */
(function () {
  'use strict';

  var PAGE_W = 794;                       // A4 width at 96 dpi
  var SCALE = 1.75;                       // sharp enough to read and print, small enough to send (about 150 KB per bill)

  function fileName(inv) { return (String(inv.number || 'invoice').replace(/[^A-Za-z0-9_-]/g, '') || 'invoice') + '.pdf'; }

  /* the A4 bill, drawn off-screen */
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  function stage(inv, noImg) {
    var c = document.createElement('div');
    c.style.cssText = 'position:fixed;left:-12000px;top:0;width:' + PAGE_W + 'px;background:#fff;padding:30px 36px;box-sizing:border-box;direction:ltr;z-index:-1';
    // letter-spacing would make html2canvas draw Arabic letters one by one and break their joining, so it is switched off here
    var html = Print.billHtml(inv, Store.s.settings);
    // the logo travels inside the page as text (js/logo-data.js): a picture FILE would taint the canvas when the system is opened from a folder (file://)
    html = html.split('img/logo.png').join(noImg ? BLANK : (window.BF_LOGO || 'img/logo.png'));
    c.innerHTML = '<style>.inv,.inv *{letter-spacing:normal !important}</style>' + html;
    document.body.appendChild(c);
    return c;
  }
  function imagesReady(root) {
    var imgs = Array.prototype.slice.call(root.querySelectorAll('img')).filter(function (i) { return !i.complete; });
    if (!imgs.length) return Promise.resolve();
    return Promise.all(imgs.map(function (i) { return new Promise(function (ok) { i.addEventListener('load', ok); i.addEventListener('error', ok); }); }));
  }

  /* y positions (in canvas pixels) where a page may be cut: the bottom of every table row / box */
  function breaks(root, scale) {
    var top = root.getBoundingClientRect().top, out = [];
    root.querySelectorAll('.inv tr, .inv .box, .inv .note, .inv .bottom, .inv .sign, .inv .doc, .inv .hd').forEach(function (e) {
      out.push(Math.round((e.getBoundingClientRect().bottom - top) * scale));
    });
    return out.sort(function (a, b) { return a - b; });
  }

  function jpegBytes(canvas) {
    var b64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1], bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  /* cut the long picture into A4 pages */
  function pages(canvas, root) {
    var cw = canvas.width, ph = Math.floor(cw * 297 / 210), total = canvas.height, cuts = breaks(root, canvas.width / root.offsetWidth);
    var out = [], y = 0;
    while (y < total - 2) {
      var end = Math.min(total, y + ph);
      if (end < total) {                               // not the last page: cut after the last whole row that fits
        var best = 0;
        cuts.forEach(function (b) { if (b > y + ph * 0.5 && b <= y + ph && b > best) best = b; });
        if (best) end = best;
      }
      var pc = document.createElement('canvas'); pc.width = cw; pc.height = ph;
      var ctx = pc.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ph);
      ctx.drawImage(canvas, 0, y, cw, end - y, 0, 0, cw, end - y);
      out.push({ bytes: jpegBytes(pc), w: cw, h: ph });
      y = end;
    }
    return out;
  }

  /* a minimal PDF 1.4: one full-page JPEG per page */
  function pdfFrom(list) {
    var enc = new TextEncoder(), chunks = [], pos = 0, offs = {};
    function push(u) { chunks.push(u); pos += u.length; }
    function str(s) { push(enc.encode(s)); }
    function begin(n) { offs[n] = pos; str(n + ' 0 obj\n'); }
    var n = list.length;
    push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));   // %PDF-1.4 + a binary comment
    begin(1); str('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    var kids = []; for (var i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
    begin(2); str('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>\nendobj\n');
    list.forEach(function (p, i) {
      var page = 3 + i * 3, content = page + 1, img = page + 2, cs = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
      begin(page); str('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ' + img + ' 0 R >> >> /Contents ' + content + ' 0 R >>\nendobj\n');
      begin(content); str('<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream\nendobj\n');
      begin(img); str('<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.bytes.length + ' >>\nstream\n');
      push(p.bytes); str('\nendstream\nendobj\n');
    });
    var total = 3 + n * 3, xref = pos;
    str('xref\n0 ' + total + '\n0000000000 65535 f \n');
    for (var k = 1; k < total; k++) str(String(offs[k]).padStart(10, '0') + ' 00000 n \n');
    str('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(chunks, { type: 'application/pdf' });
  }

  /* make the PDF of a bill / quotation. Resolves { blob, name, file } */
  function make(inv, noImg) {
    if (!window.html2canvas) return Promise.reject(new Error('pdf_unavailable'));
    var root = stage(inv, noImg);
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    return Promise.all([fonts, imagesReady(root)]).then(function () {
      return html2canvas(root, { scale: SCALE, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: PAGE_W });
    }).then(function (canvas) {
      var blob, name = fileName(inv);
      try { blob = pdfFrom(pages(canvas, root)); } finally { root.remove(); }
      var file = null; try { file = new File([blob], name, { type: 'application/pdf' }); } catch (e) { /* old browser: download only */ }
      return { blob: blob, name: name, file: file };
    }, function (e) { root.remove(); throw e; }).catch(function (e) {
      if (noImg) throw e;
      return make(inv, true);                                // last resort: the PDF without the logo is better than no PDF
    });
  }

  function download(r) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(r.blob); a.download = r.name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function canShare(r) {
    try { return !!(r.file && navigator.canShare && navigator.canShare({ files: [r.file] })); } catch (e) { return false; }
  }
  /* open the phone's / system's share sheet with the PDF. 'shared' | 'cancel' | 'unsupported' */
  function share(r, text) {
    if (!canShare(r)) return Promise.resolve('unsupported');
    return navigator.share({ files: [r.file], title: r.name, text: text || '' }).then(function () { return 'shared'; }, function (e) {
      return e && e.name === 'AbortError' ? 'cancel' : 'unsupported';
    });
  }

  /* the "Download PDF" button of a bill / quotation window */
  function downloadFor(inv, btn) {
    if (!inv) return Promise.resolve();
    if (btn) btn.disabled = true;
    toast(I18N.t('pdf_preparing'));
    return make(inv).then(function (r) { download(r); toast(I18N.t('pdf_saved', { name: r.name })); },
      function () { toast(I18N.t('pdf_failed'), 'bad'); }).then(function () { if (btn) btn.disabled = false; });
  }

  window.Pdf = { make: make, download: download, share: share, canShare: canShare, fileName: fileName, downloadFor: downloadFor };
})();
