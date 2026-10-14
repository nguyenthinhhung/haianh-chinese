/* Guess the picture. flash, zoom and blur are a fixed run of steps ending
 * with the answer. tiles is open-ended: the teacher opens the tiles the
 * class calls out (number keys or a click), or Next opens a random one; once
 * every tile is open, Next shows the answer. */
LessonStudio.registerInteraction("guess-picture", function (slide, ctx) {
  var root = slide.querySelector(".ls-gp");
  if (!root) return null;
  var mode = root.getAttribute("data-mode");
  var img = root.querySelector(".ls-gp-image");
  var answer = root.querySelector(".ls-gp-answer");

  function showAnswer(on) {
    root.classList.toggle("ls-gp-solved", on);
    if (answer) answer.classList.toggle("ls-revealed", on);
  }

  if (mode === "tiles") {
    var tiles = Array.prototype.slice.call(root.querySelectorAll(".ls-gp-tile"));
    var opened = [];
    var solved = false;

    function open(tile) {
      if (!tile || opened.indexOf(tile) >= 0) return;
      tile.classList.add("ls-gp-open");
      opened.push(tile);
      ctx.feedback("reveal");
    }
    function reset() {
      tiles.forEach(function (t) {
        t.classList.remove("ls-gp-open");
      });
      opened = [];
      solved = false;
      showAnswer(false);
    }
    tiles.forEach(function (t) {
      t.addEventListener("click", function () {
        open(t);
      });
    });
    return {
      steps: 0,
      show: function () {},
      enter: reset,
      reset: function () {
        reset();
        return true;
      },
      pick: function (n) {
        open(tiles[n - 1]);
      },
      next: function () {
        var closed = tiles.filter(function (t) {
          return opened.indexOf(t) < 0;
        });
        if (closed.length) {
          open(closed[Math.floor(Math.random() * closed.length)]);
          return true;
        }
        if (!solved) {
          solved = true;
          showAnswer(true);
          ctx.feedback("complete");
          return true;
        }
        return false;
      },
      prev: function () {
        if (solved) {
          solved = false;
          showAnswer(false);
          return true;
        }
        var last = opened.pop();
        if (!last) return false;
        last.classList.remove("ls-gp-open");
        return true;
      },
      revealAll: function () {
        tiles.forEach(open);
        solved = true;
        showAnswer(true);
        return true;
      },
    };
  }

  /* Look of the picture at each step; the step after the last is the answer. */
  var ZOOM = [6, 4, 2.6, 1.6];
  var BLUR = [0.045, 0.028, 0.014, 0.006];
  var FLASHES = 3;
  var steps = mode === "flash" ? FLASHES + 1 : ZOOM.length;
  var shown = 0;
  var flashTimer = null;

  function look(n) {
    if (!img) return;
    if (mode === "zoom") img.style.transform = n < ZOOM.length ? "scale(" + ZOOM[n] + ")" : "";
    if (mode === "blur") img.style.filter = n < BLUR.length ? "blur(" + Math.round(BLUR[n] * slide.clientWidth) + "px)" : "";
  }

  return {
    steps: steps,
    show: function (n) {
      if (flashTimer) clearTimeout(flashTimer);
      root.classList.remove("ls-gp-flashing");
      look(n);
      var done = n >= steps;
      showAnswer(done);
      if (n > shown) {
        if (done) ctx.feedback("complete");
        else if (mode === "flash") {
          root.classList.add("ls-gp-flashing");
          ctx.feedback("flip");
          flashTimer = setTimeout(function () {
            root.classList.remove("ls-gp-flashing");
          }, 600);
        } else ctx.feedback("reveal");
      }
      shown = n;
    },
    leave: function () {
      if (flashTimer) clearTimeout(flashTimer);
    },
  };
});
