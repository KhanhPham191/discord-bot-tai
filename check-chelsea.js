const { getFixturesWithCL } = require('./football');

(async () => {
  try {
    console.log('🔍 Checking Chelsea fixtures...');
    const fixtures = await getFixturesWithCL(61, 10); // Chelsea ID = 61
    
    if (!fixtures) {
      console.log('❌ No fixtures returned');
      return;
    }
    
    console.log(`📋 Found ${fixtures.length} Chelsea fixtures:\n`);
    fixtures.forEach((f, i) => {
      const matchDate = new Date(f.utcDate);
      const homeTeam = f.homeTeam?.name || 'Unknown';
      const awayTeam = f.awayTeam?.name || 'Unknown';
      console.log(`${i+1}. ${homeTeam} vs ${awayTeam}`);
      console.log(`   UTC: ${matchDate.toISOString()}`);
      console.log(`   VN Time: ${matchDate.toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'})}\n`);
    });
    
    // Check upcoming in 90 minutes
    const now = new Date();
    const in90Min = new Date(now.getTime() + 90 * 60 * 1000);
    console.log(`🕐 Current time (UTC): ${now.toISOString()}`);
    console.log(`⏰ 90 min later (UTC): ${in90Min.toISOString()}`);
    console.log(`\n🇻🇳 Current time (VN): ${now.toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'})}`);
    
    const upcoming = fixtures.filter(f => {
      const matchTime = new Date(f.utcDate);
      return matchTime > now && matchTime <= in90Min;
    });
    
    console.log(`\n🎯 Upcoming matches in 90 min: ${upcoming.length}`);
    upcoming.forEach(f => {
      const matchDate = new Date(f.utcDate);
      console.log(`- ${f.homeTeam?.name} vs ${f.awayTeam?.name} at ${matchDate.toISOString()}`);
    });
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
})();
