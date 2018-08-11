# Cuckoo Hit Counter

https://www.cs.cmu.edu/~dga/papers/cuckoo-conext2014.pdf

## Rationale
Cuckoo filter are a really good means of storing set memberships for large datasets in a space efficient manner.
Sometimes we don't want to just test membership but also count accesses for large datasets in a space efficient manner. 
This is an attempt at solving that problem. Specifically for use in [The Owner Free File System](https://github.com/vijayee/js-offs)
where it is used in combination with the fibonacci series to determine how the network grows.

## Install
```
npm install cuckoo-hit-counter
```

## Usage
```javascript
const CuckooHitCounter = require('cuckoo-hit-counter')

let cuckoo= new CuckooHitCounter(200, 4, 2) // (Size, Bucket Size, Finger Print Size)

console.log(cuckoo.add('Your Momma'))//(buffer|string|number) returns true if successful
console.log(cuckoo.contains('Your Momma'))// true: She's definately in there
console.log(cuckoo.rank('Your Momma'))// 0: A Fibonacci rank of 0
console.log(cuckoo.tally('Your Momma'))// 0: A Tally of 0 hits
console.log(cuckoo.number) // 1
console.log(cuckoo.remove('Your daddy'))//false He's not home
console.log(cuckoo.reliable) // true less than 95% full
let json = cuckoo.toJSON() // serialize to json object
let cbor = cuckoo.toCBOR() // serialize to cbor
```
## Note
Size your buckets and fingerprints to avoid collisions.
