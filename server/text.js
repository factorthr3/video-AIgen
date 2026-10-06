// House style for generated text: plain hyphens, never em or en dashes
// (ranges like 1-2 stay tight).
export const plainDashes = (text) => String(text ?? '')
  .replace(/(\d)\s*[–—]\s*(\d)/g, '$1-$2')
  .replace(/\s*[–—]\s*/g, ' - ');
