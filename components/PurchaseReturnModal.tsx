import React, { useState, useEffect, useRef } from "react";
import { RotateCcw, X, AlertCircle, CheckCircle2, RefreshCw, Barcode, Camera, Search, ScanBarcode } from "lucide-react";
import { CameraBarcodeScannerModal } from "@/components/CameraBarcodeScannerModal";

interface PurchaseReturnModalProps {
  invoiceId: string;
  onClose: () => void;
  onSuccess: (receiptData: any) => void;
}

export const PurchaseReturnModal: React.FC<PurchaseReturnModalProps> = ({
  invoiceId,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [invoice, setInvoice] = useState<any>(null);

  // Scanner & Camera state
  const [scanInput, setScanInput] = useState("");
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const isProcessingScanRef = useRef(false);

  // Return Form State
  const [returnReason, setReturnReason] = useState("Defective / Vendor Revert");
  const [selectedItems, setSelectedItems] = useState<{
    [productId: string]: {
      selected: boolean;
      quantity: number;
      condition: string;
      serialNumbers: string[];
    };
  }>({});

  useEffect(() => {
    const fetchInvoiceDetails = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/purchase-invoices/${invoiceId}`);
        const data = await res.json();
        if (data.success && data.data) {
          setInvoice(data.data);
          const initialMap: any = {};
          data.data.items?.forEach((it: any) => {
            const pId = it.product?._id || it.product;
            initialMap[pId] = {
              selected: false,
              quantity: 1,
              condition: it.condition || "New",
              serialNumbers: [],
            };
          });
          setSelectedItems(initialMap);
        } else {
          setError(data.error || "Failed to load purchase invoice details.");
        }
      } catch (err: any) {
        setError("Error fetching purchase invoice.");
      } finally {
        setLoading(false);
      }
    };

    fetchInvoiceDetails();
  }, [invoiceId]);

  const toggleItemSelection = (productId: string) => {
    setSelectedItems((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        selected: !prev[productId]?.selected,
      },
    }));
  };

  const updateItemQty = (productId: string, qty: number) => {
    setSelectedItems((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        quantity: Math.max(1, qty),
      },
    }));
  };

  const toggleSerialNumber = (productId: string, sn: string) => {
    setSelectedItems((prev) => {
      const currentList = prev[productId]?.serialNumbers || [];
      const isSelected = currentList.includes(sn);
      const updatedList = isSelected
        ? currentList.filter((s) => s !== sn)
        : [...currentList, sn];

      return {
        ...prev,
        [productId]: {
          ...prev[productId],
          serialNumbers: updatedList,
          quantity: updatedList.length > 0 ? updatedList.length : prev[productId]?.quantity || 1,
        },
      };
    });
  };

  const handleScanSerial = (rawScanned: string) => {
    const cleanScanned = rawScanned.trim();
    if (!cleanScanned) return;

    // Double-Trigger Lock Guard (Prevents 1 scan from selecting twice within 350ms)
    if (isProcessingScanRef.current) return;
    isProcessingScanRef.current = true;
    setTimeout(() => {
      isProcessingScanRef.current = false;
    }, 350);

    setError("");
    setScanMessage("");

    if (!invoice || !invoice.items) {
      setScanInput("");
      return;
    }

    let foundMatch = false;

    // Search across invoice items for matching serial number or product SKU/barcode
    for (const item of invoice.items) {
      const pId = item.product?._id || item.product;
      const serialList: string[] = item.serialNumbers || [];
      const itemBarcode = item.barcode || "";
      const itemSku = item.sku || "";

      // Case A: Match with Serial Number
      const matchedSn = serialList.find(
        (sn) => sn.toLowerCase() === cleanScanned.toLowerCase()
      );

      if (matchedSn) {
        foundMatch = true;
        setSelectedItems((prev) => {
          const currentItemState = prev[pId] || { selected: false, quantity: 1, serialNumbers: [] };
          const alreadySelected = currentItemState.serialNumbers.includes(matchedSn);

          // If not selected, select it ONCE; if selected, unselect
          const newSerials = alreadySelected
            ? currentItemState.serialNumbers.filter((s) => s !== matchedSn)
            : [...currentItemState.serialNumbers, matchedSn];

          return {
            ...prev,
            [pId]: {
              ...currentItemState,
              selected: true,
              serialNumbers: newSerials,
              quantity: newSerials.length > 0 ? newSerials.length : currentItemState.quantity,
            },
          };
        });

        setScanMessage(`✓ Serial '${matchedSn}' scan toggled!`);
        break;
      }

      // Case B: Match product SKU or Barcode (for non-serialized item toggle)
      if (
        cleanScanned.toLowerCase() === itemBarcode.toLowerCase() ||
        cleanScanned.toLowerCase() === itemSku.toLowerCase()
      ) {
        foundMatch = true;
        setSelectedItems((prev) => {
          const currentItemState = prev[pId] || { selected: false, quantity: 1, serialNumbers: [] };
          return {
            ...prev,
            [pId]: {
              ...currentItemState,
              selected: !currentItemState.selected,
            },
          };
        });

        setScanMessage(`✓ Product '${item.name}' toggled!`);
        break;
      }
    }

    if (!foundMatch) {
      setError(`No matching serial or barcode '${cleanScanned}' found on Invoice #${invoice.invoiceNumber}.`);
    }

    setScanInput("");
  };

  const handleSubmitReturn = async () => {
    setError("");
    const itemsToReturn: any[] = [];

    Object.keys(selectedItems).forEach((pId) => {
      const itemState = selectedItems[pId];
      if (itemState.selected) {
        itemsToReturn.push({
          productId: pId,
          condition: itemState.condition,
          quantity: itemState.quantity,
          serialNumbers: itemState.serialNumbers,
        });
      }
    });

    if (itemsToReturn.length === 0) {
      setError("Please select at least one item to return to supplier.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`/api/purchase-invoices/${invoiceId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: itemsToReturn,
          returnReason,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Failed to process purchase return.");
        setSubmitting(false);
        return;
      }

      onSuccess(data.data.receiptData);
    } catch (err: any) {
      setError("Server error while processing purchase return.");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-400" />
              Return Stock to Supplier
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Invoice #{invoice?.invoiceNumber} • Supplier: {invoice?.supplier?.name || "Supplier"}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-400" />
            <p className="text-xs">Loading invoice items...</p>
          </div>
        ) : error && !invoice ? (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Handheld Barcode Input + Mobile Camera Scanner Button */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
              <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ScanBarcode className="w-4 h-4 text-amber-400" />
                  Scan Serial / Barcode (Handheld Gun / Camera):
                </span>
                <button
                  type="button"
                  onClick={() => setShowCameraScanner(true)}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] rounded-lg shadow-sm flex items-center gap-1 transition cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Camera Scan</span>
                </button>
              </label>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Scan serial number with barcode gun scanner or type here..."
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault(); // Prevent double form submit trigger!
                      handleScanSerial(scanInput);
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => handleScanSerial(scanInput)}
                  className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] rounded transition"
                >
                  Scan
                </button>
              </div>

              {scanMessage && (
                <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{scanMessage}</span>
                </div>
              )}
              {error && (
                <div className="text-[11px] text-rose-400 font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-bold">Return Reason / Vendor Note:</label>
              <input
                type="text"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="e.g. Defective Unit / Box Damaged / Stock Revert"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-slate-300 font-bold">Select Items & Serials to Return:</label>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {invoice?.items?.map((it: any) => {
                  const pId = it.product?._id || it.product;
                  const itemState = selectedItems[pId] || { selected: false, quantity: 1, serialNumbers: [] };
                  const isSerialized = it.product?.serialTracking || (it.serialNumbers && it.serialNumbers.length > 0);

                  return (
                    <div
                      key={pId}
                      className={`p-3 rounded-xl border transition ${
                        itemState.selected
                          ? "bg-slate-950 border-amber-500/40 shadow-sm"
                          : "bg-slate-950/60 border-slate-800 opacity-80"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2.5 font-semibold text-slate-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={itemState.selected}
                            onChange={() => toggleItemSelection(pId)}
                            className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                          />
                          <div>
                            <div>{it.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Unit Cost: Rs. {it.unitCost?.toLocaleString()} • Max Qty: {it.quantity}
                            </div>
                          </div>
                        </label>

                        {itemState.selected && !isSerialized && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 font-medium">Return Qty:</span>
                            <input
                              type="number"
                              min={1}
                              max={it.quantity}
                              value={itemState.quantity}
                              onChange={(e) => updateItemQty(pId, Number(e.target.value))}
                              className="w-16 bg-slate-900 border border-slate-700 text-amber-400 font-mono font-bold rounded px-2 py-1 text-center"
                            />
                          </div>
                        )}
                      </div>

                      {/* Serial Numbers Selection list */}
                      {itemState.selected && isSerialized && (
                        <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1.5">
                          <div className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                            <Barcode className="w-3 h-3" />
                            <span>Select Serial Numbers to Return & Remove from DB:</span>
                          </div>
                          {it.serialNumbers && it.serialNumbers.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {it.serialNumbers.map((sn: string) => {
                                const isChecked = itemState.serialNumbers.includes(sn);
                                return (
                                  <button
                                    key={sn}
                                    type="button"
                                    onClick={() => toggleSerialNumber(pId, sn)}
                                    className={`px-2 py-1 rounded text-[10px] font-mono border transition ${
                                      isChecked
                                        ? "bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold"
                                        : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700"
                                    }`}
                                  >
                                    {isChecked ? "✓ " : ""}{sn}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-500 italic pt-1">
                              No active available serial numbers found in stock for this item.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-semibold text-xs"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmitReturn}
            disabled={submitting || loading}
            className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 text-white font-bold text-xs shadow-lg shadow-amber-600/20 transition flex items-center justify-center gap-2"
          >
            {submitting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                Confirm Return & Print Slip
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Camera Barcode & Serial Scanner Modal */}
      {showCameraScanner && (
        <CameraBarcodeScannerModal
          isOpen={showCameraScanner}
          onClose={() => setShowCameraScanner(false)}
          onScanSuccess={(scannedValue) => {
            handleScanSerial(scannedValue);
            setShowCameraScanner(false);
          }}
        />
      )}
    </div>
  );
};
