/* whatsapp.js - send a bill to the customer on WhatsApp.
   It opens WhatsApp (the app on the computer, or WhatsApp Web; address api.whatsapp.com) with the chat and the message already written.
   The message goes out from the WhatsApp account that is signed in on THAT device - the shop's own number.
   Nothing is sent by the server, and the owner presses Send himself, so it can never go to the wrong person
   without him seeing the number first.
   When the system is on the real website, the message also carries a private link: the customer taps it and
   sees the full printed bill (bill.html). The link holds a long random code that nobody can guess. */
(function () {
  'use strict';

  var cur = null;               // the bill being sent
  var mode = 'bill';            // 'bill' = send the bill, 'reminder' = ask for the money still owed
  var pdfRes = null;            // the bill as an A4 PDF file, made in the background while the window is open
  var token = '';               // its private link code ('' = none)
  var state = 'none';           // none | pending | ready | failed
  var MAX_URL = 6500;           // keep the wa.me address short enough for every browser

  function t(k, v) { return I18N.t(k, v); }

  /* ------------------------------------------------ phone numbers */
  function ascii(s) {            // Arabic-Indic and Persian digits -> 0-9
    return String(s || '').replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
  }
  /* '' = nothing typed.  null = a number WhatsApp cannot use.  Otherwise digits with the country code.
     Oman: 8 digits (9xxx xxxx) or 968 + 8 digits.  Any other country: start with + or 00. */
  function normalize(raw) {
    var s = ascii(raw).trim();
    if (!s) return '';
    var intl = /^\+/.test(s) || /^00/.test(s.replace(/[\s\-().]/g, ''));
    var d = s.replace(/\D/g, '');
    if (intl) { d = d.replace(/^00/, ''); return d.length >= 8 && d.length <= 15 ? d : null; }
    if (d.length === 8) return '968' + d;
    if (d.length === 11 && d.indexOf('968') === 0) return d;
    return null;
  }

  /* ------------------------------------------------ the message */
  var TX = {
    ar: { note: 'ملاحظة', quote: 'رقم عرض السعر', valid: 'صالح حتى', invoice: 'فاتورة رقم', date: 'التاريخ', customer: 'العميل', car: 'السيارة', plate: 'اللوحة', fault: 'العمل', status: 'حالة السيارة',
      disc: 'الخصم', vat: 'الضريبة', total: 'الإجمالي', paid: 'المدفوع', balance: 'المتبقي', fullypaid: 'الفاتورة مدفوعة بالكامل ✅',
      link: 'الفاتورة بصيغة PDF - اضغط على الرابط لفتحها', contact: 'للتواصل', thanks: 'شكراً لتعاملكم معنا', omr: 'ر.ع', voided: '⚠️ فاتورة ملغاة', more: 'بنود أخرى', due: 'موعد التسليم' },
    en: { note: 'Note', quote: 'Quotation No', valid: 'Valid until', invoice: 'Invoice No', date: 'Date', customer: 'Customer', car: 'Car', plate: 'Plate', fault: 'Work', status: 'Car status',
      disc: 'Discount', vat: 'VAT', total: 'Total', paid: 'Paid', balance: 'Balance due', fullypaid: 'Fully paid ✅',
      link: 'Your invoice as a PDF - tap the link to open it', contact: 'Contact', thanks: 'Thank you for your business', omr: 'OMR', voided: '⚠️ VOID invoice', more: 'more items', due: 'Expected delivery' }
  };
  function nameOf(it, lang) { return lang === 'ar' ? (it.a || it.n) : (it.n || it.a); }

  function message(inv, lang, link, maxItems) {
    var s = Store.s.settings, x = TX[lang === 'en' ? 'en' : 'ar'], L = [];
    var shop = lang === 'en' ? (s.name || s.nameAr) : (s.nameAr || s.name);
    var bal = Calc.balance(inv), paid = Calc.paid(inv), isQ = inv.kind === 'quote';
    var job = Print.JOBS[inv.job] || Print.JOBS.received;
    L.push('*' + shop + '*');
    if (inv.void) L.push(x.voided);
    L.push((isQ ? x.quote : x.invoice) + ': ' + inv.number);
    L.push(x.date + ': ' + fdate(inv.date));
    L.push(x.customer + ': ' + inv.customerName);
    if (inv.kind !== 'parts') {
      var car = [inv.car, inv.plate ? x.plate + ' ' + inv.plate : ''].filter(Boolean).join(' - ');
      if (car) L.push(x.car + ': ' + car);
      if (inv.fault) L.push(x.fault + ': ' + inv.fault);
    }
    L.push('--------------------');
    var items = inv.items, cap = maxItems || 40;
    items.slice(0, cap).forEach(function (it, i) {
      L.push((i + 1) + ') ' + nameOf(it, lang) + ' × ' + it.q + ' = ' + f3(Calc.line(it)));
    });
    if (items.length > cap) L.push('... +' + (items.length - cap) + ' ' + x.more);
    L.push('--------------------');
    if (inv.discount > 0) L.push(x.disc + ': -' + f3(inv.discount));
    if (inv.vatPct > 0) L.push(x.vat + ' ' + inv.vatPct + '%: ' + f3(inv.vat));
    L.push('*' + x.total + ': ' + f3(inv.total) + ' ' + x.omr + '*');
    if (!isQ) L.push(x.paid + ': ' + f3(paid) + ' ' + x.omr);
    if (!inv.void && !isQ) L.push(bal > 0.0004 ? '*' + x.balance + ': ' + f3(bal) + ' ' + x.omr + '*' : x.fullypaid);
    if (isQ) { if (inv.validUntil) L.push(x.valid + ': ' + fdate(inv.validUntil)); }
    else if (inv.kind !== 'parts' && !inv.void) {
      L.push(x.status + ': ' + (lang === 'ar' ? job[1] : job[0]));
      if (inv.due && inv.job !== 'delivered') L.push(x.due + ': ' + fdate(inv.due));
    }
    if (inv.note) { L.push(''); L.push('*' + x.note + ':* ' + inv.note); }                      // the red note of the bill
    if (link) { L.push(''); L.push(x.link + ':'); L.push(link); }
    L.push('');
    if (s.phone) L.push(x.contact + ': ' + s.phone);
    L.push(x.thanks);
    return L.join('\n');
  }

  /* A polite payment reminder for a bill that is not fully paid. */
  var RX = {
    ar: { hello: 'السلام عليكم', intro: 'تذكير ودّي بالمبلغ المتبقي على الفاتورة رقم', dated: 'بتاريخ', total: 'الإجمالي', paid: 'المدفوع', due: 'المتبقي', car: 'السيارة', plate: 'اللوحة',
      link: 'الفاتورة بصيغة PDF - اضغط على الرابط لفتحها', ask: 'نرجو التكرم بالسداد في أقرب وقت.', contact: 'للتواصل', thanks: 'شكراً لتعاملكم معنا', omr: 'ر.ع' },
    en: { hello: 'Hello', intro: 'A friendly reminder about the amount still owed on invoice', dated: 'dated', total: 'Total', paid: 'Paid', due: 'Balance due', car: 'Car', plate: 'Plate',
      link: 'Your invoice as a PDF - tap the link to open it', ask: 'Please settle it as soon as possible.', contact: 'Contact', thanks: 'Thank you for your business', omr: 'OMR' }
  };
  function reminderMessage(inv, lang, link) {
    var s = Store.s.settings, x = RX[lang === 'en' ? 'en' : 'ar'], L = [];
    var shop = lang === 'en' ? (s.name || s.nameAr) : (s.nameAr || s.name);
    L.push('*' + shop + '*');
    L.push(x.hello + ' ' + inv.customerName + '،'.replace('،', lang === 'en' ? ',' : '،'));
    L.push(x.intro + ' ' + inv.number + ' ' + x.dated + ' ' + fdate(inv.date) + ':');
    if (inv.kind !== 'parts') {
      var car = [inv.car, inv.plate ? x.plate + ' ' + inv.plate : ''].filter(Boolean).join(' - ');
      if (car) L.push(x.car + ': ' + car);
    }
    L.push(x.total + ': ' + f3(inv.total) + ' ' + x.omr);
    L.push(x.paid + ': ' + f3(Calc.paid(inv)) + ' ' + x.omr);
    L.push('*' + x.due + ': ' + f3(Calc.balance(inv)) + ' ' + x.omr + '*');
    if (link) { L.push(''); L.push(x.link + ':'); L.push(link); }
    L.push(''); L.push(x.ask);
    if (s.phone) L.push(x.contact + ': ' + s.phone);
    L.push(x.thanks);
    return L.join('\n');
  }

  /* api.whatsapp.com is the official address (wa.me only redirects to it, and some networks block wa.me) */
  function waUrl(phone, text) { return 'https://api.whatsapp.com/send?' + (phone ? 'phone=' + phone + '&' : '') + 'text=' + encodeURIComponent(text); }
  /* straight to WhatsApp Web (no 'open the app?' page); with no number it falls back to the normal address */
  function webUrl(phone, text) { return phone ? 'https://web.whatsapp.com/send?phone=' + phone + '&text=' + encodeURIComponent(text) : waUrl('', text); }
  /* the text that is really sent: short enough for the address; falls back to fewer lines */
  function fit(inv, lang, link, text) {
    if (mode === 'reminder' || waUrl('96800000000', text).length <= MAX_URL) return text;
    var short = message(inv, lang, link, 8);
    if (waUrl('96800000000', short).length <= MAX_URL) return short;
    return message(inv, lang, link, 3);
  }

  /* ------------------------------------------------ the online link */
  function isLocalHost() { return location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname); }
  function canLink() { return Store.isServer() && !isLocalHost(); }
  function linkUrl() { return token ? new URL('api/index.php?action=pdf&t=' + token, location.href).href : ''; }

  /* ------------------------------------------------ window */
  function $s(id) { return $(id); }
  function rebuild() {
    if (!cur) return;
    var lang = $s('waLang').value;
    var link = $s('waLink').checked && state === 'ready' ? linkUrl() : '';
    $s('waMsg').value = mode === 'reminder' ? reminderMessage(cur, lang, link) : message(cur, lang, link);
    var st = '';
    if (!canLink()) st = isLocalHost() ? t('wa_link_local') : '';
    else if (state === 'pending') st = t('wa_link_pending');
    else if (state === 'failed') st = t('wa_link_failed');
    $s('waStatus').textContent = st;
  }
  function open(inv, opts) {
    if (!inv) return;
    mode = opts && opts.reminder ? 'reminder' : 'bill';
    $s('waTitleTxt').setAttribute('data-i18n', mode === 'reminder' ? 'wa_title_reminder' : 'wa_title'); $s('waTitleTxt').textContent = t(mode === 'reminder' ? 'wa_title_reminder' : 'wa_title');
    cur = inv; token = inv.shareToken || ''; $s('waErr').textContent = '';
    var cust = inv.customerId ? Store.customerById(inv.customerId) : null;
    $s('waPhone').value = inv.customerPhone || (cust && cust.phone) || '';
    $s('waLang').value = I18N.lang === 'en' ? 'en' : 'ar';
    $s('waSub').textContent = inv.number + ' · ' + inv.customerName;
    var linkOk = canLink() && Store.canWrite();                // the PDF can be kept on the server only on the real website, by someone who may write
    $s('waLink').closest('.switch').style.display = linkOk ? '' : 'none';
    $s('waLink').checked = linkOk;
    state = 'none';
    rebuild();
    prepPdf(inv, linkOk);
    App.openModal('waModal');
  }

  /* ---- the PDF (A4): made as soon as the window opens, and - on the real website - kept on the server, so that pressing the
          button can send the message with a link that opens the PDF at once (no waiting, no blocked pop-up) ---- */
  function pdfUi(on, busy) {
    var b = $s('waPdf'); b.hidden = !on; b.disabled = !!busy;
    $s('waPdfTxt').textContent = t(busy ? 'wa_pdf_preparing' : 'wa_pdf');
    var w = $s('waWeb'); w.disabled = !!on && !!busy;                                  // both ways to send the PDF wait until it is ready
    w.classList.toggle('b-wa', on); w.classList.toggle('b-soft', !on);
    $s('waWebTxt').textContent = t(on ? 'wa_pdf_web' : 'wa_web');
    $s('waPdfHint').hidden = !on; $s('waPdfDl').hidden = !on || !!busy;
    $s('waGo').classList.toggle('b-wa', !on); $s('waGo').classList.toggle('b-soft', on);          // no PDF possible: the text button becomes the main one
  }
  function prepPdf(inv, upload) {
    pdfRes = null;
    if (!window.Pdf || !window.html2canvas) { pdfUi(false); return; }
    pdfUi(true, true);
    Pdf.make(inv).then(function (r) {
      if (cur !== inv) return;                               // the window was closed or reopened for another bill
      pdfRes = r;
      if (!upload) { pdfUi(true, false); return; }
      state = 'pending'; rebuild();
      return Store.savePdf(inv.kind === 'quote' ? 'quotes' : 'invoices', inv.id, r.blob).then(function (tk) {
        if (cur !== inv) return;
        token = tk; state = 'ready'; rebuild(); pdfUi(true, false);
      }, function () {
        if (cur !== inv) return;
        state = 'failed'; $s('waLink').checked = false; rebuild(); pdfUi(true, false);
      });
    }, function () { if (cur === inv) { pdfUi(false); $s('waErr').textContent = t('wa_pdf_failed'); } });
  }
  /* send the bill as a PDF.  App button: the system share list gives the WhatsApp app (phone, or the Windows / Mac app) the PDF file itself;
     where there is no share list the PDF is saved and WhatsApp opens on the chat.  Web button: the PDF is saved to Downloads and
     WhatsApp Web opens on the chat (with the link that opens the PDF, on the real website). */
  function sendPdf(web) {
    if (!pdfRes) return;
    var phone = normalize($s('waPhone').value);
    if (phone === null) { $s('waErr').textContent = t('wa_bad_phone'); return; }
    $s('waErr').textContent = '';
    var text = $s('waMsg').value, sent = cur, r = pdfRes, linked = state === 'ready' && $s('waLink').checked;
    var done = function () { if (mode === 'reminder' && window.Reminders) Reminders.markSent(sent); };
    var openChat = function () {
      var win = window.open((web ? webUrl : waUrl)(phone, text), '_blank');
      if (!win) { $s('waErr').textContent = t('wa_popup'); return false; }
      try { win.opener = null; } catch (e) { /* cross-origin: nothing to cut */ }
      done(); return true;
    };
    // WhatsApp Web: no share list (it only offers apps that may not be installed).
    // The PDF is saved to Downloads and WhatsApp Web opens on the chat; on the real website the message also carries the link that opens the PDF.
    if (web) {
      Pdf.download(r);
      toast(t('wa_web_pdf_saved'));
      openChat();
      return;
    }
    Pdf.share(r, text).then(function (res) {
      if (res === 'shared') { toast(t('wa_opened')); done(); return; }
      if (res === 'cancel') return;
      if (linked) { toast(t('wa_pdf_link_sent')); openChat(); return; }
      Pdf.download(r); toast(t('wa_pdf_saved'));               // the share list is not available (demo / no connection): save it, he attaches it with the paperclip
      setTimeout(openChat, 700);
    });
  }

  function go(web) {
    var raw = $s('waPhone').value, phone = normalize(raw);
    if (phone === null) { $s('waErr').textContent = t('wa_bad_phone'); return; }
    if (state === 'pending' && $s('waLink').checked) { $s('waErr').textContent = t('wa_link_pending'); return; }
    $s('waErr').textContent = '';
    var text = fit(cur, $s('waLang').value, $s('waLink').checked && state === 'ready' ? linkUrl() : '', $s('waMsg').value);
    if (text !== $s('waMsg').value) $s('waMsg').value = text;      // too long for one address: show what is really sent
    var w = window.open((web ? webUrl : waUrl)(phone, text), '_blank');         // (with "noopener" the browser always answers null, so a blocked pop-up could not be told apart)
    if (!w) { $s('waErr').textContent = t('wa_popup'); return; }
    try { w.opener = null; } catch (e) { /* cross-origin: nothing to cut */ }
    toast(t('wa_opened'));
    if (mode === 'reminder' && window.Reminders) Reminders.markSent(cur);        // remember it and move the next reminder forward
  }
  function copy() {
    var ta = $s('waMsg'), text = ta.value;
    var done = function () { toast(t('wa_copied')); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { ta.select(); try { document.execCommand('copy'); done(); } catch (e) { /* user can copy by hand */ } });
    } else { ta.select(); try { document.execCommand('copy'); done(); } catch (e) { /* user can copy by hand */ } }
  }

  function init() {
    $s('waGo').addEventListener('click', function () { go(false); });
    $s('waWeb').addEventListener('click', function () { if (pdfRes) sendPdf(true); else go(true); });
    $s('waPdf').addEventListener('click', function () { sendPdf(false); });
    $s('waPdfDl').addEventListener('click', function () { if (pdfRes) { Pdf.download(pdfRes); toast(t('pdf_saved', { name: pdfRes.name })); } });
    $s('waCopy').addEventListener('click', copy);
    $s('waLang').addEventListener('change', rebuild);
    $s('waLink').addEventListener('change', rebuild);
    $s('waModal').addEventListener('click', function (e) { if (e.target === $s('waModal') || e.target.closest('[data-close]')) cur = null; });
  }

  window.Whatsapp = { init: init, open: open, normalize: normalize, message: message, reminderMessage: reminderMessage, waUrl: waUrl, webUrl: webUrl };
})();
