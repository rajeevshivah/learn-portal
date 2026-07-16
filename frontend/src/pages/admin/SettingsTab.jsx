import { useEffect, useState } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import Toast from '../../components/Toast';

const API = import.meta.env.VITE_API_URL;

export default function SettingsTab() {
  const [form, setForm] = useState({ upiId: '', upiName: '', paymentNote: '' });
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`${API}/settings`).then(({ data }) =>
      setForm({ upiId: data.upiId || '', upiName: data.upiName || '', paymentNote: data.paymentNote || '' })
    ).catch(() => setToast('Could not load settings'));
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

  const testLink = form.upiId
    ? `upi://pay?pa=${encodeURIComponent(form.upiId)}&pn=${encodeURIComponent(form.upiName || 'codeWithShivah')}&am=1&cu=INR&tn=Test`
    : '';

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>UPI payment settings</h2>
        <p className="small muted" style={{ marginBottom: 16 }}>
          Students pay directly to this UPI ID. The QR is generated automatically per course with the amount pre-filled.
        </p>

        <div className="field"><label className="label">UPI ID *</label>
          <input className="input" value={form.upiId} onChange={e => setForm(f => ({ ...f, upiId: e.target.value }))} placeholder="yourname@okaxis" /></div>
        <div className="field"><label className="label">Display name (shown in UPI apps)</label>
          <input className="input" value={form.upiName} onChange={e => setForm(f => ({ ...f, upiName: e.target.value }))} placeholder="codeWithShivah" /></div>
        <div className="field"><label className="label">Note shown on payment page</label>
          <textarea className="textarea" value={form.paymentNote} onChange={e => setForm(f => ({ ...f, paymentNote: e.target.value }))} /></div>

        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
      </div>

      {testLink && (
        <div className="card" style={{ marginTop: 16, textAlign: 'center' }}>
          <p className="small muted" style={{ marginBottom: 12 }}>Test QR (₹1) — scan with your own UPI app to verify the ID is correct before going live</p>
          <div className="qr-box"><QRCodeSVG value={testLink} size={150} level="M" /></div>
        </div>
      )}
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
