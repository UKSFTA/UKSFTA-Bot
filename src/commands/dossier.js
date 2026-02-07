const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const ucApi = require('../modules/uc_api');
const renderer = require('../modules/renderer');

module.exports = {
  name: 'dossier',
  async execute(interaction, COLORS) {
    await interaction.deferReply();
    const target = interaction.options.getMember('member') || interaction.member;
    const profile = await ucApi.getProfileByDiscordMember(target);

    if (!profile) {
      return interaction.editReply({
        content: `ACCESS DENIED: NO ACTIVE PERSONNEL RECORD FOR '${target.displayName}'`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    const deployments = 0; 
    const attendance = await ucApi.getAttendanceForProfile(profile.id);

    const dossierId = `dossier_${interaction.user.id}_${target.id}`;
    
    const { embed, components, files } = await this.renderTab(profile, target, deployments, attendance, 'summary', dossierId, COLORS);
    await interaction.editReply({ embeds: [embed], components, files });
  },

  async renderTab(profile, target, deployments, attendance, tab, dossierId, COLORS) {
    const rank = profile.rank?.name || 'RECRUIT';
    const unit = profile.unit?.name || 'UKSF DIRECTORATE';
    const status = profile.status?.toUpperCase() || 'ACTIVE';

    const embed = new EmbedBuilder()
      .setColor(status === 'ACTIVE' ? COLORS.INTEL_GREEN : COLORS.ARMY_RED)
      .setAuthor({
        name: `UKSF PERSONNEL FILE // ${target.user.username.toUpperCase()}`,
        iconURL: 'https://raw.githubusercontent.com/co-analysis/govukhugo/master/static/images/govuk-crest.png',
      })
      .setFooter({
        text: `SECURE TERMINAL // TAB: ${tab.toUpperCase()} // SESSION: ${dossierId.substring(0, 12)}`,
      })
      .setTimestamp();

    const files = [];

    if (tab === 'summary') {
      const idCardBuffer = await renderer.renderIDCard(profile, rank, deployments);
      const attachment = new AttachmentBuilder(idCardBuffer, { name: 'idcard.png' });
      files.push(attachment);

      embed
        .setTitle(`${rank.toUpperCase()} ${profile.alias.toUpperCase()}`)
        .setDescription(`>>> **CURRENT ASSIGNMENT:** ${unit}\n**POSTING:** ${profile.position?.name || 'ACTIVE DUTY'}`)
        .setImage('attachment://idcard.png')
        .addFields(
          { name: 'IDENTIFIER', value: `\`${target.user.id}\``, inline: true },
          { name: 'STATUS', value: `\`${status}\``, inline: true },
          { name: 'ENLISTED', value: `\`${new Date(profile.created_at).toLocaleDateString('en-GB')}\``, inline: true },
        );
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tab:${dossierId}:summary`).setLabel('SUMMARY').setStyle(tab === 'summary' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`tab:${dossierId}:history`).setLabel('HISTORY').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`tab:${dossierId}:awards`).setLabel('AWARDS').setStyle(ButtonStyle.Secondary),
    );

    return { embed, components: [row], files };
  }
};
