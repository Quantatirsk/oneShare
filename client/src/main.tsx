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
import { preloadConfig } from '@/lib/llmConfig'
import './globals.css'

// 预加载 LLM 配置
preloadConfig().catch(console.error);

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