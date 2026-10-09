export interface OrderEmailInput {
  saleNumber: string;
  saleSource?: string;
  customerName?: string;
  customerPhone?: string;
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

export async function sendOwnerOrderAlert(order: OrderEmailInput): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const ownerEmail = process.env.OWNER_EMAIL 

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
          
          <!-- Banner Header -->
          <div style="background: linear-gradient(135deg, #4f46e5 0%, #0284c7 100%); padding: 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;">
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
