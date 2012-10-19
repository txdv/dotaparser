//
// **dotaparser** is a replay parser for the popular warcraft3 map/standalone
// game **dota**. It will try to gather as much information as possible from
// the replays and serve it in way which is common in javascript.
// [http://w3g.deepnode.de/](http://w3g.deepnode.de/) played a major role in writing this parser.

var zlib = require('zlib'),
    async = require('async');

String.prototype.reverse = function() { return this.split("").reverse().join(""); }

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
    blocks:  data.readUInt32LE(0x002c),
  };

  if (header.version == 1) {
    header.sub = {
      magic:   data.toString('ascii', 0x0030, 0x0034).reverse(),
      version: data.readUInt16LE(0x0030 + 0x0004),
      build:   data.readUInt16LE(0x0030 + 0x0008),
      flags:   data.readUInt32LE(0x0030 + 0x000A),
      length:  data.readUInt32LE(0x0030 + 0x000C),
      crc32:   data.readUInt32LE(0x0030 + 0x0010),
    };

  } else if (header.version == 0) {
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
      tsize: data.readUInt16LE(start + 0x0002),
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
}

// A function which helps to determine the position of the next
// string end (\0) in a buffer.

function end(data, start) {
  var i = 0;
  while (data[start + i] != 0) {
    i++;
  }
  return start + i;
}

// Reads the entire player record.
function readPlayerRecord(data, start) {
  var record = {
    id:       data.readInt8(start),
    playerid: data.readInt8(start + 0x0001),
  }

  var s = start + 0x0002;
  var e = end(data, s);
  record.name = data.toString('ascii', s, e);
  record.additional = data[e + 1];

  e += 2;

  if (record.additional == 1) {
  } else if (record.additional == 0) {
  } else {
    var error = "not supported " + record.additional;
    throw new error;
  }
  e+= record.additional;

  record.size = e - start;

  return record;
}

// Reads a slot record.
function readSlotRecord(data, start) {
  return {
    id:     data.readInt8(start),
    pct:    data.readInt8(start + 1),
    status: data.readInt8(start + 2),
    flag:   data.readInt8(start + 3),
    team:   data.readInt8(start + 4),
    color:  data.readInt8(start + 5),
    race:   data.readInt8(start + 6),
    ai:     data.readInt8(start + 7),
  }
}

// Reads the gamestart record.
function readGameStatRecord(data, start) {
  if (data.readInt8(start) != 25) {
    throw "not a gamestat record";
  }

  var record = {
    size:      data.readUInt16LE(start + 1),
    slotcount: data.readInt8(start + 3),
  }

  record.slots = [];
  for (var i = 0; i < record.slotcount; i++) {
    record.slots.push(readSlotRecord(data, start + 4 + i * 9));
  }

  var s = start + 4 + record.slotcount * 9;

  record.seed = data.readUInt32LE(s);
  record.mode = data.readUInt8(s + 4);
  record.startspotcount = data.readUInt8(s + 5);

  record.end = s + 6;
  return record;
}

