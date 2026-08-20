const pptx = require("pptxgenjs");
const pres = new pptx();
pres.layout = "LAYOUT_WIDE";                 // 13.3 x 7.5
pres.rtlMode = true;
pres.author = "Hani Alsulami";
pres.company = "Makkah Health Cluster";
pres.title = "سديد — عرض للإدارة التنفيذية";

const F = "Arial";
const NAVY="12384F", BLUE="1B6FA8", GREEN="0B7A5E", RED="C4362F", AMBER="96590F",
      SURF="EFF4F9", BORD="D6E2ED", MUTED="4E657A", W="FFFFFF",
      ICE="9FC8E0", DIM="7BA0B8", CARD="FFFFFF";
const IMG="../docs/img/", SP="./";
const LTR = (t) => "‪" + t + "‬";   // LRE..PDF — for standalone latin/number displays

const T = (o) => Object.assign({ fontFace:F, rtlMode:true, align:"right", margin:0 }, o);
const sh = () => ({ type:"outer", color:NAVY, opacity:0.10, blur:10, offset:2, angle:90 });

function card(s, x, y, w, h, opt={}) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius:0.06,
    fill:{ color: opt.fill || CARD },
    line:{ color: opt.line || BORD, width: opt.lw === undefined ? 1 : opt.lw },
    shadow: opt.flat ? undefined : sh(),
  });
}
function box(s, x, y, w, h, fill, line) {   // square-cornered, no shadow (table cells)
  s.addShape(pres.ShapeType.rect, { x, y, w, h,
    fill:{color:fill}, line:{ color: line||BORD, width: 1 } });
}
function circle(s, x, y, d, txt, fill, tcol, sz) {
  s.addShape(pres.ShapeType.ellipse, { x, y, w:d, h:d, fill:{color:fill}, line:{color:fill,width:0} });
  s.addText(txt, T({ x, y, w:d, h:d, align:"center", valign:"middle",
                     fontSize: sz||16, bold:true, color: tcol||W }));
}
function head(s, kicker, title, sub) {
  s.addText(kicker, T({ x:0.6, y:0.36, w:12.1, h:0.3, fontSize:12, bold:true, color:BLUE, charSpacing:1 }));
  s.addText(title,  T({ x:0.6, y:0.68, w:12.1, h:0.62, fontSize:32, bold:true, color:NAVY }));
  if (sub) s.addText(sub, T({ x:0.6, y:1.32, w:12.1, h:0.38, fontSize:14, color:MUTED }));
}
function light(){ const s=pres.addSlide(); s.background={color:W}; return s; }
function dark(){ const s=pres.addSlide(); s.background={color:NAVY}; return s; }
function foot(s, txt){ s.addText(txt, T({ x:0.6, y:6.94, w:12.1, h:0.3, fontSize:9.5, color:MUTED, italic:true })); }

/* ============ 1 · TITLE ============ */
{
  const s = dark();
  s.addImage({ path: SP+"sadeed.png", x:11.05, y:0.62, w:1.5, h:1.5 });
  s.addText("سديد", T({ x:0.8, y:2.25, w:11.6, h:1.05, fontSize:62, bold:true, color:W }));
  s.addText("منصّة التنبؤ بالموافقة التأمينية المسبقة", T({ x:0.8, y:3.34, w:11.6, h:0.55, fontSize:27, color:ICE }));
  s.addText("لماذا رُفض هذا الطلب، وما الذي يمنع رفض ما بعده؟",
            T({ x:0.8, y:4.22, w:11.6, h:0.5, fontSize:17, color:DIM }));
  card(s, 10.85, 5.72, 1.65, 1.22, { fill:W, line:W, flat:true });
  s.addImage({ path: SP+"cluster.png", x:11.15, y:5.88, w:1.05, h:0.9 });
  s.addText("تجمع مكة المكرمة الصحي  ·  إدارة أداء تنمية الإيرادات",
            T({ x:0.8, y:5.86, w:9.6, h:0.4, fontSize:15, color:ICE }));
  s.addText("عرض للإدارة التنفيذية  ·  أغسطس 2026",
            T({ x:0.8, y:6.32, w:9.6, h:0.4, fontSize:13, color:DIM }));
  s.addNotes("افتتاحية: الإرسال آليّ ولا نتحكّم فيه. سديد يعمل على ما بعد الردّ وعلى ما قبل إنشاء الطلب — لا في مسار الإرسال. المنصّة مبنيّة وجاهزة، والعرض اليوم عن العائد لا عن التمويل.");
}

/* ============ 2 · EXECUTIVE SUMMARY ============ */
{
  const s = light();
  head(s, "الخلاصة التنفيذية", "ثلاثة أرقام تختصر القرار",
       "كل الأرقام مقيسة على 41,042 طلباً صدر فيها قرار نهائي، بتقسيم زمني يدرّب على الفترة الأقدم ويختبر على الأحدث.");
  const stats = [
    { x:8.87, n:"48.7%", c:RED,   t:"من قيمة ما يُطلب من شركة التأمين لا يُعتمد",
      d:"الفجوة بين المبلغ المطلوب والمبلغ المعتمد، قبل أي تدخّل." },
    { x:4.74, n:"95.8%", c:BLUE,  t:"من ردود شركات التأمين تُصنَّف آلياً",
      d:"من نصّ حرّ مبعثر إلى سبب معياري، مع إجراء تصحيحي ونصّ نظامي يسنده." },
    { x:0.61, n:LTR("+3.5%"), c:GREEN, t:"حدّ أدنى لارتفاع التغطية المعتمدة",
      d:"بفرض اكتمال الحد الأدنى للبيانات قبل الإرسال الآلي، ويصل إلى 8.7 نقطة." },
  ];
  stats.forEach(o => {
    card(s, o.x, 1.95, 3.82, 2.5);
    s.addText(o.n, T({ x:o.x+0.25, y:2.15, w:3.32, h:0.85, fontSize:44, bold:true, color:o.c }));
    s.addText(o.t, T({ x:o.x+0.25, y:3.02, w:3.32, h:0.62, fontSize:15, bold:true, color:NAVY }));
    s.addText(o.d, T({ x:o.x+0.25, y:3.66, w:3.32, h:0.68, fontSize:11.5, color:MUTED }));
  });
  card(s, 0.61, 4.72, 12.08, 1.9, { fill:SURF, line:BORD });
  s.addText("لماذا يُعرض هذا الآن", T({ x:0.95, y:4.94, w:11.4, h:0.34, fontSize:15, bold:true, color:BLUE }));
  s.addText([
    { text:"الإرسال آليّ من النظام الصحي عبر نفيس، فلا يعترض سديد مسار الإرسال ولا يؤخّره.", options:{ breakLine:true } },
    { text:"المطلوبان: اعتماده أداةً لفريق الموافقات في معالجة المرفوضات اليوم، ودراسة فرض اكتمال البيانات في النظام الصحي غداً.", options:{} },
  ], T({ x:0.95, y:5.3, w:11.4, h:1.1, fontSize:15, color:NAVY, lineSpacingMultiple:1.35 }));
  foot(s, "المصدر: مخرجات التدريب في model/artifacts/metrics.json — بيانات 2026-01-01 إلى 2026-07-18.");
  s.addNotes("الرقم الثاني يعمل اليوم بلا تعديل في أي نظام. والثالث الأكثر تحفّظاً: يفترض أن خُمس حالات نقص البيانات فقط يُمنع رفضها. تفصيلهما في شريحتي نموذج العائد.");
}

