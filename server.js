require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { 
  Client, 
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const db = require(path.join(__dirname, 'database/db'));
const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CRITICAL ADDITIONS ====================
// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public'), {
  // Cache control for Zeabur
  maxAge: 0,
  etag: false,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store');
  }
}));

// Explicit route for verify.html to handle query parameters
app.get('/verify.html', (req, res) => {
  // Debugging: Log the query parameters
  console.log('Received request with params:', req.query);
  
  res.sendFile(path.join(__dirname, 'public', 'verify.html'), {
    headers: {
      'Cache-Control': 'no-cache'
    }
  });
});

// ==================== YOUR EXISTING CODE ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Multer setup (unchanged)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
}).fields([
  { name: 'canvasImage', maxCount: 1 },
  { name: 'selfieImage', maxCount: 1 }
]);

// Discord ready (unchanged)
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Verification endpoint (unchanged)
app.post('/verify', upload, async (req, res) => {
  try {
    const { username, userId, birthdate } = req.body;
    
    if (!username || !userId || !birthdate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (db.isBlocked(userId)) {
      return res.status(403).json({ error: 'User is blocked' });
    }

    db.storeVerification({ userId, username, birthdate });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check endpoint (recommended for Zeabur)
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Start server (modified for Zeabur compatibility)
client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to start:', err);
    process.exit(1);
  });

process.on('SIGTERM', () => {
  client.destroy();
  db.close();
  process.exit(0);
});