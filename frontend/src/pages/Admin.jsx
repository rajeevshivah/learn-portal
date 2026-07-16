import { useEffect, useState } from 'react';
import axios from 'axios';
import PaymentsTab from './admin/PaymentsTab';
import CoursesTab  from './admin/CoursesTab';
import EpisodesTab from './admin/EpisodesTab';
import StudentsTab from './admin/StudentsTab';
import SettingsTab from './admin/SettingsTab';
import DoubtsTab   from './admin/DoubtsTab';

const API = import.meta.env.VITE_API_URL;

const TABS = [
  { id: 'payments', label: 'Payments' },
  { id: 'courses',  label: 'Courses' },
  { id: 'episodes', label: 'Episodes' },
  { id: 'doubts',   label: 'Doubts' },
  { id: 'students', label: 'Students' },
  { id: 'settings', label: 'Settings' },
];

export default function Admin() {
  const [tab, setTab] = useState('payments');
  const [pendingCount, setPendingCount] = useState(0);
  const [doubtCount, setDoubtCount] = useState(0);

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

  useEffect(() => { refreshPending(); refreshDoubts(); }, []);

  return (
    <div className="page">
      <div className="container section">
        <h1 style={{ fontSize: 24, marginBottom: 18 }}>Admin panel</h1>

        <div className="tabs">
          {TABS.map(t => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'payments' && pendingCount > 0 && <span className="tab-count">{pendingCount}</span>}
              {t.id === 'doubts' && doubtCount > 0 && <span className="tab-count">{doubtCount}</span>}
            </button>
          ))}
        </div>

        {tab === 'payments' && <PaymentsTab onChange={refreshPending} />}
        {tab === 'courses'  && <CoursesTab />}
        {tab === 'episodes' && <EpisodesTab />}
        {tab === 'doubts'   && <DoubtsTab onChange={refreshDoubts} />}
        {tab === 'students' && <StudentsTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}
