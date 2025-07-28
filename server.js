require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3000;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const storage = multer.memoryStorage();
const upload = multer({ storage }).fields([
  { name: 'canvasImage', maxCount: 1 },
  { name: 'selfieImage', maxCount: 1 }
]);

client.once('ready', () => {
  console.log(`🤖 Bot is ready as ${client.user.tag}`);
});

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.post('/verify', upload, async (req, res) => {
  const { username, userId, birthdate } = req.body;
  const files = req.files;

  // Validation
  if (!username || !userId || !birthdate || !files?.canvasImage || !files?.selfieImage) {
    return res.status(400).send('Missing required fields.');
  }

  const canvasBuffer = files.canvasImage[0].buffer;
  const selfieBuffer = files.selfieImage[0].buffer;

  const canvasAttachment = new AttachmentBuilder(canvasBuffer, { name: 'canvas.png' });
  const selfieAttachment = new AttachmentBuilder(selfieBuffer, { name: 'selfie.png' });

  try {
    const modChannel = await client.channels.fetch(process.env.MOD_CHANNEL_ID);
    if (!modChannel) {
      console.error('❌ Mod channel not found.');
      return res.status(500).send('Mod channel not found.');
    }

    await modChannel.send({
      content: `🛡️ **New Verification Submission**\n👤 Username: ${username}\n🆔 ID: ${userId}\n🎂 Birthdate: ${birthdate}`,
      files: [canvasAttachment, selfieAttachment],
    });

    res.redirect('/submitted.html');
  } catch (err) {
    console.error('❌ Error sending verification:', err);
    res.status(500).send('Error sending verification.');
  }
});

client.login(process.env.DISCORD_TOKEN);

app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});
