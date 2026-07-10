'use strict';

// QR helpers. A member's `qr_code_token` is encoded into a QR image; scanning it
// at the front desk (Phase 4) yields the token, which resolves the member for
// check-in. Here we just render the token to a PNG data URL the frontend can
// drop straight into an <img src>.

const QRCode = require('qrcode');

/**
 * Render a token string to a PNG data URL.
 * @param {string} token
 * @returns {Promise<string>} e.g. "data:image/png;base64,...."
 */
function tokenToDataUrl(token) {
  return QRCode.toDataURL(token, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 256,
  });
}

module.exports = { tokenToDataUrl };
