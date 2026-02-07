const { EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const ucApi = require('../modules/uc_api');

module.exports = {
  name: 'award',
  async execute(interaction, COLORS) {
    await interaction.deferReply();
    const target = interaction.options.getMember('member');
    const medalKey = interaction.options.getString('medal');
    const citation = interaction.options.getString('citation');

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply({ content: 'ACCESS DENIED.', flags: [MessageFlags.Ephemeral] });
    }

    const profile = await ucApi.getProfileByDiscordMember(target);
    if (!profile) return interaction.editReply({ content: 'PROFILE NOT FOUND.', flags: [MessageFlags.Ephemeral] });

    const officialAwards = await ucApi.getAwards();
    const matchingAward = officialAwards.find((a) => a.name.toLowerCase().includes(medalKey.toLowerCase()));

    if (matchingAward) await ucApi.assignAward(profile.id, matchingAward.id, citation);

    const awardEmbed = new EmbedBuilder()
      .setColor(COLORS.INTEL_GREEN)
      .setTitle('DIRECTORATE ORDER // COMMENDATION')
      .setDescription(`The following member has been cited for exceptional merit:`)
      .addFields(
        { name: 'MEMBER', value: `${target}`, inline: true },
        { name: 'AWARD', value: `**${matchingAward?.name || medalKey}**`, inline: true },
        { name: 'CITATION', value: citation },
      )
      .setFooter({ text: 'TRANSMISSION AUTHENTICATED // 18 SIG REGT' })
      .setTimestamp();

    await interaction.editReply({ embeds: [awardEmbed] });
  }
};
