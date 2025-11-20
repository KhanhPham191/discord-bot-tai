const { EmbedBuilder } = require('discord.js');
const { 
  searchWeapons, 
  searchNPCs, 
  searchBosses, 
  searchSkills, 
  searchItems,
  getAllWeapons,
  getAllNPCs,
  getAllBosses,
  getAllSkills,
  getAllItems
} = require('./game-scraper');

// Create embed for weapon info
function createWeaponEmbed(weapon) {
  return new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle(`⚔️ ${weapon.name}`)
    .addFields(
      { name: 'Type', value: weapon.type, inline: true },
      { name: 'Damage', value: weapon.damage.toString(), inline: true },
      { name: 'Rarity', value: weapon.rarity, inline: true },
      { name: 'Description', value: weapon.description }
    )
    .setFooter({ text: 'Where Winds Meet Game Database' });
}

// Create embed for NPC info
function createNPCEmbed(npc) {
  return new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`👤 ${npc.name}`)
    .addFields(
      { name: 'Role', value: npc.role, inline: true },
      { name: 'Location', value: npc.location, inline: true },
      { name: 'Description', value: npc.description }
    )
    .setFooter({ text: 'Where Winds Meet Game Database' });
}

// Create embed for boss info
function createBossEmbed(boss) {
  return new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle(`👹 ${boss.name}`)
    .addFields(
      { name: 'Level', value: boss.level.toString(), inline: true },
      { name: 'Health', value: boss.health.toString(), inline: true },
      { name: 'Location', value: boss.location, inline: true },
      { name: 'Rewards', value: boss.rewards }
    )
    .setFooter({ text: 'Where Winds Meet Game Database' });
}

// Create embed for skill info
function createSkillEmbed(skill) {
  return new EmbedBuilder()
    .setColor(0xFFAA00)
    .setTitle(`✨ ${skill.name}`)
    .addFields(
      { name: 'Type', value: skill.type, inline: true },
      { name: 'Damage Type', value: skill.damageType, inline: true },
      { name: 'Cooldown', value: `${skill.cooldown}s`, inline: true },
      { name: 'Description', value: skill.description }
    )
    .setFooter({ text: 'Where Winds Meet Game Database' });
}

// Create embed for item info
function createItemEmbed(item) {
  return new EmbedBuilder()
    .setColor(0xAA00FF)
    .setTitle(`📦 ${item.name}`)
    .addFields(
      { name: 'Type', value: item.type, inline: true },
      { name: 'Rarity', value: item.rarity, inline: true },
      { name: 'Effect', value: item.effect }
    )
    .setFooter({ text: 'Where Winds Meet Game Database' });
}

// Handle weapon search command
async function handleWeaponSearch(interaction) {
  const query = interaction.options.getString('name');
  const results = searchWeapons(query);

  if (results.length === 0) {
    return interaction.reply({
      content: `❌ No weapons found matching "${query}"`,
      ephemeral: true
    });
  }

  if (results.length === 1) {
    return interaction.reply({
      embeds: [createWeaponEmbed(results[0])]
    });
  }

  // Show first 5 results
  const embeds = results.slice(0, 5).map(createWeaponEmbed);
  return interaction.reply({
    content: `🔍 Found ${results.length} weapons. Showing first 5:`,
    embeds
  });
}

// Handle NPC search command
async function handleNPCSearch(interaction) {
  const query = interaction.options.getString('name');
  const results = searchNPCs(query);

  if (results.length === 0) {
    return interaction.reply({
      content: `❌ No NPCs found matching "${query}"`,
      ephemeral: true
    });
  }

  if (results.length === 1) {
    return interaction.reply({
      embeds: [createNPCEmbed(results[0])]
    });
  }

  const embeds = results.slice(0, 5).map(createNPCEmbed);
  return interaction.reply({
    content: `🔍 Found ${results.length} NPCs. Showing first 5:`,
    embeds
  });
}

// Handle boss search command
async function handleBossSearch(interaction) {
  const query = interaction.options.getString('name');
  const results = searchBosses(query);

  if (results.length === 0) {
    return interaction.reply({
      content: `❌ No bosses found matching "${query}"`,
      ephemeral: true
    });
  }

  if (results.length === 1) {
    return interaction.reply({
      embeds: [createBossEmbed(results[0])]
    });
  }

  const embeds = results.slice(0, 5).map(createBossEmbed);
  return interaction.reply({
    content: `🔍 Found ${results.length} bosses. Showing first 5:`,
    embeds
  });
}

// Handle skill search command
async function handleSkillSearch(interaction) {
  const query = interaction.options.getString('name');
  const results = searchSkills(query);

  if (results.length === 0) {
    return interaction.reply({
      content: `❌ No skills found matching "${query}"`,
      ephemeral: true
    });
  }

  if (results.length === 1) {
    return interaction.reply({
      embeds: [createSkillEmbed(results[0])]
    });
  }

  const embeds = results.slice(0, 5).map(createSkillEmbed);
  return interaction.reply({
    content: `🔍 Found ${results.length} skills. Showing first 5:`,
    embeds
  });
}

// Handle item search command
async function handleItemSearch(interaction) {
  const query = interaction.options.getString('name');
  const results = searchItems(query);

  if (results.length === 0) {
    return interaction.reply({
      content: `❌ No items found matching "${query}"`,
      ephemeral: true
    });
  }

  if (results.length === 1) {
    return interaction.reply({
      embeds: [createItemEmbed(results[0])]
    });
  }

  const embeds = results.slice(0, 5).map(createItemEmbed);
  return interaction.reply({
    content: `🔍 Found ${results.length} items. Showing first 5:`,
    embeds
  });
}

// Get game stats command
async function handleGameStats(interaction) {
  const weaponsCount = getAllWeapons().length;
  const npcsCount = getAllNPCs().length;
  const bossesCount = getAllBosses().length;
  const skillsCount = getAllSkills().length;
  const itemsCount = getAllItems().length;

  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('🎮 Where Winds Meet - Database Stats')
    .addFields(
      { name: '⚔️ Weapons', value: weaponsCount.toString(), inline: true },
      { name: '👤 NPCs', value: npcsCount.toString(), inline: true },
      { name: '👹 Bosses', value: bossesCount.toString(), inline: true },
      { name: '✨ Skills', value: skillsCount.toString(), inline: true },
      { name: '📦 Items', value: itemsCount.toString(), inline: true }
    )
    .setFooter({ text: 'Where Winds Meet Game Database' });

  return interaction.reply({ embeds: [embed] });
}

module.exports = {
  handleWeaponSearch,
  handleNPCSearch,
  handleBossSearch,
  handleSkillSearch,
  handleItemSearch,
  handleGameStats
};
