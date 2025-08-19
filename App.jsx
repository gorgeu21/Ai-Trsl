import DailyTranslatorFrontend from './components/DailyTranslatorFrontend';

function App(){
  const backend = import.meta.env.VITE_BACKEND_BASE || 'https://api.example.com';
  return <DailyTranslatorFrontend backendBase={backend} defaultRoom="my-room" />
}
export default App;
