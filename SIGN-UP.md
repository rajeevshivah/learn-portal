# Sign-up with mobile + password, and the new look

Added 8 Nov 2026.

## Why
Students sent to the webinar link had to sign in with Google, and many can't (shared phone,
forgotten Gmail password). Now they can also sign up with name, mobile, email and a password
of their own, and sign in with **email or mobile** + password. Google stays as it was.

## What students see
- `/login`: Google button, then "Email or mobile number" + "Password". Links: Forgot password,
  Create an account.
- `/login?mode=signup` (where the public webinar page's Register button now goes): name, mobile,
  email, password. On success a **"You're in" card** shows email, mobile and password with a
  "Copy details" button, so they screenshot it. Then **Continue** signs them in. The same
  details are emailed (when email is set up, see below).
- **Forgot password**: email or mobile → 6-digit code by email (15 min) → new password → signed in.
  This also works for a Google-only account: it proves they own the email and adds a password.
- **More → Your account** (`/account`): add or change password, add mobile. Google students can
  add a password here as a backup.
- One device at a time still applies to password logins.

## Admin
- **Students**: search by mobile too; "Google" marks accounts with no password. **New password**
  gives a student a fresh 6-digit password (shown to you, emailed to them, signs them out
  everywhere). **+ Add student** makes an account for someone stuck on the phone with you.
- **Settings → Student sign-in → "Sign-up with mobile + password"**: untick to go Google-only.
- MCP: `create_student`, `reset_student_password`, `set_password_signup`; `search_students`
  now shows phone and how they sign in.

## Email (needed for welcome mails and reset codes)
In Render → Environment add:
```
MAIL_USER=rajeev@rajeevshivah.me
MAIL_PASS=<16-letter Google App password>
```
Google Workspace: Google Account → Security → 2-Step Verification on → App passwords → Mail.
Without these, sign-up still works (details shown on screen) but "Forgot password" tells the
student to message you, and you reset it from Students.

## Safety
- Passwords are bcrypt-hashed. Reset codes are hashed, expire in 15 min, 5 wrong tries.
- 10 wrong logins per 15 min per IP+login → "Too many tries".
- Someone can't take over a Google account by signing up with its email: they're told to use
  Google or Forgot password (which needs the email).

## The new look
Light "paper" theme with ink text; one blackboard-green primary; the next class is drawn as
a dark **blackboard** (the only dark block on a page); chalk-yellow for live/urgent.
Type: Bricolage Grotesque (headings) + Mukta (text; covers Hindi too). Fonts are bundled
(`@fontsource…`), no Google Fonts call. Admin pages inherit the theme; the whiteboard tool
keeps its own dark theme (`board.css`).
