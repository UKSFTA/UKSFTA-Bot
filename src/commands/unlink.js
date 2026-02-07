const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const ucApi = require('../modules/uc_api');

module.exports = {
  name: 'unlink',
  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const target = interaction.options.getMember('member') || interaction.member;

    if (target.id !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply({ content: 'ACCESS DENIED.' });
    }

    const success = await ucApi.removeLink(target.id);
    await interaction.editReply({ content: success ? `DATA LINK REMOVED FOR **${target.displayName}**.` : 'NO LINK FOUND.' });
  }
};
