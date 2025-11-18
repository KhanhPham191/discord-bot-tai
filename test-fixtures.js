const axios = require('axios');
require('dotenv').config();

async function testFixtures() {
  const key = process.env.FOOTBALL_API_KEY;
  const url = 'https://api.football-data.org/v4'\;
  
  console.log('Testing Chelsea (ID 61) fixtures...\n');
  
  const res = await axios.get(`${url}/teams/61/matches?status=SCHEDULED,LIVE&limit=5`, {
    headers: { 'X-Auth-Token': key }
  });
  
  console.log(`Total matches found: ${res.data.matches.length}\n`);
  
  res.data.matches.forEach((m, i) => {
    const date = new Date(m.utcDate);
    console.log(`${i+1}. ${m.homeTeam.name} vs ${m.awayTeam.name}`);
    console.log(`   UTC: ${m.utcDate}`);
    console.log(`   VN: ${date.toLocaleString('vi-VN')}`);
    console.log(`   Status: ${m.status}\n`);
  });
}

testFixtures().catch(console.error);
