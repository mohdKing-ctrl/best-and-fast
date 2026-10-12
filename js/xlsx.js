/* xlsx.js — writes a genuine .xlsx workbook with no external library.
   An .xlsx file is a ZIP of XML parts, so this builds both: a minimal
   ZIP writer (stored, uncompressed) and the handful of XML parts Excel
   needs. Opens natively in Excel, LibreOffice, Numbers and Google Sheets. */
(function () {
  'use strict';

  /* ---------------- CRC-32 ---------------- */
  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  var enc = new TextEncoder();

  /* ---------------- ZIP (store method) ---------------- */
  function zip(files) {
    var chunks = [], central = [], offset = 0;

    // DOS time/date — the current moment, good enough for a report file.
    var now = new Date();
    var dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((now.getSeconds() / 2) & 31);
    var dosDate = (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);

    files.forEach(function (f) {
      var nameBytes = enc.encode(f.name);
      var data = enc.encode(f.content);
      var crc = crc32(data);

      var local = new Uint8Array(30 + nameBytes.length);
      var lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034B50, true);   // local file header signature
      lv.setUint16(4, 20, true);           // version needed
      lv.setUint16(6, 0x0800, true);       // UTF-8 filename flag
      lv.setUint16(8, 0, true);            // method: stored
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      chunks.push(local, data);

      var cd = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014B50, true);   // central directory signature
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);
      central.push(cd);

      offset += local.length + data.length;
    });

    var cdSize = central.reduce(function (a, c) { return a + c.length; }, 0);
    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054B50, true);     // end of central directory
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);

    return new Blob(chunks.concat(central, [end]), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  /* ---------------- XML helpers ---------------- */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      /* strip control characters Excel refuses to open */
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function colName(n) {                      // 0 -> A, 26 -> AA
    var s = '';
    n = n + 1;
    while (n > 0) {
      var r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  /* A cell is a raw value, or {v: value, s: styleIndex} */
  function cellXml(value, rowIdx, colIdx, styleOverride) {
    var ref = colName(colIdx) + (rowIdx + 1);
    var v = value, s = styleOverride;

    if (v && typeof v === 'object' && !(v instanceof Date)) {
      s = (v.s !== undefined) ? v.s : s;
      v = v.v;
    }
    var st = (s !== undefined && s !== null) ? ' s="' + s + '"' : '';

    if (v === null || v === undefined || v === '') return '<c r="' + ref + '"' + st + '/>';
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + st + '><v>' + v + '</v></c>';
    return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  }

  /* sheet = { name, rows: [[...]], cols: [widths], rtl: bool, headerRows: n } */
  function sheetXml(sheet) {
    var cols = '';
    if (sheet.cols && sheet.cols.length) {
      cols = '<cols>' + sheet.cols.map(function (w, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
      }).join('') + '</cols>';
    }

    var rows = sheet.rows.map(function (row, r) {
      var cells = row.map(function (cell, c) { return cellXml(cell, r, c); }).join('');
      return '<row r="' + (r + 1) + '">' + cells + '</row>';
    }).join('');

    var freeze = sheet.headerRows
      ? '<pane ySplit="' + sheet.headerRows + '" topLeftCell="A' + (sheet.headerRows + 1) +
        '" activePane="bottomLeft" state="frozen"/>'
      : '';

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"' + (sheet.rtl ? ' rightToLeft="1"' : '') + '>' +
      freeze + '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      cols +
      '<sheetData>' + rows + '</sheetData>' +
      '</worksheet>';
  }

  /* Style indices used by callers:
     0 normal | 1 bold | 2 title (bold, large) | 3 money | 4 bold money | 5 muted */
  function stylesXml(decimals) {
    var fmt = decimals > 0 ? '0.' + new Array(decimals + 1).join('0') : '0';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="' + fmt + '"/></numFmts>' +
      '<fonts count="4">' +
        '<font><sz val="11"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="14"/><color rgb="FF164D70"/><name val="Calibri"/></font>' +
        '<font><sz val="11"/><color rgb="FF808080"/><name val="Calibri"/></font>' +
      '</fonts>' +
      '<fills count="3">' +
        '<fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFDCEBF2"/><bgColor indexed="64"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="2">' +
        '<border><left/><right/><top/><bottom/><diagonal/></border>' +
        '<border><left/><right/><top/><bottom style="thin"><color rgb="FF8DB3C7"/></bottom><diagonal/></border>' +
      '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="6">' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
        '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
        '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
        '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
        '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '</cellXfs>' +
      /* Excel and openpyxl both expect a named default style to exist. */
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  /* Excel rejects these characters in a sheet name, and caps it at 31 chars. */
  function safeSheetName(n, i) {
    var s = String(n || ('Sheet' + (i + 1))).replace(/[\\\/\?\*\[\]:]/g, ' ').trim().slice(0, 31);
    return s || ('Sheet' + (i + 1));
  }

  /* build(sheets, opts) -> Blob */
  function build(sheets, opts) {
    opts = opts || {};
    var names = sheets.map(function (s, i) { return safeSheetName(s.name, i); });

    var files = [
      { name: '[Content_Types].xml', content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map(function (s, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ' +
                 'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join('') +
        '</Types>' },

      { name: '_rels/.rels', content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>' },

      { name: 'xl/workbook.xml', content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names.map(function (n, i) {
          return '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
        }).join('') +
        '</sheets></workbook>' },

      { name: 'xl/_rels/workbook.xml.rels', content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) {
          return '<Relationship Id="rId' + (i + 1) + '" ' +
                 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
                 'Target="worksheets/sheet' + (i + 1) + '.xml"/>';
        }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" ' +
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>' },

      { name: 'xl/styles.xml', content: stylesXml(opts.decimals === undefined ? 3 : opts.decimals) }
    ];

    sheets.forEach(function (s, i) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', content: sheetXml(s) });
    });

    return zip(files);
  }

  function save(filename, sheets, opts) {
    var blob = build(sheets, opts);
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  window.XLSX = { build: build, save: save, S: { NORMAL: 0, HEAD: 1, TITLE: 2, MONEY: 3, MONEY_B: 4, MUTED: 5 } };
})();
