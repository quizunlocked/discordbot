import {
  CommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';
import { canManageQuiz, hasAdminPrivileges } from '../../utils/permissions.js';

export async function handleEdit(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const quizId = interaction.options.getString('quiz_id', true);

    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: true },
    });

    if (!quiz) {
      await interaction.reply({ content: '❌ Quiz not found.', ephemeral: true });
      return;
    }

    // Check if user can manage this quiz
    const userCanManage = canManageQuiz(
      interaction.user.id,
      (quiz as any).quizOwnerId,
      hasAdminPrivileges(interaction)
    );

    if (!userCanManage) {
      await interaction.reply({
        content: '❌ You can only edit quizzes you own or have admin privileges for.',
        ephemeral: true,
      });
      return;
    }

    const isPrivate = (quiz as any).private || false;
    const privacyStatus = isPrivate ? '🔒 Private' : '🌐 Public';

    const embed = new EmbedBuilder()
      .setTitle(`📝 Edit Quiz: ${quiz.title}`)
      .setDescription(quiz.description || 'No description')
      .addFields(
        { name: 'Questions', value: quiz.questions.length.toString(), inline: true },
        { name: 'Status', value: quiz.isActive ? '🟢 Active' : '🔴 Inactive', inline: true },
        { name: 'Privacy', value: privacyStatus, inline: true },
        {
          name: 'Time Limit',
          value: (quiz as any).timeLimit ? `${(quiz as any).timeLimit}s` : 'None',
          inline: true,
        }
      )
      .setColor('#0099ff')
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`quiz_edit_title_${quizId}`)
        .setLabel('Edit Title')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`quiz_edit_description_${quizId}`)
        .setLabel('Edit Description')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`quiz_edit_time_limit_${quizId}`)
        .setLabel('Edit Time Limit')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`quiz_toggle_status_${quizId}`)
        .setLabel(quiz.isActive ? 'Disable' : 'Enable')
        .setStyle(quiz.isActive ? ButtonStyle.Danger : ButtonStyle.Success)
    );

    // Add private toggle button if user owns the quiz or is admin
    const privateToggleButton = new ButtonBuilder()
      .setCustomId(`quiz_toggle_private_${quizId}`)
      .setLabel(isPrivate ? 'Make Public' : 'Make Private')
      .setStyle(isPrivate ? ButtonStyle.Success : ButtonStyle.Secondary);

    const components = [row];

    // Only show private toggle if user owns the quiz or is admin
    if (userCanManage) {
      const privateRow = new ActionRowBuilder<ButtonBuilder>().addComponents(privateToggleButton);
      components.push(privateRow);
    }

    await interaction.reply({ embeds: [embed], components, ephemeral: true });
  } catch (error) {
    logger.error('Error editing quiz:', error);
    await interaction.reply({ content: '❌ Error editing quiz.', ephemeral: true });
  }
}