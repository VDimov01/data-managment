// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const authRoutes = require('./routes/auth');
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
const publicRoutes = require('./routes/public');
const qrRoutes = require('./routes/qr');
const labelsRoutes = require('./routes/labels');
const vehicleImagesRoutes = require('./routes/vehicleImages');
const contractsRoutes = require('./routes/contracts');

const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());
//app.use(express.json({ limit: '2mb' }));

app.use('/api/login', authRoutes);
app.use('/api/offers', offersRoutes);
app.use("/offers", express.static(path.join(__dirname, "offers")));
app.use('/api/shops', shopsRoutes);
app.use('/api/contracts', contractsRoutes);
app.use("/contracts", express.static(path.join(__dirname, "contracts")));
app.use('/api/car-images', carImagesRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/editions', editionsRoutes);
app.use('/api/colors', colorsRoutes);
app.use('/api/attributes', attributesRoutes);
app.use('/api/cascade', cascadeRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/brochures', brochureRoutes);
app.use('/api/compares', compareRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/labels', labelsRoutes);
app.use('/api/vehicleImages', vehicleImagesRoutes);

// Test Route
app.get('/', (req, res) => {
  res.send('Server is running 🚀');
});

// Sample route: create offer with UUID
// app.post('/api/offers', async (req, res) => {
//   const { client_first_name, client_last_name, client_email } = req.body;

//   if (!client_first_name || !client_last_name || !client_email) {
//     return res.status(400).json({ error: 'Missing client data' });
//   }

//   const offerId = uuidv4();
//   const createdAt = new Date();

//   try {
//     await db.execute(
//       'INSERT INTO offers (id, client_first_name, client_last_name, client_email, created_at) VALUES (?, ?, ?, ?, ?)',
//       [offerId, client_first_name, client_last_name, client_email, createdAt]
//     );

//     res.status(201).json({ success: true, offerId });
//   } catch (err) {
//     console.error('Error creating offer:', err);
//     res.status(500).json({ error: 'Failed to create offer' });
//   }
// });

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
