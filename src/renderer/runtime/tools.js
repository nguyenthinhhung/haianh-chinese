/* Classroom tools shown over any presented slide: team scoreboard, countdown
 * timer and random student picker. They live only for the presentation and
 * are never saved into the lesson. Plain ES2017, like the rest of the runtime. */
(function () {
  "use strict";

  var LS = (window.LessonStudio = window.LessonStudio || {});
  var MAX_TEAMS = 4;
  var TIMER_PRESETS = [15, 30, 60, 90, 120];
  var CLASS_SIZE_KEY = "ls-class-size";

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function readClassSize() {
    try {
      var n = parseInt(localStorage.getItem(CLASS_SIZE_KEY), 10);
      return n > 0 && n <= 99 ? n : 30;
    } catch (e) {
      return 30;
    }
  }

  function saveClassSize(n) {
    try {
      localStorage.setItem(CLASS_SIZE_KEY, String(n));
    } catch (e) {
      /* Private mode: the size is kept for this session only. */
    }
  }

  function clock(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  /* Builds the tool layer inside a presented deck. feedback(kind) plays a
   * runtime sound. Returns the tools API used by the runtime and games. */
  LS.createTools = function (deck, feedback, hooks) {
    var layer = el("div", "ls-tools");
    layer.setAttribute("aria-live", "polite");
    deck.appendChild(layer);

    /* ---- Scoreboard ---- */
    var scores = [0, 0];
    var current = 0;
    var board = el("div", "ls-score");
    board.hidden = true;
    layer.appendChild(board);

    function drawBoard() {
      board.innerHTML = "";
      scores.forEach(function (score, i) {
        var team = el("div", "ls-score-team" + (i === current ? " ls-score-current" : ""));
        team.setAttribute("data-team", String(i + 1));
        var name = el("button", "ls-score-name", "Đội " + (i + 1));
        name.type = "button";
        name.title = "Chọn lượt của đội này";
        name.addEventListener("click", function () {
          current = i;
          drawBoard();
        });
        var minus = el("button", "ls-score-step", "−");
        minus.type = "button";
        minus.setAttribute("aria-label", "Trừ 1 điểm đội " + (i + 1));
        minus.addEventListener("click", function () {
          api.add(i, -1);
        });
        var value = el("span", "ls-score-value", String(score));
        var plus = el("button", "ls-score-step", "+");
        plus.type = "button";
        plus.setAttribute("aria-label", "Cộng 1 điểm đội " + (i + 1));
        plus.addEventListener("click", function () {
          api.add(i, 1);
        });
        team.appendChild(name);
        team.appendChild(minus);
        team.appendChild(value);
        team.appendChild(plus);
        board.appendChild(team);
      });
      var tools = el("div", "ls-score-tools");
      var more = el("button", "ls-score-step", "+ đội");
      more.type = "button";
      more.disabled = scores.length >= MAX_TEAMS;
      more.addEventListener("click", function () {
        if (scores.length < MAX_TEAMS) scores.push(0);
        drawBoard();
      });
      var reset = el("button", "ls-score-step", "Về 0");
      reset.type = "button";
      reset.addEventListener("click", function () {
        for (var k = 0; k < scores.length; k++) scores[k] = 0;
        drawBoard();
      });
      tools.appendChild(more);
      tools.appendChild(reset);
      board.appendChild(tools);
    }

    /* ---- Countdown timer ---- */
    var timer = el("button", "ls-timer");
    timer.type = "button";
    timer.hidden = true;
    timer.title = "Bấm để đổi thời gian (khi đang dừng)";
    layer.appendChild(timer);
    var preset = 1;
    var remaining = TIMER_PRESETS[preset];
    var ticking = null;

    function drawTimer() {
      timer.textContent = clock(remaining);
      timer.classList.toggle("ls-timer-running", !!ticking);
      timer.classList.toggle("ls-timer-done", remaining === 0);
    }
    function stopTimer() {
      if (ticking) clearInterval(ticking);
      ticking = null;
      drawTimer();
    }
    function startTimer() {
      if (remaining === 0) remaining = TIMER_PRESETS[preset];
      stopTimer();
      ticking = setInterval(function () {
        remaining = Math.max(0, remaining - 1);
        if (remaining === 0) {
          stopTimer();
          feedback("wrong");
        }
        drawTimer();
      }, 1000);
      drawTimer();
    }
    timer.addEventListener("click", function (e) {
      e.stopPropagation();
      if (ticking) return;
      preset = (preset + 1) % TIMER_PRESETS.length;
      remaining = TIMER_PRESETS[preset];
      drawTimer();
    });

    /* ---- Random student number ---- */
    var picker = el("div", "ls-picker");
    picker.hidden = true;
    var pickedNumber = el("div", "ls-picker-number", "?");
    var sizeLabel = el("label", "ls-picker-size", "Sĩ số ");
    var sizeInput = el("input");
    sizeInput.type = "number";
    sizeInput.min = "2";
    sizeInput.max = "99";
    sizeInput.value = String(readClassSize());
    sizeInput.addEventListener("change", function () {
      var n = Math.max(2, Math.min(99, parseInt(sizeInput.value, 10) || 30));
      sizeInput.value = String(n);
      saveClassSize(n);
    });
    sizeLabel.appendChild(sizeInput);
    picker.appendChild(el("div", "ls-picker-title", "Gọi bạn số"));
    picker.appendChild(pickedNumber);
    picker.appendChild(sizeLabel);
    picker.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    layer.appendChild(picker);
    var rolling = null;

    function roll() {
      picker.hidden = false;
      var size = parseInt(sizeInput.value, 10) || 30;
      var spins = 0;
      if (rolling) clearInterval(rolling);
      rolling = setInterval(function () {
        pickedNumber.textContent = String(1 + Math.floor(Math.random() * size));
        if (++spins >= 14) {
          clearInterval(rolling);
          rolling = null;
          feedback("correct");
        }
      }, 70);
    }

    /* ---- Pen: write on the slide, as with PowerPoint's pen. The ink belongs
     * to the slide on screen and is wiped when the slide changes. Strokes are
     * kept in slide coordinates (0–1 across and down the slide), so the same
     * ink can be drawn on a projector and on the presenter's copy alike;
     * hooks.onInk hears every change for that copy. ---- */
    var INK_COLORS = ["#e11d48", "#2563eb", "#16a34a", "#111827"];
    var ink = el("canvas", "ls-ink");
    layer.insertBefore(ink, layer.firstChild);
    var inkCtx = ink.getContext ? ink.getContext("2d") : null;
    var penOn = false;
    var penColor = INK_COLORS[0];
    var strokes = [];
    var drawing = null;

    function emitInk(event) {
      if (hooks && hooks.onInk) {
        try {
          hooks.onInk(event);
        } catch (e) {
          if (window.console) console.error(e);
        }
      }
    }

    var penBar = el("div", "ls-pen");
    penBar.hidden = true;
    var swatches = INK_COLORS.map(function (color) {
      var b = el("button", "ls-pen-color");
      b.type = "button";
      b.style.background = color;
      b.setAttribute("aria-label", "Màu bút");
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        setPenColor(color);
      });
      penBar.appendChild(b);
      return b;
    });
    var eraseButton = el("button", "ls-pen-action", "Xoá nét (E)");
    eraseButton.type = "button";
    eraseButton.addEventListener("click", function (e) {
      e.stopPropagation();
      clearInk();
    });
    var offButton = el("button", "ls-pen-action", "Tắt bút (P)");
    offButton.type = "button";
    offButton.addEventListener("click", function (e) {
      e.stopPropagation();
      setPen(false);
    });
    penBar.appendChild(eraseButton);
    penBar.appendChild(offButton);
    layer.appendChild(penBar);

    function markColor() {
      swatches.forEach(function (b, i) {
        b.classList.toggle("ls-pen-color-on", INK_COLORS[i] === penColor);
      });
    }
    markColor();

    /* The slide on screen, which ink coordinates are relative to. */
    function slideBox() {
      var slide = deck.querySelector(".ls-slide.ls-current");
      var r = (slide || layer).getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width || 1, height: r.height || 1 };
    }
    function toSlide(e) {
      var b = slideBox();
      return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height];
    }
    function sizeInk() {
      var r = layer.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      ink.width = Math.max(1, Math.round(r.width * dpr));
      ink.height = Math.max(1, Math.round(r.height * dpr));
      if (inkCtx) inkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    }
    /* Draws points [x0, y0, x1, y1, …] of a stroke, from index `from` on. */
    function paint(stroke, from) {
      if (!inkCtx || stroke.points.length < 4) return;
      var b = slideBox();
      var origin = ink.getBoundingClientRect();
      var ox = b.left - origin.left;
      var oy = b.top - origin.top;
      var p = stroke.points;
      var start = Math.max(0, (from || 0) - 2);
      inkCtx.strokeStyle = stroke.color;
      inkCtx.lineWidth = Math.max(3, b.width / 320);
      inkCtx.lineCap = "round";
      inkCtx.lineJoin = "round";
      inkCtx.beginPath();
      inkCtx.moveTo(ox + p[start] * b.width, oy + p[start + 1] * b.height);
      for (var i = start + 2; i < p.length; i += 2) inkCtx.lineTo(ox + p[i] * b.width, oy + p[i + 1] * b.height);
      inkCtx.stroke();
    }
    function wipe() {
      if (!inkCtx) return;
      inkCtx.save();
      inkCtx.setTransform(1, 0, 0, 1, 0, 0);
      inkCtx.clearRect(0, 0, ink.width, ink.height);
      inkCtx.restore();
    }
    function redraw() {
      wipe();
      strokes.forEach(function (s) {
        paint(s, 0);
      });
    }
    function clearInk(silent) {
      strokes = [];
      drawing = null;
      wipe();
      if (!silent) emitInk({ type: "clear" });
    }
    function setPen(on) {
      penOn = on;
      penBar.hidden = !on;
      ink.classList.toggle("ls-ink-on", on);
      if (on && ink.width <= 1) sizeInk();
      emitInk({ type: "pen", on: penOn, color: penColor });
    }
    function setPenColor(color) {
      if (INK_COLORS.indexOf(color) < 0) return;
      penColor = color;
      markColor();
      emitInk({ type: "pen", on: penOn, color: penColor });
    }
    /* A stroke drawn somewhere else (the presenter's copy of this slide). */
    function addStroke(stroke) {
      if (!stroke || INK_COLORS.indexOf(stroke.color) < 0 || !Array.isArray(stroke.points)) return;
      var points = stroke.points.slice(0, 4000).filter(function (n) {
        return typeof n === "number" && n > -0.5 && n < 1.5;
      });
      if (points.length < 4 || points.length % 2) return;
      var s = { color: stroke.color, points: points };
      strokes.push(s);
      paint(s, 0);
    }

    ink.addEventListener("pointerdown", function (e) {
      if (!penOn) return;
      e.preventDefault();
      try {
        ink.setPointerCapture(e.pointerId);
      } catch (err) {
        /* No capture (e.g. a pointer already gone): the stroke still draws. */
      }
      drawing = { color: penColor, points: toSlide(e) };
      strokes.push(drawing);
    });
    ink.addEventListener("pointermove", function (e) {
      if (!drawing) return;
      var p = toSlide(e);
      drawing.points.push(p[0], p[1]);
      paint(drawing, drawing.points.length - 2);
    });
    function endStroke() {
      if (drawing && drawing.points.length >= 4) emitInk({ type: "stroke", stroke: drawing });
      drawing = null;
    }
    ink.addEventListener("pointerup", endStroke);
    ink.addEventListener("pointercancel", endStroke);
    ink.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    window.addEventListener("resize", sizeInk);
    sizeInk();

    /* ---- Shortcut help ---- */
    var help = el("div", "ls-help");
    help.hidden = true;
    var rows = [
      ["→ / Space / Enter", "Tiếp"],
      ["← / Backspace", "Lùi"],
      ["A", "Hiện hết đáp án"],
      ["R", "Làm lại slide"],
      ["1 – 4", "Cộng điểm đội (Shift: trừ)"],
      ["S", "Hiện / ẩn bảng điểm"],
      ["T", "Đồng hồ: chạy / dừng (Shift+T: tắt)"],
      ["N", "Gọi số ngẫu nhiên (Shift+N: tắt)"],
      ["B / W", "Màn hình đen / trắng (phím bất kỳ để quay lại)"],
      ["P", "Bút viết lên slide (E: xoá nét)"],
      ["F", "Toàn màn hình"],
      ["H", "Bảng phím tắt này"],
    ];
    help.appendChild(el("div", "ls-help-title", "Phím tắt"));
    rows.forEach(function (r) {
      var row = el("div", "ls-help-row");
      row.appendChild(el("kbd", null, r[0]));
      row.appendChild(el("span", null, r[1]));
      help.appendChild(row);
    });
    layer.appendChild(help);

    var api = {
      /* Adds points to team i (0-based), creating teams up to it. */
      add: function (i, delta) {
        if (i < 0 || i >= MAX_TEAMS) return;
        while (scores.length <= i) scores.push(0);
        scores[i] += delta;
        board.hidden = false;
        drawBoard();
        var node = board.querySelector('[data-team="' + (i + 1) + '"]');
        if (node) {
          node.classList.remove("ls-score-bump");
          void node.offsetWidth;
          node.classList.add("ls-score-bump");
        }
      },
      set: function (i, value) {
        api.add(i, value - (scores[i] || 0));
      },
      scores: function () {
        return scores.slice();
      },
      current: function () {
        return current;
      },
      /* Gives the turn to the next team. */
      nextTurn: function () {
        current = (current + 1) % scores.length;
        drawBoard();
      },
      /* Turns the pen on or off; with no argument, toggles it. */
      pen: function (on) {
        setPen(on === undefined ? !penOn : !!on);
      },
      penOn: function () {
        return penOn;
      },
      setPenColor: setPenColor,
      addStroke: addStroke,
      clearInk: function () {
        clearInk();
      },
      /* The slide changed: its ink goes with it (the presenter's copy follows the slide itself). */
      onSlide: function () {
        clearInk(true);
      },
      showScores: function () {
        board.hidden = false;
        drawBoard();
      },
      /* Handles a tool shortcut; true when the key was used. */
      onKey: function (e, digitsTaken) {
        var code = e.code || "";
        var digit = /^(Digit|Numpad)([1-4])$/.exec(code);
        if (digit && !digitsTaken) {
          api.add(Number(digit[2]) - 1, e.shiftKey ? -1 : 1);
          return true;
        }
        switch (e.key) {
          case "s":
          case "S":
            board.hidden = !board.hidden;
            if (!board.hidden) drawBoard();
            return true;
          case "t":
          case "T":
            if (e.shiftKey) {
              stopTimer();
              remaining = TIMER_PRESETS[preset];
              timer.hidden = true;
            } else {
              timer.hidden = false;
              if (ticking) stopTimer();
              else startTimer();
            }
            return true;
          case "n":
          case "N":
            if (e.shiftKey) picker.hidden = true;
            else roll();
            return true;
          case "p":
          case "P":
            setPen(!penOn);
            return true;
          case "e":
          case "E":
            clearInk();
            return true;
          case "h":
          case "H":
          case "?":
            help.hidden = !help.hidden;
            return true;
          case "Escape":
            if (penOn) {
              setPen(false);
              return true;
            }
            if (!help.hidden || !picker.hidden) {
              help.hidden = true;
              picker.hidden = true;
              return true;
            }
            return false;
        }
        return false;
      },
      destroy: function () {
        stopTimer();
        window.removeEventListener("resize", sizeInk);
        if (rolling) clearInterval(rolling);
        if (layer.parentNode) layer.parentNode.removeChild(layer);
      },
    };
    drawBoard();
    return api;
  };
})();
