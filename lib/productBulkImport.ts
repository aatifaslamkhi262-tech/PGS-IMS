import * as XLSX from "xlsx";
import { dbConnect } from "@/lib/db";
import { Product } from "@/models/Product";
import { Category } from "@/models/Category";
import { ProductGroup } from "@/models/ProductGroup";
import { validateProductCondition, buildSkuDraft } from "@/lib/productCondition";
import { generateSystemBarcode } from "@/app/api/barcodes/generate/route";

export interface ExcelRowRaw {
  "Product Name"?: string;
  name?: string;
  Category?: string;
  category?: string;
  Condition?: string;
  condition?: string;
  "Product Group"?: string;
  productGroup?: string;
  "Color Variant"?: string;
  Color?: string;
  color?: string;
  "Model Number"?: string;
  Model?: string;
  modelNumber?: string;
  model?: string;
  Status?: string;
  status?: string;
  "Serial Tracking"?: boolean | string;
  serialTracking?: boolean | string;
  "Cost Price"?: number | string;
  costPrice?: number | string;
  "Selling Price"?: number | string;
  sellingPrice?: number | string;
  "Min Selling Price"?: number | string;
  minSellingPrice?: number | string;
  Description?: string;
  description?: string;
  [key: string]: any;
}

export interface ValidatedRow {
  rowNumber: number;
  name: string;
  categoryName: string;
  categoryId?: string;
  condition: string;
  productGroupName?: string;   // Excel Product Group text
  productGroupId?: string;     // Matched DB ObjectId
  suggestedGroupId?: string;   // Suggested DB ObjectId if fuzzy match
  suggestedGroupName?: string; // Suggested DB Group Name
  color: string;
  modelNumber: string;
  productStatus: "Active" | "Inactive"; // Real Product Status from Excel
  active: boolean;
  serialTracking: boolean;
  costPrice: number;
  sellingPrice: number;
  minSellingPrice: number;
  description?: string;
  status: "Ready" | "SuggestedGroup" | "ActionRequired" | "Duplicate" | "Invalid"; // Excel Import Status
  reason?: string;
}

export interface ImportReportItem {
  rowNumber: number;
  name: string;
  status: "Imported" | "Skipped Duplicate" | "Action Required" | "Invalid";
  reason: string;
  sku: string;
  barcode: string;
}

const normalizeStr = (str: any) => (str !== undefined && str !== null ? String(str).trim() : "");

/**
 * Normalizes text for group comparison by converting to lowercase, removing punctuation,
 * and collapsing spaces.
 */
