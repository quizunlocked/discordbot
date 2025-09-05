import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';

export async function handleQuestionList(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const quizId = interaction.options.getString('quiz_id', true);

    // Find the quiz and its questions
    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          include: {
            hints: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!quiz) {
      await interaction.editReply('❌ Quiz not found.');
      return;
    }

    if (quiz.questions.length === 0) {
      await interaction.editReply('❌ This quiz has no questions.');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📝 Questions in "${quiz.title}"`)
      .setDescription(`Quiz ID: \`${quizId}\``)
      .setColor('#0099ff')
      .setTimestamp();

    // Add questions as fields (limit to first 20 due to Discord's field limit)
    const questionsToShow = quiz.questions.slice(0, 20);
    
    questionsToShow.forEach((question, index) => {
      const questionPreview = question.questionText.length > 100 
        ? question.questionText.substring(0, 97) + '...' 
        : question.questionText;
      
      const options = JSON.parse(question.options) as string[];
      const correctOption = options[question.correctAnswer];
      
      embed.addFields({
        name: `Question ${index + 1}`,
        value: `**ID:** \`${question.id}\`\n**Text:** ${questionPreview}\n**Answer:** ${correctOption}\n**Points:** ${question.points}\n**Hints:** ${question.hints.length}`,
        inline: false,
      });
    });

    if (quiz.questions.length > 20) {
      embed.addFields({
        name: '⚠️ Note',
        value: `Only showing first 20 questions. Total questions: ${quiz.questions.length}`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });

    logger.info(`Question list displayed for quiz "${quiz.title}" by ${interaction.user.tag}`);
  } catch (error) {
    logger.error('Error listing questions:', error);
    await interaction.editReply('❌ An error occurred while listing questions. Please try again.');
  }
}