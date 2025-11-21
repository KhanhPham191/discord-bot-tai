const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
      { name: 'Description', value: npc.description || 'No description available' }
    )
    .setFooter({ text: 'Where Winds Meet Game Database' });
}

// Create embed for boss info
function createBossEmbed(boss) {
  return new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle(`👹 ${boss.name}`)
    .addFields(
      { name: 'Type', value: boss.type, inline: true },
      { name: 'Description', value: boss.description || 'No description available' }
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
      { name: 'Description', value: item.description }
    )
    .setFooter({ text: 'Where Winds Meet Game Database' });
}

// Handle weapon search command
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

const ITEMS_PER_PAGE = 25;

// Create weapon dropdown menu with pagination
function createWeaponSelectMenu(page = 0) {
  const allWeapons = getAllWeapons();
  const start = page * ITEMS_PER_PAGE;
  const weapons = allWeapons.slice(start, start + ITEMS_PER_PAGE);
  
  const options = weapons.map(w => ({
    label: w.name.substring(0, 100),
    value: w.id.toString(),
    emoji: '⚔️'
  }));

  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`game_weapon_select_${page}`)
        .setPlaceholder('Chọn một vũ khí...')
        .addOptions(options)
    );
}

// Create NPC dropdown menu with pagination
function createNPCSelectMenu(page = 0) {
  const allNPCs = getAllNPCs();
  const start = page * ITEMS_PER_PAGE;
  const npcs = allNPCs.slice(start, start + ITEMS_PER_PAGE);
  
  const options = npcs.map(n => ({
    label: n.name.substring(0, 100),
    value: n.id.toString(),
    emoji: '👤'
  }));

  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`game_npc_select_${page}`)
        .setPlaceholder('Chọn một nhân vật...')
        .addOptions(options)
    );
}

// Create boss dropdown menu with pagination
function createBossSelectMenu(page = 0) {
  const allBosses = getAllBosses();
  const start = page * ITEMS_PER_PAGE;
  const bosses = allBosses.slice(start, start + ITEMS_PER_PAGE);
  
  const options = bosses.map(b => ({
    label: b.name.substring(0, 100),
    value: b.id.toString(),
    emoji: '👹'
  }));

  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`game_boss_select_${page}`)
        .setPlaceholder('Chọn một boss...')
        .addOptions(options)
    );
}

// Create skill dropdown menu with pagination
function createSkillSelectMenu(page = 0) {
  const allSkills = getAllSkills();
  const start = page * ITEMS_PER_PAGE;
  const skills = allSkills.slice(start, start + ITEMS_PER_PAGE);
  
  const options = skills.map(s => ({
    label: s.name.substring(0, 100),
    value: s.id.toString(),
    emoji: '✨'
  }));

  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`game_skill_select_${page}`)
        .setPlaceholder('Chọn một kỹ năng...')
        .addOptions(options)
    );
}

// Create item dropdown menu with pagination
function createItemSelectMenu(page = 0) {
  const allItems = getAllItems();
  const start = page * ITEMS_PER_PAGE;
  const items = allItems.slice(start, start + ITEMS_PER_PAGE);
  
  const options = items.map(i => ({
    label: i.name.substring(0, 100),
    value: i.id.toString(),
    emoji: '📦'
  }));

  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`game_item_select_${page}`)
        .setPlaceholder('Chọn một vật phẩm...')
        .addOptions(options)
    );
}

