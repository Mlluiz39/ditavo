/**
 * Gera os ícones PNG do PWA a partir dos SVGs em public/icons.
 * Uso: npm run icons
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'

const iconsDir = resolve(import.meta.dirname, '..', 'public', 'icons')

const icon = readFileSync(resolve(iconsDir, 'icon.svg'))
const maskable = readFileSync(resolve(iconsDir, 'icon-maskable.svg'))

const jobs = [
  { input: icon, size: 192, name: 'icon-192.png' },
  { input: icon, size: 512, name: 'icon-512.png' },
  { input: maskable, size: 512, name: 'icon-maskable-512.png' },
  { input: icon, size: 180, name: 'apple-touch-icon.png' },
]

for (const job of jobs) {
  await sharp(job.input, { density: 300 })
    .resize(job.size, job.size)
    .png()
    .toFile(resolve(iconsDir, job.name))
  console.log(`✓ ${job.name} (${job.size}x${job.size})`)
}
