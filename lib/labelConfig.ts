/**
 * Label printing configuration for thermal printers
 * Optimized for CLP-403 203 DPI thermal sticker printer
 */

export interface LabelConfig {
  // Physical dimensions in millimeters
  width: number;      // Label width in mm
  height: number;     // Label height in mm
  
  // Printer resolution
  dpi: number;        // Dots per inch (203 for CLP-403)
  
  // Barcode settings
  barcodeHeight: number;  // Barcode height in mm
  barcodeWidth: number;   // Barcode bar width (narrow bar) in mm
  quietZone: number;      // Quiet zone (margin) in mm
  
  // Font sizes in points
  companyNameFontSize: number;
  barcodeValueFontSize: number;
  productNameFontSize: number;
  conditionFontSize: number;
  
  // Layout settings
  padding: number;            // General padding in mm
}

export const DEFAULT_LABEL_CONFIG: LabelConfig = {
  // Standard 55mm x 25mm thermal label
  width: 55,
  height: 25,
  
  // CLP-403 printer resolution
  dpi: 203,
  
  // Barcode dimensions optimized for 203 DPI (reduced height for space)
  barcodeHeight: 9,
  barcodeWidth: 0.35,  // Narrow bar width for 203 DPI
  quietZone: 2,         // Adequate quiet zone for reliable scanning
  
  // Font sizes optimized for thermal printing (minimal reductions for space)
  companyNameFontSize: 8,
  barcodeValueFontSize: 12,
  productNameFontSize: 9,
  conditionFontSize: 8,
  
  // Layout (reduced padding for space)
  padding: 1,
};

/**
 * Convert millimeters to pixels at a given DPI
 */
export function mmToPixels(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

/**
 * Convert points to pixels at a given DPI
 */
export function pointsToPixels(points: number, dpi: number): number {
  return Math.round((points / 72) * dpi);
}

/**
 * Get canvas dimensions for a label
 */
export function getCanvasDimensions(config: LabelConfig): { width: number; height: number } {
  return {
    width: mmToPixels(config.width, config.dpi),
    height: mmToPixels(config.height, config.dpi),
  };
}
