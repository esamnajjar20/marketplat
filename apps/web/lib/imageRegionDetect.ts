export interface ContentRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Detects the bounding box of pixels that differ materially from the sampled background. */
export function detectContentRegion(canvas: HTMLCanvasElement): ContentRegion | null {
  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) return null;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  try {
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    const bgR = data[0] ?? 255;
    const bgG = data[1] ?? 255;
    const bgB = data[2] ?? 255;
    const threshold = 24;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const alpha = data[i + 3] ?? 0;
        if (alpha < 16) continue;
        const distance = Math.abs((data[i] ?? 0) - bgR) + Math.abs((data[i + 1] ?? 0) - bgG) + Math.abs((data[i + 2] ?? 0) - bgB);
        if (distance < threshold) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  } catch {
    return null;
  }
}
