const { EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  name: 'help',
  async execute(interaction, COLORS) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.INTEL_GREEN)
      .setTitle('UKSF TACTICAL TERMINAL // COMMAND REFERENCE')
      .setDescription('Below are the available commands for members and administrators.')
      .addFields(
        { name: '👤 PERSONNEL', value: '`/verify` - unified setup\n`/sync` - auto-link steam\n`/dossier <member>` - tactical record\n`/steam <id>` - manual link' },
        { name: '⚔️ OPERATIONS', value: '`/status` - server info\n`/mission recent` - unit history\n`/op create` - create opord' },
        { name: '🛠️ ADMINISTRATION', value: '`/personnel promote` - promote member\n`/personnel discharge` - remove member\n`/rcon <cmd>` - execute raw rcon' },
        { name: '🎮 IN-GAME (Arma 3)', value: '`!status` - quick stats\n`!sync` - cloud sync\n`!help` - command list' }
      )
      .setFooter({ text: 'TRANSMISSION AUTHENTICATED // 18 SIG REGT' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  }
};
