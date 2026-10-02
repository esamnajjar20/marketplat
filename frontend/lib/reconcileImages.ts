/**
 * Edit-mode image reconciliation shared by AdForm, ProductForm and
 * ServiceListingForm (previously three verbatim copies).
 *
 * Order of operations — kept exactly as the three forms had it:
 *  1. EPIC 1.5: if removing the dropped images would leave the entity
 *     with zero images even momentarily AND the user staged replacement
 *     uploads, add first, then remove — so the backend's min-1-image
 *     guard never sees a would-be-empty entity. Only done in this
 *     specific case: reversing the order in general risks briefly
 *     exceeding addImages' 10-image cap instead.
 *  2. Otherwise remove first, then add.
 *  3. Gap #11: reorder only the SURVIVING existing images. New uploads
 *     always land appended after existing ones (backend addImages
 *     ordering), so this stays a valid permutation without needing the
 *     just-uploaded files' final URLs.
 *
 * Errors propagate to the caller untouched; each form's catch block
 * owns the network-vs-validation handling (T792).
 */
export interface ReconcileImagesInput {
  /** Image URLs as loaded when the form opened. */
  originalImages: string[];
  /** Image URLs the user wants to keep, in their chosen order. */
  existingImages: string[];
  /** Newly staged files to upload. */
  newFiles: File[];
}

export interface ReconcileImagesOps {
  addImages: (files: File[]) => Promise<unknown>;
  removeImage: (imageUrl: string) => Promise<unknown>;
  reorderImages: (images: string[]) => Promise<unknown>;
  /** Called right before each upload so the form can show progress at 0. */
  onUploadStart?: () => void;
}

export async function reconcileImages(
  { originalImages, existingImages, newFiles }: ReconcileImagesInput,
  { addImages, removeImage, reorderImages, onUploadStart }: ReconcileImagesOps,
): Promise<void> {
  const removedUrls = originalImages.filter((url) => !existingImages.includes(url));
  const wouldGoToZero = removedUrls.length > 0 && existingImages.length === 0;

  const upload = async () => {
    onUploadStart?.();
    await addImages(newFiles);
  };

  if (wouldGoToZero && newFiles.length > 0) {
    await upload();
    for (const imageUrl of removedUrls) await removeImage(imageUrl);
  } else {
    for (const imageUrl of removedUrls) await removeImage(imageUrl);
    if (newFiles.length > 0) await upload();
  }

  const survivingExisting = originalImages.filter((url) => existingImages.includes(url));
  const reorderChanged = existingImages.some((url, i) => url !== survivingExisting[i]);
  if (reorderChanged && existingImages.length > 1) {
    await reorderImages(existingImages);
  }
}
