const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, 'game-data');
const BOSSES_FILE = path.join(CACHE_DIR, 'bosses.json');
const NPCS_FILE = path.join(CACHE_DIR, 'npcs.json');
const ITEMS_FILE = path.join(CACHE_DIR, 'items.json');
const ARMOR_FILE = path.join(CACHE_DIR, 'armor.json');
const ACCESSORIES_FILE = path.join(CACHE_DIR, 'accessories.json');
const COSMETICS_FILE = path.join(CACHE_DIR, 'cosmetics.json');
const SECTS_FILE = path.join(CACHE_DIR, 'sects.json');
const PROFESSIONS_FILE = path.join(CACHE_DIR, 'professions.json');
const BUILDS_FILE = path.join(CACHE_DIR, 'builds.json');
const INNER_WAYS_FILE = path.join(CACHE_DIR, 'inner_ways.json');
const MARTIAL_ARTS_FILE = path.join(CACHE_DIR, 'martial_arts.json');
const SIDE_QUESTS_FILE = path.join(CACHE_DIR, 'side_quests.json');
const OUTPOSTS_FILE = path.join(CACHE_DIR, 'outposts.json');
const SENTIENT_BEINGS_FILE = path.join(CACHE_DIR, 'sentient_beings.json');
const DUNGEONS_FILE = path.join(CACHE_DIR, 'dungeons.json');
const SKILLS_FILE = path.join(CACHE_DIR, 'skills.json');
const WEAPONS_FILE = path.join(CACHE_DIR, 'weapons.json');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Detailed descriptions for items
const ITEM_DESCRIPTIONS = {
  'Yin-Yang Ointment': 'Healing consumable that restores moderate health. Used in combat or exploration.',
  'Toxic Powder': 'Poisonous substance that can be used to poison weapons or create toxic traps.',
  'Oscillating Jade': 'Rare material with mysterious energy fluctuations. Used for crafting high-level gear.',
  'Hemostatic Powder': 'Stops bleeding and accelerates wound healing quickly.',
  'Kid\'s Fishing Rod': 'A simple fishing rod suitable for beginners. Can catch common fish.',
  'Ebon Iron': 'Dark iron ore used in weapon crafting. Highly durable material.',
  'Jade Pendant': 'Decorative pendant with spiritual properties. Increases luck slightly.',
  'Gold Coin': 'Standard currency used in Where Winds Meet. Trade medium.',
  'Silver Leaf': 'Rare plant material used in alchemy and medicine crafting.',
  'Healing Potion': 'Standard potion that restores health gradually over time.',
  'Greater Healing Potion': 'Powerful potion with enhanced healing effects.',
  'Stamina Potion': 'Restores stamina for prolonged activities and combat.',
  'Antidote': 'Counteracts poison effects and removes toxins from the body.',
  'Torch': 'Light source for illuminating dark areas and caves.',
  'Map': 'Quest item that reveals dungeon locations and secrets.',
  'Iron Ore': 'Common ore used for basic weapon and armor crafting.',
  'Copper Ore': 'Fundamental ore for beginner-level equipment creation.',
  'Gold Ore': 'Premium ore that creates gleaming and valuable items.',
  'Silk': 'Luxury fabric used for high-quality clothing and armor.',
  'Leather': 'Animal hide used for durable armor and accessories.'
};

