/**
 * Pure TypeScript ISO/IEC 15417 Code-128 Vector SVG Barcode Generator
 * 
 * Generates razor-sharp, zero-dependency SVG barcodes for retail thermal label printers.
 * Supports standard thermal label roll sizes (50x25mm, 40x30mm, etc.) and auto-fits barcode geometry.
 */

// Code 128 patterns for symbols 0 through 106
// Each digit represents the width of a bar or space in modules.
// Alternates Bar, Space, Bar, Space, Bar, Space (and terminal bar for Stop code 106).
const CODE128_PATTERNS: string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", // 20-29
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", // 30-39
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", // 40-49
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", // 50-59
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", // 60-69
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", // 70-79
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", // 80-89
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", // 90-99
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112"                                 // 100-106
];

const START_CODE_B = 104;
const STOP_CODE = 106;

export interface BarcodeRenderOptions {
  height?: number; // Barcode height in px/points
  barWidth?: number; // Width of single module in px/points
  includeText?: boolean; // Show human readable text below bars
  quietZone?: number; // Margin modules on each side
  fontSize?: number;
  textColor?: string;
  barColor?: string;
}

/**
 * Generate a complete SVG markup string of a Code-128 barcode
 */
export function generateBarcodeSvg(
  text: string,
  options: BarcodeRenderOptions = {}
): string {
  const cleanText = (text || '').trim();
  if (!cleanText) return '';

  const {
    height = 50,
    barWidth = 2,
    includeText = true,
    quietZone = 10,
    fontSize = 12,
    textColor = '#000000',
    barColor = '#000000',
  } = options;

  // 1. Calculate symbol indices for Subset B (ASCII 32 - 126)
  const symbolIndices: number[] = [START_CODE_B];
  let checksumTotal = START_CODE_B;

  for (let i = 0; i < cleanText.length; i++) {
    const charCode = cleanText.charCodeAt(i);
    // Subset B supports ASCII 32 to 126
    let symbolIdx = charCode - 32;
    if (symbolIdx < 0 || symbolIdx > 94) {
      // Fallback to '?' (index 31) for unsupported characters
      symbolIdx = 31;
    }
    symbolIndices.push(symbolIdx);
    checksumTotal += symbolIdx * (i + 1);
  }

  const checksum = checksumTotal % 103;
  symbolIndices.push(checksum);
  symbolIndices.push(STOP_CODE);

  // 2. Build module sequence
  let totalModules = quietZone * 2;
  const patternParts: string[] = [];

  for (const idx of symbolIndices) {
    const pattern = CODE128_PATTERNS[idx];
    if (pattern) {
      patternParts.push(pattern);
      for (let c = 0; c < pattern.length; c++) {
        totalModules += parseInt(pattern[c], 10);
      }
    }
  }

  const svgWidth = totalModules * barWidth;
  const textHeight = includeText ? fontSize + 4 : 0;
  const svgHeight = height + textHeight;

  // 3. Render rects for bars
  let currentX = quietZone * barWidth;
  let rectsSvg = '';

  for (const pattern of patternParts) {
    let isBar = true;
    for (let c = 0; c < pattern.length; c++) {
      const moduleCount = parseInt(pattern[c], 10);
      const width = moduleCount * barWidth;
      if (isBar) {
        rectsSvg += `<rect x="${currentX}" y="0" width="${width}" height="${height}" fill="${barColor}" />`;
      }
      currentX += width;
      isBar = !isBar;
    }
  }

  // 4. Human-readable text label
  let textSvg = '';
  if (includeText) {
    const textY = height + fontSize;
    textSvg = `<text x="${svgWidth / 2}" y="${textY}" text-anchor="middle" font-family="monospace, monospace" font-size="${fontSize}" font-weight="600" fill="${textColor}" letter-spacing="1.5">${escapeXml(
      cleanText
    )}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" style="display:block;max-width:100%;height:auto;">
    ${rectsSvg}
    ${textSvg}
  </svg>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Standard Barcode Label Presets
 */
export interface LabelPreset {
  key: string;
  name: string;
  widthMm: number;
  heightMm: number;
  description: string;
}

export const STANDARD_LABEL_SIZES: LabelPreset[] = [
  { key: '50x25mm', name: '50mm × 25mm (2" × 1")', widthMm: 50, heightMm: 25, description: 'Most common retail standard (clothing, pharmacy, retail)' },
  { key: '50x30mm', name: '50mm × 30mm', widthMm: 50, heightMm: 30, description: 'Extra height for multi-line details' },
  { key: '40x30mm', name: '40mm × 30mm', widthMm: 40, heightMm: 30, description: 'Compact grocery & food packaging' },
  { key: '38x25mm', name: '38mm × 25mm (1.5" × 1")', widthMm: 38, heightMm: 25, description: 'Small retail & cosmetics' },
  { key: '60x40mm', name: '60mm × 40mm', widthMm: 60, heightMm: 40, description: 'Medium product boxes & cartons' },
  { key: '100x50mm', name: '100mm × 50mm (4" × 2")', widthMm: 100, heightMm: 50, description: 'Large warehouse & shipping labels' },
  { key: '30x20mm', name: '30mm × 20mm', widthMm: 30, heightMm: 20, description: 'Mini jewelry & small parts' },
  { key: 'custom', name: 'Custom Dimensions...', widthMm: 50, heightMm: 25, description: 'User-specified width and height in mm' },
];

/**
 * Parse a size string like "50x25mm" or "40x30mm" into millimeter dimensions
 */
export function parseLabelDimensions(sizeStr?: string): { widthMm: number; heightMm: number } {
  if (!sizeStr) return { widthMm: 50, heightMm: 25 };
  const cleaned = sizeStr.toLowerCase().replace('mm', '').trim();
  const parts = cleaned.split('x');
  if (parts.length === 2) {
    const w = parseFloat(parts[0]);
    const h = parseFloat(parts[1]);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      return { widthMm: w, heightMm: h };
    }
  }
  return { widthMm: 50, heightMm: 25 };
}
