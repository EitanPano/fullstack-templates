// First, so zod is configured (jitless, our messages) before any schema is built.
import '@/shared/lib/zod-messages'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'

import { createRoutes } from '@/app/routes'
import { Toaster } from '@/shared/ui/sonner'
import { ThemeProvider, toTheme } from '@/shared/ui/theme-provider'
import { TooltipProvider } from '@/shared/ui/tooltip'

import './app/globals.css'

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root element')

// One query client for the page. Retries are off: a failed read shows its error state with a retry
// button, and a failed mutation reports once. A read stays fresh for 30 s, so moving between
// routes does not repeat a call.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
})

// Builds the browser router from the route table and mounts it inside the providers; nothing
// else. The table is built by a function so tests can render it in a memory router.
const router = createBrowserRouter(createRoutes(queryClient))

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme={toTheme('__THEME_DEFAULT__')}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
