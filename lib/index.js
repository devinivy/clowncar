'use strict';

const Stream = require('stream');
const JsonDepthStream = require('json-depth-stream');

const internals = {};

module.exports = class Clowncar extends Stream.Transform {

    constructor(options = {}) {

        if (Array.isArray(options) || typeof options === 'string') {
            options = { pathToArray: options };
        }

        const pathToArray = options.pathToArray ? internals.normalizePathToArray(options.pathToArray) : [];
        const doParse = (typeof options.doParse === 'undefined') ? true : !!options.doParse;
        const keepRemainder = !!options.keepRemainder;

        // We gonna send buffers or parsed JSON?
        super({ readableObjectMode: doParse });

        this.pathToArray = pathToArray;
        this.doParse = doParse;
        this.keepRemainder = keepRemainder;
        this._endedEarly = false;
        this._depth = this.pathToArray.length + 1;
        this._jsonStream = new JsonDepthStream(this._depth);
        this._hadSplit = false;
        this._hasStartedItem = false;
        this._currentChunk = null;
        this._remainder = [];
        this._startedParsingArray = false;
        this._backlog = { start: null, buffers: [] };
        this._boundSplit = this._split.bind(this);
        this._boundCleanup = this._cleanup.bind(this);

        this._jsonStream.on('split', this._boundSplit);
        this.once('end', this._boundCleanup);
    }

    write(chk, enc, cb) {

        if (this._endedEarly && !this.keepRemainder) {
            return false;
        }

        return super.write(chk, enc, cb);
    }

    _transform(chk, enc, cb) {

        this._currentChunk = chk;
        this._hadSplit = false;

        this._jsonStream.update(chk);

        // Now zero or many splits may occur due to update(), causing pushes in sync

        if (!this._hadSplit) {
            if (this._hasStartedItem) {
                this._backlog.chunks.push(this._currentChunk);
            }
            else {
                this._maybeKeepRemainder(this._currentChunk);
            }
        }

        return cb();
    }

    _cleanup() {

        this._jsonStream.removeListener('split', this._boundSplit);
        this._currentChunk = null;
        this._backlog = null;

        if (this.keepRemainder) {
            const remainder = Buffer.concat(this._remainder);
            const emit = this.emit.bind(this);

            if (remainder.length === 0) {
                return process.nextTick(emit, 'remainder');
            }

            process.nextTick(emit, 'remainder', this._maybeParse(remainder));
        }
    }

    _maybeParse(itemBuffer) {

        return this.doParse ? JSON.parse(itemBuffer.toString()) : itemBuffer;
    }

    _maybeKeepRemainder(bufferOrStr) {

        if (!this.keepRemainder) {
            return;
        }

        this._remainder.push((typeof bufferOrStr === 'string') ? Buffer.from(bufferOrStr) : bufferOrStr);
    }

    _split(path, index) {

        if (this._endedEarly) {
            return;
        }

        // Has not started splitting along the array yet

        if (!this._startedParsingArray && !internals.firstArrayItem(path, this.pathToArray)) {
            return;
        }

        // Has started splitting along the array, and the depth of the path has changed–
        // This means we're done.

        if (path.length !== this._depth) {
            this._maybeKeepRemainder(this._currentChunk.slice(index));
            this._endedEarly = true;

            if (!this.keepRemainder) {
                this.end();
            }

            return;
        }

        if (!this._startedParsingArray) {
            this._maybeKeepRemainder(this._currentChunk.slice(0, index));
            this._maybeKeepRemainder(']'); // Close opened array
            this._startedParsingArray = true;
        }

        if (this._hasStartedItem) {
            if (this._backlog.chunks.length === 1 && this._backlog.chunks[0] === this._currentChunk) {
                // Starting and ending in same chunk

                const itemBuffer = this._currentChunk.slice(this._backlog.start, index);

                this.push(this._maybeParse(itemBuffer));
            }
            else {

                const buffers = [];

                // From first chunk
                buffers.push(this._backlog.chunks[0].slice(this._backlog.start));  // Starting point til end of first buffer)

                // Could be zero or many middle chunks
                for (let i = 1; i < this._backlog.chunks.length; ++i) {
                    buffers.push(this._backlog.chunks[i]);
                }

                // From final chunk
                buffers.push(this._currentChunk.slice(0, index));

                const itemBuffer = Buffer.concat(buffers);

                this.push(this._maybeParse(itemBuffer));
            }
        }
        else {
            this._backlog.start = index;
            this._backlog.chunks = [this._currentChunk];
        }

        this._hadSplit = true;
        this._hasStartedItem = !this._hasStartedItem;
    }
};

internals.normalizePathToArray = (pathToArray) => {

    if (Array.isArray(pathToArray)) {
        return pathToArray;
    }

    // It better be a string, then!

    const parts = pathToArray.split('.');

    for (let i = 0; i < parts.length; ++i) {
        if (Number.isInteger(+parts[i])) {
            parts[i] = +parts[i]; // Turn integer-lookin strings into actual integers
        }
    }

    return parts;
};

internals.firstArrayItem = (itemPath, arrayPath) => {

    if (itemPath.length !== arrayPath.length + 1) {
        return false;
    }

    if (itemPath[itemPath.length - 1] !== 0) {
        return false;
    }

    for (let i = 0; i < arrayPath.length; ++i) {
        if (itemPath[i] !== arrayPath[i]) {
            return false;
        }
    }

    return true;
};
