/* Flashcards: Next flips the next card still face down, so a clicker is
 * enough; the teacher can also flip any card, in any order, by clicking it
 * or typing its number. Back turns the flips back one at a time. */
LessonStudio.registerInteraction("flashcard", function (slide, ctx) {
  var cards = Array.prototype.slice.call(slide.querySelectorAll(".ls-fc-card"));
  if (!cards.length) return null;
  var flipped = []; // in the order they were turned over

  function turn(card, up) {
    var i = flipped.indexOf(card);
    if (up && i < 0) {
      flipped.push(card);
      card.classList.add("ls-revealed");
      ctx.feedback("flip");
    } else if (!up && i >= 0) {
      flipped.splice(i, 1);
      card.classList.remove("ls-revealed");
    }
  }

  function reset() {
    flipped = [];
    cards.forEach(function (c) {
      c.classList.remove("ls-revealed");
    });
  }

  cards.forEach(function (card) {
    card.addEventListener("click", function (e) {
      // The sound button is played by the deck's own click handler.
      if (e.target && e.target.closest && e.target.closest("[data-ls-play]")) return;
      e.stopPropagation();
      turn(card, flipped.indexOf(card) < 0);
    });
  });

  return {
    steps: 0,
    show: function () {},
    enter: reset,
    pick: function (n) {
      var card = cards[n - 1];
      if (card) turn(card, flipped.indexOf(card) < 0);
    },
    next: function () {
      for (var i = 0; i < cards.length; i++) {
        if (flipped.indexOf(cards[i]) < 0) {
          turn(cards[i], true);
          return true;
        }
      }
      return false;
    },
    prev: function () {
      var last = flipped[flipped.length - 1];
      if (!last) return false;
      turn(last, false);
      return true;
    },
    revealAll: function () {
      cards.forEach(function (c) {
        turn(c, true);
      });
      return true;
    },
    reset: function () {
      reset();
      return true;
    },
  };
});
