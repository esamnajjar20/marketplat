/**
 * NEW — native camera/gallery access via @capacitor/camera.
 *
 * The web build already has a working camera path (`<input type="file">`
 * in ImageUpload.tsx, which Android/iOS browsers already route to the
 * native camera/gallery chooser). This file does NOT replace it — it adds the option of the native picker sheet
 * (Camera.getPhoto), which gives cleaner permission prompts and lets a
 * future caller skip the browser file-input UI entirely inside the
 * Capacitor shell. Not yet wired into ImageUpload.tsx — see
 * README-CAPACITOR.md's "Wiring native camera into ImageUpload" section
 * for how to opt a caller in without touching that component's
 * existing (tested) web drag-and-drop path.
 */
import { isNativePlatform } from './platform';

export interface NativePhotoResult {
  /** Same shape ImageUpload.tsx already works with elsewhere (files.push). */
  file: File;
  webPath: string;
}

/**
 * Opens the native "Camera / Photo Library" action sheet. Returns null
 * on web (caller should fall back to the existing `<input type="file">`
 * flow) or if the user cancels.
 */
export async function takeOrPickNativePhoto(): Promise<NativePhotoResult | null> {
  if (!(await isNativePlatform())) return null;

  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');

  const permission = await Camera.checkPermissions();
  if (permission.camera !== 'granted' || permission.photos !== 'granted') {
    const requested = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
    if (requested.camera !== 'granted' && requested.photos !== 'granted') {
      return null; // user denied — caller shows its own message
    }
  }

  const photo = await Camera.getPhoto({
    quality: 85,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Prompt, // lets the user choose camera vs gallery
  });

  if (!photo.webPath) return null;

  const response = await fetch(photo.webPath);
  const blob = await response.blob();
  const extension = photo.format || 'jpg';
  const file = new File([blob], `photo-${Date.now()}.${extension}`, {
    type: blob.type || `image/${extension}`,
  });

  return { file, webPath: photo.webPath };
}
