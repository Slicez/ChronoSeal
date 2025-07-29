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

// ==================== DISCORD CLIENT SETUP ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.on('debug', console.log);
client.on('warn', console.log);

// ==================== EXPRESS CONFIGURATION ====================
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  etag: false
}));

// ==================== FILE UPLOAD CONFIGURATION ====================
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
    fileSize: 5 * 1024 * 1024,
    files: 2
  }
}).fields([
  { name: 'idImage', maxCount: 1 },
  { name: 'selfieImage', maxCount: 1 }
]);

// ==================== ROUTES ====================
app.get('/verify.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'verify.html'));
});

app.post('/verify', upload, async (req, res) => {
  try {
    console.log('\n=== NEW VERIFICATION REQUEST ===');
    const { username, userId, birthdate } = req.body;
    const files = req.files;

    console.log('[DEBUG] Received fields:', { username, userId, birthdate });
    console.log('[DEBUG] Received files:', Object.keys(files || {}));

    if (!username || !userId || !birthdate) throw new Error('Missing required fields');
    if (!files?.idImage || !files?.selfieImage) throw new Error('Both images are required');
    if (db.isBlocked(userId)) throw new Error('User is blocked from verifying');

    const attachments = [
      new AttachmentBuilder(files.idImage[0].buffer, { name: 'id_proof.png' }),
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

    console.log('[DEBUG] Fetching channel:', process.env.MOD_CHANNEL_ID);
    const channel = await client.channels.fetch(process.env.MOD_CHANNEL_ID);

    if (!channel) throw new Error('Channel not found or inaccessible');

    // Test message
    await channel.send('✅ Test message received. Attempting to send embed...');

    // Attempt to send embed
    await channel.send({
      embeds: [embed],
      files: attachments,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`verify_approve_${userId}`)
            .setLabel('✅ Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`verify_deny_${userId}`)
            .setLabel('❌ Deny')
            .setStyle(ButtonStyle.Danger)
        )
      ]
    }).then(() => {
      console.log('[DEBUG] Embed sent successfully.');
    }).catch(err => {
      console.error('❌ Failed to send embed:', err);
      throw new Error('Failed to send embed to Discord');
    });

    // Store the verification
    db.storeVerification({
      userId,
      username,
      birthdate,
      idImage: 'discord_upload',
      selfieImage: 'discord_upload'
    });

    res.sendFile(path.join(__dirname, 'public', 'submitted.html'));

  } catch (error) {
    console.error('VERIFICATION ERROR:', error.message);
    console.error('Full error:', error.stack);
    if (req.body?.userId) db.logAttempt(req.body.userId);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get('/submitted.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'submitted.html'));
});

// ==================== DISCORD INTERACTIONS ====================
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

// ==================== STARTUP ====================
client.on('ready', () => {
  console.log(`\n🚀 Bot connected as ${client.user.tag}`);
  console.log(`📢 Monitoring channel: ${process.env.MOD_CHANNEL_ID}`);
});

client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🌐 Server running on port ${PORT}`);
      console.log(`📝 Verification page: http://localhost:${PORT}/verify.html`);
    });
  })
  .catch(error => {
    console.error('\n🔥 FATAL STARTUP ERROR:', error);
    process.exit(1);
  });

process.on('SIGTERM', () => {
  client.destroy();
  db.close();
  process.exit(0);
});