/* ============ 3 · THE PROBLEM ============ */
{
  const s = light();
  head(s, "المشكلة", "قرار شركة التأمين يحسم الإيراد، لا التفاوض بعده",
       "نسبة المبلغ المعتمد من إجمالي المبلغ المطلوب، محسوبة من السجل التاريخي لكل نتيجة قرار.");
  s.addChart(pres.ChartType.bar, [{
      name: "نسبة الاعتماد",
      labels: ["مرفوضة", "موافقة جزئية", "موافقة كاملة"],
      values: [0.0, 0.499, 0.9263],
    }], {
    x:0.61, y:1.95, w:7.5, h:4.35,
    barDir:"bar", barGapWidthPct:55, chartColors:[BLUE],
    showValue:true, dataLabelPosition:"outEnd", dataLabelFormatCode:"0.0%",
    dataLabelFontSize:14, dataLabelFontBold:true, dataLabelColor:NAVY, dataLabelFontFace:F,
    showLegend:false, showTitle:false,
    valAxisMaxVal:1, valAxisLabelFormatCode:"0%",
    catAxisLabelColor:NAVY, catAxisLabelFontSize:14, catAxisLabelFontFace:F, catAxisLabelFontBold:true,
    valAxisLabelColor:MUTED, valAxisLabelFontSize:11, valAxisLabelFontFace:F,
    valGridLine:{ color:BORD, size:1 }, catGridLine:{ style:"none" },
    catAxisLineShow:false, valAxisLineShow:false,
  });
  const P = 8.45, PW = 4.24;
  card(s, P, 1.95, PW, 1.62, { fill:NAVY, line:NAVY });
  s.addText("48.7%", T({ x:P+0.25, y:2.12, w:PW-0.5, h:0.72, fontSize:40, bold:true, color:W }));
  s.addText("من كل ريال يُطلب لا يصدر اعتماده",
            T({ x:P+0.25, y:2.86, w:PW-0.5, h:0.58, fontSize:13, color:ICE }));
  const rows = [
    ["56.7%", "من الطلبات لا تصدر موافقتها كاملة", RED],
    ["8.8%",  "فقط يُعتمد من قيمة الطلب غير المكتمل", RED],
    ["92.6%", "يُعتمد من قيمة الطلب المعتمد كاملاً", GREEN],
  ];
  rows.forEach((r,i) => {
    const y = 3.78 + i*0.86;
    card(s, P, y, PW, 0.74, { fill:SURF, line:BORD, flat:true });
    s.addText(r[0], T({ x:P+2.72, y:y+0.14, w:1.36, h:0.46, fontSize:20, bold:true, color:r[2] }));
    s.addText(r[1], T({ x:P+0.2, y:y+0.14, w:2.46, h:0.5, fontSize:11, color:NAVY, valign:"middle" }));
  });
  foot(s, "«الموافقة الجزئية» خسارة إيراد فعلية، إذ لا يُعتمد منها إلا نصف المبلغ المطلوب تقريباً، ولذلك تُحسب مع الفئة الخاسرة في النموذج.");
  s.addNotes("الرسالة أن الفرق بين النتيجتين ليس تدريجياً بل قفزة. تحويل طلب واحد من الفئة الخاسرة إلى المقبولة يستعيد نحو 84 نقطة من قيمته.");
}

