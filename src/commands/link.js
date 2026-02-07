const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const ucApi = require('../modules/uc_api');

module.exports = {
  name: 'link',
  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const target = interaction.options.getMember('member');
    const ucId = interaction.options.getString('uc_id');

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply({ content: 'ACCESS DENIED.' });
    }

    const profile = await ucApi.getProfile(ucId);
    if (!profile) return interaction.editReply({ content: 'UC PROFILE NOT FOUND.' });

    await ucApi.saveLink(target.id, ucId);
    await interaction.editReply({ content: `DATA LINK ESTABLISHED FOR **${target.displayName}**.` });
  }
};
