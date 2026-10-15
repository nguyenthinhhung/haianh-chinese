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
  LS.createTools = function (deck, feedback) {
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
          case "h":
          case "H":
          case "?":
            help.hidden = !help.hidden;
            return true;
          case "Escape":
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
        if (rolling) clearInterval(rolling);
        if (layer.parentNode) layer.parentNode.removeChild(layer);
      },
    };
    drawBoard();
    return api;
  };
})();
