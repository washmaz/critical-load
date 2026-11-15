import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
// NASA Horizon Design System typefaces (nasa.gov brand guidelines): Inter for all text, DM Mono for numbers only.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);
