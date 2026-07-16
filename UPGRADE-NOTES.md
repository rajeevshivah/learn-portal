# Learn Portal — Paid Courses Upgrade

## What's new
- **Paid courses** with UPI payment (dynamic QR, amount pre-filled) + admin approval queue
- **Student dashboard** (`/dashboard`) — continue learning, per-course progress, payment status
- **Progress tracking** — mark lessons complete, progress bars everywhere
- **Free previews** — flag first 2-3 episodes of a paid course as previews (conversion engine)
- **Rebuilt admin panel** — tabs: Payments (with pending badge) / Courses / Episodes / Students / Settings
- **Revenue analytics** — total revenue, per-course sales, pending payments
- **Enrollment gating fixed** — locked episodes never send youtubeUrl/files to the browser
- **Async crash bug fixed** — all routes wrapped with express-async-handler + proper global error handler
- **New responsive UI** — design system in `frontend/src/styles/global.css`, mobile nav, Sora/Inter fonts

## New in this version (v3)
- **Per-episode doubts (Q&A)** — students ask under any lesson, you answer from Admin -> Doubts
  (red badge shows unanswered count). Answers appear under the question as "Rajeev sir".
  Students can delete their own unanswered questions. Doubts respect course access
  (locked course = can't ask, free previews = can ask).
- **Access validity per course** — Admin -> Courses -> paid course -> "Access validity":
  Lifetime / 90 days / 6 months / 1 year. Countdown starts at payment APPROVAL, not payment.
  Expired students see "Renew access" on dashboard + course page and pay again through the
  same UPI flow; their progress is preserved. Changing a course's validity later does NOT
  affect already-approved students. Existing/free enrollments = lifetime (no migration needed).

## Extra test steps for the new features
A. Doubts: as student, open a lesson -> ask a doubt -> as admin see Doubts badge -> answer ->
   student refreshes and sees the answer highlighted. Try asking on a locked episode via URL —
   must be blocked.
B. Validity: set test course to 90 days -> buy + approve -> student dashboard shows
   "Access till <date>". (Real expiry testing needs a date change — trust the logic or
   temporarily set a past expiresAt directly in MongoDB Atlas to see the renew flow.)

## Deploy steps (in order)
1. `cd backend && npm install`  — then `cd ../frontend && npm install`  (new dep: qrcode.react)
2. **Run the migration ONCE** against your production DB (uses backend/.env MONGO_URI):
   `cd backend && node migrations/002-paid-layer.js`
   Idempotent — safe to re-run. Marks existing enrollments active, existing courses free.
3. Test locally: `npm run dev` in both folders. Do one full fake purchase:
   set UPI ID in Admin → Settings, create a paid test course, buy it from a student account,
   approve it from admin, confirm episodes unlock.
4. Push to GitHub → Render + Vercel redeploy. No new env variables needed
   (UPI ID lives in the database, managed from Admin → Settings).

## First-time setup after deploy
1. Login as admin → Admin → **Settings** → enter your UPI ID + display name → save.
   Scan the ₹1 test QR with your own phone to confirm the ID is right.
2. Admin → Courses → create your first paid course (price, what-you'll-learn, phases).
3. Add episodes; mark the first 2-3 as **Free preview**; publish when ready.

## How a sale works
Student clicks Buy → scans QR (amount pre-filled) → pays → submits UTR (+ optional screenshot)
→ enrollment goes **pending** → you see it in Admin → Payments (badge) → match UTR in your UPI app
→ **Approve** → access unlocks instantly → student sees it on their dashboard.
Reject sends the reason back; the student can resubmit from the same page.

## Not included (deliberately, keep scope tight)
- Email notifications on approve/reject (Brevo can be added later like MentorHub)
- Razorpay (add as a second payment method when KYC clears — the enrollment model already supports it)
