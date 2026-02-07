const { EmbedBuilder, MessageFlags } = require('discord.js');
const ucApi = require('../modules/uc_api');
const { calculateBeGuid } = require('../utils/helpers');

module.exports = {
  name: 'steam',
  async execute(interaction, COLORS, resolveIdentity) {
    const steamId = interaction.options.getString('steam_id');

    if (steamId) {
      if (!/^\d{17}$/.test(steamId)) {
        return interaction.reply({ content: 'ERROR: INVALID STEAMID64. MUST BE 17 DIGITS.', flags: [MessageFlags.Ephemeral] });
      }

      await ucApi.saveSteamLink(interaction.user.id, steamId);
      const beGuid = calculateBeGuid(steamId);
      if (beGuid) await ucApi.saveGuid(interaction.user.id, beGuid);

      const embed = new EmbedBuilder()
        .setColor(COLORS.INTEL_GREEN)
        .setTitle('STEAM LINK ESTABLISHED')
        .setDescription(`Your Discord identity is now manually mapped to SteamID: \`${steamId}\`.`)
        .setFooter({ text: 'TRANSMISSION SEALED // 18 SIG REGT' });

      return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
    }

    // Soft link logic
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const { steamId: detectedId, beGuid: detectedGuid } = await resolveIdentity(interaction.member.displayName);

    if (!detectedId && !detectedGuid) {
      return interaction.editReply({ 
        content: `### ❌ SOFT LINK FAILED\nI could not locate you on the server.\n\n**How to find your SteamID64:**\n1. Visit [SteamDB Calculator](https://steamdb.info/calculator/)\n2. Paste your profile URL.\n3. Run: \`/steam steam_id:YOUR_ID\`` 
      });
    }

    if (detectedId) await ucApi.saveSteamLink(interaction.user.id, detectedId);
    if (detectedGuid) await ucApi.saveGuid(interaction.user.id, detectedGuid);

    const embed = new EmbedBuilder()
      .setColor(COLORS.INTEL_GREEN)
      .setTitle('STEAM LINK AUTO-DETECTED')
      .setDescription(`I have successfully identified you.\n**STEAMID:** \`${detectedId || 'N/A'}\``)
      .setFooter({ text: 'TRANSMISSION SEALED // 18 SIG REGT' });

    await interaction.editReply({ embeds: [embed] });
  }
};
