/**
 * Global next/image loader.
 *
 * Cloudinary already resizes and re-encodes on its own CDN, so routing those images
 * through /_next/image only added a Worker invocation per image (41 of 463 frontend
 * requests in a 30-minute tail log) for a second, redundant transform. Cloudinary
 * sources are now requested straight from the CDN with a width cap chained last
 * (c_limit never upscales); everything else keeps the stock /_next/image path.
 * Widths still come from images.deviceSizes/imageSizes, so variants stay bounded.
 */
const CLOUDINARY_HOST = 'https://res.cloudinary.com/';

export default function imageLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  if (src.startsWith(CLOUDINARY_HOST) && !/\.svg(?:$|[?#])/i.test(src)) {
    // /upload/<existing transformations>/v123/<public id>  -> append ours after the existing ones.
    const m = src.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)((?:[^/]+\/)*?)(v\d+\/.+)$/);
    if (m) {
      const [, head, existing, tail] = m;
      const extra = [`c_limit`, `w_${width}`];
      if (!/(^|[,/])f_/.test(existing)) extra.push('f_auto');
      if (!/(^|[,/])q_/.test(existing)) extra.push('q_auto');
      return `${head}${existing}${extra.join(',')}/${tail}`;
    }
  }
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality || 75}`;
}