// Unzips the replay and decodes all blocks within the unzipped data.
// This function has 2 additional callbacks, the blockcb and the endcb,
// which get called when a block is decoded or the end of the data is reached.
// The header of the first callback gets extended with additional information
// about the players.
exports.parseBlocks = function (buffer, callback, blockcb, endcb) {
  exports.unzip(buffer, function (header, data) {
    var start = 0;

    start += 4;

    var record = readPlayerRecord(data, start);

    s = start + record.size;
    e = end(data, s);

    var item = {
      record: record,
      gamename: data.toString('ascii', s, e)
    };

    s += e + 1; // avoiding nullbyte
    e = end(data, s);

    // do something with the encoded string (4.3)

    s = e + 1;

    // 4.6
    item.playercount = data.readUInt32LE(s);
    s += 4;

    item.game = {
      type: data.readUInt8(s),
      flag: data.readUInt8(s + 1),
    };
    s += 4;

    item.lang = data.readUInt32LE(s);
    s += 4;

    item.playerlist = [];
    item.playerlist[item.record.playerid] = item.record;
    for (var i = 0; i < 20; i++) {
      var player = readPlayerRecord(data, s);
      if (player.size != 4) {
        item.playerlist[player.playerid] = player;
      }
      s += player.size;
    }
    item.gamestart = readGameStatRecord(data, s);
    s = item.gamestart.end;

    header.meta = item;
    callback(header, data);

    var done = false;
    while (!done) {
      var msg = null;
      var id = data.readUInt8(s);
      switch (id) {
      case 0x00:
        done = true;
        break;
      case 0x1A:
      case 0x1B:
      case 0x1C:
        s += 5;
        break;
      case 0x20: // chat
        var e = end(data, s + 9);
        msg = {
          id: 0x20,
          type: 'chat',
          playerid: data.readUInt8(s + 1),
          size: data.readUInt16LE(s + 2),
          type: 'chat',
          flags: data.readUInt8(s + 4),
          mode:  data.readUInt32LE(s + 5),
          text: data.toString('utf8', s + 9, e),
        };
        s = e + 1;
        break;
      case 0x1e:
      case 0x1f: // timeslot
        msg = {
          id: 0x1F,
          type: 'timeslot',
          size: data.readUInt16LE(s + 1),
          inc:  data.readUInt16LE(s + 3),
        };

        if (msg.inc === undefined) {
        }

        var offset = 5;
        if (msg.size > 2) {
          msg.data = data.slice(s + offset, s + offset + msg.size - 2);
        }
        s += msg.size + 3;
        break;
      case 0x17:
        msg = {
          id: 0x17,
          type: 'leave',
          reason: data.readUInt16LE(s + 1),
          playerid: data.readUInt8(s + 2),
          result: data.readUInt16LE(s + 3)
        }
        s += 14;
        break;
      default:
        throw 'not supported: ' + id;
      }

      if (!done && msg !== null) {
        blockcb(msg);
      }
    }
    if (endcb !== undefined) {
      endcb();
    }
  });
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
    //time += msg.inc;
    if (msg.type == 'chat') {
      var event = {
        type: 'chat',
        player: {
          id:   header.meta.playerlist[msg.playerid].playerid,
          name: header.meta.playerlist[msg.playerid].name,
        },
        text: msg.text
      }
      if (callback !== undefined) {
        callback(game, event);
      }
    }
    if (msg.type == 'timeslot') {
      game.time += msg.inc;
    }
    if (msg.type == 'timeslot' && msg.size > 2) {
      data = {
        pid: msg.data.readUInt8(0),
        length: msg.data.readUInt16LE(1),
      };


      var id = msg.data.readUInt8(3);
      var s = 4;
      switch (id) {
      case 0x10:
        var event = {
          id: id,
          type: 'unitbuilding',
        };

        event.player = header.meta.playerlist[data.pid];
        event.abilityflag = msg.data.readUInt16LE(4);
        event.itemid = msg.data.toString('ascii', 6, 10).reverse();
        callback(game, event);
        break;
      case 0x11:
        break;
      case 0x12:
        break;
      case 0x13:
        var event = {
          id: id,
          type: 'dropitem',
        };

        event.abilityflags = msg.data.readUInt16LE(4);
        event.itemid       = msg.data.toString('ascii', 4 + 2, 4 + 2 + 4).reverse();

        event.location = {
          x: msg.data.readUInt32LE(4 + 10),
          y: msg.data.readUInt32LE(4 + 14),
        };

        event.targetobject = {
          id1: msg.data.readUInt32LE(4 + 18),
          id2: msg.data.readUInt32LE(4 + 22),
        };

        event.itemobject = {
          id1: msg.data.readUInt32LE(4 + 26),
          id2: msg.data.readUInt32LE(4 + 30),
        };

        callback(game, event);
        break;
      case 0x14:
        break;
      case 0x16:
        var event = {
          id: id,
          type: 'selection'
        };

        if (msg.data.readUInt8(4) == 1) {
          event.mode = 'add';
        } else {
          event.mode = 'remove';
        }
        var n = msg.data.readUInt16LE(5);
        var s = 6;
        event.objects = [];
        for (var i = 0; i < n; i++) {
          event.objects.push({
            id1: msg.data.readUInt32LE(s),
            id2: msg.data.readUInt32LE(s + 4)
          });
          s += 8;
        }
        callback(game, event);
        break;
      case 0x17:
        break;
      case 0x1a:
        break;
      case 0x1b:
        break;
      case 0x60:
        break;
      case 0x61:
        break;
      case 0x66:
        break;
      case 0x68:
        break;
      case 0x6b:
        break;
      default:
        console.log("unhandled: " + id);
        break;
      }
    }
  }, end);
}

exports.data = require('./data').data;
