require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

// ==================== STATIC FILE CONFIGURATION ====================
app.use(express.static(path.join(__dirname, 'public'), {
  cacheControl: false,
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));

// Explicit routes for assets (optional but recommended)
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// ==================== DISCORD CLIENT SETUP ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ==================== FILE UPLOAD CONFIGURATION ====================
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, validMimes.includes(file.mimetype));
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 2
  }
}).fields([
  { name: 'canvasImage', maxCount: 1 },
  { name: 'selfieImage', maxCount: 1 }
]);

// ==================== ROUTES ====================
// Serve verify.html explicitly
app.get('/verify.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'verify.html'));
});

// Verification endpoint
app.post('/verify', upload, async (req, res) => {
  try {
    const { username, userId, birthdate } = req.body;
    const files = req.files;

    // Validation
    if (!username || !userId || !birthdate || !files?.canvasImage || !files?.selfieImage) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (db.isBlocked(userId)) {
      return res.status(403).json({ error: 'Verification blocked' });
    }

    // Prepare Discord message
    const [canvasAttachment, selfieAttachment] = [
      new AttachmentBuilder(files.canvasImage[0].buffer, { name: 'id_verified.png' }),
      new AttachmentBuilder(files.selfieImage[0].buffer, { name: 'selfie.png' })
    ];

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🛡️ New Verification Request')
      .setDescription(`**User:** ${username}\n**ID:** ${userId}`)
      .addFields(
        { name: 'Birthdate', value: birthdate, inline: true },
        { name: 'Attempts', value: db.getVerification(userId)?.attempts.toString() || '1', inline: true }
      )
      .setImage('attachment://id_verified.png')
      .setThumbnail('attachment://selfie.png')
      .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`verify_approve_${userId}`)
        .setLabel('✅ Approve')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`verify_deny_${userId}`)
        .setLabel('❌ Deny')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`verify_block_${userId}`)
        .setLabel('⛔ Block')
        .setStyle(ButtonStyle.Secondary)
    );

    // Send to mod channel
    const modChannel = await client.channels.fetch(process.env.MOD_CHANNEL_ID);
    await modChannel.send({
      embeds: [embed],
      files: [canvasAttachment, selfieAttachment],
      components: [buttons]
    });

    // Store verification
    db.storeVerification({
      userId,
      username,
      birthdate,
      idImage: 'discord_upload',
      selfieImage: 'discord_upload',
      canvasImage: 'discord_upload'
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Verification error:', error);
    if (req.body.userId) db.logAttempt(req.body.userId);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ==================== DISCORD INTERACTIONS ====================
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const [_, action, userId] = interaction.customId.split('_');

  try {
    switch (action) {
      case 'approve':
        db.approveUser(userId, interaction.user.id);
        await interaction.reply({ content: `✅ Approved <@${userId}>`, ephemeral: true });
        break;
      case 'deny':
        db.denyUser(userId, interaction.user.id);
        await interaction.reply({ content: `❌ Denied <@${userId}>`, ephemeral: true });
        break;
      case 'block':
        db.blockUser(userId, interaction.user.id, 'Manual block by moderator');
        await interaction.reply({ content: `⛔ Blocked <@${userId}>`, ephemeral: true });
        break;
    }

    // Disable buttons after processing
    await interaction.message.edit({
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('processed')
            .setLabel(`Processed (${action})`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        )
      ]
    });
  } catch (error) {
    console.error('Interaction error:', error);
    await interaction.reply({ content: '❌ Failed to process action', ephemeral: true });
  }
});

// ==================== SERVER STARTUP ====================
client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
      console.log(`Verify page: http://0.0.0.0:${PORT}/verify.html`);
    });
  })
  .catch(error => {
    console.error('Fatal startup error:', error);
    process.exit(1);
  });

// ==================== CLEANUP HANDLERS ====================
process.on('SIGTERM', () => {
  client.destroy();
  db.close();
  process.exit(0);
});

// Debug endpoint to verify static files
app.get('/debug-static', (req, res) => {
  const publicFiles = fs.readdirSync(path.join(__dirname, 'public'));
  res.json({
    staticFiles: publicFiles,
    verifyHtmlExists: fs.existsSync(path.join(__dirname, 'public', 'verify.html'))
  });
});