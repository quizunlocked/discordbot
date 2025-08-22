import { EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';

interface GeneratedQuestion {
  questionText: string;
  options: string[];
  correctAnswer: number;
  points: number;
  timeLimit: number;
  hints: Array<{ title: string; text: string }>;
}

export async function handleGenerate(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    await interaction.deferReply({ ephemeral: true });

    const corpusTitle = interaction.options.getString('from-corpus', true);
    const quizTitle = interaction.options.getString('quiz-title', true);
    const numQuestions = interaction.options.getInteger('num-questions', true);
    const numChoices = interaction.options.getInteger('num-choices') || 4;
    const showHints = interaction.options.getBoolean('show-hints') ?? true;
    const isPrivate = interaction.options.getBoolean('private') ?? false;

    // Find the corpus
    const corpus = await databaseService.prisma.corpus.findUnique({
      where: { title: corpusTitle },
      include: { entries: true },
    });

    if (!corpus) {
      await interaction.editReply(
        `❌ Corpus "${corpusTitle}" not found. Please check the corpus title.`
      );
      return;
    }

    if (corpus.entries.length === 0) {
      await interaction.editReply(
        `❌ Corpus "${corpusTitle}" has no entries. Please upload corpus data first.`
      );
      return;
    }

    // Check if we have enough entries for the requested number of questions
    if (corpus.entries.length < numQuestions) {
      await interaction.editReply(
        `❌ Not enough entries in corpus. Requested ${numQuestions} questions but corpus only has ${corpus.entries.length} entries.`
      );
      return;
    }

    // Check if we have enough entries for distractors
    if (corpus.entries.length < numChoices) {
      await interaction.editReply(
        `❌ Not enough entries for ${numChoices} answer choices. Corpus has only ${corpus.entries.length} entries. Need at least ${numChoices} entries.`
      );
      return;
    }

    // Check if quiz title already exists for this user
    const existingQuiz = await databaseService.prisma.quiz.findFirst({
      where: {
        title: quizTitle,
        quizOwnerId: interaction.user.id,
      },
    });

    if (existingQuiz) {
      await interaction.editReply(
        `❌ You already have a quiz titled "${quizTitle}". Please choose a different title.`
      );
      return;
    }

    // Generate the quiz
    const generatedQuestions = await generateQuizFromCorpus(
      corpus.entries,
      numQuestions,
      numChoices,
      showHints
    );

    if (generatedQuestions.length === 0) {
      await interaction.editReply('❌ Failed to generate quiz questions. Please try again.');
      return;
    }

    // Create the quiz in database
    const quizId = `quiz_${interaction.id}_${Date.now()}`;

    await databaseService.prisma.$transaction(async tx => {
      // Create or get user
      const user = await tx.user.upsert({
        where: { id: interaction.user.id },
        update: {},
        create: {
          id: interaction.user.id,
          username: interaction.user.username,
        },
      });

      // Create quiz
      const quiz = await tx.quiz.create({
        data: {
          id: quizId,
          title: quizTitle,
          description: `Quiz generated from corpus "${corpusTitle}" by ${interaction.user.username}`,
          isActive: true,
          private: isPrivate,
          quizOwnerId: user.id,
        },
      });

      // Create questions
      for (let i = 0; i < generatedQuestions.length; i++) {
        const question = generatedQuestions[i];
        if (!question) continue;

        const createdQuestion = await tx.question.create({
          data: {
            quizId: quiz.id,
            questionText: question.questionText,
            options: JSON.stringify(question.options),
            correctAnswer: question.correctAnswer,
            points: question.points,
            timeLimit: question.timeLimit,
          },
        });

        // Create hints if they exist
        if (showHints && question.hints.length > 0) {
          const hintData = question.hints.map(hint => ({
            questionId: createdQuestion.id,
            title: hint.title,
            text: hint.text,
          }));

          await tx.hint.createMany({
            data: hintData,
          });
        }
      }
    });

    // Create success embed
    const embed = new EmbedBuilder()
      .setTitle('✅ Quiz Generated Successfully')
      .setDescription(`**${quizTitle}** has been generated from corpus "${corpusTitle}"!`)
      .addFields(
        { name: 'Quiz ID', value: quizId, inline: true },
        { name: 'Questions', value: generatedQuestions.length.toString(), inline: true },
        { name: 'Answer Choices', value: numChoices.toString(), inline: true },
        { name: 'Hints Included', value: showHints ? 'Yes' : 'No', inline: true },
        { name: 'Privacy', value: isPrivate ? '🔒 Private' : '🌐 Public', inline: true },
        { name: 'Created By', value: interaction.user.username, inline: true }
      )
      .setColor('#00ff00')
      .setTimestamp();

    // Add hint statistics if hints are included
    if (showHints) {
      const totalHints = generatedQuestions.reduce((sum, q) => sum + q.hints.length, 0);
      embed.addFields({ name: 'Total Hints', value: totalHints.toString(), inline: true });
    }

    await interaction.editReply({ embeds: [embed] });

    logger.info(
      `Quiz "${quizTitle}" generated from corpus "${corpusTitle}" by ${interaction.user.tag} with ${generatedQuestions.length} questions`
    );
  } catch (error) {
    logger.error('Error generating quiz from corpus:', error);
    await interaction.editReply(
      '❌ An error occurred while generating the quiz. Please try again.'
    );
  }
}

