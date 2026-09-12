import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

/**
 * HashRouter rather than BrowserRouter: this ships as static files (GitHub
 * Pages, a Drive folder, anywhere), and a hash route never 404s on refresh
 * without server rewrites.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
