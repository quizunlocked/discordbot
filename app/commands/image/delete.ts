import {
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

export async function handleDelete(interaction: ChatInputCommandInteraction): Promise<void> {
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