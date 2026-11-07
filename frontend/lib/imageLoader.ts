/**
 * Global next/image loader.
 *
 * Cloudinary URLs are transformed at the CDN, so sending them through
 * /_next/image would add a redundant Worker request. Append a bounded width
 * transformation after existing Cloudinary transformations and before the
 * asset path. Non-Cloudinary images retain Next's default optimizer route.
 */
const CLOUDINARY_HOST = 'res.cloudinary.com';
const CLOUDINARY_TRANSFORM_COMPONENT = /^(?:a|ac|af|ar|b|bo|br|c|cs|d|dn|dpr|du|e|eo|f|fl|g|h|if|ki|l|o|pg|q|r|s|so|sp|t|u|vc|w|x|y|z)_[^/]+$/i;

function isTransformationSegment(segment: string): boolean {
  const components = segment.split(',');
  return components.length > 0 && components.every((component) => CLOUDINARY_TRANSFORM_COMPONENT.test(component));
}

function addCloudinaryWidth(src: string, width: number): string | null {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || url.hostname !== CLOUDINARY_HOST) return null;
  if (/\.svg$/i.test(url.pathname)) return src;

  const uploadMarker = '/image/upload/';
  const uploadIndex = url.pathname.indexOf(uploadMarker);
  if (uploadIndex < 0) return null;

  const prefix = url.pathname.slice(0, uploadIndex + uploadMarker.length);
  const remainder = url.pathname.slice(uploadIndex + uploadMarker.length);
  const segments = remainder.split('/');
  if (!segments[0]) return null;

  // Versioned URLs have an unambiguous v<digits> boundary. In unversioned URLs,
  // identify leading transformation segments and treat the rest as the public ID.
  const versionIndex = segments.findIndex((segment) => /^v\d+$/.test(segment));
  const firstAssetIndex = segments.findIndex((segment) => !isTransformationSegment(segment));
  const transformCount = versionIndex >= 0
    ? versionIndex
    : firstAssetIndex < 0 ? segments.length : firstAssetIndex;

  const existingTransforms = segments.slice(0, transformCount);
  const assetPath = segments.slice(transformCount);
  if (!assetPath.length || !assetPath[0]) return null;

  const widthValue = Number.isFinite(width) ? Math.max(1, Math.round(width)) : 640;
  const extra = ['c_limit', `w_${widthValue}`];
  if (!existingTransforms.some((segment) => segment.split(',').some((part) => /^f_[^,]+$/i.test(part)))) {
    extra.push('f_auto');
  }
  if (!existingTransforms.some((segment) => segment.split(',').some((part) => /^q_[^,]+$/i.test(part)))) {
    extra.push('q_auto');
  }

  url.pathname = `${prefix}${[...existingTransforms, extra.join(','), ...assetPath].join('/')}`;
  return url.toString();
}

export default function imageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  if (src.startsWith('https://res.cloudinary.com/')) {
    const cloudinaryUrl = addCloudinaryWidth(src, width);
    if (cloudinaryUrl) return cloudinaryUrl;
  }

  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality || 75}`;
}
