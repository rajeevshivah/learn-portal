import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ThreadView } from '../components/Discussion';

export default function Thread() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="page container section dq-page">
      <button type="button" className="dq-back small muted" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/dashboard'))}>← Back</button>
      <ThreadView id={id} isAdmin={user?.role === 'admin'}
        onDeleted={(t) => navigate(t.course?.slug ? `/courses/${t.course.slug}/discuss` : '/dashboard', { replace: true })} />
    </div>
  );
}
