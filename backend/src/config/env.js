'use strict';

// Loads and validates environment variables once, at boot. Fail fast with a
// clear message if anything required is missing — better a loud crash on
// startup than a confusing 500 on the first request.

const path = require('path');
const dotenv = require('dotenv');

// Load backend/.env regardless of the current working directory.
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];

const missing = REQUIRED.filter((key) => !process.env[key] || process.env[key].trim() === '');
if (missing.length > 0) {
  // eslint-disable-next-line no-console
  console.error(
    `[config] Missing required environment variable(s): ${missing.join(', ')}.\n` +
      '        Copy .env.example to .env and fill these in before starting.'
  );
  process.exit(1);
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 4000,
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },
  // Allowed browser origin(s) for CORS. Comma-separated list supported.
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  // WhatsApp / Meta Cloud API (spec §8). All optional: with no phone number id +
  // access token the notification service runs in DRY-RUN mode (logs to
  // notifications_log instead of calling Meta). Fill these in .env to go live.
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    templateLang: process.env.WHATSAPP_TEMPLATE_LANG || 'ar',
    countryCode: process.env.WHATSAPP_COUNTRY_CODE || '20', // Egypt
  },
};

// Live only when both credentials are present; otherwise dry-run (log-only).
config.whatsapp.enabled = Boolean(config.whatsapp.phoneNumberId && config.whatsapp.accessToken);

module.exports = config;
