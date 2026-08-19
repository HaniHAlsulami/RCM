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
  s.addText("منصّة التنبؤ بالموافقة التأمينية", T({ x:0.8, y:3.34, w:11.6, h:0.55, fontSize:27, color:ICE }));
  s.addText("هل تُحصَّل هذه المطالبة بالكامل؟ الجواب قبل الإرسال، لا بعد الرفض.",
            T({ x:0.8, y:4.22, w:11.6, h:0.5, fontSize:17, color:DIM }));
  card(s, 10.85, 5.72, 1.65, 1.22, { fill:W, line:W, flat:true });
  s.addImage({ path: SP+"cluster.png", x:11.15, y:5.88, w:1.05, h:0.9 });
  s.addText("تجمع مكة المكرمة الصحي  ·  إدارة أداء تنمية الإيرادات",
            T({ x:0.8, y:5.86, w:9.6, h:0.4, fontSize:15, color:ICE }));
  s.addText("عرض للإدارة التنفيذية  ·  أغسطس 2026",
            T({ x:0.8, y:6.32, w:9.6, h:0.4, fontSize:13, color:DIM }));
  s.addNotes("افتتاحية: سديد يجيب عن سؤال واحد قبل إرسال المطالبة للضامن، وهو هل ستُحصَّل بالكامل. المنصّة مبنيّة بالكامل وجاهزة، والعرض اليوم عن العائد لا عن التمويل.");
}

/* ============ 2 · EXECUTIVE SUMMARY ============ */
{
  const s = light();
  head(s, "الخلاصة التنفيذية", "ثلاثة أرقام تختصر القرار",
       "كل الأرقام مقيسة على 41,042 مطالبة صدر فيها قرار نهائي، بتقسيم زمني يدرّب على الفترة الأقدم ويختبر على الأحدث.");
  const stats = [
    { x:8.87, n:"48.7%", c:RED,   t:"من قيمة المطالبات المُرسَلة لا تُحصَّل",
      d:"الفجوة بين ما يُفوتر وما يُحصَّل فعلاً، قبل أي تدخّل." },
    { x:4.74, n:"74.4%", c:BLUE,  t:"من المطالبات الخاسرة يلتقطها سديد",
      d:"قبل الإرسال، مع ترتيب أسبابها المرجّحة وإجراء تصحيحي لكل سبب." },
    { x:0.61, n:LTR("+4.2%"), c:GREEN, t:"حدّ أدنى لارتفاع التحصيل",
      d:"على قيمة ما يُرسَل، بأشدّ الافتراضات تحفّظاً، ويصل إلى 10.5 نقطة." },
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
    { text:"المنصّة مبنيّة ومُختبَرة وتعمل بالكامل، فلا ميزانية تطوير مطلوبة ولا خادم ولا كلفة تشغيل لكل مطالبة.", options:{ breakLine:true } },
    { text:"المطلوب قرار تشغيلي واحد، وهو إدخال فحص سديد خطوةً إلزامية قبل إرسال المطالبة للضامن.", options:{} },
  ], T({ x:0.95, y:5.3, w:11.4, h:1.1, fontSize:15, color:NAVY, lineSpacingMultiple:1.35 }));
  foot(s, "المصدر: مخرجات التدريب في model/artifacts/metrics.json — بيانات 2026-01-01 إلى 2026-07-18.");
  s.addNotes("الرقم الثالث هو الأكثر تحفّظاً في العرض كله: يفترض أن خُمس الحالات المُشخَّصة فقط قابلة للإصلاح قبل الإرسال. تفصيله في شريحة نموذج العائد.");
}

