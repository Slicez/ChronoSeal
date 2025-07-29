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
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CRITICAL FIX #1: PROPER CLIENT INIT ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: ['MESSAGE', 'CHANNEL', 'REACTION'] // Needed for button interactions
});

// ==================== CRITICAL FIX #2: ENHANCED ERROR HANDLING ====================
client.on('error', error => {
  console.error('Discord Client Error:', error);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled Promise Rejection:', error);
});

// ==================== STATIC FILES ====================
app.use(express.static(path.join(__dirname, 'public')));

// ==================== FILE UPLOAD ====================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
}).fields([
  { name: 'canvasImage', maxCount: 1 },
  { name: 'selfieImage', maxCount: 1 }
]);

// ==================== VERIFICATION ENDPOINT ====================
app.post('/verify', upload, async (req, res) => {
  try {
    console.log('\n=== NEW VERIFICATION REQUEST ===');
    console.log('Body:', req.body);
    console.log('Files:', req.files ? Object.keys(req.files) : 'No files');

    const { username, userId, birthdate } = req.body;
    const files = req.files;

    // Validation
    if (!username || !userId || !birthdate) {
      throw new Error('Missing required fields');
    }

    if (!files?.canvasImage || !files?.selfieImage) {
      throw new Error('Both images are required');
    }

    if (db.isBlocked(userId)) {
      throw new Error('User is blocked from verifying');
    }

    // ==================== CRITICAL FIX #3: PROPER ATTACHMENT HANDLING ====================
    const attachments = [
      new AttachmentBuilder(files.canvasImage[0].buffer, { name: 'id_proof.png' }),
      new AttachmentBuilder(files.selfieImage[0].buffer, { name: 'selfie.png' })
    ];

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🛡️ New Verification Request')
      .setDescription(`**User:** ${username}\n**ID:** ${userId}`)
      .addFields(
        { name: 'Birthdate', value: birthdate, inline: true },
        { name: 'Attempts', value: String(db.getVerification(userId)?.attempts || '1'), inline: true }
      )
      .setImage('attachment://id_proof.png')
      .setThumbnail('attachment://selfie.png')
      .setTimestamp();

    const actionRow = new ActionRowBuilder().addComponents(
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

    // ==================== CRITICAL FIX #4: CHANNEL VALIDATION ====================
    console.log('Attempting to send to channel:', process.env.MOD_CHANNEL_ID);
    const channel = await client.channels.fetch(process.env.MOD_CHANNEL_ID);
    if (!channel) {
      throw new Error(`Channel ${process.env.MOD_CHANNEL_ID} not found or inaccessible`);
    }

    await channel.send({
      embeds: [embed],
      files: attachments,
      components: [actionRow]
    });

    db.storeVerification({
      userId,
      username,
      birthdate,
      idImage: 'discord_upload',
      selfieImage: 'discord_upload',
      canvasImage: 'discord_upload'
    });

    console.log('Verification successfully sent to Discord');
    res.json({ success: true });

  } catch (error) {
    console.error('VERIFICATION FAILED:', error);
    if (req.body?.userId) db.logAttempt(req.body.userId);
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ==================== BUTTON INTERACTIONS ====================
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const [_, action, userId] = interaction.customId.split('_');
  console.log(`Processing ${action} for ${userId}`);

  try {
    switch (action) {
      case 'approve':
        await db.approveUser(userId, interaction.user.id);
        await interaction.reply({ content: `✅ Approved <@${userId}>`, ephemeral: true });
        break;
      case 'deny':
        await db.denyUser(userId, interaction.user.id);
        await interaction.reply({ content: `❌ Denied <@${userId}>`, ephemeral: true });
        break;
      case 'block':
        await db.blockUser(userId, interaction.user.id, 'Blocked via verification');
        await interaction.reply({ content: `⛔ Blocked <@${userId}>`, ephemeral: true });
        break;
    }

    await interaction.message.edit({
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`processed_${action}_${userId}`)
            .setLabel(`Processed (${action})`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        )
      ]
    });
  } catch (error) {
    console.error('INTERACTION ERROR:', error);
    await interaction.reply({
      content: '❌ Failed to process action',
      ephemeral: true
    });
  }
});

// ==================== START SERVER ====================
client.on('ready', () => {
  console.log(`\n🚀 Bot connected as ${client.user.tag}`);
  console.log(`📢 Monitoring channel: ${process.env.MOD_CHANNEL_ID}`);
});

client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🌐 Server running on port ${PORT}`);
      console.log(`📝 Verification page: http://localhost:${PORT}/verify.html`);
    });
  })
  .catch(error => {
    console.error('\n🔥 FATAL STARTUP ERROR:', error);
    process.exit(1);
  });