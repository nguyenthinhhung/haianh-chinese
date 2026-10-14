/* What's missing: each round takes two steps, one card vanishes, then it
 * comes back. Which cards go missing is drawn afresh each time the slide is
 * entered, so replaying the game is not predictable. */
LessonStudio.registerInteraction("whats-missing", function (slide, ctx) {
  var grid = slide.querySelector(".ls-wm-grid");
  var cards = slide.querySelectorAll(".ls-wm-card");
  if (!grid || cards.length < 2) return null;
  var rounds = Math.min(parseInt(grid.getAttribute("data-rounds"), 10) || 3, cards.length);
  var order = [];
  var shown = 0;

  function draw() {
    var pool = [];
    for (var i = 0; i < cards.length; i++) pool.push(i);
    for (var j = pool.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = pool[j];
      pool[j] = pool[k];
      pool[k] = t;
    }
    order = pool.slice(0, rounds);
  }
  draw();

  return {
    steps: rounds * 2,
    enter: draw,
    show: function (n) {
      for (var i = 0; i < cards.length; i++) cards[i].classList.remove("ls-wm-gone", "ls-wm-back");
      if (n > 0) {
        var card = cards[order[Math.ceil(n / 2) - 1]];
        card.classList.add(n % 2 ? "ls-wm-gone" : "ls-wm-back");
        if (n > shown) ctx.feedback(n % 2 ? "flip" : n === rounds * 2 ? "complete" : "correct");
      }
      shown = n;
    },
  };
});
