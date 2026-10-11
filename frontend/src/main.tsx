import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/sora'
import '@fontsource-variable/jetbrains-mono'
import './styles/index.css'
import App from './app/App'
import { SettingsProvider } from './app/settings'

const qc = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } })
createRoot(document.getElementById('root')!).render(
  <StrictMode><QueryClientProvider client={qc}><SettingsProvider><BrowserRouter><App /></BrowserRouter></SettingsProvider></QueryClientProvider></StrictMode>,
)
