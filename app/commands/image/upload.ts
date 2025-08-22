import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const IMAGES_DIR = path.join(process.cwd(), 'public', 'images');

// Use global fetch (Node.js 18+)
declare const fetch: typeof globalThis.fetch;

export async function handleUpload(interaction: ChatInputCommandInteraction): Promise<void> {
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
