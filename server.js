require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
const db = require('./database/db.js');

const app = express();
const port = process.env.PORT || 3000;

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

const NON_VERIFIED_ROLE_ID = process.env.NON_VERIFIED_ROLE_ID;

// ✅ Verification submission handler
app.post('/verify', upload.fields([
  { name: 'selfieImage', maxCount: 1 },
]), async (req, res) => {
  try {
    const { username, userId, birthdate, canvasData } = req.body;
    const selfieImage = req.files?.selfieImage?.[0];

    if (!userId || !birthdate || !canvasData || !selfieImage) {
      return res.status(400).send('Missing required fields.');
    }

    const canvasBuffer = Buffer.from(canvasData.replace(/^data:image\/png;base64,/, ""), 'base64');
    const selfieBuffer = selfieImage.buffer;

    db.storeVerification({
      username,
      userId,
      birthdate,
      canvasImage: canvasBuffer,
      selfieImage: selfieBuffer
    });

    const modChannelId = process.env.MOD_CHANNEL_ID;
    const modChannel = await client.channels.fetch(modChannelId).catch(() => null);
    if (!modChannel) return res.status(500).send('Mod channel not found.');

    const embed = new EmbedBuilder()
      .setTitle('🛡️ New Verification Submission')
      .setDescription(`User: ${username} (${userId})\nBirthdate: ${birthdate}`)
      .setColor(0xffcc00)
      .setTimestamp();

    await modChannel.send({
      embeds: [embed],
      files: [
        { attachment: canvasBuffer, name: 'id_canvas.png' },
        { attachment: selfieBuffer, name: 'selfie.png' }
      ]
    });

    // ✅ Auto-assign non-verified role
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member && NON_VERIFIED_ROLE_ID) {
        await member.roles.add(NON_VERIFIED_ROLE_ID).catch(console.error);
      }
    }

    res.redirect('/submitted.html');
  } catch (error) {
    console.error('Error handling verification:', error);
    res.status(500).send('Internal Server Error');
  }
});

// ✅ Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

// ✅ Start Discord bot
client.once('ready', () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
