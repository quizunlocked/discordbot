import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { logger } from '@/utils/logger';
import { databaseService } from '@/services/DatabaseService';
import Papa from 'papaparse';

interface CSVQuestion {
  questionText: string;
  options: string; // JSON array
  correctAnswer: number;
  points?: number;
  timeLimit?: number;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export const data = new SlashCommandBuilder()
  .setName('upload-quiz-csv')
  .setDescription('Upload a CSV file to create a custom quiz')
  .addAttachmentOption(option =>
    option
      .setName('file')
      .setDescription('CSV file with quiz questions')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('title')
      .setDescription('Optional quiz title (defaults to filename)')
      .setRequired(false)
  );

export const cooldown = 10; // 10 second cooldown

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    await interaction.deferReply({ ephemeral: true });

    const title = interaction.options.getString('title') || null;
    const attachment = interaction.options.getAttachment('file');

    if (!attachment) {
      await interaction.editReply('❌ No file was provided. Please attach a CSV file.');
      return;
    }

    // Validate file type and size
    if (!attachment.contentType?.includes('text/csv') && !attachment.name?.endsWith('.csv')) {
      await interaction.editReply('❌ Invalid file type. Please upload a CSV file.');
      return;
    }

    if (attachment.size > 25 * 1024 * 1024) { // 25MB limit
      await interaction.editReply('❌ File too large. Please upload a CSV file smaller than 25MB.');
      return;
    }

    // Download and parse the CSV file
    const csvContent = await downloadAttachment(attachment.url);
    if (!csvContent) {
      await interaction.editReply('❌ Failed to download the CSV file. Please try again.');
      return;
    }

    // Parse CSV content
    const { questions, errors } = parseCSV(csvContent);
    
    if (errors.length > 0) {
      const errorMessage = formatValidationErrors(errors);
      await interaction.editReply(`❌ CSV validation failed:\n\n${errorMessage}`);
      return;
    }

    if (questions.length === 0) {
      await interaction.editReply('❌ No valid questions found in the CSV file.');
      return;
    }

    if (questions.length > 100) {
      await interaction.editReply('❌ Too many questions. Maximum allowed is 100 questions per quiz.');
      return;
    }

