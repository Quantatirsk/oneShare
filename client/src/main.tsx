import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.tsx'
import { Homepage } from './pages/Homepage.tsx'
import { AppGalleryPage } from './pages/AppGalleryPage.tsx'
import { CreatePage } from './pages/CreatePage.tsx'
import { ShareRouter } from './pages/ShareRouter.tsx'
import { AppPreviewRouter } from './pages/AppPreviewRouter.tsx'
import { TsxDebugPage } from './pages/TsxDebugPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { Toaster } from '@/components/ui/toaster'
import { fetchAiModelCatalog } from '@/lib/aiClient'
import './globals.css'

async function configureServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  if (import.meta.env.PROD) {
    await navigator.serviceWorker.register('/sw.js');
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames
    .filter((cacheName) => cacheName.startsWith('oneshare-'))
    .map((cacheName) => caches.delete(cacheName)));
}

configureServiceWorker().catch(console.error);
fetchAiModelCatalog().catch(console.error);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/files" element={<App />} />
        <Route path="/app" element={<AppGalleryPage />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/s/:shareId" element={<ShareRouter />} />
        <Route path="/app/:shareId" element={<AppPreviewRouter />} />
        <Route path="/tsx-debug" element={<TsxDebugPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  </React.StrictMode>,
)
