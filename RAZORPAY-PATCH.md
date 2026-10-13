# Razorpay patch — learn.rajeevshivah.me

Paid courses and paid webinars get a **"Pay ₹X"** button that opens Razorpay
(UPI, cards, netbanking, wallets, international cards). Access unlocks the
moment payment succeeds, so nobody waits for you to approve it.
Manual UPI QR + UTR stays as a fallback behind "Prefer scanning a UPI QR manually?".

If the Razorpay keys are missing on Render, the site behaves exactly as before
(manual UPI only). So it's safe to deploy the code first and add keys after.

## Files

| File | New / Replace | Repo |
|---|---|---|
| backend/models/Payment.js | NEW | Render (backend) |
| backend/routes/razorpay.js | NEW | Render (backend) |
| backend/server.js | REPLACE | Render (backend) |
| backend/routes/payments.js | REPLACE (1 line) | Render (backend) |
| backend/package.json | REPLACE (adds `engines: node >=18`) | Render (backend) |
| backend/.env.example | REPLACE (reference only) | Render (backend) |
| frontend/src/lib/razorpay.js | NEW | Vercel (frontend) |
| frontend/src/pages/Payment.jsx | REPLACE | Vercel (frontend) |
| frontend/src/pages/EventDetail.jsx | REPLACE | Vercel (frontend) |
| frontend/src/pages/LivePublic.jsx | REPLACE | Vercel (frontend) |
| frontend/src/pages/admin/PaymentsTab.jsx | REPLACE | Vercel (frontend) |

No new npm packages. No database migration.

## Setup (in this order)

### 1. Render → backend service → Environment
Add three variables:

```
RAZORPAY_KEY_ID          = rzp_live_...   (Key ID from Razorpay)
RAZORPAY_KEY_SECRET      = ...             (Key Secret from the downloaded file)
RAZORPAY_WEBHOOK_SECRET  = any long random string, e.g. cws-wh-8f3k29xq7m
```

### 2. Push backend files to the Render repo
Render redeploys. Check: open
`https://learn-portal-backend.onrender.com/api/rzp/config`
→ should show `{"enabled":true,"keyId":"rzp_live_..."}`

### 3. Razorpay dashboard → Account & Settings → Webhooks → Add new webhook
- Webhook URL: `https://learn-portal-backend.onrender.com/api/rzp/webhook`
- Secret: the SAME string as RAZORPAY_WEBHOOK_SECRET
- Active events: `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`

The webhook is the safety net. If a student pays and closes the tab before the
site confirms, the webhook still unlocks their access.

### 4. Push frontend files to the Vercel repo
No Vercel env vars needed. The key ID comes from the backend.

### 5. Test with a real ₹1 payment
Create a hidden test course (published, paid, price ₹1), buy it with your own
account, confirm it unlocks, then refund it from Razorpay → Transactions → Payments.

## Where things show up
- Student: course unlocks instantly; webinar shows the WhatsApp link instantly.
- Admin → Payments → **Online (Razorpay)**: every online payment (courses + webinars),
  with method, 🌍 for international cards, and total collected.
- Course payments also appear in History with UTR `RZP pay_xxx`;
  webinar ones in the event's registration list as active.

## Notes
- The amount always comes from the database, never from the browser, so
  it can't be tampered with.
- If auto-capture is off in Razorpay, the backend captures the payment itself,
  so it won't be auto-refunded.
- International cards are charged in INR; Razorpay converts for the buyer.
- learn.rajeevshivah.me must be approved under Razorpay → Business website details.
  It was still "scanning" in your screenshot. Wait for approval before going live.
