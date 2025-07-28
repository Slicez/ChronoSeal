require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const express = require('express');
const path = require('path');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

// Auto-assign NON_VERIFIED_ROLE on member join
client.on('guildMemberAdd', async (member) => {
  try {
    const nonVerifiedRole = member.guild.roles.cache.get(process.env.NON_VERIFIED_ROLE_ID);
    if (nonVerifiedRole) {
      await member.roles.add(nonVerifiedRole);
      console.log(`Assigned NON_VERIFIED_ROLE to ${member.user.tag}`);
    } else {
      console.warn('NON_VERIFIED_ROLE_ID not found in guild.');
    }
  } catch (err) {
    console.error('Error assigning NON_VERIFIED_ROLE:', err);
  }
});

// SQLite DB setup
const Database = require('better-sqlite3');
const db = new Database('./database/verifications.db');

// !verify command
client.on('messageCreate', async (message) => {
  if (message.content === '!verify') {
    const userId = message.author.id;
    const formURL = `${process.env.VERIFY_FORM_URL}?userId=${userId}`;
    try {
      await message.author.send(`🛡️ Please complete the verification form:\n${formURL}`);
      await message.reply('📩 Check your DMs for the verification link!');
    } catch (err) {
      console.error('Failed to send DM:', err);
      await message.reply('⚠️ I couldn’t send you a DM. Please enable DMs from server members.');
    }
  }
});

// !approve command
client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!approve')) return;

  const args = message.content.trim().split(/ +/g);
  const targetId = args[1];

  if (!targetId || isNaN(targetId)) {
    return message.reply('Usage: `!approve <userId>`');
  }

  const guild = message.guild;
  const member = guild.members.cache.get(targetId);
  if (!member) return message.reply('User not found in the server.');

  try {
    const verifiedRole = guild.roles.cache.get(process.env.VERIFIED_ROLE_ID);
    const nonVerifiedRole = guild.roles.cache.get(process.env.NON_VERIFIED_ROLE_ID);

    if (verifiedRole) await member.roles.add(verifiedRole);
    if (nonVerifiedRole) await member.roles.remove(nonVerifiedRole);

    await member.send('✅ You have been approved and verified!');
    await message.reply(`Approved <@${targetId}> and assigned the Verified role.`);
  } catch (err) {
    console.error(err);
    message.reply('Failed to approve user.');
  }
});

// !deny command
client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!deny')) return;

  const args = message.content.trim().split(/ +/g);
  const targetId = args[1];
  const reason = args.slice(2).join(' ') || 'No reason provided.';

  if (!targetId || isNaN(targetId)) {
    return message.reply('Usage: `!deny <userId> <reason>`');
  }

  try {
    const guild = message.guild;
    const member = guild.members.cache.get(targetId);
    if (!member) return message.reply('User not found in the server.');

    await member.send(`❌ Your verification was denied.\nReason: ${reason}`);
    await message.reply(`Denied <@${targetId}>. They were notified.`);

    // Optional: Track or delete the DB record here if needed
  } catch (err) {
    console.error(err);
    message.reply('Failed to deny user.');
  }
});

client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

// Start bot
client.login(process.env.DISCORD_TOKEN);
