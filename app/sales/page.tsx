"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ShoppingCart,
  Clock,
  Globe,
  Calendar,
  ArrowRightLeft,
  Handshake,
  Search,
  Plus,
  Trash2,
  Printer,
  CheckCircle,
  Truck,
  UserCheck,
  CreditCard,
  DollarSign,
  AlertCircle,
  ShieldCheck,
  Camera,
  Barcode,
  QrCode,
  Scan,
} from "lucide-react";
import { CameraBarcodeScannerModal } from "@/components/CameraBarcodeScannerModal";
import { ThermalReceiptModal } from "@/components/ThermalReceipt";

export type SalesMode = "POS" | "QUEUE" | "ONLINE" | "ADVANCE" | "RETURNS" | "TRADEIN";

function SalesWorkspaceContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const modeParam = (searchParams.get("mode") as SalesMode) || "POS";
  const [mode, setMode] = useState<SalesMode>(modeParam);

  useEffect(() => {
    const urlMode = searchParams.get("mode") as SalesMode;
    if (urlMode && urlMode !== mode) {
      setMode(urlMode);
    }
  }, [searchParams]);

  const handleModeChange = (newMode: SalesMode) => {
    setMode(newMode);
    router.push(`/sales?mode=${newMode}`);
  };

  // Master Data States
  const [locations, setLocations] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [salesmen, setSalesmen] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [loadingMaster, setLoadingMaster] = useState(true);

  // Common Header State
  const [selectedLocation, setSelectedLocation] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedSalesman, setSelectedSalesman] = useState("");

  // Mode: POS State
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [splitCash, setSplitCash] = useState(0);
  const [splitCard, setSplitCard] = useState(0);
  const [cardRef, setCardRef] = useState("");
  const [splitBank, setSplitBank] = useState(0);
  const [bankRef, setBankRef] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [deliveryCharges, setDeliveryCharges] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [receiptData, setReceiptData] = useState<any | null>(null);
  const [completedReceiptData, setCompletedReceiptData] = useState<any | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Mode: Queue / Recent Sales State & Reassign Modal
  const [pendingSales, setPendingSales] = useState<any[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignSale, setReassignSale] = useState<any | null>(null);
  const [targetSalesmanId, setTargetSalesmanId] = useState("");

  const handleReassignSalesman = async () => {
    if (!reassignSale) return;
    try {
      const res = await fetch(`/api/sales/${reassignSale._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesmanId: targetSalesmanId || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || "Salesman attribution updated!");
        setShowReassignModal(false);
        fetchQueue();
      } else {
        alert(data.error || "Failed to update salesman attribution.");
      }
    } catch (err: any) {
      alert(err.message || "Network error.");
    }
  };

  // Mode: Online State
  const [shippingAddress, setShippingAddress] = useState("");
  const [courierName, setCourierName] = useState("Bykea");
  const [riderName, setRiderName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [onlineProductId, setOnlineProductId] = useState("");
  const [onlinePrice, setOnlinePrice] = useState(0);

  // Mode: Advance State (Multi-Item Support)
  const [advanceItems, setAdvanceItems] = useState<any[]>([]);
  const [newAdvanceProdId, setNewAdvanceProdId] = useState("");
  const [newAdvanceQty, setNewAdvanceQty] = useState(1);
  const [newAdvancePrice, setNewAdvancePrice] = useState(0);
  const [newAdvanceSerial, setNewAdvanceSerial] = useState("");
  const [advanceDeposit, setAdvanceDeposit] = useState(0);
  const [expectedDate, setExpectedDate] = useState("");
  const [reserveSerial, setReserveSerial] = useState(true);

  // Mode: Returns & Exchange State (with Rental Swap option)
  const [returnSubMode, setReturnSubMode] = useState<"INVOICE" | "RENTAL_SWAP">("INVOICE");
  const [searchInvoiceNumber, setSearchInvoiceNumber] = useState("");
  const [searchingInvoice, setSearchingInvoice] = useState(false);
  const [foundSale, setFoundSale] = useState<any | null>(null);
  const [returnSelectedItems, setReturnSelectedItems] = useState<Record<string, any>>({});
  const [returnReplacementItems, setReturnReplacementItems] = useState<any[]>([]);
  const [returnNotes, setReturnNotes] = useState("");
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [newReplacementProdId, setNewReplacementProdId] = useState("");
  const [newReplacementSerial, setNewReplacementSerial] = useState("");
  const [newReplacementQty, setNewReplacementQty] = useState(1);
  const [newReplacementPrice, setNewReplacementPrice] = useState(0);
  const [returnError, setReturnError] = useState("");
  const [returnSuccessMsg, setReturnSuccessMsg] = useState("");

  // Rental Return & Game Swap specific state
  const [rentalReturnProdId, setRentalReturnProdId] = useState("");
  const [rentalReturnCondition, setRentalReturnCondition] = useState("Used");
  const [rentalReturnSerial, setRentalReturnSerial] = useState("");
  const [rentalSecurityDeposit, setRentalSecurityDeposit] = useState(0);
  const [rentalFeeDeducted, setRentalFeeDeducted] = useState(0);
  const [rentalTopUpCash, setRentalTopUpCash] = useState(0);

  // Mode: Direct Trade-In State
  const [tradeInProductId, setTradeInProductId] = useState("");
  const [tradeInCondition, setTradeInCondition] = useState("Used");
  const [tradeInSerial, setTradeInSerial] = useState("");
  const [tradeInValue, setTradeInValue] = useState(0);
  const [replacementProductId, setReplacementProductId] = useState("");

  // Barcode & Mobile Camera Scanner State
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [activeScanTarget, setActiveScanTarget] = useState<
    "POS" | "ONLINE" | "ADVANCE" | "TRADEIN_IN" | "TRADEIN_OUT" | "RETURNS" | "RENTAL_IN" | "RENTAL_OUT"
  >("ONLINE");
  const [scanBarcodeInput, setScanBarcodeInput] = useState("");

  const handleResolveBarcode = async (codeValue: string, targetOverride?: string) => {
    const code = codeValue.trim();
    if (!code) return;

    const target = targetOverride || activeScanTarget;
    setScanBarcodeInput("");

    try {
      const scanRes = await fetch(`/api/barcodes/scan?barcode=${encodeURIComponent(code)}`);
      const scanData = await scanRes.json();

      let foundProduct: any = null;
      let scannedSerial: string | undefined = undefined;

      if (scanRes.ok && scanData.success && scanData.data?.product) {
        foundProduct = scanData.data.product;
        scannedSerial = scanData.data.serialDetails?.serialNumber || (scanData.data.type === "SERIAL" ? code : undefined);
      } else {
        foundProduct = products.find(
          (p) =>
            p.barcode === code ||
            p.sku?.toLowerCase() === code.toLowerCase() ||
            p._id === code
        );
      }

      if (!foundProduct) {
        alert(`Barcode / Product '${code}' not found.`);
        return;
      }

      if (target === "ONLINE") {
        setOnlineProductId(foundProduct._id);
        setOnlinePrice(foundProduct.sellingPrice || 0);
      } else if (target === "ADVANCE") {
        const existingIdx = advanceItems.findIndex((it) => it.productId === foundProduct._id);
        if (existingIdx >= 0) {
          const updated = [...advanceItems];
          updated[existingIdx].quantity += 1;
          setAdvanceItems(updated);
        } else {
          setAdvanceItems([
            ...advanceItems,
            {
              productId: foundProduct._id,
              productName: foundProduct.name,
              condition: foundProduct.condition || "New",
              quantity: 1,
              unitPrice: foundProduct.sellingPrice || 0,
              serialNumber: "",
            },
          ]);
        }
      } else if (target === "TRADEIN_IN") {
        setTradeInProductId(foundProduct._id);
      } else if (target === "TRADEIN_OUT") {
        setReplacementProductId(foundProduct._id);
      } else if (target === "RENTAL_IN") {
        setRentalReturnProdId(foundProduct._id);
      } else if (target === "RENTAL_OUT") {
        setNewReplacementProdId(foundProduct._id);
        setNewReplacementPrice(foundProduct.sellingPrice || 0);
      } else if (target === "POS") {
        addToCart(foundProduct, scannedSerial);
      }
    } catch (err) {
      console.error("Failed to resolve barcode", err);
      alert("Error scanning barcode.");
    }
  };

  useEffect(() => {
    const loadMaster = async () => {
      try {
        setLoadingMaster(true);
        const [locRes, prodRes, userRes, custRes, meRes] = await Promise.all([
          fetch("/api/locations").then((r) => r.json()),
          fetch("/api/products").then((r) => r.json()),
          fetch("/api/users/active").then((r) => r.json()),
          fetch("/api/customers").then((r) => r.json()),
          fetch("/api/auth/me").then((r) => r.json()),
        ]);

        if (locRes.success && locRes.data.length > 0) {
          setLocations(locRes.data);
          setSelectedLocation(locRes.data[0]._id);
        }
        if (prodRes.success) setProducts(prodRes.data);
        if (userRes.success) setSalesmen(userRes.data);
        if (custRes.success) setCustomers(custRes.data);
        if (meRes.success) setCurrentUser(meRes.data);
      } catch (err) {
        console.error("Failed to load master data", err);
      } finally {
        setLoadingMaster(false);
      }
    };
    loadMaster();
  }, []);

  useEffect(() => {
    if (mode === "QUEUE") {
      fetchQueue();
    }
  }, [mode, selectedLocation]);

  const fetchQueue = async () => {
    try {
      setLoadingQueue(true);
      const res = await fetch(`/api/sales/queue?locationId=${selectedLocation}`);
      const data = await res.json();
      if (data.success) {
        setPendingSales(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch queue", err);
    } finally {
      setLoadingQueue(false);
    }
  };

  const handleCancelQueueSale = async (saleId: string, saleNumber: string) => {
    if (!confirm(`Are you sure you want to cancel and remove order ${saleNumber} from the queue?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/sales/${saleId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        alert(`Order ${saleNumber} cancelled and removed from queue.`);
        fetchQueue();
      } else {
        alert(data.error || "Failed to cancel sale.");
      }
    } catch (err: any) {
      alert("Error cancelling sale.");
    }
  };

  const addToCart = (product: any, scannedSerial?: string) => {
    const existing = cartItems.find((item) => item.product._id === product._id);
    if (existing) {
      const existingSerials = existing.serialNumbers || [];
      let newSerials = [...existingSerials];
      let newQty = existing.quantity;

      if (scannedSerial) {
        if (!newSerials.includes(scannedSerial)) {
          newSerials.push(scannedSerial);
          if (newSerials.length > existing.quantity) {
            newQty = newSerials.length;
          }
        }
      } else {
        newQty = existing.quantity + 1;
      }

      setCartItems(
        cartItems.map((item) =>
          item.product._id === product._id
            ? { ...item, quantity: newQty, serialNumbers: newSerials }
            : item
        )
      );
    } else {
      setCartItems([
        ...cartItems,
        {
          product,
          quantity: 1,
          unitPrice: product.sellingPrice,
          serialNumbers: scannedSerial ? [scannedSerial] : [],
        },
      ]);
    }
  };

  const removeFromCart = (index: number) => {
    setCartItems(cartItems.filter((_, i) => i !== index));
  };

  const cartSubtotal = cartItems.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const cartTotal = Math.max(0, cartSubtotal - discountAmount + deliveryCharges);

  const handleCompletePOS = async () => {
    if (cartItems.length === 0) {
      alert("Cart is empty.");
      return;
    }
    if (!selectedLocation) {
      alert("Please select a location.");
      return;
    }

    const allocations = isSplitPayment
      ? [
          ...(splitCash > 0 ? [{ method: "CASH", amount: splitCash }] : []),
          ...(splitCard > 0
            ? [{ method: "CARD", amount: splitCard, referenceNumber: cardRef }]
            : []),
          ...(splitBank > 0
            ? [{ method: "BANK_TRANSFER", amount: splitBank, referenceNumber: bankRef }]
            : []),
        ]
      : [{ method: paymentMethod, amount: cartTotal }];

    const totalAllocated = allocations.reduce((acc, p) => acc + p.amount, 0);
    if (totalAllocated < cartTotal - 0.5) {
      alert(
        `Split payment total (Rs. ${totalAllocated.toLocaleString()}) is less than total amount (Rs. ${cartTotal.toLocaleString()}).`
      );
      return;
    }

    const selectedSalesmanObj = salesmen.find((s) => s._id === selectedSalesman);

    try {
      setSubmitting(true);
      const idempotencyKey = `POS-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const res = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          creationMode: "DIRECT_COUNTER",
          saleSource: selectedSalesman ? "SALESMAN" : "DIRECT_COUNTER",
          locationId: selectedLocation,
          salesmanId: selectedSalesman || undefined,
          salesmanName: selectedSalesmanObj ? selectedSalesmanObj.name : undefined,
          customerName: customerName || "Walk-in Customer",
          customerPhone: customerPhone || undefined,
          items: cartItems.map((it) => ({
            productId: it.product._id,
            condition: it.product.condition || "New",
            quantity: it.quantity,
            serialNumbers: it.serialNumbers,
            unitPrice: it.unitPrice,
          })),
          discountAmount,
          deliveryCharges,
          directComplete: true,
          paymentAllocations: allocations,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCompletedReceiptData({
          invoiceNumber: data.invoice?.invoiceNumber || data.data?.saleNumber,
          date: new Date(),
          locationName: locations.find((l) => l._id === selectedLocation)?.name || "Warehouse",
          cashierName: currentUser?.username || currentUser?.name || "Counter Staff",
          salesmanName: selectedSalesmanObj ? selectedSalesmanObj.name : undefined,
          customerName: customerName || "Walk-in Customer",
          customerPhone: customerPhone || undefined,
          items: cartItems.map((it) => ({
            productName: it.product.name,
            condition: it.product.condition || "New",
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            lineTotal: it.unitPrice * it.quantity,
            serialNumbers: it.serialNumbers,
          })),
          subtotal: cartSubtotal,
          discountAmount,
          deliveryCharges,
          totalAmount: cartTotal,
          paidAmount: totalAllocated,
          changeDue: 0,
          payments: allocations,
        });
        setShowReceiptModal(true);
        setCartItems([]);
      } else {
        alert(data.error || "Failed to process sale.");
      }
    } catch (err: any) {
      alert(err.message || "Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOnlineSubmit = async () => {
    if (!onlineProductId) {
      alert("Please select a product for Online Order.");
      return;
    }

    try {
      setSubmitting(true);
      const idempotencyKey = `ONL-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const prod = products.find((p) => p._id === onlineProductId);

      const res = await fetch("/api/sales/online", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          saleSource: "WEBSITE",
          locationId: selectedLocation,
          customerName: customerName || "Online Customer",
          customerPhone: customerPhone || undefined,
          items: [
            {
              productId: onlineProductId,
              quantity: 1,
              unitPrice: onlinePrice || prod?.sellingPrice || 0,
            },
          ],
          deliveryCharges,
          notes: `Shipping Address: ${shippingAddress || "N/A"} • Courier/Rider: ${courierName} (${riderName || "N/A"}) • Tracking: ${trackingNumber || "N/A"}`,
          createdBy: "online-salesman",
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(`Online order ${data.data.saleNumber} created successfully!`);
      } else {
        alert(data.error || "Failed to create online order.");
      }
    } catch (err: any) {
      alert(err.message || "Error creating online order.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddAdvanceItem = () => {
    if (!newAdvanceProdId) return;
    const selectedProd = products.find((p) => p._id === newAdvanceProdId);
    if (!selectedProd) return;

    const newItem = {
      productId: selectedProd._id,
      productName: selectedProd.name,
      condition: selectedProd.condition || "New",
      quantity: newAdvanceQty > 0 ? newAdvanceQty : 1,
      unitPrice: newAdvancePrice > 0 ? newAdvancePrice : (selectedProd.sellingPrice || 0),
      serialNumber: newAdvanceSerial.trim() || undefined,
    };

    setAdvanceItems([...advanceItems, newItem]);
    setNewAdvanceProdId("");
    setNewAdvanceQty(1);
    setNewAdvancePrice(0);
    setNewAdvanceSerial("");
  };

  const handleRemoveAdvanceItem = (index: number) => {
    setAdvanceItems(advanceItems.filter((_, idx) => idx !== index));
  };

  const advanceTotalPrice = advanceItems.reduce(
    (acc, item) => acc + (item.unitPrice || 0) * (item.quantity || 1),
    0
  );

  const handleAdvanceSubmit = async () => {
    if (advanceItems.length === 0) {
      alert("Please add at least one product to the Advance Booking list.");
      return;
    }
    if (!advanceDeposit || advanceDeposit <= 0) {
      alert("Advance deposit amount must be greater than 0.");
      return;
    }

    try {
      setSubmitting(true);
      const idempotencyKey = `ADV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const res = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          creationMode: "DIRECT_COUNTER",
          saleSource: "ADVANCE_BOOKING",
          locationId: selectedLocation,
          salesmanId: selectedSalesman || undefined,
          customerName: customerName || "Advance Booking Customer",
          customerPhone: customerPhone || undefined,
          items: advanceItems.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            condition: it.condition || "New",
            serialNumbers: it.serialNumber ? [it.serialNumber] : [],
          })),
          notes: `Advance Deposit Received: Rs. ${advanceDeposit.toLocaleString()} (Total Booking: Rs. ${advanceTotalPrice.toLocaleString()}, Remaining: Rs. ${Math.max(0, advanceTotalPrice - advanceDeposit).toLocaleString()}) • Expected Pickup: ${expectedDate || "N/A"}`,
          createdBy: currentUser?.username || currentUser?.name || "counter-staff",
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(`Advance booking ${data.data.saleNumber} registered with ${advanceItems.length} item(s) successfully!`);
        setAdvanceItems([]);
        setAdvanceDeposit(0);
        setExpectedDate("");
      } else {
        alert(data.error || "Failed to register advance booking.");
      }
    } catch (err: any) {
      alert(err.message || "Error registering advance booking.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTradeInSubmit = async () => {
    if (!tradeInProductId) {
      alert("Please select a Trade-In product.");
      return;
    }
    if (!tradeInValue || tradeInValue <= 0) {
      alert("Agreed Trade-In value must be greater than 0.");
      return;
    }

    try {
      setSubmitting(true);
      const idempotencyKey = `TRD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const replacementItem = products.find((p) => p._id === replacementProductId);

      const res = await fetch("/api/sales/returns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          action: "DIRECT_TRADE_IN",
          locationId: selectedLocation,
          customerName: customerName || "Walk-in Customer",
          customerPhone: customerPhone || undefined,
          tradeInItem: {
            productId: tradeInProductId,
            condition: tradeInCondition,
            quantity: 1,
            serialNumber: tradeInSerial || undefined,
            agreedTradeInValue: tradeInValue,
          },
          replacementItems: replacementItem
            ? [
                {
                  productId: replacementItem._id,
                  quantity: 1,
                  unitPrice: replacementItem.sellingPrice,
                  condition: replacementItem.condition || "New",
                },
              ]
            : [],
          paymentMethod,
          processedBy: "admin",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setReceiptData(data.data.receiptData);
        alert(`Direct Trade-In ${data.data.tradeInNumber} completed successfully!`);
      } else {
        alert(data.error || "Failed to process Trade-In.");
      }
    } catch (err: any) {
      alert(err.message || "Error processing Trade-In.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSearchInvoice = async () => {
    if (!searchInvoiceNumber.trim()) return;
    setSearchingInvoice(true);
    setFoundSale(null);
    setReturnError("");

    try {
      const cleanTerm = searchInvoiceNumber.trim();
      const res = await fetch(`/api/sales?search=${encodeURIComponent(cleanTerm)}`);
      const data = await res.json();

      if (data.success && data.data && data.data.length > 0) {
        const cleanUpper = cleanTerm.toUpperCase();
        const hexSuffix = cleanUpper.replace(/^INV-/, "");
        const matched =
          data.data.find(
            (s: any) =>
              s._id === cleanTerm ||
              s._id?.toUpperCase().endsWith(hexSuffix) ||
              s.saleNumber?.toUpperCase() === cleanUpper ||
              s.invoiceNumber?.toUpperCase() === cleanUpper ||
              `INV-${s._id.slice(-6).toUpperCase()}` === cleanUpper ||
              s.items?.some((it: any) =>
                it.serialNumbers?.some((sn: string) => sn.toUpperCase() === cleanUpper)
              )
          ) || data.data[0];

        setFoundSale(matched);

        const initSelected: Record<string, any> = {};
        (matched.items || []).forEach((item: any, idx: number) => {
          initSelected[idx] = {
            selected: true,
            productId: item.product?._id || item.product,
            productTitle: item.productName || item.title || "Product Item",
            qty: item.quantity || 1,
            maxQty: item.quantity || 1,
            unitPrice: item.unitPrice || 0,
            condition: item.condition || "Used",
            serialNumber: item.serialNumber || (item.serialNumbers && item.serialNumbers[0]) || "",
          };
        });
        setReturnSelectedItems(initSelected);
      } else {
        setReturnError(`No completed sale invoice found matching "${searchInvoiceNumber}".`);
      }
    } catch {
      setReturnError("Failed to search invoice.");
    } finally {
      setSearchingInvoice(false);
    }
  };

  const handleAddReplacementItem = () => {
    if (!newReplacementProdId) return;
    const selectedProd = products.find((p) => p._id === newReplacementProdId);
    if (!selectedProd) return;

    const newItem = {
      productId: selectedProd._id,
      productName: selectedProd.name,
      condition: selectedProd.condition || "New",
      quantity: newReplacementQty,
      unitPrice: newReplacementPrice || selectedProd.sellingPrice || 0,
      serialNumbers: newReplacementSerial.trim() ? [newReplacementSerial.trim()] : [],
    };

    setReturnReplacementItems([...returnReplacementItems, newItem]);
    setNewReplacementProdId("");
    setNewReplacementSerial("");
    setNewReplacementQty(1);
    setNewReplacementPrice(0);
  };

  const handleRemoveReplacementItem = (index: number) => {
    setReturnReplacementItems(returnReplacementItems.filter((_, idx) => idx !== index));
  };

  const handleProcessInvoiceReturn = async () => {
    if (!foundSale) return;

    const returnedItems = Object.values(returnSelectedItems)
      .filter((it: any) => it.selected && it.qty > 0)
      .map((it: any) => ({
        productId: it.productId,
        quantity: it.qty,
        unitPrice: it.unitPrice,
        condition: it.condition,
        serialNumbers: it.serialNumber ? [it.serialNumber] : [],
      }));

    if (returnedItems.length === 0) {
      setReturnError("Please select at least 1 item to return.");
      return;
    }

    setSubmittingReturn(true);
    setReturnError("");

    try {
      const payload = {
        action: "INVOICE_RETURN",
        originalSaleId: foundSale._id,
        returnedItems,
        replacementItems: returnReplacementItems.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          condition: it.condition,
          serialNumbers: it.serialNumbers,
        })),
        processedBy: currentUser?.username || currentUser?.name || "system",
        notes: returnNotes || `Return/Exchange against Invoice ${foundSale.saleNumber}`,
      };

      const res = await fetch("/api/sales/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setReturnSuccessMsg("Return & Exchange processed successfully!");

        const returnedTotal = returnedItems.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);

        setCompletedReceiptData({
          invoiceNumber: data.data?.exchangeNumber || `RET-${foundSale.saleNumber || foundSale._id.slice(-6)}`,
          date: new Date(),
          locationName: locations.find((l) => l._id === selectedLocation)?.name || "Main Shop",
          cashierName: currentUser?.username || currentUser?.name || "Counter Staff",
          salesmanName: foundSale.salesmanName || "Direct Counter",
          customerName: foundSale.customerName || "Walk-in Customer",
          customerPhone: foundSale.customerPhone || "N/A",
          items: returnedItems.map((it: any) => ({
            productName: `[RETURN] ${it.productTitle || "Product Item"}`,
            condition: it.condition,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            lineTotal: it.unitPrice * it.quantity,
            serialNumbers: it.serialNumbers,
          })),
          subtotal: returnedTotal,
          discountAmount: 0,
          deliveryCharges: 0,
          totalAmount: returnedTotal,
          paidAmount: returnedTotal,
          changeDue: 0,
          payments: [{ method: "CASH_REFUND", amount: returnedTotal }],
        });

        setShowReceiptModal(true);
        setFoundSale(null);
        setSearchInvoiceNumber("");
        setReturnSelectedItems({});
        setReturnReplacementItems([]);
        setReturnNotes("");
        setTimeout(() => setReturnSuccessMsg(""), 4000);
      } else {
        setReturnError(data.error || "Failed to process return.");
      }
    } catch {
      setReturnError("Failed to process return.");
    } finally {
      setSubmittingReturn(false);
    }
  };

  const handleProcessRentalSwap = async () => {
    if (!rentalReturnProdId) {
      alert("Please select the returned rental product.");
      return;
    }
    if (rentalSecurityDeposit <= 0) {
      alert("Security deposit amount must be greater than 0.");
      return;
    }

    const netCredit = Math.max(0, rentalSecurityDeposit - rentalFeeDeducted) + rentalTopUpCash;

    setSubmittingReturn(true);
    setReturnError("");

    try {
      const selectedProd = products.find((p) => p._id === rentalReturnProdId);
      const payload = {
        action: "RENTAL_SWAP",
        locationId: selectedLocation,
        customerName: customerName || "Rental Customer",
        customerPhone: customerPhone || undefined,
        securityDepositPaid: rentalSecurityDeposit,
        rentalFeeDeducted: rentalFeeDeducted,
        additionalTopUpCash: rentalTopUpCash,
        returnedItem: {
          productId: rentalReturnProdId,
          quantity: 1,
          condition: rentalReturnCondition,
          serialNumber: rentalReturnSerial.trim() || undefined,
          agreedReturnValuation: netCredit,
        },
        replacementItems: returnReplacementItems.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          condition: it.condition,
          serialNumbers: it.serialNumbers,
        })),
        processedBy: currentUser?.username || currentUser?.name || "system",
        notes: returnNotes || `Rental Return & Game Swap (Deposit: Rs. ${rentalSecurityDeposit}, Rent Fee: Rs. ${rentalFeeDeducted}, Top-up Cash: Rs. ${rentalTopUpCash})`,
      };

      const res = await fetch("/api/sales/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setReturnSuccessMsg("Rental Return & Game Swap processed successfully!");

        const repTotal = returnReplacementItems.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);

        setCompletedReceiptData({
          invoiceNumber: data.data?.returnTxNumber || "RNT-1001",
          date: new Date(),
          locationName: locations.find((l) => l._id === selectedLocation)?.name || "Main Shop",
          cashierName: currentUser?.username || currentUser?.name || "Counter Staff",
          salesmanName: "Direct Counter",
          customerName: customerName || "Rental Customer",
          customerPhone: customerPhone || "N/A",
          items: [
            {
              productName: `[RENTAL DVD RETURNED] ${selectedProd?.name || "DVD Game"} (Deposit: Rs. ${rentalSecurityDeposit.toLocaleString()} - Rent: Rs. ${rentalFeeDeducted.toLocaleString()} + Top-up Cash: Rs. ${rentalTopUpCash.toLocaleString()})`,
              condition: rentalReturnCondition,
              quantity: 1,
              unitPrice: netCredit,
              lineTotal: netCredit,
            },
            ...returnReplacementItems.map((it: any) => ({
              productName: `[ISSUED REPLACEMENT] ${it.productName}`,
              condition: it.condition,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              lineTotal: it.unitPrice * it.quantity,
              serialNumbers: it.serialNumbers,
            })),
          ],
          subtotal: repTotal,
          discountAmount: 0,
          deliveryCharges: 0,
          totalAmount: Math.max(0, repTotal - netCredit),
          paidAmount: Math.max(0, repTotal - netCredit),
          changeDue: 0,
          payments: [{ method: "RENTAL_CREDIT_SETTLEMENT", amount: netCredit }],
        });

        setShowReceiptModal(true);
        setRentalReturnProdId("");
        setRentalReturnSerial("");
        setRentalSecurityDeposit(0);
        setRentalFeeDeducted(0);
        setRentalTopUpCash(0);
        setReturnReplacementItems([]);
        setReturnNotes("");
        setTimeout(() => setReturnSuccessMsg(""), 4000);
      } else {
        setReturnError(data.error || "Failed to process rental swap.");
      }
    } catch {
      setReturnError("Failed to process rental swap.");
    } finally {
      setSubmittingReturn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Workspace Top Header & Mode Selectors */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <ShoppingCart className="w-6 h-6 text-indigo-400" />
              Sales Workspace
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Context-driven smart forms for sales, billing queues, online orders, advance deposits & trade-ins.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => handleModeChange("POS")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === "POS"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>New Sale (POS)</span>
            </button>

            <button
              onClick={() => handleModeChange("QUEUE")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === "QUEUE"
                  ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pending Queue</span>
            </button>

            <button
              onClick={() => handleModeChange("ONLINE")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === "ONLINE"
                  ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Online Orders</span>
            </button>

            <button
              onClick={() => handleModeChange("ADVANCE")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === "ADVANCE"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Advance Bookings</span>
            </button>

            <button
              onClick={() => handleModeChange("RETURNS")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === "RETURNS"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Returns & Swaps</span>
            </button>

            <button
              onClick={() => handleModeChange("TRADEIN")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === "TRADEIN"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <Handshake className="w-3.5 h-3.5" />
              <span>Direct Trade-In</span>
            </button>
          </div>
        </div>

        {/* Common Attribution & Location Header */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Store Location *
            </label>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {locations.map((loc) => (
                <option key={loc._id} value={loc._id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Customer Name
            </label>
            <input
              type="text"
              placeholder="e.g. Imran Khan"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Customer Phone
            </label>
            <input
              type="text"
              placeholder="e.g. 03001234567"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Salesman Attribution
            </label>
            <select
              value={selectedSalesman}
              onChange={(e) => setSelectedSalesman(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="">Direct Counter / Self</option>
              {salesmen.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} (@{s.username})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic Contextual Form Area */}
        {mode === "POS" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Search products by name, SKU, or scan barcode..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleResolveBarcode(productSearch, "POS");
                        setProductSearch("");
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveScanTarget("POS");
                    setShowCameraModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shrink-0"
                  title="Scan product via Phone or Webcam Camera"
                >
                  <Camera className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Mobile Scan</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[460px] overflow-y-auto pr-1">
                {products
                  .filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()))
                  .map((product) => (
                    <div
                      key={product._id}
                      onClick={() => addToCart(product)}
                      className="bg-slate-950 border border-slate-800 hover:border-indigo-500 p-3 rounded-xl cursor-pointer transition flex flex-col justify-between"
                    >
                      <div>
                        <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/40">
                          {product.sku}
                        </span>
                        <h4 className="text-xs font-bold text-slate-100 mt-1 line-clamp-2">
                          {product.name}
                        </h4>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs font-extrabold text-emerald-400">
                          Rs. {product.sellingPrice?.toLocaleString()}
                        </span>
                        <Plus className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-indigo-400" />
                  POS Cart Items ({cartItems.length})
                </h3>

                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {cartItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="flex-1">
                        <div className="font-semibold text-slate-200">{item.product.name}</div>
                        <div className="text-[11px] text-slate-400">
                          Rs. {item.unitPrice?.toLocaleString()} x {item.quantity}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-100">
                          Rs. {(item.unitPrice * item.quantity).toLocaleString()}
                        </span>
                        <button
                          onClick={() => removeFromCart(idx)}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal</span>
                  <span>Rs. {cartSubtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-400 items-center">
                  <span>Header Discount</span>
                  <input
                    type="number"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(Number(e.target.value))}
                    className="w-20 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-right text-xs"
                  />
                </div>
                {/* Single vs Split Payment Toggle */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
                      Payment Type:
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsSplitPayment(false)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition ${
                          !isSplitPayment
                            ? "bg-indigo-600 border-indigo-500 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Single
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsSplitPayment(true);
                          if (splitCash === 0 && splitCard === 0 && splitBank === 0) {
                            setSplitCash(cartTotal);
                          }
                        }}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition ${
                          isSplitPayment
                            ? "bg-cyan-600 border-cyan-500 text-white shadow-md shadow-cyan-600/30"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        🔀 Split Payment
                      </button>
                    </div>
                  </div>

                  {!isSplitPayment ? (
                    <div className="flex justify-between text-slate-400 items-center">
                      <span>Payment Method</span>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-semibold"
                      >
                        <option value="CASH">💵 Cash</option>
                        <option value="CARD">💳 Credit/Debit Card</option>
                        <option value="BANK_TRANSFER">🏦 Bank Transfer / Online</option>
                      </select>
                    </div>
                  ) : (
                    <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl space-y-2 text-xs">
                      <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
                        Split Payment Breakdown
                      </div>

                      {/* Cash Input */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-300 font-medium flex items-center gap-1">
                          💵 Cash (PKR):
                        </span>
                        <input
                          type="number"
                          value={splitCash}
                          onChange={(e) => setSplitCash(Number(e.target.value))}
                          className="w-28 bg-slate-950 border border-slate-700 text-emerald-400 font-bold rounded px-2 py-1 text-right text-xs"
                        />
                      </div>

                      {/* Card Input */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-300 font-medium flex items-center gap-1">
                          💳 Card (PKR):
                        </span>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            placeholder="Card Ref #"
                            value={cardRef}
                            onChange={(e) => setCardRef(e.target.value)}
                            className="w-20 bg-slate-950 border border-slate-800 text-slate-300 rounded px-1.5 py-1 text-[10px]"
                          />
                          <input
                            type="number"
                            value={splitCard}
                            onChange={(e) => setSplitCard(Number(e.target.value))}
                            className="w-28 bg-slate-950 border border-slate-700 text-indigo-400 font-bold rounded px-2 py-1 text-right text-xs"
                          />
                        </div>
                      </div>

                      {/* Bank Input */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-300 font-medium flex items-center gap-1">
                          🏦 Online/Bank (PKR):
                        </span>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            placeholder="IBFT Ref #"
                            value={bankRef}
                            onChange={(e) => setBankRef(e.target.value)}
                            className="w-20 bg-slate-950 border border-slate-800 text-slate-300 rounded px-1.5 py-1 text-[10px]"
                          />
                          <input
                            type="number"
                            value={splitBank}
                            onChange={(e) => setSplitBank(Number(e.target.value))}
                            className="w-28 bg-slate-950 border border-slate-700 text-cyan-400 font-bold rounded px-2 py-1 text-right text-xs"
                          />
                        </div>
                      </div>

                      {/* Summary Calculation */}
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between font-bold">
                        <span className="text-slate-400">Total Allocated:</span>
                        <span
                          className={
                            splitCash + splitCard + splitBank >= cartTotal
                              ? "text-emerald-400"
                              : "text-rose-400 animate-pulse"
                          }
                        >
                          Rs. {(splitCash + splitCard + splitBank).toLocaleString()} / {cartTotal.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-800 pt-2 flex justify-between font-extrabold text-sm text-emerald-400">
                  <span>Total Amount</span>
                  <span>Rs. {cartTotal.toLocaleString()}</span>
                </div>

                <button
                  onClick={handleCompletePOS}
                  disabled={submitting}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-xl font-bold transition shadow-lg shadow-indigo-600/30"
                >
                  {submitting ? "Processing..." : "Complete & Print Invoice"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mode: QUEUE */}
        {mode === "QUEUE" && (
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              Warehouse Pending Billing Queue
            </h3>

            {loadingQueue ? (
              <div className="text-xs text-slate-400">Loading pending sales...</div>
            ) : pendingSales.length === 0 ? (
              <div className="text-xs text-slate-500 py-6 text-center">
                No pending billing sales in queue.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingSales.map((sale) => (
                  <div
                    key={sale._id}
                    className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-400">{sale.saleNumber}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          sale.status === "COMPLETED"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}>
                          {sale.status}
                        </span>
                      </div>
                      <div className="text-slate-300 font-semibold mt-0.5">
                        Customer: {sale.customerName || "Walk-in"} • Salesman:{" "}
                        <span className="text-indigo-400 font-bold">{sale.salesmanName || "Direct Counter"}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {sale.items?.length} line item(s) • Total: Rs. {sale.totalAmount?.toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setReassignSale(sale);
                          setTargetSalesmanId(sale.salesman?._id || sale.salesman || "");
                          setShowReassignModal(true);
                        }}
                        className="bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1"
                      >
                        ✏️ Edit Salesman
                      </button>
                      {sale.status !== "COMPLETED" && (
                        <button
                          onClick={() => alert(`Reviewing sale ${sale.saleNumber}`)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-bold"
                        >
                          Verify & Complete
                        </button>
                      )}
                      <button
                        onClick={() => handleCancelQueueSale(sale._id, sale.saleNumber)}
                        className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1"
                      >
                        🗑️ Cancel / Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Mode: ONLINE ORDERS */}
        {mode === "ONLINE" && (
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              Online Order Dispatch & Rider Assignment Form
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                  Customer & Shipping Information
                </h4>

                {/* Barcode & Mobile Camera Scanner Box */}
                <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Barcode className="w-3.5 h-3.5 text-cyan-400" />
                      Quick Barcode / Mobile Camera Scanner
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Scan barcode or SKU..."
                      value={scanBarcodeInput}
                      onChange={(e) => setScanBarcodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleResolveBarcode(scanBarcodeInput, "ONLINE");
                        }
                      }}
                      className="flex-1 bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleResolveBarcode(scanBarcodeInput, "ONLINE")}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 font-bold rounded-lg text-xs border border-slate-700"
                    >
                      Scan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveScanTarget("ONLINE");
                        setShowCameraModal(true);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shrink-0"
                      title="Scan product via Phone Camera"
                    >
                      <Camera className="w-3.5 h-3.5 shrink-0" />
                      <span>Mobile</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Select Product *</label>
                  <select
                    value={onlineProductId}
                    onChange={(e) => {
                      setOnlineProductId(e.target.value);
                      const p = products.find((prod) => prod._id === e.target.value);
                      if (p) setOnlinePrice(p.sellingPrice);
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    <option value="">-- Choose Product --</option>
                    {products.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} - Rs. {p.sellingPrice?.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Delivery Address *</label>
                  <textarea
                    rows={2}
                    placeholder="House #, Street, Area, City"
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                  />
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                  Courier & Delivery Details
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Courier / Rider Service</label>
                    <select
                      value={courierName}
                      onChange={(e) => setCourierName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                    >
                      <option value="Bykea">Bykea</option>
                      <option value="Rider Ali (Own)">Rider Ali (Own Staff)</option>
                      <option value="TCS">TCS Express</option>
                      <option value="Trax">Trax Courier</option>
                      <option value="Leopards">Leopards Courier</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Rider / Driver Name</label>
                    <input
                      type="text"
                      placeholder="Driver Name"
                      value={riderName}
                      onChange={(e) => setRiderName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Tracking Number</label>
                    <input
                      type="text"
                      placeholder="e.g. BYK-99812"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Delivery Charges (PKR)</label>
                    <input
                      type="number"
                      placeholder="250"
                      value={deliveryCharges}
                      onChange={(e) => setDeliveryCharges(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-bold"
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleOnlineSubmit}
              disabled={submitting}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-2.5 rounded-xl font-bold transition shadow-lg shadow-cyan-600/30 text-xs"
            >
              {submitting ? "Creating Order..." : "Create Online Order & Generate Dispatch Ticket"}
            </button>
          </div>
        )}

        {/* Mode: ADVANCE BOOKINGS */}
        {mode === "ADVANCE" && (
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-400" />
              Multi-Item Advance Booking & Stock Reservation Form
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Add Products & Booking List */}
              <div className="lg:col-span-7 bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-4">
                <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                  Booked Items List ({advanceItems.length})
                </h4>

                {/* Barcode & Mobile Camera Scanner Box */}
                <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Barcode className="w-3.5 h-3.5 text-purple-400" />
                      Quick Barcode / Mobile Camera Scanner
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Scan barcode or SKU to add item..."
                      value={scanBarcodeInput}
                      onChange={(e) => setScanBarcodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleResolveBarcode(scanBarcodeInput, "ADVANCE");
                        }
                      }}
                      className="flex-1 bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleResolveBarcode(scanBarcodeInput, "ADVANCE")}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-purple-400 font-bold rounded-lg text-xs border border-slate-700"
                    >
                      Scan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveScanTarget("ADVANCE");
                        setShowCameraModal(true);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shrink-0"
                      title="Scan product via Phone Camera"
                    >
                      <Camera className="w-3.5 h-3.5 shrink-0" />
                      <span>Mobile</span>
                    </button>
                  </div>
                </div>

                {/* Add Item Form Controls */}
                <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl space-y-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Select Product to Add *</label>
                    <select
                      value={newAdvanceProdId}
                      onChange={(e) => {
                        setNewAdvanceProdId(e.target.value);
                        const p = products.find((prod) => prod._id === e.target.value);
                        if (p) setNewAdvancePrice(p.sellingPrice || 0);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                    >
                      <option value="">-- Choose Product (e.g. FC25 / PS5 Slim) --</option>
                      {products.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name} - Rs. {p.sellingPrice?.toLocaleString()} ({p.condition || "New"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={newAdvanceQty}
                        onChange={(e) => setNewAdvanceQty(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Agreed Price (PKR)</label>
                      <input
                        type="number"
                        placeholder="Price"
                        value={newAdvancePrice}
                        onChange={(e) => setNewAdvancePrice(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 font-bold text-emerald-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Serial (Optional)</label>
                      <input
                        type="text"
                        placeholder="S/N"
                        value={newAdvanceSerial}
                        onChange={(e) => setNewAdvanceSerial(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 font-mono text-[11px]"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddAdvanceItem}
                    disabled={!newAdvanceProdId}
                    className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item to Booking List
                  </button>
                </div>

                {/* Booking List Table */}
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 text-slate-400 uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Product</th>
                        <th className="p-2.5 text-center">Qty</th>
                        <th className="p-2.5 text-right">Agreed Price</th>
                        <th className="p-2.5 text-right">Line Total</th>
                        <th className="p-2.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-950">
                      {advanceItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-slate-500">
                            No items added to advance booking list yet. Use the dropdown or barcode scanner above.
                          </td>
                        </tr>
                      ) : (
                        advanceItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/50">
                            <td className="p-2.5">
                              <div className="font-semibold text-slate-200">{item.productName}</div>
                              {item.serialNumber && (
                                <div className="text-[10px] text-amber-400 font-mono">S/N: {item.serialNumber}</div>
                              )}
                            </td>
                            <td className="p-2.5 text-center font-bold">{item.quantity}</td>
                            <td className="p-2.5 text-right">Rs. {item.unitPrice?.toLocaleString()}</td>
                            <td className="p-2.5 text-right font-bold text-slate-100">
                              Rs. {(item.unitPrice * item.quantity).toLocaleString()}
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveAdvanceItem(idx)}
                                className="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-rose-500/10"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right Column: Customer Deposit & Financial Summary */}
              <div className="lg:col-span-5 bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                    Advance Payment & Receipt Summary
                  </h4>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Advance Deposit Received (PKR) *</label>
                    <input
                      type="number"
                      placeholder="e.g. 7000 or 15000"
                      value={advanceDeposit}
                      onChange={(e) => setAdvanceDeposit(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-bold text-purple-400 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Expected Pickup / Delivery Date</label>
                    <input
                      type="date"
                      value={expectedDate}
                      onChange={(e) => setExpectedDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                    />
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-xs space-y-2.5">
                    <div className="flex justify-between text-slate-400">
                      <span>Total Booked Items ({advanceItems.length})</span>
                      <span className="font-bold text-slate-200">Rs. {advanceTotalPrice.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-purple-400 font-semibold">
                      <span>Advance Deposit Paid Today</span>
                      <span>- Rs. {advanceDeposit.toLocaleString()}</span>
                    </div>
                    <div className="border-t border-slate-800 pt-2 flex justify-between font-extrabold text-sm text-amber-400">
                      <span>Remaining Balance Due</span>
                      <span>Rs. {Math.max(0, advanceTotalPrice - advanceDeposit).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleAdvanceSubmit}
                  disabled={submitting || advanceItems.length === 0}
                  className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white py-3 rounded-xl font-bold transition shadow-lg shadow-purple-600/30 text-xs uppercase tracking-wider flex items-center justify-center gap-2 mt-4"
                >
                  <Calendar className="w-4 h-4" />
                  {submitting ? "Saving Booking..." : "Save Advance Booking Ticket"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mode: RETURNS & EXCHANGES */}
        {mode === "RETURNS" && (
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-blue-400" />
                Returns, Swaps & Rental Settlement Workspace
              </h3>

              {/* Sub-Mode Selector */}
              <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setReturnSubMode("INVOICE")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    returnSubMode === "INVOICE"
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  Invoice Return & Exchange
                </button>
                <button
                  type="button"
                  onClick={() => setReturnSubMode("RENTAL_SWAP")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    returnSubMode === "RENTAL_SWAP"
                      ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  🎮 Rental Deposit Return & Game Swap
                </button>
              </div>
            </div>

            {returnSuccessMsg && (
              <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{returnSuccessMsg}</span>
              </div>
            )}

            {returnError && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{returnError}</span>
              </div>
            )}

            {returnSubMode === "INVOICE" && (
              <div className="space-y-6">
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Original Invoice Lookup *
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Enter or scan Invoice Number (e.g. INV-C89C06 or SALE-...)"
                      value={searchInvoiceNumber}
                      onChange={(e) => setSearchInvoiceNumber(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSearchInvoice();
                        }
                      }}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleSearchInvoice}
                      disabled={searchingInvoice}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg font-bold text-xs disabled:opacity-50 transition"
                    >
                      {searchingInvoice ? "Searching..." : "Search Invoice"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {returnSubMode === "RENTAL_SWAP" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Returned DVD & Deposit Inputs */}
                <div className="lg:col-span-7 bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-4">
                  <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                    Returned Rental DVD & Deposit Calculation
                  </h4>

                  {/* Barcode & Mobile Camera Scanner Box for Returned DVD */}
                  <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Barcode className="w-3.5 h-3.5 text-purple-400" />
                        Quick Barcode / Mobile Camera Scanner (Returned Item)
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Scan returned DVD barcode or SKU..."
                        value={scanBarcodeInput}
                        onChange={(e) => setScanBarcodeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleResolveBarcode(scanBarcodeInput, "RENTAL_IN");
                          }
                        }}
                        className="flex-1 bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleResolveBarcode(scanBarcodeInput, "RENTAL_IN")}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-purple-400 font-bold rounded-lg text-xs border border-slate-700"
                      >
                        Scan
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveScanTarget("RENTAL_IN");
                          setShowCameraModal(true);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shrink-0"
                        title="Scan returned DVD via Phone Camera"
                      >
                        <Camera className="w-3.5 h-3.5 shrink-0" />
                        <span>Mobile</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Select Returned Rental Product *</label>
                    <select
                      value={rentalReturnProdId}
                      onChange={(e) => setRentalReturnProdId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                    >
                      <option value="">-- Choose Returned DVD Game --</option>
                      {products.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name} ({p.condition || "Used"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Return Stock Condition</label>
                      <select
                        value={rentalReturnCondition}
                        onChange={(e) => setRentalReturnCondition(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                      >
                        <option value="Used">Used / Rent Pool</option>
                        <option value="Like New">Like New</option>
                        <option value="Defective">Defective / Damaged</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Serial Number (Optional)</label>
                      <input
                        type="text"
                        placeholder="S/N"
                        value={rentalReturnSerial}
                        onChange={(e) => setRentalReturnSerial(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Security Deposit Paid (PKR) *</label>
                      <input
                        type="number"
                        placeholder="e.g. 12500"
                        value={rentalSecurityDeposit || ""}
                        onChange={(e) => setRentalSecurityDeposit(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Rental Usage Fee Cut (PKR) *</label>
                      <input
                        type="number"
                        placeholder="e.g. 5000"
                        value={rentalFeeDeducted || ""}
                        onChange={(e) => setRentalFeeDeducted(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-rose-400 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Additional Cash Top-Up (PKR)</label>
                      <input
                        type="number"
                        placeholder="e.g. 5500"
                        value={rentalTopUpCash || ""}
                        onChange={(e) => setRentalTopUpCash(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-cyan-400 font-bold"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-between text-xs">
                    <span className="text-purple-300 font-semibold">Total Available Credit for Swap:</span>
                    <span className="text-purple-400 font-extrabold text-sm font-mono">
                      Rs. {(Math.max(0, rentalSecurityDeposit - rentalFeeDeducted) + rentalTopUpCash).toLocaleString()}
                    </span>
                  </div>

                  {/* Issued Game CD Replacement Input */}
                  <div className="border-t border-slate-800 pt-4 space-y-3">
                    <h5 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                      Add Issued Replacement Game CD (Item OUT)
                    </h5>

                    {/* Barcode & Mobile Camera Scanner Box for Replacement Game */}
                    <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Barcode className="w-3.5 h-3.5 text-cyan-400" />
                          Quick Barcode / Mobile Camera Scanner (Replacement Game)
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Scan replacement game barcode or SKU..."
                          value={scanBarcodeInput}
                          onChange={(e) => setScanBarcodeInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleResolveBarcode(scanBarcodeInput, "RENTAL_OUT");
                            }
                          }}
                          className="flex-1 bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleResolveBarcode(scanBarcodeInput, "RENTAL_OUT")}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 font-bold rounded-lg text-xs border border-slate-700"
                        >
                          Scan
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveScanTarget("RENTAL_OUT");
                            setShowCameraModal(true);
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shrink-0"
                          title="Scan replacement game via Phone Camera"
                        >
                          <Camera className="w-3.5 h-3.5 shrink-0" />
                          <span>Mobile</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-5">
                        <select
                          value={newReplacementProdId}
                          onChange={(e) => {
                            setNewReplacementProdId(e.target.value);
                            const p = products.find((prod) => prod._id === e.target.value);
                            if (p) setNewReplacementPrice(p.sellingPrice || 0);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                        >
                          <option value="">-- Select Game CD --</option>
                          {products.map((p) => (
                            <option key={p._id} value={p._id}>
                              {p.name} - Rs. {p.sellingPrice?.toLocaleString()}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <input
                          type="number"
                          placeholder="Agreed Price"
                          value={newReplacementPrice || ""}
                          onChange={(e) => setNewReplacementPrice(Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-bold text-emerald-400"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <button
                          type="button"
                          onClick={handleAddReplacementItem}
                          disabled={!newReplacementProdId}
                          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add to Swap
                        </button>
                      </div>
                    </div>

                    {/* Replacement Table */}
                    {returnReplacementItems.length > 0 && (
                      <div className="border border-slate-800 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs text-slate-300">
                          <thead className="bg-slate-900 text-slate-400 uppercase text-[10px]">
                            <tr>
                              <th className="p-2">Issued Game</th>
                              <th className="p-2 text-right">Agreed Price</th>
                              <th className="p-2 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 bg-slate-950">
                            {returnReplacementItems.map((rep, idx) => (
                              <tr key={idx}>
                                <td className="p-2 font-semibold text-slate-200">{rep.productName}</td>
                                <td className="p-2 text-right font-bold text-emerald-400">
                                  Rs. {rep.unitPrice?.toLocaleString()}
                                </td>
                                <td className="p-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveReplacementItem(idx)}
                                    className="text-rose-400 hover:text-rose-300 p-1"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Settlement Financial Summary */}
                <div className="lg:col-span-5 bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                      Net Settlement Summary
                    </h4>

                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-xs space-y-2.5">
                      <div className="flex justify-between text-slate-400">
                        <span>Security Deposit Received</span>
                        <span className="font-bold text-emerald-400">+ Rs. {rentalSecurityDeposit.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Less Rental Fee Cut</span>
                        <span className="font-bold text-rose-400">- Rs. {rentalFeeDeducted.toLocaleString()}</span>
                      </div>
                      {rentalTopUpCash > 0 && (
                        <div className="flex justify-between text-cyan-400">
                          <span>Additional Cash Top-Up Deposit</span>
                          <span className="font-bold">+ Rs. {rentalTopUpCash.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="border-t border-slate-800 pt-2 flex justify-between font-semibold text-purple-300">
                        <span>Total Available Credit for Swap</span>
                        <span>Rs. {(Math.max(0, rentalSecurityDeposit - rentalFeeDeducted) + rentalTopUpCash).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Issued Game Replacement Total</span>
                        <span className="font-bold text-slate-200">
                          - Rs. {returnReplacementItems.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="border-t border-slate-800 pt-2 flex justify-between font-extrabold text-sm text-cyan-400">
                        <span>Net Cash Amount Payable</span>
                        <span>
                          Rs. {Math.max(
                            0,
                            returnReplacementItems.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0) -
                              (Math.max(0, rentalSecurityDeposit - rentalFeeDeducted) + rentalTopUpCash)
                          ).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleProcessRentalSwap}
                    disabled={submittingReturn || !rentalReturnProdId || rentalSecurityDeposit <= 0}
                    className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white py-3 rounded-xl font-bold transition shadow-lg shadow-purple-600/30 text-xs uppercase tracking-wider flex items-center justify-center gap-2 mt-4"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    {submittingReturn ? "Processing Rental Settlement..." : "Complete Rental Swap & Print Slip"}
                  </button>
                </div>
              </div>
            )}

            {/* Found Invoice Metadata & Items Form */}
            {foundSale && (
              <div className="space-y-6 border-t border-slate-800 pt-6">
                {/* Header Metadata */}
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl text-xs space-y-2">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <span className="font-bold text-slate-200">
                      Invoice #: {foundSale.invoiceNumber || foundSale.saleNumber}
                    </span>
                    <span className="text-slate-400">
                      Date: {new Date(foundSale.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-slate-400">
                    <div>
                      Customer: <strong className="text-slate-200">{foundSale.customerName || "Walk-in Customer"}</strong>
                    </div>
                    <div>
                      Salesman: <strong className="text-slate-200">{foundSale.salesmanName || "Direct Counter"}</strong>
                    </div>
                    <div>
                      Original Paid: <strong className="text-emerald-400 font-mono">Rs. {(foundSale.totalAmount || 0).toLocaleString()}</strong>
                    </div>
                  </div>
                </div>

                {/* Return Items Selection */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Select Items To Return / Credit:
                  </h4>
                  <div className="overflow-x-auto border border-slate-800 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                        <tr>
                          <th className="p-3">Return</th>
                          <th className="p-3">Product Item</th>
                          <th className="p-3">Condition</th>
                          <th className="p-3 text-center">Qty to Return</th>
                          <th className="p-3 text-right">Unit Price</th>
                          <th className="p-3 text-right">Return Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {(foundSale.items || []).map((item: any, idx: number) => {
                          const stateItem = returnSelectedItems[idx] || {};
                          return (
                            <tr key={idx} className="hover:bg-slate-950/40">
                              <td className="p-3">
                                <input
                                  type="checkbox"
                                  checked={stateItem.selected || false}
                                  onChange={(e) =>
                                    setReturnSelectedItems({
                                      ...returnSelectedItems,
                                      [idx]: { ...stateItem, selected: e.target.checked },
                                    })
                                  }
                                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
                                />
                              </td>
                              <td className="p-3 font-sans font-medium text-slate-200">
                                {stateItem.productTitle}
                              </td>
                              <td className="p-3 text-slate-400 font-sans">{stateItem.condition}</td>
                              <td className="p-3 text-center">
                                <input
                                  type="number"
                                  min={1}
                                  max={stateItem.maxQty || 1}
                                  value={stateItem.qty || 1}
                                  onChange={(e) =>
                                    setReturnSelectedItems({
                                      ...returnSelectedItems,
                                      [idx]: {
                                        ...stateItem,
                                        qty: Math.min(
                                          stateItem.maxQty || 1,
                                          Math.max(1, parseInt(e.target.value) || 1)
                                        ),
                                      },
                                    })
                                  }
                                  className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-center text-xs text-slate-200"
                                />
                              </td>
                              <td className="p-3 text-right text-slate-300">
                                Rs. {(stateItem.unitPrice || 0).toLocaleString()}
                              </td>
                              <td className="p-3 text-right text-emerald-400 font-bold">
                                Rs. {((stateItem.qty || 1) * (stateItem.unitPrice || 0)).toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Replacement Items (For Swaps / Exchanges) */}
                <div className="space-y-3 bg-slate-950 border border-slate-800 p-4 rounded-xl">
                  <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                    Add Replacement Product (Optional - For Exchange / Swap)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <select
                        value={newReplacementProdId}
                        onChange={(e) => {
                          setNewReplacementProdId(e.target.value);
                          const p = products.find((x) => x._id === e.target.value);
                          if (p) setNewReplacementPrice(p.sellingPrice || 0);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                      >
                        <option value="">-- Choose Replacement Item --</option>
                        {products.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name} (Rs. {p.sellingPrice})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <input
                        type="text"
                        placeholder="Serial Number"
                        value={newReplacementSerial}
                        onChange={(e) => setNewReplacementSerial(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleAddReplacementItem}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg px-3 py-2 text-xs"
                    >
                      + Add Replacement
                    </button>
                  </div>

                  {returnReplacementItems.length > 0 && (
                    <div className="space-y-2 pt-2">
                      {returnReplacementItems.map((rep, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-200">{rep.productName}</span>{" "}
                            <span className="text-slate-400">({rep.condition})</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-blue-400">
                              Rs. {(rep.unitPrice * rep.quantity).toLocaleString()}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveReplacementItem(idx)}
                              className="text-red-400 hover:text-red-300"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Financial Balance Summary */}
                {(() => {
                  const retVal = Object.values(returnSelectedItems)
                    .filter((it: any) => it.selected)
                    .reduce((acc: number, it: any) => acc + (it.qty || 1) * (it.unitPrice || 0), 0);

                  const repVal = returnReplacementItems.reduce(
                    (acc, it) => acc + it.unitPrice * it.quantity,
                    0
                  );

                  const netDiff = repVal - retVal;

                  return (
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2 text-xs">
                      <div className="flex justify-between text-slate-400">
                        <span>Return Credit Total:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          Rs. {retVal.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Replacement Items Total:</span>
                        <span className="font-mono font-bold text-blue-400">
                          Rs. {repVal.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-black border-t border-slate-800 pt-2 text-slate-100">
                        <span>Settlement Balance:</span>
                        <span
                          className={`font-mono ${
                            netDiff > 0
                              ? "text-rose-400"
                              : netDiff < 0
                              ? "text-emerald-400"
                              : "text-slate-300"
                          }`}
                        >
                          {netDiff > 0
                            ? `Customer Pays +Rs. ${netDiff.toLocaleString()}`
                            : netDiff < 0
                            ? `Refund Customer Rs. ${Math.abs(netDiff).toLocaleString()}`
                            : "Even Exchange (No Cash Changed)"}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <button
                  type="button"
                  onClick={handleProcessInvoiceReturn}
                  disabled={submittingReturn}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition text-xs shadow-lg shadow-blue-600/30 disabled:opacity-50"
                >
                  {submittingReturn
                    ? "Processing Return..."
                    : "Complete Return / Swap & Print Slip"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Mode: DIRECT TRADE-IN */}
        {mode === "TRADEIN" && (
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Handshake className="w-4 h-4 text-emerald-400" />
              Direct Walk-In Trade-In (Swap) Form
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  Item Given by Customer (IN)
                </h4>

                {/* Barcode & Mobile Camera Scanner Box for Intake Item */}
                <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Barcode className="w-3.5 h-3.5 text-amber-400" />
                      Quick Barcode / Mobile Camera Scanner
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Scan trade-in product barcode..."
                      value={scanBarcodeInput}
                      onChange={(e) => setScanBarcodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleResolveBarcode(scanBarcodeInput, "TRADEIN_IN");
                        }
                      }}
                      className="flex-1 bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleResolveBarcode(scanBarcodeInput, "TRADEIN_IN")}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded-lg text-xs border border-slate-700"
                    >
                      Scan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveScanTarget("TRADEIN_IN");
                        setShowCameraModal(true);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shrink-0"
                      title="Scan product via Phone Camera"
                    >
                      <Camera className="w-3.5 h-3.5 shrink-0" />
                      <span>Mobile</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Select Product *</label>
                  <select
                    value={tradeInProductId}
                    onChange={(e) => setTradeInProductId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    <option value="">-- Choose Product --</option>
                    {products.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Condition</label>
                    <select
                      value={tradeInCondition}
                      onChange={(e) => setTradeInCondition(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                    >
                      <option value="Used">Used</option>
                      <option value="Refurbished">Refurbished</option>
                      <option value="Defective">Defective</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Serial Number</label>
                    <input
                      type="text"
                      placeholder="Serial #"
                      value={tradeInSerial}
                      onChange={(e) => setTradeInSerial(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Agreed Trade-In Value (PKR) *</label>
                  <input
                    type="number"
                    placeholder="e.g. 40000"
                    value={tradeInValue}
                    onChange={(e) => setTradeInValue(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-bold text-amber-400"
                  />
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  Replacement Item Issued (OUT)
                </h4>

                {/* Barcode & Mobile Camera Scanner Box for Replacement Item */}
                <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Barcode className="w-3.5 h-3.5 text-emerald-400" />
                      Quick Barcode / Mobile Camera Scanner
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Scan replacement barcode..."
                      value={scanBarcodeInput}
                      onChange={(e) => setScanBarcodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleResolveBarcode(scanBarcodeInput, "TRADEIN_OUT");
                        }
                      }}
                      className="flex-1 bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleResolveBarcode(scanBarcodeInput, "TRADEIN_OUT")}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold rounded-lg text-xs border border-slate-700"
                    >
                      Scan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveScanTarget("TRADEIN_OUT");
                        setShowCameraModal(true);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shrink-0"
                      title="Scan product via Phone Camera"
                    >
                      <Camera className="w-3.5 h-3.5 shrink-0" />
                      <span>Mobile</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Select Replacement Product</label>
                  <select
                    value={replacementProductId}
                    onChange={(e) => setReplacementProductId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    <option value="">-- Choose Replacement --</option>
                    {products.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} - Rs. {p.sellingPrice?.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                {replacementProductId && (
                  <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg text-xs space-y-1">
                    <div className="flex justify-between text-slate-300">
                      <span>Replacement Price</span>
                      <span>
                        Rs.{" "}
                        {products
                          .find((p) => p._id === replacementProductId)
                          ?.sellingPrice?.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Less Trade-In Credit</span>
                      <span>- Rs. {tradeInValue.toLocaleString()}</span>
                    </div>
                    <div className="border-t border-slate-800 pt-1 flex justify-between font-extrabold text-emerald-400">
                      <span>Net Customer Difference</span>
                      <span>
                        Rs.{" "}
                        {(
                          (products.find((p) => p._id === replacementProductId)?.sellingPrice || 0) -
                          tradeInValue
                        ).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleTradeInSubmit}
              disabled={submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl font-bold transition shadow-lg shadow-emerald-600/30 text-xs"
            >
              {submitting ? "Saving Trade-In..." : "Save Trade-In & Print Receipt"}
            </button>
          </div>
        )}

        {/* Mobile / Webcam Camera Barcode & Serial Scanner Modal */}
        <CameraBarcodeScannerModal
          isOpen={showCameraModal}
          onClose={() => setShowCameraModal(false)}
          onScanSuccess={(scannedCode) => {
            setShowCameraModal(false);
            handleResolveBarcode(scannedCode);
          }}
        />

        {/* Printable Thermal Receipt Modal */}
        {showReceiptModal && completedReceiptData && (
          <ThermalReceiptModal
            receiptData={completedReceiptData}
            onClose={() => setShowReceiptModal(false)}
          />
        )}

        {/* Re-assign Salesman Modal */}
        {showReassignModal && reassignSale && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-400" />
                  Edit Salesman for Order #{reassignSale.saleNumber}
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                Re-attribute this sale to credit the salesman's sales & profit report:
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Select Salesman Attribution:
                </label>
                <select
                  value={targetSalesmanId}
                  onChange={(e) => setTargetSalesmanId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold"
                >
                  <option value="">Direct Counter / Self</option>
                  {salesmen.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name} (@{s.username})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowReassignModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReassignSalesman}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition"
                >
                  Save Attribution
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function SalesWorkspacePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-slate-100 p-6">Loading Sales Workspace...</div>}>
      <SalesWorkspaceContent />
    </Suspense>
  );
}