/* ============ 4 · THE REAL CYCLE ============ */
{
  const s = light();
  head(s, "الدورة كما هي فعلاً", "الإرسال آليّ — والعمل البشريّ كلّه بعد الرفض",
       "لا توجد لحظة يدوية قبل الإرسال، فالطلب يغادر النظام الصحي إلى نفيس دون تدخّل. ومن هنا يبدأ سديد.");
  const steps = [
    ["1","النظام الصحي HIS","يُنشئ الطلب ويرسله آلياً"],
    ["2","منصّة نفيس","تمرّره إلى شركة التأمين"],
    ["3","شركة التأمين","تردّ بالموافقة أو الرفض أو الخصم"],
    ["4","فريق الموافقات","يعالج المرفوضات ويعيد إرسالها"],
  ];
  const bw = 2.72, gap = 0.26;
  steps.forEach((st,i) => {
    const x = 12.69 - bw - i*(bw+gap);
    const last = i === steps.length-1;
    card(s, x, 1.95, bw, 1.55, { fill: last?SURF:W, line: last?BLUE:BORD, lw: last?1.5:1 });
    circle(s, x+bw-0.2-0.38, 2.12, 0.38, st[0], last?BLUE:BORD, last?W:MUTED, 13);
    s.addText(st[1], T({ x:x+0.2, y:2.16, w:1.9, h:0.32, fontSize:13.5, bold:true, color:NAVY }));
    s.addText(st[2], T({ x:x+0.2, y:2.6, w:bw-0.4, h:0.72, fontSize:11.5, color:MUTED, lineSpacingMultiple:1.2 }));
    if (i < steps.length-1)
      s.addShape(pres.ShapeType.rightArrow, { x:x-0.22, y:2.62, w:0.2, h:0.22,
        fill:{color:BORD}, line:{color:BORD,width:0}, flipH:true });
  });
  s.addText("494 من كل 1,000 طلب تعود غير مكتملة — وكلّها تقع على فريق الموافقات.",
            T({ x:0.61, y:3.66, w:12.08, h:0.34, fontSize:12.5, bold:true, color:RED, align:"center" }));
  const ent = [
    { x:6.87, n:"اليوم", c:GREEN, t:"عند معالجة المرفوضات",
      d:"يصنّف ردّ شركة التأمين إلى سبب معياري، ويُلحق به إجراءً تصحيحياً ونصّاً نظامياً، ويرتّب الطابور بالمبلغ المعرّض للخطر. لا يحتاج تعديلاً في أي نظام." },
    { x:0.61, n:"المرحلة التالية", c:BLUE, t:"في المنبع داخل النظام الصحي",
      d:"فرض اكتمال الحد الأدنى للبيانات قبل الإرسال الآلي. سديد يحدّد أي الحقول تُنتج الرفض فعلاً، فيُفرض ما يُجدي منها لا كلّها." },
  ];
  ent.forEach(o => {
    card(s, o.x, 4.2, 5.82, 2.28);
    s.addText(o.n, T({ x:o.x+0.28, y:4.4, w:5.26, h:0.3, fontSize:11.5, bold:true, color:o.c, charSpacing:1 }));
    s.addText(o.t, T({ x:o.x+0.28, y:4.74, w:5.26, h:0.38, fontSize:17, bold:true, color:NAVY }));
    s.addText(o.d, T({ x:o.x+0.28, y:5.22, w:5.26, h:1.1, fontSize:12, color:MUTED, lineSpacingMultiple:1.28 }));
  });
  foot(s, "سديد لا يعترض الإرسال الآلي ولا يؤخّر بدء الخدمة — يعمل على طرفي الدورة لا في منتصفها.");
  s.addNotes("هذه أهم شريحة في العرض. من يظنّ أن الأداة تعترض الإرسال سيرفضها فوراً لأنها تؤخّر المريض. اذكر صراحةً أنها لا تفعل.");
}

/* ============ 5 · WHAT IS SADEED ============ */
{
  const s = light();
  head(s, "ما هو سديد", "ثلاث طبقات فوق الطلب الواحد",
       "تعمل جميعها داخل المتصفّح، بلا خادم ولا واجهة برمجية، ولا تغادر بيانات الطلب جهاز المستخدم.");
  const caps = [
    { x:8.87, n:"1", c:BLUE,  t:"التنبّؤ",
      d:"احتمال ألّا تصدر الموافقة كاملة والمبلغ المعرّض للخطر بالريال — لترتيب طابور المعالجة بالمال، ولرصد الأنماط المتكرّرة في لوحة Power BI.",
      k:"LightGBM · 29 خاصية · AUC 0.810" },
    { x:4.74, n:"2", c:AMBER, t:"التشخيص",
      d:"يحوّل ردّ شركة التأمين من نصّ حرّ مبعثر إلى سبب معياري، ومع كل سبب إجراء تصحيحي محدّد قبل إعادة الإرسال.",
      k:"16 سبباً معيارياً · دقّة التشخيص 68 بالمئة" },
    { x:0.61, n:"3", c:GREEN, t:"الإسناد النظامي",
      d:"«سَنَد» يربط كل سبب بنصّ لائحة مجلس الضمان الصحي المنطبق عليه، بصورة صفحته ورقمها.",
      k:"29 مستنداً · 268 صفحة مفهرسة" },
  ];
  caps.forEach(o => {
    card(s, o.x, 1.95, 3.82, 2.95);
    circle(s, o.x+3.07, 2.18, 0.5, o.n, o.c, W, 17);
    s.addText(o.t, T({ x:o.x+0.25, y:2.24, w:2.7, h:0.42, fontSize:21, bold:true, color:NAVY }));
    s.addText(o.d, T({ x:o.x+0.25, y:2.86, w:3.32, h:1.4, fontSize:13, color:NAVY, lineSpacingMultiple:1.28 }));
    s.addText(o.k, T({ x:o.x+0.25, y:4.34, w:3.32, h:0.44, fontSize:10.5, bold:true, color:o.c }));
  });
  card(s, 0.61, 5.28, 12.08, 1.18, { fill:SURF, line:BORD });
  s.addText("كل تنبّؤ مشروح بقيم SHAP محسوبة بدقّة تامة داخل المتصفّح، فيرى المستخدم أي عامل رفع الخطر وبكم، ولا يُطلب منه الوثوق بصندوق مغلق.",
            T({ x:0.95, y:5.55, w:11.4, h:0.64, fontSize:14, color:NAVY, valign:"middle" }));
  s.addNotes("طبقة الإسناد النظامي هي ما يميّز سديد عن أداة تنبّؤ عادية، إذ تحوّل التنبّؤ إلى حجّة نظامية قابلة للاستعمال أمام شركة التأمين.");
}

