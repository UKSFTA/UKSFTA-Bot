const { EmbedBuilder, MessageFlags } = require('discord.js');
const ucApi = require('../modules/uc_api');
const { calculateBeGuid } = require('../utils/helpers');

module.exports = {
  name: 'sync',
  async execute(interaction, COLORS, resolveIdentity) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    
    try {
      const targetName = interaction.member.displayName;
      const { steamId, beGuid } = await resolveIdentity(targetName);

      if (!steamId && !beGuid) {
        return interaction.editReply({ 
          content: `### ❌ SYNC FAILED
I could not locate you on the game server as "**${targetName}**".
          
**Troubleshooting:**
1. Ensure you are currently **online** on the game server.
2. Ensure your in-game name matches your Discord nickname.
3. If this continues to fail, find your **SteamID64** manually.

**How to find your SteamID64:**
1. Visit [SteamDB Calculator](https://steamdb.info/calculator/)
2. Paste your profile URL and look for the **SteamID64**.
3. Run: \`/steam steam_id:YOUR_ID\`` 
        });
      }

      let msg = `I have successfully identified you via the live server link.\n**PLAYER:** ${targetName}`;
      
      if (steamId) {
        ucApi.saveSteamLink(interaction.user.id, steamId);
        const calculatedGuid = calculateBeGuid(steamId);
        if (calculatedGuid) await ucApi.saveGuid(interaction.user.id, calculatedGuid);
        msg += `\n✅ **STEAMID:** \`${steamId}\``;
      }

      if (beGuid) {
        await ucApi.saveGuid(interaction.user.id, beGuid);
        msg += `\n✅ **GUID:** \`${beGuid.substring(0, 8)}...\``;
      }

      const embed = new EmbedBuilder()
        .setColor(COLORS.INTEL_GREEN)
        .setTitle('IDENTITY SYNCHRONIZED')
        .setDescription(msg)
        .setFooter({ text: 'TRANSMISSION SEALED // 18 SIG REGT' });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[SYNC] Error:', error.message);
      await interaction.editReply({ content: 'CRITICAL ERROR DURING IDENTITY SYNC.' });
    }
  }
};
