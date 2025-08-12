import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { logger } from '@/utils/logger';
import { databaseService } from '@/services/DatabaseService';

export const data = new SlashCommandBuilder()
  .setName('edit-question-add-hint')
  .setDescription('Add a hint to a specific question in a quiz')
  .addStringOption(option =>
    option
      .setName('quiz-id')
      .setDescription('ID of the quiz containing the question')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option
      .setName('question-number')
      .setDescription('Question number in the quiz (1-based index)')
      .setRequired(true)
      .setMinValue(1)
  )
  .addStringOption(option =>
    option
      .setName('hint-title')
      .setDescription('Title for the hint button (e.g., "Example", "Grammar tip")')
      .setRequired(true)
      .setMaxLength(80)
  )
  .addStringOption(option =>
    option
      .setName('hint-text')
      .setDescription('The hint content shown when clicked')
      .setRequired(true)
      .setMaxLength(2000)
  );

export const cooldown = 5; // 5 second cooldown

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    await interaction.deferReply({ ephemeral: true });

    const quizId = interaction.options.getString('quiz-id', true);
    const questionNumber = interaction.options.getInteger('question-number', true);
    const hintTitle = interaction.options.getString('hint-title', true);
    const hintText = interaction.options.getString('hint-text', true);

    // Validate quiz exists and user has access
    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { 
        questions: {
          orderBy: { id: 'asc' } // Ensure consistent ordering
        }
      },
    });

    if (!quiz) {
      await interaction.editReply('❌ Quiz not found. Please check the quiz ID.');
      return;
    }

    // Check if user owns the quiz (only quiz owners can edit)
    if (quiz.quizOwnerId && quiz.quizOwnerId !== interaction.user.id) {
      await interaction.editReply('❌ You can only add hints to quizzes you created.');
      return;
    }

    // Validate question number
    if (questionNumber > quiz.questions.length) {
      await interaction.editReply(
        `❌ Invalid question number. This quiz has ${quiz.questions.length} questions.`
      );
      return;
    }

    const question = quiz.questions[questionNumber - 1]; // Convert to 0-based index

    if (!question) {
      await interaction.editReply('❌ Question not found.');
      return;
    }

    // Check current hint count (limit to 5 per question as per feasibility report)
    const currentHints = await databaseService.prisma.hint.count({
      where: { questionId: question.id },
    });

    if (currentHints >= 5) {
      await interaction.editReply(
        '❌ Maximum of 5 hints per question allowed. Please remove some hints before adding new ones.'
      );
      return;
    }

    // Check for duplicate hint titles on the same question
    const existingHint = await databaseService.prisma.hint.findFirst({
      where: {
        questionId: question.id,
        title: hintTitle,
      },
    });

    if (existingHint) {
      await interaction.editReply(
        `❌ A hint with the title "${hintTitle}" already exists for this question.`
      );
      return;
    }

    // Create the hint
    await databaseService.prisma.hint.create({
      data: {
        questionId: question.id,
        title: hintTitle,
        text: hintText,
      },
    });

    // Create success embed
    const embed = new EmbedBuilder()
      .setTitle('✅ Hint Added Successfully')
      .setDescription(`Added hint to **${quiz.title}**`)
      .addFields(
        { name: 'Quiz ID', value: quizId, inline: true },
        { name: 'Question Number', value: questionNumber.toString(), inline: true },
        { name: 'Question', value: question.questionText.length > 100 
          ? question.questionText.substring(0, 97) + '...' 
          : question.questionText, inline: false },
        { name: 'Hint Title', value: hintTitle, inline: true },
        { name: 'Hint Text', value: hintText.length > 100 
          ? hintText.substring(0, 97) + '...' 
          : hintText, inline: false },
        { name: 'Total Hints', value: `${currentHints + 1}/5`, inline: true }
      )
      .setColor('#00ff00')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    logger.info(
      `Hint "${hintTitle}" added to question ${questionNumber} in quiz "${quiz.title}" by ${interaction.user.tag}`
    );

  } catch (error) {
    logger.error('Error adding hint to question:', error);
    await interaction.editReply(
      '❌ An error occurred while adding the hint. Please try again.'
    );
  }
}