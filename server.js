require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Init Discord bot
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.login(process.env.DISCORD_TOKEN);

// DB setup
const db = new Database('./database/verifications.db');
db.prepare(`
  CREATE TABLE IF NOT EXISTS verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    username TEXT,
    birthdate TEXT,
    canvas_image BLOB,
    selfie_image BLOB,
    attempts INTEGER DEFAULT 1,
    blocked INTEGER DEFAULT 0
  )
`).run();

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({ storage }).fields([
  { name: 'idImage', maxCount: 1 },
  { name: 'selfieImage', maxCount: 1 },
  { name: 'canvasImage', maxCount: 1 }
]);

// POST /verify
app.post('/verify', upload, async (req, res) => {
  const { username, userId, birthdate } = req.body;
  const idImage = req.files['idImage']?.[0]; // Still required for validation, but not sent
  const selfieImage = req.files['selfieImage']?.[0];
  const canvasImage = req.files['canvasImage']?.[0];

  if (!userId || !idImage || !selfieImage || !canvasImage) {
    return res.status(400).send('Missing required fields.');
  }

  const existing = db.prepare('SELECT * FROM verifications WHERE user_id = ?').get(userId);
  if (existing && existing.blocked) {
    return res.status(403).send('You are blocked from verifying.');
  }

  if (existing) {
    db.prepare('UPDATE verifications SET attempts = attempts + 1 WHERE user_id = ?').run(userId);
  } else {
    db.prepare(`
      INSERT INTO verifications (user_id, username, birthdate, canvas_image, selfie_image)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, username, birthdate, canvasImage.buffer, selfieImage.buffer);
  }

  // Send to mod channel
  const modChannel = await client.channels.fetch(process.env.MOD_CHANNEL_ID);
  if (modChannel && modChannel.isTextBased()) {
    const embed = new EmbedBuilder()
      .setTitle('New Verification Submission')
      .addFields(
        { name: 'Username', value: username, inline: true },
        { name: 'User ID', value: userId, inline: true },
        { name: 'Birthday', value: birthdate, inline: true }
      )
      .setColor(0xffcc00)
      .setFooter({ text: 'ChronoSeal Verification' })
      .setTimestamp();

    const attachments = [
      new AttachmentBuilder(canvasImage.buffer, { name: 'canvas.png' }),
      new AttachmentBuilder(selfieImage.buffer, { name: 'selfie.png' })
    ];

    await modChannel.send({ embeds: [embed], files: attachments });
  }

  // Give non-verified role
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(userId);
    const nonVerifiedRoleId = process.env.NON_VERIFIED_ROLE_ID;

    if (nonVerifiedRoleId && member && !member.roles.cache.has(nonVerifiedRoleId)) {
      await member.roles.add(nonVerifiedRoleId);
    }
  } catch (err) {
    console.error('Role assignment error:', err);
  }

  res.redirect('/submitted.html');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
