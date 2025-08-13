import {
  SlashCommandBuilder,
  CommandInteraction,
  AttachmentBuilder,
  EmbedBuilder,
} from 'discord.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('get-quiz-template')
  .setDescription('Get a CSV template for creating custom quizzes');

export const cooldown = 5; // 5 second cooldown

export async function execute(interaction: CommandInteraction): Promise<void> {
  try {
    await interaction.deferReply({ ephemeral: true });

    // Create CSV template content
    const csvContent = `questionText,options,correctAnswer,points,timeLimit,imageId
"What is the capital of Poland?","[""Warsaw"",""Krakow"",""Gdansk"",""Wroclaw""]",0,10,30,
"What is 2 + 2?","[""3"",""4"",""5"",""6""]",1,5,15,
"What is the largest planet in our solar system?","[""Mars"",""Venus"",""Jupiter"",""Saturn""]",2,15,45,`;

    // Create attachment
    const attachment = new AttachmentBuilder(Buffer.from(csvContent, 'utf-8'), {
      name: 'quiz-template.csv',
    });

    // Create embed with instructions
    const embed = new EmbedBuilder()
      .setTitle('📄 Quiz CSV Template')
      .setDescription("Here's a template for creating your own quiz!")
      .addFields(
        {
          name: '📋 CSV Format',
          value: 'Each row represents one question with the following columns:',
          inline: false,
        },
        {
          name: 'questionText',
          value: 'The question text (required)',
          inline: true,
        },
        {
          name: 'options',
          value: 'JSON array of answer options (required)',
          inline: true,
        },
        {
          name: 'correctAnswer',
          value: 'Index of correct answer (0-based, required)',
          inline: true,
        },
        {
          name: 'points',
          value: 'Points for this question (1-100, optional, default: 10)',
          inline: true,
        },
        {
          name: 'timeLimit',
          value: 'Time limit in seconds (10-300, optional, default: 30)',
          inline: true,
        },
        {
          name: 'imageId',
          value: 'Image ID from /image upload (optional)',
          inline: true,
        },
        {
          name: '📝 Instructions',
          value: [
            '1. Download and edit the CSV file',
            '2. Replace the example questions with your own',
            '3. Ensure options is a valid JSON array (e.g., `["Option A","Option B"]`)',
            '4. Set correctAnswer to the 0-based index of the correct option',
            '5. (Optional) Upload images using `/image upload` and add their IDs to imageId column',
            '6. Upload your CSV using `/upload-quiz-csv`',
            '',
            '**Note:** Maximum 100 questions per quiz, file size limit 25MB',
          ].join('\n'),
          inline: false,
        }
      )
      .setColor('#0099ff')
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
      files: [attachment],
    });

    logger.info(`Quiz template sent to ${interaction.user.tag}`);
  } catch (error) {
    logger.error('Error sending quiz template:', error);
    await interaction.editReply(
      '❌ An error occurred while generating the template. Please try again.'
    );
  }
}
