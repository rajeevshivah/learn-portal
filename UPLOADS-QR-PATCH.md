# Image Upload + Custom QR patch

Fixes "request entity too large" on webinar create, adds a proper image-upload
button for event thumbnails, and lets you upload your own PhonePe/GPay QR
(global) with the auto-generated QR kept as fallback.

## What changed & why

1. "Request entity too large" — your JSON import carried the image as base64
   inside the request body, and express.json() defaulted to 100 KB. Raised to 5 MB.
   Root fix is #2: images no longer travel inside JSON at all.

2. Event thumbnail upload — EventsTab now has an "Upload image" button. It sends
   the file to Cloudinary (reusing your existing image uploader) and stores only
   the URL. You can still paste a URL, and JSON import still works — but you no
   longer embed images in JSON.

3. Custom payment QR (global) — Settings has a new "Your own payment QR" upload.
   When set, students see your uploaded QR everywhere (course Payment page and
   event registration). When not set, the app falls back to the auto-generated
   QR. Amount is not pre-filled with a static QR, so the copy adjusts to just
   "scan with any UPI app".

## Files

### Backend (5, all overwritten)
```
backend/server.js              -> body limit 100kb → 5mb
backend/models/Settings.js     -> + paymentQrUrl field
backend/routes/settings.js     -> accept paymentQrUrl; + POST/DELETE /settings/payment-qr (image upload)
backend/routes/payments.js     -> public payment info now returns paymentQrUrl
backend/routes/events.js       -> + POST /events/upload-image; event.payment now includes qrUrl
```

### Frontend (4, all overwritten)
```
frontend/src/pages/admin/EventsTab.jsx    -> thumbnail image upload + preview + URL field
frontend/src/pages/admin/SettingsTab.jsx  -> custom QR upload / preview / remove
frontend/src/pages/Payment.jsx            -> shows uploaded QR, falls back to generated
frontend/src/pages/EventDetail.jsx        -> shows uploaded QR, falls back to generated
```

No new npm packages. No new env vars. Reuses your existing Cloudinary `uploadImage`
(5 MB image limit, learn-portal/payments folder).

## Install
```bash
cp -r backend/ ./
cp -r frontend/ ./
```
Restart the backend (needed for the body-limit change and new routes).

## How to use

Custom QR (do this once):
1. Admin → Settings → "Your own payment QR" → Upload QR image.
2. Save. Every paid course and webinar now shows your real QR.
3. "Remove custom QR" reverts to the generated one.

Event thumbnail:
1. Admin → Events → create/edit an event → "Upload image" under Thumbnail.
2. Or paste an image URL. Don't embed base64 in the JSON import anymore.

## Note on the size limit
5 MB is plenty for text payloads and any accidental inline image. The proper
image path (Cloudinary) keeps request bodies tiny regardless. If you ever import
an event JSON that still contains a huge base64 thumbnail, it will now go through
— but prefer the upload button so your DB stays lean.
