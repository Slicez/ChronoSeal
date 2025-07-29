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
const db = require('.database/db.js');

// Initialize
const app = express();
const PORT = process.env.PORT || 3000;

// Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Configure File Uploads
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (validMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, or WEBP images allowed'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 2
  }
}).fields([
  { name: 'canvasImage', maxCount: 1 }, // Annotated ID
  { name: 'selfieImage', maxCount: 1 }  // Selfie
]);

// Discord Ready
client.once('ready', () => {
  console.log(`🛡️ Bot online as ${client.user.tag}`);
  db.prepare("PRAGMA journal_mode = WAL").run(); // Better write performance
});

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: 'File upload error: ' + err.message });
  } else {
    next(err);
  }
});

// Routes
app.post('/verify', upload, async (req, res) => {
  try {
    const { username, userId, birthdate } = req.body;
    const files = req.files;

    // Validation
    if (!username || !userId || !birthdate || !files?.canvasImage || !files?.selfieImage) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if blocked
    if (db.isBlocked(userId)) {
      return res.status(403).json({ error: 'Verification blocked. Contact moderators.' });
    }

    // Store initial record
    db.storeVerification({
      userId,
      username,
      birthdate,
      idImage: 'pending_upload',
      selfieImage: 'pending_upload',
      canvasImage: 'pending_upload'
    });

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

    // Update record
    db.prepare(`
      UPDATE verifications 
      SET status = 'under_review', 
          id_image = 'discord_upload',
          selfie_image = 'discord_upload',
          canvas_image = 'discord_upload'
      WHERE user_id = ?
    `).run(userId);

    res.json({ success: true });

  } catch (error) {
    console.error('Verification error:', error);
    if (req.body.userId) db.logAttempt(req.body.userId);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

// Discord Interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const [_, action, userId] = interaction.customId.split('_');

  try {
    switch (action) {
      case 'approve':
        db.approveUser(userId);
        await assignVerifiedRole(userId);
        await interaction.reply({
          content: `✅ Approved <@${userId}>`,
          ephemeral: true
        });
        break;

      case 'deny':
        db.denyUser(userId);
        await interaction.reply({
          content: `❌ Denied <@${userId}>`,
          ephemeral: true
        });
        break;

      case 'block':
        db.blockUser(userId);
        await interaction.reply({
          content: `⛔ Blocked <@${userId}> from verifying`,
          ephemeral: true
        });
        break;
    }

    // Update message buttons
    const newButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('processed')
        .setLabel(`Processed (${action})`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    await interaction.message.edit({ components: [newButtons] });

  } catch (error) {
    console.error('Interaction error:', error);
    await interaction.reply({
      content: '❌ Failed to process action',
      ephemeral: true
    });
  }
});

// Helper Functions
async function assignVerifiedRole(userId) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(userId);
    await member.roles.add(process.env.VERIFIED_ROLE_ID);
  } catch (error) {
    console.error('Role assignment failed:', error);
  }
}

// Start Server
client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch(error => {
    console.error('Fatal startup error:', error);
    process.exit(1);
  });

// Cleanup on exit
process.on('SIGTERM', () => {
  client.destroy();
  db.close();
  process.exit(0);
});