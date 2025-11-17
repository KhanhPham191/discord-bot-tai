const axios = require('axios');
require('dotenv').config();

const API_URL = 'https://api.football-data.org/v4';
const API_KEY = process.env.FOOTBALL_API_KEY;

async function testAPI() {
  console.log('🧪 Testing football-data.org API v4...\n');

  try {
    // Get Premier League teams
    console.log('1️⃣ Getting Premier League teams...');
    const plTeams = await axios.get(`${API_URL}/competitions/PL/teams`, {
      headers: { 'X-Auth-Token': API_KEY }
    });
    console.log(`✅ Found ${plTeams.data.teams.length} PL teams`);
    
    // Find target teams
    const targetTeams = ['Chelsea', 'Manchester United', 'Manchester City', 'Liverpool', 'Arsenal'];
    console.log('\n🔍 Premier League Teams:');
    plTeams.data.teams.forEach(t => {
      if (targetTeams.some(name => t.name.includes(name))) {
        console.log(`   ✅ ${t.name}: ID ${t.id}`);
      }
    });
    
    // Get standings
    console.log('\n2️⃣ Getting Premier League standings...');
    const stand = await axios.get(`${API_URL}/competitions/PL/standings`, {
      headers: { 'X-Auth-Token': API_KEY }
    });
    console.log(`✅ Got standings`);
    if (stand.data.standings && stand.data.standings.length > 0) {
      const table = stand.data.standings[0].table;
      console.log(`   Top 5:`);
      table.slice(0, 5).forEach(t => {
        console.log(`      ${t.position}. ${t.team.name} - ${t.points}pts (${t.playedGames}P)`);
      });
    }
    
    // Get team matches
    console.log('\n3️⃣ Testing team matches endpoint...');
    const chelsea = plTeams.data.teams.find(t => t.name.includes('Chelsea'));
    if (chelsea) {
      const chelseaMatches = await axios.get(`${API_URL}/teams/${chelsea.id}/matches`, {
        headers: { 'X-Auth-Token': API_KEY },
        params: { status: 'SCHEDULED,LIVE' }
      });
      console.log(`✅ Chelsea has ${chelseaMatches.data.matches.length} upcoming/live matches`);
    }
    
  } catch (e) {
    console.error('❌ Error:', e.response?.status, e.response?.data?.message || e.message);
    if (e.response?.data?.errors) {
      console.error('   Errors:', e.response.data.errors);
    }
  }
}

testAPI();
