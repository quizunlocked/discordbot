import { SlashCommandBuilder, CommandInteraction } from 'discord.js';

export const data = new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!');

export async function execute(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  const startTime = Date.now();
  const latency = startTime - interaction.createdTimestamp;

  await interaction.editReply(`Pong! Latency is ${latency}ms.`);
}
