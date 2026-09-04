# Barcode and Serial Number Tracking Implementation

## Overview

This implementation updates the Product Management module with a comprehensive barcode and serial-number workflow following the business rule: **BARCODE = PRODUCT LEVEL, SERIAL NUMBER = INDIVIDUAL PIECE LEVEL**.

## Key Changes

### 1. Database Schema Updates

#### Product Model (`models/Product.ts`)
- **Added `barcode` field**: Now required (was optional)
- **Added `serialTracking` field**: Boolean field to enable/disable serial tracking per product
- **Updated indexes**: Barcode uniqueness enforced across non-deleted products
- **Removed optional barcode handling**: All products must have a system-generated or manually assigned barcode

#### SerialNumber Model (`models/SerialNumber.ts`) - NEW
- **New entity** for tracking individual units
- **Fields**:
  - `product`: Reference to Product
  - `serialNumber`: Unique serial number (globally unique)
  - `status`: Available, Sold, Returned, Damaged, Claim, Transferred
  - `location`: Current location
  - `transactionReference`: Reference to related transaction
  - `invoiceId`: Reference to invoice (for sales/returns)
  - `saleDate`, `returnDate`, `damageDate`: Status change timestamps
  - `notes`: Additional information

### 2. API Updates

#### Product API (`app/api/products/route.ts`)
- **Auto-generates system barcodes** if not provided
- **Accepts `serialTracking` parameter** in product creation/update
- **Validates barcode uniqueness** before product creation
- **Barcode generation helper function** creates unique "PGS-XXXXXXXXX" format barcodes

#### Serial Number APIs (NEW)
- **`GET /api/serial-numbers`**: List serial numbers with filtering
- **`POST /api/serial-numbers`**: Create individual serial number
- **`PUT /api/serial-numbers/[id]`**: Update serial number status with validation
- **`DELETE /api/serial-numbers/[id]`**: Delete serial number (only Available status)
- **`POST /api/serial-numbers/bulk`**: Bulk create serial numbers for stock receiving

#### Barcode APIs
- **`GET /api/barcodes/generate`**: Generate unique system barcode
- **`GET /api/barcodes/scan?barcode=XXX`**: Scan barcode to find product and available serials

#### Stock & Sales APIs (NEW)
- **`POST /api/stock/receive`**: Receive stock with optional serial number assignment
- **`POST /api/sales`**: Process sales with serial number selection (if enabled)
- **`POST /api/sales/returns`**: Process returns linked to original invoice
- **`POST /api/stock/damage`**: Record damage/claims with serial number tracking

### 3. Frontend Updates

#### Product Creation Form (`app/products/new/page.tsx`)
- **Barcode is now required** with auto-generation option
- **Serial Tracking toggle**: Enable/disable per product
- **Enhanced validation**: Barcode field is mandatory
- **Improved UX**: Clear messaging about barcode vs serial number purpose

#### Product Edit Form (`app/products/[id]/edit/page.tsx`)
- **Serial Tracking toggle**: Can be enabled/disabled on existing products
- **Barcode field**: Required, with auto-generation option
- **Validation**: Updated to require barcode

#### Product Detail Page (`app/products/[id]/page.tsx`)
- **Displays barcode**: Prominently shown in product details
- **Serial Tracking status**: Shows enabled/disabled with visual indicator
- **Barcode label**: Includes note about barcode identifying product, not individual units

## Business Rules Implementation

### ✅ 1. System-Generated Product Barcode
- Every product receives a unique system-generated barcode (format: PGS-XXXXXXXXX)
- Barcode is permanently linked to the Product record
- Barcode is unique across all products
- Barcode is searchable and scannable
- Same barcode applies to all units of the same product

### ✅ 2. Product Variants
- Different variants have separate Product records, SKUs, and barcodes
- Related variants can share the same Product Group
- Each variant maintains its own barcode and serial tracking settings

### ✅ 3. Serial Tracking (Optional)
- Product-level setting: `serialTracking` (boolean)
- Not required for every product
- Can be enabled/disabled per product
- Examples: PS5 (enabled), cables (disabled)

### ✅ 4. Stock Receiving
- **Without Serial Tracking**: Receive quantity only, no serial numbers needed
- **With Serial Tracking**: System requires individual serial numbers for each unit
- Bulk API available for efficient serial number creation

### ✅ 5. Barcode Scanning
- **`GET /api/barcodes/scan`** endpoint for barcode lookup
- Returns product details and available serial numbers (if tracking enabled)
- Supports:
  - USB/Bluetooth physical scanner (keyboard input)
  - Mobile camera scanner (via existing component)
  - Manual barcode input
  - Product name search as fallback

### ✅ 6. POS Sale
- **Without Serial Tracking**: Scan barcode → select quantity → complete sale
- **With Serial Tracking**: Scan barcode → select quantity → select specific serial numbers
- Serial numbers are marked as "Sold" with timestamp and invoice reference

### ✅ 7. Sales Return
- Returns must be linked to original sale/invoice
- **With Serial Tracking**: Validates serial number was sold under the provided invoice
- Serial status changes from "Sold" to "Returned"
- **Without Serial Tracking**: Quantity-based return

### ✅ 8. Damage/Claim
- **Without Serial Tracking**: Record quantity damaged
- **With Serial Tracking**: Mark specific serial numbers as "Damaged" or "Claim"
- Damaged units can move through Claim Godam workflow later

