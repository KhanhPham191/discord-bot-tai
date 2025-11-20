const content = '!fixtures 61';
const PREFIX = '!';
const afterPrefix = content.slice(PREFIX.length).trim();
const args = afterPrefix.split(/\s+/);
const command = args[0].toLowerCase();
