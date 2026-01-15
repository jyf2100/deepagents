const net = require('net');
const msgpackr = require('msgpackr');
const fs = require('fs');

const SOCKET_PATH = '/var/folders/f0/6x1blg2d5874rf8_4lrmk1fw0000gn/T/deepagents-desktop.sock';

const client = net.createConnection({ path: SOCKET_PATH }, () => {
  console.log('Connected to socket');

  const request = {
    request_id: 'test-' + Date.now(),
    method: 'list_skills',
    params: {}
  };

  const packed = msgpackr.pack(request);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(packed.length);

  client.write(Buffer.concat([length, packed]));
  console.log('Request sent');
});

let buffer = Buffer.alloc(0);

client.on('data', (data) => {
  buffer = Buffer.concat([buffer, data]);

  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (buffer.length < 4 + length) break;

    const messageData = buffer.slice(4, 4 + length);
    buffer = buffer.slice(4 + length);

    const response = msgpackr.unpack(messageData);
    console.log('Response:', JSON.stringify(response, null, 2));

    if (response.status === 'success' && response.data?.skills) {
      console.log(`\n✓ Found ${response.data.skills.length} skills:`);
      response.data.skills.forEach(s => {
        console.log(`  - ${s.name}: ${s.description?.substring(0, 50)}...`);
      });
    }

    client.end();
  }
});

client.on('error', (err) => {
  console.error('Error:', err.message);
});

client.on('close', () => {
  console.log('Connection closed');
  process.exit(0);
});

setTimeout(() => {
  console.error('Timeout - no response received');
  process.exit(1);
}, 5000);
