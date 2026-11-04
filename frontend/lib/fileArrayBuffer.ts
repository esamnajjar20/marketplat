/**
 * Read a user-selected file into memory with a browser compatibility fallback.
 * Some Android Chrome/WebView file handles reject Blob.arrayBuffer() after
 * the picker/app lifecycle changes, while FileReader can still read the same
 * Blob. Keep the fallback local to file persistence; never retain a File
 * handle and assume it will remain readable later.
 */
export async function readFileArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  try {
    return await file.arrayBuffer();
  } catch (arrayBufferError) {
    if (typeof FileReader === 'undefined') throw arrayBufferError;

    try {
      return await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result instanceof ArrayBuffer) resolve(reader.result);
          else reject(new TypeError('FileReader returned a non-ArrayBuffer result'));
        };
        reader.onerror = () => reject(reader.error ?? new Error('FileReader could not read the selected file'));
        reader.onabort = () => reject(new DOMException('File reading was aborted', 'AbortError'));
        reader.readAsArrayBuffer(file);
      });
    } catch (fileReaderError) {
      const error = new Error('تعذّرت قراءة الملف المحدد عبر ArrayBuffer وFileReader');
      Object.assign(error, { cause: fileReaderError, arrayBufferError });
      throw error;
    }
  }
}