/* ============ 6 · THE PLATFORM IN PRACTICE ============ */
{
  const s = light();
  head(s, "المنصّة عملياً", "مخرَج واحد يفهمه موظّف الموافقات فوراً",
       "لقطة فعلية من صفحة التنبؤ، بعد إدخال بيانات طلب واحد قبل رفعه لشركة التأمين.");
  s.addImage({ path: IMG+"result.png", x:0.61, y:1.85, w:7.9, h:4.32 });
  const P=8.75, PW=3.94;
  const pts = [
    ["احتمال صريح لا درجة غامضة","89.6 بالمئة احتمال ألّا تصدر الموافقة كاملة، ومقارنته بالمعدّل العام لطلبات الموافقة."],
    ["الأثر بالريال","المبلغ المتوقّع اعتماده والمبلغ المعرّض للخطر، بلغة الإدارة المالية لا بلغة النموذج."],
    ["توجيه للخطوة التالية","إحالة مباشرة إلى الأسباب المرجّحة وإجرائها التصحيحي قبل إعادة الإرسال."],
  ];
  pts.forEach((p,i) => {
    const y = 1.85 + i*1.5;
    card(s, P, y, PW, 1.32, { fill:SURF, line:BORD, flat:true });
    s.addText(p[0], T({ x:P+0.22, y:y+0.16, w:PW-0.44, h:0.32, fontSize:14, bold:true, color:BLUE }));
    s.addText(p[1], T({ x:P+0.22, y:y+0.52, w:PW-0.44, h:0.68, fontSize:11.5, color:NAVY, lineSpacingMultiple:1.2 }));
  });
  foot(s, "الطلب في المثال قيمته 1,450 ريالاً، والمعرّض للخطر منه 1,196 ريالاً.");
  s.addNotes("لقطة حقيقية من الأداة وليست تصوّراً. الموظّف يقرأ الرقم والمبلغ ثم ينتقل مباشرة إلى تبويب الأسباب.");
}

/* ============ 7 · PREDICTION → ACTION ============ */
{
  const s = light();
  head(s, "من ردّ شركة التأمين إلى إجراء", "الردّ يصل نصّاً مبعثراً — وسديد يحوّله إلى بند عمل",
       "‏4,844 نصّ ردٍّ مختلف صُنِّفت إلى 16 سبباً معيارياً بتغطية 95.8%، ومع كل سبب سؤال تحقّق وإجراء ونصّ نظامي.");
  s.addImage({ path: IMG+"case-card.png", x:0.61, y:1.95, w:8.3, h:2.95 });
  const P=9.15, PW=3.54;
  card(s, P, 1.95, PW, 2.95, { fill:NAVY, line:NAVY });
  s.addText("95.8%", T({ x:P+0.25, y:2.16, w:PW-0.5, h:0.7, fontSize:38, bold:true, color:W }));
  s.addText("من ردود شركات التأمين يصنّفها سديد آلياً إلى سبب معياري",
            T({ x:P+0.25, y:2.9, w:PW-0.5, h:0.72, fontSize:13, color:ICE, lineSpacingMultiple:1.2 }));
  s.addText("وهذه الطبقة تعمل اليوم على المرفوضات الفعلية بلا تعديل في أي نظام. ويتنبّأ سديد بالسبب مسبقاً كذلك، بدقّة 68 بالمئة ضمن الثلاثة الأولى.",
            T({ x:P+0.25, y:3.78, w:PW-0.5, h:0.92, fontSize:11.5, color:DIM, lineSpacingMultiple:1.25 }));
  const b = [
    ["نقص في المستندات المطلوبة","أرفق تقرير الطوارئ والتاريخ المرضي ونتائج التحاليل قبل إعادة الإرسال."],
    ["لا تنطبق معايير الطوارئ","وثّق العلامات الحيوية وتصنيف CTAS لإثبات صفة الطوارئ."],
    ["الحالة ضمن استثناءات الوثيقة","راجع بنود الاستثناء في العقد، وأبلغ المريض بالتحمّل مسبقاً."],
  ];
  b.forEach((p,i) => {
    const x = 8.87 - i*4.13;
    card(s, x, 5.15, 3.82, 1.3, { fill:SURF, line:BORD, flat:true });
    s.addText(p[0], T({ x:x+0.2, y:5.3, w:3.42, h:0.32, fontSize:12.5, bold:true, color:RED }));
    s.addText(p[1], T({ x:x+0.2, y:5.64, w:3.42, h:0.68, fontSize:11, color:NAVY, lineSpacingMultiple:1.2 }));
  });
  foot(s, "نماذج من الأسباب الستة عشر المعيارية، ومع كل سبب إجراؤه التصحيحي ونصّه النظامي كما يعرضه سديد.");
  s.addNotes("هذه نقطة تحوّل المنصّة من أداة تحليل إلى أداة تشغيل: الموظّف لا يحتاج تفسير النموذج، بل قائمة عمل.");
}

/* ============ 8 · SANAD ============ */
{
  const s = light();
  head(s, "سَنَد · الطبقة النظامية", "الحجّة أمام شركة التأمين تحتاج نصّاً، لا رأياً",
       "مساعد مرجعي يجيب من 29 مستنداً من لوائح مجلس الضمان الصحي، بصورة الصفحة ورقمها مع كل إجابة.");
  s.addImage({ path: IMG+"chat-analysis.png", x:7.05, y:1.9, w:5.64, h:4.48 });
  const P=0.61, PW=6.1;
  const items = [
    ["قراءة تشغيلية مبسّطة","يعيد صياغة الحكم بلغة العمل («على مقدم الخدمة…») ويستخرج المدد والنسب والمبالغ في شارات ظاهرة."],
    ["النصّ الرسمي منقولاً حرفياً","مع اسم المستند ورقم الصفحة وصورتها الكاملة، وكل جملة تحمل رقم مرجعها والضغط عليه ينقلك إليه."],
    ["بلا توليد لغوي حرّ","الصياغة تُركَّب من مكوّنات مستخرَجة من النصّ نفسه، فلا مجال لأن يُنسب إلى اللائحة ما ليس فيها."],
  ];
  items.forEach((p,i) => {
    const y = 1.95 + i*1.5;
    circle(s, P+PW-0.42, y+0.02, 0.42, String(i+1), GREEN, W, 14);
    s.addText(p[0], T({ x:P, y:y+0.05, w:PW-0.6, h:0.34, fontSize:15, bold:true, color:NAVY }));
    s.addText(p[1], T({ x:P, y:y+0.47, w:PW, h:0.9, fontSize:12.5, color:MUTED, lineSpacingMultiple:1.3 }));
  });
  card(s, P, 6.42-0.02, PW, 0.0, { flat:true, fill:W, line:W, lw:0 });
  s.addText("النصّ الرسمي هو المرجع عند أي تعارض، والمنصّة تعرضه ولا تلخّصه فحسب.",
            T({ x:P, y:6.4, w:PW, h:0.4, fontSize:13, bold:true, color:GREEN }));
  s.addNotes("سَنَد يعمل بلا اتصال خارجي في وضعه الأساسي. الطبقة التوليدية اختيارية ومُطفأة افتراضياً.");
}

