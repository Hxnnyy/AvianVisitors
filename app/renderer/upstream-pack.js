// Adapted from AvianVisitors apt.js, CC BY-NC-SA-4.0; repository LICENSE.
const GRID_STRIDE=4, COLLAGE_LABEL_PAD=1;
export function maskPack(tiles, W, H, xBias, yBias, pad) {
    var GW = Math.ceil(W / GRID_STRIDE) + 2;
    var GH = Math.ceil(H / GRID_STRIDE) + 2;
    var grid = new Uint8Array(GW * GH);
    function cellRange(tile, tx, ty, c) {
      var sx = tile.fullW / tile.mask.w;
      var sy = tile.fullH / tile.mask.h;
      var x0 = (tx + c[0] * sx) / GRID_STRIDE | 0;
      var y0 = (ty + c[1] * sy) / GRID_STRIDE | 0;
      var x1 = (tx + (c[0] + 1) * sx) / GRID_STRIDE | 0;
      var y1 = (ty + (c[1] + 1) * sy) / GRID_STRIDE | 0;
      if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
      if (x1 >= GW) x1 = GW - 1; if (y1 >= GH) y1 = GH - 1;
      return [x0, y0, x1, y1];
    }
    function boxRange(b, tx, ty) {
      var x0 = (tx + b.dx0) / GRID_STRIDE | 0;
      var y0 = (ty + b.dy0) / GRID_STRIDE | 0;
      var x1 = (tx + b.dx1) / GRID_STRIDE | 0;
      var y1 = (ty + b.dy1) / GRID_STRIDE | 0;
      if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
      if (x1 >= GW) x1 = GW - 1; if (y1 >= GH) y1 = GH - 1;
      return [x0, y0, x1, y1];
    }
    function collides(tile, tx, ty) {
      var cells = tile.mask.cells;
      for (var i = 0; i < cells.length; i++) {
        var r = cellRange(tile, tx, ty, cells[i]);
        for (var gy = r[1]; gy <= r[3]; gy++) {
          var off = gy * GW;
          for (var gx = r[0]; gx <= r[2]; gx++) {
            if (grid[off + gx]) return true;
          }
        }
      }
      var lc = tile.labelCells;
      if (lc) {
        for (var li = 0; li < lc.length; li++) {
          var lr = boxRange(lc[li], tx, ty);
          for (var ly = lr[1]; ly <= lr[3]; ly++) {
            var loff = ly * GW;
            for (var lx = lr[0]; lx <= lr[2]; lx++) {
              if (grid[loff + lx]) return true;
            }
          }
        }
      }
      return false;
    }
    function stamp(tile, tx, ty) {
      var cells = tile.mask.cells;
      for (var i = 0; i < cells.length; i++) {
        var r = cellRange(tile, tx, ty, cells[i]);
        var gy0 = r[1] - pad, gy1 = r[3] + pad;
        var gx0 = r[0] - pad, gx1 = r[2] + pad;
        if (gy0 < 0) gy0 = 0; if (gx0 < 0) gx0 = 0;
        if (gy1 >= GH) gy1 = GH - 1; if (gx1 >= GW) gx1 = GW - 1;
        for (var gy = gy0; gy <= gy1; gy++) {
          var off = gy * GW;
          for (var gx = gx0; gx <= gx1; gx++) grid[off + gx] = 1;
        }
      }
      var lc = tile.labelCells;
      if (lc) {
        var lpad = Math.min(pad, COLLAGE_LABEL_PAD);
        for (var li2 = 0; li2 < lc.length; li2++) {
          var lr2 = boxRange(lc[li2], tx, ty);
          var ly0 = lr2[1] - lpad, ly1 = lr2[3] + lpad;
          var lx0 = lr2[0] - lpad, lx1 = lr2[2] + lpad;
          if (ly0 < 0) ly0 = 0; if (lx0 < 0) lx0 = 0;
          if (ly1 >= GH) ly1 = GH - 1; if (lx1 >= GW) lx1 = GW - 1;
          for (var gy2 = ly0; gy2 <= ly1; gy2++) {
            var off2 = gy2 * GW;
            for (var gx2 = lx0; gx2 <= lx1; gx2++) grid[off2 + gx2] = 1;
          }
        }
      }
    }
    function offGrid(tile, tx, ty) {
      var b = tile.labelBox;
      if (tx < 0 || ty < 0 || tx + tile.fullW > W || ty + tile.fullH > H) return true;
      if (!b) return false;
      return tx + b.dx0 < 0 || ty + b.dy0 < 0 ||
        tx + b.dx1 > W || ty + b.dy1 > H;
    }
    var cx = W / 2, cy = H / 2;
    tiles.sort(function (a, b) { return (b.fullW * b.fullH) - (a.fullW * a.fullH); });
    var placed = [];
    var seed = 0x9E3779B9;
    function rand() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      var tx, ty;
      if (i === 0) {
        tx = cx - t.fullW / 2;
        ty = cy - t.fullH / 2;
        t.x = tx; t.y = ty;
        stamp(t, tx, ty);
        placed.push(t);
        continue;
      }
      var comX = 0, comY = 0, comW = 0;
      placed.forEach(function (p) {
        var a = p.fullW * p.fullH;
        comX += (p.x + p.fullW / 2) * a;
        comY += (p.y + p.fullH / 2) * a;
        comW += a;
      });
      comX /= comW; comY /= comW;
      var best = null, bestCost = Infinity;
      var step = Math.max(GRID_STRIDE, Math.min(t.fullW, t.fullH) * 0.05);
      var maxR = Math.max(W, H);
      var foundRing = -1;
      var phase = rand() * Math.PI * 2;
      for (var r = 0; r <= maxR; r += step) {
        if (foundRing >= 0 && r > foundRing + step * 2) break;
        var samples = Math.max(36, Math.floor(r / 1.6));
        for (var k = 0; k < samples; k++) {
          var theta = phase + (k / samples) * Math.PI * 2;
          var px = cx + r * xBias * Math.cos(theta) - t.fullW / 2;
          var py = cy + r * yBias * Math.sin(theta) - t.fullH / 2;
          if (offGrid(t, px, py)) continue;
          if (collides(t, px, py)) continue;
          var dxx = (px + t.fullW / 2 - comX);
          var dyy = (py + t.fullH / 2 - comY);
          var cost = Math.hypot(dxx / xBias, dyy / yBias) + rand() * step * 0.5;
          if (cost < bestCost) { bestCost = cost; best = { x: px, y: py }; }
        }
        if (best && foundRing < 0) foundRing = r;
      }
      if (best) {
        t.x = best.x; t.y = best.y;
        stamp(t, best.x, best.y);
        placed.push(t);
      } else {
        t.x = -99999; t.y = -99999;
        placed.push(t);
      }
    }
    return placed;
  }
