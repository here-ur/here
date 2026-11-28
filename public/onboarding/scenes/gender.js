/* 성별: 기존 주황 테마에 세로 선택 카드. 선택은 즉시 반영하고 다음 버튼으로 저장한다. */
(() => {
  "use strict";
  const HP = window.HerePhone;
  if (!HP) return;
  const ui = HP.ui;

  HP.addScene({
    id: "gender", field: "orange", states: ["idle", "chosen"],
    build(ctx) {
      const { el: root, copy: C } = ctx, A = C.about;
      const before = A.genders.indexOf(ctx.data.answers.gender);
      const initial = ctx.state === "chosen" ? Math.max(0, before) : ctx.state == null ? before : -1;
      let choice = initial;

      root.append(ui.topbar(ctx));
      const title = ui.badgedHeadline(ui.lines(A.gender, [1, 2]), { token: "성별" });
      const { el: cat } = ui.titleCat();
      const titleRow = ui.el("div", "hp-gd-title", title, cat);

      const list = ui.choiceList(ctx, { labels: A.genders, label: A.gender, value: initial, onPick: pick });
      const cta = ui.cta({ label: A.next, disabled: choice < 0, pages: ctx, onPress: () => { if (choice >= 0) ctx.next(cta); } });
      root.append(ui.block("hp-gd-content", { top: 88 }, titleRow, list.el), cta);

      function render() {
        root.dataset.state = choice < 0 ? "idle" : "chosen";
        cta.disabled = choice < 0;
      }
      function pick(i) {
        choice = i;
        ctx.set({ answers: { gender: A.genders[i] } });
        render();
      }
      if (initial >= 0) pick(initial);
      else render();
    },
  });
})();