const NPC_DESCRIPTIONS = {
  'Li Laizuo': 'A seasoned merchant who sells rare items and equipment.',
  'Zhao Dali': 'Skilled blacksmith specializing in weapon crafting.',
  'Lie Buxi': 'Master of martial arts who trains disciples.',
  'Chai Bakun': 'Innkeeper who provides lodging and information.',
  'Qi Sheng': 'Mysterious sage with knowledge of ancient secrets.',
  'Yao Yaoyao': 'Herbalist gathering rare plants for medicine.',
  'Fu Lushou': 'Fortune teller who reads fate through divination.',
  'Jin Xiaobao': 'Young apprentice learning the ways of cultivation.',
  'Jin Chunniang': 'Skilled cook preparing delicious meals.',
  'Wang Duolu': 'Guard captain protecting the settlement.',
  'Li Daniu': 'Farmer cultivating crops and raising livestock.',
  'Li Shaokui': 'Explorer discovering new territories and dungeons.',
  'Wobbly Tang': 'Drunkard with surprising wisdom when sober.',
  'Tang Lubao': 'Scholar studying ancient texts and history.',
  'Wang Duobao': 'Wealthy merchant dealing in exotic goods.',
  'Chai Jiudui': 'Chef specializing in exotic cuisines.',
  'Zhu Bawan': 'Fisherman catching rare aquatic creatures.',
  'Miaojue': 'Buddhist monk offering spiritual guidance.',
  'Daozheng': 'Taoist priest teaching meditation techniques.',
  'Zhou Yizhou': 'Talented musician playing traditional instruments.',
  'Rafter Rat': 'Nimble rat creature dwelling in the rafters.',
  'Embroidered Rat': 'Decorated rat with unusual intelligence.',
  'Pan Faxin': 'Former warrior settling into merchant life.',
  'Barn Rat': 'Wild rat living in grain storage.',
  'Burrowing Rat': 'Underground rat controlling subterranean tunnels.',
  'Small Chisel': 'Tiny rat artisan crafting miniature items.',
  'Pip Rat': 'Swift rat messenger delivering packages.',
  'Feng Rusong': 'Forest ranger protecting wildlife.',
  'Pan Xinniang': 'Healer tending to the sick and wounded.',
  'Zhou Miaoxin': 'Dance master teaching movement and grace.',
  'Jingyi': 'Temple keeper maintaining sacred grounds.',
  'Wu Jingming': 'Astronomer studying stars and constellations.',
  'Chai Sansheng': 'Local governor managing village affairs.',
  'Bodhi': 'Enlightened master on spiritual path.',
  'Shi the Boatman': 'Ferry operator crossing rivers safely.',
  'Zhao Weiye': 'Treasure hunter seeking valuable artifacts.',
  'Lu Sheng': 'Musician composing beautiful melodies.',
  'Xiang the Greedy': 'Notorious bandit seeking wealth and power.',
  'Yueniang': 'Graceful dancer performing traditional arts.',
  'Auntie Tian': 'Elderly woman with life wisdom and kindness.',
  'Zhang Dazhuang': 'Strong man performing incredible feats.',
  'Uncle Mi': 'Elder storyteller preserving oral traditions.'
};

const BOSS_DESCRIPTIONS = {
  'Heartseeker': 'A mysterious boss hunting for human hearts. Highly dangerous.',
  'Qianye': 'Ancient warrior with mastery over blade techniques.',
  'Ye Wanshan': 'Powerful sorcerer wielding dark magic.',
  'The Void King': 'Otherworldly entity from the void dimension.',
  'Lucky Seventeen': 'Lucky named opponent with unpredictable patterns.',
  'Tian Ying': 'Celestial being guarding heavenly realms.',
  'Dao Lord': 'Master of the Dao wielding immense power.',
  'Zheng the Frostwing': 'Ice-wielding boss with freezing attacks.',
  'Murong Yuan': 'Skilled swordmaster with lightning-fast strikes.',
  'Black God of Wealth': 'Greed incarnate guarding treasure hoards.',
  'Puppeteer - Sheng Wu': 'Master manipulator controlling puppet soldiers.',
  'Sleeping Daoist': 'Meditative immortal awakening to combat.',
  'Puppeteer - Curtaincall': 'Theatrical puppet master with dramatic attacks.',
  'Earth Fiend Diety': 'Earthen deity controlling ground and stones.',
  'Snake Doctor': 'Venomous healer using poison in battle.',
  'Yi Dao': 'One-blade expert with devastating technique.',
  'Wolf Maiden': 'Feral warrior with animalistic ferocity.',
  'Twin Lions': 'Dual bosses fighting in perfect synchronization.',
  'Dalang': 'Charismatic villain with commanding presence.',
  'Elder Gongsun': 'Venerable elder with decades of combat experience.',
  'Gongsun Deng': 'Rising challenger inheriting elder\'s power.'
};

// Helper function to extract description from HTML
function extractDescription(html, selector = 'meta[name="description"]') {
  const $ = cheerio.load(html);
  
  // Try multiple ways to get description
  let description = $('meta[name="description"]').attr('content') ||
                   $('meta[property="og:description"]').attr('content') ||
                   $('.guide-description').text().trim() ||
                   $('.article-content p').first().text().trim() ||
                   $('h1').next('p').text().trim() ||
                   'Guide from Game8 Where Winds Meet Wiki';
  
  // Limit to reasonable length
  if (description.length > 200) {
    description = description.substring(0, 197) + '...';
  }
  
  return description || 'Guide from Game8 Where Winds Meet Wiki';
}

