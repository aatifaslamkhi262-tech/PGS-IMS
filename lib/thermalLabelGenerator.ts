/**
 * Thermal label generator for 203 DPI printers
 * Generates high-resolution canvas-based barcode labels
 */

import JsBarcode from "jsbarcode";
import { 
  DEFAULT_LABEL_CONFIG, 
  LabelConfig, 
  getCanvasDimensions, 
  mmToPixels, 
  pointsToPixels 
} from "./labelConfig";

export interface LabelData {
  productName: string;
  barcode: string;
  sellingPrice?: number | null;
  condition?: string;
  companyName?: string;
}

/**
 * Generate a high-resolution canvas label for thermal printing
 */
export async function generateThermalLabel(
  data: LabelData,
  config: LabelConfig = DEFAULT_LABEL_CONFIG
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }
  
  // Set canvas dimensions for exact DPI
  const dimensions = getCanvasDimensions(config);
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  
  // Fill white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const companyName = data.companyName || "PGS Game Shop";
  const formattedPrice = data.sellingPrice != null 
    ? `Rs. ${data.sellingPrice.toLocaleString("en-PK")}` 
    : null;
  
  // Calculate layout dimensions in pixels
  const padding = mmToPixels(config.padding, config.dpi);
  const mainSectionWidth = canvas.width;
  
  // Main section offset
  const mainSectionX = 0;
  
  // Generate barcode using a temporary SVG, then render to canvas
  const barcodeCanvas = await generateBarcodeCanvas(
    data.barcode,
    config,
    mainSectionWidth - (padding * 2)
  );
  
  const barcodeY = padding;
  const barcodeX = mainSectionX + (mainSectionWidth - barcodeCanvas.width) / 2;
  
  ctx.drawImage(barcodeCanvas, barcodeX, barcodeY);
  
  // Draw barcode value below barcode
  ctx.fillStyle = "#000000";
  ctx.font = `${pointsToPixels(config.barcodeValueFontSize, config.dpi)}px "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(
    data.barcode,
    mainSectionX + mainSectionWidth / 2,
    barcodeY + barcodeCanvas.height + mmToPixels(0.3, config.dpi)
  );
  
  // Draw product name (with text wrapping)
  const productY = barcodeY + barcodeCanvas.height + 
                   pointsToPixels(config.barcodeValueFontSize + 2, config.dpi);
  const actualProductHeight = drawWrappedText(
    ctx,
    data.productName || "Product",
    mainSectionX + padding,
    productY,
    mainSectionWidth - (padding * 2),
    pointsToPixels(config.productNameFontSize, config.dpi),
    2
  );
  
  // Draw condition badge if present
  if (data.condition) {
    const conditionY = productY + actualProductHeight + mmToPixels(0.3, config.dpi);
    ctx.fillStyle = "#666666";
    ctx.font = `bold ${pointsToPixels(config.conditionFontSize, config.dpi)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(
      `— ${data.condition.toUpperCase()}`,
      mainSectionX + mainSectionWidth / 2,
      conditionY
    );
  }
  
  return canvas;
}

/**
 * Generate a high-resolution barcode canvas using Code 128
 */
function generateBarcodeCanvas(
  value: string,
  config: LabelConfig,
  maxWidth: number
): Promise<HTMLCanvasElement> {
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const barcodeCanvas = document.createElement("canvas");
    const ctx = barcodeCanvas.getContext("2d");
    
    if (!ctx) {
      reject(new Error("Failed to get barcode canvas context"));
      return;
    }
    
    // Generate barcode with optimized settings for thermal printing
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, value, {
      format: "CODE128",
      width: config.barcodeWidth,
      height: config.barcodeHeight,
      displayValue: false,
      margin: config.quietZone,
      background: "#ffffff",
      lineColor: "#000000",
    });
    
    // Get the SVG dimensions in mm
    const svgWidth = parseFloat(svg.getAttribute("width") || "0");
    const svgHeight = parseFloat(svg.getAttribute("height") || "0");
    
    // Convert to pixels at the target DPI
    const pixelWidth = mmToPixels(svgWidth, config.dpi);
    const pixelHeight = mmToPixels(svgHeight, config.dpi);
    
    // Scale down if it exceeds max width
    const scale = maxWidth > 0 && pixelWidth > maxWidth ? maxWidth / pixelWidth : 1;
    barcodeCanvas.width = Math.round(pixelWidth * scale);
    barcodeCanvas.height = Math.round(pixelHeight * scale);
    
    // Fill white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, barcodeCanvas.width, barcodeCanvas.height);
    
    // Serialize SVG to data URL
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgUrl = "data:image/svg+xml;base64," + btoa(svgData);
    
    // Load SVG as image and draw to canvas
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, barcodeCanvas.width, barcodeCanvas.height);
      resolve(barcodeCanvas);
    };
    img.onerror = () => reject(new Error("Failed to load barcode SVG"));
    img.src = svgUrl;
  });
}

/**
 * Draw text with word wrapping
 */
function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  maxLines: number
): number {
  const words = text.split(" ");
  let line = "";
  let lines: string[] = [];
  
  ctx.font = `${fontSize}px Arial`;
  
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + " ";
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    
    if (testWidth > maxWidth && i > 0) {
      lines.push(line);
      line = words[i] + " ";
    } else {
      line = testLine;
    }
  }
  lines.push(line);
  
  // Limit to max lines
  lines = lines.slice(0, maxLines);
  
  // Draw each line
  lines.forEach((line, index) => {
    ctx.fillText(line.trim(), x + maxWidth / 2, y + (index * fontSize * 1.1));
  });
  
  // Return the actual height used
  return lines.length * fontSize * 1.1;
}

/**
 * Convert canvas to high-quality PNG for printing
 */
export function canvasToPrintImage(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png", 1.0);
}

/**
 * Create a print window with the generated label
 */
export function printThermalLabel(canvas: HTMLCanvasElement, productName: string): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    console.error("Failed to open print window. Please check popup blocker settings.");
    return;
  }
  
  const imageData = canvasToPrintImage(canvas);
  
  printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Label — ${productName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    @page {
      size: ${DEFAULT_LABEL_CONFIG.width}mm ${DEFAULT_LABEL_CONFIG.height}mm;
      margin: 0;
    }
    
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #fff;
    }
    
    img {
      max-width: 100%;
      height: auto;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
      image-rendering: pixelated;
    }
    
    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      img {
        width: ${DEFAULT_LABEL_CONFIG.width}mm;
        height: ${DEFAULT_LABEL_CONFIG.height}mm;
        max-width: none;
      }
    }
  </style>
</head>
<body onload="window.print(); window.onafterprint = function() { window.close(); };">
  <img src="${imageData}" alt="Label" />
</body>
</html>`);
  printWindow.document.close();
}
