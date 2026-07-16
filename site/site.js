document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const code = button.parentElement.querySelector("code")?.textContent || "";
    const original = button.textContent;
    try { await navigator.clipboard.writeText(code); button.textContent = "已复制"; }
    catch { button.textContent = "复制失败"; }
    window.setTimeout(() => { button.textContent = original; }, 1600);
  });
});
