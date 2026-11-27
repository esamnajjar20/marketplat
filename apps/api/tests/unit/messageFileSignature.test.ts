import { isAllowedChatAudioContent, isAllowedChatFileContent } from '../../src/shared/media/messageFileSignature';

describe('chat upload content signatures', () => {
  it('accepts supported audio signatures only for their declared MIME type', () => {
    const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]);
    const ogg = Buffer.from('OggS' + '\x00'.repeat(8), 'binary');
    const mp4 = Buffer.from('0000ftypM4A ', 'ascii');

    expect(isAllowedChatAudioContent(webm, 'audio/webm')).toBe(true);
    expect(isAllowedChatAudioContent(ogg, 'audio/ogg')).toBe(true);
    expect(isAllowedChatAudioContent(mp4, 'audio/mp4')).toBe(true);
    expect(isAllowedChatAudioContent(webm, 'audio/ogg')).toBe(false);
    expect(isAllowedChatAudioContent(Buffer.from('hello'), 'audio/mpeg')).toBe(false);
  });

  it('checks document file signatures instead of trusting the multipart MIME header', () => {
    const pdf = Buffer.from('%PDF-1.7\n', 'ascii');
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
    const text = Buffer.from('a plain UTF-8 text file', 'utf8');

    expect(isAllowedChatFileContent(pdf, 'application/pdf')).toBe(true);
    expect(isAllowedChatFileContent(zip, 'application/zip')).toBe(true);
    expect(isAllowedChatFileContent(text, 'text/plain')).toBe(true);
    // Short UTF-8 text and minimal valid JSON are still legitimate files.
    expect(isAllowedChatFileContent(Buffer.from('ok', 'utf8'), 'text/plain')).toBe(true);
    expect(isAllowedChatFileContent(Buffer.from('{}', 'utf8'), 'application/json')).toBe(true);
    expect(isAllowedChatFileContent(text, 'application/pdf')).toBe(false);
    expect(isAllowedChatFileContent(Buffer.from([0xff, 0xfe, 0x00, 0x00]), 'text/plain')).toBe(false);
  });

  it('parses JSON uploads and rejects malformed JSON', () => {
    expect(isAllowedChatFileContent(Buffer.from('{"ok":true}', 'utf8'), 'application/json')).toBe(true);
    expect(isAllowedChatFileContent(Buffer.from('{not-json}', 'utf8'), 'application/json')).toBe(false);
  });
});