async function generateQuizFromCorpus(
  entries: any[],
  numQuestions: number,
  numChoices: number,
  includeHints: boolean
): Promise<GeneratedQuestion[]> {
  try {
    // Randomly select entries for the quiz (without replacement)
    const selectedEntries = shuffleArray([...entries]).slice(0, numQuestions);

    // Create a pool of all answer variants for distractor generation
    const allAnswerVariants = entries.flatMap(entry => entry.answerVariants as string[]);

    const generatedQuestions: GeneratedQuestion[] = [];

    for (const entry of selectedEntries) {
      // Parse the stored arrays
      const questionVariants = entry.questionVariants as string[];
      const answerVariants = entry.answerVariants as string[];
      const hintTitles = entry.hintTitles as string[];
      const hintVariants = entry.hintVariants as Record<string, string[]>;

      // Randomly select one question variant
      const questionText = getRandomElement(questionVariants);

      // Randomly select one correct answer variant
      const correctAnswer = getRandomElement(answerVariants);

      // Generate distractors (incorrect answers) from other entries
      const otherAnswers = allAnswerVariants.filter(answer => !answerVariants.includes(answer));
      const distractors = shuffleArray(otherAnswers).slice(0, numChoices - 1);

      // Combine correct answer and distractors
      const allOptions = [correctAnswer, ...distractors];
      const shuffledOptions = shuffleArray(allOptions);

      // Find the index of the correct answer after shuffling
      const correctIndex = shuffledOptions.indexOf(correctAnswer);

      // Generate hints if requested
      const hints: Array<{ title: string; text: string }> = [];
      if (includeHints && hintTitles.length > 0) {
        for (const hintTitle of hintTitles) {
          const hintVariantsForTitle = hintVariants[hintTitle];
          if (hintVariantsForTitle && hintVariantsForTitle.length > 0) {
            const selectedHintText = getRandomElement(hintVariantsForTitle);
            hints.push({
              title: hintTitle,
              text: selectedHintText,
            });
          }
        }
      }

      generatedQuestions.push({
        questionText,
        options: shuffledOptions,
        correctAnswer: correctIndex,
        points: 10, // Default points
        timeLimit: 30, // Default time limit
        hints,
      });
    }

    return generatedQuestions;
  } catch (error) {
    logger.error('Error in generateQuizFromCorpus:', error);
    return [];
  }
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i]!, shuffled[j]!] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

function getRandomElement<T>(array: T[]): T {
  const element = array[Math.floor(Math.random() * array.length)];
  if (element === undefined) {
    throw new Error('Cannot get random element from empty array');
  }
  return element;
}
