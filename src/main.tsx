import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {installAndroidApkNetworkBridge} from './utils/androidBridge';

installAndroidApkNetworkBridge();

createRoot(document.getElementById('root')!).render(<App />);
