# Implementation Plan - PGS POS System & Comprehensive Edge-Case Architecture

This document details the complete architecture, workflow rules, and exhaustive **Retail Edge Cases** for the upcoming **PGS Point of Sale (POS) System** across 8 Branches & 1 Warehouse.

---

## ⚡ Critical Retail Edge Cases & System Guards

### 🔴 Edge Case 1: Advance Paid + Item Delivered + Balance Defaulted
* **Scenario**: Customer pays Rs. 10,000 advance on a Rs. 60,000 PS5, takes the console home, and promises to pay the remaining Rs. 50,000 in 3 days, but defaults/vanishes.
* **POS System Guard**:
  1. **Debt Aging & Promised Due Date**: Every partial payment sale mandates a **Promised Due Date** (e.g. 3 days).
  2. **Automated WhatsApp Debt Escalation**: System sends automated reminder at Day 1, Day 3. At Day 5, account is auto-flagged as **DEFAULTED / OVERDUE**.
  3. **Multi-Branch Blacklist / Hold**: If customer visits *any* of the 8 branches, entering their phone/CNIC locks POS from giving new items on credit or performing replacements until past balance is settled.
  4. **Salesman Accountability Log**: Invoices with defaulted balances show up on the **Salesman Risk Audit** so salesmen don't give credit to unverified customers.

---

### 🔴 Edge Case 2: Full or Partial Customer Returns (Maal Wapis Ho Gaya)
* **Scenario**: Customer buys 2 games + 1 controller, returns the controller 2 days later demanding cash back or store credit.
* **POS System Guard**:
  1. **Original Purchase Verification**: Return requires scanning receipt QR code or searching Original Invoice ID. Item cannot be returned if price changed or invoice doesn't exist.
  2. **Automatic Salesman Profit Reversal**: System automatically deducts the returned item's profit from the salesman's monthly commission calculation.
  3. **Stock Re-entry Routing (Restock vs Defective)**: POS cashier marks item status:
     - *Restock (Sealed/Good)* -> Adds back to active sellable stock.
     - *Defective / Damaged* -> Moves to **RMA / Damaged Warehouse Holding** (does NOT put broken stock back on shop shelf).
  4. **Refund Settlement Priority**:
     - If customer has **Pending Udhaar**: Refund amount is automatically subtracted from pending debt first.
     - If customer paid **Full Cash**: System issues a **Store Credit Voucher** or cash refund (requires Manager PIN if cash refund > Rs. 5,000).

---

### 🔴 Edge Case 3: Serial Number Fraud / Wrong Item Return
* **Scenario**: Customer bought a new DualSense Controller (SN: `SN-9988`). 3 days later, customer brings their old broken controller (SN: `SN-1122`) claiming it's the defective new one.
* **POS System Guard**:
  1. **Strict Serial Match**: POS forces scanning of the exact Serial Number printed on the item.
  2. **Mismatch Block**: If scanned SN `SN-1122` does NOT match invoice record `SN-9988`, POS displays a red error: *"SERIAL MISMATCH DETECTED: This serial number was not sold on this invoice."*
  3. **Owner Fraud Alert**: Incident logged under **Fraud Attempt Logs** for Owner inspection.

---

### 🔴 Edge Case 4: Unauthorized Salesman Discount / Under-Table Selling
* **Scenario**: Salesman sells a Rs. 200,000 console for Rs. 185,000 to a friend, or takes cash under the table.
* **POS System Guard**:
  1. **Minimum Allowed Price (MAP) Enforcement**: Each product has a `costPrice` and `minimumSellingPrice`.
  2. **Hard Lock**: If discount drops price below `minimumSellingPrice`, POS blocks checkout with *"Requires Owner / Manager Override PIN"*.
  3. **Margin Loss Alert**: Any discount resulting in < 5% profit margin generates a highlight on the Owner Daily Audit report.

---

### 🔴 Edge Case 5: Inter-Branch Return (Bought at Branch A, Return at Branch B)
* **Scenario**: Customer bought console at **Tariq Road Branch**, goes to **Saddar Branch** 3 days later for replacement/return.
* **POS System Guard**:
  1. **Central Cloud Sync**: Saddar Branch POS fetches Tariq Road Invoice instantly via cloud MongoDB.
  2. **Inter-Branch Stock Transfer Accounting**: Returned item enters Saddar Branch damaged/restock inventory; financial credit adjusts original Tariq Road sale record transparently.

---

### 🔴 Edge Case 6: Exchange / Upgrade with Cash Difference
* **Scenario**: Customer returns a Rs. 15,000 PS4 Controller and upgrades to a Rs. 25,000 PS5 Controller, paying the Rs. 10,000 difference.
* **POS System Guard**:
  1. **Single Exchange Transaction**: POS combines Return Credit (15k) + New Sale (25k) = Net Payable: Rs. 10,000.
  2. Creates linked replacement audit log without messing up daily cash register total.

---

### 🔴 Edge Case 7: Advance Booking without Stock (Order Booking)
* **Scenario**: Customer pays Rs. 50,000 advance for a PS5 Pro arriving next week.
* **POS System Guard**:
  1. Generates **Advance Booking Receipt**.
  2. Money enters Cash Register under `Advance Liabilities`.
  3. Stock is reserved automatically when next purchase invoice / warehouse delivery arrives.

---

## 📊 Complete Edge-Case Test Matrix

| # | Edge Case Scenario | POS Action / Guard | Owner Notification |
|---|---|---|---|
| 1 | Partial Payment / Debt Default | Promised due date + Auto WhatsApp Reminder + 8 Branch Blacklist | Overdue Alert after 5 Days |
| 2 | Full / Partial Return | Auto COGS & Stock restore + Salesman commission reversal | Instant Daily Return Summary |
| 3 | Serial Number Fraud | Hard Lock on Serial Mismatch | Fraud Log Generated |
| 4 | Below-Cost / Deep Discount | Minimum Selling Price Lock (Needs PIN) | Deep Discount Audit Log |
| 5 | Inter-Branch Return | Central Cloud Fetch & Multi-Branch Stock Rebalancing | Auto Inter-Branch Audit |
| 6 | 2nd Replacement on Same Item | Transaction Lock (Needs Owner OTP) | Instant Push & WhatsApp Alert |
| 7 | Unsettled Debt Return | Auto-subtracts refund from pending debt balance | Debt Offset Summary |

---

## Proposed System Architecture & Core Modules

### 1. 💼 Salesman Performance & Profitability Ledger (`/app/pos`, `/app/reports/salesman`)
* Real-time profit calculation per invoice.
* Salesman Leaderboard (Sales Volume, Gross Profit, Pending Debt Created, Return Rate).

### 2. 📑 Customer Credit (Udhaar) & Recovery Ledger (`/app/customers/[id]`, `/app/pos`)
* Debt aging (0-15 days, 15-30 days, 30+ days overdue).
* Automated WhatsApp reminders & Credit limit locks across 8 branches.

### 3. 🚨 Anti-Staff Hiding & Owner Escalation Engine (`/models/WarrantyClaim.ts`, `/app/api/pos/returns`)
* Multi-replacement flags, Serial mismatch locks, and direct WhatsApp customer rating loop.

---

## Verification Plan

### Automated Tests
- Unit & integration tests for all 7 edge case scenarios (`npm run test`).

### Manual Verification
- Testing complete POS checkout flow, partial advance payments, returns, serial number checks, and owner escalation alerts.
