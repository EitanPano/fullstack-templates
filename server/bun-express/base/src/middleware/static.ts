import { existsSync, realpathSync, statSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import type { NextFunction, RequestHandler, Response } from 'express'
import express from 'express'

const ASSETS_CACHE = 'public, max-age=31536000, immutable'
const SHELL_CACHE = 'no-cache'

// The request path decoded once, the way send decodes it, or undefined for a bad escape. Every
// check below runs on this text, so an encoded `/%61pi` is `/api` and an encoded dot-dot is seen.
function decodeOnce(rawPath: string): string | undefined {
  try {
    return decodeURIComponent(rawPath)
  } catch {
    return undefined
  }
}

// `/api` and `/api/*` belong to the API in any letter case (Express routes are case-insensitive).
function isApi(decoded: string): boolean {
  const lower = decoded.toLowerCase()
  return lower === '/api' || lower.startsWith('/api/')
}

// A decoded path that could name something outside the served tree, or a dotfile.
function isUnsafe(decoded: string): boolean {
  if (decoded.includes('\0') || decoded.includes('\\')) return true
  return decoded
    .split('/')
    .some((part) => part === '..' || (part.length > 1 && part.startsWith('.')))
}

// send follows symlinks without checking where they lead, so a link inside the tree could
// expose a file outside it. A path that does not exist is left to the next handler.
async function escapesRoot(realRoot: string, decoded: string): Promise<boolean> {
  try {
    const real = await realpath(join(realRoot, decoded))
    const rel = relative(realRoot, real)
    return rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)
  } catch {
    return false
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

// Serves the built SPA after the API: `express.static` for files (no index, no redirect,
// dotfiles ignored, a miss falls through) then the shell for a GET or HEAD of an extension-less
// path. Anything else calls next(), so the not-found envelope answers.
export function staticFiles(dir: string): RequestHandler {
  const root = resolve(dir)
  const realRoot = existsSync(root) ? realpathSync(root) : root

  const files = express.static(root, {
    index: false,
    redirect: false,
    dotfiles: 'ignore',
    fallthrough: true,
    setHeaders: (res, path) => {
      const name = relative(root, path).split(sep).join('/')
      if (name === 'index.html') res.setHeader('Cache-Control', SHELL_CACHE)
      else if (name.startsWith('assets/')) res.setHeader('Cache-Control', ASSETS_CACHE)
    },
  })

  const shell = (decoded: string, res: Response, next: NextFunction): void => {
    // A directory such as /assets is not a route.
    if (decoded !== '/' && isDirectory(join(root, decoded))) {
      next()
      return
    }
    res.sendFile('index.html', { root, headers: { 'Cache-Control': SHELL_CACHE } }, (error) => {
      if (error !== undefined && !res.headersSent) next()
    })
  }

  return (req, res, next) => {
    const decoded = decodeOnce(req.path)
    if (
      (req.method !== 'GET' && req.method !== 'HEAD') ||
      decoded === undefined ||
      isApi(decoded) ||
      isUnsafe(decoded)
    ) {
      next()
      return
    }
    // A throw inside the chain would otherwise hang the request: it goes to the error handler.
    void escapesRoot(realRoot, decoded)
      .then((escapes) => {
        if (escapes) {
          next()
          return
        }
        files(req, res, (error?: unknown) => {
          if (error !== undefined) next(error)
          else if (extname(decoded) === '') shell(decoded, res, next)
          else next()
        })
      })
      .catch(next)
  }
}
