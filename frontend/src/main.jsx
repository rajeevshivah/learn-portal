import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initGA } from './lib/analytics';
import { initPwa } from './lib/pwa';
import './styles/global.css';
import './styles/feedback.css';
import './styles/app.css';

initGA();
initPwa();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
