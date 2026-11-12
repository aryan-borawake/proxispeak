// server/scripts/office-map/tiles.js — Person 1, v6
// The tile palette of the generated office: which tile ids (from the three LimeZu tilesets that are
// already in client/public/maps/) we use for floors, walls and furniture.
//
// A tile id ("gid") is the tile's number across all tilesets of the map:
//   1 … 391      Room_Builder_free_32x32.png  (floors, wall faces)
//   392 … 1815   Interiors_free_32x32.png     (furniture, plants, decorations)
//   1816 …       Interior.png                 (a few extra pieces: round tables)
// Tiled can also flip/rotate a tile: the top 3 bits of the id are flags. ROT180 (flip both ways) turns
// a desk round so it faces the other way.
//
// A STAMP is a small picture made of several tiles: rows of gids, drawn on one layer. `solid: true`
// means you can't walk through it (tables, shelves, plants); chairs and sofas are walkable (you sit there).

const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const FLIP_D = 0x20000000;

/** A tile turned 180° (desks facing the other way). */
export const rot180 = (gid) => (gid | FLIP_H | FLIP_V) >>> 0;
/** A tile turned 90° clockwise (used by Anjali's original meeting table). */
export const rot90 = (gid) => (gid | FLIP_H | FLIP_D) >>> 0;
/** A tile flipped top to bottom and turned (also from the original table). */
export const rotFlip = (gid) => (gid | FLIP_V | FLIP_D) >>> 0;

// ---- floors: only the MIDDLE tile of each 3-tile group repeats without edge lines ----
// A pattern is rows of gids that repeat across the floor (aligned to the map, so rooms line up).
export const FLOORS = {
  stripeWood: [[926]], // Anjali's original light wood: corridors
  orangeWood: [[193]], // warm planks: desk neighbourhoods, hot desks
  brownWood: [[227]], // the boardroom, the stage platform
  redWood: [[261]], // the stage hall
  greyWood: [[295]], // meeting rooms
  beigeWood: [[329]], // the lobby, small rooms
  mint: [[159]], // phone booths
  cream: [[125]], // the café
  tealTile: [[165, 166, 167], [182, 183, 184]], // the kitchen
  yellowTile: [[131, 132, 133], [148, 149, 150]],
  carpet: [[100, 101, 102], [117, 118, 119]], // focus rooms (soft grey carpet)
  carpetDark: [[134, 135, 136], [151, 152, 153]], // the library lounge
  brick: [[97, 98, 99], [114, 115, 116]], // outdoor terrace and plaza paving
  herringbone: [[233, 234, 235], [250, 251, 252]],
};

/** The dark wall top (seen from above), used for every wall. */
export const WALL_TOP = 13;

// ---- wall faces: the visible side of a wall, 2 tiles tall, under the wall's top ----
// [left end, middle, right end] for the upper and the lower row.
export const FACES = {
  salmon: { top: [86, 87, 88], bottom: [103, 104, 105] }, // Anjali's original wall colour
  cream: { top: [120, 121, 122], bottom: [137, 138, 139] },
  mint: { top: [154, 155, 156], bottom: [171, 172, 173] },
  orange: { top: [188, 189, 190], bottom: [205, 206, 207] },
  brown: { top: [222, 223, 224], bottom: [239, 240, 241] },
  red: { top: [256, 257, 258], bottom: [273, 274, 275] },
  grey: { top: [290, 291, 292], bottom: [307, 308, 309] },
  beige: { top: [324, 325, 326], bottom: [341, 342, 343] },
};

/** Make a stamp. rows = [[gid, …], …]; 0 = nothing. */
const stamp = (layer, rows, solid) => ({ layer, rows, solid });

// ---- plants and lights (solid) ----
export const TREE = stamp('furniture', [[1122, 1123], [1138, 1139]], true); // potted tree, 2 × 2
export const PALM = stamp('furniture', [[1109, 1110], [1125, 1126], [1141, 1142]], true); // palm, 2 × 3
export const PLANT = stamp('furniture', [[1124], [1140]], true); // small potted plant
export const STAND_PLANT = stamp('furniture', [[1221], [1237]], true); // plant on a wooden stand
export const FLOOR_LAMP = stamp('furniture', [[1316], [1332]], true);
export const RED_LAMP = stamp('furniture', [[1251], [1267], [1283]], true);
export const BLUE_LAMP = stamp('furniture', [[1252], [1268], [1284]], true);

// ---- seats (walkable: you sit on them) ----
export const CHAIR_UP = 908; // office chair, the sitter faces up (north)
export const CHAIR_DOWN = rot180(908); // faces down (south)
export const SIDE_CHAIR_RIGHT = 898; // wooden chair on the left of a table, faces right
export const SIDE_CHAIR_RIGHT_LOW = 914;
export const SIDE_CHAIR_LEFT = 931; // wooden chair on the right of a table, faces left
export const SIDE_CHAIR_LEFT_LOW = 947;
export const AUDIENCE_CHAIRS = [892, 893, 894, 895]; // wooden chairs in rows (stage hall)
export const STOOL = 749;
export const BAR_STOOLS = [1267, 1268, 1269]; // red, blue, red bar stools (chrome legs)


