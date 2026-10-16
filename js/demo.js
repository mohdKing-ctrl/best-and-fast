/* demo.js - the example customers and bills a brand-new system starts with, so the owner can see how
   everything works (bills, payments, stages, reports, WhatsApp). Every record carries demo:true, so
   Settings -> "Remove example data" deletes exactly these and never touches real work.
   Example customers have NO phone number on purpose: nothing can be sent to a stranger by mistake -
   to test WhatsApp, type your own number in the send window. */
(function () {
  'use strict';

  function build(settings, userName) {
    var prefix = (settings && settings.prefix) || 'INV';
    var svc = Catalog.defaultServices();
    var day = function (n) { return ymd(addDays(n)); };

    function item(en, q, price) {
      var s = svc.filter(function (x) { return x.n === en; })[0];
      if (!s) throw new Error('demo: unknown service ' + en);
      return { sid: s.id, cat: s.cat, n: s.n, a: s.a, unit: s.unit, ob: false, price: price != null ? price : s.price, q: q };
    }

    var customers = [
      { id: 'demo-c1', name: 'أحمد بن سالم الهنائي', phone: '', company: false, vatNo: '', addr: '', notes: 'عميل مثال' },
      { id: 'demo-c2', name: 'خالد بن محمد البلوشي', phone: '', company: false, vatNo: '', addr: '', notes: 'عميل مثال' },
      { id: 'demo-c3', name: 'شركة النخيل للنقل', phone: '', company: true, vatNo: '', addr: 'سمائل', notes: 'عميل مثال - شركة' },
      { id: 'demo-c4', name: 'سعيد بن ناصر الرحبي', phone: '', company: false, vatNo: '', addr: '', notes: 'عميل مثال' },
      { id: 'demo-c5', name: 'مؤسسة الواحة للمقاولات', phone: '', company: true, vatNo: '', addr: 'سمائل', notes: 'عميل مثال - شركة' },
      { id: 'demo-c6', name: 'شركة الخليج للتأمين', phone: '', company: true, vatNo: '', addr: 'مسقط', notes: 'عميل مثال - شركة تأمين' }
    ].map(function (c) { c.demo = true; return c; });
    var C = {}; customers.forEach(function (c) { C[c.id] = c; });

    /* d = days ago, due = days from today (expected delivery), pays = [[days ago, amount, method], ...] */
    var specs = [
      { d: 9, t: '09:40', c: 'demo-c1', kind: 'repair', plate: '5231 AB', car: 'Toyota Camry', color: 'أبيض', km: '142000',
        fault: 'صدمة خفيفة في الصدام الأمامي', items: [item('Front bumper repair', 1), item('Bumper paint', 1), item('Polishing & waxing', 1)],
        disc: 5, pays: [[9, 80, 'cash']], job: 'delivered' },
      { d: 8, t: '11:15', c: null, kind: 'parts', items: [item('Used headlight', 1), item('Used bumper', 1)],
        pays: [[8, 45, 'cash']], job: 'delivered', note: 'بيع قطع - بدون تركيب' },
      { d: 6, t: '10:05', c: 'demo-c2', kind: 'repair', plate: '8120 KT', car: 'Nissan Patrol', color: 'رمادي', km: '210000',
        fault: 'حادث جانبي: ضرر في الباب والرفرف الأيمن',
        items: [item('Door repair', 1), item('Door paint', 1), item('Fender (wing) repair', 1), item('Single panel paint', 1)],
        pays: [[6, 50, 'cash'], [2, 65, 'transfer']], job: 'delivered' },
      { d: 5, t: '08:50', c: 'demo-c3', kind: 'repair', plate: '3302 NK', car: 'Isuzu', color: 'أبيض', km: '98000', due: -3,
        fault: 'صيانة دورية وصوت في الفرامل',
        items: [item('Engine oil & filter change', 1), item('Brake pads replacement (labour)', 1), item('Computer diagnostic scan', 1), item('Labour (per hour)', 3)],
        pays: [], job: 'ready', note: 'الدفع بعد نهاية الشهر', remind: -1, remindNote: 'قال إنه سيدفع بعد صرف الراتب' },
      { d: 4, t: '12:30', c: 'demo-c5', kind: 'repair', plate: '6710 MM', car: 'Mitsubishi', color: 'أزرق', km: '175000', due: 3,
        fault: 'حادث أمامي: تعديل الشاصيه وصبغ كامل للمقدمة',
        items: [item('Full accident repair (agreed amount)', 1, 380), item('Colour matching (paint mixing)', 1)],
        pays: [[4, 200, 'transfer']], job: 'repair', note: 'مبلغ متفق عليه - دفعة أولى ٢٠٠', remind: 2 },
      { d: 3, t: '16:20', c: 'demo-c1', kind: 'repair', plate: '2288 HD', car: 'Hyundai', color: 'فضي', km: '88000',
        fault: 'المكيف لا يبرد',
        items: [item('Air-conditioning service & gas', 1), item('Battery check / fitting', 1)],
        pays: [[3, 18, 'cash']], job: 'delivered' },
      { d: 2, t: '09:10', c: 'demo-c4', kind: 'repair', plate: '9013 RQ', car: 'Kia', color: 'أسود', km: '120000',
        fault: 'فحص محرك', items: [item('Engine repair / overhaul', 1, 150)],
        pays: [], job: 'received', voided: true, note: 'ألغى العميل العمل - مثال على فاتورة ملغاة' },
      { d: 1, t: '14:00', c: 'demo-c4', kind: 'repair', plate: '9013 RQ', car: 'Kia', color: 'أسود', km: '120050', due: 1,
        fault: 'اهتزاز في المقود وصوت في العفشة',
        items: [item('Computer diagnostic scan', 1), item('Suspension & steering repair', 1, 60)],
        pays: [[1, 30, 'cash']], job: 'repair', remind: 0 },
      { d: 0, t: '09:05', c: null, kind: 'repair', plate: '7745 TY', car: 'Toyota', color: 'ذهبي', km: '256000',
        fault: 'تغيير زيت', items: [item('Engine oil & filter change', 1)],
        pays: [[0, 12, 'cash']], job: 'delivered' },
      { d: 0, t: '10:30', c: 'demo-c3', kind: 'repair', plate: '1199 LC', car: 'Toyota', color: 'أبيض', km: '64000', due: 2,
        fault: 'ضرر في الصدام الخلفي والفانوس',
        items: [item('Rear bumper repair', 1), item('Headlight / taillight fitting', 1)],
        pays: [], job: 'received', remind: 3 }
    ];

    var invoices = specs.map(function (sp, i) {
      var no = i + 1, cust = sp.c ? C[sp.c] : null;
      var tt = Calc.totals(sp.items, sp.disc || 0, false, 0);
      var doc = {
        id: String(no), no: no, number: prefix + '-' + String(no).padStart(5, '0'),
        created: Math.floor(addDays(-sp.d).getTime() / 1000), createdBy: userName || '',
        date: day(-sp.d), time: sp.t,
        customerId: cust ? cust.id : null, customerName: cust ? cust.name : 'عميل نقدي', customerPhone: '',
        customerVat: '', customerAddr: cust && cust.company ? cust.addr : '', company: !!(cust && cust.company),
        kind: sp.kind, plate: sp.plate || '', car: sp.car || '', color: sp.color || '', km: sp.km || '', vin: sp.vin || '', claim: sp.claim || '',
        due: sp.due !== undefined ? day(sp.due) : '', fault: sp.fault || '',
        items: sp.items, discount: tt.disc, vatPct: tt.vatPct, vat: tt.vat, office: tt.office, behalf: tt.behalf, total: tt.total,
        payments: sp.pays.map(function (p) { return { date: day(-p[0]), amount: p[1], method: p[2] }; }),
        job: sp.job, note: sp.note || '', void: !!sp.voided,
        remindOn: sp.remind !== undefined ? day(sp.remind) : '', remindNote: sp.remindNote || '', lastReminded: '',
        cr: settings ? settings.cr : '', vatNo: settings ? settings.vatNo : '', demo: true
      };
      if (sp.voided) doc.voidedAt = day(-sp.d);
      return doc;
    });

    /* ---- quotations: an insurance claim, a car imported from America, an expired one, a rejected one ---- */
    var qspecs = [
      { d: 15, t: '10:15', c: 'demo-c1', plate: '5231 AB', car: 'Toyota Camry', color: 'أبيض', km: '143000', valid: -1, status: 'open',
        fault: 'تقدير إصلاح وصبغ الصدام الخلفي', items: [item('Rear bumper repair', 1), item('Bumper paint', 1)], note: 'انتهت مدة صلاحية العرض - مثال' },
      { d: 7, t: '11:40', c: 'demo-c6', plate: '4410 XY', car: 'Toyota Land Cruiser', color: 'أبيض', km: '88000', valid: 7, status: 'accepted',
        claim: 'CLM-2026-0142', vin: 'JTMHV05J004123456', fault: 'عرض أسعار لشركة التأمين - ضرر أمامي كامل',
        items: [item('Front bumper repair', 1), item('Hood (bonnet) repair', 1), item('Fender (wing) repair', 2), item('Headlight / taillight fitting', 2), item('Single panel paint', 4), item('Colour matching (paint mixing)', 1)],
        note: 'وافقت شركة التأمين - يمكن تحويله إلى فاتورة' },
      { d: 3, t: '15:30', c: 'demo-c2', plate: '', car: 'Chevrolet Camaro', color: 'أحمر', km: '31000', valid: 11, status: 'open',
        vin: '1G1FB1RS5L0123456', fault: 'سيارة مستوردة من أمريكا - تقدير إصلاح وصبغ كامل قبل التسجيل',
        items: [item('Full accident repair (agreed amount)', 1, 650), item('Full body paint', 1), item('Colour matching (paint mixing)', 1), item('Polishing & waxing', 1)], disc: 20, note: 'الخصم للعميل الدائم' },
      { d: 2, t: '09:20', c: 'demo-c4', plate: '9013 RQ', car: 'Kia Sportage', color: 'أسود', km: '120040', valid: 12, status: 'rejected',
        fault: 'تقدير إعادة تأهيل المحرك', items: [item('Engine repair / overhaul', 1, 280), item('Labour (per hour)', 6)], note: 'رفض العميل السعر - مثال' }
    ];
    var quotes = qspecs.map(function (sp, i) {
      var no = i + 1, cust = C[sp.c], tt = Calc.totals(sp.items, sp.disc || 0, false, 0);
      return {
        id: String(no), no: no, number: (settings && settings.quotePrefix || 'QT') + '-' + String(no).padStart(5, '0'),
        created: Math.floor(addDays(-sp.d).getTime() / 1000), createdBy: userName || '',
        date: day(-sp.d), time: sp.t, validUntil: day(sp.valid),
        customerId: cust.id, customerName: cust.name, customerPhone: '', customerVat: '', customerAddr: cust.company ? cust.addr : '', company: !!cust.company,
        kind: 'quote', plate: sp.plate, car: sp.car, color: sp.color, km: sp.km, vin: sp.vin || '', claim: sp.claim || '', fault: sp.fault,
        items: sp.items, discount: tt.disc, vatPct: tt.vatPct, vat: tt.vat, office: tt.office, behalf: tt.behalf, total: tt.total,
        payments: [], status: sp.status, convertedTo: '', note: sp.note || '', void: false,
        cr: settings ? settings.cr : '', vatNo: settings ? settings.vatNo : '', demo: true
      };
    });

    /* ---- expenses per section ---- */
    var xs = [
      ['general', 'Rent', 'إيجار الورشة - شهر أكتوبر', 80, 10, 'transfer'], ['general', 'Electricity & water', 'فاتورة الكهرباء والماء', 38.5, 8, 'cash'],
      ['general', 'Workers wages', 'أجور العمال', 180, 5, 'transfer'], ['general', 'Tools & equipment', 'مفاتيح وعدة يدوية', 45, 4, 'cash'],
      ['accident', 'Spare parts purchase', 'غطاء صدام من المورد', 28, 8, 'cash'], ['accident', 'Repairs & maintenance', 'غاز وسلك لحام', 12.5, 6, 'cash'],
      ['paint', 'Paint & materials', 'دهان أبيض وأساس', 85, 7, 'card'], ['paint', 'Paint & materials', 'ورنيش وثنر', 32.4, 3, 'cash'], ['paint', 'Other', 'سنفرة ومعجون', 14.2, 2, 'cash'],
      ['mech', 'Spare parts purchase', 'فحمات فرامل وفلاتر', 41.7, 5, 'cash'], ['mech', 'Other', 'مخزون زيت محرك', 56, 1, 'card'],
      ['parts', 'Spare parts purchase', 'شراء قطع مستعملة من المزاد', 30, 9, 'transfer'], ['parts', 'Fuel & transport', 'نقل القطع', 8, 6, 'cash']
    ];
    var expenses = xs.map(function (x, i) {
      return { id: 'demo-e' + (i + 1), date: day(-x[4]), section: x[0], type: x[1], desc: x[2], amount: x[3], method: x[5], note: '', createdBy: userName || '', demo: true };
    });

    /* ---- personal reminders: one due now, some coming, one already done ---- */
    var ms = [
      ['الاتصال بمورد الدهان لطلب الدفعة الجديدة', 'اسأل عن سعر الدهان الأبيض واللون الأحمر', 0, '', false],
      ['تجديد رخصة البلدية', 'أحضر السجل التجاري وصورة الرخصة القديمة', 5, '', false],
      ['شراء مواد التلميع', '', 1, '09:00', false],
      ['دفع إيجار الورشة', '', -3, '', true]
    ];
    var memos = ms.map(function (m, i) {
      return { id: 'demo-m' + (i + 1), title: m[0], note: m[1], date: day(m[2]), time: m[3], done: m[4], doneAt: m[4] ? day(m[2]) : '', demo: true };
    });
    return { customers: customers, invoices: invoices, quotes: quotes, expenses: expenses, memos: memos, counter: invoices.length, qcounter: quotes.length };
  }

  window.Demo = { build: build };
})();
