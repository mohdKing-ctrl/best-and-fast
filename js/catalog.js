/* catalog.js - sections, units, job stages and the starting service list for the garage.
   Prices below are EXAMPLES to get started. The owner edits them on the Price List page, and
   can still change any price on each invoice because every job is different. */
(function () {
  'use strict';

  var CATS = [
    { id: 'accident', en: 'Accident Repair',      ar: 'إصلاح الحوادث',          ic: '💥', ob: false },
    { id: 'paint',    en: 'Vehicle Painting',     ar: 'صبغ المركبات',           ic: '🎨', ob: false },
    { id: 'mech',     en: 'Mechanical Repair',    ar: 'إصلاح ميكانيك المركبات', ic: '⚙️', ob: false },
    { id: 'parts',    en: 'Used Spare Parts',     ar: 'قطع غيار مستعملة',       ic: '🔩', ob: false },
    { id: 'other',    en: 'Other Services',       ar: 'خدمات أخرى',             ic: '🧾', ob: false }
  ];

  var UNITS = [
    { id: 'job',    en: 'job',    ar: 'عمل' },
    { id: 'service', en: 'service', ar: 'خدمة' },
    { id: 'panel',  en: 'panel',  ar: 'قطعة بودي' },
    { id: 'piece',  en: 'piece',  ar: 'قطعة' },
    { id: 'set',    en: 'set',    ar: 'طقم' },
    { id: 'hour',   en: 'hour',   ar: 'ساعة' },
    { id: 'litre',  en: 'litre',  ar: 'لتر' },
    { id: 'day',    en: 'day',    ar: 'يوم' }
  ];

  /* The owner's own sections and units live in the settings (customCats / customUnits).
     setCustom() rebuilds the two shared lists in place, so every screen that reads
     Catalog.CATS / Catalog.UNITS / Catalog.cat() / Catalog.unit() sees them automatically. */
  var BASE_CATS = CATS.length, BASE_UNITS = UNITS.length;
  function setCustom(settings) {
    CATS.length = BASE_CATS; UNITS.length = BASE_UNITS;
    ((settings && settings.customCats) || []).forEach(function (x) {
      if (x && x.id) CATS.push({ id: x.id, en: x.en || x.ar, ar: x.ar || x.en, ic: x.ic || '🗂️', ob: !!x.ob, custom: true });
    });
    ((settings && settings.customUnits) || []).forEach(function (x) {
      if (x && x.id) UNITS.push({ id: x.id, en: x.en || x.ar, ar: x.ar || x.en, custom: true });
    });
  }

  /* What kind of bill: a workshop job on a customer's vehicle, or a plain sale of used parts. */
  var KINDS = [
    { id: 'repair', en: 'Workshop job', ar: 'أعمال الورشة' },
    { id: 'parts',  en: 'Spare parts sale', ar: 'بيع قطع غيار' },
    { id: 'quote',  en: 'Quotation', ar: 'عرض أسعار' }
  ];

  /* A quotation is not a bill: nothing is paid on it. It is open, then accepted (and turned into a bill) or rejected. */
  var QUOTE_STATUS = ['open', 'accepted', 'rejected'];

  /* Expenses are kept per section; "General" is for costs that belong to the whole garage (rent, electricity ...). */
  var GENERAL = { id: 'general', en: 'General (whole garage)', ar: 'عام (للورشة كلها)', ic: '🏢' };
  var EXPENSE_TYPES = [
    ['Spare parts purchase', 'شراء قطع غيار'], ['Paint & materials', 'دهانات ومواد'], ['Workers wages', 'أجور العمال'],
    ['Rent', 'إيجار'], ['Electricity & water', 'كهرباء وماء'], ['Tools & equipment', 'أدوات ومعدات'],
    ['Fuel & transport', 'وقود ونقل'], ['Repairs & maintenance', 'صيانة وإصلاحات'], ['Other', 'أخرى']
  ];
  function expSections() { return CATS.concat([GENERAL]); }

  /* Stages of a workshop job, in order. */
  var JOBS = ['received', 'repair', 'ready', 'delivered'];

  var MAKES = [
    ['Toyota', 'تويوتا'], ['Nissan', 'نيسان'], ['Hyundai', 'هيونداي'], ['Kia', 'كيا'], ['Honda', 'هوندا'],
    ['Mitsubishi', 'ميتسوبيشي'], ['Mazda', 'مازدا'], ['Suzuki', 'سوزوكي'], ['Isuzu', 'إيسوزو'], ['Ford', 'فورد'],
    ['Chevrolet', 'شيفروليه'], ['GMC', 'جي إم سي'], ['Lexus', 'لكزس'], ['Mercedes-Benz', 'مرسيدس'], ['BMW', 'بي إم دبليو'],
    ['Land Rover', 'لاند روفر'], ['Jeep', 'جيب'], ['Dodge', 'دودج'], ['Volkswagen', 'فولكس واجن'], ['Peugeot', 'بيجو'],
    ['Renault', 'رينو'], ['Subaru', 'سوبارو'], ['Mini bus / Van', 'حافلة صغيرة / فان'], ['Pickup', 'بيك أب']
  ];

  function defaultSettings() {
    return {
      name: 'Best and Fast', nameAr: 'بيست آند فاست',
      addr: 'Hassas Industrial Area, Samail, Sultanate of Oman',
      addrAr: 'ولاية سمائل - الصناعية هصاص - سلطنة عمان',
      phone: '97230444', email: 'en.abujihad@gmail.com',
      cr: '1368308', vatNo: '', vatOn: false, vatPct: 5,
      prefix: 'INV', quotePrefix: 'QT', quoteDays: 14, remindDays: 3, crNameAr: '', crNameEn: '', printScale: 100, paper: 'a4',
      lang: 'ar', theme: 'light',
      footer: 'Thank you for your business  |  شكراً لتعاملكم معنا',
      customCats: [], customUnits: [],
      terms: '',
      bank: ''
    };
  }

  /* [category, English, Arabic, example price (0 = decided on each invoice), unit] */
  var SERVICE_ROWS = [
    ['accident', 'Dent removal & panel beating',            'سمكرة وتعديل مكان الصدمة',       15, 'panel'],
    ['accident', 'Front bumper repair',                     'إصلاح الصدام الأمامي',           25, 'job'],
    ['accident', 'Rear bumper repair',                      'إصلاح الصدام الخلفي',            25, 'job'],
    ['accident', 'Door repair',                             'إصلاح باب',                      30, 'panel'],
    ['accident', 'Fender (wing) repair',                    'إصلاح رفرف',                     25, 'panel'],
    ['accident', 'Hood (bonnet) repair',                    'إصلاح الكبوت',                   30, 'panel'],
    ['accident', 'Chassis straightening',                   'شد وتعديل الشاصيه',               0, 'job'],
    ['accident', 'Welding work',                            'أعمال لحام',                      0, 'job'],
    ['accident', 'Glass replacement (labour)',              'تركيب زجاج (أجرة)',              10, 'job'],
    ['accident', 'Headlight / taillight fitting',           'تركيب فانوس أمامي / خلفي',        5, 'piece'],
    ['accident', 'Insurance estimate / inspection',         'كشف وتقدير للتأمين',              5, 'job'],
    ['accident', 'Full accident repair (agreed amount)',    'إصلاح حادث كامل (مبلغ متفق عليه)', 0, 'job'],

    ['paint', 'Full body paint',                            'صبغ كامل للسيارة',              250, 'job'],
    ['paint', 'Single panel paint',                         'صبغ قطعة واحدة',                 30, 'panel'],
    ['paint', 'Bumper paint',                               'صبغ صدام',                       35, 'piece'],
    ['paint', 'Door paint',                                 'صبغ باب',                        30, 'panel'],
    ['paint', 'Hood / roof paint',                          'صبغ كبوت / سقف',                 40, 'panel'],
    ['paint', 'Spot / touch-up paint',                      'صبغ موضعي / ترقيع',              10, 'job'],
    ['paint', 'Sanding, filler & primer',                   'سنفرة ومعجون وأساس',             10, 'panel'],
    ['paint', 'Clear coat (lacquer)',                       'ورنيش حماية',                    15, 'panel'],
    ['paint', 'Colour matching (paint mixing)',             'خلط وتركيب اللون',                5, 'job'],
    ['paint', 'Polishing & waxing',                         'تلميع وتشميع',                   25, 'job'],

    ['mech', 'Engine oil & filter change',                  'تغيير زيت وفلتر',                12, 'service'],
    ['mech', 'Computer diagnostic scan',                    'فحص كمبيوتر',                     5, 'service'],
    ['mech', 'Brake pads replacement (labour)',             'تبديل فحمات الفرامل (أجرة)',     10, 'service'],
    ['mech', 'Brake discs service',                         'خدمة أقراص الفرامل',             15, 'service'],
    ['mech', 'Air-conditioning service & gas',              'صيانة وتعبئة غاز المكيف',        15, 'service'],
    ['mech', 'Battery check / fitting',                     'فحص / تركيب بطارية',              3, 'service'],
    ['mech', 'Wheel alignment & balancing',                 'ضبط زوايا وترصيص',                8, 'service'],
    ['mech', 'Tyre fitting',                                'تركيب إطار',                      2, 'piece'],
    ['mech', 'Suspension & steering repair',                'إصلاح العفشة والتوجيه',           0, 'job'],
    ['mech', 'Cooling system / radiator repair',            'إصلاح نظام التبريد / الرديتر',    0, 'job'],
    ['mech', 'Electrical wiring repair',                    'إصلاح كهرباء السيارة',            0, 'job'],
    ['mech', 'Gearbox repair',                              'إصلاح القير',                     0, 'job'],
    ['mech', 'Engine repair / overhaul',                    'إصلاح / إعادة تأهيل المحرك',      0, 'job'],
    ['mech', 'Labour (per hour)',                           'أجرة عامل (بالساعة)',             5, 'hour'],

    ['parts', 'Used engine',                                'محرك مستعمل',                     0, 'piece'],
    ['parts', 'Used gearbox',                               'قير مستعمل',                      0, 'piece'],
    ['parts', 'Used bumper',                                'صدام مستعمل',                    20, 'piece'],
    ['parts', 'Used door',                                  'باب مستعمل',                     35, 'piece'],
    ['parts', 'Used hood (bonnet)',                         'كبوت مستعمل',                    40, 'piece'],
    ['parts', 'Used fender (wing)',                         'رفرف مستعمل',                    25, 'piece'],
    ['parts', 'Used headlight',                             'فانوس أمامي مستعمل',             25, 'piece'],
    ['parts', 'Used taillight',                             'فانوس خلفي مستعمل',              15, 'piece'],
    ['parts', 'Used radiator',                              'رديتر مستعمل',                   20, 'piece'],
    ['parts', 'Used alternator / starter',                  'دينمو / سلف مستعمل',             18, 'piece'],
    ['parts', 'Used rims (wheels)',                         'جنطات مستعملة',                   0, 'set'],
    ['parts', 'Used seats / interior part',                 'كراسي / قطعة داخلية مستعملة',     0, 'piece'],
    ['parts', 'Used part (other)',                          'قطعة غيار مستعملة (أخرى)',        0, 'piece'],

    ['other', 'Other service',                              'خدمة أخرى',                       0, 'service']
  ];

  function defaultServices() {
    var catOb = {};
    CATS.forEach(function (c) { catOb[c.id] = c.ob; });
    return SERVICE_ROWS.map(function (r, i) {
      return { id: 's' + (i + 1), cat: r[0], n: r[1], a: r[2], price: r[3], unit: r[4], ob: catOb[r[0]] };
    });
  }

  window.Catalog = {
    CATS: CATS, UNITS: UNITS, KINDS: KINDS, JOBS: JOBS, MAKES: MAKES, QUOTE_STATUS: QUOTE_STATUS, EXPENSE_TYPES: EXPENSE_TYPES, GENERAL: GENERAL, expSections: expSections,
    expSection: function (id) { return expSections().filter(function (c) { return c.id === id; })[0] || GENERAL; },
    defaultSettings: defaultSettings, defaultServices: defaultServices,
    setCustom: setCustom,
    cat: function (id) { return CATS.filter(function (c) { return c.id === id; })[0] || CATS.filter(function (c) { return c.id === 'other'; })[0]; },
    unit: function (id) { return UNITS.filter(function (u) { return u.id === id; })[0] || UNITS[0]; },
    kind: function (id) { return KINDS.filter(function (d) { return d.id === id; })[0] || KINDS[0]; }
  };
})();
