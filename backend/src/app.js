'use strict';

// Express application wiring. Kept separate from server.js so the app can be
// imported for tests without opening a port.

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const config = require('./config/env');
const apiRoutes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Security headers.
app.use(helmet());

// CORS — allow the React dev/prod origin(s) from config.
app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  })
);

// Body parsing (JSON only for this API).
app.use(express.json());

// Request logging (concise in prod, verbose in dev).
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

// All API routes live under /api.
app.use('/api', apiRoutes);

// 404 for anything unmatched, then the central error handler (must be last).
app.use(notFound);
app.use(errorHandler);

module.exports = app;
