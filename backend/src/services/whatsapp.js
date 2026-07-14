'use strict';

// WhatsApp transport — the thin layer that actually talks to the Meta Cloud API
// (spec §8). Business-initiated messages must use pre-approved templates, so this
// only sends template messages. It is gated by config.whatsapp.enabled: with no
// credentials it does nothing and reports `skipped` (dry-run) — the caller
// (services/notifications.js) still logs the intended message either way.

const config = require('../config/env');

/**
 * Normalise a phone number to E.164 digits (no '+') with a country code.
 * Egyptian mobiles like "0100 000 0011" -> "201000000011".
 * @param {string} phone
 * @param {string} [countryCode] defaults to config (Egypt = '20')
 * @returns {string}
 */
function toE164(phone, countryCode = config.whatsapp.countryCode) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `${countryCode}${digits.slice(1)}`;
  if (digits.startsWith(countryCode)) return digits;
  return `${countryCode}${digits}`;
}

/**
 * Send a WhatsApp template message via the Meta Cloud API.
 * @param {{ to:string, templateName:string, params?:Array, lang?:string }} args
 * @returns {Promise<{ ok:boolean, skipped?:boolean, response?:object }>}
 * @throws on a non-2xx response from Meta (caught by the caller, logged as failed)
 */
async function sendTemplate({ to, templateName, params = [], lang }) {
  const wa = config.whatsapp;
  if (!wa.enabled) return { ok: true, skipped: true };

  const url = `https://graph.facebook.com/${wa.apiVersion}/${wa.phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: lang || wa.templateLang },
      components: params.length
        ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) }]
        : [],
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${wa.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Meta API error ${res.status}`);
    err.response = json;
    throw err;
  }
  return { ok: true, response: json };
}

module.exports = { toE164, sendTemplate };
