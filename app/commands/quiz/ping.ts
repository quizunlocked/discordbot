import { SlashCommandBuilder, CommandInteraction } from 'discord.js';

export const data = new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!');

export async function execute(interaction: CommandInteraction): Promise<void> {
  const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
  const latency = sent.createdTimestamp - interaction.createdTimestamp;

  await interaction.editReply(`Pong! Latency is ${latency}ms.`);
}
