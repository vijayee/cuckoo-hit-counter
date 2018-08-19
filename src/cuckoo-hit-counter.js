'use strict'
const EventEmitter = require('events').EventEmitter
const cbor = require('cbor-js')
const toAb = require('to-array-buffer')
const abToB = require('arraybuffer-to-buffer')
const Bucket = require('./bucket')
const Fingerprint = require('./fingerprint')
const util = require('./util')
const maxCuckooCount = 500
let _bSize = new WeakMap()
let _cfSize = new WeakMap()
let _fpSize = new WeakMap()
let _buckets = new WeakMap()
let _count = new WeakMap()
let _maxRank = new WeakMap()
module.exports = class CuckooHitCounter extends EventEmitter  {
  constructor (cfSize, bSize, fpSize) {
     super()
    if (!Buffer.isBuffer(cfSize) && typeof cfSize === 'object') {
      if (!isNaN(cfSize.cfSize)) {
        if (!Number.isInteger(cfSize.cfSize)) {
          throw new TypeError('Invalid Cuckoo Filter Size')
        }
        _cfSize.set(this, cfSize.cfSize)
      } else {
        throw new TypeError('Invalid Cuckoo Filter Size')
      }
      if (!isNaN(cfSize.bSize)) {
        if (!Number.isInteger(cfSize.bSize)) {
          throw new TypeError('Invalid Bucket Size')
        }
        _bSize.set(this, cfSize.bSize)
      } else {
        throw new TypeError('Invalid Bucket Size')
      }
      if (!isNaN(cfSize.fpSize)) {
        if (!Number.isInteger(cfSize.fpSize) || cfSize.fpSize > 64) {
          throw new TypeError('Invalid Fingerprint Size')
        }
        _fpSize.set(this, cfSize.fpSize)
      } else {
        throw new TypeError('Invalid Fingerprint Size')
      }
      if (!isNaN(cfSize.count)) {
        if (!Number.isInteger(cfSize.count)) {
          throw new TypeError('Invalid Count')
        } else {
          _count.set(this, cfSize.count)
        }
      } else {
        throw new TypeError('Invalid Count')
      }
      if (!isNaN(cfSize.maxRank)) {
        if (!Number.isInteger(cfSize.maxRank)) {
          throw new TypeError('Invalid Max Rank')
        } else {
          _maxRank.set(this, cfSize.maxRank)
        }
      } else {
        throw new TypeError('Invalid Max Rank')
      }
      if (cfSize.buckets) {
        let buckets = cfSize.buckets.map((bucket)=> {
          if (!bucket) {
            return null
          } else {
            return new Bucket(bucket)
          }
        })
        _buckets.set(this, buckets)
      } else {
        throw new TypeError('Invalid Buckets')
      }
    }
    else {
      if (!bSize) {
        bSize = 4
      }
      if (!fpSize) {
        fpSize = 2
      }
      if (!cfSize) {
        cfSize = (1 << 18) / bSize
      }
      if (!Number.isInteger(cfSize)) {
        throw new TypeError('Invalid Cuckoo Filter Size')
      }
      if (!Number.isInteger(fpSize) || fpSize > 64) {
        throw new TypeError('Invalid Fingerprint Size')
      }
      if (!Number.isInteger(bSize)) {
        throw new TypeError('Invalid Bucket Size')
      }

      _fpSize.set(this, fpSize)
      _bSize.set(this, bSize)
      _cfSize.set(this, cfSize)
      _count.set(this, 0)
      _maxRank.set(this, 0)
      _maxRankTally.set(this, 0)
      let buckets = []
      for (let i = 0; i < cfSize; i++) {
        buckets.push(null)
      }
      _buckets.set(this, buckets)
    }
  }

  add (buf) {
    if (typeof buf === 'number') {
      buf = util.numberToBuffer(buf)
    }
    if (typeof buf === 'string') {
      buf = new Buffer(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('Invalid Buffer')
    }
    let bSize = _bSize.get(this)
    let fpSize = _fpSize.get(this)
    let cfSize = _cfSize.get(this)
    let count = _count.get(this)
    let buckets = _buckets.get(this)
    let fingerprint = new Fingerprint(buf, fpSize)
    let j = util.hash(buf) % cfSize
    let k = (j ^ fingerprint.hash()) % cfSize
    if (!buckets[ j ]) {
      buckets[ j ] = new Bucket(bSize)
    }
    if (!buckets[ k ]) {
      buckets[ k ] = new Bucket(bSize)
    }
    if (buckets[ j ].add(fingerprint) || buckets[ k ].add(fingerprint)) {
      count++
      _count.set(this, count)
      return true
    }
    let rand = [ j, k ]
    let i = rand[ util.getRandomInt(0, rand.length - 1) ]
    if (!buckets[ i ]) {
      buckets[ i ] = new Bucket(bSize)
    }
    for (let n = 0; n < maxCuckooCount; n++) {
      fingerprint = buckets[ i ].swap(fingerprint)
      i ^= fingerprint.hash() % cfSize
      if (!buckets[ i ]) {
        buckets[ i ] = new Bucket(bSize)
      }
      if (buckets[ i ].add(fingerprint)) {
        count++
        _count.set(this, count)
        return true
      }
    }
    return false
  }

  contains (buf) {
    if (typeof buf === 'number') {
      buf = util.numberToBuffer(buf)
    }
    if (typeof buf === 'string') {
      buf = new Buffer(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('Invalid Buffer')
    }
    if (!this.number) {
      return false
    }
    let fpSize = _fpSize.get(this)
    let cfSize = _cfSize.get(this)
    let buckets = _buckets.get(this)
    let fingerprint = new Fingerprint(buf, fpSize)
    let j = util.hash(buf) % cfSize
    let inJ = buckets[ j ] ? buckets[ j ].contains(fingerprint) : false

    if (inJ) {
      return inJ
    } else {
      let k = (j ^ fingerprint.hash()) % cfSize
      let inK = buckets[ k ] ? buckets[ k ].contains(fingerprint) : false
      return inK
    }
  }

  increment (buf) {
    if (typeof buf === 'number') {
      buf = util.numberToBuffer(buf)
    }
    if (typeof buf === 'string') {
      buf = new Buffer(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('Invalid Buffer')
    }
    let fpSize = _fpSize.get(this)
    let cfSize = _cfSize.get(this)
    let buckets = _buckets.get(this)
    let fingerprint = new Fingerprint(buf, fpSize)
    let j = util.hash(buf) % cfSize
    let emit =  (rank) => {
      let maxRank = _maxRank.get(this)
      if (rank > maxRank) {
        maxRank = rank
        _maxRank.set(this, maxRank)
      }
      this.emit('promote', { key: buf.toString(), rank})
    }
    let inJ = buckets[ j ] ? buckets[ j ].increment(fingerprint, emit) : false

    if (typeof inJ !== 'boolean') {
      return inJ
    } else {
      let k = (j ^ fingerprint.hash()) % cfSize
      let inK = buckets[ k ] ? buckets[ k ].increment(fingerprint, emit) : false
      if (typeof inK !== 'boolean') {
        return inK
      } else {
        return false
      }
    }
  }

  promote (buf, number) {
    if (typeof buf === 'number') {
      buf = util.numberToBuffer(buf)
    }
    if (typeof buf === 'string') {
      buf = new Buffer(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('Invalid Buffer')
    }
    let fpSize = _fpSize.get(this)
    let cfSize = _cfSize.get(this)
    let buckets = _buckets.get(this)
    let fingerprint = new Fingerprint(buf, fpSize)
    let j = util.hash(buf) % cfSize
    let inJ = buckets[ j ] ? buckets[ j ].promote(fingerprint) : false

    if (typeof inJ !== 'boolean') {
      return inJ
    } else {
      let k = (j ^ fingerprint.hash()) % cfSize
      let inK = buckets[ k ] ? buckets[ k ].promote(fingerprint) : false
      if (typeof inK !== 'boolean') {
        return inK
      } else {
        return false
      }
    }
  }

  demote (buf, number) {
    if (typeof buf === 'number') {
      buf = util.numberToBuffer(buf)
    }
    if (typeof buf === 'string') {
      buf = new Buffer(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('Invalid Buffer')
    }
    let fpSize = _fpSize.get(this)
    let cfSize = _cfSize.get(this)
    let buckets = _buckets.get(this)
    let fingerprint = new Fingerprint(buf, fpSize)
    let j = util.hash(buf) % cfSize
    let inJ = buckets[ j ] ? buckets[ j ].demote(fingerprint) : false

    if (typeof inJ !== 'boolean') {
      return inJ
    } else {
      let k = (j ^ fingerprint.hash()) % cfSize
      let inK = buckets[ k ] ? buckets[ k ].demote(fingerprint) : false
      if (typeof inK !== 'boolean') {
        return inK
      } else {
        return false
      }
    }
  }

  decrement (buf) {
    if (typeof buf === 'number') {
      buf = util.numberToBuffer(buf)
    }
    if (typeof buf === 'string') {
      buf = new Buffer(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('Invalid Buffer')
    }
    let fpSize = _fpSize.get(this)
    let cfSize = _cfSize.get(this)
    let buckets = _buckets.get(this)
    let fingerprint = new Fingerprint(buf, fpSize)
    let j = util.hash(buf) % cfSize
    let k = (j ^ fingerprint.hash()) % cfSize
    let emit =  (rank) => {
      this.emit('demote', { key: buf.toString(), rank})
    }
    let inJ = buckets[ j ] ? buckets[ j ].decrement(fingerprint, emit) : false

    if (typeof inJ !== 'boolean') {
      return inJ
    } else {
      let k = (j ^ fingerprint.hash()) % cfSize
      let inK = buckets[ k ] ? buckets[ k ].decrement(fingerprint, emit) : false
      if (typeof inK !== 'boolean') {
        return inK
      } else {
        return false
      }
    }
  }

  rank (buf) {
    if (typeof buf === 'number') {
      buf = util.numberToBuffer(buf)
    }
    if (typeof buf === 'string') {
      buf = new Buffer(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('Invalid Buffer')
    }
    let fpSize = _fpSize.get(this)
    let cfSize = _cfSize.get(this)
    let buckets = _buckets.get(this)
    let fingerprint = new Fingerprint(buf, fpSize)
    let j = util.hash(buf) % cfSize
    let inJ = buckets[ j ] ? buckets[ j ].rank(fingerprint) : false

    if (typeof inJ !== 'boolean') {
      return inJ
    } else {
      let k = (j ^ fingerprint.hash()) % cfSize
      let inK = buckets[ k ] ? buckets[ k ].rank(fingerprint) : false
      if (typeof inK !== 'boolean') {
        return inK
      } else {
        return 0
      }
    }
  }

  tally (buf) {
    if (typeof buf === 'number') {
      buf = util.numberToBuffer(buf)
    }
    if (typeof buf === 'string') {
      buf = new Buffer(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('Invalid Buffer')
    }
    let fpSize = _fpSize.get(this)
    let cfSize = _cfSize.get(this)
    let buckets = _buckets.get(this)
    let fingerprint = new Fingerprint(buf, fpSize)
    let j = util.hash(buf) % cfSize
    let inJ = buckets[ j ] ? buckets[ j ].tally(fingerprint) : false
    if (typeof inJ !== 'boolean') {
      return inJ
    } else {
      let k = (j ^ fingerprint.hash()) % cfSize
      let inK = buckets[ k ] ? buckets[ k ].tally(fingerprint) : false
      if (typeof inK !== 'boolean') {
        return inK
      } else {
        return 0
      }
    }
  }

  remove (buf) {
    if (typeof buf === 'number') {
      buf = util.numberToBuffer(buf)
    }
    if (typeof buf === 'string') {
      buf = new Buffer(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('Invalid Buffer')
    }
    let fpSize = _fpSize.get(this)
    let cfSize = _cfSize.get(this)
    let buckets = _buckets.get(this)
    let fingerprint = new Fingerprint(buf, fpSize)
    let j = util.hash(buf) % cfSize
    let inJ = buckets[ j ] ? buckets[ j ].remove(fingerprint) : false

    if (inJ) {
      return inJ
    } else {
      let k = (j ^ fingerprint.hash()) % cfSize
      let inK = buckets[ k ] ? buckets[ k ].remove(fingerprint) : false
      if (inK) {
        return inK
      } else {
        return false
      }
    }
  }

  get number () {
    return _count.get(this)
  }

  get maxRank () {
    return _maxRank.get(this)
  }

  get reliable () {
    let cfSize = _cfSize.get(this)
    return Math.floor(100 * (this.number / cfSize)) <= 95
  }

  toJSON () {
    let fpSize = _fpSize.get(this)
    let cfSize = _cfSize.get(this)
    let count = _count.get(this)
    let buckets = _buckets.get(this)
    let bSize = _bSize.get(this)
    let maxRank = _maxRank.get(this)
    let maxRankTally = _maxRankTally.get(this)

    return {
      cfSize: cfSize,
      fpSize: fpSize,
      bSize: bSize,
      count: count,
      maxRank: maxRank,
      buckets: buckets.map((bucket) => {
        if (!bucket) {
          return null
        } else {
          return bucket.toJSON()
        }
      })
    }
  }

  toCuckooFilterJSON () {
    let fpSize = _fpSize.get(this)
    let cfSize = _cfSize.get(this)
    let count = _count.get(this)
    let buckets = _buckets.get(this)
    let bSize = _bSize.get(this)
    return {
      cfSize: cfSize,
      fpSize: fpSize,
      bSize: bSize,
      count: count,
      buckets: buckets.map((bucket)=> {
        if (!bucket) {
          return null
        } else {
          return bucket. toCuckooFilterJSON()
        }
      })
    }
  }

  static fromJSON (obj) {
    return new CuckooHitCounter(obj)
  }
  toCBOR () {
    return abToB(cbor.encode(this.toJSON()))
  }
  toCuckooFilterCBOR () {
    return abToB(cbor.encode(this. toCuckooFilterJSON()))
  }
  static fromCBOR(buf) {
    let obj = cbor.decode(toAb(buf))
    return CuckooHitCounter.fromJSON(obj)
  }
}