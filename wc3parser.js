var fs   = require('fs'),
    zlib = require('zlib'),
    async = require('async');

String.prototype.reverse=function(){return this.split("").reverse().join("");}

function replay(filename, callback) {

fs.readFile(filename, function (err, data) {
  var magic = data.toString('ascii', 0, 26);
  if (magic != 'Warcraft III recorded game') {
    console.log('NESAMONE');
    return;
  }

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

  async.forEach(blocks, function (block, callback) {
    zlib.unzip(block.cdata, function (err, buffer) {
      if (err === null) {
        block.data = buffer;
      }
      callback(err);
    });
  }, function (err) {
    var data = new Buffer(header.blocks * 8192);
    for (var i = 0; i < header.blocks; i++) {
      blocks[i].data.copy(data, i * 8192);
    }
    callback(header, data);
  });
});

}

function end(data, start) {
  var i = 0;
  while (data[start + i] != 0) {
    i++;
  }
  return start + i;
}

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
    e += 1;
  } else if (record.additional == 0) {
  } else {
    throw "not supported " + record.additional;
  }

  record.size = e - start;

  return record;
}

replay('1144311.w3g', function (header, data) {
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
  for (var i = 0; i < 20; i++) {
    var player = readPlayerRecord(data, s);
    if (player.size != 4) {
    item.playerlist.push(player);
    }
    s += player.size;
  }

  //console.log(item);
  console.log(data.slice(s, s + 20));
});
