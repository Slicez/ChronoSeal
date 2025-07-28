// index.js
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const db = require('../database/db');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const args = message.content.trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const staffRoleIds = process.env.STAFF_ROLE_IDS.split(',');
  const modChannelId = process.env.MOD_CHANNEL_ID;

  const isStaff = message.member.roles.cache.some(role => staffRoleIds.includes(role.id));

  if (command === '!verify') {
    const userId = message.author.id;
    const blocked = db.isBlocked(userId);

    if (blocked) {
      return message.reply('❌ You have been blocked from verification.');
    }

    db.logAttempt(userId);
    const link = `http://localhost:${process.env.PORT}/verify?user=${userId}`;
    message.author.send(`Please verify yourself using the following link:\n${link}`);
    message.reply('📩 Check your DMs for the verification link.');
  }

  if (command === '!approve' && isStaff) {
    const userId = args[0];
    if (!userId) return message.reply('Please provide a user ID.');

    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      const member = await guild.members.fetch(userId);
      await member.roles.add(process.env.VERIFIED_ROLE_ID);
      await member.roles.remove(process.env.NON_VERIFIED_ROLE_ID);
      db.updateStatus(userId, 'approved');
      await member.send('✅ You have been approved and verified!');
      message.reply(`✅ <@${userId}> has been approved.`);
    } catch (err) {
      console.error(err);
      message.reply('❌ Failed to approve user.');
    }
  }

  if (command === '!deny' && isStaff) {
    const userId = args[0];
    const block = args[1] === 'block';
    const reason = args.slice(2).join(' ') || 'No reason provided.';
    if (!userId) return message.reply('Please provide a user ID.');

    try {
      if (block) {
        db.blockUser(userId);
        await message.reply(`❌ <@${userId}> has been denied and blocked.`);
      } else {
        db.updateStatus(userId, 'denied');
        await message.reply(`❌ <@${userId}> has been denied.`);
      }

      const user = await client.users.fetch(userId);
      await user.send(`❌ You have been denied verification. Reason: ${reason}`);
    } catch (err) {
      console.error(err);
      message.reply('❌ Failed to deny user.');
    }
  }

  if (command === '!unblock' && isStaff) {
    const userId = args[0];
    if (!userId) return message.reply('Please provide a user ID.');

    try {
      db.unblockUser(userId);
      message.reply(`🔓 <@${userId}> has been unblocked and can reverify.`);
    } catch (err) {
      console.error(err);
      message.reply('❌ Failed to unblock user.');
    }
  }

  if (command === '!setmodchannel' && isStaff) {
    try {
      db.setModChannel(message.guild.id, message.channel.id);
      message.reply(`✅ This channel has been set as the mod review channel.`);
    } catch (err) {
      console.error(err);
      message.reply('❌ Failed to set mod channel.');
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
