import re

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to find and replace the detail fetch + button creation in newmovies handlers
# This regex finds: slug extraction -> detail fetch try/catch -> button creation -> pagination

pattern = r'''(if \(customId\.startsWith\('newmovies_prev_'\).*?const nextPage = currentPage - 1;.*?const movies = newMovies\.slice\(0, 10\);.*?const embed = new EmbedBuilder\(\).*?let description = '';.*?for \(let idx = 0; idx < movies\.length; idx\+\+\) \{.*?const movie = movies\[idx\];)(.*?)(embed\.setDescription\(description\);.*?// Create movie detail buttons.*?const buttons = \[\];.*?for \(let i = 1; i <= Math\.min\(10, movies\.length\); i\+\+\) \{.*?const movieTitle = movies\[i - 1\]\.name\.substring\(0, 15\);.*?buttons\.push\(.*?\);.*?\}.*?// Create pagination buttons)'''

# Simpler approach: replace the loop manually
search_text = '''          for (let idx = 0; idx < movies.length; idx++) {
            const movie = movies[idx];
            const slug = movie.slug || '';
            const title = movie.name || movie.title || 'Unknown';
            const englishTitle = movie.original_name || '';
            const year = movie.year || 'N/A';
            
            let totalEpisodes = 'N/A';
            let category = 'N/A';
            try {
              if (slug) {
                const detail = await getMovieDetail(slug);
                if (detail) {
                  if (detail.total_episodes) {
                    totalEpisodes = detail.total_episodes.toString();
                  }
                  if (detail.category && detail.category[1]) {
                    const categoryList = detail.category[1].list;
                    if (categoryList && categoryList.length > 0) {
                      category = categoryList[0].name;
                    }
                  }
                }
              }
            } catch (e) {
              console.log(`⚠️ Could not fetch detail for ${slug}`);
            }
            
            const movieNum = idx + 1;
            let titleDisplay = `**${movieNum}. ${title}**`;
            if (englishTitle && englishTitle !== title) {
              titleDisplay += ` (${englishTitle})`;
            }
            
            description += `${titleDisplay}\\n`;
            
            let infoLine = '';
            if (year !== 'N/A') {
              infoLine += `📅 ${year}`;
            }
            if (category !== 'N/A') {
              infoLine += infoLine ? ` | 📺 ${category}` : `📺 ${category}`;
            }
            if (totalEpisodes !== 'N/A') {
              infoLine += infoLine ? ` | 🎬 ${totalEpisodes} tập` : `🎬 ${totalEpisodes} tập`;
            }
            
            if (infoLine) {
              description += infoLine + '\\n';
            }
            
            description += '\\n';
          }'''

replace_text = '''          for (let idx = 0; idx < movies.length; idx++) {
            const movie = movies[idx];
            const title = movie.name || movie.title || 'Unknown';
            const englishTitle = movie.original_name || '';
            const year = movie.year || 'N/A';
            
            const movieNum = idx + 1;
            let titleDisplay = `**${movieNum}. ${title}**`;
            if (englishTitle && englishTitle !== title) {
              titleDisplay += ` (${englishTitle})`;
            }
            
            description += `${titleDisplay}\\n`;
            
            if (year !== 'N/A') {
              description += `📅 ${year}\\n`;
            }
            
            description += '\\n';
          }'''

# Do replacements
content = content.replace(search_text, replace_text)

# Also remove the detail button creation blocks
pattern2 = r'''          // Create movie detail buttons\n          const buttons = \[\];\n          for \(let i = 1; i <= Math\.min\(10, movies\.length\); i\+\+\) \{\n            const movieTitle = movies\[i - 1\]\.name\.substring\(0, 15\);\n            buttons\.push\(\n              new ButtonBuilder\(\)\n                \.setCustomId\(`newmovies_detail_\$\{i\}_\$\{userId\}_\$\{nextPage\}`\)\n                \.setLabel\(`\$\{i\}\. \$\{movieTitle\}`\)\n                \.setStyle\(1\)\n            \);\n          \}\n\n          // Create pagination buttons\n          const paginationButtons = \[\];'''

replace2 = '''          // Create pagination buttons
          const paginationButtons = [];'''

# Find and replace all occurrences
pattern2_compiled = re.compile(pattern2)
content = pattern2_compiled.sub(replace2, content)

# Same for nextPage variant
pattern3 = r'          for \(let i = 0; i < buttons\.length; i \+= 5\) \{\n            buttonRows\.push\(new ActionRowBuilder\(\)\.addComponents\(buttons\.slice\(i, i \+ 5\)\)\);\n          \}'
replace3 = ''

content = re.sub(pattern3, replace3, content)

with open('index.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Fixed newmovies handlers")
