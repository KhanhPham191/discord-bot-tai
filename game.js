const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
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

// Handle weapon dropdown selection
async function handleWeaponSelect(interaction) {
  const weaponId = parseInt(interaction.values[0]);
  const weapon = getAllWeapons().find(w => w.id === weaponId);
  
  if (!weapon) {
    return interaction.reply({
      content: '❌ Vũ khí không tồn tại!',
      ephemeral: true
    });
  }

  return interaction.reply({
    embeds: [createWeaponEmbed(weapon)]
  });
}

// Handle NPC dropdown selection
async function handleNPCSelect(interaction) {
  const npcId = parseInt(interaction.values[0]);
  const npc = getAllNPCs().find(n => n.id === npcId);
  
  if (!npc) {
    return interaction.reply({
      content: '❌ Nhân vật không tồn tại!',
      ephemeral: true
    });
  }

  return interaction.reply({
    embeds: [createNPCEmbed(npc)]
  });
}

// Handle boss dropdown selection
async function handleBossSelect(interaction) {
  const bossId = parseInt(interaction.values[0]);
  const boss = getAllBosses().find(b => b.id === bossId);
  
  if (!boss) {
    return interaction.reply({
      content: '❌ Boss không tồn tại!',
      ephemeral: true
    });
  }

  return interaction.reply({
    embeds: [createBossEmbed(boss)]
  });
}

// Handle skill dropdown selection
async function handleSkillSelect(interaction) {
  const skillId = parseInt(interaction.values[0]);
  const skill = getAllSkills().find(s => s.id === skillId);
  
  if (!skill) {
    return interaction.reply({
      content: '❌ Kỹ năng không tồn tại!',
      ephemeral: true
    });
  }

  return interaction.reply({
    embeds: [createSkillEmbed(skill)]
  });
}

// Handle item dropdown selection
async function handleItemSelect(interaction) {
  const itemId = parseInt(interaction.values[0]);
  const item = getAllItems().find(i => i.id === itemId);
  
  if (!item) {
    return interaction.reply({
      content: '❌ Vật phẩm không tồn tại!',
      ephemeral: true
    });
  }

  return interaction.reply({
    embeds: [createItemEmbed(item)]
  });
}

// Create weapon dropdown menu
function createWeaponSelectMenu() {
  const weapons = getAllWeapons().slice(0, 25);
  const options = weapons.map(w => ({
    label: w.name.substring(0, 100),
    value: w.id.toString(),
    emoji: '⚔️'
  }));

  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('game_weapon_select')
        .setPlaceholder('Chọn một vũ khí...')
        .addOptions(options)
    );
}

// Create NPC dropdown menu
function createNPCSelectMenu() {
  const npcs = getAllNPCs().slice(0, 25);
  const options = npcs.map(n => ({
    label: n.name.substring(0, 100),
    value: n.id.toString(),
    emoji: '👤'
  }));

  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('game_npc_select')
        .setPlaceholder('Chọn một nhân vật...')
        .addOptions(options)
    );
}

// Create boss dropdown menu
function createBossSelectMenu() {
  const bosses = getAllBosses().slice(0, 25);
  const options = bosses.map(b => ({
    label: b.name.substring(0, 100),
    value: b.id.toString(),
    emoji: '👹'
  }));

  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('game_boss_select')
        .setPlaceholder('Chọn một boss...')
        .addOptions(options)
    );
}

// Create skill dropdown menu
function createSkillSelectMenu() {
  const skills = getAllSkills().slice(0, 25);
  const options = skills.map(s => ({
    label: s.name.substring(0, 100),
    value: s.id.toString(),
    emoji: '✨'
  }));

  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('game_skill_select')
        .setPlaceholder('Chọn một kỹ năng...')
        .addOptions(options)
    );
}

// Create item dropdown menu
function createItemSelectMenu() {
  const items = getAllItems().slice(0, 25);
  const options = items.map(i => ({
    label: i.name.substring(0, 100),
    value: i.id.toString(),
    emoji: '📦'
  }));

  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('game_item_select')
        .setPlaceholder('Chọn một vật phẩm...')
        .addOptions(options)
    );
}

// Show all weapons with dropdown
async function showAllWeapons(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle('⚔️ Tất cả Vũ Khí')
    .setDescription(`Có ${getAllWeapons().length} vũ khí trong cơ sở dữ liệu. Chọn một từ menu bên dưới.`)
    .setFooter({ text: 'Where Winds Meet Game Database' });

  return interaction.reply({
    embeds: [embed],
    components: [createWeaponSelectMenu()],
    ephemeral: false
  });
}

// Show all NPCs with dropdown
async function showAllNPCs(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('👤 Tất cả Nhân Vật')
    .setDescription(`Có ${getAllNPCs().length} nhân vật trong cơ sở dữ liệu. Chọn một từ menu bên dưới.`)
    .setFooter({ text: 'Where Winds Meet Game Database' });

  return interaction.reply({
    embeds: [embed],
    components: [createNPCSelectMenu()],
    ephemeral: false
  });
}

// Show all bosses with dropdown
async function showAllBosses(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('👹 Tất cả Boss')
    .setDescription(`Có ${getAllBosses().length} boss trong cơ sở dữ liệu. Chọn một từ menu bên dưới.`)
    .setFooter({ text: 'Where Winds Meet Game Database' });

  return interaction.reply({
    embeds: [embed],
    components: [createBossSelectMenu()],
    ephemeral: false
  });
}

// Show all skills with dropdown
async function showAllSkills(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0xFFFF00)
    .setTitle('✨ Tất cả Kỹ Năng')
    .setDescription(`Có ${getAllSkills().length} kỹ năng trong cơ sở dữ liệu. Chọn một từ menu bên dưới.`)
    .setFooter({ text: 'Where Winds Meet Game Database' });

  return interaction.reply({
    embeds: [embed],
    components: [createSkillSelectMenu()],
    ephemeral: false
  });
}

// Show all items with dropdown
async function showAllItems(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle('📦 Tất cả Vật Phẩm')
    .setDescription(`Có ${getAllItems().length} vật phẩm trong cơ sở dữ liệu. Chọn một từ menu bên dưới.`)
    .setFooter({ text: 'Where Winds Meet Game Database' });

  return interaction.reply({
    embeds: [embed],
    components: [createItemSelectMenu()],
    ephemeral: false
  });
}

module.exports = {
  handleWeaponSearch,
  handleNPCSearch,
  handleBossSearch,
  handleSkillSearch,
  handleItemSearch,
  handleGameStats,
  handleWeaponSelect,
  handleNPCSelect,
  handleBossSelect,
  handleSkillSelect,
  handleItemSelect,
  showAllWeapons,
  showAllNPCs,
  showAllBosses,
  showAllSkills,
  showAllItems
};
