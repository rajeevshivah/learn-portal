// Email from the portal (welcome mail with login details, password reset codes).
// Works with any SMTP account. For Google Workspace / Gmail: turn on 2-step
// verification, make an App password, then set MAIL_USER and MAIL_PASS.
// Without MAIL_USER/MAIL_PASS nothing is sent and callers get { sent: false }.
const nodemailer = require('nodemailer');

const enabled = () => Boolean(process.env.MAIL_USER && process.env.MAIL_PASS);

let transport = null;
function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'smtp.gmail.com',
      port: Number(process.env.MAIL_PORT || 465),
      secure: String(process.env.MAIL_SECURE || 'true') !== 'false',
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    });
  }
  return transport;
}

const from = () => process.env.MAIL_FROM || `codeWithShivah <${process.env.MAIL_USER}>`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Plain, readable mail that renders the same in Gmail on a phone.
function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#16203a">
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
  <div style="font-weight:700;font-size:18px;margin-bottom:18px">code<span style="color:#0f5c47">With</span>Shivah</div>
  <div style="background:#fff;border:1px solid #e3e6ec;border-radius:14px;padding:24px 22px">
    <h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
    ${bodyHtml}
  </div>
  <p style="font-size:12px;color:#6b7385;margin:16px 4px 0">Rajeev Shivah · learn.rajeevshivah.me · Reply to this mail if something is wrong.</p>
</div></body></html>`;
}

async function send({ to, subject, html, text }) {
  if (!enabled()) return { sent: false, reason: 'Email is not set up (MAIL_USER / MAIL_PASS)' };
  try {
    await getTransport().sendMail({ from: from(), to, subject, html, text });
    return { sent: true };
  } catch (e) {
    console.error('Mail error:', e.message);
    return { sent: false, reason: e.message };
  }
}

const SITE = () => process.env.CLIENT_URL || 'https://learn.rajeevshivah.me';

function welcome({ name, email, phone, password }) {
  const row = (k, v) => `<tr><td style="padding:6px 0;color:#6b7385;width:110px">${k}</td><td style="padding:6px 0;font-weight:600">${esc(v)}</td></tr>`;
  return send({
    to: email,
    subject: 'Your codeWithShivah login details',
    text: `Hi ${name},\n\nYour account is ready. Keep these details safe:\n\nLogin: ${email} or ${phone}\nPassword: ${password}\n\nSign in at ${SITE()}/login\n\n– Rajeev`,
    html: layout(`Welcome, ${name.split(' ')[0]}`, `
      <p style="margin:0 0 14px;line-height:1.55">Your account is ready. You can sign in with your email <b>or</b> your mobile number, plus this password.</p>
      <table style="border-collapse:collapse;font-size:15px;width:100%;background:#f7f8fa;border-radius:10px;padding:8px 14px">
        ${row('Email', email)}${row('Mobile', phone)}${row('Password', password)}
      </table>
      <p style="margin:16px 0 0"><a href="${SITE()}/login" style="display:inline-block;background:#0f5c47;color:#fff;text-decoration:none;padding:11px 18px;border-radius:9px;font-weight:600">Open the portal</a></p>
      <p style="margin:16px 0 0;font-size:13px;color:#6b7385">Keep this mail. If you forget your password, use “Forgot password” on the login page.</p>`),
  });
}

function resetCode({ name, email, code }) {
  return send({
    to: email,
    subject: `${code} is your codeWithShivah reset code`,
    text: `Hi ${name},\n\nYour password reset code is ${code}. It works for 15 minutes.\n\nIf you didn't ask for this, ignore this mail.`,
    html: layout('Reset your password', `
      <p style="margin:0 0 14px;line-height:1.55">Enter this code on the portal to choose a new password. It works for 15 minutes.</p>
      <div style="font-size:34px;letter-spacing:8px;font-weight:700;text-align:center;background:#f7f8fa;border-radius:10px;padding:16px">${esc(code)}</div>
      <p style="margin:16px 0 0;font-size:13px;color:#6b7385">If you didn’t ask for this, ignore this mail. Your password stays the same.</p>`),
  });
}

module.exports = { enabled, send, welcome, resetCode };
