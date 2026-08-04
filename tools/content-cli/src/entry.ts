const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const packetCommand = args.includes('lesson-factory');

if (!packetCommand && rawArgs[0] === '--') process.argv.splice(2, 1);
await import(packetCommand ? './packet-main' : './main');

export {};
