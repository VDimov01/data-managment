// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { requireAuth } = require('./middlewares/authMiddleware');

const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const authRouter = require('./routes/auth');
const publicRouter = require('./routes/public');


const offersRoutes = require('./routes/offers');
const shopsRoutes = require('./routes/shops');
const carImagesRoutes = require('./routes/carImages');
const vehicleRoutes = require('./routes/vehicle');
const editionsRoutes = require('./routes/editions');
const colorsRoutes = require('./routes/colors');
const attributesRoutes = require('./routes/attributes');
const cascadeRoutes = require('./routes/cascade');
const customerRoutes = require('./routes/customer');
const brochureRoutes = require('./routes/brochures');
const compareRoutes = require('./routes/compares');
const qrRoutes = require('./routes/qr');
const labelsRoutes = require('./routes/labels');
const vehicleImagesRoutes = require('./routes/vehicleImages');
const contractsRoutes = require('./routes/contracts');
const handoverRoutes = require('./routes/handover');
const offerRoutes = require('./routes/offer');

const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
// Allow-list multiple origins (comma-separated)
const ORIGINS = (process.env.FRONTEND_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.set('trust proxy', 1); // needed for secure cookies behind a proxy

// Middlewares
app.use(cors({
  origin(origin, cb) {
    // allow same-origin/non-browser or no origin
    if (!origin) return cb(null, true);
    if (ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// health
app.get('/api/health', (_, res) => res.json({ ok: true }));

// Public + auth (no guards)
app.use('/api/public', publicRouter);
app.use('/api/auth', authRouter);
app.use('/api/vehicleImages', vehicleImagesRoutes);
app.use('/api/car-images', carImagesRoutes);

// guard everything else
  app.use('/api', requireAuth); // this is the guard.. move it up after you rework the fetches in the frontend
  
  app.use('/api/offers', offerRoutes);
  app.use("/offers", express.static(path.join(__dirname, "offers")));
  app.use('/api/shops', shopsRoutes);
  app.use('/api/contracts', contractsRoutes);
  app.use("/contracts", express.static(path.join(__dirname, "contracts")));
  app.use('/api/vehicles', vehicleRoutes);
  app.use('/api/editions', editionsRoutes);
  app.use('/api/colors', colorsRoutes);
  app.use('/api/attributes', attributesRoutes);
  app.use('/api/cascade', cascadeRoutes);
  app.use('/api/brochures', brochureRoutes);
  app.use('/api/compares', compareRoutes);
  app.use('/api/qr', qrRoutes);
  app.use('/api/labels', labelsRoutes);
  app.use('/api/handover', handoverRoutes);
  
  app.use('/api/customers', customerRoutes);

// Test Route
app.get('/', (req, res) => {
  res.send('Server is running 🚀');
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
