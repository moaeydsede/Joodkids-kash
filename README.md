# VIP Cashbook – Mobile App (PWA)

تطبيق موبايل (PWA) لإدارة الصندوق والمحافظ والحسابات — يعمل محليًا باستخدام LocalStorage.

## بيانات الدخول الافتراضية
- Username: `admin`
- Password: `12345` (تقبل أيضًا: ١٢٣٤٥)

## التشغيل على GitHub Pages
1) فك الضغط  
2) ادخل مجلد `vip-cashbook`  
3) ارفع **المحتويات** إلى Root الريبو:
- `index.html`
- `manifest.json`
- `assets/`

4) GitHub → Settings → Pages  
- Branch: `main`
- Folder: `/ (root)`

5) افتح الرابط:
`https://USERNAME.github.io/REPO_NAME/`

## التثبيت كتطبيق على الموبايل
- افتح الرابط من Chrome
- من القائمة ⋮ اختر **Add to Home Screen**
- سيعمل كتطبيق مستقل (Standalone)

## استيراد Excel
من داخل التطبيق: صفحة **استيراد Excel**  
القالب جاهز للتنزيل داخل التطبيق.

الأعمدة الأساسية:
- date | account | type | amount | note | ref

type يدعم: IN/OUT أو قبض/صرف.

## النسخ الاحتياطي
من صفحة الإعدادات:
- تحميل نسخة احتياطية JSON
- استعادة من JSON

> ملاحظة: لا يوجد Service Worker لتجنب مشاكل الكاش.
