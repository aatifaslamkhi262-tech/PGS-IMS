import { Types, ClientSession } from "mongoose";
import { PurchaseCostLayer } from "@/models/PurchaseCostLayer";

export interface AddCostLayerInput {
  productId: string | Types.ObjectId;
  locationId: string | Types.ObjectId;
  condition?: string;
  unitCost: number;
  receivedQty: number;
  purchaseReference?: string;
  receivedAt?: Date;
}

export interface ConsumeFifoInput {
  productId: string | Types.ObjectId;
  locationId: string | Types.ObjectId;
  condition?: string;
  quantity: number;
}

export interface ConsumeFifoResult {
  totalCost: number;
  unitCost: number;
  layersConsumed: Array<{ layerId: string; consumedQty: number; unitCost: number }>;
}

/**
 * Adds a new cost layer when non-serialized products are received/intaken.
 */
export async function addPurchaseCostLayer(input: AddCostLayerInput, session?: ClientSession) {
  const layer = new PurchaseCostLayer({
    product: input.productId,
    location: input.locationId,
    condition: input.condition || "New",
    unitCost: Math.max(0, Number(input.unitCost || 0)),
    receivedQty: Math.max(1, Number(input.receivedQty || 1)),
    remainingQty: Math.max(1, Number(input.receivedQty || 1)),
    purchaseReference: input.purchaseReference,
    receivedAt: input.receivedAt || new Date(),
  });

  if (session) {
    await layer.save({ session });
  } else {
    await layer.save();
  }

  return layer;
}

/**
 * Consumes cost layers FIFO (oldest receivedAt first) when selling non-serialized items.
 * Returns exact consumed total cost and weighted unit cost.
 */
export async function consumeFifoCostLayers(
  input: ConsumeFifoInput,
  session?: ClientSession
): Promise<ConsumeFifoResult> {
  const condition = input.condition || "New";
  const requiredQty = Number(input.quantity);

  if (requiredQty <= 0) {
    return { totalCost: 0, unitCost: 0, layersConsumed: [] };
  }

  // Find cost layers with remainingQty > 0, ordered FIFO by receivedAt ascending
  const query = PurchaseCostLayer.find({
    product: input.productId,
    location: input.locationId,
    condition,
    remainingQty: { $gt: 0 },
  }).sort({ receivedAt: 1 });

  if (session) {
    query.session(session);
  }

  const layers = await query.exec();

  let qtyStillNeeded = requiredQty;
  let totalCost = 0;
  const layersConsumed: Array<{ layerId: string; consumedQty: number; unitCost: number }> = [];

  for (const layer of layers) {
    if (qtyStillNeeded <= 0) break;

    const qtyFromThisLayer = Math.min(layer.remainingQty, qtyStillNeeded);
    layer.remainingQty -= qtyFromThisLayer;
    
    if (session) {
      await layer.save({ session });
    } else {
      await layer.save();
    }

    const layerCost = qtyFromThisLayer * layer.unitCost;
    totalCost += layerCost;
    qtyStillNeeded -= qtyFromThisLayer;

    layersConsumed.push({
      layerId: layer._id.toString(),
      consumedQty: qtyFromThisLayer,
      unitCost: layer.unitCost,
    });
  }

  // Fallback: If layers are exhausted or not initialized, use 0 or last known cost layer price
  if (qtyStillNeeded > 0) {
    const fallbackUnitCost = layersConsumed.length > 0 ? layersConsumed[layersConsumed.length - 1].unitCost : 0;
    totalCost += qtyStillNeeded * fallbackUnitCost;
  }

  const unitCost = requiredQty > 0 ? totalCost / requiredQty : 0;

  return {
    totalCost,
    unitCost,
    layersConsumed,
  };
}
