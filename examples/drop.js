/*global console: false, require: false, process: false */

(function () {
'use strict';

var
  dotaparser = require('../main'),
  timespan = require('timespan'),
  ansi = require('ansi'),
  fs = require('fs'),
  cursor = ansi(process.stdout),
  print = process.stdout.write;

var
  itemlist = { },
  items = dotaparser.data.ItemList.Item;

for (var i = 0; i < items.length; i++) {
  var item = items[i];
  itemlist[item.Id] = item;
}

dotaparser.parseActions(fs.readFileSync(process.argv[2]), function (game, event) {
  if (event === undefined) {
    return;
  }
  switch (event.type) {
  case 'unitbuilding':
    var item = itemlist[event.itemid];
    if (item === undefined) {
      return;
    }
    if (item.Type == 'ITEM') {
      console.log(event.player);
      console.log(item);
    }
    break;
  case 'nesamone':
    break;
  default:
    break;
  }
});

}());
