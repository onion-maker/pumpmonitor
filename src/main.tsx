import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import App from './App';
import firebaseConfig from './firebase/config';
import './index.css';

// 初始化 Firebase（如果已設定 API Key）
const isFirebaseConfigured =
  firebaseConfig.apiKey !== 'YOUR_API_KEY';

if (isFirebaseConfigured) {
  initializeApp(firebaseConfig);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);