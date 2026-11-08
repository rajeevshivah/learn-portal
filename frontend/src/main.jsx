import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initGA } from './lib/analytics';
import { initPwa } from './lib/pwa';
// Typefaces, self-hosted (no Google Fonts call on a slow network)
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource/mukta/400.css';
import '@fontsource/mukta/500.css';
import '@fontsource/mukta/600.css';
import '@fontsource/mukta/700.css';
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