export function cleanGroupText(str: string): string {
  return str
    .toLowerCase()
    .replace(/['’"\-:_.,\/\\()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Standard Levenshtein distance for string similarity calculation
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * High-confidence product group fuzzy matcher
 */
export function findSuggestedProductGroup(
  inputName: string,
  existingGroups: Array<{ _id: string; name: string }>
): { group: { _id: string; name: string } | null; isExact: boolean } {
  if (!inputName || !inputName.trim() || existingGroups.length === 0) {
    return { group: null, isExact: false };
  }

  const cleanInput = cleanGroupText(inputName);

  // 1. Exact normalized match
  for (const g of existingGroups) {
    const cleanDb = cleanGroupText(g.name);
    if (cleanDb === cleanInput) {
      return { group: g, isExact: true };
    }
  }

  // 2. Fuzzy / similarity search with high confidence threshold
  let bestMatch: { _id: string; name: string } | null = null;
  let highestScore = 0;

  for (const g of existingGroups) {
    const cleanDb = cleanGroupText(g.name);
    const lenMax = Math.max(cleanInput.length, cleanDb.length);
    if (lenMax === 0) continue;

    const dist = levenshteinDistance(cleanInput, cleanDb);
    const score = 1.0 - dist / lenMax;

    if (score > highestScore) {
      highestScore = score;
      bestMatch = g;
    }
  }

  // Confidence threshold >= 0.75 (strong similarity like "Marvels Spider Man 2" vs "Marvel's Spider-Man 2")
  if (highestScore >= 0.75 && bestMatch) {
    return { group: bestMatch, isExact: false };
  }

  return { group: null, isExact: false };
}

/**
 * Parses raw Excel buffer into JavaScript objects
 */
export function parseExcelBuffer(buffer: Buffer): ExcelRowRaw[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(worksheet, { defval: "" });
}

/**
 * Bulk preview & validation logic with preloaded lookup context (no N+1 queries)
 */
export async function validateExcelRows(rows: ExcelRowRaw[]): Promise<ValidatedRow[]> {
  await dbConnect();

  // Preload Categories (map by lowercase name)
  const categories = await Category.find().lean();
  const categoryMap = new Map<string, string>();
  categories.forEach((c: any) => {
    categoryMap.set(c.name.trim().toLowerCase(), c._id.toString());
  });

  // Preload Product Groups
  const groupsRaw = await ProductGroup.find().lean();
  const existingGroupObjects = groupsRaw.map((g: any) => ({
    _id: g._id.toString(),
    name: g.name,
  }));

  // Preload existing active/non-deleted products for duplicate matching
  const existingProducts = await Product.find({ isDeleted: false }, {
    name: 1,
    modelNumber: 1,
    model: 1,
    color: 1,
    condition: 1,
  }).lean();

  const validatedRows: ValidatedRow[] = [];
  const seenInFileKeys = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const rowNum = i + 2; // Row index 2 (assuming row 1 is header)

    const name = normalizeStr(raw["Product Name"] || raw.name);
    const categoryName = normalizeStr(raw["Category"] || raw.category);
    const rawCondition = normalizeStr(raw["Condition"] || raw.condition);
    let productGroupName = normalizeStr(raw["Product Group"] || raw.productGroup);
    const color = normalizeStr(raw["Color Variant"] || raw.Color || raw.color) || "Unspecified";
    const modelNumber = normalizeStr(raw["Model Number"] || raw.Model || raw.modelNumber || raw.model);
    const rawStatus = normalizeStr(raw["Status"] || raw.status);
    const rawSerial = raw["Serial Tracking"] ?? raw.serialTracking;
    const rawCost = raw["Cost Price"] ?? raw.costPrice;
    const rawSelling = raw["Selling Price"] ?? raw.sellingPrice;
    const rawMinSelling = raw["Min Selling Price"] ?? raw.minSellingPrice;
    const description = normalizeStr(raw["Description"] || raw.description);

    let status: "Ready" | "SuggestedGroup" | "ActionRequired" | "Duplicate" | "Invalid" = "Ready";
    let reason = "";

    // Parse product status (Active/Inactive)
    const isInactive = rawStatus.toLowerCase() === "inactive" || rawStatus.toLowerCase() === "false";
    const productStatus: "Active" | "Inactive" = isInactive ? "Inactive" : "Active";
    const active = productStatus === "Active";

    // 1. Name Check
    if (!name) {
      status = "Invalid";
      reason = "Missing Product Name";
    }

    // 2. Category Check
    if (status === "Ready" && !categoryName) {
      status = "Invalid";
      reason = "Missing Category";
    }

    let categoryId: string | undefined = undefined;
    if (status === "Ready") {
      categoryId = categoryMap.get(categoryName.toLowerCase());
      if (!categoryId) {
        status = "Invalid";
        reason = `Invalid Category: "${categoryName}" not found`;
      }
    }

    // 3. Condition Check
    let validCondition = "";
    if (status === "Ready") {
      if (!rawCondition) {
        status = "Invalid";
        reason = "Missing Condition";
      } else {
        const condRes = validateProductCondition(rawCondition);
        if (!condRes.valid || !condRes.condition) {
          status = "Invalid";
          reason = condRes.error || "Condition must be 'New' or 'Used'";
        } else {
          validCondition = condRes.condition;
        }
      }
    }

    // 4. Product Group Check (Optional)
    let productGroupId: string | undefined = undefined;
    let suggestedGroupId: string | undefined = undefined;
    let suggestedGroupName: string | undefined = undefined;

    if (status === "Ready" && productGroupName) {
      const groupSearchResult = findSuggestedProductGroup(productGroupName, existingGroupObjects);
      if (groupSearchResult.group) {
        if (groupSearchResult.isExact) {
          productGroupId = groupSearchResult.group._id;
          productGroupName = groupSearchResult.group.name;
        } else {
          // Suggested Fuzzy Match -> Requires User Action
          suggestedGroupId = groupSearchResult.group._id;
          suggestedGroupName = groupSearchResult.group.name;
          status = "SuggestedGroup";
          reason = `Possible Product Group match: "${groupSearchResult.group.name}"`;
        }
      } else {
        // No match / weak match -> ActionRequired (Product data valid, but group needs creation/resolution)
        status = "ActionRequired";
        reason = `Product Group not found: "${productGroupName}"`;
      }
    }

    // 5. Pricing Validation
    const costPrice = parseFloat(String(rawCost));
    const sellingPrice = parseFloat(String(rawSelling));
    const minSellingPrice = parseFloat(String(rawMinSelling));

    if (status === "Ready" || status === "SuggestedGroup" || status === "ActionRequired") {
      if (rawCost === "" || rawCost === undefined || isNaN(costPrice) || costPrice < 0) {
        status = "Invalid";
        reason = "Cost Price must be a valid number >= 0";
      } else if (rawSelling === "" || rawSelling === undefined || isNaN(sellingPrice) || sellingPrice <= 0) {
        status = "Invalid";
        reason = "Selling Price must be a valid number > 0";
      } else if (rawMinSelling === "" || rawMinSelling === undefined || isNaN(minSellingPrice) || minSellingPrice <= 0) {
        status = "Invalid";
        reason = "Min Selling Price must be a valid number > 0";
      } else if (minSellingPrice > sellingPrice) {
        status = "Invalid";
        reason = "Min Selling Price cannot be greater than Selling Price";
      }
    }

    // Parse serial tracking boolean
    const serialTracking = rawSerial === true || String(rawSerial).toLowerCase() === "yes" || String(rawSerial).toLowerCase() === "true" || String(rawSerial) === "1";

    // 6. Duplicate Detection Logic (Database + File Level)
    if (status === "Ready" || status === "SuggestedGroup" || status === "ActionRequired") {
      const normName = name.toLowerCase();
      const normModel = modelNumber.toLowerCase();
      const normColor = color.toLowerCase();
      const normCond = validCondition.toLowerCase();

      // Build key for file-level duplicate tracking
      const fileKey = normModel
        ? `M:${normName}|${normModel}|${normColor}|${normCond}`
        : `B:${normName}|${normColor}|${normCond}`;

      if (seenInFileKeys.has(fileKey)) {
        status = "Duplicate";
        reason = "Duplicate product variant in uploaded file";
      } else {
        // Check against existing database products
        const dbDuplicate = existingProducts.some((p: any) => {
          const pName = (p.name || "").trim().toLowerCase();
          const pModel = (p.modelNumber || p.model || "").trim().toLowerCase();
          const pColor = (p.color || "Unspecified").trim().toLowerCase();
          const pCond = (p.condition || "").trim().toLowerCase();

          if (pName !== normName || pColor !== normColor || pCond !== normCond) {
            return false;
          }

          if (normModel) {
            return pModel === normModel;
          } else {
            return pModel === "";
          }
        });

        if (dbDuplicate) {
          status = "Duplicate";
          reason = "Duplicate product variant already exists.";
        } else {
          seenInFileKeys.add(fileKey);
        }
      }
    }

    validatedRows.push({
      rowNumber: rowNum,
      name,
      categoryName,
      categoryId,
      condition: validCondition || rawCondition,
      productGroupName,
      productGroupId,
      suggestedGroupId,
      suggestedGroupName,
      color,
      modelNumber,
      productStatus,
      active,
      serialTracking,
      costPrice: isNaN(costPrice) ? 0 : costPrice,
      sellingPrice: isNaN(sellingPrice) ? 0 : sellingPrice,
      minSellingPrice: isNaN(minSellingPrice) ? 0 : minSellingPrice,
      description,
      status,
      reason,
    });
  }

  return validatedRows;
}

/**
 * Atomic execution of bulk import for ready rows
 * NEVER creates a Product Group under any circumstances!
 */
export async function executeBulkImport(validRows: ValidatedRow[]): Promise<{
  importedCount: number;
  skippedCount: number;
  invalidCount: number;
  reports: ImportReportItem[];
}> {
  await dbConnect();

  // Preload existing group IDs to strictly verify server-side
  const groupsRaw = await ProductGroup.find({}, { _id: 1 }).lean();
  const validGroupIds = new Set(groupsRaw.map((g: any) => g._id.toString()));

  let importedCount = 0;
  let skippedCount = 0;
  let invalidCount = 0;

  const reports: ImportReportItem[] = [];

  for (const row of validRows) {
    if (row.status === "Duplicate") {
      skippedCount++;
      reports.push({
        rowNumber: row.rowNumber,
        name: row.name,
        status: "Skipped Duplicate",
        reason: row.reason || "Duplicate product variant already exists.",
        sku: "-",
        barcode: "-",
      });
      continue;
    }

    if (row.status === "ActionRequired") {
      invalidCount++;
      reports.push({
        rowNumber: row.rowNumber,
        name: row.name,
        status: "Action Required",
        reason: row.reason || "Product Group resolution required before import",
        sku: "-",
        barcode: "-",
      });
      continue;
    }

    if (row.status === "Invalid" || row.status === "SuggestedGroup") {
      invalidCount++;
      reports.push({
        rowNumber: row.rowNumber,
        name: row.name || "N/A",
        status: "Invalid",
        reason: row.reason || (row.status === "SuggestedGroup" ? "Product Group suggestion not confirmed" : "Invalid data"),
        sku: "-",
        barcode: "-",
      });
      continue;
    }

    // Verify Product Group ID if assigned
    let verifiedGroupId: string | undefined = undefined;
    if (row.productGroupId) {
      if (validGroupIds.has(row.productGroupId)) {
        verifiedGroupId = row.productGroupId;
      } else {
        invalidCount++;
        reports.push({
          rowNumber: row.rowNumber,
          name: row.name,
          status: "Invalid",
          reason: `Assigned Product Group ID "${row.productGroupId}" does not exist in database`,
          sku: "-",
          barcode: "-",
        });
        continue;
      }
    }

    try {
      // Auto-generate SKU
      const cleanSku = buildSkuDraft(row.name, row.condition as any);
      // Auto-generate System Barcode
      const cleanBarcode = await generateSystemBarcode();

      const newProduct = (await Product.create({
        name: row.name,
        category: row.categoryId || undefined,
        productGroup: verifiedGroupId || undefined,
        brand: "",
        modelNumber: row.modelNumber,
        model: row.modelNumber,
        color: row.color || "Unspecified",
        condition: row.condition as any,
        sku: cleanSku,
        barcode: cleanBarcode,
        serialTracking: row.serialTracking,
        costPrice: row.costPrice,
        sellingPrice: row.sellingPrice,
        minSellingPrice: row.minSellingPrice,
        images: [],
        description: row.description || undefined,
        active: row.active,
        isDeleted: false,
      })) as any;

      importedCount++;
      reports.push({
        rowNumber: row.rowNumber,
        name: row.name,
        status: "Imported",
        reason: "Successfully created product",
        sku: newProduct.sku,
        barcode: newProduct.barcode,
      });
    } catch (err: any) {
      invalidCount++;
      reports.push({
        rowNumber: row.rowNumber,
        name: row.name,
        status: "Invalid",
        reason: err.message || "Failed to create product document",
        sku: "-",
        barcode: "-",
      });
    }
  }

  return {
    importedCount,
    skippedCount,
    invalidCount,
    reports,
  };
}

/**
 * Generates downloadable Excel template buffer
 */
export function generateExcelTemplateBuffer(): Buffer {
  const sampleData = [
    {
      "Product Name": "PS5 DualSense Controller",
      Category: "Controllers",
      Condition: "New",
      "Product Group": "",
      "Color Variant": "White",
      "Model Number": "CFI-ZCT1W",
      Status: "Active",
      "Serial Tracking": "No",
      "Cost Price": 15000,
      "Selling Price": 22000,
      "Min Selling Price": 20000,
      Description: "Official PlayStation 5 DualSense Wireless Controller",
    },
    {
      "Product Name": "Xbox Series X",
      Category: "Consoles",
      Condition: "New",
      "Product Group": "",
      "Color Variant": "Black",
      "Model Number": "",
      Status: "Active",
      "Serial Tracking": "Yes",
      "Cost Price": 130000,
      "Selling Price": 165000,
      "Min Selling Price": 155000,
      Description: "Microsoft Xbox Series X 1TB Console",
    },
    {
      "Product Name": "WWE 2K24 PS4",
      Category: "Games",
      Condition: "New",
      "Product Group": "",
      "Color Variant": "",
      "Model Number": "",
      Status: "Active",
      "Serial Tracking": "No",
      "Cost Price": 9000,
      "Selling Price": 14000,
      "Min Selling Price": 12500,
      Description: "WWE 2K24 Standard Edition PlayStation 4",
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Products Template");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

/**
 * Generates downloadable Import Report Excel buffer
 */
export function generateReportExcelBuffer(reports: ImportReportItem[]): Buffer {
  const exportData = reports.map((r) => ({
    "Row Number": r.rowNumber,
    "Product Name": r.name,
    Status: r.status,
    Reason: r.reason,
    "Generated SKU": r.sku,
    "Generated Barcode": r.barcode,
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Import Report");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
