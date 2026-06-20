import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { installAntiDebug } from './lib/antidebug';
import './styles.css';

if (import.meta.env.PROD) {
  installAntiDebug();
} else {
  installAntiDebug({ lockScreen: false, silenceConsole: false });
}

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
