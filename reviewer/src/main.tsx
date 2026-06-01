import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

const embedded = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1';

/** Must run before first paint so embedded layout does not use top-level viewport units. */
if (embedded) {
  document.documentElement.classList.add('mjr-embed');
  document.body.classList.add('mjr-embed');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (embedded) {
  const postHeight = () => {
    const root = document.getElementById('root');
    const height = Math.ceil(
      Math.max(
        root?.scrollHeight ?? 0,
        root?.getBoundingClientRect().height ?? 0,
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      ),
    );

    window.parent?.postMessage({ type: 'mjr:resize', height }, window.location.origin);
  };

  const schedulePostHeight = () => window.requestAnimationFrame(postHeight);
  const observer = new ResizeObserver(schedulePostHeight);

  window.addEventListener('load', schedulePostHeight);
  window.addEventListener('resize', schedulePostHeight);
  observer.observe(document.documentElement);
  observer.observe(document.body);

  const root = document.getElementById('root');
  if (root) observer.observe(root);

  schedulePostHeight();
}
