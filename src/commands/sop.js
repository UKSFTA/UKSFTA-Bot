const { EmbedBuilder, MessageFlags } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'sop',
  async execute(interaction, COLORS) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const query = interaction.options.getString('query').toLowerCase();

    // Note: This path assumes the website repo is next to the bot repo in Development/
    const sopPath = path.join(__dirname, '..', '..', '..', 'UKSFTA-Site', 'content', 'rsis', 'sop');
    
    if (!fs.existsSync(sopPath)) return interaction.editReply('ERROR: SOP Archives not found on this server.');

    const files = getAllFiles(sopPath).filter((f) => f.endsWith('.md'));

    let result = null;
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.toLowerCase().includes(query)) {
        const title = content.match(/title: "(.*?)"/)?.[1] || path.basename(file);
        result = {
          title,
          content: `${content.replace(/---[\s\S]*?---/, '').substring(0, 800)}...`,
          path: file,
        };
        break;
      }
    }

    if (result) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.INTEL_GREEN)
        .setTitle(`SOP REFERENCE: ${result.title}`)
        .setDescription(result.content)
        .setFooter({ text: 'RESTRICTED // UKSF DOCTRINE' });
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({ content: `NO SOP MATCHING '${query}' FOUND IN ARCHIVES.` });
    }
  }
};

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  files.forEach((file) => {
    if (fs.statSync(`${dirPath}/${file}`).isDirectory()) {
      arrayOfFiles = getAllFiles(`${dirPath}/${file}`, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, '/', file));
    }
  });
  return arrayOfFiles;
}