### ✅ 9. Database Design
- Product contains barcode and serialTracking flag
- Serial numbers are separate entities linked to Product
- Status system for tracking serial number lifecycle
- Extensible design for future Inventory/POS/Claims modules

### ✅ 10. Important Product Rule
- **ONE barcode per product**
- **MANY physical units share the same barcode**
- **Serial numbers identify individual units** (when tracking enabled)

## API Usage Examples

### Create Product with Serial Tracking
```bash
POST /api/products
{
  "name": "PS5 Slim Disc Edition",
  "sku": "PS5-SLIM-DISC",
  "serialTracking": true,
  "costPrice": 450.00,
  "sellingPrice": 499.99,
  "minSellingPrice": 480.00
}
```
Response includes auto-generated barcode (e.g., "PGS-123456789")

### Receive Stock with Serial Numbers
```bash
POST /api/stock/receive
{
  "product": "product_id",
  "quantity": 5,
  "serialNumbers": ["ABC001", "ABC002", "ABC003", "ABC004", "ABC005"],
  "location": "Warehouse A"
}
```

### Scan Barcode
```bash
GET /api/barcodes/scan?barcode=PGS-123456789
```
Returns product details and available serial numbers (if tracking enabled)

### Process Sale with Serial Numbers
```bash
POST /api/sales
{
  "product": "product_id",
  "quantity": 1,
  "serialNumbers": ["ABC001"],
  "invoiceId": "invoice_id",
  "transactionReference": "SALE-12345"
}
```

### Process Return
```bash
POST /api/sales/returns
{
  "product": "product_id",
  "quantity": 1,
  "serialNumbers": ["ABC001"],
  "invoiceId": "original_invoice_id"
}
```

### Record Damage
```bash
POST /api/stock/damage
{
  "product": "product_id",
  "quantity": 1,
  "serialNumbers": ["ABC002"],
  "damageType": "Damaged",
  "notes": "Screen cracked during transit"
}
```

## Testing Scenarios

### Test 1: Create Product with Auto-Generated Barcode
1. Create new product via `/products/new`
2. Don't provide barcode, let system auto-generate
3. **Expected**: Product created with unique barcode (PGS-XXXXXXXXX format)

### Test 2: Receive Stock Without Serial Tracking
1. Create product with `serialTracking: false`
2. Receive stock via `/api/stock/receive` with quantity only
3. **Expected**: Stock received successfully, no serial numbers required

### Test 3: Scan Barcode
1. Use `/api/barcodes/scan?barcode=PGS-123456789`
2. **Expected**: Product found with stock information

### Test 4: Enable Serial Tracking and Receive Stock
1. Update product to enable `serialTracking: true`
2. Receive stock with serial numbers
3. **Expected**: Serial numbers created and linked to product

### Test 5: Sale with Serial Selection
1. Scan product barcode
2. Select quantity and specific serial numbers
3. Process sale via `/api/sales`
4. **Expected**: Serial numbers marked as "Sold"

### Test 6: Return Sold Unit
1. Process return via `/api/sales/returns` with original invoice
2. **Expected**: Serial number status changes to "Returned"

### Test 7: Duplicate Serial Number Prevention
1. Try to create serial number that already exists
2. **Expected**: System blocks duplicate with error message

### Test 8: Product Variants
1. Create DualSense White and DualSense Black
2. Assign same Product Group
3. **Expected**: Two separate products with different SKUs and barcodes

### Test 9: Barcode Scanning
1. Scan either variant's barcode
2. **Expected**: Correct variant/product is found

## Migration Notes

### Existing Products
- Existing products without barcodes will need to be updated
- Use the barcode generation API or manually assign barcodes
- Serial tracking is disabled by default for existing products

### Data Consistency
- Barcode uniqueness is now enforced
- Serial number validation prevents duplicates
- Status transitions are validated to prevent invalid state changes

## Future Enhancements

### Inventory Module Integration
- Connect stock receiving/sales to actual inventory quantities
- Real-time stock level updates
- Low stock alerts

### Advanced Serial Tracking
- Serial number history/audit trail
- Bulk serial number operations
- Serial number import/export

### Enhanced Reporting
- Serial number status reports
- Sales by serial number
- Damage/claim analytics

## Component Structure

```
models/
├── Product.ts (updated - barcode required, serialTracking added)
├── SerialNumber.ts (new)
└── ProductGroup.ts (unchanged)

app/api/
├── products/
│   ├── route.ts (updated - auto-generate barcodes, serial tracking)
│   └── [id]/route.ts (updated - serial tracking support)
├── serial-numbers/
│   ├── route.ts (new - CRUD operations)
│   ├── [id]/route.ts (new - individual operations)
│   └── bulk/route.ts (new - bulk operations)
├── barcodes/
│   ├── generate/route.ts (updated - enhanced messaging)
│   └── scan/route.ts (new - barcode scanning)
├── stock/
│   └── receive/route.ts (new - stock receiving with serial tracking)
├── sales/
│   ├── route.ts (new - sales with serial tracking)
│   └── returns/route.ts (new - returns with serial tracking)
└── stock/
    └── damage/route.ts (new - damage/claim with serial tracking)

app/products/
├── new/page.tsx (updated - barcode required, serial tracking toggle)
├── [id]/
│   ├── edit/page.tsx (updated - serial tracking toggle)
│   └── page.tsx (updated - display barcode and serial tracking status)
```

## Conclusion

This implementation provides a comprehensive barcode and serial number tracking system that follows the specified business rules while maintaining flexibility for different product types. The system is designed to be extensible for future inventory, POS, and claims module integration.
