const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');
const ucApi = require('../modules/uc_api');
const rcon = require('../modules/rcon');
const { cleanName } = require('../utils/helpers');
const fs = require('node:fs');

module.exports = {
  name: 'attendance',
  async execute(interaction, COLORS) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) {
      return interaction.reply({ content: 'ACCESS DENIED.', flags: [MessageFlags.Ephemeral] });
    }

    // Handle Button Interactions for Confirm/Discard
    if (interaction.isButton()) {
      const [action, eventId, threshold] = interaction.customId.split(':');
      if (action === 'confirm_auto') {
        await interaction.deferUpdate();
        return this.processAutoAttendance(interaction, eventId, parseInt(threshold, 10), COLORS);
      }
      if (action === 'discard_auto') {
        if (fs.existsSync('./data/attendance_buffer.json')) fs.unlinkSync('./data/attendance_buffer.json');
        return interaction.update({ content: '🗑️ Attendance buffer discarded.', embeds: [], components: [] });
      }
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      const subcommand = interaction.options.getSubcommand();
      const eventId = interaction.options.getString('event');

      if (subcommand === 'log') {
        const targetMember = interaction.options.getMember('member');
        const statusId = interaction.options.getString('status');

        const profile = await ucApi.getProfileByDiscordMember(targetMember);
        if (!profile) {
          return interaction.editReply(`ERROR: Could not find Unit Commander profile for ${targetMember.displayName}.`);
        }

        const success = await ucApi.submitAttendance(eventId, profile.id, statusId);
        if (success) {
          return interaction.editReply(`✅ Attendance logged for **${profile.alias}**.`);
        }
        return interaction.editReply('❌ Failed to submit attendance to Unit Commander.');
      }

      if (subcommand === 'bulk') {
        const statusId = interaction.options.getString('status') || '1'; // Assuming '1' is 'Present'
        const rconPlayers = await rcon.getPlayers();
        
        if (rconPlayers.length === 0) {
          return interaction.editReply('ERROR: No players currently detected on server via RCON.');
        }

        let successCount = 0;
        let failCount = 0;
        const results = [];

        for (const player of rconPlayers) {
          const cleanedName = cleanName(player.name);
          // Try to find profile by RCON name
          const profiles = await ucApi.getProfiles();
          const profile = profiles.find(p => {
            if (p.status && p.status.toUpperCase() !== 'ACTIVE') return false;
            const alias = cleanName(p.alias);
            return alias === cleanedName || cleanedName.includes(alias);
          });

          if (profile) {
            const success = await ucApi.submitAttendance(eventId, profile.id, statusId);
            if (success) {
              successCount++;
              results.push(`• ${profile.alias}: ✅`);
            } else {
              failCount++;
              results.push(`• ${profile.alias}: ❌`);
            }
          } else {
            failCount++;
            results.push(`• ${player.name}: ❓ (Not Found)`);
          }
        }

        const embed = new EmbedBuilder()
          .setColor(COLORS.INTEL_GREEN)
          .setTitle('BULK ATTENDANCE LOG')
          .setDescription(`>>> **EVENT ID:** ${eventId}\n**SUCCESS:** ${successCount}\n**FAILED/UNKNOWN:** ${failCount}\n\n${results.join('\n').substring(0, 1500)}`);

        return interaction.editReply({ embeds: [embed] });
      }

      if (subcommand === 'review') {
        const threshold = interaction.options.getInteger('threshold') || 30;
        
        if (!fs.existsSync('./data/attendance_buffer.json')) {
          return interaction.editReply('⚠️ No automated attendance data found in buffer.');
        }

        const bufferRaw = fs.readFileSync('./data/attendance_buffer.json', 'utf8');
        const buffer = JSON.parse(bufferRaw); // Array of [steamId, minutes]
        
        const qualified = buffer.filter(([_, mins]) => mins >= threshold);
        
        if (qualified.length === 0) {
          return interaction.editReply(`⚠️ No personnel met the ${threshold}m threshold (Max: ${Math.max(...buffer.map(b => b[1]), 0)}m).`);
        }

        const profiles = await ucApi.getProfiles();
        const steamLinks = await ucApi.getSteamLinks();

        const lines = qualified.map(([sid, mins]) => {
          const discordId = Object.keys(steamLinks).find(k => steamLinks[k] === sid);
          const profile = profiles.find(p => {
            if (p.status && p.status.toUpperCase() !== 'ACTIVE') return false;
            if (discordId && p.discord_id === discordId) return true;
            return false;
          });
          return `• **${profile?.alias || 'Unknown'}** (${sid}): \`${mins}m\``;
        });

        const embed = new EmbedBuilder()
          .setColor(COLORS.MOD_PURPLE)
          .setTitle('AUTOMATED ATTENDANCE REVIEW')
          .setDescription(`>>> **EVENT ID:** ${eventId}\n**THRESHOLD:** ${threshold}m\n**QUALIFIED:** ${qualified.length}\n\n${lines.join('\n').substring(0, 1800)}`)
          .setFooter({ text: 'Review the list above before committing to Unit Commander.' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`confirm_auto:${eventId}:${threshold}`).setLabel('COMMIT TO UC').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`discard_auto`).setLabel('DISCARD BUFFER').setStyle(ButtonStyle.Danger)
        );

        return interaction.editReply({ embeds: [embed], components: [row] });
      }
    } catch (error) {
      console.error('[ATTENDANCE] Error:', error);
      return interaction.editReply(`❌ **CRITICAL ERROR:** ${error.message}`);
    }
  },

  async processAutoAttendance(interaction, eventId, threshold, COLORS) {
    const bufferRaw = fs.readFileSync('./data/attendance_buffer.json', 'utf8');
    const buffer = JSON.parse(bufferRaw);
    const qualified = buffer.filter(([_, mins]) => mins >= threshold);

    const profiles = await ucApi.getProfiles();
    const steamLinks = await ucApi.getSteamLinks();
    const statusId = '1'; // Default to Present

    let successCount = 0;
    const results = [];

    for (const [sid, _] of qualified) {
      const discordId = Object.keys(steamLinks).find(k => steamLinks[k] === sid);
      const profile = profiles.find(p => {
        if (p.status && p.status.toUpperCase() !== 'ACTIVE') return false;
        if (discordId && p.discord_id === discordId) return true;
        return false;
      });

      if (profile) {
        const success = await ucApi.submitAttendance(eventId, profile.id, statusId);
        if (success) {
          successCount++;
          results.push(`• ${profile.alias}: ✅`);
        } else {
          results.push(`• ${profile.alias}: ❌`);
        }
      }
    }

    // Clear buffer after success
    fs.unlinkSync('./data/attendance_buffer.json');

    const embed = new EmbedBuilder()
      .setColor(COLORS.INTEL_GREEN)
      .setTitle('AUTOMATED ATTENDANCE COMMITTED')
      .setDescription(`>>> **EVENT ID:** ${eventId}\n**COMMITTED:** ${successCount}\n\n${results.join('\n').substring(0, 1500)}`);

    return interaction.editReply({ embeds: [embed], components: [] });
  }
};
