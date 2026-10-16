export interface OrderEmailInput {
  saleNumber: string;
  saleSource?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  shippingAddress?: string;
  city?: string;
  paymentMethod?: string;
  items: Array<{
    productName?: string;
    title?: string;
    condition?: string;
    quantity: number;
    unitPrice: number;
    lineTotal?: number;
  }>;
  subtotal?: number;
  deliveryCharges?: number;
  totalAmount: number;
  notes?: string;
  createdAt?: Date | string;
}

const STORE_LOGO_URL =
  process.env.STORE_LOGO_URL ||
  "https://res.cloudinary.com/fqgi2n1k/image/upload/v1792078322/pgs-ims/branding/pgs_logo.png";

export async function sendOwnerOrderAlert(order: OrderEmailInput): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const ownerEmail = process.env.OWNER_EMAIL || "aatif.aslamkhi262@gmail.com";

    if (!apiKey) {
      console.warn("[EmailService] Missing RESEND_API_KEY. Skipping email notification.");
      return { success: false, error: "Missing RESEND_API_KEY" };
    }

    const orderNumber = order.saleNumber || "SALE-ORDER";
    const source = order.saleSource || "WEBSITE";
    const custName = order.customerName || "Online Customer";
    const custPhone = order.customerPhone || "N/A";
    const delivery = Number(order.deliveryCharges || 0);
    const grandTotal = Number(order.totalAmount || 0);
    const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleString("en-PK", { timeZone: "Asia/Karachi" }) : new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" });

    // Itemized table rows
    const itemsHtml = (order.items || [])
      .map(
        (it) => `
        <tr style="border-bottom: 1px solid #334155;">
          <td style="padding: 10px; color: #f8fafc; font-weight: bold;">
            ${it.productName || it.title || "Product Item"}
            <br/><span style="font-size: 11px; color: #94a3b8;">Condition: ${it.condition || "New"}</span>
          </td>
          <td style="padding: 10px; text-align: center; color: #e2e8f0; font-weight: bold;">${it.quantity}</td>
          <td style="padding: 10px; text-align: right; color: #e2e8f0; font-family: monospace;">Rs. ${Number(it.unitPrice || 0).toLocaleString()}</td>
          <td style="padding: 10px; text-align: right; color: #818cf8; font-family: monospace; font-weight: bold;">Rs. ${(Number(it.lineTotal || (it.quantity * it.unitPrice))).toLocaleString()}</td>
        </tr>
      `
      )
      .join("");

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Website Order Alert</title>
      </head>
      <body style="margin:0; padding:20px; background-color:#020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
          
          <!-- Banner Header with Official PGS Logo -->
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 24px; text-align: center; border-bottom: 2px solid #4f46e5;">
            <div style="margin-bottom: 12px;">
              <img 
                src="${STORE_LOGO_URL}" 
                alt="PGS Game Shop Karachi" 
                style="height: 56px; max-height: 56px; width: auto; object-fit: contain; display: inline-block; vertical-align: middle;"
              />
            </div>
            <h1 style="color: #ffffff; margin: 0; font-size: 19px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;">
              🚨 NEW ONLINE ORDER RECEIVED!
            </h1>
            <p style="color: #e0e7ff; margin: 6px 0 0 0; font-size: 13px; font-weight: 600;">
              Order Number: <span style="font-family: monospace; background: rgba(0,0,0,0.3); padding: 2px 8px; border-radius: 6px;">${orderNumber}</span>
            </p>
          </div>

          <!-- Body Content -->
          <div style="padding: 24px;">
            
            <!-- Source & Date Badge -->
            <div style="display: flex; justify-content: space-between; background-color: #1e293b; padding: 12px 16px; border-radius: 10px; margin-bottom: 20px; font-size: 12px; color: #cbd5e1;">
              <div><strong>Source:</strong> <span style="color: #38bdf8; font-weight: bold;">${source}</span></div>
              <div><strong>Time:</strong> ${dateStr}</div>
            </div>

            <!-- Customer & Shipping Box -->
            <div style="background-color: #020617; border: 1px solid #1e293b; padding: 16px; border-radius: 12px; margin-bottom: 20px; font-size: 13px;">
              <h3 style="color: #38bdf8; margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                👤 Customer Details
              </h3>
              <div style="color: #f1f5f9; margin-bottom: 4px;"><strong>Customer Name:</strong> ${custName}</div>
              <div style="color: #f1f5f9; margin-bottom: 4px;"><strong>Phone:</strong> <span style="font-family: monospace; color: #a5b4fc;">${custPhone}</span></div>
              ${order.notes ? `<div style="color: #94a3b8; margin-top: 8px; font-style: italic;">📝 Notes / Address: ${order.notes}</div>` : ""}
            </div>

            <!-- Items Table -->
            <h3 style="color: #818cf8; margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
              📦 Order Line Items (${(order.items || []).length})
            </h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px;">
              <thead>
                <tr style="background-color: #1e293b; color: #94a3b8; text-transform: uppercase; font-size: 10px;">
                  <th style="padding: 8px; text-align: left;">Item</th>
                  <th style="padding: 8px; text-align: center;">Qty</th>
                  <th style="padding: 8px; text-align: right;">Unit Price</th>
                  <th style="padding: 8px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <!-- Financial Summary Box -->
            <div style="background-color: #020617; border: 1px solid #1e293b; padding: 16px; border-radius: 12px; font-size: 13px;">
              ${delivery > 0 ? `
                <div style="display: flex; justify-content: space-between; color: #94a3b8; margin-bottom: 6px;">
                  <span>Delivery Charges:</span>
                  <span style="color: #f1f5f9; font-family: monospace;">+ Rs. ${delivery.toLocaleString()}</span>
                </div>
              ` : ""}
              <div style="display: flex; justify-content: space-between; color: #ffffff; font-size: 16px; font-weight: 900; border-top: 1px solid #1e293b; pt: 10px; margin-top: 6px;">
                <span>TOTAL AMOUNT:</span>
                <span style="color: #4ade80; font-family: monospace;">Rs. ${grandTotal.toLocaleString()}</span>
              </div>
            </div>

            <!-- Action Note -->
            <div style="margin-top: 24px; text-align: center;">
              <p style="color: #64748b; font-size: 11px; margin-bottom: 12px;">
                Log in to PGS IMS Sales Queue to assign rider and dispatch this order.
              </p>
            </div>

          </div>

          <!-- Footer -->
          <div style="background-color: #020617; border-top: 1px solid #1e293b; padding: 16px; text-align: center; color: #475569; font-size: 11px;">
            PGS Game Shop IMS &bull; Automated Website Order Notification
          </div>

        </div>
      </body>
      </html>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "PGS IMS Orders <onboarding@resend.dev>",
        to: [ownerEmail],
        subject: `🚨 New Online Order Received! (${orderNumber}) - Rs. ${grandTotal.toLocaleString()}`,
        html: htmlContent,
      }),
    });

    const resendData = await resendRes.json();
    if (resendRes.ok) {
      console.log(`[EmailService] Order alert email sent successfully to ${ownerEmail} for ${orderNumber} (ID: ${resendData.id})`);
      return { success: true, data: resendData };
    } else {
      console.error(`[EmailService] Resend API error for ${orderNumber}:`, resendData);
      return { success: false, error: resendData.message || JSON.stringify(resendData) };
    }
  } catch (err: any) {
    console.error("[EmailService] Exception sending order email:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Sends a branded, customer-facing order confirmation email via Resend
 * when an order is placed on the PGS Ecommerce storefront.
 */
export async function sendCustomerOrderConfirmation(
  order: OrderEmailInput
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const recipientEmail = order.customerEmail?.trim();

    if (!recipientEmail) {
      return { success: false, error: "Customer email is not provided." };
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("[EmailService] Missing RESEND_API_KEY. Skipping customer confirmation email.");
      return { success: false, error: "Missing RESEND_API_KEY" };
    }

    const orderNumber = order.saleNumber || "SALE-ORDER";
    const custName = order.customerName || "Valued Customer";
    const custPhone = order.customerPhone || "N/A";
    const shippingAddr = order.shippingAddress || "As specified";
    const payMethod = order.paymentMethod || "CASH (Cash on Delivery)";
    const delivery = Number(order.deliveryCharges || 0);
    const subtotal = Number(order.subtotal || 0);
    const grandTotal = Number(order.totalAmount || (subtotal + delivery));
    const dateStr = order.createdAt
      ? new Date(order.createdAt).toLocaleDateString("en-PK", {
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "Asia/Karachi",
        })
      : new Date().toLocaleDateString("en-PK", {
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "Asia/Karachi",
        });

    // Itemized table rows
    const itemsHtml = (order.items || [])
      .map(
        (it) => `
        <tr style="border-bottom: 1px solid #334155;">
          <td style="padding: 12px 10px; color: #f8fafc; font-weight: 600; font-size: 13px;">
            ${it.productName || it.title || "Gaming Product"}
            <br/><span style="display: inline-block; margin-top: 4px; font-size: 11px; color: #94a3b8; background: #1e293b; padding: 2px 6px; border-radius: 4px;">Condition: ${it.condition || "New"}</span>
          </td>
          <td style="padding: 12px 10px; text-align: center; color: #cbd5e1; font-weight: 600; font-size: 13px;">${it.quantity}</td>
          <td style="padding: 12px 10px; text-align: right; color: #cbd5e1; font-family: monospace; font-size: 13px;">Rs. ${Number(it.unitPrice || 0).toLocaleString()}</td>
          <td style="padding: 12px 10px; text-align: right; color: #38bdf8; font-family: monospace; font-weight: bold; font-size: 13px;">Rs. ${(Number(it.lineTotal || (it.quantity * it.unitPrice))).toLocaleString()}</td>
        </tr>
      `
      )
      .join("");

    const fromAddress = process.env.FROM_EMAIL || "PGS Game Shop <info@pgsgameshop.online>";

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Confirmed - PGS Game Shop</title>
      </head>
      <body style="margin: 0; padding: 24px 12px; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
        <div style="max-width: 620px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
          
          <!-- Banner Header with Official PGS Game Shop Logo -->
          <div style="background: linear-gradient(135deg, #090d16 0%, #171c2e 50%, #090d16 100%); padding: 32px 24px; text-align: center; border-bottom: 2px solid #38bdf8;">
            <div style="margin-bottom: 16px;">
              <img 
                src="${STORE_LOGO_URL}" 
                alt="PGS Game Shop Karachi" 
                style="height: 75px; max-height: 75px; width: auto; max-width: 240px; object-fit: contain; display: inline-block; vertical-align: middle;"
              />
            </div>
            <div style="display: inline-block; background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.4); color: #4ade80; padding: 4px 16px; border-radius: 9999px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px;">
              ✓ ORDER CONFIRMED
            </div>
            <p style="color: #cbd5e1; margin: 8px 0 0 0; font-size: 14px; font-weight: 500;">
              Thank you for shopping with us! Your order has been placed and is being processed.
            </p>
          </div>

          <!-- Body Content -->
          <div style="padding: 24px;">
            
            <!-- Order Number Badge -->
            <div style="display: flex; justify-content: space-between; align-items: center; background-color: #1e293b; padding: 14px 18px; border-radius: 12px; margin-bottom: 24px;">
              <div>
                <span style="display: block; font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 700; letter-spacing: 0.5px;">Order Number</span>
                <span style="font-family: monospace; font-size: 15px; font-weight: 800; color: #38bdf8;">${orderNumber}</span>
              </div>
              <div style="text-align: right;">
                <span style="display: block; font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 700; letter-spacing: 0.5px;">Date</span>
                <span style="font-size: 13px; font-weight: 600; color: #f1f5f9;">${dateStr}</span>
              </div>
            </div>

            <!-- Customer & Delivery Information -->
            <div style="background-color: #020617; border: 1px solid #1e293b; padding: 18px; border-radius: 12px; margin-bottom: 24px;">
              <h3 style="color: #38bdf8; margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px;">
                📍 Shipping & Customer Details
              </h3>
              <div style="color: #f1f5f9; font-size: 14px; font-weight: 600; margin-bottom: 6px;">${custName}</div>
              <div style="color: #94a3b8; font-size: 13px; margin-bottom: 4px;"><strong>Phone:</strong> <span style="font-family: monospace; color: #e2e8f0;">${custPhone}</span></div>
              <div style="color: #94a3b8; font-size: 13px; margin-bottom: 4px;"><strong>Delivery Address:</strong> <span style="color: #e2e8f0;">${shippingAddr}</span></div>
              <div style="color: #94a3b8; font-size: 13px;"><strong>Payment Method:</strong> <span style="color: #4ade80; font-weight: 600;">${payMethod}</span></div>
            </div>

            <!-- Items Table -->
            <h3 style="color: #818cf8; margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px;">
              📦 Ordered Items (${(order.items || []).length})
            </h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <thead>
                <tr style="background-color: #1e293b; color: #94a3b8; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px;">
                  <th style="padding: 10px; text-align: left;">Product</th>
                  <th style="padding: 10px; text-align: center;">Qty</th>
                  <th style="padding: 10px; text-align: right;">Price</th>
                  <th style="padding: 10px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <!-- Financial Summary Box -->
            <div style="background-color: #020617; border: 1px solid #1e293b; padding: 18px; border-radius: 12px; margin-bottom: 24px;">
              <div style="display: flex; justify-content: space-between; color: #94a3b8; font-size: 13px; margin-bottom: 8px;">
                <span>Subtotal:</span>
                <span style="color: #f1f5f9; font-family: monospace;">Rs. ${subtotal.toLocaleString()}</span>
              </div>
              <div style="display: flex; justify-content: space-between; color: #94a3b8; font-size: 13px; margin-bottom: 12px;">
                <span>Delivery Charges:</span>
                <span style="color: #f1f5f9; font-family: monospace;">+ Rs. ${delivery.toLocaleString()}</span>
              </div>
              <div style="display: flex; justify-content: space-between; color: #ffffff; font-size: 16px; font-weight: 900; border-top: 1px solid #1e293b; padding-top: 12px;">
                <span>TOTAL PAYABLE (COD):</span>
                <span style="color: #4ade80; font-family: monospace; font-size: 18px;">Rs. ${grandTotal.toLocaleString()}</span>
              </div>
            </div>

            <!-- WhatsApp Support Card -->
            <div style="background: linear-gradient(135deg, rgba(37, 211, 102, 0.1) 0%, rgba(18, 140, 126, 0.05) 100%); border: 1px solid rgba(37, 211, 102, 0.3); padding: 18px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
              <h4 style="color: #25d366; margin: 0 0 6px 0; font-size: 14px; font-weight: 800;">
                💬 Need Help or Order Tracking?
              </h4>
              <p style="color: #cbd5e1; font-size: 12px; margin: 0 0 14px 0;">
                Our gaming team is ready to assist you on WhatsApp for dispatch and courier updates.
              </p>
              <a href="https://wa.me/923122319157?text=Hi%20PGS%20Game%20Shop,%20I%20have%20a%20question%20regarding%20my%20Order%20${encodeURIComponent(orderNumber)}"
                 style="display: inline-block; background-color: #25d366; color: #020617; text-decoration: none; font-size: 13px; font-weight: 800; padding: 10px 22px; border-radius: 8px;">
                Chat on WhatsApp (+92 312 2319157)
              </a>
            </div>

          </div>

          <!-- Footer -->
          <div style="background-color: #020617; border-top: 1px solid #1e293b; padding: 24px 20px; text-align: center; color: #64748b; font-size: 11px; line-height: 1.6;">
            <div style="margin-bottom: 10px;">
              <img 
                src="${STORE_LOGO_URL}" 
                alt="PGS Game Shop" 
                style="height: 38px; width: auto; opacity: 0.85; display: inline-block;"
              />
            </div>
            <p style="margin: 0 0 4px 0; color: #94a3b8; font-weight: 600;">PGS Game Shop &bull; Karachi, Pakistan</p>
            <p style="margin: 0;">Official Website: <a href="https://www.pgsgameshop.online" style="color: #38bdf8; text-decoration: none;">www.pgsgameshop.online</a></p>
          </div>

        </div>
      </body>
      </html>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [recipientEmail],
        subject: `Order Confirmed! Your PGS Game Shop Order #${orderNumber}`,
        html: htmlContent,
      }),
    });

    const resendData = await resendRes.json();
    if (resendRes.ok) {
      console.log(`[EmailService] Customer order confirmation sent to ${recipientEmail} for ${orderNumber} (ID: ${resendData.id})`);
      return { success: true, data: resendData };
    } else {
      console.error(`[EmailService] Resend API error for customer confirmation ${orderNumber}:`, resendData);
      return { success: false, error: resendData.message || JSON.stringify(resendData) };
    }
  } catch (err: any) {
    console.error("[EmailService] Exception sending customer order confirmation email:", err);
    return { success: false, error: err.message };
  }
}
