import React from 'react';
import DailyTranslatorFrontend from './components/DailyTranslatorFrontend.jsx';

export default function App(){
  const backend = import.meta.env.VITE_BACKEND_BASE || 'https://api.example.com';
  return <DailyTranslatorFrontend backendBase={backend} defaultRoom="my-test-room" />;
}
