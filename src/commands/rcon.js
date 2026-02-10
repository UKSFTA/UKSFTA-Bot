const { EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const rcon = require('../modules/rcon');

module.exports = {
  name: 'rcon',
  async execute(interaction, COLORS) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'ACCESS DENIED.', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    
    try {
      const subcommand = interaction.options.getSubcommand();
      let command = "";
      let logMsg = "";

      if (subcommand === 'say') {
        const msg = interaction.options.getString('message');
        command = `say -1 [HQ] ${msg}`;
        logMsg = `Broadcast: ${msg}`;
      } else if (subcommand === 'cmd') {
        const action = interaction.options.getString('action');
        if (action === 'players') command = 'players';
        else if (action === 'admins') command = 'admins';
        else if (action === 'lock') command = '#lock';
        else if (action === 'unlock') command = '#unlock';
        else if (action === 'bans') command = 'bans';
        else if (action === 'fps') {
          const fpsResp = await rcon.executeAndCapture('#perf', /FPS:\s+\d+/i);
          return await interaction.editReply({ 
            embeds: [
              new EmbedBuilder()
                .setColor(COLORS.TAC_GRAY)
                .setTitle('SERVER PERFORMANCE')
                .setDescription(`\`\`\`\n${fpsResp}\n\`\`\``)
            ] 
          });
        }
        
        logMsg = `Command: ${action}`;
      } else if (subcommand === 'player') {
        const action = interaction.options.getString('action');
        const targetName = interaction.options.getString('target');
        const reason = interaction.options.getString('reason') || "UKSF Admin Action";
        
        const rconPlayers = await rcon.getPlayers();
        const player = rconPlayers.find(p => p.name === targetName);
        
        if (!player) return interaction.editReply(`ERROR: Player "${targetName}" not found.`);

        if (action === 'kick') {
          command = `kick ${player.id} ${reason}`;
          logMsg = `Kicked: ${targetName}`;
        } else if (action === 'ban') {
          const duration = interaction.options.getInteger('duration') || 0;
          command = `ban ${player.id} ${duration} ${reason}`;
          logMsg = `Banned: ${targetName} (${duration === 0 ? 'Perm' : `${duration}m`})`;
        }
      } else if (subcommand === 'raw') {
        command = interaction.options.getString('command');
        logMsg = `Raw: ${command}`;
      }

      const response = await rcon.execute(command);
      const embed = new EmbedBuilder()
        .setColor(COLORS.TAC_GRAY)
        .setTitle('RCON TERMINAL OUTPUT')
        .setDescription(`>>> **ACTION:** ${logMsg}\n\`\`\`\n${response.substring(0, 1800)}\n\`\`\``);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[RCON] Error:', error);
      await interaction.editReply({ content: `❌ **RCON FAILURE:** ${error.message}` });
    }
  }
};
