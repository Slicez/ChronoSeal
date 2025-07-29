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

// ✅ Corrected DB import for root-level files
const db = require(path.join(__dirname, 'database/db'));

const app = express();
const PORT = process.env.PORT || 3000;
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Multer setup
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
}).fields([
  { name: 'canvasImage', maxCount: 1 },
  { name: 'selfieImage', maxCount: 1 }
]);

// Discord ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Routes
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

    // Discord message logic here...
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start server
client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
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