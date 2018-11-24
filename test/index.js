'use strict';

// Load modules

const Lab = require('lab');
const Code = require('code');
const Stream = require('stream');
const Toys = require('toys');
const Clowncar = require('..');

// Test shortcuts

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;

describe('Clowncar', () => {

    const getChunks = async (stream) => {

        const chunks = [];
        stream.on('data', (chk) => chunks.push(Buffer.isBuffer(chk) ? `B(${chk.toString()})` : chk));

        await Toys.stream(stream);

        return chunks;
    };

    it('outputs streaming JSON array items as JSON.', async () => {

        const clowncar = new Clowncar();
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('[{"a":1},{"b":2},{"c":3}]');
            stream.end();
        });

        const chunks = await getChunks(stream.pipe(clowncar));

        expect(chunks).to.equal([{ a: 1 }, { b: 2 }, { c: 3 }]);
    });

    it('outputs streaming JSON array items as buffers.', async () => {

        const clowncar = new Clowncar({ doParse: false });
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('[{"a":1},{"b":2},{"c":3}]');
            stream.end();
        });

        const chunks = await getChunks(stream.pipe(clowncar));

        expect(chunks).to.equal(['B({"a":1})', 'B({"b":2})', 'B({"c":3})']);
    });

    it('can stream parsed items from a deep array.', async () => {

        const clowncar = new Clowncar({ pathToArray: ['a', 1, 'b'] });
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":[{}, {"b":[1,2,3]}]}');
            stream.end();
        });

        const chunks = await getChunks(stream.pipe(clowncar));

        expect(chunks).to.equal([1, 2, 3]);
    });

    it('can stream parsed items as buffers from a deep array.', async () => {

        const clowncar = new Clowncar({
            pathToArray: ['a', 1, 'b'],
            doParse: false
        });

        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":[{}, {"b":[1,2,3]}]}');
            stream.end();
        });

        const chunks = await getChunks(stream.pipe(clowncar));

        expect(chunks).to.equal(['B(1)', 'B(2)', 'B(3)']);
    });

    it('ends stream early after finishing parsing, does not error.', async () => {

        const clowncar = new Clowncar({ pathToArray: ['a'] });
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":[1,');
            stream.write('2,3],');
            stream.write('"b":"x"}'); // does not trigger "write after end" error
        });

        const chunks = await getChunks(stream.pipe(clowncar));

        stream.end(); // end source stream after clowncar has clearly ended on its own

        expect(chunks).to.equal([1, 2, 3]);
    });

    it('handles items that span over one chunk.', async () => {

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

        const chunks = await getChunks(stream.pipe(clowncar));

        expect(chunks).to.equal(['one', 'two']);
    });

    it('is not tricked by items at the same depth which are not arrays.', async () => {

        const clowncar = new Clowncar({ pathToArray: ['a', 'b'] });
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":{"b":{"0":1}}}');
            stream.end();
        });

        const chunks = await getChunks(stream.pipe(clowncar));

        expect(chunks).to.equal([]);
    });

    it('is not tricked by items at the same depth which are arrays.', async () => {

        const clowncar = new Clowncar({ pathToArray: ['a', 'b'] });
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":{"c":[6,6,6],"b":[0,"safe",0],"d":[6,6,6]}}');
            stream.end();
        });

        const chunks = await getChunks(stream.pipe(clowncar));

        expect(chunks).to.equal([0, 'safe', 0]);
    });

    it('accepts hoek-style path notation.', async () => {

        const clowncar = new Clowncar({ pathToArray: 'a.2.b' });
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":[0,0,{"b":[1,2,3]}]}');
            stream.end();
        });

        const chunks = await getChunks(stream.pipe(clowncar));

        expect(chunks).to.equal([1, 2, 3]);
    });

    it('accepts path to array in lieu of full options object (array).', async () => {

        const clowncar = new Clowncar(['a', 2, 'b']);
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":[0,0,{"b":[1,2,3]}]}');
            stream.end();
        });

        const chunks = await getChunks(stream.pipe(clowncar));

        expect(chunks).to.equal([1, 2, 3]);
    });

    it('accepts path to array in lieu of full options object (hoek-style).', async () => {

        const clowncar = new Clowncar('a.2.b');
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":[0,0,{"b":[1,2,3]}]}');
            stream.end();
        });

        const chunks = await getChunks(stream.pipe(clowncar));

        expect(chunks).to.equal([1, 2, 3]);
    });

    it('does not emit remainder when keepRemainder is false.', async () => {

        const clowncar = new Clowncar({
            pathToArray: ['a', 2, 'b'],
            keepRemainder: false
        });

        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":[0,0,{"b":[1,2,3]}]}');
            stream.end();
        });

        let emittedRemainder = false;

        clowncar.once('remainder', () => {

            emittedRemainder = true;
        });

        const chunks = await getChunks(stream.pipe(clowncar));

        expect(chunks).to.equal([1, 2, 3]);

        await new Promise((resolve) => setImmediate(resolve));

        expect(emittedRemainder).to.equal(false);
    });

    it('does not emit remainder by default.', async () => {

        const clowncar = new Clowncar({ pathToArray: ['a', 2, 'b'] });
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":[0,0,{"b":[1,2,3]}]}');
            stream.end();
        });

        let emittedRemainder = false;

        clowncar.once('remainder', () => {

            emittedRemainder = true;
        });

        const chunks = await getChunks(stream.pipe(clowncar));

        expect(chunks).to.equal([1, 2, 3]);

        await new Promise((resolve) => setImmediate(resolve));

        expect(emittedRemainder).to.equal(false);
    });

    it('emits remainder after end, omitting contents of the targeted array.', async () => {

        const clowncar = new Clowncar({
            pathToArray: ['a', 2, 'b'],
            keepRemainder: true
        });

        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":[0,0,{"b":[1,2,3]}]}');
            stream.end();
        });

        const [chunks, remainder] = await Promise.all([
            getChunks(stream.pipe(clowncar)),
            Toys.event(clowncar, 'remainder')
        ]);

        expect(chunks).to.equal([1, 2, 3]);
        expect(remainder).to.equal({
            a: [
                0,
                0,
                { b: [] }
            ]
        });
    });

    it('emits remainder as empty array when incoming JSON is the target array.', async () => {

        const clowncar = new Clowncar({ keepRemainder: true });

        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('[');
            stream.write('1');
            stream.write(',2');
            stream.write(',3');
            stream.write(']');
            stream.end();
        });

        const [chunks, remainder] = await Promise.all([
            getChunks(stream.pipe(clowncar)),
            Toys.event(clowncar, 'remainder')
        ]);

        expect(chunks).to.equal([1, 2, 3]);
        expect(remainder).to.equal([]);
    });

    it('emits remainder correctly when JSON includes unnecessary whitespace.', async () => {

        const clowncar = new Clowncar({
            pathToArray: ['a', 2, 'b'],
            keepRemainder: true
        });

        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":[0,0,{"b" :  [  1 ,2, 3  ]  }]}');
            stream.end();
        });

        const [chunks, remainder] = await Promise.all([
            getChunks(stream.pipe(clowncar)),
            Toys.event(clowncar, 'remainder')
        ]);

        expect(chunks).to.equal([1, 2, 3]);
        expect(remainder).to.equal({
            a: [
                0,
                0,
                { b: [] }
            ]
        });
    });

    it('emits empty remainder when payload is empty.', async () => {

        const clowncar = new Clowncar({ keepRemainder: true });
        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('');
            stream.end();
        });

        const [chunks, remainder] = await Promise.all([
            getChunks(stream.pipe(clowncar)),
            Toys.event(clowncar, 'remainder')
        ]);

        expect(chunks).to.equal([]);
        expect(remainder).to.not.exist();
    });

    it('emits remainder unparsed when doParse is false.', async () => {

        const clowncar = new Clowncar({
            pathToArray: 'a',
            keepRemainder: true,
            doParse: false
        });

        const stream = new Stream.PassThrough();

        setImmediate(() => {

            stream.write('{"a":[1,2,3]}');
            stream.end();
        });

        const [chunks, remainder] = await Promise.all([
            getChunks(stream.pipe(clowncar)),
            Toys.event(clowncar, 'remainder')
        ]);

        expect(chunks).to.equal(['B(1)', 'B(2)', 'B(3)']);
        expect(Buffer.isBuffer(remainder)).to.equal(true);
        expect(remainder.toString()).to.equal('{"a":[]}');
    });

    it('does not end stream early after finishing parsing when keeping remainder.', async () => {

        const clowncar = new Clowncar({
            pathToArray: ['a'],
            keepRemainder: true
        });

        const stream = new Stream.PassThrough();

        let calledEndLate = false;

        setImmediate(() => {

            stream.write('{"a":[1,');
            stream.write('2,3],');
            stream.write('"b":"x"}'); // does not trigger "write after end" error
            setImmediate(() => {

                calledEndLate = true;
                stream.end();
            });
        });

        const [chunks, remainder] = await Promise.all([
            getChunks(stream.pipe(clowncar)),
            Toys.event(clowncar, 'remainder')
        ]);

        expect(calledEndLate).to.equal(true);
        expect(chunks).to.equal([1, 2, 3]);
        expect(remainder).to.equal({ a: [], b: 'x' });
    });
});
