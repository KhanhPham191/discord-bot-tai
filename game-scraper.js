const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://wherewindsmeet.wiki.fextralife.com';

// File paths for cached data
const CACHE_DIR = path.join(__dirname, 'game-data');
const WEAPONS_FILE = path.join(CACHE_DIR, 'weapons.json');
const CHARACTERS_FILE = path.join(CACHE_DIR, 'characters.json');
const ITEMS_FILE = path.join(CACHE_DIR, 'items.json');
const NPCS_FILE = path.join(CACHE_DIR, 'npcs.json');
const BOSSES_FILE = path.join(CACHE_DIR, 'bosses.json');
const SKILLS_FILE = path.join(CACHE_DIR, 'skills.json');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
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
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
    }
  }
}

// Save data to JSON file
function saveData(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✅ Saved: ${filePath}`);
}

// Load data from JSON file
function loadData(filePath) {
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return null;
}

// Scrape weapons data
async function scrapeWeapons() {
  try {
    const url = `${BASE_URL}/Martial+Arts+Weapons`;
    const html = await fetchWithRetry(url);
    
    // Parse HTML to extract weapon information
    // This is a simplified example - you may need to adjust based on actual HTML structure
    const weapons = [];
    
    // For now, we'll create a placeholder structure
    // In a real scenario, you'd parse the HTML properly
    console.log('⚠️ Weapons scraping - structure needs HTML parsing');
    
    return weapons;
  } catch (error) {
    console.error('Error scraping weapons:', error.message);
    return [];
  }
}

// Scrape characters/NPCs data
async function scrapeNPCs() {
  try {
    const url = `${BASE_URL}/NPCs`;
    const html = await fetchWithRetry(url);
    
    const npcs = [];
    console.log('⚠️ NPCs scraping - structure needs HTML parsing');
    
    return npcs;
  } catch (error) {
    console.error('Error scraping NPCs:', error.message);
    return [];
  }
}

// Scrape bosses data
async function scrapeBosses() {
  try {
    const url = `${BASE_URL}/Bosses`;
    const html = await fetchWithRetry(url);
    
    const bosses = [];
    console.log('⚠️ Bosses scraping - structure needs HTML parsing');
    
    return bosses;
  } catch (error) {
    console.error('Error scraping bosses:', error.message);
    return [];
  }
}

// Scrape skills data
async function scrapeSkills() {
  try {
    const url = `${BASE_URL}/Skills`;
    const html = await fetchWithRetry(url);
    
    const skills = [];
    console.log('⚠️ Skills scraping - structure needs HTML parsing');
    
    return skills;
  } catch (error) {
    console.error('Error scraping skills:', error.message);
    return [];
  }
}

// Create seed data for quick testing
function createSeedData() {
  const seedWeapons = [
    {
      id: 1,
      name: "Iron Sword",
      type: "Sword",
      damage: 15,
      rarity: "Common",
      description: "A basic iron sword suitable for beginners."
    },
    {
      id: 2,
      name: "Jade Spear",
      type: "Spear",
      damage: 18,
      rarity: "Uncommon",
      description: "A spear carved from jade, highly valued in combat."
    },
    {
      id: 3,
      name: "Celestial Saber",
      type: "Saber",
      damage: 25,
      rarity: "Rare",
      description: "A legendary saber infused with celestial energy."
    },
    {
      id: 4,
      name: "Wind Fan",
      type: "Fan",
      damage: 12,
      rarity: "Common",
      description: "A traditional fan weapon used in martial arts."
    }
  ];

  const seedNPCs = [
    {
      id: 1,
      name: "Old Master Chen",
      role: "Combat Trainer",
      location: "Kaifeng",
      description: "A wise old warrior who teaches martial arts."
    },
    {
      id: 2,
      name: "Merchant Lin",
      role: "Merchant",
      location: "Market District",
      description: "A merchant who sells rare items and equipment."
    },
    {
      id: 3,
      name: "Liu Wei",
      role: "Quest Giver",
      location: "Pagoda",
      description: "A mysterious figure who offers interesting quests."
    }
  ];

  const seedBosses = [
    {
      id: 1,
      name: "Shadow Phantom",
      level: 25,
      health: 500,
      location: "Dark Forest",
      rewards: "Ancient Relic, 5000 Gold"
    },
    {
      id: 2,
      name: "Dragon of the East",
      level: 35,
      health: 800,
      location: "Mountain Peak",
      rewards: "Dragon Scale, 10000 Gold"
    }
  ];

  const seedSkills = [
    {
      id: 1,
      name: "Whirlwind Strike",
      type: "Attack",
      damageType: "Physical",
      cooldown: 5,
      description: "Spin rapidly to hit all nearby enemies."
    },
    {
      id: 2,
      name: "Parry",
      type: "Defense",
      damageType: "None",
      cooldown: 2,
      description: "Block incoming attacks to reduce damage."
    },
    {
      id: 3,
      name: "Chi Burst",
      type: "Magic",
      damageType: "Energy",
      cooldown: 8,
      description: "Release a burst of chi energy to damage enemies."
    }
  ];

  const seedItems = [
    {
      id: 1,
      name: "Health Potion",
      type: "Consumable",
      effect: "Restore 50 HP",
      rarity: "Common"
    },
    {
      id: 2,
      name: "Mana Elixir",
      type: "Consumable",
      effect: "Restore 100 Mana",
      rarity: "Uncommon"
    },
    {
      id: 3,
      name: "Celestial Stone",
      type: "Crafting",
      effect: "Use for crafting rare items",
      rarity: "Rare"
    }
  ];

  saveData(WEAPONS_FILE, seedWeapons);
  saveData(NPCS_FILE, seedNPCs);
  saveData(BOSSES_FILE, seedBosses);
  saveData(SKILLS_FILE, seedSkills);
  saveData(ITEMS_FILE, seedItems);

  console.log('✅ Seed data created successfully!');
}

// Search functions for Discord commands
function searchWeapons(query) {
  const weapons = loadData(WEAPONS_FILE) || [];
  return weapons.filter(w => 
    w.name.toLowerCase().includes(query.toLowerCase()) || 
    w.type.toLowerCase().includes(query.toLowerCase())
  );
}

function searchNPCs(query) {
  const npcs = loadData(NPCS_FILE) || [];
  return npcs.filter(n => 
    n.name.toLowerCase().includes(query.toLowerCase()) || 
    n.role.toLowerCase().includes(query.toLowerCase())
  );
}

function searchBosses(query) {
  const bosses = loadData(BOSSES_FILE) || [];
  return bosses.filter(b => 
    b.name.toLowerCase().includes(query.toLowerCase()) || 
    b.location.toLowerCase().includes(query.toLowerCase())
  );
}

function searchSkills(query) {
  const skills = loadData(SKILLS_FILE) || [];
  return skills.filter(s => 
    s.name.toLowerCase().includes(query.toLowerCase()) || 
    s.type.toLowerCase().includes(query.toLowerCase())
  );
}

function searchItems(query) {
  const items = loadData(ITEMS_FILE) || [];
  return items.filter(i => 
    i.name.toLowerCase().includes(query.toLowerCase()) || 
    i.type.toLowerCase().includes(query.toLowerCase())
  );
}

// Get all data
function getAllWeapons() {
  return loadData(WEAPONS_FILE) || [];
}

function getAllNPCs() {
  return loadData(NPCS_FILE) || [];
}

function getAllBosses() {
  return loadData(BOSSES_FILE) || [];
}

function getAllSkills() {
  return loadData(SKILLS_FILE) || [];
}

function getAllItems() {
  return loadData(ITEMS_FILE) || [];
}

// Main scraping function
async function scrapeAllData() {
  console.log('\n🎮 Starting Where Winds Meet Wiki scraper...\n');
  
  try {
    console.log('📥 Scraping weapons...');
    const weapons = await scrapeWeapons();
    if (weapons.length > 0) saveData(WEAPONS_FILE, weapons);

    console.log('📥 Scraping NPCs...');
    const npcs = await scrapeNPCs();
    if (npcs.length > 0) saveData(NPCS_FILE, npcs);

    console.log('📥 Scraping bosses...');
    const bosses = await scrapeBosses();
    if (bosses.length > 0) saveData(BOSSES_FILE, bosses);

    console.log('📥 Scraping skills...');
    const skills = await scrapeSkills();
    if (skills.length > 0) saveData(SKILLS_FILE, skills);

    console.log('\n✅ Scraping completed!\n');
  } catch (error) {
    console.error('❌ Error during scraping:', error.message);
  }
}

module.exports = {
  scrapeAllData,
  createSeedData,
  searchWeapons,
  searchNPCs,
  searchBosses,
  searchSkills,
  searchItems,
  getAllWeapons,
  getAllNPCs,
  getAllBosses,
  getAllSkills,
  getAllItems,
  loadData,
  saveData
};