/* ============ 9 · MEASURED PERFORMANCE ============ */
{
  const s = light();
  head(s, "الأداء المقيس", "قُورنت ست خوارزميات، واعتُمد أدقّها تمييزاً",
       "AUC هو المقياس المعتمد للاختيار، فهو لا يتأثر بعتبة القرار ولا بتوزيع الفئات.");
  s.addChart(pres.ChartType.bar, [{
      name:"AUC",
      labels:["تخمين عشوائي","انحدار لوجستي","أشجار إضافية","XGBoost","غابة عشوائية","LightGBM المعتمد"],
      values:[0.5, 0.734, 0.800, 0.8018, 0.8019, 0.8098],
    }], {
    x:0.61, y:1.95, w:7.5, h:4.35,
    barDir:"bar", barGapWidthPct:50, chartColors:[BLUE],
    showValue:true, dataLabelPosition:"outEnd", dataLabelFormatCode:"0.000",
    dataLabelFontSize:12, dataLabelFontBold:true, dataLabelColor:NAVY, dataLabelFontFace:F,
    showLegend:false, showTitle:false,
    valAxisMinVal:0.4, valAxisMaxVal:0.9, valAxisLabelFormatCode:"0.0",
    catAxisLabelColor:NAVY, catAxisLabelFontSize:12, catAxisLabelFontFace:F,
    valAxisLabelColor:MUTED, valAxisLabelFontSize:11, valAxisLabelFontFace:F,
    valGridLine:{ color:BORD, size:1 }, catGridLine:{ style:"none" },
    catAxisLineShow:false, valAxisLineShow:false,
  });
  const P=8.45, PW=4.24;
  const m = [
    ["74.4%","من الطلبات غير المكتملة تُلتقط",GREEN],
    ["71.1%","من الإنذارات صحيحة فعلاً",BLUE],
    ["72.4%","دقّة إجمالية · رفع 21.8 نقطة فوق الأساس",NAVY],
    ["0.810","AUC · قوّة التمييز بين الفئتين",NAVY],
  ];
  m.forEach((r,i) => {
    const y = 1.95 + i*1.12;
    card(s, P, y, PW, 0.98, { fill: i<2?SURF:W, line:BORD, flat:true });
    s.addText(r[0], T({ x:P+2.72, y:y+0.24, w:1.36, h:0.5, fontSize:22, bold:true, color:r[2] }));
    s.addText(r[1], T({ x:P+0.2, y:y+0.2, w:2.46, h:0.6, fontSize:11, color:NAVY, valign:"middle" }));
  });
  foot(s, "تدريب 32,833 طلباً (يناير — 3 يونيو) · اختبار 8,209 طلبات لاحقة لم يرها النموذج · العتبة 0.45 مختارة على 4,925 طلباً من نهاية فترة التدريب، لا على الاختبار.");
  s.addNotes("العتبة 0.45 لا 0.5، خُفِّضت عمداً لأن تفويت حالة خاسرة أغلى من إنذار زائد يُراجَع في دقيقة.");
}

/* ============ 10 · CREDIBILITY ============ */
{
  const s = light();
  head(s, "مصداقية الرقم", "لماذا يمكن الوثوق بأداء لم يُقس على بيانات مستقبلية",
       "أربعة قرارات منهجية كلّفت المنصّة نقاط دقّة ظاهرية، مقابل رقم يصمد عند التشغيل.");
  const items = [
    { x:6.87, y:1.95, n:"1", t:"تقسيم زمني لا عشوائي",
      d:"32,833 طلباً للتدريب من الفترة الأقدم، و8,209 للاختبار من الأحدث. تقييم أقسى من التقسيم العشوائي الذي يبالغ عادةً في تقدير الأداء." },
    { x:0.61, y:1.95, n:"2", t:"حذف كل عمود يُعرف بعد قرار شركة التأمين",
      d:"استُبعد المبلغ المغطى وسبب الرفض ورقم الموافقة وتاريخ الخروج، فلا يتعلّم النموذج من إجابة لن تكون متاحة وقت التنبّؤ." },
    { x:6.87, y:4.05, n:"3", t:"حذف حقل قويّ لأنه غير موثوق",
      d:"حُذف «حالة الفاتورة» رغم مساهمته بنحو 12.7 بالمئة من أهمية النموذج، لأنه قد يُحدَّث بعد قرار شركة التأمين. كلّف ذلك نحو 3 نقاط دقّة." },
    { x:0.61, y:4.05, n:"4", t:"تحقّق من التنفيذ في المتصفّح",
      d:"قُورنت مخرجات محرّك المتصفّح بمكتبات بايثون المرجعية، وأقصى فارق في قيم SHAP أقلّ من جزء واحد من مليون، أي تطابق عملي تام." },
  ];
  items.forEach(o => {
    card(s, o.x, o.y, 5.82, 1.85);
    circle(s, o.x+5.12, o.y+0.22, 0.46, o.n, BLUE, W, 15);
    s.addText(o.t, T({ x:o.x+0.24, y:o.y+0.26, w:4.8, h:0.4, fontSize:16, bold:true, color:NAVY }));
    s.addText(o.d, T({ x:o.x+0.24, y:o.y+0.74, w:5.34, h:0.98, fontSize:12, color:MUTED, lineSpacingMultiple:1.28 }));
  });
  card(s, 0.61, 6.16, 12.08, 0.66, { fill:SURF, line:BORD, flat:true });
  s.addText("والنموذج المنشور أُعيد تدريبه على 41,042 طلباً كاملةً بعد تثبيت المعاملات، فالأرقام المعروضة تقدير متحفّظ لأدائه لا مبالغة فيه.",
            T({ x:0.95, y:6.29, w:11.4, h:0.4, fontSize:12.5, bold:true, color:NAVY }));
  s.addNotes("هذه الشريحة للسؤال المتوقّع: كل نموذج يبدو ممتازاً في العرض. الجواب أننا خفّضنا الرقم عمداً أربع مرات.");
}

