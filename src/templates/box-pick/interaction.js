/* Secret boxes, played in teams. Opening a box (number key or click) shows
 * its question; Next shows the reward and applies it to the team whose turn
 * it is, then the turn passes on; Next again closes the box. */
LessonStudio.registerInteraction("box-pick", function (slide, ctx) {
  var boxes = Array.prototype.slice.call(slide.querySelectorAll(".ls-bp-box"));
  var panel = slide.querySelector(".ls-bp-panel");
  if (!boxes.length || !panel) return null;
  var teamLabel = panel.querySelector(".ls-bp-panel-team");
  var body = panel.querySelector(".ls-bp-panel-body");
  var rewardLabel = panel.querySelector(".ls-bp-panel-reward");
  var tools = ctx.tools;
  var active = null;
  var phase = "";

  function teamName() {
    return "Lượt của Đội " + ((tools ? tools.current() : 0) + 1);
  }

  function close() {
    if (active) {
      active.classList.add("ls-bp-opened");
      active.disabled = true;
    }
    active = null;
    phase = "";
    panel.hidden = true;
    var left = boxes.filter(function (b) {
      return !b.disabled;
    });
    if (!left.length) ctx.feedback("complete");
  }

  function open(box) {
    if (!box || box.disabled) return;
    if (active) close();
    active = box;
    phase = "question";
    teamLabel.textContent = teamName();
    var copy = box.querySelector(".ls-bp-content").cloneNode(true);
    while (body.firstChild) body.removeChild(body.firstChild);
    while (copy.firstChild) body.appendChild(copy.firstChild);
    rewardLabel.textContent = "";
    panel.className = "ls-bp-panel";
    panel.hidden = false;
    ctx.feedback("flip");
  }

  function applyReward() {
    var reward = active.getAttribute("data-reward");
    rewardLabel.textContent = active.querySelector(".ls-bp-reward").textContent;
    panel.className = "ls-bp-panel ls-bp-panel--" + (reward === "bomb" ? "bomb" : reward === "swap" ? "swap" : "points");
    phase = "reward";
    if (!tools) {
      ctx.feedback(reward === "bomb" ? "wrong" : "correct");
      return;
    }
    var team = tools.current();
    var scores = tools.scores();
    if (reward === "bomb") {
      tools.set(team, 0);
      ctx.feedback("wrong");
    } else if (reward === "swap") {
      var leader = -1;
      for (var i = 0; i < scores.length; i++) {
        if (i !== team && (leader < 0 || scores[i] > scores[leader])) leader = i;
      }
      if (leader >= 0) {
        tools.set(team, scores[leader]);
        tools.set(leader, scores[team]);
      }
      ctx.feedback("flip");
    } else {
      tools.add(team, Number(reward) || 1);
      ctx.feedback("correct");
    }
    tools.nextTurn();
  }

  boxes.forEach(function (box) {
    box.addEventListener("click", function () {
      if (active === box && phase === "question") applyReward();
      else open(box);
    });
  });
  panel.addEventListener("click", function (e) {
    e.stopPropagation();
    if (phase === "question") applyReward();
    else close();
  });

  function reset() {
    boxes.forEach(function (b) {
      b.disabled = false;
      b.classList.remove("ls-bp-opened", "ls-bp-peek");
    });
    active = null;
    phase = "";
    panel.hidden = true;
  }

  return {
    steps: 0,
    usesScores: true,
    show: function () {},
    enter: reset,
    pick: function (n) {
      open(boxes[n - 1]);
    },
    next: function () {
      if (phase === "question") applyReward();
      else if (phase === "reward") close();
      else return false;
      return true;
    },
    prev: function () {
      if (!active) return false;
      if (phase === "question") {
        active = null;
        phase = "";
        panel.hidden = true;
      } else close();
      return true;
    },
    revealAll: function () {
      boxes.forEach(function (b) {
        b.classList.add("ls-bp-peek");
      });
      return true;
    },
    reset: function () {
      reset();
      return true;
    },
  };
});
