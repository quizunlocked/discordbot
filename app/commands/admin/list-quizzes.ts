import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';

export async function handleListQuizzes(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const includeInactive = interaction.options.getBoolean('include_inactive') ?? true; // Default to true to show all quizzes

    const quizzes = await databaseService.prisma.quiz.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        _count: {
          select: {
            questions: true,
            attempts: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (quizzes.length === 0) {
      await interaction.editReply('No quizzes found.');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📚 Available Quizzes')
      .setColor('#0099ff')
      .setDescription(
        quizzes
          .map(quiz => {
            const status = quiz.isActive ? '🟢 Active' : '🔴 Inactive';
            return `**${quiz.title}** (${quiz.id})\n${status} • ${quiz._count.questions} questions • ${quiz._count.attempts} attempts`;
          })
          .join('\n\n')
      )
      .setTimestamp();

    // Add note about inactive quizzes if showing all
    if (includeInactive) {
      embed.setFooter({
        text: 'Showing all quizzes (active and inactive). Use /admin list-quizzes include_inactive:false to show only active quizzes.',
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error listing quizzes:', error);
    await interaction.editReply('❌ Error listing quizzes.');
  }
}
