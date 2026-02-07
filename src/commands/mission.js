const { EmbedBuilder, MessageFlags } = require('discord.js');
const ucApi = require('../modules/uc_api');

module.exports = {
  name: 'mission',
  async execute(interaction, COLORS) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const { data, error } = await ucApi.supabase
      .from('mission_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(5);

    if (error || !data) return interaction.editReply('ERROR: Unable to retrieve operational history.');

    const embed = new EmbedBuilder()
      .setColor(COLORS.TAC_GRAY)
      .setTitle('OPERATIONAL HISTORY // AFTER ACTION LOGS')
      .setDescription(
        data.map(m => {
          const start = new Date(m.started_at);
          const end = m.ended_at ? new Date(m.ended_at) : null;
          const duration = end ? Math.floor((end - start) / 60000) : 'ACTIVE';
          return `• **${m.mission_name}**\n  Map: \`${m.map_name}\` | Duration: \`${duration}m\` | Personnel: \`${m.player_count}\``;
        }).join('\n\n') || '*No operational records found.*'
      )
      .setFooter({ text: 'RESTRICTED ACCESS // 18 SIG REGT' });

    await interaction.editReply({ embeds: [embed] });
  }
};
