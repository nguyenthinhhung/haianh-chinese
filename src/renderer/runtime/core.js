/* Lesson Studio presentation runtime.
 * Embedded in every lesson.html and exported file, and loaded by the app for
 * Present, so it is plain ES2017 with no dependencies. Each slide is a
 * sequence of steps: Next runs the slide's next step and only moves on once
 * none are left, Back undoes one step. That lets a teacher run any activity
 * with just a presentation clicker. */
(function () {
  "use strict";

  var factories = {};
  var LS = (window.LessonStudio = window.LessonStudio || {});

  /* factory(slideEl) returns null or { steps: number, show(n) } where show(n)
   * puts the slide in the state "first n steps done". It must be idempotent so
   * Back is just show(n - 1). */
  LS.registerInteraction = function (type, factory) {
    factories[type] = factory;
  };

  var NONE = { steps: 0, show: function () {} };

  /* Feedback: tones synthesised with WebAudio, so lessons carry no sound
   * files and nothing needs licensing. Each sound is a list of notes
   * [frequency Hz, start s, length s] played with one waveform. */
  var SOUNDS = {
    reveal: { wave: "sine", gain: 0.12, notes: [[660, 0, 0.12]] },
    flip: { wave: "triangle", gain: 0.12, notes: [[420, 0, 0.06], [620, 0.05, 0.08]] },
    correct: { wave: "sine", gain: 0.2, notes: [[784, 0, 0.14], [1047, 0.12, 0.28]] },
    wrong: { wave: "square", gain: 0.06, notes: [[196, 0, 0.18], [147, 0.16, 0.3]] },
    complete: { wave: "triangle", gain: 0.18, notes: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.12], [1047, 0.3, 0.4]] },
  };
  var audioContext = null;

  function playTone(name) {
    var sound = SOUNDS[name];
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!sound || !Ctx) return;
    try {
      audioContext = audioContext || new Ctx();
      if (audioContext.state === "suspended") audioContext.resume();
      var t0 = audioContext.currentTime + 0.01;
      sound.notes.forEach(function (n) {
        var osc = audioContext.createOscillator();
        var gain = audioContext.createGain();
        osc.type = sound.wave;
        osc.frequency.value = n[0];
        gain.gain.setValueAtTime(0, t0 + n[1]);
        gain.gain.linearRampToValueAtTime(sound.gain, t0 + n[1] + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n[1] + n[2]);
        osc.connect(gain).connect(audioContext.destination);
        osc.start(t0 + n[1]);
        osc.stop(t0 + n[1] + n[2] + 0.05);
      });
    } catch (e) {
      /* No audio device: feedback is a nicety, never an error. */
    }
  }

  var CONFETTI_COLORS = ["#d64545", "#e9b949", "#2a6f97", "#3a9d5d", "#9b5de5"];

  function confetti(slide) {
    var layer = document.createElement("div");
    layer.className = "ls-confetti";
    layer.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 60; i++) {
      var piece = document.createElement("i");
      piece.style.left = Math.random() * 100 + "%";
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      piece.style.animationDelay = Math.random() * 0.4 + "s";
      piece.style.animationDuration = 1.6 + Math.random() * 1.2 + "s";
      piece.style.setProperty("--drift", (Math.random() * 2 - 1) * 20 + "cqw");
      layer.appendChild(piece);
    }
    slide.appendChild(layer);
    setTimeout(function () {
      if (layer.parentNode) layer.parentNode.removeChild(layer);
    }, 3500);
  }

  /* Plays feedback for the slide, honouring the lesson's sound and
   * animation settings. kind: reveal | flip | correct | wrong | complete. */
  LS.feedback = function (kind, slide) {
    var deck = slide && slide.closest ? slide.closest(".ls-deck") : null;
    if (!deck || deck.getAttribute("data-sound") !== "off") playTone(kind);
    if (kind === "complete" && slide && (!deck || deck.getAttribute("data-animations") !== "off")) confetti(slide);
  };

  /* Steps for slides without their own interaction: every element marked
   * data-ls-reveal appears in document order, one per step. Elements sharing
   * a data-ls-reveal value appear together. data-ls-sound picks the feedback
   * sound played as each appears. */
  function revealController(slide) {
    var items = slide.querySelectorAll("[data-ls-reveal]");
    if (!items.length) return null;
    var groups = [];
    var byKey = {};
    for (var i = 0; i < items.length; i++) {
      var key = items[i].getAttribute("data-ls-reveal") || "#" + i;
      if (!byKey[key]) {
        byKey[key] = [];
        groups.push(byKey[key]);
      }
      byKey[key].push(items[i]);
    }
    var shown = 0;
    return {
      steps: groups.length,
      show: function (n) {
        for (var g = 0; g < groups.length; g++) {
          for (var k = 0; k < groups[g].length; k++) groups[g][k].classList.toggle("ls-revealed", g < n);
        }
        if (n > shown && n <= groups.length) LS.feedback(groups[n - 1][0].getAttribute("data-ls-sound") || "reveal", slide);
        shown = n;
      },
    };
  }

  function isTyping(t) {
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }

  function defaultFullscreen() {
    var el = document.documentElement;
    var active = document.fullscreenElement || document.webkitFullscreenElement;
    if (active) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }

  /* Presents the slides of a `.ls-deck` element one at a time.
   * options: start (slide index), onChange(index), onExit() (Esc),
   * toggleFullscreen(). Returns a controller; destroy() removes every
   * listener and restores the deck. */
  LS.mount = function (deck, options) {
    options = options || {};
    var slides = Array.prototype.filter.call(deck.children, function (el) {
      return el.classList.contains("ls-slide");
    });
    if (!slides.length) return null;

    deck.classList.add("ls-presenting");

    var controllers = slides.map(function (el) {
      var factory = factories[el.getAttribute("data-slide-type")] || revealController;
      var c = null;
      try {
        c = factory(el);
      } catch (e) {
        if (window.console) console.error(e);
      }
      return c && typeof c.steps === "number" && typeof c.show === "function" ? c : NONE;
    });

    var progress = document.createElement("div");
    progress.className = "ls-progress";
    progress.setAttribute("aria-hidden", "true");
    deck.appendChild(progress);

    var index = -1;
    var step = 0;

    function stopMedia(slide) {
      var media = slide.querySelectorAll("audio");
      for (var i = 0; i < media.length; i++) {
        media[i].pause();
        media[i].currentTime = 0;
      }
    }

    function setStep(n) {
      step = n;
      controllers[index].show(n);
    }

    /* Entering a slide always starts it from the beginning. */
    function go(i) {
      i = Math.max(0, Math.min(slides.length - 1, i));
      if (index >= 0 && index !== i) stopMedia(slides[index]);
      for (var k = 0; k < slides.length; k++) {
        var current = k === i;
        slides[k].classList.toggle("ls-current", current);
        slides[k].setAttribute("aria-hidden", current ? "false" : "true");
      }
      index = i;
      setStep(0);
      progress.style.width = ((i + 1) / slides.length) * 100 + "%";
      if (options.onChange) options.onChange(i);
    }

    function next() {
      if (step < controllers[index].steps) setStep(step + 1);
      else if (index < slides.length - 1) go(index + 1);
    }

    function prev() {
      if (step > 0) setStep(step - 1);
      else if (index > 0) go(index - 1);
    }

    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      var handled = true;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
        case "Enter":
          next();
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
        case "Backspace":
          prev();
          break;
        case "Home":
          go(0);
          break;
        case "End":
          go(slides.length - 1);
          break;
        case "a":
        case "A":
          setStep(controllers[index].steps);
          break;
        case "r":
        case "R":
          setStep(0);
          break;
        case "f":
        case "F":
          (options.toggleFullscreen || defaultFullscreen)();
          break;
        case "Escape":
          if (options.onExit) options.onExit();
          else handled = false;
          break;
        default:
          handled = false;
      }
      if (handled) e.preventDefault();
    }

    function onClick(e) {
      var target = e.target;
      var play = target && target.closest ? target.closest("[data-ls-play]") : null;
      if (play) {
        var audio = document.getElementById(play.getAttribute("data-ls-play"));
        if (audio) {
          audio.currentTime = 0;
          var p = audio.play();
          if (p && p.catch) p.catch(function () {});
        }
        return;
      }
      if (target && target.closest && target.closest("a, button, input, select, textarea")) return;
      next();
    }

    document.addEventListener("keydown", onKey);
    deck.addEventListener("click", onClick);
    go(options.start || 0);

    return {
      next: next,
      prev: prev,
      go: go,
      revealAll: function () {
        setStep(controllers[index].steps);
      },
      reset: function () {
        setStep(0);
      },
      destroy: function () {
        document.removeEventListener("keydown", onKey);
        deck.removeEventListener("click", onClick);
        stopMedia(slides[index]);
        if (progress.parentNode) progress.parentNode.removeChild(progress);
        deck.classList.remove("ls-presenting");
      },
    };
  };

  /* A lesson file opened in a browser presents itself. */
  function start() {
    var deck = document.querySelector("body > .ls-deck");
    if (!deck) return;
    document.documentElement.classList.add("ls-present");
    var initial = parseInt((location.hash || "").slice(1), 10);
    var controller = LS.mount(deck, {
      start: isNaN(initial) ? 0 : initial - 1,
      onChange: function (i) {
        if (window.history && history.replaceState) history.replaceState(null, "", "#" + (i + 1));
      },
    });
    if (!controller) {
      document.documentElement.classList.remove("ls-present");
      return;
    }
    LS.next = controller.next;
    LS.prev = controller.prev;
    LS.go = controller.go;
    LS.revealAll = controller.revealAll;
    LS.reset = controller.reset;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else setTimeout(start, 0);
})();