/* ============ 11 · VALUE PATH ============ */
{
  const s = light();
  head(s, "نموذج العائد", "مسار القيمة من 1,000 طلب يُرسَل آلياً إلى ريال مُستعاد",
       "كل نسبة في المسار مقيسة على البيانات، عدا الأخيرة فهي افتراض تشغيلي متحفّظ.");
  const steps = [
    { n:"1,000",  l:"طلب يرسله النظام الصحي آلياً",     w:11.9, c:"DCE6EF", tc:NAVY, sub:"" },
    { n:"494",    l:"يعود غير مكتمل إلى فريق الموافقات", w:10.1, c:"F3D9D7", tc:NAVY, sub:"49.4% من المرسَل" },
    { n:"473",    l:"يُصنَّف سببه آلياً بإجراء ونصّ نظامي", w:8.3, c:"BBD5E6", tc:NAVY, sub:"95.8% تغطية التصنيف" },
    { n:"207",    l:"سببه نقصٌ في الحد الأدنى للبيانات",  w:6.5,  c:BLUE,    tc:W,    sub:"42% من غير المكتمل" },
    { n:"41 – 104",l:"يُمنع رفضه بفرض الاكتمال",         w:4.7,  c:GREEN,   tc:W,    sub:"20% – 50% نسبة المنع (افتراض)" },
  ];
  steps.forEach((st,i) => {
    const y = 1.92 + i*0.85;
    const x = 12.69 - st.w;
    s.addShape(pres.ShapeType.roundRect, { x, y, w:st.w, h:0.7, rectRadius:0.05,
      fill:{color:st.c}, line:{color:st.c, width:0} });
    s.addText(st.n, T({ x:x+0.22, y:y+0.12, w:1.75, h:0.46, fontSize:19, bold:true, color:st.tc, valign:"middle" }));
    s.addText(st.l, T({ x:x+2.05, y:y+0.12, w:st.w-2.3, h:0.46, fontSize:13, color:st.tc, valign:"middle" }));
    if (st.sub) s.addText(st.sub, T({ x:0.61, y:y+0.15, w:x-0.85, h:0.4, fontSize:10.5, color:MUTED, align:"left", valign:"middle" }));
  });
  card(s, 0.61, 6.28, 12.08, 0.66, { fill:NAVY, line:NAVY, flat:true });
  s.addText("كل طلب يتحوّل من «غير مكتمل» إلى «معتمد كاملاً» يستعيد 83.8 بالمئة من قيمته، فترتفع التغطية المعتمدة بمقدار 3.5 إلى 8.7 نقطة على قيمة كل ما يُرسَل.",
            T({ x:0.95, y:6.41, w:11.4, h:0.4, fontSize:13.5, bold:true, color:W }));
  s.addNotes("الصفّان الأوسطان قيمة تعمل اليوم بلا أي تعديل في الأنظمة. والصفّ الأخير هو مسار المنع، وهو الوحيد الذي يحتاج تعديلاً في النظام الصحي — ونسبة المنع فيه الافتراض الوحيد غير المقيس.");
}

/* ============ 12 · SENSITIVITY TABLE ============ */
{
  const s = light();
  head(s, "العائد السنوي", "ما الذي يعنيه ذلك بالريال",
       "نحو 181,000 طلب سنوياً · القيم بملايين الريالات، تغطيةً معتمدة إضافية سنوياً · الأعمدة تمثّل نسبة ما يُمنع رفضه من حالات نقص البيانات.");
  const CX = [9.39, 7.20, 5.01, 2.82, 0.63], CW = [3.30, 2.19, 2.19, 2.19, 2.19];
  const RY = [1.90, 2.46, 3.02, 3.58, 4.14], RH = 0.56;
  const hdr = ["متوسط قيمة الطلب","20%","30%","40%","50%"];
  const body = [
    ["1,000 ريال","6.3","9.4","12.6","15.7"],
    ["2,000 ريال","12.6","18.9","25.2","31.5"],
    ["3,000 ريال","18.9","28.3","37.8","47.2"],
    ["5,000 ريال","31.5","47.2","62.9","78.7"],
  ];
  hdr.forEach((h,c) => {
    box(s, CX[c], RY[0], CW[c], RH, NAVY, NAVY);
    s.addText(h, T({ x:CX[c], y:RY[0], w:CW[c], h:RH, align:"center", valign:"middle",
                     fontSize: c===0?13:14, bold:true, color:W }));
  });
  body.forEach((row,r) => row.forEach((v,c) => {
    const fill = c===0 ? SURF : (r%2 ? "FAFCFE" : W);
    box(s, CX[c], RY[r+1], CW[c], RH, fill, BORD);
    s.addText(v, T({ x:CX[c], y:RY[r+1], w:CW[c], h:RH, align:"center", valign:"middle",
                     fontSize: c===0?13:15, bold: c===0||c===1,
                     color: c===1 ? GREEN : NAVY }));
  }));
  const CWC = 5.91, GAP = 0.24, XR = 0.63+CWC+GAP, XL = 0.63, CY = 5.06, CH = 1.5;
  card(s, XR, CY, CWC, CH, { fill:NAVY, line:NAVY });
  s.addText("بلا كلفة تشغيل", T({ x:XR+0.25, y:CY+0.16, w:CWC-0.5, h:0.52, fontSize:26, bold:true, color:W }));
  s.addText("المنع قاعدة تحقّق في النظام الصحي، لا مراجعة بشرية. تُضبط مرّة واحدة ثم تعمل على كل طلب بلا وقت موظّف ولا كلفة متكرّرة.",
            T({ x:XR+0.25, y:CY+0.72, w:CWC-0.5, h:0.7, fontSize:11.5, color:ICE, lineSpacingMultiple:1.22 }));
  card(s, XL, CY, CWC, CH, { fill:SURF, line:BORD });
  s.addText("العمود الأخضر هو سيناريو التخطيط", T({ x:XL+0.25, y:CY+0.2, w:CWC-0.5, h:0.34, fontSize:14, bold:true, color:GREEN }));
  s.addText("يفترض أن خُمس حالات نقص البيانات فقط يُمنع رفضها. أي رقم فوقه مكسب إضافي، لا شرط للجدوى. ولا يشمل الجدول مكسب تسريع معالجة المرفوضات، وهو يعمل اليوم.",
            T({ x:XL+0.25, y:CY+0.62, w:CWC-0.5, h:0.76, fontSize:12, color:NAVY, lineSpacingMultiple:1.25 }));
  foot(s, "متوسط قيمة الطلب غير متاح في بيانات النموذج، فعُرض العائد كجدول حساسية تُسقِط عليه الإدارة رقمها الفعلي مباشرة.");
  s.addNotes("لا تدافع عن خانة بعينها. الرسالة أن أضعف خانة في الجدول ما تزال تفوق كلفة التشغيل بمراتب.");
}

