/* Memory: the class calls two numbers and the teacher flips those cards
 * (number keys or a click). A match stays open and scores for the team whose
 * turn it is, which plays again; otherwise both flip back after a moment, or
 * at the next press, and the turn passes on. */
LessonStudio.registerInteraction("memory", function (slide, ctx) {
  var cards = Array.prototype.slice.call(slide.querySelectorAll(".ls-mm-card"));
  if (cards.length < 2) return null;
  var tools = ctx.tools;
  var up = [];
  var matched = 0;
  var flipBack = null;

  function hide() {
    if (flipBack) clearTimeout(flipBack);
    flipBack = null;
    up.forEach(function (c) {
      c.classList.remove("ls-mm-up", "ls-mm-miss");
    });
    up = [];
  }

  function flip(card) {
    if (!card || card.classList.contains("ls-mm-matched") || up.indexOf(card) >= 0) return;
    if (up.length === 2) hide();
    card.classList.add("ls-mm-up");
    up.push(card);
    if (up.length < 2) {
      ctx.feedback("flip");
      return;
    }
    if (up[0].getAttribute("data-pair") === up[1].getAttribute("data-pair")) {
      up.forEach(function (c) {
        c.classList.remove("ls-mm-up");
        c.classList.add("ls-mm-matched");
        c.disabled = true;
      });
      up = [];
      matched += 2;
      if (tools) tools.add(tools.current(), 1);
      ctx.feedback(matched === cards.length ? "complete" : "correct");
    } else {
      up.forEach(function (c) {
        c.classList.add("ls-mm-miss");
      });
      ctx.feedback("wrong");
      if (tools) tools.nextTurn();
      flipBack = setTimeout(hide, 1800);
    }
  }

  function reset() {
    hide();
    matched = 0;
    cards.forEach(function (c) {
      c.classList.remove("ls-mm-matched", "ls-mm-peek");
      c.disabled = false;
    });
  }

  cards.forEach(function (card) {
    card.addEventListener("click", function () {
      flip(card);
    });
  });

  return {
    steps: 0,
    usesScores: true,
    show: function () {},
    enter: reset,
    leave: hide,
    pick: function (n) {
      flip(cards[n - 1]);
    },
    /* Next first turns a missed pair back over; otherwise it moves on. */
    next: function () {
      if (up.length === 2) {
        hide();
        return true;
      }
      return false;
    },
    revealAll: function () {
      hide();
      cards.forEach(function (c) {
        c.classList.add("ls-mm-peek");
      });
      return true;
    },
    reset: function () {
      reset();
      return true;
    },
  };
});
