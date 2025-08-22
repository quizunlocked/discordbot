import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleUpload } from './upload.js';
import { handleDelete } from './delete.js';

export const data = new SlashCommandBuilder()
  .setName('image')
  .setDescription('Manage images for quiz questions')
  .addSubcommand(subcommand =>
    subcommand
      .setName('upload')
      .setDescription('Upload an image for use in quiz questions')
      .addAttachmentOption(option =>
        option
          .setName('file')
          .setDescription('Image file to upload (PNG, JPG, GIF, WEBP)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('title').setDescription('Optional title for the image').setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('alt_text')
          .setDescription('Optional alt text for accessibility')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('Delete an uploaded image')
      .addStringOption(option =>
        option.setName('image_id').setDescription('ID of the image to delete').setRequired(true)
      )
  );

export const cooldown = 30; // 30 second cooldown for uploads

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const subcommand = interaction.options.getSubcommand();

  try {
    await interaction.deferReply({ ephemeral: true });

    // Validate channel type - image commands can only be used in server channels
    if (!interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
      await interaction.editReply({
        content: '❌ Image commands can only be used in server channels, not in direct messages.',
      });
      return;
    }

    switch (subcommand) {
      case 'upload':
        await handleUpload(interaction);
        break;
      case 'delete':
        await handleDelete(interaction);
        break;
      default:
        await interaction.editReply('Unknown subcommand.');
    }
  } catch (error) {
    logger.error('Error in image command:', error);
    await interaction.editReply({
      content: 'There was an error executing the image command. Please check the logs.',
    });
  }
}