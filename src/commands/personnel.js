const { EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const ucApi = require('../modules/uc_api');

module.exports = {
  name: 'personnel',
  async execute(interaction, COLORS) {
    const subcommand = interaction.options.getSubcommand();
    const target = interaction.options.getMember('member');

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'ACCESS DENIED.', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    switch (subcommand) {
      case 'promote': {
        const rankAbbrev = interaction.options.getString('rank');
        const ranks = await ucApi.getRanks();
        const match = ranks.find(r => r.abbreviation.toLowerCase() === rankAbbrev.toLowerCase());
        
        if (!match) return interaction.editReply(`ERROR: Rank '${rankAbbrev}' not found in registry.`);

        // Update UC
        const profile = await ucApi.getProfileByDiscordMember(target);
        if (profile) await ucApi.updateRank(profile.id, match.id);

        // Update Supabase
        await ucApi.updatePersonnelRank(target.id, match.name, match.order || 99);

        const embed = new EmbedBuilder()
          .setColor(COLORS.INTEL_GREEN)
          .setTitle('PERSONNEL ACTION: PROMOTION')
          .setDescription(`**${target.displayName}** has been promoted to **${match.name}**.`)
          .setFooter({ text: 'DATABASE SYNCHRONIZED' });

        return interaction.editReply({ embeds: [embed] });
      }

      case 'discharge': {
        const type = interaction.options.getString('type');
        const reason = interaction.options.getString('reason');

        await ucApi.updatePersonnelStatus(target.id, `DISCHARGED (${type})`);

        const embed = new EmbedBuilder()
          .setColor(COLORS.ARMY_RED)
          .setTitle('PERSONNEL ACTION: DISCHARGE')
          .setDescription(`**${target.displayName}** has been discharged from the unit.\n**TYPE:** ${type}\n**REASON:** ${reason}`)
          .setFooter({ text: 'RECORD ARCHIVED' });

        return interaction.editReply({ embeds: [embed] });
      }

      case 'info': {
        const { data, error } = await ucApi.supabase
          .from('personnel')
          .select('*')
          .eq('discord_id', target.id)
          .single();

        if (error || !data) return interaction.editReply('ERROR: No database record found for this member.');

        const embed = new EmbedBuilder()
          .setColor(COLORS.TAC_GRAY)
          .setTitle(`DATABASE RECORD: ${data.display_name || target.displayName}`)
          .addFields(
            { name: 'STATUS', value: `\`${data.status || 'ACTIVE'}\``, inline: true },
            { name: 'RANK', value: `\`${data.rank || 'RCT'}\``, inline: true },
            { name: 'CALLSIGN', value: `\`${data.callsign || 'N/A'}\``, inline: true },
            { name: 'STEAM_ID', value: `\`${data.steam_id || 'NOT LINKED'}\``, inline: false },
            { name: 'LAST SEEN', value: data.last_seen ? `<t:${Math.floor(new Date(data.last_seen).getTime() / 1000)}:R>` : 'NEVER', inline: true },
            { name: 'JOINED', value: data.joined_at || 'N/A', inline: true }
          );

        return interaction.editReply({ embeds: [embed] });
      }
    }
  }
};
