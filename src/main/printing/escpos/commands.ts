// Low-level ESC/POS byte-sequence builder. Pure buffer construction — no I/O,
// no knowledge of Windows/USB/spooler. Anything that talks to a real printer
// lives in the transport layer instead, so this half can be unit-tested and
// reused unchanged if the transport is ever swapped out.

const ESC = 0x1b
const GS = 0x1d

export type Align = 'left' | 'center' | 'right'

function sanitizeAscii(s: string): string {
  // ESC/POS printers only reliably render the printer's active single-byte
  // code page. Keep this predictable by flattening anything outside ASCII
  // rather than risking mis-decoded multi-byte garbage on the receipt.
  return s.replace(/[^\x00-\x7e]/g, (ch) => {
    if (ch === '—' || ch === '–') return '-'
    if (ch === '‘' || ch === '’') return "'"
    if (ch === '“' || ch === '”') return '"'
    return '?'
  })
}

export class EscPosBuilder {
  private chunks: Buffer[] = []

  init(): this {
    this.chunks.push(Buffer.from([ESC, 0x40]))
    return this
  }

  align(align: Align): this {
    const n = align === 'center' ? 1 : align === 'right' ? 2 : 0
    this.chunks.push(Buffer.from([ESC, 0x61, n]))
    return this
  }

  bold(on: boolean): this {
    this.chunks.push(Buffer.from([ESC, 0x45, on ? 1 : 0]))
    return this
  }

  doubleSize(on: boolean): this {
    this.chunks.push(Buffer.from([GS, 0x21, on ? 0x11 : 0x00]))
    return this
  }

  underline(on: boolean): this {
    this.chunks.push(Buffer.from([ESC, 0x2d, on ? 1 : 0]))
    return this
  }

  // Font A (standard) vs Font B (condensed/smaller) — used to keep the
  // production token as short and compact as practically possible.
  font(mode: 'A' | 'B'): this {
    this.chunks.push(Buffer.from([ESC, 0x4d, mode === 'B' ? 1 : 0]))
    return this
  }

  text(s: string): this {
    this.chunks.push(Buffer.from(sanitizeAscii(s), 'ascii'))
    return this
  }

  line(s = ''): this {
    return this.text(s).newline()
  }

  newline(): this {
    this.chunks.push(Buffer.from([0x0a]))
    return this
  }

  feed(lines: number): this {
    this.chunks.push(Buffer.from([ESC, 0x64, lines]))
    return this
  }

  divider(width: number, char = '-'): this {
    return this.line(char.repeat(width))
  }

  // Two columns on one line: left-aligned label, right-aligned value, padded to width.
  twoColumns(left: string, right: string, width: number): this {
    const space = Math.max(1, width - left.length - right.length)
    return this.line(left + ' '.repeat(space) + right)
  }

  cut(partial = true): this {
    this.chunks.push(Buffer.from([GS, 0x56, partial ? 1 : 0]))
    return this
  }

  // Escape hatch for pre-built byte sequences this builder has no primitive
  // for — e.g. a GS v 0 raster image command assembled elsewhere.
  raw(bytes: Buffer): this {
    this.chunks.push(bytes)
    return this
  }

  build(): Buffer {
    return Buffer.concat(this.chunks)
  }
}

// Characters-per-line for the printer's Font A at common thermal widths.
export function charsPerLine(widthMm: number): number {
  return widthMm >= 80 ? 48 : 32
}

// Raster print width in dots (must be a multiple of 8) for common thermal
// widths — conservative values that stay safely inside the printable area.
export function rasterWidthPx(widthMm: number): number {
  return widthMm >= 80 ? 512 : 384
}
