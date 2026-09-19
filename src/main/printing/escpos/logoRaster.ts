import path from 'path'
import fs from 'fs'
import { Jimp } from 'jimp'

const GS = 0x1d

// electron-vite bundles every main-process file into one flat out/main/index.js,
// so __dirname here is always out/main/ at runtime — same resolution pattern
// already used for the raw-print.ps1 helper script.
function resolveLogoPath(): string {
  const devPath = path.join(__dirname, '../../resources/logo.jpg')
  if (fs.existsSync(devPath)) return devPath
  const prodPath = path.join(process.resourcesPath ?? '', 'logo.jpg')
  if (fs.existsSync(prodPath)) return prodPath
  throw new Error('logo.jpg resource not found')
}

interface RasterBitmap {
  widthPx: number
  heightPx: number
  data: Buffer
}

// Converting the logo to a 1-bit bitmap is pure CPU work with a fixed input,
// so cache the result per target width instead of redoing it on every print.
const cache = new Map<number, RasterBitmap>()

async function buildBitmap(widthPx: number): Promise<RasterBitmap> {
  const cached = cache.get(widthPx)
  if (cached) return cached

  const image = await Jimp.read(resolveLogoPath())
  image.resize({ w: widthPx })
  image.greyscale()

  const heightPx = image.bitmap.height
  const byteWidth = Math.ceil(widthPx / 8)
  const data = Buffer.alloc(byteWidth * heightPx, 0)

  image.scan(0, 0, widthPx, heightPx, (x, y, idx) => {
    const gray = image.bitmap.data[idx]
    // Darker-than-near-white counts as ink — a plain threshold is enough for
    // a logo made of solid shapes/text rather than a photographic gradient.
    if (gray < 200) {
      const byteIndex = y * byteWidth + (x >> 3)
      data[byteIndex] |= 0x80 >> x % 8
    }
  })

  const bitmap: RasterBitmap = { widthPx, heightPx, data }
  cache.set(widthPx, bitmap)
  return bitmap
}

// Builds a GS v 0 raster-image command printing the shop logo at the given
// dot width. Returns null (never throws) if the logo file is missing or
// unreadable — the bill must still print correctly without it.
export async function buildLogoCommand(widthPx: number): Promise<Buffer | null> {
  try {
    const { widthPx: w, heightPx, data } = await buildBitmap(widthPx)
    const byteWidth = Math.ceil(w / 8)
    const header = Buffer.from([
      GS,
      0x76,
      0x30,
      0x00,
      byteWidth & 0xff,
      (byteWidth >> 8) & 0xff,
      heightPx & 0xff,
      (heightPx >> 8) & 0xff
    ])
    return Buffer.concat([header, data])
  } catch {
    return null
  }
}
