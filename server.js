require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;
const STAFF_IDS = process.env.STAFF_ROLE_IDS.split(',');
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;
const NON_VERIFIED_ROLE_ID = process.env.NON_VERIFIED_ROLE_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

// Multer setup (memory storage)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    fieldSize: 10 * 1024 * 1024, // increase field size limit for canvasData
  },
});

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

//Server the form Page
app.get('/verify',(req,res) => {
  res.sendFile(path.join(__dirname, 'public', 'verify.html'));
});

// Handle verification submission
app.post('/verify', upload.fields([
  { name: 'selfieImage', maxCount: 1 },
]), async (req, res) => {
  try {
    const { username, userId, birthdate, canvasData } = req.body;
    const selfieImage = req.files?.selfieImage?.[0];

    if (!userId || !birthdate || !canvasData || !selfieImage) {
      return res.status(400).send('Missing required fields.');
    }

    const selfieBuffer = selfieImage.buffer;
    const canvasBuffer = Buffer.from(canvasData.replace(/^data:image\/png;base64,/, ""), 'base64');

    db.storeVerification({
      username,
      userId,
      birthdate,
      canvasImage: canvasBuffer,
      selfieImage: selfieBuffer
    });

    const modChannelId = process.env.MOD_CHANNEL_ID; // Make sure this returns the mod channel ID
    if (!modChannelId) return res.status(500).send('Mod channel not configured.');

    const modChannel = await client.channels.fetch(modChannelId);
    if (!modChannel) return res.status(404).send('Mod channel not found.');

    const embed = new EmbedBuilder()
      .setTitle('🛡️ New Verification Submission')
      .setDescription(`User: ${username} (${userId})\nBirthdate: ${birthdate}`)
      .setColor(0xffcc00)
      .setTimestamp();

    await modChannel.send({
      embeds: [embed],
      files: [
        { attachment: canvasBuffer, name: 'id_canvas.png' },
        { attachment: selfieBuffer, name: 'selfie.png' },
      ],
    });

    res.redirect('/submitted.html');
  } catch (error) {
    console.error('Error handling verification submission:', error);
    res.status(500).send('Something went wrong.');
  }
});

// Launch bot
client.once('ready', () => {
  console.log(`✅ Discord bot logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);

// Start express server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});