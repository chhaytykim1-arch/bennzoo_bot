import { BakongKHQR, khqrData, IndividualInfo } from 'bakong-khqr';
import QRCode from 'qrcode';
import dotenv from 'dotenv';
dotenv.config();

const DEFAULT_MERCHANT_ID = 'hut_soksitchey1@aclb';

/**
 * Parse numeric USD amount from string or number
 * e.g., "$2.50" -> 2.5, "1.5" -> 1.5, 2 -> 2.0
 */
export function parseAmount(priceStr) {
  if (typeof priceStr === 'number') return priceStr;
  if (!priceStr) return 1.0;
  const cleaned = String(priceStr).replace(/[^0-9.]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) || val <= 0 ? 1.0 : val;
}

/**
 * Generate Bakong KHQR QR Code & MD5 Hash & Image Buffer
 */
export async function generateKHQR({ amount, orderId, merchantId }) {
  try {
    const activeMerchantId = merchantId || process.env.BAKONG_MERCHANT_ID || DEFAULT_MERCHANT_ID;
    const numericAmount = parseAmount(amount);

    const khqr = new BakongKHQR();
    const optionalData = {
      currency: khqrData.currency.usd,
      amount: numericAmount,
      mobileNumber: '',
      storeLabel: 'BENZZO STORE',
      terminalLabel: 'Telegram Bot',
      billNumber: orderId,
      expirationTimestamp: Date.now() + 30 * 60 * 1000 // Valid for 30 minutes
    };

    const khqrResponse = khqr.generateIndividual(new IndividualInfo(
      activeMerchantId,
      'BENZZO STORE',
      'Phnom Penh',
      optionalData
    ));

    if (!khqrResponse || !khqrResponse.data || khqrResponse.status.code !== 0) {
      const errMsg = khqrResponse?.status?.message || 'Failed to generate KHQR string';
      console.error('KHQR Generation Error:', errMsg);
      return { success: false, error: errMsg };
    }

    const { qr, md5 } = khqrResponse.data;

    // Convert QR string to high-quality PNG Buffer for Telegram
    const qrBuffer = await QRCode.toBuffer(qr, {
      errorCorrectionLevel: 'M',
      type: 'png',
      margin: 2,
      width: 400,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    return {
      success: true,
      qr,
      md5,
      qrBuffer,
      amount: numericAmount,
      merchantId: activeMerchantId
    };
  } catch (err) {
    console.error('Error generating KHQR:', err.message || err);
    return { success: false, error: err.message || 'KHQR generation failed' };
  }
}

/**
 * Check Bakong KHQR Transaction status via NBC Bakong Open API
 */
export async function verifyBakongTransaction(md5Hash) {
  try {
    const token = process.env.BAKONG_TOKEN;
    if (!token) {
      console.error('CRITICAL: BAKONG_TOKEN is missing in .env!');
      return { paid: false, message: 'BAKONG_TOKEN is missing in environment variables' };
    }

    const res = await fetch('https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ md5: md5Hash })
    });

    if (!res.ok) {
      return { paid: false, message: `Bakong API HTTP ${res.status}` };
    }

    const json = await res.json();
    console.log(`Bakong Verification for MD5 ${md5Hash}:`, json);

    // Bakong returns responseCode: 0 when payment has been completed successfully
    if (json && json.responseCode === 0 && json.data) {
      return {
        paid: true,
        data: json.data,
        message: 'Payment verified successfully'
      };
    }

    return {
      paid: false,
      message: json.responseMessage || 'Transaction not found or not yet paid'
    };
  } catch (err) {
    console.error('Error verifying Bakong transaction:', err.message || err);
    return { paid: false, message: err.message || 'Network error verifying payment' };
  }
}
