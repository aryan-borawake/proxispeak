// client/src/main.jsx — Person 1
// The browser app's starting point: puts <App /> into the <div id="root"> in index.html.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
