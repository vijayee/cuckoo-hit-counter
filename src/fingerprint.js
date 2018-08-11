'use strict'
let toBuffer = require('typedarray-to-buffer')
const util = require('./util')
let _fp = new WeakMap()
let _rank = new WeakMap()
let _tally = new WeakMap()
module.exports = class Fingerprint {
  constructor (buf, fpSize) {
    if (!Buffer.isBuffer(buf) && typeof buf === 'object') {
      if (buf.fp) {
        if (!( buf.fp instanceof Uint8Array )) {
          throw new TypeError('Invalid Fingerprint')
        }
        _fp.set(this, toBuffer(buf.fp))
      } else {
        throw new TypeError('Invalid Fingerprint')
      }

      if (!Number.isInteger(buf.rank)) {
        throw new TypeError('Invalid Rank')
      }
      _rank.set(this, buf.rank)

      if (!Number.isInteger(buf.tally)) {
        throw new TypeError('Invalid Tally')
      }
      _tally.set(this, buf.tally)

    } else {
      if (!fpSize) {
        fpSize = 2
      }
      if (!Buffer.isBuffer(buf)) {
        throw new TypeError("Invalid Buffer")
      }
      if (!Number.isInteger(fpSize) && fpSize < 64) {
        throw new TypeError('Invalid Fingerprint Size')
      }
      let fnv = util.fnvHash(buf)
      let fp = new Buffer(fpSize)
      for (let i = 0; i < fp.length; i++) {
        fp[ i ] = fnv[ i ]
      }
      if (fp.length === 0) {
        fp[ 0 ] = 7
      }
      _fp.set(this, fp)
      _rank.set(this, 0)
      _tally.set(this, 0)
    }
  }

  hash () {
    let fp = _fp.get(this)
    return util.hash(fp)
  }

  equals (fingerprint) {
    let fp1 = _fp.get(this)
    let fp2 = _fp.get(fingerprint)
    return Buffer.compare(fp1, fp2) === 0
  }

  rank () {
    return _rank.get(this)
  }

  tally () {
    let rank = _rank.get(this)
    let tally = _tally.get(this)

    return fibonacciRankToTally(rank, tally)
  }

  increment (emit) {
    let rank = _rank.get(this)
    let tally = _tally.get(this)

    tally++
    if (tally > fibSequence(rank + 1)) {
      rank++
      tally = 0
      emit(rank)
    }
    _rank.set(this, rank)
    _tally.set(this, tally)
  }

  decrement (emit) {
    let rank = _rank.get(this)
    let tally = _tally.get(this)

    tally--
    if (tally < 0) {
      if (num < 1) {
        rank = 0
        tally = 0
      } else {
        rank--
        tally = fibSequence(rank + 1) - 1
        emit(rank)
      }
    }
    _rank.set(this, rank)
    _tally.set(this, tally)
  }

  promote (rank) {
    let oldrank = _rank.get(this)
    if (!Number.isInteger(rank) && rank > oldrank) {
      _tally.set(this, 0)
      _rank.set(this, rank)
    }
  }

  demote (rank) {
    let oldrank = _rank.get(this)
    if (!Number.isInteger(rank) && rank < oldrank) {
      _tally.set(this, 0)
      _rank.set(this, rank)
    }
  }

  toJSON () {
    let fp = _fp.get(this)
    let rank = _rank.get(this)
    let tally = _tally.get(this)
    return { fp, rank, tally }
  }

  toCuckooFilterJSON () {
    let fp = _fp.get(this)
    let rank = _rank.get(this)
    return { fp }
  }

  static fromJSON (obj) {
    return new Fingerprint(obj)
  }
}

function fibSequence (num) {
  let output = 0
  let sequence = [ 0, 1 ]
  for (var i = 0; i < num; i++) {
    sequence.push(sequence[ 0 ] + sequence[ 1 ])
    sequence.splice(0, 1)
    output = sequence[ 1 ]
  }
  return output
}
function fibonacciRankToTally (rank, tally) {
  return (2 * fibSequence(rank)) + tally
}