import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';
import { requireAdminPrivileges } from '../../utils/permissions.js';
import { buttonCleanupService } from '../../services/ButtonCleanupService.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const IMAGES_DIR = path.join(process.cwd(), 'public', 'images');

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

    // Validate channel type
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

async function handleUpload(interaction: ChatInputCommandInteraction): Promise<void> {
  const title = interaction.options.getString('title') || null;
  const altText = interaction.options.getString('alt_text') || null;
  const attachment = interaction.options.getAttachment('file');

  if (!attachment) {
    await interaction.editReply('❌ No file was provided. Please attach an image file.');
    return;
  }

  // Validate file type
  const fileExtension = path.extname(attachment.name?.toLowerCase() || '');
  if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
    await interaction.editReply(
      `❌ Invalid file type. Please upload one of: ${ALLOWED_EXTENSIONS.join(', ')}`
    );
    return;
  }

  // Validate file size
  if (attachment.size > MAX_FILE_SIZE) {
    await interaction.editReply(
      `❌ File too large. Please upload an image smaller than ${MAX_FILE_SIZE / 1024 / 1024}MB.`
    );
    return;
  }

  // Validate content type
  if (!attachment.contentType?.startsWith('image/')) {
    await interaction.editReply('❌ Invalid file type. Please upload a valid image file.');
    return;
  }

  try {
    // Download the image
    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const imageBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(imageBuffer);

    // Create user directory if it doesn't exist
    const userDir = path.join(IMAGES_DIR, interaction.user.id);
    await fs.mkdir(userDir, { recursive: true });

    // Create database record first to get the image ID
    const image = await databaseService.prisma.$transaction(async tx => {
      // Create or get user
      const user = await tx.user.upsert({
        where: { id: interaction.user.id },
        update: {},
        create: {
          id: interaction.user.id,
          username: interaction.user.username,
        },
      });

      // Create image record
      const imageRecord = await tx.image.create({
        data: {
          userId: user.id,
          path: '', // Will be updated after file is saved
          title,
          altText,
        },
      });

      return imageRecord;
    });

    // Generate filename with image ID
    const filename = `${image.id}${fileExtension}`;
    const filePath = path.join(userDir, filename);
    const relativePath = path.join('public', 'images', interaction.user.id, filename);

    // Save file to disk
    await fs.writeFile(filePath, buffer);

    // Update database record with file path
    await databaseService.prisma.image.update({
      where: { id: image.id },
      data: { path: relativePath },
    });

    // Create success embed
    const embed = new EmbedBuilder()
      .setTitle('✅ Image Uploaded Successfully')
      .setDescription(`Your image has been uploaded and is ready to use in quiz questions!`)
      .addFields(
        { name: 'Image ID', value: image.id, inline: true },
        { name: 'Filename', value: filename, inline: true },
        { name: 'Size', value: `${Math.round(attachment.size / 1024)} KB`, inline: true }
      )
      .setColor('#00ff00')
      .setTimestamp();

    if (title) {
      embed.addFields({ name: 'Title', value: title, inline: true });
    }

    if (altText) {
      embed.addFields({ name: 'Alt Text', value: altText, inline: false });
    }

    // Add usage instructions
    embed.addFields({
      name: '📝 Usage Instructions',
      value: [
        `• Use this image ID in CSV uploads: \`${image.id}\``,
        '• Add an `imageId` column to your quiz CSV files',
        '• The image will display with quiz questions that reference this ID',
        '• Use `/image delete` to remove images you no longer need',
      ].join('\n'),
      inline: false,
    });

    await interaction.editReply({ embeds: [embed] });

    logger.info(`Image uploaded by ${interaction.user.tag}: ${image.id} (${filename})`);
  } catch (error) {
    logger.error('Error uploading image:', error);
    await interaction.editReply(
      '❌ An error occurred while uploading your image. Please try again.'
    );
  }
}

async function handleDelete(interaction: ChatInputCommandInteraction): Promise<void> {
  // Check admin privileges
  if (!(await requireAdminPrivileges(interaction))) return;

  const imageId = interaction.options.getString('image_id', true);

  try {
    // Find the image
    const image = await databaseService.prisma.image.findUnique({
      where: { id: imageId },
      include: {
        user: true,
        questions: {
          include: {
            quiz: true,
          },
        },
      },
    });

    if (!image) {
      await interaction.editReply('❌ Image not found.');
      return;
    }

    // Check if image is being used in questions
    const questionsUsingImage = image.questions.length;

    // Create confirmation embed
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Confirm Image Deletion')
      .setDescription(`Are you sure you want to delete this image?`)
      .addFields(
        { name: 'Image ID', value: image.id, inline: true },
        { name: 'Uploaded By', value: image.user.username, inline: true },
        { name: 'Upload Date', value: image.uploadedAt.toLocaleDateString(), inline: true },
        { name: 'Questions Using Image', value: questionsUsingImage.toString(), inline: true }
      )
      .setColor('#ff0000')
      .setTimestamp();

    if (image.title) {
      embed.addFields({ name: 'Title', value: image.title, inline: true });
    }

    if (questionsUsingImage > 0) {
      const quizTitles = [...new Set(image.questions.map(q => q.quiz.title))];
      embed.addFields({
        name: '⚠️ Warning',
        value: `This image is used in ${questionsUsingImage} question(s) across ${quizTitles.length} quiz(es):\n• ${quizTitles.slice(0, 3).join('\n• ')}${quizTitles.length > 3 ? '\n• ...' : ''}`,
        inline: false,
      });
    }

    embed.addFields({
      name: '📝 What will happen',
      value: [
        '• Image file will be permanently deleted from disk',
        '• Database record will be removed',
        questionsUsingImage > 0
          ? '• Questions using this image will no longer display it'
          : '• No questions will be affected',
      ].join('\n'),
      inline: false,
    });

    // Create confirmation buttons
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`image_delete_confirm_${imageId}`)
        .setLabel('✅ Confirm Delete')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`image_delete_cancel_${imageId}`)
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    const reply = await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    // Schedule button cleanup
    buttonCleanupService.scheduleAdminCleanup(reply.id, interaction.channelId, 60);
  } catch (error) {
    logger.error('Error preparing image deletion:', error);
    await interaction.editReply('❌ Error preparing image deletion.');
  }
}
