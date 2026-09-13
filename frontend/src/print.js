export async function openPrintWindow(html, title = "print", existingWindow = null) {
  const w = existingWindow || window.open("", title, "width=500,height=800");
  if (!w) {
    alert("El navegador bloqueó la ventana emergente. Permite popups para imprimir.");
    return;
  }

  w.document.open();
  w.document.write(html);
  w.document.close();

  // A remote logo can take longer than the old fixed 250 ms delay.
  const images = Array.from(w.document.images);
  const cleanups = [];
  const pending = images.map((img) => new Promise((resolve) => {
    const finish = () => {
      if (!img.naturalWidth) img.hidden = true;
      resolve();
    };
    if (img.complete) return finish();
    img.addEventListener("load", finish);
    img.addEventListener("error", finish);
    cleanups.push(() => {
      img.removeEventListener("load", finish);
      img.removeEventListener("error", finish);
    });
  }));
  let timeout;
  await Promise.race([
    Promise.all(pending),
    new Promise((resolve) => { timeout = setTimeout(resolve, 5000); }),
  ]);
  clearTimeout(timeout);
  cleanups.forEach((cleanup) => cleanup());
  if (w.closed) return;
  images.forEach((img) => { if (!img.complete) img.hidden = true; });
  w.focus();
  w.print();
  w.close();
}
