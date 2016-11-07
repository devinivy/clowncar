# clowncar

Stream array items out of incoming JSON

[![Build Status](https://travis-ci.org/devinivy/clowncar.svg?branch=master)](https://travis-ci.org/devinivy/clowncar) [![Coverage Status](https://coveralls.io/repos/devinivy/clowncar/badge.svg?branch=master&service=github)](https://coveralls.io/github/devinivy/clowncar?branch=master)

## Usage
```js
const Clowncar = require('clowncar');
const Wreck = require('wreck');

Wreck.request('get', 'https://api.npms.io/v2/search?q=streams&size=100', null, (err, res) => {

    if (err) {
        throw err;
    }

    const clowncar = new Clowncar('results');

    res.pipe(clowncar).on('data', (result) => {

        console.log(result.package.name);
    });
});
```

## API
### `new Clowncar([pathToArray], [doParse])`

Returns a new [Transform stream](https://nodejs.org/api/stream.html#stream_class_stream_transform), which will receive streaming JSON and output the items of an array within that JSON where,

 - `pathToArray` - a path in the form of an array or [`Hoek.reach()`](https://github.com/hapijs/hoek/blob/master/API.md#reachobj-chain-options)-style string, specifying where in the incoming JSON the array will be found.  Defaults to `[]`, meaning that the incoming JSON is the array itself.

 For example, `['a', 1, 'b']` and `'a.1.b'` both represent the array `["this", "array"]` within the following JSON,

 ```json
  {
    "a": [
      "junk",
      {
        "b": ["this", "array"]
      },
      "junk"
    ]
  }
```

- `doParse` - a boolean specifying whether the outgoing array items will be parsed (with `JSON.parse()`), or left as buffers.  Defaults to `true`.  When `true`, the stream is placed into object mode.

## Extras
### Approach
A major downside of parsing streaming JSON is that it is much slower than using `JSON.parse()`.  While `JSON.parse()` is exceptionally fast, parsing large JSON objects does block the event loop and use memory, sometimes in nasty ways.  One thing that makes a JSON object large is when it may contain an array of arbitrary length; this is where clowncar shines.  Rather than carefully parsing every bit of JSON while it streams, clowncar instead just identifies items within an array, then `JSON.parse()`s each one of them separately.  That is, clowncar parses as little of the JSON as is necessary on its own, and leaves the heavy-lifting to `JSON.parse()`.  This has the benefits of keeping a low memory / event-loop footprint while taking advantage of the speed of `JSON.parse()`, which no streaming JSON parser can touch today.

### Resources
If you're into streaming JSON, you've gotta check-out the following,
 - [json-depth-stream](https://github.com/indutny/json-depth-stream) - used internally to clowncar, this streaming JSON parser runs light and uniquely can parse to a specified max depth
 - [JSONStream](https://github.com/dominictarr/JSONStream) - perhaps the most mature streaming JSON parser
 - [json-stream-bench](https://github.com/asilvas/json-stream-bench) - benchmarking various streaming JSON implementations
