const express = require('express');
const cors = require("cors");
const mongoose = require('mongoose');
require('dotenv').config();
const path = require('path');

const app = express();

// Middleware
app.use(cors()); // Move CORS before other headers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
if (!process.env.MONGO_URL) {
  console.error('Error: MONGO_URL is not set in the environment variables.');
  process.exit(1); // Exit the app if MongoDB URL is not set
}
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log('Database is connected'))
  .catch(e => console.log('MongoDB connection error:', e));

// Set view engine and static files
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static("public"));

// Set Cross-Origin headers for COEP
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  
  // If you're using Express
  if (req.url.includes('cdn.tailwindcss.com') || 
      req.url.includes('cdnjs.cloudflare.com') || 
      req.url.includes('unpkg.com')) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
  next();
});

// Routes
const videoRoutes = require('./routes/video');
app.use('/', videoRoutes);

// Start server
const PORT = process.env.PORT || 3000; // Provide default port if env variable is missing
app.listen(PORT, () => {
  console.log(`Server running at port ${PORT}`);
});
