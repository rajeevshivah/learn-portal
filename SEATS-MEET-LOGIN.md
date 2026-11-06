# Seat changes, Meet link per class, one device at a time

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

## 2. Meet link per class (Admin → Live & Workshops → 🔗 Meet links)

Every upcoming class gets its own Google Meet, made automatically as an event in your
Google Calendar (no guests, nobody is emailed). If a student forwards a link, it only works
for that one class.

- Links are made the moment you create a program or add/edit classes: the server is awake
  then, so nothing depends on a timer (works on Render's free plan).
- Move or rename a class → its calendar event moves too, same link.
  Delete a class or a program → its calendar event is deleted.
  Clear a class's link → a new meeting is made.
- Type your own link on a class → the portal leaves that class alone (and deletes the
  meeting it had made for it).
- For a program that already uses one shared link, press **Give each its own link** once.
- **Students only get a class's link from 15 minutes before it starts** (until 15 minutes
  after it ends). Before that the server doesn't send it at all, so links can't be
  collected in advance. The Join button fetches the link when clicked.
- New programs start with this on (Admin → Settings → Class Meet links).
- Switching it off keeps the links already made; they keep working.

Why not a guest list: Google blocks adding hundreds of outside guests to an event
("Calendar usage limits exceeded"), so the earlier guest-list approach was removed.

### One-time Google setup (done 7 Nov 2026)

1. Google Cloud Console → project → enable **Google Calendar API**.
2. Google Auth Platform → **Clients → Create client → Desktop app**.
3. Audience: Internal, or External and **Publish app** (Testing expires after 7 days).
4. In `backend`: `node scripts/google-calendar-token.js <CLIENT_ID> <CLIENT_SECRET>`,
   choose the account that hosts the classes, allow.
5. Render → backend → Environment: `GOOGLE_CAL_CLIENT_ID`, `GOOGLE_CAL_CLIENT_SECRET`,
   `GOOGLE_CAL_REFRESH_TOKEN`.

## 3. One device at a time (Admin → Settings → Student sign-in)

On by default. A student signing in on a new device is signed out of the previous one, with a
message explaining why. Admins are never affected. Students already signed in stay signed in
until they next sign in somewhere. Admin → Students → **Sign out everywhere** ends all of a
student's sessions.

## MCP tools

find_registration, transfer_registration, cancel_registration, get_meet_links,
set_meet_links, set_meet_links_default, sign_out_student, set_single_device_login.

