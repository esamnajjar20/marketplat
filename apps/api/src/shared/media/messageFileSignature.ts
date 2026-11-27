/** Validate chat media bytes against the MIME type supplied by the multipart client. */
export function isAllowedChatAudioContent(buffer: Buffer, claimedMime: string): boolean {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  switch (claimedMime.toLowerCase()) {
    case 'audio/webm':
      return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    case 'audio/ogg':
      return buffer.subarray(0, 4).toString('ascii') === 'OggS';
    case 'audio/mp4':
      return buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    case 'audio/mpeg':
      return buffer.subarray(0, 3).toString('ascii') === 'ID3' ||
        (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    case 'audio/wav':
      return buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WAVE';
    default:
      return false;
  }
}

function isUtf8Text(buffer: Buffer): boolean {
  if (!buffer.length || buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function startsWith(buffer: Buffer, signature: number[]): boolean {
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(Buffer.from(signature));
}

/**
 * Binary checks for the document types accepted by chat uploads. Office OpenXML
 * files are ZIP containers; legacy Office files use the OLE Compound File signature.
 * Text formats are validated as UTF-8, with JSON additionally parsed.
 */
export function isAllowedChatFileContent(buffer: Buffer, claimedMime: string): boolean {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
  const mime = claimedMime.toLowerCase().split(';', 1)[0].trim();
  const isZip = startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(buffer, [0x50, 0x4b, 0x07, 0x08]);
  const isOle = startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  switch (mime) {
    case 'application/pdf':
      return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    case 'application/zip':
    case 'application/x-zip-compressed':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return isZip;
    case 'application/x-7z-compressed':
      return startsWith(buffer, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
    case 'application/vnd.rar':
    case 'application/x-rar-compressed':
      return startsWith(buffer, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]);
    case 'application/msword':
    case 'application/vnd.ms-excel':
    case 'application/vnd.ms-powerpoint':
      return isOle;
    case 'text/plain':
    case 'text/csv':
      return isUtf8Text(buffer);
    case 'application/json':
      if (!isUtf8Text(buffer)) return false;
      try { JSON.parse(buffer.toString('utf8')); return true; } catch { return false; }
    default:
      return false;
  }
}
