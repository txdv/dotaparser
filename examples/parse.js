/*global require: false, process: false */

(function () {
'use strict';

var
  dotaparser = require('../main'),
  timespan = require('timespan'),
  ansi = require('ansi'),
  fs = require('fs'),
  cursor = ansi(process.stdout),
  print = process.stdout.write;

function lpad(text, char, length) {
  while (text.length < length) {
    text = char + text;
  }
  return text;
}

function format(ts) {
  var empty = '';
  return lpad(empty + ts.hours, '0', 2) + ':' + lpad(empty + ts.minutes, '0', 2) + ':' + lpad(empty + ts.seconds, '0', 2);
}

function color(id) {
  return [ null, '#FFFFFF', // Referee
           '#0000FF', '#008080', '#800080', '#FFFF00', '#FFA500',
           '#FFC0CB', '#808080', '#ADD8E6', '#006400', '#A52A2A'][id];
}

dotaparser.parseActions(fs.readFileSync(process.argv[2]), function (game, event) {
  if (event.type !== 'chat') {
    return;
  }
  var ts = timespan.fromMilliseconds(game.time);
  cursor.fg.white();
  if (ts !== undefined) {
    print('(' + format(ts) + ')' + ' ');
    cursor.hex(color(event.player.id));
    print(event.player.name);
    cursor.fg.white();
    print(': ' + event.text + '\n');
  }
});
}());
