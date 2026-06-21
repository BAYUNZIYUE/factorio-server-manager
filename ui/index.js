import regeneratorRuntime from "regenerator-runtime"
import './i18n';
import Bus from "./notifications"
import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App/App.jsx';

window.flash = (message, color="gray-light") => Bus.emit('flash', ({message, color}));

const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(
  <Suspense fallback={<div>Loading...</div>}>
    <App/>
  </Suspense>
);
