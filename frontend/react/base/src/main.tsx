import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { Toaster } from 'sonner'

import { routes } from '@/app/routes'

import './app/globals.css'

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root element')

// Builds the browser router from the route table and mounts it with the toaster; nothing else.
// The table is exported without a router so tests can render it in a memory router.
const router = createBrowserRouter(routes)

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Toaster richColors />
  </StrictMode>,
)
