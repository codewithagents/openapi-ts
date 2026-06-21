import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { configureClient } from '../../generated-auth/client-config.js'
import { App } from './App.js'
import { getToken } from './token.js'

// Every request carries the current bearer token (empty until login).
configureClient({ baseUrl: '/api', token: getToken })

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
