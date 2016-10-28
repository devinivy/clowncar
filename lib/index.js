'use strict';

const Stream = require('stream');
const JsonDepthStream = require('json-depth-stream');

const internals = {};

module.exports = class Clowncar extends Stream.Transform {

    constructor(pathToArray, doParse) {

        if (typeof pathToArray === 'boolean') {
            doParse = pathToArray;
            pathToArray = null;
        }

        pathToArray = pathToArray || [];
        doParse = (typeof doParse === 'undefined') ? true : !!doParse;

        // We gonna send buffers or parsed JSON?
        super({ readableObjectMode: doParse });

        this.pathToArray = pathToArray;
        this.doParse = doParse;
        this._depth = this.pathToArray.length + 1;
        this._jsonStream = new JsonDepthStream(this._depth);
        this._hadSplit = false;
        this._hasStartedItem = false;
        this._currentChunk = null;
        this._startedParsingArray = false;
        this._backlog = { start: null, buffers: [] };
        this._boundSplit = this._split.bind(this);
        this._boundCleanup = this._cleanup.bind(this);

        this._jsonStream.on('split', this._boundSplit);
        this.once('end', this._boundCleanup);
    }

    _transform(chk, enc, cb) {

        if (this._ended) {
            return cb();
        }

        this._currentChunk = chk;
        this._hadSplit = false;

        this._jsonStream.update(chk);

        // Now zero or many splits may occur due to update(), causing pushes in sync

        if (!this._hadSplit && this._hasStartedItem) {
            this._backlog.chunks.push(this._currentChunk);
        }

        return cb();
    }

    _cleanup() {

        this._jsonStream.removeListener('split', this._boundSplit);
        this._currentChunk = null;
        this._backlog = null;
    }

    _maybeParse(itemBuffer) {

        return this.doParse ? JSON.parse(itemBuffer.toString()) : itemBuffer;
    }

    _split(path, index) {

        // Has not started splitting along the array yet

        if (!this._startedParsingArray && !internals.firstArrayItem(path, this.pathToArray)) {
            return;
        }

        // Has started splitting along the array, and the depth of the path has changed–
        // This means we're done.

        if (path.length !== this._depth) {
            return this.end();
        }

        this._startedParsingArray = true;

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