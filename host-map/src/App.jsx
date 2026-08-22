import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HostMap from './components/HostMap';
import MobileController from './components/MobileController';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HostMap />} />
        <Route path="/mobile" element={<MobileController />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;