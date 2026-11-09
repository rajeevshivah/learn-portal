import { useEffect, useState } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import Toast from '../../components/Toast';

const API = import.meta.env.VITE_API_URL;

// ── AI access keys for the MCP server (Claude / GPT) ──
function AccessKeys({ setToast }) {
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState('');
  const [days, setDays] = useState(90);
  const [write, setWrite] = useState(true);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => axios.get(`${API}/apikeys`).then(({ data }) => setKeys(data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return setToast('Give the key a name, e.g. "Claude on my laptop"');
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/apikeys`, { name, days, write });
      setSecret(data.token); setName(''); load();
    } catch (err) { setToast(err.response?.data?.message || 'Could not create key'); }
    finally { setBusy(false); }
  };
  const revoke = async (k) => {
    if (!window.confirm(`Revoke "${k.name}"? Any assistant using it stops working immediately.`)) return;
    try { await axios.delete(`${API}/apikeys/${k._id}`); load(); setToast('Key revoked'); }
    catch (err) { setToast(err.response?.data?.message || 'Could not revoke'); }
  };
  const status = (k) => k.revokedAt ? 'Revoked' : new Date(k.expiresAt) <= new Date() ? 'Expired' : 'Active';

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 16, marginBottom: 4 }}>AI access keys (MCP)</h3>
      <p className="small muted" style={{ marginBottom: 14 }}>
        Lets Claude (on your phone, claude.ai or desktop) or GPT run this admin panel for you. A key acts as you.
        Read-only keys can look but not change anything. Revoke a key the moment you stop using it.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" style={{ flex: '2 1 200px' }} placeholder='Name, e.g. "Claude on my laptop"'
          value={name} onChange={e => setName(e.target.value)} maxLength={80} />
        <select className="input" style={{ flex: '0 1 130px' }} value={days} onChange={e => setDays(Number(e.target.value))}>
          {[30, 90, 180, 365].map(d => <option key={d} value={d}>{d} days</option>)}
        </select>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={write} onChange={e => setWrite(e.target.checked)} />
          Allow changes
        </label>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={create}>
          {busy ? 'Creating…' : 'Create key'}
        </button>
      </div>

      {secret && (
        <div className="card" style={{ marginTop: 12, borderColor: 'var(--warning)' }}>
          <strong className="small" style={{ color: 'var(--warning)' }}>Shown once. Copy what you need now.</strong>

          <div style={{ marginTop: 12, fontWeight: 600 }}>For Claude on your phone, claude.ai or Claude Desktop</div>
          <p className="small muted" style={{ margin: '2px 0 6px' }}>
            Claude → Settings → Connectors → <b>Add custom connector</b>. Server URL: the address below. Authentication: <b>No sign-in</b>.
            Under <b>Request headers</b> add one header: name <code>Authorization</code>, value <code>Bearer</code> + a space + the key below.
            Claude stores the key and never shows it again.
          </p>
          <code style={{ display: 'block', wordBreak: 'break-all', fontSize: 13 }}>{`${API.replace(/\/api\/?$/, '')}/mcp`}</code>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={() =>
              navigator.clipboard?.writeText(`${API.replace(/\/api\/?$/, '')}/mcp`).then(() => setToast('Server URL copied')).catch(() => {})}>Copy server URL</button>
            <button className="btn btn-ghost btn-sm" onClick={() =>
              navigator.clipboard?.writeText(`Bearer ${secret}`).then(() => setToast('Header value copied')).catch(() => {})}>Copy header value</button>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            If a client can’t set headers, use <code>{`${API.replace(/\/api\/?$/, '')}/mcp/${secret}`}</code> as the URL instead; then the URL itself is the password.
          </p>

          <div style={{ marginTop: 16, fontWeight: 600 }}>Key only (for the local MCP server or GPT)</div>
          <code style={{ display: 'block', wordBreak: 'break-all', margin: '6px 0 8px', fontSize: 13 }}>{secret}</code>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() =>
              navigator.clipboard?.writeText(secret).then(() => setToast('Key copied')).catch(() => {})}>Copy key</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSecret('')}>I've saved it</button>
          </div>
        </div>
      )}

      {keys.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table className="table">
            <thead><tr><th>Name</th><th>Key</th><th>Access</th><th>Expires</th><th>Last used</th><th>Status</th><th /></tr></thead>
            <tbody>
              {keys.map(k => (
                <tr key={k._id}>
                  <td>{k.name}</td>
                  <td className="small muted">{k.prefix}…</td>
                  <td>{k.scopes.includes('write') ? 'Read + change' : 'Read only'}</td>
                  <td className="small">{new Date(k.expiresAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                  <td className="small muted">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never'}</td>
                  <td>{status(k)}</td>
                  <td>{status(k) === 'Active' && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => revoke(k)}>Revoke</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SettingsTab() {
  const [form, setForm] = useState({ upiId: '', upiName: '', paymentNote: '' });
  const [qrUrl, setQrUrl] = useState('');          // uploaded custom QR (overrides generated)
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [singleDevice, setSingleDevice] = useState(null);   // null until loaded
  const [meetDefault, setMeetDefault] = useState(null);
  const [pwSignup, setPwSignup] = useState(null);
  const [mailOn, setMailOn] = useState(false);

  useEffect(() => {
    axios.get(`${API}/settings`).then(({ data }) => {
      setForm({ upiId: data.upiId || '', upiName: data.upiName || '', paymentNote: data.paymentNote || '' });
      setQrUrl(data.paymentQrUrl || '');
      setSingleDevice(data.singleDeviceLogin !== false);
      setMeetDefault(data.meetLinkPerClassForNew !== false);
      setPwSignup(data.passwordSignup !== false);
      setMailOn(Boolean(data.mailEnabled));
    }).catch(() => setToast('Could not load settings'));
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await axios.put(`${API}/settings`, form);
      setToast('Settings saved');
    } catch (err) {
      setToast(err.response?.data?.message || 'Save failed');
    } finally { setBusy(false); }
  };

  const uploadQr = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setToast('Please choose an image file'); return; }
    setUploadingQr(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await axios.post(`${API}/settings/payment-qr`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setQrUrl(data.paymentQrUrl || '');
      setToast('QR uploaded ✓ — students will now see your own QR');
    } catch (err) {
      setToast(err.response?.data?.message || 'QR upload failed');
    } finally { setUploadingQr(false); }
  };

  const removeQr = async () => {
    if (!window.confirm('Remove your uploaded QR? Students will see the auto-generated QR instead.')) return;
    try {
      const { data } = await axios.delete(`${API}/settings/payment-qr`);
      setQrUrl(data.paymentQrUrl || '');
      setToast('Custom QR removed — using generated QR now');
    } catch (err) {
      setToast(err.response?.data?.message || 'Could not remove QR');
    }
  };

  const toggleSingleDevice = async (on) => {
    setSingleDevice(on);
    try {
      await axios.put(`${API}/settings`, { singleDeviceLogin: on });
      setToast(on ? 'Students now stay signed in on one device at a time' : 'Students can be signed in on several devices');
    } catch (err) {
      setSingleDevice(!on);
      setToast(err.response?.data?.message || 'Could not save');
    }
  };

  const togglePwSignup = async (on) => {
    setPwSignup(on);
    try {
      await axios.put(`${API}/settings`, { passwordSignup: on });
      setToast(on ? 'Students can sign up with mobile + password' : 'Sign-up is Google only now');
    } catch (err) {
      setPwSignup(!on);
      setToast(err.response?.data?.message || 'Could not save');
    }
  };

  const toggleMeetDefault = async (on) => {
    setMeetDefault(on);
    try {
      await axios.put(`${API}/settings`, { meetLinkPerClassForNew: on });
      setToast(on ? 'New programs get a Meet link per class' : 'New programs start without automatic Meet links');
    } catch (err) {
      setMeetDefault(!on);
      setToast(err.response?.data?.message || 'Could not save');
    }
  };

  const testLink = form.upiId
    ? `upi://pay?pa=${encodeURIComponent(form.upiId)}&pn=${encodeURIComponent(form.upiName || 'codeWithShivah')}&am=1&cu=INR&tn=Test`
    : '';

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>UPI payment settings</h2>
        <p className="small muted" style={{ marginBottom: 16 }}>
          Students pay directly to this UPI ID. If you upload your own QR below, students see that;
          otherwise a QR is generated automatically from your UPI ID.
        </p>

        <div className="field"><label className="label">UPI ID *</label>
          <input className="input" value={form.upiId} onChange={e => setForm(f => ({ ...f, upiId: e.target.value }))} placeholder="yourname@okaxis" /></div>
        <div className="field"><label className="label">Display name (shown in UPI apps)</label>
          <input className="input" value={form.upiName} onChange={e => setForm(f => ({ ...f, upiName: e.target.value }))} placeholder="codeWithShivah" /></div>
        <div className="field"><label className="label">Note shown on payment page</label>
          <textarea className="textarea" value={form.paymentNote} onChange={e => setForm(f => ({ ...f, paymentNote: e.target.value }))} /></div>

        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
      </div>

      {/* ── Student sign-in ── */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>Student sign-in</h2>
        <label className="checkbox-row" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" checked={Boolean(singleDevice)} disabled={singleDevice === null}
            onChange={e => toggleSingleDevice(e.target.checked)} style={{ marginTop: 2 }} />
          <span>
            <strong style={{ color: 'var(--text)' }}>One device at a time</strong><br />
            <span className="small muted">
              Signing in on a new phone or laptop signs the student out of the previous one, so one paid account
              can’t be used by two people side by side. Students switching devices just sign in again.
              Admin accounts are never affected.
            </span>
          </span>
        </label>
        <label className="checkbox-row" style={{ alignItems: 'flex-start', marginTop: 14 }}>
          <input type="checkbox" checked={Boolean(pwSignup)} disabled={pwSignup === null}
            onChange={e => togglePwSignup(e.target.checked)} style={{ marginTop: 2 }} />
          <span>
            <strong style={{ color: 'var(--text)' }}>Sign-up with mobile + password</strong><br />
            <span className="small muted">
              Besides Google, students can sign up with name, mobile, email and a password of their choice, and sign in with
              email or mobile. Their details are shown once on screen to screenshot{mailOn ? ' and emailed to them' : ''}.
              You can reset any student’s password under Students.
            </span>
          </span>
        </label>
        {!mailOn && (
          <p className="small" style={{ marginTop: 12, color: 'var(--warning)' }}>
            Email is not set up, so welcome mails and “Forgot password” codes can’t be sent. Add MAIL_USER and MAIL_PASS
            (a Google App password for rajeev@rajeevshivah.me) in Render → Environment. Until then, reset passwords from Students.
          </p>
        )}
      </div>

      {/* ── Class Meet links ── */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>Class Meet links</h2>
        <label className="checkbox-row" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" checked={Boolean(meetDefault)} disabled={meetDefault === null}
            onChange={e => toggleMeetDefault(e.target.checked)} style={{ marginTop: 2 }} />
          <span>
            <strong style={{ color: 'var(--text)' }}>New programs get a Meet link per class</strong><br />
            <span className="small muted">
              Every class of a new program gets its own Google Meet, made automatically in your Google Calendar.
              You can switch it per program under Live &amp; Workshops → 🔗 Meet links.
            </span>
          </span>
        </label>
      </div>

      {/* ── Custom QR upload ── */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>Your own payment QR (recommended)</h2>
        <p className="small muted" style={{ marginBottom: 14 }}>
          Upload the QR from your PhonePe / Google Pay / bank app. Your own QR works reliably across
          every UPI app — the auto-generated one can fail for some users. When set, this replaces the
          generated QR everywhere students pay. Students still enter the amount themselves.
        </p>

        {qrUrl ? (
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <div className="qr-box" style={{ display: 'inline-block' }}>
              <img src={qrUrl} alt="Payment QR" style={{ width: 200, height: 200, objectFit: 'contain', display: 'block' }} />
            </div>
            <p className="small" style={{ color: 'var(--success)', marginTop: 10 }}>✓ Your QR is live for all payments</p>
          </div>
        ) : (
          <p className="small muted" style={{ marginBottom: 14 }}>No custom QR uploaded — using the generated QR.</p>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
            {uploadingQr ? 'Uploading…' : (qrUrl ? 'Replace QR' : 'Upload QR image')}
            <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingQr}
              onChange={e => uploadQr(e.target.files[0])} />
          </label>
          {qrUrl && <button className="btn btn-ghost btn-sm" onClick={removeQr}>Remove custom QR</button>}
        </div>
      </div>

      {testLink && !qrUrl && (
        <div className="card" style={{ marginTop: 16, textAlign: 'center' }}>
          <p className="small muted" style={{ marginBottom: 12 }}>Test QR (₹1) — scan with your own UPI app to verify the ID is correct before going live</p>
          <div className="qr-box"><QRCodeSVG value={testLink} size={150} level="M" /></div>
        </div>
      )}
      <AccessKeys setToast={setToast} />
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
