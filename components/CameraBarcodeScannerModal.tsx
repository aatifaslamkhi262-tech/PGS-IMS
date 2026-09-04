"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, X, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

interface CameraBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (barcodeValue: string) => void;
}

export const CameraBarcodeScannerModal: React.FC<CameraBarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const [scannerError, setScannerError] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const html5QrcodeScannerRef = useRef<Html5Qrcode | null>(null);
  const qrCodeRegionId = "camera-barcode-reader-region";

  useEffect(() => {
    if (!isOpen) return;

    let html5Qrcode: Html5Qrcode | null = null;
    let isSubscribed = true;

    const startScanner = async () => {
      setScannerError("");
      setScannedResult(null);
      setIsScanning(true);

      try {
        // Formats to detect: Barcodes (EAN, CODE128, UPC, etc.) & QR
        const formatsToSupport = [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE,
        ];

        html5Qrcode = new Html5Qrcode(qrCodeRegionId, {
          formatsToSupport,
          verbose: false,
        });
        html5QrcodeScannerRef.current = html5Qrcode;

        const config = {
          fps: 15,
          qrbox: { width: 280, height: 160 },
          aspectRatio: 1.0,
        };

        // Prefer back camera ("environment") on mobile devices
        await html5Qrcode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            if (!isSubscribed) return;
            // Play haptic vibrate if supported
            if (navigator.vibrate) {
              try {
                navigator.vibrate(100);
              } catch (e) {
                // ignore
              }
            }
            setScannedResult(decodedText);
            onScanSuccess(decodedText);

            // Auto stop scanner on success
            if (html5QrcodeScannerRef.current && html5QrcodeScannerRef.current.isScanning) {
              html5QrcodeScannerRef.current
                .stop()
                .then(() => {
                  onClose();
                })
                .catch(() => {
                  onClose();
                });
            } else {
              onClose();
            }
          },
          () => {
            // Frame scan failure - ignore noise
          }
        );
      } catch (err: any) {
        if (isSubscribed) {
          console.error("Camera scanner error:", err);
          setScannerError(
            err?.message || "Failed to access camera. Please check permissions."
          );
        }
      } finally {
        if (isSubscribed) setIsScanning(false);
      }
    };

    // Small delay to ensure DOM container is rendered
    const timeout = setTimeout(() => {
      startScanner();
    }, 200);

    return () => {
      isSubscribed = false;
      clearTimeout(timeout);
      if (html5QrcodeScannerRef.current && html5QrcodeScannerRef.current.isScanning) {
        html5QrcodeScannerRef.current.stop().catch(() => {});
      }
    };
  }, [isOpen, onClose, onScanSuccess]);

  const handleClose = async () => {
    if (html5QrcodeScannerRef.current && html5QrcodeScannerRef.current.isScanning) {
      try {
        await html5QrcodeScannerRef.current.stop();
      } catch (e) {
        // ignore
      }
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-5 text-slate-100 relative overflow-hidden flex flex-col items-center">
        {/* Header */}
        <div className="w-full flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm sm:text-base">
                Scan Barcode with Camera
              </h3>
              <p className="text-xs text-slate-400">Point camera at product barcode label</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder Area */}
        <div className="relative w-full aspect-square bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
          <div id={qrCodeRegionId} className="w-full h-full" />

          {/* Scanner Overlay Box */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            <div className="w-[260px] h-[150px] border-2 border-indigo-500/80 rounded-lg shadow-[0_0_15px_rgba(99,102,241,0.3)] relative">
              {/* Corner accents */}
              <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-indigo-400" />
              <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-indigo-400" />
              <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-indigo-400" />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-indigo-400" />
              {/* Laser line animation */}
              <div className="w-full h-0.5 bg-indigo-400 shadow-[0_0_8px_#818cf8] animate-pulse absolute top-1/2 -translate-y-1/2" />
            </div>
            <p className="text-[11px] font-semibold text-slate-300 bg-slate-900/90 px-3 py-1 rounded-full mt-3 border border-slate-800">
              Align barcode inside frame
            </p>
          </div>

          {isScanning && !scannerError && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
              <span className="text-xs text-slate-300">Initializing camera feed...</span>
            </div>
          )}
        </div>

        {/* Scanned Result / Error Feedback */}
        {scannedResult && (
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold rounded-xl flex items-center gap-2 w-full">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Barcode Detected: {scannedResult}</span>
          </div>
        )}

        {scannerError && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-xl flex items-start gap-2 w-full">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Camera Access Required</span>
              <span className="text-[11px] text-rose-300/80">{scannerError}</span>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="w-full mt-4 flex items-center justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
          >
            Cancel / Close Camera
          </button>
        </div>
      </div>
    </div>
  );
};
