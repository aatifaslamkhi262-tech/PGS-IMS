# Mobile Testing Setup Guide for PGS-IMS

## ✅ Configuration Completed

I have successfully configured the Next.js development server to listen on all network interfaces:

**Changes Made:**
- Updated `package.json` dev script: `"dev": "next dev -H 0.0.0.0"`
- This makes the server accessible from your local network

**Your PC Local IP:** `192.168.100.94`
**Default Next.js Port:** `3000`

## 🔧 Windows Firewall Setup (REQUIRED)

You need to add a Windows Firewall rule to allow incoming connections on port 3000. Run PowerShell as Administrator and execute:

```powershell
netsh advfirewall firewall add rule name="Next.js Development Server" dir=in action=allow protocol=TCP localport=3000
```

Alternative using Windows Firewall GUI:
1. Open Windows Defender Firewall with Advanced Security
2. Click "Inbound Rules" → "New Rule"
3. Select "Port" → "TCP" → Specific local ports: `3000`
4. Select "Allow the connection"
5. Apply to all profiles (Domain, Private, Public)
6. Name: "Next.js Development Server"

## 📱 Mobile Access URL

After starting the development server, access from your phone using:

**HTTP URL:** `http://192.168.100.94:3000`

## 📷 Camera Access - HTTPS Setup (IMPORTANT)

**Problem:** Modern mobile browsers (Chrome, Safari) block camera access on HTTP (non-secure) connections for security reasons.

**Solution:** Set up local HTTPS using mkcert

### Step 1: Install mkcert

**Windows (using Chocolatey):**
```powershell
choco install mkcert
```

**Or download manually:**
1. Download from: https://github.com/FiloSottile/mkcert/releases
2. Place `mkcert.exe` in a folder in your PATH

### Step 2: Install local CA
```powershell
mkcert -install
```
(Click "Yes" when prompted to install the certificate)

### Step 3: Generate SSL certificate
```powershell
cd D:\PGS-IMS\pgs-ims
mkcert localhost 127.0.0.1 192.168.100.94
```
This creates: `localhost+2.pem` and `localhost+2-key.pem`

### Step 4: Configure Next.js for HTTPS

Create or update `next.config.ts`:

```typescript
import type { NextConfig } from "next";
import https from "https";
import fs from "fs";

const nextConfig: NextConfig = {
  // Your existing config
};

// For HTTPS development (optional - you can also use a proxy)
export default nextConfig;
```

**Better approach: Use a local HTTPS proxy**

Install `local-ssl-proxy`:
```powershell
npm install -g local-ssl-proxy
```

Run the proxy:
```powershell
local-ssl-proxy --key localhost+2-key.pem --cert localhost+2.pem --source 3001 --target 3000
```

Then access via HTTPS: `https://192.168.100.94:3001`

## 🚀 Testing Steps

### Basic HTTP Testing (No Camera)

1. **Start the development server:**
   ```powershell
   cd D:\PGS-IMS\pgs-ims
   npm run dev
   ```

2. **On your phone:**
   - Connect to the same WiFi network as your PC
   - Open browser and type: `http://192.168.100.94:3000`
   - Test all pages and functionality (except camera)

3. **Test functionality:**
   - Product listing page
   - Product creation
   - Product editing
   - Product search
   - Barcode generation

### HTTPS + Camera Testing

1. **Complete HTTPS setup** (steps above)

2. **Start the development server:**
   ```powershell
   cd D:\PGS-IMS\pgs-ims
   npm run dev
   ```

3. **Start HTTPS proxy:**
   ```powershell
   local-ssl-proxy --key localhost+2-key.pem --cert localhost+2.pem --source 3001 --target 3000
   ```

4. **On your phone:**
   - Access: `https://192.168.100.94:3001`
   - You may see a security warning (accept it - it's your local certificate)
   - Navigate to a product page
   - Click "Scan with Camera" button
   - Grant camera permissions
   - Test barcode scanning

## 🔍 Troubleshooting

### Can't access from phone:
1. Verify PC and phone are on same WiFi network
2. Check Windows Firewall rule is active
3. Verify development server is running
4. Try pinging PC from phone: `ping 192.168.100.94`

### Camera not working:
1. Ensure you're using HTTPS, not HTTP
2. Accept the security certificate warning on your phone
3. Check browser permissions for camera access
4. Verify your phone has a working camera

### Certificate errors:
1. Make sure you installed the local CA: `mkcert -install`
2. Regenerate certificates if needed
3. Clear browser cache and try again

## 📋 Quick Reference

**HTTP URL:** `http://192.168.100.94:3000`
**HTTPS URL:** `https://192.168.100.94:3001` (after proxy setup)
**PC IP:** `192.168.100.94`
**Port:** `3000` (HTTP), `3001` (HTTPS proxy)

## ⚠️ Important Notes

- The HTTPS setup is only for development testing
- Don't use these certificates in production
- Only use on your local network
- Camera access requires HTTPS on mobile browsers
- The existing app functionality remains unchanged
