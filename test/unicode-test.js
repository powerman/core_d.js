'use strict';

const net = require('net');
const crypto = require('crypto');
const { assert, refute, sinon } = require('@sinonjs/referee-sinon');
const server = require('../lib/server');
const portfile = require('../lib/portfile');
const service = require('./fixture/service');

describe('unicode handling', () => {
  let srv;
  let port;
  let token;

  beforeEach((done) => {
    token = crypto.randomBytes(8).toString('hex');
    sinon.restore();
    sinon.replace(crypto, 'randomBytes', () => Buffer.from(token, 'hex'));
    sinon.replace(service, 'invoke', (_, __, text, cb) => cb(null, text));
    sinon.replace(portfile, 'write', () => {});
    srv = server.start();
    srv.listen(0, '127.0.0.1', () => {
      port = srv.address().port;
      // Server started
      done();
    });
  });

  afterEach(() => {
    srv.close();
  });

  /*eslint require-await: 0*/
  async function makeRequest(text) {
    const json = {
      cwd: '/test',
      args: ['--test'],
      text
    };
    const client = net.connect({ port });
    client.setEncoding('utf8');
    let response = '';

    return new Promise((resolve, reject) => {
      client.on('data', (chunk) => {
        response += chunk;
      });
      client.on('error', reject);
      client.on('end', () => resolve(response));
      client.end(`${token} ${JSON.stringify(json)}`);
    });
  }

  // This test demonstrates a bug when sending large amount of UTF-8 text
  // (around 100 KB) through the server. The text gets corrupted due to
  // incorrect handling of partial UTF-8 characters, and the corruption
  // manifests itself as UTF-8 replacement characters (U+FFFD).
  it('should not corrupt large UTF-8 data', async function() {
    this.timeout(5000);

    const alphabet = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
    const times = Math.ceil(100000 / alphabet.length);
    const text = alphabet.repeat(times);
    const response = await makeRequest(text);

    // Before the fix this assertion would fail:
    refute(response.includes('\ufffd'), 'Server corrupted UTF-8 data');
    assert.equals(response, text, 'Server returned wrong data');
  });
});

