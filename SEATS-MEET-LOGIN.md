# Seat changes, Meet guest list, one device at a time

Added 6 Nov 2026.

## 1. Move or cancel a seat (Admin → Live & Workshops → Registrations)

Each confirmed or pending registration now has **Move to email** and **Cancel seat**.

- **Move to email**: for a student who lost access to the Gmail they registered with,
  or used the wrong one. Their access, recordings and refund rights move with the seat.
  If nobody has signed in with the new email yet, an account is created; the student just
  signs in with Google using that email. The move is kept in the seat's history.
- **Cancel seat**: removes access. Optionally refund:
  - Razorpay payment: refunded through Razorpay at once (or tick "already refunded in the
    dashboard").
  - UPI payment: recorded in Refunds as approved; send the money, then mark it sent there.
  If the student already asked for a refund, decide it in Refunds instead.
- The search box on the registrations page also finds a Razorpay `pay_…` id or a phone number.

Student says "I paid but can't see my registration": search their payment id or phone in
the registrations page (or ask Claude: `find_registration`). It shows which email they used.

## 2. Meet guest list (Admin → Live & Workshops → 🔒 Meet guests)

Keeps every confirmed student on the guest list of the Google Calendar event that holds the
class Meet link. Updated automatically on every payment, approval, move, cancel and refund.
Guests are added silently (no email per student). Only guests the portal added are ever
removed; co-hosts you invited yourself are left alone.

**Then, in Google Meet, set the meeting's access to "Trusted"** (Host controls → Meeting access).
Invited guests join directly; anyone with a forwarded link has to ask to join, and you can deny.
Students must join with the Google account they registered with.

### One-time setup (about 10 minutes)

1. Google Cloud Console → the project used for "Sign in with Google" → **APIs & Services →
   Library** → enable **Google Calendar API**.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID → Desktop app.**
   Copy the client ID and secret.
3. **OAuth consent screen**: if the publishing status is "Testing", click **Publish app**.
   (In Testing, Google expires the permission after 7 days.)
4. On your laptop, in `backend`:
   `node scripts/google-calendar-token.js <CLIENT_ID> <CLIENT_SECRET>`
   Open the link it prints, choose **rajeev@rajeevshivah.me** (the account that owns the class
   meeting), allow access. It prints three lines.
5. Render → backend → Environment: add `GOOGLE_CAL_CLIENT_ID`, `GOOGLE_CAL_CLIENT_SECRET`,
   `GOOGLE_CAL_REFRESH_TOKEN`. Save (Render redeploys).
6. Admin → Live & Workshops → 🔒 Meet guests → switch **On**. The portal finds the calendar
   event from the Meet link on the classes; if it can't, paste the event's link from Google
   Calendar.

## 3. One device at a time (Admin → Settings → Student sign-in)

On by default. A student signing in on a new device is signed out of the previous one, with a
message explaining why. Admins are never affected. Students already signed in stay signed in
until they next sign in somewhere. Admin → Students → **Sign out everywhere** ends all of a
student's sessions.

## MCP tools

find_registration, transfer_registration, cancel_registration, get_meet_guests,
set_meet_guests, sync_meet_guests, sign_out_student, set_single_device_login.
