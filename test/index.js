'use strict';

// Load modules

const Lab = require('lab');
const Code = require('code');
const Stream = require('stream');
const Clowncar = require('..');

// Test shortcuts

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;

describe('Clowncar', () => {

    const getChunks = (stream, cb) => {

        const chunks = [];

        stream.on('data', (chk) => chunks.push(Buffer.isBuffer(chk) ? `B(${chk.toString()})` : chk));
        stream.once('end', () => cb(null, chunks));
        stream.once('error', (err) => cb(err));
    };

    it('outputs streaming JSON array items as JSON.', (done) => {

        const clowncar = new Clowncar();
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('[1');
            stream.write(',2,');
            stream.write('3');
            stream.write(']');
            stream.end();
        });

        getChunks(stream.pipe(clowncar), (err, chunks) => {

            if (err) {
                return done(err);
            }

            expect(chunks).to.equal([1, 2, 3]);
            done();
        });
    });

    it('outputs streaming JSON array items as buffers.', (done) => {

        const clowncar = new Clowncar(false);
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('[1');
            stream.write(',2,');
            stream.write('3');
            stream.write(']');
            stream.end();
        });

        getChunks(stream.pipe(clowncar), (err, chunks) => {

            if (err) {
                return done(err);
            }

            expect(chunks).to.equal(['B(1)', 'B(2)', 'B(3)']);
            done();
        });
    });
});
