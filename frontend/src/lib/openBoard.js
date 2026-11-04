import axios from 'axios';

const API = import.meta.env.VITE_API_URL;

// Open (or create on first use) the whiteboard for one class.
export async function openClassBoard(navigate, eventId, sessionId) {
  const { data } = await axios.post(`${API}/boards/for-class`, { eventId, sessionId });
  navigate(`/admin/board/${data._id}`);
}
