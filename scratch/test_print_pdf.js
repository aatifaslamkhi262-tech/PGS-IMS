const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');

// Let's create an exact 2-page print HTML for CR80 (Page 1 = Front, Page 2 = Back)
const logoB64 = fs.readFileSync('public/card/logo-trimmed.png').toString('base64');
const frontBgB64 = fs.readFileSync('public/card/front-bg.png').toString('base64');
const backBgB64 = fs.readFileSync('public/card/back-bg.png').toString('base64');

const printHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>CR80 Print Production Ready</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700;800&family=Inter:wght@400;600;700;900&family=JetBrains+Mono:wght@700;800&display=swap');

    @page {
      size: 85.6mm 54mm;
      margin: 0 !important;
    }

    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      box-sizing: border-box;
    }

    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 85.6mm !important;
      background: transparent !important;
      font-family: 'Inter', sans-serif;
    }

    .cr80-sheet-page {
      width: 85.6mm;
      height: 54mm;
      min-width: 85.6mm;
      min-height: 54mm;
      max-width: 85.6mm;
      max-height: 54mm;
      overflow: hidden;
      position: relative;
      page-break-inside: avoid;
      break-inside: avoid;
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
    }

    .angled-frame-outer {
      clip-path: polygon(0 0, 100% 0, 100% calc(100% - 6mm), calc(100% - 6mm) 100%, 0 100%);
      background: linear-gradient(135deg, #7B2FF7 0%, #00F0FF 45%, #FFD400 100%);
      padding: 0.6mm;
      box-sizing: border-box;
    }
    
    .angled-frame-inner {
      clip-path: polygon(0 0, 100% 0, 100% calc(100% - 5.7mm), calc(100% - 5.7mm) 100%, 0 100%);
      width: 100%;
      height: 100%;
      background: #070a16;
      overflow: hidden;
      position: relative;
    }

    .name-esports {
      font-family: 'Rajdhani', sans-serif;
      text-transform: uppercase;
      font-weight: 800;
      line-height: 0.9;
      letter-spacing: 0.02em;
    }
  </style>
</head>
<body>

  <!-- ===================== PAGE 1: FRONT SIDE (85.6mm x 54mm) ===================== -->
  <div class="cr80-sheet-page" style="background: linear-gradient(135deg, #050814 0%, #0a0f26 50%, #050712 100%);">
    <div class="absolute inset-0 pointer-events-none" style="background: linear-gradient(125deg, transparent 36%, rgba(123, 47, 247, 0.15) 40%, rgba(0, 240, 255, 0.35) 44%, rgba(255, 212, 0, 0.22) 47%, transparent 50%);"></div>
    <div class="absolute right-0 bottom-0 w-[52mm] h-[42mm] pointer-events-none opacity-30 bg-contain bg-no-repeat bg-right-bottom" style="background-image: url('data:image/png;base64,${frontBgB64}');"></div>

    <div class="relative z-10 w-full h-full flex items-center justify-between" style="padding: 3.2mm;">
      <!-- Photo -->
      <div class="angled-frame-outer shrink-0" style="width: 34mm; height: 46.8mm;">
        <div class="angled-frame-inner">
          <div class="w-full h-full bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center text-cyan-300">
            <div class="w-16 h-16 rounded-full bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-400 p-0.5 shadow-lg mb-1 flex items-center justify-center">
              <div class="w-full h-full rounded-full bg-slate-950 flex items-center justify-center">
                <span class="text-3xl font-black text-white" style="font-family: 'Rajdhani', sans-serif;">A</span>
              </div>
            </div>
            <span class="text-[5pt] font-mono tracking-widest uppercase text-cyan-300 font-black">FORMAL PORTRAIT</span>
          </div>
        </div>
      </div>

      <!-- Right Column -->
      <div class="flex-1 h-full pl-3.5 flex flex-col justify-between items-start text-left py-0.5">
        <div class="w-full flex justify-end">
          <img src="data:image/png;base64,${logoB64}" alt="PGS Logo" style="width: 24mm; height: 15mm; object-fit: contain; object-position: right top;" class="block filter drop-shadow-md" />
        </div>

        <div class="w-full space-y-1.5 pb-0.5">
          <div class="name-esports text-white text-[17pt] tracking-tight leading-none drop-shadow-lg">
            ATIF
          </div>
          <div>
            <span class="inline-block px-2.5 py-0.8 rounded-xs text-[6.8pt] font-black uppercase text-white shadow-sm" style="background: #7B2FF7; font-family: 'Rajdhani', sans-serif; letter-spacing: 0.08em;">
              ADMINISTRATOR
            </span>
          </div>
          <div class="flex items-center gap-1 pt-0.5">
            <span class="text-[5pt] font-bold text-slate-400 font-mono">STAFF CODE:</span>
            <span class="font-mono text-[7pt] font-black text-cyan-300 tracking-wider">EMP-001</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ===================== PAGE 2: BACK SIDE (85.6mm x 54mm) ===================== -->
  <div class="cr80-sheet-page" style="background: linear-gradient(135deg, #050814 0%, #0a0f26 50%, #050712 100%); padding: 2.8mm;">
    <div class="absolute inset-0 pointer-events-none opacity-25 bg-cover bg-center" style="background-image: url('data:image/png;base64,${backBgB64}');"></div>

    <!-- 1. Center-Top Logo -->
    <div class="relative z-10 w-full flex flex-col items-center justify-center border-b border-purple-500/30 pb-0.5">
      <img src="data:image/png;base64,${logoB64}" alt="PGS Logo" style="width: 20mm; height: 9.5mm; object-fit: contain;" class="block filter drop-shadow-sm" />
      <span class="text-[4.8pt] font-black uppercase tracking-widest text-slate-300 mt-0.5" style="font-family: 'Rajdhani', sans-serif;">
        OFFICIAL IDENTIFICATION & GATE ACCESS CREDENTIAL
      </span>
    </div>

    <!-- 2. Terms -->
    <div class="relative z-10 bg-black/70 border border-white/10 rounded px-2 py-0.8 space-y-0.5 text-[5.4pt] text-slate-200 leading-snug">
      <p>1. Property of <strong>PGS Game Shop</strong>. Scan at gate on entry & exit.</p>
      <p>2. Non-transferable. If found, return to nearest branch or helpline.</p>
    </div>

    <!-- 3. Head Office, Helpline, Web -->
    <div class="relative z-10 rounded bg-slate-950/95 border border-cyan-400/40 px-2 py-0.8 text-[5.2pt]">
      <div class="flex items-center justify-between border-b border-white/10 pb-0.5">
        <span class="text-slate-300"><strong>Head Office:</strong> Karachi, Pakistan</span>
        <span class="text-slate-200">Web: <strong class="text-[#00F0FF] font-bold">www.pgsgameshop.online</strong></span>
      </div>
      <div class="flex items-center justify-between pt-0.5">
        <span class="whitespace-nowrap text-slate-200">Helpline: <strong class="text-cyan-300 font-mono font-black">+92 312 2319157</strong></span>
        <span class="text-slate-400 font-mono text-[4.8pt]">PGS GAME SHOP</span>
      </div>
    </div>

    <!-- 4. Footer: Dates + Sign -->
    <div class="relative z-10 flex items-end justify-between">
      <div class="bg-black/80 border border-white/15 rounded px-2 py-0.8 text-[5.2pt] space-y-0.5">
        <div>Issued: <strong class="font-mono text-cyan-300">29-Oct-2026</strong></div>
        <div>Valid Till: <strong class="font-mono text-emerald-300">29-Oct-2027</strong></div>
      </div>

      <div class="flex flex-col items-center">
        <div class="bg-white/5 rounded-xs" style="width: 15mm; height: 7.2mm; border: 0.3mm solid rgba(255, 255, 255, 0.45);"></div>
        <span class="text-[4.5pt] font-black uppercase tracking-wider text-slate-300 mt-0.5">AUTHORIZED SIGN</span>
      </div>
    </div>

    <!-- 5. Barcode Bay -->
    <div class="relative z-10 bg-white rounded flex flex-col items-center justify-center shadow-xs" style="padding: 0.8mm 2.5mm 1mm 2.5mm;">
      <div class="w-full text-center text-[4.2pt] font-mono font-black text-slate-500 leading-none mb-0.5 tracking-wider">
        ┌ GATE ATTENDANCE SCAN ┐
      </div>
      <svg id="back-barcode" class="w-full max-h-[4.5mm] overflow-visible"></svg>
      <div class="font-mono text-[5.5pt] font-black tracking-widest text-slate-950 leading-none mt-0.5">
        CRD-3C58B31EBA
      </div>
    </div>
  </div>

  <script>
    JsBarcode("#back-barcode", "CRD-3C58B31EBA", {
      format: "CODE128",
      width: 1.4,
      height: 14,
      displayValue: false,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000"
    });
  </script>
</body>
</html>`;

const tempHtmlPath = path.join(os.tmpdir(), 'card_print_template.html');
fs.writeFileSync(tempHtmlPath, printHtml, 'utf8');

const tempPdfPath = path.join(os.tmpdir(), 'CR80_Production_Card.pdf');
const fileUrl = 'file:///' + tempHtmlPath.replace(/\\/g, '/');

// Run headless Edge/Chrome with --print-to-pdf
console.log('Generating PDF via headless engine...');
cp.execFileSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--no-pdf-header-footer',
  '--print-to-pdf=' + tempPdfPath,
  fileUrl
]);

const destPdf = path.join('C:\\Users\\User\\.gemini\\antigravity\\brain\\007ae4e0-b6ff-48a4-959f-344d63b45776', 'EMP-001_Atif_ID_Card.pdf');
fs.copyFileSync(tempPdfPath, destPdf);
console.log('Saved production PDF to:', destPdf, 'size:', fs.statSync(destPdf).size);