    // Create quiz in database
    const quizTitle = title || `Custom Quiz - ${interaction.user.username}`;
    const quizId = `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await databaseService.prisma.$transaction(async (tx) => {
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
          description: `Quiz created from CSV upload by ${interaction.user.username}`,
          isActive: true,
          private: false,
          quizOwnerId: user.id,
        },
      });

      // Create questions
      const questionData = questions.map(q => ({
        quizId: quiz.id,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        points: q.points || 10,
        timeLimit: q.timeLimit || 30,
      }));

      await tx.question.createMany({
        data: questionData,
      });
    });

    // Create success embed
    const embed = new EmbedBuilder()
      .setTitle('✅ Quiz Created Successfully')
      .setDescription(`**${quizTitle}** has been created from your CSV file!`)
      .addFields(
        { name: 'Quiz ID', value: quizId, inline: true },
        { name: 'Questions', value: questions.length.toString(), inline: true },
        { name: 'Created By', value: interaction.user.username, inline: true },
        { name: 'Status', value: '🟢 Active', inline: true }
      )
      .setColor('#00ff00')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    logger.info(`Quiz "${quizTitle}" created from CSV by ${interaction.user.tag} with ${questions.length} questions`);

  } catch (error) {
    logger.error('Error uploading CSV quiz:', error);
    await interaction.editReply('❌ An error occurred while processing your CSV file. Please check the format and try again.');
  }
}

async function downloadAttachment(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    logger.error('Error downloading attachment:', error);
    return null;
  }
}

function parseCSV(csvContent: string): { questions: CSVQuestion[], errors: ValidationError[] } {
  const questions: CSVQuestion[] = [];
  const errors: ValidationError[] = [];

  Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
             if (results.errors.length > 0) {
         results.errors.forEach(error => {
           errors.push({
             row: (error.row || 0) + 1,
             field: 'CSV Format',
             message: error.message,
           });
         });
         return;
       }

      results.data.forEach((row: any, index: number) => {
        const rowNumber = index + 1;
        const rowErrors = validateRow(row, rowNumber);
        errors.push(...rowErrors);

                 if (rowErrors.length === 0) {
           questions.push({
             questionText: row.questionText?.trim(),
             options: row.options?.trim(),
             correctAnswer: parseInt(row.correctAnswer),
             points: row.points ? parseInt(row.points) : undefined,
             timeLimit: row.timeLimit ? parseInt(row.timeLimit) : undefined,
           } as CSVQuestion);
         }
      });
    },
         error: (error: any) => {
       errors.push({
         row: 0,
         field: 'CSV Parsing',
         message: error.message,
       });
     },
  });

  return { questions, errors };
}

function validateRow(row: any, rowNumber: number): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check required fields
  if (!row.questionText?.trim()) {
    errors.push({
      row: rowNumber,
      field: 'questionText',
      message: 'Question text is required',
    });
  }

  if (!row.options?.trim()) {
    errors.push({
      row: rowNumber,
      field: 'options',
      message: 'Options (JSON array) is required',
    });
  }

  if (row.correctAnswer === undefined || row.correctAnswer === '') {
    errors.push({
      row: rowNumber,
      field: 'correctAnswer',
      message: 'Correct answer index is required',
    });
  }

  // Validate options JSON
  if (row.options?.trim()) {
    try {
      const options = JSON.parse(row.options.trim());
      if (!Array.isArray(options) || options.length < 2) {
        errors.push({
          row: rowNumber,
          field: 'options',
          message: 'Options must be a JSON array with at least 2 items',
        });
      }
    } catch (error) {
      errors.push({
        row: rowNumber,
        field: 'options',
        message: 'Options must be valid JSON array format',
      });
    }
  }

  // Validate correct answer index
  if (row.correctAnswer !== undefined && row.correctAnswer !== '') {
    const correctAnswer = parseInt(row.correctAnswer);
    if (isNaN(correctAnswer) || correctAnswer < 0) {
      errors.push({
        row: rowNumber,
        field: 'correctAnswer',
        message: 'Correct answer must be a non-negative integer',
      });
    } else if (row.options?.trim()) {
      try {
        const options = JSON.parse(row.options.trim());
        if (Array.isArray(options) && correctAnswer >= options.length) {
          errors.push({
            row: rowNumber,
            field: 'correctAnswer',
            message: `Correct answer index ${correctAnswer} is out of range (0-${options.length - 1})`,
          });
        }
      } catch (error) {
        // JSON parsing error already handled above
      }
    }
  }

  // Validate points (optional)
  if (row.points !== undefined && row.points !== '') {
    const points = parseInt(row.points);
    if (isNaN(points) || points < 1 || points > 100) {
      errors.push({
        row: rowNumber,
        field: 'points',
        message: 'Points must be between 1 and 100',
      });
    }
  }

  // Validate time limit (optional)
  if (row.timeLimit !== undefined && row.timeLimit !== '') {
    const timeLimit = parseInt(row.timeLimit);
    if (isNaN(timeLimit) || timeLimit < 10 || timeLimit > 300) {
      errors.push({
        row: rowNumber,
        field: 'timeLimit',
        message: 'Time limit must be between 10 and 300 seconds',
      });
    }
  }

  return errors;
}

function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return '';

  const errorGroups = new Map<string, ValidationError[]>();
  
  errors.forEach(error => {
    const key = error.row === 0 ? 'General' : `Row ${error.row}`;
    if (!errorGroups.has(key)) {
      errorGroups.set(key, []);
    }
    errorGroups.get(key)!.push(error);
  });

  let message = '';
  
  for (const [group, groupErrors] of errorGroups) {
    message += `**${group}:**\n`;
    groupErrors.forEach(error => {
      message += `• ${error.field}: ${error.message}\n`;
    });
    message += '\n';
  }

  return message.trim();
} 