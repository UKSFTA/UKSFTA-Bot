const { EmbedBuilder } = require('discord.js');
const { GameDig: Gamedig } = require('gamedig');
const ucApi = require('../modules/uc_api');
const rcon = require('../modules/rcon');
const { cleanName } = require('../utils/helpers');

module.exports = {
  name: 'status',
  async execute(interaction, COLORS, _resolveIdentity, AUTO_ATTENDANCE_CONFIG) {
    await interaction.deferReply();

    try {
      const state = await Gamedig.query({
        type: AUTO_ATTENDANCE_CONFIG.server.type,
        host: AUTO_ATTENDANCE_CONFIG.server.host,
        port: AUTO_ATTENDANCE_CONFIG.server.port,
      });

      const steamLinks = await ucApi.getSteamLinks();
      const guidLinks = await ucApi.getGuidLinks();
      const ucLinks = await ucApi.getLinks();
      const ucProfiles = await ucApi.getProfiles();
      const rconPlayers = await rcon.getPlayers();

      const embed = new EmbedBuilder()
        .setColor(COLORS.INTEL_GREEN)
        .setTitle(`SERVER STATUS: ${state.name}`)
        .addFields(
          { name: 'MAP', value: `\`${state.map}\``, inline: true },
          { name: 'PLAYERS', value: `\`${state.players.length} / ${state.maxplayers}\``, inline: true },
          { name: 'PING', value: `\`${state.ping}ms\``, inline: true },
        )
        .setTimestamp();

      if (state.players.length > 0) {
        const playerLines = await Promise.all(state.players.map(async (p) => {
          const cleanedPName = cleanName(p.name);
          const rMatch = rconPlayers.find(rp => cleanName(rp.name) === cleanedPName);
          const steamId = rMatch?.steamId || p.raw?.steamid;
          const beGuid = rMatch?.guid;

          let discordId = null;
          if (steamId) discordId = Object.keys(steamLinks).find(k => steamLinks[k] === steamId);
          if (!discordId && beGuid) discordId = Object.keys(guidLinks).find(k => guidLinks[k] === beGuid);

          let ucProfile = null;
          if (discordId) {
            const ucId = ucLinks[discordId];
            if (ucId) ucProfile = ucProfiles.find(pr => pr.id.toString() === ucId.toString());
          }

          if (!ucProfile) {
            ucProfile = ucProfiles.find(pr => {
              if (pr.status && pr.status?.toUpperCase() !== 'ACTIVE') return false;
              const cleanAlias = cleanName(pr.alias);
              return cleanAlias === cleanedPName || cleanedPName.includes(cleanAlias);
            });
          }

          const statusLabel = ucProfile ? `[${ucProfile.rank?.abbreviation || 'RCT'}] ${ucProfile.alias}` : 'UNREGISTERED';
          return `• **${p.name}** → \`${statusLabel}\``;
        }));

        embed.addFields({ name: 'ACTIVE PERSONNEL', value: playerLines.join('\n').substring(0, 1024) });
      } else {
        embed.addFields({ name: 'ACTIVE PERSONNEL', value: '*No personnel detected on station.*' });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[STATUS] Query failed:', error.message);
      await interaction.editReply({ content: 'ERROR: UNABLE TO REACH GAME SERVER.' });
    }
  }
};
