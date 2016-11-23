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

            stream.write('[{"a":1},{"b":2},{"c":3}]');
            stream.end();
        });

        getChunks(stream.pipe(clowncar), (err, chunks) => {

            if (err) {
                return done(err);
            }

            expect(chunks).to.equal([{ a: 1 }, { b: 2 }, { c: 3 }]);
            done();
        });
    });

    it('outputs streaming JSON array items as buffers.', (done) => {

        const clowncar = new Clowncar(false);
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('[{"a":1},{"b":2},{"c":3}]');
            stream.end();
        });

        getChunks(stream.pipe(clowncar), (err, chunks) => {

            if (err) {
                return done(err);
            }

            expect(chunks).to.equal(['B({"a":1})', 'B({"b":2})', 'B({"c":3})']);
            done();
        });
    });

    it('can stream parsed items from a deep array.', (done) => {

        const clowncar = new Clowncar(['a', 1, 'b']);
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":[{}, {"b":[1,2,3]}]}');
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

    it('can stream parsed items as buffers from a deep array.', (done) => {

        const clowncar = new Clowncar(['a', 1, 'b'], false);
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":[{}, {"b":[1,2,3]}]}');
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

    it('ends stream early after finishing parsing, does not error.', (done) => {

        const clowncar = new Clowncar(['a']);
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":[1,');
            stream.write('2,3],');
            stream.write('"b":"x"}'); // does not trigger "write after end" error
        });

        getChunks(stream.pipe(clowncar), (err, chunks) => {

            stream.end(); // end source stream after clowncar has clearly ended on its own

            expect(err).to.not.exist();
            expect(chunks).to.equal([1, 2, 3]);
            done();
        });
    });

    it('handles items that span over one chunk.', (done) => {

        const clowncar = new Clowncar();
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('["');
            stream.write('one","');
            stream.write('t');
            stream.write('wo"');
            stream.write(']');
            stream.end();
        });

        getChunks(stream.pipe(clowncar), (err, chunks) => {

            if (err) {
                return done(err);
            }

            expect(chunks).to.equal(['one', 'two']);
            done();
        });
    });

    it('is not tricked by items at the same depth which are not arrays.', (done) => {

        const clowncar = new Clowncar(['a', 'b']);
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":{"b":{"0":1}}}');
            stream.end();
        });

        getChunks(stream.pipe(clowncar), (err, chunks) => {

            if (err) {
                return done(err);
            }

            expect(chunks).to.equal([]);
            done();
        });
    });

    it('is not tricked by items at the same depth which are arrays.', (done) => {

        const clowncar = new Clowncar(['a', 'b']);
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":{"c":[6,6,6],"b":[0,"safe",0],"d":[6,6,6]}}');
            stream.end();
        });

        getChunks(stream.pipe(clowncar), (err, chunks) => {

            if (err) {
                return done(err);
            }

            expect(chunks).to.equal([0, 'safe', 0]);
            done();
        });
    });

    it('accepts hoek-style path notation.', (done) => {

        const clowncar = new Clowncar('a.2.b');
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":[0,0,{"b":[1,2,3]}]}');
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
});
