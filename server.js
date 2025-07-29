require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Discord Client Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Configure Secure File Upload
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (validMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, or WEBP allowed.'));
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

// Discord Ready Event
client.once('ready', () => {
  console.log(`🔗 Discord Bot Connected as ${client.user.tag}`);
});

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Verification Endpoint
app.post('/verify', upload, async (req, res) => {
  try {
    // Input Sanitization
    const { username, userId, birthdate } = req.body;
    const clean = {
      username: username.replace(/[\\<>@#&!]/g, '').trim(),
      userId: userId.replace(/\D/g, ''), // Numbers only
      birthdate: new Date(birthdate).toISOString().split('T')[0] // YYYY-MM-DD
    };

    // Validation
    if (!clean.username || !clean.userId || !clean.birthdate) {
      return res.status(400).json({ error: 'All text fields are required' });
    }

    if (!req.files?.canvasImage || !req.files?.selfieImage) {
      return res.status(400).json({ error: 'Both images are required' });
    }

    // Prepare Discord Attachments
    const attachments = [
      new AttachmentBuilder(req.files.canvasImage[0].buffer, { name: 'verified_id.png' }),
      new AttachmentBuilder(req.files.selfieImage[0].buffer, { name: 'selfie.png' })
    ];

    // Create Rich Embed
    const embed = new EmbedBuilder()
      .setColor(0x5865F2) // Discord blurple
      .setTitle('🛡️ Identity Verification Request')
      .setDescription('New submission requires review')
      .addFields(
        { name: '👤 Username', value: `\`${clean.username}\``, inline: true },
        { name: '🆔 User ID', value: `\`${clean.userId}\``, inline: true },
        { name: '🎂 Birthdate', value: clean.birthdate, inline: true }
      )
      .setImage('attachment://verified_id.png') // Annotated ID as main image
      .setThumbnail('attachment://selfie.png')  // Selfie as thumbnail
      .setFooter({ text: 'Submitted at' })
      .setTimestamp();

    // Send to Mod Channel
    const modChannel = await client.channels.fetch(process.env.MOD_CHANNEL_ID);
    await modChannel.send({ 
      embeds: [embed], 
      files: attachments 
    });

    // Success Response
    res.json({ 
      success: true,
      redirect: '/submitted.html' 
    });

  } catch (error) {
    console.error('🚨 Verification Error:', error);
    
    // Custom Error Messages
    let userMessage = 'Verification failed. Please try again.';
    if (error.message.includes('Invalid file type')) userMessage = 'Only JPEG/PNG/WEBP images allowed';
    if (error.message.includes('File too large')) userMessage = 'Max file size is 5MB';
    
    res.status(500).json({ 
      success: false,
      error: userMessage 
    });
  }
});

// Start Server
client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🌐 Server running on port ${PORT}`);
      console.log(`🛡️ Verification endpoint: http://localhost:${PORT}/verify`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to login to Discord:', err);
    process.exit(1);
  });

// Graceful Shutdown
process.on('SIGINT', () => {
  console.log('\n🔴 Shutting down gracefully...');
  client.destroy();
  process.exit();
});