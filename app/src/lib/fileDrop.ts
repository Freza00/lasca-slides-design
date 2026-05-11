const TEXT_FILE_EXT_RE = /\.(md|markdown|txt)$/i;
const WORD_DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function hasFileDragData(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types ?? []).includes('Files');
}

export function isTextDocumentFile(file: File): boolean {
  return file.type.startsWith('text/')
    || file.type === 'application/markdown'
    || TEXT_FILE_EXT_RE.test(file.name);
}

export function isWordDocumentFile(file: File): boolean {
  return file.type === WORD_DOCX_MIME
    || file.name.toLowerCase().endsWith('.docx');
}

export async function readTextDocumentFile(file: File): Promise<string> {
  if (!isTextDocumentFile(file)) {
    throw new Error('Unsupported file type');
  }
  return file.text();
}
