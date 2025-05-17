import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Tailwind CSSのスタイルを読み込む！
import App from './App';
import './UI.css'; // UI.css をここで直接インポートしてみる

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}