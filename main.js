/*global console: false, require: false, process: false, Buffer: false, exports: false */

(function () {
'use strict';

function BinaryReader(buffer, offset) {
  if (!Buffer.isBuffer(buffer)) {
    return null;
  }
  if (offset === undefined || offset === null) {
    offset = 0;
  }

  this.offset = offset;
  this.buffer = new Buffer(buffer);
}

BinaryReader.prototype.skip = function (count) {
  this.offset += count;
}

BinaryReader.prototype.read = function (func, size, offset) {
  if (offset === undefined) {
    var off = this.offset;
  } else {
    var off = offset;
  }
  if (typeof func === 'string') {
    var result = this.buffer[func](off);
  } else {
    var result = func(off);
  }
  if (offset === undefined) {
    this.offset += size;
  }
  return result;
}

BinaryReader.prototype.readInt8 = function (offset) {
  return this.read('readInt8', 1, offset);
}

BinaryReader.prototype.readUInt8 = function (offset) {
  return this.read('readUInt8', 1, offset);
}

BinaryReader.prototype.readUInt16LE = function (offset) {
  return this.read('readUInt16LE', 2, offset);
};

BinaryReader.prototype.readUInt32LE = function (offset) {
  return this.read('readUInt32LE', 4, offset);
};

BinaryReader.prototype.readItemID = function (offset) {
  return this.spliceString('ascii', 4).reverse();
  var that = this;
  return this.read(function (off) {
    var type = that.buffer.readUInt16LE(off + 2);
    var result = null;
    if (type == 13) {
      result = that.buffer.readInt16LE(off);
    } else {
      throw new "not supported";
    }
    return result;
  }, 4, offset);
}

BinaryReader.prototype.readFloatLE = function (offset) {
  return this.read('readFloatLE', 4, offset);
}

BinaryReader.prototype.readFloatBE = function (offset) {
  return this.read('readFlaotBE', 4, offset);
}

BinaryReader.prototype.readPoint = function (func, size, offset) {
  var that = this;
  return this.read(function (off) {
    return {
      x: that[func](off),
      y: that[func](off + 4)
    };
  }, size, offset);
};

BinaryReader.prototype.readPointFloatLE = function (offset) {
  return this.readPoint('readFloatLE', 8, offset);
}

BinaryReader.prototype.readPointFloatBE = function (offset) {
  return this.readPoint('readFloatBE', 8, offset);
}

BinaryReader.prototype.readPointUInt32LE = function (offset) {
  return this.readPoint('readUInt32LE', 8, offset);
}

BinaryReader.prototype.readString = function (offset, encoding) {
  var start;
  if (typeof offset === 'undefined') {
    start = this.offset;
  } else {
    start = offset;
  }

  var i = 0;

  while (this.buffer[start + i] !== 0) {
    i++;
  }

  var end = start + i;

  if (typeof offset === 'undefined') {
    this.offset += i + 1;
  }

  if (encoding === 'udnefined') {
    encoding = 'ascii';
  }

  return this.buffer.toString(encoding, start, end);
}

BinaryReader.prototype.spliceString = function (encoding, length) {
  var ret = this.buffer.toString(encoding, this.offset, this.offset + length);
  this.skip(length);
  return ret;
}

//
// **dotaparser** is a replay parser for the popular warcraft3 map/standalone
// game **dota**. It will try to gather as much information as possible from
// the replays and serve it in way which is common in javascript.
// [http://w3g.deepnode.de/](http://w3g.deepnode.de/) played a major role in writing this parser.

var zlib = require('zlib'),
    async = require('async');

String.prototype.reverse = function() { return this.split("").reverse().join(""); };

// This function reads an entire replay into the buffer, decodes the header,
// the data (unzips it as well) and then returns a callback with the header
// and the unzipped data.
// While the header is already parsed and easily accessible (json), the data
// is still raw, it is just the unzipped version.

exports.unzip = function (data, callback) {
  // Check if the magic prefix is existent.
  var magic = data.toString('ascii', 0, 26);
  if (magic != 'Warcraft III recorded game') {
    return;
  }

  // Read the header details.
  var header = {
    offset:  data.readUInt32LE(0x001c),
    csize:   data.readUInt32LE(0x0020),
    tsize:   data.readUInt32LE(0x0028),
    version: data.readUInt32LE(0x0024),
    blocks:  data.readUInt32LE(0x002c)
  };

  if (header.version === 1) {
    header.sub = {
      magic:   data.toString('ascii', 0x0030, 0x0034).reverse(),
      version: data.readUInt16LE(0x0030 + 0x0004),
      build:   data.readUInt16LE(0x0030 + 0x0008),
      flags:   data.readUInt32LE(0x0030 + 0x000A),
      length:  data.readUInt32LE(0x0030 + 0x000C),
      crc32:   data.readUInt32LE(0x0030 + 0x0010)
    };

  } else if (header.version === 0) {
    throw "not supported";
  } else {
    throw "not supported";
  }


  var blocks = [];
  var start = header.offset;
  // Decode the header (the compressed size and the actual size)
  // of the blocks.
  for (var i = 0; i < header.blocks; i++) {
    var block = {
      csize: data.readUInt16LE(start),
      tsize: data.readUInt16LE(start + 0x0002)
    };
    var end = start + 0x0008 + block.csize;
    block.cdata = data.slice(start + 0x0008, end);

    start = end;
    blocks.push(block);
  }

  // Unzip all blocks.
  async.forEach(blocks, function (block, callback) {
    zlib.unzip(block.cdata, function (err, buffer) {
      if (err === null) {
        block.data = buffer;
      }
      callback(err);
    });
  }, function (err) {
    // Create a new buffer to hold the unzipped content.
    var data = new Buffer(header.blocks * 8192);
    // Put the blocks in the appropriate places in the new buffer.
    for (var i = 0; i < header.blocks; i++) {
      blocks[i].data.copy(data, i * 8192);
    }
    callback(header, data);
  });
};

// A function which helps to determine the position of the next
// string end (\0) in a buffer.

function end(data, start) {
  var i = 0;
  while (data[start + i] !== 0) {
    i++;
  }
  return start + i;
}

// Reads the entire player record.
BinaryReader.prototype.readPlayerRecord = function (offset) {
  var start = this.offset;

  var record = {
    id:         this.readInt8(),
    playerid:   this.readInt8(),
    name:       this.readString(),
    additional: this.readInt8()
  }

  this.skip(record.additional);
  record.size = this.offset - start;

  if (typeof offset !== 'undefined') {
    this.offset = start;
  }

  return record;
}

BinaryReader.prototype.readSlotRecord = function () {
  return {
    id:     this.readInt8(),
    pct:    this.readInt8(),
    status: this.readInt8(),
    flag:   this.readInt8(),
    team:   this.readInt8(),
    color:  this.readInt8(),
    race:   this.readInt8(),
    ai:     this.readInt8(),
    hi:     this.readInt8()
  };
}

BinaryReader.prototype.readGameStartRecord = function () {
  if (this.readInt8(this.offset) != 0x19) {
    throw "not a gamestat record";
  } else {
    this.skip(1);
  }

  var record = {
    size:      this.readUInt16LE(),
    slotcount: this.readInt8()
  };

  record.slots = [];
  for (var i = 0; i < record.slotcount; i++) {
    record.slots.push(this.readSlotRecord());
  }

  record.seed = this.readUInt32LE();
  record.mode = this.readUInt8();
  record.startspotcount = this.readUInt8();

  return record;
}

// Unzips the replay and decodes all blocks within the unzipped data.
// This function has 2 additional callbacks, the blockcb and the endcb,
// which get called when a block is decoded or the end of the data is reached.
// The header of the first callback gets extended with additional information
// about the players.
exports.parseBlocks = function (buffer, callback, blockcb, endcb) {
  exports.unzip(buffer, function (header, data) {
    var br = new BinaryReader(data);
    br.skip(4);

    //var record = readPlayerRecord(br.buffer, br.offset);
    //br.skip(record.size);
    var record = br.readPlayerRecord();

    var item = {
      record: record,
      gamename: br.readString()
    }

    br.skip(1); // Skip nullbyte
    br.readString(); // Skip encoded string (4.3)

    // 4.6
    item.playercount = br.readUInt32LE();

    item.game = {
      type: br.readUInt8(),
      flag: br.readUInt8(),
      unknown: br.readUInt16LE()
    }

    item.lang = br.readUInt32LE();

    item.playerlist = [];
    item.playerlist[item.record.playerid] = item.record;

    while (br.readInt8(br.offset) == 0x16) {
      item.playerlist.push(br.readPlayerRecord());
      br.readUInt32LE();
    }

    item.gamestart = br.readGameStartRecord();

    header.meta = item;
    callback(header, data);

    var done = false;
    while (!done) {
      var msg = null;
      var id = br.readUInt8();
      switch (id) {
      case 0x00:
        done = true;
        break;
      case 0x1A:
      case 0x1B:
      case 0x1C:
        br.skip(4);
        break;
      case 0x17:
        msg = {
          id: 0x17,
          type: 'leave',
          reason:   br.readUInt16LE(),
          playerid: br.readUInt8(),
          result:   br.readUInt16LE(),
          unknown:  br.readUInt16LE()
        };
        break;
      case 0x1E:
      case 0x1F:
        msg = {
          id: 0x1F,
          type: 'timeslot',
          size: br.readUInt16LE(),
          inc: br.readUInt16LE()
        };

        if (msg.size > 2) {
          msg.data = br.buffer.slice(br.offset, br.offset + msg.size - 2);
        }
        br.skip(msg.size - 2);
        break;
      case 0x20:
        msg = {
          id: 0x20,
          type: 'chat',
          playerid: br.readUInt8(),
          size:  br.readUInt16LE(),
          flags: br.readUInt8(),
          mode:  br.readUInt32LE(),
          text:  br.readString(),
        };
        break;
      case 0x22:
        msg = {
          id: 0x22,
          length: br.readUInt8(),
        };
        br.skip(msg.length);
        break;
      default:
        throw 'not supported ' + id;
        break;
      }
      if (!done && msg !== null) {
        blockcb(msg);
      }
    }

    if (endcb !== undefined) {
      endcb();
    }
  });
};

BinaryReader.prototype.readUInt64LE = function () {
  return (this.readUInt32LE() * Math.pow(2, 32)) + this.readUInt32LE();
}

function hex(number, length) {
  var ret = number.toString(16);
  while (ret.length < length) {
    ret = '0' + ret;
  }
  return '0x' + ret;
}

function parseActions(id, br, header, data) {
  function readBuilding(type) {
    var event = {
      id: id,
      type: 'unitbuilding' + type
    };

    event.player = header.meta.playerlist[data.pid];
    event.flags = br.readUInt16LE();
    event.item = br.readItemID();
    br.skip(2 * 4);
    return event;
  };
  var event = null;
  switch (id) {
  case 0x01:
    event = {
      id: id,
      type: 'PauseGame'
    };
    break;
  case 0x02:
    event = {
      id: id,
      type: 'ResumeGame'
    };
    break;
  case 0x05:
    event = {
      id: id,
      type: 'DecreaseGameSpeed'
    };
    break;
  case 0x07:
    event = {
      id: id,
      type: 'SaveGameFinished',
      unknown: br.readUInt32LE()
    };
    break;
  case 0x10:
    event = readBuilding(1);
    break;
  case 0x11:
    event = readBuilding(1);
    event.location = br.readPointFloatLE();
    break;
  case 0x12:
    event = readBuilding(3);
    event.location = br.readPointFloatLE();
    event.object_id = br.readUInt64LE();
    break;
  case 0x13:
    event = {
      id: id,
      type: 'DropItem',
      flags: br.readUInt16LE(),
      item: br.readItemID(),
      unknown: br.readUInt64LE(),
      location: br.readPointFloatLE(),
      target_object_id: br.readUInt64LE(),
      item_object_id:   br.readUInt64LE()
    };
    break;
  case 0x14:
    event = readBuilding(4);
    event.location = br.readPointFloatLE();
    event.sitem = br.readItemID();
    br.skip(9);
    event.slocation = br.readPointFloatLE();
    break;
  case 0x16:
    event = {
      id: id,
      type: 'Selection'
    };

    if (br.readUInt8() == 1) {
      event.mode = 'add';
    } else {
      event.mode = 'remove';
    }
    var n = br.readUInt16LE();
    event.objects = [];
    for (var i = 0; i < n; i++) {
      event.objects.push(br.readUInt64LE());
    }
    break;
  case 0x17:
    event = {
      id: id,
      type: 'assigngroup'
    };
    event.number = br.readUInt8();
    event.count = br.readUInt16LE();
    event.groups = [];
    for (var i = 0; i < event.count; i++) {
      event.groups.push({
        id1: br.readUInt32LE(),
        id2: br.readUInt32LE()
      });
    }
    break;
  case 0x18:
    event = {
      id: id,
      type: 'SelectGroupHotkey',
      group: br.readUInt8(),
      unknown: br.readUInt8()
    };
    break;
  case 0x19:
    event = {
      id: id,
      type: 'SelectSubgroup',
      item: br.readItemID(),
      object_id: br.readUInt64LE()
    };
    break;
  case 0x1A:
    event = {
      id: id,
      type: 'PreSubSelection'
    };
    break;
  case 0x1B:
    event = {
      id: id,
      type: 'Unknown',
      field: br.readUInt8(),
      id1: br.readUInt32LE(),
      id2: br.readUInt32LE()
    };
    break;
  case 0x1C:
    event = {
      id: id,
      type: 'SelectGroundItem',
      unknown: br.readUInt8(),
      id1: br.readUInt32LE(),
      id2: br.readUInt32LE()
    };
    break;
  case 0x28:
    event = {
      id: id,
      type: 'LeafitToMe',
      unknown: br.readUInt8(),
      amount: br.readUInt32LE()
    };
    break;
  case 0x50:
    event = {
      id: id,
      type: 'ChangeAlly',
      slot: br.readUInt8(),
      flags: br.readUInt32LE()
    };
    break;
  case 0x60:
    event = {
      id: id,
      type: 'MapTriggerChatCommand',
      unknown: br.readUInt64LE(),
      string: br.readString()
    };
    break;
  case 0x66:
    event = {
      id: id,
      type: 'EnterChooseHeroSkillSubmenu'
    };
    break;
  case 0x68:
    event = {
      id: id,
      x: br.readUInt32LE(),
      y: br.readUInt32LE(),
      unknown: br.readUInt32LE()
    };
    break;
  case 0x6b:
    event = {
      id: id,
      type: 'SyncStoredInteger',
      file: br.readString(),
      group: br.readString(),
      key: br.readString(),
      value: br.readUInt32LE()
    };
    break;
  case 0x75: {
    event = {
      id: id,
      type: 'Unknown'
    };
    break;
  }
  default:
    console.log('unhandled: ' + id);
    break;
  }

  return event;
}

// Parses the actions encoded within the messages in the blocks.
exports.parseActions = function (buffer, callback, end) {
  var game = {
    time: 0
  };
  var header = null;

  exports.parseBlocks(buffer, function (h, data) {
    header = h;
  }, function (msg) {
    if (msg.type == 'chat') {
      var event = {
        type: 'chat',
        player: {
          id:   header.meta.playerlist[msg.playerid].playerid,
          name: header.meta.playerlist[msg.playerid].name
        },
        text: msg.text
      };
      if (callback !== undefined) {
        callback(game, event);
      }
    }
    if (msg.type == 'timeslot') {
      game.time += msg.inc;
    }
    if (msg.type == 'timeslot' && msg.size > 2) {
      var br = new BinaryReader(msg.data);

      var data = {
        pid: br.readUInt8(),
        length: br.readUInt16LE()
      };

      while (br.offset < data.length) {
        var id = br.readUInt8();
        callback(game, parseActions(id, br, header, data));
      }
    }
  }, end);
};

exports.data = require('./data').data;

}());
