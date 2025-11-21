const fs = require('fs');
const path = require('path');

// File paths for cached data
const CACHE_DIR = path.join(__dirname, 'game-data');
const WEAPONS_FILE = path.join(CACHE_DIR, 'weapons.json');
const ITEMS_FILE = path.join(CACHE_DIR, 'items.json');
const NPCS_FILE = path.join(CACHE_DIR, 'npcs.json');
const BOSSES_FILE = path.join(CACHE_DIR, 'bosses.json');
const SKILLS_FILE = path.join(CACHE_DIR, 'skills.json');

// Cache storage (reset every load)
let dataCache = {
  weapons: null,
  items: null,
  npcs: null,
  bosses: null,
  skills: null,
  timestamp: Date.now()
};

// Load data from JSON file (bypass Node cache)
function loadData(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.error(`Error loading ${filePath}:`, err.message);
      return null;
    }
  }
  return null;
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
    (b.location && b.location.toLowerCase().includes(query.toLowerCase()))
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

// Placeholder for scrape function
async function scrapeAllData() {
  console.log('Using pre-scraped Game8 data. Run game8-scraper to update.');
}

module.exports = {
  scrapeAllData,
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
  loadData
};
