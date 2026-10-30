# Android permission audit — MarketPlat Mobile

**Reviewed:** 2026-10-29 (static source review; final manifest must be checked after Expo prebuild in CI).

| Android permission | Decision | Evidence / reason |
|---|---|---|
| `INTERNET` | Keep | API traffic is sent through `src/api/client.ts`; public and authenticated requests need network access. |
| `RECORD_AUDIO` | Keep | `app/messages/[id].tsx` requests the Expo Audio recording permission and records voice messages. |
| `MODIFY_AUDIO_SETTINGS` | Keep | Required by the `expo-audio` playback/recording integration. Re-confirm against the generated manifest when Expo/Android dependencies change. |
| `FOREGROUND_SERVICE` | Keep | The Expo Audio controls service is declared in `AndroidManifest.xml`. |
| `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Keep | The declared `expo.modules.audio.service.AudioControlsService` uses `foregroundServiceType="mediaPlayback"`. |
| `VIBRATE` | Block | No direct vibration/haptics API is used by the mobile app. Added `android.blockedPermissions` to `app.json` so generated builds remove this permission unless a reviewed dependency requires it. |
| Camera permission | Do not request/configure | The app uses `ImagePicker.launchImageLibraryAsync`; no `launchCameraAsync`, `CameraView` or camera-permission request was found. Removed the unused camera permission rationale from the image-picker plugin config. |
| Broad media/storage permissions | Do not add | Image selection uses the system image picker; app code persists selected images into its own app document directory. No broad external-storage permission is justified by the reviewed code. |

## Build acceptance check

After `expo prebuild --platform android`, inspect the merged release manifest (not only this checked-in generated manifest) and confirm:

- [ ] `VIBRATE` and `CAMERA` are absent unless a newly reviewed feature requires them.
- [ ] `INTERNET`, audio permissions and the audio service match the built app's real usage.
- [ ] No broad storage/media permission was introduced by a dependency or config plugin.
- [ ] Any permission change is reviewed in this table in the same PR.

This file is a source-based audit, not proof of the final merged manifest; the native build is a required final check.
