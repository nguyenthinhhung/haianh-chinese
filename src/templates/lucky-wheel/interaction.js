/* Lucky wheel: step n spins to the n-th pick, in an order drawn when the
 * slide is entered, never landing on the same segment twice. Back and A/R
 * jump straight to the right position without spinning. */
LessonStudio.registerInteraction("lucky-wheel", function (slide, ctx) {
  var rotor = slide.querySelector(".ls-lw-rotor");
  var segs = Array.prototype.slice.call(slide.querySelectorAll(".ls-lw-seg"));
  var result = slide.querySelector(".ls-lw-result");
  if (!rotor || segs.length < 2) return null;
  var n = segs.length;
  var SPIN_MS = 4200;
  var order = [];
  var angle = 0;
  var shown = 0;
  var spinning = false;
  var timer = null;

  function draw() {
    order = segs.map(function (_, i) {
      return i;
    });
    for (var j = n - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = order[j];
      order[j] = order[k];
      order[k] = t;
    }
  }
  draw();

  /* Rotation that brings the middle of segment i under the pointer. */
  function landing(i) {
    return (360 - (i + 0.5) * (360 / n)) % 360;
  }
  function turn(rotation, ms) {
    rotor.style.transition = ms ? "transform " + ms + "ms cubic-bezier(0.15, 0.75, 0.1, 1)" : "none";
    rotor.style.transform = "rotate(" + rotation + "deg)";
    angle = rotation;
  }
  function mark(count) {
    segs.forEach(function (s) {
      s.classList.remove("ls-lw-picked", "ls-lw-hit");
    });
    for (var k = 0; k < count; k++) segs[order[k]].classList.add(k === count - 1 ? "ls-lw-hit" : "ls-lw-picked");
    var hit = count > 0 ? segs[order[count - 1]].querySelector("text") : null;
    result.textContent = hit ? hit.textContent : "";
    result.setAttribute("lang", hit ? hit.getAttribute("lang") : "vi");
  }
  function animationsOff() {
    var deck = slide.closest(".ls-deck");
    return deck && deck.getAttribute("data-animations") === "off";
  }

  return {
    steps: n,
    enter: draw,
    show: function (step) {
      if (timer) clearTimeout(timer);
      spinning = false;
      if (step === shown + 1 && step > 0 && !animationsOff()) {
        mark(step - 1);
        var target = order[step - 1];
        var base = angle - (((angle % 360) + 360) % 360);
        turn(base + 360 * 5 + landing(target), SPIN_MS);
        spinning = true;
        timer = setTimeout(function () {
          spinning = false;
          mark(step);
          ctx.feedback(step === n ? "complete" : "correct");
        }, SPIN_MS);
      } else {
        turn(step > 0 ? landing(order[step - 1]) : 0, 0);
        mark(step);
        if (step > shown) ctx.feedback("correct");
      }
      shown = step;
    },
    /* A spin in progress swallows further presses instead of skipping ahead. */
    next: function () {
      return spinning;
    },
    leave: function () {
      if (timer) clearTimeout(timer);
      spinning = false;
    },
  };
});
