/* Hidden meanings appear one per Next, in reading order. */
LessonStudio.registerInteraction("vocabulary", function (slide) {
  var items = slide.querySelectorAll("[data-ls-reveal]");
  if (!items.length) return null;
  return {
    steps: items.length,
    show: function (n) {
      for (var i = 0; i < items.length; i++) items[i].classList.toggle("ls-revealed", i < n);
    },
  };
});