/* ============ 13 · COST & LIMITS ============ */
{
  const s = light();
  head(s, "التكلفة والحدود", "ما الذي يكلّفه هذا، وما الذي لا يفعله",
       "عرض صريح للجانبين، لأن قرار التبنّي يحتاج الحدّين معاً.");
  const CW2=5.91, GAP=0.24, X1=0.63+CW2+GAP, X2=0.63;
  function col(x, fill, title, tcol, rows) {
    card(s, x, 1.85, CW2, 4.78, { fill, line:BORD });
    s.addText(title, T({ x:x+0.28, y:2.0, w:CW2-0.56, h:0.38, fontSize:19, bold:true, color:tcol }));
    rows.forEach((p,i) => {
      const y = 2.5 + i*0.82;
      s.addText(p[0], T({ x:x+0.28, y, w:CW2-0.56, h:0.28, fontSize:12.5, bold:true, color:NAVY }));
      s.addText(p[1], T({ x:x+0.28, y:y+0.29, w:CW2-0.56, h:0.5, fontSize:10.5, color:MUTED, lineSpacingMultiple:1.18 }));
    });
  }
  col(X1, W, "التكلفة", GREEN, [
    ["لا ميزانية تطوير","المنصّة مبنيّة ومُختبَرة ومُوثَّقة بالكامل."],
    ["لا كلفة بنية تحتية","تعمل داخل المتصفّح، بلا خادم ولا قاعدة بيانات ولا كلفة لكل طلب."],
    ["لا مخاطرة خصوصية","بيانات الطلب لا تغادر جهاز المستخدم، ولا يستعمل النموذج أي معرّف شخصي."],
    ["لا عبء مراجعة إضافياً","الفريق يعالج المرفوضات أصلاً؛ سديد يختصر زمن تشخيصها ويرتّبها بالمبلغ، فيقلّل العبء لا يزيده."],
    ["لا كلفة لإعادة التدريب","إجراء مؤتمت بأمر واحد على البيانات الجديدة، بلا تدخّل هندسي."],
  ]);
  col(X2, SURF, "الحدود", AMBER, [
    ["لا يوقف الإرسال ولا يؤخّره","الإرسال آليّ من النظام الصحي، وسديد يعمل بعد الردّ أو في إعداد البيانات — لا في مسار الإرسال نفسه."],
    ["يميل إلى الإنذار عمداً","نحو 29 بالمئة ممّا يُعلَّم يُعتمد فعلاً بالكامل، وهو ثمن مقصود مقابل التقاط 74 بالمئة من غير المكتملة."],
    ["ثقله في حقول لا تتغيّر","نحو 70 بالمئة من قوّته التنبّؤية في العقد والمستشفى والقسم، وهي حقول لا تُغيَّر بحال."],
    ["يستنتج السبب ولا يفحص المستندات","لا يقرأ المرفقات؛ بل يرتّب الأسباب الأرجح من أنماط 19,741 طلباً سابقاً."],
    ["قواعد تصنيف الردود إنجليزية","لو غيّرت شركة تأمين صياغة ردودها سقط التصنيف صامتاً — تُراقَب نسبة «سبب غير مصنّف» شهرياً."],
  ]);
  foot(s, "الحدّان الثالث والرابع ليسا عيباً دائماً، والشريحة التالية تعرض كيف يُرفعان.");
  s.addNotes("اعرض الحدود بثقة. الإدارة تثق بالعرض الذي يذكر حدوده أكثر من العرض الذي يخفيها.");
}

