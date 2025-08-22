import { SlashCommandBuilder, CommandInteraction, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleTemplate } from './template.js';
import { handleUpload } from './upload.js';

export const data = new SlashCommandBuilder()
  .setName('corpus')
  .setDescription('Corpus management commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('template')
      .setDescription('Download a CSV template for corpus upload with examples')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('upload')
      .setDescription('Upload a CSV file to create a corpus for quiz generation')
      .addAttachmentOption(option =>
        option.setName('file').setDescription('CSV file with corpus data').setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('title')
          .setDescription('Corpus title for identification')
          .setRequired(true)
          .setMaxLength(100)
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: CommandInteraction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const subcommand = interaction.options.getSubcommand();

  try {
    // Validate channel type - corpus commands must be run in guild channels
    if (!interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
      await interaction.reply({
        content: '❌ Corpus commands can only be used in server channels, not in direct messages.',
        ephemeral: true,
      });
      return;
    }

    switch (subcommand) {
      case 'template':
        await handleTemplate(interaction);
        break;
      case 'upload':
        await handleUpload(interaction);
        break;
      default:
        await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
    }
  } catch (error) {
    logger.error('Error in corpus command:', error);
    await interaction.reply({
      content: 'There was an error executing the corpus command. Please check the logs.',
      ephemeral: true,
    });
  }
}
