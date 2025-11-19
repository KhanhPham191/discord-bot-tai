const content = '!fixtures 61';
const PREFIX = '!';
const afterPrefix = content.slice(PREFIX.length).trim();
const args = afterPrefix.split(/\s+/);
const command = args[0].toLowerCase();

console.log('Content:', content);
console.log('After prefix:', afterPrefix);
console.log('Args:', args);
console.log('Command:', command);
console.log('args.length:', args.length);
console.log('args[1]:', args[1]);
console.log('Check: args.length > 1?', args.length > 1);
console.log('Check: !isNaN(parseInt(args[1]))?', !isNaN(parseInt(args[1])));
console.log('Should enter if block?', args.length > 1 && !isNaN(parseInt(args[1])));