/* ============ 14 · MDS / UCAF OPPORTUNITY ============ */
{
  const s = light();
  head(s, "رفع السقف", "الحدّ الأكبر اليوم هو ما لا يراه النموذج",
       "ما دام الإرسال آلياً، فالمنع الوحيد الممكن هو ألّا يخرج الطلب ناقصاً من النظام الصحي أصلاً.");
  const P=8.87, PW=3.82;
  card(s, P, 1.95, PW, 2.4, { fill:NAVY, line:NAVY });
  s.addText("42%", T({ x:P+0.25, y:2.14, w:PW-0.5, h:0.78, fontSize:44, bold:true, color:W }));
  s.addText("من حالات عدم الاعتماد سببها المباشر نقصٌ في الحد الأدنى للبيانات",
            T({ x:P+0.25, y:2.98, w:PW-0.5, h:0.72, fontSize:13, color:ICE, lineSpacingMultiple:1.22 }));
  s.addText("وهي بيانات لا يراها النموذج اليوم إطلاقاً.",
            T({ x:P+0.25, y:3.78, w:PW-0.5, h:0.4, fontSize:11.5, color:DIM }));

  card(s, 0.61, 1.95, 7.94, 2.4);
  s.addText("أسباب عدم الاعتماد التي يسبّبها نقص الحد الأدنى للبيانات",
            T({ x:0.9, y:2.14, w:7.36, h:0.34, fontSize:14, bold:true, color:BLUE }));
  const rs = [["نقص في المستندات أو التقارير الطبية","19.4%"],
              ["لا تنطبق عليها معايير الطوارئ","18.5%"],
              ["عدم كفاية المبرر الطبي","4.2%"]];
  rs.forEach((r,i) => {
    const y = 2.56 + i*0.48;
    s.addText(r[1], T({ x:6.96, y, w:1.3, h:0.4, fontSize:16, bold:true, color:RED, valign:"middle" }));
    s.addText(r[0], T({ x:0.9, y, w:5.86, h:0.4, fontSize:13, color:NAVY, valign:"middle" }));
  });
  s.addText("الحد الأدنى للبيانات (MDS) في لائحة المجلس ثمانية حقول، منها: الشكوى الرئيسة · الفحص السريري · خطة العلاج · التاريخ المرضي.",
            T({ x:0.9, y:4.0, w:7.36, h:0.3, fontSize:10.5, italic:true, color:MUTED }));

  const cards = [
    { x:8.87, n:"1", t:"المصدر جاهز", c:BLUE,
      d:"استمارة UCAF تُكتب بالحاسوب، فحقولها تُستخرج نصّاً بلا مسح ضوئي. وهي لقطة لما رُفع فعلاً، فلا يتسرّب إليها المستقبل." },
    { x:4.74, n:"2", t:"ما الذي يُضاف", c:AMBER,
      d:"رايات اكتمال لكل حقل ودرجة اكتمال إجمالية، بلا نصّ ولا معرّف شخصي. تُحسب عند الاستخراج ثم يُتلَف المصدر." },
    { x:0.61, n:"3", t:"وما الذي يتغيّر", c:GREEN,
      d:"قاعدة تحقّق في النظام الصحي تمنع خروج الطلب ناقصاً. تُضبط مرّة، ثم تعمل بلا وقت موظّف — وسديد يحدّد أي الحقول تستحقّ الفرض." },
  ];
  cards.forEach(o => {
    card(s, o.x, 4.58, 3.82, 1.85, { fill:SURF, line:BORD, flat:true });
    circle(s, o.x+3.14, 4.74, 0.42, o.n, o.c, W, 14);
    s.addText(o.t, T({ x:o.x+0.22, y:4.78, w:2.7, h:0.34, fontSize:15, bold:true, color:NAVY }));
    s.addText(o.d, T({ x:o.x+0.22, y:5.22, w:3.38, h:1.06, fontSize:11, color:NAVY, lineSpacingMultiple:1.22 }));
  });
  foot(s, "لا يُعرض هنا وعدٌ برقم. المقياس المقترح ثلاثي: AUC، ودقّة تشخيص السبب، ونسبة الخطر الواقعة في حقول قابلة للتعديل (نحو 30 بالمئة اليوم).");
  s.addNotes("هذه الشريحة تحوّل الحدّين الأخيرين في الشريحة السابقة إلى خطة. لا تَعِد بتحسّن في الدقّة — المكسب المؤكّد هو قابلية التنفيذ، وهي التي ترفع سقف نسبة الإصلاح في نموذج العائد.");
}

/* ============ 15 · ROADMAP + ASK ============ */
{
  const s = dark();
  s.addText("خارطة التشغيل", T({ x:0.6, y:0.5, w:12.1, h:0.3, fontSize:12, bold:true, color:ICE, charSpacing:1 }));
  s.addText("من معالجة المرفوضات إلى منعها", T({ x:0.6, y:0.82, w:12.1, h:0.62, fontSize:32, bold:true, color:W }));
  const ph = [
    { x:9.89, n:"1", t:"تشغيل مع فريق الموافقات", d:"تصنيف المرفوضات الواردة وترتيبها بالمبلغ. يُقاس زمن المعالجة ونسبة نجاح إعادة الإرسال.", k:"4 أسابيع" },
    { x:6.80, n:"2", t:"ربط بلوحة Power BI", d:"رصد الأنماط: أي العيادات والعقود والتشخيصات تُنتج الرفض بانتظام.", k:"4 أسابيع" },
    { x:3.71, n:"3", t:"قياس أثر MDS", d:"استخراج حقول الاكتمال من UCAF، وإعادة التدريب، وتحديد الحقول التي تستحقّ الفرض.", k:"3 أشهر" },
    { x:0.62, n:"4", t:"الفرض في النظام الصحي", d:"قاعدة تحقّق تمنع خروج الطلب ناقصاً — بالشراكة مع تقنية المعلومات.", k:"بعد القياس" },
  ];
  ph.forEach(o => {
    card(s, o.x, 1.72, 2.80, 2.72, { fill:"1B4A66", line:"2A6288", flat:true });
    circle(s, o.x+2.16, 1.94, 0.46, o.n, ICE, NAVY, 15);
    s.addText(o.t, T({ x:o.x+0.22, y:1.98, w:1.85, h:0.4, fontSize:16, bold:true, color:W }));
    s.addText(o.d, T({ x:o.x+0.22, y:2.54, w:2.36, h:1.3, fontSize:11.5, color:ICE, lineSpacingMultiple:1.28 }));
    s.addText(o.k, T({ x:o.x+0.22, y:3.94, w:2.36, h:0.32, fontSize:11, bold:true, color:"7FE3C0" }));
  });
  card(s, 0.61, 4.76, 12.08, 1.62, { fill:W, line:W, flat:true });
  s.addText("الطلب", T({ x:0.95, y:4.98, w:11.4, h:0.32, fontSize:14, bold:true, color:BLUE }));
  s.addText("اعتماد سديد أداةً لفريق الموافقات في معالجة المرفوضات لمدة أربعة أسابيع، وتكليف فريق مشترك مع تقنية المعلومات بدراسة فرض اكتمال البيانات في النظام الصحي.",
            T({ x:0.95, y:5.36, w:11.4, h:0.86, fontSize:16, bold:true, color:NAVY, lineSpacingMultiple:1.28 }));
  s.addText("سديد  ·  تجمع مكة المكرمة الصحي  ·  إدارة أداء تنمية الإيرادات  ·  إعداد: هاني السلمي",
            T({ x:0.6, y:6.66, w:12.1, h:0.34, fontSize:11.5, color:DIM }));
  s.addNotes("الطلب شقّان: الأول يبدأ غداً بلا تعديل في أي نظام، والثاني دراسة لا التزام. المال الأكبر في الثاني، لكن الأول هو ما يثبت الجدوى قبل طلب أي تعديل تقني.");
}

pres.writeFile({ fileName: SP + "سديد-عرض-تنفيذي.pptx" }).then(f => console.log("WROTE", f));
