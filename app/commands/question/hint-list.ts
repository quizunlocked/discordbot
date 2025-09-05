import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';

export async function handleHintList(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const questionId = interaction.options.getString('question_id', true);

    // Find the question and its hints
    const question = await databaseService.prisma.question.findUnique({
      where: { id: questionId },
      include: {
        quiz: true,
        hints: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!question) {
      await interaction.editReply('❌ Question not found.');
      return;
    }

    if (question.hints.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📋 No Hints Found')
        .setDescription(`Question ID: \`${questionId}\``)
        .addFields(
          { name: 'Quiz', value: question.quiz.title, inline: true },
          { name: 'Question', value: question.questionText.length > 100 
            ? question.questionText.substring(0, 97) + '...' 
            : question.questionText, inline: false },
        )
        .setColor('#ffa500')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`💡 Hints for Question`)
      .setDescription(`Question ID: \`${questionId}\``)
      .addFields(
        { name: 'Quiz', value: question.quiz.title, inline: true },
        { name: 'Total Hints', value: `${question.hints.length}/5`, inline: true },
        { name: 'Question', value: question.questionText.length > 100 
          ? question.questionText.substring(0, 97) + '...' 
          : question.questionText, inline: false },
      )
      .setColor('#0099ff')
      .setTimestamp();

    // Add hints as fields
    question.hints.forEach((hint, index) => {
      const hintText = hint.text.length > 150 
        ? hint.text.substring(0, 147) + '...' 
        : hint.text;
      
      embed.addFields({
        name: `${index + 1}. ${hint.title}`,
        value: `**ID:** \`${hint.id}\`\n**Content:** ${hintText}`,
        inline: false,
      });
    });

    await interaction.editReply({ embeds: [embed] });

    logger.info(`Hint list displayed for question "${question.questionText}" by ${interaction.user.tag}`);
  } catch (error) {
    logger.error('Error listing hints:', error);
    await interaction.editReply('❌ An error occurred while listing hints. Please try again.');
  }
}