export const SOFA_LIGHT = stamp('furniture', [[1548, 1549, 1550], [1564, 1565, 1566]], false); // faces down
export const SOFA_GREY = stamp('furniture', [[1545, 1546, 1547], [1561, 1562, 1563]], false);
export const SOFA_BROWN = stamp('furniture', [[1551, 1552, 1553], [1567, 1568, 1569]], false);
export const SOFA_WHITE = stamp('furniture', [[1583, 1584, 1585], [1599, 1600, 1601]], false);
export const SOFA_SIDE_FACING_RIGHT = stamp('furniture', [[1613, 1614], [1629, 1630], [1645, 1646]], false);
export const SOFA_SIDE_FACING_LEFT = stamp('furniture', [[1611, 1612], [1627, 1628], [1643, 1644]], false);
export const ARMCHAIR = stamp('furniture', [[1577, 1578], [1593, 1594]], false);

// ---- tables (solid) ----
export const COFFEE_TABLE = stamp('furniture', [[1582, 1582]], true); // low grey table, 2 wide
export const COFFEE_TABLE_ITEMS = stamp('decor', [[612, 1409]], false); // cake and a little plant on it
export const ROUND_TABLE = stamp('furniture', [[1858, 1859], [1865, 1866]], true); // round wooden tea table
export const PURPLE_TABLE = stamp('furniture', [[1133, 1134], [1149, 1150]], true);
export const WOOD_DESK = stamp('furniture', [[1275, 1276], [1291, 1292]], true); // a desk with drawers (focus rooms)
export const RECEPTION = stamp('furniture', [[520, 521, 521, 521, 522]], true); // white counter (Anjali's lobby desk)
export const RECEPTION_ITEMS = stamp('decor', [[0, 539, rotFlip(540), 0, 0]], false); // monitor and phone on it
export const CHALKBOARD = stamp('furniture', [[1042, 1043], [1058, 1059]], true); // whiteboard on a stand

// Desk tiles: a 2-tile desk top (the right tile has the monitor) and its front with legs.
export const DESK_TOP = [921, 922];
export const DESK_FRONT = [937, 938];

// ---- on walls (decor layer, drawn over the wall face) ----
export const WINDOW = stamp('decor', [[603, 604], [619, 620]], false);
export const CURTAIN_WINDOW = stamp('decor', [[797, 798], [813, 814]], false);
export const RED_WINDOW = stamp('decor', [[799, 800], [815, 816]], false);
export const TV = stamp('decor', [[632, 633]], false);
export const WORLD_MAP = stamp('decor', [[1474, 1475]], false);
export const CORKBOARD = stamp('decor', [[1048, 1049]], false);
export const POSTER = stamp('decor', [[1029, 1030], [1045, 1046]], false);
export const AQUARIUM = stamp('decor', [[776, 777], [792, 793]], false);
export const PICTURE = stamp('decor', [[601]], false);
export const DARK_DOORWAY = stamp('decor', [[544, 545], [560, 561]], false); // the elevator doors
export const BAR_SHELVES = stamp('decor', [[1506, 1507, 1508, 1509, 1510, 1511], [1522, 1523, 1524, 1525, 1526, 1527]], false);
export const WINE_SHELVES = stamp('decor', [[1554, 1555, 1556, 1557], [1570, 1571, 1572, 1573]], false);
export const BOOKCASE = stamp('decor', [[621, 622], [637, 638], [653, 654], [669, 670]], true); // 4 tall: stands on the floor

// ---- kitchen (solid) ----
export const STOVES = stamp('furniture', [[1668, 1669, 1670, 1671], [1684, 1685, 1686, 1687]], true);
export const FRIDGE = stamp('decor', [[1044], [1060], [1076]], true);
export const DISPLAY_FRIDGES = stamp('furniture', [[682, 683, 684, 685], [698, 699, 700, 701], [714, 715, 716, 717]], true);

// ---- rugs (walkable, under everything) ----
export const RUG_RED = stamp('rugs', [[639, 640, 641, 642], [655, 656, 657, 658], [671, 672, 673, 674]], false);
export const RUG_GREEN = stamp('rugs', [[1064, 1065, 1066], [1080, 1081, 1082]], false);
export const RUG_OLIVE = stamp('rugs', [[1067, 1068, 1069], [1083, 1084, 1085]], false);
export const RUG_BLUE = stamp('rugs', [[597, 598, 599], [613, 614, 615], [629, 630, 631]], false);
