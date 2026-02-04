# Cash & Wallet Manager VIP — v3 (GitHub Pages + Google Sheets CRUD)

هذه النسخة تحقق طلبك:
- قراءة العمليات الموجودة في Google Sheet.
- عند **الإضافة / التعديل / الحذف** يتم تعديل نفس Google Sheet فعليًا.

✅ الواجهة ترفعها على GitHub Pages (Static).  
✅ الكتابة على الشيت تحتاج Backend — تم توفيره كـ **Google Apps Script Web App (API فقط)**.

## 1) نشر الـ API (Apps Script)
افتح Google Apps Script جديد وارفع ملف `backend/Code.gs` ثم:
- Deploy -> New deployment -> Web app
- Execute as: Me
- Who has access: Anyone
- انسخ رابط `exec`

ضعه داخل `config.js`:
```js
API_BASE: "https://script.google.com/macros/s/XXXX/exec"
```

## 2) هيكلة شيت TXNS
الأعمدة المطلوبة (A..H):
A Date  
B ACCOUNT  
C WALLET_ID  
D RECEIPTS  
E PAYMENTS  
F DESC  
G REF  
H CREATED_AT  

✅ الـ API سيملأ CREATED_AT تلقائيًا عند الإضافة.

## 3) نشر الواجهة
ارفع ملفات الواجهة على GitHub وفعّل Pages.

## ملاحظة أمنية
لو مشروعك عام على الإنترنت، أي شخص يعرف رابط الـ API قد يحاول يضيف بيانات.  
يمكن تقوية الحماية (Token/Origin/Rate-limit). لو تحب أعملها لك.


## التحديث التلقائي
- يتم تحديث البيانات تلقائيًا كل 20 ثانية (يمكن تعديلها داخل `app.js` في دالة `startAutoSync`).
- يتم إيقاف التحديث أثناء فتح نافذة الإضافة/التعديل أو أثناء الكتابة لتجنب الإزعاج.
