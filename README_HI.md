# Browser Image Optimizer — Pyodide

यह static website Python/Pillow को Pyodide के जरिए ब्राउज़र में चलाती है। कोई Flask/Python backend नहीं है और image files किसी image server पर upload नहीं होतीं।

## Windows PC पर लोकल टेस्ट
1. ZIP extract करें।
2. Python 3 इंस्टॉल होना चाहिए।
3. `run_local.bat` पर double-click करें।
4. ब्राउज़र में `http://localhost:8000` खोलें।
5. पहली बार Pyodide और Pillow डाउनलोड होंगे; इसलिए इंटरनेट जरूरी है।

`index.html` को सीधे `file://` से खोलने की बजाय local server चलाएँ।

## GitHub Pages
इस ZIP को extract करके `index.html`, `app.js` और `style.css` को repository के root में upload करें। GitHub Pages enable करें। यह static hosting है; backend नहीं चाहिए। CDN scripts के लिए internet चाहिए।

## उपयोग
- एक या कई JPG/JPEG, PNG, WebP इमेज चुनें।
- 5%, 10%, 20%, 30%, 50%, 70%, 80% या 90% file-size reduction चुनें।
- Single file को अलग डाउनलोड करें; multiple successful files को एक ZIP में डाउनलोड करें।
- Target एक कोशिश है, guarantee नहीं। PNG को छोटा करने के लिए palette/color reduction से कुछ रंग बदल सकते हैं।
- JPG/WebP में quality घट सकती है। जरूरत पर dimensions घटाने का विकल्प है।
- अगर optimized file original से बड़ी हो, तो original bytes रखे जाते हैं।

## सपोर्ट
JPG/JPEG, PNG और WebP. GIF/BMP/TIFF इस browser build में जानबूझकर शामिल नहीं हैं ताकि animation/multi-page और format fidelity के बारे में गलत वादा न हो।

## नोट
यह पहला Pyodide prototype है। ब्राउज़र/Pillow पैकेज लोडिंग, अलग-अलग images और mobile devices पर व्यावहारिक टेस्ट करना जरूरी है। बड़े बैच और बहुत बड़ी images में RAM/processing time की सीमा हो सकती है।
