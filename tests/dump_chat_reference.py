# -*- coding: utf-8 -*-
"""
dump_chat_reference.py — يُخرج ناتج دوال المعالجة العربية في بايثون
ليقارنها tests/verify_chat.js بنظيرتها في المتصفّح.

الفهرس يُبنى ببايثون ويُستعلَم بجافاسكربت، فأي انحراف بين التطبيعين
يجعل كلمة المستخدم تخطئ رمزها في الفهرس فلا تُسترجَع المادة الصحيحة.

    python3 tests/dump_chat_reference.py > tests/chat_reference.json
"""
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "bc", os.path.join(HERE, "..", "chatbot", "build_corpus.py"))
bc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bc)

CASES = [
    "كم مدة الرد على طلب الموافقة المسبقة؟",
    "الطلب، والموافقة؛ بنسبة ٥٠٪",
    "المادة (36): إجراءات طلب الموافقة",
    "تُغطى في حالات الطوارئ فقط تكاليف نقل المستفيدين",
    "للحمل والولادة",
    "خلال ٦٠ دقيقة كحد أقصى",
    "Prior Authorization Request",
    "الأيتام المحتضنون لدى الأسر الكافلة",
    "لائحة حماية مستفيدي الضمان الصحي",
    "  مسافات   زائدة  ",
]

TOKENS = ["الموافقة", "بالموافقة", "للموافقة", "موافقة", "الحمل", "للحمل",
          "المستفيدين", "مستفيد", "التأمين", "بالتأمين", "ال", "لل", "علاج"]

print(json.dumps({
    "normalize": {c: bc.normalize(c) for c in CASES},
    "tokenize": {c: bc.tokenize(c) for c in CASES},
    "stem": {t: bc.stem(bc.normalize(t)) for t in TOKENS},
}, ensure_ascii=False, indent=1))
