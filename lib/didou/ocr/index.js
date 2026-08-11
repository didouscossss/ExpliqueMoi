/**
 * OCR local Didou — façade.
 */

export {
  preparePagesWithLocalOcr,
  MAX_OCR_PAGES,
  MIN_PAGE_TEXT_CHARS
} from "./preparePages.js";
export {
  ocrImageLocally,
  MIN_OCR_TEXT_CHARS,
  MIN_OCR_CONFIDENCE
} from "./ocrImageLocally.js";
export { getLocalOcrPaths, getOcrAssetsRoot } from "./ocrPaths.js";