// Create pagination buttons
function createPaginationButtons(type, page, maxPage) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`game_page_prev_${type}_${page}`)
        .setLabel('⬅️ Trước')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`game_page_info_${type}_${page}`)
        .setLabel(`Trang ${page + 1}/${maxPage + 1}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`game_page_next_${type}_${page}`)
        .setLabel('Tiếp ➡️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === maxPage)
    );
}

// Show all weapons with dropdown and pagination
async function showAllWeapons(interaction, page = 0) {
  const allWeapons = getAllWeapons();
  const maxPage = Math.ceil(allWeapons.length / ITEMS_PER_PAGE) - 1;
  const start = page * ITEMS_PER_PAGE;
  const end = Math.min(start + ITEMS_PER_PAGE, allWeapons.length);

  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle('⚔️ Tất cả Vũ Khí')
    .setDescription(`Có ${allWeapons.length} vũ khí trong cơ sở dữ liệu.\n\nHiển thị: ${start + 1}-${end}`)
    .setFooter({ text: `Trang ${page + 1}/${maxPage + 1}` });

  const components = [createWeaponSelectMenu(page)];
  if (maxPage > 0) {
    components.push(createPaginationButtons('weapons', page, maxPage));
  }

  if (interaction.replied || interaction.deferred) {
    return interaction.editReply({
      embeds: [embed],
      components
    });
  } else {
    return interaction.reply({
      embeds: [embed],
      components,
      ephemeral: false
    });
  }
}

// Show all NPCs with dropdown and pagination
async function showAllNPCs(interaction, page = 0) {
  const allNPCs = getAllNPCs();
  const maxPage = Math.ceil(allNPCs.length / ITEMS_PER_PAGE) - 1;
  const start = page * ITEMS_PER_PAGE;
  const end = Math.min(start + ITEMS_PER_PAGE, allNPCs.length);

  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('👤 Tất cả Nhân Vật')
    .setDescription(`Có ${allNPCs.length} nhân vật trong cơ sở dữ liệu.\n\nHiển thị: ${start + 1}-${end}`)
    .setFooter({ text: `Trang ${page + 1}/${maxPage + 1}` });

  const components = [createNPCSelectMenu(page)];
  if (maxPage > 0) {
    components.push(createPaginationButtons('npcs', page, maxPage));
  }

  if (interaction.replied || interaction.deferred) {
    return interaction.editReply({
      embeds: [embed],
      components
    });
  } else {
    return interaction.reply({
      embeds: [embed],
      components,
      ephemeral: false
    });
  }
}

// Show all bosses with dropdown and pagination
async function showAllBosses(interaction, page = 0) {
  const allBosses = getAllBosses();
  const maxPage = Math.ceil(allBosses.length / ITEMS_PER_PAGE) - 1;
  const start = page * ITEMS_PER_PAGE;
  const end = Math.min(start + ITEMS_PER_PAGE, allBosses.length);

  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('👹 Tất cả Boss')
    .setDescription(`Có ${allBosses.length} boss trong cơ sở dữ liệu.\n\nHiển thị: ${start + 1}-${end}`)
    .setFooter({ text: `Trang ${page + 1}/${maxPage + 1}` });

  const components = [createBossSelectMenu(page)];
  if (maxPage > 0) {
    components.push(createPaginationButtons('bosses', page, maxPage));
  }

  if (interaction.replied || interaction.deferred) {
    return interaction.editReply({
      embeds: [embed],
      components
    });
  } else {
    return interaction.reply({
      embeds: [embed],
      components,
      ephemeral: false
    });
  }
}

// Show all skills with dropdown and pagination
async function showAllSkills(interaction, page = 0) {
  const allSkills = getAllSkills();
  const maxPage = Math.ceil(allSkills.length / ITEMS_PER_PAGE) - 1;
  const start = page * ITEMS_PER_PAGE;
  const end = Math.min(start + ITEMS_PER_PAGE, allSkills.length);

  const embed = new EmbedBuilder()
    .setColor(0xFFFF00)
    .setTitle('✨ Tất cả Kỹ Năng')
    .setDescription(`Có ${allSkills.length} kỹ năng trong cơ sở dữ liệu.\n\nHiển thị: ${start + 1}-${end}`)
    .setFooter({ text: `Trang ${page + 1}/${maxPage + 1}` });

  const components = [createSkillSelectMenu(page)];
  if (maxPage > 0) {
    components.push(createPaginationButtons('skills', page, maxPage));
  }

  if (interaction.replied || interaction.deferred) {
    return interaction.editReply({
      embeds: [embed],
      components
    });
  } else {
    return interaction.reply({
      embeds: [embed],
      components,
      ephemeral: false
    });
  }
}

// Show all items with dropdown and pagination
async function showAllItems(interaction, page = 0) {
  const allItems = getAllItems();
  const maxPage = Math.ceil(allItems.length / ITEMS_PER_PAGE) - 1;
  const start = page * ITEMS_PER_PAGE;
  const end = Math.min(start + ITEMS_PER_PAGE, allItems.length);

  const embed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle('📦 Tất cả Vật Phẩm')
    .setDescription(`Có ${allItems.length} vật phẩm trong cơ sở dữ liệu.\n\nHiển thị: ${start + 1}-${end}`)
    .setFooter({ text: `Trang ${page + 1}/${maxPage + 1}` });

  const components = [createItemSelectMenu(page)];
  if (maxPage > 0) {
    components.push(createPaginationButtons('items', page, maxPage));
  }

  if (interaction.replied || interaction.deferred) {
    return interaction.editReply({
      embeds: [embed],
      components
    });
  } else {
    return interaction.reply({
      embeds: [embed],
      components,
      ephemeral: false
    });
  }
}

module.exports = {
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
  showAllItems,
  createWeaponEmbed,
  createNPCEmbed,
  createBossEmbed,
  createSkillEmbed,
  createItemEmbed
};
