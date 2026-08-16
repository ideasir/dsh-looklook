#!/usr/bin/env node
/**
 * Copies the PDF worker entry (plain .mjs) into lib/ after tsc emits, since
 * tsc does not copy non-TypeScript assets.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const source = join(root, '..', 'src', 'parser', 'pdf-worker.mjs')
const target = join(root, '..', 'lib', 'parser', 'pdf-worker.mjs')
mkdirSync(dirname(target), { recursive: true })
copyFileSync(source, target)
console.log('copied pdf-worker.mjs → lib/parser/')
