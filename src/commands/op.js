const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');
const ucApi = require('../modules/uc_api');

module.exports = {
  name: 'op',
  async execute(interaction, COLORS) {
    if (interaction.options.getSubcommand() === 'create') {
      await interaction.deferReply();
      let name = interaction.options.getString('name');
      let date = interaction.options.getString('date');
      let type = interaction.options.getString('type') || 'Deployment';
      const ucEventId = interaction.options.getString('uc_event');

      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) {
        return interaction.editReply({ content: 'ACCESS DENIED.', flags: [MessageFlags.Ephemeral] });
      }

      if (ucEventId) {
        const events = await ucApi.getEvents();
        const event = events.find((e) => e.id.toString() === ucEventId);
        if (event) {
          name = event.name;
          date = `${event.date} ${event.time}`;
          type = 'Official UC Event';
        }
      }

      if (!name || !date) return interaction.editReply({ content: 'NAME/DATE REQUIRED.' });

      const opId = `op-${Date.now()}`;
      const embed = new EmbedBuilder()
        .setColor(COLORS.INTEL_GREEN)
        .setTitle(`OPERATION ORDER // ${name.toUpperCase()}`)
        .setDescription(`**TYPE:** ${type}
**DATE/TIME:** ${date} Z`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`accept:${opId}`).setLabel('SIGNED ON').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`decline:${opId}`).setLabel('AWAY').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`late:${opId}`).setLabel('LATE').setStyle(ButtonStyle.Secondary),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    }
  }
};