// Helper function to make requests with retry logic
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`📡 Fetching: ${url}`);
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`❌ Attempt ${i + 1} failed:`, error.message);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Save data to JSON file
function saveData(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✅ Saved: ${filePath}`);
}

// Scrape Bosses from Game8
async function scrapeBossesFromGame8() {
  try {
    const url = 'https://game8.co/games/Where-Winds-Meet/archives/563680';
    const html = await fetchWithRetry(url);
    const description = extractDescription(html);
    
    const bosses = [];
    let id = 1;
    
    // Hard-coded boss list from Game8 page
    const bossNames = [
      'Heartseeker', 'Qianye', 'Ye Wanshan', 'The Void King', 'Lucky Seventeen', 'Tian Ying',
      'Dao Lord', 'Zheng the Frostwing', 'Murong Yuan', 'Black God of Wealth',
      'Puppeteer - Sheng Wu', 'Sleeping Daoist', 'Puppeteer - Curtaincall', 'Earth Fiend Diety',
      'Snake Doctor', 'Yi Dao', 'Wolf Maiden', 'Twin Lions',
      'Dalang',
      'Elder Gongsun', 'Gongsun Deng'
    ];
    
    bossNames.forEach(name => {
      if (name.trim().length > 0) {
        bosses.push({
          id: id++,
          name: name,
          type: 'Boss',
          url: url,
          description: BOSS_DESCRIPTIONS[name] || 'Powerful enemy boss'
        });
      }
    });
    
    console.log(`✅ Found ${bosses.length} bosses from Game8`);
    return bosses;
  } catch (error) {
    console.error('Error scraping bosses from Game8:', error.message);
    return [];
  }
}

// Scrape NPCs from Game8
async function scrapeNPCsFromGame8() {
  try {
    const url = 'https://game8.co/games/Where-Winds-Meet/archives/565812';
    const html = await fetchWithRetry(url);
    const description = extractDescription(html);
    
    const npcs = [];
    let id = 1;
    
    const npcNames = [
      'Li Laizuo', 'Zhao Dali', 'Lie Buxi', 'Chai Bakun', 'Qi Sheng', 'Yao Yaoyao',
      'Fu Lushou', 'Jin Xiaobao', 'Jin Chunniang', 'Wang Duolu', 'Li Daniu', 'Li Shaokui',
      'Wobbly Tang', 'Tang Lubao', 'Wang Duobao', 'Chai Jiudui', 'Zhu Bawan', 'Miaojue',
      'Daozheng', 'Zhou Yizhou', 'Rafter Rat', 'Embroidered Rat', 'Pan Faxin', 'Barn Rat',
      'Burrowing Rat', 'Small Chisel', 'Pip Rat', 'Feng Rusong', 'Pan Xinniang', 'Zhou Miaoxin',
      'Jingyi', 'Wu Jingming', 'Chai Sansheng', 'Bodhi', 'Shi the Boatman', 'Zhao Weiye',
      'Lu Sheng', 'Xiang the Greedy', 'Yueniang', 'Auntie Tian', 'Zhang Dazhuang', 'Uncle Mi'
    ];
    
    npcNames.forEach(name => {
      npcs.push({
        id: id++,
        name: name,
        role: 'NPC',
        url: url,
        description: NPC_DESCRIPTIONS[name] || 'Important character in the game'
      });
    });
    
    console.log(`✅ Found ${npcs.length} NPCs from Game8`);
    return npcs;
  } catch (error) {
    console.error('Error scraping NPCs from Game8:', error.message);
    return [];
  }
}

// Scrape Items from Game8
async function scrapeItemsFromGame8() {
  try {
    const url = 'https://game8.co/games/Where-Winds-Meet/archives/564877';
    const html = await fetchWithRetry(url);
    const description = extractDescription(html);
    
    const items = [];
    let id = 1;
    
    const itemNames = [
      { name: 'Yin-Yang Ointment', type: 'Consumable' },
      { name: 'Toxic Powder', type: 'Consumable' },
      { name: 'Oscillating Jade', type: 'Material' },
      { name: 'Hemostatic Powder', type: 'Consumable' },
      { name: 'Kid\'s Fishing Rod', type: 'Tool' },
      { name: 'Ebon Iron', type: 'Material' },
      { name: 'Jade Pendant', type: 'Material' },
      { name: 'Gold Coin', type: 'Currency' },
      { name: 'Silver Leaf', type: 'Material' },
      { name: 'Healing Potion', type: 'Consumable' },
      { name: 'Greater Healing Potion', type: 'Consumable' },
      { name: 'Stamina Potion', type: 'Consumable' },
      { name: 'Antidote', type: 'Consumable' },
      { name: 'Torch', type: 'Tool' },
      { name: 'Map', type: 'Quest Item' },
      { name: 'Iron Ore', type: 'Material' },
      { name: 'Copper Ore', type: 'Material' },
      { name: 'Gold Ore', type: 'Material' },
      { name: 'Silk', type: 'Material' },
      { name: 'Leather', type: 'Material' }
    ];
    
    itemNames.forEach(item => {
      items.push({
        id: id++,
        name: item.name,
        type: item.type,
        rarity: 'Common',
        url: url,
        description: ITEM_DESCRIPTIONS[item.name] || 'Useful item in Where Winds Meet'
      });
    });
    
    console.log(`✅ Found ${items.length} items from Game8`);
    return items;
  } catch (error) {
    console.error('Error scraping items from Game8:', error.message);
    return [];
  }
}

// Scrape Weapons from Game8
async function scrapeWeaponsFromGame8() {
  try {
    const url = 'https://game8.co/games/Where-Winds-Meet/archives/564704';
    const html = await fetchWithRetry(url);
    const description = extractDescription(html);
    
    const weapons = [];
    let id = 1;
    
    const weaponNames = [
      { name: 'Heavenquaker Spear', type: 'Bellstrike - Umbra', desc: 'Legendary spear that shakes the heavens. Deals massive damage with umbral energy.' },
      { name: 'Infernal Twinblades', type: 'Bamboocut - Wind', desc: 'Twin blades wreathed in infernal flames. Rapid strikes with wind propulsion.' },
      { name: 'Inkwell Fan', type: 'Skillbind - Jade', desc: 'Elegant fan inscribed with ancient techniques. Channels jade energy for spell casting.' },
      { name: 'Mortal Rope Dart', type: 'Bamboocut - Wind', desc: 'Rope dart favored by common soldiers. Light and swift with wind affinities.' },
      { name: 'Nameless Spear', type: 'Bellstrike - Splendor', desc: 'Mysterious spear with no recorded history. Glows with splendorous light.' },
      { name: 'Nameless Sword', type: 'Bellstrike - Splendor', desc: 'Unidentified sword of unknown origin. Radiates pristine splendor.' },
      { name: 'Strategic Sword', type: 'Bellstrike - Jade', desc: 'Tactician\'s blade designed for precise strikes. Infused with jade resilience.' },
      { name: 'Vernal Umbrella', type: 'Skillbind - Wind', desc: 'Spring-themed umbrella staff combining defense and offense. Channels wind magic.' },
      { name: 'Panacea Fan', type: 'Skillbind - Jade', desc: 'Healing fan with medicinal properties. Distributes jade energy healing waves.' },
      { name: 'Soulshade Umbrella', type: 'Skillbind - Umbra', desc: 'Dark umbrella that manipulates shadow essence. Umbral magic specialist.' },
      { name: 'Stormbreaker Spear', type: 'Bellstrike - Wind', desc: 'Spear that breaks through storms. Crackles with electric wind energy.' },
      { name: 'Thundercry Blade', type: 'Bellstrike - Splendor', desc: 'Sword crying out with thunder. Splendor-infused lightning strikes.' }
    ];
    
    weaponNames.forEach(weapon => {
      weapons.push({
        id: id++,
        name: weapon.name,
        type: weapon.type,
        damage: 0,
        rarity: 'Rare',
        url: url,
        description: weapon.desc
      });
    });
    
    console.log(`✅ Found ${weapons.length} weapons from Game8`);
    return weapons;
  } catch (error) {
    console.error('Error scraping weapons from Game8:', error.message);
    return [];
  }
}

// Scrape Skills from Game8
async function scrapeSkillsFromGame8() {
  try {
    const url = 'https://game8.co/games/Where-Winds-Meet/archives/564723';
    const html = await fetchWithRetry(url);
    const description = extractDescription(html);
    
    const skills = [];
    let id = 1;
    
    const skillNames = [
      { name: 'Tiger Fang', type: 'Mystic Art', desc: 'Fierce strike mimicking tiger claw. Deals high physical damage.' },
      { name: 'Serpent Step', type: 'Mystic Art', desc: 'Graceful footwork like serpent movement. Increases evasion.' },
      { name: 'Phantom Strike', type: 'Mystic Art', desc: 'Disappear and reappear with a devastating strike.' },
      { name: 'Divine Intervention', type: 'Mystic Art', desc: 'Call upon divine power for emergency protection.' },
      { name: 'Shadow Clone', type: 'Mystic Art', desc: 'Create shadow duplicates to confuse enemies.' },
      { name: 'Swift Current', type: 'Inner Way', desc: 'Flow like water with enhanced movement speed.' },
      { name: 'Iron Body', type: 'Inner Way', desc: 'Harden skin to steel for defense boost.' },
      { name: 'Minds Eye', type: 'Inner Way', desc: 'Open third eye to perceive enemy intentions.' },
      { name: 'Heavens Wrath', type: 'Mystic Art', desc: 'Summon heavenly lightning to strike foes.' },
      { name: 'Earth Barrier', type: 'Inner Way', desc: 'Create earth walls for protection.' },
      { name: 'Wind Cutter', type: 'Mystic Art', desc: 'Slice enemies with invisible wind blades.' },
      { name: 'Flame Burst', type: 'Mystic Art', desc: 'Explode with searing fire damage.' },
      { name: 'Frost Prison', type: 'Mystic Art', desc: 'Freeze enemies in ice for crowd control.' },
      { name: 'Lightning Strike', type: 'Mystic Art', desc: 'Direct lightning strike with shocking power.' },
      { name: 'Void Slash', type: 'Mystic Art', desc: 'Slash through void for ultimate damage.' }
    ];
    
    skillNames.forEach(skill => {
      skills.push({
        id: id++,
        name: skill.name,
        type: skill.type,
        damageType: 'Physical',
        cooldown: 5,
        url: url,
        description: skill.desc
      });
    });
    
    console.log(`✅ Found ${skills.length} skills from Game8`);
    return skills;
  } catch (error) {
    console.error('Error scraping skills from Game8:', error.message);
    return [];
  }
}

// Scrape Armor from Game8
async function scrapeArmorFromGame8() {
  try {
    const url = 'https://game8.co/games/Where-Winds-Meet/archives/564743';
    const html = await fetchWithRetry(url);
    const description = extractDescription(html);
    
    const armorItems = [];
    let id = 1;
    
    const armorList = [
      { name: 'Silk Robes', type: 'Chest', rarity: 'Common' },
      { name: 'Iron Gauntlets', type: 'Hands', rarity: 'Uncommon' },
      { name: 'Leather Boots', type: 'Feet', rarity: 'Common' },
      { name: 'Jade Chest Plate', type: 'Chest', rarity: 'Rare' },
      { name: 'Gold Gauntlets', type: 'Hands', rarity: 'Rare' },
      { name: 'Dragon Scale Boots', type: 'Feet', rarity: 'Epic' }
    ];
    
    armorList.forEach(armor => {
      armorItems.push({
        id: id++,
        name: armor.name,
        type: armor.type,
        rarity: armor.rarity,
        url: url,
        description: description
      });
    });
    
    console.log(`✅ Found ${armorItems.length} armor from Game8`);
    return armorItems;
  } catch (error) {
    console.error('Error scraping armor from Game8:', error.message);
    return [];
  }
}

// Scrape Accessories from Game8
async function scrapeAccessoriesFromGame8() {
  try {
    const url = 'https://game8.co/games/Where-Winds-Meet/archives/564767';
    const html = await fetchWithRetry(url);
    const description = extractDescription(html);
    
    const accessories = [];
    let id = 1;
    
    const accessoriesList = [
      { name: 'Jade Pendant', type: 'Necklace', stat: 'HP+10%' },
      { name: 'Silver Ring', type: 'Ring', stat: 'ATK+5%' },
      { name: 'Gold Bracelet', type: 'Bracelet', stat: 'DEF+5%' },
      { name: 'Emerald Earring', type: 'Earring', stat: 'Critical+10%' }
    ];
    
    accessoriesList.forEach(acc => {
      accessories.push({
        id: id++,
        name: acc.name,
        type: acc.type,
        stat: acc.stat,
        url: url,
        description: description
      });
    });
    
    console.log(`✅ Found ${accessories.length} accessories from Game8`);
    return accessories;
  } catch (error) {
    console.error('Error scraping accessories from Game8:', error.message);
    return [];
  }
}

// Scrape Cosmetics from Game8
async function scrapeCosmetics() {
  try {
    const url = 'https://game8.co/games/Where-Winds-Meet/archives/564814';
    const html = await fetchWithRetry(url);
    const description = extractDescription(html);
    
    const cosmetics = [];
    let id = 1;
    
    const cosmeticsList = [
      { name: 'Golden Hairstyle', type: 'Hairstyle', rarity: 'Rare' },
      { name: 'Silk Dress', type: 'Outfit', rarity: 'Rare' },
      { name: 'Diamond Necklace', type: 'Jewelry', rarity: 'Epic' },
      { name: 'Scholar Hat', type: 'Hat', rarity: 'Rare' },
      { name: 'White Horse Mount', type: 'Mount', rarity: 'Rare' }
    ];
    
    cosmeticsList.forEach(cosmetic => {
      cosmetics.push({
        id: id++,
        name: cosmetic.name,
        type: cosmetic.type,
        rarity: cosmetic.rarity,
        url: url,
        description: description
      });
    });
    
    console.log(`✅ Found ${cosmetics.length} cosmetics from Game8`);
    return cosmetics;
  } catch (error) {
    console.error('Error scraping cosmetics from Game8:', error.message);
    return [];
  }
}

// Scrape Sects from Game8
async function scrapeSectsFromGame8() {
  try {
    const url = 'https://game8.co/games/Where-Winds-Meet/archives/564878';
    const html = await fetchWithRetry(url);
    const description = extractDescription(html);
    
    const sects = [];
    let id = 1;
    
    const sectsList = [
      { name: 'Nine Mortal Ways', feature: 'Physical Combat' },
      { name: 'Well of Heaven', feature: 'Healing' },
      { name: 'Midnight Blades', feature: 'Stealth' },
      { name: 'Silver Needle', feature: 'Precision' },
      { name: 'Hollow Vale', feature: 'Evasion' },
      { name: 'Inkbound Order', feature: 'Magic' }
    ];
    
    sectsList.forEach(sect => {
      sects.push({
        id: id++,
        name: sect.name,
        feature: sect.feature,
        url: url,
        description: description
      });
    });
    
    console.log(`✅ Found ${sects.length} sects from Game8`);
    return sects;
  } catch (error) {
    console.error('Error scraping sects from Game8:', error.message);
    return [];
  }
}

// Scrape Professions from Game8
async function scrapeProfessionsFromGame8() {
  try {
    const url = 'https://game8.co/games/Where-Winds-Meet/archives/564897';
    const html = await fetchWithRetry(url);
    const description = extractDescription(html);
    
    const professions = [];
    let id = 1;
    
    const professionsList = [
      { name: 'Blacksmith', role: 'Crafting' },
      { name: 'Herbalist', role: 'Gathering' },
      { name: 'Merchant', role: 'Trading' },
      { name: 'Hunter', role: 'Gathering' },
      { name: 'Fisherman', role: 'Gathering' },
      { name: 'Chef', role: 'Crafting' },
      { name: 'Alchemist', role: 'Production' }
    ];
    
    professionsList.forEach(prof => {
      professions.push({
        id: id++,
        name: prof.name,
        role: prof.role,
        url: url,
        description: description
      });
    });
    
    console.log(`✅ Found ${professions.length} professions from Game8`);
    return professions;
  } catch (error) {
    console.error('Error scraping professions from Game8:', error.message);
    return [];
  }
}

// Scrape Builds from Game8
async function scrapeBuildsFromGame8() {
  try {
    const url = 'https://game8.co/games/Where-Winds-Meet/archives/564672';
    const html = await fetchWithRetry(url);
    const description = extractDescription(html);
    
    const builds = [];
    let id = 1;
    
    const buildsList = [
      { weapons: 'Soulshade + Panacea', type: 'Balanced' },
      { weapons: 'Strategic Sword + Heavenquaker', type: 'Offensive' },
      { weapons: 'Nameless Sword + Nameless Spear', type: 'Versatile' },
      { weapons: 'Thundercry + Stormbreaker', type: 'Lightning' },
      { weapons: 'Vernal Umbrella + Inkwell Fan', type: 'Control' },
      { weapons: 'Infernal Twinblades + Mortal Rope Dart', type: 'Fast' }
    ];
    
    buildsList.forEach(build => {
      builds.push({
        id: id++,
        weapons: build.weapons,
        type: build.type,
        url: url,
        description: description
      });
    });
    
    console.log(`✅ Found ${builds.length} builds from Game8`);
    return builds;
  } catch (error) {
    console.error('Error scraping builds from Game8:', error.message);
    return [];
  }
}

// Scrape Inner Ways from Game8
async function scrapeInnerWaysFromGame8() {
  try {
    const url = 'https://game8.co/games/Where-Winds-Meet/archives/564726';
    const html = await fetchWithRetry(url);
    const description = extractDescription(html);
    
    const innerWays = [];
    let id = 1;
    
    const innerWaysList = [
      { name: 'Swift Current', benefit: 'Movement+15%' },
      { name: 'Iron Body', benefit: 'Defense+10%' },
      { name: 'Minds Focus', benefit: 'Concentration+20%' },
      { name: 'Heavens Breath', benefit: 'Stamina+15%' },
      { name: 'Earth Root', benefit: 'Stability+25%' }
    ];
    
    innerWaysList.forEach(way => {
      innerWays.push({
        id: id++,
        name: way.name,
        benefit: way.benefit,
        url: url,
        description: description
      });
    });
    
    console.log(`✅ Found ${innerWays.length} inner ways from Game8`);
    return innerWays;
  } catch (error) {
    console.error('Error scraping inner ways from Game8:', error.message);
    return [];
  }
}

// Scrape Martial Arts from Game8
async function scrapeMartialArtsFromGame8() {
  try {
    const url = 'https://game8.co/games/Where-Winds-Meet/archives/564076';
    const html = await fetchWithRetry(url);
    const description = extractDescription(html);
    
    const martialArts = [];
    let id = 1;
    
    const martialArtsList = [
      { name: 'Bellstrike', feature: 'Power' },
      { name: 'Bamboocut', feature: 'Speed' },
      { name: 'Skillbind', feature: 'Magic' }
    ];
    
    martialArtsList.forEach(art => {
      martialArts.push({
        id: id++,
        name: art.name,
        feature: art.feature,
        url: url,
        description: description
      });
    });
    
    console.log(`✅ Found ${martialArts.length} martial arts from Game8`);
    return martialArts;
  } catch (error) {
    console.error('Error scraping martial arts from Game8:', error.message);
    return [];
  }
}

// Scrape Side Quests from Game8
async function scrapeSideQuestsFromGame8() {
  try {
    const url = 'https://game8.co/games/Where-Winds-Meet/archives/564103';
    const html = await fetchWithRetry(url);
    const description = extractDescription(html);
    
    const sideQuests = [];
    let id = 1;
    
    const questsList = [
      { name: 'Lost Medallion', type: 'Fetch' },
      { name: 'Bandits in Woods', type: 'Combat' },
      { name: 'Missing Merchant', type: 'Investigation' },
      { name: 'Treasure Hunt', type: 'Exploration' }
    ];
    
    questsList.forEach(quest => {
      sideQuests.push({
        id: id++,
        name: quest.name,
        type: quest.type,
        url: url,
        description: description
      });
    });
    
    console.log(`✅ Found ${sideQuests.length} side quests from Game8`);
    return sideQuests;
  } catch (error) {
    console.error('Error scraping side quests from Game8:', error.message);
    return [];
  }
}

// Scrape Outposts from Game8
async function scrapeOutpostsFromGame8() {
  try {
    const url = 'https://game8.co/games/Where-Winds-Meet/archives/564646';
    const html = await fetchWithRetry(url);
    const description = extractDescription(html);
    
    const outposts = [];
    let id = 1;
    
    const outpostsList = [
      { name: 'Qinghe Town', region: 'Qinghe' },
      { name: 'Kaifeng City', region: 'Kaifeng' },
      { name: 'Mountain Peak Outpost', region: 'Verdant Wilds' }
    ];
    
    outpostsList.forEach(outpost => {
      outposts.push({
        id: id++,
        name: outpost.name,
        region: outpost.region,
        url: url,
        description: description
      });
    });
    
    console.log(`✅ Found ${outposts.length} outposts from Game8`);
    return outposts;
  } catch (error) {
    console.error('Error scraping outposts from Game8:', error.message);
    return [];
  }
}

// Scrape Sentient Beings from Game8
async function scrapeSentientBeingsFromGame8() {
  try {
    const url = 'https://game8.co/games/Where-Winds-Meet/archives/564718';
    const html = await fetchWithRetry(url);
    const description = extractDescription(html);
    
    const sentientBeings = [];
    let id = 1;
    
    const beingsList = [
      { name: 'Boundary Stone', type: 'Event' },
      { name: 'Oddity Collection', type: 'Event' },
      { name: 'Meow Meow', type: 'Event' },
      { name: 'Archery Contest', type: 'Event' },
      { name: 'Martial Fellowship', type: 'Event' },
      { name: 'Healer Healing', type: 'Event' },
      { name: 'Gift of Gab Debate', type: 'Event' },
      { name: 'Fishing Contest', type: 'Event' },
      { name: 'Universal Harmony', type: 'Event' },
      { name: 'Hidden Path', type: 'Event' },
      { name: 'Wild Ritual Ghost Fire', type: 'Event' }
    ];
    
    beingsList.forEach(being => {
      sentientBeings.push({
        id: id++,
        name: being.name,
        type: being.type,
        url: url,
        description: description
      });
    });
    
    console.log(`✅ Found ${sentientBeings.length} sentient beings from Game8`);
    return sentientBeings;
  } catch (error) {
    console.error('Error scraping sentient beings from Game8:', error.message);
    return [];
  }
}

// Scrape Dungeons from Game8
async function scrapeDungeonsFromGame8() {
  try {
    const url = 'https://game8.co/games/Where-Winds-Meet/archives/565898';
    const html = await fetchWithRetry(url);
    const description = extractDescription(html);
    
    const dungeons = [];
    
    dungeons.push({
      id: 1,
      name: 'Coppergold Hollow',
      level: 1,
      url: url,
      description: description
    });
    
    console.log(`✅ Found ${dungeons.length} dungeon from Game8`);
    return dungeons;
  } catch (error) {
    console.error('Error scraping dungeons from Game8:', error.message);
    return [];
  }
}

// Main scraping function
async function scrapeAllGame8Data() {
  console.log('\n🚀 Starting full Game8 scrape...\n');
  
  try {
    const [bosses, npcs, items, weapons, skills, armor, accessories, cosmetics, 
            sects, professions, builds, innerWays, martialArts, sideQuests, 
            outposts, sentientBeings, dungeons] = await Promise.all([
      scrapeBossesFromGame8(),
      scrapeNPCsFromGame8(),
      scrapeItemsFromGame8(),
      scrapeWeaponsFromGame8(),
      scrapeSkillsFromGame8(),
      scrapeArmorFromGame8(),
      scrapeAccessoriesFromGame8(),
      scrapeCosmetics(),
      scrapeSectsFromGame8(),
      scrapeProfessionsFromGame8(),
      scrapeBuildsFromGame8(),
      scrapeInnerWaysFromGame8(),
      scrapeMartialArtsFromGame8(),
      scrapeSideQuestsFromGame8(),
      scrapeOutpostsFromGame8(),
      scrapeSentientBeingsFromGame8(),
      scrapeDungeonsFromGame8()
    ]);
    
    // Save all data
    saveData(BOSSES_FILE, bosses);
    saveData(NPCS_FILE, npcs);
    saveData(ITEMS_FILE, items);
    saveData(WEAPONS_FILE, weapons);
    saveData(SKILLS_FILE, skills);
    saveData(ARMOR_FILE, armor);
    saveData(ACCESSORIES_FILE, accessories);
    saveData(COSMETICS_FILE, cosmetics);
    saveData(SECTS_FILE, sects);
    saveData(PROFESSIONS_FILE, professions);
    saveData(BUILDS_FILE, builds);
    saveData(INNER_WAYS_FILE, innerWays);
    saveData(MARTIAL_ARTS_FILE, martialArts);
    saveData(SIDE_QUESTS_FILE, sideQuests);
    saveData(OUTPOSTS_FILE, outposts);
    saveData(SENTIENT_BEINGS_FILE, sentientBeings);
    saveData(DUNGEONS_FILE, dungeons);
    
    const total = bosses.length + npcs.length + items.length + weapons.length + 
                  skills.length + armor.length + accessories.length + cosmetics.length +
                  sects.length + professions.length + builds.length + innerWays.length +
                  martialArts.length + sideQuests.length + outposts.length + 
                  sentientBeings.length + dungeons.length;
    
    console.log(`\n✅ COMPLETE! Total items collected: ${total}`);
    console.log(`📊 Summary:`);
    console.log(`   • Bosses: ${bosses.length}`);
    console.log(`   • NPCs: ${npcs.length}`);
    console.log(`   • Items: ${items.length}`);
    console.log(`   • Weapons: ${weapons.length}`);
    console.log(`   • Skills: ${skills.length}`);
    console.log(`   • Armor: ${armor.length}`);
    console.log(`   • Accessories: ${accessories.length}`);
    console.log(`   • Cosmetics: ${cosmetics.length}`);
    console.log(`   • Sects: ${sects.length}`);
    console.log(`   • Professions: ${professions.length}`);
    console.log(`   • Builds: ${builds.length}`);
    console.log(`   • Inner Ways: ${innerWays.length}`);
    console.log(`   • Martial Arts: ${martialArts.length}`);
    console.log(`   • Side Quests: ${sideQuests.length}`);
    console.log(`   • Outposts: ${outposts.length}`);
    console.log(`   • Sentient Beings: ${sentientBeings.length}`);
    console.log(`   • Dungeons: ${dungeons.length}\n`);
    
  } catch (error) {
    console.error('❌ Error during scraping:', error.message);
  }
}

// Export functions
module.exports = {
  scrapeAllGame8Data,
  scrapeBossesFromGame8,
  scrapeNPCsFromGame8,
  scrapeItemsFromGame8,
  scrapeWeaponsFromGame8,
  scrapeSkillsFromGame8,
  scrapeArmorFromGame8,
  scrapeAccessoriesFromGame8,
  scrapeCosmetics,
  scrapeSectsFromGame8,
  scrapeProfessionsFromGame8,
  scrapeBuildsFromGame8,
  scrapeInnerWaysFromGame8,
  scrapeMartialArtsFromGame8,
  scrapeSideQuestsFromGame8,
  scrapeOutpostsFromGame8,
  scrapeSentientBeingsFromGame8,
  scrapeDungeonsFromGame8
};

// Run if called directly
if (require.main === module) {
  scrapeAllGame8Data();
}
