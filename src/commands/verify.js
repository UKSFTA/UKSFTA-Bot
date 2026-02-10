const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const ucApi = require('../modules/uc_api');
const renderer = require('../modules/renderer');

module.exports = {
  name: 'verify',
  async execute(interaction, COLORS, resolveIdentity) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const target = interaction.member;
    
    // 1. UC Profile Soft Link
    const profile = await ucApi.getProfileByDiscordMember(target);
    if (!profile) {
      return interaction.editReply({
        content: 'ERROR: No matching Unit Commander personnel file found. Ensure your Discord nickname matches your official alias.',
      });
    }

    // 2. Steam & GUID Soft Link (Check Live Presence)
    const { steamId, beGuid } = await resolveIdentity(target.displayName);
    let presenceMsg = '';
    
    if (steamId || beGuid) {
      presenceMsg = `\n✅ **STEAM LINK:** DETECTED ON SERVER AS **${target.displayName}**`;
      if (steamId) presenceMsg += `\n(SteamID: \`${steamId}\`)`;
      if (beGuid && !steamId) presenceMsg += `\n(BattlEye GUID: \`${beGuid.substring(0,8)}...\`)`;
    } else {
      presenceMsg = '\n⚠️ **STEAM LINK:** NOT DETECTED ON SERVER (Connect to auto-link)';
    }

    const deployments = 0; 
    const idCardBuffer = await renderer.renderIDCard(profile, profile.rank?.name || 'RECRUIT', deployments);
    const attachment = new AttachmentBuilder(idCardBuffer, { name: 'idcard.png' });

    const embed = new EmbedBuilder()
      .setColor(COLORS.TAC_GRAY)
      .setTitle('IDENTITY VERIFICATION TERMINAL')
      .setDescription(`>>> **PERSONNEL RECORD FOUND.**\nReview the ID card below. Confirm if this is your official file.\n\n**STATUS:** \`${profile.status || 'ACTIVE'}\`${presenceMsg}`)
      .setImage('attachment://idcard.png')
      .setFooter({ text: 'UKSF SECURE LINK // 18 SIG REGT' });

    const confirmId = `verify_confirm:${profile.id}:${steamId || 'NONE'}:${beGuid || 'NONE'}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel('CONFIRM & LINK ALL').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`verify_deny`).setLabel('ABORT').setStyle(ButtonStyle.Danger),
    );

    await interaction.editReply({ embeds: [embed], components: [row], files: [attachment] });
  }
};
