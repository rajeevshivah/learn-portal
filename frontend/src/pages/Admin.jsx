import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import PaymentsTab from './admin/PaymentsTab';
import CoursesTab  from './admin/CoursesTab';
import EpisodesTab from './admin/EpisodesTab';
import StudentsTab from './admin/StudentsTab';
import SettingsTab from './admin/SettingsTab';
import DoubtsTab   from './admin/DoubtsTab';
import EventsTab   from './admin/EventsTab';
import PollsTab    from './admin/PollsTab';

const API = import.meta.env.VITE_API_URL;

const TABS = [
  { id: 'payments', label: 'Payments' },
  { id: 'courses',  label: 'Courses' },
  { id: 'episodes', label: 'Episodes' },
  { id: 'events',   label: 'Live & Workshops' },
  { id: 'polls',    label: 'Polls & Ideas' },
  { id: 'doubts',   label: 'Doubts' },
  { id: 'students', label: 'Students' },
  { id: 'settings', label: 'Settings' },
];

export default function Admin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('payments');
  const [pendingCount, setPendingCount] = useState(0);
  const [doubtCount, setDoubtCount] = useState(0);
  const [eventPendingCount, setEventPendingCount] = useState(0);

  const refreshPending = () => {
    axios.get(`${API}/payments/pending`)
      .then(({ data }) => setPendingCount(data.length))
      .catch(() => {});
  };
  const refreshDoubts = () => {
    axios.get(`${API}/questions/unanswered`)
      .then(({ data }) => setDoubtCount(data.length))
      .catch(() => {});
  };

  const refreshEventPending = () => {
    axios.get(`${API}/events/admin/pending`)
      .then(({ data }) => setEventPendingCount(data.length))
      .catch(() => {});
  };

  useEffect(() => { refreshPending(); refreshDoubts(); refreshEventPending(); }, []);

  return (
    <div className="page">
      <div className="container section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>Admin panel</h1>
          <button className="btn" onClick={() => navigate('/admin/roadmaps')}
            style={{ background: '#4A9EFF', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            🗺 Roadmaps &amp; Promotions →
          </button>
        </div>

        <div className="tabs">
          {TABS.map(t => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'payments' && pendingCount > 0 && <span className="tab-count">{pendingCount}</span>}
              {t.id === 'doubts' && doubtCount > 0 && <span className="tab-count">{doubtCount}</span>}
              {t.id === 'events' && eventPendingCount > 0 && <span className="tab-count">{eventPendingCount}</span>}
            </button>
          ))}
        </div>

        {tab === 'payments' && <PaymentsTab onChange={refreshPending} />}
        {tab === 'courses'  && <CoursesTab />}
        {tab === 'episodes' && <EpisodesTab />}
        {tab === 'events'   && <EventsTab onChange={refreshEventPending} />}
        {tab === 'polls'    && <PollsTab />}
        {tab === 'doubts'   && <DoubtsTab onChange={refreshDoubts} />}
        {tab === 'students' && <StudentsTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}