/* ============ 3 · THE PROBLEM ============ */
{
  const s = light();
  head(s, "المشكلة", "نتيجة الموافقة تحسم التحصيل، لا التفاوض بعدها",
       "نسبة المبلغ المحصَّل فعلياً من إجمالي الفاتورة، محسوبة من السجل التاريخي لكل نتيجة.");
  s.addChart(pres.ChartType.bar, [{
      name: "نسبة التحصيل",
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
  s.addText("من كل ريال يُفوتر لا يصل إلى الحساب",
            T({ x:P+0.25, y:2.86, w:PW-0.5, h:0.58, fontSize:13, color:ICE }));
  const rows = [
    ["56.7%", "من المطالبات لا تصدر موافقتها كاملة", RED],
    ["8.8%",  "فقط تُحصَّل من قيمة المطالبة غير المكتملة", RED],
    ["92.6%", "تُحصَّل من قيمة المطالبة المقبولة كاملة", GREEN],
  ];
  rows.forEach((r,i) => {
    const y = 3.78 + i*0.86;
    card(s, P, y, PW, 0.74, { fill:SURF, line:BORD, flat:true });
    s.addText(r[0], T({ x:P+2.72, y:y+0.14, w:1.36, h:0.46, fontSize:20, bold:true, color:r[2] }));
    s.addText(r[1], T({ x:P+0.2, y:y+0.14, w:2.46, h:0.5, fontSize:11, color:NAVY, valign:"middle" }));
  });
  foot(s, "«الموافقة الجزئية» خسارة إيراد فعلية، إذ تُحصّل نصف الفاتورة تقريباً، ولذلك تُحسب مع الفئة الخاسرة في النموذج.");
  s.addNotes("الرسالة أن الفرق بين النتيجتين ليس تدريجياً بل قفزة. تحويل مطالبة واحدة من الفئة الخاسرة إلى المقبولة يستعيد نحو 84 نقطة من قيمتها.");
}

/* ============ 4 · WHY TODAY'S PROCESS FAILS ============ */
{
  const s = light();
  head(s, "أين يقع القرار اليوم", "نكتشف الخلل بعد أن يصير استئنافاً",
       "المسار الحالي يضع كل جهد التصحيح بعد صدور الرفض، حين تكون كلفته أعلى واحتمال نجاحه أقل.");
  function flow(y, label, labCol, steps, endFill) {
    s.addText(label, T({ x:11.35, y:y+0.5, w:1.35, h:0.5, fontSize:15, bold:true, color:labCol, valign:"middle" }));
    const bw = 2.02, gap = 0.22, h = 1.5;
    steps.forEach((st,i) => {
      const x = 10.98 - bw - i*(bw+gap);
      const isEnd = i === steps.length-1;
      card(s, x, y, bw, h, { fill: isEnd?endFill:SURF, line: isEnd?endFill:BORD, flat:isEnd });
      s.addText(st[0], T({ x:x+0.14, y:y+0.14, w:bw-0.28, h:0.3, fontSize:10, bold:true,
                           color: isEnd?W:MUTED }));
      s.addText(st[1], T({ x:x+0.14, y:y+0.48, w:bw-0.28, h:0.9, fontSize:12,
                           color: isEnd?W:NAVY }));
      if (i < steps.length-1)
        s.addShape(pres.ShapeType.rightArrow, { x:x-0.2, y:y+h/2-0.1, w:0.18, h:0.2,
                                                fill:{color:BORD}, line:{color:BORD,width:0}, flipH:true });
    });
  }
  flow(2.02, "اليوم", RED, [
    ["الخطوة 1","تُرسَل المطالبة كما هي"],
    ["الخطوة 2","يردّ الضامن بالرفض أو الخصم"],
    ["الخطوة 3","يُفتَح ملف استئناف ويُجمَّع الناقص"],
    ["النتيجة","تأخّر في التحصيل، وجزء يُشطب نهائياً"],
  ], RED);
  flow(3.96, "مع سديد", GREEN, [
    ["الخطوة 1","سديد يقيس احتمال عدم الاكتمال"],
    ["الخطوة 2","يرتّب الأسباب المرجّحة للردّ"],
    ["الخطوة 3","يُستكمَل الناقص قبل الإرسال"],
    ["النتيجة","تُرسَل مكتملة، بلا دورة استئناف"],
  ], GREEN);
  card(s, 0.61, 5.9, 12.08, 0.8, { fill:SURF, line:BORD, flat:true });
  s.addText("التصحيح المسبق أرخص من الاستئناف، فهو لا يستهلك دورة مراجعة لدى الضامن ولا يؤخّر التدفّق النقدي.",
            T({ x:0.95, y:6.06, w:11.4, h:0.5, fontSize:14, bold:true, color:NAVY, valign:"middle" }));
  s.addNotes("النقطة الجوهرية أن سديد لا يستبدل فريق الاستئناف، بل يقلّص ما يصل إليه أصلاً.");
}

/* ============ 5 · WHAT IS SADEED ============ */
{
  const s = light();
  head(s, "ما هو سديد", "ثلاث طبقات فوق المطالبة الواحدة",
       "تعمل جميعها داخل المتصفّح، بلا خادم ولا واجهة برمجية، ولا تغادر بيانات المطالبة جهاز المستخدم.");
  const caps = [
    { x:8.87, n:"1", c:BLUE,  t:"التنبّؤ",
      d:"احتمال ألّا تصدر الموافقة كاملة، مقارَناً بالمعدّل العام، مع تقدير الإيراد المتوقّع والمبلغ المعرّض للخطر بالريال.",
      k:"LightGBM · 29 خاصية · AUC 0.810" },
    { x:4.74, n:"2", c:AMBER, t:"التشخيص",
      d:"أرجح أسباب عدم الموافقة مرتّبة، ومع كل سبب إجراء تصحيحي محدّد يُنفَّذ قبل الإرسال، لا تنبيه مجرّد.",
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
  s.addNotes("طبقة الإسناد النظامي هي ما يميّز سديد عن أداة تنبّؤ عادية، إذ تحوّل التنبّؤ إلى حجّة نظامية قابلة للاستعمال أمام الضامن.");
}

/* ============ 6 · THE PLATFORM IN PRACTICE ============ */
{
  const s = light();
  head(s, "المنصّة عملياً", "مخرَج واحد يفهمه موظّف التحصيل فوراً",
       "لقطة فعلية من صفحة التنبؤ، بعد إدخال بيانات مطالبة واحدة قبل إرسالها.");
  s.addImage({ path: IMG+"result.png", x:0.61, y:1.85, w:7.9, h:4.32 });
  const P=8.75, PW=3.94;
  const pts = [
    ["احتمال صريح لا درجة غامضة","89.6 بالمئة احتمال ألّا تصدر الموافقة كاملة، ومقارنته بالمعدّل العام للمطالبات."],
    ["الأثر بالريال","الإيراد المتوقّع تحصيله والمبلغ المعرّض للخطر، بلغة الإدارة المالية لا بلغة النموذج."],
    ["توجيه للخطوة التالية","إحالة مباشرة إلى الأسباب المرجّحة وإجرائها التصحيحي قبل الإرسال."],
  ];
  pts.forEach((p,i) => {
    const y = 1.85 + i*1.5;
    card(s, P, y, PW, 1.32, { fill:SURF, line:BORD, flat:true });
    s.addText(p[0], T({ x:P+0.22, y:y+0.16, w:PW-0.44, h:0.32, fontSize:14, bold:true, color:BLUE }));
    s.addText(p[1], T({ x:P+0.22, y:y+0.52, w:PW-0.44, h:0.68, fontSize:11.5, color:NAVY, lineSpacingMultiple:1.2 }));
  });
  foot(s, "المطالبة في المثال قيمتها 1,450 ريالاً، والمعرّض للخطر منها 1,196 ريالاً.");
  s.addNotes("لقطة حقيقية من الأداة وليست تصوّراً. الموظّف يقرأ الرقم والمبلغ ثم ينتقل مباشرة إلى تبويب الأسباب.");
}

/* ============ 7 · PREDICTION → ACTION ============ */
{
  const s = light();
  head(s, "من التنبّؤ إلى إجراء", "المهمّ ليس أنّ الطلب سيُردّ، بل ما الذي ينقصه",
       "كل سبب متوقَّع يتحوّل إلى بند عمل يحمل سؤال تحقّق، وإجراءً تصحيحياً، ونصّاً نظامياً يسنده.");
  s.addImage({ path: IMG+"case-card.png", x:0.61, y:1.95, w:8.3, h:2.95 });
  const P=9.15, PW=3.54;
  card(s, P, 1.95, PW, 2.95, { fill:NAVY, line:NAVY });
  s.addText("68.0%", T({ x:P+0.25, y:2.16, w:PW-0.5, h:0.7, fontSize:38, bold:true, color:W }));
  s.addText("من الحالات يكون السبب الصحيح ضمن الأسباب الثلاثة الأولى",
            T({ x:P+0.25, y:2.9, w:PW-0.5, h:0.72, fontSize:13, color:ICE, lineSpacingMultiple:1.2 }));
  s.addText("مقابل 17.7 بالمئة لو خُمِّن السبب اعتباطاً، أي نحو أربعة أضعاف التخمين.",
            T({ x:P+0.25, y:3.78, w:PW-0.5, h:0.92, fontSize:12, color:DIM, lineSpacingMultiple:1.25 }));
  const b = [
    ["نقص في المستندات المطلوبة","أرفق تقرير الطوارئ والتاريخ المرضي ونتائج التحاليل قبل الإرسال."],
    ["لا تنطبق معايير الطوارئ","وثّق العلامات الحيوية وتصنيف CTAS لإثبات صفة الطوارئ."],
    ["الحالة ضمن استثناءات الوثيقة","راجع بنود الاستثناء في العقد، وأبلغ المريض بالتحمّل مسبقاً."],
  ];
  b.forEach((p,i) => {
    const x = 8.87 - i*4.13;
    card(s, x, 5.15, 3.82, 1.3, { fill:SURF, line:BORD, flat:true });
    s.addText(p[0], T({ x:x+0.2, y:5.3, w:3.42, h:0.32, fontSize:12.5, bold:true, color:RED }));
    s.addText(p[1], T({ x:x+0.2, y:5.64, w:3.42, h:0.68, fontSize:11, color:NAVY, lineSpacingMultiple:1.2 }));
  });
  foot(s, "نماذج من الأسباب الستة عشر المعيارية، ومع كل سبب إجراؤه التصحيحي كما يعرضه سديد.");
  s.addNotes("هذه نقطة تحوّل المنصّة من أداة تحليل إلى أداة تشغيل: الموظّف لا يحتاج تفسير النموذج، بل قائمة عمل.");
}

/* ============ 8 · SANAD ============ */
{
  const s = light();
  head(s, "سَنَد · الطبقة النظامية", "الحجّة أمام الضامن تحتاج نصّاً، لا رأياً",
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
    ["74.4%","من المطالبات الخاسرة تُلتقط",GREEN],
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
  foot(s, "مقيسة على 8,209 مطالبة من آخر الفترة لم يرها النموذج أثناء التدريب · عتبة القرار 0.45 مختارة على شريحة تحقّق منفصلة.");
  s.addNotes("العتبة 0.45 لا 0.5، خُفِّضت عمداً لأن تفويت حالة خاسرة أغلى من إنذار زائد يُراجَع في دقيقة.");
}

/* ============ 10 · CREDIBILITY ============ */
{
  const s = light();
  head(s, "مصداقية الرقم", "لماذا يمكن الوثوق بأداء لم يُقس على بيانات مستقبلية",
       "أربعة قرارات منهجية كلّفت المنصّة نقاط دقّة ظاهرية، مقابل رقم يصمد عند التشغيل.");
  const items = [
    { x:6.87, y:1.95, n:"1", t:"تقسيم زمني لا عشوائي",
      d:"التدريب على الفترة الأقدم والاختبار على الأحدث، وهو تقييم أقسى من التقسيم العشوائي الذي يبالغ عادةً في تقدير الأداء." },
    { x:0.61, y:1.95, n:"2", t:"حذف كل عمود يُعرف بعد قرار الضامن",
      d:"استُبعد المبلغ المغطى وسبب الرفض ورقم الموافقة وتاريخ الخروج، فلا يتعلّم النموذج من إجابة لن تكون متاحة وقت التنبّؤ." },
    { x:6.87, y:4.05, n:"3", t:"حذف حقل قويّ لأنه غير موثوق",
      d:"حُذف «حالة الفاتورة» رغم مساهمته بنحو 12.7 بالمئة من أهمية النموذج، لأنه قد يُحدَّث بعد قرار الضامن. كلّف ذلك نحو 3 نقاط دقّة." },
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
  s.addText("الرقم المعروض هو ما ينبغي توقّعه عند التشغيل، لا سقفاً مثالياً في المختبر.",
            T({ x:0.95, y:6.29, w:11.4, h:0.4, fontSize:13.5, bold:true, color:NAVY }));
  s.addNotes("هذه الشريحة للسؤال المتوقّع: كل نموذج يبدو ممتازاً في العرض. الجواب أننا خفّضنا الرقم عمداً أربع مرات.");
}

/* ============ 11 · VALUE PATH ============ */
{
  const s = light();
  head(s, "نموذج العائد", "مسار القيمة من 1,000 مطالبة مُرسَلة إلى ريال مُستعاد",
       "كل نسبة في المسار مقيسة على بيانات الاختبار، عدا الأخيرة فهي افتراض تشغيلي متحفّظ.");
  const steps = [
    { n:"1,000",   l:"مطالبة تُرسَل للضامن",            w:11.9, c:"DCE6EF", tc:NAVY, sub:"" },
    { n:"494",     l:"لن تصدر موافقتها كاملة",          w:10.1, c:"F3D9D7", tc:NAVY, sub:"49.4% من المُرسَل" },
    { n:"367",     l:"يلتقطها سديد قبل الإرسال",        w:8.3,  c:"BBD5E6", tc:NAVY, sub:"74.4% استرجاع" },
    { n:"250",     l:"يُشخَّص سببها الصحيح",             w:6.5,  c:BLUE,    tc:W,    sub:"68.0% دقّة التشخيص" },
    { n:"50 – 125",l:"تُصحَّح وتُرسَل مكتملة",            w:4.7,  c:GREEN,   tc:W,    sub:"20% – 50% نسبة الإصلاح (افتراض)" },
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
  s.addText("كل مطالبة تتحوّل من «غير مكتملة» إلى «مقبولة كاملة» تستعيد 83.8 بالمئة من قيمتها، فيرتفع التحصيل بمقدار 4.2 إلى 10.5 نقطة على قيمة كل ما يُرسَل.",
            T({ x:0.95, y:6.41, w:11.4, h:0.4, fontSize:13.5, bold:true, color:W }));
  s.addNotes("نسبة الإصلاح هي الافتراض الوحيد غير المقيس. حتى لو لم يُنتج إصلاحاً إلا خُمس التشخيصات، يبقى العائد 4.2 نقطة.");
}

/* ============ 12 · SENSITIVITY TABLE ============ */
{
  const s = light();
  head(s, "العائد السنوي", "ما الذي يعنيه ذلك بالريال",
       "نحو 181,000 مطالبة سنوياً تمرّ عبر الفحص · القيم بملايين الريالات، إيراداً مستعاداً سنوياً · الأعمدة تمثّل نسبة الإصلاح المفترضة.");
  const CX = [9.39, 7.20, 5.01, 2.82, 0.63], CW = [3.30, 2.19, 2.19, 2.19, 2.19];
  const RY = [1.90, 2.46, 3.02, 3.58, 4.14], RH = 0.56;
  const hdr = ["متوسط قيمة الفاتورة","20%","30%","40%","50%"];
  const body = [
    ["1,000 ريال","7.6","11.4","15.2","18.9"],
    ["2,000 ريال","15.2","22.7","30.3","37.9"],
    ["3,000 ريال","22.7","34.1","45.5","56.8"],
    ["5,000 ريال","37.9","56.8","75.8","94.7"],
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
  s.addText("1,622 ريال", T({ x:XR+0.25, y:CY+0.16, w:CWC-0.5, h:0.52, fontSize:26, bold:true, color:W }));
  s.addText("عائد كل ساعة مراجعة قبل الإرسال، بأدنى قيمة فاتورة وأدنى نسبة إصلاح. يرتفع إلى 4,865 ريالاً عند متوسط فاتورة 3,000 ريال.",
            T({ x:XR+0.25, y:CY+0.72, w:CWC-0.5, h:0.7, fontSize:11.5, color:ICE, lineSpacingMultiple:1.22 }));
  card(s, XL, CY, CWC, CH, { fill:SURF, line:BORD });
  s.addText("العمود الأخضر هو سيناريو التخطيط", T({ x:XL+0.25, y:CY+0.2, w:CWC-0.5, h:0.34, fontSize:14, bold:true, color:GREEN }));
  s.addText("يفترض أن خُمس الحالات المُشخَّصة فقط قابلة للإصلاح قبل الإرسال. أي رقم فوقه مكسب إضافي، لا شرط للجدوى.",
            T({ x:XL+0.25, y:CY+0.62, w:CWC-0.5, h:0.76, fontSize:12, color:NAVY, lineSpacingMultiple:1.25 }));
  foot(s, "متوسط قيمة الفاتورة غير متاح في بيانات النموذج، فعُرض العائد كجدول حساسية تُسقِط عليه الإدارة رقمها الفعلي مباشرة.");
  s.addNotes("لا تدافع عن خانة بعينها. الرسالة أن أضعف خانة في الجدول ما تزال تفوق كلفة التشغيل بمراتب.");
}

/* ============ 13 · COST & LIMITS ============ */
{
  const s = light();
  head(s, "التكلفة والحدود", "ما الذي يكلّفه هذا، وما الذي لا يفعله",
       "عرض صريح للجانبين، لأن قرار التبنّي يحتاج الحدّين معاً.");
  const CW2=5.91, GAP=0.24, X1=0.63+CW2+GAP, X2=0.63;
  function col(x, fill, title, tcol, rows) {
    card(s, x, 1.9, CW2, 4.55, { fill, line:BORD });
    s.addText(title, T({ x:x+0.28, y:2.08, w:CW2-0.56, h:0.4, fontSize:20, bold:true, color:tcol }));
    rows.forEach((p,i) => {
      const y = 2.64 + i*0.95;
      s.addText(p[0], T({ x:x+0.28, y, w:CW2-0.56, h:0.3, fontSize:13.5, bold:true, color:NAVY }));
      s.addText(p[1], T({ x:x+0.28, y:y+0.32, w:CW2-0.56, h:0.56, fontSize:11.5, color:MUTED, lineSpacingMultiple:1.2 }));
    });
  }
  col(X1, W, "التكلفة", GREEN, [
    ["لا ميزانية تطوير","المنصّة مبنيّة ومُختبَرة ومُوثَّقة بالكامل."],
    ["لا كلفة بنية تحتية","تعمل داخل المتصفّح، بلا خادم ولا قاعدة بيانات ولا كلفة لكل مطالبة."],
    ["لا مخاطرة خصوصية","بيانات المطالبة لا تغادر جهاز المستخدم، ولا يستعمل النموذج أي معرّف شخصي."],
    ["الكلفة الوحيدة هي وقت المراجعة","يُعلَّم 516 من كل 1,000 مطالبة للمراجعة المسبقة، والعتبة قابلة للرفع لتضييق هذا العدد."],
  ]);
  col(X2, SURF, "الحدود", AMBER, [
    ["مساعد قرار لا بديل عن المراجعة","لا يُتّخذ قرار برفض خدمة لمريض بناءً عليه إطلاقاً."],
    ["يميل إلى الإنذار عمداً","نحو 29 بالمئة ممّا يُعلَّم يُقبل فعلاً بالكامل، وهو ثمن مقصود مقابل التقاط 74 بالمئة من الخاسرة."],
    ["لا يميّز الرفض من الخصم الجزئي","ينذر بأن الموافقة لن تكتمل، دون تحديد أيّهما."],
    ["يتدهور بتغيّر سياسات الضامنين","يُعاد التدريب كل ربع سنة، وهو إجراء مؤتمت بأمر واحد."],
  ]);
  foot(s, "المخاطرة الأساسية ليست في النموذج بل في التبنّي، فأداة لا تُدخَل في المسار الإلزامي لا تُنتج عائداً.");
  s.addNotes("اعرض الحدود بثقة. الإدارة تثق بالعرض الذي يذكر حدوده أكثر من العرض الذي يخفيها.");
}

/* ============ 14 · ROADMAP + ASK ============ */
{
  const s = dark();
  s.addText("خارطة التشغيل", T({ x:0.6, y:0.5, w:12.1, h:0.3, fontSize:12, bold:true, color:ICE, charSpacing:1 }));
  s.addText("ثلاث مراحل خلال ربع واحد", T({ x:0.6, y:0.82, w:12.1, h:0.62, fontSize:32, bold:true, color:W }));
  const ph = [
    { x:8.87, n:"1", t:"تشغيل تجريبي", d:"مستشفى واحد وأعلى ثلاثة عقود قيمةً، وتُقاس فيه نسبة الإصلاح الفعلية ميدانياً.", k:"4 أسابيع" },
    { x:4.74, n:"2", t:"إلزام الفحص المسبق", d:"إدخال سديد خطوةً إلزامية قبل الإرسال في المسار المعتمد، وربط مخرجاته بلوحة Power BI القائمة.", k:"4 أسابيع" },
    { x:0.61, n:"3", t:"التعميم والمتابعة", d:"التوسّع على مستوى التجمع، وإعادة تدريب ربع سنوية، ومتابعة أثر التحصيل شهرياً.", k:"مستمرّ" },
  ];
  ph.forEach(o => {
    card(s, o.x, 1.72, 3.82, 2.72, { fill:"1B4A66", line:"2A6288", flat:true });
    circle(s, o.x+3.07, 1.95, 0.5, o.n, ICE, NAVY, 17);
    s.addText(o.t, T({ x:o.x+0.25, y:2.0, w:2.7, h:0.42, fontSize:19, bold:true, color:W }));
    s.addText(o.d, T({ x:o.x+0.25, y:2.62, w:3.32, h:1.2, fontSize:12.5, color:ICE, lineSpacingMultiple:1.3 }));
    s.addText(o.k, T({ x:o.x+0.25, y:3.92, w:3.32, h:0.34, fontSize:11.5, bold:true, color:"7FE3C0" }));
  });
  card(s, 0.61, 4.76, 12.08, 1.62, { fill:W, line:W, flat:true });
  s.addText("الطلب", T({ x:0.95, y:4.98, w:11.4, h:0.32, fontSize:14, bold:true, color:BLUE }));
  s.addText("اعتماد التشغيل التجريبي في مستشفى واحد لمدة أربعة أسابيع، وتكليف إدارة أداء تنمية الإيرادات بقياس نسبة الإصلاح الفعلية ورفع نتيجتها.",
            T({ x:0.95, y:5.36, w:11.4, h:0.86, fontSize:16, bold:true, color:NAVY, lineSpacingMultiple:1.28 }));
  s.addText("سديد  ·  تجمع مكة المكرمة الصحي  ·  إدارة أداء تنمية الإيرادات  ·  إعداد: هاني السلمي",
            T({ x:0.6, y:6.66, w:12.1, h:0.34, fontSize:11.5, color:DIM }));
  s.addNotes("الطلب مقصود صغيراً: قرار تشغيلي واحد بلا ميزانية، ونتيجته تحسم التعميم من عدمه.");
}

pres.writeFile({ fileName: SP + "deck.pptx" }).then(f => console.log("WROTE", f));
